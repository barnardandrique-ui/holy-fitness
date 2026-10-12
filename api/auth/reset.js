// api/auth/reset.js
// Step 2 of password reset: set a new password using the emailed token.
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getResetToken, deleteResetToken, getUserById, updateUser, clearKey } from '../../lib/db.js';
import { clearSessionCookie } from '../../lib/session.js';

const BAD = { error: 'This reset link is invalid or has expired. Please request a new one.' };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token, password } = req.body || {};
  if (!password || String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (String(password).length > 100) return res.status(400).json({ error: 'Password is too long.' });
  if (!/^[a-f0-9]{64}$/.test(String(token || ''))) return res.status(400).json(BAD);

  try {
    const hash = crypto.createHash('sha256').update(String(token)).digest('hex');
    const rec = await getResetToken(hash);
    if (!rec) return res.status(400).json(BAD);
    const user = await getUserById(rec.userId);
    if (!user) return res.status(400).json(BAD);

    const passwordHash = await bcrypt.hash(String(password), 10);
    // Bumping the session version signs the account out on every device.
    await updateUser(user.id, { passwordHash, sv: (user.sv || 0) + 1 });
    await deleteResetToken(hash);
    await clearKey(`loginfail:${user.email}`);
  } catch (err) {
    console.error('reset failed:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }

  res.setHeader('Set-Cookie', clearSessionCookie());
  return res.status(200).json({ ok: true });
}
