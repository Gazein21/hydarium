package net.hydarium.client;

import java.util.List;

import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;

import net.hydarium.core.Hud;
import net.hydarium.core.Painter;
import net.hydarium.core.Widget;

/** Dessin du HUD sur Minecraft 1.21 (GuiGraphics). Installé par HydariumClient via réflexion. Tout le dessin est dans le cœur (Painter) : ici seulement la surface de dessin (Cv). */
public final class Draw {
    private Draw() {}

    public static Object install() {
        HudRenderCallback.EVENT.register(Draw::render);
        return Boolean.TRUE;
    }

    private static void render(GuiGraphics g, net.minecraft.client.DeltaTracker delta) {
        Minecraft mc = Minecraft.getInstance();
        { long t0 = System.currentTimeMillis(); int fr = HydariumClient.frames.frame(t0); if (!HydariumClient.fpsNative) HydariumClient.state.fps = fr; } // FPS : images réellement dessinées
        if (mc.options.hideGui || mc.player == null || mc.screen instanceof HudScreen) return; // l'éditeur dessine lui-même les widgets (sinon les fonds seraient doublés)
        HydariumClient.cps.feed(HydariumClient.state.lmb, HydariumClient.state.rmb, System.currentTimeMillis());
        HydariumClient.state.cpsL = HydariumClient.cps.count(0, System.currentTimeMillis());
        HydariumClient.state.cpsR = HydariumClient.cps.count(1, System.currentTimeMillis());
        List<Widget> ws = Hud.build(HydariumClient.cfg, HydariumClient.state);
        Painter.paintAll(ws, new HudCanvas(g), HydariumClient.state, HydariumClient.cfg.round(), System.currentTimeMillis());
    }
}
