/* Spotify : connexion directe au compte (OAuth PKCE, sans mot de passe ni secret). Il faut un « Client ID » gratuit (developer.spotify.com)
   avec l’adresse de redirection http://127.0.0.1:53682/callback. Lecture : tous les comptes ; commandes (pause, suivant) : Spotify Premium. */
const http = require('http'), crypto = require('crypto');
const { shell, safeStorage } = require('electron');
const store = require('./store');
const PORT = 53682, REDIRECT = `http://127.0.0.1:${PORT}/callback`, SCOPE = 'user-read-playback-state user-modify-playback-state user-read-currently-playing';
let tok = null; const cid = () => (store.get().settings.spotifyId || '').trim();
const getRt = () => { const r = store.get().spotifyRt; if (!r) return ''; try { return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(r, 'base64')) : r; } catch (e) { return ''; } };
const setRt = t => { store.get().spotifyRt = t ? (safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(t).toString('base64') : t) : ''; store.save(); };
exports.status = () => ({ configured: !!cid(), connected: !!getRt(), redirect: REDIRECT });
async function token(body) {
  const r = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: cid(), ...body }), signal: AbortSignal.timeout(15000) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error('Spotify : ' + (j.error_description || j.error || r.status));
  tok = { access: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 }; if (j.refresh_token) setRt(j.refresh_token);
}
exports.login = () => new Promise((res, rej) => {
  if (!cid()) return rej(new Error('Renseigne d’abord ton Client ID Spotify.'));
  const verifier = crypto.randomBytes(48).toString('base64url'), challenge = crypto.createHash('sha256').update(verifier).digest('base64url'), state = crypto.randomBytes(8).toString('hex');
  const srv = http.createServer(async (req, rsp) => {
    const u = new URL(req.url, 'http://127.0.0.1'); if (u.pathname !== '/callback') { rsp.end(); return; }
    rsp.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); rsp.end('<body style="font-family:sans-serif;background:#10131a;color:#fff;text-align:center;padding-top:90px"><h2>Spotify connecté ✓</h2><p>Tu peux fermer cet onglet et revenir à Hydarium.</p></body>');
    clearTimeout(to); srv.close();
    try { if (u.searchParams.get('state') !== state) throw new Error('Réponse Spotify invalide.'); const code = u.searchParams.get('code'); if (!code) throw new Error('Connexion refusée.'); await token({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, code_verifier: verifier }); res(true); } catch (e) { rej(e); }
  });
  srv.on('error', () => rej(new Error('Le port ' + PORT + ' est occupé : ferme ce qui l’utilise puis réessaie.')));
  const to = setTimeout(() => { srv.close(); rej(new Error('Délai dépassé : connexion annulée.')); }, 180000);
  srv.listen(PORT, '127.0.0.1', () => shell.openExternal('https://accounts.spotify.com/authorize?' + new URLSearchParams({ client_id: cid(), response_type: 'code', redirect_uri: REDIRECT, scope: SCOPE, state, code_challenge_method: 'S256', code_challenge: challenge })));
});
exports.logout = () => { tok = null; setRt(''); };
async function access() { if (tok && tok.exp > Date.now()) return tok.access; const rt = getRt(); if (!rt) throw new Error('Spotify n’est pas connecté.'); await token({ grant_type: 'refresh_token', refresh_token: rt }); return tok.access; }
const api = async (p, method = 'GET') => { const r = await fetch('https://api.spotify.com/v1' + p, { method, headers: { Authorization: 'Bearer ' + await access() }, signal: AbortSignal.timeout(10000) }); if (r.status === 403) throw new Error('Cette commande demande Spotify Premium.'); if (r.status === 404) throw new Error('Aucun appareil Spotify actif : lance la lecture sur un appareil.'); if (r.status === 204) return null; if (!r.ok) throw new Error('Spotify indisponible (' + r.status + ').'); return method === 'GET' ? r.json() : null; };
exports.get = async () => { const j = await api('/me/player'); if (!j || !j.item) return null; const im = (j.item.album && j.item.album.images || [])[1] || (j.item.album && j.item.album.images || [])[0]; return { title: j.item.name, artist: (j.item.artists || []).map(a => a.name).join(', '), app: 'Spotify', playing: !!j.is_playing, art: im && /^https:\/\/i\.scdn\.co\//.test(im.url) ? im.url : '' }; };
exports.act = async c => { if (c === 'next') await api('/me/player/next', 'POST'); else if (c === 'prev') await api('/me/player/previous', 'POST'); else if (c === 'playpause') { const s = await api('/me/player'); await api(s && s.is_playing ? '/me/player/pause' : '/me/player/play', 'PUT'); } return exports.get(); };
