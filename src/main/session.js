/* Ce qui se passe pendant qu’une instance tourne : menu en jeu (raccourci), notification de capture, pont et configuration du client. */
const fs = require('fs'), path = require('path');
const { globalShortcut, shell } = require('electron');
const bridge = require('./bridge'), overlay = require('./overlay'), notify = require('./notify'), store = require('./store'), plat = require('./platform'), log = require('./log');
let watcher = null, key = '', cur = null; const seen = new Set();
const agentJar = () => [path.join(process.resourcesPath || '', 'client', 'hydarium-agent.jar'), path.join(plat.dataDir(), 'client', 'hydarium-agent.jar')].find(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }) || '';
exports.agentJar = agentJar;
/* Bonus « client » (vision nocturne, zoom, minimap…) : à partir de mods Modrinth connus, téléchargés à part et chargés par -Dfabric.addMods.
   Ils ne sont jamais copiés dans le dossier mods, donc invisibles dans la liste des mods du launcher. Instance Vanilla : Fabric est utilisé en silence au lancement
   (l’instance reste « Vanilla » dans le launcher). Fonctionne pour toute version prise en charge par Fabric (1.14 et plus, 26.x compris) ; pas pour Forge, NeoForge ni 1.8.9.
   Mod client Hydarium (HUD : FPS, coordonnées, armure…) : hydarium-client-fabric.jar, fourni par la CI, seulement pour les versions listées. */
/* « Hydarium » : notre propre mod (le seul mod du client, aucun mod Modrinth n’est téléchargé pour les bonus), un jar par époque du jeu (le même cœur Java, voir client-mod/). Il regroupe HUD, luminosité, zoom, sprint automatique,
   donc plus besoin des mods Modrinth correspondants. Fabric API (bibliothèque exigée par tout mod Fabric) est ajoutée automatiquement et reste invisible. */
/* Le mod est fabriqué à la demande pour n'importe quelle version (Fabric / Forge) et partagé par toutes les instances de cette version : voir modbuild.js (cache, dédoublonnage) et modplan.js (quoi essayer pour quelle version). */
const mb = require('./modbuild');
const variantOf = inst => { const d = inst && mb.supported(inst); return d && d.ok ? { id: d.key, key: d.key, jar: d.key, forge: d.family === 'forge' } : null; }; // jar = la clé : findJar(clé) renvoie le chemin du jar
const findJar = key => key ? mb.jarFor(key) : '';
/* Forge charge le mod depuis le dossier mods de l'instance : « hydarium-<version>.jar » (1.8.9 : « hydarium-1.8.9.jar », inchangé). Un jar d'une AUTRE version (instance changée de version) est retiré. */
const forgeModName = inst => 'hydarium-' + String(inst && inst.version || '').replace(/[^\w.-]/g, '_') + '.jar';
const dropOtherForgeJars = (dir, keep) => { try { for (const f of fs.readdirSync(dir)) if (/^hydarium-\d+(\.\d+){1,2}\.jar$/.test(f) && f !== keep) fs.unlinkSync(path.join(dir, f)); } catch (e) {} };
const ownJar = inst => { const v = variantOf(inst); return v ? findJar(v.key) : ''; };
exports.modJar = inst => inst ? ownJar(inst) : mb.anyJar();
exports.status = id => {
  const inst = store.get().instances.find(x => x.id === id); if (!inst) return { agent: true, mod: 'none' };
  if (exports.disabled(inst)) return { agent: true, mod: 'disabled', mandatory: true };
  const st = mb.status(inst); return { agent: true, mandatory: true, variant: st.key, ...st };
};
/* Le client est obligatoire : à la création d'une instance (en arrière-plan) et avant chaque lancement on s'assure que le mod de SA version existe.
   Déjà fabriqué pour cette version (par une autre instance, ou livré avec le launcher) → récupéré tel quel ; sinon fabriqué (une seule fois, même si plusieurs instances l'attendent).
   Renvoie { state: 'ready' | 'failed' | 'missing' | 'unsupported' | 'needs-forge' | 'disabled', msg? }. Ne lève jamais d'exception : une instance se crée même si le mod échoue. */
/** Avant le lancement du jeu : le client est fabriqué (ou attendu) AVANT les téléchargements de Minecraft. Désactivé par l'utilisateur : rien. */
exports.ensureFirst = async (inst, send) => exports.disabled(inst) ? { state: 'disabled' } : mb.ensureFirst(inst, send);
exports.ensureClient = async (inst, send, opt) => exports.disabled(inst) ? { state: 'disabled' } : mb.ensure(inst, send, opt);
const fabricOk = v => /^1\.(\d+)/.test(v || '') ? +/^1\.(\d+)/.exec(v)[1] >= 14 : /^\d{2}\./.test(v || ''); // Fabric : 1.14+ et nouveau schéma 26.x
exports.fabricOk = fabricOk;
exports.disabled = inst => !!(inst && inst.client && inst.client.disabled); // « Hydarium Client » désactivé par la personne (liste des mods de l'instance) : le mod n'est pas chargé
exports.fabricMode = inst => { const v = variantOf(inst); return !!(!exports.disabled(inst) && (inst.loader === 'fabric' || inst.loader === 'vanilla') && fabricOk(inst.version) && v && !v.forge && findJar(v.jar)); };
const MR = 'https://api.modrinth.com/v2', UA = { 'User-Agent': 'Hydarium/0.10 (help@hydarium.net)' }, bad = new Map();
const getJson = async u => { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error('Modrinth ' + r.status); return r.json(); };
async function fetchMod(ref, inst, got, depth = 0) { // télécharge le projet (et ses dépendances obligatoires) ; renvoie les chemins des jar
  const key = ref + '|' + inst.version; if (bad.has(key) && Date.now() - bad.get(key) < 6 * 3600e3) return [];
  const has = (inst.mods || []).some(m => !m.disabled && (m.slug === ref || m.pid === ref)); if (has || got.has(ref)) return []; got.add(ref);
  try {
    const q = `game_versions=${encodeURIComponent(JSON.stringify([inst.version]))}&loaders=${encodeURIComponent('["fabric"]')}`, vs = await getJson(`${MR}/project/${ref}/version?${q}`);
    if (!vs.length) throw new Error('aucune version pour ' + inst.version);
    const v = vs[0], f = v.files.find(x => x.primary) || v.files[0]; if (!f || !/^https:\/\/cdn\.modrinth\.com\//.test(f.url) || !/\.jar$/i.test(f.filename)) throw new Error('fichier invalide');
    const dir = path.join(plat.dataDir(), 'client', 'features', inst.version), out = path.join(dir, v.project_id + '-' + String(v.version_number).replace(/[^\w.+-]/g, '_') + '.jar'); fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(out)) fs.writeFileSync(out, Buffer.from(await (await fetch(f.url, { signal: AbortSignal.timeout(60000) })).arrayBuffer()));
    let jars = [out];
    if (depth < 2) for (const d of v.dependencies || []) if (d.dependency_type === 'required' && d.project_id && d.project_id !== 'P7dR8mSH') jars = jars.concat(await fetchMod(d.project_id, inst, got, depth + 1)); // P7dR8mSH = Fabric API (géré à part)
    return jars;
  } catch (e) { bad.set(key, Date.now()); log.warn('bonus client', ref, e.message); return []; }
}
async function fabricApi(inst) { // Hydarium demande Fabric API : celui de l’instance, sinon un exemplaire téléchargé à part
  if ((inst.mods || []).some(m => !m.disabled && /^fabric-api$/i.test(m.slug || ''))) return '';
  const got = await fetchMod('P7dR8mSH', { ...inst, mods: [] }, new Set(), 2); return got[0] || '';
}
exports.jvmArgs = async inst => {
  const c = inst.client = inst.client || store.defaultClient(); c.on = true; // client obligatoire (présent dans la liste) ; il peut seulement être désactivé
  if (c.disabled) { const v0 = variantOf(inst), d0 = path.join(plat.dataDir(), 'instances', inst.id, 'mods', forgeModName(inst)); try { if (v0 && v0.forge && fs.existsSync(d0)) fs.unlinkSync(d0); } catch (e) {} log.info('Hydarium Client désactivé pour cette instance'); return []; }
  const b = await bridge.start(), a = ['-Dhydarium.bridge=http://127.0.0.1:' + b.port, '-Dhydarium.token=' + b.token, '-Dhydarium.instance=' + inst.id, '-Dhydarium.config=' + path.join(plat.dataDir(), 'instances', inst.id, 'config', 'hydarium-client.json')];
  if (exports.fabricMode(inst)) {
    const add = [], got = new Set(); if (ownJar(inst)) add.push(ownJar(inst));
    if (add.length) { const api = await fabricApi(inst); if (api) add.push(api); a.push('-Dfabric.addMods=' + [...new Set(add)].join(path.delimiter)); log.info('Hydarium chargé', add.map(x => path.basename(x)).join(', ')); }
    if (c.nativeHud === false) a.push('-Dhydarium.draw=0');
    return a;
  }
  const v = variantOf(inst), dir = path.join(plat.dataDir(), 'instances', inst.id, 'mods'), dst = path.join(dir, forgeModName(inst)); // Forge charge le mod depuis le dossier mods
  try { if (v && v.forge && findJar(v.jar)) { fs.mkdirSync(dir, { recursive: true }); fs.copyFileSync(findJar(v.jar), dst); dropOtherForgeJars(dir, path.basename(dst)); log.info('Mode Hydarium (Forge ' + inst.version + ') copié dans mods depuis', findJar(v.jar)); if (c.nativeHud === false) a.push('-Dhydarium.draw=0'); } else if (fs.existsSync(dst)) fs.unlinkSync(dst); } catch (e) { log.warn('mode Hydarium Forge', e.message); }
  const jar = agentJar(); if (jar) a.unshift('-javaagent:' + jar); return a;
};
exports.writeConfig = (inst, dir) => {
  inst.client = inst.client || store.defaultClient(); inst.client.on = true;
  try { fs.mkdirSync(path.join(dir, 'config'), { recursive: true }); fs.writeFileSync(path.join(dir, 'config', 'hydarium-client.json'), JSON.stringify({ version: 1, instance: inst.id, mc: inst.version, loader: inst.loader, lang: (store.get().settings.uiLang === 'en' || (!store.get().settings.uiLang && /^en/i.test(require('electron').app.getLocale()))) ? 'en' : 'fr', modules: inst.client.modules || {} }, null, 2)); } catch (e) { log.error('config client', e); }
};
let wWatch = null, tWatch = null, tStart = 0; const seenW = new Set();
exports.start = (inst, dir, opts) => {
  cur = inst; exports.stop(true); try { require('./hud').start(inst, opts && opts.server); } catch (e) { log.warn('HUD', e.message); }
  const sd = path.join(dir, 'screenshots'); try { fs.mkdirSync(sd, { recursive: true }); } catch (e) {}
  try { fs.readdirSync(sd).forEach(f => seen.add(f)); watcher = fs.watch(sd, { persistent: false }, (ev, f) => {
    if (!f || !/\.(png|jpe?g)$/i.test(f) || seen.has(f)) return;
    setTimeout(() => { const p = path.join(sd, f); if (seen.has(f) || !fs.existsSync(p)) return; seen.add(f); notify.show('Capture enregistrée', inst.name + ' · ' + f + ' · clique pour l’ouvrir', 'shot:' + p, 'shot'); }, 700);
  }); } catch (e) { log.warn('surveillance captures', e.message); }
  const sv = path.join(dir, 'saves'); try { fs.mkdirSync(sv, { recursive: true }); fs.readdirSync(sv).forEach(f => seenW.add(f)); wWatch = fs.watch(sv, { persistent: false }, (ev, f) => {
    if (!f || seenW.has(f)) return; const p = path.join(sv, f); let tries = 0;
    const chk = () => { try { if (!fs.statSync(p).isDirectory()) return; } catch (e) { return; } if (!fs.existsSync(path.join(p, 'level.dat'))) { if (++tries < 6) setTimeout(chk, 3000); return; } if (seenW.has(f)) return; seenW.add(f);
      try { require('./hud').setDpWidget(false); } catch (e) {} const ct = require('./content'), n = ct.applyStaged(inst.id, f);
      notify.show('Nouveau monde : ' + f, n ? n + ' data pack(s) préparé(s) ajouté(s) : actifs à la fermeture du jeu.' : 'Clique pour ajouter des data packs à ce monde.', 'ovl:datapack:' + f, 'done'); };
    setTimeout(chk, 2500);
  }); } catch (e) { log.warn('surveillance des mondes', e.message); }
  tStart = Date.now() - 2000; try { tWatch = fs.watch(require('os').tmpdir(), { persistent: false }, (ev, f) => {
    if (!f || !/^mcworld-/i.test(f)) return;
    setTimeout(() => { const ct = require('./content'), t = ct.tempWorld(tStart); if (!t || seenW.has('tmp:' + t.name)) return; seenW.add('tmp:' + t.name);
      let n = 0; try { const d = path.join(dir, 'datapacks-staging'); n = ct.placeInTemp(fs.readdirSync(d).filter(x => /\.zip$/i.test(x)).map(x => path.join(d, x)), tStart); } catch (e) {} // la copie préparée reste jusqu’à la création effective du monde
      notify.show('Création de monde détectée', n ? n + ' data pack(s) préparé(s) dans l’écran Data Packs : passe-les dans la colonne de droite pour qu’ils agissent dès la génération du monde.' : 'Clique pour ajouter des data packs à ce nouveau monde.', 'ovl:datapack:__next__', 'done');
      // widget cliquable dans le jeu tant que l'écran de création est ouvert (Minecraft supprime le dossier temporaire en le quittant)
      try { const hud = require('./hud'); hud.setDpWidget(true); const iv = setInterval(() => { if (!fs.existsSync(t.path)) { hud.setDpWidget(false); clearInterval(iv); } }, 1500); dpIv = iv; } catch (e) {} }, 1200);
  }); } catch (e) { log.warn('surveillance du dossier temporaire', e.message); }
  const k = store.get().settings.overlayKey; key = k === undefined ? 'Alt+H' : k;
  if (key && key !== 'off') { try { if (!globalShortcut.register(key, () => overlay.toggle('hub', inst.id))) log.warn('Raccourci déjà pris :', key); } catch (e) { log.warn('raccourci', e.message); } }
};
let dpIv = null;
exports.stop = soft => {
  if (dpIv) { clearInterval(dpIv); dpIv = null; }
  if (watcher) { try { watcher.close(); } catch (e) {} watcher = null; }
  if (wWatch) { try { wWatch.close(); } catch (e) {} wWatch = null; }
  if (tWatch) { try { tWatch.close(); } catch (e) {} tWatch = null; }
  if (!soft) { try { require('./content').flushPending(); } catch (e) { log.warn('activation différée', e.message); } }
  if (key) { try { globalShortcut.unregister(key); } catch (e) {} key = ''; }
  if (!soft) { overlay.close(); cur = null; try { require('./hud').stop(); } catch (e) {} }
};
exports.current = () => cur;
exports.sessionStart = () => tStart;

/* Luminosité (« vision nocturne ») sans mod : avant 1.19 le jeu accepte une valeur de gamma > 1 écrite dans options.txt (1.8.9 compris).
   À partir de 1.19 le jeu rejette ces valeurs : c’est alors le mod client (Fabric 1.20.1) qui règle la luminosité. Non vérifié sur un vrai jeu. */
exports.applyGamma = (inst, dir) => {
  try {
    const mm = ((inst.client || {}).modules) || {};
    const m = /^1\.(\d+)/.exec(inst.version || ''), minor = m ? +m[1] : 99, set = {};
    if (mm.gamma && mm.gamma.on && minor < 19) set.gamma = Math.min(15, Math.max(1, +mm.gamma.level || 10)).toFixed(1);
    if (mm.togglesprint && mm.togglesprint.on && minor >= 15) set.toggleSprint = 'true'; // option native (depuis 1.15)
    if (!Object.keys(set).length) return;
    const f = path.join(dir, 'options.txt'); let t = ''; try { t = fs.readFileSync(f, 'utf8'); } catch (e) {}
    for (const [k, v] of Object.entries(set)) { const re = new RegExp('^' + k + ':.*$', 'm'); t = re.test(t) ? t.replace(re, k + ':' + v) : (t && !t.endsWith('\n') ? t + '\n' : t) + k + ':' + v + '\n'; }
    fs.writeFileSync(f, t);
  } catch (e) { log.warn('options.txt (bonus)', e.message); }
};
