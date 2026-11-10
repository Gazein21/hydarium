package net.hydarium.core;

import java.util.ArrayList;
import java.util.List;

/**
 * Dessin d'un widget du HUD, identique pour toutes les versions (c'était dupliqué dans chaque adaptateur). Reprend à l'identique les formules d'origine :
 * taille des cases, lignes avec icônes, lignes « petites », titre qui défile, grille de touches, position bornée à l'écran.
 * {@link #place} donne le cadre exact d'un widget : le dessin et l'éditeur en jeu s'appuient sur les mêmes chiffres.
 */
public final class Painter {
    private Painter() {}

    /** Un widget mesuré et positionné. */
    public static final class Placed {
        public Widget w;
        public List<String> lines;
        public int a, col, bg, lh, tx, nm, ns, sh, bw, bh, px, py;
        public double s;
        /** Cadre à l'écran (échelle comprise). */
        public int x() { return px; }
        public int y() { return py; }
        public int width() { return (int) Math.ceil(bw * s); }
        public int height() { return (int) Math.ceil(bh * s); }
        public boolean contains(int mx, int my) { return mx >= px && my >= py && mx < px + width() && my < py + height(); }
    }

    public static Placed place(Widget w, final Canvas c, long now) {
        Placed p = new Placed(); p.w = w;
        p.a = (int) Math.round(Math.max(.1, Math.min(1, w.opacity)) * 255) << 24; p.col = p.a | w.color; p.bg = (int) Math.round(w.opacity * 102) << 24;
        List<String> l = new ArrayList<String>(w.lines); p.lines = l;
        boolean ic = w.icons; p.lh = ic ? 18 : c.fontHeight() + 1; p.tx = ic ? 22 : 3;
        boolean scr = false;
        if (w.maxWidth > 0 && !l.isEmpty() && c.textWidth(l.get(0)) > w.maxWidth) { // titre trop long : il défile
            l.set(0, Marquee.window(l.get(0), w.keep, w.maxWidth, new Marquee.Measure() { public int width(String s) { return c.textWidth(s); } }, now)); scr = true;
        }
        p.nm = w.sub < 0 ? l.size() : Math.min(w.sub, l.size()); p.ns = l.size() - p.nm; p.sh = p.lh * 3 / 4; // lignes « petites » (artiste) : 75 % de la taille
        if (w.keys) { p.bw = 58; p.bh = 58; }
        else {
            int mw = 0;
            for (int k = 0; k < l.size(); k++) mw = Math.max(mw, k < p.nm ? c.textWidth(l.get(k)) : (int) Math.ceil(c.textWidth(l.get(k)) * .75));
            if (scr) mw = Math.max(mw, w.maxWidth);
            p.bw = mw + p.tx + 3; p.bh = p.nm * p.lh + p.ns * p.sh + 3;
        }
        p.s = w.scale; int W = c.width(), H = c.height();
        p.px = (int) Math.min(w.x * W, Math.max(0, W - p.bw * p.s - 1)); p.py = (int) Math.min(w.y * H, Math.max(0, H - p.bh * p.s - 1));
        return p;
    }

    public static void paint(Placed p, Canvas c, State st, boolean round) {
        Widget w = p.w; List<String> l = p.lines;
        c.push(p.px, p.py, p.s);
        if (w.keys) keys(c, st, p.a, round);
        else {
            if (w.bg) box(c, 0, 0, p.bw, p.bh, p.bg, round);
            int inner = p.bw - p.tx - 3; // largeur du texte : chaque ligne y est centrée (sauf avec icônes)
            boolean ic = w.icons; String kind = ic ? ("armor".equals(w.id) ? "armor" : "potions".equals(w.id) ? "fx" : null) : null;
            for (int k = 0; k < p.nm; k++) {
                int ty = ic ? 2 + k * p.lh + (p.lh - c.fontHeight()) / 2 - 1 : 3 + k * p.lh, lx = ic ? p.tx : p.tx + (inner - c.textWidth(l.get(k))) / 2;
                if (kind != null) c.icon(kind, k, 3, 1 + k * p.lh);
                c.text(l.get(k), lx, ty, p.a | w.colorOf(k), true);
            }
            for (int k = p.nm; k < l.size(); k++) { // artiste : plus petit et plus transparent, juste sous le titre
                int sc = ((int) ((p.col >>> 24 & 0xFF) * .6) << 24) | (p.col & 0xFFFFFF);
                c.push(p.tx + (inner - (int) Math.ceil(c.textWidth(l.get(k)) * .75)) / 2, 3 + p.nm * p.lh + (k - p.nm) * p.sh, .75);
                c.text(l.get(k), 0, 0, sc, true); c.pop();
            }
        }
        c.pop();
    }

    /** Mesure puis dessine tous les widgets ; renvoie leurs cadres. */
    public static List<Placed> paintAll(List<Widget> ws, Canvas c, State st, boolean round, long now) {
        List<Placed> out = new ArrayList<Placed>();
        for (Widget w : ws) { Placed p = place(w, c, now); paint(p, c, st, round); out.add(p); }
        return out;
    }

    /** Rectangle plein ; avec {@code round}, les 4 coins sont légèrement arrondis (voir Round). */
    public static void box(Canvas c, int x, int y, int w, int h, int color, boolean round) {
        for (int[] r : Round.rects(w, h, round)) c.fill(x + r[0], y + r[1], r[2], r[3], color);
    }

    private static void keys(Canvas c, State s, int a, boolean round) {
        cell(c, 20, 0, 18, s.lw, s.w, a, round); cell(c, 0, 20, 18, s.la, s.a, a, round); cell(c, 20, 20, 18, s.ls, s.s, a, round); cell(c, 40, 20, 18, s.ld, s.d, a, round);
        box(c, 0, 40, 58, 18, (s.space ? 0x99FFFFFF : 0x66000000) & 0x00FFFFFF | (a >>> 1 & 0xFF000000), round);
        c.fill(14, 48, 30, 2, s.space ? 0xFF000000 : 0xFFFFFFFF);
    }

    private static void cell(Canvas c, int x, int y, int sz, String t, boolean on, int a, boolean round) {
        box(c, x, y, sz, sz, (on ? 0x99FFFFFF : 0x66000000) & 0x00FFFFFF | (a >>> 1 & 0xFF000000), round);
        c.text(t, x + (sz - c.textWidth(t)) / 2, y + (sz - 8) / 2, on ? 0xFF000000 : 0xFFFFFFFF, false);
    }
}
