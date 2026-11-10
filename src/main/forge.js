/* Forge et NeoForge : installation par l’installeur officiel (--installClient) dans le dossier partagé, puis lancement
   comme un loader personnalisé. EXPÉRIMENTAL : jamais exécuté dans Électron. Les arguments JVM du profil (modules, ouvertures)
   sont convertis car minecraft-launcher-core ne les applique pas lui-même. */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { spawn } = require('child_process');
const plat = require('./platform'), game = require('./game'), log = require('./log');
const UA = { 'User-Agent': 'Hydarium/0.5 (launcher)' };
const j = async u => { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error('Service indisponible (' + r.status + ').'); return r.json(); };
const shared = () => path.join(plat.dataDir(), 'shared');
const OK = ['maven.minecraftforge.net', 'maven.neoforged.net'];

/* NeoForge : 21.1.172 = Minecraft 1.21.1 ; 20.4.x = 1.20.4 ; 21.0.x = 1.21 ; versions récentes : mêmes deux premiers nombres que Minecraft */
const mcOfNeo = v => { const m = String(v).match(/^(\d+)\.(\d+)\./); if (!m) return []; const a = +m[1], b = +m[2]; return a >= 26 ? [`${a}.${b}`, `1.${a}${b ? '.' + b : ''}`] : [`1.${a}${b ? '.' + b : ''}`]; };
const txt = async u => { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error('Service indisponible (' + r.status + ').'); return r.text(); };
/* Forge : toutes les versions publiées sur le Maven officiel (« 1.16.5-36.2.42 », « 1.8.9-11.15.1.2318-1.8.9 »…), avec repli sur les « promotions » (recommandée / dernière).
   Avant : seules les promotions étaient lues et une version sans promotion (ou un service de promotions injoignable) donnait « aucune version » ; pour 1.7.10 / 1.8.9
   le suffixe de branche manquait aussi, donc l’adresse de l’installeur était fausse. Forge n’a jamais publié de version pour « 1.16 » tout court (la première est 1.16.1). */
let mavenCache = null;
async function forgeAll() {
  if (mavenCache && Date.now() - mavenCache.t < 10 * 60 * 1000) return mavenCache.v;
  const x = await txt('https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml');
  const v = [...x.matchAll(/<version>([^<]+)<\/version>/g)].map(m => m[1]).filter(s => /^\d+\.\d+(\.\d+)?-[\w.+-]+$/.test(s));
  if (!v.length) throw new Error('Liste des versions de Forge vide.');
  mavenCache = { t: Date.now(), v }; return v;
}
const mcOfForge = s => s.slice(0, s.indexOf('-'));
exports.mcs = async loader => {
  if (loader === 'forge') { try { return [...new Set((await forgeAll()).map(mcOfForge))]; } catch (e) { const p = (await j('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json')).promos || {}; return [...new Set(Object.keys(p).map(k => k.replace(/-(latest|recommended)$/, '')))]; } }
  if (loader === 'neoforge') { const all = (await j('https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge')).versions || []; return [...new Set(all.flatMap(mcOfNeo))]; }
  return [];
};
exports.versions = async (loader, mc) => {
  if (loader === 'forge') {
    mc = String(mc || ''); if (!/^\d+\.\d+(\.\d+)?$/.test(mc)) return [];
    let promo = {}; try { promo = (await j('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json')).promos || {}; } catch (e) { /* facultatif : sert seulement aux étiquettes */ }
    const rec = promo[mc + '-recommended'], lat = promo[mc + '-latest'], tag = v => (rec && (v === rec || v.startsWith(rec + '-')) ? ' (recommandée)' : lat && (v === lat || v.startsWith(lat + '-')) ? ' (dernière)' : '');
    let list = [];
    try { list = (await forgeAll()).filter(s => s.startsWith(mc + '-')).map(s => s.slice(mc.length + 1)).reverse(); }
    catch (e) { // Maven injoignable : on retombe sur les promotions (1.7.10 / 1.8.9 : suffixe de branche ajouté)
      const suf = /^1\.(7\.10|8\.9|8|9)$/.test(mc) ? '-' + mc : '';
      list = [...new Set([lat, rec].filter(Boolean))].map(v => v + suf);
    }
    return list.slice(0, 15).map((v, n) => ({ v, label: v + (tag(v) || (n === 0 ? ' (dernière)' : '')) }));
  }
  if (loader === 'neoforge') {
    const all = (await j('https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge')).versions || [];
    return all.filter(v => mcOfNeo(v).includes(mc) && !/alpha|snapshot/i.test(v)).reverse().slice(0, 12).map((v, n) => ({ v, label: v + (n === 0 ? ' (dernière)' : '') }));
  }
  return [];
};
const idOf = i => i.loader === 'forge' ? `${i.version}-forge-${i.loaderVer}` : `neoforge-${i.loaderVer}`;
/* Sur le Maven de Forge, la version s’écrit « <mc>-<forge> » ou, pour 1.7.10 / 1.8 / 1.8.9 / 1.9…, « <mc>-<forge>-<mc> » (ex. 1.8.9-11.15.1.2318-1.8.9).
   On essaie les deux écritures : les instances créées avant le correctif (sans suffixe) et celles d’après marchent donc toutes. */
const forgeNames = i => { const mc = String(i.version), lv = String(i.loaderVer), suf = '-' + mc, a = [mc + '-' + lv]; a.push(lv.endsWith(suf) ? mc + '-' + lv.slice(0, -suf.length) : mc + '-' + lv + suf); return a; };
const urlsOf = i => i.loader === 'forge'
  ? forgeNames(i).map(n => `https://maven.minecraftforge.net/net/minecraftforge/forge/${n}/forge-${n}-installer.jar`)
  : [`https://maven.neoforged.net/releases/net/neoforged/neoforge/${i.loaderVer}/neoforge-${i.loaderVer}-installer.jar`];
const urlOf = i => urlsOf(i)[0];
exports.installerUrl = urlOf; exports.installerUrls = urlsOf;
const jsonOf = id => path.join(shared(), 'versions', id, id + '.json');
/* Forge ≤ 1.12.2 nomme son profil « 1.8.9-forge1.8.9-11.15.1.2318-1.8.9 » (sans tiret après « forge ») : l’identifiant calculé par idOf ne le retrouvait pas,
   donc l’installeur était relancé à CHAQUE lancement. On cherche donc aussi un profil déjà présent pour cette version de Minecraft et de Forge. */
const findInstalled = inst => {
  if (inst.loader !== 'forge') return null;
  try { return fs.readdirSync(path.join(shared(), 'versions')).find(d => d.startsWith(inst.version + '-') && /forge/i.test(d) && d.includes(inst.loaderVer) && fs.existsSync(jsonOf(d))) || null; } catch (e) { return null; }
};
/* Forge ≤ 1.12.2 : l’installeur contient déjà le profil (install_profile.json › versionInfo) et le jar « universal ». On les pose directement et on télécharge les bibliothèques :
   plus d’exécution de Java, donc plus d’échec dû aux vieux installeurs (certificats, adresses mortes, argument de dossier ignoré…). Le profil est écrit EN DERNIER :
   sa présence = installation complète. Renvoie null pour un installeur moderne (1.13+), qui doit être exécuté. */
const LIBHOST = ['libraries.minecraft.net', 'maven.minecraftforge.net', 'files.minecraftforge.net', 'repo1.maven.org'];
async function legacyInstall(jar, root, send) {
  const Zip = require('adm-zip'), z = new Zip(jar), pe = z.getEntry('install_profile.json'); if (!pe) return null;
  const p = JSON.parse(pe.getData().toString('utf8')), vi = p.versionInfo, ins = p.install || {};
  if (!vi || !vi.id || !Array.isArray(vi.libraries)) return null;
  if (!/^[\w.+-]{1,100}$/.test(vi.id)) throw new Error('Identifiant de profil inattendu.');
  const lib = path.join(root, 'libraries');
  const rel = n => { const [g, a, v, c] = String(n).split(':'); if (!g || !a || !v) throw new Error('Bibliothèque invalide : ' + n); return g.replace(/\./g, '/') + '/' + a + '/' + v + '/' + a + '-' + v + (c ? '-' + c : '') + '.jar'; };
  if (ins.path && ins.filePath) {
    const e = z.getEntry(String(ins.filePath)); if (!e) throw new Error(ins.filePath + ' absent de l’installeur.');
    const d = path.join(lib, rel(ins.path)); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.writeFileSync(d, e.getData());
  }
  const list = vi.libraries.filter(l => l && l.name && l.name !== ins.path && !l.natives && l.clientreq !== false); let k = 0;
  for (const l of list) {
    send && send('game:progress', { type: 'Bibliothèques de Forge', task: k++, total: list.length });
    const r = rel(l.name), dest = path.join(lib, r); if (fs.existsSync(dest) && fs.statSync(dest).size > 0) continue;
    const bases = [...new Set([l.url, 'https://libraries.minecraft.net/', 'https://maven.minecraftforge.net/', 'https://repo1.maven.org/maven2/'].filter(Boolean)
      .map(u => u.replace(/^http:/, 'https:').replace('files.minecraftforge.net/maven/', 'maven.minecraftforge.net/')))].filter(u => { try { return LIBHOST.includes(new URL(u).hostname); } catch (e) { return false; } });
    let ok = false;
    for (const b of bases) { try { const res = await fetch(b + r, { headers: UA, signal: AbortSignal.timeout(60000) }); if (!res.ok) continue; const buf = Buffer.from(await res.arrayBuffer()); if (buf.length < 100) continue; fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, buf); ok = true; break; } catch (e) { /* source suivante */ } }
    if (!ok) throw new Error('Bibliothèque introuvable : ' + l.name);
  }
  fs.mkdirSync(path.dirname(jsonOf(vi.id)), { recursive: true }); fs.writeFileSync(jsonOf(vi.id), JSON.stringify(vi, null, 2));
  return vi.id;
}
exports._legacy = legacyInstall;

/* installe si besoin, renvoie l’identifiant de version à lancer */
exports.ensure = async (inst, send) => {
  if (!/^[\w.+-]{1,40}$/.test(inst.loaderVer || '')) throw new Error('Version de ' + inst.loader + ' manquante : recrée l’instance en choisissant une version du loader.');
  const id = idOf(inst);
  if (fs.existsSync(jsonOf(id))) return id;
  { const have = findInstalled(inst); if (have) return have; }
  const urls = urlsOf(inst); if (urls.some(u => !OK.includes(new URL(u).hostname))) throw new Error('Source refusée.');
  send && send('game:progress', { type: 'Installation de ' + inst.loader, task: 0, total: 1 });
  const root = shared(), dir = path.join(root, 'installers'); fs.mkdirSync(dir, { recursive: true });
  const valid = b => b.length > 10000 && b[0] === 0x50 && b[1] === 0x4b; // un .jar est un zip (« PK ») : écarte les pages d’erreur enregistrées par erreur
  let jar = urls.map(u => path.join(dir, path.basename(u))).find(p => { try { return valid(fs.readFileSync(p)); } catch (e) { return false; } }), last = '';
  if (!jar) {
    for (const u of urls) {
      let r; try { r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(180000) }); } catch (e) { throw new Error('Téléchargement de l’installeur impossible (' + e.message + '). Vérifie ta connexion.'); }
      if (!r.ok) { last = String(r.status); log.warn('installeur ' + inst.loader, u + ' → ' + r.status); continue; }
      const b = Buffer.from(await r.arrayBuffer()); if (!valid(b)) { last = 'fichier invalide'; continue; }
      jar = path.join(dir, path.basename(u)); fs.writeFileSync(jar, b); break;
    }
    if (!jar) throw new Error('Installeur introuvable (' + last + ') pour ' + inst.loader + ' ' + inst.loaderVer + '. Adresses essayées : ' + urls.join(' ; '));
  }
  if (inst.loader === 'forge') { try { const lid = await legacyInstall(jar, root, send); if (lid) return lid; } catch (e) { log.warn('Forge : installation directe impossible, essai avec l’installeur', e.message); } }
  const lp = path.join(root, 'launcher_profiles.json'); if (!fs.existsSync(lp)) fs.writeFileSync(lp, JSON.stringify({ profiles: {}, version: 3 }));
  const jv = await game.chooseJava(inst, await game.needJava(inst)), out = [];
  await new Promise((res, rej) => {
    const p = spawn(jv.path, ['-Djava.awt.headless=true', '-jar', jar, '--installClient', root], { cwd: root, windowsHide: true });
    const feed = d => { const t = d.toString(); out.push(t); log.info('installeur ' + inst.loader, t.trim().slice(0, 300)); };
    p.stdout.on('data', feed); p.stderr.on('data', feed); p.on('error', rej);
    p.on('close', c => {
      try { fs.writeFileSync(path.join(dir, path.basename(jar) + '.log'), out.join('')); } catch (e) { /* journal facultatif */ }
      c === 0 ? res() : rej(new Error('L’installeur de ' + inst.loader + ' a échoué (code ' + c + '). Dernières lignes : ' + out.join('').trim().split(/\r?\n/).filter(Boolean).slice(-6).join(' | ') + ' — journal complet : ' + path.join(dir, path.basename(jar) + '.log')));
    });
  });
  if (!fs.existsSync(jsonOf(id))) {
    const found = fs.readdirSync(path.join(root, 'versions')).find(d => d.includes(inst.loaderVer) && /forge/i.test(d)); // nom différent selon les versions
    if (found) return found;
    throw new Error('Installation terminée mais le profil ' + id + ' est introuvable.');
  }
  return id;
};
/* arguments JVM du profil, jetons remplacés, sans ceux que minecraft-launcher-core ajoute déjà */
exports.jvmArgs = id => {
  const f = jsonOf(id); if (!fs.existsSync(f)) return [];
  const raw = JSON.parse(fs.readFileSync(f, 'utf8')), a = (raw.arguments && raw.arguments.jvm) || [], out = [];
  const lib = path.join(shared(), 'libraries'), sub = s => s.replace(/\$\{library_directory\}/g, lib).replace(/\$\{classpath_separator\}/g, path.delimiter).replace(/\$\{version_name\}/g, id);
  for (let k = 0; k < a.length; k++) {
    const x = a[k]; if (typeof x !== 'string') continue; // entrées à règles (système) : déjà gérées par le jeu de base
    if (/^-D(java\.library\.path|minecraft\.launcher|minecraft\.client\.jar)/.test(x) || x === '-cp' || x === '${classpath}') { if (x === '-cp') k++; continue; }
    if (/\$\{(natives_directory|launcher_name|launcher_version|classpath)\}/.test(x)) { if (/^-[a-z]$/.test(out[out.length - 1] || '')) out.pop(); continue; }
    out.push(sub(x));
  }
  return out;
};
