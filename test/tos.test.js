/* Écran du premier lancement : la vie privée AVANT les règles, ton personnel (pas d'entreprise), acceptation obligatoire, jamais dans la fenêtre posée sur le jeu. */
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const grabBlock = (name) => { const a = src.indexOf('const ' + name + ' = '); assert.ok(a >= 0, name + ' introuvable'); return a; };
const a = src.indexOf('const TOS_VERSION'), z = src.indexOf('/* état de la récupération des skins Mojang'); assert.ok(a > 0 && z > a);
const block = src.slice(a, z);

/* mini document factice : suffisant pour tosShow / tosCheck */
const mkDom = () => { const els = {}; const body = { children: [], appendChild(e) { this.children.push(e); els[e.id] = e; } };
  const document = { body, createElement: () => ({ id: '', className: '', _h: '', set innerHTML(v) { this._h = v; if (/id="tosok"/.test(v)) els.tosok = { checked: false, onchange: null }; if (/id="tosgo"/.test(v)) els.tosgo = { disabled: true }; }, get innerHTML() { return this._h; }, remove() { delete els[this.id]; } }) };
  return { document, $: q => els[q.slice(1)] || null, els }; };
const load = (cfg, OVL) => { const d = mkDom(); const f = new Function('document', '$', 'cfg', 'OVL', block + '\nreturn { TOS_VERSION, tosHtml, tosShow, tosCheck };'); return { ...f(d.document, d.$, cfg, OVL), dom: d }; };

test('la vie privée vient AVANT les règles, et dit ce qu’elle doit dire', () => {
  const h = load({}, '').tosHtml(false), iPriv = h.indexOf('ne collecte aucune donnée personnelle'), iRules = h.indexOf('Règles d’utilisation</h3>');
  assert.ok(iPriv > 0 && iRules > iPriv, 'la politique de non-collecte doit être le premier bloc visible'); assert.ok(h.includes('n’en vend jamais'), 'non-vente');
  assert.ok(h.includes('aucun serveur Hydarium'), 'explication : pas de serveur'); assert.ok(h.includes('services tiers') && h.includes('adresse IP'), 'honnêteté sur les services tiers');
});

test('les règles demandées sont toutes là, sur un ton personnel (jamais « entreprise » ni « société »)', () => {
  const h = load({}, '').tosHtml(false);
  for (const t of ['Liens officiels uniquement', 'github.com/Gazein21/hydarium', 'ne le republie pas', 'contenu illégal', 'choquant', 'Tu es responsable', 'n’est pas responsable des contenus de tiers', 'Minecraft appartient à Mojang', 'Aucune garantie']) assert.ok(h.includes(t), 'règle absente : ' + t);
  assert.ok(!/entreprise|soci[ée]t[ée]|compagnie|nos conditions|nos services|notre /i.test(h), 'ton d\'entreprise détecté');
});

test('acceptation : case obligatoire, bouton désactivé tant qu’elle n’est pas cochée, quitter possible', () => {
  const t = load({}, ''); const h = t.tosHtml(false);
  assert.ok(/id="tosok"/.test(h) && /id="tosgo" data-a="tosAccept" disabled/.test(h) && /data-a="tosQuit"/.test(h));
  t.tosShow(false); const ck = t.dom.els.tosok; assert.ok(ck && typeof ck.onchange === 'function'); ck.checked = true; ck.onchange(); assert.strictEqual(t.dom.els.tosgo.disabled, false, 'bouton activé une fois cochée'); ck.checked = false; ck.onchange(); assert.strictEqual(t.dom.els.tosgo.disabled, true);
  assert.ok(!/id="tosok"/.test(t.tosHtml(true)) && /data-a="tosClose"/.test(t.tosHtml(true)), 'mode « relire » : pas de case, un bouton Fermer');
});

test('quand l’écran apparaît : premier lancement oui, déjà accepté non, fenêtre posée sur le jeu jamais', () => {
  let t = load({}, ''); t.tosCheck(); assert.ok(t.dom.els.tos, 'premier lancement : affiché');
  t = load({ tosAccepted: 1 }, ''); t.tosCheck(); assert.ok(!t.dom.els.tos, 'déjà accepté : rien');
  t = load({ tosAccepted: 0 }, 'hub'); t.tosCheck(); assert.ok(!t.dom.els.tos, 'fenêtre en jeu : jamais');
  t = load({}, ''); t.tosCheck(); t.tosCheck(); assert.strictEqual(t.dom.document.body.children.length, 1, 'jamais deux fois');
  t = load({ tosAccepted: 1 }, ''); assert.strictEqual(t.TOS_VERSION, 1);
});

test('branchements : démarrage, enregistrement du réglage, bouton Relire dans Paramètres', () => {
  assert.ok(/i18nWatch\(\); document\.documentElement\.lang = window\.UILANG = cfg\.uiLang; tosCheck\(\);/.test(src), 'appelé au démarrage après le chargement des réglages');
  assert.ok(src.includes("call('set:set', { tosAccepted: TOS_VERSION, tosAt: Date.now() })") && src.includes("tosQuit: () => call('win', 'close')") && src.includes('data-a="tosView">Relire'));
  assert.ok(/tosAccepted: 'number'/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'main.js'), 'utf8')), 'réglage autorisé côté principal');
});
