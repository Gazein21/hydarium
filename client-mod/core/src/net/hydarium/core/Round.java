package net.hydarium.core;

import java.util.ArrayList;
import java.util.List;

/** Découpe une case en rectangles pour dessiner des coins légèrement arrondis avec de simples remplissages (aucun chevauchement : pas de double transparence). */
public final class Round {
    private Round() {}

    /** Rectangles {dx, dy, largeur, hauteur} d'une case w×h. Sans arrondi (ou case trop petite) : un seul rectangle. */
    public static List<int[]> rects(int w, int h, boolean round) {
        List<int[]> out = new ArrayList<int[]>();
        int r = !round || w < 8 || h < 8 ? 0 : (h >= 12 && w >= 12 ? 2 : 1);
        if (r == 0) { out.add(new int[] {0, 0, w, h}); return out; }
        for (int k = 0; k < r; k++) { int in = r - k; out.add(new int[] {in, k, w - 2 * in, 1}); out.add(new int[] {in, h - 1 - k, w - 2 * in, 1}); }
        out.add(new int[] {0, r, w, h - 2 * r});
        return out;
    }
}
