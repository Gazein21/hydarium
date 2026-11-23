/* Chat vocal (voice.js) : sonnerie, décrochage, flux audio, refus, occupé, limites, coupures.
   Réseau SIMULÉ en mémoire (comme chatedit.test.js) : sendTo = messages d'ami, openStream = flux duplex dont la première ligne est lue puis remise à onStream (comme friends.js). */
const test = require('node:test'), assert = require('node:assert'), crypto = require('crypto'), { Duplex } = require('stream');
const V = require('../src/main/voice');

function pair() {
  let a, b; const mk = peer => new Duplex({
    read() {}, write(c, e, cb) { const p = peer(); if (p && !p.destroyed) p.push(c); cb(); },
    final(cb) { const p = peer(); if (p) p.push(null); cb(); }, destroy(err, cb) { const p = peer(); if (p && !p.destroyed) setImmediate(() => p.destroy()); cb(err); },
  });
  a = mk(() => b); b = mk(() => a); return [a, b];
}
const net = new Map(), settle = (ms = 30) => new Promise(r => setTimeout(r, ms));
const mk = name => {
  const key = crypto.randomBytes(32).toString('hex'), n = { name, key, friends: new Set(), up: true, notes: [], rx: [], states: [], ended: [], rings: [] };
  n.fr = {
    isRunning: () => true, isFriend: k => n.friends.has(k), isOnline: k => n.up && net.get(k) && net.get(k).up && n.friends.has(k), friendName: k => (net.get(k) ? net.get(k).name : ''),
    sendTo: (k, m) => { if (!n.fr.isOnline(k)) return false; const p = net.get(k); setImmediate(() => p.voice.onMessage(key, JSON.parse(JSON.stringify(m)))); return true; },
    openStream: k => {
      const [mine, theirs] = pair(), p = net.get(k); setImmediate(() => mine.emit('open'));
      theirs.once('data', d => { const i = d.indexOf(10), m = JSON.parse(d.subarray(0, i).toString()); if (i + 1 < d.length) theirs.unshift(d.subarray(i + 1)); p.voice.serve(key, theirs, m); });
      return mine;
    },
  };
  n.voice = V.create({ friends: n.fr, note: (k, t) => n.notes.push(t), notify: (kind, d) => { if (kind === 'rx') n.rx.push(Buffer.from(d)); else if (kind === 'changed') n.states.push(d); else if (kind === 'ended') n.ended.push(d); else if (kind === 'ring') n.rings.push(d); } });
  net.set(key, n); return n;
};
const link = (a, b) => { a.friends.add(b.key); b.friends.add(a.key); };
const callUp = async (A, B, capsA = ['opus', 'pcm'], capsB = ['opus', 'pcm']) => { const s = A.voice.start(B.key, capsA); await settle(); const id = s.id; B.voice.accept(id, capsB); await settle(60); return id; };
const pkt = (n, fill = 7) => new Uint8Array(n).fill(fill);

test('appel complet : sonnerie, décrochage, audio dans les deux sens, micro coupé, raccrocher, traces', async () => {
  const A = mk('Alice'), B = mk('Bob'); link(A, B);
  const s = A.voice.start(B.key, ['opus', 'pcm']); assert.strictEqual(s.st, 'ring'); await settle();
  assert.strictEqual(B.voice.state().st, 'ring'); assert.strictEqual(B.voice.state().role, 'in'); assert.strictEqual(B.rings.length, 1); assert.strictEqual(B.rings[0].name, 'Alice');
  assert.strictEqual(B.voice.audio(pkt(10)), false, 'pas d’audio avant le décrochage');
  B.voice.accept(s.id, ['pcm', 'opus']); assert.strictEqual(B.voice.state().codec, 'opus', 'format préféré de l’appelant, si l’appelé le sait'); await settle(60);
  assert.strictEqual(A.voice.state().st, 'live'); assert.strictEqual(B.voice.state().st, 'live');
  assert.ok(A.voice.audio(pkt(40, 1))); assert.ok(B.voice.audio(pkt(60, 2))); await settle();
  assert.deepStrictEqual(B.rx.map(b => [b.length, b[0]]), [[40, 1]]); assert.deepStrictEqual(A.rx.map(b => [b.length, b[0]]), [[60, 2]]);
  assert.strictEqual(A.voice.audio(pkt(5000)), false, 'paquet trop gros refusé à l’envoi'); assert.strictEqual(A.voice.audio(new Uint8Array(0)), false);
  A.voice.setMute(true); assert.strictEqual(A.voice.audio(pkt(10)), false, 'micro coupé : rien ne part'); await settle(); assert.strictEqual(B.voice.state().peerMuted, true);
  A.voice.setMute(false); await settle(); assert.strictEqual(B.voice.state().peerMuted, false);
  B.voice.hangup(); await settle(60);
  assert.strictEqual(A.voice.state(), null); assert.strictEqual(B.voice.state(), null);
  assert.match(A.notes.at(-1), /Appel vocal · \d+ s/); assert.match(B.notes.at(-1), /Appel vocal · \d+ s/); assert.strictEqual(A.notes.length, 1, 'une seule trace par appel');
  assert.strictEqual(A.voice.audio(pkt(10)), false);
});

test('refus, occupé, annulation, appel manqué', async () => {
  const A = mk('Alice'), B = mk('Bob'), C = mk('Carl'); link(A, B); link(C, B);
  const s = A.voice.start(B.key, ['pcm']); await settle(); B.voice.decline(s.id); await settle();
  assert.strictEqual(A.voice.state(), null); assert.match(A.notes.at(-1), /Bob a refusé/); assert.match(B.notes.at(-1), /refusé/);
  const s2 = A.voice.start(B.key, ['pcm']); await settle();   // Bob sonne ; Carl appelle en même temps → occupé
  C.voice.start(B.key, ['pcm']); await settle(); assert.strictEqual(C.voice.state(), null); assert.match(C.notes.at(-1), /déjà en appel/);
  assert.strictEqual(B.voice.state().id, s2.id, 'l’appel en cours de sonnerie n’est pas écrasé');
  A.voice.hangup(); await settle(); assert.strictEqual(B.voice.state(), null); assert.match(B.notes.at(-1), /manqué de Alice/); assert.match(A.notes.at(-1), /annulé/);
  assert.throws(() => A.voice.start(B.key, []), /aucun format/);
  assert.throws(() => B.voice.accept(s2.id, ['pcm']), /plus en cours/);
});

test('personne en dehors des amis ne fait sonner ; amis hors ligne : refusé ; un seul appel à la fois', async () => {
  const A = mk('Alice'), B = mk('Bob'), X = mk('Inconnu'); link(A, B);
  X.friends.add(B.key); X.voice.start(B.key, ['pcm']); await settle(); assert.strictEqual(B.voice.state(), null, 'pas ami : rien ne sonne');
  B.up = false; assert.throws(() => A.voice.start(B.key, ['pcm']), /pas connecté/); B.up = true;
  assert.throws(() => A.voice.start(X.key, ['pcm']), /pas dans tes amis/);
  A.voice.start(B.key, ['pcm']); assert.throws(() => A.voice.start(B.key, ['pcm']), /déjà en appel/);
  A.voice.hangup(); await settle();
});

test('formats incompatibles : le décrochage est refusé proprement', async () => {
  const A = mk('Alice'), B = mk('Bob'); link(A, B);
  const s = A.voice.start(B.key, ['opus']); await settle();
  assert.throws(() => B.voice.accept(s.id, ['pcm']), /incompatibles/); await settle(); assert.strictEqual(A.voice.state(), null); assert.strictEqual(B.voice.state(), null);
});

test('un pair malveillant : faux identifiants, mauvais flux, paquet géant, déluge', async () => {
  const A = mk('Alice'), B = mk('Bob'), E = mk('Eve'); link(A, B); link(E, B);
  // messages incomplets ou inconnus : ignorés
  for (const m of [null, {}, { t: 'vc' }, { t: 'vc', op: 'ring', id: 'zz' }, { t: 'vc', op: 'boum', id: 'a'.repeat(24) }, { t: 'vc', op: 'ring', id: 'a'.repeat(24), caps: ['wav'] }]) B.voice.onMessage(A.key, m);
  assert.strictEqual(B.voice.state(), null, 'un ring sans format connu ne sonne pas');
  const id = await callUp(A, B);
  // un autre ami ne peut ni raccrocher ni couper l'appel des autres
  B.voice.onMessage(E.key, { t: 'vc', op: 'end', id }); assert.strictEqual(B.voice.state().st, 'live');
  // faux flux (mauvais identifiant / format) : détruit
  const [x, y] = pair(); let closed = false; y.on('close', () => { closed = true; }); x.on('error', () => {}); B.voice.serve(A.key, x, { t: 'vstream', id: 'b'.repeat(24), codec: 'opus' }); await settle(); assert.ok(closed, 'flux refusé'); assert.strictEqual(B.voice.state().st, 'live');
  // déluge : 300 paquets en une rafale → au plus ~100 transmis
  B.rx.length = 0; for (let i = 0; i < 300; i++) A.voice.audio(pkt(20)); await settle(60); assert.ok(B.rx.length <= 100 && B.rx.length > 10, 'cadence limitée : ' + B.rx.length);
  // paquet annoncé trop gros : l'appel est coupé
  const sock = A.voice._call().sock; sock.write(Buffer.from([0x13, 0x88, 1, 2, 3])); await settle(60); assert.strictEqual(B.voice.state(), null); await settle(60); assert.strictEqual(A.voice.state(), null);
  assert.match(B.notes.at(-1), /Appel vocal|interrompu/);
});

test('connexion perdue (flux fermé) et durée de sonnerie', async () => {
  const A = mk('Alice'), B = mk('Bob'); link(A, B);
  await callUp(A, B); A.voice._call().sock.destroy(); await settle(60);
  assert.strictEqual(A.voice.state(), null); assert.strictEqual(B.voice.state(), null);
  test.mock.timers.enable({ apis: ['setTimeout'] });
  try { A.voice.start(B.key, ['pcm']); test.mock.timers.tick(10); } finally { /* la sonnerie réelle passe par setTimeout simulé */ }
  const call = A.voice._call(); assert.ok(call && call.st === 'ring'); test.mock.timers.tick(46000);
  assert.strictEqual(A.voice.state(), null); assert.match(A.notes.at(-1), /sans réponse/); test.mock.timers.reset();
});

test('utilitaires : formats et durées', () => {
  assert.deepStrictEqual(V.cleanCaps(['opus', 'opus', 'x', 'pcm', 'pcm']), ['opus', 'pcm']); assert.deepStrictEqual(V.cleanCaps('opus'), []);
  assert.strictEqual(V.fmtDur(5000), '5 s'); assert.strictEqual(V.fmtDur(125000), '2 min 05 s'); assert.strictEqual(V.fmtDur(3700000), '1 h 01 min');
});
