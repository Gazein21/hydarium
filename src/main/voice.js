/* Chat vocal entre amis : appel à deux, de PC à PC, sans serveur.

   • SONNERIE (messages d'ami, comme le chat) : { t:'vc', op:'ring' | 'acc' | 'dec' | 'end' | 'mute', id, … }.
       ring  l'appelant sonne chez un AMI en ligne (liste de formats audio par ordre de préférence : « opus », « pcm »)
       acc   l'appelé décroche et choisit le format (parmi ceux de l'appelant ET les siens)
       dec   refus (why : 'busy' | 'no')       end  raccrocher (sonnerie ou appel)       mute  micro coupé / rétabli (affichage seulement)
     Rien ne sonne chez quelqu'un qui n'est pas dans tes amis, rien n'est décroché tout seul : le micro n'est ouvert (par l'interface) qu'après un clic.
   • AUDIO : après « acc », l'APPELANT ouvre un flux direct chiffré vers l'ami (friends.openStream), première ligne { t:'vstream', id, codec }.
     L'appelé vérifie (ami, appel en cours, même identifiant, même format) puis répond { t:'vok' } ; l'audio ne part qu'après ce « vok »
     (rien n'est envoyé avant que l'autre soit prêt à lire). Ensuite : paquets [longueur u16 BE][octets], longueur 0 = signe de vie (toutes les 3 s).
   • Le launcher ne touche PAS à l'audio : l'interface capte le micro, encode (Opus par WebCodecs, sinon PCM 16 bits 16 kHz) et décode ; ce module transporte des paquets opaques de 20 ms.
     Temps réel : un paquet qui ne passe pas tout de suite (réseau lent) est JETÉ, jamais mis en file (sinon le retard grandit).
   • RIEN DE CE QUI VIENT DE L'AUTRE N'EST CRU : identifiants, formats, tailles (≤ 1 200 octets par paquet), cadence (≤ 100 paquets/s, le reste est jeté), mémoire tampon bornée ;
     un seul appel à la fois (« occupé » sinon), 3 sonneries par minute et par ami au plus, 45 s de sonnerie, 15 s pour établir l'audio, 10 s sans rien recevoir = « connexion perdue ».
   • Traces dans la discussion (message système) : durée de l'appel, « appel manqué », « sans réponse », « refusé ». */
const crypto = require('crypto');

const L = { ring: 45000, setup: 15000, idle: 10000, beat: 3000, pkt: 1200, rate: 100, rings: [3, 60000], hold: 64 * 1024, buf: 8192, caps: 2 };
const KEY = /^[0-9a-f]{64}$/, ID = /^[0-9a-f]{24}$/, CODECS = ['opus', 'pcm'];
const OPS = new Set(['ring', 'acc', 'dec', 'end', 'mute']);
const rid = () => crypto.randomBytes(12).toString('hex');

/** liste de formats reçue ou fournie → liste propre (sans doublon, 2 au plus, formats connus seulement) */
const cleanCaps = c => [...new Set(Array.isArray(c) ? c.filter(x => CODECS.includes(x)) : [])].slice(0, L.caps);
const fmtDur = ms => { const s = Math.max(0, Math.round(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60; return h ? `${h} h ${String(m).padStart(2, '0')} min` : m ? `${m} min ${String(r).padStart(2, '0')} s` : `${r} s`; };

/** o : friends (sendTo, isFriend, isOnline, isRunning, friendName, openStream), log, now, notify(kind, data), note(key, texte)
    notify : 'changed' (état), 'rx' (paquet audio reçu : Buffer), 'ring' ({ key, name }), 'ended' ({ key, name, reason }) */
exports.create = (o = {}) => {
  const log = o.log || { info() {}, warn() {}, error() {} }, fr = o.friends, now = o.now || Date.now, notify = o.notify || (() => {}), note = o.note || (() => {});
  let call = null; const rings = new Map(), timers = new Set();
  const nameOf = k => fr.friendName(k) || 'Ami';
  const emit = (kind, d) => { try { notify(kind, d); } catch (e) { /* affichage seulement */ } };
  const say = (key, text) => { try { note(key, text); } catch (e) { /* trace seulement */ } };
  const later = (ms, f) => { const t = setTimeout(() => { timers.delete(t); f(); }, ms); if (t.unref) t.unref(); timers.add(t); return t; };
  const clearAll = c => { if (c.tm) for (const t of c.tm) { clearTimeout(t); clearInterval(t); timers.delete(t); } c.tm = []; };
  const keep = (c, t) => { (c.tm = c.tm || []).push(t); return t; };
  const out = (key, m) => { try { return fr.sendTo(key, { t: 'vc', ...m }); } catch (e) { return false; } };
  const view = () => (call ? { id: call.id, key: call.key, name: nameOf(call.key), role: call.role, st: call.st, codec: call.codec || '', muted: !!call.muted, peerMuted: !!call.peerMuted, t0: call.t0 || 0 } : null);
  const changed = () => emit('changed', view());

  /** fin d'appel (quelle qu'en soit la cause) ; remote = c'est l'autre qui l'a voulu : on ne lui renvoie pas « end » */
  function finish(reason, remote) {
    const c = call; if (!c) return; call = null; clearAll(c);
    if (c.sock) { try { c.sock.removeAllListeners('data'); c.sock.on('error', () => {}); c.sock.destroy(); } catch (e) { /* déjà fermée */ } c.sock = null; }
    if (!remote) { if (c.role === 'in' && c.st === 'ring') out(c.key, { op: 'dec', id: c.id, why: 'no' }); else out(c.key, { op: 'end', id: c.id }); }
    const who = nameOf(c.key), dur = c.t0 ? now() - c.t0 : 0;
    // une seule trace par appel, chez l'appelant comme chez l'appelé
    const text = c.t0 ? `📞 Appel vocal · ${fmtDur(dur)}` : reason === 'declined' ? (c.role === 'out' ? `📞 ${who} a refusé l’appel.` : '📞 Appel refusé.') : reason === 'busy' ? `📞 ${who} est déjà en appel.`
      : reason === 'noanswer' ? '📞 Appel sans réponse.' : reason === 'missed' ? `📞 Appel manqué de ${who}.` : reason === 'cancelled' ? (c.role === 'in' ? `📞 Appel manqué de ${who}.` : '📞 Appel annulé.') : reason === 'hangup' ? '📞 Appel terminé.' : '📞 Appel interrompu (connexion perdue).';
    say(c.key, text); emit('ended', { key: c.key, name: who, reason, dur }); emit('changed', null);
  }

  /** flux audio établi (des deux côtés) : lecture des paquets, signe de vie, surveillance */
  function live(c, sock, rest) {
    c.sock = sock; c.st = 'live'; c.t0 = now(); c.lastRx = now(); c.win = { t: now(), n: 0 };
    clearAll(c); sock.on('error', () => {}); sock.on('close', () => { if (call === c) finish('lost', true); });
    let buf = rest && rest.length ? Buffer.from(rest) : Buffer.alloc(0);
    const parse = () => {
      for (;;) {
        if (buf.length < 2) break; const n = buf.readUInt16BE(0);
        if (n > L.pkt) { log.warn('voix : paquet trop gros, appel coupé', n); return finish('lost'); }
        if (buf.length < 2 + n) break;
        const p = buf.subarray(2, 2 + n); buf = buf.subarray(2 + n); c.lastRx = now();
        if (!n) continue;   // signe de vie
        const t = now(); if (t - c.win.t >= 1000) { c.win.t = t; c.win.n = 0; } if (++c.win.n > L.rate) continue;   // trop vite : jeté
        emit('rx', Buffer.from(p));
      }
      if (buf.length > L.buf) { log.warn('voix : tampon trop long, appel coupé'); finish('lost'); }
    };
    sock.on('data', d => { buf = buf.length ? Buffer.concat([buf, d]) : Buffer.from(d); parse(); });
    keep(c, setInterval(() => { try { if (sock.writableLength < L.hold) sock.write(Buffer.alloc(2)); } catch (e) { /* fermée */ } }, L.beat));
    keep(c, setInterval(() => { if (call === c && now() - c.lastRx > L.idle) finish('lost'); }, 2000));
    if (buf.length) parse(); changed();
  }

  const api = {
    /** appelle un ami (en ligne) ; caps : formats que l'interface sait encoder / décoder */
    start(key, caps) {
      if (!fr.isRunning()) throw new Error('Active d’abord les amis pour appeler.');
      if (!KEY.test(String(key)) || !fr.isFriend(key)) throw new Error('Cette personne n’est pas dans tes amis.');
      if (!fr.isOnline(key)) throw new Error('Ton ami n’est pas connecté : impossible de l’appeler.');
      if (call) throw new Error('Tu es déjà en appel.');
      caps = cleanCaps(caps); if (!caps.length) throw new Error('Cet ordinateur ne sait pas traiter le son (aucun format audio disponible).');
      const c = call = { id: rid(), key, role: 'out', st: 'ring', caps };
      if (!out(key, { op: 'ring', id: c.id, caps })) { call = null; throw new Error('Ton ami n’est pas joignable.'); }
      keep(c, later(L.ring, () => { if (call === c && c.st === 'ring') finish('noanswer'); }));
      changed(); return view();
    },
    /** décroche (l'interface ouvre le micro après ce clic) */
    accept(id, caps) {
      const c = call; if (!c || c.role !== 'in' || c.st !== 'ring' || c.id !== id) throw new Error('Cet appel n’est plus en cours.');
      caps = cleanCaps(caps); const codec = c.caps.find(x => caps.includes(x));
      if (!codec) { out(c.key, { op: 'dec', id: c.id, why: 'no' }); call = null; clearAll(c); say(c.key, '📞 Appel impossible : formats audio incompatibles.'); emit('changed', null); throw new Error('Formats audio incompatibles : mets Hydarium à jour chez vous deux.'); }
      c.codec = codec; c.st = 'conn'; clearAll(c);
      keep(c, later(L.setup, () => { if (call === c && c.st !== 'live') finish('lost'); }));
      out(c.key, { op: 'acc', id: c.id, codec }); changed(); return view();
    },
    decline(id) { const c = call; if (!c || c.role !== 'in' || c.st !== 'ring' || c.id !== id) return false; call = null; clearAll(c); out(c.key, { op: 'dec', id: c.id, why: 'no' }); say(c.key, '📞 Appel refusé.'); emit('ended', { key: c.key, name: nameOf(c.key), reason: 'declined', dur: 0 }); emit('changed', null); return true; },
    hangup() { const c = call; if (!c) return false; finish(c.st === 'live' ? 'hangup' : c.role === 'out' ? 'cancelled' : 'declined'); return true; },
    setMute(m) { const c = call; if (!c) return false; c.muted = !!m; if (c.st === 'live') out(c.key, { op: 'mute', id: c.id, m: c.muted }); changed(); return true; },
    /** paquet audio venant de l'interface (déjà encodé) ; jeté s'il ne peut pas partir tout de suite */
    audio(p) {
      const c = call; if (!c || c.st !== 'live' || !c.sock || c.muted || !c.ready) return false;
      if (!(p instanceof Uint8Array) || !p.length || p.length > L.pkt) return false;
      try { if (c.sock.writableLength > L.hold) return false; const h = Buffer.alloc(2); h.writeUInt16BE(p.length); c.sock.write(Buffer.concat([h, Buffer.from(p)])); return true; } catch (e) { return false; }
    },
    state: view,

    /** messages d'ami { t:'vc' } (friends.js → main.js) */
    onMessage(key, m) {
      if (!m || m.t !== 'vc' || !KEY.test(key) || typeof m.id !== 'string' || !ID.test(m.id) || !OPS.has(m.op)) return;
      if (m.op === 'ring') {
        if (!fr.isFriend(key)) return;
        if (call && call.id === m.id) return;   // doublon
        const t = now(), hits = (rings.get(key) || []).filter(x => t - x < L.rings[1]); if (hits.length >= L.rings[0]) return; hits.push(t); rings.set(key, hits);
        const caps = cleanCaps(m.caps); if (!caps.length) return out(key, { op: 'dec', id: m.id, why: 'no' });
        if (call) return out(key, { op: 'dec', id: m.id, why: 'busy' });
        const c = call = { id: m.id, key, role: 'in', st: 'ring', caps };
        keep(c, later(L.ring, () => { if (call === c && c.st === 'ring') finish('missed'); }));
        emit('ring', { key, name: nameOf(key) }); changed(); return;
      }
      const c = call; if (!c || c.id !== m.id || c.key !== key) return;   // appel inconnu, ou venant de quelqu'un d'autre : ignoré
      if (m.op === 'end') return finish(c.st === 'live' ? 'hangup' : c.role === 'in' ? 'cancelled' : 'hangup', true);
      if (m.op === 'dec') { if (c.role === 'out' && c.st === 'ring') finish(m.why === 'busy' ? 'busy' : 'declined', true); return; }
      if (m.op === 'mute') { if (c.st === 'live') { c.peerMuted = m.m === true; changed(); } return; }
      if (m.op === 'acc') {   // l'appelé a décroché : on ouvre le flux audio
        if (c.role !== 'out' || c.st !== 'ring' || !c.caps.includes(m.codec)) return;
        c.codec = m.codec; c.st = 'conn'; clearAll(c);
        keep(c, later(L.setup, () => { if (call === c && c.st !== 'live') finish('lost'); }));
        let sock; try { sock = fr.openStream(key); } catch (e) { log.warn('voix : flux impossible', e.message); return finish('lost'); }
        let got = Buffer.alloc(0), ok = false; sock.on('error', () => {});
        sock.on('close', () => { if (call === c && !ok) finish('lost', true); });
        sock.on('open', () => { try { sock.write(JSON.stringify({ t: 'vstream', id: c.id, codec: c.codec }) + '\n'); } catch (e) { finish('lost'); } });
        const first = d => {   // on attend « vok » (une ligne) avant d'envoyer quoi que ce soit ; ce qui suit la ligne est de l'audio
          got = Buffer.concat([got, d]); const i = got.indexOf(10); if (i < 0) { if (got.length > 512) finish('lost'); return; }
          sock.removeListener('data', first); let r; try { r = JSON.parse(got.subarray(0, i).toString('utf8')); } catch (e) { return finish('lost'); }
          if (!r || r.t !== 'vok' || call !== c) return finish('lost'); ok = true; c.ready = true; live(c, sock, got.subarray(i + 1));
        };
        sock.on('data', first); changed();
      }
    },
    /** flux entrant { t:'vstream' } (friends.js → main.js), comme xfer.serve pour les fichiers */
    serve(key, sock, m) {
      const c = call, bad = () => { try { sock.on('error', () => {}); sock.destroy(); } catch (e) { /* fermée */ } };
      if (!c || c.role !== 'in' || c.st !== 'conn' || c.key !== key || !m || m.id !== c.id || m.codec !== c.codec || sock.__vc) return bad();
      sock.__vc = 1; c.ready = true;
      try { sock.write(JSON.stringify({ t: 'vok' }) + '\n'); } catch (e) { return finish('lost'); }
      live(c, sock, null);
    },
    /** un ami s'est reconnecté : un appel qui sonnait encore chez lui n'a plus de sens, mais on ne coupe rien ici (le flux et le délai s'en chargent) */
    onOnline() {},
    close() { if (call) finish('hangup'); for (const t of timers) clearTimeout(t); timers.clear(); },
    _call: () => call,
  };
  return api;
};
exports.cleanCaps = cleanCaps; exports.fmtDur = fmtDur;
