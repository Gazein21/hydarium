/* Image d'un mod : la plupart des mods embarquent leur logo DANS le .jar (Fabric « icon » de fabric.mod.json, Quilt, Forge / NeoForge « logoFile » de mods.toml, mcmod.info).
   On le lit, on le réduit à 64 px et on le garde dans un petit dossier de cache (mod-icons/) ; l'instance ne retient qu'une clé (m.ik) : les données des instances restent légères
   (la liste d'instances est envoyée à l'interface très souvent). L'image est jointe au mod seulement quand on ouvre l'instance (attach).
   Un mod sans logo est marqué (m.noIcon) pour ne pas rouvrir son jar à chaque fois : l'interface affiche alors une pastille colorée à son nom. */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const Zip = require('adm-zip');
const plat = require('./platform'), store = require('./store');
let ni = null; try { ni = require('electron').nativeImage || null; } catch (e) { ni = null; }   // absent hors d'Electron (tests) : l'image est gardée telle quelle si elle est petite
const MAX_IN = 2.5e6, MAX_RAW = 24000, SIZE = 64;
const tick = () => new Promise(r => setImmediate(r));
const norm = n => String(n).replace(/\\/g, '/').replace(/^\.?\//, '');
const json = t => JSON.parse(String(t).replace(/^\uFEFF/, ''));
const isPng = b => b && b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47, isJpg = b => b && b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const cacheDir = () => path.join(plat.dataDir(), 'mod-icons');

/* Fabric : "icon": "x.png"  ou  { "128": "a.png", "32": "b.png" } (on prend la plus grande ≤ 256) */
const pick = v => {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') { const k = Object.keys(v).map(Number).filter(n => n > 0).sort((a, b) => b - a); const n = k.find(x => x <= 256) || k[k.length - 1]; return n ? v[n] : ''; }
  return '';
};

/** Chemin de l'image annoncé par le jar, ou deviné (icon.png / logo.png), ou '' */
function logoPath(z) {
  const text = n => { const e = z.getEntry(n); return e ? String(z.readAsText(e)) : null; }; let t;
  if ((t = text('fabric.mod.json'))) { try { const p = pick(json(t).icon); if (p) return p; } catch (e) { /* JSON illisible : suivant */ } }
  if ((t = text('quilt.mod.json'))) { try { const p = pick(((json(t).quilt_loader || {}).metadata || {}).icon); if (p) return p; } catch (e) { /* suivant */ } }
  for (const n of ['META-INF/neoforge.mods.toml', 'META-INF/mods.toml']) if ((t = text(n))) { const m = /^\s*logoFile\s*=\s*["']([^"']+)["']/m.exec(t); if (m) return m[1]; }
  if ((t = text('mcmod.info'))) { try { const j = json(t), a = Array.isArray(j) ? j : (j.modList || []); const f = (a[0] || {}).logoFile; if (f) return f; } catch (e) { /* suivant */ } }
  const g = z.getEntries().filter(e => !e.isDirectory && /^(assets\/[^/]+\/)?(icon|logo)\.png$/i.test(norm(e.entryName))).sort((a, b) => norm(a.entryName).length - norm(b.entryName).length)[0];
  return g ? g.entryName : '';
}

/** Octets d'une image PNG 64 px (ou null) tirée du jar : ne lève jamais d'exception */
exports.fromJar = file => {
  try {
    const z = new Zip(file), p = norm(logoPath(z)); if (!p) return null;
    const e = z.getEntry(p) || z.getEntries().find(x => norm(x.entryName).toLowerCase() === p.toLowerCase()); if (!e || e.isDirectory || e.header.size > MAX_IN) return null;
    const buf = e.getData(); if (!isPng(buf) && !isJpg(buf)) return null;
    if (ni) {
      const img = ni.createFromBuffer(buf); if (img.isEmpty()) return null; const s = img.getSize();
      const out = s.width >= s.height ? img.resize({ width: SIZE, quality: 'best' }) : img.resize({ height: SIZE, quality: 'best' }); const png = out.toPNG(); return png.length ? png : null;
    }
    return isPng(buf) && buf.length <= MAX_RAW ? buf : null;
  } catch (err) { return null; }
};

const keyOf = (m, f) => { let sz = 0; try { sz = fs.statSync(f).size; } catch (e) { /* absent */ } return crypto.createHash('sha1').update(m.file + ':' + sz).digest('hex').slice(0, 20); };
const jarOf = (inst, m) => { const base = path.join(plat.dataDir(), 'instances', inst.id, 'mods', m.file); return [base, base + '.disabled'].find(x => fs.existsSync(x)) || ''; };

/** Cherche l'image des mods d'une instance qui n'en ont pas ; renvoie le nombre d'images trouvées (l'interface se rafraîchit si > 0) */
exports.fill = async instId => {
  const inst = (store.get().instances || []).find(i => i.id === instId); if (!inst) return 0;
  let found = 0, changed = false, k = 0;
  for (const m of inst.mods || []) {
    if (m.icon || m.ik || m.noIcon) continue;
    const f = jarOf(inst, m); if (!f) continue;                       // fichier absent : on réessaiera plus tard (pas de marque)
    const png = exports.fromJar(f);
    if (png) { fs.mkdirSync(cacheDir(), { recursive: true }); const key = keyOf(m, f); fs.writeFileSync(path.join(cacheDir(), key + '.png'), png); m.ik = key; found++; } else m.noIcon = true;
    changed = true; if (++k % 6 === 0) await tick();                  // on rend la main à l'interface
  }
  if (changed) store.save(); return found;
};

const memo = new Map();
const dataUrl = key => { if (memo.has(key)) return memo.get(key); let u = ''; try { u = 'data:image/png;base64,' + fs.readFileSync(path.join(cacheDir(), key + '.png')).toString('base64'); } catch (e) { /* cache effacé */ } memo.set(key, u); return u; };

/** Joint l'image du cache aux mods (copies : la base de données n'est pas modifiée) */
exports.attach = list => (list || []).map(m => (!m.icon && m.ik ? { ...m, icon: dataUrl(m.ik) } : m));
exports._reset = () => memo.clear();
