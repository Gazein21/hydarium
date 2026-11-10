/* Versions Minecraft (Mojang) et lancement : loaders, contrôles de compatibilité, serveurs, journaux et plantages expliqués. */
const { Client } = require('minecraft-launcher-core');
const { app } = require('electron');
const path = require('path'), fs = require('fs');
const store = require('./store'), auth = require('./auth'), plat = require('./platform'), mods = require('./mods'), log = require('./log'), notify = require('./notify');

let cache = null, running = null, preparing = null, proc0 = null, stopReq = false; // preparing : instance dont le client Hydarium est attendu avant le lancement (évite un 2e clic pendant l'attente)
exports.versions = async () => {
  if (!cache || Date.now() - cache.t > 6e5) {
    const r = await fetch('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json');
    if (!r.ok) throw new Error('Impossible de récupérer la liste des versions (connexion ?).');
    cache = { t: Date.now(), v: (await r.json()).versions.map(v => ({ id: v.id, type: v.type, url: v.url })) };
  }
  return cache.v;
};
/* Java demandé par Mojang pour une version (sinon estimation d’après le numéro) */
const guess = v => { const m = v.match(/^1\.(\d+)(?:\.(\d+))?/); if (!m) return 21; const a = +m[1], b = +(m[2] || 0); return a >= 21 || (a === 20 && b >= 5) ? 21 : a >= 17 ? 17 : 8; };
const needs = {};
exports.needJava = async inst => {
  if (needs[inst.version]) return needs[inst.version];
  try { const v = (await exports.versions()).find(x => x.id === inst.version), j = await (await fetch(v.url)).json(); return (needs[inst.version] = j.javaVersion.majorVersion); } catch (e) { return guess(inst.version); }
};
/* Choix : Java de l’instance > Java par défaut des Paramètres > automatique (version demandée, sinon la plus proche au-dessus) */
async function chooseJava(inst, req, send) {
  const s = store.get().settings; let all = await plat.javas(s.javas || []);
  { const alive = l => l.filter(j => !path.isAbsolute(j.path) || fs.existsSync(j.path)); if (alive(all).length !== all.length) all = alive(await plat.javas(s.javas || [], true)); } // un Java désinstallé depuis la dernière recherche ne doit pas être choisi
  /* Versions d’avant 1.17 (Java 8 demandé, 1.8.9 compris) : exactement Java 8. Avec Java 9 et plus, Forge / LaunchWrapper ne démarrent pas ; les autres versions demandent « au moins » la version de Mojang. */
  const legacy = req <= 8, fits = j => j.is64 && (legacy ? j.major === 8 : j.major >= req), byMajor = (a, b) => a.major - b.major;
  let pick = inst.java; // Java choisi pour l’instance : toujours respecté
  if (!pick && s.java) { const g = all.find(x => x.path === s.java) || await plat.javaInfo(s.java); if (g && legacy && g.major !== 8) log.warn(`Java par défaut (Java ${g.major}) ignoré : Minecraft ${inst.version} demande Java 8`); else pick = s.java; }
  if (pick) {
    const j = all.find(x => x.path === pick) || await plat.javaInfo(pick);
    if (!j) throw Object.assign(new Error('Le Java choisi est introuvable : ' + pick + '. Choisis-en un autre dans la page de l’instance.'), { code: 'JAVA_PICK', path: pick });
    if (j.major < req) log.warn(`Java ${j.major} choisi alors que Minecraft ${inst.version} demande Java ${req}`);
    return j;
  }
  let ok = all.filter(fits).sort(byMajor), dlErr = '';
  if (!ok.length && s.autoJava !== false) { // pas de Java adapté : téléchargement automatique (une seule fois, il est ensuite retrouvé dans les Java connus)
    try { await require('./jre').install(req, m => send && send('game:progress', { type: m, task: 0, total: 1 })); all = await plat.javas(s.javas || [], true); ok = all.filter(fits).sort(byMajor); } catch (e) { dlErr = e.message; log.warn('Installation automatique de Java impossible :', e.message); }
  }
  let j = ok.find(x => x.major === req) || ok[0];
  if (!j && legacy && inst.loader !== 'forge') { j = all.filter(x => x.is64 && x.major >= req).sort(byMajor)[0]; if (j) log.warn(`Java ${req} introuvable : Java ${j.major} utilisé à la place pour Minecraft ${inst.version}`); } // hors Forge, un Java plus récent démarre souvent quand même
  if (!j) throw Object.assign(new Error(`Minecraft ${inst.version} demande Java ${req}${legacy ? ' exactement' : ''}, et il n’a pas pu être trouvé ni téléchargé automatiquement${dlErr ? ' (' + dlErr + ')' : s.autoJava === false ? ' (le téléchargement automatique est désactivé dans les Paramètres)' : ''}. Vérifie ta connexion, ou ajoute un Java ${req} dans Paramètres › Java.`), { code: 'JAVA_MISSING', major: req, legacy, dlErr, autoOff: s.autoJava === false });
  return j;
}
const dirOf = id => path.join(plat.dataDir(), 'instances', id);
exports.dirOf = dirOf;
exports.remove = id => { if (/^[a-z0-9]+$/.test(id)) fs.rmSync(dirOf(id), { recursive: true, force: true }); };

/* causes courantes de plantage, expliquées en français */
const KNOWN = [
  [/class file version (\d+)/, m => `Un fichier du jeu ou d’un mod demande Java ${+m[1] - 44}, mais le Java utilisé est plus ancien. Choisis Java ${+m[1] - 44} pour cette instance.`],
  [/UnsupportedClassVersionError/, 'Mauvaise version de Java pour cette version de Minecraft.'],
  [/Could not reserve enough space|OutOfMemoryError|insufficient memory/i, 'Pas assez de mémoire : baisse la mémoire de l’instance.'],
  [/Unrecognized option|Unknown option|Unrecognized argument/i, 'Option de lancement non reconnue par cette version (par exemple « rejoindre un serveur »).'],
  [/Mixin apply failed|Mod resolution failed|Incompatible mod set|requires .*fabric/i, 'Un mod est incompatible, ou une dépendance manque.'],
  [/ClassNotFoundException|NoClassDefFoundError/, 'Un mod ou un fichier du jeu est manquant ou incompatible.'],
  [/Invalid session|authentication/i, 'Problème de session : reconnecte-toi à Microsoft.'],
  [/EXCEPTION_ACCESS_VIOLATION|SIGSEGV|-805306369/, 'Plantage natif (accès mémoire interdit), le plus souvent dans le pilote graphique OpenGL : mets-le à jour depuis le site du fabricant, ferme les surcouches (Discord, NVIDIA, Afterburner…) et évite le plein écran.']
];
/* rapport de plantage natif de la JVM (hs_err_pid*.log) : on en tire la bibliothèque fautive */
function hsErr(dirs, t0) {
  for (const d of dirs) {
    try {
      const f = fs.readdirSync(d).filter(x => /^hs_err_pid\d+\.log$/.test(x)).map(x => ({ x, t: fs.statSync(path.join(d, x)).mtimeMs })).filter(f => f.t >= t0 - 5000).sort((a, b) => b.t - a.t)[0];
      if (!f) continue;
      const L = fs.readFileSync(path.join(d, f.x), 'utf8').split(/\r?\n/).slice(0, 60), i = L.findIndex(l => l.includes('Problematic frame')), fr = i >= 0 ? (L[i + 1] || '').replace(/^#\s*/, '') : '';
      const lib = (fr.match(/\[([^\]+]+?)\+0x/) || [])[1] || '', low = lib.toLowerCase();
      const who = /nvoglv|nvwgf|nvd3d/.test(low) ? 'pilote NVIDIA' : /atio|atig|amdxx|amdocl/.test(low) ? 'pilote AMD' : /^ig|igd|intel/.test(low) ? 'pilote Intel' : /jvm\.dll|libjvm/.test(low) ? 'Java lui-même' : /lwjgl|glfw/.test(low) ? 'bibliothèque LWJGL' : '';
      return { file: path.join(d, f.x), frame: fr, lib, who };
    } catch (e) {}
  }
  return null;
}
function crash(dir, inst, t0) {
  try {
    const d = path.join(dir, 'crash-reports');
    const f = fs.readdirSync(d).map(x => ({ x, t: fs.statSync(path.join(d, x)).mtimeMs })).filter(f => f.t >= t0).sort((a, b) => b.t - a.t)[0];
    if (!f) return null;
    const raw = fs.readFileSync(path.join(d, f.x), 'utf8'), low = raw.toLowerCase();
    return { raw, desc: (raw.match(/Description: (.*)/) || [])[1] || '', sus: inst.mods.filter(m => low.includes(m.slug.toLowerCase())).map(m => m.title) };
  } catch (e) { return null; }
}

/* Windows : javaw.exe n’ouvre aucune console ; si « Afficher les logs » est activé, c’est la fenêtre de logs du launcher (logwin.js) qui montre la sortie du jeu. */
function launchExe(p) {
  if (process.platform !== 'win32') return p;
  const w = path.join(path.dirname(p), 'javaw.exe'); try { return fs.existsSync(w) ? w : p; } catch (e) { return p; }
}
exports.isRunning = () => !!running;
/* Ferme le jeu en cours (utilisé pour relancer sur une instance compatible avec un serveur) : attend la fermeture, 15 s au plus. */
exports.stop = async () => {
  if (!running) return true;
  stopReq = true;
  try { if (proc0) proc0.kill(); } catch (e) { log.warn('arrêt du jeu', e.message); }
  for (let n = 0; n < 60 && running; n++) await new Promise(r => setTimeout(r, 250));
  if (running) { try { if (proc0) proc0.kill('SIGKILL'); } catch (e) {} for (let n = 0; n < 20 && running; n++) await new Promise(r => setTimeout(r, 250)); }
  return !running;
};
exports.chooseJava = chooseJava;
/* phase « préparation du lancement » : une erreur ici (Java, téléchargement, loader…) est expliquée dans la fenêtre de plantage, comme un plantage en jeu */
let launchPhase = false;
async function playInner(id, send, opts = {}) {
  if (running || preparing) throw new Error('Un jeu est déjà en cours.');
  const inst = store.get().instances.find(i => i.id === id);
  if (!inst) throw new Error('Instance introuvable.');
  const st = mods.status(id);
  if (st.conflicts.length) throw new Error(`Incompatibilité : « ${st.conflicts[0].a} » et « ${st.conflicts[0].b} ». Retire l’un des deux dans la page de l’instance.`);
  const warn = [...st.mods.filter(m => m.status === 'missing').map(m => 'Mod manquant, attention : ' + m.title), ...st.mods.filter(m => m.status === 'unverified' || m.status === 'cf').map(m => 'Non vérifié : ' + m.title)];
  const unverified = st.mods.filter(m => m.status === 'unverified' || m.status === 'cf').map(m => ({ pid: m.pid, title: m.title }));
  if (warn.length && !opts.confirm) return { warn, unverified };
  launchPhase = true;
  const authorization = auth.mclc();
  const req = await exports.needJava(inst), jv = await chooseJava(inst, req, send), javaPath = jv.path;
  const dir = dirOf(id); fs.mkdirSync(dir, { recursive: true }); require('./session').applyGamma(inst, dir);
  if (!opts.safe) { // client Hydarium : fabriqué AVANT tout téléchargement de Minecraft (loader, bibliothèques, ressources), présenté comme l'un de ses composants : il est donc là dès le PREMIER lancement.
    // Échec ou fabrication impossible : le jeu démarre quand même, sans lui (seul le HUD du launcher est utilisé). Mode sans échec : jamais.
    preparing = id; try { const r = await require('./session').ensureFirst(inst, send); log.info('Client Hydarium avant lancement :', r && r.state); } catch (e) { log.warn('client Hydarium', e.message); } finally { preparing = null; }
  }
  const eff = inst.loader === 'vanilla' && !opts.safe && require('./session').fabricMode(inst) ? { ...inst, loader: 'fabric' } : inst; // Vanilla + client Hydarium : Fabric en silence
  const custom = eff.loader !== 'vanilla' ? await mods.loader(eff, send) : undefined;
  const session = require('./session'); session.writeConfig(inst, dir);
  { const s = store.get().settings; if (s.langSync !== false) { const ct = require('./content'); if (!ct.optGet(id).exists) ct.defApply(id);
      if (ct.optGet(id).lang === undefined) ct.optSet(id, { lang: /^[a-z]{2}_[a-z]{2}$/.test(s.gameLang || '') ? s.gameLang : 'fr_fr' }); } }
  const safe = !!opts.safe, clientArgs = safe ? [] : await session.jvmArgs(inst); // mode sans échec : ni agent, ni arguments personnalisés
  const customArgs = [], minor0 = +(inst.version.match(/^1\.(\d+)/) || [0, 99])[1];
  const server = (await require('./p2p').ensureFor(opts.server || inst.autoServer || '')) || undefined; // invitation privée : le port local est rouvert avant de lancer
  if (opts.world && /^[^\\/]+$/.test(opts.world) && opts.world !== '..') { if (minor0 < 20) throw new Error('Lancer directement dans un monde demande Minecraft 1.20 ou plus.'); customArgs.push('--quickPlaySingleplayer', opts.world); }
  else if (server && /^[a-z0-9.-]+(:\d{1,5})?$/i.test(server)) opts.server = server;
  if (inst.args && !safe) customArgs.push(...inst.args.split(/\s+/).filter(Boolean));
  if (!opts.world && opts.server && /^[a-z0-9.-]+(:\d{1,5})?$/i.test(opts.server)) {
    const [h, p] = opts.server.split(':'), minor = +(inst.version.match(/^1\.(\d+)/) || [0, 99])[1];
    if (minor >= 20) customArgs.push('--quickPlayMultiplayer', opts.server); else customArgs.push('--server', h, '--port', p || '25565');
  }
  const gl = log.gameLog(inst.name), tail = [], showLog = !!store.get().settings.showLog;
  if (showLog) { const lw = require('./logwin'); lw.reset(); lw.open(inst.name + ' · ' + inst.version); lw.push('[launcher] Préparation du lancement de ' + inst.name + ' (' + inst.version + ', ' + inst.loader + ')…', 'l'); }
  const feed = m => { const s = String(m); if (showLog) require('./logwin').push(s); gl.write(s); tail.push(s); if (tail.length > 120) tail.shift(); require('./mismatch').feed(inst, s); };
  gl.write(`Hydarium ${app.getVersion()} · ${plat.id} ${process.arch} · instance « ${inst.name} » · Minecraft ${inst.version} · ${inst.loader}${custom ? ' (' + custom + ')' : ''} · Java ${jv.major} (${jv.version}, ${jv.vendor}, ${jv.is64 ? '64' : '32'} bits, demandé : ${req}) ${javaPath} · ${inst.mem || 4} Go${opts.server ? ' · serveur ' + opts.server : ''}`);
  log.info('Lancement', inst.name, inst.version, inst.loader, 'Java', javaPath, 'journal', gl.file);
  const l = new Client(), t0 = Date.now();
  running = id;
  let lastP = 0; l.on('progress', p => { send('game:progress', { type: p.type, task: p.task, total: p.total }); if (showLog && Date.now() - lastP > 700) { lastP = Date.now(); require('./logwin').push(`[launcher] Téléchargement ${p.type} ${p.task}/${p.total}`, 'l'); } });
  l.on('arguments', a => gl.write('ARGUMENTS ' + a.join(' ')));
  l.on('debug', m => feed('[debug] ' + m));
  l.on('data', m => { feed(m); send('game:log', String(m)); });
  l.on('close', code => {
    if (showLog) require('./logwin').push('[launcher] Jeu fermé (code ' + code + ').', 'l');
    running = null; proc0 = null; require('./mismatch').reset(); const wasStop = stopReq; stopReq = false; require('./session').stop(); const secs = Math.round((Date.now() - t0) / 1000); inst.playtime += secs; store.save(); require('./stats').onClose(secs, code !== 0 && !wasStop, inst);
    gl.write('Fermeture du jeu, code ' + code); log.info('Jeu fermé', inst.name, 'code', code);
    if (code && !wasStop) { // un arrêt demandé par le launcher (changement d’instance) n’est pas un plantage
      const c = crash(dir, inst, t0), hs = hsErr([dir, path.join(plat.dataDir(), 'shared')], t0), txt = tail.join('\n') + (c ? c.raw : '') + (hs ? '\nEXCEPTION_ACCESS_VIOLATION' : '');
      if (hs) gl.write('RAPPORT NATIF ' + hs.file + ' · fautif : ' + hs.frame);
      const hit = KNOWN.find(([re]) => re.test(txt)), base = (hit ? (typeof hit[1] === 'function' ? hit[1](txt.match(hit[0])) : hit[1]) : '') || (c && c.desc) || 'Cause inconnue : ouvre le journal.';
      const cause = hs && hs.lib ? `Plantage dans « ${hs.lib} »${hs.who ? ' (' + hs.who + ')' : ''}. ` + (hs.who && /pilote/.test(hs.who) ? 'Mets à jour ce pilote depuis le site du fabricant, ferme les surcouches (Discord, Afterburner…) et évite le plein écran.' : base) : base;
      log.error('Plantage', inst.name, cause);
      const an = require('./crash').analyze(inst, tail.join('\n') + '\n' + (c ? c.raw : '') + (hs ? '\nEXCEPTION_ACCESS_VIOLATION ' + hs.frame : ''), { code, secs, javaMajor: jv.major, req });
      if (hs && hs.lib && an.kind === 'unknown') { an.kind = 'graphics'; an.title = 'Plantage natif'; an.hint = cause; }
      notify.show('Plantage : ' + inst.name, (an.mods.length ? 'Mod suspect : ' + an.mods[0].title + '. ' : '') + an.title + '. Clique pour voir le détail.', 'crash', 'crash');
      send('game:crash', { id, name: inst.name, cause, analysis: an, tail: tail.join('').split(/\r?\n/).filter(Boolean).slice(-150), logFile: gl.file, report: c ? c.raw.slice(0, 20000) : '' });
    }
    send('game:close', id);
  });
  try {
    const proc = await l.launch({
      authorization, javaPath: launchExe(javaPath),
      root: path.join(plat.dataDir(), 'shared'),
      overrides: { gameDirectory: dir, ...(store.get().settings.dl >= 1 ? { maxSockets: store.get().settings.dl } : {}) },
      version: { number: inst.version, type: inst.type || 'release', ...(custom ? { custom } : {}) },
      memory: { max: (inst.mem || 4) + 'G', min: Math.min(inst.minMem || 1, inst.mem || 4) + 'G' },
      window: safe ? undefined : inst.res && inst.res.mode === 'full' ? { fullscreen: true } : inst.res && inst.res.mode === 'window' ? { width: inst.res.w, height: inst.res.h } : undefined,
      customLaunchArgs: customArgs.splice(0),
      customArgs: [...(inst.loader === 'forge' || inst.loader === 'neoforge' ? require('./forge').jvmArgs(custom) : []), ...clientArgs, ...(safe ? [] : (inst.jvm || '').split(/\s+/).filter(Boolean)), '-XX:ErrorFile=' + path.join(dir, 'hs_err_pid%p.log')]
    });
    if (!proc) throw new Error('Le lancement a échoué : voir le journal ' + path.basename(gl.file));
    proc0 = proc;
    try { proc.on('error', er => feed('[launcher] Impossible de démarrer Java : ' + (er.code ? er.code + ' ' : '') + er.message + '\n')); } catch (er) {} // sans écouteur, une erreur de démarrage ferait planter le launcher
  } catch (e) { running = null; gl.write('ÉCHEC DU LANCEMENT : ' + (e.stack || e.message)); throw e; }
  inst.lastPlayed = Date.now(); store.save(); send('game:started', id); require('./session').start(inst, dir, { server: opts.server }); require('./stats').onLaunch(inst, opts.server);
  notify.show('Minecraft démarre', `${inst.name} · ${inst.version}`, '', 'launch');
}

function reportLaunchFail(e, id, send) {
  try {
    const inst = store.get().instances.find(i => i.id === id); if (!inst) return;
    const an = require('./crash').explainLaunch(e, inst);
    log.error('Lancement impossible', inst.name, e && e.message);
    notify.show('Lancement impossible : ' + inst.name, an.title + '. Clique pour voir le détail.', 'crash', 'crash');
    send('game:crash', { id, name: inst.name, cause: an.hint, analysis: an, tail: [String((e && e.message) || e)], logFile: '', report: '', launch: true });
  } catch (x) { log.warn('rapport d’échec de lancement', x.message); }
}
exports.play = async (id, send, opts = {}) => {
  launchPhase = false;
  try { return await playInner(id, send, opts); }
  catch (e) { if (launchPhase) reportLaunchFail(e, id, send); throw e; }
  finally { launchPhase = false; }
};
