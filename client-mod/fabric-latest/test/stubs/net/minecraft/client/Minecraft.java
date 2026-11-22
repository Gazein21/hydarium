package net.minecraft.client;
public class Minecraft { static final Minecraft I = new Minecraft(); public static Minecraft getInstance(){return I;}
  public net.minecraft.client.gui.Font font = new net.minecraft.client.gui.Font(); public Object player = new Object(); public Opts options = new Opts(); public Gui gui = new Gui(); public Window getWindow(){ return new Window(); }
  public static class Opts { public boolean hideGui = false; } public static class Gui { public Object cur; public Object screen(){return cur;} public void setScreenAndShow(Object s){ cur = s; } } }
