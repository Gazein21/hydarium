package net.hydarium.client.mixin;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

import net.minecraft.client.multiplayer.resolver.ServerAddress;

import net.hydarium.client.HydariumClient;
import net.hydarium.core.P2pAddress;

/**
 * Code d'invitation peer-to-peer dans le champ d'adresse (liste multijoueur, connexion directe, ajout de serveur) : un texte « HYD-XXXX-… » est remplacé,
 * au moment où le jeu lit l'adresse, par « 127.0.0.1:port » (le port local que le launcher ouvre vers l'hôte). Une adresse ordinaire passe sans changement.
 * Si une cible n'existe pas dans cette version, Mixin l'ignore (injectors.defaultRequire = 0) : seul le code P2P ne fonctionne alors pas.
 */
@Mixin(ServerAddress.class)
public abstract class ServerAddressMixin {
    @Inject(method = "parseString", at = @At("HEAD"), cancellable = true)
    private static void hyd$p2p(String text, CallbackInfoReturnable<ServerAddress> cir) {
        try { String real = HydariumClient.p2p(text); if (real != null) cir.setReturnValue(ServerAddress.parseString(real)); } catch (Throwable ignored) { }
    }

    /** Le bouton « Rejoindre » ne doit pas rester grisé à cause du code (tirets, longueur). */
    @Inject(method = "isValidAddress", at = @At("HEAD"), cancellable = true)
    private static void hyd$p2pValid(String text, CallbackInfoReturnable<Boolean> cir) {
        try { if (P2pAddress.isCode(text)) cir.setReturnValue(Boolean.TRUE); } catch (Throwable ignored) { }
    }
}
