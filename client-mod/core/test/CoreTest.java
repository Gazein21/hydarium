import net.hydarium.core.*;
import java.io.File;
import java.nio.file.Files;
import java.util.List;

public class CoreTest {
    static int fails = 0;
    /** Un tick de Minecraft vu du sneak permanent. Entrées : état réel de la touche sneak / de la touche d'usage / menu ouvert / « un menu vient de se fermer ». Renvoie : le joueur est accroupi à ce tick. */
    static boolean simSneak(SneakDriver d, Config cfg, SneakDriver.Host h, boolean[] ph, boolean[] was, boolean sneakDown, boolean toggleDown, boolean typing, boolean menuJustClosed) {
        if (sneakDown && !was[0]) { ph[2] = true; if (!typing) d.keyPressed(); } else if (!sneakDown && was[0]) ph[2] = false; // évènements clavier : le jeu règle « pressed » ; l'adaptateur prévient le pilote
        was[0] = sneakDown; ph[0] = sneakDown; ph[1] = toggleDown;
        d.beforeMove(h, typing);                  // PlayerTickEvent START
        boolean crouched = ph[2] && !typing;      // le joueur lit « pressed »
        d.tick(cfg, h, typing);                   // ClientTickEvent END
        return crouched;
    }

    static void eq(Object a, Object b, String what) { if (!String.valueOf(a).equals(String.valueOf(b))) { fails++; System.out.println("ÉCHEC " + what + " : attendu " + b + ", obtenu " + a); } else System.out.println("ok   " + what); }

    public static void main(String[] x) throws Exception {
        File f = File.createTempFile("hyd", ".json");
        Files.write(f.toPath(), ("{\"version\":1,\"lang\":\"fr\",\"modules\":{\"fps\":{\"on\":true,\"pos\":{\"x\":0.5,\"y\":0.25},\"scale\":2,\"color\":\"#ff8800\",\"bg\":false},"
            + "\"coords\":{\"on\":true},\"armor\":{\"on\":true,\"durability\":true},\"gamma\":{\"on\":true,\"level\":99},\"zoom\":{\"on\":true,\"key\":\"c\"},\"keystrokes\":{\"on\":true},\"cps\":{\"on\":false},\"togglesprint\":{\"on\":true,\"toggle\":\"j\"},\"hud\":{\"key\":\"h\"}}}").getBytes("UTF-8"));
        Config c = new Config(f.getPath()); c.poll();
        Config.Mod fps = c.get("fps");
        eq(fps.on, true, "fps actif"); eq(fps.x, 0.5, "fps x"); eq(fps.scale, 2.0, "fps échelle"); eq(Integer.toHexString(fps.color), "ff8800", "fps couleur"); eq(fps.bg, false, "fps sans fond");
        eq(c.get("coords").x, 0.38, "position par défaut des coordonnées"); eq(c.get("cps").on, false, "cps éteint");
        eq(Features.gamma(c), 15.0, "gamma plafonné à 15"); eq(Features.zoom(c), 4.0, "zoom actif"); eq(Features.key(c, "zoom", "C"), "C", "touche zoom en majuscule"); eq(Features.key(c, "autowalk", "K"), "K", "touche par défaut");
        eq(Double.isNaN(Features.gamma(new Config(null))), true, "sans fichier : gamma intact");

        State s = new State(); s.inWorld = true; s.fps = 144; s.x = 10.7; s.y = 64; s.z = -3.2; s.yaw = 90; s.dim = "overworld";
        State.Armor a = new State.Armor(); a.name = "diamond"; a.pct = 87; s.armor[1] = a;
        List<Widget> w = Hud.build(c, s);
        StringBuilder ids = new StringBuilder(); for (Widget k : w) ids.append(k.id).append(' ');
        eq(ids.toString().trim(), "fps keystrokes coords armor", "widgets affichés (ordre et filtre)");
        eq(w.get(0).lines.get(0), "144 FPS", "texte FPS"); eq(w.get(2).lines.get(0), "XYZ 10 / 64 / -4", "coordonnées (partie entière vers le bas)");
        eq(w.get(3).lines.get(0), "Plastron 87 %", "armure"); eq(Integer.toHexString(w.get(3).colorOf(0)), "55ff55", "armure à 87 % : vert"); eq(w.get(0).colorOf(0), 0xFF8800, "autre widget : couleur du widget");
        eq(Hud.durColor(100), 0xFFFFFF, "100 % : blanc"); eq(Hud.durColor(99), 0x55FF55, "99 % : vert"); eq(Hud.durColor(60), 0xFFFF55, "60 % : jaune"); eq(Hud.durColor(30), 0xFFAA00, "30 % : orange"); eq(Hud.durColor(10), 0xFF5555, "10 % : rouge");
        eq(Keys.glfw("K"), 75, "GLFW : K"); eq(Keys.glfw("F6"), 295, "GLFW : F6"); eq(Keys.glfw("ALT"), 342, "GLFW : ALT = Alt gauche"); eq(Keys.glfw("UP"), 265, "GLFW : flèche haut"); eq(Keys.glfw("NUM3"), 323, "GLFW : pavé num. 3"); eq(Keys.mc("RALT"), "key.keyboard.right.alt", "jeu récent : Alt droit"); eq(Keys.mc("PAGEUP"), "key.keyboard.page.up", "jeu récent : page haut"); eq(Keys.lwjgl2("ALT"), "LMENU", "1.8.9 : ALT"); eq(Keys.glfw("ESC"), 0, "Échap jamais une touche de widget");
        eq(w.get(3).icons, true, "armure : une icône par ligne"); { Config.Mod am = new Config.Mod(); eq(am.has("icon") && am.has("pct") && am.has("name"), true, "widget : tout affiché par défaut"); am.show = "icon,pct"; eq(am.has("icon") && am.has("pct") && !am.has("name"), true, "widget : icône + pourcentage seulement"); } eq(w.get(2).icons, false, "coordonnées : pas d'icône");
        eq(Features.walk(c), false, "marche auto absente du fichier : éteinte");
        eq(Hud.mem(0.6, 4, false), "614 Mo / 4 Go", "mémoire sous 1 Go : en Mo"); eq(Hud.mem(0.6, 4, true), "614 MB / 4 GB", "mémoire sous 1 Go : en Mo (anglais)"); eq(Hud.mem(2.34, 4, false), "2,3 / 4 Go", "mémoire : Go avec décimale"); eq(Hud.mem(2.34, 16, true), "2.3 / 16 GB", "mémoire : point décimal en anglais"); eq(Hud.mem(0, 4, false), "0 Mo / 4 Go", "mémoire à 0");
        { // sneak permanent : s'arrête quand la personne sneake elle-même ; ignore une touche déjà tenue et les menus
            SneakLock sl = new SneakLock();
            eq(sl.manual(false, true, false), false, "sneak : rien d'appuyé"); eq(sl.manual(true, true, false), true, "sneak : appui à la main = arrêt");
            eq(sl.manual(true, true, false), false, "sneak : touche tenue, un seul arrêt"); eq(sl.manual(false, true, false), false, "sneak : relâchement");
            eq(sl.manual(true, false, false), false, "sneak : module inactif, rien à arrêter"); sl.manual(false, false, false);
            eq(sl.manual(true, true, false), true, "sneak : nouvel appui = arrêt");
            sl.reset(); sl.manual(true, false, false); eq(sl.manual(true, true, false), false, "sneak : touche déjà tenue à l'activation, pas d'arrêt");
            sl.reset(); eq(sl.manual(true, true, true), false, "sneak : menu ouvert, pas d'arrêt"); eq(sl.manual(true, true, false), false, "sneak : touche tenue à la fermeture du menu, pas d'arrêt");
            eq(Features.sneak(c), false, "sneak permanent absent du fichier : éteint");
        }
        { // sneak permanent : simulation d'un vrai tick de Minecraft (touches lues par évènements, menus qui relâchent tout, joueur qui lit « pressed » après le début de son tick)
            java.io.File sf = java.io.File.createTempFile("hydsneak", ".json"); Files.write(sf.toPath(), "{\"version\":1,\"modules\":{}}".getBytes("UTF-8")); Config sc = new Config(sf.getPath()); sc.poll();
            final boolean[] ph = new boolean[3]; // 0 = touche sneak réelle, 1 = touche d'usage, 2 = « pressed » du jeu
            final String[] said = new String[1];
            SneakDriver.Host mc = new SneakDriver.Host() {
                public boolean toggleKeyDown() { return ph[1]; } public boolean sneakKeyDown() { return ph[0]; }
                public void setSneakKey(boolean d) { ph[2] = d; } public void say(String t) { said[0] = t; }
            };
            SneakDriver d = new SneakDriver(); boolean[] was = new boolean[1];
            // un tick = évènements clavier → début du tick du joueur → le joueur lit la touche → fin de tick. Renvoie « le joueur est accroupi à ce tick ».
            java.util.concurrent.Callable<Boolean> none = null;
            boolean seen;
            seen = simSneak(d, sc, mc, ph, was, false, false, false, false); eq(seen, false, "sneak : rien d'actif, pas accroupi");
            simSneak(d, sc, mc, ph, was, false, true, false, false); eq(said[0], "Sneak : activé", "sneak : la touche d'usage active le module (message)"); simSneak(d, sc, mc, ph, was, false, false, false, false);
            boolean all = true; for (int i = 0; i < 40; i++) all &= simSneak(d, sc, mc, ph, was, false, false, false, false); eq(all, true, "sneak : accroupi à chaque tick, sans rien toucher");
            ph[2] = false; seen = simSneak(d, sc, mc, ph, was, false, false, true, false); simSneak(d, sc, mc, ph, was, false, false, true, false); // un menu s'ouvre : le jeu relâche toutes les touches
            seen = simSneak(d, sc, mc, ph, was, false, false, false, true); eq(seen, true, "sneak : menu fermé, accroupi dès le premier tick (le jeu avait tout relâché)");
            seen = simSneak(d, sc, mc, ph, was, true, false, false, false); eq(seen, true, "sneak : le joueur sneake à la main : il l'est ce tick-là"); eq(Features.sneak(sc), false, "sneak : sneaker à la main arrête le module"); eq(said[0], "Sneak : arrêté", "sneak : message d'arrêt");
            seen = simSneak(d, sc, mc, ph, was, true, false, false, false); eq(seen, true, "sneak : touche tenue, il reste accroupi comme d'habitude");
            seen = simSneak(d, sc, mc, ph, was, false, false, false, false); eq(seen, false, "sneak : touche relâchée, il se relève"); all = false; for (int i = 0; i < 5; i++) all |= simSneak(d, sc, mc, ph, was, false, false, false, false); eq(all, false, "sneak : et le reste");
            // appui plus court qu'un tick (presse + relâche dans le même tick)
            simSneak(d, sc, mc, ph, was, false, true, false, false); simSneak(d, sc, mc, ph, was, false, false, false, false); eq(Features.sneak(sc), true, "sneak : réactivé");
            ph[0] = false; ph[2] = true; d.keyPressed(); ph[2] = false; simSneak(d, sc, mc, ph, was, false, false, false, false); // évènement « pressé » puis « relâché » avant la fin du tick
            eq(Features.sneak(sc), false, "sneak : un appui très court l'arrête aussi"); all = false; for (int i = 0; i < 4; i++) all |= simSneak(d, sc, mc, ph, was, false, false, false, false); eq(all, false, "sneak : pas accroupi après l'appui court");
            // module coupé depuis le launcher (ou le menu Alt+H) pendant qu'il est actif
            simSneak(d, sc, mc, ph, was, false, true, false, false); simSneak(d, sc, mc, ph, was, false, false, false, false); eq(simSneak(d, sc, mc, ph, was, false, false, false, false), true, "sneak : de nouveau actif");
            sc.toggle("togglesneak"); simSneak(d, sc, mc, ph, was, false, false, false, false); eq(simSneak(d, sc, mc, ph, was, false, false, false, false), false, "sneak : coupé depuis le launcher, il se relève");
            // touche sneak déjà tenue au moment de l'activation : pas d'arrêt immédiat
            simSneak(d, sc, mc, ph, was, false, false, false, false); simSneak(d, sc, mc, ph, was, true, false, false, false); simSneak(d, sc, mc, ph, was, true, false, false, false); /* le joueur tient la touche sneak (module éteint) */ simSneak(d, sc, mc, ph, was, true, true, false, false); eq(Features.sneak(sc), true, "sneak : touche déjà tenue à l'activation : le module reste actif");
            simSneak(d, sc, mc, ph, was, false, false, false, false); eq(simSneak(d, sc, mc, ph, was, false, false, false, false), true, "sneak : tenue puis relâchée, il reste accroupi (module actif)");
            d.reset(); eq(d.active(), false, "sneak : quitter le monde remet à zéro");
        }
        eq(Hud.compass(0, false), "S", "yaw 0 = sud"); eq(Hud.compass(90, false), "O", "yaw 90 = ouest"); eq(Hud.compass(180, true), "N", "yaw 180 = nord"); eq(Hud.compass(-90, false), "E", "yaw -90 = est");

        { // zoom : niveau de départ, molette, limites, caméra cinématique
            Zoom z = new Zoom(); eq(z.level(c), 4.0, "zoom : niveau de départ par défaut"); eq(Features.cinematic(c), true, "caméra cinématique par défaut");
            double up = z.scroll(c, 1); eq(up > 4.0 && Math.abs(up - 4.6) < 0.001, true, "molette vers le haut : zoom plus fort (×1,15)"); eq(z.scroll(c, -1) < up, true, "molette vers le bas : zoom plus faible");
            eq(z.scroll(c, 1000), Zoom.MAX, "zoom plafonné"); eq(z.scroll(c, -1000), Zoom.MIN, "zoom plancher"); eq(z.level(c), Zoom.MIN, "le niveau reste en mémoire");
            eq(Zoom.label(4.6, false), "Zoom ×4,6", "message en français"); eq(Zoom.label(4.6, true), "Zoom ×4.6", "message en anglais");
            File zf = File.createTempFile("hydz", ".json");
            Files.write(zf.toPath(), "{\"version\":1,\"modules\":{\"zoom\":{\"on\":true,\"level\":8,\"cinematic\":false}}}".getBytes("UTF-8"));
            Config zc = new Config(zf.getPath()); zc.poll(); Zoom z2 = new Zoom();
            eq(Features.zoom(zc), 8.0, "zoom de départ réglé dans le launcher"); eq(z2.level(zc), 8.0, "niveau repris du launcher"); eq(Features.cinematic(zc), false, "caméra cinématique coupée dans le launcher");
            Files.write(zf.toPath(), "{\"version\":1,\"modules\":{\"zoom\":{\"on\":true,\"level\":999}}}".getBytes("UTF-8")); zf.setLastModified(zf.lastModified() + 5000); zc.poll();
            eq(Features.zoom(zc), Zoom.MAX, "réglage hors limites ramené au plafond"); eq(z2.level(zc), Zoom.MAX, "le launcher change le réglage : il est repris"); zf.delete();
        }
        eq(Features.nightVision(c), true, "luminosité = vision nocturne (module actif)"); eq(Features.nightVision(new Config(null)), false, "sans fichier : pas de vision nocturne");

        Cps cps = new Cps(); long t = 1000;
        for (int k = 0; k < 5; k++) { cps.feed(true, false, t + k * 100); cps.feed(false, false, t + k * 100 + 50); }
        eq(cps.count(0, t + 600), 5, "5 clics gauche en 0,6 s"); eq(cps.count(0, t + 2500), 0, "plus de clic après 1 s"); eq(cps.count(1, t + 600), 0, "aucun clic droit");

        String js = Bridge.stateJson(s, new String[] {"fps", "armor"}); Object parsed = Json.parse(js);
        eq(Json.map(parsed).get("fps"), "144.0", "JSON d'état relisible"); eq(js.contains("\"drawn\":[\"fps\",\"armor\"]"), true, "liste des modules dessinés");
        s.screen = "resourcepacks"; eq(Json.map(Json.parse(Bridge.stateJson(s, new String[0]))).get("scr"), "resourcepacks", "JSON d'état : écran ouvert"); s.screen = "";
        eq(Json.map(Json.parse(Bridge.menuJson("resourcepacks"))).get("scr"), "resourcepacks", "JSON de menu : écran ouvert"); eq(Json.map(Json.parse(Bridge.menuJson("resourcepacks"))).get("menu"), "1.0", "JSON de menu : marqué « menu »");
        try { Json.parse("{\"a\":"); fails++; System.out.println("ÉCHEC JSON invalide accepté"); } catch (RuntimeException e) { System.out.println("ok   JSON invalide refusé"); }
        final java.util.Set<String> held = new java.util.HashSet<String>(); Toggles tg = new Toggles(c); Toggles.Keys kk = new Toggles.Keys() { public boolean down(String k) { return held.contains(k); } };
        eq(Features.sprint(c), true, "sprint auto actif au départ"); eq(tg.poll(kk).size(), 0, "aucune touche : aucun message");
        held.add("J"); eq(tg.poll(kk).get(0), "Sprint auto : désactivé", "touche J : sprint désactivé"); eq(Features.sprint(c), false, "sprint réellement désactivé"); eq(tg.poll(kk).size(), 0, "touche maintenue : pas de répétition");
        held.clear(); tg.poll(kk); held.add("J"); eq(tg.poll(kk).get(0), "Sprint auto : activé", "J de nouveau : réactivé");
        held.clear(); tg.poll(kk); held.add("H"); eq(tg.poll(kk).get(0), "HUD masqué", "touche H : HUD masqué"); eq(Hud.build(c, s).size(), 0, "plus aucun widget quand le HUD est masqué");
        held.clear(); tg.poll(kk); held.add("H"); eq(tg.poll(kk).get(0), "HUD affiché", "H de nouveau : HUD affiché");
        // synchronisation jeu ↔ menu Alt+H : une bascule en jeu est signalée au launcher, qui la réécrit dans le fichier
        File tf = File.createTempFile("tgl", ".json"); long ts = System.currentTimeMillis();
        Files.write(tf.toPath(), "{\"version\":1,\"modules\":{\"autowalk\":{\"on\":false}}}".getBytes("UTF-8")); tf.setLastModified(ts); Config c2 = new Config(tf.getPath()); c2.poll();
        eq(c2.get("autowalk").on, false, "marche auto éteinte au départ"); eq(c2.toggle("autowalk"), true, "touche : marche auto activée");
        s.toggles = c2.overrides(); eq(Json.map(Json.map(Json.parse(Bridge.stateJson(s, new String[0]))).get("tg")).get("autowalk"), "true", "état envoyé : la bascule est signalée au launcher");
        Files.write(tf.toPath(), "{\"version\":1,\"modules\":{\"autowalk\":{\"on\":true}}}".getBytes("UTF-8")); tf.setLastModified(ts + 5000); c2.poll();
        eq(c2.get("autowalk").on, true, "le launcher a répercuté : toujours activée"); eq(c2.overrides().size(), 0, "bascule reprise par le launcher : plus rien à signaler");
        eq(c2.toggle("autowalk"), false, "2e pression : désactivée"); c2.overrides(); eq(c2.toggle("autowalk"), true, "3e pression avant la réponse du launcher : réactivée");
        Files.write(tf.toPath(), "{\"version\":1,\"modules\":{\"autowalk\":{\"on\":false}}}".getBytes("UTF-8")); tf.setLastModified(ts + 10000); c2.poll();
        eq(c2.get("autowalk").on, true, "écho tardif de la 2e pression : la plus récente (3e) reste"); c2.overrides();
        Files.write(tf.toPath(), "{\"version\":1,\"modules\":{\"autowalk\":{\"on\":true}}}".getBytes("UTF-8")); tf.setLastModified(ts + 15000); c2.poll(); eq(c2.get("autowalk").on, true, "puis le fichier rattrape le jeu");
        { File mf = File.createTempFile("hydm", ".json"); Files.write(mf.toPath(), "{\"version\":1,\"modules\":{\"music\":{\"on\":true}}}".getBytes("UTF-8")); Config mc = new Config(mf.getPath()); mc.poll();
          State ms = new State(); ms.inWorld = true; ms.music = "Yoru ni Kakeru\nYOASOBI"; ms.musicPlaying = true; Widget mw = null; for (Widget q : Hud.build(mc, ms)) if ("music".equals(q.id)) mw = q;
          eq(mw != null && mw.lines.size() == 2, true, "musique : titre + artiste sur deux lignes"); eq(mw.lines.get(0), "> Yoru ni Kakeru", "musique : titre sur la 1re ligne"); eq(mw.lines.get(1), "YOASOBI", "musique : artiste sur la 2e ligne"); eq(mw.sub, 1, "musique : l'artiste est en petit");
          ms.music = "Seul"; mw = null; for (Widget q : Hud.build(mc, ms)) if ("music".equals(q.id)) mw = q; eq(mw.lines.size() + "/" + mw.sub, "1/-1", "musique : sans artiste, une seule ligne"); }
        eq(Round.rects(58, 13, false).size(), 1, "cases carrées : un rectangle"); int ar = 0; for (int[] q : Round.rects(58, 13, true)) ar += q[2] * q[3]; eq(ar, 58 * 13 - 2 * (2 + 1) * 2, "cases arrondies : seuls les coins manquent");
        eq(Round.rects(20, 6, true).size(), 1, "petite case : pas d'arrondi"); eq(new Config(null).round(), true, "arrondi par défaut");
        c.poll(); System.out.println(fails == 0 ? "TOUT PASSE" : fails + " ÉCHEC(S)"); System.exit(fails == 0 ? 0 : 1);
    }
}
