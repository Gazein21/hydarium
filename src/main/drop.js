/* Glisser-déposer : on reconnaît ce qu'est chaque fichier déposé (par son CONTENU, pas seulement son nom) et on le range au bon endroit de l'instance.
   • .jar → mod                                  • .zip avec pack.mcmeta + assets/ → pack de ressources
   • .zip avec shaders/ → shader                 • .zip avec pack.mcmeta + data/ (sans assets/) → data pack (préparé pour le prochain nouveau monde)
   • .zip ou dossier avec level.dat → monde       • .mrpack, .zip CurseForge / Prism → modpack (crée une NOUVELLE instance : à confirmer par l'interface)
   Les chemins viennent du système (webUtils.getPathForFile dans le preload), jamais d'un texte saisi. Le contenu d'un .zip est lu SANS le charger en mémoire
   (seulement la table des fichiers en fin d'archive) : un monde de plusieurs Go se reconnaît instantanément. */
const fs = require('fs'), path = require('path');

const MAX_FILES = 60;

/** noms des entrées d'un .zip (table centrale, lue depuis la fin du fichier) ; null si illisible ou zip64 */
function zipNames(file) {
  let fd; try {
    fd = fs.openSync(file, 'r'); const size = fs.fstatSync(fd).size; if (size < 22) return null;
    const tail = Buffer.alloc(Math.min(size, 65557)); fs.readSync(fd, tail, 0, tail.length, size - tail.length);
    let e = -1; for (let k = tail.length - 22; k >= 0; k--) if (tail.readUInt32LE(k) === 0x06054b50) { e = k; break; }
    if (e < 0) return null;
    const count = tail.readUInt16LE(e + 10), cdSize = tail.readUInt32LE(e + 12), cdOff = tail.readUInt32LE(e + 16);
    if (count === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff || cdSize > 64e6 || cdOff + cdSize > size) return null;   // zip64 ou démesuré : on ne devine pas
    const cd = Buffer.alloc(cdSize); fs.readSync(fd, cd, 0, cdSize, cdOff);
    const names = []; let p = 0;
    while (p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50 && names.length < 200000) {
      const n = cd.readUInt16LE(p + 28), x = cd.readUInt16LE(p + 30), c = cd.readUInt16LE(p + 32);
      names.push(cd.toString('utf8', p + 46, p + 46 + n).replace(/\\/g, '/')); p += 46 + n + x + c;
    }
    return names;
  } catch (err) { return null; } finally { if (fd !== undefined) try { fs.closeSync(fd); } catch (err) { /* déjà fermé */ } }
}

exports.zipNames = zipNames;

/** 'mod' | 'resourcepack' | 'shader' | 'datapack' | 'world' | 'modpack' | 'unknown' */
exports.classify = p => {
  let st; try { st = fs.statSync(p); } catch (e) { return 'unknown'; }
  if (st.isDirectory()) return fs.existsSync(path.join(p, 'level.dat')) ? 'world' : 'unknown';
  if (!st.isFile()) return 'unknown';
  if (/\.jar$/i.test(p)) return 'mod';
  if (/\.mrpack$/i.test(p)) return 'modpack';
  if (!/\.zip$/i.test(p)) return 'unknown';
  const n = zipNames(p); if (!n) return 'unknown';
  const has = re => n.some(x => re.test(x));
  if (has(/^modrinth\.index\.json$/) || has(/^[^/]+\/modrinth\.index\.json$/)) return 'modpack';
  if (has(/^(instance\.cfg|mmc-pack\.json)$/) || has(/^[^/]+\/(instance\.cfg|mmc-pack\.json)$/)) return 'modpack';
  if ((has(/^manifest\.json$/) || has(/^[^/]+\/manifest\.json$/)) && has(/(^|\/)overrides\//)) return 'modpack';   // CurseForge
  if (has(/^level\.dat$/) || has(/^[^/]+\/level\.dat$/)) return 'world';
  if (has(/^pack\.mcmeta$/)) return has(/^assets\//) || !has(/^data\//) ? 'resourcepack' : 'datapack';   // Minecraft veut pack.mcmeta à la racine du zip
  if (has(/^shaders\//)) return 'shader';
  return 'unknown';
};

/** Range les fichiers dans l'instance. id vide : aucune instance ouverte, seuls les modpacks sont retenus.
    Renvoie { counts: { mod, resourcepack, shader, datapack, world }, modpacks: [chemins], skipped: [noms], errors: [{ name, msg }] } */
exports.run = (id, paths) => {
  const content = require('./content'), mods = require('./mods'), isHost = !!id && (require('./store').get().hosts || []).some(h => h.id === id);   // page d'un serveur hébergé : seuls les data packs sont acceptés
  const r = { counts: { mod: 0, resourcepack: 0, shader: 0, datapack: 0, world: 0 }, modpacks: [], skipped: [], errors: [] };
  const seen = new Set(); const list = (Array.isArray(paths) ? paths : []).filter(p => typeof p === 'string' && path.isAbsolute(p) && !seen.has(p) && seen.add(p)).slice(0, MAX_FILES);
  for (const p of list) {
    const name = path.basename(p), kind = exports.classify(p);
    try {
      if (kind === 'modpack') r.modpacks.push(p);
      else if (isHost) {
        if (!/\.zip$/i.test(p)) r.skipped.push(name);
        else { const x = require('./hostdp').add(id, [p]); r.counts.datapack += x.added.length; for (const s of x.skipped) r.errors.push({ name: s.name, msg: s.why }); }   // vérifie lui-même que c'est un data pack, et que le serveur est arrêté
      }
      else if (kind === 'unknown' || !id) r.skipped.push(name);
      else if (kind === 'mod') { mods.importFile(id, p); r.counts.mod++; }
      else if (kind === 'resourcepack' || kind === 'shader') { r.counts[kind] += content.importFiles(id, kind, [p]); }
      else if (kind === 'datapack') { r.counts.datapack += content.dpImport(id, '__next__', [p]); }
      else if (kind === 'world') { content.worldImport(id, p); r.counts.world++; }
    } catch (e) { r.errors.push({ name, msg: String(e && e.message || e) }); }
  }
  return r;
};
