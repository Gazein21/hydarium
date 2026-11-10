/* node test/clientfirst.test.js : le client Hydarium est attendu AVANT les téléchargements de Minecraft (donc présent dès le premier lancement),
   et sa progression est présentée comme un composant de Minecraft. FAUX script de fabrication : ni Gradle ni réseau. */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), Module = require('module');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydcf-')), data = path.join(tmp, 'data'), src = path.join(tmp, 'src'), logs = path.join(tmp, 'logs');
fs.mkdirSync(path.join(src, 'scripts'), { recursive: true }); fs.mkdirSync(path.join(src, 'client-mod', 'core', 'src'), { recursive: true }); fs.writeFileSync(path.join(src, 'client-mod', 'core', 'src', 'A.java'), 'class A{}');
const stubs = { './store': { get: () => ({ settings: {} }) }, './platform': { dataDir: () => data }, './log': { info() {}, warn() {}, dir: () => logs }, electron: { app: { isPackaged: false } } };
const load = Module._load; Module._load = function (r, ...a) { return stubs[r] || load.call(this, r, ...a); };
const mb = require('../src/main/modbuild');
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const counter = path.join(tmp, 'runs.txt'), mode = path.join(tmp, 'mode.txt'); fs.writeFileSync(counter, ''); fs.writeFileSync(mode, 'ok');
fs.writeFileSync(path.join(src, 'scripts', 'build-mods.js'), `
const fs=require('fs'),path=require('path'); const [, , , fam, ver] = process.argv, out = process.env.HYD_OUT; fs.appendFileSync(${JSON.stringify(counter)}, fam + '-' + ver + '\\n');
const P = require(${JSON.stringify(path.resolve(__dirname, '../src/main/modplan.js'))}); const m = fs.readFileSync(${JSON.stringify(mode)}, 'utf8').trim();
console.log('@@HYD ' + JSON.stringify({ p: 0.4, t: 'Gradle' }));
setTimeout(() => { if (m === 'ok') { fs.mkdirSync(out, { recursive: true }); const jar = P.jarName(fam + '-' + ver); fs.writeFileSync(path.join(out, jar), 'jar'); fs.writeFileSync(path.join(out, jar.replace('.jar', '.json')), JSON.stringify({ srcHash: P.hashSources(process.env.HYD_SRC, fam, ver), plan: 'fake', tier: 'full', draw: true }));
  console.log('@@HYD_RESULT ' + JSON.stringify({ ok: true, jar, plan: 'fake/full', tier: 'full', draw: true })); } else console.log('@@HYD_RESULT ' + JSON.stringify({ ok: false, error: 'réseau coupé', tried: ['x'] })); }, 200);`);
mb._setSources(() => ({ root: src, script: path.join(src, 'scripts', 'build-mods.js') }));
const runs = () => fs.readFileSync(counter, 'utf8').split('\n').filter(Boolean);
const I = (id, version, loader) => ({ id, version, loader: loader || 'fabric' });

(async () => {
  // 1) premier lancement, client absent : on l'ATTEND (le jeu ne démarre pas avant), progression présentée comme un composant de Minecraft
  ok(mb.status(I('a', '1.20.4')).mod === 'missing', 'avant : manquant');
  const ev = []; let done = false; const p = mb.ensureFirst(I('a', '1.20.4'), (ch, d) => ev.push([ch, d])).then(r => { done = true; return r; });
  await new Promise(r => setTimeout(r, 60)); ok(!done, 'le lancement attend la fabrication');
  const r1 = await p; ok(r1.state === 'ready' && done, 'prêt à la fin de l\'attente');
  ok(ev.length > 0 && ev.every(([ch]) => ch === 'game:progress'), 'progression envoyée sur le canal du jeu');
  const e = ev.find(([, d]) => d.task === 40)[1]; ok(e.type === 'Hydarium Client' && e.total === 100 && /^Composants Minecraft · Hydarium Client · Gradle 40 %$/.test(e.label), 'présentée comme un composant de Minecraft : ' + e.label);
  // 2) lancement suivant : déjà prêt, rien à attendre ni à refabriquer
  const ev2 = []; const r2 = await mb.ensureFirst(I('a', '1.20.4'), (c, d) => ev2.push(d)); ok(r2.state === 'ok' && !ev2.length && runs().length === 1, 'déjà prêt : aucune attente');
  // 3) fabrication déjà lancée à la création de l'instance : on REJOINT la même, sans seconde fabrication
  const pre = mb.ensure(I('b', '1.21.4'), null); ok(mb.status(I('b', '1.21.4')).mod === 'building', 'fabriqué en arrière-plan dès la création');
  const ev3 = []; const r3 = await mb.ensureFirst(I('b', '1.21.4'), (c, d) => ev3.push(d)); await pre;
  ok(r3.state === 'ready' && runs().length === 2 && ev3.length > 0, 'le premier lancement rejoint la fabrication en cours (' + runs().length + ' fabrications)');
  // 4) échec : le jeu démarre quand même (état « failed », pas d'exception), puis l'échec mémorisé n'est PAS retenté à chaque lancement
  fs.writeFileSync(mode, 'net'); const r4 = await mb.ensureFirst(I('c', '1.19.4'), null); ok(r4.state === 'failed' && runs().length === 3, 'échec : on continue sans le client');
  const r5 = await mb.ensureFirst(I('c', '1.19.4'), null); ok(r5.state === 'failed' && runs().length === 3, 'échec mémorisé : pas de nouvelle tentative au lancement suivant');
  // 5) rien à attendre : version non prise en charge, sources absentes
  ok((await mb.ensureFirst(I('d', '1.12.2', 'vanilla'), null)).state === 'unsupported', 'non pris en charge : pas d\'attente');
  mb._setSources(() => null); const rE = await mb.ensureFirst(I('e', '1.21.5'), null); ok(rE.state === 'missing' && runs().length === 3, 'sources absentes : pas d\'attente'); mb._setSources(() => ({ root: src, script: path.join(src, 'scripts', 'build-mods.js') }));
  // 6) dans play() : le client est attendu AVANT le loader et AVANT le téléchargement de Minecraft ; mode sans échec exclu ; pas de double lancement pendant l'attente
  const g = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'game.js'), 'utf8'), i = s => g.indexOf(s);
  ok(i('ensureFirst(inst, send)') > 0 && i('ensureFirst(inst, send)') < i('await mods.loader(eff, send)') && i('await mods.loader(eff, send)') < i('l.launch('), 'ordre dans play() : client → loader → téléchargements de Minecraft');
  ok(/if \(!opts\.safe\) \{[^]*ensureFirst/.test(g), 'mode sans échec : client non attendu'); ok(/if \(running \|\| preparing\)/.test(g), 'pas de 2e lancement pendant l\'attente');
  ok(/p\.label \|\|/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8')), 'l\'interface affiche le libellé « composant »');
  console.log('clientfirst : ' + n + ' vérifications OK');
})().catch(e => { console.error(e); process.exit(1); });
