package net.hydarium.client;

import net.minecraft.client.Minecraft;
import net.minecraftforge.common.MinecraftForge;
import net.minecraftforge.event.TickEvent;

/** Branche le client Hydarium sur les évènements de Forge (GÉNÉRÉ par client-mod/forge-gen). Le cœur (HydariumClient) ne connaît aucun loader. */
final class ClientSetup {
    private ClientSetup() {}

    static void run() {
        HydariumClient.init();
        MinecraftForge.EVENT_BUS.addListener((TickEvent.ClientTickEvent e) -> {
            if (e.phase == TickEvent.Phase.END) { try { HydariumClient.onTick(Minecraft.getInstance()); } catch (Throwable ignored) { } }
        });
        MinecraftForge.EVENT_BUS.addListener((TickEvent.RenderTickEvent e) -> { if (e.phase == TickEvent.Phase.END) HydariumClient.frame(); }); // compteur d'images (FPS) sans réflexion
        // les réglages temporaires (champ de vision…) ne doivent pas finir dans options.txt
        Runtime.getRuntime().addShutdownHook(new Thread(() -> { try { HydariumClient.restore(Minecraft.getInstance()); } catch (Throwable ignored) { } }));
    }
}
