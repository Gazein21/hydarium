/* Envoi direct de fichiers entre amis : transfert réel (fichiers et dossiers, gros fichier, fichiers vides) de PC à PC sur un réseau HyperDHT de test,
   et la sécurité : seul le destinataire peut recevoir, chemins piégés / exécutables / doublons / taille mensongère refusés, annulation, expiration, fichier modifié. */
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const createTestnet = require('hyperdht/testnet'), DHT = require('hyperdht');
const F = require('../src/main/friends'), X = require('../src/main/xfer'), C = require('../src/main/chat');
const until = async (f, ms = 9000, what = '') => { const t = Date.now(); while (Date.now() - t < ms) { if (await f()) return true; await new Promise(r => setTimeout(r, 40)); } throw new Error('délai dépassé : ' + what); };
const hex = b => Buffer.from(b).toString('hex'), wait = ms => new Promise(r => setTimeout(r, ms));
let tn; const all = [], tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hyd-xfer-'));

const mk = name => {
  const db = { friends: {} }, dir = path.join(tmp, name + crypto.randomBytes(3).toString('hex')), ref = {}, events = [];
  const f = F.create({ store: { get: () => db, save() {} }, DHT, bootstrap: tn.bootstrap, profile: () => ({ name, st: 'online', what: '' }), seal: s => 'S:' + Buffer.from(s).reverse().toString('hex'), unseal: s => Buffer.from(s.slice(2), 'hex').reverse().toString(),
    onStream: (k, sock, m) => ref.x.serve(k, sock, m), timing: { hiMs: 300, deadMs: 1500, retryMs: 400, backoff: [100, 200, 300] } });
  ref.x = X.create({ dir, friends: f, notify: (k, d) => events.push(d) });
  const x = { f, dir, x: ref.x, events, name, key: () => hex(DHT.keyPair(Buffer.from(Buffer.from(db.friends.seed.slice(2), 'hex').reverse().toString(), 'hex')).publicKey), code: () => f.status().code };
  all.push(x); return x;
};
const befriend = async (a, b) => { await a.f.request(b.code()); await until(() => b.f.status().inbox.length, 6000); await b.f.accept(a.key()); await until(() => a.f.isOnline(b.key()) && b.f.isOnline(a.key()), 8000, 'présence'); };
const peers = async (...n) => { const l = n.map(mk); for (const x of l) await x.f.enable(true); return l; };
const src = (...parts) => { const d = path.join(tmp, 'src' + crypto.randomBytes(3).toString('hex')); fs.mkdirSync(d, { recursive: true }); return d; };
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

test.before(async () => { tn = await createTestnet(5); });
test.after(async () => { for (const x of all) try { await x.f.stop(); } catch (e) { /* fini */ } await tn.destroy(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('chemins : seuls les chemins relatifs sûrs passent', () => {
  for (const ok of ['mod.jar', 'saves/Monde 1/level.dat', 'a/b/c.txt', 'été/ñ.zip']) assert.strictEqual(X.cleanRel(ok), ok);
  for (const bad of ['', '../x', 'a/../../x', '/etc/passwd', 'C:/x', 'C:\\x', 'a\\b', 'a//b', './a', 'a/.', 'CON', 'con.txt', 'a/nul.jar', 'x.', 'x ', 'a/b?', 'a|b', 'a\u0000b', 'x'.repeat(130), Array(14).fill('a').join('/'), 'a'.repeat(250), null, 5]) assert.strictEqual(X.cleanRel(bad), null, JSON.stringify(bad));
});
test('liste de fichiers reçue : doublons, conflits, programmes, tailles et carte vérifiés', () => {
  const m = f => ({ t: 'xman', files: f }), ok = { files: [{ p: 'a/x.jar', s: 5 }, { p: 'b.zip', s: 0 }] };
  assert.deepStrictEqual(X.checkManifest(m(ok.files), { count: 2, size: 5 }), { files: ok.files, total: 5 });
  const bad = (f, re, e) => assert.throws(() => X.checkManifest(typeof f === 'object' && f.t ? f : m(f), e), re);
  bad([{ p: '../x', s: 1 }], /refusé/); bad([{ p: 'a.exe', s: 1 }], /bloqué/); bad([{ p: 'a/b.DLL', s: 1 }], /bloqué/); bad([{ p: 'a.jar', s: 1 }, { p: 'A.JAR', s: 1 }], /double/); bad([{ p: 'a', s: 1 }, { p: 'a/b', s: 1 }], /conflit/);
  bad([{ p: 'a', s: -1 }], /Taille/); bad([{ p: 'a', s: 1.5 }], /Taille/); bad([{ p: 'a', s: 3 * 2 ** 30 }, { p: 'b', s: 2 * 2 ** 30 }], /volumineux/); bad([], /invalide/); bad({ t: 'autre', files: [] }, /invalide/);
  bad(Array.from({ length: 3001 }, (_, i) => ({ p: 'f' + i, s: 1 })), /Trop de fichiers/); bad(ok.files, /ne correspond pas/, { count: 2, size: 4 }); bad(ok.files, /ne correspond pas/, { count: 1, size: 5 });
});

test('transfert réel : fichiers, dossier, fichier vide et gros fichier arrivent identiques ; progression ; rangement dans le dossier d’attente', async () => {
  const [A, B] = await peers('Alice', 'Bob'); await befriend(A, B); const s = src();
  fs.writeFileSync(path.join(s, 'mod.jar'), crypto.randomBytes(5000)); fs.mkdirSync(path.join(s, 'Monde/region'), { recursive: true }); fs.writeFileSync(path.join(s, 'Monde/level.dat'), 'niveau'); fs.writeFileSync(path.join(s, 'Monde/region/r.0.0.mca'), crypto.randomBytes(300000)); fs.writeFileSync(path.join(s, 'Monde/vide.txt'), '');
  fs.writeFileSync(path.join(s, 'gros.zip'), crypto.randomBytes(12 * 2 ** 20)); fs.symlinkSync('/etc/hostname', path.join(s, 'Monde/lien')); fs.writeFileSync(path.join(s, 'z-vide'), '');
  const o = A.x.offer([B.key()], 'Mon monde', [path.join(s, 'mod.jar'), path.join(s, 'Monde'), path.join(s, 'gros.zip'), path.join(s, 'z-vide')]);
  assert.deepStrictEqual([o.count, o.jar, o.top], [6, true, ['mod.jar', 'Monde', 'gros.zip', 'z-vide']], 'le lien symbolique est ignoré'); assert.strictEqual(o.size, 5000 + 6 + 300000 + 12 * 2 ** 20);
  const r = await B.x.fetch(A.key(), o.tid, { count: o.count, size: o.size }); assert.strictEqual(r.count, 6); assert.deepStrictEqual(r.items.sort(), ['Monde', 'gros.zip', 'mod.jar', 'z-vide']);
  for (const f of ['mod.jar', 'gros.zip', 'Monde/level.dat', 'Monde/region/r.0.0.mca', 'Monde/vide.txt']) assert.strictEqual(sha(path.join(r.dir, f)), sha(path.join(s, f)), f);
  assert.ok(!fs.existsSync(path.join(r.dir, 'Monde/lien')), 'pas de lien'); assert.strictEqual(fs.statSync(path.join(r.dir, 'z-vide')).size, 0); assert.ok(r.dir.startsWith(path.join(B.dir, 'received')));
  const ev = B.events.filter(e => e.role === 'recv'); assert.strictEqual(ev.at(-1).st, 'done'); assert.ok(ev.some(e => e.st === 'run' && e.done > 0), 'progression signalée'); await until(() => A.events.some(e => e.role === 'send' && e.st === 'done'), 5000, 'fin côté expéditeur');
  assert.deepStrictEqual(B.x.received(o.tid).items.length, 4); assert.strictEqual(B.x.received('0'.repeat(24)), null); await wait(100); assert.strictEqual(A.x.active(), 0, 'plus aucun envoi en cours');
});

test('sécurité : seul le destinataire reçoit ; un inconnu, un autre ami, une proposition périmée ou inventée sont refusés', async () => {
  const [A, B, C2] = await peers('Alice', 'Bob', 'Carl'); await befriend(A, B); await befriend(A, C2); const s = src(); fs.writeFileSync(path.join(s, 'a.zip'), 'contenu');
  const o = A.x.offer([B.key()], 'Pour Bob', [path.join(s, 'a.zip')]);
  await assert.rejects(C2.x.fetch(A.key(), o.tid), /plus disponible/, 'Carl n’est pas destinataire'); assert.ok(!fs.existsSync(path.join(C2.dir, 'received', o.tid)), 'rien laissé sur le disque');
  await assert.rejects(B.x.fetch(A.key(), 'f'.repeat(24)), /plus disponible/, 'proposition inventée'); await assert.rejects(B.x.fetch(A.key(), 'nimporte'), /invalide/);
  await assert.rejects(B.x.fetch(hex(crypto.randomBytes(32)), o.tid), /pas dans tes amis/);
  A.x.offers()[o.tid].at = Date.now() - 8 * 86400e3; await assert.rejects(B.x.fetch(A.key(), o.tid), /plus disponible/, 'expirée après 7 jours'); A.x.purge(); assert.strictEqual(Object.keys(A.x.offers()).length, 0, 'et nettoyée');
  assert.throws(() => A.x.offer([hex(crypto.randomBytes(32))], 'x', [path.join(s, 'a.zip')]), /tes amis/, 'on n’envoie qu’à ses amis');
  const spy = new DHT({ bootstrap: tn.bootstrap }); const o2 = A.x.offer([B.key()], 'x', [path.join(s, 'a.zip')]); const sock = spy.connect(Buffer.from(A.key(), 'hex'), { keyPair: DHT.keyPair(crypto.randomBytes(32)) }); let got = ''; sock.on('error', () => {}); sock.on('data', d => { got += d; });
  await new Promise(r => { sock.once('open', r); sock.once('close', r); }); try { sock.write(JSON.stringify({ t: 'xget', tid: o2.tid }) + '\n'); } catch (e) { /* coupée */ } await wait(900); assert.ok(!got.includes('xman'), 'un inconnu ne reçoit rien'); await spy.destroy();
});

test('envoi : programmes, noms piégés, trop gros, doublons, rien — refusés dès la proposition ; fichier modifié ensuite : refusé à la réception', async () => {
  const [A, B] = await peers('Alice', 'Bob'); await befriend(A, B); const s = src(); const w = (n, c = 'x') => { fs.writeFileSync(path.join(s, n), c); return path.join(s, n); };
  assert.throws(() => A.x.offer([B.key()], 'x', [w('virus.exe')]), /bloqué/); assert.throws(() => A.x.offer([B.key()], 'x', [w('lib.dll')]), /bloqué/); assert.throws(() => A.x.offer([B.key()], 'x', ['relatif.jar']), /Rien à envoyer/);
  fs.mkdirSync(path.join(s, 'd1')); fs.mkdirSync(path.join(s, 'd2/d1'), { recursive: true }); assert.throws(() => A.x.offer([B.key()], 'x', [path.join(s, 'd1'), path.join(s, 'd2/d1')]), /même nom/); assert.throws(() => A.x.offer([B.key()], 'x', [path.join(s, 'd1')]), /Rien à envoyer/, 'dossier vide');
  const f = w('ok.jar', 'abcdef'), o = A.x.offer([B.key()], 'x', [f]); fs.writeFileSync(f, 'abc'); await assert.rejects(B.x.fetch(A.key(), o.tid, { count: 1, size: 6 }), /modifié/, 'taille changée depuis la proposition'); assert.ok(!fs.existsSync(path.join(B.dir, 'received', o.tid)));
  const o3 = A.x.offer([B.key()], 'x', [f]); await assert.rejects(B.x.fetch(A.key(), o3.tid, { count: 1, size: 999 }), /ne correspond pas/, 'la carte annonçait autre chose'); await wait(200); assert.strictEqual(A.x.active(), 0);
});

test('annulation : le transfert s’arrête, rien ne reste sur le disque ; un seul envoi à la fois par ami', async () => {
  const [A, B] = await peers('Alice', 'Bob'); await befriend(A, B); const s = src(), big = path.join(s, 'enorme.zip'); fs.writeFileSync(big, crypto.randomBytes(40 * 2 ** 20));
  const o = A.x.offer([B.key()], 'gros', [big]), p = B.x.fetch(A.key(), o.tid, { count: 1, size: o.size }); p.catch(() => {});
  await until(() => B.events.some(e => e.role === 'recv' && e.st === 'run' && e.done > 0), 8000, 'démarré'); await assert.rejects(B.x.fetch(A.key(), o.tid), /Déjà en cours/);
  assert.strictEqual(B.x.cancel(o.tid), true); await assert.rejects(p, /Annulé/); assert.ok(!fs.existsSync(path.join(B.dir, 'received', o.tid)), 'dossier d’attente supprimé'); assert.strictEqual(B.x.cancel(o.tid), false);
  await until(() => A.x.active() === 0 && A.events.some(e => e.role === 'send' && e.st === 'err'), 6000, 'côté expéditeur : interrompu'); await B.x.fetch(A.key(), o.tid, { count: 1, size: o.size }); assert.strictEqual(sha(path.join(B.dir, 'received', o.tid, 'enorme.zip')), sha(big), 'on peut recommencer');
});

test('carte « files » dans le chat : seulement des nombres et des noms ; tout le reste refusé', () => {
  const g = { k: 'files', n: 'Mon monde', tid: 'a'.repeat(24), cnt: 3, size: 1234, jar: true, top: ['Monde', '<b>x</b>', 'y'] };
  assert.deepStrictEqual(C.cleanCard({ ...g, chemin: 'C:\\secret' }), { k: 'files', n: 'Mon monde', tid: 'a'.repeat(24), cnt: 3, size: 1234, jar: true, top: ['Monde', 'bx/b', 'y'], th: '' });
  for (const bad of [{ ...g, tid: 'zz' }, { ...g, cnt: 0 }, { ...g, cnt: 3001 }, { ...g, size: -1 }, { ...g, size: 5 * 2 ** 30 }, { ...g, size: 1.5 }, { ...g, n: ' ' }]) assert.strictEqual(C.cleanCard(bad), null, JSON.stringify(bad).slice(0, 50));
  assert.strictEqual(C.cleanCard({ ...g, jar: 'oui' }).jar, false);
});

test('branchements : crochet de flux côté amis, canaux, événement, interface', () => {
  const r = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), main = r('src/main/main.js'), pre = r('src/preload.js'), app = r('src/renderer/app.js');
  for (const c of ['chat:xsend', 'chat:xcancel', 'chat:xapply', 'chat:xopen']) assert.ok(pre.includes("'" + c + "'") && main.includes("on('" + c + "'"), c);
  assert.ok(pre.includes("'chat:xfer'") && app.includes("hyd.on('chat:xfer'"), 'événement de progression'); assert.ok(/onStream:[^\n]*xfer/.test(main), 'xfer branché sur friends');
  assert.ok(/xfer[\s\S]{0,80}\.fetch\(/.test(main), 'réception');
});
