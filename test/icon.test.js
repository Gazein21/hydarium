/* Logo d'Hydarium : le .ico doit être au format standard (BMP 16 à 128 px, PNG 256 px). Régression : un .ico tout en PNG (même pour 16/32/48 px) n'est pas lu par les outils Windows
   pour les petites tailles (barre des tâches, explorateur, raccourcis) → l'icône d'Electron réapparaissait. */
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), ico = fs.readFileSync(path.join(root, 'build', 'icon.ico'));
const entries = (() => { const n = ico.readUInt16LE(4); assert.strictEqual(ico.readUInt16LE(0), 0); assert.strictEqual(ico.readUInt16LE(2), 1, 'type .ico'); return Array.from({ length: n }, (_, i) => { const o = 6 + 16 * i; const w = ico[o] || 256, h = ico[o + 1] || 256, size = ico.readUInt32LE(o + 8), off = ico.readUInt32LE(o + 12); return { w, h, size, off, png: ico.subarray(off, off + 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) }; }); })();

test('icon.ico : toutes les tailles utiles, BMP jusqu’à 128 px, PNG seulement pour 256 px', () => {
  const sizes = entries.map(e => e.w); for (const s of [16, 24, 32, 48, 64, 128, 256]) assert.ok(sizes.includes(s), 'taille manquante : ' + s);
  for (const e of entries) { assert.strictEqual(e.w, e.h, 'image carrée'); assert.ok(e.off + e.size <= ico.length, 'image dans le fichier'); assert.strictEqual(e.png, e.w >= 256, e.w + ' px : ' + (e.png ? 'PNG (doit être BMP)' : 'BMP')); }
});

test('icon.ico : chaque image BMP a un en-tête valide (32 bits, hauteur doublée, taille cohérente)', () => {
  for (const e of entries.filter(x => !x.png)) {
    const b = ico.subarray(e.off, e.off + e.size); assert.strictEqual(b.readUInt32LE(0), 40, 'BITMAPINFOHEADER'); assert.strictEqual(b.readInt32LE(4), e.w); assert.strictEqual(b.readInt32LE(8), e.h * 2, 'hauteur = 2 × h (image + masque)'); assert.strictEqual(b.readUInt16LE(14), 32, '32 bits');
    assert.strictEqual(e.size, 40 + e.w * e.h * 4 + Math.ceil(e.w / 32) * 4 * e.h, e.w + ' px : taille attendue');
    const alpha = []; for (let i = 3; i < e.w * e.h * 4; i += 4 * 7) alpha.push(b[40 + i]); assert.ok(alpha.some(a => a === 255) , e.w + ' px : pixels opaques présents (logo visible)');
  }
});

test('source du logo et usage : icon.png 512 px, icône des fenêtres en PNG, incrustation signalée si elle échoue', () => {
  const png = fs.readFileSync(path.join(root, 'build', 'icon.png')); assert.strictEqual(png.readUInt32BE(16), 512); assert.strictEqual(png.readUInt32BE(20), 512);
  const main = fs.readFileSync(path.join(root, 'src', 'main', 'main.js'), 'utf8'); assert.ok(/icon: appIcon\(\)/.test(main) && /build', 'icon\.png'/.test(main), 'la fenêtre principale utilise le PNG');
  const ap = fs.readFileSync(path.join(root, 'scripts', 'after-pack.js'), 'utf8'); assert.ok(/::error title=Logo non incrust/.test(ap), 'annotation rouge si rcedit échoue');
  const pkg = require(path.join(root, 'package.json')); assert.ok(/icon\.ico$/.test(pkg.build.win.icon || ''), 'win.icon = icon.ico');
});
