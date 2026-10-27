# Royaume des Connaissances 🏰🗺️

Application éducative interactive et ludique pour enfants explorant les régions et savoirs de Tunisie à travers 8 parcours thématiques interactifs.

---

## 🌟 Fonctionnalités & Contenu

- **Carte Interactive & Caméra Dynamique :** Exploration fluide en vue aérienne avec zoom cinématique, nuages organiques animés et système de brume découvrant les étapes au fil de la progression.
- **8 Parcours d'Apprentissage (Journées 1 à 8) :**
  - **Journée 1 :** Tunis & découverte phonologique du son `[z]` (sélection d'objets, écoute audio, syllabes, phrases).
  - **Journée 2 :** Dougga & lecture narrative interactive (Caroline à l'école, écoute avec récitation audio).
  - **Journées 3 à 8 :** Exercices visuels, associations de mots, dictées interactives, glisser-déposer, surlignage et validation immédiate.
- **Moteur Ambiant & Sons :**
  - Sons d'interaction tactiles (bruitages ludiques générés par Web Audio API).
  - Musique de fond douce avec atténuation automatique (*audio ducking*) pendant les consignes vocales.
  - Vol des mouettes et brise marine en temps réel via Canvas 60 FPS sans surcharge mémoire.
- **Persistance Locale :** Progression enregistrée automatiquement dans le navigateur (`localStorage`).

---

## 🚀 Hébergement sur GitHub Pages

Ce projet est entièrement statique (HTML5, CSS3, JavaScript Vanilla). Aucun serveur backend ni processus de compilation (`npm build`, `webpack`, etc.) n'est requis.

### Instructions de déploiement en 3 étapes :

1. **Créer un nouveau dépôt GitHub :**
   - Créez un dépôt public ou privé sur votre compte GitHub (par exemple `royaume-des-connaissances`).
2. **Téléverser ou pousser le projet :**
   - Initialisez git dans ce dossier ou téléversez tous les fichiers de ce dossier à la racine de votre dépôt GitHub :
     ```bash
     git init
     git add .
     git commit -m "Initial commit - Royaume des Connaissances"
     git branch -M main
     git remote add origin https://github.com/<votre-utilisateur>/<votre-depot>.git
     git push -u origin main
     ```
3. **Activer GitHub Pages :**
   - Sur GitHub, accédez à **Settings** > **Pages**.
   - Sous **Build and deployment** / **Branch**, sélectionnez la branche `main` et le dossier `/(root)`.
   - Cliquez sur **Save**.
   - Votre site sera en ligne en quelques secondes à l'adresse :  
     `https://<votre-utilisateur>.github.io/<votre-depot>/`

---

## 📂 Structure du Projet

```text
├── index.html                 # Point d'entrée principal (structure, styles et logique des activités)
├── ambient_life.js           # Moteur d'effets météo et ambiance (mouettes, particules, vent)
├── sound_system.js           # Système sonore Web Audio et musique d'ambiance
├── dev_overlay.js            # Outil de calibration des zones interactives (touche X)
├── audio/                    # Musique de fond et bruitages
├── map_assets_full/          # Cartes haute définition des niveaux (Layer_1 à Layer_13)
├── clean_clouds/             # Sprites de nuages pour les transitions cinématiques
├── journe 1/ à journe 8/     # Ressources graphiques, audios et exercices de chaque journée
└── README.md                 # Documentation du projet
```
