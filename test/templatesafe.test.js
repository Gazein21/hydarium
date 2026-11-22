/* Garde-fou : du CODE ne doit jamais se retrouver dans le TEXTE d'un gabarit (template literal) de l'interface.
   Régression 0.10.52 → 0.10.60 : des lignes « if (st === 'gen') b += … » ajoutées au milieu d'un gabarit non fermé s'affichaient telles quelles dans Paramètres
   (et les réglages qu'elles devaient créer n'existaient pas). On lit le fichier avec un mini-analyseur (chaînes, commentaires, expressions régulières, ${…} imbriqués). */
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');

const CODE_IN_TEXT = [/\bif \(st === ['"]\w+['"]\)/, /\bb \+= /, /\bawait call\(/, /^\s*(?:const|let|var) \w+ = (?:await |await\()/m, /^\s*return [^\n<]*;\s*$/m, /^ {2,4}(?:if|for|while) \([^\n]*\) (?:b|html|out|h) \+?= /m, /\bsetTimeout\(\(\) =>/, /\bUPS2? = await\b/, /\bSK = await\b/];
const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'case', 'of', 'in', 'delete', 'void', 'throw', 'new', 'else', 'do', 'instanceof']);

/** Renvoie la liste des « morceaux de texte » des gabarits : [{ text, line }]. */
function quasis(src) {
  const out = []; let i = 0, line = 1; const n = src.length; const stack = []; // pile des gabarits ouverts : { depth } pour suivre les accolades dans ${…}
  let last = '', lastWord = '';
  const bump = c => { if (c === '\n') line++; };
  const readTemplate = () => { // positionné juste après l'ouverture ` ou la fermeture } d'un ${…}
    let text = '', startLine = line;
    while (i < n) {
      const c = src[i];
      if (c === '\\') { text += c + (src[i + 1] || ''); bump(src[i + 1]); i += 2; continue; }
      if (c === '`') { out.push({ text, line: startLine }); i++; last = '`'; return 'end'; }
      if (c === '$' && src[i + 1] === '{') { out.push({ text, line: startLine }); i += 2; stack.push({ depth: 0 }); return 'expr'; }
      bump(c); text += c; i++;
    }
    return 'eof';
  };
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { bump(src[i]); i++; } i += 2; continue; }
    if (c === '\'' || c === '"') { i++; while (i < n && src[i] !== c) { if (src[i] === '\\') i++; i++; } i++; last = 'str'; lastWord = ''; continue; }
    if (c === '`') { i++; const r = readTemplate(); lastWord = ''; if (r === 'expr') continue; continue; }
    if (c === '/') { // division ou expression régulière ?
      const regexOk = last === '' || '(,=:[!&|?{};+-*%<>~^'.includes(last) || REGEX_AFTER_WORD.has(lastWord);
      if (regexOk) { i++; let cls = false; while (i < n && (cls || src[i] !== '/')) { if (src[i] === '\\') i++; else if (src[i] === '[') cls = true; else if (src[i] === ']') cls = false; i++; } i++; while (/[a-z]/.test(src[i] || '')) i++; last = 'rx'; lastWord = ''; continue; }
      i++; last = '/'; lastWord = ''; continue;
    }
    if (c === '{' && stack.length) { stack[stack.length - 1].depth++; i++; last = '{'; lastWord = ''; continue; }
    if (c === '}' && stack.length) {
      const top = stack[stack.length - 1];
      if (top.depth === 0) { stack.pop(); i++; const r = readTemplate(); if (r === 'eof') break; continue; }   // fin de ${…} : on reprend le texte du gabarit
      top.depth--; i++; last = '}'; lastWord = ''; continue;
    }
    if (/[A-Za-z_$]/.test(c)) { let w = ''; while (i < n && /[\w$]/.test(src[i])) w += src[i++]; lastWord = w; last = 'w'; continue; }
    if (/\d/.test(c)) { while (i < n && /[\w.]/.test(src[i])) i++; last = 'n'; lastWord = ''; continue; }
    last = c; lastWord = ''; i++;
  }
  return out;
}

const files = ['app.js', 'hud-page.js', 'scene.js'].map(f => path.join(__dirname, '..', 'src', 'renderer', f)).filter(fs.existsSync);

test('le mini-analyseur repère le défaut d\'origine et ne s\'inquiète pas d\'un gabarit sain', () => {
  const bad = "let b = ''; if (st === 'gen') b = `<div>${sw('a', 'b')}\n  if (st === 'gen') b += srvModsCard();\n  <p>fin</p>`;";
  assert.ok(quasis(bad).some(q => CODE_IN_TEXT.some(r => r.test(q.text))), 'défaut non repéré');
  const good = "const re = /[`'\"]/g; const t = `<div class=\"a\">${x ? `<b>${y}</b>` : ''}</div>`; const d = a / b / c; if (z) b += 1;";
  assert.ok(!quasis(good).some(q => CODE_IN_TEXT.some(r => r.test(q.text))), 'faux positif sur un gabarit sain : ' + JSON.stringify(quasis(good)));
  assert.strictEqual(quasis(good).length, 4, 'gabarits imbriqués bien décomposés');
});

for (const f of files) test('aucun code dans le texte des gabarits : ' + path.basename(f), () => {
  const src = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n'); const bad = [];
  for (const q of quasis(src)) for (const r of CODE_IN_TEXT) { const m = r.exec(q.text); if (m) bad.push('ligne ~' + (q.line + q.text.slice(0, m.index).split('\n').length - 1) + ' : ' + m[0].trim().slice(0, 70)); }
  assert.deepStrictEqual(bad, [], 'du code s\'affiche comme du texte :\n  ' + bad.join('\n  '));
});

/* Le bloc « Général » de Paramètres est EXÉCUTÉ avec des éléments factices : tous les réglages doivent s'y trouver, et rien qui ressemble à du code */
test('Paramètres › Général : tous les réglages sont produits, aucun code affiché', async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
  const a = src.indexOf("if (st === 'gen') b = `"), z = src.indexOf("if (st === 'new') b = `", a); assert.ok(a > 0 && z > a, 'bloc Général introuvable');
  const body = src.slice(a, z), swSrc = /const sw = [^\n]*/.exec(src)[0];
  const run = async (drawErr) => new Function('cfg', 'esc', 'pf', 'srvModsCard', 'call', 'updCard', 'st', 'UPS', 'return (async () => { let UPS2 = UPS; ' + swSrc + '\nlet b = "";\n' + body.replace(/UPS = await/g, 'UPS2 = await') + '\nreturn b; })();')(
    { privacy: true }, x => String(x), { version: '0.10.61', id: 'win32', arch: 'x64' }, () => '<div class="card">MODS-DES-SERVEURS</div>', async ch => (ch === 'client:drawerr' ? drawErr : { status: 'idle' }), () => '<div id="updc">CARTE-MAJ</div>', 'gen', null);
  const h = await run('');
  for (const t of ['Notifications', 'Réduire pendant le jeu', 'Afficher les logs du jeu', 'MODS-DES-SERVEURS', 'Mode confidentialité (stream)', 'Mises à jour automatiques', 'Installer automatiquement', 'Menu Alt+H dans le jeu (expérimental)', 'CARTE-MAJ', 'Importer', 'Langue de l’interface', 'Assistant de bienvenue']) assert.ok(h.includes(t), 'absent de Paramètres › Général : ' + t);
  assert.ok(!/if \(st ===|\bb \+=|await call\(/.test(h), 'du code s\'affiche dans la page'); assert.ok(!h.includes('n’a pas pu démarrer'), 'bandeau d\'erreur sans erreur');
  assert.ok((await run('Classes absentes : Draw')).includes('Le HUD en jeu n’a pas pu démarrer'), 'bandeau d\'erreur du HUD absent');
  assert.strictEqual((h.match(/<div/g) || []).length, (h.match(/<\/div>/g) || []).length, 'balises <div> équilibrées');
});
