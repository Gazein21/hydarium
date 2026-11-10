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
import net.hydarium.core.Features;
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
    private final SneakDriver sneakDriver = new SneakDriver();
    private final SneakDriver.Host sneakHost = new SneakDriver.Host() { // sneak permanent : ce que le jeu fournit au pilote
        public boolean toggleKeyDown() { return key(Features.key(cfg, "togglesneak", "V")); }
        public boolean sneakKeyDown() { int k = Minecraft.getMinecraft().gameSettings.keyBindSneak.getKeyCode(); return k > 0 ? Keyboard.isKeyDown(k) : k < 0 && Mouse.isButtonDown(k + 100); }
        public void setSneakKey(boolean down) { KeyBinding.setKeyBindState(Minecraft.getMinecraft().gameSettings.keyBindSneak.getKeyCode(), down); }
        public void say(String text) { Minecraft.getMinecraft().ingameGUI.setRecordPlaying(text, false); }
    };
    private boolean rd = true; // cases à coins légèrement arrondis (réglage « Style des cases » du launcher)

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
        sneakDriver.tick(cfg, sneakHost, typing); // sneak permanent (1.8.9 n'a pas l'option native) : toute la logique est dans le cœur (SneakDriver, testée)
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
        long now = System.currentTimeMillis();
        cps.feed(Mouse.isButtonDown(0), Mouse.isButtonDown(1), now); state.cpsL = cps.count(0, now); state.cpsR = cps.count(1, now);
        List<Widget> ws = Hud.build(cfg, state); rd = cfg.round();
        FontRenderer fr = mc.fontRendererObj; ScaledResolution sr = new ScaledResolution(mc); int W = sr.getScaledWidth(), H = sr.getScaledHeight();
        for (Widget w : ws) {
            int a = (int) Math.round(Math.max(.1, Math.min(1, w.opacity)) * 255) << 24, col = a | w.color, bg = (int) Math.round(w.opacity * 102) << 24, bw, bh; List<String> l = w.lines;
            boolean ic = w.icons; int lh = ic ? 18 : 10, tx = ic ? 22 : 3; // icônes (armure / effets) : les vraies textures du jeu
            boolean scr = false; if (w.maxWidth > 0 && !l.isEmpty() && fr.getStringWidth(l.get(0)) > w.maxWidth) { l.set(0, net.hydarium.core.Marquee.window(l.get(0), w.keep, w.maxWidth, MZ, now)); scr = true; } // titre trop long : il défile
            int nm = w.sub < 0 ? l.size() : Math.min(w.sub, l.size()), ns = l.size() - nm, sh = lh * 3 / 4; // lignes « petites » (artiste) : 75 % de la taille
            if (w.keys) { bw = 58; bh = 58; } else { int mw = 0; for (int k = 0; k < l.size(); k++) mw = Math.max(mw, k < nm ? fr.getStringWidth(l.get(k)) : (int) Math.ceil(fr.getStringWidth(l.get(k)) * .75)); if (scr) mw = Math.max(mw, w.maxWidth); bw = mw + tx + 3; bh = nm * lh + ns * sh + 3; }
            double s = w.scale; int px = (int) Math.min(w.x * W, Math.max(0, W - bw * s - 1)), py = (int) Math.min(w.y * H, Math.max(0, H - bh * s - 1));
            GlStateManager.pushMatrix(); GlStateManager.translate(px, py, 0); GlStateManager.scale(s, s, 1); GlStateManager.enableBlend();
            if (w.keys) { cell(fr, 20, 0, state.lw, state.w, a); cell(fr, 0, 20, state.la, state.a, a); cell(fr, 20, 20, state.ls, state.s, a); cell(fr, 40, 20, state.ld, state.d, a); box(0, 40, 58, 18, (state.space ? 0x99FFFFFF : 0x66000000) & 0x00FFFFFF | (a >>> 1 & 0xFF000000)); Gui.drawRect(14, 48, 44, 50, state.space ? 0xFF000000 : 0xFFFFFFFF); }
            else {
                if (w.bg) box(0, 0, bw, bh, bg);
                int inner = bw - tx - 3; // largeur du texte : chaque ligne y est centrée (sauf avec icônes)
                java.util.List<ItemStack> armor = "armor".equals(w.id) && ic ? armorStacks(mc) : null;
                java.util.List<PotionEffect> fx = "potions".equals(w.id) && ic ? activeEffects(mc) : null;
                for (int k = 0; k < nm; k++) {
                    int ty = ic ? 2 + k * lh + (lh - 9) / 2 - 1 : 3 + k * lh, lx = ic ? tx : tx + (inner - fr.getStringWidth(l.get(k))) / 2;
                    if (armor != null && k < armor.size()) drawArmor(mc, armor.get(k), 3, 1 + k * lh);
                    else if (fx != null && k < fx.size()) drawEffect(mc, fx.get(k), 2, k * lh);
                    fr.drawStringWithShadow(l.get(k), lx, ty, a | w.colorOf(k));
                }
                for (int k = nm; k < l.size(); k++) { // artiste : plus petit et plus transparent, juste sous le titre
                    int sc = ((int) ((col >>> 24 & 0xFF) * .6) << 24) | (col & 0xFFFFFF);
                    GlStateManager.pushMatrix(); GlStateManager.translate(tx + (inner - (int) Math.ceil(fr.getStringWidth(l.get(k)) * .75)) / 2, 3 + nm * lh + (k - nm) * sh, 0); GlStateManager.scale(.75f, .75f, 1f); fr.drawStringWithShadow(l.get(k), 0, 0, sc); GlStateManager.popMatrix();
                }
            }
            GlStateManager.popMatrix();
        }
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


    private void box(int x, int y, int w, int h, int c) { for (int[] r : net.hydarium.core.Round.rects(w, h, rd)) Gui.drawRect(x + r[0], y + r[1], x + r[0] + r[2], y + r[1] + r[3], c); }

    private void cell(FontRenderer fr, int x, int y, String t, boolean on, int a) {
        box(x, y, 18, 18, (on ? 0x99FFFFFF : 0x66000000) & 0x00FFFFFF | (a >>> 1 & 0xFF000000));
        fr.drawString(t, x + (18 - fr.getStringWidth(t)) / 2, y + 5, on ? 0xFF000000 : 0xFFFFFFFF);
    }
}
