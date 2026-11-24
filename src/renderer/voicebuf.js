/* Tampon de réception de la voix : décide QUAND jouer chaque paquet décodé.
   - paquets à l'heure : ils s'enchaînent sans le moindre trou (lecture continue, voix naturelle) ;
   - audio épuisé (réseau en retard) : on repart avec une marge plus grande, qui s'adapte au réseau (80 → 300 ms) ;
   - retard accumulé (rafale de paquets) : on jette le surplus au lieu de superposer deux voix.
   Aucune dépendance : utilisable dans l'interface (window.VoiceBuf) et dans les tests (require). */
(function (root) {
  function create(o) {
    o = o || {};
    const max = o.max || 0.3, step = o.step || 0.04, S = { next: 0, target: o.start || 0.08, under: 0, drops: 0, recent: [] };
    /** now : horloge audio (s) ; dur : durée du paquet (s). Renvoie { at, fade } ou null (paquet à jeter). */
    S.place = (now, dur) => {
      let fade = false;
      if (S.next === 0 || S.next < now + 0.004) {   // plus rien à jouer : on repart (avec un fondu pour éviter le « clic »)
        if (S.next !== 0) { S.under++; S.recent.push(now); S.target = Math.min(max, S.target + step); }
        S.next = now + S.target; fade = true;
      } else if (S.next - now > S.target + 0.25) { S.drops++; return null; }   // trop d'avance : on laisse l'audio « se vider »
      const at = S.next; S.next += dur;
      return { at, fade };
    };
    /** connexion instable : au moins 3 coupures sur les 10 dernières secondes */
    S.unstable = now => { S.recent = S.recent.filter(t => now - t < 10); return S.recent.length >= 3; };
    return S;
  }
  const api = { create };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.VoiceBuf = api;
})(typeof window !== 'undefined' ? window : globalThis);
