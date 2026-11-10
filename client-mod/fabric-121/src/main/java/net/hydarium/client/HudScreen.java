package net.hydarium.client;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

import net.hydarium.core.Editor;

/**
 * Éditeur en jeu : les VRAIS widgets, déplaçables à la souris (aimantation, réglages, cases à cocher). Toute la logique est dans le cœur (Editor) ;
 * ici seulement la souris, le clavier et la surface de dessin. Ouvert par la touche de l'éditeur (Maj droite par défaut) ou par le bouton « Modifier en jeu » du launcher.
 * HydariumClient le cherche par réflexion : sur une version sans cet écran, le HUD du launcher prend le relais.
 */
public final class HudScreen extends Screen {
    private final Editor ed = new Editor(HydariumClient.cfg, HydariumClient.state);

    private HudScreen() { super(Component.literal("Hydarium")); }

    public static Object open() { Minecraft.getInstance().setScreen(new HudScreen()); return Boolean.TRUE; }

    @Override public boolean isPauseScreen() { return false; }

    @Override public void render(GuiGraphics g, int mx, int my, float delta) { ed.draw(new HudCanvas(g), mx, my, System.currentTimeMillis()); }

    @Override public boolean mouseClicked(double x, double y, int b) { ed.press((int) x, (int) y, b); end(); return true; }
    @Override public boolean mouseDragged(double x, double y, int b, double dx, double dy) { ed.drag((int) x, (int) y); return true; }
    @Override public boolean mouseReleased(double x, double y, int b) { ed.release((int) x, (int) y); return true; }

    /** Échap, flèches et pavé numérique ici (codes GLFW) ; « + », « - » et « R » dans charTyped (indépendant de la disposition du clavier, AZERTY compris). */
    @Override public boolean keyPressed(int key, int scan, int mods) {
        int k = key == 256 ? Editor.K_ESC : key == 263 ? Editor.K_LEFT : key == 262 ? Editor.K_RIGHT : key == 265 ? Editor.K_UP : key == 264 ? Editor.K_DOWN : key == 334 ? Editor.K_PLUS : key == 333 ? Editor.K_MINUS : 0;
        if (k == 0) return super.keyPressed(key, scan, mods);
        ed.key(k); end(); return true;
    }

    @Override public boolean charTyped(char c, int mods) {
        int k = c == '+' ? Editor.K_PLUS : c == '-' ? Editor.K_MINUS : (c == 'r' || c == 'R') ? Editor.K_RESET : 0;
        if (k == 0) return super.charTyped(c, mods);
        ed.key(k); return true;
    }

    @Override public void onClose() { ed.release(0, 0); super.onClose(); }

    private void end() { if (ed.closeRequested) onClose(); }
}
