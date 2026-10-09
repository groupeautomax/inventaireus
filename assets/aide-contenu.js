/* Aide ScanAutomax — le contenu (8 oct. 2026).
   C'est la référence de toutes les fonctions du site et de l'app, lue par assets/aide.js
   (onglet « Aide » du site, menu du compte « Guide et aide », Réglages de l'app).

   Structure : AMX.AIDE_CONTENU = { version, sections: [...], nouveautes: [...], frequentes: [...] }
   - section  : { id, titre, intro, roles?, articles: [...] }
   - article  : { id, q (la question), mots (synonymes pour la recherche), r (réponse en HTML :
                  <p>, <ol>, <ul>, <b>), roles?, liens?: [{ t, s (section du site), o (onglet), p (params) }] }
   - roles    : absent = tout le monde ; 'directeur' = gestionnaire, admin, propriétaire ou droit
                « Modifier les coûts » ; 'admin' = administrateur ou propriétaire ; 'proprietaire'.
   - nouveautes : [{ date, titre, texte, liens? }] — une entrée par semaine, la plus récente en premier.
   - frequentes : ids d'articles proposés quand la recherche est vide.

   Mise à jour hebdomadaire (tâche planifiée du lundi) : ajouter / corriger les articles touchés par
   les changements de la semaine (CLAUDE.md du projet), ajouter une entrée dans `nouveautes`,
   changer `version`, puis téléverser ce fichier et index.html (nouveau ?v=). Ne jamais écrire ici
   un jeton, une clé ou un numéro de téléphone. */
(function () {
  'use strict';
  window.AMX = window.AMX || {};

  AMX.AIDE_CONTENU = {
    version: '9 octobre 2026',

    frequentes: ['inv-statut', 'inv-stock-km', 'achat-quand', 'svc-autoriser', 'eval-lancer', 'dem-connexion', 'app-installer', 'inv-recherche', 'svc-refus', 'offre-publier', 'offre-signer', 'dep-deconnecte', 'dep-lent'],

    sections: [

      /* ------------------------------------------------------------------ */
      { id: 'demarrer', titre: 'Démarrer', intro: 'Se connecter, comprendre ce qu\'on voit, régler son compte.',
        articles: [
          { id: 'dem-connexion', q: 'Comment me connecter au site ?', mots: 'connexion login courriel code mot de passe entrer accès ouvrir',
            r: '<p>Ouvrez <b>groupeautomax.github.io/inventaireus</b>, entrez votre courriel, puis le code à six chiffres reçu par courriel. Il n\'y a pas de mot de passe. Votre compte doit d\'abord avoir été créé par l\'administrateur de votre concession (Admin › Comptes).</p><p>Une fois connecté, l\'appareil reste connecté <b>30 jours</b> ; le menu du compte (en haut à droite) affiche « Connecté jusqu\'au … ».</p>',
            liens: [{ t: 'Ouvrir l\'inventaire', s: 'inventaire', o: 'us' }] },
          { id: 'dem-accueil', q: 'Sur quelle page le site s\'ouvre-t-il ? Puis-je choisir ?', mots: 'accueil page de départ démarrer ouvrir commencer première page étoile tuiles',
            r: '<p>Le site s\'ouvre sur l\'<b>Accueil</b> : une recherche de véhicule, une tuile par section avec ses onglets et leurs compteurs, la dernière nouveauté. Pour commencer ailleurs (par exemple Inventaire › Detail ou Suivi service), choisissez la <b>Page de départ</b> au bas de l\'Accueil, ou cliquez l\'étoile d\'une tuile. Le choix est gardé sur votre appareil ; le logo Groupe Automax ramène toujours à l\'Accueil.</p>',
            liens: [{ t: 'Accueil', s: 'accueil', o: '' }] },
          { id: 'dem-app-site', q: 'Site ou app : lequel utiliser ?', mots: 'différence iphone bureau terrain cour quand',
            r: '<p>Les deux lisent et écrivent le même registre, avec le même compte et les mêmes droits.</p><ul><li><b>Le site</b> (ordinateur, tablette, téléphone) : inventaire complet, fiche d\'achat, suivi service, évaluations, offres, résultats, administration, et cette aide.</li><li><b>L\'app iPhone</b> : la cour — scanner un NIV, changer un statut, photos, audit, fiche d\'achat au scan, suivi service et évaluation en déplacement, hors réseau.</li></ul><p>Un changement fait d\'un côté est visible de l\'autre quelques secondes plus tard.</p>' },
          { id: 'dem-session', q: 'Combien de temps ma session dure-t-elle ?', mots: 'session expire 30 jours durée déconnexion automatique',
            r: '<p>30 jours par appareil, sur le site comme dans l\'app. Ensuite, un nouveau code par courriel. Un rôle changé par l\'administrateur se voit au prochain lancement (au plus 10 minutes après).</p>' },
          { id: 'dem-iphone-site', q: 'Sur mon iPhone, le site me redemande un code chaque semaine', mots: 'safari écran accueil iphone session effacée 7 jours',
            r: '<p>Safari efface les données d\'un site qu\'on n\'a pas visité depuis 7 jours. Ajoutez le site à l\'écran d\'accueil : bouton Partager → <b>Sur l\'écran d\'accueil</b>. Ouvert depuis cette icône, le site garde sa session 30 jours. Mieux encore pour la cour : l\'app ScanAutomax.</p>' },
          { id: 'dem-concession', q: 'Pourquoi je ne vois que ma concession ?', mots: 'portée visible groupe toutes concessions autre concession filtrer',
            r: '<p>Chaque compte est rattaché à une concession et ne voit que ses véhicules, ses évaluations, son service et ses résultats. Le bandeau <b>« Recherche dans : … »</b> en haut du rail dit toujours ce que vous voyez. Les comptes « Tout le groupe » voient tout.</p><p>Un administrateur peut vous donner d\'autres concessions (en entier ou par domaine, par exemple toutes les évaluations du groupe) : demandez-le à votre administrateur ou à Maxime.</p>' },
          { id: 'dem-choix-concession', q: 'Comment changer la concession affichée ?', mots: 'choisir concession rail liste toutes réinitialiser',
            r: '<p>Dans le rail de gauche, groupe <b>Concession</b> : cliquez le nom voulu (ou « Toutes »). Ce choix tient pour tout le site — inventaire, service, évaluations, résultats — jusqu\'à ce que vous le changiez. La puce « × Concession » au-dessus de la liste le remet à « Toutes ».</p>' },
          { id: 'dem-menu-compte', q: 'À quoi sert le menu de mon compte ?', mots: 'profil compte menu nom rôle cellulaire textos déconnexion guide',
            r: '<p>Cliquez votre nom en haut à droite : votre rôle, votre concession, la date de fin de session, votre <b>cellulaire pour les textos</b> (Ajouter / Modifier), le lien <b>Guide et aide</b>, et Déconnexion.</p>' },
          { id: 'dem-cellulaire', q: 'Comment inscrire mon cellulaire pour les textos ?', mots: 'téléphone texto sms numéro alerte cellulaire',
            r: '<p>Menu du compte → <b>Mon cellulaire (textos)</b> → Ajouter → 10 chiffres → Enregistrer. Dans l\'app : Réglages → carte du compte → même ligne.</p><p>Les textos automatiques ne partent que pour une chose : l\'alerte aux directeurs quand un même véhicule est évalué dans deux concessions du groupe à moins de 30 jours. Les directeurs (administrateurs) reçoivent cette alerte par courriel de toute façon ; le texto s\'ajoute si le numéro est inscrit.</p>' },
          { id: 'dem-roles', q: 'Qu\'est-ce que mon rôle me permet de faire ?', mots: 'droits rôle utilisateur gestionnaire administrateur propriétaire permissions',
            r: '<ul><li><b>Utilisateur</b> : consulter, scanner, audit, changer un statut, ajouter un véhicule, fiche d\'achat, photos.</li><li><b>Gestionnaire</b> : en plus, modifier les montants (coûts) et voir les résultats. C\'est le rôle du directeur au service.</li><li><b>Administrateur</b> : en plus, supprimer un véhicule et gérer les comptes de sa concession.</li><li><b>Propriétaire</b> : nomme les administrateurs, voit tout, voit les dossiers sans concession.</li></ul><p>Un administrateur peut aussi accorder ou retirer un droit précis à une personne (droits personnalisés). Les sections que votre rôle ne permet pas n\'apparaissent pas dans la barre.</p>' },
          { id: 'dem-deconnexion', q: 'Comment me déconnecter ?', mots: 'quitter fermer session sortir',
            r: '<p>Menu du compte → <b>Déconnexion</b>. Les listes gardées sur cet appareil (inventaire, service) sont effacées à la déconnexion : personne d\'autre ne les verra sur ce navigateur.</p>' }
        ] },

      /* ------------------------------------------------------------------ */
      { id: 'inventaire', titre: 'Inventaire', intro: 'Les trois registres d\'usagés, les statuts, le panneau d\'un véhicule.',
        articles: [
          { id: 'inv-registres', q: 'Quelle est la différence entre É.-U., Canada et Detail ?', mots: 'registres onglets wholesale détail usagés us can detail destination',
            r: '<p>Trois registres selon la destination d\'un usagé :</p><ul><li><b>É.-U.</b> : véhicules destinés à l\'exportation (vente en gros aux États-Unis, importateur, Manheim PA).</li><li><b>Canada</b> : vente en gros au Canada.</li><li><b>Detail</b> : l\'inventaire de détail de la concession ; c\'est lui que suit le <b>Suivi service</b>.</li></ul><p>L\'onglet <b>Neufs</b> est à part : il vient du DMS (voir la section Neufs).</p>',
            liens: [{ t: 'É.-U.', s: 'inventaire', o: 'us' }, { t: 'Canada', s: 'inventaire', o: 'can' }, { t: 'Detail', s: 'inventaire', o: 'detail' }] },
          { id: 'inv-statuts', q: 'Que veulent dire les statuts ?', mots: 'acheté transit qc en stock expédié vendu comptabilisé manheim statut couleur bleu',
            r: '<p>Un véhicule avance dans cet ordre : <b>Acheté</b> → <b>Transit QC</b> (en route vers nous) → <b>En stock</b> (bleu : dans la cour) → <b>Expédié</b> → <b>Vendu É.-U.</b> (ou Vendu) → <b>Comptabilisé</b>. Le registre É.-U. a en plus <b>Manheim PA</b>. Au registre Detail il n\'y a pas de Transit QC.</p><p>Le rouge n\'est jamais un statut : il signale un retard (registre non reçu, véhicule qui traîne, étape de service en retard).</p>' },
          { id: 'inv-statut', q: 'Comment changer le statut d\'un véhicule ?', mots: 'changer statut marquer en stock expédié vendu suivant bouton avancer',
            r: '<ol><li>Ouvrez le véhicule (clic sur sa ligne) : le panneau s\'ouvre à droite.</li><li>Dans le bloc <b>Statut</b>, cliquez le bouton vert « Marquer … » (le statut suivant), ou choisissez un autre statut dans la liste.</li><li>La ligne change tout de suite ; « Enregistrement… » puis « synchronisé » en bas de la liste confirment l\'écriture au serveur.</li></ol><p>Si le serveur refuse (droit manquant, registre verrouillé), l\'ancien statut revient et le message s\'affiche. Au registre É.-U., le passage à « Expédié » demande l\'importateur.</p>',
            liens: [{ t: 'Ouvrir l\'inventaire', s: 'inventaire', o: 'us' }] },
          { id: 'inv-stock-km', q: 'Pourquoi je ne peux pas enregistrer un # stock sans km ?', mots: 'stock numéro km kilométrage obligatoire refusé rouge',
            r: '<p>Le kilométrage est obligatoire pour poser un <b># stock</b> : la vitrine acheteurs, le contrat et le suivi service lisent ce km. Dans le panneau du véhicule, bloc <b>Informations</b> :</p><ol><li>Tapez le <b>Km</b> (le champ est rouge tant qu\'il manque).</li><li>Tapez le <b># Stock</b> et appuyez sur Entrée : les deux partent ensemble.</li></ol><p>Le km est gardé dans la fiche d\'achat du véhicule (champ KM). Un km seul peut aussi être enregistré sans # stock.</p>' },
          { id: 'inv-cout', q: 'Comment modifier le coût d\'un véhicule ?', mots: 'coût prix achat montant modifier gestionnaire',
            r: '<p>Panneau du véhicule → bloc Informations → champ <b>Coût</b> → Entrée. Il faut le droit « Modifier les coûts » (gestionnaire, administrateur, ou droit accordé). Le coût d\'achat sert au total en $ des registres et aux résultats.</p>', roles: 'directeur' },
          { id: 'inv-registre-immat', q: 'Qu\'est-ce que « Registre » (Non reçu / Reçu · bon nom / Mauvais nom) ?', mots: 'registre immatriculation reçu bon nom mauvais nom enregistrement papiers titre',
            r: '<p>C\'est le registre d\'immatriculation (les papiers du véhicule). Dans le bloc Statut, ligne <b>REGISTRE</b> : cliquez Non reçu, Reçu · bon nom ou Reçu · mauvais nom. La puce « n j sans registre » compte les jours depuis l\'achat tant qu\'il n\'est pas reçu ; elle passe en rouge quand ça traîne.</p>' },
          { id: 'inv-recherche', q: 'Comment trouver un véhicule rapidement ?', mots: 'chercher recherche niv vin stock modèle partout tous registres statuts',
            r: '<p>Deux recherches :</p><ul><li>La <b>recherche globale</b> dans la barre du haut (touche <b>/</b>) : NIV, # stock ou modèle, dans tous les registres ; un NIV hors inventaire avec rapport CARFAX ouvre le rapport.</li><li>Dans l\'inventaire, la case <b>Recherche</b> du rail : dès qu\'elle contient du texte, elle cherche <b>partout</b> — tous les statuts, les trois registres — en gardant la concession choisie. Une ligne d\'un autre registre porte une puce ambre « Registre Canada » ; un clic l\'ouvre là-bas.</li></ul>' },
          { id: 'inv-filtres', q: 'À quoi servent les filtres du rail ?', mots: 'filtrer statut alertes origine rappel importateur tri colonnes réinitialiser',
            r: '<p>Le rail de gauche filtre la liste : concession, statuts (cases), alertes (registre non reçu, véhicules anciens), origine (échange, encan…), rappel du fabricant, importateur (É.-U.). <b>Réinitialiser</b> remet tout sauf la concession choisie. Les chiffres clés en haut (Total, par statut) sont aussi des filtres : un clic sur « En stock » ne montre que ceux-là.</p>' },
          { id: 'inv-valeur', q: 'Où voir la valeur en $ des inventaires ?', mots: 'total dollars valeur registre montant somme coût chiffres clés bande',
            r: '<p>Sous les chiffres clés, la bande <b>Valeur des inventaires</b> donne, pour la concession choisie, le coût d\'achat total des véhicules actifs (ni vendus ni comptabilisés) de chaque registre et le total des trois. Chaque pilule est cliquable (va au registre). Le chiffre clé « Total » et chaque statut affichent aussi leur montant en sous-titre ; le survol dit combien de véhicules n\'ont pas de coût.</p>' },
          { id: 'inv-panneau', q: 'Que contient le panneau d\'un véhicule ?', mots: 'panneau fiche détail blocs ouvrir véhicule droite',
            r: '<p>Dans l\'ordre : <b>Statut</b> (avec le registre d\'immatriculation) · <b>Service</b> (au Detail : l\'état du reconditionnement) · <b>Informations</b> (# stock, km, coût, compagnie, importateur) · <b>Évaluation</b> (résumé de l\'évaluation marché, ou « Évaluer ce véhicule ») · <b>Fiche eBlock</b> (rapport d\'état de l\'encan) · <b>Dommages (fiche d\'achat)</b> · <b>Rappels NHTSA</b> · <b>Photos</b> · <b>Rapports et liens</b> (CARFAX, fiche d\'achat, window sticker, Mettre en vente) · <b>Gestion</b> (transfert, suppression) · le journal des modifications.</p>' },
          { id: 'inv-transfert', q: 'Comment transférer un véhicule vers un autre registre ?', mots: 'transfert déplacer registre detail canada us wholesale changer de registre',
            r: '<p>Panneau du véhicule → bloc <b>Gestion</b> → « Transférer vers É.-U. / Canada / Detail ». Le véhicule change de registre au statut « Acheté » et le journal le note. Au suivi service, un <b>refus au détail</b> fait la même chose en un geste (voir Suivi service).</p>' },
          { id: 'inv-ajouter', q: 'Comment ajouter un véhicule au registre ?', mots: 'ajouter nouveau véhicule niv créer inscrire',
            r: '<p>La bonne porte d\'entrée est la <b>fiche d\'achat</b> (section Fiche d\'achat) : elle crée le véhicule dans le registre choisi avec son prix, son km et ses liens. En dépannage, le bouton « Ajouter » du registre crée une ligne avec le NIV, le modèle et la compagnie seulement.</p>',
            liens: [{ t: 'Fiche d\'achat', s: 'achat' }] },
          { id: 'inv-supprimer', q: 'Comment supprimer un véhicule ?', mots: 'supprimer effacer retirer erreur doublon',
            r: '<p>Panneau → bloc Gestion → <b>Supprimer</b> (administrateur seulement). La ligne disparaît du registre ; le journal garde la trace. Pour un véhicule vendu, préférez les statuts Vendu puis Comptabilisé : il reste dans les résultats.</p>', roles: 'admin' },
          { id: 'inv-carfax', q: 'Où est le rapport CARFAX d\'un véhicule ?', mots: 'carfax rapport historique lien puce commander',
            r: '<p>Sur la ligne, la puce <b>CARFAX</b> ouvre le rapport (lien public du compte concessionnaire). Dans le panneau, bloc <b>Rapports et liens</b> : « Rapport CARFAX », ou « Commander un CARFAX » qui copie le NIV et ouvre le compte dealer.carfax.ca. Les liens arrivent par l\'import CARFAX (Outils) et par les fiches eBlock ; on peut aussi coller un lien (« lien CARFAX… » dans le titre du bloc).</p>' },
          { id: 'inv-openlane', q: 'Que montre le bloc « Valeurs OpenLane » et la puce « OpenLane 23 055 $ » ?', mots: 'openlane valeur gros prévision ventes comparables ajusté km puce',
            r: '<p>Ce que le véhicule vaut à l\'encan OpenLane : la moyenne (et min / max) des ventes comparables des 90 derniers jours, la même moyenne <b>ajustée au km</b> du véhicule (0,10 $ / km), et la <b>prévision OpenLane</b> au km connu, aujourd\'hui et dans 90 jours. Sur la ligne, la puce « OpenLane 23 055 $ » reprend la prévision (ou la moyenne des ventes) ; un clic ouvre le détail avec la liste des ventes. Sans km (fiche d\'achat), il n\'y a pas de prévision. Les valeurs sont lues par le favori OpenLane (Outils › Valeurs OpenLane).</p>',
            liens: [{ t: 'Valeurs OpenLane', s: 'outils', o: 'openlane' }] },
          { id: 'inv-eblock', q: 'Que montre le bloc « Fiche eBlock » ?', mots: 'eblock dommages rapport état encan pièces photos pneus peinture',
            r: '<p>Pour un véhicule acheté sur eBlock dont la fiche a été importée (Outils › Fiches eBlock) : la cote, les pièces endommagées en français, les photos de dommages, les pneus et l\'épaisseur de peinture. Sur la ligne, la puce « eBlock · 3 dommages » (rouge), « sans dommage » (vert) ou « fiche à lire ». Le bloc <b>Dommages (fiche d\'achat)</b> reprend ce que l\'acheteur a noté dans la fiche d\'achat.</p>' },
          { id: 'inv-photos', q: 'Comment ajouter des photos ?', mots: 'photos prendre téléverser angle vitrine galerie',
            r: '<p>Depuis l\'app (tuile ou fiche du véhicule → Photos guidées : un angle à la fois, fond studio automatique si activé dans les réglages). Sur le site, bloc <b>Photos</b> du panneau : glisser des fichiers. Les photos sont privées tant que le véhicule n\'est pas mis en vente ; la mise en vente les rend visibles pour ce véhicule seulement.</p>' },
          { id: 'inv-rappels', q: 'Un véhicule a une puce « Rappel » : que faire ?', mots: 'rappel fabricant campagne nhtsa transport canada',
            r: '<p>Le registre connaît les rappels par modèle. La puce rouge sur la ligne et le bloc <b>Rappels NHTSA</b> du panneau donnent la campagne, le composant et le correctif, avec un lien vers la page du fabricant et Transport Canada. À vérifier par le NIV chez le constructeur avant la vente.</p>' },
          { id: 'inv-journal', q: 'Qui a changé quoi sur un véhicule ?', mots: 'journal historique modifications qui quand trace',
            r: '<p>Au bas du panneau, le <b>journal</b> liste chaque modification (statut, coût, # stock, km, registre, transfert) avec la date et la personne. Les résultats et le temps par étape se calculent à partir de ces dates.</p>' },
          { id: 'inv-excel', q: 'Comment exporter une liste en Excel ?', mots: 'excel export xlsx télécharger liste',
            r: '<p>Bouton <b>Excel</b> dans la sous-barre de la section (inventaire, service, neufs, archive Torque, fiches eBlock). Le fichier contient la liste telle que filtrée à l\'écran.</p>' }
        ] },

      /* ------------------------------------------------------------------ */
      { id: 'neufs', titre: 'Véhicules neufs', intro: 'Le suivi des neufs alimenté par le DMS de chaque concession.',
        articles: [
          { id: 'neufs-quoi', q: 'D\'où viennent les véhicules neufs ?', mots: 'dms feed import automatique quotidien export fichier',
            r: '<p>Du <b>DMS</b> de la concession : un export quotidien (fichier texte ou csv de l\'inventaire) est envoyé par courriel à l\'adresse de réception du système, lu chaque heure, et les neufs (N) comme les usagés (U) sont mis à jour. VW Brossard est branché ; pour les autres concessions, il faut programmer le même envoi dans le DMS — Maxime donne l\'adresse.</p><p>Rien n\'est jamais supprimé : un véhicule absent du feed est marqué <b>sorti</b> (vendu), et il revient comme « retour » s\'il réapparaît.</p>',
            liens: [{ t: 'Ouvrir les neufs', s: 'inventaire', o: 'neufs' }] },
          { id: 'neufs-lire', q: 'Comment lire la page des neufs ?', mots: 'vieillissement jauge jours stock âge moyen 60 jours approvisionnement mix',
            r: '<ul><li><b>Cartes</b> : en stock, âge moyen, part au-delà de 60 jours (cible : moins de 10 %), jours d\'approvisionnement.</li><li><b>Jauge de vieillissement</b> : 0-30 / 31-60 / 61-90 / 91-180 / 180 + jours — un clic filtre le tableau.</li><li><b>Groupes</b> par modèle › version : en stock, sorties des 90 derniers jours, jours d\'approvisionnement (stock ÷ sorties par jour), mix par année-modèle.</li><li><b>Revue de la semaine</b> : arrivées, sorties, véhicules qui ont franchi 60 / 90 / 180 jours, démos à surveiller, « fantômes » (plus de deux ans).</li><li><b>Tableau</b> : un clic ouvre la fiche (coût facture, coût de détention à 5 %/an, options, mouvements).</li></ul><p>Les échanges concessionnaires et les fantômes sont exclus de l\'âge moyen.</p>' },
          { id: 'neufs-couts', q: 'Pourquoi je ne vois pas les coûts des neufs ?', mots: 'coût facture détention caché montants droit',
            r: '<p>Les montants (coût facture, coût de détention) ne sont montrés qu\'avec le droit « Modifier les coûts » (gestionnaire, administrateur, propriétaire).</p>' },
          { id: 'neufs-exclure', q: 'Comment retirer définitivement un neuf du suivi ?', mots: 'retirer exclure supprimer réinclure vieille unité ne plus suivre',
            r: '<p>Administrateur : ouvrez la fiche du véhicule → <b>Retirer du suivi</b> → raison → confirmer. Le NIV est ignoré de tous les feeds suivants (ni arrivée, ni sortie). La liste repliée « n véhicule(s) retiré(s) du suivi » sous le tableau permet de <b>Réinclure</b> : le véhicule reviendra au prochain feed comme une arrivée.</p>', roles: 'admin' }
        ] },

      /* ------------------------------------------------------------------ */
      { id: 'achat', titre: 'Fiche d\'achat', intro: 'La porte d\'entrée de tout véhicule acheté.',
        articles: [
          { id: 'achat-quand', q: 'Quand dois-je remplir une fiche d\'achat ?', mots: 'quand obligatoire achat encan échange particulier entrée stockage débuter',
            r: '<p><b>À chaque achat</b> — encan, échange, particulier, autre concession. Règle du groupe : « quand j\'achète un véhicule, je remplis une fiche d\'achat et je retrouve mon unité partout, même dans Service ». La fiche crée le véhicule dans le registre choisi (statut Acheté) ; au registre Detail, le suivi service démarre tout seul.</p><p>Dans l\'app : tuile <b>Fiche d\'achat — Débuter le stockage</b>, le NIV scanné ouvre la fiche préremplie.</p>',
            liens: [{ t: 'Nouvelle fiche d\'achat', s: 'achat' }] },
          { id: 'achat-champs', q: 'Que mettre dans la fiche d\'achat ?', mots: 'champs niv stock km prix achat frais couleur destination compagnie concession',
            r: '<ol><li><b>NIV</b> (17 caractères) : année, marque et modèle se décodent.</li><li><b>Compagnie</b> et <b>destination</b> (É.-U., Canada, Detail) : obligatoires pour créer le véhicule au registre.</li><li><b>Stock #</b> et <b>KM</b> (le km est obligatoire avec un stock #), couleur.</li><li>Prix d\'achat, frais (transport, encan…), reconditionnement prévu, prix de détail visé : la fiche calcule le coût total.</li><li><b>Dommages</b> (un par ligne), lien du <b>rapport d\'état eBlock</b>, rapport <b>CARFAX</b>.</li></ol><p>Enregistrer. Un véhicule déjà au registre garde son statut ; la fiche s\'ajoute.</p>' },
          { id: 'achat-evaluation', q: 'La fiche dit « Une évaluation existe pour ce NIV » : quoi faire ?', mots: 'évaluation existe importer bannière reprendre chiffres',
            r: '<p>Le véhicule a été évalué (Outils › Évaluation). Cliquez <b>Importer</b> : les cases vides de la fiche reçoivent les chiffres de l\'évaluation (frais, reconditionnement, prix de détail, concession, destination Detail). « Voir » ouvre l\'évaluation. Depuis une évaluation, le bouton « Créer la fiche d\'achat » fait la même chose d\'avance.</p>' },
          { id: 'achat-eblock', q: 'Comment lier le rapport d\'état eBlock à la fiche ?', mots: 'eblock rapport état lien dommages partager signet',
            r: '<p>Deux façons :</p><ul><li>Après l\'import des fiches eBlock (Outils), la fiche d\'achat du véhicule est complétée automatiquement : dommages en français, lien du rapport, km, couleur — seulement les cases vides.</li><li>À la main : carte <b>Rapport d\'état eBlock</b> de la fiche → coller le lien « Partager » d\'eBlock et les dommages (un par ligne).</li></ul>' },
          { id: 'achat-imprimer', q: 'Comment imprimer la fiche d\'achat ?', mots: 'imprimer pdf papier dossier',
            r: '<p>Bouton <b>Imprimer</b> en haut de la fiche : la page s\'imprime proprement (coûts, dommages, liens). Dans l\'app, la fiche se partage en PDF.</p>' },
          { id: 'achat-retrouver', q: 'Où retrouver une fiche d\'achat ?', mots: 'retrouver ouvrir ancienne fiche modifier',
            r: '<p>Panneau du véhicule → Rapports et liens → <b>Fiche d\'achat</b>. Ou Fiche d\'achat avec le NIV : la fiche existante se charge. Les modifications sont immédiates et journalisées.</p>' }
        ] },

      /* ------------------------------------------------------------------ */
      { id: 'service', titre: 'Suivi service', intro: 'Le reconditionnement des véhicules de détail, de l\'arrivée à la ligne de vente.',
        articles: [
          { id: 'svc-quoi', q: 'Quels véhicules sont au Suivi service ?', mots: 'quels véhicules detail acheté en stock implicite liste',
            r: '<p>Tous les véhicules du registre <b>Detail</b> aux statuts Acheté, Transit QC et En stock. Un véhicule qui arrive au Detail (par la fiche d\'achat, un transfert ou le DMS) a un suivi d\'office, créé à la première action. Le chiffre clé « Au détail » doit donc correspondre à l\'inventaire Detail de la concession.</p>',
            liens: [{ t: 'En cours', s: 'service', o: 'encours' }, { t: 'Direction', s: 'service', o: 'autoriser' }, { t: 'Terminés', s: 'service', o: 'termines' }] },
          { id: 'svc-etapes', q: 'Quelles sont les neuf étapes ?', mots: 'étapes parcours arrivée vérification autorisation bt mécanique carrosserie esthétique photos prêt',
            r: '<ol><li><b>Arrivée</b></li><li><b>Vérification à la livraison</b> (directeur) : conforme ou écarts + note.</li><li><b>Autorisation détail</b> (directeur) : accepte ou refuse.</li><li><b>BT ouvert</b> : numéro de bon de travail.</li><li><b>Mécanique</b> (sautable)</li><li><b>Carrosserie</b> (sautable)</li><li><b>Esthétique</b></li><li><b>Photos</b></li><li><b>Prêt à vendre</b> : passe le véhicule « En stock ».</li></ol><p>Chaque étape a une cible en jours (5 jours au total par défaut) ; un dépassement passe en rouge. Sur chaque ligne, le parcours à neuf pas montre où en est le véhicule.</p>' },
          { id: 'svc-onglets', q: 'À quoi servent les onglets En cours / Direction / Terminés ?', mots: 'onglets direction attend directeur terminés en cours',
            r: '<ul><li><b>En cours</b> : tout ce qui est en reconditionnement.</li><li><b>Direction</b> : ce qui attend un geste de directeur (vérification à la livraison, autorisation). C\'est la liste de travail du directeur.</li><li><b>Terminés</b> : prêts à vendre et refusés.</li></ul><p>La recherche du rail fouille tous les onglets : une puce indique dans quel onglet se trouve le véhicule.</p>' },
          { id: 'svc-verifier', q: 'Comment faire la vérification à la livraison ?', mots: 'vérification livraison conforme écarts dommages corroborer photos',
            r: '<p>Directeur. Ouvrez le véhicule → bloc <b>Évaluation, photos et dommages</b> : évaluation, dommages notés dans la fiche d\'achat, fiche eBlock, photos, historique Torque. Comparez avec le véhicule reçu, puis dans l\'étape Vérification : <b>Conforme</b> ou <b>Écarts</b> (+ note). C\'est le pont entre l\'évaluation et le service.</p>', roles: 'directeur' },
          { id: 'svc-autoriser', q: 'Comment autoriser (ou refuser) un véhicule au détail ?', mots: 'autorisation détail accepter refuser directeur porte bt',
            r: '<p>Directeur. Dans le panneau, bloc <b>Autorisation</b> : <b>Accepter</b> (le BT peut s\'ouvrir) ou <b>Refuser</b>. Sans autorisation, pas de BT : ni inspection, ni lavage, ni photo. Le motif du refus est demandé.</p>', roles: 'directeur' },
          { id: 'svc-refus', q: 'Que se passe-t-il quand je refuse un véhicule au détail ?', mots: 'refus transfert us canada wholesale immédiat',
            r: '<p>La fenêtre de refus demande la destination : <b>É.-U.</b> ou <b>Canada</b>. En confirmant, le véhicule quitte le registre Detail pour ce registre, au statut Acheté, et le suivi se ferme (onglet Terminés, « Refusé au détail et transféré »). Dans l\'app, les deux boutons « Refuser → É.-U. / Canada » font pareil.</p>', roles: 'directeur' },
          { id: 'svc-cocher', q: 'Comment cocher une étape ?', mots: 'terminer étape commencer sauter fait cocher bt numéro',
            r: '<p>Ouvrez le véhicule → la liste des étapes : <b>Commencer</b>, <b>Terminer</b>, <b>Sauter</b> (mécanique, carrosserie). Pour BT ouvert, entrez le numéro. L\'étape passe « fait » tout de suite ; le serveur confirme ensuite. Depuis l\'app : tuile Suivi service → véhicule → mêmes boutons.</p>' },
          { id: 'svc-deja-pret', q: 'Un véhicule est déjà sur la ligne de vente : comment le sortir du suivi ?', mots: 'déjà prêt vendre ancien véhicule sauter tout stock',
            r: '<p>Directeur. Panneau → <b>Déjà prêt à vendre</b> : les étapes restantes sont marquées sautées avec une note, l\'autorisation acceptée, « Prêt » fait, et le véhicule passe « En stock » s\'il était « Acheté ». Un clic, pensé pour les véhicules qui étaient déjà prêts quand le suivi a démarré.</p>', roles: 'directeur' },
          { id: 'svc-notes', q: 'Comment laisser une note sur un véhicule au service ?', mots: 'note commentaire message atelier',
            r: '<p>Panneau → bloc <b>Notes</b> → écrire → Ajouter. Les notes sont datées et signées ; elles suivent le véhicule.</p>' },
          { id: 'svc-retard', q: 'Pourquoi un véhicule est en rouge au service ?', mots: 'retard rouge cible jours dépassé',
            r: '<p>Une étape a dépassé sa cible en jours, ou le total dépasse la cible globale. Le chiffre clé « En retard » les compte ; un clic les filtre. Les cibles se règlent dans la fenêtre <b>Cibles</b> (administrateur).</p>' },
          { id: 'svc-cibles', q: 'Comment changer les cibles en jours ?', mots: 'cibles jours réglage étape total admin',
            r: '<p>Administrateur : sous-barre du service → <b>Cibles</b> → jours par étape et total → Enregistrer. Appliqué à toutes les concessions.</p>', roles: 'admin' },
          { id: 'svc-feuille', q: 'Le suivi peut-il se recopier dans la feuille Google de ma concession ?', mots: 'feuille google miroir onglet suivi service classeur',
            r: '<p>Oui : un miroir recopie les suivis d\'une concession dans l\'onglet « Suivi service » de son classeur toutes les 15 minutes (fait pour BMW Sherbrooke). Le bouton <b>Feuilles</b> (administrateur) lance la copie à la main. Pour une autre concession, Maxime branche le classeur.</p>', roles: 'admin' },
          { id: 'svc-inventaire', q: 'Où voir l\'état du service depuis l\'inventaire ?', mots: 'bloc service panneau detail inventaire état',
            r: '<p>Au registre Detail, le panneau d\'un véhicule a un bloc <b>Service</b> : étape courante, retard, lien « Ouvrir au service ».</p>' }
        ] },

      /* ------------------------------------------------------------------ */
      { id: 'evaluation', titre: 'Évaluation', intro: 'L\'analyse de marché, les cibles de prix, le registre des évaluations.',
        articles: [
          { id: 'eval-lancer', q: 'Comment évaluer un véhicule ?', mots: 'évaluer analyse marché lancer niv décodage prix',
            r: '<ol><li>Outils › <b>Évaluation</b> : tapez ou collez le NIV (ou scannez-le dans l\'app).</li><li>Année, marque, modèle, version se décodent (NHTSA) ; le km, le prix d\'achat et les frais viennent de la fiche d\'achat s\'il y en a une.</li><li>L\'analyse de marché part d\'elle-même : annonces comparables, prix ajustés au km, cibles.</li><li>Entrez votre km, le prix payé ou visé : les cibles et l\'« Achat max. » se recalculent.</li></ol><p>Tout est conservé automatiquement dès que le NIV est complet.</p>',
            liens: [{ t: 'Ouvrir l\'évaluation', s: 'outils', o: 'evaluation' }] },
          { id: 'eval-source', q: 'D\'où viennent les annonces comparables ?', mots: 'marketcheck annonces source canada états-unis rayon 100 milles concessionnaires',
            r: '<p>De <b>MarketCheck</b> : les annonces de concessionnaires du Canada et des États-Unis, dans un rayon de 100 milles autour de votre concession (portée locale), ou tout le pays, ou un État / une province précis. Les ventes des 90 derniers jours viennent de la même source. Le groupe dispose de 500 analyses par mois (jauge dans Admin) ; chaque recherche est gardée 6 h.</p>' },
          { id: 'eval-pays', q: 'Comment comparer au marché américain ?', mots: 'états-unis usa pays état pennsylvanie portée nationale bascule',
            r: '<p>Au-dessus des comparables : <b>Canada / États-Unis</b>, puis la portée : locale (100 milles), nationale, ou <b>un État</b> (PA par défaut) / une province. Une réponse est gardée par pays : on peut basculer sans relancer.</p>' },
          { id: 'eval-cibles', q: 'Que signifient agressif, standard, conservateur ?', mots: 'cibles prix agressif standard conservateur centile médiane marché % rang',
            r: '<p>Trois prix de détail calculés sur les prix ajustés des comparables : <b>agressif</b> = 25e centile (se vend vite), <b>standard</b> = médiane, <b>conservateur</b> = 75e centile. Le <b>prix visé</b> donne votre rang parmi les annonces et le « Marché % » (prix ÷ prix moyen actif). Les filtres « même version » et « ± 30 000 km » resserrent la liste ; « Voir » ouvre l\'annonce.</p>' },
          { id: 'eval-achat-max', q: 'Comment est calculé l\'« Achat max. » ?', mots: 'achat maximum formule marge frais reconditionnement payé détail',
            r: '<p>Payé = achat + frais ; Détail = payé + reconditionnement + marge. L\'« Achat max. » de chaque cible est le prix de détail de la cible moins le reconditionnement, la marge et les frais. Le calcul marche dans les deux sens : changer le prix de détail recalcule l\'achat, et inversement.</p>' },
          { id: 'eval-guide', q: 'À quoi sert le bouton « Valeurs de guide » ?', mots: 'valeurs guide vinaudit détail gros échange black book',
            r: '<p>Il demande les valeurs de guide (détail, gros, échange) pour ce véhicule et ce km. Chaque demande est facturée au groupe, d\'où le bouton explicite : à utiliser quand le marché comparable est mince.</p>' },
          { id: 'eval-rappels', q: 'Comment voir les rappels d\'un véhicule évalué ?', mots: 'rappels nhtsa campagne composant',
            r: '<p>Dans la rangée des liens de l\'évaluation, la puce « n rappels NHTSA » ouvre la liste (campagne, date, composant, correctif). Les rappels sont par année-marque-modèle, pas par NIV : à confirmer chez le constructeur.</p>' },
          { id: 'eval-sauvegarde', q: 'Dois-je enregistrer l\'évaluation ?', mots: 'enregistrer sauvegarde automatique conservée officielle statut',
            r: '<p>Non pour la garder : chaque analyse et chaque modification sont conservées automatiquement (puce grise « Analyse conservée automatiquement »). <b>Enregistrer</b> la marque comme évaluation officielle (puce verte « Enregistrée le … par … ») : c\'est celle-là qui déclenche l\'alerte de doublon et qui compte au registre comme « Enregistrée ».</p>' },
          { id: 'eval-registre', q: 'Où retrouver les évaluations passées ?', mots: 'registre évaluations liste concession période évaluateur',
            r: '<p>Outils › <b>Registre d\'évaluations</b> : une ligne par véhicule, cartes par concession, filtres période / évaluateur / Toutes · Enregistrées · Analyses auto, colonne Veille (dérive de prix des véhicules en stock). Un clic rouvre l\'évaluation.</p>',
            liens: [{ t: 'Registre d\'évaluations', s: 'outils', o: 'evaluations' }] },
          { id: 'eval-alerte', q: 'Qu\'est-ce que l\'alerte « ce véhicule a aussi été évalué chez … » ?', mots: 'alerte doublon deux concessions texto directeur même véhicule',
            r: '<p>Quand un véhicule est <b>enregistré</b> dans une concession alors qu\'une autre concession du groupe l\'a enregistré il y a moins de 30 jours, les directeurs des deux concessions reçoivent un courriel et un texto (si leur cellulaire est inscrit). L\'évaluateur voit le message à l\'écran. But : ne pas se faire concurrence sur le même client.</p>' },
          { id: 'eval-fiche', q: 'Comment passer de l\'évaluation à la fiche d\'achat ?', mots: 'créer fiche achat depuis évaluation transférer',
            r: '<p>Bouton <b>Créer la fiche d\'achat</b> (ou « Fiche d\'achat » si elle existe) dans la rangée des liens : la fiche s\'ouvre préremplie (marque, modèle, année, km, frais, reconditionnement, prix de détail, concession, destination Detail).</p>' },
          { id: 'eval-offre', q: 'Comment imprimer une feuille d\'offre pour le client ?', mots: 'feuille offre imprimer client pdf',
            r: '<p>Bouton <b>Feuille d\'offre</b> : page imprimable au nom de la concession avec le véhicule, le km et l\'offre. Dans l\'app, la feuille d\'offre se partage en PDF.</p>' },
          { id: 'eval-torque', q: 'Où voir l\'historique Torque d\'un véhicule ?', mots: 'torque historique ancienne évaluation',
            r: '<p>Sous le véhicule de l\'évaluation, la ligne <b>Historique Torque</b> montre les évaluations rapatriées de Torque pour ce NIV (Outils › Archive Torque pour la fiche complète).</p>' }
        ] },

      /* ------------------------------------------------------------------ */
      { id: 'outils', titre: 'Outils et archives', intro: 'Torque, eBlock, CARFAX, Vérification Excel — et les favoris qui les relient au site.',
        articles: [
          { id: 'out-signets', q: 'Comment fonctionnent les favoris « Automax ← … » ?', mots: 'signet favori bookmark barre glisser torque eblock carfax pont fenêtre',
            r: '<p>Chaque carte d\'import (Outils) propose un favori à <b>glisser une fois</b> dans la barre de favoris du navigateur. Ensuite, connecté sur Torque, eBlock ou CARFAX, un clic sur le favori lit les données de la page et les envoie au site par une petite fenêtre (<b>pont</b>) — il faut autoriser les fenêtres contextuelles pour le site. Une bande verte montre la progression ; « Fermer » arrête. Rejouer le favori met à jour sans doublon.</p>' },
          { id: 'out-torque', q: 'Comment rapatrier l\'archive Torque de ma concession ?', mots: 'torque archive importer évaluations photos abonnement',
            r: '<ol><li>Outils › <b>Archive Torque</b> : glissez le favori « Automax ← Torque ».</li><li>Dans Torque, affichez votre concession, cliquez le favori : toutes les évaluations (actives et archivées), notes, options et analyses sont lues, 50 par page.</li><li>Les photos sont rapatriées ensuite dans Drive, automatiquement.</li></ol><p>Reclic = <b>mise à jour</b> depuis la dernière fois (nouvelles et modifiées seulement). L\'archive est filtrable par statut, période, client, conseiller, NIV ; chaque fiche a sa galerie ; export Excel.</p>',
            liens: [{ t: 'Archive Torque', s: 'outils', o: 'torque' }] },
          { id: 'out-eblock', q: 'Comment importer les fiches eBlock ?', mots: 'eblock fiches import rapport état achats my block',
            r: '<ol><li>Outils › <b>Fiches eBlock</b> : glissez le favori « Automax ← eBlock (fiches) ».</li><li>Dans eBlock, My Block › Buyer, cliquez le favori : les achats depuis le début de l\'année sont listés, puis la fiche complète de chaque véhicule encore à l\'inventaire est lue (rapport d\'état, photos, pneus, peinture, options, valeurs).</li></ol><p>La fiche d\'achat du véhicule est complétée (dommages en français, lien, km, couleur), le panneau d\'inventaire et le suivi service montrent la fiche. « Encore à l\'inventaire / Tous les achats » filtre la table.</p>',
            liens: [{ t: 'Fiches eBlock', s: 'outils', o: 'eblock' }] },
          { id: 'outils-openlane', q: 'Comment lire les valeurs OpenLane (Market guide) ?', mots: 'openlane market guide valeurs ventes comparables prévision gros signet favori 30 60 90 jours',
            r: '<ol><li>Outils › <b>Valeurs OpenLane</b> : glissez le favori « Automax ← OpenLane (valeurs) » dans la barre de favoris.</li><li>Dans OpenLane (app.openlane.ca), ouvrez Market guide et cliquez le favori : le site donne la liste des NIV à lire (inventaire en stock, évaluations des 60 derniers jours, NIV demandés à la main) et, pour chacun, OpenLane fournit les ventes passées comparables (min / moyenne / max, 90 jours, même version quand il y en a assez) et la prévision de prix à 30, 60 et 90 jours au kilométrage connu.</li></ol><p>Une valeur de moins de 7 jours n\'est pas relue. Pour un NIV précis : « Un NIV en particulier » (NIV + km) dans la carte d\'import, ou le bouton « Demander les valeurs OpenLane » dans le panneau d\'inventaire, la fiche d\'achat ou l\'évaluation — il sera lu au prochain clic du favori.</p>',
            liens: [{ t: 'Valeurs OpenLane', s: 'outils', o: 'openlane' }] },
          { id: 'out-carfax', q: 'Comment attacher les rapports CARFAX aux véhicules ?', mots: 'carfax import liens rapports mes rhv automatique',
            r: '<p>Outils › <b>Import CARFAX</b> : favori « Automax ← CARFAX », cliqué depuis Mes rapports › Mes RHV du compte concessionnaire : il parcourt les pages et pose le lien du rapport sur chaque véhicule (le plus récent gagne). Une tâche automatique le fait aussi deux fois par jour. Zone de collage en secours.</p>',
            liens: [{ t: 'Import CARFAX', s: 'outils', o: 'carfax' }] },
          { id: 'out-excel', q: 'À quoi sert la Vérification Excel ?', mots: 'vérification excel comparer fichier dms transporteur manquants',
            r: '<p>Déposez un fichier Excel (DMS, transporteur, encan) : les NIV sont comparés au registre — présents, manquants, statut différent. Pratique avant une conciliation.</p>',
            liens: [{ t: 'Vérification Excel', s: 'outils', o: 'verification' }] }
        ] },

      /* ------------------------------------------------------------------ */
      { id: 'offres', titre: 'Offres et clients', intro: 'Vendre en gros à des acheteurs externes, négocier, contracter ; les leads des vendeurs.',
        articles: [
          { id: 'offre-publier', q: 'Comment mettre un véhicule en vente pour des acheteurs externes ?', mots: 'mettre en vente publier vitrine acheteur page prix',
            r: '<p>Panneau du véhicule → Rapports et liens → <b>Mettre en vente</b> : prix demandé, notes, window sticker (lien PDF pour les marques sans sticker automatique), rapport CARFAX. Les photos du véhicule deviennent visibles par lien. Il apparaît dans Offres › <b>En vente</b> et sur sa page acheteur (fiche façon encan : photos, options décodées, km, sticker, CARFAX).</p>',
            liens: [{ t: 'En vente', s: 'offres', o: 'vente' }] },
          { id: 'offre-envoyer', q: 'Comment envoyer un véhicule à un acheteur ?', mots: 'envoyer lien texto client acheteur page offre',
            r: '<p>Offres › En vente → le véhicule → <b>Envoyer</b> : texto prérempli avec le lien de la page, signé du nom officiel de la concession. L\'acheteur fait son offre sur la page (FR/EN). Dans l\'app : tuile Offre inventaire direct → À vendre.</p>' },
          { id: 'offre-recues', q: 'Comment traiter une offre reçue ?', mots: 'offre reçue accepter contre-offre refuser statut nouvelle contrat',
            r: '<p>Offres › <b>Offres reçues</b> → l\'offre : <b>Accepter</b>, <b>Contre-offre</b>, <b>Refuser</b>, Renvoyer le lien, Annuler ; km pour le contrat, note interne, historique. Statuts : nouvelle → contre → acceptée → contrat (ou refusée / annulée). Les courriels à l\'équipe ont les mêmes boutons : on peut répondre sans ouvrir le site.</p>',
            liens: [{ t: 'Offres reçues', s: 'offres', o: 'recues' }] },
          { id: 'offre-contrat', q: 'Comment est produit le contrat ?', mots: 'contrat pdf taxes signature livraison province légal',
            r: '<p>À l\'acceptation : contrat PDF au nom légal de la concession (adresse, NEQ, TPS/TVQ, permis SAAQ ou OMVIC), taxes selon la province de <b>livraison</b>, envoyé aux deux parties ; l\'acheteur finalise ses coordonnées sur sa page et <b>trace sa signature</b> dans le cadre prévu (voir « Comment signer un contrat »). Les deux copies sont dans l\'offre (QuickLook dans l\'app). Le lien <b>Central Fleet</b> prépare la demande de transport.</p>' },
          { id: 'offre-signer', q: 'Comment signer un contrat (signature électronique) ?', mots: 'signer signature électronique contresigner tablette tracer directeur contrat signé deux parties certificat',
            r: '<p>Depuis le 7 octobre, les contrats se signent sans papier, en deux temps.</p><ol><li><b>L\'acheteur</b> finalise sur sa page : coordonnées, livraison, conditions, puis il trace sa signature au doigt ou à la souris et tape son nom. Le contrat PDF part avec sa signature ; la case du vendeur indique « En attente de la signature électronique du vendeur ».</li><li><b>L\'équipe</b> reçoit le courriel « Contrat … signé par l\'acheteur — à contresigner » avec un bouton <b>Signer le contrat</b>. Le directeur contresigne depuis ce courriel ou depuis le site : Offres › <b>Offres reçues</b> → l\'offre → <b>Signer le contrat</b> (tablette, nom du signataire, case « Je suis autorisé(e) à signer pour la concession »). Il faut le droit de changer les statuts.</li><li>Les <b>deux PDF sont refaits</b> avec les deux signatures et un <b>certificat de signature électronique</b> (partie, nom, courriel, date et heure, méthode, appareil), puis renvoyés aux deux parties : c\'est la version finale.</li></ol><p>Dans la liste des offres : puce « À contresigner » tant que le vendeur n\'a pas signé, « Signé ×2 » ensuite ; la carte « Contrats signés » compte ceux qu\'il reste à contresigner. Les contrats signés avant le 7 octobre (nom tapé) peuvent être contresignés de la même façon.</p>',
            liens: [{ t: 'Offres reçues', s: 'offres', o: 'recues' }] },
          { id: 'offre-acheteurs', q: 'Comment inviter un concessionnaire acheteur ?', mots: 'acheteurs externes inviter inscrire base fiche',
            r: '<p>Offres › <b>Acheteurs</b> → Inviter : nom, courriel, langue ; l\'invitation part au nom de votre concession avec un bouton « Inscrire ma concession ». Chaque contrat signé alimente aussi la base. La fiche de l\'acheteur préremplit ses prochains contrats.</p>',
            liens: [{ t: 'Acheteurs', s: 'offres', o: 'acheteurs' }] },
          { id: 'offre-leads', q: 'Comment fonctionne le LEAD (évaluation par le client) ?', mots: 'lead évaluation client texto lien photos crm adf vendeur',
            r: '<p>Le vendeur crée un lien unique (Offres › <b>Leads</b> ou tuile LEAD de l\'app) et l\'envoie par texto. Le client scanne ou tape son NIV, inscrit le km, prend cinq photos (tableau de bord, avant, arrière, deux côtés) et laisse nom + cellulaire. Le lead arrive au <b>CRM</b> de la concession (ADF) et une copie lisible au vendeur ; la liste des demandes reçues est dans le même onglet.</p>',
            liens: [{ t: 'Leads', s: 'offres', o: 'leads' }] },
          { id: 'offre-nom', q: 'Au nom de qui partent les courriels et les contrats ?', mots: 'nom concession groupe automax expéditeur signature légal',
            r: '<p>Toujours au nom de <b>la concession qui vend</b> (Ste Marie Automobiles Ltée, Hawkesbury Chevrolet Buick Cadillac, BMW Sherbrooke, VW Brossard, Hyundai Longueuil), jamais « Groupe Automax ». Les coordonnées légales viennent de la feuille Concessions ; si un courriel part d\'une adresse générique, c\'est que l\'alias de la concession n\'est pas encore configuré — voir Maxime.</p>' }
        ] },

      /* ------------------------------------------------------------------ */
      { id: 'resultats', titre: 'Résultats', intro: 'Le profit des véhicules vendus, par période, acheteur et concession.', roles: 'directeur',
        articles: [
          { id: 'res-voir', q: 'Qui voit les Résultats ?', mots: 'résultats droit voir gestionnaire admin',
            r: '<p>Les administrateurs et les gestionnaires (droit « Voir les résultats »). Si la section n\'apparaît pas dans votre barre, demandez le droit à votre administrateur.</p>', liens: [{ t: 'Résultats', s: 'resultat' }] },
          { id: 'res-lire', q: 'Comment lire la page Résultats ?', mots: 'profit période semaine mois trimestre cumul acheteur barre clic',
            r: '<p>Profit des véhicules vendus / comptabilisés : évolution par semaine, mois ou trimestre avec le cumul ; par <b>acheteur</b> ; par concession. Un clic sur une barre liste les véhicules derrière. Le temps par étape (achat → stock → expédié → vendu) et les véhicules bloqués sont dans le même écran.</p>' },
          { id: 'res-chiffres', q: 'D\'où viennent les chiffres du profit ?', mots: 'calcul prix achat vente frais fiche achat exact',
            r: '<p>Du coût d\'achat et des frais de la fiche d\'achat, du prix de vente et des dates du journal. Des fiches complètes donnent des résultats justes ; un véhicule sans coût est signalé.</p>' }
        ] },

      /* ------------------------------------------------------------------ */
      { id: 'app', titre: 'L\'app iPhone', intro: 'ScanAutomax dans la cour : scanner, statuts, photos, audit, service, évaluation.',
        articles: [
          { id: 'app-installer', q: 'Comment installer l\'app ?', mots: 'installer testflight iphone app store invitation mise à jour',
            r: '<p>L\'app est distribuée par <b>TestFlight</b> (usage interne, pas l\'App Store) : installez TestFlight, acceptez l\'invitation reçue par courriel de Maxime, installez ScanAutomax. Les mises à jour s\'installent ensuite d\'elles-mêmes. Connexion : courriel, puis code reçu par courriel — même compte que le site, 30 jours.</p>' },
          { id: 'app-accueil', q: 'Que trouve-t-on sur l\'accueil de l\'app ?', mots: 'accueil tuiles menu boutons',
            r: '<p>Des tuiles selon vos droits : <b>Scanner</b>, Inventaire usagé, Inventaire neuf, Fiche d\'achat (débuter le stockage), Suivi service, Évaluation, Audit, LEAD, Offre inventaire direct. Les onglets du bas : Accueil, Scanner, Inventaire, Réglages.</p>' },
          { id: 'app-scanner', q: 'Comment scanner un NIV ?', mots: 'scanner caméra code-barres bluetooth lecteur siri raccourci entrer niv',
            r: '<p>Onglet Scanner → gros bouton : la caméra lit le code-barres du NIV (pare-brise ou portière) ; ou tapez le NIV dans le champ. Un <b>lecteur Bluetooth</b> appairé fonctionne sur cette page. Siri / bouton Action : « Scanner un VIN ». Après la fiche d\'un véhicule, on revient à la caméra. Le retour vocal (réglage) annonce le véhicule trouvé.</p>' },
          { id: 'app-fiche', q: 'Que puis-je faire dans la fiche d\'un véhicule ?', mots: 'fiche véhicule statut suivant stock km coût photos dommages journal terrain',
            r: '<p>En bas, le gros bouton <b>« Passer à … »</b> (statut suivant) et le menu « … » pour les autres statuts. Dans « Modifier » : # stock (avec le km, obligatoire), coût, importateur. Bande de photos, alertes (dommages eBlock, rappel), rapport CARFAX, fiche d\'achat, suivi service, journal. Le changement de statut s\'affiche tout de suite et revient en arrière si le serveur refuse.</p>' },
          { id: 'app-photos', q: 'Comment prendre les photos d\'un véhicule ?', mots: 'photos guidées angles fond studio dommages pdf',
            r: '<p>Fiche → <b>Photos guidées</b> : un angle à la fois avec un conseil de cadrage. Réglages → <b>Fond studio</b> : le fond est remplacé automatiquement par un dégradé gris (aperçu avant / après ; l\'originale reste disponible). <b>Dommages</b> : photos annotées et rapport PDF à partager.</p>' },
          { id: 'app-audit', q: 'Comment faire l\'audit physique de la cour ?', mots: 'audit inventaire physique scannés manquants inattendus rapport',
            r: '<p>Tuile <b>Audit</b> → choisir le registre et la concession → scanner chaque véhicule présent. L\'app compte attendus / scannés / manquants / inattendus et produit un rapport texte à partager.</p>' },
          { id: 'app-rafale', q: 'Comment changer le statut de plusieurs véhicules d\'un coup ?', mots: 'rafale lot plusieurs véhicules statut en série',
            r: '<p>Scanner → <b>Mode rafale</b> : scannez les véhicules à la suite sans ouvrir de fiche, puis appliquez un statut à tout le lot (par exemple « Expédié » au chargement d\'un camion).</p>' },
          { id: 'app-service', q: 'Le suivi service est-il dans l\'app ?', mots: 'suivi service app étapes autorisation directeur',
            r: '<p>Oui : tuile <b>Suivi service</b> (liste, compteurs, filtres, recherche dans tous les onglets) → véhicule → dossier (évaluation, photos, dommages), autorisation (Accepter / Refuser → É.-U. ou Canada), étapes, notes, « Déjà prêt à vendre ». La fiche d\'un véhicule Detail montre aussi sa carte Suivi service.</p>' },
          { id: 'app-evaluation', q: 'L\'évaluation est-elle dans l\'app ?', mots: 'évaluation app odomètre scanner document feuille offre',
            r: '<p>Oui : tuile <b>Évaluation</b> — mêmes calculs que le site, portée Canada / États-Unis / un État, valeurs de guide, rappels, sauvegarde automatique, registre. En plus : <b>lecture de l\'odomètre</b> par la caméra et lecture d\'un document (NIV, km, plaque). « Créer la fiche d\'achat » et « Feuille d\'offre » (PDF à partager).</p>' },
          { id: 'app-achat', q: 'Comment débuter le stockage d\'un véhicule depuis l\'app ?', mots: 'fiche achat débuter stockage scan niv ajouter registre',
            r: '<p>Tuile <b>Fiche d\'achat — Débuter le stockage</b> → NIV scanné, collé ou tapé → l\'app dit s\'il est déjà au registre → fiche préremplie → Enregistrer : le véhicule est créé « Acheté » dans la destination choisie (compagnie et destination obligatoires). Un stock # demande le km.</p>' },
          { id: 'app-hors-ligne', q: 'Que se passe-t-il sans réseau ?', mots: 'hors ligne réseau file attente actions non envoyées photos',
            r: '<p>Les actions (statut, # stock, coût, ajout, photos) attendent dans une <b>file</b> et partent au retour du réseau ; Réglages › File d\'attente la montre. Une action refusée par le serveur est abandonnée après quelques essais pour ne pas bloquer les autres. L\'inventaire consulté reste disponible hors ligne.</p>' },
          { id: 'app-widget', q: 'À quoi servent le widget et les alertes ?', mots: 'widget écran accueil alertes notifications 45 jours lundi',
            r: '<p>Le <b>widget</b> résume l\'inventaire sur l\'écran d\'accueil de l\'iPhone. Les <b>alertes</b> locales (Réglages) : véhicules de plus de 45 jours (lundi 8 h) et actions non envoyées.</p>' },
          { id: 'app-reglages', q: 'Que contient Réglages ?', mots: 'réglages compte historique file journal technique retour vocal fond studio comptes',
            r: '<p>Votre compte (rôle, concession, session, cellulaire pour les textos), <b>Guide et aide</b>, File d\'attente, Historique des véhicules consultés, Retour vocal, Fond studio, Alertes, Journal technique (les derniers échecs réseau, à partager en cas de problème), et <b>Comptes</b> pour les administrateurs.</p>' }
        ] },

      /* ------------------------------------------------------------------ */
      { id: 'admin', titre: 'Administration', intro: 'Les comptes, les rôles, les accès, les réglages du groupe.', roles: 'admin',
        articles: [
          { id: 'adm-creer', q: 'Comment créer un compte ?', mots: 'créer compte utilisateur ajouter courriel nom rôle cellulaire',
            r: '<ol><li>Admin › <b>Comptes</b> → Ajouter.</li><li>Courriel (celui avec lequel la personne se connectera), nom complet, rôle, concession(s), cellulaire.</li><li>Enregistrer : le compte est actif tout de suite ; la personne se connecte avec son courriel et le code reçu.</li></ol><p>Un administrateur de concession ne crée que des comptes de sa concession (utilisateur, gestionnaire). Le propriétaire et Marc-André créent partout.</p>', liens: [{ t: 'Admin › Comptes', s: 'admin' }] },
          { id: 'adm-roles', q: 'Quel rôle donner ?', mots: 'rôle utilisateur gestionnaire administrateur droits personnalisés choisir',
            r: '<ul><li><b>Utilisateur</b> : vendeurs, chauffeurs, préposés — scanner, statuts, photos, fiche d\'achat.</li><li><b>Gestionnaire</b> : directeur des ventes / du service — en plus, les coûts et les résultats, les gestes de directeur au service.</li><li><b>Administrateur de concession</b> : gère les comptes de sa concession (nommé par le propriétaire).</li></ul><p>Les <b>droits personnalisés</b> (cases sous le rôle) ajoutent ou retirent un droit précis sans changer le rôle, par exemple « Modifier les coûts » à un utilisateur.</p>' },
          { id: 'adm-concessions', q: 'Comment donner accès à plus d\'une concession ?', mots: 'plusieurs concessions cocher principale accès entier domaine évaluations',
            r: '<p>Dans le compte, cochez les <b>concessions</b> voulues : la première cochée est la principale, les autres sont vues en entier. Pour un accès plus fin, « Accès par domaine (avancé) » : par concession, cocher inventaire, évaluations, résultats ou service (par exemple toutes les évaluations du groupe). Seuls les comptes « Tout le groupe » peuvent accorder ces accès ; un administrateur de concession les voit sans les changer.</p>', roles: 'proprietaire' },
          { id: 'adm-telephone', q: 'À quoi sert le champ Téléphone d\'un compte ?', mots: 'téléphone cellulaire textos alerte directeur numéro',
            r: '<p>Au texto d\'alerte « même véhicule évalué dans deux concessions » (directeurs) et aux textos futurs décidés par le groupe. Chacun peut aussi inscrire le sien depuis son menu de compte. La puce « Texto » sur la ligne dit si le numéro est là.</p>' },
          { id: 'adm-desactiver', q: 'Comment retirer l\'accès à quelqu\'un ?', mots: 'désactiver supprimer départ inactif retirer accès',
            r: '<p>Rôle <b>Inactif</b> : plus aucun accès (site et app) sans effacer l\'historique — le bon choix à un départ. <b>Supprimer</b> efface le compte. Les deux sont immédiats (au plus 10 minutes pour une session déjà ouverte). On ne peut ni changer son propre rôle ni se désactiver soi-même.</p>' },
          { id: 'adm-proprietaire', q: 'Qui peut nommer un administrateur ?', mots: 'propriétaire nommer administrateur modifier retirer admin',
            r: '<p>Le propriétaire seulement (Maxime). Un administrateur de concession voit les comptes des autres administrateurs verrouillés (cadenas).</p>', roles: 'proprietaire' },
          { id: 'adm-marche', q: 'Comment régler les données de marché (MarketCheck) ?', mots: 'marketcheck clé api quota 500 jauge valeurs guide vinaudit',
            r: '<p>Admin → carte <b>Données de marché (MarketCheck)</b> : clé API (collée par vous ; jamais affichée en entier), jauge des appels du mois (500 par mois), clé VinAudit pour les valeurs de guide et son quota, veille hebdomadaire des prix (activer / lancer, liste des dérives).</p>' },
          { id: 'adm-textos', q: 'Comment activer les textos (Infobip) ?', mots: 'infobip textos sms clé api numéro envoi activer fournisseur',
            r: '<p>Admin → carte <b>Alertes aux directeurs (textos)</b> : adresse de base, clé API et numéro d\'envoi du compte Infobip → Enregistrer ; l\'état passe « Textos actifs ». Sans ça, les alertes partent par courriel seulement. Les clés ne sont visibles que deux jours dans le portail Infobip : notez-la au moment de la créer.</p>' },
          { id: 'adm-service', q: 'Quels réglages du service sont réservés aux administrateurs ?', mots: 'cibles jours miroir feuille service admin',
            r: '<p>La fenêtre <b>Cibles</b> (jours par étape et total) et le bouton <b>Feuilles</b> (copie des suivis dans le classeur de la concession), tous deux dans la sous-barre du Suivi service.</p>' },
          { id: 'adm-neufs', q: 'Comment brancher les neufs d\'une concession ?', mots: 'neufs dms feed export quotidien brancher concession client',
            r: '<p>Programmer dans le DMS l\'envoi quotidien de l\'export d\'inventaire (neufs et usagés, format texte ou csv) à l\'adresse de réception que Maxime vous donne. Le système reconnaît la concession par le code client du fichier. Les véhicules apparaissent au prochain passage horaire ; les usagés inconnus entrent au registre Detail « En stock » avec leur coût.</p>' },
          { id: 'adm-journal', q: 'Comment vérifier ce qui a été fait et par qui ?', mots: 'journal comptes modifications trace audit',
            r: '<p>Le journal de chaque véhicule (bas du panneau) et le journal des comptes (Admin) gardent chaque modification avec la date et le courriel. Les exports Excel reprennent la liste à l\'écran.</p>' }
        ] },

      /* ------------------------------------------------------------------ */
      { id: 'depannage', titre: 'Dépannage', intro: 'Quand quelque chose ne va pas.',
        articles: [
          { id: 'dep-deconnecte', q: 'Je me fais déconnecter', mots: 'déconnecté session expirée reconnecter code répété',
            r: '<p>Depuis le 7 octobre, le site et l\'app revérifient la session avant de la fermer : une déconnexion ne vient plus que d\'une session de plus de 30 jours, d\'un compte désactivé ou d\'un navigateur qui a effacé ses données (navigation privée, Safari après 7 jours sans visite — voir Démarrer). Exception : le soir du 7 octobre, toutes les sessions ont été fermées lors d\'une intervention sur le serveur ; une seule reconnexion (courriel + code) suffisait. Si ça se reproduit, notez l\'heure et dites-le à Maxime.</p>' },
          { id: 'dep-lent', q: 'C\'est lent, ou « Pas de réponse en 25 s »', mots: 'lent lenteur attente serveur injoignable réponse 25 s délai',
            r: '<p>Les listes s\'affichent d\'abord depuis la mémoire de l\'appareil puis se synchronisent ; une écriture (statut, étape) se voit tout de suite. Si « Pas de réponse » apparaît, c\'est le serveur Google qui tarde : le site relance de lui-même une requête de secours. Attendez quelques secondes ou cliquez <b>Rafraîchir</b>. Un véhicule changé pendant une panne est quand même enregistré dès que la réponse arrive (l\'état en bas de liste le confirme).</p>' },
          { id: 'dep-refus', q: '« Refusé » ou « droit manquant »', mots: 'refusé droit manquant permission interdit action',
            r: '<p>Votre rôle ne permet pas ce geste (par exemple modifier un coût ou autoriser au détail). Demandez le droit à l\'administrateur de votre concession.</p>' },
          { id: 'dep-autre-concession', q: '« Autre concession » ou véhicule introuvable', mots: 'autre concession introuvable niv absent portée invisible',
            r: '<p>Le véhicule appartient à une concession que votre compte ne voit pas. Le bandeau « Recherche dans : … » rappelle votre portée. Un administrateur du groupe peut vous donner cette concession.</p>' },
          { id: 'dep-km', q: '« Le kilométrage est obligatoire pour enregistrer un # stock »', mots: 'km obligatoire stock message rouge',
            r: '<p>Entrez le km (champ Km du panneau, ou KM de la fiche d\'achat) puis réenregistrez le # stock. Voir Inventaire › # stock et km.</p>' },
          { id: 'dep-popup', q: 'Le favori Torque / eBlock / CARFAX « ne fait rien » ou la fenêtre se ferme', mots: 'favori signet fenêtre bloquée pont popup rien ne se passe',
            r: '<p>Autorisez les fenêtres contextuelles pour groupeautomax.github.io dans le navigateur (icône à droite de la barre d\'adresse). Vérifiez aussi que vous êtes connecté au site dans le même navigateur et que la page source affiche bien la liste voulue (par exemple la bonne concession dans Torque). Recliquez le favori : l\'import reprend sans doublon.</p>' },
          { id: 'dep-photos', q: 'L\'acheteur voit des carrés gris à la place des photos', mots: 'photos grises vitrine partage invisible acheteur',
            r: '<p>Les photos sont rendues visibles à la <b>mise en vente</b> du véhicule. Si le véhicule a été publié avant que les photos soient prises, retirez-le et remettez-le en vente, ou demandez à Maxime de relancer le partage.</p>' },
          { id: 'dep-courriel', q: '« Courriel non parti » sur une offre', mots: 'courriel échec non envoyé offre acheteur filtre',
            r: '<p>Le message est noté en orange dans l\'historique de l\'offre avec la raison. Souvent un filtre anti-pourriel chez le destinataire : « Renvoyer le lien » ou envoyez-lui le lien de sa page par texto.</p>' },
          { id: 'dep-section', q: 'Une section n\'apparaît pas dans ma barre', mots: 'section absente résultats admin invisible barre manque',
            r: '<p>La barre ne montre que ce que votre rôle permet : Résultats demande « Voir les résultats », Admin demande « Gérer les comptes ». Si le droit vient d\'être accordé, reconnectez-vous ou attendez 10 minutes.</p>' },
          { id: 'dep-app-erreur', q: 'L\'app affiche une erreur réseau', mots: 'app erreur réseau journal technique échec envoyer',
            r: '<p>Réglages → <b>Journal technique</b> : les derniers échecs réseau, à partager (bouton Partager) pour un diagnostic. Les actions non envoyées sont dans la File d\'attente et repartiront d\'elles-mêmes.</p>' },
          { id: 'dep-contact', q: 'À qui m\'adresser ?', mots: 'contact aide question support qui appeler maxime administrateur',
            r: '<p>D\'abord cette aide (recherche par question). Puis l\'administrateur de votre concession (comptes, droits). Pour un problème du système : Maxime Allard. Cette aide est mise à jour chaque semaine avec les nouveautés (onglet Nouveautés).</p>' }
        ] }
    ],

    nouveautes: [
      { date: '9 octobre 2026', titre: 'Page d\'accueil, valeurs OpenLane par NIV, Suggestions dans Aide',
        texte: 'Le site s\'ouvre maintenant sur une page d\'accueil (recherche, une tuile par section, nouveautés) et chacun choisit sa page de départ (étoile d\'une tuile ou liste au bas de l\'Accueil). Outils › Valeurs OpenLane : le favori « Automax ← OpenLane (valeurs) », cliqué dans Market guide, lit pour chaque véhicule en stock, chaque évaluation récente et chaque NIV demandé les ventes comparables OpenLane (min / moyenne / max sur 90 jours) et la prévision de prix à 30, 60 et 90 jours au km connu. Les valeurs apparaissent dans le panneau d\'inventaire, la fiche d\'achat, le suivi service et l\'évaluation, et une puce « OpenLane 23 055 $ » sur les lignes. L\'onglet Suggestions est maintenant dans Aide.',
        liens: [{ t: 'Accueil', s: 'accueil', o: '' }, { t: 'Valeurs OpenLane', s: 'outils', o: 'openlane' }, { t: 'Suggestions', s: 'aide', o: 'suggestions' }] },
      { date: '8 octobre 2026', titre: 'Signature électronique des contrats',
        texte: 'Les contrats de vente aux acheteurs externes se signent maintenant sans papier. L\'acheteur trace sa signature sur sa page en finalisant ; l\'équipe reçoit un courriel « à contresigner » et le directeur signe depuis ce courriel ou depuis Offres › Offres reçues → Signer le contrat (tablette, nom, case d\'autorisation). Les deux PDF sont refaits avec les deux signatures et un certificat de signature électronique, puis renvoyés aux deux parties. La liste des offres indique « À contresigner » ou « Signé ×2 ». Note : le soir du 7 octobre, tout le monde a dû se reconnecter une fois après une intervention sur le serveur — c\'est normal, et c\'est réglé.',
        liens: [{ t: 'Offres reçues', s: 'offres', o: 'recues' }] },
      { date: '7 octobre 2026', titre: 'Aide dans le site, km obligatoire, valeur des inventaires, neufs, écritures plus rapides',
        texte: 'Cette aide (menu du compte → Guide et aide, et onglet Aide). Le kilométrage est obligatoire pour poser un # stock. La bande « Valeur des inventaires » donne le total en $ par registre. L\'onglet Neufs suit les véhicules neufs du DMS (VW Brossard) ; un administrateur peut retirer une unité du suivi pour de bon. Changer un statut ou cocher une étape se voit tout de suite, même quand le serveur tarde. Le panneau du véhicule est allégé (évaluation visible, registre d\'immatriculation sur une ligne). Dans l\'app : accueil « Inventaire usagé » / « Inventaire neuf ».',
        liens: [{ t: 'Neufs', s: 'inventaire', o: 'neufs' }] },
      { date: '6 octobre 2026', titre: 'Suivi service, accès par concession, session de 30 jours, textos aux directeurs',
        texte: 'Le Suivi service (9 étapes, vérification à la livraison et autorisation par un directeur, refus → É.-U. ou Canada, « Déjà prêt à vendre », cibles, miroir dans la feuille BMW). Un administrateur par concession ; chacun voit sa concession ; accès à plusieurs concessions à cocher. La session dure 30 jours sur le site et dans l\'app. Les directeurs reçoivent un texto quand un même véhicule est évalué dans deux concessions. La recherche trouve un véhicule partout ; la concession choisie tient pour tout le site. Chargement « Groupe Automax » animé.',
        liens: [{ t: 'Suivi service', s: 'service', o: 'encours' }] },
      { date: '2 octobre 2026', titre: 'Évaluation marché, Archive Torque, fiches eBlock, rapports CARFAX',
        texte: 'La fiche d\'évaluation avec analyse de marché (MarketCheck, Canada / États-Unis / un État), cibles agressif / standard / conservateur, valeurs de guide, rappels, sauvegarde automatique et registre. L\'Archive Torque rapatriée par un favori. Les rapports d\'état eBlock dans la fiche d\'achat, puis les fiches eBlock complètes. Les liens CARFAX du compte concessionnaire posés sur chaque véhicule, import automatique deux fois par jour. Dans l\'app : lecture d\'odomètre, photos studio, feuille d\'offre.',
        liens: [{ t: 'Évaluation', s: 'outils', o: 'evaluation' }] },
      { date: '1er octobre 2026', titre: 'Pages acheteur façon encan, contrats au nom de la concession, base des acheteurs',
        texte: 'Fiche véhicule façon encan pour les acheteurs externes (décodeur NHTSA, km de la fiche d\'achat, window sticker). Tout ce qui sort est au nom de la concession qui vend, avec ses coordonnées légales. Réponse aux offres depuis les boutons du courriel. Base des acheteurs externes et invitation. Lien Central Fleet pour le transport. Nouvelle interface du site en une seule application.',
        liens: [{ t: 'Offres', s: 'offres', o: 'recues' }] }
    ]
  };
})();
