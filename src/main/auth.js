/* Connexion Microsoft → Xbox → Minecraft (via msmc). Le pseudo vient de Mojang, il n’est pas modifiable ici.
   Les jetons ne sont conservés que s’ils peuvent être chiffrés par le système (coffre Windows / Trousseau / keyring). */
const { Auth } = require('msmc');
const { safeStorage } = require('electron');
const store = require('./store');

let session = null;
const canSave = () => safeStorage.isEncryptionAvailable();
const enc = t => 'e:' + safeStorage.encryptString(t).toString('base64');
const dec = v => (v && v.startsWith('e:') ? safeStorage.decryptString(Buffer.from(v.slice(2), 'base64')) : null);
const pub = () => session && { name: session.name, uuid: session.uuid };

async function from(xbox) {
  const mc = await xbox.getMinecraft(); // échoue si le compte ne possède pas Minecraft Java
  session = { mclc: mc.mclc(), name: mc.profile.name, uuid: mc.profile.id };
  if (canSave()) { const d = store.get(); d.accounts[session.uuid] = { name: session.name, token: enc(xbox.save()) }; d.active = session.uuid; store.save(); }
  return pub();
}
exports.login = async () => from(await new Auth('select_account').launch('electron'));
exports.current = async () => {
  if (session) return pub();
  const d = store.get(), a = d.accounts[d.active];
  if (!a) return null;
  try { const t = dec(a.token); return t ? await from(await new Auth('select_account').refresh(t)) : null; } catch (e) { return null; }
};
exports.logout = () => { const d = store.get(); delete d.accounts[d.active]; d.active = null; store.save(); session = null; };
exports.mclc = () => { if (!session) throw new Error('Connecte-toi avec ton compte Microsoft pour jouer.'); return session.mclc; };
exports.token = () => { if (!session) throw new Error('Connecte-toi avec ton compte Microsoft.'); return session.mclc.access_token; };
