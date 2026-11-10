/* Mises à jour : installeur (electron-updater simulé), version portable (API GitHub simulée), développement, erreurs silencieuses, pas d'installation pendant une partie. */
const assert = require('assert'), path = require('path'), { EventEmitter } = require('events');
const base = path.join(__dirname, '..', 'src', 'main');
const stub = (name, exp) => { const f = require.resolve(path.join(base, name)); require.cache[f] = { id: f, filename: f, loaded: true, exports: exp }; };
stub('log.js', { info() {}, warn() {}, error() {} });
const up = require(path.join(base, 'updater.js'));
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }, eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };
const tick = (ms = 5) => new Promise(r => setTimeout(r, ms));

/* faux electron-updater : checkForUpdates() joue un scénario */
const fakeAu = scenario => { const au = new EventEmitter(); au.calls = 0; au.quit = null;
  au.checkForUpdates = async () => { au.calls++; au.emit('checking-for-update'); await tick(1); return scenario(au); };
  au.quitAndInstall = (...a) => { au.quit = a; }; return au; };
const mk = (o = {}) => { const log = { sent: [], notes: [] }; up._reset();
  up.init({ packaged: true, platform: 'win32', version: '0.10.51', send: (c, d) => log.sent.push([c, d]), notify: (t, b, a) => log.notes.push([t, b, a]), ...o }); return log; };

(async () => {
  // 1) comparaison de versions
  ok(up.cmp('0.10.52', '0.10.51') === 1 && up.cmp('0.10.9', '0.10.10') === -1 && up.cmp('v1.0.0', '1.0.0') === 0 && up.cmp('1.0', '1.0.0') === 0 && up.cmp('0.11.0', '0.10.99') === 1, 'cmp');

  // 2) développement : rien ne se passe
  let L = mk({ packaged: false }); let s = await up.check(true); ok(s.status === 'dev' && s.mode === 'dev', 'dev : désactivé');

  // 3) installeur : nouvelle version → téléchargement → prête, notification une seule fois
  let au = fakeAu(a => { a.emit('update-available', { version: '0.10.52' }); a.emit('download-progress', { percent: 41.6 }); a.emit('update-downloaded', { version: '0.10.52' }); });
  L = mk({ updater: () => au }); eq(up.state().mode, 'auto', 'mode auto');
  await up.check(false); s = up.state();
  ok(s.status === 'ready' && s.latest === '0.10.52' && s.percent === 100, 'mise à jour prête');
  ok(L.sent.some(([c, d]) => c === 'update:state' && d.status === 'downloading' && d.percent === 42), 'progression envoyée à l’interface');
  ok(L.notes.length === 1 && /0\.10\.52/.test(L.notes[0][0]), 'une notification');
  au.emit('update-downloaded', { version: '0.10.52' }); ok(L.notes.length === 1, 'pas de seconde notification pour la même version');
  const c = au.calls; await up.check(false); ok(au.calls === c, 'rien de plus à chercher tant qu’une mise à jour est prête');

  // 4) installation : refusée pendant une partie, sinon quitAndInstall (silencieux, relance)
  let busy = true; L = mk({ updater: () => au, isBusy: () => busy });
  au.checkForUpdates = async () => { au.emit('update-available', { version: '0.10.52' }); au.emit('update-downloaded', { version: '0.10.52' }); };
  await up.check(true); ok(up.state().status === 'ready', 'prête (recherche manuelle autorisée pendant une partie)');
  assert.throws(() => up.install(), /Ferme Minecraft/); n++; ok(au.quit === null, 'pas d’installation en jeu');
  busy = false; up.install(); await tick(); eq(au.quit, [false, true], 'quitAndInstall(false, true)');
  assert.throws(() => { mk({ updater: () => fakeAu(() => {}) }); up.install(); }, /Aucune mise à jour/); n++;

  // 5) à jour
  au = fakeAu(a => a.emit('update-not-available', {})); L = mk({ updater: () => au }); await up.check(true); ok(up.state().status === 'none', 'à jour');

  // 6) pas de recherche automatique pendant une partie
  au = fakeAu(() => {}); L = mk({ updater: () => au, isBusy: () => true }); await up.check(false); ok(au.calls === 0, 'pas de recherche automatique en jeu');

  // 7) erreurs : silencieuses en automatique, expliquées en manuel
  const boom = (msg, extra) => fakeAu(a => { const e = Object.assign(new Error(msg), extra); a.emit('error', e); throw e; });
  L = mk({ updater: () => boom('Cannot find latest.yml', { statusCode: 404 }) }); await up.check(false); s = up.state();
  ok(s.status === 'idle' && s.error === '', 'erreur automatique : aucune trace dans l’interface'); ok(L.notes.length === 0, 'ni notification');
  L = mk({ updater: () => boom('HttpError: 404 Not Found', { statusCode: 404 }) }); await up.check(true); ok(up.state().status === 'error' && /Aucune version publiée.*privé/.test(up.state().error), 'manuel 404 : message clair');
  L = mk({ updater: () => boom('getaddrinfo ENOTFOUND github.com') }); await up.check(true); ok(/connexion/i.test(up.state().error), 'manuel hors ligne : message clair');
  L = mk({ updater: () => boom('API rate limit exceeded') }); await up.check(true); ok(/limite/i.test(up.state().error), 'manuel limite GitHub');
  // après une erreur on peut réessayer
  au = fakeAu(a => a.emit('update-not-available', {})); L = mk({ updater: () => au }); au.checkForUpdates = async () => { au.calls++; au.emit('error', new Error('x')); throw new Error('x'); };
  await up.check(true); ok(up.state().status === 'error', 'erreur'); au.checkForUpdates = async () => { au.emit('update-not-available', {}); }; await up.check(true); ok(up.state().status === 'none', 'réessai possible');

  // 8) portable / hors installeur : on prévient seulement (API GitHub simulée)
  const gh = (status, body) => async url => { gh.url = String(url); return { ok: status < 400, status, json: async () => body }; };
  L = mk({ portable: true, fetch: gh(200, { tag_name: 'v0.10.52', html_url: 'https://github.com/Gazein21/hydarium/releases/tag/v0.10.52' }) }); eq(up.state().mode, 'manual', 'portable = manuel');
  await up.check(false); s = up.state(); ok(s.status === 'available' && s.latest === '0.10.52' && /releases\/tag/.test(s.url), 'portable : nouvelle version signalée');
  ok(/api\.github\.com\/repos\/Gazein21\/hydarium\/releases\/latest/.test(gh.url), 'bon dépôt interrogé'); ok(L.notes.length === 1, 'notification');
  L = mk({ portable: true, fetch: gh(200, { tag_name: 'v0.10.51' }) }); await up.check(true); ok(up.state().status === 'none', 'portable à jour');
  L = mk({ portable: true, fetch: gh(200, { tag_name: 'v0.9.0' }) }); await up.check(true); ok(up.state().status === 'none', 'jamais de retour en arrière');
  L = mk({ portable: true, fetch: gh(404, {}) }); await up.check(false); ok(up.state().status === 'idle', 'portable : 404 silencieux en automatique');
  L = mk({ portable: true, fetch: gh(404, {}) }); await up.check(true); ok(/Aucune version publiée/.test(up.state().error), 'portable : 404 expliqué en manuel');
  L = mk({ platform: 'darwin', fetch: gh(200, { tag_name: 'v9.0.0' }) }); eq(up.state().mode, 'manual', 'macOS = manuel');
  L = mk({ platform: 'linux', appImage: true }); eq(up.state().mode, 'auto', 'AppImage = auto');

  // 9) réglage « Mises à jour automatiques » coupé : le lancement ne vérifie pas
  au = fakeAu(a => a.emit('update-not-available', {})); let enabled = false; L = mk({ updater: () => au, enabled: () => enabled });
  up.startup(5); await tick(40); ok(au.calls === 0, 'réglage coupé : pas de recherche au lancement');
  up._reset(); au = fakeAu(a => a.emit('update-not-available', {})); enabled = true; up.init({ packaged: true, platform: 'win32', version: '0.10.51', updater: () => au, enabled: () => enabled });
  up.startup(5); await tick(60); ok(au.calls === 1, 'réglage actif : une recherche au lancement');
  up._reset();
  console.log('updater.test.js : ' + n + ' vérifications OK'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
