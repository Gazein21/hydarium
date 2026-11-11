package net.hydarium.client;

import java.util.ArrayList;
import java.util.List;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.ItemStack;

import net.hydarium.core.Canvas;

/** Surface de dessin du cœur sur Minecraft 26.x (GuiGraphicsExtractor) : sert au HUD (Draw), à l'éditeur (HudScreen) et au menu (MenuScreen). */
final class HudCanvas implements Canvas {
    private final GuiGraphicsExtractor g; private final Minecraft mc = Minecraft.getInstance(); private final Font font = mc.font; private final int W, H;
    HudCanvas(GuiGraphicsExtractor g) { this.g = g; W = mc.getWindow().getGuiScaledWidth(); H = mc.getWindow().getGuiScaledHeight(); }
    public int width() { return W; } public int height() { return H; }
    public int textWidth(String s) { return font.width(s); } public int fontHeight() { return font.lineHeight; }
    public void fill(int x, int y, int w, int h, int c) { g.fill(x, y, x + w, y + h, c); }
    /** Depuis 1.21.6 la couleur du texte est de l'ARGB : sans opacité le texte serait transparent. */
    public void text(String s, int x, int y, int c, boolean sh) { g.text(font, s, x, y, (c >>> 24) == 0 ? (c | 0xFF000000) : c, sh); }
    public void push(double tx, double ty, double s) { Gx.push(g, tx, ty, s); }
    public void pop() { Gx.pop(g); }
    public void icon(String kind, int k, int x, int y) {
        if (mc.player == null || !"armor".equals(kind)) return;   // les icônes d'effets viendront plus tard
        List<ItemStack> out = new ArrayList<ItemStack>();
        for (EquipmentSlot sl : new EquipmentSlot[] {EquipmentSlot.HEAD, EquipmentSlot.CHEST, EquipmentSlot.LEGS, EquipmentSlot.FEET}) { ItemStack it = mc.player.getItemBySlot(sl); if (!it.isEmpty()) out.add(it); }
        if (k < out.size()) Gx.item(g, out.get(k), x, y);
    }
}
