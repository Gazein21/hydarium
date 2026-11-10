/* Accès Internet via playit.gg (démon playitd + API de playit) : clés, enveloppes, tunnels, requêtes, choix du fichier, empreinte obligatoire,
   et tout le déroulé (liaison du compte, adresse détectée, un tunnel par serveur, erreurs) avec une FAUSSE API et un FAUX démon : aucun réseau. */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), { EventEmitter } = require('events'), crypto = require('crypto');
const base = path.join(__dirname, '..', 'src', 'main'), data = fs.mkdtempSync(path.join(os.tmpdir(), 'hydpg-'));
const stub = (name, exp) => { const f = require.resolve(path.join(base, name)); require.cache[f] = { id: f, filename: f, loaded: true, exports: exp }; };
stub('platform.js', { dataDir: () => data }); stub('log.js', { info() {}, warn() {}, error() {} });
const P = require(path.join(base, 'playit.js'));
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }, eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, m, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (f()) { n++; return; } await sleep(8); } assert.fail('délai dépassé : ' + m); };

// 1) sortie du terminal nettoyée
eq(P.clean('\x1b[32mhello\x1b[0m\r\nworld\rx'), 'hello\nworld\nx', 'couleurs et retours chariot retirés');

// 2) clé de l'agent et fichier de clé (le démon accepte l'hexadécimal seul ou le TOML)
const KEY = crypto.randomBytes(32).toString('hex');
ok(P.validKey(KEY), 'clé hexadécimale valide'); for (const bad of ['', 'xyz', 'abc', 'a'.repeat(7), 'zz'.repeat(16), null]) ok(!P.validKey(bad), 'clé refusée : ' + bad);
eq(P.secretFileText(KEY), 'secret_key = "' + KEY + '"\n', 'fichier de clé au format du démon'); eq(P.readSecretText(P.secretFileText(KEY)), KEY, 'aller-retour TOML'); eq(P.readSecretText('  ' + KEY + '\n'), KEY, 'hexadécimal seul accepté'); eq(P.readSecretText('secret_key = "pas-hex"'), '', 'TOML invalide refusé');
let e2 = null; try { P.secretFileText('nope'); } catch (x) { e2 = x; } ok(e2, 'écrire une clé invalide est refusé');

// 3) code et lien de liaison (mêmes formats que l'agent officiel : 5 octets en hexadécimal)
const code = P.newClaimCode(); ok(/^[0-9a-f]{10}$/.test(code), 'code de liaison : 10 caractères hexadécimaux'); ok(code !== P.newClaimCode(), 'codes différents');
eq(P.claimUrl('abcdef0123'), 'https://playit.gg/claim/abcdef0123', 'lien de liaison'); for (const bad of ['', 'xyz', 'abcdef012', 'abcdef01234', '../x', 'ABCDEF0123']) eq(P.claimUrl(bad), '', 'lien refusé : ' + bad);

// 4) enveloppe de l'API et messages
eq(P.parseEnvelope(200, '{"status":"success","data":{"id":"x"}}'), { status: 'success', data: { id: 'x' } }, 'succès'); eq(P.parseEnvelope(200, '{"status":"fail","data":"NotAccepted"}'), { status: 'fail', data: 'NotAccepted' }, 'échec métier');
eq(P.parseEnvelope(502, '<html>').status, 'error', 'réponse illisible → erreur'); eq(P.parseEnvelope(200, '{"x":1}').status, 'error', 'enveloppe inattendue → erreur');
ok(/vérifié/.test(P.failText('RequiresVerifiedAccount')), 'compte non vérifié expliqué'); ok(/Premium/.test(P.failText('RequiresPlayitPremium')), 'Premium expliqué'); ok(/Relier un autre compte/.test(P.failText({ error: 'AgentNotFound' })), 'forme objet comprise');
ok(/Mystery/.test(P.failText('Mystery')) && !/undefined/.test(P.failText(undefined)), 'code inconnu : cité, jamais « undefined »');

// 5) tunnels de l'agent → liste et adresses par port
const tun = (id, name, addr, port, extra) => ({ id, internal_id: 1, name, display_address: addr, port_type: 'tcp', port_count: 1, tunnel_type: 'minecraft-java', tunnel_type_display: 'Minecraft Java', agent_config: { fields: [{ name: 'local_ip', value: '127.0.0.1' }, ...(port ? [{ name: 'local_port', value: String(port) }] : [])] }, disabled_reason: null, ...extra });
const AID = 'aaaaaaaa-0000-4000-8000-000000000001', rundata = (tunnels, pending = []) => ({ agent_id: AID, tunnels, pending, notices: [], permissions: {} });
const L = P.parseTunnels(rundata([tun('t1', 'Survie', 'Raven-Wolf.gl.at.ply.gg:41234', 25565), tun('t2', 'Créatif', 'moon.gl.at.ply.gg:5050', 25570), tun('t3', 'Sans port', 'x.gl.at.ply.gg:7777', 0), tun('t4', 'Java par défaut', 'play.joinmc.link', 0), tun('t5', 'Éteint', 'off.gl.at.ply.gg:1111', 25580, { disabled_reason: 'Disabled by user' }), tun('t6', 'Faux', '<b>x</b>', 25590), tun('t7', 'Bedrock', 'b.gl.at.ply.gg:19132', 19132, { tunnel_type: 'minecraft-bedrock' })], [{ id: 'p1', name: 'En cours', tunnel_type: 'minecraft-java', tunnel_type_display: 'Java', port_type: 'tcp', port_count: 1, status_msg: 'allocating' }]));
eq(L[0].address, 'raven-wolf.gl.at.ply.gg:41234', 'adresse normalisée en minuscules'); eq(L[0].localPort, 25565, 'port local lu dans local_port'); eq(L[2].localPort, 7777, 'sans local_port : port de l’adresse publique (comme l’agent)');
eq(L[3].localPort, 25565, 'Minecraft Java sans port nulle part : 25565'); eq(L[4].disabled, 'Disabled by user', 'tunnel désactivé signalé'); eq(L[5].address, '', 'adresse douteuse jamais reprise'); eq(L[7].pending, true, 'tunnel en préparation signalé');
eq(P.portMap(L), { 25565: 'raven-wolf.gl.at.ply.gg:41234', 25570: 'moon.gl.at.ply.gg:5050', 7777: 'x.gl.at.ply.gg:7777', }, 'un tunnel par port ; ni les désactivés, ni Bedrock, ni les adresses douteuses, ni les tunnels en préparation');
eq(P.portMap(P.parseTunnels(rundata([tun('a', 'A', 'one.ply.gg:11111', 25565), tun('b', 'B', 'two.ply.gg:22222', 25565)]))), { 25565: 'one.ply.gg:11111' }, 'deux tunnels sur le même port : le premier gagne'); eq(P.parseTunnels(null), [], 'rien du tout : liste vide'); eq(P.parseTunnels({ tunnels: [{}] })[0].localPort, 0, 'tunnel sans rien : pas de plantage');

// 6) corps des requêtes (formats de l'API officielle)
eq(P.createBody(AID, 25570, 'Créatif ✓'), { ports: { type: 'tunnel-type', details: 'minecraft-java' }, origin: { type: 'agent', data: { agent_id: AID, config: { fields: [{ name: 'local_ip', value: '127.0.0.1' }, { name: 'local_port', value: '25570' }] } } }, enabled: true, alloc: null, name: 'Creatif', firewall_id: null }, 'création : tunnel Minecraft Java vers 127.0.0.1:<port du serveur>, nom en ASCII');
eq(P.createBody(null, 25565, '').name, 'Hydarium 25565', 'nom par défaut'); ok(P.createBody(null, 1, 'x'.repeat(80)).name.length <= 32, 'nom limité à 32 caractères');
eq(P.configBody({ id: 't2', fields: [{ name: 'local_ip', value: '10.0.0.5' }, { name: 'local_port', value: '1' }, { name: 'proxy_protocol', value: 'none' }] }, 25570), { tunnel_id: 't2', new_agent_id: null, new_config: { fields: [{ name: 'local_ip', value: '127.0.0.1' }, { name: 'local_port', value: '25570' }, { name: 'proxy_protocol', value: 'none' }] } }, 'repointage : les autres réglages du tunnel sont conservés');

// 7) adresse collée à la main
eq(P.validAddress('  Raven-Wolf.gl.at.ply.gg:41234 '), 'raven-wolf.gl.at.ply.gg:41234', 'adresse valide normalisée'); eq(P.validAddress('203.0.113.7:25565'), '203.0.113.7:25565', 'IPv4'); eq(P.validAddress('play.joinmc.link'), 'play.joinmc.link', 'nom sans port');
for (const bad of ['', 'a b', 'http://x.ply.gg', 'x.ply.gg:99999', 'x.ply.gg:1', 'a'.repeat(120) + '.gg', 'javascript:alert(1)', '../etc']) eq(P.validAddress(bad), '', 'adresse refusée : ' + bad.slice(0, 20));

// 8) choix du fichier : le DÉMON (playitd), jamais le client interactif (noms réels de la version 1.2.0)
const A = names => names.map(x => ({ name: x, browser_download_url: 'https://github.com/playit-cloud/playit-agent/releases/download/v1/' + x }));
const real = A(['playit-cli-linux-amd64', 'playit-linux-amd64', 'playit-windows-x86-signed.exe', 'playit-windows-x86_64-signed.exe', 'playit-windows-x86_64.msi', 'playit-windows-x86_64.exe', 'playitd-tray-windows-x86_64-signed.exe', 'playitd-windows-x86-signed.exe', 'playitd-windows-x86_64-signed.exe', 'playitd-windows-x86_64.exe', 'playit_amd64.deb', 'playit_x86_64.rpm']);
eq(P.assetFor(real, 'win32', 'x64').name, 'playitd-windows-x86_64-signed.exe', 'Windows 64 bits : le démon signé (ni le client, ni le tray, ni .msi)');
eq(P.assetFor(A(['playitd-windows-x86_64.exe', 'playit-windows-x86_64-signed.exe']), 'win32', 'x64').name, 'playitd-windows-x86_64.exe', 'jamais le client interactif, même signé');
eq(P.assetFor(A(['playit-windows-x86_64-signed.exe']), 'win32', 'x64'), null, 'sans démon publié : rien (et pas le client)'); eq(P.assetFor(real, 'linux', 'x64'), null, 'Linux : aucun playitd autonome publié → null'); eq(P.assetFor(real, 'darwin', 'arm64'), null, 'macOS : null'); eq(P.assetFor([], 'win32', 'x64'), null, 'aucun fichier : null');
eq(P.digestOf({ digest: 'sha256:' + 'a'.repeat(64) }), 'a'.repeat(64), 'empreinte lue'); eq(P.digestOf({ digest: 'md5:abc' }), '', 'autre format refusé'); eq(P.digestOf({}), '', 'absente');

// 9) fausse API de playit + faux démon
const calls = [], script = {}, okR = d => ({ json: { status: 'success', data: d } }), failR = d => ({ json: { status: 'fail', data: d } }), errR = (d, http) => ({ json: { status: 'error', data: d }, http });
const nth = p => calls.filter(c => c.p === p).length;
const fakeFetch = async (url, o) => {
  const u = String(url); if (!u.startsWith('https://api.playit.gg')) throw new Error('hôte inattendu ' + u);
  const p = u.slice('https://api.playit.gg'.length), c = { p, body: JSON.parse(o.body), auth: (o.headers || {}).Authorization || '' }; calls.push(c);
  const h = script[p]; if (!h) throw new Error('route inattendue ' + p); const r = typeof h === 'function' ? h(c.body, nth(p)) : h; if (r instanceof Error) throw r;
  return { status: r.http || 200, text: async () => JSON.stringify(r.json) };
};
const fakeAgent = () => { const c = new EventEmitter(); c.stdout = new EventEmitter(); c.stderr = new EventEmitter(); c.killed = false; c.kill = () => { c.killed = true; }; return c; };
const secretFile = path.join(data, 'playit', 'playit.toml'), wipe = () => { fs.rmSync(path.join(data, 'playit'), { recursive: true, force: true }); calls.length = 0; for (const k of Object.keys(script)) delete script[k]; P._test.reset(); };
const OPT = { exe: '/x/playitd', args: [], pollMs: 12, fastMs: 8, claimMs: 5000 };
(async () => {
  P._test.setFetch(fakeFetch); const events = [], send = (k, v) => events.push(v.state);
  let agent = fakeAgent(), spawned = null; P._test.setSpawn((exe, args, o) => { spawned = { exe, args, o }; return agent; });

  // 9a) premier lancement : liaison du compte → clé rangée → démon → adresse détectée
  wipe(); script['/claim/setup'] = (b, k) => okR(k < 2 ? 'WaitingForUserVisit' : 'UserAccepted'); script['/claim/exchange'] = (b, k) => k < 2 ? failR('NotAccepted') : okR({ secret_key: KEY });
  script['/v1/agents/rundata'] = () => okR(rundata([tun('t1', 'Survie', 'raven.gl.at.ply.gg:41234', 25565)]));
  const st0 = P.start(send, OPT); eq(st0.state, 'claim', 'sans clé : étape « lier le compte »'); ok(/^https:\/\/playit\.gg\/claim\/[0-9a-f]{10}$/.test(st0.claimUrl), 'lien de liaison exposé : ' + st0.claimUrl);
  await until(() => P.status().state === 'running', 'compte lié, démon lancé, agent en marche');
  eq(calls[0].p, '/claim/setup', 'la liaison commence par /claim/setup'); eq(calls[0].body.agent_type, 'assignable', 'agent « assignable » comme le client officiel'); eq(calls[0].body.version, 'playit 1.2.0', 'version annoncée au format officiel'); eq(calls[0].body.code, st0.claimUrl.split('/').pop(), 'le code du lien est celui envoyé');
  eq(calls[0].auth, '', 'liaison sans authentification'); eq([nth('/claim/setup'), nth('/claim/exchange')], [2, 2], 'attend la validation : 1 « en attente » puis accepté, 1 échange refusé (« NotAccepted ») puis accepté');
  eq(fs.readFileSync(secretFile, 'utf8'), P.secretFileText(KEY), 'clé rangée dans le dossier d’Hydarium'); if (process.platform !== 'win32') eq(fs.statSync(secretFile).mode & 0o777, 0o600, 'fichier de clé réservé à l’utilisateur');
  eq(spawned.exe, '/x/playitd', 'démon lancé'); eq(spawned.args.slice(0, 2), ['--secret-path', secretFile], 'clé passée par FICHIER (jamais en clair dans la ligne de commande)'); ok(!spawned.args.includes(KEY), 'la clé n’apparaît pas dans les arguments'); eq(spawned.args[2], '--socket-path', 'tube de communication propre à Hydarium'); eq(spawned.args[4], '--log-path', 'journal du démon dans un fichier');
  eq(spawned.o.windowsHide, true, 'aucune fenêtre console');
  const rd = calls.find(c => c.p === '/v1/agents/rundata'); eq(rd.auth, 'Agent-Key ' + KEY, 'rundata authentifié par la clé de l’agent'); eq(P.status().tunnels, { 25565: 'raven.gl.at.ply.gg:41234' }, 'adresse détectée pour le port 25565 (plus aucune lecture de texte)');
  ok(events.includes('claim') && events.includes('running'), 'l’interface est prévenue à chaque étape'); eq(P.status().claimUrl, '', 'plus de lien à lier'); ok(P.status().hasAccount, 'compte lié');

  // 9b) un tunnel PAR serveur : création pour le port 25570, détection ensuite
  script['/v1/tunnels/create'] = b => okR({ id: 't9' }); let created = false; script['/v1/agents/rundata'] = () => okR(rundata([tun('t1', 'Survie', 'raven.gl.at.ply.gg:41234', 25565), ...(created ? [tun('t9', 'Creatif', 'new.gl.at.ply.gg:6000', 25570)] : [])]));
  const stc = await P.createTunnel(25570, 'Créatif', send); ok(stc.creating.includes(25570), 'création marquée en cours');
  const cr = calls.find(c => c.p === '/v1/tunnels/create'); eq(cr.auth, 'Agent-Key ' + KEY, 'création authentifiée'); eq(cr.body, P.createBody(AID, 25570, 'Créatif'), 'corps de création'); eq(cr.body.origin.data.agent_id, AID, 'tunnel rattaché à CET agent');
  let dup = null; try { await P.createTunnel(25570, 'x', send); } catch (x) { dup = x; } ok(dup && /déjà/.test(dup.message), 'pas de doublon pendant la création : ' + (dup && dup.message));
  let dup2 = null; try { await P.createTunnel(25565, 'x', send); } catch (x) { dup2 = x; } ok(dup2 && /raven\.gl\.at\.ply\.gg:41234/.test(dup2.message), 'un serveur qui a déjà un tunnel n’en reçoit pas un deuxième (adresse rappelée)');
  created = true; await until(() => P.status().tunnels[25570] === 'new.gl.at.ply.gg:6000', 'adresse du nouveau tunnel détectée'); eq(P.status().tunnels, { 25565: 'raven.gl.at.ply.gg:41234', 25570: 'new.gl.at.ply.gg:6000' }, 'deux serveurs, deux tunnels, deux adresses'); eq(P.status().creating, [], 'création terminée');
  let bad = null; try { await P.createTunnel(0, 'x', send); } catch (x) { bad = x; } ok(bad && /Port invalide/.test(bad.message), 'port invalide refusé'); bad = null; try { await P.createTunnel(70000, 'x', send); } catch (x) { bad = x; } ok(bad, 'port > 65535 refusé');

  // 9c) erreurs de création expliquées (compte non vérifié…)
  script['/v1/tunnels/create'] = () => failR('RequiresVerifiedAccount'); let ver = null; try { await P.createTunnel(25580, 'x', send); } catch (x) { ver = x; } ok(ver && /vérifié/.test(ver.message), 'compte non vérifié : message clair'); eq(P.status().creating, [], 'rien de coincé en « création en cours »');
  script['/v1/tunnels/create'] = () => new Error('ECONNRESET'); let net = null; try { await P.createTunnel(25580, 'x', send); } catch (x) { net = x; } ok(net && /Pas de réponse de playit/.test(net.message), 'réseau coupé : message clair'); eq(P.status().creating, [], 'rien de coincé non plus');

  // 9d) changer l'adresse d'un serveur = repointer un tunnel existant
  script['/v1/tunnels/config'] = () => okR(null); await P.assignTunnel('t9', 25565, send); const cf = calls.filter(c => c.p === '/v1/tunnels/config').pop();
  eq(cf.body.tunnel_id, 't9', 'bon tunnel'); eq(cf.body.new_config.fields.find(f => f.name === 'local_port').value, '25565', 'nouveau port local'); eq(cf.auth, 'Agent-Key ' + KEY, 'repointage authentifié');
  script['/v1/tunnels/config'] = () => failR('NothingToUpdate'); await P.assignTunnel('t9', 25565, send); ok(true, 'rien à changer : pas une erreur');
  let nf = null; try { await P.assignTunnel('inconnu', 25565, send); } catch (x) { nf = x; } ok(nf && /n’existe plus/.test(nf.message), 'tunnel inconnu refusé');
  script['/v1/tunnels/config'] = () => failR('TunnelNotFound'); let nf2 = null; try { await P.assignTunnel('t9', 25565, send); } catch (x) { nf2 = x; } ok(nf2 && /n’existe plus/.test(nf2.message), 'tunnel disparu côté playit : message clair');

  // 9e) coupure réseau passagère : l'agent reste « en marche », avec une note après plusieurs échecs
  script['/v1/agents/rundata'] = () => new Error('ETIMEDOUT'); await until(() => /impossible pour le moment/.test(P.status().note), 'note de coupure réseau'); eq(P.status().state, 'running', 'la coupure ne casse pas l’état'); eq(P.status().tunnels[25565], 'raven.gl.at.ply.gg:41234', 'dernières adresses connues conservées');
  script['/v1/agents/rundata'] = () => okR(rundata([tun('t1', 'Survie', 'raven.gl.at.ply.gg:41234', 25565)])); await until(() => P.status().note === '', 'la note disparaît au retour du réseau');

  // 9f) clé refusée par playit : erreur claire et démon arrêté
  script['/v1/agents/rundata'] = () => errR('Unauthorized', 401); await until(() => P.status().state === 'error', 'clé refusée → erreur'); ok(/Relier un autre compte/.test(P.status().error), 'indique quoi faire : ' + P.status().error); ok(agent.killed, 'démon arrêté');

  // 9g) arrêt, puis « Relier un autre compte » : la clé est oubliée
  P.stop(send); eq(P.status().state, 'off', 'arrêté'); ok(fs.existsSync(secretFile), 'arrêter garde la liaison'); P.resetAccount(send); ok(!fs.existsSync(secretFile), 'liaison oubliée'); ok(!P.status().hasAccount, 'plus de compte lié');

  // 9h) clé déjà là : aucune liaison demandée, tout de suite le démon
  wipe(); fs.mkdirSync(path.dirname(secretFile), { recursive: true }); fs.writeFileSync(secretFile, P.secretFileText(KEY)); script['/v1/agents/rundata'] = () => okR(rundata([])); agent = fakeAgent();
  eq(P.start(send, OPT).state, 'starting', 'clé présente : démarrage direct'); await until(() => P.status().state === 'running', 'en marche'); eq(nth('/claim/setup'), 0, 'aucune liaison redemandée'); eq(P.status().tunnels, {}, 'pas encore de tunnel'); P.stop(send); ok(agent.killed, 'démon tué à l’arrêt');

  // 9i) liaison refusée dans le navigateur, lien expiré
  wipe(); script['/claim/setup'] = () => okR('UserRejected'); P.start(send, OPT); await until(() => P.status().state === 'error', 'refus'); ok(/refusée/.test(P.status().error), 'refus expliqué'); ok(!fs.existsSync(secretFile), 'aucune clé rangée');
  wipe(); script['/claim/setup'] = () => failR('CodeExpired'); P.start(send, OPT); await until(() => P.status().state === 'error', 'expiré'); ok(/expiré/.test(P.status().error), 'expiration expliquée');
  wipe(); script['/claim/setup'] = () => okR('WaitingForUser'); P.start(send, { ...OPT, claimMs: 60 }); await until(() => P.status().state === 'error', 'jamais validé'); ok(/expiré sans être validé/.test(P.status().error), 'abandon après le délai');
  wipe(); script['/claim/setup'] = () => okR('UserAccepted'); script['/claim/exchange'] = () => okR({ secret_key: 'pas-une-cle' }); P.start(send, OPT); await until(() => P.status().state === 'error', 'clé absurde'); ok(/clé inattendue/.test(P.status().error), 'clé inattendue refusée'); ok(!fs.existsSync(secretFile), 'rien de rangé');
  wipe(); script['/claim/setup'] = () => okR('WaitingForUserVisit'); P.start(send, OPT); await sleep(40); P.stop(send); const n0 = nth('/claim/setup'); await sleep(60); eq(nth('/claim/setup'), n0, 'arrêter pendant la liaison coupe l’attente');

  // 9j) problèmes de démon
  const withKey = () => { wipe(); fs.mkdirSync(path.dirname(secretFile), { recursive: true }); fs.writeFileSync(secretFile, P.secretFileText(KEY)); script['/v1/agents/rundata'] = () => okR(rundata([])); };
  withKey(); agent = fakeAgent(); P.start(send, OPT); agent.stderr.emit('data', Buffer.from('playitd error: boom\n')); agent.emit('exit', 3); eq(P.status().state, 'error', 'sortie immédiate : erreur'); ok(/code 3/.test(P.status().error), 'code indiqué'); ok(P.status().lines.some(l => /boom/.test(l)), 'message du démon visible'); P.stop(send);
  withKey(); agent = fakeAgent(); P.start(send, OPT); agent.emit('error', new Error('spawn EACCES')); eq(P.status().state, 'error', 'impossible à lancer'); ok(/EACCES/.test(P.status().error), 'cause indiquée'); P.stop(send);
  withKey(); P._test.setSpawn(() => { throw new Error('boom'); }); P.start(send, OPT); await until(() => P.status().state === 'error', 'spawn qui lève une exception'); ok(/boom/.test(P.status().error), 'cause indiquée'); P.stop(send); P._test.setSpawn(() => agent);
  wipe(); eq(P.start(send, { ...OPT, exe: '' }).state, 'error', 'démon introuvable : erreur claire (pas de PATH ici)'); ok(/introuvable/.test(P.status().error), 'message'); P.stop(send);
  withKey(); let seen = null; agent = fakeAgent(); P._test.setSpawn((e, a) => { seen = a; return agent; }); P.start(send, { ...OPT, args: ['--extra', 'x'] }); eq(seen.slice(-2), ['--extra', 'x'], 'arguments supplémentaires transmis (après les nôtres)'); P.stop(send);
  withKey(); agent = fakeAgent(); P.start(send, OPT); const again = P.start(send, OPT); eq(again.state, 'starting', 'double clic sur « Activer » : un seul démon'); P.stop(send);
  wipe(); await P.createTunnel(25565, 'x', send).then(() => ok(false, 'devrait refuser'), e => ok(/Active d’abord/.test(e.message), 'création refusée si l’agent ne tourne pas'));

  // 10) recherche du démon installé par le joueur dans le PATH
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'hydbin-')); fs.writeFileSync(path.join(bin, process.platform === 'win32' ? 'playitd.exe' : 'playitd'), 'x'); const oldPath = process.env.PATH; process.env.PATH = bin;
  ok(P.findExe().startsWith(bin), 'démon du joueur trouvé dans le PATH'); fs.rmSync(path.join(bin, process.platform === 'win32' ? 'playitd.exe' : 'playitd')); fs.writeFileSync(path.join(bin, process.platform === 'win32' ? 'playit.exe' : 'playit'), 'x'); eq(P.findExe(), '', 'le client interactif `playit` n’est PAS pris pour le démon'); process.env.PATH = oldPath; fs.rmSync(bin, { recursive: true, force: true });

  // 11) installation : empreinte obligatoire
  const body = crypto.randomBytes(1.5e6), good = P.sha256(body), pl = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux', ar = process.arch === 'arm64' ? 'aarch64' : 'x86_64', aname = 'playitd-' + pl + '-' + ar + (process.platform === 'win32' ? '.exe' : '');
  const mk = (digest, url) => ({ ok: true, status: 200, json: async () => ({ tag_name: 'v9.1.2', assets: [{ name: aname, browser_download_url: url || 'https://github.com/playit-cloud/playit-agent/releases/download/v9.1.2/' + aname, digest }] }) });
  const route = rel => async u => String(u).includes('api.github.com') ? rel : { ok: true, status: 200, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) };
  const own = path.join(data, 'runtimes', 'playit'), target = path.join(own, process.platform === 'win32' ? 'playitd.exe' : 'playitd'), legacy = path.join(own, process.platform === 'win32' ? 'playit.exe' : 'playit');
  const fails = async (rel, re, m) => { P._test.setFetch(route(rel)); let e = null; try { await P.install(send); } catch (x) { e = x; } ok(e && re.test(e.message), m + ' : ' + (e && e.message)); ok(!fs.existsSync(target), m + ' : rien d’installé'); };
  await fails(mk('sha256:' + 'b'.repeat(64)), /empreinte/, 'empreinte différente'); await fails(mk(undefined), /empreinte/, 'empreinte absente');
  await fails(mk('sha256:' + good, 'https://evil.example/x'), /inattendue/, 'hôte de téléchargement inattendu'); await fails(mk('sha256:' + good, 'http://github.com/x'), /inattendue/, 'téléchargement non chiffré');
  P._test.setFetch(route({ ok: true, status: 200, json: async () => ({ tag_name: 'v9.1.2', assets: A(['playit-windows-x86_64-signed.exe', 'playit-linux-amd64']) }) })); let nod = null; try { await P.install(send); } catch (x) { nod = x; } ok(nod && /playitd/.test(nod.message), 'sans démon publié : message qui nomme playitd'); ok(!fs.existsSync(target), 'et rien d’installé');
  fs.mkdirSync(own, { recursive: true }); fs.writeFileSync(legacy, 'ancien client'); P._test.setFetch(route(mk('sha256:' + good))); await P.install(send);
  ok(fs.existsSync(target), 'empreinte correcte : installé'); eq(fs.readFileSync(target).length, body.length, 'contenu complet'); ok(P.status().installed, 'détecté comme installé'); ok(!fs.existsSync(legacy), 'l’ancien client interactif des versions précédentes est retiré'); eq(fs.readFileSync(path.join(own, 'version.txt'), 'utf8').trim(), '9.1.2', 'version du démon mémorisée');
  wipe(); fs.mkdirSync(path.dirname(secretFile), { recursive: true }); fs.writeFileSync(secretFile, P.secretFileText(KEY)); script['/v1/agents/rundata'] = () => okR(rundata([])); script['/claim/setup'] = () => okR('UserAccepted'); P._test.setFetch(fakeFetch); P._test.setSpawn(() => fakeAgent());
  wipe(); script['/claim/setup'] = () => okR('WaitingForUser'); P.start(send, { ...OPT, exe: target }); await sleep(30); eq(calls[0].body.version, 'playit 9.1.2', 'la version annoncée est celle du démon installé'); P.stop(send);

  // 12) vérification d'adresse
  let e8 = null; try { await P.check('pas une adresse !'); } catch (x) { e8 = x; } ok(e8 && /invalide/.test(e8.message), 'check : adresse invalide refusée');

  // 13) la carte de l'interface : tous les états s'affichent, rien de ce qui vient de playit ou de la personne n'est injecté tel quel
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8').replace(/\r\n/g, '\n'), m13 = src.match(/function pgCard[\s\S]*?\n}\n/); ok(m13, 'pgCard trouvée dans app.js');
  const esc = x => String(x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])), pgCard = new Function('esc', m13[0] + '\nreturn pgCard;')(esc);
  const h = { port: 25565, name: 'Mon <b>serveur</b>', state: 'running', playitAddress: '' }, G = o => ({ state: 'off', claimUrl: '', error: '', note: '', tunnels: {}, list: [], creating: [], lines: [], installed: true, installing: false, hasAccount: false, ...o });
  const has = (html, re, m) => ok(re.test(html), m + ' : ' + html.slice(0, 90)), hasnt = (html, re, m) => ok(!re.test(html), m);
  has(pgCard(h, null), /Indisponible/, 'statut absent'); has(pgCard(h, G({ installed: false })), /pginstall/, 'démon absent → installer'); has(pgCard(h, G({ installed: false })), /pgdl/, 'et page de téléchargement'); has(pgCard(h, G({ installing: true, installed: false })), /Téléchargement/, 'installation en cours');
  has(pgCard(h, G()), /pgstart/, 'à l’arrêt → activer'); has(pgCard(h, G({ state: 'starting' })), /Démarrage/, 'démarrage'); has(pgCard(h, G({ state: 'claim', claimUrl: 'https://playit.gg/claim/abcdef0123' })), /pgclaim/, 'liaison du compte');
  has(pgCard(h, G({ state: 'error', error: '<img src=x onerror=alert(1)>' })), /&lt;img/, 'erreur échappée'); hasnt(pgCard(h, G({ state: 'error', error: '<img src=x onerror=alert(1)>' })), /<img/, 'aucune balise injectée');
  has(pgCard(h, G({ state: 'error', error: 'x', hasAccount: true })), /pgreset/, 'erreur + compte lié → « Relier un autre compte »'); hasnt(pgCard(h, G({ state: 'error', error: 'x' })), /pgreset/, 'pas de compte → pas de bouton');
  // l'adresse est TOUJOURS saisissable, dans tous les états (c'était le blocage : le champ n'existait que « en marche »)
  for (const [nm, g] of [['démon absent', G({ installed: false })], ['à l’arrêt', G()], ['liaison', G({ state: 'claim', claimUrl: 'https://playit.gg/claim/abcdef0123' })], ['erreur', G({ state: 'error', error: 'x' })], ['en marche', G({ state: 'running' })]]) has(pgCard(h, g), /id="pgaddr"/, 'champ d’adresse présent : ' + nm);
  const run = pgCard(h, G({ state: 'running', tunnels: { 25565: 'moon.gl.at.ply.gg:5050' } })); has(run, /moon\.gl\.at\.ply\.gg:5050/, 'adresse détectée affichée'); has(run, /pgcopy/, 'bouton copier'); has(run, /pguse/, 'enregistrer proposé'); has(run, /pgcheck[^>]*data-v/, 'vérifier proposé'); hasnt(run, /pgnew/, 'serveur qui a déjà son tunnel : pas de « créer »'); has(run, /pgsite/, 'lien « Gérer mes tunnels »');
  has(pgCard({ ...h, state: 'stopped' }, G({ state: 'running', tunnels: { 25565: 'a.ply.gg:1' } })), /disabled title="Démarre le serveur/, 'vérifier grisé si le serveur est arrêté');
  const none = pgCard(h, G({ state: 'running' })); has(none, /Étape 2/, 'pas encore de tunnel → étape 2'); has(none, /data-a="pgnew" data-v="25565" data-n="Mon &lt;b&gt;serveur&lt;\/b&gt;"/, 'créer un tunnel POUR CE SERVEUR (port et nom, échappés)');
  has(pgCard(h, G({ state: 'running', creating: [25565] })), /Création du tunnel/, 'création en cours affichée'); hasnt(pgCard(h, G({ state: 'running', creating: [25565] })), /data-a="pgnew"/, 'pas de second clic pendant la création');
  const lst = [{ id: 't1', name: 'Survie', address: 'a.ply.gg:1', type: 'minecraft-java', localPort: 25570, pending: false, disabled: '' }, { id: 't2', name: '<i>x</i>', address: '', type: 'minecraft-java', localPort: 25580, pending: false, disabled: '' }, { id: 't3', name: 'Bedrock', address: 'b.ply.gg:2', type: 'minecraft-bedrock', localPort: 19132, pending: false, disabled: '' }];
  const pick = pgCard(h, G({ state: 'running', list: lst })); has(pick, /id="pgpick"/, 'choisir un tunnel existant'); has(pick, /Survie · a\.ply\.gg:1 → port 25570/, 'option lisible'); has(pick, /&lt;i&gt;x&lt;\/i&gt;/, 'nom de tunnel échappé'); hasnt(pick, /Bedrock/, 'les tunnels Bedrock ne sont pas proposés'); has(pick, /data-a="pgassign" data-v="25565"/, 'bouton lié au port de ce serveur');
  hasnt(pgCard(h, G({ state: 'running', list: [lst[0]].map(t => ({ ...t, localPort: 25565 })) })), /id="pgpick"/, 'son propre tunnel n’est pas proposé en choix');
  has(pgCard(h, G({ state: 'running', list: [{ id: 'd', name: 'D', address: 'd.ply.gg:3', type: 'minecraft-java', localPort: 25565, pending: false, disabled: 'Disabled <b>' }] })), /désactivé \(Disabled &lt;b&gt;\)/, 'tunnel désactivé signalé, échappé');
  has(pgCard(h, G({ state: 'running', list: [{ id: 'p', name: 'P', pending: true, localPort: 0, type: 'minecraft-java' }] })), /1 tunnel\(s\) en préparation/, 'tunnel en préparation signalé'); has(pgCard(h, G({ state: 'running', note: 'Connexion <x> impossible' })), /Connexion &lt;x&gt; impossible/, 'note réseau échappée');
  has(pgCard({ ...h, playitAddress: 'saved.ply.gg:9' }, G({ state: 'running' })), /value="saved\.ply\.gg:9"/, 'adresse enregistrée dans le champ'); has(pgCard({ ...h, playitAddress: 'saved.ply.gg:9' }, G()), /n’est pas lancé/, 'adresse enregistrée mais agent arrêté : prévenu');
  has(pgCard(h, G({ state: 'running', lines: ['<b>x</b>'] })), /&lt;b&gt;x&lt;\/b&gt;/, 'journal échappé');
  // la carte « Adresses » montre aussi l'adresse DÉTECTÉE (pas seulement celle enregistrée à la main)
  ok(/PG\.tunnels\[h\.port\]\) \|\| h\.playitAddress \? '· Internet \(playit\.gg\)/.test(src), 'la carte Adresses affiche l’adresse détectée');
  for (const act of ['pgnew', 'pgassign', 'pgreset', 'pgresetgo', 'pgdl', 'pgsite', 'pgclaim', 'pgstart', 'pgstop', 'pginstall', 'pgcopy', 'pguse', 'pgsave', 'pgcheck']) ok(new RegExp('\\b' + act + ':').test(src), 'action définie dans l’interface : ' + act);

  fs.rmSync(data, { recursive: true, force: true });
  console.log('playit.test.js : ' + n + ' contrôles OK'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
