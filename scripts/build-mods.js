/* Construit les mods Hydarium (1.20.1, versions récentes, 1.8.9) sur ta machine : télécharge tout seul ce qu'il faut
   (JDK 8 / 17 / 25 de Temurin et Gradle, dans .build-tools/), puis copie les jars dans build-client/.
   Usage : node scripts/build-mods.js [--if-missing] [--json] [fabric-120] [fabric-121] [fabric-latest] [forge-189]
   Chaque mod est indépendant : si l'un échoue, les autres sont quand même construits et le launcher fonctionne (il utilise alors son HUD externe).
   Utilisable aussi comme module : buildMods({ only, ifMissing, report }) (voir scripts/build.js) ; « report » reçoit step / detail / progress / log / warn.
   --json : écrit des lignes « @@HYD {"p":0..1,"t":"texte"} » que le launcher lit pour afficher une progression. */
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const { download, extract, fmtMB, vcmp, explain } = require('./util');
/* HYD_SRC / HYD_TOOLS / HYD_OUT : quand le launcher lui-même fabrique un mod (installation chez la personne), les sources sont dans ses ressources et les outils / jars vont dans son dossier de données. */
const root = process.env.HYD_SRC || path.join(__dirname, '..'), tools = process.env.HYD_TOOLS || path.join(root, '.build-tools'), out = process.env.HYD_OUT || path.join(root, 'build-client');
const PLAN = (() => { for (const p of [path.join(__dirname, 'modplan.js'), path.join(root, 'src', 'main', 'modplan.js')]) if (fs.existsSync(p)) return require(p); throw new Error('modplan.js introuvable'); })();
const WIN = process.platform === 'win32', OS = WIN ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux', ARCH = process.arch === 'arm64' ? 'aarch64' : 'x64';

async function get(url, opt) { const r = await fetch(url, { redirect: 'follow', ...opt }); if (!r.ok) throw new Error(url + ' → HTTP ' + r.status); return r; }
const findDir = (base, test) => { for (const d of fs.readdirSync(base)) { const p = path.join(base, d); if (fs.statSync(p).isDirectory()) { if (test(p)) return p; const q = process.platform === 'darwin' ? path.join(p, 'Contents', 'Home') : ''; if (q && test(q)) return q; } } return ''; };

const MODS = {
  // Loom 1.6 exige Gradle 8.6 au minimum (8.5 faisait échouer la construction) ; si un outil demande plus, on monte automatiquement (voir buildOne).
  'fabric-120': { title: 'Minecraft 1.20.1 (Fabric)', jar: 'hydarium-1.20.1.jar', jdk: 17, gradle: '8.8' },
  'fabric-121': { title: 'Minecraft 1.21 – 1.21.1 (Fabric)', jar: 'hydarium-1.21.1.jar', jdk: 21, gradle: '8.8' },
  'fabric-latest': { title: 'Dernières versions de Minecraft (Fabric)', jar: 'hydarium-latest.jar', jdk: 25, gradle: 'current', prepare: prepLatest },
  'forge-189': { title: 'Minecraft 1.8.9 (Forge)', jar: 'hydarium-1.8.9.jar', jdk: 8, gradle: '2.14.1' }
};

async function jdk(major, rep, span) {
  const dest = path.join(tools, 'jdk' + major), ok = () => fs.existsSync(dest) && findDir(dest, p => fs.existsSync(path.join(p, 'bin', WIN ? 'javac.exe' : 'javac')));
  if (!ok()) {
    const arch = path.join(tools, `jdk${major}.${WIN ? 'zip' : 'tar.gz'}`);
    rep.detail(`Téléchargement de Java ${major} (outil de fabrication, une seule fois)…`);
    await download(`https://api.adoptium.net/v3/binary/latest/${major}/ga/${OS}/${ARCH}/jdk/hotspot/normal/eclipse`, arch, (g, t) => { if (t) { rep.progress(span[0] + (span[1] - span[0]) * .85 * g / t); rep.detail(`Téléchargement de Java ${major} : ${fmtMB(g)} sur ${fmtMB(t)}`); } else rep.detail(`Téléchargement de Java ${major} : ${fmtMB(g)}`); });
    rep.detail(`Installation de Java ${major}…`); rep.progress(span[0] + (span[1] - span[0]) * .9); extract(arch, dest); fs.rmSync(arch, { force: true });
  }
  return findDir(dest, p => fs.existsSync(path.join(p, 'bin', WIN ? 'javac.exe' : 'javac')));
}
async function gradle(version, rep, span) {
  if (version === 'current') version = (await (await get('https://services.gradle.org/versions/current')).json()).version;
  const dest = path.join(tools, 'gradle-' + version), bin = () => path.join(dest, 'gradle-' + version, 'bin', WIN ? 'gradle.bat' : 'gradle');
  if (!fs.existsSync(bin())) {
    const z = path.join(tools, `gradle-${version}-bin.zip`);
    rep.detail(`Téléchargement de Gradle ${version} (outil de fabrication, une seule fois)…`);
    await download(`https://services.gradle.org/distributions/gradle-${version}-bin.zip`, z, (g, t) => { if (t) { rep.progress(span[0] + (span[1] - span[0]) * .85 * g / t); rep.detail(`Téléchargement de Gradle ${version} : ${fmtMB(g)} sur ${fmtMB(t)}`); } });
    rep.detail(`Installation de Gradle ${version}…`); extract(z, dest); fs.rmSync(z, { force: true }); if (!WIN) fs.chmodSync(bin(), 0o755);
  }
  return { bin: bin(), version };
}

/* « > Task :compileJava » → texte lisible ; le but est que la personne voie que ça avance, pas de lui montrer Gradle. */
const TASKS = [[/compileJava/i, 'Compilation du code du mod…'], [/processResources/i, 'Ajout des ressources du mod…'], [/remapJar|^:?jar$/i, 'Assemblage du fichier du mod…'], [/assets|downloadClient|minecraft/i, 'Téléchargement des fichiers de Minecraft (long la première fois)…'], [/decompile|genSources|mapping|merge|intermediary/i, 'Préparation de Minecraft pour le mod (long la première fois)…'], [/^:?build$|assemble|check/i, 'Finalisation…']];
function gradleLine(l, st, rep, span) {
  let m = /^> (?:Task|Configure project) ?:?(\S*)/.exec(l); if (/^> Configure project/.test(l)) { rep.detail('Préparation du projet…'); return; }
  if (m) { st.tasks++; const t = TASKS.find(([re]) => re.test(m[1])); if (t) rep.detail(t[1]); rep.progress(span[0] + (span[1] - span[0]) * (st.tasks / (st.tasks + 8))); return; }
  if (/^Downloading |Download https?:/i.test(l)) rep.detail('Téléchargement des bibliothèques nécessaires…');
}
function runGradle(g, jdkHome, project, rep, span) {
  return new Promise(res => {
    const env = { ...process.env, JAVA_HOME: jdkHome, PATH: path.join(jdkHome, 'bin') + path.delimiter + process.env.PATH, GRADLE_USER_HOME: path.join(tools, 'gradle-home') };
    const args = ['-p', project, 'build', '--no-daemon', '--console=plain'], st = { tasks: 0 }, all = [];
    // Windows : gradle.bat doit passer par un shell ; on donne une seule chaîne (pas de tableau d'arguments, c'est ce qui provoquait l'avertissement « DEP0190 »).
    const p = WIN ? spawn(`"${g.bin}" ${args.map(a => /\s/.test(a) ? `"${a}"` : a).join(' ')}`, { env, shell: true, windowsHide: true }) : spawn(g.bin, args, { env });
    const eat = d => String(d).split(/\r\n|\n|\r/).forEach(l => { if (!l.trim()) return; rep.log(l); all.push(l); if (all.length > 400) all.shift(); gradleLine(l, st, rep, span); });
    p.stdout.on('data', eat); p.stderr.on('data', eat);
    p.on('error', e => res({ ok: false, text: e.message }));
    p.on('close', code => res({ ok: code === 0, text: all.join('\n') }));
  });
}

/* versions récentes : on lit les versions du moment chez Fabric / Modrinth pour écrire gradle.properties (rien n'est figé) */
async function prepLatest(dir, rep) {
  rep.detail('Recherche de la dernière version de Minecraft…');
  const games = await (await get('https://meta.fabricmc.net/v2/versions/game')).json(), g = games.find(v => v.stable && /^\d{2}\.\d/.test(v.version)); if (!g) throw new Error('Aucune version 26.x stable chez Fabric.');
  const loader = (await (await get('https://meta.fabricmc.net/v2/versions/loader')).json()).find(v => v.stable).version;
  const xml = await (await get('https://maven.fabricmc.net/net/fabricmc/fabric-loom/maven-metadata.xml')).text(), loom = (/<release>([^<]+)<\/release>/.exec(xml) || [])[1];
  const api = await (await get('https://api.modrinth.com/v2/project/fabric-api/version?loaders=' + encodeURIComponent('["fabric"]') + '&game_versions=' + encodeURIComponent(JSON.stringify([g.version])), { headers: { 'User-Agent': 'Hydarium-Launcher build' } })).json();
  if (!loom || !api.length) throw new Error('Versions de Loom / Fabric API introuvables pour ' + g.version);
  fs.writeFileSync(path.join(dir, 'gradle.properties'), `org.gradle.jvmargs=-Xmx2G\nminecraft_version=${g.version}\nloader_version=${loader}\nloom_version=${loom}\nfabric_version=${api[0].version_number}\n`);
  rep.log(`Versions récentes : Minecraft ${g.version}, Loader ${loader}, Loom ${loom}, Fabric API ${api[0].version_number}`);
  return g.version;
}

async function buildOne(name, rep, [a, b]) {
  const m = MODS[name], dir = path.join(root, 'client-mod', name), at = x => a + (b - a) * x;
  rep.step(m.title); rep.progress(a);
  if (m.prepare) await m.prepare(dir, rep); rep.progress(at(.04));
  const j = await jdk(m.jdk, rep, [at(.04), at(.3)]); rep.progress(at(.3));
  let g = await gradle(m.gradle, rep, [at(.3), at(.42)]); rep.progress(at(.42)); rep.detail('Préparation du projet…');
  let r = await runGradle(g, j, dir, rep, [at(.42), at(.97)]);
  if (!r.ok) { // « Gradle X or higher is required » : on télécharge la version demandée et on réessaie une fois
    let need = /Gradle (\d+(?:\.\d+){1,2}) or higher is required/.exec(r.text);
    if (!need) need = /(?:Minimum supported Gradle version is|requires Gradle|Gradle version) (\d+(?:\.\d+){1,2})(?: or (?:higher|newer|above))?/i.exec(r.text.split('\n').filter(l => /Loom|Gradle/i.test(l) && /(minimum|requires|or higher|or newer)/i.test(l)).join('\n'));
    if (need && vcmp(need[1], g.version) > 0) { rep.log(`→ Gradle ${need[1]} demandé : nouvel essai`); rep.detail(`Cet outil demande Gradle ${need[1]} : mise à jour automatique…`); g = await gradle(need[1], rep, [at(.42), at(.5)]); r = await runGradle(g, j, dir, rep, [at(.5), at(.97)]); }
  }
  if (!r.ok) { const e = new Error(explain(r.text)); e.tech = r.text; throw e; }
  const jar = path.join(dir, 'build', 'libs', m.jar); if (!fs.existsSync(jar)) throw new Error('Le fichier du mod (' + m.jar + ') n’a pas été créé.');
  fs.mkdirSync(out, { recursive: true }); fs.copyFileSync(jar, path.join(out, m.jar)); rep.progress(b);
}

/* Empreinte des sources d'un mod : si elles n'ont pas changé depuis la dernière construction réussie, on garde le jar (sinon une modification du code n'était jamais prise en compte avec --if-missing). */
const crypto = require('crypto');
function srcHash(name) {
  const h = crypto.createHash('sha1'), roots = [path.join(root, 'client-mod', name), path.join(root, 'client-mod', 'core', 'src')];
  if (name !== 'forge-189') roots.push(path.join(root, 'client-mod', 'fabric-common', 'src'));
  const walk = d => { let l; try { l = fs.readdirSync(d).sort(); } catch (e) { return; } for (const f of l) { if (/^(build|\.gradle|\.git)$/.test(f)) continue; const p = path.join(d, f), st = fs.statSync(p); if (st.isDirectory()) walk(p); else { h.update(path.relative(root, p) + '\0'); h.update(fs.readFileSync(p)); } } };
  roots.forEach(walk); return h.digest('hex');
}
const hashFile = n => path.join(out, MODS[n].jar + '.src');
const upToDate = n => { try { return fs.existsSync(path.join(out, MODS[n].jar)) && fs.readFileSync(hashFile(n), 'utf8') === srcHash(n); } catch (e) { return false; } };

/** Construit les mods demandés (les trois en parallèle : ils n'ont aucune dépendance entre eux, le premier lancement est ~2 fois plus court).
    Renvoie { nom: { ok, skipped?, error? } }. Ne lève jamais d'exception pour un mod qui échoue. */
async function buildMods({ only, ifMissing, report } = {}) {
  const rep = { step() {}, detail() {}, progress() {}, log() {}, warn() {}, ...(report || {}) };
  fs.mkdirSync(out, { recursive: true }); const names = (only && only.length ? only : Object.keys(MODS)), res = {}, prog = {};
  const todo = [];
  for (const n of names) {
    if (!MODS[n]) { rep.log('Mod inconnu : ' + n); continue; }
    if (ifMissing && upToDate(n)) { rep.log(`${n} : déjà construit (sources inchangées)`); res[n] = { ok: true, skipped: true }; prog[n] = 1; } else { todo.push(n); prog[n] = 0; }
  }
  const total = () => names.length ? Object.values(prog).reduce((a, b) => a + b, 0) / names.length : 1; rep.progress(total());
  await Promise.all(todo.map(async n => {
    const m = MODS[n], sub = { ...rep, progress: f => { prog[n] = Math.max(0, Math.min(1, (f - 0) )); rep.progress(total()); } };
    try { await buildOne(n, sub, [0, 1]); try { fs.writeFileSync(hashFile(n), srcHash(n)); } catch (e) {} res[n] = { ok: true }; }
    catch (e) { res[n] = { ok: false, error: e.message }; rep.log(`${n} ÉCHEC : ${e.message}`); if (e.tech) rep.log(e.tech); rep.warn(`${m.title} : ${e.message}`); }
    prog[n] = 1; rep.progress(total());
  }));
  return res;
}
/* ===== Fabrication à la demande : n'importe quelle version (les plans viennent de src/main/modplan.js) ===== */
const copyTree = (from, to, skip) => { if (!fs.existsSync(from)) return; fs.mkdirSync(to, { recursive: true }); for (const e of fs.readdirSync(from, { withFileTypes: true })) { if (skip && skip(e.name)) continue; const a = path.join(from, e.name), b = path.join(to, e.name); e.isDirectory() ? copyTree(a, b, skip) : fs.copyFileSync(a, b); } };
const isCompileFail = t => /Task :compileJava FAILED|error: (?:cannot find symbol|package .* does not exist|incompatible types|method .* cannot be applied|.* cannot be converted)|Compilation failed/i.test(String(t || ''));
let metaCache = null;
async function fabricMeta(V, dry) { // versions du moment chez Fabric / Modrinth (rien n'est figé) ; --dry : valeurs factices, sans réseau
  if (dry) return { loader: '0.0.0', api: '0.0.0+' + V, loom: '1.0' };
  if (!metaCache) { const [games, loaders] = await Promise.all([get('https://meta.fabricmc.net/v2/versions/game').then(r => r.json()), get('https://meta.fabricmc.net/v2/versions/loader').then(r => r.json())]); metaCache = { games, loader: (loaders.find(v => v.stable) || loaders[0]).version }; }
  if (!metaCache.games.some(g => g.version === V)) throw new Error('Fabric ne propose pas (encore) Minecraft ' + V + '.');
  const api = await (await get('https://api.modrinth.com/v2/project/fabric-api/version?loaders=' + encodeURIComponent('["fabric"]') + '&game_versions=' + encodeURIComponent(JSON.stringify([V])), { headers: { 'User-Agent': 'Hydarium-Launcher build' } })).json();
  if (!api.length) throw new Error('Fabric API introuvable pour Minecraft ' + V + '.');
  const xml = await (await get('https://maven.fabricmc.net/net/fabricmc/fabric-loom/maven-metadata.xml')).text();
  return { loader: metaCache.loader, api: api[0].version_number, loom: (/<release>([^<]+)<\/release>/.exec(xml) || [])[1] };
}
/** Écrit le projet Gradle d'un plan dans dir (frais à chaque essai). Renvoie le nom du jar produit. */
function writeFabricProject(dir, V, plan, m) {
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const cm = path.join(root, 'client-mod'), src = path.join(dir, 'src', 'main', 'java'), res = path.join(dir, 'src', 'main', 'resources'), jar = 'hydarium-fabric-' + V + '.jar', loom = plan.loom === 'latest' ? m.loom : plan.loom;
  if (!loom) throw new Error('Version de Loom introuvable.');
  copyTree(path.join(cm, 'core', 'src'), src); copyTree(path.join(cm, 'fabric-common', 'src'), src);
  copyTree(path.join(cm, plan.adapter, 'src', 'main', 'java'), src, n => plan.tier === 'core' && /^Draw\.java$/.test(n)); // « core » : pas de dessin dans le jeu, le launcher dessine le HUD
  copyTree(path.join(cm, plan.adapter, 'src', 'main', 'resources'), res);
  const rj = (f, fn) => { const p = path.join(res, f); if (!fs.existsSync(p)) return; const j = JSON.parse(fs.readFileSync(p, 'utf8')); fn(j); fs.writeFileSync(p, JSON.stringify(j, null, 2)); };
  rj('fabric.mod.json', j => { j.depends = { ...j.depends, minecraft: V, java: '>=' + plan.release }; });
  rj('hydarium.mixins.json', j => { j.compatibilityLevel = 'JAVA_' + plan.release; j.refmap = 'hydarium-fabric-' + V + '-refmap.json'; });
  const props = `org.gradle.jvmargs=-Xmx2G\nminecraft_version=${V}\nloader_version=${m.loader}\nfabric_version=${m.api}\nloom_version=${loom}\n`;
  fs.writeFileSync(path.join(dir, 'gradle.properties'), props);
  const javaBlock = `java { sourceCompatibility = JavaVersion.VERSION_${plan.release}; targetCompatibility = JavaVersion.VERSION_${plan.release} }\ntasks.withType(JavaCompile).configureEach { it.options.release = ${plan.release}; it.options.encoding = 'UTF-8' }\nprocessResources { inputs.property 'version', project.version; filesMatching('fabric.mod.json') { expand 'version': project.version } }\n`;
  if (plan.unobfuscated) { // Minecraft 26.x : plus de mappings ni de remapJar
    fs.writeFileSync(path.join(dir, 'build.gradle'), `plugins { id '${plan.plugin}' }\nversion = '1.1.0'\nbase { archivesName = 'hydarium-fabric-${V}' }\nrepositories { mavenCentral() }\ndependencies {\n  minecraft "com.mojang:minecraft:\${project.minecraft_version}"\n  implementation "net.fabricmc:fabric-loader:\${project.loader_version}"\n  implementation "net.fabricmc.fabric-api:fabric-api:\${project.fabric_version}"\n}\n${javaBlock}jar { archiveFileName = '${jar}' }\n`);
    fs.writeFileSync(path.join(dir, 'settings.gradle'), `pluginManagement {\n  repositories { maven { url = 'https://maven.fabricmc.net/' }; gradlePluginPortal() }\n  plugins { id '${plan.plugin}' version "\${loom_version}" }\n}\nrootProject.name = 'hydarium-${V}'\n`);
  } else {
    fs.writeFileSync(path.join(dir, 'build.gradle'), `plugins { id '${plan.plugin}' version '${loom}' }\nversion = '1.1.0'\nbase { archivesName = 'hydarium-fabric-${V}' }\nrepositories { mavenCentral() }\ndependencies {\n  minecraft "com.mojang:minecraft:\${project.minecraft_version}"\n  mappings loom.officialMojangMappings()\n  modImplementation "net.fabricmc:fabric-loader:\${project.loader_version}"\n  modImplementation "net.fabricmc.fabric-api:fabric-api:\${project.fabric_version}"\n}\n${javaBlock}remapJar { archiveFileName = '${jar}' }\n`);
    fs.writeFileSync(path.join(dir, 'settings.gradle'), `pluginManagement { repositories { maven { url = 'https://maven.fabricmc.net/' }; gradlePluginPortal() } }\nrootProject.name = 'hydarium-${V}'\n`);
  }
  return jar;
}
/* ===== Forge généré (client-mod/forge-gen) : un modèle, une ligne de table par version (src/main/modplan.js › FORGE_GEN) ===== */
async function forgeMeta(V, dry) { // version exacte de Forge : la « recommandée » (sinon la dernière) chez Forge ; valeur de secours de la table hors ligne ; --dry : sans réseau
  const t = PLAN.FORGE_GEN[V]; if (dry || !t) return { forge: t && t.forge };
  try { const p = (await (await get('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json')).json()).promos || {}, v = p[V + '-recommended'] || p[V + '-latest']; if (v) return { forge: v }; } catch (e) { /* hors ligne : on garde la valeur de secours */ }
  return { forge: t.forge };
}
function writeForgeProject(dir, V, plan, m) { // écrit le projet Gradle ; renvoie le nom du jar
  return require(path.join(root, 'client-mod', 'forge-gen', 'gen.js')).generate(V, PLAN.FORGE_GEN[V], { cm: path.join(root, 'client-mod'), dir, tier: plan.tier, forge: m.forge });
}
/** Fabrique le mod de (famille, version) : essaie les plans dans l'ordre, le premier qui compile gagne. Écrit le jar et un petit fichier .json (plan retenu, empreinte des sources) dans out.
    Ne continue avec un autre plan que si le code ne compile pas pour cette version ; une panne de réseau / de disque n'a aucune raison de se régler en changeant de plan. */
async function buildFor(family, V, rep, { dry } = {}) {
  const r = PLAN.plansFor(family, V); if (!r.ok) throw new Error(r.reason);
  const key = family + '-' + V, hash = PLAN.hashSources(root, family, V), tried = []; fs.mkdirSync(out, { recursive: true });
  const meta = (plan, jar) => fs.writeFileSync(path.join(out, jar.replace(/\.jar$/, '.json')), JSON.stringify({ key, plan: plan.id, tier: plan.tier, draw: !!plan.draw, srcHash: hash, builtAt: new Date().toISOString(), tried }));
  if (family === 'forge' && r.plans[0].static) { const plan = r.plans[0]; await buildOne(plan.adapter, rep, [0, 1]); meta(plan, MODS[plan.adapter].jar); return { jar: MODS[plan.adapter].jar, plan: plan.id, tier: plan.tier, draw: true, tried }; }
  rep.step('Mod Hydarium pour Minecraft ' + V + (family === 'forge' ? ' (Forge)' : ' (Fabric)'));
  let lastErr = null;
  for (let i = 0; i < r.plans.length; i++) {
    const plan = r.plans[i], a = i / r.plans.length, b = (i + 1) / r.plans.length, at = x => a + (b - a) * x;
    try {
      rep.log(`→ plan ${plan.id} (essai ${i + 1}/${r.plans.length})`); rep.progress(at(0));
      const m = family === 'forge' ? await forgeMeta(V, dry) : await fabricMeta(V, dry), dir = path.join(tools, 'mods', key + '-' + plan.id.replace('/', '-')), jarName = family === 'forge' ? writeForgeProject(dir, V, plan, m) : writeFabricProject(dir, V, plan, m);
      if (dry) { rep.log('projet écrit : ' + dir); return { jar: jarName, plan: plan.id, tier: plan.tier, draw: !!plan.draw, dir, tried }; }
      const j = await jdk(plan.jdk, rep, [at(.02), at(.3)]); let g = await gradle(plan.gradle, rep, [at(.3), at(.4)]); rep.detail('Préparation du projet…');
      let res = await runGradle(g, j, dir, rep, [at(.4), at(.97)]);
      if (!res.ok) { const need = /Gradle (\d+(?:\.\d+){1,2}) or higher is required/.exec(res.text) || /(?:Minimum supported Gradle version is|requires Gradle) (\d+(?:\.\d+){1,2})/i.exec(res.text); if (need && vcmp(need[1], g.version) > 0) { rep.log(`→ Gradle ${need[1]} demandé : nouvel essai`); g = await gradle(need[1], rep, [at(.4), at(.5)]); res = await runGradle(g, j, dir, rep, [at(.5), at(.97)]); } }
      if (!res.ok) { const e = new Error(explain(res.text)); e.tech = res.text; throw e; }
      const built = path.join(dir, 'build', 'libs', jarName); if (!fs.existsSync(built)) throw new Error('Le fichier du mod (' + jarName + ') n’a pas été créé.');
      fs.copyFileSync(built, path.join(out, jarName)); tried.push(plan.id + ' : OK'); meta(plan, jarName); rep.progress(1);
      return { jar: jarName, plan: plan.id, tier: plan.tier, draw: !!plan.draw, tried };
    } catch (e) {
      lastErr = e; tried.push(plan.id + ' : ' + String(e.message).split('\n')[0].slice(0, 200)); rep.log(`plan ${plan.id} ÉCHEC : ${e.message}`); if (e.tech) rep.log(e.tech);
      if (!isCompileFail(e.tech)) break; // pas un problème de code : inutile d'essayer un plan plus simple
    }
  }
  const e = new Error(lastErr ? lastErr.message : 'Échec de la construction.'); e.tried = tried; e.tech = lastErr && lastErr.tech; throw e;
}

module.exports = { buildMods, MODS, buildFor, writeFabricProject, writeForgeProject, isCompileFail };

if (require.main === module) {
  const args = process.argv.slice(2), json = args.includes('--json'), only = args.filter(a => !a.startsWith('--'));
  let step = '';
  if (args[0] === '--for') { // node build-mods.js --for fabric 1.20.4 [--json] [--dry]  → une seule version, résultat sur la ligne « @@HYD_RESULT {...} »
    const fam = args[1], ver = args[2], emit0 = (p, t) => console.log('@@HYD ' + JSON.stringify({ p, t })); let st = '';
    const rep0 = args.includes('--json') ? { step: s => { st = s; emit0(null, s); }, detail: t => emit0(null, st + ' : ' + t), progress: p => emit0(p, null), log: l => console.log(l), warn() {} } : { step: s => console.log('[mods] === ' + s + ' ==='), detail: t => console.log('[mods] ' + t), progress() {}, log: l => console.log(l), warn: t => console.log('[mods] ⚠', t) };
    buildFor(fam, ver, rep0, { dry: args.includes('--dry') }).then(r => { console.log('@@HYD_RESULT ' + JSON.stringify({ ok: true, ...r })); process.exit(0); })
      .catch(e => { console.log('@@HYD_RESULT ' + JSON.stringify({ ok: false, error: e.message, tried: e.tried || [], compile: !!(e.tech && isCompileFail(e.tech)) })); process.exit(0); });
    return;
  }
  const emit = (p, t) => console.log('@@HYD ' + JSON.stringify({ p, t }));
  const report = json
    ? { step: s => { step = s; emit(null, s); }, detail: t => emit(null, step + ' : ' + t), progress: p => emit(p, null), log: l => console.log(l), warn() {} }
    : { step: s => console.log('[mods] === ' + s + ' ==='), detail: t => console.log('[mods] ' + t), progress() {}, log: l => console.log(l), warn: t => console.log('[mods] ⚠', t) };
  buildMods({ only, ifMissing: args.includes('--if-missing'), report }).then(res => {
    console.log('[mods] Résumé :'); for (const [k, v] of Object.entries(res)) console.log('[mods]  ', k, '→', v.ok ? (v.skipped ? 'déjà là' : 'OK') : 'ÉCHEC : ' + v.error);
  });
}
