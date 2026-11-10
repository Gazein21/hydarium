package net.hydarium.client.mixin;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

import net.minecraft.client.Options;

/** Caméra cinématique du jeu (champ « smoothCamera ») : lue et écrite pendant le zoom (voir Compat.getSmooth / setSmooth). Si le champ s'appelle autrement, ce mixin est ignoré et seule la caméra cinématique est perdue. */
@Mixin(Options.class)
public interface OptionsAccessor {
    @Accessor("smoothCamera")
    boolean hyd$getSmooth();

    @Accessor("smoothCamera")
    void hyd$setSmooth(boolean value);
}
