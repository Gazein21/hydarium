package net.hydarium.core;

import java.util.ArrayList;
import java.util.List;

/** Ce que l'adaptateur doit dessiner : du texte (lignes) ou la grille de touches, à une position en fraction de l'écran. */
public final class Widget {
    public String id;
    public List<String> lines = new ArrayList<String>();
    public boolean keys;               // true : dessiner la grille de touches (états dans State)
    public boolean icons;              // true : une icône (objet d'armure / effet) devant chaque ligne, dans l'ordre des lignes
    public double x, y, scale = 1, opacity = 1;
    public int color = 0xFFFFFF;
    public boolean bg = true;
    public int maxWidth = 0;           // > 0 : largeur maximale du texte (pixels du jeu) ; au-delà, la première ligne défile (Marquee)
    public int sub = -1;               // >= 0 : à partir de cette ligne, texte plus petit et plus transparent (ex. l'artiste sous le titre de la musique)
    public java.util.List<Integer> lc = new ArrayList<Integer>(); // couleur RVB propre à chaque ligne (0 = couleur du widget) : armure selon l'usure
    public int colorOf(int k) { int c = k < lc.size() ? lc.get(k) : 0; return c == 0 ? color : c; }
    public boolean ghost;               // contenu d'exemple montré par l'éditeur pour un module actif qui n'a rien à afficher pour l'instant
    public int keep = 0;               // nombre de caractères du début de cette ligne qui ne défilent pas
}
