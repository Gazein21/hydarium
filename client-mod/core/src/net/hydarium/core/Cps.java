package net.hydarium.core;

/** Compte les clics sur la dernière seconde. L'adaptateur appelle {@link #feed} à chaque image avec l'état des boutons : un front montant = un clic. */
public final class Cps {
    private final long[][] ring = new long[2][64];
    private final int[] head = new int[2];
    private final boolean[] last = new boolean[2];

    public synchronized void feed(boolean left, boolean right, long now) {
        edge(0, left, now);
        edge(1, right, now);
    }

    private void edge(int b, boolean down, long now) {
        if (down && !last[b]) { ring[b][head[b]++ & 63] = now; }
        last[b] = down;
    }

    public synchronized int count(int button, long now) {
        int n = 0;
        for (long t : ring[button]) if (t != 0 && now - t < 1000) n++;
        return n;
    }
}
