package net.hydarium.client;

import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.eventbus.api.listener.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.event.lifecycle.FMLClientSetupEvent;
import net.minecraftforge.fml.javafmlmod.FMLJavaModLoadingContext;

/**
 * Point d'entrée Forge 26.x du client Hydarium (GÉNÉRÉ par client-mod/forge-gen : modifier ce modèle, pas le projet fabriqué).
 * Écrit exactement sur le patron du MDK officiel de Forge 26.3 : constructeur à contexte, abonnement client par @EventBusSubscriber(value = Dist.CLIENT).
 * Mod client seulement : déclaré « clientSideOnly » dans mods.toml, donc jamais comparé avec le serveur.
 */
@Mod("hydarium")
public final class HydariumForgeMod {
    public HydariumForgeMod(FMLJavaModLoadingContext context) { }

    @Mod.EventBusSubscriber(modid = "hydarium", value = Dist.CLIENT)
    public static class ClientEvents {
        @SubscribeEvent
        public static void onClientSetup(FMLClientSetupEvent event) { ClientSetup.run(); }
    }
}
