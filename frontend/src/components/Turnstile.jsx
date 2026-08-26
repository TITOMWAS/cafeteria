import React, { useEffect, useRef } from 'react';

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let scriptPromise = null;
const loadTurnstile = () => {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SCRIPT_SRC;
      s.async = true;
      s.defer = true;
      s.onload = () => resolve(window.turnstile);
      s.onerror = () => reject(new Error('Failed to load Turnstile'));
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
};

/**
 * Cloudflare Turnstile challenge. Renders nothing unless VITE_TURNSTILE_SITE_KEY
 * is configured — so local dev stays untouched and the captcha appears automatically
 * in deployments where the key is set.
 */
const Turnstile = ({ onToken, onExpire }) => {
  const holderRef = useRef(null);
  const widgetIdRef = useRef(null);

  useEffect(() => {
    if (!SITE_KEY || !holderRef.current) return undefined;
    let cancelled = false;

    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !holderRef.current) return;
        widgetIdRef.current = turnstile.render(holderRef.current, {
          sitekey: SITE_KEY,
          theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
          callback: (token) => onToken?.(token),
          'expired-callback': () => onToken?.(''),
          ...(onExpire ? { 'timeout-callback': () => onExpire?.() } : {}),
        });
      })
      .catch(() => onToken?.(''));

    return () => {
      cancelled = true;
      if (widgetIdRef.current !== null && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current); } catch { /* noop */ }
        widgetIdRef.current = null;
      }
    };
  }, [onToken, onExpire]);

  if (!SITE_KEY) return null;
  return <div ref={holderRef} style={{ margin: '0.5rem 0' }} />;
};

export default Turnstile;
