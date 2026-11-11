package net.hydarium.core;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.Charset;
import java.util.Locale;
import java.util.Map;

/** Pont avec le launcher (127.0.0.1, jeton) : envoie l'état du jeu et lit la musique en cours. Tout est silencieux en cas d'échec. */
public final class Bridge {
    private static final Charset UTF8 = Charset.forName("UTF-8");

    public interface Source { String stateJson(); boolean wantMusic(); void music(String text, boolean playing); }

    private final String base, token;

    public Bridge(String base, String token) { this.base = base; this.token = token; }

    public boolean enabled() { return base != null && !base.isEmpty() && token != null && !token.isEmpty(); }

    /** Lance le fil d'arrière-plan (daemon) : état toutes les 250 ms, musique toutes les 4 s. */
    public void start(final Source src) {
        if (!enabled()) return;
        Thread t = new Thread(new Runnable() {
            public void run() {
                long lastMusic = 0;
                while (true) {
                    try {
                        String body = src.stateJson();
                        if (body != null) post("/v1/state", body);
                        long now = System.currentTimeMillis();
                        if (src.wantMusic() && now - lastMusic > 4000) { lastMusic = now; readMusic(src); }
                        Thread.sleep(250);
                    } catch (InterruptedException e) { return; } catch (Throwable ignored) { /* launcher fermé : on réessaie */ }
                }
            }
        }, "hydarium");
        t.setDaemon(true);
        t.start();
    }

    private HttpURLConnection open(String path, String method) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(base + path).openConnection();
        c.setRequestMethod(method); c.setConnectTimeout(500); c.setReadTimeout(700);
        c.setRequestProperty("Authorization", "Bearer " + token);
        return c;
    }

    private void post(String path, String body) throws Exception {
        HttpURLConnection c = open(path, "POST");
        c.setDoOutput(true); c.setRequestProperty("Content-Type", "application/json");
        OutputStream o = c.getOutputStream();
        try { o.write(body.getBytes(UTF8)); } finally { o.close(); }
        c.getResponseCode(); c.disconnect();
    }

    /**
     * Demande au launcher d'ouvrir le tunnel peer-to-peer d'un code d'invitation ; renvoie le port local (127.0.0.1) à utiliser.
     * Plus patient que le reste du pont (premier appel : le réseau pair-à-pair démarre), et lève une exception avec le message du launcher en cas de refus.
     */
    public int openP2p(String code) throws Exception {
        if (!enabled()) throw new Exception("launcher absent");
        HttpURLConnection c = (HttpURLConnection) new URL(base + "/v1/p2p/open").openConnection();
        c.setRequestMethod("POST"); c.setConnectTimeout(1500); c.setReadTimeout(20000);
        c.setRequestProperty("Authorization", "Bearer " + token); c.setRequestProperty("Content-Type", "application/json"); c.setDoOutput(true);
        OutputStream o = c.getOutputStream();
        try { o.write(("{\"code\":" + Json.quote(code) + "}").getBytes(UTF8)); } finally { o.close(); }
        int status = c.getResponseCode();
        InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        if (in != null) try { byte[] buf = new byte[2048]; int n; while ((n = in.read(buf)) > 0 && b.size() < 16384) b.write(buf, 0, n); } finally { in.close(); }
        c.disconnect();
        Map<String, Object> m = Json.map(Json.parse(new String(b.toByteArray(), UTF8)));
        if (status >= 400 || m.get("error") != null) throw new Exception(m.get("error") instanceof String ? (String) m.get("error") : "refusé (" + status + ")");
        if (!(m.get("port") instanceof Number)) throw new Exception("réponse inattendue");
        return ((Number) m.get("port")).intValue();
    }

    /** Demande au launcher d'ouvrir une page de son menu (« skins », « content », « shots », « music », « hub ») : pour ce que le menu en jeu ne fait pas encore. Silencieux en cas d'échec. */
    public void overlay(final String page) {
        if (!enabled()) return;
        Thread t = new Thread(new Runnable() { public void run() { try { post("/v1/overlay", "{\"page\":" + Json.quote(page) + "}"); } catch (Throwable ignored) { } } }, "hydarium-overlay");
        t.setDaemon(true); t.start();
    }

    private void readMusic(Source src) throws Exception {
        HttpURLConnection c = open("/v1/music", "GET");
        InputStream in = c.getInputStream();
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        try { byte[] buf = new byte[2048]; int n; while ((n = in.read(buf)) > 0 && b.size() < 16384) b.write(buf, 0, n); } finally { in.close(); }
        Map<String, Object> t = Json.map(Json.map(Json.parse(new String(b.toByteArray(), UTF8))).get("track"));
        String title = t.get("title") instanceof String ? (String) t.get("title") : "", artist = t.get("artist") instanceof String ? (String) t.get("artist") : "";
        src.music(title.isEmpty() ? "" : artist.isEmpty() ? title : title + "\n" + artist, Boolean.TRUE.equals(t.get("playing")));
        c.disconnect();
    }

    /** JSON attendu par le launcher (hud.setGame). {@code drawn} : modules que le mod dessine lui-même (le HUD externe les masque). */
    public static String stateJson(State s, String[] drawn) {
        StringBuilder b = new StringBuilder(512).append('{');
        b.append("\"fps\":").append(s.fps).append(",\"x\":").append(n(s.x)).append(",\"y\":").append(n(s.y)).append(",\"z\":").append(n(s.z));
        b.append(",\"yaw\":").append(n(s.yaw)).append(",\"pitch\":").append(n(s.pitch)).append(",\"dim\":").append(Json.quote(s.dim));
        b.append(",\"hp\":").append(n(s.hp)).append(",\"food\":").append(n(s.food)).append(",\"armor\":[");
        for (int k = 0; k < 4; k++) {
            if (k > 0) b.append(',');
            State.Armor a = s.armor[k];
            if (a == null) b.append("null");
            else b.append("{\"id\":").append(Json.quote(a.name)).append(",\"max\":").append(a.pct >= 0 ? 100 : 0).append(",\"dmg\":").append(a.pct >= 0 ? 100 - a.pct : 0).append('}');
        }
        b.append("],\"fx\":[");
        for (int k = 0; k < s.fx.size() && k < 12; k++) {
            State.Fx e = s.fx.get(k);
            b.append(k > 0 ? "," : "").append("{\"id\":").append(Json.quote(e.name)).append(",\"k\":").append(Json.quote(e.id)).append(",\"t\":").append(e.ticks).append(",\"a\":").append(e.amp).append('}');
        }
        b.append("],\"drawn\":[");
        for (int k = 0; k < drawn.length; k++) b.append(k > 0 ? "," : "").append(Json.quote(drawn[k]));
        b.append("],\"scr\":").append(Json.quote(s.screen == null ? "" : s.screen)).append(",\"tg\":{");
        boolean first = true;
        if (s.toggles != null) for (Map.Entry<String, Boolean> e : s.toggles.entrySet()) { b.append(first ? "" : ",").append(Json.quote(e.getKey())).append(':').append(e.getValue() ? "true" : "false"); first = false; }
        b.append("},\"lay\":").append(s.layout == null || s.layout.isEmpty() ? "{}" : s.layout).append(",\"ed\":").append(s.editor ? 1 : 0).append(",\"gmenu\":").append(s.menu ? 1 : 0);
        return b.append('}').toString();
    }

    /** Hors d'un monde (menu principal…) il n'y a pas d'état de jeu : on ne signale que l'écran ouvert (« menu » : le launcher n'en fait pas un état de jeu ; à ne pas confondre avec « gmenu » = le menu Hydarium en jeu existe). */
    public static String menuJson(String screen) { return "{\"menu\":1,\"scr\":" + Json.quote(screen == null ? "" : screen) + "}"; }

    private static String n(double d) { return String.format(Locale.ROOT, "%.2f", d); }
}
