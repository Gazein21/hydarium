/* Mode confidentialité (stream) : aucune adresse de serveur ni code d'invitation n'est affiché en clair tant que le réglage est actif (par défaut). */
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8').replace(/\r\n/g, '\n');

/* les 3 fonctions de l'interface, extraites du vrai fichier et exécutées avec une icône factice */
const grab = name => { const m = new RegExp('const ' + name + ' = [^\\n]*').exec(src); assert.ok(m, name + ' introuvable dans app.js'); return m[0]; };
const make = cfg => new Function('cfg', 'ic', grab('privOn') + '\n' + grab('priv') + '\n' + grab('privIn') + '\nreturn { privOn, priv, privIn };')(cfg, () => '<svg/>');

test('actif par défaut : texte flouté + bouton œil ; coupé : texte tel quel', () => {
  for (const cfg of [undefined, {}, { privacy: true }]) { const p = make(cfg); assert.strictEqual(p.privOn(), true); const h = p.priv('mc.exemple.fr'); assert.match(h, /<span class="priv">mc\.exemple\.fr<\/span>/); assert.match(h, /data-a="eye"/); assert.strictEqual(p.privIn(), 'privin'); }
  const off = make({ privacy: false }); assert.strictEqual(off.priv('mc.exemple.fr'), 'mc.exemple.fr'); assert.strictEqual(off.privIn(), '');
});

test('chaque endroit qui montre une adresse ou un code passe par priv()', () => {
  const must = [
    ['liste « Mes serveurs »', "priv(esc(s.addr))"], ['accueil', "priv(esc(x.addr))"], ['adresses réseau local et Internet de l\'hôte (« Autres adresses »)', "priv(esc(x.a))"],
    ['bloc playit.gg', "priv(esc(addr))"], ['code d\'invitation', "priv(esc(I.code))"],
    ['fenêtre « rejoindre »', "priv(esc(S.addr))"], ['statistiques', "priv(esc(t.addr))"], ['champ d\'ajout', '<input id="sa" class="${privIn()}"'], ['champ de modification', '<input id="sq-a" class="${privIn()}"'] ];
  for (const [nom, motif] of must) assert.ok(src.includes(motif), 'non flouté : ' + nom);
  // interdits : une adresse ou le code affichés en clair dans du texte visible (hors attributs data-v / value)
  for (const bad of ["<small>${esc(x.addr)}", "esc(s.addr)}${s.fromGame", "<b class=\"p2pcode\">${esc(I.code)}", "<h2 style=\"margin:0 0 4px\">${esc(S.addr)}", "<span>${esc(t.addr)}</span>"]) assert.ok(!src.includes(bad), 'affichage en clair : ' + bad);
});

test('« Copier » et « Rejoindre » portent la vraie valeur (data-v), pas l\'affichage flouté', () => {
  assert.ok(src.includes('data-a="p2pcopy" data-v="${esc(I.code)}"')); assert.ok(src.includes("data-a=\"pgcopy\" data-v=\"' + esc(addr)"));
});
