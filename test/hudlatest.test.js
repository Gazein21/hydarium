/* HUD Fabric 26.x : logique tolérante (réflexion) testée contre un FAUX Minecraft 26.x (client-mod/fabric-latest/test/stubs) qui reprend les noms de la documentation Fabric :
   enregistrement avant le chat, dessinateur GuiGraphicsExtractor (fill / text à ARGB), F1, ouverture d'écran par setScreenAndShow, compteur d'images.
   NE prouve PAS que les vrais noms de Mojang n'ont pas changé : ça, seul le jeu (ou le journal de la CI) le dit. */
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const root = path.join(__dirname, '..', 'client-mod');
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : /\.java$/.test(e.name) ? [path.join(d, e.name)] : []);
const has = (c, a) => { try { return spawnSync(c, a, { encoding: 'utf8' }).status === 0; } catch (e) { return false; } };
const javac = has('javac', ['-version']) ? ['javac'] : has('java', ['-m', 'jdk.compiler/com.sun.tools.javac.Main', '-version']) ? ['java', '-m', 'jdk.compiler/com.sun.tools.javac.Main'] : null;

test('HUD 26.x : s’enregistre, dessine, respecte F1, ouvre un écran, et les écrans compilent', { skip: !javac && 'aucun JDK (javac) trouvé' }, () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'hyd-hud-')), files = [...walk(path.join(root, 'core', 'src')), ...walk(path.join(root, 'fabric-latest', 'src', 'draw')), ...walk(path.join(root, 'fabric-latest', 'src', 'screens')), ...walk(path.join(root, 'fabric-latest', 'test', 'stubs'))];
  const c = spawnSync(javac[0], [...javac.slice(1), '-encoding', 'UTF-8', '-d', out, ...files], { encoding: 'utf8' }); assert.strictEqual(c.status, 0, 'compilation :\n' + c.stderr);
  const r = spawnSync('java', ['-Dfile.encoding=UTF-8', '-cp', out, 'net.hydarium.client.HudProbe'], { encoding: 'utf8' }); assert.strictEqual(r.status, 0, r.stderr);
  const t = r.stdout;
  assert.match(t, /install=true where=minecraft:chat<-hydarium:hud/, 'HUD enregistré juste avant le chat');
  const m = /fills=(\d+) texts=(\d+) wrong=(\d+) transparent=(\d+) err=''/.exec(t); assert.ok(m, 'dessin : ' + t);
  assert.ok(+m[1] > 0 && +m[2] >= 2, 'des rectangles et des textes dessinés'); assert.strictEqual(m[3], '0', 'jamais la mauvaise surcharge (fill avec pipeline, text avec Component)'); assert.strictEqual(m[4], '0', 'texte toujours opaque (ARGB)');
  assert.match(t, /hideGui .* dessins=0/, 'F1 : rien n’est dessiné'); assert.match(t, /open .* true/, 'écran ouvert via setScreenAndShow');
});
