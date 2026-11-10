/* Skins préinstallés : extraits du client.jar de Minecraft (jamais livrés dans le dépôt), retirables, restaurables, applicables ;
   le skin Hydarium (PNG livré) est prévu et ignoré tant que son fichier n'existe pas. Tout est simulé : aucun accès réseau. */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), zlib = require('zlib'), crypto = require('crypto');
const AdmZip = require('adm-zip');
const base = path.join(__dirname, '..', 'src', 'main'), data = fs.mkdtempSync(path.join(os.tmpdir(), 'hydskin-'));
const stub = (name, exp) => { const f = require.resolve(path.join(base, name)); require.cache[f] = { id: f, filename: f, loaded: true, exports: exp }; };
const db = {};
stub('platform.js', { dataDir: () => data });
stub('store.js', { get: () => db, save: () => {} });
stub('auth.js', { token: () => 'tok' });
const skins = require(path.join(base, 'skins.js'));
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };

/* faux PNG 64×64 valide (données aléatoires pour passer le contrôle de taille > 100 octets) */
const crcT = Array.from({ length: 256 }, (_, i) => { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const png = () => { const h = Buffer.alloc(13); h.writeUInt32BE(64, 0); h.writeUInt32BE(64, 4); h[8] = 8; h[9] = 6; const raw = Buffer.alloc(64 * (1 + 256)); for (let y = 0; y < 64; y++) crypto.randomBytes(256).copy(raw, y * 257 + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', h), chunk('IDAT', zlib.deflateSync(raw, { level: 0 })), chunk('IEND', Buffer.alloc(0))]); };
const NAMES = ['steve', 'alex', 'ari', 'efe', 'kai', 'makena', 'noor', 'sunny', 'zuri'], SLIM = ['alex', 'efe', 'makena', 'noor'];
const jar = () => { const z = new AdmZip(); for (const nm of NAMES) for (const v of ['wide', 'slim']) z.addFile(`assets/minecraft/textures/entity/player/${v}/${nm}.png`, png()); z.addFile('assets/minecraft/lang/fr_fr.json', Buffer.from('{}')); return z.toBuffer(); };
const mdir = path.join(data, 'skins', '_mojang'), wipe = () => { fs.rmSync(path.join(data, 'skins'), { recursive: true, force: true }); };
const wait = async f => { for (let i = 0; i < 200; i++) { if (f()) return; await new Promise(r => setTimeout(r, 10)); } throw new Error('délai dépassé'); };

(async () => {
  const sent = []; let mode = 'ok', clientJar = jar(), clientSha = crypto.createHash('sha1').update(clientJar).digest('hex'), downloads = 0;
  const R = (status, body) => ({ ok: status < 400, status, json: async () => (Buffer.isBuffer(body) ? null : body), arrayBuffer: async () => { const b = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); } });
  global.fetch = async (url, o = {}) => {
    url = String(url); sent.push({ url, o });
    if (url.endsWith('/minecraft/profile')) return R(200, { id: 'abc', name: 'Test', skins: [], capes: [] });
    if (url.includes('/minecraft/profile/skins')) return R(204, {});
    if (mode === 'offline' && /mojang\.com/.test(url)) throw new TypeError('fetch failed');
    if (url.includes('version_manifest_v2')) return R(200, { latest: { release: '26.9' }, versions: [{ id: '26.9', url: 'https://piston-meta.mojang.com/v1/packages/x/26.9.json' }] });
    if (url.includes('/26.9.json')) return R(200, { downloads: { client: { url: 'https://piston-data.mojang.com/v1/objects/abc/client.jar', sha1: mode === 'badsha' ? 'deadbeef' : clientSha } } });
    if (url.includes('client.jar')) { downloads++; return R(200, clientJar); }
    return R(404, {});
  };
  const state = async () => (await skins.profile());

  // 1) aucun PNG Mojang dans le dépôt, seulement le manifeste
  ok(!fs.readdirSync(path.join(base, 'default-skins')).some(f => /\.png$/.test(f)), 'aucun PNG Mojang livré dans le dépôt');

  // 2) hors ligne, sans jar local : le profil s'affiche quand même, en erreur lisible, sans skins ; réessayer après retour du réseau fonctionne
  mode = 'offline'; wipe();
  let p = await state(); ok(p.defaults.length === 0 && ['loading', 'error'].includes(p.defaultsState), 'récupération lancée en arrière-plan, la page ne bloque pas');
  await skins.ensureDefaults();
  p = await state(); ok(p.defaultsState === 'error' && /fetch failed|indisponible|Mojang/i.test(p.defaultsError) || p.defaultsError.length > 0, 'erreur réseau expliquée : ' + p.defaultsError);
  const before = sent.length; await state(); ok(sent.filter(s => /mojang\.com/.test(s.url)).length === sent.slice(0, before).filter(s => /mojang\.com/.test(s.url)).length, 'pas de nouvelle tentative tant que la personne ne clique pas');
  mode = 'ok'; downloads = 0; await skins.retryDefaults(); p = await state();
  ok(p.defaultsState === 'ready' && p.defaults.length === 9 && downloads === 1, 'réessayer télécharge le jar une fois : ' + p.defaultsState);

  // 3) contenu : 9 noms officiels, variantes officielles, 64×64, jar non conservé sur le disque
  ok(NAMES.every(x => p.defaults.some(d => d.name.toLowerCase() === x)), 'les 9 noms officiels');
  ok(p.defaults.every(d => (d.variant === 'slim') === SLIM.includes(d.name.toLowerCase())), 'variantes officielles (Alex, Efe, Makena, Noor = fins)');
  for (const d of p.defaults) { const b = Buffer.from(d.src.split(',')[1], 'base64'); ok(b.readUInt32BE(16) === 64 && b.readUInt32BE(20) === 64, d.name + ' = 64×64'); }
  ok(fs.readdirSync(mdir).every(f => f.endsWith('.png')) && !fs.readdirSync(os.tmpdir()).some(f => /client.*\.jar$/.test(f)), 'seuls les PNG sont gardés');
  const alexBytes = fs.readFileSync(path.join(mdir, 'mc-alex.png'));

  // 4) déjà en cache : plus aucun accès réseau
  const cnt = sent.length; await skins.ensureDefaults(); ok(sent.length === cnt, 'cache : aucun téléchargement');

  // 5) jar local : réutilisé sans rien télécharger
  wipe(); fs.mkdirSync(path.join(data, 'shared', 'versions', '1.21.9'), { recursive: true }); fs.writeFileSync(path.join(data, 'shared', 'versions', '1.21.9', '1.21.9.jar'), jar());
  downloads = 0; const c2 = sent.length; await skins.ensureDefaults(); p = await state();
  ok(p.defaults.length === 9 && downloads === 0 && sent.slice(c2).every(s => !/mojang\.com/.test(s.url)), 'jar déjà téléchargé par le launcher réutilisé');

  // 6) jar local ancien (sans les 9 skins) : on passe au téléchargement ; fichier corrompu (sha1) refusé
  wipe(); const old = new AdmZip(); old.addFile('assets/minecraft/textures/entity/steve.png', png()); fs.writeFileSync(path.join(data, 'shared', 'versions', '1.21.9', '1.21.9.jar'), old.toBuffer());
  mode = 'badsha'; await skins.retryDefaults(); p = await state(); ok(p.defaultsState === 'error' && /corrompu/i.test(p.defaultsError) && p.defaults.length === 0, 'sha1 invalide refusé');
  mode = 'ok'; await skins.retryDefaults(); p = await state(); ok(p.defaults.length === 9, 'jar ancien ignoré, jar Mojang utilisé');

  // 7) retirer / restaurer : le PNG en cache n'est jamais supprimé
  skins.remove('mc-steve'); skins.remove('mc-steve'); p = await state();
  ok(p.defaults.length === 8 && !p.defaults.some(d => d.name === 'Steve') && p.hiddenDefaults === 1 && db.skinHidden.length === 1, 'Steve retiré, sans doublon');
  ok(fs.existsSync(path.join(mdir, 'mc-steve.png')), 'fichier gardé');
  skins.restoreDefaults(); p = await state(); ok(p.defaults.length === 9 && p.hiddenDefaults === 0, 'restauration');

  // 8) appliquer : PNG + variante envoyés à Mojang, octets identiques
  sent.length = 0; await skins.apply('mc-alex');
  const post = sent.find(s => s.url.endsWith('/minecraft/profile/skins')); ok(post && post.o.method === 'POST' && post.o.body.get('variant') === 'slim', 'Alex envoyé en slim');
  ok(Buffer.from(await post.o.body.get('file').arrayBuffer()).equals(alexBytes), 'octets identiques au PNG extrait');
  let err = null; try { await skins.apply('mc-inconnu'); } catch (e) { err = e; } ok(err && /introuvable/i.test(err.message), 'id inconnu refusé');
  ok(skins.fileOf('mc-kai').name === 'Kai' && skins.fileOf('mc-kai').file.endsWith('mc-kai.png'), 'export');

  // 9) bibliothèque perso indépendante des skins préinstallés
  const mine = skins.addFile(path.join(mdir, 'mc-zuri.png'), 'classic'); skins.remove('mc-zuri'); p = await state();
  ok(p.library.length === 1 && p.defaults.length === 8, 'bibliothèque perso indépendante');
  skins.remove(mine); p = await state(); ok(p.library.length === 0 && p.defaults.length === 8, 'suppression perso ≠ masquage défaut'); skins.restoreDefaults();

  // 10) skin Hydarium : ignoré sans PNG, premier dès que le PNG est livré
  ok(!p.defaults.some(d => d.group === 'hydarium'), 'pas de skin Hydarium sans hydarium.png');
  const hy = path.join(base, 'default-skins', 'hydarium.png'); fs.writeFileSync(hy, png());
  try { p = await state(); ok(p.defaults.length === 10 && p.defaults[0].group === 'hydarium' && p.defaults[0].name === 'Hydarium', 'skin Hydarium en premier'); } finally { fs.rmSync(hy, { force: true }); }
  skins.remove('hy-custom'); skins.restoreDefaults();

  // 11) manifeste cassé : pas de plantage
  const mf = path.join(base, 'default-skins', 'manifest.json'), keep = fs.readFileSync(mf);
  try { fs.writeFileSync(mf, '{pas du json'); p = await state(); ok(p.defaults.length === 0, 'manifeste invalide toléré'); } finally { fs.writeFileSync(mf, keep); }

  console.log('skins.test.js : ' + n + ' vérifications OK');
})().catch(e => { console.error(e); process.exit(1); });
