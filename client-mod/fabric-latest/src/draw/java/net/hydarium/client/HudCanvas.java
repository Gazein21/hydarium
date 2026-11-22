package net.hydarium.client;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;

import net.minecraft.client.Minecraft;

import net.hydarium.core.Canvas;

/**
 * Surface de dessin du cœur sur Minecraft 26.x : HUD (Draw), éditeur (HudScreen) et menu (MenuScreen).
 * Le dessinateur du jeu (GuiGraphicsExtractor depuis la 26.1 ; GuiGraphics avant) est reçu comme un simple Object et piloté par réflexion :
 * on cherche UNE fois par version fill(int×5) et text(police, texte, x, y, couleur, ombre) quel que soit leur nom (« text », « drawString »…).
 */
final class HudCanvas implements Canvas {
    private static Method FILL, TEXT; private static int TEXT_ARGS; private static Class<?> FOUND_FOR;

    private final Object g; private final Object font; private final int W, H;

    /** @throws IllegalStateException si l'API de dessin de cette version est introuvable (rapporté au launcher, le HUD du launcher reprend le relais) */
    HudCanvas(Object g) {
        this.g = g; Minecraft mc = Minecraft.getInstance(); font = Gx.field(mc, "font");
        Object win = Gx.call(mc, "getWindow");
        W = win == null ? 0 : asInt(Gx.call(win, "getGuiScaledWidth")); H = win == null ? 0 : asInt(Gx.call(win, "getGuiScaledHeight"));
        bind(g.getClass(), font);
    }

    private static int asInt(Object o) { return o instanceof Number ? ((Number) o).intValue() : 0; }

    private static synchronized void bind(Class<?> c, Object font) {
        if (FOUND_FOR == c) return;
        Method fill = null, text = null; int args = 0;
        for (Method m : c.getMethods()) {
            Class<?>[] p = m.getParameterTypes(); String n = m.getName();
            if (n.equals("fill") && p.length == 5 && p[0] == int.class && p[1] == int.class && p[2] == int.class && p[3] == int.class && p[4] == int.class) fill = m;
            if ((n.equals("text") || n.equals("drawString")) && font != null && p.length >= 5 && p[0].isInstance(font) && p[1] == String.class && p[2] == int.class && p[3] == int.class && p[4] == int.class
                    && (p.length == 5 || (p.length == 6 && p[5] == boolean.class)) && (text == null || p.length > args)) { text = m; args = p.length; }
        }
        if (fill == null || text == null) throw new IllegalStateException("API de dessin introuvable (fill : " + (fill != null) + ", text : " + (text != null) + ") sur " + c.getName());
        FILL = fill; TEXT = text; TEXT_ARGS = args; FOUND_FOR = c;
    }

    public int width() { return W; } public int height() { return H; }
    public int textWidth(String s) { Object w = font == null ? null : Gx.call(font, "width", s); return w instanceof Number ? ((Number) w).intValue() : s.length() * 6; }
    public int fontHeight() { Object h = font == null ? null : Gx.field(font, "lineHeight"); return h instanceof Number ? ((Number) h).intValue() : 9; }

    public void fill(int x, int y, int w, int h, int c) { try { FILL.invoke(g, x, y, x + w, y + h, c); } catch (Throwable t) { throw new IllegalStateException(t); } }

    /** Depuis 1.21.6 la couleur du texte est de l'ARGB : sans opacité le texte serait transparent. */
    public void text(String s, int x, int y, int c, boolean sh) {
        int col = (c >>> 24) == 0 ? (c | 0xFF000000) : c;
        try { if (TEXT_ARGS == 6) TEXT.invoke(g, font, s, x, y, col, sh); else TEXT.invoke(g, font, s, x, y, col); } catch (Throwable t) { throw new IllegalStateException(t); }
    }

    public void push(double tx, double ty, double s) { Gx.push(g, tx, ty, s); }
    public void pop() { Gx.pop(g); }

    public void icon(String kind, int k, int x, int y) {
        if (!"armor".equals(kind)) return;   // les icônes d'effets viendront plus tard
        try {
            Object player = Gx.field(Minecraft.getInstance(), "player"); if (player == null) return;
            Class<?> slot = Class.forName("net.minecraft.world.entity.EquipmentSlot");
            List<Object> out = new ArrayList<Object>();
            for (String n : new String[] {"HEAD", "CHEST", "LEGS", "FEET"}) {
                Object sl = null; for (Object e : slot.getEnumConstants()) if (e.toString().equals(n)) sl = e;
                Object it = sl == null ? null : Gx.call(player, "getItemBySlot", sl);
                if (it != null && !Boolean.TRUE.equals(Gx.call(it, "isEmpty"))) out.add(it);
            }
            if (k < out.size()) Gx.item(g, out.get(k), x, y);
        } catch (Throwable t) { /* icône manquante : sans importance */ }
    }
}
