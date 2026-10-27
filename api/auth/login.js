// api/auth/login.js
import bcrypt from 'bcryptjs';
import { getUserByEmail, getCount, incrWithExpiry, clearKey, updateUser } from '../../lib/db.js';
import { createSessionCookie } from '../../lib/session.js';

const MAX_FAILS = 8;          // wrong passwords allowed...
const WINDOW_SECONDS = 15 * 60; // ...per 15 minutes, per email

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) return res.status(401).json({ error: 'Incorrect email or password.' });
  const failKey = `loginfail:${cleanEmail}`;

  let user;
  try {
    if ((await getCount(failKey)) >= MAX_FAILS) {
      return res.status(429).json({ error: 'Too many attempts. Please wait 15 minutes, or reset your password.' });
    }
    user = await getUserByEmail(cleanEmail);
    const ok = user ? await bcrypt.compare(String(password || ''), user.passwordHash) : false;
    if (!ok) {
      await incrWithExpiry(failKey, WINDOW_SECONDS);
      // Same message for "no such user" and "wrong password" — don't leak which one.
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }
    await clearKey(failKey);
    try { await updateUser(user.id, { lastLoginAt: new Date().toISOString() }); } catch { /* never block a login over this */ }
  } catch (err) {
    console.error('login failed:', err);
    return res.status(500).json({ error: 'Something went wrong logging in. Please try again.' });
  }

  res.setHeader('Set-Cookie', createSessionCookie(user));
  return res.status(200).json({ id: user.id, name: user.name, email: user.email });
}
