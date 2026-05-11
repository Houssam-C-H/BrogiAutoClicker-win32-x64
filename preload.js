const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSettings:   ()  => ipcRenderer.invoke('get-settings'),
  getStatus:     ()  => ipcRenderer.invoke('get-status'),
  saveSettings:  (s) => ipcRenderer.send('save-settings', s),
  toggle:        ()  => ipcRenderer.send('toggle'),
  minimize:      ()  => ipcRenderer.send('minimize'),
  close:         ()  => ipcRenderer.send('close'),
  getCursorPos:  ()  => ipcRenderer.invoke('get-cursor-pos'),
  onStatus:      (cb) => ipcRenderer.on('status',       (_, d) => cb(d)),
  onTick:        (cb) => ipcRenderer.on('tick',         (_, n) => cb(n)),
  onTriggerPick: (cb) => ipcRenderer.on('trigger-pick', () => cb()),
});
