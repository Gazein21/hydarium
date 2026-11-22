package net.hydarium.client; import net.hydarium.core.*; import java.util.*; import net.minecraft.client.gui.GuiGraphicsExtractor;
public class HudProbe { public static void main(String[] a) throws Exception {
  java.io.File tf = java.io.File.createTempFile("hyd", ".json"); java.nio.file.Files.write(tf.toPath(), "{\"version\":1,\"modules\":{\"fps\":{\"on\":true},\"coords\":{\"on\":true}}}".getBytes("UTF-8")); HydariumClient.cfg = new Config(tf.getPath()); HydariumClient.cfg.poll(); HydariumClient.state.inWorld = true; HydariumClient.state.x = 12; HydariumClient.state.y = 64; HydariumClient.state.z = -3;
  Object r = Draw.install(); System.out.println("install=" + r + " where=" + net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry.where);
  net.fabricmc.fabric.api.client.rendering.v1.hud.HudElement el = net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry.last;
  el.extractRenderState(new GuiGraphicsExtractor(), null);
  List<String> L = GuiGraphicsExtractor.log; long f = L.stream().filter(s -> s.startsWith("F")).count(), t = L.stream().filter(s -> s.startsWith("T")).count();
  System.out.println("fills=" + f + " texts=" + t + " wrong=" + L.stream().filter(s -> s.startsWith("WRONG")).count() + " transparent=" + L.stream().filter(s -> s.contains("!transparent")).count() + " err='" + HydariumClient.drawErr + "'");
  System.out.println(L.stream().filter(s -> s.startsWith("T")).limit(4).toList());
  // F1 : interface cachée → rien
  GuiGraphicsExtractor.log.clear(); net.minecraft.client.Minecraft.getInstance().options.hideGui = true; el.extractRenderState(new GuiGraphicsExtractor(), null); System.out.println("hideGui → dessins=" + GuiGraphicsExtractor.log.size());
  // écrans : ouverture via setScreenAndShow
  net.minecraft.client.Minecraft.getInstance().options.hideGui = false; Object scr = new Object(); Gx.open(scr); System.out.println("open → " + (net.minecraft.client.Minecraft.getInstance().gui.cur == scr));
  // fps compté quand le compteur du jeu n'est pas lisible
  HydariumClient.state.fps = 0; long t0 = System.currentTimeMillis(); for (int i = 0; i < 5; i++) el.extractRenderState(new GuiGraphicsExtractor(), null); System.out.println("frames comptées ok");
} }
