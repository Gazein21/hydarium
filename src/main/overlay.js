/* Fenêtre « menu Hydarium » par-dessus le jeu (comme un menu en jeu, mais c’est une fenêtre du launcher). Fonctionne si Minecraft est en fenêtré ou plein écran fenêtré. */
const { BrowserWindow, screen } = require('electron'); const path = require('path');
let w = null;
const alive = () => w && !w.isDestroyed();
let rt = [];
const clearRt = () => { rt.forEach(clearTimeout); rt = []; };
/* jeu en plein écran : le focus pris par le menu réduit sa fenêtre → on la remet à l’écran, sans focus, juste après l’ouverture */
const keepGameVisible = () => { clearRt(); if (process.platform !== 'win32') return; const f = require('./fg'); rt = [350, 900, 1800].map(ms => setTimeout(() => { if (alive()) f.restoreMc(false); }, ms)); };
exports.open = (page, inst, extra = {}) => {
  if (alive()) { w.webContents.send('ovl:page', { page, ...extra }); w.show(); w.focus(); keepGameVisible(); return; }
  const fgm = require('./fg').lastRect, pt = fgm && process.platform === 'win32' && screen.screenToDipRect ? screen.screenToDipRect(null, fgm) : null, b = pt ? screen.getDisplayMatching(pt).bounds : screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).bounds;
  w = new BrowserWindow({ x: b.x, y: b.y, width: b.width, height: b.height, frame: false, transparent: true, hasShadow: false, resizable: false, movable: false, fullscreenable: false, alwaysOnTop: true, skipTaskbar: true, show: false, backgroundColor: '#00000000', title: 'Hydarium', icon: path.join(__dirname, '..', '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: { preload: path.join(__dirname, '../preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  w.setTitle('Hydarium Overlay'); w.on('page-title-updated', e => e.preventDefault()); // titre propre : le HUD reste affiché sous le menu en jeu, mais pas sur le launcher (voir fg.js)
  w.setAlwaysOnTop(true, 'screen-saver');
  w.loadFile(path.join(__dirname, '../renderer/index.html'), { query: { overlay: page || 'hub', inst: inst || '', world: extra.world || '', type: extra.type || '', addr: extra.addr || '' } });
  w.once('ready-to-show', () => { w.show(); w.focus(); keepGameVisible(); });
  w.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) require('electron').shell.openExternal(url); return { action: 'deny' }; });
};
exports.send = (c, d) => { if (alive()) w.webContents.send(c, d); };
exports.close = () => { clearRt(); const was = alive(); if (was) w.close(); w = null; if (was) { const f = require('./fg'); f.restoreMc(true); setTimeout(() => f.restoreMc(true), 400); } }; // à la fermeture : le jeu revient au premier plan, même s’il avait été réduit
exports.toggle = (page, inst) => { if (alive() && w.isVisible()) exports.close(); else exports.open(page, inst); };

exports.fit = on => { if (!alive()) return; const fgm = require('./fg').lastRect, r = fgm && process.platform === 'win32' && screen.screenToDipRect ? screen.screenToDipRect(null, fgm) : null; w.setBounds(on && r ? r : (r ? screen.getDisplayMatching(r).bounds : screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).bounds)); };
