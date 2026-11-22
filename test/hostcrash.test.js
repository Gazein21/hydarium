/* Assistant de crash des serveurs : cause (CLUF, port, data pack, monde, mod client, watchdog, jar, plugin, Java, mémoire…), boutons de réparation, détection d'un arrêt inattendu, actions de réparation. */
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), Module = require('module'), net = require('net');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydcr-')); let db, saves = 0;
const stubs = { electron: { nativeImage: {} }, './notify': { show() {}, onClick() {} }, './game': {}, './log': { info() {}, warn() {}, error() {} }, './platform': { dataDir: () => tmp }, './store': { get: () => db, save: () => { saves++; } } };
const load0 = Module._load; Module._load = function (r, ...a) { return stubs[r] || load0.call(this, r, ...a); };
const hc = require('../src/main/hostcrash'), host = require('../src/main/host');
const H = (o = {}) => ({ id: 'h1', name: 'Mon serveur', version: '1.20.1', type: 'vanilla', mem: 2, port: 25565, mods: [], ...o });
const kinds = (t, h = H(), c = {}) => { const a = hc.analyze(h, t, c); return [a.kind, a]; };
const ids = a => a.actions.map(x => x.id);

test('CLUF non accepté (le serveur s’arrête avec le code 0) : bouton pour l’accepter', () => {
  const [k, a] = kinds('[12:00:01] [Server thread/INFO]: You need to agree to the EULA in order to run the server. Go to eula.txt for more info.');
  assert.strictEqual(k, 'eula'); assert.deepStrictEqual(ids(a), ['eula']); assert.match(a.hint, /minecraft\.net\/eula/);
});

test('port déjà utilisé : autre port libre proposé', () => {
  const t = '[Server thread/ERROR]: **** FAILED TO BIND TO PORT!\n[Server thread/WARN]: The exception was: java.net.BindException: Address already in use: bind\n[Server thread/WARN]: Perhaps a server is already running on that port?';
  const [k, a] = kinds(t, H({ port: 25570 })); assert.strictEqual(k, 'port'); assert.deepStrictEqual(ids(a), ['port', 'retry']); assert.match(a.hint, /25570/);
  assert.match(kinds('Failed to bind to port 25999\njava.net.BindException', H())[1].hint, /25999/);
});

test('data pack fautif : retrouvé par son nom dans le journal (même avec des espaces), désactivation seulement si level.dat existe', () => {
  const log = '[Server thread/ERROR]: Parsing error loading recipe mypack:cuivre\n[Server thread/ERROR]: Couldn\'t load data pack file/Mon Pack Cassé.zip\n[Server thread/ERROR]: Failed to load datapacks, can\'t proceed with server load. You can either fix your datapacks or reset to vanilla with --safeMode';
  const c = { packs: ['Autre.zip', 'Mon Pack Cassé.zip', 'ok.zip'], newestPack: 'ok.zip', hasLevel: true };
  const [k, a] = kinds(log, H(), c); assert.strictEqual(k, 'datapack'); assert.deepStrictEqual(a.actions.map(x => [x.id, x.v]), [['dpoff', 'Mon Pack Cassé.zip'], ['dprm', 'Mon Pack Cassé.zip']]); assert.match(a.actions[0].label, /Désactiver « Mon Pack Cassé » et relancer/);
});
test('data pack : sans level.dat → seulement « retirer » ; nom absent du journal → le dernier ajouté ; aucun pack → conseil sans bouton', () => {
  const log = 'Failed to load datapacks, can\'t proceed with server load.';
  assert.deepStrictEqual(ids(hc.analyze(H(), log, { packs: ['a.zip', 'b.zip'], newestPack: 'b.zip', hasLevel: false })), ['dprm']);
  const a = hc.analyze(H(), log, { packs: ['a.zip', 'b.zip'], newestPack: 'b.zip', hasLevel: true }); assert.deepStrictEqual(a.actions.map(x => x.v), ['b.zip', 'b.zip']); assert.match(a.hint, /le dernier ajouté/);
  assert.deepStrictEqual(hc.analyze(H(), log, { packs: [] }).actions, []);
});

test('monde illisible : copie de secours level.dat_old proposée seulement si elle existe ; monde plus récent que le serveur', () => {
  const t = '[Server thread/ERROR]: Failed to load level world\njava.util.zip.ZipException: Not in GZIP format';
  assert.deepStrictEqual(ids(hc.analyze(H(), t, { levelOld: true })), ['lvold']); const b = hc.analyze(H(), t, { levelOld: false }); assert.strictEqual(b.kind, 'world'); assert.deepStrictEqual(b.actions, []); assert.match(b.hint, /Aucune copie de secours/);
  const n = hc.analyze(H({ version: '1.19.4' }), 'Failed to load level: this world was saved in a newer version of Minecraft', {}); assert.strictEqual(n.kind, 'newer'); assert.match(n.hint, /1\.19\.4/);
});

test('mod réservé au client sur un serveur Fabric : le mod est désigné et désactivable', () => {
  const t = 'net.fabricmc.loader.impl.FormattedException: Mod \'Sodium\' (sodium) 0.5.8 ...\nCould not execute entrypoint stage \'main\' due to errors, provided by \'sodium\'!\nCaused by: java.lang.RuntimeException: Cannot load class net/minecraft/client/Minecraft in environment type SERVER\nAttempted to load class net/minecraft/client/Minecraft for invalid dist DEDICATED_SERVER';
  const h = H({ type: 'fabric', mods: [{ pid: 'AANobbMI', slug: 'sodium', title: 'Sodium', file: 'sodium-0.5.8.jar' }, { pid: 'P7dR8mSH', slug: 'fabric-api', title: 'Fabric API', file: 'fabric-api.jar' }] });
  const a = hc.analyze(h, t); assert.strictEqual(a.kind, 'clientmod'); assert.deepStrictEqual(a.actions.map(x => [x.id, x.v]), [['moddis', 'AANobbMI']]); assert.deepStrictEqual(a.mods.map(m => m.pid), ['AANobbMI']);
  const b = hc.analyze(H(), 'Attempted to load class net/minecraft/client/gui/Screen for invalid dist DEDICATED_SERVER'); assert.strictEqual(b.kind, 'clientmod'); assert.deepStrictEqual(b.actions, [], 'mod non identifié : conseil seulement');
});

test('watchdog : un peu plus de mémoire proposée (jamais au-delà de 16 Go)', () => {
  const t = '[Watchdog/ERROR]: A single server tick took 60.00 seconds (should be max 0.05)\n[Watchdog/ERROR]: Considering it to be crashed, server will forcibly shutdown.';
  assert.deepStrictEqual(ids(hc.analyze(H({ mem: 2 }), t)), ['mem', 'retry']); assert.strictEqual(hc.analyze(H({ mem: 2 }), t).actions[0].v, '4');
  assert.deepStrictEqual(ids(hc.analyze(H({ mem: 16 }), t)), ['retry']); assert.strictEqual(hc.analyze(H({ mem: 15 }), t).actions[0].v, '16');
});

test('server.jar abîmé : retéléchargement pour Vanilla / Paper / Fabric, pas pour Forge', () => {
  const t = 'Error: Unable to access jarfile server.jar';
  for (const ty of ['vanilla', 'paper', 'fabric']) assert.deepStrictEqual(ids(hc.analyze(H({ type: ty }), t)), ['jar']); const f = hc.analyze(H({ type: 'forge' }), t); assert.strictEqual(f.kind, 'jar'); assert.deepStrictEqual(f.actions, []);
});

test('plugin Paper et server.properties invalide : cause nommée', () => {
  assert.match(hc.analyze(H({ type: 'paper' }), '[Server thread/ERROR]: Could not load \'plugins/CoreProtect-22.jar\' in folder \'plugins\'').hint, /CoreProtect-22/);
  assert.match(hc.analyze(H({ type: 'paper' }), '[Server thread/ERROR]: Error occurred while enabling WorldGuard v7.0.9 (Is it up to date?)').hint, /WorldGuard/);
  assert.strictEqual(hc.analyze(H(), 'Failed to load properties from file: server.properties').kind, 'props');
});

test('causes génériques reprises du jeu : Java, mémoire, dépendance, inconnue, arrêt immédiat — avec « relancer »', () => {
  const j = hc.analyze(H(), 'java.lang.UnsupportedClassVersionError: net/minecraft/server/Main has been compiled by a more recent version (class file version 65.0)'); assert.strictEqual(j.kind, 'java'); assert.ok(ids(j).includes('jinst') && !ids(j).includes('jauto'));
  const m = hc.analyze(H({ mem: 4 }), 'java.lang.OutOfMemoryError: Java heap space'); assert.strictEqual(m.kind, 'memory'); assert.ok(ids(m).includes('mem') && ids(m).includes('retry'));
  const d = hc.analyze(H({ type: 'fabric', mods: [{ pid: 'X', slug: 'lithium', title: 'Lithium', file: 'lithium.jar' }] }), 'Mod \'Lithium\' (lithium) 0.11 requires any version of fabric-api, which is missing!'); assert.strictEqual(d.kind, 'dependency'); assert.deepStrictEqual(d.install.map(x => x.slug), ['fabric-api']);
  const u = hc.analyze(H(), '[Server thread/INFO]: Starting minecraft server version 1.20.1\n[Server thread/INFO]: Loading properties', { code: 1, secs: 600 }); assert.strictEqual(u.kind, 'unknown'); assert.strictEqual(u.actions[0].id, 'retry'); assert.match(u.hint, /sans message clair/);
  const q = hc.analyze(H(), '', { code: 1, secs: 2 }); assert.strictEqual(q.kind, 'quick'); assert.strictEqual(q.actions[0].id, 'retry'); assert.match(q.title, /le serveur/i);
  const nr = hc.analyze(H(), 'rien', { code: 0, secs: 3, neverRan: true }); assert.match(nr.hint, /pendant son démarrage/);
});

test('priorité : la cause propre au serveur passe avant les causes génériques', () => {
  assert.strictEqual(hc.analyze(H({ mods: [{ pid: 'X', slug: 'lithium', title: 'Lithium', file: 'l.jar' }] }), 'You need to agree to the EULA\nlithium lithium lithium lithium').kind, 'eula');
  assert.strictEqual(hc.analyze(H(), 'java.lang.OutOfMemoryError: Java heap space\nA single server tick took 60.00 seconds (should be max 0.05)').kind, 'watchdog');
});

function srvDir(over = {}) { const dir = path.join(tmp, 'diag'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(path.join(dir, 'crash-reports'), { recursive: true }); return dir; }
test('arrêt normal ou demandé : pas de diagnostic ; arrêt inattendu : diagnostiqué', () => {
  const dir = srvDir(), t0 = Date.now(), base = { dir, lines: ['[Server thread/INFO]: Done (3.2s)!'], t0, packs: [], hasLevel: true, levelOld: false };
  assert.strictEqual(hc.diagnose(H(), { ...base, code: 1, stopped: true, wasRunning: true }), null, 'arrêt demandé depuis Hydarium');
  assert.strictEqual(hc.diagnose(H(), { ...base, code: 0, stopped: false, wasRunning: true }), null, '/stop dans la console après démarrage');
  const c = hc.diagnose(H(), { ...base, code: 1, stopped: false, wasRunning: true }); assert.ok(c && c.code === 1 && c.analysis.kind && c.tail.length === 1 && c.at > 0);
  const e = hc.diagnose(H(), { ...base, lines: ['You need to agree to the EULA in order to run the server.'], code: 0, stopped: false, wasRunning: false }); assert.strictEqual(e.analysis.kind, 'eula', 'code 0 mais jamais « en ligne » = arrêt pendant le démarrage');
});

test('rapport de plantage et hs_err : lus seulement s’ils sont postérieurs au démarrage', () => {
  const dir = srvDir(), t0 = Date.now(), lines = ['[Server thread/INFO]: Done'], mods = [{ pid: 'MMMMMMMM', slug: 'badmod', title: 'Bad Mod', file: 'badmod.jar' }];
  const old = path.join(dir, 'crash-reports', 'crash-2020-old.txt'); fs.writeFileSync(old, 'Suspected Mods:\n\tBad Mod (badmod)\n'); fs.utimesSync(old, new Date(t0 - 3600e3), new Date(t0 - 3600e3));
  const base = { dir, lines, t0, code: 0, stopped: false, wasRunning: true };
  assert.strictEqual(hc.diagnose(H({ mods }), base), null, 'vieux rapport ignoré, arrêt propre');
  fs.writeFileSync(path.join(dir, 'crash-reports', 'crash-2026-new.txt'), '---- Minecraft Crash Report ----\nSuspected Mods:\n\tBad Mod (badmod)\njava.lang.NoSuchMethodError: x');
  const c = hc.diagnose(H({ mods }), { ...base, t0: t0 - 1000 }); assert.strictEqual(c.report, 'crash-2026-new.txt'); assert.strictEqual(c.analysis.mods[0].pid, 'MMMMMMMM', 'mod suspect tiré du rapport');
  fs.writeFileSync(path.join(dir, 'hs_err_pid123.log'), '# A fatal error has been detected by the Java Runtime Environment:\n# EXCEPTION_ACCESS_VIOLATION'); fs.rmSync(path.join(dir, 'crash-reports', 'crash-2026-new.txt'));
  const d = hc.diagnose(H(), { ...base, t0: t0 - 1000 }); assert.ok(d, 'plantage de Java détecté par hs_err'); assert.ok(d.analysis.kind);
});

/* ----- avec le vrai host.js : détection, mémorisation, actions de réparation ----- */
const sdir = id => path.join(tmp, 'servers', id);
function world(id, o = {}) {
  const w = path.join(sdir(id), 'world'); fs.rmSync(sdir(id), { recursive: true, force: true }); fs.mkdirSync(path.join(w, 'datapacks'), { recursive: true });
  fs.writeFileSync(path.join(sdir(id), 'server.properties'), 'server-port=25565\n'); if (o.old) fs.writeFileSync(path.join(w, 'level.dat_old'), 'sauvegarde'); if (o.cur) fs.writeFileSync(path.join(w, 'level.dat'), 'abime'); return w;
}
test('crashCheck : mémorise l’arrêt inattendu, prévient l’interface, ignore les arrêts demandés ; clearCrash / crashAct l’effacent', async () => {
  const id = 'srv1'; db = { hosts: [{ id, name: 'Test', version: '1.20.1', type: 'vanilla', loader: 'vanilla', mem: 2, port: 25565, mods: [] }], instances: [] }; world(id);
  const sent = [], send = (c, d) => sent.push([c, d]), h = db.hosts[0], r = lines => ({ lines, t0: Date.now(), state: 'running', up: true });
  host.crashCheck(h, id, { ...r(['x']), state: 'stopping' }, 1, send); assert.strictEqual(host.lastCrash(id), null); assert.deepStrictEqual(sent, []);
  host.crashCheck(h, id, r(['[Server thread/ERROR]: **** FAILED TO BIND TO PORT!', 'java.net.BindException: Address already in use']), 1, send);
  assert.strictEqual(host.lastCrash(id).analysis.kind, 'port'); assert.deepStrictEqual(sent, [['host:crashed', { id }]]);
  host.clearCrash(id); assert.strictEqual(host.lastCrash(id), null);
  host.crashCheck(h, id, r(['You need to agree to the EULA']), 0, send); host.crashCheck(h, 'inconnu', r(['x']), 1, send);   // un serveur inconnu ne casse rien
  await host.crashAct(id, 'retry'); assert.strictEqual(host.lastCrash(id), null, 'une réparation efface le diagnostic');
});

test('actions de réparation : CLUF, port libre, mémoire, data pack, copie du monde ; refus des valeurs invalides et d’un serveur en marche', async () => {
  const id = 'srv2'; db = { hosts: [{ id, name: 'Test', version: '1.20.1', type: 'vanilla', loader: 'vanilla', mem: 2, port: 25565, mods: [] }, { id: 'autre', name: 'Autre', port: 25566, mods: [] }], instances: [] }; const h = db.hosts[0];
  const w = world(id, { old: true, cur: true });
  assert.deepStrictEqual(await host.crashAct(id, 'eula'), { restart: true }); assert.match(fs.readFileSync(path.join(sdir(id), 'eula.txt'), 'utf8'), /eula=true/);
  await host.crashAct(id, 'mem', '6'); assert.strictEqual(h.mem, 6); await assert.rejects(host.crashAct(id, 'mem', '99'), /invalide/); await assert.rejects(host.crashAct(id, 'mem', 'abc'), /invalide/);
  const blocker = net.createServer(); await new Promise(ok => blocker.listen(25567, '0.0.0.0', ok));   // 25566 : pris par un autre serveur d'Hydarium ; 25567 : occupé par un programme
  try { await host.crashAct(id, 'port'); assert.ok(h.port > 25567 && h.port <= 25865, 'port choisi : ' + h.port); assert.match(fs.readFileSync(path.join(sdir(id), 'server.properties'), 'utf8'), new RegExp('server-port=' + h.port)); } finally { blocker.close(); }
  await host.crashAct(id, 'lvold'); assert.strictEqual(fs.readFileSync(path.join(w, 'level.dat'), 'utf8'), 'sauvegarde'); assert.strictEqual(fs.readFileSync(path.join(w, 'level.dat.hydarium.bak'), 'utf8'), 'abime', 'l’ancien est gardé');
  fs.writeFileSync(path.join(w, 'datapacks', 'x.zip'), 'zip'); await host.crashAct(id, 'dprm', 'x.zip'); assert.ok(!fs.existsSync(path.join(w, 'datapacks', 'x.zip')));
  await assert.rejects(host.crashAct(id, 'dprm', '../server.properties'), /invalide/); await assert.rejects(host.crashAct(id, 'moddis', 'inconnu'), /introuvable/);
  await assert.rejects(host.crashAct(id, 'format-c', ''), /Action inconnue/); await assert.rejects(host.crashAct(id, 'jar'), /server\.jar|Service|fetch|Source|inconnue|Version/i, 'jar : réseau non disponible ici');
  await assert.rejects(host.crashAct('nexiste-pas', 'retry'), /Serveur introuvable/);
});

test('branchements : canaux, événement, bannière, fenêtre, relance après réparation', () => {
  const r = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), main = r('src/main/main.js'), app = r('src/renderer/app.js'), hostjs = r('src/main/host.js');
  for (const c of ['host:crash', 'host:crashclear', 'host:crashact']) assert.ok(r('src/preload.js').includes("'" + c + "'") && main.includes("on('" + c + "'"), c);
  assert.ok(r('src/preload.js').includes("'host:crashed'") && /send\('host:crashed', \{ id \}\)/.test(hostjs) && /hyd\.on\('host:crashed'/.test(app));
  assert.ok(/proc\.on\('close', c => \{[^\n]*crashCheck\(h, id, r, c, send\)/.test(hostjs) && /proc\.on\('error'[^\n]*crashCheck/.test(hostjs), 'diagnostic à la fermeture et à l’échec du lancement de Java');
  assert.ok(/r\.up = true/.test(hostjs) && /crashes\.delete\(id\); const r = \{ state: 'starting'/.test(hostjs));
  assert.ok(/hcBanner\(h, HC, on\)/.test(app) && /function hcrashModal/.test(app) && /await call\('host:crashact', c\.id, act, d\.v\); closeModal\(\);\s*await call\('host:start', c\.id\)/.test(app));
});
