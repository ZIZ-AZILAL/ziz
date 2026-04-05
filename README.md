# ⛽ Station ZIZ Management – Système de Gestion Complet (A à Z)

## 📌 Présentation du Projet
**Station ZIZ** est une application web et desktop moderne conçue sur mesure pour simplifier et automatiser la gestion quotidienne d'une station-service. De la saisie des compteurs à l'émission de factures professionnelles, l'application centralise toutes les opérations critiques sur une interface fluide, sécurisée et performante.

---

## 🚀 Fonctionnalités Clés

### 1. Gestion des Sessions (Calculateurs)
- **Saisie des Index** : Suivi précis du Gasoil, Super et Services (Lavage, Lubrifiants, etc.).
- **Calcul Automatique** : Calcul instantané des volumes vendus et du chiffre d'affaires brut.
- **Gestion des Crédits** : Suivi des avances et des restes à payer directement lors de la clôture de session.
- **Archivage** : Sauvegarde historique de toutes les sessions avec export possible.

### 2. Module de Facturation (Professionnel)
- **Génération Rapide** : Création de factures avec calcul automatique de la TVA (10%).
- **Impression Premium** : Mise en page soignée avec logo ZIZ, filigrane et informations légales.
- **Partage WhatsApp** : Envoi direct du récapitulatif de la facture au client via WhatsApp.
- **Numérotation Séquentielle** : Gestion automatique des numéros de facture.

### 3. Le "Konnach" (Livre de Crédits)
- **Suivi Clients** : Base de données clients dédiée au crédit.
- **Historique des Transactions** : Registre détaillé de ce que le client a pris et de ce qu'il a payé.
- **Soldes en Temps Réel** : Visualisation immédiate de l'état financier de chaque client.

### 4. Statistiques & Reporting
- **Tableaux de Bord** : Rapports de ventes par jour, semaine et mois.
- **Analyse des Produits** : Répartition détaillée des ventes par type de carburant.
- **Suivi des Pompistes** : Performance par vacation et par employé.

### 5. Sécurité & Contrôle
- **Accès par PIN** : Protection des zones sensibles par code de sécurité.
- **Alertes Intrusion** : Système d'alerte par email (Gmail) après plusieurs tentatives erronées.
- **Diagnostic Système** : Module intégré pour vérifier l'état de la base de données et du serveur.

---

## 🛠 Architecture Technique
L'application repose sur une pile technologique robuste et légère :
- **Frontend** : HTML5, CSS3 (Design moderne/premium) et JavaScript Vanilla (Performance maximale).
- **Backend** : Node.js avec le framework Express.
- **Base de Données** : 
  - **SQLite (Local)** : Pour une utilisation autonome sur un seul PC.
  - **PostgreSQL (Cloud)** : Compatible avec Supabase/Render pour une gestion multi-sites.

---

## 📦 Installation & Déploiement

### Prérequis
- [Node.js](https://nodejs.org/) (Version 14+ recommandée).
- [Git](https://git-scm.com/) (Optionnel).

### Installation Locale
1. Clonez ou téléchargez le projet.
2. Ouvrez un terminal dans le dossier et lancez :
   ```bash
   npm install
   ```

### Lancement
- **Version Web** : Double-cliquez sur `StationZIZ_Web.bat` ou lancez `npm run web`.

---

## 📝 Conclusion
**Station ZIZ** n'est pas seulement un outil de calcul, c'est un assistant complet qui réduit les erreurs humaines, sécurise les données financières et modernise l'image de la station auprès des clients.

---
*Développé pour l'excellence opérationnelle.* ⛽✨
