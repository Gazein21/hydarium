package net.hydarium.client; import net.hydarium.core.*;
public class HydariumClient { public static Config cfg; public static final State state = new State(); public static final Cps cps = new Cps(); public static final Fps frames = new Fps(); public static volatile boolean drawing = true; public static volatile boolean fpsNative = false; public static volatile String drawErr = "";
  public static void reportDrawError(String m){ if (drawErr.isEmpty()) drawErr = m; } public static void openLauncher(String p){} }
