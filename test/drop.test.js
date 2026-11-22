/* Glisser-déposer : chaque fichier est reconnu par son CONTENU (jar, packs, shaders, data packs, mondes, modpacks) et rangé au bon endroit ; le reste est signalé, jamais ignoré en silence. */
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), Module = require('module');
const Zip = require('adm-zip');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hyddrop-')); const calls = [];
const stubs = {
  './content': { importFiles: (id, t, f) => { calls.push(['pack', id, t, path.basename(f[0])]); return f.length; }, dpImport: (id, w, f) => { calls.push(['dp', id, w, path.basename(f[0])]); return f.length; }, worldImport: (id, p) => { calls.push(['world', id, path.basename(p)]); if (/boom/.test(p)) throw new Error('Ce zip ne contient pas de monde Minecraft.'); } },
  './mods': { importFile: (id, p) => { calls.push(['mod', id, path.basename(p)]); } },
};
const load = Module._load; Module._load = function (r, ...a) { return stubs[r] || load.call(this, r, ...a); };
const drop = require('../src/main/drop');
const zip = (name, entries) => { const z = new Zip(); for (const [n, d] of Object.entries(entries)) z.addFile(n, Buffer.from(d)); const f = path.join(tmp, name); z.writeZip(f); return f; };
const file = (name, d = 'x') => { const f = path.join(tmp, name); fs.writeFileSync(f, d); return f; };

test('reconnaissance par le contenu', () => {
  const c = drop.classify;
  assert.strictEqual(c(file('a.jar')), 'mod');
  assert.strictEqual(c(zip('rp.zip', { 'pack.mcmeta': '{}', 'assets/minecraft/x.png': 'x' })), 'resourcepack');
  assert.strictEqual(c(zip('dp.zip', { 'pack.mcmeta': '{}', 'data/a/b.json': '{}' })), 'datapack');
  assert.strictEqual(c(zip('both.zip', { 'pack.mcmeta': '{}', 'data/a.json': '{}', 'assets/a.png': 'x' })), 'resourcepack');
  assert.strictEqual(c(zip('sh.zip', { 'shaders/final.fsh': 'x', 'shaders/lang/en_us.lang': 'x' })), 'shader');
  assert.strictEqual(c(zip('w1.zip', { 'level.dat': 'x', 'region/r.0.0.mca': 'x' })), 'world');
  assert.strictEqual(c(zip('w2.zip', { 'Mon monde/level.dat': 'x' })), 'world', 'dossier racine toléré');
  assert.strictEqual(c(zip('mr.zip', { 'modrinth.index.json': '{}', 'overrides/a.txt': 'x' })), 'modpack');
  assert.strictEqual(c(file('p.mrpack')), 'modpack');
  assert.strictEqual(c(zip('cf.zip', { 'manifest.json': '{}', 'overrides/config/a.toml': 'x' })), 'modpack');
  assert.strictEqual(c(zip('prism.zip', { 'Pack/instance.cfg': 'x', 'Pack/.minecraft/a': 'x' })), 'modpack');
  const wd = path.join(tmp, 'monde'); fs.mkdirSync(wd); fs.writeFileSync(path.join(wd, 'level.dat'), 'x'); assert.strictEqual(c(wd), 'world');
  const ed = path.join(tmp, 'vide'); fs.mkdirSync(ed); assert.strictEqual(c(ed), 'unknown');
});

test('ce qui n’est pas reconnu reste « unknown » : texte, image, zip sans rien d’utile, archive tronquée, fichier absent', () => {
  const c = drop.classify;
  assert.strictEqual(c(file('notes.txt')), 'unknown'); assert.strictEqual(c(file('a.png')), 'unknown');
  assert.strictEqual(c(zip('autre.zip', { 'readme.txt': 'x' })), 'unknown');
  assert.strictEqual(c(zip('mcmeta-sans-racine.zip', { 'Dossier/pack.mcmeta': '{}', 'Dossier/assets/a.png': 'x' })), 'unknown', 'Minecraft veut pack.mcmeta à la racine');
  assert.strictEqual(c(file('casse.zip', 'PK\u0003\u0004 pas une vraie archive')), 'unknown');
  assert.strictEqual(c(path.join(tmp, 'nexiste-pas.zip')), 'unknown');
});

test('une grosse archive (30 Mo, commentaire de fin) est reconnue : seule la table de fin du zip est lue', () => {
  const z = new Zip(); z.addFile('level.dat', Buffer.from('x')); z.addFile('region/r.0.0.mca', require('crypto').randomBytes(30e6)); z.addZipComment('monde de test — commentaire de fin d’archive');
  const f = path.join(tmp, 'gros.zip'); z.writeZip(f); assert.ok(fs.statSync(f).size > 29e6, 'archive volumineuse');
  const t = process.hrtime.bigint(), k = drop.classify(f), ms = Number(process.hrtime.bigint() - t) / 1e6;
  assert.strictEqual(k, 'world'); assert.ok(ms < 200, 'reconnu en ' + ms.toFixed(1) + ' ms (pas de lecture de tout le fichier)');
});

test('run : range chaque fichier au bon endroit, signale le reste, remonte les erreurs sans tout arrêter', () => {
  calls.length = 0;
  const r = drop.run('inst1', [file('m1.jar'), file('m2.jar'), path.join(tmp, 'rp.zip'), path.join(tmp, 'sh.zip'), path.join(tmp, 'dp.zip'), path.join(tmp, 'w1.zip'), path.join(tmp, 'mr.zip'), path.join(tmp, 'notes.txt'), path.join(tmp, 'rp.zip'), 'relatif/a.jar', 42]);
  assert.deepStrictEqual(r.counts, { mod: 2, resourcepack: 1, shader: 1, datapack: 1, world: 1 }, 'doublons, chemins relatifs et non-textes ignorés');
  assert.deepStrictEqual(r.modpacks, [path.join(tmp, 'mr.zip')]); assert.deepStrictEqual(r.skipped, ['notes.txt']); assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(calls.find(x => x[0] === 'dp'), ['dp', 'inst1', '__next__', 'dp.zip'], 'data pack : prochain nouveau monde');
  assert.deepStrictEqual(calls.find(x => x[0] === 'pack' && x[2] === 'shader'), ['pack', 'inst1', 'shader', 'sh.zip']);
});

test('run : une erreur sur un fichier n’empêche pas les autres ; sans instance, seuls les modpacks sont retenus', () => {
  calls.length = 0;
  const bad = zip('boom.zip', { 'level.dat': 'x' }), r = drop.run('inst1', [bad, file('ok.jar')]);
  assert.strictEqual(r.counts.mod, 1); assert.strictEqual(r.errors.length, 1); assert.match(r.errors[0].msg, /monde/);
  calls.length = 0; const s = drop.run('', [file('z.jar'), path.join(tmp, 'mr.zip'), path.join(tmp, 'rp.zip')]);
  assert.deepStrictEqual(calls, [], 'rien n’est copié sans instance'); assert.deepStrictEqual(s.modpacks, [path.join(tmp, 'mr.zip')]); assert.deepStrictEqual(s.skipped, ['z.jar', 'rp.zip']);
});

test('branchements : preload (canal + chemin du fichier), import de modpack déposé vérifié, fenêtre qui n’ouvre plus le fichier', () => {
  const r = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  assert.ok(r('src/preload.js').includes("'inst:drop'") && /webUtils\.getPathForFile/.test(r('src/preload.js')) && /pathOf:/.test(r('src/preload.js')));
  const main = r('src/main/main.js'); assert.ok(main.includes("on('inst:drop'") && /classify\(dropped\) !== 'modpack'/.test(main), 'un chemin déposé doit être un vrai modpack');
  const app = r('src/renderer/app.js'); assert.ok(/addEventListener\('drop', e => \{[^}]*e\.preventDefault\(\)/.test(app), 'preventDefault sur « drop » : sinon la fenêtre navigue vers le fichier');
  assert.ok(/call\('inst:drop'/.test(app) && /call\('modpack:import', file\)/.test(app));
});
