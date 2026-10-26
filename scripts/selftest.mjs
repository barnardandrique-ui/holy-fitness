// scripts/selftest.mjs — quick safety net. Run with:  node scripts/selftest.mjs
// Checks the plan generator and its health screening without needing any services.
import fs from 'node:fs';
import vm from 'node:vm';
import { generatePlan } from '../lib/planner/engine.js';
import { POOLS } from '../lib/planner/library.js';
import { TEMPLATES } from '../lib/planner/exercises.js';
import { FOODS, FOOD_BY_ID } from '../lib/planner/foods.js';
import { suggestSwaps, applySwap, undoMeal, swapEverywhere } from '../lib/planner/swaps.js';
import { JOINT_UNFRIENDLY } from '../lib/planner/safety.js';

let bad = 0;
const check = (name, ok) => { console.log(ok ? 'OK  ' : 'FAIL', name); if (!ok) bad++; };
const base = { gender: 'male', age: 28, height: 180, weight: 82, bf: 15, freq: '4', exp: 'intermediate', goal: 'muscle gain', diet: 'standard', allerg: 'none' };
const ex = p => p.days.flatMap(d => d.training.exercises);

const plain = generatePlan(base);
check('normal plan: 7 days, sensible calories, no NaN', plain.days.length === 7 && plain.overview.dailyCalories > 1500 && !/NaN|undefined|Infinity/.test(JSON.stringify(plain)));
check('same seed gives the same plan', JSON.stringify(generatePlan(base, { seed: 7 })) === JSON.stringify(generatePlan(base, { seed: 7 })));

for (const k of ['heart', 'chestPain', 'dizzy', 'diabetesMeds', 'kidney', 'pregnant', 'eatingDisorder']) {
  const r = generatePlan({ ...base, health: { [k]: true } });
  check(`"${k}" blocks the plan and returns no plan data`, r.blocked === true && !r.days && !r.overview);
}
check('eating-disorder message points to South African support', /sadag\.org/.test(generatePlan({ ...base, health: { eatingDisorder: true } }).message));
check('eating-disorder message has no numbers', !/\d/.test(generatePlan({ ...base, health: { eatingDisorder: true } }).message.replace('allianceforeatingdisorders.com', '')));

const joints = generatePlan({ ...base, goal: 'athletic performance', health: { joints: true } });
check('joint problems: no jumping / high-impact exercises', ex(joints).every(e => !JOINT_UNFRIENDLY.has(e.name)));
const bp = generatePlan({ ...base, health: { bloodPressure: true } });
check('high blood pressure: gentle sets and a caution note', ex(bp).every(e => +e.sets <= 3) && bp.notes.some(n => n.level === 'caution'));
const cut = generatePlan({ ...base, goal: 'fat loss', bf: 30, health: { pcos: true }, gender: 'female' });
check('PCOS: calorie deficit capped at 15%', cut.meta.targetKcal / cut.meta.maintenance >= 0.85);


// ── Daily targets, celebration and history (js/progress.js) ──
const pctx = {}; pctx.globalThis = pctx; vm.createContext(pctx);
vm.runInContext(fs.readFileSync(new URL('../js/progress.js', import.meta.url), 'utf8'), pctx);
const PR = pctx.HFProgress;
const day = plain.days[0];
const fullLog = () => ({ workout: { saved: true, checks: day.training.exercises.map(() => true) }, meals: { saved: true, checks: day.nutrition.meals.map(() => true), custom: [] }, sleep: { saved: true, hours: String(day.sleep.targetHours) } });
check('celebration: a fully logged day counts as perfect', PR.evaluateDay(day, fullLog()).perfect === true);
const skipMeal = fullLog(); skipMeal.meals.checks[0] = false;
check('celebration: skipping a planned meal is not perfect', PR.evaluateDay(day, skipMeal).perfect === false);
const pizza = fullLog(); pizza.meals.custom = [{ name: 'Extra', calories: 5000 }];
check('celebration: huge extra calories are not perfect (no party for overeating)', PR.evaluateDay(day, pizza).perfect === false);
const shortSleep = fullLog(); shortSleep.sleep.hours = String(day.sleep.targetHours - 2);
check('celebration: well under the sleep target is not perfect', PR.evaluateDay(day, shortSleep).perfect === false);
const E = (date, perfect) => ({ id: date, planId: 'p', dayIndex: 0, date, hits: perfect ? 3 : 1, perfect: perfect ? 1 : 0, w: [0, 0, 1], m: [0, 0, 0, 0, 0], s: [null, 8, 0, ''] });
check('history: three perfect days in a row make a streak of three', PR.streaks([E('2026-10-15', 1), E('2026-10-16', 1), E('2026-10-17', 1)], '2026-10-17').current === 3);
check('history: a missed day breaks the streak', PR.streaks([E('2026-10-14', 1), E('2026-10-16', 1)], '2026-10-16').current === 1);


// ── Add App to Home Screen (js/install.js + the files a browser needs to treat the site as an app) ──
const ictx = {}; ictx.globalThis = ictx; vm.createContext(ictx);
vm.runInContext(fs.readFileSync(new URL('../js/install.js', import.meta.url), 'utf8'), ictx);
const IN = ictx.HFInstall;
const iphone = IN.detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1', '', 5, false);
const droid = IN.detectPlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36', '', 5, false);
check('install: iPhone gets the Share / Add to Home Screen guide', IN.installMode(iphone, false) === 'ios');
check('install: Android Chrome with a browser prompt uses the one-tap install', IN.installMode(droid, true) === 'native');
const samsung = IN.detectPlatform('Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36', '', 5, false);
check('install: Samsung Internet is guided to Chrome (its own install package trips Play Protect)', IN.installMode(samsung, true) === 'samsung');
check('install: nothing is offered once the app is already installed', IN.installMode({ ...droid, standalone: true }, true) === 'none');
const man = JSON.parse(fs.readFileSync(new URL('../site.webmanifest', import.meta.url), 'utf8'));
check('install: manifest has 192 + 512 icons and a maskable icon', ['192x192', '512x512'].every(sz => man.icons.some(i => i.sizes === sz)) && man.icons.some(i => i.purpose === 'maskable') && man.display === 'standalone');
check('install: every manifest icon file exists', man.icons.every(i => fs.existsSync(new URL('..' + i.src, import.meta.url))));
check('install: service worker and offline page exist', fs.existsSync(new URL('../sw.js', import.meta.url)) && fs.existsSync(new URL('../offline.html', import.meta.url)));
const swText = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
check('install: the service worker never caches scripts, styles or the API', !/\/api/.test(swText) && !/app\.js|\.css/.test(swText));


// ── Exercise library + Training Center (data/exercises.json, exercises/<id>/0.webp, js/training.js) ──
const entries = Object.values(POOLS).flat();
check('library: every pool entry has an id, a name and a level', entries.every(e => e.id && e.name && [1, 2, 3].includes(e.lvl)));
check('library: no exercise is repeated inside a pool', Object.values(POOLS).every(arr => new Set(arr.map(e => e.id)).size === arr.length));
const slotRoles = {}; Object.values(TEMPLATES).forEach(t => t.slots.forEach(sl => (slotRoles[sl.pool] = slotRoles[sl.pool] || new Set()).add(sl.role)));
check('library: no exercise is unreachable (accessory-only exercises live only in pools that have accessory slots)', Object.entries(POOLS).every(([p, arr]) => !arr.some(e => e.noMain) || [...(slotRoles[p] || [])].some(r => !['main', 'secondary'].includes(r))));
check('library: jumps, throws and swings are never marked safe for gentle plans', POOLS.power.every(e => !e.li));
const risky = /\b(jump|jumps|hop|hops|bound|swing|swings|slam|throw|plyo|dip|dips|pull.?ups?|pullups|chins?|chin.?ups?|hanging|roller|walking|step.?ups?|bulgarian|decline|behind)\b|leg raise|front barbell|good morning/i;
check('library: no high-impact or joint-stressing exercise is marked safe for gentle plans', entries.every(e => !(e.li && risky.test(e.name))));
check('library: every training exercise in a plan carries a library id', plain.days.every(d => !d.training || (d.training.exercises || []).every(x => x.libId || /Intervals|Walk|Carry|Treadmill|Ski/.test(x.name))));
const dataUrl = new URL('../data/exercises.json', import.meta.url);
check('training media: data/exercises.json is present (upload and unzip the media bundle first)', fs.existsSync(dataUrl));
if (fs.existsSync(dataUrl)) {
  const lib = JSON.parse(fs.readFileSync(dataUrl, 'utf8')); const byId = Object.fromEntries(lib.map(e => [e.id, e]));
  check('training media: the library has hundreds of exercises', lib.length > 800);
  check('library: every planner exercise exists in the data with its exact name', entries.every(e => byId[e.id] && byId[e.id].name === e.name));
  check('training media: every planner exercise has both photos on disk', entries.every(e => fs.existsSync(new URL('../exercises/' + e.id + '/0.webp', import.meta.url)) && fs.existsSync(new URL('../exercises/' + e.id + '/1.webp', import.meta.url))));
  const tctx = {}; tctx.globalThis = tctx; vm.createContext(tctx);
  vm.runInContext(fs.readFileSync(new URL('../js/training.js', import.meta.url), 'utf8'), tctx);
  const found = tctx.HFTraining.filterExercises(tctx.HFTraining.prepare(lib), { q: 'squat' }).slice(0, 6).map(e => e.name);
  check('training center: searching "squat" puts everyday beginner squats first', found.length === 6 && found.every(n => /squat/i.test(n)) && !found.includes('Squat Jerk'));
  check('training center: "abs" finds abdominal exercises', tctx.HFTraining.filterExercises(tctx.HFTraining.prepare(lib), { q: 'abs' }).length > 50);
}
const vj = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
check('hosting: exercise photos are cached by browsers (vercel.json)', JSON.stringify(vj).includes('/exercises/') && JSON.stringify(vj).includes('max-age'));


// ── Food swaps ("can't eat it", "too expensive", "hard to find") ──
check('swaps: every food has a job, a cost tier and an availability tier', FOODS.every(f => ['protein', 'carb', 'fat', 'veg'].includes(f.role) && [1, 2, 3].includes(f.cost) && [1, 2, 3].includes(f.avail)));
const allMeals = plain.days.flatMap(d => d.nutrition.meals);
check('swaps: every meal keeps its ingredients and they match the meal text', allMeals.every(m => Array.isArray(m.items) && m.items.length && m.items.map(i => i[2]).join(', ') === m.foods && m.type));
const sMeal = plain.days[0].nutrition.meals.find(m => m.type === 'main');
const sIdx = sMeal.items.findIndex(i => FOOD_BY_ID[i[0]].role === 'protein');
const sProf = { diet: 'standard', allerg: 'none', avoid: [] };
const sugg = suggestSwaps(sMeal, sIdx, { profile: sProf, reason: 'any' });
check('swaps: a protein can be swapped, and the best alternative keeps the meal on target', sugg.ok && sugg.candidates.length > 0 && sugg.candidates[0].onTarget);
const sApplied = applySwap(sMeal, sIdx, sugg.candidates[0].id, { profile: sProf });
check('swaps: applying a swap stays close to the meal calories and protein', Math.abs(sApplied.calories - sMeal.calories) <= Math.max(0.07 * sMeal.calories, 16) && Math.abs(sApplied.protein - sMeal.protein) <= Math.max(4, 0.13 * sMeal.protein));
check('swaps: undo restores the original meal exactly', JSON.stringify(undoMeal(sApplied)) === JSON.stringify(sMeal));
// Accuracy across many meals and plans (a single lucky meal must not be able to hide a broken solver)
let swN = 0, swOn = 0, swDrift = 0, swItems = 0;
for (const seed of [4, 9, 21, 33, 57, 71]) {
  const pl = generatePlan({ gender: seed % 2 ? 'male' : 'female', age: 30, height: 172, weight: 74, bf: 20, freq: '4', exp: 'intermediate', goal: 'muscle gain', diet: 'standard' }, { seed });
  for (const m of pl.days.flatMap(d => d.nutrition.meals)) m.items.forEach((it, i) => {
    if (!['protein', 'carb'].includes(FOOD_BY_ID[it[0]].role)) return;
    const top = suggestSwaps(m, i, { profile: sProf, reason: 'any' }).candidates[0];
    swItems++;
    if (top) { swN++; if (top.onTarget) swOn++; swDrift += Math.abs(top.meal.calories - m.calories) / Math.max(m.calories, 1); }
  });
}
check('swaps: across many meals the best alternative keeps the meal on target at least 90% of the time', swN > 100 && swOn / swN >= 0.9);
check('swaps: nearly every protein and carb food has at least one alternative (95%+)', swItems > 100 && swN / swItems >= 0.95);
check('swaps: the average calorie change after a swap is under 3%', swN > 100 && swDrift / swN < 0.03);
const exp = suggestSwaps(sMeal, sIdx, { profile: sProf, reason: 'expensive' });
check('swaps: "too expensive" only offers cheaper foods (or says why not)', exp.candidates.every(c => c.cost < FOOD_BY_ID[sMeal.items[sIdx][0]].cost) || !!exp.note);
const veganMeal = { type: 'main', name: 'Lunch · Tofu with White Rice', items: [['tofu', 200, 't'], ['white_rice', 220, 'r']] };
check('swaps: a vegan is never offered meat, eggs or dairy', suggestSwaps(veganMeal, 0, { profile: { diet: 'vegan', allerg: 'none' } }).candidates.every(c => !FOOD_BY_ID[c.id].tags.some(t => ['flesh', 'egg', 'dairy'].includes(t))));
check('swaps: foods a client avoids are never offered', !suggestSwaps(sMeal, sIdx, { profile: { ...sProf, avoid: ['turkey', 'chicken_thigh', 'hake', 'lean_beef'] } }).candidates.some(c => ['turkey', 'chicken_thigh', 'hake', 'lean_beef'].includes(c.id)));
const avoidPlan = generatePlan({ gender: 'male', age: 30, height: 180, weight: 82, bf: 16, freq: '4', exp: 'intermediate', goal: 'muscle gain', diet: 'standard', avoid: ['chicken', 'white_rice', 'broccoli'] }, { seed: 11 });
check('swaps: a food on the avoid list never appears in a new plan', !avoidPlan.days.flatMap(d => d.nutrition.meals.flatMap(m => m.items.map(i => i[0]))).some(id => ['chicken', 'white_rice', 'broccoli'].includes(id)));
const swapPlan = JSON.parse(JSON.stringify(plain)); const sw1 = swapEverywhere(swapPlan, sMeal.items[sIdx][0], sugg.candidates[0].id, { profile: sProf });
check('swaps: swapping everywhere keeps every day total equal to its meals', sw1.changed >= 1 && swapPlan.days.every(d => d.nutrition.totalCalories === d.nutrition.meals.reduce((a, m) => a + m.calories, 0)));
const appHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8'), appJs = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8'), stateJs = fs.readFileSync(new URL('../api/state.js', import.meta.url), 'utf8');
check('swaps: the swap dialog and Swap buttons are wired into the app', /id="swap-modal"/.test(appHtml) && /openSwap\(/.test(appJs) && /import\('\/lib\/planner\/swaps\.js'\)/.test(appJs));
check('swaps: the server keeps deep meal data and the avoid list when saving', /depth > 12/.test(stateJs) && /avoidFoods/.test(stateJs));

console.log(bad ? `\n${bad} check(s) FAILED` : '\nAll checks passed.');
process.exit(bad ? 1 : 0);
