# Client Hydarium (en jeu) : spécification

Ce que le launcher fait déjà (v0.6.0) et ce que l’agent Java devra faire. L’agent n’est **pas encore écrit** : aucune partie en Java n’a été produite ni testée.

## Principe
Un **agent Java** (`-javaagent:hydarium-agent.jar`) est ajouté par le launcher au démarrage de l’instance si « Client Hydarium » est activé. Il fonctionne sans mod : Vanilla, Fabric, Quilt, Forge, NeoForge. Il transforme les classes du jeu au chargement (ASM) et dessine / réagit en jeu. Le launcher reste le tableau de bord : tout se règle dans l’onglet « Client Hydarium » de l’instance.

Emplacement attendu du jar : `<ressources de l’application>/client/hydarium-agent.jar` ou `<données>/client/hydarium-agent.jar`.

## Ce que le launcher fournit déjà
- Propriétés JVM : `-Dhydarium.bridge=http://127.0.0.1:<port>`, `-Dhydarium.token=<jeton>`, `-Dhydarium.instance=<id>`, `-Dhydarium.config=<chemin>`.
- Fichier de configuration `config/hydarium-client.json` écrit à chaque lancement :
```json
{ "version": 1, "instance": "abc", "mc": "1.21.4", "loader": "fabric",
  "modules": { "keystrokes": {"on": true, "layout": "auto"}, "cps": {"on": true}, "fps": {"on": true}, "coords": {"on": true},
               "armor": {"on": true, "durability": true}, "waypoints": {"on": true, "key": "B"},
               "gamma": {"on": true, "level": 8}, "music": {"on": false}, "clock": {"on": false} } }
```
- Pont HTTP local (127.0.0.1, en-tête `Authorization: Bearer <jeton>`, jeton nouveau à chaque session) :
  - `GET /v1/ping`, `GET /v1/config?i=<id>`
  - `GET /v1/music` → `{ track: { title, artist, app, playing } | null }` ; `POST /v1/music` `{ "cmd": "playpause|next|prev" }`
  - `POST /v1/overlay` `{ "page": "hub|skins|content|shots|music" }` → ouvre le menu Hydarium par-dessus le jeu.
- **Menu en jeu** déjà utilisable sans agent : raccourci global (Alt+H par défaut) pendant que le jeu tourne → fenêtre du launcher au-dessus de Minecraft (skin avec aperçu, téléchargement de mods / packs / shaders / data packs, captures, musique). Marche en fenêtré et plein écran fenêtré ; le plein écran exclusif peut la masquer.
- Musique : session multimédia du système (Windows : SMTC via PowerShell ; Linux : playerctl ; macOS : Spotify). Couvre Spotify et YouTube Music dans un navigateur.

## Ce que l’agent doit faire (par module)
| Module | Besoin en jeu |
|---|---|
| Touches | état des touches de déplacement (disposition WASD / ZQSD d’après les touches réellement assignées) |
| CPS | horodatage des clics gauche / droit |
| FPS, coordonnées | lecture des champs du jeu ; utile avant le F3 amélioré des versions récentes |
| Armure | équipement du joueur + durabilité restante |
| Waypoints | liste locale par monde / serveur, affichage de direction et distance |
| Gamma | valeur de gamma au-delà du curseur normal |
| Musique | appelle le pont (`/v1/music`) et affiche |
| Raccourci menu | envoie `POST /v1/overlay` |

## Difficulté réelle : les versions
Les noms internes (obfuscation) et le code de rendu changent à chaque version. Plan réaliste :
1. Récupérer les **mappings officiels** de la version (`client_mappings` du manifeste Mojang) pour retrouver les classes par leur vrai nom.
2. **Adaptateurs par époque** : une couche commune (modules, configuration, pont) et un petit adaptateur par groupe de versions (1.8–1.12, 1.13–1.16, 1.17–1.20, 1.21+, versions récentes sans obfuscation).
3. Commencer par 1.20+ puis élargir vers l’arrière. « Toutes les versions » se fait par étapes, pas d’un coup.
Alternative plus stable : un mod multi-loader (Fabric / NeoForge / Forge) généré depuis un seul code, installé par le launcher, qui lit le même fichier de configuration et parle au même pont.

## Cosmétiques (plus tard)
Le pont et la configuration sont prévus pour : `GET /v1/cosmetics` (liste équipée du joueur, fournie par le serveur Hydarium) et un module de rendu dans l’agent. Rien à faire côté launcher tant que le serveur n’existe pas.

## Mise à jour v0.7.0 : modules et éditeur de HUD
Schéma de `modules` (chaque entrée : `on`, et selon le module `pos {x,y}` en fraction de l’écran, `scale` 0,5–3, `opacity` 0,1–1, `color` #rrggbb, `bg`, `key`, `level`, `layout`, `durability`) :
`fps, cps, keystrokes, coords, direction, armor, potions, ping, clock, memory, music, waypoints, zoom, togglesprint, togglesneak, gamma`.
Inspiration : Lunar Client, Badlion, Feather. Leur point commun : une couche commune (HUD, configuration, éditeur) + des adaptateurs par version du jeu.

## Mise à jour v0.8.0 : HUD externe
Sans agent, le launcher affiche déjà un HUD transparent par-dessus le jeu (touches, CPS, heure, mémoire, ping, musique, temps de session). L’agent reste nécessaire pour tout ce qui lit l’état interne du jeu. Le HUD externe et l’agent partagent le même fichier de configuration : l’agent peut reprendre les modules qu’il sait afficher et laisser les autres au HUD externe.

## Mise à jour v0.10.3 : le « mode Hydarium » (notre propre mod)
Un seul mod qui regroupe les modules en jeu, en **trois variantes** (`client-mod/`) :

| Dossier | Jeu | Chargé par | Dessine le HUD ? |
|---|---|---|---|
| `fabric-120` | 1.20.1 | Fabric (`-Dfabric.addMods`, pas de copie dans `mods`) | oui, dans le jeu |
| `fabric-latest` | 26.x (non obfusqué, Java 25) | Fabric (idem) | non : le launcher affiche le HUD à partir de l’état envoyé |
| `forge-189` | 1.8.9 | Forge (le launcher copie `hydarium-1.8.9.jar` dans `mods` au lancement) | oui, dans le jeu |

- **Cœur commun** `client-mod/core` : Java 8, aucune dépendance, aucun type Minecraft (configuration, construction des widgets, CPS, waypoints, pont, JSON). **Testé** (`core/test/CoreTest.java`, rejoué par la CI).
- **Adaptateurs** : lecture de l’état du jeu + dessin + applications (luminosité, zoom, sprint). **Jamais compilés contre Minecraft** : ils ont été écrits sans accès aux dépendances de Minecraft. La première CI dira ce qui doit être corrigé (noms d’API, surtout pour 26.x).
- Modules inclus : fps, cps, touches, coordonnées, direction, armure, effets, ping, heure, mémoire, session, musique (via le pont), waypoints (touche B : ajoute un point ; les 3 plus proches s’affichent avec distance et côté), luminosité, zoom (tenir C), sprint automatique.
- **Pas inclus** : minimap (1.8.9 et versions récentes). La minimap continue d’utiliser les mods Modrinth ; la vue libre n’existe pas encore.
- Quand le mod dessine un module, il l’annonce (`drawn` dans `POST /v1/state`) et le HUD externe du launcher ne le dessine plus (pas de doublon). `-Dhydarium.draw=0` force le HUD externe (réglage `client.nativeHud = false`).
- Versions sans mode Hydarium (ex. 1.21.x, 1.12) : comportement précédent (HUD externe + mods Modrinth pour luminosité / zoom).
- 1.8.9 : Forge doit être le loader de l’instance ; en Vanilla le HUD externe reste utilisé.

## Mise à jour v0.10.35 : zoom
Module `zoom` : `on`, `key` (touche qui active / désactive), `level` (zoom de départ, 1,5–30, défaut 4), `cinematic` (défaut vrai : caméra cinématique du jeu pendant le zoom, rétablie ensuite). Pendant le zoom, la molette règle le niveau au lieu de changer de case d'inventaire (comportement normal dès que le zoom est éteint ou qu'un menu est ouvert).


## Générateur Forge (client-mod/forge-gen) — un modèle, plusieurs versions

Le mod Forge n'est plus écrit à la main pour chaque version : `client-mod/forge-gen/gen.js` le **génère** à partir des sources existantes.

| Famille | Versions | Source de départ | Ce que fait le générateur |
|---|---|---|---|
| `legacy` | 1.12.2 | `forge-189/HydariumForge.java` | règles de renommage 1.8.9 → 1.12.2 (joueur, monde, armure en liste, réseau, molette, effets…) |
| `modern` | 1.20.1 (+ 1.20.2 à 1.20.4, **expérimentales**) | `fabric-common` + `fabric-120` | retire Fabric (entrée, évènements, Mixin), ajoute l'entrée Forge, remplace 3 helpers par réflexion par des appels directs |

- **Table** : `FORGE_GEN` dans `src/main/modplan.js`, une ligne par version (famille, source, jdk, gradle, ForgeGradle, version de Forge de secours, niveaux `full`/`core`). Ajouter une version PROCHE = ajouter une ligne.
- **Nouvelle époque** (1.16.5, 1.18.2, 1.19.2 : rendu par `PoseStack`, pas `GuiGraphics`) = écrire une famille de règles dans `gen.js`. Pas encore faites ; ces versions restent en HUD launcher seul.
- **Sécurité** : chaque règle a une ancre ; si une source change de forme, le générateur échoue avec un message clair (jamais de mod faux). `test/forgegen.test.js` le vérifie.
- **Limites connues Forge moderne** : caméra cinématique pendant le zoom non prise en charge (le zoom marche) ; FPS compté par le mod (pas de réflexion, noms SRG en production).
- **Jar dans l'instance** : `mods/hydarium-<version>.jar` ; le jar d'une autre version est retiré.
- **JAMAIS compilé contre Minecraft** (comme les adaptateurs Fabric) : validé = génération, cohérence interne et syntaxe Java. Le premier vrai test est la première fabrication (Gradle) ; en cas d'échec, le niveau `core` puis le HUD du launcher prennent le relais.
- (Corrigé en 0.10.45) `modbuild.test.js` « prepare » attendait l'inverse du code ; il vérifie maintenant le réglage `autoMod` désactivé.

### Forge 26.x (famille `forge26`)
Écrite d'après le **MDK officiel de Forge 26.3** (66.1.2) : ForgeGradle 7 (`[7.0.17,8)`), Gradle 9.7.1, Java 25, jeu non obfusqué, EventBus 7, `clientSideOnly=true` dans `mods.toml`. Cibles : **26.3** (d'après le MDK) et **26.2** (expérimentale, jamais vue). 26.1 : non prise en charge.
- Source : cœur Fabric 26 (`fabric-common` + `fabric-latest`). Le `Compat` de `fabric-latest` est 100 % réflexion, sans Fabric : repris tel quel.
- Un seul niveau, `core` : le launcher dessine le HUD (comme Fabric 26).
- **Le tick n'utilise PAS d'évènement Forge** (nom non vérifiable sans le jar de Forge 26) : un fil demande au fil principal d'exécuter `onTick` toutes les 50 ms via `Minecraft.execute`. À remplacer par l'évènement de tick de Forge une fois son nom vérifié (`templates/forge26/ClientSetup.java`).
- Non vérifié : l'installation de Forge 26 par le launcher (`forge.js`), et la compilation réelle.
