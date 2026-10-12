// api/account/delete.js
// Permanently deletes the account and all stored data. Requires the password.
import bcrypt from 'bcryptjs';
import { requireUser } from '../../lib/auth.js';
import { deleteUser } from '../../lib/db.js';
import { clearSessionCookie } from '../../lib/session.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const user = await requireUser(req, res);
  if (!user) return;

  const password = String((req.body || {}).password || '');
  try {
    if (!password || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(403).json({ error: 'That password is not correct.' });
    }
    await deleteUser(user);
  } catch (err) {
    console.error('delete failed:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
  res.setHeader('Set-Cookie', clearSessionCookie());
  return res.status(200).json({ ok: true });
}
