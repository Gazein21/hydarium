package net.hydarium.client;

import java.util.List;

import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.renderer.texture.TextureAtlasSprite;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.ItemStack;

import net.hydarium.core.Hud;
import net.hydarium.core.State;
import net.hydarium.core.Widget;

/** Dessin du HUD sur Minecraft 1.20.1 (GuiGraphics). Installé par HydariumClient via réflexion. */
public final class Draw {
    private Draw() {}

    private static boolean rd = true; // cases à coins légèrement arrondis (réglage « Style des cases » du launcher)

    private static void box(GuiGraphics g, int x, int y, int w, int h, int c) { for (int[] r : net.hydarium.core.Round.rects(w, h, rd)) g.fill(x + r[0], y + r[1], x + r[0] + r[2], y + r[1] + r[3], c); }

    private static final net.hydarium.core.Marquee.Measure MZ = new net.hydarium.core.Marquee.Measure() { public int width(String s) { return Minecraft.getInstance().font.width(s); } };

    public static Object install() {
        HudRenderCallback.EVENT.register(Draw::render);
        return Boolean.TRUE;
    }

    private static void render(GuiGraphics g, float delta) {
        Minecraft mc = Minecraft.getInstance();
        if (mc.options.hideGui || mc.player == null) return;
        HydariumClient.cps.feed(HydariumClient.state.lmb, HydariumClient.state.rmb, System.currentTimeMillis());
        HydariumClient.state.cpsL = HydariumClient.cps.count(0, System.currentTimeMillis());
        HydariumClient.state.cpsR = HydariumClient.cps.count(1, System.currentTimeMillis());
        List<Widget> ws = Hud.build(HydariumClient.cfg, HydariumClient.state); rd = HydariumClient.cfg.round();
        Font font = mc.font; int W = g.guiWidth(), H = g.guiHeight();
        for (Widget w : ws) {
            int a = (int) Math.round(Math.max(.1, Math.min(1, w.opacity)) * 255) << 24, col = a | w.color, bg = (int) Math.round(w.opacity * 102) << 24;
            int bw, bh; List<String> l = w.lines; boolean ic = w.icons; int lh = ic ? 18 : font.lineHeight + 1, tx = ic ? 22 : 3;
            boolean scr = false; if (w.maxWidth > 0 && !l.isEmpty() && font.width(l.get(0)) > w.maxWidth) { l.set(0, net.hydarium.core.Marquee.window(l.get(0), w.keep, w.maxWidth, MZ, System.currentTimeMillis())); scr = true; } // titre trop long : il défile
            int nm = w.sub < 0 ? l.size() : Math.min(w.sub, l.size()), ns = l.size() - nm, sh = lh * 3 / 4; // lignes « petites » (artiste) : 75 % de la taille
            if (w.keys) { bw = 58; bh = 58; }
            else { int mw = 0; for (int k = 0; k < l.size(); k++) mw = Math.max(mw, k < nm ? font.width(l.get(k)) : (int) Math.ceil(font.width(l.get(k)) * .75)); if (scr) mw = Math.max(mw, w.maxWidth); bw = mw + tx + 3; bh = nm * lh + ns * sh + 3; }
            double s = w.scale; int px = (int) Math.min(w.x * W, Math.max(0, W - bw * s - 1)), py = (int) Math.min(w.y * H, Math.max(0, H - bh * s - 1));
            g.pose().pushPose(); g.pose().translate(px, py, 0); g.pose().scale((float) s, (float) s, 1f);
            if (w.keys) keys(g, font, HydariumClient.state, a);
            else {
                if (w.bg) box(g, 0, 0, bw, bh, bg);
                int inner = bw - tx - 3; // largeur du texte : chaque ligne y est centrée (sauf avec icônes)
                java.util.List<ItemStack> armor = "armor".equals(w.id) && ic ? armorStacks(mc) : null; java.util.List<MobEffectInstance> fx = "potions".equals(w.id) && ic ? new java.util.ArrayList<MobEffectInstance>(mc.player.getActiveEffects()) : null;
                for (int k = 0; k < nm; k++) {
                    int ty = ic ? 2 + k * lh + (lh - font.lineHeight) / 2 - 1 : 3 + k * lh, lx = ic ? tx : tx + (inner - font.width(l.get(k))) / 2;
                    if (armor != null && k < armor.size()) { g.renderItem(armor.get(k), 3, 1 + k * lh); }
                    else if (fx != null && k < fx.size()) { try { TextureAtlasSprite sp = mc.getMobEffectTextures().get(fx.get(k).getEffect()); g.blit(3, 1 + k * lh, 0, 16, 16, sp); } catch (Throwable ignored) { } }
                    g.drawString(font, l.get(k), lx, ty, a | w.colorOf(k), true);
                }
                for (int k = nm; k < l.size(); k++) { // artiste : plus petit et plus transparent, juste sous le titre
                    int sc = ((int) ((col >>> 24 & 0xFF) * .6) << 24) | (col & 0xFFFFFF);
                    g.pose().pushPose(); g.pose().translate(tx + (inner - (int) Math.ceil(font.width(l.get(k)) * .75)) / 2, 3 + nm * lh + (k - nm) * sh, 0); g.pose().scale(.75f, .75f, 1f); g.drawString(font, l.get(k), 0, 0, sc, true); g.pose().popPose();
                }
            }
            g.pose().popPose();
        }
    }

    /** Pièces d'armure portées, dans l'ordre casque → bottes, sans les emplacements vides (même ordre que les lignes du widget). */
    private static java.util.List<ItemStack> armorStacks(Minecraft mc) {
        java.util.List<ItemStack> out = new java.util.ArrayList<ItemStack>();
        EquipmentSlot[] slots = {EquipmentSlot.HEAD, EquipmentSlot.CHEST, EquipmentSlot.LEGS, EquipmentSlot.FEET};
        for (EquipmentSlot sl : slots) { ItemStack it = mc.player.getItemBySlot(sl); if (!it.isEmpty()) out.add(it); }
        return out;
    }

    private static void keys(GuiGraphics g, Font f, State s, int a) {
        cell(g, f, 20, 0, 18, s.lw, s.w, a); cell(g, f, 0, 20, 18, s.la, s.a, a); cell(g, f, 20, 20, 18, s.ls, s.s, a); cell(g, f, 40, 20, 18, s.ld, s.d, a);
        box(g, 0, 40, 58, 18, (s.space ? 0x99FFFFFF : 0x66000000) & 0x00FFFFFF | (a >>> 1 & 0xFF000000)); g.fill(14, 48, 44, 50, s.space ? 0xFF000000 : 0xFFFFFFFF);
    }

    private static void cell(GuiGraphics g, Font f, int x, int y, int sz, String t, boolean on, int a) {
        box(g, x, y, sz, sz, (on ? 0x99FFFFFF : 0x66000000) & 0x00FFFFFF | (a >>> 1 & 0xFF000000));
        g.drawString(f, t, x + (sz - f.width(t)) / 2, y + (sz - 8) / 2, on ? 0xFF000000 : 0xFFFFFFFF, false);
    }
}
