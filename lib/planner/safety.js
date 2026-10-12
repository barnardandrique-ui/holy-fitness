// lib/planner/safety.js
// ---------------------------------------------------------------------------
// Health screening and safety rules for the plan generator.
//
// Three outcomes:
//   BLOCKED  - conditions where a generic diet/training plan could cause harm
//              (heart conditions, insulin-treated diabetes, kidney disease,
//              pregnancy, eating-disorder history...). No plan is produced and
//              the person is pointed to a doctor / dietitian instead.
//   CAUTION  - conditions where a plan is reasonable but must be gentler
//              (high blood pressure, joint problems, 60+, other conditions,
//              obesity, PCOS...). The plan is adjusted and carries notes.
//   OK       - no flags.
//
// This is a screening aid, not a medical assessment. It relies on honest
// answers and cannot replace a doctor.
// ---------------------------------------------------------------------------

export const BLOCKERS = {
  heart: 'a heart condition, or being told to exercise only under supervision',
  chestPain: 'chest pain when exercising or at rest',
  dizzy: 'dizziness, fainting or loss of balance',
  diabetesMeds: 'diabetes treated with insulin or medication',
  kidney: 'kidney disease',
  pregnant: 'pregnancy or having given birth in the last 6 months',
  eatingDisorder: 'a current or past eating disorder',
};

const OTHER_KEYS = ['bloodPressure', 'joints', 'otherCondition', 'pcos', 'irregular', 'perimenopause'];
export const SYMPTOMS = ['cramps', 'fatigue', 'bloating', 'mood', 'headaches'];

const truthy = v => v === true || v === 'true' || v === 'on' || v === 1 || v === '1';

export function normalizeHealth(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const h = {};
  for (const k of [...Object.keys(BLOCKERS), ...OTHER_KEYS]) h[k] = truthy(src[k]);
  h.symptoms = Array.isArray(src.symptoms) ? src.symptoms.filter(s => SYMPTOMS.includes(s)) : [];
  return h;
}

// Exercises left out when joints or impact are a concern.
export const JOINT_UNFRIENDLY = new Set([
  'Box Jump', 'Broad Jump', 'Jump Squat', 'Push Press', 'Kettlebell Swing', 'Medicine Ball Slam', 'Medicine Ball Chest Throw',
  'Walking Lunges', 'Step-Ups', 'Bulgarian Split Squat', 'Front Squat', 'Good Morning', 'Nordic Hamstring Curl',
  'Chest Dips', 'Parallel Bar Dips', 'Pull-Ups', 'Chin-Ups', 'Hanging Knee Raise', 'Hanging Leg Raise', 'Ab Wheel Rollout',
]);

const caution = text => ({ level: 'caution', text });
const info = text => ({ level: 'info', text });

function blockedMessage(reasons, ed) {
  const list = reasons.join(', ');
  const parts = [];
  if (ed) {
    parts.push('You told us about an eating disorder, current or past. Calorie targets, macro numbers and exercise prescriptions can be harmful during or after an eating disorder, so we do not give them. This is not a judgement, and it is not about willpower.');
    parts.push('Please work with a doctor or an eating disorder specialist who can support you properly. If things feel hard right now, reach out to someone you trust today, or to a local eating disorder service. In the US, the National Alliance for Eating Disorders runs a helpline (allianceforeatingdisorders.com). If you are in immediate danger, contact your local emergency number.');
    if (reasons.length > 1) parts.push('You also mentioned: ' + reasons.filter(r => r !== BLOCKERS.eatingDisorder).join(', ') + '. Those need a doctor\'s input too.');
  } else {
    parts.push('Thank you for being honest about your health. Because you told us about ' + list + ', we cannot safely build a diet or training plan for you here.');
    parts.push('Calorie and exercise targets in these situations need a doctor or registered dietitian who knows your full picture. The wrong numbers could cause harm, even when the goal is a healthy one.');
    parts.push('Please speak with your doctor or a registered dietitian before starting any plan. Once you have their go-ahead, you are welcome to come back and update your answers.');
  }
  return parts.join('\n\n');
}

export function assessHealth(p, rawHealth) {
  const h = normalizeHealth(rawHealth);

  const hit = Object.keys(BLOCKERS).filter(k => h[k]);
  if (hit.length) {
    const reasons = hit.map(k => BLOCKERS[k]);
    return { blocked: true, reasons, eatingDisorder: h.eatingDisorder, message: blockedMessage(reasons, h.eatingDisorder), health: h };
  }

  const female = p.gender === 'female';
  const bmi = p.weight / Math.pow(p.height / 100, 2);
  const obese = bmi >= 30 && p.bf >= (female ? 33 : 25); // BMI alone misjudges muscular people
  const underweight = bmi < 18.5;
  const older = p.age >= 60;

  const gentle = h.bloodPressure || h.otherCondition || older;
  const lowImpact = gentle || h.joints || obese;

  const notes = [];
  let maxDeficit = null;
  let maxSurplus = null;
  const capDeficit = v => { maxDeficit = maxDeficit == null ? v : Math.min(maxDeficit, v); };

  if (h.bloodPressure) notes.push(caution('You mentioned high blood pressure. Please get your doctor\'s OK before starting. Your plan avoids max-effort lifts, keeps effort moderate (RPE 6-7) and asks you to breathe throughout each rep. Keep salt moderate and include potassium-rich foods such as potatoes, spinach and bananas.'));
  if (h.joints) notes.push(caution('You mentioned joint, bone or back problems. Jumping and joint-heavy exercises are left out. Stop any movement that causes sharp pain, and check with your doctor or a physiotherapist.'));
  if (h.otherCondition) notes.push(caution('You mentioned another health condition or regular medication. Please check with your doctor that this plan suits you. It is kept gentle: moderate effort and a smaller calorie change.'));
  if (older) notes.push(info('At 60 and over, your plan keeps effort moderate and skips high-impact work. Strength training is especially valuable for muscle and bone health.'));
  if (obese) notes.push(info('Your plan is joint-friendly: no jumping or high-impact work, steady progression, and a walking target on rest days. A moderate calorie deficit works better long-term than an aggressive one.'));
  if (underweight) notes.push(caution('Your BMI is under 18.5, so this plan will not include a calorie deficit. If you are losing weight without trying, please see a doctor.'));
  if (h.pcos) notes.push(info('PCOS: strength training and steady, protein-rich meals are generally helpful, and an aggressive deficit usually is not, so your calorie change is capped. Please work with your doctor on your overall care.'));
  if (h.perimenopause) notes.push(info('Perimenopause or menopause: strength training and enough protein help protect muscle and bone. Make sure you get enough calcium and vitamin D, and ask your doctor about anything that worries you.'));
  if (h.irregular) notes.push(caution('Irregular or missing periods can be a sign of under-eating or high stress, so your deficit is kept small. If you have missed three or more periods in a row (and are not pregnant or menopausal), please see a doctor.'));

  if (gentle) { capDeficit(0.15); maxSurplus = 0.05; }
  if (obese) capDeficit(0.2);
  if (h.pcos) capDeficit(0.15);
  if (h.irregular) capDeficit(0.1);
  if (p.age < 18) capDeficit(0.1);
  if (underweight) capDeficit(0);

  return {
    blocked: false,
    health: h,
    gentle,
    lowImpact,
    obese,
    notes,
    limits: { maxDeficit, maxSurplus },
  };
}

// Cycle phase + symptom adjustments (women only).
export function womensAdjust(p, h) {
  if (p.gender !== 'female') return { vol: 1, kcal: 0, sleepBonus: 0, notes: [] };
  let vol = 1;
  let kcal = 0;
  let sleepBonus = 0;
  const notes = [];

  if (p.cycle === 'luteal') {
    vol = 0.9; kcal += 100;
    notes.push(info('Luteal phase: volume is trimmed slightly and calories nudged up (about 100 kcal) since energy needs rise a little.'));
  } else if (p.cycle === 'menstrual') {
    vol = 0.85;
    notes.push(info('Menstrual phase: volume is lowered a little. Go by how you feel and keep intensity moderate on tough days.'));
  }

  const s = h.symptoms;
  if (s.includes('cramps')) {
    vol = Math.min(vol, 0.8);
    notes.push(info('Cramps: training volume is trimmed. Gentle movement and warmth can help. If the pain is severe or new for you, please see a doctor.'));
  }
  if (s.includes('fatigue')) {
    vol = Math.min(vol, 0.9);
    sleepBonus = 0.5;
    notes.push(info('Fatigue: your sleep target is raised by 30 minutes. Include iron-rich foods (red meat, lentils, spinach) and avoid cutting calories further. Tiredness that does not lift is worth a blood test.'));
  }
  if (s.includes('bloating')) notes.push(info('Bloating: keep water intake steady, go easy on salty foods and fizzy drinks, and spread fibre across the day.'));
  if (s.includes('mood')) notes.push(info('Mood changes and cravings: eat regular meals with protein at each one (your plan does this) and avoid long gaps between meals.'));
  if (s.includes('headaches')) notes.push(info('Headaches: keep hydration and caffeine steady and do not skip meals.'));

  return { vol, kcal, sleepBonus, notes };
}
