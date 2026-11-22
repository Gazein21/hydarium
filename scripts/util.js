/* Petits outils partagés par les scripts de fabrication : téléchargement avec progression, extraction, formats. */
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');

const fmtMB = n => (n / 1048576).toFixed(n > 1e8 ? 0 : 1).replace('.', ',') + ' Mo';

/** Un seul essai de téléchargement via le module https (IPv4 forcé : beaucoup de box/FAI ont un IPv6 cassé, ce qui bloque fetch ~10 s puis « fetch failed »). */
function httpGet(url, file, onProgress, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 8) return reject(new Error('trop de redirections : ' + url));
    const lib = /^http:/i.test(url) ? require('http') : require('https');
    const req = lib.get(url, { family: 4, headers: { 'User-Agent': 'Hydarium-build' }, timeout: 60000 }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume(); return resolve(httpGet(new URL(res.headers.location, url).href, file, onProgress, redirects + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(url + ' → HTTP ' + res.statusCode)); }
      const total = +res.headers['content-length'] || 0; let got = 0;
      const ws = fs.createWriteStream(file + '.part');
      res.on('data', c => { got += c.length; if (onProgress) onProgress(got, total); });
      res.on('error', e => { ws.destroy(); reject(e); });
      ws.on('error', reject);
      ws.on('finish', () => { if (total && got !== total) return reject(new Error('ECONNRESET : téléchargement incomplet (' + got + '/' + total + ')')); resolve(); });
      res.pipe(ws);
    });
    req.on('timeout', () => req.destroy(new Error('ETIMEDOUT : plus aucune donnée reçue depuis 60 s')));
    req.on('error', e => reject(new Error((e.code ? e.code + ' : ' : '') + e.message + ' (' + url + ')')));
  });
}

/** Repli : curl.exe (présent dans Windows 10/11), qui utilise la pile réseau de Windows (proxy, antivirus…). */
function curlGet(url, file) {
  execFileSync('curl', ['-L', '--fail', '--silent', '--show-error', '--retry', '3', '--connect-timeout', '30', '-o', file + '.part', url], { stdio: 'pipe' });
}

/** Télécharge url → file (en flux, avec progression, 3 essais puis repli curl). Ne retélécharge pas si le fichier existe déjà. onProgress(octetsReçus, octetsTotaux|0). */
async function download(url, file, onProgress) {
  if (fs.existsSync(file)) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const rm = () => { try { fs.rmSync(file + '.part', { force: true }); } catch (x) {} };
  const errs = [];
  for (let i = 1; i <= 3; i++) {
    try { await httpGet(url, file, onProgress); fs.renameSync(file + '.part', file); return; }
    catch (e) { rm(); errs.push('essai ' + i + ' : ' + e.message); await new Promise(r => setTimeout(r, 1500 * i)); }
  }
  try { curlGet(url, file); fs.renameSync(file + '.part', file); return; }
  catch (e) { rm(); errs.push('curl : ' + String((e.stderr || e.message)).trim().split('\n').pop()); }
  throw Object.assign(new Error('Téléchargement impossible : ' + url), { tech: errs.join('\n') });
}

function extract(archive, dest) {
  fs.mkdirSync(dest, { recursive: true });
  if (/\.zip$/i.test(archive)) new (require('adm-zip'))(archive).extractAllTo(dest, true); else execFileSync('tar', ['-xzf', archive, '-C', dest]);
}

/** Compare deux versions « 8.6 » / « 9.8.2 » : >0 si a > b. */
const vcmp = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };

/** Cause probable d’un échec, en français, d’après la sortie d’un outil. */
function explain(text) {
  const t = String(text || '');
  const got = /Could not (?:GET|HEAD|resolve|download)[^\n]*?['"]?((?:https?:\/\/|[\w.-]+:[\w.-]+:)[^\s'"]+)/i.exec(t);
  if (got) return `Un fichier nécessaire à la construction n’a pas pu être téléchargé : ${got[1].slice(0, 120)}. Vérifie ta connexion ; si elle fonctionne, ce serveur n’existe peut-être plus ou refuse la connexion (c’est fréquent pour Forge 1.8.9, dont les outils sont anciens). Le journal complet est dans le dossier des journaux (mod-build-*.log) : envoie-le à l’équipe.`;
  if (/ENOTFOUND|EAI_AGAIN|ECONNRESET|ETIMEDOUT|ECONNREFUSED|fetch failed|UnknownHost|Connection (refused|reset|timed out)|HTTP 5\d\d/i.test(t)) return 'La connexion Internet a été coupée ou est trop lente. Vérifie ta connexion, puis relance : ce qui est déjà téléchargé est conservé.';
  if (/ENOSPC|No space left|not enough space/i.test(t)) return 'Il n’y a plus assez de place sur le disque.';
  if (/EPERM|EACCES|EBUSY|being used by another process|Access is denied/i.test(t)) return 'Windows a bloqué un fichier (antivirus ou programme encore ouvert). Ferme Hydarium s’il est lancé, ajoute ce dossier aux exceptions de ton antivirus, puis relance.';
  if (/error: .*(does not exist|cannot find symbol|incompatible types)|Compilation failed/i.test(t)) return 'Le code du mod n’est pas compatible avec cette version de Minecraft (Mojang a changé quelque chose). Envoie le journal de construction (dossier des journaux, mod-build-*.log) à l’équipe.';
  if (/outdated version of Gradle|or higher is required/i.test(t)) return 'La version de Gradle utilisée est trop ancienne pour cet outil.';
  return 'Une erreur inattendue est survenue.';
}

module.exports = { download, extract, fmtMB, vcmp, explain };
