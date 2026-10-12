// api/auth/signup.js
import bcrypt from 'bcryptjs';
import { getUserByEmail, createUser } from '../../lib/db.js';
import { createSessionCookie } from '../../lib/session.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, email, password, consent } = req.body || {};
  const cleanName = String(name || '').trim();
  const cleanEmail = String(email || '').trim();

  if (!cleanName) return res.status(400).json({ error: 'Please enter your name.' });
  if (cleanName.length > 60) return res.status(400).json({ error: 'Please use a shorter name.' });
  if (!EMAIL_RE.test(cleanEmail) || cleanEmail.length > 120) return res.status(400).json({ error: 'Enter a valid email.' });
  if (!password || String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (String(password).length > 100) return res.status(400).json({ error: 'Password is too long.' });
  if (consent !== true) return res.status(400).json({ error: 'Please accept the Terms and Privacy Policy to create an account.' });

  let user;
  try {
    if (await getUserByEmail(cleanEmail)) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }
    const passwordHash = await bcrypt.hash(String(password), 10);
    user = await createUser({ name: cleanName, email: cleanEmail, passwordHash, consentAt: new Date().toISOString() });
  } catch (err) {
    if (err.message === 'EMAIL_TAKEN') {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }
    console.error('signup failed:', err);
    return res.status(500).json({ error: 'Something went wrong creating your account. Please try again.' });
  }

  res.setHeader('Set-Cookie', createSessionCookie(user));
  return res.status(200).json({ id: user.id, name: user.name, email: user.email });
}
