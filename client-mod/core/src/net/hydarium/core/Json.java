package net.hydarium.core;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Mini lecteur JSON (aucune dépendance : le même code tourne sur 1.8.9, 1.20.1 et les versions récentes). Java 8. */
public final class Json {
    private final String s;
    private int i;

    private Json(String s) { this.s = s; }

    /** Renvoie Map, List, String, Double, Boolean ou null. Lève IllegalArgumentException si le texte est invalide. */
    public static Object parse(String text) {
        Json j = new Json(text);
        j.ws();
        Object v = j.value();
        j.ws();
        if (j.i != j.s.length()) throw new IllegalArgumentException("texte en trop à la position " + j.i);
        return v;
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> map(Object o) { return o instanceof Map ? (Map<String, Object>) o : new LinkedHashMap<String, Object>(); }

    public static String quote(String t) {
        StringBuilder b = new StringBuilder(t.length() + 2).append('"');
        for (int k = 0; k < t.length(); k++) {
            char c = t.charAt(k);
            if (c == '"' || c == '\\') b.append('\\').append(c);
            else if (c < 0x20) b.append(String.format("\\u%04x", (int) c));
            else b.append(c);
        }
        return b.append('"').toString();
    }

    private void ws() { while (i < s.length() && Character.isWhitespace(s.charAt(i))) i++; }

    private Object value() {
        if (i >= s.length()) throw new IllegalArgumentException("fin inattendue");
        char c = s.charAt(i);
        if (c == '{') return obj();
        if (c == '[') return arr();
        if (c == '"') return str();
        if (s.startsWith("true", i)) { i += 4; return Boolean.TRUE; }
        if (s.startsWith("false", i)) { i += 5; return Boolean.FALSE; }
        if (s.startsWith("null", i)) { i += 4; return null; }
        int st = i;
        while (i < s.length() && "+-0123456789.eE".indexOf(s.charAt(i)) >= 0) i++;
        if (st == i) throw new IllegalArgumentException("caractère inattendu '" + c + "' à " + i);
        return Double.valueOf(s.substring(st, i));
    }

    private Map<String, Object> obj() {
        Map<String, Object> m = new LinkedHashMap<String, Object>();
        i++; ws();
        if (s.charAt(i) == '}') { i++; return m; }
        while (true) {
            ws(); String k = str(); ws();
            if (s.charAt(i++) != ':') throw new IllegalArgumentException("':' attendu à " + (i - 1));
            ws(); m.put(k, value()); ws();
            char c = s.charAt(i++);
            if (c == '}') return m;
            if (c != ',') throw new IllegalArgumentException("',' attendu à " + (i - 1));
        }
    }

    private List<Object> arr() {
        List<Object> l = new ArrayList<Object>();
        i++; ws();
        if (s.charAt(i) == ']') { i++; return l; }
        while (true) {
            ws(); l.add(value()); ws();
            char c = s.charAt(i++);
            if (c == ']') return l;
            if (c != ',') throw new IllegalArgumentException("',' attendu à " + (i - 1));
        }
    }

    private String str() {
        if (s.charAt(i) != '"') throw new IllegalArgumentException("chaîne attendue à " + i);
        StringBuilder b = new StringBuilder();
        i++;
        while (true) {
            char c = s.charAt(i++);
            if (c == '"') return b.toString();
            if (c != '\\') { b.append(c); continue; }
            char e = s.charAt(i++);
            switch (e) {
                case 'n': b.append('\n'); break;
                case 't': b.append('\t'); break;
                case 'r': b.append('\r'); break;
                case 'b': b.append('\b'); break;
                case 'f': b.append('\f'); break;
                case 'u': b.append((char) Integer.parseInt(s.substring(i, i + 4), 16)); i += 4; break;
                default: b.append(e);
            }
        }
    }
}
