/* Réglages de l'éditeur en jeu → configuration de l'instance : tout est revalidé et borné. */
const assert = require('assert'), L = require('../src/main/layoutsync.js');
let n = 0; const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };
const IDS = ['fps', 'armor', 'keystrokes'];
let mods = { fps: { on: true } };
eq(L.apply(mods, { fps: { pos: { x: 0.31234567, y: 0.5 }, scale: 1.234, opacity: 0.456, bg: false, color: '#FFFF55', show: 'icon,name' } }, IDS), true, 'réglages valides acceptés');
eq(mods.fps, { on: true, pos: { x: 0.3123, y: 0.5 }, scale: 1.23, opacity: 0.46, bg: false, color: '#ffff55', show: 'icon,name' }, 'arrondis, couleur en minuscules, le reste du module conservé');
eq(L.apply(mods, { fps: { pos: { x: 0.3123, y: 0.5 }, scale: 1.23 } }, IDS), false, 'mêmes valeurs : rien à réécrire');
mods = {}; L.apply(mods, { fps: { pos: { x: -5, y: 9 }, scale: 99, opacity: 0 } }, IDS); eq(mods.fps, { pos: { x: 0, y: 1 }, scale: 3, opacity: 0.1 }, 'valeurs bornées');
mods = {}; eq(L.apply(mods, { evil: { scale: 2 }, __proto__x: { scale: 2 } }, IDS), false, 'module inconnu refusé'); eq(mods, {}, '…et rien créé');
mods = { fps: { on: true } }; L.apply(mods, { fps: { pos: { x: 'a', y: 0.2 }, scale: 'big', opacity: NaN, bg: 'yes', color: 'red', show: '<script>' } }, IDS); eq(mods.fps, { on: true }, 'valeurs de mauvais type ou dangereuses ignorées');
mods = {}; L.apply(mods, { fps: { color: '#12345', show: 'a'.repeat(50) } }, IDS); eq(mods, {}, 'couleur trop courte et liste trop longue ignorées');
for (const bad of [null, undefined, 'x', 5, [], { fps: null }, { fps: [] }, { fps: 'x' }]) { mods = {}; eq(L.apply(mods, bad, IDS), false, 'entrée absurde ignorée : ' + JSON.stringify(bad)); }
eq(L.apply(null, { fps: { scale: 2 } }, IDS), false, 'pas de modules : ignoré');
mods = { armor: { on: true, show: 'name' } }; L.apply(mods, { armor: { show: '' } }, IDS); eq(mods.armor.show, '', 'liste vide = tout afficher (permis)');
console.log('layoutsync.test.js : ' + n + ' contrôles OK');
