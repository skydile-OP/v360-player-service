const crypto = require('crypto');

// Server-side session store (In-memory store with TTL and automatic purging)
const sessions = new Map();

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Timing-safe string comparison to prevent timing attacks.
 * @param {string} a 
 * @param {string} b 
 * @returns {boolean}
 */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Creates a new cryptographically random session token for an authenticated user.
 * @param {string} user 
 * @returns {string} Session token
 */
function createSession(user = 'admin') {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  sessions.set(token, {
    user,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS
  });
  return token;
}

/**
 * Validates a session token. Returns session details if valid, null otherwise.
 * Automatically purges expired sessions.
 * @param {string} token 
 * @returns {object|null}
 */
function getSession(token) {
  if (!token || typeof token !== 'string') return null;
  const session = sessions.get(token);
  if (!session) return null;

  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }

  return session;
}

/**
 * Revokes/deletes a session token server-side (for logout).
 * @param {string} token 
 */
function revokeSession(token) {
  if (token && typeof token === 'string') {
    sessions.delete(token);
  }
}

/**
 * Periodic cleanup of expired sessions
 */
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (now > session.expiresAt) {
      sessions.delete(token);
    }
  }
}, 15 * 60 * 1000).unref();

/**
 * Parses cookies from Cookie header string
 * @param {string} cookieHeader 
 * @returns {object} Key-value map of cookies
 */
function parseCookies(cookieHeader) {
  const list = {};
  if (!cookieHeader || typeof cookieHeader !== 'string') return list;

  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    if (parts.length >= 2) {
      const name = parts.shift().trim();
      const value = parts.join('=').trim();
      if (name) list[name] = decodeURIComponent(value);
    }
  });

  return list;
}

module.exports = {
  createSession,
  getSession,
  revokeSession,
  safeEqual,
  parseCookies,
  SESSION_TTL_MS
};
