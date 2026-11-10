/* Invitations privées en pair-à-pair (P2P) : jouer sur le serveur d'un ami SANS ouvrir de port sur la box et SANS relais.
   Transport : HyperDHT (https://github.com/holepunchto/hyperdht, MIT). Les deux PC se trouvent grâce au réseau public HyperDHT puis se parlent en direct
   (UDP, percement de NAT), dans un canal chiffré (Noise). Hydarium ne fait tourner aucun serveur.

   Sécurité :
   - le CODE d'invitation (120 bits au hasard) est un secret partagé. Il sert à dériver (1) la clé de l'hôte, que les amis retrouvent, et (2) une clé de preuve.
     Retrouver la clé de l'hôte ne suffit PAS à entrer : l'hôte envoie un défi aléatoire et n'ouvre la porte que si l'invité répond avec la bonne preuve (HMAC-SHA256
     liée aux deux clés de la connexion). Sans le code, la connexion est coupée avant que le moindre octet n'atteigne le serveur Minecraft.
   - le visiteur ne choisit JAMAIS la destination : l'hôte relaie uniquement vers 127.0.0.1:<port de CE serveur>.
   - plafonds : 12 invités à la fois par serveur, 8 vérifications en attente, 6 s pour répondre au défi.
   - changer le code (« Nouveau code ») invalide aussitôt l'ancien : l'ancienne clé de l'hôte n'existe plus sur le réseau.

   Limites assumées : pas de relais de secours (certains réseaux 4G/5G ou CG-NAT empêchent la connexion directe) ; en connexion directe, l'adresse IP de l'hôte est visible
   par ceux qui rejoignent (et inversement) ; tous les joueurs doivent avoir Hydarium (l'invité se connecte à un port LOCAL, 127.0.0.1, ouvert par son Hydarium).
   Le module HyperDHT n'est chargé qu'à la première utilisation (module natif). */
const net = require('net'), crypto = require('crypto');
const log = require('./log');

const NAME = 'hydarium-p2p-v1';
const MAX_PEERS = 12, MAX_PENDING = 8, AUTH_MS = 6000, CONNECT_MS = 25000, TEST_MS = 12000, BOOT_MS = 20000, IDLE_MS = 15 * 60e3;

/* ---------- code d'invitation (pur, testé) : HYD-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX, alphabet de Crockford sans I, L, O, U ---------- */
const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const enc = buf => { let bits = 0, v = 0, out = ''; for (const b of buf) { v = (v << 8) | b; bits += 8; while (bits >= 5) { out += ALPHA[(v >>> (bits - 5)) & 31]; bits -= 5; } v &= (1 << bits) - 1; } if (bits) out += ALPHA[(v << (5 - bits)) & 31]; return out; };
const dec = s => { let bits = 0, v = 0; const out = []; for (const c of s) { const i = ALPHA.indexOf(c); if (i < 0) return null; v = (v << 5) | i; bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } v &= (1 << bits) - 1; } return Buffer.from(out); };
exports.formatCode = secret => 'HYD-' + enc(secret).match(/.{4}/g).join('-');
exports.newCode = () => exports.formatCode(crypto.randomBytes(15));
/* texte collé (minuscules, espaces, O/0, I/L/1 confondus, préfixe facultatif) → 15 octets, ou null */
exports.parseCode = text => {
  let s = String(text || '').toUpperCase().replace(/[\s_-]+/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (s.length === 27 && s.startsWith('HYD')) s = s.slice(3);
  if (s.length !== 24) return null; const b = dec(s); return b && b.length === 15 ? b : null;
};
exports.normalize = text => { const b = exports.parseCode(text); return b ? exports.formatCode(b) : ''; };

/* ---------- clés (dérivées du code) ---------- */
let DHTLib = null; const lib = () => DHTLib || (DHTLib = require('hyperdht'));
const hm = (key, ...parts) => crypto.createHmac('sha256', key).update(Buffer.concat(parts.map(p => Buffer.isBuffer(p) ? p : Buffer.from(String(p))))).digest();
const keysOf = secret => ({ kp: lib().keyPair(hm(secret, NAME + '/key')), auth: hm(secret, NAME + '/auth') });
const proof = (auth, nonce, guestPk, hostPk) => hm(auth, 'proof', nonce, guestPk, hostPk);
exports._keys = secret => { const k = keysOf(secret); return { publicKey: k.kp.publicKey }; };

/* ---------- réseau HyperDHT partagé (démarré à la demande, éteint quand plus rien ne sert) ---------- */
let dht = null, dhtP = null, idleT = null, bootstrap = null, listener = null, changeT = null;
const shares = new Map(), joins = new Map(), joining = new Map();
const withTimeout = (p, ms, msg) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error(msg)), ms); p.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); }); });
const getDHT = () => dhtP || (dhtP = (async () => {
  const D = lib(), d = new D(bootstrap ? { bootstrap } : {}); d.on('error', e => log.warn('p2p dht', e && e.message));
  try { await withTimeout(d.fullyBootstrapped(), BOOT_MS, 'Réseau P2P injoignable : vérifie ta connexion (le trafic UDP ne doit pas être bloqué par un pare-feu).'); }
  catch (e) { dhtP = null; try { await d.destroy(); } catch (x) {} throw e; }
  dht = d; return d;
})());
const dropDHT = async () => { const d = dht; dht = null; dhtP = null; if (d) try { await d.destroy(); } catch (e) {} };
const maybeIdle = () => { clearTimeout(idleT); idleT = null; if (!shares.size && !joins.size && (dht || dhtP)) { idleT = setTimeout(() => { if (!shares.size && !joins.size) dropDHT(); }, 30000); if (idleT.unref) idleT.unref(); } };
exports.onChange = f => { listener = f; };
const changed = () => { if (changeT) return; changeT = setTimeout(() => { changeT = null; try { listener && listener(exports.status()); } catch (e) {} }, 300); if (changeT.unref) changeT.unref(); };
exports.status = () => ({ shares: [...shares].map(([hostId, S]) => ({ hostId, peers: S.peers.size })), joins: [...joins].map(([key, J]) => ({ key, port: J.port, conns: J.conns.size })) });

/* ---------- petits outils de flux (sockets Node ou flux HyperDHT) ---------- */
/* lit exactement n octets (le flux est mis en pause ensuite : rien n'est perdu entre deux étapes) ; renvoie aussi l'éventuel surplus */
const readN = (s, n, ms) => new Promise((res, rej) => {
  let buf = Buffer.alloc(0), fin;
  const t = setTimeout(() => fin(new Error('délai dépassé')), ms), onData = d => { buf = Buffer.concat([buf, d]); if (buf.length >= n) fin(null); }, onEnd = () => fin(new Error('connexion fermée'));
  fin = e => { clearTimeout(t); try { s.pause(); } catch (x) {} s.off('data', onData); s.off('close', onEnd); s.off('error', onEnd); e ? rej(e) : res({ head: buf.subarray(0, n), rest: buf.subarray(n) }); };
  s.on('data', onData); s.on('close', onEnd); s.on('error', onEnd); try { s.resume(); } catch (x) {}
});
/* relie deux flux dans les deux sens (contre-pression, fermeture et erreurs comprises) */
const bridge = (a, b) => {
  const close = () => { try { a.destroy(); } catch (e) {} try { b.destroy(); } catch (e) {} };
  for (const [src, dst] of [[a, b], [b, a]]) {
    src.on('data', d => { if (dst.destroyed) return; if (dst.write(d) === false) { src.pause(); dst.once('drain', () => src.resume()); } });
    src.on('end', () => { try { dst.end(); } catch (e) {} });
  }
  a.on('error', close); b.on('error', close); a.on('close', close); b.on('close', close);
  try { a.resume(); b.resume(); } catch (e) {}
};

/* ---------- côté hôte : partager le serveur local ---------- */
function onHostConn(S, sock) {
  sock.on('error', () => {});
  if (S.peers.size + S.pending >= MAX_PEERS || S.pending >= MAX_PENDING) return sock.destroy();
  S.pending++; let counted = true; const done = () => { if (counted) { counted = false; S.pending--; } };
  (async () => {
    const nonce = crypto.randomBytes(32); sock.write(nonce);
    const { head, rest } = await readN(sock, 32, AUTH_MS);
    if (!crypto.timingSafeEqual(head, proof(S.keys.auth, nonce, sock.remotePublicKey, sock.publicKey))) throw new Error('preuve refusée');
    const local = net.connect({ host: '127.0.0.1', port: S.port }); local.on('error', () => {}); // jamais autre chose que CE serveur
    await withTimeout(new Promise((res, rej) => { local.once('connect', res); local.once('error', rej); local.once('close', () => rej(new Error('fermé'))); }), 5000, 'serveur local injoignable');
    if (!shares.has(S.id) || shares.get(S.id) !== S) { local.destroy(); throw new Error('partage arrêté'); }
    sock.write(Buffer.from([1])); S.peers.add(sock); done(); changed();
    sock.once('close', () => { if (S.peers.delete(sock)) changed(); });
    if (rest.length) local.write(rest);
    bridge(sock, local);
  })().catch(() => { done(); try { sock.destroy(); } catch (e) {} });
}
/* partage le serveur local `port` de l'hôte `hostId` avec les porteurs du code */
exports.share = async (hostId, port, code) => {
  const secret = exports.parseCode(code); if (!secret) throw new Error('Code d’invitation invalide.');
  if (!(port >= 1 && port <= 65535)) throw new Error('Port invalide.');
  exports.unshare(hostId);
  const keys = keysOf(secret), d = await getDHT(), S = { id: hostId, port, keys, peers: new Set(), pending: 0, server: null };
  S.server = d.createServer(sock => onHostConn(S, sock)); shares.set(hostId, S);
  try { await S.server.listen(keys.kp); }
  catch (e) { if (shares.get(hostId) === S) shares.delete(hostId); try { await S.server.close(); } catch (x) {} maybeIdle(); throw e; }
  if (shares.get(hostId) !== S) { try { await S.server.close(); } catch (e) {} return false; } // arrêté pendant l'ouverture
  log.info('p2p : serveur partagé', hostId, 'port', port); changed(); return true;
};
exports.unshare = hostId => {
  const S = shares.get(hostId); if (!S) return false; shares.delete(hostId);
  for (const s of S.peers) { try { s.destroy(); } catch (e) {} } S.peers.clear();
  try { Promise.resolve(S.server && S.server.close()).catch(() => {}); } catch (e) {}
  changed(); maybeIdle(); return true;
};

/* ---------- côté invité : un port LOCAL (127.0.0.1) qui mène au serveur de l'ami ---------- */
const stablePorts = (secret, first, avoid) => { // même code → mêmes ports à chaque fois (l'adresse enregistrée reste valable)
  const base = hm(secret, 'port').readUInt16BE(0) % 20000, out = [];
  if (first >= 1024 && first <= 65535) out.push(first);
  for (let i = 0; i < 12; i++) out.push(40000 + (base + i) % 20000);
  return [...new Set(out)].filter(p => !(avoid || []).includes(p));
};
const listenOn = (srv, ports) => new Promise((res, rej) => {
  let i = 0;
  const next = () => {
    if (i > ports.length) return rej(new Error('Aucun port local libre.'));
    const p = i < ports.length ? ports[i] : 0; i++; // dernier recours : un port libre choisi par le système
    const onErr = e => { srv.off('listening', onOk); if (e.code === 'EADDRINUSE' || e.code === 'EACCES') next(); else rej(e); };
    const onOk = () => { srv.off('error', onErr); res(srv.address().port); };
    srv.once('error', onErr); srv.once('listening', onOk); srv.listen(p, '127.0.0.1');
  };
  next();
});
/* ouvre un flux vers l'hôte et passe le défi ; résout avec { sock, rest } prêt à relayer.
   Les messages sont ceux que verra la personne : jamais le texte brut de la bibliothèque (« PEER_NOT_FOUND… »). */
const NOT_FOUND = 'L’hôte est introuvable : son serveur est arrêté, il n’a pas activé les invitations, le code est incorrect, ou ton réseau bloque la connexion directe.';
const CUT = 'L’hôte a coupé la connexion : son serveur Minecraft est peut-être arrêté ou complet.';
async function dial(keys) {
  const d = await getDHT(), sock = d.connect(keys.kp.publicKey); sock.on('error', () => {});
  try {
    try { await withTimeout(new Promise((res, rej) => { sock.once('open', res); sock.once('close', () => rej(new Error('fermée'))); sock.once('error', rej); }), CONNECT_MS, 'délai'); }
    catch (e) { throw new Error(NOT_FOUND); }
    try {
      const { head: nonce } = await readN(sock, 32, AUTH_MS);
      sock.write(proof(keys.auth, nonce, sock.publicKey, sock.remotePublicKey));
      const { head: ok, rest } = await readN(sock, 1, 8000);
      if (ok[0] !== 1) throw new Error('refusé');
      return { sock, rest };
    } catch (e) { throw new Error(CUT); }
  } catch (e) { try { sock.destroy(); } catch (x) {} throw e; }
}
function touch(J) { clearTimeout(J.t); J.t = setTimeout(() => { if (J.conns.size) touch(J); else exports.leave(J.key); }, IDLE_MS); if (J.t.unref) J.t.unref(); }
function onGuestConn(J, local) {
  local.on('error', () => {}); local.pause(); J.conns.add(local); touch(J); changed();
  local.once('close', () => { J.conns.delete(local); changed(); });
  (async () => {
    const { sock, rest } = await withTimeout(dial(J.keys), CONNECT_MS + AUTH_MS + 8000, 'délai dépassé');
    if (local.destroyed) return sock.destroy();
    if (rest.length) local.write(rest);
    bridge(local, sock);
  })().catch(e => { log.warn('p2p : connexion refusée', e && e.message); local.destroy(); });
}
/* ouvre (ou retrouve) le port local de cette invitation. opts.port : port déjà enregistré ; opts.avoid : ports à ne pas prendre (ceux de mes propres serveurs) */
exports.join = (code, opts = {}) => {
  const secret = exports.parseCode(code); if (!secret) return Promise.reject(new Error('Code d’invitation invalide.'));
  const key = hm(secret, 'id').toString('hex').slice(0, 16), ex = joins.get(key); if (ex) { touch(ex); return Promise.resolve({ port: ex.port, key }); }
  if (joining.has(key)) return joining.get(key);
  const p = (async () => {
    await getDHT(); const J = { key, keys: keysOf(secret), conns: new Set(), port: 0, server: null, t: null };
    J.server = net.createServer(local => onGuestConn(J, local)); J.server.on('error', e => log.warn('p2p port local', e && e.message));
    J.port = await listenOn(J.server, stablePorts(secret, +opts.port || 0, opts.avoid)); joins.set(key, J); touch(J); changed();
    return { port: J.port, key };
  })().finally(() => joining.delete(key));
  joining.set(key, p); return p;
};
exports.leave = key => {
  const J = joins.get(key); if (!J) return false; joins.delete(key); clearTimeout(J.t);
  for (const c of J.conns) { try { c.destroy(); } catch (e) {} } J.conns.clear(); try { J.server.close(); } catch (e) {}
  changed(); maybeIdle(); return true;
};
exports.leaveCode = code => { const s = exports.parseCode(code); return s ? exports.leave(hm(s, 'id').toString('hex').slice(0, 16)) : false; };
exports.isOpen = code => { const s = exports.parseCode(code); return !!(s && joins.has(hm(s, 'id').toString('hex').slice(0, 16))); };
/* l'hôte répond-il, et ce code est-il le bon ? (n'envoie rien au serveur Minecraft) */
exports.test = async code => {
  const secret = exports.parseCode(code); if (!secret) return { ok: false, error: 'Code d’invitation invalide.' };
  try { const { sock } = await withTimeout(dial(keysOf(secret)), TEST_MS + AUTH_MS + 4000, NOT_FOUND); sock.destroy(); return { ok: true }; }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
};
/* adresse d'un serveur enregistré avec invitation : on rouvre le port local s'il est fermé (appelé avant tout lancement vers ce serveur). Renvoie l'adresse à utiliser. */
exports.ensureFor = async addr => {
  let store; try { store = require('./store'); } catch (e) { return addr; }
  const d = store.get(), s = (d.servers || []).find(x => x.p2p && x.addr === addr); if (!s) return addr;
  const avoid = (d.hosts || []).map(h => +h.port).filter(Boolean), r = await exports.join(s.p2p, { port: +String(s.addr).split(':')[1] || 0, avoid }), na = '127.0.0.1:' + r.port;
  if (na !== s.addr) { s.addr = na; store.save(); } return na;
};

exports.stopAll = async () => { for (const id of [...shares.keys()]) exports.unshare(id); for (const k of [...joins.keys()]) exports.leave(k); clearTimeout(idleT); await dropDHT(); };
exports._test = { setBootstrap: b => { bootstrap = b; }, reset: async () => { await exports.stopAll(); bootstrap = null; listener = null; }, readN, bridge, proof, keysOf };
