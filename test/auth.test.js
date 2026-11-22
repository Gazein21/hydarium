/* Connexion Microsoft : on ne doit plus être « déconnecté » à cause d'un souci passager (réseau, serveurs surchargés, délai), le jeton Minecraft (~23 h) est renouvelé à la demande,
   un profil provisoire de msmc ne crée plus un autre compte, et les erreurs deviennent des phrases lisibles. Tout est simulé (faux msmc, faux coffre du système), aucun accès réseau. */
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path'), Module = require('module');
const UUID = '0123456789abcdef0123456789abcdef', H23 = 23 * 3600e3;
let S, db, logs;   // S : scénario de la faute en cours
const mkMc = (o = {}) => ({ profile: { id: UUID, name: 'Steve', ...(o.profile || {}) }, exp: o.exp || Date.now() + H23, mcToken: o.tok || 'mc-' + (++S.n), mclc() { return { access_token: this.mcToken, uuid: this.profile.id, name: this.profile.name, meta: { type: 'msa' } }; } });
const mkXbox = rt => ({ save: () => rt, getMinecraft: async () => { S.mcCalls++; return S.mc(); } });
class FakeAuth {
  constructor(p) { this.p = p; }
  async refresh(t) { S.refreshes.push(t); const r = await S.refresh(t); return mkXbox('rt-' + S.refreshes.length); }
  async launch() { return mkXbox('rt-login'); }
}
const stubs = {
  msmc: { Auth: FakeAuth },
  electron: { safeStorage: { isEncryptionAvailable: () => S.enc, encryptString: s => Buffer.from('X' + s), decryptString: b => { const t = b.toString(); if (!t.startsWith('X')) throw new Error('illisible'); return t.slice(1); } } },
  './store': { get: () => db, save: () => { S.saves++; } },
  './log': { info: (...a) => logs.push(['info', a.join(' ')]), warn: (...a) => logs.push(['warn', a.join(' ')]), error: (...a) => logs.push(['error', a.join(' ')]) },
};
const load0 = Module._load; Module._load = function (r, ...a) { return stubs[r] || load0.call(this, r, ...a); };
const AUTH = require.resolve('../src/main/auth');
function fresh(over = {}) {
  S = { enc: true, n: 0, saves: 0, mcCalls: 0, refreshes: [], refresh: async () => {}, mc: () => mkMc(), ...over };
  db = { accounts: { [UUID]: { name: 'Steve', token: 'e:' + Buffer.from('Xrt-0').toString('base64') } }, active: UUID, instances: [] }; logs = [];
  delete require.cache[AUTH]; const a = require(AUTH); a._test.sleep = async () => {}; a._test.again = [5, 5, 5]; return a;
}
const netErr = () => Object.assign(new Error('request to https://login.live.com failed, reason: getaddrinfo ENOTFOUND login.live.com'), { type: 'system', code: 'ENOTFOUND' });
const http = (status, ts) => ({ response: { ok: false, status }, ts: ts || 'error.auth.microsoft' });
const until = (a, n = 40) => new Promise((ok, ko) => { let k = 0; const t = setInterval(() => { if (a()) { clearInterval(t); ok(); } else if (++k > n) { clearInterval(t); ko(new Error('délai dépassé')); } }, 10); });

test('démarrage normal : connecté, jeton renouvelé et rechiffré (la liaison suit la rotation du jeton)', async () => {
  const a = fresh(); const r = await a.current();
  assert.deepStrictEqual(r, { name: 'Steve', uuid: UUID }); assert.deepStrictEqual(S.refreshes, ['rt-0']);
  assert.strictEqual(Buffer.from(db.accounts[UUID].token.slice(2), 'base64').toString(), 'Xrt-1', 'nouveau jeton enregistré'); assert.strictEqual(db.active, UUID);
});

test('réseau absent au démarrage : on RESTE connecté (hors ligne), la liaison est gardée, puis rétablie toute seule', async () => {
  const a = fresh({ refresh: async () => { throw netErr(); } }); let evt = null; a.onChange(x => { evt = x; });
  const r = await a.current(); assert.deepStrictEqual(r, { name: 'Steve', uuid: UUID, offline: true }, 'pas « déconnecté »');
  assert.ok(db.accounts[UUID] && db.active === UUID, 'compte et jeton conservés');
  S.refresh = async () => {}; await until(() => evt);   // le réseau revient : l'essai en arrière-plan réussit
  assert.deepStrictEqual(evt, { name: 'Steve', uuid: UUID }); assert.ok(!('offline' in evt)); assert.deepStrictEqual(await a.current(), { name: 'Steve', uuid: UUID }); a._test.stop();
});

test('serveurs surchargés (429, 503, 502) : même chose, ce n’est pas une déconnexion', async () => {
  for (const st of [429, 503, 502]) { const a = fresh({ refresh: async () => { throw http(st); } }); assert.strictEqual((await a.current()).offline, true, 'HTTP ' + st); a._test.stop(); }
});

test('délai dépassé (réseau qui ne répond jamais) : le démarrage n’est pas bloqué', async () => {
  const a = fresh({ refresh: () => new Promise(() => {}) }); a._test.first = 30; const t = Date.now(); const r = await a.current();
  assert.strictEqual(r.offline, true); assert.ok(Date.now() - t < 1000, 'rendu en ' + (Date.now() - t) + ' ms'); a._test.stop();
});

test('refus définitif de Microsoft (jeton révoqué) : déconnecté, avec la raison dans les journaux ; rien n’est effacé en silence', async () => {
  for (const e of [http(400), http(401), http(403, 'error.auth.xsts.child')]) { const a = fresh({ refresh: async () => { throw e; } }); assert.strictEqual(await a.current(), null); assert.ok(db.accounts[UUID]); assert.ok(logs.some(l => l[0] === 'warn' && /HTTP 4\d\d/.test(l[1])), 'raison journalisée'); }
});

test('jeton enregistré illisible (clé du système changée) : déconnecté proprement, journalisé', async () => {
  const a = fresh(); db.accounts[UUID].token = 'e:' + Buffer.from('zzz').toString('base64'); assert.strictEqual(await a.current(), null); assert.ok(logs.some(l => /illisible/.test(l[1])));
  const b = fresh(); db.active = null; assert.strictEqual(await b.current(), null);
});

test('jeton Minecraft expiré (> 23 h d’ouverture) : ensure() le renouvelle avant le lancement / les skins, sans reconnexion', async () => {
  let first = true; const a = fresh({ mc: () => { if (first) { first = false; return mkMc({ exp: Date.now() - 1000, tok: 'vieux' }); } return mkMc({ tok: 'neuf' }); } });
  await a.current(); assert.strictEqual(a.token(), 'vieux');
  const m = await a.ensure(); assert.strictEqual(m.access_token, 'neuf'); assert.strictEqual(m.name, 'Steve'); assert.strictEqual(S.refreshes.length, 2, 'renouvelé avec le jeton enregistré');
  assert.strictEqual(S.refreshes[1], 'rt-1', 'on réutilise le dernier jeton de liaison'); assert.strictEqual(await a.freshToken(), 'neuf'); assert.strictEqual(S.refreshes.length, 2, 'valide : pas de nouveau renouvellement');
});

test('ensure() : jeton valide = aucun appel réseau ; trois essais sur un souci passager ; messages clairs', async () => {
  const a = fresh(); await a.current(); const n = S.refreshes.length; await a.ensure(); await a.ensure(); assert.strictEqual(S.refreshes.length, n, 'rien à renouveler');
  const b = fresh({ mc: () => mkMc({ exp: Date.now() - 1 }) }); await b.current(); let k = 0; S.refresh = async () => { if (++k < 3) throw http(503); };
  S.mc = () => mkMc(); assert.ok((await b.ensure()).access_token, 'réussi au 3ᵉ essai'); assert.strictEqual(k, 3);
  const c = fresh({ mc: () => mkMc({ exp: Date.now() - 1 }) }); await c.current(); S.refresh = async () => { throw netErr(); };
  await assert.rejects(c.ensure(), /Impossible de joindre les serveurs Microsoft/);
  const d = fresh({ mc: () => mkMc({ exp: Date.now() - 1 }) }); let off = 'pas appelé'; d.onChange(x => { off = x; }); await d.current(); S.refresh = async () => { throw http(400); };
  await assert.rejects(d.ensure(), /expiré ou a été refusée : reconnecte-toi/); assert.strictEqual(off, null, 'l’interface est prévenue'); await assert.rejects(d.ensure(), /expiré|Connecte-toi/);
});

test('ensure() sans jamais avoir appelé current() (lancement très tôt) et sans compte', async () => {
  const a = fresh(); assert.ok((await a.ensure()).access_token, 'compte retrouvé dans le coffre'); const b = fresh(); db.active = null; await assert.rejects(b.ensure(), /Connecte-toi avec ton compte Microsoft/);
});

test('profil provisoire de msmc (Mojang répond mal) : l’identité connue est gardée, aucun AUTRE compte n’est créé', async () => {
  const bogus = () => mkMc({ profile: { id: 'a1b2c3d4-0000-1111-2222-333344445555', name: 'GamerTag123' } });
  const a = fresh({ mc: bogus }); const r = await a.current();
  assert.deepStrictEqual(r, { name: 'Steve', uuid: UUID }); assert.deepStrictEqual(Object.keys(db.accounts), [UUID], 'pas de second compte'); assert.strictEqual(db.active, UUID);
  assert.strictEqual(S.mcCalls, 3, 'réessayé avant d’abandonner'); assert.strictEqual(a.mclc().name, 'Steve'); assert.strictEqual(a.mclc().uuid, UUID, 'le jeu reçoit le vrai pseudo et le vrai UUID'); assert.ok(logs.some(l => /momentanément indisponible/.test(l[1])));
  const b = fresh({ mc: (() => { let k = 0; return () => ++k < 2 ? bogus() : mkMc(); })() }); assert.deepStrictEqual(await b.current(), { name: 'Steve', uuid: UUID }); assert.strictEqual(S.mcCalls, 2, 'le 2ᵉ essai a le vrai profil');
  const c = fresh({ mc: bogus }); db.accounts = {}; db.active = null; const l = await c.login(); assert.strictEqual(l.name, 'GamerTag123', 'première connexion (Game Pass sans profil) : comportement d’avant conservé');
});

test('connexion : messages lisibles pour chaque échec (msmc ne renvoie jamais d’Error)', async () => {
  const cases = [['error.gui.closed', /fenêtre Microsoft a été fermée/], [http(403, 'error.auth.xsts.userNotFound'), /pas de profil Xbox/], [http(403, 'error.auth.xsts.child'), /compte enfant/], [http(403, 'error.auth.xsts.bannedCountry'), /pays/],
    [http(403, 'error.auth.minecraft.login'), /posséder Minecraft/], [http(429), /surchargés/], [netErr(), /vérifie ta connexion Internet/], [http(400), /Connexion Microsoft refusée/]];
  const launch0 = FakeAuth.prototype.launch;
  try { for (const [e, re] of cases) { const a = fresh(); FakeAuth.prototype.launch = async () => { throw e; }; await assert.rejects(a.login(), err => err instanceof Error && re.test(err.message), String(e && e.ts || e)); } }
  finally { FakeAuth.prototype.launch = launch0; }
  const a = fresh(); db.accounts = {}; db.active = null; assert.deepStrictEqual(await a.login(), { name: 'Steve', uuid: UUID }); assert.strictEqual(Buffer.from(db.accounts[UUID].token.slice(2), 'base64').toString(), 'Xrt-login');
});

test('coffre du système indisponible : on peut jouer cette session, rien n’est écrit sur le disque, c’est dit dans les journaux', async () => {
  const a = fresh({ enc: false }); db.accounts = {}; db.active = null; assert.deepStrictEqual(await a.login(), { name: 'Steve', uuid: UUID }); assert.deepStrictEqual(db.accounts, {}); assert.ok(logs.some(l => /chiffrement du système indisponible/.test(l[1])));
  assert.ok((await a.ensure()).access_token);
});

test('déconnexion : tout est oublié, plus de nouvel essai en arrière-plan', async () => {
  const a = fresh({ refresh: async () => { throw netErr(); } }); let evt = 'rien'; a.onChange(x => { evt = x; }); await a.current(); a.logout();
  assert.deepStrictEqual(db.accounts, {}); assert.strictEqual(db.active, null); S.refresh = async () => {}; await new Promise(r => setTimeout(r, 60)); assert.strictEqual(evt, 'rien', 'aucun essai après la déconnexion'); assert.strictEqual(await a.current(), null);
});

test('branchements : le jeu et les skins demandent un jeton frais, l’interface est prévenue', () => {
  const r = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  assert.ok(/const authorization = await auth\.ensure\(\)/.test(r('src/main/game.js')) && !/auth\.mclc\(\)/.test(r('src/main/game.js')));
  assert.ok(/await auth\.freshToken\(\)/.test(r('src/main/skins.js')) && !/auth\.token\(\)/.test(r('src/main/skins.js')));
  assert.ok(/auth\.onChange\(a => send\('auth:state', a\)\)/.test(r('src/main/main.js')) && r('src/preload.js').includes("'auth:state'") && /hyd\.on\('auth:state'/.test(r('src/renderer/app.js')));
});
