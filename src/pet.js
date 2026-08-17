const api = window.petAPI;
const BUILTIN = ['cat', 'dog', 'slime', 'bunny', 'alien'];
const stage = document.getElementById('stage');
const fx = document.getElementById('fx');

const BOARD_W = 252;
const BOARD_H = 288;

const IRON_SVG = '<svg viewBox="0 0 120 90" width="90" height="68"><defs><linearGradient id="ig" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff6b6b"/><stop offset="1" stop-color="#d93025"/></linearGradient></defs><path d="M30 38 C32 12 70 12 74 38 Z" fill="#5b6470"/><rect x="38" y="10" width="28" height="9" rx="4.5" fill="#39424e"/><path d="M6 46 L112 46 L96 74 L20 74 Z" fill="url(#ig)"/><path d="M20 74 L96 74 L92 82 L22 82 Z" fill="#8f9aa6"/><g fill="#3a2e2a"><circle cx="48" cy="52" r="3.5"/><circle cx="68" cy="52" r="3.5"/></g><path d="M50 62 Q58 67 66 62" fill="none" stroke="#3a2e2a" stroke-width="2.5" stroke-linecap="round"/><g stroke="#ffd8d8" stroke-width="3" stroke-linecap="round" opacity="0.9"><line x1="96" y1="26" x2="96" y2="16"/><line x1="104" y1="30" x2="104" y2="20"/><line x1="112" y1="26" x2="112" y2="16"/></g></svg>';

// phase: 'assemble' 拼装 | 'ironing' 熨烫中 | 'tear' 待撕纸 | 'tearing' 撕纸动画中 | 'live' 已诞生
let phase = 'live';

let settings = null;
let displays = [];
let dragState = null;
let wanderTimer = null;
let wanderTick = null;
let phaseTimer = null;
let ironRaf = null;
let bead = null;        // 拼豆图案缓存 { grid, palette, order, total }
let hintShown = false;

let audioCtx = null;
let ironNoise = null;

const PHRASES = [
  '喵～ 陪我玩会儿嘛', '今天也要开开心心哦', '嘿嘿，被你发现啦',
  '别点啦，好痒呀～', '~(￣▽￣)~*', '我喜欢你！', '咕噜咕噜…',
  '摸头杀！', '一起去喝奶茶吧', '我一直在陪着你呢', '嘎嘎！我出生啦 🦆',
];

async function init() {
  settings = await api.getSettings();
  try { displays = await api.getDisplays(); } catch (e) { /* ignore */ }
  await render();
  bindDrag();
  bindDrop();
  api.onSettingsChanged((s) => onSettingsChanged(s));
  scheduleWander();
}

async function onSettingsChanged(s) {
  const prev = settings;
  settings = s;
  // 拼装/熨烫流程中只更新进度，不整页重绘（动画由 dropBeads/startIroning 直接操作 DOM）
  const onlyProgress = s.pet === 'bead' && prev.pet === 'bead' && s.beadProgress !== prev.beadProgress;
  if (onlyProgress && phase !== 'live') return;
  await render();
  scheduleWander();
}

// ---------- 拼豆图案 ----------
async function getBeadPattern() {
  if (bead) return bead;
  const p = await api.getBeadPattern();
  if (!p) return null;
  p.total = 0;
  p.grid.forEach(r => { for (const c of r) if (c !== '.') p.total++; });
  // 确定性打乱顺序：进度（已放置豆子数）可跨会话重建
  const pos = [];
  p.grid.forEach((row, gy) => { [...row].forEach((c, gx) => { if (c !== '.') pos.push(`${gx},${gy}`); }); });
  let seed = 20240817;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = pos.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pos[i], pos[j]] = [pos[j], pos[i]];
  }
  p.order = pos;
  bead = p;
  return p;
}

// ---------- 渲染 ----------
async function render() {
  clearTimeout(phaseTimer);
  if (ironRaf) { cancelAnimationFrame(ironRaf); ironRaf = null; }
  stopIronSound();
  stage.querySelectorAll('.pet, .board, .assemble, .board-wrap, .hint').forEach(el => el.remove());

  if (settings.pet === 'bead') {
    const p = await getBeadPattern();
    if (!p) return;
    const progress = settings.beadProgress || 0;
    if (progress < p.total) {
      phase = 'assemble';
      renderAssemble(p, progress);
      api.resizeWindow(BOARD_W, BOARD_H);
      centerWindow();
      if (!hintShown) { api.showBubble('点我几下，拼出一只小鸭子 🦆'); hintShown = true; }
      return;
    }
    phase = 'live';
    hintShown = false;
    renderLiveDuck(p);
    api.resizeWindow(settings.size || 160, settings.size || 160);
    return;
  }

  phase = 'live';
  hintShown = false;
  api.resizeWindow(settings.size || 160, settings.size || 160);
  const pet = document.createElement('div');
  pet.className = 'pet idle';
  if (settings.pet === 'custom' && settings.customPetUrl) {
    const img = document.createElement('img');
    img.src = settings.customPetUrl;
    img.draggable = false;
    img.alt = 'pet';
    pet.appendChild(img);
  } else {
    const id = BUILTIN.includes(settings.pet) ? settings.pet : 'cat';
    const svgText = await api.getPetSvg(id);
    pet.innerHTML = svgText || '';
  }
  stage.appendChild(pet);
}

function renderAssemble(p, progress) {
  const wrap = document.createElement('div');
  wrap.className = 'assemble';
  const boardWrap = document.createElement('div');
  boardWrap.className = 'board-wrap';
  const board = document.createElement('div');
  board.className = 'board';
  board.style.setProperty('--cols', p.grid[0].length);
  board.style.setProperty('--rows', p.grid.length);
  board.style.aspectRatio = `${p.grid[0].length} / ${p.grid.length}`;
  const placed = new Set(p.order.slice(0, progress));
  p.grid.forEach((row, gy) => {
    [...row].forEach((ch, gx) => {
      const cell = document.createElement('div');
      cell.dataset.key = `${gx},${gy}`;
      const isPlaced = ch !== '.' && placed.has(`${gx},${gy}`);
      cell.className = isPlaced ? 'cell bead' : 'cell peg';
      if (isPlaced) cell.style.setProperty('--color', p.palette[ch]);
      board.appendChild(cell);
    });
  });
  boardWrap.appendChild(board);
  wrap.appendChild(boardWrap);
  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = '点我几下，拼出小鸭子 🦆';
  wrap.appendChild(hint);
  stage.appendChild(wrap);
}

function renderLiveDuck(p) {
  const pet = document.createElement('div');
  pet.className = 'pet idle';
  const duck = document.createElement('div');
  duck.className = 'duck';
  duck.style.setProperty('--cols', p.grid[0].length);
  duck.style.setProperty('--rows', p.grid.length);
  p.grid.forEach((row, gy) => {
    [...row].forEach((ch, gx) => {
      if (ch === '.') return;
      const cell = document.createElement('div');
      cell.className = 'bead';
      cell.style.setProperty('--color', p.palette[ch]);
      cell.style.gridColumn = gx + 1;
      cell.style.gridRow = gy + 1;
      duck.appendChild(cell);
    });
  });
  pet.appendChild(duck);
  stage.appendChild(pet);
}

// ---------- 落豆 ----------
function dropBeads() {
  if (phase !== 'assemble' || !bead) return;
  const progress = settings.beadProgress || 0;
  const remaining = bead.order.slice(progress);
  if (remaining.length === 0) return;
  const n = Math.min(remaining.length, 8 + Math.floor(Math.random() * 6));
  const batch = remaining.slice(0, n);
  const board = stage.querySelector('.board');
  batch.forEach((key, i) => {
    const [gx, gy] = key.split(',').map(Number);
    const ch = bead.grid[gy][gx];
    const cell = board && board.querySelector(`[data-key="${key}"]`);
    if (cell) {
      cell.classList.remove('peg');
      cell.classList.add('bead');
      cell.style.setProperty('--color', bead.palette[ch]);
      cell.style.animationDelay = (i * 24) + 'ms';
    }
  });
  const newProgress = progress + batch.length;
  settings.beadProgress = newProgress;
  api.saveSettings({ beadProgress: newProgress });
  if (newProgress >= bead.total) startIroning();
}

// ---------- 音效（Web Audio，无需音频文件） ----------
function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* ignore */ }
  }
  return audioCtx;
}
function startIronSound() {
  const ctx = ensureAudio();
  if (!ctx || ironNoise) return;
  try {
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass'; filter.frequency.value = 3800; filter.Q.value = 0.5;
    const gain = ctx.createGain(); gain.gain.value = 0.045;
    src.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
    src.start();
    ironNoise = { src, gain };
  } catch (e) { /* ignore */ }
}
function stopIronSound() {
  if (!ironNoise || !audioCtx) return;
  try {
    ironNoise.gain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.06);
    const s = ironNoise.src;
    setTimeout(() => { try { s.stop(); } catch (e) { /* ignore */ } }, 250);
  } catch (e) { /* ignore */ }
  ironNoise = null;
}
function playTearSound() {
  const ctx = ensureAudio();
  if (!ctx) return;
  try {
    const len = Math.floor(ctx.sampleRate * 0.35);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass'; filter.frequency.value = 2600; filter.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.32);
    src.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
    src.start();
  } catch (e) { /* ignore */ }
}

// ---------- 熨烫：拿熨斗摁上去，下压 → 左右蹭 → 抬起 ----------
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function lerp(a, b, t) { return a + (b - a) * t; }

function startIroning() {
  phase = 'ironing';
  const board = stage.querySelector('.board');
  const boardWrap = stage.querySelector('.board-wrap');
  const hint = stage.querySelector('.hint');
  if (board) board.classList.add('ironing');
  if (boardWrap) {
    const paper = document.createElement('div');
    paper.className = 'iron-paper';
    const iron = document.createElement('div');
    iron.className = 'iron';
    iron.innerHTML = IRON_SVG;
    boardWrap.appendChild(paper);
    boardWrap.appendChild(iron);
  }
  if (hint) hint.textContent = '熨烫中…把豆子焊起来 🔥';
  api.showBubble('拿熨斗摁一摁，把豆子焊起来 🔥');
  startIronSound();

  const boardW = board.clientWidth;
  const boardH = board.clientHeight;
  const ironW = 90, ironH = 68;
  const centerX = (boardW - ironW) / 2;
  const centerY = (boardH - ironH) / 2;

  // 融化顺序：从图案中心向两侧扩散（配合熨斗左右蹭）
  const grid = bead.grid;
  const centerCol = (grid[0].length - 1) / 2;
  const centerRow = (grid.length - 1) / 2;
  const items = Array.from(board.querySelectorAll('.cell.bead'))
    .map(el => {
      const [gx, gy] = el.dataset.key.split(',').map(Number);
      return { el, d: Math.abs(gx - centerCol) + Math.abs(gy - centerRow) * 0.3 };
    })
    .sort((a, b) => a.d - b.d);

  const ironEl = boardWrap.querySelector('.iron');
  const T1 = 0.45, T2 = 3.0, T3 = 3.4; // 秒
  const t0 = performance.now();
  let idx = 0;

  const step = () => {
    if (phase !== 'ironing') return; // 被中断
    const t = (performance.now() - t0) / 1000;

    if (t < T1) {
      // 阶段一：从上方落下、摁到豆子上
      const p = easeOutCubic(t / T1);
      ironEl.style.top = lerp(-ironH - 30, centerY + 6, p) + 'px';
      ironEl.style.left = centerX + 'px';
      ironEl.style.transform = `scale(${1.2 - 0.2 * p})`;
    } else if (t < T2) {
      // 阶段二：左右来回蹭，豆子随之融化
      const pt = (t - T1) / (T2 - T1);
      const x = centerX + Math.sin(pt * Math.PI * 5) * boardW * 0.16;
      ironEl.style.top = centerY + 'px';
      ironEl.style.left = x + 'px';
      ironEl.style.transform = 'scale(1)';
      const target = Math.floor(pt * items.length);
      while (idx < target && idx < items.length) { items[idx].el.classList.add('melted'); idx++; }
    } else if (t < T3) {
      // 阶段三：抬起、移走
      const p = (t - T2) / (T3 - T2);
      ironEl.style.top = lerp(centerY, -ironH - 30, p) + 'px';
      ironEl.style.left = centerX + 'px';
      ironEl.style.opacity = 1 - p;
    } else {
      stopIronSound();
      phase = 'tear';
      if (hint) hint.textContent = '点我撕下熨烫纸 👌';
      api.showBubble('点我撕下熨烫纸 👌');
      return;
    }
    ironRaf = requestAnimationFrame(step);
  };
  ironRaf = requestAnimationFrame(step);
}

function tearOff() {
  if (phase !== 'tear') return;
  phase = 'tearing';
  playTearSound();
  const paper = stage.querySelector('.iron-paper');
  const iron = stage.querySelector('.iron');
  const hint = stage.querySelector('.hint');
  if (iron) iron.remove();
  if (paper) paper.classList.add('tear');
  if (hint) hint.textContent = '撕下啦！';
  phaseTimer = setTimeout(() => {
    phase = 'live';
    render();
    scheduleWander();
  }, 450);
}

// ---------- 拖拽（区分点击） ----------
function bindDrag() {
  stage.addEventListener('pointerdown', async (e) => {
    if (e.button !== 0) return;
    if (phase !== 'live') return; // 拼装/熨烫流程不拖窗口
    const pos = await api.getWindowPosition();
    dragState = {
      sx: e.screenX, sy: e.screenY,
      wx: pos[0], wy: pos[1],
      moved: false,
      area: areaContaining(pos),
    };
    stage.setPointerCapture(e.pointerId);
    stage.classList.add('dragging');
  });

  stage.addEventListener('pointermove', (e) => {
    if (!dragState) return;
    const dx = e.screenX - dragState.sx;
    const dy = e.screenY - dragState.sy;
    if (Math.abs(dx) + Math.abs(dy) > 5) dragState.moved = true;
    if (!dragState.moved) return;
    let x = dragState.wx + dx;
    let y = dragState.wy + dy;
    const a = dragState.area;
    const s = settings.size || 160;
    if (a) {
      x = clamp(x, a.x, a.x + a.width - s);
      y = clamp(y, a.y, a.y + a.height - s);
    }
    api.setWindowPosition(x, y);
  });

  const end = () => {
    if (!dragState) return;
    const moved = dragState.moved;
    dragState = null;
    stage.classList.remove('dragging');
    if (!moved) react();
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);

  stage.addEventListener('click', () => {
    if (phase === 'assemble') dropBeads();
    else if (phase === 'tear') tearOff();
  });
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function areaContaining(pos) {
  const found = displays.find(d =>
    pos[0] >= d.x && pos[0] < d.x + d.width && pos[1] >= d.y && pos[1] < d.y + d.height);
  return found || displays[0] || null;
}

// ---------- 拖入自定义图片 ----------
function bindDrop() {
  window.addEventListener('dragover', (e) => { e.preventDefault(); });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    if (phase !== 'live') return;
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f && f.path) api.importFile(f.path);
  });
}

// ---------- 点击互动 ----------
function react() {
  const pet = stage.querySelector('.pet');
  if (!pet) return;
  const roll = Math.random();
  playAnim(pet, roll < 0.3 ? 'jump' : roll < 0.5 ? 'spin' : 'happy', roll < 0.3 ? 650 : 900);
  spawnParticles();
  if (Math.random() < 0.75) api.showBubble(PHRASES[Math.floor(Math.random() * PHRASES.length)]);
}

function playAnim(pet, cls, ms) {
  pet.classList.remove('idle', 'walking', 'jump', 'spin', 'happy');
  void pet.offsetWidth; // 强制重排，确保动画重新触发
  pet.classList.add(cls);
  setTimeout(() => {
    pet.classList.remove(cls);
    pet.classList.add('idle');
  }, ms);
}

function spawnParticles() {
  const emojis = ['💖', '✨', '💕', '⭐', '🎀', '💫'];
  for (let i = 0; i < 6; i++) {
    const s = document.createElement('span');
    s.className = 'fx-item';
    s.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    s.style.left = (18 + Math.random() * 64) + '%';
    s.style.fontSize = (16 + Math.random() * 14) + 'px';
    s.style.animationDelay = (Math.random() * 0.15) + 's';
    fx.appendChild(s);
    setTimeout(() => s.remove(), 1300);
  }
}

// ---------- 随机走动 ----------
function scheduleWander() {
  clearTimeout(wanderTimer);
  if (!settings.wander || phase !== 'live') return;
  const min = (settings.wanderIntervalMin || 8) * 1000;
  const max = (settings.wanderIntervalMax || 20) * 1000;
  wanderTimer = setTimeout(walk, min + Math.random() * (max - min));
}

function easeInOut(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

async function walk() {
  if (!settings.wander || phase !== 'live') return;
  try {
    if (!displays.length) displays = await api.getDisplays();
    const pos = await api.getWindowPosition();
    const area = areaContaining(pos) || displays[0];
    if (!area) return scheduleWander();
    const s = settings.size || 160;
    const tx = area.x + Math.random() * Math.max(1, area.width - s);
    const ty = area.y + Math.random() * Math.max(1, area.height - s);
    const sx = pos[0], sy = pos[1];
    const dur = 2600 + Math.random() * 2600;
    const pet = stage.querySelector('.pet');
    if (pet) {
      pet.classList.remove('idle', 'walking');
      pet.style.setProperty('--flip', tx >= sx ? 1 : -1);
      pet.classList.add('walking');
    }
    const t0 = performance.now();
    await new Promise((resolve) => {
      wanderTick = setInterval(() => {
        const t = Math.min(1, (performance.now() - t0) / dur);
        api.setWindowPosition(
          Math.round(sx + (tx - sx) * easeInOut(t)),
          Math.round(sy + (ty - sy) * easeInOut(t))
        );
        if (t >= 1) { clearInterval(wanderTick); wanderTick = null; resolve(); }
      }, 16);
    });
    if (pet) { pet.classList.remove('walking'); pet.classList.add('idle'); }
  } catch (e) { /* ignore */ }
  scheduleWander();
}

async function centerWindow() {
  if (!displays.length) displays = await api.getDisplays();
  const a = displays[0];
  if (!a) return;
  api.setWindowPosition(Math.round(a.x + (a.width - BOARD_W) / 2), Math.round(a.y + (a.height - BOARD_H) / 2));
}

init();
