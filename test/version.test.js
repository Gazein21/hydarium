/* Le numéro de version (package.json) doit suivre la fiche de reprise : il donne le nom de l'exe (Hydarium-<version>-…) et la pastille « v… » de la barre de titre.
   Il était resté à 0.10.35 alors que le projet avançait : plus personne ne savait quelle version il utilisait. */
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')), fiche = fs.readFileSync(path.join(root, 'docs', 'FICHE-DE-REPRISE.md'), 'utf8');
const cmp = (a, b) => { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };

test('package.json : version bien formée', () => assert.match(pkg.version, /^\d+\.\d+\.\d+$/));
test('la version de package.json = la dernière section de la fiche de reprise', () => {
  const vs = [...fiche.matchAll(/^## (\d+)\.(\d+)\.(\d+)\b/gm)].map(m => [+m[1], +m[2], +m[3]]);
  assert.ok(vs.length, 'aucune section « ## x.y.z » dans la fiche');
  const last = vs.sort(cmp).pop().join('.');
  assert.strictEqual(pkg.version, last, `package.json = ${pkg.version} mais la fiche s'arrête à ${last} : changer \`version\` dans package.json (le nom de l'exe et la barre de titre en dépendent) ou ajouter la section manquante`);
});
test('l\'interface affiche bien la version de l\'application', () => {
  assert.match(fs.readFileSync(path.join(root, 'src', 'renderer', 'app.js'), 'utf8'), /#ver'\)\.textContent = 'v' \+ pf\.version/);
  assert.match(fs.readFileSync(path.join(root, 'src', 'main', 'main.js'), 'utf8'), /version: app\.getVersion\(\)/);
});
