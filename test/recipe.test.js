/* Code de partage (recette) : Fabric, Quilt, Forge, NeoForge ; relecture stricte ; une carte de chat ne peut pas dire autre chose que son code. */
const test = require('node:test'), assert = require('node:assert'), zlib = require('zlib');
const R = require('../src/main/recipe'), C = require('../src/main/chat');
const raw = o => 'HYD1.' + zlib.deflateSync(JSON.stringify(o)).toString('base64url'), pids = ['AANobbMI', 'P7dR8mSH'];

test('chaque loader fait l’aller-retour ; Forge et NeoForge emportent la version du loader', () => {
  for (const [l, lv] of [['vanilla', ''], ['fabric', ''], ['quilt', ''], ['forge', '47.2.0'], ['neoforge', '21.1.172']]) {
    const code = R.encode({ version: '1.20.1', type: 'release', loader: l, loaderVer: lv || 'ignoré', pids }); assert.match(code, /^HYD1\.[\w-]+$/);
    assert.deepStrictEqual(R.decode(code), { v: '1.20.1', t: 'release', l, lv, m: pids }, l);
  }
  assert.deepStrictEqual(R.decode(raw({ v: '1.20.1', t: 'release', l: 'fabric', m: pids })), { v: '1.20.1', t: 'release', l: 'fabric', lv: '', m: pids }, 'anciens codes (sans version de loader) toujours valides');
  assert.strictEqual(R.decode(raw({ v: '24w10a', t: 'snapshot', l: 'vanilla', m: [] })).t, 'snapshot');
});
test('relecture stricte : rien d’inventé n’est accepté', () => {
  const bad = (x, re = /invalide|illisible/) => assert.throws(() => R.decode(x), re);
  bad(raw({ v: '1.20.1', l: 'forge', m: pids }));   // Forge sans version du loader : l'instance ne pourrait pas se lancer
  bad(raw({ v: '1.20.1', l: 'forge', lv: '../../x', m: pids })); bad(raw({ v: '1.20.1', l: 'forge', lv: 'a'.repeat(41), m: pids })); bad(raw({ v: '1.20.1', l: 'liteloader', m: pids })); bad(raw({ v: '1.20<b>', l: 'fabric', m: [] }));
  bad(raw({ v: '1.20.1', l: 'fabric', m: ['cf123'] })); bad(raw({ v: '1.20.1', l: 'fabric', m: Array(201).fill('AANobbMI') })); bad(raw({ v: '1.20.1', l: 'fabric', m: 'AANobbMI' })); bad(raw(null)); bad(raw([]));
  bad('HYD1.' + Buffer.from('pas du zlib').toString('base64url')); bad('HYD2.abc'); bad(''); bad(null); bad('HYD1.' + 'a'.repeat(20001));
  bad('HYD1.' + zlib.deflateSync(Buffer.alloc(5e6, 32)).toString('base64url'), /illisible/);   // « bombe » : petit code, énorme une fois décompressé
});
test('carte d’instance : la version, le loader, la version du loader et le nombre de mods doivent être ceux du code', () => {
  const code = R.encode({ version: '1.20.1', type: 'release', loader: 'forge', loaderVer: '47.2.0', pids }), card = { k: 'inst', n: 'Mon Forge', v: '1.20.1', l: 'forge', lv: '47.2.0', m: 2, code };
  assert.deepStrictEqual(C.cleanCard(card), { ...card, th: '' }); assert.strictEqual(C.cleanCard({ ...card, lv: '1.0' }), null, 'fausse version de loader'); assert.strictEqual(C.cleanCard({ ...card, l: 'fabric' }), null, 'faux loader'); assert.strictEqual(C.cleanCard({ ...card, v: '1.21' }), null, 'fausse version'); assert.strictEqual(C.cleanCard({ ...card, m: 99 }), null, 'faux nombre de mods'); assert.strictEqual(C.cleanCard({ ...card, lv: undefined }), null);
  const neo = R.encode({ version: '1.21.1', type: 'release', loader: 'neoforge', loaderVer: '21.1.172', pids: [] }); assert.ok(C.cleanCard({ k: 'inst', n: 'Neo', v: '1.21.1', l: 'neoforge', lv: '21.1.172', m: 0, code: neo }));
  const fab = R.encode({ version: '1.20.1', type: 'release', loader: 'fabric', loaderVer: '', pids }); assert.ok(C.cleanCard({ k: 'inst', n: 'Fab', v: '1.20.1', l: 'fabric', m: 2, code: fab }), 'Fabric : pas de version de loader');
});
test('branchements : mods.js fabrique et relit les codes par recipe.js, Forge partageable', () => {
  const fs = require('fs'), path = require('path'), r = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), mods = r('src/main/mods.js'), main = r('src/main/main.js'), app = r('src/renderer/app.js');
  assert.ok(/recipe\.decode\(code\)/.test(mods) && /recipe\.encode/.test(mods) && /inst\.loaderVer = d\.lv/.test(mods), 'importCode : version du loader posée'); assert.ok(!/ne se partagent pas encore/.test(mods + app), 'plus de refus Forge');
  assert.ok(/lv: s\.lv/.test(main), 'la carte porte la version du loader');
});
