import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Search, Heart, Undo2 } from 'lucide-react';
import MealCard from '../components/MealCard';
import CartDrawer from '../components/CartDrawer';
import { fetchMeals, fetchFavourites, addFavourite, removeFavourite, fetchMyOrders, fetchMyCarryovers } from '../services/api';
import { getActiveSession, SESSION_SCHEDULE } from '../utils/session';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

const MealPortal = ({ roleLabel = 'Student' }) => {
  const { user } = useAuth();
  const { setIsCartOpen, addToCart } = useCart();
  const { addToast } = useToast();

  const currentSession = getActiveSession();
  const [activeTab, setActiveTab] = useState(currentSession !== 'closed' ? currentSession : 'lunch');
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [backendOnline, setBackendOnline] = useState(true);
  const [favourites, setFavourites] = useState([]);
  const [showFavouritesOnly, setShowFavouritesOnly] = useState(false);
  const [buyAgain, setBuyAgain] = useState([]);
  const [carryoverNotice, setCarryoverNotice] = useState(null);

  const loadMeals = useCallback(async (category) => {
    setLoading(true);
    try {
      const res = await fetchMeals(category);
      setMeals(res.data || []);
      setBackendOnline(true);
    } catch (err) {
      // Fall back to mock data if backend is offline
      setBackendOnline(false);
      const { MEALS } = await import('../mockData.js');
      setMeals(MEALS.filter((m) => m.category === category));
      addToast('Using demo data — backend offline', 'info');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadMeals(activeTab); }, [activeTab, loadMeals]);

  // Logged-in students: favourites, buy-again suggestions and missed-meal notices
  useEffect(() => {
    if (user?.role !== 'student') return;
    fetchFavourites().then((res) => setFavourites((res.data || []).map((m) => m.id))).catch(() => {});
    fetchMyOrders().then((res) => {
      // Most recent distinct meals across recent orders
      const seen = new Set();
      const suggestions = [];
      for (const order of res.data || []) {
        for (const item of order.items || []) {
          if (!seen.has(item.meal_id)) {
            seen.add(item.meal_id);
            suggestions.push({ meal_id: item.meal_id, name: item.name || item.meal_name });
          }
        }
      }
      setBuyAgain(suggestions.slice(0, 6));
    }).catch(() => {});
    fetchMyCarryovers().then((res) => {
      const pending = (res.data || []).find((c) => c.status === 'pending');
      setCarryoverNotice(pending || null);
    }).catch(() => {});
  }, [user?.role]);

  const toggleFavourite = async (meal) => {
    try {
      if (favourites.includes(meal.id)) {
        await removeFavourite(meal.id);
        setFavourites((prev) => prev.filter((id) => id !== meal.id));
      } else {
        await addFavourite(meal.id);
        setFavourites((prev) => [...prev, meal.id]);
      }
    } catch {
      addToast('Could not update favourites', 'error');
    }
  };

  const filtered = meals.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    (m.description || '').toLowerCase().includes(search.toLowerCase())
  ).filter((m) => !showFavouritesOnly || favourites.includes(m.id));

  const isTabLocked = (session) => {
    if (currentSession === 'closed') return false;
    return session !== currentSession;
  };

  return (
    <div className="page-padding">
      <div className="container">
        {/* Missed-meal carryover notice */}
        {carryoverNotice && (
          <div className="card-elevated" style={{ padding: '1rem 1.25rem', marginBottom: '1.25rem', borderLeft: '4px solid var(--amber)', display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
            <Undo2 size={22} color="var(--amber)" />
            <div style={{ flex: 1, minWidth: 220 }}>
              <strong style={{ fontSize: '0.9rem' }}>You have a missed meal to collect</strong>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {(carryoverNotice.items || []).map((i) => `${i.quantity}× ${i.name}`).join(', ')} — missed{' '}
                {carryoverNotice.original_session}. Show code <strong>{carryoverNotice.code}</strong> at the counter during the next serving window.
              </p>
            </div>
          </div>
        )}

        {/* Page Header */}
        <div className="session-status-bar">
          <div className="session-info-text">
            <h2>
              {currentSession === 'closed' ? '🔒 Cafeteria Closed' : `Today's ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Menu`}
            </h2>
            <p>
              {currentSession === 'closed'
                ? 'Next serving session starts at 06:00 AM'
                : `Active Session: ${currentSession.toUpperCase()} • ${SESSION_SCHEDULE.find(s => s.id === currentSession)?.time}`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {!backendOnline && (
              <span style={{ fontSize: '0.75rem', color: 'var(--amber)', background: 'var(--amber-light)', padding: '0.2rem 0.6rem', borderRadius: '100px', border: '1px solid rgba(245,158,11,0.3)' }}>
                Demo Mode
              </span>
            )}
            <button className="btn btn-ghost btn-icon" onClick={() => loadMeals(activeTab)} title="Refresh">
              <RefreshCw size={18} />
            </button>
          </div>
        </div>

        {/* Buy again */}
        {buyAgain.length > 0 && (
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.55rem' }}>
              ⚡ Buy it again
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {buyAgain.map((item) => (
                <button key={item.meal_id} className="btn btn-secondary" style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem' }}
                  title={`Add ${item.name} to cart`}
                  onClick={async () => {
                    // Resolve the live meal record for price/stock info
                    let meal = meals.find((m) => m.id === item.meal_id);
                    if (!meal) {
                      try {
                        const res = await fetchMeals();
                        meal = (res.data || []).find((m) => m.id === item.meal_id);
                      } catch { /* ignore */ }
                    }
                    if (meal) addToCart(meal);
                  }}>
                  <PlusIcon /> {item.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Search + favourites filter */}
        <div style={{ position: 'relative', marginBottom: '1.5rem', maxWidth: 400 }}>
          <Search size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="form-input"
            style={{ paddingLeft: '2.75rem' }}
            placeholder="Search meals..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Session Tabs (+ Favourites quick-filter for students) */}
        <div className="session-tabs" style={{ marginBottom: '2rem' }}>
          {SESSION_SCHEDULE.map((s) => (
            <button
              key={s.id}
              id={`tab-${s.id}`}
              className={`session-tab ${activeTab === s.id ? 'active' : ''} ${isTabLocked(s.id) ? 'locked' : ''}`}
              onClick={() => !isTabLocked(s.id) && setActiveTab(s.id)}
              title={isTabLocked(s.id) ? `${s.label} session is not active right now` : s.label}
            >
              <span>{s.icon}</span>
              {s.label}
              {s.id === currentSession && <span className="session-dot" />}
            </button>
          ))}
          {user?.role === 'student' && (
            <button
              id="tab-favourites"
              className={`session-tab ${showFavouritesOnly ? 'active' : ''}`}
              style={showFavouritesOnly ? { borderColor: '#f43f5e', color: '#f43f5e' } : {}}
              onClick={() => setShowFavouritesOnly((v) => !v)}
              title="Show only your favourites"
            >
              <Heart size={14} fill={showFavouritesOnly ? '#f43f5e' : 'none'} /> Favourites
            </button>
          )}
        </div>

        {/* Meal Grid */}
        {loading ? (
          <div className="loading-spinner"><div className="spinner" /></div>
        ) : filtered.length > 0 ? (
          <div className="meal-grid">
            {filtered.map((meal) => (
              <MealCard
                key={meal.id}
                meal={meal}
                isFavourite={favourites.includes(meal.id)}
                onToggleFavourite={user?.role === 'student' ? toggleFavourite : undefined}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">🍽️</div>
            <h3>No meals found</h3>
            <p>{search ? 'Try a different search term.' : showFavouritesOnly ? 'No favourites in this session yet — tap the ♥ on any meal.' : 'No meals available for this session.'}</p>
          </div>
        )}
      </div>
      <CartDrawer />
    </div>
  );
};

// Tiny inline plus icon used by the "buy again" chips
const PlusIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{ marginRight: '0.35rem' }}>
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export default MealPortal;
