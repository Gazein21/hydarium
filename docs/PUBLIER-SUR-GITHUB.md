# Publier Hydarium sur GitHub (pas à pas, Windows)

Dépôt : https://github.com/Gazein21/hydarium (vide et privé au départ).
Résultat final : les joueurs téléchargent **un petit installeur** (`Hydarium-Installer.exe`) depuis la page « Releases » ; il récupère le reste sur GitHub, et le launcher se met ensuite à jour tout seul à chaque lancement.

## 0. Une seule fois : installer Git
1. Installe **Git for Windows** : https://git-scm.com/download/win (laisse toutes les options par défaut).
2. Ouvre **PowerShell** (ou « Git Bash »), et présente-toi à Git :
   ```
   git config --global user.name "Gazein21"
   git config --global user.email "ton-adresse-email-github"
   ```

## 1. Envoyer le projet (première fois)
Dans PowerShell, place-toi dans le dossier du projet (celui qui contient `package.json`) :
```
cd C:\chemin\vers\hydarium-launcher
git init -b main
git add .
git status
```
Vérifie dans la liste que **ni `node_modules`, ni `dist`, ni `build-jre`, ni `.node`** n'apparaissent (le fichier `.gitignore` les exclut). Puis :
```
git commit -m "Hydarium 0.10.52 : première publication"
git remote add origin https://github.com/Gazein21/hydarium.git
git push -u origin main
```
Une fenêtre du navigateur s'ouvre pour te connecter à GitHub (c'est normal, c'est le « Git Credential Manager »). Recharge la page du dépôt : les fichiers sont là.

> Si le dossier contient déjà un `.git` d'un ancien essai, supprime-le d'abord.

## 2. Construire et publier (dépôt encore privé : c'est le bon moment pour tester)
1. Sur GitHub : onglet **Actions** → « Build Windows » → **Run workflow** (branche `main`).
2. Attends 10 à 20 minutes. Les étapes « Tests » et « Mod Hydarium … » peuvent afficher une erreur sans rien bloquer : elles sont volontairement tolérantes. Seule la construction de l'installeur compte.
3. À la fin, une **Release** « Hydarium 0.10.52 » (tag `v0.10.52`, créé automatiquement) apparaît à droite de la page d'accueil du dépôt, rubrique **Releases**. Elle contient :
   - **`Hydarium-Installer.exe`** : le fichier à donner aux joueurs (nom fixe, lien permanent `https://github.com/Gazein21/hydarium/releases/latest/download/Hydarium-Installer.exe`) ;
   - `Hydarium-Setup-0.10.52.exe` : le même, au nom versionné (celui que lit la mise à jour automatique) ;
   - `hydarium-launcher-0.10.52-x64.nsis.7z` : le programme complet, téléchargé par le petit installeur ;
   - `Hydarium-Portable-0.10.52.exe` : version sans installation ;
   - `latest.yml` : lu par la mise à jour automatique.
4. Relancer pour la même version **remplace** les fichiers de cette Release : pratique pour corriger et réessayer.

Tant que le dépôt est privé, seuls les membres du dépôt voient la Release.

## 3. Passer le dépôt en public
**Obligatoire** : sur un dépôt privé, un joueur sans compte ne peut rien télécharger et la mise à jour automatique ne trouve rien.
Dépôt → **Settings** → tout en bas **Danger Zone** → **Change visibility** → Public.
Avant : relis qu'aucune clé ni mot de passe ne traîne (rien trouvé dans le code) et choisis une licence (**Add file → Create new file → `LICENSE`**, GitHub propose des modèles).

## 4. Poser un tag à la main (facultatif)
Pousser un tag `vX.Y.Z` fait la même chose que « Run workflow » :
```
git tag v0.10.52
git push origin v0.10.52
```

## 5. Les versions suivantes (une seule commande)
1. Fais tes modifications, puis ajoute **à la fin** de `docs/FICHE-DE-REPRISE.md` une section `## 0.10.53 — ce que tu as changé` (les tests l'exigent).
2. Lance :
   ```
   npm run release -- 0.10.53
   ```
   Le script vérifie tout, change le numéro, lance les tests, fait le commit, le tag `v0.10.53` et envoie. GitHub fabrique la Release. (`npm run release -- 0.10.53 --dry` pour juste voir ce qui serait fait.)
3. Les joueurs qui ont déjà Hydarium reçoivent la mise à jour à leur prochain lancement (téléchargée en arrière-plan, installée à la fermeture du launcher).

## 6. Avant d'annoncer : tester comme un joueur
- Sur un Windows **propre** (ou une machine virtuelle), sans Java : télécharge `Hydarium-Setup-X.exe` depuis la Release, installe, lance, joue.
- Publie une version suivante et vérifie qu'un launcher déjà installé se met à jour (Paramètres › Général › « Rechercher une mise à jour »).
- Windows affichera sans doute « Windows a protégé votre ordinateur » (l'exe n'est pas signé) : « Informations complémentaires » → « Exécuter quand même ». La signature est un sujet à part (voir la fiche de reprise).

## Règles d'or
- Un numéro de version ne se réutilise **jamais** (si une Release est ratée : publie la suivante, `0.10.54`).
- Le tag s'écrit `v` + version (`v0.10.53`) : le petit installeur en dépend.
- Ne committe jamais `dist/`, `node_modules/`, des clés ou des mots de passe.
