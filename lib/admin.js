// lib/admin.js - the admin panel's logic (pure functions; storage and the web layer live elsewhere).
//
// SEPARATION RULES (do not weaken; the self-test enforces them):
//  * Admin identities are NOT in the client database. They come from Vercel settings, in exactly TWO slots (ADMIN_1_*, ADMIN_2_*).
//    There is no sign-up and no code path that creates an admin.
//  * Admin sessions use a different signing secret and a different cookie from client sessions.
//  * The admin area is READ-ONLY with respect to client data.
//  * Full client details are shown only if the client switched on "share my progress with my coach". Everyone else shows basic account info.
//  * Statistics are anonymous: any group smaller than K_MIN is hidden.
import crypto from 'crypto';

export const MAX_ADMINS = 2;
export const K_MIN = 5;
export const SESSION_IDLE_MS = 30 * 60 * 1000;
export const SESSION_MAX_MS = 8 * 60 * 60 * 1000;
export const COOKIE_NAME = 'hf_admin';
export const COOKIE_PATH = '/api/admin';        // the browser only ever sends this cookie to the admin API

// ── who may be an admin ──
const BCRYPT = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
export function adminSlots(env = process.env) {
  const out = [];
  for (const n of [1, 2]) {                      // exactly two slots exist. There is no third.
    const email = String(env[`ADMIN_${n}_EMAIL`] || '').trim().toLowerCase();
    const hash = String(env[`ADMIN_${n}_HASH`] || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !BCRYPT.test(hash)) continue;
    out.push({ slot: n, email, hash, totp: String(env[`ADMIN_${n}_TOTP`] || '').replace(/\s+/g, '').toUpperCase() || null, name: String(env[`ADMIN_${n}_NAME`] || '').trim().slice(0, 40) || `Admin ${n}` });
  }
  return out;
}
export function adminSecretProblem(env = process.env) {
  const s = String(env.ADMIN_SESSION_SECRET || '');
  if (s.length < 32) return 'ADMIN_SESSION_SECRET must be set to a long random value (at least 32 characters).';
  if (s === env.SESSION_SECRET) return 'ADMIN_SESSION_SECRET must be DIFFERENT from SESSION_SECRET, so client and admin sessions can never be confused.';
  return null;
}
export const adminEnabled = (env = process.env) => !adminSecretProblem(env) && adminSlots(env).length > 0;

// ── authenticator-app codes (RFC 6238 TOTP) ──
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32Decode(s) {
  let bits = ''; for (const ch of String(s).replace(/=+$/, '').toUpperCase()) { const v = B32.indexOf(ch); if (v < 0) return null; bits += v.toString(2).padStart(5, '0'); }
  const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out);
}
export function base32Encode(buf) { let bits = ''; for (const b of buf) bits += b.toString(2).padStart(8, '0'); let out = ''; for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]; return out; }
export const newTotpSecret = () => base32Encode(crypto.randomBytes(20));
export function totpAt(secret, step) {
  const key = base32Decode(secret); if (!key || !key.length) return null;
  const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac('sha1', key).update(b).digest(), o = h[19] & 15;
  return String(((h[o] & 0x7f) << 24 | h[o + 1] << 16 | h[o + 2] << 8 | h[o + 3]) % 1000000).padStart(6, '0');
}
// A code is accepted once only (lastStep), within one 30-second step either side of now.
export function verifyTotp(secret, code, nowMs, lastStep = -1) {
  const c = String(code || '').replace(/\s+/g, ''); if (!/^\d{6}$/.test(c)) return { ok: false };
  const base = Math.floor(nowMs / 30000);
  for (const d of [-1, 0, 1]) { const step = base + d, want = totpAt(secret, step); if (want && step > lastStep && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(c))) return { ok: true, step }; }
  return { ok: false };
}

// ── spreadsheets: neutralise anything a spreadsheet could run as a formula ──
export const csvCell = v => { let s = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export const toCsv = (rows, cols) => [cols.map(c => csvCell(c.label)).join(','), ...rows.map(r => cols.map(c => csvCell(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(','))].join('\r\n') + '\r\n';

// ── helpers ──
const dayDiff = (a, b) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000);
const isoDay = ms => new Date(ms).toISOString().slice(0, 10);
const plansSeen = state => new Set([...(state && state.planId ? [state.planId] : []), ...((state && state.history) || []).map(e => e.planId).filter(Boolean)]).size;
const lastActive = state => (state && Number.isFinite(Number(state.updatedAt)) && Number(state.updatedAt) > 0 ? new Date(Number(state.updatedAt)).toISOString() : null);
const coachOf = user => ({ share: !!(user.coach && user.coach.share), interest: !!(user.coach && user.coach.interest) });

// One row per account: ONLY these fields are ever returned for the accounts list (never a password hash, token or session data).
export function accountRow(user, state) {
  const ov = state && state.plan && state.plan.overview;
  return {
    id: user.id, name: String(user.name || ''), email: String(user.email || ''), createdAt: user.createdAt || null,
    lastLoginAt: user.lastLoginAt || null, lastActiveAt: lastActive(state),
    plansGenerated: Math.max(Number(user.plansGenerated) || 0, plansSeen(state)),
    hasPlan: !!(state && state.plan), program: ov && ov.programName ? String(ov.programName) : null,
    daysPerWeek: state && state.plan && state.plan.meta && state.plan.meta.freq != null ? Number(state.plan.meta.freq) : null,
    coachShare: coachOf(user).share, interest: coachOf(user).interest,
  };
}
export function currentStreak(history, today) {
  const perfect = new Set((history || []).filter(e => e.perfect).map(e => e.date)); let d = perfect.has(today) ? today : null; if (!d) { const y = isoDay(Date.parse(today + 'T00:00:00Z') - 86400000); if (perfect.has(y)) d = y; }
  let n = 0; while (d && perfect.has(d)) { n++; d = isoDay(Date.parse(d + 'T00:00:00Z') - 86400000); } return n;
}
// Full detail: ONLY for clients who shared their progress. Whitelisted fields only; health answers are never stored so can never appear.
export function clientDetail(user, state, nowMs = Date.now()) {
  const plan = state && state.plan, hist = ((state && state.history) || []).slice(-90), today = isoDay(nowMs);
  const sleeps = hist.map(e => e.s && e.s[0]).filter(v => v != null);
  const meas = ((state && state.measurements) || []).slice(-120);
  return {
    row: accountRow(user, state),
    plan: plan ? {
      overview: plan.overview ? { programName: plan.overview.programName, summary: plan.overview.summary, dailyCalories: plan.overview.dailyCalories, dailyProtein: plan.overview.dailyProtein, dailyCarbs: plan.overview.dailyCarbs, dailyFats: plan.overview.dailyFats } : null,
      profile: plan.meta && plan.meta.profile ? plan.meta.profile : null, goal: plan.meta ? plan.meta.goal : null, diet: plan.meta ? plan.meta.diet : null, avoid: (state.avoidFoods || []).slice(0, 40),
      days: (plan.days || []).slice(0, 7).map(d => ({
        day: d.day, type: d.trainingType, isRest: !!d.isRest,
        exercises: d.training ? (d.training.exercises || []).map(x => ({ name: x.name, sets: x.sets, reps: x.reps, rest: x.rest })) : [],
        meals: d.nutrition ? (d.nutrition.meals || []).map(m => ({ time: m.time, name: m.name, foods: m.foods, calories: m.calories, protein: m.protein, carbs: m.carbs, fats: m.fats, swapped: !!m.orig })) : [],
        totalCalories: d.nutrition ? d.nutrition.totalCalories : null, sleep: d.sleep ? { targetHours: d.sleep.targetHours, bedtime: d.sleep.bedtime, wakeTime: d.sleep.wakeTime } : null,
      })),
    } : null,
    stats: {
      daysLogged: new Set(hist.map(e => e.date)).size, perfectDays: new Set(hist.filter(e => e.perfect).map(e => e.date)).size,
      workoutsDone: hist.filter(e => e.w && e.w[1] > 0 && e.w[2] === 1).length, workoutsPlanned: hist.filter(e => e.w && e.w[1] > 0).length,
      avgSleep: sleeps.length ? Math.round(10 * sleeps.reduce((a, b) => a + b, 0) / sleeps.length) / 10 : null, streak: currentStreak(hist, today),
    },
    activity: hist.map(e => ({ date: e.date, type: e.type, workout: e.w, meals: e.m, sleep: e.s, hits: e.hits, perfect: !!e.perfect, note: e.n || '' })),
    body: { measurements: meas, targets: state && state.targets ? state.targets : null },
  };
}

// ── anonymous statistics ──
// items: [{ user, state }]. Any count under K_MIN is reported as "<5", and averages need at least K_MIN people.
export function insights(items, nowMs = Date.now()) {
  const n = items.length, day = 86400000, hide = c => (c < K_MIN ? '<' + K_MIN : c);
  const tally = f => { const m = {}; for (const it of items) { const k = f(it); if (k != null && k !== '') m[k] = (m[k] || 0) + 1; } return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, hide(v)])); };
  const within = (iso, d) => iso && nowMs - Date.parse(iso) <= d * day;
  const act = it => lastActive(it.state);
  const hist = items.flatMap(it => (it.state && it.state.history) || []), sleeps = items.map(it => { const s = ((it.state && it.state.history) || []).map(e => e.s && e.s[0]).filter(v => v != null); return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null; }).filter(v => v != null);
  const meta = it => (it.state && it.state.plan && it.state.plan.meta) || null;
  const enough = n >= K_MIN;
  return {
    generatedAt: new Date(nowMs).toISOString(), minGroup: K_MIN,
    accounts: n, new7: hide(items.filter(it => within(it.user.createdAt, 7)).length), new30: hide(items.filter(it => within(it.user.createdAt, 30)).length),
    active7: hide(items.filter(it => within(act(it), 7)).length), active30: hide(items.filter(it => within(act(it), 30)).length),
    withPlan: hide(items.filter(it => it.state && it.state.plan).length),
    plansGenerated: enough ? items.reduce((s, it) => s + accountRow(it.user, it.state).plansGenerated, 0) : null,
    avgPlansPerAccount: enough ? Math.round(10 * items.reduce((s, it) => s + accountRow(it.user, it.state).plansGenerated, 0) / n) / 10 : null,
    goals: enough ? tally(it => meta(it) && meta(it).goal) : {}, diets: enough ? tally(it => meta(it) && meta(it).diet) : {},
    trainingDays: enough ? tally(it => meta(it) && meta(it).freq != null ? meta(it).freq + ' days a week' : null) : {},
    experience: enough ? tally(it => meta(it) && meta(it).profile && meta(it).profile.exp) : {},
    perfectDayRate: enough && hist.length >= 50 ? Math.round(100 * hist.filter(e => e.perfect).length / hist.length) : null,
    avgSleepHours: sleeps.length >= K_MIN ? Math.round(10 * sleeps.reduce((a, b) => a + b, 0) / sleeps.length) / 10 : null,
    coachSharing: hide(items.filter(it => coachOf(it.user).share).length), trainingInterest: hide(items.filter(it => coachOf(it.user).interest).length),
  };
}
export const hashIp = ip => crypto.createHash('sha256').update(String(ip || '')).digest('hex').slice(0, 12);
