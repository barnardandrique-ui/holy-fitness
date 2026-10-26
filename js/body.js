// js/body.js - body measurements (weight, body fat, waist), goals, and "time to update your plan" advice.
// Pure functions (no DOM), exposed as window.HFBody so they can be tested on their own.
(function (root) {
  'use strict';

  const LIMITS = { weight: [30, 300], bf: [3, 60], waist: [40, 200] };
  const MAX_ENTRIES = 1000;
  const MIN_BMI = 18.5;                       // never help someone aim below this
  const BF_FLOOR = { male: 6, female: 14, other: 10 };

  // ── helpers ──
  const pad = n => String(n).padStart(2, '0');
  const parse = ds => { const p = String(ds).split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])); };
  const fmt = dt => dt.getUTCFullYear() + '-' + pad(dt.getUTCMonth() + 1) + '-' + pad(dt.getUTCDate());
  const addDays = (ds, n) => { const d = parse(ds); d.setUTCDate(d.getUTCDate() + n); return fmt(d); };
  const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
  const validDate = ds => /^\d{4}-\d{2}-\d{2}$/.test(String(ds)) && fmt(parse(ds)) === ds;
  const r1 = n => Math.round(n * 10) / 10;
  const r2 = n => Math.round(n * 100) / 100;
  const num = v => { if (v === '' || v == null) return null; const n = Number(String(v).trim().replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
  const sorted = list => [...list].sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));

  // ── entries: { d: 'YYYY-MM-DD', w: kg, bf?: %, wa?: cm } ──
  function validateEntry(raw, { today, entries = [] } = {}) {
    const errors = {}, warnings = [];
    const d = String(raw.date || '');
    if (!validDate(d) || (today && d > today) || (today && daysBetween(d, today) > 1825)) errors.date = 'Choose a date within the last 5 years (not in the future).';
    const w = num(raw.weight), bf = num(raw.bf), wa = num(raw.waist);
    if (w == null || Number.isNaN(w)) errors.weight = 'Enter your weight in kg, for example 82.5.';
    else if (w < LIMITS.weight[0] || w > LIMITS.weight[1]) errors.weight = `Weight should be between ${LIMITS.weight[0]} and ${LIMITS.weight[1]} kg.`;
    if (Number.isNaN(bf) || (bf != null && (bf < LIMITS.bf[0] || bf > LIMITS.bf[1]))) errors.bf = `Body fat should be between ${LIMITS.bf[0]}% and ${LIMITS.bf[1]}%, or leave it blank.`;
    if (Number.isNaN(wa) || (wa != null && (wa < LIMITS.waist[0] || wa > LIMITS.waist[1]))) errors.waist = `Waist should be between ${LIMITS.waist[0]} and ${LIMITS.waist[1]} cm, or leave it blank.`;
    if (Object.keys(errors).length) return { ok: false, errors, warnings, entry: null };
    const entry = { d, w: r1(w) };
    if (bf != null) entry.bf = r1(bf);
    if (wa != null) entry.wa = Math.round(wa * 2) / 2;
    // a big jump is probably a typo: ask them to double-check (the app confirms before saving)
    const prev = sorted(entries).filter(e => e.d < d && daysBetween(e.d, d) <= 10).pop();
    if (prev && Math.abs(entry.w - prev.w) > 5) warnings.push(`That is ${r1(Math.abs(entry.w - prev.w))} kg ${entry.w > prev.w ? 'more' : 'less'} than your entry on ${prev.d} (${prev.w} kg).`);
    if (prev && prev.bf != null && entry.bf != null && Math.abs(entry.bf - prev.bf) > 5) warnings.push(`That body-fat figure is ${r1(Math.abs(entry.bf - prev.bf))} points different from your entry on ${prev.d} (${prev.bf}%).`);
    return { ok: true, errors, warnings, entry };
  }
  function upsert(entries, entry) {
    const list = (entries || []).filter(e => e.d !== entry.d); list.push(entry);
    const s = sorted(list); return s.length > MAX_ENTRIES ? s.slice(s.length - MAX_ENTRIES) : s;
  }
  const remove = (entries, d) => (entries || []).filter(e => e.d !== d);

  // ── smoothing: daily weight bounces around, so the 7-day average is the honest signal ──
  function movingAverage(entries, key, windowDays = 7) {
    const s = sorted(entries).filter(e => e[key] != null);
    return s.map(e => {
      const win = s.filter(x => x.d <= e.d && daysBetween(x.d, e.d) < windowDays);
      return { d: e.d, v: r2(win.reduce((a, x) => a + x[key], 0) / win.length) };
    });
  }
  const latestOf = (entries, key) => { const s = sorted(entries).filter(e => e[key] != null); return s.length ? s[s.length - 1] : null; };

  function trend(entries) {
    const s = sorted(entries); if (!s.length) return null;
    const wAvg = movingAverage(s, 'w'), bAvg = movingAverage(s, 'bf'), aAvg = movingAverage(s, 'wa');
    const last = s[s.length - 1], first = s[0];
    const nowW = wAvg.length ? wAvg[wAvg.length - 1].v : null, nowBf = bAvg.length ? bAvg[bAvg.length - 1].v : null, nowWa = aAvg.length ? aAvg[aAvg.length - 1].v : null;
    const at = (avg, daysAgo) => { const target = addDays(last.d, -daysAgo); const c = avg.filter(x => x.d <= target); return c.length ? c[c.length - 1] : null; };
    const w28 = at(wAvg, 28);
    const rate = nowW != null && w28 && daysBetween(w28.d, last.d) >= 14 ? r2((nowW - w28.v) / (daysBetween(w28.d, last.d) / 7)) : null;
    return {
      first, latest: last, count: s.length, weightNow: nowW, bfNow: nowBf, waistNow: nowWa,
      weightChange: nowW != null && first.w != null ? r1(nowW - first.w) : null,
      bfChange: nowBf != null && s.find(e => e.bf != null) ? r1(nowBf - s.find(e => e.bf != null).bf) : null,
      ratePerWeek: rate, spanDays: daysBetween(first.d, last.d),
    };
  }

  const bmi = (kg, cm) => (kg && cm ? r1(kg / Math.pow(cm / 100, 2)) : null);

  // ── goals ──
  // ctx: { gender, heightCm }
  function checkTargets(t, ctx = {}) {
    const errors = {}; const w = num(t.weight), bf = num(t.bf);
    if ((w == null) && (bf == null)) return { ok: false, errors: { general: 'Set a target weight, a target body fat, or both.' }, targets: null };
    if (Number.isNaN(w) || (w != null && (w < LIMITS.weight[0] || w > LIMITS.weight[1]))) errors.weight = `Target weight should be between ${LIMITS.weight[0]} and ${LIMITS.weight[1]} kg.`;
    else if (w != null && ctx.heightCm && bmi(w, ctx.heightCm) < MIN_BMI) errors.weight = `A target that low is below a healthy weight for your height (BMI ${bmi(w, ctx.heightCm)}). We can't plan for that. Please speak to a doctor or dietitian.`;
    if (Number.isNaN(bf) || (bf != null && (bf < LIMITS.bf[0] || bf > LIMITS.bf[1]))) errors.bf = `Target body fat should be between ${LIMITS.bf[0]}% and ${LIMITS.bf[1]}%.`;
    else if (bf != null) { const floor = BF_FLOOR[ctx.gender] || BF_FLOOR.other; if (bf < floor) errors.bf = `${r1(bf)}% is below the lowest body-fat level we can plan for safely (${floor}%). Please speak to a doctor or dietitian first.`; }
    if (Object.keys(errors).length) return { ok: false, errors, targets: null };
    return { ok: true, errors, targets: { weight: w == null ? null : r1(w), bf: bf == null ? null : r1(bf) } };
  }
  function makeTargets(t, entries, today) {
    const tr = trend(entries) || {};
    return { weight: t.weight, bf: t.bf, startWeight: tr.weightNow != null ? tr.weightNow : null, startBf: tr.bfNow != null ? tr.bfNow : null, startDate: today, setAt: today, reachedAt: null };
  }
  // progress toward each target, judged on the 7-day trend (so one lucky weigh-in can't "reach" a goal)
  function goalProgress(targets, entries) {
    if (!targets) return null; const tr = trend(entries); if (!tr) return null;
    const one = (target, start, now, tol) => {
      if (target == null || start == null || now == null) return null;
      const total = target - start; if (Math.abs(total) < 0.5) return { target, start, now, maintain: true, reached: false, pct: 100, remaining: r1(target - now) };
      const dir = total > 0 ? 1 : -1; const done = (now - start) * dir; const pct = Math.max(0, Math.min(100, Math.round(100 * done / Math.abs(total))));
      return { target, start, now, dir, maintain: false, reached: (target - now) * dir <= tol, pct, remaining: r1(target - now) };
    };
    const weight = one(targets.weight, targets.startWeight, tr.weightNow, 0.2), bf = one(targets.bf, targets.startBf, tr.bfNow, 0.3);
    const set = [weight, bf].filter(Boolean);
    return { weight, bf, reached: set.length > 0 && set.every(x => x.reached), any: set.length > 0 };
  }

  // ── should the plan be rebuilt? (calories and macros depend on weight and body fat) ──
  function planChangeAdvice(meta, entries) {
    const tr = trend(entries); if (!meta || !tr) return null;
    const p = meta.profile || {};
    const baseW = p.weight != null ? p.weight : meta.weightKg;
    const baseBf = p.bf != null ? p.bf : (meta.leanMassKg && meta.weightKg ? r1(100 * (1 - meta.leanMassKg / meta.weightKg)) : null);
    const reasons = [];
    if (baseW != null && tr.weightNow != null && Math.abs(tr.weightNow - baseW) >= Math.max(2, 0.03 * baseW)) reasons.push({ label: 'weight', from: r1(baseW), to: r1(tr.weightNow), unit: 'kg' });
    if (baseBf != null && tr.bfNow != null && Math.abs(tr.bfNow - baseBf) >= 2) reasons.push({ label: 'body fat', from: r1(baseBf), to: r1(tr.bfNow), unit: '%' });
    return reasons.length ? { reasons, weightNow: tr.weightNow, bfNow: tr.bfNow } : null;
  }
  function checkinDue(entries, today) {
    const s = sorted(entries); if (!s.length) return { due: true, days: null };
    const days = daysBetween(s[s.length - 1].d, today); return { due: days >= 7, days };
  }

  // ── chart geometry (SVG coordinates, computed here so it can be tested) ──
  function chartData(entries, key, target, w = 640, h = 240) {
    const m = { l: 46, r: 14, t: 14, b: 30 };
    const pts = sorted(entries).filter(e => e[key] != null); if (!pts.length) return null;
    const avg = movingAverage(entries, key);
    const vals = [...pts.map(p => p[key]), ...avg.map(a => a.v), ...(target != null ? [target] : [])];
    let lo = Math.min(...vals), hi = Math.max(...vals); if (hi - lo < 1) { lo -= 0.5; hi += 0.5; } const padV = (hi - lo) * 0.12; lo -= padV; hi += padV;
    const d0 = pts[0].d, span = Math.max(daysBetween(d0, pts[pts.length - 1].d), 7);
    const X = d => m.l + (daysBetween(d0, d) / span) * (w - m.l - m.r), Y = v => m.t + (1 - (v - lo) / (hi - lo)) * (h - m.t - m.b);
    const points = pts.map(p => ({ x: r1(X(p.d)), y: r1(Y(p[key])), d: p.d, v: p[key] }));
    const avgPts = avg.map(a => ({ x: r1(X(a.d)), y: r1(Y(a.v)) }));
    const line = arr => arr.map((p, i) => (i ? 'L' : 'M') + p.x + ' ' + p.y).join(' ');
    // round axis labels (e.g. 80, 82, 84) instead of awkward numbers like 82.9
    const raw = (hi - lo) / 4, mag = Math.pow(10, Math.floor(Math.log10(raw))), step = [1, 2, 2.5, 5, 10].map(f => f * mag).find(s => s >= raw) || raw;
    const ticks = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push({ y: r1(Y(v)), label: r1(v) });
    const xt = [0, 0.5, 1].map(f => { const d = addDays(d0, Math.round(span * f)); return { x: r1(X(d)), label: d.slice(5) }; });
    return { w, h, m, points, avgPoints: avgPts, path: line(points), avgPath: line(avgPts), targetY: target != null ? r1(Y(target)) : null, yTicks: ticks, xTicks: xt };
  }

  root.HFBody = { LIMITS, MAX_ENTRIES, MIN_BMI, BF_FLOOR, addDays, daysBetween, validDate, validateEntry, upsert, remove, movingAverage, latestOf, trend, bmi, checkTargets, makeTargets, goalProgress, planChangeAdvice, checkinDue, chartData, sorted };
})(typeof window !== 'undefined' ? window : globalThis);
