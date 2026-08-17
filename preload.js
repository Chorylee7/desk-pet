const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  getSettings: () => ipcRenderer.invoke('getSettings'),
  saveSettings: (patch) => ipcRenderer.invoke('saveSettings', patch),
  getWindowPosition: () => ipcRenderer.invoke('getWindowPosition'),
  setWindowPosition: (x, y) => ipcRenderer.invoke('setWindowPosition', x, y),
  getDisplays: () => ipcRenderer.invoke('getDisplays'),
  getPetSvg: (id) => ipcRenderer.invoke('getPetSvg', id),
  getBeadPattern: () => ipcRenderer.invoke('getBeadPattern'),
  resizeWindow: (w, h) => ipcRenderer.invoke('resizeWindow', w, h),
  showBubble: (text) => ipcRenderer.invoke('showBubble', text),
  hideBubble: () => ipcRenderer.invoke('hideBubble'),
  importImage: () => ipcRenderer.invoke('importImage'),
  importFile: (srcPath) => ipcRenderer.invoke('importFile', srcPath),
  switchPet: (id) => ipcRenderer.invoke('switchPet', id),
  openSettings: () => ipcRenderer.invoke('openSettings'),
  quit: () => ipcRenderer.invoke('quit'),
  onSettingsChanged: (cb) => ipcRenderer.on('settings-changed', (_e, s) => cb(s)),
});
