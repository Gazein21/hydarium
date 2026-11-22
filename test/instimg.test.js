/* Images d'instance : photo perso ou logo de modpack, rangées hors des données d'instance, sources d'images limitées, nettoyage à la suppression. */
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), Module = require('module');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydimg-')), data = path.join(tmp, 'data'); let saves = 0;
const db = { instances: [{ id: 'abc123', name: 'A' }, { id: 'def456', name: 'B', pack: { src: 'modrinth', pid: 'AbCdEfGh', title: 'Pack' } }] };
const stubs = { './platform': { dataDir: () => data }, './store': { get: () => db, save: () => { saves++; } }, './curseforge': { hasKey: () => false } };
const load = Module._load; Module._load = function (r, ...a) { return stubs[r] || load.call(this, r, ...a); };
const im = require('../src/main/instimg');
const PNG = (n = 40, tag = 0) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(n, tag)]);   // pas d'Electron ici : l'image est gardée telle quelle
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 1)]);

test('enregistre une photo : fichier hors des données, instance = simples métadonnées', () => {
  const m = im.save('abc123', JPG, 'photo'); assert.deepStrictEqual([m.ext, m.kind], ['jpg', 'photo']);
  assert.ok(fs.existsSync(path.join(data, 'inst-images', 'abc123.jpg'))); assert.ok(JSON.stringify(db.instances[0]).length < 120, 'pas d’image dans l’instance');
  const g = im.get('abc123'); assert.ok(g.u.startsWith('data:image/jpeg;base64,') && g.kind === 'photo' && g.t === m.t);
});

test('un logo de modpack est un PNG de type « logo » ; remplacer une image supprime l’ancienne', () => {
  im.save('abc123', PNG(40, 2), 'logo'); assert.ok(!fs.existsSync(path.join(data, 'inst-images', 'abc123.jpg')), 'ancienne image supprimée');
  const g = im.get('abc123'); assert.ok(g.u.startsWith('data:image/png;base64,') && g.kind === 'logo');
});

test('refuse ce qui n’est pas une image, une image trop lourde, une instance inconnue', () => {
  assert.throws(() => im.save('abc123', Buffer.from('<svg onload=alert(1)>'), 'photo'), /Format/);
  assert.throws(() => im.save('abc123', Buffer.concat([PNG(), Buffer.alloc(13e6)]), 'photo'), /lourde/);
  assert.throws(() => im.save('zzz999', PNG(), 'photo'), /introuvable/);
  assert.throws(() => im.save('../evil', PNG(), 'photo'), /introuvable/);
});

test('logo de modpack : seulement https et les serveurs d’images de Modrinth / CurseForge', async () => {
  for (const u of ['http://cdn.modrinth.com/a.png', 'https://evil.example/a.png', 'https://cdn.modrinth.com.evil.io/a.png', 'file:///etc/passwd', 'nimporte quoi'])
    await assert.rejects(im.fromUrl('abc123', u), /refusée|invalide/, u);
});

test('copie à la duplication, retrait, et instance sans modpack : message clair', async () => {
  im.copy('abc123', 'def456'); assert.ok(im.get('def456') && fs.existsSync(path.join(data, 'inst-images', 'def456.png')));
  im.clear('abc123'); assert.strictEqual(im.get('abc123'), null); assert.ok(!fs.existsSync(path.join(data, 'inst-images', 'abc123.png')) && !db.instances[0].img);
  await assert.rejects(im.fromPack('abc123'), /modpack/);
});

test('branchements : canaux autorisés, logo récupéré à l’installation, liste des mods en ligne (plus centrée)', () => {
  const r = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  for (const c of ['inst:imgget', 'inst:imgpick', 'inst:imgpack', 'inst:imgclear']) { assert.ok(r('src/preload.js').includes("'" + c + "'"), c + ' dans le preload'); assert.ok(r('src/main/main.js').includes("on('" + c + "'"), c + ' dans main'); }
  assert.ok(/instimg'\)\.fromUrl\(n\.id, f\.icon\)/.test(r('src/main/packs.js')), 'logo enregistré à l’installation du modpack');
  const css = r('src/renderer/style.css'); assert.ok(!/(^|\n)\.mcard\s*\{/.test(css) && /\.mgrid \.mcard\s*\{/.test(css), '.mcard limité à la grille des modules');
});

test('.mrpack choisi sur le disque : retrouvé sur Modrinth par son empreinte SHA-1 ; sinon (inconnu, hors ligne, pas un modpack) : null, sans erreur', async () => {
  const packs = require('../src/main/packs'), f = path.join(tmp, 'a.mrpack'); fs.writeFileSync(f, 'contenu du pack');
  const sha = require('crypto').createHash('sha1').update('contenu du pack').digest('hex'), real = global.fetch; let urls = [];
  const reply = (code, body) => ({ ok: code === 200, status: code, json: async () => body });
  try {
    global.fetch = async u => { urls.push(String(u)); if (u.includes('/version_file/')) return reply(200, { project_id: 'AbCdEfGh' }); return reply(200, { id: 'AbCdEfGh', title: 'Mon pack', project_type: 'modpack', icon_url: 'https://cdn.modrinth.com/data/AbCdEfGh/icon.png' }); };
    const x = await packs.identifyFile(f); assert.deepStrictEqual(x, { ref: { src: 'modrinth', pid: 'AbCdEfGh', title: 'Mon pack' }, icon: 'https://cdn.modrinth.com/data/AbCdEfGh/icon.png' });
    assert.ok(urls[0].includes('/version_file/' + sha + '?algorithm=sha1'), 'empreinte du fichier envoyée');
    global.fetch = async u => u.includes('/version_file/') ? reply(404, {}) : reply(200, {}); assert.strictEqual(await packs.identifyFile(f), null, 'fichier inconnu');
    global.fetch = async () => { throw new Error('hors ligne'); }; assert.strictEqual(await packs.identifyFile(f), null, 'hors ligne');
    global.fetch = async u => u.includes('/version_file/') ? reply(200, { project_id: 'AbCdEfGh' }) : reply(200, { id: 'AbCdEfGh', title: 'x', project_type: 'mod', icon_url: '' }); assert.strictEqual(await packs.identifyFile(f), null, 'un mod, pas un modpack');
    global.fetch = async u => u.includes('/version_file/') ? reply(200, { project_id: '../../x' }) : reply(200, {}); assert.strictEqual(await packs.identifyFile(f), null, 'identifiant piégé refusé');
  } finally { global.fetch = real; }
  assert.ok(/identifyFile\(file\)/.test(fs.readFileSync(path.join(__dirname, '..', 'src/main/main.js'), 'utf8')), 'appelé après l’import d’un .mrpack');
});
