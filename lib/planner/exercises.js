// lib/planner/exercises.js
// ---------------------------------------------------------------------------
// Session templates, finishers, warm-ups and cool-downs for the plan generator. (The exercise pools are in library.js.)
//
// Pool entries (see library.js): lvl 1/2/3, strength (big lift), noMain (accessory only), timed / perSide
// (changes how reps are shown), li (safe for gentle / low-impact plans), eq (equipment).
// ---------------------------------------------------------------------------

// The exercise pools come from the Free Exercise DB (public domain), curated and flagged by
// scripts/build-planner-library.py. Every exercise there has a library id, name, level and photos.
export { POOLS } from './library.js';

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
