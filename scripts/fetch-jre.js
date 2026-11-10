/* Télécharge Java 21 (Eclipse Temurin) pour l’embarquer dans l’installeur : le joueur n’a rien d’autre à installer.
   Utilisable en ligne de commande (npm run dist:win) ou comme module : fetchJre({ onProgress(octets, total), onStep(texte) }). */
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const { download, fmtMB } = require('./util');
const osName = { win32: 'windows', darwin: 'mac', linux: 'linux' }[process.platform], arch = process.arch === 'arm64' ? 'aarch64' : 'x64';
const out = path.join(__dirname, '..', 'build-jre'), dest = path.join(out, 'jre');

async function fetchJre({ onProgress, onStep } = {}) {
  const say = onStep || (t => console.log(t));
  if (fs.existsSync(dest)) { say('Java déjà présent.'); return false; }
  const ext = osName === 'windows' ? 'zip' : 'tar.gz', tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jre-')), file = path.join(tmp, 'jre.' + ext);
  say('Téléchargement de Java 21…');
  await download(`https://api.adoptium.net/v3/binary/latest/21/ga/${osName}/${arch}/jre/hotspot/normal/eclipse`, file, (g, t) => { if (onProgress) onProgress(g, t); });
  say('Installation de Java 21…');
  const x = path.join(tmp, 'x'); fs.mkdirSync(x);
  execFileSync('tar', ['-xf', file, '-C', x]);
  fs.mkdirSync(out, { recursive: true });
  fs.cpSync(path.join(x, fs.readdirSync(x)[0]), dest, { recursive: true });
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  const rel = fs.readFileSync(path.join(dest, fs.existsSync(path.join(dest, 'release')) ? 'release' : 'Contents/Home/release'), 'utf8');
  const v = (rel.match(/JAVA_VERSION="?(\d+)/) || [])[1];
  if (v !== '21') { fs.rmSync(dest, { recursive: true, force: true }); throw new Error('Java téléchargé en version ' + v + ' au lieu de 21 : annulé.'); }
  say('Java 21 prêt.'); return true;
}
module.exports = { fetchJre };

if (require.main === module) fetchJre().catch(e => { console.error(e.message); process.exit(1); });
