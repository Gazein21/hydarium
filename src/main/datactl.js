/* Nettoyage et réinitialisation : tailles par partie, suppression ciblée, remise à zéro. */
const fs = require('fs'), path = require('path');
const plat = require('./platform'), store = require('./store'), game = require('./game'), host = require('./host');
const D = () => plat.dataDir(), P = (...a) => path.join(D(), ...a);
const size = (p, depth = 0) => { let n = 0; try { const t = fs.lstatSync(p); if (!t.isDirectory()) return t.size; if (depth > 12) return 0; for (const e of fs.readdirSync(p)) n += size(path.join(p, e), depth + 1); } catch (e) {} return n; };
const usedVersion = (name, inst) => inst.some(i => name === i.version || name.includes(i.version) || (i.loaderVer && name.includes(i.loaderVer)));
const unusedVersions = () => { const d = P('shared', 'versions'), inst = store.get().instances; let l = []; try { l = fs.readdirSync(d); } catch (e) {} return l.filter(n => !usedVersion(n, inst)).map(n => path.join(d, n)); };
exports.sizes = () => ({ logs: size(P('logs')), installers: size(P('shared', 'installers')), runtimes: size(P('runtimes')), libs: size(P('shared', 'libraries')) + size(P('shared', 'assets')), versions: unusedVersions().reduce((a, p) => a + size(p), 0), skins: size(P('skins')), servers: size(P('servers')), instances: size(P('instances')), total: size(D()) });
const busy = () => { if (game.isRunning()) throw new Error('Ferme Minecraft avant de nettoyer.'); if (host.list().some(h => h.state !== 'stopped')) throw new Error('Arrête tes serveurs avant de nettoyer.'); };
const rm = p => fs.rmSync(p, { recursive: true, force: true });
exports.clear = kind => {
  busy();
  if (kind === 'logs') { const d = P('logs'); try { for (const f of fs.readdirSync(d)) { try { rm(path.join(d, f)); } catch (e) {} } } catch (e) {} }
  else if (kind === 'installers') rm(P('shared', 'installers'));
  else if (kind === 'runtimes') { rm(P('runtimes')); const s = store.get().settings; s.javas = (s.javas || []).filter(j => !j.startsWith(P('runtimes'))); if (s.java && s.java.startsWith(P('runtimes'))) s.java = ''; store.save(); }
  else if (kind === 'libs') { rm(P('shared', 'libraries')); rm(P('shared', 'assets')); }
  else if (kind === 'versions') unusedVersions().forEach(rm);
  else if (kind === 'skins') { rm(P('skins')); store.get().skinLib = []; store.save(); }
  else throw new Error('Partie inconnue.');
};
exports.reset = mode => {
  busy();
  if (mode === 'settings') { store.resetSettings(); return; }
  if (mode !== 'all') throw new Error('Mode inconnu.');
  for (const n of ['instances', 'shared', 'servers', 'skins', 'logs', 'runtimes', 'client']) rm(P(n));
  const db = store.get(); db.instances = []; db.servers = []; db.hosts = []; db.skinLib = []; db.accounts = {}; db.active = null; store.resetSettings();
};
