/* Incruste le logo dans Hydarium.exe (barre des tâches, raccourcis du bureau, explorateur).
   electron-builder le fait normalement, mais « signAndEditExecutable: false » (nécessaire sans droits de création de liens symboliques) désactive cette étape. */
const path = require('path'), fs = require('fs');
exports.default = async function afterPack(ctx) {
  if (ctx.electronPlatformName !== 'win32') return;
  const exe = path.join(ctx.appOutDir, ctx.packager.appInfo.productFilename + '.exe'), ico = path.join(ctx.packager.projectDir, 'build', 'icon.ico');
  const bad = msg => { console.warn('  • logo : ' + msg); console.log('::error title=Logo non incrusté::' + msg + ' : l\'exécutable gardera l\'icône d\'Electron'); }; // « ::error:: » = annotation rouge visible sur GitHub Actions, sans faire échouer la construction
  if (!fs.existsSync(exe) || !fs.existsSync(ico)) return bad('exe ou icône introuvable (' + exe + ')');
  try {
    const before = fs.statSync(exe).size;
    const m = await import('rcedit'), rcedit = m.rcedit || m.default || m;
    await rcedit(exe, { icon: ico, 'version-string': { ProductName: 'Hydarium', FileDescription: 'Hydarium Launcher', CompanyName: 'Hydarium' } });
    const after = fs.statSync(exe).size;
    if (after === before) return bad('rcedit n\'a rien changé à ' + path.basename(exe));
    console.log('  • logo incrusté dans ' + path.basename(exe) + ' (' + before + ' → ' + after + ' octets)');
  } catch (e) { bad('échec de rcedit (' + e.message + ')'); }
};
