/* Import de modpacks : vrais fichiers .mrpack / .zip fabriqués ici, téléchargements et API simulés. Vérifie surtout que RIEN n'est laissé à moitié fait
   (instance fantôme, fichiers écrits après l'échec), que l'interface n'est pas figée, et que les formats « de la vraie vie » (dossier racine, BOM, chemins Windows) passent. */
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), Module = require('module');
const Zip = require('adm-zip');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydmp-')), data = path.join(tmp, 'data');

/* ---- faux modules ---- */
const db = { instances: [] }; let seq = 0;
const store = { get: () => db, save() {}, addInstance: ({ name, version, type, loader }) => { const i = { id: 'i' + ++seq, name, version, type, loader, mods: [] }; db.instances.push(i); return i; }, removeInstance: id => { db.instances = db.instances.filter(i => i.id !== id); } };
const net = { fail: new Set(), failAll: false, dl: [], late: [] };
const fake = {
  download: async (url, dest, sha1, hosts) => { net.dl.push(url); if (net.failAll || [...net.fail].some(f => url.includes(f))) throw new Error('Téléchargement impossible (404) — cdn'); await new Promise(r => setTimeout(r, 2)); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, 'jar:' + path.basename(dest)); net.late.push(dest); },
  post: async (u, body) => Object.fromEntries((body.hashes || []).slice(0, 1).map(h => [h, { project_id: 'P1', dependencies: [{ dependency_type: 'required', project_id: 'P0' }] }])),
  fetchJson: async () => [{ id: 'P1', slug: 'sodium', title: 'Sodium', icon_url: 'https://cdn.modrinth.com/x.png' }], MR: 'https://api.modrinth.com/v2' };
const cfStub = { key: true, hasKey() { return this.key; }, files: async ids => ids.map(id => ({ id, modId: 100 + id, fileName: id === 3 ? 'pack.zip' : 'cfmod' + id + '.jar', hashes: [], dependencies: [] })), mods: async ids => ids.map(id => ({ id, slug: 's' + id, name: 'Mod ' + id, classId: 6, logo: { thumbnailUrl: id === 101 ? 'https://media.forgecdn.net/avatars/1/1/x.png' : 'https://evil.example/x.png' } })), fileUrl: f => 'https://edge.forgecdn.net/files/' + f.id + '/' + f.fileName };
const stubs = { './store': store, './game': { versions: async () => [{ id: '1.20.1', type: 'release' }, { id: '26.3', type: 'release' }] }, './mods': fake, './platform': { dataDir: () => data }, './curseforge': cfStub, './log': { info() {}, warn() {}, error() {} } };
const load = Module._load; Module._load = function (r, ...a) { return stubs[r] || load.call(this, r, ...a); };
const mp = require('../src/main/modpack');

/* ---- fabrique de packs ---- */
const mkZip = (entries, name) => { const z = new Zip(); for (const [n, d] of Object.entries(entries)) z.addFile(n, Buffer.isBuffer(d) ? d : Buffer.from(d)); const f = path.join(tmp, name); z.writeZip(f); return f; };
const modFile = (n, extra = {}) => ({ path: 'mods/' + n + '.jar', hashes: { sha1: 'a'.repeat(40) }, downloads: ['https://cdn.modrinth.com/data/x/versions/' + n + '/' + n + '.jar'], fileSize: 1, ...extra });
const mrIndex = (files, deps = { minecraft: '1.20.1', 'fabric-loader': '0.15.7' }, name = 'Mon Pack') => JSON.stringify({ formatVersion: 1, game: 'minecraft', versionId: '1.0', name, dependencies: deps, files });
const reset = () => { db.instances = []; net.fail.clear(); net.failAll = false; net.dl = []; net.late = []; cfStub.key = true; };
const progress = []; const P = p => progress.push(p);
const instDir = i => path.join(data, 'instances', i.id);

test('Modrinth : mods téléchargés, overrides appliqués, instance bien configurée, progression remontée', async () => {
  reset(); progress.length = 0;
  const f = mkZip({ 'modrinth.index.json': mrIndex([modFile('sodium'), modFile('lithium'), { path: 'resourcepacks/rp.zip', downloads: ['https://cdn.modrinth.com/rp.zip'], hashes: { sha1: 'b'.repeat(40) } }, modFile('servermod', { env: { client: 'unsupported', server: 'required' } })]),
    'overrides/config/sodium.json': '{"a":1}', 'overrides/options.txt': 'fov:90', 'client-overrides/config/client.txt': 'c', 'server-overrides/config/srv.txt': 's' }, 'a.mrpack');
  assert.strictEqual(mp.detect(f), 'mrpack');
  const r = await mp.run(f, P); const i = db.instances[0];
  assert.deepStrictEqual([r.name, r.kind, r.bad.length, db.instances.length, i.loader, i.version], ['Mon Pack', 'mrpack', 0, 1, 'fabric', '1.20.1']);
  const d = instDir(i); for (const x of ['mods/sodium.jar', 'mods/lithium.jar', 'resourcepacks/rp.zip', 'config/sodium.json', 'options.txt', 'config/client.txt']) assert.ok(fs.existsSync(path.join(d, x)), 'absent : ' + x);
  assert.ok(!fs.existsSync(path.join(d, 'mods/servermod.jar')) && !fs.existsSync(path.join(d, 'config/srv.txt')), 'pièces serveur ignorées');
  assert.ok(i.mods.length === 2 && i.mods.some(m => m.title === 'Sodium') && i.mods.every(m => m.file), 'mods enregistrés (identifiés ou « importés »)');
  assert.ok(progress.some(p => /Téléchargement/.test(p.text)) && progress.some(p => /Copie des fichiers/.test(p.text)) && progress.every(p => typeof p.text === 'string'), 'progression avec libellés');
  assert.strictEqual(progress.filter(p => /Téléchargement/.test(p.text)).map(p => p.done).join(), '1,2,3', 'compteur croissant');
});

test('un fichier qui échoue n’arrête pas les autres : import réussi avec la liste des manquants', async () => {
  reset(); const files = Array.from({ length: 12 }, (_, k) => modFile('m' + k));
  net.fail.add('/m5/'); const r = await mp.run(mkZip({ 'modrinth.index.json': mrIndex(files) }, 'b.mrpack'));
  assert.deepStrictEqual(r.bad, ['m5.jar']); assert.strictEqual(db.instances.length, 1); const d = instDir(db.instances[0]);
  assert.ok(fs.existsSync(path.join(d, 'mods/m0.jar')) && fs.existsSync(path.join(d, 'mods/m11.jar')) && !fs.existsSync(path.join(d, 'mods/m5.jar')), 'les 11 autres sont là');
});

test('plusieurs liens possibles : on essaie le suivant quand le premier échoue', async () => {
  reset(); net.fail.add('bad-host'); const f = modFile('dup', { downloads: ['https://cdn.modrinth.com/bad-host/dup.jar', 'https://github.com/o/r/releases/dup.jar'] });
  const r = await mp.run(mkZip({ 'modrinth.index.json': mrIndex([f]) }, 'c.mrpack')); assert.deepStrictEqual(r.bad, []); assert.ok(fs.existsSync(path.join(instDir(db.instances[0]), 'mods/dup.jar')));
});

test('trop d’échecs : import ANNULÉ, instance supprimée, dossier supprimé, plus aucune écriture ensuite', async () => {
  reset(); const root = path.join(data, 'instances'), ls = () => (fs.existsSync(root) ? fs.readdirSync(root) : []).sort(); const before = ls();
  net.failAll = true; const files = Array.from({ length: 10 }, (_, k) => modFile('x' + k));
  await assert.rejects(mp.run(mkZip({ 'modrinth.index.json': mrIndex(files), 'overrides/a.txt': 'a' }, 'd.mrpack')), /Trop de fichiers.*10 sur 10/);
  assert.strictEqual(db.instances.length, 0, 'aucune instance fantôme'); assert.deepStrictEqual(ls(), before, 'aucun dossier laissé sur le disque');
  await new Promise(r => setTimeout(r, 40)); assert.deepStrictEqual(ls(), before, 'rien ne réapparaît après l’échec (aucune écriture en retard)');
});

test('chemin piégé (../) : tout est refusé et annulé', async () => {
  reset(); await assert.rejects(mp.run(mkZip({ 'modrinth.index.json': mrIndex([modFile('ok'), { path: '../../evil.txt', downloads: ['https://cdn.modrinth.com/e'], hashes: {} }]) }, 'e.mrpack')), /Chemin refusé/); assert.strictEqual(db.instances.length, 0);
  reset(); const z = new Zip(); z.addFile('modrinth.index.json', Buffer.from(mrIndex([]))); z.addFile('overrides/ok.txt', Buffer.from('1')); z.addFile('overrides/../../pwned.txt', Buffer.from('x')); const f = path.join(tmp, 'f.mrpack'); z.writeZip(f);
  const before = fs.existsSync(path.join(data, 'pwned.txt')); try { await mp.run(f); } catch (e) { /* refusé ou ignoré : les deux sont acceptables */ } assert.ok(!fs.existsSync(path.join(data, 'pwned.txt')) && !before && !fs.existsSync(path.join(tmp, 'pwned.txt')), 'aucun fichier hors de l’instance');
});

test('formats de la vraie vie : dossier racine dans le zip, chemins Windows (\\), BOM, nom déjà pris', async () => {
  reset(); const root = mkZip({ 'MonPack/modrinth.index.json': '\uFEFF' + mrIndex([modFile('r1')], undefined, 'Pack Racine'), 'MonPack/overrides/config/a.txt': 'a' }, 'g.mrpack');
  assert.strictEqual(mp.detect(root), 'mrpack'); await mp.run(root); assert.ok(fs.existsSync(path.join(instDir(db.instances[0]), 'mods/r1.jar')) && fs.existsSync(path.join(instDir(db.instances[0]), 'config/a.txt')), 'racine + BOM');
  const z = new Zip(); z.addFile('modrinth.index.json', Buffer.from(mrIndex([]))); z.addFile('overrides\\config\\win.txt', Buffer.from('w')); const w = path.join(tmp, 'h.mrpack'); z.writeZip(w);
  await mp.run(w); assert.ok(fs.existsSync(path.join(instDir(db.instances[1]), 'config/win.txt')), 'chemins Windows');
  await mp.run(root); assert.deepStrictEqual(db.instances.map(i => i.name), ['Pack Racine', 'Mon Pack', 'Pack Racine (2)'], 'nom déjà pris : « (2) »');
  assert.strictEqual(mp.detect(mkZip({ 'readme.txt': 'x' }, 'i.zip')), '', 'fichier quelconque non reconnu'); await assert.rejects(mp.run(mkZip({ 'readme.txt': 'x' }, 'j.zip')), /pas un modpack reconnu/);
});

test('Minecraft inconnu ou index sans version : erreur claire, aucune instance créée', async () => {
  reset(); await assert.rejects(mp.run(mkZip({ 'modrinth.index.json': mrIndex([], { minecraft: '9.9.9', 'fabric-loader': '1' }) }, 'k.mrpack')), /9\.9\.9.*inconnu/); assert.strictEqual(db.instances.length, 0);
  await assert.rejects(mp.run(mkZip({ 'modrinth.index.json': mrIndex([], { 'fabric-loader': '1' }) }, 'l.mrpack')), /version de Minecraft/); assert.strictEqual(db.instances.length, 0);
});

test('loaders : Forge / NeoForge gardent leur version, Quilt reconnu', async () => {
  reset(); await mp.run(mkZip({ 'modrinth.index.json': mrIndex([], { minecraft: '1.20.1', forge: '47.3.0' }) }, 'm.mrpack')); await mp.run(mkZip({ 'modrinth.index.json': mrIndex([], { minecraft: '26.3', neoforge: '26.3.1' }, 'NF') }, 'n.mrpack')); await mp.run(mkZip({ 'modrinth.index.json': mrIndex([], { minecraft: '1.20.1', 'quilt-loader': '0.2' }, 'Q') }, 'o.mrpack'));
  assert.deepStrictEqual(db.instances.map(i => [i.loader, i.loaderVer || '']), [['forge', '47.3.0'], ['neoforge', '26.3.1'], ['quilt', '']]);
});

test('CurseForge : sans clé → refus AVANT de créer quoi que ce soit ; avec clé → mods, packs de ressources, overrides', async () => {
  reset(); const man = JSON.stringify({ minecraft: { version: '1.20.1', modLoaders: [{ id: 'forge-47.3.0', primary: true }] }, manufacturer: 'x', name: 'CF Pack', files: [{ projectID: 1, fileID: 1, required: true }, { projectID: 2, fileID: 2, required: true }, { projectID: 3, fileID: 3, required: true }, { projectID: 4, fileID: 4, required: false }], overrides: 'overrides' });
  const f = mkZip({ 'manifest.json': '\uFEFF' + man, 'overrides/config/cf.txt': 'c' }, 'p.zip'); assert.strictEqual(mp.detect(f), 'curseforge');
  cfStub.key = false; await assert.rejects(mp.run(f), /clé CurseForge/); assert.strictEqual(db.instances.length, 0, 'aucune instance sans clé'); cfStub.key = true;
  const r = await mp.run(f); const i = db.instances[0], d = instDir(i); assert.deepStrictEqual([r.kind, i.loader, i.loaderVer], ['curseforge', 'forge', '47.3.0']);
  assert.ok(fs.existsSync(path.join(d, 'mods/cfmod1.jar')) && fs.existsSync(path.join(d, 'mods/cfmod2.jar')) && fs.existsSync(path.join(d, 'resourcepacks/pack.zip')) && fs.existsSync(path.join(d, 'config/cf.txt')), 'fichiers placés');
  assert.ok(!net.dl.some(u => u.includes('/4/')), 'fichier facultatif ignoré'); assert.strictEqual(i.mods[0].icon, 'https://media.forgecdn.net/avatars/1/1/x.png', 'logo CurseForge repris'); assert.strictEqual(i.mods[1].icon, '', 'logo d’un autre serveur refusé'); assert.ok(i.mods.filter(m => !m.icon).every(m => m.noIcon || m.ik) && i.mods.filter(m => !m.icon).length === 1, 'les mods sans logo CurseForge ont été cherchés dans leur jar après l’import'); assert.strictEqual(i.mods.length, 2, '2 mods enregistrés (le zip est un pack de ressources)');
});

test('Prism / MultiMC : version, loader et dossier .minecraft', async () => {
  reset(); const f = mkZip({ 'Inst/instance.cfg': 'name=Mon Prism\n', 'Inst/mmc-pack.json': JSON.stringify({ components: [{ uid: 'net.minecraft', version: '1.20.1' }, { uid: 'net.fabricmc.fabric-loader', version: '0.15' }] }), 'Inst/.minecraft/mods/p.jar': 'p', 'Inst/.minecraft/options.txt': 'o' }, 'q.zip');
  assert.strictEqual(mp.detect(f), 'prism'); const r = await mp.run(f); const i = db.instances[0]; assert.deepStrictEqual([r.name, i.loader, i.version], ['Mon Prism', 'fabric', '1.20.1']); assert.ok(fs.existsSync(path.join(instDir(i), 'mods/p.jar')) && fs.existsSync(path.join(instDir(i), 'options.txt')));
  assert.ok(i.mods.some(m => m.file === 'p.jar'), 'mod enregistré');
});

test('l’interface n’est PAS figée pendant la copie de centaines de fichiers', async () => {
  reset(); const big = { 'modrinth.index.json': mrIndex([]) }; for (let k = 0; k < 400; k++) big['overrides/data/f' + k + '.bin'] = Buffer.alloc(40000, k % 255);
  const f = mkZip(big, 'r.mrpack'); let ticks = 0, maxGap = 0, last = Date.now(); const t = setInterval(() => { ticks++; const n = Date.now(); maxGap = Math.max(maxGap, n - last); last = n; }, 5);
  try { await mp.run(f); } finally { clearInterval(t); } assert.ok(ticks >= 3, 'la boucle d’événements a continué de tourner (' + ticks + ' battements)'); assert.ok(fs.existsSync(path.join(instDir(db.instances[0]), 'data/f399.bin')));
});

test('identification des mods : par lots, tolère une API en panne', async () => {
  reset(); const orig = fake.post; fake.post = async () => { throw new Error('API en panne'); };
  try { await mp.run(mkZip({ 'modrinth.index.json': mrIndex([modFile('z1'), modFile('z2')]) }, 's.mrpack')); } finally { fake.post = orig; }
  assert.strictEqual(db.instances[0].mods.length, 2, 'mods enregistrés quand même (titres de secours)'); assert.ok(db.instances[0].mods.every(m => m.pid.startsWith('imp')));
});
