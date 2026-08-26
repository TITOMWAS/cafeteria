import React, { useState, useEffect } from 'react';
import { User, Phone, Mail, Save, Clock, ShoppingBag, Printer, Star, Undo2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { fetchMyOrders, fetchMyCarryovers, updateProfile, rateMeal } from '../services/api';
import { MOCK_ORDERS } from '../mockData';
import { formatDate, formatKES, STATUS_STYLES } from '../utils/session';

const StarPicker = ({ value, onChange }) => (
  <div style={{ display: 'inline-flex', gap: 2 }}>
    {[1, 2, 3, 4, 5].map((n) => (
      <button key={n} type="button" onClick={() => onChange(n)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 1px' }}
        title={`${n} star${n > 1 ? 's' : ''}`}>
        <Star size={15} fill={value >= n ? '#fbbf24' : 'none'} color="#fbbf24" />
      </button>
    ))}
  </div>
);

const StudentProfile = () => {
  const { user, updateUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { addToast } = useToast();

  const [orders, setOrders] = useState([]);
  const [carryovers, setCarryovers] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [form, setForm] = useState({ name: user?.name || '', phone: user?.phone || '' });
  const [saving, setSaving] = useState(false);
  const [receiptOrder, setReceiptOrder] = useState(null);
  const [myRatings, setMyRatings] = useState({});

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetchMyOrders();
        setOrders(res.data || []);
      } catch {
        setOrders(MOCK_ORDERS);
      } finally {
        setLoadingOrders(false);
      }
    };
    load();
    if (user?.role === 'student') {
      fetchMyCarryovers().then((res) => setCarryovers((res.data || []).filter((c) => c.status !== 'expired'))).catch(() => {});
    }
  }, [user?.role]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await updateProfile({ name: form.name, phone: form.phone, theme_preference: theme });
      updateUser(res.data);
      addToast('Profile updated successfully!', 'success');
    } catch {
      // Demo fallback
      updateUser({ name: form.name, phone: form.phone });
      addToast('Profile updated (demo)', 'info');
    } finally {
      setSaving(false);
    }
  };

  const handleRate = async (mealId, rating) => {
    setMyRatings((prev) => ({ ...prev, [mealId]: rating }));
    try {
      await rateMeal(mealId, rating);
      addToast('Thanks for rating!', 'success');
    } catch (err) {
      addToast(err.message || 'Could not save your rating', 'error');
      setMyRatings((prev) => ({ ...prev, [mealId]: prev[mealId] }));
    }
  };

  const initials = (user?.name || 'U').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="page-padding">
      <div className="container" style={{ maxWidth: 900 }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '2rem', marginBottom: '2rem' }}>My Profile</h1>

        {/* Profile Header Card */}
        <div className="profile-header">
          <div className="profile-avatar">{initials}</div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', marginBottom: '0.25rem' }}>{user?.name}</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Mail size={14} /> {user?.email || 'No email on file'}
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Student ID: <strong style={{ color: 'var(--text-secondary)' }}>{user?.student_id || user?.id}</strong>
            </p>
          </div>
          <div style={{ background: 'var(--accent-light)', border: '1px solid var(--border-accent)', borderRadius: 'var(--radius-md)', padding: '0.4rem 0.8rem', color: 'var(--accent)', fontSize: '0.82rem', fontWeight: 600, textTransform: 'capitalize' }}>
            {user?.role}
          </div>
        </div>

        {/* Missed-meal carryover vouchers */}
        {carryovers.length > 0 && (
          <div className="card-elevated" style={{ padding: '1.5rem', marginBottom: '2rem', borderColor: 'var(--amber)' }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Undo2 size={18} /> Missed-Meal Vouchers
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Meals you paid for but didn't collect can be picked up during the next serving window. Show this code at the counter.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '0.85rem' }}>
              {carryovers.map((c) => (
                <div key={c.id} className="card" style={{
                  padding: '1rem', textAlign: 'center',
                  opacity: c.status === 'redeemed' ? 0.55 : 1,
                  borderLeft: `4px solid ${c.status === 'redeemed' ? 'var(--green)' : 'var(--amber)'}`,
                }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'var(--font-heading)', letterSpacing: '0.08em', color: 'var(--accent)' }}>
                    {c.code}
                  </div>
                  <div style={{ fontSize: '0.82rem', marginTop: '0.35rem' }}>
                    {(c.items || []).map((i) => `${i.quantity}× ${i.name}`).join(', ')}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.35rem', textTransform: 'capitalize' }}>
                    Missed {c.original_session} · {c.status === 'redeemed' ? '✓ Redeemed' : `Expires ${formatDate(c.expires_at)}`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          {/* Edit Profile */}
          <div className="card-elevated" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', marginBottom: '1.5rem' }}>Edit Profile</h3>
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input className="form-input" type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Phone Number</label>
                <input className="form-input" type="tel" placeholder="e.g. 0712345678" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>

              <div className="form-group">
                <label className="form-label">Display Theme</label>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button type="button" className={`btn ${theme === 'dark' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1 }} onClick={() => theme !== 'dark' && toggleTheme()}>
                    🌙 Dark
                  </button>
                  <button type="button" className={`btn ${theme === 'light' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1 }} onClick={() => theme !== 'light' && toggleTheme()}>
                    ☀️ Light
                  </button>
                </div>
              </div>

              <button id="save-profile-btn" type="submit" className="btn btn-primary btn-full" disabled={saving} style={{ marginTop: '0.5rem' }}>
                <Save size={16} />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          </div>

          {/* Order History */}
          <div className="card-elevated" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Clock size={18} /> Order History <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>(Last 3 days)</span>
            </h3>

            {loadingOrders ? (
              <div className="loading-spinner" style={{ padding: '2rem' }}><div className="spinner" /></div>
            ) : orders.length === 0 ? (
              <div className="empty-state" style={{ padding: '2rem' }}>
                <ShoppingBag size={36} color="var(--text-muted)" style={{ marginBottom: '0.75rem' }} />
                <p>No orders in the last 3 days.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: 400, overflowY: 'auto' }}>
                {orders.map((o) => {
                  const st = STATUS_STYLES[o.status?.toLowerCase()] || STATUS_STYLES.pending;
                  return (
                    <div key={o.id} className="card" style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                        <strong style={{ fontSize: '0.9rem' }}>#{o.id}</strong>
                        <span className="badge" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                      </div>
                      <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>{formatDate(o.created_at)}</p>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {(o.items || []).map((i) => `${i.quantity}× ${i.name || i.meal_name}`).join(', ')}
                      </p>
                      <p style={{ fontWeight: 700, color: 'var(--accent)', margin: '0.5rem 0' }}>{formatKES(o.total_amount)}</p>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <button className="btn btn-secondary" style={{ padding: '0.3rem 0.7rem', fontSize: '0.76rem' }} onClick={() => setReceiptOrder(o)}>
                          <Printer size={12} /> Receipt
                        </button>
                        {o.status?.toLowerCase() === 'served' && (o.items || []).map((item) => (
                          <span key={item.meal_id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            {(item.name || item.meal_name)?.split(' ')[0]}:
                            <StarPicker
                              value={myRatings[item.meal_id] ?? item.rating ?? 0}
                              onChange={(v) => handleRate(item.meal_id, v)}
                            />
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Receipt Modal */}
      {receiptOrder && (
        <div className="modal-overlay" onClick={() => setReceiptOrder(null)}>
          <div className="modal receipt-modal" onClick={(e) => e.stopPropagation()} id="printable-receipt">
            <div className="modal-header no-print">
              <h3 style={{ margin: 0 }}>Receipt #{String(receiptOrder.id).padStart(4, '0')}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setReceiptOrder(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
                <strong style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem' }}>Synapse Cafeteria</strong>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>support@synapsefive.com</p>
              </div>
              <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                <tbody>
                  {(receiptOrder.items || []).map((i, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: '0.35rem 0' }}>{i.quantity}× {i.name || i.meal_name}</td>
                      <td style={{ textAlign: 'right' }}>{formatKES(i.price * i.quantity)}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: '1px dashed var(--border-strong)', fontWeight: 800, fontSize: '0.95rem' }}>
                    <td style={{ paddingTop: '0.6rem' }}>Total</td>
                    <td style={{ textAlign: 'right', paddingTop: '0.6rem', color: 'var(--accent)' }}>{formatKES(receiptOrder.total_amount)}</td>
                  </tr>
                </tbody>
              </table>
              <div style={{ marginTop: '1rem', fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                <span>Placed: {formatDate(receiptOrder.created_at)}</span>
                <span>Payment: M-Pesa via PayHero</span>
                {receiptOrder.served_at && <span>Collected: {formatDate(receiptOrder.served_at)}</span>}
              </div>
              <p style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '1.25rem' }}>
                Thank you for eating with us! 🎓<br />© 2026 SynapseFive
              </p>
            </div>
            <div className="modal-footer no-print">
              <button className="btn btn-secondary" onClick={() => setReceiptOrder(null)}>Close</button>
              <button className="btn btn-primary" onClick={() => window.print()}>
                <Printer size={16} /> Print
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentProfile;
