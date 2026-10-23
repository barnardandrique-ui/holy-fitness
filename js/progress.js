// js/progress.js — pure logic for daily targets, streaks and history views.
// No DOM access here, so it can be tested on its own. Exposed as window.HFProgress.
(function (root) {
  'use strict';

  const SLEEP_GRACE_HOURS = 0.5;   // sleep counts as "on target" within 30 minutes of the goal
  const KCAL_OVER_LIMIT = 1.10;    // planned meals + extras may not exceed 110% of the day's calories
  const MAX_HISTORY = 730;         // about two years of days

  const num = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
  const pad = n => String(n).padStart(2, '0');
  const round1 = n => Math.round(n * 10) / 10;

  // ── Dates (all "YYYY-MM-DD", calendar maths done in UTC so daylight saving can't skew it) ──
  function localDate(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  const parseDate = ds => { const p = String(ds).split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])); };
  const fmtDate = dt => dt.getUTCFullYear() + '-' + pad(dt.getUTCMonth() + 1) + '-' + pad(dt.getUTCDate());
  function addDays(ds, n) { const dt = parseDate(ds); dt.setUTCDate(dt.getUTCDate() + n); return fmtDate(dt); }
  function weekStart(ds) { const wd = (parseDate(ds).getUTCDay() + 6) % 7; return addDays(ds, -wd); }   // Monday
  const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();                                // m = 1..12

  // ── Did the person hit today's targets? ──
  function evaluateDay(day, log) {
    log = log || {};
    // Workout: every planned exercise ticked. A rest day has nothing to tick, so it counts as met.
    const exercises = (!day.isRest && day.training && day.training.exercises) ? day.training.exercises : [];
    const wTotal = exercises.length;
    const wChecks = (log.workout && log.workout.checks) || [];
    const wDone = exercises.reduce((n, _, i) => n + (wChecks[i] ? 1 : 0), 0);
    const wSaved = !!(log.workout && log.workout.saved);
    const wHit = wTotal === 0 ? true : (wSaved && wDone === wTotal);

    // Meals: every planned meal ticked, and extras can't push the day past 110% of its calories.
    const meals = (day.nutrition && day.nutrition.meals) || [];
    const mChecks = (log.meals && log.meals.checks) || [];
    let mDone = 0, planned = 0;
    meals.forEach((m, i) => { if (mChecks[i]) { mDone++; planned += num(m.calories); } });
    const extras = ((log.meals && log.meals.custom) || []).map(c => ({ name: String(c.name || '').slice(0, 40), kcal: Math.max(0, Math.round(num(c.calories))) }));
    const kcal = Math.round(planned + extras.reduce((s, c) => s + c.kcal, 0));
    const kcalTarget = Math.round(num(day.nutrition && day.nutrition.totalCalories));
    const mSaved = !!(log.meals && log.meals.saved);
    const mHit = mSaved && meals.length > 0 && mDone === meals.length && (!kcalTarget || kcal <= kcalTarget * KCAL_OVER_LIMIT);

    // Sleep: logged, and within 30 minutes of the target (more sleep is never penalised).
    const sl = log.sleep || {};
    const hours = (sl.saved && sl.hours !== '' && sl.hours != null) ? num(sl.hours, NaN) : NaN;
    const sTarget = num(day.sleep && day.sleep.targetHours);
    const sHit = !!sl.saved && Number.isFinite(hours) && hours >= sTarget - SLEEP_GRACE_HOURS;

    const hitCount = (wHit ? 1 : 0) + (mHit ? 1 : 0) + (sHit ? 1 : 0);
    return {
      workout: { done: wDone, total: wTotal, hit: wHit, rest: wTotal === 0, saved: wSaved },
      meals: { done: mDone, total: meals.length, kcal, target: kcalTarget, hit: mHit, saved: mSaved, extras },
      sleep: { hours, target: sTarget, hit: sHit, saved: !!sl.saved, quality: sl.quality || '' },
      hitCount, perfect: hitCount === 3,
    };
  }

  // ── A compact, permanent record of one day (this is what history is built from) ──
  function makeEntry(planId, dayIndex, day, log, date, prev) {
    log = log || {};
    const ev = evaluateDay(day, log);
    const notes = [log.workout && log.workout.notes, log.sleep && log.sleep.notes].filter(Boolean).join(' · ').slice(0, 200);
    return {
      id: planId + ':' + dayIndex, planId, dayIndex,
      day: String(day.day || ''), type: day.isRest ? 'Rest & Recovery' : String(day.trainingType || 'Training').slice(0, 80),
      date,
      w: [ev.workout.done, ev.workout.total, ev.workout.hit ? 1 : 0],
      m: [ev.meals.done, ev.meals.total, ev.meals.kcal, ev.meals.target, ev.meals.hit ? 1 : 0],
      s: [Number.isFinite(ev.sleep.hours) ? round1(ev.sleep.hours) : null, ev.sleep.target, ev.sleep.hit ? 1 : 0, ev.sleep.quality],
      hits: ev.hitCount, perfect: ev.perfect ? 1 : 0,
      x: ev.meals.extras.slice(0, 5).map(e => [e.name, e.kcal]),
      n: notes,
      c: prev && prev.c ? 1 : 0,          // already celebrated? (so we never celebrate the same day twice)
    };
  }

  function upsert(history, entry) {
    const list = (history || []).filter(e => e.id !== entry.id);
    list.push(entry);
    list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.planId + a.dayIndex < b.planId + b.dayIndex ? -1 : 1)));
    return list.length > MAX_HISTORY ? list.slice(list.length - MAX_HISTORY) : list;
  }

  // The best entry for each calendar date (a date could hold two if someone logs two plan days in one day).
  function byDate(history) {
    const map = {};
    (history || []).forEach(e => { const cur = map[e.date]; if (!cur || e.perfect > cur.perfect || (e.perfect === cur.perfect && e.hits > cur.hits)) map[e.date] = e; });
    return map;
  }

  // ── Streaks: consecutive calendar days with a perfect day. Today doesn't break it until the day is over. ──
  function streaks(history, today) {
    const perfect = new Set((history || []).filter(e => e.perfect).map(e => e.date));
    const dates = [...perfect].sort();
    let longest = 0, run = 0, prev = null;
    dates.forEach(d => { run = prev && addDays(prev, 1) === d ? run + 1 : 1; if (run > longest) longest = run; prev = d; });
    let d = perfect.has(today) ? today : (perfect.has(addDays(today, -1)) ? addDays(today, -1) : null);
    let current = 0;
    while (d && perfect.has(d)) { current++; d = addDays(d, -1); }
    return { current, longest };
  }

  function summary(history) {
    const map = byDate(history); const dates = Object.keys(map);
    const sleeps = (history || []).map(e => e.s && e.s[0]).filter(v => v != null);
    return {
      daysLogged: dates.length,
      perfectDays: dates.filter(d => map[d].perfect).length,
      workouts: (history || []).filter(e => e.w && e.w[1] > 0 && e.w[2] === 1).length,
      avgSleep: sleeps.length ? round1(sleeps.reduce((a, b) => a + b, 0) / sleeps.length) : null,
    };
  }

  // ── Weeks (Monday to Sunday) ──
  function weeks(history) {
    const map = byDate(history); const starts = new Set(Object.keys(map).map(weekStart));
    return [...starts].sort().reverse().map(start => {
      const days = Array.from({ length: 7 }, (_, i) => { const date = addDays(start, i); return { date, entry: map[date] || null }; });
      const es = days.map(d => d.entry).filter(Boolean);
      const sleeps = es.map(e => e.s[0]).filter(v => v != null);
      const ratios = es.filter(e => e.m[3] > 0 && e.m[0] > 0).map(e => e.m[2] / e.m[3]);
      const hits = es.reduce((s, e) => s + e.hits, 0);
      return {
        start, end: addDays(start, 6), days,
        logged: es.length, perfect: es.filter(e => e.perfect).length,
        workoutsDone: es.filter(e => e.w[1] > 0 && e.w[2] === 1).length, workoutsPlanned: es.filter(e => e.w[1] > 0).length,
        avgSleep: sleeps.length ? round1(sleeps.reduce((a, b) => a + b, 0) / sleeps.length) : null,
        calorieRatio: ratios.length ? Math.round(100 * ratios.reduce((a, b) => a + b, 0) / ratios.length) : null,
        adherence: es.length ? Math.round(100 * hits / (3 * es.length)) : 0,
      };
    });
  }

  // ── One month as a calendar grid (month = 1..12) ──
  function month(history, year, mon) {
    const map = byDate(history); const first = year + '-' + pad(mon) + '-01';
    const offset = (parseDate(first).getUTCDay() + 6) % 7; const n = daysInMonth(year, mon);
    const cells = [];
    for (let i = 0; i < offset; i++) cells.push(null);
    for (let d = 1; d <= n; d++) { const date = year + '-' + pad(mon) + '-' + pad(d); cells.push({ date, day: d, entry: map[date] || null }); }
    const es = cells.filter(c => c && c.entry).map(c => c.entry);
    const inMonth = (history || []).filter(e => e.date.slice(0, 7) === year + '-' + pad(mon));
    return {
      year, month: mon, cells, logged: es.length, perfect: es.filter(e => e.perfect).length,
      workouts: inMonth.filter(e => e.w[1] > 0 && e.w[2] === 1).length,
      longestStreak: streaks(inMonth, '0000-00-00').longest,
    };
  }

  // ── What to say when someone nails it ──
  const DAY_LINES = [
    'You did exactly what you set out to do today.',
    'Workout, meals and sleep: all done. That is what intent looks like.',
    'Every target hit. Consistency like this is what changes results.',
    'A day you can be proud of. Rest well.',
  ];
  const MILESTONES = {
    3: { title: 'Three in a <em>row.</em>', line: 'Three perfect days back to back. The habit is forming.' },
    7: { title: 'A full <em>week.</em>', line: 'Seven perfect days in a row. That takes real discipline.' },
    14: { title: 'Two <em>weeks.</em>', line: 'Fourteen days straight. This is a habit now.' },
    21: { title: 'Twenty-one <em>days.</em>', line: 'Three weeks of showing up every single day.' },
    30: { title: 'Thirty <em>days.</em>', line: 'A whole month of perfect days. Remarkable.' },
    50: { title: 'Fifty <em>days.</em>', line: 'Fifty perfect days in a row. Few people ever get here.' },
    100: { title: 'One hundred <em>days.</em>', line: 'A hundred perfect days. This is who you are now.' },
  };

  function celebrationFor(entry, history, today, planDays) {
    const st = streaks(history, entry.date || today);
    const planPerfect = (history || []).filter(e => e.planId === entry.planId && e.perfect).length;
    let kind = 'day', title = 'Perfect <em>day.</em>', line = DAY_LINES[(entry.dayIndex || 0) % DAY_LINES.length], kicker = 'Every target hit';
    if (planDays && planPerfect >= planDays) { kind = 'week'; title = 'A perfect <em>week.</em>'; line = 'Every single day of this plan, done to the letter. Outstanding.'; kicker = 'Plan complete'; }
    else if (MILESTONES[st.current]) { kind = 'streak'; title = MILESTONES[st.current].title; line = MILESTONES[st.current].line; kicker = st.current + '-day streak'; }
    return { kind, title, line, kicker, streak: st.current, planPerfect, planDays: planDays || 0 };
  }

  root.HFProgress = {
    SLEEP_GRACE_HOURS, KCAL_OVER_LIMIT, MAX_HISTORY,
    localDate, parseDate, addDays, weekStart, daysInMonth,
    evaluateDay, makeEntry, upsert, byDate, streaks, summary, weeks, month, celebrationFor,
  };
})(typeof window !== 'undefined' ? window : globalThis);
