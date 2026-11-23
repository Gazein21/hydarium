/* Envoi direct de fichiers entre amis (mods perso, packs, shaders, mondes…), sans serveur : un flux chiffré de PC à PC, ouvert par celui qui REÇOIT.

   • PROPOSITION : l'expéditeur choisit des fichiers / dossiers ; ils restent chez lui. Seule une carte part dans le chat (nom, nombre, taille, quelques noms). Rien n'est lu ni copié à ce moment-là.
     La proposition (tid) n'est valable que pour les destinataires de la conversation, 7 jours, et tant que le launcher de l'expéditeur est ouvert.
   • RÉCEPTION : un clic sur « Recevoir » ouvre un flux vers l'expéditeur (ligne JSON { t:'xget', tid } puis flux binaire). L'expéditeur répond par la liste des fichiers (xman) puis les octets, dans l'ordre.
     Écrit dans un dossier d'attente (received/<tid>) : rien n'est rangé dans une instance sans un second clic.
   • RIEN DE CE QUI VIENT DE L'AUTRE N'EST CRU : chemins relatifs sûrs seulement (pas de « .. », de lecteur, de nom réservé Windows, de lien), doublons refusés, nombre / taille bornés, taille annoncée = taille de la carte,
     exécutables (.exe, .bat, .dll, .sh…) refusés ; chaque fichier fait exactement la taille annoncée ; place disque vérifiée ; délai si l'ami ne répond plus.
   • REPRISE : la réception s'écrit dans received/<tid>.part (+ received/<tid>.part.json : liste des fichiers et empreinte « v » donnée par l'expéditeur). Si la connexion tombe, le .part reste ;
     au clic suivant, le récepteur dit « je reprends au fichier i, à l'octet o » (xget avec rv / ri / ro). L'expéditeur n'accepte que si l'empreinte v (noms, tailles, dates de modification) est
     toujours la même : sinon il envoie tout depuis le début (le récepteur efface alors son .part). Un expéditeur sans cette fonction renvoie tout aussi : même résultat, sans erreur.
     Le dossier final received/<tid> n'apparaît qu'une fois TOUT reçu (renommage du .part). « Annuler » efface le .part ; une erreur le garde. 14 jours au plus.
   • Les .jar (mods) sont du code : l'interface le dit avant. Ils passent ensuite par le rangement habituel (drop.js) : « non vérifiés ». */
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const L = { files: 3000, total: 4 * 2 ** 30, ttl: 7 * 86400e3, keep: 14 * 86400e3, conc: 3, idle: 60000, manifest: 2e6, seg: 120, rel: 240, depth: 12, free: 200 * 2 ** 20 };
const MID = /^[0-9a-f]{24}$/, KEY = /^[0-9a-f]{64}$/, PART = /^[0-9a-f]{24}\.part(\.json)?$/, VER = /^[0-9a-f]{40}$/;
const BAD_EXT = /\.(exe|bat|cmd|com|scr|msi|ps1|psm1|vbs|vbe|wsf|jse|hta|cpl|lnk|reg|dll|so|dylib|sh|command|pif)$/i;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/** chemin relatif d'un fichier reçu → chemin normalisé « a/b/c.jar », ou null s'il n'est pas sûr */
function cleanRel(p) {
  if (typeof p !== 'string' || !p || p.length > L.rel || /[\\\u0000-\u001f<>:"|?*]/.test(p) || p.startsWith('/')) return null;
  const segs = p.split('/'); if (segs.length > L.depth) return null;
  for (const g of segs) if (!g || g === '.' || g === '..' || g.length > L.seg || /[ .]$/.test(g) || RESERVED.test(g)) return null;
  return segs.join('/');
}
/** liste de fichiers annoncée par l'autre → { files, total } propre, ou une erreur claire */
function checkManifest(m, expect) {
  if (!m || m.t !== 'xman' || !Array.isArray(m.files) || !m.files.length) throw new Error('Liste de fichiers invalide.');
  if (m.files.length > L.files) throw new Error('Trop de fichiers (' + L.files + ' au plus).');
  const files = [], seen = new Set(), dirs = new Set(); let total = 0;
  for (const f of m.files) {
    const p = f && cleanRel(f.p); if (!p) throw new Error('Nom de fichier refusé : ' + String(f && f.p).slice(0, 60));
    if (!Number.isSafeInteger(f.s) || f.s < 0 || f.s > L.total) throw new Error('Taille invalide.');
    if (BAD_EXT.test(p)) throw new Error('Fichier bloqué par sécurité (programme) : ' + p.split('/').pop());
    const k = p.toLowerCase(); if (seen.has(k)) throw new Error('Fichier en double : ' + p);
    seen.add(k); total += f.s; if (total > L.total) throw new Error('Trop volumineux (4 Go au plus).'); files.push({ p, s: f.s });
    const segs = p.toLowerCase().split('/'); for (let i = 1; i < segs.length; i++) dirs.add(segs.slice(0, i).join('/'));
  }
  for (const k of seen) if (dirs.has(k)) throw new Error('Chemins en conflit : ' + k);   // « a » fichier et « a/b » fichier
  if (expect && (files.length !== expect.count || total !== expect.size)) throw new Error('Le contenu ne correspond pas à la carte reçue : refusé.');
  return { files, total };
}
/** dossier → ses fichiers réguliers (liens et fichiers spéciaux ignorés), chemins relatifs avec / */
function walk(abs, rel, out, depth = 0) {
  if (depth > L.depth) throw new Error('Dossier trop profond.');
  for (const n of fs.readdirSync(abs)) {
    const a = path.join(abs, n), r = rel + '/' + n, st = fs.lstatSync(a);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) walk(a, r, out, depth + 1); else if (st.isFile()) { out.push({ a, p: r, s: st.size }); if (out.length > L.files) throw new Error('Trop de fichiers (' + L.files + ' au plus).'); }
  }
}
const fmtErr = e => ({ indisponible: 'Cet envoi n’est plus disponible (expiré, ou le launcher de ton ami a été relancé sans lui).', 'occupé': 'Ton ami envoie déjà des fichiers : réessaie dans un instant.', modifié: 'Ton ami a modifié ou déplacé les fichiers depuis l’envoi.' }[e] || 'Refusé par ton ami.');

/** o : dir, friends (API de friends.js : isFriend, isOnline, openStream), log, notify('xfer', { tid, role, key, done, total, st, error }), now */
exports.create = (o = {}) => {
  const log = o.log || { info() {}, warn() {}, error() {} }, fr = o.friends, now = o.now || Date.now, file = path.join(o.dir, 'xfer.json'), recvDir = path.join(o.dir, 'received');
  let offers = {}; const active = new Map(), jobs = new Map();
  try { const d = JSON.parse(fs.readFileSync(file, 'utf8')); if (d && d.offers) offers = d.offers; } catch (e) { /* aucune proposition */ }
  const saveOffers = () => { try { fs.mkdirSync(o.dir, { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify({ offers })); fs.renameSync(file + '.tmp', file); } catch (e) { log.warn('xfer : écriture impossible', e.message); } };
  const emit = d => { try { if (o.notify) o.notify('xfer', d); } catch (e) { /* affichage seulement */ } };
  const throttle = () => { let t = 0; return (d, force) => { const n = now(); if (force || n - t > 250) { t = n; emit(d); } }; };
  const purge = () => {   // propositions expirées ; dossiers d'attente trop vieux
    let ch = false; for (const [k, v] of Object.entries(offers)) if (now() - v.at > L.ttl) { delete offers[k]; ch = true; } if (ch) saveOffers();
    try { for (const n of fs.readdirSync(recvDir)) { const d = path.join(recvDir, n); if ((MID.test(n) || PART.test(n)) && now() - fs.statSync(d).mtimeMs > L.keep) fs.rmSync(d, { recursive: true, force: true }); } } catch (e) { /* pas de dossier */ }
  };
  purge();
  const destOf = tid => { if (!MID.test(String(tid))) throw new Error('Envoi invalide.'); return path.join(recvDir, tid); };
  const partOf = tid => destOf(tid) + '.part', stateOf = tid => destOf(tid) + '.part.json';
  const wipePart = tid => { try { fs.rmSync(partOf(tid), { recursive: true, force: true }); } catch (e) { /* déjà parti */ } try { fs.rmSync(stateOf(tid), { force: true }); } catch (e) { /* déjà parti */ } };
  /** état d'une réception interrompue : { v, files, total } relu et revérifié (comme une liste reçue), ou null */
  const readState = (tid, expect) => {
    try { const s = JSON.parse(fs.readFileSync(stateOf(tid), 'utf8')); if (s && typeof s.v === 'string' && VER.test(s.v) && Array.isArray(s.files)) return { v: s.v, ...checkManifest({ t: 'xman', files: s.files }, expect) }; } catch (e) { /* pas d'état ou illisible */ }
    return null;
  };
  /** où reprendre : d'après ce qui est RÉELLEMENT sur le disque. i = premier fichier incomplet, off = octets déjà là, base = octets déjà reçus en tout ; null = incohérent (on repart de zéro) */
  const resumePoint = (st, part) => {
    let i = 0, off = 0, base = 0;
    for (; i < st.files.length; i++) {
      const f = st.files[i]; let z; try { z = fs.lstatSync(path.resolve(part, ...f.p.split('/'))); } catch (e) { break; }
      if (!z.isFile()) return null; if (z.size === f.s) { base += f.s; continue; } if (z.size < f.s) { off = z.size; base += off; break; } return null;   // plus gros que prévu : douteux
    }
    return { i, off, base };
  };

  const api = {
    /** prépare une proposition : items = chemins absolus (fichiers ou dossiers) choisis par la personne via le sélecteur système. Renvoie les données de la carte. */
    offer(to, name, items) {
      const dest = (Array.isArray(to) ? to : []).filter(k => KEY.test(k) && fr.isFriend(k)); if (!dest.length) throw new Error('Personne à qui envoyer : les fichiers ne partent qu’à tes amis.');
      const files = [], top = [], names = new Set();
      for (const it of (Array.isArray(items) ? items : []).slice(0, 200)) {
        if (typeof it !== 'string' || !path.isAbsolute(it)) continue; const st = fs.lstatSync(it), base = path.basename(it);
        if (st.isSymbolicLink() || !(st.isFile() || st.isDirectory())) continue; if (!cleanRel(base)) throw new Error('Nom refusé : ' + base);
        if (names.has(base.toLowerCase())) throw new Error('Deux éléments portent le même nom : ' + base); names.add(base.toLowerCase()); top.push(base);
        if (st.isFile()) files.push({ a: it, p: base, s: st.size }); else walk(it, base, files);
        if (files.length > L.files) throw new Error('Trop de fichiers (' + L.files + ' au plus).');
      }
      if (!files.length) throw new Error('Rien à envoyer.');
      let total = 0; for (const f of files) { if (!cleanRel(f.p)) throw new Error('Nom refusé : ' + f.p.slice(0, 60)); if (BAD_EXT.test(f.p)) throw new Error('Ce fichier est bloqué par sécurité (programme) : ' + f.p.split('/').pop()); total += f.s; }
      if (total > L.total) throw new Error('Trop volumineux : 4 Go au plus par envoi.');
      const tid = crypto.randomBytes(12).toString('hex'); offers[tid] = { to: dest, name: String(name || top[0]).slice(0, 40), files, total, at: now() }; saveOffers();
      return { tid, count: files.length, size: total, jar: files.some(f => /\.jar$/i.test(f.p)), top: top.slice(0, 4).map(x => x.slice(0, 40)), to: dest };
    },
    /** appelé par friends.js quand un ami ouvre un flux « xget » : on lui envoie ce qu'on lui a proposé */
    serve(key, sock, m) {
      const fail = e => { try { sock.write(JSON.stringify({ t: 'xerr', e }) + '\n'); } catch (x) { /* fermée */ } const t = setTimeout(() => { try { sock.destroy(); } catch (x) { /* fermée */ } }, 600); if (t.unref) t.unref(); };
      sock.on('error', () => {});
      const off = m && typeof m.tid === 'string' && MID.test(m.tid) ? offers[m.tid] : null;
      if (!off || !off.to.includes(key) || !fr.isFriend(key) || now() - off.at > L.ttl) return fail('indisponible');
      if (active.size >= L.conc || [...active.values()].some(a => a.key === key)) return fail('occupé');
      const h = crypto.createHash('sha1');   // empreinte de ce qu'on propose : noms, tailles, dates de modification (une reprise n'est acceptée que si rien n'a bougé)
      for (const f of off.files) { let st; try { st = fs.lstatSync(f.a); } catch (e) { return fail('modifié'); } if (!st.isFile() || st.isSymbolicLink() || st.size !== f.s) return fail('modifié'); h.update(f.p + '|' + f.s + '|' + Math.floor(st.mtimeMs) + '\n'); }
      const v = h.digest('hex'); let r = null, base = 0;
      if (m.rv === v && Number.isInteger(m.ri) && Number.isInteger(m.ro) && m.ri >= 0 && m.ri < off.files.length && m.ro >= 0 && (m.ro === 0 || m.ro < off.files[m.ri].s)) { r = { i: m.ri, o: m.ro }; for (let k = 0; k < r.i; k++) base += off.files[k].s; base += r.o; }
      const job = { key, tid: m.tid }; active.set(sock, job); const tick = throttle(); let sent = base, dead = false;
      const stop = () => { dead = true; active.delete(sock); }; let abort = null;
      sock.on('close', () => { if (!dead) { stop(); emit({ tid: job.tid, role: 'send', key, done: sent, total: off.total, st: 'err', error: 'Interrompu.' }); if (abort) abort(new Error('interrompu')); } });
      sock.write(JSON.stringify({ t: 'xman', name: off.name, v, ...(r ? { r } : {}), files: off.files.map(f => ({ p: f.p, s: f.s })) }) + '\n');
      (async () => {
        for (let fi = r ? r.i : 0; fi < off.files.length; fi++) {
          const f = off.files[fi], from = r && fi === r.i ? r.o : 0;
          await new Promise((ok, ko) => {
            let n = from; const rs = fs.createReadStream(f.a, from ? { start: from } : undefined); abort = e => { rs.destroy(); ko(e); };
            rs.on('data', c => { n += c.length; sent += c.length; if (n > f.s) { rs.destroy(); return ko(new Error('fichier modifié pendant l’envoi')); } if (!sock.write(c)) { rs.pause(); sock.once('drain', () => rs.resume()); } tick({ tid: job.tid, role: 'send', key, done: sent, total: off.total, st: 'run' }); });
            rs.on('end', () => (n === f.s ? ok() : ko(new Error('fichier modifié pendant l’envoi')))); rs.on('error', ko);
          });
        }
        stop(); emit({ tid: job.tid, role: 'send', key, done: sent, total: off.total, st: 'done' }); try { sock.end(); } catch (e) { /* fermée */ }
      })().catch(e => { if (dead) return; stop(); emit({ tid: job.tid, role: 'send', key, done: sent, total: off.total, st: 'err', error: e.message }); try { sock.destroy(); } catch (x) { /* fermée */ } });
    },
    /** reçoit les fichiers d'une proposition de `key` dans received/<tid> ; expect = { count, size } annoncés par la carte. Résultat : { dir, items, count, total }.
        Une réception interrompue (réseau, ami déconnecté…) laisse un .part : le même appel REPREND là où elle s'était arrêtée. */
    fetch(key, tid, expect) {
      return new Promise((ok, ko) => {
        let dest, part; try { dest = destOf(tid); part = partOf(tid); } catch (e) { return ko(e); }
        if (!KEY.test(key) || !fr.isFriend(key)) return ko(new Error('Cette personne n’est pas dans tes amis.'));
        if (!fr.isOnline(key)) return ko(new Error('Ton ami n’est pas connecté : il doit avoir son launcher ouvert pour que tu reçoives les fichiers.'));
        if (jobs.has(tid)) return ko(new Error('Déjà en cours.'));
        let st0 = readState(tid, expect), rp = st0 && fs.existsSync(part) ? resumePoint(st0, part) : null;   // reprise possible ?
        fs.rmSync(dest, { recursive: true, force: true });
        if (!rp) { st0 = null; wipePart(tid); fs.mkdirSync(part, { recursive: true }); }
        else for (let k = rp.i + 1; k < st0.files.length; k++) fs.rmSync(path.resolve(part, ...st0.files[k].p.split('/')), { force: true });   // rien au-delà du point de reprise
        if (rp && rp.i >= st0.files.length) {   // tout était déjà là : il ne manquait que le rangement
          try { fs.renameSync(part, dest); fs.rmSync(stateOf(tid), { force: true }); } catch (e) { return ko(e); }
          emit({ tid, role: 'recv', key, done: st0.total, total: st0.total, st: 'done' }); return ok({ dir: dest, items: fs.readdirSync(dest), count: st0.files.length, total: st0.total });
        }
        let sock; try { sock = fr.openStream(key); } catch (e) { return ko(e); }
        let buf = Buffer.alloc(0), phase = 'head', files = [], total = 0, idx = 0, ws = null, left = 0, got = 0, idle = null, over = false, kept = !!rp, rs = null;   // kept : un .part reprenable existe (celui d'avant, ou celui qu'on vient d'ouvrir)
        const closes = [], tick = throttle();
        const done = (err, v) => {
          if (over) return; over = true; clearTimeout(idle); jobs.delete(tid); const w = ws; try { if (ws) ws.destroy(); } catch (e) { /* fermé */ } try { sock.destroy(); } catch (e) { /* fermée */ }
          /* On ne rend la main qu'une fois toutes les écritures réellement terminées : sinon une reprise lancée tout de suite lit une taille périmée sur le disque, puis une écriture en retard s'ajoute après elle (octets en double, fichier corrompu). */
          const idle2 = closes.map(c => c.catch(() => {})); if (w) idle2.push(new Promise(r => { if (w.closed) return r(); w.once('close', r); setTimeout(r, 3000).unref(); }));
          Promise.all(idle2).then(() => settle(err, v));
        };
        const settle = (err, v) => {
          if (err) { const keep = kept && !err.cancelled && !err.fatal; if (!keep) wipePart(tid); emit({ tid, role: 'recv', key, done: got, total, st: err.cancelled ? 'cancel' : 'err', error: err.message, resumable: keep }); ko(err); }
          else { emit({ tid, role: 'recv', key, done: total, total, st: 'done' }); ok(v); }
        };
        const fatal = msg => { const e = new Error(msg); e.fatal = true; return e; };   // l'autre refuse ou ment : inutile de garder ce qui a été reçu
        jobs.set(tid, { key, cancel: () => { const e = new Error('Annulé.'); e.cancelled = true; done(e); } });
        const arm = () => { clearTimeout(idle); idle = setTimeout(() => done(new Error('Ton ami ne répond plus (délai dépassé).')), L.idle); }; arm();
        const next = () => {   // ouvre le fichier suivant (les fichiers vides sont créés tout de suite) ; false = tout est reçu
          while (idx < files.length) {
            const f = files[idx], abs = path.resolve(part, ...f.p.split('/'));
            if (!abs.startsWith(part + path.sep)) { done(fatal('Chemin refusé.')); return false; }
            fs.mkdirSync(path.dirname(abs), { recursive: true });
            const here = rs && idx === rs.i, flags = here ? (rs.off > 0 ? 'a' : 'w') : 'wx';   // le fichier repris continue où il s'était arrêté
            if (f.s === 0) { fs.writeFileSync(abs, '', { flag: flags === 'a' ? 'w' : flags }); idx++; continue; }
            ws = fs.createWriteStream(abs, { flags }); ws.on('error', e => done(e)); left = f.s - (here ? rs.off : 0); return true;
          }
          return false;
        };
        let fin = false;   // tout est reçu : on attend seulement la fin des écritures (une fermeture du flux n'est plus une erreur)
        const finish = () => { fin = true; Promise.all(closes).then(() => { fs.renameSync(part, dest); fs.rmSync(stateOf(tid), { force: true }); done(null, { dir: dest, items: fs.readdirSync(dest), count: files.length, total }); }, e => done(e)).catch(e => done(e)); };
        const body = d => {
          while (d.length && !over) {
            if (!ws && !next()) return done(fatal('Trop de données reçues.'));
            const n = Math.min(left, d.length), chunk = d.subarray(0, n); d = d.subarray(n); left -= n; got += n;
            const w = ws, room = w.write(chunk);
            if (left === 0) { ws = null; idx++; closes.push(new Promise((r, j) => { w.on('error', j); w.end(r); })); if (!room) { sock.pause(); w.once('finish', () => sock.resume()); } }   // fichier terminé : « drain » ne viendra plus après end(), on repart à la fin de l'écriture
            else if (!room) { sock.pause(); w.once('drain', () => sock.resume()); }
          }
          if (over) return; if (!ws) next();   // fichiers vides restants
          if (!over && !ws && idx >= files.length && !fin) finish(); else if (got) tick({ tid, role: 'recv', key, done: got, total, st: 'run' });
        };
        sock.on('error', e => done(e)); sock.on('close', () => { if (!fin) done(new Error('Connexion fermée avant la fin du transfert.')); });
        sock.on('open', () => { try { sock.write(JSON.stringify({ t: 'xget', tid, ...(rp ? { rv: st0.v, ri: rp.i, ro: rp.off } : {}) }) + '\n'); } catch (e) { done(e); } });
        sock.on('data', d => {
          arm(); if (phase === 'body') return body(d);
          buf = Buffer.concat([buf, d]); if (buf.length > L.manifest) return done(fatal('Liste de fichiers démesurée.'));
          const i = buf.indexOf(10); if (i < 0) return; let m; try { m = JSON.parse(buf.subarray(0, i).toString('utf8')); } catch (e) { return done(fatal('Réponse illisible.')); }
          const rest = buf.subarray(i + 1); buf = Buffer.alloc(0);
          if (m && m.t === 'xerr') return done(m.e === 'occupé' ? new Error(fmtErr(m.e)) : fatal(fmtErr(m.e)));   // « occupé » passe : on pourra réessayer et reprendre
          try { ({ files, total } = checkManifest(m, expect)); } catch (e) { return done(fatal(e.message)); }
          const v = typeof m.v === 'string' && VER.test(m.v) ? m.v : null;
          // reprise acceptée seulement si l'expéditeur la confirme pour le même point, avec la même empreinte et la même liste ; sinon on repart de zéro
          if (rp && m.r && m.r.i === rp.i && m.r.o === rp.off && v === st0.v && JSON.stringify(files) === JSON.stringify(st0.files)) rs = rp;
          else if (rp) { wipePart(tid); fs.mkdirSync(part, { recursive: true }); kept = false; }
          idx = rs ? rs.i : 0; got = rs ? rs.base : 0;
          try { const fsz = fs.statfsSync(part); if (fsz.bavail * fsz.bsize < total - got + L.free) return done(new Error('Pas assez de place sur le disque.')); } catch (e) { /* statfs indisponible : on continue */ }
          if (v) { try { fs.writeFileSync(stateOf(tid), JSON.stringify({ v, files, at: now() })); kept = true; } catch (e) { /* pas de reprise possible, le transfert continue */ } }
          phase = 'body'; next(); body(rest);
        });
      });
    },
    /** ce qu'une réception interrompue a déjà reçu : { done, total } ou null (rien à reprendre) */
    partial(tid) { try { const st = readState(tid), part = partOf(tid); if (!st || !fs.existsSync(part)) return null; const r = resumePoint(st, part); return r ? { done: r.base, total: st.total } : null; } catch (e) { return null; } },
    /** abandonne une réception interrompue (efface le .part) */
    discard(tid) { destOf(tid); wipePart(tid); return true; },
    cancel(tid) { const j = jobs.get(tid); if (j) j.cancel(); return !!j; },
    /** dossier d'attente d'une réception terminée (pour « ouvrir le dossier » et « ajouter à une instance ») ; null s'il n'existe plus */
    received(tid) { const d = destOf(tid); try { return fs.statSync(d).isDirectory() ? { dir: d, items: fs.readdirSync(d).map(n => path.join(d, n)) } : null; } catch (e) { return null; } },
    forget(tid) { delete offers[tid]; saveOffers(); },
    active: () => active.size, offers: () => offers, purge,
  };
  return api;
};
exports.cleanRel = cleanRel; exports.checkManifest = checkManifest; exports.LIMITS = L;
