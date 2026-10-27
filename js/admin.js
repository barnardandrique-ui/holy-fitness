// js/admin.js - the admin panel. Completely separate from the client app: it only talks to /api/admin and shares no code or session with it.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const state = { tab: 'accounts', q: '', filter: '', sort: '', page: 1, me: null, sub: 'overview' };
  let searchTimer = null, idleTimer = null;

  async function api(a, params = {}, init = {}) {
    const qs = new URLSearchParams({ a, ...params }).toString();
    const r = await fetch('/api/admin?' + qs, { credentials: 'same-origin', cache: 'no-store', ...init });
    if (r.status === 404 || r.status === 401 && a !== 'login') { try { await r.arrayBuffer(); } catch (x) { /* read it so the request finishes */ } const e = new Error('signed-out'); e.signedOut = true; throw e; }
    const ct = r.headers.get('content-type') || '';
    const data = ct.includes('json') ? await r.json() : await r.text();
    if (!r.ok) { const e = new Error((data && data.error) || 'Something went wrong.'); e.status = r.status; throw e; }
    return data;
  }
  const toast = m => { const t = $('toast'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3200); };
  const ago = iso => { if (!iso) return 'never'; const d = (Date.now() - Date.parse(iso)) / 86400000; return d < 1 ? (d * 24 < 1 ? 'just now' : Math.floor(d * 24) + 'h ago') : d < 30 ? Math.floor(d) + 'd ago' : iso.slice(0, 10); };
  const day = iso => (iso ? iso.slice(0, 10) : '—');
  const num = n => (n == null ? '—' : n);

  function showLogin(msg) { $('app-view').hidden = true; $('login-view').hidden = false; clearTimeout(idleTimer); const m = $('login-msg'); m.textContent = msg || ''; m.hidden = !msg; setTimeout(() => $('lg-email').focus(), 50); }
  function showApp() { $('login-view').hidden = true; $('app-view').hidden = false; $('who').textContent = state.me.name; setActiveTab(); route(); }
  function kickOut() { state.me = null; showLogin('Your session ended. Please sign in again.'); }
  async function guard(fn) { try { return await fn(); } catch (e) { if (e.signedOut) { kickOut(); return null; } toast(e.message); return null; } }

  async function init() {
    const link = document.querySelector('a#to-client'); if (link) link.href = '/';
    try { state.me = await api('me'); showApp(); } catch (e) { showLogin(); }
  }

  $('login-form').addEventListener('submit', async ev => {
    ev.preventDefault(); const btn = $('lg-btn'); btn.disabled = true; $('login-msg').hidden = true;
    try {
      const r = await fetch('/api/admin?a=login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: $('lg-email').value, password: $('lg-pass').value, code: $('lg-code').value }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { $('login-msg').textContent = r.status === 404 ? 'The admin area is not available.' : data.error || 'Incorrect details.'; $('login-msg').hidden = false; return; }
      $('lg-pass').value = ''; $('lg-code').value = ''; state.me = await api('me'); showApp();
    } catch { $('login-msg').textContent = 'Could not reach the server. Check your connection.'; $('login-msg').hidden = false; } finally { btn.disabled = false; }
  });
  $('signout').addEventListener('click', async () => { try { await fetch('/api/admin?a=logout', { method: 'POST', credentials: 'same-origin' }); } catch (e) { /* ignore */ } state.me = null; showLogin('You have signed out.'); });
  $('tabs').addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (!b) return; state.tab = b.dataset.tab; if (location.hash) history.replaceState(null, '', location.pathname); setActiveTab(); route(); });
  window.addEventListener('hashchange', () => { if (state.me) route(); });
  const setActiveTab = () => document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));

  function route() {
    clearTimeout(idleTimer); idleTimer = setTimeout(() => { if (state.me) kickOut(); }, 31 * 60 * 1000);   // matches the server's 30-minute idle limit
    const m = /^#client=([0-9a-fA-F-]{36})$/.exec(location.hash);
    if (m) return viewClient(m[1]);
    ({ accounts: viewAccounts, leads: viewLeads, insights: viewInsights, audit: viewAudit, settings: viewSettings }[state.tab] || viewAccounts)();
  }

  // ── accounts ──
  async function viewAccounts() {
    const main = $('main'); main.innerHTML = '<h2>Accounts</h2><p class="sub">Everyone registered. Open a client to see more (full details only if they have chosen to share their progress with their coach).</p><p class="sub">Loading…</p>';
    const d = await guard(() => api('accounts', { q: state.q, filter: state.filter, sort: state.sort, page: state.page })); if (!d) return;
    const rows = d.rows.map(r => `<div class="row" data-id="${esc(r.id)}" tabindex="0" role="button" aria-label="Open ${esc(r.name)}">
      <div><div class="nm">${esc(r.name)}</div><div class="em">${esc(r.email)}</div></div>
      <div data-l="Joined">${day(r.createdAt)}</div><div data-l="Last active">${ago(r.lastActiveAt)}</div><div data-l="Plans">${r.plansGenerated}</div>
      <div data-l="Program">${r.program ? esc(r.program) : '<span class="muted">no plan yet</span>'}${r.daysPerWeek != null ? ` <small>· ${r.daysPerWeek}x/wk</small>` : ''}</div>
      <div data-l="Coaching">${r.coachShare ? '<span class="pill gold">Shares</span>' : ''}${r.interest ? '<span class="pill star">Interested</span>' : ''}${!r.coachShare && !r.interest ? '<small>—</small>' : ''}</div></div>`).join('');
    main.innerHTML = `<h2>Accounts <small>${d.all} registered</small></h2><p class="sub">Open a client to see more. Full details appear only for clients who have chosen to share their progress with their coach.</p>
      <div class="tools"><input type="search" id="q" placeholder="Search name or email" value="${esc(state.q)}" aria-label="Search" />
        <select id="flt" aria-label="Filter"><option value="">All accounts</option><option value="shared">Sharing progress</option><option value="interest">Interested in training</option><option value="noplan">No plan yet</option><option value="inactive30">Inactive 30+ days</option></select>
        <select id="srt" aria-label="Sort"><option value="">Last active</option><option value="joined">Newest</option><option value="plans">Most plans</option></select>
        <button class="btn outline small" id="refresh">Refresh</button><a class="btn dark small" href="/api/admin?a=export&what=accounts" download>Export CSV</a></div>
      <div class="grid"><div class="row head"><div>Client</div><div>Joined</div><div>Last active</div><div>Plans</div><div>Program</div><div>Coaching</div></div>${rows || '<div style="padding:24px;text-align:center" class="muted">No accounts match.</div>'}</div>
      <div class="pager"><button class="btn outline small" id="prev" ${d.page <= 1 ? 'disabled' : ''}>Previous</button><span>Page ${d.page} of ${d.pages} · ${d.total} shown${d.cached ? ' · cached' : ''}</span><button class="btn outline small" id="next" ${d.page >= d.pages ? 'disabled' : ''}>Next</button></div>`;
    $('flt').value = state.filter; $('srt').value = state.sort;
    $('q').addEventListener('input', e => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.q = e.target.value; state.page = 1; viewAccounts(); }, 350); });
    $('flt').addEventListener('change', e => { state.filter = e.target.value; state.page = 1; viewAccounts(); }); $('srt').addEventListener('change', e => { state.sort = e.target.value; state.page = 1; viewAccounts(); });
    $('refresh').addEventListener('click', async () => { await guard(() => api('accounts', { refresh: '1' })); viewAccounts(); toast('Refreshed.'); });
    $('prev').addEventListener('click', () => { state.page--; viewAccounts(); }); $('next').addEventListener('click', () => { state.page++; viewAccounts(); });
    main.querySelectorAll('.row[data-id]').forEach(el => { const open = () => { location.hash = 'client=' + el.dataset.id; }; el.addEventListener('click', open); el.addEventListener('keydown', e => { if (e.key === 'Enter') open(); }); });
  }

  // ── one client ──
  async function viewClient(id) {
    const main = $('main'); main.innerHTML = '<p class="sub">Loading…</p>';
    const d = await guard(() => api('account', { id })); if (!d) return;
    const r = d.row, head = `<button class="back" id="back">← All accounts</button>
      <div class="detail-head"><div><h2>${esc(r.name)}</h2><div class="sub">${esc(r.email)}</div></div><div>${r.coachShare ? '<span class="pill gold">Shares progress</span>' : '<span class="pill">Not sharing</span>'}${r.interest ? '<span class="pill star">Interested in training</span>' : ''}</div></div>
      <div class="card"><div class="kv"><div><b>Joined</b>${day(r.createdAt)}</div><div><b>Last login</b>${ago(r.lastLoginAt)}</div><div><b>Last active</b>${ago(r.lastActiveAt)}</div><div><b>Plans generated</b>${r.plansGenerated}</div><div><b>Current program</b>${r.program ? esc(r.program) : 'none yet'}</div><div><b>Training days a week</b>${num(r.daysPerWeek)}</div></div></div>`;
    $('main').innerHTML = head;
    $('back').addEventListener('click', () => { history.replaceState(null, '', location.pathname); route(); });
    if (!d.consent) { main.insertAdjacentHTML('beforeend', '<div class="notice"><b>This client has not shared their progress with their coach.</b><br>You can see their basic account information only. They can switch sharing on in the app under <i>Account → Personal training</i>, and off again at any time.</div>'); return; }
    const tabs = [['overview', 'Overview'], ['training', 'Training'], ['nutrition', 'Nutrition'], ['sleep', 'Sleep & activity'], ['body', 'Body']];
    main.insertAdjacentHTML('beforeend', `<div class="subtabs" id="subtabs">${tabs.map(([k, l]) => `<button data-s="${k}" class="${state.sub === k ? 'active' : ''}">${l}</button>`).join('')}</div><div id="sub"></div>`);
    const paint = () => { $('sub').innerHTML = ({ overview: overviewHtml, training: trainingHtml, nutrition: nutritionHtml, sleep: sleepHtml, body: bodyHtml }[state.sub] || overviewHtml)(d); main.querySelectorAll('#subtabs button').forEach(b => b.classList.toggle('active', b.dataset.s === state.sub)); };
    $('subtabs').addEventListener('click', e => { const b = e.target.closest('button[data-s]'); if (b) { state.sub = b.dataset.s; paint(); } });
    paint();
  }
  const stat = (l, v, u) => `<div class="stat"><div class="l">${l}</div><div class="v">${v}</div><div class="u">${u || '&nbsp;'}</div></div>`;
  function overviewHtml(d) {
    if (!d.plan) return '<div class="notice">This client has not generated a plan yet.</div>';
    const o = d.plan.overview || {}, p = d.plan.profile || {}, s = d.stats;
    return `<div class="stats">${stat('Days logged', s.daysLogged, 'last 90 days')}${stat('Perfect days', s.perfectDays, 'every target hit')}${stat('Workouts done', s.workoutsDone + ' / ' + s.workoutsPlanned, 'logged sessions')}${stat('Average sleep', s.avgSleep == null ? '—' : s.avgSleep + ' h', 'logged nights')}${stat('Current streak', s.streak, 'perfect days')}</div>
      <div class="card"><h3 style="margin-top:0">Program</h3><div class="kv"><div><b>Program</b>${esc(o.programName || '—')}</div><div><b>Goal</b>${esc(d.plan.goal || '—')}</div><div><b>Diet style</b>${esc(d.plan.diet || '—')}</div><div><b>Daily calories</b>${num(o.dailyCalories)}</div><div><b>Protein / carbs / fats</b>${num(o.dailyProtein)}g / ${num(o.dailyCarbs)}g / ${num(o.dailyFats)}g</div><div><b>Avoids</b>${d.plan.avoid.length ? esc(d.plan.avoid.join(', ').replace(/_/g, ' ')) : 'nothing listed'}</div></div>${o.summary ? `<p class="sub" style="margin-top:12px">${esc(o.summary)}</p>` : ''}</div>
      <div class="card"><h3 style="margin-top:0">Profile when the plan was built</h3><div class="kv"><div><b>Age</b>${num(p.age)}</div><div><b>Height</b>${num(p.height)} cm</div><div><b>Weight</b>${num(p.weight)} kg</div><div><b>Body fat</b>${num(p.bf)}%</div><div><b>Experience</b>${esc(p.exp || '—')}</div><div><b>Allergies / dislikes</b>${esc(p.allerg && p.allerg !== 'none' ? p.allerg : 'none')}</div></div></div>`;
  }
  const trainingHtml = d => !d.plan ? '<div class="notice">No plan yet.</div>' : d.plan.days.map(x => `<div class="day"><h4>${esc(x.day)} <span>${esc(x.type || '')}</span></h4>${x.exercises.length ? x.exercises.map(e => `<div class="li"><span>${esc(e.name)}</span><span class="r">${esc(e.sets)} × ${esc(e.reps)}${e.rest ? ' · ' + esc(e.rest) : ''}</span></div>`).join('') : '<div class="li"><span class="muted">Rest day</span></div>'}</div>`).join('');
  const nutritionHtml = d => !d.plan ? '<div class="notice">No plan yet.</div>' : d.plan.days.map(x => `<div class="day"><h4>${esc(x.day)} <span>${num(x.totalCalories)} kcal</span></h4>${x.meals.map(m => `<div class="li"><span>${esc(m.time)}, ${esc(m.name)}${m.swapped ? ' <span class="pill">swapped</span>' : ''}<span class="sm">${esc(m.foods)}</span></span><span class="r">${m.calories} kcal<span class="sm">${m.protein}P · ${m.carbs}C · ${m.fats}F</span></span></div>`).join('')}</div>`).join('');
  function sleepHtml(d) {
    const a = d.activity.slice(-30); if (!a.length) return '<div class="notice">Nothing logged yet.</div>';
    const W = 640, H = 150, bw = W / 30, max = 10;
    const bars = a.map((e, i) => { const h = e.sleep[0] == null ? 0 : (e.sleep[0] / max) * (H - 24); return `<rect x="${i * bw + 2}" y="${H - 18 - h}" width="${bw - 4}" height="${h}" rx="2" class="${e.sleep[2] ? 'bar-ok' : 'bar-low'}"><title>${esc(e.date)}: ${e.sleep[0] == null ? 'not logged' : e.sleep[0] + ' h'}</title></rect>`; }).join('');
    const rows = [...d.activity].reverse().slice(0, 45).map(e => `<tr><td>${esc(e.date)}</td><td>${esc(e.type)}</td><td>${e.workout[1] ? e.workout[0] + '/' + e.workout[1] : 'rest'}</td><td>${e.meals[0]}/${e.meals[1]} · ${e.meals[2]} kcal</td><td>${e.sleep[0] == null ? '—' : e.sleep[0] + ' h'} <small>/ ${e.sleep[1]}</small></td><td>${e.perfect ? '<span class="pill gold">Perfect</span>' : e.hits + '/3'}</td><td>${esc(e.note)}</td></tr>`).join('');
    return `<div class="card"><h3 style="margin-top:0">Sleep, last ${a.length} logged days <small>(gold = on target)</small></h3><svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Sleep hours per day"><line x1="0" x2="${W}" y1="${H - 18}" y2="${H - 18}" class="ch-g"/>${bars}</svg></div>
      <h3>Daily activity</h3><div class="scroll"><table class="tbl"><tr><th>Date</th><th>Session</th><th>Workout</th><th>Meals</th><th>Sleep</th><th>Targets</th><th>Note</th></tr>${rows}</table></div>`;
  }
  function bodyHtml(d) {
    const m = d.body.measurements; if (!m.length) return '<div class="notice">No body measurements logged.</div>';
    const t = d.body.targets, pts = m.filter(x => x.w != null); let chart = '';
    if (pts.length >= 2) {
      const W = 640, H = 220, L = 44, R = 14, T = 14, B = 26, vals = pts.map(x => x.w).concat(t && t.weight != null ? [t.weight] : []); let lo = Math.min(...vals), hi = Math.max(...vals); if (hi - lo < 1) { lo -= 0.5; hi += 0.5; } const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
      const t0 = Date.parse(pts[0].d), span = Math.max(Date.parse(pts[pts.length - 1].d) - t0, 7 * 86400000), X = dd => L + ((Date.parse(dd) - t0) / span) * (W - L - R), Y = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
      const path = pts.map((p, i) => (i ? 'L' : 'M') + X(p.d).toFixed(1) + ' ' + Y(p.w).toFixed(1)).join(' ');
      chart = `<div class="card"><h3 style="margin-top:0">Weight (kg)</h3><svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Weight over time">${[0, 1, 2, 3].map(i => { const v = lo + ((hi - lo) * i) / 3, y = Y(v); return `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" class="ch-g"/><text x="${L - 6}" y="${y + 4}" text-anchor="end" class="ch-t">${v.toFixed(1)}</text>`; }).join('')}${t && t.weight != null ? `<line x1="${L}" x2="${W - R}" y1="${Y(t.weight)}" y2="${Y(t.weight)}" class="ch-goal"/><text x="${W - R}" y="${Y(t.weight) - 5}" text-anchor="end" class="ch-t" style="fill:#E10000;font-weight:700">Goal ${t.weight}</text>` : ''}<path d="${path}" class="ch-l"/>${pts.map(p => `<circle cx="${X(p.d).toFixed(1)}" cy="${Y(p.w).toFixed(1)}" r="3.4" class="ch-d"><title>${esc(p.d)}: ${p.w} kg</title></circle>`).join('')}</svg></div>`;
    }
    const goal = t ? `<div class="card"><div class="kv"><div><b>Goal weight</b>${t.weight != null ? t.weight + ' kg' : '—'}</div><div><b>Goal body fat</b>${t.bf != null ? t.bf + '%' : '—'}</div><div><b>Goal set</b>${day(t.setAt)}</div><div><b>Goal reached</b>${t.reachedAt ? day(t.reachedAt) : 'not yet'}</div></div></div>` : '';
    return goal + chart + `<div class="scroll"><table class="tbl"><tr><th>Date</th><th>Weight</th><th>Body fat</th><th>Waist</th></tr>${[...m].reverse().map(x => `<tr><td>${esc(x.d)}</td><td>${x.w} kg</td><td>${x.bf != null ? x.bf + '%' : '—'}</td><td>${x.wa != null ? x.wa + ' cm' : '—'}</td></tr>`).join('')}</table></div>`;
  }

  // ── leads ──
  async function viewLeads() {
    const d = await guard(() => api('leads')); if (!d) return;
    $('main').innerHTML = `<h2>Leads <small>${d.rows.length}</small></h2><p class="sub">Clients who ticked "I'm interested in personal training" and agreed to be contacted by email about it. Only contact people on this list.</p>
      <div class="tools"><a class="btn dark small" href="/api/admin?a=export&what=leads" download>Export CSV</a></div>
      <div class="grid"><div class="row head"><div>Client</div><div>Joined</div><div>Last active</div><div>Plans</div><div>Program</div><div>Contact</div></div>${d.rows.map(r => `<div class="row" data-id="${esc(r.id)}"><div><div class="nm">${esc(r.name)}</div><div class="em">${esc(r.email)}</div></div><div data-l="Joined">${day(r.createdAt)}</div><div data-l="Last active">${ago(r.lastActiveAt)}</div><div data-l="Plans">${r.plansGenerated}</div><div data-l="Program">${esc(r.program || '—')}</div><div data-l="Contact"><a href="mailto:${esc(r.email)}" onclick="event.stopPropagation()" class="btn dark small">Email</a></div></div>`).join('') || '<div style="padding:24px;text-align:center" class="muted">No one has asked yet.</div>'}</div>`;
    $('main').querySelectorAll('.row[data-id]').forEach(el => el.addEventListener('click', () => { location.hash = 'client=' + el.dataset.id; }));
  }

  // ── insights ──
  async function viewInsights() {
    const d = await guard(() => api('insights')); if (!d) return; const i = d.insights;
    const dist = (title, o) => { const e = Object.entries(o || {}); if (!e.length) return ''; const max = Math.max(...e.map(([, v]) => (typeof v === 'number' ? v : 0)), 1); return `<div class="card"><h3 style="margin-top:0">${title}</h3><div class="bars">${e.map(([k, v]) => `<div class="b"><span>${esc(k)}</span><div class="track"><div class="fill" style="width:${typeof v === 'number' ? Math.round(100 * v / max) : 4}%"></div></div><b>${esc(v)}</b></div>`).join('')}</div></div>`; };
    $('main').innerHTML = `<h2>Insights</h2><p class="sub">Anonymous totals and averages across all accounts. Any group smaller than ${i.minGroup} is hidden as "&lt;${i.minGroup}", so nobody can be identified. Updated ${ago(d.generatedAt)}.</p>
      <div class="stats">${stat('Accounts', i.accounts)}${stat('New, 7 days', i.new7)}${stat('New, 30 days', i.new30)}${stat('Active, 7 days', i.active7)}${stat('Active, 30 days', i.active30)}${stat('With a plan', i.withPlan)}${stat('Plans generated', num(i.plansGenerated))}${stat('Plans per account', num(i.avgPlansPerAccount))}${stat('Perfect-day rate', i.perfectDayRate == null ? '—' : i.perfectDayRate + '%', 'of logged days')}${stat('Average sleep', i.avgSleepHours == null ? '—' : i.avgSleepHours + ' h')}${stat('Sharing with coach', i.coachSharing)}${stat('Interested in training', i.trainingInterest)}</div>
      ${dist('Goals', i.goals)}${dist('Diet styles', i.diets)}${dist('Training days a week', i.trainingDays)}${dist('Experience', i.experience)}${i.accounts < i.minGroup ? `<div class="notice">Distributions and averages appear once there are at least ${i.minGroup} accounts.</div>` : ''}`;
  }

  // ── audit ──
  async function viewAudit() {
    const d = await guard(() => api('audit')); if (!d) return;
    const label = { login: 'Signed in', login_failed: 'Failed sign-in', logout: 'Signed out', view_account: 'Viewed a client (full details)', view_basic: 'Viewed a client (basic)', view_insights: 'Viewed insights', view_leads: 'Viewed leads', export_accounts: 'Exported accounts', export_leads: 'Exported leads' };
    $('main').innerHTML = `<h2>Audit log</h2><p class="sub">Every sign-in and every time a client's information was opened or exported. Clients can see when their coach last viewed their progress. The last 200 entries are shown.</p><div class="scroll"><table class="tbl"><tr><th>When</th><th>Admin</th><th>What</th><th>Client</th></tr>${d.entries.map(e => `<tr><td>${esc(e.t.replace('T', ' ').slice(0, 19))}</td><td>${e.admin ? 'Admin ' + esc(e.admin) : 'unknown'}</td><td>${esc(label[e.action] || e.action)}</td><td>${e.target ? `<a href="#client=${esc(e.target)}">${esc(e.target.slice(0, 8))}…</a>` : '—'}</td></tr>`).join('') || '<tr><td colspan="4">Nothing yet.</td></tr>'}</table></div>`;
  }

  // ── settings (switching between the two views) ──
  function viewSettings() {
    const on = (() => { try { return localStorage.getItem('hf_show_admin_link') === '1'; } catch { return false; } })();
    $('main').innerHTML = `<h2>Settings</h2><p class="sub">Signed in as <b>${esc(state.me.name)}</b> (${esc(state.me.email)}). Sessions end after ${state.me.idleMinutes} minutes of inactivity.</p>
      <div class="card"><h3 style="margin-top:0">Switching between the two views</h3>
        <p class="sub">The client app and this admin area are completely separate, with separate logins. Use <b>Client app</b> at the top to open the normal app.</p>
        <label class="switch"><input type="checkbox" id="showlink" ${on ? 'checked' : ''} /><span><b>Show an "Admin" link in the client app on THIS device</b><br><small>Adds a small link in the client app's Account menu, on this phone or computer only. Nobody else sees it, and it still needs your admin password. Turn it off on shared devices.</small></span></label>
        <p class="sub" style="margin-top:8px">Tip: on your phone you can also add this admin page to your home screen as its own app (browser menu, "Add to Home screen"). It will be named "Holy Fitness Admin".</p></div>
      <div class="card"><h3 style="margin-top:0">Privacy reminders</h3><p class="sub" style="margin-bottom:0">Client health information is shown only to clients' coaches and only if the client shared it. Every view is logged. Use exports only for the purpose clients agreed to, and delete downloaded files when you are done.</p></div>`;
    $('showlink').addEventListener('change', e => { try { if (e.target.checked) localStorage.setItem('hf_show_admin_link', '1'); else localStorage.removeItem('hf_show_admin_link'); toast(e.target.checked ? 'The Admin link will show in the client app on this device.' : 'The Admin link is hidden again.'); } catch { toast('This browser blocked saving that setting.'); } });
  }
  init();
})();
