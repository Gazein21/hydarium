/* Publier une version : node scripts/release.js 0.10.53   (ou  npm run release -- 0.10.53)
   Vérifie que tout est prêt, change le numéro dans package.json, lance les tests, fait le commit « Version X », le tag « vX » et pousse.
   Le push du tag déclenche GitHub Actions (.github/workflows/build.yml) qui fabrique l'installeur et crée la Release.
   Options : --dry (ne modifie rien, montre seulement ce qui serait fait) · --no-test (saute npm test, déconseillé). */
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = process.env.RELEASE_ROOT || path.join(__dirname, '..');
const args = process.argv.slice(2), flag = f => args.includes(f), ver = args.find(a => /^\d+\.\d+\.\d+$/.test(a));
const sh = (c, o = {}) => cp.execSync(c, { cwd: root, encoding: 'utf8', stdio: o.show ? 'inherit' : ['ignore', 'pipe', 'pipe'] });
const num = v => v.split('.').map(Number), newer = (a, b) => { const A = num(a), B = num(b); for (let i = 0; i < 3; i++) if (A[i] !== B[i]) return A[i] > B[i]; return false; };
const die = m => { console.error('✗ ' + m); process.exit(1); };
const step = m => console.log('→ ' + m);

if (!ver) die('Donne un numéro de version, par exemple :  npm run release -- 0.10.53');
const pj = path.join(root, 'package.json'), pkg = JSON.parse(fs.readFileSync(pj, 'utf8'));
if (!newer(ver, pkg.version)) die(`La version ${ver} doit être plus grande que l'actuelle (${pkg.version}).`);
try { sh('git rev-parse --is-inside-work-tree'); } catch (e) { die('Ce dossier n’est pas un dépôt git : fais d’abord « git init » et connecte-le à GitHub (voir docs/PUBLIER-SUR-GITHUB.md).'); }
let remote = ''; try { remote = sh('git remote get-url origin').trim(); } catch (e) { die('Aucun dépôt GitHub connecté (« origin » absent) : voir docs/PUBLIER-SUR-GITHUB.md.'); }
const branch = sh('git rev-parse --abbrev-ref HEAD').trim();
if (branch !== 'main' && !flag('--any-branch')) die(`Tu es sur la branche « ${branch} » : publie depuis « main ».`);
if (sh(`git tag -l v${ver}`).trim()) die(`Le tag v${ver} existe déjà : un numéro de version ne se réutilise jamais.`);
const fiche = fs.readFileSync(path.join(root, 'docs', 'FICHE-DE-REPRISE.md'), 'utf8');
if (!new RegExp('^## ' + ver.replace(/\./g, '\\.') + '\\b', 'm').test(fiche)) die(`Ajoute d’abord une section « ## ${ver} — … » à la fin de docs/FICHE-DE-REPRISE.md (les tests l’exigent).`);

console.log(`Version ${pkg.version} → ${ver}   dépôt : ${remote}   branche : ${branch}`);
if (flag('--dry')) { console.log('(essai à blanc : rien n’a été modifié)'); process.exit(0); }
try {
  step('numéro de version'); sh(`npm version ${ver} --no-git-tag-version --ignore-scripts`);
  if (!flag('--no-test')) { step('tests (npm test)'); sh('npm test', { show: true }); }
  step('commit'); sh('git add -A'); sh(`git commit -m "Version ${ver}"`);
  step('tag v' + ver); sh(`git tag v${ver}`);
  step('envoi vers GitHub'); sh(`git push origin ${branch}`, { show: true }); sh(`git push origin v${ver}`, { show: true });
} catch (e) { die('Échec : ' + (e.stderr || e.message).toString().trim().split('\n').slice(-6).join('\n') + '\nRien n’est publié tant que le tag n’est pas poussé ; corrige puis relance.'); }
const m = /github\.com[:/]([^/]+\/[^/.]+)/.exec(remote);
console.log(`\n✓ Version ${ver} envoyée. GitHub fabrique l’installeur (≈ 10-20 min) :${m ? `\n  suivi    : https://github.com/${m[1]}/actions\n  Release  : https://github.com/${m[1]}/releases/tag/v${ver}` : ''}`);
