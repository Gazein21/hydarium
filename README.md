# Hydarium Launcher (MVP)

Windows d’abord, structure prête pour macOS et Linux.

## Lancer en développement
1. Installer Node.js 20 ou plus et Java 21.
2. `npm install`
3. `npm start`

## Obtenir l’installeur Windows (un seul exe)
- **Sur ton PC** : double-clique sur `build-windows.bat` (Node.js requis). Dans `dist/` : `Hydarium-…exe` (installation en un clic, sans droits administrateur) et `Hydarium-Portable-…exe` (un seul fichier, sans installation).
- **Sans rien installer** : mets le projet sur GitHub, onglet Actions → « Build Windows » → Run workflow. Les fichiers (petit installeur web, version portable) sont téléchargeables à la fin ; sur un tag `vX.Y.Z`, ils sont publiés dans une Release (voir « Télécharger et mises à jour » plus bas).
- Java 21 est embarqué automatiquement : le joueur n’installe rien d’autre.
- Windows peut afficher « application non reconnue » tant que l’exe n’est pas signé (certificat payant).

## Fabriquer l’installeur
- Windows : `npm run dist:win` · macOS : `npm run dist:mac` · Linux : `npm run dist:linux`
  (chaque système se construit idéalement sur lui-même).

## Structure
- `src/main/platform.js` : tout ce qui dépend de l’OS (dossiers, détection de Java). Seul fichier à adapter pour une nouvelle plateforme.
- `src/main/auth.js` : connexion Microsoft, jetons chiffrés par le système.
- `src/main/game.js` : versions Mojang, lancement. Le champ `loader` des instances prépare Fabric / Forge / NeoForge / Quilt.
- `src/main/store.js` : comptes et instances (fichier JSON, écriture atomique).
- `src/renderer/` : interface (aucun accès direct à Node ; passe par `preload.js`).

## Inclus / pas encore
Inclus : connexion Microsoft, instances Vanilla, lancement en un clic.
Pas encore : mods et loaders, serveurs 1 clic, codes de modpack, points et boutique (paiement), amis.
Limite connue : Java doit être installé (téléchargement automatique prévu).

## Ajouts (v0.2)
Fabric et Quilt, mods Modrinth (dépendances automatiques, contrôle d’intégrité), statuts Vérifié / Non vérifié / Manquant, incompatibilités bloquantes avec correction en un clic, serveurs avec rejoindre en un clic, code de partage d’instance, plantages lisibles avec mod suspect, mémoire par instance, dupliquer, ouvrir le dossier.
Liste des mods vérifiés : `src/main/verified.json` (à terme, fournie par le serveur Hydarium).
Pas encore : Forge / NeoForge, code court de modpack (demande un serveur), amis, chat, vocal, captures, mod client en jeu, import depuis un autre launcher.

## Reprise du projet
Tout est expliqué dans `docs/FICHE-DE-REPRISE.md` (état, architecture, journaux, pièges, prochaines étapes).


## Démarrage rapide (Windows)
- `lancer-dev.bat` : installe Node.js portable si besoin, puis lance le launcher.
- `build-windows.bat` : fabrique l’installeur dans `dist/`.

## Skins préinstallés
Dans **Profil › Skins par défaut** et dans le menu en jeu : les 9 skins par défaut de Minecraft (Steve, Alex, Ari, Efe, Kai, Makena, Noor, Sunny, Zuri) et, plus tard, le skin Hydarium. Le joueur peut les retirer (🗑) et les récupérer avec « Restaurer les skins retirés ».

Les textures Mojang **ne sont pas dans ce dépôt** : le launcher les extrait du `client.jar` de Minecraft (un jar déjà téléchargé, sinon la dernière version, une seule fois) et ne garde que les PNG. La liste est dans `src/main/default-skins/manifest.json`.

**Ajouter le skin Hydarium (ou tout autre skin maison)** : dépose le PNG 64×64 dans `src/main/default-skins/` (le manifeste attend `hydarium.png`) et ajuste son entrée (`name`, `variant` = `classic` ou `slim`, `group` = `hydarium` pour l'afficher en premier). Ne change jamais l'`id` d'une entrée une fois publiée. Test : `node test/skins.test.js`.

## Télécharger et mises à jour
Télécharge [`Hydarium-Installer.exe`](https://github.com/Gazein21/hydarium/releases/latest/download/Hydarium-Installer.exe) (lien permanent, toujours la dernière version) ou choisis un fichier sur la page [Releases](https://github.com/Gazein21/hydarium/releases/latest). Hydarium vérifie à chaque lancement s'il existe une nouvelle version et l'installe en arrière-plan (réglable dans Paramètres › Général). Publier une version : `npm run release -- X.Y.Z` — voir `docs/PUBLIER-SUR-GITHUB.md`.
