
// ══════════════════════════════════════════════
// AUTH — backed by real API routes + secure httpOnly cookie sessions
// (no localStorage, no client-visible passwords)
// ══════════════════════════════════════════════
let currentUser = null;
let genderVal = 'male';
let enhancedVal = false;
let loadingAnimInterval = null;

function showGenerateError(msg) {
  const errorBox = document.getElementById('generate-error');
  document.getElementById('loading-screen').classList.remove('show');
  document.getElementById('intake-card').style.display = 'block';
  if (errorBox) {
    errorBox.textContent = msg;
    errorBox.style.display = 'block';
    errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else {
    alert(msg);
  }
}

window.addEventListener('error', function (e) {
  if (document.getElementById('loading-screen')?.classList.contains('show')) {
    showGenerateError('Unexpected error: ' + (e.message || 'something went wrong') + '. Please try again.');
  }
});

window.addEventListener('unhandledrejection', function (e) {
  if (document.getElementById('loading-screen')?.classList.contains('show')) {
    const reason = e.reason?.message || String(e.reason) || 'something went wrong';
    showGenerateError('Unexpected error: ' + reason + '. Please try again.');
  }
});

async function init() {
  try {
    const resp = await fetch('/api/auth/me', { credentials: 'include' });
    const data = await resp.json();
    if (data.user) {
      currentUser = data.user;
      setLoggedIn();
      enterApp();
    }
  } catch {
  }
  restoreFormDraft();
}

function openModal() { document.getElementById('auth-modal').classList.add('open'); }
function closeModal() { document.getElementById('auth-modal').classList.remove('open'); }

function switchTab(tab) {
  document.getElementById('form-signup').style.display = tab === 'signup' ? 'block' : 'none';
  document.getElementById('form-signin').style.display = tab === 'signin' ? 'block' : 'none';
  document.getElementById('tab-signup').classList.toggle('active', tab === 'signup');
  document.getElementById('tab-signin').classList.toggle('active', tab === 'signin');
  document.getElementById('signup-error').textContent = '';
  document.getElementById('signin-error').textContent = '';
}

async function doSignup() {
  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const errorEl = document.getElementById('signup-error');
  errorEl.textContent = '';

  if (!name) { errorEl.textContent = 'Please enter your name.'; return; }
  if (!email || !email.includes('@')) { errorEl.textContent = 'Enter a valid email.'; return; }
  if (password.length < 6) { errorEl.textContent = 'Password must be at least 6 characters.'; return; }

  try {
    const resp = await fetch('/api/auth/signup', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await resp.json();
    if (!resp.ok) { errorEl.textContent = data.error || 'Something went wrong. Please try again.'; return; }

    currentUser = data;
    closeModal();
    setLoggedIn();
    enterApp();
  } catch {
    errorEl.textContent = 'Network error — please try again.';
  }
}

async function doSignin() {
  const email = document.getElementById('signin-email').value.trim();
  const password = document.getElementById('signin-password').value;
  const errorEl = document.getElementById('signin-error');
  errorEl.textContent = '';

  try {
    const resp = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await resp.json();
    if (!resp.ok) { errorEl.textContent = data.error || 'Something went wrong. Please try again.'; return; }

    currentUser = data;
    closeModal();
    setLoggedIn();
    enterApp();
  } catch {
    errorEl.textContent = 'Network error — please try again.';
  }
}

async function doLogout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  } catch {
  }
  currentUser = null;
  localStorage.removeItem('holyfitness_form_draft');
  document.getElementById('nav-user-label').style.display = 'none';
  document.getElementById('nav-logout').style.display = 'none';
  document.getElementById('nav-dashboard-link').style.display = 'none';
  document.getElementById('nav-cta').style.display = 'block';
  document.getElementById('nav-cta').textContent = 'Sign In';
  showPage('page-home');
  resetPlan();
}

function setLoggedIn() {
  const first = currentUser.name.split(' ')[0].toUpperCase();
  document.getElementById('nav-user-label').textContent = currentUser.name;
  document.getElementById('nav-user-label').style.display = 'inline';
  document.getElementById('nav-cta').style.display = 'none';
  document.getElementById('nav-logout').style.display = 'inline';
  document.getElementById('nav-dashboard-link').style.display = 'inline';
  document.getElementById('dash-name').textContent = first;
}

function handleGetStarted() {
  if (currentUser) { enterApp(); }
  else { openModal(); }
}

function goHome() { showPage('page-home'); }

function enterApp() {
  if (!currentUser) { openModal(); return; }
  window.scrollTo(0, 0);
  const saved = loadPlan();
  if (saved && saved.plan) {
    renderProgressPage(saved.plan, saved.goal);
    showPage('page-progress');
  } else {
    document.getElementById('dash-name').textContent = currentUser.name.split(' ')[0].toUpperCase();
    showPage('page-dashboard');
    resetPlan();
  }
}

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

const DRAFT_KEY = 'holyfitness_form_draft';
const DRAFT_FIELD_IDS = [
  'f-age', 'f-height', 'f-weight', 'f-bf', 'f-freq', 'f-exp', 'f-sleep',
  'f-stress', 'f-goal', 'f-diet', 'f-allergies', 'f-cycle', 'f-compound', 'f-cycleweek'
];

function saveFormDraft() {
  const draft = { gender: genderVal, enhanced: enhancedVal, fields: {} };
  DRAFT_FIELD_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) draft.fields[id] = el.value;
  });
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

function restoreFormDraft() {
  const saved = localStorage.getItem(DRAFT_KEY);
  if (!saved) return;
  try {
    const draft = JSON.parse(saved);
    if (draft.fields) {
      DRAFT_FIELD_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el && draft.fields[id] !== undefined) el.value = draft.fields[id];
      });
    }
    if (draft.gender) setGender(draft.gender);
    if (draft.enhanced) setEnhanced(true);
  } catch {
  }
}

function wireFormAutoSave() {
  DRAFT_FIELD_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', saveFormDraft);
      el.addEventListener('change', saveFormDraft);
    }
  });
}

function setGender(g) {
  genderVal = g;
  document.getElementById('btn-male').classList.toggle('active', g === 'male');
  document.getElementById('btn-female').classList.toggle('active', g === 'female');
  document.getElementById('cycle-section').style.display = g === 'female' ? 'block' : 'none';
  saveFormDraft();
}

function setEnhanced(e) {
  enhancedVal = e;
  document.getElementById('btn-natural').classList.toggle('active', !e);
  document.getElementById('btn-enhanced').classList.toggle('active', e);
  document.getElementById('compound-group').style.display = e ? 'flex' : 'none';
  document.getElementById('cycle-week-group').style.display = e ? 'flex' : 'none';
  document.getElementById('enhanced-disclosure').style.display = e ? 'block' : 'none';
  saveFormDraft();
}

function switchPlanTab(tab) {
  document.querySelectorAll('.plan-tab').forEach((t, i) => {
    const tabs = ['overview','training','nutrition','sleep'];
    t.classList.toggle('active', tabs[i] === tab);
  });
  document.querySelectorAll('.plan-panel').forEach(p => p.classList.remove('active'));
  const panelMap = { overview: 'panel-overview', training: 'panel-training', nutrition: 'panel-nutrition', sleep: 'panel-sleep' };
  document.getElementById(panelMap[tab]).classList.add('active');
}

function animateLoadingSteps() {
  const steps = ['ls-1','ls-2','ls-3','ls-4','ls-5','ls-6'];
  steps.forEach(id => document.getElementById(id).classList.remove('done'));
  let i = 0;
  loadingAnimInterval = setInterval(() => {
    if (!document.getElementById('loading-screen').classList.contains('show')) {
      clearInterval(loadingAnimInterval);
      return;
    }
    if (i < steps.length) {
      document.getElementById(steps[i]).classList.add('done');
      i++;
    } else {
      steps.forEach(id => document.getElementById(id).classList.remove('done'));
      i = 0;
    }
  }, 900);
}

async function generatePlan() {
  const profile = {
    gender: genderVal,
    age: document.getElementById('f-age').value || '25',
    height: document.getElementById('f-height').value || '175',
    weight: document.getElementById('f-weight').value || '80',
    bf: document.getElementById('f-bf').value || '18',
    freq: document.getElementById('f-freq').value,
    exp: document.getElementById('f-exp').value,
    sleep: document.getElementById('f-sleep').value,
    stress: document.getElementById('f-stress').value,
    goal: document.getElementById('f-goal').value,
    diet: document.getElementById('f-diet').value,
    allerg: document.getElementById('f-allergies').value || 'none',
    cycle: genderVal === 'female' ? document.getElementById('f-cycle').value : 'N/A',
    enhancedVal: enhancedVal,
    compound: enhancedVal ? document.getElementById('f-compound').value : 'none',
    cycleWeek: enhancedVal ? (document.getElementById('f-cycleweek').value || '4') : 'N/A',
  };

  document.getElementById('intake-card').style.display = 'none';
  document.getElementById('loading-screen').classList.add('show');
  document.getElementById('plan-output').classList.remove('show');
  animateLoadingSteps();

  const errorBox = document.getElementById('generate-error');
  if (errorBox) { errorBox.style.display = 'none'; errorBox.textContent = ''; }

  try {
    const resp = await fetch('/api/plan/generate', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    const data = await resp.json();

    if (!resp.ok) {
      throw new Error(data.error || `Request failed (status ${resp.status})`);
    }

    const plan = data.plan;
    const goal = data.goal || profile.goal;

    savePlan(plan, goal);
    saveProgress({ currentDayIndex: 0 });
    saveLogs({});

    document.getElementById('loading-screen').classList.remove('show');
    renderPlan(plan, goal);

  } catch (err) {
    document.getElementById('loading-screen').classList.remove('show');
    document.getElementById('intake-card').style.display = 'block';
    const msg = err.message || 'Something went wrong generating your plan. Please try again.';
    if (errorBox) {
      errorBox.textContent = msg;
      errorBox.style.display = 'block';
      errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      alert(msg);
    }
  }
}

function renderPlan(plan, goal) {
  const ov = plan.overview;
  const days = plan.days;

  document.getElementById('ph-goal').textContent = goal.toUpperCase();
  document.getElementById('ph-meta').textContent =
    `${currentUser.name} · ${document.getElementById('f-weight').value}kg · ${document.getElementById('f-freq').value} training days/wk`;

  document.getElementById('ov-cards').innerHTML = [
    { label: 'Daily Calories', value: ov.dailyCalories.toLocaleString(), unit: 'kcal/day' },
    { label: 'Daily Protein', value: ov.dailyProtein + 'g', unit: 'per day' },
    { label: 'Daily Carbs', value: ov.dailyCarbs + 'g', unit: 'per day' },
    { label: 'Daily Fats', value: ov.dailyFats + 'g', unit: 'per day' },
    { label: 'Program', value: ov.programName, unit: '7-day cycle' },
  ].map(c => `
    <div class="ov-card">
      <div class="ov-card-label">${c.label}</div>
      <div class="ov-card-value">${c.value}</div>
      <div class="ov-card-unit">${c.unit}</div>
    </div>
  `).join('');

  document.getElementById('ov-summary').textContent = ov.summary;

  document.getElementById('training-days').innerHTML = days.map(d => {
    if (d.isRest) return `
      <div class="day-card">
        <div class="day-card-header">
          <div class="day-label">${d.day}</div>
          <div class="day-type-badge rest">Rest / Recovery</div>
        </div>
        <div class="day-card-body">
          <div class="day-section-title">Active Recovery</div>
          <div class="exercise-row"><span class="exercise-name">${d.training.warmup || 'Light walk, mobility, stretching'}</span></div>
        </div>
      </div>`;
    const exRows = (d.training.exercises || []).map(e => `
      <div class="exercise-row">
        <span class="exercise-name">${e.name}</span>
        <span class="exercise-detail">${e.sets} × ${e.reps} &nbsp;|&nbsp; ${e.rest}${e.notes ? ' — ' + e.notes : ''}</span>
      </div>`).join('');
    return `
      <div class="day-card">
        <div class="day-card-header">
          <div class="day-label">${d.day}</div>
          <div class="day-type-badge">${d.trainingType}</div>
        </div>
        <div class="day-card-body">
          <div class="day-section-title">Warm-Up</div>
          <div class="exercise-row"><span class="exercise-name">${d.training.warmup}</span></div>
          <div class="day-section-title">Workout</div>
          ${exRows}
          <div class="day-section-title">Cool-Down</div>
          <div class="exercise-row"><span class="exercise-name">${d.training.cooldown}</span></div>
        </div>
      </div>`;
  }).join('');

  document.getElementById('nutrition-days').innerHTML = days.map(d => {
    const mealRows = (d.nutrition.meals || []).map(m => `
      <div class="meal-row">
        <div>
          <div class="meal-name">${m.time} — ${m.name}</div>
          <div style="font-size:0.82rem;color:#555;margin-top:3px;">${m.foods}</div>
        </div>
        <div class="meal-macros" style="text-align:right;white-space:nowrap;margin-left:16px;">
          ${m.calories} kcal<br/>${m.protein}P · ${m.carbs}C · ${m.fats}F
        </div>
      </div>`).join('');
    return `
      <div class="day-card">
        <div class="day-card-header">
          <div class="day-label">${d.day}</div>
          <div class="day-type-badge" style="${d.isRest ? 'background:#2a2a2a' : ''}">${d.nutrition.totalCalories} kcal</div>
        </div>
        <div class="day-card-body">
          ${mealRows}
          <div class="day-section-title">Hydration & Supplements</div>
          <div class="exercise-row"><span class="exercise-name">${d.nutrition.hydration}</span></div>
          <div class="exercise-row"><span class="exercise-name">${d.nutrition.supplements}</span></div>
        </div>
      </div>`;
  }).join('');

  const sp = plan.sleepProtocol;
  const sleepDayRows = days.map(d => `
    <div class="sleep-row">
      <span class="sleep-icon">🌙</span>
      <span class="sleep-detail">${d.day} — ${d.sleep.targetHours}hrs &nbsp;|&nbsp; ${d.sleep.bedtime} → ${d.sleep.wakeTime}</span>
      <span class="sleep-note">${d.sleep.protocol}</span>
    </div>`).join('');

  document.getElementById('sleep-content').innerHTML = `
    <div style="margin-bottom:24px;">
      <div class="day-section-title" style="color:var(--red)">Sleep Strategy</div>
      <p style="font-size:0.92rem;line-height:1.75;color:#333;">${sp.overview}</p>
    </div>
    <div class="day-card" style="margin-bottom:24px;">
      <div class="day-card-header"><div class="day-label">7-Day Sleep Schedule</div></div>
      <div class="day-card-body">${sleepDayRows}</div>
    </div>
    <div class="day-section-title" style="color:var(--red);margin-bottom:12px;">Key Recovery Tips</div>
    ${(sp.tips || []).map(t => `<div class="exercise-row"><span class="exercise-name">✓ ${t}</span></div>`).join('')}
  `;

  document.getElementById('plan-output').classList.add('show');
  document.getElementById('plan-output').scrollIntoView({ behavior: 'smooth' });
}

function resetPlan() {
  document.getElementById('plan-output').classList.remove('show');
  document.getElementById('loading-screen').classList.remove('show');
  document.getElementById('intake-card').style.display = 'block';
  document.getElementById('intake-card').scrollIntoView({ behavior: 'smooth' });
}

function storageKey(kind) {
  const email = currentUser?.email || 'guest';
  return `holyfitness_${kind}_${email}`;
}

function savePlan(plan, goal) {
  localStorage.setItem(storageKey('plan'), JSON.stringify({ plan, goal, savedAt: new Date().toISOString() }));
}
function loadPlan() {
  try {
    const raw = localStorage.getItem(storageKey('plan'));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function clearPlan() { localStorage.removeItem(storageKey('plan')); }

function saveProgress(progress) {
  localStorage.setItem(storageKey('progress'), JSON.stringify(progress));
}
function loadProgress() {
  try {
    const raw = localStorage.getItem(storageKey('progress'));
    return raw ? JSON.parse(raw) : { currentDayIndex: 0 };
  } catch { return { currentDayIndex: 0 }; }
}
function clearProgress() { localStorage.removeItem(storageKey('progress')); }

function saveLogs(logs) {
  localStorage.setItem(storageKey('logs'), JSON.stringify(logs));
}
function loadLogs() {
  try {
    const raw = localStorage.getItem(storageKey('logs'));
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function clearLogs() { localStorage.removeItem(storageKey('logs')); }

function escapeAttr(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderProgressPage(plan, goal) {
  const progress = loadProgress();
  const logs = loadLogs();
  const idx = progress.currentDayIndex || 0;
  const totalDays = plan.days.length;

  document.getElementById('progress-name').textContent = currentUser.name.split(' ')[0].toUpperCase();

  document.getElementById('progress-dots').innerHTML = plan.days.map((d, i) => {
    let cls = 'progress-dot';
    if (i < idx) cls += ' complete';
    else if (i === idx) cls += ' active';
    return `<div class="${cls}"><span class="progress-dot-label">${d.day.slice(0, 3)}</span></div>`;
  }).join('');

  const isComplete = idx >= totalDays;
  document.getElementById('today-card-active').style.display = isComplete ? 'none' : 'block';
  document.getElementById('today-card-complete').style.display = isComplete ? 'block' : 'none';

  if (isComplete) {
    document.getElementById('progress-sub').textContent = "You've completed this week's plan — nice work!";
    return;
  }

  document.getElementById('progress-sub').textContent = `Day ${idx + 1} of ${totalDays} — here's what's next.`;

  const day = plan.days[idx];
  document.getElementById('today-label').textContent = `DAY ${idx + 1} · ${day.day.toUpperCase()}`;
  document.getElementById('today-type').textContent = day.isRest ? 'Rest & Recovery' : day.trainingType;
  document.getElementById('today-calories').textContent = day.nutrition?.totalCalories || plan.overview?.dailyCalories || '—';
  document.getElementById('today-sleep').textContent = day.sleep?.targetHours ? day.sleep.targetHours + 'h' : '—';
  document.getElementById('today-exercises').textContent = day.isRest ? '0' : (day.training?.exercises?.length || 0);

  const dayLog = logs[idx] || {};
  setLogTileStatus('status-workout', dayLog.workout?.saved);
  setLogTileStatus('status-meals', dayLog.meals?.saved);
  setLogTileStatus('status-sleep', dayLog.sleep?.saved);

  document.getElementById('advance-day-btn').textContent =
    idx === totalDays - 1 ? 'Finish Week →' : 'Mark Day Complete & Continue →';
}

function setLogTileStatus(elId, done) {
  const el = document.getElementById(elId);
  el.textContent = done ? '✓ Logged' : 'Not logged yet';
  el.classList.toggle('done', !!done);
}

function advanceDay() {
  const progress = loadProgress();
  progress.currentDayIndex = (progress.currentDayIndex || 0) + 1;
  saveProgress(progress);
  const saved = loadPlan();
  if (saved) renderProgressPage(saved.plan, saved.goal);
}

function viewFullPlan() {
  const saved = loadPlan();
  if (!saved || !saved.plan) { alert('No plan found yet — generate one first.'); return; }
  document.getElementById('dash-name').textContent = currentUser.name.split(' ')[0].toUpperCase();
  showPage('page-dashboard');
  document.getElementById('intake-card').style.display = 'none';
  document.getElementById('loading-screen').classList.remove('show');
  renderPlan(saved.plan, saved.goal);
}

function confirmStartNewPlan() {
  if (confirm("This will clear your current plan and progress so you can build a fresh one. You can't undo this. Continue?")) {
    startNewPlan();
  }
}

function startNewPlan() {
  clearPlan();
  clearProgress();
  clearLogs();
  document.getElementById('dash-name').textContent = currentUser.name.split(' ')[0].toUpperCase();
  showPage('page-dashboard');
  resetPlan();
}

function closeLoggerModal(id) {
  document.getElementById(id).classList.remove('open');
}

function currentDayContext() {
  const saved = loadPlan();
  if (!saved || !saved.plan) return null;
  const progress = loadProgress();
  const idx = progress.currentDayIndex || 0;
  if (idx >= saved.plan.days.length) return null;
  return { saved, idx, day: saved.plan.days[idx] };
}

function openWorkoutLogger() {
  const ctx = currentDayContext();
  if (!ctx) return;
  const { day, idx } = ctx;
  const logs = loadLogs();
  const existing = logs[idx]?.workout;

  document.getElementById('workout-modal-sub').textContent = `${day.day} — ${day.isRest ? 'Rest Day' : day.trainingType}`;

  let bodyHtml;
  const exercises = (!day.isRest && day.training?.exercises) ? day.training.exercises : [];
  if (exercises.length === 0) {
    bodyHtml = `<div class="form-field"><label>Notes (optional — light activity, how you felt, etc.)</label><input type="text" id="workout-log-notes" value="${escapeAttr(existing?.notes)}" placeholder="e.g. 20 min walk" /></div>`;
  } else {
    bodyHtml = exercises.map((ex, i) => {
      const checked = existing?.checks?.[i] ? 'checked' : '';
      return `<label class="logger-check-row"><input type="checkbox" id="wex-${i}" ${checked}/><span><strong>${ex.name}</strong><span class="logger-check-detail">${ex.sets} × ${ex.reps}${ex.rest ? ' · ' + ex.rest : ''}</span></span></label>`;
    }).join('') +
    `<div class="form-field" style="margin-top:14px;"><label>Notes (optional)</label><input type="text" id="workout-log-notes" value="${escapeAttr(existing?.notes)}" placeholder="How did it feel?" /></div>`;
  }
  document.getElementById('workout-modal-body').innerHTML = bodyHtml;
  document.getElementById('workout-modal').classList.add('open');
}

function saveWorkoutLog() {
  const ctx = currentDayContext();
  if (!ctx) return;
  const { saved, idx, day } = ctx;
  const exercises = (!day.isRest && day.training?.exercises) ? day.training.exercises : [];
  const checks = exercises.map((_, i) => document.getElementById(`wex-${i}`)?.checked || false);
  const notes = document.getElementById('workout-log-notes')?.value || '';

  const logs = loadLogs();
  logs[idx] = logs[idx] || {};
  logs[idx].workout = { saved: true, checks, notes, loggedAt: new Date().toISOString() };
  saveLogs(logs);

  closeLoggerModal('workout-modal');
  renderProgressPage(saved.plan, saved.goal);
}

let customMealDraft = [];

function openMealLogger() {
  const ctx = currentDayContext();
  if (!ctx) return;
  const { day, idx } = ctx;
  const logs = loadLogs();
  const existing = logs[idx]?.meals;

  document.getElementById('meal-modal-sub').textContent = day.day;
  const meals = day.nutrition?.meals || [];
  document.getElementById('meal-modal-body').innerHTML = meals.length
    ? meals.map((m, i) => {
        const checked = existing?.checks?.[i] ? 'checked' : '';
        return `<label class="logger-check-row"><input type="checkbox" id="mck-${i}" ${checked}/><span><strong>${m.time} — ${m.name}</strong><span class="logger-check-detail">${m.foods}</span></span></label>`;
      }).join('')
    : '<p style="font-size:0.85rem;color:var(--gray-mid);">No meals in today\'s plan.</p>';

  customMealDraft = (existing?.custom || []).slice();
  renderCustomMealList();
  document.getElementById('custom-meal-name').value = '';
  document.getElementById('custom-meal-cal').value = '';
  document.getElementById('meal-modal').classList.add('open');
}

function renderCustomMealList() {
  document.getElementById('custom-meal-list').innerHTML = customMealDraft.map((m, i) =>
    `<span class="custom-meal-chip">${m.name}${m.calories ? ' · ' + m.calories + 'kcal' : ''} <button type="button" onclick="removeCustomMeal(${i})">✕</button></span>`
  ).join('');
}

function addCustomMeal() {
  const nameEl = document.getElementById('custom-meal-name');
  const calEl = document.getElementById('custom-meal-cal');
  const name = nameEl.value.trim();
  if (!name) return;
  const calories = parseInt(calEl.value, 10) || 0;
  customMealDraft.push({ name, calories });
  nameEl.value = '';
  calEl.value = '';
  renderCustomMealList();
}

function removeCustomMeal(i) {
  customMealDraft.splice(i, 1);
  renderCustomMealList();
}

function saveMealLog() {
  const ctx = currentDayContext();
  if (!ctx) return;
  const { saved, idx, day } = ctx;
  const meals = day.nutrition?.meals || [];
  const checks = meals.map((_, i) => document.getElementById(`mck-${i}`)?.checked || false);

  const logs = loadLogs();
  logs[idx] = logs[idx] || {};
  logs[idx].meals = { saved: true, checks, custom: customMealDraft.slice(), loggedAt: new Date().toISOString() };
  saveLogs(logs);

  closeLoggerModal('meal-modal');
  renderProgressPage(saved.plan, saved.goal);
}

function openSleepLogger() {
  const ctx = currentDayContext();
  if (!ctx) return;
  const { day, idx } = ctx;
  const logs = loadLogs();
  const existing = logs[idx]?.sleep;

  document.getElementById('sleep-modal-sub').textContent =
    `Target: ${day.sleep?.targetHours || '—'}h · ${day.sleep?.bedtime || ''} → ${day.sleep?.wakeTime || ''}`;
  document.getElementById('log-sleep-hours').value = existing?.hours ?? '';
  document.getElementById('log-sleep-bedtime').value = existing?.bedtime ?? '';
  document.getElementById('log-sleep-waketime').value = existing?.waketime ?? '';
  document.getElementById('log-sleep-quality').value = existing?.quality ?? 'ok';
  document.getElementById('log-sleep-notes').value = existing?.notes ?? '';
  document.getElementById('sleep-modal').classList.add('open');
}

function saveSleepLog() {
  const ctx = currentDayContext();
  if (!ctx) return;
  const { saved, idx } = ctx;

  const logs = loadLogs();
  logs[idx] = logs[idx] || {};
  logs[idx].sleep = {
    saved: true,
    hours: document.getElementById('log-sleep-hours').value,
    bedtime: document.getElementById('log-sleep-bedtime').value,
    waketime: document.getElementById('log-sleep-waketime').value,
    quality: document.getElementById('log-sleep-quality').value,
    notes: document.getElementById('log-sleep-notes').value,
    loggedAt: new Date().toISOString(),
  };
  saveLogs(logs);

  closeLoggerModal('sleep-modal');
  renderProgressPage(saved.plan, saved.goal);
}

['workout-modal', 'meal-modal', 'sleep-modal'].forEach(id => {
  document.getElementById(id).addEventListener('click', function (e) {
    if (e.target === this) closeLoggerModal(id);
  });
});

document.getElementById('auth-modal').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});

init();
wireFormAutoSave();
