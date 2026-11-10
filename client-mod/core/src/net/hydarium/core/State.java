package net.hydarium.core;

import java.util.ArrayList;
import java.util.List;

/** Photographie du jeu, remplie par l'adaptateur de chaque version (1.8.9, 1.20.1, récentes). Pas de type Minecraft ici. */
public final class State {
    public static final class Armor { public String name = ""; public int pct = -1; /* -1 = pas de durabilité */ }
    public static final class Fx { public String id = ""; public String name = ""; public int amp; public int ticks; }

    public boolean inWorld;
    public int fps;
    public double x, y, z, yaw, pitch;
    public String dim = "";
    public double hp, food;
    public int ping = -1;
    public Armor[] armor = new Armor[4]; // casque, plastron, jambières, bottes ; null = rien
    public List<Fx> fx = new ArrayList<Fx>();
    public boolean w, a, s, d, space, lmb, rmb;
    public String lw = "W", la = "A", ls = "S", ld = "D"; // lettres réelles des touches (AZERTY…)
    public int cpsL, cpsR;
    public double memUsedGb, memMaxGb;
    public String clock = "";
    public long sessionSecs;
    public String music = ""; // « titre \n artiste » (artiste facultatif), vide si rien
    public boolean musicPlaying;
    public java.util.Map<String, Boolean> toggles = new java.util.HashMap<String, Boolean>(); // interrupteurs actionnés en jeu (voir Config.overrides)
    public String screen = ""; // écran ouvert qui intéresse le launcher : « resourcepacks » (Options › Packs de ressources), sinon vide
}
