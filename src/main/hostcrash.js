/* Assistant de crash pour les serveurs hébergés : pourquoi le serveur s'est arrêté, quel mod / data pack / réglage est en cause, et des boutons pour réparer.
   S'appuie sur l'analyseur du jeu (crash.js : Java, mémoire, mods, dépendances…) et ajoute les causes propres aux serveurs :
   CLUF non accepté, port déjà pris, data pack fautif, monde illisible ou trop récent, mod réservé au client, watchdog (serveur figé), serveur.jar abîmé, plugin Paper. */
const fs = require('fs'), path = require('path');
const crash = require('./crash');

const NO_RUN_LOG = 'Le serveur s’est arrêté pendant son démarrage.';
const JAR_TYPES = ['vanilla', 'paper', 'fabric'];   // serveur.jar retéléchargeable ; Forge / NeoForge passent par leur installateur
const tail = (lines, n) => (lines || []).slice(-n);
const A = {
  retry: { id: 'retry', label: 'Relancer le serveur', primary: true },
  eula: { id: 'eula', label: 'Accepter le CLUF de Minecraft et relancer', primary: true },
  port: { id: 'port', label: 'Choisir un autre port libre et relancer', primary: true },
  lvold: { id: 'lvold', label: 'Restaurer la copie de secours du monde (level.dat_old) et relancer', primary: true },
  jar: { id: 'jar', label: 'Retélécharger le serveur et relancer', primary: true },
  mem: n => ({ id: 'mem', v: String(n), label: 'Passer à ' + n + ' Go et relancer', primary: true }),
  dpoff: n => ({ id: 'dpoff', v: n, label: 'Désactiver « ' + n.replace(/\.zip$/i, '') + ' » et relancer', primary: true }),
  dprm: n => ({ id: 'dprm', v: n, label: 'Retirer « ' + n.replace(/\.zip$/i, '') + ' » et relancer' }),
  moddis: m => ({ id: 'moddis', v: m.pid, label: 'Désactiver « ' + m.title + ' » et relancer', primary: true }),
};

/** Analyse. h : le serveur ({ type, version, mem, port, mods }), text : fin du journal + rapport de plantage, ctx : { code, secs, packs: [noms], newestPack, hasLevel, levelOld }.
    Renvoie { kind, title, hint, mods, missing, install, actions } comme crash.analyze */
exports.analyze = (h, text, ctx = {}) => {
  const t = String(text || ''), mem = h.mem || 2, packs = ctx.packs || [];
  const base = crash.analyze({ id: h.id, mods: h.mods || [], mem, version: h.version, java: '' }, t, ctx);
  const out = (kind, title, hint, actions = [], extra = {}) => ({ kind, title, hint, mods: [], missing: [], install: [], actions, ...extra });
  let m;

  if (/You need to agree to the EULA|agree to the Minecraft EULA|eula=false/i.test(t)) return out('eula', 'CLUF de Minecraft non accepté', 'Minecraft refuse de démarrer un serveur tant que le CLUF (minecraft.net/eula) n’est pas accepté dans eula.txt. En acceptant ici, tu confirmes avoir lu et accepté ce contrat.', [A.eula]);

  if (/Failed to bind to port|FAILED TO BIND TO PORT|Address already in use|java\.net\.BindException|Port \d+ is already in use/i.test(t)) {
    const p = (m = t.match(/(?:port|Port)[^\d\n]{0,12}(\d{4,5})/)) ? +m[1] : h.port;
    return out('port', 'Port déjà utilisé', `Le port ${p} est déjà pris : un autre serveur Minecraft (peut-être une copie encore ouverte) ou un autre programme l’utilise. Ferme-le, ou change de port.`, [A.port, A.retry]);
  }

  if (/Failed to load datapacks|Couldn't load data pack|Failed to load data pack|Parsing error loading recipe|Couldn't parse data file|Failed to reload datapacks|Failed to load registries due to above errors|Failed to initialize datapack/i.test(t)) {
    const low = t.toLowerCase(), seen = new Set(packs.filter(p => low.includes('file/' + p.toLowerCase())));   // le journal écrit « file/<nom du fichier> » (noms avec espaces possibles)
    let culprits = [...seen]; if (!culprits.length && ctx.newestPack) culprits = [ctx.newestPack];   // le nom n'est pas dans le journal : le plus probable est le dernier ajouté
    const acts = []; for (const n of culprits.slice(0, 3)) { if (ctx.hasLevel) acts.push(A.dpoff(n)); acts.push(A.dprm(n)); }
    return out('datapack', 'Un data pack empêche le démarrage', culprits.length ? 'Le serveur n’arrive pas à charger : ' + culprits.map(n => '« ' + n + ' »').join(', ') + (seen.size ? '' : ' (le dernier ajouté, le journal ne nomme pas le fautif)') + '. Souvent un data pack fait pour une autre version de Minecraft.' : 'Un data pack est invalide ou fait pour une autre version de Minecraft. Regarde le journal pour son nom, puis retire-le dans « Data packs du serveur ».', acts);
  }

  if (/was saved in a newer version|created in a newer version|world was last played in a newer|Downgrading|Cannot downgrade|Unable to load world data[^\n]{0,80}newer/i.test(t)) return out('newer', 'Monde créé avec une version plus récente de Minecraft', `Ce monde a été enregistré par une version de Minecraft plus récente que ${h.version}. Un serveur ne peut pas ouvrir un monde plus récent que lui : crée un serveur avec une version égale ou supérieure, ou restaure une sauvegarde du monde.`);

  if (/Failed to load level|Failed to read level\.dat|Exception reading [^\n]*level\.dat|Not in GZIP format|Chunk file at [^\n]* is in the wrong location|Failed to load world|Encountered an unexpected exception[\s\S]{0,500}(?:level\.dat|\.mca|region)/i.test(t))
    return out('world', 'Monde illisible ou corrompu', 'Le fichier du monde (level.dat ou une région) est abîmé, souvent après un arrêt brutal ou un disque plein.' + (ctx.levelOld ? ' Minecraft garde une copie de secours : tu peux la restaurer.' : ' Aucune copie de secours (level.dat_old) trouvée : restaure une sauvegarde du monde.'), ctx.levelOld ? [A.lvold] : []);

  if (/Unable to access jarfile|Invalid or corrupt jarfile|Error: Unable to initialize main class|Could not find or load main class|java\.util\.zip\.ZipException: (?:invalid|error in opening)|server\.jar.{0,40}(?:corrupt|not found)/i.test(t))
    return out('jar', 'Fichier du serveur manquant ou corrompu', 'Le fichier server.jar est introuvable ou abîmé (téléchargement interrompu, antivirus).' + (JAR_TYPES.includes(h.type) ? '' : ' Pour ce type de serveur, recrée-le depuis son installateur.'), JAR_TYPES.includes(h.type) ? [A.jar] : []);

  if (/A single server tick took [\d.]+ seconds|The server has stopped responding|Considering it to be crashed|server will forcibly shutdown/i.test(t)) {
    const acts = []; if (mem < 16) acts.push(A.mem(Math.min(16, mem + 2))); acts.push(A.retry);
    return out('watchdog', 'Le serveur ne répondait plus (watchdog)', 'Un tour du serveur a duré beaucoup trop longtemps et Minecraft l’a arrêté. Causes fréquentes : mémoire insuffisante, génération de très nombreux chunks, un mod ou un plugin trop lourd, ou un PC saturé.', acts, { mods: base.mods });
  }

  if (/Attempted to load class (?:net\/minecraft\/client|com\/mojang\/blaze3d)|Environment type CLIENT|ClassNotFoundException: net\.minecraft\.client|invalid dist DEDICATED_SERVER|Cannot load class [^\n]{0,60}(?:client|Client)|Mod [^\n]{0,60} is client-side only|client[- ]only mod/i.test(t)) {
    const cul = base.mods.slice(0, 2), acts = cul.map(A.moddis);
    return out('clientmod', 'Un mod réservé au client', cul.length ? 'Un mod conçu uniquement pour le jeu (client) a été mis sur le serveur : ' + cul.map(x => '« ' + x.title + ' »').join(', ') + '. Désactive-le : les joueurs peuvent le garder de leur côté.' : 'Un mod conçu uniquement pour le jeu (affichage, minimap, shaders…) a été mis sur le serveur. Retire les mods « client » de la liste des mods du serveur.', acts, { mods: cul });
  }

  if ((m = t.match(/Could not load 'plugins\/([^']+)'/) || t.match(/Error occurred while enabling ([\w.-]+) v/) || t.match(/Disabling ([\w.-]+) v[\d.]+\s*\n?[^\n]*(?:error|exception)/i)))
    return out('plugin', 'Un plugin pose problème', `Le plugin « ${m[1].replace(/\.jar$/i, '')} » n’a pas pu démarrer. Mets-le à jour (version pour Minecraft ${h.version}) ou retire son fichier du dossier plugins.`);

  if (/Failed to load properties|server\.properties[^\n]{0,80}(?:invalid|error|exception)|Unknown level type|NumberFormatException[^\n]{0,80}server/i.test(t)) return out('props', 'server.properties invalide', 'Une valeur de server.properties est incorrecte. Corrige-la dans les réglages du serveur (ou supprime la ligne : le serveur remet la valeur par défaut).');

  // causes génériques (Java, mémoire, mods, dépendances…) : on garde l'analyse du jeu, sans ce qui n'a de sens que pour un client
  const acts = base.actions.filter(a => a.id !== 'jauto');
  if (base.kind === 'unknown') return { ...base, title: 'Cause inconnue', hint: ctx.neverRan ? NO_RUN_LOG + ' Regarde la fin du journal ci-dessous.' : 'Le serveur s’est arrêté sans message clair. Regarde la fin du journal ci-dessous : relance-le d’abord, ou copie le journal pour demander de l’aide.', actions: [A.retry, ...acts] };
  if (base.kind === 'quick') return { ...base, title: 'Le serveur s’est arrêté aussitôt', hint: 'Le serveur s’est arrêté en quelques secondes sans rien expliquer : le plus souvent Java (mauvaise version ou bloqué par l’antivirus) ou un fichier manquant.', actions: [A.retry, ...acts] };
  return { ...base, actions: acts.some(a => a.id === 'retry') ? acts : [...acts, A.retry] };
};

const newestIn = (dir, re, since) => {
  let best = null; try { for (const f of fs.readdirSync(dir)) { if (!re.test(f)) continue; const p = path.join(dir, f), st = fs.statSync(p); if (st.isFile() && st.mtimeMs >= since && (!best || st.mtimeMs > best.t)) best = { p, name: f, t: st.mtimeMs }; } } catch (e) { /* dossier absent */ }
  return best;
};

/** Décide s'il s'agit d'un plantage et le diagnostique. h : serveur, o : { dir, lines, code, t0, stopped, wasRunning, packs, newestPack, hasLevel, levelOld }.
    Renvoie null si l'arrêt est normal (arrêt demandé, ou serveur qui tournait et a été arrêté proprement avec /stop). */
exports.diagnose = (h, o) => {
  if (o.stopped) return null;   // arrêt demandé depuis Hydarium
  const rep = newestIn(path.join(o.dir, 'crash-reports'), /^crash-.*\.txt$/i, o.t0 - 2000), hs = newestIn(o.dir, /^hs_err_pid\d+\.log$/i, o.t0 - 2000);
  const crashed = (o.code !== 0 && o.code !== null) || !!rep || !!hs || !o.wasRunning;   // code 0 sans être jamais « en ligne » : arrêt pendant le démarrage (ex. CLUF refusé)
  if (!crashed) return null;
  const read = (f, n) => { try { return fs.readFileSync(f.p, 'utf8').slice(0, n); } catch (e) { return ''; } };
  const text = (o.lines || []).slice(-400).join('\n') + (rep ? '\n' + read(rep, 80000) : '') + (hs ? '\n' + read(hs, 8000) : '');
  const secs = (Date.now() - o.t0) / 1000;
  const analysis = exports.analyze(h, text, { code: o.code, secs, packs: o.packs, newestPack: o.newestPack, hasLevel: o.hasLevel, levelOld: o.levelOld, neverRan: !o.wasRunning });
  return { at: Date.now(), code: o.code, secs: Math.round(secs), report: rep ? rep.name : '', tail: tail(o.lines, 120), analysis };
};
exports.NO_RUN_LOG = NO_RUN_LOG;
