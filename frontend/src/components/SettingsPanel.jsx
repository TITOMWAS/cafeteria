import React, { useState } from 'react';
import { Save, Moon, Sun, KeyRound, UserCog } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { updateProfile, changePassword } from '../services/api';

const SettingsPanel = () => {
  const { user, updateUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { addToast } = useToast();

  const [profileForm, setProfileForm] = useState({ name: user?.name || '', phone: user?.phone || '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [savingPw, setSavingPw] = useState(false);

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await updateProfile({ name: profileForm.name, phone: profileForm.phone, theme_preference: theme });
      updateUser(res.data);
      addToast('Settings saved successfully', 'success');
    } catch (err) {
      addToast(err.message || 'Failed to save settings', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordSave = async (e) => {
    e.preventDefault();
    if (pwForm.new_password !== pwForm.confirm_password) {
      addToast('New passwords do not match', 'error');
      return;
    }
    setSavingPw(true);
    try {
      await changePassword(pwForm.current_password, pwForm.new_password);
      addToast('Password updated successfully', 'success');
      setPwForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (err) {
      addToast(err.message || 'Failed to change password', 'error');
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
      {/* Account / profile preferences */}
      <div className="card-elevated" style={{ padding: '1.5rem' }}>
        <h3 style={{ fontFamily: 'var(--font-heading)', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <UserCog size={18} /> Account Settings
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: '1.25rem' }}>
          Signed in as <strong style={{ color: 'var(--text-secondary)' }}>{user?.email || user?.student_id || user?.name}</strong>
        </p>
        <form onSubmit={handleProfileSave}>
          <div className="form-group">
            <label className="form-label">Display Name</label>
            <input className="form-input" type="text" value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Phone Number</label>
            <input className="form-input" type="tel" placeholder="e.g. 0712345678" value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Appearance</label>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button type="button" className={`btn ${theme === 'dark' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1 }} onClick={() => theme !== 'dark' && toggleTheme()}>
                <Moon size={15} /> Dark
              </button>
              <button type="button" className={`btn ${theme === 'light' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1 }} onClick={() => theme !== 'light' && toggleTheme()}>
                <Sun size={15} /> Light
              </button>
            </div>
          </div>
          <button id="save-settings-btn" type="submit" className="btn btn-primary btn-full" disabled={savingProfile} style={{ marginTop: '0.5rem' }}>
            <Save size={16} />
            {savingProfile ? 'Saving…' : 'Save Changes'}
          </button>
        </form>
      </div>

      {/* Password */}
      <div className="card-elevated" style={{ padding: '1.5rem' }}>
        <h3 style={{ fontFamily: 'var(--font-heading)', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <KeyRound size={18} /> Security
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: '1.25rem' }}>
          Update the password you use to sign in.
        </p>
        <form onSubmit={handlePasswordSave}>
          <div className="form-group">
            <label className="form-label">Current Password</label>
            <input className="form-input" type="password" autoComplete="current-password" required value={pwForm.current_password} onChange={(e) => setPwForm({ ...pwForm, current_password: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">New Password</label>
            <input className="form-input" type="password" autoComplete="new-password" minLength={6} required value={pwForm.new_password} onChange={(e) => setPwForm({ ...pwForm, new_password: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Confirm New Password</label>
            <input className="form-input" type="password" autoComplete="new-password" minLength={6} required value={pwForm.confirm_password} onChange={(e) => setPwForm({ ...pwForm, confirm_password: e.target.value })} />
          </div>
          <button id="change-password-btn" type="submit" className="btn btn-primary btn-full" disabled={savingPw} style={{ marginTop: '0.5rem' }}>
            <KeyRound size={16} />
            {savingPw ? 'Updating…' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default SettingsPanel;
