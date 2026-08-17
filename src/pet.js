const api = window.petAPI;
const BUILTIN = ['cat', 'dog', 'slime', 'bunny', 'alien'];
const stage = document.getElementById('stage');
const fx = document.getElementById('fx');

const BOARD_W = 252;
const BOARD_H = 288;

const IRON_SVG = '<svg viewBox="0 0 64 40" width="56" height="35"><path d="M6 24 L58 24 L50 36 L14 36 Z" fill="#e5484d"/><path d="M18 24 C18 10 46 10 46 24 Z" fill="#c0272d"/><rect x="25" y="6" width="14" height="7" rx="3.5" fill="#6b7280"/><circle cx="32" cy="30" r="2" fill="#ffd166"/></svg>';

// phase: 'assemble' 拼装 | 'ironing' 熨烫中 | 'tear' 待撕纸 | 'tearing' 撕纸动画中 | 'live' 已诞生
let phase = 'live';

let settings = null;
let displays = [];
let dragState = null;
let wanderTimer = null;
let wanderTick = null;
let phaseTimer = null;
let bead = null;        // 拼豆图案缓存 { grid, palette, order, total }
let hintShown = false;

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

// ---------- 熨烫 ----------
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
  if (hint) hint.textContent = '熨烫中…把豆子焊在一起 🔥';
  api.showBubble('熨一熨，把豆子焊在一起 🔥');
  phaseTimer = setTimeout(() => {
    phase = 'tear';
    if (hint) hint.textContent = '点我撕下熨烫纸 👌';
    api.showBubble('点我撕下熨烫纸 👌');
  }, 3400);
}

function tearOff() {
  if (phase !== 'tear') return;
  phase = 'tearing';
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
