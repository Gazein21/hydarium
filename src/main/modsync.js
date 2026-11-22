/* Mods d'un serveur moddé que tu héberges → envoyés automatiquement aux amis qui le rejoignent avec Hydarium (par l'invitation privée P2P, voir p2p.js).

   Côté HÔTE (build) : la liste exacte des mods que le CLIENT doit avoir : nom, fichier, taille et empreinte SHA-1 (mods réservés au serveur exclus).
   Côté INVITÉ (fetch / plan / apply) :
   - la liste vient de l'hôte, donc elle n'est JAMAIS crue sur parole : validée champ par champ ; rien n'est écrit sur le disque avec un nom donné par l'hôte ;
   - l'invité ne télécharge RIEN depuis l'hôte : chaque mod est retrouvé sur Modrinth grâce à son empreinte (version_files), vérifié (bon projet, bonne version de Minecraft, bon loader,
     même empreinte) puis téléchargé depuis le CDN de Modrinth. Un fichier qui n'existe pas sur Modrinth (mod CurseForge, mod privé) est signalé « à installer toi-même » ;
   - l'invité confirme avant l'installation (l'interface montre la liste) : un mod est du code qui s'exécute, ne l'accepte que de quelqu'un en qui tu as confiance. */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const store = require('./store'), log = require('./log');

const MAX_MODS = 300, TTL = 5 * 60e3, LOADERS = ['fabric', 'quilt', 'forge', 'neoforge'];
const MC = /^1\.\d{1,2}(\.\d{1,2})?$/, PID = /^[A-Za-z0-9_-]{2,64}$/, SHA = /^[0-9a-f]{40}$/;
const mods = () => require('./mods');

/* ---------- empreintes (mises en cache selon la taille et la date : un gros dossier de mods n'est relu qu'une fois) ---------- */
const shaCache = new Map();
const sha1File = f => new Promise((ok, ko) => {
  let st; try { st = fs.statSync(f); } catch (e) { return ko(e); }
  const key = f + '|' + st.size + '|' + st.mtimeMs; if (shaCache.has(key)) return ok(shaCache.get(key));
  const h = crypto.createHash('sha1'), s = fs.createReadStream(f); s.on('data', d => h.update(d)); s.on('error', ko);
  s.on('end', () => { const r = h.digest('hex'); if (shaCache.size > 2000) shaCache.clear(); shaCache.set(key, r); ok(r); });
});

/* ---------- côté hôte ---------- */
const sides = new Map();   // pid → 'required' | 'optional' | 'unsupported' (côté client, d'après Modrinth)
async function clientSides(pids) {
  const need = [...new Set(pids.filter(p => /^[A-Za-z0-9]{8}$/.test(p) && !sides.has(p)))];
  for (let i = 0; i < need.length; i += 50) {
    const ids = need.slice(i, i + 50);
    try { for (const p of await mods().fetchJson(`${mods().MR}/projects?ids=${encodeURIComponent(JSON.stringify(ids))}`)) sides.set(p.id, p.client_side || ''); }
    catch (e) { /* hors ligne : on envoie tout, mieux vaut un mod en trop qu'un mod manquant */ }
  }
  return Object.fromEntries(pids.map(p => [p, sides.get(p) || '']));
}
const built = new Map();   // hostId → { key, t, man }
/** liste des mods que les invités doivent avoir ; null si le serveur n'existe pas. Serveur sans mods (Vanilla, Paper) : liste vide. */
exports.build = async hostId => {
  const h = (store.get().hosts || []).find(x => x.id === hostId); if (!h) return null;
  const loader = LOADERS.includes(h.loader) ? h.loader : 'vanilla', out = { v: 1, mc: String(h.version || ''), loader, name: String(h.name || '').slice(0, 40), mods: [] };
  if (loader === 'vanilla') return out;
  const list = (h.mods || []).filter(m => !m.disabled && m.file), key = list.map(m => m.pid + ':' + m.file).join('|'), c = built.get(hostId);
  if (c && c.key === key && Date.now() - c.t < 60e3) return c.man;   // plusieurs amis qui arrivent d'un coup : un seul calcul
  const dir = path.join(require('./host').dir(hostId), 'mods'), cs = await clientSides(list.map(m => m.pid));
  for (const m of list.slice(0, MAX_MODS)) {
    if (cs[m.pid] === 'unsupported') continue;   // mod réservé au serveur : le client n'en veut pas
    const f = path.join(dir, path.basename(m.file)); let st; try { st = fs.statSync(f); } catch (e) { continue; }
    try { out.mods.push({ pid: String(m.pid), title: String(m.title || m.slug || m.pid).slice(0, 80), file: path.basename(m.file), sha1: await sha1File(f), size: st.size }); } catch (e) { log.warn('liste des mods : fichier illisible', m.file); }
  }
  built.set(hostId, { key, t: Date.now(), man: out }); return out;
};

/* ---------- côté invité ---------- */
/** nettoie une liste reçue d'un hôte ; null si elle est inutilisable. Les entrées invalides sont écartées une à une. */
exports.validate = man => {
  if (!man || typeof man !== 'object' || man.v !== 1 || !MC.test(String(man.mc || '')) || !(man.loader === 'vanilla' || LOADERS.includes(man.loader)) || !Array.isArray(man.mods)) return null;
  const seen = new Set(), out = { v: 1, mc: man.mc, loader: man.loader, name: String(man.name || '').replace(/[\u0000-\u001f]/g, ' ').slice(0, 40), mods: [] };
  for (const m of man.mods.slice(0, MAX_MODS)) {
    if (!m || typeof m !== 'object' || !PID.test(String(m.pid || '')) || !SHA.test(String(m.sha1 || '')) || seen.has(m.sha1)) continue;
    const file = String(m.file || ''); if (!file || file !== path.basename(file) || file.length > 150 || !/\.jar$/i.test(file)) continue;
    seen.add(m.sha1); out.mods.push({ pid: m.pid, title: String(m.title || m.pid).replace(/[\u0000-\u001f]/g, ' ').slice(0, 80), file, sha1: m.sha1, size: Math.max(0, Math.min(+m.size || 0, 2e9)) });
  }
  return out;
};
const codeOf = c => require('./p2p').normalize(c);
const asked = new Map();   // code normalisé → { t, man }
/** liste des mods de l'hôte (validée), ou null (pas de liste, hôte injoignable, ancien Hydarium…). Jamais d'exception : rejoindre doit marcher sans. */
exports.fetch = async (code, force) => {
  const c = codeOf(code); if (!c) return null; const e = asked.get(c);
  if (!force && e && Date.now() - e.t < TTL) return e.man;
  try { const man = exports.validate(await require('./p2p').fetchMods(c)); asked.set(c, { t: Date.now(), man }); return man; }
  catch (err) { log.warn('liste des mods de l’hôte indisponible', String(err && err.message || err)); return null; }
};
/** liste mémorisée (utilisée par plan / apply : l'interface ne renvoie JAMAIS elle-même une liste de mods à installer) */
exports.cached = code => { const e = asked.get(codeOf(code)); return e && Date.now() - e.t < TTL * 2 ? e.man : null; };
exports._set = (code, man) => asked.set(codeOf(code), { t: Date.now(), man });

const modsDir = id => path.join(mods().dirOf(id), 'mods');
const onDisk = (id, m) => path.join(modsDir(id), m.file + (m.disabled ? '.disabled' : ''));
/** état de chaque mod demandé dans l'instance : ok · disabled (présent mais désactivé) · differs (autre version du même mod) · missing */
exports.states = async (inst, man) => {
  const have = new Map();
  for (const m of inst.mods || []) { try { have.set(await sha1File(onDisk(inst.id, m)), m); } catch (e) { /* fichier absent */ } }
  return man.mods.map(r => { const m = have.get(r.sha1); return { ...r, state: m ? (m.disabled ? 'disabled' : 'ok') : (inst.mods || []).some(x => x.pid === r.pid && !/^imp/.test(x.pid)) ? 'differs' : 'missing', have: m || null }; });
};
/** aperçu pour l'interface : ce qu'il faudrait installer / changer dans cette instance */
exports.plan = async (instId, code) => {
  const man = exports.cached(code); if (!man || !man.mods.length) return null;
  const inst = mods().find(instId), st = await exports.states(inst, man), todo = st.filter(x => x.state !== 'ok');
  return { mc: man.mc, loader: man.loader, total: st.length, todo: todo.length, items: todo.slice(0, 40).map(x => ({ title: x.title, state: x.state })) };
};

const UA = { 'User-Agent': 'Hydarium/0.10 (help@hydarium.net)' };
const eachBatch = (a, n) => { const r = []; for (let i = 0; i < a.length; i += n) r.push(a.slice(i, i + n)); return r; };
/** installe / remplace / active ce qu'il faut pour que l'instance ait exactement les mods du serveur.
    Renvoie { installed, replaced, enabled, manual: [{ title }], failed: [{ title, why }] } ; ne lève pas pour un mod isolé. */
exports.apply = async (instId, code, onStep) => {
  const man = exports.cached(code); if (!man) throw new Error('La liste des mods du serveur n’est plus disponible : relance « Rejoindre ».');
  const inst = mods().find(instId), res = { installed: [], replaced: [], enabled: [], manual: [], failed: [] };
  if (inst.loader !== man.loader || inst.version !== man.mc) throw new Error('Cette instance n’est pas en ' + man.loader + ' ' + man.mc + ' comme le serveur.');
  const st = await exports.states(inst, man), todo = st.filter(x => x.state !== 'ok'), say = t => { try { onStep && onStep(t); } catch (e) { /* affichage seulement */ } };
  for (const x of todo.filter(y => y.state === 'disabled')) { try { await mods().toggle(instId, x.have.pid); res.enabled.push(x.title); } catch (e) { res.failed.push({ title: x.title, why: e.message }); } }
  const fetchList = todo.filter(y => y.state === 'missing' || y.state === 'differs');
  if (fetchList.length) {
    say('Recherche des mods sur Modrinth…');
    const found = {}; for (const part of eachBatch(fetchList.map(x => x.sha1), 100)) Object.assign(found, await mods().post(`${mods().MR}/version_files`, { hashes: part, algorithm: 'sha1' }).catch(() => ({})));
    const pids = [...new Set(Object.values(found).map(v => v.project_id).filter(p => /^[A-Za-z0-9]{8}$/.test(p)))], proj = {};
    for (const part of eachBatch(pids, 50)) { try { for (const p of await mods().fetchJson(`${mods().MR}/projects?ids=${encodeURIComponent(JSON.stringify(part))}`)) proj[p.id] = p; } catch (e) { /* titres seulement */ } }
    let n = 0;
    for (const x of fetchList) {
      say('Installation de « ' + x.title + ' » (' + (++n) + '/' + fetchList.length + ')…');
      const v = found[x.sha1];
      if (!v) { res.manual.push({ title: x.title }); continue; }   // pas sur Modrinth (CurseForge, mod privé) : à installer à la main
      try {
        if (!(v.loaders || []).includes(inst.loader) || !(v.game_versions || []).includes(inst.version)) throw new Error('version non compatible avec ' + inst.loader + ' ' + inst.version);
        const f = (v.files || []).find(y => y.hashes && y.hashes.sha1 === x.sha1); if (!f || !/\.jar$/i.test(f.filename || '')) throw new Error('fichier introuvable chez Modrinth');
        const name = path.basename(f.filename); if (name !== f.filename) throw new Error('nom de fichier invalide');
        await mods().download(f.url, path.join(modsDir(instId), name), x.sha1);   // refuse tout hôte hors Modrinth et tout fichier dont l'empreinte diffère
        const old = (inst.mods || []).find(m => m.pid === x.pid || m.pid === v.project_id), p = proj[v.project_id] || {};
        if (old) { if (old.file !== name) fs.rmSync(onDisk(instId, old), { force: true }); inst.mods = inst.mods.filter(m => m !== old); res.replaced.push(x.title); } else res.installed.push(x.title);
        inst.mods.push({ pid: v.project_id, slug: p.slug || '', title: p.title || x.title, file: name, vid: v.id, incompat: [], deps: [], auto: false, pin: true, icon: (p.icon_url || '').startsWith('https://cdn.modrinth.com/') ? p.icon_url : '' });   // « figé » : exactement la version du serveur
        store.save();
      } catch (e) { res.failed.push({ title: x.title, why: String(e && e.message || e).slice(0, 120) }); }
    }
  }
  store.save(); return res;
};
exports._reset = () => { shaCache.clear(); sides.clear(); built.clear(); asked.clear(); };
