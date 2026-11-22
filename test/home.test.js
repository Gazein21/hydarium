/* Accueil : la rubrique « Quêtes du mois » (qui n'a jamais été prévue pour apparaître) est retirée ; « Amis en ligne » prend toute la largeur au lieu de laisser une demi-rangée vide. */
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const r = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
test('plus de « Quêtes du mois » nulle part dans l’interface ni dans les traductions', () => {
  for (const f of ['src/renderer/app.js', 'src/renderer/i18n.js', 'src/renderer/index.html', 'src/renderer/style.css']) assert.ok(!/qu[êe]tes? du mois|monthly quest/i.test(r(f)), f);
});
test('l’accueil garde « Amis en ligne », en pleine largeur (plus de grille à deux colonnes vide)', () => {
  const app = r('src/renderer/app.js'), a = app.indexOf('<h3>Mes serveurs</h3>'), b = app.indexOf('function instPage()'); assert.ok(a > 0 && b > a);
  const home = app.slice(a, b); assert.ok(home.includes('<h3>Amis en ligne</h3>'), 'Amis en ligne conservé'); assert.ok(!/class="two"/.test(home), 'plus de rangée à deux colonnes'); assert.ok(!/class="[^"]*\bsoon\b[^"]*"[^>]*>(?:(?!<\/div>).)*Quêtes/.test(home));
});
