/* Tampon de voix (src/renderer/voicebuf.js) : lecture continue malgré la gigue du réseau, reprise après une coupure, rafales jetées. */
const test = require('node:test'), assert = require('node:assert');
const VB = require('../src/renderer/voicebuf');
const FR = 0.02;
let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
/** simule n paquets de 20 ms ; arrivée = i*20 ms + gigue (l'ordre est conservé) ; renvoie les plages jouées */
function sim(jb, n, jitter, stall) {
  const played = []; let last = 0;
  for (let i = 0; i < n; i++) {
    let a = i * FR + rnd() * jitter + (stall && i >= stall.at ? stall.by : 0); a = Math.max(a, last); last = a;
    const r = jb.place(a, FR); if (r) played.push({ at: r.at, end: r.at + FR, fade: r.fade, now: a });
  }
  return played;
}
const gaps = p => p.slice(1).filter((x, i) => x.at - p[i].end > 0.0005).length;
const overlaps = p => p.slice(1).filter((x, i) => x.at < p[i].end - 0.0005).length;

test('gigue réseau jusqu’à 60 ms : lecture sans aucun trou ni superposition', () => {
  const p = sim(VB.create(), 1000, 0.06);
  assert.strictEqual(gaps(p), 0); assert.strictEqual(overlaps(p), 0); assert.strictEqual(p.filter(x => x.fade).length, 1, 'un seul fondu : au démarrage');
});
test('un seul paquet en retard de 45 ms : l’ancienne logique (marge 60 ms, reprise sous 20 ms) coupait la voix, le nouveau tampon non', () => {
  const arr = i => i * FR + (i === 30 ? 0.045 : 0);
  const old = { next: 0, cuts: 0 }; for (let i = 0; i < 100; i++) { const a = arr(i); if (old.next < a + 0.02 || old.next - a > 0.4) { if (old.next) old.cuts++; old.next = a + 0.06; } old.next += FR; }
  assert.strictEqual(old.cuts, 1, 'ancien code : une coupure audible');
  const jb = VB.create(), p = []; for (let i = 0; i < 100; i++) { const r = jb.place(arr(i), FR); if (r) p.push({ at: r.at, end: r.at + FR }); }
  assert.strictEqual(gaps(p), 0); assert.strictEqual(jb.under, 0);
});
test('coupure réseau de 300 ms : reprise avec fondu, marge agrandie, jamais deux voix superposées', () => {
  const jb = VB.create(), p = sim(jb, 400, 0.01, { at: 200, by: 0.3 });
  assert.strictEqual(jb.under, 1); assert.ok(jb.target > 0.08 && jb.target <= 0.3); assert.strictEqual(overlaps(p), 0);
  assert.strictEqual(p.filter(x => x.fade).length, 2, 'démarrage + reprise');
});
test('rafale de paquets en retard : le surplus est jeté, pas superposé', () => {
  const jb = VB.create(); let t = 0; const p = [];
  for (let i = 0; i < 5; i++) { const r = jb.place(t, FR); if (r) p.push({ at: r.at, end: r.at + FR }); t += FR; }
  for (let i = 0; i < 40; i++) { const r = jb.place(t, FR); if (r) p.push({ at: r.at, end: r.at + FR }); }   // 40 paquets d'un coup
  assert.ok(jb.drops > 0); assert.strictEqual(overlaps(p), 0); assert.ok(p[p.length - 1].end - t <= jb.target + 0.27, 'l’avance reste bornée');
});
test('connexion instable : signalée après 3 coupures en 10 s, puis oubliée', () => {
  const jb = VB.create(); jb.place(0, FR); let t = 1;
  for (let i = 0; i < 3; i++) { jb.place(t, FR); t += 1; }   // 3 trous
  assert.strictEqual(jb.unstable(t), true); assert.strictEqual(jb.unstable(t + 11), false);
});
