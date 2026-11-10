/* Captures d’écran de toutes les instances. */
const fs = require('fs'), path = require('path');
const { nativeImage, clipboard, shell } = require('electron');
const game = require('./game'), store = require('./store');
const IMG = /\.(png|jpe?g)$/i, okId = id => /^[a-z0-9]+$/.test(String(id));
const where = (id, file) => {
  if (!okId(id) || file !== path.basename(String(file)) || !IMG.test(file)) throw new Error('Capture invalide.');
  const p = path.join(game.dirOf(id), 'screenshots', file); if (!fs.existsSync(p)) throw new Error('Capture introuvable.'); return p;
};
exports.list = () => {
  const out = [];
  for (const i of store.get().instances) {
    const d = path.join(game.dirOf(i.id), 'screenshots'); let n = []; try { n = fs.readdirSync(d); } catch (e) {}
    for (const f of n) if (IMG.test(f)) { try { const t = fs.statSync(path.join(d, f)); out.push({ inst: i.id, name: i.name, file: f, mtime: t.mtimeMs, size: t.size }); } catch (e) {} }
  }
  return out.sort((a, b) => b.mtime - a.mtime);
};
const cache = new Map();
const enc = (p, w, q) => { const img = nativeImage.createFromPath(p); if (img.isEmpty()) return ''; const s = img.getSize(); return 'data:image/jpeg;base64,' + img.resize({ width: Math.min(w, s.width), quality: 'good' }).toJPEG(q).toString('base64'); };
exports.thumb = (id, f) => { const p = where(id, f), k = p + fs.statSync(p).mtimeMs; if (!cache.has(k)) { if (cache.size > 400) cache.clear(); cache.set(k, enc(p, 360, 70)); } return cache.get(k); };
exports.full = (id, f) => { const p = where(id, f), s = nativeImage.createFromPath(p).getSize(); return { src: enc(p, 1600, 90), w: s.width, h: s.height }; };
/* annotation : image d’origine en PNG, puis enregistrement d’une copie annotée (l’original n’est jamais modifié) ou copie dans le presse-papiers */
const fromData = d => { const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(d || '')); if (!m || m[1].length > 60e6) throw new Error('Image invalide.'); const img = nativeImage.createFromBuffer(Buffer.from(m[1], 'base64')); if (img.isEmpty()) throw new Error('Image invalide.'); return img; };
exports.orig = (id, f) => { const p = where(id, f), img = nativeImage.createFromPath(p), s = img.getSize(); if (img.isEmpty()) throw new Error('Impossible de lire cette capture.'); return { src: 'data:image/png;base64,' + img.toPNG().toString('base64'), w: s.width, h: s.height }; };
exports.save = (id, f, data) => {
  const p = where(id, f), img = fromData(data), base = path.basename(f).replace(/(_annote(_\d+)?)?\.(png|jpe?g)$/i, '');
  let n = '', out; do { out = path.join(path.dirname(p), base + '_annote' + n + '.png'); n = (+n || 1) + 1; } while (fs.existsSync(out));
  fs.writeFileSync(out, img.toPNG()); return path.basename(out);
};
exports.clip = data => { clipboard.writeImage(fromData(data)); return true; };
exports.op = (id, f, op) => {
  const p = where(id, f);
  if (op === 'copy') clipboard.writeImage(nativeImage.createFromPath(p));
  else if (op === 'reveal') shell.showItemInFolder(p);
  else if (op === 'open') return shell.openPath(p);
  else if (op === 'delete') fs.rmSync(p, { force: true });
};
