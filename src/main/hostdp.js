/* Data packs d'un serveur hébergé : dossier « datapacks » du monde du serveur (level-name de server.properties, « world » par défaut).
   Liste, ajout (.zip), installation depuis Modrinth, retrait, activation / désactivation (level.dat).
   Tout est refusé tant que le serveur tourne : il garde ses fichiers ouverts (sous Windows une archive chargée ne peut ni être supprimée ni remplacée) et réécrit level.dat à l'arrêt. */
const fs = require('fs'), path = require('path');
const store = require('./store'), nbt = require('./nbt'), log = require('./log');

const hosts = () => store.get().hosts || [];
const hostOf = id => { const h = hosts().find(x => x.id === id); if (!h) throw new Error('Serveur introuvable.'); return h; };
const host = () => require('./host');   // chargé à l'usage : host.js démarre des processus et dépend d'Electron
const stopped = (id, what) => { if (host().isRunning(id)) throw new Error('Arrête le serveur avant ' + (/^[aeiouyh]/i.test(what) ? 'd’' : 'de ') + what + ' des data packs.'); };
const safeName = n => { n = String(n || ''); if (!n || n !== path.basename(n) || n === '.' || n === '..' || n.startsWith('.')) throw new Error('Nom de fichier invalide.'); return n; };
const clean = n => path.basename(String(n)).replace(/[^\p{L}\p{N}_.\- +()]/gu, '_');   // lettres accentuées conservées, le reste (/, $, &…) remplacé
const icon = u => (typeof u === 'string' && u.startsWith('https://cdn.modrinth.com/') ? u : '');
const MAX_FILES = 40, MAX_SIZE = 200e6;

/** { dir, world, wd } : dossier du serveur, nom du monde et dossier « datapacks » */
function where(id) {
  const root = host().dir(id), props = host().props(id) || {}, world = String(props['level-name'] || 'world');
  if (world !== path.basename(world) || world === '.' || world === '..') throw new Error('Nom de monde invalide dans server.properties.');
  return { root, world, wd: path.join(root, world), dd: path.join(root, world, 'datapacks') };
}
const dsize = (d, depth = 0) => { let n = 0; try { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); n += e.isDirectory() ? (depth < 6 ? dsize(p, depth + 1) : 0) : fs.statSync(p).size; } } catch (e) { /* illisible */ } return n; };

/** level.dat du monde : { p, r, dp } (dp = DataPacks) ou null s'il n'existe pas encore (serveur jamais démarré) ou est illisible */
function level(wd) {
  const p = path.join(wd, 'level.dat'); if (!fs.existsSync(p)) return null;
  try { const r = nbt.parse(fs.readFileSync(p)), d = r.v.get('Data'), dp = d && d.v.get('DataPacks'); return dp ? { p, r, dp } : null; } catch (e) { log.warn('level.dat du serveur illisible', e.message); return null; }
}
const arr = (dp, k) => { const x = dp.v.get(k); return x && x.v && Array.isArray(x.v.a) ? x.v.a : []; };

exports.list = id => {
  const h = hostOf(id), { world, wd, dd } = where(id), lv = level(wd), en = lv ? arr(lv.dp, 'Enabled') : [], di = lv ? arr(lv.dp, 'Disabled') : [];
  let ents = []; try { ents = fs.readdirSync(dd, { withFileTypes: true }); } catch (e) { /* pas encore de dossier */ }
  const ex = h.extras || [];
  const packs = ents.filter(e => !e.name.startsWith('.') && (e.isDirectory() || /\.zip$/i.test(e.name))).map(e => {
    const k = 'file/' + e.name, x = ex.find(y => y.type === 'datapack' && y.file === e.name), full = path.join(dd, e.name);
    let size = 0, t = 0; try { size = e.isDirectory() ? dsize(full) : fs.statSync(full).size; t = fs.statSync(full).mtimeMs; } catch (er) { /* disparu */ }
    return { name: e.name, kind: e.isDirectory() ? 'dir' : 'zip', size, t, title: x ? x.title : e.name.replace(/\.zip$/i, ''), icon: x ? x.icon || '' : '', enabled: di.includes(k) ? false : en.includes(k) ? true : null };   // null : pas encore connu du monde (activé au prochain démarrage)
  }).sort((a, b) => a.title.localeCompare(b.title));
  return { world, running: host().isRunning(id), hasLevel: !!lv, linked: !!h.link, packs };
};

/** copie des .zip dans le monde du serveur ; { added: [noms], skipped: [{ name, why }] } */
exports.add = (id, files) => {
  stopped(id, 'ajouter'); const { dd } = where(id), r = { added: [], skipped: [] }, list = (Array.isArray(files) ? files : []).filter(f => typeof f === 'string' && path.isAbsolute(f)).slice(0, MAX_FILES);
  for (const f of list) {
    const name = clean(f);
    try {
      if (!/\.zip$/i.test(name)) throw new Error('ce n’est pas un fichier .zip');
      const st = fs.statSync(f); if (!st.isFile()) throw new Error('fichier introuvable'); if (st.size > MAX_SIZE) throw new Error('fichier trop lourd (200 Mo maximum)');
      const names = require('./drop').zipNames(f); if (!names) throw new Error('archive illisible');
      if (!names.includes('pack.mcmeta')) throw new Error('pas de pack.mcmeta à la racine : ce n’est pas un data pack');
      if (!names.some(n => n.startsWith('data/'))) throw new Error(names.some(n => n.startsWith('assets/')) ? 'c’est un pack de ressources, pas un data pack' : 'pas de dossier data/ : ce n’est pas un data pack');
      fs.mkdirSync(dd, { recursive: true }); fs.copyFileSync(f, path.join(dd, name)); r.added.push(name);
    } catch (e) { r.skipped.push({ name, why: e.message }); }
  }
  return r;
};

exports.remove = (id, name) => {
  stopped(id, 'retirer'); name = safeName(name); const h = hostOf(id), { dd } = where(id), p = path.join(dd, name);
  if (path.dirname(p) !== dd || !fs.existsSync(p)) throw new Error('Data pack introuvable.');
  fs.rmSync(p, { recursive: true, force: true }); h.extras = (h.extras || []).filter(x => !(x.type === 'datapack' && x.file === name)); store.save();
};

/** active / désactive dans level.dat (liste « Enabled » / « Disabled » de DataPacks) ; copie de sécurité level.dat.hydarium.bak */
exports.setEnabled = (id, name, on) => {
  stopped(id, on ? 'activer' : 'désactiver'); name = safeName(name); const { wd, dd } = where(id);
  if (!fs.existsSync(path.join(dd, name))) throw new Error('Data pack introuvable.');
  const lv = level(wd); if (!lv) throw new Error('Activation possible après le premier démarrage du serveur (le monde n’existe pas encore) : il s’activera tout seul à ce moment-là.');
  const mk = k => { if (!lv.dp.v.get(k)) lv.dp.v.set(k, { t: 9, v: { et: 8, a: [] } }); return lv.dp.v.get(k); }, en = mk('Enabled'), di = mk('Disabled'), k = 'file/' + name;
  fs.copyFileSync(lv.p, lv.p + '.hydarium.bak');
  if (on) { di.v.a = di.v.a.filter(x => x !== k); if (!en.v.a.includes(k)) en.v.a.push(k); } else { en.v.a = en.v.a.filter(x => x !== k); if (!di.v.a.includes(k)) di.v.a.push(k); }
  fs.writeFileSync(lv.p, nbt.write(lv.r));
};

/** copie de secours du monde : Minecraft garde level.dat_old à côté de level.dat */
exports.levelOld = id => { try { return fs.existsSync(path.join(where(id).wd, 'level.dat_old')); } catch (e) { return false; } };
exports.restoreLevelOld = id => {
  stopped(id, 'restaurer'); const { wd } = where(id), old = path.join(wd, 'level.dat_old'), cur = path.join(wd, 'level.dat');
  if (!fs.existsSync(old)) throw new Error('Aucune copie de secours (level.dat_old) trouvée.');
  if (fs.existsSync(cur)) fs.copyFileSync(cur, cur + '.hydarium.bak');   // l'actuel est gardé, au cas où
  fs.copyFileSync(old, cur);
};

/** installation depuis Modrinth pour la version de Minecraft du serveur (CurseForge : pas encore pour les serveurs) */
exports.install = async (id, pid, source) => {
  stopped(id, 'installer');
  if (source === 'curseforge' || /^cf\d+$/.test(String(pid))) throw new Error('Les data packs de serveur se téléchargent depuis Modrinth pour l’instant : choisis la source Modrinth.');
  if (!/^[A-Za-z0-9]{8}$/.test(String(pid || ''))) throw new Error('Contenu invalide.');
  const mods = require('./mods'), j = mods.fetchJson, MR = mods.MR, h = hostOf(id), { dd } = where(id), gv = `game_versions=${encodeURIComponent(JSON.stringify([h.version]))}`;
  let vs = await j(`${MR}/project/${pid}/version?${gv}&loaders=${encodeURIComponent(JSON.stringify(['datapack']))}`).catch(() => []);
  if (!vs.length) vs = await j(`${MR}/project/${pid}/version?${gv}`);
  const isZip = x => /\.zip$/i.test(x.filename), v0 = vs.find(v => (v.files || []).some(isZip));   // un projet à la fois mod et data pack propose un .jar ET un .zip : on ne prend que le .zip
  if (!v0) throw new Error('Ce projet ne propose pas de data pack (.zip) pour Minecraft ' + h.version + '.');
  const zips = v0.files.filter(isZip), f = zips.find(x => x.primary) || zips[0], p = await j(`${MR}/project/${pid}`), name = safeName(clean(f.filename));
  await mods.download(f.url, path.join(dd, name), f.hashes && f.hashes.sha1);
  h.extras = (h.extras || []).filter(x => !(x.type === 'datapack' && x.file === name)); h.extras.push({ pid, type: 'datapack', title: p.title, file: name, icon: icon(p.icon_url) }); store.save();
  return { name, title: p.title };
};
