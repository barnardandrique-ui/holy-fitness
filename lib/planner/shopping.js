// lib/planner/shopping.js - the weekly shopping list, built from a plan's real ingredients.
//
// Plans store amounts as EATEN: cooked chicken, cooked rice, steamed vegetables. Nobody buys cooked food, so every food has a
// conversion back to what goes in the trolley (raw chicken, dry rice, a tray of eggs). The factors are rough kitchen averages
// (e.g. chicken loses ~25% of its weight cooking, so 100 g cooked = ~133 g raw), and every amount is rounded UP so nobody runs short.
// The list is rebuilt from the plan each time, so food swaps are always reflected.
// WEEKLY = everything for 7 days. MONTHLY = 30 days, split the way people really shop: food that keeps (or freezes) is bought once for the month,
// and perishables (salad, yoghurt, bananas...) stay on a weekly top-up list with WEEKLY amounts.
import { FOOD_BY_ID } from './foods.js';

export const CATEGORIES = [
  { id: 'produce', label: 'Fruit & vegetables' },
  { id: 'meat', label: 'Meat, poultry & fish' },
  { id: 'dairy', label: 'Eggs & dairy' },
  { id: 'grains', label: 'Bread, rice, pasta & grains' },
  { id: 'legumes', label: 'Beans, lentils & plant proteins' },
  { id: 'nuts', label: 'Nuts, seeds & spreads' },
  { id: 'pantry', label: 'Oils & pantry' },
  { id: 'supps', label: 'Supplements' },
];

// id: [category, shop name, "buy = eaten x factor", options]
//   options: count = grams in ONE item (so amounts show as a number of bananas / eggs / slices)
//            tin = cooked grams in one tin (shows tins instead; legumes also show "or about N tins")
//            ml = grams per millilitre (liquids)   hint = text, or a function of the totals
export const SHOP = {
  // meat, poultry & fish (cooked -> raw)
  chicken: ['meat', 'Chicken breast (raw)', 1.33], chicken_thigh: ['meat', 'Chicken thighs, skinless (raw)', 1.33], turkey: ['meat', 'Turkey breast (raw)', 1.33],
  lean_beef: ['meat', 'Lean beef mince (raw)', 1.33], sirloin: ['meat', 'Sirloin steak (raw)', 1.33], pork_tenderloin: ['meat', 'Pork fillet (raw)', 1.33],
  salmon: ['meat', 'Salmon fillet (raw)', 1.25], cod: ['meat', 'Cod fillet (raw)', 1.25], hake: ['meat', 'Hake fillet (raw)', 1.25], shrimp: ['meat', 'Prawns, peeled (raw)', 1.25],
  tuna: ['meat', 'Tinned tuna in water', 1, { tin: 120, hint: '170 g tins' }],
  // eggs & dairy
  egg: ['dairy', 'Large eggs', 1, { count: 50, hint: 'Sold in trays of 6, 12, 18 or 30' }], egg_white: ['dairy', 'Liquid egg whites', 1, { ml: 1 }],
  greek_yogurt: ['dairy', 'Greek yoghurt, fat-free', 1], cottage_cheese: ['dairy', 'Cottage cheese, low-fat', 1], cheddar: ['dairy', 'Cheddar cheese', 1],
  // legumes & plant proteins (cooked -> dry)
  tofu: ['legumes', 'Firm tofu', 1], tempeh: ['legumes', 'Tempeh', 1], seitan: ['legumes', 'Seitan', 1], edamame: ['legumes', 'Shelled edamame (frozen)', 1],
  lentils: ['legumes', 'Lentils (dry)', 0.4, { tin: 250, tinOr: true }], chickpeas: ['legumes', 'Chickpeas (dry)', 0.42, { tin: 240, tinOr: true }],
  black_beans: ['legumes', 'Black beans (dry)', 0.42, { tin: 240, tinOr: true }], sugar_beans: ['legumes', 'Sugar beans (dry)', 0.42, { tin: 240, tinOr: true }],
  // bread, rice, pasta & grains (cooked -> dry)
  white_rice: ['grains', 'White rice (dry)', 0.35], brown_rice: ['grains', 'Brown rice (dry)', 0.38], quinoa: ['grains', 'Quinoa (dry)', 0.35],
  oats: ['grains', 'Rolled oats', 1], cream_of_rice: ['grains', 'Cream of rice', 1], pasta: ['grains', 'Pasta (dry)', 0.43], rice_noodles: ['grains', 'Rice noodles (dry)', 0.45],
  pap: ['grains', 'Maize meal (for pap)', 0.33],
  bread: ['grains', 'Whole-wheat bread (slices)', 1, { count: 35, hint: n => `about ${Math.ceil(n / 20)} loaf${Math.ceil(n / 20) > 1 ? 'ves' : ''} of 20 slices` }],
  white_bread: ['grains', 'White bread (slices)', 1, { count: 30, hint: n => `about ${Math.ceil(n / 20)} loaf${Math.ceil(n / 20) > 1 ? 'ves' : ''} of 20 slices` }],
  tortilla: ['grains', 'Whole-wheat tortillas', 1, { count: 60, hint: 'Packs of 6 to 8' }], rice_cake: ['grains', 'Rice cakes', 1, { count: 9 }], bagel: ['grains', 'Plain bagels', 1, { count: 95 }],
  // fruit & vegetables (cooked/trimmed -> as bought)
  potato: ['produce', 'Potatoes', 1.15], sweet_potato: ['produce', 'Sweet potatoes', 1.15],
  banana: ['produce', 'Bananas', 1, { count: 118 }], apple: ['produce', 'Apples', 1, { count: 180 }], orange: ['produce', 'Oranges', 1, { count: 130 }],
  berries: ['produce', 'Mixed berries (fresh or frozen)', 1], dates: ['produce', 'Medjool dates', 1, { count: 24 }], avocado: ['produce', 'Avocados', 1, { count: 130 }],
  broccoli: ['produce', 'Broccoli', 1.2], spinach: ['produce', 'Spinach', 1.6], green_beans: ['produce', 'Green beans', 1.05], peppers: ['produce', 'Peppers and onions', 1.25],
  asparagus: ['produce', 'Asparagus', 1.2], zucchini: ['produce', 'Baby marrow (zucchini)', 1.25], cauliflower: ['produce', 'Cauliflower', 1.25], cabbage: ['produce', 'Cabbage', 1.1], carrots: ['produce', 'Carrots', 1.1],
  // nuts, seeds & spreads
  almonds: ['nuts', 'Almonds', 1], walnuts: ['nuts', 'Walnuts', 1], pumpkin_seeds: ['nuts', 'Pumpkin seeds', 1], peanuts: ['nuts', 'Roasted peanuts', 1], sunflower_seeds: ['nuts', 'Sunflower seeds', 1],
  peanut_butter: ['nuts', 'Peanut butter', 1, { hint: g => `about ${Math.round(g / 16)} tablespoons` }], almond_butter: ['nuts', 'Almond butter', 1, { hint: g => `about ${Math.round(g / 16)} tablespoons` }],
  // oils & pantry
  olive_oil: ['pantry', 'Olive oil', 1, { ml: 0.92, hint: g => `about ${Math.round(g / 13.5)} tablespoons` }],
  // supplements
  whey: ['supps', 'Whey protein powder', 1, { hint: g => `about ${Math.max(1, Math.round(g / 30))} scoops of 30 g` }], plant_protein: ['supps', 'Plant protein powder', 1, { hint: g => `about ${Math.max(1, Math.round(g / 30))} scoops of 30 g` }],
};

// How long each food keeps (used by the MONTHLY list). Anything not listed keeps (pantry, tins, dry goods, eggs, hard fruit and root vegetables).
export const FRESH = new Set(['banana', 'berries', 'spinach', 'broccoli', 'asparagus', 'green_beans', 'peppers', 'zucchini', 'cauliflower', 'avocado', 'greek_yogurt', 'cottage_cheese', 'egg_white', 'tofu', 'seitan']);
export const FREEZE = new Set(['chicken', 'chicken_thigh', 'turkey', 'lean_beef', 'sirloin', 'pork_tenderloin', 'salmon', 'cod', 'hake', 'shrimp', 'tempeh', 'bread', 'white_bread', 'tortilla', 'bagel']);
export const PERIODS = { week: { days: 7, label: 'Weekly' }, month: { days: 30, label: 'Monthly' } };
export const FRESH_GROUP = { id: 'fresh', label: 'Fresh: buy every week' };

const roundUp = (n, step) => Math.ceil(n / step - 1e-9) * step;
const fmtG = g => (g >= 1000 ? `${+(g / 1000).toFixed(1)} kg` : `${g} g`);
const fmtMl = ml => (ml >= 1000 ? `${+(ml / 1000).toFixed(2)} L` : `${ml} ml`);

// Returns { ok:false, reason } or { ok:true, period, days, count, stockCount, freshCount, groups:[{ id, label, items:[...] }] }
// Each item: { id, name, display, hint, amount, unit, eaten, bucket ('week'|'month': which ticks it belongs to), shelf ('keeps'|'freeze'|'fresh'), weekly }
export function buildShoppingList(plan, opts = {}) {
  const period = opts.period === 'month' ? 'month' : 'week', days = PERIODS[period].days, scale = days / 7;
  const planDays = (plan && plan.days) || [];
  const meals = planDays.flatMap(d => (d.nutrition && d.nutrition.meals) || []);
  if (!meals.length) return { ok: false, reason: 'no-meals' };
  if (meals.some(m => !Array.isArray(m.items) || !m.items.length)) return { ok: false, reason: 'old-plan' };      // plans made before ingredient data existed
  const weekly = {};
  for (const m of meals) for (const it of m.items) weekly[it[0]] = (weekly[it[0]] || 0) + (Number(it[1]) || 0);
  const byCat = {}, fresh = [];
  for (const [id, wg] of Object.entries(weekly)) {
    if (!(wg > 0)) continue;
    const def = SHOP[id], food = FOOD_BY_ID[id];
    const [cat, name, factor, o = {}] = def || [food && food.role === 'protein' ? 'meat' : food && food.role === 'veg' ? 'produce' : 'pantry', food ? food.label.replace(/^cooked |^grilled |^baked |^roast(ed)? /, '').replace(/^./, c => c.toUpperCase()) : id.replace(/_/g, ' '), 1, {}];
    const isFresh = period === 'month' && FRESH.has(id), isFreeze = period === 'month' && FREEZE.has(id);
    const g = wg * (isFresh ? 1 : scale);                                       // grams eaten over the period (fresh food is always a weekly amount)
    const need = g * factor;                                                  // grams to buy
    let amount, unit, display, hint = '';
    if (o.tin && !o.tinOr) { amount = Math.ceil(g / o.tin - 1e-9); unit = 'tins'; display = `${amount} tin${amount > 1 ? 's' : ''}`; hint = o.hint || ''; }
    else if (o.count) { amount = Math.ceil(need / o.count - 1e-9); unit = 'count'; display = String(amount); hint = typeof o.hint === 'function' ? o.hint(amount) : o.hint || ''; }
    else if (o.ml) { amount = roundUp(need / o.ml, 50); unit = 'ml'; display = fmtMl(amount); hint = typeof o.hint === 'function' ? o.hint(need) : o.hint || ''; }
    else { amount = need < 1000 ? roundUp(need, 50) : roundUp(need, 100); unit = 'g'; display = fmtG(amount); hint = typeof o.hint === 'function' ? o.hint(need) : o.hint || ''; if (o.tinOr) { const t = Math.ceil(g / o.tin - 1e-9); hint = `or about ${t} tin${t > 1 ? 's' : ''} of 400 g`; } }
    if (isFreeze) hint = [hint, /^(bread|white_bread|tortilla|bagel)$/.test(id) ? 'freeze and take out as needed' : 'freeze in weekly portions'].filter(Boolean).join(', ');
    const item = { id, name, display, hint, amount, unit, eaten: Math.round(g), generic: !def, bucket: period === 'month' && !isFresh ? 'month' : 'week', shelf: isFresh ? 'fresh' : isFreeze ? 'freeze' : 'keeps', weekly: isFresh, cat };
    if (isFresh) fresh.push(item); else (byCat[cat] = byCat[cat] || []).push(item);
  }
  const order = id => CATEGORIES.findIndex(c => c.id === id);
  const groups = CATEGORIES.map(c => ({ id: c.id, label: c.label, items: (byCat[c.id] || []).sort((a, b) => a.name.localeCompare(b.name)) })).filter(g => g.items.length);
  if (fresh.length) groups.push({ ...FRESH_GROUP, items: fresh.sort((a, b) => order(a.cat) - order(b.cat) || a.name.localeCompare(b.name)) });
  const count = groups.reduce((n, g) => n + g.items.length, 0);
  return { ok: true, period, days, count, freshCount: fresh.length, stockCount: count - fresh.length, groups };
}

// Plain text for copying / WhatsApp. Pass the ticked ids to leave those out ("what is left to buy").
export function shoppingText(list, done = [], opts = {}) {
  const skip = new Set(done), month = list.period === 'month';
  const lines = [`Holy Fitness ${month ? 'monthly ' : ''}shopping list (${list.days} days${skip.size ? ', what is left to buy' : ''})`, ''];
  let n = 0;
  for (const g of list.groups) {
    const items = g.items.filter(i => !skip.has(i.id)); if (!items.length) continue;
    lines.push(g.label.toUpperCase()); for (const i of items) { lines.push(`- ${i.name}: ${i.display}${i.hint ? `, ${i.hint}` : ''}`); n++; } lines.push('');
  }
  if (!n) return 'Everything is ticked off. Nice work!';
  if (month && list.freshCount) lines.push('Stock up on the sections above once. Buy the fresh items each week (those amounts are for one week).');
  lines.push('Amounts are for one person, rounded up. Salt, spices, sauces and drinks are not included.');
  return lines.join('\n');
}
