package net.hydarium.core;

/** Titre trop long pour le widget : on n'affiche qu'une fenêtre qui défile en boucle (pause au début). Le texte est mesuré par le jeu lui-même (interface Measure), donc c'est identique sur toutes les versions. */
public final class Marquee {
    public interface Measure { int width(String s); }

    private static String last = "";
    private static long t0 = 0;

    private Marquee() {}

    /** keep : nombre de caractères du début qui restent fixes (ex. « > » devant le titre). Renvoie le texte tel quel s'il tient dans maxPx. */
    public static String window(String text, int keep, int maxPx, Measure m, long now) {
        if (text == null || maxPx <= 0 || m.width(text) <= maxPx) return text;
        keep = Math.max(0, Math.min(keep, text.length()));
        String head = text.substring(0, keep), body = text.substring(keep);
        if (!body.equals(last)) { last = body; t0 = now; }
        int avail = maxPx - m.width(head);
        int[] cp = (body + "   " + body).codePoints().toArray(); // boucle : titre, trois espaces, titre (les symboles japonais sont des points de code entiers)
        int n = body.codePointCount(0, body.length()) + 3;
        long step = Math.max(0, (now - t0) / 200 - 8); // 5 pas par seconde, 1,6 s de pause au début
        StringBuilder b = new StringBuilder(head); int w = 0;
        for (int i = (int) (step % n); i < cp.length; i++) {
            String ch = new String(Character.toChars(cp[i])); int cw = m.width(ch);
            if (w + cw > avail) break;
            b.append(ch); w += cw;
        }
        return b.toString();
    }
}
