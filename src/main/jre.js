/* Télécharge un Java (Eclipse Temurin, JRE) quand la version de Minecraft en demande un qui n’est pas installé (ex. Java 8 pour 1.8.9). */
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const plat = require('./platform'), store = require('./store'), log = require('./log');
const exe = process.platform === 'win32' ? 'java.exe' : 'java';
function findJava(d, depth = 0) { try { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isFile() && e.name === exe && path.basename(d) === 'bin') return p; if (e.isDirectory() && depth < 5) { const r = findJava(p, depth + 1); if (r) return r; } } } catch (e) {} return ''; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
/* cause lisible d’une erreur réseau (fetch répond « fetch failed » et cache la vraie cause dans .cause) */
const why = e => {
  const c = (e && e.cause && (e.cause.code || e.cause.message)) || (e && e.code) || '', m = (e && e.message) || '', s = c + ' ' + ((e && e.name) || '') + ' ' + m;
  return /ENOTFOUND|EAI_AGAIN/.test(s) ? 'pas de connexion Internet (ou site bloqué)' : /Timeout|ETIMEDOUT|CONNECT_TIMEOUT|aborted/i.test(s) ? 'délai dépassé' : /ECONNRESET|SOCKET|terminated/i.test(s) ? 'connexion interrompue' : /CERT|SSL|TLS/i.test(s) ? 'certificat refusé (antivirus ou proxy ?)' : /^HTTP \d+/.test(m) ? 'serveur : ' + m : (m || String(c) || 'erreur inconnue');
};
/* téléchargement avec 3 essais (sauf refus définitif 4xx) et délai maximal de 5 minutes */
async function fetchBuf(url, label, status) {
  let last;
  for (let n = 1; n <= 3; n++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Hydarium/0.10' }, redirect: 'follow', signal: AbortSignal.timeout(300000) });
      if (!r.ok) { const e = new Error('HTTP ' + r.status); e.http = r.status; throw e; }
      return Buffer.from(await r.arrayBuffer());
    } catch (e) {
      last = e; if (e.http && e.http >= 400 && e.http < 500 && e.http !== 408 && e.http !== 429) break;
      if (n < 3) { status(label + ' : nouvel essai (' + (n + 1) + '/3)…'); await sleep(1500 * n); }
    }
  }
  throw last;
}
/* une archive tronquée ou une page d’erreur HTML ne doit jamais être extraite */
const okArchive = (buf, win) => !!buf && buf.length > 5e6 && (win ? buf[0] === 0x50 && buf[1] === 0x4b : buf[0] === 0x1f && buf[1] === 0x8b);
/* le premier démarrage d’un Java tout juste extrait peut être lent (analyse antivirus) : 3 essais à délai croissant */
async function register(j, major) {
  const info = await plat.javaInfo(j, 3); if (!info) return null;
  const s = store.get().settings; s.javas = s.javas || []; if (!s.javas.includes(j)) { s.javas.push(j); store.save(); }
  log.info('Java installé', major, j); return info;
}
exports.install = async (major, status = () => {}) => {
  major = +major; if (!(major >= 8 && major <= 25)) throw new Error('Version de Java non proposée.');
  const dir = path.join(plat.dataDir(), 'runtimes', 'java-' + major), win = process.platform === 'win32';
  let j = findJava(dir);
  if (j) { const ok = await register(j, major); if (ok) return ok; log.warn('Java téléchargé auparavant mais inutilisable : nouvelle installation', j); fs.rmSync(dir, { recursive: true, force: true }); } // un Java cassé ne doit pas bloquer pour toujours
  const os = win ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux', arch = process.arch === 'arm64' ? 'aarch64' : 'x64', azOs = os === 'mac' ? 'macos' : os;
  const sources = [
    ['Adoptium', async () => `https://api.adoptium.net/v3/binary/latest/${major}/ga/${os}/${arch}/jre/hotspot/normal/eclipse`],
    ['Adoptium (JDK)', async () => `https://api.adoptium.net/v3/binary/latest/${major}/ga/${os}/${arch}/jdk/hotspot/normal/eclipse`],
    ['Azul', async () => { // dernier recours : autre fournisseur (adresse de l’archive donnée par leur API)
      const r = await fetch(`https://api.azul.com/metadata/v1/zulu/packages/?java_version=${major}&os=${azOs}&arch=${arch}&archive_type=${win ? 'zip' : 'tar.gz'}&java_package_type=jre&javafx_bundled=false&latest=true&release_status=ga&page=1&page_size=1`, { headers: { 'User-Agent': 'Hydarium/0.10' }, signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error('HTTP ' + r.status); const l = await r.json(); if (!l[0] || !l[0].download_url) throw new Error('aucun paquet pour ce système'); return l[0].download_url;
    }]
  ], errs = [];
  for (const [name, url] of sources) {
    try {
      status('Téléchargement de Java ' + major + ' (' + name + ')…');
      const buf = await fetchBuf(await url(), 'Java ' + major, status);
      if (!okArchive(buf, win)) throw new Error('archive incomplète ou invalide');
      status('Installation de Java ' + major + '…');
      fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
      if (win) {
        const Zip = require('adm-zip'), z = new Zip(buf);
        for (const e of z.getEntries()) { if (e.isDirectory) continue; const t = path.resolve(dir, e.entryName); if (!t.startsWith(dir + path.sep)) continue; fs.mkdirSync(path.dirname(t), { recursive: true }); fs.writeFileSync(t, e.getData()); }
      } else {
        const tmp = path.join(dir, 'jre.tar.gz'); fs.writeFileSync(tmp, buf); const t = spawnSync('tar', ['-xzf', tmp, '-C', dir]); fs.rmSync(tmp, { force: true });
        if (t.status !== 0) throw new Error('extraction impossible (commande tar)');
      }
      j = findJava(dir); if (!j) throw new Error('Java introuvable dans l’archive');
      const info = await register(j, major); if (!info) throw new Error('le Java téléchargé ne démarre pas (antivirus ?)');
      return info;
    } catch (e) { errs.push(name + ' : ' + why(e)); log.warn('Java ' + major + ' via ' + name + ' :', e.message); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (x) {} }
  }
  const e = new Error('Java ' + major + ' : ' + errs.join(' ; ')); e.code = 'JAVA_DL'; throw e;
};
