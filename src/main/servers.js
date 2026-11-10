const fs = require('fs'), path = require('path');
const store = require('./store'), plat = require('./platform'), nbt = require('./nbt');
const ADDR = /^[a-z0-9.-]{1,100}(:\d{1,5})?$/i, norm = a => String(a || '').toLowerCase().replace(/:25565$/, '');
/* Liste des serveurs + état en ligne. La page ne doit JAMAIS attendre le réseau : on répond tout de suite avec le dernier état connu (cache),
   et l'état est rafraîchi en arrière-plan (au plus toutes les 45 s par serveur). Un serveur jamais interrogé renvoie « loading: true » ; l'interface redemande peu après. */
const cache = new Map(), inflight = new Set(), TTL = 45000, key = a => String(a || '').toLowerCase();
/* Icônes sauvegardées sur disque (une par serveur, tant qu'il n'est pas supprimé) : si le serveur n'en renvoie plus (éteint, injoignable), on garde la dernière connue. */
const iconDir = () => path.join(plat.dataDir(), 'srv-icons'), iconFile = id => path.join(iconDir(), String(id).replace(/[^a-z0-9]/gi, '') + '.png');
const saved = new Map(); // id → data URL (lecture disque une seule fois)
const iconOf = id => { if (saved.has(id)) return saved.get(id); let u = ''; try { u = 'data:image/png;base64,' + fs.readFileSync(iconFile(id)).toString('base64'); } catch (e) {} saved.set(id, u); return u; };
const keepIcon = (id, url) => { if (!id || !url || saved.get(id) === url) return; saved.set(id, url); try { fs.mkdirSync(iconDir(), { recursive: true }); fs.writeFileSync(iconFile(id), Buffer.from(url.split(',')[1], 'base64')); } catch (e) {} };
async function probe(s) {
  const k = key(s.addr); if (inflight.has(k)) return; inflight.add(k);
  if (s.p2p) { // invitation privée : adresse locale (127.0.0.1), l'état vient du tunnel s'il est ouvert, sinon « inconnu » (pas de réveil réseau juste pour afficher la liste)
    try {
      if (!require('./p2p').isOpen(s.p2p)) cache.set(k, { t: Date.now(), d: { net: 'up', online: null, players: 0, max: 0, version: '', icon: '' } });
      else { const j = (await require('./slp').ping(s.addr, 12000)).json || {}; cache.set(k, { t: Date.now(), d: { net: 'up', online: true, players: j.players ? j.players.online : 0, max: j.players ? j.players.max : 0, version: (j.version && j.version.name) || '', icon: '' } }); }
    } catch (e) { cache.set(k, { t: Date.now() - TTL + 8000, d: { net: 'up', online: false, players: 0, max: 0, version: '', icon: '' } }); }
    finally { inflight.delete(k); }
    return;
  }
  try {
    const x = await (await fetch('https://api.mcsrvstat.us/3/' + s.addr, { headers: { 'User-Agent': 'Hydarium/0.1' }, signal: AbortSignal.timeout(6000) })).json();
    const ic = typeof x.icon === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(x.icon) && x.icon.length < 90000 ? x.icon : ''; if (ic && s.id) keepIcon(s.id, ic);
    cache.set(k, { t: Date.now(), d: { net: 'up', online: !!x.online, players: x.players ? x.players.online : 0, max: x.players ? x.players.max : 0, version: x.version || '', icon: typeof x.icon === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(x.icon) && x.icon.length < 90000 ? x.icon : '' } });
  } catch (e) { const old = cache.get(k); cache.set(k, { t: Date.now() - TTL + 8000, d: { ...(old ? old.d : { online: null }), net: 'down' } }); } // échec réseau : ancien état conservé, mais on le signale (« net: down » → icône sans wifi) // échec : on garde l'ancien état et on réessaie dans 8 s
  finally { inflight.delete(k); }
}
exports.list = async () => {
  const now = Date.now();
  return store.get().servers.map(s => {
    const c = cache.get(key(s.addr));
    if (!c || now - c.t > TTL) probe(s);
    const ic = iconOf(s.id); // dernière icône connue
    return c ? { ...s, ...c.d, icon: c.d.net === 'down' ? '' : (c.d.icon || ic) } : { ...s, online: null, loading: true, icon: ic };
  });
};
exports.warm = () => { store.get().servers.forEach(s => probe(s)); };
exports.add = ({ name, addr }) => {
  name = String(name || '').trim().slice(0, 40); addr = String(addr || '').trim();
  if (!name || !ADDR.test(addr)) throw new Error('Nom ou adresse invalide.');
  const d = store.get(); d.ignoredSrv = (d.ignoredSrv || []).filter(x => x !== norm(addr)); // ré-ajouté à la main : on ne l’ignore plus
  d.servers.push({ id: Date.now().toString(36), name, addr }); store.save();
};
/* Invitation privée (P2P) : « Mes serveurs » reçoit une entrée qui mène à un port LOCAL (127.0.0.1) relié à l'ami. Elle est ajoutée même si l'hôte n'est pas en ligne :
   on dit seulement s'il répond. Le code (secret) reste dans hydarium.json, jamais dans les journaux. */
exports.addP2p = async ({ name, code }) => {
  const p2p = require('./p2p'), pc = p2p.normalize(code); if (!pc) throw new Error('Code d’invitation invalide : il ressemble à HYD-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX.');
  const d = store.get(); if (d.servers.some(x => x.p2p === pc)) throw new Error('Cette invitation est déjà dans ta liste.');
  name = String(name || '').trim().slice(0, 40) || 'Serveur privé';
  const t = await p2p.test(pc), r = await p2p.join(pc, { avoid: (d.hosts || []).map(h => +h.port).filter(Boolean) }), addr = '127.0.0.1:' + r.port;
  const s = { id: Date.now().toString(36), name, addr, p2p: pc }; d.ignoredSrv = (d.ignoredSrv || []).filter(x => x !== norm(addr)); d.servers.push(s); store.save();
  return { id: s.id, reachable: !!t.ok, error: t.ok ? '' : t.error };
};
/* Retirer un serveur : son adresse est mémorisée comme « retirée » (sinon la synchronisation avec les instances le remettait aussitôt, tant qu'il figurait dans leur liste du jeu).
   alsoGame = true : on le retire aussi de la liste de serveurs du jeu (servers.dat de chaque instance ; si le jeu tourne, il réécrit ce fichier à sa fermeture). */
function removeFromGame(addr) {
  let n = 0;
  for (const i of store.get().instances) {
    const f = path.join(plat.dataDir(), 'instances', i.id, 'servers.dat');
    try {
      const r = nbt.parse(fs.readFileSync(f), true), l = r.v.get('servers'); if (!l) continue;
      const keep = l.v.a.filter(e => norm(e.get('ip') && e.get('ip').v) !== norm(addr)); if (keep.length === l.v.a.length) continue;
      l.v.a = keep; fs.copyFileSync(f, f + '.hydarium.bak'); fs.writeFileSync(f, require('zlib').gunzipSync(nbt.write(r))); n++;
    } catch (e) {}
  }
  return n;
}
exports.del = (id, alsoGame) => {
  const d = store.get(), s = d.servers.find(x => x.id === id); d.servers = d.servers.filter(x => x.id !== id);
  if (s) { try { fs.rmSync(iconFile(s.id), { force: true }); saved.delete(s.id); } catch (e) {} } // le serveur est supprimé : son icône aussi
  if (s && s.p2p) { try { require('./p2p').leaveCode(s.p2p); } catch (e) {} } // invitation privée : on ferme aussi son port local
  if (s) { d.ignoredSrv = [...new Set([...(d.ignoredSrv || []), norm(s.addr)])].slice(-300); if (alsoGame) removeFromGame(s.addr); }
  store.save();
};

/* serveurs ajoutés dans le jeu (servers.dat de chaque instance) : on les ajoute aussi à la liste du launcher */
exports.syncGame = () => {
  const d = store.get(); let n = 0; const have = new Set([...d.servers.map(s => norm(s.addr)), ...(d.ignoredSrv || [])]);
  for (const i of d.instances) {
    try {
      const r = nbt.parse(fs.readFileSync(path.join(plat.dataDir(), 'instances', i.id, 'servers.dat')), true), l = r.v.get('servers');
      if (!l) continue;
      for (const e of l.v.a) {
        const ip = e.get('ip') && e.get('ip').v, name = (e.get('name') && e.get('name').v) || ip;
        if (!ip || !ADDR.test(ip) || have.has(ip.toLowerCase().replace(/:25565$/, ''))) continue;
        d.servers.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 4), name: String(name).slice(0, 40), addr: ip, fromGame: i.name }); have.add(ip.toLowerCase().replace(/:25565$/, '')); n++;
      }
    } catch (e) {}
  }
  if (n) store.save(); return n;
};

exports.meta = (id, o) => { const s = store.get().servers.find(x => x.id === id); if (!s) throw new Error('Serveur introuvable.'); if (typeof o.fav === 'boolean') s.fav = o.fav;
  if (typeof o.name === 'string' && o.name.trim()) s.name = o.name.trim().slice(0, 40);
  if (typeof o.addr === 'string' && o.addr.trim() && o.addr.trim() !== s.addr) { const a = o.addr.trim(); if (!ADDR.test(a)) throw new Error('Adresse invalide : écris-la comme play.exemple.fr ou 192.168.1.10:25565.'); if (store.get().servers.some(x => x.id !== id && norm(x.addr) === norm(a))) throw new Error('Cette adresse existe déjà dans ta liste.'); s.addr = a; delete s.fromGame; store.get().ignoredSrv = (store.get().ignoredSrv || []).filter(x => x !== norm(a)); } if (typeof o.cat === 'string') s.cat = o.cat.trim().slice(0, 24);
  if (typeof o.inst === 'string') { if (o.inst && !store.get().instances.some(i => i.id === o.inst)) throw new Error('Instance introuvable.'); if (o.inst) s.inst = o.inst; else delete s.inst; } // instance lancée par défaut pour ce serveur (vide = automatique)
  store.save(); };
exports.move = (id, dir) => { const l = store.get().servers, i = l.findIndex(x => x.id === id), j = i + (dir < 0 ? -1 : 1); if (i < 0 || j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; store.save(); };
