/* Touches et clics (compteur de CPS, touches affichées) : crochet global via uiohook-napi (module natif, facultatif).
   Les touches sont reconnues par la LETTRE de la touche sur ton clavier (Z Q S D en AZERTY) ; option « position physique » si ça ne réagit pas. */
let timer = null, hook = null, keyMap = { w: 'W', a: 'A', s: 'S', d: 'D' }, scan = false, onClickCb = null, KK = null, M = {};
const rebuild = () => { if (!KK) return; M = { [KK.Space]: 'space', [KK.Shift]: 'shift', [KK.Ctrl]: 'ctrl' }; for (const n of ['w', 'a', 's', 'd']) { const L = scan ? n.toUpperCase() : String(keyMap[n] || n).toUpperCase(); if (/^[A-Z]$/.test(L) && KK[L] !== undefined) M[KK[L]] = n; } };
exports.setKeys = (o, physical) => { if (o) for (const n of ['w', 'a', 's', 'd']) if (o[n]) keyMap[n] = o[n]; scan = !!physical; rebuild(); };
exports.start = (emit, onClick) => {
  try {
    const { uIOhook, UiohookKey: K } = require('uiohook-napi'), keys = {}, clicks = { l: [], r: [] }; KK = K; onClickCb = onClick; rebuild();
    uIOhook.on('keydown', e => { const k = M[e.keycode]; if (k) keys[k] = true; });
    uIOhook.on('keyup', e => { const k = M[e.keycode]; if (k) keys[k] = false; });
    uIOhook.on('mousedown', e => { if (e.button === 1) { clicks.l.push(Date.now()); keys.lmb = true; } else if (e.button === 2) { clicks.r.push(Date.now()); keys.rmb = true; } if (onClickCb) onClickCb(e); });
    uIOhook.on('mouseup', e => { if (e.button === 1) keys.lmb = false; else if (e.button === 2) keys.rmb = false; });
    uIOhook.start(); hook = uIOhook;
    timer = setInterval(() => { const n = Date.now(); clicks.l = clicks.l.filter(t => n - t < 1000); clicks.r = clicks.r.filter(t => n - t < 1000); emit({ keys: { ...keys }, cps: [clicks.l.length, clicks.r.length] }); }, 100);
    return true;
  } catch (e) { return false; }
};
exports.stop = () => { if (timer) { clearInterval(timer); timer = null; } if (hook) { try { hook.stop(); hook.removeAllListeners(); } catch (e) {} hook = null; } KK = null; };
