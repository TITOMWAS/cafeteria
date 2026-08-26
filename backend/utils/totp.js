const crypto = require('crypto');

// RFC 6238 TOTP (SHA-1, 30s step, 6 digits) - zero external dependencies
// Compatible with Google Authenticator, Authy, Microsoft Authenticator, etc.

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;

const generateSecret = (length = 20) => {
  const bytes = crypto.randomBytes(length);
  let output = '';
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
};

const base32Decode = (str) => {
  const clean = String(str).toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
};

const hotp = (keyBuffer, counter) => {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter % 2 ** 32, 4);
  const hmac = crypto.createHmac('sha1', keyBuffer).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(bin % 10 ** DIGITS).padStart(DIGITS, '0');
};

// Accepts codes within +/- `window` time steps to tolerate clock drift
const verifyToken = (secret, token, window = 1) => {
  if (!secret || !token) return false;
  const clean = String(token).replace(/\D/g, '');
  if (clean.length !== DIGITS) return false;
  const key = base32Decode(secret);
  if (key.length === 0) return false;
  const counter = Math.floor(Date.now() / 1000 / STEP_SECONDS);
  for (let i = -window; i <= window; i++) {
    if (hotp(key, counter + i) === clean) return true;
  }
  return false;
};

// URI you paste into an authenticator app (or render as QR code)
const otpauthUri = ({ label, secret, issuer = 'Synapse Cafeteria' }) =>
  `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;

module.exports = { generateSecret, verifyToken, otpauthUri };
