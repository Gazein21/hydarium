package net.hydarium.core;

import java.util.ArrayList;
import java.util.List;

/** Transforme (configuration + état du jeu) en widgets à dessiner. Identique sur toutes les versions : seul le dessin change. */
public final class Hud {
    private static final String[] DIR_FR = {"S", "SO", "O", "NO", "N", "NE", "E", "SE"}, DIR_EN = {"S", "SW", "W", "NW", "N", "NE", "E", "SE"};
    private static final String[] ARM_FR = {"Casque", "Plastron", "Jambières", "Bottes"}, ARM_EN = {"Helmet", "Chestplate", "Leggings", "Boots"};

    /** Modules dessinés par le mod lui-même (les autres restent au HUD externe du launcher). */
    public static final String[] ALL = {"fps", "cps", "keystrokes", "coords", "direction", "armor", "potions", "ping", "clock", "memory", "music", "session"};

    private Hud() {}

    public static List<Widget> build(Config cfg, State s) { return build(cfg, s, false); }

    /** Pour l'éditeur en jeu : tous les modules actifs, même sans rien à afficher (contenu d'exemple, widget « ghost »), et même si le HUD est masqué. */
    public static List<Widget> buildEdit(Config cfg, State s) { return build(cfg, s, true); }

    private static List<Widget> build(Config cfg, State s, boolean edit) {
        List<Widget> out = new ArrayList<Widget>();
        if (s == null || (!edit && (!s.inWorld || cfg.hudHidden))) return out;
        boolean en = "en".equals(cfg.lang());
        for (String id : ALL) {
            Config.Mod m = cfg.get(id);
            if (!m.on) continue;
            Widget w = new Widget();
            w.id = id; w.x = m.x; w.y = m.y; w.scale = m.scale; w.opacity = m.opacity; w.color = m.color; w.bg = m.bg;
            if ("keystrokes".equals(id)) w.keys = true;
            else if (!fill(w, id, m, s, en)) {
                if (!edit) continue;
                w.lines.clear(); w.lc.clear(); w.icons = false; w.sub = -1; w.maxWidth = 0; w.keep = 0; sample(w, id, m, en); w.ghost = true;
            }
            out.add(w);
        }
        return out;
    }

    private static boolean fill(Widget w, String id, Config.Mod m, State s, boolean en) {
        List<String> l = w.lines;
        if ("fps".equals(id)) l.add(s.fps + " FPS");
        else if ("cps".equals(id)) l.add(s.cpsL + " | " + s.cpsR + " CPS");
        else if ("coords".equals(id)) l.add("XYZ " + (int) Math.floor(s.x) + " / " + (int) Math.floor(s.y) + " / " + (int) Math.floor(s.z));
        else if ("direction".equals(id)) l.add(compass(s.yaw, en) + " · " + Math.round(norm(s.yaw)) + "°");
        else if ("ping".equals(id)) l.add(s.ping < 0 ? (en ? "Ping: -" : "Ping : —") : s.ping + " ms");
        else if ("clock".equals(id)) { if (s.clock.isEmpty()) return false; l.add(s.clock); }
        else if ("memory".equals(id)) l.add(mem(s.memUsedGb, s.memMaxGb, en)); // « 4,5 / 16 Go », ou « 612 Mo / 4 Go » sous 1 Go (jamais de « 0,6 »)
        else if ("session".equals(id)) l.add((en ? "Session " : "Session ") + mmss(s.sessionSecs));
        else if ("music".equals(id)) { if (s.music.isEmpty()) return false; String pre = s.musicPlaying ? "> " : "|| ", t = s.music, ar = ""; int nl = t.indexOf('\n'); if (nl >= 0) { ar = t.substring(nl + 1).trim(); t = t.substring(0, nl); } // « titre \n artiste »
            if (ar.codePointCount(0, ar.length()) > 30) ar = ar.substring(0, ar.offsetByCodePoints(0, 29)) + "…";
            l.add(pre + t); if (!ar.isEmpty()) { l.add(ar); w.sub = 1; } w.maxWidth = 120; w.keep = pre.length(); }
        else if ("armor".equals(id)) {
            String[] names = en ? ARM_EN : ARM_FR; boolean nm = m.has("name"), pc = m.has("pct") && m.durability;
            for (int k = 0; k < 4; k++) {
                State.Armor a = s.armor[k]; if (a == null) continue;
                String t = (nm ? names[k] : "") + (pc && a.pct >= 0 ? (nm ? " " : "") + a.pct + " %" : "");
                if (t.isEmpty() && !m.has("icon")) continue;
                l.add(t); w.lc.add(a.pct >= 0 ? durColor(a.pct) : 0);
            }
            if (l.isEmpty()) return false;
            w.icons = m.has("icon");
        } else if ("potions".equals(id)) {
            boolean nm = m.has("name"), lv = m.has("lvl"), tm = m.has("time");
            for (State.Fx e : s.fx) {
                StringBuilder b = new StringBuilder(); if (nm) b.append(e.name); if (lv) b.append(b.length() > 0 ? " " : "").append(roman(e.amp + 1)); if (tm) b.append(b.length() > 0 ? " · " : "").append(mmss(e.ticks / 20));
                if (b.length() == 0 && !m.has("icon")) continue;
                l.add(b.toString());
            }
            if (l.isEmpty()) return false;
            w.icons = m.has("icon");
        } else return false;
        return true;
    }

    /** Contenu d'exemple d'un module actif qui n'a rien à montrer pour l'instant (pas de musique, pas d'armure, pas d'effet…) : l'éditeur peut le placer. */
    private static void sample(Widget w, String id, Config.Mod m, boolean en) {
        List<String> l = w.lines;
        if ("clock".equals(id)) l.add("12:34");
        else if ("music".equals(id)) { l.add("> " + (en ? "Song title" : "Titre du morceau")); l.add(en ? "Artist" : "Artiste"); w.sub = 1; w.maxWidth = 120; w.keep = 2; }
        else if ("armor".equals(id)) {
            String[] names = en ? ARM_EN : ARM_FR; boolean nm = m.has("name"), pc = m.has("pct") && m.durability;
            for (int k = 0; k < 4; k++) { String t = (nm ? names[k] : "") + (pc ? (nm ? " " : "") + "100 %" : ""); l.add(t.isEmpty() ? names[k] : t); w.lc.add(durColor(100)); }
        }
        else if ("potions".equals(id)) l.add((en ? "Speed II" : "Vitesse II") + " · 1:30");
        else l.add(id);
    }

    /** Couleur (RVB) d'une pièce d'armure selon sa durabilité restante : blanc à 100 %, puis vert, jaune, orange, rouge. */
    public static int durColor(int pct) { return pct >= 100 ? 0xFFFFFF : pct >= 75 ? 0x55FF55 : pct >= 50 ? 0xFFFF55 : pct >= 25 ? 0xFFAA00 : 0xFF5555; }

    public static double norm(double yaw) { double y = yaw % 360; return y < 0 ? y + 360 : y; }

    /** Minecraft : yaw 0 = sud, 90 = ouest, 180 = nord, 270 = est. */
    public static String compass(double yaw, boolean en) { return (en ? DIR_EN : DIR_FR)[(int) Math.round(norm(yaw) / 45) % 8]; }

    /** Go avec {@code dec} décimale(s) : « 4,5 » en français, « 4.5 » en anglais. Arrondi puis découpage en entiers : la partie entière est toujours écrite. */
    public static String gb(double v, boolean en, int dec) {
        if (Double.isNaN(v) || v < 0) v = 0;
        if (dec <= 0) return String.valueOf(Math.round(v));
        long t = Math.round(v * 10);
        return (t / 10) + (en ? "." : ",") + (t % 10);
    }

    /** Mémoire du jeu : « 4,5 / 16 Go » ; en dessous de 1 Go utilisé, en Mo (« 612 Mo / 4 Go ») plutôt qu'un « 0,6 » trompeur. */
    public static String mem(double usedGb, double maxGb, boolean en) {
        if (Double.isNaN(usedGb) || usedGb < 0) usedGb = 0;
        String unit = en ? "GB" : "Go", mb = en ? "MB" : "Mo";
        if (usedGb < 1) return Math.round(usedGb * 1024) + " " + mb + " / " + gb(maxGb, en, 0) + " " + unit;
        return gb(usedGb, en, 1) + " / " + gb(maxGb, en, 0) + " " + unit;
    }

    public static String mmss(long secs) { return (secs / 60) + ":" + (secs % 60 < 10 ? "0" : "") + (secs % 60); }

    static String roman(int n) { String[] r = {"", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"}; return n >= 0 && n < r.length ? r[n] : String.valueOf(n); }
}
