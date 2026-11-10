/* node test/modbuild.test.js : cache par version, dédoublonnage et mémoire des échecs de modbuild.js, avec un FAUX script de fabrication (ni Gradle ni réseau). */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), Module = require('module');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydmb-')), data = path.join(tmp, 'data'), src = path.join(tmp, 'src'), logs = path.join(tmp, 'logs');
fs.mkdirSync(path.join(src, 'scripts'), { recursive: true }); fs.mkdirSync(path.join(src, 'client-mod', 'core', 'src'), { recursive: true }); fs.writeFileSync(path.join(src, 'client-mod', 'core', 'src', 'A.java'), 'class A{}');
// faux « platform », « log » et « electron »
const settings = {}; // réglages simulés (autoMod)
const stubs = { './store': { get: () => ({ settings }) }, './platform': { dataDir: () => data }, './log': { info() {}, warn() {}, dir: () => logs }, electron: { app: { isPackaged: false } } };
const load = Module._load; Module._load = function (r, ...a) { return stubs[r] || load.call(this, r, ...a); };
const mb = require('../src/main/modbuild');
let n = 0; const ok = (c, m) => { assert(c, m); n++; };

// le faux script : compte ses lancements, écrit un jar + sa fiche, ou échoue selon FAKE_MODE (lu dans un fichier pour pouvoir changer en cours de route)
const counter = path.join(tmp, 'runs.txt'), mode = path.join(tmp, 'mode.txt'); fs.writeFileSync(counter, ''); fs.writeFileSync(mode, 'ok');
fs.writeFileSync(path.join(src, 'scripts', 'build-mods.js'), `
const fs=require('fs'),path=require('path'); const [, , , fam, ver] = process.argv, out = process.env.HYD_OUT; fs.appendFileSync(${JSON.stringify(counter)}, fam + '-' + ver + '\\n');
const P = require(${JSON.stringify(path.resolve(__dirname, '../src/main/modplan.js'))}); const m = fs.readFileSync(${JSON.stringify(mode)}, 'utf8').trim();
console.log('@@HYD ' + JSON.stringify({ p: 0.5, t: 'Test' }));
setTimeout(() => { if (m === 'ok') { fs.mkdirSync(out, { recursive: true }); const jar = P.jarName(fam + '-' + ver); fs.writeFileSync(path.join(out, jar), 'jar'); fs.writeFileSync(path.join(out, jar.replace('.jar', '.json')), JSON.stringify({ srcHash: P.hashSources(process.env.HYD_SRC, fam, ver), plan: 'fake', tier: 'full', draw: true }));
  console.log('@@HYD_RESULT ' + JSON.stringify({ ok: true, jar, plan: 'fake/full', tier: 'full', draw: true })); } else console.log('@@HYD_RESULT ' + JSON.stringify({ ok: false, error: m === 'compile' ? 'ne compile pas' : 'réseau coupé', compile: m === 'compile', tried: ['x'] })); }, 150);`);
mb._setSources(() => ({ root: src, script: path.join(src, 'scripts', 'build-mods.js') }));
const runs = () => fs.readFileSync(counter, 'utf8').split('\n').filter(Boolean);
const I = (id, version, loader) => ({ id, version, loader: loader || 'vanilla' });

(async () => {
  // 1) première instance 1.20.4 : fabrication ; état « manquant » avant, « en cours » pendant, « ok » après
  ok(mb.status(I('a', '1.20.4')).mod === 'missing', 'avant : manquant');
  const events = []; mb.onEvent = e => events.push(e.type);
  const prog = []; const p1 = mb.ensure(I('a', '1.20.4'), (c, d) => prog.push(d.pct));
  ok(mb.status(I('a', '1.20.4')).mod === 'building', 'pendant : en cours');
  // 2) deuxième instance de la MÊME version (Fabric cette fois) demandée pendant ce temps : pas de 2e fabrication
  const p2 = mb.ensure(I('b', '1.20.4', 'fabric'));
  const [r1, r2] = await Promise.all([p1, p2]);
  ok(r1.state === 'ready' && r2.state === 'ready' && runs().length === 1, 'une seule fabrication pour deux instances simultanées');
  ok(prog.includes(50), 'progression transmise'); ok(events.join() === 'start,done', 'événements');
  // 3) une troisième instance plus tard : rien à refaire
  const r3 = await mb.ensure(I('c', '1.20.4')); ok(r3.state === 'ready' && r3.reused && runs().length === 1, 'instance suivante de la même version : réutilisé');
  ok(mb.status(I('c', '1.20.4')).mod === 'ok' && mb.status(I('c', '1.20.4')).draw === true, 'statut ok + draw lu dans la fiche');
  // 4) une AUTRE version : nouvelle fabrication
  const r4 = await mb.ensure(I('d', '1.21.4')); ok(r4.state === 'ready' && runs().length === 2 && runs()[1] === 'fabric-1.21.4', 'autre version : fabriquée');
  // 5) sources modifiées (mise à jour du launcher) : le mod est refabriqué
  fs.writeFileSync(path.join(src, 'client-mod', 'core', 'src', 'A.java'), 'class A{int x;}');
  ok(mb.status(I('a', '1.20.4')).mod === 'missing', 'sources changées : à refaire'); const r5 = await mb.ensure(I('a', '1.20.4')); ok(r5.state === 'ready' && runs().length === 3, 'refabriqué');
  // 6) échec de COMPILATION : mémorisé, pas retenté ; force le retente
  fs.writeFileSync(mode, 'compile'); const r6 = await mb.ensure(I('e', '1.20.6')); ok(r6.state === 'failed' && runs().length === 4, 'échec de compilation');
  const r7 = await mb.ensure(I('f', '1.20.6')); ok(r7.state === 'failed' && r7.remembered && runs().length === 4, 'échec mémorisé : pas retenté');
  ok(mb.status(I('f', '1.20.6')).mod === 'failed', 'statut failed');
  fs.writeFileSync(mode, 'ok'); const r8 = await mb.ensure(I('f', '1.20.6'), null, { force: true }); ok(r8.state === 'ready' && runs().length === 5, 'force : retenté et réussi');
  // 7) échec RÉSEAU : mémorisé 10 min seulement
  fs.writeFileSync(mode, 'net'); const r9 = await mb.ensure(I('g', '1.20.2')); ok(r9.state === 'failed', 'échec réseau');
  const ff = path.join(data, 'client', 'mods', 'hydarium-fabric-1.20.2.fail.json'), j = JSON.parse(fs.readFileSync(ff, 'utf8')); j.at = Date.now() - 11 * 60 * 1000; fs.writeFileSync(ff, JSON.stringify(j));
  fs.writeFileSync(mode, 'ok'); const r10 = await mb.ensure(I('g', '1.20.2')); ok(r10.state === 'ready', 'réseau : retenté après 10 min');
  // 8) non pris en charge : rien n'est lancé
  const before = runs().length; for (const [v, l] of [['1.12.2', 'vanilla'], ['1.20.1', 'neoforge'], ['1.16.5', 'forge'], ['1.8.9', 'vanilla']]) { const r = await mb.ensure(I('z', v, l)); ok(['unsupported', 'needs-forge'].includes(r.state), v + '/' + l + ' non pris en charge'); }
  ok(runs().length === before, 'aucune fabrication pour les versions non prises en charge');
  // 9) prepare() : en arrière-plan à la création, sans bloquer ; une 2e création de la même version se joint
  settings.autoMod = false; mb.prepare(I('p0', '1.19.4')); ok(mb.status(I('p0', '1.19.4')).mod !== 'building', 'prepare : réglage autoMod désactivé → rien n\'est fabriqué à la création (ce sera au premier lancement)'); delete settings.autoMod;
  settings.autoMod = true; // réglage facultatif : préparation dès la création
  mb.prepare(I('p1', '1.19.4')); mb.prepare(I('p2', '1.19.4')); ok(mb.status(I('p1', '1.19.4')).mod === 'building', 'prepare : en cours');
  await mb.ensure(I('p3', '1.19.4')); ok(runs().filter(x => x === 'fabric-1.19.4').length === 1, 'prepare ×2 + ensure : une seule fabrication');
  // 10) un ancien jar livré (nom historique) est utilisé sans rien fabriquer
  fs.mkdirSync(path.join(data, 'client'), { recursive: true }); fs.writeFileSync(path.join(data, 'client', 'hydarium-1.20.1.jar'), 'x'); const b2 = runs().length;
  const r11 = await mb.ensure(I('L', '1.20.1')); ok(r11.state === 'ready' && r11.reused && runs().length === b2, 'jar livré réutilisé');
  // 11) un jar livré PÉRIMÉ (plus vieux que les sources) ne bloque plus : le mod est refabriqué ET c'est le jar neuf qui est utilisé
  const old = path.join(data, 'client', 'hydarium-1.20.1.jar'), t0 = new Date(Date.now() - 3600 * 1000); fs.utimesSync(old, t0, t0); const b3 = runs().length;
  ok(mb.status(I('L', '1.20.1')).mod === 'missing', 'jar livré plus vieux que les sources : plus considéré à jour');
  const r12 = await mb.ensure(I('L', '1.20.1')); ok(r12.state === 'ready' && runs().length === b3 + 1, 'jar livré périmé : refabriqué');
  ok(/hydarium-fabric-1\.20\.1\.jar$/.test(mb.jarFor('fabric-1.20.1')), 'le jar utilisé est le jar neuf, pas le vieux jar livré'); ok(mb.status(I('L', '1.20.1')).mod === 'ok', 'statut ok après refabrication');
  // un jar livré récent (installeur sans sources, ou plus récent que les sources) reste utilisé tel quel
  const nw = new Date(Date.now() + 3600 * 1000); fs.utimesSync(old, nw, nw); fs.rmSync(path.join(data, 'client', 'mods'), { recursive: true, force: true }); const b4 = runs().length;
  const r13 = await mb.ensure(I('L', '1.20.1')); ok(r13.state === 'ready' && r13.reused && runs().length === b4, 'jar livré récent : réutilisé'); ok(/hydarium-1\.20\.1\.jar$/.test(mb.jarFor('fabric-1.20.1')), 'et c\'est lui qui est utilisé');
  console.log('modbuild : ' + n + ' contrôles OK'); fs.rmSync(tmp, { recursive: true, force: true });
})().catch(e => { console.error(e); process.exit(1); });
