/* Quel mod Hydarium pour quelle instance, et comment le fabriquer. Module PUR (aucun accès disque, réseau ni Electron) : utilisé par le launcher (src/main/modbuild.js)
   ET par le script de fabrication (scripts/build-mods.js, qui en reçoit une copie à côté de lui). Facile à tester : voir test/modplan.test.js.

   Principe : un mod par couple (famille, version de Minecraft). Famille « fabric » = Fabric (utilisé aussi, en silence, pour une instance Vanilla 1.14+) ; famille « forge » = Forge.
   Deux instances de la même version partagent le même mod : il n'est fabriqué qu'une fois.

   Pour chaque version on donne une LISTE ORDONNÉE de « plans » à essayer : le premier qui compile gagne.
   Les versions de Minecraft changent leurs noms internes d'une version à l'autre ; plutôt que de deviner laquelle compile, on essaie du plus complet au plus simple :
     full    → tout : état du jeu et HUD dessiné dans le jeu (Draw)
     core    → seulement l'essentiel (état du jeu, zoom, luminosité, sprint, marche auto) ; le HUD est alors dessiné par le launcher */
'use strict';

const parse = v => {
  let m = /^1\.(\d+)(?:\.(\d+))?$/.exec(String(v || '')); if (m) return { era: 'old', a: +m[1], b: +(m[2] || 0), c: 0 };
  m = /^(\d{2})\.(\d+)(?:\.(\d+))?$/.exec(String(v || '')); if (m) return { era: 'new', a: +m[1], b: +m[2], c: +(m[3] || 0) }; // nouveau schéma (26.1…)
  return null; // snapshot, pré-version, etc.
};
const cmp = (x, y) => { const p = parse(x), q = parse(y); if (!p || !q) return 0; if (p.era !== q.era) return p.era === 'new' ? 1 : -1; return p.a - q.a || p.b - q.b || p.c - q.c; };
exports.parse = parse; exports.cmp = cmp;

const fabricOk = v => { const p = parse(v); return !!p && (p.era === 'new' || p.a >= 14); }; // Fabric : 1.14 et plus, et le nouveau schéma 26.x
exports.fabricOk = fabricOk;

/** { ok, family, key, version, reason, needsForge } pour une instance { version, loader }. */
exports.describe = inst => {
  const version = inst && inst.version, loader = (inst && inst.loader) || 'vanilla';
  if (!parse(version)) return { ok: false, version, reason: 'Version de développement (snapshot) : pas de mod Hydarium, seul le HUD du launcher est utilisé.' };
  if (loader === 'forge') return { ok: true, family: 'forge', version, key: 'forge-' + version };
  if (loader === 'fabric' || loader === 'vanilla') {
    if (fabricOk(version)) return { ok: true, family: 'fabric', version, key: 'fabric-' + version };
    if (loader === 'vanilla' && version === '1.8.9') return { ok: false, version, needsForge: true, reason: '1.8.9 : demande Forge pour fonctionner.' };
    return { ok: false, version, reason: 'Fabric ne gère pas Minecraft ' + version + ' : pas de mod Hydarium, seul le HUD du launcher est utilisé.' };
  }
  return { ok: false, version, reason: 'Le loader « ' + loader + ' » n’est pas pris en charge par le mod Hydarium : seul le HUD du launcher est utilisé.' };
};

/* Ancien nom de fichier (jars livrés avec le launcher / construits par la CI) : s'il existe on le prend tel quel, sans rien fabriquer. */
exports.legacyJar = key => {
  const m = /^(fabric|forge)-(.+)$/.exec(key || ''); if (!m) return '';
  if (m[1] === 'forge') return m[2] === '1.8.9' ? 'hydarium-1.8.9.jar' : '';
  const p = parse(m[2]); if (!p) return '';
  if (p.era === 'new') return 'hydarium-latest.jar';
  if (m[2] === '1.20.1') return 'hydarium-1.20.1.jar';
  if (m[2] === '1.21' || m[2] === '1.21.1') return 'hydarium-1.21.1.jar';
  return '';
};
/* Empreinte des sources du mod pour (famille, version) : si elles changent (mise à jour du launcher), le mod est refabriqué ; sinon on le réutilise. Ne dépend que des adaptateurs concernés. */
exports.hashSources = (srcRoot, family, version) => {
  const fs = require('fs'), path = require('path'), h = require('crypto').createHash('sha1'), r = exports.plansFor(family, version), cm = path.join(srcRoot, 'client-mod');
  const ads = r.ok ? [...new Set(r.plans.flatMap(p => p.sources || [p.adapter]))] : [], dirs = [path.join(cm, 'core', 'src'), ...(family === 'fabric' ? [path.join(cm, 'fabric-common', 'src')] : []), ...ads.map(a => path.join(cm, a))];
  h.update('recettes:' + JSON.stringify(r));
  const walk = d => { let es; try { es = fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1); } catch (e) { return; } for (const e of es) { if (/^(build|\.gradle|run|node_modules)$/.test(e.name)) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { h.update(path.relative(cm, p).replace(/\\/g, '/')); h.update(fs.readFileSync(p)); } } };
  dirs.forEach(walk); return h.digest('hex');
};
/* Date (ms) du fichier source le plus récent du mod pour (famille, version) : sert à reconnaître un jar « livré » PÉRIMÉ (sans empreinte, il serait gardé pour toujours). Mêmes dossiers que hashSources. */
exports.newestSourceMtime = (srcRoot, family, version) => {
  const fs = require('fs'), path = require('path'), r = exports.plansFor(family, version), cm = path.join(srcRoot, 'client-mod');
  const ads = r.ok ? [...new Set(r.plans.flatMap(p => p.sources || [p.adapter]))] : [], dirs = [path.join(cm, 'core', 'src'), ...(family === 'fabric' ? [path.join(cm, 'fabric-common', 'src')] : []), ...ads.map(a => path.join(cm, a))];
  let newest = 0;
  const walk = d => { let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; } for (const e of es) { if (/^(build|\.gradle|run|node_modules)$/.test(e.name)) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { try { newest = Math.max(newest, fs.statSync(p).mtimeMs); } catch (x) {} } } };
  dirs.forEach(walk); return newest;
};
exports.jarName = key => 'hydarium-' + key + '.jar';

/* ===== Forge : versions générées par client-mod/forge-gen (un modèle, une ligne par version) =====
   Chaque ligne : famille (legacy = Forge ≤ 1.12.2 / modern = Forge 1.18 à 1.20.x, noms Mojang / forge26 = Forge 26.x, jeu non obfusqué), dossier-source, outils de fabrication (jdk, gradle, fg = ForgeGradle), version de Forge de SECOURS
   (la fabrication lit la « recommandée » chez Forge ; cette valeur ne sert que hors ligne), niveaux essayés dans l'ordre. experimental = jamais compilé même en théorie sur cette version précise.
   Ajouter une version PROCHE d'une ligne existante = ajouter une ligne. Une nouvelle époque (1.16.5, 1.18.2, 1.19.2…) demande d'écrire sa famille de règles dans client-mod/forge-gen/gen.js. */
const FORGE_GEN = {
  '1.12.2': { family: 'legacy', from: 'forge-189', jdk: 8, gradle: '4.9', fg: '2.3-SNAPSHOT', mappings: 'stable_39', forge: '14.23.5.2860', tiers: ['full'] },
  '1.20.1': { family: 'modern', from: 'fabric-120', jdk: 17, gradle: '8.1.1', fg: '6.0.+', loaderMajor: 47, pack: 15, forge: '47.3.0', tiers: ['full', 'core'] },
  '1.20.2': { family: 'modern', from: 'fabric-120', jdk: 17, gradle: '8.1.1', fg: '6.0.+', loaderMajor: 48, pack: 18, forge: '48.1.0', tiers: ['full', 'core'], experimental: true },
  '1.20.3': { family: 'modern', from: 'fabric-120', jdk: 17, gradle: '8.1.1', fg: '6.0.+', loaderMajor: 49, pack: 22, forge: '49.0.3', tiers: ['full', 'core'], experimental: true },
  '1.20.4': { family: 'modern', from: 'fabric-120', jdk: 17, gradle: '8.1.1', fg: '6.0.+', loaderMajor: 49, pack: 22, forge: '49.0.30', tiers: ['full', 'core'], experimental: true },
  // 26.x : jeu non obfusqué, Java 25, ForgeGradle 7, EventBus 7. 26.3 : d'après le MDK officiel (forge 26.3-66.1.2). 26.2 : même famille, jamais vue (Forge 65.1.0 d'après un rapport public).
  '26.2': { family: 'forge26', from: 'fabric-latest', jdk: 25, gradle: '9.7.1', fg: '[7.0.17,8)', loaderMajor: 65, forge: '65.1.0', tiers: ['core'], experimental: true },
  '26.3': { family: 'forge26', from: 'fabric-latest', jdk: 25, gradle: '9.7.1', fg: '[7.0.17,8)', loaderMajor: 66, pack: 121, forge: '66.1.2', tiers: ['core'] }
};
exports.FORGE_GEN = FORGE_GEN;
/** Versions de Minecraft avec un mod Forge (1.8.9 : écrit à la main ; les autres : générées). */
exports.forgeVersions = () => ['1.8.9', ...Object.keys(FORGE_GEN)];

const TIERS = ['full', 'core'];
const mk = (adapter, tier, env) => ({ id: adapter + '/' + tier, adapter, tier, draw: tier !== 'core' && adapter !== 'fabric-latest', ...env });

/** { ok, plans: [...] } ou { ok: false, reason }. Un plan : { id, adapter, tier, draw, jdk, gradle, loom, release, plugin }. */
exports.plansFor = (family, version) => {
  const p = parse(version); if (!p) return { ok: false, reason: 'Version inconnue : ' + version };
  if (family === 'forge') {
    if (version === '1.8.9') return { ok: true, plans: [{ id: 'forge-189/full', adapter: 'forge-189', tier: 'full', draw: true, jdk: 8, gradle: '2.14.1', static: true }] };
    const t = FORGE_GEN[version];
    if (t) return { ok: true, plans: t.tiers.map(tier => ({ id: 'forge-' + version + '/' + tier, adapter: 'forge-gen:' + t.family, tier, draw: tier === 'full', jdk: t.jdk, gradle: t.gradle, generated: true, experimental: !!t.experimental,
      sources: ['forge-gen', ...(t.family !== 'legacy' ? ['fabric-common', t.from] : [t.from])] })) };
    return { ok: false, reason: 'Forge ' + version + ' : pas encore pris en charge par le mod Hydarium (pris en charge : ' + exports.forgeVersions().join(', ') + ') ; seul le HUD du launcher est utilisé.' };
  }
  if (family !== 'fabric') return { ok: false, reason: 'Loader inconnu : ' + family };
  if (!fabricOk(version)) return { ok: false, reason: 'Fabric ne gère pas Minecraft ' + version };
  if (p.era === 'new') return { ok: true, plans: [mk('fabric-latest', 'core', { jdk: 25, gradle: 'current', loom: 'latest', release: 25, plugin: 'net.fabricmc.fabric-loom', unobfuscated: true })] };
  if (cmp(version, '1.19.3') < 0) return { ok: false, reason: 'Le mod Hydarium demande Minecraft 1.19.3 ou plus récent (Fabric) ; avant, seul le HUD du launcher est utilisé.' };
  let env, order;
  if (cmp(version, '1.20') < 0) { env = { jdk: 17, gradle: '8.8', loom: '1.6-SNAPSHOT', release: 17 }; order = [['fabric-120', ['core']]]; }                                  // 1.19.3 – 1.19.4 : pas de GuiGraphics → l'essentiel seulement
  else if (cmp(version, '1.20.5') < 0) { env = { jdk: 17, gradle: '8.8', loom: '1.6-SNAPSHOT', release: 17 }; order = [['fabric-120', TIERS]]; }                      // 1.20 – 1.20.4
  else if (cmp(version, '1.21.2') < 0) { env = { jdk: 21, gradle: '8.8', loom: '1.7-SNAPSHOT', release: 21 }; order = [['fabric-121', TIERS], ['fabric-120', ['core']]]; } // 1.20.5 – 1.21.1
  else { env = { jdk: 21, gradle: 'current', loom: 'latest', release: 21 }; order = [['fabric-121', TIERS], ['fabric-120', ['core']]]; }                                // 1.21.2 et plus (encore obfusqué)
  const plans = []; for (const [adapter, tiers] of order) for (const t of tiers) plans.push(mk(adapter, t, { ...env, plugin: 'fabric-loom' }));
  return { ok: true, plans };
};

/** Raisons lisibles : « missing » (pas encore fabriqué), etc. — utilisées par l'interface. */
exports.STATE_TEXT = {
  ok: 'Chargé automatiquement au lancement.',
  building: 'Création du mod Hydarium pour cette version… (en arrière-plan, quelques minutes la première fois)',
  missing: 'Pas encore construit pour cette version : il sera créé automatiquement.',
  failed: 'La création du mod pour cette version a échoué : le jeu démarre sans lui (seul le HUD du launcher est utilisé).',
  disabled: 'Désactivé : le jeu démarre sans le client (pas de HUD, zoom…).',
  forge189: '1.8.9 : demande Forge pour fonctionner.',
  unsupported: 'Pas de mod Hydarium pour cette version de Minecraft ni ce loader : seul le HUD du launcher est utilisé.'
};
