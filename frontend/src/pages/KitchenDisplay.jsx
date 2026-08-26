import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChefHat, ArrowLeft, Timer, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { fetchOrders, updateOrderStatus, createOrderStream } from '../services/api';
import { formatDate } from '../utils/session';
import { useToast } from '../context/ToastContext';

// Minutes of prep assumed per order when estimating wait times
const PREP_MINUTES = 8;

const elapsedMinutes = (from) => Math.max(0, Math.floor((Date.now() - new Date(from).getTime()) / 60000));

const KitchenTile = ({ order, position, onAdvance }) => {
  const [busy, setBusy] = useState(false);
  const [, forceTick] = useState(0);

  // Re-render each minute so elapsed timers stay fresh
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const isPreparing = order.status === 'preparing';
  const mins = elapsedMinutes(order.created_at);
  const late = mins > PREP_MINUTES * 2;

  return (
    <div
      className="kitchen-tile"
      style={{
        background: isPreparing ? 'var(--accent-soft)' : 'var(--bg-card)',
        border: `2px solid ${late ? 'var(--red)' : isPreparing ? 'var(--accent)' : 'var(--border-strong)'}`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '2rem', fontWeight: 800, fontFamily: 'var(--font-heading)' }}>
          #{String(order.id).padStart(4, '0')}
        </span>
        <span className="kitchen-pos">#{position} in queue</span>
      </div>
      <ul className="kitchen-items">
        {(order.items || []).map((item, i) => (
          <li key={i}>
            <strong>{item.quantity}×</strong> {item.name || item.meal_name}
          </li>
        ))}
      </ul>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: late ? 'var(--red)' : 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>
        <Timer size={15} /> waiting {mins} min{late && ' — OVERDUE'}
      </div>
      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
        {order.guest_name || order.student_name || 'Walk-in'} · {formatDate(order.created_at)}
      </p>
      <button
        className={`btn ${isPreparing ? 'btn-success' : 'btn-primary'} btn-full`}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await onAdvance(order.id, isPreparing ? 'ready' : 'preparing');
          setBusy(false);
        }}
      >
        {busy ? '…' : isPreparing ? 'Mark Ready' : 'Start Cooking'}
      </button>
    </div>
  );
};

const KitchenDisplay = () => {
  const { addToast } = useToast();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState(null);
  const streamRef = useRef(null);

  const loadOrders = useCallback(async () => {
    try {
      const res = await fetchOrders();
      setOrders(res.data || []);
      setLastSync(new Date());
    } catch (err) {
      addToast(err.message || 'Failed to load orders', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 60000); // safety net
    // Live updates via SSE; fall back to the interval silently if unsupported
    const stream = createOrderStream(
      () => loadOrders(),
      () => {}
    );
    streamRef.current = stream;
    return () => {
      clearInterval(interval);
      stream?.close?.();
    };
  }, [loadOrders]);

  const handleAdvance = async (id, status) => {
    try {
      await updateOrderStatus(id, status);
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
    } catch (err) {
      addToast(err.message || 'Failed to update', 'error');
    }
  };

  // Queue = paid (not started) then preparing, oldest first
  const paid = orders.filter((o) => o.status === 'paid').sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const preparing = orders.filter((o) => o.status === 'preparing').sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const queue = [...preparing, ...paid];

  return (
    <div className="page-padding">
      <div className="container" style={{ maxWidth: 1400 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className="console-emblem"><ChefHat size={24} /></div>
            <div>
              <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.6rem', margin: 0 }}>Kitchen Display</h1>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                Live · {queue.length} in queue · synced {lastSync ? lastSync.toLocaleTimeString() : '—'}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-secondary" onClick={loadOrders}><RefreshCw size={15} /> Refresh</button>
            <Link to="/cashier" className="btn btn-secondary"><ArrowLeft size={15} /> Console</Link>
          </div>
        </div>

        {loading ? (
          <div className="loading-spinner"><div className="spinner" /></div>
        ) : queue.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🍳</div>
            <h3>All caught up</h3>
            <p>New paid orders appear here automatically.</p>
          </div>
        ) : (
          <div className="kitchen-grid">
            {queue.map((o, i) => (
              <KitchenTile key={o.id} order={o} position={i + 1} onAdvance={handleAdvance} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default KitchenDisplay;
