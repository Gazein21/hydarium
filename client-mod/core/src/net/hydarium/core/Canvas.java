package net.hydarium.core;

/**
 * Ce que le dessin du HUD et l'éditeur en jeu demandent à chaque version de Minecraft : quelques gestes simples.
 * Tout le reste (taille des cases, position, défilement du titre, grille de touches, éditeur) est dans le cœur : identique partout, testable sans le jeu.
 * Coordonnées en pixels de l'interface du jeu (après l'échelle d'interface choisie dans les options vidéo).
 */
public interface Canvas {
    int width();
    int height();
    int textWidth(String s);
    /** Hauteur des lettres sans espacement (9 dans Minecraft). Une ligne de widget en fait 1 de plus. */
    int fontHeight();
    void fill(int x, int y, int w, int h, int argb);
    void text(String s, int x, int y, int argb, boolean shadow);
    /** Décale puis agrandit tout ce qui est dessiné jusqu'au {@link #pop()} correspondant. Peut être imbriqué. */
    void push(double tx, double ty, double scale);
    void pop();
    /** Icône 16×16 de la ligne {@code index} d'un widget : kind « armor » (objet d'armure) ou « fx » (effet de potion). Ne fait rien s'il n'y en a pas. */
    void icon(String kind, int index, int x, int y);
}
