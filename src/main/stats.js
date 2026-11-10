/* Statistiques : suivi par le launcher (lancements, connexions, jours, temps de jeu), lecture des statistiques de Minecraft dans les mondes solo,
   et suivi des SERVEURS à partir de l’état envoyé par le mod (temps passé, distance, morts).
   Tout est gardé dans le launcher : supprimer une instance ne fait rien perdre (bank()). Une instance importée ne compte que ce qui s’y joue APRÈS l’import (statBase). */
const fs = require('fs'), path = require('path');
const store = require('./store'), plat = require('./platform');
const dayKey = (t = new Date()) => t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
const ZERO = () => ({ deaths: 0, mobKills: 0, jumps: 0, distanceKm: 0, blocksMined: 0, itemsCrafted: 0, damageDealt: 0, worldHours: 0 });
const KEYS = Object.keys(ZERO());
const S = () => {
  const d = store.get(), s = d.stats = d.stats || { launches: 0, crashes: 0, joins: 0, servers: {}, days: {}, longest: 0 };
  if (s.playSecs === undefined) { s.playSecs = d.instances.reduce((a, i) => a + (i.playtime || 0), 0); s.perInst = {}; for (const i of d.instances) if (i.playtime) s.perInst[i.id] = { name: i.name, secs: i.playtime }; } // reprise de l’existant, une seule fois
  s.perInst = s.perInst || {}; s.banked = s.banked || ZERO(); s.srv = s.srv || { secs: 0, deaths: 0, distance: 0, per: {} };
  return s;
};
exports.onLaunch = (inst, server) => { const s = S(); s.launches++; if (server) { s.joins++; const a = String(server).toLowerCase(); s.servers[a] = (s.servers[a] || 0) + 1; } store.save(); };
exports.onClose = (secs, crashed, inst) => {
  const st0 = store.get().stats, fresh = !st0 || st0.playSecs === undefined; // première fois : la reprise de l’existant contient déjà cette session
  const s = S(), k = dayKey(); if (fresh) { s.playSecs -= secs; if (inst && s.perInst[inst.id]) s.perInst[inst.id].secs -= secs; }
  s.days[k] = (s.days[k] || 0) + secs; if (secs > s.longest) s.longest = secs; if (crashed) s.crashes++;
  s.playSecs += secs; if (inst && inst.id) { const p = s.perInst[inst.id] = s.perInst[inst.id] || { name: inst.name, secs: 0 }; p.name = inst.name; p.secs += secs; }
  const keys = Object.keys(s.days).sort(); while (keys.length > 90) delete s.days[keys.shift()]; srvEnd(); store.save();
};
const ls = d => { try { return fs.readdirSync(d); } catch (e) { return []; } };
const sum = o => Object.values(o || {}).reduce((a, b) => a + (+b || 0), 0);
const base = id => path.join(plat.dataDir(), 'instances', id);

/* statistiques Minecraft des mondes solo d’une instance (fichiers stats/ de chaque monde) */
const worldStats = id => {
  const o = { ...ZERO(), worlds: 0 };
  for (const w of ls(path.join(base(id), 'saves'))) {
    const sd = path.join(base(id), 'saves', w); if (!fs.existsSync(path.join(sd, 'level.dat'))) continue; o.worlds++;
    for (const f of ls(path.join(sd, 'stats'))) {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(sd, 'stats', f), 'utf8')), st = j.stats || {}, c = st['minecraft:custom'] || {};
        if (j.stats) {
          o.deaths += +c['minecraft:deaths'] || 0; o.mobKills += +c['minecraft:mob_kills'] || sum(st['minecraft:killed']); o.jumps += +c['minecraft:jump'] || 0;
          o.distanceKm += Object.entries(c).filter(([k]) => /_one_cm$/.test(k)).reduce((a, [, v]) => a + (+v || 0), 0) / 100000;
          o.blocksMined += sum(st['minecraft:mined']); o.itemsCrafted += sum(st['minecraft:crafted']); o.damageDealt += (+c['minecraft:damage_dealt'] || 0) / 10;
          o.worldHours += ((+c['minecraft:play_time'] || +c['minecraft:play_one_minute'] || 0) / 20) / 3600;
        } else { // ancien format (1.12 et avant, 1.8.9 compris) : clés « stat.xxx », parfois sous forme d’objet { value }
          const num = v => (v && typeof v === 'object' ? +v.value || 0 : +v || 0), ent = Object.entries(j), by = re => ent.filter(([k]) => re.test(k)).reduce((a, [, v]) => a + num(v), 0);
          o.deaths += num(j['stat.deaths']); o.mobKills += num(j['stat.mobKills']); o.jumps += num(j['stat.jump']); o.distanceKm += by(/^stat\.\w+OneCm$/) / 100000;
          o.blocksMined += by(/^stat\.mineBlock\./); o.itemsCrafted += by(/^stat\.craftItem\./); o.damageDealt += num(j['stat.damageDealt']) / 10; o.worldHours += (num(j['stat.playOneMinute']) / 20) / 3600;
        }
      } catch (e) {}
    }
  }
  return o;
};
/* ce que l’instance a apporté depuis sa création dans le launcher : stats des mondes − stats déjà présentes à l’import */
const netStats = i => { const w = worldStats(i.id), b = i.statBase || {}, o = { worlds: w.worlds }; for (const k of KEYS) o[k] = Math.max(0, w[k] - (+b[k] || 0)); return o; };
/* à appeler juste après l’import d’une instance (dossiers copiés) : ses stats existantes ne comptent pas */
exports.markImported = id => { const i = store.get().instances.find(x => x.id === id); if (!i) return; const w = worldStats(id), b = {}; for (const k of KEYS) b[k] = w[k]; i.statBase = b; i.imported = true; store.save(); };
/* à appeler AVANT de supprimer une instance : ses statistiques passent dans le cumul du launcher */
exports.bank = id => {
  const i = store.get().instances.find(x => x.id === id); if (!i) return; const s = S(), n = netStats(i);
  for (const k of KEYS) s.banked[k] += n[k];
  const p = s.perInst[id] = s.perInst[id] || { name: i.name, secs: 0 }; p.name = i.name; p.gone = true; store.save();
};

/* ===== serveurs : temps passé, distance, morts (état envoyé par le mod toutes les 250 ms) ===== */
let sv = null, lastFlush = 0, wallT = null;
/* sans le mod (version non construite), aucun état n’arrive : le temps passé sur le serveur est alors compté à l’horloge ; avec le mod, seuls les moments où le joueur est dans un monde comptent */
const wallTick = () => { if (sv && sv.ok && !sv.seen) { const n = Date.now(); sv.secs += Math.min(120, (n - sv.w) / 1000); sv.w = n; } };
const flush = () => {
  wallTick();
  if (!sv || !sv.ok || !(sv.secs || sv.dist || sv.deaths)) return;
  const g = S().srv, p = g.per[sv.addr] = g.per[sv.addr] || { secs: 0, deaths: 0, distance: 0 };
  g.secs += sv.secs; g.deaths += sv.deaths; g.distance += sv.dist; p.secs += sv.secs; p.deaths += sv.deaths; p.distance += sv.dist;
  sv.secs = 0; sv.deaths = 0; sv.dist = 0; store.save();
};
exports.srvBegin = addr => { srvEnd(); sv = { addr: String(addr).toLowerCase(), ok: false, t: Date.now(), w: Date.now(), seen: false, secs: 0, dist: 0, deaths: 0, p: null }; }; // le jeu se connecte
exports.srvOk = () => { if (sv) { sv.ok = true; flush(); clearInterval(wallT); wallT = setInterval(flush, 60000); if (wallT.unref) wallT.unref(); } };                                                                                      // pas de refus : la connexion a marché
exports.srvAbort = () => { clearInterval(wallT); sv = null; };                                                                                                          // refus ou échec : rien n’est compté
const srvEnd = () => { clearInterval(wallT); if (sv) { flush(); sv = null; } };
exports.srvEnd = srvEnd;
exports.onState = b => {
  if (!sv) return; const now = Date.now(); if (!sv.seen) { sv.seen = true; sv.w = now; sv.secs = 0; } sv.secs += Math.min(2, (now - sv.t) / 1000); sv.t = now;
  const x = +b.x, z = +b.z, hp = +b.hp, dim = String(b.dim || '');
  if (Number.isFinite(x) && Number.isFinite(z)) {
    if (sv.p && sv.p.dim === dim) { const d = Math.hypot(x - sv.p.x, z - sv.p.z); if (d > 0 && d < 20) sv.dist += d / 1000; } // les téléportations (grands sauts) et les changements de dimension ne comptent pas
    const dead = Number.isFinite(hp) && hp <= 0; if (sv.p && dead && !sv.p.dead) sv.deaths++; sv.p = { x, z, dim, dead };
  }
  if (now - lastFlush > 30000) { lastFlush = now; flush(); }
};

exports.get = () => {
  const d = store.get(), s = S(), insts = d.instances, sg = s.srv;
  const o = { launches: s.launches, crashes: s.crashes, joins: s.joins, longest: s.longest, serversJoined: Object.keys(s.servers).length, instances: insts.length, loaders: {}, mods: 0, modsDistinct: new Set(insts.flatMap(i => i.mods.map(m => m.slug))).size, screenshots: 0, worlds: 0, resourcepacks: 0, shaders: 0, serversSaved: d.servers.length, hosts: (d.hosts || []).length, ...ZERO(), favorite: null, totalSecs: s.playSecs };
  const top = Object.entries(s.perInst).map(([id, p]) => ({ name: p.name, secs: p.secs, gone: !insts.some(i => i.id === id) })).filter(p => p.secs > 0).sort((a, b) => b.secs - a.secs);
  o.top = top.slice(0, 5); if (top[0]) o.favorite = { name: top[0].name, secs: top[0].secs };
  o.topServers = [...new Set([...Object.keys(s.servers), ...Object.keys(sg.per)])].map(addr => ({ addr, n: s.servers[addr] || 0, secs: Math.round((sg.per[addr] || {}).secs || 0) })).sort((a, b) => (b.secs - a.secs) || (b.n - a.n)).slice(0, 5);
  for (const k of KEYS) o[k] = s.banked[k]; // cumul des instances supprimées
  for (const i of insts) {
    o.loaders[i.loader] = (o.loaders[i.loader] || 0) + 1; o.mods += i.mods.length;
    o.screenshots += ls(path.join(base(i.id), 'screenshots')).filter(f => /\.(png|jpe?g)$/i.test(f)).length;
    o.resourcepacks += ls(path.join(base(i.id), 'resourcepacks')).length; o.shaders += ls(path.join(base(i.id), 'shaderpacks')).length;
    const n = netStats(i); o.worlds += n.worlds; for (const k of KEYS) o[k] += n[k];
  }
  wallTick(); o.srvSecs = Math.round(sg.secs + (sv && sv.ok ? sv.secs : 0)); o.srvDeaths = sg.deaths + (sv && sv.ok ? sv.deaths : 0); o.srvKm = sg.distance + (sv && sv.ok ? sv.dist : 0);
  o.deaths += o.srvDeaths; o.distanceKm += o.srvKm; // morts et distance : solo + serveurs
  const days = []; for (let k = 13; k >= 0; k--) { const t = new Date(); t.setDate(t.getDate() - k); const key = dayKey(t); days.push({ d: key.slice(5), secs: s.days[key] || 0 }); }
  o.days = days; o.distanceKm = Math.round(o.distanceKm * 10) / 10; o.srvKm = Math.round(o.srvKm * 10) / 10; o.worldHours = Math.round(o.worldHours * 10) / 10; o.damageDealt = Math.round(o.damageDealt);
  return o;
};
