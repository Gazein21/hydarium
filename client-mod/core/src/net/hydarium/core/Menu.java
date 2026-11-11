package net.hydarium.core;

import java.util.ArrayList;
import java.util.List;

/**
 * Menu Hydarium DANS le jeu (raccourci du launcher, « Alt+H » par défaut) : un vrai écran du jeu, plus une fenêtre posée par-dessus (donc plus de bascule de fenêtre).
 * Étape 1 : activer / désactiver les fonctions et les widgets du HUD, ouvrir le placement des widgets, et passer au launcher pour ce qui n'est pas encore dans le jeu
 * (skin, téléchargements, captures, musique…). Tout le dessin et les clics sont ici, dans le cœur ; l'écran de chaque version ne fait que passer la souris et dessiner.
 * Les cases cochées passent par {@link Config#setOn} : le launcher les voit (état envoyé par le pont) et les garde.
 */
public final class Menu {
    /** Ce que le menu demande à la version du jeu. */
    public interface Host {
        /** Ouvre l'éditeur de placement des widgets (remplace ce menu). */
        void editor();
        /** Ouvre une page du menu du launcher : « skins », « content », « shots », « music » ou « hub ». */
        void launcher(String page);
    }

    private static final String[][] FEATURES = {{"gamma", "Luminosité", "Brightness"}, {"zoom", "Zoom", "Zoom"}, {"togglesprint", "Sprint auto", "Auto-sprint"}, {"autowalk", "Marche auto", "Auto-walk"}};
    private static final String[][] LAUNCHER = {{"skins", "Skin et cape", "Skin & cape"}, {"content", "Télécharger", "Download"}, {"shots", "Captures", "Screenshots"}, {"music", "Musique", "Music"}, {"hub", "Profils et plus…", "Profiles & more…"}};

    private static final int PW = 300, PH = 262, ROW = 14, COLW = 138;
    private static final int DIM = 0x99000000, PANEL = 0xF0161A22, EDGE = 0xFF2E3644, TXT = 0xFFE6E9EF, MUTED = 0xFF8A94A6, ACC = 0xFF5B8CFF, ON = 0xFF4ADE80, OFF = 0xFF3A4252, HOVER = 0x33FFFFFF, BTN = 0xFF252B38;

    private static final class Hit { final int x, y, w, h; final String act; Hit(int x, int y, int w, int h, String act) { this.x = x; this.y = y; this.w = w; this.h = h; this.act = act; } boolean in(double mx, double my) { return mx >= x && my >= y && mx < x + w && my < y + h; } }

    private final Config cfg; private final Host host;
    private final List<Hit> hits = new ArrayList<Hit>();
    private double ox, oy, sc = 1;
    /** L'écran se ferme quand c'est vrai. */
    public boolean closeRequested;

    public Menu(Config cfg, Host host) { this.cfg = cfg; this.host = host; }

    private boolean en() { return "en".equals(cfg.lang()); }
    private String t(String fr, String en) { return en() ? en : fr; }
    private String nm(String[] n) { return en() ? n[2] : n[1]; }
    private boolean isOn(String id) { return id.equals("hud") ? !cfg.hudHidden : cfg.get(id).on; }

    /** Position du panneau à l'écran (utile aux tests) : {x, y, échelle}. */
    public double[] frame() { return new double[] {ox, oy, sc}; }

    public void draw(Canvas c, int mx, int my) {
        hits.clear();
        int W = c.width(), H = c.height();
        sc = Math.min(1.0, Math.min((W - 6) / (double) PW, (H - 6) / (double) PH));   // petite fenêtre / grande échelle d'interface : le panneau rétrécit au lieu de déborder
        ox = (W - PW * sc) / 2.0; oy = (H - PH * sc) / 2.0;
        double lx = (mx - ox) / sc, ly = (my - oy) / sc;
        c.fill(0, 0, W, H, DIM);
        c.push(ox, oy, sc);
        c.fill(0, 0, PW, PH, EDGE); c.fill(1, 1, PW - 2, PH - 2, PANEL);
        c.text("Hydarium", 8, 7, TXT, true);
        String hint = t("Échap : fermer", "Esc: close"); c.text(hint, PW - 8 - c.textWidth(hint), 7, MUTED, false);
        c.fill(8, 19, PW - 16, 1, EDGE);

        c.text(t("Fonctions", "Features"), 8, 25, ACC, false);
        for (int i = 0; i < FEATURES.length; i++) toggle(c, FEATURES[i][0], nm(FEATURES[i]), 8 + (i % 2) * (COLW + 8), 36 + (i / 2) * ROW, lx, ly);

        c.text(t("Widgets du HUD", "HUD widgets"), 8, 68, ACC, false);
        toggle(c, "hud", t("Afficher le HUD", "Show the HUD"), 8, 80, lx, ly);
        for (int i = 0; i < Editor.NAMES.length; i++) { int k = i + 1; toggle(c, Editor.NAMES[i][0], nm(Editor.NAMES[i]), 8 + (k % 2) * (COLW + 8), 80 + (k / 2) * ROW, lx, ly); }

        button(c, "editor", t("Placer et régler les widgets en jeu", "Place and adjust widgets in-game"), 8, 184, PW - 16, 16, ACC, lx, ly);
        c.text(t("Dans le launcher (s’ouvre par-dessus le jeu)", "In the launcher (opens over the game)"), 8, 207, MUTED, false);
        int bw = (PW - 16 - 8) / 3;
        for (int i = 0; i < LAUNCHER.length; i++) button(c, "l:" + LAUNCHER[i][0], nm(LAUNCHER[i]), 8 + (i % 3) * (bw + 4), 218 + (i / 3) * 20, bw, 16, BTN, lx, ly);
        c.pop();
    }

    private void toggle(Canvas c, String id, String label, int x, int y, double lx, double ly) {
        Hit h = new Hit(x, y, COLW, ROW - 1, "tog:" + id); hits.add(h);
        if (h.in(lx, ly)) c.fill(x, y, COLW, ROW - 1, HOVER);
        boolean on = isOn(id);
        c.fill(x + 2, y + 2, 9, 9, on ? ON : OFF); if (on) c.fill(x + 4, y + 4, 5, 5, 0xFF0B2A17);
        c.text(label, x + 16, y + 3, on ? TXT : MUTED, false);
    }

    private void button(Canvas c, String act, String label, int x, int y, int w, int h, int bg, double lx, double ly) {
        Hit hit = new Hit(x, y, w, h, act); hits.add(hit);
        c.fill(x, y, w, h, bg); if (hit.in(lx, ly)) c.fill(x, y, w, h, HOVER);
        c.text(label, x + (w - c.textWidth(label)) / 2, y + (h - c.fontHeight()) / 2, TXT, false);
    }

    /** Clic gauche aux coordonnées d'écran (interface du jeu). Un clic hors du panneau ferme le menu. */
    public void press(int sx, int sy, int button) {
        if (button != 0) return;
        double lx = (sx - ox) / sc, ly = (sy - oy) / sc;
        for (Hit h : hits) {
            if (!h.in(lx, ly)) continue;
            if (h.act.startsWith("tog:")) { String id = h.act.substring(4); if (id.equals("hud")) cfg.hudHidden = !cfg.hudHidden; else cfg.setOn(id, !cfg.get(id).on); }
            else if (h.act.equals("editor")) host.editor();
            else if (h.act.startsWith("l:")) { host.launcher(h.act.substring(2)); closeRequested = true; }
            return;
        }
        if (lx < 0 || ly < 0 || lx >= PW || ly >= PH) closeRequested = true;
    }
}
