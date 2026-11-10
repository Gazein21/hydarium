package net.hydarium.core;

/** Réglages des fonctions qui ne dessinent rien : luminosité (vision nocturne), zoom, sprint automatique. */
public final class Features {
    private Features() {}

    /** Luminosité = effet « Vision nocturne » : vrai tant que le module est actif (Fabric 1.20.1 / 1.21 / récentes : effet posé côté client, sans icône ni particules). */

    public static boolean nightVision(Config c) { return c.get("gamma").on; }


    /** Luminosité en niveaux de gamma (1 = normal… 15 = très lumineux), ou NaN si le module est éteint : utilisé seulement par le mod 1.8.9, où le jeu accepte un gamma > 1. */
    public static double gamma(Config c) {
        Config.Mod m = c.get("gamma");
        if (!m.on) return Double.NaN;
        double lvl = Double.isNaN(m.level) ? 10 : m.level;
        return Math.max(1, Math.min(15, lvl));
    }

    /** Facteur de zoom de DÉPART (le champ de vision est divisé par ce nombre) ; 0 = zoom éteint. Le niveau en cours, modifié à la molette, est celui de {@link Zoom#level}. */
    public static double zoom(Config c) { Config.Mod m = c.get("zoom"); return !m.on ? 0 : Double.isNaN(m.level) ? Zoom.DEFAULT : Zoom.clamp(m.level); }

    /** Caméra cinématique pendant le zoom (activée par défaut ; « cinematic »: false dans la configuration l'éteint). */
    public static boolean cinematic(Config c) { return c.get("zoom").cinematic; }

    /** Marche automatique : module disponible (la touche la lance / l'arrête en jeu). */
    public static boolean walk(Config c) { return c.get("autowalk").on; }

    public static boolean sprint(Config c) { return c.get("togglesprint").on; }

    /** Sneak permanent : « activé » = on reste accroupi (seulement géré là où le jeu n'a pas l'option native, donc Forge 1.8.9). */
    public static boolean sneak(Config c) { return c.get("togglesneak").on; }

    /** Touche du module (lettre, F1–F12, ALT…), valeur par défaut si vide. */
    public static String key(Config c, String id, String def) { String k = c.get(id).key; return k.isEmpty() ? def : k; }
}
