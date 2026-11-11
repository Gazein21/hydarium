package net.hydarium.core;

import java.util.HashMap;
import java.util.Map;

/**
 * Code d'invitation peer-to-peer tapé là où l'on met d'habitude l'adresse d'un serveur (liste multijoueur, « Connexion directe », « Ajouter un serveur »).
 * Le mod reconnaît un code « HYD-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX » (casse, espaces, tirets ou soulignés libres), demande au launcher d'ouvrir le tunnel vers l'hôte
 * (le launcher ouvre un port LOCAL sur 127.0.0.1) et répond au jeu « le serveur est à 127.0.0.1:port ». Une adresse normale n'est JAMAIS touchée.
 * Aucune dépendance à Minecraft : le Mixin de chaque version ne fait que passer le texte tapé à {@link #resolve}.
 */
public final class P2pAddress {
    private P2pAddress() {}

    /** Ce que sait faire le launcher : ouvrir le port local d'un code et dire lequel. Lève une exception avec un message lisible en cas d'échec. */
    public interface Opener { int open(String code) throws Exception; }

    private static final String ALPHA = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    private static final long KEEP_MS = 45000, FAIL_MS = 4000;
    private static final Map<String, long[]> cache = new HashMap<String, long[]>();   // clé → {port, heure}
    private static final Map<String, Object> locks = new HashMap<String, Object>();
    /** Dernière erreur du launcher (pour un éventuel message au joueur) ; vide si tout va bien. */
    public static volatile String lastError = "";

    /** Les 24 caractères du code, en majuscules, « O » lu 0 et « I », « L » lus 1 comme le fait le launcher ; null si ce n'est pas un code. */
    public static String key(String typed) {
        if (typed == null) return null;
        StringBuilder b = new StringBuilder(32);
        for (int i = 0; i < typed.length(); i++) {
            char c = Character.toUpperCase(typed.charAt(i));
            if (c == ' ' || c == '\t' || c == '-' || c == '_') continue;
            if (c == 'O') c = '0'; else if (c == 'I' || c == 'L') c = '1';
            b.append(c);
            if (b.length() > 27) return null;
        }
        String s = b.toString();
        if (s.length() != 27 || !s.startsWith("HYD")) return null;   // le préfixe HYD est obligatoire : une vraie adresse ne doit jamais être prise pour un code
        s = s.substring(3);
        for (int i = 0; i < s.length(); i++) if (ALPHA.indexOf(s.charAt(i)) < 0) return null;
        return s;
    }

    public static boolean isCode(String typed) { return key(typed) != null; }

    /** Forme canonique « HYD-XXXX-… » envoyée au launcher. */
    public static String pretty(String key) {
        StringBuilder b = new StringBuilder("HYD");
        for (int i = 0; i < key.length(); i += 4) b.append('-').append(key, i, i + 4);
        return b.toString();
    }

    /**
     * Texte tapé → adresse réelle « 127.0.0.1:port », ou null s'il ne faut rien changer (adresse ordinaire, launcher absent, code refusé).
     * Peut attendre le launcher (quelques secondes au plus la première fois) ; appelé sur le fil du jeu ou sur celui du ping de la liste.
     */
    public static String resolve(String typed, Opener opener) {
        String k = key(typed); if (k == null || opener == null) return null;
        Object lock; synchronized (locks) { lock = locks.get(k); if (lock == null) { lock = new Object(); locks.put(k, lock); } }
        synchronized (lock) {
            long now = System.currentTimeMillis(); long[] c; synchronized (cache) { c = cache.get(k); }
            if (c != null && now - c[1] < (c[0] > 0 ? KEEP_MS : FAIL_MS)) return c[0] > 0 ? "127.0.0.1:" + c[0] : null;   // réponse récente (réussite ou échec) : on ne harcèle pas le launcher
            try {
                int port = opener.open(pretty(k)); if (port <= 0 || port > 65535) throw new Exception("port invalide");
                synchronized (cache) { cache.put(k, new long[] {port, System.currentTimeMillis()}); } lastError = "";
                return "127.0.0.1:" + port;
            } catch (Throwable t) {
                lastError = String.valueOf(t.getMessage());
                synchronized (cache) { cache.put(k, new long[] {0, System.currentTimeMillis()}); }
                return null;
            }
        }
    }

    /** Pour les tests : oublie tout. */
    public static void reset() { synchronized (cache) { cache.clear(); } lastError = ""; }
}
