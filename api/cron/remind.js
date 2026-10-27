// api/cron/remind.js
// The reminder job. An outside scheduler calls this every ~15 minutes:
//   GET https://<your-site>/api/cron/remind      with the header   Authorization: Bearer <CRON_SECRET>
// (the free Vercel plan only runs scheduled jobs once a day, which is not enough for per-person times).
// Add  ?check=1  to see whether the settings are right, without sending anything.
import crypto from 'crypto';
import { getPushDoc, setPushDoc, delPushDoc, pushUsersList, pushUsersRemove, getState } from '../../lib/db.js';
import { runReminders, vapidConfig, vapidProblems, webPushSender, redact } from '../../lib/push.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ ok: false, error: 'CRON_SECRET is not set in Vercel.' });
  const given = Buffer.from(String(req.headers.authorization || '')), expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  const cfg = vapidConfig();
  const problems = vapidProblems(cfg);
  let check = false; try { check = new URL(req.url || '/', 'http://x').searchParams.get('check') !== null; } catch { /* no url */ }
  if (check) return res.status(200).json({ ok: problems.length === 0, problems, usersWithReminders: (await pushUsersList()).length });
  if (problems.length) return res.status(503).json({ ok: false, error: 'The reminder settings need fixing.', problems });
  try {
    const send = await webPushSender(cfg);
    const users = await pushUsersList();
    const sum = await runReminders({ users, getDoc: getPushDoc, setDoc: setPushDoc, dropUser: async uid => { await delPushDoc(uid); await pushUsersRemove(uid); }, getState, send });
    return res.status(200).json({ ok: true, ...sum });
  } catch (err) {
    console.error('reminder job failed:', err);
    return res.status(500).json({ ok: false, error: 'The reminder job failed: ' + redact(err && err.message) });
  }
}
