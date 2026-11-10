/* Icônes d’objets de Minecraft pour le HUD du launcher : les vraies textures, lues dans le jar du jeu de l’instance (rien n’est redistribué, tout vient du jeu installé).
   Armure : « diamond_helmet » (1.13+), « golden_helmet » / « gold_helmet », « item.helmetDiamond » (1.8.9). Pas de texture trouvée → l’appelant garde son dessin de secours. */
const fs = require('fs'), path = require('path');
const plat = require('./platform');
const cache = new Map(); // « version|id » → data URL ou '' (introuvable)
const OLD = { Cloth: 'leather', Chain: 'chainmail', Iron: 'iron', Gold: 'gold', Diamond: 'diamond' };
const names = raw => {
  const id = String(raw || ''); let m = /^item\.(helmet|chestplate|leggings|boots)(Cloth|Chain|Iron|Gold|Diamond)$/.exec(id);
  if (m) return [OLD[m[2]] + '_' + m[1]];
  const s = id.replace(/^.*[:.]/, '').toLowerCase(); if (!/^[a-z0-9_]{1,40}$/.test(s)) return [];
  return [...new Set([s, s.replace(/^golden_/, 'gold_'), s.replace(/^gold_/, 'golden_')])];
};
const png = b => (b.length > 50 && b.length < 65536 ? 'data:image/png;base64,' + b.toString('base64') : '');
/* Cuir : le jeu teinte la texture (brun 0xA06540 par défaut, la couleur de teinture n’est pas connue) puis superpose « _overlay » tel quel. */
const leather = (z, d, n) => {
  const base = z.getEntry(`assets/minecraft/textures/${d}/${n}.png`); if (!base) return '';
  try {
    const { nativeImage } = require('electron'), a = nativeImage.createFromBuffer(base.getData()); if (a.isEmpty()) return png(base.getData());
    const { width, height } = a.getSize(), A = Buffer.from(a.toBitmap()); // BGRA
    for (let i = 0; i < A.length; i += 4) { A[i] = A[i] * 64 / 255; A[i + 1] = A[i + 1] * 101 / 255; A[i + 2] = A[i + 2] * 160 / 255; }
    const ov = z.getEntry(`assets/minecraft/textures/${d}/${n}_overlay.png`);
    if (ov) { const o = nativeImage.createFromBuffer(ov.getData()); if (!o.isEmpty() && o.getSize().width === width && o.getSize().height === height) { const O = o.toBitmap(); for (let i = 0; i < A.length; i += 4) { const al = O[i + 3] / 255; if (al > 0) { A[i] = O[i] * al + A[i] * (1 - al); A[i + 1] = O[i + 1] * al + A[i + 1] * (1 - al); A[i + 2] = O[i + 2] * al + A[i + 2] * (1 - al); A[i + 3] = Math.max(A[i + 3], O[i + 3]); } } } }
    return nativeImage.createFromBitmap(A, { width, height }).toDataURL();
  } catch (e) { return png(base.getData()); }
};
const jarOf = ver => /^[\w.+-]{1,40}$/.test(String(ver || '')) ? path.join(plat.dataDir(), 'shared', 'versions', ver, ver + '.jar') : '';
/* renvoie une adresse data: PNG, ou '' */
/* Jars de Minecraft installés, le jar demandé d’abord : si celui de l’instance est introuvable (instance Fabric / Forge, version supprimée…), on prend la texture dans un autre jar du jeu plutôt que d’afficher un dessin de secours. */
const jars = ver => {
  const out = []; const first = jarOf(ver); if (first) out.push(first);
  try {
    const root = path.join(plat.dataDir(), 'shared', 'versions'), key = v => v.split(/[.+-]/).map(x => (/^\d+$/.test(x) ? +x : 0));
    const cmp = (x, y) => { const a = key(x), b = key(y); for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] || 0) !== (b[i] || 0)) return (b[i] || 0) - (a[i] || 0); return 0; };
    for (const v of fs.readdirSync(root).filter(v => /^\d/.test(v)).sort(cmp)) { const j = path.join(root, v, v + '.jar'); if (!out.includes(j) && fs.existsSync(j)) out.push(j); if (out.length >= 4) break; }
  } catch (e) { /* pas de dossier de versions */ }
  return out.filter(j => fs.existsSync(j));
};
/* renvoie une adresse data: PNG, ou '' */
exports.get = (ver, id) => {
  const k = ver + '|' + id; if (cache.has(k)) return cache.get(k);
  let out = ''; const list = names(id);
  try {
    if (list.length) for (const jar of jars(ver)) {
      try {
        const z = new (require('adm-zip'))(jar);
        for (const n of list) for (const d of ['item', 'items']) { // « item » depuis 1.13, « items » avant
          if (out) break;
          if (/^leather_/.test(n)) { out = leather(z, d, n); continue; }
          const e = z.getEntry(`assets/minecraft/textures/${d}/${n}.png`);
          if (e) out = png(e.getData());
        }
      } catch (e) { /* jar illisible : on essaie le suivant */ }
      if (out) break;
    }
  } catch (e) { /* dessin de secours */ }
  if (cache.size > 300) cache.clear(); cache.set(k, out); return out;
};

/* Effets de potion : « textures/mob_effect/<nom>.png » depuis 1.13 ; avant (1.8.9), les icônes sont dans l’atlas « gui/container/inventory.png » (cases de 18 px à partir de y = 198). */
const OLDFX = { movespeed: [0, 0], moveslowdown: [1, 0], digspeed: [2, 0], digslowdown: [3, 0], damageboost: [4, 0], weakness: [5, 0], poison: [6, 0], regeneration: [7, 0], invisibility: [0, 1], hunger: [1, 1], jump: [2, 1], confusion: [3, 1], nightvision: [4, 1], blindness: [5, 1], resistance: [6, 1], fireresistance: [7, 1], waterbreathing: [0, 2], wither: [1, 2], absorption: [2, 2], healthboost: [7, 2] };
exports.fx = (ver, key) => {
  const k = ver + '|fx:' + key; if (cache.has(k)) return cache.get(k);
  let out = ''; const tail = String(key || '').replace(/^.*[:.]/, '');
  try {
    if (/^[A-Za-z0-9_]{1,40}$/.test(tail)) for (const jar of jars(ver)) {
      try {
        const z = new (require('adm-zip'))(jar), n = tail.toLowerCase(), e = z.getEntry(`assets/minecraft/textures/mob_effect/${n}.png`);
        if (e) out = png(e.getData());
        else if (OLDFX[n]) {
          const at = z.getEntry('assets/minecraft/textures/gui/container/inventory.png');
          if (at) { const img = require('electron').nativeImage.createFromBuffer(at.getData()); if (!img.isEmpty()) out = img.crop({ x: OLDFX[n][0] * 18, y: 198 + OLDFX[n][1] * 18, width: 18, height: 18 }).toDataURL(); }
        }
      } catch (e) { /* jar illisible */ }
      if (out) break;
    }
  } catch (e) { /* pas de texture : dessin de secours */ }
  if (cache.size > 300) cache.clear(); cache.set(k, out); return out;
};
