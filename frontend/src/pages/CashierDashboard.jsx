import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Clock, ChefHat, CheckCircle, PackageCheck, Search, Coffee, Settings, LayoutList, Undo2 } from 'lucide-react';
import { fetchOrders, updateOrderStatus, fetchCarryovers, redeemCarryover, createOrderStream } from '../services/api';
import { formatDate, STATUS_STYLES, getActiveSession, SESSION_SCHEDULE } from '../utils/session';
import { useToast } from '../context/ToastContext';
import SettingsPanel from '../components/SettingsPanel';

const STATUS_FLOW = {
  paid:      { next: 'preparing', label: 'Start Preparing',  btnClass: 'btn-primary', icon: <ChefHat size={16} /> },
  preparing: { next: 'ready',     label: 'Mark Ready',       btnClass: 'btn-success', icon: <CheckCircle size={16} /> },
  ready:     { next: 'served',    label: 'Mark as Served',   btnClass: 'btn-secondary', icon: <PackageCheck size={16} /> },
};

const FILTERS = ['all', 'paid', 'preparing', 'ready', 'served'];

const AVG_PREP_MINUTES = 8; // rough kitchen throughput used for ETA estimates

const OrderCard = ({ order, onStatusChange, etaMinutes }) => {
  const [updating, setUpdating] = useState(false);
  const st = STATUS_STYLES[order.status?.toLowerCase()] || STATUS_STYLES.pending;
  const nextStep = STATUS_FLOW[order.status?.toLowerCase()];

  const handleUpdate = async () => {
    if (!nextStep) return;
    setUpdating(true);
    await onStatusChange(order.id, nextStep.next);
    setUpdating(false);
  };

  return (
    <div className={`card queue-card st-${order.status?.toLowerCase()}`}>
      <div className="order-header">
        <div>
          <div className="order-id">#{String(order.id).padStart(4, '0')}</div>
          <div className="order-time" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <Clock size={11} /> {formatDate(order.created_at)}
          </div>
          {etaMinutes != null && nextStep && (
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--amber)', marginTop: '0.25rem', display: 'inline-block' }}>
              ~{etaMinutes} min to ready
            </span>
          )}
        </div>
        <span className="badge" style={{ background: st.bg, color: st.color }}>{st.label}</span>
      </div>

      <div>
        <p className="order-customer">{order.guest_name || order.student_name || 'Walk-in customer'}</p>
        <p className="order-phone">{order.phone_number}</p>
      </div>

      <ul className="order-items-list">
        {(order.items || []).map((item, i) => (
          <li key={i}>
            <span>{item.quantity}× {item.name || item.meal_name}</span>
          </li>
        ))}
        <li className="order-total">
          <span>Total</span>
          <span style={{ color: 'var(--accent)' }}>KES {Number(order.total_amount).toLocaleString()}</span>
        </li>
      </ul>

      {nextStep ? (
        <button
          className={`btn ${nextStep.btnClass} btn-full queue-action`}
          onClick={handleUpdate}
          disabled={updating}
        >
          {nextStep.icon}
          {updating ? 'Updating…' : nextStep.label}
        </button>
      ) : (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem', padding: '0.35rem' }}>
          ✓ Completed
        </p>
      )}
    </div>
  );
};

const CarryoverCard = ({ carryover, onRedeem }) => {
  const [busy, setBusy] = useState(false);
  const sessionLabel = SESSION_SCHEDULE.find((s) => s.id === carryover.original_session)?.label || carryover.original_session;

  return (
    <div className={`card queue-card`} style={{ borderColor: 'var(--amber)', borderWidth: 1.5 }}>
      <div className="order-header">
        <div>
          <div className="order-id" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            Missed {sessionLabel} <Undo2 size={15} color="var(--amber)" />
          </div>
          <div className="order-time">Code: <strong>{carryover.code}</strong></div>
        </div>
        <span className="badge" style={{ background: 'var(--amber-light)', color: 'var(--amber)' }}>Carryover</span>
      </div>

      <div>
        <p className="order-customer">{carryover.student_name || carryover.guest_name || 'Walk-in customer'}</p>
        <p className="order-phone">{carryover.phone_number}</p>
      </div>

      <ul className="order-items-list">
        {(carryover.items || []).map((item, i) => (
          <li key={i}>
            <span>{item.quantity}× {item.name || item.meal_name}</span>
          </li>
        ))}
        <li className="order-total">
          <span>Expires</span>
          <span style={{ color: 'var(--red)' }}>{formatDate(carryover.expires_at)}</span>
        </li>
      </ul>

      <button
        className="btn btn-primary btn-full queue-action"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await onRedeem(carryover);
          setBusy(false);
        }}
      >
        <Undo2 size={16} /> {busy ? 'Redeeming…' : `Hand over & Redeem`}
      </button>
    </div>
  );
};

const CashierDashboard = () => {
  const { addToast } = useToast();
  const [orders, setOrders] = useState([]);
  const [carryovers, setCarryovers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('queue');
  const esRef = useRef(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchOrders();
      setOrders(res.data || []);
    } catch (err) {
      addToast(err.message || 'Failed to load orders', 'error');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  const loadCarryovers = useCallback(async () => {
    try {
      const res = await fetchCarryovers(searchQuery);
      setCarryovers(res.data || []);
    } catch { setCarryovers([]); }
  }, [searchQuery]);

  useEffect(() => { loadOrders(); loadCarryovers(); }, [loadOrders]);

  // Live queue — SSE push with a 1-minute polling fallback
  useEffect(() => {
    const interval = setInterval(loadOrders, 60000);
    esRef.current = createOrderStream(() => loadOrders(), () => {});
    return () => {
      clearInterval(interval);
      if (esRef.current) esRef.current.close();
    };
  }, [loadOrders]);

  // Refresh carryovers when searching or switching to their tab
  useEffect(() => {
    if (activeTab === 'carryovers') loadCarryovers();
  }, [activeTab, searchQuery, loadCarryovers]);

  const handleStatusChange = async (id, newStatus) => {
    try {
      await updateOrderStatus(id, newStatus);
      setOrders((prev) => prev.map((o) => o.id === id ? { ...o, status: newStatus } : o));
      addToast(`Order #${id} → ${newStatus}`, 'success');
    } catch (err) {
      addToast(err.message || 'Failed to update order', 'error');
    }
  };

  const handleRedeem = async (carryover) => {
    try {
      await redeemCarryover(carryover.id);
      setCarryovers((prev) => prev.filter((c) => c.id !== carryover.id));
      addToast(`Missed meal ${carryover.code} redeemed`, 'success');
    } catch (err) {
      addToast(err.message || 'Redeem failed — check the serving window', 'error');
    }
  };

  let filtered = filter === 'all' ? orders : orders.filter((o) => o.status?.toLowerCase() === filter);
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(o =>
      (o.guest_name && o.guest_name.toLowerCase().includes(q)) ||
      String(o.user_id || '').toLowerCase().includes(q) ||
      (o.phone_number && o.phone_number.includes(q)) ||
      String(o.id).includes(q)
    );
  }

  // ETA: position in the paid/preparing pipeline × average prep time
  const activePipeline = orders.filter((o) => ['paid', 'preparing'].includes(o.status?.toLowerCase()));
  const minutesElapsedSince = (d) =>
    Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 60000));
  const etaForOrder = (order) => {
    const idx = activePipeline.findIndex((o) => o.id === order.id);
    if (idx === -1) return null;
    return Math.max((idx + 1) * AVG_PREP_MINUTES - minutesElapsedSince(order.created_at), 1);
  };

  const count = (f) =>
    f === 'all' ? orders.length : orders.filter((o) => o.status?.toLowerCase() === f).length;

  const inQueue = count('paid') + count('preparing') + count('ready');
  const currentSession = getActiveSession();

  return (
    <div className="page-padding">
      <div className="container">
        {/* Console Header */}
        <div className="console-header">
          <div className="console-title-wrap">
            <div className="console-emblem"><Coffee size={22} /></div>
            <div>
              <div className="console-title">Cashier Console</div>
              <div className="console-subtitle">
                <span className="live-pill"><span className="session-dot" /> Live</span>
                Real-time · fallback refresh every 1 min
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <a href="/kitchen" className="btn btn-ghost" title="Open kitchen display">
              <ChefHat size={15} /> Kitchen view
            </a>
            <button className="btn btn-secondary" onClick={() => { loadOrders(); loadCarryovers(); }}>
              <RefreshCw size={15} /> Refresh now
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.75rem', borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
          {[
            { id: 'queue', label: 'Live Queue', icon: <LayoutList size={16} /> },
            { id: 'carryovers', label: 'Missed Meals', icon: <Undo2 size={16} /> },
            { id: 'settings', label: 'Settings', icon: <Settings size={16} /> },
          ].map((t) => (
            <button
              key={t.id}
              id={`staff-tab-${t.id}`}
              className="btn btn-ghost"
              style={{
                borderRadius: '0.5rem 0.5rem 0 0', paddingBottom: '0.75rem',
                borderBottom: activeTab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
                color: activeTab === t.id ? 'var(--accent)' : 'var(--text-muted)',
                gap: '0.4rem', fontWeight: 600, fontSize: '0.9rem',
                position: 'relative',
              }}
              onClick={() => setActiveTab(t.id)}
            >
              {t.icon} {t.label}
              {t.id === 'carryovers' && carryovers.length > 0 && (
                <span className="cart-badge" style={{ position: 'static', transform: 'none' }}>{carryovers.length}</span>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'settings' && (
          <div>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.3rem', marginBottom: '1.25rem' }}>Staff Settings</h3>
            <SettingsPanel />
          </div>
        )}

        {activeTab === 'carryovers' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.3rem' }}>Missed-Meal Carryovers</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem', marginTop: '0.2rem' }}>
                  Uncollected meals from an earlier session can be handed over now.
                  Current window: <strong style={{ color: currentSession === 'closed' ? 'var(--red)' : 'var(--green)' }}>
                    {currentSession === 'closed' ? 'Closed — redemption unavailable' : currentSession}
                  </strong>
                </p>
              </div>
              <div style={{ position: 'relative', width: 280 }}>
                <Search size={15} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input type="text" className="form-input" style={{ paddingLeft: '2.6rem' }}
                  placeholder="Name, phone or code…" value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)} />
              </div>
            </div>
            {carryovers.length > 0 ? (
              <div className="queue-grid">
                {carryovers.map((c) => <CarryoverCard key={c.id} carryover={c} onRedeem={handleRedeem} />)}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">✅</div>
                <h3>No pending carryovers</h3>
                <p>Uncollected meals appear here after each serving window closes.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'queue' && (<>
        {/* KPI strip */}
        <div className="kpi-strip">
          <div className="kpi-chip kpi-accent">
            <span className="kpi-chip-label">In Queue</span>
            <span className="kpi-chip-value">{inQueue}</span>
          </div>
          <div className="kpi-chip kpi-teal">
            <span className="kpi-chip-label">Preparing</span>
            <span className="kpi-chip-value">{count('preparing')}</span>
          </div>
          <div className="kpi-chip kpi-green">
            <span className="kpi-chip-label">Ready</span>
            <span className="kpi-chip-value">{count('ready')}</span>
          </div>
          <div className="kpi-chip kpi-gray">
            <span className="kpi-chip-label">Served Today</span>
            <span className="kpi-chip-value">{count('served')}</span>
          </div>
        </div>

        {/* Toolbar */}
        <div className="queue-toolbar">
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {FILTERS.map((f) => (
              <button
                key={f}
                id={`filter-${f}`}
                className={`queue-filter ${filter === f ? 'active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                {count(f) > 0 && <span className="queue-count">{count(f)}</span>}
              </button>
            ))}
          </div>

          <div style={{ position: 'relative', flexGrow: 1, maxWidth: '300px', minWidth: '200px' }}>
            <Search size={15} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: '2.6rem' }}
              placeholder="Search name, phone or #id…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Queue */}
        {loading ? (
          <div className="loading-spinner"><div className="spinner" /></div>
        ) : filtered.length > 0 ? (
          <div className="queue-grid">
            {filtered.map((order) => (
              <OrderCard key={order.id} order={order} onStatusChange={handleStatusChange}
                etaMinutes={etaForOrder(order) ?? undefined} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">☕</div>
            <h3>Queue is clear</h3>
            <p>New orders appear here the moment they are paid.</p>
          </div>
        )}
        </>)}
      </div>
    </div>
  );
};

export default CashierDashboard;
