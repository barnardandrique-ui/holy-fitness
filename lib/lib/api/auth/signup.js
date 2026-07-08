// api/auth/signup.js
import bcrypt from 'bcryptjs';
import { getUserByEmail, createUser } from '../../lib/db.js';
import { createSessionCookie } from '../../lib/session.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, email, password } = req.body || {};

  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Please enter your name.' });
  }
  if (!email || !String(email).includes('@')) {
    return res.status(400).json({ error: 'Enter a valid email.' });
  }
  if (!password || String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const existing = await getUserByEmail(email);
  if (existing) {
    return res.status(409).json({ error: 'An account with that email already exists.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await createUser({
    name: String(name).trim(),
    email: String(email).trim(),
    passwordHash,
  });

  res.setHeader('Set-Cookie', createSessionCookie(user));
  return res.status(200).json({ id: user.id, name: user.name, email: user.email });
}
