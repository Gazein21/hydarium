package net.hydarium.client;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;

import org.lwjgl.input.Keyboard;
import org.lwjgl.input.Mouse;

import net.minecraft.client.Minecraft;
import net.minecraft.client.entity.EntityPlayerSP;
import net.minecraft.client.gui.FontRenderer;
import net.minecraft.client.gui.Gui;
import net.minecraft.client.gui.GuiScreen;
import net.minecraft.client.gui.ScaledResolution;
import net.minecraft.client.renderer.GlStateManager;
import net.minecraft.client.resources.I18n;
import net.minecraft.client.settings.KeyBinding;
import net.minecraft.client.renderer.RenderHelper;
import net.minecraft.item.ItemStack;
import net.minecraft.potion.Potion;
import net.minecraft.potion.PotionEffect;
import net.minecraft.util.ResourceLocation;
import net.minecraft.util.ChatComponentText;
import net.minecraftforge.client.event.FOVUpdateEvent;
import net.minecraftforge.client.event.MouseEvent;
import net.minecraftforge.client.event.RenderGameOverlayEvent;
import net.minecraft.entity.Entity;
import net.minecraftforge.common.MinecraftForge;
import net.minecraftforge.fml.common.FMLCommonHandler;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.common.event.FMLInitializationEvent;
import net.minecraftforge.fml.common.eventhandler.SubscribeEvent;
import net.minecraftforge.fml.common.gameevent.TickEvent;

import net.hydarium.core.Bridge;
import net.hydarium.core.Config;
import net.hydarium.core.Cps;
import net.hydarium.core.Canvas;
import net.hydarium.core.Editor;
import net.hydarium.core.Features;
import net.hydarium.core.Painter;
import net.hydarium.core.Hud;
import net.hydarium.core.SneakDriver;
import net.hydarium.core.State;
import net.hydarium.core.Toggles;
import net.hydarium.core.Zoom;
import net.hydarium.core.Widget;

/**
 * Client Hydarium pour Minecraft 1.8.9 (Forge 11.15.1.2318). Même cœur que les versions modernes (package net.hydarium.core) : seuls la lecture du jeu et le dessin changent.
 * ATTENTION : écrit sans pouvoir être compilé contre Minecraft ici ; à valider (voir docs/HYDARIUM-CLIENT.md).
 */
@Mod(modid = "hydarium", name = "Hydarium", version = "1.1.0", clientSideOnly = true, acceptedMinecraftVersions = "[1.8.9]")
public class HydariumForge {
    private final Config cfg = new Config(System.getProperty("hydarium.config"));
    private final State state = new State();
    private final Cps cps = new Cps();
    private final Toggles toggles = new Toggles(cfg);
    private final long t0 = System.currentTimeMillis();
    private final SimpleDateFormat hhmm = new SimpleDateFormat("HH:mm");
    private volatile String music = "", json = null;
    private volatile boolean musicPlaying = false;
    private Float gammaBefore = null, fovBefore = null;
    private final Zoom zoom = new Zoom(); // niveau de zoom en cours (la molette l'ajuste)
    private Boolean smoothBefore = null; // caméra cinématique : état d'avant le zoom
    private boolean walking = false, walkDown = false, zoomHeld = false, zoomDown = false, sprintForced = false;
    private int tick = 0;
    private boolean editorDown = false; // touche de l'éditeur en jeu (Maj droite par défaut)
    private final SneakDriver sneakDriver = new SneakDriver();
    private final SneakDriver.Host sneakHost = new SneakDriver.Host() { // sneak permanent : ce que le jeu fournit au pilote
        public boolean toggleKeyDown() { return key(Features.key(cfg, "togglesneak", "V")); }
        public boolean sneakKeyDown() { int k = Minecraft.getMinecraft().gameSettings.keyBindSneak.getKeyCode(); return k > 0 ? Keyboard.isKeyDown(k) : k < 0 && Mouse.isButtonDown(k + 100); }
        public void setSneakKey(boolean down) { KeyBinding.setKeyBindState(Minecraft.getMinecraft().gameSettings.keyBindSneak.getKeyCode(), down); }
        public void say(String text) { Minecraft.getMinecraft().ingameGUI.setRecordPlaying(text, false); }
    };

    @Mod.EventHandler
    public void init(FMLInitializationEvent e) {
        cfg.poll();
        System.out.println("[Hydarium] client chargé (sneak permanent : oui, touche " + Features.key(cfg, "togglesneak", "V") + ", module " + (Features.sneak(cfg) ? "actif" : "éteint") + ")"); // repère dans latest.log : si cette ligne manque, le jeu utilise un ANCIEN jar du mod
        MinecraftForge.EVENT_BUS.register(this);
        FMLCommonHandler.instance().bus().register(this);
        new Bridge(System.getProperty("hydarium.bridge", ""), System.getProperty("hydarium.token", "")).start(new Bridge.Source() {
            public String stateJson() { return json; }
            public boolean wantMusic() { return cfg.get("music").on; }
            public void music(String t, boolean p) { music = t; musicPlaying = p; }
        });
        Runtime.getRuntime().addShutdownHook(new Thread(new Runnable() { public void run() { restoreGamma(Minecraft.getMinecraft()); } }));
    }

    @SubscribeEvent
    public void onTick(TickEvent.ClientTickEvent e) {
        if (e.phase != TickEvent.Phase.END) return;
        Minecraft mc = Minecraft.getMinecraft();
        if ((++tick % 20) == 0) cfg.poll();
        EntityPlayerSP p = mc.thePlayer;
        String scr = mc.currentScreen instanceof net.minecraft.client.gui.GuiScreenResourcePacks ? "resourcepacks" : "";
        state.toggles = cfg.overrides(); // bascules faites en jeu : le launcher les reporte dans le menu Alt+H
        state.screen = scr; // le launcher affiche alors un bouton cliquable « Télécharger des packs de ressources » par-dessus le jeu
        if (p == null || mc.theWorld == null) { state.inWorld = false; json = scr.isEmpty() ? null : Bridge.menuJson(scr); restoreGamma(mc); restoreFov(mc); restoreSmooth(mc); zoomHeld = false; walking = false; sprintForced = false; sneakDriver.reset(); return; }
        try { sample(mc, p); } catch (Throwable t) { json = null; }
        try { features(mc, p); } catch (Throwable t) { logOnce("features", t); }
    }

    /** Une erreur dans une fonction du client ne doit jamais faire planter le jeu, mais elle ne doit plus disparaître sans trace : on l'écrit UNE fois (journal du jeu, latest.log) pour qu'on puisse la lire. */
    private String lastErr = "";
    private void logOnce(String where, Throwable t) { String m = where + " : " + t; if (m.equals(lastErr)) return; lastErr = m; System.err.println("[Hydarium] erreur ignorée dans " + m); t.printStackTrace(); }

    private void sample(Minecraft mc, EntityPlayerSP p) {
        State s = state; s.inWorld = true; s.fps = Minecraft.getDebugFPS();
        s.x = p.posX; s.y = p.posY; s.z = p.posZ; s.yaw = p.rotationYaw; s.pitch = p.rotationPitch; s.dim = "dim" + mc.theWorld.provider.getDimensionId();
        s.hp = p.getHealth(); s.food = p.getFoodStats().getFoodLevel();
        for (int k = 0; k < 4; k++) { // armorInventory : 0 = bottes … 3 = casque
            ItemStack it = p.inventory.armorInventory[3 - k];
            if (it == null) { s.armor[k] = null; continue; }
            State.Armor a = new State.Armor(); a.name = it.getItem().getUnlocalizedName();
            int max = it.getMaxDamage(); a.pct = max > 0 ? Math.round((max - it.getItemDamage()) * 100f / max) : -1; s.armor[k] = a;
        }
        s.fx.clear();
        for (Object o : p.getActivePotionEffects()) { PotionEffect e = (PotionEffect) o; State.Fx f = new State.Fx(); f.id = e.getEffectName(); f.name = I18n.format(e.getEffectName()); f.amp = e.getAmplifier(); f.ticks = e.getDuration(); s.fx.add(f); }
        s.ping = -1;
        try { if (mc.getNetHandler() != null && mc.getNetHandler().getPlayerInfo(p.getUniqueID()) != null) s.ping = mc.getNetHandler().getPlayerInfo(p.getUniqueID()).getResponseTime(); } catch (Throwable ignored) { }
        s.w = mc.gameSettings.keyBindForward.isKeyDown(); s.a = mc.gameSettings.keyBindLeft.isKeyDown(); s.s = mc.gameSettings.keyBindBack.isKeyDown(); s.d = mc.gameSettings.keyBindRight.isKeyDown(); s.space = mc.gameSettings.keyBindJump.isKeyDown();
        s.lw = name(mc.gameSettings.keyBindForward, "W"); s.la = name(mc.gameSettings.keyBindLeft, "A"); s.ls = name(mc.gameSettings.keyBindBack, "S"); s.ld = name(mc.gameSettings.keyBindRight, "D");
        Runtime r = Runtime.getRuntime(); s.memUsedGb = (r.totalMemory() - r.freeMemory()) / 1073741824.0; s.memMaxGb = r.maxMemory() / 1073741824.0;
        s.clock = hhmm.format(new Date()); s.sessionSecs = (System.currentTimeMillis() - t0) / 1000; s.music = music; s.musicPlaying = musicPlaying;
        s.layout = cfg.layoutJson(); s.editor = true; // réglages faits dans l'éditeur en jeu → le launcher les enregistre ; l'éditeur existe sur cette version
        json = Bridge.stateJson(s, Hud.ALL);
    }

    private void features(Minecraft mc, EntityPlayerSP p) {
        double g = Features.gamma(cfg);
        /* Menus d'options / pause : on remet le vrai réglage de luminosité AVANT que le jeu enregistre options.txt. Sinon le gamma du module y était écrit, et à la désactivation on « restaurait » cette valeur : la luminosité restait coincée. */
        boolean optScreen = mc.currentScreen instanceof net.minecraft.client.gui.GuiOptions || mc.currentScreen instanceof net.minecraft.client.gui.GuiVideoSettings || mc.currentScreen instanceof net.minecraft.client.gui.GuiIngameMenu;
        if (!Double.isNaN(g) && !optScreen) { if (gammaBefore == null) { float g0 = mc.gameSettings.gammaSetting; gammaBefore = g0 > 1f || g0 < 0f ? 0.5f : g0; /* hors plage = reste d'une session précédente */ } mc.gameSettings.gammaSetting = (float) g; } else restoreGamma(mc);
        boolean typing = mc.currentScreen != null;
        if (!typing) for (String msg : toggles.poll(new Toggles.Keys() { public boolean down(String k) { return key(k); } })) mc.ingameGUI.setRecordPlaying(msg, false); // touches de bascule réglées dans le launcher
        if (!typing) { // zoom : actif = zoom permanent ; la touche sert seulement à l'activer / le désactiver
            boolean zd = key(Features.key(cfg, "zoom", "C"));
            if (zd && !zoomDown) { boolean now = cfg.toggle("zoom"); mc.ingameGUI.setRecordPlaying("en".equals(cfg.lang()) ? (now ? "Zoom: on" : "Zoom: off") : (now ? "Zoom : activé" : "Zoom : désactivé"), false); }
            zoomDown = zd;
        }
        zoomHeld = Features.zoom(cfg) > 0 && !typing;
        /* Le zoom règle directement le champ de vision du jeu (effet immédiat, comme sur Fabric). Avant : FOVUpdateEvent, que le jeu lisse sur plusieurs ticks (la vue zoomait en deux temps).
           Le réglage de l'utilisateur est rétabli dès qu'un menu s'ouvre, que le zoom s'arrête ou qu'on quitte le monde. */
        if (zoomHeld) {
            if (fovBefore == null) { float f0 = mc.gameSettings.fovSetting; fovBefore = f0 < 30f || f0 > 110f ? 70f : f0; }
            applyZoom(mc);
            /* caméra cinématique pendant le zoom (la touche « caméra cinématique » du jeu) ; rendue comme avant à la fin du zoom */
            if (Features.cinematic(cfg)) { if (smoothBefore == null) smoothBefore = Boolean.valueOf(mc.gameSettings.smoothCamera); if (!mc.gameSettings.smoothCamera) mc.gameSettings.smoothCamera = true; }
            else restoreSmooth(mc);
        } else { restoreFov(mc); restoreSmooth(mc); }
        /* marche automatique (comme sur Fabric) : « activé » = ça avance. La touche d'usage (K par défaut) bascule le module ; « reculer » l'arrête. Elle simule « avancer » : sprint et saut restent possibles. */
        if (!typing) {
            boolean dn = key(Features.key(cfg, "autowalk", "K"));
            if (dn && !walkDown) { boolean now = cfg.toggle("autowalk"); mc.ingameGUI.setRecordPlaying("en".equals(cfg.lang()) ? (now ? "Auto-walk: on" : "Auto-walk: off") : (now ? "Marche auto : activée" : "Marche auto : arrêtée"), false); }
            walkDown = dn;
        }
        boolean walkOn = Features.walk(cfg);
        int fwd = mc.gameSettings.keyBindForward.getKeyCode();
        if (walkOn && !typing) { if (mc.gameSettings.keyBindBack.isKeyDown()) { cfg.toggle("autowalk"); walkOn = false; } else KeyBinding.setKeyBindState(fwd, true); }
        if (walking && !walkOn && !(fwd > 0 && Keyboard.isKeyDown(fwd))) KeyBinding.setKeyBindState(fwd, false); // arrêtée : on relâche « avancer » sauf si la touche est réellement enfoncée
        walking = walkOn;
        int spk = mc.gameSettings.keyBindSprint.getKeyCode();
        if (Features.sprint(cfg) && mc.gameSettings.keyBindForward.isKeyDown() && !p.isSneaking() && !p.isUsingItem()) { KeyBinding.setKeyBindState(spk, true); sprintForced = true; }
        else if (sprintForced) { // module coupé (ou on n’avance plus) : on rend la touche à son état réel et on arrête le sprint qu'on avait déclenché
            boolean real = spk > 0 && Keyboard.isKeyDown(spk); KeyBinding.setKeyBindState(spk, real); sprintForced = false;
            if (!real && !Features.sprint(cfg)) p.setSprinting(false);
        }
        sneakDriver.tick(cfg, sneakHost, typing);
        boolean edk = !typing && key(Features.editorKey(cfg)); // éditeur en jeu : touche, ou demande venue du launcher (« Modifier en jeu »)
        if ((edk && !editorDown) || (!typing && cfg.editorRequested())) { cfg.ackEditor(); mc.displayGuiScreen(new HudScreen()); }
        editorDown = edk; // sneak permanent (1.8.9 n'a pas l'option native) : toute la logique est dans le cœur (SneakDriver, testée)
    }

    /** Évènement clavier du jeu : la touche sneak vient d'être pressée à la main (même un appui plus court qu'un tick) → le sneak permanent s'arrêtera. */
    @SubscribeEvent
    public void onKey(net.minecraftforge.fml.common.gameevent.InputEvent.KeyInputEvent e) {
        Minecraft mc = Minecraft.getMinecraft();
        if (mc.currentScreen == null && Keyboard.getEventKeyState() && Keyboard.getEventKey() == mc.gameSettings.keyBindSneak.getKeyCode()) sneakDriver.keyPressed();
    }

    /** Début du tick du joueur, avant qu'il lise ses touches : le sneak permanent remet la touche sneak enfoncée (le jeu la relâche à l'ouverture d'un menu, etc.). */
    @SubscribeEvent
    public void onPlayerTick(TickEvent.PlayerTickEvent e) {
        Minecraft mc = Minecraft.getMinecraft();
        if (e.phase == TickEvent.Phase.START && mc.thePlayer != null && e.player == mc.thePlayer) sneakDriver.beforeMove(sneakHost, mc.currentScreen != null);
    }

    private void restoreSmooth(Minecraft mc) { if (smoothBefore != null && mc != null && mc.gameSettings != null) { mc.gameSettings.smoothCamera = smoothBefore.booleanValue(); smoothBefore = null; } }

    /** Champ de vision = celui d'avant le zoom divisé par le niveau de zoom en cours. */
    private void applyZoom(Minecraft mc) {
        if (fovBefore == null) return;
        float want = Math.max(8f, (float) (fovBefore / zoom.level(cfg)));
        if (mc.gameSettings.fovSetting != want) mc.gameSettings.fovSetting = want;
    }

    /** Molette pendant le zoom : elle règle le zoom (vers le haut = plus fort) au lieu de changer de case d'inventaire. Hors zoom ou menu ouvert : le jeu la traite comme d'habitude. */
    @SubscribeEvent
    public void onMouse(MouseEvent e) {
        if (e.dwheel == 0 || !zoomHeld) return;
        Minecraft mc = Minecraft.getMinecraft();
        if (mc.currentScreen != null || mc.thePlayer == null) return;
        double lv = zoom.scroll(cfg, Integer.signum(e.dwheel));
        applyZoom(mc);
        mc.ingameGUI.setRecordPlaying(Zoom.label(lv, "en".equals(cfg.lang())), false);
        e.setCanceled(true); // le jeu ne reçoit pas ce cran : la case ne change pas
    }

    private void restoreFov(Minecraft mc) { if (fovBefore != null && mc != null && mc.gameSettings != null) { mc.gameSettings.fovSetting = fovBefore; fovBefore = null; } }

    private void restoreGamma(Minecraft mc) { if (gammaBefore != null && mc != null && mc.gameSettings != null) { mc.gameSettings.gammaSetting = gammaBefore; gammaBefore = null; } }

    private static boolean key(String k) {
        String n = net.hydarium.core.Keys.lwjgl2(k); if (n == null) return false;
        int c = Keyboard.getKeyIndex(n); return c > 0 && Keyboard.isKeyDown(c);
    }

    private static String name(KeyBinding b, String def) { try { String n = Keyboard.getKeyName(b.getKeyCode()); return n == null || n.isEmpty() || n.length() > 6 ? def : n.toUpperCase(); } catch (Throwable t) { return def; } }

    @SubscribeEvent
    public void onFov(FOVUpdateEvent e) { /* le zoom ne passe plus par ici : voir features() */ }

    @SubscribeEvent
    public void onRender(RenderGameOverlayEvent.Post e) {
        if (e.type != RenderGameOverlayEvent.ElementType.ALL) return;
        Minecraft mc = Minecraft.getMinecraft();
        if (mc.gameSettings.hideGUI || mc.gameSettings.showDebugInfo || mc.thePlayer == null) return;
        if (mc.currentScreen instanceof HudScreen) return; // l'éditeur dessine lui-même les widgets (sinon les fonds seraient doublés)
        long now = System.currentTimeMillis();
        cps.feed(Mouse.isButtonDown(0), Mouse.isButtonDown(1), now); state.cpsL = cps.count(0, now); state.cpsR = cps.count(1, now);
        Painter.paintAll(Hud.build(cfg, state), new Cv(), state, cfg.round(), now); // dessin et mesures : cœur (Painter), identiques à l'éditeur en jeu
        GlStateManager.color(1f, 1f, 1f, 1f);
    }

    private static final net.hydarium.core.Marquee.Measure MZ = new net.hydarium.core.Marquee.Measure() { public int width(String s) { return Minecraft.getMinecraft().fontRendererObj.getStringWidth(s); } };
    private static final Gui GUI = new Gui();
    private static final ResourceLocation INVENTORY = new ResourceLocation("textures/gui/container/inventory.png");

    /** Pièces d'armure portées, casque → bottes, sans les emplacements vides (même ordre que les lignes du widget). */
    private static java.util.List<ItemStack> armorStacks(Minecraft mc) {
        java.util.List<ItemStack> out = new java.util.ArrayList<ItemStack>();
        for (int k = 0; k < 4; k++) { ItemStack it = mc.thePlayer.inventory.armorInventory[3 - k]; if (it != null) out.add(it); }
        return out;
    }

    private static java.util.List<PotionEffect> activeEffects(Minecraft mc) {
        java.util.List<PotionEffect> out = new java.util.ArrayList<PotionEffect>();
        for (Object o : mc.thePlayer.getActivePotionEffects()) { out.add((PotionEffect) o); if (out.size() >= 12) break; }
        return out;
    }

    /** L'objet d'armure dessiné par le jeu lui-même : même texture que dans l'inventaire (cuir teinté, etc.). */
    private static void drawArmor(Minecraft mc, ItemStack st, int x, int y) {
        try {
            RenderHelper.enableGUIStandardItemLighting(); GlStateManager.enableRescaleNormal();
            mc.getRenderItem().renderItemIntoGUI(st, x, y);
            GlStateManager.disableRescaleNormal(); RenderHelper.disableStandardItemLighting(); GlStateManager.enableBlend(); GlStateManager.color(1f, 1f, 1f, 1f);
        } catch (Throwable ignored) { }
    }

    /** L'icône d'effet du jeu : même case de la texture « inventory.png » que dans l'inventaire. */
    private static void drawEffect(Minecraft mc, PotionEffect e, int x, int y) {
        try {
            Potion p = Potion.potionTypes[e.getPotionID()]; if (p == null || !p.hasStatusIcon()) return;
            int i = p.getStatusIconIndex(); GlStateManager.color(1f, 1f, 1f, 1f); mc.getTextureManager().bindTexture(INVENTORY);
            GUI.drawTexturedModalRect(x, y, i % 8 * 18, 198 + i / 8 * 18, 18, 18);
        } catch (Throwable ignored) { }
    }


    /** Surface de dessin du cœur sur le rendu de Minecraft 1.8.9 (Painter pour le HUD en partie, Editor pour l'éditeur en jeu). */
    static final class Cv implements Canvas {
        private final Minecraft mc = Minecraft.getMinecraft(); private final FontRenderer fr = mc.fontRendererObj; private final int W, H;
        Cv() { ScaledResolution sr = new ScaledResolution(mc); W = sr.getScaledWidth(); H = sr.getScaledHeight(); }
        public int width() { return W; } public int height() { return H; }
        public int textWidth(String s) { return fr.getStringWidth(s); } public int fontHeight() { return 9; }
        public void fill(int x, int y, int w, int h, int c) { Gui.drawRect(x, y, x + w, y + h, c); }
        public void text(String s, int x, int y, int c, boolean sh) { if (sh) fr.drawStringWithShadow(s, x, y, c); else fr.drawString(s, x, y, c); }
        public void push(double tx, double ty, double s) { GlStateManager.pushMatrix(); GlStateManager.translate(tx, ty, 0); GlStateManager.scale(s, s, 1); GlStateManager.enableBlend(); }
        public void pop() { GlStateManager.popMatrix(); }
        public void icon(String kind, int k, int x, int y) {
            if (mc.thePlayer == null) return;
            if ("armor".equals(kind)) { java.util.List<ItemStack> a = armorStacks(mc); if (k < a.size()) drawArmor(mc, a.get(k), x, y); }
            else if ("fx".equals(kind)) { java.util.List<PotionEffect> f = activeEffects(mc); if (k < f.size()) drawEffect(mc, f.get(k), x - 1, y - 1); } // la texture d'effet fait 18×18 : décalée d'un pixel pour être centrée comme l'icône 16×16
        }
    }

    /** Éditeur en jeu : les vrais widgets, déplaçables à la souris. Toute la logique est dans le cœur (Editor) ; ici seulement la souris et le clavier. */
    final class HudScreen extends GuiScreen {
        private final Editor ed = new Editor(cfg, state);
        @Override public boolean doesGuiPauseGame() { return false; }
        @Override public void drawScreen(int mx, int my, float pt) { ed.draw(new Cv(), mx, my, System.currentTimeMillis()); GlStateManager.color(1f, 1f, 1f, 1f); }
        @Override protected void mouseClicked(int x, int y, int b) { ed.press(x, y, b); end(); }
        @Override protected void mouseClickMove(int x, int y, int b, long t) { ed.drag(x, y); }
        @Override protected void mouseReleased(int x, int y, int s) { ed.release(x, y); }
        @Override protected void keyTyped(char c, int code) {
            int k = code == Keyboard.KEY_ESCAPE ? Editor.K_ESC : code == Keyboard.KEY_LEFT ? Editor.K_LEFT : code == Keyboard.KEY_RIGHT ? Editor.K_RIGHT : code == Keyboard.KEY_UP ? Editor.K_UP : code == Keyboard.KEY_DOWN ? Editor.K_DOWN
                : (c == '+' || code == Keyboard.KEY_ADD) ? Editor.K_PLUS : (c == '-' || code == Keyboard.KEY_SUBTRACT) ? Editor.K_MINUS : (c == 'r' || c == 'R') ? Editor.K_RESET : 0;
            if (k != 0) { ed.key(k); end(); }
        }
        @Override public void onGuiClosed() { ed.release(0, 0); }
        private void end() { if (ed.closeRequested) mc.displayGuiScreen(null); }
    }
}
