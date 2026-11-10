/* Le cœur du mod (client-mod/core) est copié dans CHAQUE mod fabriqué (Fabric, Forge 1.8.9) : s'il ne compile pas, aucune version n'a de mod.
   (0.10.32 : un champ « del » manquait dans Config.Mod → toutes les constructions échouaient.) Ce test compile le cœur et rejoue CoreTest ; ignoré si aucun JDK n'est installé. */
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const root = path.join(__dirname, '..', 'client-mod', 'core');
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : /\.java$/.test(e.name) ? [path.join(d, e.name)] : []);
const has = (c, a) => { try { return spawnSync(c, a, { encoding: 'utf8' }).status === 0; } catch (e) { return false; } };
const javac = has('javac', ['-version']) ? ['javac'] : has('java', ['-m', 'jdk.compiler/com.sun.tools.javac.Main', '-version']) ? ['java', '-m', 'jdk.compiler/com.sun.tools.javac.Main'] : null;
test('le cœur du mod compile et CoreTest passe', { skip: !javac && 'aucun JDK (javac) trouvé' }, () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'hyd-core-')), files = [...walk(path.join(root, 'src')), path.join(root, 'test', 'CoreTest.java')];
  const c = spawnSync(javac[0], [...javac.slice(1), '-encoding', 'UTF-8', '-d', out, ...files], { encoding: 'utf8' });
  assert.strictEqual(c.status, 0, 'compilation du cœur :\n' + (c.stdout || '') + (c.stderr || ''));
  const r = spawnSync('java', ['-Dfile.encoding=UTF-8', '-cp', out, 'CoreTest'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, 'CoreTest :\n' + (r.stdout || '') + (r.stderr || ''));
});
