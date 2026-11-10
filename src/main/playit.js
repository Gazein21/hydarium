/* Accès Internet gratuit pour un serveur local via playit.gg, avec l'agent OFFICIEL (https://github.com/playit-cloud/playit-agent, licence BSD-2).

   POURQUOI CE MODULE A ÉTÉ REFAIT (0.10.51) : depuis la série 1.x, l'agent est un DÉMON (`playitd`) piloté par un client. Il n'écrit plus rien d'exploitable sur sa sortie :
   l'ancienne lecture de texte (« xxx.ply.gg:123 => 127.0.0.1:25565 ») ne pouvait donc plus jamais afficher l'adresse, et le client interactif `playit` (qu'on téléchargeait
   par erreur) ne sait pas travailler avec des tubes. On fait donc comme les clients officiels : on parle à l'API de playit (api.playit.gg).
     1. Liaison du compte : code de 10 caractères hexadécimaux → lien https://playit.gg/claim/<code> → /claim/setup (attente de la validation dans le navigateur) → /claim/exchange
        = clé secrète de l'agent. Elle est rangée dans le dossier de données d'Hydarium (playit/playit.toml) ; elle ne va jamais ailleurs que chez playit.
     2. Le démon `playitd` est lancé avec --secret-path (clé donnée par Hydarium, aucun service Windows installé, rien d'écrit hors du dossier d'Hydarium).
     3. /v1/agents/rundata (toutes les ~4 s) donne les tunnels de l'agent et leur adresse publique : c'est la source de l'adresse affichée.
     4. /v1/tunnels/create crée un tunnel PAR SERVEUR (port local de ce serveur) ; /v1/tunnels/config repointe un tunnel existant vers un autre port.
   Formats lus dans le code source officiel (packages/api_client/src/api.rs, agent_core/src/network/origin_lookup.rs) : un tunnel indique sa cible par deux champs, local_ip et local_port.
   Les fonctions pures (clés, enveloppes, tunnels, corps de requêtes, choix du fichier, adresses) sont testées ; l'échange réel avec api.playit.gg n'a PAS pu être essayé sans compte
   (voir la fiche de reprise) : l'état de l'agent et son journal restent donc toujours visibles dans l'interface. */
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), crypto = require('crypto');
const plat = require('./platform'), log = require('./log');

const REPO_API = 'https://api.github.com/repos/playit-cloud/playit-agent/releases/latest';
const API_BASE = 'https://api.playit.gg';
const UA = { 'User-Agent': 'Hydarium', Accept: 'application/vnd.github+json' };
exports.DASHBOARD = 'https://playit.gg/account/tunnels';
exports.DOWNLOAD = 'https://playit.gg/download';

/* ---------- petits outils purs ---------- */
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
exports.clean = s => String(s || '').replace(ANSI, '').replace(/\r\n?/g, '\n');
exports.newClaimCode = () => crypto.randomBytes(5).toString('hex');
exports.claimUrl = code => /^[0-9a-f]{10}$/.test(String(code)) ? 'https://playit.gg/claim/' + code : '';
exports.validKey = k => /^(?:[0-9a-f]{2}){8,128}$/i.test(String(k || '').trim());
exports.secretFileText = key => { if (!exports.validKey(key)) throw new Error('Clé invalide.'); return 'secret_key = "' + String(key).trim() + '"\n'; };
exports.readSecretText = text => { const t = String(text || '').trim(); if (exports.validKey(t)) return t; const m = t.match(/^secret_key\s*=\s*"([0-9a-fA-F]+)"\s*$/m); return m && exports.validKey(m[1]) ? m[1] : ''; };
/* adresse collée à la main : nom ou IPv4, port facultatif */
exports.validAddress = a => { a = String(a || '').trim().toLowerCase(); if (a.length > 100) return ''; const m = a.match(/^((?:[a-z0-9-]+\.)+[a-z]{2,}|\d{1,3}(?:\.\d{1,3}){3})(?::(\d{2,5}))?$/); if (!m) return ''; if (m[2] && (+m[2] < 1 || +m[2] > 65535)) return ''; return a; };

/* enveloppe de l'API : { status: 'success' | 'fail' | 'error', data } */
exports.parseEnvelope = (httpStatus, text) => {
  let j; try { j = JSON.parse(text); } catch (e) { return { status: 'error', data: 'réponse illisible (HTTP ' + httpStatus + ')' }; }
  return j && typeof j.status === 'string' ? { status: j.status, data: j.data } : { status: 'error', data: 'réponse inattendue (HTTP ' + httpStatus + ')' };
};
const FAIL = { // ce que playit répond → ce que voit la personne
  RequiresVerifiedAccount: 'Ton compte playit doit être vérifié (e-mail) avant de créer un tunnel : fais-le sur playit.gg puis réessaie.',
  RequiresPlayitPremium: 'Cette option demande playit Premium.', PublicPortRequiresPlayitPremium: 'Choisir le port public demande playit Premium.', RegionRequiresPlayitPremium: 'Cette région demande playit Premium.',
  AgentNotFound: 'Cet agent n’est plus lié à ton compte : utilise « Relier un autre compte » pour le relier à nouveau.', InvalidAgentId: 'Agent inconnu : relie-le à nouveau à ton compte.',
  AgentVersionTooOld: 'L’agent playit est trop ancien : réinstalle-le.', AgentVersionUnknown: 'playit ne reconnaît pas la version de l’agent : réinstalle-le.',
  TunnelNameIsNotAscii: 'Le nom du tunnel ne doit contenir que des caractères simples.', TunnelNameTooLong: 'Le nom du tunnel est trop long.',
  InvalidTunnelConfig: 'playit a refusé la configuration de ce tunnel.', TunnelNotFound: 'Ce tunnel n’existe plus : actualise la liste.', InvalidPortCount: 'playit a refusé le nombre de ports.',
  CodeExpired: 'Le lien de liaison a expiré : recommence.', CodeNotFound: 'Le lien de liaison est inconnu de playit : recommence.', InvalidCode: 'Le code de liaison est invalide : recommence.', UserRejected: 'La liaison a été refusée dans le navigateur.',
  SelfManagedAgentCannotReassignTunnel: 'Cet agent ne peut pas reprendre un tunnel d’un autre agent.', ConfigNotCompatibleWithAgent: 'Ce tunnel n’est pas compatible avec cet agent.'
};
const codeOf = d => typeof d === 'string' ? d : (d && typeof d === 'object' ? String(d.error || d.type || d.code || Object.keys(d)[0] || '') : '');
exports.failText = d => { const c = codeOf(d); return FAIL[c] || 'playit.gg a refusé la demande' + (c ? ' (' + c.slice(0, 60) + ')' : '') + '.'; };
const apiErr = (message, extra) => Object.assign(new Error(message), extra || {});

/* tunnels de l'agent → liste simple. Le port local vient du champ local_port ; à défaut du port de l'adresse publique (comme l'agent) ; à défaut 25565 pour Minecraft Java. */
exports.parseTunnels = rd => {
  const list = [];
  for (const t of (rd && Array.isArray(rd.tunnels) ? rd.tunnels : [])) {
    const f = {}; for (const a of (t && t.agent_config && Array.isArray(t.agent_config.fields) ? t.agent_config.fields : [])) if (a && typeof a.name === 'string') f[a.name] = String(a.value == null ? '' : a.value);
    const raw = String(t.display_address || '').trim().toLowerCase(); let lp = +f.local_port || 0;
    if (!(lp >= 1 && lp <= 65535)) { const m = raw.match(/:(\d{1,5})$/); lp = m && +m[1] >= 1 && +m[1] <= 65535 ? +m[1] : 0; }
    if (!lp && t.tunnel_type === 'minecraft-java') lp = 25565;
    list.push({ id: String(t.id || ''), name: String(t.name || '').slice(0, 60), address: exports.validAddress(raw), type: t.tunnel_type ? String(t.tunnel_type) : '', typeLabel: String(t.tunnel_type_display || '').slice(0, 40), localPort: lp, localIp: f.local_ip || '127.0.0.1', disabled: t.disabled_reason ? String(t.disabled_reason).slice(0, 80) : '', pending: false, fields: Object.entries(f).map(([name, value]) => ({ name, value })) });
  }
  for (const p of (rd && Array.isArray(rd.pending) ? rd.pending : [])) list.push({ id: String(p.id || ''), name: String(p.name || '').slice(0, 60), address: '', type: p.tunnel_type ? String(p.tunnel_type) : '', typeLabel: String(p.tunnel_type_display || '').slice(0, 40), localPort: 0, localIp: '127.0.0.1', disabled: '', pending: true, status: String(p.status_msg || '').slice(0, 80), fields: [] });
  return list;
};
exports.portMap = list => { const m = {}; for (const t of list) if (!t.pending && !t.disabled && t.address && t.localPort && !m[t.localPort] && (t.type === 'minecraft-java' || !t.type)) m[t.localPort] = t.address; return m; };
const tunnelName = (name, port) => String(name || '').normalize('NFD').replace(/[^\x20-\x7e]/g, '').replace(/[^A-Za-z0-9 _.-]/g, '').trim().slice(0, 32) || 'Hydarium ' + port;
exports.createBody = (agentId, port, name) => ({ ports: { type: 'tunnel-type', details: 'minecraft-java' }, origin: { type: 'agent', data: { agent_id: agentId || null, config: { fields: [{ name: 'local_ip', value: '127.0.0.1' }, { name: 'local_port', value: String(port) }] } } }, enabled: true, alloc: null, name: tunnelName(name, port), firewall_id: null });
exports.configBody = (tunnel, port) => ({ tunnel_id: tunnel.id, new_agent_id: null, new_config: { fields: [{ name: 'local_ip', value: '127.0.0.1' }, { name: 'local_port', value: String(port) }, ...(tunnel.fields || []).filter(f => f.name !== 'local_ip' && f.name !== 'local_port')] } });

/* ---------- choix du fichier à télécharger (pur) : le DÉMON playitd, jamais le client interactif `playit` ---------- */
exports.assetFor = (assets, platform, arch) => {
  const bad = /\.(msi|zip|tar|gz|deb|rpm|apk|pkg|dmg|sig|sha\d*|txt|json|asc|pem)$/i, a64 = /(x86_64|amd64|x64)/i, arm = /(aarch64|arm64)/i, key = platform === 'win32' ? /windows/i : platform === 'darwin' ? /darwin|macos/i : /linux/i;
  const list = (assets || []).filter(x => x && x.name && x.browser_download_url && /^playitd-/i.test(x.name) && key.test(x.name) && !bad.test(x.name) && !/tray/i.test(x.name) && (platform !== 'win32' || /\.exe$/i.test(x.name)));
  const score = x => { let s = 0; const wantArm = arch === 'arm64'; if (wantArm ? arm.test(x.name) : a64.test(x.name)) s += 4; else if (!wantArm && /x86/i.test(x.name)) s += 2; if (!wantArm && arm.test(x.name)) s -= 5; if (/signed/i.test(x.name)) s += 1; return s; };
  return list.sort((p, q) => score(q) - score(p))[0] || null;
};
exports.digestOf = asset => { const m = String((asset && asset.digest) || '').match(/^sha256:([0-9a-f]{64})$/i); return m ? m[1].toLowerCase() : ''; };
exports.sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');

/* ---------- fichiers ---------- */
const exeName = () => process.platform === 'win32' ? 'playitd.exe' : 'playitd';
const dirOwn = () => path.join(plat.dataDir(), 'runtimes', 'playit');
const dirData = () => path.join(plat.dataDir(), 'playit');
const secretPath = () => path.join(dirData(), 'playit.toml');
const exists = p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } };
/* 1) le démon téléchargé par Hydarium, 2) un `playitd` installé par le joueur (PATH) */
exports.findExe = () => {
  const own = path.join(dirOwn(), exeName()); if (exists(own)) return own;
  for (const d of String(process.env.PATH || '').split(path.delimiter)) { if (!d) continue; const p = path.join(d, exeName()); if (exists(p)) return p; }
  return '';
};
const agentVersion = () => { try { const v = fs.readFileSync(path.join(dirOwn(), 'version.txt'), 'utf8').trim(); if (/^\d+\.\d+\.\d+$/.test(v)) return v; } catch (e) {} return '1.2.0'; };
const readKey = f => { try { return exports.readSecretText(fs.readFileSync(f, 'utf8')); } catch (e) { return ''; } };
const hasAccount = () => !!readKey(secretPath());

/* ---------- état ---------- */
let spawnFn = (...a) => cp.spawn(...a), fetchFn = (...a) => fetch(...a);
const fresh = () => ({ state: 'off', claimUrl: '', error: '', note: '', agentId: '', list: [], tunnels: {}, creating: {}, lines: [], exe: '', installing: false });
let S = fresh(), child = null, KEY = '', gen = 0, pollT = null, fastUntil = 0, cur = null, lastSent = '', fails = 0, logFile = '';
const pub = () => ({ state: S.state, claimUrl: S.claimUrl, error: S.error, note: S.note, tunnels: { ...S.tunnels }, list: S.list.map(t => ({ id: t.id, name: t.name, address: t.address, type: t.type, typeLabel: t.typeLabel, localPort: t.localPort, disabled: t.disabled, pending: t.pending, status: t.status || '' })), creating: Object.keys(S.creating).map(Number), lines: S.lines.slice(-30), installed: !!exports.findExe(), installing: S.installing, hasAccount: hasAccount() });
exports.status = pub;
const emit = (send, force) => { try { const p = pub(), j = JSON.stringify(p); if (!force && j === lastSent) return; lastSent = j; send && send('playit:state', p); } catch (e) {} };
const stopNow = () => { clearTimeout(pollT); pollT = null; cur = null; if (child) { const c = child; child = null; try { c.removeAllListeners(); c.stdout && c.stdout.removeAllListeners(); c.stderr && c.stderr.removeAllListeners(); c.kill(); } catch (e) {} } };
exports._test = { setSpawn: f => { spawnFn = f; }, setFetch: f => { fetchFn = f; }, reset: () => { gen++; stopNow(); S = fresh(); KEY = ''; lastSent = ''; fails = 0; } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- appel de l'API ---------- */
async function callApi(p, body, key) {
  let res, text;
  try {
    res = await fetchFn(API_BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'Hydarium', ...(key ? { Authorization: 'Agent-Key ' + key } : {}) }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(15000) });
    text = await res.text();
  } catch (e) { throw apiErr('Pas de réponse de playit.gg (' + String(e && e.message || e).slice(0, 80) + ').', { net: true }); }
  if (res.status === 429) throw apiErr('playit.gg demande de ralentir : nouvel essai dans un instant.', { net: true });
  const env = exports.parseEnvelope(res.status, text);
  if (env.status === 'success') return env.data;
  if (env.status === 'fail') throw apiErr(exports.failText(env.data), { code: codeOf(env.data) });
  const auth = res.status === 401 || res.status === 403 || /auth|unauthor|agent.?key|secret|forbidden/i.test(JSON.stringify(env.data || ''));
  throw apiErr(auth ? 'playit.gg ne reconnaît plus cette liaison.' : 'playit.gg a signalé une erreur : ' + String(typeof env.data === 'string' ? env.data : JSON.stringify(env.data || '')).slice(0, 100), { auth, net: !auth && res.status >= 500 });
}

/* ---------- liaison du compte ---------- */
async function claimFlow(my, send, opts) {
  const code = exports.newClaimCode(), ver = 'playit ' + (opts.agentVersion || agentVersion()), wait = opts.pollMs || 2000, t0 = Date.now(), limit = opts.claimMs || 15 * 60e3;
  S.state = 'claim'; S.claimUrl = exports.claimUrl(code); emit(send);
  const retry = e => e.net || e.code === 'NotAccepted' || e.code === 'NotSetup';
  for (;;) { // 1) en attente de la validation dans le navigateur
    if (my !== gen) return ''; if (Date.now() - t0 > limit) throw new Error('Le lien de liaison a expiré sans être validé : recommence.');
    try { const st = await callApi('/claim/setup', { code, agent_type: 'assignable', version: ver }, ''); if (st === 'UserAccepted') break; if (st === 'UserRejected') throw new Error(FAIL.UserRejected); }
    catch (e) { if (!retry(e)) throw e; }
    await sleep(wait);
  }
  for (;;) { // 2) on échange le code contre la clé de l'agent
    if (my !== gen) return '';
    try { const r = await callApi('/claim/exchange', { code }, ''); const k = String(r && r.secret_key || '').trim(); if (!exports.validKey(k)) throw new Error('playit a renvoyé une clé inattendue.'); return k; }
    catch (e) { if (!retry(e)) throw e; }
    await sleep(wait);
  }
}

/* ---------- le démon et le sondage ---------- */
exports.start = (send, opts = {}) => {
  if (S.state !== 'off' && S.state !== 'error') return pub();
  const exe = opts.exe || exports.findExe(); if (!exe) { S.state = 'error'; S.error = 'Le démon playit est introuvable : installe-le d’abord.'; emit(send); return pub(); }
  const my = ++gen; stopNow(); S = { ...fresh(), state: 'starting', exe }; fails = 0; emit(send, true);
  run(my, exe, send, opts).catch(e => { if (my !== gen) return; stopNow(); S.state = 'error'; S.error = String(e && e.message || e); log.warn('playit', S.error); emit(send); });
  return pub();
};
async function run(my, exe, send, opts) {
  const secretFile = opts.secretFile || secretPath(); KEY = readKey(secretFile);
  if (!KEY) { KEY = await claimFlow(my, send, opts); if (my !== gen || !KEY) return; fs.mkdirSync(path.dirname(secretFile), { recursive: true }); fs.writeFileSync(secretFile, exports.secretFileText(KEY), { mode: 0o600 }); S.claimUrl = ''; S.state = 'starting'; emit(send); }
  logFile = path.join(path.dirname(secretFile), 'playitd.log'); try { fs.rmSync(logFile, { force: true }); } catch (e) {}
  /* la ligne de commande peut recevoir des arguments en plus (settings.playitArgs) si une version future l'exige */
  let extra = opts.args; if (!extra) { extra = []; try { const a = require('./store').get().settings.playitArgs; if (Array.isArray(a) && a.length <= 8 && a.every(x => typeof x === 'string' && x.length < 100)) extra = a.slice(); } catch (e) {} }
  const sock = process.platform === 'win32' ? '\\\\.\\pipe\\hydarium-playitd-' + process.pid : path.join(os.tmpdir(), 'hydarium-playitd-' + process.pid + '.sock');
  let c; try { c = spawnFn(exe, ['--secret-path', secretFile, '--socket-path', sock, '--log-path', logFile, ...extra], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, NO_COLOR: '1', TERM: 'dumb' } }); }
  catch (e) { throw new Error('Impossible de lancer le démon : ' + e.message); }
  child = c; const t0 = Date.now();
  const feed = d => { for (const l of exports.clean(d.toString('utf8')).split('\n')) { const t = l.trim(); if (t) { S.lines.push(t.slice(0, 300)); if (S.lines.length > 200) S.lines.shift(); } } emit(send); };
  c.stdout && c.stdout.on('data', feed); c.stderr && c.stderr.on('data', feed);
  c.on('error', e => { if (child !== c) return; child = null; clearTimeout(pollT); S.state = 'error'; S.error = 'Le démon n’a pas démarré : ' + e.message; log.warn('playit', e.message); emit(send); });
  c.on('exit', code => { if (child !== c) return; child = null; clearTimeout(pollT); S.tunnels = {}; S.state = 'error'; S.error = code && Date.now() - t0 < 20000 ? 'Le démon playit s’est arrêté tout de suite (code ' + code + '). Vois son journal ci-dessous.' : 'Le démon playit s’est arrêté.'; readLog(); emit(send); });
  cur = { my, send, opts }; schedule(300);
}
function schedule(ms) { if (!cur) return; clearTimeout(pollT); pollT = setTimeout(tick, ms); }
function readLog() { // le démon écrit son journal dans un fichier : on en montre la fin (sans doublon avec ce qu'il aurait écrit sur la sortie)
  try { const st = fs.statSync(logFile), fd = fs.openSync(logFile, 'r'), len = Math.min(st.size, 6000), b = Buffer.alloc(len); fs.readSync(fd, b, 0, len, st.size - len); fs.closeSync(fd);
    const ls = exports.clean(b.toString('utf8')).split('\n').map(l => l.trim()).filter(Boolean).slice(-30).map(l => l.slice(0, 300)); if (ls.length) S.lines = ls; } catch (e) {}
}
async function tick() {
  if (!cur || !child) return; const { my, send, opts } = cur;
  try {
    const rd = await callApi('/v1/agents/rundata', {}, KEY); if (my !== gen) return;
    S.agentId = String(rd && rd.agent_id || ''); S.list = exports.parseTunnels(rd); S.tunnels = exports.portMap(S.list); fails = 0; S.note = ''; if (S.state === 'starting') S.state = 'running';
    for (const p of Object.keys(S.creating)) if (S.tunnels[p] || Date.now() - S.creating[p] > 120000) delete S.creating[p];
  } catch (e) {
    if (my !== gen) return;
    if (e.auth) { stopNow(); S.state = 'error'; S.error = 'playit ne reconnaît plus la liaison de ce compte : utilise « Relier un autre compte ».'; emit(send); return; }
    fails++; if (fails >= 3) S.note = 'Connexion à playit.gg impossible pour le moment : ' + e.message;
  }
  readLog(); emit(send);
  if (cur && cur.my === my && child) schedule(Date.now() < fastUntil ? (opts.fastMs || 1500) : (opts.pollMs || 4000));
}
exports.stop = send => { gen++; stopNow(); const was = S.state, exe = S.exe; S = { ...fresh(), exe }; KEY = ''; fails = 0; if (was !== 'off') emit(send, true); return pub(); };
/* délie ce PC du compte playit (efface la clé) : au prochain « Activer », un nouveau lien de liaison est proposé */
exports.resetAccount = send => { exports.stop(send); try { fs.rmSync(secretPath(), { force: true }); } catch (e) {} emit(send, true); return pub(); };

/* ---------- tunnels ---------- */
const needRunning = () => { if (S.state !== 'running' || !KEY) throw new Error('Active d’abord l’accès playit.gg (le démon doit tourner).'); };
const validPort = p => Number.isInteger(+p) && +p >= 1 && +p <= 65535;
/* crée un tunnel Minecraft Java dédié au serveur qui écoute sur ce port local */
exports.createTunnel = async (port, name, send) => {
  needRunning(); port = +port; if (!validPort(port)) throw new Error('Port invalide.');
  if (S.tunnels[port]) throw new Error('Ce serveur a déjà un tunnel : ' + S.tunnels[port]);
  if (S.creating[port]) throw new Error('Création déjà en cours.');
  S.creating[port] = Date.now(); emit(send);
  try { await callApi('/v1/tunnels/create', exports.createBody(S.agentId, port, name), KEY); }
  catch (e) { delete S.creating[port]; emit(send); throw e; }
  fastUntil = Date.now() + 30000; schedule(300); return pub();
};
/* repointe un tunnel existant vers le port de ce serveur (il cesse alors de mener à son ancien port) */
exports.assignTunnel = async (tunnelId, port, send) => {
  needRunning(); port = +port; if (!validPort(port)) throw new Error('Port invalide.');
  const t = S.list.find(x => x.id === String(tunnelId) && !x.pending); if (!t) throw new Error('Ce tunnel n’existe plus : la liste a été actualisée.');
  try { await callApi('/v1/tunnels/config', exports.configBody(t, port), KEY); }
  catch (e) { if (e.code !== 'NothingToUpdate') throw e; }
  fastUntil = Date.now() + 20000; schedule(300); emit(send); return pub();
};

/* ---------- installation : GitHub officiel, empreinte obligatoire ---------- */
exports.install = async send => {
  if (S.installing) throw new Error('Téléchargement déjà en cours.');
  S.installing = true; emit(send, true);
  try {
    const rel = await fetchFn(REPO_API, { headers: UA, signal: AbortSignal.timeout(20000) }); if (!rel.ok) throw new Error('GitHub a répondu ' + rel.status);
    const j = await rel.json(), asset = exports.assetFor(j.assets, process.platform, process.arch);
    if (!asset) throw new Error('Aucun démon playit (playitd) publié pour ce système dans la dernière version : installe playit depuis ' + exports.DOWNLOAD + ' (le fichier playitd doit être dans le PATH).');
    const digest = exports.digestOf(asset); if (!digest) throw new Error('La version publiée n’indique pas d’empreinte de contrôle : par sécurité Hydarium ne l’installe pas. Télécharge playit sur ' + exports.DOWNLOAD + '.');
    const url = new URL(asset.browser_download_url); if (url.protocol !== 'https:' || !/(^|\.)github(usercontent)?\.com$/.test(url.hostname)) throw new Error('Adresse de téléchargement inattendue.');
    const r = await fetchFn(url.href, { headers: { 'User-Agent': 'Hydarium' }, redirect: 'follow', signal: AbortSignal.timeout(300000) }); if (!r.ok) throw new Error('Téléchargement refusé (' + r.status + ').');
    const data = Buffer.from(await r.arrayBuffer());
    if (data.length < 1e6) throw new Error('Fichier téléchargé trop petit : abandon.');
    if (exports.sha256(data) !== digest) throw new Error('L’empreinte du fichier téléchargé ne correspond pas : il n’est pas installé.');
    fs.mkdirSync(dirOwn(), { recursive: true }); const dst = path.join(dirOwn(), exeName()), tmp = dst + '.part';
    fs.writeFileSync(tmp, data, { mode: 0o755 }); fs.renameSync(tmp, dst); try { fs.chmodSync(dst, 0o755); } catch (e) {}
    const v = String(j.tag_name || '').replace(/^v/, ''); if (/^\d+\.\d+\.\d+$/.test(v)) try { fs.writeFileSync(path.join(dirOwn(), 'version.txt'), v + '\n'); } catch (e) {}
    try { fs.rmSync(path.join(dirOwn(), process.platform === 'win32' ? 'playit.exe' : 'playit'), { force: true }); } catch (e) {} // l'ancien client interactif téléchargé par les versions précédentes ne sert à rien
    log.info('Démon playit installé', j.tag_name || '', dst);
    return pub();
  } finally { S.installing = false; emit(send, true); }
};

/* ---------- vérification : l'adresse répond-elle vraiment depuis Internet ? ---------- */
exports.check = async addr => {
  const a = exports.validAddress(addr); if (!a) throw new Error('Adresse invalide.');
  try { const r = await require('./slp').ping(a.includes(':') ? a : a + ':25565', 8000); return { ok: true, version: (r && r.json && r.json.version && r.json.version.name) || '' }; }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
};
