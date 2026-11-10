const { app, BrowserWindow, ipcMain, shell, clipboard, dialog, session: electronSession } = require('electron');
const path = require('path'), fs = require('fs');
const log = require('./log'), store = require('./store'), auth = require('./auth'), game = require('./game'), plat = require('./platform');
const spotify = require('./spotify'), modpack = require('./modpack'), datactl = require('./datactl'), media = require('./media'), bridge = require('./bridge'), overlay = require('./overlay'), joiner = require('./joiner'), jre = require('./jre'), playit = require('./playit'), session = require('./session'), host = require('./host'), content = require('./content'), shots = require('./shots'), skins = require('./skins'), updater = require('./updater'), mods = require('./mods'), servers = require('./servers'), notify = require('./notify'), importer = require('./importer');

app.setAppUserModelId('fr.hydarium.launcher'); // nécessaire pour que Windows affiche les notifications
process.on('uncaughtException', e => log.error('uncaughtException', e));
process.on('unhandledRejection', e => log.error('unhandledRejection', e));
if (!app.requestSingleInstanceLock()) app.quit();

let win;
const send = (c, d) => {
  if (win && !win.isDestroyed()) {
    if (c === 'game:started' && store.get().settings.minimize) win.minimize();
    if (c === 'game:close' && store.get().settings.minimize) { win.restore(); win.focus(); }
    win.webContents.send(c, d);
  }
};
const JVM = /^(\s*(-X[\w:=.+\/-]+|-XX:[\w:=.+-]+|-D[\w.]+=[\w.\/:-]*))*\s*$/;
const BIOS = ['plains', 'cherry', 'sunset', 'night', 'snow', 'desert', 'nether', 'end', 'jungle', 'mesa', 'taiga', 'swamp', 'mushroom', 'deepdark'], ACCENTS = ['#3ddc84', '#4fa3d1', '#b388ff', '#ff7a8a', '#f5a524', '#26c6da'];
const CMODS = ['fps', 'cps', 'keystrokes', 'coords', 'direction', 'armor', 'potions', 'ping', 'clock', 'memory', 'music', 'session', 'zoom', 'togglesprint', 'gamma', 'autowalk', 'togglesneak', 'hud'];
function cleanModules(src) {
  const out = {};
  for (const k of CMODS) {
    const m = (src || {})[k]; if (!m || typeof m !== 'object') continue; const r = { on: !!m.on };
    if (m.pos && m.pos.x >= 0 && m.pos.x <= 1 && m.pos.y >= 0 && m.pos.y <= 1) r.pos = { x: +(+m.pos.x).toFixed(3), y: +(+m.pos.y).toFixed(3) };
    if (m.scale >= 0.5 && m.scale <= 3) r.scale = +m.scale; if (m.opacity >= 0.1 && m.opacity <= 1) r.opacity = +m.opacity;
    if (typeof m.color === 'string' && /^#[0-9a-f]{6}$/i.test(m.color)) r.color = m.color; if (typeof m.bg === 'boolean') r.bg = m.bg;
    if (typeof m.key === 'string' && /^[A-Z0-9_]{1,16}$/.test(m.key)) r.key = m.key; if (typeof m.toggle === 'string' && /^[A-Z0-9_]{1,16}$/.test(m.toggle)) r.toggle = m.toggle; if (typeof m.show === 'string' && /^[a-z,]{0,40}$/.test(m.show)) r.show = m.show; /* éléments affichés d'un widget (armure : icon,name,pct ; effets : icon,name,lvl,time) */ /* touche d'activation / désactivation en jeu : elle était perdue à l'enregistrement */ if (k === 'gamma' && m.level >= 1 && m.level <= 15) r.level = +m.level; if (k === 'zoom' && m.level >= 1.5 && m.level <= 30) r.level = +(+m.level).toFixed(2); /* zoom de départ (la molette le change en jeu) */ if (k === 'zoom' && typeof m.cinematic === 'boolean') r.cinematic = m.cinematic; /* caméra cinématique pendant le zoom */
    if (k === 'hud' && typeof m.round === 'boolean') r.round = m.round; if (k === 'keystrokes' && ['auto', 'wasd', 'zqsd'].includes(m.layout)) r.layout = m.layout; if (k === 'keystrokes' && typeof m.scan === 'boolean') r.scan = m.scan; if (k === 'armor' && typeof m.durability === 'boolean') r.durability = m.durability;
    out[k] = r;
  }
  return out;
}
const WALLS = ['auto', 'none', 'plains', 'cherry', 'sunset', 'night', 'snow', 'nether', 'end', 'desert', 'jungle', 'mesa', 'taiga', 'swamp', 'mushroom', 'deepdark'];
const okId = id => /^[a-z0-9]+$/.test(String(id));
const on = (n, f) => ipcMain.handle(n, async (e, ...a) => { try { return { ok: true, data: await f(...a) }; } catch (err) { log.error('ipc', n, err); return { ok: false, error: err.message }; } });
const focus = () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } };

/* taille de l'interface (Paramètres › Apparence) : zoom de la fenêtre, de 75 % à 150 % */
const logDays = () => { const v = store.get().settings.logDays; return typeof v === 'number' && v >= 0 ? v : 14; }; // jours de conservation des journaux (0 = jamais)
function applyScale() { try { const v = +store.get().settings.uiScale; if (win && !win.isDestroyed()) win.webContents.setZoomFactor(v >= 0.75 && v <= 1.5 ? v : 1); } catch (e) {} }
function createWindow() {
  win = new BrowserWindow({
    icon: path.join(__dirname, '..', '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    width: 1120, height: 720, minWidth: 900, minHeight: 580, backgroundColor: '#0b0d11', title: 'Hydarium', frame: false,
    webPreferences: { preload: path.join(__dirname, '../preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.loadFile(path.join(__dirname, '../renderer/index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('did-finish-load', applyScale);
  win.webContents.on('render-process-gone', (e, d) => log.error('Processus d’interface arrêté', d));
}
app.on('second-instance', focus);

app.whenReady().then(async () => {
  /* YouTube refuse (erreur 153) d'être intégré dans une page sans Referer, ce qui est le cas des pages locales file:// : on en fournit un pour la vidéo d'aide */
  try { electronSession.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['https://www.youtube-nocookie.com/*', 'https://www.youtube.com/embed/*'] }, (d, cb) => { const h = { ...d.requestHeaders }; h['Referer'] = 'https://hydarium.net/'; cb({ requestHeaders: h }); }); } catch (e) { log.error('referer youtube', e); }
  store.init(plat.dataDir()); log.rotate(logDays());
  log.info(`Démarrage Hydarium ${app.getVersion()} · ${plat.id} ${process.arch} · Electron ${process.versions.electron} · Node ${process.versions.node}`);
  plat.javas(store.get().settings.javas).then(l => log.info('Java détectés :', l.map(j => `Java ${j.major} (${j.version}, ${j.vendor}, ${j.is64 ? 64 : 32} bits) ${j.path}`)));
  notify.onClick(a => { if (a === 'update:open') { focus(); send('update:open'); } else if (a === 'crash') { focus(); send('game:crash-open'); } else if (a && a.startsWith('file:')) shell.showItemInFolder(a.slice(5)); else if (a && a.startsWith('shot:')) shell.openPath(a.slice(5)); else if (a && a.startsWith('ovl:join:')) { const c = session.current(); overlay.open('join', c && c.id, { addr: a.slice(9) }); } else if (a && a.startsWith('ovl:datapack:')) { const c = session.current(); overlay.open('content', c && c.id, { world: a.slice(13) }); } else focus(); });

  on('platform', () => ({ ...plat.info(), version: app.getVersion() }));
  on('notify', (t, b) => notify.show(String(t).slice(0, 80), String(b).slice(0, 300), ''));
  on('log', (lv, m) => (lv === 'error' ? log.error : log.info)('interface', String(m).slice(0, 500)));
  on('win', a => { if (a === 'min') win.minimize(); else if (a === 'max') win.isMaximized() ? win.unmaximize() : win.maximize(); else if (a === 'close') win.close(); });
  on('set:get', () => store.get().settings);
  on('set:set', async o => {
    const s = store.get().settings, T = { uiScale: 'number', notif: 'boolean', minimize: 'boolean', autostart: 'boolean', wall: 'string', theme: 'string', mem: 'number', java: 'string', accent: 'string', view: 'string', dl: 'number', favMods: 'object', srvMods: 'object', favContent: 'object', snaps: 'boolean', defJvm: 'string', defResMode: 'string', defW: 'number', defH: 'number', defOptim: 'boolean', gameLang: 'string', langSync: 'boolean', cProfiles: 'object', uiLang: 'string', spotifyId: 'string', notifLaunch: 'boolean', notifCrash: 'boolean', notifShot: 'boolean', notifDone: 'boolean', notifServer: 'boolean', notifQuiet: 'boolean', logDays: 'number', cfKey: 'string', tour: 'boolean', music: 'string', overlayKey: 'string', autoJava: 'boolean', showLog: 'boolean', cfClean: 'boolean', autoUpdate: 'boolean' };
    for (const [k, v] of Object.entries(o || {})) {
      if (typeof v !== T[k]) continue;
      if (k === 'cProfiles') { s.cProfiles = (Array.isArray(v) ? v : []).slice(0, 12).map(p => ({ name: String((p && p.name) || '').slice(0, 24), modules: cleanModules((p && p.modules) || {}) })).filter(p => p.name); continue; }
      if (k === 'srvMods') { s.srvMods = [...new Set((Array.isArray(v) ? v : []).map(x => String(x || '').toLowerCase()).filter(x => /^[a-z0-9_-]{2,64}$/.test(x)))].slice(0, 30); continue; }
      if (k === 'favMods') { s.favMods = (Array.isArray(v) ? v : []).slice(0, 200).map(f => ({ slug: String((f && f.slug) || '').slice(0, 64), title: String((f && f.title) || f.slug).slice(0, 60), icon: /^https:\/\/(cdn\.modrinth\.com|media\.forgecdn\.net)\//.test(f.icon || '') ? f.icon : '', tags: (Array.isArray(f.tags) ? f.tags : []).slice(0, 6).map(t => String(t).slice(0, 20)) })).filter(f => /^[A-Za-z0-9_-]{2,64}$/.test(f.slug)); continue; }
      if (k === 'favContent') { s.favContent = (Array.isArray(v) ? v : []).slice(0, 300).map(f => f && typeof f === 'object' ? ({ type: String(f.type), src: f.src === 'curseforge' ? 'curseforge' : 'modrinth', pid: String(f.pid == null ? '' : f.pid).slice(0, 64), title: String(f.title || f.pid || '').slice(0, 60), icon: /^https:\/\/(cdn\.modrinth\.com|media\.forgecdn\.net)\//.test(f.icon || '') ? f.icon : '' }) : null).filter(f => f && ['resourcepack', 'shader', 'datapack'].includes(f.type) && /^[A-Za-z0-9_-]{1,64}$/.test(f.pid)); continue; } /* favoris des packs de ressources, shaders et data packs */
      if (k === 'wall' && !WALLS.includes(v)) continue;
      if (k === 'accent' && !/^#[0-9a-f]{6}$/i.test(v)) continue;
      if (k === 'dl' && !(v >= 1 && v <= 32)) continue;
      if (k === 'logDays' && !(v >= 0 && v <= 365)) continue;
      if (k === 'defJvm' && (v.length > 400 || !/^[\w\-=.:+\/ ]*$/.test(v))) continue;
      if (k === 'defResMode' && !['default', 'window', 'full'].includes(v)) continue;
      if ((k === 'defW' && !(v >= 400 && v <= 7680)) || (k === 'defH' && !(v >= 300 && v <= 4320))) continue;
      if (k === 'uiLang' && !['fr', 'en'].includes(v)) continue;
      if (k === 'spotifyId' && !/^[a-f0-9]{0,64}$/i.test(v)) continue;
      if (k === 'cfKey' && !/^[\w$./+=-]{0,200}$/.test(v)) continue;
      if (k === 'gameLang' && !/^[a-z]{2}_[a-z]{2}$/.test(v)) continue;
      if (k === 'music' && !['auto', 'spotify', 'youtube', 'off'].includes(v)) continue;
      if (k === 'overlayKey' && !/^(off|[A-Za-z0-9]+(\+[A-Za-z0-9]+){0,3})$/.test(v)) continue;
      if (k === 'view' && !['grid', 'list'].includes(v)) continue;
      if (k === 'theme' && !['dark', 'light'].includes(v)) continue;
      if (k === 'mem' && !(v >= 1 && v <= 32)) continue;
      if (k === 'uiScale' && !(v >= 0.75 && v <= 1.5)) continue;
      if (k === 'java' && v && !(await plat.javaInfo(v))) throw new Error('Java inutilisable : ' + v);
      s[k] = k === 'logDays' ? Math.round(v) : v; if (k === 'logDays') log.rotate(logDays()); if (k === 'autostart') app.setLoginItemSettings({ openAtLogin: v });
    }
    store.save(); applyScale();
  });
  on('java:list', force => plat.javas(store.get().settings.javas, !!force));
  on('java:add', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Choisir un Java (java.exe)', properties: ['openFile'] });
    if (r.canceled || !r.filePaths[0]) return null;
    const j = await plat.javaInfo(r.filePaths[0]); if (!j) throw new Error('Ce fichier n’est pas un Java utilisable.');
    const s = store.get().settings; if (!s.javas.includes(j.path)) { s.javas.push(j.path); store.save(); } return j;
  });
  on('java:remove', p => { const s = store.get().settings; s.javas = s.javas.filter(x => x !== p); if (s.java === p) s.java = ''; store.save(); });
  on('srv:saved', () => store.get().servers);
  on('imp:manual', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Choisir le dossier à importer', properties: ['openDirectory'] });
    return r.canceled || !r.filePaths[0] ? null : importer.manual(r.filePaths[0]);
  });
  on('inst:files', id => {
    if (!okId(id)) return {}; const d = game.dirOf(id);
    const ls = s => { try { return fs.readdirSync(path.join(d, s)).map(n => { const t = fs.statSync(path.join(d, s, n)); return { name: n, mtime: t.mtimeMs, dir: t.isDirectory(), size: t.size }; }); } catch (e) { return []; } };
    return { worlds: ls('saves').filter(x => x.dir), packs: ls('resourcepacks'), shaders: ls('shaderpacks'), shots: ls('screenshots') };
  });
  on('help:mail', () => shell.openExternal('mailto:help@hydarium.net?subject=' + encodeURIComponent('Aide Hydarium ' + app.getVersion())));
  on('logs:open', () => { fs.mkdirSync(log.dir(), { recursive: true }); return shell.openPath(log.dir()); });
  on('logs:copy', () => { clipboard.writeText(log.report()); });
  on('wiz:state', () => store.get().wizard);
  on('wiz:done', () => { store.get().wizard = true; store.save(); });
  on('wiz:reset', () => { store.get().wizard = false; store.save(); });
  on('imp:detect', importer.detect);
  on('imp:scan', importer.scan);
  on('imp:run', async (key, keys) => { // l’import de plusieurs instances peut être long : une notification prévient à la fin (la personne peut faire autre chose)
    const r = await importer.run(key, keys);
    if ((keys || []).length > 1) notify.show('Import terminé', `${r.done} instance(s) importée(s).` + (r.skipped && r.skipped.length ? ' Ignorée(s) : ' + r.skipped.slice(0, 3).join(', ') + (r.skipped.length > 3 ? '…' : '') + '.' : ''), null, 'done');
    return r;
  });
  on('auth:current', auth.current); on('auth:login', auth.login); on('auth:logout', auth.logout);
  on('versions', game.versions);
  on('inst:list', () => store.get().instances);
  on('inst:create', async i => {
    const name = String((i && i.name) || '').trim();
    if (!name) throw new Error('Donne un nom à l’instance.');
    const v = (await game.versions()).find(x => x.id === (i && i.version));
    if (!v) throw new Error('Version de Minecraft inconnue.');
    const loader = ['vanilla', 'fabric', 'quilt', 'forge', 'neoforge'].includes(i.loader) ? i.loader : 'vanilla';
    if ((loader === 'forge' || loader === 'neoforge') && !/^[\w.+-]{1,40}$/.test(i.loaderVer || '')) throw new Error('Choisis une version de ' + loader + '.');
    const n = store.addInstance({ name, version: v.id, type: v.type, loader }); try { content.defApply(n.id); } catch (e) { log.warn('réglages par défaut', e.message); } if (loader === 'forge' || loader === 'neoforge') { n.loaderVer = i.loaderVer; store.save(); } return n;
  });
  on('inst:delete', id => { const L = host.linksTo(id); if (L.some(h => host.isRunning(h.id))) throw new Error('Le serveur « ' + L.find(h => host.isRunning(h.id)).name + ' » utilise un monde de cette instance : arrête-le d’abord.'); L.forEach(h => host.unlinkWorld(h.id)); /* le serveur garde une copie de son monde */ try { require('./stats').bank(id); } catch (e) { log.warn('stats avant suppression', e.message); } game.remove(id); store.removeInstance(id); }); // les statistiques de l’instance sont gardées avant sa suppression
  on('game:stop', () => game.stop());
  require('./autojoin').init(send); on('join:state', () => require('./autojoin').state()); on('join:confirm', () => require('./autojoin').confirm()); on('join:answer', a => { a = a || {}; require('./autojoin').answer({ vanilla: a.vanilla === true, version: /^\d{1,2}(\.\d{1,2}){1,2}$/.test(String(a.version || '')) ? String(a.version) : '' }); }); on('join:cancel', () => require('./autojoin').cancel()); on('join:run', (addr, id) => require('./autojoin').run(String(addr || ''), id));
  on('game:play', (id, o) => { // l'instance se lance toujours ; mais ouvrir un monde relié à un serveur en ligne = rejoindre ce serveur (le monde est verrouillé par lui)
    o = { ...(o || {}) }; const h = o.world ? host.linksTo(id).find(x => x.link.folder === o.world && host.isRunning(x.id)) : null;
    if (h) { if (host.runState(h.id) !== 'running') throw new Error('Le serveur « ' + h.name + ' » utilise ce monde et démarre encore : réessaie dans un instant.'); o.server = 'localhost:' + h.port; delete o.world; }
    return game.play(id, send, o);
  });
  on('inst:detail', async id => { const s = mods.status(id); return { ...s, need: await game.needJava(s.inst) }; });
  on('inst:set', async (id, o) => {
    const i = store.get().instances.find(x => x.id === id); if (!i || !o) return;
    if (o.mem >= 1 && o.mem <= 32) i.mem = Math.round(o.mem);
    if (typeof o.java === 'string') { if (o.java && !(await plat.javaInfo(o.java))) throw new Error('Java introuvable ou inutilisable.'); i.java = o.java; }
    if (typeof o.name === 'string' && o.name.trim()) i.name = o.name.trim().slice(0, 40);
    if (typeof o.cat === 'string') i.cat = o.cat.trim().slice(0, 24);
    if (Array.isArray(o.tags)) i.tags = [...new Set(o.tags.map(t => String(t).trim().slice(0, 20)).filter(Boolean))].slice(0, 12);
    if (typeof o.cover === 'string' && (o.cover === '' || BIOS.includes(o.cover))) i.cover = o.cover;
    if (typeof o.notes === 'string') i.notes = o.notes.slice(0, 500);
    if (o.minMem >= 1 && o.minMem <= 32) i.minMem = Math.round(o.minMem);
    if (o.res && ['default', 'window', 'full'].includes(o.res.mode)) i.res = { mode: o.res.mode, w: Math.min(7680, Math.max(400, Math.round(+o.res.w) || 1280)), h: Math.min(4320, Math.max(300, Math.round(+o.res.h) || 720)) };
    if (typeof o.args === 'string') { if (o.args.length > 200 || !/^[\w\-=.:\/ ]*$/.test(o.args)) throw new Error('Arguments du jeu invalides.'); i.args = o.args.trim(); }
    if (typeof o.autoServer === 'string') { if (o.autoServer && !/^[a-z0-9.-]+(:\d{1,5})?$/i.test(o.autoServer)) throw new Error('Adresse de serveur invalide.'); i.autoServer = o.autoServer; }
    if (o.client && typeof o.client === 'object' && (setTimeout(() => require('./hud').refresh(id), 300) || true)) {
      i.client = { on: true, ...(o.client.disabled ? { disabled: true } : {}), modules: cleanModules(o.client.modules) }; // le client Hydarium est obligatoire : « on » ne se désactive pas
      try { require('./session').writeConfig(i, game.dirOf(id)); } catch (e) { log.warn('config client', e.message); } // le mod relit ce fichier toutes les secondes : un réglage fait pendant la partie s'applique tout de suite (avant, il n'était écrit qu'au lancement)
    }
    if (typeof o.jvm === 'string') { if (o.jvm.length > 300 || !JVM.test(o.jvm)) throw new Error('Arguments JVM invalides (seulement -X…, -XX:… ou -D…=…).'); i.jvm = o.jvm.trim(); }
    store.save();
  });
  on('inst:open', (id, sd) => { const i = store.get().instances.find(x => x.id === id); if (!i) return; const d = ['mods', 'saves', 'resourcepacks', 'shaderpacks', 'screenshots'].includes(sd) ? path.join(game.dirOf(id), sd) : game.dirOf(id); fs.mkdirSync(d, { recursive: true }); return shell.openPath(d); });
  on('inst:dup', id => { const i = store.get().instances.find(x => x.id === id); if (!i) throw new Error('Instance introuvable.'); const c = store.addInstance({ ...i, name: i.name + ' (copie)' }); c.mods = JSON.parse(JSON.stringify(i.mods)); c.mem = i.mem; if (i.client) c.client = { ...JSON.parse(JSON.stringify(i.client)), on: true }; store.save(); try { fs.cpSync(game.dirOf(id), game.dirOf(c.id), { recursive: true }); } catch (e) {} return c; });
  on('inst:code', id => mods.code(id));
  on('inst:import', c => mods.importCode(c));
  on('mods:search', (id, q) => mods.search(id, q));
  on('mods:add', (id, pid) => mods.add(id, pid));
  on('mods:remove', (id, pid, c) => mods.remove(id, pid, c)); on('mods:trust', (id, pid, on) => mods.trust(id, pid, !!on));
  const pick = async (title, props, filters) => { const r = await dialog.showOpenDialog(win, { title, properties: props, filters }); return r.canceled ? [] : r.filePaths; };
  on('opts:get', id => content.optGet(id)); on('opts:set', (id, o) => content.optSet(id, o));
  on('content:search', (c, t, q, off, src) => content.search(c, t, q, off, src)); on('content:install', (id, t, pid, w, src) => t === 'modpack' ? require('./packs').install(t, pid, src, id, p => send('import:progress', p)) : content.install(id, t, pid, w, src));
  on('content:list', (id, t) => content.list(id, t)); on('content:toggle', (id, t, n) => content.toggle(id, t, n)); on('content:remove', (id, t, n) => content.remove(id, t, n));
  on('content:import', async (id, t) => { const f = await pick('Choisir des fichiers .zip', ['openFile', 'multiSelections'], [{ name: 'Archive zip', extensions: ['zip'] }]); return f.length ? content.importFiles(id, t, f) : 0; });
  on('mods:toggle', (id, pid, dry) => mods.toggle(id, pid, dry)); on('mods:dependents', (id, pid) => mods.dependents(id, pid)); on('mods:updates', id => mods.checkUpdates(id)); on('mods:update', (id, pid) => mods.updateMod(id, pid));
  on('world:resimp', async (id, f) => { const r = await pick('Pack de ressources du monde', ['openFile'], [{ name: 'Pack (zip)', extensions: ['zip'] }]); if (!r[0]) return false; content.worldResImport(id, f, r[0]); return true; }); on('world:resrm', (id, f) => content.worldResRemove(id, f));
  on('world:info', (id, f) => content.worldInfo(id, f)); on('world:set', (id, f, o) => content.worldSet(id, f, o)); on('world:packrm', (id, f, n) => content.packRemove(id, f, n));
  on('world:packimp', async (id, f) => { const p = await pick('Choisir des data packs (.zip)', ['openFile', 'multiSelections'], [{ name: 'Data pack', extensions: ['zip'] }]); return p.length ? content.packImport(id, f, p) : 0; });
  bridge.route('GET', '/v1/ping', () => ({ ok: true, version: app.getVersion() }));
  bridge.route('GET', '/v1/config', q => { const i = store.get().instances.find(x => x.id === q.i); if (!i) throw new Error('Instance inconnue.'); return { mc: i.version, loader: i.loader, modules: (i.client && i.client.modules) || {} }; });
  /* bascules faites EN JEU avec une touche (marche auto, zoom, sprint auto…) : le mod les signale (champ « tg »). On les inscrit dans la configuration de l’instance et dans le fichier lu par le mod,
     puis on prévient les fenêtres : la case du menu Alt+H (et de la page Instance) suit alors vraiment l’état réel en jeu. */
  const syncToggles = tg => {
    const c = session.current(); if (!c || !tg || typeof tg !== 'object') return; const i = store.get().instances.find(x => x.id === c.id); if (!i || !i.client) return;
    const mods = (i.client.modules = i.client.modules || {}); let ch = false;
    for (const [k, v] of Object.entries(tg)) { if (!CMODS.includes(k) || typeof v !== 'boolean') continue; const m = (mods[k] = mods[k] || {}); if (!!m.on !== v) { m.on = v; ch = true; } }
    if (!ch) return; store.save(); try { session.writeConfig(i, game.dirOf(i.id)); } catch (e) {} try { require('./hud').refresh(i.id); } catch (e) {}
    send('client:synced', { id: i.id, client: i.client }); try { require('./overlay').send('client:synced', { id: i.id, client: i.client }); } catch (e) {}
  };
  bridge.route('POST', '/v1/state', (q, b) => { require('./hud').setGame(b || {}); if (b && b.tg) { try { syncToggles(b.tg); } catch (e) { log.warn('synchro des modules', e.message); } } if (b && b.menu) return { ok: true }; /* simple signalement d’écran (hors monde) : pas de statistiques */ try { require('./stats').onState(b || {}); } catch (e) {} return { ok: true }; });
  bridge.route('GET', '/v1/music', async () => ({ track: await media.get() }));
  bridge.route('POST', '/v1/music', async (q, b) => ({ track: await media.act(String(b.cmd || '')) }));
  bridge.route('POST', '/v1/overlay', (q, b) => { const c = session.current(); overlay.open(['hub', 'skins', 'content', 'shots', 'music'].includes(b.page) ? b.page : 'hub', c && c.id); });
  on('media:get', () => media.get()); on('media:cmd', c => media.act(c));
  on('ovl:open', (page, id) => overlay.open(page, id)); on('ovl:close', () => { try { require('./hud').setEditing(false); } catch (e) {} overlay.close(); });
  on('srv:plan', a => joiner.plan(a, { soft: true })); on('srv:mkvanilla', async (addr, version, name) => { const n = await joiner.createVanilla(String(addr || ''), String(version || ''), String(name || '')); send('inst:changed', n.id); return n; }); on('srv:setreq', (id, r) => joiner.setReq(id, r));
  on('java:install', async m => { const j = await jre.install(m, s => send('game:progress', { type: s, task: 0, total: 1 })).finally(() => send('game:progress', { type: '', task: 0, total: 0 })); require('./notify').show('Java installé', 'Java ' + j.major + ' est prêt', '', 'done'); return j; });
  on('client:status', id => session.status(id));
  /* Mod Hydarium à la demande : dès qu'une instance est créée (par n'importe quel chemin) on prépare, EN ARRIÈRE-PLAN, le mod de sa version ; déjà fabriqué pour cette version → rien à refaire. */
  const modbuild = require('./modbuild');
  store.onAdd(i => modbuild.prepare(i));
  modbuild.onEvent = e => {
    send('client:state', { key: e.key, type: e.type });
    if (e.type === 'fail') notify.show('Mod Hydarium non construit', 'Minecraft ' + e.version + ' démarrera sans lui (seul le HUD du launcher sera utilisé). Détails : Instance › Hydarium Client.', null);
  };
  on('client:build', id => { const i = store.get().instances.find(x => x.id === id); if (!i) throw new Error('Instance introuvable.'); modbuild.ensure(i, send, { force: true }).then(() => send('client:state', { key: '', type: 'done' })); return { started: true }; }); // « Construire / Réessayer » : tourne en arrière-plan, l'interface suit par client:progress / client:state
  on('client:ensure', id => { const i = store.get().instances.find(x => x.id === id); if (!i) throw new Error('Instance introuvable.'); return session.ensureClient(i, send); }); // crée (ou récupère) le mod Hydarium de la version de l’instance
  on('spotify:status', () => spotify.status()); on('spotify:login', () => spotify.login()); on('spotify:logout', () => spotify.logout());
  on('mods:disableall', id => mods.disableAll(id));
  on('mods:batch', (id, pids, action, o) => { // sélection multiple (désactiver / activer / retirer) : refusé pendant que le jeu (ou le serveur) utilise les fichiers
    o = o || {}; if (!o.dry) { const c = session.current(); if (c && c.id === id) throw new Error('Ferme le jeu avant de modifier les mods.'); if (host.isRunning && host.isRunning(id)) throw new Error('Arrête le serveur avant de modifier les mods.'); }
    return mods.batch(id, Array.isArray(pids) ? pids.map(String).slice(0, 500) : [], String(action), { dry: !!o.dry, cascade: !!o.cascade });
  });
  on('host:world', (id, instId, folder, mode) => host.attachWorld(id, String(instId), folder, mode)); on('host:unlink', id => host.unlinkWorld(id));
  on('mods:setall', (id, on) => { // tout désactiver / tout activer : refusé pendant que le jeu (ou le serveur) utilise les fichiers
    const c = session.current(); if (c && c.id === id) throw new Error('Ferme le jeu avant de changer l’état des mods.');
    if (host.isRunning && host.isRunning(id)) throw new Error('Arrête le serveur avant de changer l’état des mods.');
    return on ? mods.enableAll(id) : mods.disableAll(id);
  });
  on('mods:removeall', id => { // tout retirer : refusé pendant que le jeu (ou le serveur) utilise les fichiers
    const c = session.current(); if (c && c.id === id) throw new Error('Ferme le jeu avant de retirer les mods.');
    if (host.isRunning && host.isRunning(id)) throw new Error('Arrête le serveur avant de retirer les mods.');
    return mods.removeAll(id);
  });
  on('mods:compat', async (slugs, loader, version) => { // mods proposés à la création : seulement ceux qui existent pour ce loader et cette version
    const list = (Array.isArray(slugs) ? slugs : []).map(String).slice(0, 60), isCf = s => /^cf\d+$/.test(s);
    const out = await mods.compat(list.filter(s => !isCf(s)), loader, version), cf = require('./curseforge');
    if (cf.hasKey()) await Promise.all(list.filter(isCf).slice(0, 20).map(async s => { try { await cf.latestFile(+s.slice(2), version, loader, 'mod'); out[s] = true; } catch (e) { out[s] = /Aucun fichier/.test(e.message) ? false : null; } }));
    return out;
  });
  on('forge:mcs', l => require('./forge').mcs(l));
  on('defopts:get', () => content.defOptions()); on('defopts:set', o => content.setDefOptions(o)); on('defopts:apply', id => content.defApply(id));
  on('worlds:names', id => content.worldsDp(id)); on('dp:staged', id => content.stagedCount(id));
  on('hud:rect', r => require('./hud').setMusicRect(r)); on('hud:keys', o => require('./input').setKeys(o)); on('hud:edit', v => require('./hud').setEditing(!!v)); on('ovl:fit', v => overlay.fit(!!v));
  on('dp:import', async (id, w) => { const p = await pick('Choisir des data packs (.zip)', ['openFile', 'multiSelections'], [{ name: 'Data pack', extensions: ['zip'] }]); return p.length ? content.dpImport(id, w, p) : 0; });
  on('dp:tempworld', () => { const t = content.tempWorld(require('./session').sessionStart() || Date.now() - 6 * 3600e3); return t ? { name: t.name } : null; });
  on('stats:get', () => require('./stats').get());
  on('totem:base', id => content.totemBase(id));
  on('cf:status', () => ({ key: require('./curseforge').hasKey() }));
  on('cf:openkeys', () => shell.openExternal('https://console.curseforge.com/#/api-keys')); // navigateur par défaut
  on('cf:check', k => require('./curseforge').check(String(k || '')));
  on('modpack:import', async () => { const f = await pick('Choisir un modpack', ['openFile'], [{ name: 'Modpack', extensions: ['mrpack', 'zip'] }]); if (!f[0]) return null; const r = await modpack.run(f[0], p => send('import:progress', p)); require('./notify').show('Modpack importé', r.name, '', 'done'); return r; });
  on('host:export', async id => { const h = host.list().find(x => x.id === id); const r = await dialog.showSaveDialog(win, { title: 'Exporter le serveur', defaultPath: (h ? h.name : 'serveur').replace(/[^\w -]/g, '_') + '.zip', filters: [{ name: 'Zip', extensions: ['zip'] }] }); if (r.canceled || !r.filePath) return false; host.export(id, r.filePath); return true; });
  on('host:import', async () => { const f = await pick('Choisir un serveur exporté', ['openFile'], [{ name: 'Zip', extensions: ['zip'] }]); return f[0] ? host.import(f[0]) : null; });
  /* accès Internet gratuit via l'agent playit.gg */
  const sendP = (c, d) => { if (c === 'playit:state') { try { host.syncPlayit((d && d.tunnels) || {}); } catch (e) {} } send(c, d); }; // dès qu'un tunnel est détecté pour le port d'un serveur, son adresse est enregistrée
  on('playit:status', () => playit.status()); on('playit:start', () => playit.start(sendP)); on('playit:stop', () => playit.stop(sendP)); on('playit:install', () => playit.install(sendP)); on('playit:check', a => playit.check(a));
  on('playit:create', (port, name) => playit.createTunnel(+port, String(name || '').slice(0, 60), sendP)); on('playit:assign', (id, port) => playit.assignTunnel(String(id || ''), +port, sendP)); on('playit:reset', () => playit.resetAccount(sendP));
  on('playit:claim', () => { const u = playit.status().claimUrl; if (!/^https:\/\/playit\.gg\/claim\/[A-Za-z0-9_-]{4,64}$/.test(u)) throw new Error('Pas de lien de liaison pour le moment.'); shell.openExternal(u); });
  on('playit:site', () => shell.openExternal(playit.DASHBOARD)); on('playit:download', () => shell.openExternal(playit.DOWNLOAD)); /* « Gérer mes tunnels » = la page des tunnels du compte, pas l'accueil du site */
  /* invitations privées P2P (aucun port ouvert) : l'hôte partage, l'invité enregistre le code dans « Mes serveurs » */
  on('p2p:info', id => host.p2pInfo(String(id || ''))); on('p2p:set', (id, o) => host.p2pSet(String(id || ''), { on: o && typeof o.on === 'boolean' ? o.on : undefined, renew: !!(o && o.renew) }));
  on('p2p:test', code => require('./p2p').test(String(code || ''))); on('srv:addp2p', o => servers.addP2p(o || {}));
  require('./p2p').onChange(() => send('p2p:state', {}));
  on('credits:list', () => require('./credits').list());
  on('plugin:list', id => content.pluginList(id)); on('plugin:toggle', (id, f) => content.pluginToggle(id, f)); on('plugin:remove', (id, f) => content.pluginRemove(id, f));
  on('data:sizes', () => datactl.sizes()); on('data:clear', k => datactl.clear(k));
  on('data:reset', m => { datactl.reset(m); if (m === 'all') { setTimeout(() => { app.relaunch(); app.exit(0); }, 400); } return true; });
  on('srv:meta', (id, o) => require('./servers').meta(id, o)); on('srv:move', (id, d) => require('./servers').move(id, d));
  on('forge:versions', (l, mc) => require('./forge').versions(l, mc));
  on('host:mods', id => mods.status(id));
  on('host:icon', async id => { const f = await pick('Choisir une image pour le serveur', ['openFile'], [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg'] }]); if (f[0]) host.setIcon(id, f[0]); return !!f[0]; });
  on('host:iconrm', id => host.removeIcon(id));
  on('totem:make', (id, url, icon) => content.totem(id, url, icon));
  on('host:players', id => host.players(id)); on('host:player', (id, a, n) => host.player(id, a, n));
  on('host:list', () => host.list()); on('host:create', o => host.create(o, send)); on('host:start', id => host.start(id, send)); on('host:stop', id => host.stop(id)); on('host:cmd', (id, c) => host.cmd(id, c)); on('host:log', id => host.log(id));
  on('host:props', id => host.props(id)); on('host:setprops', (id, o) => host.setProps(id, o)); on('host:set', (id, o) => host.set(id, o)); on('host:remove', id => host.remove(id)); on('host:open', id => shell.openPath(host.dir(id)));
  on('data:open', () => shell.openPath(plat.dataDir()));
  on('mods:import', async id => { const f = await pick('Choisir un mod (.jar)', ['openFile', 'multiSelections'], [{ name: 'Mod', extensions: ['jar'] }]); f.forEach(p => mods.importFile(id, p)); return f.length; });
  on('worlds:list', id => { const L = host.linksTo(id); return content.worlds(id).map(w => { const h = L.find(x => x.link.folder === w.folder); return h ? { ...w, srv: h.name, srvOn: host.runState(h.id) === 'running' } : w; }); });
  on('worlds:op', (id, f, op) => { const h = host.linksTo(id).find(x => x.link.folder === f); if (op === 'delete' && h) throw new Error('Ce monde est relié au serveur « ' + h.name + ' » : délie-le d’abord depuis la page du serveur.'); return content.worldOp(id, f, op); });
  on('worlds:export', (id, f, dst) => content.worldExport(id, f, dst));
  on('worlds:import', async (id, kind) => { const f = await pick('Choisir un monde', [kind === 'zip' ? 'openFile' : 'openDirectory'], kind === 'zip' ? [{ name: 'Monde (zip)', extensions: ['zip'] }] : undefined); if (!f[0]) return false; content.worldImport(id, f[0]); return true; });
  on('shots:list', () => shots.list()); on('shots:thumb', (i, f) => shots.thumb(i, f)); on('shots:full', (i, f) => shots.full(i, f)); on('shots:op', (i, f, op) => shots.op(i, f, op)); on('shots:orig', (i, f) => shots.orig(i, f)); on('shots:save', (i, f, d) => shots.save(i, f, d)); on('shots:clip', d => shots.clip(d));
  on('skins:profile', () => skins.profile()); on('skins:fallback', () => skins.fallback());
  on('skins:addfile', async v => { const f = await pick('Choisir un skin (PNG)', ['openFile'], [{ name: 'Image PNG', extensions: ['png'] }]); return f[0] ? skins.addFile(f[0], v) : null; });
  on('skins:fromplayer', n => skins.fromPlayer(n)); on('skins:savecurrent', () => skins.saveCurrent());
  on('skins:apply', id => skins.apply(id)); on('skins:remove', id => skins.remove(id)); on('skins:variant', (id, v) => skins.setVariant(id, v)); on('skins:rename', (id, n) => skins.rename(id, n)); on('skins:cape', id => skins.cape(id)); on('skins:restore', () => skins.restoreDefaults()); on('skins:retry', () => skins.retryDefaults());
  on('skins:export', async id => { const s = skins.fileOf(id), r = await dialog.showSaveDialog(win, { title: 'Exporter le skin', defaultPath: s.name.replace(/[^\w -]/g, '_') + '.png', filters: [{ name: 'PNG', extensions: ['png'] }] }); if (r.canceled || !r.filePath) return false; fs.copyFileSync(s.file, r.filePath); return true; });
  on('srv:sync', () => require('./servers').syncGame());
  on('srv:list', servers.list); on('srv:add', servers.add); on('srv:del', (id, g) => servers.del(id, !!g));
  createWindow();
  setTimeout(() => { try { servers.warm(); } catch (e) {} }, 2500);
  /* mises à jour : réglage « Mises à jour automatiques » (Paramètres › Général). Jamais pendant une partie. */
  updater.init({ packaged: app.isPackaged, version: app.getVersion(), portable: !!process.env.PORTABLE_EXECUTABLE_FILE, appImage: !!process.env.APPIMAGE, send, isBusy: () => require('./game').isRunning(), enabled: () => store.get().settings.autoUpdate !== false, notify: (t, b, a) => notify.show(t, b, a, 'update') });
  updater.startup();
  on('update:state', () => updater.state()); on('update:check', () => updater.check(true)); on('update:install', () => updater.install()); on('update:open', () => shell.openExternal(updater.PAGE));
  setTimeout(() => { skins.ensureDefaults().catch(() => {}); }, 6000); // skins par défaut de Minecraft : récupérés en arrière-plan pour que le Profil les ait déjà // l'onglet Serveurs s'ouvre alors avec l'état déjà connu
  setTimeout(() => { host.closeLegacyPorts().catch(e => log.warn('closeLegacyPorts', e.message)); }, 4000); // anciennes versions : ports ouverts sur la box (UPnP) refermés une fois
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('before-quit', () => { host.stopAll(); playit.stop(); require('./p2p').stopAll().catch(() => {}); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
