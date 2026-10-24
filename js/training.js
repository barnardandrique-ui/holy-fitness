// js/training.js - the Training Center: browse, search and learn every exercise.
// Data: /data/exercises.json (Free Exercise DB, public domain), photos: /exercises/<id>/0.webp and 1.webp
// The search / filter rules are pure functions (exposed on window.HFTraining) so they can be tested without a browser.
(function (root) {
  'use strict';

  const MUSCLES = ['abdominals', 'abductors', 'adductors', 'biceps', 'calves', 'chest', 'forearms', 'glutes', 'hamstrings', 'lats', 'lower back', 'middle back', 'neck', 'quadriceps', 'shoulders', 'traps', 'triceps'];
  const EQUIPMENT = ['barbell', 'dumbbell', 'machine', 'cable', 'body only', 'kettlebells', 'e-z curl bar', 'bands', 'medicine ball', 'exercise ball', 'foam roll', 'other'];
  const LEVELS = ['beginner', 'intermediate', 'expert'];
  const CATEGORIES = [['strength', 'Strength'], ['stretching', 'Stretching'], ['powerlifting', 'Powerlifting'], ['plyometrics', 'Plyometrics'], ['cardio', 'Cardio'], ['olympic weightlifting', 'Olympic lifting'], ['strongman', 'Strongman']];
  const SYNONYMS = { abs: 'abdominals', ab: 'abdominals', core: 'abdominals', quads: 'quadriceps', quad: 'quadriceps', delts: 'shoulders', delt: 'shoulders', pecs: 'chest', pec: 'chest', hams: 'hamstrings', hamstring: 'hamstrings', calf: 'calves', bicep: 'biceps', tricep: 'triceps', trap: 'traps', lat: 'lats', bodyweight: 'body only' };
  const PAGE = 24;
  const CAT_RANK = { strength: 0, powerlifting: 1, plyometrics: 2, stretching: 3, cardio: 4, 'olympic weightlifting': 5, strongman: 6 };
  const LEVEL_RANK = { beginner: 0, intermediate: 1, expert: 2 };

  // ── Pure logic ──
  const cap = s => String(s || '').replace(/\b[a-z]/g, c => c.toUpperCase());
  function prepare(list) {
    return (list || []).map(e => {
      const equipment = e.equipment || 'body only';
      return { ...e, equipment, hay: [e.name, ...(e.primaryMuscles || []), ...(e.secondaryMuscles || []), equipment, e.category, e.level].join(' ').toLowerCase(), lname: String(e.name || '').toLowerCase() };
    });
  }
  function tokens(q) {
    return String(q || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(t => SYNONYMS[t] || t);
  }
  function filterExercises(list, f) {
    f = f || {};
    const toks = tokens(f.q);
    const out = list.filter(e =>
      (!f.muscle || (e.primaryMuscles || []).includes(f.muscle)) &&
      (!f.equipment || e.equipment === f.equipment) &&
      (!f.level || e.level === f.level) &&
      (!f.category || e.category === f.category) &&
      toks.every(t => e.hay.includes(t) || (t.length > 3 && t.endsWith('s') && e.hay.includes(t.slice(0, -1)))));
    // How directly does the name match the search? "Hack Squat" is half "squat"; "Squats - With Bands" is only a quarter.
    const coverage = e => {
      if (!toks.length) return 0;
      const words = e.lname.split(/[^a-z0-9]+/).filter(Boolean);
      const hit = toks.filter(t => words.some(w => w === t || w === t + 's' || w.startsWith(t))).length;
      return hit / Math.max(1, words.length);
    };
    const cat = e => (CAT_RANK[e.category] ?? 9);
    const lvl = e => (LEVEL_RANK[e.level] ?? 1);
    // Everyday strength exercises first (not Olympic lifts or strongman), closest name match, easier before harder.
    return out.sort(toks.length
      ? (a, b) => cat(a) - cat(b) || coverage(b) - coverage(a) || lvl(a) - lvl(b) || a.lname.length - b.lname.length || a.lname.localeCompare(b.lname)
      : (a, b) => cat(a) - cat(b) || lvl(a) - lvl(b) || a.lname.localeCompare(b.lname));
  }
  root.HFTraining = { MUSCLES, EQUIPMENT, LEVELS, CATEGORIES, prepare, tokens, filterExercises, cap };
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  // ── Browser behaviour ──
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = id => document.getElementById(id);
  let all = null, byId = {}, loading = null;
  const state = { q: '', muscle: '', equipment: '', level: '', category: '', shown: PAGE };
  let frameTimer = null, lastFocus = null;

  function load() {
    if (all) return Promise.resolve(all);
    if (loading) return loading;
    loading = fetch('/data/exercises.json').then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(list => { all = prepare(list); byId = Object.fromEntries(all.map(e => [e.id, e])); return all; })
      .finally(() => { loading = null; });
    return loading;
  }

  const thumb = e => e.frames ? `<img loading="lazy" decoding="async" src="/exercises/${encodeURIComponent(e.id)}/0.webp" alt="" />` : '<span class="tc-nophoto">No photo</span>';

  function cardHtml(e) {
    const meta = [cap((e.primaryMuscles || [])[0] || e.category), cap(e.equipment)].filter(Boolean).join(' · ');
    return `<button type="button" class="tc-card" data-id="${esc(e.id)}"><span class="tc-thumb">${thumb(e)}</span><span class="tc-name">${esc(e.name)}</span><span class="tc-meta">${esc(meta)}</span><span class="tc-level lv-${esc(e.level || 'none')}">${esc(cap(e.level))}</span></button>`;
  }

  function renderGrid() {
    const list = filterExercises(all, state);
    const shown = list.slice(0, state.shown);
    $('tc-count').textContent = list.length === all.length ? `${all.length} exercises` : `${list.length} of ${all.length} exercises`;
    $('tc-grid').innerHTML = shown.length ? shown.map(cardHtml).join('') : '<div class="tc-empty"><b>No exercises match.</b><span>Try a different word, or clear the filters.</span></div>';
    $('tc-more').hidden = list.length <= shown.length;
    $('tc-clear').hidden = !(state.q || state.muscle || state.equipment || state.level || state.category);
  }

  function buildFilters() {
    const sel = (id, label, opts) => `<select id="${id}" aria-label="${label}"><option value="">${label}</option>${opts.map(o => `<option value="${esc(o[0])}">${esc(o[1])}</option>`).join('')}</select>`;
    $('tc-filters').innerHTML =
      sel('tc-muscle', 'All muscles', MUSCLES.map(m => [m, cap(m)])) + sel('tc-equipment', 'All equipment', EQUIPMENT.map(m => [m, cap(m)])) +
      sel('tc-level', 'All levels', LEVELS.map(m => [m, cap(m)])) + sel('tc-category', 'All types', CATEGORIES);
    [['tc-muscle', 'muscle'], ['tc-equipment', 'equipment'], ['tc-level', 'level'], ['tc-category', 'category']].forEach(([id, key]) => {
      $(id).addEventListener('change', e => { state[key] = e.target.value; state.shown = PAGE; renderGrid(); });
    });
  }

  function init() {
    if (!$('tc-muscle')) buildFilters();
    $('tc-grid').innerHTML = '<div class="tc-empty"><b>Loading the exercise library…</b></div>';
    load().then(renderGrid).catch(() => {
      $('tc-grid').innerHTML = '<div class="tc-empty"><b>Could not load the exercise library.</b><span>Check your connection and try again.</span><button type="button" class="btn-outline" onclick="HFTraining.init()">Try again</button></div>';
    });
  }

  function search() { state.q = $('tc-q').value; state.shown = PAGE; if (all) renderGrid(); }
  function more() { state.shown += PAGE; renderGrid(); }
  function clear() {
    Object.assign(state, { q: '', muscle: '', equipment: '', level: '', category: '', shown: PAGE });
    $('tc-q').value = ''; ['tc-muscle', 'tc-equipment', 'tc-level', 'tc-category'].forEach(id => { $(id).value = ''; });
    renderGrid();
  }

  // ── Exercise detail ──
  function stopFrames() { clearInterval(frameTimer); frameTimer = null; }
  function showFrame(n) {
    const box = $('ex-frames'); if (!box) return;
    box.dataset.frame = String(n);
    document.querySelectorAll('#ex-media .ex-seg[data-f]').forEach(b => b.classList.toggle('active', b.dataset.f === String(n)));
    const lab = $('ex-frame-label'); if (lab) lab.textContent = n ? 'End position' : 'Start position';
  }
  function startFrames() {
    stopFrames();
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    frameTimer = setInterval(() => showFrame($('ex-frames').dataset.frame === '1' ? 0 : 1), 1300);
    const b = $('ex-play'); if (b) b.textContent = 'Pause';
  }
  function togglePlay() { if (frameTimer) { stopFrames(); $('ex-play').textContent = 'Play'; } else startFrames(); }
  function pickFrame(n) { stopFrames(); const b = $('ex-play'); if (b) b.textContent = 'Play'; showFrame(n); }

  function detailHtml(e) {
    const id = encodeURIComponent(e.id);
    const media = e.frames === 2
      ? `<div class="ex-frames" id="ex-frames" data-frame="0"><img src="/exercises/${id}/0.webp" alt="${esc(e.name)}: start position" /><img src="/exercises/${id}/1.webp" alt="${esc(e.name)}: end position" /><span class="ex-frame-label" id="ex-frame-label">Start position</span></div>
         <div class="ex-controls"><button type="button" class="ex-seg active" data-f="0">Start</button><button type="button" class="ex-seg" data-f="1">End</button><button type="button" class="ex-seg" id="ex-play">Pause</button></div>`
      : e.frames === 1
        ? `<div class="ex-frames single"><img src="/exercises/${id}/0.webp" alt="${esc(e.name)}" /></div>`
        : '<div class="ex-frames none"><span>No photos for this exercise yet.</span></div>';
    const chips = [...(e.primaryMuscles || []).map(m => `<span class="ex-chip gold">${esc(cap(m))}</span>`), `<span class="ex-chip">${esc(cap(e.equipment))}</span>`, e.level ? `<span class="ex-chip">${esc(cap(e.level))}</span>` : '', e.category ? `<span class="ex-chip">${esc(cap(e.category))}</span>` : '', e.mechanic ? `<span class="ex-chip">${esc(cap(e.mechanic))}</span>` : ''].join('');
    const steps = (e.instructions || []).length ? `<ol class="ex-steps">${e.instructions.map(s => `<li>${esc(s)}</li>`).join('')}</ol>` : '<p class="ex-none">Written instructions are not available for this exercise yet.</p>';
    const also = (e.secondaryMuscles || []).length ? `<p class="ex-also"><b>Also works:</b> ${esc(e.secondaryMuscles.map(cap).join(', '))}</p>` : '';
    return { media, body: `<div class="ex-chips">${chips}</div><h2 id="ex-title">${esc(e.name)}</h2>${also}<div class="ex-sub">How to do it</div>${steps}<p class="ex-note">Move with control, breathe steadily, and stop if you feel sharp pain. This is general guidance, not personal coaching.</p>` };
  }

  async function open(id) {
    try { await load(); } catch { if (window.showToast) window.showToast('Could not load the exercise library. Check your connection.'); return; }
    const e = byId[id];
    if (!e) { if (window.showToast) window.showToast('Sorry, that exercise is not in the library.'); return; }
    lastFocus = document.activeElement;
    const d = detailHtml(e);
    $('ex-media').innerHTML = d.media; $('ex-body').innerHTML = d.body;
    $('ex-media').querySelectorAll('.ex-seg[data-f]').forEach(b => b.addEventListener('click', () => pickFrame(Number(b.dataset.f))));
    const play = $('ex-play'); if (play) play.addEventListener('click', togglePlay);
    $('exercise-modal').classList.add('open');
    $('exercise-modal').scrollTop = 0;
    const closeBtn = $('exercise-modal').querySelector('.modal-close'); if (closeBtn) closeBtn.focus();
    if (e.frames === 2) startFrames();
  }
  function openByName(name) { const id = (root.HF_LEGACY_EXERCISES || {})[name]; if (id) open(id); }
  function close() {
    stopFrames();
    const m = $('exercise-modal'); if (!m || !m.classList.contains('open')) return false;
    m.classList.remove('open');
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch { /* ignore */ } }
    return true;
  }

  document.addEventListener('click', e => { const c = e.target.closest && e.target.closest('.tc-card'); if (c) open(c.dataset.id); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  $('exercise-modal').addEventListener('click', function (e) { if (e.target === this) close(); });
  $('tc-more').addEventListener('click', more);
  $('tc-clear').addEventListener('click', clear);
  $('tc-q').addEventListener('input', search);

  Object.assign(root.HFTraining, { init, open, openByName, close, load, state });
})(typeof window !== 'undefined' ? window : globalThis);
