/* Affichage du HUD (fenêtre transparente). Même schéma de configuration que l’éditeur du launcher. */
const HDEF = { fps: [.01, .02], cps: [.01, .09], keystrokes: [.01, .42], coords: [.38, .02], direction: [.38, .09], armor: [.84, .42], potions: [.84, .02], ping: [.16, .02], clock: [.16, .09], memory: [.27, .02], music: [.36, .9], session: [.27, .09] };
let cfg = { modules: {} }, S = {}, lastRect = '';
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let LAB = /^(fr|be)/i.test(navigator.language) ? { w: 'Z', a: 'Q', s: 'S', d: 'D' } : { w: 'W', a: 'A', s: 'S', d: 'D' };
/* lettres réelles des touches de déplacement sur ton clavier (AZERTY, QWERTZ, Dvorak…) : affichage ET détection */
try { navigator.keyboard.getLayoutMap().then(m => { const g = c => (m.get(c) || '').toUpperCase(); const o = { w: g('KeyW'), a: g('KeyA'), s: g('KeyS'), d: g('KeyD') }; if (o.w && o.a && o.s && o.d) { LAB = o; hyd.call('hud:keys', o).catch(() => {}); draw(); } }); } catch (e) {}
const mm = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
/* couleur de l'armure selon la durabilité restante : blanc à 100 %, puis vert, jaune, orange, rouge */
const durCol = p => p >= 100 ? '#ffffff' : p >= 75 ? '#55ff55' : p >= 50 ? '#ffff55' : p >= 25 ? '#ffaa00' : '#ff5555';
/* icônes de l'armure : la texture Minecraft si le launcher l'a trouvée, sinon (casque, plastron, jambières, bottes) un dessin teinté selon la matière, et fiole d'effet teintée selon l'effet */
const MAT = { leather: '#a0663a', chainmail: '#9aa3ad', iron: '#dfe3e8', golden: '#f5c542', gold: '#f5c542', diamond: '#4fe0d8', netherite: '#4a3f46', turtle: '#4cae4c', copper: '#d9825a' };
const FXC = { speed: '#7fd0ff', slowness: '#5a6b7a', strength: '#c0392b', weakness: '#7a7a7a', regeneration: '#ff6fa8', resistance: '#8d99a6', fire_resistance: '#ff9f2e', water_breathing: '#3a7bd5', night_vision: '#5b6bff', invisibility: '#c7d0dc', jump_boost: '#7ee06a', haste: '#f5d742', mining_fatigue: '#6b6b4f', poison: '#6fa23a', wither: '#2e2a2a', absorption: '#f5c542', saturation: '#f58a42', glowing: '#fff6a0', levitation: '#d6c8ff', slow_falling: '#e9ecf8', luck: '#5fd16a', hero_of_the_village: '#3fae6a', health_boost: '#ff5a5a', blindness: '#444', nausea: '#7a6a2e', hunger: '#8a7a3a', darkness: '#2b2b3a' };
const ARM_SHAPE = ['<path d="M3 11V7a5 5 0 0110 0v4h-2.5V8.5h-5V11z"/>', '<path d="M3 3l2.5-1h5L13 3l2 3-2 2v6H3V8L1 6z"/>', '<path d="M3.5 2h9l.5 12h-3.4L8 7l-1.6 7H3z"/>', '<path d="M3 5h4v5h3.5l2.5 2.5V14H3z"/>'];
const armIcon = (n, id) => { const tx = S.game && S.game.icons && S.game.icons[id]; if (tx && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(tx)) return `<img class="ico" src="${tx}" width="16" height="16" alt="" style="image-rendering:pixelated">`; const m = Object.keys(MAT).find(k => String(id).startsWith(k)); return `<svg class="ico" viewBox="0 0 16 16" width="15" height="15" fill="${MAT[m] || '#c9ced6'}" stroke="rgba(0,0,0,.55)" stroke-width="1" stroke-linejoin="round">${ARM_SHAPE[n] || ARM_SHAPE[1]}</svg>`; };
const fxIcon = (id, key) => { const tx = S.game && S.game.icons && S.game.icons['fx:' + (key || id)]; if (tx && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(tx)) return `<img class="ico" src="${tx}" width="18" height="18" alt="" style="image-rendering:pixelated">`; return fxIconSvg(id); };
const fxIconSvg = id => { id = String(id).toLowerCase().replace(/\s+/g, '_'); let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360; return `<svg class="ico" viewBox="0 0 16 16" width="15" height="15" stroke="rgba(0,0,0,.55)" stroke-width="1" stroke-linejoin="round"><path d="M6 1.5h4v3l3 7.5a2 2 0 01-1.9 2.7H4.9A2 2 0 013 12l3-7.5z" fill="${FXC[id] || 'hsl(' + h + ',70%,60%)'}"/><path d="M5.3 1.5h5.4" stroke="#fff" stroke-width="1.2"/></svg>`; };
const CONTENT = {
  keystrokes: (m) => { const k = S.keys || {}, L = m.layout === 'zqsd' ? ['Z', 'Q', 'S', 'D'] : m.layout === 'wasd' ? ['W', 'A', 'S', 'D'] : [LAB.w, LAB.a, LAB.s, LAB.d], b = (n, t) => `<b class="${k[n] ? 'on' : ''}">${t}</b>`; return `<div class="kp"><i></i>${b('w', L[0])}<i></i>${b('a', L[1])}${b('s', L[2])}${b('d', L[3])}<b class="wide ${k.space ? 'on' : ''}">━━</b></div>`; },
  fps: () => S.game ? esc(S.game.fps + ' FPS') : '',
  coords: () => S.game ? esc('XYZ ' + Math.floor(S.game.x) + ' / ' + Math.floor(S.game.y) + ' / ' + Math.floor(S.game.z)) : '',
  direction: () => { if (!S.game) return ''; const y = ((S.game.yaw % 360) + 360) % 360, d = ['S', 'SO', 'O', 'NO', 'N', 'NE', 'E', 'SE'][Math.round(y / 45) % 8]; return esc(d + ' · ' + Math.round(y) + '°'); },
  armor: () => { const a = (S.game && S.game.armor) || [], m = (cfg.modules || {}).armor || {}, h = f => !m.show || (',' + m.show + ',').includes(',' + f + ','); return a.map((x, n) => { if (!x) return ''; const t = [h('name') ? x.id.replace(/_/g, ' ') : '', h('pct') && x.max ? Math.round((x.max - x.dmg) / x.max * 100) + ' %' : ''].filter(Boolean).join(' '); if (!t && !h('icon')) return ''; const pc = x.max ? Math.round((x.max - x.dmg) / x.max * 100) : -1; return `<div class="il">${h('icon') ? armIcon(n, x.id) : ''}<span${pc >= 0 ? ` style="color:${durCol(pc)}"` : ''}>${esc(t)}</span></div>`; }).filter(Boolean).join(''); },
  potions: () => { const f = (S.game && S.game.fx) || [], m = (cfg.modules || {}).potions || {}, h = k => !m.show || (',' + m.show + ',').includes(',' + k + ','); return f.map(e => { const id = e.id.split('.').pop(), t = [h('name') ? id.replace(/_/g, ' ') : '', h('lvl') ? String(e.a + 1) : '', h('time') ? mm(Math.floor(e.t / 20)) : ''].filter(Boolean).join(' · '); if (!t && !h('icon')) return ''; return `<div class="il">${h('icon') ? fxIcon(id, e.k || e.id.toLowerCase().replace(/\s+/g, '_')) : ''}<span>${esc(t)}</span></div>`; }).filter(Boolean).join(''); },
  cps: () => esc(((S.cps || [0, 0])[0]) + ' | ' + ((S.cps || [0, 0])[1]) + ' CPS'),
  clock: () => esc(S.clock || ''),
  memory: () => S.mem ? esc(S.mem[0].toFixed(1).replace('.', ',') + ' / ' + S.mem[1].toFixed(0) + ' Go') : '',
  ping: () => S.ping == null ? 'Ping : —' : esc(S.ping + ' ms'),
  music: () => { if (!S.music) return ''; const pl = !!S.music.playing, t = S.music.title || '', ar = S.music.artist || '', ic = pl ? '<svg viewBox="0 0 16 16" width="10" height="10"><rect x="3" y="2" width="3.4" height="12" rx="1" fill="currentColor"/><rect x="9.6" y="2" width="3.4" height="12" rx="1" fill="currentColor"/></svg>' : '<svg viewBox="0 0 16 16" width="10" height="10"><path d="M4 2.2v11.6a.6.6 0 00.9.5l9-5.8a.6.6 0 000-1L4.9 1.7a.6.6 0 00-.9.5z" fill="currentColor"/></svg>'; return `<span class="mus"><span class="eq ${pl ? 'on' : ''}"><i></i><i></i><i></i></span><span class="mcol"><span class="mt" title="${esc(t)}"><span>${esc(t)}</span></span>${ar ? `<span class="ma" title="${esc(ar)}">${esc(ar)}</span>` : ''}</span><span class="pp" title="${pl ? 'Pause' : 'Lecture'}">${ic}</span></span>`; },
  session: () => esc('Session ' + mm(S.session || 0))
};
function draw() {
  const m = cfg.modules || {}, out = [], rd = (m.hud || {}).round !== false; // style des cases : arrondi léger (défaut) ou carré comme en 1.8.9
  document.body.style.setProperty('--hr', rd ? '4px' : '0'); document.body.style.setProperty('--hc', rd ? '3px' : '0');
  for (const k of Object.keys(CONTENT)) { const c = m[k]; if (!c || !c.on) continue; if (S.game && (S.game.drawn || []).includes(k)) continue; // déjà dessiné dans le jeu par le mode Hydarium
    const html = CONTENT[k](c); if (!html) continue; const p = c.pos || { x: HDEF[k][0], y: HDEF[k][1] };
    out.push(`<div class="w" data-k="${k}" style="left:${p.x * 100}%;top:${p.y * 100}%;opacity:${c.opacity || 1};transform:scale(${c.scale || 1});${c.color ? 'color:' + esc(c.color) + ';' : ''}${c.bg === false ? 'background:transparent;' : ''}">${html}</div>`); }
  if (S.dpw) out.push('<div class="dpw">Télécharger des data packs</div>');
  if (S.rpw) out.push('<div class="dpw">Télécharger des packs de ressources</div>');
  document.getElementById('h').innerHTML = out.join('');
  const mw = document.querySelector('.w[data-k=music]'), r = mw ? mw.getBoundingClientRect() : null, key = r ? [r.left, r.top, r.width, r.height].map(Math.round).join(',') : '';
  if (key !== lastRect) { lastRect = key; hyd.call('hud:rect', r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null).catch(() => {}); }
}
hyd.on('hud:cfg', c => { cfg = c || { modules: {} }; draw(); });
hyd.on('hud:state', s => { S = s || {}; draw(); });

/* Titre de musique trop long : il défile (pause au début, puis aller-retour). draw() réécrit tout le HTML à chaque état : l'horloge est donc globale, la position est recalculée juste après chaque dessin. */
let mqText = '', mqT0 = 0;
function mqApply() {
  const e = document.querySelector('.mt.sc'); if (!e) return; const d = +e.dataset.d || 0, s = e.firstElementChild; if (!s || d <= 0) return;
  const h = 1.5, mv = d / 35, t = ((performance.now() - mqT0) / 1000) % (2 * (h + mv)), x = t < h ? 0 : t < h + mv ? (t - h) / mv : t < 2 * h + mv ? 1 : 1 - (t - 2 * h - mv) / mv;
  s.style.transform = 'translateX(' + (-d * x).toFixed(1) + 'px)';
}
function mqSetup() {
  const e = document.querySelector('.mt'); if (!e || !e.firstElementChild) return; const txt = e.getAttribute('title') || '';
  if (txt !== mqText) { mqText = txt; mqT0 = performance.now(); }
  const d = Math.ceil(e.firstElementChild.scrollWidth - e.clientWidth);
  if (d > 2) { e.classList.add('sc'); e.dataset.d = String(d + 6); mqApply(); }
}
const drawOrig = draw; draw = function () { drawOrig(); mqSetup(); };
(function loop() { mqApply(); requestAnimationFrame(loop); })();
