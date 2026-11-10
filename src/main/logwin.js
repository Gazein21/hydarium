/* Fenêtre des journaux du jeu (réglage « Afficher les logs ») : préparation du lancement, téléchargements, sortie de Minecraft pendant la partie. */
const { BrowserWindow } = require('electron'), path = require('path');
let w = null, buf = [];
const alive = () => w && !w.isDestroyed();
exports.open = title => {
  if (alive()) { w.show(); w.webContents.send('log:title', title || ''); return; }
  w = new BrowserWindow({ width: 820, height: 460, minWidth: 420, minHeight: 240, title: 'Hydarium · Logs', backgroundColor: '#0e1116', autoHideMenuBar: true, show: false, webPreferences: { preload: path.join(__dirname, '../logwin-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  w.setMenu(null); w.loadFile(path.join(__dirname, '../renderer/logwin.html'));
  w.once('ready-to-show', () => { w.show(); w.webContents.send('log:title', title || ''); w.webContents.send('log:batch', buf.slice(-2000)); });
  w.on('closed', () => { w = null; });
};
exports.reset = () => { buf = []; if (alive()) w.webContents.send('log:clear'); };
exports.push = (text, kind) => {
  const lines = String(text).replace(/\r/g, '').split('\n').filter(x => x.length).map(x => ({ t: x.slice(0, 2000), k: kind || (/\b(ERROR|FATAL|Exception|Caused by)\b/.test(x) ? 'e' : /\bWARN\b/.test(x) ? 'w' : '') }));
  if (!lines.length) return; buf.push(...lines); if (buf.length > 4000) buf = buf.slice(-3000);
  if (alive()) w.webContents.send('log:batch', lines);
};
exports.close = () => { if (alive()) w.close(); };
