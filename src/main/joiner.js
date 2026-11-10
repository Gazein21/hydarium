/* Rejoindre un serveur : trouve l’instance compatible (version + loader + mods), sinon prépare la création d’une nouvelle. */
const store = require('./store'), game = require('./game'), slp = require('./slp'), log = require('./log');
const ADDR = /^[a-z0-9.-]{1,100}(:\d{1,5})?$/i;
const vnum = v => v.split('.').map(Number);
const newest = list => list.sort((a, b) => { const x = vnum(a), y = vnum(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (y[i] || 0) - (x[i] || 0); return 0; })[0];
/* Détection automatique des mods d'un serveur Forge / NeoForge : le ping (Server List Ping) annonce les identifiants de ses mods (forgeData / modinfo) ;
   on retire ceux qui sont intégrés au jeu ou au loader, puis on garde ceux qui existent sur Modrinth (l'identifiant d'un mod y est presque toujours son nom de projet).
   Fabric / Quilt n'annoncent RIEN (ni dans le ping, ni dans la poignée de main avant connexion) : rien à détecter pour eux. */
const BUILTIN = new Set(['minecraft', 'forge', 'neoforge', 'fml', 'fmlcore', 'javafml', 'lowcodefml', 'mclanguage', 'forgeloader', 'forge-api', 'mixinextras', 'mixin', 'java', 'fabricloader', 'fabric', 'fabric-api']);
const mrCache = new Map();
async function modrinthSlug(id) {
  if (mrCache.has(id)) return mrCache.get(id);
  let r = '';
  try { const x = await fetch('https://api.modrinth.com/v2/project/' + encodeURIComponent(id), { headers: { 'User-Agent': 'Hydarium/0.10 (help@hydarium.net)' }, signal: AbortSignal.timeout(6000) }); if (x.ok) { const j = await x.json(); if (j && /^[A-Za-z0-9_-]{2,64}$/.test(j.slug || '') && j.project_type === 'mod') r = j.slug; } } catch (e) { /* hors ligne : on ne sait pas */ }
  mrCache.set(id, r); return r;
}
async function resolveMods(ids) {
  const list = [...new Set(ids.map(x => String(x || '').toLowerCase()).filter(x => /^[a-z0-9_-]{2,64}$/.test(x) && !BUILTIN.has(x)))].slice(0, 80), out = [];
  for (let i = 0; i < list.length; i += 8) { const r = await Promise.all(list.slice(i, i + 8).map(modrinthSlug)); r.forEach(x => x && out.push(x)); }
  return [...new Set(out)];
}
/* ===== modpack d'un serveur ===== */
const normT = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const acro = t => String(t || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(w => /^\d/.test(w) ? w : w[0]).join('');
exports.isPackInst = (i, pack) => !!(pack && ((i.pack && i.pack.pid === pack.pid) || (normT(pack.title).length >= 5 && normT(i.name).includes(normT(pack.title)))));
const UA = { 'User-Agent': 'Hydarium/0.10 (help@hydarium.net)' };
async function findPack(texts, version, loader) {
  const hay = normT(texts.join(' ')), host = String(texts[3] || '').split('.').filter(w => w.length > 3 && !/^(play|mc|www|minecraft|server|join)$/i.test(w))[0] || '';
  const qs = [...new Set([texts[0], texts[1], texts[2], host].map(t => String(t || '').replace(/[§&][0-9a-fk-or]/gi, '').replace(/\s+/g, ' ').trim().slice(0, 60)).filter(t => t.length >= 4))];
  const good = title => { const n = normT(title), a = acro(title); return n.length >= 5 && (hay.includes(n) || (a.length >= 4 && a.length <= 8 && /\d/.test(a) && hay.includes(a))); };
  for (const q of qs) { // Modrinth d'abord
    try {
      const facets = JSON.stringify([['project_type:modpack'], ['versions:' + version], ['categories:' + loader]]);
      const r = await (await fetch(`https://api.modrinth.com/v2/search?query=${encodeURIComponent(q)}&limit=6&facets=${encodeURIComponent(facets)}`, { headers: UA, signal: AbortSignal.timeout(8000) })).json();
      const h = (r.hits || []).find(x => good(x.title)); if (h) return { src: 'modrinth', pid: h.project_id, slug: h.slug, title: h.title };
    } catch (e) { /* hors ligne */ }
  }
  const cf = require('./curseforge');
  if (cf.hasKey()) for (const q of qs) { // puis CurseForge (clé nécessaire)
    try { const r = await cf.search({ type: 'modpack', q, version, loader, offset: 0 }); const h = r.hits.find(x => good(x.title)); if (h) return { src: 'curseforge', pid: String(h.cfid), slug: h.slug, title: h.title }; } catch (e) { /* tant pis */ }
  }
  return null;
}
/* télécharge le fichier du pack (dernière version pour cette version de Minecraft et ce loader) dans le dossier temporaire ; renvoie le chemin */
exports.fetchPack = async (pack, version, loader, onText) => {
  const fs = require('fs'), path = require('path'), os = require('os'); let url, name;
  if (pack.src === 'modrinth') {
    const q = `game_versions=${encodeURIComponent(JSON.stringify([version]))}&loaders=${encodeURIComponent(JSON.stringify([loader]))}`;
    const vs = await (await fetch(`https://api.modrinth.com/v2/project/${pack.pid}/version?${q}`, { headers: UA, signal: AbortSignal.timeout(10000) })).json();
    const v = vs && vs[0]; const f = v && (v.files.find(x => x.primary) || v.files[0]); if (!f || !/^https:\/\/cdn\.modrinth\.com\//.test(f.url)) throw new Error('Aucune version du modpack « ' + pack.title + ' » pour Minecraft ' + version + '.');
    url = f.url; name = f.filename;
  } else {
    const cf = require('./curseforge'), f = await cf.latestFile(+pack.pid, version, loader, 'modpack'); url = cf.fileUrl(f); name = f.fileName;
    if (!/^https:\/\/(edge|mediafilez|media)\.forgecdn\.net\//.test(url)) throw new Error('Adresse de téléchargement CurseForge inattendue.');
  }
  const dest = path.join(os.tmpdir(), 'hyd-pack-' + Date.now() + '-' + String(name).replace(/[^\w.-]/g, '_'));
  if (onText) onText('Téléchargement du modpack « ' + pack.title + ' »…');
  const r = await fetch(url, { signal: AbortSignal.timeout(600000) }); if (!r.ok) throw new Error('Téléchargement du modpack : HTTP ' + r.status);
  fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer())); return dest;
};
/* nom d'affichage : un nom vague (« Serveur Minecraft », « A Minecraft Server »…) ne dit pas quel serveur c'est → on prend son adresse (sans « play. », « mc. »…) */
const niceName = (name, addr) => {
  const n = String(name || '').trim(), host = String(addr || '').split(':')[0].replace(/^(play|mc|jeu|jouer|minecraft|server|serveur|join)\./i, '');
  return !n || /^(un |a |my |mon |le )?(serveur|server)?\s*minecraft(\s*(serveur|server))?$/i.test(n) || normT(n) === normT(addr) ? (host || n || 'Serveur') : n;
};
exports.niceName = niceName;
/* Instances avec lesquelles on s’est DÉJÀ connecté à ce serveur (retenues par mismatch.js) : les serveurs ne donnent pas leur version de façon fiable,
   donc ce qui a déjà marché fait foi. La plus récente d’abord ; les instances supprimées sont ignorées. */
exports.known = addr => { const d = store.get(), ids = (d.joined || {})[addr] || []; return ids.map(id => d.instances.find(i => i.id === id)).filter(Boolean); };
exports.markOk = (addr, id) => {
  const d = store.get(); if (!d.instances.some(i => i.id === id) || !ADDR.test(String(addr || ''))) return;
  d.joined = d.joined || {}; const cur = d.joined[addr] || []; if (cur[0] === id) return;
  d.joined[addr] = [id, ...cur.filter(x => x !== id)].slice(0, 5); store.save(); log.info('Connexion réussie retenue', addr, id);
};
/* Serveur confirmé « Vanilla » par la personne : instance Fabric (si la version le permet) + mod Hydarium, version choisie par la personne. Jamais appelé sans sa confirmation. */
exports.createVanilla = async (addr, version, name) => {
  const v = (await game.versions()).find(x => x.id === version && x.type === 'release'); if (!v) throw new Error('Version de Minecraft inconnue : ' + version);
  const session = require('./session'), loader = session.fabricOk(v.id) ? 'fabric' : 'vanilla';
  const names = new Set(store.get().instances.map(i => i.name)), base = String(niceName(name, addr) || 'Serveur').slice(0, 36); let nm = base, k = 2; while (names.has(nm)) nm = base + ' ' + k++;
  const n = store.addInstance({ name: nm, version: v.id, type: v.type, loader });
  n.tags = ['Serveur', 'Vanilla']; n.srv = true; n.cover = 'night'; store.save();
  try { require('./content').defApply(n.id); } catch (e) { log.warn('réglages par défaut', e.message); }
  session.ensureClient(n, null).catch(e => log.warn('client Hydarium', e.message)); /* en arrière-plan : on n'attend pas la fabrication */ // le mod Hydarium : récupéré s’il existe pour cette version, sinon créé
  const failed = [], want = loader === 'fabric' ? ((store.get().settings.srvMods) || []) : []; // mods par défaut choisis par la personne (Paramètres) : possibles seulement avec Fabric
  for (const slug of want) { try { await require('./mods').add(n.id, slug); } catch (e) { failed.push(slug); log.warn('mod par défaut', slug, e.message); } }
  Object.defineProperty(n, 'failedMods', { value: failed, enumerable: false }); // lu par l’appelant pour prévenir ; pas enregistré
  return n;
};
exports.plan = async (addr, opts) => {
  opts = opts || {};
  addr = String(addr || ''); if (!ADDR.test(addr)) throw new Error('Adresse invalide.');
  addr = await require('./p2p').ensureFor(addr); // invitation privée : le port local est rouvert (adresse inchangée pour tous les autres serveurs)
  const d = store.get(), srv = d.servers.find(s => s.addr === addr) || { name: addr, addr }, req = srv.req || {};
  const [hh, pp] = addr.split(':'), lanIps = Object.values(require('os').networkInterfaces()).flat().filter(n => n && n.family === 'IPv4').map(n => n.address);
  const own = (d.hosts || []).find(h => String(h.port) === (pp || '25565') && (/^(localhost|127\.0\.0\.1)$/i.test(hh) || lanIps.includes(hh)));
  if (own) { // serveur créé avec « Mon serveur » : on sait exactement quelle version, quel loader et quels mods il faut
    const loader = own.type === 'fabric' ? 'fabric' : 'vanilla', need = loader === 'vanilla' ? [] : (own.mods || []).filter(m => !m.disabled && /^[A-Za-z0-9_-]{2,64}$/.test(m.slug || '')).map(m => m.slug);
    const ok = d.instances.filter(i => i.version === own.version && (loader === 'vanilla' || i.loader === loader) && need.every(s => i.mods.some(m => m.slug === s && !m.disabled))).sort((a, b) => (b.loader === 'vanilla' && loader === 'vanilla') - (a.loader === 'vanilla' && loader === 'vanilla') || b.lastPlayed - a.lastPlayed)[0];
    return { server: { name: own.name, addr }, version: own.version, loader, mods: need, hint: [], use: ok ? { id: ok.id, name: ok.name } : null, own: true };
  }
  const pref = !opts.refused && srv.inst && d.instances.find(i => i.id === srv.inst); // instance choisie par la personne pour ce serveur : elle prime sur toute détection
  if (pref) return { server: { name: niceName(srv.name, addr), addr }, version: pref.version, loader: pref.loader, mods: [], auto: [], pack: null, tooMany: 0, guessed: '', hint: [], modCount: 0, use: { id: pref.id, name: pref.name }, known: true, preferred: true, range: [], releases: [], configured: true };
  const kn = opts.refused ? [] : exports.known(addr)[0];
  if (kn) return { server: { name: niceName(srv.name, addr), addr }, version: kn.version, loader: kn.loader, mods: [], auto: [], pack: null, tooMany: 0, guessed: '', hint: [], modCount: 0, use: { id: kn.id, name: kn.name }, known: true, range: [], releases: [], configured: false }; // déjà réussi une fois : on relance cette instance
  /* deux sources : notre propre ping (rapide, gère SRV, liste de mods Forge) puis mcsrvstat.us en complément ; l’une peut échouer sans gêner l’autre */
  const mcsrv = async () => { try { return await (await fetch('https://api.mcsrvstat.us/3/' + addr, { headers: { 'User-Agent': 'Hydarium/0.10' }, signal: AbortSignal.timeout(8000) })).json(); } catch (e) { return {}; } };
  const [pg, M] = await Promise.all([slp.ping(addr).catch(() => null), mcsrv()]), P = pg ? pg.json : {};
  const motd = [slp.text(P.description), M.motd && M.motd.clean ? [].concat(M.motd.clean).join(' ') : '', srv.name, hh].join(' ').toLowerCase();
  const fm = slp.forgeMods(P), ml = fm.ids, forgeLike = fm.found || !!(P.modinfo && /fml|forge/i.test(P.modinfo.type || ''));
  const mods = ml.length ? ml : (M.mods || []).map(m => m.name || m);
  const text = [P.version && P.version.name, M.version, M.protocol && M.protocol.name].filter(Boolean).join(' '), found = (text.match(/\b1\.\d{1,2}(?:\.\d{1,2})?\b/g) || []);
  const rel = (await game.versions()).filter(v => v.type === 'release').map(v => v.id);
  let version = req.version || (found.length ? newest(found.filter(v => rel.includes(v))) || null : null);
  if (!version && P.version && P.version.protocol > 0) version = await protoVersion(P.version.protocol, rel); // le nom de version est personnalisé : on retrouve la version grâce au numéro de protocole
  if (!version) {
    if (opts.soft) return { server: { name: niceName(srv.name, addr), addr }, version: null, loader: forgeLike || mods.length ? 'forge' : 'vanilla', mods: [], auto: [], pack: null, tooMany: 0, guessed: '', hint: mods.slice(0, 12), modCount: ml.length, use: null, unknown: true, range: [], releases: rel.slice(0, 40), configured: false };
    throw new Error('Impossible de connaître la version de ce serveur (il est peut-être hors ligne). Indique-la dans « Configurer ».');
  }
  const sw = (String(M.software || '') + ' ' + String((P.version && P.version.name) || '')).toLowerCase(), tag = JSON.stringify(P).toLowerCase();
  let loader = req.loader || (fm.loader === 'neoforge' || /neoforge/.test(sw) || (forgeLike && /neoforge/.test(tag)) ? 'neoforge' : forgeLike || /forge/.test(sw) ? 'forge' : /fabric/.test(sw) ? 'fabric' : /quilt/.test(sw) ? 'quilt' : mods.length ? 'forge' : 'vanilla');
  let need = req.mods || [], guessed = '', auto = [];
  let pack = null, tooMany = 0;
  if (!req.mods && (loader === 'forge' || loader === 'neoforge') && ml.length) { // mods annoncés par le serveur
    const clientIds = ml.filter(x => !fm.serverOnly.includes(x));
    // gros serveur = modpack : on cherche le pack (Modrinth, puis CurseForge) d'après le nom, la description et l'adresse ; un pack se retrouve fiablement, 400 mods un par un non
    if (clientIds.filter(x => !BUILTIN.has(x)).length >= 25 || req.pack !== undefined) pack = await findPack([srv.name, slp.text(P.description), M.motd && M.motd.clean ? [].concat(M.motd.clean).join(' ') : '', hh], version, loader).catch(() => null);
    if (!pack) { if (clientIds.length > 80) tooMany = clientIds.length; else { auto = await resolveMods(clientIds); need = auto; } }
  }
  /* Fabric / Quilt n’annoncent rien dans le ping. Si le serveur a REFUSÉ la connexion et qu’on ne sait rien de plus, on devine : indice du message de refus, puis nom / description du serveur, puis Fabric (le plus courant). */
  if (opts.refused && loader === 'vanilla' && !req.loader) {
    const kw = /cobble/.test(motd) ? { loader: 'fabric', mods: ['cobblemon'], why: 'Cobblemon' } : null;
    loader = opts.hint || (kw && kw.loader) || 'fabric'; guessed = opts.hint ? 'indiqué par le message du serveur' : kw ? kw.why : 'supposé : le serveur refuse un client sans mods';
    if (kw && !need.length && !opts.hint) need = kw.mods;
  }
  const modded = loader !== 'vanilla' && (need.length > 0 || mods.length > 0 || !!req.loader || !!guessed);
  const inRange = v => { const r = [...new Set(found.filter(z => rel.includes(z)))].sort((a, b) => vnum(a).reduce((t, n, k) => t || n - (vnum(b)[k] || 0), 0)); return req.version ? v === version : r.length >= 2 ? vnum(v).reduce((t, n, k) => t || n - (vnum(r[0])[k] || 0), 0) >= 0 && vnum(v).reduce((t, n, k) => t || n - (vnum(r[r.length - 1])[k] || 0), 0) <= 0 : v === version; };
  const okPack = pack ? d.instances.find(i => exports.isPackInst(i, pack)) : null;
  const ok = okPack || d.instances.filter(i => !pack && inRange(i.version) && (modded ? i.loader === loader : true) && need.every(s => i.mods.some(m => m.slug === s && !m.disabled)))
    .sort((a, b) => (b.loader === 'vanilla' && !modded) - (a.loader === 'vanilla' && !modded) || b.lastPlayed - a.lastPlayed)[0];
  return { server: { name: niceName(srv.name, addr), addr }, version, loader: modded ? loader : 'vanilla', mods: need, auto, pack, tooMany, guessed, hint: mods.slice(0, 12), modCount: ml.length, use: ok ? { id: ok.id, name: ok.name } : null, range: req.version ? [] : [...new Set(found.filter(v => rel.includes(v)))], via: pg ? 'ping' : M.online !== undefined ? 'mcsrvstat' : 'rien', releases: rel.slice(0, 40), configured: !!(req.version && req.loader) };
};
/* numéro de protocole → version (table publique de PrismarineJS, mise en cache) */
let protoCache = null;
async function protoVersion(n, rel) {
  try {
    if (!protoCache) protoCache = await (await fetch('https://raw.githubusercontent.com/PrismarineJS/minecraft-data/master/data/pc/common/protocolVersions.json', { signal: AbortSignal.timeout(8000) })).json();
    const c = protoCache.filter(x => x.version === n && rel.includes(x.minecraftVersion)).map(x => x.minecraftVersion); return c.length ? newest(c) : null;
  } catch (e) { return null; }
}
/* Le serveur accepte-t-il VRAIMENT cette version de Minecraft ? On se présente avec le protocole de cette version : un serveur ou proxy multi-versions (Hypixel, ViaVersion, BungeeCord, Velocity…)
   répond avec ce même protocole s’il l’accepte. true = accepté (preuve), false = le serveur répond avec un autre protocole (probablement refusé), null = on ne sait pas (hors ligne, table inconnue…). */
exports.supports = async (addr, version) => {
  try {
    if (!protoCache) protoCache = await (await fetch('https://raw.githubusercontent.com/PrismarineJS/minecraft-data/master/data/pc/common/protocolVersions.json', { signal: AbortSignal.timeout(8000) })).json();
    const e = protoCache.find(x => x.minecraftVersion === version && x.version > 0); if (!e) return null;
    const r = await slp.ping(addr, 6000, e.version), got = r.json && r.json.version && r.json.version.protocol;
    if (typeof got !== 'number') return null;
    return got === e.version;
  } catch (e) { return null; }
};
/* adresse « canonique » : le jeu écrit la machine résolue (SRV) dans son journal ; si elle correspond à un serveur enregistré, on reprend l’adresse que tu as saisie */
exports.canon = async addr => {
  try {
    const [h, p] = addr.split(':');
    for (const s of store.get().servers) { const [sh, sp] = String(s.addr).split(':'); if (sh === h && String(sp || '25565') === String(p || '25565')) return s.addr; const r = await slp.resolve(sh, sp ? +sp : 0); if (r.srv && r.host.toLowerCase() === h.toLowerCase() && String(r.port) === String(p || '25565')) return s.addr; }
  } catch (e) { /* tant pis */ }
  return addr;
};
exports.setReq = (id, r) => {
  const s = store.get().servers.find(x => x.id === id); if (!s) throw new Error('Serveur introuvable.');
  const req = {}; r = r || {};
  if (['vanilla', 'fabric', 'quilt', 'forge', 'neoforge'].includes(r.loader)) req.loader = r.loader;
  if (/^1\.\d{1,2}(\.\d{1,2})?$/.test(r.version || '')) req.version = r.version;
  if (Array.isArray(r.mods)) req.mods = r.mods.map(String).filter(m => /^[A-Za-z0-9_-]{2,64}$/.test(m)).slice(0, 60);
  s.req = req; store.save();
};
