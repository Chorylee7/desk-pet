const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = {
  pet: 'cat',              // 'cat' | 'dog' | 'slime' | 'bunny' | 'alien' | 'bead' | 'custom'
  customPet: null,         // 自定义图片在 userData/custom 下的绝对路径
  beadProgress: 0,         // 拼豆已放置的豆子数（拼满等于鸭子豆子总数）
  size: 160,               // 宠物窗口边长（px）
  wander: true,            // 是否随机走动
  wanderIntervalMin: 8,    // 两次走动最小间隔（秒）
  wanderIntervalMax: 20,   // 两次走动最大间隔（秒）
  position: null,          // 上次窗口位置 [x, y]
};

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf8');
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(s) {
  try {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2));
  } catch (e) {
    console.error('保存设置失败:', e);
  }
}

module.exports = { DEFAULTS, loadSettings, saveSettings };
