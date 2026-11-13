'use strict';
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const STORE_KEY = 'pp_state_v1';
  const MAX_CARDS = 10;
  const MAX_AUDIO_SECONDS = 30;
  const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
  const MAX_EMBED_AUDIO_BYTES = 100 * 1024;   // audio that fits inside a share link
  const AUDIO_BITRATE = 8000;                 // bits/s used when recording or re-encoding (voice-quality, keeps links short)
  const LONG_LINK_CHARS = 8000;               // links longer than this may be cut off by chat apps
  const MAX_AUDIO_DATA_CHARS = 1000000;
  const AUDIO_DATA_RE = /^data:(audio\/[a-z0-9.+_\/-]+);base64,[A-Za-z0-9+/=_-]+$/i;
  const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
  const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------- DOM helpers ---------------------------- */
  function append(node, kids) {
    for (const k of kids.flat()) if (k != null && k !== false) node.append(k);
  }
  function el(tag, props = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : String(v));
    }
    append(n, kids);
    return n;
  }
  function svg(tag, attrs = {}, ...kids) {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    for (const k of kids.flat()) if (k != null) n.append(k);
    return n;
  }
  const $ = (id) => document.getElementById(id);

  /* ------------------------------ Icons ------------------------------- */
  const ICONS = {
    trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13', 'M10 11v6', 'M14 11v6'],
    up: ['M12 20V5', 'M6 11l6-6 6 6'],
    down: ['M12 4v15', 'M6 13l6 6 6-6'],
    edit: ['M4 20l1-5L16 4l4 4L9 19z', 'M14 6l4 4'],
    save: ['M5 3h11l4 4v14H5z', 'M8 3v6h8V3', 'M8 21v-7h8v7'],
    x: ['M6 6l12 12', 'M18 6L6 18'],
    plus: ['M12 5v14', 'M5 12h14'],
    lock: ['M7 11h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z', 'M8 11V8a4 4 0 0 1 8 0v3', 'M12 15v2'],
    unlock: ['M7 11h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z', 'M8 11V8a4 4 0 0 1 7.5-2', 'M12 15v2'],
    check: ['M20 6L9 17l-5-5'],
    play: ['M5 3l14 9-14 9V3z'],
    pause: ['M6 4h4v16H6z', 'M14 4h4v16h-4z'],
  };
  function icon(name) {
    const root = svg('svg', {
      viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
      'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true',
    });
    for (const d of ICONS[name]) root.append(svg('path', { d }));
    return root;
  }

  /* ------------------------------ Themes ------------------------------ */
  function petals() {
    const g = [];
    for (let i = 0; i < 5; i++) g.push(svg('ellipse', { cx: 24, cy: 14, rx: 5, ry: 9, transform: `rotate(${i * 72} 24 24)` }));
    g.push(svg('circle', { cx: 24, cy: 24, r: 3 }));
    return g;
  }
  function rays() {
    const g = [svg('circle', { cx: 24, cy: 24, r: 7 })];
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const p = (r) => (24 + Math.cos(a) * r).toFixed(1);
      const q = (r) => (24 + Math.sin(a) * r).toFixed(1);
      g.push(svg('line', { x1: p(12), y1: q(12), x2: p(17), y2: q(17) }));
    }
    return g;
  }
  const THEMES = [
    { id: 'bow', name: 'Ribbon', swatch: '#82261b', line: '#fbeedd', card: '#82261b', ink: '#fbeedd', accent: '#f1e8d3', accentInk: '#7f2419', brand: '#7f2419',
      shapes: () => [svg('path', { d: 'M24 24C18 14 8 14 8 21C8 28 18 28 24 24C30 28 40 28 40 21C40 14 30 14 24 24z' }), svg('path', { d: 'M24 24L16 38' }), svg('path', { d: 'M24 24L32 38' })] },
    { id: 'coffee', name: 'Coffee', swatch: '#6b3f1d', line: '#f1e0c5', card: '#6b3f1d', ink: '#f7ead6', accent: '#f1e0c5', accentInk: '#5a3216', brand: '#6b3f1d',
      shapes: () => [svg('ellipse', { cx: 24, cy: 24, rx: 9, ry: 14, transform: 'rotate(30 24 24)' }), svg('path', { d: 'M17 14C27 20 21 28 31 34' })] },
    { id: 'cloud', name: 'Cloud', swatch: '#a3bce8', line: '#ffffff', card: '#4f74b8', ink: '#ffffff', accent: '#e8f0ff', accentInk: '#2f4f86', brand: '#3f5f9f',
      shapes: () => [svg('path', { d: 'M14 35a7 7 0 0 1 0-14a10 10 0 0 1 19-2a8 8 0 0 1 1 16z' })] },
    { id: 'swirl', name: 'Swirl', swatch: '#e3c49b', line: '#8a3a22', card: '#8b5a2b', ink: '#fff3df', accent: '#f6e5c8', accentInk: '#6b4120', brand: '#8b5a2b',
      shapes: () => [svg('path', { d: 'M24 24a2 2 0 0 1 4 0a5 5 0 0 1-10 0a8 8 0 0 1 16 0a11 11 0 0 1-22 0' })] },
    { id: 'leaf', name: 'Sprig', swatch: '#a9bf7e', line: '#4d5a2a', card: '#5f7a38', ink: '#f4f8e8', accent: '#e6efc9', accentInk: '#3f5224', brand: '#4f6a2c',
      shapes: () => [svg('path', { d: 'M24 40V14' }), svg('path', { d: 'M24 20C16 20 14 14 14 12C20 12 24 15 24 20' }), svg('path', { d: 'M24 20C32 20 34 14 34 12C28 12 24 15 24 20' }), svg('path', { d: 'M24 30C16 30 13 25 13 23C19 23 24 26 24 30' }), svg('path', { d: 'M24 30C32 30 35 25 35 23C29 23 24 26 24 30' })] },
    { id: 'flower', name: 'Flower', swatch: '#e8b9c1', line: '#8f1f2a', card: '#b4506a', ink: '#fff0f3', accent: '#fde2e8', accentInk: '#8f2f4a', brand: '#a3405b', shapes: petals },
    { id: 'sun', name: 'Sun', swatch: '#fdecc3', line: '#e8b24a', card: '#a06a14', ink: '#fff8e6', accent: '#fdecc3', accentInk: '#6b4510', brand: '#8a5a0f', shapes: rays },
    { id: 'moon', name: 'Moon', swatch: '#9b8bbf', line: '#ffffff', card: '#6f5aa3', ink: '#f6f1ff', accent: '#e6dcff', accentInk: '#4a3a78', brand: '#5e4a92',
      shapes: () => [svg('path', { d: 'M30 10A15 15 0 1 0 38 30A12 12 0 0 1 30 10z' })] },
  ];

  /* --------------------------- Card definitions ------------------------ */
  const TYPES = [
    { id: 'code', name: 'Secret code' },
    { id: 'puzzle', name: 'Photo puzzle' },
    { id: 'question', name: 'Little question' },
    { id: 'voice', name: 'Voice' },
    { id: 'message', name: 'Message' },
    { id: 'spin', name: 'Spin to win' },
  ];

  function defaults(type) {
    switch (type) {
      case 'code': return { question: 'When is our anniversary?', code: '0214' };
      case 'puzzle': return { photoData: '' };
      case 'voice': return { audioData: '' };
      case 'question': return { question: 'Where did we first meet?', answer: '' };
      case 'message': return { text: '' };
      case 'spin': return {
        title: 'Spin to win',
        prizes: [{ t: 'Unli Coffee', e: '🧋' }, { t: 'Trip to Boracay', e: '🏝️' }, { t: 'House and Lot', e: '🏠' }, { t: 'Mystery gift', e: '🎁' }],
      };
      default: return {};
    }
  }
  const str = (v, max, fb) => (typeof v === 'string' && v.trim() ? v.slice(0, max) : fb);
  function cleanData(type, d) {
    d = d && typeof d === 'object' ? d : {};
    const def = defaults(type);
    switch (type) {
      case 'code':
        return { question: str(d.question, 60, def.question), code: typeof d.code === 'string' && /^\d{4,8}$/.test(d.code) ? d.code : def.code };
      case 'puzzle':
        return {
          photoData: typeof d.photoData === 'string' &&
            d.photoData.startsWith('data:image/') &&
            d.photoData.length <= 2000000
            ? d.photoData
            : ''
        };
      case 'voice':
        return {
          audioData: typeof d.audioData === 'string' &&
            d.audioData.length <= MAX_AUDIO_DATA_CHARS &&
            (AUDIO_DATA_RE.test(d.audioData) || d.audioData.startsWith('data:audio/'))
            ? d.audioData
            : ''
        };
      case 'question':
        return { question: str(d.question, 80, def.question), answer: typeof d.answer === 'string' ? d.answer.slice(0, 60) : '' };
      case 'message':
        return { text: typeof d.text === 'string' ? d.text.slice(0, 400) : '' };
      case 'spin': {
        const src = Array.isArray(d.prizes) ? d.prizes : [];
        return {
          title: str(d.title, 30, def.title),
          prizes: def.prizes.map((p, i) => {
            const s = src[i] && typeof src[i] === 'object' ? src[i] : {};
            return { t: str(s.t, 40, p.t), e: str(s.e, 8, p.e) };
          }),
        };
      }
      default: return {};
    }
  }

  /* ------------------------------- State ------------------------------ */
  let idCounter = 0;
  const newId = () => `c${Date.now().toString(36)}${(idCounter++).toString(36)}`;
  const newCard = (type) => ({ id: newId(), type, data: defaults(type) });

  const state = { from: '', to: '', theme: 'bow', cards: [], editingId: null, draft: null };
  const rt = {};     // per-card runtime state (not persisted)
  const media = {};  // per-card uploaded media: { url }
  let isRecipientMode = false;
  let linkBroken = false;

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (!raw || typeof raw !== 'object') return;
      if (typeof raw.from === 'string') state.from = raw.from.slice(0, 40);
      if (typeof raw.to === 'string') state.to = raw.to.slice(0, 40);
      if (THEMES.some((t) => t.id === raw.theme)) state.theme = raw.theme;
      if (Array.isArray(raw.cards)) {
        const cards = raw.cards
          .filter((c) => c && TYPES.some((t) => t.id === c.type))
          .slice(0, MAX_CARDS)
          .map((c) => {
            const cardId = newId();
            const clean = cleanData(c.type, c.data);
            restoreMedia(cardId, c.type, clean);
            return { id: cardId, type: c.type, data: clean };
          });
        state.cards = cards;
      }
    } catch { /* ignore corrupt storage */ }
  }
  function save() {
    if (isRecipientMode) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        from: state.from, to: state.to, theme: state.theme,
        cards: state.cards.map((c) => ({ type: c.type, data: c.data })),
      }));
    } catch { /* storage unavailable */ }
  }
  const getRt = (id) => (rt[id] ||= {});

  /* -------------------------- Web Audio Synthesizer ---------------------- */
  let audioCtx = null;
  let soundMuted = false;
  try {
    soundMuted = localStorage.getItem('pp_muted') === '1';
  } catch {}

  function getAudioCtx() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) audioCtx = new AudioContextClass();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  const sfx = {
    pop(freq = 520) {
      if (soundMuted) return;
      const ctx = getAudioCtx();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.09);
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.09);
    },
    click() {
      if (soundMuted) return;
      const ctx = getAudioCtx();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(800, now);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.03);
    },
    tick(freq = 1200) {
      if (soundMuted) return;
      const ctx = getAudioCtx();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.025);
    },
    reelLock(freq = 580) {
      if (soundMuted) return;
      const ctx = getAudioCtx();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + 0.06);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.08);
    },
    jackpot() {
      if (soundMuted) return;
      const ctx = getAudioCtx();
      if (!ctx) return;
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98];
      const now = ctx.currentTime;
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.06);
        gain.gain.setValueAtTime(0.001, now + idx * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.22, now + idx * 0.06 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.38);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.06);
        osc.stop(now + idx * 0.06 + 0.4);
      });
    },
    chime() {
      if (soundMuted) return;
      const ctx = getAudioCtx();
      if (!ctx) return;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      const now = ctx.currentTime;
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);
        gain.gain.setValueAtTime(0.001, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.2, now + idx * 0.08 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.36);
      });
    },
    fanfare() {
      if (soundMuted) return;
      const ctx = getAudioCtx();
      if (!ctx) return;
      const notes = [440, 554.37, 659.25, 880, 1108.73];
      const now = ctx.currentTime;
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.09);
        gain.gain.setValueAtTime(0.001, now + idx * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.24, now + idx * 0.09 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.09);
        osc.stop(now + idx * 0.09 + 0.46);
      });
    },
    seal() {
      if (soundMuted) return;
      const ctx = getAudioCtx();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(520, now + 0.12);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.14);
    },
  };

  /* --------------------------- Canvas Particle FX ------------------------ */
  let fxCanvas = null, fxCtx = null;
  let particles = [];
  let animFrame = null;

  function initFxCanvas() {
    fxCanvas = $('fx-canvas');
    if (fxCanvas) {
      fxCtx = fxCanvas.getContext('2d');
      resizeCanvas();
    }
  }

  function resizeCanvas() {
    if (!fxCanvas || !fxCtx) return;
    const dpr = window.devicePixelRatio || 1;
    fxCanvas.width = window.innerWidth * dpr;
    fxCanvas.height = window.innerHeight * dpr;
    fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resizeCanvas);

  function loopParticles() {
    if (!fxCtx || !fxCanvas) return;
    fxCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    particles = particles.filter((p) => p.life > 0);
    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.rotation += p.vRot;
      p.life -= p.decay;
      fxCtx.save();
      fxCtx.translate(p.x, p.y);
      fxCtx.rotate(p.rotation);
      fxCtx.globalAlpha = Math.max(0, Math.min(1, p.life));
      if (p.type === 'heart') {
        fxCtx.fillStyle = p.color;
        fxCtx.font = `${p.size}px sans-serif`;
        fxCtx.textAlign = 'center';
        fxCtx.textBaseline = 'middle';
        fxCtx.fillText('♥', 0, 0);
      } else if (p.type === 'star') {
        fxCtx.fillStyle = p.color;
        fxCtx.beginPath();
        const spikes = 4;
        const outerR = p.size;
        const innerR = p.size * 0.38;
        for (let i = 0; i < spikes * 2; i++) {
          const r = i % 2 === 0 ? outerR : innerR;
          const a = (i * Math.PI) / spikes;
          const sx = Math.cos(a) * r;
          const sy = Math.sin(a) * r;
          if (i === 0) fxCtx.moveTo(sx, sy);
          else fxCtx.lineTo(sx, sy);
        }
        fxCtx.closePath();
        fxCtx.fill();
      } else if (p.type === 'ribbon') {
        fxCtx.fillStyle = p.color;
        const w = p.size * 0.35;
        const h = p.size * 2.2;
        fxCtx.fillRect(-w / 2, -h / 2, w, h);
      } else if (p.type === 'circle') {
        fxCtx.fillStyle = p.color;
        fxCtx.beginPath();
        fxCtx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        fxCtx.fill();
      } else {
        fxCtx.fillStyle = p.color;
        fxCtx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size / 1.5);
      }
      fxCtx.restore();
    });
    if (particles.length > 0) animFrame = requestAnimationFrame(loopParticles);
    else animFrame = null;
  }

  function startParticleLoop() {
    if (!animFrame) animFrame = requestAnimationFrame(loopParticles);
  }

  const fx = {
    confetti(opts = {}) {
      if (reduceMotion) return;
      resizeCanvas();
      const count = opts.count || 45;
      const colors = ['#f44336', '#e91e63', '#9c27b0', '#ff9800', '#ffeb3b', '#4caf50', '#00bcd4', '#ffffff', '#ffd700', '#ff6b81'];
      const cx = opts.x || window.innerWidth / 2;
      const cy = opts.y || (window.innerHeight * 0.4);
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5);
        const speed = 4 + Math.random() * 8;
        const rand = Math.random();
        const type = rand > 0.6 ? 'ribbon' : rand > 0.3 ? 'rect' : rand > 0.15 ? 'star' : 'circle';
        particles.push({
          type,
          x: cx + (Math.random() - 0.5) * 40,
          y: cy + (Math.random() - 0.5) * 40,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 3.5,
          gravity: 0.16,
          rotation: Math.random() * Math.PI * 2,
          vRot: (Math.random() - 0.5) * 0.25,
          size: 8 + Math.random() * 10,
          color: colors[Math.floor(Math.random() * colors.length)],
          life: 1,
          decay: 0.007 + Math.random() * 0.007,
        });
      }
      startParticleLoop();
    },
    hearts(opts = {}) {
      if (reduceMotion) return;
      resizeCanvas();
      const count = opts.count || 25;
      const colors = ['#ff4081', '#ff1744', '#f50057', '#ffffff', '#ff80ab', '#ffb6c1'];
      for (let i = 0; i < count; i++) {
        particles.push({
          type: 'heart',
          x: Math.random() * window.innerWidth,
          y: window.innerHeight + Math.random() * 60,
          vx: (Math.random() - 0.5) * 1.5,
          vy: -2.5 - Math.random() * 3,
          gravity: -0.01,
          rotation: (Math.random() - 0.5) * 0.4,
          vRot: (Math.random() - 0.5) * 0.04,
          size: 16 + Math.random() * 16,
          color: colors[Math.floor(Math.random() * colors.length)],
          life: 1,
          decay: 0.005 + Math.random() * 0.005,
        });
      }
      startParticleLoop();
    },
    sparkles(opts = {}) {
      if (reduceMotion) return;
      resizeCanvas();
      const count = opts.count || 18;
      const cx = opts.x || window.innerWidth / 2;
      const cy = opts.y || (window.innerHeight * 0.5);
      const colors = ['#ffd700', '#ffffff', '#ffe57f', '#ffc107', '#fff8e7'];
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 5.5;
        particles.push({
          type: 'star',
          x: cx + (Math.random() - 0.5) * 20,
          y: cy + (Math.random() - 0.5) * 20,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          gravity: 0.04,
          rotation: Math.random() * Math.PI * 2,
          vRot: (Math.random() - 0.5) * 0.3,
          size: 8 + Math.random() * 10,
          color: colors[Math.floor(Math.random() * colors.length)],
          life: 1,
          decay: 0.018 + Math.random() * 0.012,
        });
      }
      startParticleLoop();
    },
  };

  /* ---------------------- URL Share Serialization --------------------- */
  function encodeGiftData(obj) {
    try {
      const jsonStr = JSON.stringify(obj);
      const bytes = new TextEncoder().encode(jsonStr);
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch {
      return '';
    }
  }

  function decodeGiftData(strCode) {
    try {
      let b64 = strCode.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const jsonStr = new TextDecoder().decode(bytes);
      return JSON.parse(jsonStr);
    } catch {
      return null;
    }
  }

  function getShareUrl() {
    // Photos and voice clips go in their own hash parameters (p0, a0, ...) so base64
    // is encoded once instead of twice, keeping the URL compact while supporting high-res media.
    const photoParams = [];
    const audioParams = [];
    const cards = state.cards.map((c, i) => {
      if (c.type === 'puzzle' && c.data && typeof c.data.photoData === 'string' && c.data.photoData.startsWith('data:image/')) {
        const m = /^data:([^;,]+)[^,]*;base64,(.*)$/i.exec(c.data.photoData);
        if (m) {
          const rawB64 = m[2].replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
          photoParams.push(`p${i}=${m[1]},${rawB64}`);
          return { type: c.type, data: { photoData: '' } };
        }
      }
      if (c.type === 'voice' && c.data && typeof c.data.audioData === 'string') {
        const m = /^data:([^;,]+)[^,]*;base64,(.*)$/i.exec(c.data.audioData);
        if (m) {
          const rawB64 = m[2].replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
          audioParams.push(`a${i}=${m[1]},${rawB64}`);
          return { type: c.type, data: { audioData: '' } };
        }
      }
      return { type: c.type, data: c.data };
    });
    const giftPayload = { from: state.from, to: state.to, theme: state.theme, cards };
    const code = encodeGiftData(giftPayload);
    let base = window.location.origin + window.location.pathname;
    const isLocal = !base ||
      base.startsWith('file:') ||
      window.location.origin === 'null' ||
      !window.location.protocol.startsWith('http') ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname === '[::1]' ||
      window.location.hostname === '0.0.0.0';
    if (isLocal) {
      base = 'https://httpspercy.github.io/make-a-gift/';
    }
    const extraParams = [...photoParams, ...audioParams].map((p) => `&${p}`).join('');
    // "v=2" and the trailing "e=1" let the recipient detect a link that was cut off in transit.
    return `${base}#gift=${code}&v=2${extraParams}&e=1`;
  }

  function readMediaParams(hash, prefix) {
    const out = {};
    const re = new RegExp(`[&#]${prefix}(\\d{1,2})=([a-z0-9.+_\\/-]+),([A-Za-z0-9_=-]+)`, 'gi');
    let m;
    while ((m = re.exec(hash))) {
      let b64 = m[3].replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4 !== 0) b64 += '=';
      out[m[1]] = `data:${m[2]};base64,${b64}`;
    }
    return out;
  }
  function readAudioParams(hash) { return readMediaParams(hash, 'a'); }
  function readPhotoParams(hash) { return readMediaParams(hash, 'p'); }

  function showModal(modal) {
    if (!modal) return;
    if (typeof modal.showModal === 'function') {
      try { modal.showModal(); } catch { modal.setAttribute('open', ''); }
    } else {
      modal.setAttribute('open', '');
    }
  }

  function hideModal(modal) {
    if (!modal) return;
    if (typeof modal.close === 'function') {
      try { modal.close(); } catch { modal.removeAttribute('open'); }
    } else {
      modal.removeAttribute('open');
    }
  }

  let copiedTimer = null;
  function markCopied() {
    // The toast sits under an open <dialog>, so confirm on the Copy button itself.
    const btn = $('copy-btn');
    btn.textContent = 'Copied ✓';
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => { btn.textContent = 'Copy link'; }, 2000);
  }

  function copyShareUrl() {
    const input = $('share-url');
    if (!input) return;
    input.select();
    input.setSelectionRange(0, 99999);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(input.value)
        .then(markCopied)
        .catch(() => {
          document.execCommand('copy');
          markCopied();
        });
    } else {
      document.execCommand('copy');
      markCopied();
    }
  }

  function checkCardsReady() {
    if (state.editingId) { toast('Tap Done on the card you are editing first.'); return false; }
    if (!state.from.trim() || !state.to.trim()) { toast('Please add both names in Step 1.'); return false; }
    if (!state.cards.length) { toast('Please add at least one page first.'); return false; }
    const missingPuzzle = state.cards.findIndex((c) => c.type === 'puzzle' && !(media[c.id] || c.data.photoData));
    if (missingPuzzle !== -1) {
      toast(`Page ${missingPuzzle + 1} is a Photo Puzzle. Please upload a photo first.`);
      const wrap = $('cards') && $('cards').children[missingPuzzle];
      if (wrap) wrap.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
      return false;
    }
    const missingVoice = state.cards.findIndex((c) => c.type === 'voice' && !(media[c.id] && c.data.audioData));
    if (missingVoice !== -1) {
      toast(`Page ${missingVoice + 1} is a Voice Message. Please record or upload a clip (up to ${MAX_AUDIO_SECONDS}s) first.`);
      const wrap = $('cards') && $('cards').children[missingVoice];
      if (wrap) wrap.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
      return false;
    }
    return true;
  }

  /* ---------------------------- QR Code Generator (ISO/IEC 18004) ----------------------- */
  function QRCodeModel(typeNumber, errorCorrectLevel) {
    this.typeNumber = typeNumber;
    this.errorCorrectLevel = errorCorrectLevel;
    this.modules = null;
    this.moduleCount = 0;
    this.dataCache = null;
    this.dataList = [];
  }

  const QRMode = { MODE_8BIT_BYTE: 1 << 2 };
  const QRErrorCorrectLevel = { L: 1, M: 0, Q: 3, H: 2 };
  const QRMaskPattern = {
    PATTERN000: 0, PATTERN001: 1, PATTERN010: 2, PATTERN011: 3,
    PATTERN100: 4, PATTERN101: 5, PATTERN110: 6, PATTERN111: 7
  };

  const QRUtil = {
    PATTERN_POSITION_TABLE: [
      [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
      [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
      [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66],
      [6, 26, 48, 70], [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82],
      [6, 30, 58, 86], [6, 34, 62, 90], [6, 28, 50, 72, 94], [6, 26, 50, 74, 98],
      [6, 30, 54, 78, 102], [6, 28, 54, 80, 106], [6, 32, 58, 84, 110], [6, 30, 58, 86, 114],
      [6, 34, 62, 90, 118], [6, 26, 50, 74, 98, 122], [6, 30, 54, 78, 102, 126], [6, 26, 52, 78, 104, 130],
      [6, 30, 56, 82, 108, 134], [6, 34, 60, 86, 112, 138], [6, 30, 58, 86, 114, 142], [6, 34, 62, 90, 118, 146],
      [6, 30, 54, 78, 102, 126, 150], [6, 24, 50, 76, 102, 128, 154], [6, 28, 54, 80, 106, 132, 158],
      [6, 32, 58, 84, 110, 136, 162], [6, 26, 54, 82, 110, 138, 166], [6, 30, 58, 86, 114, 142, 170]
    ],
    G15: (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0),
    G18: (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0),
    G15_MASK: (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1),
    getBCHTypeInfo: function(data) {
      let d = data << 10;
      while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15) >= 0) {
        d ^= (QRUtil.G15 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15)));
      }
      return ((data << 10) | d) ^ QRUtil.G15_MASK;
    },
    getBCHTypeNumber: function(data) {
      let d = data << 12;
      while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18) >= 0) {
        d ^= (QRUtil.G18 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18)));
      }
      return (data << 12) | d;
    },
    getBCHDigit: function(data) {
      let digit = 0;
      while (data !== 0) { digit++; data >>>= 1; }
      return digit;
    },
    getPatternPosition: function(typeNumber) {
      return QRUtil.PATTERN_POSITION_TABLE[typeNumber - 1];
    },
    getMask: function(maskPattern, i, j) {
      switch (maskPattern) {
        case QRMaskPattern.PATTERN000: return (i + j) % 2 === 0;
        case QRMaskPattern.PATTERN001: return i % 2 === 0;
        case QRMaskPattern.PATTERN010: return j % 3 === 0;
        case QRMaskPattern.PATTERN011: return (i + j) % 3 === 0;
        case QRMaskPattern.PATTERN100: return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
        case QRMaskPattern.PATTERN101: return ((i * j) % 2) + ((i * j) % 3) === 0;
        case QRMaskPattern.PATTERN110: return (((i * j) % 2) + ((i * j) % 3)) % 2 === 0;
        case QRMaskPattern.PATTERN111: return (((i * j) % 3) + ((i + j) % 2)) % 2 === 0;
        default: throw new Error("bad maskPattern:" + maskPattern);
      }
    },
    getErrorCorrectPolynomial: function(errorCorrectLength) {
      let a = new QRPolynomial([1], 0);
      for (let i = 0; i < errorCorrectLength; i++) {
        a = a.multiply(new QRPolynomial([1, QRMath.gexp(i)], 0));
      }
      return a;
    },
    getLostPoint: function(qrCode) {
      const moduleCount = qrCode.getModuleCount();
      let lostPoint = 0;
      for (let row = 0; row < moduleCount; row++) {
        for (let col = 0; col < moduleCount; col++) {
          let sameCount = 0;
          const dark = qrCode.isDark(row, col);
          for (let r = -1; r <= 1; r++) {
            if (row + r < 0 || moduleCount <= row + r) continue;
            for (let c = -1; c <= 1; c++) {
              if (col + c < 0 || moduleCount <= col + c) continue;
              if (r === 0 && c === 0) continue;
              if (dark === qrCode.isDark(row + r, col + c)) sameCount++;
            }
          }
          if (sameCount > 5) lostPoint += (3 + sameCount - 5);
        }
      }
      for (let row = 0; row < moduleCount - 1; row++) {
        for (let col = 0; col < moduleCount - 1; col++) {
          let count = 0;
          if (qrCode.isDark(row, col)) count++;
          if (qrCode.isDark(row + 1, col)) count++;
          if (qrCode.isDark(row, col + 1)) count++;
          if (qrCode.isDark(row + 1, col + 1)) count++;
          if (count === 0 || count === 4) lostPoint += 3;
        }
      }
      for (let row = 0; row < moduleCount; row++) {
        for (let col = 0; col < moduleCount - 6; col++) {
          if (qrCode.isDark(row, col) && !qrCode.isDark(row, col + 1) && qrCode.isDark(row, col + 2) &&
              qrCode.isDark(row, col + 3) && qrCode.isDark(row, col + 4) && !qrCode.isDark(row, col + 5) &&
              qrCode.isDark(row, col + 6)) {
            lostPoint += 40;
          }
        }
      }
      for (let col = 0; col < moduleCount; col++) {
        for (let row = 0; row < moduleCount - 6; row++) {
          if (qrCode.isDark(row, col) && !qrCode.isDark(row + 1, col) && qrCode.isDark(row + 2, col) &&
              qrCode.isDark(row + 3, col) && qrCode.isDark(row + 4, col) && !qrCode.isDark(row + 5, col) &&
              qrCode.isDark(row + 6, col)) {
            lostPoint += 40;
          }
        }
      }
      let darkCount = 0;
      for (let col = 0; col < moduleCount; col++) {
        for (let row = 0; row < moduleCount; row++) {
          if (qrCode.isDark(row, col)) darkCount++;
        }
      }
      const ratio = Math.abs((100 * darkCount) / (moduleCount * moduleCount) - 50) / 5;
      lostPoint += ratio * 10;
      return lostPoint;
    }
  };

  const QRMath = {
    glog: function(n) {
      if (n < 1) throw new Error("glog(" + n + ")");
      return QRMath.LOG_TABLE[n];
    },
    gexp: function(n) {
      while (n < 0) n += 255;
      while (n >= 255) n -= 255;
      return QRMath.EXP_TABLE[n];
    },
    EXP_TABLE: new Array(256),
    LOG_TABLE: new Array(256)
  };

  for (let i = 0; i < 8; i++) QRMath.EXP_TABLE[i] = 1 << i;
  for (let i = 8; i < 256; i++) QRMath.EXP_TABLE[i] = QRMath.EXP_TABLE[i - 4] ^ QRMath.EXP_TABLE[i - 5] ^ QRMath.EXP_TABLE[i - 6] ^ QRMath.EXP_TABLE[i - 8];
  for (let i = 0; i < 255; i++) QRMath.LOG_TABLE[QRMath.EXP_TABLE[i]] = i;

  function QRPolynomial(num, shift) {
    if (num.length === undefined) throw new Error(num.length + "/" + shift);
    let offset = 0;
    while (offset < num.length && num[offset] === 0) offset++;
    this.num = new Array(num.length - offset + shift);
    for (let i = 0; i < num.length - offset; i++) this.num[i] = num[i + offset];
  }

  QRPolynomial.prototype = {
    get: function(index) { return this.num[index]; },
    getLength: function() { return this.num.length; },
    multiply: function(e) {
      const num = new Array(this.getLength() + e.getLength() - 1);
      for (let i = 0; i < this.getLength(); i++) {
        for (let j = 0; j < e.getLength(); j++) {
          num[i + j] ^= QRMath.gexp(QRMath.glog(this.get(i)) + QRMath.glog(e.get(j)));
        }
      }
      return new QRPolynomial(num, 0);
    },
    mod: function(e) {
      if (this.getLength() - e.getLength() < 0) return this;
      const ratio = QRMath.glog(this.get(0)) - QRMath.glog(e.get(0));
      const num = new Array(this.getLength());
      for (let i = 0; i < this.getLength(); i++) num[i] = this.get(i);
      for (let i = 0; i < e.getLength(); i++) {
        num[i] ^= QRMath.gexp(QRMath.glog(e.get(i)) + ratio);
      }
      return new QRPolynomial(num, 0).mod(e);
    }
  };

  function QRRSBlock(totalCount, dataCount) {
    this.totalCount = totalCount;
    this.dataCount = dataCount;
  }

  QRRSBlock.RS_BLOCK_TABLE = [
    [1, 26, 19], [1, 26, 16], [1, 26, 13], [1, 26, 9],
    [1, 44, 34], [1, 44, 28], [1, 44, 22], [1, 44, 16],
    [1, 70, 55], [1, 70, 44], [2, 35, 17], [2, 35, 13],
    [1, 100, 80], [2, 50, 32], [2, 50, 24], [4, 25, 9],
    [1, 134, 108], [2, 67, 43], [2, 33, 15, 2, 34, 16], [2, 33, 11, 2, 34, 12],
    [2, 86, 68], [4, 43, 27], [4, 43, 19], [4, 43, 15],
    [2, 98, 78], [4, 49, 31], [2, 32, 14, 4, 33, 15], [4, 39, 13, 1, 40, 14],
    [2, 121, 97], [2, 60, 38, 2, 61, 39], [4, 40, 18, 2, 41, 19], [4, 40, 14, 2, 41, 15],
    [2, 146, 116], [3, 58, 36, 2, 59, 37], [4, 36, 16, 4, 37, 17], [4, 36, 12, 4, 37, 13],
    [2, 86, 68, 2, 87, 69], [4, 69, 43, 1, 70, 44], [6, 43, 19, 2, 44, 20], [6, 43, 15, 2, 44, 16],
    [4, 101, 81], [1, 80, 50, 4, 81, 51], [4, 50, 22, 4, 51, 23], [3, 36, 12, 8, 37, 13],
    [2, 116, 92, 2, 117, 93], [6, 58, 36, 2, 59, 37], [4, 46, 20, 6, 47, 21], [7, 42, 14, 4, 43, 15],
    [4, 133, 107], [8, 59, 37, 1, 60, 38], [8, 44, 20, 4, 45, 21], [12, 33, 11, 4, 34, 12],
    [3, 145, 115, 1, 146, 116], [4, 64, 40, 5, 65, 41], [11, 36, 16, 5, 37, 17], [11, 36, 12, 5, 37, 13],
    [5, 109, 87, 1, 110, 88], [5, 65, 41, 5, 66, 42], [5, 54, 24, 7, 55, 25], [11, 36, 12, 7, 37, 13],
    [5, 122, 98, 1, 123, 99], [7, 73, 45, 3, 74, 46], [15, 43, 19, 2, 44, 20], [3, 45, 15, 13, 46, 16],
    [1, 135, 107, 5, 136, 108], [10, 74, 46, 1, 75, 47], [1, 50, 22, 15, 51, 23], [2, 42, 14, 17, 43, 15],
    [5, 150, 120, 1, 151, 121], [9, 69, 43, 4, 70, 44], [17, 50, 22, 1, 51, 23], [2, 42, 14, 19, 43, 15],
    [3, 141, 113, 4, 142, 114], [3, 70, 44, 11, 71, 45], [17, 47, 21, 4, 48, 22], [9, 39, 13, 16, 40, 14],
    [3, 135, 107, 5, 136, 108], [3, 67, 41, 13, 68, 42], [15, 54, 24, 5, 55, 25], [15, 43, 15, 10, 44, 16],
    [4, 144, 116, 4, 145, 117], [17, 68, 42], [17, 50, 22, 6, 51, 23], [19, 46, 16, 6, 47, 17],
    [2, 139, 111, 7, 140, 112], [17, 74, 46], [7, 54, 24, 16, 55, 25], [34, 37, 13],
    [4, 151, 121, 5, 152, 122], [4, 75, 47, 14, 76, 48], [11, 54, 24, 14, 55, 25], [16, 45, 15, 14, 46, 16],
    [6, 147, 117, 4, 148, 118], [6, 73, 45, 14, 74, 46], [11, 54, 24, 16, 55, 25], [30, 46, 16, 2, 47, 17],
    [8, 132, 106, 4, 133, 107], [8, 75, 47, 13, 76, 48], [7, 54, 24, 22, 55, 25], [22, 45, 15, 13, 46, 16],
    [10, 142, 114, 2, 143, 115], [19, 74, 46, 4, 75, 47], [28, 50, 22, 6, 51, 23], [33, 46, 16, 4, 47, 17],
    [8, 152, 122, 4, 153, 123], [22, 73, 45, 3, 74, 46], [8, 53, 23, 26, 54, 24], [12, 45, 15, 28, 46, 16],
    [3, 147, 117, 10, 148, 118], [3, 73, 45, 23, 74, 46], [4, 54, 24, 31, 55, 25], [11, 45, 15, 31, 46, 16],
    [7, 146, 116, 7, 147, 117], [21, 73, 45, 7, 74, 46], [1, 53, 23, 37, 54, 24], [19, 45, 15, 26, 46, 16],
    [5, 145, 115, 10, 146, 116], [19, 75, 47, 10, 76, 48], [15, 54, 24, 25, 55, 25], [23, 45, 15, 25, 46, 16],
    [13, 145, 115, 3, 146, 116], [2, 74, 46, 29, 75, 47], [42, 54, 24, 1, 55, 25], [23, 45, 15, 28, 46, 16],
    [17, 145, 115], [10, 74, 46, 23, 75, 47], [10, 54, 24, 35, 55, 25], [19, 45, 15, 35, 46, 16],
    [17, 145, 115, 1, 146, 116], [14, 74, 46, 21, 75, 47], [29, 54, 24, 19, 55, 25], [11, 45, 15, 46, 46, 16],
    [13, 145, 115, 6, 146, 116], [14, 74, 46, 23, 75, 47], [44, 54, 24, 7, 55, 25], [59, 46, 16, 1, 47, 17],
    [12, 151, 121, 7, 152, 122], [12, 75, 47, 26, 76, 48], [39, 54, 24, 14, 55, 25], [22, 45, 15, 41, 46, 16],
    [6, 151, 121, 14, 152, 122], [6, 75, 47, 34, 76, 48], [46, 54, 24, 10, 55, 25], [2, 45, 15, 64, 46, 16],
    [17, 152, 122, 4, 153, 123], [29, 74, 46, 14, 75, 47], [49, 54, 24, 10, 55, 25], [24, 45, 15, 46, 46, 16],
    [4, 152, 122, 18, 153, 123], [13, 74, 46, 32, 75, 47], [48, 54, 24, 14, 55, 25], [42, 45, 15, 32, 46, 16],
    [20, 147, 117, 4, 148, 118], [40, 75, 47, 7, 76, 48], [43, 54, 24, 22, 55, 25], [10, 45, 15, 67, 46, 16],
    [19, 148, 118, 6, 149, 119], [18, 75, 47, 31, 76, 48], [34, 54, 24, 34, 55, 25], [20, 45, 15, 61, 46, 16]
  ];

  QRRSBlock.getRSBlocks = function(typeNumber, errorCorrectLevel) {
    const rsBlock = QRRSBlock.getRsBlockTable(typeNumber, errorCorrectLevel);
    if (rsBlock === undefined) throw new Error("bad rs block @ typeNumber:" + typeNumber + "/errorCorrectLevel:" + errorCorrectLevel);
    const length = rsBlock.length / 3;
    const list = [];
    for (let i = 0; i < length; i++) {
      const count = rsBlock[i * 3 + 0];
      const totalCount = rsBlock[i * 3 + 1];
      const dataCount = rsBlock[i * 3 + 2];
      for (let j = 0; j < count; j++) list.push(new QRRSBlock(totalCount, dataCount));
    }
    return list;
  };

  QRRSBlock.getRsBlockTable = function(typeNumber, errorCorrectLevel) {
    switch (errorCorrectLevel) {
      case QRErrorCorrectLevel.L: return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
      case QRErrorCorrectLevel.M: return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
      case QRErrorCorrectLevel.Q: return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
      case QRErrorCorrectLevel.H: return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
      default: return undefined;
    }
  };

  function QRBitBuffer() {
    this.buffer = [];
    this.length = 0;
  }
  QRBitBuffer.prototype = {
    get: function(index) {
      const bufIndex = Math.floor(index / 8);
      return ((this.buffer[bufIndex] >>> (7 - (index % 8))) & 1) === 1;
    },
    put: function(num, length) {
      for (let i = 0; i < length; i++) {
        this.putBit(((num >>> (length - i - 1)) & 1) === 1);
      }
    },
    getLengthInBits: function() { return this.length; },
    putBit: function(bit) {
      const bufIndex = Math.floor(this.length / 8);
      if (this.buffer.length <= bufIndex) this.buffer.push(0);
      if (bit) this.buffer[bufIndex] |= (0x80 >>> (this.length % 8));
      this.length++;
    }
  };

  function QR8bitByte(data) {
    this.mode = QRMode.MODE_8BIT_BYTE;
    this.data = data;
    this.parsedData = [];
    for (let i = 0; i < this.data.length; i++) {
      const byteArray = [];
      let code = this.data.charCodeAt(i);
      if (code > 0x10000) {
        byteArray[0] = 0xF0 | ((code & 0x1C0000) >>> 18);
        byteArray[1] = 0x80 | ((code & 0x3F000) >>> 12);
        byteArray[2] = 0x80 | ((code & 0xFC0) >>> 6);
        byteArray[3] = 0x80 | (code & 0x3F);
      } else if (code > 0x800) {
        byteArray[0] = 0xE0 | ((code & 0xF000) >>> 12);
        byteArray[1] = 0x80 | ((code & 0xFC0) >>> 6);
        byteArray[2] = 0x80 | (code & 0x3F);
      } else if (code > 0x80) {
        byteArray[0] = 0xC0 | ((code & 0x7C0) >>> 6);
        byteArray[1] = 0x80 | (code & 0x3F);
      } else {
        byteArray[0] = code;
      }
      this.parsedData.push(byteArray);
    }
    this.parsedData = Array.prototype.concat.apply([], this.parsedData);
  }

  QR8bitByte.prototype = {
    getLength: function() { return this.parsedData.length; },
    write: function(buffer) {
      for (let i = 0; i < this.parsedData.length; i++) buffer.put(this.parsedData[i], 8);
    }
  };

  QRCodeModel.prototype = {
    addData: function(data) {
      this.dataList.push(new QR8bitByte(data));
      this.dataCache = null;
    },
    isDark: function(row, col) {
      if (row < 0 || this.moduleCount <= row || col < 0 || this.moduleCount <= col) {
        throw new Error(row + "," + col);
      }
      return this.modules[row][col];
    },
    getModuleCount: function() { return this.moduleCount; },
    make: function() {
      if (this.typeNumber < 1) {
        let typeNumber = 1;
        for (typeNumber = 1; typeNumber < 40; typeNumber++) {
          const rsBlocks = QRRSBlock.getRSBlocks(typeNumber, this.errorCorrectLevel);
          const buffer = new QRBitBuffer();
          let totalDataCount = 0;
          for (let i = 0; i < rsBlocks.length; i++) totalDataCount += rsBlocks[i].dataCount;
          for (let i = 0; i < this.dataList.length; i++) {
            const data = this.dataList[i];
            buffer.put(data.mode, 4);
            buffer.put(data.getLength(), typeNumber < 10 ? 8 : 16);
            data.write(buffer);
          }
          if (buffer.getLengthInBits() <= totalDataCount * 8) break;
        }
        this.typeNumber = typeNumber;
      }
      this.makeImpl(false, this.getBestMaskPattern());
    },
    makeImpl: function(test, maskPattern) {
      this.moduleCount = this.typeNumber * 4 + 17;
      this.modules = new Array(this.moduleCount);
      for (let row = 0; row < this.moduleCount; row++) {
        this.modules[row] = new Array(this.moduleCount);
        for (let col = 0; col < this.moduleCount; col++) this.modules[row][col] = null;
      }
      this.setupPositionProbePattern(0, 0);
      this.setupPositionProbePattern(this.moduleCount - 7, 0);
      this.setupPositionProbePattern(0, this.moduleCount - 7);
      this.setupPositionAdjustPattern();
      this.setupTimingPattern();
      this.setupTypeInfo(test, maskPattern);
      if (this.typeNumber >= 7) this.setupTypeNumber(test);
      if (this.dataCache == null) {
        this.dataCache = QRCodeModel.createData(this.typeNumber, this.errorCorrectLevel, this.dataList);
      }
      this.mapData(this.dataCache, maskPattern);
    },
    setupPositionProbePattern: function(row, col) {
      for (let r = -1; r <= 7; r++) {
        if (row + r <= -1 || this.moduleCount <= row + r) continue;
        for (let c = -1; c <= 7; c++) {
          if (col + c <= -1 || this.moduleCount <= col + c) continue;
          if ((0 <= r && r <= 6 && (c === 0 || c === 6)) ||
              (0 <= c && c <= 6 && (r === 0 || r === 6)) ||
              (2 <= r && r <= 4 && 2 <= c && c <= 4)) {
            this.modules[row + r][col + c] = true;
          } else {
            this.modules[row + r][col + c] = false;
          }
        }
      }
    },
    getBestMaskPattern: function() {
      let minLostPoint = 0;
      let pattern = 0;
      for (let i = 0; i < 8; i++) {
        this.makeImpl(true, i);
        const lostPoint = QRUtil.getLostPoint(this);
        if (i === 0 || minLostPoint > lostPoint) {
          minLostPoint = lostPoint;
          pattern = i;
        }
      }
      return pattern;
    },
    setupTimingPattern: function() {
      for (let r = 8; r < this.moduleCount - 8; r++) {
        if (this.modules[r][6] != null) continue;
        this.modules[r][6] = (r % 2 === 0);
      }
      for (let c = 8; c < this.moduleCount - 8; c++) {
        if (this.modules[6][c] != null) continue;
        this.modules[6][c] = (c % 2 === 0);
      }
    },
    setupPositionAdjustPattern: function() {
      const pos = QRUtil.getPatternPosition(this.typeNumber);
      if (!pos) return;
      for (let i = 0; i < pos.length; i++) {
        for (let j = 0; j < pos.length; j++) {
          const row = pos[i], col = pos[j];
          if (this.modules[row][col] != null) continue;
          for (let r = -2; r <= 2; r++) {
            for (let c = -2; c <= 2; c++) {
              if (r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0)) {
                this.modules[row + r][col + c] = true;
              } else {
                this.modules[row + r][col + c] = false;
              }
            }
          }
        }
      }
    },
    setupTypeNumber: function(test) {
      const bits = QRUtil.getBCHTypeNumber(this.typeNumber);
      for (let i = 0; i < 18; i++) {
        const mod = (!test && ((bits >> i) & 1) === 1);
        this.modules[Math.floor(i / 3)][(i % 3) + this.moduleCount - 8 - 3] = mod;
        this.modules[(i % 3) + this.moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
      }
    },
    setupTypeInfo: function(test, maskPattern) {
      const data = (this.errorCorrectLevel << 3) | maskPattern;
      const bits = QRUtil.getBCHTypeInfo(data);
      for (let i = 0; i < 15; i++) {
        const mod = (!test && ((bits >> i) & 1) === 1);
        if (i < 6) this.modules[i][8] = mod;
        else if (i < 8) this.modules[i + 1][8] = mod;
        else this.modules[this.moduleCount - 15 + i][8] = mod;

        if (i < 8) this.modules[8][this.moduleCount - i - 1] = mod;
        else if (i < 9) this.modules[8][15 - i - 1 + 1] = mod;
        else this.modules[8][15 - i - 1] = mod;
      }
      this.modules[this.moduleCount - 8][8] = !test;
    },
    mapData: function(data, maskPattern) {
      let inc = -1;
      let row = this.moduleCount - 1;
      let bitIndex = 7;
      let byteIndex = 0;
      for (let col = this.moduleCount - 1; col > 0; col -= 2) {
        if (col === 6) col--;
        while (true) {
          for (let c = 0; c < 2; c++) {
            if (this.modules[row][col - c] == null) {
              let dark = false;
              if (byteIndex < data.length) {
                dark = (((data[byteIndex] >>> bitIndex) & 1) === 1);
              }
              const mask = QRUtil.getMask(maskPattern, row, col - c);
              if (mask) dark = !dark;
              this.modules[row][col - c] = dark;
              bitIndex--;
              if (bitIndex === -1) {
                byteIndex++;
                bitIndex = 7;
              }
            }
          }
          row += inc;
          if (row < 0 || this.moduleCount <= row) {
            row -= inc;
            inc = -inc;
            break;
          }
        }
      }
    }
  };

  QRCodeModel.createData = function(typeNumber, errorCorrectLevel, dataList) {
    const rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectLevel);
    const buffer = new QRBitBuffer();
    for (let i = 0; i < dataList.length; i++) {
      const data = dataList[i];
      buffer.put(data.mode, 4);
      buffer.put(data.getLength(), typeNumber < 10 ? 8 : 16);
      data.write(buffer);
    }
    let totalDataCount = 0;
    for (let i = 0; i < rsBlocks.length; i++) totalDataCount += rsBlocks[i].dataCount;
    if (buffer.getLengthInBits() > totalDataCount * 8) {
      throw new Error("code length overflow. (" + buffer.getLengthInBits() + ">" + (totalDataCount * 8) + ")");
    }
    if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) buffer.put(0, 4);
    while (buffer.getLengthInBits() % 8 !== 0) buffer.putBit(false);
    while (true) {
      if (buffer.getLengthInBits() >= totalDataCount * 8) break;
      buffer.put(0xEC, 8);
      if (buffer.getLengthInBits() >= totalDataCount * 8) break;
      buffer.put(0x11, 8);
    }
    return QRCodeModel.createBytes(buffer, rsBlocks);
  };

  QRCodeModel.createBytes = function(buffer, rsBlocks) {
    let offset = 0;
    let maxDcCount = 0;
    let maxEcCount = 0;
    const dcdata = new Array(rsBlocks.length);
    const ecdata = new Array(rsBlocks.length);
    for (let r = 0; r < rsBlocks.length; r++) {
      const dcCount = rsBlocks[r].dataCount;
      const ecCount = rsBlocks[r].totalCount - dcCount;
      maxDcCount = Math.max(maxDcCount, dcCount);
      maxEcCount = Math.max(maxEcCount, ecCount);
      dcdata[r] = new Array(dcCount);
      for (let i = 0; i < dcdata[r].length; i++) {
        dcdata[r][i] = 0xff & buffer.buffer[i + offset];
      }
      offset += dcCount;
      const rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
      const rawPoly = new QRPolynomial(dcdata[r], rsPoly.getLength() - 1);
      const modPoly = rawPoly.mod(rsPoly);
      ecdata[r] = new Array(rsPoly.getLength() - 1);
      for (let i = 0; i < ecdata[r].length; i++) {
        const modIndex = i + modPoly.getLength() - ecdata[r].length;
        ecdata[r][i] = (modIndex >= 0) ? modPoly.get(modIndex) : 0;
      }
    }
    let totalCodeCount = 0;
    for (let i = 0; i < rsBlocks.length; i++) totalCodeCount += rsBlocks[i].totalCount;
    const data = new Array(totalCodeCount);
    let index = 0;
    for (let i = 0; i < maxDcCount; i++) {
      for (let r = 0; r < rsBlocks.length; r++) {
        if (i < dcdata[r].length) data[index++] = dcdata[r][i];
      }
    }
    for (let i = 0; i < maxEcCount; i++) {
      for (let r = 0; r < rsBlocks.length; r++) {
        if (i < ecdata[r].length) data[index++] = ecdata[r][i];
      }
    }
    return data;
  };

  function createQRCode(text, ecLevel = 'M') {
    const ecCode = ecLevel === 'L' ? QRErrorCorrectLevel.L :
                   ecLevel === 'Q' ? QRErrorCorrectLevel.Q :
                   ecLevel === 'H' ? QRErrorCorrectLevel.H : QRErrorCorrectLevel.M;
    let qr = new QRCodeModel(0, ecCode);
    qr.addData(text);
    try {
      qr.make();
    } catch (e) {
      if (ecLevel !== 'L') {
        qr = new QRCodeModel(0, QRErrorCorrectLevel.L);
        qr.addData(text);
        qr.make();
      } else {
        throw e;
      }
    }
    return qr;
  }

  function renderQRCode(canvas, text) {
    if (!canvas || !text) return;
    try {
      const qr = createQRCode(text, 'M');
      const count = qr.getModuleCount();
      const ctx = canvas.getContext('2d');
      const margin = 4;
      const totalCells = count + margin * 2;
      // High-resolution internal rendering (480-600px) for sharp camera scanning & high-res downloads
      const pixelSize = Math.max(4, Math.floor(520 / totalCells));
      const targetSize = pixelSize * totalCells;
      canvas.width = targetSize;
      canvas.height = targetSize;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetSize, targetSize);
      ctx.fillStyle = '#000000';
      for (let r = 0; r < count; r++) {
        for (let c = 0; c < count; c++) {
          if (qr.isDark(r, c)) {
            ctx.fillRect((c + margin) * pixelSize, (r + margin) * pixelSize, pixelSize, pixelSize);
          }
        }
      }
    } catch (e) {
      console.warn('QR Code generation failed:', e);
      const ctx = canvas.getContext('2d');
      canvas.width = 300;
      canvas.height = 300;
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#333333';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Gift link is too long for QR Code.', canvas.width / 2, canvas.height / 2 - 10);
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#666666';
      ctx.fillText('Please use the Copy Link button above 🎁', canvas.width / 2, canvas.height / 2 + 14);
    }
  }

  async function handleNativeShare() {
    const shareUrl = ($('share-url') && $('share-url').value) || getShareUrl();
    const shareData = {
      title: `A gift for ${state.to.trim() || 'you'}`,
      text: `Open your surprise gift from ${state.from.trim() || 'someone'} 💝`,
      url: shareUrl,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        toast('Gift shared successfully! 🎁');
        return;
      } catch (err) {
        if (err.name !== 'AbortError') {
          copyShareUrl();
          toast('Link copied to clipboard!');
        }
      }
    } else {
      copyShareUrl();
      toast('Link copied! Share via messages or WhatsApp 💬');
    }
  }

  function toggleQRCode() {
    const box = $('qr-box');
    const canvas = $('qr-canvas');
    if (!box || !canvas) return;
    const isHidden = box.hidden;
    box.hidden = !isHidden;
    if (box.hidden === false) {
      const shareUrl = ($('share-url') && $('share-url').value) || getShareUrl();
      renderQRCode(canvas, shareUrl);
    }
  }

  function downloadQRCode() {
    const canvas = $('qr-canvas');
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    const safeName = (state.from + '_' + state.to).replace(/[^a-zA-Z0-9_-]/g, '_');
    a.download = `Gift_QR_${safeName || 'Code'}.png`;
    a.href = url;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 500);
    toast('QR Code downloaded!');
  }

  function openShareModal() {
    if (!checkCardsReady()) return;
    const modal = $('share-modal');
    const input = $('share-url');
    const shareUrl = getShareUrl();
    input.value = shareUrl;
    $('share-warn').hidden = shareUrl.length <= LONG_LINK_CHARS;
    const qrBox = $('qr-box');
    if (qrBox && !qrBox.hidden) {
      renderQRCode($('qr-canvas'), shareUrl);
    }
    showModal(modal);
    copyShareUrl();
  }

  /* ----------------------------- Utilities ---------------------------- */
  let toastTimer = null;
  function toast(msg, ms = 2600) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }
  const fmt = (s) => {
    s = Number.isFinite(s) ? Math.max(0, Math.floor(s)) : 0;
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  /* ------------------------------ Artwork ----------------------------- */
  function cassette(className = 'cassette') {
    const reel = (cx) => svg('g', {},
      svg('circle', { cx, cy: 72, r: 31, fill: '#efe0c3', stroke: '#b3232b', 'stroke-width': 2 }),
      svg('g', { class: 'reel-spin' },
        svg('circle', { cx, cy: 72, r: 19, fill: '#8b2a1c' }),
        ...[0, 60, 120, 180, 240, 300].map((a) => svg('rect', { x: cx - 2.5, y: 48, width: 5, height: 9, fill: '#efe0c3', transform: `rotate(${a} ${cx} 72)` }))));
    const screw = (cx, cy) => svg('circle', { cx, cy, r: 4.5, fill: '#8d8a84', stroke: '#5b5954', 'stroke-width': 1 });
    return svg('svg', { class: className, viewBox: '0 0 300 190', 'aria-hidden': 'true' },
      svg('rect', { x: 4, y: 4, width: 292, height: 182, rx: 14, fill: '#efe0c3' }),
      svg('rect', { x: 20, y: 18, width: 260, height: 110, rx: 16, fill: '#e7a29c', stroke: '#b3232b', 'stroke-width': 2 }),
      reel(88), reel(212),
      svg('rect', { x: 118, y: 52, width: 64, height: 40, rx: 3, fill: '#5a1a12' }),
      svg('rect', { x: 140, y: 56, width: 20, height: 32, fill: '#d8c9d0' }),
      svg('path', { d: 'M62 186L78 142H222L238 186z', fill: '#f3e8cf' }),
      svg('circle', { cx: 84, cy: 168, r: 7, fill: '#2b1a16' }),
      svg('rect', { x: 118, y: 160, width: 16, height: 14, rx: 3, fill: '#4a2a22' }),
      svg('rect', { x: 166, y: 160, width: 16, height: 14, rx: 3, fill: '#4a2a22' }),
      svg('circle', { cx: 216, cy: 168, r: 8, fill: '#2b1a16' }),
      screw(16, 16), screw(284, 16), screw(16, 172), screw(284, 172), screw(150, 150));
  }

  function bow() {
    const fill = '#c3262b', stroke = '#8f1219';
    return svg('svg', { class: 'slot-bow', viewBox: '0 0 300 110', 'aria-hidden': 'true' },
      svg('path', { d: 'M150 70C120 10 40 0 50 50C58 85 130 90 150 70z', fill, stroke, 'stroke-width': 3 }),
      svg('path', { d: 'M150 70C180 10 260 0 250 50C242 85 170 90 150 70z', fill, stroke, 'stroke-width': 3 }),
      svg('path', { d: 'M150 70L110 108', stroke, 'stroke-width': 14, 'stroke-linecap': 'round' }),
      svg('path', { d: 'M150 70L190 108', stroke, 'stroke-width': 14, 'stroke-linecap': 'round' }),
      svg('rect', { x: 134, y: 52, width: 32, height: 36, rx: 8, fill: '#d63a3f', stroke, 'stroke-width': 3 }));
  }

  function seal() {
    const letter = (state.from && state.from.trim().charAt(0).toUpperCase()) || '♥';
    const p = svg('text', { x: 50, y: 62, 'text-anchor': 'middle', 'font-size': 38, 'font-weight': 800, 'font-family': 'Jost, sans-serif', fill: '#7c3022' });
    p.textContent = letter;
    return svg('svg', { class: 'env-seal', viewBox: '0 0 100 100', 'aria-hidden': 'true' },
      svg('path', { d: 'M50 6c9 0 12 6 20 9c8 3 15 3 18 12c3 9-1 13 0 22c1 9 6 14 2 22c-4 8-12 8-18 13c-6 5-8 13-18 13s-13-8-18-13C30 79 22 79 18 71c-4-8 1-13 2-22c1-9-3-13 0-22c3-9 10-9 18-12c8-3 11-9 12-9z', fill: '#9b4531' }),
      svg('circle', { cx: 50, cy: 50, r: 30, fill: 'none', stroke: '#7c3022', 'stroke-width': 2 }),
      p);
  }

  /* -------------------------- Type picker thumbs ----------------------- */
  function thumb(type) {
    const t = el('div', { class: 'type-thumb' });
    const title = (text) => el('span', { class: 'mini-title', text });
    const art = (...kids) => el('div', { class: 'mini-art', 'aria-hidden': 'true' }, ...kids);
    switch (type) {
      case 'code':
        t.append(title('Our anniversary?'),
          art(el('div', { class: 'mini-keys' }, ...['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((k) => el('span', { text: k })))));
        break;
      case 'puzzle':
        t.append(title('Our favorite photo'), art(el('div', { class: 'mini-puzzle' }, ...Array.from({ length: 9 }, () => el('i')))));
        break;
      case 'question':
        t.append(title('Where did we first meet?'),
          art(el('div', { class: 'mini-input', text: 'Type your answer' }), el('div', { class: 'mini-btn', text: 'Unlock →' })));
        break;
      case 'voice':
        t.append(title('Voice message'), art(cassette('mini-cassette'), el('span', { class: 'mini-time', text: '0:00 / 0:30' })));
        break;
      case 'message':
        t.append(title('A note just for you'), art(el('div', { class: 'mini-env' },
          svg('svg', { viewBox: '0 0 300 200', 'aria-hidden': 'true' },
            svg('rect', { width: 300, height: 200, fill: '#ded7c6' }),
            svg('path', { d: 'M 0 0 L 150 100 L 0 200 Z', fill: '#e8e2d4' }),
            svg('path', { d: 'M 300 0 L 150 100 L 300 200 Z', fill: '#ebe5d7' }),
            svg('path', { d: 'M 0 200 L 150 96 L 300 200 Z', fill: '#f4eee2' }),
            svg('path', { d: 'M 0 0 L 150 102 L 300 0 Z', fill: '#f7f2e7' }),
            svg('svg', { x: 114, y: 64, width: 72, height: 72, viewBox: '0 0 100 100' },
              svg('path', { d: 'M50 6c9 0 12 6 20 9c8 3 15 3 18 12c3 9-1 13 0 22c1 9 6 14 2 22c-4 8-12 8-18 13c-6 5-8 13-18 13s-13-8-18-13C30 79 22 79 18 71c-4-8 1-13 2-22c1-9-3-13 0-22c3-9 10-9 18-12c8-3 11-9 12-9z', fill: '#9b4531' }),
              svg('circle', { cx: 50, cy: 50, r: 30, fill: 'none', stroke: '#7c3022', 'stroke-width': 4 }))))));
        break;
      default:
        t.append(title('Spin to win'),
          art(el('div', { class: 'mini-reels' }, ...['🧋', '🏝️', '🏠'].map((e) => el('span', { text: e }))), el('div', { class: 'mini-btn', text: 'Spin' })));
    }
    return t;
  }
  function typeItem(type, pressed, onClick, disabled) {
    return el('button', { type: 'button', class: 'type-item', 'aria-pressed': pressed ? 'true' : 'false', disabled, onclick: onClick },
      thumb(type.id), el('span', { class: 'type-name', text: type.name }));
  }

  /* ------------------------------- Media ------------------------------ */
  let recorder = null, recStream = null, recTimer = null;

  function revokeMedia(id) {
    const m = media[id];
    if (!m) return;
    if (m.url && m.url.startsWith('blob:')) URL.revokeObjectURL(m.url);
    delete media[id];
  }
  function stopRecording() {
    if (recorder && recorder.state === 'recording') recorder.stop();
  }
  function stopAllAudio() {
    stopRecording();
    for (const id of Object.keys(rt)) {
      if (rt[id].audio) { rt[id].audio.pause(); rt[id].audio = null; }
      if (rt[id].editAudio) { rt[id].editAudio.pause(); rt[id].editAudio = null; }
      if (rt[id].webAudioSource) {
        try { rt[id].webAudioSource.stop(); } catch {}
        rt[id].webAudioSource = null;
      }
      rt[id].webAudioPlaying = false;
    }
  }

  async function squareImageUrl(file) {
    const bmp = await createImageBitmap(file);
    const size = Math.min(bmp.width, bmp.height);
    const out = Math.min(size, 960);
    const canvas = document.createElement('canvas');
    canvas.width = out; canvas.height = out;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, (bmp.width - size) / 2, (bmp.height - size) / 2, size, size, 0, 0, out, out);
    if (bmp.close) bmp.close();

    const shareCvs = document.createElement('canvas');
    const shareSize = 512;
    shareCvs.width = shareSize; shareCvs.height = shareSize;
    const sCtx = shareCvs.getContext('2d');
    sCtx.imageSmoothingEnabled = true;
    sCtx.imageSmoothingQuality = 'high';
    sCtx.drawImage(canvas, 0, 0, shareSize, shareSize);
    const photoData = shareCvs.toDataURL('image/jpeg', 0.82);

    const blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), 'image/jpeg', 0.90));
    return { url: URL.createObjectURL(blob), photoData };
  }
  function shuffled() {
    const a = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    do {
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
    } while (a.every((v, i) => v === i));
    return a;
  }
  async function setPhoto(card, file, statusEl) {
    if (!IMAGE_TYPES.includes(file.type)) { statusEl.textContent = 'Please choose a JPG, PNG or WebP image.'; return; }
    if (file.size > MAX_IMAGE_BYTES) { statusEl.textContent = 'Image must be 10 MB or smaller.'; return; }
    try {
      const res = await squareImageUrl(file);
      revokeMedia(card.id);
      media[card.id] = { url: res.url };
      card.data.photoData = res.photoData;
      if (state.draft && state.editingId === card.id) state.draft.photoData = res.photoData;
      delete getRt(card.id).order;
      save();
      statusEl.textContent = 'Photo added. Tap Done to see your puzzle.';
    } catch {
      statusEl.textContent = 'That image could not be read. Try another one.';
    }
  }
  /* Voice clips travel inside the share link as a small base64 data URL. It is
     only ever played through a blob: URL, because the CSP has no data: media-src. */
  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }
  function dataUrlToBlobUrl(dataUrl) {
    const m = /^data:([^;,]+)[^,]*;base64,(.*)$/i.exec(dataUrl);
    if (!m) return '';
    let b64 = m[2].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) b64 += '=';
    try {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return URL.createObjectURL(new Blob([bytes], { type: m[1] || 'audio/webm' }));
    } catch (e) {
      console.warn('Failed to convert dataUrl to blob', e);
      return '';
    }
  }
  function restoreMedia(cardId, type, clean) {
    try {
      if (type === 'puzzle' && clean.photoData) media[cardId] = { url: clean.photoData };
      if (type === 'voice' && clean.audioData) {
        const url = dataUrlToBlobUrl(clean.audioData);
        if (url) media[cardId] = { url, audioData: clean.audioData };
      }
    } catch { /* corrupt audio data: the card just has no recording */ }
  }
  async function playWebAudioFallback(card, r, btn, root, timer, onEnd) {
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      if (ctx.state === 'suspended') await ctx.resume();

      const m = media[card.id];
      if (!m) return;

      let arrayBuffer;
      const audioData = card.data.audioData || m.audioData;
      if (audioData) {
        const mData = /^data:[^;]+;base64,(.*)$/i.exec(audioData);
        if (mData) {
          let b64 = mData[1].replace(/-/g, '+').replace(/_/g, '/');
          while (b64.length % 4 !== 0) b64 += '=';
          const bin = atob(b64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          arrayBuffer = bytes.buffer;
        }
      }
      if (!arrayBuffer && m.url) {
        const res = await fetch(m.url);
        arrayBuffer = await res.arrayBuffer();
      }
      if (!arrayBuffer) return;

      const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      r.webAudioSource = source;
      r.webAudioPlaying = true;
      const startTime = ctx.currentTime;
      const duration = audioBuffer.duration;

      root.classList.add('playing');
      btn.textContent = 'Pause';

      const interval = setInterval(() => {
        if (!r.webAudioSource || !r.webAudioPlaying) { clearInterval(interval); return; }
        const elapsed = ctx.currentTime - startTime;
        if (elapsed >= duration) {
          clearInterval(interval);
          r.webAudioSource = null;
          r.webAudioPlaying = false;
          root.classList.remove('playing');
          btn.textContent = 'Play';
          timer.textContent = `${fmt(duration)} / ${fmt(duration)}`;
          if (onEnd) onEnd();
        } else {
          timer.textContent = `${fmt(elapsed)} / ${fmt(duration)}`;
        }
      }, 100);

      source.onended = () => {
        clearInterval(interval);
        r.webAudioSource = null;
        r.webAudioPlaying = false;
        root.classList.remove('playing');
        btn.textContent = 'Play';
        if (onEnd) onEnd();
      };

      source.start(0);
    } catch (e) {
      console.warn('Web Audio playback error:', e);
      toast('Could not play this audio clip.');
    }
  }
  // Decode a clip and record it again at a low bitrate (plays in real time).
  async function shrinkAudio(blob) {
    const ctx = new AudioContext();
    try {
      if (ctx.state === 'suspended') await ctx.resume();
      const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
      const dest = ctx.createMediaStreamDestination();
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(dest);
      const rec = new MediaRecorder(dest.stream, { audioBitsPerSecond: AUDIO_BITRATE });
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      const finished = new Promise((res) => { rec.onstop = res; });
      src.onended = () => rec.stop();
      rec.start();
      src.start();
      await finished;
      return new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
    } finally {
      ctx.close();
    }
  }
  // Stores the clip for playback and, when small enough, inside card data so it is shared.
  // Resolves true when the clip will be part of the share link.
  async function setAudio(card, blob, statusEl, shrink) {
    if (!state.cards.includes(card)) return false;
    const url = URL.createObjectURL(blob);
    revokeMedia(card.id);
    media[card.id] = { url };
    let audioData = '';
    try {
      let small = blob;
      if (small.size > MAX_EMBED_AUDIO_BYTES && shrink) {
        statusEl.textContent = 'Shrinking your clip so it fits in the share link…';
        small = await shrinkAudio(blob);
      }
      if (small.size <= MAX_EMBED_AUDIO_BYTES) {
        const type = (small.type || 'audio/webm').split(';')[0];
        const b64 = (await blobToDataUrl(small)).replace(/^data:[^,]*,/, '');
        audioData = cleanData('voice', { audioData: `data:${type};base64,${b64}` }).audioData;
      }
    } catch { /* keep local playback only */ }
    if (!media[card.id] || media[card.id].url !== url || !state.cards.includes(card)) return false;
    card.data.audioData = audioData;
    if (state.draft && state.editingId === card.id) state.draft.audioData = audioData;
    save();
    return !!audioData;
  }
  const AUDIO_TOO_BIG = 'Saved here, but this clip is too large for a share link. Try a shorter one.';
  function setAudioFile(card, file, statusEl, onDone) {
    if (!file.type.startsWith('audio/')) { statusEl.textContent = 'Please choose an audio file.'; return; }
    if (file.size > MAX_AUDIO_BYTES) { statusEl.textContent = 'Audio must be 5 MB or smaller.'; return; }
    const url = URL.createObjectURL(file);
    const probe = new Audio();
    probe.preload = 'metadata';
    probe.onloadedmetadata = async () => {
      URL.revokeObjectURL(url);
      if (probe.duration > MAX_AUDIO_SECONDS + 0.5) {
        statusEl.textContent = `Please choose a clip of ${MAX_AUDIO_SECONDS} seconds or less.`;
        return;
      }
      const shared = await setAudio(card, file, statusEl, true);
      if (shared) sfx.chime();
      statusEl.textContent = shared ? 'Voice message saved! You can test it below.' : AUDIO_TOO_BIG;
      if (onDone) onDone(shared);
    };
    probe.onerror = () => { URL.revokeObjectURL(url); statusEl.textContent = 'That audio file could not be read.'; };
    probe.src = url;
  }
  async function startRecording(card, statusEl, btn, onDone) {
    if (recorder && recorder.state === 'recording') { stopRecording(); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
      statusEl.textContent = 'Recording is not supported here. Upload a file instead.';
      return;
    }
    try {
      recStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      statusEl.textContent = 'Microphone access was not granted.';
      return;
    }
    const chunks = [];
    let rec;
    try { rec = new MediaRecorder(recStream, { audioBitsPerSecond: AUDIO_BITRATE }); } catch { rec = new MediaRecorder(recStream); }
    recorder = rec;
    const dot = el('span', { class: 'rec-dot' });
    const time = el('span', { class: 'rec-time' });
    const fill = el('i');
    const indicator = el('div', { class: 'rec-indicator', 'aria-hidden': 'true' }, dot, time, el('span', { class: 'rec-bar' }, fill));
    statusEl.before(indicator);
    const startedAt = performance.now();
    let hitLimit = false;
    const tick = () => {
      const secs = Math.min((performance.now() - startedAt) / 1000, MAX_AUDIO_SECONDS);
      const left = Math.ceil(MAX_AUDIO_SECONDS - secs);
      time.textContent = `${fmt(secs)} / ${fmt(MAX_AUDIO_SECONDS)}` + (left <= 5 && left > 0 ? ` · ${left}s left` : '');
      fill.style.width = `${(secs / MAX_AUDIO_SECONDS) * 100}%`;
      indicator.classList.toggle('low', left <= 5);
    };
    tick();
    const tickTimer = setInterval(tick, 250);
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = async () => {
      clearTimeout(recTimer);
      clearInterval(tickTimer);
      indicator.remove();
      if (recStream) recStream.getTracks().forEach((t) => t.stop());
      recStream = null; recorder = null;
      btn.textContent = (media[card.id] && media[card.id].url) ? 'Re-record' : 'Record';
      if (chunks.length) {
        const shared = await setAudio(card, new Blob(chunks, { type: rec.mimeType || 'audio/webm' }), statusEl, false);
        if (shared) sfx.chime();
        statusEl.textContent = !shared ? AUDIO_TOO_BIG : hitLimit
          ? `${MAX_AUDIO_SECONDS}s limit reached. Recording saved! You can test it below.`
          : 'Recording saved! You can test it below.';
        if (onDone) onDone(shared);
      }
    };
    rec.start();
    btn.textContent = 'Stop';
    statusEl.textContent = `Recording… it stops automatically after ${MAX_AUDIO_SECONDS} seconds.`;
    recTimer = setTimeout(() => { hitLimit = true; stopRecording(); }, MAX_AUDIO_SECONDS * 1000);
  }

  /* ----------------------------- Card previews ------------------------- */
  const cardTitle = (iconName, text, extra = '') =>
    el('h2', { class: `card-title ${extra}`.trim() }, iconName ? icon(iconName) : null, el('span', { text }));

  function previewCode(card) {
    const r = getRt(card.id);
    const root = el('div', { class: 'card' });
    const code = card.data.code;
    r.entered ||= '';
    function draw() {
      root.replaceChildren();
      if (r.unlocked) {
        root.append(cardTitle('unlock', card.data.question), el('p', { class: 'q-msg', text: 'Unlocked ♥' }));
        return;
      }
      const dots = Array.from({ length: code.length }, () => el('i'));
      const paint = () => dots.forEach((d, i) => d.classList.toggle('on', i < r.entered.length));
      const press = (d) => {
        if (r.entered.length >= code.length) return;
        r.entered += d;
        sfx.click();
        paint();
        if (r.entered.length === code.length) {
          if (r.entered === code) {
            r.unlocked = true;
            r.entered = '';
            sfx.chime();
            fx.sparkles();
            fx.confetti({ count: 35 });
            draw();
            notify();
          } else {
            r.entered = '';
            sfx.pop(260);
            root.classList.add('shake');
            setTimeout(() => { root.classList.remove('shake'); paint(); }, 350);
          }
        }
      };
      const key = (k, label, aria) => el('button', {
        type: 'button', class: 'key', 'data-k': k, 'aria-label': aria, text: label,
        onclick: () => { if (k === 'del') { r.entered = r.entered.slice(0, -1); sfx.click(); paint(); } else press(k); },
      });
      root.append(
        cardTitle('lock', card.data.question),
        el('div', { class: 'dots', 'aria-hidden': 'true' }, dots),
        el('div', { class: 'keypad' },
          ...['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((k) => key(k, k, `Digit ${k}`)),
          key('del', '⌫', 'Delete')));
      paint();
    }
    draw();
    return root;
  }

  function previewPuzzle(card) {
    const r = getRt(card.id);
    const m = media[card.id] || (card.data.photoData ? { url: card.data.photoData } : null);
    if (m && !r.order) { r.order = shuffled(); r.sel = null; r.solved = false; }
    const root = el('div', { class: 'card' });
    function draw() {
      root.replaceChildren(cardTitle(r.solved ? 'unlock' : 'lock', 'Photo puzzle'));
      const puzzle = el('div', { class: 'puzzle' });
      root.append(puzzle);
      if (!m) {
        puzzle.append(el('div', { class: 'puzzle-lines' }), el('div', { class: 'puzzle-empty', text: 'Upload the photo' }));
        return;
      }
      if (r.solved) {
        const whole = el('div', { class: 'tile', role: 'img', 'aria-label': 'Your unlocked photo' });
        whole.style.backgroundImage = `url("${m.url}")`;
        whole.style.backgroundSize = '100% 100%';
        whole.style.gridArea = '1 / 1 / 4 / 4';
        puzzle.append(whole);
        return;
      }
      r.order.forEach((piece, pos) => {
        const tile = el('button', {
          type: 'button', class: `tile${r.sel === pos ? ' sel' : ''}`,
          'aria-label': `Position ${pos + 1}${r.sel === pos ? ', selected' : ''}`,
          onclick: () => {
            sfx.pop(460);
            if (r.sel == null) r.sel = pos;
            else {
              if (r.sel !== pos) [r.order[r.sel], r.order[pos]] = [r.order[pos], r.order[r.sel]];
              r.sel = null;
              if (r.order.every((v, i) => v === i)) {
                r.solved = true;
                sfx.chime();
                fx.confetti({ count: 40 });
                toast('Puzzle solved ♥');
                notify();
              }
            }
            draw();
          },
        });
        tile.style.backgroundImage = `url("${m.url}")`;
        tile.style.backgroundPosition = `${(piece % 3) * 50}% ${Math.floor(piece / 3) * 50}%`;
        puzzle.append(tile);
      });
    }
    draw();
    return root;
  }

  function previewQuestion(card) {
    const r = getRt(card.id);
    const root = el('div', { class: 'card' });
    function draw() {
      root.replaceChildren();
      if (r.unlocked) {
        root.append(cardTitle('unlock', card.data.question), el('p', { class: 'q-msg', text: 'Unlocked ♥' }));
        return;
      }
      const input = el('input', { class: 'q-input', name: 'answer', type: 'text', maxlength: 60, placeholder: 'Type your answer', 'aria-label': 'Your answer', autocomplete: 'off' });
      const msg = el('p', { class: 'q-msg', 'aria-live': 'polite' });
      const form = el('form', {
        class: 'q-form',
        onsubmit: (e) => {
          e.preventDefault();
          const v = input.value.trim().toLowerCase();
          const a = card.data.answer.trim().toLowerCase();
          if (v && (!a || v === a)) {
            r.unlocked = true;
            sfx.chime();
            fx.sparkles();
            fx.confetti({ count: 35 });
            draw();
            notify();
          } else {
            sfx.pop(260);
            msg.textContent = 'Not quite — try again.';
          }
        },
      }, cardTitle('lock', card.data.question), input, el('button', { type: 'submit', class: 'q-btn', text: 'Unlock' }), msg);
      root.append(form);
    }
    draw();
    return root;
  }

  function previewVoice(card) {
    const r = getRt(card.id);
    const m = media[card.id];
    const timer = el('div', { class: 'timer', text: '0:00' });
    const waves = el('div', { class: 'audio-waves', 'aria-hidden': 'true' },
      ...Array.from({ length: 9 }, (_, i) => {
        const b = el('span', { class: 'wave-bar' });
        b.style.setProperty('--bar-i', String(i));
        return b;
      }));
    const btn = el('button', { type: 'button', class: 'play-btn', text: 'Play', disabled: !m });
    const actions = el('div', { class: 'play-actions' }, btn);
    const root = el('div', { class: 'card' }, cardTitle(null, 'Voice message'), cassette(), waves, timer, actions);
    if (!m) {
      root.append(el('p', { class: 'card-hint inline', text: 'Add a recording in Edit' }));
      return root;
    }
    const audio = new Audio(m.url);
    r.audio = audio;
    const paint = () => {
      const cur = audio.currentTime || 0;
      const dur = audio.duration || 0;
      timer.textContent = `${fmt(cur)} / ${fmt(dur)}`;
    };
    audio.addEventListener('loadedmetadata', paint);
    audio.addEventListener('timeupdate', paint);
    audio.addEventListener('play', () => { root.classList.add('playing'); btn.textContent = 'Pause'; });
    const stopped = () => { root.classList.remove('playing'); btn.textContent = 'Play'; };
    // After a full listen: offer Replay, and (in the recipient view) a Continue button.
    // The page no longer auto-advances, so the recipient can replay as often as they like.
    const showHeard = () => {
      btn.textContent = 'Replay ↺';
      if (!$('result').hidden && !actions.querySelector('.continue-btn')) {
        actions.append(el('button', {
          type: 'button', class: 'play-btn continue-btn', text: 'Continue →',
          onclick: () => { sfx.click(); advance(); },
        }));
      }
    };
    audio.addEventListener('pause', stopped);
    audio.addEventListener('ended', () => {
      stopped();
      audio.currentTime = 0;
      paint();
      r.heard = true;
      sfx.chime();
      showHeard();
      notify();
    });
    if (r.heard) showHeard();
    btn.addEventListener('click', () => {
      sfx.click();
      if (r.webAudioPlaying) {
        if (r.webAudioSource) {
          try { r.webAudioSource.stop(); } catch {}
          r.webAudioSource = null;
        }
        r.webAudioPlaying = false;
        stopped();
        return;
      }
      if (!audio.paused) {
        audio.pause();
        return;
      }
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('Standard Audio.play() failed, trying Web Audio API:', err);
          playWebAudioFallback(card, r, btn, root, timer, () => {
            r.heard = true;
            sfx.chime();
            showHeard();
            notify();
          });
        });
      }
    });
    return root;
  }

  function previewMessage(card) {
    const r = getRt(card.id);
    r.stage ||= 0;
    if (r.stage > 0 && r.stage < 3) r.stage = 3;
    const text = card.data.text || 'Your message will appear here.';

    const letterBody = el('div', { class: 'letter-body' });
    const paragraphs = text.split('\n');
    paragraphs.forEach((pText, pIdx) => {
      const pEl = el('p', { class: 'letter-p', text: pText || '\u00A0' });
      pEl.style.setProperty('--line-i', String(pIdx));
      letterBody.append(pEl);
    });

    const letter = el('div', { class: 'env-letter' },
      el('div', { class: 'letter-header', 'aria-hidden': 'true' },
        el('span', { class: 'letter-from-tag', text: state.from ? `From ${state.from}` : 'A Special Note' }),
        el('span', { class: 'letter-stamp', text: '💌' })),
      letterBody,
      el('div', { class: 'letter-footer', 'aria-hidden': 'true' }, el('span', { class: 'letter-seal-watermark', text: '♥' })));

    const len = Math.max(20, text.length);
    const fs = len <= 60 ? 5.2 : len <= 140 ? 4.8 : len <= 240 ? 4.3 : 3.9;
    letter.style.setProperty('--paper-fs', `${fs}cqw`);
    const hint = el('p', { class: 'card-hint', 'aria-live': 'polite' });
    const finishBtn = el('button', { type: 'button', class: 'read-btn', text: 'Finish Reading' });
    finishBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sfx.pop(620);
      sfx.chime();
      fx.hearts({ count: 25 });
      fx.sparkles({ count: 20 });
      r.read = true;
      paint();
      advance();
    });
    const wrap = el('div', { class: 'env-wrap', role: 'button', tabindex: '0', 'aria-label': 'Open Letter' },
      el('div', { class: 'env-shell' },
        el('div', { class: 'env-back' }),
        svg('svg', { class: 'env-front-svg', viewBox: '0 0 300 200', preserveAspectRatio: 'none', 'aria-hidden': 'true' },
          svg('path', { d: 'M 0 0 L 150 100 L 0 200 Z', fill: '#e8e2d4' }),
          svg('path', { d: 'M 300 0 L 150 100 L 300 200 Z', fill: '#ebe5d7' }),
          svg('path', { d: 'M 0 200 L 150 96 L 300 200 Z', fill: '#f4eee2' })),
        el('div', { class: 'env-flap-wrap' },
          svg('svg', { class: 'env-flap-svg', viewBox: '0 0 300 200', preserveAspectRatio: 'none', 'aria-hidden': 'true' },
            svg('path', { d: 'M 0 0 L 150 102 L 300 0 Z', fill: '#f7f2e7' })))),
      letter,
      seal());
    const paint = () => {
      wrap.classList.toggle('unsealed', r.stage >= 1);
      wrap.classList.toggle('out', r.stage >= 2);
      wrap.classList.toggle('paper', r.stage >= 3);
      wrap.setAttribute('aria-expanded', String(r.stage >= 3));
      hint.textContent = r.stage === 0 ? 'Tap to open your letter' : '';
      finishBtn.hidden = !(r.stage >= 3 && !r.read && !$('result').hidden);
    };
    const openLetter = () => {
      if (r.stage === 0) {
        sfx.seal();
        fx.sparkles({ count: 18 });
        r.stage = 1; paint();
        setTimeout(() => {
          r.stage = 2; paint();
          sfx.pop(480);
        }, reduceMotion ? 50 : 450);
        setTimeout(() => {
          r.stage = 3; paint();
          sfx.chime();
          fx.hearts({ count: 16 });
        }, reduceMotion ? 100 : 1100);
      } else if (r.stage === 3 && $('result').hidden) {
        r.stage = 0; paint();
      }
    };
    wrap.addEventListener('click', openLetter);
    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openLetter();
      }
    });
    paint();
    return el('div', { class: 'card' }, wrap, hint, finishBtn);
  }

  function previewSpin(card) {
    const r = getRt(card.id);
    r.spins ||= 0;
    const decoys = card.data.prizes.slice(0, 3);
    const bonus = card.data.prizes[3];
    const n = decoys.length;
    const reels = decoys.map(() => el('div', { class: 'reel' }));
    const cells = reels.map(() => [el('span'), el('span'), el('span')]);
    reels.forEach((reel, i) => reel.append(...cells[i]));
    const result = el('p', { class: 'slot-result', 'aria-live': 'polite' });
    const btn = el('button', { type: 'button', class: 'spin-btn' });
    const lever = el('div', { class: 'lever-mount', 'aria-hidden': 'true' }, el('div', { class: 'lever' }));
    const slot = el('div', { class: 'slot' }, bow(), lever,
      el('div', { class: 'slot-box' }, el('div', { class: 'slot-win' }, reels)));
    const title = el('h2', { class: 'card-title slot-title', text: card.data.title });
    const root = el('div', { class: 'card' }, title, slot, btn, result);
    let busy = false;

    function paint(announce = true) {
      const won = r.spins >= 1;
      reels.forEach((reel, i) => {
        cells[i][0].textContent = decoys[(i + 1) % n].e;
        cells[i][2].textContent = decoys[(i + 2) % n].e;
        cells[i][1].textContent = won ? bonus.e : '?';
        cells[i][1].classList.toggle('mystery', !won);
      });
      btn.textContent = won ? 'YOU WON!' : 'SPIN';
      btn.disabled = busy || won;
      result.textContent = won && announce ? `You won: ${bonus.e} ${bonus.t}` : '';
    }
    function reveal() {
      const name = el('p', { class: 'prize-name', 'aria-label': bonus.t });
      let i = 0;
      bonus.t.split(' ').forEach((word, w) => {
        if (w) name.append(' ');
        name.append(el('span', { class: 'prize-word', 'aria-hidden': 'true' },
          ...[...word].map((ch) => { const s = el('span', { class: 'ch', text: ch }); s.style.setProperty('--i', String(i++)); return s; })));
      });
      const claimBtn = el('button', { type: 'button', class: 'claim-btn', text: 'Claim your gift' });
      claimBtn.addEventListener('click', () => {
        sfx.fanfare();
        fx.confetti({ count: 60 });
        fx.hearts({ count: 25 });
        r.claimed = true;
        advance();
      });
      const pop = el('div', { class: 'prize-pop', role: 'status' },
        el('div', { class: 'prize-rays', 'aria-hidden': 'true' }),
        el('p', { class: 'prize-lead', text: 'You have won' }),
        name,
        el('div', { class: 'gb', 'aria-hidden': 'true' },
          el('div', { class: 'gb-box' }),
          el('div', { class: 'gb-lid' }, el('span', { class: 'gb-bow', text: '🎀' }))),
        claimBtn);
      setTimeout(() => {
        [title, slot, btn, result].forEach((x) => x.classList.add('fade-out'));
        setTimeout(() => {
          root.replaceChildren(pop);
          setTimeout(() => {
            sfx.pop(640);
            fx.sparkles({ count: 28 });
            fx.confetti({ count: 45 });
          }, 1200);
        }, reduceMotion ? 0 : 450);
      }, reduceMotion ? 0 : 700);
    }
    function spin() {
      if (busy || r.spins >= 1) return;
      busy = true;
      btn.disabled = true;
      sfx.click();
      slot.classList.add('pulled');
      setTimeout(() => slot.classList.remove('pulled'), 260);

      reels.forEach((reel) => {
        reel.classList.add('spinning');
        reel.classList.remove('locked');
      });

      const stoppedReels = [false, false, false];
      let tickRate = 80;

      const tickTimer = setInterval(() => {
        sfx.tick(1000 + Math.random() * 400);
        reels.forEach((reel, i) => {
          if (!stoppedReels[i]) {
            cells[i][0].textContent = decoys[Math.floor(Math.random() * n)].e;
            cells[i][1].textContent = decoys[Math.floor(Math.random() * n)].e;
            cells[i][2].textContent = decoys[Math.floor(Math.random() * n)].e;
            cells[i][1].classList.remove('mystery');
          }
        });
      }, tickRate);

      // Reel 1 stop
      setTimeout(() => {
        if (reduceMotion) return;
        stoppedReels[0] = true;
        reels[0].classList.remove('spinning');
        reels[0].classList.add('locked');
        cells[0][0].textContent = decoys[1 % n].e;
        cells[0][1].textContent = bonus.e;
        cells[0][2].textContent = decoys[2 % n].e;
        sfx.reelLock(520);
        const rRect = reels[0].getBoundingClientRect();
        fx.sparkles({ x: rRect.left + rRect.width / 2, y: rRect.top + rRect.height / 2, count: 6 });
      }, reduceMotion ? 40 : 750);

      // Reel 2 stop
      setTimeout(() => {
        if (reduceMotion) return;
        stoppedReels[1] = true;
        reels[1].classList.remove('spinning');
        reels[1].classList.add('locked');
        cells[1][0].textContent = decoys[2 % n].e;
        cells[1][1].textContent = bonus.e;
        cells[1][2].textContent = decoys[0 % n].e;
        sfx.reelLock(660);
        const rRect = reels[1].getBoundingClientRect();
        fx.sparkles({ x: rRect.left + rRect.width / 2, y: rRect.top + rRect.height / 2, count: 8 });
      }, reduceMotion ? 80 : 1150);

      // Reel 3 stop (Jackpot!)
      setTimeout(() => {
        clearInterval(tickTimer);
        stoppedReels[2] = true;
        reels.forEach((reel, i) => {
          reel.classList.remove('spinning');
          reel.classList.add('locked');
          cells[i][0].textContent = decoys[(i + 1) % n].e;
          cells[i][1].textContent = bonus.e;
          cells[i][1].classList.remove('mystery');
          cells[i][2].textContent = decoys[(i + 2) % n].e;
        });
        slot.classList.remove('pulled');
        slot.classList.add('jackpot-win');
        sfx.jackpot();
        fx.confetti({ count: 40 });

        r.spins += 1;
        busy = false;
        paint(false);
        reveal();
        notify();
      }, reduceMotion ? 120 : 1550);
    }
    btn.addEventListener('click', spin);
    if (r.spins >= 1) {
      const name = el('p', { class: 'prize-name', 'aria-label': bonus.t });
      let i = 0;
      bonus.t.split(' ').forEach((word, w) => {
        if (w) name.append(' ');
        name.append(el('span', { class: 'prize-word', 'aria-hidden': 'true' },
          ...[...word].map((ch) => { const s = el('span', { class: 'ch', text: ch }); s.style.setProperty('--i', String(i++)); return s; })));
      });
      const claimBtn = el('button', { type: 'button', class: 'claim-btn', text: 'Claim your gift' });
      claimBtn.addEventListener('click', () => {
        sfx.fanfare();
        fx.confetti({ count: 60 });
        fx.hearts({ count: 25 });
        r.claimed = true;
        advance();
      });
      return el('div', { class: 'card' },
        el('div', { class: 'prize-pop', role: 'status' },
          el('div', { class: 'prize-rays', 'aria-hidden': 'true' }),
          el('p', { class: 'prize-lead', text: 'You have won' }),
          name,
          el('div', { class: 'gb', 'aria-hidden': 'true' },
            el('div', { class: 'gb-box' }),
            el('div', { class: 'gb-lid' }, el('span', { class: 'gb-bow', text: '🎀' }))),
          claimBtn));
    }
    paint();
    return root;
  }

  const PREVIEWS = {
    code: previewCode,
    puzzle: previewPuzzle,
    question: previewQuestion,
    voice: previewVoice,
    message: previewMessage,
    spin: previewSpin,
  };

  /* ------------------------------ Edit panels -------------------------- */
  function field(card, key, label, props, bind) {
    const id = `${card.id}-${key}`;
    const isArea = props.tag === 'textarea';
    const input = el(props.tag || 'input', { id, class: `edit-in${isArea ? ' edit-ta' : ''}`, type: isArea ? null : 'text', ...props.attrs });
    input.value = bind.get();
    const max = props.attrs && props.attrs.maxlength;
    let counter = null;
    if (props.showCounter && max) {
      counter = el('span', { class: 'field-counter', text: `${input.value.length} / ${max}` });
    }
    input.addEventListener('input', () => {
      if (props.digits) input.value = input.value.replace(/\D/g, '');
      bind.set(input.value);
      if (counter && max) counter.textContent = `${input.value.length} / ${max}`;
    });
    const labelRow = counter
      ? el('div', { class: 'label-row' }, el('label', { class: 'edit-label', for: id, text: label }), counter)
      : el('label', { class: 'edit-label', for: id, text: label });
    return [labelRow, input];
  }

  function fileRow(card, label, accept, onFile, extra) {
    const status = el('p', { class: 'rec-status', 'aria-live': 'polite' });
    const input = el('input', { class: 'file-input', type: 'file', accept, id: `${card.id}-file`, tabindex: '-1' });
    input.addEventListener('change', () => {
      if (input.files && input.files[0]) onFile(input.files[0], status);
      input.value = '';
    });
    const pick = el('button', { type: 'button', class: 'file-btn', text: label, onclick: () => input.click() });
    return [el('div', { class: 'rec-row' }, pick, extra ? extra(status) : null), input, status];
  }

  function buildVoiceEdit(card) {
    const r = getRt(card.id);
    const wrap = el('div', { class: 'voice-edit-group' });
    const statusEl = el('p', { class: 'rec-status', 'aria-live': 'polite' });
    const previewSlot = el('div', { class: 'rec-preview-slot' });

    const input = el('input', { class: 'file-input', type: 'file', accept: 'audio/*', id: `${card.id}-file`, tabindex: '-1' });
    const pickBtn = el('button', { type: 'button', class: 'file-btn', onclick: () => input.click() });
    const recBtn = el('button', { type: 'button', class: 'file-btn' });

    recBtn.addEventListener('click', () => {
      startRecording(card, statusEl, recBtn, () => updateUI());
    });
    input.addEventListener('change', () => {
      if (input.files && input.files[0]) {
        setAudioFile(card, input.files[0], statusEl, () => updateUI());
      }
      input.value = '';
    });

    function updateUI() {
      const hasAudio = !!(media[card.id] && media[card.id].url);
      pickBtn.textContent = hasAudio ? 'Replace audio' : 'Upload audio';
      if (!recorder || recorder.state !== 'recording') {
        recBtn.textContent = hasAudio ? 'Re-record' : 'Record';
      }
      previewSlot.replaceChildren();

      if (hasAudio) {
        if (r.editAudio) { r.editAudio.pause(); r.editAudio = null; }
        const editAudio = new Audio(media[card.id].url);
        r.editAudio = editAudio;

        const durBadge = el('span', { class: 'rec-dur-badge', text: '' });
        const badge = el('div', { class: 'rec-success-badge' },
          el('span', { class: 'rec-success-icon', 'aria-hidden': 'true' }, icon('check')),
          el('span', { text: 'Voice clip ready' }),
          durBadge
        );

        const playBtn = el('button', { type: 'button', class: 'rec-play-btn', 'aria-label': 'Play voice clip' },
          icon('play'), el('span', { text: 'Play' })
        );
        const timeEl = el('span', { class: 'rec-player-time', text: '0:00 / 0:00' });
        const fill = el('span', { class: 'rec-progress-fill' });
        const track = el('div', { class: 'rec-progress-track', role: 'progressbar', 'aria-label': 'Playback progress' }, fill);

        track.addEventListener('click', (e) => {
          if (!editAudio.duration) return;
          const rect = track.getBoundingClientRect();
          const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          editAudio.currentTime = pos * editAudio.duration;
        });

        const updateTime = () => {
          const cur = editAudio.currentTime || 0;
          const dur = editAudio.duration || 0;
          timeEl.textContent = `${fmt(cur)} / ${fmt(dur)}`;
          durBadge.textContent = dur ? `(${fmt(dur)})` : '';
          fill.style.width = dur ? `${Math.min(100, (cur / dur) * 100)}%` : '0%';
        };

        editAudio.addEventListener('loadedmetadata', updateTime);
        editAudio.addEventListener('timeupdate', updateTime);

        editAudio.addEventListener('play', () => {
          playBtn.replaceChildren(icon('pause'), el('span', { text: 'Pause' }));
        });
        const onStop = () => {
          playBtn.replaceChildren(icon('play'), el('span', { text: 'Play' }));
        };
        editAudio.addEventListener('pause', onStop);
        editAudio.addEventListener('ended', () => {
          onStop();
          editAudio.currentTime = 0;
          updateTime();
        });

        playBtn.addEventListener('click', () => {
          sfx.click();
          if (editAudio.paused) {
            stopAllAudio();
            r.editAudio = editAudio;
            editAudio.play().catch(() => toast('Could not play this audio.'));
          } else {
            editAudio.pause();
          }
        });

        const removeBtn = el('button', {
          type: 'button', class: 'rec-remove-btn', 'aria-label': 'Remove audio clip',
          onclick: () => {
            sfx.click();
            if (r.editAudio) { r.editAudio.pause(); r.editAudio = null; }
            revokeMedia(card.id);
            card.data.audioData = '';
            if (state.draft && state.editingId === card.id) state.draft.audioData = '';
            save();
            statusEl.textContent = 'Audio removed.';
            updateUI();
          }
        }, icon('trash'), el('span', { text: 'Remove' }));

        const previewHead = el('div', { class: 'rec-preview-head' }, badge, removeBtn);
        const playerRow = el('div', { class: 'rec-player' }, playBtn, track, timeEl);
        const previewBox = el('div', { class: 'rec-preview-box' }, previewHead, playerRow);
        previewSlot.append(previewBox);

        if (editAudio.readyState >= 1) updateTime();
      }
    }

    updateUI();

    const row = el('div', { class: 'rec-row' }, pickBtn, recBtn);
    wrap.append(row, input, statusEl, previewSlot);
    return wrap;
  }

  function editPanel(card) {
    const d = state.draft;
    const root = el('div', { class: 'card editing' });
    const err = el('p', { class: 'err', role: 'alert' });
    card.err = err;
    switch (card.type) {
      case 'code':
        root.append(el('h2', { class: 'edit-title', text: 'Customize your Secret Code' }),
          ...field(card, 'q', 'Question', { attrs: { maxlength: 60 } }, { get: () => d.question, set: (v) => { d.question = v; } }),
          ...field(card, 'c', 'Secret code · 4–8 digits', { digits: true, attrs: { maxlength: 8, inputmode: 'numeric', autocomplete: 'off' } }, { get: () => d.code, set: (v) => { d.code = v; } }));
        break;
      case 'puzzle':
        root.append(el('h2', { class: 'edit-title', text: 'Customize your Photo Puzzle' }),
          el('p', { class: 'edit-label', text: 'Photo' }),
          ...fileRow(card, media[card.id] || card.data.photoData ? 'Replace photo' : 'Upload photo', IMAGE_TYPES.join(','), (f, s) => setPhoto(card, f, s)),
          el('p', { class: 'edit-note', text: 'JPG, PNG or WebP up to 10 MB. It is cropped to a square.' }));
        break;
      case 'question':
        root.append(el('h2', { class: 'edit-title', text: 'Customize your Little Question' }),
          ...field(card, 'q', 'Question', { attrs: { maxlength: 80 } }, { get: () => d.question, set: (v) => { d.question = v; } }),
          ...field(card, 'a', 'Answer', { attrs: { maxlength: 60, autocomplete: 'off' } }, { get: () => d.answer, set: (v) => { d.answer = v; } }),
          el('p', { class: 'edit-note', text: 'Not case-sensitive. Leave blank to accept any answer.' }));
        break;
      case 'voice':
        root.append(
          el('h2', { class: 'edit-title', text: 'Customize your Voice Message' }),
          el('p', { class: 'edit-label', text: `Recording · up to ${MAX_AUDIO_SECONDS}s` }),
          buildVoiceEdit(card)
        );
        break;
      case 'message':
        root.append(el('h2', { class: 'edit-title', text: 'Customize your Message' }),
          ...field(card, 't', 'Your letter', { tag: 'textarea', showCounter: true, attrs: { maxlength: 400, rows: 6 } }, { get: () => d.text, set: (v) => { d.text = v; } }));
        break;
      default:
        root.append(el('h2', { class: 'edit-title', text: 'Customize your Spin To Win' }),
          ...field(card, 't', 'Card title', { attrs: { maxlength: 30 } }, { get: () => d.title, set: (v) => { d.title = v; } }));
        d.prizes.forEach((p, i) => {
          const tId = `${card.id}-p${i}`;
          const t = el('input', { id: tId, class: 'edit-in', type: 'text', maxlength: 40 });
          t.value = p.t;
          t.addEventListener('input', () => { p.t = t.value; });
          const label = i === d.prizes.length - 1 ? 'Guaranteed win (always won)' : `Reel prize ${i + 1} (decoy)`;
          root.append(el('label', { class: 'edit-label', for: tId, text: label }), t);
        });
    }
    root.append(err);
    return root;
  }

  function validate(card, d) {
    switch (card.type) {
      case 'code':
        if (!d.question.trim()) return 'Please enter a question.';
        return /^\d{4,8}$/.test(d.code) ? '' : 'The secret code must be 4–8 digits.';
      case 'puzzle':
        return (media[card.id] || card.data.photoData) ? '' : 'Please upload a photo.';
      case 'voice':
        if (!media[card.id]) return 'Please record or upload audio.';
        return d.audioData ? '' : 'This clip is too large for a share link. Record or upload a shorter one.';
      case 'question':
        return d.question.trim() ? '' : 'Please enter a question.';
      case 'spin':
        if (!d.title.trim()) return 'Please enter a card title.';
        return d.prizes.every((p) => p.t.trim()) ? '' : 'Every prize needs a name.';
      default: return '';
    }
  }

  /* ------------------------------ Card list ---------------------------- */
  function iconBtn(name, label, onclick, disabled) {
    return el('button', { type: 'button', class: 'tb-btn', 'aria-label': label, onclick, disabled }, icon(name));
  }
  function toolbar(card, i, editing) {
    const last = state.cards.length - 1;
    const up = iconBtn('up', 'Move up', () => move(i, -1), i === 0);
    const down = iconBtn('down', 'Move down', () => move(i, 1), i === last);
    if (editing) {
      return el('div', { class: 'toolbar' },
        iconBtn('x', 'Cancel editing', () => { stopRecording(); state.editingId = null; state.draft = null; renderCards(); }),
        up, down,
        el('button', { type: 'button', class: 'tb-btn done', onclick: () => done(card) }, icon('save'), el('span', { text: 'Done' })));
    }
    return el('div', { class: 'toolbar' },
      iconBtn('trash', 'Delete card', () => remove(card)),
      up, down,
      el('button', { type: 'button', class: 'tb-btn edit', onclick: () => edit(card) }, icon('edit'), el('span', { text: 'Edit' })));
  }

  function edit(card) {
    state.editingId = card.id;
    state.draft = JSON.parse(JSON.stringify(card.data));
    renderCards();
  }
  function done(card) {
    const d = state.draft;
    const msg = validate(card, d);
    if (msg) { card.err.textContent = msg; return; }
    stopRecording();
    card.data = cleanData(card.type, d);
    const keepOrder = card.type === 'puzzle' ? rt[card.id] && rt[card.id].order : null;
    delete rt[card.id];
    if (keepOrder) getRt(card.id).order = keepOrder;
    state.editingId = null; state.draft = null;
    save();
    renderCards();
  }
  function move(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= state.cards.length) return;
    [state.cards[i], state.cards[j]] = [state.cards[j], state.cards[i]];
    save();
    renderCards();
  }
  function remove(card) {
    state.cards = state.cards.filter((c) => c !== card);
    if (state.editingId === card.id) { state.editingId = null; state.draft = null; }
    revokeMedia(card.id);
    delete rt[card.id];
    save();
    renderCards();
  }

  function renderCards() {
    stopAllAudio();
    const list = $('cards');
    list.replaceChildren();
    state.cards.forEach((card, i) => {
      const editing = state.editingId === card.id;
      list.append(el('div', { class: 'card-wrap' }, editing ? editPanel(card) : PREVIEWS[card.type](card), toolbar(card, i, editing)));
    });
    renderPicker();
    updateNextLabel();
  }

  function renderPicker() {
    $('addpage').replaceChildren(...TYPES.map((t) => typeItem(t, false, () => {
      if (state.editingId) { toast('Tap Done on the card you are editing first.'); return; }
      if (state.cards.length >= MAX_CARDS) { toast(`You can have up to ${MAX_CARDS} pages.`); return; }
      state.cards.push(newCard(t.id));
      save();
      renderCards();
      const wraps = $('cards').querySelectorAll('.card-wrap');
      wraps[wraps.length - 1].scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    }, state.cards.some((c) => c.type === t.id))));
  }

  /* ------------------------ Header, steps, theme ----------------------- */
  function applyTheme() {
    const t = THEMES.find((x) => x.id === state.theme);
    const root = document.documentElement.style;
    root.setProperty('--card', t.card);
    root.setProperty('--card-ink', t.ink);
    root.setProperty('--accent', t.accent);
    root.setProperty('--accent-ink', t.accentInk);
    root.setProperty('--brand', t.brand);
  }
  function renderThemes() {
    $('themes').replaceChildren(...THEMES.map((t) => {
      const art = svg('svg', { viewBox: '0 0 48 48', stroke: t.line, 'aria-hidden': 'true' }, ...t.shapes());
      const b = el('button', {
        type: 'button', class: 'theme-btn', 'aria-label': t.name, 'aria-pressed': String(state.theme === t.id),
        onclick: () => { state.theme = t.id; save(); applyTheme(); renderThemes(); },
      }, art);
      b.style.background = t.swatch;
      return b;
    }));
  }

  function updateSummary() {
    const from = state.from.trim(), to = state.to.trim();
    $('summary').textContent = from && to ? `A gift from ${from} to ${to}.` : '';
    $('tp-to').textContent = to ? `For ${to}` : 'For someone special';
    $('tp-from').textContent = from ? `From ${from}` : '';
  }

  /* ------------------------------- Wizard ------------------------------ */
  let wizStep = 1;
  function updateNextLabel() {
    $('next-btn').textContent = wizStep === 3 ? 'Finish ✓' : 'Next →';
  }
  function goStep(n) {
    wizStep = n;
    document.querySelectorAll('#builder .step').forEach((s) => { s.hidden = Number(s.dataset.step) !== n; });
    $('wiz-count').textContent = `Step ${n} of 3`;
    document.querySelectorAll('.wiz-progress i').forEach((d, i) => d.classList.toggle('on', i < n));
    $('wiz-back').hidden = n === 1;
    updateNextLabel();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
  function nextStep() {
    if (wizStep === 1 && (!state.from.trim() || !state.to.trim())) {
      toast('Please add both names to continue.');
      return;
    }
    if (wizStep === 3) {
      if (!checkCardsReady()) return;
      showModal($('finish-modal'));
      return;
    }
    goStep(wizStep + 1);
  }

  /* ------------------------------- Finish ------------------------------ */
  let viewPages = [];
  let viewIndex = 0;

  function showResult(on) {
    $('builder').hidden = on;
    $('result').hidden = !on;
    document.body.classList.toggle('viewing', on);
    window.scrollTo({ top: 0, behavior: 'auto' });
    if (on) {
      initFxCanvas();
      const exitBtn = $('exit-btn');
      exitBtn.textContent = '← Edit';
      exitBtn.style.visibility = isRecipientMode ? 'hidden' : '';
    }
  }

  function pageDone(card) {
    const r = rt[card.id] || {};
    switch (card.type) {
      case 'code': case 'question': return !card.data.question || !!r.unlocked;
      case 'puzzle': return !(media[card.id] || card.data.photoData) || !!r.solved;
      case 'voice': return !media[card.id] || !!r.heard;
      case 'message': return !!r.read;
      case 'spin': return !!r.claimed;
      default: return true;
    }
  }

  let advanceTimer = null;
  function notify() {
    clearTimeout(advanceTimer);
    if ($('result').hidden) return;

    const n = viewPages.length;
    if (!n || viewIndex < 0 || viewIndex >= n) return;
    const card = viewPages[viewIndex];
    if (!pageDone(card)) return;
    if (card.type === 'voice') return;   // voice waits for the recipient (Replay / Continue)
    advanceTimer = setTimeout(advance, 1000);
  }

  function welcomeCard() {
    return el('div', { class: 'card welcome' },
      el('div', { class: 'ending-badge', text: '🎁', 'aria-hidden': 'true' }),
      el('h1', { class: 'welcome-title', text: `Welcome ${state.to.trim()}!` }),
      el('p', { class: 'welcome-sub', text: `${state.from.trim()} has a surprise for you!` }),
      el('button', {
        type: 'button', class: 'open-btn', text: 'Open your surprise',
        onclick: () => {
          sfx.pop(640);
          fx.sparkles({ count: 25 });
          fx.hearts({ count: 18 });
          viewIndex = 0;
          renderPage();
        },
      }));
  }

  function downloadKeepsake() {
    sfx.pop();
    fx.confetti({ count: 40 });

    const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const fromName = esc(state.from.trim()) || 'Someone special';
    const toName = esc(state.to.trim()) || 'You';
    const theme = THEMES.find((t) => t.id === state.theme) || THEMES[0];
    const today = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

    const cardBlocks = state.cards.map((c, idx) => {
      let content = '';
      if (c.type === 'message') {
        content = `<div class="letter">${esc(c.data.text || '').replace(/\n/g, '<br>')}</div>`;
      } else if (c.type === 'voice') {
        const audioSrc = c.data.audioData || (media[c.id] && media[c.id].url) || '';
        content = audioSrc
          ? `<div class="audio-wrap"><p class="note">Voice note:</p><audio controls src="${audioSrc}"></audio></div>`
          : `<p class="note">Voice note</p>`;
      } else if (c.type === 'puzzle') {
        const imgSrc = c.data.photoData || (media[c.id] && media[c.id].url) || '';
        content = imgSrc
          ? `<div class="photo-wrap"><img src="${imgSrc}" alt="Memory photo" /></div>`
          : `<p class="note">Photo memory</p>`;
      } else if (c.type === 'code') {
        content = `<p class="q">${esc(c.data.question || 'Passcode')}</p><p class="badge">Passcode: <strong>${esc(c.data.code || '')}</strong></p>`;
      } else if (c.type === 'question') {
        content = `<p class="q">${esc(c.data.question || '')}</p>${c.data.answer ? `<p class="badge">Answer: <strong>${esc(c.data.answer)}</strong></p>` : ''}`;
      } else if (c.type === 'spin') {
        const win = c.data.prizes && c.data.prizes[c.data.prizes.length - 1];
        content = win ? `<p class="prize-tag">${esc(win.e || '🎁')} <strong>${esc(win.t || 'Winner')}</strong></p>` : '';
      }
      return `
        <section class="card-item">
          <div class="card-num">Page ${idx + 1} · ${c.type.toUpperCase()}</div>
          ${content}
        </section>
      `;
    }).join('\n');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Gift Keepsake – From ${fromName} to ${toName}</title>
  <style>
    :root {
      --bg: #f9f6f2;
      --card-bg: ${theme.card || '#82261b'};
      --card-ink: ${theme.ink || '#fbeedd'};
      --accent: ${theme.accent || '#f1e8d3'};
      --accent-ink: ${theme.accentInk || '#7f2419'};
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: #1f1a17;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 32px 16px 48px;
      display: flex;
      justify-content: center;
    }
    .wrap {
      width: 100%;
      max-width: 520px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .header {
      background: var(--card-bg);
      color: var(--card-ink);
      padding: 32px 24px;
      border-radius: 24px;
      text-align: center;
      box-shadow: 0 10px 25px rgba(0,0,0,0.12);
    }
    .header-badge { font-size: 48px; margin-bottom: 8px; }
    .header-title { font-size: 26px; font-weight: 700; margin-bottom: 6px; }
    .header-sub { font-size: 16px; opacity: 0.9; }
    .header-date { font-size: 13px; opacity: 0.75; margin-top: 10px; }
    .card-item {
      background: #fff;
      border: 1px solid #e5e0d8;
      border-radius: 20px;
      padding: 24px;
      box-shadow: 0 4px 14px rgba(0,0,0,0.04);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .card-num {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--accent-ink);
      opacity: 0.8;
    }
    .letter {
      font-size: 16px;
      line-height: 1.6;
      white-space: pre-wrap;
      color: #2b2520;
    }
    .note { font-size: 14px; opacity: 0.8; font-weight: 600; }
    .audio-wrap audio { width: 100%; margin-top: 8px; border-radius: 8px; }
    .photo-wrap img { width: 100%; max-height: 420px; object-fit: cover; border-radius: 14px; }
    .q { font-size: 17px; font-weight: 600; color: #222; }
    .badge, .prize-tag {
      display: inline-block;
      align-self: flex-start;
      background: var(--accent);
      color: var(--accent-ink);
      padding: 8px 14px;
      border-radius: 12px;
      font-size: 15px;
    }
    .footer {
      text-align: center;
      font-size: 13px;
      color: #887b74;
      margin-top: 10px;
    }
  </style>
</head>
<body>
  <main class="wrap">
    <header class="header">
      <div class="header-badge">💝</div>
      <h1 class="header-title">A Special Surprise</h1>
      <p class="header-sub">From <strong>${fromName}</strong> to <strong>${toName}</strong></p>
      <p class="header-date">Kept with love · ${today}</p>
    </header>
    ${cardBlocks}
    <footer class="footer">
      ♥ Saved as a personal offline keepsake
    </footer>
  </main>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = (state.from + '_' + state.to).replace(/[^a-zA-Z0-9_-]/g, '_');
    a.download = `Keepsake_from_${safeName || 'Gift'}.html`;
    a.href = url;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 1000);

    toast('Keepsake saved to your device!');
  }

  function endingCard() {
    sfx.fanfare();
    fx.hearts({ count: 35 });
    fx.confetti({ count: 50 });

    const replayBtn = el('button', {
      type: 'button', class: 'replay-btn', text: 'Replay Surprise ↺',
      onclick: () => {
        sfx.pop();
        fx.sparkles({ count: 20 });
        viewPages.forEach((c) => { delete rt[c.id]; });
        viewIndex = -1;
        renderPage();
      },
    });

    const downloadBtn = el('button', {
      type: 'button', class: 'save-keepsake-btn', text: 'Save Keepsake 💾',
      onclick: downloadKeepsake,
    });

    return el('div', { class: 'card ending-card' },
      el('div', { class: 'ending-badge', text: '💝', 'aria-hidden': 'true' }),
      el('h2', { class: 'ending-title', text: 'With love ♥' }),
      el('p', { class: 'ending-sub', text: `From ${state.from.trim()} to ${state.to.trim()}` }),
      el('div', { class: 'ending-actions' }, replayBtn, downloadBtn));
  }

  function renderPage() {
    stopAllAudio();
    clearTimeout(advanceTimer);
    const n = viewPages.length;
    const stage = $('stage');
    if (viewIndex < 0) {
      stage.replaceChildren(welcomeCard());
    } else if (viewIndex >= n) {
      stage.replaceChildren(endingCard());
    } else {
      stage.replaceChildren(PREVIEWS[viewPages[viewIndex].type](viewPages[viewIndex]));
    }
    notify();
  }

  function advance() {
    if (viewIndex >= viewPages.length || !pageDone(viewPages[viewIndex])) return;
    viewIndex += 1;
    renderPage();
  }

  function finish() {
    if (!checkCardsReady()) return;
    stopAllAudio();
    viewPages = state.cards.slice();
    viewPages.forEach((c) => { delete rt[c.id]; });
    viewIndex = -1;
    showResult(true);
    renderPage();
  }

  function checkUrlPayload() {
    let code = '';
    if (window.location.hash && window.location.hash.includes('gift=')) {
      const match = window.location.hash.match(/gift=([^&]+)/);
      if (match) code = match[1];
    } else {
      const params = new URLSearchParams(window.location.search);
      if (params.get('gift')) code = params.get('gift');
    }
    if (!code) return false;
    const hash = window.location.hash;
    const cutOff = /[&#]v=2(&|$)/.test(hash) && !/[&#]e=1(\/|#|\?|$)/.test(hash);
    const decoded = cutOff ? null : decodeGiftData(code);
    if (!decoded) linkBroken = true;
    if (decoded && decoded.from && decoded.to && Array.isArray(decoded.cards)) {
      const audio = readAudioParams(hash);
      const photos = readPhotoParams(hash);
      isRecipientMode = true;
      state.from = decoded.from.slice(0, 40);
      state.to = decoded.to.slice(0, 40);
      if (THEMES.some((t) => t.id === decoded.theme)) state.theme = decoded.theme;
      state.cards = decoded.cards
        .filter((c) => c && TYPES.some((t) => t.id === c.type))
        .map((c, i) => {
          const cardId = newId();
          const rawPhoto = (c.type === 'puzzle' && (photos[i] || (c.data && c.data.photoData))) || '';
          const rawAudio = (c.type === 'voice' && (audio[i] || (c.data && c.data.audioData))) || '';
          const raw = c.type === 'puzzle' ? { photoData: rawPhoto } : c.type === 'voice' ? { audioData: rawAudio } : c.data;
          const clean = cleanData(c.type, raw);
          restoreMedia(cardId, c.type, clean);
          return { id: cardId, type: c.type, data: clean };
        });
      return true;
    }
    return false;
  }

  /* -------------------------------- Init ------------------------------- */
  function init() {
    load();

    const hasPayload = checkUrlPayload();

    $('from').value = state.from;
    $('to').value = state.to;
    $('from').addEventListener('input', (e) => { state.from = e.target.value; save(); updateSummary(); });
    $('to').addEventListener('input', (e) => { state.to = e.target.value; save(); updateSummary(); });
    $('finish').addEventListener('click', () => { hideModal($('finish-modal')); finish(); });
    $('close-finish').addEventListener('click', () => hideModal($('finish-modal')));
    $('finish-modal').addEventListener('click', (e) => { if (e.target === $('finish-modal')) hideModal($('finish-modal')); });
    $('next-btn').addEventListener('click', nextStep);
    $('wiz-back').addEventListener('click', () => goStep(wizStep - 1));

    const shareBtn = $('share-btn');
    if (shareBtn) shareBtn.addEventListener('click', () => { hideModal($('finish-modal')); openShareModal(); });

    const nativeShareBtn = $('native-share-btn');
    if (nativeShareBtn) nativeShareBtn.addEventListener('click', handleNativeShare);

    const copyBtn = $('copy-btn');
    if (copyBtn) copyBtn.addEventListener('click', copyShareUrl);

    const qrBtn = $('qr-btn');
    if (qrBtn) qrBtn.addEventListener('click', toggleQRCode);

    const downloadQrBtn = $('download-qr-btn');
    if (downloadQrBtn) downloadQrBtn.addEventListener('click', downloadQRCode);

    const shareInput = $('share-url');
    if (shareInput) {
      shareInput.addEventListener('click', () => {
        shareInput.select();
        copyShareUrl();
      });
    }

    const openLinkBtn = $('open-link-btn');
    if (openLinkBtn) {
      openLinkBtn.addEventListener('click', () => {
        const shareUrl = $('share-url').value;
        if (shareUrl) window.open(shareUrl, '_blank');
      });
    }

    const closeShare = $('close-share');
    const shareModal = $('share-modal');
    if (closeShare && shareModal) {
      closeShare.addEventListener('click', () => hideModal(shareModal));
      shareModal.addEventListener('click', (e) => {
        if (e.target === shareModal) hideModal(shareModal);
      });
    }

    const exitBtn = $('exit-btn');
    if (exitBtn) {
      exitBtn.addEventListener('click', () => {
        stopAllAudio();
        if (isRecipientMode) {
          window.location.hash = '';
          isRecipientMode = false;
        }
        showResult(false);
      });
    }

    const soundBtn = $('sound-btn');
    if (soundBtn) {
      soundBtn.textContent = soundMuted ? '🔇' : '🔊';
      soundBtn.addEventListener('click', () => {
        soundMuted = !soundMuted;
        try { localStorage.setItem('pp_muted', soundMuted ? '1' : '0'); } catch {}
        soundBtn.textContent = soundMuted ? '🔇' : '🔊';
        if (!soundMuted) sfx.pop();
      });
    }

    window.addEventListener('hashchange', () => {
      if (checkUrlPayload()) {
        applyTheme();
        viewPages = state.cards.slice();
        viewPages.forEach((c) => { delete rt[c.id]; });
        viewIndex = -1;
        showResult(true);
        renderPage();
      }
    });

    applyTheme();
    renderThemes();
    renderCards();
    updateSummary();

    if (linkBroken) toast('This gift link looks cut off or incomplete. Ask the sender to send the full link again.', 9000);
    if (hasPayload && state.cards.length > 0) {
      viewPages = state.cards.slice();
      viewPages.forEach((c) => { delete rt[c.id]; });
      viewIndex = -1;
      showResult(true);
      renderPage();
    }

    window.addEventListener('pagehide', stopAllAudio);

    if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
      });
    }
  }

  init();
})();
