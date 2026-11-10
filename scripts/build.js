/* Fabrication / lancement du launcher avec un affichage lisible (barre d'avancement, étapes, détail de l'étape en cours).
   Appelé par build-windows.bat (« dist » : fabrique l'installeur) et lancer-dev.bat (« dev » : prépare puis lance le launcher).
   Tout ce que les outils écrivent (npm, Gradle, electron-builder…) est enregistré dans build.log, jamais affiché. */
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const root = path.join(__dirname, '..'); process.chdir(root);
const mode = process.argv[2] === 'dev' ? 'dev' : 'dist';
/* « build-windows.bat » = rapide (installeur seul, sans compression : gros fichier mais ~3 fois plus vite) ; « build-windows.bat release » = installeur compressé + version portable (lent, pour publier). */
const release = process.argv.slice(3).includes('release');
const { createUI } = require('./ui'), { explain, fmtMB } = require('./util');
const LOG = path.join(root, 'build.log');

const steps = [
  { id: 'deps', label: 'Installation des composants du launcher', weight: 14, est: 60 },
  { id: 'electron', label: 'Moteur de la fenêtre (Electron)', weight: 8, est: 40 },
  ...(mode === 'dist' ? [{ id: 'jre', label: 'Java embarqué dans l’installeur', weight: 8, est: 40 }, { id: 'pack', label: release ? 'Création de l’installeur (version à publier)' : 'Création de l’installeur', weight: 22, est: release ? 240 : 70 }] : [{ id: 'start', label: 'Démarrage du launcher', weight: 4, est: 10 }])
];
const ui = createUI({
  title: mode === 'dist' ? 'Fabrication de l’installeur' : 'Préparation du launcher', logFile: LOG,
  subtitle: mode === 'dist' ? 'Tu peux faire autre chose pendant ce temps : je te préviens à la fin.' : 'Première fois : quelques minutes. Ensuite, le démarrage est quasi immédiat.',
  steps, tip: 'Ne ferme pas cette fenêtre. La première fois, des téléchargements (Java, Gradle, Minecraft) prennent du temps : c’est normal.'
});
ui.log(`Hydarium · ${mode} · ${new Date().toISOString()} · Node ${process.version} · ${process.platform} ${process.arch}`);

function run(file, args, { cwd = root, env = {}, onLine, shell = false } = {}) {
  return new Promise(res => {
    const o = { cwd, env: { ...process.env, ...env }, windowsHide: true }, tail = [];
    let p; try { p = shell ? spawn(file, { ...o, shell: true }) : spawn(file, args, o); } catch (e) { ui.log('ERREUR : ' + e.message); return res({ code: -1, text: e.message }); }
    const eat = d => String(d).split(/\r\n|\n|\r/).forEach(l => { if (!l.trim()) return; ui.log(l); tail.push(l); if (tail.length > 80) tail.shift(); if (onLine) onLine(l); });
    p.stdout.on('data', eat); p.stderr.on('data', eat);
    p.on('error', e => { ui.log('ERREUR : ' + e.message); tail.push(e.message); res({ code: -1, text: tail.join('\n') }); });
    p.on('close', code => res({ code, text: tail.join('\n') }));
  });
}
const npmCli = () => [process.env.npm_execpath, path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'), path.join(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')].find(p => p && /npm-cli\.js$/.test(p) && fs.existsSync(p));

async function critical(id, fn) {
  try { const r = await fn(); if (r === 'skip') ui.skip(id); else ui.ok(id); }
  catch (e) { ui.log('ÉCHEC ' + id + ' : ' + (e.tech || e.message)); ui.fail(id, 'échec'); throw Object.assign(e, { stepId: id, friendly: e.friendly || explain((e.tech || '') + ' ' + e.message) }); }
}

(async () => {
  const warnings = []; let installer = '';
  try {
    await critical('deps', async () => {
      /* Rien à refaire si package.json / package-lock.json n'ont pas changé depuis la dernière installation réussie (gain : 20 à 60 s à chaque fabrication). */
      const crypto = require('crypto'), stamp = path.join(root, 'node_modules', '.hyd-deps');
      const sig = crypto.createHash('sha1').update(['package.json', 'package-lock.json'].map(f => { try { return fs.readFileSync(path.join(root, f)); } catch (e) { return ''; } }).join('\n')).digest('hex');
      try { if (fs.readFileSync(stamp, 'utf8') === sig && fs.existsSync(path.join(root, 'node_modules', 'electron-builder'))) return 'skip'; } catch (e) {}
      ui.begin('deps', 'Téléchargement et installation des composants (premier lancement : environ une minute)…');
      const cli = npmCli(), a = ['install', '--no-audit', '--no-fund', '--loglevel=error', '--progress=false', '--fetch-retries=2', '--fetch-retry-mintimeout=2000', '--fetch-retry-maxtimeout=8000', '--fetch-timeout=60000'];
      const r = cli ? await run(process.execPath, [cli, ...a]) : await run('npm ' + a.join(' '), [], { shell: true });
      if (r.code !== 0) throw Object.assign(new Error('npm install a échoué'), { tech: r.text });
      try { fs.writeFileSync(stamp, sig); } catch (e) {}
    });
    await critical('electron', async () => {
      const done = () => fs.existsSync(path.join(root, 'node_modules', 'electron', 'path.txt')) && fs.existsSync(path.join(root, 'node_modules', 'electron', 'dist'));
      if (done()) return 'skip';
      ui.begin('electron', 'Téléchargement du moteur de fenêtre (environ 100 Mo)…');
      const r = await run(process.execPath, [path.join(root, 'node_modules', 'electron', 'install.js')]);
      if (r.code !== 0 || !done()) throw Object.assign(new Error('Electron non installé'), { tech: r.text });
    });

    /* Le mod Hydarium n'est plus fabriqué ici : il est créé par le launcher, pour la version exacte de chaque instance, au PREMIER lancement de l'instance (avant le jeu), puis réutilisé.
       Le dossier build-client doit seulement exister (l'installeur le référence). */
    fs.mkdirSync(path.join(root, 'build-client'), { recursive: true });

    if (mode === 'dist') {
      await critical('jre', async () => {
        ui.begin('jre', 'Vérification…'); const { fetchJre } = require('./fetch-jre');
        const did = await fetchJre({ onStep: t => { ui.detail(t); ui.log(t); }, onProgress: (g, t) => { if (t) { ui.sub(g / t * .9); ui.detail(`Téléchargement de Java 21 : ${fmtMB(g)} sur ${fmtMB(t)}`); } } });
        if (!did) return 'skip';
      });
      await critical('pack', async () => {
        ui.begin('pack', 'Assemblage de l’application…');
        const cli = path.join(root, 'node_modules', 'electron-builder', 'cli.js'), P = [[/packaging/i, 'Assemblage de l’application…', .3], [/nsis|installer/i, 'Création de l’installeur (installation en un clic)…', .62], [/portable/i, 'Création de la version portable…', .86], [/download/i, 'Téléchargement des outils de fabrication (première fois seulement)…', .15]];
        const args = release ? ['--win', '--publish', 'never'] : ['--win', 'nsis', '--publish', 'never', '-c.compression=store', '-c.nsis.differentialPackage=false'], r = await run(process.execPath, [cli, ...args], { env: { CSC_IDENTITY_AUTO_DISCOVERY: 'false' }, onLine: l => { const m = P.find(([re]) => re.test(l)); if (m) { ui.detail(m[1]); ui.sub(m[2]); } } });
        if (r.code !== 0) throw Object.assign(new Error('electron-builder a échoué'), { tech: r.text });
        const d = path.join(root, 'dist'); try { installer = fs.readdirSync(d).filter(f => /^Hydarium-.*\.exe$/i.test(f)).sort().map(f => path.join('dist', f)).join('   '); } catch (e) {}
      });
    }

    const lines = [];
    if (warnings.length) { lines.push(ui.YEL('!  Terminé, avec un point à savoir :')); warnings.forEach(w => lines.push('     • ' + w)); lines.push('     Le launcher fonctionne quand même (HUD externe) et retentera de créer le mod à la création d’une instance.'); lines.push('     Détails techniques : build.log (à envoyer à l’équipe si besoin).'); }
    else lines.push(ui.GREEN('√  Terminé ! Tout s’est bien passé.'));
    if (mode === 'dist' && !release) lines.push('   (fabrication rapide : installeur non compressé. Pour publier : « build-windows.bat release ».)');
    if (mode === 'dist') { if (installer) lines.push('   Ton installeur : ' + ui.B(installer)); if (process.platform === 'win32') spawn('explorer', [path.join(root, 'dist')], { detached: true, stdio: 'ignore' }).unref(); }

    if (mode === 'dev') {
      ui.begin('start', 'Ouverture de la fenêtre…');
      const exe = require(path.join(root, 'node_modules', 'electron')), fd = fs.openSync(path.join(root, 'dev.log'), 'w');
      const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
      const p = spawn(exe, ['.'], { cwd: root, env, stdio: ['ignore', fd, fd] }); ui.ok('start');
      lines.push('   Hydarium est lancé. Ferme cette fenêtre noire quand tu as fini de jouer.'); ui.finish(true, lines);
      await new Promise(r => p.on('close', r)); return;
    }
    ui.finish(true, lines);
  } catch (e) {
    ui.finish(false, [ui.RED('×  La fabrication s’est arrêtée à l’étape « ' + ((steps.find(s => s.id === e.stepId) || {}).label || '?') + ' ».'), '   ' + (e.friendly || explain(e.message)), '   Les détails techniques sont dans le fichier build.log (dans ce dossier) : envoie-le à l’équipe.']);
    process.exitCode = 1;
  }
})();
