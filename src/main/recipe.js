/* Recette d'une instance partageable (« code de partage » HYD1.…) : version de Minecraft, loader (Fabric, Quilt, Forge, NeoForge ou aucun), version du loader pour Forge/NeoForge,
   et la liste des mods Modrinth. Sans aucune dépendance : sert à fabriquer le code, à le relire avant de créer une instance, et à vérifier qu'une carte de chat dit vrai. */
const zlib = require('zlib');
const LOADERS = ['vanilla', 'fabric', 'quilt', 'forge', 'neoforge'], VER = /^[\w.+-]{1,32}$/, LVER = /^[\w.+-]{1,40}$/, PID = /^[A-Za-z0-9]{8}$/;

/** { version, type, loader, loaderVer, pids } → 'HYD1.…' */
exports.encode = ({ version, type, loader, loaderVer, pids }) => 'HYD1.' + zlib.deflateSync(JSON.stringify({ v: version, t: type, l: loader, ...(loader === 'forge' || loader === 'neoforge' ? { lv: loaderVer } : {}), m: pids })).toString('base64url');

/** 'HYD1.…' → { v, t, l, lv, m } vérifié, ou une erreur claire. Un code de Forge/NeoForge sans version du loader est refusé (l'instance ne pourrait pas se lancer). */
exports.decode = code => {
  code = String(code || '').trim(); if (!/^HYD1\.[\w-]{1,20000}$/.test(code)) throw new Error('Code de modpack invalide.');
  let d; try { d = JSON.parse(zlib.inflateSync(Buffer.from(code.slice(5), 'base64url'), { maxOutputLength: 100000 }).toString()); } catch (e) { throw new Error('Code de modpack illisible.'); }
  const forge = d && (d.l === 'forge' || d.l === 'neoforge');
  if (!d || typeof d.v !== 'string' || !VER.test(d.v) || !LOADERS.includes(d.l) || !Array.isArray(d.m) || d.m.length > 200 || !d.m.every(x => typeof x === 'string' && PID.test(x)) || (forge && !(typeof d.lv === 'string' && LVER.test(d.lv)))) throw new Error('Code de modpack invalide.');
  return { v: d.v, t: d.t === 'snapshot' ? 'snapshot' : 'release', l: d.l, lv: forge ? d.lv : '', m: d.m };
};
exports.LOADERS = LOADERS;
