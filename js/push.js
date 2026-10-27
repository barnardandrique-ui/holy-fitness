// js/push.js - the Reminders dialog: turn reminders on for this device, choose times, send a test.
// Reminders are web push notifications (they appear even when the app is closed). Needs js/install.js loaded first.
(function (root) {
  'use strict';
  const FLAG = 'hf_push_on', DEV = 'hf_push_dev';
  const $ = id => document.getElementById(id);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* blocked */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* blocked */ } },
  };
  let cfg = null;

  const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const needsInstall = () => { const p = root.HFInstall && root.HFInstall.platform ? root.HFInstall.platform() : null; return !!p && p.os === 'ios' && !p.standalone; };
  const bytes = s => { const pad = '='.repeat((4 - (s.length % 4)) % 4); const b = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, c => c.charCodeAt(0)); };
  const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Johannesburg'; } catch { return 'Africa/Johannesburg'; } };

  async function api(method, body) {
    const r = await fetch('/api/push', { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    let data = {}; try { data = await r.json(); } catch { /* not json */ }
    if (!r.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }
  async function currentSub() { try { const reg = await navigator.serviceWorker.ready; return await reg.pushManager.getSubscription(); } catch { return null; } }

  const times = () => { const o = []; for (let m = 360; m <= 1290; m += 15) { const t = String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); o.push(t); } return o; };
  const timeSel = (id, val) => `<select id="${id}" aria-label="Time">${times().map(t => `<option value="${t}"${t === val ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  function formHtml(p) {
    return `<div class="rm-group">
      <label class="rm-row"><input type="checkbox" id="rm-daily" ${p.daily.on ? 'checked' : ''}/><span><b>Daily check-in</b><small>A nudge to log your day, only if you haven't yet.</small></span>${timeSel('rm-daily-time', p.daily.time)}</label>
      <label class="rm-row"><input type="checkbox" id="rm-weekly" ${p.weekly.on ? 'checked' : ''}/><span><b>Weekly check-in</b><small>Once a week, only if you haven't checked in lately.</small></span>
        <span class="rm-pair"><select id="rm-weekly-day" aria-label="Day">${DAYS.map((d, i) => `<option value="${i + 1}"${p.weekly.day === i + 1 ? ' selected' : ''}>${d}</option>`).join('')}</select>${timeSel('rm-weekly-time', p.weekly.time)}</span></label>
      <label class="rm-row"><input type="checkbox" id="rm-mile" ${p.milestones ? 'checked' : ''}/><span><b>Milestones</b><small>Goal reached, perfect weeks and streaks, shown on your other devices too.</small></span></label>
    </div><p class="rm-foot">Times are in your time zone (${tz().replace(/_/g, ' ')}), between 06:00 and 21:30. At most one reminder a day. Messages never include your weight, calories or health details.</p>`;
  }
  const readForm = () => ({
    daily: { on: $('rm-daily').checked, time: $('rm-daily-time').value },
    weekly: { on: $('rm-weekly').checked, day: Number($('rm-weekly-day').value), time: $('rm-weekly-time').value },
    milestones: $('rm-mile').checked, tz: tz(),
  });
  const msg = (text, bad) => { const el = $('remind-msg'); if (el) { el.textContent = text || ''; el.hidden = !text; el.classList.toggle('bad', !!bad); } };

  async function render() {
    const body = $('remind-body'); if (!body) return;
    if (!cfg) { body.innerHTML = '<p class="rm-info">Loading…</p>'; return; }
    if (cfg.broken) { body.innerHTML = '<p class="rm-info">Reminders are set up but not working right now, because a setting on the server needs fixing. Please let the site owner know.</p>'; return; }
    if (!cfg.configured) { body.innerHTML = '<p class="rm-info">Reminders are not switched on for this site yet. Please check back soon.</p>'; return; }
    if (needsInstall()) { body.innerHTML = '<p class="rm-info">On iPhone and iPad, reminders work once Holy Fitness is on your home screen. Add it, then open it from there and come back here.</p><button type="button" class="btn-modal-submit" onclick="HFPush.close(); HFInstall.install();">Show me how</button>'; return; }
    if (!supported()) { body.innerHTML = '<p class="rm-info">This browser does not support reminders. Chrome, Edge, Firefox and Samsung Internet on Android or a computer do.</p>'; return; }
    if (Notification.permission === 'denied') { body.innerHTML = '<p class="rm-info">Notifications are blocked for this site. To turn them on, open your browser\'s site settings for Holy Fitness, allow notifications, then come back here.</p>'; return; }
    const sub = await currentSub(); const on = !!sub && !!store.get(DEV) && cfg.devices.some(d => d.id === store.get(DEV));
    body.innerHTML = `<p class="rm-status ${on ? 'on' : ''}">${on ? 'Reminders are on for this device.' : 'Reminders are off on this device.'}</p>` + formHtml(cfg.prefs)
      + (on ? '<button type="button" class="btn-modal-submit" onclick="HFPush.save()">Save changes</button><button type="button" class="btn-modal-submit btn-secondary" style="margin-top:10px;" onclick="HFPush.test()">Send a test</button><button type="button" class="rm-off" onclick="HFPush.disable()">Turn off on this device</button>'
        : '<button type="button" class="btn-modal-submit" onclick="HFPush.enable()">Turn on reminders</button>');
  }

  async function open() {
    $('remind-modal').classList.add('open'); cfg = null; msg(''); render();
    try { cfg = await api('GET'); } catch (e) { $('remind-body').innerHTML = '<p class="rm-info">Could not load your reminder settings. Check your connection and try again.</p>'; return; }
    render();
  }
  const close = () => $('remind-modal').classList.remove('open');

  async function enable() {
    const prefs = readForm();
    try {
      let perm = Notification.permission;
      if (perm !== 'granted') perm = await Notification.requestPermission();
      if (perm !== 'granted') { await render(); msg(perm === 'denied' ? '' : 'No problem. You can turn reminders on any time.'); return; }
      msg('Turning on…');
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      const subscribe = () => reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(cfg.publicKey) });
      try { if (!sub) sub = await subscribe(); } catch (e) { if (sub) { await sub.unsubscribe(); sub = await subscribe(); } else throw e; }
      const res = await api('POST', { action: 'subscribe', subscription: sub.toJSON(), prefs });
      store.set(FLAG, '1'); store.set(DEV, res.deviceId); cfg = { ...cfg, prefs: res.prefs, devices: res.devices };
      await render(); msg('Reminders are on. Tap "Send a test" to see one.');
    } catch (e) { msg(e.message || 'Could not turn on reminders on this device.', true); }
  }
  async function save() {
    try { const res = await api('POST', { action: 'prefs', prefs: readForm() }); cfg = { ...cfg, prefs: res.prefs, devices: res.devices }; msg('Saved.'); } catch (e) { msg(e.message, true); }
  }
  async function test() {
    try { const res = await api('POST', { action: 'test' }); msg(res.sent ? 'Sent. It should appear in a moment.' : 'We could not deliver it. Try turning reminders off and on again.', !res.sent); } catch (e) { msg(e.message, true); }
  }
  async function disable() {
    try {
      const sub = await currentSub(); if (sub) await sub.unsubscribe();
      const res = await api('POST', { action: 'unsubscribe', deviceId: store.get(DEV) || '' });
      store.del(FLAG); store.del(DEV); cfg = { ...cfg, prefs: res.prefs, devices: res.devices }; await render(); msg('Reminders are off on this device.');
    } catch (e) { msg(e.message, true); }
  }

  // Tell the person's OTHER devices about a milestone (goal reached, streak, perfect week). Quiet if reminders are off.
  function milestone(kind) {
    if (!store.get(FLAG)) return;
    try { fetch('/api/push', { method: 'POST', credentials: 'include', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'milestone', kind, exclude: store.get(DEV) || '' }) }).catch(() => {}); } catch { /* ignore */ }
  }

  // Run after sign-in: if reminders were on but the browser dropped the subscription, quietly restore it (permission is still granted).
  async function reconcile() {
    if (!store.get(FLAG) || !supported()) return;
    if (Notification.permission !== 'granted') { store.del(FLAG); store.del(DEV); return; }
    try {
      if (await currentSub()) return;
      const c = await api('GET'); if (!c.configured) return;
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(c.publicKey) });
      const res = await api('POST', { action: 'subscribe', subscription: sub.toJSON(), prefs: c.prefs }); store.set(DEV, res.deviceId);
    } catch { /* try again next visit */ }
  }

  root.HFPush = { open, close, enable, save, test, disable, milestone, reconcile, supported };
  const m = document.getElementById('remind-modal'); if (m) m.addEventListener('click', function (e) { if (e.target === this) close(); });
})(window);
