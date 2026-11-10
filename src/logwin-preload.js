const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('lw', {
  onBatch: f => ipcRenderer.on('log:batch', (e, l) => f(l)), onClear: f => ipcRenderer.on('log:clear', () => f()), onTitle: f => ipcRenderer.on('log:title', (e, t) => f(t))
});
