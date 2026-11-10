/* Générateur de mods Forge (client-mod/forge-gen) : un modèle, plusieurs versions.
   Ce test ne peut PAS compiler contre Minecraft (pas de réseau ici) ; il vérifie ce qu'il est possible de vérifier sans :
     1) chaque version de la table FORGE_GEN se génère, avec les bons fichiers ;
     2) plus aucune trace de l'ancienne API (1.8.9 dans un mod 1.12.2 ; Fabric / Mixin dans un mod Forge moderne) ;
     3) chaque référence entre classes du projet (HydariumClient.xxx, Compat.xxx…) pointe vers un membre qui existe ;
     4) le code Java produit n'a AUCUNE erreur de syntaxe ni de structure (les seules erreurs tolérées : « symbole / paquet introuvable », puisque Minecraft n'est pas là) ;
     5) si une source change de forme, le générateur ÉCHOUE avec un message clair au lieu de produire un mod faux. */
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const P = require('../src/main/modplan'), G = require('../client-mod/forge-gen/gen.js');
const CM = path.join(__dirname, '..', 'client-mod'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hyd-fg-'));
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const has = (c, a) => { try { return spawnSync(c, a, { encoding: 'utf8' }).status === 0; } catch (e) { return false; } };
const javac = has('javac', ['-version']) ? ['javac'] : has('java', ['-m', 'jdk.compiler/com.sun.tools.javac.Main', '-version']) ? ['java', '-m', 'jdk.compiler/com.sun.tools.javac.Main'] : null;
const gen = (v, tier, cm) => { const t = P.FORGE_GEN[v], dir = path.join(tmp, v + '-' + tier + (cm ? '-alt' : '')); const jar = G.generate(v, t, { cm: cm || CM, dir, tier, forge: t.forge }); return { dir, jar, t }; };
const javaIn = dir => walk(path.join(dir, 'src', 'main', 'java')).filter(f => /\.java$/.test(f));
const clientDir = dir => path.join(dir, 'src', 'main', 'java', 'net', 'hydarium', 'client');

test('la table couvre les versions annoncées, 1.8.9 reste écrit à la main', () => {
  assert.deepStrictEqual(P.forgeVersions(), ['1.8.9', '1.12.2', '1.20.1', '1.20.2', '1.20.3', '1.20.4', '26.2', '26.3']);
  for (const [v, t] of Object.entries(P.FORGE_GEN)) {
    assert.ok(['legacy', 'modern', 'forge26'].includes(t.family) && t.jdk && t.gradle && t.fg && t.forge && t.tiers.length, v + ' : ligne incomplète');
    assert.ok(fs.existsSync(path.join(CM, t.from)), v + ' : dossier source introuvable : ' + t.from);
  }
  assert.strictEqual(P.plansFor('forge', '1.8.9').plans[0].static, true, '1.8.9 : mod écrit à la main, non généré');
  assert.ok(!P.plansFor('forge', '1.16.5').ok && /1\.12\.2/.test(P.plansFor('forge', '1.16.5').reason), 'version sans cible : message qui liste les versions prises en charge');
});

for (const [v, t] of Object.entries(P.FORGE_GEN)) for (const tier of t.tiers) {
  test(`${v} (${tier}) : projet généré complet, sans reste de l'ancienne API`, () => {
    const { dir, jar } = gen(v, tier); assert.strictEqual(jar, `hydarium-forge-${v}.jar`, 'nom du jar = P.jarName(clé)'); assert.strictEqual(jar, P.jarName('forge-' + v));
    for (const f of ['build.gradle', 'settings.gradle', 'gradle.properties']) assert.ok(fs.existsSync(path.join(dir, f)), f);
    assert.ok(fs.existsSync(path.join(dir, 'src', 'main', 'java', 'net', 'hydarium', 'core', 'Config.java')), 'cœur copié');
    const gradle = fs.readFileSync(path.join(dir, 'build.gradle'), 'utf8');
    assert.ok(gradle.includes(jar) && gradle.includes(t.forge) && gradle.includes(t.fg), 'build.gradle : jar, version de Forge, ForgeGradle');
    const src = javaIn(dir).filter(f => !/[\\/]core[\\/]/.test(f)).map(f => [f, fs.readFileSync(f, 'utf8')]);
    if (t.family === 'legacy') {
      assert.ok(fs.existsSync(path.join(dir, 'src', 'main', 'resources', 'mcmod.info')) && !/\$\{/.test(fs.readFileSync(path.join(dir, 'src', 'main', 'resources', 'mcmod.info'), 'utf8')), 'mcmod.info rempli');
      const j = fs.readFileSync(path.join(clientDir(dir), 'HydariumForge.java'), 'utf8');
      assert.ok(j.includes(`"[${v}]"`) && j.includes('acceptableRemoteVersions'), 'version acceptée + serveurs sans le mod');
      for (const re of G.LEGACY_12_BANNED) assert.ok(!re.test(j), `reste de la 1.8.9 : ${re}`);
    } else if (t.family === 'forge26') {
      const toml = fs.readFileSync(path.join(dir, 'src', 'main', 'resources', 'META-INF', 'mods.toml'), 'utf8');
      assert.ok(/clientSideOnly=true/.test(toml) && toml.includes('modId="hydarium"') && toml.includes(`[${t.loaderMajor},)`) && toml.includes(`[${v},)`), 'mods.toml : client seulement, id, Forge, Minecraft');
      assert.ok(gradle.includes("id 'net.minecraftforge.gradle'") && gradle.includes('JavaLanguageVersion.of(25)') && gradle.includes(`net.minecraftforge:forge:${v}-${t.forge}`) && gradle.includes('minecraft.mavenizer'), 'build.gradle : ForgeGradle 7, Java 25, dépendance Forge (comme le MDK)');
      assert.ok(fs.existsSync(path.join(dir, 'src', 'main', 'resources', 'pack.mcmeta')) === !!t.pack);
      assert.ok(/foojay/.test(fs.readFileSync(path.join(dir, 'settings.gradle'), 'utf8')), 'settings.gradle comme le MDK');
      for (const n of ['HydariumForgeMod', 'ClientSetup', 'HydariumClient', 'Compat']) assert.ok(fs.existsSync(path.join(clientDir(dir), n + '.java')), n);
      for (const n of ['Draw', 'GlfwKeys']) assert.ok(!fs.existsSync(path.join(clientDir(dir), n + '.java')), n + ' : pas au niveau core 26');
      for (const [f, s] of src) for (const re of G.FORGE26_BANNED) assert.ok(!re.test(s), `${path.basename(f)} : reste de Fabric / ancien Forge : ${re}`);
      const m = fs.readFileSync(path.join(clientDir(dir), 'HydariumForgeMod.java'), 'utf8');
      assert.ok(/FMLJavaModLoadingContext context/.test(m) && /eventbus\.api\.listener\.SubscribeEvent/.test(m) && /Dist\.CLIENT/.test(m), 'point d\'entrée sur le patron du MDK 26.3');
    } else {
      const toml = fs.readFileSync(path.join(dir, 'src', 'main', 'resources', 'META-INF', 'mods.toml'), 'utf8');
      assert.ok(toml.includes('modId = "hydarium"') && toml.includes(`[${v}]`) && toml.includes(`[${t.loaderMajor},)`), 'mods.toml : id, Minecraft, Forge');
      assert.ok(fs.existsSync(path.join(dir, 'src', 'main', 'resources', 'pack.mcmeta')));
      for (const n of ['HydariumForgeMod', 'ClientSetup', 'HydariumClient', 'Compat', 'GlfwKeys']) assert.ok(fs.existsSync(path.join(clientDir(dir), n + '.java')), n);
      assert.strictEqual(fs.existsSync(path.join(clientDir(dir), 'Draw.java')), tier !== 'core', 'Draw seulement au niveau « full »');
      assert.ok(!fs.existsSync(path.join(clientDir(dir), 'mixin')), 'aucun Mixin (Fabric) dans un mod Forge');
      for (const [f, s] of src) for (const re of G.MODERN_BANNED) assert.ok(!re.test(s), `${path.basename(f)} : reste de Fabric / réflexion : ${re}`);
      const c = fs.readFileSync(path.join(clientDir(dir), 'HydariumClient.java'), 'utf8');
      assert.ok(/public static void init\(\)/.test(c) && /static void frame\(\)/.test(c) && /static void onTick\(Minecraft mc\)/.test(c), 'API appelée par ClientSetup');
    }
  });

  test(`${v} (${tier}) : chaque référence entre classes du projet existe`, () => {
    const { dir } = gen(v, tier), cd = clientDir(dir), classes = fs.readdirSync(cd).filter(f => /\.java$/.test(f)).map(f => f.replace(/\.java$/, ''));
    const body = Object.fromEntries(classes.map(c => [c, fs.readFileSync(path.join(cd, c + '.java'), 'utf8')]));
    const declared = (c, m) => new RegExp('\\b(?:static|public|private|final|protected)\\b[^;{}]*\\b' + m + '\\b\\s*(?:\\(|=|;|,)').test(body[c]);
    let n = 0;
    for (const [c, s] of Object.entries(body)) for (const m of s.matchAll(/\b(HydariumClient|Compat|Draw|GlfwKeys|ClientSetup|HydariumForgeMod)\.([a-zA-Z_]\w*)/g)) {
      if (!body[m[1]] || m[2] === 'class') continue; n++;
      assert.ok(declared(m[1], m[2]), `${c}.java appelle ${m[1]}.${m[2]} qui n'est pas déclaré dans ${m[1]}.java`);
    }
    if (t.family === 'modern') assert.ok(n >= 5, 'références vérifiées : ' + n);
    if (t.family === 'forge26') assert.ok(n >= 3, 'références vérifiées : ' + n);
  });

  test(`${v} (${tier}) : le code Java généré n'a aucune erreur de syntaxe ni de structure`, { skip: !javac && 'aucun JDK' }, () => {
    const { dir } = gen(v, tier), out = path.join(dir, '.out');
    const r = spawnSync(javac[0], [...javac.slice(1), '-proc:none', '-encoding', 'UTF-8', '-Xmaxerrs', '5000', '-d', out, ...javaIn(dir)], { encoding: 'utf8' });
    // Minecraft / Forge / LWJGL ne sont pas là : « paquet / symbole introuvable » est normal. TOUT AUTRE message d'erreur = vrai problème.
    const bad = String(r.stdout || '') .concat(String(r.stderr || '')).split('\n').filter(l => /: error: /.test(l) && !/package .* does not exist|cannot find symbol|does not override or implement|cannot access|static import only/.test(l));
    assert.deepStrictEqual(bad.slice(0, 5), [], 'erreurs hors symboles manquants :\n' + bad.slice(0, 5).join('\n'));
  });
}

test('le niveau « core » = le même projet sans Draw (le launcher dessine le HUD)', () => {
  const full = gen('1.20.1', 'full'), core = gen('1.20.1', 'core');
  const a = new Set(javaIn(full.dir).map(f => path.relative(full.dir, f))), b = new Set(javaIn(core.dir).map(f => path.relative(core.dir, f)));
  assert.deepStrictEqual([...a].filter(x => !b.has(x)), [path.join('src', 'main', 'java', 'net', 'hydarium', 'client', 'Draw.java')]);
  assert.deepStrictEqual([...b].filter(x => !a.has(x)), []);
});

test('le mod Fabric 1.20.1 n\'est PAS modifié par le générateur (sources intactes)', () => {
  const before = P.hashSources(path.join(__dirname, '..'), 'fabric', '1.20.1'); gen('1.20.1', 'full'); gen('1.12.2', 'full');
  assert.strictEqual(P.hashSources(path.join(__dirname, '..'), 'fabric', '1.20.1'), before);
  const s = fs.readFileSync(path.join(CM, 'fabric-common', 'src', 'net', 'hydarium', 'client', 'HydariumClient.java'), 'utf8');
  assert.ok(/implements ClientModInitializer/.test(s) && /ClientTickEvents/.test(s), 'la source Fabric garde ses évènements Fabric');
});

test('si une source change de forme, le générateur échoue bruyamment (jamais de mod faux)', () => {
  const alt = fs.mkdtempSync(path.join(os.tmpdir(), 'hyd-fgalt-')); fs.cpSync(CM, alt, { recursive: true });
  const f = path.join(alt, 'fabric-common', 'src', 'net', 'hydarium', 'client', 'HydariumClient.java');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('onInitializeClient', 'onInitClient'));
  assert.throws(() => gen('1.20.1', 'full', alt), /ne trouve pas son ancre/, 'Fabric : point d\'entrée renommé');
  const g = path.join(alt, 'forge-189', 'src', 'main', 'java', 'net', 'hydarium', 'client', 'HydariumForge.java');
  fs.writeFileSync(g, fs.readFileSync(g, 'utf8').split('p.isUsingItem()').join('p.isUsingItemNow()'));
  assert.throws(() => gen('1.12.2', 'full', alt), /ne trouve pas son ancre/, 'Forge 1.8.9 : méthode renommée');
});
