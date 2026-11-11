const $ = s => document.querySelector(s);
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const call = async (c, ...a) => { const r = await hyd.call(c, ...a); if (!r.ok) throw new Error(r.error); return r.data; };
/* Notifications : vraies notifications du système (main/notify.js). Petit retour discret dans la barre du bas pour les enregistrements. */
const note = (m, t = 'Hydarium') => hyd.call('notify', trStr(t), trStr(String(m))).catch(() => {});
let flashT; const flash = m => { $('#st').textContent = m; clearTimeout(flashT); flashT = setTimeout(() => { if (!playing) $('#st').textContent = 'Prêt'; }, 1800); toast(m, /^Erreur/.test(m) ? 'er' : 'ok'); };
function toast(m, k = 'ok') { let c = document.getElementById('toasts'); if (!c) { c = document.createElement('div'); c.id = 'toasts'; document.body.appendChild(c); } const t = document.createElement('div'); t.className = 'toast ' + k; t.textContent = m; c.appendChild(t); setTimeout(() => t.classList.add('out'), 2600); setTimeout(() => t.remove(), 3100); }
const guard = f => async (...a) => { try { await f(...a); } catch (e) { note(e.message, 'Erreur'); flash('Erreur : ' + e.message); } };
addEventListener('error', e => hyd.call('log', 'error', e.message));
addEventListener('unhandledrejection', e => hyd.call('log', 'error', String(e.reason)));
document.addEventListener('error', e => { if (e.target.tagName === 'IMG') e.target.style.visibility = 'hidden'; }, true);

const BRC = {};
let CWSET = false, ovKey = '', CFON = false, CW = '', HRUN = 0, HOBJ = null, LASTC = null, TG = null, KEYCAP = '', DEFO = null, SPS = null, selMod = '', HD = null, FVT = '', IMPW = null, srvSort = 'manual', srvCat = '';
const QS = new URLSearchParams(location.search), OVL = QS.get('overlay') || '', OVI = QS.get('inst') || '';
let ovT = OVL === 'hub' || OVL === 'modules' ? 'modules' : OVL, NP = null, SRVQ = null, UPD = [], WM = '', HID = '', HC = null, catT = 'mod', acc = null, inst = [], vers = [], page = 'home', playing = null, snaps = false, cur = null, cfg = {}, pf = {}, W = {}, st = 'gen', it = 'mods', jl = null, jlT = 0, saved = [], rid = 0, lastKey = '', CR = null, BR = null, SH = [], shI = '', shV = 0, catF = '', askRes = null, SK = null;
const hash = s => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const BIO = ['plains', 'cherry', 'sunset', 'night', 'snow', 'desert', 'nether', 'end'], BIOL = { plains: 'Plaines', cherry: 'Cerisiers', sunset: 'Crépuscule', night: 'Nuit', snow: 'Neige', desert: 'Désert', nether: 'Nether', end: 'End', jungle: 'Jungle', mesa: 'Badlands', taiga: 'Taïga', swamp: 'Marais', mushroom: 'Champignons', deepdark: 'Abysses' }, BIOALL = [...BIO, 'jungle', 'mesa', 'taiga', 'swamp', 'mushroom', 'deepdark'];
const biome = i => i.cover || BIO[hash(i.id) % BIO.length];
const cover = (i, w, h) => scene(i.srv ? 42 : hash(i.id) % 97 + 3, biome(i), w, h); // instances créées pour un serveur : toujours la même image
const ldn = l => ({ neoforge: 'NeoForge', forge: 'Forge', fabric: 'Fabric', quilt: 'Quilt', vanilla: 'Vanilla' }[l] || cap(l));
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : '';
const swc = k => `<div class="cover">${scene(11, k, 170, 96)}</div>`;
/* sélection multiple (instances en liste, serveurs) : cases à cocher + barre d’actions */
const SELI = new Set(), SELS = new Set(), SELM = new Set(); // SELM : mods cochés dans la page d’une instance ou d’un serveur
let WS = null; // fenêtre « monde ↔ serveur »
const selBox = (on, a, id) => `<div class="selbox ${on ? 'on' : ''}" data-a="${a}" data-id="${esc(id)}" title="Sélectionner" role="checkbox" aria-checked="${on}"><svg viewBox="0 0 16 16" width="12" height="12"><path d="M3 8.5l3.2 3.2L13 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`;
const selBar = (n, total, p) => `<div class="selbar ${n ? 'on' : ''}"><span>${n ? '<b>' + n + '</b> sélectionné' + (n > 1 ? 's' : '') : 'Sélection multiple'}</span><button class="btn g sm" data-a="${p}all">${n === total ? 'Tout désélectionner' : 'Tout sélectionner'}</button>${n ? `<button class="btn g sm" data-a="${p}tag">${ic('tag', 13)} Ajouter un tag…</button><button class="btn dg sm" data-a="${p === 's' ? 'sdelmany' : 'idel'}">${ic('trash', 13)} ${p === 's' ? 'Retirer' : 'Supprimer'}</button><button class="btn sec sm" data-a="${p}none">Annuler</button>` : ''}</div>`;
const modBar = (n, total) => `<div class="selbar ${n ? 'on' : ''}"><span>${n ? '<b>' + n + '</b> sélectionné' + (n > 1 ? 's' : '') : 'Sélection multiple : coche des mods pour les désactiver ou les retirer'}</span><button class="btn g sm" data-a="mselall">${n === total ? 'Tout désélectionner' : 'Tout sélectionner'}</button>${n ? `<button class="btn sec sm" data-a="mselact" data-v="off">${ic('x', 13)} Désactiver</button><button class="btn sec sm" data-a="mselact" data-v="on">${ic('refresh', 13)} Activer</button><button class="btn dg sm" data-a="mselact" data-v="remove">${ic('trash', 13)} Retirer</button><button class="btn sec sm" data-a="mselnone">Annuler</button>` : ''}</div>`;
const tagsOf = i => i.tags || [i.loader === 'vanilla' ? 'Vanilla' : 'Moddé', ...(i.cat ? [i.cat] : [])];
const tagBd = i => tagsOf(i).map(t => `<span class="bd">${esc(t)}</span>`).join('');
const hrs = s => s >= 3600 ? (s / 3600).toFixed(1).replace('.', ',') + ' h' : Math.round(s / 60) + ' min';
const ago = t => { const m = Math.round((Date.now() - t) / 6e4), en = window.UILANG === 'en'; return m < 60 ? (en ? Math.max(m, 1) + ' min ago' : 'il y a ' + Math.max(m, 1) + ' min') : m < 1440 ? (en ? Math.round(m / 60) + ' h ago' : 'il y a ' + Math.round(m / 60) + ' h') : (en ? Math.round(m / 1440) + ' d ago' : 'il y a ' + Math.round(m / 1440) + ' j'); };
const mo = n => n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' Mo' : Math.max(1, Math.round(n / 1024)) + ' Ko';
const num = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' M' : n >= 1e3 ? Math.round(n / 1e3) + ' k' : String(n);
const P = { edit: '<path d="M4 20l1-5L16 4l4 4L9 19z"/><path d="M14 6l4 4"/>', home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>', cube: '<path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M12 22V12M3 7l9 5 9-5"/>', puz: '<path d="M10 4a2 2 0 114 0v2h4v4h-2a2 2 0 100 4h2v4h-4v-2a2 2 0 10-4 0v2H6v-4h2a2 2 0 100-4H6V6h4z"/>', globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>', gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>', cam: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1"/>', play: '<path d="M7 4l13 8-13 8z" fill="currentColor"/>', folder: '<path d="M3 6h7l2 2h9v11H3z"/>', search: '<circle cx="11" cy="11" r="6"/><path d="M16 16l5 5"/>', down: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>', copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5H4v12h4"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>', back: '<path d="M15 5l-7 7 7 7"/>', plus: '<path d="M12 5v14M5 12h14"/>', grid: '<rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/>', list: '<path d="M4 6h16M4 12h16M4 18h16"/>', link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-5 15-5 16 0"/>', chev: '<path d="M9 5l7 7-7 7"/>', server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>', store: '<path d="M4 9l1-5h14l1 5M4 9v11h16V9M4 9h16M9 20v-6h6v6"/>', refresh: '<path d="M20 6v5h-5M4 18v-5h5M5.5 9A7 7 0 0118 7l2 4M18.5 15A7 7 0 016 17l-2-4"/>', cog: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>' };
const ic = (k, s = 16) => `<svg class="i" viewBox="0 0 24 24" width="${s}" height="${s}">${P[k]}</svg>`;
Object.assign(P, { wifioff: '<path d="M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8A15 15 0 0 0 10 5.1M5 12.9a10 10 0 0 1 3.2-2M19 12.9a10 10 0 0 0-4.3-2.3M8.5 16.4a5 5 0 0 1 5.8-.7M12 20h.01M2 2l20 20"/>' });
Object.assign(P, { walk: '<circle cx="13" cy="4.5" r="2"/><path d="M9 21l2-6-2-2 1-5 3-1 2 3 3 1M11 15l4 2 1 4M10 8L7 11"/>', pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>', kbd: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"/>', gauge: '<path d="M4 18a8 8 0 1116 0"/><path d="M12 18l4-6"/>', mouse: '<rect x="7" y="3" width="10" height="18" rx="5"/><path d="M12 7v4"/>', map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>', flag: '<path d="M6 21V4h11l-2 4 2 4H6"/>', shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>', flask: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3"/>', wifi: '<path d="M2 9a15 15 0 0120 0M5 12.5a10 10 0 0114 0M8.5 16a5 5 0 017 0"/><circle cx="12" cy="19.5" r="1"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>', compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>', music: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>', timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>', sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>', eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', bolt: '<path d="M13 2L5 14h6l-1 8 8-12h-6z"/>', pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>', zoom: '<circle cx="11" cy="11" r="6"/><path d="M16 16l5 5M11 8v6M8 11h6"/>', skin: '<circle cx="12" cy="7" r="3.5"/><path d="M5 21v-6a7 7 0 0114 0v6z"/>', dl: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>' });
const NAV = [['home', 'Accueil', 'home'], ['inst', 'Instances', 'cube'], ['srv', 'Serveurs', 'globe'], ['catalog', 'Catalogue', 'store'], ['shots', 'Captures', 'cam'], ['host', 'Mon serveur', 'server'], ['set', 'Paramètres', 'gear']];
const TT = { home: 'Accueil', inst: 'Instances', srv: 'Serveurs', catalog: 'Catalogue', host: 'Mon serveur', hostd: 'Mon serveur', shots: 'Captures', set: 'Paramètres', acc: 'Profil', detail: 'Instance' };
const BD = { ok: '<span class="bd ok">✔ Vérifié</span>', unverified: '<span class="bd wa">⚠ Non vérifié</span>', trusted: '<span class="bd ok">✔ Approuvé par toi</span>', cf: '<span class="bd wa">⚠ CurseForge · non vérifié</span>', missing: '<span class="bd er">✖ Mod manquant</span>', off: '<span class="bd">Désactivé</span>' };
const WALLS = [['auto', 'Selon l’heure'], ['none', 'Aucun'], ['plains', 'Plaines'], ['cherry', 'Cerisiers'], ['sunset', 'Coucher de soleil'], ['night', 'Nuit'], ['snow', 'Neige'], ['nether', 'Nether'], ['end', 'End'], ['desert', 'Désert'], ['jungle', 'Jungle'], ['mesa', 'Badlands'], ['taiga', 'Taïga'], ['swamp', 'Marais'], ['mushroom', 'Champignons'], ['deepdark', 'Abysses']];
const ACC = ['#3ddc84', '#4fa3d1', '#b388ff', '#ff7a8a', '#f5a524', '#26c6da'];
const autoK = () => { const h = new Date().getHours(); return h < 6 || h >= 21 ? 'night' : h < 9 ? 'cherry' : h < 17 ? 'plains' : 'sunset'; };
function look() { document.documentElement.dataset.theme = cfg.theme || 'dark'; document.documentElement.style.setProperty('--ac', cfg.accent || '#3ddc84'); const k = cfg.wall === 'auto' || !cfg.wall ? autoK() : cfg.wall, w = $('#wall'), key = k + (cfg.theme || ''); if (w.dataset.k !== key) { w.dataset.k = key; w.innerHTML = k === 'none' ? '' : scene(77, k, 1100, 620); } }
const refresh = async () => { inst = await call('inst:list'); render(); };
const opts = sel => vers.filter(v => v.type === 'release' || (snaps && v.type === 'snapshot')).map(v => `<option ${v.id === sel ? 'selected' : ''}>${esc(v.id)}</option>`).join('');
const stats = () => { const mods = new Set(inst.flatMap(i => i.mods.map(m => m.slug))).size; return { h: inst.reduce((a, i) => a + i.playtime, 0), n: inst.length, mods, srv: saved.length, top: [...inst].sort((a, b) => b.playtime - a.playtime).slice(0, 5) }; };
const swd = (k, l, d) => `<div class="sw"><div style="flex:1"><b>${l}</b><small>${d}</small></div><button class="swt ${cfg[k] !== false ? 'on' : ''}" data-a="swd" data-v="${k}"></button></div>`;
const sw = (k, l, d) => `<div class="sw"><div style="flex:1"><b>${l}</b><small>${d}</small></div><button class="swt ${cfg[k] ? 'on' : ''}" data-a="sw" data-v="${k}"></button></div>`;
const jlabel = j => `Java ${j.major} · ${j.vendor} · ${j.is64 ? '64' : '32'} bits${j.bundled ? ' · fourni par Hydarium' : j.system ? ' · du système' : j.custom ? ' · ajouté' : ''}`;
const javas = async force => { if (!jl || force || Date.now() - jlT > 3e4) { jl = await call('java:list', !!force).catch(() => []); jlT = Date.now(); } return jl; };
const srvTile = (x, bg) => x.net === 'down' ? `<div class="mt" style="background:#2a3140;display:flex;align-items:center;justify-content:center;color:#9aa4b5" title="Pas de connexion Internet">${ic('wifioff', 26)}</div>` : tile(x.icon, x.name, bg); // connexion perdue : icône « pas de wifi » à la place de l'image
const tile = (src, t, bg) => src ? `<img class="mt" src="${esc(src)}" alt="">` : `<div class="mt" style="background:${bg || '#2a3140'}">${esc((t || '?')[0].toUpperCase())}</div>`;
const byId = id => inst.find(i => i.id === id);

/* ===== fenêtres (modales) : remplacent confirm(), qui bloque la saisie dans Electron ===== */
const openModal = (h, wide) => { const m = $('#modal'); m.innerHTML = `<div class="box ${wide ? 'w' : ''}">${h}</div>`; m.hidden = false; };
function closeModal() { ANN = null; const m = $('#modal'); m.hidden = true; m.innerHTML = ''; const r = askRes; askRes = null; if (r) r(false); }
const ask3 = (title, text, onlyLbl, allLbl) => new Promise(r => { askRes = r; openModal(`<h3>${title}</h3><p>${text}</p><div class="row end" style="flex-wrap:wrap"><button class="btn sec" data-a="mclose">Annuler</button><button class="btn g" data-a="mok3" data-v="only">${onlyLbl}</button><button class="btn dg" data-a="mok3" data-v="all">${allLbl}</button></div>`); });
const ask = (title, text, ok = 'Confirmer', danger = true) => new Promise(r => { askRes = r; openModal(`<h3>${title}</h3><p>${text}</p><div class="row end"><button class="btn sec" data-a="mclose">Annuler</button><button class="btn ${danger ? 'dg' : ''}" data-a="mok">${ok}</button></div>`); });

/* ----- cartes d’instances ----- */
const sub = i => i.loader === 'vanilla' ? 'Minecraft ' + i.version : ldn(i.loader) + ' ' + i.version + ' · ' + i.mods.length + ' mod(s)';
const act = i => `<button class="ib" title="Catégorie" data-a="cat" data-id="${esc(i.id)}">${ic('tag', 14)}</button><button class="ib" title="Supprimer" data-a="del" data-id="${esc(i.id)}">${ic('trash', 14)}</button>`;
const playB = (id, cls = '') => cls === 'big' ? `<button class="playbig" data-a="play" data-id="${esc(id)}" ${playing ? 'disabled' : ''}><span class="pi">${ic('play', 18)}</span><span class="pt"><b>${playing ? 'Jeu en cours' : 'Jouer'}</b><small>${playing ? 'un jeu est déjà lancé' : 'reprendre maintenant'}</small></span></button>` : `<button class="btn ${cls}" data-a="play" data-id="${esc(id)}" ${playing ? 'disabled' : ''}>${ic('play', 13)} Jouer</button>`;
const gcard = i => `<div class="card gc" data-a="open" data-id="${esc(i.id)}"><div class="cover">${cover(i, 320, 140)}<span class="tag">${ldn(i.loader)}</span><span class="tr">${act(i)}</span></div><button class="fab" title="Jouer" data-a="play" data-id="${esc(i.id)}" ${playing ? 'disabled' : ''}>${ic('play', 15)}<span>Jouer</span></button><div class="cb"><b>${esc(i.name)}</b><small>${sub(i)}</small><small>${i.lastPlayed ? 'joué ' + ago(i.lastPlayed) : 'jamais joué'} · ${hrs(i.playtime)}</small><div class="tgs">${tagBd(i)}</div></div></div>`;
const lcard = i => `<div class="card hv ${SELI.has(i.id) ? 'sel' : ''}" data-a="open" data-id="${esc(i.id)}"><div class="ic">${selBox(SELI.has(i.id), 'isel', i.id)}<div class="cover th">${cover(i, 168, 100)}</div><div><b>${esc(i.name)}</b> ${tagBd(i)}<small>${sub(i)} · ${i.lastPlayed ? 'joué ' + ago(i.lastPlayed) : 'jamais joué'} · ${hrs(i.playtime)}</small></div></div><div class="row">${playB(i.id, 'sm')}${act(i)}</div></div>`;

let SRVC = null;
const homeSrv = l => { const list = (l || saved.map(x => ({ ...x, online: null }))).slice(0, 4); return list.map(x => `<div class="card"><div class="ic">${srvTile(x, '#3a4a6a')}<div><b>${esc(x.name)}</b><small>${esc(x.addr)}${x.online ? ' · en ligne · ' + x.players + '/' + x.max + ' joueurs' : x.online === false ? ' · hors ligne' : ''}</small></div></div><button class="btn sm" data-a="join" data-v="${esc(x.addr)}" ${playing ? 'disabled' : ''}>${ic('play', 12)} Rejoindre</button></div>`).join('') || '<div class="card"><span class="mu">Aucun serveur ajouté pour l’instant.</span><button class="btn sm" data-a="p" data-v="srv">Ajouter un serveur</button></div>'; };
const homeSrvFill = () => { if (page !== 'home' || !saved.length) return; call('srv:list').then(l => { SRVC = l; const e = $('#homesrv'); if (e && page === 'home') e.innerHTML = homeSrv(l); }).catch(() => {}); };
function home() {
  const s = [...inst].sort((a, b) => b.lastPlayed - a.lastPlayed), h = s[0];
  const hero = h ? `<div class="hero cover">${cover(h, 640, 240)}<div class="hshade"></div><div class="hc"><div class="mu">Reprendre là où tu t’es arrêté</div><h1>${esc(h.name)}</h1><div class="mu">${sub(h)} · ${h.lastPlayed ? 'joué ' + ago(h.lastPlayed) : 'jamais joué'} · ${hrs(h.playtime)} au total</div><div class="row">${playB(h.id, 'big')}<button class="btn sec big" style="font-size:13px" data-a="open" data-id="${esc(h.id)}">Ouvrir l’instance</button></div></div></div>`
    : `<div class="hero cover">${scene(5, 'plains', 640, 240)}<div class="hshade"></div><div class="hc"><h1>Bienvenue sur Hydarium</h1><div class="mu">Crée ta première instance pour commencer à jouer.</div><div class="row"><button class="btn big" data-a="newInst">Nouvelle instance</button><button class="btn sec big" style="font-size:13px" data-a="impmenu">Importer…</button></div></div></div>`;
  return (acc ? '' : '<div class="note">Connecte-toi avec Microsoft pour jouer. <button class="btn sm" data-a="login">Se connecter</button></div>') + hero +
    `<div class="sh"><h3>Récemment joué</h3><a data-a="p" data-v="inst">Tout voir</a></div><div class="hrow"><div class="g3 hg">${s.slice(0, 4).map((i, k) => `<div class="rw r${k + 1}">${gcard(i)}</div>`).join('')}<div class="card add" data-a="newInst"><div><div style="font-size:26px">＋</div><b style="color:var(--tx)">Nouvelle instance</b><br><span class="mu">Version, loader, mods ou code</span></div></div></div></div>
    <div class="sh"><h3>Mes serveurs</h3><a data-a="p" data-v="srv">Tout voir</a></div><div id="homesrv">${homeSrv(SRVC)}</div>
    <div class="two"><div><div class="sh"><h3>Quêtes du mois</h3></div><div class="card soon"><div><b>Bientôt disponible</b><small>Des quêtes à terminer pour gagner des récompenses.</small></div></div></div>
    <div><div class="sh"><h3>Amis en ligne</h3></div><div class="card soon"><div><b>Bientôt disponible</b><small>Vois qui joue et rejoins-le en un clic.</small></div></div></div></div>`;
}
function instPage() {
  const tags = [...new Set(inst.flatMap(tagsOf))].sort((a, b) => (['Vanilla', 'Moddé'].indexOf(b) + 1) - (['Vanilla', 'Moddé'].indexOf(a) + 1) || a.localeCompare(b));
  if (catF && !tags.includes(catF)) catF = '';
  const l = inst.filter(i => !catF || tagsOf(i).includes(catF)), grid = (cfg.view || 'grid') === 'grid';
  if (!vers.length) call('versions').then(v => { vers = v; }).catch(e => note(e.message, 'Erreur'));
  return `<div class="row between" style="margin-bottom:12px"><div class="row"><button class="btn" data-a="newInst">${ic('plus', 14)} Nouvelle instance</button><button class="btn g" data-a="impmenu">${ic('down', 14)} Importer…</button></div><div class="seg"><button class="${grid ? 'a' : ''}" data-a="view" data-v="grid" title="Grille">${ic('grid', 15)}</button><button class="${grid ? '' : 'a'}" data-a="view" data-v="list" title="Liste">${ic('list', 15)}</button></div></div>
  ${inst.length ? `<div class="chips"><span class="chip ${catF ? '' : 'a'}" data-a="catf" data-v="">Toutes (${inst.length})</span>${tags.map(c => `<span class="chip ${catF === c ? 'a' : ''}" data-a="catf" data-v="${esc(c)}">${esc(c)} (${inst.filter(i => tagsOf(i).includes(c)).length})</span>`).join('')}</div>` : ''}
  ${!grid && l.length ? selBar(l.filter(i => SELI.has(i.id)).length, l.length, 'i') : ''}
  ${l.length ? (grid ? `<div class="g3">${l.map(gcard).join('')}</div>` : l.map(lcard).join('')) : `<p class="mu" style="text-align:center;padding:30px">Aucune instance${catF ? ' avec ce tag' : ''}. Clique sur « Nouvelle instance » ou « Importer… ».</p>`}`;
}
const modsSplit = (list, fn, empty) => { const on = list.filter(x => !x.disabled), off = list.filter(x => x.disabled); return (on.length ? `<div class="sh"><h3>Actifs (${on.length})</h3></div>` + on.map(fn).join('') : '') + (off.length ? `<div class="sh"><h3>Désactivés (${off.length})</h3></div>` + off.map(fn).join('') : '') || empty; };
/* ----- page d’instance ----- */
const fileCard = (x, type) => `<div class="card"><div class="ic">${tile(x.icon, x.title, type === 'shader' ? '#c9a227' : '#4f9d6a')}<div><b>${esc(x.title)}</b><small>${x.enabled ? '<span style="color:var(--ac)">Activé</span>' : 'Désactivé'} · ${x.size ? mo(x.size) : 'dossier'} · ${esc(x.name)}</small></div></div><div class="row"><button class="btn sm ${x.enabled ? 'sec' : ''}" data-a="pkTog" data-t="${type}" data-n="${esc(x.name)}">${x.enabled ? 'Désactiver' : 'Activer'}</button><button class="ib" title="Supprimer" data-a="pkRm" data-t="${type}" data-n="${esc(x.name)}">${ic('trash', 14)}</button></div></div>`;
async function packsTab(i, type) {
  const l = await call('content:list', i.id, type), shader = type === 'shader', nm = shader ? 'shader' : 'pack de ressources';
  const iris = i.mods.some(m => m.slug === 'iris' || m.slug === 'oculus');
  return `<div class="row between" style="margin-bottom:10px"><p class="mu" style="margin:0">${shader ? 'Active, télécharge ou importe tes shaders.' : 'Active, télécharge ou importe tes packs de ressources. Le dernier activé est prioritaire.'}</p><div class="row"><button class="btn sec sm" data-a="browse" data-t="${type}">${ic('search', 13)} Télécharger</button><button class="btn sm" data-a="pkImp" data-t="${type}">${ic('down', 13)} Importer un ${nm}</button><button class="btn g sm" data-a="folder" data-id="${esc(i.id)}" data-sub="${shader ? 'shaderpacks' : 'resourcepacks'}">${ic('folder', 13)}</button></div></div>
  ${shader && !iris ? `<div class="note" style="border-color:var(--wa)">Les shaders ont besoin du mod <b>Iris</b>. <button class="btn sm" data-a="addIris">Installer Iris</button></div>` : ''}
  ${l.map(x => fileCard(x, type)).join('') || `<p class="mu" style="text-align:center;padding:20px">Aucun ${nm}. Télécharge-en un ou importe un fichier .zip.</p>`}`;
}
async function worldsTab(i) {
  const l = await call('worlds:list', i.id);
  return `<div class="row between" style="margin-bottom:10px"><p class="mu" style="margin:0">Les mondes de cette instance. Une sauvegarde est copiée dans le dossier <i>backups</i>.</p><div class="row"><button class="btn sec sm" data-a="mapdl">${ic('search', 13)} Télécharger des maps</button><button class="btn sm" data-a="wImp" data-k="dir">${ic('down', 13)} Importer un dossier</button><button class="btn sm" data-a="wImp" data-k="zip">${ic('down', 13)} Importer un .zip</button><button class="btn g sm" data-a="folder" data-id="${esc(i.id)}" data-sub="saves">${ic('folder', 13)}</button></div></div>
  ${l.map(w => `<div class="card"><div class="ic">${w.icon ? `<img class="mt" style="image-rendering:pixelated" src="${w.icon}" alt="">` : tile('', w.folder, '#3a4a6a')}<div><b>${esc(w.folder)}</b><small>modifié ${ago(w.mtime)}${w.valid ? '' : ' · dossier sans level.dat'}${w.srv ? ' · relié au serveur « ' + esc(w.srv) + ' »' + (w.srvOn ? ' (en ligne : « Rejoindre le serveur »)' : '') : ''}</small></div></div><div class="row"><button class="btn sm" data-a="wPlay" data-w="${esc(w.folder)}" ${playing ? 'disabled' : ''} ${w.srvOn ? 'title="Ce monde est ouvert par ton serveur : tu le rejoins en ligne"' : ''}>${ic('play', 12)} ${w.srvOn ? 'Rejoindre le serveur' : 'Jouer'}</button><button class="btn g sm" data-a="wSet" data-w="${esc(w.folder)}">${ic('cog', 12)} Paramètres</button><button class="btn g sm" data-a="wOp" data-op="backup" data-w="${esc(w.folder)}">Sauvegarder</button><button class="btn g sm" data-a="wOp" data-op="dup" data-w="${esc(w.folder)}">Dupliquer</button><button class="btn g sm" data-a="wExp" data-w="${esc(w.folder)}" title="Copie ce monde dans une autre instance" ${w.valid ? '' : 'disabled'}>${ic('copy', 12)} Exporter</button><button class="btn g sm" data-a="w2s" data-w="${esc(w.folder)}" title="Crée un serveur à partir de ce monde (relié ou copié)" ${w.valid ? '' : 'disabled'}>${ic('link', 12)} Serveur</button><button class="ib" title="Supprimer" data-a="wOp" data-op="delete" data-w="${esc(w.folder)}">${ic('trash', 14)}</button></div></div>`).join('') || '<p class="mu" style="text-align:center;padding:20px">Aucun monde. Lance l’instance pour en créer un, ou importes-en un.</p>'}`;
}
async function cfgTab(i) {
  const L = await javas(), o = await call('opts:get', i.id).catch(() => ({})), r = i.res || { mode: 'default', w: 1280, h: 720 }, S = (v, a) => v == a ? 'selected' : '', cats = [...new Set(inst.map(x => x.cat).filter(Boolean))];
  const rg = (k, l, mn, mx, u) => `<div class="fld"><label>${l} : <b id="v-${k}">${o[k] || '—'}${o[k] ? u : ''}</b></label><input type="range" min="${mn}" max="${mx}" value="${o[k] || mn}" data-opt="${k}" data-live="v-${k}" data-unit="${u}" style="width:100%"></div>`;
  const ck = (k, l) => `<label class="ckb"><input type="checkbox" data-opt="${k}" ${o[k] === 'true' ? 'checked' : ''}> ${l}</label>`;
  return `<div class="card col"><h3>Général</h3><div class="two2"><div class="fld"><label>Nom</label><input data-iset="name" value="${esc(i.name)}" maxlength="40"></div><div class="fld"><label>Tags</label><div class="row">${tagBd(i)}<button class="btn g sm" data-a="cat" data-id="${esc(i.id)}">Modifier…</button></div></div></div>
  <div class="fld"><label>Notes</label><textarea data-iset="notes" rows="2" maxlength="500" placeholder="Ce que contient cette instance…">${esc(i.notes || '')}</textarea></div>
  <div class="fld"><label>Couverture</label><div class="wps small"><div class="wp ${i.cover ? '' : 'a'}" data-a="cover" data-v="">${swc(BIO[hash(i.id) % 8])}<div class="l">Auto</div></div>${BIOALL.map(k => `<div class="wp ${i.cover === k ? 'a' : ''}" data-a="cover" data-v="${k}">${swc(k)}<div class="l">${BIOL[k]}</div></div>`).join('')}</div></div></div>
  <div class="card col"><h3>Java et mémoire</h3><div class="fld"><label>Java · Minecraft ${esc(i.version)} demande Java ${esc(String(await call('inst:detail', i.id).then(d => d.need)))}</label><select data-iset="java"><option value="">Automatique (recommandé)</option>${L.map(j => `<option value="${esc(j.path)}" ${i.java === j.path ? 'selected' : ''}>${esc(jlabel(j))}</option>`).join('')}</select></div><div class="row" style="margin-top:6px"><button class="btn g sm" data-a="javaadd">Ajouter un Java…</button></div>
  <div class="two2"><div class="fld"><label>Mémoire maximale : <b id="v-mem">${i.mem || 4} Go</b></label><input type="range" min="1" max="32" value="${i.mem || 4}" data-iset="mem" data-live="v-mem" data-unit=" Go" style="width:100%"></div><div class="fld"><label>Mémoire minimale</label><select data-iset="minMem" data-num="1">${[1, 2, 4, 8].map(g => `<option value="${g}" ${S(g, i.minMem || 1)}>${g} Go</option>`).join('')}</select></div></div>
  <div class="fld"><label>Arguments JVM (avancé) : par exemple -XX:+UseG1GC</label><input data-iset="jvm" id="jvm" value="${esc(i.jvm || '')}"><div class="chips" style="margin-top:6px"><span class="chip" data-a="jvmp" data-v="-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M">Préréglage fluidité (G1GC)</span><span class="chip" data-a="jvmp" data-v="">Vider</span></div></div></div>
  <div class="card col"><h3>Affichage au lancement</h3><div class="row"><select id="rmode" data-res="1"><option value="default" ${S('default', r.mode)}>Par défaut (réglage du jeu)</option><option value="window" ${S('window', r.mode)}>Fenêtre</option><option value="full" ${S('full', r.mode)}>Plein écran</option></select><input id="rw" data-res="1" type="number" min="400" max="7680" value="${r.w}" style="width:90px"> × <input id="rh" data-res="1" type="number" min="300" max="4320" value="${r.h}" style="width:90px"></div><small>Si le jeu plante au démarrage en plein écran, préfère « Fenêtre ».</small></div>
  <div class="card col"><div class="row between"><h3>Options du jeu</h3><button class="btn g sm" data-a="defapply" title="Applique le FOV, les touches… définis dans Paramètres › Nouvelles instances">Appliquer mes réglages par défaut</button></div>${o.exists ? '' : '<small>Le jeu n’a pas encore été lancé : ces réglages seront appliqués dès son premier démarrage.</small>'}<div class="two2">${rg('renderDistance', 'Distance d’affichage', 2, 32, ' chunks')}${rg('maxFps', 'FPS maximum (260 = illimité)', 10, 260, '')}</div><div class="two2">${rg('guiScale', 'Échelle de l’interface (0 = auto)', 0, 4, '')}<div class="fld"><label>Langue du jeu</label><select data-opt="lang">${[['fr_fr', 'Français'], ['en_us', 'English (US)'], ['es_es', 'Español'], ['de_de', 'Deutsch'], ['it_it', 'Italiano'], ['pt_br', 'Português (BR)']].map(([k, l]) => `<option value="${k}" ${S(k, o.lang)}>${l}</option>`).join('')}</select></div></div>
  <div class="two2" style="margin-top:6px">${(() => { const fv = o.fov === undefined ? 70 : Math.round(70 + parseFloat(o.fov) * 40), gm = o.gamma === undefined ? 50 : Math.round(parseFloat(o.gamma) * 100), ms = o.mouseSensitivity === undefined ? 100 : Math.round(parseFloat(o.mouseSensitivity) * 200); return `<div class="fld"><label>FOV : <b id="v-fov">${fv}°</b></label><input type="range" min="30" max="110" value="${fv}" data-optc="fov" data-live="v-fov" data-unit="°" style="width:100%"></div><div class="fld"><label>Luminosité : <b id="v-gamma">${gm} %</b></label><input type="range" min="0" max="100" value="${gm}" data-optc="gamma" data-live="v-gamma" data-unit=" %" style="width:100%"></div><div class="fld"><label>Sensibilité : <b id="v-ms">${ms} %</b></label><input type="range" min="0" max="200" value="${ms}" data-optc="mouseSensitivity" data-live="v-ms" data-unit=" %" style="width:100%"></div>`; })()}</div>
  <div class="row" style="gap:18px;margin-top:8px">${ck('fullscreen', 'Plein écran dans le jeu')}${ck('enableVsync', 'Synchronisation verticale')}${ck('entityShadows', 'Ombres des entités')}${ck('viewBobbing', 'Balancement de la vue')}${ck('pauseOnLostFocus', 'Pause si la fenêtre perd le focus')}</div></div>
  <div class="card col"><h3>Lancement</h3><div class="fld"><label>Rejoindre automatiquement un serveur</label><select data-iset="autoServer"><option value="">Non</option>${saved.map(s => `<option value="${esc(s.addr)}" ${S(s.addr, i.autoServer)}>${esc(s.name)} (${esc(s.addr)})</option>`).join('')}</select></div><div class="fld"><label>Arguments du jeu (avancé)</label><input data-iset="args" value="${esc(i.args || '')}" placeholder="--demo"></div></div>
  <div class="card col"><h3>Dossiers</h3><div class="row">${[['', 'Instance'], ['mods', 'Mods'], ['saves', 'Mondes'], ['resourcepacks', 'Packs'], ['shaderpacks', 'Shaders'], ['screenshots', 'Captures']].map(([s, l]) => `<button class="btn g sm" data-a="folder" data-id="${esc(i.id)}" data-sub="${s}">${ic('folder', 13)} ${l}</button>`).join('')}</div></div>
  <div class="sh"><h3>Statistiques</h3></div><div class="stat"><div class="card"><span class="mu">Temps de jeu</span><b>${hrs(i.playtime)}</b></div><div class="card"><span class="mu">Dernière session</span><b style="font-size:18px">${i.lastPlayed ? ago(i.lastPlayed) : 'jamais'}</b></div><div class="card"><span class="mu">Mods</span><b>${i.mods.length}</b></div></div>
  <div class="row" style="margin-top:14px"><button class="btn sec" data-a="dup" data-id="${esc(i.id)}">${ic('copy', 14)} Dupliquer</button><button class="btn sec" data-a="code" data-id="${esc(i.id)}">${ic('link', 14)} Code de partage</button><button class="btn dg" data-a="del" data-id="${esc(i.id)}">${ic('trash', 14)} Supprimer</button></div>`;
}
/* « Hydarium Client » : le mod en jeu, présenté comme un mod de la liste (logo, état), non supprimable mais désactivable. Ses réglages se font en jeu (menu Alt+H). */
async function clientEntry(i) {
  const st = await call('client:status', i.id).catch(() => ({ mod: 'none' })), off = !!(i.client && i.client.disabled), key = esc(cfg.overlayKey === undefined ? 'Alt+H' : cfg.overlayKey);
  const MSG = { ok: 'Chargé automatiquement au lancement.', disabled: 'Désactivé : le jeu démarre sans le client (pas de HUD, zoom…).', missing: 'Pas encore construit pour cette version : il sera créé automatiquement.', building: 'Création du mod pour cette version en arrière-plan (quelques minutes la première fois ; ensuite toutes tes instances de cette version l’utilisent).', failed: 'La création du mod pour cette version a échoué : le jeu démarre sans lui (seul le HUD du launcher est utilisé).', forge189: '1.8.9 : demande Forge pour fonctionner.', unsupported: 'Pas de mod Hydarium pour cette version de Minecraft ni ce loader : seul le HUD du launcher est utilisé.', none: '' };
  const warn = !off && (st.mod === 'missing' || st.mod === 'forge189' || st.mod === 'unsupported' || st.mod === 'failed'), why = !off && (st.mod === 'unsupported' && st.reason ? ' ' + esc(st.reason) : st.mod === 'failed' && st.error ? ' <small class="mu">(' + esc(String(st.error).split('\n')[0].slice(0, 160)) + ')</small>' : '');
  const build = off ? '' : st.mod === 'building' ? `<span class="mu" id="mod-pct">${esc(st.text || 'Création…')} ${st.pct || 0}%</span>` : (st.mod === 'missing' || st.mod === 'failed') && st.canBuild ? `<button class="btn sec sm" data-a="buildmod" data-id="${esc(i.id)}">${st.mod === 'failed' ? 'Réessayer' : 'Construire maintenant'}</button>` : '';
  return `<div class="card ${off ? 'dim' : ''}" style="${off ? '' : 'border-color:color-mix(in srgb,var(--ac) 45%,var(--ln))'}"><div class="ic"><img class="mt" src="logo.png" alt="" style="border-radius:8px;background:#0b0d11"><div><b>Hydarium Client</b> <span class="bd ok">Obligatoire</span> ${off ? BD.off : ''}<small>${warn ? '<span style="color:var(--wa)">' + MSG[st.mod] + why + '</span>' : MSG[off ? 'disabled' : st.mod] || ''} Réglages, widgets et touches : <b>${key}</b> en jeu.</small></div></div><div class="row">${build}<button class="swt ${off ? '' : 'on'}" title="${off ? 'Activer' : 'Désactiver'} Hydarium Client" data-a="clienttog"></button></div></div>`;
}
async function detailView() {
  const d = await call('inst:detail', cur), i = d.inst, van = i.loader === 'vanilla';
  const tabs = [['mods', 'Mods'], ['worlds', 'Mondes'], ['packs', 'Packs de ressources'], ...(van ? [] : [['shaders', 'Shaders']]), ['shots', 'Captures'], ['cfg', 'Paramètres']];
  if (!tabs.some(t => t[0] === it)) it = 'mods';
  let b = '';
  const CE = it === 'mods' ? await clientEntry(i) : '';
  if (it === 'mods') b = CE + (van ? '<p class="mu">Instance Vanilla : aucun autre mod. Crée une instance Fabric ou Quilt pour en ajouter.</p>' : `${d.conflicts.map(c => `<div class="note" style="border-color:var(--er)">✖ Incompatibilité : <b>${esc(c.a)}</b> et <b>${esc(c.b)}</b> : le jeu ne se lancera pas. <button class="btn sm" data-a="rm" data-pid="${esc(c.fix)}">Retirer ${esc(c.b)}</button></div>`).join('')}
    <div class="row between" style="margin-bottom:8px"><b>${d.mods.length} mod(s)</b><div class="row"><button class="btn sec sm" data-a="modupd">${ic('refresh', 13)} Mises à jour</button><button class="btn sec sm" data-a="modimp">${ic('down', 13)} Importer un .jar</button>${d.mods.length ? (d.mods.some(m => !m.disabled) ? `<button class="btn sec sm" data-a="modoffall" data-v="0" data-n="${d.mods.filter(m => !m.disabled).length}" title="Désactive tous les mods d’un coup, sans les supprimer">${ic('x', 13)} Tout désactiver</button>` : `<button class="btn sec sm" data-a="modoffall" data-v="1" data-n="${d.mods.length}" title="Réactive tous les mods">${ic('refresh', 13)} Tout activer</button>`) : ''}<button class="btn sm" data-a="browse" data-t="mod">${ic('plus', 13)} Ajouter des mods</button></div></div>
    ${d.mods.length ? modBar(d.mods.filter(m => SELM.has(m.pid)).length, d.mods.length) : ''}
    ${modsSplit(d.mods, x => `<div class="card ${x.disabled ? 'dim' : ''} ${SELM.has(x.pid) ? 'sel' : ''}"><div class="ic">${selBox(SELM.has(x.pid), 'msel', x.pid)}${tile(x.icon, x.title)}<div><b>${esc(x.title)}</b> ${x.disabled ? BD.off : BD[x.status]}<small>${x.auto ? 'dépendance automatique · ' : ''}${esc(x.file)}</small></div></div><div class="row">${x.status === 'unverified' || x.status === 'cf' || x.status === 'trusted' ? `<button class="btn g sm" data-a="modtrust" data-pid="${esc(x.pid)}" data-on="${x.status === 'trusted' ? '' : '1'}" title="Ne plus afficher l’avertissement « non vérifié » pour ce mod">${x.status === 'trusted' ? 'Retirer la confiance' : 'Faire confiance'}</button>` : ''}<button class="swt ${x.disabled ? '' : 'on'}" title="${x.disabled ? 'Activer' : 'Désactiver'}" data-a="modtog" data-pid="${esc(x.pid)}"></button><button class="ib" title="Retirer" data-a="rm" data-pid="${esc(x.pid)}">${ic('x', 14)}</button></div></div>`, '<p class="mu" style="text-align:center;padding:20px">Aucun mod. Clique sur « Ajouter des mods » : les plus populaires s’affichent directement.</p>')}`);
  else if (it === 'worlds') b = await worldsTab(i);
  else if (it === 'packs') b = await packsTab(i, 'resourcepack');
  else if (it === 'shaders') b = await packsTab(i, 'shader');
  else if (it === 'shots') { SH = (await call('shots:list')).filter(s => s.inst === i.id); b = shotsGrid(SH, 'Aucune capture dans cette instance. Prends-en une dans le jeu avec F2.'); }
  else b = await cfgTab(i);
  return `<div class="hero cover" style="height:150px">${cover(i, 640, 150)}<div class="hshade"></div><button class="btn sec sm" style="position:absolute;left:14px;top:14px" data-a="p" data-v="inst">${ic('back', 13)} Retour</button><div class="hc"><h1 style="font-size:24px">${esc(i.name)}</h1><div class="mu">${sub(i)} · ${hrs(i.playtime)} de jeu${i.notes ? ' · ' + esc(i.notes.slice(0, 60)) : ''}</div><div class="row">${playB(i.id)}<button class="btn sec" data-a="folder" data-id="${esc(i.id)}">${ic('folder', 14)} Dossier</button><button class="btn sec" data-a="code" data-id="${esc(i.id)}">${ic('link', 14)} Partager</button></div></div></div><div id="cdb"></div>
  <div class="tabs" style="margin-top:14px">${tabs.map(([k, l]) => `<a class="${it === k ? 'a' : ''}" data-a="it" data-v="${k}">${l}</a>`).join('')}</div>` + b;
}

/* ----- captures ----- */
const dayF = t => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
function shotsGrid(l, empty) {
  if (!l.length) return `<p class="mu" style="text-align:center;padding:30px">${empty}</p>`;
  let day = '', h = '';
  l.forEach((s, n) => { const d = dayF(s.mtime); if (d !== day) { if (day) h += '</div>'; day = d; h += `<div class="sh"><h3>${d}</h3></div><div class="shg">`; } h += `<div class="shot" data-a="shot" data-i="${n}"><img data-th="${esc(s.inst)}|${esc(s.file)}" alt=""><span>${esc(s.name)}</span></div>`; });
  return h + '</div>';
}
async function shotsView() {
  const all = await call('shots:list'), l = all.filter(s => !shI || s.inst === shI); SH = l;
  const insts = inst.filter(i => all.some(s => s.inst === i.id));
  return `<div class="row between" style="margin-bottom:10px"><div class="chips" style="margin:0"><span class="chip ${shI ? '' : 'a'}" data-a="shF" data-v="">Toutes (${all.length})</span>${insts.map(i => `<span class="chip ${shI === i.id ? 'a' : ''}" data-a="shF" data-v="${esc(i.id)}">${esc(i.name)}</span>`).join('')}</div><button class="btn g sm" data-a="shFolders">${ic('folder', 13)} Dossiers</button></div>${shotsGrid(l, 'Aucune capture. Dans Minecraft, appuie sur F2 : les captures de toutes tes instances apparaîtront ici.')}`;
}
let shObs;
function lazyThumbs() {
  if (shObs) shObs.disconnect();
  shObs = new IntersectionObserver(es => es.forEach(e => { if (!e.isIntersecting) return; shObs.unobserve(e.target); const [a, b] = e.target.dataset.th.split('|'); call('shots:thumb', a, b).then(s => { e.target.src = s; }).catch(() => {}); }), { root: $('#main'), rootMargin: '300px' });
  document.querySelectorAll('img[data-th]').forEach(i => shObs.observe(i));
}
async function shotModal(n) {
  const s = SH[n]; if (!s) return closeModal(); SH.cur = n;
  openModal(`<div class="shv"><div class="shimg"><div class="spin"></div></div><div class="row between" style="margin-top:10px"><div class="row"><button class="btn sec sm" data-a="shNav" data-v="-1" ${n ? '' : 'disabled'}>${ic('back', 13)}</button><button class="btn sec sm" data-a="shNav" data-v="1" ${n < SH.length - 1 ? '' : 'disabled'}>${ic('chev', 13)}</button><span class="mu">${n + 1} / ${SH.length}</span></div><div class="row"><button class="btn sm" data-a="shAnn">${ic('edit', 13)} Annoter</button><button class="btn sec sm" data-a="shOp" data-op="copy">${ic('copy', 13)} Copier</button><button class="btn sec sm" data-a="shOp" data-op="reveal">${ic('folder', 13)} Dossier</button><button class="btn sec sm" data-a="shOp" data-op="open">Ouvrir</button><button class="btn dg sm" data-a="shOp" data-op="delete">${ic('trash', 13)}</button><button class="btn sm" data-a="mclose">Fermer</button></div></div><small style="margin-top:6px">${esc(s.name)} · ${esc(s.file)} · ${new Date(s.mtime).toLocaleString('fr-FR')} · ${mo(s.size)}</small></div>`, true);
  const f = await call('shots:full', s.inst, s.file).catch(() => null); const box = $('.shimg'); if (box && SH.cur === n) box.innerHTML = f && f.src ? `<img src="${f.src}" alt="">` : '<span class="mu">Impossible d’afficher cette image.</span>';
}

/* ----- annotation rapide d’une capture : crayon, flèche, cadre, texte ; copie ou enregistrement d’une copie ----- */
let ANN = null;
const ANN_COL = ['#ff3b30', '#ffcc00', '#34c759', '#0a84ff', '#ffffff', '#000000'];
async function annotate() {
  const s = SH[SH.cur]; if (!s) return;
  openModal(`<div class="ann"><div class="annbar"><div class="seg">${[['pen', 'Crayon', 'P'], ['arrow', 'Flèche', 'A'], ['rect', 'Cadre', 'R'], ['text', 'Écrire', 'T']].map(([k, l, h]) => `<button data-an="tool" data-v="${k}" title="${l} (${h})">${l}</button>`).join('')}</div><div class="anncol">${ANN_COL.map(c => `<i data-an="col" data-v="${c}" style="background:${c}"></i>`).join('')}</div><select data-an="w" title="Épaisseur du trait"><option value="1">Trait fin</option><option value="2" selected>Trait moyen</option><option value="4">Trait épais</option></select><button class="btn sec sm" data-an="undo" title="Annuler le trait (Ctrl+Z)">${ic('back', 13)}</button><button class="btn sec sm" data-an="clear">Tout effacer</button></div><div class="annst"><div class="spin"></div></div><div class="row between" style="margin-top:10px"><small class="mu">Dessine sur l’image · l’original n’est jamais modifié</small><div class="row"><button class="btn sec sm" data-an="copy">${ic('copy', 13)} Copier l’image</button><button class="btn sm" data-an="save">Enregistrer une copie</button><button class="btn sec sm" data-an="close">Fermer</button></div></div></div>`, true);
  const o = await call('shots:orig', s.inst, s.file).catch(() => null), st = $('.annst'); if (!st) return;
  if (!o || !o.src) { st.innerHTML = '<span class="mu">Impossible d’ouvrir cette image.</span>'; return; }
  const img = await loadImg(o.src); if (!img || !$('.annst')) return;
  const cv = document.createElement('canvas'); cv.width = o.w; cv.height = o.h; st.innerHTML = ''; st.appendChild(cv);
  const g = cv.getContext('2d'), A = ANN = { s, cv, g, img, ops: [], cur: null, tool: 'pen', col: ANN_COL[0], k: 2, W: o.w, box: null };
  const lw = () => Math.max(2, Math.round(A.W / 400)) * A.k, fs = () => Math.round(A.W / 42) * (A.k === 1 ? .8 : A.k === 4 ? 1.4 : 1);
  const draw = op => {
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = g.fillStyle = op.c; g.lineWidth = op.w;
    if (op.t === 'pen') { g.beginPath(); op.p.forEach(([x, y], n) => n ? g.lineTo(x, y) : g.moveTo(x, y)); if (op.p.length === 1) g.lineTo(op.p[0][0] + .01, op.p[0][1]); g.stroke(); }
    else if (op.t === 'rect') g.strokeRect(op.x1, op.y1, op.x2 - op.x1, op.y2 - op.y1);
    else if (op.t === 'arrow') {
      const a = Math.atan2(op.y2 - op.y1, op.x2 - op.x1), h = op.w * 5 + 8;
      g.beginPath(); g.moveTo(op.x1, op.y1); g.lineTo(op.x2 - Math.cos(a) * h * .6, op.y2 - Math.sin(a) * h * .6); g.stroke();
      g.beginPath(); g.moveTo(op.x2, op.y2); g.lineTo(op.x2 - h * Math.cos(a - .45), op.y2 - h * Math.sin(a - .45)); g.lineTo(op.x2 - h * Math.cos(a + .45), op.y2 - h * Math.sin(a + .45)); g.closePath(); g.fill();
    } else if (op.t === 'text') {
      g.font = `700 ${op.z}px system-ui, "Segoe UI", sans-serif`; g.textBaseline = 'top'; g.lineWidth = Math.max(2, op.z / 6); g.strokeStyle = op.c === '#000000' ? '#fff' : '#000';
      op.s.split('\n').forEach((l, n) => { g.strokeText(l, op.x, op.y + n * op.z * 1.2); g.fillText(l, op.x, op.y + n * op.z * 1.2); });
    }
    g.restore();
  };
  A.redraw = () => { g.drawImage(img, 0, 0); A.ops.forEach(draw); if (A.cur) draw(A.cur); };
  A.sync = () => { document.querySelectorAll('[data-an=tool]').forEach(b => b.classList.toggle('a', b.dataset.v === A.tool)); document.querySelectorAll('[data-an=col]').forEach(b => b.classList.toggle('a', b.dataset.v === A.col)); cv.style.cursor = A.tool === 'text' ? 'text' : 'crosshair'; };
  A.sync(); A.redraw();
  const pt = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
  const textAt = (x, y, e) => { // champ de saisie posé sur l’image ; Entrée valide, Maj+Entrée = nouvelle ligne, Échap annule
    if (A.box) A.box.blur();
    const r = cv.getBoundingClientRect(), z = fs(), sc = r.width / cv.width, t = document.createElement('textarea'); A.box = t;
    t.className = 'anntx'; t.rows = 1; t.style.cssText = `left:${(e.clientX - st.getBoundingClientRect().left)}px;top:${(e.clientY - st.getBoundingClientRect().top)}px;color:${A.col};font-size:${Math.max(12, z * sc)}px`;
    st.appendChild(t); setTimeout(() => t.focus(), 0); let done = false;
    const end = ok => { if (done) return; done = true; A.box = null; const v = t.value.replace(/\s+$/, ''); t.remove(); if (ok && v) { A.ops.push({ t: 'text', x, y, s: v, c: A.col, z }); A.redraw(); } };
    t.addEventListener('keydown', k => { k.stopPropagation(); if (k.key === 'Enter' && !k.shiftKey) { k.preventDefault(); end(true); } else if (k.key === 'Escape') { k.preventDefault(); end(false); } });
    t.addEventListener('blur', () => end(true));
  };
  cv.addEventListener('pointerdown', e => {
    if (e.button !== 0) return; e.preventDefault(); const [x, y] = pt(e);
    if (A.tool === 'text') return textAt(x, y, e);
    cv.setPointerCapture(e.pointerId); A.cur = A.tool === 'pen' ? { t: 'pen', p: [[x, y]], c: A.col, w: lw() } : { t: A.tool, x1: x, y1: y, x2: x, y2: y, c: A.col, w: lw() }; A.redraw();
  });
  cv.addEventListener('pointermove', e => { if (!A.cur) return; const [x, y] = pt(e); if (A.cur.t === 'pen') A.cur.p.push([x, y]); else { A.cur.x2 = x; A.cur.y2 = y; } A.redraw(); });
  const up = () => { if (!A.cur) return; const o = A.cur; A.cur = null; if (o.t === 'pen' || Math.hypot(o.x2 - o.x1, o.y2 - o.y1) > 4) A.ops.push(o); A.redraw(); };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
}
const annUndo = () => { if (ANN && ANN.ops.length) { ANN.ops.pop(); ANN.redraw(); } };
const annEnd = () => { ANN = null; };
async function annAct(t) {
  const A = ANN, a = t.dataset.an; if (!A) return;
  if (a === 'tool') { A.tool = t.dataset.v; A.sync(); }
  else if (a === 'col') { A.col = t.dataset.v; A.sync(); }
  else if (a === 'undo') annUndo();
  else if (a === 'clear') { A.ops = []; A.redraw(); }
  else if (a === 'copy') { if (A.box) A.box.blur(); await call('shots:clip', A.cv.toDataURL('image/png')); flash('Image copiée'); }
  else if (a === 'save') { if (A.box) A.box.blur(); const f = await call('shots:save', A.s.inst, A.s.file, A.cv.toDataURL('image/png')); annEnd(); closeModal(); flash('Annotation enregistrée : ' + f); render(); }
  else if (a === 'close') { if (A.ops.length && !A.closing) { A.closing = true; const b = document.querySelector('[data-an=close]'); if (b) { b.textContent = 'Fermer sans enregistrer ?'; b.classList.add('dg'); } setTimeout(() => { A.closing = false; const c = document.querySelector('[data-an=close]'); if (c) { c.textContent = 'Fermer'; c.classList.remove('dg'); } }, 3000); return; } annEnd(); closeModal(); }
}

/* ----- profil, skins et capes ----- */
const loadImg = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = s; });
async function drawSkin(cv) {
  const S = +cv.dataset.s || 6, slim = cv.dataset.slim === '1', back = cv.dataset.back === '1'; cv.width = 16 * S; cv.height = 32 * S;
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; const im = await loadImg(cv.dataset.sk); if (!im) return; const old = im.height === 32, aw = slim ? 3 : 4;
  const p = (sx, sy, w, h, dx, dy, flip) => { if (flip) { g.save(); g.translate((dx + w) * S, 0); g.scale(-1, 1); g.drawImage(im, sx, sy, w, h, 0, dy * S, w * S, h * S); g.restore(); } else g.drawImage(im, sx, sy, w, h, dx * S, dy * S, w * S, h * S); };
  const hx = back ? 24 : 8, bx = back ? 32 : 20;
  p(hx, 8, 8, 8, 4, 0); p(hx + 32, 8, 8, 8, 4, 0);
  p(bx, 20, 8, 12, 4, 8); if (!old) p(bx, 36, 8, 12, 4, 8);
  /* à l’écran, le côté gauche est le côté DROIT du personnage vu de face, et son côté GAUCHE vu de dos */
  const AR = back ? [52, 20, 52, 36] : [44, 20, 44, 36], AL = back ? [44, 52, 60, 52] : [36, 52, 52, 52];
  [[4 - aw, back ? 'L' : 'R'], [12, back ? 'R' : 'L']].forEach(([x, side]) => { const s = side === 'R' ? AR : AL, m = old && side === 'L'; p(m ? AR[0] : s[0], m ? AR[1] : s[1], aw, 12, x, 8, m); if (!old) p(s[2], s[3], aw, 12, x, 8); });
  const LR = back ? [12, 20, 12, 36] : [4, 20, 4, 36], LL = back ? [28, 52, 12, 52] : [20, 52, 4, 52];
  [[4, back ? 'L' : 'R'], [8, back ? 'R' : 'L']].forEach(([x, side]) => { const s = side === 'R' ? LR : LL, m = old && side === 'L'; p(m ? LR[0] : s[0], m ? LR[1] : s[1], 4, 12, x, 20, m); if (!old) p(s[2], s[3], 4, 12, x, 20); });
  if (back && cv.dataset.cape) { const c = await loadImg(cv.dataset.cape); if (c) { g.drawImage(c, 1, 1, 10, 16, 3 * S, 8 * S, 10 * S, 16 * S); } }
}
async function drawCape(cv) { const im = await loadImg(cv.dataset.cp); if (!im) return; cv.width = 40; cv.height = 64; const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(im, 1, 1, 10, 16, 0, 0, 40, 64); }
const skc = (src, slim, back, s, cape) => `<canvas class="sk" data-sk="${src}" data-slim="${slim ? 1 : 0}" data-back="${back ? 1 : 0}" data-s="${s}" ${cape ? `data-cape="${cape}"` : ''}></canvas>`;
async function totemPng(skinSrc, baseSrc) {
  const [sk, bs] = await Promise.all([loadImg(skinSrc), loadImg(baseSrc)]); if (!bs || !sk) throw new Error('Texture illisible.');
  const sc = document.createElement('canvas'); sc.width = 64; sc.height = 64; const sg = sc.getContext('2d', { willReadFrequently: true }); sg.drawImage(sk, 0, 0);
  const avg = (x, y, w, h) => { const d = sg.getImageData(x, y, w, h).data; let r = 0, g = 0, b = 0, n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; } return n ? [r / n, g / n, b / n] : [128, 128, 128]; };
  const hair = avg(8, 8, 8, 2), face = avg(10, 13, 4, 2), shirt = avg(21, 21, 6, 8), pants = avg(5, 22, 2, 6), shoes = avg(4, 30, 4, 2);
  const out = document.createElement('canvas'); out.width = out.height = 16; const g = out.getContext('2d', { willReadFrequently: true }); g.imageSmoothingEnabled = false; g.drawImage(bs, 0, 0, 16, 16);
  const img = g.getImageData(0, 0, 16, 16), d = img.data, orig = new Uint8ClampedArray(d), mix = (c, t, k) => c.map((v, i) => v + (t[i] - v) * k), A = (x, y) => orig[(y * 16 + x) * 4 + 3] > 8;
  const Lm = (x, y) => { const i = (y * 16 + x) * 4; return (0.299 * orig[i] + 0.587 * orig[i + 1] + 0.114 * orig[i + 2]) / 255; };
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const i = (y * 16 + x) * 4; if (d[i + 3] < 8) continue; const r = d[i], gr = d[i + 1], b = d[i + 2];
    if (gr > r * 1.15 && gr > b * 1.15) continue; // pierre verte : on la garde
    const L = Lm(x, y), base = y < 3 ? hair : y < 7 ? face : y < 12 ? shirt : y < 15 ? pants : shoes;
    const c = L < 0.3 ? base.map(v => v * 0.35) : L < 0.55 ? base.map(v => v * 0.75) : L < 0.8 ? base : mix(base, [255, 255, 255], 0.38);
    d[i] = Math.round(c[0]); d[i + 1] = Math.round(c[1]); d[i + 2] = Math.round(c[2]); d[i + 3] = 255;
  }
  /* la tête : on repère le haut du totem (avant que les bras s’élargissent) et on y dessine le vrai visage du skin */
  const cnt = []; for (let y = 0; y < 16; y++) { let n = 0; for (let x = 0; x < 16; x++) if (A(x, y)) n++; cnt.push(n); }
  let top = cnt.findIndex(n => n > 0), hb = Math.min(top + 6, 8); for (let y = top + 1; y < 12; y++) if (cnt[y] >= cnt[y - 1] + 4) { hb = y - 1; break; }
  let x0 = 16, x1 = -1; for (let y = top; y <= hb; y++) for (let x = 0; x < 16; x++) if (A(x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  const bw = x1 - x0 + 1, bh = hb - top + 1;
  if (top >= 0 && bw >= 5 && bh >= 5) {
    const fc = document.createElement('canvas'); fc.width = bw; fc.height = bh; const fg = fc.getContext('2d', { willReadFrequently: true }); fg.imageSmoothingEnabled = true; fg.imageSmoothingQuality = 'high'; fg.drawImage(sc, 8, 8, 8, 8, 0, 0, bw, bh); fg.drawImage(sc, 40, 8, 8, 8, 0, 0, bw, bh);
    const fd = fg.getImageData(0, 0, bw, bh).data;
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) { const X = x0 + x, Y = top + y; if (!A(X, Y) || Lm(X, Y) < 0.3) continue; const k = (y * bw + x) * 4; if (fd[k + 3] < 100) continue; const i = (Y * 16 + X) * 4; d[i] = fd[k]; d[i + 1] = fd[k + 1]; d[i + 2] = fd[k + 2]; d[i + 3] = 255; }
  }
  g.putImageData(img, 0, 0);
  const ic2 = document.createElement('canvas'); ic2.width = ic2.height = 128; const ig = ic2.getContext('2d'); ig.imageSmoothingEnabled = false; ig.fillStyle = '#1b1f2a'; ig.fillRect(0, 0, 128, 128); ig.drawImage(out, 8, 8, 112, 112);
  return { tex: out.toDataURL('image/png'), icon: ic2.toDataURL('image/png') };
}
async function profile() {
  if (!acc) return '<div class="card"><div><b>Compte Microsoft</b><small>Nécessaire pour lancer Minecraft Java.</small></div><button class="btn" data-a="login">Se connecter avec Microsoft</button></div>';
  const s = stats(); let Z = null; try { Z = await call('stats:get'); } catch (e) {} // totaux gardés par le launcher (même après suppression d’instances)
  const topL = Z ? Z.top.map(t => ({ name: t.name + (t.gone ? ' (supprimée)' : ''), playtime: t.secs })) : s.top, hTot = Z ? Z.totalSecs : s.h, mx = Math.max(1, ...topL.map(i => i.playtime));
  let skin = '';
  try {
    SK = await call('skins:profile'); const ac = SK.capes.find(c => c.active), cs = SK.skin;
    if (SK.defaultsState === 'loading') setTimeout(() => { const i = $('#skp'); if (page === 'acc' && !(i && (i.value || document.activeElement === i))) render(); }, 3000);
    skin = `<div class="sh"><h3>Skin et cape</h3></div><div class="card skp"><div class="skv">${cs ? skc(cs.src, cs.variant === 'slim', false, 9) + skc(cs.src, cs.variant === 'slim', true, 9, ac ? ac.src : '') : '<span class="mu">Aucun skin</span>'}</div><div style="flex:1;min-width:240px"><b>Skin actuel</b><small>Modèle ${cs && cs.variant === 'slim' ? 'fin (Alex)' : 'classique (Steve)'} · modifié directement sur ton compte Mojang</small><div class="row" style="margin-top:10px"><button class="btn" data-a="skAdd" data-v="classic">${ic('down', 13)} Importer un skin (PNG)</button><button class="btn g" data-a="skSaveCur">Garder mon skin actuel</button></div><div class="row" style="margin-top:8px"><input id="skp" placeholder="Pseudo d’un joueur" maxlength="16" style="width:180px"><button class="btn g" data-a="skPlayer">Prendre son skin</button></div><small style="margin-top:8px">Les skins sont rangés dans ta bibliothèque ci-dessous ; clique sur « Appliquer » pour l’envoyer à Mojang (visible en jeu après quelques secondes).</small></div></div>
    <div class="card"><div><b>Totem personnalisé</b><small>Garde le totem d’immortalité d’origine mais recolore toute sa texture avec les couleurs de ton skin (cheveux, peau, haut, pantalon, chaussures).</small></div><div class="row"><select id="totinst">${inst.map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select><button class="btn" data-a="totem" ${inst.length ? '' : 'disabled'}>Générer</button></div></div>
    <div class="sh"><h3>Skins par défaut (${SK.defaults.length})</h3>${SK.hiddenDefaults ? `<a data-a="skRestore">Restaurer les skins retirés (${SK.hiddenDefaults})</a>` : ''}</div>${skDefNote(SK)}<div class="skg">${skDefCards(SK.defaults, false) || (SK.defaultsState === 'ready' ? '<p class="mu">Tous les skins par défaut ont été retirés.</p>' : '')}</div>
    <div class="sh"><h3>Ma bibliothèque de skins (${SK.library.length})</h3></div><div class="skg">${SK.library.map(x => `<div class="card sk2"><div class="skv sm">${skc(x.src, x.variant === 'slim', false, 4)}</div><b>${esc(x.name)}</b><div class="row"><select data-a="skVar" data-id="${x.id}" style="padding:4px 6px"><option value="classic" ${x.variant === 'classic' ? 'selected' : ''}>Classique</option><option value="slim" ${x.variant === 'slim' ? 'selected' : ''}>Fin</option></select></div><div class="row"><button class="btn sm" data-a="skApply" data-id="${x.id}">Appliquer</button><button class="btn g sm" data-a="skExp" data-id="${x.id}" title="Exporter">${ic('down', 12)}</button><button class="ib" data-a="skDel" data-id="${x.id}" title="Supprimer">${ic('trash', 13)}</button></div></div>`).join('') || '<p class="mu">Ta bibliothèque est vide : importe un fichier PNG ou prends le skin d’un joueur.</p>'}</div>
    <div class="sh"><h3>Capes</h3></div><div class="skg"><div class="card sk2 ${ac ? '' : 'sel'}" data-a="cape" data-id=""><div class="skv sm" style="height:64px"><span class="mu">Aucune</span></div><b>Sans cape</b></div>${SK.capes.map(c => `<div class="card sk2 ${c.active ? 'sel' : ''}" data-a="cape" data-id="${esc(c.id)}"><div class="skv sm"><canvas class="cp" data-cp="${c.src}"></canvas></div><b>${esc(c.alias || 'Cape')}</b><small>${c.active ? 'Équipée' : 'Cliquer pour équiper'}</small></div>`).join('')}</div>${SK.capes.length ? '' : '<p class="mu">Ton compte ne possède aucune cape pour l’instant (les capes se gagnent via Mojang ou des évènements).</p>'}`;
  } catch (e) { skin = `<div class="card"><div><b>Skin et cape</b><small>${esc(e.message)}</small></div></div>`; }
  return `<div class="pf"><div class="av"><img class="av" alt="" src="https://mc-heads.net/avatar/${esc(acc.uuid)}/128"></div><div><h1 style="margin:0">${esc(acc.name)}</h1><div class="mu">Compte Microsoft lié · le pseudo est géré par Mojang</div><small style="margin-top:4px">UUID : ${esc(acc.uuid)}</small></div></div>
  <div class="stat">${[['Heures jouées', hrs(hTot)], ['Instances', s.n], ['Mods différents', s.mods], ['Serveurs', s.srv]].map(([l, v]) => `<div class="card"><span class="mu">${l}</span><b>${v}</b></div>`).join('')}</div>${skin}
  <div class="sh"><h3>Instances les plus jouées</h3></div><div class="card" style="display:block"><div class="bars">${topL.map(i => `<div><span>${esc(i.name)}</span><i style="width:${Math.max(3, Math.round(i.playtime / mx * 100))}%"></i><small style="width:70px">${hrs(i.playtime)}</small></div>`).join('') || '<span class="mu">Rien de joué pour l’instant.</span>'}</div></div>
  <div class="sh"><h3>Compte</h3></div><div class="row"><button class="btn g" data-a="login">Changer de compte</button><button class="btn g" data-a="logout">Se déconnecter</button></div>
  <div class="two" style="margin-top:6px"><div><div class="sh"><h3>Amis</h3></div><div class="card soon"><div><b>Bientôt disponible</b><small>Ta liste d’amis, ta visibilité et tes messages.</small></div></div></div><div><div class="sh"><h3>Succès et quêtes</h3></div><div class="card soon"><div><b>Bientôt disponible</b><small>Ta progression apparaîtra ici.</small></div></div></div></div>`;
}

/* mises à jour du launcher (Paramètres › Général) : état poussé par le processus principal (updater.js) */
let UPS = null;
const updText = u => !u ? 'Vérification en cours…' : ({
  dev: 'Désactivées en mode développement.', idle: 'Hydarium ' + u.current + ' · vérifiées à chaque lancement.', checking: 'Recherche en cours…', none: 'Hydarium ' + u.current + ' est à jour.',
  downloading: 'Téléchargement de la version ' + u.latest + '… ' + (u.percent || 0) + ' %', ready: 'La version ' + u.latest + ' est prête : elle s’installera à la fermeture du launcher.',
  available: 'La version ' + u.latest + ' est disponible (installation manuelle).', error: u.error || 'Impossible de vérifier.' })[u.status] || '';
const updCard = () => `<div class="card" id="updc"><div style="flex:1"><b>Mises à jour</b><small>${esc(updText(UPS))}</small></div><div class="row">${UPS && UPS.status === 'ready' ? '<button class="btn" data-a="updInstall">Redémarrer et installer</button>' : ''}${UPS && UPS.status === 'available' ? '<button class="btn" data-a="updOpen">Télécharger</button>' : ''}<button class="btn g" data-a="updCheck" ${UPS && ['checking', 'downloading', 'dev'].includes(UPS.status) ? 'disabled' : ''}>Rechercher une mise à jour</button></div></div>`;
/* « HYD-XXXX-… » (casse, espaces, tirets et soulignés libres) : reconnaît une invitation privée dans le champ d'adresse. La vraie validation est faite côté principal (p2p.normalize). */
const looksLikeInvite = t => /^HYD[0-9A-Z]{12,}$/.test(String(t || '').toUpperCase().replace(/[\s_-]/g, ''));
/* état de la récupération des skins Mojang (extraits du jeu au premier usage) */
const skDefNote = x => x.defaultsState === 'loading' ? '<p class="mu">Téléchargement des skins par défaut de Minecraft… (une seule fois, quelques secondes)</p>'
  : x.defaultsState === 'error' ? `<p class="mu">Skins par défaut de Minecraft indisponibles : ${esc(x.defaultsError || 'erreur inconnue')} <a style="color:var(--ac);cursor:pointer" data-a="skRetry">Réessayer</a></p>` : '';
/* cartes des skins préinstallés (Minecraft + Hydarium) : même rendu dans le Profil et dans le menu en jeu */
const skDefLabel = x => x.group === 'hydarium' ? 'Skin Hydarium' : 'Minecraft · ' + (x.variant === 'slim' ? 'fin' : 'classique');
const skDefCards = (list, inGame) => list.map(x => inGame
  ? `<div class="card sk2" data-a="skApply" data-id="${x.id}"><div class="skv sm">${skc(x.src, x.variant === 'slim', false, 4)}</div><b>${esc(x.name)}</b><small>Cliquer pour équiper</small></div>`
  : `<div class="card sk2"><div class="skv sm">${skc(x.src, x.variant === 'slim', false, 4)}</div><b>${esc(x.name)}</b><small>${skDefLabel(x)}</small><div class="row"><button class="btn sm" data-a="skApply" data-id="${x.id}">Appliquer</button><button class="btn g sm" data-a="skExp" data-id="${x.id}" title="Exporter">${ic('down', 12)}</button><button class="ib" data-a="skDelDef" data-id="${x.id}" title="Retirer de la liste">${ic('trash', 13)}</button></div></div>`).join('');
/* Menu en jeu : sélection simple d’un skin et d’une cape (la gestion complète reste dans le Profil du launcher) */
async function skinPick() {
  if (!acc) return '<p class="mu">Connecte-toi avec Microsoft dans le launcher pour choisir un skin et une cape.</p>';
  try {
    SK = await call('skins:profile'); const ac = SK.capes.find(c => c.active), cs = SK.skin;
    return `<h2 style="margin:0 0 10px">Skin et cape</h2>
    <div class="sh" style="margin-top:0"><h3>Skin</h3></div><div class="skg">${cs ? `<div class="card sk2 sel"><div class="skv sm">${skc(cs.src, cs.variant === 'slim', false, 4)}</div><b>Skin actuel</b><small>Équipé</small></div>` : ''}${skDefCards(SK.defaults, true)}${SK.library.map(x => `<div class="card sk2" data-a="skApply" data-id="${x.id}"><div class="skv sm">${skc(x.src, x.variant === 'slim', false, 4)}</div><b>${esc(x.name)}</b><small>Cliquer pour équiper</small></div>`).join('')}</div>${skDefNote(SK)}${SK.library.length || SK.defaults.length || SK.defaultsState !== 'ready' ? '' : '<p class="mu">Aucun autre skin pour l’instant : ajoute-en depuis ton Profil dans le launcher.</p>'}
    <div class="sh"><h3>Cape</h3></div><div class="skg"><div class="card sk2 ${ac ? '' : 'sel'}" data-a="cape" data-id=""><div class="skv sm" style="height:64px"><span class="mu">Aucune</span></div><b>Sans cape</b></div>${SK.capes.map(c => `<div class="card sk2 ${c.active ? 'sel' : ''}" data-a="cape" data-id="${esc(c.id)}"><div class="skv sm"><canvas class="cp" data-cp="${c.src}"></canvas></div><b>${esc(c.alias || 'Cape')}</b><small>${c.active ? 'Équipée' : 'Cliquer pour équiper'}</small></div>`).join('')}</div>${SK.capes.length ? '' : '<p class="mu">Ton compte ne possède aucune cape pour l’instant.</p>'}`;
  } catch (e) { return `<div class="card"><div><b>Skin et cape</b><small>${esc(e.message)}</small></div></div>`; }
}

const creditsHtml = C => {
  if (!C) return '<p class="mu">Crédits indisponibles.</p>';
  const lnk = (u, t) => `<a class="lk" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t)}</a>`;
  return `<div class="card col"><h3>${esc(C.author.name)}</h3><small>${esc(C.author.role)}</small><p style="margin:8px 0 0">${esc(C.coproduction)}</p></div>${C.sections.map(sec => `<div class="sh"><h3>${esc(sec.title)}</h3></div>${sec.items.map(i => `<div class="card"><div><b>${lnk(i.url, i.name)}</b>${i.license ? `<span class="bd">${esc(i.license)}</span>` : ''}<small>${esc(i.role)}${i.by ? ' · ' + esc(i.by) : ''}</small></div></div>`).join('')}`).join('')}<p class="mu">${esc(C.legal)}</p>`;
};
async function setView() {
  const tabs = [['gen', 'Général'], ['new', 'Nouvelles instances'], ['notif', 'Notifications'], ['music', 'Musique'], ['app', 'Apparence'], ['stat', 'Statistiques'], ['java', 'Java'], ['exp', 'Avancé'], ['data', 'Données'], ['help', 'Aide et journaux'], ['credits', 'Crédits']];
  let b = ''; if (st === 'new') DEFO = await call('defopts:get').catch(() => ({})); if (st === 'music') SPS = await call('spotify:status').catch(() => ({})); let SZ = st === 'data' ? await call('data:sizes').catch(() => ({})) : null;
  if (st === 'gen') b = `<div class="card" style="display:block">${sw('notif', 'Notifications', 'Lancement du jeu, plantages et erreurs, dans le centre de notifications de ton système.')}${sw('minimize', 'Réduire pendant le jeu', 'Libère des ressources pendant que Minecraft tourne.')}${sw('autostart', 'Lancer au démarrage', 'Ouvre Hydarium avec ton ordinateur.')}${sw('showLog', 'Afficher les logs du jeu', 'Ouvre une fenêtre de logs au lancement (préparation, téléchargements) et pendant la partie. Désactivé : aucune fenêtre, les journaux restent dans Paramètres › Aide et journaux.')}
  if (st === 'gen') b += srvModsCard();
  if (st === 'gen') { UPS = await call('update:state').catch(() => UPS); b += sw('autoUpdate', 'Mises à jour automatiques', 'Vérifie GitHub à chaque lancement et télécharge la nouvelle version en arrière-plan (jamais pendant une partie).').replace('<div class="sw">', '<div class="card"><div class="sw" style="width:100%">').replace(/<\/div>$/, '</div></div>') + updCard(); }

    <div class="sh"><h3>Importer</h3></div><div class="card"><div><b>Depuis un autre launcher</b><small>Choisis le dossier d’une instance, d’un launcher (Prism, MultiMC…) ou un dossier .minecraft.</small></div><button class="btn g" data-a="impman">Choisir un dossier…</button></div>
    <div class="card"><div><b>Langue de l’interface</b><small>Français ou English (les phrases longues peuvent rester en français).</small></div><select data-set="uiLang"><option value="fr" ${cfg.uiLang !== 'en' ? 'selected' : ''}>Français</option><option value="en" ${cfg.uiLang === 'en' ? 'selected' : ''}>English</option></select></div>
    <div class="card"><div><b>Assistant de bienvenue</b><small>Revoir la connexion et l’import automatique.</small></div><button class="btn g" data-a="wizre">Relancer</button></div><p class="mu">Langue : français (d’autres langues viendront). Hydarium ${esc(pf.version || '')} · ${esc(pf.id || '')} ${esc(pf.arch || '')} · <a class="hmail" data-a="mail" title="Contact">help@hydarium.net</a></p>`;
  if (st === 'new') b = `<p class="mu" style="margin-top:0">Ces réglages s’appliquent aux instances que tu crées ensuite.</p><div class="card" style="display:block">
    <div class="sw"><div style="flex:1"><b>Mémoire</b><small id="rm">${cfg.mem || 4} Go</small></div><input type="range" id="mem0" min="2" max="16" value="${cfg.mem || 4}" style="width:160px"></div>
    ${swd('defOptim', 'Optimisation des mods par défaut', 'Coche « Optimisation des mods » à la création (Sodium, Lithium…).')}
    ${swd('langSync', 'Langue du jeu = langue du launcher', 'Au premier lancement d’une instance, le jeu démarre dans la langue choisie ci-dessous. Désactivable.')}
    <div class="sw"><div style="flex:1"><b>Langue du jeu</b></div><select data-set="gameLang">${[['fr_fr', 'Français'], ['en_us', 'English (US)'], ['es_es', 'Español'], ['de_de', 'Deutsch'], ['it_it', 'Italiano'], ['pt_br', 'Português (BR)']].map(([k, l]) => `<option value="${k}" ${(cfg.gameLang || 'fr_fr') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="sw"><div style="flex:1"><b>Affichage au lancement</b></div><select data-set="defResMode"><option value="default" ${(cfg.defResMode || 'default') === 'default' ? 'selected' : ''}>Par défaut</option><option value="window" ${cfg.defResMode === 'window' ? 'selected' : ''}>Fenêtre</option><option value="full" ${cfg.defResMode === 'full' ? 'selected' : ''}>Plein écran</option></select></div>
    <div class="fld" style="margin-top:8px"><label>Arguments JVM par défaut</label><input data-set="defJvm" value="${esc(cfg.defJvm || '')}" placeholder="-XX:+UseG1GC …" style="width:100%"></div></div>
    ${defOptsHtml()}
    <div class="sh"><h3>Menu en jeu</h3></div><div class="card" style="display:block"><div class="sw"><div style="flex:1"><b>Raccourci du menu en jeu</b><small>Ouvre skins, téléchargements, captures et musique par-dessus Minecraft (fenêtré ou plein écran fenêtré). « off » pour désactiver.</small></div>${accelBtn()}</div>
</div>`;
  if (st === 'notif') b = `<div class="card" style="display:block">${swd('notif', 'Notifications du système', 'Interrupteur général : désactive tout ce qui suit.')}${swd('notifLaunch', 'Lancement du jeu', 'Quand Minecraft démarre.')}${swd('notifCrash', 'Plantages', 'Cause probable et accès au détail.')}${swd('notifShot', 'Captures d’écran', '« Capture enregistrée » : un clic ouvre l’image.')}${swd('notifServer', 'Mon serveur', 'Serveur en ligne, joueurs qui rejoignent.')}${swd('notifDone', 'Téléchargements terminés', 'Modpacks importés, Java installé…')}${sw('notifQuiet', 'Ne pas déranger pendant le jeu', 'Aucune notification pendant que Minecraft tourne, sauf les plantages.')}</div><div class="row" style="margin-top:12px"><button class="btn g" data-a="ntest">Envoyer une notification de test</button></div>`;
  if (st === 'music') b = `<div class="card" style="display:block"><div class="sw"><div style="flex:1"><b>Source de musique</b><small>Affichée en bas du launcher et dans le menu en jeu.</small></div><select data-set="music">${[['auto', 'Automatique (Spotify ou YouTube Music)'], ['spotify', 'Spotify'], ['youtube', 'YouTube Music'], ['off', 'Désactivée']].map(([k, l]) => `<option value="${k}" ${(cfg.music || 'auto') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
    <div class="sh"><h3>Spotify</h3></div><div class="card col"><b>${SPS.connected ? 'Compte Spotify connecté ✓' : 'Connexion directe à ton compte Spotify'}</b><small>Lecture du morceau en cours pour tous les comptes ; pause / suivant / précédent demandent Spotify Premium. Il faut un « Client ID » gratuit (developer.spotify.com › Create app) avec cette adresse de redirection : <b>${esc(SPS.redirect || '')}</b></small>
    <div class="row" style="margin-top:8px"><input data-set="spotifyId" value="${esc(cfg.spotifyId || '')}" placeholder="Client ID Spotify" style="flex:1;width:auto">${SPS.connected ? '<button class="btn g" data-a="splogout">Déconnecter</button>' : '<button class="btn" data-a="spconn">Connecter Spotify</button>'}</div></div>
    <div class="sh"><h3>YouTube Music</h3></div><div class="card col"><small>YouTube Music n’a pas d’API officielle pour se connecter à un compte. Ouvre YouTube Music dans ton navigateur : Hydarium lit alors la session multimédia du système (titre, pause, suivant).</small></div>`;
  if (st === 'data') b = `<p class="mu" style="margin-top:0">Libère de la place ou repars de zéro. Rien de ce qui est listé ici ne supprime tes instances ni tes mondes (sauf « Tout supprimer »).</p>${dataRows(SZ)}
    <div class="sh"><h3>Réinitialisation</h3></div><div class="card"><div><b>Réinitialiser les réglages</b><small>Remet les réglages, l’assistant de bienvenue et la visite guidée à zéro. Garde instances, mondes et comptes.</small></div><button class="btn g" data-a="rsset">Réinitialiser</button></div>
    <div class="card"><div><b>Tout supprimer et repartir de zéro</b><small>Instances, mondes, serveurs, skins, comptes, journaux, Java téléchargés : tout est effacé (${mo(SZ.total || 0)}).</small></div><button class="btn dg" data-a="rsall">Tout supprimer…</button></div>`;
  if (st === 'app') b = `<div class="sh" style="margin-top:0"><h3>Thème</h3></div><div class="chips">${[['dark', 'Sombre (par défaut)'], ['light', 'Clair']].map(([k, l]) => `<span class="chip ${cfg.theme === k ? 'a' : ''}" data-a="theme" data-v="${k}">${l}</span>`).join('')}</div>
    <div class="sh"><h3>Taille de l’interface</h3></div><div class="card col"><div class="row between"><small>Agrandis ou réduis tout le launcher (textes, boutons, listes).</small><b id="uisv">${Math.round((cfg.uiScale || 1) * 100)} %</b></div><input type="range" min="75" max="150" step="5" value="${Math.round((cfg.uiScale || 1) * 100)}" data-uiscale="1" style="width:100%"><div class="row" style="margin-top:6px"><button class="btn g sm" data-a="uireset">Revenir à 100 %</button></div></div>
    <div class="sh"><h3>Couleur d’accent</h3></div><div class="row">${ACC.map(c => `<button class="swatch ${(cfg.accent || ACC[0]) === c ? 'a' : ''}" style="background:${c}" data-a="accent" data-v="${c}" title="${c}"></button>`).join('')}</div>
    <div class="sh"><h3>Fond d’écran du launcher</h3></div><div class="wps">${WALLS.map(([k, l]) => `<div class="wp ${cfg.wall === k ? 'a' : ''}" data-a="wall" data-v="${k}"><div class="cover">${k === 'none' ? '' : scene(77, k === 'auto' ? autoK() : k, 200, 110)}</div><div class="l">${l}</div></div>`).join('')}</div><p class="mu">Le fond s’applique derrière toutes les pages du launcher.</p>`;
  if (st === 'stat') b = statsHtml(await call('stats:get'));
  if (st === 'java') {
    const L = await javas();
    b = `<p class="mu" style="margin-top:0">Hydarium choisit automatiquement le Java demandé par chaque version de Minecraft. Tu peux imposer un Java par défaut ici, ou pour une instance précise dans ses paramètres.</p>
    <div class="card"><div class="java"><div class="k">Auto</div><div><b>Automatique (recommandé)</b><small>Le Java demandé par la version de Minecraft</small></div></div><button class="btn ${cfg.java ? 'g' : ''}" data-a="javadef" data-v="">${cfg.java ? 'Utiliser' : 'Choisi'}</button></div>
    ${L.map(j => `<div class="card"><div class="java"><div class="k">${j.major}</div><div><b>${esc(jlabel(j))}</b><small>${esc(j.version || '')} · ${esc(j.path)}</small></div></div><div class="row"><button class="btn ${cfg.java === j.path ? '' : 'g'}" data-a="javadef" data-v="${esc(j.path)}">${cfg.java === j.path ? 'Choisi' : 'Utiliser par défaut'}</button>${j.custom ? `<button class="btn g" data-a="javarm" data-v="${esc(j.path)}">Retirer</button>` : ''}</div></div>`).join('') || '<p class="mu">Aucun Java trouvé.</p>'}
    <div class="row" style="margin-top:12px"><button class="btn g" data-a="javaadd">Ajouter un Java…</button><button class="btn g" data-a="javare">Rechercher à nouveau</button></div>
    <div class="sh"><h3>Télécharger un Java</h3></div><div class="row">${[8, 17, 21, 25].map(m => `<button class="btn g" data-a="jinst" data-v="${m}">Java ${m}</button>`).join('')}</div><small>Hydarium télécharge aussi automatiquement le Java demandé par une version de Minecraft quand il manque (désactivable ci-dessous).</small>
    ${swd('autoJava', 'Installer Java automatiquement', 'Quand aucune version compatible n’est trouvée.')}`;
  }
  if (st === 'exp') b = `<div class="card" style="display:block">${sw('snaps', 'Afficher les snapshots', 'Propose aussi les versions de développement lors de la création d’une instance.')}
    <div class="sw"><div style="flex:1"><b>Téléchargements simultanés</b><small>Plus = plus rapide si ta connexion suit. Actuellement : ${cfg.dl || 'automatique'}.</small></div><input type="range" min="1" max="32" value="${cfg.dl || 8}" data-dl="1" style="width:160px"></div></div>
    <div class="card col"><b>CurseForge</b><small>CurseForge demande une clé d’API gratuite. ${cfg.cfKey ? 'Une clé est enregistrée : l’onglet CurseForge est prêt dans les téléchargements.' : 'Aucune clé enregistrée : Modrinth reste disponible, et CurseForge te demandera la clé au premier clic.'}</small><div class="row" style="margin-top:6px"><button class="btn g" data-a="cfkey">${cfg.cfKey ? 'Changer la clé' : 'Ajouter ma clé'}</button>${cfg.cfKey ? '<button class="btn sec" data-a="cfkeyrm">Retirer la clé</button>' : ''}</div></div>
    <div class="card"><div><b>Visite guidée</b><small>Revoir les explications de l’interface.</small></div><button class="btn g" data-a="tourgo">Revoir</button></div>
    <div class="card"><div><b>Dossier des données d’Hydarium</b><small>Instances, versions partagées, skins, serveurs et journaux : ${esc(pf.dataDir || 'dossier utilisateur')}</small></div><button class="btn g" data-a="datadir">Ouvrir</button></div>
    <p class="mu">À venir : langues, changement du dossier des instances, activité Discord, Forge / NeoForge.</p>`;
  if (st === 'help') b = `<div class="card"><div><b>Journaux</b><small>Pour comprendre un plantage. Copie le rapport et colle-le quand tu demandes de l’aide.</small></div><div class="row"><button class="btn g" data-a="logs">Ouvrir le dossier</button><button class="btn g" data-a="logcopy">Copier le rapport</button></div></div><div class="card"><div><b>Effacement automatique des journaux</b><small>Supprime les journaux plus vieux que ce nombre de jours, à chaque démarrage et dès que tu changes la valeur. 0 = ne jamais effacer.</small></div><div class="row"><input type="number" min="0" max="365" step="1" data-set="logDays" value="${typeof cfg.logDays === 'number' ? cfg.logDays : 14}" style="width:80px"><span>jours</span></div></div><p class="mu">En cas de plantage, une notification donne la cause probable ; un clic dessus ouvre le journal du lancement. Pour un plantage natif (pilote graphique), le fichier hs_err_pid du dossier de l’instance est lu automatiquement.</p><p class="mu hmail">Un souci que tu n’arrives pas à régler ? <a data-a="mail">help@hydarium.net</a></p>`;
  if (st === 'credits') b = creditsHtml(await call('credits:list').catch(() => null));
  return `<div class="tabs">${tabs.map(([k, l]) => `<a class="${st === k ? 'a' : ''}" data-a="st" data-v="${k}">${l}</a>`).join('')}</div>` + b;
}

let srvTry = 0;
async function srvView() {
  await call('srv:sync').catch(() => {}); saved = await call('srv:saved').catch(() => saved);
  let l = []; try { l = await call('srv:list'); } catch (e) { note(e.message, 'Erreur'); }
  if (l.some(x => x.loading) && (srvTry = (srvTry || 0) + 1) <= 4) setTimeout(() => { const e1 = $('#sn2'), e2 = $('#sa'); if (page === 'srv' && !(e1 && e1.value) && !(e2 && e2.value) && !document.activeElement.closest?.('#modal')) render(); }, 1600); else if (!l.some(x => x.loading)) srvTry = 0; // état en cours de chargement : on réaffiche peu après
  const cats = [...new Set(l.map(x => x.cat).filter(Boolean))]; if (srvCat && !cats.includes(srvCat)) srvCat = '';
  const order = new Map(l.map((x, n) => [x.id, n]));
  l = l.filter(x => !srvCat || x.cat === srvCat).sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0) || (srvSort === 'name' ? a.name.localeCompare(b.name) : srvSort === 'players' ? (b.players || 0) - (a.players || 0) : srvSort === 'online' ? (b.online ? 1 : 0) - (a.online ? 1 : 0) : order.get(a.id) - order.get(b.id)));
  return `<div class="row" style="margin-bottom:8px"><input id="sn2" placeholder="Nom (facultatif)"><input id="sa" placeholder="Adresse du serveur ou invitation privée (HYD-…)"><button class="btn" data-a="sadd">Ajouter</button></div>
  <div class="keywarn" style="margin-bottom:12px">🔑 <b>Une invitation privée, c’est comme un mot de passe.</b> Elle donne un accès direct à l’ordinateur de l’hôte : ne la publie pas (Discord public, vidéo, stream) et attention, elle s’affiche en clair dans la liste des serveurs du jeu.</div>
  <div class="row between" style="margin-bottom:10px"><div class="chips" style="margin:0"><span class="chip ${srvCat ? '' : 'a'}" data-a="scat" data-v="">Tous</span>${cats.map(c => `<span class="chip ${srvCat === c ? 'a' : ''}" data-a="scat" data-v="${esc(c)}">${esc(c)}</span>`).join('')}</div><div class="row"><span class="mu">Trier :</span><select data-srvsort="1"><option value="manual" ${srvSort === 'manual' ? 'selected' : ''}>Mon ordre</option><option value="name" ${srvSort === 'name' ? 'selected' : ''}>Nom</option><option value="players" ${srvSort === 'players' ? 'selected' : ''}>Joueurs</option><option value="online" ${srvSort === 'online' ? 'selected' : ''}>En ligne d’abord</option></select></div></div>
  <p class="mu" style="margin-top:0">« Rejoindre » lance l’instance que tu as choisie pour le serveur (liste « Instance »), sinon une instance compatible détectée (version, loader, mods). Les favoris ★ restent en haut.</p>
  ${l.length ? selBar(l.filter(x => SELS.has(x.id)).length, l.length, 's') : ''}
  ${l.map(s => `<div class="card ${SELS.has(s.id) ? 'sel' : ''}"><div class="ic">${selBox(SELS.has(s.id), 'ssel', s.id)}<button class="star ${s.fav ? 'on' : ''}" data-a="sfav" data-id="${esc(s.id)}" title="Favori">${s.fav ? '★' : '☆'}</button>${srvTile(s, '#3a4a6a')}<div><b>${esc(s.name)}</b> ${s.cat ? `<span class="bd">${esc(s.cat)}</span>` : ''}${s.p2p ? '<span class="bd" title="Connexion directe de PC à PC, sans port ouvert">Invitation privée</span>' : ''}<small>${s.p2p ? 'invitation privée (connexion directe)' : esc(s.addr)}${s.fromGame ? ' · ajouté dans le jeu (' + esc(s.fromGame) + ')' : ''} · ${s.online === null ? 'état inconnu' : s.online ? 'en ligne · ' + s.players + '/' + s.max + ' joueurs' : 'hors ligne'}${s.version ? ' · ' + esc(s.version) : ''}</small></div></div><div class="row">${srvSort === 'manual' && !srvCat ? `<button class="ib" data-a="smove" data-id="${esc(s.id)}" data-d="-1" title="Monter">↑</button><button class="ib" data-a="smove" data-id="${esc(s.id)}" data-d="1" title="Descendre">↓</button>` : ''}<select data-sinst="${esc(s.id)}" title="Instance lancée par défaut pour ce serveur" style="max-width:170px"><option value="">Instance : auto</option>${inst.map(x => `<option value="${esc(x.id)}" ${x.id === s.inst ? 'selected' : ''}>${esc(x.name)} (${esc(x.version)})</option>`).join('')}</select><button class="btn" data-a="join" data-v="${esc(s.addr)}" ${playing ? 'disabled' : ''}>${ic('play', 12)} Rejoindre</button><button class="btn g" data-a="scfg" data-id="${esc(s.id)}">Configurer</button><button class="btn g" data-a="sdel" data-id="${esc(s.id)}">Retirer</button></div></div>`).join('') || '<p class="mu" style="text-align:center;padding:24px">Ajoute ton premier serveur.</p>'}`;
}

/* ===== navigateur de contenu Modrinth (mods, packs de ressources, shaders) ===== */
let SRC = (() => { try { return localStorage.getItem('hydSrc') === 'curseforge' ? 'curseforge' : 'modrinth'; } catch (e) { return 'modrinth'; } })(), BSORT = '';
const curSrc = () => SRC === 'curseforge' && !cfg.cfKey ? 'modrinth' : SRC;
const SORTS = src => [['', 'Tri automatique'], ['downloads', 'Plus téléchargés'], ['updated', 'Mis à jour récemment'], ['newest', 'Plus récents'], src === 'curseforge' ? ['name', 'Nom (A → Z)'] : ['follows', 'Plus aimés']];
const sortSel = () => `<select data-brsort="1" title="Trier les résultats">${SORTS(BR.src).map(([v, l]) => `<option value="${v}" ${(BR.sort || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
const TL = { mod: ['mods', 'mod'], resourcepack: ['packs de ressources', 'pack'], shader: ['shaders', 'shader'], datapack: ['data packs', 'datapack'], plugin: ['plugins', 'plugin'], modpack: ['modpacks', 'modpack'], map: ['maps', 'map'] };
const srcChips = () => `<div class="seg"><button class="${BR.src === 'modrinth' ? 'a' : ''}" data-a="brSrc" data-v="modrinth">Modrinth</button><button class="${BR.src === 'curseforge' ? 'a' : ''}" data-a="brSrc" data-v="curseforge">CurseForge</button></div>`;
function setSrc(v, afterKey) {
  SRC = v; try { localStorage.setItem('hydSrc', v); } catch (e) {}
  if (!BR) { if (page === 'catalog') render(); return; }
  if (page === 'catalog' || page === 'ovl') { BR = null; render(); } else { BR.src = v; BR.hits = []; BR.total = 0; BR.sort = ''; BSORT = ''; brModal(); brSearch(false); }
}
/* vidéo d’aide (à renseigner une fois la vidéo publiée) : lien YouTube, ou chemin d’un fichier .mp4 placé dans src/renderer */
const CF_HELP_VIDEO = 'https://www.youtube.com/watch?v=65A2j3z28aY';
function cfHelpVideo() {
  const v = CF_HELP_VIDEO; if (!v) return '<div class="cfvid"><span class="mu">La vidéo qui explique comment obtenir ta clé s’affichera ici.</span></div>';
  const y = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]{11})/.exec(v);
  return `<div class="cfvid">${y ? `<iframe src="https://www.youtube-nocookie.com/embed/${y[1]}?rel=0" allow="fullscreen; picture-in-picture; encrypted-media" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>` : `<video src="${esc(v)}" controls preload="metadata"></video>`}</div>${y ? `<p class="mu" style="margin:4px 0 0;font-size:12px">La vidéo ne se lance pas ? <a href="https://www.youtube.com/watch?v=${y[1]}" target="_blank" style="color:var(--ac,#5ab0ff)">Ouvre-la sur YouTube ↗</a></p>` : ''}`;
}
function cfKeyModal(msg) {
  openModal(`<h3>Connecter CurseForge</h3><p class="mu" style="margin-top:0">CurseForge demande une clé d’API <b>gratuite</b> pour que le launcher puisse chercher et télécharger des mods à ta place. Colle-la ci-dessous.</p>
  <div class="fld"><label>Clé d’API CurseForge</label><input id="cfkey" type="password" value="${esc(cfg.cfKey || '')}" placeholder="$2a$10$…" style="width:100%" autocomplete="off" spellcheck="false"></div>
  <p class="mu" id="cfmsg" style="color:var(--er,#ff6b6b);min-height:18px;margin:4px 0">${esc(msg || '')}</p>
  ${cfHelpVideo()}
  <div class="row" style="margin:10px 0 14px"><button class="btn g" data-a="cfopen">Obtenir ma clé sur CurseForge ↗</button><span class="mu">s’ouvre dans ton navigateur</span></div>
  <div class="row end"><button class="btn sec" data-a="cfkclose">Plus tard</button><button class="btn" data-a="cfksave">Valider</button></div>`);
  setTimeout(() => { const e = $('#cfkey'); if (e) e.focus(); }, 30);
}
function brModal() {
  const [pl] = TL[BR.type];
  openModal(`<div class="row between"><h3 style="margin:0">Télécharger des ${pl}</h3><button class="ib" data-a="brClose">${ic('x', 14)}</button></div><small>${BR.type === 'modpack' ? 'Le modpack est importé comme une nouvelle instance (Minecraft, loader et mods inclus)' : BR.type === 'map' ? 'Maps CurseForge · ajoutées aux mondes de « ' + esc((byId(cur) || {}).name || '') + ' »' : 'Minecraft ' + esc(BR.ver) + ' · ' + esc(ldn(BR.ldr))} · source ${BR.src === 'curseforge' ? 'CurseForge' : 'Modrinth'}${BR.mode === 'create' ? ' · ajout à la nouvelle instance' : ''}</small><div class="row" style="margin:10px 0">${BR.mode === 'create' || BR.type === 'map' ? '' : srcChips()}<input id="bq" value="${esc(BR.q)}" placeholder="Rechercher… (laisse vide pour voir les plus populaires)" style="flex:1;width:auto" autocomplete="off">${sortSel()}</div><div id="bres" class="bres"></div>`, true);
  brFill(); const q = $('#bq'); if (q) q.focus();
}
const favKey = r => r.src === 'curseforge' ? r.pid : r.slug;
/* favoris des packs de ressources, shaders et data packs (même idée que les mods favoris) */
const isFav2 = r => (cfg.favContent || []).some(f => f.type === BR.type && f.pid === String(r.pid) && f.src === (r.src || BR.src));
const favBar = () => {
  if (BR.type === 'mod' || BR.mode === 'create' || BR.q) return '';
  const l = (cfg.favContent || []).map((f, i) => [f, i]).filter(([f]) => f.type === BR.type && f.src === BR.src); if (!l.length) return '';
  return `<div class="chips" style="margin:0 0 10px"><span class="mu" style="font-size:12px;align-self:center">★ Mes favoris :</span>${l.map(([f, i]) => `<span class="chip" title="Installer en un clic" data-a="fav2add" data-i="${i}">★ ${esc(f.title)} <a data-a="fav2rm" data-i="${i}" title="Retirer des favoris" style="margin-left:4px;opacity:.7">×</a></span>`).join('')}</div>`;
};
function brRows() {
  if (BR.err) return `<p class="mu">${esc(BR.err)}</p>`;
  const h = BR.hits.map((r, n) => { const done = r.installed || (BR.mode === 'create' && CR.mods.some(m => m.slug === r.slug)); return `<div class="card br"><div class="ic">${tile(r.icon, r.title)}<div><b>${esc(r.title)}</b> <a href="${esc(r.src === 'curseforge' ? r.link : 'https://modrinth.com/' + BR.type + '/' + r.slug)}" target="_blank" title="Voir la fiche sur ${r.src === 'curseforge' ? 'CurseForge' : 'Modrinth'}" style="color:var(--mu);font-size:11px">fiche ↗</a> ${BR.type === 'mod' && r.ok ? '<span class="bd ok">✔ Vérifié</span>' : ''}<small>${esc(r.author || '')} · ${num(r.downloads)} téléchargements</small><small>${esc(r.desc)}</small></div></div>${BR.type !== 'mod' ? (BR.mode === 'create' || BR.type === 'modpack' || BR.type === 'map' ? '' : `<button class="star ${isFav2(r) ? 'on' : ''}" data-a="fav2" data-n="${n}" title="Mettre en favori (réinstaller en un clic)">${isFav2(r) ? '★' : '☆'}</button>`) : `<button class="star ${(cfg.favMods || []).some(x => x.slug === favKey(r)) ? 'on' : ''}" data-a="fav" data-n="${n}" title="Mettre en favori (réinstaller facilement)">${(cfg.favMods || []).some(x => x.slug === favKey(r)) ? '★' : '☆'}</button>`}<button class="btn sm ${done ? 'sec' : ''}" data-a="brAdd" data-n="${n}" ${done ? 'disabled' : ''}>${done ? '✓ ' + (BR.mode === 'create' ? 'Ajouté' : 'Installé') : BR.mode === 'create' ? 'Ajouter' : BR.type === 'modpack' ? 'Importer' : BR.type === 'map' ? 'Télécharger' : 'Installer'}</button></div>`; }).join('');
  return favBar() + (h || (BR.busy ? '' : `<p class="mu" style="text-align:center;padding:20px">Aucun résultat${BR.type === 'modpack' || BR.type === 'map' ? '' : ' pour cette version'}${BR.src === 'curseforge' ? '.' : cfg.cfKey ? ' (ni sur Modrinth, ni sur CurseForge).' : ' sur Modrinth. Ajoute une clé CurseForge (Paramètres › Avancé) pour chercher aussi là-bas.'}</p>`)) + (BR.busy ? '<div class="spin" style="margin:16px auto"></div>' : BR.hits.length < BR.total ? '<div class="row" style="justify-content:center"><button class="btn g" data-a="brMore">Voir plus</button></div>' : '');
}
const brFill = () => { const e = $('#bres'); if (e) e.innerHTML = brRows(); };
let brT, brSeq = 0;
async function brSearch(more) {
  const my = ++brSeq, B = BR, keep = !more && !B.q && B.hits.length ? { hits: B.hits, total: B.total } : null; B.busy = true; B.err = ''; if (!more && !keep) { B.hits = []; B.total = 0; } brFill();
  try { const r = await call('content:search', B.ctx, B.type, B.q, more ? B.hits.length : 0, B.src, B.sort || ''); if (my !== brSeq || B !== BR) return; if (keep && !r.hits.length) { B.hits = keep.hits; B.total = keep.total; } else { B.total = r.total; B.hits = more ? B.hits.concat(r.hits) : r.hits; } if (!B.q && !B.sort && B.cat && B.hits.length) BRC[B.cat] = { hits: B.hits.slice(0, 40), total: B.total }; }
  catch (e) { if (my !== brSeq) return; BR.err = e.message; }
  BR.busy = false; brFill();
}
function openBrowser(type, mode, world) {
  if (type === 'map') { SRC = 'curseforge'; if (!cfg.cfKey) return cfKeyModal('Les maps viennent de CurseForge : ajoute ta clé gratuite pour les chercher.'); }
  const ci = mode === 'create' ? CR : byId(cur) || (HOBJ && HOBJ.id === cur ? { version: HOBJ.version, loader: HOBJ.loader || 'vanilla' } : {}); BR = { src: type === 'map' ? 'curseforge' : curSrc(), sort: BSORT, world, ver: ci.version, ldr: ci.loader, type, mode, q: '', hits: [], total: 0, ctx: mode === 'create' ? { version: CR.version, loader: CR.loader } : { id: cur } };
  brModal(); brSearch(false);
}

/* ===== création d’une instance (comme la maquette) ===== */
const OPTM = { fabric: ['sodium', 'lithium', 'ferrite-core'], quilt: ['sodium', 'lithium', 'ferrite-core'], neoforge: ['sodium', 'ferrite-core'], forge: ['embeddium', 'ferrite-core'] };
async function crLv() {
  const c = CR; crCompat(); c.near = [];
  if (c.loader !== 'forge' && c.loader !== 'neoforge') return;
  c.lvs = null; c.lv = ''; crModal();
  try {
    const l = await call('forge:versions', c.loader, c.version); if (CR !== c) return; c.lvs = l; c.lv = l[0] ? l[0].v : '';
    if (!l.length) { // aucune version : on propose les versions de Minecraft voisines qui existent pour ce loader (ex. Forge n’a rien pour « 1.16 » tout court, la première est 1.16.1)
      const all = await call('forge:mcs', c.loader).catch(() => []), mm = c.version.split('.').slice(0, 2).join('.'), num = v => v.split('.').map(Number);
      c.near = all.filter(v => v !== c.version && v.split('.').slice(0, 2).join('.') === mm && vers.some(x => x.id === v)).sort((a, b) => { const x = num(a), y = num(b); return (y[2] || 0) - (x[2] || 0); }).slice(0, 6);
    }
  } catch (e) { c.lvs = []; note(e.message, 'Erreur'); }
  if (CR === c) crModal();
}
/* mods proposés = seulement ceux qui existent pour ce loader ET cette version (ex. pas d’Iris pour Forge 1.8.9). Ceux déjà choisis et devenus incompatibles sont retirés. */
async function crCompat() {
  const c = CR; if (!c) return;
  if (c.loader === 'vanilla') { c.okMap = null; return; }
  const key = c.loader + '|' + c.version; c.okKey = key; c.okMap = null;
  const slugs = [...new Set([...REC.map(q => q[0]), ...(OPTM[c.loader] || []), ...(cfg.favMods || []).map(f => f.slug), ...c.mods.map(m => m.slug)])];
  let r = {}; try { r = await call('mods:compat', slugs, c.loader, c.version); } catch (e) { r = {}; }
  if (CR !== c || c.okKey !== key) return; // l’utilisateur a changé de version / loader entre-temps
  c.okMap = r;
  const gone = c.mods.filter(m => r[m.slug] === false);
  if (gone.length) { c.mods = c.mods.filter(m => r[m.slug] !== false); const named = gone.filter(m => !m.opt); if (named.length) flash(named.map(m => m.title).join(', ') + ' : incompatible avec ' + ldn(c.loader) + ' ' + c.version + ', retiré.'); }
  crModal();
}
const REC = [['sodium', 'Sodium'], ['iris', 'Iris Shaders'], ['lithium', 'Lithium'], ['ferrite-core', 'FerriteCore'], ['immediatelyfast', 'ImmediatelyFast'], ['appleskin', 'AppleSkin'], ['mouse-tweaks', 'Mouse Tweaks'], ['chat-heads', 'Chat Heads'], ['shulkerboxtooltip', 'Shulker Box Tooltip'], ['cherished-worlds', 'Cherished Worlds'], ['gamma-utils', 'Gamma Utils'], ['blur-fabric', 'Blur'], ['voxy', 'Voxy'], ['zoomify', 'Zoomify'], ['modmenu', 'Mod Menu'], ['xaeros-minimap', 'Xaero’s Minimap']];
const nice = s => (REC.find(q => q[0] === s) || (cfg.favMods || []).map(f => [f.slug, f.title]).find(q => q[0] === s) || [s, s.split('-').map(cap).join(' ')])[1];
function newInst(mod) {
  const v = (vers.find(x => x.type === 'release') || { id: '' }).id;
  CR = { name: '', version: v, loader: mod ? 'fabric' : 'vanilla', opt: cfg.defOptim !== false, mods: [], cover: '', cat: '' }; crOptApply(); crModal(); crCompat();
}
function crOptApply() { CR.mods = CR.mods.filter(m => !m.opt); if (CR.loader !== 'vanilla' && CR.opt) (OPTM[CR.loader] || []).forEach(s => { if (!CR.mods.some(m => m.slug === s)) CR.mods.push({ slug: s, title: nice(s), opt: true }); }); }
function crModal() {
  const c = CR, van = c.loader === 'vanilla', favs = cfg.favMods || [], ftags = [...new Set(favs.flatMap(f => f.tags || []))], shown = favs.filter(f => !c.mods.some(m => m.slug === f.slug) && (!FVT || (f.tags || []).includes(FVT)) && c.okMap && c.okMap[f.slug] === true);
  openModal(`<h3>Nouvelle instance</h3><div class="fld"><label>Nom</label><input data-cr="name" value="${esc(c.name)}" maxlength="40" placeholder="Mon instance" style="width:100%"></div>
  <div class="fld"><label>Version de Minecraft</label><div class="row"><select data-cr="version" style="flex:1;width:auto">${opts(c.version)}</select><label class="ckb"><input type="checkbox" data-crsn ${snaps ? 'checked' : ''}> snapshots</label></div></div>
  <div class="fld"><label>Loader</label><div class="seg segl">${[['vanilla', 'Vanilla'], ['fabric', 'Fabric'], ['quilt', 'Quilt'], ['neoforge', 'NeoForge'], ['forge', 'Forge']].map(([k, l]) => `<button class="${c.loader === k ? 'a' : ''}" data-a="crLoader" data-v="${k}">${l}</button>`).join('')}</div></div>
  ${c.loader === 'forge' || c.loader === 'neoforge' ? `<div class="fld"><label>Version de ${ldn(c.loader)} <span class="bd wa">expérimental</span></label><select data-cr="lv">${c.lvs ? (c.lvs.length ? c.lvs.map(x => `<option value="${esc(x.v)}" ${x.v === c.lv ? 'selected' : ''}>${esc(x.label)}</option>`).join('') : '<option value="">Aucune version pour cette version de Minecraft</option>') : '<option>Chargement…</option>'}</select>${c.lvs && !c.lvs.length ? `<small class="mu">${esc(ldn(c.loader))} n’a pas de version pour Minecraft ${esc(c.version)}.${(c.near || []).length ? ' Essaie : ' + c.near.map(v => `<a style="cursor:pointer;color:var(--ac)" data-a="crPick" data-v="${esc(v)}">${esc(v)}</a>`).join(', ') + '.' : ''}</small>` : ''}</div>` : ''}
  ${van ? '' : `${(() => { const ol = (OPTM[c.loader] || []).filter(s => !c.okMap || c.okMap[s] !== false); return ol.length || !c.okMap ? `<div class="alert"><label class="ckb"><input type="checkbox" data-crop ${c.opt ? 'checked' : ''}><span><b>Optimisation des mods</b> (recommandé)<br><span class="mu">${ol.map(nice).join(', ')}</span></span></label></div>` : `<div class="alert"><span class="mu">Aucun mod d’optimisation connu pour ${esc(ldn(c.loader))} ${esc(c.version)}.</span></div>`; })()}
  <div class="fld"><label>Mods</label><div class="chips">${c.mods.map(m => `<span class="chip a" data-a="crRm" data-v="${esc(m.slug)}">${esc(m.title)} ✕</span>`).join('')}${c.okMap ? REC.filter(q => !c.mods.some(m => m.slug === q[0]) && c.okMap[q[0]] === true).map(q => `<span class="chip" data-a="crAdd" data-v="${q[0]}">+ ${esc(q[1])}</span>`).join('') : '<span class="mu" style="font-size:12px">Vérification de la compatibilité…</span>'}<span class="chip" style="color:var(--ac)" data-a="crMore">＋ Plus de mods…</span>${c.mods.length ? `<span class="chip" style="color:var(--er,#ff6b6b)" data-a="crClear" title="Retirer tous les mods de la liste">🗑 Tout retirer (${c.mods.length})</span>` : ''}</div>
  <div class="row between" style="margin-top:10px"><b style="font-size:12px">★ Mes favoris</b><div class="row"><a class="mu" style="cursor:pointer;font-size:12px" data-a="favall">Tout ajouter</a><a class="mu" style="cursor:pointer;font-size:12px" data-a="favmgr">Gérer…</a></div></div>
  <div class="chips">${ftags.length ? `<span class="chip ${FVT ? '' : 'a'}" data-a="favtag" data-v="">Tous</span>${ftags.map(t => `<span class="chip ${FVT === t ? 'a' : ''}" data-a="favtag" data-v="${esc(t)}">${esc(t)}</span>`).join('')}` : ''}${shown.map(f => `<span class="chip" data-a="crAdd" data-v="${esc(f.slug)}">★ ${esc(f.title)}</span>`).join('') || `<span class="mu" style="font-size:12px">${!favs.length ? 'Clique sur ☆ dans la recherche de mods pour en ajouter ici.' : !c.okMap ? 'Vérification de la compatibilité…' : favs.every(f => c.mods.some(m => m.slug === f.slug)) ? 'Tous tes favoris sont déjà ajoutés.' : 'Aucun de tes favoris n’existe pour ' + esc(ldn(c.loader)) + ' ' + esc(c.version) + '.'}</span>`}</div><small>Parcours tout le catalogue Modrinth. Les incompatibilités sont refusées automatiquement à l’installation.</small></div>`}
  <div class="fld"><label>Couverture</label><div class="wps small"><div class="wp ${c.cover ? '' : 'a'}" data-a="crCover" data-v="">${swc('plains')}<div class="l">Auto</div></div>${BIOALL.map(k => `<div class="wp ${c.cover === k ? 'a' : ''}" data-a="crCover" data-v="${k}">${swc(k)}<div class="l">${BIOL[k]}</div></div>`).join('')}</div></div>
  <div class="row end" style="margin-top:14px"><button class="btn sec" data-a="mclose">Annuler</button><button class="btn" data-a="crGo">Créer l’instance</button></div>
  <hr style="border:0;border-top:1px solid var(--ln);margin:16px 0"><b>…ou importer un code de modpack</b><div class="row" style="margin-top:8px"><input id="cd" placeholder="HYD1…" style="flex:1;width:auto"><button class="btn g" data-a="impcode">Importer</button></div>`, true);
}
async function crGo() {
  const c = CR, v = vers.find(x => x.id === c.version); if (!v) throw new Error('Choisis une version de Minecraft.');
  if ((c.loader === 'forge' || c.loader === 'neoforge') && !c.lv) throw new Error('Aucune version de ' + ldn(c.loader) + ' disponible pour Minecraft ' + c.version + '.');
  const name = c.name.trim() || (c.loader === 'vanilla' ? 'Minecraft ' : cap(c.loader) + ' ') + c.version, mods = c.loader === 'vanilla' ? [] : c.mods;
  const rows = [['mc', 'Minecraft ' + c.version], ...mods.map(m => ['m-' + m.slug, m.title])];
  openModal(`<h3>Création de « ${esc(name)} »</h3><div>${rows.map(([k, l]) => `<div class="ml" id="r-${k}"><div style="flex:1">${esc(l)}</div><span class="mu">en attente…</span></div>`).join('')}</div><div class="bar" style="width:100%;margin-top:12px"><i id="pb" style="width:0"></i></div><div class="row end" id="pend" style="margin-top:12px"></div>`);
  const set = (k, h) => { const e = document.getElementById('r-' + k); if (e) e.lastChild.outerHTML = h; };
  const i = await call('inst:create', { name, version: c.version, loader: c.loader, loaderVer: c.lv });
  await call('inst:set', i.id, { cover: c.cover, cat: c.cat });
  set('mc', '<span class="bd ok">✔ Prête (téléchargée au premier lancement)</span>'); let n = 0, bad = 0;
  /* le mod Hydarium se fabrique tout seul en arrière-plan dès la création de l'instance (store.onAdd) : rien à afficher ni à attendre ici */
  for (const m of mods) {
    set('m-' + m.slug, '<span class="mu">installation…</span>');
    try { if (/^cf\d+$/.test(m.slug)) await call('content:install', i.id, 'mod', m.slug, '', 'curseforge'); else await call('mods:add', i.id, m.slug); set('m-' + m.slug, '<span class="bd ok">✔ Installé</span>'); } catch (e) { bad++; set('m-' + m.slug, `<span class="bd er" title="${esc(e.message)}">✖ ${esc(e.message.slice(0, 60))}</span>`); }
    $('#pb').style.width = Math.round(++n / mods.length * 100) + '%';
  }
  $('#pb').style.width = '100%'; inst = await call('inst:list');
  $('#pend').innerHTML = `<button class="btn sec" data-a="mclose">Fermer</button><button class="btn" data-a="open" data-id="${esc(i.id)}" data-close="1">Ouvrir l’instance</button>`;
  if (!bad) flash('Instance créée'); render();
}

/* ===== assistant de bienvenue (aussi utilisé pour l’import manuel) ===== */
const dots = n => `<div class="dots">${[0, 1, 2, 3, 4].map(i => `<i class="${i == n ? 'a' : ''}"></i>`).join('')}</div>`;
const spin = t => `<div class="spin"></div><h1 style="font-size:22px">${t}</h1>`;
async function wiz(s) {
  const w = $('#wl'); w.hidden = false; let b = '';
  if (s == 0) b = `<svg width="64" height="64" viewBox="0 0 24 24"><path d="M12 2l9 5v10l-9 5-9-5V7z" fill="#3ddc84"/><path d="M12 12l9-5M12 12L3 7M12 12v10" stroke="#0b0d11" stroke-width="1.4"/></svg><h1>Bienvenue sur Hydarium</h1><p>Le launcher Minecraft simple, beau et communautaire. Quelques secondes pour tout préparer.</p><button class="btn big" data-a="w2" data-v="1">Commencer</button>${dots(0)}`;
  if (s == 1) b = `<h1>Connecte ton compte Microsoft</h1><p>Hydarium utilise ton compte Microsoft pour lancer Minecraft Java. Une fenêtre Microsoft va s’ouvrir.</p><button class="btn big" data-a="wlogin">Se connecter avec Microsoft</button><a data-a="w2" data-v="2">Continuer sans me connecter</a>${dots(1)}`;
  if (s == 2) { const l = await call('imp:detect').catch(() => []); b = `<h1>Importer depuis un autre launcher ?</h1><p>${l.length ? 'Hydarium a trouvé ces launchers sur ton ordinateur.' : 'Aucun autre launcher détecté automatiquement.'}</p><div class="lgrid">${l.map(x => `<div class="lc" data-a="wl" data-v="${esc(x.key)}"><b>${esc(x.name)}</b><small>${x.count} instance(s)</small></div>`).join('')}<div class="lc" data-a="impman"><b>Autre…</b><small>Choisir un dossier</small></div></div><button class="btn sec big" data-a="w2" data-v="4">${l.length ? 'Non merci, c’est ma première fois' : 'Continuer'}</button>${dots(2)}`; }
  if (s == 3) b = `<h1>${W.list.length} instance(s) trouvée(s)</h1><p>Choisis celles à importer. Les mods importés sont marqués « Non vérifié ».</p><div class="wlist">${W.list.map((x, i) => `<label class="wli"><input type="checkbox" data-wi="${i}" ${x.unsupported ? 'disabled' : 'checked'}><div><b>${esc(x.name)}</b><small>Minecraft ${esc(x.version || 'dernière version')} · ${esc(x.loader)}${x.unsupported ? ' · Forge pas encore géré' : ''}</small></div></label>`).join('')}</div><button class="btn big" data-a="wimp">Importer</button><a data-a="w2" data-v="2">Retour</a>${dots(3)}`;
  if (s == 4) b = `<div style="font-size:52px">✅</div><h1>Tout est prêt</h1><p>${W.n ? W.n + ' instance(s) importée(s).' : 'Tu peux créer ta première instance dans « Vanilla » ou « Moddé ».'}${W.skipped && W.skipped.length ? ' Ignorée(s) : ' + esc(W.skipped.join(', ')) + '.' : ''}</p><button class="btn big" data-a="wend">Ouvrir Hydarium</button>${dots(4)}`;
  w.innerHTML = b;
}


/* ===== mises à jour des mods ===== */
function updModal() {
  openModal(`<h3>Mises à jour des mods</h3>${UPD.length ? UPD.map(u => `<div class="ml"><div style="flex:1"><b>${esc(u.title)}</b><br><small>${esc(u.from)} → ${esc(u.to)}</small></div><button class="btn sm" data-a="updOne" data-pid="${esc(u.pid)}">Mettre à jour</button></div>`).join('') : '<p>Tous tes mods sont à jour pour cette version de Minecraft ✓</p>'}<div class="row end" style="margin-top:12px"><button class="btn sec" data-a="updClose">Fermer</button>${UPD.length > 1 ? '<button class="btn" data-a="updAll">Tout mettre à jour</button>' : ''}</div>`, true);
}
/* ===== paramètres d’un monde + data packs ===== */
const RL = { keepInventory: 'Garder l’inventaire à la mort', doDaylightCycle: 'Cycle jour / nuit', doWeatherCycle: 'Météo changeante', doMobSpawning: 'Apparition des mobs', mobGriefing: 'Les mobs détruisent les blocs', doFireTick: 'Propagation du feu', naturalRegeneration: 'Régénération naturelle de la vie', doInsomnia: 'Fantômes (insomnie)', doImmediateRespawn: 'Réapparition immédiate', pvp: 'PvP', fallDamage: 'Dégâts de chute', fireDamage: 'Dégâts de feu', drowningDamage: 'Dégâts de noyade', freezeDamage: 'Dégâts de gel', announceAdvancements: 'Annoncer les progrès', commandBlockOutput: 'Messages des blocs de commande', reducedDebugInfo: 'Infos de debug réduites', playersSleepingPercentage: '% de joueurs pour passer la nuit', randomTickSpeed: 'Vitesse des ticks aléatoires', spawnRadius: 'Rayon d’apparition', maxEntityCramming: 'Entassement max d’entités' };
async function worldModal(f) {
  WM = f; let w;
  try { w = await call('world:info', cur, f); } catch (e) { return openModal(`<h3>${esc(f)}</h3><p>${esc(e.message)}</p><div class="row end"><button class="btn" data-a="mclose">Fermer</button></div>`), render(); }
  const S = (a, b) => a === b ? 'selected' : '';
  openModal(`<div class="row between"><h3 style="margin:0">Paramètres du monde</h3><button class="ib" data-a="mclose">${ic('x', 14)}</button></div><small>Dossier : ${esc(f)} · ${w.version ? 'Minecraft ' + esc(w.version) + ' · ' : ''}${mo(w.size)} · fais une sauvegarde avant de modifier, et ferme le jeu.</small>
  <div class="two2" style="margin-top:12px"><div class="fld"><label>Nom affiché</label><input data-wset="name" value="${esc(w.name || '')}" maxlength="60"></div><div class="fld"><label>Seed</label><div class="row"><input id="wseed" readonly value="${esc(w.seed)}" style="flex:1;width:auto"><button class="btn g sm" data-a="wsSeed">${ic('copy', 13)}</button></div></div>
  <div class="fld"><label>Mode de jeu</label><select data-wset="mode"><option value="0" ${S(0, w.mode)}>Survie</option><option value="1" ${S(1, w.mode)}>Créatif</option><option value="2" ${S(2, w.mode)}>Aventure</option><option value="3" ${S(3, w.mode)}>Spectateur</option></select></div><div class="fld"><label>Difficulté</label><select data-wset="difficulty"><option value="0" ${S(0, w.difficulty)}>Paisible</option><option value="1" ${S(1, w.difficulty)}>Facile</option><option value="2" ${S(2, w.difficulty)}>Normal</option><option value="3" ${S(3, w.difficulty)}>Difficile</option></select></div></div>
  <div class="row" style="gap:18px;margin:6px 0 10px"><label class="ckb"><input type="checkbox" data-wset="cheats" ${w.cheats ? 'checked' : ''}> Commandes (triche)</label><label class="ckb"><input type="checkbox" data-wset="hardcore" ${w.hardcore ? 'checked' : ''}> Mode hardcore</label></div>
  ${w.rules.length ? `<div class="sh" style="margin-top:6px"><h3>Règles du jeu</h3></div><div class="rules">${w.rules.map(r => /^(true|false)$/.test(r.v) ? `<label class="ckb"><input type="checkbox" data-wrule="${r.k}" ${r.v === 'true' ? 'checked' : ''}> ${esc(RL[r.k] || r.k)}</label>` : `<div class="ckb"><input type="number" data-wrule="${r.k}" value="${esc(r.v)}" style="width:80px"> ${esc(RL[r.k] || r.k)}</div>`).join('')}</div>` : ''}
  <div class="sh"><h3>Pack de ressources du monde</h3></div><div class="row" style="margin-bottom:8px"><button class="btn sm" data-a="wsResDl">${ic('search', 13)} Télécharger</button><button class="btn sec sm" data-a="wsResImp">${ic('down', 13)} Importer un .zip</button></div>
  ${w.res ? `<div class="ml">${tile(w.res.icon, w.res.title, '#3a7bd5')}<div style="flex:1"><b>${esc(w.res.title)}</b><br><small>resources.zip · ${mo(w.res.size)} · appliqué à ce monde par le jeu</small></div><button class="ib" data-a="wsResRm">${ic('trash', 13)}</button></div>` : '<p class="mu">Aucun pack de ressources propre à ce monde (resources.zip). Pour tous tes mondes, utilise l’onglet « Packs de ressources » de l’instance.</p>'}
  <div class="sh"><h3>Data packs (${w.packs.length})</h3></div><div class="row" style="margin-bottom:8px"><button class="btn sm" data-a="wsPackDl">${ic('search', 13)} Télécharger</button><button class="btn sec sm" data-a="wsPackImp">${ic('down', 13)} Importer un .zip</button></div>
  ${w.packs.map(p => `<div class="ml">${tile(p.icon, p.title, '#7a5ab8')}<div style="flex:1"><b>${esc(p.title)}</b><br><small>${p.enabled ? '<span style="color:var(--ac)">Activé</span>' : 'Désactivé'} · ${esc(p.name)}</small></div><button class="btn sm ${p.enabled ? 'sec' : ''}" data-a="wsPack" data-n="${esc(p.name)}">${p.enabled ? 'Désactiver' : 'Activer'}</button><button class="ib" data-a="wsPackRm" data-n="${esc(p.name)}">${ic('trash', 13)}</button></div>`).join('') || '<p class="mu">Aucun data pack dans ce monde.</p>'}
  <div class="row end" style="margin-top:14px"><button class="btn" data-a="mclose">Fermer</button></div>`, true);
}
/* ===== catalogue Modrinth (hors création d’instance) ===== */
async function catView() {
  if (!inst.length) return '<p class="mu">Crée d’abord une instance : le catalogue installe directement dedans.</p>';
  if (!byId(cur)) cur = inst.slice().sort((a, b) => b.lastPlayed - a.lastPlayed)[0].id;
  const i = byId(cur);
  const wl = catT === 'datapack' ? await call('worlds:list', cur).catch(() => []) : []; wl.unshift({ folder: '__next__' }); if (!wl.some(x => x.folder === CW)) CW = wl[1] ? wl[1].folder : '__next__';
  const tw = catT === 'datapack' ? await call('dp:tempworld').catch(() => null) : null; if (tw && !CWSET) CW = '__next__';
  const ckey = cur + '|' + catT + '|' + (catT === 'datapack' ? CW : '') + '|' + curSrc();
  if (!BR || BR.cat !== ckey) { const old = BRC[ckey]; BR = { src: curSrc(), sort: BSORT, cat: ckey, world: catT === 'datapack' ? CW : '', ver: i.version, ldr: i.loader, type: catT, mode: 'inst', q: '', hits: old ? old.hits : [], total: old ? old.total : 0, ctx: { id: cur }, need: true }; }
  return `<div class="row" style="margin-bottom:12px"><span class="mu">Installer dans :</span><select data-catinst="1">${inst.map(x => `<option value="${esc(x.id)}" ${x.id === cur ? 'selected' : ''}>${esc(x.name)} (${esc(x.version)} ${esc(x.loader)})</option>`).join('')}</select></div>
  ${catT === 'datapack' ? `<div class="row" style="margin-bottom:8px"><span class="mu">Dans le monde :</span><select data-catworld="1">${wl.map(x => `<option value="${esc(x.folder)}" ${x.folder === CW ? 'selected' : ''}>${x.folder === '__next__' ? 'Prochain nouveau monde' : esc(x.folder)}</option>`).join('')}</select><small class="dpn" title="${esc(CW === '__next__' ? 'Les packs sont déposés dans l’écran « Data Packs » de la création de monde, sinon préparés pour le prochain monde.' : 'Si le jeu tourne, le pack est activé à sa fermeture (ou /reload puis /datapack enable).')}">${CW === '__next__' ? (tw ? '✓ Création de monde détectée' : 'Prêt pour le prochain monde') : 'Activé à la fermeture du jeu'}</small><button class="btn sec sm" data-a="dpImp" style="margin-left:auto">${ic('down', 13)} Importer un .zip</button></div>` : ''}<div class="row" style="margin-bottom:8px">${srcChips()}</div><div class="chips">${[['mod', 'Mods'], ['resourcepack', 'Packs de ressources'], ['shader', 'Shaders'], ['datapack', 'Data packs']].map(([k, l]) => `<span class="chip ${catT === k ? 'a' : ''}" data-a="catType" data-v="${k}">${l}</span>`).join('')}</div>
  <div class="row" style="margin:6px 0 12px"><input id="bq" value="${esc(BR.q)}" placeholder="Rechercher… (vide = les plus populaires)" style="flex:1;width:auto" autocomplete="off">${sortSel()}</div><div id="bres" class="bres tall">${brRows()}</div>`;
}
/* ===== Mon serveur ===== */
async function hostView() {
  const l = await call('host:list');
  return `<div class="row between" style="margin-bottom:12px"><p class="mu" style="margin:0">Héberge ton propre serveur Minecraft sur ce PC. Pour l’instant il est accessible depuis cet ordinateur et ton réseau local ; l’ouverture sur Internet (adresse <b>nom.hydarium.…</b>) viendra avec le serveur Hydarium.</p><div class="row"><button class="btn g" data-a="himp">${ic('down', 14)} Importer</button><button class="btn" data-a="hnew">${ic('plus', 14)} Nouveau serveur</button></div></div>
  ${l.map(h => `<div class="card hv" data-a="hopen" data-id="${esc(h.id)}"><div class="ic">${tile(h.icon, h.name, '#2f6b3a')}<div><b>${esc(h.name)}</b> <span class="bd ${h.state === 'running' ? 'ok' : ''}">${{ stopped: 'Arrêté', starting: 'Démarrage…', running: 'En ligne', stopping: 'Arrêt…' }[h.state]}</span><small>${esc(h.vlabel || (cap(h.type) + ' ' + h.version))} · port ${h.port} · ${h.players.length} joueur(s)</small></div></div><span class="mu">${ic('chev', 16)}</span></div>`).join('') || '<p class="mu" style="text-align:center;padding:30px">Aucun serveur. Clique sur « Nouveau serveur » : Vanilla, Paper (plugins) ou Fabric (mods).</p>'}`;
}
async function hostLv() { // Forge / NeoForge : versions du loader pour la version de Minecraft choisie
  const c = HC; c.lvs = null; c.lv = ''; if (c.type !== 'forge' && c.type !== 'neoforge') { hostNew(); return; }
  hostNew(); try { const l = await call('forge:versions', c.type, c.version); if (HC !== c) return; c.lvs = l; c.lv = l[0] ? l[0].v : ''; } catch (e) { c.lvs = []; }
  hostNew();
}
async function wsModal() {
  const W = WS, att = W.kind === 'attach', S = (a, b) => a === b ? 'selected' : '', ws = att && W.inst ? await call('worlds:list', W.inst).catch(() => []) : [];
  if (att && !ws.some(x => x.folder === W.folder)) W.folder = (ws.find(x => x.valid) || {}).folder || '';
  const rel = vers.filter(v => v.type === 'release');
  openModal(`<h3>${att ? 'Utiliser un monde d’une instance' : 'Transformer ce monde en serveur'}</h3>
  ${att ? `<div class="two2"><div class="fld"><label>Instance</label><select data-ws="inst">${inst.map(x => `<option value="${esc(x.id)}" ${S(x.id, W.inst)}>${esc(x.name)}</option>`).join('')}</select></div><div class="fld"><label>Monde</label><select data-ws="folder">${ws.filter(x => x.valid).map(x => `<option ${S(x.folder, W.folder)}>${esc(x.folder)}</option>`).join('') || '<option value="">Aucun monde utilisable</option>'}</select></div></div>`
  : `<p class="mu">Monde : <b>${esc(W.folder)}</b></p><div class="fld"><label>Nom du serveur</label><input data-ws="name" value="${esc(W.name)}" maxlength="40" style="width:100%"></div>
  <div class="two2"><div class="fld"><label>Type</label><select data-ws="type"><option value="vanilla" ${S('vanilla', W.type)}>Vanilla (officiel)</option><option value="fabric" ${S('fabric', W.type)}>Fabric (mods)</option><option value="paper" ${S('paper', W.type)}>Paper (plugins)</option></select></div><div class="fld"><label>Version</label><select data-ws="version">${rel.map(v => `<option ${v.id === W.version ? 'selected' : ''}>${esc(v.id)}</option>`).join('')}</select></div></div>
  ${W.hint ? `<div class="note" style="border-color:var(--wa)">${W.hint}</div>` : ''}
  <div class="fld"><label>Mémoire : <b id="wsm">${W.mem} Go</b></label><input type="range" min="1" max="16" value="${W.mem}" data-ws="mem" data-live="wsm" data-unit=" Go" style="width:100%"></div>`}
  <div class="fld"><label>Lien avec le monde</label><select data-ws="link"><option value="link" ${S('link', W.link)}>Relier : mêmes fichiers pour l’instance et le serveur</option><option value="copy" ${S('copy', W.link)}>Copier : le serveur a sa propre copie</option></select><small>Relié : ce que tu fais d’un côté se retrouve de l’autre. Minecraft verrouille le monde : quand le serveur est en ligne, « Jouer » ce monde dans le launcher te fait rejoindre le serveur. Copié : aucun lien, rien n’est partagé.</small></div>
  ${att ? '' : `<label class="ckb" style="margin:8px 0"><input type="checkbox" data-ws="eula" ${W.eula ? 'checked' : ''}> J’accepte le <a href="https://aka.ms/MinecraftEULA" target="_blank" style="color:var(--ac)">contrat de licence de Minecraft (CLUF)</a></label>`}
  <div class="row end" style="margin-top:12px"><button class="btn sec" data-a="mclose">Annuler</button><button class="btn" data-a="wsgo" ${att && !W.folder ? 'disabled' : ''}>${att ? 'Utiliser ce monde' : 'Créer le serveur'}</button></div>`);
}
function hostNew() {
  HC = HC || { name: '', type: 'vanilla', version: (vers.find(v => v.type === 'release') || {}).id || '', mem: 2, eula: false };
  openModal(`<h3>Nouveau serveur</h3><div class="fld"><label>Nom du serveur</label><input data-hc="name" value="${esc(HC.name)}" maxlength="40" placeholder="Mon serveur" style="width:100%"><small>C’est aussi le message affiché dans la liste des serveurs du jeu. Tu pourras le changer plus tard.</small></div>
  <div class="two2"><div class="fld"><label>Type</label><select data-hc="type"><option value="vanilla" ${HC.type === 'vanilla' ? 'selected' : ''}>Vanilla (officiel)</option><option value="paper" ${HC.type === 'paper' ? 'selected' : ''}>Paper (plugins, performant)</option><option value="fabric" ${HC.type === 'fabric' ? 'selected' : ''}>Fabric (mods)</option><option value="forge" ${HC.type === 'forge' ? 'selected' : ''}>Forge (mods)</option><option value="neoforge" ${HC.type === 'neoforge' ? 'selected' : ''}>NeoForge (mods)</option></select></div><div class="fld"><label>Version</label><select data-hc="version">${vers.filter(v => v.type === 'release').map(v => `<option ${v.id === HC.version ? 'selected' : ''}>${esc(v.id)}</option>`).join('')}</select></div></div>
  ${HC.type === 'forge' || HC.type === 'neoforge' ? `<div class="fld"><label>Version de ${HC.type === 'forge' ? 'Forge' : 'NeoForge'} <span class="mu">(expérimental : l’installation prend quelques minutes la première fois)</span></label>${HC.lvs === null || HC.lvs === undefined ? '<span class="mu">Recherche des versions…</span>' : HC.lvs.length ? `<select data-hc="lv">${HC.lvs.map(l => `<option value="${esc(l.v)}" ${l.v === HC.lv ? 'selected' : ''}>${esc(l.label)}</option>`).join('')}</select>` : `<span class="mu">Aucune version de ${HC.type === 'forge' ? 'Forge' : 'NeoForge'} pour Minecraft ${esc(HC.version)} : choisis une autre version.</span>`}</div>` : ''}
  <div class="fld"><label>Mémoire : <b id="hcm">${HC.mem} Go</b></label><input type="range" min="1" max="16" value="${HC.mem}" data-hc="mem" data-live="hcm" data-unit=" Go" style="width:100%"></div>
  <div class="sh" style="margin-top:10px"><h3>Joueurs</h3></div><div class="two2"><div class="fld"><label>Opérateurs (administrateurs) · un pseudo par ligne</label><textarea data-hcl="ops" rows="3" placeholder="MonPseudo">${esc((HC.ops || []).join('\n'))}</textarea></div><div class="fld"><label>Liste blanche · un pseudo par ligne</label><textarea data-hcl="whitelist" rows="3" placeholder="Ami1\nAmi2">${esc((HC.whitelist || []).join('\n'))}</textarea></div></div><small>La liste blanche limite l’accès à ces joueurs (laisse vide pour que tout le monde puisse entrer).</small>
  <label class="ckb" style="margin:8px 0"><input type="checkbox" data-hc="eula" ${HC.eula ? 'checked' : ''}> J’accepte le <a href="https://aka.ms/MinecraftEULA" target="_blank" style="color:var(--ac)">contrat de licence de Minecraft (CLUF)</a></label>
  <div class="row end" style="margin-top:12px"><button class="btn sec" data-a="mclose">Annuler</button><button class="btn" data-a="hgo">Créer le serveur</button></div>`);
}
const av = n => `<img class="pav" src="https://mc-heads.net/avatar/${encodeURIComponent(n)}/32" alt="">`;
function playersHtml(h, P, on) {
  const run = h.state === 'running', pl = (nm, tag) => `<div class="pl">${av(nm)}<b>${esc(nm)}</b>${tag || ''}`;
  const lst = (title, arr, rm, empty) => `<div class="plcol"><h4>${title} <span class="mu">(${arr.length})</span></h4>${arr.map(x => `${pl(x.name)}<button class="ib" title="Retirer" data-a="hplay" data-act="${rm}" data-n="${esc(x.name)}">${ic('x', 12)}</button></div>`).join('') || `<span class="mu">${empty}</span>`}</div>`;
  return `<div class="card col" style="margin-top:10px"><div class="row between"><h3 style="margin:0">Joueurs</h3><label class="ckb"><input type="checkbox" data-hp="white-list" ${P.whitelistOn ? 'checked' : ''} ${on ? 'disabled' : ''}> Liste blanche active</label></div>
  <div class="plon"><b style="font-size:12px">En ligne (${h.players.length})</b>${h.players.map(n => `${pl(n)}<button class="btn g sm" data-a="hplay" data-act="op" data-n="${esc(n)}">Op</button><button class="btn g sm" data-a="hplay" data-act="kick" data-n="${esc(n)}">Expulser</button><button class="btn dg sm" data-a="hplay" data-act="ban" data-n="${esc(n)}">Bannir</button></div>`).join('') || '<span class="mu"> personne pour l’instant</span>'}</div>
  <div class="row" style="margin:10px 0"><input id="hnew" placeholder="Ajouter un joueur (pseudo)" maxlength="16" style="flex:1;width:auto"><button class="btn sm" data-a="hadd" data-act="add-whitelist">+ Liste blanche</button><button class="btn g sm" data-a="hadd" data-act="op">+ Opérateur</button><button class="btn g sm" data-a="hadd" data-act="ban">Bannir</button></div>
  <div class="plcols">${lst('Liste blanche', P.whitelist, 'remove-whitelist', 'Vide : tout le monde peut entrer si elle est désactivée.')}${lst('Opérateurs', P.ops, 'deop', 'Aucun opérateur.')}${lst('Bannis', P.banned, 'pardon', 'Personne de banni.')}</div>${P.online ? '' : '<small>Serveur hors ligne (online-mode désactivé) : les pseudos sont identifiés sans compte Microsoft.</small>'}</div>`;
}
const p2pCard = (h, I) => {
  const head = '<div class="card col" style="margin-top:10px"><b>Invitation privée (sans port ouvert)</b>';
  if (!I.on) return head + '<small>Tes amis qui ont Hydarium rejoignent ton serveur avec un code, en connexion directe de PC à PC : rien à ouvrir sur ta box, et seuls ceux qui ont le code peuvent entrer. Bien plus sûr qu’ouvrir un port.</small><div class="row" style="margin-top:8px"><button class="btn sm" data-a="p2pon">Activer les invitations privées</button></div></div>';
  const n = I.peers || 0, st = h.state === 'running' ? (I.sharing ? `<span class="bd ok">Partagé · ${n} ami${n > 1 ? 's' : ''} connecté${n > 1 ? 's' : ''}</span>` : '<span class="bd wa">Ouverture du partage…</span>') : '<span class="bd">Le partage démarre avec le serveur</span>';
  return head + `<div class="keywarn" style="margin-top:8px">🔑 <b>Ce code est comme un mot de passe.</b> Qui l’a peut se connecter à ton serveur et voit ton adresse IP. Ne le publie pas (Discord public, vidéo, stream, capture d’écran) : donne-le seulement à des amis, et si ça fuite clique sur « Nouveau code ».</div><div class="row" style="margin-top:8px"><b class="p2pcode">${esc(I.code)}</b><button class="btn g sm" data-a="p2pcopy" data-v="${esc(I.code)}">Copier</button>${st}</div><div class="row" style="margin-top:8px"><button class="btn g sm" data-a="p2pnew">Nouveau code</button><button class="btn g sm" data-a="p2poff">Désactiver</button></div><small>Tes amis : <b>Mes serveurs</b>, ils collent ce code dans le champ d’adresse puis « Ajouter ». Avec le mode Hydarium (Fabric 1.20.1, 1.21 et 26.x), ils peuvent aussi le coller directement à la place de l’adresse d’un serveur, dans le jeu. « Nouveau code » annule l’ancien. Sans relais, ça ne marche pas sur tous les réseaux (certains opérateurs, 4G/5G) : utilise alors playit.gg ci-dessus.</small></div>`;
};
async function hostDetail() {
  const l = await call('host:list'), h = l.find(x => x.id === HID); if (!h) { page = 'host'; return hostView(); }
  cur = HID; HOBJ = h; const pl = h.type === 'paper' ? await call('plugin:list', HID).catch(() => []) : [], hd = h.type === 'fabric' ? await call('inst:detail', HID).catch(() => null) : null;
  const PG = await call('playit:status').catch(() => null), PI = await call('p2p:info', HID).catch(() => ({ on: false, code: '', sharing: false, peers: 0 })), PL = (await call('host:players', HID).catch(() => null)) || { ops: [], whitelist: [], banned: [] }, p = await call('host:props', HID), lines = await call('host:log', HID), on = h.state !== 'stopped', S = (a, b) => a === b ? 'selected' : '';
  const ck = (k, t) => `<label class="ckb"><input type="checkbox" data-hp="${k}" ${p[k] === 'true' ? 'checked' : ''} ${on ? 'disabled' : ''}> ${t}</label>`;
  return `<div class="row between" style="margin-bottom:12px"><div class="row"><button class="btn sec sm" data-a="hback">${ic('back', 13)} Retour</button>${tile(h.icon, h.name, '#2f6b3a')}<input class="hname" data-hname="1" value="${esc(h.name)}" maxlength="40" title="Renommer le serveur"><span class="bd" title="Version du serveur">${esc(h.vlabel || (cap(h.type) + ' ' + h.version))}</span><span class="bd ${h.state === 'running' ? 'ok' : ''}">${{ stopped: 'Arrêté', starting: 'Démarrage…', running: 'En ligne', stopping: 'Arrêt…' }[h.state]}</span></div><div class="row">${on ? `<button class="btn dg" data-a="hstop" ${h.state === 'stopping' ? 'disabled' : ''}>Arrêter</button>` : `<button class="btn" data-a="hstart">${ic('play', 13)} Démarrer</button>`}<button class="btn g" data-a="hfolder" title="Ouvrir le dossier">${ic('folder', 13)}</button><button class="btn g" data-a="hexp" title="Exporter (zip à déployer ailleurs)" ${on ? 'disabled' : ''}>${ic('down', 13)} Exporter</button></div></div>
  <div class="card col"><b>Adresses</b><small>Sur ce PC : <b>localhost:${h.port}</b>${h.ip.length ? ' · Réseau local (même Wi-Fi) : ' + h.ip.map(x => '<b>' + esc(x) + ':' + h.port + '</b>').join(', ') : ''} ${(PG && PG.tunnels && PG.tunnels[h.port]) || h.playitAddress ? '· Internet (playit.gg) : <b>' + esc((PG && PG.tunnels && PG.tunnels[h.port]) || h.playitAddress) + '</b>' : ''}</small><div class="row" style="margin-top:8px"><button class="btn g sm" data-a="hmine">Ajouter à Mes serveurs</button><button class="btn sm" data-a="hjoin" data-v="${h.port}" ${h.state === 'running' && !playing ? '' : 'disabled'}>${ic('play', 12)} Rejoindre avec Minecraft</button></div></div>
  ${pgCard(h, PG)}
  ${p2pCard(h, PI)}
  <div class="sh"><h3>Console</h3></div><pre id="hcon" class="con">${esc(lines.join('\n'))}</pre><div class="row" style="margin-top:6px"><input id="hcmd" placeholder="Commande (sans /)  ex : say Bonjour" style="flex:1;width:auto" ${on ? '' : 'disabled'}><button class="btn" data-a="hcmd" ${on ? '' : 'disabled'}>Envoyer</button></div>
  ${playersHtml(h, PL, on)}
  <div class="card col hset" style="margin-top:10px"><div class="row between"><h3 style="margin:0">Paramètres du serveur</h3>${on ? '<span class="bd wa">Arrête le serveur pour les modifier</span>' : ''}</div>
  <div class="hsec"><span class="hst">Identité</span><div class="hid"><div class="fld"><label>Icône <span class="mu">(64×64)</span></label><div class="row">${tile(h.icon, h.name, '#2f6b3a')}${h.worldIcon ? '<small class="mu">Icône du monde relié (automatique)</small>' : `<button class="btn g sm" data-a="hicon" ${on ? 'disabled' : ''}>Choisir…</button>${h.icon ? `<button class="btn g sm" data-a="hiconrm" ${on ? 'disabled' : ''}>Retirer</button>` : ''}`}</div></div><div class="fld" style="flex:1"><label>Description affichée dans la liste des serveurs <span class="mu">(Entrée = nouvelle ligne)</span></label><textarea data-hpm="1" rows="2" maxlength="120" ${on ? 'disabled' : ''}>${esc((p.motd || '').replace(/\\n/g, '\n'))}</textarea></div></div></div>
  <div class="hsec"><span class="hst">Partie</span><div class="three"><div class="fld"><label>Difficulté</label><select data-hp="difficulty" ${on ? 'disabled' : ''}>${['peaceful', 'easy', 'normal', 'hard'].map(k => `<option value="${k}" ${S(k, p.difficulty)}>${{ peaceful: 'Paisible', easy: 'Facile', normal: 'Normal', hard: 'Difficile' }[k]}</option>`).join('')}</select></div><div class="fld"><label>Mode de jeu</label><select data-hp="gamemode" ${on ? 'disabled' : ''}>${['survival', 'creative', 'adventure', 'spectator'].map(k => `<option value="${k}" ${S(k, p.gamemode)}>${{ survival: 'Survie', creative: 'Créatif', adventure: 'Aventure', spectator: 'Spectateur' }[k]}</option>`).join('')}</select></div><div class="fld"><label>Seed <span class="mu">(nouveau monde)</span></label><input data-hp="level-seed" value="${esc(p['level-seed'])}" maxlength="40" placeholder="aléatoire" ${on ? 'disabled' : ''}></div></div><div class="hck">${ck('pvp', 'PvP')}${ck('allow-flight', 'Vol autorisé')}</div></div>
  <div class="hsec"><span class="hst">Joueurs et accès</span><div class="three"><div class="fld"><label>Joueurs max</label><input data-hp="max-players" type="number" min="1" value="${esc(p['max-players'])}" ${on ? 'disabled' : ''}></div><div class="fld"><label>Port</label><input data-hp="server-port" type="number" value="${esc(p['server-port'])}" ${on ? 'disabled' : ''}></div></div><div class="hck">${ck('online-mode', 'Comptes Microsoft vérifiés (recommandé)')}${ck('white-list', 'Liste blanche')}</div></div>
  <div class="hsec"><span class="hst">Performances</span><div class="three"><div class="fld"><label>Distance d’affichage <span class="mu">(chunks)</span></label><input data-hp="view-distance" type="number" min="3" max="32" value="${esc(p['view-distance'])}" ${on ? 'disabled' : ''}></div><div class="fld" style="grid-column:span 2"><label>Mémoire : <b id="hmv">${h.mem} Go</b></label><input type="range" min="1" max="16" value="${h.mem}" data-hmem="1" data-live="hmv" data-unit=" Go" style="width:100%" ${on ? 'disabled' : ''}></div></div></div></div>
 <div class="card col" style="margin-top:10px"><div class="row between"><h3 style="margin:0">Monde du serveur</h3><div class="row">${h.link ? `<button class="btn g sm" data-a="hunlink" ${on ? 'disabled' : ''}>Délier</button>` : ''}<button class="btn sec sm" data-a="hworld" ${on ? 'disabled' : ''}>${ic('link', 13)} Utiliser un monde d’une instance…</button></div></div><small>${h.link ? `Relié au monde « ${esc(h.link.folder)} » de l’instance « ${esc((byId(h.link.inst) || {}).name || '?')} » : ce sont les mêmes fichiers des deux côtés. Tu peux lancer l’instance quand le serveur est en ligne : ouvrir ce monde te fait alors rejoindre le serveur.` : `Monde actuel : « ${esc(p['level-name'] || 'world')} ». Tu peux utiliser un monde d’une instance, relié (mêmes fichiers) ou copié.`}${on ? ' Arrête le serveur pour changer de monde.' : ''}</small></div>
 ${(h.type === 'forge' || h.type === 'neoforge') ? `<div class="card col" style="margin-top:10px"><h3 style="margin:0">Mods du serveur (${h.type === 'forge' ? 'Forge' : 'NeoForge'} ${esc(h.loaderVer || '')})</h3><small>Dépose les fichiers .jar des mods dans le dossier du serveur (sous-dossier « mods »). Les joueurs doivent avoir les mêmes mods. Le téléchargement direct depuis le catalogue arrivera pour les serveurs Forge.</small><div class="row" style="margin-top:8px"><button class="btn g sm" data-a="hfolder">${ic('folder', 13)} Ouvrir le dossier du serveur</button></div></div>` : ''}
  ${h.type === 'fabric' && hd ? `<div class="card col" style="margin-top:10px"><div class="row between"><h3 style="margin:0">Mods du serveur (Fabric)</h3><div class="row"><button class="btn sec sm" data-a="modupd" ${on ? 'disabled' : ''}>${ic('refresh', 13)} Mises à jour</button>${hd.mods.length ? `<button class="btn dg sm" data-a="modrmall" data-n="${hd.mods.length}" ${on ? 'disabled' : ''}>${ic('x', 13)} Tout retirer</button>` : ''}<button class="btn sm" data-a="browse" data-t="mod" ${on ? 'disabled' : ''}>${ic('plus', 13)} Ajouter des mods</button></div></div><small>Les joueurs doivent avoir les mêmes mods côté client. ${on ? 'Arrête le serveur pour modifier les mods.' : ''}</small>${hd.mods.length ? modBar(hd.mods.filter(m => SELM.has(m.pid)).length, hd.mods.length) : ''}${modsSplit(hd.mods, x => `<div class="ml ${x.disabled ? 'dim' : ''} ${SELM.has(x.pid) ? 'sel' : ''}">${selBox(SELM.has(x.pid), 'msel', x.pid)}${tile(x.icon, x.title)}<div style="flex:1"><b>${esc(x.title)}</b> ${x.disabled ? BD.off : BD[x.status]}<br><small>${esc(x.file)}</small></div><button class="swt ${x.disabled ? '' : 'on'}" data-a="modtog" data-pid="${esc(x.pid)}" ${on ? 'disabled' : ''}></button><button class="ib" data-a="rm" data-pid="${esc(x.pid)}" ${on ? 'disabled' : ''}>${ic('x', 13)}</button></div>`, '<p class="mu">Aucun mod. Fabric API est ajouté automatiquement avec les mods qui en ont besoin.</p>')}</div>` : h.type === 'paper' ? `<div class="card col" style="margin-top:10px"><div class="row between"><h3 style="margin:0">Plugins (Paper)</h3><button class="btn sm" data-a="browse" data-t="plugin" ${on ? 'disabled' : ''}>${ic('plus', 13)} Ajouter des plugins</button></div><small>Source Modrinth ou CurseForge. Arrête le serveur pour modifier les plugins.</small>${pl.map(x => `<div class="ml ${x.enabled ? '' : 'dim'}">${tile(x.icon, x.title, '#7a5ab8')}<div style="flex:1"><b>${esc(x.title)}</b><br><small>${esc(x.file)}</small></div><button class="swt ${x.enabled ? 'on' : ''}" data-a="ptog" data-f="${esc(x.file)}" ${on ? 'disabled' : ''}></button><button class="ib" data-a="prm" data-f="${esc(x.file)}" ${on ? 'disabled' : ''}>${ic('x', 13)}</button></div>`).join('') || '<p class="mu">Aucun plugin.</p>'}</div>` : ''}
  <p class="mu">Packs de ressources du serveur : à venir, quand les serveurs pourront être joués en ligne.</p>
  <div class="row" style="margin-top:14px"><button class="btn dg" data-a="hdel" ${on ? 'disabled' : ''}>${ic('trash', 14)} Supprimer ce serveur</button></div>`;
}

/* ===== Client Hydarium : modules en jeu (agent). La configuration est enregistrée ; l’agent la lira. ===== */
const HUDM = { fps: ['FPS', 'Images par seconde', '144 FPS'], cps: ['CPS', 'Clics par seconde (gauche | droit)', '8 | 5'], keystrokes: ['Touches', 'Touches pressées (ZQSD / WASD selon ton clavier)', 'keys'], coords: ['Coordonnées', 'X, Y, Z sans ouvrir F3', 'X 128  Y 64  Z -302'], direction: ['Direction', 'Orientation et boussole', 'Nord-Est (NE)'], armor: ['Armure', 'Pièces d’armure et durabilité restante', '▮▮▮▮ 412/528'], potions: ['Effets', 'Effets de potion et durée', 'Vitesse II 0:42'], ping: ['Ping', 'Latence du serveur', '24 ms'], clock: ['Heure', 'Heure réelle du PC', '21:42'], memory: ['Mémoire', 'RAM utilisée', '2,1 / 4 Go'], music: ['Musique', 'Morceau en cours (Spotify / YouTube Music)', '♪ Titre — Artiste'], session: ['Temps de session', 'Durée de la partie en cours', 'Session 42:10'], };
const HDEF = { fps: [.01, .02], cps: [.01, .09], keystrokes: [.01, .42], coords: [.38, .02], direction: [.38, .09], armor: [.84, .42], potions: [.84, .02], ping: [.16, .02], clock: [.16, .09], memory: [.27, .02], music: [.36, .9], session: [.27, .09] };
const CTOOLS = [['zoom', 'Zoom', 'Zoom optique permanent tant que le zoom est actif ; la touche l’active ou le désactive.', { key: 'C' }], ['togglesprint', 'Sprint automatique', 'Garde le sprint sans tenir la touche.'], ['gamma', 'Luminosité maximale', 'Éclaire les zones sombres (vision nocturne visuelle).', { level: [1, 15] }]];
const keysPrev = (layout, m) => { const k = ['w', 'a', 's', 'd'].map(keyChar); return `<div class="kp"><i></i><b>${k[0]}</b><i></i><b>${k[1]}</b><b>${k[2]}</b><b>${k[3]}</b></div>`; };
/* glisser-déposer des modules dans l’aperçu */
document.addEventListener('pointerdown', e => { const m = e.target.closest('.hudm'); if (!m) return; const area = m.parentElement, r = area.getBoundingClientRect(), b = m.getBoundingClientRect(); HD = { m, area, r, dx: e.clientX - b.left, dy: e.clientY - b.top, moved: false }; selMod = m.dataset.k; document.querySelectorAll('.hudm').forEach(x => x.classList.toggle('sel', x === m)); m.setPointerCapture(e.pointerId); e.preventDefault(); });
document.addEventListener('pointermove', e => { if (!HD) return; HD.moved = true; const x = Math.min(Math.max((e.clientX - HD.dx - HD.r.left) / HD.r.width, 0), 0.98), y = Math.min(Math.max((e.clientY - HD.dy - HD.r.top) / HD.r.height, 0), 0.96); HD.m.style.left = x * 100 + '%'; HD.m.style.top = y * 100 + '%'; HD.x = x; HD.y = y; });
document.addEventListener('pointerup', async () => { const h = HD; HD = null; if (!h) return; try { if (h.moved && h.x !== undefined) { const i = byId(cur), c = JSON.parse(JSON.stringify(i.client || { on: false, modules: {} })); (c.modules[h.m.dataset.k] = c.modules[h.m.dataset.k] || { on: true }).pos = { x: h.x, y: h.y }; await setI({ client: c }); i.client = c; flash('Position enregistrée ✓'); } render(); } catch (e) { note(e.message, 'Erreur'); } });
/* ===== menu en jeu (fenêtre du launcher par-dessus Minecraft) ===== */
const CM = [['coords', 'Coordonnées', 'pin', 'agent'], ['keystrokes', 'Touches', 'kbd', 'ovl'], ['fps', 'FPS', 'gauge', 'agent'], ['cps', 'CPS', 'mouse', 'ovl'], ['armor', 'Armure', 'shield', 'agent'], ['potions', 'Effets', 'flask', 'agent'], ['zoom', 'Zoom', 'zoom', 'agent'], ['ping', 'Ping', 'wifi', 'ovl'], ['clock', 'Heure', 'clock', 'ovl'], ['memory', 'Mémoire', 'chip', 'ovl'], ['direction', 'Direction', 'compass', 'agent'], ['music', 'Musique', 'music', 'ovl'], ['session', 'Session', 'timer', 'ovl'], ['gamma', 'Luminosité', 'sun', 'agent'], ['togglesprint', 'Sprint auto', 'bolt', 'agent'], ['autowalk', 'Marche auto', 'walk', 'agent'], ['togglesneak', 'Sneak permanent', 'walk', 'agent']];
/* le sneak verrouillable n’existe que pour les versions SANS l’option native « Basculer l’accroupissement » (même seuil que le sprint auto : 1.15) */
const nativeSneak = v => { const m = /^1\.(\d+)/.exec(v || ''); return m ? +m[1] >= 15 : true; };
const cmFor = i => CM.filter(x => x[0] !== 'togglesneak' || !nativeSneak(i && i.version));
const ovInst = () => byId(OVI) || byId(cur);
const CPRO = [['PvP', ['keystrokes', 'cps', 'fps', 'armor', 'potions', 'ping']], ['Survie', ['coords', 'direction', 'armor', 'clock']], ['Minimal', ['fps']], ['Complet', CM.map(x => x[0]).filter(x => !['zoom', 'autowalk', 'togglesneak'].includes(x))]];
let OVQ = '', OVF = 'all';
const mOn = (c, k) => !!(c.modules && c.modules[k] && c.modules[k].on);
/* éléments affichés des widgets à plusieurs parties (vide = tout) */
const SHOWF = { armor: [['icon', 'Icône'], ['name', 'Nom'], ['pct', 'Pourcentage']], potions: [['icon', 'Icône'], ['name', 'Nom'], ['lvl', 'Niveau'], ['time', 'Durée']] };
const showHas = (m, f) => !m || !m.show || (',' + m.show + ',').includes(',' + f + ',');
/* touches de chaque widget : « key » = touche d'usage (zoom : bascule ; marche auto : bascule) · « toggle » = touche qui active / désactive le widget en jeu */
const KEYED = { zoom: 'C', autowalk: 'K', togglesneak: 'V' }, KEYT = { zoom: 'Touche qui active / désactive le zoom', autowalk: 'Touche qui lance / arrête la marche automatique', togglesneak: 'Touche qui lance / arrête le sneak permanent (il s’arrête aussi dès que tu sneakes toi-même)' };

/* capture d'une touche : un clic sur le bouton, puis la prochaine touche pressée est enregistrée (Échap = annuler) */
let CAP = null;
const saveKey = async (k, f, v) => { const i = byId(cur); if (!i) return; const c = JSON.parse(JSON.stringify(i.client || { on: true, modules: {} })); c.modules = c.modules || {}; const m = (c.modules[k] = c.modules[k] || {}); if (v) m[f] = v; else delete m[f]; await setI({ client: c }); i.client = c; };
function capEnd(label) { if (!CAP) return; const el = CAP.el; document.removeEventListener('keydown', capKey, true); document.removeEventListener('mousedown', capOut, true); CAP = null; if (el && el.isConnected && label !== undefined) { el.textContent = label; el.classList.remove('wait'); } }
function capOut(e) { if (CAP && !e.target.closest('.keycap')) { const k = CAP.prev; capEnd(k); } }
async function capKey(e) {
  if (!CAP) return; e.preventDefault(); e.stopPropagation();
  if (e.code === 'Escape') return capEnd(CAP.prev);
  const C = CAP; const mod = /^(Alt|Control|Shift|Meta)(Left|Right)$/.test(e.code);
  try {
    if (C.set) { // raccourci global : modificateurs + touche
      if (mod) { C.el.textContent = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Maj'].filter(Boolean).join('+') + '+…'; return; }
      const n = /^Key[A-Z]$/.test(e.code) ? e.code.slice(3) : /^Digit\d$/.test(e.code) ? e.code.slice(5) : /^F\d{1,2}$/.test(e.code) ? e.code : { Space: 'Space', Tab: 'Tab', Enter: 'Return', Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right' }[e.code];
      if (!n) { flash('Cette touche ne peut pas servir de raccourci global.'); return; }
      if (!(e.ctrlKey || e.altKey || e.shiftKey || /^F\d/.test(n))) { flash('Ajoute Ctrl, Alt ou Maj (sinon la touche serait volée à tous tes programmes).'); return; }
      const acc = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', n].filter(Boolean).join('+');
      await call('set:set', { overlayKey: acc }); cfg.overlayKey = acc; capEnd(acc); flash('Raccourci enregistré : ' + acc + ' (actif au prochain lancement du jeu)'); return;
    }
    const name = codeToKey(e.code); if (!name) { flash('Touche non prise en charge : ' + e.code); return; }
    await saveKey(C.k, C.f, name); capEnd(keyShow(name)); flash('Touche enregistrée : ' + keyShow(name));
    if (C.el && C.el.isConnected && !C.el.nextElementSibling && name) C.el.insertAdjacentHTML('afterend', `<a class="kx" data-a="keyclr" data-cm="${C.k}" data-f="${C.f}" title="Effacer">×</a>`);
    C.el && C.el.classList.remove('empty');
  } catch (err) { capEnd(C.prev); note(err.message, 'Erreur'); }
}
/* Vraies touches : on enregistre la touche PHYSIQUE pressée (KeyboardEvent.code → nom du mod : A, F6, UP, LALT, NUM3…) ; l'affichage suit ta disposition de clavier (AZERTY…). */
let KLAY = null; try { navigator.keyboard.getLayoutMap().then(m => { KLAY = m; }); } catch (e) {}
const CODE2KEY = { Space: 'SPACE', Enter: 'ENTER', NumpadEnter: 'ENTER', Tab: 'TAB', Backspace: 'BACKSPACE', Insert: 'INSERT', Delete: 'DELETE', Home: 'HOME', End: 'END', PageUp: 'PAGEUP', PageDown: 'PAGEDOWN', CapsLock: 'CAPS', ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', AltLeft: 'LALT', AltRight: 'RALT', ControlLeft: 'LCTRL', ControlRight: 'RCTRL', ShiftLeft: 'LSHIFT', ShiftRight: 'RSHIFT', Backquote: 'GRAVE', Minus: 'MINUS', Equal: 'EQUALS', Comma: 'COMMA', Period: 'PERIOD', Slash: 'SLASH', Semicolon: 'SEMICOLON', Quote: 'APOSTROPHE', BracketLeft: 'LBRACKET', BracketRight: 'RBRACKET', Backslash: 'BACKSLASH' };
const KEY2CODE = Object.fromEntries(Object.entries(CODE2KEY).filter(([c]) => c !== 'NumpadEnter').map(([c, k]) => [k, c]));
const KEYSHOW = { SPACE: 'Espace', ENTER: 'Entrée', TAB: 'Tab', BACKSPACE: '⌫', INSERT: 'Inser', DELETE: 'Suppr', HOME: 'Début', END: 'Fin', PAGEUP: 'Pg ↑', PAGEDOWN: 'Pg ↓', CAPS: 'Verr. Maj', UP: '↑', DOWN: '↓', LEFT: '←', RIGHT: '→', LALT: 'Alt', RALT: 'Alt Gr', ALT: 'Alt', LCTRL: 'Ctrl', RCTRL: 'Ctrl dr.', CTRL: 'Ctrl', LSHIFT: 'Maj', RSHIFT: 'Maj dr.', SHIFT: 'Maj' };
const codeToKey = c => /^Key[A-Z]$/.test(c) ? c.slice(3) : /^Digit\d$/.test(c) ? c.slice(5) : /^F\d{1,2}$/.test(c) ? c : /^Numpad\d$/.test(c) ? 'NUM' + c.slice(6) : CODE2KEY[c] || '';
const keyShow = k => { if (!k) return '—'; if (KEYSHOW[k]) return KEYSHOW[k]; if (/^NUM\d$/.test(k)) return 'Pavé ' + k.slice(3); const c = /^[A-Z]$/.test(k) ? 'Key' + k : /^\d$/.test(k) ? 'Digit' + k : KEY2CODE[k]; const ch = KLAY && c && KLAY.get(c); return ch ? ch.toUpperCase() : k; };
const keyCap = (k, f, v, tip) => `<span class="kc"><button class="keycap ${v ? '' : 'empty'}" data-a="keycap" data-cm="${k}" data-f="${f}" title="${esc(tip)}">${esc(keyShow(v))}</button>${v ? `<a class="kx" data-a="keyclr" data-cm="${k}" data-f="${f}" title="Effacer">×</a>` : ''}</span>`;
const keyIn = (c, k) => { const m = (c.modules && c.modules[k]) || {}; return `<div class="mkeys">${KEYED[k] ? keyCap(k, 'key', m.key || KEYED[k], KEYT[k] + ' — clique puis appuie sur la touche') : ''}${keyCap(k, 'toggle', m.toggle || '', 'Touche pour activer / désactiver ce widget en jeu — clique puis appuie sur une touche')}</div>`; };
/* raccourci global du menu (Alt+H…) : combinaison saisie au clavier → format Electron */
const accelShow = a => a === 'off' ? 'Désactivé' : String(a || 'Alt+H');
const accelBtn = () => `<span class="kc"><button class="keycap wide" data-a="keycap" data-set="overlayKey" title="Clique puis appuie sur la combinaison (ex. Alt+H). Il faut au moins Ctrl, Alt ou Maj, ou une touche F.">${esc(accelShow(cfg.overlayKey === undefined ? 'Alt+H' : cfg.overlayKey))}</button>${cfg.overlayKey === 'off' ? '' : '<a class="kx" data-a="keyclr" data-set="overlayKey" title="Désactiver le raccourci">×</a>'}</span>`;
function modGrid(c) {
  const q = OVQ.trim().toLowerCase(), l = cmFor(ovInst()).filter(([k, n, , kind]) => (!q || n.toLowerCase().includes(q)) && (OVF === 'all' || (OVF === 'on' && mOn(c, k)) || (OVF === 'off' && !mOn(c, k)) || OVF === kind));
  return l.map(([k, n, icn, kind]) => `<div class="mcard ${mOn(c, k) ? 'on' : ''}"><svg class="i mi" viewBox="0 0 24 24" width="26" height="26">${P[icn]}</svg><b>${n}</b>${kind === 'agent' ? '<small>' + (k === 'togglesneak' ? 'Mod en jeu (Forge)' : 'Mod en jeu (Fabric)') + '</small>' : '<small>Actif</small>'}${keyIn(c, k)}<button class="swt ${mOn(c, k) ? 'on' : ''}" data-a="cmod" data-k="${k}"></button></div>`).join('') || '<p class="mu">Aucun module.</p>';
}
function edLayer(c) {
  const M = k => (c.modules && c.modules[k]) || { on: false }, boxes = Object.keys(HUDM).filter(k => M(k).on).map(k => { const m = M(k), p = m.pos || { x: HDEF[k][0], y: HDEF[k][1] }, sample = HUDM[k][2] === 'keys' ? keysPrev(m.layout) : esc(HUDM[k][2]); return `<div class="hudm real ${selMod === k ? 'sel' : ''}" data-k="${k}" style="left:${p.x * 100}%;top:${p.y * 100}%;opacity:${m.opacity || 1};transform:scale(${m.scale || 1});${m.color ? 'color:' + m.color + ';' : ''}${m.bg === false ? 'background:transparent;' : ''}">${k === 'music' ? '<span class="eq on"><i></i><i></i><i></i></span> ' : ''}${sample}</div>`; }).join(''), sm = selMod && M(selMod).on ? M(selMod) : null;
  return `<div class="edlayer ${(((c.modules || {}).hud || {}).round === false) ? 'sqhud' : ''}" id="edlayer"><div class="edbar" title="Glisse cette barre pour la déplacer"><b>Édition de l’interface</b><span class="mu">Glisse les widgets directement où tu les veux</span><button class="btn sec sm" data-a="edflip" title="Déplacer la barre en haut / en bas">⇅</button><button class="btn sm" data-a="ovt" data-v="modules">Terminé</button></div>${boxes || '<div class="edempty">Aucun module activé. Active-en depuis l’onglet Modules.</div>'}
  <div class="edpanel">${sm ? `<b>${HUDM[selMod][0]}</b><label>Taille <b>${(sm.scale || 1).toFixed(1)}×</b><input type="range" min="0.5" max="3" step="0.1" value="${sm.scale || 1}" data-cm="${selMod}" data-f="scale"></label><label>Opacité <b>${Math.round((sm.opacity || 1) * 100)} %</b><input type="range" min="0.1" max="1" step="0.05" value="${sm.opacity || 1}" data-cm="${selMod}" data-f="opacity"></label><label class="ckb"><input type="checkbox" data-cm="${selMod}" data-f="bg" ${sm.bg !== false ? 'checked' : ''}> Fond</label><input type="color" data-cm="${selMod}" data-f="color" value="${sm.color || '#ffffff'}" style="width:36px;height:26px;padding:0;border:0;background:none"><label class="ckb" title="Touche pour activer / désactiver ce widget en jeu">Touche on/off ${keyCap(selMod, 'toggle', sm.toggle || '', 'Clique puis appuie sur une touche')}</label>${SHOWF[selMod] ? `<div class="row" style="gap:12px;flex-wrap:wrap">${SHOWF[selMod].map(([f, l]) => `<label class="ckb"><input type="checkbox" data-cmshow="${selMod}" data-flag="${f}" ${showHas(sm, f) ? 'checked' : ''}> ${l}</label>`).join('')}</div>` : ''}${selMod === 'keystrokes' ? `<label class="ckb"><input type="checkbox" data-cm="keystrokes" data-f="scan" ${sm.scan ? 'checked' : ''}> Position physique des touches</label>` : ''}` : '<span class="mu">Clique sur un widget pour régler sa taille, son opacité et sa couleur.</span>'}</div></div>`;
}
function hudEditorHtml(c) {
  const M = k => (c.modules && c.modules[k]) || { on: false }, boxes = Object.keys(HUDM).filter(k => M(k).on).map(k => { const m = M(k), p = m.pos || { x: HDEF[k][0], y: HDEF[k][1] }, sample = HUDM[k][2] === 'keys' ? keysPrev(m.layout) : esc(HUDM[k][2]); return `<div class="hudm ${selMod === k ? 'sel' : ''}" data-k="${k}" style="left:${p.x * 100}%;top:${p.y * 100}%;opacity:${m.opacity || 1};transform:scale(${m.scale || 1});${m.color ? 'color:' + m.color + ';' : ''}${m.bg === false ? 'background:transparent;' : ''}">${sample}</div>`; }).join(''), sm = selMod && M(selMod).on ? M(selMod) : null;
  return `<div class="hudw"><div class="row" style="margin-bottom:8px;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn sm" data-a="hudingame">Modifier en jeu (vrais widgets)</button><small>Dans le jeu : Maj droite. L’aperçu ci-dessous n’est qu’une maquette.</small></div><div class="hudprev ${(((c.modules || {}).hud || {}).round === false) ? 'sqhud' : ''}"><span class="hudhint">Glisse les modules où tu veux</span>${boxes}</div><div class="card col hudp">${sm ? `<b>${HUDM[selMod][0]}</b><div class="fld"><label>Taille : <b>${(sm.scale || 1).toFixed(1)}×</b></label><input type="range" min="0.5" max="3" step="0.1" value="${sm.scale || 1}" data-cm="${selMod}" data-f="scale" style="width:100%"></div><div class="fld"><label>Opacité : <b>${Math.round((sm.opacity || 1) * 100)} %</b></label><input type="range" min="0.1" max="1" step="0.05" value="${sm.opacity || 1}" data-cm="${selMod}" data-f="opacity" style="width:100%"></div><div class="row"><label class="ckb"><input type="checkbox" data-cm="${selMod}" data-f="bg" ${sm.bg !== false ? 'checked' : ''}> Fond</label><input type="color" data-cm="${selMod}" data-f="color" value="${sm.color || '#ffffff'}" style="width:40px;height:28px;padding:0;border:0;background:none"></div>` : '<span class="mu">Clique sur un module de l’aperçu pour régler sa taille, son opacité et sa couleur.</span>'}</div></div>`;
}
const MIC = { prev: '<path d="M6 5v14M19 5.5v13a.8.8 0 01-1.25.66L9.4 13.2a.8.8 0 010-1.32l8.35-5.96A.8.8 0 0119 5.5z" fill="currentColor" stroke="none"/><rect x="4.6" y="5" width="2.2" height="14" rx="1" fill="currentColor" stroke="none"/>', next: '<path d="M5 5.5v13a.8.8 0 001.25.66l8.35-5.96a.8.8 0 000-1.32L6.25 4.84A.8.8 0 005 5.5z" fill="currentColor" stroke="none"/><rect x="17.2" y="5" width="2.2" height="14" rx="1" fill="currentColor" stroke="none"/>', play: '<path d="M7 4.6v14.8a.8.8 0 001.2.7l12-7.4a.8.8 0 000-1.4l-12-7.4a.8.8 0 00-1.2.7z" fill="currentColor" stroke="none"/>', pause: '<rect x="6" y="4.5" width="4.2" height="15" rx="1.2" fill="currentColor" stroke="none"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.2" fill="currentColor" stroke="none"/>' };
const mic = (k, s = 14) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true">${MIC[k]}</svg>`;
const ovBar = t => t ? `${t.art ? `<img class="ovart" src="${esc(t.art)}" alt="">` : '<span class="ovart note">♪</span>'}<span class="eq ${t.playing ? 'on' : ''}"><i></i><i></i><i></i></span><span class="ovt"><b title="${esc(t.title)}">${esc(t.title)}</b><small title="${esc(t.artist)}">${esc(t.artist)}</small></span><button class="np-b" data-a="mus" data-v="prev" title="Précédent">${mic('prev', 13)}</button><button class="np-b big" data-a="mus" data-v="playpause" title="${t.playing ? 'Pause' : 'Lecture'}">${mic(t.playing ? 'pause' : 'play', 14)}</button><button class="np-b" data-a="mus" data-v="next" title="Suivant">${mic('next', 13)}</button>` : '<span class="mu" style="font-size:12px">♪ Aucune musique</span>';
/* Menu en jeu : le serveur auquel on se connecte n’est pas compatible avec l’instance lancée (détecté par main/mismatch.js) */
let JADDR = QS.get('addr') || '';
async function joinView() {
  let S = null; try { S = await call('join:state'); } catch (e) {}
  if (!S || S.state === 'idle') return '<h2 style="margin:0 0 8px">Rejoindre un serveur</h2><p class="mu">Rien en cours.</p>';
  const p = S.plan, what = p ? `Minecraft ${esc(p.version)}${p.loader !== 'vanilla' ? ' · ' + esc(ldn(p.loader)) : ''}` : '';
  const logl = (S.log || []).slice(-6).map(l => `<div class="mu" style="font-size:12px">• ${esc(l)}</div>`).join('');
  const head = `<h2 style="margin:0 0 4px">${esc(S.addr)}</h2><p class="mu" style="margin-top:0">${what}${p && p.mods && p.mods.length ? ' · ' + p.mods.length + ' mod(s)' : ''}</p>`;
  if (S.state === 'ask') { const A = S.ask || {}; return `${head}<div class="card col" style="gap:8px"><b>Aucune instance connue pour ce serveur</b><span class="mu" style="font-size:12.5px">${esc(S.text)} Est-ce un serveur <b>Vanilla</b> ?</span>
    <div class="fld" style="margin:4px 0 0"><label>Version de Minecraft du serveur</label><select id="jver">${(A.versions || []).map(v => `<option value="${esc(v)}" ${v === A.version ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
    <small class="mu">Si oui, une instance <b>Fabric</b> avec le mod Hydarium${(cfg.srvMods || []).length ? ' et tes mods par défaut (' + (cfg.srvMods || []).map(x => esc(nice(x))).join(', ') + ')' : ''} est créée puis lancée sur le serveur. Sinon, rien n’est créé.</small></div>
    <div class="row end" style="margin-top:14px"><button class="btn sec" data-a="jcancel">Annuler</button><button class="btn sec" data-a="jno">Non, il est moddé</button><button class="btn" data-a="jyes">Oui, Vanilla : créer et rejoindre</button></div>`; }
  if (S.state === 'info') return `${head}<div class="card col" style="gap:8px"><b>Rien n’a été créé</b><span class="mu" style="font-size:12.5px">${esc(S.text)}</span></div><div class="row end" style="margin-top:12px"><button class="btn" data-a="jcancel">Fermer</button></div>`;
  const busy = S.state === 'working' || S.state === 'launching';
  return `${head}<div class="card col" style="gap:8px"><div class="row" style="gap:10px">${busy ? '<div class="spin" style="width:18px;height:18px"></div>' : S.state === 'done' ? '<span class="bd ok">✔</span>' : '<span class="bd er">✖</span>'}<b>${esc(S.text || '')}</b></div>${logl}</div>
    <div class="row end" style="margin-top:12px">${S.state === 'launching' || S.state === 'working' ? '<button class="btn sec" data-a="jcancel">Annuler</button>' : '<button class="btn" data-a="jcancel">Fermer</button>'}</div>`;
}
async function ovlView() {
  const i = byId(OVI); if (i) cur = OVI; const c = (i && i.client) || { on: false, modules: {} };
  const T = [['modules', 'Modules', 'puz'], ['profiles', 'Profils', 'user'], ['skins', 'Skin et cape', 'skin'], ['content', 'Télécharger', 'dl'], ['shots', 'Captures', 'cam'], ['music', 'Musique', 'music'], ['settings', 'Paramètres', 'gear']];
  let b = '', sub = '';
  if (ovT === 'modules' || ovT === 'hub') { ovT = 'modules'; const cml = cmFor(i), n = cml.filter(x => mOn(c, x[0])).length; sub = `<div class="row between" style="margin-bottom:12px"><div><h2 style="margin:0">Modules</h2><small class="mu" id="mcount">${n} activés sur ${cml.length}</small></div><select data-ovf="1"><option value="all" ${OVF === 'all' ? 'selected' : ''}>Tous</option><option value="on" ${OVF === 'on' ? 'selected' : ''}>Activés</option><option value="off" ${OVF === 'off' ? 'selected' : ''}>Désactivés</option><option value="ovl" ${OVF === 'ovl' ? 'selected' : ''}>Actifs maintenant</option><option value="agent" ${OVF === 'agent' ? 'selected' : ''}>Avec agent</option></select></div>`; b = i ? `<div class="mgrid" id="mgrid">${modGrid(c)}</div>` : '<p class="mu">Ouvre ce menu depuis une partie lancée pour régler ses modules.</p>'; }
  else if (ovT === 'edit') b = '';
  else if (ovT === 'profiles') b = `<h2 style="margin:0 0 4px">Profils</h2><p class="mu" style="margin-top:0">Applique d’un clic un ensemble de modules.</p><div class="mgrid">${[...CPRO, ...(cfg.cProfiles || []).map(p => [p.name, Object.keys(p.modules).filter(k => p.modules[k].on), true])].map(([n, list, mine], k) => `<div class="mcard"><b>${esc(n)}</b><small>${list.length} modules${mine ? ' · à toi' : ''}</small><button class="btn sm" data-a="cpro" data-n="${k}" ${i ? '' : 'disabled'}>Appliquer</button>${mine ? `<button class="btn dg sm" data-a="cprodel" data-n="${k - CPRO.length}" title="Supprimer ce profil">${ic('trash', 13)}</button>` : ''}</div>`).join('')}</div><div class="row" style="margin-top:14px"><input id="cpn" placeholder="Nom du profil" maxlength="24" style="flex:1;width:auto"><button class="btn g" data-a="cprosave" ${i ? '' : 'disabled'}>Enregistrer la configuration actuelle</button></div>`;
  else if (ovT === 'skins') b = await skinPick();
  else if (ovT === 'join') b = await joinView();
  else if (ovT === 'content') b = await catView();
  else if (ovT === 'shots') { shI = OVI; b = await shotsView(); }
  else if (ovT === 'music') b = await musicPanel();
  else b = `<h2 style="margin:0 0 10px">Paramètres</h2><div class="card" style="display:block"><div class="sw"><div style="flex:1"><b>HUD en jeu</b><small>Affiche les modules actifs par-dessus Minecraft.</small></div><button class="swt ${c.on ? 'on' : ''}" data-a="cmod" data-k="_on" ${i ? '' : 'disabled'}></button></div><div class="sw"><div style="flex:1"><b>Raccourci du menu</b></div>${accelBtn()}</div><div class="sw"><div style="flex:1"><b>Masquer / afficher tout le HUD</b><small>Une touche qui cache ou montre tous les widgets en jeu.</small></div>${keyCap('hud', 'key', ((c.modules && c.modules.hud) || {}).key || '', 'Clique puis appuie sur une touche')}</div><div class="sw"><div style="flex:1"><b>Style des cases</b><small>Arrondi léger, ou carré comme dans l’ancien affichage 1.8.9. S’applique à toutes les versions.</small></div><select data-hround="1">${[['1', 'Arrondi'], ['0', 'Carré (1.8.9)']].map(([k, l]) => `<option value="${k}" ${(((c.modules && c.modules.hud) || {}).round !== false ? '1' : '0') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div><div class="sw"><div style="flex:1"><b>Zoom : caméra cinématique</b><small>Pendant le zoom, la caméra devient fluide (comme le mode cinématique de Minecraft) et revient normale quand le zoom s’arrête. Molette en jeu : elle règle le zoom au lieu de changer de case.</small></div><select data-zcine="1">${[['1', 'Activée'], ['0', 'Désactivée']].map(([k, l]) => `<option value="${k}" ${(((c.modules && c.modules.zoom) || {}).cinematic !== false ? '1' : '0') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div><div class="sw"><div style="flex:1"><b>Zoom de départ</b><small>Force du zoom quand tu l’actives (la molette l’ajuste ensuite en jeu).</small></div><select data-zlvl="1">${[2, 3, 4, 6, 8, 12, 20].map(k => `<option value="${k}" ${Math.abs(((((c.modules && c.modules.zoom) || {}).level) || 4) - k) < 0.5 ? 'selected' : ''}>×${k}</option>`).join('')}</select></div><div class="sw"><div style="flex:1"><b>Source de musique</b></div><select data-set="music">${[['auto', 'Automatique'], ['spotify', 'Spotify'], ['youtube', 'YouTube Music'], ['off', 'Désactivée']].map(([k, l]) => `<option value="${k}" ${(cfg.music || 'auto') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>`;
  NP = NP || await call('media:get').catch(() => null);
  if (ovT === 'edit' && i) return edLayer(c);
  const act = ovT === 'edit' ? 'modules' : ovT;
  return `<div class="ovwrap" data-bd="1"><div class="ovp"><div class="ovh"><div class="ovtt"><svg class="ovlogo" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="var(--ac)" stroke-width="2" stroke-linejoin="round">${P.cube}</svg><b>Hydarium Client</b></div><div class="ovnp" id="ovnp">${ovBar(NP)}</div><div class="ovsearch">${ic('search', 15)}<input id="ovq" data-ovq="1" value="${esc(OVQ)}" placeholder="Rechercher un module..." autocomplete="off"></div><button class="ib" data-a="ovclose" title="Fermer (Échap)">${ic('x', 14)}</button></div>
  <div class="ovbody"><div class="ovside">${T.map(([k, l, icn]) => `<a class="ovn ${act === k ? 'a' : ''}" data-a="ovt" data-v="${k}"><svg class="i" viewBox="0 0 24 24" width="17" height="17">${P[icn]}</svg>${l}</a>`).join('')}<div style="flex:1"></div><button class="btn g ovedit" data-a="ovt" data-v="edit" ${i ? '' : 'disabled'}>${ic('pencil', 14)} Éditer l’interface</button></div><div class="ovmain">${sub}${b}</div></div></div></div>`;
}
async function musicPanel() {
  NP = await call('media:get').catch(() => null);
  return `<div class="card col" style="text-align:center;padding:28px"><div style="font-size:42px">♪</div>${NP ? `<h2 style="margin:6px 0 2px">${esc(NP.title)}</h2><div class="mu">${esc(NP.artist)} · ${esc(NP.app)}</div>` : '<h3>Aucune musique détectée</h3><p class="mu">Lance Spotify ou YouTube Music (navigateur). Hydarium lit la session multimédia de ton système.</p>'}<div class="row" style="justify-content:center;margin-top:14px"><button class="btn sec" data-a="mus" data-v="prev">⏮</button><button class="btn" data-a="mus" data-v="playpause">${NP && NP.playing ? '⏸' : '▶'}</button><button class="btn sec" data-a="mus" data-v="next">⏭</button></div></div>`;
}
let npT;
function npPoll() { /* la musique s’affiche seulement en jeu (menu et HUD) */ }
/* ===== rejoindre un serveur : instance compatible, sinon création ===== */
async function smartJoin(addr, name) {
  openModal('<h3>Recherche d’une instance compatible…</h3><div class="spin" style="margin:16px auto"></div>');
  let p; try { p = await call('srv:plan', addr); } catch (e) { closeModal(); throw e; }
  SRVQ = p;
  if (p.preferred && p.use) { closeModal(); await play(p.use.id, { server: p.server.addr }); return; } // instance choisie pour ce serveur : lancement direct
  if (!p.use && !p.configured) { // aucune instance connue : Hydarium ne crée rien tout seul, il demande
    const vs = [...new Set([...(p.range || []), ...(p.version ? [p.version] : []), ...(p.releases || [])])].slice(0, 40), modded = p.loader !== 'vanilla' || (p.modCount || 0) > 0;
    openModal(`<h3>Rejoindre ${esc(p.server.name)}</h3><p class="mu">${modded ? 'Ce serveur semble moddé, et je ne peux pas deviner ses mods.' : 'Je ne peux pas connaître la version exacte de ce serveur.'}</p>
    <div class="alert">Aucune instance connue pour ce serveur, et Hydarium n’en crée jamais sans te demander. Est-ce un serveur <b>Vanilla</b> ?</div>
    <div class="fld"><label>Version de Minecraft du serveur</label><select id="sj-v">${vs.map(v => `<option value="${esc(v)}" ${v === (p.version || vs[0]) ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
    <small>Si oui, une instance <b>Fabric</b> avec le mod Hydarium${(cfg.srvMods || []).length ? ' et tes mods par défaut (' + (cfg.srvMods || []).map(x => esc(nice(x))).join(', ') + ')' : ''} est créée puis lancée sur le serveur (mods par défaut modifiables dans Paramètres). Si le serveur est moddé, crée ou importe l’instance toi-même, ou renseigne-le dans « Configurer ».</small>
    <div class="row end" style="margin-top:14px"><button class="btn sec" data-a="mclose">Annuler</button><button class="btn sec" data-a="sjno">Non, il est moddé</button><button class="btn" data-a="sjvan">${ic('play', 13)} Oui, Vanilla : créer et rejoindre</button></div>`);
    return;
  }
  openModal(`<h3>Rejoindre ${esc(p.server.name)}</h3><p>Serveur en <b>Minecraft ${esc(p.version)}</b>${p.loader !== 'vanilla' ? ' avec <b>' + esc(ldn(p.loader)) + '</b>' : ''}.</p>
  ${p.use ? `<div class="alert">Instance compatible trouvée : <b>${esc(p.use.name)}</b>. Elle sera lancée directement connectée au serveur.</div>` : `<div class="alert">Aucune instance compatible. Une nouvelle instance <b>${esc(p.server.name)}</b> (${esc(ldn(p.loader))} ${esc(p.version)}${p.mods.length ? ' + ' + p.mods.length + ' mod(s)' : ''}) sera créée puis lancée.</div>`}
  ${p.hint.length ? `<small>Mods annoncés par le serveur : ${p.hint.map(esc).join(', ')}. Ajoute-les dans « Configurer » (noms Modrinth) pour qu’ils soient installés automatiquement.</small>` : ''}
  <div class="row end" style="margin-top:14px"><button class="btn sec" data-a="mclose">Annuler</button><button class="btn" data-a="sjgo">${ic('play', 13)} Rejoindre</button></div>`);
}
async function sjRun() {
  const p = SRVQ; let id = p.use && p.use.id;
  if (!id) {
    const rows = ['Création de l’instance', ...p.mods];
    openModal(`<h3>Préparation…</h3>${rows.map((r, n) => `<div class="ml" id="sj${n}"><div style="flex:1">${esc(r)}</div><span class="mu">…</span></div>`).join('')}`);
    let lv = ''; if (p.loader === 'forge' || p.loader === 'neoforge') lv = ((await call('forge:versions', p.loader, p.version))[0] || {}).v;
    const i = await call('inst:create', { name: p.server.name.slice(0, 40), version: p.version, loader: p.loader, loaderVer: lv }); id = i.id;
    const mark = (n, h) => { const e = document.getElementById('sj' + n); if (e) e.lastChild.outerHTML = h; }; mark(0, '<span class="bd ok">✔</span>');
    for (let n = 0; n < p.mods.length; n++) { try { await call('mods:add', id, p.mods[n]); mark(n + 1, '<span class="bd ok">✔</span>'); } catch (e) { mark(n + 1, `<span class="bd er">✖ ${esc(e.message.slice(0, 50))}</span>`); } }
    inst = await call('inst:list');
  }
  closeModal(); await play(id, { server: p.server.addr });
}
function srvCfg(id) {
  const s = saved.find(x => x.id === id), r = s.req || {};
  openModal(`<h3>Configurer « ${esc(s.name)} »</h3>
  <div class="sh" style="margin-top:4px"><h3>Le serveur</h3></div>
  <div class="two2"><div class="fld"><label>Nom</label><input id="sq-n" value="${esc(s.name)}" maxlength="40" style="width:100%"></div><div class="fld"><label>Adresse (IP ou nom de domaine)</label><input id="sq-a" value="${esc(s.addr)}" maxlength="106" placeholder="play.exemple.fr ou 192.168.1.10:25565" style="width:100%" spellcheck="false"></div></div>
  <div class="fld"><label>Catégorie (pour le classer)</label><input id="sq-c" value="${esc(s.cat || '')}" maxlength="24" placeholder="Ex. : Amis, PvP, Survie…" style="width:100%"></div>
  <div class="fld"><label>Instance lancée par défaut</label><select id="sq-i"><option value="">Automatique (instance compatible)</option>${inst.map(x => `<option value="${esc(x.id)}" ${x.id === s.inst ? 'selected' : ''}>${esc(x.name)} (${esc(x.version)}${x.loader !== 'vanilla' ? ', ' + esc(ldn(x.loader)) : ''})</option>`).join('')}</select></div>
  <div class="sh"><h3>Pour bien le rejoindre</h3></div><small style="display:block;margin-bottom:8px">Aide Hydarium à choisir ou créer la bonne instance. Laisse « Auto » pour que ce soit détecté.</small>
  <div class="two2"><div class="fld"><label>Loader</label><select id="sq-l"><option value="">Auto</option>${['vanilla', 'fabric', 'quilt', 'forge', 'neoforge'].map(l => `<option value="${l}" ${r.loader === l ? 'selected' : ''}>${ldn(l)}</option>`).join('')}</select></div><div class="fld"><label>Version de Minecraft</label><input id="sq-v" value="${esc(r.version || '')}" placeholder="Auto (ex. 1.21.4)" style="width:100%"></div></div>
  <div class="fld"><label>Mods requis <span class="mu">(noms Modrinth, séparés par des virgules)</span></label><input id="sq-m" value="${esc((r.mods || []).join(', '))}" placeholder="sodium, lithium, fabric-api" style="width:100%"></div>
  <p class="mu" id="sq-err" style="color:var(--er,#ff6b6b);min-height:16px;margin:2px 0"></p>
  <div class="row end"><button class="btn sec" data-a="mclose">Annuler</button><button class="btn" data-a="sqok" data-id="${esc(id)}">Enregistrer</button></div>`);
}
let MT = null;
function mtagModal() {
  const n = MT.ids.length, srv = MT.kind === 'srv', existing = srv ? [...new Set(saved.map(x => x.cat).filter(Boolean))] : [...new Set(inst.flatMap(tagsOf))], sugg = [...new Set([...existing, ...(srv ? ['Amis', 'PvP', 'Survie', 'Mini-jeux'] : ['Vanilla', 'Moddé', 'Survie', 'Amis', 'PvP', 'Tests'])])].filter(t => !MT.tags.includes(t)).slice(0, 14);
  openModal(`<h3>${srv ? 'Catégorie' : 'Ajouter des tags'} pour ${n} ${srv ? 'serveur' : 'instance'}${n > 1 ? 's' : ''}</h3><p class="mu" style="margin-top:0">${srv ? 'Un serveur a une seule catégorie : elle remplace l’ancienne.' : 'Les tags choisis sont ajoutés à ceux que chaque instance a déjà.'}</p>
  <div class="chips">${MT.tags.map(t => `<span class="chip a" data-a="mtgRm" data-v="${esc(t)}">${esc(t)} ✕</span>`).join('') || '<span class="mu">Aucun tag choisi</span>'}</div>
  <div class="row" style="margin:10px 0"><input id="mtgv" placeholder="Nouveau tag…" maxlength="24" style="flex:1;width:auto"><button class="btn g" data-a="mtgAdd">Ajouter</button></div>
  <div class="chips">${sugg.map(t => `<span class="chip" data-a="mtgPick" data-v="${esc(t)}">+ ${esc(t)}</span>`).join('')}</div>
  <div class="row end" style="margin-top:14px"><button class="btn sec" data-a="mclose">Annuler</button><button class="btn" data-a="mtagok">Appliquer</button></div>`);
  setTimeout(() => $('#mtgv') && $('#mtgv').focus(), 30);
}
function tagModal() {
  const all = [...new Set([...inst.flatMap(tagsOf), 'Vanilla', 'Moddé', 'Survie', 'Amis', 'PvP', 'Tests'])].filter(t => !TG.tags.includes(t));
  openModal(`<h3>Tags de l’instance</h3><p>Classe tes instances comme tu veux. « Vanilla » et « Moddé » sont mis par défaut, mais tu peux les changer.</p><div class="chips">${TG.tags.map(t => `<span class="chip a" data-a="tgRm" data-v="${esc(t)}">${esc(t)} ✕</span>`).join('') || '<span class="mu">Aucun tag</span>'}</div><div class="row" style="margin:10px 0"><input id="tgv" placeholder="Nouveau tag…" maxlength="20" style="flex:1;width:auto"><button class="btn g" data-a="tgAdd">Ajouter</button></div><div class="chips">${all.slice(0, 12).map(t => `<span class="chip" data-a="tgPick" data-v="${esc(t)}">+ ${esc(t)}</span>`).join('')}</div><div class="row end" style="margin-top:14px"><button class="btn sec" data-a="mclose">Annuler</button><button class="btn" data-a="catok">Enregistrer</button></div>`);
  setTimeout(() => $('#tgv') && $('#tgv').focus(), 30);
}
/* ===== importer : modpack, dossier d’un autre launcher, code ===== */
function impMenu() {
  openModal(`<h3>Importer une instance</h3><div class="imp">
  <div class="card hv" data-a="impfile"><div class="ic"><div class="mt" style="background:#3a7bd5">${ic('down', 20)}</div><div><b>Un fichier zip (ou .mrpack)</b><small>Instance exportée de CurseForge, Modrinth (.mrpack) ou Prism / MultiMC (.zip) : Hydarium reconnaît le format tout seul</small></div></div></div>
  <div class="card hv" data-a="impcat"><div class="ic"><div class="mt" style="background:#e0883a">${ic('search', 20)}</div><div><b>Chercher un modpack</b><small>Parcourir Modrinth et CurseForge et l’installer en un clic (comme une nouvelle instance)</small></div></div></div>
  <div class="card hv" data-a="impman"><div class="ic"><div class="mt" style="background:#4f9d6a">${ic('folder', 20)}</div><div><b>Un dossier d’un autre launcher</b><small>Prism, MultiMC, CurseForge, ATLauncher, Minecraft officiel…</small></div></div></div>
  <div class="card col"><div class="ic"><div class="mt" style="background:#b388ff">${ic('link', 20)}</div><div><b>Un code de partage Hydarium</b></div></div><div class="row" style="margin-top:8px"><input id="cd" placeholder="HYD1…" style="flex:1;width:auto"><button class="btn g" data-a="impcode">Importer</button></div></div></div><div class="row end" style="margin-top:12px"><button class="btn sec" data-a="mclose">Fermer</button></div>`);
}
async function impFile() {
  openModal('<h3>Import du modpack</h3><p id="imptx" class="mu">Choisis un fichier…</p><div class="bar" style="width:100%"><i id="impb" style="width:0"></i></div>');
  let r; try { r = await call('modpack:import'); } catch (e) { closeModal(); if (/clé CurseForge/i.test(e.message)) { cfKeyModal('Ce modpack vient de CurseForge : ajoute ta clé gratuite, puis relance l’import.'); return; } throw e; }
  if (!r) return closeModal(); inst = await call('inst:list');
  openModal(`<h3>Modpack importé ✓</h3><p>« ${esc(r.name)} » (${esc({ mrpack: 'Modrinth', curseforge: 'CurseForge', prism: 'Prism / MultiMC' }[r.kind])}) est prêt.</p>${r.bad.length ? `<div class="note" style="border-color:var(--wa)">${r.bad.length} fichier(s) n’ont pas pu être téléchargés : ${r.bad.slice(0, 5).map(esc).join(', ')}.</div>` : ''}<div class="row end"><button class="btn sec" data-a="mclose">Fermer</button><button class="btn" data-a="open" data-id="${esc(r.id)}" data-close="1">Ouvrir l’instance</button></div>`); render();
}
/* ===== plantage : journal, analyse, mods suspects ===== */
function crashModal(c) {
  const a = c.analysis || { mods: [], missing: [], title: '', hint: '' }, i = byId(c.id);
  openModal(`<div class="row between"><h3 style="margin:0">${c.launch ? 'Minecraft n’a pas pu démarrer' : 'Minecraft s’est arrêté de façon inattendue'}</h3><button class="ib" data-a="mclose">${ic('x', 14)}</button></div><small>${esc(c.name)}</small>
  <div class="alert" style="margin-top:10px"><b>${esc(a.title || 'Cause inconnue')}</b><br>${esc(a.hint || c.cause)}</div>
  ${(a.actions || []).length ? `<div class="row" style="margin-top:10px;flex-wrap:wrap;gap:8px">${a.actions.map(x => `<button class="btn ${x.primary ? '' : 'g'}" data-a="cact" data-id="${esc(x.id)}" data-v="${esc(x.v || '')}">${esc(x.label)}</button>`).join('')}</div>` : ''}
  ${a.mods.length ? `<div class="sh"><h3>Mods suspects</h3></div>${a.mods.map(m => `<div class="ml"><div style="flex:1"><b>${esc(m.title)}</b><br><small>${esc(m.why)}</small></div><button class="btn g sm" data-a="cdis" data-pid="${esc(m.pid)}">Désactiver</button><button class="btn dg sm" data-a="crm2" data-pid="${esc(m.pid)}">Désinstaller</button></div>`).join('')}` : ''}
  ${(a.install || []).length ? `<div class="sh"><h3>Il manque ${a.install.length > 1 ? 'ces mods' : 'ce mod'}</h3></div>${a.install.map(m => `<div class="ml"><div style="flex:1"><b>${esc(m.name)}</b><br><small>Un de tes mods en a besoin pour démarrer.</small></div><button class="btn sm" data-a="crinst" data-slug="${esc(m.slug)}">${ic('down', 13)} Télécharger ${esc(m.name)}</button></div>`).join('')}` : ''}
  ${a.missing.length && !(a.install || []).length ? `<small>Mods manquants signalés : ${a.missing.map(esc).join(', ')}. <a data-a="ccat" style="color:var(--ac);cursor:pointer">Chercher dans le catalogue</a></small>` : ''}
  <div class="sh"><h3>Journal (fin)</h3></div><pre class="con" id="clog" style="height:190px">${esc((c.tail || []).join('\n'))}</pre>
  <div class="row" style="margin-top:12px;flex-wrap:wrap">${c.launch ? '' : `<button class="btn" data-a="csafe" ${playing ? 'disabled' : ''}>Relancer en mode sans échec</button><button class="btn g" data-a="calloff">Désactiver tous les mods</button>`}<button class="btn g" data-a="ccopy">Copier le journal</button><button class="btn g" data-a="logs">Ouvrir le dossier des journaux</button><button class="btn sec" data-a="mclose">Fermer</button></div>${c.launch ? '' : '<small style="margin-top:8px">Mode sans échec : sans arguments JVM personnalisés, sans client Hydarium, sans résolution forcée.</small>'}`, true);
  const l = $('#clog'); if (l) l.scrollTop = l.scrollHeight; LASTC = c;
}
/* ===== visite guidée ===== */
const TOUR = [['#nav [data-v=home]', 'Accueil', 'Reprends ta dernière partie en un clic, retrouve tes instances récentes et tes serveurs.'], ['#nav [data-v=inst]', 'Instances', 'Crée, importe et classe tes instances avec des tags (Vanilla, Moddé… ou les tiens). Clique sur une instance pour régler mods, mondes, packs, shaders, captures et options.'], ['#nav [data-v=catalog]', 'Catalogue', 'Parcours Modrinth et CurseForge et installe en un clic dans l’instance de ton choix.'], ['#nav [data-v=srv]', 'Serveurs', 'Ajoute des serveurs. « Rejoindre » choisit ou crée automatiquement l’instance compatible.'], ['#nav [data-v=host]', 'Mon serveur', 'Héberge ton propre serveur (Vanilla, Paper, Fabric) et invite tes amis. Un point vert s’affiche quand il tourne.'], ['#nav [data-v=shots]', 'Captures', 'Toutes les captures de toutes tes instances au même endroit.'], ['#nav [data-v=set]', 'Paramètres', 'Notifications, Java, réglages des nouvelles instances, musique, nettoyage des données…'], ['#me', 'Ton profil', 'Skin, cape, bibliothèque de skins et totem personnalisé. En jeu, Alt+H ouvre le menu Hydarium.']];
let tourN = 0;
function tourStart() { tourN = 0; tourShow(); }
function tourShow() {
  let t = document.getElementById('tour'); if (!t) { t = document.createElement('div'); t.id = 'tour'; document.body.appendChild(t); }
  const st = TOUR[tourN]; if (!st) return tourEnd(); const el = document.querySelector(st[0]); if (!el) { tourN++; return tourShow(); }
  const r = el.getBoundingClientRect(), W = innerWidth, H = innerHeight, left = Math.min(r.right + 16, W - 340), top = Math.max(50, Math.min(r.top - 10, H - 210));
  t.innerHTML = `<div class="thole" style="left:${r.left - 6}px;top:${r.top - 6}px;width:${r.width + 12}px;height:${r.height + 12}px"></div><div class="tbox" style="left:${left}px;top:${top}px"><small>${tourN + 1} / ${TOUR.length}</small><h3>${st[1]}</h3><p>${st[2]}</p><div class="row end"><button class="btn sec sm" data-a="tskip">Passer</button><button class="btn sm" data-a="tnext">${tourN === TOUR.length - 1 ? 'Terminer' : 'Suivant'}</button></div></div>`;
}
function tourEnd() { const t = document.getElementById('tour'); if (t) t.remove(); cfg.tour = true; call('set:set', { tour: true }).catch(() => {}); }
function favModal() {
  openModal(`<h3>Mes mods favoris</h3><p>Ils sont proposés à la création d’une instance. Ajoute tes propres tags (séparés par des virgules) pour les retrouver : « perf », « pvp », « qualité de vie »…</p>${(cfg.favMods || []).map(f => `<div class="ml">${tile(f.icon, f.title)}<div style="flex:1"><b>${esc(f.title)}</b><br><input data-fvtag="${esc(f.slug)}" value="${esc((f.tags || []).join(', '))}" placeholder="tags…" style="width:100%;margin-top:4px"></div><button class="ib" data-a="favrm" data-slug="${esc(f.slug)}">${ic('trash', 13)}</button></div>`).join('') || '<p class="mu">Aucun favori pour l’instant.</p>'}<div class="row end" style="margin-top:12px"><button class="btn" data-a="favback">Retour</button></div>`, true);
}
const sz = n => n ? mo(n) : 'vide';
const dataRows = z => [['logs', 'Journaux', 'Journaux du launcher et des lancements', z.logs], ['versions', 'Anciennes versions de Minecraft', 'Versions du dossier partagé qu’aucune instance n’utilise', z.versions], ['installers', 'Installeurs Forge / NeoForge', 'Fichiers d’installation téléchargés', z.installers], ['runtimes', 'Java téléchargés par Hydarium', 'Retéléchargés automatiquement au besoin', z.runtimes], ['libs', 'Bibliothèques et ressources partagées', 'Retéléchargées au prochain lancement', z.libs], ['skins', 'Bibliothèque de skins', 'Tes skins enregistrés localement', z.skins]].map(([k, l, d, v]) => `<div class="card"><div><b>${l}</b><small>${d} · ${sz(v)}</small></div><button class="btn g" data-a="dclear" data-k="${k}" ${v ? '' : 'disabled'}>Nettoyer</button></div>`).join('') + `<p class="mu">Instances : ${sz(z.instances)} · Serveurs : ${sz(z.servers)} · Total : ${sz(z.total)}</p>`;
const DKEYS = [['forward', 'Avancer', 'w'], ['left', 'Gauche', 'a'], ['back', 'Reculer', 's'], ['right', 'Droite', 'd'], ['jump', 'Sauter', 'space'], ['sneak', 'S’accroupir', 'left.shift'], ['sprint', 'Sprinter', 'left.control'], ['inventory', 'Inventaire', 'e'], ['drop', 'Lâcher', 'q'], ['swapOffhand', 'Échanger les mains', 'f'], ['chat', 'Chat', 't'], ['command', 'Commande', 'slash'], ['playerlist', 'Liste des joueurs', 'tab'], ['screenshot', 'Capture d’écran', 'f2'], ['togglePerspective', 'Changer de vue', 'f5'], ['fullscreen', 'Plein écran', 'f11']];
let KLM = null;
const keyChar = n => { const c = /^\d$/.test(n) ? 'Digit' + n : 'Key' + n.toUpperCase(); return (KLM && KLM.get(c) ? KLM.get(c) : n).toUpperCase(); };
const mcKey = c => { if (/^Key[A-Z]$/.test(c)) return 'key.keyboard.' + c[3].toLowerCase(); if (/^Digit\d$/.test(c)) return 'key.keyboard.' + c[5]; if (/^F\d{1,2}$/.test(c)) return 'key.keyboard.' + c.toLowerCase(); const m = { Space: 'space', ShiftLeft: 'left.shift', ShiftRight: 'right.shift', ControlLeft: 'left.control', ControlRight: 'right.control', AltLeft: 'left.alt', AltRight: 'right.alt', Tab: 'tab', Enter: 'enter', Backquote: 'grave.accent', Slash: 'slash', Period: 'period', Comma: 'comma', Semicolon: 'semicolon', ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', CapsLock: 'caps.lock', Backslash: 'backslash', BracketLeft: 'left.bracket', BracketRight: 'right.bracket', Minus: 'minus', Equal: 'equal', Quote: 'apostrophe' }; return m[c] ? 'key.keyboard.' + m[c] : ''; };
const keyLabel = v => { const m = String(v).match(/^key\.keyboard\.([a-z0-9])$/); return m ? keyChar(m[1]) : String(v).replace(/^key\.keyboard\./, '').replace(/\./g, ' ').toUpperCase(); };
function defOptsHtml() {
  const D = DEFO || {}, deg = D.fov === undefined ? 70 : Math.round(70 + D.fov * 40), g = Math.round((D.gamma === undefined ? 0.5 : D.gamma) * 100), ms = Math.round((D.mouseSensitivity === undefined ? 0.5 : D.mouseSensitivity) * 200); // l’échelle du jeu va de 0 à 200 % (la valeur enregistrée, 0–1, est doublée à l’affichage)
  const rg = (k, l, mn, mx, v, u) => `<div class="fld"><label>${l} : <b id="v-do-${k}">${v}${u}</b></label><input type="range" min="${mn}" max="${mx}" value="${v}" data-do="${k}" data-live="v-do-${k}" data-unit="${u}" style="width:100%"></div>`;
  return `<div class="sh"><h3>Options du jeu par défaut</h3></div><div class="card col"><small>Appliquées au premier lancement de chaque nouvelle instance (ou avec « Appliquer mes réglages par défaut » dans une instance).</small><div class="two2" style="margin-top:8px">${rg('fov', 'Champ de vision (FOV)', 30, 110, deg, '°')}${rg('renderDistance', 'Distance d’affichage', 2, 32, D.renderDistance || 12, ' chunks')}${rg('maxFps', 'FPS maximum (260 = illimité)', 10, 260, D.maxFps || 120, '')}${rg('gamma', 'Luminosité', 0, 100, g, ' %')}${rg('mouseSensitivity', 'Sensibilité de la souris', 0, 200, ms, ' %')}${rg('guiScale', 'Taille de l’interface (0 = auto)', 0, 4, D.guiScale || 0, '')}</div>
  <div class="row" style="gap:18px;margin-top:6px"><label class="ckb"><input type="checkbox" data-do="enableVsync" ${D.enableVsync ? 'checked' : ''}> Synchronisation verticale</label><label class="ckb"><input type="checkbox" data-do="pauseOnLostFocus" ${D.pauseOnLostFocus !== false ? 'checked' : ''}> Pause si la fenêtre perd le focus</label><label class="ckb"><input type="checkbox" data-do="muteMusic" ${D.muteMusic ? 'checked' : ''}> Musique de Minecraft coupée (muette)</label></div></div>
  <div class="sh"><h3>Touches par défaut</h3></div><div class="card col"><small>Clique sur une touche puis appuie sur la nouvelle (Échap pour annuler). Les touches sont les touches physiques du clavier, comme dans Minecraft.</small><div class="keys">${DKEYS.map(([k, l, def]) => { const cur2 = (D.keys || {})[k], on = KEYCAP === k; return `<div class="kr"><span>${l}</span><button class="kb ${on ? 'cap' : ''}" data-a="keycap" data-k="${k}">${on ? 'Appuie sur une touche…' : esc(keyLabel(cur2 || 'key.keyboard.' + def))}</button>${cur2 ? `<a class="mu" style="cursor:pointer" data-a="keyclr" data-k="${k}" title="Remettre par défaut">↺</a>` : ''}</div>`; }).join('')}</div><div class="row" style="margin-top:8px"><button class="btn g sm" data-a="dopt">Tout remettre par défaut</button></div></div>`;
}
function srvModsCard() {
  const l = cfg.srvMods || [], all = [...new Set([...REC.map(q => q[0]), ...(cfg.favMods || []).map(f => f.slug)])].filter(x => !l.includes(x));
  return `<div class="sh"><h3>Mods par défaut des instances de serveur</h3></div><div class="card col"><small>Quand Hydarium crée une instance pour un serveur (après ta confirmation), ces mods sont installés en plus du mod Hydarium, toujours présent. Ils ne s’installent que sur Fabric. Entre leur nom Modrinth, par exemple « sodium ».</small>
  <div class="chips">${l.map(x => `<span class="chip a" data-a="srvmodrm" data-v="${esc(x)}" title="Retirer de la liste">${esc(nice(x))} ✕</span>`).join('') || '<span class="mu">Aucun pour l’instant.</span>'}</div>
  <div class="row" style="margin-top:8px"><input id="srvmodin" list="srvmodl" placeholder="sodium, lithium…" style="flex:1;width:auto" maxlength="64" spellcheck="false"><datalist id="srvmodl">${all.map(x => `<option value="${esc(x)}">`).join('')}</datalist><button class="btn g" data-a="srvmodadd">Ajouter</button></div></div>`;
}
const nf = n => Math.round(n).toLocaleString('fr-FR');
function statsHtml(z) {
  const card = (e, l, v, sub) => `<div class="card stc"><span class="se">${e}</span><div><span class="mu">${l}</span><b>${v}</b>${sub ? `<small>${sub}</small>` : ''}</div></div>`, mx = Math.max(1, ...z.days.map(d => d.secs)), tot = z.totalSecs;
  const fun = [z.deaths ? `Tu es mort <b>${nf(z.deaths)}</b> fois${z.deaths > 100 ? '… courage !' : '.'}` : '', z.distanceKm ? `Tu as parcouru <b>${z.distanceKm.toLocaleString('fr-FR')} km</b> en jeu${z.distanceKm > 40 ? ', soit plus d’un marathon' : ''}.` : '', z.blocksMined ? `<b>${nf(z.blocksMined)}</b> blocs minés.` : ''].filter(Boolean);
  return `${fun.length ? `<div class="note">${fun.join(' · ')}</div>` : ''}
  <div class="sh" style="margin-top:0"><h3>Temps de jeu</h3></div><div class="stat">${card('⏱', 'Total', hrs(tot))}${card('🎮', 'Lancements', nf(z.launches), z.crashes ? nf(z.crashes) + ' plantage(s)' : 'aucun plantage')}${card('🏆', 'Plus longue session', hrs(z.longest))}${card('⭐', 'Instance préférée', z.favorite ? esc(z.favorite.name) : '—', z.favorite ? hrs(z.favorite.secs) : '')}</div>
  <div class="card" style="display:block;margin-top:10px"><b>14 derniers jours</b><div class="bars14">${z.days.map(d => `<div class="b14" title="${d.d} : ${hrs(d.secs)}"><i style="height:${Math.max(3, Math.round(d.secs / mx * 100))}%"></i><small>${d.d.slice(3)}</small></div>`).join('')}</div></div>
  <div class="sh"><h3>Serveurs</h3></div><div class="stat">${card('🔌', 'Connexions à des serveurs', nf(z.joins))}${card('🌐', 'Serveurs différents', nf(z.serversJoined))}${card('📌', 'Serveurs enregistrés', nf(z.serversSaved))}${card('🖥', 'Serveurs hébergés', nf(z.hosts))}${card('⏳', 'Temps sur serveurs', hrs(z.srvSecs))}${card('💀', 'Morts sur serveurs', nf(z.srvDeaths))}${card('🧭', 'Distance sur serveurs', z.srvKm.toLocaleString('fr-FR') + ' km')}</div><small class="mu">Morts et distance sur serveurs : relevées par le mod Hydarium. S’il n’est pas construit pour la version jouée, seul le temps passé est compté.</small>${z.topServers.length ? `<div class="card" style="display:block;margin-top:10px"><b>Serveurs les plus visités</b>${z.topServers.map(t => `<div class="row between" style="padding:4px 0"><span>${esc(t.addr)}</span><span class="mu">${t.n ? t.n + ' fois' : ''}${t.n && t.secs ? ' · ' : ''}${t.secs ? hrs(t.secs) : ''}</span></div>`).join('')}</div>` : ''}
  <div class="sh"><h3>Dans le jeu <small class="mu">(solo + serveurs)</small></h3></div><div class="stat">${card('💀', 'Morts', nf(z.deaths), z.srvDeaths ? 'dont ' + nf(z.srvDeaths) + ' sur serveurs' : '')}${card('⚔', 'Monstres tués', nf(z.mobKills), 'solo uniquement')}${card('🚶', 'Distance parcourue', z.distanceKm.toLocaleString('fr-FR') + ' km', z.srvKm ? 'dont ' + z.srvKm.toLocaleString('fr-FR') + ' km sur serveurs' : '')}${card('🦘', 'Sauts', nf(z.jumps), 'solo uniquement')}${card('⛏', 'Blocs minés', nf(z.blocksMined), 'solo uniquement')}${card('🔨', 'Objets fabriqués', nf(z.itemsCrafted), 'solo uniquement')}${card('🩸', 'Dégâts infligés', nf(z.damageDealt), 'solo uniquement')}${card('🕒', 'Temps en monde solo', z.worldHours.toLocaleString('fr-FR') + ' h')}</div>
  <div class="sh"><h3>Collection</h3></div><div class="stat">${card('📦', 'Instances', nf(z.instances), Object.entries(z.loaders).map(([k, v]) => v + ' ' + ldn(k)).join(' · '))}${card('🧩', 'Mods installés', nf(z.mods), nf(z.modsDistinct) + ' différents')}${card('🌍', 'Mondes', nf(z.worlds))}${card('📷', 'Captures d’écran', nf(z.screenshots))}${card('🎨', 'Packs de ressources', nf(z.resourcepacks))}${card('✨', 'Shaders', nf(z.shaders))}</div>`;
}
/* ===== rendu principal : un seul rendu à la fois, la saisie en cours est conservée ===== */
/* Carte « Accès Internet gratuit (playit.gg) » d'un serveur local : démon à installer → lancer → lier le compte playit → un tunnel PAR serveur (créé ici, ou choisi parmi ceux du compte).
   L'adresse vient de l'API de playit (jamais d'une lecture de texte) ; le champ « adresse du tunnel » reste toujours disponible pour la coller ou la changer à la main. */
function pgCard(h, G) {
  const head = '<div class="card col" style="margin-top:10px"><b>Accès Internet gratuit (playit.gg)</b>', row = x => '<div class="row" style="margin-top:8px;flex-wrap:wrap;gap:8px">' + x + '</div>';
  if (!G) return head + '<small>Indisponible.</small></div>';
  if (G.installing) return head + '<small>Téléchargement du démon playit…</small></div>';
  const port = h.port, det = (G.tunnels || {})[port] || '', saved = h.playitAddress || '', addr = det || saved, list = G.list || [], running = G.state === 'running';
  const intro = '<small>playit.gg fait passer ton serveur par ses relais : tes amis se connectent sans que tu ouvres de port sur ta box et ton adresse IP reste cachée. Il faut le petit programme de playit (gratuit) et un compte playit gratuit. Chaque serveur peut avoir son propre tunnel.</small>';
  const manual = '<div class="row" style="margin-top:8px"><input id="pgaddr" placeholder="Adresse du tunnel (xxx.gl.at.ply.gg:12345)" value="' + esc(saved) + '" style="flex:1;width:auto"><button class="btn g sm" data-a="pgsave">Enregistrer</button></div><small id="pgres" style="display:block;margin-top:6px"></small>';
  const addrBlock = !addr ? '' : (det ? '<small>Ton serveur est joignable ici :</small>' : '<small>Adresse enregistrée pour ce serveur :</small>') + '<div style="margin-top:6px"><b style="font-size:15px">' + esc(addr) + '</b></div>' + (det || running ? '' : '<small style="display:block;margin-top:4px">L’agent n’est pas lancé : cette adresse ne répond que lorsqu’il tourne.</small>');
  const acts = addr ? '<button class="btn sm" data-a="pgcopy" data-v="' + esc(addr) + '">Copier</button>' + (det && saved !== det ? '<button class="btn g sm" data-a="pguse" data-v="' + esc(det) + '">Enregistrer pour ce serveur</button>' : '') + '<button class="btn g sm" data-a="pgcheck" data-v="' + esc(addr) + '" ' + (h.state === 'running' ? '' : 'disabled title="Démarre le serveur d’abord"') + '>Vérifier</button>' : '';
  const others = list.filter(t => !t.pending && (t.type === 'minecraft-java' || !t.type) && t.localPort !== port);
  const picker = !running || !others.length ? '' : '<div class="row" style="margin-top:8px"><select id="pgpick" style="flex:1;width:auto">' + others.map(t => '<option value="' + esc(t.id) + '">' + esc((t.name || 'Tunnel') + ' · ' + (t.address || 'en attente') + (t.localPort ? ' → port ' + t.localPort : '')) + '</option>').join('') + '</select><button class="btn g sm" data-a="pgassign" data-v="' + port + '">' + (det ? 'Utiliser ce tunnel à la place' : 'Utiliser ce tunnel pour ce serveur') + '</button></div><small style="display:block;margin-top:4px">Le tunnel choisi mènera au port ' + port + ' : il ne mènera plus à son ancien serveur.</small>';
  const dis = list.find(t => t.localPort === port && t.disabled), pend = list.filter(t => t.pending).length, creating = (G.creating || []).includes(port);
  const sites = '<button class="btn g sm" data-a="pgsite">Gérer mes tunnels</button>';
  let b;
  if (!G.installed) b = intro + row('<button class="btn sm" data-a="pginstall">Installer le démon playit</button><button class="btn g sm" data-a="pgdl">Page de téléchargement</button>') + manual;
  else if (G.state === 'off') b = intro + addrBlock + row('<button class="btn sm" data-a="pgstart">Activer l’accès playit.gg</button>' + (addr ? '<button class="btn g sm" data-a="pgcopy" data-v="' + esc(addr) + '">Copier</button>' : '') + (G.hasAccount ? '<button class="btn g sm" data-a="pgreset">Relier un autre compte</button>' : '')) + manual;
  else if (G.state === 'starting') b = '<small>Démarrage de l’agent…</small>' + row('<button class="btn g sm" data-a="pgstop">Annuler</button>');
  else if (G.state === 'claim') b = '<small><b>Étape 1 :</b> lie ce PC à ton compte playit (gratuit). Clique sur le bouton : une page s’ouvre, connecte-toi puis accepte. Cette fenêtre se met à jour toute seule.</small>' + row('<button class="btn sm" data-a="pgclaim">Ouvrir la page de liaison</button><button class="btn g sm" data-a="pgstop">Arrêter</button>') + manual;
  else if (G.state === 'error') b = '<small style="color:var(--bad,#e5484d)">' + esc(G.error || 'Erreur') + '</small>' + addrBlock + row('<button class="btn sm" data-a="pgstart">Réessayer</button><button class="btn g sm" data-a="pginstall">Réinstaller le démon</button>' + (G.hasAccount ? '<button class="btn g sm" data-a="pgreset">Relier un autre compte</button>' : '')) + manual;
  else b = (addr ? addrBlock : '<small><b>Étape 2 :</b> ce serveur (port <b>' + port + '</b>) n’a pas encore de tunnel. Crée-en un ici, ou choisis-en un déjà existant.</small>')
    + (dis ? '<small style="display:block;margin-top:6px;color:var(--bad,#e5484d)">Le tunnel de ce serveur est désactivé (' + esc(dis.disabled) + '). Active-le dans « Gérer mes tunnels ».</small>' : '')
    + (G.note ? '<small style="display:block;margin-top:6px;color:var(--bad,#e5484d)">' + esc(G.note) + '</small>' : '')
    + row(acts + (det || addr && !creating ? '' : creating ? '<small>Création du tunnel… l’adresse apparaît dans quelques secondes.</small>' : '<button class="btn sm" data-a="pgnew" data-v="' + port + '" data-n="' + esc(h.name || '') + '">Créer un tunnel pour ce serveur</button>') + sites + '<button class="btn g sm" data-a="pgstop">Arrêter l’agent</button>')
    + picker + (pend ? '<small style="display:block;margin-top:6px">' + pend + ' tunnel(s) en préparation chez playit…</small>' : '') + manual;
  const logs = (G.lines || []).slice(-12);
  return head + b + (logs.length ? '<details style="margin-top:8px"><summary><small>Journal de l’agent</small></summary><pre class="con" style="max-height:140px;overflow:auto">' + esc(logs.join('\n')) + '</pre></details>' : '') + '</div>';
}
const VIEWS = { ovl: ovlView, catalog: catView, host: hostView, hostd: hostDetail, home, inst: instPage, srv: srvView, shots: shotsView, set: setView, acc: profile, detail: detailView };
function renderNav() { setTimeout(() => { trNode($('#nav')); trNode($('#me')); }, 0); $('#nav').innerHTML = NAV.map(([k, l, i]) => `<button class="nav ${page === k || (page === 'detail' && k === 'inst') || (page === 'hostd' && k === 'host') ? 'a' : ''}" data-a="p" data-v="${k}"><svg viewBox="0 0 24 24" width="18" height="18" class="i">${P[i]}</svg><span>${l}</span>${k === 'host' && HRUN ? '<i class="ron" title="Un serveur est en ligne"></i>' : ''}</button>`).join(''); }
const hrun = () => call('host:list').then(l => { HRUN = l.filter(h => h.state !== 'stopped').length; renderNav(); }).catch(() => {});
async function render() {
  const my = ++rid; $('#ttl').textContent = TT[page] || ''; look();
  renderNav();
  $('#me').innerHTML = acc ? `<span class="dot"><img alt="" src="https://mc-heads.net/avatar/${esc(acc.uuid)}/64"></span><span><b>${esc(acc.name)}</b><small>Profil ›</small></span>` : `<span class="dot">${ic('user', 16)}</span><span><b>Se connecter</b><small>Compte Microsoft</small></span>`;
  let h; try { h = await VIEWS[page](); } catch (e) { h = `<p class="mu">${esc(e.message)}</p>`; note(e.message, 'Erreur'); }
  if (my !== rid) return;
  const ovm = document.querySelector('.ovmain'), ovs = ovm ? ovm.scrollTop : 0, ovk = ovT + '|' + OVQ, m = $('#main'), a = document.activeElement, keep = a && a.id && m.contains(a) ? { id: a.id, v: a.value, s: a.selectionStart, e: a.selectionEnd } : null, key = page + '|' + cur + '|' + it + '|' + st, sc = key === lastKey ? m.scrollTop : 0;
  lastKey = key; m.innerHTML = h; m.scrollTop = sc; { const nm = document.querySelector('.ovmain'); if (nm && ovs && ovk === ovKey) nm.scrollTop = ovs; ovKey = ovk; }
  if (keep) { const n = document.getElementById(keep.id); if (n) { n.focus(); if (n.tagName === 'INPUT' && n.type === 'text') { n.value = keep.v; try { n.setSelectionRange(keep.s, keep.e); } catch (e) {} } } }
  if (page === 'home') homeSrvFill(); trNode(m);
  if (BR && BR.need && (page === 'catalog' || (OVL && ovT === 'content'))) { BR.need = false; brSearch(false); } // la liste « populaires » s’affiche dès l’ouverture, sans devoir saisir un caractère
  document.querySelectorAll('canvas[data-sk]').forEach(drawSkin); document.querySelectorAll('canvas[data-cp]').forEach(drawCape); lazyThumbs();
}
async function play(id, o = {}) {
  if (LASTC && LASTC.launch) LASTC = null;
  playing = id; render();
  try { const r = await call('game:play', id, o); if (r && r.warn) { playing = null; render(); if (await ask('Attention avant de lancer', r.warn.map(esc).join('<br>') + '<br><br>Lancer quand même ?', 'Lancer', false)) { if ((r.unverified || []).length && await ask('Faire confiance à ces mods ?', 'Ne plus afficher l’avertissement pour : ' + r.unverified.map(m => esc(m.title)).join(', ') + '.<br>Tu pourras retirer cette confiance dans la page de l’instance.', 'Faire confiance', false)) for (const m of r.unverified) await call('mods:trust', id, m.pid, true).catch(() => {}); return play(id, { ...o, confirm: true }); } } }
  catch (er) { playing = null; render(); if (LASTC && LASTC.launch && LASTC.id === id && Date.now() - LASTC.at < 10000) return; /* déjà expliqué dans la fenêtre « n’a pas pu démarrer » */ throw er; }
}
const goInst = id => { SELM.clear(); cur = id; it = 'mods'; page = 'detail'; render(); };
const setI = (o) => call('inst:set', cur, o);

/* ===== actions (data-a) ===== */
const ACT = {
  impmenu: () => impMenu(), impfile: () => impFile(),
  tnext: () => { tourN++; tourShow(); }, tskip: () => tourEnd(), tourgo: () => { page = 'home'; render(); setTimeout(tourStart, 300); },
  cdis: async d => { await call('mods:toggle', LASTC.id, d.pid, false); flash('Mod désactivé ✓'); inst = await call('inst:list'); closeModal(); },
  crinst: async (d, t) => { t.disabled = true; t.textContent = 'Téléchargement…'; try { await call('mods:add', LASTC.id, d.slug); inst = await call('inst:list'); t.outerHTML = '<span class="bd ok">✔ Installé : relance le jeu</span>'; } catch (e) { t.disabled = false; t.textContent = 'Réessayer'; note(e.message, 'Téléchargement impossible'); } },
  crm2: async d => { await call('mods:remove', LASTC.id, d.pid); flash('Mod désinstallé ✓'); inst = await call('inst:list'); closeModal(); },
  calloff: async () => { await call('mods:disableall', LASTC.id); flash('Tous les mods sont désactivés ✓'); inst = await call('inst:list'); closeModal(); },
  csafe: () => { closeModal(); return play(LASTC.id, { safe: true }); },
  /* boutons d’action de la fenêtre de plantage (Java à télécharger, mémoire à changer, réessayer…) */
  cact: async (d, t) => {
    const id = LASTC && LASTC.id; if (!id) return; const lab = t.textContent;
    try {
      if (d.id === 'jinst') { t.disabled = true; t.textContent = 'Téléchargement de Java ' + d.v + '…'; const j = await call('java:install', +d.v); jl = null; note('Java ' + j.major + ' installé'); closeModal(); return play(id); }
      if (d.id === 'jset') { closeModal(); page = 'set'; st = 'java'; render(); return; }
      if (d.id === 'jadd') { const j = await call('java:add'); if (!j) return; jl = null; note('Java ' + j.major + ' ajouté'); closeModal(); return play(id); }
      if (d.id === 'jauto') { await call('inst:set', id, { java: '' }); inst = await call('inst:list'); closeModal(); return play(id); }
      if (d.id === 'autojava') { await call('set:set', { autoJava: true }); cfg.autoJava = true; closeModal(); return play(id); }
      if (d.id === 'mem') { await call('inst:set', id, { mem: +d.v }); inst = await call('inst:list'); closeModal(); return play(id); }
      if (d.id === 'retry') { closeModal(); return play(id); }
    } catch (e) { t.disabled = false; t.textContent = lab; note(e.message, 'Action impossible'); }
  },
  ccopy: async () => { await navigator.clipboard.writeText((LASTC.tail || []).join('\n')); flash('Journal copié ✓'); },
  ccat: () => { cur = LASTC.id; BR = null; closeModal(); page = 'catalog'; render(); },
  p: d => { page = d.v; if (d.v !== 'catalog') BR = null; render(); },
  open: d => { if (d.close) closeModal(); goInst(d.id); },
  it: d => { it = d.v; render(); }, st: d => { st = d.v; render(); },
  isel: d => { SELI.has(d.id) ? SELI.delete(d.id) : SELI.add(d.id); render(); },
  sel_i: () => inst.filter(i => (!catF || tagsOf(i).includes(catF)) && SELI.has(i.id)),
  iall: () => { const l = inst.filter(i => !catF || tagsOf(i).includes(catF)); const all = l.every(i => SELI.has(i.id)); l.forEach(i => all ? SELI.delete(i.id) : SELI.add(i.id)); render(); },
  inone: () => { SELI.clear(); render(); },
  idel: async () => { const l = ACT.sel_i(); if (!l.length) return; if (!await ask('Supprimer ' + l.length + ' instance' + (l.length > 1 ? 's' : '') + ' ?', 'Les instances suivantes, leurs mods, mondes et captures seront supprimés définitivement :<br><small>' + l.map(i => esc(i.name)).join(', ') + '</small>', 'Supprimer')) return;
    let bad = 0; for (const i of l) { try { await call('inst:delete', i.id); SELI.delete(i.id); } catch (e) { bad++; } } await refresh(); flash(bad ? (l.length - bad) + ' supprimée(s), ' + bad + ' en échec' : l.length + ' instance' + (l.length > 1 ? 's supprimées' : ' supprimée') + ' ✓'); },
  itag: () => { const l = ACT.sel_i(); if (!l.length) return; MT = { kind: 'inst', ids: l.map(i => i.id), tags: [] }; mtagModal(); },
  ssel: d => { SELS.has(d.id) ? SELS.delete(d.id) : SELS.add(d.id); render(); },
  sall: () => { const l = saved.filter(x => !srvCat || x.cat === srvCat), all = l.every(x => SELS.has(x.id)); l.forEach(x => all ? SELS.delete(x.id) : SELS.add(x.id)); render(); },
  snone: () => { SELS.clear(); render(); },
  stag: () => { const l = saved.filter(x => !srvCat || x.cat === srvCat).filter(x => SELS.has(x.id)); if (!l.length) return; MT = { kind: 'srv', ids: l.map(x => x.id), tags: [] }; mtagModal(); },
  sdelmany: async () => { const l = saved.filter(x => !srvCat || x.cat === srvCat).filter(x => SELS.has(x.id)); if (!l.length) return; const r = await ask3('Retirer ' + l.length + ' serveur' + (l.length > 1 ? 's' : '') + ' ?', 'Ils disparaissent de la liste d’Hydarium : <small>' + l.map(x => esc(x.name)).join(', ') + '</small>. Tu peux aussi les retirer de la liste de serveurs du jeu (sinon ils ne reviendront pas dans Hydarium pour autant).', 'Retirer d’Hydarium', 'Retirer aussi du jeu'); if (!r) return;
    for (const x of l) { try { await call('srv:del', x.id, r === 'all'); SELS.delete(x.id); } catch (e) {} } saved = await call('srv:saved'); render(); flash(l.length + ' serveur' + (l.length > 1 ? 's retirés' : ' retiré') + ' ✓'); },
  mtgAdd: () => { const v = ($('#mtgv').value || '').trim().slice(0, 24); if (v && !MT.tags.includes(v)) MT.tags.push(v); mtagModal(); },
  mtgPick: d => { if (!MT.tags.includes(d.v)) MT.tags.push(d.v); mtagModal(); },
  mtgRm: d => { MT.tags = MT.tags.filter(t => t !== d.v); mtagModal(); },
  mtagok: async () => { const v = ($('#mtgv') && $('#mtgv').value || '').trim().slice(0, 24); if (v && !MT.tags.includes(v)) MT.tags.push(v); if (!MT.tags.length) return;
    try {
      if (MT.kind === 'inst') { for (const id of MT.ids) { const i = byId(id); if (i) await call('inst:set', id, { tags: [...new Set([...tagsOf(i), ...MT.tags])].slice(0, 12) }); } await refresh(); }
      else { for (const id of MT.ids) await call('srv:meta', id, { cat: MT.tags[MT.tags.length - 1] }); saved = await call('srv:saved'); render(); } // un serveur n’a qu’une catégorie : la dernière choisie
    } catch (e) { note(e.message, 'Erreur'); return; }
    closeModal(); flash('Tag appliqué ✓'); },
  view: async d => { cfg.view = d.v; await call('set:set', { view: d.v }); render(); },
  catf: d => { catF = d.v; render(); },
  win: d => call('win', d.v),
  uireset: async () => { cfg.uiScale = 1; await call('set:set', { uiScale: 1 }); render(); },
  mclose: () => closeModal(), mok3: d => { const r = askRes; askRes = null; closeModal(); if (r) r(d.v); }, mok: () => { const r = askRes; askRes = null; closeModal(); if (r) r(true); }, mno: () => closeModal(),
  login: async () => { try { acc = await call('auth:login'); note('Connecté : ' + acc.name); } finally { render(); } },
  logout: async () => { await call('auth:logout'); acc = null; render(); },
  play: d => play(d.id), join: d => smartJoin(d.v),
  w2s: async d => {
    const i = byId(cur), info = await call('world:info', cur, d.w).catch(() => ({})), rel = vers.filter(v => v.type === 'release').map(v => v.id), top = rel[0] || '';
    const hint = !i ? '' : i.loader === 'forge' || i.loader === 'neoforge' ? 'Cette instance utilise ' + esc(ldn(i.loader)) + ' : crée plutôt le serveur depuis « Serveur » avec le même loader, puis utilise « Utiliser un monde d’une instance ».' : i.mods.length ? 'Cette instance a des mods : le serveur ne les reprend pas tout seul. Ajoute les mêmes mods au serveur (Fabric) pour que les blocs et objets du monde ne disparaissent pas.' : '';
    WS = { kind: 'new', inst: cur, folder: d.w, name: d.w, type: i && i.loader === 'fabric' ? 'fabric' : 'vanilla', version: rel.includes(info.version) ? info.version : i && rel.includes(i.version) ? i.version : top, mem: 2, link: 'link', eula: false, hint }; await wsModal();
  },
  hworld: async () => { WS = { kind: 'attach', inst: (inst[0] || {}).id || '', folder: '', link: 'link' }; await wsModal(); },
  wsgo: async () => {
    const W = WS; if (!W) return;
    if (W.kind === 'attach') { if (!W.folder) throw new Error('Choisis un monde.'); const r = await call('host:world', HID, W.inst, W.folder, W.link); closeModal(); WS = null; flash(r.linked ? 'Monde relié ✓' : 'Monde copié ✓'); if (r.warn) note(r.warn, 'À vérifier'); render(); return; }
    if (!W.eula) throw new Error('Accepte le CLUF de Minecraft pour héberger un serveur.');
    openModal('<h3>Création du serveur</h3><p>Téléchargement du serveur et mise en place du monde… quelques secondes.</p><div class="spin" style="margin:16px auto"></div>');
    try { const h = await call('host:create', { name: (W.name || '').trim() || W.folder, type: W.type, version: W.version, mem: W.mem, eula: true, world: { inst: W.inst, folder: W.folder, mode: W.link } }); closeModal(); WS = null; HID = h.id; page = 'hostd'; render(); const m = [...(h.bad || []), ...(h.warn ? [h.warn] : [])]; if (m.length) note(m.join(' | '), 'À vérifier'); }
    catch (e) { closeModal(); wsModal(); throw e; }
  },
  hunlink: async () => { if (!await ask('Délier le monde ?', 'Le serveur garde une copie indépendante de ce monde ; l’instance garde le sien. Plus rien ne sera partagé entre les deux.', 'Délier', false)) return; await call('host:unlink', HID); flash('Monde délié ✓'); render(); },
  msel: d => { SELM.has(d.id) ? SELM.delete(d.id) : SELM.add(d.id); render(); },
  mselall: async () => { const l = (await call('inst:detail', cur)).mods, all = l.every(m => SELM.has(m.pid)); l.forEach(m => all ? SELM.delete(m.pid) : SELM.add(m.pid)); render(); },
  mselnone: () => { SELM.clear(); render(); },
  mselact: async d => {
    const l = (await call('inst:detail', cur)).mods, ids = l.filter(m => SELM.has(m.pid)).map(m => m.pid), n = ids.length, act = d.v; if (!n) return;
    const r = await call('mods:batch', cur, ids, act, { dry: true }); let cascade = false;
    if (act === 'remove') {
      if (r.also.length) { const c = await ask3('Retirer aussi les mods liés ?', 'Tu retires <b>' + n + '</b> mod' + (n > 1 ? 's' : '') + '. Ces mods ont besoin d’eux : <b>' + r.also.map(esc).join(', ') + '</b>.<br>Si tu ne retires que la sélection, ils risquent de ne plus fonctionner ou de faire planter le jeu.', 'Retirer seulement la sélection', 'Tout retirer'); if (!c) return; cascade = c === 'all'; }
      else if (!await ask('Retirer ' + n + ' mod' + (n > 1 ? 's' : '') + ' ?', 'Les fichiers seront supprimés. Tu pourras les réinstaller à tout moment.', 'Retirer')) return;
    } else if (r.also.length && !await ask(act === 'off' ? 'Désactiver aussi les mods liés ?' : 'Réactiver aussi les dépendances ?', (act === 'off' ? 'Ces mods ont besoin de ceux que tu désactives et le seront aussi : ' : 'Ces mods sont nécessaires à ta sélection et seront réactivés : ') + r.also.map(esc).join(', ') + '.', 'Continuer', false)) return;
    await call('mods:batch', cur, ids, act, { cascade }); SELM.clear(); flash(act === 'remove' ? 'Mods retirés ✓' : act === 'off' ? 'Mods désactivés ✓' : 'Mods activés ✓'); render();
  },
  wPlay: d => play(cur, { world: d.w }),
  impcat: () => openBrowser('modpack', 'pack'),
  mapdl: () => openBrowser('map', 'inst'),
  newInst: () => newInst(catF === 'Moddé'), impman: async () => { const l = await call('imp:manual'); if (!l) return; closeModal(); W = { key: 'manual', list: l }; wiz(3); },
  impcode: async () => { const r = await call('inst:import', $('#cd').value); closeModal(); note(r.failed.length ? r.failed.length + ' mod(s) n’ont pas pu être installés' : 'Pack importé'); await refresh(); },
  del: async d => { const i = byId(d.id); if (await ask('Supprimer « ' + esc(i ? i.name : '') + ' » ?', 'L’instance, ses mods, ses mondes et ses captures seront supprimés définitivement.', 'Supprimer')) { await call('inst:delete', d.id); if (page === 'detail') page = 'home'; await refresh(); } },
  cat: d => { const i = byId(d.id); cur = d.id; TG = { id: d.id, tags: [...tagsOf(i)] }; tagModal(); },
  tgAdd: () => { const v = $('#tgv').value.trim().slice(0, 20); if (v && !TG.tags.includes(v)) TG.tags.push(v); tagModal(); },
  tgPick: d => { if (!TG.tags.includes(d.v)) TG.tags.push(d.v); tagModal(); },
  tgRm: d => { TG.tags = TG.tags.filter(t => t !== d.v); tagModal(); },
  catok: async () => { await call('inst:set', TG.id, { tags: TG.tags }); closeModal(); await refresh(); flash('Tags enregistrés ✓'); },
  dup: async d => { await call('inst:dup', d.id); note('Instance dupliquée'); await refresh(); },
  code: async d => { const c = await call('inst:code', d.id); openModal(`<h3>Code de partage</h3><p>Donne ce code à un ami : il pourra recréer cette instance depuis « Nouvelle instance ».</p><input readonly id="cdv" value="${esc(c)}" style="width:100%"><div class="row end" style="margin-top:12px"><button class="btn sec" data-a="mclose">Fermer</button></div>`); $('#cdv').select(); },
  folder: d => call('inst:open', d.id, d.sub),
  rm: async d => {
    const dep = await call('mods:dependents', cur, d.pid);
    if (dep.length) { const c = await ask3('Retirer aussi les mods liés ?', 'Ces mods ont besoin de celui-ci : <b>' + dep.map(esc).join(', ') + '</b>.<br>Si tu ne retires que lui, ils risquent de ne plus fonctionner ou de faire planter le jeu.', 'Retirer seulement lui', 'Tout retirer'); if (!c) return; await call('mods:remove', cur, d.pid, c === 'all'); } else await call('mods:remove', cur, d.pid);
    render();
  },
  modrmall: async d => { // page d’un serveur hébergé : on garde « tout retirer » (seuls les mods d’INSTANCE passent à « tout désactiver »)
    if (!await ask('Retirer tous les mods ?', `Les <b>${+d.n || 0}</b> mod(s) (actifs et désactivés) seront supprimés d’un coup. Tu pourras en réinstaller à tout moment.`, 'Tout retirer')) return;
    await call('mods:removeall', cur); flash('Tous les mods ont été retirés ✓'); render();
  },
  modoffall: async d => {
    const on = d.v === '1';
    if (!on && !await ask('Désactiver tous les mods ?', `Les <b>${+d.n || 0}</b> mod(s) actifs seront désactivés d’un coup, mais ils restent dans l’instance : tu pourras les réactiver à tout moment. Le mod Hydarium, obligatoire, reste actif.`, 'Tout désactiver')) return;
    await call('mods:setall', cur, on); flash(on ? 'Tous les mods sont activés ✓' : 'Tous les mods sont désactivés ✓'); render();
  },
  clienttog: async () => { const i = byId(cur), c = JSON.parse(JSON.stringify(i.client || { on: true, modules: {} })); if (c.disabled) delete c.disabled; else c.disabled = true; await setI({ client: c }); i.client = c; flash(c.disabled ? 'Hydarium Client désactivé' : 'Hydarium Client activé ✓'); render(); },
  buildmod: async d => { flash('Construction du mod Hydarium en arrière-plan… (la première fois : téléchargement de Java et Gradle)'); try { await call('client:build', d.id); } catch (e) { note(e.message, 'Erreur'); } setTimeout(render, 400); },
  modtrust: async d => { await call('mods:trust', cur, d.pid, !!d.on); render(); },
  modtog: async d => {
    const r = await call('mods:toggle', cur, d.pid, true);
    if (r.also.length && !(await ask(r.action === 'off' ? 'Désactiver aussi les mods liés ?' : 'Réactiver aussi les dépendances ?', (r.action === 'off' ? 'Ces mods ont besoin de celui-ci et seront désactivés : ' : 'Ce mod a besoin de ces mods, ils seront réactivés : ') + r.also.map(esc).join(', ') + '.', 'Continuer', false))) return;
    await call('mods:toggle', cur, d.pid, false); render();
  },
  modupd: async () => { openModal('<h3>Mises à jour des mods</h3><div class="spin" style="margin:20px auto"></div>'); const l = await call('mods:updates', cur).catch(e => { closeModal(); throw e; }); UPD = l; updModal(); },
  updOne: async (d, t) => { t.disabled = true; t.textContent = '…'; await call('mods:update', cur, d.pid); UPD = UPD.filter(x => x.pid !== d.pid); updModal(); },
  updAll: async () => { for (const u of [...UPD]) { try { await call('mods:update', cur, u.pid); UPD = UPD.filter(x => x.pid !== u.pid); updModal(); } catch (e) { note(u.title + ' : ' + e.message, 'Erreur'); } } },
  updClose: () => { closeModal(); render(); },
  wSet: d => worldModal(d.w),
  wsPack: async d => { await call('world:set', cur, WM, { pack: d.n }); worldModal(WM); },
  wsPackRm: async d => { await call('world:packrm', cur, WM, d.n); worldModal(WM); },
  wsPackImp: async () => { const n = await call('world:packimp', cur, WM); if (n) flash(n + ' data pack(s) importé(s)'); worldModal(WM); },
  dpImp: async () => { try { const n = await call('dp:import', cur, CW); if (n) flash(n + (CW === '__next__' ? ' data pack(s) préparé(s) pour le prochain monde' : ' data pack(s) importé(s)')); } catch (e) { flash(e.message); } },
  wsPackDl: () => openBrowser('datapack', 'inst', WM),
  wsResDl: () => openBrowser('resourcepack', 'inst', WM),
  wsResImp: async () => { if (await call('world:resimp', cur, WM)) { flash('Pack importé'); worldModal(WM); } },
  wsResRm: async () => { await call('world:resrm', cur, WM); flash('Pack retiré'); worldModal(WM); },
  wsSeed: () => { navigator.clipboard.writeText($('#wseed').value); flash('Seed copiée'); },
  catType: d => { catT = d.v; BR = null; render(); },
  hopen: d => { SELM.clear(); HID = d.id; page = 'hostd'; render(); },
  hnew: () => hostNew(),
  hgo: async () => { const c = { ...HC, loaderVer: HC.lv, name: (HC.name || '').trim() || 'Mon serveur' }; openModal(`<h3>Création du serveur</h3><p>${HC.type === 'forge' || HC.type === 'neoforge' ? 'Installation de ' + (HC.type === 'forge' ? 'Forge' : 'NeoForge') + '… compte 2 à 5 minutes la première fois, ne ferme pas le launcher.' : 'Téléchargement du serveur… quelques secondes.'}</p>`+'<div class="spin" style="margin:16px auto"></div>'); try { const h = await call('host:create', c); closeModal(); HID = h.id; page = 'hostd'; HC = null; render(); if (h.bad && h.bad.length) note(h.bad.join(' | '), 'Joueurs non ajoutés'); } catch (e) { closeModal(); hostNew(); throw e; } },
  hudingame: async () => { const r = await call('client:editor'); if (r && r.ok) flash('Éditeur ouvert dans le jeu ✓'); else note((r && r.reason) || 'Impossible.', 'Modifier en jeu'); },
  /* accès Internet gratuit (playit.gg) */
  pgstart: async () => { await call('playit:start'); render(); }, pgstop: async () => { await call('playit:stop'); render(); }, pgclaim: () => call('playit:claim'), pgsite: () => call('playit:site'), pgdl: () => call('playit:download'),
  pginstall: async (d, t) => { t.disabled = true; t.textContent = 'Téléchargement…'; try { await call('playit:install'); flash('Démon playit installé ✓'); } finally { render(); } },
  pgnew: async (d, t) => { t.disabled = true; t.textContent = 'Création…'; try { await call('playit:create', +d.v, d.n || ''); flash('Tunnel en cours de création…'); } finally { render(); } },
  pgassign: async d => { const sel = $('#pgpick'); if (!sel || !sel.value) return; await call('playit:assign', sel.value, +d.v); flash('Tunnel modifié ✓'); render(); },
  pgreset: () => openModal('<h3>Relier un autre compte playit ?</h3><p>Hydarium oublie la liaison actuelle. Au prochain « Activer », une page s’ouvrira pour te connecter avec le compte de ton choix. Tes tunnels restent chez playit.</p><div class="row end" style="margin-top:14px"><button class="btn sec" data-a="mclose">Annuler</button><button class="btn" data-a="pgresetgo">Oui, délier</button></div>'),
  pgresetgo: async () => { closeModal(); await call('playit:reset'); flash('Liaison oubliée ✓'); render(); },
  pgcopy: d => { navigator.clipboard.writeText(d.v); flash('Adresse copiée ✓'); },
  pguse: async d => { await call('host:set', HID, { playitAddress: d.v }); flash('Adresse enregistrée ✓'); render(); },
  pgsave: async () => { const v = ($('#pgaddr').value || '').trim(); await call('host:set', HID, { playitAddress: v }); flash(v ? 'Adresse enregistrée ✓' : 'Adresse retirée'); render(); },
  pgcheck: async (d, t) => { const lab = t.textContent; t.disabled = true; t.textContent = 'Vérification…'; const r = await call('playit:check', d.v).catch(e => ({ ok: false, error: e.message })); const o = $('#pgres'); if (o) o.innerHTML = r.ok ? '✓ Ton serveur répond depuis Internet' + (r.version ? ' (' + esc(r.version) + ')' : '') : '✗ Pas de réponse (' + esc(r.error || '?') + '). Le serveur est-il démarré, et le tunnel pointe-t-il vers le bon port ?'; t.disabled = false; t.textContent = lab; },
  hstart: async () => { await call('host:start', HID); render(); }, hstop: async () => { await call('host:stop', HID); render(); },
  hcmd: async () => { const i = $('#hcmd'); if (!i.value.trim()) return; await call('host:cmd', HID, i.value); i.value = ''; },
  hcmdp: async d => { const n = $('#hplayer').value.trim(); if (!/^\w{3,16}$/.test(n)) throw new Error('Pseudo invalide.'); await call('host:cmd', HID, d.v.replace('%', n)); },
  hfolder: () => call('host:open', HID),
  hplay: async d => { await call('host:player', HID, d.act, d.n); flash('Fait ✓'); setTimeout(render, 700); },
  hadd: async d => { const n = $('#hnew').value.trim(); await call('host:player', HID, d.act, n); $('#hnew').value = ''; flash('Fait ✓'); setTimeout(render, 700); },
  himp: async () => { const h = await call('host:import'); if (h) { flash('Serveur importé ✓'); HID = h.id; page = 'hostd'; render(); } },
  hexp: async () => { if (await call('host:export', HID)) { flash('Serveur exporté ✓'); note('Serveur exporté : start.bat / start.sh inclus pour le lancer ailleurs.', 'Hydarium'); } },
  ptog: async d => { await call('plugin:toggle', HID, d.f); render(); },
  prm: async d => { if (await ask('Retirer ce plugin ?', esc(d.f), 'Retirer')) { await call('plugin:remove', HID, d.f); render(); } },
  p2pon: async () => { await call('p2p:set', HID, { on: true }); flash('Invitations privées activées ✓'); render(); },
  p2poff: async () => { await call('p2p:set', HID, { on: false }); flash('Invitations privées désactivées ✓'); render(); },
  p2pnew: () => openModal('<h3>Générer un nouveau code ?</h3><p>L’ancien code ne marchera plus : tes amis devront ajouter le nouveau dans Mes serveurs.</p><div class="row end" style="margin-top:14px"><button class="btn sec" data-a="mclose">Annuler</button><button class="btn" data-a="p2pnewgo">Nouveau code</button></div>'),
  p2pnewgo: async () => { closeModal(); await call('p2p:set', HID, { renew: true }); flash('Nouveau code créé ✓'); render(); },
  p2pcopy: async d => { await navigator.clipboard.writeText(d.v); flash('Code copié ✓'); },
  hcopy: async d => { await navigator.clipboard.writeText(d.v); flash('Adresse copiée ✓'); },
  hicon: async () => { if (await call('host:icon', HID)) { flash('Icône enregistrée'); render(); } },
  hiconrm: async () => { await call('host:iconrm', HID); render(); },
  totem: async () => { const i = $('#totinst').value, base = await call('totem:base', i), skinSrc = SK && SK.skin ? SK.skin.src : await call('skins:fallback'); const tt = await totemPng(skinSrc, base); await call('totem:make', i, tt.tex, tt.icon); note('Pack « Hydarium Totem » créé : active-le dans Packs de ressources de l’instance.'); },
  hmine: async () => { const h = (await call('host:list')).find(x => x.id === HID); await call('srv:add', { name: h.name + ' (local)', addr: 'localhost:' + h.port }); saved = await call('srv:saved'); flash('Ajouté à Mes serveurs'); },
  hdel: async () => { if (await ask('Supprimer ce serveur ?', 'Le monde et tous les fichiers du serveur seront supprimés.', 'Supprimer')) { await call('host:remove', HID); page = 'host'; render(); } },
  hback: () => { page = 'host'; render(); },
  hjoin: d => smartJoin('localhost:' + d.v),
  datadir: () => call('data:open'),
  swd: async d => { cfg[d.v] = cfg[d.v] === false; await call('set:set', { [d.v]: cfg[d.v] }); render(); },
  ntest: () => call('notify', 'Hydarium', 'Ceci est une notification de test.'),
  spconn: async () => { toast('Autorise Hydarium dans la page Spotify qui s’ouvre…'); await call('spotify:login'); flash('Spotify connecté ✓'); render(); },
  splogout: async () => { await call('spotify:logout'); render(); },
  defapply: async () => { await call('defopts:apply', cur); flash('Réglages par défaut appliqués ✓'); render(); },
  keycap: d => { KEYCAP = d.k; render(); },
  keyclr: async d => { const o = { ...DEFO, keys: { ...(DEFO.keys || {}) } }; delete o.keys[d.k]; await call('defopts:set', o); render(); },
  dopt: async () => { await call('defopts:set', {}); render(); },
  dclear: async d => { if (await ask('Nettoyer cette partie ?', 'Elle sera supprimée ; Hydarium la retélécharge si besoin.', 'Nettoyer', false)) { await call('data:clear', d.k); flash('Nettoyé ✓'); render(); } },
  rsset: async () => { if (await ask('Réinitialiser les réglages ?', 'Les réglages reviennent à zéro. Tes instances, mondes et comptes sont gardés.', 'Réinitialiser')) { await call('data:reset', 'settings'); location.reload(); } },
  rsall: () => openModal('<h3>Tout supprimer ?</h3><p>Instances, mondes, serveurs, skins, comptes et journaux seront <b>définitivement effacés</b>. Tape <b>RESET</b> pour confirmer.</p><input id="rsv" placeholder="RESET" style="width:100%"><div class="row end" style="margin-top:12px"><button class="btn sec" data-a="mclose">Annuler</button><button class="btn dg" data-a="rsgo">Tout supprimer</button></div>'),
  rsgo: async () => { if ($('#rsv').value.trim() !== 'RESET') throw new Error('Tape RESET pour confirmer.'); await call('data:reset', 'all'); document.body.innerHTML = '<p style="padding:40px;color:#fff">Réinitialisation… Hydarium redémarre.</p>'; },
  ovt: async d => { const was = ovT; ovT = d.v; if (d.v === 'edit') { await call('hud:edit', true); await call('ovl:fit', true); document.body.classList.add('ovl-edit'); } else if (was === 'edit') { await call('hud:edit', false); await call('ovl:fit', false); document.body.classList.remove('ovl-edit'); } render(); }, ovclose: () => { call('hud:edit', false); return call('ovl:close'); },
  cpro: async d => { const i = byId(cur), all = [...CPRO.map(p => [p[0], p[1]]), ...(cfg.cProfiles || []).map(p => [p.name, Object.keys(p.modules).filter(k => p.modules[k].on)])], pr = all[+d.n], c = JSON.parse(JSON.stringify(i.client || { on: false, modules: {} })); c.on = true; const okm = cmFor(i).map(x => x[0]); CM.forEach(([k]) => { c.modules[k] = { ...(c.modules[k] || {}), on: pr[1].includes(k) && okm.includes(k) }; }); await setI({ client: c }); i.client = c; flash('Profil appliqué ✓'); render(); },
  cprodel: async d => { const p = (cfg.cProfiles || [])[+d.n]; if (!p) return; if (!(await ask('Supprimer ce profil ?', esc(p.name), 'Supprimer'))) return; cfg.cProfiles = cfg.cProfiles.filter((x, n) => n !== +d.n); await call('set:set', { cProfiles: cfg.cProfiles }); flash('Profil supprimé'); render(); },
  cprosave: async () => { const n = $('#cpn').value.trim(); if (!n) throw new Error('Donne un nom au profil.'); const i = byId(cur); cfg.cProfiles = [...(cfg.cProfiles || []).filter(p => p.name !== n), { name: n, modules: (i.client && i.client.modules) || {} }].slice(-12); await call('set:set', { cProfiles: cfg.cProfiles }); flash('Profil enregistré ✓'); render(); },
  mus: async d => { NP = await call('media:cmd', d.v); if (page === 'ovl') { const e = $('#ovnp'); if (e) e.innerHTML = ovBar(NP); if (ovT === 'music') render(); } },
  cmod: async d => { const i = byId(cur), c = JSON.parse(JSON.stringify(i.client || { on: false, modules: {} })); if (d.k === '_on') c.on = true; else { c.modules[d.k] = c.modules[d.k] || {}; c.modules[d.k].on = !c.modules[d.k].on; } await setI({ client: c }); i.client = c; if (page === 'ovl' && ovT === 'modules') { const g = $('#mgrid'); if (g) g.innerHTML = modGrid(c); const e = $('#mcount'); if (e) e.textContent = `${CM.filter(x => mOn(c, x[0])).length} activés sur ${CM.length}`; return; } render(); },
  sjgo: () => sjRun(),
  sjno: () => { closeModal(); note('Crée une instance avec la bonne version (et les bons mods), importe le modpack du serveur, ou renseigne-le dans Serveurs › Configurer.', 'Rien n’a été créé'); },
  sjvan: async () => { const p = SRVQ, v = ($('#sj-v') || {}).value; if (!p || !v) return; openModal('<h3>Création de l’instance…</h3><div class="spin" style="margin:16px auto"></div><small>Fabric + mod Hydarium + mods par défaut : cela peut prendre un moment</small>');
    let n; try { n = await call('srv:mkvanilla', p.server.addr, v, p.server.name); } catch (e) { closeModal(); throw e; }
    inst = await call('inst:list'); closeModal(); await play(n.id, { server: p.server.addr }); }, sqok: async d => { try { await call('srv:meta', d.id, { name: $('#sq-n').value, addr: $('#sq-a').value, cat: $('#sq-c').value, inst: $('#sq-i').value }); } catch (e) { $('#sq-err').textContent = e.message; return; } await call('srv:setreq', d.id, { loader: $('#sq-l').value, version: $('#sq-v').value.trim(), mods: $('#sq-m').value.split(',').map(x => x.trim()).filter(Boolean) }); saved = await call('srv:saved'); closeModal(); render(); },
  scfg: d => srvCfg(d.id),
  scat: d => { srvCat = d.v; render(); },
  sfav: async d => { const x = saved.find(v => v.id === d.id); await call('srv:meta', d.id, { fav: !(x && x.fav) }); render(); },
  smove: async d => { await call('srv:move', d.id, +d.d); render(); },
  jinst: async d => { const j = await call('java:install', +d.v); note('Java ' + j.major + ' installé'); jl = null; render(); },
  modimp: async () => { const n = await call('mods:import', cur); if (n) note(n + ' mod(s) importé(s) · non vérifié(s)'); render(); },
  addIris: async () => { await call('mods:add', cur, 'iris'); note('Iris installé'); render(); },
  browse: d => openBrowser(d.t, 'inst'),
  brClose: () => { const m = BR.mode, w = BR.world; BR = null; if (m === 'create') crModal(); else if (w) worldModal(w); else { closeModal(); render(); } },
  brMore: () => brSearch(true),
  brSrc: d => { if (d.v === 'curseforge' && !cfg.cfKey) return cfKeyModal(); setSrc(d.v); },
  cfopen: () => call('cf:openkeys'), cfkclose: () => closeModal(),
  cfkey: () => cfKeyModal(), cfkeyrm: async () => { await call('set:set', { cfKey: '' }); cfg.cfKey = ''; if (curSrc() !== SRC) SRC = 'modrinth'; render(); },
  cfksave: async (d, t) => {
    const k = ($('#cfkey').value || '').trim(), m = $('#cfmsg'); if (!k) { m.textContent = 'Colle ta clé dans le champ ci-dessus.'; return; }
    t.disabled = true; t.textContent = 'Vérification…'; let r; try { r = await call('cf:check', k); } catch (e) { r = { ok: false, error: e.message }; }
    if (!r.ok) { t.disabled = false; t.textContent = 'Valider'; m.textContent = r.error; return; }
    await call('set:set', { cfKey: k }); cfg.cfKey = k; closeModal(); toast('CurseForge est connecté ✓'); setSrc('curseforge', true);
  },
  fav: async d => { const r = BR.hits[+d.n]; if (!r) return; const k = favKey(r), f = cfg.favMods || [], on = f.some(x => x.slug === k); cfg.favMods = on ? f.filter(x => x.slug !== k) : [...f, { slug: k, title: r.title, icon: r.icon, tags: [] }]; await call('set:set', { favMods: cfg.favMods }); brFill(); },
  keycap: (d, t) => { if (CAP) capEnd(CAP.prev); CAP = { el: t, k: d.cm, f: d.f, set: d.set, prev: t.textContent }; t.textContent = 'Appuie sur une touche…'; t.classList.add('wait'); document.addEventListener('keydown', capKey, true); setTimeout(() => document.addEventListener('mousedown', capOut, true), 0); },
  keyclr: async d => { if (d.set) { await call('set:set', { overlayKey: 'off' }); cfg.overlayKey = 'off'; flash('Raccourci du menu désactivé'); } else { await saveKey(d.cm, d.f, ''); flash('Touche effacée'); } if (page === 'ovl' && ovT === 'modules') { const g = $('#mgrid'); const i = byId(cur); if (g && i) g.innerHTML = modGrid(i.client); else render(); } else render(); },
  fav2: async d => { const r = BR.hits[+d.n]; if (!r) return; const f = cfg.favContent || [], on = isFav2(r); cfg.favContent = on ? f.filter(x => !(x.type === BR.type && x.pid === String(r.pid) && x.src === (r.src || BR.src))) : [...f, { type: BR.type, src: r.src || BR.src, pid: String(r.pid), title: r.title, icon: r.icon || '' }]; await call('set:set', { favContent: cfg.favContent }); brFill(); },
  fav2add: async (d, t) => { const f = (cfg.favContent || [])[+d.i]; if (!f || (t && t.closest && t.closest('[data-a="fav2rm"]'))) return; try { flash('Installation de ' + f.title + '…'); await call('content:install', cur, f.type, f.pid, BR.world, f.src); flash(f.title + ' installé ✓'); } catch (e) { note(e.message, 'Erreur'); } },
  fav2rm: async d => { cfg.favContent = (cfg.favContent || []).filter((x, i) => i !== +d.i); await call('set:set', { favContent: cfg.favContent }); brFill(); },
  brAdd: async (d, t) => {
    const r = BR.hits[+d.n]; if (!r) return;
    if (BR.mode === 'create') { if (!CR.mods.some(m => m.slug === r.slug)) CR.mods.push({ slug: r.slug, title: r.title }); return brFill(); }
    if (BR.type === 'modpack') {
      const src = r.src || BR.src; BR = null;
      openModal(`<h3>Import du modpack</h3><p id="imptx" class="mu">Téléchargement de « ${esc(r.title)} »…</p><div class="bar" style="width:100%"><i id="impb" style="width:0"></i></div>`);
      try {
        const x = await call('content:install', '', 'modpack', r.pid, '', src); inst = await call('inst:list');
        openModal(`<h3>Modpack importé ✓</h3><p>« ${esc(x.name)} » est prêt.</p>${x.bad.length ? `<div class="note" style="border-color:var(--wa)">${x.bad.length} fichier(s) n’ont pas pu être téléchargés : ${x.bad.slice(0, 5).map(esc).join(', ')}.</div>` : ''}<div class="row end"><button class="btn sec" data-a="mclose">Fermer</button><button class="btn" data-a="open" data-id="${esc(x.id)}" data-close="1">Ouvrir l’instance</button></div>`); render();
      } catch (e) { closeModal(); if (/clé CurseForge/i.test(e.message)) cfKeyModal('Ce modpack vient de CurseForge : ajoute ta clé gratuite, puis réessaie.'); else note(e.message, 'Erreur'); }
      return;
    }
    t.disabled = true; t.textContent = BR.type === 'map' ? 'Téléchargement…' : 'Installation…';
    try { await call('content:install', cur, BR.type, r.pid, BR.world, BR.src); r.installed = BR.type !== 'map'; flash(r.title + (BR.type === 'map' ? ' ajoutée aux mondes' : ' installé')); if (BR.type === 'map') { t.disabled = false; t.textContent = 'Télécharger'; } } catch (e) { note(e.message, 'Erreur'); }
    brFill();
  },
  pkTog: async d => { await call('content:toggle', cur, d.t, d.n); render(); },
  pkRm: async d => { if (await ask('Supprimer ce fichier ?', esc(d.n), 'Supprimer')) { await call('content:remove', cur, d.t, d.n); render(); } },
  pkImp: async d => { const n = await call('content:import', cur, d.t); if (n) flash(n + ' fichier(s) importé(s)'); render(); },
  wImp: async d => { if (await call('worlds:import', cur, d.k)) { flash('Monde importé'); render(); } },
  wExp: d => {
    const o = inst.filter(x => x.id !== cur);
    if (!o.length) return note('Il n’y a pas d’autre instance : crée-en une d’abord.');
    openModal(`<h3>Exporter « ${esc(d.w)} » vers une autre instance</h3><p class="mu">Le monde est copié (l’original reste ici). Si le nom existe déjà dans l’instance choisie, un numéro est ajouté.</p>
    <div class="fld"><label>Instance de destination</label><select id="wxdst">${o.map(x => `<option value="${esc(x.id)}">${esc(x.name)} · Minecraft ${esc(x.version)}${x.loader && x.loader !== 'vanilla' ? ' · ' + esc(ldn(x.loader)) : ''}</option>`).join('')}</select></div>
    <div class="row end" style="margin-top:12px"><button class="btn sec" data-a="mclose">Annuler</button><button class="btn" data-a="wExpGo" data-w="${esc(d.w)}">${ic('copy', 13)} Copier le monde</button></div>`);
  },
  wExpGo: async (d, t) => {
    const sel = $('#wxdst'); if (!sel || !sel.value) return; const dst = sel.value, to = byId(dst); t.disabled = true; t.textContent = 'Copie en cours…';
    try { const r = await call('worlds:export', cur, d.w, dst); closeModal(); flash('Monde copié dans « ' + (to ? to.name : 'l’autre instance') + ' » ✓'); if (r && r.warn) note(r.warn, 'Monde exporté'); }
    catch (e) { closeModal(); note(e.message, 'Export impossible'); }
  },
  wOp: async d => { if (d.op === 'delete' && !(await ask('Supprimer « ' + esc(d.w) + ' » ?', 'Le monde sera supprimé définitivement. Pense à le sauvegarder avant.', 'Supprimer'))) return; await call('worlds:op', cur, d.w, d.op); flash(d.op === 'backup' ? 'Sauvegarde créée dans le dossier backups' : d.op === 'dup' ? 'Monde dupliqué' : 'Monde supprimé'); render(); },
  cover: async d => { await setI({ cover: d.v }); render(); },
  jvmp: async d => { $('#jvm').value = d.v; await setI({ jvm: d.v }); flash('Enregistré'); },
  edflip: () => { const b = $('.edbar'); if (!b) return; const down = b.dataset.pos === 'bottom'; b.dataset.pos = down ? '' : 'bottom'; b.style.top = down ? '12px' : 'auto'; b.style.bottom = down ? 'auto' : '12px'; b.style.left = '50%'; b.style.transform = 'translateX(-50%)'; },
  shAnn: () => annotate(), shot: d => shotModal(+d.i), shNav: d => shotModal(SH.cur + +d.v),
  shOp: async d => { const s = SH[SH.cur]; if (d.op === 'delete' && !(await ask('Supprimer cette capture ?', esc(s.file), 'Supprimer'))) return; await call('shots:op', s.inst, s.file, d.op); if (d.op === 'copy') flash('Capture copiée'); if (d.op === 'delete') { closeModal(); render(); } },
  shF: d => { shI = d.v; render(); },
  shFolders: async () => { const i = inst.find(x => SH.some(s => s.inst === x.id)) || inst[0]; if (i) await call('inst:open', i.id, 'screenshots'); },
  skAdd: async d => { if (await call('skins:addfile', d.v)) { flash('Skin ajouté à ta bibliothèque'); render(); } },
  skSaveCur: async () => { await call('skins:savecurrent'); flash('Skin actuel gardé'); render(); },
  skPlayer: async () => { await call('skins:fromplayer', $('#skp').value); flash('Skin récupéré'); render(); },
  skApply: async d => { flash('Envoi à Mojang…'); await call('skins:apply', d.id); note('Skin appliqué sur ton compte.'); render(); },
  skDel: async d => { if (await ask('Retirer ce skin de la bibliothèque ?', 'Ton skin actuel sur le compte Mojang ne change pas.', 'Retirer')) { await call('skins:remove', d.id); render(); } },
  skDelDef: async d => { if (await ask('Retirer ce skin par défaut ?', 'Il disparaît de ta liste mais tu peux le restaurer à tout moment. Ton skin actuel sur le compte Mojang ne change pas.', 'Retirer')) { await call('skins:remove', d.id); render(); } },
  updCheck: async () => { try { UPS = await call('update:check'); } catch (e) { flash('Erreur : ' + e.message); } const e = $('#updc'); if (e) e.outerHTML = updCard(); },
  updInstall: async d => { if (await ask('Redémarrer pour installer ?', 'Hydarium se ferme, installe la mise à jour puis se relance. Les serveurs hébergés par le launcher seront arrêtés.', 'Installer', false)) { try { await call('update:install'); } catch (e) { flash('Erreur : ' + e.message); } } },
  updOpen: () => call('update:open').catch(() => {}),
  skRetry: async () => { flash('Téléchargement des skins par défaut…'); await call('skins:retry'); render(); },
  skRestore: async () => { await call('skins:restore'); flash('Skins par défaut restaurés'); render(); },
  skExp: async d => { if (await call('skins:export', d.id)) flash('Skin exporté'); },
  cape: async d => { await call('skins:cape', d.id || null); flash(d.id ? 'Cape équipée' : 'Cape retirée'); render(); },
  srvmodadd: async () => { const v = (($('#srvmodin') || {}).value || '').trim().toLowerCase(); if (!/^[a-z0-9_-]{2,64}$/.test(v)) { flash('Nom Modrinth invalide (lettres, chiffres, - et _).'); return; } cfg.srvMods = [...new Set([...(cfg.srvMods || []), v])].slice(0, 30); await call('set:set', { srvMods: cfg.srvMods }); render(); },
  srvmodrm: async d => { cfg.srvMods = (cfg.srvMods || []).filter(x => x !== d.v); await call('set:set', { srvMods: cfg.srvMods }); render(); },
  sw: async d => { cfg[d.v] = !cfg[d.v]; await call('set:set', { [d.v]: cfg[d.v] }); if (d.v === 'snaps') snaps = cfg.snaps; render(); },
  wall: async d => { cfg.wall = d.v; await call('set:set', { wall: d.v }); render(); },
  theme: async d => { cfg.theme = d.v; await call('set:set', { theme: d.v }); render(); },
  accent: async d => { cfg.accent = d.v; await call('set:set', { accent: d.v }); render(); },
  javadef: async d => { await call('set:set', { java: d.v }); cfg.java = d.v; render(); },
  javaadd: async () => { const j = await call('java:add'); if (j) note('Java ' + j.major + ' ajouté'); jl = null; render(); },
  javarm: async d => { await call('java:remove', d.v); if (cfg.java === d.v) cfg.java = ''; jl = null; render(); },
  javare: async () => { await javas(true); render(); },
  sadd: async () => {
    const a = ($('#sa').value || '').trim(), n = ($('#sn2').value || '').trim();
    if (!a) return flash('Entre une adresse ou une invitation');
    if (looksLikeInvite(a)) { // le même champ sert aux deux : un code HYD-… ouvre le tunnel privé, tout le reste est une adresse de serveur
      flash('Recherche de l’hôte…'); const r = await call('srv:addp2p', { name: n, code: a }); saved = await call('srv:saved'); render();
      return r.reachable ? toast('Invitation ajoutée : l’hôte répond ✓') : toast('Invitation ajoutée. ' + r.error, 'er');
    }
    await call('srv:add', { name: n || a, addr: a }); saved = await call('srv:saved'); render();
  },
  sdel: d => { const x = saved.find(y => y.id === d.id); if (!x) return; openModal(`<h3>Retirer « ${esc(x.name)} » ?</h3><p>Il disparaît de la liste d’Hydarium. S’il est aussi enregistré dans la liste de serveurs d’une instance, tu peux le retirer de là aussi (sinon il ne reviendra pas dans Hydarium pour autant).</p><div class="row end" style="flex-wrap:wrap"><button class="btn sec" data-a="mclose">Annuler</button><button class="btn g" data-a="sdelgo" data-id="${esc(x.id)}" data-game="">Retirer d’Hydarium</button><button class="btn" data-a="sdelgo" data-id="${esc(x.id)}" data-game="1">Retirer aussi du jeu</button></div>`); },
  sdelgo: async d => { await call('srv:del', d.id, !!d.game); saved = await call('srv:saved'); closeModal(); render(); flash('Serveur retiré'); },
  jyes: () => call('join:answer', { vanilla: true, version: ($('#jver') || {}).value }), jno: () => call('join:answer', { vanilla: false }), jcancel: () => call('join:cancel'),
  mail: () => call('help:mail'), logs: () => call('logs:open'), logcopy: async () => { await call('logs:copy'); note('Rapport copié : colle-le dans ta demande d’aide.'); },
  wizre: async () => { await call('wiz:reset'); wiz(0); },
  /* assistant */
  w2: d => wiz(+d.v),
  wl: async d => { W.key = d.v; $('#wl').innerHTML = spin('Analyse en cours…'); W.list = await call('imp:scan', d.v); wiz(3); },
  wlogin: async () => { $('#wl').innerHTML = spin('Connexion à Microsoft…'); try { acc = await call('auth:login'); note('Connecté : ' + acc.name); } catch (er) { note(er.message, 'Erreur'); } render(); wiz(2); },
  wimp: async () => {
    const keys = [...document.querySelectorAll('[data-wi]:checked')].map(c => W.list[+c.dataset.wi].key); if (!keys.length) return; W.bg = false;
    $('#wl').innerHTML = keys.length > 1 ? `${spin('Import en cours…')}<p>Importer ${keys.length} instances peut prendre du temps (copie des mondes et des mods). Tu peux utiliser Hydarium ou faire autre chose : une notification te préviendra dès que ce sera terminé.</p><button class="btn sec big" data-a="wbg">Faire autre chose en attendant</button>` : spin('Import en cours…');
    let r; try { r = await call('imp:run', W.key, keys); } catch (e) { if (W.bg) { W.bg = false; flash('Import impossible : ' + e.message); return; } throw e; }
    W.n = r.done; W.skipped = r.skipped; await refresh();
    if (W.bg) { W.bg = false; flash(r.done + ' instance(s) importée(s) ✓'); return; } // la personne est partie faire autre chose : la notification système l’a prévenue
    wiz(4);
  },
  wbg: async () => { W.bg = true; await call('wiz:done'); $('#wl').hidden = true; page = 'home'; render(); }, // l’import continue en arrière-plan
  wend: async () => { await call('wiz:done'); $('#wl').hidden = true; page = 'home'; render(); },
  /* création */
  crRm: d => { CR.mods = CR.mods.filter(m => m.slug !== d.v); crModal(); },
  crClear: () => { CR.mods = []; CR.opt = false; crModal(); }, // tout retirer d’un coup (l’optimisation automatique est décochée pour ne pas tout remettre)
  crPick: d => { CR.version = d.v; crLv(); },
  crAdd: d => { if (!CR.mods.some(m => m.slug === d.v)) CR.mods.push({ slug: d.v, title: nice(d.v) }); crModal(); },
  toCat: d => { catT = d.t || 'mod'; BR = null; page = 'catalog'; renderNav(); render(); },
  crMore: () => openBrowser('mod', 'create'),
  crLoader: d => { CR.loader = d.v; crOptApply(); crModal(); crLv(); },
  favall: () => { (cfg.favMods || []).filter(f => !FVT || (f.tags || []).includes(FVT)).forEach(f => { if (CR.okMap && CR.okMap[f.slug] === true && !CR.mods.some(m => m.slug === f.slug)) CR.mods.push({ slug: f.slug, title: f.title }); }); crModal(); },
  favtag: d => { FVT = d.v; crModal(); },
  favmgr: () => favModal(),
  favrm: async d => { cfg.favMods = (cfg.favMods || []).filter(f => f.slug !== d.slug); await call('set:set', { favMods: cfg.favMods }); favModal(); },
  favback: () => crModal(),
  crCover: d => { CR.cover = d.v; crModal(); },
  crGo: () => crGo()
};
document.addEventListener('click', guard(async e => {
  if (e.target.dataset && e.target.dataset.bd) return call('ovl:close');
  if (e.target.id === 'modal' && !askRes && !BR && !ANN && !$('#pend')) return closeModal();
  { const an = e.target.closest('[data-an]'); if (an && ANN && an.tagName !== 'SELECT') return annAct(an); }
  const t = e.target.closest('[data-a]'); if (!t) { const w = e.target.closest('[data-wl],[data-impman]'); return; }
  if (t.disabled) return; const f = ACT[t.dataset.a]; if (f) await f(t.dataset, t);
}));
/* champs : enregistrement automatique, sans jamais refaire la page pendant la saisie */
document.addEventListener('input', guard(async e => {
  const t = e.target, d = t.dataset;
  if (d.live) document.getElementById(d.live).textContent = t.value + (d.unit || '');
  if (t.id === 'bq' && BR) { BR.q = t.value; clearTimeout(brT); brT = setTimeout(() => brSearch(false), 350); }
  if (d.cr === 'name') CR.name = t.value;
  if (d.ovq) { OVQ = t.value; const g = $('#mgrid'); if (g) g.innerHTML = modGrid((byId(cur) || {}).client || { modules: {} }); }
  if (e.target.id === 'tgv' && false) return;
  if (d.hc === 'name') HC.name = t.value;
  if (d.ws === 'name' && WS) WS.name = t.value;
}));
document.addEventListener('change', guard(async e => {
  const t = e.target, d = t.dataset, i = t.id;
  if (d.cr === 'version') { CR.version = t.value; crLv(); }
  else if (d.cr === 'lv') CR.lv = t.value;
  else if (d.cr === 'loader') { CR.loader = t.value; crOptApply(); crModal(); crLv(); }
  else if ('crsn' in d) { snaps = t.checked; crModal(); }
  else if ('crop' in d) { CR.opt = t.checked; crOptApply(); crModal(); }
  else if (d.iset) { const v = t.type === 'range' || d.num ? +t.value : t.value; await setI({ [d.iset]: v }); if (d.iset === 'name' || d.iset === 'cat') { inst = await call('inst:list'); } flash('Enregistré ✓'); }
  else if (d.optc) { const v = +t.value; await call('opts:set', cur, { [d.optc]: d.optc === 'fov' ? (v - 70) / 40 : d.optc === 'mouseSensitivity' ? v / 200 : v / 100 }); flash('Option enregistrée ✓'); }
  else if (d.opt) { await call('opts:set', cur, { [d.opt]: t.type === 'checkbox' ? t.checked : t.value }); flash('Option enregistrée ✓'); }
  else if (d.res) { await setI({ res: { mode: $('#rmode').value, w: +$('#rw').value, h: +$('#rh').value } }); flash('Enregistré ✓'); }
  else if (d.wset) { const v = t.type === 'checkbox' ? t.checked : d.wset === 'mode' || d.wset === 'difficulty' ? +t.value : t.value; await call('world:set', cur, WM, { [d.wset]: v }); flash('Monde modifié ✓'); if (d.wset === 'name') { WM = WM; } }
  else if (d.wrule) { await call('world:set', cur, WM, { rule: { k: d.wrule, v: t.type === 'checkbox' ? t.checked : t.value } }); flash('Règle enregistrée ✓'); }
  else if ('hpm' in d) { await call('host:setprops', HID, { motd: t.value.replace(/\r?\n/g, '\\n') }); flash('Enregistré ✓ (appliqué au prochain démarrage)'); }
  else if (d.do) { const o = { keys: { ...((DEFO && DEFO.keys) || {}) } }; document.querySelectorAll('[data-do]').forEach(x => { const k = x.dataset.do; o[k] = x.type === 'checkbox' ? x.checked : +x.value; }); o.fov = (o.fov - 70) / 40; o.gamma = o.gamma / 100; o.mouseSensitivity = o.mouseSensitivity / 200; await call('defopts:set', o); DEFO = await call('defopts:get'); flash('Réglages par défaut enregistrés ✓'); }
  else if (d.cmshow) { const i = byId(cur), c = JSON.parse(JSON.stringify(i.client || { on: true, modules: {} })), m = (c.modules[d.cmshow] = c.modules[d.cmshow] || {}), all = SHOWF[d.cmshow].map(x => x[0]), now = new Set(m.show ? m.show.split(',') : all); t.checked ? now.add(d.flag) : now.delete(d.flag); if (!now.size) { t.checked = true; return flash('Garde au moins un élément.'); } m.show = all.filter(x => now.has(x)).join(','); if (m.show === all.join(',')) delete m.show; await setI({ client: c }); i.client = c; flash('Enregistré ✓'); }
  else if (d.cm) { const i = byId(cur), c = JSON.parse(JSON.stringify(i.client || { on: false, modules: {} })), m = (c.modules[d.cm] = c.modules[d.cm] || {}); m[d.f] = t.type === 'checkbox' ? t.checked : (t.type === 'range' || t.type === 'number') ? +t.value : (d.f === 'key' || d.f === 'toggle') ? t.value.toUpperCase().trim() : t.value; await setI({ client: c }); i.client = c; flash('Enregistré ✓'); if (d.f === 'scale' || d.f === 'opacity' || d.f === 'color' || d.f === 'bg') render(); }
  else if (d.fvtag) { cfg.favMods = (cfg.favMods || []).map(f => f.slug === d.fvtag ? { ...f, tags: t.value.split(',').map(x => x.trim()).filter(Boolean) } : f); await call('set:set', { favMods: cfg.favMods }); flash('Tags enregistrés ✓'); }
  else if ('zcine' in d || 'zlvl' in d) { const i = byId(cur), c = JSON.parse(JSON.stringify(i.client || { on: true, modules: {} })); c.modules = c.modules || {}; const z = (c.modules.zoom = c.modules.zoom || { on: false }); if ('zcine' in d) z.cinematic = t.value !== '0'; else z.level = +t.value; await setI({ client: c }); i.client = c; flash('Enregistré ✓'); render(); }
  else if ('hround' in d) { const i = byId(cur), c = JSON.parse(JSON.stringify(i.client || { on: true, modules: {} })); c.modules = c.modules || {}; c.modules.hud = c.modules.hud || {}; c.modules.hud.round = t.value !== '0'; await setI({ client: c }); i.client = c; flash('Enregistré ✓'); render(); }
  else if (d.set) { const v = t.type === 'number' ? +t.value : t.value; await call('set:set', { [d.set]: v }); cfg[d.set] = v; flash('Enregistré ✓'); if (d.set === 'uiLang') { document.documentElement.lang = window.UILANG = v; renderNav(); render(); trNode(document.body); } if (d.set === 'music') npPoll(); }
  else if (d.hp) { await call('host:setprops', HID, { [d.hp]: t.type === 'checkbox' ? String(t.checked) : t.value }); flash('Enregistré ✓ (appliqué au prochain démarrage)'); }
  else if (d.hmem) { await call('host:set', HID, { mem: +t.value }); flash('Enregistré ✓'); }
  else if (d.hcl) { HC[d.hcl] = t.value.split(/\r?\n/).map(x => x.trim()).filter(Boolean); }
  else if (d.hname) { await call('host:set', HID, { name: t.value }); flash('Nom enregistré ✓'); }
  else if (d.ws && WS) { WS[d.ws] = t.type === 'checkbox' ? t.checked : t.type === 'range' ? +t.value : t.value; if (d.ws === 'inst') { WS.folder = ''; await wsModal(); } }
  else if (d.hc) { HC[d.hc] = t.type === 'checkbox' ? t.checked : t.type === 'range' ? +t.value : t.value; if (d.hc === 'type' || d.hc === 'version') hostLv(); }
  else if (d.ovf) { OVF = t.value; render(); }
  else if (d.srvsort) { srvSort = t.value; render(); }
  else if (d.sinst) { try { await call('srv:meta', d.sinst, { inst: t.value }); saved = await call('srv:saved'); flash(t.value ? 'Instance par défaut enregistrée ✓' : 'Instance automatique ✓'); } catch (e) { note(e.message, 'Erreur'); } render(); }
  else if (d.brsort) { BR.sort = t.value; BSORT = t.value; BR.hits = []; BR.total = 0; brFill(); brSearch(false); }
  else if (d.catinst) { cur = t.value; BR = null; CW = ''; render(); }
  else if (d.catworld) { CW = t.value; CWSET = true; BR = null; render(); }
  else if ('acc' in d) { cfg.accent = t.value; await call('set:set', { accent: t.value }); render(); }
  else if (d.uiscale) { cfg.uiScale = +t.value / 100; const e = $('#uisv'); if (e) e.textContent = t.value + ' %'; await call('set:set', { uiScale: cfg.uiScale }); }
  else if (d.dl) { cfg.dl = +t.value; await call('set:set', { dl: cfg.dl }); flash('Enregistré ✓'); }
  else if (d.a === 'skVar') { await call('skins:variant', d.id, t.value); render(); }
  else if (i === 'mem0') { cfg.mem = +t.value; $('#rm').textContent = cfg.mem + ' Go pour les nouvelles instances'; await call('set:set', { mem: cfg.mem }); }
}));
/* barre « Édition de l’interface » : on peut la déplacer (ou la basculer en bas) pour atteindre les widgets qu’elle cache */
document.addEventListener('pointerdown', e => {
  const b = e.target.closest && e.target.closest('.edbar'); if (!b || e.target.closest('button') || e.button !== 0) return;
  e.preventDefault(); const r = b.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
  b.style.transform = 'none'; b.style.left = r.left + 'px'; b.style.top = r.top + 'px'; b.style.bottom = 'auto';
  const mv = ev => { b.style.left = Math.max(0, Math.min(innerWidth - b.offsetWidth, ev.clientX - dx)) + 'px'; b.style.top = Math.max(0, Math.min(innerHeight - b.offsetHeight, ev.clientY - dy)) + 'px'; };
  const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); };
  document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
});
document.addEventListener('change', e => { if (ANN && e.target.dataset && e.target.dataset.an === 'w') ANN.k = +e.target.value || 2; });
document.addEventListener('keydown', async e => { if (ANN && !ANN.box && !askRes && !(e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) { const k = e.key.toLowerCase(), T = { p: 'pen', a: 'arrow', r: 'rect', t: 'text' }; if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); return annUndo(); } if (!e.ctrlKey && !e.metaKey && T[k]) { e.preventDefault(); ANN.tool = T[k]; return ANN.sync(); } if (e.key === 'Escape') { e.preventDefault(); return annAct({ dataset: { an: 'close' } }); } } if (OVL && e.key === 'Escape' && ovT === 'edit') { e.preventDefault(); ACT.ovt({ v: 'modules' }); return; } if (OVL && e.key === 'Escape' && e.target.id === 'ovq') { e.target.blur(); } if (KEYCAP) { e.preventDefault(); if (e.key === 'Escape') { KEYCAP = ''; render(); return; } const m = mcKey(e.code); if (m) { const o = { ...DEFO, keys: { ...((DEFO && DEFO.keys) || {}), [KEYCAP]: m } }; KEYCAP = ''; try { await call('defopts:set', o); DEFO = await call('defopts:get'); } catch (er) { note(er.message, 'Erreur'); } render(); } return; } if (e.key === 'Enter' && e.target.id === 'tgv') { ACT.tgAdd(); return; } if (e.key === 'Enter' && e.target.id === 'hcmd') { ACT.hcmd(); return; } if (e.key === 'Escape' && !$('#modal').hidden && !askRes && !(BR && false)) { if (BR) { ACT.brClose(); } else closeModal(); } if (e.key === 'Enter' && e.target.id === 'catv') ACT.catok(); if (e.key === 'Enter' && e.target.id === 'cfq') ACT.cfsearch(); });
/* le mod a signalé une bascule faite en jeu (touche) : la case du menu Alt+H suit l'état réel */
hyd.on('client:synced', p => { const i = byId(p.id); if (!i) return; i.client = p.client; if (page === 'ovl' && ovT === 'modules' && cur === p.id) { const g = $('#mgrid'); if (g) g.innerHTML = modGrid(p.client); const e = $('#mcount'); if (e) e.textContent = `${CM.filter(x => mOn(p.client, x[0])).length} activés sur ${CM.length}`; } else if (page === 'inst' && cur === p.id) render(); });
hyd.on('client:progress', p => { const e = document.getElementById('r-hy'); if (e && e.lastChild) e.lastChild.outerHTML = `<span class="mu">${esc(p.text)} ${p.pct}%</span>`; const m = document.getElementById('mod-pct'); if (m) m.textContent = `${p.text} ${p.pct}%`; });
hyd.on('update:state', u => { const was = UPS && UPS.status; UPS = u; const e = $('#updc'); if (e) e.outerHTML = updCard(); if (u.status === 'ready' && was !== 'ready') toast('Hydarium ' + u.latest + ' est prête : installation à la fermeture.'); });
hyd.on('update:open', () => { page = 'set'; st = 'gen'; render(); }); // clic sur la notification système
hyd.on('client:state', () => { if (page === 'inst') render(); }); // fabrication du mod terminée (ou échouée) : l'état de la carte « Hydarium Client » se met à jour
hyd.on('game:progress', p => { $('#bar').style.width = (p.total ? Math.round(p.task / p.total * 100) : 0) + '%'; $('#st').textContent = p.label || `Téléchargement : ${p.type} ${p.task}/${p.total}`; });
hyd.on('game:started', () => { $('#st').textContent = 'Minecraft est lancé'; $('#bar').style.width = '100%'; refresh(); });
hyd.on('host:log', ({ id, line }) => { if (page === 'hostd' && HID === id) { const c = $('#hcon'); if (c) { c.textContent += line + '\n'; if (c.textContent.length > 60000) c.textContent = c.textContent.slice(-40000); c.scrollTop = c.scrollHeight; } } });
hyd.on('host:state', () => { hrun(); if (page === 'host' || page === 'hostd') render(); });
hyd.on('playit:state', () => { if (page === 'hostd') render(); });
hyd.on('p2p:state', () => { if (page === 'hostd') render(); });
hyd.on('game:crash', c => { c.at = Date.now(); LASTC = c; crashModal(c); });
hyd.on('game:crash-open', () => { if (LASTC) crashModal(LASTC); });
hyd.on('import:progress', p => { const t = $('#imptx'), b = $('#impb'); if (t) t.textContent = p.text; if (b) b.style.width = (p.total ? Math.round(p.done / p.total * 100) : 0) + '%'; });
hyd.on('game:close', () => { call('srv:sync').then(() => call('srv:saved')).then(x => { saved = x; }).catch(() => {}); playing = null; $('#st').textContent = 'Prêt'; $('#bar').style.width = '0'; refresh(); });

(async () => {
  document.addEventListener('click', e => { const w = e.target.closest('[data-win]'); if (w) call('win', w.dataset.win); });
  pf = await call('platform'); $('#ver').textContent = 'v' + pf.version;
  try { KLM = await navigator.keyboard.getLayoutMap(); } catch (e) {}
  cfg = await call('set:get'); snaps = !!cfg.snaps; if (!cfg.uiLang) cfg.uiLang = /^en/i.test(navigator.language) ? 'en' : 'fr'; i18nWatch(); document.documentElement.lang = window.UILANG = cfg.uiLang; acc = await call('auth:current').catch(() => null);
  inst = await call('inst:list'); saved = await call('srv:saved').catch(() => []); vers = await call('versions').catch(() => []);
  if (OVL) { document.body.classList.add('ovl'); if (QS.get('world')) { catT = 'datapack'; CW = QS.get('world'); ovT = 'content'; } if (QS.get('type') === 'resourcepack') { catT = 'resourcepack'; ovT = 'content'; } if (QS.get('addr')) ovT = 'join'; setInterval(() => call('media:get').then(t => { NP = t; const e = $('#ovnp'); if (e) e.innerHTML = ovBar(t); }).catch(() => {}), 4000); page = 'ovl'; hyd.on('ovl:page', o => { const p = typeof o === 'string' ? o : o.page; ovT = p === 'hub' ? 'modules' : p; if (o && o.addr) JADDR = o.addr; if (o && o.world) { catT = 'datapack'; CW = o.world; BR = null; } if (o && o.type === 'resourcepack') { catT = 'resourcepack'; BR = null; } render(); }); document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#modal').hidden) call('ovl:close'); }); render(); return; }
  render(); npPoll(); hrun(); if (!(await call('wiz:state'))) wiz(0); else if (!cfg.tour) setTimeout(tourStart, 700);
})();
