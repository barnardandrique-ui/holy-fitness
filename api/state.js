// api/state.js
// Saves and loads a user's plan, progress and logs so they follow the account
// across devices.   GET -> { state }     PUT { state } -> { ok, updatedAt }
import { requireUser } from '../lib/auth.js';
import { getState, setState } from '../lib/db.js';

const MAX_BYTES = 500 * 1024;

// Removes HTML tags from every string inside a value (works value-by-value, so it
// can never damage the JSON structure itself).
function scrub(v, depth = 0) {
  if (depth > 6) return null;
  if (typeof v === 'string') return v.replace(/<[^>]*>/g, '').replace(/[<>]/g, '');
  if (Array.isArray(v)) return v.slice(0, 100).map(x => scrub(x, depth + 1));
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).slice(0, 100)) o[k.replace(/[<>]/g, '')] = scrub(v[k], depth + 1);
    return o;
  }
  return v;
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
