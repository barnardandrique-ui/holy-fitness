// api/admin.js - the admin panel's API (read-only for client data). The 12th and last function the free plan allows.
//
// Admins are NOT clients: their details come from Vercel settings (ADMIN_1_*, ADMIN_2_*), the session cookie is a different cookie
// (hf_admin, only ever sent to /api/admin) signed with a different secret, and a client session means nothing here.
// Anyone who is not a signed-in admin gets a plain 404 "Not found" (except the login attempt itself).
//   POST ?a=login   { email, password, code? }        POST ?a=logout
//   GET  ?a=me | accounts | account&id= | insights | leads | audit | export&what=accounts|leads
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getUserById, updateUser, getState, scanUserIds, adminSessionGet, adminSessionSet, adminSessionDel, getTotpStep, setTotpStep, auditAdd, auditList, adminCacheGet, adminCacheSet, getCount, incrWithExpiry, clearKey } from '../lib/db.js';
import { adminEnabled, adminSlots, verifyTotp, accountRow, clientDetail, insights, toCsv, hashIp, COOKIE_NAME, COOKIE_PATH, SESSION_IDLE_MS, SESSION_MAX_MS } from '../lib/admin.js';

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);       // so "no such admin" takes as long as "wrong password"
const IP_FAIL_LIMIT = 5, ACCOUNT_FAIL_LIMIT = 15, FAIL_WINDOW = 15 * 60, PAGE = 50, CACHE_SECONDS = 300;   // one source is blocked quickly; the account only locks after MANY failures from many places, so a stranger cannot lock the owner out
const notFound = res => res.status(404).json({ error: 'Not found' });
const secure = () => (process.env.NODE_ENV === 'production' ? ' Secure;' : '');
const cookieFor = token => `${COOKIE_NAME}=${token}; HttpOnly;${secure()} Path=${COOKIE_PATH}; Max-Age=${SESSION_MAX_MS / 1000}; SameSite=Strict`;
const clearCookie = () => `${COOKIE_NAME}=; HttpOnly;${secure()} Path=${COOKIE_PATH}; Max-Age=0; SameSite=Strict`;
const ipOf = req => String((req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || '').split(',')[0].trim();
const audit = (req, admin, action, target) => auditAdd({ t: new Date().toISOString(), admin: admin ? admin.slot : null, action, target: target || null, ip: hashIp(ipOf(req)) }).catch(() => {});

// ── session (a different cookie, secret and store from client sessions) ──
async function requireAdmin(req, res) {
  const m = String((req.headers && req.headers.cookie) || '').split(';').map(c => c.trim()).find(c => c.startsWith(COOKIE_NAME + '='));
  let claims = null;
  try { claims = m ? jwt.verify(m.slice(COOKIE_NAME.length + 1), process.env.ADMIN_SESSION_SECRET, { audience: 'hf-admin' }) : null; } catch { claims = null; }
  const sess = claims && await adminSessionGet(claims.sid);
  const slot = sess && adminSlots().find(s => s.slot === sess.slot && s.email === sess.email);          // removing an admin from Vercel ends their session
  const now = Date.now();
  if (!sess || !slot || now - sess.createdAt > SESSION_MAX_MS || now - sess.lastSeen > SESSION_IDLE_MS) {
    if (claims) { await adminSessionDel(claims.sid); res.setHeader('Set-Cookie', clearCookie()); }
    notFound(res); return null;
  }
  await adminSessionSet(claims.sid, { ...sess, lastSeen: now }, SESSION_MAX_MS / 1000);
  return { slot: slot.slot, email: slot.email, name: slot.name, sid: claims.sid, createdAt: sess.createdAt };
}

async function login(req, res) {
  const { email, password, code } = req.body || {};
  const ipKey = `adminfail:ip:${hashIp(ipOf(req))}`, mail = String(email || '').trim().toLowerCase().slice(0, 120), slotKey = `adminfail:acct:${hashIp(mail)}`;
  if ((await getCount(ipKey)) >= IP_FAIL_LIMIT || (await getCount(slotKey)) >= ACCOUNT_FAIL_LIMIT) return res.status(429).json({ error: 'Too many attempts. Please wait 15 minutes.' });
  const slot = adminSlots().find(s => s.email === mail);
  const pwOk = await bcrypt.compare(String(password || '').slice(0, 200), slot ? slot.hash : DUMMY_HASH);
  let ok = !!slot && pwOk, step = null;
  if (ok && slot.totp) { const t = verifyTotp(slot.totp, code, Date.now(), await getTotpStep(slot.slot)); ok = t.ok; step = t.step; }
  if (!ok) {
    await incrWithExpiry(ipKey, FAIL_WINDOW); await incrWithExpiry(slotKey, FAIL_WINDOW);
    await audit(req, slot || null, 'login_failed');
    return res.status(401).json({ error: 'Incorrect details.' });                       // never says which part was wrong
  }
  if (step != null) await setTotpStep(slot.slot, step);                                  // a code can only be used once
  await clearKey(ipKey); await clearKey(slotKey);
  const sid = crypto.randomBytes(24).toString('hex'), now = Date.now();
  await adminSessionSet(sid, { slot: slot.slot, email: slot.email, createdAt: now, lastSeen: now }, SESSION_MAX_MS / 1000);
  const token = jwt.sign({ sid, slot: slot.slot, aud: 'hf-admin' }, process.env.ADMIN_SESSION_SECRET, { expiresIn: SESSION_MAX_MS / 1000 });
  res.setHeader('Set-Cookie', cookieFor(token));
  await audit(req, slot, 'login');
  return res.status(200).json({ ok: true, name: slot.name, slot: slot.slot });
}

// ── data (built once, cached for a few minutes; the cache is purged when an account is deleted) ──
async function build(force) {
  if (!force) { const c = await adminCacheGet(); if (c) return { ...c, cached: true }; }
  const ids = await scanUserIds(), items = [];
  for (let i = 0; i < ids.length; i += 25) {
    const part = await Promise.all(ids.slice(i, i + 25).map(async id => { const [user, state] = await Promise.all([getUserById(id), getState(id)]); return user ? { user, state } : null; }));
    items.push(...part.filter(Boolean));
  }
  const out = { generatedAt: new Date().toISOString(), rows: items.map(it => accountRow(it.user, it.state)), insights: insights(items) };
  await adminCacheSet(out, CACHE_SECONDS);
  return { ...out, cached: false };
}
const FILTERS = { shared: r => r.coachShare, interest: r => r.interest, noplan: r => !r.hasPlan, inactive30: r => !r.lastActiveAt || Date.now() - Date.parse(r.lastActiveAt) > 30 * 86400000 };
const byDesc = k => (a, b) => String(b[k] || '').localeCompare(String(a[k] || ''));

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (!adminEnabled()) return notFound(res);
  let url; try { url = new URL(req.url || '/', 'http://x'); } catch { url = new URL('http://x/'); }
  const a = url.searchParams.get('a') || String((req.body && req.body.a) || ''), q = k => url.searchParams.get(k) || '';
  try {
    if (req.method === 'POST' && a === 'login') return await login(req, res);
    const admin = await requireAdmin(req, res); if (!admin) return;
    if (req.method === 'POST' && a === 'logout') { await adminSessionDel(admin.sid); res.setHeader('Set-Cookie', clearCookie()); await audit(req, admin, 'logout'); return res.status(200).json({ ok: true }); }
    if (req.method !== 'GET') return notFound(res);

    if (a === 'me') return res.status(200).json({ ok: true, name: admin.name, slot: admin.slot, email: admin.email, signedInAt: admin.createdAt, idleMinutes: SESSION_IDLE_MS / 60000 });
    if (a === 'accounts') {
      const d = await build(q('refresh') === '1'); let rows = d.rows; const s = q('q').trim().toLowerCase();
      if (s) rows = rows.filter(r => r.email.toLowerCase().includes(s) || r.name.toLowerCase().includes(s));
      if (FILTERS[q('filter')]) rows = rows.filter(FILTERS[q('filter')]);
      rows = [...rows].sort(byDesc({ joined: 'createdAt', plans: 'plansGenerated' }[q('sort')] || 'lastActiveAt'));
      const page = Math.max(1, Number(q('page')) || 1), pages = Math.max(1, Math.ceil(rows.length / PAGE));
      return res.status(200).json({ ok: true, total: rows.length, all: d.rows.length, page, pages, rows: rows.slice((page - 1) * PAGE, page * PAGE), generatedAt: d.generatedAt, cached: d.cached });
    }
    if (a === 'insights') { const d = await build(q('refresh') === '1'); await audit(req, admin, 'view_insights'); return res.status(200).json({ ok: true, insights: d.insights, generatedAt: d.generatedAt }); }
    if (a === 'leads') { const d = await build(); await audit(req, admin, 'view_leads'); return res.status(200).json({ ok: true, rows: d.rows.filter(r => r.interest).sort(byDesc('createdAt')) }); }
    if (a === 'audit') return res.status(200).json({ ok: true, entries: await auditList(200) });
    if (a === 'account') {
      const id = q('id'); if (!/^[0-9a-fA-F-]{36}$/.test(id)) return notFound(res);
      const user = await getUserById(id); if (!user) return notFound(res);
      const state = await getState(id);
      if (!(user.coach && user.coach.share)) { await audit(req, admin, 'view_basic', id); return res.status(200).json({ ok: true, consent: false, row: accountRow(user, state) }); }
      await audit(req, admin, 'view_account', id);
      await updateUser(id, { coach: { ...user.coach, lastViewedAt: new Date().toISOString(), viewCount: (user.coach.viewCount || 0) + 1 } });    // the client can see when
      return res.status(200).json({ ok: true, consent: true, ...clientDetail(user, state) });
    }
    if (a === 'export') {
      const d = await build(), what = q('what') === 'leads' ? 'leads' : 'accounts', rows = what === 'leads' ? d.rows.filter(r => r.interest) : d.rows;
      await audit(req, admin, 'export_' + what);
      const cols = [{ label: 'Name', key: 'name' }, { label: 'Email', key: 'email' }, { label: 'Signed up', key: 'createdAt' }, { label: 'Last login', key: 'lastLoginAt' }, { label: 'Last active', key: 'lastActiveAt' }, { label: 'Plans generated', key: 'plansGenerated' }, { label: 'Program', key: 'program' }, { label: 'Days per week', key: 'daysPerWeek' }, { label: 'Shares progress with coach', get: r => (r.coachShare ? 'yes' : 'no') }, { label: 'Interested in personal training', get: r => (r.interest ? 'yes' : 'no') }];
      res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="holy-fitness-${what}.csv"`);
      return res.status(200).send(toCsv(rows, cols));
    }
    return notFound(res);
  } catch (err) {
    console.error('admin failed:', err);
    return res.status(500).json({ error: 'Something went wrong.' });
  }
}
