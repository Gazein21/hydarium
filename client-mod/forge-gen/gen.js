/* Générateur de mods Hydarium pour Forge : UN modèle, plusieurs versions.

   Principe : on ne réécrit pas le mod pour chaque version de Forge. On part des sources qui existent déjà et on les TRANSFORME par des règles :
     • famille « legacy »  (Forge 1.8.9 → 1.12.2, LWJGL 2, noms MCP) : source = forge-189/HydariumForge.java, règles de renommage 1.8.9 → 1.12.2.
     • famille « modern »  (Forge 1.18+ : noms Mojang, LWJGL 3)       : source = le code Fabric 1.20.1 (fabric-common + fabric-120), dont on retire tout ce qui est Fabric
       (point d'entrée, évènements, Mixin) pour le remplacer par l'équivalent Forge.
   • famille « forge26 » (Forge 26.x, jeu non obfusqué, Java 25) : d'après le MDK officiel 26.3 ; source = cœur Fabric 26 (fabric-latest).
   Chaque version = une ligne de la table FORGE_GEN de src/main/modplan.js (version de Forge, outils de fabrication, métadonnées). Ajouter une version proche = ajouter une ligne.
   Ajouter une nouvelle ÉPOQUE (ex. 1.16.5 : PoseStack au lieu de GuiGraphics) = écrire une famille de règles ici.

   Module sans réseau : tout ce qui vient d'Internet (version exacte de Forge) est donné par l'appelant (scripts/build-mods.js).
   Si une source change de forme, une règle ne trouve plus son ancre et le générateur ÉCHOUE avec un message clair (test/forgegen.test.js le détecte), au lieu de produire un mod faux. */
'use strict';
const fs = require('fs'), path = require('path');

/* ---------- outils de transformation ---------- */
const occurrences = (s, f) => typeof f === 'string' ? s.split(f).length - 1 : (s.match(new RegExp(f.source, f.flags.includes('g') ? f.flags : f.flags + 'g')) || []).length;
/** rules : [nom, ancre (texte ou RegExp), remplacement, minimum d'occurrences (1 par défaut)]. */
function apply(src, rules, who) {
  for (const [name, find, to, min] of rules) {
    const n = occurrences(src, find);
    if (n < (min || 1)) throw new Error(`forge-gen (${who}) : la règle « ${name} » ne trouve pas son ancre (${n} occurrence(s), ${min || 1} attendue(s)) : la source a changé de forme, adapter la règle.`);
    src = typeof find === 'string' ? src.split(find).join(to) : src.replace(new RegExp(find.source, find.flags.includes('g') ? find.flags : find.flags + 'g'), () => to);
  }
  return src;
}
/** Remplace tout ce qui est entre `from` (inclus) et `until` (exclu). */
function region(src, from, until, text, who) {
  const a = src.indexOf(from); if (a < 0) throw new Error(`forge-gen (${who}) : début de zone introuvable : ${from.slice(0, 50)}`);
  const b = src.indexOf(until, a + from.length); if (b < 0) throw new Error(`forge-gen (${who}) : fin de zone introuvable : ${until.slice(0, 50)}`);
  return src.slice(0, a) + text + src.slice(b);
}
const copyTree = (from, to, skip) => { if (!fs.existsSync(from)) return; fs.mkdirSync(to, { recursive: true }); for (const e of fs.readdirSync(from, { withFileTypes: true })) { if (skip && skip(e.name)) continue; const a = path.join(from, e.name), b = path.join(to, e.name); e.isDirectory() ? copyTree(a, b, skip) : fs.copyFileSync(a, b); } };
const read = p => fs.readFileSync(p, 'utf8'), write = (p, t) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t); };
const GEN = 'GÉNÉRÉ par client-mod/forge-gen : ne pas modifier dans le projet fabriqué, modifier la source ou la règle.';

/* ---------- famille « legacy » : Forge 1.8.9 → 1.12.2 ---------- */
/* Différences réelles entre l'API 1.8.9 et l'API 1.12.2 pour ce que fait le mod (noms MCP « stable_39 ») :
   joueur / monde / police renommés, inventaire d'armure en liste (et plus de null), réseau, message de la barre, molette, type d'évènement, effets de potion,
   utilisation d'objet, dimension. Le bus FML séparé n'existe plus (tout passe par MinecraftForge.EVENT_BUS). */
const LEGACY_12 = V => [
  ['version acceptée + mod client seulement', 'clientSideOnly = true, acceptedMinecraftVersions = "[1.8.9]"', `clientSideOnly = true, acceptableRemoteVersions = "*", acceptedMinecraftVersions = "[${V}]"`],
  ['en-tête', /Client Hydarium pour Minecraft 1\.8\.9 \(Forge [\d.]+\)\./, `Client Hydarium pour Minecraft ${V} (Forge). ${GEN}`],
  ['import supprimé (ChatComponentText)', /^import net\.minecraft\.util\.ChatComponentText;\n/m, ''],
  ['bus FML séparé', /^[ \t]*FMLCommonHandler\.instance\(\)\.bus\(\)\.register\(this\);\n/m, ''],
  ['joueur', '.thePlayer', '.player', 3],
  ['monde', '.theWorld', '.world', 2],
  ['police', '.fontRendererObj', '.fontRenderer', 2],
  ['dimension', '.getDimensionId()', '.getDimension()'],
  ['armure (liste)', 'armorInventory[3 - k]', 'armorInventory.get(3 - k)', 2],
  ['armure vide (état)', 'if (it == null) { s.armor[k] = null; continue; }', 'if (it.isEmpty()) { s.armor[k] = null; continue; }'],
  ['armure vide (dessin)', 'if (it != null) out.add(it);', 'if (!it.isEmpty()) out.add(it);'],
  ['réseau', '.getNetHandler()', '.getConnection()', 2],
  ['message de la barre', '.ingameGUI.setRecordPlaying(', '.ingameGUI.setOverlayMessage(', 3],
  ['utilisation d\'objet', 'p.isUsingItem()', 'p.isHandActive()'],
  ['molette (lecture)', 'e.dwheel', 'e.getDwheel()', 2],
  ['type d\'évènement de rendu', 'e.type != RenderGameOverlayEvent.ElementType.ALL', 'e.getType() != RenderGameOverlayEvent.ElementType.ALL'],
  ['effet de potion', 'Potion.potionTypes[e.getPotionID()]', 'e.getPotion()']
];
/** Noms de la 1.8.9 qui ne doivent PLUS apparaître dans une source générée pour 1.12.2 (garde-fou du test). */
exports.LEGACY_12_BANNED = [/\.thePlayer\b/, /\.theWorld\b/, /\.fontRendererObj\b/, /getDimensionId/, /setRecordPlaying/, /getNetHandler/, /isUsingItem/, /\.dwheel\b/, /potionTypes/, /ChatComponentText/, /\.bus\(\)/, /armorInventory\[/];

function legacyProject(V, t, o) {
  const cm = o.cm, src = path.join(o.dir, 'src', 'main', 'java'), res = path.join(o.dir, 'src', 'main', 'resources'), from = path.join(cm, t.from);
  copyTree(path.join(cm, 'core', 'src'), src);
  let j = read(path.join(from, 'src', 'main', 'java', 'net', 'hydarium', 'client', 'HydariumForge.java'));
  j = apply(j, LEGACY_12(V), 'legacy ' + V);
  write(path.join(src, 'net', 'hydarium', 'client', 'HydariumForge.java'), j);
  const info = read(path.join(from, 'src', 'main', 'resources', 'mcmod.info')).replace(/pour 1\.8\.9/, 'pour ' + V).replace('${version}', o.version).replace('${mcversion}', V);
  write(path.join(res, 'mcmod.info'), info); copyTree(path.join(from, 'src', 'main', 'resources'), res, n => n === 'mcmod.info');
  const jar = `hydarium-forge-${V}.jar`;
  write(path.join(o.dir, 'build.gradle'), `// ${GEN}
buildscript {
  repositories { mavenCentral(); maven { name = 'forge'; url = 'https://maven.minecraftforge.net/' }; maven { url 'https://plugins.gradle.org/m2/' }; jcenter() }
  dependencies { classpath 'net.minecraftforge.gradle:ForgeGradle:${t.fg}' }
}
apply plugin: 'net.minecraftforge.gradle.forge'
version = '${o.version}'
group = 'net.hydarium'
archivesBaseName = 'hydarium-forge-${V}'
sourceCompatibility = targetCompatibility = '1.8'
minecraft { version = '${V}-${o.forge}'; runDir = 'run'; mappings = '${t.mappings}' }
jar { archiveName = '${jar}' }
`);
  write(path.join(o.dir, 'gradle.properties'), 'org.gradle.jvmargs=-Xmx1G\n');
  write(path.join(o.dir, 'settings.gradle'), `rootProject.name = 'hydarium-forge-${V}'\n`);
  return jar;
}

/* ---------- famille « modern » : Forge 1.18+ (noms Mojang), à partir du code Fabric ---------- */
/* Ce qui est Fabric dans le code commun : l'interface ClientModInitializer, les 2 enregistrements d'évènements, les 3 imports. Tout le reste (état du jeu, zoom, marche auto,
   sprint, pont) est écrit avec les noms Mojang, que Forge utilise aussi : il est conservé tel quel.
   Trois helpers par RÉFLEXION (fps, message, ping) sont remplacés par des appels directs : en production Forge, les méthodes ont des noms SRG (m_xxxxx_), la réflexion par nom Mojang échouerait en silence. */
const MODERN_CLIENT = [
  ['imports Fabric', /^import net\.fabricmc\.[^\n]*\n/m, '', 3],
  ['interface Fabric', 'public class HydariumClient implements ClientModInitializer {', 'public class HydariumClient {'],
  ['point d\'entrée', '    @Override\n    public void onInitializeClient() {', '    /** Appelé une fois par le point d\'entrée du loader (Forge : ClientSetup). */\n    public static void init() {'],
  ['évènement de tick (Fabric)', /^[ \t]*ClientTickEvents\.END_CLIENT_TICK\.register\([^\n]*\n/m, ''],
  ['évènement d\'arrêt (Fabric)', /^[ \t]*ClientLifecycleEvents\.CLIENT_STOPPING[^\n]*\n/m, ''],
  ['onTick visible', 'private static void onTick(Minecraft mc) {', 'static void onTick(Minecraft mc) {'],
  ['en-tête', /^package net\.hydarium\.client;\n/m, `package net.hydarium.client;\n\n// ${GEN}`]
];
const MODERN_HELPERS = `    /** FPS : compteur d'images, appelé à chaque image par le loader (sans réflexion : les noms des méthodes du jeu sont ceux de SRG en production). */
    private static long fpsAt = 0; private static int fpsFrames = 0, fpsLast = 0;
    static void frame() { long n = System.currentTimeMillis(); fpsFrames++; if (fpsAt == 0) fpsAt = n; if (n - fpsAt >= 1000) { fpsLast = Math.round(fpsFrames * 1000f / (n - fpsAt)); fpsFrames = 0; fpsAt = n; } }
    static int fps(Minecraft mc) { return fpsLast; }

    /** Message sur la barre d'action (appel direct). */
    static void say(Player p, String text) {
        try { p.displayClientMessage(net.minecraft.network.chat.Component.literal(text), true); } catch (Throwable ignored) { }
    }

    /** Latence (ms) : connexion → infos du joueur → latence. -1 si inconnue (solo). */
    static int ping(Minecraft mc, Player p) {
        try { net.minecraft.client.multiplayer.ClientPacketListener c = mc.getConnection(); if (c == null) return -1;
              net.minecraft.client.multiplayer.PlayerInfo i = c.getPlayerInfo(p.getUUID()); return i == null ? -1 : i.getLatency(); } catch (Throwable t) { return -1; }
    }

`;
/* Compat : Mixin n'est pas disponible sur Forge sans configuration supplémentaire. Valeur brute de l'option (champ de vision) : le SEUL champ modifiable de type Object de OptionInstance est « value »
   (les autres sont final) : on le trouve par son type, donc quel que soit le nom (SRG en production). Caméra cinématique : le champ ne se retrouve pas par son type → non prise en charge sur Forge (le zoom marche quand même). */
const MODERN_SETRAW = `    /** Écrit directement la valeur d'une option (champ de vision) sans passer par la validation du jeu, qui refuse tout ce qui sort du curseur.
        Pas de Mixin sur Forge : le champ « value » de OptionInstance est le seul champ modifiable de type Object (donc trouvé sans son nom, qui est SRG en production). */
    private static java.lang.reflect.Field optValue;
    static void setRaw(Object option, Object value) {
        try {
            if (optValue == null) for (java.lang.reflect.Field f : net.minecraft.client.OptionInstance.class.getDeclaredFields()) {
                int m = f.getModifiers();
                if (f.getType() == Object.class && !java.lang.reflect.Modifier.isStatic(m) && !java.lang.reflect.Modifier.isFinal(m)) { f.setAccessible(true); optValue = f; break; }
            }
            if (optValue != null) optValue.set(option, value);
        } catch (Throwable t) { /* champ introuvable : l'option garde sa valeur (le zoom ne fait alors rien, sans planter) */ }
    }

`;
const MODERN_SMOOTH = `    /** Caméra cinématique : non prise en charge sur Forge (champ d'options introuvable sans son nom SRG et sans Mixin). Sans effet : le zoom marche quand même. */
    static boolean getSmooth(Minecraft mc) { return false; }

    static void setSmooth(Minecraft mc, boolean on) { }

`;
const MODERN_DRAW = [
  ['imports Fabric', /^import net\.fabricmc\.[^\n]*\n/m, '', 2],
  ['enregistrement', 'HudRenderCallback.EVENT.register(Draw::render);', 'net.minecraftforge.common.MinecraftForge.EVENT_BUS.addListener(Draw::onOverlay);'],
  ['évènement de rendu', '    private static void render(GuiGraphics g, float delta) {',
    '    /** Une seule fois par image : après la barre d\'objets (le même évènement revient pour chaque couche du HUD). */\n    private static void onOverlay(net.minecraftforge.client.event.RenderGuiOverlayEvent.Post e) {\n        if (e.getOverlay() != net.minecraftforge.client.gui.overlay.VanillaGuiOverlay.HOTBAR.type()) return;\n        render(e.getGuiGraphics(), e.getPartialTick());\n    }\n\n    private static void render(GuiGraphics g, float delta) {'],
  ['en-tête', /^package net\.hydarium\.client;\n/m, `package net.hydarium.client;\n\n// ${GEN}`]
];
/** Ce qui ne doit PLUS apparaître dans une source Forge moderne (garde-fou du test). */
exports.MODERN_BANNED = [/net\.fabricmc/, /ClientModInitializer/, /OptionInstanceAccessor/, /OptionsAccessor/, /hyd\$/, /HudRenderCallback/, /ClientTickEvents/, /ClientLifecycleEvents/, /Class\.forName\("net\.minecraft/];

function modernProject(V, t, o) {
  const cm = o.cm, src = path.join(o.dir, 'src', 'main', 'java'), res = path.join(o.dir, 'src', 'main', 'resources'), pk = path.join(src, 'net', 'hydarium', 'client'), from = path.join(cm, t.from, 'src', 'main', 'java', 'net', 'hydarium', 'client');
  copyTree(path.join(cm, 'core', 'src'), src);
  // 1) cœur commun, sans Fabric
  let c = read(path.join(cm, 'fabric-common', 'src', 'net', 'hydarium', 'client', 'HydariumClient.java'));
  c = apply(c, MODERN_CLIENT, 'HydariumClient ' + V);
  c = region(c, '    /** FPS :', '    static String label(', MODERN_HELPERS, 'HydariumClient ' + V);
  write(path.join(pk, 'HydariumClient.java'), c);
  // 2) Compat : on garde tout (GLFW, molette, nuit, plein écran) sauf ce qui passe par Mixin
  let k = read(path.join(from, 'Compat.java'));
  k = region(k, '    /** Écrit directement la valeur d\'une option', '    /** Durée de l\'effet posé par le mod', MODERN_SETRAW, 'Compat ' + V);
  k = region(k, '    /** Caméra cinématique du jeu', '    private static long scrollHookedFor;', MODERN_SMOOTH, 'Compat ' + V);
  k = apply(k, [['en-tête', /^package net\.hydarium\.client;\n/m, `package net.hydarium.client;\n\n// ${GEN}`]], 'Compat ' + V);
  write(path.join(pk, 'Compat.java'), k);
  copyTree(from, pk, n => /^(Compat|Draw)\.java$/.test(n) || n === 'mixin'); // GlfwKeys : tel quel ; Draw : seulement au niveau « full » ; le dossier mixin (Fabric) est exclu
  // 3) dessin du HUD dans le jeu (niveau « full ») ; au niveau « core » le launcher dessine le HUD
  if (o.tier !== 'core') write(path.join(pk, 'Draw.java'), apply(read(path.join(from, 'Draw.java')), MODERN_DRAW, 'Draw ' + V));
  // 4) point d'entrée Forge
  for (const n of ['HydariumForgeMod.java', 'ClientSetup.java']) write(path.join(pk, n), read(path.join(__dirname, 'templates', n)));
  // 5) métadonnées et construction
  write(path.join(res, 'META-INF', 'mods.toml'), `# ${GEN}
modLoader = "javafml"
loaderVersion = "[${t.loaderMajor},)"
license = "All-Rights-Reserved"

[[mods]]
modId = "hydarium"
version = "${o.version}"
displayName = "Hydarium"
logoFile = "icon.png"
authors = "Hydarium"
description = '''Le mode Hydarium : HUD (FPS, CPS, touches, coordonnées, armure, effets…), luminosité, zoom, sprint automatique, marche automatique. Se règle depuis le launcher.'''

[[dependencies.hydarium]]
modId = "forge"
mandatory = true
versionRange = "[${t.loaderMajor},)"
ordering = "NONE"
side = "CLIENT"

[[dependencies.hydarium]]
modId = "minecraft"
mandatory = true
versionRange = "[${V}]"
ordering = "NONE"
side = "CLIENT"
`);
  write(path.join(res, 'pack.mcmeta'), JSON.stringify({ pack: { description: 'Hydarium', pack_format: t.pack } }, null, 2));
  const icon = path.join(cm, 'fabric-latest', 'src', 'main', 'resources', 'assets', 'hydarium', 'icon.png'); if (fs.existsSync(icon)) fs.copyFileSync(icon, path.join(res, 'icon.png'));
  const jar = `hydarium-forge-${V}.jar`;
  write(path.join(o.dir, 'build.gradle'), `// ${GEN}
buildscript {
  repositories { maven { url = 'https://maven.minecraftforge.net' }; mavenCentral() }
  dependencies { classpath group: 'net.minecraftforge.gradle', name: 'ForgeGradle', version: '${t.fg}', changing: true }
}
apply plugin: 'java'
apply plugin: 'net.minecraftforge.gradle'
version = '${o.version}'
group = 'net.hydarium'
base { archivesName = 'hydarium-forge-${V}' }
repositories { mavenCentral() }
minecraft { mappings channel: 'official', version: '${V}' }
dependencies { minecraft 'net.minecraftforge:forge:${V}-${o.forge}' }
java { sourceCompatibility = JavaVersion.VERSION_${t.jdk}; targetCompatibility = JavaVersion.VERSION_${t.jdk} }
tasks.withType(JavaCompile).configureEach { it.options.release = ${t.jdk}; it.options.encoding = 'UTF-8' }
jar { archiveFileName = '${jar}' }
jar.finalizedBy('reobfJar')
`);
  write(path.join(o.dir, 'gradle.properties'), 'org.gradle.jvmargs=-Xmx3G\n');
  write(path.join(o.dir, 'settings.gradle'), `rootProject.name = 'hydarium-forge-${V}'\n`);
  return jar;
}

/* ---------- famille « forge26 » : Forge 26.x (jeu NON obfusqué, Java 25, ForgeGradle 7, EventBus 7) ----------
   Écrite d'après le MDK officiel de Forge 26.3 (forge-26.3-66.1.2-mdk) : build.gradle, settings.gradle, mods.toml, pack.mcmeta et point d'entrée en reprennent les lignes.
   Source : le même cœur que Fabric 26 (fabric-common + fabric-latest). Compat de fabric-latest est entièrement par réflexion et sans Fabric : il est repris TEL QUEL ;
   les noms du jeu étant ceux de l'exécution, les helpers par réflexion de HydariumClient (fps, message, ping) restent valables : on ne les remplace pas.
   Un seul niveau : « core » (le launcher dessine le HUD, comme côté Fabric 26). */
exports.FORGE26_BANNED = [/net\.fabricmc/, /ClientModInitializer/, /OptionInstanceAccessor/, /OptionsAccessor/, /hyd\$/, /HudRenderCallback/, /ClientTickEvents/, /ClientLifecycleEvents/, /MinecraftForge\.EVENT_BUS/, /net\.minecraftforge\.event\.TickEvent/];

function forge26Project(V, t, o) {
  const cm = o.cm, src = path.join(o.dir, 'src', 'main', 'java'), res = path.join(o.dir, 'src', 'main', 'resources'), pk = path.join(src, 'net', 'hydarium', 'client'), from = path.join(cm, t.from, 'src', 'main', 'java', 'net', 'hydarium', 'client');
  copyTree(path.join(cm, 'core', 'src'), src);
  write(path.join(pk, 'HydariumClient.java'), apply(read(path.join(cm, 'fabric-common', 'src', 'net', 'hydarium', 'client', 'HydariumClient.java')), MODERN_CLIENT, 'HydariumClient ' + V));
  write(path.join(pk, 'Compat.java'), apply(read(path.join(from, 'Compat.java')), [['en-tête', /^package net\.hydarium\.client;\n/m, `package net.hydarium.client;\n\n// ${GEN}`]], 'Compat ' + V));
  copyTree(from, pk, n => n === 'Compat.java' || n === 'Draw.java' || n === 'mixin'); // fichiers annexes éventuels (Draw : pas au niveau « core »)
  for (const n of ['HydariumForgeMod.java', 'ClientSetup.java']) write(path.join(pk, n), read(path.join(__dirname, 'templates', 'forge26', n)));
  write(path.join(res, 'META-INF', 'mods.toml'), `# ${GEN}
modLoader="javafml"
loaderVersion="[${t.loaderMajor},)"
license="All Rights Reserved"
clientSideOnly=true

[[mods]]
modId="hydarium"
version="${o.version}"
displayName="Hydarium"
authors="Hydarium"
description='''Le mode Hydarium : zoom, luminosité, sprint automatique, marche automatique. Le HUD est dessiné par le launcher.'''

[[dependencies.hydarium]]
    modId="forge"
    mandatory=true
    versionRange="[${t.loaderMajor},)"
    ordering="NONE"
    side="CLIENT"

[[dependencies.hydarium]]
    modId="minecraft"
    mandatory=true
    versionRange="[${V},)"
    ordering="NONE"
    side="CLIENT"
`);
  if (t.pack) write(path.join(res, 'pack.mcmeta'), JSON.stringify({ pack: { description: 'Hydarium', max_format: t.pack, min_format: t.pack } }, null, 2));
  const jar = `hydarium-forge-${V}.jar`;
  write(path.join(o.dir, 'build.gradle'), `// ${GEN}
plugins {
    id 'java'
    id 'net.minecraftforge.gradle' version '${t.fg}'
}

version = '${o.version}'
group = 'net.hydarium'
base { archivesName = 'hydarium-forge-${V}' }

// Mojang livre Java 25 aux joueurs depuis la 26.1 : le mod cible Java 25 (comme le MDK).
java.toolchain.languageVersion = JavaLanguageVersion.of(${t.jdk})

minecraft {
    runs {
        configureEach { workingDir = layout.projectDirectory.dir('run') }
        register('client')
    }
}

repositories {
    minecraft.mavenizer(it)
    maven fg.forgeMaven
    maven fg.minecraftLibsMaven
    mavenCentral()
}

dependencies {
    implementation minecraft.dependency('net.minecraftforge:forge:${V}-${o.forge}')
    annotationProcessor 'net.minecraftforge:eventbus-validator:7.0.6'
}

tasks.withType(JavaCompile).configureEach { options.encoding = 'UTF-8' }
jar { archiveFileName = '${jar}' }
`);
  write(path.join(o.dir, 'gradle.properties'), 'org.gradle.jvmargs=-Xmx3G\nnet.minecraftforge.gradle.merge-source-sets=true\n');
  write(path.join(o.dir, 'settings.gradle'), `plugins {\n    id 'org.gradle.toolchains.foojay-resolver-convention' version '1.0.0'\n}\n\nrootProject.name = 'hydarium-forge-${V}'\n`);
  return jar;
}

/** Écrit le projet Gradle de (version V, cible t = ligne de FORGE_GEN) dans o.dir (effacé d'abord).
    o : { cm: dossier client-mod, dir, tier: 'full' | 'core', forge: version exacte de Forge, version: version du mod }. Renvoie le nom du jar que Gradle produira. */
exports.generate = function generate(V, t, o) {
  if (!t) throw new Error('forge-gen : version sans cible : ' + V);
  o = { version: '1.1.0', tier: 'full', ...o }; if (!o.forge) throw new Error('forge-gen : version de Forge manquante');
  fs.rmSync(o.dir, { recursive: true, force: true }); fs.mkdirSync(o.dir, { recursive: true });
  if (t.family === 'legacy') return legacyProject(V, t, o);
  if (t.family === 'modern') return modernProject(V, t, o);
  if (t.family === 'forge26') return forge26Project(V, t, o);
  throw new Error('forge-gen : famille inconnue : ' + t.family);
};
