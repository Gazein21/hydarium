/* Code P2P dans le champ d'adresse du jeu : route du pont (launcher) + client Java réel (mod). Le réseau pair-à-pair est simulé. */
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), { spawnSync, spawn } = require('child_process');
/* asynchrone : le pont tourne dans CE processus, un lancement bloquant l'empêcherait de répondre à Java */
const spawnAsync = (cmd, args) => new Promise(res => { const p = spawn(cmd, args); let out = '', err = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d); p.on('close', status => res({ status, stdout: out, stderr: err })); });
const bridge = require('../src/main/bridge'), p2p = require('../src/main/p2p'), pb = require('../src/main/p2pbridge');
const root = path.join(__dirname, '..', 'client-mod', 'core');
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : /\.java$/.test(e.name) ? [path.join(d, e.name)] : []);
const has = (c, a) => { try { return spawnSync(c, a, { encoding: 'utf8' }).status === 0; } catch (e) { return false; } };
const javac = has('javac', ['-version']) ? ['javac'] : has('java', ['-m', 'jdk.compiler/com.sun.tools.javac.Main', '-version']) ? ['java', '-m', 'jdk.compiler/com.sun.tools.javac.Main'] : null;
const CODE = p2p.newCode();

test('p2pbridge.open : code valide → port local, code invalide → erreur lisible, jamais le port d’un de mes serveurs', async () => {
  const seen = []; const fake = { normalize: p2p.normalize, join: async (c, o) => { seen.push([c, o]); return { port: 41234, key: 'k' }; } };
  const r = await pb.open(CODE.toLowerCase().replace(/-/g, ' '), { p2p: fake, store: { get: () => ({ hosts: [{ port: 25565 }, { port: '25570' }, {}] }) } });
  assert.deepStrictEqual([r.ok, r.port, r.addr, r.code], [true, 41234, '127.0.0.1:41234', CODE]);
  assert.strictEqual(seen[0][0], CODE); assert.deepStrictEqual(seen[0][1].avoid, [25565, 25570]);
  await assert.rejects(pb.open('play.hypixel.net', { p2p: fake }), /invalide/); await assert.rejects(pb.open('', { p2p: fake }), /invalide/); await assert.rejects(pb.open(undefined, { p2p: fake }), /invalide/);
  assert.strictEqual(seen.length, 1, 'rien n’est ouvert pour un code invalide');
});

test('mod Java (réel) ↔ pont du launcher (réel) : le code devient 127.0.0.1:port, le reste est refusé ou ignoré', { skip: !javac && 'aucun JDK (javac) trouvé' }, async () => {
  const info = await bridge.start(); let opened = 0;
  bridge.route('POST', '/v1/p2p/open', (q, b) => pb.open(b && b.code, { p2p: { normalize: p2p.normalize, join: async () => { opened++; return { port: 40999 }; } }, store: { get: () => ({ hosts: [] }) } }));
  try {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'hyd-p2p-')), files = [...walk(path.join(root, 'src')), path.join(root, 'test', 'P2pProbe.java')];
    const c = spawnSync(javac[0], [...javac.slice(1), '-encoding', 'UTF-8', '-d', out, ...files], { encoding: 'utf8' }); assert.strictEqual(c.status, 0, 'compilation :\n' + c.stderr);
    const run = (token, ...args) => spawnAsync('java', ['-Dfile.encoding=UTF-8', '-cp', out, 'P2pProbe', 'http://127.0.0.1:' + info.port, token, ...args]);
    const good = await run(info.token, CODE, 'mc.exemple.fr:25565', 'HYD-0000-0000-0000-0000-0000-0001');
    assert.strictEqual(good.status, 0, good.stderr);
    const lines = good.stdout.trim().split(/\r?\n/);
    assert.strictEqual(lines[0], CODE + ' => 127.0.0.1:40999', 'code valide → adresse locale');
    assert.ok(lines[1].startsWith('mc.exemple.fr:25565 => null'), 'adresse ordinaire laissée telle quelle : ' + lines[1]);
    assert.ok(/ => 127\.0\.0\.1:40999$/.test(lines[2]), 'autre code bien formé : traité par le launcher');
    assert.strictEqual(opened, 2, 'le launcher n’est appelé que pour les codes (2), pas pour l’adresse ordinaire');
    const bad = await run('mauvais-jeton', CODE); assert.ok(/=> null \| /.test(bad.stdout), 'jeton invalide : le mod abandonne sans casser (null)');
      } finally { bridge.stop(); }
});
