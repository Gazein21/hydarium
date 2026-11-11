package net.hydarium.client;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

import net.hydarium.core.Editor;

/**
 * Éditeur en jeu (26.x) : les VRAIS widgets, déplaçables à la souris (aimantation, réglages, cases à cocher). Toute la logique est dans le cœur (Editor).
 * La souris et le clavier sont LUS à chaque image plutôt que reçus par les méthodes d'événements du jeu (dont les signatures ont changé à chaque version récente) :
 * le seul point de contact avec Minecraft est extractRenderState. Échap est géré par le jeu. Ouvert par la touche de l'éditeur (Maj droite par défaut),
 * le bouton « Modifier en jeu » du launcher ou le menu Alt+H.
 */
public final class HudScreen extends Screen {
    private static final String[] KN = {"LEFT", "RIGHT", "UP", "DOWN", "NUMADD", "NUMSUB", "EQUALS", "MINUS", "R"};
    private static final int[] KC = {Editor.K_LEFT, Editor.K_RIGHT, Editor.K_UP, Editor.K_DOWN, Editor.K_PLUS, Editor.K_MINUS, Editor.K_PLUS, Editor.K_MINUS, Editor.K_RESET};

    private final Editor ed = new Editor(HydariumClient.cfg, HydariumClient.state);
    private boolean lDown, rDown; private final boolean[] was = new boolean[KN.length];

    private HudScreen() {
        super(Component.literal("Hydarium"));
        Minecraft mc = Minecraft.getInstance();
        lDown = Compat.mouseDown(mc, 0); rDown = Compat.mouseDown(mc, 1);   // le clic qui a ouvert l'écran ne compte pas
        for (int i = 0; i < KN.length; i++) was[i] = Compat.keyDown(mc, KN[i]);
    }

    public static Object open() { Gx.open(new HudScreen()); return Boolean.TRUE; }

    public boolean isPauseScreen() { return false; }

    @Override
    public void extractRenderState(GuiGraphicsExtractor g, int mx, int my, float delta) {
        Minecraft mc = Minecraft.getInstance();
        boolean l = Compat.mouseDown(mc, 0), r = Compat.mouseDown(mc, 1);
        if (l && !lDown) ed.press(mx, my, 0); else if (l) ed.drag(mx, my); else if (lDown) ed.release(mx, my);
        if (r && !rDown) ed.press(mx, my, 1);
        lDown = l; rDown = r;
        for (int i = 0; i < KN.length; i++) { boolean d = Compat.keyDown(mc, KN[i]); if (d && !was[i]) ed.key(KC[i]); was[i] = d; }
        ed.draw(new HudCanvas(g), mx, my, System.currentTimeMillis());
        if (ed.closeRequested) onClose();
    }

    @Override public void onClose() { ed.release(0, 0); super.onClose(); }
}
