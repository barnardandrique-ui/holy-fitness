// lib/planner/engine.js
// ---------------------------------------------------------------------------
// Rule-based plan generator. No AI, no API calls, no cost per plan.
//
// How a plan is built:
//   1. Body composition  -> lean mass (weight x (1 - body fat))
//   2. Energy            -> Katch-McArdle BMR from lean mass, x activity
//                           multiplier from training days = maintenance (TDEE)
//   3. Goal adjustment   -> surplus / deficit sized by goal, experience,
//                           body fat and muscularity (FFMI), with safety floors
//   4. Macros            -> protein per kg of LEAN mass, fat as % of calories,
//                           carbs fill the rest (low-carb diets cap carbs)
//   5. Training          -> split from days/week + experience, exercises
//                           picked from a library, sets/reps from the goal
//   6. Nutrition         -> meals assembled from a food library, portions
//                           solved so each day lands on its calorie/macro target
//   7. Sleep             -> target hours from goal + stress, bedtime from a
//                           fixed wake time
//
// Randomness is seeded, so the same seed gives the same plan, and a new
// seed gives a different plan that still hits the same targets.
// ---------------------------------------------------------------------------

import { POOLS, FINISHERS, TEMPLATES, WARMUPS, COOLDOWNS } from './exercises.js';
import { FOODS, MEAL_TEMPLATES } from './foods.js';
import { assessHealth, womensAdjust } from './safety.js';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const GOALS = ['fat loss', 'recomposition', 'muscle gain', 'strength and power', 'athletic performance'];
const DIETS = ['standard', 'high protein', 'low carb', 'vegetarian', 'vegan', 'intermittent fasting'];
const LEVEL = { beginner: 1, intermediate: 2, advanced: 3 };

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

function makeRng(seed) {
  // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ───────────────────────────── Profile ─────────────────────────────
function num(v, d, lo, hi) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? clamp(n, lo, hi) : d;
}

export function normalizeProfile(raw = {}) {
  const goal = GOALS.includes(raw.goal) ? raw.goal : 'muscle gain';
  const diet = DIETS.includes(raw.diet) ? raw.diet : 'standard';
  return {
    name: String(raw.name || 'Athlete').slice(0, 60),
    gender: raw.gender === 'female' ? 'female' : 'male',
    age: num(raw.age, 28, 16, 80),
    height: num(raw.height, 175, 120, 230),
    weight: num(raw.weight, 80, 35, 250),
    bf: num(raw.bf, 18, 4, 60),
    freq: Math.round(num(raw.freq, 4, 2, 6)),
    exp: LEVEL[raw.exp] ? raw.exp : 'intermediate',
    sleep: num(raw.sleep, 7, 4, 10),
    stress: ['low', 'moderate', 'high'].includes(raw.stress) ? raw.stress : 'moderate',
    goal,
    diet,
    allerg: String(raw.allerg || 'none').slice(0, 200),
    cycle: String(raw.cycle || 'N/A'),
  };
}

// ───────────────────────────── Body & energy ─────────────────────────────
function computeBody(p) {
  const lbm = p.weight * (1 - p.bf / 100);
  const bmr = 370 + 21.6 * lbm; // Katch-McArdle
  const mult = { 2: 1.375, 3: 1.45, 4: 1.55, 5: 1.65, 6: 1.725 }[p.freq];
  const tdee = bmr * mult;
  const hm = p.height / 100;
  const ffmi = lbm / (hm * hm) + 6.1 * (1.8 - hm); // normalized fat-free mass index
  return { lbm, fatMass: p.weight - lbm, bmr, tdee, mult, ffmi };
}

function calorieTarget(p, body, cyc, notes, limits) {
  const female = p.gender === 'female';
  const highBf = female ? p.bf >= 32 : p.bf >= 25;
  const lean = female ? p.bf < 20 : p.bf < 12;
  const veryLean = female ? p.bf < 16 : p.bf < 9;
  const highFfmi = female ? body.ffmi >= 19 : body.ffmi >= 23;

  let pct;
  switch (p.goal) {
    case 'fat loss':
      pct = highBf ? -0.25 : lean ? -0.12 : -0.2;
      if (veryLean) {
        pct = 0;
        notes.push({ level: 'info', text: 'You are already very lean, so this plan holds maintenance calories instead of cutting.' });
      } else if (p.age < 18) {
        pct = Math.max(pct, -0.1);
        notes.push({ level: 'caution', text: 'Because you are under 18, the calorie deficit is kept small. Please check with a doctor before dieting.' });
      }
      break;
    case 'recomposition':
      pct = highBf ? -0.1 : lean ? 0.02 : -0.05;
      break;
    case 'muscle gain': {
      let base = { beginner: 0.12, intermediate: 0.1, advanced: 0.07 }[p.exp];
      if (highBf || highFfmi) base = Math.min(base, 0.05);
      pct = base;
      break;
    }
    case 'strength and power':
      pct = highBf ? 0.03 : 0.05;
      break;
    default:
      pct = 0.03; // athletic performance
  }

  if (limits) {
    if (pct < 0 && limits.maxDeficit != null) pct = Math.max(pct, -limits.maxDeficit);
    if (pct > 0 && limits.maxSurplus != null) pct = Math.min(pct, limits.maxSurplus);
  }

  let kcal = body.tdee * (1 + pct) + cyc.kcal;
  const floor = Math.max(female ? 1200 : 1500, body.bmr);
  if (kcal < floor) kcal = floor;
  // Round toward maintenance so a deficit/surplus cap is never exceeded.
  kcal = kcal < body.tdee ? Math.ceil(kcal / 10) * 10 : Math.floor(kcal / 10) * 10;
  return { kcal, pct: kcal / body.tdee - 1 };
}

function macroTargets(p, body, kcal) {
  const female = p.gender === 'female';
  const perKgLbm = { 'fat loss': 2.7, recomposition: 2.4, 'muscle gain': 2.2, 'strength and power': 2.0, 'athletic performance': 1.9 }[p.goal];
  let protein = perKgLbm * body.lbm;
  if (p.diet === 'vegan') protein *= 1.08;
  else if (p.diet === 'vegetarian') protein *= 1.04;
  if (p.diet === 'high protein') protein *= 1.1;
  protein = Math.max(protein, 1.2 * p.weight);
  protein = Math.min(protein, (0.4 * kcal) / 4, 2.8 * p.weight);

  const fatPct = p.diet === 'low carb' ? 0.45 : female ? 0.28 : 0.25;
  const minFat = (female ? 1.0 : 0.85) * body.lbm;
  let fat = Math.max((fatPct * kcal) / 9, minFat);
  let carbs = (kcal - 4 * protein - 9 * fat) / 4;

  if (p.diet === 'low carb') {
    const cap = clamp(1.4 * body.lbm, 50, 130);
    if (carbs > cap) {
      carbs = cap;
      fat = (kcal - 4 * protein - 4 * carbs) / 9;
    }
  } else if (carbs < 60) {
    carbs = 60;
    fat = Math.max(minFat * 0.8, (kcal - 4 * protein - 4 * carbs) / 9);
  }
  return { protein, fat, carbs, minFat, perKgLbm };
}

// ───────────────────────────── Training ─────────────────────────────
const SCHEDULE = {
  2: { days: [0, 3], seq: ['Full Body A', 'Full Body B'], name: 'Full Body', short: 'Full Body' },
  3: { days: [0, 2, 4], seq: ['Full Body A', 'Full Body B', 'Full Body A'], name: 'Full Body (3 days)', short: 'Full Body' },
  4: { days: [0, 1, 3, 4], seq: ['Upper A', 'Lower A', 'Upper B', 'Lower B'], name: 'Upper/Lower', short: 'Upper/Lower' },
  5: { days: [0, 1, 2, 4, 5], seq: ['Push A', 'Pull A', 'Legs A', 'Upper B', 'Lower B'], name: 'Push/Pull/Legs + Upper/Lower', short: 'PPL + Upper/Lower' },
  6: { days: [0, 1, 2, 3, 4, 5], seq: ['Push A', 'Pull A', 'Legs A', 'Push B', 'Pull B', 'Legs B'], name: 'Push/Pull/Legs', short: 'Push/Pull/Legs' },
};

const SCHEME_TABLE = {
  hyp: { main: [4, '6-8', '120s'], secondary: [3, '8-10', '90s'], accessory: [3, '10-12', '75s'], isolation: [3, '12-15', '60s'] },
  cut: { main: [4, '8-10', '90s'], secondary: [3, '10-12', '75s'], accessory: [3, '10-12', '60s'], isolation: [3, '12-15', '45s'] },
  str: { main: [5, '3-5', '180s'], secondary: [4, '5-6', '120s'], accessory: [3, '8-10', '90s'], isolation: [3, '10-12', '60s'] },
  perf: { main: [4, '4-6', '150s'], secondary: [3, '6-8', '90s'], accessory: [3, '8-10', '75s'], isolation: [3, '10-12', '60s'] },
};
const NOTE_TABLE = {
  hyp: { main: 'RIR 2, add weight once all reps are clean', secondary: 'RIR 1-2', accessory: 'RIR 1, controlled tempo', isolation: 'Near failure, control the lowering' },
  str: { main: 'RPE 8, add 2.5 kg when sets feel smooth', secondary: 'RPE 7-8', accessory: 'Controlled, 1-2 reps in reserve', isolation: 'Controlled, 1-2 reps in reserve' },
  perf: { main: 'Fast bar speed, crisp reps', secondary: 'Smooth and fast', accessory: 'Controlled, 1-2 reps in reserve', isolation: 'Controlled, 1-2 reps in reserve' },
};
NOTE_TABLE.cut = NOTE_TABLE.hyp;

const GENTLE_TABLE = { main: [3, '8-10', '90s'], secondary: [3, '10-12', '90s'], accessory: [2, '10-12', '60s'], isolation: [2, '12-15', '60s'] };

function getScheme(goal, role, lvl, gentle = false) {
  if (role === 'power') return { sets: 4, reps: '3-5', rest: '90s', note: 'Explosive, stop before form slows' };
  if (role === 'core') return { sets: lvl === 1 ? 2 : 3, reps: '12-15', rest: '45s', note: 'Slow and controlled' };

  if (gentle) {
    const g = GENTLE_TABLE[role];
    return { sets: g[0], reps: g[1], rest: g[2], note: 'RPE 6-7, stop 2-3 reps short, keep breathing' };
  }

  const key = goal === 'fat loss' ? 'cut' : goal === 'strength and power' ? 'str' : goal === 'athletic performance' ? 'perf' : 'hyp';
  if (lvl === 1) {
    const strength = goal === 'strength and power';
    const t = {
      main: [3, strength ? '5' : '8-10', strength ? '120s' : '90s'],
      secondary: [3, '10-12', '90s'],
      accessory: [2, '10-12', '60s'],
      isolation: [2, '12-15', '60s'],
    }[role];
    return { sets: t[0], reps: t[1], rest: t[2], note: role === 'main' ? 'Nail your form, leave 2-3 reps in reserve' : 'Smooth, controlled reps' };
  }
  const t = SCHEME_TABLE[key][role];
  let sets = t[0];
  if (lvl === 3 && (role === 'accessory' || role === 'isolation')) sets = Math.min(4, sets + 1);
  return { sets, reps: t[1], rest: t[2], note: NOTE_TABLE[key][role] };
}

function chooseExercise(slot, lvl, goal, usedSession, usedWeek, rng, lowImpact = false) {
  const all = POOLS[slot.pool];
  let cands = all.filter(e => e.lvl <= lvl && (e.maxLvl == null || lvl <= e.maxLvl));
  if (lowImpact) {
    // Gentle / low-impact plans only ever use exercises flagged `li` (safe) in the library.
    let safe = cands.filter(e => e.li);
    if (!safe.length) safe = all.filter(e => e.li);
    if (safe.length) cands = safe;
  }
  if (slot.role === 'main' || slot.role === 'secondary') {
    const strong = cands.filter(e => !e.noMain);
    if (strong.length) cands = strong;
  }
  if (lvl === 3 && (slot.role === 'main' || slot.role === 'secondary')) {
    const adv = cands.filter(e => e.lvl >= 2);
    if (adv.length) cands = adv;
  }
  if (goal === 'strength and power' && slot.role === 'main' && lvl >= 2) {
    const strong = cands.filter(e => e.strength);
    if (strong.length) cands = strong;
  }
  let fresh = cands.filter(e => !usedSession.has(e.name) && !usedWeek.has(e.name));
  if (!fresh.length) fresh = cands.filter(e => !usedSession.has(e.name));
  if (!fresh.length) fresh = cands;
  return pick(rng, fresh);
}

function formatExercise(ex, role, p, lvl, volMod, gentle = false) {
  const s = getScheme(p.goal, role, lvl, gentle);
  let sets = s.sets;
  if (role === 'core' || role === 'secondary' || role === 'accessory' || role === 'isolation') sets = Math.max(2, Math.round(sets * volMod));
  else if (role === 'main' && volMod <= 0.85) sets = Math.max(2, sets - 1);
  let reps = s.reps;
  if (ex.timed) reps = '30-45s';
  else if (ex.perSide) reps = `${reps} / side`;
  return { name: ex.name, libId: ex.id, sets: String(sets), reps, rest: s.rest, notes: s.note };
}

function buildTraining(p, rng, volMod, mode = {}) {
  const { gentle = false, lowImpact = false, obese = false } = mode;
  const lvl = LEVEL[p.exp];
  const sched = SCHEDULE[p.freq];
  const usedWeek = new Set();
  const restText = obese
    ? 'Active recovery: 30-45 min walk (build toward 8,000+ steps a day), 10 min mobility'
    : p.goal === 'fat loss'
      ? 'Active recovery: 8-10k steps, 30-40 min easy cardio, 10 min mobility'
      : 'Active recovery: 20-30 min easy walk or bike, 10 min mobility and stretching';
  const days = DAY_NAMES.map(() => ({ isRest: true, label: 'Rest & Recovery', warmup: restText, cooldown: 'Light stretching or foam rolling', exercises: [] }));

  sched.days.forEach((dayIdx, i) => {
    const tpl = TEMPLATES[sched.seq[i]];
    const usedSession = new Set();
    const slots = [...tpl.slots];
    if (p.goal === 'athletic performance' && !lowImpact) slots.unshift({ pool: 'power', role: 'power', min: 1 });
    const exercises = [];
    for (const slot of slots) {
      if (slot.min > lvl) continue;
      const ex = chooseExercise(slot, lvl, p.goal, usedSession, usedWeek, rng, lowImpact);
      usedSession.add(ex.name);
      usedWeek.add(ex.name);
      exercises.push(formatExercise(ex, slot.role, p, lvl, volMod, gentle));
    }
    if (p.goal === 'fat loss') {
      const walk = FINISHERS.find(f => f.name === 'Incline Treadmill Walk');
      exercises.push({ ...(gentle ? walk : pick(rng, FINISHERS)) });
    }
    days[dayIdx] = { isRest: false, label: tpl.label, warmup: WARMUPS[tpl.base], cooldown: COOLDOWNS[tpl.base], exercises };
  });
  return days;
}

// ───────────────────────────── Nutrition ─────────────────────────────
const ALLERGY_MAP = {
  dairy: ['dairy'], milk: ['dairy'], lactose: ['dairy'], cheese: ['dairy'], yogurt: ['dairy'], yoghurt: ['dairy'], whey: ['dairy'], casein: ['dairy'],
  egg: ['egg'], eggs: ['egg'],
  gluten: ['gluten'], wheat: ['gluten'], celiac: ['gluten'], coeliac: ['gluten'], barley: ['gluten'], rye: ['gluten'],
  nut: ['treenut', 'peanut'], nuts: ['treenut', 'peanut'], treenut: ['treenut'], treenuts: ['treenut'],
  almond: ['treenut'], almonds: ['treenut'], walnut: ['treenut'], walnuts: ['treenut'], cashew: ['treenut'], cashews: ['treenut'], pecan: ['treenut'], hazelnut: ['treenut'], pistachio: ['treenut'],
  peanut: ['peanut'], peanuts: ['peanut'],
  soy: ['soy'], soya: ['soy'], tofu: ['soy'], tempeh: ['soy'], edamame: ['soy'],
  fish: ['fish'], salmon: ['fish'], tuna: ['fish'], cod: ['fish'], seafood: ['fish', 'shellfish'],
  shellfish: ['shellfish'], shrimp: ['shellfish'], prawn: ['shellfish'], prawns: ['shellfish'], crab: ['shellfish'], lobster: ['shellfish'],
  beef: ['beef'], pork: ['pork'], chicken: ['poultry'], turkey: ['poultry'], poultry: ['poultry'], meat: ['flesh'],
};
const STOPWORDS = new Set(['and', 'allergy', 'allergic', 'allergies', 'intolerant', 'intolerance', 'avoid', 'avoidance', 'free', 'the', 'dont', 'not', 'eat', 'like', 'none', 'nothing', 'any', 'all']);

function allowedFoods(p) {
  const banned = new Set();
  const textBans = [];
  if (p.diet === 'vegan') ['flesh', 'egg', 'dairy'].forEach(t => banned.add(t));
  if (p.diet === 'vegetarian') banned.add('flesh');

  const tokens = p.allerg.toLowerCase().split(/[^a-z]+/).filter(t => t.length >= 3 && !STOPWORDS.has(t));
  for (const tok of tokens) {
    if (ALLERGY_MAP[tok]) ALLERGY_MAP[tok].forEach(t => banned.add(t));
    else if (tok.length >= 4) textBans.push(tok.replace(/s$/, ''));
  }

  const map = new Map();
  for (const f of FOODS) {
    if (f.tags.some(t => banned.has(t))) continue;
    const lbl = f.label.toLowerCase();
    if (textBans.some(w => lbl.includes(w))) continue;
    map.set(f.id, f);
  }
  return map;
}

const macroOf = (it, m) => (it.food[m] * it.g) / 100;
function sumMacros(items) {
  const t = { p: 0, c: 0, f: 0 };
  for (const it of items) {
    t.p += macroOf(it, 'p');
    t.c += macroOf(it, 'c');
    t.f += macroOf(it, 'f');
  }
  return t;
}

const ROLE_BOUNDS = { p: [40, 450], c: [30, 800], f: [3, 60] };
// Carbs and fats can shrink toward zero while solving (so low-calorie or low-carb
// days can hit their targets); anything left smaller than 60% of a sensible minimum
// portion is dropped at the end. Protein sources always keep a real portion.
function mkItem(food, role, g, fixed = false) {
  if (fixed) return { food, role, fixed: true, g, min: g, max: g, dropBelow: 0 };
  const [dmin, dmax] = ROLE_BOUNDS[role];
  const sensibleMin = food.min ?? dmin;
  const max = food.max ?? dmax;
  const min = role === 'p' ? sensibleMin : 0;
  return { food, role, fixed: false, g: clamp(g, min, max), min, max, dropBelow: role === 'p' ? 0 : sensibleMin * 0.6 };
}

// Nudges flexible portions until macros land on the target.
function solveItems(items, target, mode = 'equal', iters = 60) {
  for (let k = 0; k < iters; k++) {
    const tot = sumMacros(items);
    for (const m of ['p', 'c', 'f']) {
      const flex = items.filter(i => !i.fixed && i.role === m);
      if (!flex.length) continue;
      const err = target[m] - tot[m];
      let weights;
      if (mode === 'proportional') {
        const contrib = flex.map(i => macroOf(i, m));
        const s = contrib.reduce((a, b) => a + b, 0);
        weights = s > 0 ? contrib.map(c => c / s) : flex.map(() => 1 / flex.length);
      } else {
        weights = flex.map(() => 1 / flex.length);
      }
      flex.forEach((i, idx) => {
        const per = i.food[m] / 100;
        i.g = clamp(i.g + (0.6 * err * weights[idx]) / per, i.min, i.max);
      });
    }
  }
}

function pickLeastUsed(rng, opts, usage) {
  let best = null;
  let bestScore = Infinity;
  for (const f of opts) {
    const score = (usage[f.id] || 0) + rng() * 1.6;
    if (score < bestScore) { best = f; bestScore = score; }
  }
  return best;
}

// Omnivores get animal proteins; tofu/tempeh/legumes are kept for vegetarian/vegan
// plans (or used only if allergies leave nothing else).
function proteinOptions(tpl, allowed, omni) {
  const all = (tpl.protein || []).map(id => allowed.get(id)).filter(Boolean);
  if (!omni) return all;
  const animalOrPowder = all.filter(f => !f.plant);
  return animalOrPowder.length ? animalOrPowder : all;
}

function resolveTemplate(tpl, ctx, target) {
  const { allowed, rng, usage, omni } = ctx;
  const items = [];
  for (const fx of tpl.fixed || []) {
    const food = allowed.get(fx.food);
    if (!food) return null;
    items.push(mkItem(food, 'x', fx.g, true));
  }
  const opts = ids => (ids || []).map(id => allowed.get(id)).filter(Boolean);
  const pOpts = proteinOptions(tpl, allowed, omni);
  const cOpts = opts(tpl.carb);
  if (!pOpts.length || !cOpts.length) return null;

  const protein = pickLeastUsed(rng, pOpts, usage);
  items.push(mkItem(protein, 'p', (target.p / (protein.p / 100)) * 0.75));

  // Primary carb, plus ONE extra source if the primary can't realistically carry the target.
  // Extra sources come from a different food family, so a plate never stacks two grains
  // or two potatoes.
  const capacity = c => (c.c * (c.max ?? 800)) / 100 * 0.95;
  const primary = pickLeastUsed(rng, cOpts, usage);
  const chosenCarbs = [primary];
  if (capacity(primary) < target.c) {
    const ok = c => c !== primary && (c.fam === 'fruit' || c.fam !== primary.fam);
    let overflow = opts(tpl.carb2).filter(ok);
    if (!overflow.length) overflow = cOpts.filter(ok);
    if (overflow.length) chosenCarbs.push(pickLeastUsed(rng, overflow, usage));
  }
  const share = target.c / chosenCarbs.length;
  chosenCarbs.forEach(c => items.push(mkItem(c, 'c', (share / (c.c / 100)) * 0.8)));

  const fOpts = opts(tpl.fat);
  if (fOpts.length) {
    const nFat = target.f >= 28 && fOpts.length >= 2 ? 2 : 1;
    const chosen = [];
    for (let k = 0; k < nFat; k++) {
      const f = pickLeastUsed(rng, fOpts.filter(x => !chosen.includes(x)), usage);
      chosen.push(f);
      items.push(mkItem(f, 'f', target.f / nFat / (f.f / 100)));
    }
  }
  const vOpts = opts(tpl.veg);
  if (vOpts.length) items.push(mkItem(pick(rng, vOpts), 'v', tpl.type === 'breakfast' ? 100 : 150, true));
  return items;
}

function templateValid(tpl, allowed, omni, strict = true) {
  if ((tpl.fixed || []).some(fx => !allowed.has(fx.food))) return false;
  const opts = proteinOptions(tpl, allowed, omni);
  if (!opts.length || !(tpl.carb || []).some(id => allowed.has(id))) return false;
  // Plant-only breakfasts/snacks are kept for vegetarian/vegan plans (strict mode).
  if (strict && omni && tpl.type !== 'main' && opts.every(f => f.plant)) return false;
  return true;
}

function mealError(items, target, dayProteins, usage, tplName, dayTpls) {
  const t = sumMacros(items);
  let e = Math.abs(t.p - target.p) / Math.max(target.p, 15)
        + Math.abs(t.c - target.c) / Math.max(target.c, 25)
        + Math.abs(t.f - target.f) / Math.max(target.f, 10);
  if (tplName && dayTpls.has(tplName)) e += 0.7;
  const protein = items.find(i => i.role === 'p');
  if (protein) {
    if (dayProteins.has(protein.food.id)) e += 0.6;
    e += 0.12 * (usage[protein.food.id] || 0);
  }
  return e;
}

function buildMeal(type, target, ctx, dayProteins) {
  const { allowed, rng, usage, omni } = ctx;
  const valid = (ty, strict) => MEAL_TEMPLATES.filter(t => t.type === ty && templateValid(t, allowed, omni, strict));
  let pool = valid(type, true);
  if (!pool.length) pool = valid(type, false);
  if (!pool.length && type !== 'main') pool = valid('main', false);
  if (!pool.length) throw new Error('Your food restrictions leave too few options to build meals. Try removing one of them.');

  let best = null;
  for (let k = 0; k < 8; k++) {
    const tpl = pick(rng, pool);
    const items = resolveTemplate(tpl, ctx, target);
    if (!items) continue;
    solveItems(items, target, 'equal', 50);
    const err = mealError(items, target, dayProteins, usage, tpl.name, ctx.dayTpls);
    if (!best || err < best.err) best = { tpl, items, err };
  }
  if (!best) throw new Error('Could not build a meal from your food preferences.');
  if (best.tpl.name) ctx.dayTpls.add(best.tpl.name);
  const prot = best.items.find(i => i.role === 'p');
  if (prot) {
    usage[prot.food.id] = (usage[prot.food.id] || 0) + 1;
    dayProteins.add(prot.food.id);
  }
  best.items.filter(i => i.role === 'c').forEach(c => { usage[c.food.id] = (usage[c.food.id] || 0) + 0.5; });
  return best;
}

const fmtPieces = n => {
  const whole = Math.floor(n);
  return n % 1 === 0.5 ? `${whole || ''}½` : String(n);
};

function finalizeItem(it) {
  const f = it.food;
  if (!it.fixed && it.g < it.dropBelow) return null;
  let grams, text;
  if (f.piece) {
    const step = f.piece.step || 1;
    let n = Math.round(it.g / f.piece.g / step) * step;
    if (it.fixed) n = Math.max(n, step);
    if (n <= 0) return null;
    grams = n * f.piece.g;
    text = `${fmtPieces(n)} ${n <= 1 ? f.piece.one : f.piece.many}`;
  } else {
    const stepG = it.g >= 400 ? 10 : 5;
    const g = Math.round(it.g / stepG) * stepG;
    if (g <= 0) return null;
    grams = g;
    text = `${g}g ${f.label}`;
  }
  return { food: f, role: it.role, grams, text, p: (f.p * grams) / 100, c: (f.c * grams) / 100, f: (f.f * grams) / 100 };
}

const shortName = label => label
  .replace(/\s*\(.*?\)/g, '')
  .replace(/^(cooked|baked|grilled|roast|roasted|steamed|wilted|sautéed|canned|liquid|shelled|firm|low-fat|non-fat|rolled|whole-wheat)\s+/i, '')
  .replace(/^(cooked|baked|grilled|roast|roasted)\s+/i, '');
const titleCase = s => s.replace(/\b([a-z])/g, c => c.toUpperCase());

// Names a meal from what is actually on the plate (used when a template's headline
// ingredient was dropped, e.g. the banana in a low-carb "shake & banana").
function dynamicName(fin) {
  const prot = fin.find(i => i.role === 'p');
  const side = fin.find(i => i.role === 'c') || fin.find(i => i.role === 'v') || fin.find(i => i.role === 'f');
  if (!prot) return 'Balanced Plate';
  const pName = titleCase(shortName(prot.food.label)).replace(/\s*\(.*\)/, '');
  if (!side) return /powder/i.test(pName) ? 'Protein Shake' : pName;
  return `${pName} with ${titleCase(shortName(side.food.label))}`;
}

function scheduleFor(p, dayT, isTrain, extra = 0) {
  if (p.diet === 'intermittent fasting') {
    const cap = 165;
    return [
      { time: '12:00 PM', label: 'First Meal', type: 'main', cap },
      { time: '4:00 PM', label: isTrain ? 'Pre-Workout Meal' : 'Second Meal', type: 'main', cap },
      { time: '7:30 PM', label: isTrain ? 'Post-Workout Meal' : 'Third Meal', type: 'main', cap },
    ];
  }
  // Very low calorie days: three meals, so minimum portion sizes don't overshoot the target.
  if (dayT.kcal < 1500) {
    return [
      { time: '7:30 AM', label: 'Breakfast', type: 'breakfast', cap: 130 },
      { time: '12:30 PM', label: 'Lunch', type: 'main', cap: 115 },
      { time: '7:30 PM', label: isTrain ? 'Post-Workout Dinner' : 'Dinner', type: 'main', cap: 115 },
    ];
  }
  const six = dayT.c >= 470 || extra >= 2;
  const five = dayT.c >= 330 || extra >= 1;
  const meals = [{ time: '7:30 AM', label: 'Breakfast', type: 'breakfast', cap: 130 }];
  if (six) meals.push({ time: '10:00 AM', label: 'Mid-Morning Snack', type: 'snack', cap: 65 });
  meals.push(
    { time: '12:30 PM', label: 'Lunch', type: 'main', cap: 115 },
    { time: '4:30 PM', label: isTrain ? 'Pre-Workout Snack' : 'Afternoon Snack', type: 'snack', cap: 65 },
    { time: '7:30 PM', label: isTrain ? 'Post-Workout Dinner' : 'Dinner', type: 'main', cap: 115 },
  );
  if (five) meals.push({ time: '9:30 PM', label: 'Evening Snack', type: 'snack', cap: 65 });
  return meals;
}

const MEAL_WEIGHTS = {
  3: { p: [0.34, 0.33, 0.33], ct: [0.30, 0.34, 0.36], cr: [0.34, 0.33, 0.33], f: [0.34, 0.33, 0.33] },
  4: { p: [0.25, 0.28, 0.17, 0.30], ct: [0.22, 0.26, 0.22, 0.30], cr: [0.25, 0.30, 0.15, 0.30], f: [0.30, 0.28, 0.14, 0.28] },
  5: { p: [0.22, 0.24, 0.14, 0.26, 0.14], ct: [0.20, 0.24, 0.20, 0.26, 0.10], cr: [0.22, 0.26, 0.14, 0.28, 0.10], f: [0.26, 0.26, 0.12, 0.24, 0.12] },
  6: { p: [0.19, 0.10, 0.20, 0.14, 0.25, 0.12], ct: [0.19, 0.10, 0.21, 0.17, 0.23, 0.10], cr: [0.20, 0.10, 0.22, 0.14, 0.24, 0.10], f: [0.24, 0.10, 0.22, 0.12, 0.22, 0.10] },
};

// Any carbs a meal can't sensibly hold (slot.cap) are moved to meals with room.
function distributeCarbs(sched, weights, dayCarbs) {
  let t = weights.map(w => dayCarbs * w);
  for (let k = 0; k < 8; k++) {
    let excess = 0;
    t = t.map((c, i) => {
      if (c > sched[i].cap) { excess += c - sched[i].cap; return sched[i].cap; }
      return c;
    });
    const room = t.map((c, i) => Math.max(0, sched[i].cap - c));
    const roomSum = room.reduce((a, b) => a + b, 0);
    if (excess < 0.5 || roomSum <= 0) break;
    t = t.map((c, i) => c + (excess * room[i]) / roomSum);
  }
  return t;
}

function buildNutritionDay(p, body, dayT, isTrain, rng, allowed, usage) {
  // If a day can't reach its calories in the standard number of meals (restricted diets
  // have fewer calorie-dense options), add a snack, like a dietitian would.
  let best = buildNutritionAttempt(p, body, dayT, isTrain, rng, allowed, usage, 0);
  const natural = best.meals.length;
  const canExtend = p.diet !== 'intermittent fasting' && dayT.kcal >= 1500;
  for (let extra = 1; extra <= 2 && canExtend && natural + extra <= 6; extra++) {
    const under = (dayT.kcal - best.totalCalories) / dayT.kcal;
    if (under < 0.05) break;
    const next = buildNutritionAttempt(p, body, dayT, isTrain, rng, allowed, usage, extra);
    if (Math.abs(next.totalCalories - dayT.kcal) < Math.abs(best.totalCalories - dayT.kcal)) best = next;
  }
  return best;
}

function buildNutritionAttempt(p, body, dayT, isTrain, rng, allowed, usage, extra) {
  const omni = p.diet !== 'vegan' && p.diet !== 'vegetarian';
  const ctx = { allowed, rng, usage, omni, dayTpls: new Set() };
  const sched = scheduleFor(p, dayT, isTrain, extra);
  const W = MEAL_WEIGHTS[sched.length];
  const cw = isTrain ? W.ct : W.cr;
  const dayProteins = new Set();

  const carbTargets = distributeCarbs(sched, cw, dayT.c);
  const meals = sched.map((slot, i) => {
    const target = { p: dayT.p * W.p[i], c: carbTargets[i], f: dayT.f * W.f[i] };
    const built = buildMeal(slot.type, target, ctx, dayProteins);
    return { slot, tpl: built.tpl, items: built.items };
  });

  // Global pass: pull the whole day onto its macro targets.
  const all = meals.flatMap(m => m.items);
  solveItems(all, { p: dayT.p, c: dayT.c, f: dayT.f }, 'proportional', 60);

  // Calorie correction: protein often lands above target (carb foods carry protein too),
  // so trim or add carbs, then fats if carbs are exhausted, until calories hit the target.
  for (let pass = 0; pass < 6; pass++) {
    const tot = sumMacros(all);
    const err = dayT.kcal - (4 * tot.p + 4 * tot.c + 9 * tot.f);
    if (Math.abs(err) < dayT.kcal * 0.006) break;
    let remaining = err;
    for (const role of ['c', 'f']) {
      const flex = all.filter(i => !i.fixed && i.role === role);
      if (!flex.length || Math.abs(remaining) < 1) continue;
      const kPerG = role === 'c' ? 4 : 9;
      const contrib = flex.map(i => macroOf(i, role));
      const sum = contrib.reduce((a, b) => a + b, 0);
      const w = sum > 0 ? contrib.map(c => c / sum) : flex.map(() => 1 / flex.length);
      let applied = 0;
      flex.forEach((i, idx) => {
        const per = i.food[role] / 100;
        const before = i.g;
        i.g = clamp(i.g + (remaining / kPerG) * w[idx] / per, i.min, i.max);
        applied += (i.g - before) * per * kPerG;
      });
      remaining -= applied;
    }
  }

  const out = meals.map(m => {
    const fin = m.items.map(finalizeItem).filter(Boolean);
    const order = { x: 0, p: 1, c: 2, f: 3, v: 4 };
    fin.sort((a, b) => order[a.role] - order[b.role]);
    const tot = fin.reduce((t, i) => ({ p: t.p + i.p, c: t.c + i.c, f: t.f + i.f }), { p: 0, c: 0, f: 0 });
    const ids = new Set(fin.map(i => i.food.id));
    const needsOk = (m.tpl.needs || []).every(group => group.some(id => ids.has(id)));
    let name = m.tpl.name && needsOk ? m.tpl.name : dynamicName(fin);
    return {
      time: m.slot.time,
      name: `${m.slot.label} · ${name}`,
      foods: fin.map(i => i.text).join(', '),
      calories: Math.round(4 * tot.p + 4 * tot.c + 9 * tot.f),
      protein: Math.round(tot.p),
      carbs: Math.round(tot.c),
      fats: Math.round(tot.f),
    };
  });

  const total = out.reduce((t, m) => ({ k: t.k + m.calories, p: t.p + m.protein, c: t.c + m.carbs, f: t.f + m.fats }), { k: 0, p: 0, c: 0, f: 0 });
  const liters = (p.weight * 0.035 + (isTrain ? 0.5 : 0)).toFixed(1);
  return {
    totalCalories: total.k,
    totals: total,
    meals: out,
    hydration: `${liters} L water${isTrain ? ' (includes training)' : ''}, more in hot weather`,
    supplements: supplementText(p, allowed, isTrain),
  };
}

function supplementText(p, allowed, isTrain) {
  const parts = ['Creatine monohydrate 3-5 g'];
  if (isTrain) parts.push(allowed.has('whey') ? 'protein powder if short of your target' : 'plant protein powder if short of your target');
  parts.push('omega-3 with a meal');
  return parts.join(' · ');
}

// ───────────────────────────── Sleep ─────────────────────────────
const fmtTime = mins => {
  const m = ((mins % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0');
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${mm} ${h24 < 12 ? 'AM' : 'PM'}`;
};

const SLEEP_NOTES = {
  train: [
    'Caffeine off by 2 PM, 10 min mobility and dim lights after training',
    'Carbs at dinner and a cool room (17-19 °C) help deep sleep after hard training',
    'Phone out of the bedroom, 5 min slow breathing before bed',
    'Finish your last meal 2-3 hours before bed',
  ],
  rest: [
    'Same wake time as training days, 10 min morning sunlight',
    'Keep naps under 20 min and before 3 PM',
    'Light dinner, no screens for 45 min before bed',
    'Short evening walk, then lights low an hour before bed',
  ],
};

function buildSleep(p, trainFlags, bonus = 0) {
  const base = { 'fat loss': 8, recomposition: 8, 'muscle gain': 8, 'strength and power': 8.5, 'athletic performance': 8.5 }[p.goal];
  const hours = clamp(base + (p.stress === 'high' ? 0.5 : 0) + bonus, 7.5, 9);
  const wake = 6 * 60 + 30;
  const bed = wake - hours * 60 - 15;
  let ti = 0;
  let ri = 0;
  const perDay = trainFlags.map(isTrain => ({
    targetHours: hours,
    bedtime: fmtTime(bed),
    wakeTime: fmtTime(wake),
    protocol: isTrain ? SLEEP_NOTES.train[ti++ % SLEEP_NOTES.train.length] : SLEEP_NOTES.rest[ri++ % SLEEP_NOTES.rest.length],
  }));

  const gap = hours - p.sleep;
  const goalWhy = {
    'fat loss': 'short sleep raises hunger hormones and cravings, which makes dieting harder',
    recomposition: 'sleep is when you rebuild muscle while staying in a mild deficit',
    'muscle gain': 'most muscle repair and growth-hormone release happens in deep sleep',
    'strength and power': 'strength and nervous-system recovery depend on long, consistent sleep',
    'athletic performance': 'reaction time, power and injury resistance all drop with short sleep',
  }[p.goal];
  const overview = `You told us you sleep about ${p.sleep} hours. For your goal, ${goalWhy}, so aim for ${hours} hours a night. `
    + (gap > 0.5
      ? `Move your bedtime 15-30 minutes earlier each week until you reach ${fmtTime(bed)}, and keep your ${fmtTime(wake)} wake time fixed.`
      : `You are already close, so protect it with a fixed ${fmtTime(wake)} wake time and a ${fmtTime(bed)} bedtime.`);
  const tips = [
    `Keep the same wake time (${fmtTime(wake)}) every day, including weekends`,
    'Stop caffeine 8 hours before bed and get 10 minutes of daylight after waking',
    'Keep the bedroom cool (17-19 °C), dark and phone-free',
    p.stress === 'high'
      ? 'High stress: do 5-10 minutes of slow breathing or a short walk each evening'
      : 'Wind down for 20-30 minutes before bed with dim lights and no screens',
  ];
  return { perDay, overview, tips, hours, bed, wake };
}

// ───────────────────────────── Assembly ─────────────────────────────
const GOAL_SHORT = { 'fat loss': 'Lean-Out', recomposition: 'Recomp', 'muscle gain': 'Hypertrophy', 'strength and power': 'Strength', 'athletic performance': 'Performance' };
const GOAL_PHRASE = { 'fat loss': 'fat loss', recomposition: 'body recomposition', 'muscle gain': 'muscle gain', 'strength and power': 'strength and power', 'athletic performance': 'athletic performance' };

export function generatePlan(rawProfile = {}, options = {}) {
  const p = normalizeProfile(rawProfile);

  // Health screening comes first. If a condition needs a doctor, no plan is produced.
  const assess = assessHealth(p, rawProfile && rawProfile.health);
  if (assess.blocked) {
    return { blocked: true, reasons: assess.reasons, eatingDisorder: assess.eatingDisorder, message: assess.message };
  }

  const seed = options.seed != null ? options.seed >>> 0 : ((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);
  const rng = makeRng(seed);

  const body = computeBody(p);
  const wom = womensAdjust(p, assess.health);
  const notes = [...assess.notes, ...wom.notes];
  const energy = calorieTarget(p, body, { kcal: wom.kcal }, notes, assess.limits);
  const mac = macroTargets(p, body, energy.kcal);

  const training = buildTraining(p, rng, wom.vol, { gentle: assess.gentle, lowImpact: assess.lowImpact, obese: assess.obese });
  const trainFlags = training.map(d => !d.isRest);
  const t = p.freq;
  const REST_F = 0.92;
  const TRAIN_F = (7 - (7 - t) * REST_F) / t;

  const allowed = allowedFoods(p);
  const usage = {};
  const minCarb = p.diet === 'low carb' ? 30 : 60;

  const days = DAY_NAMES.map((day, i) => {
    const isTrain = trainFlags[i];
    const kcalDay = energy.kcal * (isTrain ? TRAIN_F : REST_F);
    let C = (kcalDay - 4 * mac.protein - 9 * mac.fat) / 4;
    let Fd = mac.fat;
    if (C < minCarb) {
      C = minCarb;
      Fd = Math.max(mac.minFat * 0.8, (kcalDay - 4 * mac.protein - 4 * C) / 9);
    }
    const dayT = { kcal: 4 * mac.protein + 4 * C + 9 * Fd, p: mac.protein, c: C, f: Fd };
    const nutrition = buildNutritionDay(p, body, dayT, isTrain, rng, allowed, usage);
    return { day, isTrain, nutrition, dayT };
  });

  const sleep = buildSleep(p, trainFlags, wom.sleepBonus);
  const avg = k => days.reduce((s, d) => s + d.nutrition.totals[k], 0) / 7;
  const avgKcal = days.reduce((s, d) => s + d.nutrition.totalCalories, 0) / 7;

  const pctActual = energy.pct;
  const pctText = Math.abs(pctActual) < 0.01 ? 'at maintenance' : `a ${Math.round(Math.abs(pctActual) * 100)}% ${pctActual < 0 ? 'deficit' : 'surplus'}`;
  const fatPctReal = Math.round(((avg('f') * 9) / avgKcal) * 100);
  const sched = SCHEDULE[p.freq];

  let summary = `At ${Math.round(p.weight * 10) / 10} kg and ${p.bf}% body fat you carry about ${body.lbm.toFixed(1)} kg of lean mass, which puts your resting burn near ${Math.round(body.bmr)} kcal and your maintenance near ${Math.round(body.tdee)} kcal with ${p.freq} training days a week. `
    + `For ${GOAL_PHRASE[p.goal]} this plan runs ${pctText}, about ${Math.round(avgKcal / 10) * 10} kcal a day on average, a little higher on training days and lower on rest days. `
    + `Protein is set at ${mac.perKgLbm} g per kg of lean mass (about ${Math.round(avg('p'))} g a day), fats near ${fatPctReal}% of calories, and carbs fill the rest around your training. `
    + `Training follows the ${sched.name} split and sleep is targeted at ${sleep.hours} hours. Sessions are timed for about 5:30 PM, so shift your meals if you train at a different time.`;
  if (notes.length) summary += ' Your plan was adjusted for your answers, so please read the notes below.';
  summary += ' This is general guidance, not medical advice.';

  return {
    overview: {
      dailyCalories: Math.round(avgKcal / 10) * 10,
      dailyProtein: Math.round(avg('p')),
      dailyCarbs: Math.round(avg('c')),
      dailyFats: Math.round(avg('f')),
      programName: `${sched.short} ${GOAL_SHORT[p.goal]}`,
      summary,
    },
    days: days.map((d, i) => ({
      day: d.day,
      trainingType: training[i].label,
      isRest: !d.isTrain,
      training: { warmup: training[i].warmup, exercises: training[i].exercises, cooldown: training[i].cooldown },
      nutrition: {
        totalCalories: d.nutrition.totalCalories,
        targets: { calories: Math.round(d.dayT.kcal), protein: Math.round(d.dayT.p), carbs: Math.round(d.dayT.c), fats: Math.round(d.dayT.f) },
        meals: d.nutrition.meals,
        hydration: d.nutrition.hydration,
        supplements: d.nutrition.supplements,
      },
      sleep: sleep.perDay[i],
    })),
    sleepProtocol: { overview: sleep.overview, tips: sleep.tips },
    notes,
    meta: {
      goal: p.goal,
      seed,
      leanMassKg: Math.round(body.lbm * 10) / 10,
      bmr: Math.round(body.bmr),
      maintenance: Math.round(body.tdee),
      targetKcal: energy.kcal,
      ffmi: Math.round(body.ffmi * 10) / 10,
      weightKg: p.weight,
      freq: p.freq,
      mode: { gentle: !!assess.gentle, lowImpact: !!assess.lowImpact, obese: !!assess.obese },
      engine: 'rule-based-v2',
    },
  };
}
