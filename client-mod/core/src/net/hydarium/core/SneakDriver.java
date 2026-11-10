package net.hydarium.core;

/**
 * Sneak permanent (Forge 1.8.9, qui n'a pas l'option native). « Activé » = on reste accroupi, comme la marche auto : la touche d'usage (V par défaut) bascule le module ;
 * sneaker soi-même (appui sur la touche sneak du jeu) l'arrête. Toute la logique est ici (sans Minecraft) pour être testée ; l'adaptateur ne fait que brancher les 4 appels de {@link Host}
 * et appeler {@link #tick} (fin de tick), {@link #beforeMove} (juste avant que le joueur lise ses touches) et {@link #keyPressed} (évènement clavier du jeu).
 */
public final class SneakDriver {
    /** Ce que le jeu doit fournir. */
    public interface Host {
        boolean toggleKeyDown();            // la touche d'usage du module est enfoncée
        boolean sneakKeyDown();             // la touche sneak du jeu est RÉELLEMENT enfoncée (pas l'état que nous forçons)
        void setSneakKey(boolean down);     // règle l'état « enfoncé » de la touche sneak du jeu
        void say(String text);              // message court dans le jeu
    }

    private final SneakLock lock = new SneakLock();
    private boolean toggleWas, forced;
    private volatile boolean hold, manual;

    /** Fin de tick. */
    public void tick(Config cfg, Host h, boolean typing) {
        boolean en = "en".equals(cfg.lang());
        if (!typing) {
            boolean td = h.toggleKeyDown();
            if (td && !toggleWas) { boolean now = cfg.toggle("togglesneak"); h.say(en ? (now ? "Sneak: on" : "Sneak: off") : (now ? "Sneak : activé" : "Sneak : arrêté")); }
            toggleWas = td;
        }
        boolean real = h.sneakKeyDown(), on = Features.sneak(cfg), man = lock.manual(real, on, typing) | manual; // « | » : l'état de la touche est toujours mis à jour
        manual = false;
        if (on && man && !typing) { cfg.toggle("togglesneak"); on = false; h.say(en ? "Sneak: off" : "Sneak : arrêté"); }
        if (on) { if (!typing) { h.setSneakKey(true); forced = true; } }
        else if (forced && !typing) { h.setSneakKey(real); forced = false; } // module coupé : la touche reprend son état réel
        hold = on;
    }

    /** Début du tick du joueur, AVANT qu'il lise ses touches : on remet la touche sneak enfoncée, quoi que le jeu ait fait entre-temps (relâchement, menu fermé…). */
    public void beforeMove(Host h, boolean typing) { if (hold && !typing) h.setSneakKey(true); }

    /** La touche sneak du jeu vient d'être pressée (évènement clavier) : si le module est actif, il s'arrêtera à la fin du tick, même pour un appui plus court qu'un tick. */
    public void keyPressed() { if (hold) manual = true; }

    public boolean active() { return hold; }

    /** Quitter le monde. */
    public void reset() { lock.reset(); toggleWas = false; forced = false; hold = false; manual = false; }
}
