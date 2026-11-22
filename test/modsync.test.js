/* Mods d'un serveur moddé envoyés aux invités : liste côté hôte (clients seulement), validation stricte côté invité, plan, installation depuis Modrinth par empreinte (jamais depuis l'hôte),
   et l'échange P2P de bout en bout (réseau HyperDHT LOCAL de test, aucun accès à Internet) : sans le bon code rien n'est envoyé, le serveur Minecraft ne reçoit rien. */
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto'), net = require('net'), Module = require('module');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydms-')); let db, calls, toggled, MR_VERSIONS, MR_PROJECTS, DL_FAIL, CONTENT = {};
const sha = b => crypto.createHash('sha1').update(b).digest('hex');
const hostDir = path.join(tmp, 'servers', 'h1'), instDir = id => path.join(tmp, 'instances', id);
const fakeMods = {
  MR: 'https://api.modrinth.com/v2',
  dirOf: id => (id === 'h1' ? hostDir : instDir(id)),
  find: id => { const i = db.instances.find(x => x.id === id) || (db.hosts || []).find(x => x.id === id); if (!i) throw new Error('Instance introuvable.'); return i; },
  fetchJson: async u => { calls.push(['get', u]); if (u.includes('/projects?ids=')) { const ids = JSON.parse(decodeURIComponent(u.split('ids=')[1])); return ids.map(i => MR_PROJECTS[i]).filter(Boolean); } throw new Error('inattendu ' + u); },
  post: async (u, b) => { calls.push(['post', u, b]); const out = {}; for (const h of b.hashes) if (MR_VERSIONS[h]) out[h] = MR_VERSIONS[h]; return out; },
  download: async (url, dest, s1) => { calls.push(['dl', url]); if (DL_FAIL && DL_FAIL(url)) throw new Error('Téléchargement impossible (404)'); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, CONTENT[s1] || 'DL:' + s1); },   // comme le vrai download : le fichier écrit a bien l'empreinte demandée
  toggle: async (id, pid) => { toggled.push(pid); const i = fakeMods.find(id), m = i.mods.find(x => x.pid === pid); const d = path.join(fakeMods.dirOf(id), 'mods'); fs.renameSync(path.join(d, m.file + '.disabled'), path.join(d, m.file)); delete m.disabled; },
};
const stubs = { './store': { get: () => db, save() {} }, './log': { info() {}, warn() {}, error() {} }, './host': { dir: () => hostDir }, './mods': fakeMods };
const load0 = Module._load; Module._load = function (r, ...a) { return stubs[r] || load0.call(this, r, ...a); };
const ms = require('../src/main/modsync'), P = require('../src/main/p2p');
const PIDS = { A: 'AAAAAAAA', B: 'BBBBBBBB', C: 'CCCCCCCC', D: 'DDDDDDDD', E: 'EEEEEEEE', F: 'FFFFFFFF', G: 'GGGGGGGG' };
const put = (dir, name, content) => { fs.mkdirSync(path.join(dir, 'mods'), { recursive: true }); fs.writeFileSync(path.join(dir, 'mods', name), content); return sha(Buffer.from(content)); };
const man = (mods, o = {}) => ({ v: 1, mc: '1.20.1', loader: 'fabric', name: 'Serveur', mods, ...o });
const mod = (pid, title, file, sha1, size = 10) => ({ pid, title, file, sha1, size });

test('validate : liste correcte conservée ; entrées douteuses écartées une à une ; liste inutilisable refusée', () => {
  const S1 = 'a'.repeat(40), S2 = 'b'.repeat(40);
  const v = ms.validate(man([mod('AAAAAAAA', 'Sodium', 'sodium.jar', S1), { ...mod('BBBBBBBB', 'Lithium', 'lithium.jar', S2), url: 'https://evil.example/x.jar', exec: 'rm -rf' }]));
  assert.deepStrictEqual(v.mods.map(m => m.pid), ['AAAAAAAA', 'BBBBBBBB']); assert.ok(!('url' in v.mods[1]) && !('exec' in v.mods[1]), 'champs inconnus supprimés : aucune adresse venant de l’hôte n’est conservée');
  const bad = ms.validate(man([mod('AAAAAAAA', 'ok', 'ok.jar', S1), mod('X', 'pid trop court', 'a.jar', S1), mod('CCCCCCCC', 'sha court', 'c.jar', 'abc'), mod('DDDDDDDD', 'chemin', '../../evil.jar', 'c'.repeat(40)), mod('EEEEEEEE', 'sous-dossier', 'a/b.jar', 'd'.repeat(40)),
    mod('FFFFFFFF', 'pas un jar', 'run.exe', 'e'.repeat(40)), mod('GGGGGGGG', 'doublon', 'dup.jar', S1), mod('HHHHHHHH', 'x'.repeat(500), 'long.jar', 'f'.repeat(40)), null, 'texte', 42]));
  assert.deepStrictEqual(bad.mods.map(m => m.pid), ['AAAAAAAA', 'HHHHHHHH']); assert.strictEqual(bad.mods[1].title.length, 80, 'titre tronqué');
  assert.strictEqual(ms.validate(man([mod('AAAAAAAA', 't', 'a.jar', S1)], { title: 'x' })).mods.length, 1);
  assert.strictEqual(ms.validate(man([mod('AAAAAAAA', 'Ti\u0000t\u001frE', 'a.jar', S1)])).mods[0].title, 'Ti t rE', 'caractères de contrôle retirés');
  for (const x of [null, undefined, 'x', 42, [], { v: 2, mc: '1.20.1', loader: 'fabric', mods: [] }, man([], { mc: '../1.20' }), man([], { mc: 'latest' }), man([], { loader: 'evil' }), { v: 1, mc: '1.20.1', loader: 'fabric', mods: 'non' }]) assert.strictEqual(ms.validate(x), null, JSON.stringify(x));
  assert.strictEqual(ms.validate(man(Array.from({ length: 500 }, (_, k) => mod('AAAAAAAA', 'm' + k, 'm' + k + '.jar', k.toString(16).padStart(40, '0'))))).mods.length, 300, 'plafond de 300 mods');
});

test('build (hôte) : seulement les mods que le client doit avoir, avec leur empreinte', async () => {
  ms._reset(); calls = [];
  fs.rmSync(hostDir, { recursive: true, force: true }); const sA = put(hostDir, 'a.jar', 'contenu A'), sB = put(hostDir, 'b.jar', 'contenu B'); put(hostDir, 'c.jar.disabled', 'C'); const sD = put(hostDir, 'd.jar', 'contenu D');
  MR_PROJECTS = { AAAAAAAA: { id: 'AAAAAAAA', client_side: 'required' }, BBBBBBBB: { id: 'BBBBBBBB', client_side: 'unsupported' }, DDDDDDDD: { id: 'DDDDDDDD', client_side: 'optional' } };
  db = { instances: [], hosts: [{ id: 'h1', name: 'Mon serveur', version: '1.20.1', loader: 'fabric', type: 'fabric', mods: [{ pid: 'AAAAAAAA', title: 'Mod A', file: 'a.jar' }, { pid: 'BBBBBBBB', title: 'Serveur seul', file: 'b.jar' }, { pid: 'CCCCCCCC', title: 'Désactivé', file: 'c.jar', disabled: true }, { pid: 'DDDDDDDD', title: 'Mod D', file: 'd.jar' }, { pid: 'EEEEEEEE', title: 'Fichier absent', file: 'absent.jar' }, { pid: 'imp1a2b3c', title: 'Importé', file: 'imp.jar' }] }, { id: 'h2', name: 'Paper', version: '1.20.1', loader: 'vanilla', type: 'paper', mods: [] }] };
  put(hostDir, 'imp.jar', 'importé à la main');
  const r = await ms.build('h1');
  assert.deepStrictEqual(r.mods.map(m => [m.pid, m.file, m.sha1]), [['AAAAAAAA', 'a.jar', sA], ['DDDDDDDD', 'd.jar', sD], ['imp1a2b3c', 'imp.jar', sha(Buffer.from('importé à la main'))]], 'ni le mod serveur seul, ni le désactivé, ni le fichier absent');
  assert.deepStrictEqual([r.v, r.mc, r.loader, r.name], [1, '1.20.1', 'fabric', 'Mon serveur']); assert.ok(ms.validate(r).mods.length === 3, 'ce que l’hôte envoie est accepté par le validateur de l’invité');
  assert.strictEqual(calls.filter(c => c[0] === 'get').length, 1, 'une seule requête Modrinth pour tous les projets'); await ms.build('h1'); assert.strictEqual(calls.filter(c => c[0] === 'get').length, 1, 'plusieurs invités d’un coup : calcul partagé');
  assert.deepStrictEqual(await ms.build('h2'), { v: 1, mc: '1.20.1', loader: 'vanilla', name: 'Paper', mods: [] }, 'serveur sans mods : liste vide'); assert.strictEqual(await ms.build('inconnu'), null);
  void sB;
});

test('build : hors ligne, on envoie tous les mods (mieux vaut un mod en trop qu’un mod manquant)', async () => {
  ms._reset(); fakeMods.fetchJson = async () => { throw new Error('hors ligne'); };
  try { assert.strictEqual((await ms.build('h1')).mods.length, 4); } finally { fakeMods.fetchJson = async u => { calls.push(['get', u]); const ids = JSON.parse(decodeURIComponent(u.split('ids=')[1])); return ids.map(i => MR_PROJECTS[i]).filter(Boolean); }; }
});

/* ----- côté invité ----- */
const CODE = P.newCode();
function guest() {
  ms._reset(); calls = []; toggled = []; DL_FAIL = null; fs.rmSync(instDir('i1'), { recursive: true, force: true });
  const sA = put(instDir('i1'), 'a-1.jar', 'A exact'), sBold = put(instDir('i1'), 'b-old.jar', 'B ancien'), sC = put(instDir('i1'), 'c.jar.disabled', 'C exact'); put(instDir('i1'), 'x.jar', 'mod perso');
  const S = { sA, sBold, sC, sB: sha(Buffer.from('B nouveau')), sD: sha(Buffer.from('D')), sE: sha(Buffer.from('E')), sF: sha(Buffer.from('F')), sG: sha(Buffer.from('G')) };
  db = { servers: [{ id: 's', addr: '127.0.0.1:1', p2p: CODE }], hosts: [], instances: [{ id: 'i1', name: 'Mon instance', version: '1.20.1', loader: 'fabric', lastPlayed: 1, mods: [
    { pid: PIDS.A, slug: 'a', title: 'A', file: 'a-1.jar' }, { pid: PIDS.B, slug: 'b', title: 'B', file: 'b-old.jar', vid: 'OLDVER11' }, { pid: PIDS.C, slug: 'c', title: 'C', file: 'c.jar', disabled: true }, { pid: 'imp9z9z9z', slug: '', title: 'Perso', file: 'x.jar' }] }] };
  const v = (id, pid, filename, s1, o = {}) => ({ id, project_id: pid, loaders: o.loaders || ['fabric'], game_versions: o.mc || ['1.20.1'], files: [{ filename, url: 'https://cdn.modrinth.com/data/' + pid + '/versions/' + id + '/' + filename, hashes: { sha1: o.hash || s1 }, primary: true }] });
  CONTENT = { [S.sB]: 'B nouveau', [S.sD]: 'D' };
  MR_VERSIONS = { [S.sB]: v('VERB0001', PIDS.B, 'b-new.jar', S.sB), [S.sD]: v('VERD0001', PIDS.D, 'd.jar', S.sD), [S.sF]: v('VERF0001', PIDS.F, 'f.jar', S.sF, { loaders: ['forge'] }), [S.sG]: v('VERG0001', PIDS.G, 'g.jar', S.sG, { hash: 'f'.repeat(40) }) };
  MR_PROJECTS = { [PIDS.B]: { id: PIDS.B, slug: 'bmod', title: 'B Mod', icon_url: 'https://cdn.modrinth.com/b.png' }, [PIDS.D]: { id: PIDS.D, slug: 'dmod', title: 'D Mod', icon_url: 'https://evil.example/i.png' } };
  const M = man([mod(PIDS.A, 'A', 'a-1.jar', S.sA), mod(PIDS.B, 'B', 'b-new.jar', S.sB), mod(PIDS.C, 'C', 'c.jar', S.sC), mod(PIDS.D, 'D', 'd.jar', S.sD), mod(PIDS.E, 'E hors Modrinth', 'e.jar', S.sE), mod(PIDS.F, 'F forge', 'f.jar', S.sF), mod(PIDS.G, 'G truqué', 'g.jar', S.sG)]);
  ms._set(CODE, M); return { S, M };
}
const dm = f => fs.existsSync(path.join(instDir('i1'), 'mods', f));

test('états : ok / désactivé / autre version / manquant, reconnus par l’empreinte du fichier', async () => {
  const { M } = guest(); const st = await ms.states(db.instances[0], M);
  assert.deepStrictEqual(st.map(x => [x.pid[0], x.state]), [['A', 'ok'], ['B', 'differs'], ['C', 'disabled'], ['D', 'missing'], ['E', 'missing'], ['F', 'missing'], ['G', 'missing']]);
  const p = await ms.plan('i1', CODE); assert.deepStrictEqual([p.mc, p.loader, p.total, p.todo], ['1.20.1', 'fabric', 7, 6]); assert.ok(p.items.every(x => x.title && x.state) && !p.items.some(x => x.title === 'A'));
  assert.strictEqual(await ms.plan('i1', P.newCode()), null, 'code inconnu : pas d’aperçu');
});

test('installation : remplace, active, installe depuis Modrinth ; signale ce qui est hors Modrinth ou refusé ; ne touche pas aux mods perso', async () => {
  const { S } = guest(), steps = []; const r = await ms.apply('i1', CODE, t => steps.push(t));
  assert.deepStrictEqual(r.installed, ['D']); assert.deepStrictEqual(r.replaced, ['B']); assert.deepStrictEqual(r.enabled, ['C']); assert.deepStrictEqual(r.manual, [{ title: 'E hors Modrinth' }]);
  assert.deepStrictEqual(r.failed.map(f => f.title).sort(), ['F forge', 'G truqué']); assert.match(r.failed.find(f => f.title === 'F forge').why, /non compatible/); assert.match(r.failed.find(f => f.title === 'G truqué').why, /introuvable/);
  assert.ok(dm('b-new.jar') && !dm('b-old.jar') && dm('d.jar') && dm('c.jar') && !dm('c.jar.disabled') && dm('x.jar') && dm('a-1.jar') && !dm('f.jar') && !dm('g.jar'), 'fichiers : B remplacé, D ajouté, C activé, perso intact, refusés absents');
  assert.deepStrictEqual(toggled, [PIDS.C]); const mods = db.instances[0].mods, B = mods.find(m => m.pid === PIDS.B), D = mods.find(m => m.pid === PIDS.D);
  assert.deepStrictEqual([B.file, B.vid, B.pin, B.slug, B.title, B.icon], ['b-new.jar', 'VERB0001', true, 'bmod', 'B Mod', 'https://cdn.modrinth.com/b.png'], 'version exacte du serveur, figée');
  assert.deepStrictEqual([D.vid, D.pin, D.icon], ['VERD0001', true, ''], 'icône hors Modrinth ignorée'); assert.strictEqual(mods.length, 5, 'A, B, C, D, perso : pas de doublon');
  const dls = calls.filter(c => c[0] === 'dl').map(c => c[1]); assert.ok(dls.length === 2 && dls.every(u => u.startsWith('https://cdn.modrinth.com/data/')), 'seulement B et D (F et G sont refusés AVANT tout téléchargement), tout depuis le CDN de Modrinth : ' + dls.join(' '));
  assert.ok(steps.some(t => /Recherche/.test(t)) && steps.some(t => /Installation de « D »/.test(t)), 'progression annoncée'); void S;
  const again = await ms.apply('i1', CODE); assert.deepStrictEqual([again.installed, again.replaced, again.enabled], [[], [], []], 'relancer ne refait rien d’inutile (déjà à jour)');
});

test('refus : instance d’un autre loader / d’une autre version, liste oubliée, téléchargement qui échoue (le reste continue)', async () => {
  guest(); db.instances[0].loader = 'forge'; await assert.rejects(ms.apply('i1', CODE), /pas en fabric 1\.20\.1/);
  guest(); db.instances[0].version = '1.19.4'; await assert.rejects(ms.apply('i1', CODE), /pas en fabric 1\.20\.1/);
  guest(); await assert.rejects(ms.apply('i1', P.newCode()), /n’est plus disponible/);
  guest(); DL_FAIL = u => u.includes('VERB0001'); const r = await ms.apply('i1', CODE); assert.ok(r.failed.some(f => f.title === 'B' && /impossible/.test(f.why))); assert.deepStrictEqual(r.installed, ['D'], 'D installé malgré l’échec de B'); assert.ok(dm('b-old.jar'), 'l’ancienne version de B reste en place');
});

test('un nom de fichier donné par Modrinth mais piégé n’est jamais écrit', async () => {
  const { S } = guest(); MR_VERSIONS[S.sD].files[0].filename = '../../evil.jar'; const r = await ms.apply('i1', CODE);
  assert.ok(r.failed.some(f => f.title === 'D' && /nom de fichier invalide/.test(f.why)) && !fs.existsSync(path.join(tmp, 'evil.jar')) && !calls.some(c => c[0] === 'dl' && /evil/.test(c[1])));
});

/* ----- échange P2P réel (réseau de test local) ----- */
test('P2P de bout en bout : la liste n’est envoyée qu’à celui qui a le code ; le serveur Minecraft ne reçoit rien ; jouer marche toujours', async t => {
  const createTestnet = require('hyperdht/testnet'), DHT = require('hyperdht'); let reached = 0;
  const mcSrv = net.createServer(s => { reached++; s.on('error', () => {}); s.on('data', d => s.write(d)); }); await new Promise(r => mcSrv.listen(0, '127.0.0.1', r)); const mcPort = mcSrv.address().port;
  const tn = await createTestnet(5); P._test.setBootstrap(tn.bootstrap); ms._reset();
  t.after(async () => { await P._test.reset(); mcSrv.close(); await tn.destroy(); });
  const M = man([mod(PIDS.A, 'Mod A', 'a.jar', 'a'.repeat(40), 5), mod(PIDS.B, 'Mod B', 'b.jar', 'b'.repeat(40), 7)], { name: 'Serveur de test' }); let asks = 0, provider = id => { asks++; return id === 'h1' ? M : null; };
  P.setManifest(id => provider(id)); const code = P.newCode(); await P.share('h1', mcPort, code);
  assert.deepStrictEqual(await P.fetchMods(code), M, 'l’invité reçoit exactement la liste de l’hôte'); assert.strictEqual(reached, 0, 'le serveur Minecraft n’a rien reçu pendant l’échange');
  assert.strictEqual(P.status().shares.find(s => s.hostId === 'h1').peers, 0, 'demander la liste ne compte pas comme un joueur connecté');
  const v = await ms.fetch(code); assert.deepStrictEqual(v.mods.map(m => m.pid), [PIDS.A, PIDS.B]); const n1 = asks; await ms.fetch(code); assert.strictEqual(asks, n1, 'liste mémorisée quelques minutes : l’hôte n’est pas resollicité'); assert.ok(ms.cached(code), 'plan / apply utilisent cette mémoire');
  assert.ok((await Promise.all([1, 2, 3, 4].map(() => P.fetchMods(code)))).every(x => x.name === 'Serveur de test'), '4 amis en même temps');
  // sans le bon code : introuvable, et même en connaissant la clé de l'hôte, aucune liste
  await assert.rejects(P.fetchMods(P.newCode()), /introuvable/); assert.strictEqual(await ms.fetch(P.newCode()), null, 'fetch() ne lève jamais : rejoindre marche sans');
  const spy = new DHT({ bootstrap: tn.bootstrap }); await spy.fullyBootstrapped(); const sock = spy.connect(P._keys(P.parseCode(code)).publicKey); sock.on('error', () => {});
  const verdict = await new Promise(res => { let got = Buffer.alloc(0); const to = setTimeout(() => res('rien reçu'), 9000); sock.on('data', d => { got = Buffer.concat([got, d]); if (got.length === 32) sock.write(crypto.randomBytes(32)); if (got.length > 32) { clearTimeout(to); res('LISTE REÇUE'); } }); sock.on('close', () => { clearTimeout(to); res('fermé'); }); });
  assert.strictEqual(verdict, 'fermé', 'une fausse preuve ne donne pas la liste'); await spy.destroy();
  // hôte qui n'envoie pas de liste (ancien Hydarium, serveur sans mods), qui plante, ou qui envoie démesuré : null, jamais d'erreur côté jeu
  ms._reset(); provider = () => null; assert.strictEqual(await P.fetchMods(code), null); assert.strictEqual(await ms.fetch(code), null);
  provider = () => { throw new Error('boum'); }; assert.strictEqual(await P.fetchMods(code), null, 'hôte en erreur : rien');
  provider = () => ({ ...M, mods: Array.from({ length: 5000 }, (_, k) => mod(PIDS.A, 'x'.repeat(70), 'f' + k + '.jar', k.toString(16).padStart(40, '0'))) }); assert.strictEqual(await P.fetchMods(code), null, 'plus de 256 Ko : refusé');
  P.setManifest(null); assert.strictEqual(await P.fetchMods(code), null, 'sans fournisseur : pas de liste');
  // jouer fonctionne toujours (ancien protocole inchangé)
  const g = await P.join(code), echo = await new Promise(res => { const s = net.connect(g.port, '127.0.0.1'), ch = []; const to = setTimeout(() => s.destroy(), 3000); s.on('connect', () => s.write('salut')); s.on('data', d => { ch.push(d); if (Buffer.concat(ch).length >= 5) s.destroy(); }); s.on('close', () => { clearTimeout(to); res(Buffer.concat(ch)); }); s.on('error', () => {}); });
  assert.deepStrictEqual(echo, Buffer.from('salut'), 'le tunnel de jeu marche toujours'); assert.ok(reached >= 1);
});

test('branchements : fournisseur côté hôte, aperçu dans « Rejoindre », installation après confirmation, événement de progression', () => {
  const r = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), main = r('src/main/main.js'), app = r('src/renderer/app.js'), jn = r('src/main/joiner.js');
  assert.ok(/require\('\.\/p2p'\)\.setManifest\(id => require\('\.\/modsync'\)\.build\(id\)\)/.test(main), 'l’hôte envoie sa liste');
  assert.ok(/on\('modsync:apply', \(instId, addr\)[\s\S]*?s\.p2p[\s\S]*?modsync'\)\.apply\(String\(instId\), s\.p2p/.test(main), 'le code vient du serveur enregistré, jamais d’une liste envoyée par l’interface');
  assert.ok(r('src/preload.js').includes("'modsync:apply'") && r('src/preload.js').includes("'modsync:step'") && /hyd\.on\('modsync:step'/.test(app));
  assert.ok(/exports\.plan = async \(addr, opts\) => \{\s*const r = await basePlan\(addr, opts\);\s*try \{ await attachSync/.test(jn), 'jamais bloquant');
  assert.ok(/p\.sync && p\.sync\.todo/.test(app) && /syncBox\(p\.sync\)/.test(app) && /n’accepte que si tu fais confiance à l’hôte/.test(app) && /call\('modsync:apply', id, p\.server\.addr\)/.test(app));
  assert.ok(/!\(p\.sync && p\.sync\.todo\)\) \{ closeModal\(\); await play/.test(app), 'pas de lancement direct tant qu’il y a des mods à synchroniser');
});
