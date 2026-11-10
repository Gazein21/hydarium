/* Invitations privées P2P : codes, tunnel complet de bout en bout (réseau HyperDHT LOCAL de test, aucun accès à Internet), refus sans le bon code,
   révocation, ports locaux stables, adresses enregistrées. Un faux serveur Minecraft (TCP) remplace le vrai. */
const assert = require('assert'), net = require('net'), path = require('path'), crypto = require('crypto');
const base = path.join(__dirname, '..', 'src', 'main');
const stub = (name, exp) => { const f = require.resolve(path.join(base, name)); require.cache[f] = { id: f, filename: f, loaded: true, exports: exp }; };
let db = { servers: [], hosts: [] }; stub('log.js', { info() {}, warn() {}, error() {} }); stub('store.js', { get: () => db, save() {} });
const P = require(path.join(base, 'p2p.js')), DHT = require('hyperdht'), createTestnet = require('hyperdht/testnet');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }, eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const listen = srv => new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));
const talk = (port, data, wait = 1500) => new Promise((res, rej) => { // se connecte, envoie, lit jusqu'à fermeture (ou délai)
  const s = net.connect(port, '127.0.0.1'), chunks = []; let t = setTimeout(() => s.destroy(), wait);
  s.on('connect', () => s.write(data)); s.on('data', d => chunks.push(d)); s.on('error', () => {});
  s.on('close', () => { clearTimeout(t); res(Buffer.concat(chunks)); });
});

(async () => {
  // 1) codes d'invitation
  const c = P.newCode(); ok(/^HYD(-[0-9A-HJKMNP-TV-Z]{4}){6}$/.test(c), 'format ' + c);
  eq(P.formatCode(P.parseCode(c)), c, 'aller-retour');
  eq(P.normalize(' ' + c.toLowerCase().replace(/-/g, ' ') + ' '), c, 'minuscules et espaces tolérés');
  eq(P.normalize(c.replace(/0/g, 'o').replace(/1/g, 'l')), c, 'O/0 et I/L/1 confondus tolérés');
  eq(P.normalize(c.slice(4)), c, 'préfixe HYD facultatif');
  for (const bad of ['', 'abc', c.slice(0, -1), c + 'A', 'HYD-UUUU-UUUU-UUUU-UUUU-UUUU-UUUU', null, undefined, 42]) eq(P.normalize(bad), '', 'refusé : ' + bad);
  const odd = Buffer.from(P.parseCode('HYD' + '0'.repeat(21))); // un code dont le corps commence par « HYD » ne doit pas être mangé
  eq(P.parseCode('HYD' + '0'.repeat(21)).equals(odd) && P.parseCode(P.formatCode(odd)).equals(odd), true, 'corps commençant par HYD');
  ok(P.newCode() !== P.newCode(), 'codes tous différents');
  ok(Buffer.compare(P._keys(P.parseCode(c)).publicKey, P._keys(P.parseCode(c)).publicKey) === 0, 'clé de l’hôte déterministe');
  ok(Buffer.compare(P._keys(P.parseCode(c)).publicKey, P._keys(P.parseCode(P.newCode())).publicKey) !== 0, 'autre code → autre clé');

  // 2) faux serveur Minecraft : renvoie ce qu'il reçoit, et compte les connexions qui l'ont VRAIMENT atteint
  let reached = 0; const mc = net.createServer(s => { reached++; s.on('error', () => {}); s.on('data', d => s.write(d)); }), mcPort = await listen(mc);
  const tn = await createTestnet(5); P._test.setBootstrap(tn.bootstrap);

  // 3) tunnel complet
  const code = P.newCode(); ok(await P.share('h1', mcPort, code), 'serveur partagé');
  const g = await P.join(code), g2 = await P.join(code); ok(g.port > 0 && g.port === g2.port, 'même invitation → même port local');
  eq(await talk(g.port, 'salut'), Buffer.from('salut'), 'un message traverse le tunnel et revient');
  ok(reached >= 1, 'le serveur Minecraft a bien reçu la connexion');
  const big = crypto.randomBytes(2 * 1024 * 1024), back = await talk(g.port, big, 20000);
  eq(crypto.createHash('sha256').update(back).digest('hex'), crypto.createHash('sha256').update(big).digest('hex'), '2 Mo identiques à l’aller-retour (contre-pression comprise)');
  const t1 = await P.test(code); ok(t1.ok, 'test() : hôte joignable, bon code ' + JSON.stringify(t1));
  // un invité qui reste connecté est compté côté hôte
  const held = net.connect(g.port, '127.0.0.1'); held.on('error', () => {}); await new Promise(r => held.once('connect', r)); held.write('x'); await sleep(1200);
  eq(P.status().shares.find(s => s.hostId === 'h1').peers, 1, 'un invité connecté est compté'); held.destroy(); await sleep(600);
  eq(P.status().shares.find(s => s.hostId === 'h1').peers, 0, 'compteur retombé à 0 après sa sortie');

  // 4) sans le bon code : la porte reste fermée MÊME en connaissant la clé de l'hôte
  const before = reached, spy = new DHT({ bootstrap: tn.bootstrap }); await spy.fullyBootstrapped();
  const sock = spy.connect(P._keys(P.parseCode(code)).publicKey); sock.on('error', () => {});
  const verdict = await new Promise(res => { let got = Buffer.alloc(0); const t = setTimeout(() => res('toujours ouvert'), 9000);
    sock.on('data', d => { got = Buffer.concat([got, d]); if (got.length === 32) sock.write(crypto.randomBytes(32)); if (got.length > 32) { clearTimeout(t); res('ENTRÉ'); } }); sock.on('close', () => { clearTimeout(t); res('fermé'); }); });
  eq(verdict, 'fermé', 'une fausse preuve est refusée et la connexion coupée');
  eq(reached, before, 'le serveur Minecraft n’a RIEN reçu de l’intrus'); await spy.destroy();
  const silent = new DHT({ bootstrap: tn.bootstrap }); await silent.fullyBootstrapped();
  const s2 = silent.connect(P._keys(P.parseCode(code)).publicKey); s2.on('error', () => {});
  const v2 = await new Promise(res => { const t = setTimeout(() => res('toujours ouvert'), 9000); s2.on('open', () => s2.write(Buffer.from('GET / HTTP/1.1\r\n\r\n'))); s2.on('data', () => {}); s2.on('close', () => { clearTimeout(t); res('fermé'); }); });
  eq(v2, 'fermé', 'un client qui ne répond pas au défi est coupé après 6 s'); eq(reached, before, 'toujours rien reçu côté Minecraft'); await silent.destroy();
  const bad = await P.test(P.newCode()); ok(!bad.ok && /^L’hôte est introuvable/.test(bad.error) && !/PEER_/.test(bad.error), 'mauvais code : message clair ' + JSON.stringify(bad));

  // 5) serveur Minecraft arrêté : l'invité est refusé proprement (aucun « OK »)
  const mcDead = net.createServer(), deadPort = await listen(mcDead); await new Promise(r => mcDead.close(r));
  const code3 = P.newCode(); await P.share('h3', deadPort, code3); const g3 = await P.join(code3);
  eq((await talk(g3.port, 'x', 6000)).length, 0, 'serveur local éteint : connexion coupée, rien ne revient'); P.unshare('h3'); P.leaveCode(code3);

  // 6) « Nouveau code » : l'ancien cesse de fonctionner, le nouveau marche
  const code2 = P.newCode(); ok(await P.share('h1', mcPort, code2), 'repartagé avec un nouveau code');
  const old = await P.test(code); ok(!old.ok, 'l’ancien code ne marche plus'); ok((await P.test(code2)).ok, 'le nouveau code marche');
  P.leaveCode(code); const g4 = await P.join(code2); eq(await talk(g4.port, 'neuf'), Buffer.from('neuf'), 'tunnel du nouveau code');

  // 7) arrêt du partage
  ok(P.unshare('h1'), 'partage arrêté'); ok(!P.unshare('h1'), 'déjà arrêté'); const gone = await P.test(code2); ok(!gone.ok, 'plus joignable après arrêt');
  eq(P.status().shares, [], 'plus aucun partage');

  // 8) ports locaux : stables, et jamais ceux de mes propres serveurs
  P.leaveCode(code2); const p1 = (await P.join(code2)).port; P.leaveCode(code2); const p2 = (await P.join(code2)).port; eq(p1, p2, 'port stable après fermeture / réouverture');
  P.leaveCode(code2); const p3 = (await P.join(code2, { avoid: [p1] })).port; ok(p3 !== p1, 'port évité'); P.leaveCode(code2);
  const hold = net.createServer(), hp = await listen(hold); const p4 = (await P.join(code2, { port: hp })).port; ok(p4 !== hp, 'port déjà occupé : on prend un autre port'); P.leaveCode(code2); hold.close();
  ok(p1 >= 40000 && p1 < 60000, 'port dans la plage prévue : ' + p1);

  // 9) serveurs enregistrés avec invitation : le port local est rouvert tout seul, l'adresse enregistrée suit
  await P.share('h1', mcPort, code2); db = { hosts: [{ port: 25565 }], servers: [{ id: 'a', name: 'Ami', addr: '127.0.0.1:1', p2p: code2 }, { id: 'b', name: 'Autre', addr: 'exemple.fr:25565' }] };
  eq(await P.ensureFor('exemple.fr:25565'), 'exemple.fr:25565', 'serveur ordinaire : adresse inchangée, aucun réseau P2P');
  const na = await P.ensureFor('127.0.0.1:1'); ok(/^127\.0\.0\.1:\d+$/.test(na) && na !== '127.0.0.1:1', 'adresse locale ouverte ' + na); eq(db.servers[0].addr, na, 'adresse enregistrée mise à jour');
  eq(await talk(+na.split(':')[1], 'ok'), Buffer.from('ok'), 'le jeu pourra se connecter à cette adresse');
  eq(await P.ensureFor(na), na, 'deuxième appel : même adresse'); ok(P.isOpen(code2), 'tunnel ouvert');

  // 10) ménage
  await P._test.reset(); mc.close(); await tn.destroy(); console.log(`p2p : ${n} contrôles OK`); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
