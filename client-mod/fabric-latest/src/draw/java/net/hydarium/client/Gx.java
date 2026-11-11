package net.hydarium.client;

import java.lang.reflect.Field;
import java.lang.reflect.Method;

import net.minecraft.client.Minecraft;

/**
 * Tout ce qui change d'une 26.x à l'autre côté dessin et écrans, cherché par réflexion (le jeu n'est plus obfusqué : les noms sont fiables) :
 *  - 26.2 : setScreen / screen déplacés de Minecraft vers Minecraft.gui ;
 *  - pile de transformations du dessin (pushMatrix / pushPose, translate et scale à 2 ou 3 nombres) ;
 *  - dessin d'un objet (item / renderItem) ;
 *  - hideGui (champ ou méthode).
 * Une chose qui manque se dégrade (rien n'est dessiné, aucun plantage) au lieu d'empêcher le chargement du mod.
 */
final class Gx {
    private Gx() {}

    /** Ouvre un écran du jeu (remplace l'écran courant). */
    static void open(Object screen) {
        Minecraft mc = Minecraft.getInstance();
        try {
            Object gui = null; try { gui = Minecraft.class.getField("gui").get(mc); } catch (NoSuchFieldException e) { /* 26.1 et avant */ }
            if (gui != null && call1(gui, "setScreen", screen)) return;
            call1(mc, "setScreen", screen);
        } catch (Throwable t) { /* tant pis */ }
    }

    private static boolean call1(Object target, String name, Object arg) throws Exception {
        for (Method m : target.getClass().getMethods())
            if (m.getName().equals(name) && m.getParameterCount() == 1 && (arg == null || m.getParameterTypes()[0].isInstance(arg))) { m.invoke(target, arg); return true; }
        return false;
    }

    /** Écran actuellement ouvert, ou null. */
    static Object screen(Minecraft mc) {
        try {
            try { return Minecraft.class.getField("screen").get(mc); } catch (NoSuchFieldException e) { /* ≥ 26.2 */ }
            Object gui = Minecraft.class.getField("gui").get(mc); return gui.getClass().getMethod("screen").invoke(gui);
        } catch (Throwable t) { return null; }
    }

    /** F1 (interface cachée) ? */
    static boolean hideGui(Minecraft mc) {
        try {
            Object o = mc.options;
            try { Field f = o.getClass().getField("hideGui"); return f.getBoolean(o); } catch (NoSuchFieldException e) { return Boolean.TRUE.equals(o.getClass().getMethod("hideGui").invoke(o)); }
        } catch (Throwable t) { return false; }
    }

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
        try { Object p = pose(g); call0(p, "pushMatrix", "pushPose"); num(p, "translate", tx, ty); num(p, "scale", s, s); } catch (Throwable t) { /* tant pis */ }
    }

    static void pop(Object g) { try { call0(pose(g), "popMatrix", "popPose"); } catch (Throwable t) { /* tant pis */ } }

    /** Dessine un objet 16×16 (armure) : item(ItemStack, x, y) ou renderItem(ItemStack, x, y). */
    static void item(Object g, Object stack, int x, int y) {
        try {
            for (Method m : g.getClass().getMethods()) {
                Class<?>[] pt = m.getParameterTypes();
                if ((m.getName().equals("item") || m.getName().equals("renderItem")) && pt.length == 3 && pt[0].isInstance(stack) && pt[1] == int.class && pt[2] == int.class) { m.invoke(g, stack, x, y); return; }
            }
        } catch (Throwable t) { /* tant pis */ }
    }
}
