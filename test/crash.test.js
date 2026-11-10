/* Analyse de plantage : chaque cause connue doit être reconnue, avec le bon bouton d'action. */
const assert = require('assert'), { analyze, explainLaunch } = require('../src/main/crash.js');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const I = (o = {}) => ({ id: 'a', name: 'Test', version: '1.20.1', loader: 'fabric', mem: 4, java: '', mods: [{ pid: 'p1', slug: 'sodium', title: 'Sodium', file: 'sodium-fabric.jar' }, { pid: 'p2', slug: 'iris', title: 'Iris Shaders', file: 'iris.jar' }], ...o });
const act = (a, id) => (a.actions || []).find(x => x.id === id);

let a = analyze(I(), 'Exception in thread "main" java.lang.UnsupportedClassVersionError: net/minecraft/client/main/Main has been compiled by a more recent version (class file version 65.0), this version only recognizes up to 61.0', { javaMajor: 17 });
ok(a.kind === 'java' && act(a, 'jinst').v === '21' && /Java 17/.test(a.hint), 'Java trop ancien → télécharger Java 21');
a = analyze(I({ java: 'C:\\j\\java.exe' }), 'class file version 65.0', {}); ok(!!act(a, 'jauto'), 'Java imposé sur l’instance → bouton « Java automatique »');
a = analyze(I({ version: '1.8.9', loader: 'forge' }), 'java.lang.ClassCastException: class jdk.internal.loader.ClassLoaders$AppClassLoader cannot be cast to class java.net.URLClassLoader', { javaMajor: 17 });
ok(a.kind === 'java' && act(a, 'jinst').v === '8', 'Forge 1.8.9 avec Java récent → Java 8');
a = analyze(I(), 'Error occurred during initialization of VM\nCould not reserve enough space for 8388608KB object heap', { javaMajor: 21 }); ok(a.kind === 'memory' && act(a, 'mem').v === '2', 'heap impossible à réserver → mémoire divisée');
a = analyze(I(), 'java.lang.OutOfMemoryError: Java heap space'); ok(a.kind === 'memory' && act(a, 'mem').v === '6', 'manque de mémoire → +2 Go');
a = analyze(I(), '', { code: -2 }); ok(a.kind === 'javamissing' && !!act(a, 'jinst') && !!act(a, 'jadd'), 'spawn ENOENT (code -2) → Java introuvable');
a = analyze(I(), 'Error: spawn C:\\x\\javaw.exe ENOENT'); ok(a.kind === 'javamissing', 'texte spawn ENOENT');
a = analyze(I(), 'Fatal: something', { code: 3221225477, secs: 90 }); ok(a.kind === 'native', 'code 0xC0000005');
a = analyze(I(), '', { code: 3221225781, secs: 3 }); ok(a.kind === 'dll', 'code 0xC0000135 : DLL manquante');
a = analyze(I(), '', { code: 3221225595, secs: 3 }); ok(a.kind === 'arch', 'code 0xC000007B');
a = analyze(I(), '', { code: 137, secs: 60 }); ok(a.kind === 'killed' && !!act(a, 'mem'), 'tué par le système');
a = analyze(I(), 'Starting\nStopping', { code: 1, secs: 4 }); ok(a.kind === 'quick', 'fermeture immédiate sans explication');
a = analyze(I(), 'a\n'.repeat(40), { code: 1, secs: 4 }); ok(a.kind === 'unknown', 'journal long : pas de fausse « fermeture immédiate »');
a = analyze(I(), '[main/INFO]: Setting user: Steve\n[Render thread/INFO]: OpenGL 4.6\nsession service ok\njava.lang.RuntimeException: boom'); ok(a.kind === 'unknown', 'le mot « session » / « OpenGL » seuls ne sont plus des causes');
a = analyze(I(), 'Invalid session (HTTP 401 Unauthorized)'); ok(a.kind === 'auth', 'vraie session invalide');
a = analyze(I({ version: '1.8.9', loader: 'forge' }), 'net.minecraftforge.fml.common.MissingModsException: Mod xray (X-Ray) requires [coolapi@[1.0,)]'); ok(a.kind === 'dependency' && a.missing.includes('coolapi'), 'Forge 1.8.9 : dépendance manquante');
a = analyze(I(), 'Incompatible mods found!\n\tMod \'Iris\' (iris) requires version 0.97 or later of \'fabric-api\', which is missing!'); ok(a.kind === 'dependency' && a.install.some(x => x.slug === 'fabric-api'), 'Fabric API manquante proposée');
a = analyze(I(), 'net.minecraftforge.fml.common.DuplicateModsFoundException: Found a duplicate mod sodium at sodium-a.jar and sodium-b.jar'); ok(a.kind === 'duplicate' && a.mods.length > 0, 'mod en double');
a = analyze(I(), 'java.util.zip.ZipException: error in opening zip file sodium-fabric.jar'); ok(a.kind === 'corrupt', 'jar corrompu');
a = analyze(I(), 'java.lang.NoSuchMethodError: net.minecraft.Foo.bar()V\n  at iris.Mixin'); ok(a.kind === 'mod', 'NoSuchMethodError : mods incompatibles');
a = analyze(I(), 'Unrecognized option: --add-opens'); ok(a.kind === 'args', 'option JVM refusée');
a = analyze(I(), 'GLFW error 65542: WGL: The driver does not appear to support OpenGL'); ok(a.kind === 'graphics', 'pilote graphique');

// échecs avant lancement
const E = (m, o = {}) => explainLaunch(Object.assign(new Error(m), o), I());
let e = E('x', { code: 'JAVA_MISSING', major: 8, legacy: true, dlErr: 'Java 8 : Adoptium : pas de connexion Internet (ou site bloqué)', autoOff: false });
ok(e.kind === 'javamissing' && /Java 8/.test(e.title) && /connexion/i.test(e.hint) && act(e, 'jinst').v === '8', 'Java 8 impossible à télécharger : cause réseau expliquée + bouton');
e = E('x', { code: 'JAVA_MISSING', major: 17, legacy: false, dlErr: '', autoOff: true }); ok(!!act(e, 'autojava') && /désactivé/.test(e.hint), 'téléchargement auto désactivé → bouton pour l’activer');
e = explainLaunch(Object.assign(new Error('Le Java choisi est introuvable'), { code: 'JAVA_PICK' }), I({ java: 'C:\\old\\java.exe' })); ok(!!act(e, 'jauto'), 'Java choisi disparu');
e = E('getaddrinfo ENOTFOUND piston-data.mojang.com'); ok(e.kind === 'network' && !!act(e, 'retry'), 'réseau');
e = E('ENOSPC: no space left on device'); ok(e.kind === 'disk', 'disque plein');
e = E("EPERM: operation not permitted, open 'C:\\x'"); ok(e.kind === 'perm', 'accès refusé');
e = E('Forge 1.8.9 : installateur introuvable'); ok(e.kind === 'loader', 'chargeur de mods');
e = E('quelque chose d’imprévu'); ok(e.kind === 'unknown' && /imprévu/.test(e.hint), 'inconnu : message conservé');
console.log('crash.test.js : ' + n + ' contrôles OK');
