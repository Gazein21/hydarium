package net.hydarium.client;

import java.lang.reflect.Field;
import java.lang.reflect.Method;

import net.minecraft.client.Minecraft;

/**
 * Versions récentes (26.x, jeu non obfusqué : les noms sont les mêmes à l'exécution, la réflexion est donc fiable).
 * Tout ce qui a changé d'une 26.x à l'autre est cherché par réflexion et dégrade proprement (renvoie « faux ») au lieu d'empêcher la compilation ou le chargement :
 *  - 26.2 : Minecraft.screen déplacé vers Minecraft.gui.screen() ;
 *  - 26.3 : GLFW remplacé par SDL3 ; InputConstants.isKeyDown ne prend plus la fenêtre et utilise d'autres codes de touches
 *    (on demande donc le code à InputConstants.getKey(« key.keyboard.c ») au lieu de les écrire en dur).
 */
final class Compat {
    private Compat() {}

    private static boolean screenInit, inputInit, mouseInit;
    private static Field screenField, guiField, mouseField;
    private static Method screenMethod, getKey, keyValue, isKeyDown, leftPressed, rightPressed;
    private static boolean keyNeedsWindow;

    /** Écran « Packs de ressources » ouvert ? Titre = clé de traduction « resourcePack.title » (indépendant de la langue). Réflexion : dégrade en « » si quelque chose a changé. */
    static String screenKind(Minecraft mc) {
        try {
            if (!hasScreen(mc)) return ""; // initialise aussi les champs de réflexion
            Object s = screenField != null ? screenField.get(mc) : screenMethod != null ? screenMethod.invoke(guiField.get(mc)) : null; if (s == null) return "";
            Object title = s.getClass().getMethod("getTitle").invoke(s), c = title.getClass().getMethod("getContents").invoke(title);
            if (c != null && c.getClass().getSimpleName().equals("TranslatableContents") && "resourcePack.title".equals(String.valueOf(c.getClass().getMethod("getKey").invoke(c)))) return "resourcepacks";
        } catch (Throwable t) { /* tant pis */ }
        return "";
    }

    static boolean hasScreen(Minecraft mc) {
        try {
            if (!screenInit) {
                screenInit = true;
                try { screenField = Minecraft.class.getField("screen"); }                                   // ≤ 26.1
                catch (NoSuchFieldException e) {
                    guiField = Minecraft.class.getField("gui"); screenMethod = guiField.getType().getMethod("screen"); // ≥ 26.2
                }
            }
            Object s = screenField != null ? screenField.get(mc) : screenMethod != null ? screenMethod.invoke(guiField.get(mc)) : null;
            return s != null;
        } catch (Throwable t) { return false; }
    }

    private static void initInput() {
        if (inputInit) return; inputInit = true;
        try {
            Class<?> ic = Class.forName("com.mojang.blaze3d.platform.InputConstants");
            for (Method m : ic.getMethods()) {
                if (m.getName().equals("getKey") && m.getParameterCount() == 1 && m.getParameterTypes()[0] == String.class) getKey = m;
                if (m.getName().equals("isKeyDown") && java.lang.reflect.Modifier.isStatic(m.getModifiers())) {
                    if (m.getParameterCount() == 1 && m.getParameterTypes()[0] == int.class) { isKeyDown = m; keyNeedsWindow = false; }       // 26.3 et après
                    else if (m.getParameterCount() == 2 && isKeyDown == null) { isKeyDown = m; keyNeedsWindow = true; }                     // 26.1 / 26.2
                }
            }
            if (getKey != null) keyValue = getKey.getReturnType().getMethod("getValue");
        } catch (Throwable t) { getKey = null; isKeyDown = null; }
    }

    /** Nom de touche du launcher → « key.keyboard.xxx » (voir net.hydarium.core.Keys). */
    private static String keyName(String k) { return net.hydarium.core.Keys.mc(k); }

    static boolean keyDown(Minecraft mc, String key) {
        try {
            initInput(); String n = keyName(key); if (n == null || getKey == null || isKeyDown == null || keyValue == null) return false;
            Object k = getKey.invoke(null, n); if (k == null) return false;
            int code = ((Number) keyValue.invoke(k)).intValue();
            return keyNeedsWindow ? Boolean.TRUE.equals(isKeyDown.invoke(null, mc.getWindow(), code)) : Boolean.TRUE.equals(isKeyDown.invoke(null, code));
        } catch (Throwable t) { return false; }
    }


    /** Écrit directement la valeur d'une option (luminosité, champ de vision) sans la validation du jeu, qui refuse tout ce qui sort du curseur. Jeu non obfusqué : le champ « value » existe sous ce nom. */
    private static Field valueField;
    static void setRaw(Object option, Object value) {
        try {
            if (valueField == null) { valueField = option.getClass().getDeclaredField("value"); valueField.setAccessible(true); }
            valueField.set(option, value);
        } catch (Throwable t) { /* champ renommé : l'option garde sa valeur */ }
    }

    /** Durée de l'effet posé par le mod (ticks) et seuil de reconnaissance (une vraie potion dure beaucoup moins). */
    static final int NV_LEN = 1000000, NV_MARK = 400000;
    private static boolean nvInit; private static Object nvEffect; private static java.lang.reflect.Constructor<?> nvCtor; private static Method nvGet, nvAdd, nvRemove, nvDur;

    /** Luminosité = vision nocturne : vrai effet « Vision nocturne » posé côté client (sans particules ni icône), par réflexion (les types d'effet ont changé d'une 26.x à l'autre). Dégrade en « ne fait rien ». */
    static void nightVision(Object player, boolean on) {
        try {
            if (!nvInit) {
                nvInit = true;
                nvEffect = Class.forName("net.minecraft.world.effect.MobEffects").getField("NIGHT_VISION").get(null);
                Class<?> inst = Class.forName("net.minecraft.world.effect.MobEffectInstance");
                for (java.lang.reflect.Constructor<?> c : inst.getConstructors()) { Class<?>[] t = c.getParameterTypes(); if (t.length == 6 && t[0].isAssignableFrom(nvEffect.getClass()) && t[1] == int.class && t[2] == int.class && t[3] == boolean.class) nvCtor = c; }
                nvDur = inst.getMethod("getDuration");
                for (Method m : player.getClass().getMethods()) {
                    if (m.getParameterCount() != 1 || !m.getParameterTypes()[0].isAssignableFrom(nvEffect.getClass())) continue;
                    if (m.getName().equals("getEffect")) nvGet = m; else if (m.getName().equals("removeEffect")) nvRemove = m;
                }
                for (Method m : player.getClass().getMethods()) if (m.getName().equals("addEffect") && m.getParameterCount() == 1 && m.getParameterTypes()[0].isAssignableFrom(inst)) nvAdd = m;
            }
            if (nvEffect == null || nvCtor == null || nvGet == null || nvAdd == null || nvRemove == null) return;
            Object cur = nvGet.invoke(player, nvEffect); int d = cur == null ? 0 : ((Number) nvDur.invoke(cur)).intValue();
            if (on) { if (cur == null || d < NV_MARK) nvAdd.invoke(player, nvCtor.newInstance(nvEffect, NV_LEN, 0, false, false, false)); }
            else if (cur != null && d > NV_MARK) nvRemove.invoke(player, nvEffect);
        } catch (Throwable t) { /* version inconnue : pas de vision nocturne, le jeu continue */ }
    }


    /** Caméra cinématique du jeu : champ booléen « smoothCamera » des options (jeu non obfusqué : même nom à l'exécution). Faux / sans effet si le champ n'existe plus. */
    private static Field smoothField; private static boolean smoothInit;
    private static Field smoothField(Minecraft mc) {
        if (!smoothInit) {
            smoothInit = true;
            try { Object o = mc.options; for (String n : new String[] { "smoothCamera", "cinematicCamera" }) { try { Field f = o.getClass().getDeclaredField(n); if (f.getType() == boolean.class) { f.setAccessible(true); smoothField = f; break; } } catch (NoSuchFieldException e) { /* nom suivant */ } } }
            catch (Throwable t) { smoothField = null; }
        }
        return smoothField;
    }
    static boolean getSmooth(Minecraft mc) { try { Field f = smoothField(mc); return f != null && f.getBoolean(mc.options); } catch (Throwable t) { return false; } }
    static void setSmooth(Minecraft mc, boolean on) { try { Field f = smoothField(mc); if (f != null) f.setBoolean(mc.options, on); } catch (Throwable t) { /* tant pis : pas de caméra cinématique */ } }

    /** 26.x : pas de crochet fiable sur la molette (GLFW remplacé par SDL3 depuis 26.3, et aucun accès Mixin ici) ; on passe par slotScroll. */
    static boolean hookScroll(Minecraft mc, net.hydarium.core.Zoom.Sink sink) { return false; }

    /**
     * Molette pendant le zoom, sans crochet : un cran de molette change la case sélectionnée de ±1 (vers le haut : case − 1). Si, pendant le zoom, la case change SANS qu'une touche 1–9 soit enfoncée,
     * on y voit la molette : on remet la case d'avant et on renvoie le nombre de crans (positif = vers le haut). Hors zoom (active = faux) on ne fait que mémoriser la case.
     * Limite : un changement de case venu du serveur pendant le zoom serait pris pour un cran de molette.
     */
    private static int lastSlot = -1; private static boolean slotInit;
    private static Method getInv, getSlot, setSlot; private static Field slotField;
    private static boolean initSlot(Object player) {
        if (slotInit) return getInv != null; slotInit = true;
        try {
            getInv = player.getClass().getMethod("getInventory"); Class<?> ic = getInv.getReturnType();
            try { getSlot = ic.getMethod("getSelectedSlot"); setSlot = ic.getMethod("setSelectedSlot", int.class); }
            catch (NoSuchMethodException e) { getSlot = null; setSlot = null; slotField = ic.getField("selected"); }
        } catch (Throwable t) { getInv = null; }
        return getInv != null;
    }
    static double slotScroll(Minecraft mc, Object player, boolean active) {
        try {
            if (player == null || !initSlot(player)) return 0;
            Object inv = getInv.invoke(player);
            int now = getSlot != null ? ((Number) getSlot.invoke(inv)).intValue() : slotField.getInt(inv), was = lastSlot; lastSlot = now;
            if (!active || was < 0 || was == now || hasScreen(mc)) return 0;
            for (char c = '1'; c <= '9'; c++) if (keyDown(mc, String.valueOf(c))) return 0; // touche de case : ce n'est pas la molette
            int d = ((was - now) % 9 + 9) % 9; if (d > 4) d -= 9;
            if (setSlot != null) setSlot.invoke(inv, was); else slotField.setInt(inv, was);
            lastSlot = was; return d;
        } catch (Throwable t) { return 0; }
    }

    static boolean mouseDown(Minecraft mc, int button) {
        try {
            if (!mouseInit) {
                mouseInit = true; mouseField = Minecraft.class.getField("mouseHandler");
                Class<?> c = mouseField.getType(); leftPressed = c.getMethod("isLeftPressed"); rightPressed = c.getMethod("isRightPressed");
            }
            Object mh = mouseField.get(mc); if (mh == null) return false;
            return Boolean.TRUE.equals((button == 0 ? leftPressed : rightPressed).invoke(mh));
        } catch (Throwable t) { return false; }
    }

    /** 26.x : pas d'accès GLFW fiable (SDL3 depuis 26.3). Le launcher remet lui-même la fenêtre du jeu en place quand le menu Alt+H l'a réduite. */
    static void keepFullscreen(Minecraft mc) { }
}
