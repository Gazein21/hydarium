package net.hydarium.core;

/**
 * Sneak permanent : « activé » = on reste accroupi (comme la marche auto : « activé » = ça avance). Il s'arrête tout seul dès que la personne sneake elle-même.
 * Cette classe ne fait que reconnaître ce sneak manuel (front montant de la touche), sans Minecraft ; l'adaptateur Forge 1.8.9 s'en sert (les versions récentes ont l'option native).
 */
public final class SneakLock {
    private boolean was;

    /**
     * À appeler à chaque tick. {@code realDown} : la touche sneak est réellement enfoncée (pas l'état forcé par le module) ; {@code active} : le sneak permanent est actif ;
     * {@code typing} : un menu est ouvert. Renvoie true si la touche vient d'être pressée à la main alors que le module est actif : il faut l'arrêter.
     * Une touche déjà tenue au moment de l'activation, ou pendant un menu, ne compte pas.
     */
    public boolean manual(boolean realDown, boolean active, boolean typing) {
        boolean edge = realDown && !was; was = realDown;
        return active && !typing && edge;
    }

    /** Quitter le monde. */
    public void reset() { was = false; }
}
