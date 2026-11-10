/* Données locales : comptes (jetons chiffrés) et instances. Écriture atomique. */
const fs = require('fs'), path = require('path');
let file, db = { accounts: {}, active: null, instances: [], servers: [], settings: { notif: true, minimize: false, autostart: false, wall: 'auto', theme: 'dark', mem: 4, java: '', javas: [], autoUpdate: true }, wizard: false };

/* Le client Hydarium (le mod en jeu) est OBLIGATOIRE : toute instance en a un, impossible à retirer ; seuls ses modules (FPS, CPS…) s'activent / se désactivent. */
const DEFAULT_MODULES = { fps: { on: true }, cps: { on: true }, keystrokes: { on: true }, coords: { on: true } };
exports.defaultClient = () => ({ on: true, modules: JSON.parse(JSON.stringify(DEFAULT_MODULES)) });
const forceClient = () => { let ch = false; for (const i of db.instances || []) { if (!i.client || typeof i.client !== 'object') { i.client = exports.defaultClient(); ch = true; } else if (i.client.on !== true) { i.client.on = true; ch = true; } } return ch; };
exports.init = dir => { file = path.join(dir, 'hydarium.json'); try { const p = JSON.parse(fs.readFileSync(file, 'utf8')); db = { ...db, ...p, settings: { ...db.settings, ...(p.settings || {}) } }; } catch (e) {} if (forceClient()) { try { save(); } catch (e) {} } };
const save = () => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file + '.tmp', JSON.stringify(db, null, 1)); fs.renameSync(file + '.tmp', file); };
exports.resetSettings = () => { db.settings = { notif: true, minimize: false, autostart: false, wall: 'auto', theme: 'dark', mem: 4, java: '', javas: [], autoUpdate: true }; db.wizard = false; save(); };
exports.get = () => db;
exports.save = save;
const addHooks = []; exports.onAdd = f => addHooks.push(f); // appelé après CHAQUE création d'instance (création, modpack, import, « Rejoindre un serveur »…)
exports.addInstance = ({ name, version, type, loader, mem }) => {
  const i = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: String(name).trim().slice(0, 40), version, type, loader: loader || 'vanilla', tags: [(loader || 'vanilla') === 'vanilla' ? 'Vanilla' : 'Moddé'], mods: [], mem: mem || db.settings.mem || 4, java: '', jvm: db.settings.defJvm || '', client: exports.defaultClient(), ...(db.settings.defResMode && db.settings.defResMode !== 'default' ? { res: { mode: db.settings.defResMode, w: db.settings.defW || 1280, h: db.settings.defH || 720 } } : {}), created: Date.now(), lastPlayed: 0, playtime: 0 };
  db.instances.push(i); save(); for (const f of addHooks) setImmediate(() => { try { f(i); } catch (e) {} }); // ex. fabrication du mod Hydarium de cette version, en arrière-plan
  return i;
};
exports.removeInstance = id => { db.instances = db.instances.filter(i => i.id !== id); save(); };
