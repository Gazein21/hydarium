/* Mises à jour d’Hydarium : à chaque lancement (et toutes les heures), on regarde la dernière Release du dépôt GitHub.
   • Installeur Windows / AppImage : electron-updater télécharge la mise à jour en arrière-plan et l’installe à la fermeture du launcher
     (ou tout de suite avec « Redémarrer et installer »). Jamais pendant qu’une partie tourne.
   • Version portable, macOS, ou autre : on prévient seulement qu’une version existe (lien vers la page de téléchargement).
   • Développement (npm start) : désactivé.
   Une erreur (hors ligne, aucune Release, dépôt privé) ne dérange jamais : seule la recherche manuelle l’affiche. */
const log = require('./log');
const pkg = (() => { try { return require('../../package.json'); } catch (e) { return {}; } })();
const pub = (pkg.build && pkg.build.publish) || {}, OWNER = pub.owner || 'Gazein21', REPO = pub.repo || 'hydarium';
const PAGE = `https://github.com/${OWNER}/${REPO}/releases/latest`;
const EVERY = 3600 * 1000;      // une vérification par heure : une version publiée sur GitHub arrive chez les joueurs qui ont le launcher ouvert en moins d'une heure

let env = null, au = null, timer = null, notified = '', instT = null, declined = '';
const S = { status: 'idle', mode: 'auto', current: '', latest: '', percent: 0, error: '', url: PAGE, at: 0, eta: 0 };

const num = v => String(v || '').replace(/^v/i, '').split('-')[0].split('.').map(x => parseInt(x, 10) || 0);
/* 1 si a > b, -1 si a < b, 0 si égal (numéros « 0.10.52 ») */
const cmp = (a, b) => { const A = num(a), B = num(b); for (let i = 0; i < Math.max(A.length, B.length); i++) { const d = (A[i] || 0) - (B[i] || 0); if (d) return d > 0 ? 1 : -1; } return 0; };
exports.cmp = cmp;

const nice = e => {
  const m = String((e && e.message) || e || '');
  if ((e && (e.statusCode === 404 || e.code === 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND')) || /\b404\b|Cannot find latest|No published versions/i.test(m)) return 'Aucune version publiée trouvée (ou dépôt encore privé).';
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET|ENETUNREACH|EAI_AGAIN|net::|fetch failed|network/i.test(m)) return 'Pas de connexion à GitHub.';
  if (/rate limit|\b403\b/i.test(m)) return 'GitHub limite temporairement les demandes : réessaie plus tard.';
  return m.split('\n')[0].slice(0, 200) || 'Erreur inconnue.';
};
const set = o => { Object.assign(S, o); try { env.send('update:state', exports.state()); } catch (e) {} };
exports.state = () => ({ ...S });

/* mode : « auto » = electron-updater (installeur), « manual » = on prévient seulement, « dev » = rien */
function modeOf() {
  if (!env.packaged) return 'dev';
  if (env.platform === 'win32') return env.portable ? 'manual' : 'auto';
  if (env.platform === 'linux' && env.appImage) return 'auto';
  return 'manual';
}

function wire() {
  au.autoDownload = true; au.autoInstallOnAppQuit = true; au.allowPrerelease = false; au.allowDowngrade = false;
  au.logger = { info: m => log.info('updater', m), warn: m => log.warn('updater', m), error: m => log.warn('updater', m), debug() {} };
  au.on('checking-for-update', () => set({ status: 'checking', error: '' }));
  au.on('update-not-available', () => set({ status: 'none', percent: 0, error: '', at: Date.now() }));
  au.on('update-available', i => set({ status: 'downloading', latest: i.version, percent: 0, error: '' }));
  au.on('download-progress', p => set({ status: 'downloading', percent: Math.round(p.percent || 0) }));
  au.on('update-downloaded', i => {
    set({ status: 'ready', latest: i.version, percent: 100, at: Date.now() });
    if (autoNow(i.version)) return;   // installation automatique lancée : le compte à rebours remplace la notification
    if (notified !== i.version) { notified = i.version; try { env.notify('Hydarium ' + i.version + ' est prête', 'La mise à jour s’installera à la fermeture du launcher, ou tout de suite depuis Paramètres.', 'update:open'); } catch (e) {} }
  });
  au.on('error', e => { log.warn('updater erreur', e && e.message); if (S.status !== 'ready') set({ status: 'error', error: nice(e), at: Date.now() }); });
}

/* Installation automatique : dès qu'une mise à jour est téléchargée ET que rien ne tourne (ni partie, ni serveur hébergé), le launcher annonce « redémarrage dans N s »
   (bouton « Plus tard » dans l'interface) puis s'installe et se relance tout seul. Sinon la mise à jour s'installe à la fermeture, comme avant.
   Réglage « Installer automatiquement » (settings.autoInstall, vrai par défaut). */
function autoNow(version) {
  if (instT || declined === version || !au || !env.autoInstall() || env.isBusy()) return false;
  const delay = env.installDelay;
  set({ status: 'installing', eta: Date.now() + delay });
  instT = setTimeout(() => {
    instT = null;
    if (env.isBusy()) { set({ status: 'ready', eta: 0 }); return; }          // une partie vient de démarrer : on attend la fermeture
    try { au.quitAndInstall(true, true); } catch (e) { set({ status: 'error', error: nice(e), eta: 0 }); }
  }, delay);
  if (instT.unref) instT.unref();
  return true;
}
exports.cancel = () => { if (instT) { clearTimeout(instT); instT = null; } if (S.status === 'installing') { declined = S.latest; set({ status: 'ready', eta: 0 }); } return exports.state(); };

/* version non installable automatiquement : on lit la dernière Release et on compare */
async function manualCheck() {
  set({ status: 'checking', error: '' });
  const r = await env.fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Hydarium-Launcher' }, signal: AbortSignal.timeout(15000) });
  if (r.status === 404) throw Object.assign(new Error('404'), { statusCode: 404 });
  if (!r.ok) throw new Error('GitHub ' + r.status);
  const j = await r.json(), v = String(j.tag_name || '').replace(/^v/i, '');
  if (!v) throw new Error('Release sans numéro de version.');
  if (cmp(v, S.current) > 0) {
    set({ status: 'available', latest: v, url: j.html_url || PAGE, at: Date.now() });
    if (notified !== v) { notified = v; try { env.notify('Hydarium ' + v + ' est disponible', 'Télécharge la nouvelle version depuis GitHub.', 'update:open'); } catch (e) {} }
  } else set({ status: 'none', at: Date.now() });
}

/* manual = demandé par la personne : on montre les erreurs. Sinon (lancement, minuteur) on reste silencieux. */
exports.check = async (manual = false) => {
  if (!env) return exports.state();
  if (S.mode === 'dev') { set({ status: 'dev' }); return exports.state(); }
  if (['checking', 'downloading', 'ready', 'installing'].includes(S.status)) return exports.state();
  if (!manual && env.isBusy()) return exports.state(); // pas de téléchargement pendant une partie
  try {
    if (S.mode === 'auto') { if (!au) { au = env.updater(); wire(); } await au.checkForUpdates(); }
    else await manualCheck();
  } catch (e) { if (S.status !== 'error') set({ status: 'error', error: nice(e), at: Date.now() }); }
  if (!manual && S.status === 'error') set({ status: 'idle', error: '' }); // un échec automatique n'est montré nulle part
  return exports.state();
};

/* appelé une fois, la fenêtre ouverte */
exports.init = e => {
  env = { packaged: false, platform: process.platform, portable: false, appImage: false, isBusy: () => false, enabled: () => true, autoInstall: () => true, installDelay: 8000, send() {}, notify() {}, fetch: (...a) => fetch(...a), updater: () => require('electron-updater').autoUpdater, ...e };
  S.current = String(env.version || pkg.version || '0.0.0'); S.mode = modeOf(); S.status = S.mode === 'dev' ? 'dev' : 'idle';
  return exports.state();
};
exports.startup = (delay = 8000) => {
  if (!env || S.mode === 'dev') return;
  setTimeout(() => { if (env.enabled()) exports.check(false).catch(() => {}); }, delay).unref();
  timer = setInterval(() => { if (env.enabled()) exports.check(false).catch(() => {}); }, EVERY); timer.unref();
};
exports.install = () => {
  if (instT) { clearTimeout(instT); instT = null; }
  if ((S.status !== 'ready' && S.status !== 'installing') || !au) throw new Error('Aucune mise à jour prête à installer.');
  if (env.isBusy()) throw new Error('Ferme Minecraft avant d’installer la mise à jour.');
  setImmediate(() => au.quitAndInstall(false, true)); // fenêtre d’installation discrète, relance d’Hydarium ensuite
};
exports._reset = () => { au = null; env = null; notified = ''; declined = ''; if (instT) clearTimeout(instT); instT = null; if (timer) clearInterval(timer); Object.assign(S, { status: 'idle', mode: 'auto', current: '', latest: '', percent: 0, error: '', url: PAGE, at: 0 }); };
exports.PAGE = PAGE;
