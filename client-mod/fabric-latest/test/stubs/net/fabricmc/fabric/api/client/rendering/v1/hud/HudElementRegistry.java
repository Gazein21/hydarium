package net.fabricmc.fabric.api.client.rendering.v1.hud; public class HudElementRegistry { public static HudElement last; public static String where;
  public static void attachElementBefore(net.minecraft.resources.Identifier before, net.minecraft.resources.Identifier id, HudElement e){ last = e; where = before.s + "<-" + id.s; } }
