package net.hydarium.core;

/**
 * Niveau du zoom : il part du réglage du launcher (module « zoom », champ « level », 4 par défaut), puis la molette de la souris l'ajuste en jeu tant que le zoom est actif.
 * Le niveau actuel reste en mémoire pendant la session (éteindre puis rallumer le zoom le retrouve). Si le launcher change le réglage de départ, il est repris.
 * Aucun type Minecraft ici : testé dans CoreTest.
 */
public final class Zoom {
    public static final double MIN = 1.5, MAX = 30, DEFAULT = 4, STEP = 1.15;

    /** Reçoit chaque cran de molette (positif = vers le haut = zoom plus fort) ; renvoie vrai s'il l'a utilisé (le jeu ne change alors pas de case d'inventaire). */
    public interface Sink { boolean onScroll(double dy); }

    private double level = Double.NaN, seen = Double.NaN;

    public static double clamp(double v) { return Math.max(MIN, Math.min(MAX, v)); }

    /** Niveau actuel (facteur : le champ de vision est divisé par ce nombre). */
    public synchronized double level(Config c) {
        double cl = c.get("zoom").level;
        boolean changed = !(Double.isNaN(cl) && Double.isNaN(seen)) && cl != seen;
        if (Double.isNaN(level) || changed) { level = Double.isNaN(cl) ? DEFAULT : clamp(cl); seen = cl; }
        return level;
    }

    /** Applique des crans de molette (négatif = vers le bas) et renvoie le nouveau niveau. */
    public synchronized double scroll(Config c, double notches) {
        double l = level(c);
        level = clamp(l * Math.pow(STEP, notches));
        return level;
    }

    /** « ×4,6 » / « ×4.6 » pour le message affiché en jeu. */
    public static String label(double level, boolean en) {
        String n = String.format(java.util.Locale.ROOT, "%.1f", level);
        return (en ? "Zoom ×" : "Zoom ×") + (en ? n : n.replace('.', ','));
    }
}
