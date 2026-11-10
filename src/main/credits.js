/* Crédits : tout ce qui a rendu Hydarium possible. Ce sont des DONNÉES (l'interface les affiche) ; les liens sont en https et s'ouvrent dans le navigateur.
   Les licences ne sont indiquées que lorsqu'elles ont été relevées dans le paquet lui-même (nat-upnp n'en déclare aucune : rien n'est affiché pour lui). */
const AUTHOR = { name: 'Gazein', role: 'Créateur et constructeur d’Hydarium' };
const CO = 'Coproduit avec une IA : conçu et écrit en collaboration avec une intelligence artificielle, sous la direction de Gazein.';
const SERVICES = [
  ['playit.gg', 'Accès Internet gratuit pour les serveurs locaux. Hydarium pilote l’agent officiel playit (licence BSD-2-Clause).', 'https://playit.gg'],
  ['Holepunch · HyperDHT', 'Découverte des pairs et connexion directe pour les invitations privées (MIT).', 'https://github.com/holepunchto/hyperdht'],
  ['Modrinth', 'Catalogue de mods, modpacks, packs de ressources et shaders.', 'https://modrinth.com'],
  ['CurseForge', 'Second catalogue de contenu (avec ta propre clé d’API).', 'https://www.curseforge.com'],
  ['Mojang Studios et Microsoft', 'Minecraft, comptes Microsoft, textures et serveurs de session.', 'https://www.minecraft.net'],
  ['Fabric', 'Chargeur de mods et sa liste de versions.', 'https://fabricmc.net'],
  ['Quilt', 'Chargeur de mods.', 'https://quiltmc.org'],
  ['Minecraft Forge', 'Chargeur de mods et installateurs.', 'https://files.minecraftforge.net'],
  ['NeoForge', 'Chargeur de mods et installateurs.', 'https://neoforged.net'],
  ['PaperMC', 'Serveurs Paper pour « Mon serveur ».', 'https://papermc.io'],
  ['Eclipse Adoptium', 'Java (Temurin) téléchargé automatiquement.', 'https://adoptium.net'],
  ['Azul Zulu', 'Java de secours quand Adoptium n’a pas la version voulue.', 'https://www.azul.com/downloads/'],
  ['Spotify', 'Contrôle de la musique dans le launcher.', 'https://developer.spotify.com'],
  ['mcsrvstat.us', 'État en ligne des serveurs de « Mes serveurs ».', 'https://mcsrvstat.us'],
  ['MC-Heads', 'Têtes et avatars des joueurs.', 'https://mc-heads.net'],
  ['Gradle', 'Fabrication du mod Hydarium Client.', 'https://gradle.org'],
  ['YouTube', 'Vidéo d’aide intégrée.', 'https://www.youtube.com']
];
const LIBS = [
  ['Electron', 'Electron Community', 'MIT', 'https://www.electronjs.org', 'Application de bureau.'],
  ['electron-builder', 'Vladimir Krivosheev', 'MIT', 'https://www.electron.build', 'Fabrication des installateurs.'],
  ['minecraft-launcher-core', 'Pierce Harriz', 'MIT', 'https://github.com/Pierce01/MinecraftLauncher-core', 'Téléchargement et lancement du jeu.'],
  ['msmc', 'Hanro50', 'MIT', 'https://github.com/Hanro50/MSMC', 'Connexion au compte Microsoft.'],
  ['hyperdht', 'Mathias Buus et l’équipe Holepunch', 'MIT', 'https://github.com/holepunchto/hyperdht', 'Réseau pair-à-pair des invitations privées.'],
  ['adm-zip', 'Nasca Iacob', 'MIT', 'https://github.com/cthackers/adm-zip', 'Lecture et écriture des fichiers zip.'],
  ['uiohook-napi', 'Alexander Drozdov', 'MIT', 'https://github.com/SnosMe/uiohook-napi', 'Raccourcis clavier en jeu.'],
  ['rcedit', 'Electron Community', 'MIT', 'https://github.com/electron/node-rcedit', 'Icône et informations de l’exécutable Windows.'],
  ['nat-upnp', 'Fedor Indutny', '', 'https://github.com/indutny/node-nat-upnp', 'Sert uniquement à refermer les ports ouverts par d’anciennes versions d’Hydarium.']
];
exports.list = () => ({
  author: AUTHOR, coproduction: CO,
  sections: [
    { title: 'Services et projets', items: SERVICES.map(([name, role, url]) => ({ name, role, url })) },
    { title: 'Bibliothèques', items: LIBS.map(([name, by, license, url, role]) => ({ name, role, url, by, license })) }
  ],
  legal: 'Hydarium n’est pas un produit officiel Minecraft. Il n’est ni approuvé par Mojang ou Microsoft, ni associé à eux. Minecraft est une marque de Mojang Synergies AB. Les autres noms appartiennent à leurs propriétaires.'
});
