/* Journaux : un fichier par jour pour le launcher, un fichier par lancement de jeu. Les jetons sont masqués. */
const fs = require('fs'), path = require('path');
const plat = require('./platform');
const dir = () => path.join(plat.dataDir(), 'logs');
const redact = s => String(s).replace(/(--accessToken[ =]+)\S+/gi, '$1***').replace(/(--(?:uuid|xuid|clientId)[ =]+)\S+/gi, '$1***').replace(/eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}/g, '***');
const fmt = a => a.map(x => x instanceof Error ? (x.stack || x.message) : typeof x === 'string' ? x : JSON.stringify(x)).join(' ');
const today = () => path.join(dir(), `launcher-${new Date().toISOString().slice(0, 10)}.log`);
function write(level, a) { try { fs.mkdirSync(dir(), { recursive: true }); fs.appendFileSync(today(), redact(`${new Date().toISOString()} [${level}] ${fmt(a)}`) + '\n'); } catch (e) {} }
exports.info = (...a) => write('INFO', a);
exports.warn = (...a) => write('WARN', a);
exports.error = (...a) => write('ERROR', a);
exports.dir = dir;
const newest = prefix => { try { const f = fs.readdirSync(dir()).filter(x => x.startsWith(prefix)).sort().pop(); return f ? path.join(dir(), f) : null; } catch (e) { return null; } };
const tail = (f, n) => { try { return fs.readFileSync(f, 'utf8').split('\n').slice(-n).join('\n'); } catch (e) { return '(vide)'; } };
/* days <= 0 : on ne supprime jamais rien. Défaut : 14 jours. */
exports.rotate = (days = 14) => { if (!(days > 0)) return; try { for (const f of fs.readdirSync(dir())) { const p = path.join(dir(), f); if (Date.now() - fs.statSync(p).mtimeMs > days * 864e5) fs.rmSync(p, { force: true }); } } catch (e) {} };
/* journal d’un lancement de jeu : { file, write(texte) } */
exports.gameLog = name => {
  const file = path.join(dir(), `game-${String(name).replace(/[^\w-]+/g, '_').slice(0, 30)}-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
  fs.mkdirSync(dir(), { recursive: true });
  return { file, write: s => { try { s = redact(String(s)); fs.appendFileSync(file, s.endsWith('\n') ? s : s + '\n'); } catch (e) {} } };
};
/* rapport prêt à coller dans une demande d’aide */
exports.report = () => { const g = newest('game-'), l = newest('launcher-'); return `Hydarium ${require('electron').app.getVersion()} · ${plat.id} ${process.arch}\n\n--- launcher (200 dernières lignes) ---\n${l ? tail(l, 200) : '(aucun)'}\n\n--- dernier lancement du jeu (150 dernières lignes) ---\n${g ? g + '\n' + tail(g, 150) : '(aucun)'}`; };
