/* =========================================================================
   Inventaire › Neufs — suivi des véhicules neufs par concession (7 oct. 2026)

   Maxime : « dans le fichier VW il y a aussi les neufs (N) : on va faire un
   suivi des neufs pour chaque concession ; regarde sur le web ce qui existe
   comme modèle de suivi ». Ce que les outils du marché suivent (vAuto
   Conquest, Cox Automotive, guides NADA / Deloitte) et qu'on reprend ici :

     1. vieillissement par tranches 0-30 / 31-60 / 61-90 / 91-180 / 180+ jours
        (alerte à 60 et 90 jours ; cible : moins de 10 % au-delà de 60 j) ;
     2. jours d'approvisionnement (days supply) = unités en stock ÷ sorties par
        jour des 90 derniers jours, par modèle et par version — l'indicateur
        n° 1 pour commander et accepter les allocations (norme industrie 2026 :
        ~75 j ; les meilleurs visent 45-60) ;
     3. mix : ce qu'on a vs ce qui sort (modèle, version, année-modèle) ;
     4. pipeline : en stock / démo / échange concessionnaire / en transit… ;
     5. coût de détention : taux du plan (5 %/an, Maxime) sur le coût facture ;
     6. revue hebdo : arrivées, sorties, unités qui franchissent 60/90/180 j,
        démos à écouler, fantômes (> 2 ans dans le DMS).

   Données : GET ?neufs=1 (Neufs.gs) — la feuille « Neufs » remplie chaque jour
   par le feed du DMS (Vw.gs → NEUFS_appliquer_), et les mouvements (arrivées,
   sorties, retours) déduits d'un feed à l'autre. Les coûts n'arrivent que
   pour les comptes qui modifient les montants, les admins et les gestionnaires.
   La concession suit le choix du site (AMX.compagnieChoisie).
   ========================================================================= */
(function () {
  'use strict';
  var h = AMX.h, I = AMX.icones;

  var TRANCHES = [
    { id: 't30', min: 0, max: 30, libelle: '0-30 j', couleur: 'vert' },
    { id: 't60', min: 31, max: 60, libelle: '31-60 j', couleur: 'bleu' },
    { id: 't90', min: 61, max: 90, libelle: '61-90 j', couleur: 'ambre' },
    { id: 't180', min: 91, max: 180, libelle: '91-180 j', couleur: 'rouge' },
    { id: 'tplus', min: 181, max: Infinity, libelle: '180+ j', couleur: 'sombre' }
  ];
  var FENETRE_VENTES_J = 90;          // jours d'approvisionnement : sorties des 90 derniers jours
  var SEUILS = [60, 90, 180];         // revue hebdo : franchissements de la semaine
  var FANTOME_J = 730;                // > 2 ans au DMS : probablement un reste à nettoyer
  var DEMO_KM = 10000;
  var STATUTS_DMS = { 'EN-INVENT.': ['En stock', 'vert'], 'DEMO': ['Démo', 'violet'], 'ECH. CONC.': ['Échange concessionnaire', 'ambre'], 'TRANSIT': ['En transit', 'bleu'], 'VENDU': ['Vendu', 'gris'], 'COMMANDE': ['Commandé', 'bleu'] };
  // (10 oct.) Portails des constructeurs : le signet « Automax ← Hyundai » (chargeur généré par mock/signet-build.py — ne jamais
  // éditer la constante à la main) lit le pipeline, les ventes déclarées (RDR) et les factures du portail des ventes Hyundai, et
  // le CSI sur BoostCX. Le stock atterrit ici (feuille Neufs, source portail-hyundai) ; ventes et commandes via ?constructeur=1.
  var CODE_SIGNET_CONSTRUCTEUR = "javascript:(function () { var s = document.createElement('script'); s.src = " + JSON.stringify(AMX.SITE) + " + 'assets/signet-constructeur.js?t=' + Date.now(); s.onerror = function () { alert(\"Impossible de charger le signet depuis le site d'inventaire (groupeautomax.github.io). V\u00e9rifiez votre connexion, puis recliquez.\"); }; document.body.appendChild(s); })();";
  // Un seul favori « Automax ← Constructeur » pour tous les portails (reconnu à l'adresse de la page).
  var PORTAILS = {
    HYUNDAI: { nom: 'Portail Hyundai', source: 'hyundai', url: 'https://salesportal-hacc.am.hyundai-corp.io/salesportal/index.html#/dealerstocklist', nomCsi: 'CSI (BoostCX)', csi: 'https://hacc.boostcx.com/bcx/dashboard/combined', liste: 'Stock › Dealer Stock List', signet: function () { return CODE_SIGNET_CONSTRUCTEUR; } },
    STM: { nom: 'Portail GM (utilitaire des commandes)', source: 'gm', url: 'https://owb.vsp.autopartners.net/ui/manage-inventory/view-inventory/preliminary', nomCsi: 'ISC (InMoment)', csi: 'https://field-reporting.inmoment.com/program/clt3hf6a4u9r91e88k56m1b7z/report/272998', liste: 'Gestion des stocks › Afficher l\'inventaire et les commandes', signet: function () { return CODE_SIGNET_CONSTRUCTEUR; } },
    HAWKS: { nom: 'Portail GM (utilitaire des commandes)', source: 'gm', url: 'https://owb.vsp.autopartners.net/ui/manage-inventory/view-inventory/preliminary', nomCsi: 'ISC (InMoment)', csi: 'https://field-reporting.inmoment.com/program/clt3hf6a4u9r91e88k56m1b7z/report/272998', liste: 'Gestion des stocks › Afficher l\'inventaire et les commandes', signet: function () { return CODE_SIGNET_CONSTRUCTEUR; } }
  };
  function peutImporterPortail() { return !!(AMX.perm('ficheAchat') || AMX.perm('changerStatut') || AMX.perm('gererUtilisateurs') || AMX.estAdmin()); }
  function libelleTypeVente(t) { var x = String(t || ''); if (/demo|slc|loan|courtoisie/i.test(x)) return 'Démo / courtoisie'; if (/fleet|flotte/i.test(x)) return 'Flotte'; if (/lease|location|bail/i.test(x)) return 'Location'; if (/retail|detail|détail/i.test(x)) return 'Détail'; return x || '—'; }

  function tranche(j) { if (j === null || j === undefined || isNaN(j)) return null; for (var i = 0; i < TRANCHES.length; i++) if (j >= TRANCHES[i].min && j <= TRANCHES[i].max) return TRANCHES[i]; return TRANCHES[TRANCHES.length - 1]; }
  function statutDms(v) { var cle = String(v.statutLibelle || '').toUpperCase(); var s = STATUTS_DMS[cle]; if (s) return { libelle: s[0], couleur: s[1] }; if (/TRANSIT/.test(cle)) return { libelle: 'En transit', couleur: 'bleu' }; if (/DEMO|DÉMO/.test(cle)) return { libelle: 'Démo', couleur: 'violet' }; return { libelle: v.statutLibelle || v.statut || '—', couleur: 'gris' }; }
  function estDemo(v) { return /DEMO|DÉMO/i.test(String(v.statutLibelle || '')); }
  function estEchange(v) { return /ECH/i.test(String(v.statutLibelle || '')); }
  function nomVehicule(v) { return [v.annee, v.modele, v.version].filter(Boolean).join(' '); }
  function cleGroupe(v) { return (v.modele || '—') + '\u0001' + (v.version || '—'); }
  function fmtJours(j) { return j === null || j === undefined || isNaN(j) ? '—' : AMX.fmtNombre(j) + ' j'; }
  function moyenne(l) { return l.length ? Math.round(l.reduce(function (a, b) { return a + b; }, 0) / l.length) : null; }
  function isoJoursAvant(n) { var d = new Date(Date.now() - n * 86400000); return d.toISOString().slice(0, 10); }
  function debut12Mois() { var n = new Date(), d = new Date(n.getFullYear(), n.getMonth() - 11, 1); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-01'; }
  function nomCie(c) { return AMX.COMPAGNIES_TOUTES[c] || c || ''; }

  function injecterCss() {
    if (document.getElementById('css-neufs')) return;
    var s = document.createElement('style'); s.id = 'css-neufs';
    s.textContent = [
      '.neufs-page .carte { margin-bottom: 12px; }',
      /* Concessions en pastilles sur une ligne (la liste verticale commune prend 300 px : trop long ici) */
      '.neufs-concessions { margin-bottom: 12px; } .neufs-concessions .choix-cie { flex-direction: row; flex-wrap: wrap; gap: 6px; } .neufs-concessions .choix-cie .choix { width: auto; border-color: var(--bordure); background: var(--carte); border-radius: 999px; padding: 5px 11px 5px 9px; } .neufs-concessions .choix-cie .choix .n { margin-left: 2px; }',
      /* Pipeline : commandées → transit → stock → démos → vendues */
      '.neufs-pipeline .neufs-etapes { display: flex; align-items: stretch; gap: 4px; padding: 10px 12px; overflow-x: auto; } .neufs-etapes .fleche { align-self: center; color: var(--encre-4); font-size: 18px; padding: 0 2px; flex: none; }',
      '.neufs-etape { flex: 1 1 140px; min-width: 130px; text-align: left; background: var(--carte-2); border: 1px solid var(--ligne); border-radius: 10px; padding: 8px 12px; cursor: pointer; font: inherit; color: var(--encre); position: relative; overflow: hidden; } .neufs-etape:hover { border-color: var(--encre-3); }',
      '.neufs-etape::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--ligne-forte); } .neufs-etape.vert::before { background: var(--vert); } .neufs-etape.bleu::before { background: var(--bleu); } .neufs-etape.violet::before { background: var(--violet); } .neufs-etape.sombre::before { background: var(--noir-2); }',
      '@media (max-width: 640px) { .neufs-pipeline .neufs-etapes { flex-wrap: wrap; overflow: visible; } .neufs-etapes .fleche { display: none; } .neufs-etape { flex: 1 1 calc(50% - 4px); min-width: 0; } }',
      '.neufs-etape .n { font-size: 24px; font-weight: 700; line-height: 1.1; } .neufs-etape .nom { font-size: 12px; font-weight: 600; margin-top: 2px; } .neufs-etape .sous { font-size: 11px; color: var(--encre-3); margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      /* Onglets de la page */
      '.neufs-onglets { display: flex; gap: 4px; border-bottom: 1px solid var(--ligne); margin: 2px 0 12px; overflow-x: auto; } .neufs-onglets button { border: 0; border-bottom: 2px solid transparent; background: none; padding: 8px 12px; font: inherit; font-size: 13.5px; color: var(--encre-3); cursor: pointer; display: inline-flex; gap: 6px; align-items: center; white-space: nowrap; margin-bottom: -1px; } .neufs-onglets button b { font-weight: 600; font-size: 12px; color: var(--encre-3); background: var(--gris-bg); border-radius: 999px; padding: 1px 7px; } .neufs-onglets button:hover { color: var(--encre); } .neufs-onglets button.actif { color: var(--vert); border-bottom-color: var(--vert); font-weight: 600; } .neufs-onglets button.actif b { color: var(--vert); background: var(--vert-clair); }',
      '.neufs-panneau.cache { display: none; }',
      '.neufs-cmd .tableau { min-width: 640px; } .neufs-cmd td.num, .neufs-cmd th.num { text-align: right; font-variant-numeric: tabular-nums; } .neufs-cmd tr.modele { cursor: pointer; } .neufs-cmd tr.modele:hover td { background: var(--carte-2); } .neufs-cmd tr.modele.ouvert td { background: var(--carte-2); } .neufs-cmd tr.version td:first-child { padding-left: 26px; color: var(--encre-2); } .neufs-cmd tr.version.cache { display: none; } .neufs-cmd tr.total td { font-weight: 700; border-top: 2px solid var(--ligne-forte); }',
      '.neufs-panneau h3 { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--encre-3); margin: 0 0 6px; }',
      '.neufs-cartes { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; margin-bottom: 12px; }',
      '.neufs-carte { text-align: left; background: var(--carte); border: 1px solid var(--ligne); border-radius: var(--rayon); padding: 8px 10px 7px 12px; display: flex; flex-direction: column; gap: 2px; box-shadow: var(--ombre); position: relative; overflow: hidden; cursor: pointer; }',
      '.neufs-carte::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--ligne-forte); }',
      '.neufs-carte.vert::before { background: var(--vert); } .neufs-carte.bleu::before { background: var(--bleu); } .neufs-carte.ambre::before { background: var(--ambre); } .neufs-carte.rouge::before { background: var(--rouge); } .neufs-carte.violet::before { background: var(--violet); } .neufs-carte.sombre::before { background: var(--noir-2); }',
      '.neufs-carte.actif { border-color: var(--encre); box-shadow: 0 0 0 2px rgba(0,0,0,.08); }',
      '.neufs-carte .nom { font-size: 10.5px; color: var(--encre-3); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; } .neufs-carte .n { font-size: 20px; font-weight: 700; line-height: 1.1; } .neufs-carte .bas { font-size: 11px; color: var(--encre-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      '.neufs-jauge { display: flex; height: 14px; border-radius: 7px; overflow: hidden; background: var(--gris-bg); margin: 8px 0 6px; }',
      '.neufs-jauge i { display: block; height: 100%; } .neufs-jauge .vert { background: var(--vert); } .neufs-jauge .bleu { background: var(--bleu); } .neufs-jauge .ambre { background: var(--ambre); } .neufs-jauge .rouge { background: var(--rouge); } .neufs-jauge .sombre { background: var(--noir-2); }',
      '.neufs-legende { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12px; } .neufs-legende button { background: none; border: 0; padding: 0; font: inherit; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; color: var(--encre-2); } .neufs-legende button.actif { font-weight: 700; color: var(--encre); } .neufs-legende i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }',
      '.neufs-legende i.vert { background: var(--vert); } .neufs-legende i.bleu { background: var(--bleu); } .neufs-legende i.ambre { background: var(--ambre); } .neufs-legende i.rouge { background: var(--rouge); } .neufs-legende i.sombre { background: var(--noir-2); }',
      '.neufs-statuts { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; } .neufs-statuts .etiquette { margin-right: 4px; }',
      '.neufs-statut { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 11px; border: 1px solid var(--bordure); border-radius: 999px; background: #fff; color: var(--encre); font: inherit; font-size: 13px; cursor: pointer; } .neufs-statut:hover { border-color: var(--encre-3); } .neufs-statut b { font-weight: 700; } .neufs-statut i { width: 8px; height: 8px; border-radius: 50%; background: var(--encre-3); }',
      '.neufs-statut.vert i { background: var(--vert); } .neufs-statut.bleu i { background: var(--bleu); } .neufs-statut.violet i { background: var(--violet); } .neufs-statut.ambre i { background: var(--ambre); } .neufs-statut.gris i { background: var(--encre-3); }',
      '.neufs-statut.actif { border-color: var(--vert); background: var(--vert-clair); box-shadow: 0 0 0 1px var(--vert) inset; }',
      '.neufs-outils { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; } .neufs-outils .recherche { display: flex; align-items: center; gap: 6px; flex: 1 1 200px; } .neufs-outils .recherche svg { width: 16px; height: 16px; color: var(--encre-3); } .neufs-outils .recherche input { flex: 1; height: 32px; } .neufs-outils select { height: 32px; width: auto; } .neufs-outils .compte { margin-left: auto; font-size: 12px; }',
      '.neufs-table { overflow-x: auto; } .neufs-table .tableau { min-width: 880px; } .neufs-table td, .neufs-table th { padding: 7px 10px; } .neufs-table tr.rangee { cursor: pointer; } .neufs-table tr.rangee:hover td { background: var(--carte-2); }',
      '.neufs-table td.vehicule .nom { font-weight: 600; } .neufs-table td.vehicule .vin { font-family: var(--mono); font-size: 11px; color: var(--encre-3); }',
      '.neufs-table th.tri { cursor: pointer; user-select: none; } .neufs-table th.tri.actif { color: var(--encre); }',
      '.neufs-table td.num, .neufs-table th.num { text-align: right; font-variant-numeric: tabular-nums; }',
      '.neufs-table tr.sorti td { color: var(--encre-3); }',
      '.neufs-groupes .tableau { min-width: 720px; } .neufs-groupes td.num, .neufs-groupes th.num { text-align: right; font-variant-numeric: tabular-nums; } .neufs-groupes tr.modele td { background: var(--carte-2); font-weight: 700; } .neufs-groupes tr.version td:first-child { padding-left: 26px; }',
      '.neufs-groupes tr.version { cursor: pointer; } .neufs-groupes tr.version:hover td { background: var(--gris-bg); }',
      '.neufs-appro.long { color: var(--rouge); font-weight: 700; } .neufs-appro.court { color: var(--vert); font-weight: 700; }',
      '.neufs-revue { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; } .neufs-revue .bloc { background: var(--carte-2); border: 1px solid var(--ligne); border-radius: 8px; padding: 8px 10px; font-size: 12.5px; } .neufs-revue .bloc b { display: block; font-size: 15px; } .neufs-revue .bloc ul { margin: 6px 0 0; padding-left: 16px; } .neufs-revue .bloc li { margin: 2px 0; } .neufs-revue .bloc li a { cursor: pointer; }',
      '.neufs-fiche { display: grid; grid-template-columns: 1.2fr 1fr; gap: 16px; } @media (max-width: 760px) { .neufs-fiche { grid-template-columns: 1fr; } }',
      '.neufs-fiche h4 { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--encre-3); margin: 14px 0 6px; } .neufs-fiche h4:first-child { margin-top: 0; }',
      '.neufs-exclus { margin-top: 12px; font-size: 12.5px; } .neufs-exclus summary { cursor: pointer; color: var(--encre-3); font-weight: 600; } .neufs-exclus ul { margin: 8px 0 0; padding-left: 18px; line-height: 1.7; } .neufs-exclus .btn.petit { margin-left: 4px; }',
      '.neufs-fiche dl { display: grid; grid-template-columns: max-content 1fr; gap: 3px 12px; font-size: 12.5px; margin: 0; } .neufs-fiche dt { color: var(--encre-3); } .neufs-fiche dd { margin: 0; }',
      '.neufs-prix { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; } .neufs-prix .tuile { background: var(--carte-2); border: 1px solid var(--ligne); border-radius: 8px; padding: 8px 10px; } .neufs-prix .l { font-size: 10px; letter-spacing: .06em; text-transform: uppercase; color: var(--encre-3); } .neufs-prix .v { font-size: 16px; font-weight: 700; }',
      '.neufs-options { display: flex; flex-wrap: wrap; gap: 4px; } .neufs-options span { background: var(--gris-bg); border-radius: 999px; padding: 2px 8px; font-size: 11.5px; }',
      '.neufs-vide { padding: 28px 12px; text-align: center; color: var(--encre-3); }',
      '.neufs-panneau .carte-entete { flex-wrap: wrap; } .neufs-panneau .carte-entete h2 { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; min-width: 0; } .neufs-panneau .carte-entete h2 .sous { font-weight: 400; font-size: 12px; color: var(--encre-3); }',
      '.neufs-portail-grille { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; }',
      '.neufs-portail-grille .tableau { min-width: 0; } .neufs-portail-grille td.num, .neufs-portail-grille th.num { text-align: right; font-variant-numeric: tabular-nums; }',
      '.neufs-mois { display: flex; gap: 4px; align-items: flex-end; height: 72px; margin: 4px 0 2px; } .neufs-mois i { flex: 1; background: var(--vert); border-radius: 3px 3px 0 0; min-height: 2px; position: relative; } .neufs-mois i.actuel { background: var(--bleu); }',
      '.neufs-mois-leg { display: flex; gap: 4px; font-size: 10px; color: var(--encre-3); } .neufs-mois-leg span { flex: 1; text-align: center; }',
      '.neufs-signet { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin-top: 4px; } .neufs-signet p { margin: 4px 0 8px; font-size: 12.5px; color: var(--encre-2); line-height: 1.5; }'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ------------------------------ Données ------------------------------ */
  var cache = { donnees: null, le: 0, promesse: null };
  var cachePortail = { donnees: null, le: 0, promesse: null };
  var DUREE_CACHE_MS = 5 * 60000;
  AMX.neufs = {
    charger: function (force) {
      if (!force && cache.donnees && Date.now() - cache.le < DUREE_CACHE_MS) return Promise.resolve(cache.donnees);
      if (cache.promesse) return cache.promesse;
      cache.promesse = AMX.get({ neufs: 1 }).then(function (d) {
        cache.promesse = null;
        if (!d || d.refuse) throw new Error((d && (d.erreur || d.message)) || 'Accès refusé.');
        if (!d.ok) throw new Error((d && (d.erreur || d.message)) || 'Réponse inattendue du serveur');
        cache.donnees = d; cache.le = Date.now();
        try { document.dispatchEvent(new CustomEvent('amx:neufs')); } catch (e) {}
        return d;
      }, function (e) { cache.promesse = null; throw e; });
      return cache.promesse;
    },
    enCache: function () { return cache.donnees; },
    vider: function () { cache.donnees = null; cache.le = 0; cachePortail.donnees = null; },
    // Portails des constructeurs (?constructeur=1) : ventes déclarées, commandes en attente, factures, état des lectures.
    chargerPortail: function (force) {
      if (!force && cachePortail.donnees && Date.now() - cachePortail.le < DUREE_CACHE_MS) return Promise.resolve(cachePortail.donnees);
      if (cachePortail.promesse) return cachePortail.promesse;
      cachePortail.promesse = AMX.get({ constructeur: 1 }).then(function (d) {
        cachePortail.promesse = null;
        if (!d || d.ok === false || d.refuse) throw new Error((d && (d.erreur || d.message)) || 'Réponse inattendue du serveur');
        cachePortail.donnees = d; cachePortail.le = Date.now();
        return d;
      }, function (e) { cachePortail.promesse = null; throw e; });
      return cachePortail.promesse;
    },
    // Nombre de neufs en stock de la concession choisie (compteur de l'onglet).
    compteur: function () { var d = cache.donnees; if (!d) return ''; var c = AMX.compagnieChoisie('inventaire'); return d.vehicules.filter(function (v) { return v.enStock && (!c || v.compagnie === c); }).length; },
    monter: function (conteneur, ctx) { return new VueNeufs(conteneur, ctx); },
    // Exposés pour les tests et l'app : calculs purs.
    tranche: tranche, groupes: groupes, revue: revue
  };

  /** Groupes modèle › version : en stock, tranches, sorties 90 j, jours d'approvisionnement, âge moyen. */
  function groupes(vehicules, mouvements) {
    var depuis = isoJoursAvant(FENETRE_VENTES_J);
    var sorties = (mouvements || []).filter(function (m) { return m.type === 'sortie' && String(m.date) >= depuis; });
    var par = {};
    var creer = function (cle, modele, version) { return par[cle] || (par[cle] = { cle: cle, modele: modele, version: version, enStock: 0, tranches: {}, sorties: 0, ages: [], agesSortie: [], anneeModeles: {} }); };
    vehicules.forEach(function (v) {
      if (!v.enStock) return;
      var g = creer(cleGroupe(v), v.modele || '—', v.version || '—');
      g.enStock++;
      var t = tranche(v.jours); if (t) g.tranches[t.id] = (g.tranches[t.id] || 0) + 1;
      if (v.jours !== null && v.jours !== undefined) g.ages.push(v.jours);
      if (v.annee) g.anneeModeles[v.annee] = (g.anneeModeles[v.annee] || 0) + 1;
    });
    sorties.forEach(function (m) {
      var g = creer((m.modele || '—') + '\u0001' + (m.version || '—'), m.modele || '—', m.version || '—');
      g.sorties++;
      if (m.jours !== null && m.jours !== undefined && !isNaN(m.jours)) g.agesSortie.push(Number(m.jours));
    });
    var liste = Object.keys(par).map(function (k) { return par[k]; });
    liste.forEach(function (g) {
      g.parJour = g.sorties / FENETRE_VENTES_J;
      g.appro = g.enStock && g.parJour > 0 ? Math.round(g.enStock / g.parJour) : null;    // null = pas de sortie en 90 j
      g.ageMoyen = moyenne(g.ages);
      g.ageSortieMoyen = moyenne(g.agesSortie);
    });
    // Par modèle (somme des versions)
    var parModele = {};
    liste.forEach(function (g) {
      var m = parModele[g.modele] || (parModele[g.modele] = { modele: g.modele, enStock: 0, sorties: 0, tranches: {}, ages: [], versions: [] });
      m.enStock += g.enStock; m.sorties += g.sorties; m.versions.push(g);
      Object.keys(g.tranches).forEach(function (t) { m.tranches[t] = (m.tranches[t] || 0) + g.tranches[t]; });
      m.ages = m.ages.concat(g.ages);
    });
    var modeles = Object.keys(parModele).map(function (k) { return parModele[k]; });
    modeles.forEach(function (m) {
      m.parJour = m.sorties / FENETRE_VENTES_J;
      m.appro = m.enStock && m.parJour > 0 ? Math.round(m.enStock / m.parJour) : null;
      m.ageMoyen = moyenne(m.ages);
      m.versions.sort(function (a, b) { return b.enStock - a.enStock || a.version.localeCompare(b.version); });
    });
    modeles.sort(function (a, b) { return b.enStock - a.enStock || a.modele.localeCompare(b.modele); });
    var total = { enStock: 0, sorties: 0 };
    modeles.forEach(function (m) { total.enStock += m.enStock; total.sorties += m.sorties; });
    total.parJour = total.sorties / FENETRE_VENTES_J;
    total.appro = total.enStock && total.parJour > 0 ? Math.round(total.enStock / total.parJour) : null;
    return { modeles: modeles, total: total, fenetre: FENETRE_VENTES_J };
  }

  /** Revue de la semaine : arrivées, sorties, franchissements 60/90/180 j, démos, fantômes. */
  function revue(vehicules, mouvements) {
    var semaine = isoJoursAvant(7);
    var enStock = vehicules.filter(function (v) { return v.enStock; });
    var out = {
      arrivees: (mouvements || []).filter(function (m) { return m.type === 'arrivee' && String(m.date) >= semaine; }),
      sorties: (mouvements || []).filter(function (m) { return m.type === 'sortie' && String(m.date) >= semaine; }),
      franchissements: {},
      demos: enStock.filter(function (v) { return estDemo(v) && ((v.km || 0) >= DEMO_KM || (v.jours || 0) >= 180); }),
      fantomes: enStock.filter(function (v) { return (v.jours || 0) >= FANTOME_J; }),
      echanges: enStock.filter(estEchange)
    };
    SEUILS.forEach(function (s) { out.franchissements[s] = enStock.filter(function (v) { return v.jours !== null && v.jours >= s && v.jours < s + 7 && !estEchange(v); }); });
    return out;
  }

  /* ------------------------------ La vue ------------------------------- */
  function VueNeufs(conteneur, ctx) {
    injecterCss();
    var self = this;
    this.conteneur = conteneur; this.generation = 0; this.detruit = false;
    this.donnees = null; this.erreur = '';
    this.compagnie = AMX.compagnieChoisie('inventaire');
    this.filtres = { recherche: '', tranche: '', modele: '', version: '', statut: '', annee: '', emplacement: '', sortis: false };
    this.tri = AMX.memo.lire('neufs_tri', { cle: 'jours', desc: true });
    this.construire();
    if (ctx && ctx.params && ctx.params.vin) { this.filtres.recherche = String(ctx.params.vin).toUpperCase(); this.elRecherche.value = this.filtres.recherche; }
    this.charger();
    this.surProfil = function () { if (!self.detruit) { self.compagnie = AMX.compagnieChoisie('inventaire'); self.rendre(); } };
    document.addEventListener('amx:profil', this.surProfil);
    document.addEventListener('amx:compagnie', this.surProfil);
  }
  VueNeufs.prototype.demonter = function () { this.detruit = true; this.generation++; document.removeEventListener('amx:profil', this.surProfil); document.removeEventListener('amx:compagnie', this.surProfil); };
  // Changement d'onglet dans la section Inventaire : retour au registre (US, CAN, Détail…).
  VueNeufs.prototype.naviguer = function (ctx) {
    if (ctx.onglet === 'neufs') { if (ctx.params && ctx.params.vin) { this.filtres.recherche = String(ctx.params.vin).toUpperCase(); this.elRecherche.value = this.filtres.recherche; this.rendreTable(); } return; }
    this.demonter(); AMX.vider(this.conteneur);
    AMX.courante.instance = AMX.inventaire.monterRegistre(this.conteneur, ctx);
  };

  VueNeufs.prototype.construire = function () {
    var self = this;
    this.elEtat = h('p', { text: 'Chargement des neufs…' });
    this.btnRafraichir = h('button.btn', { type: 'button', html: I.rafraichir + '<span>Rafraîchir</span>', onclick: function () { self.charger(true); } });
    this.btnExport = h('button.btn', { type: 'button', html: I.telecharger + '<span>Exporter Excel</span>', onclick: function () { self.exporter(); } });
    this.btnPortail = h('button.btn', { type: 'button', html: I.externe + '<span>Portail du constructeur</span>', title: 'Lire l\'inventaire, les commandes et les ventes déclarées depuis le portail du constructeur (favori à cliquer sur le portail, connecté)', onclick: function () { self.ouvrirSignet(self.compagnie || 'HYUNDAI'); } });
    var entete = h('div.entete-page', [h('div', { style: { minWidth: 0 } }, [h('h1', 'Véhicules neufs'), this.elEtat]), h('div.actions', [this.btnPortail, this.btnRafraichir, this.btnExport])]);
    this.elChoix = h('div.neufs-concessions');
    this.elPipeline = h('div.carte.neufs-pipeline');
    this.elCartes = h('div.neufs-cartes');
    this.elOnglets = h('div.neufs-onglets', { role: 'tablist' });
    // Onglets : Liste · Commandes · Ventes déclarées · Analyse — un seul affiché à la fois (page courte, Maxime 10 oct.)
    this.onglet = AMX.memo.lire('neufs_onglet', 'liste'); if (['liste', 'commandes', 'ventes', 'analyse'].indexOf(this.onglet) < 0) this.onglet = 'liste';
    this.elVieillissement = h('div.carte');
    this.elRevue = h('div.carte');
    this.elGroupes = h('div.carte');
    this.elCommandes = h('div.neufs-panneau');
    this.elVentes = h('div.neufs-panneau');
    this.elRecherche = h('input.saisie', { type: 'search', placeholder: 'NIV, # stock, modèle, version, couleur…', autocomplete: 'off', oninput: AMX.debounce(function (e) { self.filtres.recherche = e.target.value; self.rendreTable(); }, 120) });
    this.selModele = h('select.saisie', { 'aria-label': 'Modèle', onchange: function (e) { self.filtres.modele = e.target.value; self.filtres.version = ''; self.rendreTable(); self.rendreSelects(); } });
    this.selVersion = h('select.saisie', { 'aria-label': 'Version', onchange: function (e) { self.filtres.version = e.target.value; self.rendreTable(); } });
    this.elStatuts = h('div.neufs-statuts', { role: 'group', 'aria-label': 'Statut' });   /* pastilles cliquables avec le compte par statut */
    this.selAnnee = h('select.saisie', { 'aria-label': 'Année-modèle', onchange: function (e) { self.filtres.annee = e.target.value; self.rendreTable(); } });
    this.selEmplacement = h('select.saisie', { 'aria-label': 'Emplacement', onchange: function (e) { self.filtres.emplacement = e.target.value; self.rendreTable(); } });
    var caseSortis = h('input', { type: 'checkbox' });
    caseSortis.addEventListener('change', function () { self.filtres.sortis = caseSortis.checked; self.rendreSelects(); self.rendreTable(); });
    this.elCompte = h('span.compte.doux');
    var barre = h('div.carte', [h('div.carte-corps', [this.elStatuts, h('div.neufs-outils', [
      h('div.recherche', [h('span', { html: I.recherche }), this.elRecherche]), this.selModele, this.selVersion, this.selAnnee, this.selEmplacement,
      h('label.case', { title: 'Les véhicules disparus du feed (vendus, livrés, transférés) sont gardés avec leur date de sortie' }, [caseSortis, h('span', 'Inclure les sortis')]), this.elCompte
    ])])]);
    this.elBarre = barre;
    this.elTable = h('div.neufs-table');
    this.elExclus = h('div.neufs-exclus');
    this.elListe = h('div.neufs-panneau', [barre, h('div.carte', [h('div.carte-corps', [this.elTable, this.elExclus])])]);
    this.elAnalyse = h('div.neufs-panneau', [this.elVieillissement, this.elGroupes, this.elRevue]);
    this.el = h('div.page.neufs-page', [entete, this.elChoix, this.elPipeline, this.elCartes, this.elOnglets, this.elListe, this.elCommandes, this.elVentes, this.elAnalyse]);
    this.conteneur.appendChild(this.el);
  };
  /* Onglet actif : un seul panneau visible ; mémorisé pour la prochaine visite. */
  VueNeufs.prototype.montrer = function (onglet, options) {
    this.onglet = onglet; AMX.memo.ecrire('neufs_onglet', onglet);
    var self = this;
    [['liste', this.elListe], ['commandes', this.elCommandes], ['ventes', this.elVentes], ['analyse', this.elAnalyse]].forEach(function (p) { p[1].classList.toggle('cache', p[0] !== onglet); });
    this.rendreOnglets();
    if (options && options.defiler) { var cible = { liste: this.elBarre, commandes: this.elCommandes, ventes: this.elVentes, analyse: this.elAnalyse }[onglet]; if (cible) cible.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  };
  VueNeufs.prototype.rendreOnglets = function () {
    var self = this, d = this.donnees;
    AMX.vider(this.elOnglets);
    if (!d) return;
    var enStock = this.visibles().filter(function (v) { return v.enStock; }).length;
    var c = this.compagnie, p = this.portail || {};
    var commandes = (p.commandes || []).filter(function (x) { return !c || x.compagnie === c; }).reduce(function (s, x) { return s + (x.n || 0); }, 0);
    var depuis12 = debut12Mois(), ventes = (p.ventes || []).filter(function (x) { return (!c || x.compagnie === c) && String(x.dateVente) >= depuis12; }).length;
    var portail = !c || !!PORTAILS[c];
    var onglets = [['liste', 'Liste', enStock], ['commandes', 'Commandes', portail ? commandes : null], ['ventes', 'Ventes déclarées', portail ? ventes : null], ['analyse', 'Analyse', null]];
    onglets.forEach(function (o) {
      if (o[2] === null && (o[0] === 'commandes' || o[0] === 'ventes')) return;   /* concession sans portail : pas d'onglets vides */
      self.elOnglets.appendChild(h('button' + (self.onglet === o[0] ? '.actif' : ''), { type: 'button', role: 'tab', 'aria-selected': self.onglet === o[0] ? 'true' : 'false', 'data-onglet': o[0], onclick: function () { self.montrer(o[0]); } }, [h('span', { text: o[1] }), o[2] !== null ? h('b', { text: AMX.fmtNombre(o[2]) }) : null]));
    });
    if (!this.elOnglets.querySelector('button.actif')) { this.onglet = 'liste'; this.montrer('liste'); }
  };

  VueNeufs.prototype.charger = function (force) {
    var self = this, gen = ++this.generation;
    if (force) this.btnRafraichir.classList.add('occupe');
    if (!AMX.neufs.enCache()) this.elTable.appendChild(AMX.chargeur('Véhicules neufs'));
    this.portail = this.portail || null;
    AMX.neufs.chargerPortail(force).then(function (p) { if (gen !== self.generation) return; self.portail = p; self.rendrePortailOnglets(); }, function () { if (gen !== self.generation) return; self.portail = null; self.rendrePortailOnglets(); });
    return AMX.neufs.charger(force).then(function (d) {
      if (gen !== self.generation) return;
      self.donnees = d; self.erreur = '';
      self.btnRafraichir.classList.remove('occupe');
      self.rendre();
      if (force) AMX.toast('Neufs mis à jour — ' + self.visibles().filter(function (v) { return v.enStock; }).length + ' en stock', 'ok');
    }).catch(function (e) {
      if (gen !== self.generation) return;
      self.btnRafraichir.classList.remove('occupe');
      self.erreur = AMX.erreurTexte(e); self.rendre();
      AMX.toast('Impossible de charger les neufs — ' + self.erreur, 'erreur');
    });
  };

  /** Véhicules de la concession choisie (toutes si « Toutes »). */
  VueNeufs.prototype.visibles = function () {
    var d = this.donnees, c = this.compagnie;
    if (!d) return [];
    return d.vehicules.filter(function (v) { return !c || v.compagnie === c; });
  };
  VueNeufs.prototype.mouvements = function () {
    var d = this.donnees, c = this.compagnie;
    if (!d) return [];
    return (d.mouvements || []).filter(function (m) { return !c || m.compagnie === c; });
  };

  VueNeufs.prototype.rendre = function () {
    var self = this;
    AMX.vider(this.elChoix);
    var tous = this.donnees ? this.donnees.vehicules : [];
    var choix = AMX.choixCompagnie({ domaine: 'inventaire', valeur: this.compagnie, compte: function (c) { return tous.filter(function (v) { return v.enStock && (!c || v.compagnie === c); }).length; }, onchange: function (c) { self.compagnie = c; self.filtres.modele = ''; self.filtres.version = ''; self.filtres.statut = ''; self.rendre(); } });
    if (choix) this.elChoix.appendChild(choix);
    if (this.erreur && !this.donnees) { this.elEtat.textContent = this.erreur; AMX.vider(this.elTable); this.elTable.appendChild(h('div.neufs-vide', { text: 'Impossible de charger les neufs : ' + this.erreur })); return; }
    if (!this.donnees) return;
    var liste = this.visibles(), enStock = liste.filter(function (v) { return v.enStock; });
    var feeds = this.donnees.feeds || {}, cies = this.compagnie ? [this.compagnie] : Object.keys(AMX.COMPAGNIES);
    var derniers = cies.map(function (c) { return feeds[c] ? nomCie(c) + ' ' + AMX.fmtDate(feeds[c].le, true) + (/portail/.test(String(feeds[c].source || '')) ? ' (portail)' : '') : null; }).filter(Boolean);
    var nTerrain = enStock.filter(function (v) { return String(v.statutLibelle || '').toUpperCase() === 'EN-INVENT.'; }).length, nTransit = enStock.filter(function (v) { return /TRANSIT/.test(String(v.statutLibelle || '').toUpperCase()); }).length, nDemos = enStock.filter(estDemo).length;
    this.elEtat.textContent = enStock.length + ' neuf' + (enStock.length > 1 ? 's' : '') + (this.compagnie ? ' — ' + nomCie(this.compagnie) : ' — tout le groupe') + (enStock.length ? ' (' + nTerrain + ' en stock' + (nDemos ? ', ' + nDemos + ' démo' + (nDemos > 1 ? 's' : '') : '') + (nTransit ? ', ' + nTransit + ' en transit' : '') + ')' : '') + (derniers.length ? ' · dernière lecture : ' + derniers.join(' · ') : ' · aucun feed reçu encore');
    this.btnPortail.classList.toggle('cache', !(peutImporterPortail() && (!this.compagnie || PORTAILS[this.compagnie])));
    this.rendrePipeline(enStock);
    this.rendreCartes(enStock);
    this.rendreVieillissement(enStock);
    this.rendreCommandes();
    this.rendreVentes();
    this.rendreRevue(liste);
    this.rendreGroupes(liste);
    this.rendreSelects();
    this.rendreTable();
    this.rendreExclus();
    this.montrer(this.onglet);
  };

  /* Exclusions permanentes (Maxime, 7 oct. : « enlever de manière permanente les 4 unités de VW vieilles »).
     Un NIV retiré du suivi disparaît des feuilles et le feed du DMS ne le ramène plus (Neufs.gs, propriété NEUFS_EXCLUS).
     Réservé aux administrateurs : bouton « Retirer du suivi » dans la fiche, liste des exclus sous le tableau avec « Réinclure ». */
  VueNeufs.prototype.exclure = function (v) {
    var self = this;
    var raison = h('input.saisie', { type: 'text', placeholder: 'Raison (ex. : fantôme au DMS, vendu hors feed)', autocomplete: 'off' });
    var corps = h('div', [
      h('p', { style: { margin: '0 0 10px', color: 'var(--encre-2)', lineHeight: '1.5' }, text: nomVehicule(v) + (v.stock ? ' — # ' + v.stock : '') + ' (' + v.vin + ') sera retiré du suivi des neufs pour de bon : il disparaît des listes et des mouvements, et le feed quotidien du DMS ne le ramènera plus. Un administrateur peut le réinclure plus tard.' }),
      raison
    ]);
    return AMX.confirmer('Retirer du suivi des neufs ?', corps, { ok: 'Retirer pour de bon', danger: true }).then(function (ok) {
      if (!ok) return;
      return AMX.post({ action: 'neufsExclure', vin: v.vin, raison: raison.value.trim() || 'Retiré du suivi' }).then(function (d) {
        AMX.verifier(d, 'Retrait refusé');
        AMX.toast(nomVehicule(v) + ' retiré du suivi des neufs', 'ok');
        AMX.neufs.vider();
        return self.charger(true);
      }).catch(function (e) { AMX.toast('Échec — ' + AMX.erreurTexte(e), 'erreur'); });
    });
  };
  VueNeufs.prototype.reinclure = function (x) {
    var self = this;
    return AMX.confirmer('Réinclure ce véhicule ?', (x.modele || x.vin) + ' reviendra dans le suivi au prochain feed du DMS (comme une arrivée).', { ok: 'Réinclure' }).then(function (ok) {
      if (!ok) return;
      return AMX.post({ action: 'neufsReinclure', vin: x.vin }).then(function (d) {
        AMX.verifier(d, 'Réinclusion refusée');
        AMX.toast((x.modele || x.vin) + ' réinclus — il reviendra au prochain feed', 'ok');
        AMX.neufs.vider();
        return self.charger(true);
      }).catch(function (e) { AMX.toast('Échec — ' + AMX.erreurTexte(e), 'erreur'); });
    });
  };
  VueNeufs.prototype.rendreExclus = function () {
    var self = this, d = this.donnees || {};
    AMX.vider(this.elExclus);
    if (!d.gererExclus || !(d.exclus || []).length) return;
    var liste = (d.exclus || []).filter(function (x) { return !self.compagnie || !x.compagnie || x.compagnie === self.compagnie; });
    if (!liste.length) return;
    var det = h('details', [h('summary', { text: liste.length + ' véhicule' + (liste.length > 1 ? 's' : '') + ' retiré' + (liste.length > 1 ? 's' : '') + ' du suivi pour de bon' })]);
    det.appendChild(h('ul', liste.map(function (x) {
      return h('li', [
        h('span.mono', { text: x.vin }), ' ', h('span', { text: (x.compagnie ? nomCie(x.compagnie) + ' · ' : '') + (x.modele || '') + (x.stock ? ' # ' + x.stock : '') }),
        x.raison ? h('span.doux', { text: ' — ' + x.raison }) : null, x.le ? h('span.doux.petit', { text: ' (' + AMX.fmtDate(x.le) + (x.par ? ', ' + x.par : '') + ')' }) : null,
        ' ', h('button.btn.petit', { type: 'button', text: 'Réinclure', onclick: function () { self.reinclure(x); } })
      ]);
    })));
    this.elExclus.appendChild(det);
  };

  /* Données du portail du constructeur (?constructeur=1) pour la concession choisie : ventes déclarées (RDR), commandes, états. */
  VueNeufs.prototype.portailVisible = function () {
    var p = this.portail || {}, c = this.compagnie;
    var filtre = function (l) { return (l || []).filter(function (x) { return !c || x.compagnie === c; }); };
    var cies = c ? [c] : Object.keys(PORTAILS), etats = p.etats || {};
    var lus = cies.filter(function (x) { return etats[x] && etats[x].le; });
    return { ventes: filtre(p.ventes), commandes: filtre(p.commandes), etats: etats, lus: lus, cies: cies, montants: !!p.montants, factures: p.factures || {} };
  };
  VueNeufs.prototype.rendrePortailOnglets = function () {
    if (!this.donnees) return;
    var enStock = this.visibles().filter(function (v) { return v.enStock; });
    this.rendrePipeline(enStock); this.rendreCommandes(); this.rendreVentes(); this.rendreOnglets();
  };
  /* Bande « pipeline » : commandées → en transit → en stock → démos / courtoisie → vendues (RDR). Chaque étape mène au détail. */
  VueNeufs.prototype.rendrePipeline = function (enStock) {
    var self = this, pv = this.portailVisible();
    AMX.vider(this.elPipeline);
    var statut = function (cle) { return enStock.filter(function (v) { return String(v.statutLibelle || '').toUpperCase() === cle; }).length; };
    var transit = enStock.filter(function (v) { return /TRANSIT/.test(String(v.statutLibelle || '').toUpperCase()); }).length;
    var demos = enStock.filter(estDemo).length, echanges = enStock.filter(estEchange).length;
    var terrain = statut('EN-INVENT.');
    var commandes = pv.commandes.reduce(function (s, x) { return s + (x.n || 0); }, 0);
    var mois = new Date().toISOString().slice(0, 7), depuis12 = debut12Mois();
    var ventes12 = pv.ventes.filter(function (v) { return String(v.dateVente) >= depuis12; }), ceMois = ventes12.filter(function (v) { return String(v.dateVente).slice(0, 7) === mois; }).length;
    var sorties90 = this.mouvements().filter(function (m) { return m.type === 'sortie' && String(m.date) >= isoJoursAvant(90); }).length;
    var portail = pv.lus.length > 0;
    var etape = function (cls, nom, n, sous, action) {
      var b = h('button.neufs-etape.' + cls, { type: 'button', title: sous || '' }, [h('div.n', { text: n === null ? '—' : AMX.fmtNombre(n) }), h('div.nom', { text: nom }), sous ? h('div.sous', { text: sous }) : null]);
      b.addEventListener('click', action);
      return b;
    };
    var versListe = function (cle) { return function () { self.filtres.statut = cle; self.filtres.tranche = ''; self.filtres.sortis = false; self.rendreSelects(); self.rendreTable(); self.montrer('liste', { defiler: true }); }; };
    var etapes = [];
    if (portail || commandes) etapes.push(etape('bleu', 'Commandées', commandes, portail ? 'en cours chez le constructeur' : 'pas de lecture du portail', function () { self.montrer('commandes', { defiler: true }); }));
    etapes.push(etape('bleu', 'En transit', transit, 'en route vers la concession', versListe('TRANSIT')));
    etapes.push(etape('vert', 'En stock', terrain, 'sur le terrain, à vendre', versListe('EN-INVENT.')));
    etapes.push(etape('violet', 'Démos / courtoisie', demos, echanges ? '+ ' + echanges + ' échange' + (echanges > 1 ? 's' : '') + ' concessionnaire' : 'en service, à écouler', versListe('DEMO')));
    if (portail) etapes.push(etape('sombre', 'Vendus (RDR)', ceMois, ventes12.length + ' sur 12 mois · déclarés au constructeur', function () { self.montrer('ventes', { defiler: true }); }));
    else etapes.push(etape('sombre', 'Sorties 90 j', sorties90, 'déduites du feed du DMS', function () { self.montrer('analyse', { defiler: true }); }));
    var corps = h('div.neufs-etapes');
    etapes.forEach(function (e, i) { if (i) corps.appendChild(h('span.fleche', { 'aria-hidden': 'true', text: '→' })); corps.appendChild(e); });
    this.elPipeline.appendChild(corps);
  };
  /* Onglet Commandes : ce qui est commandé chez le constructeur (par modèle › version · couleur), puis ce qui est en route. */
  VueNeufs.prototype.rendreCommandes = function () {
    var self = this, pv = this.portailVisible();
    AMX.vider(this.elCommandes);
    var etat = pv.lus.length ? pv.etats[pv.lus[0]] : null;
    var lu = pv.lus.map(function (x) { return nomCie(x) + ' lu le ' + AMX.fmtDate(pv.etats[x].le, true) + (pv.etats[x].par ? ' par ' + String(pv.etats[x].par).split('@')[0] : ''); }).join(' · ');
    var total = pv.commandes.reduce(function (s, x) { return s + (x.n || 0); }, 0);
    var carte = h('div.carte');
    carte.appendChild(h('div.carte-entete', [h('h2', ['Commandes en cours chez le constructeur', h('span.sous', { text: total ? total + ' unité' + (total > 1 ? 's' : '') + (lu ? ' · ' + lu : '') : (lu || '') })]), peutImporterPortail() ? h('button.btn.petit', { type: 'button', html: I.externe + '<span>Relire le portail</span>', onclick: function () { self.ouvrirSignet(pv.lus[0] || pv.cies[0]); } }) : null]));
    if (!pv.commandes.length) {
      carte.appendChild(h('div.carte-corps', [h('div.neufs-vide', { text: pv.lus.length ? 'Aucune commande en cours au dernier passage.' : 'Pas encore de lecture du portail : cliquez le favori « Automax ← Constructeur » sur le portail du constructeur, connecté.' })]));
      this.elCommandes.appendChild(carte); return;
    }
    // Par modèle (regroupé), détail version · couleur · type en dessous
    var parModele = {};
    pv.commandes.forEach(function (x) { var k = x.modele || '—'; var m = parModele[k] || (parModele[k] = { modele: k, n: 0, lignes: [], annees: {}, cies: {} }); m.n += x.n || 0; m.lignes.push(x); if (x.annee) m.annees[x.annee] = (m.annees[x.annee] || 0) + (x.n || 0); if (!self.compagnie) m.cies[x.compagnie] = (m.cies[x.compagnie] || 0) + (x.n || 0); });
    var modeles = Object.keys(parModele).map(function (k) { return parModele[k]; }).sort(function (a, b) { return b.n - a.n || a.modele.localeCompare(b.modele); });
    var enStockPar = {}; this.visibles().forEach(function (v) { if (v.enStock && !/TRANSIT/.test(String(v.statutLibelle || '').toUpperCase())) enStockPar[v.modele || '—'] = (enStockPar[v.modele || '—'] || 0) + 1; });
    var transitPar = {}; this.visibles().forEach(function (v) { if (v.enStock && /TRANSIT/.test(String(v.statutLibelle || '').toUpperCase())) transitPar[v.modele || '—'] = (transitPar[v.modele || '—'] || 0) + 1; });
    var g = groupes(this.visibles(), this.mouvements()), sortiesPar = {}; g.modeles.forEach(function (m) { sortiesPar[m.modele] = m.sorties; });
    var corps = h('tbody');
    modeles.forEach(function (m) {
      var annees = Object.keys(m.annees).sort().map(function (a) { return a + ' ×' + m.annees[a]; }).join(', ');
      var tr = h('tr.modele', [h('td', [h('b', { text: m.modele }), self.compagnie ? null : h('span.doux.petit', { text: ' ' + Object.keys(m.cies).map(function (c) { return nomCie(c) + ' ' + m.cies[c]; }).join(' · ') })]), h('td', { text: annees }), h('td.num', [h('b', { text: String(m.n) })]), h('td.num', { text: transitPar[m.modele] ? String(transitPar[m.modele]) : '' }), h('td.num', { text: enStockPar[m.modele] ? String(enStockPar[m.modele]) : '' }), h('td.num', { text: sortiesPar[m.modele] ? String(sortiesPar[m.modele]) : '' })]);
      var ouvert = false, details = [];
      tr.addEventListener('click', function () { ouvert = !ouvert; details.forEach(function (d) { d.classList.toggle('cache', !ouvert); }); tr.classList.toggle('ouvert', ouvert); });
      corps.appendChild(tr);
      m.lignes.sort(function (a, b) { return (b.n || 0) - (a.n || 0); }).forEach(function (x) {
        var d = h('tr.version.cache', [h('td', { text: [x.annee, x.version || '—', x.couleur].filter(Boolean).join(' · ') + (x.typeCommande ? ' — ' + x.typeCommande : '') }), h('td'), h('td.num', { text: String(x.n || 0) }), h('td'), h('td'), h('td')]);
        details.push(d); corps.appendChild(d);
      });
    });
    corps.appendChild(h('tr.total', [h('td', 'Total'), h('td'), h('td.num', [h('b', { text: String(total) })]), h('td.num', { text: String(Object.keys(transitPar).reduce(function (s, k) { return s + transitPar[k]; }, 0) || '') }), h('td.num', { text: String(Object.keys(enStockPar).reduce(function (s, k) { return s + enStockPar[k]; }, 0) || '') }), h('td.num', { text: String(g.total.sorties || '') })]));
    carte.appendChild(h('div.carte-corps', [
      h('div.neufs-cmd', { style: { overflowX: 'auto' } }, [h('table.tableau', [h('thead', [h('tr', [h('th', 'Modèle'), h('th', 'Années-modèle'), h('th.num', 'Commandées'), h('th.num', 'En transit'), h('th.num', 'En stock'), h('th.num', 'Sorties ' + g.fenetre + ' j')])]), corps])]),
      h('p.doux.petit', { style: { margin: '8px 0 0' }, text: 'Cliquez un modèle pour le détail par version et couleur. Les sorties sont celles des ' + g.fenetre + ' derniers jours : commandes + transit + stock très au-dessus des sorties = surapprovisionnement à venir.' + (etat && etat.stock ? ' Dernier passage : ' + (etat.stock.total || 0) + ' NIV (' + (etat.stock.enStock || 0) + ' en stock, ' + (etat.stock.demos || 0) + ' démos / courtoisie, ' + (etat.stock.transit || 0) + ' en transit)' + (etat.stock.initial ? ' — premier import' : ' · ' + (etat.stock.arrivees || 0) + ' arrivée' + (etat.stock.arrivees > 1 ? 's' : '') + ', ' + (etat.stock.sorties || 0) + ' sortie' + (etat.stock.sorties > 1 ? 's' : '')) + '.' : '') })
    ]));
    this.elCommandes.appendChild(carte);
    // En route : les NIV en transit, avec l'étape et la date d'arrivée prévue quand le portail la donne
    var transit = this.visibles().filter(function (v) { return v.enStock && /TRANSIT/.test(String(v.statutLibelle || '').toUpperCase()); });
    if (transit.length) {
      transit.sort(function (a, b) { return String((a.extra || {}).eta || '9999').localeCompare(String((b.extra || {}).eta || '9999')) || nomVehicule(a).localeCompare(nomVehicule(b)); });
      var c2 = h('div.carte', [h('div.carte-entete', [h('h2', ['En route', h('span.sous', { text: transit.length + ' véhicule' + (transit.length > 1 ? 's' : '') + ' en transit' })]), h('button.btn.petit', { type: 'button', text: 'Voir dans la liste', onclick: function () { self.filtres.statut = 'TRANSIT'; self.rendreSelects(); self.rendreTable(); self.montrer('liste', { defiler: true }); } })])]);
      var rows = transit.slice(0, 60).map(function (v) { var x = v.extra || {}; var tr = h('tr.rangee', [h('td.vehicule', [h('div.nom', { text: nomVehicule(v) }), h('div.vin', { text: v.vin + (x.commande ? ' · cmd ' + x.commande : '') })]), h('td', { text: v.couleur || '—' }), h('td', { text: v.emplacement || x.etape || '—' }), h('td', { text: x.eta ? AMX.fmtDate(x.eta) : '—' })]); tr.addEventListener('click', function () { self.ouvrir(v); }); return tr; });
      c2.appendChild(h('div.carte-corps', [h('div.neufs-table', [h('table.tableau', [h('thead', [h('tr', [h('th', 'Véhicule'), h('th', 'Couleur'), h('th', 'Étape'), h('th', 'Arrivée prévue')])]), h('tbody', rows)])]), transit.length > 60 ? h('p.doux.petit', { style: { margin: '8px 0 0' }, text: '… et ' + (transit.length - 60) + ' autres — voir la liste, statut « En transit ».' }) : null]));
      this.elCommandes.appendChild(c2);
    }
  };
  /* Onglet Ventes déclarées : les RDR des 12 derniers mois (par mois, par type, par modèle) et les dernières livraisons. */
  VueNeufs.prototype.rendreVentes = function () {
    var self = this, pv = this.portailVisible();
    AMX.vider(this.elVentes);
    var lu = pv.lus.map(function (x) { return nomCie(x) + ' lu le ' + AMX.fmtDate(pv.etats[x].le, true); }).join(' · ');
    var carte = h('div.carte');
    if (!pv.ventes.length) {
      carte.appendChild(h('div.carte-entete', [h('h2', 'Ventes déclarées au constructeur (RDR)')]));
      carte.appendChild(h('div.carte-corps', [h('div.neufs-vide', { text: pv.lus.length ? 'Aucune vente déclarée lue au dernier passage.' : 'Pas encore de lecture du portail : cliquez le favori « Automax ← Constructeur » sur le portail du constructeur, connecté.' })]));
      this.elVentes.appendChild(carte); return;
    }
    var mois = [], now = new Date();
    for (var i = 11; i >= 0; i--) { var d = new Date(now.getFullYear(), now.getMonth() - i, 1); mois.push({ cle: d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2), libelle: ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'][d.getMonth()], n: 0 }); }
    var parMois = {}; mois.forEach(function (m) { parMois[m.cle] = m; });
    var parType = {}, parModele = {}, total12 = 0, ceMois = 0, cleMois = mois[11].cle, moisPrec = mois[10].cle, nPrec = 0;
    pv.ventes.forEach(function (v) { var k = String(v.dateVente).slice(0, 7); if (parMois[k]) { parMois[k].n++; total12++; var t = libelleTypeVente(v.typeVente); parType[t] = (parType[t] || 0) + 1; var m = v.modele || '—'; parModele[m] = parModele[m] || { n: 0, cout: 0, nCout: 0 }; parModele[m].n++; if (v.coutFacture) { parModele[m].cout += v.coutFacture; parModele[m].nCout++; } } if (k === cleMois) ceMois++; if (k === moisPrec) nPrec++; });
    var max = Math.max(1, Math.max.apply(null, mois.map(function (m) { return m.n; })));
    var jourMois = now.getDate(), rythme = ceMois / Math.max(1, jourMois), joursMois = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    carte.appendChild(h('div.carte-entete', [h('h2', ['Ventes déclarées au constructeur (RDR)', h('span.sous', { text: total12 + ' sur 12 mois · ' + ceMois + ' ce mois' + (lu ? ' · ' + lu : '') })]), h('span.doux.petit', { text: 'livraisons déclarées, pas les profits (voir Résultat › Véhicules neufs)' })]));
    var colMois = h('div', [
      h('h3', { text: 'Par mois' }),
      h('div.neufs-mois', mois.map(function (m, i) { return h('i' + (i === 11 ? '.actuel' : ''), { style: { height: Math.round(100 * m.n / max) + '%' }, title: m.cle + ' : ' + m.n + ' vente' + (m.n > 1 ? 's' : '') }); })),
      h('div.neufs-mois-leg', mois.map(function (m) { return h('span', { text: m.libelle }); })),
      h('p.doux.petit', { style: { margin: '6px 0 0' }, text: 'Ce mois : ' + ceMois + ' en ' + jourMois + ' jour' + (jourMois > 1 ? 's' : '') + (ceMois ? ' (≈ ' + Math.round(rythme * joursMois) + ' au rythme actuel)' : '') + ' · mois précédent : ' + nPrec + '.' }),
      h('p.doux.petit', { style: { margin: '4px 0 0' }, text: Object.keys(parType).sort(function (a, b) { return parType[b] - parType[a]; }).map(function (t) { return t + ' ' + parType[t]; }).join(' · ') })
    ]);
    var modeles = Object.keys(parModele).sort(function (a, b) { return parModele[b].n - parModele[a].n; }).slice(0, 10);
    var colModeles = h('div', [
      h('h3', { text: 'Par modèle — 12 mois' }),
      h('table.tableau', [h('thead', [h('tr', [h('th', 'Modèle'), h('th.num', 'Ventes'), h('th.num', 'Part')].concat(pv.montants ? [h('th.num', 'Coût facture moy.')] : []))]), h('tbody', modeles.map(function (m) { var x = parModele[m]; return h('tr', [h('td', { text: m }), h('td.num', { text: String(x.n) }), h('td.num', { text: Math.round(100 * x.n / Math.max(1, total12)) + ' %' })].concat(pv.montants ? [h('td.num', { text: x.nCout ? AMX.fmtArgent(x.cout / x.nCout, 0) : '—' })] : [])); }))])
    ]);
    carte.appendChild(h('div.carte-corps', [h('div.neufs-portail-grille', [colMois, colModeles])]));
    this.elVentes.appendChild(carte);
    // Dernières livraisons déclarées (60 jours, 100 au plus)
    var depuis = isoJoursAvant(60), recentes = pv.ventes.filter(function (v) { return String(v.dateVente) >= depuis; }).sort(function (a, b) { return String(b.dateVente).localeCompare(String(a.dateVente)); });
    if (recentes.length) {
      var avecClient = recentes.some(function (v) { return v.client; }), avecPar = recentes.some(function (v) { return v.saisiPar; });
      var rows = recentes.slice(0, 100).map(function (v) { return h('tr', [h('td', { text: AMX.fmtDate(v.dateVente) }), h('td.vehicule', [h('div.nom', { text: [v.annee, v.modele, v.version].filter(Boolean).join(' ') }), h('div.vin', { text: v.vin })]), h('td', { text: v.couleur || '—' }), h('td', { text: libelleTypeVente(v.typeVente) })].concat(avecClient ? [h('td', { text: v.client || '—' })] : []).concat(avecPar ? [h('td', { text: v.saisiPar || '—' })] : []).concat(pv.montants ? [h('td.num', { text: v.coutFacture ? AMX.fmtArgent(v.coutFacture) : '—' })] : [])); });
      var c2 = h('div.carte', [h('div.carte-entete', [h('h2', ['Dernières livraisons déclarées', h('span.sous', { text: recentes.length + ' sur 60 jours' })])]), h('div.carte-corps', [h('div.neufs-table', [h('table.tableau', [h('thead', [h('tr', [h('th', 'Date'), h('th', 'Véhicule'), h('th', 'Couleur'), h('th', 'Type')].concat(avecClient ? [h('th', 'Client')] : []).concat(avecPar ? [h('th', 'Saisi par')] : []).concat(pv.montants ? [h('th.num', 'Coût facture')] : []))]), h('tbody', rows)])]), recentes.length > 100 ? h('p.doux.petit', { style: { margin: '8px 0 0' }, text: '… et ' + (recentes.length - 100) + ' autres (export Excel pour le tout).' }) : null])]);
      this.elVentes.appendChild(c2);
    }
  };
  /* Fenêtre du signet : le favori à glisser, le mode d'emploi, les liens vers le portail et le CSI. */
  VueNeufs.prototype.ouvrirSignet = function (cie) {
    var p = PORTAILS[cie] || PORTAILS.HYUNDAI, code = p.signet();
    var signet = h('a.btn.primaire', { href: code, text: 'Automax ← Constructeur', title: 'Glissez ce bouton dans votre barre de favoris', draggable: 'true' });
    signet.addEventListener('click', function (e) { e.preventDefault(); AMX.toast('Glissez ce bouton dans la barre de favoris de Chrome (Cmd+Shift+B pour l\'afficher), puis cliquez-le depuis le portail, connecté.', 'attention', 8000); });
    var corps = h('div', [
      h('p', { style: { margin: '0 0 12px', color: 'var(--encre-2)', lineHeight: '1.5' } }, 'Un seul favori pour tous les portails des constructeurs (Hyundai, GM…), reconnu à l\'adresse de la page. Cliqué sur le portail des ventes, il lit l\'inventaire complet (en stock, démos et courtoisie, en transit, commandes en cours), les ventes déclarées des 12 derniers mois et, quand le portail les donne, les factures du constructeur (coût de chaque NIV), puis les envoie ici : le suivi des neufs se remplit comme avec un feed du DMS. Cliqué sur le site CSI du constructeur (BoostCX, ISC InMoment), il lit les scores, le composite de la marque et les sondages (onglet CSI). Rien n\'est modifié sur les portails.'),
      h('div.neufs-signet', [
        h('div', [h('div.section-titre', '1. Installer (une fois)'), h('p', 'Glissez ce bouton dans la barre de favoris de Chrome. Si la barre est cachée : Cmd+Shift+B.'), signet]),
        h('div', [h('div.section-titre', '2. Ouvrir le portail'), h('p', { text: 'Connecté avec votre compte du constructeur, sur la liste de l\'inventaire (' + (p.liste || 'n\'importe quelle liste') + ').' }), h('a.btn', { href: p.url, target: '_blank', rel: 'noopener', html: I.externe + '<span>' + p.nom + '</span>' }), p.csi ? h('a.btn', { href: p.csi, target: '_blank', rel: 'noopener', style: { marginLeft: '6px' }, html: I.externe + '<span>' + (p.nomCsi || 'CSI') + '</span>' }) : null]),
        h('div', [h('div.section-titre', '3. Cliquer le favori'), h('p', 'Une bande verte suit la progression en bas de la page (de 30 secondes à 3 minutes selon le portail). À la fin, revenez ici : « Rafraîchir ». Une fois par jour suffit ; un passage par semaine pour le CSI.')])
      ])
    ]);
    AMX.modale({ titre: p.nom + ' → ScanAutomax', corps: corps, large: true, boutons: [{ texte: 'Fermer', action: function (fermer) { fermer(); } }] });
  };

  VueNeufs.prototype.rendreCartes = function (enStock) {
    var self = this, d = this.donnees;
    AMX.vider(this.elCartes);
    var g = groupes(enStock, this.mouvements());
    // Âge moyen et « plus de 60 jours » : hors échanges concessionnaire et fantômes (> 2 ans au DMS),
    // qui sont des cas de nettoyage, pas des véhicules à vendre — ils ont leur bloc dans la revue.
    var vendables = enStock.filter(function (v) { return !estEchange(v) && (v.jours || 0) < FANTOME_J; });
    var ages = vendables.map(function (v) { return v.jours; }).filter(function (j) { return j !== null && j !== undefined; });
    var plus60 = vendables.filter(function (v) { return (v.jours || 0) > 60; }).length;
    var pct60 = vendables.length ? Math.round(100 * plus60 / vendables.length) : 0;
    var demos = enStock.filter(estDemo).length, echanges = enStock.filter(estEchange).length;
    var anneeMax = enStock.reduce(function (m, v) { return Math.max(m, Number(v.annee) || 0); }, 0);
    var ancienne = enStock.filter(function (v) { return Number(v.annee) && Number(v.annee) < anneeMax; }).length;
    var detention = d.montants ? enStock.reduce(function (s, v) { return s + (v.coutDetention || 0); }, 0) : null;
    var detentionJour = d.montants ? Math.round(enStock.reduce(function (s, v) { return s + ((v.coutFacture || 0) * (d.parametres.tauxPlan || 5) / 100 / 365); }, 0)) : null;
    var carte = function (couleur, nom, n, bas, filtre) {
      var c = h('button.neufs-carte.' + couleur, { type: 'button' }, [h('div.nom', { text: nom }), h('div.n', { text: n }), bas ? h('div.bas', { text: bas }) : null]);
      c.addEventListener('click', function () { if (filtre) { filtre(); self.rendreSelects(); self.montrer('liste', { defiler: true }); } });
      return c;
    };
    this.elCartes.appendChild(carte(g.total.sorties ? 'vert' : 'gris', 'Sorties 90 jours', AMX.fmtNombre(g.total.sorties), g.total.sorties ? (Math.round(g.total.parJour * 7 * 10) / 10) + ' par semaine' : 'déduites du feed, d\'un jour à l\'autre', function () { self.montrer('analyse', { defiler: true }); }));
    this.elCartes.appendChild(carte(g.total.appro === null ? 'gris' : (g.total.appro > 90 ? 'rouge' : (g.total.appro > 60 ? 'ambre' : 'vert')), 'Jours d\'approvisionnement', g.total.appro === null ? '—' : fmtJours(g.total.appro), 'stock ÷ ventes/jour (90 j) · norme ~75 j'));
    this.elCartes.appendChild(carte(ages.length ? (moyenne(ages) > 90 ? 'rouge' : (moyenne(ages) > 60 ? 'ambre' : 'vert')) : 'gris', 'Âge moyen', fmtJours(moyenne(ages)), 'cible < 45 j · hors échanges et fantômes'));
    this.elCartes.appendChild(carte(pct60 > 10 ? 'rouge' : 'vert', 'Plus de 60 jours', AMX.fmtNombre(plus60) + ' (' + pct60 + ' %)', 'cible < 10 % · hors échanges et fantômes', function () { self.filtres.tranche = 'plus60'; self.rendreTable(); }));
    if (anneeMax) this.elCartes.appendChild(carte(ancienne ? 'ambre' : 'vert', 'Ancienne année-modèle', AMX.fmtNombre(ancienne), 'avant ' + anneeMax + ' — à écouler d\'abord', function () { self.filtres.annee = 'ancienne'; self.rendreTable(); }));
    if (detention !== null) this.elCartes.appendChild(carte('sombre', 'Coût de détention', AMX.fmtArgent(detention), AMX.fmtArgent(detentionJour) + ' / jour à ' + (d.parametres.tauxPlan || 5) + ' %'));
  };

  VueNeufs.prototype.rendreVieillissement = function (enStock) {
    var self = this;
    AMX.vider(this.elVieillissement);
    var comptes = {}; enStock.forEach(function (v) { var t = tranche(v.jours); if (t) comptes[t.id] = (comptes[t.id] || 0) + 1; });
    var total = enStock.length || 1;
    var jauge = h('div.neufs-jauge', TRANCHES.map(function (t) { return h('i.' + t.couleur, { style: { width: (100 * (comptes[t.id] || 0) / total) + '%' }, title: t.libelle + ' : ' + (comptes[t.id] || 0) }); }));
    var legende = h('div.neufs-legende', TRANCHES.map(function (t) {
      return h('button' + (self.filtres.tranche === t.id ? '.actif' : ''), { type: 'button', onclick: function () { self.filtres.tranche = self.filtres.tranche === t.id ? '' : t.id; self.rendreVieillissement(enStock); self.rendreTable(); } }, [h('i.' + t.couleur), h('span', { text: t.libelle + ' : ' + (comptes[t.id] || 0) })]);
    }));
    this.elVieillissement.appendChild(h('div.carte-entete', [h('h2', 'Vieillissement'), h('span.doux.petit', { text: 'jours depuis la réception au DMS · alerte à 60 et 90 jours' })]));
    this.elVieillissement.appendChild(h('div.carte-corps', [jauge, legende]));
  };

  VueNeufs.prototype.rendreRevue = function (liste) {
    var self = this;
    AMX.vider(this.elRevue);
    var r = revue(liste, this.mouvements());
    var lien = function (v) { return h('a', { text: (v.stock ? '#' + v.stock + ' · ' : '') + nomVehicule(v) + (v.jours !== null && v.jours !== undefined ? ' — ' + fmtJours(v.jours) : ''), onclick: function () { self.ouvrir(v); } }); };
    var lienM = function (m) { return h('span', { text: (m.stock ? '#' + m.stock + ' · ' : '') + [m.annee, m.modele, m.version].filter(Boolean).join(' ') + (m.type === 'sortie' && m.jours !== null && m.jours !== undefined ? ' — ' + fmtJours(m.jours) + ' en stock' : '') + ' (' + AMX.fmtDateCourte(m.date) + ')' }); };
    var bloc = function (titre, n, items, rendu, vide) { return h('div.bloc', [h('div', { text: titre }), h('b', { text: AMX.fmtNombre(n) }), items.length ? h('ul', items.slice(0, 8).map(function (x) { return h('li', [rendu(x)]); }).concat(items.length > 8 ? [h('li.doux', { text: '… et ' + (items.length - 8) + ' autre' + (items.length - 8 > 1 ? 's' : '') })] : [])) : h('div.doux.petit', { text: vide })]); };
    var blocs = [
      bloc('Arrivées — 7 jours', r.arrivees.length, r.arrivees, lienM, 'aucune arrivée vue dans le feed'),
      bloc('Sorties — 7 jours', r.sorties.length, r.sorties, lienM, 'aucune sortie'),
      bloc('Passent 60 jours cette semaine', r.franchissements[60].length, r.franchissements[60], lien, '—'),
      bloc('Passent 90 jours', r.franchissements[90].length, r.franchissements[90], lien, '—'),
      bloc('Passent 180 jours', r.franchissements[180].length, r.franchissements[180], lien, '—'),
      bloc('Démos à écouler', r.demos.length, r.demos, lien, 'démo ≥ ' + AMX.fmtNombre(DEMO_KM) + ' km ou ≥ 180 j : aucun'),
      bloc('Fantômes au DMS (> 2 ans)', r.fantomes.length, r.fantomes, lien, 'rien à nettoyer')
    ];
    this.elRevue.appendChild(h('div.carte-entete', [h('h2', 'Revue de la semaine'), h('span.doux.petit', { text: 'ce qui mérite un coup d\'œil au meeting d\'inventaire' })]));
    this.elRevue.appendChild(h('div.carte-corps', [h('div.neufs-revue', blocs)]));
  };

  VueNeufs.prototype.rendreGroupes = function (liste) {
    var self = this;
    AMX.vider(this.elGroupes);
    var g = groupes(liste, this.mouvements());
    var approCell = function (x) { var cls = x.appro === null ? '' : (x.appro > 90 ? '.long' : (x.appro <= 60 ? '.court' : '')); return h('td.num', [h('span.neufs-appro' + cls, { text: x.appro === null ? (x.enStock ? '∞' : '—') : fmtJours(x.appro), title: x.appro === null ? 'aucune sortie en ' + g.fenetre + ' jours' : x.enStock + ' en stock ÷ ' + x.sorties + ' sortie(s) en ' + g.fenetre + ' j' })]); };
    var entete = h('tr', [h('th', 'Modèle › version'), h('th.num', 'En stock')].concat(TRANCHES.map(function (t) { return h('th.num', { text: t.libelle }); })).concat([h('th.num', 'Sorties ' + g.fenetre + ' j'), h('th.num', 'Jours d\'appro'), h('th.num', 'Âge moyen'), h('th', 'Années')]));
    var corps = h('tbody');
    var rang = function (x, classe, nom) {
      var annees = x.anneeModeles ? Object.keys(x.anneeModeles).sort().map(function (a) { return a + ' ×' + x.anneeModeles[a]; }).join(', ') : '';
      var tr = h('tr.' + classe, [h('td', { text: nom }), h('td.num', { text: x.enStock })].concat(TRANCHES.map(function (t) { return h('td.num', { text: x.tranches[t.id] || '' }); })).concat([h('td.num', { text: x.sorties || '' }), approCell(x), h('td.num', { text: fmtJours(x.ageMoyen) }), h('td', { text: annees })]));
      return tr;
    };
    g.modeles.forEach(function (m) {
      corps.appendChild(rang(m, 'modele', m.modele));
      m.versions.forEach(function (v) {
        var tr = rang(v, 'version', v.version);
        tr.addEventListener('click', function () { self.filtres.modele = v.modele; self.filtres.version = v.version; self.rendreSelects(); self.rendreTable(); self.elTable.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
        corps.appendChild(tr);
      });
    });
    corps.appendChild(h('tr.modele', [h('td', 'Total'), h('td.num', { text: g.total.enStock })].concat(TRANCHES.map(function () { return h('td'); })).concat([h('td.num', { text: g.total.sorties || '' }), approCell(g.total), h('td'), h('td')])));
    this.elGroupes.appendChild(h('div.carte-entete', [h('h2', 'Par modèle et version'), h('span.doux.petit', { text: 'jours d\'approvisionnement = en stock ÷ sorties par jour des ' + g.fenetre + ' derniers jours · vert ≤ 60 j, rouge > 90 j' })]));
    this.elGroupes.appendChild(h('div.carte-corps', [h('div.neufs-groupes', { style: { overflowX: 'auto' } }, [h('table.tableau', [h('thead', [entete]), corps])])]));
    if (!g.total.sorties) this.elGroupes.querySelector('.carte-corps').appendChild(h('p.doux.petit', { style: { margin: '8px 0 0' }, text: 'Les sorties se déduisent d\'un feed à l\'autre : les jours d\'approvisionnement apparaissent après quelques jours de feed.' }));
  };

  VueNeufs.prototype.rendreSelects = function () {
    var self = this, liste = this.visibles(), f = this.filtres;
    var remplir = function (sel, valeurs, vide, courant) { AMX.vider(sel); sel.appendChild(h('option', { value: '', text: vide })); valeurs.forEach(function (v) { sel.appendChild(h('option', { value: v[0], text: v[1], selected: courant === v[0] })); }); };
    var uniques = function (fn) { var o = {}; liste.forEach(function (v) { var k = fn(v); if (k) o[k] = (o[k] || 0) + 1; }); return Object.keys(o).sort().map(function (k) { return [k, k + ' (' + o[k] + ')']; }); };
    remplir(this.selModele, uniques(function (v) { return v.modele; }), 'Tous les modèles', f.modele);
    remplir(this.selVersion, uniques(function (v) { return (!f.modele || v.modele === f.modele) ? v.version : ''; }), 'Toutes les versions', f.version);
    // Statuts : une pastille par statut présent (sur les véhicules en stock, ou tous si « Inclure les sortis »), avec le compte.
    var base = liste.filter(function (v) { return f.sortis || v.enStock; }), statuts = {}, ordre = [];
    base.forEach(function (v) { var k = String(v.statutLibelle || '').toUpperCase(), s = statutDms(v); if (!statuts[k]) { statuts[k] = { libelle: s.libelle, couleur: s.couleur, n: 0 }; ordre.push(k); } statuts[k].n++; });
    if (f.statut && !statuts[f.statut]) f.statut = '';
    var rang = { 'EN-INVENT.': 0, 'DEMO': 1, 'TRANSIT': 2, 'COMMANDE': 3, 'ECH. CONC.': 4 };
    ordre.sort(function (a, b) { var ra = rang[a] === undefined ? 9 : rang[a], rb = rang[b] === undefined ? 9 : rang[b]; return ra - rb || statuts[b].n - statuts[a].n; });
    AMX.vider(this.elStatuts);
    var pastille = function (cle, libelle, n, couleur) {
      return h('button.neufs-statut' + (couleur ? '.' + couleur : '') + (f.statut === cle ? '.actif' : ''), { type: 'button', title: cle ? 'Ne montrer que « ' + libelle + ' »' : 'Tous les statuts', onclick: function () { f.statut = f.statut === cle ? '' : cle; self.rendreSelects(); self.rendreTable(); } }, [couleur ? h('i') : null, h('span', { text: libelle }), h('b', { text: AMX.fmtNombre(n) })]);
    };
    this.elStatuts.appendChild(h('span.etiquette', { text: 'Statut' }));
    this.elStatuts.appendChild(pastille('', 'Tous', base.length, ''));
    ordre.forEach(function (k) { self.elStatuts.appendChild(pastille(k, statuts[k].libelle, statuts[k].n, statuts[k].couleur)); });
    var annees = uniques(function (v) { return v.annee; }).reverse();
    remplir(this.selAnnee, [['ancienne', 'Ancienne année-modèle']].concat(annees), 'Toutes les années', f.annee);
    remplir(this.selEmplacement, uniques(function (v) { return v.emplacement; }), 'Tous les emplacements', f.emplacement);
  };

  VueNeufs.prototype.filtrees = function () {
    var f = this.filtres, q = f.recherche.trim().toUpperCase();
    var liste = this.visibles();
    var anneeMax = liste.reduce(function (m, v) { return v.enStock ? Math.max(m, Number(v.annee) || 0) : m; }, 0);
    return liste.filter(function (v) {
      if (!f.sortis && !v.enStock) return false;
      if (f.tranche === 'plus60') { if (!((v.jours || 0) > 60) || estEchange(v) || (v.jours || 0) >= FANTOME_J) return false; }
      else if (f.tranche) { var t = tranche(v.jours); if (!t || t.id !== f.tranche) return false; }
      if (f.modele && v.modele !== f.modele) return false;
      if (f.version && v.version !== f.version) return false;
      if (f.statut && String(v.statutLibelle || '').toUpperCase() !== f.statut) return false;
      if (f.annee === 'ancienne') { if (!(Number(v.annee) && Number(v.annee) < anneeMax)) return false; }
      else if (f.annee && String(v.annee) !== f.annee) return false;
      if (f.emplacement && v.emplacement !== f.emplacement) return false;
      if (q && [v.vin, v.stock, v.modele, v.version, v.couleur, v.annee, v.modelNum, v.emplacement].join(' ').toUpperCase().indexOf(q) < 0) return false;
      return true;
    });
  };

  VueNeufs.prototype.rendreTable = function () {
    var self = this, d = this.donnees;
    AMX.vider(this.elTable);
    if (!d) return;
    var lignes = this.filtrees();
    var tri = this.tri;
    var valeur = function (v) {
      switch (tri.cle) {
        case 'jours': return v.jours === null || v.jours === undefined ? -1 : v.jours;
        case 'vehicule': return nomVehicule(v);
        case 'couleur': return v.couleur || '';
        case 'emplacement': return v.emplacement || '';
        case 'statut': return statutDms(v).libelle;
        case 'recuLe': return v.recuLe || '';
        case 'cout': return v.coutFacture || 0;
        case 'detention': return v.coutDetention || 0;
        case 'stock': return v.stock || '';
        default: return v.jours || 0;
      }
    };
    lignes.sort(function (a, b) { var x = valeur(a), y = valeur(b); var r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'fr'); return tri.desc ? -r : r; });
    this.elCompte.textContent = lignes.length + ' véhicule' + (lignes.length > 1 ? 's' : '');
    var th = function (cle, texte, num) {
      var el = h('th.tri' + (num ? '.num' : '') + (tri.cle === cle ? '.actif' : ''), { text: texte + (tri.cle === cle ? (tri.desc ? ' ↓' : ' ↑') : '') });
      el.addEventListener('click', function () { if (tri.cle === cle) tri.desc = !tri.desc; else { tri.cle = cle; tri.desc = cle === 'jours' || cle === 'cout' || cle === 'detention'; } AMX.memo.ecrire('neufs_tri', tri); self.rendreTable(); });
      return el;
    };
    var entete = h('tr', [th('stock', '# Stock'), th('vehicule', 'Véhicule'), th('couleur', 'Couleur'), th('emplacement', 'Emplacement'), th('statut', 'Statut'), th('recuLe', 'Reçu le'), th('jours', 'Jours', true)].concat(d.montants ? [th('cout', 'Coût facture', true), th('detention', 'Détention', true)] : []));
    var corps = h('tbody');
    if (!lignes.length) corps.appendChild(h('tr', [h('td', { colspan: d.montants ? 9 : 7 }, [h('div.neufs-vide', { text: 'Aucun véhicule neuf ne correspond.' })])]));
    lignes.forEach(function (v) {
      var t = tranche(v.jours), s = statutDms(v);
      var tr = h('tr.rangee' + (v.enStock ? '' : '.sorti'), [
        h('td', { text: v.stock || '—' }),
        h('td.vehicule', [h('div.nom', { text: nomVehicule(v) }), h('div.vin', { text: v.vin + (v.modelNum ? ' · ' + v.modelNum : '') })]),
        h('td', { text: v.couleur || '—' }),
        h('td', { text: v.emplacement || '—' }),
        h('td', [v.enStock ? h('span.badge.' + s.couleur, { text: s.libelle }) : h('span.badge.gris', { text: 'Sorti le ' + AMX.fmtDateCourte(v.sortiLe) })]),
        h('td', { text: v.recuLe ? AMX.fmtDate(v.recuLe) : '—' }),
        h('td.num', [t ? h('span.badge.' + t.couleur + '.sans-point', { text: fmtJours(v.jours) }) : h('span', '—')])
      ].concat(d.montants ? [h('td.num', { text: v.coutFacture ? AMX.fmtArgent(v.coutFacture) : '—' }), h('td.num', { text: v.coutDetention ? AMX.fmtArgent(v.coutDetention) : '—' })] : []));
      tr.addEventListener('click', function () { self.ouvrir(v); });
      corps.appendChild(tr);
    });
    this.elTable.appendChild(h('table.tableau', [h('thead', [entete]), corps]));
  };

  VueNeufs.prototype.ouvrir = function (v) {
    var d = this.donnees || {}, t = tranche(v.jours), s = statutDms(v), x = v.extra || {};
    var dl = function (paires) { return h('dl', paires.filter(function (p) { return p[1] !== '' && p[1] !== null && p[1] !== undefined; }).map(function (p) { return [h('dt', { text: p[0] }), h('dd', { text: String(p[1]) })]; })); };
    var mouv = (d.mouvements || []).filter(function (m) { return m.vin === v.vin; }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    var gauche = h('div', [
      h('h4', 'Véhicule'),
      dl([['NIV', v.vin], ['# Stock', v.stock], ['Code modèle', v.modelNum], ['Série', x.serie], ['Carrosserie', v.carrosserie === 'T' ? 'Camion / VUS' : (v.carrosserie === 'C' ? 'Auto' : '')], ['Groupe', x.groupe], ['Couleur', v.couleur + (v.couleurCode ? ' (' + v.couleurCode + ')' : '')], ['Intérieur', v.couleurInt], ['Moteur', x.moteur], ['Cylindres', x.cylindres], ['Transmission', x.transmission], ['Carburant', x.carburant], ['Km', v.km !== null && v.km !== undefined ? AMX.fmtNombre(v.km) + ' km' : '']]),
      h('h4', 'Au DMS'),
      dl([['Statut', s.libelle + (v.statut ? ' (' + v.statut + ')' : '')], ['Emplacement', v.emplacement], ['Reçu le', v.recuLe ? AMX.fmtDate(v.recuLe) : ''], ['Jours en stock', fmtJours(v.jours)], ['Sorti le', v.sortiLe ? AMX.fmtDate(v.sortiLe) : ''], ['Mémo', v.memo], ['Vu dans le feed', (v.premiereVue ? 'du ' + AMX.fmtDate(v.premiereVue) : '') + (v.derniereVue ? ' au ' + AMX.fmtDate(v.derniereVue, true) : '')]]),
      (v.options || []).length || (v.ensembles || []).length ? h('h4', 'Options et ensembles') : null,
      (v.options || []).length || (v.ensembles || []).length ? h('div.neufs-options', (v.ensembles || []).map(function (o) { return h('span', { text: 'Ensemble ' + o }); }).concat((v.options || []).map(function (o) { return h('span', { text: o }); }))) : null,
      (x.accessoiresUsine || []).length ? h('h4', 'Accessoires d\'usine') : null,
      (x.accessoiresUsine || []).length ? h('div.neufs-options', x.accessoiresUsine.map(function (o) { return h('span', { text: o }); })) : null,
      (x.accessoiresConc || []).length ? h('h4', 'Accessoires concessionnaire') : null,
      (x.accessoiresConc || []).length ? h('div.neufs-options', x.accessoiresConc.map(function (o) { return h('span', { text: o }); })) : null
    ]);
    var droite = h('div', [
      h('h4', 'Vieillissement'),
      h('div', [t ? h('span.badge.' + t.couleur, { text: t.libelle + ' — ' + fmtJours(v.jours) }) : h('span.doux', '—')]),
      d.montants ? h('h4', 'Coûts') : null,
      d.montants ? h('div.neufs-prix', [
        h('div.tuile', [h('div.l', 'Coût facture'), h('div.v', { text: v.coutFacture ? AMX.fmtArgent(v.coutFacture) : '—' })]),
        h('div.tuile', [h('div.l', 'Coût calculé'), h('div.v', { text: v.coutCalc ? AMX.fmtArgent(v.coutCalc) : '—' })]),
        h('div.tuile', [h('div.l', 'Holdback'), h('div.v', { text: v.holdback ? AMX.fmtArgent(v.holdback) : '—' })]),
        h('div.tuile', [h('div.l', 'PDI'), h('div.v', { text: v.pdi ? AMX.fmtArgent(v.pdi) : '—' })]),
        h('div.tuile', [h('div.l', 'Frais de vente'), h('div.v', { text: v.coutVente ? AMX.fmtArgent(v.coutVente) : '—' })]),
        h('div.tuile', [h('div.l', 'Détention (' + ((d.parametres || {}).tauxPlan || 5) + ' %)'), h('div.v', { text: v.coutDetention ? AMX.fmtArgent(v.coutDetention) : '—' })])
      ]) : null,
      v.prix ? h('p', { text: 'Prix affiché au DMS : ' + AMX.fmtArgent(v.prix) }) : null,
      h('h4', 'Mouvements'),
      mouv.length ? h('ul', { style: { margin: 0, paddingLeft: '16px', fontSize: '12.5px' } }, mouv.map(function (m) { return h('li', { text: AMX.fmtDate(m.date) + ' — ' + ({ initial: 'premier feed', arrivee: 'arrivée', sortie: 'sortie' + (m.jours !== null && m.jours !== undefined ? ' après ' + fmtJours(m.jours) : ''), retour: 'retour' }[m.type] || m.type) }); })) : h('p.doux.petit', 'aucun mouvement enregistré')
    ]);
    var self = this;
    var boutons = [];
    if (d.gererExclus) boutons.push({ texte: 'Retirer du suivi', classe: 'danger fantome', action: function (fermer) { fermer(); self.exclure(v); return false; } });
    boutons.push({ texte: 'Fermer', action: function (fermer) { fermer(); } });
    AMX.modale({ titre: nomVehicule(v) + (v.stock ? ' — # ' + v.stock : ''), corps: h('div.neufs-fiche', [gauche, droite]), large: true, boutons: boutons });
  };

  VueNeufs.prototype.exporter = function () {
    var d = this.donnees || {}, lignes = this.filtrees();
    if (!lignes.length) { AMX.toast('Aucun véhicule à exporter.', 'attention'); return; }
    if (typeof XLSX === 'undefined') { AMX.toast('La bibliothèque Excel n\'est pas encore chargée. Réessayez.', 'erreur'); return; }
    var rows = lignes.map(function (v) {
      var r = { 'Concession': nomCie(v.compagnie), '# Stock': v.stock, 'NIV': v.vin, 'Année': v.annee, 'Marque': v.marque, 'Modèle': v.modele, 'Code modèle': v.modelNum, 'Version': v.version, 'Couleur': v.couleur, 'Code couleur': v.couleurCode, 'Intérieur': v.couleurInt, 'Km': v.km, 'Emplacement': v.emplacement, 'Statut': statutDms(v).libelle, 'Reçu le': v.recuLe, 'Jours': v.jours, 'Tranche': (tranche(v.jours) || {}).libelle || '', 'Sorti le': v.sortiLe, 'Options': (v.options || []).join(', '), 'Ensembles': (v.ensembles || []).join(', '), 'Mémo': v.memo };
      if (d.montants) { r['Coût facture'] = v.coutFacture; r['Coût calculé'] = v.coutCalc; r['Holdback'] = v.holdback; r['PDI'] = v.pdi; r['Frais de vente'] = v.coutVente; r['Coût de détention'] = v.coutDetention; }
      return r;
    });
    var g = groupes(this.visibles(), this.mouvements());
    var rows2 = [];
    g.modeles.forEach(function (m) { rows2.push({ 'Modèle': m.modele, 'Version': '(total)', 'En stock': m.enStock, 'Sorties 90 j': m.sorties, 'Jours d\'appro': m.appro, 'Âge moyen': m.ageMoyen }); m.versions.forEach(function (v) { rows2.push({ 'Modèle': m.modele, 'Version': v.version, 'En stock': v.enStock, 'Sorties 90 j': v.sorties, 'Jours d\'appro': v.appro, 'Âge moyen': v.ageMoyen }); }); });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Neufs');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows2), 'Par modèle');
    XLSX.writeFile(wb, 'neufs-' + (this.compagnie || 'groupe').toLowerCase() + '-' + new Date().toISOString().slice(0, 10) + '.xlsx');
    AMX.toast('Export Excel — ' + lignes.length + ' véhicule' + (lignes.length > 1 ? 's' : ''), 'ok');
  };
})();
