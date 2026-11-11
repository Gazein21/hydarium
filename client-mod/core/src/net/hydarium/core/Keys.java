package net.hydarium.core;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Noms de touches du launcher → code de chaque version du jeu. Le launcher enregistre la touche PHYSIQUE réellement pressée (KeyboardEvent.code, majuscules) :
 * A–Z, 0–9, F1–F24, UP DOWN LEFT RIGHT, SPACE ENTER TAB BACKSPACE INSERT DELETE HOME END PAGEUP PAGEDOWN CAPS, LALT RALT LCTRL RCTRL LSHIFT RSHIFT,
 * NUM0–NUM9, GRAVE MINUS EQUALS COMMA PERIOD SLASH SEMICOLON APOSTROPHE LBRACKET RBRACKET BACKSLASH. « ALT », « CTRL » et « SHIFT » seuls valent la touche gauche.
 * (GLFW et le jeu numérotent les touches par position sur un clavier américain, comme KeyboardEvent.code : AZERTY et QWERTZ fonctionnent donc sans traduction.)
 */
public final class Keys {
    private Keys() {}

    private static final Map<String, Integer> GLFW = new HashMap<String, Integer>();
    private static final Map<String, String> MC = new HashMap<String, String>(), LWJGL2 = new HashMap<String, String>();

    private static void def(String n, int glfw, String mc, String lwjgl2) { GLFW.put(n, glfw); MC.put(n, mc); LWJGL2.put(n, lwjgl2); }

    static {
        def("SPACE", 32, "key.keyboard.space", "SPACE"); def("ENTER", 257, "key.keyboard.enter", "RETURN"); def("TAB", 258, "key.keyboard.tab", "TAB"); def("BACKSPACE", 259, "key.keyboard.backspace", "BACK");
        def("INSERT", 260, "key.keyboard.insert", "INSERT"); def("DELETE", 261, "key.keyboard.delete", "DELETE"); def("RIGHT", 262, "key.keyboard.right", "RIGHT"); def("LEFT", 263, "key.keyboard.left", "LEFT");
        def("DOWN", 264, "key.keyboard.down", "DOWN"); def("UP", 265, "key.keyboard.up", "UP"); def("PAGEUP", 266, "key.keyboard.page.up", "PRIOR"); def("PAGEDOWN", 267, "key.keyboard.page.down", "NEXT");
        def("HOME", 268, "key.keyboard.home", "HOME"); def("END", 269, "key.keyboard.end", "END"); def("CAPS", 280, "key.keyboard.caps.lock", "CAPITAL");
        def("LSHIFT", 340, "key.keyboard.left.shift", "LSHIFT"); def("LCTRL", 341, "key.keyboard.left.control", "LCONTROL"); def("LALT", 342, "key.keyboard.left.alt", "LMENU");
        def("RSHIFT", 344, "key.keyboard.right.shift", "RSHIFT"); def("RCTRL", 345, "key.keyboard.right.control", "RCONTROL"); def("RALT", 346, "key.keyboard.right.alt", "RMENU");
        def("GRAVE", 96, "key.keyboard.grave.accent", "GRAVE"); def("MINUS", 45, "key.keyboard.minus", "MINUS"); def("EQUALS", 61, "key.keyboard.equal", "EQUALS"); def("COMMA", 44, "key.keyboard.comma", "COMMA");
        def("PERIOD", 46, "key.keyboard.period", "PERIOD"); def("SLASH", 47, "key.keyboard.slash", "SLASH"); def("SEMICOLON", 59, "key.keyboard.semicolon", "SEMICOLON"); def("APOSTROPHE", 39, "key.keyboard.apostrophe", "APOSTROPHE");
        def("LBRACKET", 91, "key.keyboard.left.bracket", "LBRACKET"); def("RBRACKET", 93, "key.keyboard.right.bracket", "RBRACKET"); def("BACKSLASH", 92, "key.keyboard.backslash", "BACKSLASH");
        for (int i = 0; i <= 9; i++) { def("NUM" + i, 320 + i, "key.keyboard.keypad." + i, "NUMPAD" + i); }
        def("NUMADD", 334, "key.keyboard.keypad.add", "ADD"); def("NUMSUB", 333, "key.keyboard.keypad.subtract", "SUBTRACT");
    }

    /** Nom canonique (majuscules, alias ALT/CTRL/SHIFT résolus), ou « » si vide. */
    public static String canon(String k) {
        if (k == null) return "";
        k = k.trim().toUpperCase(Locale.ROOT);
        if (k.equals("ALT")) return "LALT"; if (k.equals("CTRL") || k.equals("CONTROL")) return "LCTRL"; if (k.equals("SHIFT")) return "LSHIFT";
        if (k.equals("ESC") || k.equals("ESCAPE")) return "";                                   // Échap ferme les menus : jamais une touche de widget
        return k;
    }

    /** Code GLFW (1.20.1) ; 0 = touche inconnue. */
    public static int glfw(String name) {
        String k = canon(name); if (k.isEmpty()) return 0;
        if (k.length() == 1) { char c = k.charAt(0); if (c >= 'A' && c <= 'Z') return 65 + (c - 'A'); if (c >= '0' && c <= '9') return 48 + (c - '0'); }
        if (k.matches("F([1-9]|1[0-9]|2[0-5])")) return 290 + Integer.parseInt(k.substring(1)) - 1;
        Integer v = GLFW.get(k); return v == null ? 0 : v;
    }

    /** Nom de touche du jeu récent (« key.keyboard.up »), ou null. */
    public static String mc(String name) {
        String k = canon(name); if (k.isEmpty()) return null;
        if (k.length() == 1 && Character.isLetterOrDigit(k.charAt(0))) return "key.keyboard." + k.toLowerCase(Locale.ROOT);
        if (k.matches("F([1-9]|1[0-9]|2[0-5])")) return "key.keyboard." + k.toLowerCase(Locale.ROOT);
        return MC.get(k);
    }

    /** Nom LWJGL 2 (Minecraft 1.8.9 : Keyboard.getKeyIndex), ou null. */
    public static String lwjgl2(String name) {
        String k = canon(name); if (k.isEmpty()) return null;
        if (k.length() == 1 && Character.isLetterOrDigit(k.charAt(0))) return k;
        if (k.matches("F([1-9]|1[0-9]|2[0-5])")) return k;
        return LWJGL2.get(k);
    }
}
