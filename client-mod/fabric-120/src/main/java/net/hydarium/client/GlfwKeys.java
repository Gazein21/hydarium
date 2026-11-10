package net.hydarium.client;

import net.hydarium.core.Keys;

/** Nom de touche du launcher → code GLFW (voir net.hydarium.core.Keys). 0 = inconnue. */
public final class GlfwKeys {
    private GlfwKeys() {}

    public static int code(String k) { return Keys.glfw(k); }
}
