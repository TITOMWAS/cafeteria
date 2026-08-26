import React, { useState, useEffect, useCallback } from 'react';
import {
  DollarSign, ShoppingBag, TrendingUp, Users, Plus, Edit, Eye, EyeOff, RefreshCw,
  BarChart2, Trash2, UserPlus, Settings, Download, AlertTriangle, History, Search,
  ChevronLeft, ChevronRight, Upload, Star,
} from 'lucide-react';
import {
  fetchAnalytics, fetchOrders, fetchMeals, createMeal, updateMeal, toggleMealAvailability,
  uploadMealImage, fetchUsers, adminCreateUser, adminUpdateUser, adminDeleteUser,
  exportOrdersCsv, fetchAuditLogs,
} from '../services/api';
import { formatDate, formatKES, STATUS_STYLES } from '../utils/session';
import { useToast } from '../context/ToastContext';
import { TrendChart, DonutChart, StatusBars } from '../components/charts';
import SettingsPanel from '../components/SettingsPanel';

const EMPTY_MEAL_FORM = { name: '', description: '', price: '', image_url: '', category: 'lunch', quantity_available: '' };
const EMPTY_USER_FORM = { student_id: '', name: '', email: '', phone: '', password: '', role: 'student' };

// Strict student registration number: CT207/119148/24
// (course code of 2-3 letters + 3 digits) / (exactly 6 digits) / (2-digit year)
const STUDENT_REG_REGEX = /^[A-Z]{2,3}\d{3}\/\d{6}\/\d{2}$/;
const LOW_STOCK_THRESHOLD = 5;

const ROLE_BADGE = {
  admin:  { background: 'var(--purple-light)', color: 'var(--purple)' },
  staff:  { background: 'var(--teal-light)',   color: 'var(--teal)' },
  student:{ background: 'var(--accent-light)', color: 'var(--accent)' },
};

const isoDaysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

const AdminDashboard = () => {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [analytics, setAnalytics] = useState({ revenue: 0, orderCount: 0, popularMeals: [] });
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState({ from: isoDaysAgo(6), to: '' });

  // Orders browser state
  const [orders, setOrders] = useState([]);
  const [ordersMeta, setOrdersMeta] = useState({ total: 0, page: 1, pages: 1 });
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersSearch, setOrdersSearch] = useState('');

  const [showMealForm, setShowMealForm] = useState(false);
  const [editingMeal, setEditingMeal] = useState(null);
  const [mealForm, setMealForm] = useState(EMPTY_MEAL_FORM);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [users, setUsers] = useState([]);
  const [usersMeta, setUsersMeta] = useState({ total: 0, page: 1, pages: 1 });
  const [usersPage, setUsersPage] = useState(1);
  const [usersSearch, setUsersSearch] = useState('');
  const [usersRole, setUsersRole] = useState('');
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userForm, setUserForm] = useState(EMPTY_USER_FORM);

  const [auditLogs, setAuditLogs] = useState([]);

  // ===== Data loading =====
  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAnalytics({ from: range.from || undefined, to: range.to || undefined });
      setAnalytics(res.data);
      setOrders(res.data.ordersList || []);
    } catch (err) {
      addToast(err.message || 'Failed to load dashboard data', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, range]);

  const loadMeals = useCallback(async () => {
    try {
      const res = await fetchMeals();
      setMeals(res.data || []);
    } catch (err) {
      addToast(err.message || 'Failed to load meals', 'error');
    }
  }, [addToast]);

  const loadOrders = useCallback(async () => {
    try {
      const res = await fetchOrders({ all: true, search: ordersSearch || undefined, page: ordersPage, limit: 15 });
      setOrders(res.data || []);
      setOrdersMeta({ total: res.total ?? (res.data || []).length, page: res.page || 1, pages: res.pages || 1 });
    } catch (err) {
      addToast(err.message || 'Failed to load orders', 'error');
    }
  }, [addToast, ordersSearch, ordersPage]);

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetchUsers({ search: usersSearch || undefined, role: usersRole || undefined, page: usersPage, limit: 15 });
      setUsers(res.data || []);
      setUsersMeta({ total: res.total ?? (res.data || []).length, page: res.page || 1, pages: res.pages || 1 });
    } catch (err) {
      addToast(err.message || 'Failed to load users', 'error');
    }
  }, [addToast, usersSearch, usersRole, usersPage]);

  const loadAudit = useCallback(async () => {
    try {
      const res = await fetchAuditLogs({ limit: 50 });
      setAuditLogs(res.data || []);
    } catch { setAuditLogs([]); }
  }, []);

  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);
  useEffect(() => { loadMeals(); loadAudit(); }, [loadMeals, loadAudit]);
  useEffect(() => { if (activeTab === 'orders') loadOrders(); }, [activeTab, loadOrders]);
  useEffect(() => { if (activeTab === 'users') loadUsers(); }, [activeTab, loadUsers]);
  useEffect(() => {
    const t = setTimeout(() => { if (activeTab === 'orders') loadOrders(); }, 300);
    return () => clearTimeout(t);
  }, [ordersSearch]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setTimeout(() => { if (activeTab === 'users') loadUsers(); }, 300);
    return () => clearTimeout(t);
  }, [usersSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  const lowStockMeals = meals.filter((m) => m.availability && m.quantity_available <= LOW_STOCK_THRESHOLD);
  const staffCount = users.filter((u) => u.role === 'staff').length;

  const handleExportCsv = async () => {
    try {
      await exportOrdersCsv({ from: range.from || undefined, to: range.to || undefined });
      addToast('CSV report downloaded', 'success');
    } catch (err) { addToast(err.message || 'Export failed', 'error'); }
  };

  // ===== Meal handlers =====
  const handleSaveMeal = async (e) => {
    e.preventDefault();
    try {
      if (editingMeal) {
        await updateMeal(editingMeal.id, mealForm);
        addToast('Meal updated', 'success');
      } else {
        await createMeal(mealForm);
        addToast('Meal created', 'success');
      }
      setShowMealForm(false);
      setEditingMeal(null);
      setMealForm(EMPTY_MEAL_FORM);
      loadMeals();
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const res = await uploadMealImage(file);
      setMealForm((prev) => ({ ...prev, image_url: res.data.url }));
      addToast('Image uploaded', 'success');
    } catch (err) {
      addToast(err.message || 'Upload failed', 'error');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleToggleMeal = async (meal) => {
    try {
      await toggleMealAvailability(meal.id, !meal.availability);
      setMeals((prev) => prev.map((m) => m.id === meal.id ? { ...m, availability: !m.availability } : m));
      addToast(`${meal.name} ${meal.availability ? 'disabled' : 'enabled'}`, 'success');
    } catch (err) { addToast(err.message, 'error'); }
  };

  const openEdit = (meal) => {
    setEditingMeal(meal);
    setMealForm({ name: meal.name, description: meal.description || '', price: meal.price, image_url: meal.image_url || '', category: meal.category, quantity_available: meal.quantity_available });
    setShowMealForm(true);
  };

  // ===== User handlers =====
  const openAddUser = () => {
    setEditingUser(null);
    setUserForm(EMPTY_USER_FORM);
    setShowUserForm(true);
  };

  const openEditUser = (u) => {
    setEditingUser(u);
    setUserForm({ student_id: u.student_id || '', name: u.name || '', email: u.email || '', phone: u.phone || '', password: '', role: u.role || 'student' });
    setShowUserForm(true);
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (userForm.role === 'student' && !STUDENT_REG_REGEX.test(userForm.student_id)) {
      addToast('Invalid Registration Number — expected format CT207/119148/24', 'error');
      return;
    }
    try {
      if (editingUser) {
        const payload = { name: userForm.name, email: userForm.email, phone: userForm.phone, student_id: userForm.student_id, role: userForm.role };
        if (userForm.password) payload.password = userForm.password;
        await adminUpdateUser(editingUser.id, payload);
        addToast(`${userForm.name} updated`, 'success');
      } else {
        await adminCreateUser(userForm);
        addToast(`${userForm.name} added as ${userForm.role}`, 'success');
      }
      setShowUserForm(false);
      setEditingUser(null);
      setUserForm(EMPTY_USER_FORM);
      loadUsers();
    } catch (err) { addToast(err.message, 'error'); }
  };

  const handleDeleteUser = async (u) => {
    if (!window.confirm(`Remove ${u.name} (${u.role}) permanently?`)) return;
    try {
      await adminDeleteUser(u.id);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      addToast(`${u.name} removed`, 'success');
    } catch (err) { addToast(err.message, 'error'); }
  };

  const TABS = [
    { id: 'overview', label: 'Overview', icon: <BarChart2 size={16} /> },
    { id: 'orders', label: 'Orders', icon: <ShoppingBag size={16} /> },
    { id: 'menu', label: 'Menu Management', icon: <Edit size={16} /> },
    { id: 'users', label: 'Users & Staff', icon: <Users size={16} /> },
    { id: 'audit', label: 'Audit Log', icon: <History size={16} /> },
    { id: 'settings', label: 'Settings', icon: <Settings size={16} /> },
  ];

  const Pagination = ({ meta, onPage }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '1rem' }}>
      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
        Page {meta.page} of {meta.pages} · {meta.total} records
      </span>
      <button className="btn btn-secondary" style={{ padding: '0.35rem 0.55rem' }} disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}><ChevronLeft size={14} /></button>
      <button className="btn btn-secondary" style={{ padding: '0.35rem 0.55rem' }} disabled={meta.page >= meta.pages} onClick={() => onPage(meta.page + 1)}><ChevronRight size={14} /></button>
    </div>
  );

  return (
    <div className="page-padding">
      <div className="container">
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '2rem', marginBottom: '0.25rem' }}>Management Console</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Revenue, analytics and menu control for Synapse Cafeteria
            </p>
          </div>
          <button className="btn btn-secondary" onClick={() => { loadAnalytics(); loadMeals(); loadAudit(); }}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>

        {/* Sub-Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0', flexWrap: 'wrap' }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              id={`admin-tab-${t.id}`}
              className="btn btn-ghost"
              style={{
                borderRadius: '0.5rem 0.5rem 0 0', paddingBottom: '0.75rem',
                borderBottom: activeTab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
                color: activeTab === t.id ? 'var(--accent)' : 'var(--text-muted)',
                gap: '0.4rem', fontWeight: 600, fontSize: '0.9rem'
              }}
              onClick={() => setActiveTab(t.id)}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="loading-spinner"><div className="spinner" /></div>
        ) : (
          <>
            {/* ==================== OVERVIEW TAB ==================== */}
            {activeTab === 'overview' && (
              <div>
                {/* Date range + export toolbar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Report period:
                    <input type="date" className="form-input" style={{ width: 160, padding: '0.4rem 0.6rem' }}
                      value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
                    <span>→</span>
                    <input type="date" className="form-input" style={{ width: 160, padding: '0.4rem 0.6rem' }}
                      value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
                  </div>
                  <button className="btn btn-secondary" onClick={handleExportCsv}>
                    <Download size={15} /> Export CSV
                  </button>
                </div>

                {/* Low stock alert banner */}
                {lowStockMeals.length > 0 && (
                  <div className="card-elevated" style={{ padding: '1rem 1.25rem', marginBottom: '1.25rem', borderLeft: '4px solid var(--amber)', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <AlertTriangle size={20} color="var(--amber)" />
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <strong style={{ fontSize: '0.9rem' }}>Low stock warning</strong>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {lowStockMeals.map((m) => `${m.name} (${m.quantity_available})`).join(' · ')}
                      </p>
                    </div>
                    <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }} onClick={() => setActiveTab('menu')}>
                      Restock
                    </button>
                  </div>
                )}

                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'var(--accent-light)' }}>
                      <DollarSign size={24} color="var(--accent)" />
                    </div>
                    <div>
                      <div className="stat-label">Today's Revenue</div>
                      <div className="stat-value">KES {Number(analytics.revenue).toLocaleString()}</div>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'var(--green-light)' }}>
                      <ShoppingBag size={24} color="var(--green)" />
                    </div>
                    <div>
                      <div className="stat-label">Orders Today</div>
                      <div className="stat-value">{analytics.orderCount}</div>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'var(--teal-light)' }}>
                      <TrendingUp size={24} color="var(--teal)" />
                    </div>
                    <div>
                      <div className="stat-label">Active Meals</div>
                      <div className="stat-value">{meals.filter((m) => m.availability).length}</div>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon" style={{ background: 'var(--amber-light)' }}>
                      <Users size={24} color="var(--amber)" />
                    </div>
                    <div>
                      <div className="stat-label">Avg. Order Value</div>
                      <div className="stat-value">KES {analytics.orderCount ? Math.round(analytics.revenue / analytics.orderCount) : 0}</div>
                    </div>
                  </div>
                </div>

                {/* GRAPHS */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem', marginTop: '1.5rem' }}>
                  <div className="card-elevated" style={{ padding: '1.5rem' }}>
                    <h3 style={{ marginBottom: '1rem', fontFamily: 'var(--font-heading)' }}>
                      📈 Revenue Trend
                      <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                        Period total: {formatKES(analytics.weeklyRevenue || 0)}
                      </span>
                    </h3>
                    <TrendChart data={analytics.revenueTrend} />
                  </div>

                  <div className="card-elevated" style={{ padding: '1.5rem' }}>
                    <h3 style={{ marginBottom: '1rem', fontFamily: 'var(--font-heading)' }}>🥗 Sales by Category</h3>
                    <DonutChart
                      segments={(analytics.categoryBreakdown || []).map((c) => ({
                        label: c.category,
                        value: c.units,
                        color: c.category === 'breakfast' ? 'var(--amber)' : c.category === 'lunch' ? 'var(--green)' : 'var(--teal)',
                      }))}
                      centerLabel="Units sold"
                      centerValue={(analytics.categoryBreakdown || []).reduce((s, c) => s + c.units, 0).toLocaleString()}
                    />
                  </div>
                </div>

                <div className="card-elevated" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
                  <h3 style={{ marginBottom: '1rem', fontFamily: 'var(--font-heading)' }}>🚦 Order Status — Selected Period ({analytics.weeklyOrders || 0} orders)</h3>
                  <StatusBars statusBreakdown={analytics.statusBreakdown} />
                </div>

                {analytics.popularMeals?.length > 0 && (
                  <div className="card-elevated" style={{ padding: '1.5rem' }}>
                    <h3 style={{ marginBottom: '1.25rem', fontFamily: 'var(--font-heading)' }}>🔥 Popular Meals Today</h3>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>#</th><th>Meal</th><th>Category</th><th>Units Sold</th><th><Star size={12} style={{ verticalAlign: '-2px' }} /> Rating</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.popularMeals.map((m, i) => (
                          <tr key={i}>
                            <td>{i + 1}</td>
                            <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{m.name}</td>
                            <td><span className={`badge badge-${m.category === 'lunch' ? 'ready' : m.category === 'breakfast' ? 'pending' : 'preparing'}`} style={{ textTransform: 'capitalize' }}>{m.category}</span></td>
                            <td><strong>{m.total_sold}</strong></td>
                            <td>{Number(m.avg_rating) > 0 ? `${m.avg_rating} ★` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ==================== ORDERS TAB ==================== */}
            {activeTab === 'orders' && (
              <div className="card-elevated" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <h3 style={{ fontFamily: 'var(--font-heading)', margin: 0 }}>All Orders</h3>
                  <div style={{ position: 'relative', width: 260 }}>
                    <Search size={15} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input type="text" className="form-input" style={{ paddingLeft: '2.6rem' }}
                      placeholder="Search customer or #id…" value={ordersSearch}
                      onChange={(e) => { setOrdersSearch(e.target.value); setOrdersPage(1); }} />
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Order ID</th><th>Customer</th><th>Phone</th><th>Amount</th><th>Status</th><th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((o) => {
                        const st = STATUS_STYLES[o.status?.toLowerCase()] || {};
                        return (
                          <tr key={o.id}>
                            <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>#{o.id}</td>
                            <td>{o.guest_name || o.student_name || o.user_id || '—'}</td>
                            <td>{o.phone_number}</td>
                            <td style={{ fontWeight: 600 }}>KES {Number(o.total_amount).toLocaleString()}</td>
                            <td><span className="badge" style={{ background: st.bg, color: st.color }}>{st.label}</span></td>
                            <td>{formatDate(o.created_at)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {orders.length === 0 && <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No orders match your filters.</p>}
                </div>
                <Pagination meta={ordersMeta} onPage={setOrdersPage} />
              </div>
            )}

            {/* ==================== MENU MANAGEMENT TAB ==================== */}
            {activeTab === 'menu' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.3rem' }}>Manage Menu Items</h3>
                  <button id="add-meal-btn" className="btn btn-primary" onClick={() => { setEditingMeal(null); setMealForm(EMPTY_MEAL_FORM); setShowMealForm(true); }}>
                    <Plus size={18} /> Add Meal
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
                  {meals.map((meal) => {
                    const low = meal.availability && meal.quantity_available <= LOW_STOCK_THRESHOLD;
                    return (
                      <div key={meal.id} className="card" style={{ padding: '1rem', opacity: meal.availability ? 1 : 0.6, border: low ? '1.5px solid var(--amber)' : undefined }}>
                        <img src={meal.image_url} alt={meal.name} style={{ width: '100%', height: '130px', objectFit: 'cover', borderRadius: 'var(--radius-md)', marginBottom: '0.75rem' }}
                          onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&q=60'; }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
                          <h4 style={{ fontSize: '0.95rem', fontWeight: 700, flex: 1 }}>{meal.name}</h4>
                          <span className="badge" style={{ marginLeft: '0.5rem', fontSize: '0.7rem', background: meal.category === 'lunch' ? 'var(--green-light)' : meal.category === 'breakfast' ? 'var(--amber-light)' : 'var(--teal-light)', color: meal.category === 'lunch' ? 'var(--green)' : meal.category === 'breakfast' ? 'var(--amber)' : 'var(--teal)' }}>
                            {meal.category}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                          <span style={{ fontWeight: 700, color: 'var(--accent)' }}>KES {Number(meal.price).toLocaleString()}</span>
                          <span style={{ fontSize: '0.8rem', fontWeight: low ? 700 : 400, color: meal.quantity_available <= 0 ? 'var(--red)' : low ? 'var(--amber)' : 'var(--green)' }}>
                            {meal.quantity_available <= 0 ? 'Sold out' : low ? `⚠ Only ${meal.quantity_available} left` : `${meal.quantity_available} left`}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button className="btn btn-secondary" style={{ flex: 1, padding: '0.4rem', fontSize: '0.82rem' }} onClick={() => openEdit(meal)}>
                            <Edit size={14} /> Edit
                          </button>
                          <button className={`btn ${meal.availability ? 'btn-danger' : 'btn-success'}`} style={{ flex: 1, padding: '0.4rem', fontSize: '0.82rem' }} onClick={() => handleToggleMeal(meal)}>
                            {meal.availability ? <><EyeOff size={14} /> Disable</> : <><Eye size={14} /> Enable</>}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ==================== USERS & STAFF TAB ==================== */}
            {activeTab === 'users' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.3rem' }}>Manage Users &amp; Staff</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem', marginTop: '0.2rem' }}>
                      {usersMeta.total} accounts · Create as many cashier/staff accounts as you need.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                    <select className="form-input" style={{ width: 140 }} value={usersRole} onChange={(e) => { setUsersRole(e.target.value); setUsersPage(1); }}>
                      <option value="">All roles</option>
                      <option value="student">Students</option>
                      <option value="staff">Staff</option>
                      <option value="admin">Admins</option>
                    </select>
                    <div style={{ position: 'relative', width: 220 }}>
                      <Search size={15} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                      <input type="text" className="form-input" style={{ paddingLeft: '2.6rem' }} placeholder="Search users…"
                        value={usersSearch} onChange={(e) => { setUsersSearch(e.target.value); setUsersPage(1); }} />
                    </div>
                    <button id="add-user-btn" className="btn btn-primary" onClick={openAddUser}>
                      <UserPlus size={18} /> Add User
                    </button>
                  </div>
                </div>

                <div className="card-elevated" style={{ padding: '1.5rem' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Name</th><th>ID / Email</th><th>Role</th><th>Phone</th><th>Orders</th><th>Total Spent</th><th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((u) => {
                          const rb = ROLE_BADGE[u.role] || ROLE_BADGE.student;
                          return (
                            <tr key={u.id}>
                              <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{u.name}</td>
                              <td>{u.student_id || u.email || '—'}{u.totp_enrolled && <span title="2FA enrolled" style={{ marginLeft: '0.35rem', fontSize: '0.7rem' }}>🔐</span>}</td>
                              <td><span className="badge" style={{ background: rb.background, color: rb.color, textTransform: 'capitalize' }}>{u.role}</span></td>
                              <td>{u.phone || '—'}</td>
                              <td>{u.order_count}</td>
                              <td style={{ fontWeight: 600 }}>{formatKES(u.total_spent)}</td>
                              <td>
                                <div style={{ display: 'flex', gap: '0.4rem' }}>
                                  <button className="btn btn-secondary" style={{ padding: '0.35rem 0.6rem', fontSize: '0.78rem' }} onClick={() => openEditUser(u)}>
                                    <Edit size={13} /> Edit
                                  </button>
                                  <button className="btn btn-danger" style={{ padding: '0.35rem 0.6rem', fontSize: '0.78rem' }} onClick={() => handleDeleteUser(u)}>
                                    <Trash2 size={13} /> Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {users.length === 0 && <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No user accounts match your filters.</p>}
                  </div>
                  <Pagination meta={usersMeta} onPage={setUsersPage} />
                </div>
              </div>
            )}

            {/* ==================== AUDIT TAB ==================== */}
            {activeTab === 'audit' && (
              <div className="card-elevated" style={{ padding: '1.5rem' }}>
                <h3 style={{ fontFamily: 'var(--font-heading)', marginBottom: '1rem' }}>Audit Trail</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem', marginTop: '-0.5rem', marginBottom: '1.25rem' }}>
                  Recent privileged actions — user management, menu changes, status updates and exports.
                </p>
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Details</th></tr>
                    </thead>
                    <tbody>
                      {auditLogs.map((log) => (
                        <tr key={log.id}>
                          <td style={{ whiteSpace: 'nowrap' }}>{formatDate(log.created_at)}</td>
                          <td style={{ fontWeight: 600 }}>{log.actor_name || '—'}</td>
                          <td><span className="badge" style={{ background: 'var(--accent-light)', color: 'var(--accent)', fontSize: '0.72rem' }}>{log.action}</span></td>
                          <td>{log.entity_type}{log.entity_id ? ` #${log.entity_id}` : ''}</td>
                          <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {log.details || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {auditLogs.length === 0 && <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No audit entries yet.</p>}
                </div>
              </div>
            )}

            {/* ==================== SETTINGS TAB ==================== */}
            {activeTab === 'settings' && (
              <div>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.3rem', marginBottom: '1.25rem' }}>Admin Settings</h3>
                <SettingsPanel />
              </div>
            )}
          </>
        )}
      </div>

      {/* Meal Form Modal */}
      {showMealForm && (
        <div className="modal-overlay" onClick={() => setShowMealForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>{editingMeal ? 'Edit Meal' : 'Add New Meal'}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowMealForm(false)}>✕</button>
            </div>
            <div className="modal-body">
              <form id="meal-form" onSubmit={handleSaveMeal}>
                <div className="form-group">
                  <label className="form-label">Meal Name *</label>
                  <input className="form-input" type="text" required value={mealForm.name} onChange={(e) => setMealForm({ ...mealForm, name: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <input className="form-input" type="text" value={mealForm.description} onChange={(e) => setMealForm({ ...mealForm, description: e.target.value })} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">Price (KES) *</label>
                    <input className="form-input" type="number" required value={mealForm.price} onChange={(e) => setMealForm({ ...mealForm, price: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Qty Available *</label>
                    <input className="form-input" type="number" required value={mealForm.quantity_available} onChange={(e) => setMealForm({ ...mealForm, quantity_available: e.target.value })} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Category *</label>
                  <select className="form-select form-input" value={mealForm.category} onChange={(e) => setMealForm({ ...mealForm, category: e.target.value })}>
                    <option value="breakfast">Breakfast</option>
                    <option value="lunch">Lunch</option>
                    <option value="supper">Supper</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Meal Photo</label>
                  <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                    <label className="btn btn-secondary" style={{ cursor: 'pointer', margin: 0, flexShrink: 0 }}>
                      <Upload size={15} /> {uploadingImage ? 'Uploading…' : 'Upload'}
                      <input type="file" accept="image/*" hidden onChange={handleImageUpload} disabled={uploadingImage} />
                    </label>
                    <input className="form-input" type="url" placeholder="…or paste an image URL"
                      value={mealForm.image_url} onChange={(e) => setMealForm({ ...mealForm, image_url: e.target.value })} />
                  </div>
                  {mealForm.image_url && (
                    <img src={mealForm.image_url} alt="preview" style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 'var(--radius-md)', marginTop: '0.6rem' }}
                      onError={(e) => { e.target.style.display = 'none'; }} />
                  )}
                </div>
              </form>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowMealForm(false)}>Cancel</button>
              <button form="meal-form" type="submit" className="btn btn-primary">
                {editingMeal ? 'Save Changes' : 'Add Meal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Form Modal */}
      {showUserForm && (
        <div className="modal-overlay" onClick={() => setShowUserForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>{editingUser ? `Edit ${editingUser.name}` : 'Add New User'}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowUserForm(false)}>✕</button>
            </div>
            <div className="modal-body">
              <form id="user-form" onSubmit={handleSaveUser}>
                <div className="form-group">
                  <label className="form-label">Full Name *</label>
                  <input className="form-input" type="text" required value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Role *</label>
                  <select className="form-select form-input" value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}>
                    <option value="student">Student</option>
                    <option value="staff">Staff (Cashier)</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                {userForm.role === 'student' && (
                  <div className="form-group">
                    <label className="form-label">Registration Number *</label>
                    <input
                      className="form-input"
                      type="text"
                      required
                      maxLength={15}
                      placeholder="CT207/119148/24"
                      pattern="[A-Za-z]{2,3}\d{3}/\d{6}/\d{2}"
                      title="Format: CT207/119148/24 — course code, exactly 6 digits, 2-digit year"
                      style={{ textTransform: 'uppercase' }}
                      value={userForm.student_id}
                      onChange={(e) => setUserForm({ ...userForm, student_id: e.target.value.toUpperCase().replace(/\s/g, '') })}
                    />
                    <p style={{ fontSize: '0.74rem', color: userForm.student_id && !STUDENT_REG_REGEX.test(userForm.student_id) ? 'var(--red)' : 'var(--text-muted)', marginTop: '0.3rem' }}>
                      {userForm.student_id && !STUDENT_REG_REGEX.test(userForm.student_id)
                        ? '✕ Invalid format — expected CT207/119148/24 (course code / exactly 6 digits / 2-digit year)'
                        : 'Course code / exactly 6 digits / year of study — e.g. CT207/119148/24'}
                    </p>
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">{userForm.role === 'student' ? 'Email' : 'Email *'}</label>
                  <input className="form-input" type="email" required={userForm.role !== 'student'} placeholder="name@synapsefive.com" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">Phone</label>
                    <input className="form-input" type="tel" placeholder="07xx xxx xxx" value={userForm.phone} onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{editingUser ? 'New Password' : 'Password *'}</label>
                    <input className="form-input" type="password" minLength={6} required={!editingUser} placeholder={editingUser ? 'Leave blank to keep' : 'Min. 6 characters'} value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} />
                  </div>
                </div>
                {userForm.role === 'staff' && !editingUser && (
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                    💡 Tip: You can create multiple staff accounts — each cashier signs in via Secure Access with their own credentials and 2FA.
                  </p>
                )}
              </form>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowUserForm(false)}>Cancel</button>
              <button form="user-form" type="submit" className="btn btn-primary">
                {editingUser ? 'Save Changes' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
