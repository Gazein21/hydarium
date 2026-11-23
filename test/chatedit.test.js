/* Chat : modifier / supprimer un message, renommer un groupe. Réseau SIMULÉ en mémoire (pas de DHT) : les messages passent d'un « ami » à l'autre comme dans friends.js,
   la signature est la vraie (Ed25519, même format que friends.sign / friends.verify). */
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const C = require('../src/main/chat'), F = require('../src/main/friends');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hyd-chatedit-')); test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const net = { nodes: new Map(), drop: new Set() };   // drop : « a>b » = les messages de a vers b sont perdus (b hors ligne)
const mk = (name, friendsOf) => {
  const kp = crypto.generateKeyPairSync('ed25519'), key = kp.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex'), online = new Set();
  const node = { name, key, online, friends: friendsOf, up: true };
  const fr = {
    myKey: () => key, isRunning: () => true, isFriend: k => node.friends.has(k), isOnline: k => node.up && online.has(k) && net.nodes.get(k).up, friendName: k => (node.friends.has(k) ? net.nodes.get(k).name : ''), friendKeys: () => [...node.friends],
    sign: d => crypto.sign(null, Buffer.from(d), kp.privateKey).toString('hex'),
    sendTo: (k, m) => { if (!fr.isOnline(k)) return false; const peer = net.nodes.get(k); setImmediate(() => peer.chat.onMessage(key, JSON.parse(JSON.stringify(m)))); return true; },
  };
  node.chat = C.create({ dir: path.join(tmp, name + crypto.randomBytes(2).toString('hex')), friends: fr, myName: () => name, focused: () => false, notify() {}, saveMs: 5 }); node.fr = fr; net.nodes.set(key, node); return node;
};
const link = (a, b) => { a.friends.add(b.key); b.friends.add(a.key); a.online.add(b.key); b.online.add(a.key); };
const settle = () => new Promise(r => setTimeout(r, 60));
const disconnect = n => { n.up = false; };
const reconnect = async n => { n.up = true; for (const o of net.nodes.values()) if (o !== n && o.friends.has(n.key)) { o.chat.onOnline(n.key); n.chat.onOnline(o.key); } await settle(); await settle(); };
const texts = (n, c) => n.chat.messages(c).filter(m => m.k !== 's').map(m => (m.del ? '∅' : m.x) + (m.ed ? '*' : ''));

test('message privé : modifier puis supprimer, chez les deux', async () => {
  const A = mk('Alice', new Set()), B = mk('Bob', new Set()); link(A, B);
  const id = A.chat.send(B.key, 'salut'); await settle(); assert.deepStrictEqual(texts(B, A.key), ['salut']);
  assert.strictEqual(A.chat.edit(B.key, id, 'salut Bob'), true); await settle();
  assert.deepStrictEqual(texts(A, B.key), ['salut Bob*']); assert.deepStrictEqual(texts(B, A.key), ['salut Bob*'], 'Bob voit la nouvelle version, marquée modifiée');
  assert.strictEqual(B.chat.messages(A.key).length, 1, 'la consigne n’apparaît jamais comme un message'); assert.strictEqual(A.chat.messages(B.key).length, 1);
  assert.strictEqual(A.chat.edit(B.key, id, 'salut Bob'), false, 'rien ne change : rien n’est envoyé');
  A.chat.remove(B.key, id); await settle(); assert.deepStrictEqual(texts(A, B.key), ['∅*']); assert.deepStrictEqual(texts(B, A.key), ['∅*']);
  assert.strictEqual(B.chat.messages(A.key)[0].x, '', 'le texte a disparu'); assert.match(B.chat.list().convs[A.key].last.text, /supprimé/);
  assert.throws(() => A.chat.edit(B.key, id, 'encore'), /introuvable/, 'on ne modifie pas un message supprimé');
  assert.strictEqual(A.chat.remove(B.key, id), null, 'supprimer deux fois ne fait rien');
  const nothing = await (async () => { for (const x of [A, B]) assert.ok(!JSON.stringify(x.chat._db()).includes('salut'), 'plus aucune trace du texte'); return 1; })(); assert.ok(nothing);
});

test('on ne touche qu’à SES messages ; une consigne d’un autre est jetée', async () => {
  const A = mk('Alice', new Set()), B = mk('Bob', new Set()); link(A, B);
  const id = A.chat.send(B.key, 'à moi'); await settle();
  assert.throws(() => B.chat.edit(A.key, id, 'piraté'), /introuvable/); assert.throws(() => B.chat.remove(A.key, id), /introuvable/);
  B.chat.onMessage(A.key, { t: 'dm', id: 'b'.repeat(24), ts: Date.now(), k: 'e', tg: 'c'.repeat(24), x: 'x' });   // consigne sur un message inexistant : gardée sans effet
  // Bob forge une consigne visant le message d'Alice, mais « de la part de Bob » : l'auteur du message visé est Alice, donc refusé
  const bm = B.chat.send(A.key, 'bob dit'); await settle();
  B.chat.onMessage(A.key, { t: 'dm', id: 'd'.repeat(24), ts: Date.now(), k: 'd', tg: id }); A.chat.onMessage(B.key, { t: 'dm', id: 'e'.repeat(24), ts: Date.now(), k: 'd', tg: id });   // chez Alice : « Bob » veut supprimer le message d'Alice
  assert.deepStrictEqual(texts(A, B.key), ['à moi', 'bob dit'], 'le message d’Alice est intact'); assert.ok(bm);
  assert.throws(() => A.chat.edit(B.key, 'z'.repeat(24), 'x'), /introuvable/); assert.throws(() => A.chat.edit(B.key, id, '  '), /vide/);
  assert.throws(() => A.chat.sendCard(B.key, { k: 'srv', n: 'Mon serveur', code: 'x' }, ''), /Carte invalide/);
});

test('hors ligne : la modification et la suppression suivent le message, dans l’ordre', async () => {
  const A = mk('Alice', new Set()), B = mk('Bob', new Set()); link(A, B); disconnect(B); B.online.clear(); A.online.delete(B.key);
  const m1 = A.chat.send(B.key, 'un'), m2 = A.chat.send(B.key, 'deux'); A.chat.edit(B.key, m1, 'un (corrigé)'); A.chat.remove(B.key, m2);
  assert.deepStrictEqual(texts(A, B.key), ['un (corrigé)*', '∅*']);
  A.online.add(B.key); B.online.add(A.key); await reconnect(B);
  assert.deepStrictEqual(texts(B, A.key), ['un (corrigé)*'], 'Bob reçoit la version finale ; le message supprimé avant d’être reçu n’arrive jamais');
  await settle(); assert.ok(!A.chat._db().convs[B.key].msgs.some(m => m.k === 'e' || m.k === 'd'), 'les consignes livrées sont retirées de l’historique de l’expéditeur');
});

test('message supprimé avant d’avoir été reçu : il n’arrive jamais', async () => {
  const A = mk('Alice', new Set()), B = mk('Bob', new Set()); link(A, B); disconnect(B); A.online.delete(B.key);
  const m = A.chat.send(B.key, 'oups pas ça'); A.chat.remove(B.key, m); A.online.add(B.key); B.online.add(A.key); await reconnect(B);
  assert.deepStrictEqual(texts(B, A.key), [], 'Bob ne voit rien : ni le message, ni une trace');
  assert.deepStrictEqual(texts(A, B.key), ['∅*']);
});

test('consigne arrivée AVANT le message (ordre inversé) : appliquée dès qu’il arrive', async () => {
  const A = mk('Alice', new Set()), B = mk('Bob', new Set()); link(A, B); const t = Date.now(), id = 'a1'.repeat(12);
  B.chat.onMessage(A.key, { t: 'dm', id: 'c1'.repeat(12), ts: t, k: 'e', tg: id, x: 'version 2' }); assert.deepStrictEqual(texts(B, A.key), []);
  B.chat.onMessage(A.key, { t: 'dm', id, ts: t - 5, k: 't', x: 'version 1' }); assert.deepStrictEqual(texts(B, A.key), ['version 2*']);
  B.chat.onMessage(A.key, { t: 'dm', id: 'c1'.repeat(12), ts: t, k: 'd', tg: id }); assert.deepStrictEqual(texts(B, A.key), ['version 2*'], 'même identifiant : doublon ignoré');
  B.chat.onMessage(A.key, { t: 'dm', id: 'c2'.repeat(12), ts: t + 1, k: 'd', tg: id }); assert.deepStrictEqual(texts(B, A.key), ['∅*']);
  B.chat.onMessage(A.key, { t: 'dm', id: 'c3'.repeat(12), ts: t + 9, k: 'e', tg: id, x: 'ressuscité' }); assert.deepStrictEqual(texts(B, A.key), ['∅*'], 'un message supprimé ne revient pas');
  const old = 'f0'.repeat(12); B.chat.onMessage(A.key, { t: 'dm', id: 'c4'.repeat(12), ts: t + 20, k: 'e', tg: old, x: 'n2' }); B.chat.onMessage(A.key, { t: 'dm', id: 'c5'.repeat(12), ts: t + 10, k: 'e', tg: old, x: 'n1 (périmée)' });
  B.chat.onMessage(A.key, { t: 'dm', id: old, ts: t - 1, k: 't', x: 'n0' }); assert.strictEqual(B.chat.messages(A.key).find(m => m.id === old).x, 'n2', 'la modification la plus récente gagne');
});

test('groupe : modifier / supprimer pour tous, y compris pour un membre que l’auteur ne connaît pas (relais signé par l’admin)', async () => {
  const A = mk('Alice', new Set()), B = mk('Bob', new Set()), K = mk('Karl', new Set()); link(A, B); link(A, K);   // Bob et Karl ne sont pas amis : Alice (admin) les relie
  const g = A.chat.createGroup('Équipe', [B.key, K.key]); await settle(); await settle(); B.chat.groupAccept(g); K.chat.groupAccept(g);
  const id = B.chat.send(g, 'bonjour tous'); await settle(); await settle(); await settle();
  assert.deepStrictEqual(texts(A, g), ['bonjour tous']); assert.deepStrictEqual(texts(K, g), ['bonjour tous'], 'Karl le reçoit par l’admin');
  B.chat.edit(g, id, 'bonjour à tous'); await settle(); await settle(); await settle();
  for (const n of [A, B, K]) assert.deepStrictEqual(texts(n, g), ['bonjour à tous*'], n.name);
  assert.ok(!A.chat.messages(g).some(m => m.k === 'e'), 'rien d’affiché');
  B.chat.remove(g, id); await settle(); await settle(); await settle();
  for (const n of [A, B, K]) assert.deepStrictEqual(texts(n, g), ['∅*'], n.name);
  assert.throws(() => K.chat.remove(g, id), /introuvable/, 'Karl ne supprime pas le message de Bob');
  // un relais ne peut pas faire dire autre chose : consigne avec fausse signature jetée
  const id2 = A.chat.send(g, 'officiel'); await settle(); await settle();
  K.chat.onMessage(A.key, { t: 'g', gid: g.slice(2), id: '9'.repeat(24), ts: Date.now(), a: A.key, p: JSON.stringify({ k: 'd', tg: id2 }), sig: '0'.repeat(128) }); await settle();
  assert.deepStrictEqual(texts(K, g), ['∅*', 'officiel'], 'signature fausse : jetée');
});

test('groupe : seul l’administrateur renomme, tout le monde le voit', async () => {
  const A = mk('Alice', new Set()), B = mk('Bob', new Set()); link(A, B);
  const g = A.chat.createGroup('Vieux nom', [B.key]); await settle(); await settle(); B.chat.groupAccept(g);
  assert.throws(() => B.chat.groupRename(g, 'Pirate'), /administrateur/); assert.throws(() => A.chat.groupRename(g, '  <> '), /nom/);
  assert.strictEqual(A.chat.groupRename(g, 'Les Hydres'), true); assert.strictEqual(A.chat.groupRename(g, 'Les Hydres'), false, 'même nom : rien');
  await settle(); await settle(); assert.strictEqual(A.chat.list().groups[0].name, 'Les Hydres'); assert.strictEqual(B.chat.list().groups[0].name, 'Les Hydres');
  assert.ok(B.chat.messages(g).some(m => m.k === 's' && /Alice a renommé le groupe en « Les Hydres »/.test(m.x)), 'trace dans la discussion');
  assert.ok(A.chat.messages(g).some(m => m.k === 's' && /Tu as renommé/.test(m.x)));
  disconnect(B); A.online.delete(B.key); A.chat.groupRename(g, 'Hors ligne'); A.online.add(B.key); B.online.add(A.key); await reconnect(B); assert.strictEqual(B.chat.list().groups[0].name, 'Hors ligne', 'reçu à la reconnexion');
  assert.strictEqual(F.cleanName('x'.repeat(80), 'd').length, 32);
});
