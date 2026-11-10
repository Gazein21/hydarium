/* Rejoindre un serveur depuis le jeu avec la bonne instance.
   Les serveurs ne donnent pas leur version de façon fiable : Hydarium ne CRÉE donc JAMAIS d’instance tout seul.
   - une instance a déjà réussi à se connecter à ce serveur → elle est relancée sur le serveur, même si rien ne prouve qu’elle est « compatible » ;
   - une instance compatible existe                         → le jeu en cours est fermé et elle est lancée directement sur le serveur ;
   - sinon                                                  → on DEMANDE : « est-ce un serveur Vanilla ? » (+ la version). Si oui, une instance Fabric avec le mod Hydarium est créée ;
                                                              si non, rien n’est créé (la personne crée l’instance ou importe le modpack elle-même).
   L’écran (page « join » du menu Hydarium) suit l’avancement ; « Annuler » reste possible avant la fermeture du jeu. */
const joiner = require('./joiner'), log = require('./log');
let S = null, cancelled = false, answerer = null, sendFn = () => {};
const push = patch => { S = { ...S, ...patch }; try { require('./overlay').open('join', S.inst, { addr: S.addr }); } catch (e) {} };
exports.state = () => S;
exports.recent = a => !!(S && S.addr === a && S.t && Date.now() - S.t < 180000); // évite de relancer la procédure juste après un changement d’instance
exports.init = send => { sendFn = send; };
exports.cancel = () => { cancelled = true; if (answerer) { answerer(null); answerer = null; } if (S && S.state !== 'launching') S = { ...S, state: 'idle' }; require('./overlay').close(); };
exports.answer = a => { if (answerer) { answerer(a || null); answerer = null; } }; // { vanilla: true|false, version }
exports.confirm = () => {}; // ancien canal (mods non vérifiés) : plus de création automatique, donc plus de confirmation
const wait = ms => new Promise(r => setTimeout(r, ms));

exports.run = async (addr, instId, opts) => {
  if (S && ['working', 'ask', 'launching'].includes(S.state)) return;
  cancelled = false; S = { addr, inst: instId, state: 'working', text: 'Analyse du serveur…', log: [], t: Date.now() };
  const say = (text, extra) => { S.log.push(text); push({ text, ...extra }); };
  push({});
  try {
    const p = await joiner.plan(addr, { ...(opts || {}), soft: true }); if (cancelled) return;
    if (opts && opts.refused && p.use && p.use.id === instId) throw new Error('Le serveur refuse cette instance, mais je ne peux pas deviner ce qu’il demande (loader, mods). Ouvre Serveurs › Configurer pour l’indiquer, puis réessaie.');
    S.plan = { version: p.version, loader: p.loader, mods: p.mods, name: p.server.name };
    const game = require('./game'); let id = p.use && p.use.id, name = p.use && p.use.name;
    if (id) say(p.preferred ? `Instance par défaut de ce serveur : « ${name} ».` : p.known ? `Tu t’es déjà connecté à ce serveur avec « ${name} » : je la relance.` : `Instance compatible trouvée : « ${name} » (Minecraft ${p.version}${p.loader !== 'vanilla' ? ', ' + p.loader : ''}).`);
    else {
      const modded = p.loader !== 'vanilla' || !!p.pack || (p.modCount || 0) > 0, def = p.version || (p.releases && p.releases[0]) || '';
      const versions = [...new Set([...(p.range && p.range.length ? p.range : []), ...(p.version ? [p.version] : []), ...(p.releases || [])])].slice(0, 40);
      push({ state: 'ask', ask: { versions, version: def, modded, known: !!p.version },
        text: modded ? 'Ce serveur semble moddé : je ne peux pas deviner ses mods, donc je ne crée rien tout seul.' : 'Je ne peux pas connaître la version exacte de ce serveur, donc je ne crée pas d’instance tout seul.' });
      const a = await new Promise(r => { answerer = r; }); if (!a || cancelled) { S = { ...S, state: 'idle' }; return; }
      if (!a.vanilla) { push({ state: 'info', text: 'D’accord, je ne crée rien. Crée une instance avec la bonne version (et les bons mods), ou importe le modpack du serveur, puis rejoins-le depuis le jeu : Hydarium s’en souviendra.' }); return; }
      say(`Création de l’instance (Minecraft ${a.version}, Fabric + mod Hydarium)…`);
      const n = await joiner.createVanilla(addr, a.version, p.server.name); if (cancelled) return;
      id = n.id; name = n.name; S.created = name; S.failed = n.failedMods || []; sendFn('inst:changed', id);
    }
    if (cancelled) return;
    say(`Fermeture du jeu en cours puis lancement de « ${name} » sur ${addr}…`, { state: 'launching' }); await wait(1200); if (cancelled) { S = { ...S, state: 'idle' }; return; }
    await game.stop();
    const pr = await game.play(id, sendFn, { server: addr, confirm: true }); // confirm : sans lui, game.play renvoie un avertissement (mods non vérifiés) et ne lance RIEN
    if (pr && pr.warn) throw new Error('Lancement refusé : ' + pr.warn.slice(0, 2).join(' · '));
    push({ state: 'done', text: S.created ? `Instance « ${S.created} » créée et lancée sur ${addr}.` + (S.failed && S.failed.length ? ' Mods non ajoutés : ' + S.failed.join(', ') + '.' : '') : `« ${name} » lancée sur ${addr}.` });
    try { new (require('electron').Notification)({ title: S.created ? 'Instance créée' : 'Instance lancée', body: S.text, icon: require('path').join(__dirname, '../../build/icon.png') }).show(); } catch (e) {}
    setTimeout(() => { if (S && S.state === 'done') require('./overlay').close(); }, 3500);
  } catch (e) { log.warn('autojoin', e.message); push({ state: 'error', text: e.message }); }
};
