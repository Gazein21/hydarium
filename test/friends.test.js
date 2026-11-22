/* Amis P2P : code ami (somme de contrôle), demande anonyme → le destinataire voit le pseudo, présence, invitation, blocage, mode invisible, réinitialisation ;
   et la sécurité : un inconnu ne peut QUE déposer une demande, une identité ne se falsifie pas, tout est borné. De VRAIS pairs HyperDHT sur un réseau de test local (aucun accès à Internet). */
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const createTestnet = require('hyperdht/testnet'), DHT = require('hyperdht');
const F = require('../src/main/friends'), P = require('../src/main/p2p');
const until = async (f, ms = 8000, what = '') => { const t = Date.now(); while (Date.now() - t < ms) { if (await f()) return true; await new Promise(r => setTimeout(r, 40)); } throw new Error('délai dépassé : ' + what); };
const hex = b => Buffer.from(b).toString('hex'); let tn; const all = [], spies = [];
const mk = (name, db = { friends: {} }) => {
  const events = [], prof = { name, st: 'online', what: '' };
  const f = F.create({ store: { get: () => db, save() {} }, DHT, bootstrap: tn.bootstrap, profile: () => prof, notify: (k, d) => events.push([k, d]), seal: s => 'S:' + Buffer.from(s).reverse().toString('hex'), unseal: s => Buffer.from(s.slice(2), 'hex').reverse().toString(), timing: { hiMs: 300, deadMs: 1500, retryMs: 400, backoff: [100, 200, 300] } });
  const x = { f, db, events, prof, name, key: () => hex(DHT.keyPair(Buffer.from(Buffer.from(db.friends.seed.slice(2), 'hex').reverse().toString(), 'hex')).publicKey), code: () => f.status().code, ev: k => events.filter(e => e[0] === k) }; all.push(x); return x;
};
const befriend = async (a, b) => { await a.f.request(b.code()); await until(() => b.f.status().inbox.length, 6000, 'demande reçue'); await b.f.accept(a.key()); await until(() => a.f.status().friends.some(x => x.online) && b.f.status().friends.some(x => x.online), 8000, 'présence'); };
test.before(async () => { tn = await createTestnet(5); });
test.after(async () => { for (const s of spies) try { await s.destroy(); } catch (e) { /* fini */ } for (const x of all) try { await x.f.stop(); } catch (e) { /* fini */ } await tn.destroy(); });

test('code ami : aller-retour, tolérance de saisie, fautes de frappe détectées', () => {
  for (let i = 0; i < 50; i++) { const pk = crypto.randomBytes(32), c = F.encode(pk); assert.match(c, /^HYA-([0-9A-Z]{6}-){8}[0-9A-Z]{6}$/); assert.deepStrictEqual(F.decode(c), pk); }
  const pk = crypto.randomBytes(32), c = F.encode(pk); assert.deepStrictEqual(F.decode(c.toLowerCase()), pk); assert.deepStrictEqual(F.decode('  ' + c.replace(/-/g, ' ') + '\n'), pk); assert.deepStrictEqual(F.decode(c.slice(4)), pk, 'sans le préfixe');
  const body = c.slice(4).replace(/-/g, ''); let caught = 0; for (let i = 0; i < 54; i++) { const ch = body[i], bad = ch === '2' ? '3' : '2', t = body.slice(0, i) + bad + body.slice(i + 1); if (F.decode('HYA' + t) === null) caught++; } assert.strictEqual(caught, 54, 'toute faute sur un caractère est détectée');
  for (const bad of ['', null, 'HYA-', 'HYD-ABCD-EFGH-JKMN-PQRS-TVWX-YZ01', 'x'.repeat(54), c + 'AA', c.slice(0, -2)]) assert.strictEqual(F.decode(bad), null, String(bad));
  assert.strictEqual(F.cleanName('<b>Al"ice&\'</b>'), 'bAlice/b'); assert.strictEqual(F.cleanName('   '), 'Joueur'); assert.strictEqual(F.cleanName('x'.repeat(99)).length, 32); assert.strictEqual(F.cleanName(null), 'Joueur');
});

test('désactivé par défaut : aucun réseau, aucun code ; l’identité est gardée chiffrée et retrouvée au redémarrage', async () => {
  const a = mk('Alice'); const s = a.f.status(); assert.deepStrictEqual([s.on, s.enabled, s.code, s.friends.length], [false, false, '', 0]); await assert.rejects(a.f.request('HYA-x'), /Active d’abord/);
  await a.f.enable(true); const code = a.code(); assert.match(code, /^HYA-/); assert.ok(a.db.friends.seed.startsWith('S:') && !a.db.friends.seed.includes(Buffer.from(a.db.friends.seed.slice(2), 'hex').reverse().toString()), 'graine chiffrée, jamais en clair');
  await a.f.stop(); assert.strictEqual(a.f.status().on, false); assert.strictEqual(a.db.friends.on, true, 'arrêt du launcher : reste activé pour la prochaine fois'); await a.f.start(); assert.strictEqual(a.code(), code, 'même identité (code permanent)');
  await a.f.enable(false); assert.deepStrictEqual([a.f.status().on, a.db.friends.on], [false, false]);
});

test('demande anonyme → le destinataire voit le pseudo ; acceptation → amis des deux côtés, présence réciproque', async () => {
  const A = mk('Alice'), B = mk('Bob'); await A.f.enable(true); await B.f.enable(true); assert.notStrictEqual(A.code(), B.code());
  const r = await A.f.request(B.code()); assert.deepStrictEqual(r, { sent: true, queued: false });
  await until(() => B.f.status().inbox.length, 6000, 'demande reçue'); const inb = B.f.status().inbox[0]; assert.deepStrictEqual([inb.name, inb.key], ['Alice', A.key()], 'pseudo vu au moment de décider ; identité = clé de la poignée de main');
  assert.deepStrictEqual(B.ev('request'), [['request', { name: 'Alice' }]]); assert.strictEqual(A.f.status().out[0].delivered, true); assert.strictEqual(A.f.status().friends.length + B.f.status().friends.length, 0, 'pas amis tant que non accepté');
  await A.f.request(B.code()).catch(() => {}); assert.strictEqual(B.f.status().inbox.length, 1, 'redemander ne duplique pas');
  await B.f.accept(A.key()); await until(() => A.f.status().friends.length && A.f.status().out.length === 0, 6000, 'ami côté demandeur');
  assert.deepStrictEqual(A.f.status().friends.map(x => x.name), ['Bob'], 'Alice apprend le pseudo de Bob à l’acceptation'); assert.deepStrictEqual(B.f.status().friends.map(x => x.name), ['Alice']); assert.strictEqual(B.f.status().inbox.length, 0);
  await until(() => A.f.status().friends[0].online && B.f.status().friends[0].online, 8000, 'présence'); assert.strictEqual(A.f.status().friends[0].st, 'online');
  A.prof.st = 'playing'; A.prof.what = 'Minecraft 1.20.1'; A.f.refresh(); await until(() => B.f.status().friends[0].st === 'playing', 4000, 'état en jeu'); assert.strictEqual(B.f.status().friends[0].what, 'Minecraft 1.20.1');
  assert.ok(A.ev('friend').length === 1, 'Alice est prévenue');
});

test('invitation à rejoindre un serveur : seulement un ami en ligne, seulement un vrai code d’invitation, 5 par minute', async () => {
  const A = mk('Alice'), B = mk('Bob'); await A.f.enable(true); await B.f.enable(true); await befriend(A, B); const code = P.newCode();
  assert.strictEqual(A.f.invite(B.key(), 'Mon serveur', code), true); await until(() => B.ev('invite').length, 4000, 'invitation'); const inv = B.ev('invite')[0][1]; assert.deepStrictEqual([inv.from, inv.name, inv.code, inv.key], ['Alice', 'Mon serveur', P.normalize(code), A.key()]);
  assert.throws(() => A.f.invite(B.key(), 'x', 'pas-un-code'), /invalide/); assert.throws(() => A.f.invite('f'.repeat(64), 'x', code), /pas en ligne/);
  for (let i = 0; i < 8; i++) A.f.invite(B.key(), 'Serveur ' + i, P.newCode()); await new Promise(r => setTimeout(r, 700)); assert.strictEqual(B.ev('invite').length, 5, 'au plus 5 invitations par minute et par ami');
});

async function spy(target, kp = DHT.keyPair(crypto.randomBytes(32))) {
  const d = new DHT({ bootstrap: tn.bootstrap }); spies.push(d); const sock = d.connect(Buffer.from(target, 'hex'), { keyPair: kp }); const out = { sock, kp, got: '', closed: false }; sock.on('error', () => {}); sock.on('data', x => { out.got += x; }); sock.on('close', () => { out.closed = true; });
  await new Promise((res, rej) => { sock.once('open', res); sock.once('close', () => rej(new Error('fermée avant ouverture'))); }).catch(() => {}); return out;
}
test('un inconnu ne peut QUE déposer une demande : le reste est coupé, aucun faux ami, aucune fausse invitation', async () => {
  const B = mk('Bob'); await B.f.enable(true); const bkey = hex(DHT.keyPair(Buffer.from(Buffer.from(B.db.friends.seed.slice(2), 'hex').reverse().toString(), 'hex')).publicKey);
  for (const msg of [{ t: 'hi', name: 'Alice', st: 'online' }, { t: 'invite', name: 'x', code: P.newCode() }, { t: 'bye' }, { t: 'accept', name: 'Faux' }, { t: 'inconnu' }, 'pas du json', JSON.stringify([1, 2]), JSON.stringify(null), 'x'.repeat(20000)]) {
    const s = await spy(bkey); s.sock.write((typeof msg === 'string' ? msg : JSON.stringify(msg)) + '\n'); await until(() => s.closed, 4000, 'coupé : ' + JSON.stringify(msg).slice(0, 30));
  }
  assert.deepStrictEqual([B.ev('invite').length, B.f.status().friends.length, B.f.status().inbox.length], [0, 0, 0]);
  const kp = DHT.keyPair(crypto.randomBytes(32)), s = await spy(bkey, kp); s.sock.write(JSON.stringify({ t: 'req', name: 'Mallory', key: 'a'.repeat(64), from: 'b'.repeat(64) }) + '\n'); await until(() => B.f.status().inbox.length, 4000, 'demande');
  assert.deepStrictEqual([B.f.status().inbox[0].name, B.f.status().inbox[0].key], ['Mallory', hex(kp.publicKey)], 'l’identité est celle de la poignée de main, pas celle écrite dans le message');
  assert.match(s.got, /"t":"ack"/); await until(() => s.closed, 3000, 'fermé après l’accusé');
  const t = await spy(bkey); t.sock.write(JSON.stringify({ t: 'req', name: '<img src=x onerror=alert(1)>' }) + '\n'); await until(() => B.f.status().inbox.length === 2, 4000); assert.ok(!/[<>]/.test(B.f.status().inbox[1].name), 'pseudo nettoyé : ' + B.f.status().inbox[1].name);
});

test('demandes en attente limitées à 30 ; bloquer : plus aucune demande ne passe, débloquer les rétablit', async () => {
  const B = mk('Bob'); await B.f.enable(true); const bkey = B.key(); for (let i = 0; i < 30; i++) B.db.friends.inbox.push({ key: crypto.randomBytes(32).toString('hex'), name: 'p' + i, at: Date.now() });
  const s = await spy(bkey); s.sock.write(JSON.stringify({ t: 'req', name: 'trente et un' }) + '\n'); await until(() => s.closed, 4000); assert.strictEqual(B.f.status().inbox.length, 30, 'la 31ᵉ n’entre pas');
  B.db.friends.inbox = []; const A = mk('Alice'); await A.f.enable(true); await A.f.request(B.code()); await until(() => B.f.status().inbox.length, 5000); B.f.decline(A.key(), true); assert.deepStrictEqual([B.f.status().inbox.length, B.f.status().blocked], [0, 1]);
  const r = await A.f.request(B.code()).catch(e => e); assert.ok(r.queued || r instanceof Error, 'bloquée : la demande n’aboutit pas'); await new Promise(r2 => setTimeout(r2, 600)); assert.strictEqual(B.f.status().inbox.length, 0, 'rien reçu');
  assert.strictEqual(B.ev('request').length, 1, 'une seule notification : la première');
  B.f.unblock(A.key()); assert.strictEqual(B.f.status().blocked, 0); await A.f.request(B.code()); await until(() => B.f.status().inbox.length, 6000, 'redevient possible une fois débloquée'); assert.strictEqual(B.f.status().inbox[0].name, 'Alice');   // c'est à Alice de redemander : elle n'a jamais su qu'elle était bloquée
});

test('refus d’une demande ; erreurs claires : soi-même, déjà ami, code invalide', async () => {
  const A = mk('Alice'), B = mk('Bob'); await A.f.enable(true); await B.f.enable(true);
  await assert.rejects(A.f.request(A.code()), /propre code/); await assert.rejects(A.f.request('HYA-ABCDEF'), /invalide/); await assert.rejects(A.f.request(F.encode(crypto.randomBytes(32)).slice(0, -1) + 'X'), /invalide/);
  await befriend(A, B); await assert.rejects(A.f.request(B.code()), /déjà dans tes amis/);
  const C = mk('Carl'); await C.f.enable(true); await C.f.request(B.code()); await until(() => B.f.status().inbox.length, 5000); B.f.decline(C.key(), false); assert.deepStrictEqual([B.f.status().inbox.length, B.f.status().blocked], [0, 0]); await assert.rejects(B.f.accept(C.key()), /introuvable/);
});

test('apparaître hors ligne : les amis ne te voient plus, puis te revoient', async () => {
  const A = mk('Alice'), B = mk('Bob'); await A.f.enable(true); await B.f.enable(true); await befriend(A, B);
  B.f.setHidden(true); await until(() => !A.f.status().friends[0].online, 6000, 'invisible'); assert.strictEqual(B.f.status().hidden, true); await new Promise(r => setTimeout(r, 900)); assert.strictEqual(A.f.status().friends[0].online, false, 'reste invisible');
  B.f.setHidden(false); await until(() => A.f.status().friends[0].online && B.f.status().friends[0].online, 8000, 'de retour');
});

test('retirer un ami : prévenu, plus de présence ni d’invitation des deux côtés', async () => {
  const A = mk('Alice'), B = mk('Bob'); await A.f.enable(true); await B.f.enable(true); await befriend(A, B);
  await A.f.remove(B.key()); assert.strictEqual(A.f.status().friends.length, 0); await until(() => B.f.status().friends.length === 0, 5000, 'Bob prévenu'); assert.deepStrictEqual(B.ev('removed'), [['removed', { name: 'Alice' }]]);
  assert.throws(() => A.f.invite(B.key(), 'x', P.newCode()), /pas en ligne/); await new Promise(r => setTimeout(r, 600)); assert.strictEqual(A.f.status().friends.length + B.f.status().friends.length, 0, 'ne se reforme pas tout seul');
});

test('accepter alors que le demandeur est hors ligne : l’amitié se conclut quand il revient', async () => {
  const A = mk('Alice'), B = mk('Bob'); await A.f.enable(true); await B.f.enable(true); await A.f.request(B.code()); await until(() => B.f.status().inbox.length, 5000); await A.f.stop();
  const fr = await B.f.accept(A.key()); assert.strictEqual(fr.pendingAccept, true, 'en attente de livraison'); assert.strictEqual(B.f.status().friends[0].pendingAccept, true);
  await A.f.start(); await until(() => A.f.status().friends.length === 1 && !B.f.status().friends[0].pendingAccept, 9000, 'amitié conclue'); assert.deepStrictEqual(A.f.status().friends.map(x => x.name), ['Bob']); assert.strictEqual(A.f.status().out.length, 0);
  await until(() => A.f.status().friends[0].online, 8000, 'présence après coup');
});

test('demandes croisées : chacun a demandé à l’autre → amis tout de suite', async () => {
  const A = mk('Alice'), B = mk('Bob'); await A.f.enable(true); await B.f.enable(true); B.db.friends.out.push({ key: A.key(), at: Date.now(), d: true });   // Bob avait déjà demandé Alice
  await A.f.request(B.code()); await until(() => A.f.status().friends.length === 1 && B.f.status().friends.length === 1, 6000, 'amis'); assert.deepStrictEqual([A.f.status().friends[0].name, B.f.status().friends[0].name], ['Bob', 'Alice']); assert.deepStrictEqual([A.f.status().out.length, B.f.status().out.length, B.f.status().inbox.length], [0, 0, 0]);
});

test('une demande à quelqu’un hors ligne est mise en attente puis livrée', async () => {
  const A = mk('Alice'), B = mk('Bob'); await A.f.enable(true); await B.f.enable(true); const code = B.code(); await B.f.stop();
  const r = await A.f.request(code); assert.deepStrictEqual(r, { sent: false, queued: true }); assert.strictEqual(A.f.status().out[0].delivered, false);
  await B.f.start(); await until(() => B.f.status().inbox.length === 1, 12000, 'livrée au retour'); assert.strictEqual(A.f.status().out[0].delivered, true);
});

test('réinitialiser le code ami : nouvelle identité, TOUS les contacts effacés, les anciens amis sont prévenus', async () => {
  const A = mk('Alice'), B = mk('Bob'); await A.f.enable(true); await B.f.enable(true); await befriend(A, B); A.f.setHidden(false); A.db.friends.blocked.push('c'.repeat(64)); const old = A.code();
  await A.f.reset(); const s = A.f.status(); assert.notStrictEqual(s.code, old); assert.match(s.code, /^HYA-/); assert.deepStrictEqual([s.friends.length, s.inbox.length, s.out.length, s.blocked, s.on], [0, 0, 0, 0, true], 'tout effacé, toujours activé');
  await until(() => B.f.status().friends.length === 0, 6000, 'Bob prévenu'); const spyOld = await spy(hex(F.decode(old))); await new Promise(r => setTimeout(r, 300)); assert.ok(spyOld.closed || !spyOld.got, 'l’ancien code ne mène plus à Alice');
});

test('branchements : interface, canaux, événements et désactivé par défaut', () => {
  const r = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), main = r('src/main/main.js'), pre = r('src/preload.js'), app = r('src/renderer/app.js');
  for (const c of ['friends:status', 'friends:enable', 'friends:hidden', 'friends:reset', 'friends:request', 'friends:accept', 'friends:decline', 'friends:remove', 'friends:cancel', 'friends:invite', 'friends:unblock', 'friends:join']) assert.ok(pre.includes("'" + c + "'") && main.includes("on('" + c + "'"), c);
  for (const e of ['friends:changed', 'friends:invite']) assert.ok(pre.includes("'" + e + "'") && app.includes("hyd.on('" + e + "'"), e);
  assert.ok(/require\('\.\/friends'\)\.create\(/.test(main) && /config\(\)\.on[\s\S]{0,80}start\(\)/.test(main), 'relancé au démarrage seulement si activé'); assert.ok(/friends[\s\S]{0,60}\.stop\(\)/.test(main), 'arrêté proprement à la fermeture');
});

/* ----- interface : le vrai code de app.js est extrait et exécuté ----- */
const vm = require('vm');
function ui(over = {}) {
  const app = fs.readFileSync(path.join(__dirname, '..', 'src/renderer/app.js'), 'utf8'), a = app.indexOf('let FR = null, FRINV = null;'), b = app.indexOf('/* ----- assistant de crash du serveur');
  assert.ok(a > 0 && b > a, 'bloc des amis introuvable');
  const dom = { frmodal: false, frcode: { value: '' } }, opened = [], rendered = [];
  const ctx = { esc: s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'), priv: h => '<span class="priv">' + h + '</span>', ic: n => '[' + n + ']', page: 'home',
    $: sel => (sel === '#frmodal' ? (dom.frmodal ? {} : null) : sel === '#frcode' ? (dom.frmodal ? dom.frcode : null) : null), openModal: h => { dom.frmodal = /id="frmodal"/.test(h); opened.push(h); }, render: () => rendered.push(ctx.page), ...over };
  vm.createContext(ctx); vm.runInContext(app.slice(a, b) + '\nthis.X = { friendsHome, friendsModal, frInvRow, frUpdate, set: v => { FR = v; }, get: () => FR };', ctx); return { X: ctx.X, ctx, dom, opened, rendered };
}
const S = (o = {}) => ({ on: true, enabled: true, hidden: false, code: 'HYA-ABCDEF-GHJKMN', name: 'Moi', friends: [], inbox: [], out: [], blocked: 0, blockedKeys: [], ...o });
test('interface : accueil — invitation à activer tant que c’est désactivé, puis les amis en ligne seulement, pseudos neutralisés', () => {
  const { X } = ui(); assert.match(X.friendsHome(), /Retrouve tes amis[\s\S]*Désactivé par défaut[\s\S]*data-a="frOpen"/); X.set(S({ on: false, enabled: true })); assert.match(X.friendsHome(), /Connexion en cours/);
  X.set(S({ friends: [{ key: 'k1', name: 'Alice', online: true, st: 'playing', what: 'Minecraft 1.20.1' }, { key: 'k2', name: '<img src=x onerror=alert(1)>', online: true, st: 'online', what: '' }, { key: 'k3', name: 'Hors', online: false, st: '', what: '' }], inbox: [{ key: 'q', name: 'Demandeur', at: 1 }] }));
  const h = X.friendsHome(); assert.match(h, /Alice[\s\S]*en jeu · Minecraft 1\.20\.1/); assert.ok(!/Hors<\/b>/.test(h), 'les amis hors ligne ne sont pas listés sur l’accueil'); assert.ok(!/<img/.test(h) && h.includes('&lt;img'), 'pseudo hostile neutralisé'); assert.match(h, /3 amis · <b>1 demande<\/b>/);
  X.set(S()); assert.match(X.friendsHome(), /Aucun ami en ligne pour le moment/);
});
test('interface : fenêtre — avertissement IP avant d’activer ; une fois activée : code flouté, demandes, amis, blocages, tout échappé', () => {
  const u = ui(); u.X.set(S({ on: false, enabled: false })); u.X.friendsModal(); const intro = u.opened.at(-1);
  assert.match(intro, /adresse IP/); assert.match(intro, /permanent/); assert.match(intro, /Ne le donne qu’à des personnes de confiance/); assert.match(intro, /data-a="frOn"/); assert.ok(!/frcode|data-a="frAdd"/.test(intro), 'rien d’autre avant activation');
  const evil = '"><script>alert(1)</script>'; u.X.set(S({ hidden: true, blocked: 2, blockedKeys: ['a', 'b'], inbox: [{ key: 'kq"x', name: evil, at: 1 }], out: [{ key: 'ab12cd34ef56'.repeat(5) + 'abcd', at: 1, delivered: false }], friends: [{ key: 'kf', name: evil, online: true, st: 'online', what: '', pendingAccept: false }, { key: 'kg', name: 'Gina', online: false, st: '', what: '', pendingAccept: true }] }));
  u.X.friendsModal(); const h = u.opened.at(-1); assert.ok(!/<script/.test(h), 'aucun pseudo ne peut injecter de code'); assert.match(h, /<span class="priv">HYA-ABCDEF-GHJKMN<\/span>/, 'code ami flouté par le mode confidentialité');
  assert.match(h, /Demandes reçues \(1\)[\s\S]*data-a="frAcc"[\s\S]*data-a="frDec"[\s\S]*data-a="frBlk"/); assert.match(h, /Demandes envoyées \(1\)[\s\S]*livrée quand la personne sera en ligne/); assert.match(h, /Mes amis \(2\)/); assert.match(h, /en attente de sa connexion pour finaliser/);
  assert.match(h, /swt on" data-a="frHide"/, 'interrupteur « hors ligne » activé'); assert.match(h, /2 personnes bloquées[\s\S]*frUnb/); assert.match(h, /Nouveau code[\s\S]*efface tous tes contacts/); assert.match(h, /data-a="frOff"/);
});
test('interface : un nouvel état redessine sans perdre la saisie, et jamais la page d’un serveur', () => {
  const u = ui(); u.X.set(S()); u.X.friendsModal(); u.dom.frcode.value = 'HYA-en cours de frappe'; u.opened.length = 0; u.ctx.page = 'home'; u.X.frUpdate(S({ friends: [{ key: 'k', name: 'Nouveau', online: true, st: 'online', what: '' }] }));
  assert.strictEqual(u.opened.length, 1, 'fenêtre rouverte avec le nouvel état'); assert.match(u.opened[0], /Nouveau/); assert.strictEqual(u.dom.frcode.value, 'HYA-en cours de frappe', 'texte saisi conservé'); assert.deepStrictEqual(u.rendered, ['home']);
  for (const p of ['hostd', 'inst', 'settings']) { u.rendered.length = 0; u.ctx.page = p; u.X.frUpdate(S()); assert.deepStrictEqual(u.rendered, [], p + ' : pas de redessin'); }
  u.ctx.page = 'profile'; u.rendered.length = 0; u.X.frUpdate(S()); assert.deepStrictEqual(u.rendered, ['profile']);
});
test('interface : inviter un ami — seulement si le serveur partage son invitation et qu’un ami est en ligne', () => {
  const u = ui(); const on = { sharing: true }; u.X.set(S({ friends: [{ key: 'ka', name: 'Alice', online: true }, { key: 'kb', name: 'Bob', online: false }] }));
  const r = u.X.frInvRow(on); assert.match(r, /<option value="ka">Alice<\/option>/); assert.ok(!r.includes('Bob'), 'seulement les amis en ligne'); assert.match(r, /data-a="frInvGo"/);
  assert.strictEqual(u.X.frInvRow({ sharing: false }), ''); assert.strictEqual(u.X.frInvRow(null), ''); u.X.set(S({ friends: [{ key: 'kb', name: 'Bob', online: false }] })); assert.strictEqual(u.X.frInvRow(on), ''); u.X.set(S({ on: false })); assert.strictEqual(u.X.frInvRow(on), ''); u.X.set(null); assert.strictEqual(u.X.frInvRow(on), '');
});
