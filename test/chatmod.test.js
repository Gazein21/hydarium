/* Chat : masquer un message seulement chez soi, vider une discussion chez soi, suppression d'un message d'un autre par l'administrateur d'un groupe.
   Même réseau SIMULÉ en mémoire que chatedit.test.js (pas de DHT) ; les signatures sont les vraies (Ed25519). */
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const C = require('../src/main/chat');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hyd-chatmod-')); test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const net = { nodes: new Map() };
const mkFr = (node, kp, key) => ({
  myKey: () => key, isRunning: () => true, isFriend: k => node.friends.has(k), isOnline: k => node.up && node.online.has(k) && net.nodes.get(k).up, friendName: k => (node.friends.has(k) ? net.nodes.get(k).name : ''), friendKeys: () => [...node.friends],
  sign: d => crypto.sign(null, Buffer.from(d), kp.privateKey).toString('hex'),
  sendTo: (k, m) => { if (!node.fr.isOnline(k)) return false; const peer = net.nodes.get(k); setImmediate(() => peer.chat.onMessage(key, JSON.parse(JSON.stringify(m)))); return true; },
});
const mk = name => {
  const kp = crypto.generateKeyPairSync('ed25519'), key = kp.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
  const node = { name, key, online: new Set(), friends: new Set(), up: true, kp, dir: path.join(tmp, name + crypto.randomBytes(2).toString('hex')) };
  node.fr = mkFr(node, kp, key); node.open = () => C.create({ dir: node.dir, friends: node.fr, myName: () => name, focused: () => false, notify() {}, saveMs: 5 });
  node.chat = node.open(); net.nodes.set(key, node); return node;
};
const link = (a, b) => { a.friends.add(b.key); b.friends.add(a.key); a.online.add(b.key); b.online.add(a.key); };
const settle = () => new Promise(r => setTimeout(r, 60));
const texts = (n, c) => n.chat.messages(c).filter(m => m.k !== 's').map(m => (m.del ? (m.dby ? '∅admin' : '∅') : m.x));
const group3 = async () => {   // Alice (admin) relie Bob et Karl, qui ne sont pas amis entre eux
  const A = mk('Alice'), B = mk('Bob'), K = mk('Karl'); link(A, B); link(A, K);
  const g = A.chat.createGroup('Équipe', [B.key, K.key]); await settle(); await settle(); B.chat.groupAccept(g); K.chat.groupAccept(g); return { A, B, K, g };
};

test('masquer un message : seulement chez soi, et il ne revient pas', async () => {
  const A = mk('Alice'), B = mk('Bob'); link(A, B);
  const m1 = A.chat.send(B.key, 'un'), m2 = A.chat.send(B.key, 'deux'); await settle();
  assert.deepStrictEqual(texts(B, A.key), ['un', 'deux']);
  assert.strictEqual(B.chat.hide(A.key, m1), true); assert.strictEqual(B.chat.hide(A.key, m1), false, 'déjà masqué : rien');
  assert.deepStrictEqual(texts(B, A.key), ['deux'], 'Bob ne voit plus « un »'); assert.deepStrictEqual(texts(A, B.key), ['un', 'deux'], 'Alice voit toujours tout : rien n’est envoyé');
  // remise tardive du même message (accusé perdu) : doublon ignoré, il ne réapparaît pas
  B.chat.onMessage(A.key, { t: 'dm', id: m1, ts: Date.now(), k: 't', x: 'un' }); assert.deepStrictEqual(texts(B, A.key), ['deux']);
  // une modification d'Alice sur un message que Bob a masqué ne le fait pas réapparaître
  A.chat.edit(B.key, m1, 'un (corrigé)'); await settle(); assert.deepStrictEqual(texts(B, A.key), ['deux']);
  // l'aperçu de la liste ignore le message masqué
  B.chat.hide(A.key, m2); assert.strictEqual(B.chat.list().convs[A.key].last, null, 'plus rien à montrer dans la liste');
  assert.throws(() => B.chat.hide(A.key, 'z'.repeat(24)), /introuvable/);
  // persistant : après rechargement du fichier
  B.chat.flush(); const again = B.open(); assert.deepStrictEqual(again.messages(A.key).map(m => m.x), [], 'toujours masqués après redémarrage');
});

test('masquer son propre message en attente : la livraison continue', async () => {
  const A = mk('Alice'), B = mk('Bob'); link(A, B); B.up = false;
  const m = A.chat.send(B.key, 'pour plus tard'); A.chat.hide(B.key, m); assert.deepStrictEqual(texts(A, B.key), []);
  B.up = true; A.chat.onOnline(B.key); await settle(); assert.deepStrictEqual(texts(B, A.key), ['pour plus tard'], 'Bob le reçoit quand même');
});

test('vider la discussion chez soi', async () => {
  const A = mk('Alice'), B = mk('Bob'); link(A, B);
  A.chat.send(B.key, 'a'); A.chat.send(B.key, 'b'); await settle(); assert.strictEqual(B.chat.list().convs[A.key].unread, 2);
  assert.strictEqual(B.chat.clear(A.key), 2); assert.deepStrictEqual(texts(B, A.key), []); assert.strictEqual(B.chat.list().convs[A.key].unread, 0, 'plus de non lus');
  assert.strictEqual(B.chat.clear(A.key), 0); assert.deepStrictEqual(texts(A, B.key), ['a', 'b'], 'chez Alice rien n’a changé');
  A.chat.send(B.key, 'c'); await settle(); assert.deepStrictEqual(texts(B, A.key), ['c'], 'les nouveaux messages arrivent normalement');
  assert.throws(() => B.chat.clear('nimporte'), /invalide/);
});

test('groupe : l’administrateur supprime le message d’un autre pour tout le monde', async () => {
  const { A, B, K, g } = await group3();
  const id = B.chat.send(g, 'message gênant'); await settle(); await settle(); await settle(); B.chat.send(g, 'message normal'); await settle(); await settle(); await settle();
  for (const n of [A, B, K]) assert.deepStrictEqual(texts(n, g), ['message gênant', 'message normal'], n.name);
  A.chat.moderate(g, id); await settle(); await settle(); await settle();
  for (const n of [A, B, K]) assert.deepStrictEqual(texts(n, g), ['∅admin', 'message normal'], n.name + ' : trace « supprimé par l’administrateur », le reste est intact');
  for (const n of [A, B, K]) assert.ok(!JSON.stringify(n.chat._db()).includes('message gênant'), n.name + ' : plus aucune trace du texte');
  assert.ok(!A.chat.messages(g).some(m => m.k === 'm'), 'la consigne n’apparaît jamais'); assert.strictEqual(A.chat.moderate(g, id), null, 'deux fois : rien');
  assert.ok(!A.chat._db().convs[g].msgs.some(m => m.k === 'm'), 'consigne livrée à tous : retirée de l’historique de l’administrateur');
  assert.match(K.chat.list().convs[g].last.text, /normal/, 'l’aperçu montre le dernier message');
});

test('groupe : seul l’administrateur peut ; un faux « supprimer » est jeté', async () => {
  const { A, B, K, g } = await group3();
  const idB = B.chat.send(g, 'de Bob'); await settle(); await settle(); await settle();
  const idA = A.chat.send(g, 'de Alice'); await settle(); await settle(); await settle();   // l'un après l'autre : l'ordre d'affichage (par heure) est alors toujours le même
  assert.throws(() => K.chat.moderate(g, idB), /administrateur/, 'un membre ordinaire ne peut pas');
  assert.throws(() => A.chat.moderate(g, idA), /introuvable/, 'l’administrateur supprime SES messages par « Supprimer », pas par la modération');
  assert.throws(() => A.chat.moderate(g, 'z'.repeat(24)), /introuvable/);
  // Karl forge une suppression « administrateur » signée de sa propre clé (signature valide, mais ce n’est pas l’administrateur)
  const p = JSON.stringify({ k: 'm', tg: idB }), fid = 'f1'.repeat(12), ts = Date.now();
  const frame = { t: 'g', gid: g.slice(2), id: fid, ts, a: K.key, p, sig: K.fr.sign(['hyd-chat1', g.slice(2), fid, ts, K.key, p].join('|')) };
  A.chat.onMessage(K.key, frame); B.chat.onMessage(K.key, frame); await settle();
  assert.deepStrictEqual(texts(A, g), ['de Bob', 'de Alice']); assert.deepStrictEqual(texts(B, g), ['de Bob', 'de Alice'], 'rien n’est supprimé');
  // le même, relayé comme s’il venait de l’administrateur mais avec la signature de Karl : refusé (signature fausse)
  const fid2 = 'f2'.repeat(12); B.chat.onMessage(A.key, { ...frame, id: fid2 }); assert.deepStrictEqual(texts(B, g), ['de Bob', 'de Alice']);
  // une consigne « m » en discussion privée n’a aucun sens : ignorée
  const A2 = mk('Alice2'), B2 = mk('Bob2'); link(A2, B2); const m = A2.chat.send(B2.key, 'privé'); await settle();
  B2.chat.onMessage(A2.key, { t: 'dm', id: 'e1'.repeat(12), ts: Date.now(), k: 'm', tg: m }); A2.chat.onMessage(B2.key, { t: 'dm', id: 'e2'.repeat(12), ts: Date.now(), k: 'm', tg: m });
  assert.deepStrictEqual(texts(B2, A2.key), ['privé']); assert.deepStrictEqual(texts(A2, B2.key), ['privé']);
  assert.throws(() => B2.chat.moderate(A2.key, m), /administrateur/);
});

test('groupe : suppression par l’administrateur arrivée AVANT le message, ou pendant qu’un membre est hors ligne', async () => {
  const { A, B, K, g } = await group3();
  // ordre inversé chez Karl : la consigne de l’administrateur arrive avant le message de Bob (relayé)
  const mid = 'ab'.repeat(12), ts = Date.now(), gid = g.slice(2);
  const pm = JSON.stringify({ k: 'm', tg: mid }), cid = 'cd'.repeat(12);
  K.chat.onMessage(A.key, { t: 'g', gid, id: cid, ts, a: A.key, p: pm, sig: A.fr.sign(['hyd-chat1', gid, cid, ts, A.key, pm].join('|')) });
  assert.deepStrictEqual(texts(K, g), [], 'rien à afficher pour l’instant');
  const pt = JSON.stringify({ k: 't', x: 'trop tard' });
  K.chat.onMessage(A.key, { t: 'g', gid, id: mid, ts: ts - 5, a: B.key, p: pt, sig: B.fr.sign(['hyd-chat1', gid, mid, ts - 5, B.key, pt].join('|')) });   // relayé par l’administrateur
  assert.deepStrictEqual(texts(K, g), ['∅admin'], 'le message arrive déjà supprimé');
  // membre hors ligne au moment de la suppression : il apprend la suppression à sa reconnexion
  const id = B.chat.send(g, 'à effacer'); await settle(); await settle(); await settle();
  K.up = false; A.online.delete(K.key); K.online.clear();
  A.chat.moderate(g, id); await settle(); assert.deepStrictEqual(texts(B, g), ['∅admin'], 'Bob (en ligne) le voit tout de suite');
  assert.deepStrictEqual(texts(K, g).slice(-1), ['à effacer'], 'Karl, hors ligne, ne sait encore rien');
  K.up = true; A.online.add(K.key); K.online.add(A.key); A.chat.onOnline(K.key); await settle(); await settle();
  assert.deepStrictEqual(texts(K, g).slice(-1), ['∅admin'], 'Karl le voit disparaître à sa reconnexion');
});

test('groupe : un message de Bob encore en attente est retiré de sa file quand l’administrateur le supprime', async () => {
  const { A, B, K, g } = await group3();
  K.up = false; B.chat.send(g, 'jamais pour Karl'); await settle(); await settle();   // Karl hors ligne : le message attend chez Bob / l’administrateur
  const m = B.chat.messages(g).find(x => x.x === 'jamais pour Karl'); assert.ok(m);
  A.chat.moderate(g, m.id); await settle(); await settle();
  const raw = B.chat._db().convs[g].msgs.find(x => x.id === m.id); assert.strictEqual(raw.del, 1); assert.deepStrictEqual(raw.pend, [], 'Bob ne renvoie plus rien'); assert.ok(!raw.p && !raw.sig);
  K.up = true; A.online.add(K.key); K.online.add(A.key); B.online.add(A.key); A.chat.onOnline(K.key); B.chat.onOnline(A.key); await settle(); await settle();
  assert.ok(!texts(K, g).includes('jamais pour Karl'), 'Karl ne le reçoit jamais');
});

test('branchements : canaux déclarés et utilisés', () => {
  const pre = fs.readFileSync(path.join(__dirname, '../src/preload.js'), 'utf8'), main = fs.readFileSync(path.join(__dirname, '../src/main/main.js'), 'utf8'), app = fs.readFileSync(path.join(__dirname, '../src/renderer/app.js'), 'utf8');
  for (const c of ['chat:hide', 'chat:clear', 'chat:mod']) { assert.ok(pre.includes(`'${c}'`), c + ' dans la liste blanche du preload'); assert.ok(main.includes(`on('${c}'`), c + ' dans main.js'); assert.ok(app.includes(`call('${c}'`), c + ' appelé par l’interface'); }
});
