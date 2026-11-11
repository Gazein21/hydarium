package net.hydarium.client;

/** Colle du code P2P propre aux versions récentes (hors du fichier partagé avec les autres variantes et Forge, qui ne doit contenir aucune classe du jeu en dur). */
public final class P2pGlue {
    private P2pGlue() {}

    /** Comme {@link HydariumClient#p2p}, mais renvoie directement l'objet « ServerAddress » du jeu (fabriqué par réflexion), ou null s'il ne faut rien changer. Ne lève jamais d'exception. */
    public static Object serverAddress(String typed) {
        try {
            String real = HydariumClient.p2p(typed); if (real == null) return null;
            return Class.forName("net.minecraft.client.multiplayer.resolver.ServerAddress").getMethod("parseString", String.class).invoke(null, real);
        } catch (Throwable t) { return null; }
    }
}
