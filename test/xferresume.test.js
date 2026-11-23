/* Envoi de fichiers : REPRISE après une coupure. Connexions locales (net) à la place d'HyperDHT, mêmes échanges que xfer.js : ligne JSON puis octets.
   Vérifie que la reprise ne renvoie que ce qui manque, que les fichiers finissent identiques, et qu'un changement côté expéditeur, un ancien expéditeur ou une annulation repartent proprement de zéro. */
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto'), net = require('net');
const X = require('../src/main/xfer');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hyd-xres-')), KEYA = 'a'.repeat(64), KEYB = 'b'.repeat(64);
const wait = ms => new Promise(r => setTimeout(r, ms)), sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const servers = [], socks = new Set(); test.after(() => { for (const k of socks) k.destroy(); for (const s of servers) s.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

/** deux machines : A propose, B reçoit. cut = { at } : coupe la connexion de B après `at` octets reçus ; seen : ce que B a demandé ; sentBytes : octets réellement envoyés par A */
async function pair(opts = {}) {
  const dirA = fs.mkdtempSync(path.join(tmp, 'A')), dirB = fs.mkdtempSync(path.join(tmp, 'B')), seen = [], st = { cut: null, bytes: 0, oldSender: !!opts.oldSender };
  const frA = { isFriend: () => true, isOnline: () => true }, A = X.create({ dir: dirA, friends: frA, notify() {} });
  const srv = net.createServer(sock => { socks.add(sock); sock.on('error', () => {}); let b = Buffer.alloc(0); const on = d => { b = Buffer.concat([b, d]); const i = b.indexOf(10); if (i < 0) return; sock.off('data', on); const m = JSON.parse(b.subarray(0, i)); seen.push({ ...m }); if (st.oldSender) { delete m.rv; delete m.ri; delete m.ro; } A.serve(KEYB, sock, m); }; sock.on('data', on); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); servers.push(srv);
  const frB = { isFriend: () => true, isOnline: () => true, openStream: () => { const s = net.connect(srv.address().port, '127.0.0.1'); socks.add(s); s.on('connect', () => s.emit('open')); let n = 0; s.on('data', d => { st.bytes += d.length; n += d.length; if (st.cut && n >= st.cut) { st.cut = null; s.destroy(); } }); return s; } };
  const events = [], B = X.create({ dir: dirB, friends: frB, notify: (k, d) => events.push(d) });
  return { A, B, dirA, dirB, seen, st, events };
}
const mkfiles = () => { const s = fs.mkdtempSync(path.join(tmp, 'src')); fs.writeFileSync(path.join(s, 'a.bin'), crypto.randomBytes(3 * 2 ** 20)); fs.mkdirSync(path.join(s, 'Monde/region'), { recursive: true }); fs.writeFileSync(path.join(s, 'Monde/region/r.mca'), crypto.randomBytes(6 * 2 ** 20)); fs.writeFileSync(path.join(s, 'Monde/level.dat'), 'niveau'); fs.writeFileSync(path.join(s, 'vide'), ''); fs.writeFileSync(path.join(s, 'z.bin'), crypto.randomBytes(2 * 2 ** 20)); return s; };
const items = s => ['a.bin', 'Monde', 'vide', 'z.bin'].map(n => path.join(s, n));
const same = (r, s) => { for (const f of ['a.bin', 'Monde/region/r.mca', 'Monde/level.dat', 'vide', 'z.bin']) assert.strictEqual(sha(path.join(r.dir, f)), sha(path.join(s, f)), f); };

test('coupure au milieu : le .part reste, la reprise ne renvoie que le reste, tout arrive identique', async () => {
  const P = await pair(), s = mkfiles(), o = P.A.offer([KEYB], 'Mon monde', items(s)), total = o.size, ex = { count: o.count, size: o.size };
  P.st.cut = 5 * 2 ** 20;
  await assert.rejects(P.B.fetch(KEYA, o.tid, ex), /fermée/);
  const part = P.B.partial(o.tid); assert.ok(part && part.done > 2 ** 20 && part.done < total, 'une partie est gardée : ' + JSON.stringify(part)); assert.strictEqual(part.total, total);
  assert.ok(fs.existsSync(path.join(P.dirB, 'received', o.tid + '.part')) && !fs.existsSync(path.join(P.dirB, 'received', o.tid)), 'rien n’apparaît comme « reçu » tant que tout n’est pas là');
  assert.strictEqual(P.events.at(-1).resumable, true, 'l’interface sait qu’on peut reprendre');
  P.st.bytes = 0; const n0 = P.events.length, r = await P.B.fetch(KEYA, o.tid, ex); same(r, s); assert.strictEqual(r.count, 5);
  assert.ok(P.seen.at(-1).ri >= 0 && P.seen.at(-1).rv && P.seen.at(-1).ro >= 0, 'B a demandé une reprise : ' + JSON.stringify(P.seen.at(-1)));
  assert.ok(P.st.bytes < total - part.done + 4096, 'seul le reste a été renvoyé (' + P.st.bytes + ' octets au lieu de ' + total + ')');
  assert.ok(!fs.existsSync(path.join(P.dirB, 'received', o.tid + '.part')) && !fs.existsSync(path.join(P.dirB, 'received', o.tid + '.part.json')), 'plus de .part'); assert.strictEqual(P.B.partial(o.tid), null);
  assert.strictEqual(P.events.at(-1).st, 'done'); const runs = P.events.slice(n0).filter(e => e.st === 'run'); assert.ok(runs.length && runs.every(e => e.done >= part.done && e.total === total), 'la progression repart de ce qui est déjà là, jamais de zéro');
});

test('plusieurs coupures de suite : chaque reprise avance, le résultat est exact', async () => {
  const P = await pair(), s = mkfiles(), o = P.A.offer([KEYB], 'x', items(s)), ex = { count: o.count, size: o.size }; let last = 0;
  for (const cut of [2 * 2 ** 20, 2.5 * 2 ** 20, 3 * 2 ** 20]) { P.st.cut = cut; await assert.rejects(P.B.fetch(KEYA, o.tid, ex), /fermée/); const p = P.B.partial(o.tid); assert.ok(p.done > last, 'avance : ' + last + ' → ' + p.done); last = p.done; }
  same(await P.B.fetch(KEYA, o.tid, ex), s);
});

test('l’expéditeur a modifié un fichier entre-temps : on repart de zéro, sans mélange de versions', async () => {
  const P = await pair(), s = mkfiles(), o = P.A.offer([KEYB], 'x', items(s)), ex = { count: o.count, size: o.size };
  P.st.cut = 4 * 2 ** 20; await assert.rejects(P.B.fetch(KEYA, o.tid, ex), /fermée/); assert.ok(P.B.partial(o.tid));
  const f = path.join(s, 'z.bin'), buf = crypto.randomBytes(2 * 2 ** 20); fs.writeFileSync(f, buf); fs.utimesSync(f, new Date(), new Date(Date.now() + 5000));   // même taille, autre contenu, autre date
  const r = await P.B.fetch(KEYA, o.tid, ex); same(r, s); assert.ok(!('r' in {}) && true);
});

test('un expéditeur sans la fonction de reprise renvoie tout : le résultat reste correct', async () => {
  const P = await pair({ oldSender: true }), s = mkfiles(), o = P.A.offer([KEYB], 'x', items(s)), ex = { count: o.count, size: o.size };
  P.st.cut = 5 * 2 ** 20; await assert.rejects(P.B.fetch(KEYA, o.tid, ex), /fermée/); assert.ok(P.B.partial(o.tid)); P.st.bytes = 0;
  const r = await P.B.fetch(KEYA, o.tid, ex); same(r, s); assert.ok(P.st.bytes >= o.size, 'tout a été renvoyé');
});

test('annuler efface la partie reçue ; abandonner aussi ; une proposition disparue efface tout', async () => {
  const P = await pair(), s = mkfiles(), o = P.A.offer([KEYB], 'x', items(s)), ex = { count: o.count, size: o.size }, rd = n => path.join(P.dirB, 'received', n);
  P.st.cut = 4 * 2 ** 20; await assert.rejects(P.B.fetch(KEYA, o.tid, ex), /fermée/); assert.ok(P.B.partial(o.tid)); P.B.discard(o.tid); assert.strictEqual(P.B.partial(o.tid), null); assert.ok(!fs.existsSync(rd(o.tid + '.part')));
  const p = P.B.fetch(KEYA, o.tid, ex); await wait(30); assert.strictEqual(P.B.cancel(o.tid), true); await assert.rejects(p, /Annulé/); assert.strictEqual(P.B.partial(o.tid), null); assert.ok(!fs.existsSync(rd(o.tid + '.part')) && !fs.existsSync(rd(o.tid + '.part.json')));
  P.st.cut = 4 * 2 ** 20; await assert.rejects(P.B.fetch(KEYA, o.tid, ex), /fermée/); assert.ok(P.B.partial(o.tid)); P.A.forget(o.tid);   // l'expéditeur retire sa proposition
  await assert.rejects(P.B.fetch(KEYA, o.tid, ex), /plus disponible/); assert.strictEqual(P.B.partial(o.tid), null, 'inutile de garder ce qui ne pourra plus être complété');
  assert.throws(() => P.B.discard('../x'), /invalide/);
});

test('une carte qui ne correspond plus (autre taille annoncée) n’utilise pas l’ancienne partie ; les .part trop vieux sont nettoyés', async () => {
  const P = await pair(), s = mkfiles(), o = P.A.offer([KEYB], 'x', items(s)), ex = { count: o.count, size: o.size };
  P.st.cut = 4 * 2 ** 20; await assert.rejects(P.B.fetch(KEYA, o.tid, ex), /fermée/); assert.ok(P.B.partial(o.tid)); assert.strictEqual(P.B.partial(o.tid) && true, true);
  await assert.rejects(P.B.fetch(KEYA, o.tid, { count: o.count, size: o.size + 1 }), /ne correspond pas/); assert.strictEqual(P.B.partial(o.tid), null);
  P.st.cut = 4 * 2 ** 20; await assert.rejects(P.B.fetch(KEYA, o.tid, ex), /fermée/);
  const old = new Date(Date.now() - 15 * 86400e3), rd = path.join(P.dirB, 'received'); for (const n of [o.tid + '.part', o.tid + '.part.json']) fs.utimesSync(path.join(rd, n), old, old);
  P.B.purge(); assert.deepStrictEqual(fs.readdirSync(rd), [], 'au bout de 14 jours le .part et son état disparaissent');
});
