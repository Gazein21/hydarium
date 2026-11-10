/* Détecte qu’on essaie de rejoindre, depuis le jeu, un serveur qui n’est pas compatible avec l’instance lancée (version, loader, mods),
   puis propose : lancer une instance compatible déjà présente, ou en créer une avec les mods nécessaires (page « join » du menu Hydarium).
   Deux déclencheurs, lus dans le journal du jeu : « Connecting to <hôte>, <port> » (le jeu se connecte) et les messages de refus du serveur. */
const log = require('./log');
const CONNECT = /Connecting to ([A-Za-z0-9._-]{1,100}), (\d{1,5})/;
/* Vrais refus du serveur seulement. Attention : Forge 1.8.9 écrit « Attempting connection with missing mods [minecraft, FML, forge] at SERVER » à CHAQUE connexion à un serveur non moddé (Hypixel…) :
   ce n’est PAS un refus. On retire ces lignes avant de chercher, et on n’accepte plus « Missing mods » tout seul. */
const REFUSED = /(Incompatible client|Outdated (?:server|client)|multiplayer\.disconnect\.(?:outdated|incompatible)|Unsupported protocol version|Incompatible mod set|Mismatched mod channel|mod rejections|Registry (?:sync|mismatch)|Missing required mods?)/i;
const VERSION_REFUSAL = /(Outdated (?:server|client)|multiplayer\.disconnect\.outdated|Unsupported protocol version|Incompatible client)/i; // refus qui ne parle que de version (pas de mods)
const NOISE = /(Attempting connection with missing mods|Server mod list|Handshake (?:complete|state)|\[FML\]: (?:Client|Server) (?:attempting|side))/i;
const refusal = s => String(s).split(/\r?\n/).filter(l => !NOISE.test(l)).join('\n');
const vnum = v => String(v).split('.').map(Number), cmp = (a, b) => { const x = vnum(a), y = vnum(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
const FAIL = /(Failed to connect|Connection (?:refused|timed out|reset)|Can't connect|Disconnecting from)/i;
let okT = null; // minuteur « connexion réussie »
const seen = new Map(); let last = ''; // addr → dernière alerte ; dernière adresse vue
const norm = (h, p) => (p && p !== '25565' ? h + ':' + p : h);

function incompatible(inst, p) {
  if (p.own && p.use) return false;
  if (p.range && p.range.length >= 2) { const s = p.range.slice().sort(cmp); if (cmp(inst.version, s[0]) < 0 || cmp(inst.version, s[s.length - 1]) > 0) return true; } // serveur « 1.8 – 1.21 » : on accepte toute version dans l’intervalle
  else if (p.version && p.version !== inst.version) return true;
  if (p.loader && p.loader !== 'vanilla' && inst.loader !== p.loader) return true;
  if (p.pack) return !require('./joiner').isPackInst(inst, p.pack); // serveur de modpack : l'instance doit être celle du pack
  return (p.mods || []).some(s => !(inst.mods || []).some(m => m.slug === s && !m.disabled));
}
async function check(inst, addr, refused, text) {
  addr = await require('./joiner').canon(addr);
  if (require('./autojoin').recent(addr)) return;
  const J = require('./joiner'); { const st = require('./store').get(), se = st.servers.find(x => x.addr === addr); if (!refused && se && se.inst && st.instances.some(i => i.id === se.inst)) return; } // la personne a choisi l’instance de ce serveur : on ne la dérange pas
  if (!refused && J.known(addr).some(i => i.id === inst.id)) return; // cette instance s’est déjà connectée à ce serveur : on ne la dérange pas
  const hint = /neoforge/i.test(text || '') ? 'neoforge' : /\bfml\b|\bforge\b/i.test(text || '') ? 'forge' : /quilt/i.test(text || '') ? 'quilt' : /fabric/i.test(text || '') ? 'fabric' : '', opts = { refused: !!refused, hint, soft: true };
  const key = inst.id + '|' + addr, t = seen.get(key) || 0;
  if (Date.now() - t < 10 * 60e3 && !refused) return; // pas de harcèlement : une alerte par serveur et par 10 minutes
  let p = null; try { p = await require('./joiner').plan(addr, opts); } catch (e) { log.warn('serveur incompatible ?', addr, e.message); }
  if (!p && !refused) return;
  /* On ne dérange la personne que si c’est VRAIMENT incompatible. Preuve par le ping : si le serveur accepte le protocole de cette version (serveurs multi-versions : Hypixel, ViaVersion…), on ne propose rien.
     Valable pour une simple détection (pas de refus) et pour un refus qui ne parle que de version ; un refus lié aux mods reste signalé. */
  if (!refused || VERSION_REFUSAL.test(text || '')) {
    const ok = await require('./joiner').supports(addr, inst.version);
    if (ok === true) { log.info('Serveur compatible (ping avec le protocole de ' + inst.version + ')', addr); return; }
    if (refused && p && !p.known && p.version && !incompatible(inst, p) && !p.mods.length && p.loader === 'vanilla') { log.info('Refus ignoré : la version de l’instance est dans celles du serveur', addr, inst.version); return; }
  }
  if (refused && J.known(addr).some(i => i.id === inst.id) && !VERSION_REFUSAL.test(text || '') && !/mod/i.test(refusal(text || ''))) return; // elle s’y est déjà connectée : un message vague ne suffit pas
  const otherKnown = !!(p && p.known && p.use && p.use.id !== inst.id); // une autre instance a déjà réussi sur ce serveur : on la lance quand même
  if (p && !refused && !otherKnown && !incompatible(inst, p)) return;
  if (Date.now() - (seen.get(key) || 0) < 60e3) return; seen.set(key, Date.now());
  const what = p ? `Ce serveur est en Minecraft ${p.version}${p.loader !== 'vanilla' ? ' (' + p.loader + ')' : ''}, ton instance en ${inst.version}.` : 'Le serveur a refusé la connexion (version ou mods).';
  log.info('Serveur incompatible', addr, what);
  require('./autojoin').run(addr, inst.id, opts); // écran de suivi par-dessus le jeu ; instance compatible lancée ou créée automatiquement
}
/* appelé pour chaque morceau de sortie du jeu */
exports.feed = (inst, chunk) => {
  try {
    const s = String(chunk), c = s.match(CONNECT);
    if (c) { last = norm(c[1], c[2]); clearTimeout(okT); const a = last; try { require('./stats').srvBegin(a); } catch (e) {} okT = setTimeout(() => { try { require('./joiner').markOk(a, inst.id); require('./stats').srvOk(); } catch (e) {} }, 20000); /* 20 s sans refus ni échec : la connexion a réussi, on s’en souvient */ if (/^(localhost|127\.0\.0\.1)$/i.test(c[1]) && !(require('./store').get().hosts || []).length) return; check(inst, last, false); }
    else if (last && REFUSED.test(refusal(s))) { clearTimeout(okT); try { require('./stats').srvAbort(); } catch (e) {} check(inst, last, true, refusal(s)); }
    else if (last && FAIL.test(s)) { clearTimeout(okT); try { require('./stats').srvAbort(); } catch (e) {} }
  } catch (e) { log.warn('détection de serveur', e.message); }
};
exports.reset = () => { clearTimeout(okT); last = ''; seen.clear(); };
