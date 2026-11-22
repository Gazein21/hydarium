/* Data packs d'un serveur hébergé : liste, ajout (.zip vérifiés), retrait, activation / désactivation dans level.dat, installation Modrinth, tout refusé serveur en marche ;
   + les icônes d'instance se mettent à jour partout sans redémarrer le launcher. Faux serveur et faux Modrinth, aucun accès réseau. */
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm'), Module = require('module');
const Zip = require('adm-zip'), nbt = require('../src/main/nbt');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hyddp-')), root = path.join(tmp, 'srv'); let running = false, props = {}, db, saves = 0, dl = [];
const stubs = {
  './store': { get: () => db, save: () => { saves++; } }, './log': { info() {}, warn() {}, error() {} },
  './host': { dir: () => root, props: () => props, isRunning: () => running },
  './mods': { MR: 'https://api.modrinth.com/v2', fetchJson: async u => stubs._json(u), download: async (u, dest, sha) => { dl.push(u); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, 'zip:' + u); } },
};
const load0 = Module._load; Module._load = function (r, ...a) { return stubs[r] || load0.call(this, r, ...a); };
const dp = require('../src/main/hostdp');
const PNG = null, mc = '{"pack":{"pack_format":15}}';
const zip = (name, entries) => { const z = new Zip(); for (const [n, d] of Object.entries(entries)) z.addFile(n, Buffer.from(d)); const f = path.join(tmp, name); z.writeZip(f); return f; };
const DATAPACK = (n) => zip(n, { 'pack.mcmeta': mc, 'data/mypack/functions/a.mcfunction': 'say hi' });
const lvl = (en, di) => ({ t: 10, name: '', v: new Map([['Data', { t: 10, v: new Map([['LevelName', { t: 8, v: 'world' }], ['DataPacks', { t: 10, v: new Map([['Enabled', { t: 9, v: { et: 8, a: en } }], ['Disabled', { t: 9, v: { et: 8, a: di } }]]) }]]) }]]) });
const wd = () => path.join(root, 'world'), dd = () => path.join(wd(), 'datapacks'), has = n => fs.existsSync(path.join(dd(), n));
const readLv = () => { const r = nbt.parse(fs.readFileSync(path.join(wd(), 'level.dat'))), d = r.v.get('Data').v.get('DataPacks').v; return { en: d.get('Enabled').v.a, di: d.get('Disabled').v.a }; };
function setup(o = {}) {
  fs.rmSync(root, { recursive: true, force: true }); fs.mkdirSync(dd(), { recursive: true }); running = false; props = {}; saves = 0; dl = [];
  db = { hosts: [{ id: 'h1', name: 'Mon serveur', version: '1.20.1', type: 'vanilla', extras: [] }], instances: [] };
  if (o.level !== false) fs.writeFileSync(path.join(wd(), 'level.dat'), nbt.write(lvl(['vanilla', 'file/a.zip'], ['file/b.zip'])));
  if (o.packs !== false) { fs.writeFileSync(path.join(dd(), 'a.zip'), 'x'); fs.writeFileSync(path.join(dd(), 'b.zip'), 'xy'); fs.writeFileSync(path.join(dd(), 'c.zip'), 'xyz'); fs.mkdirSync(path.join(dd(), 'dossier-pack')); fs.writeFileSync(path.join(dd(), 'dossier-pack', 'pack.mcmeta'), mc); fs.writeFileSync(path.join(dd(), 'notes.txt'), 'x'); fs.writeFileSync(path.join(dd(), '.cache.zip'), 'x'); }
}

test('liste : zips et dossiers, état lu dans level.dat (activé / désactivé / pas encore connu), cachés et non-packs ignorés', () => {
  setup(); db.hosts[0].extras.push({ pid: 'AAAAAAAA', type: 'datapack', title: 'Super Pack', file: 'c.zip', icon: 'https://cdn.modrinth.com/x.png' });
  const r = dp.list('h1'); assert.deepStrictEqual([r.world, r.running, r.hasLevel, r.linked], ['world', false, true, false]);
  const m = Object.fromEntries(r.packs.map(p => [p.name, p])); assert.deepStrictEqual(Object.keys(m).sort(), ['a.zip', 'b.zip', 'c.zip', 'dossier-pack']);
  assert.deepStrictEqual([m['a.zip'].enabled, m['b.zip'].enabled, m['c.zip'].enabled, m['dossier-pack'].enabled], [true, false, null, null]);
  assert.deepStrictEqual([m['c.zip'].title, m['c.zip'].icon, m['a.zip'].title, m['dossier-pack'].kind, m['a.zip'].size], ['Super Pack', 'https://cdn.modrinth.com/x.png', 'a', 'dir', 1]);
});

test('serveur jamais démarré (pas de level.dat, pas de dossier) : liste vide sans erreur, état « inconnu »', () => {
  setup({ level: false, packs: false }); fs.rmSync(dd(), { recursive: true, force: true }); assert.deepStrictEqual(dp.list('h1').packs, []); assert.strictEqual(dp.list('h1').hasLevel, false);
  fs.mkdirSync(dd(), { recursive: true }); fs.writeFileSync(path.join(dd(), 'z.zip'), 'x'); assert.strictEqual(dp.list('h1').packs[0].enabled, null);
});

test('nom du monde : level-name de server.properties, refus d’un nom piégé', () => {
  setup(); props = { 'level-name': 'MonMonde' }; fs.mkdirSync(path.join(root, 'MonMonde', 'datapacks'), { recursive: true }); fs.writeFileSync(path.join(root, 'MonMonde', 'datapacks', 'q.zip'), 'x');
  assert.deepStrictEqual(dp.list('h1').packs.map(p => p.name), ['q.zip']); assert.strictEqual(dp.list('h1').world, 'MonMonde');
  for (const bad of ['../evil', '..', 'a/b']) { props = { 'level-name': bad }; assert.throws(() => dp.list('h1'), /invalide/, bad); }
});

test('ajout : copie les vrais data packs, explique le refus des autres (pack de ressources, sans pack.mcmeta, pas .zip, illisible), nom nettoyé', () => {
  setup({ packs: false }); const good = DATAPACK('Mon Pack (v2).zip');
  const res = zip('res.zip', { 'pack.mcmeta': mc, 'assets/minecraft/x.png': 'x' }), nomc = zip('sans.zip', { 'data/a.json': '{}' }), nodata = zip('vide.zip', { 'pack.mcmeta': mc }), jar = path.join(tmp, 'a.jar'), bad = path.join(tmp, 'casse.zip');
  fs.writeFileSync(jar, 'x'); fs.writeFileSync(bad, 'pas une archive');
  const r = dp.add('h1', [good, res, nomc, nodata, jar, bad, 'relatif.zip', 42]);
  assert.deepStrictEqual(r.added, ['Mon Pack (v2).zip']); assert.ok(has('Mon Pack (v2).zip'));
  const why = Object.fromEntries(r.skipped.map(x => [x.name, x.why])); assert.match(why['res.zip'], /pack de ressources/); assert.match(why['sans.zip'], /pack\.mcmeta/); assert.match(why['vide.zip'], /data\//); assert.match(why['a.jar'], /\.zip/); assert.match(why['casse.zip'], /illisible/);
  const weird = zip('a b$é&.zip', { 'pack.mcmeta': mc, 'data/x/y.json': '{}' }); assert.deepStrictEqual(dp.add('h1', [weird]).added, ['a b_é_.zip'], 'accents conservés, caractères dangereux remplacés');
});

test('retrait : fichier ou dossier, nettoie la fiche du catalogue, refuse les noms hors dossier', () => {
  setup(); db.hosts[0].extras.push({ pid: 'AAAAAAAA', type: 'datapack', title: 'X', file: 'c.zip' }); dp.remove('h1', 'c.zip'); assert.ok(!has('c.zip')); assert.deepStrictEqual(db.hosts[0].extras, []);
  dp.remove('h1', 'dossier-pack'); assert.ok(!has('dossier-pack'));
  for (const bad of ['../level.dat', '..', '', 'a/b.zip', '.cache.zip']) assert.throws(() => dp.remove('h1', bad), /invalide/, JSON.stringify(bad)); assert.throws(() => dp.remove('h1', 'nexiste.zip'), /introuvable/);
  assert.ok(fs.existsSync(path.join(wd(), 'level.dat')), 'rien d’autre n’a été touché');
});

test('désactiver / activer : level.dat réécrit (Enabled ↔ Disabled), sauvegarde créée, reste lisible', () => {
  setup(); dp.setEnabled('h1', 'a.zip', false); let l = readLv(); assert.deepStrictEqual([l.en, l.di], [['vanilla'], ['file/b.zip', 'file/a.zip']]); assert.ok(fs.existsSync(path.join(wd(), 'level.dat.hydarium.bak')));
  dp.setEnabled('h1', 'b.zip', true); dp.setEnabled('h1', 'b.zip', true); l = readLv(); assert.deepStrictEqual([l.en, l.di], [['vanilla', 'file/b.zip'], ['file/a.zip']], 'sans doublon');
  dp.setEnabled('h1', 'c.zip', true); assert.ok(readLv().en.includes('file/c.zip'), 'pack encore inconnu du monde : ajouté à la liste');
  assert.deepStrictEqual(dp.list('h1').packs.map(p => [p.name, p.enabled]).sort(), [['a.zip', false], ['b.zip', true], ['c.zip', true], ['dossier-pack', null]]);
  assert.throws(() => dp.setEnabled('h1', 'nexiste.zip', true), /introuvable/); assert.throws(() => dp.setEnabled('h1', '../x', true), /invalide/);
});

test('sans level.dat : message clair, rien n’est créé', () => {
  setup({ level: false }); assert.throws(() => dp.setEnabled('h1', 'a.zip', false), /premier démarrage/); assert.ok(!fs.existsSync(path.join(wd(), 'level.dat')));
});

test('serveur en marche : ajout, retrait, activation et installation refusés, rien ne change', async () => {
  setup(); running = true; const files = fs.readdirSync(dd()).sort();
  assert.throws(() => dp.add('h1', [DATAPACK('x.zip')]), /^Error: Arrête le serveur avant d’ajouter des data packs\.$/); assert.throws(() => dp.setEnabled('h1', 'a.zip', false), /avant de désactiver des data packs/); assert.throws(() => dp.setEnabled('h1', 'a.zip', true), /avant d’activer des data packs/); assert.throws(() => dp.remove('h1', 'a.zip'), /Arrête le serveur/); assert.throws(() => dp.setEnabled('h1', 'a.zip', false), /Arrête le serveur/);
  await assert.rejects(dp.install('h1', 'AAAAAAAA'), /Arrête le serveur/); assert.deepStrictEqual(fs.readdirSync(dd()).sort(), files); assert.strictEqual(dp.list('h1').running, true, 'la liste reste consultable');
  assert.throws(() => dp.list('inconnu'), /Serveur introuvable/);
});

test('installation Modrinth : data pack (.zip) pour la version du serveur, fiche enregistrée, .jar ignoré, CurseForge refusé', async () => {
  setup({ packs: false }); const V = id => ({ id, files: [{ filename: 'mod.jar', url: 'https://cdn.modrinth.com/a/mod.jar', primary: true }, { filename: 'Mon Pack.zip', url: 'https://cdn.modrinth.com/a/Mon Pack.zip', hashes: { sha1: 'abc' } }] }); let urls = [];
  stubs._json = async u => { urls.push(u); if (u.includes('/version?')) return u.includes('loaders') ? [V('V1')] : [V('V2')]; return { id: 'AAAAAAAA', title: 'Super Pack', icon_url: 'https://cdn.modrinth.com/icon.png' }; };
  const r = await dp.install('h1', 'AAAAAAAA'); assert.deepStrictEqual(r, { name: 'Mon Pack.zip', title: 'Super Pack' }); assert.ok(has('Mon Pack.zip') && dl.length === 1 && dl[0].endsWith('Mon Pack.zip'), 'le .zip, pas le .jar');
  assert.ok(urls[0].includes(encodeURIComponent('["1.20.1"]')) && urls[0].includes(encodeURIComponent('["datapack"]')), 'filtré par version et par type datapack');
  assert.deepStrictEqual(db.hosts[0].extras, [{ pid: 'AAAAAAAA', type: 'datapack', title: 'Super Pack', file: 'Mon Pack.zip', icon: 'https://cdn.modrinth.com/icon.png' }]);
  await dp.install('h1', 'AAAAAAAA'); assert.strictEqual(db.hosts[0].extras.length, 1, 'réinstaller ne duplique pas la fiche');
  await assert.rejects(dp.install('h1', 'cf123', 'curseforge'), /Modrinth/); await assert.rejects(dp.install('h1', 'pas-valide'), /invalide/);
  stubs._json = async u => u.includes('/version?') ? [{ id: 'V', files: [{ filename: 'x.jar', url: 'https://cdn.modrinth.com/x.jar' }] }] : {}; await assert.rejects(dp.install('h1', 'BBBBBBBB'), /ne propose pas de data pack/);
});

test('glisser-déposer sur la page d’un serveur : seuls les data packs, le reste est signalé', () => {
  setup({ packs: false }); const drop = require('../src/main/drop'), content = { importFiles() { throw new Error('ne doit pas être appelé'); } }; stubs['./content'] = content; stubs['./mods'].importFile = () => { throw new Error('ne doit pas être appelé'); };
  const good = DATAPACK('depose.zip'), res = zip('depose-res.zip', { 'pack.mcmeta': mc, 'assets/a.png': 'x' }), jar = path.join(tmp, 'm.jar'); fs.writeFileSync(jar, 'x');
  const r = drop.run('h1', [good, res, jar]); assert.strictEqual(r.counts.datapack, 1); assert.ok(has('depose.zip')); assert.deepStrictEqual(r.skipped, ['m.jar']); assert.strictEqual(r.errors.length, 1); assert.match(r.errors[0].msg, /pack de ressources/);
  running = true; const r2 = drop.run('h1', [DATAPACK('autre.zip')]); assert.strictEqual(r2.counts.datapack, 0); assert.match(r2.errors[0].msg, /Arrête le serveur/); assert.ok(!has('autre.zip'));
  delete stubs['./content'];
});

test('icônes : changer l’objet ou le décor recharge la liste des instances (plus de redémarrage nécessaire)', async () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'src/renderer/app.js'), 'utf8'), calls = [];
  const grab = k => new RegExp('\\n  ' + k + ': (async d => \\{[^\\n]*\\}),').exec(app)[1];
  const ctx = { setI: async o => { calls.push(['set', o]); }, refresh: async () => { calls.push(['refresh']); }, render() { calls.push(['render']); } }; vm.createContext(ctx);
  for (const k of ['cover', 'itemSet']) { calls.length = 0; await vm.runInContext('(' + grab(k) + ')', ctx)({ v: 'bow' }); assert.deepStrictEqual(calls.map(c => c[0]), ['set', 'refresh'], k + ' : enregistre puis recharge la liste globale'); }
  const r = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), main = r('src/main/main.js');
  for (const c of ['hostdp:list', 'hostdp:add', 'hostdp:remove', 'hostdp:toggle']) assert.ok(r('src/preload.js').includes("'" + c + "'") && main.includes("on('" + c + "'"), c);
  assert.ok(/type === 'datapack' && \(store\.get\(\)\.hosts \|\| \[\]\)\.some\(h => h\.id === id\)\) return require\('\.\/hostdp'\)\.install/.test(r('src/main/content.js')), 'le catalogue installe dans le monde du serveur');
  assert.ok(/dpCard\(h, DPK, on\)/.test(app) && /data-a="hdpTog"/.test(app) && /openBrowser\('datapack', 'inst'\)/.test(app) && /\.srv \? `<b>Dépose tes data packs ici/.test(app.replace(/\n/g, ' ')) || /Dépose tes data packs ici/.test(app));
});
