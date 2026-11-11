package net.hydarium.client.mixin;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

import net.hydarium.client.P2pGlue;
import net.hydarium.core.P2pAddress;

/**
 * Code d'invitation peer-to-peer dans le champ d'adresse (liste multijoueur, connexion directe, ajout de serveur), versions récentes (26.x) :
 * un texte « HYD-XXXX-… » est remplacé, au moment où le jeu lit l'adresse, par « 127.0.0.1:port » (le port local que le launcher ouvre vers l'hôte).
 * Une adresse ordinaire passe sans changement.
 * La classe visée est donnée par son NOM (targets) et l'adresse est fabriquée par réflexion (P2pGlue.serverAddress) : ce fichier ne dépend donc d'AUCUNE classe
 * du jeu et ne peut pas empêcher la compilation si Mojang déplace ou renomme ServerAddress. Si la cible n'existe plus, Mixin l'ignore (defaultRequire = 0) :
 * seul le code P2P ne marche alors pas.
 */
@Mixin(targets = "net.minecraft.client.multiplayer.resolver.ServerAddress")
public abstract class ServerAddressMixin {
    @SuppressWarnings({"rawtypes", "unchecked"})
    @Inject(method = "parseString", at = @At("HEAD"), cancellable = true)
    private static void hyd$p2p(String text, CallbackInfoReturnable cir) {
        try { Object a = P2pGlue.serverAddress(text); if (a != null) cir.setReturnValue(a); } catch (Throwable ignored) { }
    }

    /** Le bouton « Rejoindre » ne doit pas rester grisé à cause du code (tirets, longueur). */
    @SuppressWarnings({"rawtypes", "unchecked"})
    @Inject(method = "isValidAddress", at = @At("HEAD"), cancellable = true)
    private static void hyd$p2pValid(String text, CallbackInfoReturnable cir) {
        try { if (P2pAddress.isCode(text)) cir.setReturnValue(Boolean.TRUE); } catch (Throwable ignored) { }
    }
}
