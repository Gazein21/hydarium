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

    /** Touche qui ouvre l'éditeur en jeu (disposition et réglages des widgets). Réglable : module « hudedit », champ « key » du fichier de configuration. */
    public static String editorKey(Config c) { return Features.key(c, "hudedit", "RSHIFT"); }

    /**
     * Raccourci « Alt+H » (format du launcher / d'Electron) → noms de touches de {@link Keys}, toutes à tenir ensemble : {ALT→LALT, H}.
     * Tableau vide = pas de raccourci en jeu : « off », vide, ou une touche que le jeu ne sait pas lire (Super / Meta, ou un nom inconnu).
     */
    public static String[] chord(String accel) {
        if (accel == null) return new String[0];
        String a = accel.trim(); if (a.isEmpty() || a.equalsIgnoreCase("off")) return new String[0];
        java.util.List<String> out = new java.util.ArrayList<String>();
        for (String raw : a.split("\\+")) {
            String t = raw.trim(); if (t.isEmpty()) continue;
            String u = t.toUpperCase(java.util.Locale.ROOT), k;
            if (u.equals("ALT") || u.equals("OPTION")) k = "LALT"; else if (u.equals("CTRL") || u.equals("CONTROL") || u.equals("COMMANDORCONTROL") || u.equals("CMDORCTRL")) k = "LCTRL"; else if (u.equals("SHIFT")) k = "LSHIFT";
            else if (u.equals("SUPER") || u.equals("META") || u.equals("COMMAND") || u.equals("CMD") || u.equals("ALTGR")) return new String[0];
            else if (u.equals("SPACE") || u.equals("TAB") || u.equals("ENTER") || u.equals("RETURN")) k = u.equals("RETURN") ? "ENTER" : u;
            else if (u.equals("PLUS")) k = "NUMADD"; else if (u.equals("ESC") || u.equals("ESCAPE")) return new String[0];
            else k = u;
            if (Keys.glfw(k) == 0 && Keys.mc(k) == null) return new String[0];
            out.add(k);
        }
        boolean real = false; for (String k : out) if (!k.equals("LALT") && !k.equals("LCTRL") && !k.equals("LSHIFT")) real = true;
        return real ? out.toArray(new String[0]) : new String[0];   // « Alt » tout seul ne doit jamais ouvrir le menu
    }

    /** Touches du raccourci du menu en jeu ({@link #chord}). */
    public static String[] menuChord(Config c) { return chord(c.menuKey()); }

    /** Sneak permanent : « activé » = on reste accroupi (seulement géré là où le jeu n'a pas l'option native, donc Forge 1.8.9). */
    public static boolean sneak(Config c) { return c.get("togglesneak").on; }

    /** Touche du module (lettre, F1–F12, ALT…), valeur par défaut si vide. */
    public static String key(Config c, String id, String def) { String k = c.get(id).key; return k.isEmpty() ? def : k; }
}
