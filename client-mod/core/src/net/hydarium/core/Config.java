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
    /** Réglages modifiés dans l'éditeur en jeu (position, taille, opacité, fond, couleur, éléments affichés) et pas encore repris par le launcher : visibles tout de suite, signalés dans l'état (champ « lay »). */
    private final java.util.Map<String, java.util.Map<String, Object>> edits = new java.util.concurrent.ConcurrentHashMap<String, java.util.Map<String, Object>>();
    private final java.util.Map<String, Mod> bases = new java.util.concurrent.ConcurrentHashMap<String, Mod>(); // valeurs du fichier au moment de la 1re modification d'un module
    private volatile boolean frozen = false;                       // pendant un glisser : on ne signale rien (une seule écriture à la fin)
    private volatile long editorStamp = 0, editorSeen = 0;         // demandes d'ouverture de l'éditeur venues du launcher (champ « cmd.editor » du fichier)
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
        boolean first = stamp == -1; stamp = t;
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
            reconcile(fresh);
            mods = fresh;
            Object ce = Json.map(root.get("cmd")).get("editor"); if (ce instanceof Double && ((Double) ce).longValue() > editorStamp) editorStamp = ((Double) ce).longValue();
            if (first) editorSeen = editorStamp; // une demande déjà dans le fichier au démarrage date d'une partie précédente
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

    /** Un module tel que le jeu doit l'utiliser : fichier du launcher, puis bascules faites en jeu, puis réglages de l'éditeur. */
    public Mod get(String id) {
        Mod m = parse(id, mods);
        if (over.containsKey(id)) m.on = over.get(id);
        java.util.Map<String, Object> e = edits.get(id);
        if (e != null) {
            if (e.get("x") instanceof Double) m.x = (Double) e.get("x");
            if (e.get("y") instanceof Double) m.y = (Double) e.get("y");
            if (e.get("scale") instanceof Double) m.scale = (Double) e.get("scale");
            if (e.get("opacity") instanceof Double) m.opacity = (Double) e.get("opacity");
            if (e.get("bg") instanceof Boolean) m.bg = (Boolean) e.get("bg");
            if (e.get("color") instanceof Integer) m.color = (Integer) e.get("color");
            if (e.get("show") instanceof String) m.show = (String) e.get("show");
        }
        return m;
    }

    private Mod parse(String id, Map<String, Object> src) {
        Mod m = new Mod();
        for (Object[] d : DEFAULT_POS) if (d[0].equals(id)) { m.x = (Double) d[1]; m.y = (Double) d[2]; }
        Map<String, Object> c = Json.map(src.get(id));
        m.on = Boolean.TRUE.equals(c.get("on"));
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

    // ---------- éditeur en jeu ----------
    private static double rnd(double v, int dec) { double k = Math.pow(10, dec); return Math.round(v * k) / k; }

    /** Modifie un réglage d'un module depuis l'éditeur en jeu. field : x, y (fractions de l'écran), scale, opacity, bg, color (entier RVB), show. Les valeurs sont bornées comme à la lecture du fichier. */
    public void edit(String id, String field, Object value) {
        java.util.Map<String, Object> e = edits.get(id);
        if (e == null) { e = new java.util.concurrent.ConcurrentHashMap<String, Object>(); bases.put(id, parse(id, mods)); edits.put(id, e); }
        if ("x".equals(field) || "y".equals(field)) e.put(field, rnd(clamp(((Number) value).doubleValue(), 0, 1), 4));
        else if ("scale".equals(field)) e.put(field, rnd(clamp(((Number) value).doubleValue(), .5, 3), 2));
        else if ("opacity".equals(field)) e.put(field, rnd(clamp(((Number) value).doubleValue(), .1, 1), 2));
        else if ("bg".equals(field)) e.put(field, Boolean.valueOf(Boolean.TRUE.equals(value)));
        else if ("color".equals(field)) e.put(field, Integer.valueOf(((Number) value).intValue() & 0xFFFFFF));
        else if ("show".equals(field)) e.put(field, String.valueOf(value).toLowerCase().replaceAll("[^a-z,]", ""));
    }

    /** Interrupteur actionné depuis l'éditeur (même circuit que la touche de bascule : le launcher le reprend). */
    public void setOn(String id, boolean on) { over.put(id, on); }

    /** Position, taille, opacité, fond, couleur et éléments affichés d'origine (ceux d'un module jamais réglé). */
    public void resetEdit(String id) {
        Mod d = new Mod(); for (Object[] p : DEFAULT_POS) if (p[0].equals(id)) { d.x = (Double) p[1]; d.y = (Double) p[2]; }
        edit(id, "x", d.x); edit(id, "y", d.y); edit(id, "scale", 1.0); edit(id, "opacity", 1.0); edit(id, "bg", Boolean.TRUE); edit(id, "color", 0xFFFFFF); edit(id, "show", "");
    }

    /** Pendant un glisser : rien n'est signalé au launcher (une seule écriture, à la fin). */
    public void freeze(boolean f) { frozen = f; }

    /** Réglages de l'éditeur à signaler au launcher, au format de la configuration : {"fps":{"pos":{"x":..,"y":..},"scale":1.2,"opacity":0.9,"bg":true,"color":"#ffff55","show":"icon,name"}}. */
    public String layoutJson() {
        if (frozen || edits.isEmpty()) return "{}";
        StringBuilder b = new StringBuilder("{"); boolean first = true;
        for (java.util.Map.Entry<String, java.util.Map<String, Object>> en : edits.entrySet()) {
            java.util.Map<String, Object> e = en.getValue(); Mod m = get(en.getKey());
            b.append(first ? "" : ",").append(Json.quote(en.getKey())).append(":{"); first = false; boolean f = true;
            if (e.containsKey("x") || e.containsKey("y")) { b.append("\"pos\":{\"x\":").append(m.x).append(",\"y\":").append(m.y).append('}'); f = false; }
            if (e.containsKey("scale")) { b.append(f ? "" : ",").append("\"scale\":").append(m.scale); f = false; }
            if (e.containsKey("opacity")) { b.append(f ? "" : ",").append("\"opacity\":").append(m.opacity); f = false; }
            if (e.containsKey("bg")) { b.append(f ? "" : ",").append("\"bg\":").append(m.bg); f = false; }
            if (e.containsKey("color")) { b.append(f ? "" : ",").append("\"color\":").append(Json.quote(String.format("#%06x", m.color))); f = false; }
            if (e.containsKey("show")) { b.append(f ? "" : ",").append("\"show\":").append(Json.quote(m.show)); }
            b.append('}');
        }
        return b.append('}').toString();
    }

    /** Le launcher a répercuté un réglage dans le fichier : on le garde et on oublie le nôtre ; si le launcher a lui-même changé le module à autre chose, c'est lui qui gagne. */
    private void reconcile(Map<String, Object> fresh) {
        for (String id : new java.util.ArrayList<String>(edits.keySet())) {
            java.util.Map<String, Object> e = edits.get(id); Mod f = parse(id, fresh), base = bases.get(id); boolean all = true, moved = false;
            for (String k : e.keySet()) { all &= same(k, e, f); if (base != null && !same(k, base, f)) moved = true; }
            if (all || moved) { edits.remove(id); bases.remove(id); }
        }
    }
    private static boolean same(String k, java.util.Map<String, Object> e, Mod f) { return same2(k, e.get(k), f); }
    private static boolean same(String k, Mod b, Mod f) {
        Object v = "x".equals(k) ? (Object) b.x : "y".equals(k) ? (Object) b.y : "scale".equals(k) ? (Object) b.scale : "opacity".equals(k) ? (Object) b.opacity : "bg".equals(k) ? (Object) b.bg : "color".equals(k) ? (Object) b.color : (Object) b.show;
        return same2(k, v, f);
    }
    private static boolean same2(String k, Object v, Mod f) {
        if ("x".equals(k)) return Math.abs((Double) v - f.x) < .0006; if ("y".equals(k)) return Math.abs((Double) v - f.y) < .0006;
        if ("scale".equals(k)) return Math.abs((Double) v - f.scale) < .006; if ("opacity".equals(k)) return Math.abs((Double) v - f.opacity) < .006;
        if ("bg".equals(k)) return ((Boolean) v) == f.bg; if ("color".equals(k)) return ((Integer) v) == f.color;
        return String.valueOf(v).equals(f.show);
    }

    /** Le launcher demande d'ouvrir l'éditeur en jeu (« Modifier en jeu » dans sa page du mode client). */
    public boolean editorRequested() { return editorStamp > editorSeen; }
    public void ackEditor() { editorSeen = editorStamp; }

    public static int parseColor(String s, int def) {
        if (s == null || !s.matches("#[0-9a-fA-F]{6}")) return def;
        return Integer.parseInt(s.substring(1), 16);
    }

    static double clamp(double v, double a, double b) { return Math.max(a, Math.min(b, v)); }
}
