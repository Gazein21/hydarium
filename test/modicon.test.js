/* Images des mods : lues dans les .jar (Fabric, Quilt, Forge, NeoForge, mcmod.info), mises en cache hors des données d'instance, pastille colorée de secours. */
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), Module = require('module');
const Zip = require('adm-zip');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydico-')), data = path.join(tmp, 'data'); let saves = 0; const db = { instances: [] };
const stubs = { './platform': { dataDir: () => data }, './store': { get: () => db, save: () => { saves++; } } };
const load = Module._load; Module._load = function (r, ...a) { return stubs[r] || load.call(this, r, ...a); };
const mi = require('../src/main/modicon');

const PNG = (n = 40, tag = 0) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(n, tag)]);   // en-tête PNG + octets quelconques (ni Electron ni décodeur ici : l'image est gardée telle quelle)
const jar = (name, entries) => { const z = new Zip(); for (const [n, d] of Object.entries(entries)) z.addFile(n, Buffer.isBuffer(d) ? d : Buffer.from(d)); const f = path.join(tmp, name); z.writeZip(f); return f; };
const same = (a, b) => Buffer.isBuffer(a) && a.equals(b);

test('Fabric : « icon » en chaîne, en table de tailles (la plus grande ≤ 256), chemin en majuscules/minuscules différentes', () => {
  assert.ok(same(mi.fromJar(jar('f1.jar', { 'fabric.mod.json': JSON.stringify({ id: 'a', icon: 'assets/a/icon.png' }), 'assets/a/icon.png': PNG(40, 1) })), PNG(40, 1)));
  assert.ok(same(mi.fromJar(jar('f2.jar', { 'fabric.mod.json': JSON.stringify({ id: 'a', icon: { 32: 'p32.png', 128: 'p128.png', 512: 'p512.png' } }), 'p32.png': PNG(40, 2), 'p128.png': PNG(40, 3), 'p512.png': PNG(40, 4) })), PNG(40, 3)), 'table : 128 (la plus grande ≤ 256)');
  assert.ok(same(mi.fromJar(jar('f3.jar', { 'fabric.mod.json': '\uFEFF' + JSON.stringify({ icon: './Logo.PNG' }), 'logo.png': PNG(40, 5) })), PNG(40, 5)), 'BOM, « ./ » et casse tolérés');
});

test('Quilt, Forge, NeoForge, mcmod.info', () => {
  assert.ok(same(mi.fromJar(jar('q.jar', { 'quilt.mod.json': JSON.stringify({ quilt_loader: { metadata: { icon: 'q.png' } } }), 'q.png': PNG(40, 6) })), PNG(40, 6)));
  assert.ok(same(mi.fromJar(jar('fg.jar', { 'META-INF/mods.toml': 'modLoader="javafml"\n[[mods]]\nmodId="x"\nlogoFile="logo/x.png"\n', 'logo/x.png': PNG(40, 7) })), PNG(40, 7)));
  assert.ok(same(mi.fromJar(jar('nf.jar', { 'META-INF/neoforge.mods.toml': '[[mods]]\n  logoFile = \'n.png\'\n', 'n.png': PNG(40, 8) })), PNG(40, 8)), 'NeoForge, guillemets simples');
  assert.ok(same(mi.fromJar(jar('mc1.jar', { 'mcmod.info': JSON.stringify([{ modid: 'm', logoFile: 'm.png' }]), 'm.png': PNG(40, 9) })), PNG(40, 9)), 'mcmod.info (tableau)');
  assert.ok(same(mi.fromJar(jar('mc2.jar', { 'mcmod.info': JSON.stringify({ modList: [{ logoFile: '/m2.png' }] }), 'm2.png': PNG(40, 10) })), PNG(40, 10)), 'mcmod.info (modList)');
});

test('sans déclaration : icon.png / logo.png devinés ; rien de valable → null, jamais d’exception', () => {
  assert.ok(same(mi.fromJar(jar('g1.jar', { 'fabric.mod.json': '{"id":"a"}', 'assets/a/icon.png': PNG(40, 11) })), PNG(40, 11)), 'assets/<id>/icon.png');
  assert.ok(same(mi.fromJar(jar('g2.jar', { 'logo.png': PNG(40, 12), 'assets/deep/er/icon.png': PNG(40, 13) })), PNG(40, 12)), 'le plus proche de la racine');
  assert.strictEqual(mi.fromJar(jar('n1.jar', { 'fabric.mod.json': '{"id":"a"}' })), null, 'aucun logo');
  assert.strictEqual(mi.fromJar(jar('n2.jar', { 'fabric.mod.json': '{"icon":"x.png"}', 'x.png': Buffer.from('pas une image') })), null, 'ce n’est pas un PNG / JPEG');
  assert.ok(same(mi.fromJar(jar('n3.jar', { 'fabric.mod.json': '{pas du json', 'META-INF/mods.toml': 'logoFile="t.png"', 't.png': PNG(40, 14) })), PNG(40, 14)), 'JSON cassé : on passe au format suivant');
  assert.strictEqual(mi.fromJar(jar('n4.jar', { 'fabric.mod.json': '{"icon":"big.png"}', 'big.png': PNG(30000, 1) })), null, 'image trop lourde pour être gardée telle quelle');
  assert.strictEqual(mi.fromJar(path.join(tmp, 'absent.jar')), null, 'fichier absent'); fs.writeFileSync(path.join(tmp, 'corrompu.jar'), 'PK pas un zip'); assert.strictEqual(mi.fromJar(path.join(tmp, 'corrompu.jar')), null, 'jar corrompu');
});

const inst = () => { const i = { id: 'I' + db.instances.length, mods: [] }; db.instances.push(i); fs.mkdirSync(path.join(data, 'instances', i.id, 'mods'), { recursive: true }); return i; };
const put = (i, file, entries) => fs.copyFileSync(jar('tmp-' + Math.random() + '.jar', entries), path.join(data, 'instances', i.id, 'mods', file));

test('fill : trouve les images manquantes, ignore celles qui existent, marque les mods sans logo UNE fois, gère .disabled, garde les fichiers absents pour plus tard', async () => {
  mi._reset(); const i = inst(); saves = 0;
  put(i, 'a.jar', { 'fabric.mod.json': '{"icon":"i.png"}', 'i.png': PNG(40, 21) }); put(i, 'b.jar.disabled', { 'fabric.mod.json': '{"icon":"i.png"}', 'i.png': PNG(40, 22) }); put(i, 'c.jar', { 'fabric.mod.json': '{"id":"c"}' });
  i.mods.push({ pid: 'a', file: 'a.jar' }, { pid: 'b', file: 'b.jar', disabled: true }, { pid: 'c', file: 'c.jar' }, { pid: 'd', file: 'd.jar' }, { pid: 'e', file: 'e.jar', icon: 'https://cdn.modrinth.com/x.png' });
  assert.strictEqual(await mi.fill(i.id), 2, 'deux images trouvées (a, et b désactivé)');
  const [a, b, c, d, e] = i.mods; assert.ok(a.ik && b.ik && a.ik !== b.ik && !a.icon, 'clé de cache (pas d’image dans les données de l’instance)'); assert.strictEqual(c.noIcon, true, 'sans logo : marqué'); assert.ok(!d.noIcon && !d.ik, 'fichier absent : pas marqué'); assert.ok(!e.ik && !e.noIcon, 'image déjà connue : intacte'); assert.ok(saves >= 1, 'données enregistrées');
  assert.ok(fs.existsSync(path.join(data, 'mod-icons', a.ik + '.png')) && same(fs.readFileSync(path.join(data, 'mod-icons', b.ik + '.png')), PNG(40, 22)), 'images dans le cache');
  saves = 0; assert.strictEqual(await mi.fill(i.id), 0, 'deuxième passage : rien à refaire (le jar sans logo n’est pas rouvert)'); assert.strictEqual(saves, 0, 'rien à enregistrer');
  put(i, 'd.jar', { 'fabric.mod.json': '{"icon":"i.png"}', 'i.png': PNG(40, 23) }); assert.strictEqual(await mi.fill(i.id), 1, 'le fichier absent est repris quand il arrive');
  assert.strictEqual(await mi.fill('inconnue'), 0, 'instance inconnue');
});

test('attach : joint l’image aux mods pour l’affichage sans toucher aux données', async () => {
  mi._reset(); const i = inst(); put(i, 'z.jar', { 'fabric.mod.json': '{"icon":"i.png"}', 'i.png': PNG(40, 31) }); i.mods.push({ pid: 'z', file: 'z.jar' }, { pid: 'y', file: 'y.jar', icon: 'https://cdn.modrinth.com/y.png' }, { pid: 'x', file: 'x.jar', noIcon: true }); await mi.fill(i.id);
  const out = mi.attach(i.mods); assert.ok(out[0].icon.startsWith('data:image/png;base64,') && Buffer.from(out[0].icon.split(',')[1], 'base64').equals(PNG(40, 31))); assert.strictEqual(out[1].icon, 'https://cdn.modrinth.com/y.png'); assert.ok(!out[2].icon); assert.ok(!i.mods[0].icon, 'base de données intacte');
  fs.rmSync(path.join(data, 'mod-icons'), { recursive: true, force: true }); mi._reset(); assert.strictEqual(mi.attach(i.mods)[0].icon, '', 'cache effacé : pas d’erreur, pastille de secours'); assert.deepStrictEqual(mi.attach(null), []);
});

test('interface : pastille colorée stable et variée, image quand elle existe ; branchements', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8');
  const g = n => new RegExp('const ' + n + ' = [^\\n]*').exec(src)[0]; const { tile, tcol } = new Function('esc', g('tcol') + '\n' + g('tile') + '\nreturn { tile, tcol };')(x => String(x).replace(/"/g, '&quot;'));
  assert.strictEqual(tcol('Sodium'), tcol('Sodium'), 'toujours la même couleur'); const cols = new Set(['Sodium', 'Iris Shaders', 'Lithium', 'JEI', 'Create', 'Mod sans image', 'Xaero'].map(tcol)); assert.ok(cols.size >= 6, 'couleurs variées : ' + [...cols]);
  assert.ok(/^<div class="mt" style="background:hsl\(\d+,40%,30%\)">S<\/div>$/.test(tile('', 'Sodium')) && tile('', '').includes('>?<') && tile('', '🙂 x').includes('🙂'), 'lettre ; « ? » si pas de nom ; émoji non coupé en deux');
  assert.ok(/^<img class="mt" src="https:\/\/x\/i\.png"/.test(tile('https://x/i.png', 'S')) && tile('', 'S', '#123456').includes('background:#123456'), 'image prioritaire ; couleur imposée respectée');
  assert.ok(src.includes("call('mods:icons', id0).then(n => { if (n && cur === id0 && page === 'detail') render(); })") && src.includes('ICONSEEN'), 'demande d’images à l’ouverture, une fois par instance et par session');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'main.js'), 'utf8'); assert.ok(main.includes("mods: require('./modicon').attach(s.mods)") && main.includes("on('mods:icons'"), 'images jointes à l’instance ouverte seulement');
  assert.ok(fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf8').includes("'mods:icons'"), 'canal autorisé');
});
