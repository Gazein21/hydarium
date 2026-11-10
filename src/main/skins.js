/* Skins et capes : lecture et modification via l’API officielle de Mojang, bibliothèque locale de skins. */
const fs = require('fs'), path = require('path');
const auth = require('./auth'), store = require('./store'), plat = require('./platform');
const API = 'https://api.minecraftservices.com', dir = () => path.join(plat.dataDir(), 'skins');
const lib = () => (store.get().skinLib = store.get().skinLib || []);
const durl = b => 'data:image/png;base64,' + b.toString('base64');

/* ----- Skins préinstallés -----
   La liste vit dans default-skins/manifest.json. Deux origines :
   • « source: mojang » : les 9 skins par défaut de Minecraft ne sont PAS dans le dépôt (textures Mojang). Le launcher les extrait du client.jar
     de Minecraft : d’abord d’un jar déjà téléchargé (shared/versions), sinon le jar de la dernière version est téléchargé UNE fois chez Mojang
     (vérifié par sha1) puis supprimé ; seuls les PNG (≈ 9 Ko) sont gardés dans skins/_mojang/.
   • « file » : PNG livré avec le launcher (ton skin Hydarium).
   Le joueur peut en retirer : on retient seulement l’id masqué (store.skinHidden), jamais de suppression de fichier livré. */
const bdir = path.join(__dirname, 'default-skins'), mdir = () => path.join(dir(), '_mojang');
const hidden = () => (store.get().skinHidden = store.get().skinHidden || []);
function manifest() {
  let m; try { m = JSON.parse(fs.readFileSync(path.join(bdir, 'manifest.json'), 'utf8')).skins; } catch (e) { return []; }
  return (Array.isArray(m) ? m : []).filter(s => s && /^[\w-]{1,40}$/.test(s.id) && (s.source === 'mojang' ? /^entity\/player\/(wide|slim)\/\w+\.png$/.test(s.texture || '') : /^[\w-]+\.png$/.test(s.file || '')))
    .map(s => ({ id: s.id, name: String(s.name || s.id).slice(0, 30), variant: s.variant === 'slim' ? 'slim' : 'classic', group: s.group === 'hydarium' ? 'hydarium' : 'mojang', texture: s.source === 'mojang' ? s.texture : null, file: s.source === 'mojang' ? path.join(mdir(), s.id + '.png') : path.join(bdir, s.file) }));
}
/* skins disponibles maintenant (fichier présent), le skin Hydarium en premier, les autres dans l’ordre du manifeste */
const builtins = () => manifest().filter(b => fs.existsSync(b.file)).sort((a, b) => (a.group === 'hydarium' ? 0 : 1) - (b.group === 'hydarium' ? 0 : 1));
const missingMojang = () => manifest().filter(b => b.texture && !fs.existsSync(b.file));
const bcache = new Map();
const bsrc = b => { if (!bcache.has(b.file)) bcache.set(b.file, durl(fs.readFileSync(b.file))); return bcache.get(b.file); };
/* retrouve un skin par id, préinstallé ou de la bibliothèque : { id, name, variant, file } */
function entry(id) {
  const b = builtins().find(x => x.id === id); if (b) return b;
  const s = lib().find(x => x.id === id); if (!s) throw new Error('Skin introuvable.');
  return { ...s, file: path.join(dir(), s.id + '.png') };
}

/* ----- récupération des skins Mojang depuis le client.jar ----- */
const MANIFEST_URL = 'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json';
function extractFrom(jarBuf) {
  const Zip = require('adm-zip'), z = new Zip(jarBuf); let n = 0;
  for (const b of missingMojang()) {
    const e = z.getEntry('assets/minecraft/textures/' + b.texture); if (!e) continue;
    const png = e.getData(); try { check(png); } catch (err) { continue; } // fichier inattendu : on l’ignore, on essaiera un autre jar
    fs.mkdirSync(mdir(), { recursive: true }); fs.writeFileSync(b.file + '.tmp', png); fs.renameSync(b.file + '.tmp', b.file); n++;
  }
  return n;
}
function localJars() { // jars de Minecraft déjà téléchargés par le launcher (les plus récents d’abord, 4 au plus)
  const root = path.join(plat.dataDir(), 'shared', 'versions'); let out = [];
  try { for (const v of fs.readdirSync(root)) { const f = path.join(root, v, v + '.jar'); try { if (/^\d/.test(v)) out.push({ f, t: fs.statSync(f).mtimeMs }); } catch (e) {} } } catch (e) {}
  return out.sort((a, b) => b.t - a.t).slice(0, 4).map(x => x.f);
}
async function getJson(url) { const r = await fetch(url, { signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error('Mojang indisponible (' + r.status + ').'); return r.json(); }
async function downloadClientJar() {
  const man = await getJson(MANIFEST_URL), v = (man.versions || []).find(x => x.id === (man.latest || {}).release); if (!v) throw new Error('Dernière version de Minecraft introuvable.');
  const c = ((await getJson(v.url)).downloads || {}).client; if (!c || !/^https:\/\/[\w.-]*mojang\.com\//.test(c.url || '')) throw new Error('Téléchargement du jeu introuvable.');
  const r = await fetch(c.url, { signal: AbortSignal.timeout(180000) }); if (!r.ok) throw new Error('Téléchargement refusé par Mojang (' + r.status + ').');
  const b = Buffer.from(await r.arrayBuffer());
  if (c.sha1 && require('crypto').createHash('sha1').update(b).digest('hex') !== c.sha1) throw new Error('Fichier Mojang corrompu : téléchargement annulé.');
  return b;
}
let dl = null, dlErr = '';
async function fetchDefaults() {
  if (!missingMojang().length) return;
  for (const f of localJars()) { try { extractFrom(fs.readFileSync(f)); } catch (e) {} if (!missingMojang().length) return; }
  extractFrom(await downloadClientJar()); // le jar est en mémoire seulement : rien à nettoyer sur le disque
  if (missingMojang().length) throw new Error('Skins par défaut introuvables dans cette version de Minecraft.');
}
/* une seule récupération à la fois ; ne bloque jamais l’interface. Appelée au démarrage du launcher et à l’ouverture du Profil. */
const ensureDefaults = () => {
  if (!missingMojang().length) return Promise.resolve();
  if (!dl) dl = fetchDefaults().then(() => { dlErr = ''; }, e => { dlErr = e.message || String(e); }).finally(() => { dl = null; });
  return dl;
};
exports.ensureDefaults = ensureDefaults;
exports.retryDefaults = () => { dlErr = ''; return ensureDefaults(); };
const defaultsState = () => !missingMojang().length ? 'ready' : dl ? 'loading' : dlErr ? 'error' : 'idle';

async function api(p, o = {}) {
  const r = await fetch(API + p, { ...o, headers: { Authorization: 'Bearer ' + auth.token(), ...(o.headers || {}) }, signal: AbortSignal.timeout(20000) });
  if (r.status === 401) throw new Error('Session Microsoft expirée : reconnecte-toi (Profil › Changer de compte).');
  if (!r.ok) { let m = ''; try { m = (await r.json()).errorMessage || ''; } catch (e) {} throw new Error('Mojang a refusé la demande (' + r.status + ') ' + m); }
  return r.status === 204 ? null : r.json().catch(() => null);
}
const tcache = new Map();
async function tex(url) {
  const u = new URL(url); if (u.hostname !== 'textures.minecraft.net') throw new Error('Texture refusée.');
  if (!tcache.has(url)) { const r = await fetch('https://textures.minecraft.net' + u.pathname, { signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error('Texture introuvable.'); tcache.set(url, Buffer.from(await r.arrayBuffer())); }
  return tcache.get(url);
}
const variantOf = s => (String(s || '').toLowerCase() === 'slim' ? 'slim' : 'classic');
function check(b) {
  if (b.length < 100 || b.length > 40000 || b.subarray(1, 4).toString() !== 'PNG') throw new Error('Ce fichier n’est pas un skin PNG valide.');
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  if (w !== 64 || (h !== 64 && h !== 32)) throw new Error(`Taille ${w}×${h} refusée : un skin fait 64×64 (ou 64×32).`);
}
function add(buf, name, variant) {
  check(buf); const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  fs.mkdirSync(dir(), { recursive: true }); fs.writeFileSync(path.join(dir(), id + '.png'), buf);
  lib().push({ id, name: String(name || 'Skin').slice(0, 30), variant: variantOf(variant) }); store.save(); return id;
}
exports.profile = async () => {
  if (!dlErr) ensureDefaults(); // en arrière-plan : la page s’affiche tout de suite. Après un échec on n’insiste pas : c’est le bouton « Réessayer » qui relance.
  const p = await api('/minecraft/profile'), sk = (p.skins || []).find(s => s.state === 'ACTIVE') || (p.skins || [])[0];
  const capes = await Promise.all((p.capes || []).map(async c => ({ id: c.id, alias: c.alias, active: c.state === 'ACTIVE', src: durl(await tex(c.url).catch(() => Buffer.alloc(0))) })));
  return {
    name: p.name, skin: sk ? { src: durl(await tex(sk.url)), variant: variantOf(sk.variant) } : null, capes: capes.filter(c => c.src.length > 30),
    library: lib().map(s => { try { return { ...s, src: durl(fs.readFileSync(path.join(dir(), s.id + '.png'))) }; } catch (e) { return null; } }).filter(Boolean),
    defaults: builtins().filter(b => !hidden().includes(b.id)).map(b => ({ id: b.id, name: b.name, variant: b.variant, group: b.group, src: bsrc(b) })),
    hiddenDefaults: builtins().filter(b => hidden().includes(b.id)).length,
    defaultsState: defaultsState() === 'idle' ? 'loading' : defaultsState(), defaultsError: dlErr
  };
};
/* compte sans skin personnalisé : on prend le skin par défaut de ce compte (Steve / Alex) */
exports.fallback = async () => {
  const p = await api('/minecraft/profile'), r = await fetch('https://mc-heads.net/skin/' + encodeURIComponent(p.id), { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('Skin par défaut introuvable (connexion ?).'); const b = Buffer.from(await r.arrayBuffer()); check(b); return durl(b);
};
exports.addFile = (file, variant) => { const b = fs.readFileSync(file); return add(b, path.basename(file).replace(/\.png$/i, ''), variant); };
exports.fromPlayer = async name => {
  name = String(name || '').trim(); if (!/^\w{3,16}$/.test(name)) throw new Error('Pseudo invalide.');
  const r = await fetch('https://api.mojang.com/users/profiles/minecraft/' + name, { signal: AbortSignal.timeout(15000) });
  if (r.status === 404 || r.status === 204) throw new Error('Joueur introuvable.'); if (!r.ok) throw new Error('Service Mojang indisponible.');
  const u = await r.json(), s = await fetch('https://sessionserver.mojang.com/session/minecraft/profile/' + u.id, { signal: AbortSignal.timeout(15000) });
  if (!s.ok) throw new Error('Profil indisponible (trop de demandes ? réessaie dans une minute).');
  const pr = await s.json(), t = JSON.parse(Buffer.from(pr.properties.find(x => x.name === 'textures').value, 'base64').toString()).textures.SKIN;
  if (!t) throw new Error('Ce joueur n’a pas de skin personnalisé.');
  return add(await tex(t.url), u.name, t.metadata && t.metadata.model);
};
exports.saveCurrent = async () => {
  const p = await api('/minecraft/profile'), sk = (p.skins || []).find(s => s.state === 'ACTIVE'); if (!sk) throw new Error('Aucun skin actif.');
  return add(await tex(sk.url), 'Mon skin du ' + new Date().toLocaleDateString('fr-FR'), sk.variant);
};
exports.fileOf = id => { const s = entry(id); return { file: s.file, name: s.name }; };
exports.apply = async id => {
  const s = entry(id);
  const fd = new FormData(); fd.append('variant', s.variant); fd.append('file', new Blob([fs.readFileSync(s.file)], { type: 'image/png' }), 'skin.png');
  await api('/minecraft/profile/skins', { method: 'POST', body: fd });
};
exports.setVariant = (id, v) => { const s = lib().find(x => x.id === id); if (s) { s.variant = variantOf(v); store.save(); } };
exports.rename = (id, n) => { const s = lib().find(x => x.id === id); if (s && String(n).trim()) { s.name = String(n).trim().slice(0, 30); store.save(); } };
exports.remove = id => {
  if (builtins().some(b => b.id === id)) { if (!hidden().includes(id)) hidden().push(id); store.save(); return; } // préinstallé : on le masque, le fichier reste livré avec le launcher
  const d = store.get(); d.skinLib = lib().filter(x => x.id !== id); try { fs.rmSync(path.join(dir(), String(id).replace(/[^a-z0-9]/g, '') + '.png'), { force: true }); } catch (e) {} store.save(); };
exports.cape = async id => {
  if (!id) return api('/minecraft/profile/capes/active', { method: 'DELETE' });
  if (!/^[\w-]{8,64}$/.test(id)) throw new Error('Cape invalide.');
  await api('/minecraft/profile/capes/active', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ capeId: id }) });
};
exports.restoreDefaults = () => { store.get().skinHidden = []; store.save(); };
