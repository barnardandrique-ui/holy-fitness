
// ══════════════════════════════════════════════
// AUTH — backed by real API routes + secure httpOnly cookie sessions
// (the session itself never touches JavaScript or localStorage)
// ══════════════════════════════════════════════
let currentUser = null;
let genderVal = 'male';
let loadingAnimInterval = null;
let resetToken = null;

// ══════════════════════════════════════════════
// STATE — plan, progress and logs are saved on the server so they follow the
// account across devices. A local cache keeps changes safe if the connection
// drops, and is re-synced the next time the app loads.
// ══════════════════════════════════════════════
function defaultState() {
  return { plan: null, goal: null, planId: null, progress: { currentDayIndex: 0 }, logs: {}, history: [], updatedAt: 0 };
}
let appState = defaultState();
let persistTimer = null;
let retryTimer = null;
let dirty = false;
let retries = 0;

const cacheKey = () => `holyfitness_cache_${currentUser ? currentUser.id : 'guest'}`;
function writeCache() { try { localStorage.setItem(cacheKey(), JSON.stringify(appState)); } catch { /* storage full/blocked */ } }
function readCache() { try { const r = localStorage.getItem(cacheKey()); return r ? JSON.parse(r) : null; } catch { return null; } }

// Call after every change to plan/progress/logs.
function touch() {
  appState.updatedAt = Date.now();
  writeCache();
  persistState();
}

function persistState() {
  dirty = true;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => flushState(), 400);
}

async function flushState(keepalive = false) {
  clearTimeout(persistTimer);
  if (!currentUser || !dirty) return true;
  const sentAt = appState.updatedAt;
  try {
    const resp = await fetch('/api/state', {
      method: 'PUT',
      credentials: 'include',
      keepalive,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: appState }),
    });
    if (!resp.ok) throw new Error('save failed ' + resp.status);
    if (appState.updatedAt === sentAt) dirty = false; // nothing newer to send
    retries = 0;
    return true;
  } catch {
    if (retries < 5) {
      retries++;
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => flushState(), 5000 * retries);
    }
    return false;
  }
}

// Older versions kept everything in this browser only; pull that data into the account once.
function migrateLegacyState() {
  try {
    const e = currentUser.email;
    const saved = JSON.parse(localStorage.getItem(`holyfitness_plan_${e}`) || 'null');
    if (!saved || !saved.plan) return null;
    const progress = JSON.parse(localStorage.getItem(`holyfitness_progress_${e}`) || 'null') || { currentDayIndex: 0 };
    const logs = JSON.parse(localStorage.getItem(`holyfitness_logs_${e}`) || '{}');
    ['plan', 'progress', 'logs'].forEach(k => localStorage.removeItem(`holyfitness_${k}_${e}`));
    return { plan: saved.plan, goal: saved.goal, progress, logs, updatedAt: Date.now() };
  } catch { return null; }
}

async function loadState() {
  let server = null;
  try {
    const resp = await fetch('/api/state', { credentials: 'include' });
    if (resp.ok) server = (await resp.json()).state;
  } catch { /* offline: fall back to the cache */ }
  const cache = readCache();
  let chosen = server;
  // Changes saved locally but never uploaded win over an older server copy.
  if (cache && (!server || (cache.updatedAt || 0) > (server.updatedAt || 0))) chosen = cache;
  if (!chosen) chosen = migrateLegacyState();
  appState = { ...defaultState(), ...(chosen || {}) };
  if (!Array.isArray(appState.history)) appState.history = [];
  if (appState.plan && !appState.planId) appState.planId = 'p' + ((appState.plan.meta && appState.plan.meta.seed) || '0');
  if (chosen && chosen !== server) { writeCache(); persistState(); }
}

window.addEventListener('pagehide', () => { if (dirty) flushState(true); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && dirty) flushState(true); });

// ══════════════════════════════════════════════
// SAFETY NET — surface every error visibly, no silent failures.
// ══════════════════════════════════════════════
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
      await loadState();
      setLoggedIn();
      enterApp();
    }
  } catch {
    // If the check fails (e.g. offline), just show the logged-out state.
  }
  restoreFormDraft();
  const token = new URLSearchParams(window.location.search).get('reset');
  if (token && /^[a-f0-9]{64}$/.test(token)) openResetFromLink(token);
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
  const consent = document.getElementById('signup-consent').checked;
  const errorEl = document.getElementById('signup-error');
  errorEl.textContent = '';

  if (!name) { errorEl.textContent = 'Please enter your name.'; return; }
  if (!email || !email.includes('@')) { errorEl.textContent = 'Enter a valid email.'; return; }
  if (password.length < 8) { errorEl.textContent = 'Password must be at least 8 characters.'; return; }
  if (!consent) { errorEl.textContent = 'Please accept the Terms and Privacy Policy to continue.'; return; }

  try {
    const resp = await fetch('/api/auth/signup', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, consent: true }),
    });
    const data = await resp.json();
    if (!resp.ok) { errorEl.textContent = data.error || 'Something went wrong. Please try again.'; return; }

    currentUser = data;
    appState = defaultState();
    await loadState();
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
    await loadState();
    closeModal();
    setLoggedIn();
    enterApp();
  } catch {
    errorEl.textContent = 'Network error — please try again.';
  }
}

async function doLogout() {
  const synced = await flushState();
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  } catch {
    // Even if the network call fails, still clear the local UI state below.
  }
  // Remove the local copy once it is safely on the server (health data shouldn't linger on shared devices).
  if (synced && currentUser) localStorage.removeItem(cacheKey());
  showLoggedOutUI();
}

function showLoggedOutUI() {
  document.body.classList.remove('logged-in');
  if (window.HFInstall && HFInstall.refresh) HFInstall.refresh();
  currentUser = null;
  appState = defaultState();
  dirty = false;
  localStorage.removeItem('holyfitness_form_draft');
  ['nav-user-label', 'nav-logout', 'nav-dashboard-link', 'nav-account', 'nav-history', 'nav-training'].forEach(id => { document.getElementById(id).style.display = 'none'; });
  document.getElementById('nav-cta').style.display = 'block';
  document.getElementById('nav-cta').textContent = 'Sign In';
  showPage('page-home');
  resetPlan();
}

function setLoggedIn() {
  const first = currentUser.name.split(' ')[0];
  document.getElementById('nav-user-label').textContent = currentUser.name;
  document.getElementById('nav-user-label').style.display = 'inline';
  document.getElementById('nav-cta').style.display = 'none';
  document.getElementById('nav-logout').style.display = 'inline';
  document.getElementById('nav-dashboard-link').style.display = 'inline';
  document.getElementById('nav-account').style.display = 'inline';
  document.getElementById('nav-history').style.display = 'inline';
  document.getElementById('nav-training').style.display = 'inline';
  document.body.classList.add('logged-in');
  if (window.HFInstall && HFInstall.refresh) HFInstall.refresh();
  document.getElementById('dash-name').textContent = first;
}

function handleGetStarted() {
  if (currentUser) { enterApp(); }
  else { openModal(); }
}

function goHome() { showPage('page-home'); }

// enterApp() is the single entry point for "take me to where I belong":
// called after login/signup and automatically on page load if already
// logged in. If a plan already exists, land straight on the progress
// dashboard (day, what's next, logging status). Otherwise, land on the
// intake form to build a first plan.
function enterApp() {
  if (!currentUser) { openModal(); return; }
  window.scrollTo(0, 0);
  const saved = loadPlan();
  if (saved && saved.plan) {
    renderProgressPage(saved.plan, saved.goal);
    showPage('page-progress');
  } else {
    document.getElementById('dash-name').textContent = currentUser.name.split(' ')[0];
    showPage('page-dashboard');
    resetPlan();
  }
}

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  if (window.HFInstall && HFInstall.refresh) HFInstall.refresh();
  const tab = { 'page-progress': 'today', 'page-dashboard': 'today', 'page-training': 'training', 'page-history': 'history' }[id];
  document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
}

// ══════════════════════════════════════════════
// FORM DRAFT PERSISTENCE
// Saves every intake field as you type/select, so your details survive a
// failed generation, an accidental refresh, or coming back later — you
// never have to retype everything to try again.
// ══════════════════════════════════════════════
const DRAFT_KEY = 'holyfitness_form_draft';
const DRAFT_FIELD_IDS = [
  'f-age', 'f-height', 'f-weight', 'f-bf', 'f-freq', 'f-exp', 'f-sleep',
  'f-stress', 'f-goal', 'f-diet', 'f-allergies', 'f-cycle'
];

function saveFormDraft() {
  const draft = { gender: genderVal, fields: {} };
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
  } catch {
    // Corrupt draft — ignore and start fresh.
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

// ══════════════════════════════════════════════
// FORM TOGGLES
// ══════════════════════════════════════════════
function setGender(g) {
  genderVal = g;
  document.getElementById('btn-male').classList.toggle('active', g === 'male');
  document.getElementById('btn-female').classList.toggle('active', g === 'female');
  document.getElementById('cycle-section').style.display = g === 'female' ? 'block' : 'none';
  saveFormDraft();
}

// ══════════════════════════════════════════════
// PLAN TABS
// ══════════════════════════════════════════════
function switchPlanTab(tab) {
  document.querySelectorAll('.plan-tab').forEach((t, i) => {
    const tabs = ['overview','training','nutrition','sleep'];
    t.classList.toggle('active', tabs[i] === tab);
  });
  document.querySelectorAll('.plan-panel').forEach(p => p.classList.remove('active'));
  const panelMap = { overview: 'panel-overview', training: 'panel-training', nutrition: 'panel-nutrition', sleep: 'panel-sleep' };
  document.getElementById(panelMap[tab]).classList.add('active');
}

// ══════════════════════════════════════════════
// LOADING ANIMATION
// ══════════════════════════════════════════════
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
      // Loop: reset and cycle again so the UI keeps feeling alive on longer generations
      steps.forEach(id => document.getElementById(id).classList.remove('done'));
      i = 0;
    }
  }, 900);
}

// ══════════════════════════════════════════════
// GENERATE PLAN — calls our own backend, which screens the health answers and
// builds the plan with the built-in rule-based planner (no AI, no cost).
// ══════════════════════════════════════════════
// Health-check answers are sent with the request and used only to build the plan.
function collectHealth() {
  const g = id => !!(document.getElementById(id) && document.getElementById(id).checked);
  const h = {
    heart: g('h-heart'), chestPain: g('h-chest'), dizzy: g('h-dizzy'), diabetesMeds: g('h-diabetes'),
    kidney: g('h-kidney'), eatingDisorder: g('h-ed'), bloodPressure: g('h-bp'), joints: g('h-joints'), otherCondition: g('h-other'),
  };
  if (genderVal === 'female') {
    h.pregnant = g('h-pregnant');
    h.pcos = g('h-pcos');
    h.irregular = g('h-irregular');
    h.perimenopause = g('h-peri');
    h.symptoms = ['cramps', 'fatigue', 'bloating', 'mood', 'headaches'].filter(k => g('sym-' + k));
  }
  return h;
}

function showBlocked(data) {
  document.getElementById('loading-screen').classList.remove('show');
  document.getElementById('intake-card').style.display = 'none';
  const box = document.getElementById('blocked-message');
  box.innerHTML = String(data.message || '').split(/\n\n+/).map(p => `<p>${escapeAttr(p)}</p>`).join('');
  document.getElementById('blocked-card').style.display = 'block';
  document.getElementById('blocked-card').scrollIntoView({ behavior: 'smooth' });
}

function backToForm() {
  document.getElementById('blocked-card').style.display = 'none';
  document.getElementById('intake-card').style.display = 'block';
  document.getElementById('intake-card').scrollIntoView({ behavior: 'smooth' });
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
    health: collectHealth(),
  };

  // Show loading
  document.getElementById('intake-card').style.display = 'none';
  document.getElementById('blocked-card').style.display = 'none';
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

    // The health check found something a doctor needs to look at: no plan is made.
    if (data.blocked) { showBlocked(data); return; }

    const plan = data.plan;
    const goal = data.goal || profile.goal;

    // Save the plan to the account and start fresh progress/logs for this new week
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

// ══════════════════════════════════════════════
// RENDER PLAN
// ══════════════════════════════════════════════
function renderNotes(notes) {
  const el = document.getElementById('ov-notes');
  if (!notes || !notes.length) { el.innerHTML = ''; return; }
  el.innerHTML = '<div class="notes-title">Notes for you</div>' +
    notes.map(n => `<div class="note-card note-${n.level === 'caution' ? 'caution' : 'info'}">${escapeAttr(n.text)}</div>`).join('');
}

const MOON_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';

function setWelcomeBanner(show) {
  const h = document.querySelector('#page-dashboard .dashboard-hero');
  if (h) h.style.display = show ? '' : 'none';
}

function renderPlan(plan, goal) {
  setWelcomeBanner(false);
  const ov = plan.overview;
  const days = plan.days;

  // Header
  document.getElementById('ph-goal').textContent = goal;
  const meta = plan.meta || {};
  const weightText = meta.weightKg || document.getElementById('f-weight').value || '—';
  const freqText = meta.freq || document.getElementById('f-freq').value || '—';
  document.getElementById('ph-meta').textContent = `${currentUser.name} · ${weightText}kg · ${freqText} training days/wk`;

  // Overview cards
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
  renderNotes(plan.notes);

  // Training days
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
        <span class="exercise-name">${escapeAttr(e.name)} ${howToButton(e)}</span>
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

  // Nutrition days
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

  // Sleep panel
  const sp = plan.sleepProtocol;
  const sleepDayRows = days.map(d => `
    <div class="sleep-row">
      <span class="sleep-icon">${MOON_ICON}</span>
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
  setWelcomeBanner(true);
  document.getElementById('plan-output').classList.remove('show');
  document.getElementById('loading-screen').classList.remove('show');
  document.getElementById('blocked-card').style.display = 'none';
  document.getElementById('intake-card').style.display = 'block';
  document.getElementById('intake-card').scrollIntoView({ behavior: 'smooth' });
}

// ══════════════════════════════════════════════
// PLAN / PROGRESS / LOGS — held in appState, saved to the account by touch()
// ══════════════════════════════════════════════
// A new plan gets a new id, but the history of earlier plans is never touched.
function savePlan(plan, goal) { appState.plan = plan; appState.goal = goal; appState.planId = 'p' + Date.now().toString(36); touch(); }
function loadPlan() { return appState.plan ? { plan: appState.plan, goal: appState.goal } : null; }
function clearPlan() { appState.plan = null; appState.goal = null; touch(); }

function saveProgress(progress) { appState.progress = progress; touch(); }
function loadProgress() { return appState.progress || { currentDayIndex: 0 }; }
function clearProgress() { appState.progress = { currentDayIndex: 0 }; touch(); }

function saveLogs(logs) { appState.logs = logs; touch(); }
function loadLogs() { return appState.logs || {}; }
function clearLogs() { appState.logs = {}; touch(); }

function escapeAttr(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ══════════════════════════════════════════════
// PROGRESS DASHBOARD
// ══════════════════════════════════════════════
function renderProgressPage(plan, goal) {
  const progress = loadProgress();
  const logs = loadLogs();
  const idx = progress.currentDayIndex || 0;
  const totalDays = plan.days.length;

  document.getElementById('progress-name').textContent = currentUser.name.split(' ')[0];

  // Progress dots
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

// ══════════════════════════════════════════════
// HISTORY RECORDING + CELEBRATION
// Every logged day becomes a permanent, compact record. If all three targets were
// hit (workout, meals, sleep), the person gets a celebration, once per day.
// ══════════════════════════════════════════════
function recordDay(idx) {
  const saved = loadPlan();
  if (!saved || !window.HFProgress) return null;
  const day = saved.plan.days[idx];
  if (!day) return null;
  const prev = (appState.history || []).find(e => e.id === `${appState.planId}:${idx}`);
  const entry = HFProgress.makeEntry(appState.planId, idx, day, (appState.logs || {})[idx] || {}, HFProgress.localDate(), prev);
  appState.history = HFProgress.upsert(appState.history || [], entry);
  touch();
  return entry;
}

function afterLog(idx) {
  const entry = recordDay(idx);
  if (entry && entry.perfect && !entry.c) { entry.c = 1; touch(); showCelebration(entry); }
}

function advanceDay() {
  const saved = loadPlan();
  const progress = loadProgress();
  const idx = progress.currentDayIndex || 0;
  const entry = saved ? recordDay(idx) : null;
  progress.currentDayIndex = idx + 1;
  saveProgress(progress);
  if (saved) renderProgressPage(saved.plan, saved.goal);
  if (!entry) return;
  const lastDay = idx + 1 >= saved.plan.days.length;
  if (entry.perfect && !entry.c) { entry.c = 1; touch(); showCelebration(entry); }
  else if (lastDay) {
    const n = (appState.history || []).filter(e => e.planId === appState.planId && e.perfect).length;
    showToast(`Week complete: ${n} of ${saved.plan.days.length} days hit every target.`);
  } else if (!entry.perfect) showToast(`Day saved: ${entry.hits} of 3 targets hit. Tomorrow is a fresh start.`);
}

let toastTimer = null;
function showToast(msg) {
  // (also reachable as window.showToast for install.js)
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 4800);
}
window.showToast = showToast;

let confettiRaf = null;
function launchConfetti() {
  const c = document.getElementById('confetti-canvas');
  if (!c || !c.getContext) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;   // respect "reduce motion"
  let ctx = null;
  try { ctx = c.getContext('2d'); } catch { ctx = null; }
  if (!ctx) return;
  c.width = window.innerWidth; c.height = window.innerHeight;
  const colors = ['#E10000', '#D6BA82', '#FFFFFF', '#FF2B1F', '#F6EFDD'];
  const bits = Array.from({ length: 170 }, () => ({
    x: Math.random() * c.width, y: -20 - Math.random() * c.height * 0.3, w: 6 + Math.random() * 7, h: 10 + Math.random() * 10,
    vx: -1.8 + Math.random() * 3.6, vy: 3.2 + Math.random() * 4.6, rot: Math.random() * 6.28, vr: -0.2 + Math.random() * 0.4,
    col: colors[Math.floor(Math.random() * colors.length)],
  }));
  let frame = 0;
  const total = 240;
  if (window.cancelAnimationFrame) cancelAnimationFrame(confettiRaf);
  (function tick() {
    ctx.clearRect(0, 0, c.width, c.height);
    bits.forEach(b => {
      b.x += b.vx; b.y += b.vy; b.vy += 0.035; b.rot += b.vr;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot);
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, frame - total * 0.6) / (total * 0.4));
      ctx.fillStyle = b.col; ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); ctx.restore();
    });
    if (++frame < total && window.requestAnimationFrame) confettiRaf = requestAnimationFrame(tick); else ctx.clearRect(0, 0, c.width, c.height);
  })();
}

function showCelebration(entry) {
  if (!window.HFProgress) return;
  const saved = loadPlan();
  const c = HFProgress.celebrationFor(entry, appState.history, HFProgress.localDate(), saved ? saved.plan.days.length : 0);
  document.getElementById('celebrate-kicker').textContent = c.kicker;
  document.getElementById('celebrate-title').innerHTML = c.title;          // fixed text from our own code, never user input
  document.getElementById('celebrate-msg').textContent = c.line;
  const chip = t => `<span class="celebrate-chip">${escapeAttr(t)}</span>`;
  document.getElementById('celebrate-chips').innerHTML =
    chip(entry.w[1] ? `Workout ${entry.w[0]}/${entry.w[1]}` : 'Rest day') + chip(`Meals ${entry.m[0]}/${entry.m[1]}`) + chip(`Sleep ${entry.s[0]}h`);
  const bits = [];
  if (c.streak > 1) bits.push(`${c.streak} perfect days in a row`);
  if (c.planDays) bits.push(`${c.planPerfect} of ${c.planDays} perfect days this plan`);
  document.getElementById('celebrate-streak').textContent = bits.join(' · ');
  document.getElementById('celebrate-modal').classList.add('open');
  const btn = document.getElementById('celebrate-close');
  if (btn) btn.focus();
  launchConfetti();
}

function closeCelebration() {
  document.getElementById('celebrate-modal').classList.remove('open');
  if (window.cancelAnimationFrame) cancelAnimationFrame(confettiRaf);
  const c = document.getElementById('confetti-canvas');
  try { const ctx = c && c.getContext && c.getContext('2d'); if (ctx) ctx.clearRect(0, 0, c.width, c.height); } catch { /* ignore */ }
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCelebration(); });

function viewFullPlan() {
  const saved = loadPlan();
  if (!saved || !saved.plan) { alert('No plan found yet — generate one first.'); return; }
  document.getElementById('dash-name').textContent = currentUser.name.split(' ')[0];
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
  document.getElementById('dash-name').textContent = currentUser.name.split(' ')[0];
  showPage('page-dashboard');
  resetPlan();
}

// ══════════════════════════════════════════════
// LOGGERS — Workout / Meals / Sleep
// ══════════════════════════════════════════════
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

// -- Workout --
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
      return `<div class="logger-ex"><label class="logger-check-row"><input type="checkbox" id="wex-${i}" ${checked}/><span><strong>${escapeAttr(ex.name)}</strong><span class="logger-check-detail">${ex.sets} × ${ex.reps}${ex.rest ? ' · ' + ex.rest : ''}</span></span></label>${howToButton(ex)}</div>`;
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
  afterLog(idx);
}

// -- Meals --
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
    `<span class="custom-meal-chip">${escapeAttr(m.name)}${m.calories ? ' · ' + m.calories + 'kcal' : ''} <button type="button" onclick="removeCustomMeal(${i})">✕</button></span>`
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
  afterLog(idx);
}

// -- Sleep --
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
  afterLog(idx);
}

// Close logger modals on overlay click (same pattern as the auth modal)
['workout-modal', 'meal-modal', 'sleep-modal'].forEach(id => {
  document.getElementById(id).addEventListener('click', function (e) {
    if (e.target === this) closeLoggerModal(id);
  });
});

// Close modal on overlay click
document.getElementById('auth-modal').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});


// ══════════════════════════════════════════════
// HISTORY PAGE — past days, weeks and months
// ══════════════════════════════════════════════
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
let histTab = 'days';
let histShown = 30;
let histMonth = null;      // { y, m }
let histPicked = null;     // date picked on the calendar

const longDate = ds => { const d = HFProgress.parseDate(ds); return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`; };
const rangeLabel = (a, b) => { const x = HFProgress.parseDate(a), y = HFProgress.parseDate(b); return x.getUTCMonth() === y.getUTCMonth() ? `${x.getUTCDate()}–${y.getUTCDate()} ${MONTHS[y.getUTCMonth()].slice(0, 3)} ${y.getUTCFullYear()}` : `${x.getUTCDate()} ${MONTHS[x.getUTCMonth()].slice(0, 3)} – ${y.getUTCDate()} ${MONTHS[y.getUTCMonth()].slice(0, 3)} ${y.getUTCFullYear()}`; };
const statusOf = e => !e ? 'none' : e.perfect ? 'perfect' : e.hits > 0 ? 'part' : 'miss';
const HALO_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><ellipse cx="12" cy="8" rx="8" ry="3.2"/><path d="M12 11v10M8 15h8" stroke-linecap="round"/></svg>';

function showTraining() {
  closeCelebration();
  showPage('page-training');
  if (window.HFTraining) HFTraining.init();
  window.scrollTo(0, 0);
}

// "How to" button for an exercise: needs a library id (new plans carry one; older plans are linked by their old name).
function exerciseLibId(ex) { return ex.libId || (window.HF_LEGACY_EXERCISES || {})[ex.name] || null; }
function howToButton(ex) {
  const id = exerciseLibId(ex);
  return id ? `<button type="button" class="howto-btn" onclick="HFTraining.open('${escapeAttr(id)}')" aria-label="How to do ${escapeAttr(ex.name)}">How to</button>` : '';
}

function showHistory() {
  closeCelebration();
  if (!histMonth) { const t = HFProgress.localDate().split('-').map(Number); histMonth = { y: t[0], m: t[1] }; }
  showPage('page-history');
  renderHistory();
  window.scrollTo(0, 0);
}

function setHistoryTab(tab) { histTab = tab; renderHistory(); }

function renderHistory() {
  const hist = appState.history || [];
  const today = HFProgress.localDate();
  const st = HFProgress.streaks(hist, today), sm = HFProgress.summary(hist);
  const card = (label, val, unit) => `<div class="hist-stat"><div class="hist-stat-label">${label}</div><div class="hist-stat-val">${val}</div><div class="hist-stat-unit">${unit || '&nbsp;'}</div></div>`;
  document.getElementById('hist-stats').innerHTML =
    card('Current streak', st.current, st.current === 1 ? 'perfect day' : 'perfect days') + card('Longest streak', st.longest, st.longest === 1 ? 'day' : 'days') +
    card('Perfect days', sm.perfectDays, 'every target hit') + card('Days logged', sm.daysLogged, 'in total') +
    card('Workouts done', sm.workouts, 'completed') + card('Average sleep', sm.avgSleep == null ? '—' : sm.avgSleep, sm.avgSleep == null ? '' : 'hours');
  ['days', 'weeks', 'months'].forEach(t => {
    document.getElementById('htab-' + t).classList.toggle('active', t === histTab);
    document.getElementById('hist-' + t).style.display = t === histTab ? 'block' : 'none';
  });
  document.getElementById('hist-legend').style.display = hist.length ? 'flex' : 'none';
  if (!hist.length) {
    document.getElementById('hist-' + histTab).innerHTML = '<div class="hist-empty"><div class="hist-empty-title">Nothing logged yet</div><p>Log a workout, your meals or your sleep and each day will appear here. Hit all three targets and you will get a little celebration.</p></div>';
    return;
  }
  if (histTab === 'days') renderHistoryDays();
  else if (histTab === 'weeks') renderHistoryWeeks();
  else renderHistoryMonth();
}

function pillHtml(label, state) { return `<span class="hist-pill ${state}">${label}</span>`; }

function dayCardHtml(e, open) {
  const d = HFProgress.parseDate(e.date);
  const wPill = e.w[1] === 0 ? pillHtml('Rest day', 'hit') : pillHtml('Workout', e.w[2] ? 'hit' : e.w[0] > 0 ? 'part' : 'miss');
  const mPill = pillHtml('Meals', e.m[4] ? 'hit' : e.m[0] > 0 ? 'part' : 'miss');
  const sPill = pillHtml('Sleep', e.s[2] ? 'hit' : e.s[0] != null ? 'part' : 'miss');
  const extras = (e.x || []).length ? `<div class="hist-line"><b>Extras:</b> ${e.x.map(x => escapeAttr(x[0]) + (x[1] ? ` (${x[1]} kcal)` : '')).join(', ')}</div>` : '';
  const kcal = e.m[3] ? ` · ${e.m[2]} of ${e.m[3]} kcal` : '';
  return `<details class="hist-day ${statusOf(e)}"${open ? ' open' : ''}>
    <summary>
      <div class="hist-date"><span>${d.getUTCDate()}</span><small>${MONTHS[d.getUTCMonth()].slice(0, 3)}</small></div>
      <div class="hist-main"><div class="hist-title">${escapeAttr(longDate(e.date))} · ${escapeAttr(e.type)}</div><div class="hist-pills">${wPill}${mPill}${sPill}</div></div>
      ${e.perfect ? `<span class="hist-badge" title="Every target hit">${HALO_ICON}</span>` : ''}
    </summary>
    <div class="hist-detail">
      <div class="hist-line"><b>Workout:</b> ${e.w[1] === 0 ? 'Rest day' : `${e.w[0]} of ${e.w[1]} exercises`}</div>
      <div class="hist-line"><b>Meals:</b> ${e.m[0]} of ${e.m[1]} planned meals${kcal}</div>
      ${extras}
      <div class="hist-line"><b>Sleep:</b> ${e.s[0] == null ? 'not logged' : `${e.s[0]}h of ${e.s[1]}h target${e.s[3] ? ' · ' + escapeAttr(e.s[3]) : ''}`}</div>
      ${e.n ? `<div class="hist-line"><b>Notes:</b> ${escapeAttr(e.n)}</div>` : ''}
      <div class="hist-line hist-muted">${e.hits} of 3 targets hit</div>
    </div></details>`;
}

function renderHistoryDays() {
  const list = [...(appState.history || [])].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.dayIndex - a.dayIndex));
  const shown = list.slice(0, histShown);
  document.getElementById('hist-days').innerHTML = shown.map(e => dayCardHtml(e, false)).join('') +
    (list.length > shown.length ? '<button class="btn-outline hist-more" onclick="histMore()">Show earlier days</button>' : '');
}
function histMore() { histShown += 30; renderHistoryDays(); }

function renderHistoryWeeks() {
  const letters = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const ws = HFProgress.weeks(appState.history || []);
  document.getElementById('hist-weeks').innerHTML = ws.map(w => `
    <div class="hist-week">
      <div class="hist-week-head"><b>${rangeLabel(w.start, w.end)}</b><span>${w.perfect} of 7 perfect · ${w.logged} logged</span></div>
      <div class="hist-week-days">${w.days.map((d, i) => `<span class="wd ${statusOf(d.entry)}" title="${escapeAttr(longDate(d.date))}${d.entry ? ': ' + d.entry.hits + ' of 3 targets' : ': nothing logged'}">${letters[i]}</span>`).join('')}</div>
      <div class="hist-bar" aria-hidden="true"><i style="width:${w.adherence}%"></i></div>
      <div class="hist-week-stats">
        <span><b>${w.adherence}%</b> of targets hit on logged days</span>
        <span>Workouts <b>${w.workoutsDone}/${w.workoutsPlanned}</b></span>
        <span>Avg sleep <b>${w.avgSleep == null ? '—' : w.avgSleep + 'h'}</b></span>
        <span>Calories <b>${w.calorieRatio == null ? '—' : w.calorieRatio + '%'}</b> of plan</span>
      </div>
    </div>`).join('');
}

function renderHistoryMonth() {
  const m = HFProgress.month(appState.history || [], histMonth.y, histMonth.m);
  const today = HFProgress.localDate();
  const head = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<div class="cal-h">${d}</div>`).join('');
  const cells = m.cells.map(c => c
    ? `<button class="cal-cell ${statusOf(c.entry)}${c.date === today ? ' today' : ''}${c.date === histPicked ? ' picked' : ''}" onclick="histPick('${c.date}')" aria-label="${escapeAttr(longDate(c.date))}">${c.day}</button>`
    : '<span class="cal-cell blank"></span>').join('');
  const picked = histPicked && (appState.history || []).filter(e => e.date === histPicked).sort((a, b) => b.hits - a.hits)[0];
  document.getElementById('hist-months').innerHTML = `
    <div class="cal-nav"><button class="btn-nav-ghost" onclick="histMonthNav(-1)" aria-label="Previous month">‹</button><div class="cal-title">${MONTHS[m.month - 1]} ${m.year}</div><button class="btn-nav-ghost" onclick="histMonthNav(1)" aria-label="Next month">›</button></div>
    <div class="cal-grid">${head}${cells}</div>
    <div class="cal-summary"><span><b>${m.perfect}</b> perfect days</span><span><b>${m.logged}</b> days logged</span><span><b>${m.workouts}</b> workouts</span><span>Best streak <b>${m.longestStreak}</b></span></div>
    <div id="hist-month-detail">${picked ? dayCardHtml(picked, true) : '<p class="hist-muted" style="text-align:center;margin-top:14px;">Tap a day to see what you logged.</p>'}</div>`;
}
function histMonthNav(d) { let y = histMonth.y, mo = histMonth.m + d; if (mo < 1) { mo = 12; y--; } if (mo > 12) { mo = 1; y++; } histMonth = { y, m: mo }; histPicked = null; renderHistoryMonth(); }
function histPick(date) { histPicked = date; renderHistoryMonth(); }

// ══════════════════════════════════════════════
// FORGOT / RESET PASSWORD
// ══════════════════════════════════════════════
function closeSimpleModal(id) { document.getElementById(id).classList.remove('open'); }

function openForgot() {
  closeModal();
  document.getElementById('forgot-email').value = document.getElementById('signin-email').value || '';
  document.getElementById('forgot-error').textContent = '';
  document.getElementById('forgot-ok').textContent = '';
  document.getElementById('forgot-modal').classList.add('open');
}

async function doForgot() {
  const email = document.getElementById('forgot-email').value.trim();
  const errorEl = document.getElementById('forgot-error');
  const okEl = document.getElementById('forgot-ok');
  errorEl.textContent = '';
  okEl.textContent = '';
  if (!email || !email.includes('@')) { errorEl.textContent = 'Enter a valid email.'; return; }
  try {
    const resp = await fetch('/api/auth/forgot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await resp.json();
    if (!resp.ok) { errorEl.textContent = data.error || 'Something went wrong. Please try again.'; return; }
    okEl.textContent = data.message || 'If an account exists for that email, a reset link is on its way.';
  } catch {
    errorEl.textContent = 'Network error — please try again.';
  }
}

function openResetFromLink(token) {
  resetToken = token;
  document.getElementById('reset-error').textContent = '';
  document.getElementById('reset-ok').textContent = '';
  document.getElementById('reset-password').value = '';
  document.getElementById('reset-modal').classList.add('open');
}

async function doReset() {
  const password = document.getElementById('reset-password').value;
  const errorEl = document.getElementById('reset-error');
  const okEl = document.getElementById('reset-ok');
  errorEl.textContent = '';
  okEl.textContent = '';
  if (password.length < 8) { errorEl.textContent = 'Password must be at least 8 characters.'; return; }
  try {
    const resp = await fetch('/api/auth/reset', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: resetToken, password }),
    });
    const data = await resp.json();
    if (!resp.ok) { errorEl.textContent = data.error || 'Something went wrong. Please try again.'; return; }
    okEl.textContent = 'Password updated. You can sign in with it now.';
    try { window.history.replaceState({}, '', window.location.pathname); } catch { /* ignore */ }
    resetToken = null;
    setTimeout(() => { closeSimpleModal('reset-modal'); openModal(); switchTab('signin'); }, 1500);
  } catch {
    errorEl.textContent = 'Network error — please try again.';
  }
}

// ══════════════════════════════════════════════
// ACCOUNT — download my data / delete my account
// ══════════════════════════════════════════════
function openAccount() {
  if (!currentUser) return;
  document.getElementById('account-sub').textContent = `Signed in as ${currentUser.email}`;
  document.getElementById('delete-password').value = '';
  document.getElementById('delete-error').textContent = '';
  if (window.HFInstall && HFInstall.refresh) HFInstall.refresh();
  document.getElementById('account-modal').classList.add('open');
}

function downloadMyData() {
  const data = {
    exportedAt: new Date().toISOString(),
    account: { name: currentUser.name, email: currentUser.email },
    plan: appState.plan,
    goal: appState.goal,
    progress: appState.progress,
    logs: appState.logs,
    history: appState.history,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'holy-fitness-my-data.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function deleteMyAccount() {
  const password = document.getElementById('delete-password').value;
  const errorEl = document.getElementById('delete-error');
  errorEl.textContent = '';
  if (!password) { errorEl.textContent = 'Enter your password to confirm.'; return; }
  try {
    const resp = await fetch('/api/account/delete', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await resp.json();
    if (!resp.ok) { errorEl.textContent = data.error || 'Something went wrong. Please try again.'; return; }
    if (currentUser) localStorage.removeItem(cacheKey());
    closeSimpleModal('account-modal');
    showLoggedOutUI();
    alert('Your account and all your data have been deleted.');
  } catch {
    errorEl.textContent = 'Network error — please try again.';
  }
}

['forgot-modal', 'reset-modal', 'account-modal'].forEach(id => {
  document.getElementById(id).addEventListener('click', function (e) {
    if (e.target === this) closeSimpleModal(id);
  });
});

{ const y = document.getElementById('footer-year'); if (y) y.textContent = new Date().getFullYear(); }

init();
wireFormAutoSave();
