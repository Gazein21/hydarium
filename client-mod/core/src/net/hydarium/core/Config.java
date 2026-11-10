package net.hydarium.core;

import java.io.File;
import java.io.IOException;
import java.nio.charset.Charset;
import java.nio.file.Files;
import java.util.Map;

/** Configuration écrite par le launcher (config/hydarium-client.json). Relue automatiquement quand le fichier change. */
public final class Config {
    /** Un module : interrupteur, position (fraction de l'écran), échelle, opacité, couleur… Valeurs par défaut = celles du HUD du launcher. */
    public static final class Mod {
        public boolean on;
        public double x, y, scale = 1, opacity = 1, level = Double.NaN;
        public int color = 0xFFFFFF;
        public boolean bg = true;
        public String key = "", toggle = "", del = "", layout = "auto"; // key : touche principale (zoom…) ; toggle : touche qui active / désactive le module en jeu
        public boolean durability = true;
        /** Zoom : caméra cinématique (mouvements de souris adoucis) pendant le zoom. */
        public boolean cinematic = true;
        /** Éléments affichés d'un widget à plusieurs parties, séparés par des virgules (armure : icon, name, pct ; effets : icon, name, lvl, time). Vide = tout. */
        public String show = "";
        public boolean has(String flag) { return show.isEmpty() || (("," + show + ",").contains("," + flag + ",")); }
    }

    private static final Object[][] DEFAULT_POS = {
        {"fps", .01, .02}, {"cps", .01, .09}, {"keystrokes", .01, .42}, {"coords", .38, .02}, {"direction", .38, .09}, {"armor", .84, .42},
        {"potions", .84, .02}, {"ping", .16, .02}, {"clock", .16, .09}, {"memory", .27, .02}, {"music", .36, .9}, {"session", .27, .09}
    };

    private final File file;
    private long stamp = -1;
    private Map<String, Object> mods = Json.map(null);
    private volatile String lang = "fr";
    private final java.util.Map<String, Boolean> over = new java.util.concurrent.ConcurrentHashMap<String, Boolean>(); // interrupteurs actionnés en jeu
    private final java.util.Map<String, Boolean> reported = new java.util.concurrent.ConcurrentHashMap<String, Boolean>(); // dernière valeur signalée au launcher pour chaque interrupteur
    /** Touche « masquer / afficher tout le HUD » (module spécial « hud »), et son état. */
    public volatile boolean hudHidden = false;

    public Config(String path) { this.file = path == null || path.isEmpty() ? null : new File(path); }

    public String lang() { return lang; }

    /** Style des cases du HUD (module spécial « hud », champ « round ») : coins légèrement arrondis par défaut, carrés (comme en 1.8.9) si « round » vaut false. */
    public boolean round() { return !Boolean.FALSE.equals(Json.map(mods.get("hud")).get("round")); }

    /** À appeler de temps en temps (une fois par seconde suffit) : recharge si le fichier a changé. */
    public void poll() {
        if (file == null) return;
        long t = file.lastModified();
        if (t == stamp) return;
        stamp = t;
        try {
            String txt = new String(Files.readAllBytes(file.toPath()), Charset.forName("UTF-8"));
            Map<String, Object> root = Json.map(Json.parse(txt));
            Map<String, Object> fresh = Json.map(root.get("modules"));
            /* le launcher a changé l'état d'un module (menu Alt+H) : ce choix l'emporte sur une bascule faite en jeu avec la touche ; sans ça, un module touché une fois au clavier ne répondait plus au menu */
            for (String id : new java.util.ArrayList<String>(over.keySet())) {
                boolean was = Boolean.TRUE.equals(Json.map(mods.get(id)).get("on")), now = Boolean.TRUE.equals(Json.map(fresh.get(id)).get("on"));
                if (was == now) continue;
                Boolean rep = reported.get(id), mine = over.get(id);
                /* Le launcher répercute dans le fichier les bascules faites en jeu (pour que la case du menu Alt+H suive). Ce fichier peut donc arriver avec la valeur d'une bascule PLUS ANCIENNE que la dernière faite
                   en jeu (touche pressée deux fois en moins d'une seconde) : ce n'est pas un choix de la personne, la bascule la plus récente reste. */
                if (rep != null && mine != null && rep.booleanValue() == now && mine.booleanValue() != now) continue;
                over.remove(id);
            }
            mods = fresh;
            Object l = root.get("lang");
            if ("en".equals(l) || "fr".equals(l)) lang = (String) l;
        } catch (IOException e) { /* fichier absent : on garde l'ancienne configuration */
        } catch (RuntimeException e) { /* JSON invalide : idem */ }
    }

    /** Bascule un module (touche « toggle ») et renvoie son nouvel état. Relancer le jeu repart de la configuration du launcher. */
    public boolean toggle(String id) { boolean now = !get(id).on; over.put(id, now); return now; }

    /** Interrupteurs actionnés en jeu et pas encore repris par le launcher ; renvoyés dans l'état envoyé au launcher, qui les inscrit dans la configuration (la case du menu Alt+H suit alors le jeu). */
    public java.util.Map<String, Boolean> overrides() { java.util.Map<String, Boolean> m = new java.util.HashMap<String, Boolean>(over); reported.clear(); reported.putAll(m); return m; }

    /** Modules réglés depuis le launcher qui ont une touche de bascule. */
    public java.util.List<String> togglable() {
        java.util.List<String> l = new java.util.ArrayList<String>();
        for (String id : mods.keySet()) if (!get(id).toggle.isEmpty()) l.add(id);
        return l;
    }

    public Mod get(String id) {
        Mod m = new Mod();
        for (Object[] d : DEFAULT_POS) if (d[0].equals(id)) { m.x = (Double) d[1]; m.y = (Double) d[2]; }
        Map<String, Object> c = Json.map(mods.get(id));
        m.on = over.containsKey(id) ? over.get(id) : Boolean.TRUE.equals(c.get("on"));
        Map<String, Object> p = Json.map(c.get("pos"));
        if (p.get("x") instanceof Double) m.x = clamp((Double) p.get("x"), 0, 1);
        if (p.get("y") instanceof Double) m.y = clamp((Double) p.get("y"), 0, 1);
        if (c.get("scale") instanceof Double) m.scale = clamp((Double) c.get("scale"), .5, 3);
        if (c.get("opacity") instanceof Double) m.opacity = clamp((Double) c.get("opacity"), .1, 1);
        if (c.get("level") instanceof Double) m.level = (Double) c.get("level");
        if (c.get("color") instanceof String) m.color = parseColor((String) c.get("color"), 0xFFFFFF);
        if (Boolean.FALSE.equals(c.get("bg"))) m.bg = false;
        if (c.get("key") instanceof String) m.key = ((String) c.get("key")).toUpperCase();
        if (c.get("toggle") instanceof String) m.toggle = ((String) c.get("toggle")).toUpperCase();
        if (c.get("del") instanceof String) m.del = ((String) c.get("del")).toUpperCase();
        if (c.get("show") instanceof String) m.show = ((String) c.get("show")).toLowerCase().replaceAll("[^a-z,]", "");
        if (c.get("layout") instanceof String) m.layout = (String) c.get("layout");
        if (Boolean.FALSE.equals(c.get("durability"))) m.durability = false;
        if (Boolean.FALSE.equals(c.get("cinematic"))) m.cinematic = false;
        return m;
    }

    public static int parseColor(String s, int def) {
        if (s == null || !s.matches("#[0-9a-fA-F]{6}")) return def;
        return Integer.parseInt(s.substring(1), 16);
    }

    static double clamp(double v, double a, double b) { return Math.max(a, Math.min(b, v)); }
}
