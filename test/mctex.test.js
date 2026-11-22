/* Icônes d'instances générées : objets de Minecraft extraits du jeu de la personne (jamais livrés dans le dépôt), choix automatique stable, aucun jar = décor seul. */
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm'), Module = require('module');
const Zip = require('adm-zip');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydtex-')), data = path.join(tmp, 'data'); let jars = [];
const stubs = { './platform': { dataDir: () => data }, './log': { info() {}, warn() {}, error() {} }, './skins': { localJars: () => jars } };
const load0 = Module._load; Module._load = function (r, ...a) { return stubs[r] || load0.call(this, r, ...a); };
const tex = require('../src/main/mctex');
const PNG = (w = 16, h = w, tag = 1) => { const b = Buffer.alloc(120, tag); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0); b.writeUInt32BE(13, 8); b.write('IHDR', 12); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); return b; };   // en-tête valide, contenu quelconque
const jar = (name, files) => { const z = new Zip(); for (const [n, d] of Object.entries(files)) z.addFile(n, d); const f = path.join(tmp, name); z.writeZip(f); return f; };
const T = 'assets/minecraft/textures/';
const reset = () => { fs.rmSync(path.join(data, 'cache'), { recursive: true, force: true }); tex._reset(); jars = []; };

test('la liste est fixe, sûre et sans doublon', () => {
  assert.ok(tex.LIST.length >= 20 && new Set(tex.LIST).size === tex.LIST.length); for (const n of tex.LIST) assert.ok(/^[a-z_]+$/.test(n), n);
  assert.ok(tex.valid('diamond_sword') && !tex.valid('../x') && !tex.valid('') && !tex.valid('creeper'));
});

test('extraction : dossier « item » (1.13+) et « items » (avant), 1re image des animations, textures non valides écartées', () => {
  reset(); const z = new Zip();
  z.addFile(T + 'item/diamond_sword.png', PNG(16, 16, 1)); z.addFile(T + 'items/bow.png', PNG(16, 16, 2)); z.addFile(T + 'item/compass_00.png', PNG(16, 16, 3));
  z.addFile(T + 'item/clock_00.png', PNG(16, 16 * 64, 4));   // bande animée non carrée
  z.addFile(T + 'item/emerald.png', Buffer.from('pas un png du tout, juste du texte assez long pour dépasser la taille minimale exigée'.repeat(3)));
  z.addFile(T + 'item/diamond.png', Buffer.concat([PNG(16, 16, 5), Buffer.alloc(70000)])); z.addFile(T + 'item/cake.png', PNG(512, 512, 6));
  assert.strictEqual(tex.extractFrom(z), 3);
  const r = tex.items(); assert.deepStrictEqual(Object.keys(r.img).sort(), ['bow', 'compass', 'diamond_sword'], 'seulement les textures valides'); assert.deepStrictEqual(r.order, tex.LIST);
  assert.ok(r.img.bow.startsWith('data:image/png;base64,') && Buffer.from(r.img.bow.split(',')[1], 'base64').equals(PNG(16, 16, 2)), 'octets intacts');
  assert.strictEqual(tex.extractFrom(z), 0, 'déjà en cache : rien de refait');
});

test('aucun jar du jeu : pas d’erreur, simplement aucune icône (le décor seul s’affiche)', () => {
  reset(); const r = tex.items(); assert.deepStrictEqual(r.img, {}); assert.deepStrictEqual(r.order, tex.LIST);
});

test('extraction à la demande depuis le jar local, un jar n’est ouvert qu’une fois par session, un nouveau jar est pris en compte', () => {
  reset(); jars = [jar('v1.jar', { [T + 'item/golden_apple.png']: PNG(16, 16, 7) })];
  assert.deepStrictEqual(Object.keys(tex.items().img), ['golden_apple']);
  fs.writeFileSync(jars[0], jar('v1b.jar', { [T + 'item/golden_apple.png']: PNG(16, 16, 7), [T + 'item/trident.png']: PNG(16, 16, 8) }) && fs.readFileSync(path.join(tmp, 'v1b.jar')));
  assert.deepStrictEqual(Object.keys(tex.items().img), ['golden_apple'], 'même jar : pas rouvert pendant la session');
  jars = [jar('v2.jar', { [T + 'item/ender_pearl.png']: PNG(16, 16, 9) }), jars[0]]; assert.deepStrictEqual(Object.keys(tex.items().img).sort(), ['ender_pearl', 'golden_apple'], 'jar plus récent ajouté, cache conservé');
  tex._reset(); assert.ok('trident' in tex.items().img, 'nouvelle session : le jar est relu');
});

test('un jar illisible n’empêche rien', () => {
  reset(); const bad = path.join(tmp, 'casse.jar'); fs.writeFileSync(bad, 'pas une archive'); jars = [bad, jar('ok.jar', { [T + 'item/book.png']: PNG(16, 16, 3) })];
  assert.deepStrictEqual(Object.keys(tex.items().img), ['book']);
});

test('choix automatique côté interface : stable, varié, saute les objets absents, respecte « aucun » et le choix explicite', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'src/renderer/app.js'), 'utf8');
  const h = /const hash = [^\n]+/.exec(app)[0], a = app.indexOf('let TEX = null'), b = app.indexOf('const cover = (i, w, h)'); assert.ok(a > 0 && b > a);
  const ctx = { call: async () => ({ order: tex.LIST, img: {} }), render() {}, imgT: 0, Date, Object, clearTimeout, setTimeout }; vm.createContext(ctx);
  vm.runInContext(h + '\n' + app.slice(a, b) + '\nthis.X = { itemOf, set: v => { TEX = v; TEXT = Date.now(); } };', ctx);
  const all = Object.fromEntries(tex.LIST.map(n => [n, 'data:' + n])), X = ctx.X; X.set({ order: tex.LIST, img: all });
  const ids = Array.from({ length: 60 }, (_, k) => 'id' + k.toString(36) + 'abc'); const picks = ids.map(id => X.itemOf({ id }));
  assert.deepStrictEqual(picks, ids.map(id => X.itemOf({ id })), 'stable'); assert.ok(new Set(picks).size >= 8, 'varié : ' + new Set(picks).size + ' objets pour 60 instances');
  assert.strictEqual(X.itemOf({ id: 'x', item: 'none' }), ''); assert.strictEqual(X.itemOf({ id: 'x', item: 'bow' }), 'data:bow');
  X.set({ order: tex.LIST, img: { book: 'data:book' } }); assert.strictEqual(X.itemOf({ id: 'x' }), 'data:book', 'seul objet disponible'); assert.strictEqual(X.itemOf({ id: 'x', item: 'bow' }), 'data:book', 'choix absent : retour à l’automatique');
  X.set({ order: tex.LIST, img: {} }); assert.strictEqual(X.itemOf({ id: 'x' }), '', 'aucune texture : pas d’objet');
});

test('branchements : jar de skins réutilisé, canal, enregistrement du choix validé, interface et styles', () => {
  const r = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), main = r('src/main/main.js'), app = r('src/renderer/app.js'), css = r('src/renderer/style.css');
  assert.ok(/require\('\.\/mctex'\)\.extractFrom\(z\)/.test(r('src/main/skins.js')) && /exports\.localJars = localJars/.test(r('src/main/skins.js')));
  assert.ok(r('src/preload.js').includes("'tex:items'") && main.includes("on('tex:items'"));
  assert.ok(/o\.item === 'none' \|\| require\('\.\/mctex'\)\.valid\(o\.item\)/.test(main), 'seuls « auto », « none » ou un objet de la liste sont enregistrés');
  assert.ok(/class="cobj"/.test(app) && /data-a="itemSet"/.test(app) && /itemSet: async d =>/.test(app) && /\.cobj img\{[^}]*image-rendering:pixelated/.test(css), 'dessin net (pixels non lissés)');
  assert.ok(/i\.img \? '' : itemBar\(i\)/.test(app), 'pas de choix d’objet quand une image perso est utilisée');
});
