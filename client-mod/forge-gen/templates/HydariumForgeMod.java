package net.hydarium.client;

import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.fml.IExtensionPoint;
import net.minecraftforge.fml.ModLoadingContext;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.loading.FMLEnvironment;

/**
 * Point d'entrée Forge du client Hydarium (GÉNÉRÉ par client-mod/forge-gen : ne pas modifier dans le projet fabriqué, modifier ce modèle).
 * Mod côté client seulement : l'extension « DisplayTest » dit à Forge de ne pas comparer ce mod avec le serveur, donc une connexion à un serveur
 * sans Hydarium (ou avec d'autres mods) n'est jamais refusée à cause de lui.
 */
@Mod("hydarium")
public class HydariumForgeMod {
    public HydariumForgeMod() {
        ModLoadingContext.get().registerExtensionPoint(IExtensionPoint.DisplayTest.class,
            () -> new IExtensionPoint.DisplayTest(() -> IExtensionPoint.DisplayTest.IGNORESERVERONLY, (remote, isServer) -> true));
        if (FMLEnvironment.dist == Dist.CLIENT) ClientSetup.run(); // classe séparée : un serveur ne charge jamais les classes du client Minecraft
    }
}
