const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { loadSettings, saveSettings, DEFAULTS } = require('./config');

const SMOKE = process.argv.includes('--smoke-test');

let petWin = null;
let bubbleWin = null;
let settingsWin = null;
let tray = null;
let settings = loadSettings();

const PETS_DIR = path.join(__dirname, 'pets');
const CUSTOM_DIR = path.join(app.getPath('userData'), 'custom');

const BUILTIN_PETS = [
  { id: 'cat',   label: '小猫',   file: 'cat.svg' },
  { id: 'dog',   label: '小狗',   file: 'dog.svg' },
  { id: 'slime', label: '史莱姆', file: 'slime.svg' },
  { id: 'bunny', label: '小兔',   file: 'bunny.svg' },
  { id: 'alien', label: '外星人', file: 'alien.svg' },
];

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'];

function withCustomUrl(s) {
  return { ...s, customPetUrl: s.customPet ? pathToFileURL(s.customPet).href : null };
}

function save() { saveSettings(settings); }

function throttle(fn, ms) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= ms) { last = now; fn(...args); }
  };
}

function sendSettingsChanged() {
  const payload = withCustomUrl(settings);
  if (petWin && !petWin.isDestroyed()) petWin.webContents.send('settings-changed', payload);
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('settings-changed', payload);
}

// ---------- 宠物窗口 ----------
function createPetWindow() {
  const size = settings.size || DEFAULTS.size;
  petWin = new BrowserWindow({
    width: size,
    height: size,
    transparent: true,
    frame: false,
    resizable: false,
    movable: true,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  petWin.setAlwaysOnTop(true, 'screen-saver');
  if (process.platform === 'darwin') {
    petWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }
  petWin.loadFile(path.join(__dirname, 'src', 'pet.html'));

  if (settings.position) {
    petWin.setPosition(settings.position[0], settings.position[1]);
  } else {
    // 默认出现在主屏中央
    const { workArea } = screen.getPrimaryDisplay();
    petWin.setPosition(
      Math.round(workArea.x + (workArea.width - size) / 2),
      Math.round(workArea.y + (workArea.height - size) / 2)
    );
  }

  petWin.on('move', throttle(() => {
    if (petWin && !petWin.isDestroyed()) settings.position = petWin.getPosition();
    save();
  }, 400));

  // 关闭时隐藏而非退出
  petWin.on('close', (e) => { e.preventDefault(); petWin.hide(); });

  petWin.webContents.on('context-menu', () => popupTrayMenu());
}

// ---------- 气泡窗口 ----------
function ensureBubble() {
  if (bubbleWin && !bubbleWin.isDestroyed()) return bubbleWin;
  bubbleWin = new BrowserWindow({
    width: 200,
    height: 60,
    transparent: true,
    frame: false,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    webPreferences: { contextIsolation: false, nodeIntegration: true },
  });
  bubbleWin.setAlwaysOnTop(true, 'screen-saver');
  if (process.platform === 'darwin') bubbleWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  bubbleWin.loadFile(path.join(__dirname, 'src', 'bubble.html'));
  bubbleWin.setIgnoreMouseEvents(true, { forward: true });
  return bubbleWin;
}

let bubbleTimer = null;
function showBubble(text) {
  if (!petWin || petWin.isDestroyed()) return;
  const txt = String(text || '').trim().slice(0, 60);
  if (!txt) return;
  const w = Math.max(100, Math.min(300, Math.round(txt.length * 15 + 48)));
  const h = 60;
  const win = ensureBubble();
  win.setContentSize(w, h);
  const [px, py] = petWin.getPosition();
  const [pw] = petWin.getSize();
  win.setPosition(Math.round(px + pw / 2 - w / 2), Math.round(py - h - 8), false);
  win.webContents.send('bubble-text', txt);
  win.showInactive();
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => { if (bubbleWin && !bubbleWin.isDestroyed()) bubbleWin.hide(); }, 3200);
}

// ---------- 设置窗口 ----------
function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.show(); settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({
    width: 480,
    height: 600,
    title: '桌面宠物 · 设置',
    autoHideMenuBar: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  settingsWin.loadFile(path.join(__dirname, 'src', 'settings.html'));
  settingsWin.on('closed', () => { settingsWin = null; });
}

// ---------- 自定义图片导入 ----------
async function importImage() {
  const r = await dialog.showOpenDialog({
    title: '选择宠物图片',
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: IMAGE_EXTS }],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  return importFile(r.filePaths[0]);
}

function importFile(srcPath) {
  const ext = (path.extname(srcPath) || '.png').toLowerCase().replace('.', '');
  if (!IMAGE_EXTS.includes(ext)) return withCustomUrl(settings);
  fs.mkdirSync(CUSTOM_DIR, { recursive: true });
  const dest = path.join(CUSTOM_DIR, `custom-${Date.now()}.${ext}`);
  fs.copyFileSync(srcPath, dest);
  settings.customPet = dest;
  settings.pet = 'custom';
  save();
  sendSettingsChanged();
  return withCustomUrl(settings);
}

function switchPet(id) {
  if (id === 'custom' && !settings.customPet) { importImage(); return; }
  settings.pet = id;
  save();
  sendSettingsChanged();
}

// ---------- 托盘 ----------
function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  if (process.platform === 'darwin') icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('桌面宠物');
  tray.on('click', () => popupTrayMenu());
  tray.on('right-click', () => popupTrayMenu());
}

function popupTrayMenu() {
  if (!tray) return;
  const petSub = BUILTIN_PETS.map(p => ({
    label: p.label,
    type: 'radio',
    checked: settings.pet === p.id,
    click: () => switchPet(p.id),
  }));
  petSub.push({ type: 'separator' });
  petSub.push({
    label: settings.customPet ? '自定义图片' : '导入自定义图片…',
    type: 'radio',
    checked: settings.pet === 'custom',
    click: () => { if (settings.customPet) switchPet('custom'); else importImage(); },
  });
  petSub.push({ type: 'separator' });
  petSub.push({
    label: '拼豆鸭 🦆',
    type: 'radio',
    checked: settings.pet === 'bead',
    click: () => switchPet('bead'),
  });

  const menu = Menu.buildFromTemplate([
    { label: '选择形象', submenu: petSub },
    { type: 'separator' },
    { label: '随机走动', type: 'checkbox', checked: !!settings.wander, click: (mi) => { settings.wander = mi.checked; save(); sendSettingsChanged(); } },
    { label: '重新拼豆', visible: settings.pet === 'bead', click: () => { settings.beadProgress = 0; save(); sendSettingsChanged(); } },
    { label: '设置…', click: () => openSettings() },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]);
  tray.popUpContextMenu(menu);
}

// ---------- IPC ----------
function registerIpc() {
  ipcMain.handle('getSettings', () => withCustomUrl(settings));

  ipcMain.handle('saveSettings', (_e, patch) => {
    const oldSize = settings.size;
    settings = { ...settings, ...(patch || {}) };
    if (petWin && !petWin.isDestroyed() && patch && patch.size && patch.size !== oldSize) {
      const [x, y] = petWin.getPosition();
      const [w, h] = petWin.getSize();
      const cx = x + w / 2, cy = y + h / 2;
      const s = patch.size;
      petWin.setContentSize(s, s);
      petWin.setPosition(Math.round(cx - s / 2), Math.round(cy - s / 2));
    }
    save();
    sendSettingsChanged();
    return withCustomUrl(settings);
  });

  ipcMain.handle('getWindowPosition', () => (petWin && !petWin.isDestroyed()) ? petWin.getPosition() : [0, 0]);
  ipcMain.handle('setWindowPosition', (_e, x, y) => {
    if (petWin && !petWin.isDestroyed()) petWin.setPosition(Math.round(x), Math.round(y));
  });
  ipcMain.handle('getDisplays', () => screen.getAllDisplays().map(d => ({ ...d.workArea })));
  ipcMain.handle('getPetSvg', (_e, id) => {
    const p = BUILTIN_PETS.find(x => x.id === id);
    if (!p) return '';
    try { return fs.readFileSync(path.join(PETS_DIR, p.file), 'utf8'); } catch { return ''; }
  });
  ipcMain.handle('getBeadPattern', () => {
    try { return JSON.parse(fs.readFileSync(path.join(PETS_DIR, 'duck.json'), 'utf8')); } catch { return null; }
  });
  ipcMain.handle('resizeWindow', (_e, w, h) => {
    if (!petWin || petWin.isDestroyed()) return;
    const [x, y] = petWin.getPosition();
    const [cw, ch] = petWin.getSize();
    const cx = x + cw / 2, cy = y + ch / 2;
    petWin.setContentSize(Math.round(w), Math.round(h));
    petWin.setPosition(Math.round(cx - w / 2), Math.round(cy - h / 2));
  });
  ipcMain.handle('showBubble', (_e, text) => showBubble(text));
  ipcMain.handle('hideBubble', () => { if (bubbleWin && !bubbleWin.isDestroyed()) bubbleWin.hide(); });
  ipcMain.handle('openSettings', () => openSettings());
  ipcMain.handle('importImage', () => importImage());
  ipcMain.handle('importFile', (_e, srcPath) => importFile(srcPath));
  ipcMain.handle('switchPet', (_e, id) => switchPet(id));
  ipcMain.handle('toggleWander', (_e, on) => { settings.wander = !!on; save(); sendSettingsChanged(); });
  ipcMain.handle('quit', () => app.quit());
}

// ---------- 生命周期 ----------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => { if (petWin && !petWin.isDestroyed()) petWin.show(); });

  app.whenReady().then(() => {
    fs.mkdirSync(CUSTOM_DIR, { recursive: true });
    registerIpc();
    createPetWindow();
    createTray();
    if (SMOKE) {
      setTimeout(() => { console.log('SMOKE OK'); app.exit(0); }, 3000);
    }
  });

  app.on('window-all-closed', () => { /* 常驻托盘，不退出 */ });
  app.on('before-quit', () => save());
}
