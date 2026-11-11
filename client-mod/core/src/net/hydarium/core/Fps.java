package net.hydarium.core;

/**
 * Images par seconde MESURÉES (une image dessinée = un appel à {@link #frame}).
 * Le mod lisait autrefois le compteur interne du jeu par réflexion avec ses noms Mojang (« getFps », champ « fps ») : ces noms n'existent pas dans le jeu
 * obfusqué des versions 1.20 / 1.21, la lecture échouait en silence et le widget FPS restait à 0. Compter soi-même ne dépend d'aucun nom du jeu.
 */
public final class Fps {
    private long start; private int n, last;

    /** À appeler à chaque image dessinée ; renvoie la valeur de la dernière seconde terminée. */
    public synchronized int frame(long now) {
        if (start == 0) start = now;
        n++;
        long d = now - start;
        if (d >= 1000) {
            if (d <= 3000) last = (int) Math.round(n * 1000.0 / d);   // au-delà : jeu figé ou en pause, cette mesure ne dit rien de la fluidité
            n = 0; start = now;
        }
        return last;
    }
}
