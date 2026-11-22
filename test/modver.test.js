/* Choisir la version d'un mod : liste des versions COMPATIBLES, retour en arrière, figement (« Mises à jour » ne l'écrase pas), vérifications de sécurité. Faux Modrinth, aucun accès réseau. */
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto'), Module = require('module');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydver-')), data = path.join(tmp, 'data'); let saves = 0, db;
const stubs = { './platform': { dataDir: () => data }, './store': { get: () => db, save: () => { saves++; } } };
const load0 = Module._load; Module._load = function (r, ...a) { return stubs[r] || load0.call(this, r, ...a); };
const mods = require('../src/main/mods');
const P = 'AAAAAAAA', DEP = 'SSSSSSSS', OTHER = 'ZZZZZZZZ';
const bytes = n => Buffer.from('contenu-' + n), sha = b => crypto.createHash('sha1').update(b).digest('hex');
const ver = (vid, num, o = {}) => ({ id: vid, project_id: o.project || P, version_number: num, name: 'Iris ' + num, version_type: o.type || 'release', date_published: o.date || '2025-01-01T00:00:00Z', game_versions: o.mc || ['1.20.1'], loaders: o.loaders || ['fabric'],
  files: [{ primary: true, filename: o.file || 'iris-' + num + '.jar', url: 'https://cdn.modrinth.com/data/' + P + '/versions/' + vid + '/iris-' + num + '.jar', hashes: { sha1: sha(bytes(vid)) } }], dependencies: o.deps || [] });
const V3 = ver('V0000003', '1.7.0', { date: '2025-03-01T00:00:00Z' }), V2 = ver('V0000002', '1.6.0', { type: 'beta', date: '2025-02-01T00:00:00Z', deps: [{ project_id: DEP, dependency_type: 'required' }] }), V1 = ver('V0000001', '1.5.0');
const DEPV = ver('D0000001', '0.5.0', { project: DEP, file: 'sodium-0.5.0.jar' });
let calls, fail, posted;
const res = (b, code = 200) => ({ ok: code < 400, status: code, headers: { get: () => null }, json: async () => b, arrayBuffer: async () => b });
global.fetch = async (u, o = {}) => {
  u = String(u); calls.push(u); if (fail && fail(u)) return res({}, 404);
  if (o.method === 'POST') { posted = JSON.parse(o.body); return res({}); }
  if (u.includes('/project/' + P + '/version')) return res([V3, V2, V1]);
  if (u.includes('/project/' + DEP + '/version')) return res([DEPV]);
  if (u.endsWith('/project/' + DEP)) return res({ id: DEP, slug: 'sodium', title: 'Sodium', icon_url: '', server_side: 'optional' });
  if (u.endsWith('/project/' + P)) return res({ id: P, slug: 'iris', title: 'Iris', icon_url: '', server_side: 'optional' });
  const m = /\/version\/(\w+)$/.exec(u); if (m) { const v = { V0000003: V3, V0000002: V2, V0000001: V1, X0000001: ver('X0000001', '9', { project: OTHER }), X0000002: ver('X0000002', '1.0', { mc: ['1.19.2'] }), X0000003: ver('X0000003', '1.0', { loaders: ['forge'] }), X0000004: ver('X0000004', '1.0', { file: 'pas-un-jar.zip' }), X0000005: ver('X0000005', '1.0', { deps: [{ project_id: 'BBBBBBBB', dependency_type: 'incompatible' }] }) }[m[1]]; return v ? res(v) : res({}, 404); }
  if (u.startsWith('https://cdn.modrinth.com/')) { const id = (/versions\/(\w+)\//.exec(u) || [])[1]; return res(id === 'D0000001' ? bytes('D0000001') : bytes(id)); }
  return res({}, 404);
};
const dirMods = () => path.join(data, 'instances', 'i1', 'mods'), has = f => fs.existsSync(path.join(dirMods(), f));
function setup(over = {}) {
  calls = []; fail = null; posted = null; saves = 0; fs.rmSync(path.join(data, 'instances'), { recursive: true, force: true }); fs.mkdirSync(dirMods(), { recursive: true });
  fs.writeFileSync(path.join(dirMods(), 'iris-1.7.0.jar'), bytes('V0000003'));
  db = { instances: [{ id: 'i1', name: 'Test', version: '1.20.1', loader: 'fabric', mods: [{ pid: P, slug: 'iris', title: 'Iris', file: 'iris-1.7.0.jar', vid: 'V0000003', deps: [], incompat: [], ...over }, { pid: 'imp1a2b3c', title: 'Local', file: 'local.jar' }, { pid: 'cf123', src: 'cf', title: 'CF', file: 'cf.jar' }] }] };
}

test('liste : versions compatibles, la plus récente d’abord, installée et dernière repérées, types', async () => {
  setup(); const r = await mods.versions('i1', P);
  assert.deepStrictEqual([r.title, r.mc, r.loader, r.pinned], ['Iris', '1.20.1', 'fabric', false]); assert.deepStrictEqual(r.versions.map(v => v.number), ['1.7.0', '1.6.0', '1.5.0']);
  assert.deepStrictEqual(r.versions.map(v => [v.latest, v.current, v.type]), [[true, true, 'release'], [false, false, 'beta'], [false, false, 'release']]);
  assert.ok(calls[0].includes('game_versions=' + encodeURIComponent('["1.20.1"]')) && calls[0].includes('loaders=' + encodeURIComponent('["fabric"]')), 'filtré par Minecraft et loader');
});

test('installée repérée par le nom du fichier quand l’identifiant de version est inconnu (mods installés avant cette version)', async () => {
  setup({ vid: undefined }); assert.deepStrictEqual((await mods.versions('i1', P)).versions.map(v => v.current), [true, false, false]);
});

test('mod CurseForge, .jar importé, mod inconnu : refus clair', async () => {
  setup(); await assert.rejects(mods.versions('i1', 'cf123'), /Modrinth/); await assert.rejects(mods.versions('i1', 'imp1a2b3c'), /Modrinth/); await assert.rejects(mods.versions('i1', 'QQQQQQQQ'), /introuvable/);
  await assert.rejects(mods.setVersion('i1', 'cf123', 'V0000002'), /Modrinth/);
});

test('revenir à une version plus ancienne : nouveau fichier, ancien retiré, dépendance ajoutée, version figée', async () => {
  setup(); const r = await mods.setVersion('i1', P, 'V0000002'), m = db.instances[0].mods[0];
  assert.deepStrictEqual(r, { vid: 'V0000002', pinned: true }); assert.ok(has('iris-1.6.0.jar') && !has('iris-1.7.0.jar'), 'fichiers');
  assert.deepStrictEqual([m.file, m.vid, m.pin, m.deps], ['iris-1.6.0.jar', 'V0000002', true, [DEP]]); assert.ok(db.instances[0].mods.some(x => x.pid === DEP) && has('sodium-0.5.0.jar'), 'dépendance obligatoire installée'); assert.ok(saves > 0);
});

test('« Mises à jour » ne touche pas un mod figé ; choisir la dernière version retire le figement', async () => {
  setup(); await mods.setVersion('i1', P, 'V0000001'); posted = null; await mods.checkUpdates('i1');
  assert.ok(!posted || !posted.hashes.includes(sha(bytes('V0000001'))), 'le mod figé n’est pas envoyé à la vérification');
  const r = await mods.setVersion('i1', P, 'V0000003'); assert.deepStrictEqual(r, { vid: 'V0000003', pinned: false }); assert.ok(!('pin' in db.instances[0].mods[0]));
  await mods.checkUpdates('i1'); assert.ok(posted.hashes.includes(sha(bytes('V0000003'))), 'redevient candidat aux mises à jour');
});

test('mise à jour explicite : installe la dernière, retient sa version et retire le figement', async () => {
  setup(); await mods.setVersion('i1', P, 'V0000001'); assert.strictEqual(db.instances[0].mods[0].pin, true);
  await mods.updateMod('i1', P); const m = db.instances[0].mods[0]; assert.deepStrictEqual([m.file, m.vid, 'pin' in m], ['iris-1.7.0.jar', 'V0000003', false]);
});

test('mod désactivé : le nouveau fichier reste « .disabled »', async () => {
  setup({ disabled: true }); fs.renameSync(path.join(dirMods(), 'iris-1.7.0.jar'), path.join(dirMods(), 'iris-1.7.0.jar.disabled'));
  await mods.setVersion('i1', P, 'V0000001'); assert.ok(has('iris-1.5.0.jar.disabled') && !has('iris-1.7.0.jar.disabled') && !has('iris-1.5.0.jar'));
});

test('vérifications : autre mod, autre version de Minecraft, autre loader, pas un .jar, identifiant invalide, incompatibilité', async () => {
  setup(); const t = (vid, re) => assert.rejects(mods.setVersion('i1', P, vid), re, vid);
  await t('X0000001', /ne correspond pas/); await t('X0000002', /ne correspond pas/); await t('X0000003', /ne correspond pas/); await t('X0000004', /fichier utilisable/);
  await t('../../etc', /invalide/); await t('', /invalide/); await t('NOPE0000', /Service indisponible|404/);
  db.instances[0].mods.push({ pid: 'BBBBBBBB', title: 'Autre mod', file: 'b.jar' }); await t('X0000005', /incompatible avec « Autre mod »/);   // X0000005 doit d'abord passer les contrôles de projet
});

test('téléchargement impossible : l’ancien fichier et les données du mod restent intacts', async () => {
  setup(); fail = u => u.startsWith('https://cdn.modrinth.com/') && u.includes('V0000001'); await assert.rejects(mods.setVersion('i1', P, 'V0000001'), /Téléchargement impossible/);
  const m = db.instances[0].mods[0]; assert.ok(has('iris-1.7.0.jar') && !has('iris-1.5.0.jar')); assert.deepStrictEqual([m.file, m.vid, 'pin' in m], ['iris-1.7.0.jar', 'V0000003', false]);
});

test('fichier corrompu (empreinte différente) : refusé', async () => {
  setup(); const orig = V1.files[0].hashes.sha1; V1.files[0].hashes.sha1 = sha(Buffer.from('autre')); try { await assert.rejects(mods.setVersion('i1', P, 'V0000001'), /corrompu|intégrité/); assert.ok(has('iris-1.7.0.jar')); } finally { V1.files[0].hashes.sha1 = orig; }
});

test('branchements : canaux, refus pendant que le jeu tourne, bouton et fenêtre dans l’interface', () => {
  const r = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), main = r('src/main/main.js'), app = r('src/renderer/app.js');
  for (const c of ['mods:versions', 'mods:setversion']) { assert.ok(r('src/preload.js').includes("'" + c + "'") && main.includes("on('" + c + "'"), c); }
  assert.ok(/on\('mods:setversion'[\s\S]*?Ferme le jeu avant de changer la version[\s\S]*?Arrête le serveur avant de changer la version[\s\S]*?mods\.setVersion/.test(main), 'jeu ou serveur en cours : refusé');
  assert.ok(/modVerBtn\(x\)/.test(app) && /modVerBtn\(x, on\)/.test(app), 'bouton sur la page d’instance et sur les mods du serveur'); assert.ok(/call\('mods:versions'/.test(app) && /call\('mods:setversion'/.test(app) && /Version figée/.test(app));
  assert.ok(/src !== 'cf'/.test(app) && !/modVerBtn[^\n]*imp/.test(app), 'pas de bouton pour CurseForge');
});
