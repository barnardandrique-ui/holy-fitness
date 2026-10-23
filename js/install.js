// js/install.js - "Add App to Home Screen".
//
//  * Android / Chrome / Edge / desktop Chrome: the browser fires `beforeinstallprompt` when the app is
//    installable. We hold on to that event and fire it when the person taps our button (one-tap install).
//  * iPhone / iPad (Safari and other iOS browsers): Apple has no install API, so the button opens a short
//    illustrated guide ("Share -> Add to Home Screen").
//  * Social-app browsers (Instagram, Facebook...) can't install anything: we tell people to open the page
//    in their real browser first.
//  * Already installed (running standalone), or a browser that can't install: nothing is shown.
//
// The detection rules are pure functions (exposed on window.HFInstall) so they can be tested without a browser.
(function (root) {
  'use strict';

  const DISMISS_KEY = 'hf_install_dismissed';
  const INSTALLED_KEY = 'hf_installed';
  const DISMISS_DAYS = 14;

  // ── Pure logic ──
  function detectPlatform(ua, navPlatform, touchPoints, standalone) {
    ua = String(ua || '');
    const iPadOS = navPlatform === 'MacIntel' && touchPoints > 1;     // iPads pretend to be Macs
    const ios = /iPhone|iPad|iPod/i.test(ua) || iPadOS;
    const android = /Android/i.test(ua);
    const inApp = /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|Snapchat|Twitter|LinkedInApp|TikTok|musical_ly|WhatsApp|; wv\)/i.test(ua);
    let browser = 'other';
    if (/EdgiOS|EdgA|Edg\//.test(ua)) browser = 'edge';
    else if (/SamsungBrowser/.test(ua)) browser = 'samsung';
    else if (/FxiOS|Firefox\//.test(ua)) browser = 'firefox';
    else if (/CriOS|Chrome\//.test(ua)) browser = 'chrome';
    else if (/Safari\//.test(ua)) browser = 'safari';
    return { os: ios ? 'ios' : android ? 'android' : 'desktop', browser, inApp, standalone: !!standalone };
  }

  // 'native' = fire the browser's own install prompt; others open a how-to guide; 'none' = show nothing.
  function installMode(p, hasPrompt) {
    if (p.standalone) return 'none';
    // Samsung Internet builds its own install package, which Google Play Protect has flagged on some phones
    // ("Unsafe app blocked"). Chrome's install is clean, so send Samsung users there instead of triggering it.
    if (p.os === 'android' && p.browser === 'samsung' && !p.inApp) return 'samsung';
    if (hasPrompt) return 'native';
    if (p.os === 'ios') return p.inApp ? 'ios-inapp' : 'ios';
    if (p.os === 'android') return p.inApp ? 'android-inapp' : 'android-menu';
    return 'none';
  }

  function isDismissed(stored, now) {
    const t = Number(stored);
    return Number.isFinite(t) && t > 0 && t <= now && now - t < DISMISS_DAYS * 86400000;   // a timestamp from the future (wrong clock) is ignored
  }

  root.HFInstall = { detectPlatform, installMode, isDismissed, DISMISS_DAYS };
  if (typeof window === 'undefined' || typeof document === 'undefined') return;   // tests / non-browser

  // ── Browser behaviour ──
  const nav = window.navigator;
  let deferred = null;

  const standalone = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || nav.standalone === true;
  const platform = () => detectPlatform(nav.userAgent, nav.platform, nav.maxTouchPoints || 0, standalone());
  const store = {
    get() { try { return localStorage.getItem(DISMISS_KEY); } catch { return null; } },
    set(v) { try { localStorage.setItem(DISMISS_KEY, String(v)); } catch { /* storage blocked */ } },
    installed() { try { return !!localStorage.getItem(INSTALLED_KEY); } catch { return false; } },
    markInstalled() { try { localStorage.setItem(INSTALLED_KEY, String(Date.now())); } catch { /* storage blocked */ } },
  };
  // Once installed, stay quiet. If the browser later offers the install prompt again (they uninstalled), offer it again.
  const mode = () => (!deferred && store.installed()) ? 'none' : installMode(platform(), !!deferred);

  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; refresh(); });
  window.addEventListener('appinstalled', () => {
    deferred = null; store.markInstalled(); refresh();
    if (window.showToast) window.showToast('Holy Fitness was added to your device.');
  });

  function refresh() {
    const m = mode();
    const signedIn = document.body.classList.contains('logged-in');
    const show = m !== 'none' && signedIn && !isDismissed(store.get(), Date.now());
    document.querySelectorAll('.install-card').forEach(el => { el.hidden = !show; });
    const acct = document.getElementById('account-install');
    if (acct) acct.hidden = m === 'none';
  }

  function dismiss() { store.set(Date.now()); refresh(); }

  async function install() {
    const m = mode();
    if (m === 'none') return;
    if (m === 'native' && deferred) {
      const ev = deferred;
      try {
        ev.prompt();
        const choice = await ev.userChoice;
        deferred = null;
        if (choice && choice.outcome === 'accepted') store.markInstalled();
        else store.set(Date.now());                                              // they said no: don't nag
      } catch { deferred = null; }
      refresh();
      return;
    }
    openHelp(m);
  }

  // ── The how-to guide (all text is fixed by us, never user input) ──
  const SHARE = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>';
  const PLUS = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/></svg>';
  const GUIDES = {
    ios: { title: 'Add to <span>home screen</span>', intro: 'Three quick taps, and Holy Fitness opens full screen like any other app.', steps: [
      `Tap the <b>Share</b> button ${SHARE} in your browser's toolbar. <small>On newer iPhones it may be under the <b>⋯</b> menu.</small>`,
      `Scroll down and tap <b>Add to Home Screen</b> ${PLUS}.`,
      'Tap <b>Add</b>. Holy Fitness now sits on your home screen.',
    ], note: "Don't see it? Open this page in Safari and try again." },
    'ios-inapp': { title: 'Open in <span>Safari</span> first', intro: "This in-app browser can't add apps to your home screen.", steps: [
      'Tap the <b>⋯</b> or <b>Share</b> menu in the corner and choose <b>Open in Safari</b>.',
      `In Safari, tap <b>Share</b> ${SHARE}, then <b>Add to Home Screen</b> ${PLUS}.`,
    ], note: '' },
    'android-menu': { title: 'Add to <span>home screen</span>', intro: 'Two taps from your browser menu.', steps: [
      'Tap the browser menu <b>⋮</b> (top right).',
      'Tap <b>Install app</b> or <b>Add to Home screen</b>.',
      'Tap <b>Install</b> to confirm.',
    ], note: 'If your phone shows a safety warning, choose Create shortcut (or Add page to Home screen) instead.' },
    samsung: { title: 'Add to <span>home screen</span>', intro: 'For the smoothest install on a Samsung phone, use Chrome.', steps: [
      'Open <b>Chrome</b> and go to <b>{host}</b>, then sign in.',
      'Tap <b>⋮</b> in Chrome, then <b>Install app</b> (or <b>Add to Home screen</b>).',
      'Tap <b>Install</b>. Holy Fitness now sits on your home screen.',
    ], note: 'Prefer to stay in Samsung Internet? Open its menu (≡), tap Add page to, then Home screen. It adds a shortcut that opens in the browser rather than full screen.' },
    'android-inapp': { title: 'Open in <span>your browser</span> first', intro: "This in-app browser can't install apps.", steps: [
      'Tap the <b>⋮</b> menu in the corner and choose <b>Open in Chrome</b> (or <b>Open in browser</b>).',
      'In Chrome, tap <b>⋮</b> then <b>Install app</b> or <b>Add to Home screen</b>.',
    ], note: '' },
  };

  function openHelp(m) {
    const g = GUIDES[m]; if (!g) return;
    document.getElementById('install-title').innerHTML = g.title;
    document.getElementById('install-intro').textContent = g.intro;
    const host = String(location.host).replace(/[<>&"']/g, '');
    document.getElementById('install-steps').innerHTML = g.steps.map(s => `<li>${s.replace('{host}', host)}</li>`).join('');
    const noteText = (m === 'ios' && platform().browser === 'safari') ? '' : g.note;   // the "try Safari" tip is only for other iPhone browsers
    const note = document.getElementById('install-note'); note.textContent = noteText; note.hidden = !noteText;
    document.getElementById('install-modal').classList.add('open');
  }
  function closeHelp() { document.getElementById('install-modal').classList.remove('open'); }
  document.getElementById('install-modal').addEventListener('click', function (e) { if (e.target === this) closeHelp(); });

  Object.assign(root.HFInstall, { refresh, install, dismiss, closeHelp, mode, platform });

  // A tiny service worker is what lets browsers treat the site as an installable app.
  if ('serviceWorker' in nav) window.addEventListener('load', () => { nav.serviceWorker.register('/sw.js').catch(() => { /* not fatal */ }); });
})(typeof window !== 'undefined' ? window : globalThis);
