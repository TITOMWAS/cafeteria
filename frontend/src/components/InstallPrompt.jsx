import React, { useState, useEffect, useRef } from 'react';
import { Download, X } from 'lucide-react';

const DISMISS_KEY = 'synapse_install_dismissed_at';
const DISMISS_COOLDOWN_DAYS = 7;

// Smooth, first-run install experience:
// 1. Captures the native beforeinstallprompt event (Chrome/Edge/Android).
// 2. Waits a beat so the app settles in before nudging.
// 3. Slides up a quiet bottom card — dismissible, remembered for a week.
export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);
  const [installed, setInstalled] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const alreadyInstalled =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    if (alreadyInstalled) return undefined;

    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    const cooledDown = Date.now() - dismissedAt > DISMISS_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      if (cooledDown) {
        // Let the user land first — smooth, not jarring
        timerRef.current = setTimeout(() => setVisible(true), 2500);
      }
    };

    const onInstalled = () => {
      setInstalled(true);
      setVisible(false);
      clearTimeout(timerRef.current);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      clearTimeout(timerRef.current);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setVisible(false);
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  };

  if (installed || !visible || !deferredPrompt) return null;

  return (
    <div className="install-banner" role="dialog" aria-label="Install Synapse Cafeteria">
      <img src="/icons/icon-192.png" alt="" className="install-icon" />
      <div className="install-copy">
        <strong>Install Synapse Cafeteria</strong>
        <span>Full screen, faster loading and works offline.</span>
      </div>
      <button className="btn btn-primary install-btn" onClick={handleInstall}>
        <Download size={15} /> Install
      </button>
      <button className="btn btn-ghost btn-icon" onClick={handleDismiss} aria-label="Dismiss">
        <X size={17} />
      </button>
    </div>
  );
}
