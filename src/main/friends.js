/* Amis P2P, sans serveur central (HyperDHT, comme les invitations privées de p2p.js). Désactivé tant que la personne ne l'a pas demandé.

   • Identité = une paire de clés tirée d'une graine aléatoire gardée sur ce PC (chiffrée par le système si possible). Le CODE AMI est la clé PUBLIQUE (HYA-…, avec somme de contrôle) :
     permanent, sans danger à donner (il ne sert qu'à envoyer une demande) ; le réinitialiser = nouvelle identité et TOUS les contacts effacés.
   • L'identité de l'interlocuteur est celle de la poignée de main chiffrée (remotePublicKey) : elle ne peut pas être falsifiée par un message.
   • DEMANDE : l'expéditeur n'écrit aucun pseudo ; son pseudo Minecraft part automatiquement et le destinataire le voit au moment de décider (accepter, refuser, bloquer).
   • Un inconnu ne peut QUE déposer une demande (ou répondre à une demande que nous avons faite) ; tout autre message le fait couper. Limites : 20 inconnus par minute, 30 demandes en attente.
   • PRÉSENCE : entre amis, une connexion directe (ouverte par celui dont la clé est la plus petite) échange pseudo et état (en ligne / en jeu) ; « apparaître hors ligne » refuse les connexions des amis.
   • INVITATION à rejoindre un serveur : l'ami reçoit le code d'invitation privée, à confirmer. Une connexion directe montre l'adresse IP à l'ami connecté (dit à l'activation).
   • CHAT : les messages d'amis que ce fichier ne connaît pas sont confiés à chat.js (onMessage) ; onOnline lui dit quand un ami se connecte. Un ami peut envoyer des lignes de 32 Ko (cartes de partage).
   Messages : lignes JSON (2 Ko au plus pour un inconnu). Tout ce qui vient d'un pair est validé avant usage. */
const crypto = require('crypto');

const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';   // base 32 de Crockford
const b32 = buf => { let bits = 0, v = 0, out = ''; for (const b of buf) { v = (v << 8) | b; bits += 8; while (bits >= 5) { out += ALPHA[(v >>> (bits - 5)) & 31]; bits -= 5; } v &= (1 << bits) - 1; } if (bits) out += ALPHA[(v << (5 - bits)) & 31]; return out; };
const unb32 = s => { let bits = 0, v = 0; const out = []; for (const c of s) { const k = ALPHA.indexOf(c); if (k < 0) return null; v = (v << 5) | k; bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; v &= (1 << bits) - 1; } } return Buffer.from(out); };
const check = pk => b32(crypto.createHash('sha256').update(pk).digest().subarray(0, 2)).slice(0, 2);   // 2 caractères : détecte une faute de frappe
/** clé publique (32 octets) → « HYA-XXXXXX-… » */
const encode = pk => { const s = b32(pk) + check(pk); return 'HYA-' + s.match(/.{1,6}/g).join('-'); };
/** « HYA-… » (minuscules, espaces, O/0, I/L/1 tolérés) → Buffer de 32 octets, ou null */
const decode = str => {
  let s = String(str || '').toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1'); if (s.startsWith('HYA')) s = s.slice(3); if (s.length !== 54) return null;
  const pk = unb32(s.slice(0, 52)); if (!pk || pk.length < 32) return null; const k = pk.subarray(0, 32); return check(k) === s.slice(52) && b32(k) === s.slice(0, 52) ? Buffer.from(k) : null;
};
const hex = b => Buffer.from(b).toString('hex'), KEY = /^[0-9a-f]{64}$/;
const cleanName = (s, d = 'Joueur') => { s = String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>&"']/g, '').trim().slice(0, 32); return s || d; };
/** adresse de serveur partageable : nom d'hôte ou IP PUBLIQUE (avec port facultatif). Les adresses locales (127.x, 10.x, 192.168.x, localhost…) ne servent à rien à un ami et ne sont jamais envoyées ni acceptées. */
const cleanSrv = s => {
  s = String(s == null ? '' : s).trim().toLowerCase().slice(0, 80); if (!/^[a-z0-9._-]+(:\d{1,5})?$/.test(s)) return '';
  const h = s.replace(/:\d+$/, ''); if (!h || h === 'localhost' || h.endsWith('.local') || h.endsWith('.localhost') || /^(0|10|127)\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) return '';
  return s;
};
const MAXLINE = 2048, FRIEND_LINE = 32768, MAX_INBOX = 30, MAX_OUT = 30, MAX_FRIENDS = 100, OUT_TTL = 14 * 86400e3, UNKNOWN_PER_MIN = 20;

/** opts : store { get, save }, DHT (classe hyperdht), bootstrap, log, profile() → { name, st: 'online' | 'playing', what }, seal / unseal (chiffrement de la graine), notify(kind, data),
    hiMs / deadMs / retryMs / backoff (réglages de temps, remplacés par les tests) */
exports.create = (o = {}) => {
  const log = o.log || { info() {}, warn() {}, error() {} }, T = { hiMs: 30000, deadMs: 95000, retryMs: 60000, backoff: [15000, 60000, 300000], ...(o.timing || {}) };
  const seal = o.seal || (s => 'p:' + s), unseal = o.unseal || (s => String(s).slice(2)), notify = o.notify || (() => {}), profile = o.profile || (() => ({ name: 'Joueur', st: 'online', what: '' }));
  const cfg = () => { const d = o.store.get(); d.friends = d.friends || {}; const f = d.friends; f.list = f.list || []; f.inbox = f.inbox || []; f.out = f.out || []; f.blocked = f.blocked || []; return f; };
  const save = () => o.store.save();
  let dht = null, server = null, kp = null, myKey = '', running = false, retryT = null, hiT = null; const conns = new Map(), loops = new Map(), unknownHits = []; let closing = false;

  const seedOf = () => { const f = cfg(); if (f.seed) { try { const s = Buffer.from(unseal(f.seed), 'hex'); if (s.length === 32) return s; } catch (e) { log.warn('amis : graine illisible, nouvelle identité'); } } const s = crypto.randomBytes(32); f.seed = seal(s.toString('hex')); save(); return s; };
  const me = () => { const p = profile() || {}; return { name: cleanName(p.name), st: p.st === 'playing' ? 'playing' : 'online', what: cleanName(p.what || '', '').slice(0, 40), srv: p.st === 'playing' ? cleanSrv(p.srv) : '' }; };
  const friendOf = key => cfg().list.find(f => f.key === key);
  const changed = () => { try { notify('changed', {}); } catch (e) { /* affichage seulement */ } };
  const send = (c, m) => { try { c.write(JSON.stringify(m) + '\n'); } catch (e) { /* connexion fermée */ } };
  const endSoon = sock => { try { sock.end(); } catch (e) { /* déjà fermée */ } const t = setTimeout(() => { try { sock.destroy(); } catch (e) { /* fermée */ } }, 800); if (t.unref) t.unref(); };   // un client qui ne referme pas ne garde pas la connexion ouverte
  const initiator = key => myKey < key;   // un seul côté ouvre la connexion permanente : celui dont la clé est la plus petite

  /* ----- une connexion (entrante ou sortante) ----- */
  function attach(sock, key, outgoing) {
    let buf = '', last = Date.now(); const st = { sock, key, seen: 0, name: '', status: '', what: '', srv: '', friend: false, invites: [] };
    const kill = () => { try { sock.destroy(); } catch (e) { /* déjà fermée */ } };
    const guard = setTimeout(() => { if (!friendOf(key) && !outgoing) kill(); }, 6000);   // un inconnu a 6 s pour déposer sa demande
    const alive = setInterval(() => { if (!st.raw && Date.now() - last > T.deadMs && friendOf(key)) kill(); }, Math.max(200, T.deadMs / 3));
    sock.on('error', () => {});
    sock.on('close', () => { clearTimeout(guard); clearInterval(alive); if (conns.get(key) === st) { conns.delete(key); changed(); } });
    sock.on('data', d => {
      last = Date.now(); if (st.raw) return;   // connexion confiée à xfer.js (envoi de fichiers) : plus de lignes JSON
      buf += d.toString('utf8'); const lim = friendOf(key) ? FRIEND_LINE : MAXLINE;   // un ami peut envoyer une carte de partage (chat) ; un inconnu reste limité à 2 Ko
      if (buf.length > lim * 4) return kill();
      let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line.length > lim) return kill(); let m; try { m = JSON.parse(line); } catch (e) { return kill(); } if (!m || typeof m !== 'object') return kill(); handle(st, m); if (sock.destroyed || st.raw) return; }
    });
    return st;
  }
  function becomeFriends(key, name) {
    const f = cfg(); if (f.list.length >= MAX_FRIENDS || f.blocked.includes(key)) return null;
    f.inbox = f.inbox.filter(x => x.key !== key); f.out = f.out.filter(x => x.key !== key);
    let fr = friendOf(key); if (!fr) { fr = { key, name: cleanName(name), since: Date.now() }; f.list.push(fr); } else { fr.name = cleanName(name, fr.name); delete fr.pendingAccept; }
    save(); changed(); startLoop(fr); return fr;
  }
  function handle(st, m) {
    const key = st.key, fr = friendOf(key), f = cfg();
    if (fr) {   // ----- ami -----
      if (m.t === 'hi') {
        const was = st.seen, before = st.status + '|' + st.what + '|' + st.name + '|' + st.srv; st.seen = Date.now(); st.name = cleanName(m.name, fr.name); st.status = m.st === 'playing' ? 'playing' : 'online'; st.what = cleanName(m.what || '', '').slice(0, 40); st.srv = st.status === 'playing' ? cleanSrv(m.srv) : ''; fr.name = st.name;
        if (conns.get(key) !== st) { const old = conns.get(key); conns.set(key, st); if (old && old !== st) { try { old.sock.destroy(); } catch (e) { /* remplacée */ } } }
        if (!was) { send(st.sock, { t: 'hi', ...me() }); save(); changed(); if (o.onOnline) { try { o.onOnline(key); } catch (e) { log.warn('amis : onOnline', e && e.message); } } } else if (before !== st.status + '|' + st.what + '|' + st.name + '|' + st.srv) changed();   // un simple battement de présence ne change rien à l'écran
      } else if (m.t === 'invite') {
        const now = Date.now(); st.invites = st.invites.filter(x => now - x < 60000); if (st.invites.length >= 5) return; st.invites.push(now);
        const code = require('./p2p').normalize(m.code); if (!code) return;   // un code d'invitation valide, rien d'autre
        notify('invite', { key, from: fr.name, name: cleanName(m.name, 'Serveur'), code });
      } else if (m.t === 'bye') { f.list = f.list.filter(x => x.key !== key); stopLoop(key); save(); try { st.sock.destroy(); } catch (e) { /* fini */ } changed(); notify('removed', { name: fr.name }); }
      else if (m.t === 'accept') send(st.sock, { t: 'ack' });
      else if ((m.t === 'xget' || m.t === 'vstream') && o.onStream) { st.raw = true; try { o.onStream(key, st.sock, m); } catch (e) { log.warn('amis : flux', e && e.message); try { st.sock.destroy(); } catch (x) { /* fermée */ } } }   // un ami demande des fichiers qu'on lui a proposés (xfer.js) ou ouvre l'audio d'un appel (voice.js, 'vstream') : onStream prend la connexion
      else if (o.onMessage && st.seen) { try { o.onMessage(key, m); } catch (e) { log.warn('amis : message', e && e.message); } }   // chat : seulement après la poignée de main de présence
      return;
    }
    // ----- inconnu : seulement déposer une demande, ou répondre à la nôtre -----
    if (f.blocked.includes(key)) return st.sock.destroy();
    if (m.t === 'req') {
      const mine = f.out.find(x => x.key === key);
      if (mine) { becomeFriends(key, m.name); send(st.sock, { t: 'ack', accepted: true, ...me() }); notify('friend', { name: cleanName(m.name) }); return endSoon(st.sock); }   // demandes croisées : on devient amis tout de suite
      const ex = f.inbox.find(x => x.key === key);
      if (ex) ex.name = cleanName(m.name); else { if (f.inbox.length >= MAX_INBOX) return st.sock.destroy(); f.inbox.push({ key, name: cleanName(m.name), at: Date.now() }); }
      save(); changed(); if (!ex) notify('request', { name: cleanName(m.name) });
      send(st.sock, { t: 'ack' }); return endSoon(st.sock);
    }
    if (m.t === 'accept' && f.out.some(x => x.key === key)) { becomeFriends(key, m.name); notify('friend', { name: cleanName(m.name) }); send(st.sock, { t: 'ack', ...me() }); return; }
    st.sock.destroy();   // tout autre message d'un inconnu : coupé
  }

  /* ----- connexion permanente vers un ami (côté « petite clé ») ----- */
  function startLoop(fr) {
    if (!running || !initiator(fr.key) || loops.has(fr.key)) return;
    const L = { stop: false, n: 0, t: null }; loops.set(fr.key, L);
    const go = () => {
      if (L.stop || !running || !friendOf(fr.key)) return; if (cfg().hidden || conns.has(fr.key)) { L.t = setTimeout(go, T.backoff[0]); return; }
      let sock; try { sock = dht.connect(Buffer.from(fr.key, 'hex'), { keyPair: kp }); } catch (e) { L.t = setTimeout(go, T.backoff[0]); return; }
      attach(sock, fr.key, true);
      sock.on('open', () => { L.n = 0; send(sock, { t: 'hi', ...me() }); });
      sock.on('close', () => { if (!L.stop && running) L.t = setTimeout(go, T.backoff[Math.min(L.n++, T.backoff.length - 1)]); });
    };
    go();
  }
  const stopLoop = key => { const L = loops.get(key); if (L) { L.stop = true; clearTimeout(L.t); loops.delete(key); } const c = conns.get(key); if (c) try { c.sock.destroy(); } catch (e) { /* fini */ } };

  /* ----- message ponctuel (demande, acceptation, invitation, au revoir) ----- */
  function sendOnce(key, msg, ms = 20000) {
    return new Promise((ok, ko) => {
      let done = false; const sock = dht.connect(Buffer.from(key, 'hex'), { keyPair: kp }), fin = (e, v) => { if (done) return; done = true; clearTimeout(tm); try { sock.destroy(); } catch (x) { /* fini */ } e ? ko(e) : ok(v); };
      const tm = setTimeout(() => fin(new Error('délai dépassé')), ms); let buf = '';
      sock.on('error', e => fin(e)); sock.on('close', () => fin(new Error('connexion fermée')));
      sock.on('open', () => send(sock, msg));
      sock.on('data', d => { buf += d.toString('utf8'); const i = buf.indexOf('\n'); if (i >= 0) { try { const r = JSON.parse(buf.slice(0, i)); if (r && r.t === 'ack') { if (r.accepted) becomeFriends(key, r.name); fin(null, r); } else fin(new Error('réponse inattendue')); } catch (e) { fin(e); } } });
    });
  }
  const deliverOut = async x => { try { await sendOnce(x.key, { t: 'req', v: 1, name: me().name }); x.d = true; save(); changed(); return true; } catch (e) { x.tries = (x.tries || 0) + 1; return false; } };
  const retry = async () => {
    const f = cfg(), now = Date.now();
    f.out = f.out.filter(x => now - x.at < OUT_TTL);
    for (const x of f.out.filter(y => !y.d).slice(0, 5)) await deliverOut(x);
    for (const fr of f.list.filter(y => y.pendingAccept && now - y.since > OUT_TTL)) { delete fr.pendingAccept; save(); }   // la personne n'a jamais répondu : on arrête
    for (const fr of f.list.filter(y => y.pendingAccept).slice(0, 5)) { try { await sendOnce(fr.key, { t: 'accept', name: me().name }); delete fr.pendingAccept; save(); changed(); } catch (e) { /* encore hors ligne */ } }
  };

  /* ----- cycle de vie ----- */
  const api = {
    async start() {
      const f = cfg(); if (running || !o.DHT) return; running = true; closing = false;
      try {
      const seed = seedOf(); kp = o.DHT.keyPair(seed); myKey = hex(kp.publicKey);
      dht = new o.DHT(o.bootstrap ? { bootstrap: o.bootstrap } : {}); dht.on('error', e => log.warn('amis : dht', e && e.message));
      server = dht.createServer({ firewall: pk => { const k = hex(pk), c = cfg(); if (c.blocked.includes(k)) return true; if (friendOf(k)) return !!c.hidden; const t = Date.now(); while (unknownHits.length && t - unknownHits[0] > 60000) unknownHits.shift(); if (unknownHits.length >= UNKNOWN_PER_MIN) return true; unknownHits.push(t); return false; } });
      server.on('connection', sock => { try { const key = hex(sock.remotePublicKey); attach(sock, key, false); } catch (e) { try { sock.destroy(); } catch (x) { /* fini */ } } });
      await server.listen(kp); f.on = true; save();
      } catch (e) { running = false; try { if (dht) await dht.destroy(); } catch (x) { /* fermé */ } dht = null; server = null; kp = null; throw e; }
      for (const fr of f.list) startLoop(fr);
      hiT = setInterval(() => api.refresh(), T.hiMs); retryT = setInterval(() => { retry().catch(() => {}); }, T.retryMs); if (hiT.unref) { hiT.unref(); retryT.unref(); }
      retry().catch(() => {}); changed(); log.info('amis : activés');
    },
    async stop() {
      if (!running) return; running = false; closing = true; clearInterval(hiT); clearInterval(retryT);
      for (const k of [...loops.keys()]) stopLoop(k); for (const c of conns.values()) { try { c.sock.destroy(); } catch (e) { /* fini */ } } conns.clear();
      try { if (server) await server.close(); } catch (e) { /* fermé */ } try { if (dht) await dht.destroy(); } catch (e) { /* fermé */ }
      dht = null; server = null; kp = null; changed();
    },
    /** active ou désactive pour de bon (mémorisé : relancé au prochain démarrage) */
    async enable(on) { const f = cfg(); if (on) await api.start(); else { await api.stop(); f.on = false; save(); } changed(); },
    refresh() { if (!running || cfg().hidden) return; const hi = { t: 'hi', ...me() }; for (const c of conns.values()) if (friendOf(c.key)) send(c.sock, hi); },
    setHidden(b) { cfg().hidden = !!b; save(); if (b) { for (const c of [...conns.values()]) { try { c.sock.destroy(); } catch (e) { /* fini */ } } conns.clear(); } changed(); },
    /** nouvelle identité : TOUS les contacts, demandes et blocages sont effacés (les anciens amis ne peuvent plus joindre cette personne) */
    async reset() { const was = running, f = cfg(), bye = running ? f.list.map(x => x.key) : []; await Promise.allSettled(bye.map(k => sendOnce(k, { t: 'bye' }, 4000))); /* prévenus en même temps ; hors ligne : tant pis */ if (was) await api.stop(); const keep = f.on; o.store.get().friends = { on: keep, hidden: !!f.hidden, list: [], inbox: [], out: [], blocked: [] }; save(); if (was) await api.start(); changed(); },
    async request(code) {
      if (!running) throw new Error('Active d’abord les amis.'); const pk = decode(code); if (!pk) throw new Error('Code ami invalide : vérifie-le (il commence par HYA-).');
      const key = hex(pk), f = cfg(); if (key === myKey) throw new Error('C’est ton propre code ami.'); if (friendOf(key)) throw new Error('Cette personne est déjà dans tes amis.');
      if (f.blocked.includes(key)) throw new Error('Tu as bloqué cette personne : débloque-la d’abord.'); if (f.list.length >= MAX_FRIENDS) throw new Error('Liste d’amis pleine.');
      let x = f.out.find(y => y.key === key);
      const inb = f.inbox.find(y => y.key === key); if (inb) return api.accept(key);   // elle t'a déjà demandé : on accepte
      if (!x) { if (f.out.length >= MAX_OUT) throw new Error('Trop de demandes en attente : annule-en une.'); x = { key, at: Date.now(), d: false }; f.out.push(x); save(); }
      const sent = await deliverOut(x); changed(); return { sent, queued: !sent };
    },
    async accept(key) {
      const f = cfg(), r = f.inbox.find(x => x.key === key); if (!r) throw new Error('Demande introuvable.');
      const fr = becomeFriends(key, r.name); if (!fr) throw new Error('Impossible d’ajouter cette personne.');
      try { const a = await sendOnce(key, { t: 'accept', name: me().name }, 12000); void a; } catch (e) { fr.pendingAccept = true; save(); }   // hors ligne : on réessaie tant qu'elle ne répond pas
      changed(); return fr;
    },
    decline(key, block) { const f = cfg(); f.inbox = f.inbox.filter(x => x.key !== key); if (block && KEY.test(key) && !f.blocked.includes(key)) f.blocked.push(key); save(); changed(); },
    cancel(key) { const f = cfg(); f.out = f.out.filter(x => x.key !== key); save(); changed(); },
    unblock(key) { const f = cfg(); f.blocked = f.blocked.filter(x => x !== key); save(); changed(); },
    async remove(key) { const f = cfg(), fr = friendOf(key); if (!fr) return; if (running) { try { await sendOnce(key, { t: 'bye' }, 4000); } catch (e) { /* hors ligne : elle verra qu'on ne répond plus */ } } stopLoop(key); f.list = f.list.filter(x => x.key !== key); save(); changed(); },
    /** envoie à un ami EN LIGNE le code d'invitation privée d'un serveur */
    invite(key, name, code) {
      const c = conns.get(key); if (!c || !friendOf(key)) throw new Error('Cet ami n’est pas en ligne.'); const norm = require('./p2p').normalize(code); if (!norm) throw new Error('Code d’invitation invalide.');
      send(c.sock, { t: 'invite', name: cleanName(name, 'Serveur').slice(0, 40), code: norm }); return true;
    },
    status() {
      const f = cfg(), now = Date.now();
      return { on: !!f.on && running, enabled: !!f.on, hidden: !!f.hidden, code: running ? encode(kp.publicKey) : '', name: me().name,
        friends: f.list.map(x => { const c = conns.get(x.key); return { key: x.key, name: x.name, since: x.since, online: !!c && now - c.seen < T.deadMs, st: c ? c.status : '', what: c ? c.what : '', srv: c ? c.srv : '', pendingAccept: !!x.pendingAccept }; }).sort((a, b) => (b.online - a.online) || a.name.localeCompare(b.name)),
        inbox: f.inbox.map(x => ({ key: x.key, name: x.name, at: x.at })), out: f.out.map(x => ({ key: x.key, at: x.at, delivered: !!x.d })), blocked: f.blocked.length, blockedKeys: f.blocked.slice() };
    },
    /** envoie un message (objet JSON) à un ami connecté en ce moment ; false = pas joignable (le chat le garde alors en attente) */
    sendTo(key, msg) { const c = conns.get(key); if (!running || !c || !friendOf(key) || c.sock.destroyed || Date.now() - c.seen >= T.deadMs) return false; send(c.sock, msg); return true; },
    /** connexion directe vers un ami (pour un transfert de fichiers) ; l'appelant la ferme */
    openStream(key) { if (!running || !friendOf(key)) throw new Error('Cet ami n’est pas joignable.'); return dht.connect(Buffer.from(key, 'hex'), { keyPair: kp }); },
    isFriend: key => !!friendOf(key),
    isOnline(key) { const c = conns.get(key); return !!c && !!friendOf(key) && Date.now() - c.seen < T.deadMs; },
    friendName: key => { const f = friendOf(key); return f ? f.name : ''; },
    friendKeys: () => cfg().list.map(x => x.key),
    myKey: () => myKey,
    /** signature Ed25519 (clé de l'identité amis) : prouve l'auteur d'un message de groupe même relayé par un tiers */
    sign(data) { if (!running) throw new Error('Amis désactivés.'); return crypto.sign(null, Buffer.from(data), crypto.createPrivateKey({ key: Buffer.concat([PKCS8, seedOf()]), format: 'der', type: 'pkcs8' })).toString('hex'); },
    isRunning: () => running,
    config: () => cfg(),
  };
  return api;
};
const PKCS8 = Buffer.from('302e020100300506032b657004220420', 'hex'), SPKI = Buffer.from('302a300506032b6570032100', 'hex');
/** vérifie une signature produite par sign() ; clé = 64 caractères hexadécimaux, jamais d'exception */
exports.verify = (keyHex, data, sigHex) => { try { if (!KEY.test(keyHex) || !/^[0-9a-f]{128}$/.test(sigHex)) return false; return crypto.verify(null, Buffer.from(data), crypto.createPublicKey({ key: Buffer.concat([SPKI, Buffer.from(keyHex, 'hex')]), format: 'der', type: 'spki' }), Buffer.from(sigHex, 'hex')); } catch (e) { return false; } };
exports.cleanSrv = cleanSrv; exports.encode = encode; exports.decode = decode; exports.cleanName = cleanName;
