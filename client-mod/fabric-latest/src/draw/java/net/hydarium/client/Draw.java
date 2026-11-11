package net.hydarium.client;

import java.util.List;

import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.VanillaHudElements;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.resources.Identifier;

import net.hydarium.core.Hud;
import net.hydarium.core.Painter;
import net.hydarium.core.Widget;

/** Dessin du HUD DANS le jeu sur Minecraft 26.x (API HUD de Fabric). Installé par HydariumClient via réflexion : si cette classe ne se charge pas, le HUD du launcher prend le relais. */
public final class Draw {
    private Draw() {}

    public static Object install() {
        HudElementRegistry.attachElementBefore(VanillaHudElements.CHAT, Identifier.fromNamespaceAndPath("hydarium", "hud"), Draw::extract);
        return Boolean.TRUE;
    }

    private static void extract(GuiGraphicsExtractor g, DeltaTracker delta) {
        Minecraft mc = Minecraft.getInstance();
        { long t0 = System.currentTimeMillis(); int fr = HydariumClient.frames.frame(t0); if (!HydariumClient.fpsNative) HydariumClient.state.fps = fr; } // FPS : images réellement dessinées
        if (mc.player == null || Gx.hideGui(mc) || Gx.screen(mc) instanceof HudScreen) return; // l'éditeur dessine lui-même les widgets (sinon les fonds seraient doublés)
        long now = System.currentTimeMillis();
        HydariumClient.cps.feed(HydariumClient.state.lmb, HydariumClient.state.rmb, now);
        HydariumClient.state.cpsL = HydariumClient.cps.count(0, now);
        HydariumClient.state.cpsR = HydariumClient.cps.count(1, now);
        List<Widget> ws = Hud.build(HydariumClient.cfg, HydariumClient.state);
        Painter.paintAll(ws, new HudCanvas(g), HydariumClient.state, HydariumClient.cfg.round(), now);
    }
}
