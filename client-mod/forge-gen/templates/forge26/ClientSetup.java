package net.hydarium.client;

import java.util.concurrent.atomic.AtomicBoolean;
import net.minecraft.client.Minecraft;

/**
 * Branche le cœur Hydarium sur le jeu (GÉNÉRÉ par client-mod/forge-gen).
 * Le tick n'est PAS pris sur un évènement de Forge : leur nom a changé avec EventBus 7 et n'est pas dans le MDK. On utilise à la place l'API du jeu lui-même,
 * stable : un fil léger demande au fil principal d'exécuter onTick toutes les 50 ms (Minecraft.execute), sans jamais en empiler deux.
 * À remplacer par l'évènement de tick de Forge une fois son nom vérifié contre le jar de Forge 26.x.
 */
final class ClientSetup {
    private ClientSetup() {}
    private static boolean started;

    static synchronized void run() {
        if (started) return; started = true;
        HydariumClient.init();
        final Minecraft mc = Minecraft.getInstance();
        final AtomicBoolean pending = new AtomicBoolean();
        Thread t = new Thread(() -> {
            while (true) {
                try { Thread.sleep(50); } catch (InterruptedException e) { return; }
                if (pending.compareAndSet(false, true)) mc.execute(() -> { try { HydariumClient.onTick(mc); } catch (Throwable ignored) { } finally { pending.set(false); } });
            }
        }, "hydarium-tick");
        t.setDaemon(true); t.start();
        // les réglages temporaires (champ de vision…) ne doivent pas finir dans options.txt
        Runtime.getRuntime().addShutdownHook(new Thread(() -> { try { HydariumClient.restore(mc); } catch (Throwable ignored) { } }));
    }
}
