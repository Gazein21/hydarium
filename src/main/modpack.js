/* Import de modpacks : Modrinth (.mrpack), CurseForge (.zip) et export d’instance Prism / MultiMC (.zip).
   Conçu pour ne JAMAIS laisser un import à moitié fait :
   • en cas d'échec, l'instance créée est SUPPRIMÉE (plus d'instance fantôme, plus de doublons quand on réessaie) ;
   • un fichier qui ne se télécharge pas n'arrête pas les autres (3 essais chacun, délai de 90 s : voir mods.download) ; l'import réussit avec la liste des fichiers manquants
     tant que ce n'est pas la majorité du pack, sinon il est annulé avec un message clair ;
   • tolère un dossier racine dans le zip, des chemins Windows (\), un fichier JSON précédé d'un BOM, un nom d'instance déjà pris ;
   • ne fige plus l'interface : copie et identification des fichiers par petits morceaux, avec progression ;
   • refuse tout chemin qui sortirait du dossier de l'instance. */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const Zip = require('adm-zip');
const store = require('./store'), game = require('./game'), mods = require('./mods'), plat = require('./platform'), cf = require('./curseforge'), log = require('./log');
const HOSTS = ['modrinth.com', 'github.com', 'raw.githubusercontent.com', 'gitlab.com', 'forgecdn.net'];
const tick = () => new Promise(r => setImmediate(r));
const norm = n => String(n).replace(/\\/g, '/');
const within = (base, rel) => { const t = path.resolve(base, rel); if (t !== path.resolve(base) && !t.startsWith(path.resolve(base) + path.sep)) throw new Error('Chemin refusé dans le modpack : ' + rel); return t; };
const sha1 = async f => crypto.createHash('sha1').update(await fs.promises.readFile(f)).digest('hex');
const names = z => z.getEntries().map(e => norm(e.entryName));
const idir = i => path.join(plat.dataDir(), 'instances', i.id);
const readJson = (z, entry) => JSON.parse(String(z.readAsText(entry)).replace(/^\uFEFF/, '')); // certains outils Windows écrivent un BOM : JSON.parse le refuse

/* ---- reconnaissance du format : l'entrée la moins profonde gagne, un dossier racine est toléré ---- */
const depth = e => norm(e.entryName).split('/').length;
const files = (z, re) => z.getEntries().filter(e => !e.isDirectory && !/^__MACOSX\//.test(norm(e.entryName)) && re.test(norm(e.entryName))).sort((a, b) => depth(a) - depth(b));
const rootOf = e => norm(e.entryName).replace(/[^/]*$/, '');
/** { kind: 'mrpack' | 'curseforge' | 'prism' | '', root: préfixe du dossier racine ('' = à la racine), entry } */
exports.inspect = file => {
  const z = new Zip(file);
  const mr = files(z, /(^|\/)modrinth\.index\.json$/)[0]; if (mr) return { kind: 'mrpack', root: rootOf(mr), entry: mr };
  for (const e of files(z, /(^|\/)manifest\.json$/)) { try { const m = readJson(z, e); if (m.minecraft && m.files) return { kind: 'curseforge', root: rootOf(e), entry: e }; } catch (x) { /* pas un manifeste */ } }
  const pr = files(z, /(^|\/)(instance\.cfg|mmc-pack\.json)$/)[0]; if (pr) return { kind: 'prism', root: rootOf(pr), entry: pr };
  return { kind: '', root: '', entry: null };
};
exports.detect = file => exports.inspect(file).kind;

/* ---- copie d'un dossier du zip, sans geler l'interface ---- */
async function extract(z, prefix, dest, p, label, ctx) {
  const list = z.getEntries().filter(e => { const n = norm(e.entryName); return !e.isDirectory && n.startsWith(prefix) && n.length > prefix.length && !/(^|\/)(__MACOSX\/|\.DS_Store$|Thumbs\.db$)/.test(n); });
  let done = 0, bytes = 0; p({ text: label, done: 0, total: list.length });   // l'étape s'affiche tout de suite, même pour un petit pack
  for (const e of list) {
    if (ctx && ctx.stop) throw new Error('Import annulé.');
    const t = within(dest, norm(e.entryName).slice(prefix.length)); fs.mkdirSync(path.dirname(t), { recursive: true });
    const data = e.getData(); fs.writeFileSync(t, data); bytes += data.length; done++;
    if (done % 25 === 0 || bytes > 8e6) { bytes = 0; p({ text: label + ' (' + done + '/' + list.length + ')', done, total: list.length }); await tick(); } // on rend la main à l'interface
  }
  return list.length;
}

/* n travailleurs en parallèle ; s'arrête dès que ctx.stop est vrai ; attend TOUS les travailleurs (aucune écriture en retard après un échec) ; renvoie les erreurs */
async function pool(items, n, fn, ctx) {
  let k = 0; const errs = [];
  const work = async () => { while (k < items.length && !(ctx && ctx.stop)) { const i = k++; try { await fn(items[i], i); } catch (e) { errs.push(e); if (e && e.fatal && ctx) ctx.stop = true; } } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, work));
  return errs;
}

/* retrouve les mods d'un dossier mods/ par leur empreinte (Modrinth), pour qu'ils soient gérés comme des mods normaux */
async function identify(inst, dirIn, p = () => {}) {
  const dir = dirIn || path.join(plat.dataDir(), 'instances', inst.id, 'mods'); let list = []; try { list = fs.readdirSync(dir).filter(f => /\.jar$/i.test(f)); } catch (e) {}
  if (!list.length) return;
  const hs = {}; let n = 0;
  for (const f of list) { hs[await sha1(path.join(dir, f))] = f; if (++n % 8 === 0) { p({ text: 'Identification des mods… (' + n + '/' + list.length + ')', done: n, total: list.length }); await tick(); } }
  const hashes = Object.keys(hs); let found = {};
  for (let k = 0; k < hashes.length; k += 200) { try { Object.assign(found, await mods.post(`${mods.MR}/version_files`, { hashes: hashes.slice(k, k + 200), algorithm: 'sha1' }) || {}); } catch (e) { log.warn('identification des mods', e.message); } }
  const ids = [...new Set(Object.values(found).map(v => v.project_id))]; const projs = {};
  for (let k = 0; k < ids.length; k += 100) { try { for (const q of await mods.fetchJson(`${mods.MR}/projects?ids=${encodeURIComponent(JSON.stringify(ids.slice(k, k + 100)))}`)) projs[q.id] = q; } catch (e) { /* tant pis : titres de secours */ } }
  for (const [h, f] of Object.entries(hs)) {
    if (inst.mods.some(m => m.file === f)) continue; const v = found[h], q = v && projs[v.project_id];
    if (q) inst.mods.push({ pid: q.id, slug: q.slug, title: q.title, file: f, incompat: [], deps: (v.dependencies || []).filter(d => d.dependency_type === 'required' && d.project_id).map(d => d.project_id), auto: false, icon: (q.icon_url || '').startsWith('https://cdn.modrinth.com/') ? q.icon_url : '' });
    else inst.mods.push({ pid: 'imp' + crypto.createHash('sha1').update(f).digest('hex').slice(0, 8), slug: f.toLowerCase().replace(/\.jar$/, ''), title: f.replace(/\.jar$/i, ''), file: f, incompat: [], auto: false });
  }
  store.save();
}

/* crée l'instance (mémorisée dans ctx pour pouvoir l'annuler) ; un nom déjà pris devient « Nom (2) » */
const mkInst = async (ctx, name, version, loader, loaderVer) => {
  const v = (await game.versions()).find(x => x.id === version); if (!v) throw new Error('Minecraft ' + version + ' est inconnu ou trop récent pour ce launcher.');
  const base = String(name || 'Modpack').trim().slice(0, 36) || 'Modpack'; let nm = base, k = 2; while ((store.get().instances || []).some(x => x.name === nm)) nm = base + ' (' + k++ + ')';
  const i = store.addInstance({ name: nm, version: v.id, type: v.type, loader }); if (loaderVer) i.loaderVer = loaderVer; store.save(); ctx.inst = i; return i;
};
/* images des mods lues dans leurs jars (sans bloquer ni faire échouer l'import) */
const icons = async (i, p) => { p({ text: 'Images des mods…', done: 0, total: 1 }); try { await require('./modicon').fill(i.id); } catch (e) { log.warn('images des mods', e.message); } };
const rollback = ctx => { if (!ctx.inst) return; try { store.removeInstance(ctx.inst.id); } catch (e) {} try { fs.rmSync(idir(ctx.inst), { recursive: true, force: true }); } catch (e) {} };
/* logo d'un mod CurseForge : seulement depuis le serveur d'images de CurseForge (l'interface n'accepte pas d'autre source) */
const cfLogo = x => { const u = x && x.logo && (x.logo.thumbnailUrl || x.logo.url); return typeof u === 'string' && /^https:\/\/media\.forgecdn\.net\//.test(u) ? u : ''; };
const tooMany = (bad, total) => bad.length > Math.max(3, Math.ceil(total * 0.2));

async function mrpack(z, p, ctx, info) {
  const idx = readJson(z, info.entry), d = idx.dependencies || {}, mc = d.minecraft; if (!mc) throw new Error('Ce modpack Modrinth n’indique pas sa version de Minecraft.');
  const loader = d['fabric-loader'] ? 'fabric' : d['quilt-loader'] ? 'quilt' : d.neoforge ? 'neoforge' : d.forge ? 'forge' : 'vanilla', lv = d.neoforge || d.forge || '';
  const i = await mkInst(ctx, idx.name, mc, loader, lv), dir = idir(i); fs.mkdirSync(dir, { recursive: true });
  const list = (idx.files || []).filter(f => !(f.env && f.env.client === 'unsupported')); let done = 0; const bad = [];
  const errs = await pool(list, 4, async f => {
    const label = path.basename(String(f.path || '?'));
    let dest; try { dest = within(dir, f.path); } catch (e) { e.fatal = true; throw e; } // chemin piégé : on arrête tout
    let ok = false, why = 'aucun lien de téléchargement';
    for (const url of f.downloads || []) { try { await mods.download(url, dest, f.hashes && f.hashes.sha1, HOSTS); ok = true; break; } catch (e) { why = e.message; } } // plusieurs liens possibles : on essaie les suivants
    if (!ok) { bad.push(label); log.warn('modpack Modrinth', label, why); }
    p({ text: 'Téléchargement des mods : ' + label, done: ++done, total: list.length });
  }, ctx);
  if (errs.length) throw errs[0];
  if (tooMany(bad, list.length)) throw new Error('Trop de fichiers du modpack n’ont pas pu être téléchargés (' + bad.length + ' sur ' + list.length + ') : ' + bad.slice(0, 5).join(', ') + '. Vérifie ta connexion puis réessaie.');
  await extract(z, info.root + 'overrides/', dir, p, 'Copie des fichiers du pack…', ctx); await extract(z, info.root + 'client-overrides/', dir, p, 'Copie des fichiers du pack…', ctx);
  await identify(i, undefined, p); await icons(i, p); if (bad.length) i.importBad = bad; return i;
}

async function curseforge(z, p, ctx, info) {
  const m = readJson(z, info.entry), ml = (m.minecraft.modLoaders || []).find(x => x.primary) || (m.minecraft.modLoaders || [])[0], id = ml ? ml.id : '';
  const loader = /^fabric/.test(id) ? 'fabric' : /^quilt/.test(id) ? 'quilt' : /^neoforge/.test(id) ? 'neoforge' : /^forge/.test(id) ? 'forge' : 'vanilla', lv = id.replace(/^(neoforge|forge|fabric|quilt)-/, '');
  if (!cf.hasKey()) throw new Error('Un modpack CurseForge demande ta clé CurseForge gratuite.'); // avant de créer quoi que ce soit
  const i = await mkInst(ctx, m.name, m.minecraft.version, loader, loader === 'forge' || loader === 'neoforge' ? lv : ''), dir = idir(i); fs.mkdirSync(dir, { recursive: true });
  const ids = (m.files || []).filter(f => f.required !== false).map(f => f.fileID); let infos = [], modsInfo = {};
  p({ text: 'Lecture de la liste des fichiers CurseForge…', done: 0, total: 1 });
  for (let k = 0; k < ids.length; k += 100) infos = infos.concat(await cf.files(ids.slice(k, k + 100)));
  const modIds = [...new Set(infos.map(f => f.modId))]; for (let k = 0; k < modIds.length; k += 100) for (const x of await cf.mods(modIds.slice(k, k + 100))) modsInfo[x.id] = x;
  let done = 0; const bad = [], added = [];
  await pool(infos, 4, async f => {
    const info2 = modsInfo[f.modId] || {}, isPack = /\.zip$/i.test(f.fileName), sub = isPack ? (info2.classId === 6552 ? 'shaderpacks' : 'resourcepacks') : 'mods', name = path.basename(f.fileName), h1 = (f.hashes || []).find(h => h.algo === 1);
    try { await mods.download(cf.fileUrl(f), within(path.join(dir, sub), name), h1 && h1.value, HOSTS); if (sub === 'mods') added.push({ pid: 'cf' + f.modId, slug: info2.slug || String(f.modId), title: info2.name || name, file: name, icon: cfLogo(info2), incompat: [], deps: (f.dependencies || []).filter(d => d.relationType === 3).map(d => 'cf' + d.modId), auto: false, src: 'cf' }); }
    catch (e) { bad.push(name); log.warn('modpack CurseForge', name, e.message); }
    p({ text: 'Téléchargement des mods : ' + name, done: ++done, total: infos.length });
  }, ctx);
  if (infos.length && tooMany(bad, infos.length)) throw new Error('Trop de fichiers du modpack n’ont pas pu être téléchargés (' + bad.length + ' sur ' + infos.length + ') : ' + bad.slice(0, 5).join(', ') + '. Vérifie ta connexion et ta clé CurseForge, puis réessaie.');
  i.mods.push(...added); await icons(i, p);
  await extract(z, info.root + (m.overrides || 'overrides') + '/', dir, p, 'Copie des fichiers du pack…', ctx); store.save(); i.importBad = bad.length ? bad : undefined; return i;
}

async function prism(z, p, ctx, info) {
  const n = names(z), root = info.root, cfg = n.find(x => /(^|\/)instance\.cfg$/.test(x) && x.startsWith(root)), pk = n.find(x => /(^|\/)mmc-pack\.json$/.test(x) && x.startsWith(root));
  const pack = pk ? JSON.parse(String(z.readAsText(pk)).replace(/^\uFEFF/, '')) : { components: [] }, c = u => (pack.components.find(x => x.uid === u) || {}).version;
  const mc = c('net.minecraft'); if (!mc) throw new Error('Version de Minecraft introuvable dans cet export.');
  const loader = c('net.fabricmc.fabric-loader') ? 'fabric' : c('org.quiltmc.quilt-loader') ? 'quilt' : c('net.neoforged') ? 'neoforge' : c('net.minecraftforge') ? 'forge' : 'vanilla', lv = c('net.neoforged') || (c('net.minecraftforge') || '').replace(/^\d+(\.\d+)*-/, '');
  const name = cfg ? ((String(z.readAsText(cfg)).match(/^name=(.*)$/m) || [])[1] || 'Instance Prism').trim() : 'Instance Prism';
  const i = await mkInst(ctx, name, mc, loader, lv), dir = idir(i); fs.mkdirSync(dir, { recursive: true });
  const gd = [root + '.minecraft/', root + 'minecraft/'].find(x => n.some(e => e.startsWith(x)));
  if (gd) await extract(z, gd, dir, p, 'Copie des fichiers…', ctx);
  await identify(i, undefined, p); await icons(i, p); return i;
}

exports.run = async (file, p = () => {}) => {
  const info = exports.inspect(file); if (!info.kind) throw new Error('Ce fichier n’est pas un modpack reconnu (.mrpack Modrinth, .zip CurseForge ou export Prism / MultiMC).');
  const ctx = { stop: false, inst: null };
  try {
    p({ text: 'Lecture du pack…', done: 0, total: 1 }); await tick();
    const z = new Zip(file), i = await (info.kind === 'mrpack' ? mrpack : info.kind === 'curseforge' ? curseforge : prism)(z, p, ctx, info);
    return { id: i.id, name: i.name, kind: info.kind, bad: i.importBad || [] };
  } catch (e) { ctx.stop = true; if (ctx.inst) { rollback(ctx); log.warn('import de modpack annulé, instance supprimée :', e.message); } throw e; }
};
exports.identify = identify;
