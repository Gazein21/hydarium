/* « Code peer-to-peer dans le champ d'adresse » : le mod (Mixin sur la lecture de l'adresse) envoie ici le code tapé dans le jeu ;
   on ouvre (ou retrouve) le port local de cette invitation et on répond « 127.0.0.1:port ». Même mécanique que la page « Rejoindre » du launcher. */
const p2p = require('./p2p');
exports.open = async (code, deps = {}) => {
  const P = deps.p2p || p2p, norm = P.normalize(code);
  if (!norm) throw new Error('Code d’invitation invalide.');
  let hosts = []; try { hosts = (deps.store || require('./store')).get().hosts || []; } catch (e) {}
  const avoid = hosts.map(h => +h.port).filter(Boolean);        // jamais le port d'un de MES serveurs
  const r = await P.join(norm, { avoid });
  return { ok: true, port: r.port, addr: '127.0.0.1:' + r.port, code: norm };
};
