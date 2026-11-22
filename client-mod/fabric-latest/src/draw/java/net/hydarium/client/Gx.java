package net.hydarium.client;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;

import net.minecraft.client.Minecraft;

/**
 * Tout ce qui change d'une version 26.x à l'autre côté dessin et écrans, cherché PAR RÉFLEXION (le jeu n'est plus obfusqué : les noms sont fiables) :
 * le HUD ne dépend ainsi d'aucune classe ni signature du jeu à la compilation, et un renommage de Mojang ne peut plus l'empêcher de se charger.
 *  - ouverture d'un écran : Minecraft.setScreen (≤ 26.1), Gui.setScreen, setScreenAndShow (≥ 26.2) ;
 *  - écran courant : Minecraft.screen puis Gui.screen() ;
 *  - pile de transformations du dessin (pushMatrix / pushPose, translate et scale à 2 ou 3 nombres), dessin d'un objet (item / renderItem) ;
 *  - hideGui (champ ou méthode).
 * Une chose qui manque se dégrade (rien n'est dessiné, aucun plantage) ET est rapportée une fois à {@link HydariumClient#drawErr} (visible dans le launcher).
 */
final class Gx {
    private Gx() {}

    /** Rapporte la première panne (les suivantes sont ignorées : une par lancement suffit pour comprendre). */
    static void fail(String what, Throwable t) {
        Throwable c = t; while (c != null && c.getCause() != null && c.getCause() != c) c = c.getCause();
        String msg = what + (c == null ? "" : " : " + c.getClass().getSimpleName() + (c.getMessage() == null ? "" : " : " + c.getMessage()));
        HydariumClient.reportDrawError(msg);
    }

    // ---- réflexion générique ----
    static Object field(Object o, String name) {
        try { Field f = o.getClass().getField(name); return f.get(o); } catch (Throwable t) { /* pas public */ }
        try { Field f = o.getClass().getDeclaredField(name); f.setAccessible(true); return f.get(o); } catch (Throwable t) { return null; }
    }

    private static boolean accepts(Class<?> p, Object a) {
        if (a == null) return !p.isPrimitive();
        if (p.isInstance(a)) return true;
        return (p == int.class && a instanceof Integer) || (p == long.class && a instanceof Long) || (p == boolean.class && a instanceof Boolean) || (p == float.class && a instanceof Float) || (p == double.class && a instanceof Double);
    }

    /** Appelle la première méthode publique nommée {@code name} dont les paramètres acceptent {@code args} ; null si aucune. */
    static Object call(Object target, String name, Object... args) {
        try {
            for (Method m : target.getClass().getMethods()) {
                if (!m.getName().equals(name) || m.getParameterCount() != args.length) continue;
                Class<?>[] pt = m.getParameterTypes(); boolean ok = true;
                for (int i = 0; i < pt.length; i++) if (!accepts(pt[i], args[i])) { ok = false; break; }
                if (ok) return m.invoke(target, args);
            }
        } catch (Throwable t) { /* tant pis */ }
        return null;
    }

    static boolean has(Object target, String name, int params) {
        for (Method m : target.getClass().getMethods()) if (m.getName().equals(name) && m.getParameterCount() == params) return true;
        return false;
    }

    // ---- écrans ----
    /** Ouvre un écran du jeu (remplace l'écran courant), quel que soit le nom que cette version donne à la méthode. */
    static void open(Object screen) {
        Minecraft mc = Minecraft.getInstance();
        Object gui = field(mc, "gui");
        String[] names = {"setScreenAndShow", "setScreen"};
        try {
            for (Object target : new Object[] {gui, mc}) {
                if (target == null) continue;
                for (String n : names) for (Method m : target.getClass().getMethods())
                    if (m.getName().equals(n) && m.getParameterCount() == 1 && m.getParameterTypes()[0].isInstance(screen)) { m.invoke(target, screen); return; }
            }
            throw new NoSuchMethodException("setScreenAndShow / setScreen");
        } catch (Throwable t) { fail("ouverture d'un écran impossible", t); }
    }

    /** Écran actuellement ouvert, ou null. */
    static Object screen(Minecraft mc) {
        Object s = field(mc, "screen"); if (s != null) return s;
        Object gui = field(mc, "gui"); return gui == null ? null : call(gui, "screen");
    }

    /** F1 (interface cachée) ? */
    static boolean hideGui(Minecraft mc) {
        Object o = field(mc, "options"); if (o == null) return false;
        Object v = field(o, "hideGui"); if (v instanceof Boolean) return (Boolean) v;
        return Boolean.TRUE.equals(call(o, "hideGui"));
    }

    // ---- pile de transformations et objets ----
    private static Object pose(Object g) throws Exception { return g.getClass().getMethod("pose").invoke(g); }

    private static boolean call0(Object p, String... names) throws Exception {
        for (String n : names) { try { p.getClass().getMethod(n).invoke(p); return true; } catch (NoSuchMethodException e) { /* suivant */ } }
        return false;
    }

    /** Appelle p.name(a…) en 2 ou 3 nombres (float ou double), le 3ᵉ valant 0 (ou 1 pour scale). */
    private static boolean num(Object p, String name, double... a) throws Exception {
        for (Method m : p.getClass().getMethods()) {
            if (!m.getName().equals(name)) continue;
            Class<?>[] pt = m.getParameterTypes();
            if (pt.length < a.length || pt.length > a.length + 1) continue;
            boolean ok = true; for (Class<?> c : pt) if (c != float.class && c != double.class) ok = false;
            if (!ok) continue;
            Object[] v = new Object[pt.length];
            for (int i = 0; i < pt.length; i++) { double d = i < a.length ? a[i] : (name.equals("scale") ? 1 : 0); v[i] = pt[i] == float.class ? (Object) Float.valueOf((float) d) : (Object) Double.valueOf(d); }
            m.invoke(p, v); return true;
        }
        return false;
    }

    static void push(Object g, double tx, double ty, double s) {
        try { Object p = pose(g); call0(p, "pushMatrix", "pushPose"); num(p, "translate", tx, ty); num(p, "scale", s, s); } catch (Throwable t) { fail("transformations du dessin", t); }
    }

    static void pop(Object g) { try { call0(pose(g), "popMatrix", "popPose"); } catch (Throwable t) { /* déjà signalé par push */ } }

    /** Dessine un objet 16×16 (armure) : item(ItemStack, x, y) ou renderItem(ItemStack, x, y). */
    static void item(Object g, Object stack, int x, int y) {
        try {
            for (Method m : g.getClass().getMethods()) {
                Class<?>[] pt = m.getParameterTypes();
                if ((m.getName().equals("item") || m.getName().equals("renderItem")) && pt.length == 3 && pt[0].isInstance(stack) && pt[1] == int.class && pt[2] == int.class && !Modifier.isStatic(m.getModifiers())) { m.invoke(g, stack, x, y); return; }
            }
        } catch (Throwable t) { /* icône manquante : sans importance */ }
    }
}
