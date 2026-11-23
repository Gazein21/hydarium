/* Chat entre amis : messages, file d'attente hors ligne, accusés, cartes de partage (validation, miniatures), groupes (invitation, relais signé, départ, retrait, dissolution),
   et la sécurité : un inconnu ne peut rien injecter, une signature fausse est jetée, tout est borné. De VRAIS pairs HyperDHT sur un réseau de test local. */
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const createTestnet = require('hyperdht/testnet'), DHT = require('hyperdht');
const F = require('../src/main/friends'), C = require('../src/main/chat');
const until = async (f, ms = 9000, what = '') => { const t = Date.now(); while (Date.now() - t < ms) { if (await f()) return true; await new Promise(r => setTimeout(r, 40)); } throw new Error('délai dépassé : ' + what); };
const hex = b => Buffer.from(b).toString('hex'), wait = ms => new Promise(r => setTimeout(r, ms));
let tn; const all = [], spies = [], tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hyd-chat-'));

const mk = name => {
  const db = { friends: {} }, dir = path.join(tmp, name + crypto.randomBytes(3).toString('hex')), events = [], ref = {};
  const f = F.create({ store: { get: () => db, save() {} }, DHT, bootstrap: tn.bootstrap, profile: () => ({ name, st: 'online', what: '' }), seal: s => 'S:' + Buffer.from(s).reverse().toString('hex'), unseal: s => Buffer.from(s.slice(2), 'hex').reverse().toString(),
    onOnline: k => ref.chat && ref.chat.onOnline(k), onMessage: (k, m) => ref.chat && ref.chat.onMessage(k, m), timing: { hiMs: 300, deadMs: 1500, retryMs: 400, backoff: [100, 200, 300] } });
  const make = () => (ref.chat = C.create({ dir, friends: f, myName: () => name, focused: () => false, notify: (k, d) => events.push([k, d]), saveMs: 10 }));
  const x = { f, db, dir, events, name, make, chat: make(), key: () => hex(DHT.keyPair(Buffer.from(Buffer.from(db.friends.seed.slice(2), 'hex').reverse().toString(), 'hex')).publicKey), code: () => f.status().code, ev: k => events.filter(e => e[0] === k) };
  all.push(x); return x;
};
const befriend = async (a, b) => { await a.f.request(b.code()); await until(() => b.f.status().inbox.length, 6000, 'demande reçue'); await b.f.accept(a.key()); await until(() => a.f.isOnline(b.key()) && b.f.isOnline(a.key()), 8000, 'présence'); };
const peers = async (...names) => { const l = names.map(mk); for (const x of l) await x.f.enable(true); return l; };
const texts = (x, id) => x.chat.messages(id).filter(m => m.k !== 's').map(m => m.x);
async function spy(target, kp = DHT.keyPair(crypto.randomBytes(32))) {
  const d = new DHT({ bootstrap: tn.bootstrap }); spies.push(d); const sock = d.connect(Buffer.from(target, 'hex'), { keyPair: kp }); const out = { sock, kp, got: '', closed: false }; sock.on('error', () => {}); sock.on('data', x => { out.got += x; }); sock.on('close', () => { out.closed = true; });
  await new Promise((res, rej) => { sock.once('open', res); sock.once('close', () => rej(new Error('fermée avant ouverture'))); }).catch(() => {}); return out;
}
/** un petit JPEG valide (en-tête + marqueur SOF avec les dimensions voulues) */
const jpeg = (w, h, pad = 150) => { const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0]); return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]), sof, Buffer.alloc(pad, 7), Buffer.from([0xff, 0xd9])]).toString('base64'); };
const CODE = 'HYD1.' + require('zlib').deflateSync(JSON.stringify({ v: '1.20.1', t: 'release', l: 'fabric', m: ['AANobbMI', 'P7dR8mSH'] })).toString('base64url');

test.before(async () => { tn = await createTestnet(5); });
test.after(async () => { for (const s of spies) try { await s.destroy(); } catch (e) { /* fini */ } for (const x of all) { try { x.chat.flush(); await x.f.stop(); } catch (e) { /* fini */ } } await tn.destroy(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('signature : l’identité des amis signe, tout le monde peut vérifier, une retouche est détectée', async () => {
  const [A] = await peers('Alice'); const sig = A.f.sign('bonjour'); assert.match(sig, /^[0-9a-f]{128}$/);
  assert.ok(F.verify(A.key(), 'bonjour', sig)); assert.ok(!F.verify(A.key(), 'bonjouR', sig), 'texte retouché'); assert.ok(!F.verify(hex(crypto.randomBytes(32)), 'bonjour', sig), 'autre clé');
  assert.ok(!F.verify('x', 'bonjour', sig) && !F.verify(A.key(), 'bonjour', 'zz'), 'entrées invalides : faux, jamais d’exception');
});

test('texte : livré dans les deux sens, accusé de réception, historique gardé après redémarrage, notification', async () => {
  const [A, B] = await peers('Alice', 'Bob'); await befriend(A, B);
  A.chat.send(B.key(), 'Salut Bob !'); await until(() => texts(B, A.key()).length === 1, 5000, 'reçu'); assert.deepStrictEqual(texts(B, A.key()), ['Salut Bob !']);
  await until(() => A.chat.messages(B.key())[0].st === 'ok', 5000, 'accusé'); assert.strictEqual(B.chat.messages(A.key())[0].who, 'Alice'); assert.strictEqual(B.chat.messages(A.key())[0].mine, false);
  assert.deepStrictEqual(B.ev('msg').map(e => [e[1].name, e[1].text]), [['Alice', 'Salut Bob !']], 'notification : qui et quoi'); assert.strictEqual(B.chat.list().convs[A.key()].unread, 1);
  B.chat.read(A.key()); assert.strictEqual(B.chat.list().unread, 0);
  B.chat.send(A.key(), 'Salut\nAlice'); await until(() => texts(A, B.key()).length === 2, 5000, 'réponse'); assert.deepStrictEqual(texts(A, B.key()), ['Salut Bob !', 'Salut\nAlice']);
  A.chat.flush(); const A2 = C.create({ dir: A.dir, friends: A.f, saveMs: 10 }); assert.deepStrictEqual(A2.messages(B.key()).filter(m => m.k !== 's').map(m => m.x), ['Salut Bob !', 'Salut\nAlice'], 'historique relu depuis chat.json');
  assert.throws(() => A.chat.send(B.key(), '   \n '), /vide/); assert.strictEqual(A.chat.messages(B.key()).length, 2);
  A.chat.send(B.key(), 'x'.repeat(5000)); await until(() => texts(B, A.key()).length === 3, 5000); assert.strictEqual(texts(B, A.key())[2].length, 1000, 'tronqué à 1000 caractères');
});

test('hors ligne : le message attend chez l’expéditeur et part à la reconnexion, une seule fois', async () => {
  const [A, B] = await peers('Alice', 'Bob'); await befriend(A, B);
  await B.f.stop(); await until(() => !A.f.isOnline(B.key()), 4000, 'Bob parti');
  A.chat.send(B.key(), 'tu es là ?'); A.chat.send(B.key(), 'réponds quand tu peux'); assert.deepStrictEqual(A.chat.messages(B.key()).map(m => m.st), ['wait', 'wait'], 'en attente');
  await B.f.start(); await until(() => texts(B, A.key()).length === 2, 12000, 'livrés à la reconnexion'); assert.deepStrictEqual(texts(B, A.key()), ['tu es là ?', 'réponds quand tu peux'], 'dans l’ordre');
  await until(() => A.chat.messages(B.key()).every(m => m.st === 'ok'), 5000, 'accusés'); await wait(900); assert.strictEqual(texts(B, A.key()).length, 2, 'pas de doublon');
});

test('un inconnu ne peut rien injecter ; un ami ne peut pas forcer, inonder ni écrire n’importe quoi', async () => {
  const [A, B] = await peers('Alice', 'Bob'); await befriend(A, B);
  const s = await spy(A.key()); s.sock.write(JSON.stringify({ t: 'dm', id: 'a'.repeat(24), ts: Date.now(), k: 't', x: 'pirate' }) + '\n'); await until(() => s.closed, 4000, 'inconnu coupé'); assert.deepStrictEqual(Object.keys(A.chat._db().convs), [], 'rien stocké');
  const key = A.key(), id = () => crypto.randomBytes(12).toString('hex');
  B.f.sendTo(key, { t: 'dm', id: 'pas-un-id', ts: 1, k: 't', x: 'a' }); B.f.sendTo(key, { t: 'dm', id: id(), ts: 'x', k: 't', x: '<b>gras</b>\u202e' }); B.f.sendTo(key, { t: 'dm', id: id(), ts: 1, k: 'z', x: 'type inconnu' }); B.f.sendTo(key, { t: 'cack', ids: 'nimporte' });
  await until(() => texts(A, B.key()).length === 1, 4000, 'seul le message valide est gardé'); assert.strictEqual(texts(A, B.key())[0], '<b>gras</b>', 'inversion d’écriture retirée (l’interface échappe le HTML)');
  assert.ok(A.chat.messages(B.key())[0].ts <= Date.now() && A.chat.messages(B.key())[0].ts > Date.now() - 31 * 86400e3, 'heure ramenée dans une plage plausible');
  for (let i = 0; i < 60; i++) B.f.sendTo(key, { t: 'dm', id: id(), ts: Date.now(), k: 't', x: 'spam ' + i }); await wait(700); assert.ok(texts(A, B.key()).length <= 41, 'au plus 40 messages par 10 s : ' + texts(A, B.key()).length);
});

test('cartes : seuls les champs connus passent, miniatures bornées (bombe de décompression refusée), code gardé côté launcher', async () => {
  const good = { k: 'inst', n: 'Mon pack', v: '1.20.1', l: 'fabric', m: 2, code: CODE };
  assert.deepStrictEqual(C.cleanCard({ ...good, evil: '<script>', th: '' }), { k: 'inst', n: 'Mon pack', v: '1.20.1', l: 'fabric', lv: '', m: 2, code: CODE, th: '' });
  for (const bad of [null, 'x', {}, { ...good, l: 'forge' }, { ...good, v: '1.20<img>' }, { ...good, code: 'HYD1.' + 'a'.repeat(20001) }, { ...good, code: 'http://evil' }, { ...good, n: '  ' }, { k: 'pack', n: 'P', src: 'modrinth', pid: 'zz' }, { k: 'pack', n: 'P', src: 'curseforge', pid: 'AANobbMI' }, { k: 'pack', n: 'P', src: 'evil', pid: 'AANobbMI' }, { k: 'srv', n: 'S', code: 'nimporte' }]) assert.strictEqual(C.cleanCard(bad), null, JSON.stringify(bad).slice(0, 60));
  assert.deepStrictEqual(C.cleanCard({ k: 'pack', n: 'Better MC', src: 'modrinth', pid: 'shFhR8Vx', v: '1.20.1' }), { k: 'pack', n: 'Better MC', src: 'modrinth', pid: 'shFhR8Vx', v: '1.20.1', th: '' }); assert.ok(C.cleanCard({ k: 'pack', n: 'CF', src: 'curseforge', pid: 'cf123' }));
  const ok = jpeg(96, 96); assert.strictEqual(C.okThumb(ok), ok); assert.deepStrictEqual(C.jpegSize(Buffer.from(ok, 'base64')), { w: 96, h: 96 });
  for (const bad of [jpeg(20000, 20000), jpeg(257, 10), jpeg(0, 0), 'AAAA'.repeat(60), Buffer.from('<svg onload=alert(1)>'.repeat(10)).toString('base64'), jpeg(96, 96, 12000)]) assert.strictEqual(C.okThumb(bad), '', 'miniature refusée');

  const [A, B] = await peers('Alice', 'Bob'); await befriend(A, B); const th = jpeg(96, 96, 300);
  A.chat.sendCard(B.key(), good, th); A.chat.sendCard(B.key(), good, th); A.chat.sendCard(B.key(), { k: 'pack', n: 'Better MC', src: 'modrinth', pid: 'shFhR8Vx' }, 'pas une image');
  await until(() => B.chat.messages(A.key()).length === 3, 6000, 'cartes reçues'); const ms = B.chat.messages(A.key()), c = ms[0].c;
  assert.deepStrictEqual([c.k, c.n, c.v, c.l, c.m], ['inst', 'Mon pack', '1.20.1', 'fabric', 2]); assert.ok(!('code' in c), 'le code n’est jamais donné à l’interface'); assert.match(B.chat.thumb(c.th), /^data:image\/jpeg;base64,/); assert.strictEqual(ms[2].c.th, '', 'fausse miniature jetée, la carte reste');
  assert.strictEqual(ms[0].c.th, ms[1].c.th, 'même miniature gardée une seule fois'); assert.strictEqual(Object.keys(B.chat._db().thumbs).length, 1); assert.strictEqual(B.chat.card(A.key(), ms[0].id).code, CODE, 'le code reste côté launcher pour le téléchargement');
  B.chat.setDl(A.key(), ms[0].id, { s: 'done', id: 'abc', t: 1 }); assert.deepStrictEqual(B.chat.messages(A.key())[0].dl, { s: 'done', id: 'abc', t: 1 });
  const id = crypto.randomBytes(12).toString('hex'); A.f.sendTo(B.key(), { t: 'dm', id, ts: Date.now(), k: 'c', c: { k: 'futur', n: 'inconnu' } }); await until(() => B.chat.messages(A.key()).length === 4, 4000); assert.strictEqual(B.chat.messages(A.key())[3].bad, true, 'carte d’une version plus récente : message « non pris en charge », pas de boucle de renvoi');
  B.chat.record(A.key(), { mine: false, card: { k: 'srv', n: 'Serveur de Alice', code: 'hyd-p2p' } }); B.chat.record(A.key(), { mine: true, card: { k: 'srv', n: 'Mon serveur', code: 'x' } });
});

test('groupes : seulement des amis ; invitation à accepter ; relais signé entre deux membres qui ne se connaissent pas', async () => {
  const [A, B, C, D] = await peers('Alice', 'Bob', 'Carl', 'Dana'); await befriend(A, B); await befriend(A, C); await befriend(A, D);
  assert.throws(() => B.chat.createGroup('x', [C.key()]), /déjà dans tes amis/, 'Bob n’est pas ami avec Carl'); assert.throws(() => A.chat.createGroup('x', []), /au moins un ami/); assert.throws(() => A.chat.createGroup('x', [hex(crypto.randomBytes(32))]), /déjà dans tes amis/);
  const gid = A.chat.createGroup('Les copains <b>', [B.key(), C.key()]); assert.match(gid, /^g:[0-9a-f]{16}$/);
  await until(() => B.chat.list().groups.length && C.chat.list().groups.length, 8000, 'invitations'); const gb = B.chat.list().groups[0];
  assert.deepStrictEqual([gb.st, gb.admin, gb.name, gb.members.length], ['invited', false, 'Les copains b', 3], 'invité, pas membre ; nom nettoyé'); assert.strictEqual(B.ev('group-invite').length, 1); assert.strictEqual(D.chat.list().groups.length, 0, 'Dana n’est pas invitée');
  assert.throws(() => B.chat.send(gid, 'je parle sans accord'), /Rejoins d’abord/); B.chat.groupAccept(gid); C.chat.groupAccept(gid);
  A.chat.send(gid, 'bienvenue'); await until(() => texts(B, gid).length === 1 && texts(C, gid).length === 1, 6000, 'message de groupe'); assert.strictEqual(B.chat.messages(gid).find(m => m.k === 't').who, 'Alice');
  B.chat.send(gid, 'salut Carl, c’est Bob'); await until(() => texts(C, gid).length === 2 && texts(A, gid).length === 2, 8000, 'Bob → Carl via Alice, et Alice');
  const got = C.chat.messages(gid).find(m => m.x === 'salut Carl, c’est Bob'); assert.deepStrictEqual([got.who, got.mine], ['Bob', false], 'Carl sait que c’est Bob (signature), pas Alice');
  await until(() => B.chat.messages(gid).every(m => m.k === 's' || !m.mine || m.st === 'ok'), 8000, 'Bob : tout remis (pris en charge puis accusé)'); await until(() => A.chat._db().convs[gid].msgs.find(m => m.x && m.x.startsWith('salut')).pend.length === 0, 6000, 'Alice a remis à Carl (accusé de Carl)');
  assert.ok(!B.chat._db().convs[gid].msgs.some(m => m.p), 'plus de message signé gardé une fois remis');

  /* faux, rejouée, étrangère */
  const a = A.key(), b = B.key(), mid = () => crypto.randomBytes(12).toString('hex'), g16 = gid.slice(2), ts = Date.now(), p = JSON.stringify({ k: 't', x: 'faux' });
  C.f.sendTo(a, { t: 'g', gid: g16, id: mid(), ts, a: b, p, sig: '00'.repeat(64) });   // Carl se fait passer pour Bob
  const id2 = mid(), sigB = B.f.sign(['hyd-chat1', g16, id2, ts, b, p].join('|')); C.f.sendTo(a, { t: 'g', gid: g16, id: id2, ts, a: b, p, sig: sigB });   // vraie signature de Bob, rejouée par Carl : seul l'auteur ou l'administrateur peut la remettre
  const id3 = mid(); D.f.sendTo(a, { t: 'g', gid: g16, id: id3, ts, a: D.key(), p, sig: D.f.sign(['hyd-chat1', g16, id3, ts, D.key(), p].join('|')) });   // Dana n'est pas membre
  const id4 = mid(); B.f.sendTo(a, { t: 'g', gid: g16, id: id4, ts, a: b, p: p.replace('faux', 'truqué'), sig: B.f.sign(['hyd-chat1', g16, id4, ts, b, p].join('|')) });   // contenu retouché après signature
  B.f.sendTo(a, { t: 'ginfo', gid: g16, name: 'piraté', rev: 99, members: [{ k: b, n: 'Bob' }, { k: a, n: 'Alice' }] });   // un membre ne peut pas modifier le groupe
  await wait(900); assert.ok(!texts(A, gid).some(x => /faux|truqu/.test(x)), 'aucun faux message'); assert.strictEqual(A.chat.list().groups[0].name, 'Les copains b', 'groupe inchangé');
});

test('groupes : départ, retrait, ajout, dissolution (même pour un membre hors ligne)', async () => {
  const [A, B, C] = await peers('Alice', 'Bob', 'Carl'); await befriend(A, B); await befriend(A, C);
  const gid = A.chat.createGroup('Équipe', [B.key(), C.key()]); await until(() => B.chat.list().groups.length && C.chat.list().groups.length, 8000); B.chat.groupAccept(gid); C.chat.groupAccept(gid);
  C.chat.groupLeave(gid); assert.strictEqual(C.chat.list().groups.length, 0, 'Carl est sorti'); await until(() => A.chat.list().groups[0].members.length === 2 && B.chat.list().groups[0].members.length === 2, 8000, 'liste mise à jour chez tous');
  assert.ok(A.chat.messages(gid).some(m => m.k === 's' && /Carl a quitté/.test(m.x)));
  A.chat.groupAdd(gid, [C.key()]); await until(() => C.chat.list().groups.length === 1 && B.chat.list().groups[0].members.length === 3, 8000, 'Carl réinvité'); assert.strictEqual(C.chat.list().groups[0].st, 'invited');
  assert.throws(() => B.chat.groupAdd(gid, [C.key()]), /administrateur/); assert.throws(() => B.chat.groupKick(gid, A.key()), /administrateur/); assert.throws(() => A.chat.groupKick(gid, A.key()), /introuvable/);
  A.chat.groupKick(gid, C.key()); await until(() => C.chat.list().groups.length === 0, 8000, 'Carl retiré : son groupe disparaît');
  await B.f.stop(); await until(() => !A.f.isOnline(B.key()), 4000); A.chat.groupLeave(gid); assert.strictEqual(A.chat.list().groups.length, 0, 'dissous chez l’administrateur'); assert.ok(Object.keys(A.chat._db().tomb).length, 'Bob sera prévenu à sa reconnexion');
  await B.f.start(); await until(() => B.chat.list().groups.length === 0, 12000, 'dissolution reçue après reconnexion'); await until(() => Object.keys(A.chat._db().tomb).length === 0, 6000, 'accusé de Bob');
});

test('vie privée : retirer un ami efface la conversation ; nouvelle identité efface tout ; fichier corrompu : on repart de zéro', async () => {
  const [A, B] = await peers('Alice', 'Bob'); await befriend(A, B); A.chat.send(B.key(), 'secret'); await until(() => texts(B, A.key()).length === 1, 5000);
  await B.f.remove(A.key()); B.chat.sync(); assert.strictEqual(B.chat.messages(A.key()).length, 0, 'conversation effacée'); A.chat.wipe(); assert.deepStrictEqual(Object.keys(A.chat._db().convs), []);
  fs.writeFileSync(path.join(A.dir, 'chat.json'), '{ pas du json'); const R = C.create({ dir: A.dir, friends: A.f, saveMs: 10 }); assert.deepStrictEqual(R.list().groups, []); assert.ok(fs.existsSync(path.join(A.dir, 'chat.json.bad')), 'fichier abîmé mis de côté');
  assert.throws(() => A.chat.messages('pas-une-conversation'), /invalide/);
});

test('branchements : interface, canaux, événements', () => {
  const r = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), main = r('src/main/main.js'), pre = r('src/preload.js'), app = r('src/renderer/app.js');
  for (const c of ['chat:list', 'chat:messages', 'chat:thumb', 'chat:send', 'chat:read', 'chat:active', 'chat:share', 'chat:dl', 'chat:gnew', 'chat:gadd', 'chat:gkick', 'chat:gaccept', 'chat:gleave']) assert.ok(pre.includes("'" + c + "'") && main.includes("on('" + c + "'"), c);
  assert.ok(pre.includes("'chat:changed'") && app.includes("hyd.on('chat:changed'"), 'chat:changed');
  assert.ok(/onMessage:[^\n]*chat/.test(main) && /onOnline:[^\n]*chat/.test(main), 'chat branché sur friends'); assert.ok(/chat[\s\S]{0,40}\.flush\(\)/.test(main), 'historique écrit à la fermeture');
  assert.ok(/data-a="p" data-v="friends"|\['friends', 'Amis'/.test(app), 'entrée « Amis » dans le menu');
});
