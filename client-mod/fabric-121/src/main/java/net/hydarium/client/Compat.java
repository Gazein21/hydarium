package net.hydarium.client;

import org.lwjgl.glfw.GLFW;

import net.minecraft.client.Minecraft;

/**
 * Minecraft 1.21 / 1.21.1 : ce qui dépend de la version du jeu. Appels directs (Loom les adapte aux noms réels du jeu) : en 1.20.1 le jeu est obfusqué à l'exécution,
 * une réflexion par nom « Mojang » n'y marcherait pas. GLFW existe encore sur cette version.
 */
final class Compat {
    private Compat() {}

    /** Un écran (menu, chat, inventaire…) est ouvert : on ne lit alors ni les touches de zoom. */
    static boolean hasScreen(Minecraft mc) { return mc.screen != null; }

    /** Écran « Packs de ressources » ouvert ? (Options › Packs de ressources : son titre est la clé de traduction « resourcePack.title », donc indépendant de la langue du jeu.) Renvoie « resourcepacks » ou « ». */
    static String screenKind(Minecraft mc) {
        try {
            net.minecraft.client.gui.screens.Screen s = mc.screen; if (s == null) return "";
            Object c = s.getTitle().getContents();
            if (c instanceof net.minecraft.network.chat.contents.TranslatableContents && "resourcePack.title".equals(((net.minecraft.network.chat.contents.TranslatableContents) c).getKey())) return "resourcepacks";
        } catch (Throwable t) { /* nom ou signature différent : on ne signale rien */ }
        return "";
    }

    private static long handle(Minecraft mc) { return mc.getWindow().getWindow(); }

    /** Touche du launcher (« C », « F6 », « ALT »…) enfoncée ? */
    static boolean keyDown(Minecraft mc, String key) {
        int c = GlfwKeys.code(key); long h = handle(mc);
        return c > 0 && h != 0 && GLFW.glfwGetKey(h, c) == GLFW.GLFW_PRESS;
    }


    /** Écrit directement la valeur d'une option (luminosité, champ de vision) sans passer par la validation du jeu, qui refuse tout ce qui sort du curseur. Via l'accesseur Mixin (le champ est obfusqué à l'exécution). */
    static void setRaw(Object option, Object value) {
        try { ((net.hydarium.client.mixin.OptionInstanceAccessor) option).hyd$setValue(value); } catch (Throwable t) { /* accesseur non appliqué : tant pis, l'option garde sa valeur */ }
    }

    /** Durée de l'effet posé par le mod (en ticks) et seuil au-dessus duquel un effet « Vision nocturne » est reconnu comme le nôtre (une vraie potion dure beaucoup moins). */
    static final int NV_LEN = 1000000, NV_MARK = 400000;

    /** Luminosité = vision nocturne : un vrai effet « Vision nocturne » posé côté client (sans particules ni icône) tant que le module est actif, retiré à l'extinction. Une vraie potion n'est jamais retirée. */
    static void nightVision(net.minecraft.world.entity.player.Player p, boolean on) {
        try {
            net.minecraft.world.effect.MobEffectInstance cur = p.getEffect(net.minecraft.world.effect.MobEffects.NIGHT_VISION);
            if (on) { if (cur == null || cur.getDuration() < NV_MARK) p.addEffect(new net.minecraft.world.effect.MobEffectInstance(net.minecraft.world.effect.MobEffects.NIGHT_VISION, NV_LEN, 0, false, false, false)); }
            else if (cur != null && cur.getDuration() > NV_MARK) p.removeEffect(net.minecraft.world.effect.MobEffects.NIGHT_VISION);
        } catch (Throwable t) { /* effet inconnu de cette version : la luminosité ne fait rien, le jeu continue */ }
    }


    /** Caméra cinématique du jeu (Options.smoothCamera) : lue / écrite par l'accesseur Mixin (le champ est obfusqué à l'exécution). Faux / sans effet si l'accesseur n'est pas appliqué. */
    static boolean getSmooth(Minecraft mc) {
        try { Object o = mc.options; return ((net.hydarium.client.mixin.OptionsAccessor) o).hyd$getSmooth(); } catch (Throwable t) { return false; }
    }

    static void setSmooth(Minecraft mc, boolean on) {
        try { Object o = mc.options; ((net.hydarium.client.mixin.OptionsAccessor) o).hyd$setSmooth(on); } catch (Throwable t) { /* accesseur non appliqué : pas de caméra cinématique, le zoom marche quand même */ }
    }

    private static long scrollHookedFor;

    /**
     * Molette : on s'intercale devant le rappel de GLFW du jeu. Quand le zoom est actif, le cran sert à régler le zoom et n'est PAS transmis au jeu (la case d'inventaire ne change pas) ;
     * sinon il est transmis tel quel (cases, listes des menus…). Même fil que le jeu (celui qui appelle glfwPollEvents). Renvoie vrai si l'interception est en place.
     */
    static boolean hookScroll(Minecraft mc, final net.hydarium.core.Zoom.Sink sink) {
        try {
            final long h = handle(mc); if (h == 0) return false; if (h == scrollHookedFor) return true;
            final org.lwjgl.glfw.GLFWScrollCallback[] prev = new org.lwjgl.glfw.GLFWScrollCallback[1];
            org.lwjgl.glfw.GLFWScrollCallback ours = new org.lwjgl.glfw.GLFWScrollCallback() {
                @Override public void invoke(long window, double xoffset, double yoffset) {
                    boolean used = false; try { used = sink.onScroll(yoffset); } catch (Throwable t) { used = false; }
                    if (!used && prev[0] != null) prev[0].invoke(window, xoffset, yoffset);
                }
            };
            prev[0] = GLFW.glfwSetScrollCallback(h, ours);
            scrollHookedFor = h; return true;
        } catch (Throwable t) { return false; }
    }

    /** Pas utilisé ici : la molette est interceptée directement (hookScroll). */
    static double slotScroll(Minecraft mc, Object player, boolean active) { return 0; }

    /** Bouton de souris : 0 = gauche, 1 = droit. */
    static boolean mouseDown(Minecraft mc, int button) {
        long h = handle(mc);
        return h != 0 && GLFW.glfwGetMouseButton(h, button) == (GLFW.GLFW_PRESS);
    }

    private static long noIconifyFor;

    /** Plein écran : quand le menu Hydarium (Alt+H) prend le focus, GLFW réduit par défaut la fenêtre du jeu (« auto-iconify »). On désactive ce réflexe pour que le jeu reste à l'écran. */
    static void keepFullscreen(Minecraft mc) {
        try {
            long h = handle(mc);
            if (h != 0 && h != noIconifyFor) { GLFW.glfwSetWindowAttrib(h, GLFW.GLFW_AUTO_ICONIFY, GLFW.GLFW_FALSE); noIconifyFor = h; }
        } catch (Throwable t) { /* GLFW trop ancien pour cet attribut : le launcher remet la fenêtre en place de son côté */ }
    }
}
