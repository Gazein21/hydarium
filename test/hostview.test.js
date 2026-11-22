/* Vue d'un serveur : adresse discrète (seule localhost visible), adresses réseau / Internet dans « Autres adresses », playit.gg dans « Options avancées »
   (fermé par défaut, ouvert d'office si déjà utilisé, choix de la personne gardé). Le code testé est extrait de src/renderer/app.js, pas recopié. */
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const app = fs.readFileSync(path.join(__dirname, '..', 'src/renderer/app.js'), 'utf8');
const a = app.indexOf('const HADV = {};'), b = app.indexOf('const p2pCard = (h, I) => {'); assert.ok(a > 0 && b > a, 'bloc introuvable dans app.js');
let clickHandler = null;
const ctx = { esc: s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'), priv: h => '<span class="priv">' + h + '</span>', ic: () => '', playing: false, document: { addEventListener: (t, f) => { if (t === 'click') clickHandler = f; } } };
vm.createContext(ctx); vm.runInContext(app.slice(a, b) + '\nthis.T = { HADV, advBox, pgAuto, addrCard };', ctx);
const T = ctx.T, H = (o = {}) => ({ id: 'srv1', port: 25565, ip: [], state: 'stopped', ...o });

test('sans autre adresse : juste localhost, aucune section repliable', () => {
  const h = T.addrCard(H(), null); assert.ok(h.includes('localhost:25565') && !h.includes('<details'));
});

test('IP du réseau local et tunnel : rangés dans « Autres adresses » (fermé), jamais dans la partie visible', () => {
  const h = T.addrCard(H({ ip: ['192.168.1.42'], playitAddress: 'abc.gl.at.ply.gg:12345' }), null), k = h.indexOf('<details');
  assert.ok(k > 0, 'section repliable présente'); const vis = h.slice(0, k);
  assert.ok(vis.includes('localhost:25565') && !vis.includes('192.168') && !vis.includes('ply.gg'), 'rien de sensible hors de la section');
  assert.ok(/Autres adresses <span class="mu">\(2\)<\/span>/.test(h), 'compte des adresses');
  assert.ok(h.includes('192.168.1.42:25565') && h.includes('abc.gl.at.ply.gg:12345') && h.includes('class="priv"'), 'floutées par le mode confidentialité');
  assert.ok(!/<details[^>]* open/.test(h), 'fermée par défaut'); assert.ok(h.includes('data-a="pgcopy" data-v="192.168.1.42:25565"'), 'copiable');
});

test('le tunnel détecté par l’agent passe avant l’adresse enregistrée ; boutons Rejoindre selon l’état', () => {
  const h = T.addrCard(H({ playitAddress: 'vieille.adresse:1', state: 'running' }), { tunnels: { 25565: 'nouvelle.adresse:2' } });
  assert.ok(h.includes('nouvelle.adresse:2') && !h.includes('vieille.adresse')); assert.ok(!/data-a="hjoin"[^>]*disabled/.test(h), 'serveur en ligne : on peut rejoindre');
  assert.ok(/data-a="hjoin"[^>]*disabled/.test(T.addrCard(H(), null)), 'serveur arrêté : désactivé');
});

test('playit.gg : fermé tant qu’on ne l’utilise pas, ouvert d’office dès qu’il est installé / en cours / configuré', () => {
  assert.strictEqual(T.pgAuto(H(), { state: 'off', tunnels: {} }), false); assert.strictEqual(T.pgAuto(H(), null), false);
  for (const G of [{ state: 'running' }, { state: 'claim' }, { state: 'starting' }, { state: 'error' }, { state: 'off', installing: true }, { state: 'off', tunnels: { 25565: 'x:1' } }]) assert.strictEqual(T.pgAuto(H(), G), true, JSON.stringify(G));
  assert.strictEqual(T.pgAuto(H({ playitAddress: 'x:1' }), { state: 'off' }), true);
});

test('le choix ouvert / fermé de la personne l’emporte et survit au rafraîchissement de la page', () => {
  const box = auto => T.advBox('srv1:playit', 'Titre', 'indice', '<p>corps</p>', auto);
  assert.ok(/ open>/.test(box(true)) && !/ open>/.test(box(false)));
  const sm = (key, open) => ({ closest: () => ({ parentElement: { dataset: { adv: key }, open } }) });
  clickHandler({ target: sm('srv1:playit', false) }); assert.ok(/ open>/.test(box(false)), 'ouverte à la main : le reste');
  clickHandler({ target: sm('srv1:playit', true) }); assert.ok(!/ open>/.test(box(true)), 'refermée à la main malgré « auto »');
  clickHandler({ target: { closest: () => null } }); // clic ailleurs : sans effet
});

test('branchements dans la page du serveur et styles', () => {
  assert.ok(!app.includes('<b>Adresses</b>'), 'plus d’ancienne carte « Adresses »');
  assert.ok(/\$\{addrCard\(h, PG\)\}\s*\n\s*\$\{p2pCard\(h, PI\)\}\s*\n\s*\$\{advBox\(h\.id \+ ':playit'[^\n]*pgCard\(h, PG\)[^\n]*pgAuto\(h, PG\)\)\}/.test(app), 'ordre : adresse, invitation privée, puis playit.gg en options avancées');
  assert.ok(/playit\.gg \(« Options avancées », juste en dessous\)/.test(app) && !app.includes('playit.gg ci-dessus'), 'le texte de l’invitation renvoie vers la bonne section');
  const css = fs.readFileSync(path.join(__dirname, '..', 'src/renderer/style.css'), 'utf8'); assert.ok(/\.adv\[open\]>summary::before/.test(css) && /\.arow\{/.test(css));
});
