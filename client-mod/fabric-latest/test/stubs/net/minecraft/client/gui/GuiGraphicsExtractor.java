package net.minecraft.client.gui; import java.util.*;
public class GuiGraphicsExtractor { public static final List<String> log = new ArrayList<>();
  public void fill(int a,int b,int c,int d,int e){ log.add("F"+a+","+b+","+c+","+d); }
  public void fill(Object pipeline,int a,int b,int c,int d,int e){ log.add("WRONG-fill"); }
  public void text(Font f,String s,int x,int y,int c,boolean sh){ log.add("T"+s+"@"+x+","+y+(c>>>24==0?"!transparent":"")); }
  public void text(Font f,Object comp,int x,int y,int c,boolean sh){ log.add("WRONG-text"); }
  public Pose pose(){ return new Pose(); } public static class Pose { public void pushMatrix(){ log.add("push"); } public void popMatrix(){ log.add("pop"); } public Pose translate(float x,float y){ log.add("tr"+x+","+y); return this; } public Pose scale(float x,float y){ log.add("sc"+x+","+y); return this; } }
  public void item(net.minecraft.world.item.ItemStack s,int x,int y){ log.add("item"); } }
