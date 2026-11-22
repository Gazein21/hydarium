package net.hydarium.client;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

import net.hydarium.core.Features;
import net.hydarium.core.Menu;

/**
 * Menu Hydarium en jeu (26.x), ouvert par le raccourci du launcher (Alt+H par défaut) : un vrai écran du jeu, plus de fenêtre par-dessus ni de bascule.
 * Toute la logique est dans le cœur (Menu) ; comme pour l'éditeur, la souris est lue à chaque image (une seule méthode du jeu est surchargée).
 * Le même raccourci referme le menu ; Échap aussi (géré par le jeu).
 */
public final class MenuScreen extends Screen {
    private final Menu menu = new Menu(HydariumClient.cfg, new Menu.Host() {
        public void editor() { HudScreen.open(); }
        public void launcher(String page) { HydariumClient.openLauncher(page); }
    });
    private boolean lDown, chordDown = true;   // le raccourci qui a ouvert l'écran est encore tenu : il ne doit pas le refermer aussitôt

    private MenuScreen() { super(Component.literal("Hydarium")); lDown = Compat.mouseDown(Minecraft.getInstance(), 0); }

    public static Object open() { Gx.open(new MenuScreen()); return Boolean.TRUE; }

    public boolean isPauseScreen() { return false; }

    @Override
    public void extractRenderState(GuiGraphicsExtractor g, int mx, int my, float delta) {
        Minecraft mc = Minecraft.getInstance();
        boolean l = Compat.mouseDown(mc, 0);
        if (l && !lDown) menu.press(mx, my, 0);
        lDown = l;
        String[] chord = Features.menuChord(HydariumClient.cfg); boolean cd = chord.length > 0;
        for (int i = 0; cd && i < chord.length; i++) if (!Compat.keyDown(mc, chord[i])) cd = false;
        if (cd && !chordDown) menu.closeRequested = true;
        chordDown = cd;
        menu.draw(new HudCanvas(g), mx, my);
        if (menu.closeRequested) onClose();
    }
}
