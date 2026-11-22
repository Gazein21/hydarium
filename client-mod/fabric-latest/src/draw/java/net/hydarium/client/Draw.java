package net.hydarium.client;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.lang.reflect.Proxy;
import java.util.List;

import net.minecraft.client.Minecraft;

import net.hydarium.core.Hud;
import net.hydarium.core.Painter;
import net.hydarium.core.Widget;

/**
 * Dessin du HUD DANS le jeu sur Minecraft 26.x (API HUD de Fabric). Installé par HydariumClient par réflexion : si cette classe ne se charge pas ou plante,
 * la raison est rapportée au launcher (HydariumClient.drawErr) et le HUD du launcher prend le relais.
 * Rien ici ne dépend d'une classe du jeu à la compilation (sauf Minecraft lui-même) : l'enregistrement du HUD passe par réflexion et par un proxy du
 * HudElement de Fabric, dont le nom de méthode et le type de paramètres ont changé d'une version à l'autre.
 */
public final class Draw {
    private Draw() {}
    private static int errors = 0;

    public static Object install() throws Exception {
        String hud = "net.fabricmc.fabric.api.client.rendering.v1.hud.";
        Class<?> registry = Class.forName(hud + "HudElementRegistry"), vanilla = Class.forName(hud + "VanillaHudElements"), element = Class.forName(hud + "HudElement"), identifier = Class.forName("net.minecraft.resources.Identifier");
        Object id = identifier.getMethod("fromNamespaceAndPath", String.class, String.class).invoke(null, "hydarium", "hud");
        Object chat = vanilla.getField("CHAT").get(null);
        InvocationHandler handler = (proxy, m, a) -> {
            if (m.isDefault()) return InvocationHandler.invokeDefault(proxy, m, a);
            if (m.getDeclaringClass() == Object.class) return m.getName().equals("hashCode") ? Integer.valueOf(System.identityHashCode(proxy)) : m.getName().equals("equals") ? Boolean.valueOf(proxy == a[0]) : "HydariumHud";
            if (a != null && a.length > 0) frame(a[0]);   // le 1er paramètre est le dessinateur (GuiGraphicsExtractor, ou GuiGraphics avant la 26.1)
            return null;
        };
        Object el = Proxy.newProxyInstance(Draw.class.getClassLoader(), new Class<?>[] {element}, handler);
        for (Method m : registry.getMethods())
            if (m.getName().equals("attachElementBefore") && m.getParameterCount() == 3 && Modifier.isStatic(m.getModifiers())) { m.invoke(null, chat, id, el); return Boolean.TRUE; }
        throw new NoSuchMethodException("HudElementRegistry.attachElementBefore");
    }

    private static void frame(Object g) {
        Minecraft mc = Minecraft.getInstance();
        long now = System.currentTimeMillis();
        int fr = HydariumClient.frames.frame(now); if (!HydariumClient.fpsNative) HydariumClient.state.fps = fr; // FPS : images réellement dessinées
        if (Gx.field(mc, "player") == null || Gx.hideGui(mc)) return;
        Object screen = Gx.screen(mc);
        if (screen != null && screen.getClass().getName().endsWith(".HudScreen")) return; // l'éditeur dessine lui-même les widgets (sinon les fonds seraient doublés)
        try {
            HydariumClient.cps.feed(HydariumClient.state.lmb, HydariumClient.state.rmb, now);
            HydariumClient.state.cpsL = HydariumClient.cps.count(0, now);
            HydariumClient.state.cpsR = HydariumClient.cps.count(1, now);
            List<Widget> ws = Hud.build(HydariumClient.cfg, HydariumClient.state);
            Painter.paintAll(ws, new HudCanvas(g), HydariumClient.state, HydariumClient.cfg.round(), now);
        } catch (Throwable t) {
            Gx.fail("dessin du HUD", t);
            if (++errors >= 3) { HydariumClient.drawing = false; } // 3 pannes : on rend la main au HUD du launcher plutôt que de planter ou de scintiller
        }
    }
}
