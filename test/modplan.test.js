/* node test/modplan.test.js : vérifie la logique de choix des plans (aucun réseau, aucun Gradle). */
const assert = require('assert'), P = require('../src/main/modplan');
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const ids = (f, v) => { const r = P.plansFor(f, v); return r.ok ? r.plans.map(p => p.id) : null; };

// comparaison de versions (ancien schéma < nouveau schéma 26.x)
ok(P.cmp('1.20.4', '1.20.5') < 0 && P.cmp('1.21', '1.20.6') > 0 && P.cmp('1.9', '1.14') < 0 && P.cmp('26.1', '1.21.11') > 0, 'cmp');
ok(P.parse('24w14a') === null && P.parse('1.21-pre1') === null, 'snapshots non reconnus');

// description d'instance → clé partagée (même version = même mod, quel que soit le nom / l'instance)
const d = (v, l) => P.describe({ version: v, loader: l });
ok(d('1.20.4', 'vanilla').key === 'fabric-1.20.4' && d('1.20.4', 'fabric').key === 'fabric-1.20.4', 'vanilla et fabric partagent le mod Fabric');
ok(d('1.8.9', 'forge').key === 'forge-1.8.9' && d('1.8.9', 'vanilla').needsForge === true, '1.8.9');
ok(!d('1.20.1', 'neoforge').ok && !d('1.20.1', 'quilt').ok && !d('1.12.2', 'vanilla').ok && !d('24w14a', 'vanilla').ok, 'non pris en charge');
ok(d('26.1.2', 'vanilla').key === 'fabric-26.1.2', 'nouveau schéma');

// plans par époque
ok(JSON.stringify(ids('fabric', '1.20.1')) === '["fabric-120/full","fabric-120/core"]', '1.20.1');
ok(ids('fabric', '1.20.4')[0] === 'fabric-120/full' && ids('fabric', '1.20.5')[0] === 'fabric-121/full', 'frontière 1.20.4 / 1.20.5');
ok(JSON.stringify(ids('fabric', '1.19.4')) === '["fabric-120/core"]' && ids('fabric', '1.19.2') === null, '1.19.x : l\'essentiel seulement ; avant 1.19.3 : non');
ok(ids('fabric', '1.21.1').slice(-1)[0] === 'fabric-120/core' && ids('fabric', '1.21.1').length === 3, 'dernier recours 120/core');
const p121 = P.plansFor('fabric', '1.21.4').plans[0]; ok(p121.loom === 'latest' && p121.gradle === 'current' && p121.jdk === 21, '1.21.4 : outils récents');
const p120 = P.plansFor('fabric', '1.20.1').plans[0]; ok(p120.loom === '1.6-SNAPSHOT' && p120.jdk === 17 && p120.draw === true, '1.20.1 : outils figés');
const pl = P.plansFor('fabric', '26.1.2').plans; ok(pl.length === 1 && pl[0].adapter === 'fabric-latest' && pl[0].draw === false && pl[0].jdk === 25, '26.x');
ok(ids('fabric', '1.20.1').every((id, i, a) => P.plansFor('fabric', '1.20.1').plans[i].draw === !id.endsWith('/core')), 'draw faux seulement pour core');
ok(P.plansFor('forge', '1.8.9').plans[0].static === true && P.plansFor('forge', '1.12.2').ok && P.plansFor('forge', '1.12.2').plans[0].generated === true && !P.plansFor('forge', '1.16.5').ok, 'forge');

// anciens jars livrés : réutilisés sans rien fabriquer
ok(P.legacyJar('fabric-1.20.1') === 'hydarium-1.20.1.jar' && P.legacyJar('fabric-1.21') === 'hydarium-1.21.1.jar' && P.legacyJar('fabric-26.2') === 'hydarium-latest.jar' && P.legacyJar('forge-1.8.9') === 'hydarium-1.8.9.jar' && P.legacyJar('fabric-1.20.4') === '', 'legacyJar');
ok(P.jarName('fabric-1.20.4') === 'hydarium-fabric-1.20.4.jar', 'jarName');
console.log('modplan : ' + n + ' contrôles OK');
