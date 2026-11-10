/* Mon serveur : serveurs Minecraft hébergés sur ton PC (Vanilla, Paper, Fabric). Pour l’instant, accessibles en local / réseau local ;
   l’accès depuis Internet passe par playit.gg (playit.js) ou par une invitation privée P2P (p2p.js) : Hydarium n’ouvre JAMAIS de port sur ta box. */
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const { spawn } = require('child_process');
const { nativeImage } = require('electron');
const notify = require('./notify');
const store = require('./store'), plat = require('./platform'), game = require('./game'), log = require('./log');
const UA = { 'User-Agent': 'Hydarium/0.5 (launcher)' };
const OKH = ['piston-data.mojang.com', 'fill-data.papermc.io', 'api.papermc.io', 'meta.fabricmc.net', 'maven.minecraftforge.net', 'maven.neoforged.net'];
const hosts = () => (store.get().hosts = store.get().hosts || []);
const dirOf = id => path.join(plat.dataDir(), 'servers', String(id).replace(/[^a-z0-9]/g, ''));
const get = id => { const h = hosts().find(x => x.id === id); if (!h) throw new Error('Serveur introuvable.'); return h; };
const run = new Map(); // id -> { proc, state, players:Set, lines:[] }
const j = async u => { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error('Service indisponible (' + r.status + ').'); return r.json(); };
async function dl(url, dest, check) {
  if (!OKH.includes(new URL(url).hostname)) throw new Error('Source de téléchargement refusée.');
  const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error('Téléchargement du serveur impossible (' + r.status + ').');
  const b = Buffer.from(await r.arrayBuffer());
  if (check && check.sha1 && crypto.createHash('sha1').update(b).digest('hex') !== check.sha1) throw new Error('Fichier corrompu.');
  if (check && check.sha256 && crypto.createHash('sha256').update(b).digest('hex') !== check.sha256) throw new Error('Fichier corrompu.');
  fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, b);
}
async function fetchJar(type, v, dest) {
  if (type === 'vanilla') { const e = (await game.versions()).find(x => x.id === v); if (!e) throw new Error('Version inconnue.'); const s = (await j(e.url)).downloads.server; if (!s) throw new Error('Pas de serveur officiel pour cette version.'); return dl(s.url, dest, { sha1: s.sha1 }); }
  if (type === 'paper') {
    try { const b = await j(`https://fill.papermc.io/v3/projects/paper/versions/${v}/builds/latest`), d = b.downloads['server:default']; return await dl(d.url, dest, { sha256: d.checksums && d.checksums.sha256 }); }
    catch (e) { const bs = (await j(`https://api.papermc.io/v2/projects/paper/versions/${v}/builds`)).builds, b = bs[bs.length - 1]; if (!b) throw new Error('Paper ne gère pas Minecraft ' + v + '.'); return dl(`https://api.papermc.io/v2/projects/paper/versions/${v}/builds/${b.build}/downloads/${b.downloads.application.name}`, dest, { sha256: b.downloads.application.sha256 }); }
  }
  if (type === 'fabric') { const l = await j(`https://meta.fabricmc.net/v2/versions/loader/${v}`); if (!l.length) throw new Error('Fabric ne gère pas Minecraft ' + v + '.'); const ins = (await j('https://meta.fabricmc.net/v2/versions/installer')).find(x => x.stable) || {}; return dl(`https://meta.fabricmc.net/v2/versions/loader/${v}/${l[0].loader.version}/${ins.version}/server/jar`, dest); }
  throw new Error('Type de serveur inconnu.');
}
/* Forge / NeoForge (EXPÉRIMENTAL, jamais exécuté ici) : l'installeur officiel prépare le serveur (--installServer), puis on lance les arguments qu'il fournit
   (Forge / NeoForge récents : @libraries/…/win_args.txt ; Forge ancien : forge-<version>.jar). */
async function installLoader(h, dir, send) {
  const urls = require('./forge').installerUrls(h), jar = path.join(dir, 'installer.jar');
  send && send('game:progress', { type: 'Téléchargement de ' + (h.type === 'forge' ? 'Forge' : 'NeoForge'), task: 0, total: 1 });
  { let err; for (const url of urls) { try { await dl(url, jar); err = null; break; } catch (e) { err = e; } } if (err) throw err; } // 1.7.10 / 1.8.9 : le nom de version Maven a un suffixe de branche
  const need = await game.needJava({ version: h.version }), jv = await game.chooseJava({ version: h.version, loader: h.loader, java: '' }, need, send);
  send && send('game:progress', { type: 'Installation du serveur ' + h.type + ' (quelques minutes)', task: 0, total: 1 });
  await new Promise((res, rej) => {
    const p = spawn(jv.path, ['-jar', 'installer.jar', '--installServer'], { cwd: dir, windowsHide: true }); let out = '';
    p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { out += d; }); p.on('error', rej);
    p.on('close', c => c === 0 ? res() : rej(new Error('L’installation du serveur ' + h.type + ' a échoué : ' + out.split(/\r?\n/).filter(Boolean).slice(-3).join(' | '))));
  });
  fs.rmSync(jar, { force: true }); fs.rmSync(path.join(dir, 'installer.jar.log'), { force: true });
}
function loaderArgs(dir) {
  const f = process.platform === 'win32' ? 'win_args.txt' : 'unix_args.txt';
  for (const base of ['libraries/net/minecraftforge/forge', 'libraries/net/neoforged/neoforge']) {
    const b = path.join(dir, base); if (!fs.existsSync(b)) continue;
    for (const v of fs.readdirSync(b)) if (fs.existsSync(path.join(b, v, f))) return ['@' + base + '/' + v + '/' + f];
  }
  const j = fs.existsSync(dir) && fs.readdirSync(dir).find(x => /^forge-.*\.jar$/.test(x) && !/installer/.test(x)); if (j) return ['-jar', j];
  throw new Error('Fichiers du serveur Forge / NeoForge introuvables : recrée le serveur.');
}
const DEF = { 'server-port': '25565', motd: 'Un serveur Hydarium', 'max-players': '10', difficulty: 'normal', gamemode: 'survival', 'online-mode': 'true', 'white-list': 'false', pvp: 'true', 'view-distance': '10', 'allow-flight': 'false', 'spawn-protection': '16', 'level-seed': '' };
const CHECK = { 'server-port': v => /^\d{4,5}$/.test(v) && +v >= 1024 && +v <= 65535, motd: v => v.length <= 80 && !/[\r\n]/.test(v), 'max-players': v => /^\d{1,3}$/.test(v) && +v >= 1, difficulty: v => ['peaceful', 'easy', 'normal', 'hard'].includes(v), gamemode: v => ['survival', 'creative', 'adventure', 'spectator'].includes(v), 'online-mode': v => /^(true|false)$/.test(v), 'white-list': v => /^(true|false)$/.test(v), pvp: v => /^(true|false)$/.test(v), 'view-distance': v => /^\d{1,2}$/.test(v) && +v >= 3 && +v <= 32, 'allow-flight': v => /^(true|false)$/.test(v), 'spawn-protection': v => /^\d{1,3}$/.test(v), 'level-seed': v => v.length <= 40 && !/[\r\n]/.test(v) };
const pf = id => path.join(dirOf(id), 'server.properties');
function readProps(id) { const o = { ...DEF }; try { for (const l of fs.readFileSync(pf(id), 'utf8').split(/\r?\n/)) { const k = l.indexOf('='); if (k > 0 && !l.startsWith('#')) o[l.slice(0, k)] = l.slice(k + 1); } } catch (e) {} return o; }
function writeProps(id, ch) {
  let L = []; try { L = fs.readFileSync(pf(id), 'utf8').split(/\r?\n/); } catch (e) { L = ['#Hydarium', ...Object.entries(DEF).map(([k, v]) => k + '=' + v)]; }
  for (let [k, v] of Object.entries(ch)) { if (k === 'motd') v = esc8(v); const n = L.findIndex(x => x.startsWith(k + '=')); n >= 0 ? (L[n] = k + '=' + v) : L.push(k + '=' + v); }
  fs.mkdirSync(dirOf(id), { recursive: true }); fs.writeFileSync(pf(id), L.join('\n'));
}
/* Icône d'un serveur relié à un monde = l'icône de ce monde (icon.png du dossier du monde) ; sinon celle choisie pour le serveur (server-icon.png). */
const worldIconFile = h => { try { if (!h.link) return null; const f = path.join(dirOf(h.id), h.link.name, 'icon.png'); return fs.existsSync(f) ? f : null; } catch (e) { return null; } };
const iconOf = h => { for (const f of [worldIconFile(h), path.join(dirOf(h.id), 'server-icon.png')]) { if (!f) continue; try { return 'data:image/png;base64,' + fs.readFileSync(f).toString('base64'); } catch (e) {} } return ''; };
/* La liste des serveurs Minecraft ne lit que server-icon.png (64×64) : on y recopie l'icône du monde relié au démarrage. */
const syncWorldIcon = h => { try { const f = worldIconFile(h); if (!f) return; const img = nativeImage.createFromPath(f); if (!img.isEmpty()) fs.writeFileSync(path.join(dirOf(h.id), 'server-icon.png'), img.resize({ width: 64, height: 64, quality: 'best' }).toPNG()); } catch (e) {} };
/* Affichage de la version : « Forge 1.8.9 (11.15.1.2318) », « NeoForge 1.21.1 (21.1.x) », « Paper 1.21.4 »… */
const KIND = { vanilla: 'Vanilla', paper: 'Paper', fabric: 'Fabric', forge: 'Forge', neoforge: 'NeoForge' };
const vlabel = h => (KIND[h.type] || String(h.type || '')) + ' ' + h.version + (h.loaderVer ? ' (' + h.loaderVer + ')' : '');
const stateOf = h => { const r = run.get(h.id); return { ...h, icon: iconOf(h), worldIcon: !!worldIconFile(h), vlabel: vlabel(h), state: r ? r.state : 'stopped', players: r ? [...r.players] : [], ip: lan() }; };
const lan = () => Object.values(os.networkInterfaces()).flat().filter(n => n && n.family === 'IPv4' && !n.internal).map(n => n.address);
/* ----- monde <-> serveur : relier (mêmes fichiers des deux côtés) ou copier un monde d’une instance ----- */
const okFolder = n => { n = String(n || ''); if (!n || n !== path.basename(n) || n === '.' || n === '..') throw new Error('Nom de monde invalide.'); return n; };
const isLink = p => { try { return fs.lstatSync(p).isSymbolicLink(); } catch (e) { return false; } };
const dropLink = p => { if (!isLink(p)) return; try { fs.unlinkSync(p); } catch (e) { try { fs.rmdirSync(p); } catch (e2) {} } }; // retire le lien, jamais le dossier visé
const busy = instId => { try { const c = require('./session').current(); return !!(c && c.id === instId); } catch (e) { return false; } };
const verNum = v => String(v || '').split('.').map(x => parseInt(x, 10) || 0), isVer = v => /^\d+(\.\d+)*$/.test(String(v || ''));
const newer = (a, b) => { const x = verNum(a), y = verNum(b); for (let k = 0; k < 3; k++) if ((x[k] || 0) !== (y[k] || 0)) return (x[k] || 0) > (y[k] || 0); return false; };
function worldSrc(instId, folder) {
  const inst = store.get().instances.find(x => x.id === instId); if (!inst) throw new Error('Instance introuvable.');
  folder = okFolder(folder); const p = path.join(plat.dataDir(), 'instances', inst.id, 'saves', folder);
  if (!fs.existsSync(path.join(p, 'level.dat'))) throw new Error('Ce monde n’a pas de level.dat : ouvre-le une fois dans le jeu avant de l’utiliser.');
  return { inst, folder, p };
}
exports.attachWorld = (id, instId, folder, mode) => {
  const h = get(id); if (run.has(id)) throw new Error('Arrête le serveur avant de changer son monde.');
  if (mode !== 'link' && mode !== 'copy') throw new Error('Choisis « Relier » ou « Copier ».');
  const { inst, folder: f, p } = worldSrc(instId, folder);
  if (busy(inst.id)) throw new Error('Ferme Minecraft : le monde est ouvert dans cette instance.');
  const dir = dirOf(id); fs.mkdirSync(dir, { recursive: true });
  const base = f.replace(/[^A-Za-z0-9_.\- ]/g, '_').trim() || 'world'; let name = base, k = 2; // nom ASCII : server.properties est lu en ISO-8859-1
  while (fs.existsSync(path.join(dir, name)) || isLink(path.join(dir, name))) name = base + '-' + k++;
  const dst = path.join(dir, name);
  if (mode === 'link') { try { fs.symlinkSync(path.resolve(p), dst, process.platform === 'win32' ? 'junction' : 'dir'); } catch (e) { throw new Error('Impossible de relier ce monde (' + e.message + '). Utilise « Copier ».'); } }
  else fs.cpSync(p, dst, { recursive: true });
  if (h.link) dropLink(path.join(dir, h.link.name)); // ancien monde relié : retiré du serveur, il reste dans son instance
  writeProps(id, { 'level-name': name });
  if (mode === 'link') h.link = { inst: inst.id, folder: f, name }; else delete h.link;
  store.save();
  let warn = '';
  try { const v = require('./content').worldInfo(inst.id, f).version; if (isVer(v) && isVer(h.version) && newer(v, h.version)) warn = 'Ce monde a été enregistré avec Minecraft ' + v + ', plus récent que ce serveur (' + h.version + ') : il risque d’être abîmé. Crée plutôt un serveur en ' + v + '.'; } catch (e) {}
  if (h.type === 'paper') warn += (warn ? ' ' : '') + 'Paper peut ranger le Nether et l’End dans des dossiers séparés : avec un monde relié, préfère Vanilla ou Fabric.';
  return { name, warn, linked: mode === 'link' };
};
/* délier : le serveur garde une copie indépendante du monde, l’instance garde le sien */
exports.unlinkWorld = id => {
  const h = get(id); if (!h.link) return; if (run.has(id)) throw new Error('Arrête le serveur avant de délier son monde.');
  const dst = path.join(dirOf(id), h.link.name); let src = null;
  if (isLink(dst)) { try { src = fs.realpathSync(dst); } catch (e) {} dropLink(dst); if (src && fs.existsSync(src)) fs.cpSync(src, dst, { recursive: true }); }
  delete h.link; store.save();
};
exports.linksTo = instId => hosts().filter(h => h.link && h.link.inst === instId);
exports.list = () => hosts().map(stateOf);
exports.create = async (o, send) => {
  const name = String(o.name || '').trim().slice(0, 40); if (!name) throw new Error('Donne un nom au serveur.');
  if (!['vanilla', 'paper', 'fabric', 'forge', 'neoforge'].includes(o.type)) throw new Error('Type de serveur inconnu.');
  const modern = o.type === 'forge' || o.type === 'neoforge'; if (modern && !/^[\w.+-]{1,40}$/.test(o.loaderVer || '')) throw new Error('Choisis une version de ' + (o.type === 'forge' ? 'Forge' : 'NeoForge') + '.');
  const v = (await game.versions()).find(x => x.id === o.version && x.type === 'release'); if (!v) throw new Error('Choisis une version officielle (release).');
  if (o.eula !== true) throw new Error('Tu dois accepter le CLUF de Minecraft (minecraft.net/eula) pour héberger un serveur.');
  let W = null; if (o.world) { W = worldSrc(String(o.world.inst || ''), o.world.folder); if (o.world.mode !== 'link' && o.world.mode !== 'copy') throw new Error('Choisis « Relier » ou « Copier » pour le monde.'); if (busy(W.inst.id)) throw new Error('Ferme Minecraft : le monde est ouvert dans cette instance.'); } // monde vérifié avant tout téléchargement
  const port = hosts().reduce((m, h) => Math.max(m, h.port), 25564) + 1, id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5), dir = dirOf(id);
  if (modern) await installLoader({ type: o.type, loader: o.type, version: v.id, loaderVer: o.loaderVer }, dir, send); else await fetchJar(o.type, v.id, path.join(dir, 'server.jar'));
  fs.writeFileSync(path.join(dir, 'eula.txt'), '# Accepté depuis Hydarium (https://aka.ms/MinecraftEULA)\neula=true\n');
  const wl = (Array.isArray(o.whitelist) ? o.whitelist : []).map(x => String(x).trim()).filter(Boolean).slice(0, 50), ops = (Array.isArray(o.ops) ? o.ops : []).map(x => String(x).trim()).filter(Boolean).slice(0, 20);
  writeProps(id, { 'server-port': String(port), motd: name, ...(wl.length ? { 'white-list': 'true' } : {}) });
  const h = { id, name, type: o.type, loader: ['fabric', 'forge', 'neoforge'].includes(o.type) ? o.type : 'vanilla', ...(modern ? { loaderVer: o.loaderVer } : {}), mods: [], version: v.id, mem: Math.min(16, Math.max(1, Math.round(+o.mem) || 2)), port, created: Date.now() }; hosts().push(h); store.save(); const bad = [];
  for (const [list, act] of [[wl, 'add-whitelist'], [ops, 'op']]) for (const n of list) { try { await exports.player(id, act, n); } catch (e) { bad.push(n + ' : ' + e.message); } }
  let warn = ''; if (W) { try { warn = exports.attachWorld(id, W.inst.id, W.folder, o.world.mode).warn; } catch (e) { bad.push('Monde : ' + e.message); } }
  return { ...stateOf(h), bad, warn };
};
exports.setIcon = (id, file) => { if (worldIconFile(get(id))) throw new Error('Ce serveur utilise l’icône de son monde : délie le monde pour en choisir une autre.'); const img = nativeImage.createFromPath(file); if (img.isEmpty()) throw new Error('Image illisible.'); fs.mkdirSync(dirOf(id), { recursive: true }); fs.writeFileSync(path.join(dirOf(id), 'server-icon.png'), img.resize({ width: 64, height: 64, quality: 'best' }).toPNG()); };
exports.removeIcon = id => { get(id); if (worldIconFile(get(id))) throw new Error('Ce serveur utilise l’icône de son monde : délie le monde pour en choisir une autre.'); fs.rmSync(path.join(dirOf(id), 'server-icon.png'), { force: true }); };
const esc8 = v => v.replace(/[^\x20-\x7e]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')), unesc8 = v => v.replace(/\\u([0-9a-fA-F]{4})/g, (m, x) => String.fromCharCode(parseInt(x, 16)));
exports.props = id => { get(id); const p = readProps(id); p.motd = unesc8(p.motd); return p; };
exports.setProps = (id, o) => { get(id); const ch = {}; for (const [k, v] of Object.entries(o || {})) if (CHECK[k] && CHECK[k](String(v))) ch[k] = String(v); if (ch['server-port']) get(id).port = +ch['server-port']; writeProps(id, ch); store.save(); };
exports.set = (id, o) => { const h = get(id); if (o.mem >= 1 && o.mem <= 32) h.mem = Math.round(o.mem); if (typeof o.name === 'string' && o.name.trim()) h.name = o.name.trim().slice(0, 40);
  if (typeof o.playitAddress === 'string') { const a = o.playitAddress.trim() ? require('./playit').validAddress(o.playitAddress) : ''; if (o.playitAddress.trim() && !a) throw new Error('Adresse invalide : écris par exemple nom.gl.at.ply.gg:12345'); if (a) h.playitAddress = a; else delete h.playitAddress; }
  store.save(); };
/* Adresse playit détectée pour le port d'un serveur → enregistrée pour lui, SAUF si la personne en a saisi une autre à la main (on ne remplace que ce qu'on avait écrit nous-mêmes). */
exports.syncPlayit = tunnels => {
  let ch = false;
  for (const h of hosts()) { const a = tunnels && tunnels[h.port]; if (!a || !(h.playitAddress === undefined || !h.playitAddress || h.playitAddress === h.playitAuto)) continue; if (h.playitAddress !== a) { h.playitAddress = a; ch = true; } h.playitAuto = a; }
  if (ch) store.save(); return ch;
};
/* Invitations privées (P2P, voir p2p.js) : le partage s'ouvre quand le serveur est en ligne et se ferme avec lui. Aucun port n'est ouvert sur la box. */
function shareAuto(h, open, out) {
  const p2p = require('./p2p');
  if (!open) { if (p2p.unshare(h.id)) out('[Hydarium] Invitations privées fermées'); return; }
  if (!h.p2p || !h.p2p.on) return;
  p2p.share(h.id, h.port, h.p2p.code).then(ok => { if (ok) out('[Hydarium] Invitations privées ouvertes : tes amis rejoignent avec leur code (aucun port ouvert)'); })
    .catch(e => { out('[Hydarium] Invitations privées non ouvertes : ' + e.message); log.warn('p2p share', h.name, e.message); });
}
exports.p2pInfo = id => { const h = get(id), st = require('./p2p').status().shares.find(x => x.hostId === id); return { on: !!(h.p2p && h.p2p.on), code: (h.p2p && h.p2p.code) || '', sharing: !!st, peers: st ? st.peers : 0 }; };
/* o.on : activer / désactiver ; o.renew : nouveau code (l'ancien cesse aussitôt de fonctionner) */
exports.p2pSet = async (id, o) => {
  const h = get(id), p2p = require('./p2p'); o = o || {}; let renew = o.renew === true;
  if (typeof o.on === 'boolean') { if (o.on && !(h.p2p && h.p2p.code)) renew = true; h.p2p = { ...(h.p2p || {}), on: o.on }; }
  if (renew) h.p2p = { ...(h.p2p || { on: true }), code: p2p.newCode() };
  store.save();
  if (!h.p2p || !h.p2p.on) p2p.unshare(id);
  else if (run.get(id) && run.get(id).state === 'running' && (renew || !p2p.status().shares.some(x => x.hostId === id))) await p2p.share(id, h.port, h.p2p.code);
  return exports.p2pInfo(id);
};
/* Les anciennes versions ouvraient le port du serveur sur la box (UPnP, SANS durée limite). Hydarium n'ouvre plus aucun port : au démarrage, on referme UNE fois ceux qu'il avait ouverts. */
const noEntry = e => /714|NoSuchEntry|no such|inexistant/i.test(String((e && (e.message || e.description || e.code)) || e)); // la box n'a (plus) cette redirection
async function legacyClose(h) {
  const up = require('nat-upnp'), c = up.createClient();
  const un = port => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('La box ne répond pas à UPnP.')), 8000); c.portUnmapping({ public: port, protocol: 'TCP' }, e => { clearTimeout(t); if (!e || noEntry(e)) return res(); rej(new Error(String(e.message || e))); }); });
  try { for (const p of new Set([h.upnpPort, h.port].filter(Boolean))) await un(p); } finally { try { c.close(); } catch (e) {} }
}
exports.closeLegacyPorts = async () => {
  const todo = hosts().filter(h => h.upnp || h.upnpPort), closed = [];
  for (const h of todo) { try { await legacyClose(h); closed.push(h.upnpPort || h.port); h.upnp = false; delete h.upnpPort; } catch (e) { log.warn('Fermeture d’un ancien port UPnP', h.name, e.message); } } // en cas d'échec on réessaie au prochain démarrage
  if (todo.length) store.save();
  if (closed.length) { log.info('Anciens ports UPnP refermés', closed.join(', ')); try { notify.show('Port refermé sur ta box', 'Hydarium n’ouvre plus de port : ' + closed.join(', ') + (closed.length > 1 ? ' ont été refermés.' : ' a été refermé.'), '', 'server'); } catch (e) {} }
  return closed;
};
exports.start = async (id, send) => {
  const h = get(id); if (run.has(id)) throw new Error('Ce serveur est déjà démarré.');
  const need = await game.needJava({ version: h.version }), jv = await game.chooseJava({ version: h.version, loader: h.loader, java: '' }, need, send), dir = dirOf(id);
  const modern = h.type === 'forge' || h.type === 'neoforge'; if (!modern && !fs.existsSync(path.join(dir, 'server.jar'))) throw new Error('Fichier server.jar manquant.');
  syncWorldIcon(h);
  const r = { state: 'starting', players: new Set(), lines: [], proc: null }; run.set(id, r);
  const out = l => { r.lines.push(l); if (r.lines.length > 500) r.lines.shift(); send('host:log', { id, line: l }); };
  const proc = spawn(jv.path, [`-Xmx${h.mem}G`, '-Xms1G', ...(modern ? loaderArgs(dir) : ['-jar', 'server.jar']), 'nogui'], { cwd: dir }); r.proc = proc;
  log.info('Serveur démarré', h.name, h.version, h.type, jv.path);
  out(`[Hydarium] Java ${jv.major} · ${h.mem} Go · port ${h.port}`);
  let buf = ''; const feed = d => { buf += d.toString(); const L = buf.split(/\r?\n/); buf = L.pop(); for (const l of L) {
    out(l); let m;
    if (/\]: Done \(/.test(l)) { r.state = 'running'; send('host:state', { id }); notify.show('Serveur en ligne', h.name + ' · port ' + h.port, '', 'server'); shareAuto(h, true, out); }
    else if ((m = l.match(/\]: (\w{3,16}) joined the game/))) { r.players.add(m[1]); send('host:state', { id }); notify.show(h.name, m[1] + ' a rejoint le serveur', '', 'server'); }
    else if ((m = l.match(/\]: (\w{3,16}) left the game/))) { r.players.delete(m[1]); send('host:state', { id }); }
  } };
  proc.stdout.on('data', feed); proc.stderr.on('data', feed);
  proc.on('error', e => { out('[Hydarium] Impossible de lancer Java : ' + e.message); run.delete(id); send('host:state', { id }); });
  proc.on('close', c => { out(`[Hydarium] Serveur arrêté (code ${c})`); run.delete(id); send('host:state', { id }); shareAuto(h, false, out); });
};
exports.stop = id => { const r = run.get(id); if (!r) return; r.state = 'stopping'; try { r.proc.stdin.write('stop\n'); } catch (e) {} setTimeout(() => { if (run.get(id) === r) try { r.proc.kill(); } catch (e) {} }, 25000); };
exports.cmd = (id, c) => { const r = run.get(id); if (!r) throw new Error('Le serveur n’est pas démarré.'); c = String(c || '').replace(/^\//, '').trim(); if (!c || c.length > 200 || /[\r\n]/.test(c)) throw new Error('Commande invalide.'); r.proc.stdin.write(c + '\n'); r.lines.push('> ' + c); };
exports.log = id => (run.get(id) || { lines: [] }).lines;
exports.remove = id => { const h = get(id); if (run.has(id)) throw new Error('Arrête le serveur avant de le supprimer.'); require('./p2p').unshare(id); if (h.upnp) legacyClose(h).catch(() => {}); /* ancien port UPnP encore ouvert : on tente de le refermer */ if (h.link) dropLink(path.join(dirOf(id), h.link.name)); /* on retire le lien d’abord : jamais le monde de l’instance */ fs.rmSync(dirOf(id), { recursive: true, force: true }); store.get().hosts = hosts().filter(x => x.id !== id); store.save(); };
exports.dir = id => { get(id); return dirOf(id); };
exports.runState = id => { const r = run.get(id); return r ? r.state : 'stopped'; };
exports.isRunning = id => run.has(id); // un serveur démarré (ou en arrêt) garde ses fichiers ouverts
exports.stopAll = () => { for (const [, r] of run) try { r.proc.stdin.write('stop\n'); } catch (e) {} };

/* ----- exporter / importer un serveur ----- */
const SKIP = new Set(['logs', 'crash-reports', 'cache', '.fabric', 'libraries']);
const isD = (e, base, r) => e.isDirectory() || (e.isSymbolicLink() && (() => { try { return fs.statSync(path.join(base, r)).isDirectory(); } catch (x) { return false; } })()); // un monde relié est un lien : on l’exporte comme un vrai dossier
function walk(z, base, rel = '') { for (const e of fs.readdirSync(path.join(base, rel), { withFileTypes: true })) { const r = rel ? rel + '/' + e.name : e.name; if (isD(e, base, r)) { if (!rel && SKIP.has(e.name)) continue; walk(z, base, r); } else if (!/^hs_err_pid/.test(e.name) && !e.name.endsWith('.lock')) z.addLocalFile(path.join(base, r), rel); } }
exports.export = (id, dest) => {
  const h = get(id); if (run.has(id)) throw new Error('Arrête le serveur avant de l’exporter.');
  const dir = dirOf(id), Zip = require('adm-zip'), z = new Zip();
  const sz = (d => { let n = 0; const w = p => { for (const e of fs.readdirSync(p, { withFileTypes: true })) { const f = path.join(p, e.name); e.isDirectory() ? w(f) : (n += fs.statSync(f).size); } }; try { w(d); } catch (e) {} return n; })(dir);
  if (sz > 1.5e9) throw new Error('Ce serveur dépasse 1,5 Go : copie son dossier à la main (bouton dossier).');
  walk(z, dir);
  z.addFile('hydarium-server.json', Buffer.from(JSON.stringify({ format: 1, name: h.name, type: h.type, loader: h.loader, version: h.version, mem: h.mem, port: h.port }, null, 2)));
  z.addFile('start.bat', Buffer.from(`@echo off\r\njava -Xmx${h.mem}G -Xms1G -jar server.jar nogui\r\npause\r\n`));
  z.addFile('start.sh', Buffer.from(`#!/bin/sh\nexec java -Xmx${h.mem}G -Xms1G -jar server.jar nogui\n`), '', 0o755 << 16);
  z.addFile('LISEZMOI.txt', Buffer.from(`Serveur « ${h.name} » exporté par Hydarium.\nMinecraft ${h.version} (${h.type}). Java requis : voir minecraft.wiki (21 pour les versions récentes).\nLancer : start.bat (Windows) ou start.sh (Linux / macOS). Ouvre le port TCP ${h.port} sur ta box ou ton hébergeur.\n`));
  z.writeZip(dest);
};
exports.import = file => {
  const Zip = require('adm-zip'), z = new Zip(file), es = z.getEntries(); let m = {};
  const mf = es.find(e => e.entryName === 'hydarium-server.json'); if (mf) { try { m = JSON.parse(mf.getData().toString()); } catch (e) {} }
  if (!es.some(e => e.entryName === 'server.jar')) throw new Error('Ce zip ne contient pas de server.jar à la racine.');
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5), dir = dirOf(id), port = hosts().reduce((a, x) => Math.max(a, x.port), 25564) + 1;
  for (const e of es) { if (e.isDirectory) continue; const t = path.resolve(dir, e.entryName); if (!t.startsWith(path.resolve(dir) + path.sep)) continue; fs.mkdirSync(path.dirname(t), { recursive: true }); fs.writeFileSync(t, e.getData()); }
  const type = ['vanilla', 'paper', 'fabric'].includes(m.type) ? m.type : 'vanilla';
  const h = { id, name: String(m.name || path.basename(file, '.zip')).slice(0, 40), type, loader: type === 'fabric' ? 'fabric' : 'vanilla', mods: [], version: /^1\.\d+(\.\d+)?$/.test(m.version || '') ? m.version : '1.21.4', mem: Math.min(16, Math.max(1, +m.mem || 2)), port, created: Date.now() };
  hosts().push(h); writeProps(id, { 'server-port': String(port) }); store.save(); return stateOf(h);
};
/* ----- joueurs : liste blanche, opérateurs, bannis (fichiers du serveur, ou commandes si le serveur tourne) ----- */
const jf = (id, f) => { try { const j = JSON.parse(fs.readFileSync(path.join(dirOf(id), f), 'utf8')); return Array.isArray(j) ? j : []; } catch (e) { return []; } };
const jw = (id, f, v) => { fs.mkdirSync(dirOf(id), { recursive: true }); fs.writeFileSync(path.join(dirOf(id), f), JSON.stringify(v, null, 2)); };
exports.players = id => { get(id); const p = readProps(id); return { whitelistOn: p['white-list'] === 'true', online: p['online-mode'] !== 'false', ops: jf(id, 'ops.json'), whitelist: jf(id, 'whitelist.json'), banned: jf(id, 'banned-players.json') }; };
async function uuidOf(id, name) {
  const dash = h => h.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
  if (readProps(id)['online-mode'] === 'false') { const b = crypto.createHash('md5').update('OfflinePlayer:' + name).digest(); b[6] = (b[6] & 0x0f) | 0x30; b[8] = (b[8] & 0x3f) | 0x80; return { uuid: dash(b.toString('hex')), name }; }
  const r = await fetch('https://api.mojang.com/users/profiles/minecraft/' + name, { signal: AbortSignal.timeout(10000) });
  if (r.status === 404 || r.status === 204) throw new Error('Le joueur « ' + name + ' » n’existe pas.'); if (!r.ok) throw new Error('Service Mojang indisponible.');
  const j = await r.json(); return { uuid: dash(j.id), name: j.name };
}
const CMD = { 'add-whitelist': 'whitelist add %', 'remove-whitelist': 'whitelist remove %', op: 'op %', deop: 'deop %', ban: 'ban %', pardon: 'pardon %', kick: 'kick %' };
exports.player = async (id, action, name) => {
  get(id); name = String(name || '').trim(); if (!/^\w{3,16}$/.test(name)) throw new Error('Pseudo invalide (3 à 16 caractères).'); if (!CMD[action]) throw new Error('Action inconnue.');
  if (run.has(id) && run.get(id).state === 'running') return exports.cmd(id, CMD[action].replace('%', name));
  if (action === 'kick') throw new Error('Le serveur doit être démarré pour expulser un joueur.');
  const low = n => String(n).toLowerCase(), same = x => low(x.name) === low(name);
  if (action === 'add-whitelist') { const l = jf(id, 'whitelist.json'); if (!l.some(same)) { l.push(await uuidOf(id, name)); jw(id, 'whitelist.json', l); } }
  else if (action === 'remove-whitelist') jw(id, 'whitelist.json', jf(id, 'whitelist.json').filter(x => !same(x)));
  else if (action === 'op') { const l = jf(id, 'ops.json'); if (!l.some(same)) { l.push({ ...(await uuidOf(id, name)), level: 4, bypassesPlayerLimit: false }); jw(id, 'ops.json', l); } }
  else if (action === 'deop') jw(id, 'ops.json', jf(id, 'ops.json').filter(x => !same(x)));
  else if (action === 'ban') { const l = jf(id, 'banned-players.json'); if (!l.some(same)) { l.push({ ...(await uuidOf(id, name)), created: new Date().toISOString().replace('T', ' ').slice(0, 19) + ' +0000', source: 'Hydarium', expires: 'forever', reason: 'Banni par l’opérateur' }); jw(id, 'banned-players.json', l); } }
  else if (action === 'pardon') jw(id, 'banned-players.json', jf(id, 'banned-players.json').filter(x => !same(x)));
};
