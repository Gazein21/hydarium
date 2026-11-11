package net.hydarium.core;

import java.util.ArrayList;
import java.util.List;

/**
 * Éditeur en jeu du mode client : les VRAIS widgets (mêmes valeurs, même dessin que dans la partie) se déplacent à la souris, avec aimantation aux bords, au centre et aux autres widgets ;
 * liste des widgets avec cases à cocher, et réglages du widget choisi (taille, opacité, fond, couleur, éléments affichés). Aucune dépendance à Minecraft : l'adaptateur de chaque version
 * ne fait que fournir un {@link Canvas} et transmettre la souris et le clavier. Les changements passent par {@link Config#edit} : visibles tout de suite, puis repris par le launcher.
 */
public final class Editor {
    public static final int K_ESC = 1, K_LEFT = 2, K_RIGHT = 3, K_UP = 4, K_DOWN = 5, K_PLUS = 6, K_MINUS = 7, K_RESET = 8;
    private static final int[] PALETTE = {0xFFFFFF, 0xFFFF55, 0x55FF55, 0x55FFFF, 0xFF5555, 0xFF55FF, 0xFFAA00};
    static final String[][] NAMES = {{"fps", "FPS", "FPS"}, {"cps", "CPS", "CPS"}, {"keystrokes", "Touches", "Keys"}, {"coords", "Coordonnées", "Coordinates"}, {"direction", "Direction", "Direction"},
        {"armor", "Armure", "Armor"}, {"potions", "Effets", "Effects"}, {"ping", "Ping", "Ping"}, {"clock", "Heure", "Clock"}, {"memory", "Mémoire", "Memory"}, {"music", "Musique", "Music"}, {"session", "Session", "Session"}};
    private static final int SNAP = 4;

    private static final class Hit { int x, y, w, h; String act; Hit(int x, int y, int w, int h, String act) { this.x = x; this.y = y; this.w = w; this.h = h; this.act = act; } boolean in(int mx, int my) { return mx >= x && my >= y && mx < x + w && my < y + h; } }

    private final Config cfg; private final State st;
    private String sel = null; private boolean dragging; private int offX, offY;
    private List<Painter.Placed> placed = new ArrayList<Painter.Placed>();
    private final List<Hit> hits = new ArrayList<Hit>();
    private int guideX = -1, guideY = -1;
    private int W = 1, H = 1;
    private Canvas cv;
    /** L'adaptateur ferme l'écran quand c'est vrai. */
    public boolean closeRequested;

    public Editor(Config cfg, State st) { this.cfg = cfg; this.st = st; }

    private boolean en() { return "en".equals(cfg.lang()); }
    private String t(String fr, String en) { return en() ? en : fr; }
    public String selected() { return sel; }

    // ---------- dessin ----------
    public void draw(Canvas c, int mx, int my, long now) {
        cv = c; W = c.width(); H = c.height(); hits.clear();
        c.fill(0, 0, W, H, 0x44000000);
        placed = Painter.paintAll(Hud.buildEdit(cfg, st), c, st, cfg.round(), now);
        for (Painter.Placed p : placed) outline(c, p, p.w.id.equals(sel) ? 0xFFFFFF55 : p.contains(mx, my) ? 0xCCFFFFFF : p.w.ghost ? 0x77FFFFFF : 0x44FFFFFF);
        if (dragging) { if (guideX >= 0) c.fill(guideX, 0, 1, H, 0xAA55FFFF); if (guideY >= 0) c.fill(0, guideY, W, 1, 0xAA55FFFF); }
        panel(c, mx, my); bar(c, mx, my);
        String hint = t("Glisse les widgets  ·  flèches : 1 px  ·  + / - : taille  ·  R : réinitialiser  ·  Échap : terminer", "Drag the widgets  ·  arrows: 1 px  ·  + / -: size  ·  R: reset  ·  Esc: done");
        c.text(hint, (W - c.textWidth(hint)) / 2, 3, 0xFFDDDDDD, true);
        String done = t("Terminé", "Done"); int bw = c.textWidth(done) + 12; button(c, W - bw - 4, 4, bw, 12, done, "done", mx, my, false);
    }

    private void outline(Canvas c, Painter.Placed p, int col) { int x = p.x() - 1, y = p.y() - 1, w = p.width() + 2, h = p.height() + 2; c.fill(x, y, w, 1, col); c.fill(x, y + h - 1, w, 1, col); c.fill(x, y, 1, h, col); c.fill(x + w - 1, y, 1, h, col); }

    private void button(Canvas c, int x, int y, int w, int h, String label, String act, int mx, int my, boolean on) {
        Hit hit = new Hit(x, y, w, h, act); hits.add(hit);
        c.fill(x, y, w, h, hit.in(mx, my) ? 0xCC4a6a9a : on ? 0xCC2d5a3a : 0xCC222222);
        c.text(label, x + (w - c.textWidth(label)) / 2, y + (h - c.fontHeight()) / 2 + 1, 0xFFFFFFFF, false);
    }

    private void panel(Canvas c, int mx, int my) {
        int rh = 11, lw = 0; for (String[] n : NAMES) lw = Math.max(lw, c.textWidth(en() ? n[2] : n[1]));
        int x = 4, y = 20, w = 14 + lw + 8, h = NAMES.length * rh + 4;
        c.fill(x, y, w, h, 0xAA000000);
        for (int k = 0; k < NAMES.length; k++) {
            String id = NAMES[k][0]; int ry = y + 2 + k * rh; boolean on = cfg.get(id).on;
            if (id.equals(sel)) c.fill(x + 1, ry, w - 2, rh, 0x55FFFF55);
            Hit box = new Hit(x + 3, ry + 1, 9, 9, "tog:" + id), row = new Hit(x + 14, ry, w - 14, rh, "sel:" + id); hits.add(box); hits.add(row);
            c.fill(x + 3, ry + 1, 9, 9, box.in(mx, my) ? 0xFFAAAAAA : 0xFF777777); c.fill(x + 4, ry + 2, 7, 7, on ? 0xFF3fbf5f : 0xFF222222);
            c.text(en() ? NAMES[k][2] : NAMES[k][1], x + 14, ry + 2, on ? 0xFFFFFFFF : 0xFF999999, true);
        }
    }

    private void bar(Canvas c, int mx, int my) {
        if (sel == null) { String s = t("Choisis un widget pour régler sa taille, son opacité, son fond et sa couleur.", "Pick a widget to set its size, opacity, background and colour."); c.text(s, 4, H - 12, 0xFFBBBBBB, true); return; }
        Config.Mod m = cfg.get(sel); List<Object[]> items = new ArrayList<Object[]>(); // {largeur, libellé, action, actif, kind}
        items.add(new Object[] {c.textWidth(label(sel)) + 8, label(sel), "", false, "t"});
        items.add(new Object[] {c.textWidth(t("Taille ", "Size ") + fmt(m.scale)) + 2, t("Taille ", "Size ") + fmt(m.scale), "", false, "t"}); items.add(new Object[] {11, "-", "sc-", false, "b"}); items.add(new Object[] {11, "+", "sc+", false, "b"});
        items.add(new Object[] {c.textWidth(t("Opacité ", "Opacity ") + Math.round(m.opacity * 100) + " %") + 2, t("Opacité ", "Opacity ") + Math.round(m.opacity * 100) + " %", "", false, "t"}); items.add(new Object[] {11, "-", "op-", false, "b"}); items.add(new Object[] {11, "+", "op+", false, "b"});
        items.add(new Object[] {c.textWidth(t("Fond", "Back")) + 10, t("Fond", "Back"), "bg", m.bg, "b"}); items.add(new Object[] {24, "", "col", false, "c"});
        for (String f : flags(sel)) items.add(new Object[] {c.textWidth(flagName(f)) + 10, flagName(f), "show:" + f, m.has(f), "b"});
        items.add(new Object[] {c.textWidth(t("Réinitialiser", "Reset")) + 10, t("Réinitialiser", "Reset"), "reset", false, "b"});
        int x = 4, rows = 1, cur = 4; for (Object[] it : items) { int w = (Integer) it[0]; if (cur + w + 3 > W - 4 && cur > 4) { rows++; cur = 4; } cur += w + 3; }
        int bh = rows * 14 + 2, y0 = H - bh - 2; c.fill(0, y0 - 2, W, bh + 4, 0xAA000000); int y = y0, cx = 4;
        for (Object[] it : items) {
            int w = (Integer) it[0]; if (cx + w + 3 > W - 4 && cx > 4) { cx = 4; y += 14; }
            String kind = (String) it[4];
            if ("t".equals(kind)) c.text((String) it[1], cx, y + 3, 0xFFFFFFFF, true);
            else if ("c".equals(kind)) { Hit hit = new Hit(cx, y, w, 12, "col"); hits.add(hit); c.fill(cx, y, w, 12, hit.in(mx, my) ? 0xFFAAAAAA : 0xFF666666); c.fill(cx + 1, y + 1, w - 2, 10, 0xFF000000 | m.color); }
            else button(c, cx, y, w, 12, (String) it[1], (String) it[2], mx, my, (Boolean) it[3]);
            cx += w + 3;
        }
    }

    private String label(String id) { for (String[] n : NAMES) if (n[0].equals(id)) return en() ? n[2] : n[1]; return id; }
    private static String fmt(double v) { return (Math.round(v * 10) / 10.0) + ""; }
    private static String[] flags(String id) { return "armor".equals(id) ? new String[] {"icon", "name", "pct"} : "potions".equals(id) ? new String[] {"icon", "name", "lvl", "time"} : new String[0]; }
    private String flagName(String f) { return "icon".equals(f) ? t("Icône", "Icon") : "name".equals(f) ? t("Nom", "Name") : "pct".equals(f) ? "%" : "lvl".equals(f) ? t("Niveau", "Level") : t("Durée", "Time"); }

    // ---------- souris ----------
    public boolean press(int mx, int my, int button) {
        if (button != 0) return true;
        for (int k = hits.size() - 1; k >= 0; k--) { Hit h = hits.get(k); if (h.in(mx, my)) { act(h.act); return true; } }
        for (int k = placed.size() - 1; k >= 0; k--) { Painter.Placed p = placed.get(k); if (p.contains(mx, my)) { sel = p.w.id; dragging = true; offX = mx - p.x(); offY = my - p.y(); cfg.freeze(true); guideX = guideY = -1; return true; } }
        sel = null; return true;
    }

    public void drag(int mx, int my) {
        if (!dragging || sel == null) return;
        Painter.Placed me = find(sel); if (me == null) return;
        int w = me.width(), h = me.height(), nx = Math.max(0, Math.min(W - w - 1, mx - offX)), ny = Math.max(0, Math.min(H - h - 1, my - offY));
        List<Integer> xs = new ArrayList<Integer>(), ys = new ArrayList<Integer>(); // positions d'aimantation possibles (bord gauche / haut du widget déplacé)
        xs.add(0); xs.add((W - w) / 2); xs.add(W - w - 1); ys.add(0); ys.add((H - h) / 2); ys.add(H - h - 1);
        for (Painter.Placed q : placed) { if (q == me) continue; xs.add(q.x()); xs.add(q.x() + q.width() - w); xs.add(q.x() + q.width() + 1); xs.add(q.x() - w - 1); ys.add(q.y()); ys.add(q.y() + q.height() - h); ys.add(q.y() + q.height() + 1); ys.add(q.y() - h - 1); }
        int bx = nx, by = ny, dx = SNAP + 1, dy = SNAP + 1; guideX = guideY = -1;
        for (int v : xs) { int d = Math.abs(v - nx); if (d < dx && v >= 0 && v <= W - w - 1) { dx = d; bx = v; } }
        for (int v : ys) { int d = Math.abs(v - ny); if (d < dy && v >= 0 && v <= H - h - 1) { dy = d; by = v; } }
        if (dx <= SNAP) { nx = bx; guideX = (nx == (W - w) / 2) ? nx + w / 2 : nx; }
        if (dy <= SNAP) { ny = by; guideY = (ny == (H - h) / 2) ? ny + h / 2 : ny; }
        move(sel, nx, ny);
    }

    public void release(int mx, int my) { if (dragging) { dragging = false; guideX = guideY = -1; cfg.freeze(false); } }

    /** Remesure les widgets (sans les dessiner) : après un déplacement ou un réglage, avant que l'image suivante ne soit dessinée (deux touches dans la même image). */
    private void refresh() { if (cv == null) return; List<Painter.Placed> l = new ArrayList<Painter.Placed>(); for (Widget w : Hud.buildEdit(cfg, st)) l.add(Painter.place(w, cv, System.currentTimeMillis())); placed = l; }

    private Painter.Placed find(String id) { for (Painter.Placed p : placed) if (p.w.id.equals(id)) return p; return null; }
    /** (+0,25 px) : la position enregistrée, tronquée par le dessin, retombe exactement sur le pixel choisi. */
    private void move(String id, int px, int py) { cfg.edit(id, "x", (px + .25) / W); cfg.edit(id, "y", (py + .25) / H); }

    // ---------- clavier ----------
    public void key(int k) {
        if (k == K_ESC) { closeRequested = true; return; }
        if (sel == null) return;
        refresh(); Painter.Placed p = find(sel); Config.Mod m = cfg.get(sel);
        if (k == K_LEFT && p != null) move(sel, Math.max(0, p.x() - 1), p.y()); else if (k == K_RIGHT && p != null) move(sel, Math.min(W - p.width() - 1, p.x() + 1), p.y());
        else if (k == K_UP && p != null) move(sel, p.x(), Math.max(0, p.y() - 1)); else if (k == K_DOWN && p != null) move(sel, p.x(), Math.min(H - p.height() - 1, p.y() + 1));
        else if (k == K_PLUS) cfg.edit(sel, "scale", m.scale + .1); else if (k == K_MINUS) cfg.edit(sel, "scale", m.scale - .1);
        else if (k == K_RESET) cfg.resetEdit(sel);
    }

    // ---------- boutons ----------
    /** Action d'un bouton (ex. « show:name », « col », « reset ») : utilisée par la souris, et directement par les tests. */
    public void act(String a) {
        if ("done".equals(a)) { closeRequested = true; return; }
        if (a.startsWith("tog:")) { String id = a.substring(4); cfg.setOn(id, !cfg.get(id).on); sel = id; return; }
        if (a.startsWith("sel:")) { sel = a.substring(4); return; }
        if (sel == null) return; Config.Mod m = cfg.get(sel);
        if ("sc-".equals(a)) cfg.edit(sel, "scale", m.scale - .1); else if ("sc+".equals(a)) cfg.edit(sel, "scale", m.scale + .1);
        else if ("op-".equals(a)) cfg.edit(sel, "opacity", m.opacity - .1); else if ("op+".equals(a)) cfg.edit(sel, "opacity", m.opacity + .1);
        else if ("bg".equals(a)) cfg.edit(sel, "bg", !m.bg);
        else if ("col".equals(a)) { int i = 0; for (int k = 0; k < PALETTE.length; k++) if (PALETTE[k] == m.color) i = k; cfg.edit(sel, "color", PALETTE[(i + 1) % PALETTE.length]); }
        else if ("reset".equals(a)) cfg.resetEdit(sel);
        else if (a.startsWith("show:")) toggleFlag(m, a.substring(5));
    }

    /** « show » vide = tout affiché. On retire / ajoute un élément ; on ne retire jamais le dernier (la liste vide voudrait dire « tout »). */
    private void toggleFlag(Config.Mod m, String f) {
        String[] all = flags(sel); List<String> on = new ArrayList<String>();
        for (String x : all) if (m.has(x)) on.add(x);
        if (on.contains(f)) { if (on.size() <= 1) return; on.remove(f); } else on.add(f);
        StringBuilder b = new StringBuilder(); for (String x : all) if (on.contains(x)) b.append(b.length() > 0 ? "," : "").append(x);
        cfg.edit(sel, "show", on.size() == all.length ? "" : b.toString());
    }
}
