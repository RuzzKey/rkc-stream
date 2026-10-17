/* RuzzKey Cards – Stream-Display
   Läuft komplett offline, keine externen Server zur Laufzeit. */
(() => {
  'use strict';

  /* =========================================================
     Hilfsfunktionen
     ========================================================= */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const round2 = (v) => Math.round(v * 100) / 100;

  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(hexA, hexB, t) {
    const a = hexToRgb(hexA), b = hexToRgb(hexB);
    const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
    return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
  }
  const eurFmt2 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const eurFmt0 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const fmtEUR = (v) => (Math.abs(v % 1) > 0.001 ? eurFmt2 : eurFmt0).format(v);
  function parseNum(str) {
    if (str == null) return NaN;
    const s = String(str).trim().replace(/\s|€/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
    return s === '' ? NaN : Number(s);
  }

  /* =========================================================
     Speicher (localStorage) – jeder Zugriff abgesichert
     ========================================================= */
  const memStore = {};
  const store = {
    ok: false,
    get(key, def) {
      try {
        const v = localStorage.getItem(key);
        return v == null ? def : JSON.parse(v);
      } catch (e) { return key in memStore ? memStore[key] : def; }
    },
    set(key, val) {
      memStore[key] = val;
      try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
    },
    remove(key) {
      delete memStore[key];
      try { localStorage.removeItem(key); } catch (e) { /* ignorieren */ }
    }
  };
  try { localStorage.setItem('rkc.test', '1'); localStorage.removeItem('rkc.test'); store.ok = true; } catch (e) { store.ok = false; }

  const KEY = 'rkc.settings.v1';
  const DEFAULTS = {
    theme: 'rkc',
    modules: { logo: true, clock: true, timer: true, showcase: true, goal: true, lastSold: true, banner: true, qr: false, media: true, creatures: true, particles: true },
    banners: [
      'Zustand und Ware wie im Stream gezeigt',
      'Käufe sind verbindlich. Rückgabe und Widerruf nach Whatnot-Regeln und gesetzlichen Vorgaben'
    ],
    bannerInterval: 9,
    tagline: 'Live-Verkauf · Sammelkarten',
    goal: { target: 200, current: 0, history: [] },
    lastSold: '',
    showcase: { name: '', cond: '', price: '' },
    timer: { duration: 300000, remaining: 300000, endAt: 0, running: false, sound: true },
    qr: { url: '', label: 'Mein Shop auf Whatnot' },
    sceneBrightness: 0.8,
    uiBrightness: 1,
    motion: 'auto',
    perf: 'high',
    burnIn: true,
    wakeLock: true,
    clockSeconds: true,
    clockDate: true
  };
  function deepMerge(base, over) {
    if (Array.isArray(base)) return Array.isArray(over) ? over.slice() : base.slice();
    if (base && typeof base === 'object') {
      const out = {};
      for (const k of Object.keys(base)) out[k] = (over && k in over) ? deepMerge(base[k], over[k]) : deepMerge(base[k], undefined);
      return out;
    }
    return over === undefined || over === null || typeof over !== typeof base ? base : over;
  }
  const S = deepMerge(DEFAULTS, store.get(KEY, {}));
  let saveTimer = 0;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => store.set(KEY, S), 250);
  }
  window.addEventListener('pagehide', () => store.set(KEY, S));

  /* =========================================================
     Farbwelten
     ========================================================= */
  const THEMES = {
    rkc:    { name: 'RKC',     sub: 'Logo-Farben', c1: '#b44dff', c2: '#4f6bff', c3: '#2ee6ff', deep: '#1a0733', muted: '#cdbfff' },
    fire:   { name: 'Feuer',   sub: 'Glut & Funken', c1: '#ff5a1f', c2: '#ff2e55', c3: '#ffc04a', deep: '#2a0800', muted: '#ffd2b8' },
    water:  { name: 'Wasser',  sub: 'Blasen & Wellen', c1: '#1f8bff', c2: '#5a6dff', c3: '#3ef0e0', deep: '#001a33', muted: '#bfe3ff' },
    plant:  { name: 'Pflanze', sub: 'Blätter & Glühwürmchen', c1: '#2fd27a', c2: '#14a58f', c3: '#c3f25a', deep: '#03200f', muted: '#c8f2d6' },
    blitz:  { name: 'Blitz',   sub: 'Funken & Bögen', c1: '#ffd21f', c2: '#4aa8ff', c3: '#fff59a', deep: '#1e1800', muted: '#fff0b8' },
    psycho: { name: 'Psycho',  sub: 'Spiralen & Ringe', c1: '#ff4fd8', c2: '#9d5cff', c3: '#ff9ccf', deep: '#26002c', muted: '#f6c8ff' }
  };
  const THEME_ORDER = ['rkc', 'fire', 'water', 'plant', 'blitz', 'psycho'];

  function applyTheme() {
    const t = THEMES[S.theme] || THEMES.rkc;
    const root = document.documentElement.style;
    for (const k of ['c1', 'c2', 'c3', 'deep']) {
      root.setProperty('--' + k, t[k]);
      root.setProperty('--' + k + '-rgb', hexToRgb(t[k]).join(', '));
    }
    root.setProperty('--muted', t.muted);
    $('#qbTheme').textContent = t.name;
    $$('.theme-btn').forEach(b => b.classList.toggle('active', b.dataset.theme === S.theme));
    Scene.rebuild();
  }

  /* =========================================================
     Module, Helligkeit, Bewegung
     ========================================================= */
  const MODULES = [
    ['logo', 'Logo & Name'], ['clock', 'Uhr'], ['timer', 'Countdown'], ['showcase', 'Schaufenster'],
    ['goal', 'Ziel-Leiste'], ['lastSold', 'Zuletzt verkauft'], ['banner', 'Info-Banner'], ['qr', 'QR-Code'],
    ['media', 'Eigene Medien'], ['creatures', 'Fantasie-Wesen'], ['particles', 'Partikel']
  ];

  function applyModules() {
    const m = S.modules;
    $$('[data-mod]').forEach(el => {
      const key = el.dataset.mod;
      let on = !!m[key];
      if (key === 'qr' && !S.qr.url.trim()) on = false;
      if (key === 'lastSold' && !S.lastSold.trim()) on = false;
      el.classList.toggle('off', !on);
    });
    // Kopfzeile ausblenden, wenn Logo und Uhr aus sind
    $('.top').classList.toggle('off', !m.logo && !m.clock);
    document.body.classList.toggle('no-showcase', !m.showcase);
    document.body.classList.toggle('no-creatures', !m.creatures);
    $('#bgMedia').classList.toggle('off', !m.media);
    $('#overlayLayer').classList.toggle('off', !m.media);
    $$('.chip[data-mod-toggle]').forEach(c => c.classList.toggle('on', !!m[c.dataset.modToggle]));
    requestAnimationFrame(fitAll);
  }

  function applyBrightness() {
    const r = document.documentElement.style;
    r.setProperty('--scene-opacity', S.sceneBrightness);
    r.setProperty('--ui-opacity', S.uiBrightness);
    $('#outScene').textContent = Math.round(S.sceneBrightness * 100) + ' %';
    $('#outUi').textContent = Math.round(S.uiBrightness * 100) + ' %';
  }

  const mqReduce = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  let reduced = false;
  function applyMotion() {
    reduced = S.motion === 'reduced' || (S.motion === 'auto' && !!(mqReduce && mqReduce.matches));
    document.body.classList.toggle('reduced', reduced);
    document.body.classList.toggle('burnin', !!S.burnIn);
    Scene.rebuild();
  }
  if (mqReduce && mqReduce.addEventListener) mqReduce.addEventListener('change', applyMotion);

  /* =========================================================
     Text automatisch einpassen
     ========================================================= */
  function unit() { return Math.min(innerHeight * 0.01, innerWidth * 0.0115); }
  function fitText(el, maxU, minU, maxLines) {
    if (!el || el.offsetParent === null) return;
    const u = unit();
    let size = maxU * u;
    const min = minU * u;
    el.style.fontSize = size + 'px';
    el.style.overflowWrap = 'normal';
    const lh = parseFloat(getComputedStyle(el).lineHeight) / size || 1.2;
    let guard = 30;
    while (guard-- > 0 && size > min) {
      const tooTall = el.scrollHeight > Math.ceil(size * lh * maxLines) + 2;
      const tooWide = el.scrollWidth > el.clientWidth + 1;
      if (!tooTall && !tooWide) break;
      size = Math.max(min, size * 0.92);
      el.style.fontSize = size + 'px';
    }
    // Nur wenn es trotz kleinster Schrift nicht passt, Wörter umbrechen
    if (el.scrollWidth > el.clientWidth + 1) el.style.overflowWrap = 'anywhere';
  }
  function fitAll() {
    fitText($('#bannerText'), 4.6, 2.4, 2);
    const portrait = innerHeight > innerWidth;
    fitText($('#scName'), portrait ? 6 : 7, 3, 3);
    fitText($('#lastSoldText'), 4.4, 2.6, 2);
  }

  /* =========================================================
     Uhr
     ========================================================= */
  const dateFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  let lastMinute = -1;
  function tickClock() {
    const d = new Date();
    const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    $('#clockS').textContent = String(d.getSeconds()).padStart(2, '0');
    if (d.getMinutes() !== lastMinute) {
      lastMinute = d.getMinutes();
      $('#clockHM').textContent = hm;
      $('#clockDate').textContent = dateFmt.format(d);
    }
  }
  function applyClockOpts() {
    document.body.classList.toggle('no-sec', !S.clockSeconds);
    document.body.classList.toggle('no-date', !S.clockDate);
  }

  /* =========================================================
     Countdown + Signalton
     ========================================================= */
  let audioCtx = null;
  function unlockAudio() {
    try {
      if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        audioCtx = new AC();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { /* kein Ton möglich */ }
  }
  function chime() {
    if (!audioCtx) { toast('Ton noch gesperrt – einmal auf die Anzeige tippen.'); return; }
    try {
      const now = audioCtx.currentTime;
      [0, 0.32, 0.64].forEach((off, i) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'sine';
        o.frequency.value = [784, 988, 1175][i];
        g.gain.setValueAtTime(0.0001, now + off);
        g.gain.exponentialRampToValueAtTime(0.35, now + off + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, now + off + 0.6);
        o.connect(g).connect(audioCtx.destination);
        o.start(now + off);
        o.stop(now + off + 0.65);
      });
    } catch (e) { /* ignorieren */ }
  }

  const T = S.timer;
  let timerDone = false;
  function timerRemaining() { return T.running ? Math.max(0, T.endAt - Date.now()) : T.remaining; }
  function fmtTime(ms) {
    const total = Math.ceil(ms / 1000);
    const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h > 0 ? h + ':' + pad(m) + ':' + pad(s) : pad(m) + ':' + pad(s);
  }
  function renderTimer() {
    const ms = timerRemaining();
    if (T.running && ms <= 0) {
      T.running = false; T.remaining = 0; timerDone = true; save();
      if (T.sound) chime();
    }
    const panel = $('.timer-panel');
    $('#timerDisplay').textContent = timerDone ? 'ZEIT!' : fmtTime(ms);
    panel.classList.toggle('warn', T.running && ms <= 10000);
    panel.classList.toggle('done', timerDone);
    panel.classList.toggle('paused', !T.running && !timerDone && ms !== T.duration);
    const label = T.running ? '⏸' : '▶';
    $('#qbTimerToggle').textContent = label;
    $('#btnTimerToggle').textContent = T.running ? '⏸ Pause' : '▶ Start';
  }
  function timerToggle() {
    if (T.running) {
      T.remaining = Math.max(0, T.endAt - Date.now());
      T.running = false;
    } else {
      if (T.remaining <= 0 || timerDone) T.remaining = T.duration;
      timerDone = false;
      T.endAt = Date.now() + T.remaining;
      T.running = true;
    }
    save(); renderTimer();
  }
  function timerReset() {
    T.running = false; T.remaining = T.duration; timerDone = false;
    save(); renderTimer();
  }
  function timerSet(seconds) {
    const ms = clamp(Math.round(seconds), 1, 599 * 60 + 59) * 1000;
    T.duration = ms; T.remaining = ms; T.running = false; timerDone = false;
    $('#inTimerMin').value = Math.floor(ms / 60000);
    $('#inTimerSec').value = Math.floor(ms / 1000) % 60;
    save(); renderTimer();
  }
  // War der Timer beim letzten Schließen schon abgelaufen?
  if (T.running && T.endAt <= Date.now()) { T.running = false; T.remaining = 0; timerDone = true; }

  /* =========================================================
     Ziel-Leiste
     ========================================================= */
  const G = S.goal;
  let goalWasReached = G.current >= G.target && G.target > 0;
  function renderGoal() {
    const pct = G.target > 0 ? clamp(G.current / G.target * 100, 0, 100) : 0;
    $('#goalCurrent').textContent = fmtEUR(G.current);
    $('#goalTarget').textContent = fmtEUR(G.target);
    $('#goalFill').style.width = pct + '%';
    $('#goalPct').textContent = (G.current >= G.target && G.target > 0) ? '✦ Ziel erreicht! ✦' : Math.floor(pct) + ' %';
    $('.goal-panel').classList.toggle('reached', G.current >= G.target && G.target > 0);
    $('#inGoalTarget').value = G.target;
    $('#inGoalCurrent').value = G.current;
    const reached = G.current >= G.target && G.target > 0;
    if (reached && !goalWasReached) celebrate($('.goal-bar'));
    goalWasReached = reached;
  }
  function goalAdd(delta) {
    if (!isFinite(delta) || delta === 0) return;
    G.history.push(G.current);
    if (G.history.length > 100) G.history.shift();
    G.current = Math.max(0, round2(G.current + delta));
    save(); renderGoal();
  }
  function goalUndo() {
    if (!G.history.length) { toast('Nichts zum Rückgängigmachen'); return; }
    G.current = G.history.pop();
    save(); renderGoal();
  }

  /* =========================================================
     Info-Banner
     ========================================================= */
  let bannerIdx = -1, bannerTimer = 0;
  function bannerItems() { return S.banners.map(s => s.trim()).filter(Boolean); }
  function showNextBanner(immediate) {
    clearTimeout(bannerTimer);
    const items = bannerItems();
    const el = $('#bannerText');
    if (!items.length) { el.textContent = ''; return; }
    bannerIdx = (bannerIdx + 1) % items.length;
    const set = () => { el.textContent = items[bannerIdx]; el.classList.remove('out'); fitText(el, 4.6, 2.4, 2); };
    if (immediate || items.length === 1) set();
    else { el.classList.add('out'); setTimeout(set, 700); }
    if (items.length > 1) bannerTimer = setTimeout(() => showNextBanner(false), S.bannerInterval * 1000);
  }
  function renderBannerList() {
    const list = $('#bannerList');
    list.innerHTML = '';
    S.banners.forEach((txt, i) => {
      const item = document.createElement('div');
      item.className = 'list-item';
      item.innerHTML = '<div class="row"><input type="text" maxlength="160"><button class="btn x" aria-label="Banner löschen">✕</button></div>';
      const inp = $('input', item);
      inp.value = txt;
      inp.addEventListener('input', () => { S.banners[i] = inp.value; save(); });
      inp.addEventListener('change', () => { bannerIdx = i - 1; showNextBanner(true); });
      $('button', item).addEventListener('click', () => {
        S.banners.splice(i, 1); save(); renderBannerList(); bannerIdx = -1; showNextBanner(true);
      });
      list.appendChild(item);
    });
  }

  /* =========================================================
     Schaufenster, Zuletzt verkauft, Untertitel
     ========================================================= */
  function fmtPrice(str) {
    const s = (str || '').trim();
    if (!s) return '';
    const n = parseNum(s);
    return isFinite(n) && /^[\d\s.,€]+$/.test(s) ? fmtEUR(n) : s;
  }
  function renderShowcase() {
    $('#scName').textContent = S.showcase.name.trim() || 'Gleich geht’s weiter ✦';
    $('#scCond').textContent = S.showcase.cond.trim();
    $('#scPrice').textContent = fmtPrice(S.showcase.price);
    requestAnimationFrame(fitAll);
  }
  function renderLastSold(flash) {
    const el = $('#lastSoldText');
    el.textContent = S.lastSold.trim();
    if (flash) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
    applyModules();
  }
  function renderTagline() { $('#tagline').textContent = S.tagline; }

  /* =========================================================
     QR-Code (lokal erzeugt)
     ========================================================= */
  function renderQR() {
    const url = S.qr.url.trim();
    $('#qrLabel').textContent = S.qr.label;
    applyModules();
    if (!url || typeof window.qrcode !== 'function') return;
    try {
      if (qrcode.stringToBytesFuncs && qrcode.stringToBytesFuncs['UTF-8']) qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
      const qr = qrcode(0, 'M');
      qr.addData(url, 'Byte');
      qr.make();
      const n = qr.getModuleCount(), quiet = 2;
      const cv = $('#qrCanvas');
      const css = cv.getBoundingClientRect().width || 120;
      const dpr = window.devicePixelRatio || 1;
      const px = Math.round(css * dpr);
      cv.width = px; cv.height = px;
      const c = cv.getContext('2d');
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, px, px);
      const cell = px / (n + quiet * 2);
      c.fillStyle = '#0d0221';
      for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) {
        if (qr.isDark(r, col)) c.fillRect(Math.floor((col + quiet) * cell), Math.floor((r + quiet) * cell), Math.ceil(cell), Math.ceil(cell));
      }
    } catch (e) { toast('QR-Code konnte nicht erzeugt werden (Link zu lang?)'); }
  }

  /* =========================================================
     IndexedDB für Medien und Schaufenster-Foto
     ========================================================= */
  const DB = {
    db: null, ok: false, mem: { media: new Map(), kv: new Map() },
    open() {
      return new Promise((resolve) => {
        try {
          const req = indexedDB.open('rkc-media', 1);
          req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('media')) db.createObjectStore('media', { keyPath: 'id' });
            if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
          };
          req.onsuccess = () => { DB.db = req.result; DB.ok = true; resolve(); };
          req.onerror = () => resolve();
          req.onblocked = () => resolve();
        } catch (e) { resolve(); }
      });
    },
    tx(store, mode, fn) {
      return new Promise((resolve, reject) => {
        try {
          const t = DB.db.transaction(store, mode);
          const r = fn(t.objectStore(store));
          t.oncomplete = () => resolve(r && r.result);
          t.onerror = () => reject(t.error);
          t.onabort = () => reject(t.error);
        } catch (e) { reject(e); }
      });
    },
    async put(store, val, key) {
      DB.mem[store].set(key !== undefined ? key : val.id, val);
      if (!DB.ok) return false;
      try { await DB.tx(store, 'readwrite', s => key !== undefined ? s.put(val, key) : s.put(val)); return true; }
      catch (e) { toast('Speichern fehlgeschlagen – Speicher voll?'); return false; }
    },
    async del(store, key) {
      DB.mem[store].delete(key);
      if (!DB.ok) return;
      try { await DB.tx(store, 'readwrite', s => s.delete(key)); } catch (e) { /* ignorieren */ }
    },
    async get(store, key) {
      if (!DB.ok) return DB.mem[store].get(key);
      try { return await DB.tx(store, 'readonly', s => s.get(key)); } catch (e) { return DB.mem[store].get(key); }
    },
    async all(store) {
      if (!DB.ok) return Array.from(DB.mem[store].values());
      try { return (await DB.tx(store, 'readonly', s => s.getAll())) || []; } catch (e) { return []; }
    }
  };

  // Große Fotos verkleinern (spart Speicher, Anzeige bleibt scharf)
  function downscaleImage(file, maxSide) {
    return new Promise((resolve) => {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { resolve(file); return; }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        if (s >= 1) { URL.revokeObjectURL(url); resolve(file); return; }
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.naturalWidth * s); cv.height = Math.round(img.naturalHeight * s);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        cv.toBlob(b => resolve(b || file), 'image/jpeg', 0.9);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  /* --- Schaufenster-Foto --- */
  let scPhotoUrl = null;
  async function loadShowcasePhoto() {
    const blob = await DB.get('kv', 'showcasePhoto');
    setShowcasePhoto(blob || null);
  }
  function setShowcasePhoto(blob) {
    if (scPhotoUrl) { URL.revokeObjectURL(scPhotoUrl); scPhotoUrl = null; }
    const img = $('#scPhoto');
    if (blob) {
      scPhotoUrl = URL.createObjectURL(blob);
      img.src = scPhotoUrl; img.hidden = false; $('#scEmpty').hidden = true;
    } else {
      img.removeAttribute('src'); img.hidden = true; $('#scEmpty').hidden = false;
    }
  }

  /* --- Eigene Medien --- */
  let mediaItems = [];
  const mediaUrls = new Map();
  const mediaUrl = (it) => {
    if (!mediaUrls.has(it.id)) mediaUrls.set(it.id, URL.createObjectURL(it.blob));
    return mediaUrls.get(it.id);
  };
  const POS = { tl: 'Oben links', tr: 'Oben rechts', bl: 'Unten links', br: 'Unten rechts', c: 'Mitte', l: 'Links mittig', r: 'Rechts mittig' };

  function mediaEl(it) {
    const isVideo = it.type.startsWith('video/');
    const el = document.createElement(isVideo ? 'video' : 'img');
    el.src = mediaUrl(it);
    if (isVideo) {
      el.muted = true; el.loop = true; el.autoplay = true; el.playsInline = true;
      el.setAttribute('muted', ''); el.setAttribute('playsinline', '');
      el.play().catch(() => {});
    }
    el.alt = '';
    return el;
  }
  function renderMediaLayers() {
    const bg = $('#bgMedia'), ov = $('#overlayLayer');
    bg.innerHTML = ''; ov.innerHTML = '';
    for (const it of mediaItems) {
      if (it.mode === 'bg' && !bg.firstChild) {
        const el = mediaEl(it);
        el.style.opacity = it.opacity;
        bg.appendChild(el);
      } else if (it.mode === 'overlay') {
        const el = mediaEl(it);
        const sz = it.scale + 'vmin';
        el.style.width = sz; el.style.height = sz; el.style.opacity = it.opacity;
        const m = 'calc(var(--gap) + ', st = el.style;
        const p = it.pos;
        if (p.includes('t')) st.top = m + 'var(--sa-t))';
        if (p.includes('b')) st.bottom = m + 'var(--sa-b) + var(--ground))';
        if (p === 'tl' || p === 'bl' || p === 'l') st.left = m + 'var(--sa-l))';
        if (p === 'tr' || p === 'br' || p === 'r') st.right = m + 'var(--sa-r))';
        if (p === 'c') { st.left = '50%'; st.top = '50%'; st.transform = 'translate(-50%, -50%)'; }
        if (p === 'l' || p === 'r') { st.top = '50%'; st.transform = 'translateY(-50%)'; }
        el.style.animation = 'logoFloat 53s ease-in-out infinite';
        ov.appendChild(el);
      }
    }
  }
  function renderMediaList() {
    const list = $('#mediaList');
    list.innerHTML = '';
    if (!mediaItems.length) {
      list.innerHTML = '<p class="hint">Noch keine Medien hinzugefügt.</p>';
    }
    for (const it of mediaItems) {
      const item = document.createElement('div');
      item.className = 'list-item';
      const isVideo = it.type.startsWith('video/');
      item.innerHTML = `
        <div class="row">
          <${isVideo ? 'video muted playsinline' : 'img alt=""'} class="media-thumb"></${isVideo ? 'video' : 'img'}>
          <div style="flex:1;min-width:0">
            <div class="media-name"></div>
            <div class="media-meta"></div>
            <div class="license-note"></div>
          </div>
          <button class="btn x" aria-label="Datei löschen">🗑</button>
        </div>
        <div class="row"><input type="text" class="m-note" maxlength="200" placeholder="Quelle & Lizenz (z. B. eigenes Foto / CC BY 4.0, Autor …)"></div>
        <div class="row">
          <select class="m-mode"><option value="off">Aus</option><option value="bg">Hintergrund</option><option value="overlay">Overlay</option></select>
          <select class="m-pos">${Object.entries(POS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
        </div>
        <div class="row">
          <label class="mini">Deckkraft <input type="range" class="m-op" min="0.1" max="1" step="0.05"></label>
          <label class="mini">Größe (Overlay) <input type="range" class="m-sc" min="8" max="100" step="1"></label>
        </div>`;
      const thumb = $('.media-thumb', item);
      thumb.src = mediaUrl(it);
      $('.media-name', item).textContent = it.name;
      $('.media-meta', item).textContent = (isVideo ? 'Video' : it.type === 'image/gif' ? 'GIF' : 'Bild') + ' · ' + (it.size / 1048576).toFixed(1) + ' MB';
      const note = $('.license-note', item);
      const setNote = () => { note.textContent = it.note ? '© ' + it.note : '⚠ Quelle & Lizenz noch nicht eingetragen'; };
      setNote();
      const inNote = $('.m-note', item), mode = $('.m-mode', item), pos = $('.m-pos', item), op = $('.m-op', item), sc = $('.m-sc', item);
      inNote.value = it.note; mode.value = it.mode; pos.value = it.pos; op.value = it.opacity; sc.value = it.scale;
      pos.disabled = sc.disabled = it.mode !== 'overlay';
      const persist = () => DB.put('media', it);
      inNote.addEventListener('input', () => { it.note = inNote.value.trim(); setNote(); });
      inNote.addEventListener('change', persist);
      mode.addEventListener('change', () => {
        it.mode = mode.value;
        if (it.mode === 'bg') mediaItems.forEach(o => { if (o !== it && o.mode === 'bg') { o.mode = 'off'; DB.put('media', o); } });
        persist(); renderMediaList(); renderMediaLayers();
      });
      pos.addEventListener('change', () => { it.pos = pos.value; persist(); renderMediaLayers(); });
      op.addEventListener('input', () => { it.opacity = +op.value; renderMediaLayers(); });
      op.addEventListener('change', persist);
      sc.addEventListener('input', () => { it.scale = +sc.value; renderMediaLayers(); });
      sc.addEventListener('change', persist);
      $('.x', item).addEventListener('click', async () => {
        if (!confirm('„' + it.name + '“ wirklich löschen?')) return;
        await DB.del('media', it.id);
        if (mediaUrls.has(it.id)) { URL.revokeObjectURL(mediaUrls.get(it.id)); mediaUrls.delete(it.id); }
        mediaItems = mediaItems.filter(o => o !== it);
        renderMediaList(); renderMediaLayers();
      });
      list.appendChild(item);
    }
    updateStorageInfo();
  }
  async function addMediaFiles(files) {
    for (const f of files) {
      if (!/^(image|video)\//.test(f.type)) { toast('„' + f.name + '“ ist kein Bild/Video'); continue; }
      if (f.size > 150 * 1048576) { toast('„' + f.name + '“ ist größer als 150 MB'); continue; }
      const blob = f.type === 'image/gif' || f.type.startsWith('video/') ? f : await downscaleImage(f, 3040);
      const it = {
        id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        name: f.name, type: blob.type || f.type, size: blob.size, blob,
        note: '', mode: 'off', opacity: 1, pos: 'br', scale: 30, added: Date.now()
      };
      mediaItems.push(it);
      await DB.put('media', it);
    }
    renderMediaList(); renderMediaLayers();
    if (!DB.ok) toast('Browser-Speicher nicht verfügbar – Medien gelten nur bis zum Neustart.');
  }
  async function updateStorageInfo() {
    const el = $('#storageInfo');
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const e = await navigator.storage.estimate();
        el.textContent = 'Belegt: ' + (e.usage / 1048576).toFixed(1) + ' MB von ca. ' + (e.quota / 1073741824).toFixed(1) + ' GB.' + (DB.ok ? '' : ' (IndexedDB nicht verfügbar)');
      }
    } catch (e) { /* ignorieren */ }
  }

  /* =========================================================
     Szene: Partikel, Glitzersterne, Fantasie-Wesen
     ========================================================= */
  const Scene = (() => {
    const cv = $('#scene');
    const ctx = cv.getContext('2d');
    let W = 0, H = 0, dpr = 1;
    let parts = [], bursts = [], rings = [], arc = null, arcWait = 3;
    let creatures = [], spriteCache = {}, ps = 4, feetY = 0;
    let glowCache = {}, starCache = {};
    let last = performance.now(), acc = 0, running = true;

    /* --- vorgerenderte Sprites --- */
    function glow(color) {
      if (glowCache[color]) return glowCache[color];
      const s = 64, c = document.createElement('canvas');
      c.width = c.height = s;
      const g = c.getContext('2d');
      const rg = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      rg.addColorStop(0, '#ffffff');
      rg.addColorStop(0.15, color);
      rg.addColorStop(0.45, color + '55');
      rg.addColorStop(1, color + '00');
      g.fillStyle = rg; g.fillRect(0, 0, s, s);
      return (glowCache[color] = c);
    }
    function star(color) {
      if (starCache[color]) return starCache[color];
      const s = 96, c = document.createElement('canvas');
      c.width = c.height = s;
      const g = c.getContext('2d'), m = s / 2;
      const rg = g.createRadialGradient(m, m, 0, m, m, m * 0.6);
      rg.addColorStop(0, color + 'aa'); rg.addColorStop(1, color + '00');
      g.fillStyle = rg; g.fillRect(0, 0, s, s);
      // vierzackiger Glitzerstern wie im Logo
      g.beginPath();
      const r = m * 0.95, w = m * 0.13;
      g.moveTo(m, m - r);
      g.quadraticCurveTo(m + w, m - w, m + r, m);
      g.quadraticCurveTo(m + w, m + w, m, m + r);
      g.quadraticCurveTo(m - w, m + w, m - r, m);
      g.quadraticCurveTo(m - w, m - w, m, m - r);
      g.closePath();
      g.fillStyle = '#ffffff'; g.shadowColor = color; g.shadowBlur = 10; g.fill();
      return (starCache[color] = c);
    }

    /* --- Fantasie-Wesen (eigene Pixel-Figuren) ---
       Zeilen mit halber Breite werden gespiegelt. */
    const CREATURES = {
      glimmi: { // kleiner Glitzer-Schleim, hüpft
        w: 14,
        body: ['......3', '.....33', '......3', '...oooo', '..o1111', '.o11111', '.o1w111', 'o111111', 'o11kk11', 'o11kw11', 'o1p1111', 'o11111k', 'o222222', '.o22222', '..ooooo'],
        sleep: { 8: 'o111111', 9: 'o1kkk11' },
        legs: [[], []],
        colors: (t) => ({ 1: t.c1, 2: t.c2, 3: t.c3, o: mix(t.c1, '#000000', 0.45) }),
        speed: [16, 24], hop: true
      },
      kartini: { // laufende Sammelkarte
        w: 12,
        body: ['oooooo', 'o33333', 'o3w333', 'o11111', 'o1kk11', 'o1kw11', 'o11111', 'o1p11k', 'o11111', 'o22222', 'o2w222', 'oooooo'],
        sleep: { 4: 'o11111', 5: 'o1kkk1' },
        legs: [['..o......o..', '.oo......oo.'], ['...o....o...', '...oo...oo..']],
        colors: (t) => ({ 1: mix(t.c3, '#ffffff', 0.82), 2: t.c1, 3: t.c3, o: mix(t.c1, '#000000', 0.35) }),
        speed: [20, 30]
      },
      schluesselkaefer: { // Käfer mit Schlüsselloch auf dem Panzer
        w: 14,
        body: ['.o.....', '..o....', '...oooo', '..o3333', '..o3k33', '..ooooo', '.o11111', 'o1w1111', 'o11111k', 'o1111kk', 'o11111k', 'o11111k', '.o1111k', '..ooooo'],
        sleep: { 4: '..o3o33' },
        legs: [['.o.o......o.o.'], ['o..o......o..o']],
        colors: (t) => ({ 1: t.c2, 3: t.c3, k: '#05020a', o: mix(t.c2, '#000000', 0.4) }),
        speed: [9, 14]
      },
      doesel: { // flauschiger Schlafball
        w: 14,
        body: ['...oo..', '..o11o.', '..o111o', '.o11111', 'o111111', 'o1kk111', 'o1kw111', 'o1p1111', 'o11111k', 'o222222', '.o22222', '..ooooo'],
        sleep: { 5: 'o111111', 6: 'o1kkk11' },
        legs: [[], []],
        colors: (t) => ({ 1: mix(t.c3, '#ffffff', 0.35), 2: t.c1, o: mix(t.c1, '#000000', 0.4) }),
        speed: [8, 12], sleepy: true
      }
    };
    const FIXED = { w: '#ffffff', k: '#0b0614', p: '#ff8fc7' };

    function expandRow(row, w) {
      if (row.length >= w) return row.slice(0, w);
      if (row.length * 2 === w) return row + row.split('').reverse().join('');
      return row.padEnd(w, '.');
    }
    function renderSprite(def, colors, sleeping, legRows) {
      const rows = def.body.map((r, i) => expandRow(sleeping && def.sleep[i] ? def.sleep[i] : r, def.w)).concat(legRows.map(r => expandRow(r, def.w)));
      const c = document.createElement('canvas');
      c.width = def.w; c.height = rows.length;
      const g = c.getContext('2d');
      rows.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          const ch = row[x];
          if (ch === '.') continue;
          g.fillStyle = colors[ch] || FIXED[ch] || '#ffffff';
          g.fillRect(x, y, 1, 1);
        }
      });
      return c;
    }
    function buildSprites() {
      const t = THEMES[S.theme] || THEMES.rkc;
      spriteCache = {};
      for (const [k, def] of Object.entries(CREATURES)) {
        const colors = def.colors(t);
        const maxLegs = Math.max(def.legs[0].length, def.legs[1].length);
        const pad = (l) => l.concat(Array(maxLegs - l.length).fill(''));
        spriteCache[k] = {
          walk: [renderSprite(def, colors, false, pad(def.legs[0])), renderSprite(def, colors, false, pad(def.legs[1]))],
          sleep: renderSprite(def, colors, true, pad(def.legs[0]))
        };
      }
    }
    function initCreatures() {
      const kinds = ['glimmi', 'kartini', 'schluesselkaefer', 'doesel'];
      creatures = kinds.map((k, i) => {
        const def = CREATURES[k];
        return {
          kind: k, def,
          x: W * (0.12 + i * 0.25) + rand(-20, 20),
          dir: Math.random() < 0.5 ? -1 : 1,
          speed: rand(def.speed[0], def.speed[1]),
          state: def.sleepy || reduced ? 'sleep' : 'walk',
          timer: def.sleepy ? rand(20, 50) : rand(10, 25),
          phase: rand(0, 10)
        };
      });
    }

    /* --- Partikel je Farbwelt --- */
    function spec() {
      switch (S.theme) {
        case 'fire': return [['ember', 70], ['star', 10], ['orb', 6]];
        case 'water': return [['bubble', 38], ['star', 10], ['orb', 9]];
        case 'plant': return [['leaf', 22], ['firefly', 22], ['star', 9]];
        case 'blitz': return [['spark', 44], ['star', 14], ['orb', 5]];
        case 'psycho': return [['swirl', 50], ['star', 14], ['orb', 6]];
        default: return [['star', 26], ['orb', 14], ['dust', 40]];
      }
    }
    function colorsOf() {
      const t = THEMES[S.theme] || THEMES.rkc;
      return [t.c1, t.c2, t.c3];
    }
    function newPart(type, init) {
      const cols = colorsOf();
      const p = { type, color: pick(cols), phase: rand(0, Math.PI * 2), x: rand(0, W), y: rand(0, H) };
      switch (type) {
        case 'star': p.size = rand(8, 20); p.speed = rand(0.25, 0.6); p.vx = rand(-3, 3); p.vy = rand(-3, 3); p.color = Math.random() < 0.4 ? '#ffffff' : p.color; break;
        case 'orb': p.size = rand(90, 220); p.vx = rand(-6, 6); p.vy = rand(-5, 5); p.alpha = rand(0.05, 0.13); break;
        case 'dust': p.size = rand(4, 9); p.vx = rand(-5, 5); p.vy = rand(-8, -2); p.alpha = rand(0.25, 0.6); break;
        case 'ember': p.size = rand(5, 13); p.vy = -rand(14, 40); p.sway = rand(6, 20); p.life = rand(6, 14); p.age = init ? rand(0, p.life) : 0; if (!init) p.y = H + 10; p.color = pick([cols[0], cols[2], cols[0], '#ffd27a']); break;
        case 'bubble': p.r = rand(4, 15); p.vy = -rand(10, 28); p.sway = rand(4, 14); if (!init) p.y = H + 20; break;
        case 'leaf': p.size = rand(9, 18); p.vy = rand(8, 18); p.sway = rand(15, 40); p.rot = rand(0, 6.3); p.vr = rand(-0.6, 0.6); if (!init) p.y = -20; break;
        case 'firefly': p.size = rand(10, 20); p.vx = rand(-8, 8); p.vy = rand(-6, 6); p.color = pick([cols[2], cols[2], '#f6ff9a']); break;
        case 'spark': p.size = rand(5, 12); p.vx = rand(-6, 6); p.vy = rand(-6, 6); p.color = pick([cols[0], cols[2], '#ffffff', cols[1]]); break;
        case 'swirl': p.cx = rand(0.1, 0.9) * W; p.cy = rand(0.1, 0.9) * H; p.rad = rand(20, 110); p.ang = rand(0, 6.3); p.va = rand(0.1, 0.35) * (Math.random() < 0.5 ? -1 : 1); p.size = rand(6, 14); break;
      }
      return p;
    }
    function areaFactor() { return clamp((W * H) / (869 * 411), 0.6, 1.8); }
    function initParticles() {
      parts = [];
      const k = areaFactor() * (reduced ? 0.45 : 1);
      for (const [type, n] of spec()) for (let i = 0; i < Math.round(n * k); i++) parts.push(newPart(type, true));
      rings = []; arc = null; arcWait = rand(3, 6);
    }

    function updateDraw(dt, t) {
      const slow = reduced ? 0.35 : 1;
      const d = dt * slow;
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';

      if (S.modules.particles) {
        for (let i = 0; i < parts.length; i++) {
          const p = parts[i];
          switch (p.type) {
            case 'star': {
              p.phase += d * p.speed * 1.6;
              p.x += p.vx * d; p.y += p.vy * d;
              const tw = Math.sin(p.phase);
              if (tw < -0.98 && Math.random() < 0.05) { Object.assign(p, newPart('star', true)); }
              const a = Math.max(0, tw) ** 1.5;
              if (a > 0.01) {
                const s = p.size * (0.6 + a * 0.6);
                ctx.globalAlpha = a * 0.95;
                ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.phase * 0.08);
                ctx.drawImage(star(p.color), -s, -s, s * 2, s * 2);
                ctx.restore();
              }
              break;
            }
            case 'orb':
              p.x += p.vx * d; p.y += p.vy * d; p.phase += d * 0.3;
              wrap(p, p.size);
              ctx.globalAlpha = p.alpha * (0.7 + 0.3 * Math.sin(p.phase));
              ctx.drawImage(glow(p.color), p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
              break;
            case 'dust':
              p.x += p.vx * d; p.y += p.vy * d; p.phase += d;
              wrap(p, 10);
              ctx.globalAlpha = p.alpha * (0.6 + 0.4 * Math.sin(p.phase * 1.3));
              ctx.drawImage(glow(p.color), p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
              break;
            case 'ember': {
              p.age += d; p.y += p.vy * d; p.phase += d * 1.5;
              const x = p.x + Math.sin(p.phase) * p.sway;
              const lifeT = p.age / p.life;
              if (lifeT >= 1 || p.y < -20) { Object.assign(p, newPart('ember', false)); break; }
              const fl = 0.75 + 0.25 * Math.sin(p.phase * 4.3);
              const s = p.size * (1 - lifeT * 0.6);
              ctx.globalAlpha = Math.min(1, (1 - lifeT) * 1.4) * fl * 0.85;
              ctx.drawImage(glow(p.color), x - s, p.y - s, s * 2, s * 2);
              break;
            }
            case 'bubble': {
              p.y += p.vy * d; p.phase += d * 1.2;
              const x = p.x + Math.sin(p.phase) * p.sway;
              if (p.y < -30) { Object.assign(p, newPart('bubble', false)); break; }
              ctx.globalCompositeOperation = 'source-over';
              ctx.globalAlpha = 0.55;
              ctx.strokeStyle = p.color; ctx.lineWidth = 1.5;
              ctx.beginPath(); ctx.arc(x, p.y, p.r, 0, Math.PI * 2); ctx.stroke();
              ctx.globalAlpha = 0.8; ctx.fillStyle = '#ffffff';
              ctx.beginPath(); ctx.arc(x - p.r * 0.35, p.y - p.r * 0.35, Math.max(1, p.r * 0.18), 0, Math.PI * 2); ctx.fill();
              ctx.globalCompositeOperation = 'lighter';
              break;
            }
            case 'leaf': {
              p.y += p.vy * d; p.phase += d * 0.8; p.rot += p.vr * d;
              const x = p.x + Math.sin(p.phase) * p.sway;
              if (p.y > H + 30) { Object.assign(p, newPart('leaf', false)); break; }
              ctx.globalCompositeOperation = 'source-over';
              ctx.globalAlpha = 0.7;
              ctx.save(); ctx.translate(x, p.y); ctx.rotate(p.rot + Math.sin(p.phase) * 0.6);
              const s = p.size;
              ctx.fillStyle = p.color;
              ctx.beginPath(); ctx.moveTo(0, -s); ctx.quadraticCurveTo(s * 0.7, 0, 0, s); ctx.quadraticCurveTo(-s * 0.7, 0, 0, -s); ctx.fill();
              ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1;
              ctx.beginPath(); ctx.moveTo(0, -s * 0.85); ctx.lineTo(0, s * 0.9); ctx.stroke();
              ctx.restore();
              ctx.globalCompositeOperation = 'lighter';
              break;
            }
            case 'firefly':
              p.phase += d * 0.9;
              p.vx += rand(-4, 4) * d; p.vy += rand(-4, 4) * d;
              p.vx = clamp(p.vx, -12, 12); p.vy = clamp(p.vy, -10, 10);
              p.x += p.vx * d; p.y += p.vy * d; wrap(p, 20);
              ctx.globalAlpha = 0.25 + 0.6 * Math.max(0, Math.sin(p.phase));
              ctx.drawImage(glow(p.color), p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
              break;
            case 'spark':
              p.phase += d * 2;
              p.x += (p.vx + Math.sin(p.phase * 1.7) * 4) * d; p.y += (p.vy + Math.cos(p.phase * 1.3) * 4) * d; wrap(p, 10);
              ctx.globalAlpha = 0.45 + 0.4 * Math.sin(p.phase * 2.2);
              ctx.drawImage(glow(p.color), p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
              break;
            case 'swirl': {
              p.ang += p.va * d; p.phase += d * 0.4;
              const r = p.rad * (0.75 + 0.25 * Math.sin(p.phase));
              const x = p.cx + Math.cos(p.ang) * r, y = p.cy + Math.sin(p.ang) * r * 0.7;
              ctx.globalAlpha = 0.5 + 0.3 * Math.sin(p.phase * 2);
              ctx.drawImage(glow(p.color), x - p.size, y - p.size, p.size * 2, p.size * 2);
              break;
            }
          }
        }
        if (!reduced) themeExtras(d);
      }

      // Feier-Glitzer (Ziel erreicht)
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i];
        b.age += dt;
        if (b.age > b.life) { bursts.splice(i, 1); continue; }
        b.vx *= 1 - 1.2 * dt; b.vy = b.vy * (1 - 1.2 * dt) + 10 * dt;
        b.x += b.vx * dt; b.y += b.vy * dt;
        const a = 1 - b.age / b.life;
        ctx.globalAlpha = a;
        const s = b.size * (0.6 + 0.4 * Math.sin(b.age * 6));
        ctx.drawImage(star(b.color), b.x - s, b.y - s, s * 2, s * 2);
      }

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      if (S.modules.creatures) drawCreatures(dt, t);
    }
    function wrap(p, m) {
      if (p.x < -m) p.x = W + m; else if (p.x > W + m) p.x = -m;
      if (p.y < -m) p.y = H + m; else if (p.y > H + m) p.y = -m;
    }

    // Sanfte Zusatzeffekte: Blitzbögen (ohne Flackern) bzw. Psycho-Ringe
    function themeExtras(d) {
      const cols = colorsOf();
      if (S.theme === 'blitz') {
        if (!arc) {
          arcWait -= d;
          if (arcWait <= 0) {
            const x1 = rand(0.1, 0.9) * W, y1 = rand(0.1, 0.9) * H;
            const ang = rand(0, Math.PI * 2), len = rand(80, 220);
            arc = { x1, y1, x2: x1 + Math.cos(ang) * len, y2: y1 + Math.sin(ang) * len, age: 0, life: 1.6, pts: null, jit: 0 };
          }
        } else {
          arc.age += d; arc.jit -= d;
          if (!arc.pts || arc.jit <= 0) {
            arc.jit = 0.18; arc.pts = [];
            const n = 9;
            for (let i = 0; i <= n; i++) {
              const t = i / n, off = (i === 0 || i === n) ? 0 : rand(-14, 14);
              const nx = -(arc.y2 - arc.y1), ny = arc.x2 - arc.x1, nl = Math.hypot(nx, ny) || 1;
              arc.pts.push([arc.x1 + (arc.x2 - arc.x1) * t + nx / nl * off, arc.y1 + (arc.y2 - arc.y1) * t + ny / nl * off]);
            }
          }
          const a = Math.sin(Math.PI * Math.min(1, arc.age / arc.life)) * 0.45;
          ctx.globalAlpha = a;
          ctx.strokeStyle = cols[2]; ctx.lineWidth = 2; ctx.lineJoin = 'round';
          ctx.shadowColor = cols[1]; ctx.shadowBlur = 12;
          ctx.beginPath(); arc.pts.forEach((pt, i) => i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1])); ctx.stroke();
          ctx.shadowBlur = 0;
          if (arc.age >= arc.life) { arc = null; arcWait = rand(3, 7); }
        }
      } else if (S.theme === 'psycho') {
        arcWait -= d;
        if (arcWait <= 0 && rings.length < 3) { rings.push({ x: rand(0.1, 0.9) * W, y: rand(0.1, 0.9) * H, age: 0, life: 5, color: pick(cols) }); arcWait = rand(2.5, 5); }
        for (let i = rings.length - 1; i >= 0; i--) {
          const r = rings[i]; r.age += d;
          if (r.age > r.life) { rings.splice(i, 1); continue; }
          const t = r.age / r.life;
          ctx.globalAlpha = Math.sin(Math.PI * t) * 0.3;
          ctx.strokeStyle = r.color; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(r.x, r.y, 10 + t * 140, 0, Math.PI * 2); ctx.stroke();
        }
      }
    }

    function drawCreatures(dt, t) {
      if (!feetY) return;
      ctx.imageSmoothingEnabled = false;
      const font = 'bold ' + Math.round(ps * 3) + 'px Orbitron, sans-serif';
      for (const c of creatures) {
        const sp = spriteCache[c.kind];
        if (!sp) continue;
        c.timer -= dt;
        if (c.timer <= 0) {
          if (c.state === 'walk') { c.state = 'sleep'; c.timer = c.def.sleepy ? rand(30, 70) : rand(8, 20); }
          else if (!reduced) { c.state = 'walk'; c.timer = c.def.sleepy ? rand(5, 10) : rand(12, 30); if (Math.random() < 0.3) c.dir *= -1; }
          else c.timer = 30;
        }
        const img0 = sp.walk[0];
        const w = img0.width * ps, h = img0.height * ps;
        let yOff = 0, img = sp.sleep, sy = 1;
        if (c.state === 'walk') {
          c.phase += dt * c.speed / (ps * 3);
          c.x += c.dir * c.speed * dt;
          const margin = w * 0.7;
          if (c.x < margin) { c.x = margin; c.dir = 1; }
          if (c.x > W - margin) { c.x = W - margin; c.dir = -1; }
          img = sp.walk[Math.floor(c.phase * 2) % 2];
          if (c.def.hop) yOff = -Math.abs(Math.sin(c.phase * Math.PI)) * ps * 3;
          else yOff = -Math.abs(Math.sin(c.phase * Math.PI * 2)) * ps * 0.6;
        } else {
          c.phase += dt;
          sy = 1 + Math.sin(c.phase * 1.6) * 0.035;
        }
        const x = Math.round(c.x - w / 2), base = feetY;
        // sanfter Schein unter dem Wesen
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.22;
        const gl = glow(colorsOf()[0]);
        ctx.drawImage(gl, c.x - w * 0.7, base - ps * 2, w * 1.4, ps * 4);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        const hh = h * sy;
        ctx.drawImage(img, x, Math.round(base - hh + yOff), w, hh);
        if (c.state === 'sleep') {
          ctx.font = font;
          ctx.fillStyle = '#ffffff';
          for (let i = 0; i < 3; i++) {
            const k = ((t / 1000 * 0.35) + i / 3) % 1;
            ctx.globalAlpha = Math.sin(Math.PI * k) * 0.85;
            ctx.font = 'bold ' + Math.round(ps * (2 + k * 2)) + 'px Orbitron, sans-serif';
            ctx.fillText('z', c.x + w * 0.35 + k * ps * 4, base - h - k * ps * 7);
          }
          ctx.globalAlpha = 1;
        }
      }
      ctx.imageSmoothingEnabled = true;
    }

    function measure() {
      const ground = $('.ground');
      const r = ground.getBoundingClientRect();
      feetY = r.height > 4 ? r.bottom - Math.max(4, ps) : 0;
    }
    function resize() {
      const cap = S.perf === 'eco' ? 1.5 : 4;
      dpr = Math.min(window.devicePixelRatio || 1, cap);
      W = window.innerWidth; H = window.innerHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ps = Math.max(3, Math.round(Math.min(W, H) * 0.0095));
      const maxRows = Math.max(...Object.values(CREATURES).map(d => d.body.length + Math.max(d.legs[0].length, d.legs[1].length)));
      document.documentElement.style.setProperty('--ground', (maxRows * ps + ps * 2) + 'px');
      requestAnimationFrame(measure);
    }
    function rebuild() {
      if (!W) return;
      glowCache = {}; starCache = {};
      buildSprites();
      initParticles();
      creatures.forEach(c => { if (reduced) c.state = 'sleep'; });
    }
    function frame(now) {
      if (!running) return;
      requestAnimationFrame(frame);
      const fps = S.perf === 'high' ? 60 : 30;
      const elapsed = now - last;
      if (elapsed < 1000 / fps - 3) return;
      last = now;
      const dt = Math.min(0.1, elapsed / 1000);
      updateDraw(dt, now);
    }
    function start() {
      resize(); buildSprites(); initParticles(); initCreatures();
      requestAnimationFrame(frame);
    }
    function burst(x, y) {
      const cols = colorsOf().concat(['#ffffff']);
      const n = reduced ? 16 : 46;
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2), v = rand(60, 260) * (reduced ? 0.4 : 1);
        bursts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, age: 0, life: rand(1.8, 3.2), size: rand(8, 20), color: pick(cols) });
      }
    }
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) { last = performance.now(); }
    });
    return { start, resize, rebuild, burst, measure, setRunning(v) { running = v; } };
  })();

  function celebrate(el) {
    const r = el.getBoundingClientRect();
    Scene.burst(r.left + r.width / 2, r.top + r.height / 2);
    toast('✦ Tagesziel erreicht! Danke euch! ✦', 4000);
  }

  /* =========================================================
     Bedienung: Schnellleiste, Menü, automatisches Ausblenden
     ========================================================= */
  const quick = $('#quickbar'), drawer = $('#drawer'), menuBtn = $('#menuBtn');
  let quickTimer = 0, drawerTimer = 0;
  const QUICK_MS = 6000, DRAWER_MS = 25000;

  function showQuick() {
    quick.classList.remove('ui-hidden'); menuBtn.classList.remove('ui-hidden');
    clearTimeout(quickTimer);
    quickTimer = setTimeout(hideQuick, QUICK_MS);
  }
  function hideQuick() {
    quick.classList.add('ui-hidden');
    if (drawer.classList.contains('ui-hidden')) menuBtn.classList.add('ui-hidden');
  }
  function openMenu() {
    hideQuick();
    drawer.classList.remove('ui-hidden');
    menuBtn.classList.add('ui-hidden');
    bumpDrawer();
    updateStorageInfo();
  }
  function closeMenu() {
    drawer.classList.add('ui-hidden');
    if (document.activeElement && drawer.contains(document.activeElement)) document.activeElement.blur();
    clearTimeout(drawerTimer);
  }
  function bumpDrawer() {
    clearTimeout(drawerTimer);
    drawerTimer = setTimeout(() => {
      const a = document.activeElement;
      // Nicht verstecken, solange gerade getippt wird
      if (a && drawer.contains(a) && /INPUT|SELECT|TEXTAREA/.test(a.tagName) && a.type !== 'range' && a.type !== 'checkbox') { bumpDrawer(); return; }
      closeMenu();
    }, DRAWER_MS);
  }
  ['pointerdown', 'input', 'keydown', 'scroll'].forEach(ev => drawer.addEventListener(ev, bumpDrawer, { passive: true, capture: true }));
  quick.addEventListener('pointerdown', () => { clearTimeout(quickTimer); quickTimer = setTimeout(hideQuick, QUICK_MS); }, { passive: true });

  // Fingertipp auf die Anzeige
  document.addEventListener('click', (e) => {
    if (e.target.closest('#quickbar, #drawer, #menuBtn')) return;
    if (!drawer.classList.contains('ui-hidden')) { closeMenu(); return; }
    if (quick.classList.contains('ui-hidden')) showQuick(); else hideQuick();
  });

  // Aktionen über data-act
  const ACTIONS = {
    menu: openMenu, closeMenu,
    goalUndo, timerToggle, timerReset,
    themeNext() { S.theme = THEME_ORDER[(THEME_ORDER.indexOf(S.theme) + 1) % THEME_ORDER.length]; save(); applyTheme(); },
    fullscreen: goFullscreen
  };
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (a && ACTIONS[a.dataset.act]) ACTIONS[a.dataset.act]();
    const g = e.target.closest('[data-goal]');
    if (g) goalAdd(+g.dataset.goal);
    const pr = e.target.closest('[data-preset]');
    if (pr) timerSet(+pr.dataset.preset);
  });

  // Tabs
  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    $$('#tabs button').forEach(x => x.classList.toggle('active', x === b));
    $$('.tab').forEach(p => { p.hidden = p.dataset.panel !== b.dataset.tab; });
    $('.drawer-body').scrollTop = 0;
  });

  function buildModuleToggles() {
    const mk = (container, cls) => {
      container.innerHTML = '';
      for (const [key, label] of MODULES) {
        const b = document.createElement('button');
        b.className = 'chip ' + cls;
        b.dataset.modToggle = key;
        b.textContent = label;
        b.addEventListener('click', () => {
          S.modules[key] = !S.modules[key]; save(); applyModules();
          if (key === 'qr' && S.modules.qr && !S.qr.url.trim()) toast('QR-Link im Menü unter „QR“ eintragen');
          if (key === 'lastSold' && S.modules.lastSold && !S.lastSold.trim()) toast('Text unter „Texte → Zuletzt verkauft“ eintragen');
          if (key === 'creatures') requestAnimationFrame(Scene.measure);
        });
        container.appendChild(b);
      }
    };
    mk($('#moduleToggles'), '');
    mk($('#qbModules'), '');
  }

  function buildThemeGrid() {
    const grid = $('#themeGrid');
    for (const key of THEME_ORDER) {
      const t = THEMES[key];
      const b = document.createElement('button');
      b.className = 'theme-btn';
      b.dataset.theme = key;
      b.style.background = `linear-gradient(135deg, ${t.deep}, ${t.c1} 55%, ${t.c3})`;
      b.innerHTML = `<span></span><small></small>`;
      b.firstChild.textContent = t.name;
      b.lastChild.textContent = t.sub;
      b.addEventListener('click', () => { S.theme = key; save(); applyTheme(); });
      grid.appendChild(b);
    }
  }

  function bindInputs() {
    // Design
    const sb = $('#sceneBrightness'), ub = $('#uiBrightness');
    sb.value = S.sceneBrightness; ub.value = S.uiBrightness;
    sb.addEventListener('input', () => { S.sceneBrightness = +sb.value; applyBrightness(); save(); });
    ub.addEventListener('input', () => { S.uiBrightness = +ub.value; applyBrightness(); save(); });
    const mm = $('#motionMode'); mm.value = S.motion;
    mm.addEventListener('change', () => { S.motion = mm.value; save(); applyMotion(); });
    const pm = $('#perfMode'); pm.value = S.perf;
    pm.addEventListener('change', () => { S.perf = pm.value; save(); Scene.resize(); Scene.rebuild(); });
    const bi = $('#burnIn'); bi.checked = S.burnIn;
    bi.addEventListener('change', () => { S.burnIn = bi.checked; save(); applyMotion(); });

    // Schaufenster
    const n = $('#inScName'), c = $('#inScCond'), p = $('#inScPrice');
    n.value = S.showcase.name; c.value = S.showcase.cond; p.value = S.showcase.price;
    n.addEventListener('input', () => { S.showcase.name = n.value; save(); renderShowcase(); });
    c.addEventListener('input', () => { S.showcase.cond = c.value; save(); renderShowcase(); });
    p.addEventListener('input', () => { S.showcase.price = p.value; save(); renderShowcase(); });
    $('#inScPhoto').addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      const blob = await downscaleImage(f, 2000);
      await DB.put('kv', blob, 'showcasePhoto');
      setShowcasePhoto(blob);
      if (!DB.ok) toast('Foto wird nur bis zum Neustart behalten (kein Browser-Speicher).');
    });
    $('#btnScPhotoRemove').addEventListener('click', async () => { await DB.del('kv', 'showcasePhoto'); setShowcasePhoto(null); });
    $('#btnScSold').addEventListener('click', () => {
      const name = S.showcase.name.trim();
      if (!name) { toast('Erst einen Kartennamen eintragen'); return; }
      const price = fmtPrice(S.showcase.price);
      S.lastSold = price ? name + ' – ' + price : name;
      S.modules.lastSold = true;
      $('#inLastSold').value = S.lastSold;
      save(); renderLastSold(true); applyModules();
      toast('Bei „Zuletzt verkauft“ eingetragen');
    });
    $('#btnScClear').addEventListener('click', () => {
      S.showcase = { name: '', cond: '', price: '' };
      n.value = c.value = p.value = '';
      save(); renderShowcase();
    });

    // Ziel
    const gt = $('#inGoalTarget'), gc = $('#inGoalCurrent');
    gt.addEventListener('change', () => { const v = parseNum(gt.value); if (isFinite(v) && v > 0) { G.target = round2(v); goalWasReached = G.current >= G.target; save(); } renderGoal(); });
    gc.addEventListener('change', () => { const v = parseNum(gc.value); if (isFinite(v) && v >= 0) { G.history.push(G.current); G.current = round2(v); save(); } renderGoal(); });
    $('#btnGoalAdd').addEventListener('click', () => { const v = parseNum($('#inGoalAdd').value); if (isFinite(v)) { goalAdd(v); $('#inGoalAdd').value = ''; } });
    $('#btnGoalReset').addEventListener('click', () => {
      if (!confirm('Tagesstand wirklich auf 0 € setzen?')) return;
      G.history.push(G.current); G.current = 0; goalWasReached = false; save(); renderGoal();
    });

    // Timer
    $('#inTimerMin').value = Math.floor(T.duration / 60000);
    $('#inTimerSec').value = Math.floor(T.duration / 1000) % 60;
    $('#btnTimerSet').addEventListener('click', () => {
      const m = parseNum($('#inTimerMin').value) || 0, s = parseNum($('#inTimerSec').value) || 0;
      timerSet(m * 60 + s);
      toast('Countdown auf ' + fmtTime(T.duration) + ' gestellt');
    });
    const ts = $('#timerSound'); ts.checked = T.sound;
    ts.addEventListener('change', () => { T.sound = ts.checked; save(); if (ts.checked) unlockAudio(); });
    $('#btnSoundTest').addEventListener('click', () => { unlockAudio(); setTimeout(chime, 50); });
    const cs = $('#clockSeconds'), cd = $('#clockDateOn');
    cs.checked = S.clockSeconds; cd.checked = S.clockDate;
    cs.addEventListener('change', () => { S.clockSeconds = cs.checked; save(); applyClockOpts(); });
    cd.addEventListener('change', () => { S.clockDate = cd.checked; save(); applyClockOpts(); });

    // Texte
    const bi2 = $('#bannerInterval'); bi2.value = S.bannerInterval; $('#outBannerInt').textContent = S.bannerInterval;
    bi2.addEventListener('input', () => { S.bannerInterval = +bi2.value; $('#outBannerInt').textContent = bi2.value; save(); });
    bi2.addEventListener('change', () => showNextBanner(true));
    $('#btnBannerAdd').addEventListener('click', () => { S.banners.push(''); save(); renderBannerList(); const ins = $$('#bannerList input'); ins[ins.length - 1].focus(); });
    const ls = $('#inLastSold'); ls.value = S.lastSold;
    ls.addEventListener('input', () => { S.lastSold = ls.value; save(); renderLastSold(false); requestAnimationFrame(fitAll); });
    ls.addEventListener('change', () => renderLastSold(true));
    const tl = $('#inTagline'); tl.value = S.tagline;
    tl.addEventListener('input', () => { S.tagline = tl.value; save(); renderTagline(); });

    // Medien
    $('#inMedia').addEventListener('change', async (e) => { const files = Array.from(e.target.files || []); e.target.value = ''; await addMediaFiles(files); });

    // QR
    const qu = $('#inQrUrl'), ql = $('#inQrLabel');
    qu.value = S.qr.url; ql.value = S.qr.label;
    qu.addEventListener('input', () => { S.qr.url = qu.value; save(); renderQR(); });
    ql.addEventListener('input', () => { S.qr.label = ql.value; save(); renderQR(); });

    // System
    const wl = $('#wakeLockOn'); wl.checked = S.wakeLock;
    wl.addEventListener('change', () => { S.wakeLock = wl.checked; save(); if (wl.checked) requestWakeLock(true); else releaseWakeLock(); });
    $('#btnWakeRetry').addEventListener('click', () => requestWakeLock(true));
    $('#btnResetAll').addEventListener('click', () => {
      if (!confirm('Alle Einstellungen (Texte, Ziel, Timer, Farbwelt …) zurücksetzen?')) return;
      store.remove(KEY);
      location.reload();
    });
  }

  /* =========================================================
     Display wach halten (Screen Wake Lock API)
     ========================================================= */
  let wakeLock = null;
  function setWlStatus(txt) { $('#wlStatus').textContent = txt; }
  async function requestWakeLock(userAction) {
    if (!S.wakeLock) { setWlStatus('ausgeschaltet'); return; }
    if (!('wakeLock' in navigator)) {
      setWlStatus('nicht unterstützt (HTTPS nötig)');
      if (userAction) toast('Wake Lock nicht verfügbar – Seite über HTTPS öffnen.');
      return;
    }
    if (wakeLock && !wakeLock.released) { setWlStatus('aktiv ✓'); return; }
    if (document.visibilityState !== 'visible') return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      setWlStatus('aktiv ✓');
      wakeLock.addEventListener('release', () => { setWlStatus('freigegeben – wird beim Zurückkehren erneuert'); });
    } catch (e) {
      setWlStatus('abgelehnt (' + (e && e.name ? e.name : 'Fehler') + ')');
      if (userAction) toast('Display wach halten wurde abgelehnt. Energiesparmodus aus?');
    }
  }
  async function releaseWakeLock() {
    try { if (wakeLock) await wakeLock.release(); } catch (e) { /* ignorieren */ }
    wakeLock = null; setWlStatus('ausgeschaltet');
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { requestWakeLock(false); renderTimer(); }
  });
  // Manche Browser erlauben Wake Lock / Ton erst nach einer Berührung
  document.addEventListener('pointerdown', () => {
    unlockAudio();
    if (S.wakeLock && (!wakeLock || wakeLock.released)) requestWakeLock(false);
  }, { passive: true });

  /* =========================================================
     Vollbild + Querformat
     ========================================================= */
  async function goFullscreen() {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      }
    } catch (e) { /* ignorieren */ }
    try {
      if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('portrait');
    } catch (e) { /* nur im Vollbild bzw. als installierte App möglich */ }
  }

  /* =========================================================
     Hinweis-Einblendung
     ========================================================= */
  let toastTimer = 0;
  function toast(msg, ms) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms || 2800);
  }

  /* =========================================================
     Service Worker (Offline-Start)
     ========================================================= */
  function registerSW() {
    const el = $('#swStatus');
    if (!('serviceWorker' in navigator) || !(location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      el.textContent = 'nicht verfügbar (nur über HTTPS)';
      return;
    }
    navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' }).then((reg) => {
      el.textContent = 'aktiv ✓';
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) toast('Update geladen – wird beim nächsten Start aktiv.', 4000);
        });
      });
    }).catch(() => { el.textContent = 'Fehler bei der Registrierung'; });
  }

  /* =========================================================
     Start
     ========================================================= */
  function markMissingLogos() {
    $$('img.logo-img').forEach(img => {
      const fail = () => img.classList.add('missing');
      if (img.complete && img.naturalWidth === 0) fail();
      else img.addEventListener('error', fail);
    });
  }

  async function init() {
    markMissingLogos();
    $('#lsStatus').textContent = store.ok ? 'Einstellungen werden gespeichert ✓' : 'nicht verfügbar – Einstellungen nur bis zum Neustart';
    buildModuleToggles();
    buildThemeGrid();
    bindInputs();
    applyClockOpts();
    applyBrightness();
    Scene.start();
    applyMotion();
    applyTheme();
    applyModules();
    renderTagline();
    renderShowcase();
    renderLastSold(false);
    renderGoal();
    renderTimer();
    renderBannerList();
    showNextBanner(true);
    tickClock();
    setInterval(tickClock, 1000);
    setInterval(renderTimer, 200);
    renderQR();

    await DB.open();
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ignorieren */ }
    mediaItems = (await DB.all('media')).sort((a, b) => a.added - b.added);
    renderMediaList(); renderMediaLayers();
    loadShowcasePhoto();

    requestWakeLock(false);
    registerSW();

    let rz = 0;
    const onResize = () => {
      clearTimeout(rz);
      rz = setTimeout(() => { Scene.resize(); Scene.rebuild(); fitAll(); renderQR(); }, 150);
    };
    window.addEventListener('resize', onResize);
    if (screen.orientation) screen.orientation.addEventListener('change', onResize);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitAll);

    // Ladebildschirm ausblenden
    const t0 = performance.now();
    const hideSplash = () => setTimeout(() => $('#splash').classList.add('done'), Math.max(0, 1600 - (performance.now() - t0)));
    if (document.readyState === 'complete') hideSplash(); else window.addEventListener('load', hideSplash);
    setTimeout(() => $('#splash').classList.add('done'), 5000);
  }

  init();
})();
