package net.hydarium.core;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Touches de bascule : une touche par module (« toggle ») + une touche globale pour masquer / afficher tout le HUD (module « hud », champ « key »). */
public final class Toggles {
    public interface Keys { boolean down(String key); }

    private final Config cfg;
    private final Map<String, Boolean> was = new HashMap<String, Boolean>();

    public Toggles(Config cfg) { this.cfg = cfg; }

    /** À appeler à chaque tick (hors menus). Renvoie les messages à afficher (« Sprint auto : activé »). */
    public List<String> poll(Keys keys) {
        List<String> msgs = new ArrayList<String>();
        boolean en = "en".equals(cfg.lang());
        String hk = cfg.get("hud").key;
        if (!hk.isEmpty() && edge("hud", keys.down(hk))) { cfg.hudHidden = !cfg.hudHidden; msgs.add(en ? (cfg.hudHidden ? "HUD hidden" : "HUD shown") : (cfg.hudHidden ? "HUD masqué" : "HUD affiché")); }
        for (String id : cfg.togglable()) {
            String k = cfg.get(id).toggle;
            if (edge(id, keys.down(k))) { boolean on = cfg.toggle(id); msgs.add(label(id, en) + " : " + (en ? (on ? "on" : "off") : (on ? "activé" : "désactivé"))); }
        }
        return msgs;
    }

    private boolean edge(String id, boolean down) { boolean prev = Boolean.TRUE.equals(was.get(id)); was.put(id, down); return down && !prev; }

    static String label(String id, boolean en) {
        String[][] n = {{"gamma", "Luminosité", "Brightness"}, {"togglesprint", "Sprint auto", "Auto-sprint"}, {"zoom", "Zoom", "Zoom"}, {"fps", "FPS", "FPS"}, {"cps", "CPS", "CPS"}, {"keystrokes", "Touches", "Keystrokes"},
            {"coords", "Coordonnées", "Coordinates"}, {"direction", "Direction", "Direction"}, {"armor", "Armure", "Armor"}, {"potions", "Effets", "Effects"}, {"ping", "Ping", "Ping"}, {"clock", "Heure", "Clock"},
            {"memory", "Mémoire", "Memory"}, {"music", "Musique", "Music"}, {"session", "Session", "Session"},
            {"autowalk", "Marche auto", "Auto-walk"}, {"togglesneak", "Sneak permanent", "Permanent sneak"}};
        for (String[] r : n) if (r[0].equals(id)) return en ? r[2] : r[1];
        return id;
    }
}
