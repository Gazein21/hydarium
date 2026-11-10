/* Analyse d’un plantage : d’où vient-il (mod, Java, mémoire, pilote…), quels mods sont suspects et quoi proposer (boutons « actions »).
   analyze(inst, texte, { code, secs, javaMajor, req }) : après la fermeture du jeu · explainLaunch(erreur, inst) : le jeu n’a pas pu démarrer (Java manquant, réseau…). */
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
/* Java demandé d’après le numéro de version (même estimation que game.js, utilisée seulement si le vrai chiffre n’est pas connu) */
const guessJava = v => { const m = String(v || '').match(/^1\.(\d+)(?:\.(\d+))?/); if (!m) return 21; const a = +m[1], b = +(m[2] || 0); return a >= 21 || (a === 20 && b >= 5) ? 21 : a >= 17 ? 17 : 8; };
/* codes de sortie de Windows (NTSTATUS) : Node les donne en non signé (3221225477) ou signé selon la version */
const EXIT = {
  3221225477: ['native', 'Plantage natif (accès mémoire interdit)', 'Java ou un pilote a lu une zone mémoire interdite : mets à jour le pilote graphique, ferme les surcouches (Discord, NVIDIA, Afterburner) et évite le plein écran.'],
  3221226505: ['native', 'Plantage natif (pile corrompue)', 'Le plus souvent un pilote graphique ou une surcouche (antivirus, enregistreur d’écran) : mets à jour le pilote et ferme les surcouches.'],
  3489660927: ['native', 'Plantage natif de Java', 'Java s’est arrêté brutalement : pilote graphique, surcouche ou mod natif. Essaie le mode sans échec.'],
  3221225781: ['dll', 'Bibliothèque système manquante', 'Windows ne trouve pas une DLL : installe « Microsoft Visual C++ Redistributable 2015-2022 (x64) », ou réinstalle Java (l’antivirus a peut-être supprimé un fichier).'],
  3221225595: ['arch', 'Java incompatible avec ce Windows', 'Mauvaise architecture (32 / 64 bits) ou DLL abîmée : choisis un Java 64 bits dans les réglages Java.'],
  137: ['killed', 'Jeu arrêté par le système (manque de mémoire)', 'Le système a fermé Java faute de RAM : baisse la mémoire de l’instance ou ferme d’autres programmes.'],
  139: ['native', 'Plantage natif (segmentation)', 'Java a planté dans une bibliothèque native (pilote graphique le plus souvent) : mets-le à jour.'],
  134: ['native', 'Plantage natif de Java', 'Java s’est arrêté brutalement (SIGABRT) : pilote graphique ou mod natif. Essaie le mode sans échec.']
};
const A = {
  jinst: n => ({ id: 'jinst', v: String(n), label: 'Télécharger Java ' + n + ' et relancer', primary: true }),
  jset: { id: 'jset', label: 'Ouvrir les réglages Java' },
  jadd: { id: 'jadd', label: 'Choisir un Java installé…' },
  jauto: { id: 'jauto', label: 'Repasser au Java automatique et relancer', primary: true },
  autojava: { id: 'autojava', label: 'Activer le téléchargement automatique et relancer', primary: true },
  mem: n => ({ id: 'mem', v: String(n), label: 'Passer à ' + n + ' Go et relancer', primary: true }),
  retry: { id: 'retry', label: 'Réessayer', primary: true }
};

exports.analyze = (inst, text, ctx = {}) => {
  const t = String(text || ''), low = t.toLowerCase(), enabled = (inst.mods || []).filter(m => !m.disabled), actions = [];
  const score = new Map(), why = new Map(), add = (m, n, w) => { score.set(m.pid, (score.get(m.pid) || 0) + n); if (!why.has(m.pid)) why.set(m.pid, w); };
  const byToken = tok => { const n = norm(tok); if (n.length < 3) return null; return enabled.find(m => norm(m.slug) === n || norm(m.title) === n || norm(m.file).startsWith(n)); };
  // 1) rapports explicites des loaders
  for (const m of t.matchAll(/Suspected Mods?:[\s\S]{0,600}/g)) for (const l of m[0].split('\n').slice(1)) { const x = l.match(/^\s*([^\n(]+?)\s*\(([\w.-]+)\)/); if (x) { const mod = byToken(x[2]) || byToken(x[1]); if (mod) add(mod, 12, 'cité comme suspect dans le rapport de plantage'); } }
  for (const m of t.matchAll(/Mod '([^']+)' \(([\w.-]+)\)/g)) { const mod = byToken(m[2]) || byToken(m[1]); if (mod) add(mod, 6, 'nommé par le chargeur de mods dans l’erreur'); }
  for (const m of t.matchAll(/(?:mod|Mixin config|mixin) [\[“"']?([\w.-]{3,})[\]”"']?[^\n]{0,60}(?:failed|error|crash|incompatible|conflict)/gi)) { const mod = byToken(m[1]); if (mod) add(mod, 5, 'erreur directe de ce mod'); }
  // 2) toutes les mentions dans le texte
  for (const mod of enabled) { const slug = mod.slug.toLowerCase(); if (slug.length < 4) continue; const n = low.split(slug).length - 1; if (n) add(mod, Math.min(n, 5), 'mentionné ' + n + ' fois dans le journal'); }
  const mods = [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([pid, s]) => { const m = enabled.find(x => x.pid === pid); return { pid, title: m.title, file: m.file, score: s, why: why.get(pid) }; });
  const missing = [];
  for (const m of t.matchAll(/Install ([\w.-]+(?:, [\w.-]+)*?)(?:, any version| version|\.|\n)/g)) missing.push(...m[1].split(/, /));
  for (const m of t.matchAll(/requires? (?:any version of |version [^ ]+ or later of )?(?:mod )?'?([\w.-]{3,})'?, which is missing/gi)) missing.push(m[1]);
  for (const m of t.matchAll(/requires \[([\w.-]+)@/g)) missing.push(m[1]); // Forge 1.8.9 : « MissingModsException: Mod X requires [Y@[1.0,)] »
  for (const m of t.matchAll(/Missing Mods:\s*\n((?:[ \t]+[\w.-]+[ \t]*:[^\n]*\n?)+)/g)) for (const l of m[1].split('\n')) { const x = l.match(/^\s*([\w.-]+)\s*:/); if (x) missing.push(x[1]); }
  // 3) type de problème
  const code = typeof ctx.code === 'number' ? ctx.code : null, ucode = code === null ? null : code >>> 0, instMem = inst.mem || 4;
  let kind = 'unknown', title = 'Cause inconnue', hint = '';
  const need = (() => { let m = t.match(/class file version (\d+)/) || t.match(/Unsupported major\.minor version (\d+)/); if (m) return +m[1] - 44; if (/AppClassLoader cannot be cast to (?:class )?java\.net\.URLClassLoader/.test(t)) return 8; m = t.match(/(?:requires|needs|requiert) Java (\d+)/i); return m ? +m[1] : 0; })();
  if (code === -2 || code === -4058 || /spawn [^\n]*java[^\n]*ENOENT|Impossible de démarrer Java|is not recognized as an internal or external command|Error: could not open [`'][^\n]*jvm\.cfg|No Java runtime present|Unable to locate a Java Runtime|JAVA_HOME is not defined correctly/i.test(t)) {
    kind = 'javamissing'; title = 'Java introuvable'; const n = ctx.req || guessJava(inst.version);
    hint = 'Hydarium n’a pas pu démarrer Java (fichier supprimé, déplacé, ou bloqué par l’antivirus). Télécharge-le de nouveau ou choisis-en un autre.';
    actions.push(A.jinst(n), A.jadd, A.jset);
  } else if (need) {
    kind = 'java'; title = 'Mauvaise version de Java';
    hint = /AppClassLoader/.test(t) ? 'Cette version de Minecraft (avec Forge) ne démarre qu’avec Java 8 : un Java plus récent est utilisé.' : `Un fichier du jeu ou d’un mod demande Java ${need}${ctx.javaMajor ? ', mais Java ' + ctx.javaMajor + ' est utilisé' : ''}.`;
    actions.push(A.jinst(need)); if (inst.java) actions.unshift(A.jauto); actions.push(A.jset);
  } else if (/Could not reserve enough space|Invalid maximum heap size|insufficient memory for the Java Runtime|Native memory allocation \(mmap\) failed|unable to create (?:new )?native thread/i.test(t)) {
    kind = 'memory'; title = 'Mémoire insuffisante sur le PC'; const v = Math.max(2, Math.floor(instMem / 2));
    hint = `Java n’a pas pu réserver ${instMem} Go (pas assez de RAM libre, ou Java 32 bits). Baisse la mémoire de l’instance, ferme d’autres programmes, ou utilise un Java 64 bits.`;
    if (instMem > 2) actions.push(A.mem(v)); actions.push(A.jset);
  } else if (/OutOfMemoryError|Java heap space|GC overhead limit exceeded/i.test(t)) {
    kind = 'memory'; title = 'Le jeu manque de mémoire'; hint = `Minecraft a besoin de plus que les ${instMem} Go alloués (beaucoup de mods, shaders ou distance d’affichage élevée). Monte la mémoire de l’instance si ton PC le permet.`;
    if (instMem < 16) actions.push(A.mem(Math.min(16, instMem + 2)));
  } else if (/EXCEPTION_ACCESS_VIOLATION|SIGSEGV|GLFW error|WGL: |Pixel format not accelerated|nvoglv|atio6axx|ig\d+icd|driver does not appear to support OpenGL|OpenGL[^\n]{0,40}(?:error|not supported|unsupported)/i.test(t) && !mods.some(m => m.score >= 6)) { kind = 'graphics'; title = 'Pilote graphique / OpenGL'; hint = 'Mets à jour le pilote depuis le site du fabricant, ferme les surcouches (Discord, Afterburner) et essaie en fenêtré.'; }
  else if (/DuplicateModsFoundException|Found duplicate mods?|Duplicate mods? (?:found|detected)|duplicate mod ?id/i.test(t)) { kind = 'duplicate'; title = 'Mod installé en double'; hint = 'Deux fichiers du même mod sont présents : désinstalle l’un des deux (souvent une ancienne version).'; }
  else if (missing.length || /Incompatible mods found|requires .* which is missing|Missing or unsupported mandatory dependencies|MissingModsException/i.test(t)) { kind = 'dependency'; title = 'Mod incompatible ou dépendance manquante'; hint = missing.length ? 'Il manque : ' + [...new Set(missing)].join(', ') + '.' : 'Un mod demande un autre mod ou une autre version.'; }
  else if (/WrongMinecraftVersionException|only works with Minecraft|requires Minecraft [\d.]+|incompatible with Minecraft|Unsupported Minecraft version/i.test(t)) { kind = 'wrongmc'; title = 'Mod fait pour une autre version de Minecraft'; hint = 'Un mod n’est pas compatible avec Minecraft ' + inst.version + ' : retire-le ou prends la bonne version.'; }
  else if (/NoSuchMethodError|NoSuchFieldError|AbstractMethodError|IncompatibleClassChangeError/.test(t)) { kind = 'mod'; title = 'Mods de versions incompatibles entre eux'; hint = 'Un mod appelle du code qui n’existe pas dans la version installée d’un autre mod (ou de Minecraft). Mets à jour ou retire le mod le plus suspect.'; }
  else if (/ZipException|invalid (?:LOC|CEN) header|error in opening zip file|SHA-1 digest error|signer information does not match|Could not find or load main class/i.test(t)) { kind = 'corrupt'; title = 'Fichier corrompu ou incomplet'; hint = 'Un fichier du jeu ou d’un mod est abîmé (téléchargement interrompu, antivirus). S’il est cité ci-dessous, désinstalle puis réinstalle ce mod ; sinon retélécharge la version de Minecraft.'; }
  else if (mods.length && mods[0].score >= 3) { kind = 'mod'; title = 'Un mod semble être en cause'; hint = 'Désactive ou retire le mod le plus suspect, puis relance.'; }
  else if (/Unrecognized (?:VM )?option|Unknown option|Could not create the Java Virtual Machine/i.test(t)) { kind = 'args'; title = 'Option de lancement refusée'; hint = 'Vérifie les arguments du jeu / de la JVM dans les paramètres de l’instance, ou lance en mode sans échec.'; }
  else if (/invalid session|Failed to verify authentication|401 Unauthorized|Status: 401|Not authenticated|InsufficientPrivilegesException/i.test(t)) { kind = 'auth'; title = 'Session Microsoft expirée'; hint = 'Déconnecte-toi puis reconnecte-toi.'; }
  if (kind === 'mod' || kind === 'dependency') { if (!mods.length && kind === 'mod') kind = 'unknown'; }
  if (kind === 'unknown' && ucode !== null && EXIT[ucode]) { const [k, ti, h] = EXIT[ucode]; kind = k; title = ti; hint = h; if (k === 'killed' && instMem > 2) actions.push(A.mem(Math.max(2, Math.floor(instMem / 2)))); if (k === 'arch' || k === 'dll') actions.push(A.jset); }
  if (kind === 'unknown' && code !== null && code !== 0 && ctx.secs !== undefined && ctx.secs < 10 && t.split('\n').filter(l => l.trim()).length < 8) { kind = 'quick'; title = 'Le jeu s’est fermé aussitôt'; hint = 'Minecraft s’est arrêté en moins de 10 secondes sans rien expliquer : le plus souvent Java (mauvaise version ou bloqué par l’antivirus) ou un argument de lancement. Essaie le mode sans échec, puis un autre Java.'; actions.push(A.jset); }
  /* dépendance manquante : le coupable n'est PAS un mod à désactiver, c'est ce qui manque → on propose de le télécharger (Fabric API compris) */
  const SKIP = /^(minecraft|java|fabricloader|fabric-loader|quilt_loader|quilt-loader|forge|neoforge|fml|mixinextras?)$/i, API = /^(fabric|fabric-api|fabric_api|fabric-api-base)$/i;
  const install = []; if (kind === 'dependency') for (const id of [...new Set(missing)]) { if (SKIP.test(id)) continue; const slug = API.test(id) ? 'fabric-api' : id.toLowerCase(); if (!install.some(x => x.slug === slug) && !(inst.mods || []).some(m => m.slug === slug && !m.disabled)) install.push({ id, slug, name: slug === 'fabric-api' ? 'Fabric API' : id }); }
  return { kind, title, hint, mods: kind === 'dependency' && missing.length ? [] : ['java', 'javamissing', 'memory', 'native', 'dll', 'arch', 'killed', 'quick', 'args', 'auth'].includes(kind) ? [] : mods, missing: [...new Set(missing)].slice(0, 6), install: install.slice(0, 4), actions };
};

/* Le jeu n’a pas pu démarrer (rien n’a été lancé) : l’erreur vient du launcher lui-même (Java, réseau, disque…). */
exports.explainLaunch = (err, inst) => {
  const msg = String((err && err.message) || err || ''), c = err && err.code, mk = (kind, title, hint, actions = []) => ({ kind, title, hint, mods: [], missing: [], install: [], actions });
  if (c === 'JAVA_MISSING') {
    const n = err.major || guessJava(inst.version), net = /connexion|délai|interrompue|certificat|serveur : HTTP/i.test(err.dlErr || '');
    const reason = err.autoOff ? 'Le téléchargement automatique de Java est désactivé dans les Paramètres.' : err.dlErr ? 'Le téléchargement automatique a échoué (' + err.dlErr + ').' : 'Aucun Java compatible n’a été trouvé sur ce PC.';
    const acts = [A.jinst(n)]; if (err.autoOff) acts.unshift(A.autojava); acts.push(A.jadd, A.jset);
    return mk('javamissing', 'Java ' + n + ' manquant', `Minecraft ${inst.version} demande Java ${n}${err.legacy ? ' (exactement)' : ''}. ${reason} ` + (net ? 'Vérifie ta connexion Internet, ton pare-feu, VPN ou antivirus, puis réessaie.' : 'Réessaie le téléchargement, ou installe Java à la main (adoptium.net) et ajoute-le.'), acts);
  }
  if (c === 'JAVA_PICK') return mk('javamissing', 'Le Java choisi est introuvable', 'Le Java sélectionné pour cette instance n’existe plus (désinstallé ou déplacé).', [...(inst.java ? [A.jauto] : []), A.jadd, A.jset]);
  if (/ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|ECONNREFUSED|getaddrinfo|fetch failed|network|SSL|certificate|Failed to download|Unable to download|socket hang up|HTTP 5\d\d/i.test(msg)) return mk('network', 'Connexion impossible', 'Hydarium n’a pas pu télécharger des fichiers du jeu. Vérifie ta connexion Internet, ton pare-feu, VPN ou antivirus, puis réessaie.', [A.retry]);
  if (/ENOSPC|No space left|espace insuffisant|not enough space/i.test(msg)) return mk('disk', 'Disque plein', 'Il n’y a plus assez de place pour télécharger ou décompresser les fichiers du jeu. Libère de l’espace puis réessaie.', [A.retry]);
  if (/EACCES|EPERM|EBUSY|Access is denied|Accès refusé|Permission denied/i.test(msg)) return mk('perm', 'Accès refusé', 'Windows ou l’antivirus empêche Hydarium d’écrire ou de lire un fichier. Ajoute le dossier de données de Hydarium aux exclusions de l’antivirus, ferme les programmes qui utilisent ce dossier, puis réessaie.', [A.retry]);
  if (/forge|fabric|neoforge|quilt|installateur|installer|loader/i.test(msg)) return mk('loader', 'Chargeur de mods indisponible', msg, [A.retry]);
  if (/Microsoft|session|authentif|connecte/i.test(msg)) return mk('auth', 'Connexion Microsoft', msg + ' Déconnecte-toi puis reconnecte-toi.', [A.retry]);
  return mk('unknown', 'Le lancement a échoué', msg || 'Erreur inconnue : ouvre le journal.', [A.retry]);
};
