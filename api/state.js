// api/state.js
// Saves and loads a user's plan, progress and logs so they follow the account
// across devices (including the permanent day-by-day history).
//   GET -> { state }     PUT { state } -> { ok, updatedAt }
import { requireUser } from '../lib/auth.js';
import { getState, setState } from '../lib/db.js';

const MAX_BYTES = 500 * 1024;

// Removes HTML tags from every string inside a value (works value-by-value, so it
// can never damage the JSON structure itself).
function scrub(v, depth = 0) {
  if (depth > 12) return null;      // meals now hold ingredient lists (plan > days > nutrition > meals > meal > items > item), so allow some depth
  if (typeof v === 'string') return v.replace(/<[^>]*>/g, '').replace(/[<>]/g, '');
  if (Array.isArray(v)) return v.slice(0, 100).map(x => scrub(x, depth + 1));
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).slice(0, 100)) o[k.replace(/[<>]/g, '')] = scrub(v[k], depth + 1);
    return o;
  }
  return v;
}

// One day of history. Everything is range-checked and stripped of markup, because it is rendered later.
const clean = (v, n) => String(v == null ? '' : v).replace(/<[^>]*>/g, '').replace(/[<>]/g, '').slice(0, n);
const toInt = (v, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null; };
function cleanEntry(e) {
  if (!e || typeof e !== 'object') return null;
  const date = clean(e.date, 10);
  const id = clean(e.id, 70);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !id || !Array.isArray(e.w) || !Array.isArray(e.m) || !Array.isArray(e.s)) return null;
  const w = [toInt(e.w[0], 0, 40), toInt(e.w[1], 0, 40), e.w[2] ? 1 : 0];
  const m = [toInt(e.m[0], 0, 20), toInt(e.m[1], 0, 20), toInt(e.m[2], 0, 30000), toInt(e.m[3], 0, 30000), e.m[4] ? 1 : 0];
  if (w[0] === null || w[1] === null || m.slice(0, 4).includes(null)) return null;
  const hrs = e.s[0] == null ? null : Number(e.s[0]);
  const tgt = Number(e.s[1]);
  const s = [Number.isFinite(hrs) && hrs >= 0 && hrs <= 24 ? Math.round(hrs * 10) / 10 : null, Number.isFinite(tgt) && tgt >= 0 && tgt <= 24 ? Math.round(tgt * 10) / 10 : 0, e.s[2] ? 1 : 0, clean(e.s[3], 12)];
  const hits = toInt(e.hits, 0, 3);
  return {
    id, planId: clean(e.planId, 40), dayIndex: toInt(e.dayIndex, 0, 6) ?? 0, day: clean(e.day, 20), type: clean(e.type, 80), date,
    w, m, s, hits: hits ?? 0, perfect: e.perfect && hits === 3 ? 1 : 0,
    x: (Array.isArray(e.x) ? e.x : []).slice(0, 5).map(p => Array.isArray(p) ? [clean(p[0], 40), toInt(p[1], 0, 30000) ?? 0] : null).filter(Boolean),
    n: clean(e.n, 200), c: e.c ? 1 : 0,
  };
}
function cleanHistory(arr) {
  if (!Array.isArray(arr)) return [];
  const list = arr.slice(0, 1000).map(cleanEntry).filter(Boolean);
  list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return list.slice(-730);
}

// Body measurements the client chose to log: { d: 'YYYY-MM-DD', w: kg, bf?: %, wa?: cm }. Everything is range-checked.
function cleanMeasurements(arr) {
  if (!Array.isArray(arr)) return [];
  const byDate = new Map();
  for (const e of arr.slice(0, 1500)) {
    if (!e || typeof e !== 'object') continue;
    const d = clean(e.d, 10); const w = Number(e.w);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(w) || w < 30 || w > 300) continue;
    const entry = { d, w: Math.round(w * 10) / 10 };
    const bf = e.bf == null ? NaN : Number(e.bf), wa = e.wa == null ? NaN : Number(e.wa);
    if (Number.isFinite(bf) && bf >= 3 && bf <= 60) entry.bf = Math.round(bf * 10) / 10;
    if (Number.isFinite(wa) && wa >= 40 && wa <= 200) entry.wa = Math.round(wa * 2) / 2;
    byDate.set(d, entry);
  }
  return [...byDate.values()].sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0)).slice(-1000);
}
function cleanTargets(t) {
  if (!t || typeof t !== 'object') return null;
  const num = (v, lo, hi) => { const n = Number(v); return v != null && Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n * 10) / 10 : null; };
  const date = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : null);
  const weight = num(t.weight, 30, 300), bf = num(t.bf, 3, 60);
  if (weight == null && bf == null) return null;
  return { weight, bf, startWeight: num(t.startWeight, 30, 300), startBf: num(t.startBf, 3, 60), startDate: date(t.startDate), setAt: date(t.setAt), reachedAt: date(t.reachedAt) };
}

function cleanState(s) {
  if (!s || typeof s !== 'object') return null;
  const out = {};

  if (s.plan != null) {
    const p = s.plan;
    if (typeof p !== 'object' || !Array.isArray(p.days) || p.days.length !== 7 || !p.overview) return null;
    // Plans are plain text from our own planner; refuse anything that looks like markup.
    if (/[<>]/.test(JSON.stringify(p))) return null;
    out.plan = p;
  } else {
    out.plan = null;
  }
  out.goal = typeof s.goal === 'string' ? s.goal.slice(0, 40) : null;

  const idx = Number(s.progress && s.progress.currentDayIndex);
  out.progress = { currentDayIndex: Number.isInteger(idx) && idx >= 0 && idx <= 7 ? idx : 0 };

  const logs = s.logs && typeof s.logs === 'object' && !Array.isArray(s.logs) ? s.logs : {};
  out.logs = {};
  for (const k of Object.keys(logs)) if (/^[0-6]$/.test(k)) out.logs[k] = logs[k];
  // Log notes are typed by the user: remove any HTML so it can never be rendered as markup.
  out.logs = scrub(out.logs);

  out.planId = typeof s.planId === 'string' ? s.planId.replace(/[^\w:-]/g, '').slice(0, 40) || null : null;
  out.history = cleanHistory(s.history);
  // Foods the client asked never to see again (ids only).
  out.measurements = cleanMeasurements(s.measurements);
  out.targets = cleanTargets(s.targets);
  out.avoidFoods = Array.isArray(s.avoidFoods) ? [...new Set(s.avoidFoods.filter(id => typeof id === 'string' && /^[a-z0-9_]{1,40}$/.test(id)))].slice(0, 40) : [];

  out.updatedAt = Number.isFinite(Number(s.updatedAt)) ? Number(s.updatedAt) : Date.now();
  return out;
}

export default async function handler(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;

  try {
    if (req.method === 'GET') {
      return res.status(200).json({ state: await getState(user.id) });
    }
    if (req.method === 'PUT') {
      const incoming = (req.body || {}).state;
      if (JSON.stringify(incoming || {}).length > MAX_BYTES) return res.status(413).json({ error: 'That is too much data to save.' });
      const state = cleanState(incoming);
      if (!state) return res.status(400).json({ error: 'That data is not in the expected format.' });
      await setState(user.id, state);
      return res.status(200).json({ ok: true, updatedAt: state.updatedAt });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('state failed:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
