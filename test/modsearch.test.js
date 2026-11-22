/* Onglet Mods d'une instance : filtre des mods INSTALLÉS par nom (actifs et désactivés), barre de recherche dans la zone « sélection multiple », « Tout sélectionner » près des boutons. */
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const a = src.indexOf("let MODF = ''"), z = src.indexOf('/* état de la récupération des skins Mojang'); assert.ok(a > 0 && z > a);
const line = name => { const m = new RegExp('const ' + name + ' = [^\\n]*').exec(src); assert.ok(m, name + ' introuvable'); return m[0]; };
const code = src.slice(a, z) + '\n' + line('modBar') + '\n' + line('modsSplit');

const make = (SELM = new Set(), dom = null) => new Function('esc', 'ic', 'SELM', '$', 'document', code + '\nreturn { nrm, modMatch, modTerms, modFind, modBar, modsSplit, modFilter, nSel, get MODF() { return MODF; }, set MODF(v) { MODF = v; } };')(
  x => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'), (n) => '[' + n + ']', SELM, q => (dom && dom.byId[q.slice(1)]) || null, dom ? dom.document : { querySelectorAll: () => [], querySelector: () => null });

const MODS = [{ pid: 'a', title: 'Sodium', file: 'sodium-fabric-0.5.jar', slug: 'sodium' }, { pid: 'b', title: 'Iris Shaders', file: 'iris-1.7.jar', slug: 'iris' }, { pid: 'c', title: 'Éclairage amélioré', file: 'lux.jar', slug: 'lux', disabled: true }, { pid: 'd', title: 'Lithium', file: 'lithium.jar', slug: 'lithium', disabled: true }, { pid: 'e', title: 'Mod sans image', file: 'x.jar' }];

test('correspondance : tous les mots, accents et majuscules ignorés, titre / fichier / identifiant', () => {
  const t = make(), hits = q => MODS.filter(m => t.modMatch(m, t.modTerms(q))).map(m => m.pid).join('');
  assert.strictEqual(hits(''), 'abcde', 'champ vide : tout'); assert.strictEqual(hits('sod'), 'a'); assert.strictEqual(hits('SODIUM'), 'a'); assert.strictEqual(hits('iris shad'), 'b', 'deux mots'); assert.strictEqual(hits('shad iris'), 'b', 'ordre libre');
  assert.strictEqual(hits('eclairage'), 'c', 'accents ignorés'); assert.strictEqual(hits('éclair'), 'c'); assert.strictEqual(hits('lithium'), 'd', 'mod désactivé trouvé aussi'); assert.strictEqual(hits('fabric'), 'a', 'nom de fichier'); assert.strictEqual(hits('iris sodium'), '', 'les deux mots doivent correspondre'); assert.strictEqual(hits('zzz'), '');
  assert.strictEqual(hits('  sodium  '), 'a', 'espaces autour ignorés'); assert.strictEqual(hits('1.7'), 'b');
});

test('groupes Actifs / Désactivés : compteurs du filtre et titre masqué quand plus rien ne correspond', () => {
  const t = make(); t.MODF = ''; let h = t.modsSplit(MODS, x => '<card ' + x.pid + '/>', 'VIDE'); assert.ok(h.includes('Actifs (<span class="gc">3</span>)') && h.includes('Désactivés (<span class="gc">2</span>)') && !/data-gh="\w+" hidden/.test(h));
  t.MODF = 'lithium'; h = t.modsSplit(MODS, x => '<card ' + x.pid + '/>', 'VIDE'); assert.ok(h.includes('data-gh="on" hidden') && h.includes('Actifs (<span class="gc">0</span>)') && h.includes('Désactivés (<span class="gc">1</span>)') && !/data-gh="off" hidden/.test(h), 'groupe Actifs masqué, Désactivés à 1');
  assert.strictEqual(t.modsSplit([], () => '', 'VIDE'), 'VIDE');
});

test('barre sous les boutons : recherche quand rien n’est sélectionné, actions sinon (la recherche passe alors à côté du total)', () => {
  const t = make(); let bar = t.modBar(0, 5, MODS);
  assert.ok(bar.includes('id="modf"') && bar.includes('Filtrer les mods installés par nom') && !bar.includes('Sélection multiple') && !bar.includes('mselact'), 'aucune sélection : champ de recherche, plus de texte « Sélection multiple »');
  t.MODF = 'li'; bar = t.modBar(0, 5, MODS); assert.ok(/<span id="modcount" class="mu">2 sur 5<\/span>/.test(bar), 'compteur « 2 sur 5 » (Éclairage amélioré, Lithium)'); assert.ok(bar.includes('value="li"') && !/data-a="modfclear" title="Effacer" hidden/.test(bar), 'valeur conservée, bouton effacer visible');
  bar = t.modBar(2, 5, MODS); assert.ok(bar.includes('<b>2</b> sélectionnés') && bar.includes('data-v="off"') && bar.includes('data-v="on"') && bar.includes('data-v="remove"') && bar.includes('mselnone') && !bar.includes('id="modf"'), 'sélection : actions, plus de champ ici');
  assert.ok(t.modFind('sm', MODS).includes('modf sm'), 'variante compacte pour la ligne du total'); assert.strictEqual(make(new Set(['a', 'c'])).nSel(MODS), 2);
});

/* faux DOM : suffisant pour modFilter */
const fakeDom = () => { const cards = MODS.map(m => ({ dataset: { mn: make().nrm([m.title, m.file, m.slug].filter(Boolean).join(' ')), g: m.disabled ? 'off' : 'on' }, hidden: false })); const heads = ['on', 'off'].map(g => ({ dataset: { gh: g }, hidden: false, c: { textContent: '' }, querySelector() { return this.c; } }));
  const count = { textContent: '' }, bold = { textContent: '' }, none = { hidden: true, querySelector: () => bold }, clear = { hidden: true };
  return { cards, heads, count, none, bold, clear, byId: { modcount: count, modnone: none }, document: { querySelectorAll: q => q === '.mcard' ? cards : q === '[data-gh]' ? heads : [], querySelector: () => clear } }; };

test('filtre en direct : masque les cartes, met à jour les compteurs, le message « aucun résultat » et le bouton effacer', () => {
  const d = fakeDom(), t = make(new Set(), d);
  t.modFilter('sodium'); assert.deepStrictEqual(d.cards.map(c => c.hidden), [false, true, true, true, true]); assert.strictEqual(d.count.textContent, '1 sur 5'); assert.strictEqual(d.heads[0].hidden, false); assert.strictEqual(d.heads[0].c.textContent, 1); assert.strictEqual(d.heads[1].hidden, true, 'groupe Désactivés vide : titre masqué'); assert.strictEqual(d.none.hidden, true); assert.strictEqual(d.clear.hidden, false);
  t.modFilter('lithium'); assert.deepStrictEqual(d.cards.map(c => c.hidden), [true, true, true, false, true], 'les mods désactivés sont filtrés aussi'); assert.strictEqual(d.heads[0].hidden, true); assert.strictEqual(d.heads[1].hidden, false);
  t.modFilter('Zzz Introuvable'); assert.ok(d.cards.every(c => c.hidden)); assert.strictEqual(d.none.hidden, false, 'message « aucun résultat » affiché'); assert.strictEqual(d.bold.textContent, 'Zzz Introuvable'); assert.ok(d.heads.every(h => h.hidden));
  t.modFilter(''); assert.ok(d.cards.every(c => !c.hidden) && d.none.hidden === true && d.count.textContent === '' && d.heads.every(h => !h.hidden) && d.clear.hidden === true, 'champ vidé : tout revient');
});

test('branchements : saisie en direct, effacer, catalogue, « Tout sélectionner » près des boutons, cartes marquées, remise à zéro par instance', () => {
  assert.ok(/if \(t\.id === 'modf'\) modFilter\(t\.value\);/.test(src), 'saisie en direct'); assert.ok(src.includes('modfclear:') && src.includes('modcat:'));
  assert.ok(src.includes("openBrowser('mod'); if (q && BR) { BR.q = q;"), 'le catalogue s’ouvre avec la recherche déjà remplie');
  const i = src.indexOf('data-a="modupd"'), toolbar = src.slice(i, i + 700); assert.ok(toolbar.includes('data-a="modimp"') && toolbar.includes('data-a="mselall"'), '« Tout sélectionner » à côté de « Mises à jour » et « Importer un .jar »'); assert.ok(toolbar.includes('Tout désélectionner'));
  assert.ok(/class="card mcard[^`]*data-g="\$\{x\.disabled \? 'off' : 'on'\}" data-mn="\$\{esc\(modKey\(x\)\)\}"/.test(src), 'cartes marquées pour le filtre'); assert.ok(src.includes('id="modnone"'));
  assert.ok(src.includes("if (MODFI !== cur) { MODFI = cur; MODF = ''; }"), 'filtre remis à zéro pour une autre instance'); assert.ok(!src.includes('modqStart') && !src.includes('id="modq"'), 'ancienne recherche catalogue retirée');
  assert.ok(!line('modBar').includes('Sélection multiple'), 'texte « Sélection multiple » retiré de la barre des mods (la barre générique des autres listes ne change pas)');
});
