/* Import de modpacks : Modrinth (.mrpack), CurseForge (.zip) et export d’instance Prism / MultiMC (.zip). */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const Zip = require('adm-zip');
const store = require('./store'), game = require('./game'), mods = require('./mods'), plat = require('./platform'), cf = require('./curseforge'), log = require('./log');
const HOSTS = ['modrinth.com', 'github.com', 'raw.githubusercontent.com', 'gitlab.com', 'forgecdn.net'];
const within = (base, rel) => { const t = path.resolve(base, rel); if (t !== path.resolve(base) && !t.startsWith(path.resolve(base) + path.sep)) throw new Error('Chemin refusé dans le modpack : ' + rel); return t; };
const sha1 = f => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
const names = z => z.getEntries().map(e => e.entryName);
exports.detect = file => {
  const z = new Zip(file), n = names(z);
  if (n.includes('modrinth.index.json')) return 'mrpack';
  if (n.includes('manifest.json')) { try { const m = JSON.parse(z.readAsText('manifest.json')); if (m.minecraft && m.files) return 'curseforge'; } catch (e) {} }
  if (n.some(x => /(^|\/)(instance\.cfg|mmc-pack\.json)$/.test(x))) return 'prism';
  return '';
};
function extract(z, prefix, dest) {
  for (const e of z.getEntries()) { if (e.isDirectory || !e.entryName.startsWith(prefix)) continue; const rel = e.entryName.slice(prefix.length); if (!rel) continue; const t = within(dest, rel); fs.mkdirSync(path.dirname(t), { recursive: true }); fs.writeFileSync(t, e.getData()); }
}
async function pool(items, n, fn) { let k = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (k < items.length) { const i = k++; await fn(items[i], i); } })); }
/* retrouve les mods d’un dossier mods/ par leur empreinte (Modrinth), pour qu’ils soient gérés comme des mods normaux */
async function identify(inst, dirIn) {
  const dir = dirIn || path.join(plat.dataDir(), 'instances', inst.id, 'mods'); let files = []; try { files = fs.readdirSync(dir).filter(f => /\.jar$/i.test(f)); } catch (e) {}
  if (!files.length) return; const hs = Object.fromEntries(files.map(f => [sha1(path.join(dir, f)), f])); let found = {};
  try { found = await mods.post(`${mods.MR}/version_files`, { hashes: Object.keys(hs), algorithm: 'sha1' }); } catch (e) { log.warn('identification des mods', e.message); }
  const ids = [...new Set(Object.values(found).map(v => v.project_id))]; let projs = {};
  if (ids.length) try { for (const p of await mods.fetchJson(`${mods.MR}/projects?ids=${encodeURIComponent(JSON.stringify(ids))}`)) projs[p.id] = p; } catch (e) {}
  for (const [h, f] of Object.entries(hs)) {
    if (inst.mods.some(m => m.file === f)) continue; const v = found[h], p = v && projs[v.project_id];
    if (p) inst.mods.push({ pid: p.id, slug: p.slug, title: p.title, file: f, incompat: [], deps: v.dependencies.filter(d => d.dependency_type === 'required' && d.project_id).map(d => d.project_id), auto: false, icon: (p.icon_url || '').startsWith('https://cdn.modrinth.com/') ? p.icon_url : '' });
    else inst.mods.push({ pid: 'imp' + crypto.createHash('sha1').update(f).digest('hex').slice(0, 8), slug: f.toLowerCase().replace(/\.jar$/, ''), title: f.replace(/\.jar$/i, ''), file: f, incompat: [], auto: false });
  }
  store.save();
}
const mkInst = async (name, version, loader, loaderVer) => {
  const v = (await game.versions()).find(x => x.id === version); if (!v) throw new Error('Minecraft ' + version + ' est inconnu ou trop récent pour ce launcher.');
  const i = store.addInstance({ name: String(name || 'Modpack').slice(0, 40), version: v.id, type: v.type, loader }); if (loaderVer) i.loaderVer = loaderVer; store.save(); return i;
};
const idir = i => path.join(plat.dataDir(), 'instances', i.id);

async function mrpack(file, z, p) {
  const idx = JSON.parse(z.readAsText('modrinth.index.json')), d = idx.dependencies || {}, mc = d.minecraft;
  const loader = d['fabric-loader'] ? 'fabric' : d['quilt-loader'] ? 'quilt' : d.neoforge ? 'neoforge' : d.forge ? 'forge' : 'vanilla', lv = d.neoforge || d.forge || '';
  const i = await mkInst(idx.name, mc, loader, lv), dir = idir(i); fs.mkdirSync(dir, { recursive: true });
  const files = (idx.files || []).filter(f => !(f.env && f.env.client === 'unsupported')); let done = 0;
  await pool(files, 4, async f => { const dest = within(dir, f.path), url = (f.downloads || [])[0]; if (!url) throw new Error('Fichier sans lien : ' + f.path); await mods.download(url, dest, f.hashes && f.hashes.sha1, HOSTS); p({ text: path.basename(f.path), done: ++done, total: files.length }); });
  p({ text: 'Copie des fichiers du pack…', done: files.length, total: files.length }); extract(z, 'overrides/', dir); extract(z, 'client-overrides/', dir);
  await identify(i); return i;
}
async function curseforge(file, z, p) {
  const m = JSON.parse(z.readAsText('manifest.json')), ml = (m.minecraft.modLoaders || []).find(x => x.primary) || (m.minecraft.modLoaders || [])[0], id = ml ? ml.id : '';
  const loader = /^fabric/.test(id) ? 'fabric' : /^quilt/.test(id) ? 'quilt' : /^neoforge/.test(id) ? 'neoforge' : /^forge/.test(id) ? 'forge' : 'vanilla', lv = id.replace(/^(neoforge|forge|fabric|quilt)-/, '');
  if (!cf.hasKey()) throw new Error('Un modpack CurseForge demande ta clé CurseForge gratuite.');
  const i = await mkInst(m.name, m.minecraft.version, loader, loader === 'forge' || loader === 'neoforge' ? lv : ''), dir = idir(i); fs.mkdirSync(dir, { recursive: true });
  const ids = (m.files || []).filter(f => f.required !== false).map(f => f.fileID); let infos = [], modsInfo = {};
  for (let k = 0; k < ids.length; k += 100) infos = infos.concat(await cf.files(ids.slice(k, k + 100)));
  const modIds = [...new Set(infos.map(f => f.modId))]; for (let k = 0; k < modIds.length; k += 100) for (const x of await cf.mods(modIds.slice(k, k + 100))) modsInfo[x.id] = x;
  let done = 0, bad = [];
  await pool(infos, 4, async f => {
    const info = modsInfo[f.modId] || {}, isPack = /\.zip$/i.test(f.fileName) , sub = isPack ? (info.classId === 6552 ? 'shaderpacks' : 'resourcepacks') : 'mods', name = path.basename(f.fileName);
    try { await mods.download(cf.fileUrl(f), path.join(dir, sub, name), (f.hashes || []).find(h => h.algo === 1) && f.hashes.find(h => h.algo === 1).value, HOSTS); if (sub === 'mods') i.mods.push({ pid: 'cf' + f.modId, slug: info.slug || String(f.modId), title: info.name || name, file: name, incompat: [], deps: (f.dependencies || []).filter(d => d.relationType === 3).map(d => 'cf' + d.modId), auto: false, src: 'cf' }); }
    catch (e) { bad.push(name); log.warn('modpack CurseForge', name, e.message); } p({ text: name, done: ++done, total: infos.length });
  });
  extract(z, (m.overrides || 'overrides') + '/', dir); store.save(); i.importBad = bad.length ? bad : undefined; return i;
}
async function prism(file, z, p) {
  const n = names(z), cfg = n.find(x => /(^|\/)instance\.cfg$/.test(x)), pk = n.find(x => /(^|\/)mmc-pack\.json$/.test(x)), root = (cfg || pk).replace(/(instance\.cfg|mmc-pack\.json)$/, '');
  const pack = pk ? JSON.parse(z.readAsText(pk)) : { components: [] }, c = u => (pack.components.find(x => x.uid === u) || {}).version;
  const mc = c('net.minecraft'); if (!mc) throw new Error('Version de Minecraft introuvable dans cet export.');
  const loader = c('net.fabricmc.fabric-loader') ? 'fabric' : c('org.quiltmc.quilt-loader') ? 'quilt' : c('net.neoforged') ? 'neoforge' : c('net.minecraftforge') ? 'forge' : 'vanilla', lv = c('net.neoforged') || (c('net.minecraftforge') || '').replace(/^\d+(\.\d+)*-/, '');
  const name = cfg ? ((z.readAsText(cfg).match(/^name=(.*)$/m) || [])[1] || 'Instance Prism').trim() : 'Instance Prism';
  const i = await mkInst(name, mc, loader, lv), dir = idir(i); fs.mkdirSync(dir, { recursive: true });
  const gd = [root + '.minecraft/', root + 'minecraft/'].find(x => n.some(e => e.startsWith(x))); p({ text: 'Copie des fichiers…', done: 0, total: 1 });
  if (gd) extract(z, gd, dir); await identify(i); return i;
}
exports.run = async (file, p = () => {}) => {
  const kind = exports.detect(file); if (!kind) throw new Error('Ce fichier n’est pas un modpack reconnu (.mrpack Modrinth, .zip CurseForge ou export Prism / MultiMC).');
  const z = new Zip(file); p({ text: 'Lecture du pack…', done: 0, total: 1 });
  const i = await (kind === 'mrpack' ? mrpack : kind === 'curseforge' ? curseforge : prism)(file, z, p); try { require('./stats').markImported(i.id); } catch (e) {} return { id: i.id, name: i.name, kind, bad: i.importBad || [] };
};
exports.identify = identify;
