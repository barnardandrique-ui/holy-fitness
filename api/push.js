// api/push.js
// Reminders (web push) for the signed-in user.
//   GET                                   -> { configured, publicKey, prefs, devices }
//   POST { action: 'subscribe', subscription, prefs }   turn reminders on for this device
//   POST { action: 'prefs', prefs }                     change times / which reminders
//   POST { action: 'unsubscribe', deviceId | all }      turn reminders off
//   POST { action: 'test' }                             send a test notification
//   POST { action: 'milestone', kind, exclude }         tell the person's OTHER devices about a milestone
import { requireUser } from '../lib/auth.js';
import { getPushDoc, setPushDoc, delPushDoc, pushUsersAdd, pushUsersRemove, incrWithExpiry } from '../lib/db.js';
import { validateSubscription, validatePrefs, deviceId, DEFAULT_PREFS, MAX_DEVICES, vapidConfig, buildMessage, isMilestoneKind, sendToDevices, webPushSender } from '../lib/push.js';

const view = doc => ({ prefs: doc ? doc.prefs : DEFAULT_PREFS(), devices: doc ? doc.subs.map(s => ({ id: s.id, addedAt: s.addedAt })) : [] });

async function forgetGone(userId, doc, gone) {
  if (!gone.length) return doc;
  const subs = doc.subs.filter(s => !gone.includes(s.id));
  if (!subs.length) { await delPushDoc(userId); await pushUsersRemove(userId); return null; }
  const next = { ...doc, subs }; await setPushDoc(userId, next); return next;
}

export default async function handler(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;
  const cfg = vapidConfig();
  try {
    const doc = await getPushDoc(user.id);
    if (req.method === 'GET') return res.status(200).json({ configured: !!cfg, publicKey: cfg ? cfg.pub : null, ...view(doc) });
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const b = req.body || {}; const action = String(b.action || '');
    if (!cfg && !['unsubscribe', 'prefs'].includes(action)) return res.status(503).json({ error: 'Reminders are not switched on for this site yet.' });

    if (action === 'subscribe') {
      const v = validateSubscription(b.subscription); if (!v.ok) return res.status(400).json({ error: v.error });
      const p = validatePrefs(b.prefs, doc ? doc.prefs : DEFAULT_PREFS()); if (!p.ok) return res.status(400).json({ error: p.error });
      const id = deviceId(v.sub.endpoint);
      const subs = (doc ? doc.subs : []).filter(s => s.id !== id); subs.push({ id, ...v.sub, addedAt: Date.now() });
      while (subs.length > MAX_DEVICES) subs.shift();                                   // keep the newest devices
      const next = { prefs: p.prefs, subs, lastSent: doc ? doc.lastSent || {} : {} };
      await setPushDoc(user.id, next); await pushUsersAdd(user.id);
      return res.status(200).json({ ok: true, deviceId: id, ...view(next) });
    }
    if (action === 'prefs') {
      if (!doc) return res.status(400).json({ error: 'Turn on reminders on this device first.' });
      const p = validatePrefs(b.prefs, doc.prefs); if (!p.ok) return res.status(400).json({ error: p.error });
      const next = { ...doc, prefs: p.prefs }; await setPushDoc(user.id, next);
      return res.status(200).json({ ok: true, ...view(next) });
    }
    if (action === 'unsubscribe') {
      if (!doc) return res.status(200).json({ ok: true, ...view(null) });
      const id = b.all === true ? null : String(b.deviceId || '');
      if (b.all !== true && !id) return res.status(400).json({ error: 'Which device?' });
      const subs = b.all === true ? [] : doc.subs.filter(s => s.id !== id);
      if (!subs.length) { await delPushDoc(user.id); await pushUsersRemove(user.id); return res.status(200).json({ ok: true, ...view(null) }); }
      const next = { ...doc, subs }; await setPushDoc(user.id, next);
      return res.status(200).json({ ok: true, ...view(next) });
    }
    if (action === 'test') {
      if (!doc || !doc.subs.length) return res.status(400).json({ error: 'Turn on reminders first.' });
      if ((await incrWithExpiry(`pushtest:${user.id}`, 3600)) > 5) return res.status(429).json({ error: 'That is enough tests for now. Try again in an hour.' });
      const r = await sendToDevices(doc.subs, buildMessage('test'), await webPushSender(cfg));
      await forgetGone(user.id, doc, r.gone);
      return res.status(200).json({ ok: true, sent: r.sent, failed: r.failed });
    }
    if (action === 'milestone') {
      const kind = String(b.kind || ''); if (!isMilestoneKind(kind)) return res.status(400).json({ error: 'Unknown milestone.' });
      if (!doc || !doc.prefs.milestones) return res.status(200).json({ ok: true, sent: 0 });
      if ((await incrWithExpiry(`pushms:${user.id}`, 86400)) > 6) return res.status(200).json({ ok: true, sent: 0 });   // quietly capped
      const targets = doc.subs.filter(s => s.id !== String(b.exclude || ''));
      if (!targets.length) return res.status(200).json({ ok: true, sent: 0 });
      const r = await sendToDevices(targets, buildMessage(kind), await webPushSender(cfg));
      await forgetGone(user.id, doc, r.gone);
      return res.status(200).json({ ok: true, sent: r.sent });
    }
    return res.status(400).json({ error: 'Unknown action.' });
  } catch (err) {
    console.error('push failed:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
