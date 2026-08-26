/**
 * Cloudflare Turnstile server-side verification.
 * - TURNSTILE_SECRET_KEY unset  -> verification skipped (local dev / simulated mode).
 * - Set                         -> every protected auth call must carry a valid
 *                                  `turnstile_token` from the widget, verified at
 *                                  https://challenges.cloudflare.com/turnstile/v0/siteverify
 */
const SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || '';
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const turnstileEnabled = () => Boolean(SECRET_KEY);

/**
 * Returns null when the request passes (or when Turnstile is not configured),
 * otherwise a human-readable error string.
 */
const verifyTurnstile = async (req) => {
  if (!SECRET_KEY) return null;

  const token = String(req.body?.turnstile_token || '').trim();
  if (!token) return 'Captcha verification missing — please complete the challenge';

  try {
    const params = new URLSearchParams({
      secret: SECRET_KEY,
      response: token,
      // Best-effort client IP (set automatically when behind the Cloudflare proxy)
      ...(req.ip ? { remoteip: req.ip } : {}),
    });
    const res = await fetch(VERIFY_URL, { method: 'POST', body: params });
    const data = await res.json();
    if (data.success) return null;
    return 'Captcha verification failed — please try again';
  } catch (error) {
    console.error('Turnstile verify error:', error.message);
    // Fail closed: never let a verification outage open the floodgates
    return 'Captcha service unavailable — please try again';
  }
};

module.exports = { turnstileEnabled, verifyTurnstile };
