/* Icônes d'instances générées : un objet de Minecraft (épée, pomme dorée, perle…) dessiné sur le décor de l'instance.
   Les textures ne sont PAS dans le dépôt (elles appartiennent à Mojang) : elles sont extraites, sur le PC de la personne, du client.jar de Minecraft déjà téléchargé
   (comme les skins par défaut, voir skins.js) et gardées dans un petit cache. Pas de jar disponible → aucune icône générée, le décor seul s'affiche. */
const fs = require('fs'), path = require('path');
const plat = require('./platform'), log = require('./log');

/* Objets proposés, dans cet ordre FIXE (l'objet automatique d'une instance en dépend). Les noms existent depuis Minecraft 1.13 ; avant, le dossier s'appelait « items ». */
const LIST = ['diamond_sword', 'diamond_pickaxe', 'iron_axe', 'bow', 'trident', 'golden_apple', 'cake', 'honeycomb', 'emerald', 'diamond', 'netherite_ingot', 'amethyst_shard',
  'ender_pearl', 'ender_eye', 'nether_star', 'heart_of_the_sea', 'totem_of_undying', 'experience_bottle', 'blaze_rod', 'fire_charge', 'lava_bucket', 'firework_rocket',
  'book', 'name_tag', 'saddle', 'spyglass', 'compass', 'clock'];
exports.LIST = LIST;
const dir = () => path.join(plat.dataDir(), 'cache', 'mc-items');
const ok = n => LIST.includes(n);
const cached = n => path.join(dir(), n + '.png');

/** un vrai PNG carré, petit (les textures animées sont des bandes non carrées : écartées) */
function check(b) {
  if (!Buffer.isBuffer(b) || b.length < 70 || b.length > 65536) return false;
  if (b.readUInt32BE(0) !== 0x89504e47 || b.readUInt32BE(4) !== 0x0d0a1a0a) return false;
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20); return w === h && w >= 8 && w <= 128;
}
const entries = n => ['item', 'items'].flatMap(f => [n, n + '_00'].map(x => 'assets/minecraft/textures/' + f + '/' + x + '.png'));   // compass et clock sont des animations : on prend la 1re image

/** extrait les objets manquants d'une archive déjà ouverte (adm-zip) ; renvoie le nombre de fichiers ajoutés */
exports.extractFrom = z => {
  let n = 0;
  for (const name of LIST) {
    if (fs.existsSync(cached(name))) continue;
    for (const p of entries(name)) {
      const e = z.getEntry(p); if (!e) continue;
      let b; try { b = e.getData(); } catch (err) { continue; }
      if (!check(b)) continue;
      fs.mkdirSync(dir(), { recursive: true }); fs.writeFileSync(cached(name) + '.tmp', b); fs.renameSync(cached(name) + '.tmp', cached(name)); n++; break;
    }
  }
  return n;
};
const missing = () => LIST.filter(n => !fs.existsSync(cached(n)));
const tried = new Set();   // jars déjà ouverts pendant cette session (on ne rouvre pas un jar qui n'a pas ce qu'on cherche)

/** { order: LIST, img: { nom: 'data:image/png;base64,…' } } : seulement les objets disponibles ; img vide si aucun jar n'est encore là */
exports.items = () => {
  if (missing().length) {
    let jars = []; try { jars = require('./skins').localJars(); } catch (e) { jars = []; }
    for (const f of jars) {
      if (tried.has(f) || !missing().length) continue; tried.add(f);
      try { const Zip = require('adm-zip'); exports.extractFrom(new Zip(fs.readFileSync(f))); } catch (e) { log.warn('textures d’objets', path.basename(f), e.message); }
    }
  }
  const img = {};
  for (const n of LIST) { try { const b = fs.readFileSync(cached(n)); if (check(b)) img[n] = 'data:image/png;base64,' + b.toString('base64'); } catch (e) { /* pas (encore) extrait */ } }
  return { order: LIST, img };
};
exports.valid = ok;
exports._reset = () => tried.clear();
