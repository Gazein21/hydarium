/* HUD par-dessus le jeu : fenêtre transparente qui laisse passer la souris. Affiche les modules qui n’ont pas besoin d’entrer dans le jeu :
   touches, CPS, heure, mémoire, ping, musique, temps de session. (FPS, coordonnées, armure… demandent l’agent en jeu.) */
const { BrowserWindow, screen } = require('electron'); const path = require('path'), os = require('os'), net = require('net');
const fg = require('./fg'), input = require('./input'), media = require('./media'), store = require('./store');
let scr = null, dpOn = false, topT = null, gameSt = null, gameT = 0, mrect = null, editing = false, lastClick = 0, curBounds = null, w = null, timer = null, music = null, mT = null, pT = null, inst = null, t0 = 0, ping = null, server = '', vis = true, st = { keys: {}, cps: [0, 0] };
const alive = () => w && !w.isDestroyed();
const cfgOf = () => ({ modules: (inst && inst.client && inst.client.modules) || {} });
const sendCfg = () => { if (alive()) { w.webContents.send('hud:cfg', cfgOf()); const k = (cfgOf().modules.keystrokes || {}); input.setKeys(null, k.scan); } };
function doPing() {
  if (!server) return; const [h, p] = server.split(':'), t = Date.now(), s = net.connect({ host: h, port: +p || 25565, timeout: 2500 });
  s.on('connect', () => { ping = Date.now() - t; s.destroy(); }); s.on('error', () => { ping = null; }); s.on('timeout', () => { ping = null; s.destroy(); });
}
const toDip = r => { try { return process.platform === 'win32' && screen.screenToDipRect ? screen.screenToDipRect(null, r) : r; } catch (e) { return r; } };
const dipPt = p => { try { return process.platform === 'win32' && screen.screenToDipPoint ? screen.screenToDipPoint(p) : p; } catch (e) { return p; } };
/* widget cliquable « Télécharger des data packs » : visible tant que l'écran de création de monde est ouvert (voir session.js) ; haut droite du jeu, 270×38 px à 16 px du bord */
exports.setDpWidget = on => { dpOn = !!on; };
/* widget cliquable « Télécharger des packs de ressources » : visible tant que le mod signale l’écran Options › Packs de ressources (message répété toutes les 250 ms ; au-delà de 1,5 s sans nouvelle, on le retire) */
const rpOn = () => !!scr && scr.k === 'resourcepacks' && Date.now() - scr.t < 1500;
exports.setMusicRect = r => { mrect = r && r.w > 0 ? r : null; };
exports.setEditing = on => { editing = !!on; if (alive()) { if (editing) w.hide(); else if (vis) w.showInactive(); } };
const fit = rect => { if (!alive()) return; const b = rect ? toDip(rect) : screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).bounds; const c = curBounds; if (c && Math.abs(c.x - b.x) < 3 && Math.abs(c.y - b.y) < 3 && Math.abs(c.width - b.width) < 3 && Math.abs(c.height - b.height) < 3) return; curBounds = { x: b.x, y: b.y, width: b.width, height: b.height }; w.setBounds(curBounds); };
function onMouse(e) {
  if (!alive() || !vis || Date.now() - lastClick < 500 || e.button !== 1) return;
  const p = dipPt({ x: e.x, y: e.y }), b = w.getBounds(), x = p.x - b.x, y = p.y - b.y;
  if (dpOn && x >= b.width - 286 && x <= b.width - 16 && y >= 14 && y <= 52) { lastClick = Date.now(); try { require('./overlay').open('content', inst && inst.id, { world: '__next__' }); } catch (err) {} return; }
  if (rpOn() && x >= b.width - 286 && x <= b.width - 16 && y >= 14 && y <= 52) { lastClick = Date.now(); try { require('./overlay').open('content', inst && inst.id, { type: 'resourcepack' }); } catch (err) {} return; }
  if (!mrect) return;
  if (x >= mrect.x && x <= mrect.x + mrect.w && y >= mrect.y && y <= mrect.y + mrect.h) { lastClick = Date.now(); media.act('playpause').then(t => { music = t; }).catch(() => {}); }
}
exports.start = (i, srv) => {
  exports.stop(); if (!i || !i.client || !i.client.on || i.client.disabled) return; inst = i; server = srv || ''; t0 = Date.now();
  const b = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).bounds;
  w = new BrowserWindow({ x: b.x, y: b.y, width: b.width, height: b.height, frame: false, transparent: true, hasShadow: false, resizable: false, focusable: false, skipTaskbar: true, alwaysOnTop: true, show: false, backgroundColor: '#00000000', webPreferences: { preload: path.join(__dirname, '../preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  w.setIgnoreMouseEvents(true); w.setAlwaysOnTop(true, 'screen-saver'); w.loadFile(path.join(__dirname, '../renderer/hud.html'));
  w.once('ready-to-show', () => { sendCfg(); if (vis) w.showInactive(); });
  // plein écran : on remonte la fenêtre du HUD au-dessus du jeu régulièrement (le jeu peut reprendre le dessus quand il change de mode d'affichage)
  topT = setInterval(() => { if (alive() && vis && !editing) { try { w.setAlwaysOnTop(true, 'screen-saver'); w.moveTop(); } catch (e) {} } }, 1500);
  fg.start(({ mc, rect }) => { vis = mc; if (alive()) { if (mc && rect) fit(rect); if (mc && !editing) { w.showInactive(); try { w.setAlwaysOnTop(true, 'screen-saver'); } catch (e) {} } else w.hide(); } });
  input.start(s => { st = s; }, onMouse); const k0 = (inst.client.modules || {}).keystrokes || {}; input.setKeys(null, k0.scan);
  const poll = async () => { try { music = await media.get(); } catch (e) { music = null; } };
  poll(); mT = setInterval(poll, 5000); doPing(); pT = setInterval(doPing, 6000);
  timer = setInterval(() => {
    if (!alive() || !vis) return; const m = cfgOf().modules, now = new Date(), sec = Math.floor((Date.now() - t0) / 1000);
    w.webContents.send('hud:state', { keys: st.keys, cps: st.cps, clock: now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), mem: [(os.totalmem() - os.freemem()) / 1073741824, os.totalmem() / 1073741824], ping, music: m.music && m.music.on ? music : null, session: sec, dpw: dpOn, rpw: rpOn(), game: gameSt && Date.now() - gameT < 3000 ? gameSt : null });
  }, 200);
};
exports.refresh = id => { if (inst && inst.id === id) { const fresh = store.get().instances.find(x => x.id === id); if (fresh) { inst = fresh; if (!fresh.client || !fresh.client.on || fresh.client.disabled) exports.stop(); else sendCfg(); } } };
exports.stop = () => { dpOn = false; scr = null; if (topT) { clearInterval(topT); topT = null; } mrect = null; editing = false; curBounds = null; [timer, mT, pT].forEach(t => t && clearInterval(t)); timer = mT = pT = null; fg.stop(); input.stop(); if (alive()) w.close(); w = null; inst = null; };

/* état envoyé par le mod client (POST /v1/state) : nombres et courtes chaînes seulement */
const n = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d), t = v => String(v == null ? '' : v).slice(0, 60);
exports.setGame = b => {
  scr = { k: String(b.scr || '').slice(0, 24), t: Date.now() }; // écran ouvert signalé par le mod (voir rpOn)
  if (b.menu) return; // hors d’un monde : seulement l’écran, pas d’état de jeu (sinon le HUD afficherait des zéros)
  gameSt = { fps: Math.round(n(b.fps)), x: n(b.x), y: n(b.y), z: n(b.z), yaw: n(b.yaw), pitch: n(b.pitch), dim: t(b.dim), hp: n(b.hp), food: n(b.food),
    armor: (Array.isArray(b.armor) ? b.armor : []).slice(0, 4).map(a => a && typeof a === 'object' ? { id: t(a.id), max: n(a.max), dmg: n(a.dmg) } : null),
    fx: (Array.isArray(b.fx) ? b.fx : []).slice(0, 12).map(e => ({ id: t(e.id), k: t(e.k), t: n(e.t), a: n(e.a) })),
    drawn: (Array.isArray(b.drawn) ? b.drawn : []).slice(0, 24).map(t) }; gameT = Date.now();
  gameSt.icons = {}; for (const a of gameSt.armor) if (a && a.id && inst) { const u = require('./icons').get(inst.version, a.id); if (u) gameSt.icons[a.id] = u; }
  for (const e of gameSt.fx) { const key = e.k || e.id.toLowerCase().replace(/\s+/g, '_'); if (key && inst && !gameSt.icons['fx:' + key]) { const u = require('./icons').fx(inst.version, key); if (u) gameSt.icons['fx:' + key] = u; } } // effets : textures du jeu aussi // vraies textures Minecraft (jar du jeu) // drawn : modules que le mod dessine lui-même en jeu
};
