/* Chat entre amis : messages texte, cartes de partage (instance, modpack, invitation serveur) et groupes.
   Aucun serveur : tout passe par les connexions directes que friends.js garde déjà ouvertes entre amis (chiffrées, identité = clé de la poignée de main).

   • MESSAGE : { id, ts, k: 't' texte | 'c' carte }. Livré à un ami EN LIGNE tout de suite ; sinon gardé « en attente » chez l'expéditeur et renvoyé quand l'ami se reconnecte.
     Le destinataire répond par un accusé (cack) : sans accusé, on renvoie (l'identifiant sert à ignorer les doublons). Après 14 jours sans livraison : abandon.
   • CARTE DE PARTAGE : jamais les fichiers. Une carte = quelques lignes de données + une miniature de 96 px (≤ 12 Ko) :
       inst  → recette d'instance (version, loader, liste des mods Modrinth) ; « Télécharger » recrée l'instance depuis Modrinth, pas depuis le PC de l'ami
       pack  → référence d'un modpack du catalogue (Modrinth / CurseForge) ; « Télécharger » l'installe depuis le catalogue
       srv   → invitation privée à un serveur (code à confirmer)
     Avantages : instantané, marche même si l'ami s'est déconnecté, rien de pesant sur sa connexion, fichiers vérifiés par leur source officielle.
   • GROUPE : liste de membres tenue par le créateur (administrateur), qui ne peut inviter que SES amis. Chaque message est envoyé directement à chaque membre dont on est ami ;
     pour un membre qu'on ne connaît pas, il passe par l'administrateur (ami de tous), qui le garde et le remet. Le message de groupe est SIGNÉ (Ed25519) par son auteur :
     un relais ne peut donc pas faire dire autre chose à quelqu'un. Un groupe n'est jamais rejoint sans accord : on reçoit une invitation à accepter ou refuser.
   • Tout ce qui vient d'un pair est validé avant usage (tailles, formats, adresses). Historique : 200 messages par conversation, dans chat.json (écriture atomique, différée). */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const F = require('./friends');

const L = { text: 1000, msgs: 200, seen: 400, group: 20, gname: 32, ttl: 14 * 86400e3, burst: [40, 10000], thumb: 12000, thumbPx: 256, pending: 100, flush: 100, newGroups: [5, 3600e3], invited: 10 };
const KEY = /^[0-9a-f]{64}$/, MID = /^[0-9a-f]{24}$/, GID = /^[0-9a-f]{16}$/, VER = /^[\w.+\- ]{1,32}$/, HYD1 = /^HYD1\.[\w-]{1,20000}$/, PID = /^([A-Za-z0-9]{8}|cf\d{1,10})$/;
const LOADERS = ['vanilla', 'fabric', 'quilt'];
const rid = () => crypto.randomBytes(12).toString('hex');
const isGroup = id => typeof id === 'string' && /^g:[0-9a-f]{16}$/.test(id);
const okConv = id => KEY.test(id) || isGroup(id);

/** texte d'un message : retours à la ligne gardés, caractères de contrôle et de renversement d'écriture retirés, 1000 caractères au plus ; '' si vide */
const cleanText = s => String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, L.text);

/** { w, h } d'un JPEG (marqueur SOF), ou null : une miniature minuscule peut annoncer une image géante (bombe de décompression) */
function jpegSize(b) {
  if (!b || b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null;
  let i = 2; while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; } const m = b[i + 1]; if (m === 0xff) { i++; continue; }
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    const len = b.readUInt16BE(i + 2); if (len < 2) return null;
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}
/** miniature reçue (JPEG en base64) → la même, ou '' si elle n'est pas un petit JPEG valide */
function okThumb(t) {
  if (typeof t !== 'string' || t.length < 100 || t.length > L.thumb || !/^[A-Za-z0-9+/]+={0,2}$/.test(t)) return '';
  const b = Buffer.from(t, 'base64'), z = jpegSize(b); return z && z.w > 0 && z.h > 0 && z.w <= L.thumbPx && z.h <= L.thumbPx ? t : '';
}

/** carte reçue ou à envoyer → carte propre { k, n, … , th (miniature base64 ou '') }, ou null. Rien d'autre que ces champs ne passe. */
function cleanCard(c) {
  if (!c || typeof c !== 'object') return null;
  const n = F.cleanName(c.n, '').slice(0, 40), th = okThumb(c.th);
  if (c.k === 'inst') {
    if (!n || typeof c.code !== 'string' || !HYD1.test(c.code) || typeof c.v !== 'string' || !VER.test(c.v) || !LOADERS.includes(c.l)) return null;
    const m = Number.isInteger(c.m) && c.m >= 0 && c.m <= 200 ? c.m : 0; return { k: 'inst', n, v: c.v, l: c.l, m, code: c.code, th };
  }
  if (c.k === 'pack') {
    if (!n || (c.src !== 'modrinth' && c.src !== 'curseforge') || typeof c.pid !== 'string' || !PID.test(c.pid) || (c.src === 'curseforge') !== /^cf/.test(c.pid)) return null;
    return { k: 'pack', n, src: c.src, pid: c.pid, v: typeof c.v === 'string' && VER.test(c.v) ? c.v : '', th };
  }
  if (c.k === 'srv') {
    let code = ''; try { code = require('./p2p').normalize(String(c.code || '')) || ''; } catch (e) { code = ''; }
    if (!code) return null; return { k: 'srv', n: n || 'Serveur', code, th: '' };
  }
  return null;
}
const cardOut = c => c.k === 'inst' ? { k: 'inst', n: c.n, v: c.v, l: c.l, m: c.m, code: c.code, th: c.th || '' } : c.k === 'pack' ? { k: 'pack', n: c.n, src: c.src, pid: c.pid, v: c.v || '', th: c.th || '' } : { k: 'srv', n: c.n, code: c.code };   // ordre des champs fixe

/** o : dir (dossier des données), friends (API de friends.js : sendTo, isFriend, isOnline, friendName, friendKeys, myKey, sign, isRunning), myName(), focused(), notify(kind, data), log, saveMs */
exports.create = (o = {}) => {
  const log = o.log || { info() {}, warn() {}, error() {} }, fr = o.friends, file = path.join(o.dir, 'chat.json'), notify = o.notify || (() => {}), now = o.now || Date.now;
  let db = { v: 1, convs: {}, groups: {}, tomb: {}, thumbs: {} }, dirty = false, timer = null, active = null; const burst = new Map(), lastNote = new Map(), newGroupHits = new Map();

  try { const d = JSON.parse(fs.readFileSync(file, 'utf8')); if (d && d.v === 1 && d.convs && d.groups) db = { tomb: {}, thumbs: {}, ...d }; }
  catch (e) { if (e.code !== 'ENOENT') { log.warn('chat : historique illisible, repart de zéro', e.message); try { fs.renameSync(file, file + '.bad'); } catch (x) { /* tant pis */ } } }

  /* ----- sauvegarde différée et atomique ----- */
  const flush = () => {
    if (timer) { clearTimeout(timer); timer = null; } if (!dirty) return; dirty = false;
    const used = new Set(); for (const c of Object.values(db.convs)) for (const m of c.msgs) if (m.c && m.c.th) used.add(m.c.th); for (const h of Object.keys(db.thumbs)) if (!used.has(h)) delete db.thumbs[h];   // miniatures orphelines
    try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify(db)); fs.renameSync(file + '.tmp', file); } catch (e) { log.warn('chat : écriture impossible', e.message); dirty = true; }
  };
  const save = () => { dirty = true; if (timer) return; timer = setTimeout(flush, o.saveMs == null ? 400 : o.saveMs); if (timer.unref) timer.unref(); };
  const changed = conv => { try { notify('changed', { conv: conv || null }); } catch (e) { /* affichage seulement */ } };

  /* ----- données ----- */
  const me = () => fr.myKey();
  const conv = (id, make) => { let c = db.convs[id]; if (!c && make) c = db.convs[id] = { msgs: [], seen: [], unread: 0 }; return c; };
  const group = id => (isGroup(id) ? db.groups[id.slice(2)] : null);
  const gOf = gid => db.groups[gid];
  const nameOf = (key, g) => { if (key === 'me') return o.myName ? o.myName() : 'Moi'; const f = fr.friendName(key); if (f) return f; const m = g && g.members.find(x => x.k === key); return m ? m.n : 'Inconnu'; };
  /** miniature en base64 → empreinte (stockée une seule fois, même partagée dix fois) */
  const internThumb = card => { if (!card.th) return { ...card, th: '' }; const h = crypto.createHash('sha1').update(card.th).digest('hex').slice(0, 20); db.thumbs[h] = card.th; return { ...card, th: h }; };
  const thumbB64 = h => (typeof h === 'string' && db.thumbs[h]) || '';
  const hydrateCard = c => ({ ...c, th: thumbB64(c.th) });   // pour (ré)émettre : miniature réelle à la place de l'empreinte
  const preview = m => m.k === 'c' && m.c ? (m.c.k === 'srv' ? '🎮 Invitation : ' : '📦 ') + m.c.n : m.k === 't' ? (m.x || '…') : '';

  /** range un message dans l'ordre de l'heure ; false = déjà vu (doublon) */
  function put(id, m) {
    const c = conv(id, true); if (c.seen.includes(m.id)) return false;
    let i = c.msgs.length; while (i > 0 && c.msgs[i - 1].ts > m.ts) i--; c.msgs.splice(i, 0, m);
    c.seen.push(m.id); if (c.seen.length > L.seen) c.seen.splice(0, c.seen.length - L.seen);
    if (c.msgs.length > L.msgs) c.msgs.splice(0, c.msgs.length - L.msgs);
    return true;
  }
  const findMsg = (convId, mid) => { const c = conv(convId); return c ? c.msgs.find(x => x.id === mid) : null; };
  const system = (convId, text) => { put(convId, { id: rid(), ts: now(), from: 'sys', k: 's', x: text }); };

  /* ----- envoi ----- */
  function frameFor(convId, m) {
    if (!isGroup(convId)) return m.k === 't' ? { t: 'dm', id: m.id, ts: m.ts, k: 't', x: m.x } : { t: 'dm', id: m.id, ts: m.ts, k: 'c', c: cardOut(hydrateCard(m.c)) };
    return { t: 'g', gid: convId.slice(2), id: m.id, ts: m.ots || m.ts, a: m.from === 'me' ? me() : m.from, p: m.p, sig: m.sig };   // ots : heure d'origine telle que signée (la nôtre peut avoir été ramenée à l'heure locale)
  }
  /** (re)tente la livraison des destinataires encore en attente (tous, ou un seul qui vient de se connecter) */
  function deliver(convId, m, only) {
    if (!m.pend || !m.pend.length) return;
    const g = group(convId), via = g && m.via ? m.pend.filter(k => m.via.includes(k) && !fr.isFriend(k)) : [];   // membres qu'on ne connaît pas : par l'administrateur
    for (const k of m.pend) {
      if (!fr.isFriend(k) || (only && k !== only) || !fr.isOnline(k)) continue;
      if (via.length && k === g.admin) continue;   // l'administrateur reçoit un seul envoi, avec la liste « via », ci-dessous
      fr.sendTo(k, frameFor(convId, m));
    }
    if (via.length && g.admin !== me() && fr.isOnline(g.admin) && (!only || only === g.admin)) { fr.sendTo(g.admin, { ...frameFor(convId, m), via }); m.rl = 1; }
  }
  function recipients(id) {
    if (!fr.isRunning()) throw new Error('Active d’abord les amis pour discuter.');
    if (isGroup(id)) { const g = group(id); if (!g) throw new Error('Groupe introuvable.'); if (g.st !== 'member') throw new Error('Rejoins d’abord ce groupe.'); return g.members.map(x => x.k).filter(k => k !== me()); }
    if (!KEY.test(id) || !fr.isFriend(id)) throw new Error('Cette personne n’est pas dans tes amis.'); return [id];
  }
  function post(id, body) {
    const to = recipients(id), c = conv(id, true); if (c.msgs.filter(x => x.pend && x.pend.length).length >= L.pending) throw new Error('Trop de messages en attente : ton ami n’est pas connecté depuis longtemps.');
    const m = { id: rid(), ts: now(), from: 'me', ...body, pend: to.slice() };
    if (isGroup(id)) {
      const g = group(id), a = me(); m.via = to.filter(k => !fr.isFriend(k));
      m.p = JSON.stringify(m.k === 't' ? { k: 't', x: m.x } : { k: 'c', c: cardOut(hydrateCard(m.c)) });
      m.sig = fr.sign(['hyd-chat1', g.id, m.id, m.ts, a, m.p].join('|'));
    }
    put(id, m); deliver(id, m); c.unread = 0; save(); changed(id); return m.id;
  }

  /* ----- réception ----- */
  const limited = key => { const t = now(), a = (burst.get(key) || []).filter(x => t - x < L.burst[1]); a.push(t); burst.set(key, a); return a.length > L.burst[0]; };
  const clampTs = ts => { const t = now(); return Number.isFinite(+ts) ? Math.min(Math.max(Math.floor(+ts), t - 30 * 86400e3), t) : t; };
  /** contenu d'un message reçu (texte ou carte) → champs à stocker ; un contenu inconnu (version plus récente) devient un message « non pris en charge » plutôt qu'une boucle de renvoi */
  function content(src) {
    if (src && src.k === 't') { const x = cleanText(src.x); return x ? { k: 't', x } : null; }
    if (src && src.k === 'c') { const c = cleanCard(src.c); return c ? { k: 'c', c: internThumb(c) } : { k: 't', x: '', bad: 1 }; }
    return null;
  }
  function incoming(convId, key, m, who) {
    const fresh = put(convId, m); if (!fresh) return;
    const c = conv(convId, true), here = active === convId && o.focused && o.focused();
    if (!here) c.unread = Math.min((c.unread || 0) + 1, 999);
    save(); changed(convId);
    if (!here) { const t = now(), g = group(convId); if (t - (lastNote.get(convId) || 0) > 8000) { lastNote.set(convId, t); try { notify('msg', { conv: convId, name: g ? g.name : who, from: who, text: m.bad ? 'Message non pris en charge' : preview(m) }); } catch (e) { /* notification seulement */ } } }
  }
  const ack = (key, id) => fr.sendTo(key, { t: 'cack', ids: [id] });

  function recvDm(key, m) {
    if (typeof m.id !== 'string' || !MID.test(m.id)) return; if (limited(key)) return;
    const body = content(m); if (!body) return ack(key, m.id);
    incoming(key, key, { id: m.id, ts: clampTs(m.ts), from: key, ...body }, nameOf(key)); ack(key, m.id);
  }
  function recvGroup(key, m) {
    if (typeof m.gid !== 'string' || !GID.test(m.gid) || typeof m.id !== 'string' || !MID.test(m.id) || typeof m.a !== 'string' || !KEY.test(m.a) || typeof m.p !== 'string' || m.p.length > 30000 || typeof m.sig !== 'string' || !Number.isSafeInteger(m.ts)) return;
    const g = gOf(m.gid); if (!g || !g.members.some(x => x.k === m.a) || m.a === me()) return;   // groupe inconnu (pas d'accusé : l'expéditeur réessaiera) ou auteur étranger
    if (key !== m.a && key !== g.admin) return;   // seul l'auteur ou l'administrateur (relais) peut nous remettre ce message
    if (limited(key)) return;
    if (!F.verify(m.a, ['hyd-chat1', g.id, m.id, m.ts, m.a, m.p].join('|'), m.sig)) return;   // signature fausse : jeté
    let src; try { src = JSON.parse(m.p); } catch (e) { return ack(key, m.id); }
    const body = content(src), cid = 'g:' + g.id; if (!body) return ack(key, m.id);
    const msg = { id: m.id, ts: clampTs(m.ts), from: m.a, ...body };
    // administrateur : garde le message pour les membres que l'auteur ne connaît pas, et le leur remet (même si on l'a déjà reçu : la garde est ajoutée une seule fois)
    if (g.admin === me() && key === m.a && Array.isArray(m.via)) {
      const known = findMsg(cid, m.id), want = m.via.filter(k => typeof k === 'string' && KEY.test(k) && k !== m.a && k !== me() && g.members.some(x => x.k === k) && fr.isFriend(k)).slice(0, L.group);
      const target = known || msg; target.cust = target.cust || []; const add = want.filter(k => !target.cust.includes(k)); target.cust.push(...add);
      if (add.length) { target.pend = [...new Set([...(target.pend || []), ...add])]; target.p = m.p; target.sig = m.sig; target.ots = m.ts; }
      if (!known) { incoming(cid, key, target, nameOf(m.a, g)); } else save();
      if (add.length) deliver(cid, target); ack(key, m.id); return;
    }
    incoming(cid, key, msg, nameOf(m.a, g)); ack(key, m.id);
  }
  function recvAck(key, m) {
    if (!Array.isArray(m.ids)) return; let any = false;
    for (const id of m.ids.slice(0, 100)) {
      if (typeof id !== 'string' || !MID.test(id)) continue;
      for (const [cid, c] of Object.entries(db.convs)) {
        if (!isGroup(cid) && cid !== key) continue;
        const x = c.msgs.find(y => y.id === id); if (!x || !x.pend || !x.pend.length) continue;
        const g = group(cid); let n = x.pend.length;
        x.pend = x.pend.filter(k => k !== key && !(g && key === g.admin && x.rl && x.via && x.via.includes(k)));   // l'administrateur a pris en charge les membres qu'on ne connaît pas
        if (x.pend.length !== n) { any = true; if (!x.pend.length) { delete x.p; delete x.sig; } }
      }
    }
    if (any) { save(); changed(); }
  }

  /* ----- groupes ----- */
  const ginfo = g => ({ t: 'ginfo', gid: g.id, name: g.name, rev: g.rev, members: g.members.map(x => ({ k: x.k, n: x.n })) });
  const sendInfo = (g, key) => { if (fr.isOnline(key)) fr.sendTo(key, ginfo(g)); };
  function broadcast(g, extra = []) {   // nouvelle version de la liste : à tous les membres (et aux personnes retirées), jusqu'à accusé de chacun
    g.rev++; g.gpend = [...new Set([...g.members.map(x => x.k).filter(k => k !== me()), ...extra])]; save();
    for (const k of g.gpend) sendInfo(g, k); changed('g:' + g.id);
  }
  const cleanMembers = (list, adminKey) => {
    if (!Array.isArray(list) || list.length < 2 || list.length > L.group) return null; const seen = new Set(), out = [];
    for (const x of list) { if (!x || typeof x.k !== 'string' || !KEY.test(x.k) || seen.has(x.k)) return null; seen.add(x.k); out.push({ k: x.k, n: F.cleanName(x.n, 'Joueur') }); }
    return seen.has(adminKey) ? out : null;
  };
  function recvGinfo(key, m) {
    if (typeof m.gid !== 'string' || !GID.test(m.gid) || !Number.isInteger(m.rev) || m.rev < 0 || m.rev > 1e9) return;
    const g = gOf(m.gid), cid = 'g:' + m.gid;
    if (g && g.admin !== key) return;   // seul l'administrateur modifie un groupe
    if (!g && Array.isArray(m.members) && !m.members.length) return fr.sendTo(key, { t: 'gack', gid: m.gid, rev: m.rev });   // dissolution d'un groupe qu'on n'a plus : accusé pour qu'on arrête de nous prévenir
    if (!g && db.tomb[m.gid] && db.tomb[m.gid].leave) return fr.sendTo(key, { t: 'gleave', gid: m.gid });   // on l'a quitté : pas de nouvelle invitation
    const members = cleanMembers(m.members, key), mine = members && members.some(x => x.k === me());
    if (g && (!members || !mine)) { delete db.groups[m.gid]; delete db.convs[cid]; save(); changed(); try { notify('group-removed', { name: g.name }); } catch (e) { /* info seulement */ } return fr.sendTo(key, { t: 'gack', gid: m.gid, rev: m.rev }); }   // retiré (ou groupe dissous)
    if (!members || !mine) return;
    if (!g) {
      const t = now(), hits = (newGroupHits.get(key) || []).filter(x => t - x < L.newGroups[1]); if (hits.length >= L.newGroups[0] || Object.values(db.groups).filter(x => x.st === 'invited').length >= L.invited) return; hits.push(t); newGroupHits.set(key, hits);
      db.groups[m.gid] = { id: m.gid, name: F.cleanName(m.name, 'Groupe').slice(0, L.gname), admin: key, members, rev: m.rev, st: 'invited', since: t, gpend: [] };
      system(cid, nameOf(key) + ' t’invite dans ce groupe.'); save(); changed(cid); try { notify('group-invite', { name: db.groups[m.gid].name, from: nameOf(key) }); } catch (e) { /* info seulement */ }
    } else if (m.rev > g.rev) {
      const before = new Set(g.members.map(x => x.k)), after = new Set(members.map(x => x.k));
      for (const x of members) if (!before.has(x.k)) system(cid, x.n + ' a rejoint le groupe.'); for (const x of g.members) if (!after.has(x.k)) system(cid, x.n + ' a quitté le groupe.');
      g.name = F.cleanName(m.name, g.name).slice(0, L.gname); g.members = members; g.rev = m.rev; save(); changed(cid);
    }
    fr.sendTo(key, { t: 'gack', gid: m.gid, rev: m.rev });
  }
  function recvGack(key, m) {
    if (typeof m.gid !== 'string' || !GID.test(m.gid)) return; const g = gOf(m.gid), t = db.tomb[m.gid];
    if (g && g.admin === me() && Array.isArray(g.gpend) && Number.isInteger(m.rev) && m.rev >= g.rev) { g.gpend = g.gpend.filter(k => k !== key); save(); }
    if (t && t.pend.includes(key)) { t.pend = t.pend.filter(k => k !== key); if (!t.pend.length) delete db.tomb[m.gid]; save(); }
  }
  function recvGleave(key, m) {
    if (typeof m.gid !== 'string' || !GID.test(m.gid)) return; const g = gOf(m.gid); fr.sendTo(key, { t: 'gack', gid: m.gid, rev: g ? g.rev : 0 });
    if (!g || g.admin !== me() || !g.members.some(x => x.k === key)) return;
    const gone = g.members.find(x => x.k === key); g.members = g.members.filter(x => x.k !== key); system('g:' + g.id, gone.n + ' a quitté le groupe.'); broadcast(g);
  }
  /** envoi des informations de groupe, des départs et des dissolutions qui attendaient que la personne se reconnecte */
  function pushGroupState(key) {
    for (const g of Object.values(db.groups)) if (g.admin === me() && (g.gpend || []).includes(key)) sendInfo(g, key);
    for (const [gid, t] of Object.entries(db.tomb)) if (t.pend.includes(key)) fr.sendTo(key, t.leave ? { t: 'gleave', gid } : { t: 'ginfo', gid, name: t.name, rev: t.rev, members: [] });
  }

  const api = {
    /** appelé par friends.js pour un message d'ami d'un type qu'il ne connaît pas */
    onMessage(key, m) {
      if (!m || typeof m !== 'object' || !KEY.test(key)) return;
      if (m.t === 'dm') recvDm(key, m); else if (m.t === 'g') recvGroup(key, m); else if (m.t === 'cack') recvAck(key, m);
      else if (m.t === 'ginfo') recvGinfo(key, m); else if (m.t === 'gack') recvGack(key, m); else if (m.t === 'gleave') recvGleave(key, m);
    },
    /** un ami vient de se connecter : on lui envoie ce qui attendait (groupes d'abord, puis messages, du plus ancien au plus récent) */
    onOnline(key) {
      pushGroupState(key); let n = 0; const t = now();
      for (const [cid, c] of Object.entries(db.convs)) {
        if (!isGroup(cid) && cid !== key) continue;
        for (const m of c.msgs) {
          if (!m.pend || !m.pend.length) continue;
          if (t - m.ts > L.ttl) { m.pend = []; m.exp = 1; delete m.p; delete m.sig; continue; }
          const g = group(cid); if (!(m.pend.includes(key) || (g && g.admin === key && m.via && m.pend.some(k => m.via.includes(k))))) continue;
          if (n++ >= L.flush) break; deliver(cid, m, key);
        }
      }
      if (n) save();
    },
    /** contacts retirés : leurs conversations privées disparaissent aussi (vie privée) */
    sync() {
      const keep = new Set(fr.friendKeys()); let ch = false;
      for (const id of Object.keys(db.convs)) if (KEY.test(id) && !keep.has(id)) { delete db.convs[id]; ch = true; }
      for (const [gid, t] of Object.entries(db.tomb)) if (now() - (t.at || 0) > L.ttl) { delete db.tomb[gid]; ch = true; }   // l'autre ne s'est jamais reconnecté : on abandonne
      if (ch) { save(); changed(); }
    },
    list() {
      const txt = m => (m.k === 's' ? m.x : m.bad ? 'Message non pris en charge' : preview(m)), convs = {};
      for (const [id, c] of Object.entries(db.convs)) { const l = c.msgs[c.msgs.length - 1]; convs[id] = { unread: c.unread || 0, last: l ? { ts: l.ts, mine: l.from === 'me', text: txt(l) } : null }; }
      const groups = Object.values(db.groups).map(g => ({ id: 'g:' + g.id, name: g.name, st: g.st, admin: g.admin === me(), adminKey: g.admin, rev: g.rev, members: g.members.map(x => ({ k: x.k, n: nameOf(x.k, g), me: x.k === me(), friend: fr.isFriend(x.k) })) }));
      return { convs, groups, unread: Object.values(db.convs).reduce((a, c) => a + (c.unread || 0), 0) };
    },
    /** messages d'une conversation, sans les miniatures ni les codes (l'interface demande une miniature à la fois) */
    messages(id) {
      if (!okConv(id)) throw new Error('Conversation invalide.'); const c = conv(id), g = group(id);
      return (c ? c.msgs : []).map(m => ({ id: m.id, ts: m.ts, mine: m.from === 'me', who: m.from === 'sys' ? '' : nameOf(m.from, g), from: m.from === 'me' ? 'me' : m.from, k: m.k, x: m.x || '', bad: !!m.bad, st: m.from !== 'me' ? '' : m.exp ? 'fail' : m.pend && m.pend.length ? 'wait' : 'ok', dl: m.dl || null,
        c: m.c ? { k: m.c.k, n: m.c.n, v: m.c.v || '', l: m.c.l || '', m: m.c.m || 0, src: m.c.src || '', th: m.c.th || '' } : null }));
    },
    thumb: h => { const b = thumbB64(h); return b ? 'data:image/jpeg;base64,' + b : ''; },
    /** carte complète (avec son code) pour le téléchargement : jamais envoyée à l'interface */
    card(convId, mid) { const m = findMsg(convId, mid); if (!m || !m.c) throw new Error('Carte introuvable.'); return m.c; },
    setDl(convId, mid, dl) { const m = findMsg(convId, mid); if (!m) return; if (dl) m.dl = dl; else delete m.dl; save(); changed(convId); },
    read(id) { const c = conv(id); if (c && c.unread) { c.unread = 0; save(); changed(id); } },
    setActive(id) { active = okConv(id) ? id : null; if (active) api.read(active); },
    send: (id, text) => { const x = cleanText(text); if (!x) throw new Error('Message vide.'); return post(id, { k: 't', x }); },
    /** carte (voir cleanCard) + miniature JPEG en base64 (déjà réduite) */
    sendCard(id, card, thumb) { const c = cleanCard({ ...card, th: thumb || '' }); if (!c) throw new Error('Carte invalide.'); return post(id, { k: 'c', c: internThumb(c) }); },
    /** garde une trace locale d'un partage déjà fait par un autre canal (ex. invitation serveur) ; le code d'une invitation envoyée n'est pas conservé */
    record(key, { mine, card }) {
      if (!KEY.test(key) || !fr.isFriend(key)) return; const c = cleanCard(card); if (!c) return;
      const msg = { id: rid(), ts: now(), from: mine ? 'me' : key, k: 'c', c: internThumb(mine && c.k === 'srv' ? { ...c, code: '' } : c) }, cv = conv(key, true);
      put(key, msg); if (!mine && !(active === key && o.focused && o.focused())) cv.unread = (cv.unread || 0) + 1; save(); changed(key);
    },
    createGroup(name, keys) {
      if (!fr.isRunning()) throw new Error('Active d’abord les amis.'); const list = [...new Set(Array.isArray(keys) ? keys : [])];
      if (!list.length) throw new Error('Choisis au moins un ami.'); if (list.length > L.group - 1) throw new Error('Un groupe compte ' + L.group + ' personnes au plus.');
      for (const k of list) if (typeof k !== 'string' || !KEY.test(k) || !fr.isFriend(k)) throw new Error('Un groupe ne peut contenir que des personnes déjà dans tes amis.');
      if (Object.values(db.groups).filter(g => g.admin === me()).length >= 20) throw new Error('Tu administres déjà trop de groupes.');
      const id = crypto.randomBytes(8).toString('hex'), g = db.groups[id] = { id, name: F.cleanName(name, 'Groupe').slice(0, L.gname), admin: me(), members: [{ k: me(), n: nameOf('me') }, ...list.map(k => ({ k, n: nameOf(k) }))], rev: 0, st: 'member', since: now(), gpend: [] };
      system('g:' + id, 'Groupe créé.'); broadcast(g); return 'g:' + id;
    },
    groupAdd(id, keys) {
      const g = group(id); if (!g || g.admin !== me()) throw new Error('Seul l’administrateur peut ajouter des membres.');
      const add = [...new Set(keys || [])].filter(k => typeof k === 'string' && KEY.test(k) && fr.isFriend(k) && !g.members.some(x => x.k === k));
      if (!add.length) throw new Error('Aucun ami à ajouter.'); if (g.members.length + add.length > L.group) throw new Error('Un groupe compte ' + L.group + ' personnes au plus.');
      for (const k of add) { g.members.push({ k, n: nameOf(k) }); system(id, nameOf(k) + ' a rejoint le groupe.'); } broadcast(g);
    },
    groupKick(id, key) {
      const g = group(id); if (!g || g.admin !== me()) throw new Error('Seul l’administrateur peut retirer quelqu’un.'); if (key === me() || !g.members.some(x => x.k === key)) throw new Error('Membre introuvable.');
      const gone = g.members.find(x => x.k === key); g.members = g.members.filter(x => x.k !== key); system(id, nameOf(key, g) === 'Inconnu' ? gone.n + ' a été retiré.' : nameOf(key) + ' a été retiré.'); broadcast(g, [key]);
    },
    groupAccept(id) { const g = group(id); if (!g) throw new Error('Groupe introuvable.'); if (g.st === 'member') return; g.st = 'member'; system(id, 'Tu as rejoint le groupe.'); save(); changed(id); },
    /** quitter (ou refuser une invitation) ; l'administrateur, lui, dissout */
    groupLeave(id) {
      const g = group(id); if (!g) return;
      if (g.admin === me()) {   // dissolution : chaque membre est prévenu, même hors ligne
        const keys = g.members.map(x => x.k).filter(k => k !== me()), rev = g.rev + 1; db.tomb[g.id] = { name: g.name, rev, pend: keys, at: now() };
        delete db.groups[g.id]; delete db.convs[id]; save(); for (const k of keys) if (fr.isOnline(k)) fr.sendTo(k, { t: 'ginfo', gid: g.id, name: g.name, rev, members: [] }); changed(); return;
      }
      if (fr.isFriend(g.admin)) { db.tomb[g.id] = { leave: true, pend: [g.admin], at: now() }; if (fr.isOnline(g.admin)) fr.sendTo(g.admin, { t: 'gleave', gid: g.id }); }
      delete db.groups[g.id]; delete db.convs[id]; save(); changed();
    },
    /** nouvelle identité : tout est effacé */
    wipe() { db = { v: 1, convs: {}, groups: {}, tomb: {}, thumbs: {} }; dirty = true; flush(); changed(); },
    flush,
    _db: () => db,
  };
  return api;
};
exports.cleanCard = cleanCard; exports.cleanText = cleanText; exports.jpegSize = jpegSize; exports.okThumb = okThumb;
