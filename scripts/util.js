/* Petits outils partagés par les scripts de fabrication : téléchargement avec progression, extraction, formats. */
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');

const fmtMB = n => (n / 1048576).toFixed(n > 1e8 ? 0 : 1).replace('.', ',') + ' Mo';

/** Télécharge url → file (en flux, avec progression). Ne retélécharge pas si le fichier existe déjà. onProgress(octetsReçus, octetsTotaux|0). */
async function download(url, file, onProgress) {
  if (fs.existsSync(file)) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const r = await fetch(url, { redirect: 'follow' });
  if (!r.ok) throw new Error(url + ' → HTTP ' + r.status);
  const total = +r.headers.get('content-length') || 0, ws = fs.createWriteStream(file + '.part'), reader = r.body.getReader();
  let got = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      got += value.length; if (!ws.write(value)) await new Promise(res => ws.once('drain', res));
      if (onProgress) onProgress(got, total);
    }
    await new Promise((res, rej) => { ws.once('error', rej); ws.end(res); });
  } catch (e) { try { ws.destroy(); fs.rmSync(file + '.part', { force: true }); } catch (x) {} throw e; }
  fs.renameSync(file + '.part', file);
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
