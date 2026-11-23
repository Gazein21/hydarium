const { app, BrowserWindow, ipcMain, shell, clipboard, dialog, session: electronSession, nativeImage} = require('electron');
const path = require('path'), fs = require('fs');
const log = require('./log'), store = require('./store'), auth = require('./auth'), game = require('./game'), plat = require('./platform');
const spotify = require('./spotify'), modpack = require('./modpack'), datactl = require('./datactl'), media = require('./media'), bridge = require('./bridge'), overlay = require('./overlay'), joiner = require('./joiner'), jre = require('./jre'), playit = require('./playit'), session = require('./session'), host = require('./host'), content = require('./content'), shots = require('./shots'), skins = require('./skins'), updater = require('./updater'), mods = require('./mods'), servers = require('./servers'), notify = require('./notify'), importer = require('./importer');

app.setAppUserModelId('fr.hydarium.launcher'); // nécessaire pour que Windows affiche les notifications
process.on('uncaughtException', e => log.error('uncaughtException', e));
process.on('unhandledRejection', e => log.error('unhandledRejection', e));
if (!app.requestSingleInstanceLock()) app.quit();

let win, friends = null, chat = null, xfer = null, voice = null;
const send = (c, d) => {
  if ((c === 'game:started' || c === 'game:close') && friends) { const t = setTimeout(() => friends.refresh(), 1500); if (t.unref) t.unref(); }   // les amis voient tout de suite « en jeu » / « en ligne »
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
/* Icône d'Hydarium pour les fenêtres : le PNG (le .ico sert seulement à incruster le logo dans l'exécutable, voir scripts/after-pack.js) */
function appIcon() { try { const i = nativeImage.createFromPath(path.join(__dirname, '..', '..', 'build', 'icon.png')); return i.isEmpty() ? undefined : i; } catch (e) { return undefined; } }
function createWindow() {
  win = new BrowserWindow({
    icon: appIcon(), // icône de la fenêtre (barre des tâches) : PNG 512 px sur tous les systèmes, plus robuste que le .ico
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
  /* Notifications : par défaut, seulement celles des amis (messages, appels, demandes). Les autres (lancement, plantages, captures, téléchargements, serveur) sont désactivées une fois ; la personne peut les réactiver dans Paramètres. */
  { const st = store.get().settings; if (!st.notifFriendsOnly) { for (const k of ['notifLaunch', 'notifCrash', 'notifShot', 'notifDone', 'notifServer']) if (st[k] === undefined) st[k] = false; st.notifFriendsOnly = true; store.save(); } }
  log.info(`Démarrage Hydarium ${app.getVersion()} · ${plat.id} ${process.arch} · Electron ${process.versions.electron} · Node ${process.versions.node}`);
  plat.javas(store.get().settings.javas).then(l => log.info('Java détectés :', l.map(j => `Java ${j.major} (${j.version}, ${j.vendor}, ${j.is64 ? 64 : 32} bits) ${j.path}`)));
  notify.onClick(a => { if (a === 'friends:open') { focus(); send('friends:open'); } else if (a && a.startsWith('chat:')) { focus(); send('friends:open', { conv: a.slice(5) }); } else if (a === 'update:open') { focus(); send('update:open'); } else if (a === 'crash') { focus(); send('game:crash-open'); } else if (a && a.startsWith('file:')) shell.showItemInFolder(a.slice(5)); else if (a && a.startsWith('shot:')) shell.openPath(a.slice(5)); else if (a && a.startsWith('ovl:join:')) { const c = session.current(); overlay.open('join', c && c.id, { addr: a.slice(9) }); } else if (a && a.startsWith('ovl:datapack:')) { const c = session.current(); overlay.open('content', c && c.id, { world: a.slice(13) }); } else focus(); });

  on('platform', () => ({ ...plat.info(), version: app.getVersion() }));
  on('notify', (t, b) => notify.show(String(t).slice(0, 80), String(b).slice(0, 300), ''));
  on('log', (lv, m) => (lv === 'error' ? log.error : log.info)('interface', String(m).slice(0, 500)));
  on('win', a => { if (a === 'min') win.minimize(); else if (a === 'max') win.isMaximized() ? win.unmaximize() : win.maximize(); else if (a === 'close') win.close(); });
  on('set:get', () => store.get().settings);
  on('set:set', async o => {
    const s = store.get().settings, T = { uiScale: 'number', notif: 'boolean', minimize: 'boolean', autostart: 'boolean', wall: 'string', theme: 'string', mem: 'number', java: 'string', accent: 'string', view: 'string', dl: 'number', favMods: 'object', srvMods: 'object', favContent: 'object', snaps: 'boolean', defJvm: 'string', defResMode: 'string', defW: 'number', defH: 'number', defOptim: 'boolean', gameLang: 'string', langSync: 'boolean', cProfiles: 'object', uiLang: 'string', spotifyId: 'string', notifLaunch: 'boolean', notifCrash: 'boolean', notifShot: 'boolean', notifDone: 'boolean', notifServer: 'boolean', notifFriends: 'boolean', notifQuiet: 'boolean', logDays: 'number', cfKey: 'string', tour: 'boolean', music: 'string', overlayKey: 'string', autoJava: 'boolean', showLog: 'boolean', cfClean: 'boolean', autoUpdate: 'boolean', autoInstall: 'boolean', inGameMenu: 'boolean', privacy: 'boolean', tosAccepted: 'number', tosAt: 'number' };
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
  auth.onChange(a => send('auth:state', a));   // connexion rétablie en arrière-plan, ou refusée pour de bon
  const fnote = (t, b, c) => { const st = store.get().settings; if (st.notif !== false && st.notifFriends !== false) notify.show(t, b, c); };   // messages, appels et demandes d'amis
  /* Amis P2P (désactivés tant que la personne ne les a pas activés ; voir friends.js) */
  const { safeStorage } = require('electron'), encOk = () => { try { return safeStorage.isEncryptionAvailable(); } catch (e) { return false; } };
  friends = require('./friends').create({
    store, log, DHT: require('hyperdht'),
    onStream: (k, sock, m) => { if (m && m.t === 'vstream') { if (voice) voice.serve(k, sock, m); else sock.destroy(); } else if (xfer) xfer.serve(k, sock, m); else sock.destroy(); },   // un ami ouvre l'audio d'un appel (voice.js) ou demande des fichiers qu'on lui a proposés (xfer.js)
    onMessage: (k, m) => { if (m && m.t === 'vc') { if (voice) voice.onMessage(k, m); } else if (chat) chat.onMessage(k, m); }, onOnline: k => { if (chat) chat.onOnline(k); },   // voice.js : sonnerie des appels ; chat.js : messages d'amis et envoi de ce qui attendait la reconnexion
    profile: () => { let c = null; try { c = require('./game').isRunning() ? session.current() : null; } catch (e) { /* pas de jeu */ } const i = c ? store.get().instances.find(x => x.id === c.id) : null; return { name: auth.name() || 'Joueur', st: c ? 'playing' : 'online', what: i ? 'Minecraft ' + i.version : '' }; },
    seal: s => (encOk() ? 'e:' + safeStorage.encryptString(s).toString('base64') : 'p:' + s), unseal: s => (String(s).startsWith('e:') ? safeStorage.decryptString(Buffer.from(String(s).slice(2), 'base64')) : String(s).slice(2)),
    notify: (kind, d) => {
      if (kind === 'changed') { if (chat) chat.sync(); return send('friends:changed', {}); }
      if (kind === 'invite') { send('friends:invite', d); if (chat) chat.record(d.key, { mine: false, card: { k: 'srv', n: d.name, code: d.code } }); fnote('Invitation de ' + d.from, 'Rejoindre « ' + d.name + ' »', 'friends:open'); }
      else if (kind === 'request') fnote('Demande d’ami', d.name + ' veut être ton ami.', 'friends:open');
      else if (kind === 'friend') fnote('Nouvel ami', d.name + ' est maintenant ton ami.', 'friends:open');
      else if (kind === 'removed') fnote('Ami retiré', d.name + ' t’a retiré de ses amis.', 'friends:open');
    },
  });
  /* Chat : messages, cartes de partage, groupes. Créé avant le démarrage des amis pour ne rater aucun message. */
  let chatPing = null;   // plusieurs messages d'un coup = un seul rafraîchissement de l'interface
  chat = require('./chat').create({
    dir: plat.dataDir(), friends, log, myName: () => auth.name() || 'Joueur',
    focused: () => !!(win && !win.isDestroyed() && win.isFocused() && !win.isMinimized() && win.isVisible()),
    notify: (kind, d) => {
      if (kind === 'changed') { if (!chatPing) chatPing = setTimeout(() => { chatPing = null; send('chat:changed', d); }, 60); }
      else if (kind === 'msg') fnote(d.name, (d.from && d.from !== d.name ? d.from + ' : ' : '') + String(d.text).slice(0, 120), 'chat:' + d.conv);
      else if (kind === 'group-invite') fnote('Invitation dans un groupe', d.from + ' t’invite dans « ' + d.name + ' ».', 'friends:open');
      else if (kind === 'group-removed') fnote('Groupe quitté', 'Tu ne fais plus partie de « ' + d.name + ' ».', 'friends:open');
    },
  });
  xfer = require('./xfer').create({ dir: plat.dataDir(), friends, log, notify: (kind, d) => send('chat:xfer', d) });
  /* Chat vocal (voice.js) : l'interface capte / joue le son ; le processus principal transporte des paquets de 20 ms par un flux direct chiffré */
  voice = require('./voice').create({
    friends, log, note: (k, t) => chat.note(k, t),
    notify: (kind, d) => {
      if (kind === 'changed') send('voice:changed', d);
      else if (kind === 'rx') { if (win && !win.isDestroyed()) win.webContents.send('voice:rx', d); }
      else if (kind === 'ring') fnote('Appel vocal', d.name + ' t’appelle.', 'chat:' + d.key);
      else if (kind === 'ended' && d.reason === 'missed') fnote('Appel manqué', d.name + ' a essayé de t’appeler.', 'chat:' + d.key);
    },
  });
  /* Micro : accordé seulement à l'interface d'Hydarium (page locale), audio seul ; tout autre contenu est refusé */
  try {
    const ownPage = wc => !!(win && !win.isDestroyed() && wc === win.webContents);
    const audioOnly = d => !d || !d.mediaTypes || (d.mediaTypes.length > 0 && d.mediaTypes.every(t => t === 'audio'));
    electronSession.defaultSession.setPermissionRequestHandler((wc, perm, cb, d) => cb(perm === 'media' && ownPage(wc) && audioOnly(d)));
    electronSession.defaultSession.setPermissionCheckHandler((wc, perm, origin, d) => perm === 'media' && ownPage(wc) && (!d || d.mediaType !== 'video'));
  } catch (e) { log.error('permissions micro', e); }
  chat.sync();
  if (friends.config().on) friends.start().catch(e => log.warn('amis : démarrage impossible', e.message));
  const KEYRE = /^[0-9a-f]{64}$/, key = k => { k = String(k || ''); if (!KEYRE.test(k)) throw new Error('Ami invalide.'); return k; };
  on('friends:status', () => friends.status());
  on('friends:enable', async v => { await friends.enable(!!v); return friends.status(); });
  on('friends:hidden', v => { friends.setHidden(!!v); return friends.status(); });
  on('friends:reset', async () => { await friends.reset(); chat.wipe(); return friends.status(); });
  on('friends:request', code => friends.request(String(code || '')));
  on('friends:accept', k => friends.accept(key(k)));
  on('friends:decline', (k, block) => friends.decline(key(k), !!block));
  on('friends:cancel', k => friends.cancel(key(k)));
  on('friends:unblock', k => friends.unblock(key(k)));
  on('friends:remove', k => friends.remove(key(k)));
  const joinFriendSrv = async (code, name) => { // accepter l'invitation d'un ami : on réutilise le serveur déjà enregistré pour ce code, sinon on l'ajoute
    const pc = require('./p2p').normalize(String(code || '')); if (!pc) throw new Error('Invitation invalide.');
    let s = store.get().servers.find(x => x.p2p === pc);
    if (!s) { await servers.addP2p({ name: String(name || '').slice(0, 40) || 'Serveur d’un ami', code: pc }); s = store.get().servers.find(x => x.p2p === pc); }
    return { addr: s.addr };
  };
  on('friends:join', (code, name) => joinFriendSrv(code, name));
  on('friends:invite', (k, hostId) => { // le code d'invitation vient du serveur de CETTE personne (jamais de l'interface)
    const info = host.p2pInfo(String(hostId || '')), h = (store.get().hosts || []).find(x => x.id === hostId);
    if (!info.sharing || !info.code) throw new Error('Démarre ton serveur avec les invitations privées activées pour inviter un ami.');
    const ok = friends.invite(key(k), h ? h.name : 'Serveur', info.code); chat.record(key(k), { mine: true, card: { k: 'srv', n: h ? h.name : 'Serveur', code: info.code } }); return ok;
  });
  /* ===== Chat entre amis (voir chat.js) : la conversation est toujours une clé d'ami ou « g:<groupe> » ===== */
  const CONVRE = /^([0-9a-f]{64}|g:[0-9a-f]{16})$/, conv = c => { c = String(c || ''); if (!CONVRE.test(c)) throw new Error('Conversation invalide.'); return c; }, keys = l => (Array.isArray(l) ? l : []).slice(0, 20).map(key);
  /** miniature carrée de 96 px (JPEG ≤ 11 Ko) de l'image d'une instance, ou '' : elle voyage avec la carte, l'ami la voit tout de suite */
  const thumbOf = id => {
    try {
      const r = require('./instimg').get(id); if (!r) return ''; let img = nativeImage.createFromBuffer(Buffer.from(r.u.split(',')[1], 'base64')); if (img.isEmpty()) return '';
      const { width: w, height: h } = img.getSize(), s = Math.min(w, h); img = img.crop({ x: Math.floor((w - s) / 2), y: Math.floor((h - s) / 2), width: s, height: s }).resize({ width: 96, height: 96, quality: 'good' });
      for (const q of [72, 55, 40]) { const b = img.toJPEG(q).toString('base64'); if (b.length <= 11000) return b; }
    } catch (e) { log.warn('miniature de partage', e.message); }
    return '';
  };
  /** carte d'une instance : un modpack du catalogue se partage par RÉFÉRENCE ; sinon par recette (mods Modrinth) ; jamais de fichiers */
  const shareCard = id => {
    const i = store.get().instances.find(x => x.id === id); if (!i) throw new Error('Instance introuvable.');
    const p = i.pack, byRef = p && (p.src === 'modrinth' || p.src === 'curseforge') && typeof p.pid === 'string';
    if (byRef) return { card: { k: 'pack', n: i.name, src: p.src, pid: p.pid, v: i.version }, skipped: 0, thumb: thumbOf(id) };
    const s = mods.share(id); return { card: { k: 'inst', n: i.name, v: i.version, l: i.loader, lv: s.lv, m: s.count, code: s.code }, skipped: s.skipped, thumb: thumbOf(id) };
  };
  const dlBusy = new Set();
  on('chat:list', () => chat.list());
  on('chat:messages', c => chat.messages(conv(c)).map(m => (m.c && m.c.k === 'files' && !m.mine && !(m.dl && m.dl.s === 'done') ? { ...m, part: xfer.partial(m.c.tid) } : m)));   // « part » : fichiers déjà reçus d'un envoi interrompu (reprise possible)
  on('chat:thumb', h => chat.thumb(String(h || '')));
  on('chat:send', (c, t) => chat.send(conv(c), t));
  on('chat:edit', (c, mid, t) => chat.edit(conv(c), String(mid || ''), t));   // ses propres messages texte seulement (chat.js vérifie)
  on('chat:del', (c, mid) => { const card = chat.remove(conv(c), String(mid || '')); if (card && card.tid && TIDRE.test(card.tid)) xfer.forget(card.tid); return true; });   // un envoi de fichiers / une image supprimés ne sont plus proposés
  on('chat:hide', (c, mid) => chat.hide(conv(c), String(mid || '')));   // masqué chez soi seulement : rien n'est envoyé
  on('chat:clear', c => chat.clear(conv(c)));   // discussion vidée chez soi seulement
  on('chat:mod', (c, mid) => { const card = chat.moderate(conv(c), String(mid || '')); if (card && card.tid && TIDRE.test(card.tid)) { try { xfer.discard(card.tid); } catch (e) { /* rien n'avait été reçu */ } } return true; });   // administrateur d'un groupe : supprime le message d'un autre pour tous (chat.js vérifie)
  on('chat:read', c => chat.read(conv(c)));
  on('chat:active', c => chat.setActive(c ? conv(c) : null));
  on('chat:share', (c, instId) => { const t = (Array.isArray(c) ? c : [c]).slice(0, 10).map(conv), s = shareCard(String(instId || '')); for (const x of t) chat.sendCard(x, s.card, s.thumb); return { sent: t.length, skipped: s.skipped, kind: s.card.k }; });   // l'envoi est la confirmation : la personne a choisi à qui
  on('chat:dl', async (c, mid) => {   // « Télécharger » / « Rejoindre » sur une carte reçue : rien ne part tant qu'on n'a pas cliqué
    c = conv(c); mid = String(mid || ''); const card = chat.card(c, mid), bk = c + '|' + mid; if (dlBusy.has(bk)) throw new Error('Déjà en cours.'); dlBusy.add(bk);
    try {
      let out;
      if (card.k === 'inst') { const r = await mods.importCode(card.code); r.inst.name = String(card.n).slice(0, 40); store.save(); out = { kind: 'inst', id: r.inst.id, name: r.inst.name, failed: r.failed.length }; }
      else if (card.k === 'pack') { const r = await require('./packs').install('modpack', card.pid, card.src, null, p => send('import:progress', p)); out = { kind: 'pack', id: r.id, name: r.name, failed: (r.bad || []).length }; }
      else if (card.k === 'srv') { const r = await joinFriendSrv(card.code, card.n); out = { kind: 'srv', addr: r.addr, name: card.n }; }
      else if (card.k === 'img') {   // image entière : récupérée puis vérifiée par son contenu avant d'être montrée
        const r = await xfer.fetch(chat.author(c, mid), card.tid, { count: 1, size: card.size }), f = path.join(r.dir, r.items[0]);
        if (!imgOk(f, card.size)) { fs.rmSync(r.dir, { recursive: true, force: true }); throw new Error('Cette image est refusée (format ou taille anormaux).'); } out = { kind: 'img' };
      }
      else if (card.k === 'files') { const r = await xfer.fetch(chat.author(c, mid), card.tid, { count: card.cnt, size: card.size }); out = { kind: 'files', count: r.count, total: r.total }; }   // reçu dans un dossier d'attente : rien n'est rangé sans second clic
      else throw new Error('Carte inconnue.');
      if (card.k !== 'srv') chat.setDl(c, mid, { s: 'done', id: out.id, t: Date.now() });
      return out;
    } finally { dlBusy.delete(bk); }
  });
  /* envoi de fichiers : la personne les choisit dans le sélecteur système (jamais un chemin venu de l'interface) ; ils restent chez elle, seule une carte part */
  const PICK = { files: ['Choisir les fichiers à envoyer', ['openFile', 'multiSelections'], ''], folder: ['Choisir un dossier à envoyer (un monde…)', ['openDirectory', 'multiSelections'], ''], mods: ['Choisir des mods à envoyer', ['openFile', 'multiSelections'], 'mods'], worlds: ['Choisir des mondes à envoyer', ['openDirectory', 'multiSelections'], 'saves'], packs: ['Choisir des packs de ressources à envoyer', ['openFile', 'multiSelections'], 'resourcepacks'] };
  on('chat:xsend', async (c, how, instId) => {
    c = conv(c); const P = PICK[String(how)]; if (!P) throw new Error('Choix inconnu.'); const to = chat.friendTargets(c); if (!to.length) throw new Error('Aucun ami joignable dans cette discussion : les fichiers ne partent qu’à tes amis.');
    const base = P[2] && store.get().instances.some(x => x.id === instId) ? path.join(plat.dataDir(), 'instances', String(instId), P[2]) : '', r = await dialog.showOpenDialog(win, { title: P[0], properties: P[1], ...(base && fs.existsSync(base) ? { defaultPath: base } : {}) });
    if (r.canceled || !r.filePaths.length) return { sent: 0 };
    const names = r.filePaths.map(f => path.basename(f)), name = names.length > 1 ? (names[0] + ' + ' + (names.length - 1)).slice(0, 40) : names[0], o = xfer.offer(to, name, r.filePaths);
    chat.sendCard(c, { k: 'files', n: name, tid: o.tid, cnt: o.count, size: o.size, jar: o.jar, top: o.top }, ''); return { sent: 1, count: o.count, size: o.size };
  });
  /* ----- images dans le chat : miniature (≤ 12 Ko) dans la carte, image entière envoyée par xfer.js quand l'ami clique ----- */
  const imgsafe = require('./imgsafe'), sentDir = path.join(plat.dataDir(), 'sent');
  try { for (const n of fs.readdirSync(sentDir)) { const f = path.join(sentDir, n); if (Date.now() - fs.statSync(f).mtimeMs > 8 * 86400e3) fs.rmSync(f, { force: true }); } } catch (e) { /* pas de dossier */ }
  const head = (f, n = 262144) => { const fd = fs.openSync(f, 'r'); try { const b = Buffer.alloc(n), k = fs.readSync(fd, b, 0, n, 0); return b.subarray(0, k); } finally { fs.closeSync(fd); } };
  const imgOk = (f, size) => { try { const st = fs.statSync(f); return st.isFile() && st.size === size && st.size <= imgsafe.MAX_BYTES && !!imgsafe.info(head(f)); } catch (e) { return false; } };
  const thumbFit = buf => {   // miniature qui garde les proportions : 256 px au plus, ≤ 11,5 Ko
    try {
      const img = nativeImage.createFromBuffer(buf); if (img.isEmpty()) return ''; const { width: w, height: h } = img.getSize();
      for (const mx of [256, 192, 144, 110]) { const k = Math.min(1, mx / Math.max(w, h)), t = k < 1 ? img.resize({ width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)), quality: 'good' }) : img; for (const q of [70, 50, 35]) { const b = t.toJPEG(q).toString('base64'); if (b.length <= 11500) return b; } }
    } catch (e) { log.warn('miniature d’image', e.message); }
    return '';
  };
  const sendImage = (c, file) => {   // file : chemin d'un fichier choisi par la personne, ou écrit par nous (collage, capture)
    const to = chat.friendTargets(c); if (!to.length) throw new Error('Aucun ami joignable dans cette discussion.');
    const st = fs.statSync(file); if (!st.isFile() || st.size > imgsafe.MAX_BYTES) throw new Error('Image trop lourde (15 Mo au plus).'); const info = imgsafe.info(head(file)); if (!info) throw new Error('Image non reconnue : PNG, JPEG, GIF ou WebP.');
    const o = xfer.offer(to, path.basename(file), [file]); return chat.sendCard(c, { k: 'img', n: path.basename(file), tid: o.tid, size: st.size, w: info.w, h: info.h }, thumbFit(fs.readFileSync(file)));
  };
  on('chat:imgsend', async (c, how, arg) => {
    c = conv(c);
    if (how === 'pick') { const r = await dialog.showOpenDialog(win, { title: 'Choisir une image à envoyer', properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }] }); if (r.canceled || !r.filePaths[0]) return { sent: 0 }; sendImage(c, r.filePaths[0]); return { sent: 1 }; }
    if (how === 'paste') {   // image collée (Ctrl+V) : on l'écrit chez nous sous un nom neutre
      const b = Buffer.isBuffer(arg) ? arg : arg && arg.byteLength ? Buffer.from(arg) : null, info = b && b.length <= imgsafe.MAX_BYTES ? imgsafe.info(b) : null; if (!info) throw new Error('Image non reconnue ou trop lourde (15 Mo au plus).');
      fs.mkdirSync(sentDir, { recursive: true }); const f = path.join(sentDir, 'image-' + require('crypto').randomBytes(4).toString('hex') + '.' + info.ext); fs.writeFileSync(f, b); sendImage(c, f); return { sent: 1 };
    }
    if (how === 'shot') { const p = require('./shots').pathOf(String(arg && arg.inst), String(arg && arg.file)); sendImage(c, p); return { sent: 1 }; }   // capture de la page Captures : chemin vérifié par shots.js
    throw new Error('Choix inconnu.');
  });
  const imgFile = (c, mid) => {   // fichier d'une carte image : le nôtre (envoyé) ou celui reçu ; null si pas (ou plus) là
    c = conv(c); const card = chat.card(c, String(mid || '')); if (card.k !== 'img') throw new Error('Pas une image.');
    let mine = false; try { chat.author(c, String(mid)); } catch (e) { mine = true; }   // author() refuse nos propres messages
    const off = mine ? xfer.offers()[card.tid] : null, f = off ? off.files[0].a : (() => { const r = mine ? null : xfer.received(card.tid); return r && r.items.length === 1 ? r.items[0] : null; })();
    return f && imgOk(f, card.size) ? { f, card } : null;
  };
  on('chat:imgget', (c, mid) => { const r = imgFile(c, mid); if (!r) throw new Error('Image introuvable : elle a peut-être été supprimée. Clique pour la recevoir de nouveau.'); const b = fs.readFileSync(r.f); return 'data:' + imgsafe.info(b).mime + ';base64,' + b.toString('base64'); });
  on('chat:imgsave', async (c, mid) => { const r = imgFile(c, mid); if (!r) throw new Error('Image introuvable.'); const d = await dialog.showSaveDialog(win, { title: 'Enregistrer l’image', defaultPath: path.join(app.getPath('pictures'), r.card.n) }); if (d.canceled || !d.filePath) return false; fs.copyFileSync(r.f, d.filePath); return true; });
  const TIDRE = /^[0-9a-f]{24}$/;
  on('chat:xcancel', tid => { tid = String(tid || ''); if (!TIDRE.test(tid)) throw new Error('Envoi invalide.'); return xfer.cancel(tid) || xfer.discard(tid); });   // en cours : on arrête ; interrompu : on abandonne ce qui avait été reçu
  on('chat:xopen', tid => { if (!TIDRE.test(String(tid))) throw new Error('Envoi invalide.'); const r = xfer.received(String(tid)); if (!r) throw new Error('Ces fichiers ont été supprimés (au bout de 14 jours).'); shell.openPath(r.dir); return true; });
  on('chat:xapply', (c, mid, instId) => {   // range ce qui a été reçu dans une instance : même tri par contenu que le glisser-déposer
    const card = chat.card(conv(c), String(mid || '')); if (card.k !== 'files') throw new Error('Pas un envoi de fichiers.'); if (!store.get().instances.some(x => x.id === instId)) throw new Error('Instance introuvable.');
    const r = xfer.received(card.tid); if (!r) throw new Error('Les fichiers reçus ont été supprimés (au bout de 14 jours) : demande à ton ami de les renvoyer.');
    return require('./drop').run(String(instId), r.items.slice(0, 60));
  });
  /* ===== Chat vocal (voice.js) : appel à deux avec un ami ===== */
  on('voice:state', () => voice.state());
  on('voice:start', (c, caps) => { c = String(c || ''); if (!KEYRE.test(c)) throw new Error('Les appels vocaux se font pour l’instant avec un seul ami (pas dans un groupe).'); return voice.start(c, caps); });
  on('voice:accept', (id, caps) => voice.accept(String(id || ''), caps));
  on('voice:decline', id => voice.decline(String(id || '')));
  on('voice:hangup', () => voice.hangup());
  on('voice:mute', m => voice.setMute(!!m));
  on('voice:micaccess', async () => { if (process.platform !== 'darwin') return true; const { systemPreferences } = require('electron'); try { return (await systemPreferences.askForMediaAccess('microphone')) === true; } catch (e) { return false; } });   // macOS : autorisation système du micro
  ipcMain.on('voice:pcm', (e, p) => { if (win && !win.isDestroyed() && e.sender === win.webContents && voice) voice.audio(p); });   // un paquet audio : sans réponse, jeté si le réseau ne suit pas
  on('chat:gnew', (name, ks) => chat.createGroup(String(name || ''), keys(ks)));
  on('chat:gadd', (c, ks) => chat.groupAdd(conv(c), keys(ks)));
  on('chat:gkick', (c, k) => chat.groupKick(conv(c), key(k)));
  on('chat:gaccept', c => chat.groupAccept(conv(c)));
  on('chat:gleave', c => chat.groupLeave(conv(c)));
  on('chat:grename', (c, name) => chat.groupRename(conv(c), String(name || '')));
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
  on('inst:delete', id => { const L = host.linksTo(id); if (L.some(h => host.isRunning(h.id))) throw new Error('Le serveur « ' + L.find(h => host.isRunning(h.id)).name + ' » utilise un monde de cette instance : arrête-le d’abord.'); L.forEach(h => host.unlinkWorld(h.id)); /* le serveur garde une copie de son monde */ try { require('./stats').bank(id); } catch (e) { log.warn('stats avant suppression', e.message); } game.remove(id); try { require('./instimg').clear(id); } catch (e) {} store.removeInstance(id); }); // les statistiques de l’instance sont gardées avant sa suppression
  on('game:stop', () => game.stop());
  require('./autojoin').init(send); on('join:state', () => require('./autojoin').state()); on('join:confirm', () => require('./autojoin').confirm()); on('join:answer', a => { a = a || {}; require('./autojoin').answer({ vanilla: a.vanilla === true, version: /^\d{1,2}(\.\d{1,2}){1,2}$/.test(String(a.version || '')) ? String(a.version) : '' }); }); on('join:cancel', () => require('./autojoin').cancel()); on('join:run', (addr, id) => require('./autojoin').run(String(addr || ''), id));
  on('game:play', (id, o) => { // l'instance se lance toujours ; mais ouvrir un monde relié à un serveur en ligne = rejoindre ce serveur (le monde est verrouillé par lui)
    o = { ...(o || {}) }; const h = o.world ? host.linksTo(id).find(x => x.link.folder === o.world && host.isRunning(x.id)) : null;
    if (h) { if (host.runState(h.id) !== 'running') throw new Error('Le serveur « ' + h.name + ' » utilise ce monde et démarre encore : réessaie dans un instant.'); o.server = 'localhost:' + h.port; delete o.world; }
    return game.play(id, send, o);
  });
  on('inst:detail', async id => { const s = mods.status(id); return { ...s, mods: require('./modicon').attach(s.mods), need: await game.needJava(s.inst) }; }); // images des mods : jointes ici seulement (cache), pas dans la liste d'instances
  on('mods:icons', id => require('./modicon').fill(id));
  on('inst:set', async (id, o) => {
    const i = store.get().instances.find(x => x.id === id); if (!i || !o) return;
    if (o.mem >= 1 && o.mem <= 32) i.mem = Math.round(o.mem);
    if (typeof o.java === 'string') { if (o.java && !(await plat.javaInfo(o.java))) throw new Error('Java introuvable ou inutilisable.'); i.java = o.java; }
    if (typeof o.name === 'string' && o.name.trim()) i.name = o.name.trim().slice(0, 40);
    if (typeof o.cat === 'string') i.cat = o.cat.trim().slice(0, 24);
    if (Array.isArray(o.tags)) i.tags = [...new Set(o.tags.map(t => String(t).trim().slice(0, 20)).filter(Boolean))].slice(0, 12);
    if (typeof o.cover === 'string' && (o.cover === '' || BIOS.includes(o.cover))) i.cover = o.cover;
    if (typeof o.item === 'string') { if (o.item === 'auto' || o.item === '') delete i.item; else if (o.item === 'none' || require('./mctex').valid(o.item)) i.item = o.item; }   // objet de l'icône générée : automatique (rien d'enregistré), aucun, ou l'un de la liste
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
  on('inst:imgget', id => require('./instimg').get(id));   // image de l'instance (donnée à l'interface à la demande, pas dans la liste)
  on('inst:imgpick', async id => { const f = await pick('Choisir une image', ['openFile'], [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg'] }]); if (!f[0]) return false; require('./instimg').fromFile(id, f[0]); return true; });
  on('inst:imgpack', async id => { await require('./instimg').fromPack(id); return true; });
  on('inst:imgclear', id => { require('./instimg').clear(id); return true; });
  on('inst:open', (id, sd) => { const i = store.get().instances.find(x => x.id === id); if (!i) return; const d = ['mods', 'saves', 'resourcepacks', 'shaderpacks', 'screenshots'].includes(sd) ? path.join(game.dirOf(id), sd) : game.dirOf(id); fs.mkdirSync(d, { recursive: true }); return shell.openPath(d); });
  on('inst:dup', id => { const i = store.get().instances.find(x => x.id === id); if (!i) throw new Error('Instance introuvable.'); const c = store.addInstance({ ...i, name: i.name + ' (copie)' }); c.mods = JSON.parse(JSON.stringify(i.mods)); c.mem = i.mem; if (i.client) c.client = { ...JSON.parse(JSON.stringify(i.client)), on: true }; store.save(); try { fs.cpSync(game.dirOf(id), game.dirOf(c.id), { recursive: true }); } catch (e) {} if (i.img) require('./instimg').copy(id, c.id); return c; });
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
  /* L'éditeur en jeu a déplacé ou réglé des widgets : même circuit que les bascules (enregistré pour l'instance, configuration réécrite, fenêtres prévenues). */
  const HUD_IDS = ['fps', 'cps', 'keystrokes', 'coords', 'direction', 'armor', 'potions', 'ping', 'clock', 'memory', 'music', 'session'];
  const syncLayout = lay => {
    const c = session.current(); if (!c || !lay || typeof lay !== 'object') return; const i = store.get().instances.find(x => x.id === c.id); if (!i || !i.client) return;
    if (!require('./layoutsync').apply((i.client.modules = i.client.modules || {}), lay, HUD_IDS)) return;
    store.save(); try { session.writeConfig(i, game.dirOf(i.id)); } catch (e) {} try { require('./hud').refresh(i.id); } catch (e) {}
    send('client:synced', { id: i.id, client: i.client }); try { require('./overlay').send('client:synced', { id: i.id, client: i.client }); } catch (e) {}
  };
  bridge.route('POST', '/v1/state', (q, b) => { require('./hud').setGame(b || {}); if (b && b.derr) require('./hud').noteDrawError(b.derr); if (b && b.gmenu && store.get().settings.inGameMenu === true) { try { require('./session').releaseOverlayKey(); } catch (e) { log.warn('raccourci du menu', e.message); } } if (b && b.tg) { try { syncToggles(b.tg); } catch (e) { log.warn('synchro des modules', e.message); } } if (b && b.lay) { try { syncLayout(b.lay); } catch (e) { log.warn('synchro de la disposition', e.message); } } if (b && b.menu) return { ok: true }; /* simple signalement d’écran (hors monde) : pas de statistiques */ try { require('./stats').onState(b || {}); } catch (e) {} return { ok: true }; });
  bridge.route('POST', '/v1/p2p/open', (q, b) => require('./p2pbridge').open(b && b.code)); // code d'invitation tapé dans le champ d'adresse du jeu
  bridge.route('GET', '/v1/music', async () => ({ track: await media.get() }));
  bridge.route('POST', '/v1/music', async (q, b) => ({ track: await media.act(String(b.cmd || '')) }));
  bridge.route('POST', '/v1/overlay', (q, b) => { const c = session.current(); overlay.open(['hub', 'skins', 'content', 'shots', 'music'].includes(b.page) ? b.page : 'hub', c && c.id); });
  /* « Modifier en jeu » : demande au mod d'ouvrir son éditeur (champ cmd.editor du fichier de configuration, relu par le mod ~1 s plus tard) */
  on('client:editor', () => {
    const c = session.current(); if (!c) return { ok: false, reason: 'Aucun jeu n’est lancé : lance l’instance, puis reviens ici.' };
    if (!require('./hud').gameDraws()) return { ok: false, reason: 'Le mode client de cette version n’a pas (encore) l’éditeur en jeu : utilise l’aperçu ci-dessous.' };
    const i = store.get().instances.find(x => x.id === c.id); if (!i) return { ok: false, reason: 'Instance introuvable.' };
    session.writeConfig(i, game.dirOf(i.id), { cmd: { editor: Date.now() } }); return { ok: true };
  });
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
  on('tex:items', () => require('./mctex').items());   // objets des icônes d'instances (extraits du jeu de la personne)
  require('./p2p').setManifest(id => require('./modsync').build(id));   // l'hôte envoie la liste de ses mods aux invités (jamais sans le code d'invitation)
  on('modsync:apply', (instId, addr) => { // installe, dans l'instance choisie, les mods exacts du serveur (la liste vient de la mémoire du launcher, jamais de l'interface)
    const s = store.get().servers.find(x => x.addr === String(addr)); if (!s || !s.p2p) throw new Error('Serveur inconnu.');
    return require('./modsync').apply(String(instId), s.p2p, t => send('modsync:step', { t }));
  });
  on('host:crash', id => host.lastCrash(id)); on('host:crashclear', id => host.clearCrash(id)); on('host:crashact', (id, a, v) => host.crashAct(id, String(a), v));   // assistant de crash des serveurs
  on('hostdp:list', id => require('./hostdp').list(id));   // data packs d'un serveur hébergé
  on('hostdp:add', async id => { const f = await pick('Choisir des data packs (.zip)', ['openFile', 'multiSelections'], [{ name: 'Data pack', extensions: ['zip'] }]); return f.length ? require('./hostdp').add(id, f) : { added: [], skipped: [] }; });
  on('hostdp:remove', (id, n) => require('./hostdp').remove(id, String(n)));
  on('hostdp:toggle', (id, n, on) => require('./hostdp').setEnabled(id, String(n), !!on));
  on('mods:versions', (id, pid) => mods.versions(id, String(pid)));
  on('mods:setversion', (id, pid, vid) => { // changer la version d'un mod remplace son fichier : refusé pendant que le jeu (ou le serveur) l'utilise
    const c = session.current(); if (c && c.id === id) throw new Error('Ferme le jeu avant de changer la version d’un mod.');
    if (host.isRunning && host.isRunning(id)) throw new Error('Arrête le serveur avant de changer la version d’un mod.');
    return mods.setVersion(id, String(pid), String(vid));
  });
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
  /* modpack : choisi dans une fenêtre, ou déposé sur la fenêtre (chemin donné par le système ; on vérifie quand même que c'est bien un modpack) */
  on('modpack:import', async dropped => {
    let file; if (typeof dropped === 'string' && dropped) { if (!path.isAbsolute(dropped) || require('./drop').classify(dropped) !== 'modpack') throw new Error('Ce fichier n’est pas un modpack reconnu.'); file = dropped; }
    else { const f = await pick('Choisir un modpack', ['openFile'], [{ name: 'Modpack', extensions: ['mrpack', 'zip'] }]); if (!f[0]) return null; file = f[0]; }
    const r = await modpack.run(file, p => send('import:progress', p));
    if (r.kind === 'mrpack') { try { const x = await require('./packs').identifyFile(file), n = x && store.get().instances.find(y => y.id === r.id); if (n) { n.pack = x.ref; store.save(); if (x.icon) await require('./instimg').fromUrl(n.id, x.icon); } } catch (e) { log.warn('image du modpack (fichier)', e.message); } }   // publié sur Modrinth : image officielle ; sinon décor habituel
    require('./notify').show('Modpack importé', r.name, '', 'done'); return r;
  });
  /* glisser-déposer : mods, packs de ressources, shaders, data packs, mondes → dans l'instance ouverte ; modpacks → renvoyés pour confirmation (ils créent une nouvelle instance) */
  on('inst:drop', (id, paths) => { if (id && !store.get().instances.some(x => x.id === id) && !(store.get().hosts || []).some(x => x.id === id)) throw new Error('Instance introuvable.'); return require('./drop').run(id || '', paths); });
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
  updater.init({ packaged: app.isPackaged, version: app.getVersion(), portable: !!process.env.PORTABLE_EXECUTABLE_FILE, appImage: !!process.env.APPIMAGE, send, isBusy: () => require('./game').isRunning() || require('./host').anyRunning(), enabled: () => store.get().settings.autoUpdate !== false, autoInstall: () => store.get().settings.autoInstall !== false, notify: (t, b, a) => notify.show(t, b, a, 'update') });
  updater.startup();
  on('client:drawerr', () => require('./hud').drawError() || require('./modbuild').notes()); on('update:state', () => updater.state()); on('update:check', () => updater.check(true)); on('update:install', () => updater.install()); on('update:cancel', () => updater.cancel()); on('update:open', () => shell.openExternal(updater.PAGE));
  setTimeout(() => { skins.ensureDefaults().catch(() => {}); }, 6000); // skins par défaut de Minecraft : récupérés en arrière-plan pour que le Profil les ait déjà // l'onglet Serveurs s'ouvre alors avec l'état déjà connu
  setTimeout(() => { host.closeLegacyPorts().catch(e => log.warn('closeLegacyPorts', e.message)); }, 4000); // anciennes versions : ports ouverts sur la box (UPnP) refermés une fois
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('before-quit', () => { host.stopAll(); playit.stop(); require('./p2p').stopAll().catch(() => {}); if (chat) chat.flush(); if (friends) friends.stop().catch(() => {}); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
