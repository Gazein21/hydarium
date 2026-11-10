/* Le mod Hydarium, fabriqué à la demande pour n'importe quelle version (Fabric / Forge) et conservé pour toutes les instances de cette version.

   • Une clé par couple (famille, version) : « fabric-1.20.4 », « forge-1.8.9»… Deux instances de la même version partagent le même mod ; une Vanilla 1.14+ utilise celui de Fabric.
   • Déjà fabriqué (ou livré avec le launcher) → on le réutilise tel quel, rien n'est refait. Mis à jour seulement si ses sources changent (mise à jour du launcher).
   • Plusieurs demandes pour la même version en même temps (création de 2 instances, ou création puis lancement) → UNE seule fabrication, tout le monde attend la même.
   • Une fabrication à la fois (Gradle est lourd), en arrière-plan : on ne bloque jamais la création d'une instance.
   • Un échec dû au code (version dont Mojang a changé quelque chose) est mémorisé : on ne le retente pas à chaque lancement, seulement quand les sources changent. Une panne de réseau est retentée au bout de 10 minutes.
   Les plans (quoi essayer pour quelle version) sont dans modplan.js ; la fabrication proprement dite dans scripts/build-mods.js (lancé avec Electron comme Node). */
const fs = require('fs'), path = require('path'), cp = require('child_process');
const P = require('./modplan'), log = require('./log'), plat = require('./platform');

const exists = p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } };
const readJson = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } };
const packaged = () => { try { return require('electron').app.isPackaged; } catch (e) { return false; } };

/** Où sont les sources du mod et le script ? Dans l'installation (resources/mod-src) ou, en développement, dans le dossier du projet. null = on ne peut pas fabriquer ici. */
let srcHook = null; exports._setSources = f => { srcHook = f; }; // (tests)
const sources = () => {
  if (srcHook) return srcHook();
  for (const root of [path.join(process.resourcesPath || '', 'mod-src'), path.join(__dirname, '..', '..')]) {
    const script = path.join(root, 'scripts', 'build-mods.js');
    if (exists(script) && fs.existsSync(path.join(root, 'client-mod', 'core', 'src'))) return { root, script };
  }
  return null;
};
const outDir = () => path.join(plat.dataDir(), 'client', 'mods');
const toolsDir = s => packaged() ? path.join(plat.dataDir(), 'build-tools') : path.join(s.root, '.build-tools');
const jarDirs = () => [path.join(process.resourcesPath || '', 'client'), path.join(plat.dataDir(), 'client'), outDir(), path.join(__dirname, '..', '..', 'build-client')]; // installé · données · fabriqué ici · développement

exports.describe = P.describe;
exports.canBuild = () => !!sources();
/** Cette instance peut-elle avoir un mod ? { ok, key, family, version } ou { ok: false, reason, needsForge }. */
exports.supported = inst => { const d = P.describe(inst); if (!d.ok) return d; const r = P.plansFor(d.family, d.version); return r.ok ? d : { ...d, ok: false, reason: r.reason }; };

/** Chemin du jar de cette clé : d'abord l'ancien nom (jars livrés, déjà éprouvés), puis celui fabriqué à la demande. { path, legacy } | null */
const candidates = key => { // dans l'ordre de préférence : jars livrés (ancien nom), puis jars fabriqués ici
  const out = [], legacy = P.legacyJar(key);
  for (const d of jarDirs()) { if (legacy && exists(path.join(d, legacy))) out.push({ path: path.join(d, legacy), legacy: true }); }
  for (const d of jarDirs()) { const p = path.join(d, P.jarName(key)); if (exists(p)) out.push({ path: p, legacy: false }); }
  return out;
};
/* Le jar que ensure() a reconnu à jour pour cette clé : c'est CELUI-LÀ qui est copié dans le jeu (sinon un vieux jar livré, plus haut dans l'ordre, masquait pour toujours le jar fraîchement fabriqué). */
const chosen = new Map();
const find = key => { const c = chosen.get(key); if (c && exists(c.path)) return c; return candidates(key)[0] || null; };
exports.jarFor = key => { const f = find(key); return f ? f.path : ''; };
exports.anyJar = () => { for (const d of jarDirs()) { try { const f = fs.readdirSync(d).find(n => /^hydarium-.*\.jar$/.test(n) && !/agent/.test(n)); if (f) return path.join(d, f); } catch (e) {} } return ''; };

const metaOf = (key, f) => f ? readJson(f.path.replace(/\.jar$/, '.json')) : null;
/** Le mod dessine-t-il lui-même le HUD dans le jeu (« draw ») ? Sinon c'est le launcher qui le dessine par-dessus. */
exports.drawOf = key => { const m = metaOf(key, find(key)); if (m && typeof m.draw === 'boolean') return m.draw; return ['fabric-1.20.1', 'fabric-1.21', 'fabric-1.21.1', 'forge-1.8.9'].includes(key); };

const hashOf = d => { const s = sources(); if (!s) return ''; try { return P.hashSources(s.root, d.family, d.version); } catch (e) { return ''; } };
/** Le mod prêt à l'emploi pour cette instance (jar existant et à jour), sinon null. */
/* Un jar livré (ancien nom) n'a pas d'empreinte. Sans sources on ne peut pas juger : on le garde. Avec les sources, on ne le garde que s'il n'est pas plus vieux que la source la plus récente : sinon il est PÉRIMÉ et ne contient pas les dernières fonctions. */
const legacyFresh = (f, d) => { const s = sources(); if (!s) return true; let newest = 0; try { newest = P.newestSourceMtime(s.root, d.family, d.version); } catch (e) {} if (!newest) return true; try { return fs.statSync(f.path).mtimeMs >= newest - 2000; } catch (e) { return false; } };
const current = d => {
  const h = hashOf(d); // sans sources on ne peut pas juger : on garde ce qu'on a
  for (const f of candidates(d.key)) {
    if (f.legacy) { if (legacyFresh(f, d)) { chosen.set(d.key, f); return f; } continue; }
    const m = metaOf(d.key, f); if (!h || (m && m.srcHash === h)) { chosen.set(d.key, f); return f; }
  }
  chosen.delete(d.key); return null;
};
const failFile = key => path.join(outDir(), 'hydarium-' + key + '.fail.json');
const failure = d => { const f = readJson(failFile(d.key)); if (!f) return null; if (f.srcHash !== hashOf(d)) return null; if (!f.compile && Date.now() - (f.at || 0) > 10 * 60 * 1000) return null; return f; };

/* ---- fabrication ---- */
const jobs = new Map(); // clé → { promise, text, pct, ids: Map(instId → send) }
let chain = Promise.resolve();
exports.onEvent = null; // (evt) => … : { type: 'start' | 'done' | 'fail', key, version, family, msg }
const emit = e => { try { exports.onEvent && exports.onEvent(e); } catch (x) {} };
const push = (job, key) => { for (const [id, send] of job.ids) { try { send && send('client:progress', { id, text: job.text, pct: job.pct, key }); } catch (e) {} } };

const run = (d, job) => new Promise(resolve => {
  const s = sources(); if (!s) return resolve({ ok: false, error: 'Sources du mod introuvables.' });
  fs.mkdirSync(outDir(), { recursive: true });
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', HYD_SRC: s.root, HYD_TOOLS: toolsDir(s), HYD_OUT: outDir() };
  if (packaged()) env.NODE_PATH = path.join(process.resourcesPath, 'app.asar', 'node_modules'); // le script (hors de l'archive) retrouve adm-zip
  const p = cp.spawn(process.execPath, [s.script, '--for', d.family, d.version, '--json'], { cwd: s.root, env, windowsHide: true }), lines = []; let result = null, done = false;
  const finish = r => { if (done) return; done = true; clearTimeout(kill); try { const L = log.dir(); fs.mkdirSync(L, { recursive: true }); fs.writeFileSync(path.join(L, 'mod-build-' + d.key + '.log'), lines.join('\n') + '\n'); } catch (e) {} resolve(r); };
  const eat = chunk => String(chunk).split(/\r?\n/).forEach(l => {
    if (l.startsWith('@@HYD_RESULT ')) { try { result = JSON.parse(l.slice(13)); } catch (e) {} return; }
    if (l.startsWith('@@HYD ')) { try { const j = JSON.parse(l.slice(6)); if (j.t) job.text = j.t; if (typeof j.p === 'number') job.pct = Math.round(j.p * 100); push(job, d.key); } catch (e) {} return; }
    if (l.trim()) { lines.push(l); if (lines.length > 2500) lines.shift(); }
  });
  const kill = setTimeout(() => { try { p.kill(); } catch (e) {} lines.push('Arrêté : plus de 45 minutes.'); }, 45 * 60 * 1000);
  p.stdout.on('data', eat); p.stderr.on('data', eat);
  p.on('error', e => finish({ ok: false, error: e.message }));
  p.on('close', () => finish(result || { ok: false, error: 'La fabrication s’est arrêtée sans résultat (voir le journal mod-build-' + d.key + '.log).' }));
});

const start = d => {
  const job = { text: 'Création du mod Hydarium (Minecraft ' + d.version + ')', pct: 0, ids: new Map(), key: d.key };
  job.promise = chain.catch(() => {}).then(async () => {
    emit({ type: 'start', key: d.key, version: d.version, family: d.family }); log.info('Fabrication du mod Hydarium', d.key);
    const r = await run(d, job), hash = hashOf(d);
    if (r.ok && exists(path.join(outDir(), r.jar || P.jarName(d.key)))) {
      try { fs.rmSync(failFile(d.key), { force: true }); } catch (e) {}
      current(d); // retient le jar neuf comme jar à utiliser (et non un vieux jar livré qui serait plus haut dans l'ordre)
      log.info('Mod Hydarium prêt :', d.key, '(' + r.plan + ')'); emit({ type: 'done', key: d.key, version: d.version, plan: r.plan, tier: r.tier });
      return { state: 'ready', built: true, key: d.key, plan: r.plan, tier: r.tier };
    }
    const msg = r.error || 'Échec de la construction.';
    try { fs.writeFileSync(failFile(d.key), JSON.stringify({ srcHash: hash, error: msg, tried: r.tried || [], compile: !!r.compile, at: Date.now() })); } catch (e) {}
    log.warn('Mod Hydarium impossible pour', d.key, ':', msg); emit({ type: 'fail', key: d.key, version: d.version, msg });
    return { state: 'failed', msg, key: d.key, tried: r.tried || [] };
  });
  chain = job.promise.catch(() => {});
  jobs.set(d.key, job); job.promise.finally(() => jobs.delete(d.key));
  return job;
};

/** S'assure que le mod de CETTE instance existe. Renvoie { state: 'ready' | 'failed' | 'missing' | 'unsupported' | 'needs-forge', … } et ne lève jamais d'exception.
    send(canal, données) reçoit la progression de la fabrication (la même pour toutes les instances qui attendent cette version). force : retente même après un échec mémorisé. */
exports.ensure = async (inst, send, opt = {}) => {
  try {
    const d = exports.supported(inst);
    if (!d.ok) return { state: d.needsForge ? 'needs-forge' : 'unsupported', reason: d.reason };
    if (current(d) && !opt.force) return { state: 'ready', reused: true, key: d.key };
    let job = jobs.get(d.key);
    if (!job) {
      if (!sources()) { log.warn('Mod Hydarium absent et non constructible ici (installation sans sources) :', d.key); return { state: 'missing', key: d.key }; }
      const f = !opt.force && failure(d); if (f) return { state: 'failed', msg: f.error, key: d.key, tried: f.tried, remembered: true };
      job = start(d);
    }
    if (send) { job.ids.set(inst.id, send); push(job, d.key); }
    const r = await job.promise; job.ids.delete(inst.id); return r;
  } catch (e) { log.warn('modbuild.ensure', e.message); return { state: 'failed', msg: e.message }; }
};

/** AVANT le lancement du jeu : le client Hydarium doit être là dès le PREMIER lancement (avant que Minecraft télécharge ses fichiers), pas au suivant.
    On l'attend seulement s'il manque (et qu'on sait le fabriquer) ou s'il est déjà en cours de fabrication (lancé à la création de l'instance : on rejoint la même fabrication).
    Un échec déjà mémorisé n'est PAS retenté ici (bouton « Réessayer » de l'instance) ; non pris en charge / sources absentes : on n'attend rien.
    send(« game:progress », { type, task, total, label }) : la progression est présentée comme un COMPOSANT DE MINECRAFT dans la barre de téléchargement du jeu. Ne lève jamais. */
exports.ensureFirst = async (inst, send) => {
  try {
    const st = exports.status(inst);
    if (!(st.mod === 'building' || (st.mod === 'missing' && st.canBuild))) return { state: st.mod };
    const feed = (ch, d) => { if (ch === 'client:progress' && send) { const pct = Math.max(0, Math.min(100, d.pct | 0)); send('game:progress', { type: 'Hydarium Client', task: pct, total: 100, label: 'Composants Minecraft · Hydarium Client · ' + (d.text || 'création') + ' ' + pct + ' %' }); } };
    return await exports.ensure(inst, feed);
  } catch (e) { log.warn('modbuild.ensureFirst', e.message); return { state: 'failed', msg: e.message }; }
};

/** Préparation en arrière-plan à la création d'une instance : seulement si le réglage autoMod est activé (sinon : au premier lancement). Ne bloque rien et ne fait pas d'erreur. */
exports.prepare = (inst, send) => {
  try {
    const st = require('./store').get(); if (st.settings && st.settings.autoMod === false) return; // par défaut : fabriqué dès la création, en arrière-plan, sans rien afficher ni bloquer le lancement
    const d = exports.supported(inst); if (!d.ok || !sources() || current(d)) return;
    if (jobs.has(d.key)) return; // déjà en cours pour cette version
    exports.ensure(inst, null).catch(() => {}); // pas de send : aucune progression envoyée à l'interface
  } catch (e) { log.warn('modbuild.prepare', e.message); }
};

/** État pour l'interface : { mod: 'ok' | 'building' | 'missing' | 'failed' | 'unsupported' | 'forge189', key, reason, draw, canBuild, pct, text, error }. */
exports.status = inst => {
  const d = exports.supported(inst);
  if (!d.ok) return { mod: d.needsForge ? 'forge189' : 'unsupported', reason: d.reason };
  const job = jobs.get(d.key); if (job) return { mod: 'building', key: d.key, pct: job.pct, text: job.text, canBuild: !!sources() };
  if (current(d)) return { mod: 'ok', key: d.key, draw: exports.drawOf(d.key), canBuild: !!sources() };
  const f = failure(d); if (f) return { mod: 'failed', key: d.key, error: f.error, canBuild: !!sources() };
  return { mod: 'missing', key: d.key, draw: exports.drawOf(d.key), canBuild: !!sources() };
};
