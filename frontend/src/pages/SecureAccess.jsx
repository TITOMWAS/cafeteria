import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ShieldCheck, KeyRound, Lock, Mail, ArrowLeft, Smartphone } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { loginStaff, setupTotp } from '../services/api';
import Turnstile from '../components/Turnstile';

const SecureAccess = () => {
  const navigate = useNavigate();
  const { user, loading, login } = useAuth();
  const { addToast } = useToast();

  const [form, setForm] = useState({ email: '', password: '', token: '' });
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const [enrollment, setEnrollment] = useState(null); // { otpauth_uri }
  const [showEnrollForm, setShowEnrollForm] = useState(false);
  const [needsOtpSetup, setNeedsOtpSetup] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaKey, setCaptchaKey] = useState(0); // forces a fresh widget after each attempt

  useEffect(() => {
    if (!loading && user && ['staff', 'admin'].includes(user.role)) {
      navigate(user.role === 'admin' ? '/admin' : '/cashier', { replace: true });
    }
  }, [user, loading, navigate]);

  // Sign in: staff use email + password only; management additionally needs the
  // 6-digit authenticator code (and must enrol via "Set up 2FA" before first login).
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoadingSubmit(true);
    try {
      const res = await loginStaff(form.email.trim(), form.password, form.token.trim(), captchaToken || undefined);
      login(res.user, res.token);
      sessionStorage.removeItem('cafeteria_staff_credentials');
      addToast(`Welcome back, ${res.user.name}!`, 'success');
      navigate(res.user.role === 'admin' ? '/admin' : '/cashier');
    } catch (err) {
      if (err.code === 'TOTP_ENROLLMENT_REQUIRED') {
        setNeedsOtpSetup(true);
        addToast('Management access is protected by 2FA — set it up below to continue.', 'error');
      } else {
        addToast(err.message || 'Access denied. Check your credentials.', 'error');
      }
    } finally {
      setLoadingSubmit(false);
      setCaptchaToken('');
      setCaptchaKey((k) => k + 1); // re-render challenge for the next attempt
    }
  };

  // First-time enrollment: generate secret + QR code
  const handleSetup = async () => {
    setLoadingSubmit(true);
    try {
      const res = await setupTotp(form.email.trim(), form.password, captchaToken || undefined);
      setEnrollment(res.data);
      setShowEnrollForm(true);
      setNeedsOtpSetup(false);
      addToast('Scan the QR code with your authenticator app', 'info');
    } catch (err) {
      addToast(err.message || 'Could not start 2FA setup', 'error');
    } finally {
      setLoadingSubmit(false);
      setCaptchaToken('');
      setCaptchaKey((k) => k + 1);
    }
  };

  return (
    <div className="secure-access-page">
      <div className="card secure-card">
        <div className="secure-icon">
          <ShieldCheck size={34} />
        </div>
        <h1 className="secure-title">Synapse Cafeteria</h1>
        <p className="secure-subtitle">
          Cashier staff sign in with your work email and password.
          Management additionally requires a 6-digit authenticator code — the dashboard
          is never accessible without it.
        </p>

        {!showEnrollForm ? (
          <form onSubmit={handleLogin} className="secure-form">
            <div className="form-group">
              <label className="form-label" htmlFor="sa-email"><Mail size={13} /> Work Email</label>
              <input id="sa-email" className="form-input" type="email" autoComplete="username"
                placeholder="e.g. admin@cafeteria.ac.ke"
                value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="sa-password"><Lock size={13} /> Password</label>
              <input id="sa-password" className="form-input" type="password" autoComplete="current-password"
                placeholder="Enter your password"
                value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="sa-token"><KeyRound size={13} /> Authenticator Code <span style={{ fontWeight: 400 }}>(management only)</span></label>
              <input id="sa-token" className="form-input secure-token-input" type="text" inputMode="numeric"
                pattern="[0-9]*" maxLength={6} autoComplete="one-time-code"
                placeholder="000000"
                value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value.replace(/\D/g, '') })} />
              {needsOtpSetup && (
                <span className="secure-hint" style={{ color: 'var(--danger, #c0392b)' }}>
                  This account needs 2FA enrolment first — press “Set up 2FA” below.
                </span>
              )}
            </div>

            <Turnstile key={captchaKey} onToken={setCaptchaToken} />

            <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loadingSubmit}>
              {loadingSubmit ? 'Verifying...' : 'Unlock Dashboard'}
            </button>
            <button type="button" className="btn btn-secondary btn-full" onClick={handleSetup} disabled={loadingSubmit}>
              <Smartphone size={16} /> Set up 2FA
            </button>
          </form>
        ) : (
          <div className="enroll-box">
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.05rem', marginBottom: '0.75rem' }}>
              Pair your authenticator app
            </h2>
            <ol className="enroll-steps">
              <li>Open Google Authenticator / Authy / Microsoft Authenticator</li>
              <li>Scan this QR code (or enter the key manually)</li>
              <li>Sign in with the 6-digit code it shows</li>
            </ol>
            {enrollment?.otpauth_uri && (
              <div className="qr-wrapper">
                <QRCodeSVG value={enrollment.otpauth_uri} size={180} level="M"
                  bgColor="#ffffff" fgColor="#000000" />
              </div>
            )}
            <button className="btn btn-primary btn-full btn-lg" onClick={() => setShowEnrollForm(false)}>
              <KeyRound size={16} /> I&apos;ve scanned it — continue to sign in
            </button>
          </div>
        )}

        <Link to="/" className="secure-back">
          <ArrowLeft size={14} /> Back to campus portal
        </Link>
      </div>
    </div>
  );
};

export default SecureAccess;
