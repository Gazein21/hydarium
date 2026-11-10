package net.hydarium.client.mixin;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

import net.minecraft.client.OptionInstance;

/** Écriture directe de la valeur d'une option (voir Compat.setRaw). */
@Mixin(OptionInstance.class)
public interface OptionInstanceAccessor {
    @Accessor("value")
    void hyd$setValue(Object value);
}
