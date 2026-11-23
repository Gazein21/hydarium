# Hydarium Launcher : fiche de reprise

Version 0.11.0 · Windows en priorité, structure prête pour macOS et Linux · Électron (interface web + processus principal Node) · mod client en Java (`client-mod/`).

> Cette fiche est la version **condensée** : elle garde ce que fait le launcher, pourquoi, les décisions du propriétaire et les pièges. L'historique détaillé version par version (0.9.0 → 0.10.75) a été retiré ; il reste dans Git. La liste des envies est dans [`A-FAIRE.md`](A-FAIRE.md), le mod client dans [`HYDARIUM-CLIENT.md`](HYDARIUM-CLIENT.md) et [`MODE-CLIENT-IN-GAME.md`](MODE-CLIENT-IN-GAME.md), la publication dans [`PUBLIER-SUR-GITHUB.md`](PUBLIER-SUR-GITHUB.md).

## 1. Où on en est

**Fait** : compte Microsoft, instances (Vanilla, Fabric, Quilt, Forge, NeoForge), mods Modrinth + CurseForge, packs / shaders / data packs / mondes, import (Prism, MultiMC, Minecraft officiel, CurseForge, ATLauncher, .mrpack), rejoindre un serveur, héberger un serveur, invitations privées P2P, amis, chat, fichiers, appels vocaux à deux, client Hydarium en jeu (mod), skins, captures, statistiques, assistants de crash (jeu et serveur), mises à jour automatiques, installeur Windows avec Java embarqué, anglais.

**Volontairement pas fait** : quêtes, cosmétiques, points, boutique et paiement (décision du propriétaire, à ajouter peut-être plus tard).

**Pas encore fait** : interface plus « Minecraft » (plus carrée), version « ultra optimisée » du jeu, chat vocal de groupe, activité Discord, signature de l'exe, fichier LICENSE, macOS / Linux testés, noms `nom.hydarium.net` pour les serveurs locaux.

**Jamais essayé en vrai** : une grande partie a été écrite et testée par simulation (tests unitaires, faux serveurs, faux Minecraft), **sans pouvoir lancer Electron, Windows, le vrai réseau ni compiler le mod contre le vrai Minecraft**. Premier réflexe en cas de doute : `npm start`, lire les journaux (section 4), puis la section 8.

## 2. Lancer, tester, fabriquer, publier

- **Développement** : Node.js 20+, `npm install`, `npm start` (Java 21 requis sur le PC de dev) ; ou `lancer-dev.bat` sous Windows (télécharge un Node portable si besoin).
- **Tests** : `npm test` (une cinquantaine de fichiers dans `test/`). Quand on ajoute un fichier de test, **l'ajouter à la liste du script `test` de `package.json`**, sinon la CI ne le lance pas.
- **Installeur Windows** : `build-windows.bat` (écran de progression lisible, détails dans `build.log`) ou GitHub → Actions → « Build Windows et Linux » (le job Linux, lancé après le job Windows, ajoute `Hydarium-Linux.AppImage` + `latest-linux.yml` à la même Release ; la mise à jour automatique AppImage est déjà gérée par `updater.js`). Java 21 est téléchargé par `scripts/fetch-jre.js` et embarqué. Le joueur reçoit un **petit installeur web** (`Hydarium-Setup-X.exe`, ≈ 180 Ko) qui télécharge le vrai programme (`.7z`) depuis la Release GitHub ; une version portable existe aussi. L'exe n'est pas signé : Windows affiche un avertissement.
- **macOS / Linux** : `npm run dist:mac` / `dist:linux`, à lancer sur le système concerné. Seul `platform.js` dépend de l'OS.
- **Publier** : `npm run release -- X.Y.Z` (vérifie la version, la section de cette fiche, la branche, le tag ; lance les tests ; commit, tag, push). Le tag doit s'appeler `vX.Y.Z` et la Release doit contenir l'installeur, le `.7z` et `latest.yml` (lu par la mise à jour automatique). Le dépôt doit être **public**. Détails : `PUBLIER-SUR-GITHUB.md`.
- **⚠️ Règle de version** : le numéro vient d'un seul endroit, `package.json` (`version`). À chaque livraison, le même numéro doit figurer dans `package.json`, `package-lock.json` (2 champs), le titre de la **dernière** section `## x.y.z` de cette fiche, la ligne « Mise à jour » d'`A-FAIRE.md` et le nom de l'archive. `test/version.test.js` vérifie `package.json` ↔ fiche ↔ pastille `v…` de la barre de titre. **Cette fiche doit toujours se terminer par une section `## x.y.z`** (voir tout en bas).

## 3. Architecture

```
src/main/        processus principal (Node) : toute la logique
  main.js        fenêtre sans cadre, canaux IPC, démarrage
  platform.js    TOUT ce qui dépend de l'OS (dossiers, Java, autres launchers)
  store.js       données locales (JSON, écriture atomique)      log.js  journaux     notify.js  notifications
  auth.js        Microsoft → Xbox → Minecraft (msmc), jetons chiffrés par le système
  game.js        versions Mojang, lancement, choix de Java, plantages        jre.js  téléchargement de Java
  crash.js       analyse des plantages (jeu)        hostcrash.js  idem pour les serveurs hébergés
  mods.js        loaders, Modrinth, statuts, conflits, version d'un mod      curseforge.js  CurseForge par API
  content.js     packs, shaders, data packs, mondes (paramètres, export)     nbt.js  lecture / écriture de level.dat
  importer.js / modpack.js / packs.js / drop.js   imports, modpacks, glisser-déposer (tri par contenu)
  servers.js / joiner.js / autojoin.js / mismatch.js / slp.js   liste de serveurs, rejoindre, détection de version et de mods
  host.js / hostdp.js    « Mon serveur » (héberger) et ses data packs
  p2p.js / p2pbridge.js  invitations privées en connexion directe (HyperDHT)
  playit.js      accès Internet gratuit d'un serveur local (playit.gg)
  friends.js / chat.js / xfer.js / imgsafe.js / voice.js / recipe.js   amis, chat, fichiers, images, vocal, codes de partage
  session.js / modbuild.js / modplan.js / bridge.js   mod Hydarium : fabrication, lancement, pont local jeu ↔ launcher
  hud.js / fg.js / input.js / overlay.js / layoutsync.js   widgets externes (repli), menu Alt+H, éditeur
  media.js / spotify.js   musique (YouTube Music, Spotify)
  skins.js / stats.js / shots.js / icons.js / mctex.js / modicon.js / instimg.js   skins, statistiques, captures, images
  updater.js     mises à jour automatiques         credits.js  onglet Crédits         datactl.js  nettoyage des données
src/preload.js   pont sécurisé : liste blanche des canaux IPC et des événements
src/renderer/    interface (HTML/CSS/JS), AUCUN accès direct à Node ; app.js (tout), i18n.js (anglais), scene.js (décors pixel-art)
client-mod/      core (Java commun, testé) · fabric-120 · fabric-121 · fabric-latest (26.x) · forge-189 · forge-gen (générateur Forge)
scripts/         build.js, build-mods.js, fetch-jre.js, release.js…        .github/workflows/build.yml  CI Windows
```

**Règle d'architecture** : l'interface ne fait que demander ; le processus principal décide et **revérifie tout** (noms, versions, identifiants, adresses, chemins). Un chemin de fichier vient toujours d'un sélecteur système ou d'un glisser-déposer, jamais d'un texte saisi.

**Ajouter un canal IPC** : (1) `on('mon:canal', fn)` dans `main.js` ; (2) ajouter le nom à `CH` dans `preload.js` ; (3) `call('mon:canal', …)` dans `app.js`. Un canal absent de `CH` est refusé (« Canal refusé ») ; `test/preload.test.js` vérifie que chaque `call()` est autorisé.
**Ajouter une plateforme** : adapter uniquement `platform.js`, puis tester `npm run dist:<os>`.

## 4. Données et journaux

- **Dossier de données** : Windows `%APPDATA%\hydarium-launcher\` · macOS `~/Library/Application Support/hydarium-launcher/` · Linux `~/.config/hydarium-launcher/`.
  `hydarium.json` (comptes — jetons chiffrés par le système, jamais en clair —, instances, serveurs, réglages) · `shared/` (versions, bibliothèques, assets partagés) · `instances/<id>/` · `client/` (mods Hydarium fabriqués) · `logs/` · `received/` (fichiers reçus d'amis) · `chat.json`.
- **Journaux** : `logs/launcher-AAAA-MM-JJ.log` (vie du launcher, 14 jours) · `logs/game-<instance>-<date>.log` (un par lancement : contexte, arguments, sortie du jeu, code de sortie) · `mod-build-<mod>.log` (fabrication du mod) · `shared/installers/*.log` (installeur Forge) · `latest.log` de l'instance (côté jeu). Les jetons sont masqués automatiquement. Paramètres › « Copier le rapport » met un rapport complet dans le presse-papiers. Une vraie fenêtre de logs est disponible (réglage dans Paramètres).
- **Notifications** : toujours de vraies notifications système (jamais de bulle dans la fenêtre) ; Windows exige l'identifiant `fr.hydarium.launcher`. En `npm start`, elles peuvent ne pas apparaître avant d'avoir installé l'exe.

## 5. Les fonctionnalités et pourquoi elles existent

### 5.1 Compte, Java et lancement
- **Connexion Microsoft** réelle. Elle ne déconnecte plus « sans raison » : une erreur passagère (réseau, serveurs surchargés) garde le compte affiché en « Reconnexion… » avec nouvel essai en arrière-plan ; seul un vrai refus de Microsoft déconnecte. Le jeton Minecraft (23 h) est renouvelé juste avant usage.
- **Choix de Java** (instance → Java par défaut → automatique) : Java 8 exact pour les versions jusqu'à 1.16.5 (sinon Forge ne démarre pas), sinon la version demandée par Mojang. **Java absent = téléchargé automatiquement** (Temurin, avec essais, vérifications, secours Azul) : le joueur n'a rien à installer.
- **Assistant de plantage** : une fenêtre explique la cause en français (Java, mémoire, mod incompatible / en double / pour une autre version, dépendance manquante, plantage natif avec la DLL fautive…), désigne les mods suspects et propose des boutons d'action (désactiver, désinstaller, télécharger Fabric API ou le mod manquant, changer Java ou mémoire et relancer, mode sans échec, tout désactiver). Même chose si le lancement échoue *avant* le jeu (« Minecraft n'a pas pu démarrer »).
- **Réglages par défaut des nouvelles instances** (FOV, distance, touches, langue, musique de Minecraft coupée, mémoire, arguments JVM…) écrits dans `options.txt`, avec les formats propres aux vieilles versions (≤ 1.12).

### 5.2 Instances et imports
- Types **Vanilla, Fabric, Quilt, Forge, NeoForge** (Forge / NeoForge : expérimental, jamais exécuté en vrai). Vanilla et Moddé sont regroupés en « Instances » avec des **tags** modifiables, **sélection multiple**, duplication, catégories, notes, mémoire, résolution, arguments JVM, 10+ décors de biome et images.
- **Images d'instance** : objet de Minecraft dessiné sur le décor (automatique ou au choix, texture lue dans le jeu installé), image perso, ou logo officiel du modpack.
- **Import** depuis Prism / MultiMC / Minecraft officiel / CurseForge / ATLauncher, **.mrpack**, zip CurseForge ou Prism, par bouton **ou glisser-déposer** (le contenu est reconnu : mod, pack de ressources, shader, data pack, monde, modpack). Un fichier raté n'annule pas l'import ; un échec complet ne laisse pas d'instance fantôme. Les stats déjà présentes dans une instance importée ne comptent pas.
- **Code de partage** `HYD1.…` (vanilla, fabric, quilt, forge, neoforge avec version du loader) ; **catalogue de modpacks** (Modrinth + CurseForge) ; assistant de bienvenue ; visite guidée au premier lancement.

### 5.3 Mods
- Installation depuis **Modrinth d'abord**, CurseForge en repli ou au choix (API uniquement, clé gratuite demandée dans une fenêtre avec vidéo d'aide ; le site intégré a été supprimé). Dépendances automatiques, mises à jour, **favoris**, tri, fiches.
- **Statuts** : Vérifié (liste `verified.json`) / Non vérifié / « Faire confiance » par mod / contrôle CurseForge. Incompatibilités détectées avant lancement et correction en un clic. Désactiver Sodium propose de désactiver Iris (et inversement) ; retirer un mod avec dépendants : annuler / seulement lui / tout.
- **Choisir la version d'un mod** et revenir en arrière (ex. un bug dans la dernière version d'Iris) : la version choisie est **figée** (« Mises à jour » ne l'écrase pas). Modrinth uniquement.
- **Filtre des mods installés**, sélection multiple (activer / désactiver / retirer), « **Tout désactiver** » (plutôt que « tout retirer », trop violent), images retrouvées même sans icône (Modrinth, jar du mod, logo CurseForge, sinon pastille colorée).
- Le mod **Hydarium** est obligatoire, toujours en tête de liste, non retirable ; aucun autre mod tiers ne sert de client.
- La création d'instance **filtre** les mods incompatibles (loader + version).

### 5.4 Packs, shaders, data packs, mondes
- Catalogue (Modrinth, CurseForge avec clé) pour packs de ressources, shaders, data packs, maps ; favoris en un clic ; import `.zip` partout.
- **Paramètres d'un monde** (nom, mode, difficulté, triche, règles, seed…) avec copie de secours `level.dat.hydarium.bak` ; **data packs** (activation / désactivation dans `level.dat`, « prochain nouveau monde » via un dossier de préparation) ; pack de ressources du monde.
- **Exporter un monde vers une autre instance** (copie sûre, jamais à moitié copié) ; transformer un monde en serveur.
- Boutons cliquables **dans le jeu** (haut droite) pour télécharger data packs / packs de ressources quand l'écran correspondant est ouvert.

### 5.5 Serveurs : rejoindre et héberger
- **Rejoindre** : le launcher pingue le serveur lui-même (version, mods annoncés Forge / NeoForge), choisit une instance compatible ou en propose une. **Les serveurs externes ne donnent pas leur version de façon fiable** : rien n'est créé automatiquement ; une instance qui s'y est déjà connectée est relancée ; sinon on demande « est-ce un serveur Vanilla ? » et on crée une instance Fabric + mod Hydarium (+ mods par défaut choisis dans les Paramètres). Gros modpack de serveur : recherche du modpack correspondant. Instance par défaut réglable par serveur. Faux positifs évités (ex. Hypixel en 1.8.9).
- **Mon serveur** (héberger sur son PC) : Vanilla, Paper, Fabric, Forge, NeoForge ; console, joueurs (liste blanche, opérateurs, bannis), paramètres, icône, description, mods / plugins, **data packs**, export / import, **monde relié** à une instance (lien ou copie), CLUF obligatoire.
- **Accès pour les amis, sans ouvrir de port** : **invitation privée** `HYD-…` en connexion directe (HyperDHT) — code de 120 bits, preuve cryptographique avant d'atteindre le serveur Minecraft, 12 invités max. **Limites affichées dans l'interface** : pas de relais (échec possible en 4G/5G ou CG-NAT), l'IP de l'hôte est visible par ceux qui rejoignent, Hydarium des deux côtés. **playit.gg** (adresse `ply.gg`) reste une option avancée : agent officiel, un tunnel par serveur, adresse détectée toute seule.
- **Serveur moddé** : l'invité reçoit la **liste exacte des mods** de l'hôte et peut tout installer d'un coup, après avoir confirmé (un mod est du code exécuté sur son PC). Les mods sont retrouvés sur Modrinth par empreinte ; jamais téléchargés depuis l'hôte. Hors Modrinth : « à installer toi-même ».
- **Assistant de crash serveur** : arrêt inattendu → cause (CLUF, port pris, data pack fautif, monde illisible, mod réservé au client, watchdog, jar abîmé, plugin…) et boutons de réparation qui relancent le serveur.
- Un **code `HYD-…` peut être collé dans le champ d'adresse du jeu** (Fabric 1.20.1, 1.21, 26.x).
- Vue serveur épurée : seule `localhost` visible d'emblée ; autres adresses, playit.gg repliés.

### 5.6 Amis, chat, fichiers, vocal (tout en direct, sans serveur central, **désactivé par défaut**)
- **Amis** : code ami permanent (`HYA-…`, « Nouveau code » = tous les contacts effacés), demande envoyée sans pseudo (anti-spam, le destinataire voit le pseudo à l'acceptation), présence « en ligne » / « en jeu », « apparaître hors ligne », blocage, **invitation directe à un serveur**. Une fenêtre explique les conséquences (IP visible entre amis) avant l'activation.
- **Chat** privé et de groupe, cartes de partage (instance, modpack, invitation de serveur — jamais de fichier dans la carte), modifier / supprimer ses messages, masquer pour soi, renommer un groupe, modération par l'administrateur. Groupes : membres tous amis de l'administrateur qui les invite ; l'envoi de fichiers ne concerne que les membres amis de l'expéditeur.
- **Fichiers et images** : les fichiers restent chez l'expéditeur, le destinataire les demande en direct ; exécutables refusés, tailles et chemins contrôlés, **reprise d'un transfert interrompu**, images reconnues par le contenu (anti « bombes »), collage Ctrl+V, rangement dans l'instance par tri de contenu.
- **Appels vocaux à deux** (première version, jamais essayée avec un vrai micro) : sonnerie, Opus (sinon PCM), micro ouvert seulement après un clic.

### 5.7 Client Hydarium (le mod en jeu)
- **Pourquoi** : afficher des widgets et offrir des modules sans mod tiers ni dépendre de Lunar / Badlion. Un seul mod « Hydarium », **fabriqué automatiquement sur le PC du joueur pour la version exacte de l'instance**, avant le premier lancement (barre de progression « Composants Minecraft · Hydarium Client »), puis réutilisé. Premier build d'une version : télécharge JDK + Gradle + Minecraft (plusieurs centaines de Mo, 45 min au plus). Un échec ne bloque pas le jeu (notification + bouton « Réessayer »).
- **Couverture** : Fabric 1.19.3+ et 26.x (adaptateurs `fabric-120`, `fabric-121`, `fabric-latest`), Forge 1.8.9 (`forge-189`), Forge 1.12.2 et 1.20.x générés (`forge-gen`, expérimental). Rien pour Quilt, NeoForge, Fabric < 1.19.3, snapshots : seulement le **HUD externe du launcher** (fenêtre transparente, repli).
- **Widgets** : touches, CPS, FPS, coordonnées, direction, armure (vraies textures, couleur selon l'usure), effets, ping, heure, mémoire, musique, temps de session, zoom… **Modules** : zoom (caméra cinématique + molette), luminosité (vrai effet vision nocturne), sprint auto, marche auto, sneak permanent (versions sans l'option native, ex. 1.8.9). Touche d'activation par module, **touches réelles** (la touche physique est enregistrée, l'affichage suit le clavier AZERTY…).
- **Éditeur en jeu** (bouton « Modifier en jeu » du launcher) pour placer les vrais widgets ; style des cases arrondi ou carré (comme la 1.8.9).
- Réglages : `config/hydarium-client.json`, relu par le mod chaque seconde ; le launcher et le jeu restent synchronisés (touche en jeu ↔ case du menu).
- **Supprimés volontairement** : freecam, vue libre, minimap, waypoints.

### 5.8 Menu Alt+H et musique
- **Alt+H** (réglable) ouvre le menu du launcher par-dessus le jeu : skin et cape (choix simple), télécharger (mods, packs, shaders, data packs), captures, musique, profils de modules (PvP, Survie, Minimal, Complet). Le menu dessiné *dans* le jeu existe mais est **désactivé par défaut** (expérimental). Plein écran : protections pour que le jeu ne se réduise pas.
- **Musique** : seulement **YouTube Music et Spotify** (pas YouTube classique) ; titre qui défile, artiste en 2ᵉ ligne ; Spotify en connexion directe.

### 5.9 Skins, captures, statistiques
- **Skins** : skins par défaut de Mojang préinstallés (extraits du jeu, jamais dans le dépôt), skin Hydarium maison, bibliothèque (import PNG, skin d'un joueur, export), capes, **totem** recoloré aux couleurs du skin.
- **Captures** de toutes les instances regroupées, notification, envoi à un ami.
- **Statistiques** : lancements, plantages, temps de jeu par instance (conservé même si l'instance est supprimée), jeu solo et serveurs, graphique 14 jours.

### 5.10 Confidentialité, confort, maintenance
- **Aucune donnée collectée ni vendue**, aucun serveur Hydarium. Écran du **premier lancement** (vie privée d'abord, puis règles) avec case obligatoire ; ton personnel (jamais « entreprise », « société », « notre »).
- **Mode confidentialité (stream)**, actif par défaut : IP, codes d'invitation et code ami floutés (œil pour afficher, « Copier » ne montre rien).
- **Notifications** : par défaut, seulement celles des amis.
- **Mises à jour automatiques** (vérifiées au lancement puis toutes les heures, jamais pendant une partie, installation après compte à rebours avec « Plus tard »).
- **Interface** : français + anglais, thème, fonds, taille réglable 75–150 %, logo dans la barre des tâches, désinstalleur qui propose d'effacer les données, nettoyage ciblé des données, onglet Crédits (Gazein ; « coproduit avec une IA »).

## 6. Décisions du propriétaire (Gazein) à respecter

- Pas de quêtes, cosmétiques, points ni paiement pour l'instant ; le site s'en passe aussi.
- **Hydarium n'ouvre plus aucun port** (UPnP supprimé, jugé dangereux) ; `closeLegacyPorts()` referme une fois les anciens ports restés ouverts (`nat-upnp` ne sert plus qu'à ça : à retirer des dépendances).
- Serveurs locaux sur Internet : **playit.gg uniquement** ; les noms `nom.hydarium.net` (DNS joker + routeur + tunnel) sont repoussés.
- **Aucun mod tiers** comme client en jeu ; le mod Hydarium est obligatoire et créé / récupéré automatiquement pour chaque instance.
- Alt+H = menu normal du launcher ; pas de touche par défaut pour l'éditeur en jeu.
- Musique : YouTube Music et Spotify seulement.
- Amis : demande sans pseudo à l'envoi, code flouté par défaut, tout désactivé par défaut.
- Le code est public sur GitHub mais **pas libre** : ne pas redistribuer ni revendre (à dire sur le site et dans le README).
- Windows d'abord, mais code structuré pour macOS et Linux.

## 7. Pièges connus

- **Mod Hydarium et vieux jar** : un ancien `hydarium-1.8.9.jar` oublié dans `resources/client`, `<données>/client` ou `build-client/` masquait les changements du mod. Le jar livré n'est gardé que s'il n'est pas plus vieux que les sources. Repère : `latest.log` doit contenir `[Hydarium] client chargé (…)`.
- **Le cœur Java est copié dans chaque mod fabriqué** : une seule erreur de compilation dans `client-mod/core` fait échouer **tous** les mods (déjà arrivé). `test/core-compile.test.js` la détecte ; relancer aussi `node --test test/forgegen.test.js` si on touche `HydariumForge.java` (les règles du générateur Forge ont des ancres).
- **Mod 26.x** : le HUD, l'éditeur et le menu sont compilés à part (`failOnError = false`) ; un seul passage Gradle puis lecture du jar pour savoir ce qui a compilé (`full` / `draw` / `core`). Si rien ne s'affiche en 26.x : bandeau dans Paramètres › Général, annotation `::error::` de la CI, `latest.log`. Les API de Minecraft changent à chaque version : le code passe par réflexion et tolère l'absence.
- **Mixin** : `hydarium.mixins.json` est en mode tolérant (`required:false`, `defaultRequire:0`) : un mixin qui ne s'applique pas ne plante pas le jeu, il désactive seulement sa fonction (ex. le code P2P dans l'adresse).
- **Interface (`app.js`)** : jamais de code JavaScript dans un gabarit (`` ` ``) non fermé (déjà arrivé : des réglages entiers sont restés invisibles) ; `test/templatesafe.test.js` le garde. Le HTML n'accepte que les images / hôtes autorisés par la CSP ; les `style=""` demandent `style-src 'unsafe-inline'`.
- **Fenêtre de jeu** : ne pas utiliser `confirm()` natif (bloque le focus dans Electron) → fenêtres internes `#modal` ; un seul rendu à la fois.
- **Forge** : installeur officiel lancé au premier lancement, expérimental ; Forge n'a rien pour « 1.16 » (la première est 1.16.1).
- **Modrinth / CurseForge / mcsrvstat / playit** : services tiers gratuits, peuvent changer ou tomber. Un mod CurseForge n'est pas retrouvé par empreinte sans clé.
- **Dépôt privé** = les joueurs ne peuvent rien télécharger et la mise à jour reste muette.
- **Ne jamais committer** `dist/`, `build-jre/`, `.node/`, `node_modules/`, ni de clés. Un numéro de version ne se réutilise jamais.
- **Instances importées avant la 0.10.19** n'ont pas de `statBase` : leurs anciennes stats comptent.

## 8. En cas de problème : où regarder

| Symptôme | Premier endroit |
|---|---|
| Le jeu se ferme tout seul | fenêtre de plantage, puis `logs/game-…log`, dossier `crash-reports` de l'instance |
| Le client Hydarium ne se construit pas | notification « Mod Hydarium non construit », `mod-build-<mod>.log`, Paramètres › Général |
| Widget / touche muet en jeu | `latest.log` (`[Hydarium] …`), `config/hydarium-client.json`, version du jar utilisé (voir pièges) |
| Rien ne s'affiche en 26.x | Paramètres › Général (cause du dessin), annotation de la CI |
| Forge ne démarre pas | `launcher-*.log` (lignes « installeur »), `shared/installers/*.log`, Java 8 exact pour ≤ 1.16.5 |
| playit sans adresse | carte playit (journal replié), `playit/playitd.log`, `settings.playitArgs` |
| Déconnexions Microsoft | lignes « Connexion Microsoft : … » (catégorie `net` / `busy` / `denied`) |
| Logo d'Electron au lieu du logo Hydarium | annotation « Logo non incrusté » de la CI ; cache d'icônes de Windows |
| Mise à jour automatique muette | dépôt public ? `latest.yml` présent dans la Release ? |

## 9. Reste à faire

Voir [`A-FAIRE.md`](A-FAIRE.md). En résumé : première CI Windows complète et essai sur un Windows propre, vérifier les mods en vrai (1.8.9, 1.20.1, 1.21, 26.x), appels vocaux avec un vrai micro, deux PC réels pour les invitations et amis, vocal de groupe, interface plus « Minecraft », signature de l'exe, LICENSE, version « ultra optimisée » (idée).

## 0.11.0 — version actuelle

- Passage de la 0.10.75 à la **0.11.0** : aucune fonction changée, seulement le numéro (`package.json`, `package-lock.json`, cette fiche, `A-FAIRE.md`).
- Fiche de reprise condensée (210 Ko → quelques Ko) et README GitHub refait.
- Publier : `npm run release -- 0.11.0`.