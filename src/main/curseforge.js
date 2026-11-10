/* CurseForge : nécessite une clé d’API gratuite (console.curseforge.com), saisie dans une fenêtre qui s’ouvre au premier clic sur « CurseForge » (ou dans Paramètres › Avancé). */
const fs = require('fs'), path = require('path');
const store = require('./store');
const CF = 'https://api.curseforge.com/v1', CLASS = { mod: 6, resourcepack: 12, shader: 6552, datapack: 6945, plugin: 5, modpack: 4471, map: 17 }, LOADER = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 };
const key = () => (store.get().settings.cfKey || '').trim();
exports.hasKey = () => !!key();
async function api(p, opt = {}) {
  if (!key()) throw new Error('Ajoute ta clé CurseForge (gratuite) dans Paramètres › Avancé pour utiliser CurseForge.');
  const r = await fetch(CF + p, { ...opt, headers: { 'x-api-key': key(), Accept: 'application/json', ...(opt.headers || {}) }, signal: AbortSignal.timeout(20000) });
  if (r.status === 403 || r.status === 401) throw new Error('Clé CurseForge refusée : vérifie-la dans Paramètres › Avancé.');
  if (!r.ok) throw new Error('CurseForge indisponible (' + r.status + ').');
  return r.json();
}
const thumb = u => (typeof u === 'string' && /^https:\/\/media\.forgecdn\.net\//.test(u) ? u : '');
/* tri : auto = pertinence si on cherche, sinon popularité ; champs de l’API CurseForge : 2 popularité, 3 dernière mise à jour, 4 nom, 6 téléchargements, 11 date de sortie */
const SORT = { downloads: [6, 'desc'], updated: [3, 'desc'], newest: [11, 'desc'], name: [4, 'asc'] }, SEG = { mod: 'mc-mods', resourcepack: 'texture-packs', shader: 'shaders', datapack: 'data-packs', plugin: 'bukkit-plugins', modpack: 'modpacks', map: 'worlds' };
exports.pageUrl = (type, slug) => `https://www.curseforge.com/minecraft/${SEG[type] || 'mc-mods'}/${encodeURIComponent(slug)}`;
exports.search = async ({ type, q, version, loader, offset, sort }) => {
  if (!CLASS[type]) throw new Error('Type inconnu.');
  const [sf, so] = SORT[sort] || [q ? 1 : 2, 'desc'];
  const p = new URLSearchParams({ gameId: '432', classId: String(CLASS[type]), pageSize: '20', index: String(Math.max(0, Math.min(+offset || 0, 500))), sortField: String(sf), sortOrder: so });
  if (q) p.set('searchFilter', String(q).slice(0, 80)); if (version) p.set('gameVersion', version);
  if (type === 'mod' && LOADER[loader]) p.set('modLoaderType', String(LOADER[loader]));
  const r = await api('/mods/search?' + p);
  return { total: r.pagination ? r.pagination.totalCount : r.data.length, hits: r.data.map(m => ({ pid: 'cf' + m.id, cfid: m.id, slug: m.slug, title: m.name, desc: m.summary, icon: thumb(m.logo && m.logo.thumbnailUrl), author: (m.authors && m.authors[0] && m.authors[0].name) || '', downloads: m.downloadCount || 0, ok: false, src: 'curseforge', link: (m.links && /^https:\/\/www\.curseforge\.com\//.test(m.links.websiteUrl || '') && m.links.websiteUrl) || exports.pageUrl(type, m.slug), updated: m.dateModified || '', installed: false })) };
};
/* teste une clé sans l’enregistrer */
exports.check = async k => {
  k = String(k || '').trim(); if (!/^[\w$./+=-]{10,200}$/.test(k)) return { ok: false, error: 'Cette clé ne ressemble pas à une clé CurseForge (elle commence en général par « $2a$10$ »).' };
  try {
    const r = await fetch(CF + '/games/432', { headers: { 'x-api-key': k, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    if (r.status === 401 || r.status === 403) return { ok: false, error: 'CurseForge a refusé cette clé : vérifie qu’elle est complète et copiée sans espace.' };
    if (!r.ok) return { ok: false, error: 'CurseForge ne répond pas pour le moment (' + r.status + '). Réessaie dans un instant.' };
    return { ok: true };
  } catch (e) { return { ok: false, error: 'Impossible de joindre CurseForge : vérifie ta connexion Internet.' }; }
};
exports.fileUrl = f => f.downloadUrl || `https://edge.forgecdn.net/files/${Math.floor(f.id / 1000)}/${f.id % 1000}/${encodeURIComponent(f.fileName)}`;
exports.latestFile = async (modId, version, loader, type) => {
  const p = new URLSearchParams({ pageSize: '15' }); if (version) p.set('gameVersion', version); if (type === 'mod' && LOADER[loader]) p.set('modLoaderType', String(LOADER[loader]));
  const fs2 = (await api(`/mods/${+modId}/files?` + p)).data.filter(f => f.isAvailable !== false);
  const f = fs2.filter(x => x.releaseType === 1)[0] || fs2[0]; if (!f) throw new Error('Aucun fichier CurseForge compatible avec Minecraft ' + version + '.'); return f;
};
exports.mod = async id => (await api('/mods/' + +id)).data;
exports.files = async ids => (await api('/mods/files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileIds: ids }) })).data;
exports.mods = async ids => (await api('/mods', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modIds: ids }) })).data;
