/* Connexion Microsoft → Xbox → Minecraft (via msmc). Le pseudo vient de Mojang, il n’est pas modifiable ici.
   Les jetons ne sont conservés que s’ils peuvent être chiffrés par le système (coffre Windows / Trousseau / keyring).

   Pourquoi la connexion « sautait » (0.10.6x), toutes ces causes sont traitées ici :
   1. au démarrage, la moindre erreur passagère (réseau pas encore prêt, serveur Xbox / Mojang qui répond 429 ou 5xx) donnait « non connecté » ; la liaison enregistrée est maintenant GARDÉE,
      le compte reste affiché (offline: true) et le renouvellement est réessayé en arrière-plan ; seul un refus définitif de Microsoft (jeton révoqué ou expiré) déconnecte vraiment ;
   2. le jeton Minecraft ne dure que ~23 h mais la session gardée en mémoire n’était jamais renouvelée : après une journée d’ouverture, lancement du jeu et skins échouaient (« session expirée ») ;
      ensure() renouvelle à la demande, juste avant d’en avoir besoin ;
   3. quand Mojang répond mal à la lecture du profil, msmc invente un profil provisoire (pseudo = gamertag, identifiant ≠ UUID Minecraft) : l’ancien code créait alors un AUTRE compte
      et le rendait actif ; l’identité déjà connue est maintenant conservée ;
   4. msmc rejette avec des objets simples (pas des Error) : l’interface affichait un message vide ; ils sont maintenant traduits en phrases claires ;
   5. msmc n’a aucun délai d’attente : un réseau qui ne répond jamais bloquait le démarrage ; chaque tentative est limitée. */
const { Auth } = require('msmc');
const { safeStorage } = require('electron');
const store = require('./store'), log = require('./log');

const T = { sleep: ms => new Promise(r => setTimeout(r, ms)), limit: 25000, first: 12000, again: [4e3, 15e3, 45e3, 120e3, 300e3, 600e3] };   // réglages (les tests les remplacent)
let session = null;    // { mc, xbox, name, uuid } : connecté, jetons frais
let pending = null;    // { uuid, name, token } : compte connu dont le renouvellement a échoué pour une cause passagère
let timer = null, tries = 0, onChange = () => {};

const canSave = () => { try { return safeStorage.isEncryptionAvailable(); } catch (e) { return false; } };
const enc = t => 'e:' + safeStorage.encryptString(t).toString('base64');
const dec = v => (v && v.startsWith('e:') ? safeStorage.decryptString(Buffer.from(v.slice(2), 'base64')) : null);
const pub = () => session ? { name: session.name, uuid: session.uuid } : pending ? { name: pending.name, uuid: pending.uuid, offline: true } : null;

/* 'net' (pas de réseau, délai dépassé) et 'busy' (429, 5xx) sont passagers ; le reste est un refus : il faut se reconnecter */
const kind = e => {
  const st = e && e.response && e.response.status;
  if (st) return st === 429 || st >= 500 ? 'busy' : 'denied';
  const c = String(e && (e.code || e.errno) || ''), m = String(e && e.message || '');
  if ((e && e.type === 'system') || /^(ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH|ECONNABORTED|EPIPE|ERR_NETWORK)$/.test(c) || /network|socket hang up|timed? ?out|getaddrinfo|fetch failed/i.test(m)) return 'net';
  return 'denied';
};
const why = e => e && e.response ? 'HTTP ' + e.response.status + (e.ts ? ' (' + e.ts + ')' : '') : String(e && (e.message || e.code || e.ts) || e);
const MSG = [
  ['error.gui.closed', 'Connexion annulée : la fenêtre Microsoft a été fermée.'],
  ['error.auth.xsts.userNotFound', 'Ce compte Microsoft n’a pas de profil Xbox. Crée-en un gratuitement sur xbox.com, puis réessaie.'],
  ['error.auth.xsts.bannedCountry', 'Xbox Live n’est pas disponible dans le pays de ce compte.'],
  ['error.auth.xsts.child', 'Ce compte enfant doit d’abord être ajouté à une famille Microsoft par un adulte.'],
  ['error.auth.minecraft', 'Ce compte Microsoft ne semble pas posséder Minecraft Java.'],
];
function friendly(e) {   // msmc rejette avec des chaînes ou des objets { response, ts } (jamais de .message), et le réseau avec des erreurs en anglais
  const ts = String(typeof e === 'string' ? e : e && e.ts || ''), k = kind(e), hit = MSG.find(([p]) => ts.startsWith(p));
  if (hit && k === 'denied') return new Error(hit[1]);
  if (k === 'net') return new Error('Impossible de joindre les serveurs Microsoft : vérifie ta connexion Internet, puis réessaie.');
  if (k === 'busy') return new Error('Les serveurs Microsoft ou Mojang sont surchargés pour le moment. Réessaie dans un instant.');
  if (e instanceof Error && !ts) return e;   // erreur ordinaire (disque, etc.) : son message est déjà le bon
  return new Error('Connexion Microsoft refusée' + (ts ? ' (' + ts + ')' : '') + '. Reconnecte-toi.');
}
const within = (p, ms, what) => new Promise((ok, ko) => { const t = setTimeout(() => ko({ code: 'ETIMEDOUT', message: what + ' : délai dépassé' }), ms); p.then(v => { clearTimeout(t); ok(v); }, e => { clearTimeout(t); ko(e); }); });

/* un profil Minecraft authentique a un identifiant de 32 caractères hexadécimaux ; le profil provisoire de msmc n’en a pas */
const realId = p => !!p && /^[0-9a-f]{32}$/i.test(String(p.id || ''));
async function minecraft(xbox, known) {
  let mc = await xbox.getMinecraft(); // échoue si le compte ne possède pas Minecraft Java
  for (let n = 0; known && !realId(mc.profile) && n < 2; n++) { await T.sleep(1500 * (n + 1)); mc = await xbox.getMinecraft(); }
  return mc;
}
function persist() {
  if (!session) return;
  if (!canSave()) { log.warn('Connexion Microsoft : chiffrement du système indisponible, la connexion ne sera pas retenue au prochain démarrage.'); return; }
  const d = store.get(); d.accounts[session.uuid] = { name: session.name, token: enc(session.xbox.save()) }; d.active = session.uuid; store.save();
}
async function from(xbox, known) {
  const mc = await minecraft(xbox, known);
  let name = mc.profile.name, uuid = mc.profile.id;
  if (known && !realId(mc.profile)) { name = known.name; uuid = known.uuid; log.warn('Connexion Microsoft : profil Minecraft momentanément indisponible, identité conservée (' + known.name + ').'); }
  session = { mc, xbox, name, uuid }; pending = null; tries = 0; clearTimeout(timer); timer = null;
  persist();
  return pub();
}
const attempt = (known, ms) => within((async () => from(await new Auth('select_account').refresh(known.token), known))(), ms || T.limit, 'Renouvellement Microsoft');
const stored = () => {
  const d = store.get(), a = d.accounts[d.active]; if (!a) return null;
  try { const t = dec(a.token); return t ? { uuid: d.active, name: a.name, token: t } : null; }
  catch (e) { log.warn('Connexion Microsoft : jeton enregistré illisible (' + why(e) + ') : il faudra te reconnecter.'); return null; }
};

/* nouvel essai en arrière-plan tant que le compte est « hors ligne » : 4 s, 15 s, 45 s, 2 min, 5 min, 10 min */
function schedule() {
  clearTimeout(timer); timer = null; if (!pending || tries >= T.again.length) return;
  timer = setTimeout(async () => {
    timer = null; if (!pending) return;
    try { onChange(await attempt(pending)); log.info('Connexion Microsoft rétablie.'); }
    catch (e) { const k = kind(e); log.warn('Connexion Microsoft : nouvel essai (' + k + ') ' + why(e)); if (k === 'denied') { pending = null; onChange(null); } else schedule(); }
  }, T.again[tries++]);
  if (timer.unref) timer.unref();
}

exports.name = () => session ? session.name : pending ? pending.name : '';   // pseudo Minecraft du compte connecté (présence des amis)
exports.onChange = f => { onChange = typeof f === 'function' ? f : () => {}; };
exports.login = async () => { try { return await from(await new Auth('select_account').launch('electron'), null); } catch (e) { log.warn('Connexion Microsoft : ' + why(e)); throw friendly(e); } };
exports.current = async () => {
  if (session || pending) return pub();
  const known = stored(); if (!known) return null;
  try { return await attempt(known, T.first); }
  catch (e) {
    const k = kind(e); log.warn('Connexion Microsoft : renouvellement impossible au démarrage (' + k + ') ' + why(e));
    if (k === 'denied') return null;                   // refus définitif : la liaison enregistrée est inutilisable
    pending = known; tries = 0; schedule(); return pub();   // passager : on reste connecté et on réessaie
  }
};
exports.logout = () => { const d = store.get(); delete d.accounts[d.active]; d.active = null; store.save(); session = null; pending = null; clearTimeout(timer); timer = null; };

/* À appeler JUSTE AVANT d'avoir besoin d'un jeton (lancement du jeu, skins) : renouvelle s'il expire, sinon ne fait rien. Renvoie l'objet « mclc » du jeu. */
const fresh = s => !!s && s.mc.exp - 5 * 60e3 > Date.now();
const mclcOf = s => ({ ...s.mc.mclc(), uuid: s.uuid, name: s.name });   // identité de confiance (voir plus haut, cause 3)
exports.ensure = async () => {
  if (!session && !pending) { const k = stored(); if (k) pending = k; }
  if (!session && !pending) throw new Error('Connecte-toi avec ton compte Microsoft pour jouer.');
  if (!fresh(session)) {
    const known = session ? { uuid: session.uuid, name: session.name, token: session.xbox.save() } : pending; let last;
    for (let i = 0; i < 3; i++) {
      try { await attempt(known); last = null; break; }
      catch (e) { last = e; log.warn('Connexion Microsoft : renouvellement avant usage (' + kind(e) + ') ' + why(e)); if (kind(e) === 'denied') break; if (i < 2) await T.sleep(1500 * (i + 1)); }
    }
    if (last) {
      if (kind(last) === 'denied') { session = null; pending = null; clearTimeout(timer); timer = null; onChange(null); throw new Error('Ta connexion Microsoft a expiré ou a été refusée : reconnecte-toi (Profil › Se connecter).'); }
      throw friendly(last);
    }
  }
  return mclcOf(session);
};
exports.mclc = () => { if (!session) throw new Error('Connecte-toi avec ton compte Microsoft pour jouer.'); return mclcOf(session); };
exports.token = () => { if (!session) throw new Error('Connecte-toi avec ton compte Microsoft.'); return session.mc.mcToken; };
exports.freshToken = async () => (await exports.ensure()).access_token;
T.stop = () => { session = null; pending = null; clearTimeout(timer); timer = null; };   // pour les tests : coupe tout nouvel essai en arrière-plan
exports._test = T;
