// api/auth/forgot.js
// Step 1 of password reset: email a one-hour reset link.
// The response is the same whether or not the email has an account.
import crypto from 'crypto';
import { getUserByEmail, setResetToken, incrWithExpiry } from '../../lib/db.js';
import { emailConfigured, sendEmail, appUrl } from '../../lib/email.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENERIC = { ok: true, message: "If an account exists for that email, we've sent a link to reset the password. It expires in 1 hour." };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const email = String((req.body || {}).email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email.' });

  if (!emailConfigured()) {
    return res.status(503).json({ error: 'Password reset by email is not set up yet. Please contact support.' });
  }

  try {
    // One reset email per address per minute (counted for every address, so it reveals nothing).
    if ((await incrWithExpiry(`resetsent:${email}`, 60)) > 1) return res.status(200).json(GENERIC);

    const user = await getUserByEmail(email);
    if (!user) return res.status(200).json(GENERIC);

    const token = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    await setResetToken(hash, { userId: user.id }, 3600);

    const link = `${appUrl()}/?reset=${token}`;
    await sendEmail({
      to: user.email,
      subject: 'Reset your Holy Fitness password',
      text: `Hi ${user.name},\n\nUse this link to choose a new password (it expires in 1 hour):\n${link}\n\nIf you didn't ask for this, you can ignore this email — your password won't change.`,
      html: `<p>Hi ${String(user.name).replace(/[<>&]/g, '')},</p><p>Use this link to choose a new password (it expires in 1 hour):</p><p><a href="${link}">Reset my password</a></p><p>If you didn't ask for this, you can ignore this email — your password won't change.</p>`,
    });
  } catch (err) {
    console.error('forgot failed:', err);
    return res.status(500).json({ error: 'We could not send the email right now. Please try again later.' });
  }
  return res.status(200).json(GENERIC);
}
