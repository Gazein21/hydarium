/* Installation automatique de Java : essais, secours, archive invalide, ancien Java cassé (plateforme Linux/macOS ici : tar.gz). */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
if (process.platform === 'win32') { console.log('jre.test.js : ignoré sous Windows (archive tar.gz simulée)'); process.exit(0); }
const base = path.join(__dirname, '..', 'src', 'main'), data = fs.mkdtempSync(path.join(os.tmpdir(), 'hydjre-'));
const stub = (name, exp) => { const f = require.resolve(path.join(base, name)); require.cache[f] = { id: f, filename: f, loaded: true, exports: exp }; };
const settings = {}; let infoCalls = 0, broken = 0;
stub('platform.js', { dataDir: () => data, javaInfo: async p => { infoCalls++; if (broken > 0) { broken--; return null; } return fs.existsSync(p) ? { path: p, major: 17 } : null; } });
stub('store.js', { get: () => ({ settings }), save: () => {} });
stub('log.js', { info() {}, warn() {}, error() {} });
const jre = require(path.join(base, 'jre.js'));
// archive factice : bin/java + 6 Mo incompressibles (> seuil de 5 Mo)
const src = fs.mkdtempSync(path.join(os.tmpdir(), 'hydsrc-')); fs.mkdirSync(path.join(src, 'jdk', 'bin'), { recursive: true });
fs.writeFileSync(path.join(src, 'jdk', 'bin', 'java'), '#!/bin/sh\n'); fs.writeFileSync(path.join(src, 'jdk', 'pad.bin'), require('crypto').randomBytes(6e6));
spawnSync('tar', ['-czf', path.join(src, 'a.tgz'), '-C', src, 'jdk']); const good = fs.readFileSync(path.join(src, 'a.tgz'));
const realTO = global.setTimeout; global.setTimeout = (f, ms, ...a) => realTO(f, 0, ...a); // pas d'attente entre les essais
const resp = (status, body) => ({ ok: status < 400, status, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength), json: async () => JSON.parse(String(body)) });
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
(async () => {
  // 1) aucun accès réseau : trois fournisseurs essayés, cause lisible, code JAVA_DL
  let calls = 0; global.fetch = async () => { calls++; const e = new TypeError('fetch failed'); e.cause = { code: 'ENOTFOUND' }; throw e; };
  let err = null; try { await jre.install(8); } catch (e) { err = e; }
  ok(err && err.code === 'JAVA_DL', 'échec total : code JAVA_DL'); ok(/Adoptium : pas de connexion Internet/.test(err.message) && /Azul/.test(err.message), 'cause réseau lisible, 3 fournisseurs essayés');
  ok(calls >= 7, '3 essais par fournisseur Adoptium (+ Azul) : ' + calls + ' appels');
  // 2) 404 chez Adoptium (JRE) : pas de réessai inutile, on passe au JDK qui marche
  const urls = []; global.fetch = async u => { urls.push(String(u)); return /\/jre\//.test(u) ? resp(404, Buffer.from('nope')) : resp(200, good); };
  let info = await jre.install(8); ok(info && info.major === 17, 'le JDK de secours est installé'); ok(urls.filter(u => /\/jre\//.test(u)).length === 1, '404 : un seul essai');
  ok(settings.javas.some(p => /java-8/.test(p)), 'le Java est enregistré dans les Java connus');
  // 3) déjà installé et valide : aucun téléchargement
  urls.length = 0; info = await jre.install(8); ok(info && urls.length === 0, 'déjà installé : rien à télécharger');
  // 4) installé mais cassé : il est supprimé puis réinstallé
  broken = 1; urls.length = 0; info = await jre.install(8); ok(info && urls.length >= 1, 'Java cassé : retéléchargé au lieu de rester bloqué');
  // 5) page d'erreur HTML (200 mais pas une archive) : refusée, on essaie le suivant
  fs.rmSync(path.join(data, 'runtimes'), { recursive: true, force: true }); urls.length = 0;
  global.fetch = async u => { urls.push(String(u)); return /\/jre\//.test(u) ? resp(200, Buffer.from('<html>captif</html>')) : resp(200, good); };
  info = await jre.install(17); ok(info && /jdk/.test(urls[urls.length - 1]), 'archive invalide ignorée, secours utilisé');
  global.setTimeout = realTO; fs.rmSync(data, { recursive: true, force: true }); fs.rmSync(src, { recursive: true, force: true });
  console.log('jre.test.js : ' + n + ' contrôles OK');
})().catch(e => { console.error(e); process.exit(1); });
