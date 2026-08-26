import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { User, Users, ChevronRight, Clock, Utensils, LockKeyhole, Mail, KeyRound } from 'lucide-react';
import logo from '../assets/logo.jpeg';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { loginStudent, forgotPassword, resetPassword } from '../services/api';

const SESSION_SCHEDULE = [
  { icon: '🌅', label: 'Breakfast', time: '06:00 – 10:00' },
  { icon: '☀️', label: 'Lunch',     time: '12:00 – 15:00' },
  { icon: '🌙', label: 'Supper',    time: '18:00 – 21:00' },
];

const LoginModal = ({ onClose, onSuccess }) => {
  const [form, setForm] = useState({ student_id: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('login'); // login | forgot | reset
  const [identifier, setIdentifier] = useState('');
  const [resetCtx, setResetCtx] = useState(null); // { token }
  const [resetForm, setResetForm] = useState({ new_password: '', confirm_password: '' });
  const { addToast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await loginStudent(form.student_id.trim(), form.password);
      onSuccess(res.user, res.token, res.refresh_token);
    } catch (err) {
      addToast(err.message || 'Login failed. Check your credentials.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await forgotPassword(identifier.trim());
      if (res.reset_token) {
        setResetCtx({ token: res.reset_token });
        setMode('reset');
        addToast('Identity verified — set a new password below', 'success');
      } else {
        setMode('login');
        addToast(res.message || 'If that account exists, a reset link has been generated.', 'info');
      }
    } catch (err) {
      addToast(err.message || 'Could not start password reset', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    if (resetForm.new_password !== resetForm.confirm_password) {
      addToast('Passwords do not match', 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await resetPassword(resetCtx.token, resetForm.new_password);
      addToast(res.message || 'Password updated. Sign in with your new password.', 'success');
      setMode('login');
    } catch (err) {
      addToast(err.message || 'Reset failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ margin: 0 }}>
            {mode === 'login' ? 'Student Login' : mode === 'forgot' ? 'Forgot Password' : 'Set New Password'}
          </h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {mode === 'login' && (
            <form id="login-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Registration Number</label>
                <input className="form-input" type="text" placeholder="CT207/119148/24" autoComplete="username"
                  style={{ textTransform: 'uppercase' }}
                  value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value.toUpperCase() })} required />
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <input className="form-input" type="password" placeholder="Enter your password" autoComplete="current-password"
                  value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
              </div>
              <button type="button" className="btn btn-ghost" style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem', color: 'var(--text-muted)' }}
                onClick={() => setMode('forgot')}>
                <KeyRound size={13} /> Forgot password?
              </button>
            </form>
          )}

          {mode === 'forgot' && (
            <form id="forgot-form" onSubmit={handleForgot}>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                Enter your Student ID or email to verify your account and set a new password.
              </p>
              <div className="form-group">
                <label className="form-label">Student ID or Email</label>
                <input className="form-input" type="text" placeholder="CT207/119148/24 or you@example.com"
                  value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
              </div>
            </form>
          )}

          {mode === 'reset' && (
            <form id="reset-form" onSubmit={handleReset}>
              <div className="form-group">
                <label className="form-label">New Password</label>
                <input className="form-input" type="password" minLength={6} autoComplete="new-password"
                  value={resetForm.new_password} onChange={(e) => setResetForm({ ...resetForm, new_password: e.target.value })} required />
              </div>
              <div className="form-group">
                <label className="form-label">Confirm New Password</label>
                <input className="form-input" type="password" minLength={6} autoComplete="new-password"
                  value={resetForm.confirm_password} onChange={(e) => setResetForm({ ...resetForm, confirm_password: e.target.value })} required />
              </div>
            </form>
          )}
        </div>
        <div className="modal-footer">
          {mode !== 'login' && (
            <button className="btn btn-secondary" onClick={() => setMode('login')}>Back to Login</button>
          )}
          {mode === 'login' && (
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          )}
          {mode === 'login' && (
            <button form="login-form" type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          )}
          {mode === 'forgot' && (
            <button form="forgot-form" type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Verifying…' : 'Verify Account'}
            </button>
          )}
          {mode === 'reset' && (
            <button form="reset-form" type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving…' : 'Update Password'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const Landing = () => {
  const { login, loginAsGuest } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [showStudentLogin, setShowStudentLogin] = useState(false);

  const handleLoginSuccess = (user, token) => {
    login(user, token);
    setShowStudentLogin(false);
    addToast(`Welcome back, ${user.name.split(' ')[0]}.`, 'success');
    navigate(user.role === 'student' ? '/student' : '/');
  };

  const handleGuest = () => {
    loginAsGuest();
    navigate('/guest');
  };

  return (
    <div>
      {/* Hero */}
      <section className="landing-hero">
        <div className="hero-badge">
          <Utensils size={13} />
          Campus dining, reimagined
        </div>
        <h1 className="hero-title">
          Skip the queue.<br />
          <span className="text-accent">Order your meal.</span>
        </h1>
        <p className="hero-subtitle">
          Browse today&apos;s menu, pay with M-Pesa in seconds and collect your meal
          when it&apos;s ready — no waiting, no cash, no hassle.
        </p>

        {/* Role Cards */}
        <div className="role-cards-grid">
          <div id="student-card" className="role-card" onClick={() => setShowStudentLogin(true)}>
            <div className="role-icon-wrapper role-icon-student">
              <User size={28} color="var(--accent)" />
            </div>
            <h3>Student</h3>
            <p>Order with your student account, track your history and reorder favourites in one tap.</p>
            <button className="btn btn-primary btn-full">
              Student Login <ChevronRight size={16} />
            </button>
          </div>

          <div id="guest-card" className="role-card" onClick={handleGuest}>
            <div className="role-icon-wrapper role-icon-guest">
              <Users size={28} color="var(--amber)" />
            </div>
            <h3>Guest</h3>
            <p>Visiting campus? Browse the menu and place an order — no account required.</p>
            <button className="btn btn-secondary btn-full">
              Continue as Guest <ChevronRight size={16} />
            </button>
          </div>

          <div id="secure-card" className="role-card" onClick={() => navigate('/secure-access')}>
            <div className="role-icon-wrapper role-icon-secure">
              <LockKeyhole size={26} color="var(--teal)" />
            </div>
            <h3>Staff &amp; Management</h3>
            <p>Cashier console and management dashboards — secured behind two-factor authentication.</p>
            <button className="btn btn-secondary btn-full">
              Secure Access <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>

      {/* Serving Schedule */}
      <section className="container" style={{ paddingBottom: '4rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.25rem' }}>
          <div className="eyebrow" style={{ marginBottom: '0.5rem' }}>Service Times</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 600 }}>
            Fresh, exactly when you need it
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.4rem' }}>
            Meals are served strictly within their scheduled windows.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', maxWidth: 820, margin: '0 auto' }}>
          {SESSION_SCHEDULE.map((s) => (
            <div key={s.label} className="card" style={{ padding: '1.6rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem' }}>
              <div style={{ fontSize: '2.2rem' }}>{s.icon}</div>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.05rem' }}>{s.label}</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-muted)', fontSize: '0.84rem', fontWeight: 500 }}>
                <Clock size={13} /> {s.time}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--border)', padding: '2.5rem 1.5rem', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
          <img src={logo} alt="" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover' }} />
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1rem' }}>Synapse Cafeteria</span>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          A Synapse Five product · Secure payments by PayHero (M-Pesa)
        </p>
        <p style={{ marginTop: '0.6rem', fontSize: '0.82rem' }}>
          <a href="mailto:support@synapsefive.com" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <Mail size={14} /> support@synapsefive.com
          </a>
        </p>
        <p style={{ marginTop: '0.6rem', fontSize: '0.78rem' }}>
          <Link to="/secure-access" style={{ color: 'var(--text-muted)' }}>Staff access</Link>
        </p>
        <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          © 2026 SynapseFive. All rights reserved.
        </p>
      </footer>

      {/* Student Login Modal */}
      {showStudentLogin && (
        <LoginModal
          onClose={() => setShowStudentLogin(false)}
          onSuccess={handleLoginSuccess}
        />
      )}
    </div>
  );
};

export default Landing;
