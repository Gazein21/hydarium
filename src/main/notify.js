/* Vraies notifications du système (Windows : centre de notifications). Réglable dans Paramètres. */
const { Notification } = require('electron');
const store = require('./store'), log = require('./log');
const path = require('path'), { nativeImage } = require('electron');
let onClick = () => {}, logo;
/* Logo Hydarium affiché en grand à gauche de chaque notification (Windows : image de la notification ; macOS / Linux : icône). */
const icon = () => { if (logo !== undefined) return logo; logo = null; for (const f of ['../../build/icon.png', '../renderer/logo.png']) { try { const i = nativeImage.createFromPath(path.join(__dirname, f)); if (!i.isEmpty()) { logo = i; break; } } catch (e) {} } return logo; };
exports.onClick = f => { onClick = f; };
const KIND = { launch: 'notifLaunch', crash: 'notifCrash', shot: 'notifShot', done: 'notifDone', server: 'notifServer', update: 'notifUpdate' };
exports.show = (title, body, action, kind) => {
  try {
    const s = store.get().settings;
    if (s.notif === false) return;
    if (kind && KIND[kind] && s[KIND[kind]] === false) return;
    if (kind !== 'crash' && s.notifQuiet && require('./game').isRunning()) return;
    if (!Notification.isSupported()) return log.warn('Notifications non supportées sur ce système');
    const n = new Notification({ title, body, ...(icon() ? { icon: icon() } : {}) });
    n.on('click', () => onClick(action));
    n.show();
  } catch (e) { log.error('notification', e); }
};
