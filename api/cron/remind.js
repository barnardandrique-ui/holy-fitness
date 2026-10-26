// api/cron/remind.js
// The reminder job. An outside scheduler calls this every ~15 minutes:
//   GET https://<your-site>/api/cron/remind      with the header   Authorization: Bearer <CRON_SECRET>
// (the free Vercel plan only runs scheduled jobs once a day, which is not enough for per-person times).
import crypto from 'crypto';
import { getPushDoc, setPushDoc, delPushDoc, pushUsersList, pushUsersRemove, getState } from '../../lib/db.js';
import { runReminders, vapidConfig, webPushSender } from '../../lib/push.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ ok: false, error: 'CRON_SECRET is not set in Vercel.' });
  const given = Buffer.from(String(req.headers.authorization || '')), expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  const cfg = vapidConfig();
  if (!cfg) return res.status(503).json({ ok: false, error: 'VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not set in Vercel.' });
  try {
    const send = await webPushSender(cfg);
    const users = await pushUsersList();
    const sum = await runReminders({ users, getDoc: getPushDoc, setDoc: setPushDoc, dropUser: async uid => { await delPushDoc(uid); await pushUsersRemove(uid); }, getState, send });
    return res.status(200).json({ ok: true, ...sum });
  } catch (err) {
    console.error('reminder job failed:', err);
    return res.status(500).json({ ok: false, error: 'The reminder job failed. See the Vercel logs.' });
  }
}
