/* Hydarium n'ouvre plus AUCUN port sur la box. Les anciennes versions en avaient ouvert (UPnP, sans durée limite) : au démarrage on les referme une fois.
   Fausse box UPnP : elle n'a PAS de méthode portMapping, donc toute tentative d'ouverture ferait échouer ce test. */
const assert = require('assert'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), base = path.join(root, 'src', 'main');
const stub = (file, exp) => { const f = require.resolve(file); require.cache[f] = { id: f, filename: f, loaded: true, exports: exp }; };
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }, eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };

// 1) aucune ouverture de port nulle part dans le code
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
for (const f of walk(path.join(root, 'src')).filter(f => /\.(js|html)$/.test(f))) { const t = fs.readFileSync(f, 'utf8'); ok(!/portMapping|host:upnp|host:net|host:reach|api\.ipify/.test(t), 'plus d’ouverture de port dans ' + path.relative(root, f)); }

// 2) fermeture des anciens ports
const calls = [], shown = []; let hosts, saves = 0;
const fake = { createClient: () => ({ portUnmapping(o, cb) { calls.push(o.public); if (o.public === 25567) return cb(new Error('SOAP error 714 NoSuchEntryInArray')); if (o.public === 25999) return cb(new Error('refusé par la box')); cb(null); }, close() {} }) };
stub(require.resolve('nat-upnp'), fake);
stub(path.join(base, 'platform.js'), { dataDir: () => '/tmp/x' }); stub(path.join(base, 'log.js'), { info() {}, warn() {}, error() {} });
stub(path.join(base, 'notify.js'), { show: (t, b) => shown.push([t, b]) }); stub(path.join(base, 'game.js'), {});
stub(path.join(base, 'store.js'), { get: () => ({ hosts }), save() { saves++; } });
hosts = [{ id: 'a', name: 'A', port: 25565, upnp: true, upnpPort: 25570 }, { id: 'b', name: 'B', port: 25566 }, { id: 'c', name: 'C', port: 25567, upnp: true }, { id: 'd', name: 'D', port: 25999, upnp: true }];
const H = require(path.join(base, 'host.js'));
(async () => {
  const closed = await H.closeLegacyPorts();
  eq(calls.sort(), [25565, 25567, 25570, 25999], 'ports refermés : l’ancien port ET le port actuel de chaque serveur concerné, rien pour le serveur sans UPnP');
  ok(!hosts[0].upnp && hosts[0].upnpPort === undefined, 'A : marqué fermé'); ok(!hosts[2].upnp, 'C : « déjà fermé côté box » compte comme fermé');
  ok(hosts[3].upnp === true, 'D : la box a refusé → on réessaiera au prochain démarrage'); ok(!hosts[1].upnp && !('upnp' in hosts[1] && hosts[1].upnp), 'B : jamais touché');
  eq(closed.length, 2, 'deux serveurs refermés'); eq(shown.length, 1, 'une seule notification'); ok(/refermé/.test(shown[0][0]), 'notification claire : ' + shown[0][0]);
  calls.length = 0; shown.length = 0; await H.closeLegacyPorts(); eq(calls.sort(), [25999], 'deuxième démarrage : seul le port resté en échec est retenté'); eq(shown.length, 0, 'plus de notification');
  // 3) adresse playit détectée → enregistrée toute seule pour le bon serveur, sans écraser ce que la personne a saisi
  hosts = [{ port: 25565 }, { port: 25566, playitAddress: 'mine.ply.gg:1234' }, { port: 25567, playitAddress: 'old.ply.gg:1111', playitAuto: 'old.ply.gg:1111' }, { port: 25568 }]; saves = 0;
  eq(H.syncPlayit({ 25565: 'a.ply.gg:1111', 25566: 'b.ply.gg:2222', 25567: 'c.ply.gg:3333' }), true, 'des adresses ont été enregistrées');
  eq(hosts[0].playitAddress, 'a.ply.gg:1111', 'serveur sans adresse : celle du tunnel de SON port'); eq(hosts[1].playitAddress, 'mine.ply.gg:1234', 'adresse saisie à la main : jamais écrasée');
  eq(hosts[2].playitAddress, 'c.ply.gg:3333', 'ancienne adresse automatique : mise à jour'); ok(hosts[3].playitAddress === undefined, 'serveur sans tunnel : rien'); eq(saves, 1, 'une seule sauvegarde');
  eq(H.syncPlayit({ 25565: 'a.ply.gg:1111', 25567: 'c.ply.gg:3333' }), false, 'rien de nouveau : rien à faire'); eq(saves, 1, 'pas de sauvegarde inutile'); eq(H.syncPlayit({}), false, 'aucun tunnel : rien');
  console.log(`legacyports : ${n} contrôles OK`); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
