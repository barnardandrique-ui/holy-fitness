// lib/auth.js
// Verifies the session cookie AND that the account still exists and the session
// has not been revoked (password reset / deletion bumps or removes the user).
import { getSessionFromRequest, clearSessionCookie } from './session.js';
import { getUserById } from './db.js';

// Returns the user, or sends a 401/500 response and returns null.
export async function requireUser(req, res) {
  const session = getSessionFromRequest(req);
  if (!session) {
    res.status(401).json({ error: 'Please log in.' });
    return null;
  }
  let user;
  try {
    user = await getUserById(session.sub);
  } catch (err) {
    console.error('requireUser lookup failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
    return null;
  }
  if (!user || (user.sv || 0) !== (session.sv || 0)) {
    res.setHeader('Set-Cookie', clearSessionCookie());
    res.status(401).json({ error: 'Your session has ended. Please log in again.' });
    return null;
  }
  return user;
}
