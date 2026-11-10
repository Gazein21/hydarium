package net.hydarium.client;

import java.util.List;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.renderer.texture.TextureAtlasSprite;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.ItemStack;

import net.hydarium.core.Canvas;

/** Surface de dessin du cœur sur GuiGraphics (Minecraft 1.21) : sert au HUD en partie (Draw) et à l'éditeur en jeu (HudScreen). */
final class HudCanvas implements Canvas {
    private final GuiGraphics g; private final Minecraft mc = Minecraft.getInstance(); private final Font font = mc.font; private final int W, H;
    HudCanvas(GuiGraphics g) { this.g = g; W = g.guiWidth(); H = g.guiHeight(); }
    public int width() { return W; } public int height() { return H; }
    public int textWidth(String s) { return font.width(s); } public int fontHeight() { return font.lineHeight; }
    public void fill(int x, int y, int w, int h, int c) { g.fill(x, y, x + w, y + h, c); }
    public void text(String s, int x, int y, int c, boolean sh) { g.drawString(font, s, x, y, c, sh); }
    public void push(double tx, double ty, double s) { g.pose().pushPose(); g.pose().translate(tx, ty, 0); g.pose().scale((float) s, (float) s, 1f); }
    public void pop() { g.pose().popPose(); }
    public void icon(String kind, int k, int x, int y) {
        if (mc.player == null) return;
        if ("armor".equals(kind)) { List<ItemStack> a = armorStacks(mc); if (k < a.size()) g.renderItem(a.get(k), x, y); }
        else if ("fx".equals(kind)) { java.util.List<MobEffectInstance> f = new java.util.ArrayList<MobEffectInstance>(mc.player.getActiveEffects()); if (k < f.size()) { try { TextureAtlasSprite sp = mc.getMobEffectTextures().get(f.get(k).getEffect()); g.blit(x, y, 0, 16, 16, sp); } catch (Throwable ignored) { } } }
    }

    /** Pièces d'armure portées, dans l'ordre casque → bottes, sans les emplacements vides (même ordre que les lignes du widget). */
    private static List<ItemStack> armorStacks(Minecraft mc) {
        java.util.List<ItemStack> out = new java.util.ArrayList<ItemStack>();
        EquipmentSlot[] slots = {EquipmentSlot.HEAD, EquipmentSlot.CHEST, EquipmentSlot.LEGS, EquipmentSlot.FEET};
        for (EquipmentSlot sl : slots) { ItemStack it = mc.player.getItemBySlot(sl); if (!it.isEmpty()) out.add(it); }
        return out;
    }
}
