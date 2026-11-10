/* Le preload n'autorise que les canaux listés : un canal oublié donne « Canal refusé » sans autre message (une carte entière affichait « indisponible » pour cette raison). */
const fs = require('fs'), path = require('path'), assert = require('assert');
const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8'), pre = read('src/preload.js');
const list = name => new Set([...pre.match(new RegExp('const ' + name + ' = \\[([\\s\\S]*?)\\];'))[1].matchAll(/'([a-z0-9:_-]+)'/g)].map(m => m[1]));
const CH = list('CH'), EV = list('EV'), app = read('src/renderer/app.js');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const used = [...new Set([...app.matchAll(/\bcall\('([a-z0-9:_-]+)'/g)].map(m => m[1]))];
for (const c of used) ok(CH.has(c), 'canal appelé par l’interface mais refusé par le preload : ' + c);
const listened = [...new Set([...app.matchAll(/\bhyd\.on\('([a-z0-9:_-]+)'/g)].map(m => m[1]))];
for (const e of listened) ok(EV.has(e), 'événement écouté par l’interface mais refusé par le preload : ' + e);
ok(used.includes('client:editor') && CH.has('client:editor'), 'le bouton « Modifier en jeu » peut joindre le launcher');
console.log('preload.test.js : ' + n + ' contrôles OK (' + used.length + ' canaux et ' + listened.length + ' événements vérifiés)');
