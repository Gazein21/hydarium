/* Loaders (Fabric, Quilt), mods Modrinth, statuts, incompatibilités, codes de partage. */
const fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto');
const plat = require('./platform'), store = require('./store');
const UA = { 'User-Agent': 'Hydarium/0.1 (launcher)' }, MR = 'https://api.modrinth.com/v2';
const META = { fabric: 'https://meta.fabricmc.net/v2', quilt: 'https://meta.quiltmc.org/v3' };
const VERIFIED = new Set(JSON.parse(fs.readFileSync(path.join(__dirname, 'verified.json'), 'utf8')));
const j = async u => { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error('Service indisponible (' + r.status + '). Vérifie ta connexion.'); return r.json(); };
const isHost = id => (store.get().hosts || []).some(h => h.id === id);
const dirOf = id => path.join(plat.dataDir(), isHost(id) ? 'servers' : 'instances', id);
const find = id => { const d = store.get(), i = d.instances.find(x => x.id === id) || (d.hosts || []).find(x => x.id === id); if (!i) throw new Error('Instance introuvable.'); if (!i.mods) { i.mods = []; i.loader = i.type === 'fabric' ? 'fabric' : 'vanilla'; } return i; };

const DL_OK = ['modrinth.com', 'forgecdn.net'];
async function download(url, dest, sha1, hosts = DL_OK) {
  const h = new URL(url).hostname; if (!/^https:/.test(url) || !hosts.some(x => h === x || h.endsWith('.' + x))) throw new Error('Source de téléchargement refusée : ' + h);
  const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error('Téléchargement impossible.');
  const b = Buffer.from(await r.arrayBuffer());
  if (sha1 && crypto.createHash('sha1').update(b).digest('hex') !== sha1) throw new Error('Fichier corrompu : vérification d’intégrité échouée.');
  fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, b);
}
/* installe le profil du loader dans le dossier partagé et renvoie l’identifiant de version à lancer */
exports.loader = async (inst, send) => {
  if (inst.loader === 'forge' || inst.loader === 'neoforge') return require('./forge').ensure(inst, send);
  const base = META[inst.loader], l = await j(`${base}/versions/loader/${inst.version}`);
  if (!l.length) throw new Error(inst.loader + ' ne gère pas Minecraft ' + inst.version + '.');
  const lv = l[0].loader.version, vid = `${inst.loader}-loader-${lv}-${inst.version}`;
  const f = path.join(plat.dataDir(), 'shared', 'versions', vid, vid + '.json');
  if (!fs.existsSync(f)) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(await j(`${base}/versions/loader/${inst.version}/${lv}/profile/json`))); }
  return vid;
};
async function addMod(inst, pid, auto, depth = 0) {
  if (inst.mods.some(m => m.pid === pid)) return;
  if (depth > 3) throw new Error('Trop de dépendances imbriquées.');
  const q = `game_versions=${encodeURIComponent(JSON.stringify([inst.version]))}&loaders=${encodeURIComponent(JSON.stringify([inst.loader]))}`;
  const vs = await j(`${MR}/project/${pid}/version?${q}`);
  if (!vs.length) throw new Error('Aucune version compatible avec Minecraft ' + inst.version + ' (' + inst.loader + ').');
  const v = vs[0], file = v.files.find(f => f.primary) || v.files[0];
  const inc = v.dependencies.filter(d => d.dependency_type === 'incompatible' && d.project_id).map(d => d.project_id);
  const clash = inst.mods.find(m => inc.includes(m.pid) || (m.incompat || []).includes(pid));
  if (clash) throw new Error('Incompatible avec « ' + clash.title + ' » : ajout refusé.');
  const p = await j(`${MR}/project/${pid}`);
  if (isHost(inst.id) && p.server_side === 'unsupported') { if (auto) return; throw new Error('« ' + p.title + ' » est un mod réservé au client : il ferait planter le serveur.'); }
  for (const d of v.dependencies) if (d.dependency_type === 'required' && d.project_id) await addMod(inst, d.project_id, true, depth + 1);
  await download(file.url, path.join(dirOf(inst.id), 'mods', path.basename(file.filename)), file.hashes && file.hashes.sha1);
  inst.mods.push({ pid, slug: p.slug, title: p.title, file: path.basename(file.filename), incompat: inc, deps: v.dependencies.filter(d => d.dependency_type === 'required' && d.project_id).map(d => d.project_id), auto: !!auto, icon: (p.icon_url || '').startsWith('https://cdn.modrinth.com/') ? p.icon_url : '' });
  store.save();
}
exports.add = async (id, pid) => {
  pid = String(pid || ''); if (!/^[A-Za-z0-9_-]{2,64}$/.test(pid)) throw new Error('Mod invalide.');
  const i = find(id); if (i.loader === 'vanilla') throw new Error('Choisis Fabric ou Quilt pour ajouter des mods.');
  if (!/^[A-Za-z0-9]{8}$/.test(pid) || i.mods.some(m => m.slug === pid)) pid = (await j(`${MR}/project/${pid}`)).id; // identifiant ou nom court (« sodium »)
  await addMod(i, pid, false);
};
const sha1 = f => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
const fileOf = (id, m) => path.join(dirOf(id), 'mods', m.file + (m.disabled ? '.disabled' : ''));
/* retrouve les dépendances des mods ajoutés avant qu’on les enregistre (empreinte du fichier → Modrinth) */
async function ensureDeps(i) {
  for (const m of i.mods) if (!m.deps) {
    m.deps = [];
    if (/^imp/.test(m.pid)) continue;
    try { const v = await j(`${MR}/version_file/${sha1(fileOf(i.id, m))}?algorithm=sha1`); m.deps = v.dependencies.filter(d => d.dependency_type === 'required' && d.project_id).map(d => d.project_id); } catch (e) { m.deps = []; }
  }
  store.save();
}
function setOff(i, m, off) {
  const on = path.join(dirOf(i.id), 'mods', m.file), dis = on + '.disabled';
  if (off) { if (fs.existsSync(on)) fs.renameSync(on, dis); } else if (fs.existsSync(dis)) fs.renameSync(dis, on);
  m.disabled = off;
}
/* mods qui ont besoin de pid (directement ou non) */
const dependents = (i, pid) => { const out = new Set(); const walk = p => { for (const x of i.mods) if (!out.has(x.pid) && x.pid !== pid && (x.deps || []).includes(p)) { out.add(x.pid); walk(x.pid); } }; walk(pid); return i.mods.filter(x => out.has(x.pid)); };
exports.dependents = async (id, pid) => { const i = find(id); await ensureDeps(i); return dependents(i, pid).map(m => m.title); };
/* activer / désactiver, avec les mods liés : désactiver Sodium désactive aussi Iris ; activer Iris réactive Sodium. dry = juste la liste */
exports.toggle = async (id, pid, dry) => {
  const i = find(id), m = i.mods.find(x => x.pid === pid); if (!m) return { also: [] };
  await ensureDeps(i); let also;
  if (!m.disabled) { also = dependents(i, pid).filter(x => !x.disabled); if (dry) return { action: 'off', also: also.map(x => x.title) }; setOff(i, m, true); also.forEach(x => setOff(i, x, true)); }
  else {
    const need = new Map(), walk = x => { for (const d of x.deps || []) { const y = i.mods.find(k => k.pid === d); if (y && y.disabled && !need.has(y.pid)) { need.set(y.pid, y); walk(y); } } }; walk(m);
    also = [...need.values()]; if (dry) return { action: 'on', also: also.map(x => x.title) }; setOff(i, m, false); also.forEach(x => setOff(i, x, false));
  }
  store.save(); return { also: also.map(x => x.title) };
};
const post = async (u, body) => { const r = await fetch(u, { method: 'POST', headers: { ...UA, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error('Service indisponible (' + r.status + ').'); return r.json(); };
/* mises à jour : Modrinth compare l’empreinte de chaque fichier avec la dernière version compatible */
exports.checkUpdates = async id => {
  const i = find(id), cand = i.mods.filter(m => !/^imp/.test(m.pid) && fs.existsSync(fileOf(id, m))); if (!cand.length) return [];
  const h = Object.fromEntries(cand.map(m => [sha1(fileOf(id, m)), m]));
  const r = await post(`${MR}/version_files/update`, { hashes: Object.keys(h), algorithm: 'sha1', loaders: [i.loader], game_versions: [i.version] }), out = [];
  for (const [hash, v] of Object.entries(r || {})) { const f = v.files.find(x => x.primary) || v.files[0]; if (f && f.hashes.sha1 !== hash) out.push({ pid: h[hash].pid, title: h[hash].title, from: h[hash].file, to: f.filename, version: v.version_number }); }
  return out;
};
exports.updateMod = async (id, pid) => {
  const i = find(id), m = i.mods.find(x => x.pid === pid); if (!m) throw new Error('Mod introuvable.');
  const q = `game_versions=${encodeURIComponent(JSON.stringify([i.version]))}&loaders=${encodeURIComponent(JSON.stringify([i.loader]))}`, vs = await j(`${MR}/project/${pid}/version?${q}`);
  if (!vs.length) throw new Error('Aucune version compatible.'); const v = vs[0], f = v.files.find(x => x.primary) || v.files[0], name = path.basename(f.filename);
  await download(f.url, path.join(dirOf(id), 'mods', name + (m.disabled ? '.disabled' : '')), f.hashes && f.hashes.sha1);
  if (name !== m.file) { fs.rmSync(fileOf(id, m), { force: true }); m.file = name; }
  m.deps = v.dependencies.filter(d => d.dependency_type === 'required' && d.project_id).map(d => d.project_id);
  for (const d of m.deps) if (!i.mods.some(x => x.pid === d)) { try { await addMod(i, d, true, 1); } catch (e) {} }
  store.save();
};
exports.enableAll = id => { const i = find(id); i.mods.forEach(m => { if (m.disabled) setOff(i, m, false); }); store.save(); };
exports.disableAll = id => { const i = find(id); i.mods.forEach(m => { if (!m.disabled) setOff(i, m, true); }); store.save(); };
/* sélection multiple : action = 'off' (désactiver), 'on' (activer) ou 'remove' (retirer). dry = ne change rien, renvoie seulement les mods liés touchés en plus.
   off : les mods qui dépendent de la sélection sont désactivés aussi ; on : les dépendances désactivées sont réactivées ; remove : les mods liés ne sont retirés que si cascade = true. */
exports.batch = async (id, pids, action, o = {}) => {
  if (!['off', 'on', 'remove'].includes(action)) throw new Error('Action inconnue.');
  const i = find(id); await ensureDeps(i);
  const want = new Set((pids || []).map(String)), sel = new Map(i.mods.filter(m => want.has(m.pid)).map(m => [m.pid, m])), extra = new Map();
  if (!sel.size) return { also: [], n: 0 };
  if (action === 'on') {
    const walk = x => { for (const d of x.deps || []) { const y = i.mods.find(k => k.pid === d); if (y && y.disabled && !sel.has(y.pid) && !extra.has(y.pid)) { extra.set(y.pid, y); walk(y); } } };
    for (const m of sel.values()) walk(m);
  } else {
    for (const m of sel.values()) for (const x of dependents(i, m.pid)) if (!sel.has(x.pid) && (action === 'remove' || !x.disabled)) extra.set(x.pid, x);
  }
  const also = [...extra.values()].map(x => x.title);
  if (o.dry) return { also, n: sel.size };
  const all = [...sel.values(), ...(action === 'remove' && !o.cascade ? [] : [...extra.values()])];
  if (action === 'remove') all.forEach(m => exports.removeOne(i, m)); else all.forEach(m => setOff(i, m, action === 'off'));
  store.save(); return { also, n: all.length };
};
exports.importFile = (id, src) => {
  const i = find(id); if (!/\.jar$/i.test(src)) throw new Error('Choisis un fichier .jar.');
  const f = path.basename(src).replace(/[^\w.\- +()]/g, '_'), d = path.join(dirOf(id), 'mods'); fs.mkdirSync(d, { recursive: true });
  fs.copyFileSync(src, path.join(d, f));
  const pid = 'imp' + crypto.createHash('sha1').update(f).digest('hex').slice(0, 8);
  if (!i.mods.some(m => m.pid === pid)) i.mods.push({ pid, slug: f.toLowerCase().replace(/\.jar$/, ''), title: f.replace(/\.jar$/i, ''), file: f, incompat: [], auto: false });
  store.save();
};
exports.post = (u, b) => post(u, b); exports.find = find; exports.dirOf = dirOf; exports.fetchJson = j; exports.download = download; exports.VERIFIED = VERIFIED; exports.MR = MR;
exports.remove = async (id, pid, cascade) => { const i = find(id), m = i.mods.find(x => x.pid === pid); if (!m) return; if (cascade) { await ensureDeps(i); for (const x of dependents(i, pid)) exports.removeOne(i, x); } try { fs.rmSync(path.join(dirOf(id), 'mods', m.file), { force: true }); fs.rmSync(path.join(dirOf(id), 'mods', m.file + '.disabled'), { force: true }); } catch (e) {} i.mods = i.mods.filter(x => x.pid !== pid); store.save(); };
exports.removeOne = (i, m) => { try { fs.rmSync(path.join(dirOf(i.id), 'mods', m.file), { force: true }); fs.rmSync(path.join(dirOf(i.id), 'mods', m.file + '.disabled'), { force: true }); } catch (e) {} i.mods = i.mods.filter(x => x.pid !== m.pid); };
/* retire TOUS les mods d’une instance ou d’un serveur (actifs et désactivés) : fichiers + liste. Le mod Hydarium n’est pas dans cette liste (il est chargé à part), il reste donc en place. */
exports.removeAll = id => {
  const i = find(id), n = i.mods.length;
  for (const m of [...i.mods]) exports.removeOne(i, m);
  i.mods = []; store.save(); return n;
};
/* compatibilité (loader + version de Minecraft) d’une liste de mods Modrinth : même requête que l’ajout, donc « vrai » = l’ajout marchera.
   Résultat par nom court : true / false, ou null si Modrinth n’a pas répondu (inconnu). Mis en cache pour la session. */
const compatCache = new Map();
exports.compat = async (slugs, loader, version) => {
  const out = {}; if (!['fabric', 'quilt', 'forge', 'neoforge'].includes(loader) || !/^[\w.+-]{1,32}$/.test(String(version || ''))) return out;
  const list = [...new Set((slugs || []).map(String))].filter(s => /^[A-Za-z0-9_-]{2,64}$/.test(s)).slice(0, 60);
  const q = `game_versions=${encodeURIComponent(JSON.stringify([version]))}&loaders=${encodeURIComponent(JSON.stringify([loader]))}`; let k = 0;
  const run = async () => {
    while (k < list.length) {
      const s = list[k++], key = `${s}|${loader}|${version}`;
      if (compatCache.has(key)) { out[s] = compatCache.get(key); continue; }
      try { const vs = await j(`${MR}/project/${s}/version?${q}`); out[s] = vs.length > 0; compatCache.set(key, out[s]); }
      catch (e) { if (/\(404\)/.test(e.message)) { out[s] = false; compatCache.set(key, false); } else out[s] = null; }
    }
  };
  await Promise.all(Array.from({ length: 6 }, run));
  return out;
};
exports.search = async (id, q) => {
  const i = find(id); if (i.loader === 'vanilla') throw new Error('Choisis Fabric ou Quilt pour ajouter des mods.');
  const f = encodeURIComponent(JSON.stringify([['project_type:mod'], ['versions:' + i.version], ['categories:' + i.loader]]));
  const r = await j(`${MR}/search?query=${encodeURIComponent(q || '')}&limit=15&index=downloads&facets=${f}`);
  return r.hits.map(h => ({ pid: h.project_id, slug: h.slug, title: h.title, desc: h.description, ok: VERIFIED.has(h.slug) }));
};
/* statuts : ok (vérifié), trusted (approuvé par toi), cf (CurseForge, pas encore contrôlé), unverified, missing ; conflits = incompatibilités bloquantes */
exports.status = id => {
  const i = find(id), conflicts = [];
  const mods = i.mods.map(m => ({ ...m, status: !fs.existsSync(path.join(dirOf(id), 'mods', m.file + (m.disabled ? '.disabled' : ''))) ? 'missing' : m.trusted ? 'trusted' : VERIFIED.has(m.slug) ? 'ok' : m.src === 'cf' ? 'cf' : 'unverified' }));
  for (const a of i.mods.filter(x => !x.disabled)) for (const b of i.mods.filter(x => !x.disabled)) if ((a.incompat || []).includes(b.pid)) conflicts.push({ a: a.title, b: b.title, fix: b.pid });
  return { inst: i, mods, conflicts };
};
/* « faire confiance » à un mod : plus d’avertissement « non vérifié » pour lui au lancement */
exports.trust = (id, pid, on) => { const i = find(id), m = i.mods.find(x => x.pid === pid); if (!m) throw new Error('Mod introuvable.'); if (on) m.trusted = true; else delete m.trusted; store.save(); };
/* code de partage : pas de fichier, seulement version + loader + liste de mods (code court = serveur, plus tard) */
exports.code = id => { const i = find(id); return 'HYD1.' + zlib.deflateSync(JSON.stringify({ v: i.version, t: i.type, l: i.loader, m: i.mods.filter(m => !m.auto).map(m => m.pid) })).toString('base64url'); };
exports.importCode = async code => {
  code = String(code).trim();
  if (!/^HYD1\.[\w-]{1,20000}$/.test(code)) throw new Error('Code de modpack invalide.');
  let d; try { d = JSON.parse(zlib.inflateSync(Buffer.from(code.slice(5), 'base64url'), { maxOutputLength: 100000 }).toString()); } catch (e) { throw new Error('Code de modpack illisible.'); }
  if (typeof d.v !== 'string' || !['vanilla', 'fabric', 'quilt'].includes(d.l) || !Array.isArray(d.m) || d.m.length > 200 || !d.m.every(x => /^[A-Za-z0-9]{8}$/.test(x))) throw new Error('Code de modpack invalide.');
  const inst = store.addInstance({ name: 'Pack importé', version: d.v, type: d.t === 'snapshot' ? 'snapshot' : 'release', loader: d.l }), failed = [];
  for (const pid of d.m) { try { await addMod(inst, pid, false); } catch (e) { failed.push(pid); } }
  return { inst, failed };
};
