// lib/planner/swaps.js - food swaps: "I can't eat this", "too expensive", "can't find it in shops".
// Pure functions, shared by the plan generator (formatting), the browser and the tests.
//
// A swap keeps a meal on target: the new food's amount is chosen to match what the old food contributed, and the
// carb / fat foods in the same meal are nudged so calories and protein stay close to the original.
import { FOODS, FOOD_BY_ID, FOOD_TYPES } from './foods.js';
import { allowedFoods } from './restrictions.js';

export const COST_LABEL = { 1: 'Budget-friendly', 2: 'Mid-range', 3: 'Premium' };
export const AVAIL_LABEL = { 1: 'Easy to find', 2: 'Most supermarkets', 3: 'Specialty store' };
export const REASONS = ['any', 'cant_eat', 'expensive', 'hard_to_find'];

// ── Amount formatting (the generator uses this too, so plan text and swap text can never drift apart) ──
const fmtPieces = n => { const whole = Math.floor(n); return n % 1 === 0.5 ? `${whole || ''}½` : String(n); };
export function formatAmount(f, rawG, fixed = false) {
  if (f.piece) {
    const step = f.piece.step || 1;
    let n = Math.round(rawG / f.piece.g / step) * step;
    if (fixed) n = Math.max(n, step);
    if (n <= 0) return null;
    return { grams: n * f.piece.g, text: `${fmtPieces(n)} ${n <= 1 ? f.piece.one : f.piece.many}` };
  }
  const stepG = rawG >= 400 ? 10 : 5;
  const g = Math.round(rawG / stepG) * stepG;
  if (g <= 0) return null;
  return { grams: g, text: `${g}g ${f.label}` };
}
export const shortName = label => label
  .replace(/\s*\(.*?\)/g, '')
  .replace(/^(cooked|baked|grilled|roast|roasted|steamed|wilted|sautéed|canned|liquid|shelled|firm|low-fat|non-fat|rolled|whole-wheat)\s+/i, '')
  .replace(/^(cooked|baked|grilled|roast|roasted)\s+/i, '');
export const titleCase = s => s.replace(/\b([a-z])/g, c => c.toUpperCase());

// ── Maths ──
const round1 = n => Math.round(n * 10) / 10;
const totalsOf = items => items.reduce((t, i) => ({ p: t.p + (i.food.p * i.g) / 100, c: t.c + (i.food.c * i.g) / 100, f: t.f + (i.food.f * i.g) / 100 }), { p: 0, c: 0, f: 0 });
const kcalOf = t => 4 * t.p + 4 * t.c + 9 * t.f;
const errOf = (t, T0) => {
  const k0 = kcalOf(T0);
  return Math.abs(kcalOf(t) - k0) / Math.max(k0, 80) + 1.2 * Math.abs(t.p - T0.p) / Math.max(T0.p, 8)
    + 0.35 * Math.abs(t.c - T0.c) / Math.max(T0.c, 15) + 0.35 * Math.abs(t.f - T0.f) / Math.max(T0.f, 8);
};
// "On target": calories within 6% (or 15 kcal) and protein within 12% (or 3 g) of what the meal had.
const onTarget = (t, T0) => Math.abs(kcalOf(t) - kcalOf(T0)) <= Math.max(0.06 * kcalOf(T0), 15) && Math.abs(t.p - T0.p) <= Math.max(3, 0.12 * T0.p);

function hydrate(meal) {
  if (!meal || !Array.isArray(meal.items) || !meal.items.length) return null;
  const items = meal.items.map(([id, g]) => ({ food: FOOD_BY_ID[id], g }));
  return items.every(i => i.food && i.g > 0) ? items : null;
}

function amountGrid(food, lo, hi) {
  lo = Math.max(lo == null ? (food.min ?? 30) : lo, 1); hi = hi == null ? (food.max ?? 400) : hi;
  const out = [];
  if (food.piece) {
    const step = food.piece.step || 1, pg = food.piece.g;
    for (let n = Math.ceil(lo / pg / step - 1e-9) * step; n * pg <= hi + 1e-9; n += step) if (n > 0) out.push(round1(n * pg));
  } else {
    for (let g = Math.ceil(lo / 5) * 5; g <= hi; g += g >= 400 ? 10 : 5) out.push(g);
  }
  if (out.length > 70) { const k = Math.ceil(out.length / 70); return out.filter((_, i) => i % k === 0 || i === out.length - 1); }
  return out;
}
const adjustGrid = it => {
  const lo = Math.max(it.food.min ?? 5, it.g * 0.4), hi = Math.min(it.food.max ?? 600, it.g * 1.9);
  const g = amountGrid(it.food, lo, hi);
  return [...new Set([...g, it.g])].sort((a, b) => a - b);
};

// Best amount of `X` in place of items[idx], nudging the biggest other carb food and fat food to keep the meal on target.
function solveSwap(items, idx, X, T0) {
  const others = items.map((it, i) => ({ it, i })).filter(o => o.i !== idx);
  const big = (role, key) => others.filter(o => o.it.food.role === role).sort((a, b) => b.it.food[key] * b.it.g - a.it.food[key] * a.it.g)[0] || null;
  const A = big('carb', 'c'), B = big('fat', 'f');
  const fixed = totalsOf(others.filter(o => o !== A && o !== B).map(o => o.it));
  const gX = amountGrid(X), gA = A ? adjustGrid(A.it) : [null], gB = B ? adjustGrid(B.it) : [null];
  const per = (food, g) => ({ p: (food.p * g) / 100, c: (food.c * g) / 100, f: (food.f * g) / 100 });
  let best = null;
  for (const x of gX) {
    const tx = per(X, x);
    for (const a of gA) {
      const ta = a == null ? { p: 0, c: 0, f: 0 } : per(A.it.food, a);
      for (const b of gB) {
        const tb = b == null ? { p: 0, c: 0, f: 0 } : per(B.it.food, b);
        const t = { p: fixed.p + tx.p + ta.p + tb.p, c: fixed.c + tx.c + ta.c + tb.c, f: fixed.f + tx.f + ta.f + tb.f };
        const e = errOf(t, T0) + 0.04 * ((a == null ? 0 : Math.abs(a / A.it.g - 1)) + (b == null ? 0 : Math.abs(b / B.it.g - 1)));
        if (!best || e < best.e) best = { e, x, a, b };
      }
    }
  }
  if (!best) return null;
  const out = items.map((it, i) => (i === idx ? { food: X, g: best.x } : (A && i === A.i && best.a != null) ? { food: it.food, g: best.a } : (B && i === B.i && best.b != null) ? { food: it.food, g: best.b } : it));
  const fin = out.map(it => ({ food: it.food, ...formatAmount(it.food, it.g, false) }));
  if (fin.some(f => !f.grams)) return null;
  const t = totalsOf(fin.map(f => ({ food: f.food, g: f.grams })));
  const atBound = best.x <= (X.min ?? 30) || best.x >= (X.max ?? 400);
  return { fin, t, err: errOf(t, T0), onTarget: onTarget(t, T0) && !(atBound && !onTarget(t, T0)), atBound };
}

// Groups a person is most likely avoiding when they say "I can't eat this" (so we don't offer a close cousin).
const GROUP_TAGS = ['poultry', 'beef', 'pork', 'fish', 'shellfish', 'egg', 'dairy', 'soy', 'gluten', 'treenut', 'peanut'];
const LEGUMES = new Set(['lentils', 'chickpeas', 'black_beans', 'sugar_beans', 'edamame']);
const groupsOf = f => [...f.tags.filter(t => GROUP_TAGS.includes(t)), ...(LEGUMES.has(f.id) ? ['legume'] : [])];
const sharesGroup = (a, b) => { const g = groupsOf(a); return groupsOf(b).some(x => g.includes(x)); };
const similar = (a, b) => sharesGroup(a, b) || (a.fam && a.fam === b.fam) || (a.plant && b.plant);
// Same way of eating: shake / yogurt proteins with each other, nuts and nut butters with each other.
const fitsHow = (f, orig) => (f.role !== 'protein' || !!f.sweet === !!orig.sweet) && (f.role !== 'fat' || !!f.nut === !!orig.nut);
const typeOk = (food, type) => !type || !FOOD_TYPES[food.id] || FOOD_TYPES[food.id].has(type);

const mealTotals = tot => ({ calories: Math.round(4 * tot.p + 4 * tot.c + 9 * tot.f), protein: Math.round(tot.p), carbs: Math.round(tot.c), fats: Math.round(tot.f) });

function rebuildMeal(meal, fin, oldFood, newFood) {
  const tot = fin.reduce((t, i) => ({ p: t.p + (i.food.p * i.grams) / 100, c: t.c + (i.food.c * i.grams) / 100, f: t.f + (i.food.f * i.grams) / 100 }), { p: 0, c: 0, f: 0 });
  return {
    ...meal, name: renameMeal(meal.name, oldFood, newFood),
    foods: fin.map(i => i.text).join(', '), items: fin.map(i => [i.food.id, i.grams, i.text]), ...mealTotals(tot),
    orig: meal.orig || { name: meal.name, foods: meal.foods, items: meal.items, calories: meal.calories, protein: meal.protein, carbs: meal.carbs, fats: meal.fats },
  };
}

// "Lunch · Chicken Breast with White Rice" -> "Lunch · Lentils with White Rice"
export function renameMeal(name, oldFood, newFood) {
  const o = titleCase(shortName(oldFood.label)), n = titleCase(shortName(newFood.label));
  if (!name) return name;
  if (name.includes(o)) return name.replace(o, n);
  // "Protein Shake & Fruit" is no longer a shake once the powder is swapped for yogurt or cottage cheese
  const powder = id => id === 'whey' || id === 'plant_protein';
  if (powder(oldFood.id) && !powder(newFood.id) && /(Protein|Plant) Shake/.test(name)) return name.replace(/(Protein|Plant) Shake/, n);
  return name;
}

// Alternatives for one ingredient of a meal. reason: any | cant_eat | expensive | hard_to_find
export function suggestSwaps(meal, index, { profile = {}, reason = 'any', limit = 8 } = {}) {
  const items = hydrate(meal);
  if (!items || !items[index]) return { ok: false, candidates: [], note: '' };
  const orig = items[index].food, T0 = totalsOf(items);
  const allowed = allowedFoods(profile), present = new Set(items.map(i => i.food.id));
  let pool = FOODS.filter(f => f.role === orig.role && f.id !== orig.id && !present.has(f.id) && allowed.has(f.id) && typeOk(f, meal.type) && fitsHow(f, orig));
  if (reason === 'cant_eat') pool = pool.filter(f => !sharesGroup(f, orig));
  let scored = pool.map(f => ({ f, r: solveSwap(items, index, f, T0) })).filter(c => c.r && !(c.r.atBound && !c.r.onTarget));
  let note = '';
  if (reason === 'expensive') {
    const cheaper = scored.filter(c => c.f.cost < orig.cost);
    if (cheaper.length) scored = cheaper; else { scored = scored.filter(c => c.f.cost <= orig.cost); note = 'This is already one of the more affordable choices. Here are options at a similar price.'; }
  } else if (reason === 'hard_to_find') {
    const easier = scored.filter(c => c.f.avail < orig.avail);
    if (easier.length) scored = easier; else { scored = scored.filter(c => c.f.avail <= orig.avail); note = 'This is already easy to find. Here are other options that are just as easy.'; }
  }
  const key = c => c.r.err + (similar(c.f, orig) ? 0 : 0.03);
  scored.sort((a, b) => (b.r.onTarget - a.r.onTarget) || (reason === 'expensive' ? a.f.cost - b.f.cost : reason === 'hard_to_find' ? a.f.avail - b.f.avail : 0) || key(a) - key(b));
  const candidates = scored.slice(0, limit).map(({ f, r }) => {
    const nm = rebuildMeal(meal, r.fin, orig, f);
    const changed = r.fin.map((x, i) => ({ x, i })).filter(({ x, i }) => i !== index && x.grams !== items[i].g).map(({ x, i }) => ({ label: items[i].food.label, from: meal.items[i][2], to: x.text }));
    return {
      id: f.id, label: f.label, text: r.fin[index].text, cost: f.cost, avail: f.avail, costLabel: COST_LABEL[f.cost], availLabel: AVAIL_LABEL[f.avail],
      onTarget: r.onTarget, meal: nm, changed,
      delta: { calories: nm.calories - meal.calories, protein: nm.protein - meal.protein, carbs: nm.carbs - meal.carbs, fats: nm.fats - meal.fats },
    };
  });
  return { ok: true, candidates, note, from: { id: orig.id, label: orig.label, cost: orig.cost, avail: orig.avail, costLabel: COST_LABEL[orig.cost], availLabel: AVAIL_LABEL[orig.avail] } };
}

// Returns the meal with `foodId` swapped in for item `index`, or null if that swap isn't possible.
export function applySwap(meal, index, foodId, { profile = {} } = {}) {
  const items = hydrate(meal); const X = FOOD_BY_ID[foodId];
  if (!items || !items[index] || !X || X.role !== items[index].food.role || !allowedFoods(profile).has(foodId) || !typeOk(X, meal.type) || !fitsHow(X, items[index].food)) return null;
  if (items.some((it, i) => i !== index && it.food.id === foodId)) return null;
  const r = solveSwap(items, index, X, totalsOf(items));
  return r ? rebuildMeal(meal, r.fin, items[index].food, X) : null;
}

export function undoMeal(meal) {
  if (!meal || !meal.orig) return meal;
  const { orig, ...rest } = meal;
  return { ...rest, ...orig };
}

export function refreshDayTotals(day) {
  const n = day && day.nutrition; if (!n || !Array.isArray(n.meals)) return;
  const t = n.meals.reduce((s, m) => ({ k: s.k + m.calories, p: s.p + m.protein, c: s.c + m.carbs, f: s.f + m.fats }), { k: 0, p: 0, c: 0, f: 0 });
  n.totalCalories = t.k;
  if (n.totals) n.totals = t;       // only where the plan already has it, so an undone day is identical to the original
}

// Swap a food in EVERY meal of the plan where that is possible. Returns { changed, skipped }.
export function swapEverywhere(plan, fromId, toId, { profile = {} } = {}) {
  let changed = 0, skipped = 0;
  for (const day of plan.days || []) {
    const meals = day.nutrition && day.nutrition.meals; if (!meals) continue;
    meals.forEach((m, mi) => {
      const idx = (m.items || []).findIndex(it => it[0] === fromId); if (idx < 0) return;
      const nm = applySwap(m, idx, toId, { profile });
      if (nm) { meals[mi] = nm; changed++; } else skipped++;
    });
    refreshDayTotals(day);
  }
  return { changed, skipped };
}

// Every food in a plan that could be swapped, for the "foods in this week's plan" list
export const foodsInPlan = plan => { const seen = new Map(); for (const d of plan.days || []) for (const m of (d.nutrition && d.nutrition.meals) || []) for (const it of m.items || []) if (!seen.has(it[0]) && FOOD_BY_ID[it[0]]) seen.set(it[0], FOOD_BY_ID[it[0]]); return [...seen.values()]; };
