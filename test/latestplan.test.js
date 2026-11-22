/* Versions récentes (26.x) : le launcher fabrique le mod SUR PLACE pour la version exacte du jeu. Régression : le plan était « core » seul (draw: false) et ne copiait
   jamais les sources de dessin → le mod de ces versions ne contenait aucun code de HUD en jeu (le launcher dessinait par-dessus), quoi que fasse le reste du code. */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), Module = require('module');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydlp-')), data = path.join(tmp, 'data'), root = path.join(__dirname, '..');
let sourcesOn = true;
const stubs = { './store': { get: () => ({ settings: {} }) }, './platform': { dataDir: () => data }, './log': { info() {}, warn() {}, dir: () => tmp }, electron: { app: { isPackaged: false } } };
const load = Module._load; Module._load = function (r, ...a) { return stubs[r] || load.call(this, r, ...a); };
const mb = require('../src/main/modbuild'), P = require('../src/main/modplan'), B = require('../scripts/build-mods');
mb._setSources(() => sourcesOn ? { root, script: path.join(root, 'scripts', 'build-mods.js') } : null);
let n = 0; const ok = (c, m) => { assert(c, m); n++; };

// 1) un seul passage adaptatif, puis le repli sans dessin ; les autres époques inchangées
const pl = P.plansFor('fabric', '26.3').plans;
ok(pl.map(p => p.tier).join() === 'auto,core' && pl.map(p => p.draw).join() === 'true,false' && pl[0].adaptive === true && !pl[1].adaptive && pl.every(p => p.adapter === 'fabric-latest' && p.jdk === 25), '26.x : auto (adaptatif) puis core');
ok(P.plansFor('fabric', '1.21.1').plans.every((p, i, a) => p.draw === !p.id.endsWith('/core')), '1.21 : draw faux seulement pour core (inchangé)');

// 2) sources : plan adaptatif = HUD et écrans dans DES DOSSIERS SÉPARÉS compilés à part ; core = aucun dessin
const javaFiles = dir => { const out = []; const w = (d, rel) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) e.isDirectory() ? w(path.join(d, e.name), rel + e.name + '/') : e.name.endsWith('.java') && out.push(rel + e.name); }; w(path.join(dir, 'src'), ''); return out; };
const proj = tier => { const dir = path.join(tmp, 'p-' + tier); B.writeFabricProject(dir, '26.3', pl.find(p => p.tier === tier), { loader: '0.19.5', api: '0.166.2+26.3', loom: '1.17-SNAPSHOT' }); return { dir, f: javaFiles(dir) }; };
const core = proj('core'), auto = proj('auto'), has = (p, re) => p.f.some(x => re.test(x));
for (const [nom, p] of [['core', core], ['auto', auto]]) ok(has(p, /^main\/java\/.*HydariumClient\.java$/) && has(p, /ServerAddressMixin\.java$/) && has(p, /Compat\.java$/) && has(p, /P2pAddress\.java$/), nom + ' : mod de base, code P2P et cœur toujours dans le projet principal');
ok(!has(core, /Draw\.java|HudCanvas|HudScreen|MenuScreen/), 'core : aucun dessin');
ok(has(auto, /^draw\/java\/.*Draw\.java$/) && has(auto, /^draw\/java\/.*HudCanvas\.java$/) && has(auto, /^draw\/java\/.*Gx\.java$/), 'auto : HUD dans src/draw');
ok(has(auto, /^screens\/java\/.*HudScreen\.java$/) && has(auto, /^screens\/java\/.*MenuScreen\.java$/) && !has(auto, /^main\/java\/.*(Draw|HudScreen)\.java$/), 'auto : écrans dans src/screens, rien du dessin dans le projet principal (une erreur de dessin ne peut pas le casser)');
const gr = fs.readFileSync(path.join(auto.dir, 'build.gradle'), 'utf8');
ok(/compileDrawJava'\) \{ options\.failOnError = false/.test(gr) && /compileScreensJava'\) \{ options\.failOnError = false/.test(gr) && /from sourceSets\.draw\.output; from sourceSets\.screens\.output/.test(gr), 'build.gradle adaptatif : dessin et écrans compilés sans faire échouer, ajoutés au jar');
ok(!/sourceSets/.test(fs.readFileSync(path.join(core.dir, 'build.gradle'), 'utf8')), 'core : build.gradle simple');
const mixJson = JSON.parse(fs.readFileSync(path.join(auto.dir, 'src', 'main', 'resources', 'hydarium.mixins.json'), 'utf8')); ok(mixJson.client.includes('ServerAddressMixin'), 'mixin P2P déclaré');
ok(JSON.parse(fs.readFileSync(path.join(auto.dir, 'src', 'main', 'resources', 'fabric.mod.json'), 'utf8')).depends.minecraft === '26.3', 'le mod est construit pour la version exacte du jeu');

// 2b) le niveau réel se lit dans le jar fabriqué
const Zip = require('adm-zip'); const mkJar = names => { const z = new Zip(); for (const n of names) z.addFile('net/hydarium/client/' + n + '.class', Buffer.from('x')); const f = path.join(tmp, 'j' + Math.random() + '.jar'); z.writeZip(f); return f; };
let t = B.classTier(mkJar(['HydariumClient', 'Draw', 'HudCanvas', 'Gx', 'HudScreen', 'MenuScreen'])); ok(t.tier === 'full' && t.draw && t.screens, 'jar complet = full');
t = B.classTier(mkJar(['HydariumClient', 'Draw', 'HudCanvas', 'Gx'])); ok(t.tier === 'draw' && t.draw && !t.screens, 'jar sans écrans = draw');
t = B.classTier(mkJar(['HydariumClient', 'HudScreen'])); ok(t.tier === 'core' && !t.draw, 'jar sans HUD = core (un écran seul ne compte pas)');
t = B.classTier(path.join(tmp, 'absent.jar')); ok(t.tier === 'core', 'jar illisible = core');

// 3) l'empreinte des sources couvre les dossiers de dessin (modifier le HUD refabrique le mod chez tout le monde)
const h1 = P.hashSources(root, 'fabric', '26.3'); const d = path.join(root, 'client-mod', 'fabric-latest', 'src', 'draw', 'java', 'net', 'hydarium', 'client', 'Draw.java'), orig = fs.readFileSync(d);
try { fs.appendFileSync(d, '\n// test'); ok(P.hashSources(root, 'fabric', '26.3') !== h1, 'empreinte : change quand Draw.java change'); } finally { fs.writeFileSync(d, orig); }

// 4) jar livré par la CI (hydarium-latest.jar) : refusé s'il est pour une autre version du jeu ou sans dessin, QUAND on sait fabriquer le bon
const cdir = path.join(data, 'client'); fs.mkdirSync(cdir, { recursive: true });
const jar = path.join(cdir, 'hydarium-latest.jar'), meta = path.join(cdir, 'hydarium-latest.json'), I = v => ({ id: 'i' + v, version: v, loader: 'fabric' });
const put = m => { fs.writeFileSync(jar, 'jar'); const t = new Date(Date.now() + 60000); fs.utimesSync(jar, t, t); if (m === null) fs.rmSync(meta, { force: true }); else fs.writeFileSync(meta, JSON.stringify(m)); };
put({ mc: '26.3', draw: true }); ok(mb.status(I('26.3')).mod === 'ok', 'jar livré pour 26.3 avec dessin : utilisé');
put({ mc: '26.2', draw: true }); ok(mb.status(I('26.3')).mod === 'missing', 'jar livré pour 26.2 : pas utilisé en 26.3 (fabrication sur place)');
put({ mc: '26.3', draw: false }); ok(mb.status(I('26.3')).mod === 'missing', 'jar livré sans dessin : pas utilisé');
put(null); ok(mb.status(I('26.3')).mod === 'ok', 'jar livré sans fiche : utilisé comme avant');
sourcesOn = false; put({ mc: '26.2', draw: false }); ok(mb.status(I('26.3')).mod === 'ok', 'impossible de fabriquer ici : on garde le jar livré plutôt que rien');
sourcesOn = true;

// 5) les vraies erreurs de compilation des niveaux plus complets sont montrées
const mods = path.join(data, 'client', 'mods'); fs.mkdirSync(mods, { recursive: true }); ok(mb.notes() === '', 'rien à signaler au départ');
fs.writeFileSync(path.join(mods, 'hydarium-fabric-26.3.json'), JSON.stringify({ key: 'fabric-26.3', plan: 'fabric-latest/draw', tier: 'draw', draw: true, tried: ['fabric-latest/full : Le code ne compile pas → net/hydarium/client/HudScreen.java:25: error: method does not override or implement a method from a supertype', 'fabric-latest/draw : OK'] }));
ok(/Minecraft 26\.3/.test(mb.notes()) && /HudScreen\.java:25/.test(mb.notes()) && !/draw : OK/.test(mb.notes()), 'niveau dégradé : la cause réelle est affichée');
fs.writeFileSync(path.join(mods, 'hydarium-fabric-26.3.json'), JSON.stringify({ key: 'fabric-26.3', plan: 'fabric-latest/full', tier: 'full', draw: true, tried: ['fabric-latest/full : OK'] })); ok(mb.notes() === '', 'niveau complet : rien à signaler');
console.log('latestplan : ' + n + ' contrôles OK');
