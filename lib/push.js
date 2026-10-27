// lib/push.js - reminders sent as web push notifications.
// Pure logic with injected IO (storage and sending are passed in), so it can be tested without a network or a database.
//
// Privacy by design: notification text is always generic. It is shown on lock screens, so it never contains weight, calories,
// body fat, health information or anything else personal.
import crypto from 'crypto';

// Push services run by the browser vendors. A subscription pointing anywhere else is refused, so the server can never be
// tricked into sending requests to an arbitrary address.
export const ALLOWED_HOSTS = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'push.services.mozilla.com', 'web.push.apple.com', 'notify.windows.com'];
export const MAX_DEVICES = 5;
export const GRACE_MINUTES = 120;           // a reminder is still sent up to 2 hours after its time (if the scheduler was late)
export const EARLIEST = 6 * 60, LATEST = 21 * 60 + 30;   // reminders can only be set between 06:00 and 21:30
export const STREAK_MILESTONES = [3, 7, 14, 21, 30, 50, 100];
export const DEFAULT_TZ = 'Africa/Johannesburg';
export const DEFAULT_PREFS = () => ({ daily: { on: true, time: '18:30' }, weekly: { on: true, day: 1, time: '07:30' }, milestones: true, tz: DEFAULT_TZ });

// ── subscriptions ──
export function isAllowedEndpoint(urlStr) {
  try {
    const u = new URL(String(urlStr));
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return false;
    const h = u.hostname.toLowerCase();
    return ALLOWED_HOSTS.some(a => h === a || h.endsWith('.' + a));
  } catch { return false; }
}
const b64u = s => typeof s === 'string' && /^[A-Za-z0-9_-]+$/.test(s);
const bytesOf = s => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
export const deviceId = endpoint => crypto.createHash('sha256').update(String(endpoint)).digest('hex').slice(0, 16);

export function validateSubscription(sub) {
  if (!sub || typeof sub !== 'object') return { ok: false, error: 'No subscription was sent.' };
  const endpoint = String(sub.endpoint || '');
  if (endpoint.length > 1000 || !isAllowedEndpoint(endpoint)) return { ok: false, error: 'This browser or device is not supported for reminders.' };
  const k = sub.keys || {};
  if (!b64u(k.p256dh) || !b64u(k.auth)) return { ok: false, error: 'The subscription keys are not valid.' };
  const p = bytesOf(k.p256dh), a = bytesOf(k.auth);
  if (p.length !== 65 || p[0] !== 4 || a.length !== 16) return { ok: false, error: 'The subscription keys are not valid.' };
  return { ok: true, sub: { endpoint, keys: { p256dh: k.p256dh, auth: k.auth } } };
}

// ── preferences ──
export function parseTime(t) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(t));
  if (!m) return null;
  const min = Number(m[1]) * 60 + Number(m[2]);
  return min % 15 === 0 && min >= EARLIEST && min <= LATEST ? min : null;
}
export function validTimezone(tz) {
  if (typeof tz !== 'string' || tz.length > 60 || !/^[A-Za-z0-9_\/+-]+$/.test(tz)) return false;
  try { new Intl.DateTimeFormat('en-GB', { timeZone: tz }); return true; } catch { return false; }
}
export function validatePrefs(raw, base = DEFAULT_PREFS()) {
  const out = JSON.parse(JSON.stringify(base));
  if (raw == null) return { ok: true, prefs: out };
  if (typeof raw !== 'object') return { ok: false, error: 'Those settings are not valid.' };
  if (raw.daily) {
    if (raw.daily.on !== undefined) out.daily.on = !!raw.daily.on;
    if (raw.daily.time !== undefined) { if (parseTime(raw.daily.time) === null) return { ok: false, error: 'Choose a daily time between 06:00 and 21:30.' }; out.daily.time = raw.daily.time; }
  }
  if (raw.weekly) {
    if (raw.weekly.on !== undefined) out.weekly.on = !!raw.weekly.on;
    if (raw.weekly.day !== undefined) { const d = Number(raw.weekly.day); if (!Number.isInteger(d) || d < 1 || d > 7) return { ok: false, error: 'Choose a day of the week.' }; out.weekly.day = d; }
    if (raw.weekly.time !== undefined) { if (parseTime(raw.weekly.time) === null) return { ok: false, error: 'Choose a weigh-in time between 06:00 and 21:30.' }; out.weekly.time = raw.weekly.time; }
  }
  if (raw.milestones !== undefined) out.milestones = !!raw.milestones;
  if (raw.tz !== undefined) { if (!validTimezone(raw.tz)) return { ok: false, error: 'That time zone is not recognised.' }; out.tz = raw.tz; }
  return { ok: true, prefs: out };
}

// ── time ──
export function localParts(ms, tz) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute), dow: { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[p.weekday] };
}
const dayNum = ds => Math.round(Date.parse(ds + 'T00:00:00Z') / 86400000);
const inWindow = (minutes, t) => minutes >= t && minutes < t + GRACE_MINUTES;

// Is a reminder due for this person right now? At most one per day. Returns { kind, date } or null.
export function dueReminder(doc, state, ms) {
  if (!doc || !doc.prefs || !state || !state.plan) return null;          // no plan yet: nothing to remind them about
  const prefs = doc.prefs, last = doc.lastSent || {};
  const lp = localParts(ms, validTimezone(prefs.tz) ? prefs.tz : DEFAULT_TZ);
  if (last.any === lp.date) return null;
  if (prefs.weekly && prefs.weekly.on && lp.dow === prefs.weekly.day && last.weekly !== lp.date) {
    const t = parseTime(prefs.weekly.time);
    if (t !== null && inWindow(lp.minutes, t)) {
      const ms2 = (state.measurements || []).map(e => e.d).filter(Boolean).sort();
      const lastWeighIn = ms2.length ? ms2[ms2.length - 1] : null;
      if (!lastWeighIn || dayNum(lp.date) - dayNum(lastWeighIn) >= 6) return { kind: 'weekly', date: lp.date };
    }
  }
  if (prefs.daily && prefs.daily.on && last.daily !== lp.date) {
    const t = parseTime(prefs.daily.time);
    if (t !== null && inWindow(lp.minutes, t) && !(state.history || []).some(e => e.date === lp.date)) return { kind: 'daily', date: lp.date };
  }
  return null;
}

// ── messages (generic on purpose) ──
const MESSAGES = {
  daily: { title: 'Holy Fitness', body: 'Time to log your day. Your workout, meals and sleep take a minute.', url: '/?open=today', tag: 'hf-daily' },
  weekly: { title: 'Weekly check-in', body: 'Time for your weekly check-in. It keeps your plan accurate.', url: '/?open=weighin', tag: 'hf-weekly' },
  test: { title: 'Reminders are on', body: 'This is a test. Your reminders will look like this.', url: '/', tag: 'hf-test' },
  goal_reached: { title: 'Goal reached', body: 'You reached the goal you set. Open the app to update your plan.', url: '/?open=goal', tag: 'hf-goal' },
  perfect_week: { title: 'A perfect week', body: 'Every day of your plan, done to the letter. Well done.', url: '/?open=history', tag: 'hf-week' },
};
export function buildMessage(kind) {
  if (MESSAGES[kind]) return { ...MESSAGES[kind] };
  const m = /^streak_(\d{1,3})$/.exec(String(kind));
  if (m && STREAK_MILESTONES.includes(Number(m[1]))) return { title: `${m[1]} perfect days in a row`, body: 'That is real consistency. Keep going.', url: '/?open=history', tag: 'hf-streak' };
  return null;
}
export const isMilestoneKind = kind => kind === 'goal_reached' || kind === 'perfect_week' || /^streak_\d{1,3}$/.test(String(kind)) && buildMessage(kind) !== null;

// ── sending ──
export async function sendToDevices(devices, message, send) {
  const payload = JSON.stringify({ title: message.title, body: message.body, url: message.url, tag: message.tag });
  const results = await Promise.all((devices || []).map(async d => {
    try { await send({ endpoint: d.endpoint, keys: d.keys }, payload); return { id: d.id, ok: true }; }
    catch (e) { const code = e && (e.statusCode || e.status); return { id: d.id, ok: false, gone: code === 404 || code === 410 }; }
  }));
  return { sent: results.filter(r => r.ok).length, gone: results.filter(r => r.gone).map(r => r.id), failed: results.filter(r => !r.ok && !r.gone).length };
}

// ── Server settings (the VAPID keys and contact address) ──
// Pasting settings goes wrong in predictable ways: quote marks, a leading "VAPID_PRIVATE_KEY=", stray spaces or line breaks, an email without
// "mailto:", a note left after the address. We clean up what is safe to clean, and explain the rest in plain words.
// Nothing here ever returns a secret value.
const stripName = (v, name) => String(v == null ? '' : v).trim().replace(new RegExp('^' + name + '\\s*=\\s*', 'i'), '').replace(/^["'`]+|["'`]+$/g, '').trim();
export function normalizeVapid(env = process.env) {
  const pub = stripName(env.VAPID_PUBLIC_KEY, 'VAPID_PUBLIC_KEY').replace(/\s+/g, '');
  const priv = stripName(env.VAPID_PRIVATE_KEY, 'VAPID_PRIVATE_KEY').replace(/\s+/g, '');
  // The contact address must look like  mailto:you@gmail.com  (or an https address). Fix a space after "mailto:", a missing "mailto:", or a note after it.
  const rawSubject = stripName(env.VAPID_SUBJECT, 'VAPID_SUBJECT');
  let subject = rawSubject.replace(/^(mailto:)\s+/i, '$1').split(/\s+/)[0] || '';
  if (subject && !/^(mailto:|https:\/\/)/i.test(subject)) subject = 'mailto:' + subject;
  const emailOk = /^mailto:[^\s@:]+@[^\s@]+\.[^\s@]+$/i.test(subject), urlOk = /^https:\/\/[^\s]+$/i.test(subject);
  let subjectProblem = null;
  if (rawSubject && !emailOk && !urlOk) subjectProblem = 'VAPID_SUBJECT should look exactly like mailto:you@gmail.com (your own email, nothing before or after it, no spaces).';
  if (!emailOk && !urlOk) { const app = stripName(env.APP_URL, 'APP_URL'); subject = /^https:\/\/\S+$/i.test(app) ? app : 'https://holy-fitness-rho.vercel.app'; }
  return { pub, priv, subject, subjectProblem };
}
export function vapidConfig(env = process.env) { const c = normalizeVapid(env); return c.pub && c.priv ? c : null; }
export function vapidProblems(cfg) {
  if (!cfg) return ['VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are not set in Vercel.'];
  const out = [], chars = x => /^[A-Za-z0-9_-]+$/.test(x);
  const pubB = chars(cfg.pub) ? bytesOf(cfg.pub) : null, privB = chars(cfg.priv) ? bytesOf(cfg.priv) : null;
  if (!pubB || pubB.length !== 65 || pubB[0] !== 4) out.push(`VAPID_PUBLIC_KEY is not a valid key (it should be 87 characters and yours has ${cfg.pub.length}). Copy it again from the key generator, with nothing before or after it.`);
  if (!privB || privB.length !== 32) out.push(`VAPID_PRIVATE_KEY is not a valid key (it should be 43 characters and yours has ${cfg.priv.length}). Copy it again from the key generator, with nothing before or after it.`);
  if (cfg.subjectProblem) out.push(cfg.subjectProblem);
  if (!out.length) {
    try { const e = crypto.createECDH('prime256v1'); e.setPrivateKey(privB); if (!e.getPublicKey().equals(pubB)) out.push('VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY do not belong together. Use both from the SAME run of the key generator.'); }
    catch { out.push('VAPID_PRIVATE_KEY could not be used. Copy it again from the key generator.'); }
  }
  return out;
}
// Error text can be shown to the site owner, but never with a secret in it.
export const redact = (msg, env = process.env) => [env.VAPID_PRIVATE_KEY, env.CRON_SECRET].filter(v => v && String(v).length > 6).reduce((m, v) => m.split(String(v)).join('***'), String(msg || '')).slice(0, 200);
// web-push is loaded only when something is actually sent, so everything else works (and is testable) without it.
export async function webPushSender(cfg) {
  const mod = await import('web-push'); const wp = mod.default || mod;
  wp.setVapidDetails(cfg.subject, cfg.pub, cfg.priv);
  return (sub, payload) => wp.sendNotification(sub, payload, { TTL: 6 * 3600, urgency: 'normal' });
}

// ── the scheduled job: send whatever is due. All IO is injected. ──
export async function runReminders({ users, getDoc, setDoc, dropUser, getState, send, now = Date.now(), concurrency = 8 }) {
  const sum = { users: users.length, due: 0, sent: 0, gone: 0, failed: 0, dropped: 0 };
  let i = 0;
  async function one(uid) {
    const doc = await getDoc(uid);
    if (!doc || !Array.isArray(doc.subs) || !doc.subs.length) { await dropUser(uid); sum.dropped++; return; }
    const p = doc.prefs || {};
    if (!(p.daily && p.daily.on) && !(p.weekly && p.weekly.on)) return;           // only milestones are on: nothing scheduled
    const due = dueReminder(doc, await getState(uid), now);
    if (!due) return;
    sum.due++;
    const res = await sendToDevices(doc.subs, buildMessage(due.kind), send);
    sum.sent += res.sent; sum.gone += res.gone.length; sum.failed += res.failed;
    const subs = doc.subs.filter(s => !res.gone.includes(s.id));
    if (!subs.length) { await dropUser(uid); sum.dropped++; return; }
    const next = { ...doc, subs };
    if (res.sent > 0) next.lastSent = { ...(doc.lastSent || {}), [due.kind]: due.date, any: due.date };    // only mark as sent if something was delivered
    await setDoc(uid, next);
  }
  async function worker() { while (i < users.length) { const uid = users[i++]; try { await one(uid); } catch (e) { sum.failed++; } } }
  await Promise.all(Array.from({ length: Math.min(concurrency, users.length) }, worker));
  return sum;
}
