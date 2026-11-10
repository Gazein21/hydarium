/* Incruste le logo dans Hydarium.exe (barre des tâches, raccourcis du bureau, explorateur).
   electron-builder le fait normalement, mais « signAndEditExecutable: false » (nécessaire sans droits de création de liens symboliques) désactive cette étape. */
const path = require('path'), fs = require('fs');
exports.default = async function afterPack(ctx) {
  if (ctx.electronPlatformName !== 'win32') return;
  const exe = path.join(ctx.appOutDir, ctx.packager.appInfo.productFilename + '.exe'), ico = path.join(ctx.packager.projectDir, 'build', 'icon.ico');
  if (!fs.existsSync(exe) || !fs.existsSync(ico)) { console.warn('  • logo : exe ou icône introuvable, étape ignorée'); return; }
  try {
    const m = await import('rcedit'), rcedit = m.rcedit || m.default || m;
    await rcedit(exe, { icon: ico, 'version-string': { ProductName: 'Hydarium', FileDescription: 'Hydarium Launcher', CompanyName: 'Hydarium' } });
    console.log('  • logo incrusté dans ' + path.basename(exe));
  } catch (e) { console.warn('  • logo : échec de rcedit (' + e.message + ') : le build continue avec l’icône par défaut'); }
};
