// lib/session.js
// ---------------------------------------------------------------------------
// Cookie-based sessions using a signed JWT.
//
// Why this instead of localStorage: the token lives in an HttpOnly cookie,
// meaning client-side JavaScript can never read or tamper with it (unlike
// localStorage, which any script on the page — including a malicious one —
// can read). The browser sends it automatically on every request, it
// survives closing the tab/browser, and it naturally expires after 30 days
// or immediately on logout. This is what "stay logged in until I explicitly
// log out" should actually be built on.
// ---------------------------------------------------------------------------

import jwt from 'jsonwebtoken';

const COOKIE_NAME = 'hf_session';
const THIRTY_DAYS = 30 * 24 * 60 * 60; // seconds

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      'SESSION_SECRET is not set. Add it to your .env file (see .env.example).'
    );
  }
  return secret;
}

export function createSessionCookie(user) {
  const token = jwt.sign(
    { sub: user.id, name: user.name, email: user.email },
    getSecret(),
    { expiresIn: THIRTY_DAYS }
  );
  const secure = process.env.NODE_ENV === 'production' ? ' Secure;' : '';
  return `${COOKIE_NAME}=${token}; HttpOnly;${secure} Path=/; Max-Age=${THIRTY_DAYS}; SameSite=Lax`;
}

export function clearSessionCookie() {
  const secure = process.env.NODE_ENV === 'production' ? ' Secure;' : '';
  return `${COOKIE_NAME}=; HttpOnly;${secure} Path=/; Max-Age=0; SameSite=Lax`;
}

export function getSessionFromRequest(req) {
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader
    .split(';')
    .map(c => c.trim())
    .find(c => c.startsWith(`${COOKIE_NAME}=`));
  if (!match) return null;

  const token = match.slice(COOKIE_NAME.length + 1);
  try {
    return jwt.verify(token, getSecret());
  } catch {
    return null;
  }
}
