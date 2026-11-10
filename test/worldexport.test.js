/* node test/worldexport.test.js : export d'un monde d'une instance vers une autre (faux modules, aucun Electron, aucun réseau). */
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), Module = require('module');
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hyd-we-'));
const insts = [{ id: 'a', name: 'Source', version: '1.20.1', mods: [{}] }, { id: 'b', name: 'Cible', version: '1.19.4', mods: [] }, { id: 'c', name: 'Récente', version: '1.21.4', mods: [] }];
const dirOf = id => path.join(root, id);
let current = null;
const fakes = {
  './mods': { fetchJson() {}, download() {}, VERIFIED: {}, MR: '', find: id => { const i = insts.find(x => x.id === id); if (!i) throw new Error('Instance introuvable.'); return i; }, dirOf },
  './store': { get: () => ({ instances: insts }), save() {} }, './nbt': { parse() { throw new Error('pas de level.dat réel'); } }, './game': { isRunning: () => false },
  './curseforge': {}, './session': { current: () => current }
};
const orig = Module._load;
Module._load = function (req, parent, ...r) { if (parent && /content\.js$/.test(parent.filename) && fakes[req]) return fakes[req]; return orig.call(this, req, parent, ...r); };
const content = require('../src/main/content');

const w = path.join(dirOf('a'), 'saves', 'Mon monde'); fs.mkdirSync(path.join(w, 'region'), { recursive: true });
fs.writeFileSync(path.join(w, 'level.dat'), 'x'); fs.writeFileSync(path.join(w, 'session.lock'), 'lock'); fs.writeFileSync(path.join(w, 'region', 'r.0.0.mca'), 'data');

let r = content.worldExport('a', 'Mon monde', 'b');
ok(r.name === 'Mon monde', 'même nom si libre');
const out = path.join(dirOf('b'), 'saves', 'Mon monde');
ok(fs.readFileSync(path.join(out, 'region', 'r.0.0.mca'), 'utf8') === 'data' && fs.existsSync(path.join(out, 'level.dat')), 'fichiers copiés');
ok(!fs.existsSync(path.join(out, 'session.lock')), 'session.lock non copié');
ok(fs.existsSync(path.join(w, 'level.dat')), 'l’original reste');
ok(fs.readdirSync(dirOf('b')).every(x => !x.startsWith('.hydarium-export-')), 'pas de dossier temporaire');
ok(r.warn.includes('mods'), 'avertissement mods');

r = content.worldExport('a', 'Mon monde', 'b'); ok(r.name === 'Mon monde (2)', 'nom déjà pris → numéro');
ok(content.worldExport('a', 'Mon monde', 'c').warn === '' || !content.worldExport('a', 'Mon monde', 'c').warn.includes('plus récent'), 'monde pas plus récent');

assert.throws(() => content.worldExport('a', 'Mon monde', 'a'), /autre instance/); n++;
assert.throws(() => content.worldExport('a', '../x', 'b'), /invalide/); n++;
assert.throws(() => content.worldExport('a', 'Absent', 'b'), /introuvable/); n++;
fs.mkdirSync(path.join(dirOf('a'), 'saves', 'Vide')); assert.throws(() => content.worldExport('a', 'Vide', 'b'), /level\.dat/); n++;
current = { id: 'b' }; assert.throws(() => content.worldExport('a', 'Mon monde', 'b'), /Ferme Minecraft/); n++;
current = null;
fs.rmSync(root, { recursive: true, force: true });
console.log('worldexport.test.js : ' + n + ' vérifications OK');
