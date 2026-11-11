/* hud.setGame : l'état du jeu envoyé par le mod doit être pris en compte. Régression : le mod envoyait « menu:1 » pour dire « mon menu en jeu existe »,
   or « menu » veut dire « le joueur est dans un menu, pas dans un monde » : le launcher jetait alors tout l'état (FPS, widgets dessinés…) et le HUD externe doublait celui du jeu. */
const test = require('node:test'), assert = require('node:assert'), path = require('path');
const stub = (name, exp) => { const f = require.resolve(name); require.cache[f] = { id: f, filename: f, loaded: true, exports: exp }; };
const src = path.join(__dirname, '..', 'src', 'main');
stub('electron', { BrowserWindow: class {}, screen: {}, app: {}, globalShortcut: {}, shell: {} });
for (const m of ['fg', 'input', 'media', 'store']) stub(path.join(src, m + '.js'), { get: () => ({ instances: [] }) });
const hud = require(path.join(src, 'hud.js'));
const world = (extra = {}) => ({ fps: 143, x: 1, y: 64, z: 2, yaw: 0, pitch: 0, dim: 'overworld', hp: 20, food: 20, armor: [], fx: [], drawn: ['fps', 'music'], ed: 1, ...extra });

test('état de jeu normal : pris en compte', () => { hud.setGame(world()); assert.strictEqual(hud.gameDraws(), true); });
test('menu Hydarium en jeu annoncé (gmenu) : l’état de jeu est bien pris en compte', () => { hud.setGame(world({ gmenu: 1, fps: 90, drawn: ['fps'] })); assert.strictEqual(hud.gameDraws(), true, 'gameDraws doit rester vrai'); assert.strictEqual(hud.gameState().fps, 90, 'le NOUVEL état doit avoir été pris (pas l’ancien)'); assert.deepStrictEqual(hud.gameState().drawn, ['fps']); });
test('hors monde (menu:1) : seulement l’écran, pas d’état de jeu', () => {
  hud.setGame(world({ fps: 11, drawn: ['fps'] })); hud.setGame({ menu: 1, fps: 999, scr: 'resourcepacks' });
  assert.strictEqual(hud.gameState().fps, 11, 'un message hors monde ne doit pas écraser l’état de jeu par des zéros');
});

test('fenêtre transparente du launcher : cachée quand le mod dessine tout, sauf pour les boutons « télécharger des packs »', () => {
  hud.setGame(world({ fps: 70 })); hud.setDpWidget(false); assert.strictEqual(hud.needsWindow(), false, 'le jeu dessine tout : aucune surcouche');
  hud.setDpWidget(true); assert.strictEqual(hud.needsWindow(), true, 'bouton « data packs » à afficher'); hud.setDpWidget(false);
  hud.setGame(world({ ed: 0 })); assert.strictEqual(hud.needsWindow(), true, 'mod sans éditeur en jeu (ancienne version) : le HUD du launcher reste le repli');
  hud.setGame(world({ drawn: [] })); assert.strictEqual(hud.needsWindow(), true, 'mod qui ne dessine rien : le HUD du launcher reste le repli');
});
