package net.hydarium.client;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.text.SimpleDateFormat;
import java.util.Date;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;

import net.hydarium.core.Bridge;
import net.hydarium.core.Config;
import net.hydarium.core.Cps;
import net.hydarium.core.Features;
import net.hydarium.core.Hud;
import net.hydarium.core.State;
import net.hydarium.core.Toggles;
import net.hydarium.core.Zoom;

/**
 * Client Hydarium, partie Fabric commune (1.20.1 et versions récentes). Lit l'état du jeu, applique luminosité / zoom / sprint automatique,
 * parle au launcher. Le dessin est fait par la classe optionnelle net.hydarium.client.Draw (présente seulement quand la version la fournit).
 * Tout ce qui dépend de la version (écran ouvert, touches, boutons de la souris) passe par la classe Compat, fournie par chaque variante :
 * Minecraft 26.3 a remplacé GLFW par SDL3 et déplacé Minecraft.screen, donc rien de ce code commun ne doit toucher à GLFW ni à ces champs.
 * ATTENTION : écrit sans pouvoir être compilé contre Minecraft ici ; à valider (voir docs/HYDARIUM-CLIENT.md).
 */
public class HydariumClient implements ClientModInitializer {
    public static final Config cfg = new Config(System.getProperty("hydarium.config"));
    public static final State state = new State();
    public static final Cps cps = new Cps();
    public static final Toggles toggles = new Toggles(cfg);
    public static volatile boolean drawing = false;
    /** HudScreen.open() si cette version a l'éditeur en jeu (cherché par réflexion, comme Draw), sinon null. */
    private static java.lang.reflect.Method openEditor = null;
    private static boolean editorDown = false;
    private static final long t0 = System.currentTimeMillis();
    private static final SimpleDateFormat HHMM = new SimpleDateFormat("HH:mm");
    private static volatile String music = "";
    private static volatile boolean musicPlaying = false;
    private static volatile String json = null;
    private static Integer fovBefore = null;
    /** Zoom : niveau en cours (la molette l'ajuste), caméra cinématique mise pendant le zoom, molette interceptée ou non. */
    private static final Zoom zoom = new Zoom();
    private static Boolean smoothBefore = null;
    private static volatile boolean zoomActive = false;
    private static boolean hookTried = false, scrollHooked = false;
    private static final Zoom.Sink SCROLL = new Zoom.Sink() {
        public boolean onScroll(double dy) {
            Minecraft mc = Minecraft.getInstance();
            if (!zoomActive || dy == 0 || mc == null || Compat.hasScreen(mc)) return false; // zoom éteint ou menu ouvert : la molette fait ce qu'elle fait d'habitude (cases, listes)
            zoomStep(mc, dy);
            return true;
        }
    };
    private static boolean zoomDown = false, walkDown = false, walking = false, sprintHeld = false;
    private static int tick = 0;

    @Override
    public void onInitializeClient() {
        cfg.poll();
        Minecraft mc = Minecraft.getInstance();
        try { drawing = "1".equals(System.getProperty("hydarium.draw", "1")) && Class.forName("net.hydarium.client.Draw").getMethod("install").invoke(null) != null; } catch (Throwable t) { drawing = false; }
        try { openEditor = drawing ? Class.forName("net.hydarium.client.HudScreen").getMethod("open") : null; } catch (Throwable t) { openEditor = null; }
        state.editor = openEditor != null; // le launcher propose « Modifier en jeu » seulement si l'éditeur existe ici
        ClientTickEvents.END_CLIENT_TICK.register(HydariumClient::onTick);
        ClientLifecycleEvents.CLIENT_STOPPING.register(c -> restore(c)); // les réglages temporaires ne doivent pas finir dans options.txt
        Bridge b = new Bridge(System.getProperty("hydarium.bridge", ""), System.getProperty("hydarium.token", ""));
        b.start(new Bridge.Source() {
            public String stateJson() { return json; }
            public boolean wantMusic() { return cfg.get("music").on; }
            public void music(String t, boolean p) { music = t; musicPlaying = p; }
        });
    }

    private static void onTick(Minecraft mc) {
        if ((++tick % 20) == 0) cfg.poll();
        if (tick == 5 || (tick % 400) == 0) { try { Compat.keepFullscreen(mc); } catch (Throwable ignored) { } }
        Player p = mc.player;
        String scr = ""; try { scr = Compat.screenKind(mc); } catch (Throwable ignored) { }
        state.toggles = cfg.overrides(); // bascules faites en jeu : le launcher les reporte dans le menu Alt+H
        state.screen = scr; // le launcher affiche alors un bouton cliquable « Télécharger des packs de ressources » par-dessus le jeu
        if (p == null || mc.level == null) { state.inWorld = false; json = scr.isEmpty() ? null : Bridge.menuJson(scr); walking = false; restore(mc); return; }
        try { sample(mc, p); } catch (Throwable t) { json = null; }
        try { features(mc, p); } catch (Throwable ignored) { }
    }

    static void sample(Minecraft mc, Player p) {
        State s = state;
        s.inWorld = true; s.fps = fps(mc);
        s.x = p.getX(); s.y = p.getY(); s.z = p.getZ(); s.yaw = p.getYRot(); s.pitch = p.getXRot();
        String d = mc.level.dimension().toString(); s.dim = d.substring(d.lastIndexOf(' ') + 1).replace("]", "");
        s.hp = p.getHealth(); s.food = p.getFoodData().getFoodLevel();
        EquipmentSlot[] slots = {EquipmentSlot.HEAD, EquipmentSlot.CHEST, EquipmentSlot.LEGS, EquipmentSlot.FEET};
        for (int k = 0; k < 4; k++) {
            ItemStack it = p.getItemBySlot(slots[k]);
            if (it.isEmpty()) { s.armor[k] = null; continue; }
            State.Armor a = new State.Armor(); a.name = BuiltInRegistries.ITEM.getKey(it.getItem()).getPath();
            int max = it.getMaxDamage(); a.pct = max > 0 ? Math.round((max - it.getDamageValue()) * 100f / max) : -1; s.armor[k] = a;
        }
        s.fx.clear();
        for (MobEffectInstance e : p.getActiveEffects()) {
            if (e.getDuration() > Compat.NV_MARK) continue; // la « vision nocturne » posée par le module luminosité n'est pas un effet à afficher
            State.Fx f = new State.Fx(); String id = e.getDescriptionId(); f.id = id.substring(id.lastIndexOf('.') + 1); f.name = pretty(f.id); f.amp = e.getAmplifier(); f.ticks = e.getDuration(); s.fx.add(f);
        }
        s.ping = -1;
        s.ping = ping(mc, p);
        s.w = mc.options.keyUp.isDown(); s.a = mc.options.keyLeft.isDown(); s.s = mc.options.keyDown.isDown(); s.d = mc.options.keyRight.isDown(); s.space = mc.options.keyJump.isDown();
        s.lw = label(mc.options.keyUp.getTranslatedKeyMessage().getString(), "W"); s.la = label(mc.options.keyLeft.getTranslatedKeyMessage().getString(), "A");
        s.ls = label(mc.options.keyDown.getTranslatedKeyMessage().getString(), "S"); s.ld = label(mc.options.keyRight.getTranslatedKeyMessage().getString(), "D");
        s.lmb = Compat.mouseDown(mc, 0); s.rmb = Compat.mouseDown(mc, 1);
        Runtime r = Runtime.getRuntime(); s.memUsedGb = (r.totalMemory() - r.freeMemory()) / 1073741824.0; s.memMaxGb = r.maxMemory() / 1073741824.0;
        s.clock = HHMM.format(new Date()); s.sessionSecs = (System.currentTimeMillis() - t0) / 1000; s.music = music; s.musicPlaying = musicPlaying;
        s.layout = cfg.layoutJson();
        json = Bridge.stateJson(s, drawing ? Hud.ALL : new String[0]);
    }

    static void features(Minecraft mc, Player p) {
        /* luminosité = vision nocturne : un vrai effet « Vision nocturne » (sans icône ni particules) posé côté client tant que le module est actif, retiré à l'extinction.
           (Avant : on écrivait un gamma > 1 dans les options ; le jeu l'écrasait.) */
        Compat.nightVision(p, Features.nightVision(cfg));
        final Minecraft m = mc; final boolean typing = Compat.hasScreen(mc);
        // éditeur en jeu : touche (Maj droite par défaut) ou demande du launcher (« Modifier en jeu »)
        boolean edk = !typing && openEditor != null && Compat.keyDown(mc, Features.editorKey(cfg));
        if (openEditor != null && ((edk && !editorDown) || (!typing && cfg.editorRequested()))) { cfg.ackEditor(); try { openEditor.invoke(null); } catch (Throwable t) { } }
        editorDown = edk;
        // touches de bascule réglées dans le launcher (un module, ou tout le HUD)
        if (!typing) for (String msg : toggles.poll(new Toggles.Keys() { public boolean down(String k) { return Compat.keyDown(m, k); } })) say(p, msg);
        /* zoom : tant que le module est actif, le champ de vision reste réduit ; la touche sert seulement à l'activer / le désactiver (comme la marche auto).
           (fov().set(17) était refusé : le curseur du jeu va de 30 à 110 ; on écrit donc la valeur brute, et on la rétablit dès qu'un menu s'ouvre.) */
        if (!typing) {
            boolean zd = Compat.keyDown(mc, Features.key(cfg, "zoom", "C"));
            if (zd && !zoomDown) { boolean now = cfg.toggle("zoom"); say(p, "en".equals(cfg.lang()) ? (now ? "Zoom: on" : "Zoom: off") : (now ? "Zoom : activé" : "Zoom : désactivé")); }
            zoomDown = zd;
        }
        boolean zoomOn = Features.zoom(cfg) > 0 && !typing;
        zoomActive = zoomOn;
        if (!hookTried) { hookTried = true; try { scrollHooked = Compat.hookScroll(mc, SCROLL); } catch (Throwable t) { scrollHooked = false; } } // molette : réglage du zoom au lieu du changement de case
        if (zoomOn) {
            if (fovBefore == null) fovBefore = mc.options.fov().get();
            if (!scrollHooked) { double n = Compat.slotScroll(mc, p, true); if (n != 0) zoomStep(mc, n); } // pas d'accès direct à la molette (versions récentes) : on la lit dans le changement de case et on le défait
            applyZoom(mc);
            /* caméra cinématique pendant le zoom (comme la touche « caméra cinématique » du jeu) : rendue telle qu'elle était à la fin du zoom */
            if (Features.cinematic(cfg)) { if (smoothBefore == null) smoothBefore = Boolean.valueOf(Compat.getSmooth(mc)); if (!Compat.getSmooth(mc)) Compat.setSmooth(mc, true); }
            else restoreSmooth(mc);
        } else {
            if (!scrollHooked) Compat.slotScroll(mc, p, false); // garde la case de référence à jour
            if (fovBefore != null) { Compat.setRaw(mc.options.fov(), Integer.valueOf(fovBefore)); fovBefore = null; }
            restoreSmooth(mc);
        }
        /* marche automatique : « activé » = ça avance. La touche d'usage (K par défaut) ou la touche ⇄ bascule le module ; « reculer » l'arrête. Elle simule « avancer » : sprint (touche ou sprint auto) et saut restent possibles,
           le joueur continue donc en courant s'il se met à courir. */
        if (!typing) {
            boolean dn = Compat.keyDown(mc, Features.key(cfg, "autowalk", "K"));
            if (dn && !walkDown) { boolean now = cfg.toggle("autowalk"); say(p, "en".equals(cfg.lang()) ? (now ? "Auto-walk: on" : "Auto-walk: off") : (now ? "Marche auto : activée" : "Marche auto : arrêtée")); }
            walkDown = dn;
        }
        boolean walkOn = Features.walk(cfg);
        if (walkOn && !typing) { if (mc.options.keyDown.isDown()) { cfg.toggle("autowalk"); walkOn = false; } else mc.options.keyUp.setDown(true); }
        if (walking && !walkOn && !Compat.keyDown(mc, "W")) mc.options.keyUp.setDown(false);
        walking = walkOn;
        // sprint automatique : dès que le joueur avance (même juste en marchant, marche auto comprise)
        boolean moving = mc.options.keyUp.isDown() || walkOn;
        if (Features.sprint(cfg) && moving && !p.isShiftKeyDown() && !p.isUsingItem() && !typing) { mc.options.keySprint.setDown(true); sprintHeld = true; }
        else if (sprintHeld) { sprintHeld = false; if (!Compat.keyDown(mc, "CTRL")) mc.options.keySprint.setDown(false); }
    }

    static void restore(Minecraft mc) {
        zoomActive = false;
        try {
            if (fovBefore != null && mc.options != null) { Compat.setRaw(mc.options.fov(), Integer.valueOf(fovBefore)); fovBefore = null; }
        } catch (Throwable ignored) { }
        try { restoreSmooth(mc); } catch (Throwable ignored) { }
    }

    /** Remet la caméra cinématique comme elle était avant le zoom (si le zoom l'avait mise). */
    static void restoreSmooth(Minecraft mc) {
        if (smoothBefore != null) { Compat.setSmooth(mc, smoothBefore.booleanValue()); smoothBefore = null; }
    }

    /** Applique le niveau de zoom en cours au champ de vision, tout de suite (appelé aussi à chaque cran de molette : pas d'attente du tick suivant). */
    static void applyZoom(Minecraft mc) {
        if (fovBefore == null || mc.options == null) return;
        int want = Math.max(8, (int) Math.round(fovBefore / zoom.level(cfg)));
        if (mc.options.fov().get() != want) Compat.setRaw(mc.options.fov(), Integer.valueOf(want));
    }

    /** Un ou plusieurs crans de molette pendant le zoom : plus fort vers le haut, plus faible vers le bas, avec le niveau en message. */
    static void zoomStep(Minecraft mc, double notches) {
        double lv = zoom.scroll(cfg, notches);
        try { applyZoom(mc); if (mc.player != null) say(mc.player, Zoom.label(lv, "en".equals(cfg.lang()))); } catch (Throwable ignored) { }
    }

    /** FPS : getFps() quand il existe, sinon le champ privé « fps » (nom Mojang). */
    static int fps(Minecraft mc) {
        try { Method m = Minecraft.class.getMethod("getFps"); return ((Number) m.invoke(mc)).intValue(); } catch (Throwable e1) {
            try { Field f = Minecraft.class.getDeclaredField("fps"); f.setAccessible(true); return f.getInt(null); } catch (Throwable e2) { return 0; }
        }
    }

    /** Message sur la barre d'action. Par réflexion : ces deux appels ont changé de forme selon les versions, une erreur ici ne doit pas empêcher le mod de se charger. */
    static void say(Player p, String text) {
        try { Object c = Class.forName("net.minecraft.network.chat.Component").getMethod("literal", String.class).invoke(null, text);
              for (Method m : p.getClass().getMethods()) if (m.getName().equals("displayClientMessage") && m.getParameterCount() == 2) { m.invoke(p, c, Boolean.TRUE); return; } } catch (Throwable ignored) { }
    }

    /** Latence (ms) : connexion → infos du joueur → latence, par réflexion pour la même raison. -1 si inconnue (solo). */
    static int ping(Minecraft mc, Player p) {
        try { Object conn = mc.getClass().getMethod("getConnection").invoke(mc); if (conn == null) return -1;
              Object info = conn.getClass().getMethod("getPlayerInfo", java.util.UUID.class).invoke(conn, p.getUUID()); if (info == null) return -1;
              return ((Number) info.getClass().getMethod("getLatency").invoke(info)).intValue(); } catch (Throwable t) { return -1; }
    }

    static String label(String s, String def) { return s == null || s.isEmpty() || s.length() > 6 ? def : s.toUpperCase(); }
    static String pretty(String id) { String t = id.replace('_', ' '); return t.isEmpty() ? t : Character.toUpperCase(t.charAt(0)) + t.substring(1); }
}
