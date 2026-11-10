/* Contenu d’une instance : recherche Modrinth (mods, packs de ressources, shaders), packs, mondes, options du jeu. */
const fs = require('fs'), path = require('path');
const mods = require('./mods'), store = require('./store');
const { fetchJson: j, download, VERIFIED, MR, find, dirOf } = mods;
const nbt = require('./nbt'), game = require('./game');
const cf = require('./curseforge'), DL_OK2 = ['modrinth.com', 'forgecdn.net'];
const FOLDER = { mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks', datapack: 'datapacks', plugin: 'plugins' };
const LOADERS = ['vanilla', 'fabric', 'quilt', 'forge', 'neoforge'];
const safeName = n => { n = String(n || ''); if (!n || n !== path.basename(n) || n === '.' || n === '..') throw new Error('Nom de fichier invalide.'); return n; };
const icon = u => (typeof u === 'string' && u.startsWith('https://cdn.modrinth.com/') ? u : '');

function ctxOf(c) {
  if (c && c.id) { const i = find(c.id); return { inst: i, version: i.version, loader: i.loader }; }
  if (!c || !/^[\w.\-+ ]{1,32}$/.test(c.version || '') || !LOADERS.includes(c.loader)) throw new Error('Version ou loader invalide.');
  return { inst: null, version: c.version, loader: c.loader };
}
/* Recherche « Modrinth d'abord » : CurseForge ne sert qu'en complément (peu ou pas de résultats sur Modrinth, ou Modrinth injoignable) et seulement si une clé CurseForge est enregistrée.
   Les résultats CurseForge gardent leur source (src: 'curseforge') : l'installation sait donc où aller les chercher. Pas dans l'écran de création d'instance (ses mods sont des noms Modrinth). */
const normT = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
exports.search = async (ctx, type, q, offset, source, sort) => {
  if (type === 'modpack' || type === 'map') return require('./packs').search(type, q, offset, source, sort);
  const c0 = ctxOf(ctx), canCf = cf.hasKey() && !!c0.inst && source !== 'curseforge';
  let r;
  try { r = await searchOne(ctx, type, q, offset, source, sort); }
  catch (e) { if (!canCf) throw e; r = null; }                       // Modrinth en panne : on tente CurseForge
  if (!canCf || (+offset || 0) > 0) return r;
  if (r && (r.hits.length >= 10 || !String(q || '').trim())) return r;  // assez de résultats (ou simple liste des populaires) : Modrinth suffit
  try {
    const x = await searchOne(ctx, type, q, 0, 'curseforge', sort), seen = new Set((r ? r.hits : []).flatMap(h => [normT(h.title), normT(h.slug)]));
    const add = x.hits.filter(h => !seen.has(normT(h.title)) && !seen.has(normT(h.slug)));
    const hits = [...(r ? r.hits : []), ...add]; return { total: hits.length, hits, merged: add.length };
  } catch (e) { if (r) return r; throw e; }
};
async function searchOne(ctx, type, q, offset, source, sort) {
  if (!FOLDER[type]) throw new Error('Type inconnu.');
  const c = ctxOf(ctx);
  if (source === 'curseforge') { const r = await cf.search({ type, q, version: c.version, loader: c.loader, offset, sort }); r.hits.forEach(h => { h.ok = VERIFIED.has(h.slug); }); const have = c.inst ? new Set([...(c.inst.mods || []).map(m => m.pid), ...(c.inst.extras || []).filter(m => !m.world).map(m => m.pid)]) : new Set(); r.hits.forEach(h => { h.installed = have.has(h.pid); }); return r; }
  const facets = [['project_type:' + (type === 'plugin' ? 'mod' : type)], ['versions:' + c.version]];
  if (c.inst && type === 'mod' && /^[a-z0-9]+$/.test(c.inst.id) && !c.inst.lastPlayed && c.inst.port) facets.push(['server_side:required', 'server_side:optional']); // serveur : pas de mods client
  if (type === 'plugin') facets.push(['categories:paper', 'categories:spigot', 'categories:bukkit', 'categories:purpur']);
  if (type === 'datapack') { /* aucun loader requis */ }
  if (type === 'mod') { if (c.loader === 'vanilla') throw new Error('Choisis Fabric ou Quilt pour ajouter des mods.'); facets.push(['categories:' + c.loader]); }
  q = String(q || '').slice(0, 80); offset = Math.max(0, Math.min(+offset || 0, 500));
  const IDX = { downloads: 'downloads', updated: 'updated', newest: 'newest', follows: 'follows' }, r = await j(`${MR}/search?query=${encodeURIComponent(q)}&limit=20&offset=${offset}&index=${IDX[sort] || (q ? 'relevance' : 'downloads')}&facets=${encodeURIComponent(JSON.stringify(facets))}`);
  const have = c.inst ? new Set([...c.inst.mods.map(m => m.pid), ...(c.inst.extras || []).filter(m => !m.world).map(m => m.pid)]) : new Set();
  return { total: r.total_hits, hits: r.hits.map(h => ({ pid: h.project_id, slug: h.slug, title: h.title, desc: h.description, icon: icon(h.icon_url), author: h.author, downloads: h.downloads, ok: VERIFIED.has(h.slug), installed: have.has(h.project_id) })) };
}
exports.install = async (id, type, pid, world, source) => {
  if (type === 'modpack' || type === 'map') return require('./packs').install(type, pid, source, id);
  if (source === 'curseforge' || /^cf\d+$/.test(String(pid))) return cfInstall(id, type, String(pid).replace(/^cf/, ''), world);
  if (type === 'mod') return mods.add(id, pid);
  if (!FOLDER[type] || !/^[A-Za-z0-9]{8}$/.test(pid)) throw new Error('Contenu invalide.');
  const i = find(id); if (type === 'datapack') { world = safeName(world); if (world !== '__next__' && !fs.existsSync(path.join(dirOf(id), 'saves', world))) throw new Error('Monde introuvable.'); } i.extras = i.extras || [];
  if (world === '__next__') pruneNext(id); // anciennes entrées « prochain monde » dont le fichier a disparu (monde créé, annulé…)
  if (type !== 'resourcepack' && i.extras.some(x => x.pid === pid && x.world === world)) return;
  const gv = `game_versions=${encodeURIComponent(JSON.stringify([i.version]))}`;
  let vs = type === 'datapack' ? await j(`${MR}/project/${pid}/version?${gv}&loaders=${encodeURIComponent(JSON.stringify(['datapack']))}`).catch(() => []) : [];
  if (!vs.length) vs = await j(`${MR}/project/${pid}/version?${gv}`);
  if (!vs.length) throw new Error('Aucune version compatible avec Minecraft ' + i.version + '.');
  const isZip = x => /\.zip$/i.test(x.filename), isJar = x => /\.jar$/i.test(x.filename);
  const v0 = type === 'datapack' ? vs.find(v => v.files.some(isZip)) : vs[0]; // un projet à la fois mod et data pack propose un .jar ET un .zip : on ne prend que le .zip
  if (!v0) throw new Error('Ce projet ne propose pas de data pack (.zip) pour Minecraft ' + i.version + '.');
  const zips = v0.files.filter(isZip), jars = v0.files.filter(isJar);
  const f = type === 'datapack' ? (zips.find(x => x.primary) || zips[0]) : type === 'plugin' ? (jars.find(x => x.primary) || jars[0] || v0.files[0]) : (zips.find(x => x.primary) || zips[0] || v0.files.find(x => x.primary) || v0.files[0]);
  const p = await j(`${MR}/project/${pid}`), name = safeName(path.basename(f.filename));
  const wres = type === 'resourcepack' && world && world !== '__next__'; if (wres) world = safeName(world);
  const dest = wres ? path.join(dirOf(id), 'saves', world, 'resources.zip') : type === 'datapack' ? path.join(dpDir(id, world), name) : path.join(dirOf(id), FOLDER[type], name);
  if (wres && !fs.existsSync(path.dirname(dest))) throw new Error('Monde introuvable.');
  await download(f.url, dest, f.hashes && f.hashes.sha1);
  if (wres) i.extras = i.extras.filter(x => !(x.type === 'resourcepack' && x.world === world));
  i.extras.push({ pid, type, title: p.title, file: wres ? 'resources.zip' : name, icon: icon(p.icon_url), ...(world ? { world } : {}) }); store.save();
  if (type === 'datapack') afterDp(id, world, name);
};

/* ----- options.txt et Iris ----- */
const optFile = id => path.join(dirOf(id), 'options.txt');
const readLines = f => { try { return fs.readFileSync(f, 'utf8').split(/\r?\n/); } catch (e) { return []; } };
const getKey = (lines, k) => { const l = lines.find(x => x.startsWith(k + ':')); return l === undefined ? undefined : l.slice(k.length + 1); };
function setKeys(f, ch, old) {
  const lines = readLines(f).filter((l, n, a) => l !== '' || n < a.length - 1);
  for (const [k, v] of Object.entries(ch)) { const n = lines.findIndex(x => x.startsWith(k + ':')); n >= 0 ? (lines[n] = k + ':' + v) : lines.push(k + ':' + v); }
  if (!old && !lines.some(l => l.startsWith('version:'))) lines.unshift('version:9999'); // sans ligne « version », le jeu applique d’anciens correctifs qui peuvent modifier ou ignorer nos réglages (versions 1.13+ ; les vieilles versions n’ont pas cette ligne)
  fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, lines.join('\n') + '\n');
}
/* Minecraft ≤ 1.12 (LWJGL 2) : options.txt n’a pas le même format qu’en 1.13+ :
   - touches : « key_key.forward:17 » (code LWJGL2 numérique) et non « key.keyboard.w » ;
   - langue : « fr_FR » (région en majuscules) jusqu’en 1.10, « fr_fr » à partir de 1.11 ;
   - pas de ligne « version ». */
const minorOf = v => +(String(v || '').match(/^1\.(\d+)/) || [0, 99])[1], isOld = v => minorOf(v) <= 12;
const LW = { a: 30, b: 48, c: 46, d: 32, e: 18, f: 33, g: 34, h: 35, i: 23, j: 36, k: 37, l: 38, m: 50, n: 49, o: 24, p: 25, q: 16, r: 19, s: 31, t: 20, u: 22, v: 47, w: 17, x: 45, y: 21, z: 44,
  '0': 11, '1': 2, '2': 3, '3': 4, '4': 5, '5': 6, '6': 7, '7': 8, '8': 9, '9': 10, space: 57, 'left.shift': 42, 'right.shift': 54, 'left.control': 29, 'right.control': 157, 'left.alt': 56, 'right.alt': 184,
  tab: 15, enter: 28, escape: 1, backspace: 14, slash: 53, period: 52, comma: 51, semicolon: 39, apostrophe: 40, minus: 12, equal: 13, backslash: 43, 'left.bracket': 26, 'right.bracket': 27, 'grave.accent': 41, 'caps.lock': 58,
  up: 200, down: 208, left: 203, right: 205, insert: 210, delete: 211, home: 199, end: 207, 'page.up': 201, 'page.down': 209 };
for (let n = 1; n <= 10; n++) LW['f' + n] = 58 + n; // F1–F10 = 59–68
LW.f11 = 87; LW.f12 = 88;
function oldKey(v) { // « key.keyboard.w » / « key.mouse.left » → code LWJGL2 (souris : -100 = gauche, -99 = droit, -98 = milieu…)
  const m = String(v).match(/^key\.(?:keyboard\.(.+)|mouse\.(left|right|middle|\d))$/); if (!m) return null;
  if (m[1]) return LW[m[1]] === undefined ? null : LW[m[1]];
  return m[2] === 'left' ? -100 : m[2] === 'right' ? -99 : m[2] === 'middle' ? -98 : -100 + (+m[2] - 1);
}
const langFor = (ver, l) => { const m = String(l || '').match(/^([a-z]{2})_([a-z]{2})$/i); if (!m) return null; return m[1].toLowerCase() + '_' + (minorOf(ver) <= 10 ? m[2].toUpperCase() : m[2].toLowerCase()); };
const OLD_ONLY_SKIP = new Set(['swapOffhand', 'advancements']); // n’existent pas avant 1.9 / 1.12
const OPT = { renderDistance: [2, 32], maxFps: [10, 260], guiScale: [0, 4] }, BOOL = ['fullscreen', 'enableVsync', 'entityShadows', 'viewBobbing', 'pauseOnLostFocus', 'toggleSprint', 'toggleCrouch'], FLT = { fov: [-1, 1], gamma: [0, 1], mouseSensitivity: [0, 1], soundCategory_music: [0, 1] }, KEYRE = /^key\.(keyboard\.[a-z0-9._]+|mouse\.(left|right|middle|\d))$/, KEYS = ['forward', 'left', 'back', 'right', 'jump', 'sneak', 'sprint', 'inventory', 'drop', 'swapOffhand', 'chat', 'command', 'playerlist', 'screenshot', 'togglePerspective', 'fullscreen', 'use', 'attack', 'pickItem', 'advancements'];
exports.optGet = id => {
  find(id); const L = readLines(optFile(id)), o = { exists: L.length > 0 };
  for (const k of [...Object.keys(OPT), ...Object.keys(FLT), ...BOOL, 'lang', 'soundCategory_master']) o[k] = getKey(L, k);
  return o;
};
exports.optSet = (id, o) => {
  const inst = find(id), old = isOld(inst.version), ch = {};
  for (const [k, v] of Object.entries(o || {})) {
    if (OPT[k]) { const n = Math.round(+v); if (n >= OPT[k][0] && n <= OPT[k][1]) ch[k] = n; }
    else if (BOOL.includes(k)) { if (old && (k === 'toggleSprint' || k === 'toggleCrouch')) continue; /* ces options n’existent pas avant 1.13 */ ch[k] = v === true || v === 'true' ? 'true' : 'false'; }
    else if (FLT[k]) { const n = +v; if (Number.isFinite(n) && n >= FLT[k][0] && n <= FLT[k][1]) ch[k] = n.toFixed(2); }
    else if (/^key_key\./.test(k) && KEYS.includes(k.slice(8)) && KEYRE.test(String(v))) {
      if (!old) ch[k] = v;
      else if (!OLD_ONLY_SKIP.has(k.slice(8))) { const c = oldKey(v); if (c !== null) ch[k] = c; } // 1.8.9 : « key_key.forward:17 »
    }
    else if (k === 'lang') { const l = langFor(inst.version, v); if (l) ch[k] = l; }
    else if (k === 'soundCategory_master' && +v >= 0 && +v <= 1) ch[k] = (+v).toFixed(2);
  }
  setKeys(optFile(id), ch, old);
};
const irisFile = id => path.join(dirOf(id), 'config', 'iris.properties');
function activeOf(id, type) {
  if (type === 'resourcepack') { try { return JSON.parse(getKey(readLines(optFile(id)), 'resourcePacks') || '[]').filter(x => x.startsWith('file/')).map(x => x.slice(5)); } catch (e) { return []; } }
  const l = readLines(irisFile(id)).find(x => x.startsWith('shaderPack=')), on = readLines(irisFile(id)).some(x => x.trim() === 'enableShaders=true');
  return l && on ? [l.slice(11).trim()] : [];
}
exports.list = (id, type) => {
  const i = find(id), d = path.join(dirOf(id), FOLDER[type] || 'x'); if (!FOLDER[type] || type === 'mod' || type === 'datapack') return [];
  let names = []; try { names = fs.readdirSync(d); } catch (e) {}
  const act = activeOf(id, type), ex = i.extras || [];
  return names.filter(n => !n.startsWith('.')).map(n => { const t = fs.statSync(path.join(d, n)), e = ex.find(x => x.file === n); return { name: n, size: t.isDirectory() ? 0 : t.size, mtime: t.mtimeMs, enabled: act.includes(n), title: e ? e.title : n.replace(/\.zip$/i, ''), icon: e ? e.icon : '' }; }).sort((a, b) => b.enabled - a.enabled || a.title.localeCompare(b.title));
};
exports.toggle = (id, type, name) => {
  find(id); name = safeName(name);
  if (type === 'resourcepack') {
    const f = optFile(id); let a = []; try { a = JSON.parse(getKey(readLines(f), 'resourcePacks') || '[]'); } catch (e) {}
    if (!a.length) a = ['vanilla'];
    const k = 'file/' + name; a = a.includes(k) ? a.filter(x => x !== k) : [...a, k]; setKeys(f, { resourcePacks: JSON.stringify(a) });
  } else if (type === 'shader') {
    const f = irisFile(id), on = activeOf(id, 'shader').includes(name), L = readLines(f).filter(x => x && !x.startsWith('shaderPack=') && !x.startsWith('enableShaders='));
    if (!on) L.push('shaderPack=' + name, 'enableShaders=true'); else L.push('enableShaders=false');
    fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, L.join('\n') + '\n');
  }
};
exports.remove = (id, type, name) => {
  const i = find(id); name = safeName(name); if (!FOLDER[type] || type === 'mod') return;
  if (activeOf(id, type).includes(name)) exports.toggle(id, type, name);
  fs.rmSync(path.join(dirOf(id), FOLDER[type], name), { recursive: true, force: true });
  i.extras = (i.extras || []).filter(x => x.file !== name); store.save();
};
exports.importFiles = (id, type, files) => {
  find(id); if (!FOLDER[type] || type === 'mod') return 0; const d = path.join(dirOf(id), FOLDER[type]); fs.mkdirSync(d, { recursive: true }); let n = 0;
  for (const p of files) { if (!/\.zip$/i.test(p)) continue; fs.copyFileSync(p, path.join(d, path.basename(p).replace(/[^\w.\- +()]/g, '_'))); n++; }
  return n;
};

/* ----- mondes ----- */
const savesDir = id => path.join(dirOf(id), 'saves');
exports.worlds = id => {
  find(id); let names = []; try { names = fs.readdirSync(savesDir(id)); } catch (e) {}
  return names.map(n => { const p = path.join(savesDir(id), n); try { const t = fs.statSync(p); if (!t.isDirectory()) return null; let ic = ''; try { const b = fs.readFileSync(path.join(p, 'icon.png')); if (b.length < 200000) ic = 'data:image/png;base64,' + b.toString('base64'); } catch (e) {} return { folder: n, mtime: t.mtimeMs, icon: ic, valid: fs.existsSync(path.join(p, 'level.dat')) }; } catch (e) { return null; } }).filter(Boolean).sort((a, b) => b.mtime - a.mtime);
};
const uniq = (d, n) => { let t = n, k = 2; while (fs.existsSync(path.join(d, t))) t = n + ' (' + k++ + ')'; return t; };
exports.worldOp = (id, folder, op) => {
  find(id); folder = safeName(folder); const src = path.join(savesDir(id), folder); if (!fs.existsSync(src)) throw new Error('Monde introuvable.');
  if (op === 'delete') return fs.rmSync(src, { recursive: true, force: true });
  if (op === 'dup') { fs.cpSync(src, path.join(savesDir(id), uniq(savesDir(id), folder + ' (copie)')), { recursive: true }); return; }
  if (op === 'backup') { const b = path.join(dirOf(id), 'backups'); fs.mkdirSync(b, { recursive: true }); fs.cpSync(src, path.join(b, folder + ' ' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')), { recursive: true }); return; }
  throw new Error('Action inconnue.');
};
/* Exporter un monde d'une instance vers une autre : copie complète du dossier (données, data packs, resources.zip…), sans « session.lock ».
   La copie est faite dans un dossier temporaire de l'instance de destination puis renommée : un échec ne laisse jamais un monde à moitié copié dans « saves ». */
const verParts = v => { const m = /^(\d+)\.(\d+)(?:\.(\d+))?$/.exec(String(v || '')); return m ? [+m[1], +m[2], +(m[3] || 0)] : null; };
const verNewer = (a, b) => { const x = verParts(a), y = verParts(b); if (!x || !y) return false; for (let k = 0; k < 3; k++) if (x[k] !== y[k]) return x[k] > y[k]; return false; };
exports.worldExport = (srcId, folder, dstId) => {
  const A = find(srcId), B = find(dstId); folder = safeName(folder);
  if (A.id === B.id) throw new Error('Choisis une autre instance : pour copier dans la même instance, utilise « Dupliquer ».');
  const src = path.join(savesDir(srcId), folder);
  if (!fs.existsSync(src) || !fs.statSync(src).isDirectory()) throw new Error('Monde introuvable.');
  if (!fs.existsSync(path.join(src, 'level.dat'))) throw new Error('Ce dossier n’est pas un monde utilisable (level.dat absent) : ouvre-le une fois dans le jeu.');
  let cur = null; try { cur = require('./session').current(); } catch (e) {}
  if (cur && (cur.id === A.id || cur.id === B.id)) throw new Error('Ferme Minecraft : l’instance « ' + (cur.id === A.id ? A.name : B.name) + ' » est en cours de jeu, le monde pourrait être copié à moitié écrit.');
  const dst = savesDir(dstId); fs.mkdirSync(dst, { recursive: true });
  const name = uniq(dst, folder), tmp = path.join(dirOf(dstId), '.hydarium-export-' + Date.now());
  try {
    fs.cpSync(src, tmp, { recursive: true, dereference: true, filter: p => path.basename(p) !== 'session.lock' });
    fs.renameSync(tmp, path.join(dst, name));
  } catch (e) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e2) {} throw new Error('Copie impossible : ' + e.message); }
  const warn = [];
  let v = ''; try { v = exports.worldInfo(srcId, folder).version; } catch (e) {}
  if (v && verNewer(v, B.version)) warn.push('Ce monde a été enregistré avec Minecraft ' + v + ', plus récent que l’instance « ' + B.name + ' » (' + B.version + ') : le jeu refusera de l’ouvrir ou risque de l’abîmer. Utilise plutôt une instance en ' + v + ' ou plus.');
  if ((A.mods || []).length && !(B.mods || []).length) warn.push('L’instance d’origine a des mods : si le monde utilise leurs blocs ou objets, ajoute les mêmes mods à « ' + B.name + ' ».');
  return { name, warn: warn.join(' ') };
};
exports.worldImport = (id, src) => {
  find(id); const dst = savesDir(id); fs.mkdirSync(dst, { recursive: true });
  if (fs.statSync(src).isDirectory()) {
    if (!fs.existsSync(path.join(src, 'level.dat'))) throw new Error('Ce dossier n’est pas un monde Minecraft (level.dat absent).');
    return fs.cpSync(src, path.join(dst, uniq(dst, path.basename(src))), { recursive: true });
  }
  const Zip = require('adm-zip'), z = new Zip(src), es = z.getEntries().filter(e => !e.entryName.startsWith('__MACOSX'));
  const lv = es.find(e => /(^|\/)level\.dat$/.test(e.entryName)); if (!lv) throw new Error('Ce zip ne contient pas de monde Minecraft.');
  const root = lv.entryName.replace(/level\.dat$/, ''), name = uniq(dst, (root.replace(/\/$/, '').split('/').pop() || path.basename(src, '.zip')).replace(/[^\w.\- ()]/g, '_')), out = path.join(dst, name);
  for (const e of es) {
    if (e.isDirectory || !e.entryName.startsWith(root)) continue;
    const t = path.resolve(out, e.entryName.slice(root.length)); if (!t.startsWith(out + path.sep)) continue; // protège contre les chemins piégés
    fs.mkdirSync(path.dirname(t), { recursive: true }); fs.writeFileSync(t, e.getData());
  }
};

/* ----- paramètres d’un monde (level.dat) et data packs ----- */
const RULES = ['keepInventory', 'doDaylightCycle', 'doWeatherCycle', 'doMobSpawning', 'mobGriefing', 'doFireTick', 'naturalRegeneration', 'doInsomnia', 'doImmediateRespawn', 'pvp', 'fallDamage', 'fireDamage', 'drowningDamage', 'freezeDamage', 'announceAdvancements', 'commandBlockOutput', 'reducedDebugInfo', 'playersSleepingPercentage', 'randomTickSpeed', 'spawnRadius', 'maxEntityCramming'];
const wdir = (id, f) => path.join(dirOf(id), 'saves', safeName(f));
function loadLevel(id, f) { const p = path.join(wdir(id, f), 'level.dat'); if (!fs.existsSync(p)) throw new Error('Ce monde n’a pas de level.dat (il n’a jamais été ouvert dans le jeu ?).'); const r = nbt.parse(fs.readFileSync(p)), d = r.v.get('Data'); if (!d) throw new Error('level.dat illisible.'); return { p, r, d: d.v }; }
const dsize = (d, depth = 0) => { let n = 0; try { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); n += e.isDirectory() ? (depth < 6 ? dsize(p, depth + 1) : 0) : fs.statSync(p).size; } } catch (e) {} return n; };
exports.worldInfo = (id, f) => {
  const i = find(id), { d } = loadLevel(id, f), g = k => (d.get(k) || {}).v, gr = d.get('GameRules') ? d.get('GameRules').v : new Map();
  let seed = g('RandomSeed'); const wg = d.get('WorldGenSettings'); if (seed === undefined && wg && wg.v.get('seed')) seed = wg.v.get('seed').v;
  const dp = d.get('DataPacks') ? d.get('DataPacks').v : null, en = dp && dp.get('Enabled') ? dp.get('Enabled').v.a : [], ver = d.get('Version') ? d.get('Version').v.get('Name') : null;
  const dpd = path.join(wdir(id, f), 'datapacks'); let files = []; try { files = fs.readdirSync(dpd).filter(n => !n.startsWith('.')); } catch (e) {}
  const ex = (i.extras || []).filter(x => x.world === f);
  return {
    name: g('LevelName'), mode: g('GameType'), difficulty: g('Difficulty'), cheats: !!g('allowCommands'), hardcore: !!g('hardcore'), seed: seed === undefined ? '' : String(seed), version: ver ? ver.v : '', last: g('LastPlayed') ? Number(g('LastPlayed')) : 0, size: dsize(wdir(id, f)),
    res: (() => { try { const st = fs.statSync(path.join(wdir(id, f), 'resources.zip')), e = ex.find(x => x.type === 'resourcepack'); return { size: st.size, title: e ? e.title : 'resources.zip', icon: e ? e.icon : '' }; } catch (e) { return null; } })(),
    rules: RULES.filter(k => gr.has(k)).map(k => ({ k, v: gr.get(k).v })),
    packs: files.map(n => { const e = ex.find(x => x.file === n); return { name: n, title: e ? e.title : n.replace(/\.zip$/i, ''), icon: e ? e.icon : '', enabled: en.includes('file/' + n) }; })
  };
};
exports.worldResImport = (id, f, src) => { find(id); const d = wdir(id, f); if (!fs.existsSync(d)) throw new Error('Monde introuvable.'); if (!/\.zip$/i.test(src)) throw new Error('Choisis un fichier .zip.'); fs.copyFileSync(src, path.join(d, 'resources.zip')); const i = find(id); i.extras = (i.extras || []).filter(x => !(x.type === 'resourcepack' && x.world === f)); store.save(); };
exports.worldResRemove = (id, f) => { find(id); try { fs.unlinkSync(path.join(wdir(id, f), 'resources.zip')); } catch (e) {} const i = find(id); i.extras = (i.extras || []).filter(x => !(x.type === 'resourcepack' && x.world === f)); store.save(); };
exports.worldSet = (id, f, o) => {
  if (game.isRunning()) throw new Error('Ferme Minecraft avant de modifier un monde.');
  const { p, r, d } = loadLevel(id, f); fs.copyFileSync(p, p + '.hydarium.bak');
  const put = (k, t, v) => d.set(k, { t, v });
  if (typeof o.name === 'string' && o.name.trim()) put('LevelName', 8, o.name.trim().slice(0, 60));
  if (Number.isInteger(o.mode) && o.mode >= 0 && o.mode <= 3) put('GameType', 3, o.mode);
  if (Number.isInteger(o.difficulty) && o.difficulty >= 0 && o.difficulty <= 3) put('Difficulty', 1, o.difficulty);
  if (typeof o.cheats === 'boolean') put('allowCommands', 1, o.cheats ? 1 : 0);
  if (typeof o.hardcore === 'boolean') put('hardcore', 1, o.hardcore ? 1 : 0);
  if (o.rule && RULES.includes(o.rule.k) && d.get('GameRules') && d.get('GameRules').v.has(o.rule.k)) { const v = String(o.rule.v); if (/^(true|false|\d{1,6})$/.test(v)) d.get('GameRules').v.set(o.rule.k, { t: 8, v }); }
  if (o.pack) {
    const n = safeName(o.pack), dp = d.get('DataPacks'); if (!dp) throw new Error('Ce monde ne gère pas les data packs.');
    const en = dp.v.get('Enabled') || (dp.v.set('Enabled', { t: 9, v: { et: 8, a: [] } }), dp.v.get('Enabled')), di = dp.v.get('Disabled') || (dp.v.set('Disabled', { t: 9, v: { et: 8, a: [] } }), dp.v.get('Disabled')), k = 'file/' + n;
    if (en.v.a.includes(k)) { en.v.a = en.v.a.filter(x => x !== k); di.v.a.push(k); } else { di.v.a = di.v.a.filter(x => x !== k); en.v.a.push(k); }
  }
  fs.writeFileSync(p, nbt.write(r));
};
exports.packRemove = (id, f, name) => {
  const i = find(id); name = safeName(name); fs.rmSync(path.join(wdir(id, f), 'datapacks', name), { recursive: true, force: true });
  i.extras = (i.extras || []).filter(x => !(x.world === f && x.file === name)); store.save();
};
exports.packImport = (id, f, files) => { const d = path.join(wdir(id, f), 'datapacks'); fs.mkdirSync(d, { recursive: true }); let n = 0; for (const p of files) if (/\.zip$/i.test(p)) { fs.copyFileSync(p, path.join(d, path.basename(p).replace(/[^\w.\- +()]/g, '_'))); n++; } return n; };

/* ----- totem personnalisé (resource pack généré depuis le skin) ----- */
const packFormat = v => { const m = String(v).match(/^1\.(\d+)(?:\.(\d+))?/); if (!m) return 75; const a = +m[1], b = +m[2] || 0;
  if (a <= 14) return 4; if (a <= 15) return 5; if (a === 16) return b >= 2 ? 6 : 5; if (a === 17) return 7; if (a === 18) return 8; if (a === 19) return b >= 4 ? 13 : b >= 3 ? 12 : 9;
  if (a === 20) return b >= 5 ? 32 : b >= 3 ? 22 : b >= 2 ? 18 : 15; if (a === 21) return b >= 11 ? 75 : b >= 9 ? 69 : b >= 7 ? 64 : b >= 6 ? 63 : b >= 5 ? 55 : b >= 4 ? 46 : b >= 2 ? 42 : 34; return 75; };
/* Format du pack de ressources : lu dans version.json du jeu installé (fiable pour 26.x), sinon table ci-dessus. Depuis le format 65 le jeu exige min_format et max_format. */
function metaFor(ver) {
  let f = 0;
  try { const jar = path.join(require('./platform').dataDir(), 'shared', 'versions', ver, ver + '.jar'); if (fs.existsSync(jar)) { const e = new (require('adm-zip'))(jar).getEntry('version.json'); if (e) { const pv = (JSON.parse(e.getData().toString('utf8')).pack_version) || {}; f = +(pv.resource_major || pv.resource || 0) || 0; } } } catch (e) {}
  if (!f) f = packFormat(ver);
  const o = { pack_format: f, description: 'Totem Hydarium (généré depuis ton skin)' }; if (f >= 65) { o.min_format = f; o.max_format = f; } return { pack: o };
}
exports.totem = (id, url, icon) => {
  const i = find(id); if (!/^data:image\/png;base64,[A-Za-z0-9+/=]{20,30000}$/.test(url || '')) throw new Error('Image de totem invalide.');
  const Zip = require('adm-zip'), z = new Zip();
  z.addFile('pack.mcmeta', Buffer.from(JSON.stringify(metaFor(i.version))));
  z.addFile('assets/minecraft/textures/item/totem_of_undying.png', Buffer.from(url.split(',')[1], 'base64'));
  if (/^data:image\/png;base64,[A-Za-z0-9+/=]{20,120000}$/.test(icon || '')) z.addFile('pack.png', Buffer.from(icon.split(',')[1], 'base64'));
  const d = path.join(dirOf(id), 'resourcepacks'); fs.mkdirSync(d, { recursive: true }); z.writeZip(path.join(d, 'Hydarium Totem.zip'));
};

/* ----- installation depuis CurseForge (mods avec dépendances, packs, shaders, data packs, plugins) ----- */
async function cfFile(i, type, modId, depth, auto) {
  const pid = 'cf' + modId; if (depth > 3) throw new Error('Trop de dépendances imbriquées.');
  if (type === 'mod' && i.mods.some(m => m.pid === pid)) return;
  const f = await cf.latestFile(modId, i.version, i.loader, type), m = await cf.mod(modId), name = safeName(path.basename(f.fileName));
  if (type === 'mod') {
    for (const d of f.dependencies || []) if (d.relationType === 3) { try { await cfFile(i, 'mod', d.modId, depth + 1, true); } catch (e) { require('./log').warn('dépendance CurseForge ' + d.modId, e.message); } }
    await download(cf.fileUrl(f), path.join(dirOf(i.id), 'mods', name), (f.hashes || []).find(h => h.algo === 1) && f.hashes.find(h => h.algo === 1).value, DL_OK2);
    i.mods.push({ pid, slug: m.slug, title: m.name, file: name, incompat: [], deps: (f.dependencies || []).filter(d => d.relationType === 3).map(d => 'cf' + d.modId), auto: !!auto, src: 'cf', icon: (m.logo && /^https:\/\/media\.forgecdn\.net\//.test(m.logo.thumbnailUrl || '')) ? m.logo.thumbnailUrl : '' });
  }
  return { f, m, name };
}
async function cfInstall(id, type, modId, world) {
  if (!FOLDER[type] || !/^\d+$/.test(modId)) throw new Error('Contenu invalide.');
  const i = find(id); i.extras = i.extras || [];
  if (type === 'mod') { if (i.loader === 'vanilla') throw new Error('Choisis un loader de mods pour ajouter des mods.'); await cfFile(i, 'mod', modId, 0, false); return store.save(); }
  if (type === 'datapack') { world = safeName(world); if (world !== '__next__' && !fs.existsSync(path.join(dirOf(id), 'saves', world))) throw new Error('Monde introuvable.'); }
  const wres = type === 'resourcepack' && world && world !== '__next__'; if (wres) world = safeName(world);
  const r = await cfFile(i, type, modId, 0, false), dest = wres ? path.join(dirOf(id), 'saves', world, 'resources.zip') : type === 'datapack' ? path.join(dpDir(id, world), r.name) : path.join(dirOf(id), FOLDER[type], r.name);
  if (wres && !fs.existsSync(path.dirname(dest))) throw new Error('Monde introuvable.');
  await download(cf.fileUrl(r.f), dest, (r.f.hashes || []).find(h => h.algo === 1) && r.f.hashes.find(h => h.algo === 1).value, DL_OK2);
  if (wres) i.extras = i.extras.filter(x => !(x.type === 'resourcepack' && x.world === world)); i.extras.push({ pid: 'cf' + modId, type, title: r.m.name, file: wres ? 'resources.zip' : r.name, icon: (r.m.logo && /^https:\/\/media\.forgecdn\.net\//.test(r.m.logo.thumbnailUrl || '')) ? r.m.logo.thumbnailUrl : '', ...(world ? { world } : {}) }); store.save();
  if (type === 'datapack') afterDp(id, world, r.name);
}
/* plugins d’un serveur Paper : liste, activer / désactiver, retirer */
exports.pluginList = id => { find(id); const d = path.join(dirOf(id), 'plugins'); let n = []; try { n = fs.readdirSync(d); } catch (e) {} const ex = find(id).extras || []; return n.filter(f => /\.jar(\.disabled)?$/.test(f)).map(f => { const base = f.replace(/\.disabled$/, ''), e = ex.find(x => x.file === base); return { file: base, enabled: !f.endsWith('.disabled'), title: e ? e.title : base.replace(/\.jar$/, ''), icon: e ? e.icon : '' }; }); };
exports.pluginToggle = (id, file) => { find(id); file = safeName(file); const d = path.join(dirOf(id), 'plugins'), a = path.join(d, file), b = a + '.disabled'; if (fs.existsSync(a)) fs.renameSync(a, b); else if (fs.existsSync(b)) fs.renameSync(b, a); };
exports.pluginRemove = (id, file) => { const i = find(id); file = safeName(file); const d = path.join(dirOf(id), 'plugins'); fs.rmSync(path.join(d, file), { force: true }); fs.rmSync(path.join(d, file + '.disabled'), { force: true }); i.extras = (i.extras || []).filter(x => !(x.type === 'plugin' && x.file === file)); store.save(); };

/* ----- réglages par défaut des nouvelles instances (FOV, touches…) : appliqués au premier lancement ou à la demande ----- */
exports.defOptions = () => store.get().settings.defOptions || {};
exports.setDefOptions = o => {
  const d = {}; o = o || {};
  for (const k of Object.keys(OPT)) if (Number.isFinite(+o[k]) && +o[k] >= OPT[k][0] && +o[k] <= OPT[k][1] && o[k] !== '') d[k] = Math.round(+o[k]);
  for (const k of Object.keys(FLT)) if (o[k] !== undefined && o[k] !== '' && +o[k] >= FLT[k][0] && +o[k] <= FLT[k][1]) d[k] = +o[k];
  for (const k of BOOL) if (typeof o[k] === 'boolean') d[k] = o[k];
  if (typeof o.muteMusic === 'boolean') d.muteMusic = o.muteMusic; // musique de Minecraft coupée par défaut
  d.keys = {}; for (const k of KEYS) if (o.keys && KEYRE.test(String(o.keys[k] || ''))) d.keys[k] = o.keys[k];
  store.get().settings.defOptions = d; store.save();
};
exports.defApply = id => {
  const d = store.get().settings.defOptions; if (!d) return; const ch = { ...d }; delete ch.keys; if (ch.muteMusic) ch.soundCategory_music = 0; delete ch.muteMusic;
  for (const [k, v] of Object.entries(d.keys || {})) ch['key_key.' + k] = v;
  exports.optSet(id, ch);
};

/* un data pack posé dans le dossier n’est pas forcément activé dans level.dat : on l’active pour qu’il fonctionne dès l’ouverture du monde */
function ensureEnabled(id, f, name) {
  try {
    if (game.isRunning()) return; const { p, r, d } = loadLevel(id, f), dp = d.get('DataPacks'); if (!dp) return;
    const mk = k => { if (!dp.v.get(k)) dp.v.set(k, { t: 9, v: { et: 8, a: [] } }); return dp.v.get(k); }, en = mk('Enabled'), di = mk('Disabled'), k = 'file/' + name;
    if (en.v.a.includes(k)) return; fs.copyFileSync(p, p + '.hydarium.bak'); di.v.a = di.v.a.filter(x => x !== k); en.v.a.push(k); fs.writeFileSync(p, nbt.write(r));
  } catch (e) { require('./log').warn('activation du data pack', e.message); }
}
exports.totemBase = async id => {
  const i = find(id), plat = require('./platform'), crypto = require('crypto'), name = i.version + '.jar';
  const jars = [path.join(plat.dataDir(), 'shared', 'versions', i.version, name), path.join(plat.dataDir(), 'cache', 'client-jars', name)];
  let jar = jars.find(p => fs.existsSync(p));
  if (!jar) { // pas besoin de lancer l’instance : on télécharge le client officiel de Mojang (une fois, puis il reste en cache)
    const v = (await require('./game').versions()).find(x => x.id === i.version); if (!v) throw new Error('Version ' + i.version + ' introuvable chez Mojang.');
    const man = await (await fetch(v.url, { signal: AbortSignal.timeout(20000) })).json(), c = man.downloads && man.downloads.client; if (!c || !/^https:\/\/piston-data\.mojang\.com\//.test(c.url)) throw new Error('Client Minecraft introuvable pour cette version.');
    const buf = Buffer.from(await (await fetch(c.url, { signal: AbortSignal.timeout(120000) })).arrayBuffer());
    if (crypto.createHash('sha1').update(buf).digest('hex') !== c.sha1) throw new Error('Téléchargement du client corrompu : réessaie.');
    jar = jars[1]; fs.mkdirSync(path.dirname(jar), { recursive: true }); fs.writeFileSync(jar, buf);
  }
  const e = new (require('adm-zip'))(jar).getEntry('assets/minecraft/textures/item/totem_of_undying.png'); if (!e) throw new Error('Texture du totem introuvable dans cette version.');
  return 'data:image/png;base64,' + e.getData().toString('base64');
};

/* ----- data packs : monde choisi, « prochain nouveau monde » (dossier de préparation), activation différée si le jeu tourne ----- */
const dpDir = (id, world) => world === '__next__' ? path.join(dirOf(id), 'datapacks-staging') : path.join(dirOf(id), 'saves', safeName(world), 'datapacks');
const pending = [];
function pruneNext(id) { const i = find(id), d = dpDir(id, '__next__'); i.extras = (i.extras || []).filter(x => x.world !== '__next__' || fs.existsSync(path.join(d, x.file))); }
function afterDp(id, world, name) {
  if (world === '__next__') { // la copie reste dans « datapacks-staging » jusqu’à la création du monde (applyStaged) : rien n’est perdu si l’écran est refermé
    const src = path.join(dpDir(id, '__next__'), name), ss = require('./session').sessionStart(), t = ss ? exports.tempWorld(Math.max(ss, Date.now() - 20 * 60e3)) : null;
    require('./log').info('data pack « prochain monde »', name, '· jeu lancé :', !!ss, '· écran de création :', t ? t.path : 'non détecté (le pack reste préparé et sera ajouté à la création du monde)');
    if (t) { try { fs.copyFileSync(src, path.join(t.path, name)); (find(id).extras || []).forEach(x => { if (x.world === '__next__' && x.file === name) x.placed = true; }); store.save(); } catch (e) { require('./log').warn('data pack → écran de création', e.message); } }
    return;
  }
  if (game.isRunning()) pending.push({ id, world, name }); else ensureEnabled(id, world, name); // level.dat est réécrit par le jeu : on attend sa fermeture
}
exports.flushPending = () => { while (pending.length) { const p = pending.shift(); ensureEnabled(p.id, p.world, p.name); } };
exports.stagedCount = id => { try { return fs.readdirSync(dpDir(id, '__next__')).filter(f => /\.zip$/i.test(f)).length; } catch (e) { return 0; } };
exports.applyStaged = (id, world) => {
  const i = find(id), src = dpDir(id, '__next__'), dst = dpDir(id, world); let n = 0; let l = []; try { l = fs.readdirSync(src); } catch (e) {} if (!l.length) return 0; fs.mkdirSync(dst, { recursive: true });
  for (const f of l) { try { fs.copyFileSync(path.join(src, f), path.join(dst, f)); fs.rmSync(path.join(src, f), { force: true }); (i.extras || []).forEach(x => { if (x.world === '__next__' && x.file === f) { x.world = world; delete x.placed; } }); afterDp(id, world, f); n++; } catch (e) {} }
  store.save(); return n;
};
/* import manuel de data packs (.zip) depuis le catalogue : dans un monde existant, ou « prochain nouveau monde » (dossier de préparation + écran de création s’il est ouvert) */
exports.dpImport = (id, world, files) => {
  const i = find(id); world = safeName(world); let n = 0;
  if (world !== '__next__') { if (!fs.existsSync(path.join(dirOf(id), 'saves', world))) throw new Error('Monde introuvable.'); return exports.packImport(id, world, files); }
  pruneNext(id); const d = dpDir(id, '__next__'); fs.mkdirSync(d, { recursive: true }); i.extras = i.extras || [];
  for (const f of files) if (/\.zip$/i.test(f)) {
    try { const name = safeName(path.basename(f)); fs.copyFileSync(f, path.join(d, name)); i.extras = i.extras.filter(x => !(x.world === '__next__' && x.file === name)); i.extras.push({ pid: 'local-' + name, type: 'datapack', title: name.replace(/\.zip$/i, ''), file: name, icon: '', world: '__next__' }); afterDp(id, '__next__', name); n++; } catch (e) { require('./log').warn('import data pack', e.message); }
  }
  store.save(); return n;
};
exports.worldsDp = id => { find(id); let l = []; try { l = fs.readdirSync(path.join(dirOf(id), 'saves'), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => ({ folder: e.name, m: fs.statSync(path.join(dirOf(id), 'saves', e.name)).mtimeMs })); } catch (e) {} return l.sort((a, b) => b.m - a.m).map(x => x.folder); };

/* Pendant la création d’un monde, Minecraft utilise un dossier temporaire « mcworld-… » (dans le dossier temporaire du système) où il range les data packs
   de l’écran « Data Packs ». On y dépose les packs : ils apparaissent dans cet écran. */
const os = require('os');
exports.tempWorld = (since = 0) => {
  const base = os.tmpdir(); let best = null;
  try { for (const n of fs.readdirSync(base)) { if (!/^mcworld-/i.test(n)) continue; const p = path.join(base, n); try { const t = fs.statSync(p); if (t.isDirectory() && t.mtimeMs >= since && (!best || t.mtimeMs > best.t)) best = { path: p, name: n, t: t.mtimeMs }; } catch (e) {} } } catch (e) {}
  return best;
};
exports.placeInTemp = (files, since) => { const t = exports.tempWorld(since); if (!t) return 0; let n = 0; for (const f of files) { try { fs.copyFileSync(f, path.join(t.path, path.basename(f))); n++; } catch (e) {} } return n; };
