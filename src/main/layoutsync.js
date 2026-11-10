/* Réglages faits dans l'éditeur en jeu (position, taille, opacité, fond, couleur, éléments affichés) → configuration enregistrée de l'instance.
   Le mod est local, mais on ne fait pas confiance à son contenu : tout est revalidé et borné ici (mêmes limites que la lecture du fichier par le mod). Fonction pure, testée. */
const num = (v, a, b) => (typeof v === 'number' && isFinite(v)) ? Math.min(b, Math.max(a, v)) : null;

/* modules : { fps: {on, pos:{x,y}, scale, …}, … } (modifié sur place) ; lay : ce que le mod a envoyé ; ids : modules autorisés. Renvoie true si quelque chose a changé. */
exports.apply = (modules, lay, ids) => {
  if (!modules || !lay || typeof lay !== 'object' || Array.isArray(lay)) return false;
  let changed = false;
  for (const [k, v] of Object.entries(lay)) {
    if (!ids.includes(k) || !v || typeof v !== 'object' || Array.isArray(v)) continue;
    const m = modules[k] && typeof modules[k] === 'object' ? modules[k] : {};
    const set = (key, val) => { if (JSON.stringify(m[key]) !== JSON.stringify(val)) { m[key] = val; changed = true; modules[k] = m; } };
    if (v.pos && typeof v.pos === 'object') { const x = num(v.pos.x, 0, 1), y = num(v.pos.y, 0, 1); if (x !== null && y !== null) set('pos', { x: Math.round(x * 1e4) / 1e4, y: Math.round(y * 1e4) / 1e4 }); }
    const sc = num(v.scale, .5, 3); if (sc !== null) set('scale', Math.round(sc * 100) / 100);
    const op = num(v.opacity, .1, 1); if (op !== null) set('opacity', Math.round(op * 100) / 100);
    if (typeof v.bg === 'boolean') set('bg', v.bg);
    if (typeof v.color === 'string' && /^#[0-9a-f]{6}$/i.test(v.color)) set('color', v.color.toLowerCase());
    if (typeof v.show === 'string' && /^[a-z,]{0,40}$/.test(v.show)) set('show', v.show);
  }
  return changed;
};
