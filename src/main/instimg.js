/* Images d'instance : une photo choisie par l'utilisateur, ou le logo officiel du modpack (Modrinth / CurseForge).
   L'image est réduite puis gardée dans un petit dossier (inst-images/<id>.jpg|png) ; l'instance ne retient que { ext, kind, t }
   (les données des instances sont envoyées très souvent à l'interface : pas d'image dedans). L'interface la demande à la volée (get). */
const fs = require('fs'), path = require('path');
const plat = require('./platform'), store = require('./store'), log = require('./log');
let ni = null; try { ni = require('electron').nativeImage || null; } catch (e) { ni = null; }   // absent hors d'Electron (tests)

const MAX_IN = 12e6, MAX_LOGO = 3e6, PHOTO_W = 960, LOGO_PX = 256;
const HOSTS = ['cdn.modrinth.com', 'media.forgecdn.net'];   // seuls serveurs d'images acceptés pour un logo de modpack
const dir = () => path.join(plat.dataDir(), 'inst-images');
const find = id => (store.get().instances || []).find(x => x.id === id);
const okId = id => typeof id === 'string' && /^[a-z0-9]{4,32}$/.test(id);
const fileOf = i => i && i.img && okId(i.id) && /^(jpg|png)$/.test(i.img.ext) ? path.join(dir(), i.id + '.' + i.img.ext) : '';
const isPng = b => b && b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
const isJpg = b => b && b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

const drop = i => { const f = fileOf(i); if (f) { try { fs.unlinkSync(f); } catch (e) { /* déjà absent */ } } };

/** Enregistre l'image (octets PNG ou JPEG) pour l'instance. kind : 'photo' (plein cadre) ou 'logo' (carré, affiché avec un fond flou). */
exports.save = (id, buf, kind) => {
  const i = find(id); if (!i || !okId(id)) throw new Error('Instance introuvable.');
  if (!Buffer.isBuffer(buf) || buf.length > MAX_IN) throw new Error('Image trop lourde (12 Mo maximum).');
  if (!isPng(buf) && !isJpg(buf)) throw new Error('Format d’image non pris en charge (PNG ou JPG).');
  const logo = kind === 'logo'; let out = buf, ext = isPng(buf) ? 'png' : 'jpg';
  if (ni) {
    let img = ni.createFromBuffer(buf); if (img.isEmpty()) throw new Error('Image illisible.');
    const { width, height } = img.getSize(), lim = logo ? LOGO_PX : PHOTO_W;
    if (width > lim) img = img.resize({ width: lim, height: Math.max(1, Math.round(height * lim / width)), quality: 'good' });
    if (logo || ext === 'png') { out = img.toPNG(); ext = 'png'; } else { out = img.toJPEG(85); ext = 'jpg'; }   // un logo garde sa transparence
  } else if (out.length > 4e6) throw new Error('Image trop lourde.');
  fs.mkdirSync(dir(), { recursive: true }); drop(i);
  fs.writeFileSync(path.join(dir(), id + '.' + ext), out);
  i.img = { ext, kind: logo ? 'logo' : 'photo', t: Date.now() }; store.save();
  return i.img;
};

/** { u: « data:… », kind, t } pour l'interface, ou null */
exports.get = id => {
  const i = find(id), f = fileOf(i); if (!f) return null;
  try { return { u: 'data:image/' + (i.img.ext === 'png' ? 'png' : 'jpeg') + ';base64,' + fs.readFileSync(f).toString('base64'), kind: i.img.kind === 'logo' ? 'logo' : 'photo', t: i.img.t }; }
  catch (e) { return null; }
};

exports.clear = id => { const i = find(id); if (!i) return; drop(i); delete i.img; store.save(); };

/** copie l'image d'une instance vers sa copie (duplication) */
exports.copy = (from, to) => {
  const a = find(from), b = find(to), f = fileOf(a); if (!f || !b || !okId(to)) return;
  try { fs.mkdirSync(dir(), { recursive: true }); fs.copyFileSync(f, path.join(dir(), to + '.' + a.img.ext)); b.img = { ...a.img }; store.save(); } catch (e) { log.warn('copie de l’image d’instance', e.message); }
};

/** choisit un fichier image sur le disque (le chemin vient du sélecteur système, jamais de l'interface) */
exports.fromFile = (id, file) => {
  const st = fs.statSync(file); if (!st.isFile() || st.size > MAX_IN) throw new Error('Image trop lourde (12 Mo maximum).');
  return exports.save(id, fs.readFileSync(file), 'photo');
};

/** télécharge l'image d'un logo (https, serveurs d'images Modrinth / CurseForge uniquement) */
async function fetchLogo(url) {
  let u; try { u = new URL(url); } catch (e) { throw new Error('Adresse d’image invalide.'); }
  if (u.protocol !== 'https:' || !HOSTS.includes(u.hostname)) throw new Error('Source d’image refusée (' + u.hostname + ').');
  const r = await fetch(u.href, { signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error('Image du modpack : HTTP ' + r.status);
  const b = Buffer.from(await r.arrayBuffer()); if (b.length > MAX_LOGO) throw new Error('Image du modpack trop lourde.'); return b;
}
exports.fromUrl = async (id, url) => exports.save(id, await fetchLogo(url), 'logo');

/** logo officiel du modpack d'où vient l'instance (instance.pack = { src, pid }) ; sert aussi aux modpacks installés avant cette fonction */
exports.fromPack = async id => {
  const i = find(id); if (!i || !i.pack) throw new Error('Cette instance ne vient pas d’un modpack téléchargé depuis le catalogue.');
  const url = await require('./packs').logoOf(i.pack); if (!url) throw new Error('Ce modpack n’a pas d’image officielle.');
  return exports.fromUrl(id, url);
};
