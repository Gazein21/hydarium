/* Reconnaît une image par son CONTENU (pas par son nom) et lit ses dimensions dans l'en-tête, SANS la décoder :
   une image reçue d'un ami n'est montrée que si c'est un vrai PNG / JPEG / GIF / WebP de taille raisonnable (une petite image peut annoncer 100 000 × 100 000 pixels et saturer la mémoire). */
const MAX_SIDE = 16384, MAX_PIXELS = 64e6, MAX_BYTES = 15 * 2 ** 20;

/** { type: 'png'|'jpeg'|'gif'|'webp', w, h, mime, ext } ou null (inconnu, illisible, démesuré). `b` peut n'être que le début du fichier (256 Ko suffisent). */
function info(b) {
  if (!Buffer.isBuffer(b) || b.length < 24) return null; let t = null, w = 0, h = 0;
  if (b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a && b.toString('latin1', 12, 16) === 'IHDR') { t = 'png'; w = b.readUInt32BE(16); h = b.readUInt32BE(20); }
  else if (b.toString('latin1', 0, 3) === 'GIF' && /^GIF8[79]a$/.test(b.toString('latin1', 0, 6))) { t = 'gif'; w = b.readUInt16LE(6); h = b.readUInt16LE(8); }
  else if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    t = 'jpeg'; let i = 2; while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; } const m = b[i + 1]; if (m === 0xff) { i++; continue; }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      const len = b.readUInt16BE(i + 2); if (len < 2) return null;
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) { h = b.readUInt16BE(i + 5); w = b.readUInt16BE(i + 7); break; } i += 2 + len;
    }
  } else if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
    t = 'webp'; const k = b.toString('latin1', 12, 16);
    if (k === 'VP8 ' && b.length >= 30 && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) { w = b.readUInt16LE(26) & 0x3fff; h = b.readUInt16LE(28) & 0x3fff; }
    else if (k === 'VP8L' && b.length >= 25 && b[20] === 0x2f) { const v = b.readUInt32LE(21); w = (v & 0x3fff) + 1; h = ((v >> 14) & 0x3fff) + 1; }
    else if (k === 'VP8X' && b.length >= 30) { w = (b[24] | (b[25] << 8) | (b[26] << 16)) + 1; h = (b[27] | (b[28] << 8) | (b[29] << 16)) + 1; }
  }
  if (!t || !(w > 0 && h > 0) || w > MAX_SIDE || h > MAX_SIDE || w * h > MAX_PIXELS) return null;
  return { type: t, w, h, mime: 'image/' + t, ext: t === 'jpeg' ? 'jpg' : t };
}
module.exports = { info, MAX_BYTES, MAX_SIDE, MAX_PIXELS };
