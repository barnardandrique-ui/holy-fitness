// lib/planner/exercises.js
// ---------------------------------------------------------------------------
// Exercise library + session templates for the plan generator.
//
// lvl: 1 = beginner-friendly, 2 = intermediate and up, 3 = advanced only
// strength: true  -> a "big barbell lift" preferred for strength-focused goals
// noMain: true    -> fine as an accessory, but not sensible as a session's main lift
// timed / perSide -> changes how reps are displayed
// ---------------------------------------------------------------------------

export const POOLS = {
  squat: [
    { name: 'Barbell Back Squat', lvl: 2, strength: true },
    { name: 'Front Squat', lvl: 3, strength: true },
    { name: 'Goblet Squat', lvl: 1, maxLvl: 1 },
    { name: 'Leg Press', lvl: 1 },
    { name: 'Hack Squat', lvl: 1 },
    { name: 'Smith Machine Squat', lvl: 1, maxLvl: 2 },
  ],
  hinge: [
    { name: 'Trap Bar Deadlift', lvl: 1, strength: true },
    { name: 'Romanian Deadlift', lvl: 2, strength: true },
    { name: 'Conventional Deadlift', lvl: 2, strength: true },
    { name: 'Sumo Deadlift', lvl: 2, strength: true },
    { name: 'Dumbbell Romanian Deadlift', lvl: 1 },
    { name: 'Cable Pull-Through', lvl: 1, noMain: true },
    { name: '45° Back Extension', lvl: 1, noMain: true },
    { name: 'Good Morning', lvl: 3, noMain: true },
  ],
  horizontalPush: [
    { name: 'Barbell Bench Press', lvl: 2, strength: true },
    { name: 'Dumbbell Bench Press', lvl: 1 },
    { name: 'Machine Chest Press', lvl: 1 },
    { name: 'Smith Machine Bench Press', lvl: 1, maxLvl: 2 },
    { name: 'Push-Ups', lvl: 1, maxLvl: 2, noMain: true },
    { name: 'Close-Grip Bench Press', lvl: 2, noMain: true },
  ],
  inclinePush: [
    { name: 'Incline Dumbbell Press', lvl: 1 },
    { name: 'Incline Barbell Press', lvl: 2 },
    { name: 'Incline Machine Press', lvl: 1 },
    { name: 'Pec Deck Fly', lvl: 1, noMain: true },
    { name: 'Low-to-High Cable Fly', lvl: 2, noMain: true },
    { name: 'Chest Dips', lvl: 3 },
  ],
  verticalPush: [
    { name: 'Standing Barbell Overhead Press', lvl: 2, strength: true },
    { name: 'Seated Dumbbell Shoulder Press', lvl: 1 },
    { name: 'Machine Shoulder Press', lvl: 1 },
    { name: 'Arnold Press', lvl: 2 },
    { name: 'Landmine Press', lvl: 2 },
  ],
  lateralDelt: [
    { name: 'Dumbbell Lateral Raise', lvl: 1 },
    { name: 'Cable Lateral Raise', lvl: 1 },
    { name: 'Machine Lateral Raise', lvl: 1 },
    { name: 'Leaning Cable Lateral Raise', lvl: 2 },
  ],
  triceps: [
    { name: 'Cable Triceps Pressdown', lvl: 1 },
    { name: 'Rope Pushdown', lvl: 1 },
    { name: 'Overhead Cable Triceps Extension', lvl: 1 },
    { name: 'Dumbbell Overhead Triceps Extension', lvl: 1 },
    { name: 'EZ-Bar Skull Crushers', lvl: 2 },
    { name: 'Parallel Bar Dips', lvl: 2 },
  ],
  verticalPull: [
    { name: 'Pull-Ups', lvl: 2, strength: true },
    { name: 'Chin-Ups', lvl: 2, strength: true },
    { name: 'Lat Pulldown', lvl: 1 },
    { name: 'Neutral-Grip Pulldown', lvl: 1 },
    { name: 'Assisted Pull-Ups', lvl: 1, maxLvl: 1 },
    { name: 'Single-Arm Lat Pulldown', lvl: 2 },
  ],
  horizontalPull: [
    { name: 'Barbell Row', lvl: 2, strength: true },
    { name: 'T-Bar Row', lvl: 2 },
    { name: 'Seated Cable Row', lvl: 1 },
    { name: 'Chest-Supported Dumbbell Row', lvl: 1 },
    { name: 'One-Arm Dumbbell Row', lvl: 1, perSide: true },
    { name: 'Machine Row', lvl: 1 },
    { name: 'Inverted Row', lvl: 1, maxLvl: 2 },
  ],
  rearDelt: [
    { name: 'Face Pulls', lvl: 1 },
    { name: 'Reverse Pec Deck', lvl: 1 },
    { name: 'Rear-Delt Dumbbell Fly', lvl: 1 },
    { name: 'Cable Rear-Delt Fly', lvl: 2 },
  ],
  biceps: [
    { name: 'Dumbbell Curl', lvl: 1 },
    { name: 'EZ-Bar Curl', lvl: 1 },
    { name: 'Cable Curl', lvl: 1 },
    { name: 'Incline Dumbbell Curl', lvl: 2 },
    { name: 'Preacher Curl', lvl: 2 },
    { name: 'Bayesian Cable Curl', lvl: 3 },
  ],
  bicepsB: [
    { name: 'Hammer Curl', lvl: 1 },
    { name: 'Rope Hammer Curl', lvl: 1 },
    { name: 'Cross-Body Hammer Curl', lvl: 2 },
  ],
  quad: [
    { name: 'Leg Extension', lvl: 1 },
    { name: 'Single-Leg Leg Extension', lvl: 2, perSide: true },
  ],
  lunge: [
    { name: 'Walking Lunges', lvl: 1, perSide: true },
    { name: 'Reverse Lunge', lvl: 1, perSide: true },
    { name: 'Dumbbell Split Squat', lvl: 1, perSide: true },
    { name: 'Step-Ups', lvl: 1, perSide: true },
    { name: 'Bulgarian Split Squat', lvl: 2, perSide: true },
  ],
  legCurl: [
    { name: 'Lying Leg Curl', lvl: 1 },
    { name: 'Seated Leg Curl', lvl: 1 },
    { name: 'Nordic Hamstring Curl', lvl: 3 },
  ],
  glute: [
    { name: 'Hip Thrust', lvl: 1 },
    { name: 'Glute Bridge', lvl: 1, maxLvl: 1 },
    { name: 'Cable Glute Kickback', lvl: 1, perSide: true },
  ],
  calves: [
    { name: 'Standing Calf Raise', lvl: 1 },
    { name: 'Seated Calf Raise', lvl: 1 },
    { name: 'Leg Press Calf Raise', lvl: 1 },
  ],
  core: [
    { name: 'Plank', lvl: 1, timed: true },
    { name: 'Cable Crunch', lvl: 1 },
    { name: 'Dead Bug', lvl: 1, perSide: true },
    { name: 'Pallof Press', lvl: 1, perSide: true },
    { name: 'Side Plank', lvl: 1, timed: true },
    { name: 'Hanging Knee Raise', lvl: 2 },
    { name: 'Ab Wheel Rollout', lvl: 2 },
    { name: 'Hanging Leg Raise', lvl: 3 },
  ],
  power: [
    { name: 'Box Jump', lvl: 1 },
    { name: 'Kettlebell Swing', lvl: 1 },
    { name: 'Medicine Ball Slam', lvl: 1 },
    { name: 'Broad Jump', lvl: 1 },
    { name: 'Medicine Ball Chest Throw', lvl: 1 },
    { name: 'Jump Squat', lvl: 2 },
    { name: 'Push Press', lvl: 2 },
  ],
};

// Conditioning finishers (used for fat-loss plans)
export const FINISHERS = [
  { name: 'Assault Bike Intervals', sets: '6', reps: '30s hard / 60s easy', rest: '—', notes: 'Finisher — all-out on the hard rounds' },
  { name: 'Rowing Machine Intervals', sets: '5', reps: '45s hard / 75s easy', rest: '—', notes: 'Finisher — long, powerful strokes' },
  { name: 'Incline Treadmill Walk', sets: '1', reps: '12 min', rest: '—', notes: 'Finisher — 10-12% incline, brisk pace' },
  { name: "Farmer's Carry", sets: '4', reps: '30-40 m', rest: '60s', notes: 'Finisher — heavy, stand tall' },
  { name: 'Ski Erg Intervals', sets: '6', reps: '30s hard / 60s easy', rest: '—', notes: 'Finisher — drive with the hips' },
];

// Slot helper: pool, role, minimum experience level
const S = (pool, role, min = 1) => ({ pool, role, min });

export const TEMPLATES = {
  'Full Body A': {
    label: 'Full Body — Squat Focus', base: 'Full Body',
    slots: [S('squat', 'main'), S('horizontalPush', 'secondary'), S('horizontalPull', 'secondary'), S('hinge', 'accessory'), S('lateralDelt', 'isolation', 2), S('core', 'core')],
  },
  'Full Body B': {
    label: 'Full Body — Hinge Focus', base: 'Full Body',
    slots: [S('hinge', 'main'), S('verticalPush', 'secondary'), S('verticalPull', 'secondary'), S('lunge', 'accessory'), S('triceps', 'isolation', 2), S('biceps', 'isolation', 3), S('core', 'core')],
  },
  'Upper A': {
    label: 'Upper Body — Horizontal Focus', base: 'Upper',
    slots: [S('horizontalPush', 'main'), S('horizontalPull', 'main'), S('verticalPush', 'secondary'), S('verticalPull', 'secondary'), S('lateralDelt', 'isolation', 2), S('triceps', 'isolation'), S('biceps', 'isolation', 2)],
  },
  'Upper B': {
    label: 'Upper Body — Vertical Focus', base: 'Upper',
    slots: [S('verticalPush', 'main'), S('verticalPull', 'main'), S('inclinePush', 'secondary'), S('horizontalPull', 'secondary'), S('rearDelt', 'accessory', 2), S('bicepsB', 'isolation'), S('triceps', 'isolation', 2)],
  },
  'Lower A': {
    label: 'Lower Body — Squat Focus', base: 'Lower',
    slots: [S('squat', 'main'), S('hinge', 'secondary'), S('lunge', 'accessory'), S('legCurl', 'isolation'), S('calves', 'isolation', 2), S('core', 'core')],
  },
  'Lower B': {
    label: 'Lower Body — Hinge Focus', base: 'Lower',
    slots: [S('hinge', 'main'), S('squat', 'secondary'), S('glute', 'accessory'), S('quad', 'isolation'), S('calves', 'isolation', 2), S('core', 'core', 2)],
  },
  'Push A': {
    label: 'Push — Chest, Shoulders, Triceps', base: 'Push',
    slots: [S('horizontalPush', 'main'), S('verticalPush', 'secondary'), S('inclinePush', 'accessory'), S('lateralDelt', 'isolation'), S('triceps', 'isolation'), S('triceps', 'isolation', 3)],
  },
  'Push B': {
    label: 'Push — Shoulders & Upper Chest', base: 'Push',
    slots: [S('verticalPush', 'main'), S('inclinePush', 'secondary'), S('horizontalPush', 'accessory'), S('lateralDelt', 'isolation'), S('triceps', 'isolation')],
  },
  'Pull A': {
    label: 'Pull — Back & Biceps', base: 'Pull',
    slots: [S('verticalPull', 'main'), S('horizontalPull', 'secondary'), S('rearDelt', 'accessory'), S('biceps', 'isolation'), S('bicepsB', 'isolation', 2), S('core', 'core', 2)],
  },
  'Pull B': {
    label: 'Pull — Thickness & Rear Delts', base: 'Pull',
    slots: [S('horizontalPull', 'main'), S('verticalPull', 'secondary'), S('rearDelt', 'accessory'), S('bicepsB', 'isolation'), S('biceps', 'isolation', 2)],
  },
  'Legs A': {
    label: 'Legs — Quad Focus', base: 'Legs',
    slots: [S('squat', 'main'), S('hinge', 'secondary'), S('lunge', 'accessory'), S('quad', 'isolation'), S('calves', 'isolation'), S('core', 'core', 2)],
  },
  'Legs B': {
    label: 'Legs — Hamstring & Glute Focus', base: 'Legs',
    slots: [S('hinge', 'main'), S('squat', 'secondary'), S('glute', 'accessory'), S('legCurl', 'isolation'), S('calves', 'isolation'), S('core', 'core', 2)],
  },
};

export const WARMUPS = {
  'Full Body': '5 min easy bike or row, dynamic mobility, 2 light ramp-up sets of your first lift',
  Upper: '5 min row, band pull-aparts, arm circles, 2 light ramp-up sets of your first press',
  Lower: '5 min bike, leg swings, bodyweight squats and hip bridges, 2 ramp-up sets',
  Push: '5 min row, band pull-aparts, shoulder circles, 2 light ramp-up sets of your first press',
  Pull: '5 min row, scapular pull-ups, band face pulls, 2 light ramp-up sets',
  Legs: '5 min bike, leg swings, bodyweight squats and hip bridges, 2 ramp-up sets',
};

export const COOLDOWNS = {
  'Full Body': '5 min easy walk, then stretch quads, hamstrings, chest and lats',
  Upper: '5 min easy walk, then stretch chest, lats, shoulders and triceps',
  Lower: '5 min easy walk, then stretch quads, hamstrings, glutes and calves',
  Push: '5 min easy walk, then stretch chest, shoulders and triceps',
  Pull: '5 min easy walk, then stretch lats, biceps and upper back',
  Legs: '5 min easy walk, then stretch quads, hamstrings, glutes and calves',
};
