// scripts/selftest.mjs — quick safety net. Run with:  node scripts/selftest.mjs
// Checks the plan generator and its health screening without needing any services.
import fs from 'node:fs';
import vm from 'node:vm';
import { generatePlan } from '../lib/planner/engine.js';
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

console.log(bad ? `\n${bad} check(s) FAILED` : '\nAll checks passed.');
process.exit(bad ? 1 : 0);
