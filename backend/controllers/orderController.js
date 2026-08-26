const pool = require('../config/database');
const https = require('https');
const { orderEvents } = require('../utils/events');
const { logAudit } = require('../utils/auditLogger');

// ==========================================
// PayHero payment gateway (https://payhero.co.ke)
// Auth: Basic (username:password) generated in the PayHero dashboard.
// Dev mode: references starting with "mock_" skip verification when
// PayHero credentials are not configured, so local dev stays frictionless.
// ==========================================

const PAYHERO_BASE_URL = process.env.PAYHERO_BASE_URL || 'https://backend.payhero.co.ke/api/v2';

const payheroConfigured = () =>
  Boolean(process.env.PAYHERO_USERNAME && process.env.PAYHERO_PASSWORD);

const payheroAuthHeader = () =>
  'Basic ' + Buffer.from(`${process.env.PAYHERO_USERNAME}:${process.env.PAYHERO_PASSWORD}`).toString('base64');

// Normalize Kenyan phone numbers to 2547XXXXXXXX / 2541XXXXXXXX format
const normalizeKenyanPhone = (phone) => {
  if (!phone) return '';
  let p = String(phone).replace(/\D/g, '');
  if (p.startsWith('0')) p = `254${p.slice(1)}`;
  else if (p.startsWith('7') || p.startsWith('1')) p = `254${p}`;
  return p;
};

const httpRequest = ({ hostname, path, method, headers, body }) =>
  new Promise((resolve, reject) => {
    const req = https.request({ hostname, port: 443, path, method, headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve({ raw: data }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('Payment gateway timeout')));
    if (body) req.write(body);
    req.end();
  });

// POST /api/orders - Place a new order (payment must already be verified)
const placeOrder = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const {
      items,
      guest_name,
      phone_number,
      payment_reference,
      paystack_reference // legacy field name kept for backwards compatibility
    } = req.body;

    const reference = payment_reference || paystack_reference;
    const user_id = req.user?.id || null;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'No items in order' });
    }
    if (!phone_number) {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }
    if (!reference) {
      return res.status(400).json({ success: false, message: 'Payment reference required' });
    }

    // Verify payment with PayHero (mock refs pass in development)
    const verified = await verifyPayheroPayment(reference);
    if (!verified.success) {
      await client.query('ROLLBACK');
      return res.status(402).json({ success: false, message: 'Payment verification failed' });
    }

    // Calculate total and verify meal quantities
    let total_amount = 0;
    for (const item of items) {
      const mealResult = await client.query('SELECT * FROM meals WHERE id = $1 FOR UPDATE', [item.meal_id]);
      if (mealResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: `Meal ${item.meal_id} not found` });
      }
      const meal = mealResult.rows[0];
      if (!meal.availability || meal.quantity_available < item.quantity) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: `Insufficient quantity for ${meal.name}` });
      }
      total_amount += meal.price * item.quantity;

      // Decrement quantity
      const newQty = meal.quantity_available - item.quantity;
      await client.query(
        'UPDATE meals SET quantity_available = $1, availability = $2 WHERE id = $3',
        [newQty, newQty > 0, item.meal_id]
      );
    }

    // Insert order
    const orderResult = await client.query(
      `INSERT INTO orders (user_id, guest_name, phone_number, status, total_amount, created_at)
       VALUES ($1, $2, $3, 'paid', $4, NOW()) RETURNING *`,
      [user_id, guest_name || null, phone_number, total_amount]
    );
    const order = orderResult.rows[0];

    // Insert order items
    for (const item of items) {
      const mealResult = await client.query('SELECT name FROM meals WHERE id = $1', [item.meal_id]);
      await client.query(
        'INSERT INTO order_items (order_id, meal_id, quantity, meal_name) VALUES ($1, $2, $3, $4)',
        [order.id, item.meal_id, item.quantity, mealResult.rows[0]?.name]
      );
    }

    // Record transaction
    await client.query(
      `INSERT INTO transactions (order_id, amount, payment_status, payment_reference, payment_method, created_at)
       VALUES ($1, $2, 'success', $3, 'mpesa', NOW())`,
      [order.id, total_amount, reference]
    );

    await client.query('COMMIT');
    emitOrderEvent('new_order', { orderId: order.id, total_amount: total_amount });
    res.status(201).json({ success: true, data: order });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('placeOrder error:', error);
    if (error.code === '23505') {
      return res.status(409).json({ success: false, message: 'Duplicate payment reference - order already processed' });
    }
    res.status(500).json({ success: false, message: 'Server error placing order' });
  } finally {
    client.release();
  }
};

// POST /api/orders/initiate-payment - Trigger a PayHero M-Pesa STK push
const initiatePayment = async (req, res) => {
  try {
    const { email, amount, phone, customer_name, metadata } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid amount is required' });
    }

    // Development mode: no PayHero credentials -> simulate a successful STK
    // push so the entire checkout flow works end-to-end locally.
    if (!payheroConfigured()) {
      return res.json({
        success: true,
        simulated: true,
        data: {
          reference: `mock_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
          message: 'Simulated M-Pesa STK push (development mode - configure PAYHERO_* to go live)'
        }
      });
    }

    const reference = `CAF-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const params = JSON.stringify({
      amount,
      phone: normalizeKenyanPhone(phone),
      channel_id: process.env.PAYHERO_CHANNEL_ID ? Number(process.env.PAYHERO_CHANNEL_ID) : undefined,
      provider: 'mpesa',
      currency: 'KES',
      reference,
      customer_name: customer_name || 'Cafeteria Customer',
      email: email || undefined,
      callback_url: process.env.PAYHERO_CALLBACK_URL || undefined,
      metadata: metadata || {}
    });

    const parsed = await httpRequest({
      hostname: new URL(PAYHERO_BASE_URL).hostname,
      path: `${new URL(PAYHERO_BASE_URL).pathname}/payments`,
      method: 'POST',
      headers: {
        Authorization: payheroAuthHeader(),
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(params)
      },
      body: params
    });

    if (parsed.success === false) {
      console.error('PayHero initiate error:', parsed);
      return res.status(502).json({ success: false, message: 'Payment initiation failed at gateway' });
    }

    res.json({
      success: true,
      data: {
        reference,
        gateway_reference: parsed.reference || parsed.order_tracking_id || null,
        message: parsed.message || 'STK push sent. Enter your M-Pesa PIN to complete payment.'
      }
    });
  } catch (error) {
    console.error('initiatePayment error:', error);
    res.status(500).json({ success: false, message: 'Server error initiating payment' });
  }
};

// GET /api/orders - Get orders (staff/admin)
// Supports ?status=&date=&search=&page=&limit= (server-side pagination + search).
// Omitting `page` returns the full result set (legacy behaviour for the live queue).
const getOrders = async (req, res) => {
  try {
    const { status, date, search, page, limit } = req.query;
    const conditions = [];
    const params = [];

    if (status) {
      params.push(status);
      conditions.push(`o.status = $${params.length}`);
    }
    if (date) {
      params.push(date);
      conditions.push(`DATE(o.created_at) = $${params.length}`);
    } else if (!req.query.all) {
      conditions.push(`DATE(o.created_at) = CURRENT_DATE`);
    }
    if (search && String(search).trim()) {
      params.push(`%${String(search).trim().toLowerCase()}%`);
      const p = `$${params.length}`;
      conditions.push(`(LOWER(COALESCE(o.guest_name, '')) LIKE ${p} OR LOWER(o.phone_number) LIKE ${p} OR CAST(o.id AS TEXT) LIKE ${p} OR EXISTS (
        SELECT 1 FROM users su WHERE su.id = o.user_id AND (LOWER(su.name) LIKE ${p} OR LOWER(COALESCE(su.student_id, '')) LIKE ${p})
      ))`);
    }

    let where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const countRes = await pool.query(
      `SELECT COUNT(DISTINCT o.id)::int AS total FROM orders o LEFT JOIN users su ON su.id = o.user_id ${where}`,
      params
    );
    const total = countRes.rows[0].total;

    let query = `
      SELECT o.*, COALESCE(u.name, u.student_id) AS student_name,
             json_agg(json_build_object('meal_id', oi.meal_id, 'quantity', oi.quantity, 'name', oi.meal_name)) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      LEFT JOIN users u ON u.id = o.user_id
      ${where}`;

    if (!page) {
      query += ' GROUP BY o.id, u.name, u.student_id ORDER BY o.created_at DESC';
      const result = await pool.query(query, params);
      return res.json({ success: true, data: result.rows, total });
    }

    // Paginated mode
    const pageNum = Math.max(parseInt(page) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
    query += ` GROUP BY o.id, u.name, u.student_id ORDER BY o.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    const result = await pool.query(query, [...params, pageSize, (pageNum - 1) * pageSize]);
    res.json({
      success: true,
      data: result.rows,
      total,
      page: pageNum,
      pages: Math.max(Math.ceil(total / pageSize), 1),
    });
  } catch (error) {
    console.error('getOrders error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching orders' });
  }
};

// GET /api/orders/stream - Server-Sent Events feed of live order changes (staff/admin).
// EventSource cannot set headers, so the JWT is passed via ?token=
const streamOrders = async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`event: connected\ndata: {"ok":true}\n\n`);

  const listener = (payload) => res.write(`data: ${JSON.stringify(payload)}\n\n`);
  orderEvents.on('order', listener);

  const keepAlive = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(keepAlive);
    orderEvents.off('order', listener);
  });
};

// GET /api/orders/my-orders - Student's order history (last 3 days)
const getMyOrders = async (req, res) => {
  try {
    const user_id = req.user.id;
    const result = await pool.query(
      `SELECT o.*,
              json_agg(json_build_object('meal_id', oi.meal_id, 'quantity', oi.quantity, 'name', oi.meal_name)) as items
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       WHERE o.user_id = $1 AND o.created_at >= NOW() - INTERVAL '3 days'
       GROUP BY o.id
       ORDER BY o.created_at DESC`,
      [user_id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// PATCH /api/orders/:id/status - Update order status (staff)
const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const validStatuses = ['pending', 'paid', 'preparing', 'ready', 'served', 'expired'];
    if (!validStatuses.includes(status?.toLowerCase())) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    const result = await pool.query(
      `UPDATE orders SET status = $1, served_at = CASE WHEN $1 = 'served' THEN NOW() ELSE served_at END
       WHERE id = $2 RETURNING *`,
      [status.toLowerCase(), id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    logAudit(req, 'order.status_change', 'order', id, { status });
    emitOrderEvent('status_changed', { orderId: Number(id), status: result.rows[0].status });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// GET /api/orders/analytics - Admin analytics (KPIs + trends for graphs)
// Supports ?from=YYYY-MM-DD&to=YYYY-MM-DD (defaults to the last 7 days).
const getAnalytics = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const from = req.query.from && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from) ? req.query.from : null;
    const to = req.query.to && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to) ? req.query.to : today;
    const rangeStart = from || `(CURRENT_DATE - INTERVAL '6 days')::date`;
    const rangeEnd = `${to}::date + INTERVAL '1 day'`;

    const [revenue, orderCount, mealStats, trendRows, categoryRows, statusRows] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE DATE(created_at) = $1 AND status != 'expired'`, [today]),
      pool.query(`SELECT COUNT(*) as count FROM orders WHERE DATE(created_at) = $1`, [today]),
      pool.query(`
        SELECT m.name, m.category, SUM(oi.quantity) as total_sold,
               COALESCE((SELECT ROUND(AVG(r.rating)::numeric, 1) FROM meal_ratings r WHERE r.meal_id = m.id), 0) AS avg_rating
        FROM order_items oi
        JOIN meals m ON oi.meal_id = m.id
        JOIN orders o ON oi.order_id = o.id
        WHERE DATE(o.created_at) >= ${from ? `'${from}'` : `(CURRENT_DATE - INTERVAL '6 days')::date`} AND DATE(o.created_at) <= $1
        GROUP BY m.id, m.name, m.category
        ORDER BY total_sold DESC
        LIMIT 10
      `, [to]),
      pool.query(`
        WITH days AS (
          SELECT generate_series(${rangeStart}::date, ${rangeEnd}, INTERVAL '1 day')::date AS day
        )
        SELECT d.day::text AS date,
               to_char(d.day, 'Dy') AS label,
               COALESCE(SUM(o.total_amount) FILTER (WHERE o.status != 'expired'), 0) AS revenue,
               COUNT(o.id) AS orders
        FROM days d
        LEFT JOIN orders o ON DATE(o.created_at) = d.day
        GROUP BY d.day
        ORDER BY d.day
      `),
      pool.query(`
        SELECT m.category,
               COALESCE(SUM(oi.quantity), 0) AS units,
               COALESCE(SUM(oi.quantity * m.price), 0) AS revenue
        FROM order_items oi
        JOIN meals m ON oi.meal_id = m.id
        JOIN orders o ON oi.order_id = o.id
        WHERE DATE(o.created_at) >= ${from ? `'${from}'` : `(CURRENT_DATE - INTERVAL '6 days')::date`} AND DATE(o.created_at) <= $1
        GROUP BY m.category
        ORDER BY units DESC
      `, [to]),
      pool.query(`
        SELECT status, COUNT(*) as count
        FROM orders
        WHERE created_at >= ${rangeStart}::date AND created_at < ${rangeEnd}
        GROUP BY status
      `)
    ]);

    const revenueTrend = trendRows.rows.map((r) => ({
      date: r.date,
      label: r.label.trim(),
      revenue: parseFloat(r.revenue),
      orders: parseInt(r.orders),
    }));

    const categoryBreakdown = categoryRows.rows.map((c) => ({
      category: c.category,
      units: parseInt(c.units),
      revenue: parseFloat(c.revenue),
    }));

    const statusBreakdown = {};
    let weeklyOrders = 0;
    for (const s of statusRows.rows) {
      const c = parseInt(s.count);
      statusBreakdown[s.status] = c;
      weeklyOrders += c;
    }

    res.json({
      success: true,
      data: {
        revenue: parseFloat(revenue.rows[0].total),
        orderCount: parseInt(orderCount.rows[0].count),
        popularMeals: mealStats.rows,
        revenueTrend,
        categoryBreakdown,
        statusBreakdown,
        weeklyOrders,
        weeklyRevenue: revenueTrend.reduce((sum, d) => sum + d.revenue, 0),
      }
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching analytics' });
  }
};

// Helper: verify PayHero payment status by reference
const verifyPayheroPayment = (reference) =>
  new Promise((resolve) => {
    if (!reference) return resolve({ success: false });

    // Development mode: mock references auto-pass so the app is testable offline
    if (reference.startsWith('mock_')) return resolve({ success: true });

    if (!payheroConfigured()) {
      console.warn('verifyPayheroPayment: PAYHERO_* env vars not set; cannot verify real payment');
      return resolve({ success: false });
    }

    const url = new URL(PAYHERO_BASE_URL);
    httpRequest({
      hostname: url.hostname,
      path: `${url.pathname}/transaction-status?reference=${encodeURIComponent(reference)}`,
      method: 'GET',
      headers: { Authorization: payheroAuthHeader() }
    })
      .then((parsed) => {
        const status = String(parsed.status || parsed.transaction_status || '').toLowerCase();
        resolve({ success: ['success', 'completed'].includes(status) });
      })
      .catch(() => resolve({ success: false }));
  });

// GET /api/orders/export - CSV report of orders in a date range (admin)
const exportOrdersCsv = async (req, res) => {
  try {
    const to = req.query.to && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to) ? req.query.to : new Date().toISOString().split('T')[0];
    const from = req.query.from && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from) ? req.query.from : to;
    const result = await pool.query(
      `SELECT o.id, COALESCE(u.name, o.guest_name, 'Walk-in') AS customer, o.phone_number,
              o.status, o.total_amount, o.created_at, o.served_at,
              COALESCE(string_agg(oi.quantity || 'x ' || oi.meal_name, ', '), '') AS items
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN users u ON u.id = o.user_id
       WHERE DATE(o.created_at) >= $1 AND DATE(o.created_at) <= $2
       GROUP BY o.id, u.name ORDER BY o.created_at DESC`,
      [from, to]
    );

    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = 'Order ID,Customer,Phone,Status,Total (KES),Items,Placed At,Served At';
    const rows = result.rows.map((r) =>
      [r.id, r.customer, r.phone_number, r.status, r.total_amount, r.items,
       new Date(r.created_at).toISOString(), r.served_at ? new Date(r.served_at).toISOString() : ''].map(esc).join(',')
    );
    const csv = [header, ...rows].join('\n');

    logAudit(req, 'orders.export_csv', 'order', null, { from, to, count: rows.length });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="orders_${from}_to_${to}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('exportOrdersCsv error:', error);
    res.status(500).json({ success: false, message: 'Server error exporting orders' });
  }
};

module.exports = { placeOrder, initiatePayment, getOrders, getMyOrders, updateOrderStatus, getAnalytics, streamOrders, exportOrdersCsv };
