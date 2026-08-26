const cron = require('node-cron');
const pool = require('../config/database');

// Serving session windows (24h)
const SESSIONS = {
  breakfast: { start: 6, end: 10 },  // 06:00 - 10:00
  lunch:     { start: 12, end: 15 }, // 12:00 - 15:00
  supper:    { start: 18, end: 21 }, // 18:00 - 21:00
};

// Order in which sessions occur; a missed session's meals carry over to the next one.
const SESSION_ORDER = ['breakfast', 'lunch', 'supper'];

const generateCode = () =>
  String(Math.floor(100000 + Math.random() * 900000));

// Which serving session does this timestamp fall into?
const getSessionForDate = (date = new Date()) => {
  const h = date.getHours();
  for (const [name, w] of Object.entries(SESSIONS)) {
    if (h >= w.start && h < w.end) return name;
  }
  return null;
};

// End-of-session sweeper: any order placed during the session that was never
// served becomes a carryover, redeemable during the NEXT session the same day.
// A missed lunch therefore becomes a supper entitlement for the same meals.
const sweepMissedMeals = async (sessionName, now = new Date()) => {
  const window = SESSIONS[sessionName];
  const dayStart = new Date(now);
  dayStart.setHours(window.start, 0, 0, 0);
  const dayEnd = new Date(now);
  dayEnd.setHours(window.end, 0, 0, 0);

  const idx = SESSION_ORDER.indexOf(sessionName);
  const nextSession = idx >= 0 && idx < SESSION_ORDER.length - 1 ? SESSION_ORDER[idx + 1] : null;
  if (!nextSession) return { carriedOver: 0 }; // nothing after supper

  const nextWindow = SESSIONS[nextSession];
  const expiresAt = new Date(now);
  expiresAt.setHours(nextWindow.end, 15, 0, 0); // grace: 15 min past next session close

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const missed = await client.query(
      `SELECT o.id, o.user_id, o.guest_name, o.phone_number, o.total_amount,
              json_agg(json_build_object('meal_id', oi.meal_id, 'quantity', oi.quantity, 'name', oi.meal_name)) AS items
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.created_at >= $1 AND o.created_at < $2
         AND o.status IN ('paid', 'preparing', 'ready')
       GROUP BY o.id
       FOR UPDATE OF o`,
      [dayStart, dayEnd]
    );

    let count = 0;
    for (const order of missed.rows) {
      // Guard against double-sweeping (e.g. server restarts mid-window)
      const existing = await client.query('SELECT 1 FROM meal_carryovers WHERE order_id = $1 LIMIT 1', [order.id]);
      if (existing.rows.length > 0) continue;

      await client.query(
        `INSERT INTO meal_carryovers (order_id, user_id, guest_name, phone_number, code, items, total_amount, original_session, status, created_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, 'pending', NOW(), $9)`,
        [order.id, order.user_id, order.guest_name, order.phone_number, generateCode(),
         JSON.stringify(order.items || []), order.total_amount, sessionName, expiresAt]
      );
      await client.query("UPDATE orders SET status = 'expired' WHERE id = $1", [order.id]);
      count += 1;
    }
    await client.query('COMMIT');
    if (count > 0) console.log(`🔄 Carryover sweep (${sessionName}): ${count} uncollected order(s) moved to ${nextSession}`);
    return { carriedOver: count };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('sweepMissedMeals error:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Expire carryovers that were never redeemed before their cutoff.
const expireStaleCarryovers = async () => {
  try {
    const result = await pool.query(
      "UPDATE meal_carryovers SET status = 'expired' WHERE status = 'pending' AND expires_at < NOW() RETURNING id"
    );
    if (result.rows.length > 0) {
      console.log(`⏰ Expired ${result.rows.length} unredeemed carryover(s)`);
    }
    return result.rows.length;
  } catch (error) {
    console.error('expireStaleCarryovers error:', error);
    return 0;
  }
};

// Cron schedule strings per session (fires 5 minutes after each window closes)
const SWEEP_SCHEDULES = {
  breakfast: '5 10 * * *',
  lunch:     '5 15 * * *',
  // No sweep after supper - the expiry job handles leftovers.
};

const startScheduler = () => {
  for (const [session, schedule] of Object.entries(SWEEP_SCHEDULES)) {
    cron.schedule(schedule, () => sweepMissedMeals(session).catch(() => {}));
  }
  // Every 5 minutes: expire stale carryovers + clean used reset tokens
  cron.schedule('*/5 * * * *', async () => {
    await expireStaleCarryovers();
    pool.query("DELETE FROM password_resets WHERE expires_at < NOW() OR used = true").catch(() => {});
  });
  console.log('⏱️ Scheduler running: session sweeps + carryover expiry every 5 min');
};

module.exports = {
  SESSIONS,
  SESSION_ORDER,
  getSessionForDate,
  generateCode,
  sweepMissedMeals,
  expireStaleCarryovers,
  startScheduler,
};
