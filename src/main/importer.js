/* Import depuis un autre launcher : Prism / MultiMC (instances Fabric, Quilt, Vanilla) et Minecraft officiel. */
const fs = require('fs'), path = require('path');
const store = require('./store'), plat = require('./platform'), game = require('./game'), log = require('./log');
const ls = d => { try { return fs.readdirSync(d); } catch (e) { return []; } };
let manualItems = [];
const find = key => { const l = plat.otherLaunchers().find(x => x.key === key); if (!l) throw new Error('Launcher introuvable.'); return l; };

function scan(l) {
  const out = [];
  if (l.kind === 'mmc') for (const d of ls(l.dir)) {
    const p = path.join(l.dir, d);
    try {
      const c = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(p, 'mmc-pack.json'), 'utf8')).components.map(x => [x.uid, x.version]));
      if (!c['net.minecraft']) continue;
      const loader = c['net.fabricmc.fabric-loader'] ? 'fabric' : c['org.quiltmc.quilt-loader'] ? 'quilt' : (c['net.minecraftforge'] || c['net.neoforged']) ? 'forge' : 'vanilla';
      let name = d; try { name = (fs.readFileSync(path.join(p, 'instance.cfg'), 'utf8').match(/^name=(.*)$/m) || [])[1] || d; } catch (e) {}
      out.push({ key: d, name: name.trim(), version: c['net.minecraft'], loader, src: ['minecraft', '.minecraft'].map(x => path.join(p, x)).find(x => fs.existsSync(x)), unsupported: loader === 'forge' });
    } catch (e) {}
  }
  if (l.kind === 'cf') for (const d of ls(l.dir)) {
    const p = path.join(l.dir, d);
    try {
      const j = JSON.parse(fs.readFileSync(path.join(p, 'minecraftinstance.json'), 'utf8')), n = String((j.baseModLoader && j.baseModLoader.name) || '').toLowerCase();
      const loader = n.startsWith('fabric') ? 'fabric' : n.startsWith('quilt') ? 'quilt' : /forge/.test(n) ? 'forge' : 'vanilla';
      out.push({ key: d, name: j.name || d, version: j.gameVersion, loader, src: p, unsupported: loader === 'forge' });
    } catch (e) {}
  }
  if (l.kind === 'atl') for (const d of ls(l.dir)) {
    const p = path.join(l.dir, d);
    try {
      const j = JSON.parse(fs.readFileSync(path.join(p, 'instance.json'), 'utf8')), t = JSON.stringify(j.launcher && j.launcher.loaderVersion || '').toLowerCase();
      const loader = /fabric/.test(t) ? 'fabric' : /quilt/.test(t) ? 'quilt' : /forge/.test(t) ? 'forge' : 'vanilla', v = j.id || j.minecraftVersion || (j.launcher && j.launcher.minecraftVersion);
      if (v) out.push({ key: d, name: (j.launcher && j.launcher.name) || d, version: v, loader, src: p, unsupported: loader === 'forge' });
    } catch (e) {}
  }
  if (l.kind === 'official') out.push({ key: 'official', name: 'Minecraft (launcher officiel)', version: null, loader: 'vanilla', src: l.dir });
  return out;
}
exports.detect = () => plat.otherLaunchers().map(l => ({ key: l.key, name: l.name, count: scan(l).length })).filter(l => l.count);
const items = key => key === 'manual' ? manualItems : scan(find(key));
/* import manuel : un dossier d’instances Prism/MultiMC, un dossier d’instance, ou un dossier .minecraft */
exports.manual = dir => {
  const cf = p => { const r = scan({ kind: 'cf', dir: path.dirname(p) }).find(x => x.key === path.basename(p)) || scan({ kind: 'atl', dir: path.dirname(p) }).find(x => x.key === path.basename(p)); return r || null; };
  const one = (p, key) => { try { const c = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(p, 'mmc-pack.json'), 'utf8')).components.map(x => [x.uid, x.version])); return scan({ kind: 'mmc', dir: path.dirname(p) }).find(x => x.key === path.basename(p)); } catch (e) { return null; } };
  let r = scan({ kind: 'mmc', dir });
  if (!r.length) r = scan({ kind: 'cf', dir }).concat(scan({ kind: 'atl', dir }));
  if (!r.length) { const x = one(dir) || cf(dir); if (x) r = [x]; }
  if (!r.length && ['mods', 'saves', 'versions', 'options.txt'].some(f => fs.existsSync(path.join(dir, f)))) r = [{ key: 'manual0', name: 'Dossier ' + path.basename(dir), version: null, loader: 'vanilla', src: dir }];
  if (!r.length) throw new Error('Rien d’importable dans ce dossier.');
  manualItems = r; return r.map(({ src, ...x }) => x);
};
exports.scan = key => items(key).map(({ src, ...x }) => x);
exports.run = async (key, keys) => {
  const list = items(key).filter(x => keys.includes(x.key) && !x.unsupported), vs = await game.versions(), skipped = []; let done = 0;
  for (const x of list) {
    const v = x.version ? vs.find(y => y.id === x.version) : vs.find(y => y.type === 'release');
    if (!v || !x.src) { skipped.push(x.name); continue; }
    const inst = store.addInstance({ name: x.name, version: v.id, type: v.type, loader: x.loader }), dest = game.dirOf(inst.id);
    for (const f of ['mods', 'saves', 'resourcepacks', 'shaderpacks', 'screenshots', 'config', 'options.txt', 'servers.dat']) {
      try { if (fs.existsSync(path.join(x.src, f))) fs.cpSync(path.join(x.src, f), path.join(dest, f), { recursive: true }); } catch (e) { log.warn('import : copie échouée', f, e.message); }
    }
    inst.mods = ls(path.join(dest, 'mods')).filter(f => f.endsWith('.jar')).map((f, i) => ({ pid: 'imp' + String(i).padStart(5, '0'), slug: f.replace(/\.jar$/, ''), title: f.replace(/\.jar$/, ''), file: f, incompat: [], auto: false }));
    store.save(); try { require('./stats').markImported(inst.id); } catch (e) { log.warn('stats d’import', e.message); } done++; log.info('import', x.name, x.version, x.loader);
  }
  return { done, skipped };
};
