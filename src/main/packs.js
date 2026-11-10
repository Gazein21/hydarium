/* Modpacks (Modrinth + CurseForge) et maps (CurseForge) : recherche et installation depuis le launcher.
   Un modpack devient une NOUVELLE instance (importée comme un fichier .mrpack / .zip, via modpack.run) ; une map est ajoutée aux mondes d'une instance. */
const fs = require('fs'), path = require('path'), os = require('os');
const store = require('./store'), cf = require('./curseforge');
const MR = 'https://api.modrinth.com/v2', UA = { 'User-Agent': 'Hydarium/0.10 (help@hydarium.net)' };
const j = async u => { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(12000) }); if (!r.ok) throw new Error('Modrinth : HTTP ' + r.status); return r.json(); };
const icon = u => (typeof u === 'string' && u.startsWith('https://cdn.modrinth.com/') ? u : '');
const SORT = { downloads: 'downloads', follows: 'follows', newest: 'newest', updated: 'updated' };

/* ----- recherche (même forme de résultat que content.search) ----- */
exports.search = async (type, q, offset, source, sort) => {
  if (type === 'map' || source === 'curseforge') {
    if (!cf.hasKey()) throw new Error(type === 'map' ? 'Les maps viennent de CurseForge : ajoute ta clé CurseForge (gratuite) pour les chercher.' : 'Ajoute ta clé CurseForge pour chercher là-bas.');
    return cf.search({ type, q, version: '', loader: '', offset, sort });
  }
  const facets = [['project_type:modpack']], idx = SORT[sort] || (q ? 'relevance' : 'downloads');
  const r = await j(`${MR}/search?query=${encodeURIComponent(String(q || '').slice(0, 80))}&limit=20&offset=${Math.max(0, Math.min(+offset || 0, 480))}&index=${idx}&facets=${encodeURIComponent(JSON.stringify(facets))}`);
  return { total: r.total_hits, hits: r.hits.map(h => ({ pid: h.project_id, slug: h.slug, title: h.title, desc: h.description, icon: icon(h.icon_url), author: h.author, downloads: h.downloads, ok: false, installed: false, src: 'modrinth', mc: (h.versions || []).slice(-1)[0] || '', loaders: (h.categories || []).filter(c => ['fabric', 'forge', 'neoforge', 'quilt'].includes(c)) })) };
};

/* ----- téléchargement d'un fichier dans le dossier temporaire ----- */
async function fetchTo(url, name, hosts) {
  let u; try { u = new URL(url); } catch (e) { throw new Error('Adresse de téléchargement invalide.'); }
  if (u.protocol !== 'https:' || !hosts.some(h => u.hostname === h || u.hostname.endsWith('.' + h))) throw new Error('Adresse de téléchargement inattendue (' + u.hostname + ').');
  const dest = path.join(os.tmpdir(), 'hyd-dl-' + Date.now() + '-' + String(name).replace(/[^\w.-]/g, '_'));
  const r = await fetch(url, { signal: AbortSignal.timeout(900000) }); if (!r.ok) throw new Error('Téléchargement : HTTP ' + r.status);
  fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer())); return dest;
}

/* ----- modpack : dernière version (n'importe quelle version de Minecraft, c'est le pack qui choisit) ----- */
async function packFile(pid, source) {
  if (source === 'curseforge' || /^cf\d+$/.test(String(pid))) {
    const id = String(pid).replace(/^cf/, ''); if (!/^\d+$/.test(id)) throw new Error('Modpack invalide.');
    const m = await cf.mod(+id), files = (m.latestFiles || []).filter(f => /\.zip$/i.test(f.fileName || '')).sort((a, b) => new Date(b.fileDate) - new Date(a.fileDate)), f = files[0];
    if (!f) throw new Error('Aucun fichier à télécharger pour ce modpack (l’auteur ne l’autorise peut-être pas hors de CurseForge).');
    return { title: m.name, url: cf.fileUrl(f), name: f.fileName, hosts: ['forgecdn.net'], ref: { src: 'curseforge', pid: 'cf' + id, title: m.name } };
  }
  if (!/^[A-Za-z0-9]{8}$/.test(String(pid))) throw new Error('Modpack invalide.');
  const [p, vs] = await Promise.all([j(`${MR}/project/${pid}`), j(`${MR}/project/${pid}/version`)]);
  const v = vs && vs[0], f = v && (v.files.find(x => x.primary) || v.files[0]); if (!f) throw new Error('Ce modpack n’a aucune version téléchargeable.');
  return { title: p.title, url: f.url, name: f.filename, hosts: ['modrinth.com'], ref: { src: 'modrinth', pid, title: p.title } };
}

exports.install = async (type, pid, source, instId, progress) => {
  if (type === 'modpack') {
    const f = await packFile(pid, source), file = await fetchTo(f.url, f.name, f.hosts);
    try {
      const r = await require('./modpack').run(file, progress || (() => {}));
      const n = store.get().instances.find(x => x.id === r.id); if (n) { n.pack = f.ref; store.save(); }
      return { id: r.id, name: r.name, bad: r.bad || [] };
    } finally { try { fs.unlinkSync(file); } catch (e) {} }
  }
  if (type === 'map') {
    if (!/^cf\d+$/.test(String(pid))) throw new Error('Map invalide.');
    const id = +String(pid).slice(2), m = await cf.mod(id), files = (m.latestFiles || []).filter(f => /\.zip$/i.test(f.fileName || '')).sort((a, b) => new Date(b.fileDate) - new Date(a.fileDate)), f = files[0];
    if (!f) throw new Error('Aucun fichier téléchargeable pour cette map.');
    const file = await fetchTo(cf.fileUrl(f), f.fileName, ['forgecdn.net']);
    try { require('./content').worldImport(instId, file); } finally { try { fs.unlinkSync(file); } catch (e) {} }
    return { name: m.name };
  }
  throw new Error('Type inconnu.');
};
