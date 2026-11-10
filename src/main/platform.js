/* Tout ce qui dépend du système d’exploitation est ici.
   Ajouter ou corriger une plateforme = adapter ce fichier, le reste du code ne change pas. */
const { app } = require('electron');
const path = require('path'), fs = require('fs'), os = require('os'), { execFile } = require('child_process');

const id = { win32: 'windows', darwin: 'macos', linux: 'linux' }[process.platform] || 'linux';
const ext = id === 'windows' ? '.exe' : '';
const home = os.homedir(), appdata = process.env.APPDATA || '';
const roots = {
  windows: ['C:\\Program Files\\Eclipse Adoptium', 'C:\\Program Files\\Java', 'C:\\Program Files\\Microsoft', 'C:\\Program Files\\Zulu', 'C:\\Program Files\\Amazon Corretto', 'C:\\Program Files\\BellSoft', path.join(appdata, 'PrismLauncher', 'java')],
  macos: ['/Library/Java/JavaVirtualMachines', path.join(home, 'Library/Java/JavaVirtualMachines')],
  linux: ['/usr/lib/jvm', path.join(home, '.sdkman/candidates/java')]
}[id];
const sub = { windows: 'bin', macos: 'Contents/Home/bin', linux: 'bin' }[id];
const mcRuntime = { windows: path.join(appdata, '.minecraft', 'runtime'), macos: path.join(home, 'Library/Application Support/minecraft/runtime'), linux: path.join(home, '.minecraft/runtime') }[id];
const ls = d => { try { return fs.readdirSync(d); } catch (e) { return []; } };

/* Java embarqué dans l’installeur (dossier « jre » à côté de l’application) */
const bundled = () => { for (const sd of ['bin', 'Contents/Home/bin']) { const p = path.join(process.resourcesPath || '', 'jre', sd, 'java' + ext); if (fs.existsSync(p)) return p; } return null; };
function candidates() {
  const c = [];
  if (process.env.JAVA_HOME) c.push(path.join(process.env.JAVA_HOME, 'bin', 'java' + ext));
  c.push('java' + ext);
  for (const r of roots) for (const d of ls(r)) c.push(path.join(r, d, sub, 'java' + ext));
  for (const a of ls(mcRuntime)) for (const b of ls(path.join(mcRuntime, a))) for (const n of ls(path.join(mcRuntime, a, b))) c.push(path.join(mcRuntime, a, b, n, 'bin', 'java' + ext)); // Java du launcher officiel
  return c;
}
const out = (p, ms = 8000) => new Promise(r => execFile(p, ['-version'], { timeout: ms }, (e, so, se) => r(e && !se ? null : String(se || so))));
/* { path, major, version, is64, vendor } ou null si ce n’est pas un Java utilisable */
/* tries > 1 : un Java tout juste installé peut mettre du temps à démarrer (analyse antivirus) → on réessaie avec un délai plus long */
exports.javaInfo = async (p, tries = 1) => {
  let t = null; for (let n = 1; n <= tries && !t; n++) { t = await out(p, 8000 * n); if (!t && n < tries) await new Promise(r => setTimeout(r, 1200)); }
  if (!t) return null;
  const m = t.match(/version "(\d+)(?:\.(\d+))?/); if (!m) return null;
  const v = ['Temurin|Adoptium', 'Zulu', 'Corretto', 'GraalVM', 'Microsoft', 'OpenJDK'].find(x => new RegExp(x, 'i').test(t));
  return { path: p, major: m[1] === '1' ? +m[2] : +m[1], version: (t.match(/version "([^"]+)"/) || [])[1], is64: /64-Bit/i.test(t), vendor: v ? v.split('|')[0] : 'Java' };
};
let cache = null;
/* Tous les Java trouvés sur la machine + ceux ajoutés à la main (extra) */
exports.javas = async (extra = [], force = false) => {
  if (!cache || force || Date.now() - cache.t > 3e5) {
    const b = bundled(), seen = new Set(), paths = [];
    for (const p of [b, ...candidates()].filter(Boolean)) {
      if (p !== 'java' + ext && !fs.existsSync(p)) continue;
      let k = p; try { k = fs.realpathSync(p); } catch (e) {}
      if (!seen.has(k)) { seen.add(k); paths.push(p); }
    }
    const list = (await Promise.all(paths.map(async p => { const i = await exports.javaInfo(p); return i && { ...i, bundled: p === b, system: p === 'java' + ext }; }))).filter(Boolean);
    cache = { t: Date.now(), list: list.filter(j => !(j.system && list.some(o => o !== j && o.version === j.version && o.vendor === j.vendor))) };
  }
  const res = [...cache.list];
  for (const p of extra) if (!res.some(j => j.path === p)) { const i = await exports.javaInfo(p); if (i) res.push({ ...i, custom: true }); }
  return res;
};

exports.id = id;
exports.info = () => ({ id, arch: process.arch });
exports.dataDir = () => app.getPath('userData'); // %APPDATA% / ~/Library/Application Support / ~/.config

/* Autres launchers détectables pour l’import (kind : mmc = Prism / MultiMC, official = Minecraft officiel) */
const others = {
  windows: [['prism', 'Prism Launcher', 'mmc', path.join(appdata, 'PrismLauncher', 'instances')], ['multimc', 'MultiMC', 'mmc', path.join(appdata, 'MultiMC', 'instances')], ['curseforge', 'CurseForge', 'cf', path.join(home, 'curseforge', 'minecraft', 'Instances')], ['atl', 'ATLauncher', 'atl', path.join(appdata, 'ATLauncher', 'instances')], ['official', 'Minecraft (officiel)', 'official', path.join(appdata, '.minecraft')]],
  macos: [['prism', 'Prism Launcher', 'mmc', path.join(home, 'Library/Application Support/PrismLauncher/instances')], ['official', 'Minecraft (officiel)', 'official', path.join(home, 'Library/Application Support/minecraft')]],
  linux: [['prism', 'Prism Launcher', 'mmc', path.join(home, '.local/share/PrismLauncher/instances')], ['official', 'Minecraft (officiel)', 'official', path.join(home, '.minecraft')]]
}[id];
exports.otherLaunchers = () => others.map(([key, name, kind, dir]) => ({ key, name, kind, dir })).filter(l => fs.existsSync(l.dir));
