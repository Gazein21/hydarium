# Mode client entièrement dans le jeu

**But.** Quand le mod du mode client est compatible, les widgets sont dessinés PAR le mod dans le jeu (plus de superposition par la fenêtre du launcher), et leur disposition / leurs réglages se font DANS le jeu, sur les vrais widgets (pas sur une maquette).

> **Rien de ceci n'a été compilé contre Minecraft ni essayé en jeu** (pas de Minecraft ici). Le cœur (Painter, Editor, Config) est testé en Java pur ; les adaptateurs ont été vérifiés par une compilation tolérante (aucune erreur hors symboles Minecraft) et par les tests du générateur Forge.

## Ce que ça change pour le joueur
- **Dessin** : un seul dessin, partagé par toutes les versions (`Painter`), donc identique partout. Le HUD du launcher ne dessine plus rien pour les modules que le mod dessine déjà (mécanisme `drawn`, inchangé).
- **Éditeur en jeu** : touche **Maj droite** (réglable : module `hudedit`, champ `key`, du fichier de configuration), ou bouton **« Modifier en jeu (vrais widgets) »** dans la page du mode client du launcher. On y voit les vrais widgets avec leurs vraies valeurs :
  - glisser à la souris (aimantation aux bords, au centre et aux autres widgets, guides bleus) ; flèches = 1 pixel ; `+` / `-` = taille ; `R` = réinitialiser ; Échap ou « Terminé » = fermer ;
  - liste des 12 widgets avec case à cocher (un module actif mais vide, par exemple la musique sans lecture, montre un contenu d'exemple pour pouvoir être placé) ;
  - réglages du widget choisi : taille, opacité, fond, couleur, éléments affichés (armure : icône / nom / % ; effets : icône / nom / niveau / durée), réinitialiser.
- **Enregistrement** : le mod signale les réglages au launcher (champ `lay` de l'état), qui les enregistre pour l'instance et réécrit la configuration ; le mod oublie alors son réglage local.

## Versions
| Version | Dessin en jeu | Éditeur en jeu |
|---|---|---|
| Forge 1.8.9 | oui (réécrit sur le cœur) | oui (`GuiScreen`) |
| Forge 1.12.2 (générée depuis 1.8.9) | oui | oui |
| Fabric 1.20.1 / 1.21 (niveau « full ») | oui (réécrit sur le cœur) | oui (`Screen`) |
| Forge 1.20.x (générée depuis Fabric) | oui | oui |
| Fabric « latest » / Forge 26 / niveau « core » (Fabric 1.19, replis) | **non** : le HUD du launcher reste le repli | **non** |

Ces dernières versions ne dessinent pas parce que leur API de dessin n'est pas vérifiée (voir `modplan.js`, champ `draw`). Pour en ajouter une, il suffit d'écrire ~80 lignes : une classe qui implémente `Canvas` (7 gestes : `fill`, `text`, `push/pop`, `textWidth`, `fontHeight`, `icon`) et un écran qui transmet la souris / le clavier à `Editor` — copier `HudCanvas.java` + `HudScreen.java` de `fabric-120` (Fabric) ou `Cv` + `HudScreen` de `HydariumForge.java` (Forge), puis passer le champ `draw` du plan à vrai.

## Architecture (cœur : `client-mod/core/src/net/hydarium/core/`)
- `Canvas` (nouveau) : ce que chaque version fournit.
- `Painter` (nouveau) : dessin d'un widget et calcul de son cadre exact (reprise à l'identique des formules des anciens dessins Fabric et Forge : cases, icônes, lignes « petites », titre qui défile, grille de touches, coins arrondis, position bornée à l'écran). Le dessin en partie et l'éditeur utilisent les mêmes chiffres.
- `Editor` (nouveau) : toute la logique de l'éditeur (sélection, glisser, aimantation, boutons, clavier). Aucune dépendance à Minecraft.
- `Config` : couche « réglages modifiés dans l'éditeur » (`edit`, `setOn`, `resetEdit`, `freeze`, `layoutJson`), réconciliation avec le fichier (le launcher a repris la valeur → on l'oublie ; le launcher a changé le module autrement → il gagne ; autre module modifié → on garde), et demande d'ouverture `cmd.editor` (une demande déjà dans le fichier au démarrage est ignorée).
- `Hud.buildEdit` (contenu d'exemple, `Widget.ghost`), `State.layout` / `State.editor`, `Bridge` (champs `lay` et `ed` de l'état), `Features.editorKey`.
- Adaptateurs : `forge-189/HydariumForge.java` (`Cv`, `HudScreen`, ouverture dans `features`) ; `fabric-120` et `fabric-121` : `Draw.java` (réécrit), `HudCanvas.java` et `HudScreen.java` (nouveaux) ; `fabric-common/HydariumClient.java` (cherche `HudScreen` par réflexion comme `Draw` ; envoie `lay` et `ed` ; ouvre l'éditeur). Le HUD n'est plus dessiné pendant que l'éditeur est ouvert (sinon les fonds seraient doublés).
- Générateur Forge (`forge-gen`) : inchangé ; ses 37 tests passent. Il a une règle d'ancre sur les imports de `Draw.java` (garder l'import `ClientTickEvents`) et vérifie les références entre classes : d'où la classe `HudCanvas` à part (une classe imbriquée `Draw.Cv` était refusée).

## Côté launcher
- `src/main/layoutsync.js` (nouveau, testé) : validation et bornes de ce que le mod envoie.
- `main.js` : `syncLayout` (route `/v1/state`, comme `syncToggles`) et canal `client:editor` ; `session.js` : `writeConfig(inst, dir, extra)` (pour `cmd.editor`) ; `hud.js` : retient `ed`, expose `gameDraws()` ; `preload.js` : canal `client:editor` autorisé (**tout nouveau canal doit être dans cette liste, sinon « Canal refusé »**) ; `app.js` : bouton « Modifier en jeu ».

## Tests
`CoreTest` (dessin : chiffres des cadres et des gestes ; éditeur : sélection, glisser, aimantation, bords, flèches, réglages, cases ; réconciliation avec le fichier ; demande d'ouverture ; état `lay` / `ed`), `test/layoutsync.test.js` (18), `test/preload.test.js` (vérifie que chaque canal appelé par l'interface est autorisé : 148 canaux, 12 événements). À ajouter dans le script `test` de `package.json` : `node test/layoutsync.test.js && node test/preload.test.js`.

## À essayer en premier
1. Forge 1.8.9 : le HUD doit être exactement comme avant ; Maj droite ouvre l'éditeur ; déplacer un widget, fermer, rouvrir le jeu : la position est gardée.
2. Fabric 1.20.1 / 1.21 : idem ; effets et armure avec leurs icônes.
3. Le bouton « Modifier en jeu » du launcher pendant que le jeu tourne (ouverture ~1 s après le clic).
