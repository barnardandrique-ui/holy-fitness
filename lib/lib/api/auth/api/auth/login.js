// api/auth/login.js
import bcrypt from 'bcryptjs';
import { getUserByEmail } from '../../lib/db.js';
import { createSessionCookie } from '../../lib/session.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password } = req.body || {};
  const user = email ? await getUserByEmail(email) : null;

  // Same error for "no such user" and "wrong password" — don't leak which one.
  if (!user) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }

  const ok = await bcrypt.compare(String(password || ''), user.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }

  res.setHeader('Set-Cookie', createSessionCookie(user));
  return res.status(200).json({ id: user.id, name: user.name, email: user.email });
}
