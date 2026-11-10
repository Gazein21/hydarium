/* Pont local entre le launcher et le futur client en jeu (agent Java / mod) : HTTP sur 127.0.0.1, jeton aléatoire par session. */
const http = require('http'), crypto = require('crypto');
let srv = null, info = null; const routes = {};
exports.route = (method, path, fn) => { routes[method + ' ' + path] = fn; };
exports.start = () => new Promise((res, rej) => {
  if (info) return res(info);
  const token = crypto.randomBytes(16).toString('hex');
  srv = http.createServer((req, rsp) => {
    const send = (c, o) => { rsp.writeHead(c, { 'Content-Type': 'application/json' }); rsp.end(JSON.stringify(o)); };
    try {
      if (req.headers.authorization !== 'Bearer ' + token) return send(401, { error: 'jeton invalide' });
      if (!/^127\.0\.0\.1:\d+$/.test(req.headers.host || '')) return send(403, { error: 'hôte refusé' });
      const u = new URL(req.url, 'http://127.0.0.1'), f = routes[req.method + ' ' + u.pathname]; if (!f) return send(404, { error: 'inconnu' });
      let body = ''; req.on('data', d => { body += d; if (body.length > 65536) req.destroy(); });
      req.on('end', async () => { try { send(200, (await f(Object.fromEntries(u.searchParams), body ? JSON.parse(body) : {})) || { ok: true }); } catch (e) { send(400, { error: e.message }); } });
    } catch (e) { send(500, { error: 'erreur' }); }
  });
  srv.on('error', rej); srv.listen(0, '127.0.0.1', () => { info = { port: srv.address().port, token }; res(info); });
});
exports.stop = () => { if (srv) { srv.close(); srv = null; info = null; } };
