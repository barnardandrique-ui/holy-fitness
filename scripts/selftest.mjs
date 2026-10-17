// scripts/selftest.mjs — quick safety net. Run with:  node scripts/selftest.mjs
// Checks the plan generator and its health screening without needing any services.
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

console.log(bad ? `\n${bad} check(s) FAILED` : '\nAll checks passed.');
process.exit(bad ? 1 : 0);
