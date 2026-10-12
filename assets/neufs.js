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
  var STATUTS_DMS = { 'EN-INVENT.': ['En stock', 'vert'], 'DEMO': ['Démo', 'violet'], 'ECH. CONC.': ['Échange concessionnaire', 'orange'], 'TRANSIT': ['En transit', 'bleu'], 'VENDU': ['Vendu', 'jaune'], 'COMMANDE': ['Commandé', 'bleu'] };   /* Maxime, 11 oct. : « il faut voir le statut échange en orange » */
  // (10 oct.) Portails des constructeurs : le signet « Automax ← Hyundai » (chargeur généré par mock/signet-build.py — ne jamais
  // éditer la constante à la main) lit le pipeline, les ventes déclarées (RDR) et les factures du portail des ventes Hyundai, et
  // le CSI sur BoostCX. Le stock atterrit ici (feuille Neufs, source portail-hyundai) ; ventes et commandes via ?constructeur=1.
  var CODE_SIGNET_CONSTRUCTEUR = "javascript:(function () { var s = document.createElement('script'); s.src = " + JSON.stringify(AMX.SITE) + " + 'assets/signet-constructeur.js?t=' + Date.now(); s.onerror = function () { alert(\"Impossible de charger le signet depuis le site d'inventaire (groupeautomax.github.io). V\u00e9rifiez votre connexion, puis recliquez.\"); }; document.body.appendChild(s); })();";
  // Un seul favori « Automax ← Constructeur » pour tous les portails (reconnu à l'adresse de la page).
  var PORTAILS = {
    HYUNDAI: { nom: 'Portail Hyundai', source: 'hyundai', url: 'https://salesportal-hacc.am.hyundai-corp.io/salesportal/index.html#/dealerstocklist', nomCsi: 'CSI (BoostCX)', csi: 'https://hacc.boostcx.com/bcx/dashboard/combined', liste: 'Stock › Dealer Stock List', signet: function () { return CODE_SIGNET_CONSTRUCTEUR; } },
    STM: { nom: 'Portail GM (utilitaire des commandes)', source: 'gm', url: 'https://owb.vsp.autopartners.net/ui/manage-inventory/view-inventory/preliminary', nomCsi: 'ISC (InMoment)', csi: 'https://field-reporting.inmoment.com/program/clt3hf6a4u9r91e88k56m1b7z/report/272998', liste: 'Gestion des stocks › Afficher l\'inventaire et les commandes', signet: function () { return CODE_SIGNET_CONSTRUCTEUR; } },
    HAWKS: { nom: 'Portail GM (utilitaire des commandes)', source: 'gm', url: 'https://owb.vsp.autopartners.net/ui/manage-inventory/view-inventory/preliminary', nomCsi: 'ISC (InMoment)', csi: 'https://field-reporting.inmoment.com/program/clt3hf6a4u9r91e88k56m1b7z/report/272998', liste: 'Gestion des stocks › Afficher l\'inventaire et les commandes', signet: function () { return CODE_SIGNET_CONSTRUCTEUR; } },
    // (11 oct.) BMW : le portail RDR (S-Gate › Sales › Retail Reporting) — RDR 12 mois, RDR à compléter, objectifs, crédits. Le stock
    // BMW est dans IVS-R Ordering (autre portail, profil de Maxime en erreur le 11 oct.) : à brancher quand il répondra.
    BMW: { nom: 'Portail RDR BMW (Retail Reporting)', source: 'bmw', url: 'https://salesreporting.bmwgroup.ca/RDR', nomCsi: '', csi: '', liste: 'RDR › RDR List', signet: function () { return CODE_SIGNET_CONSTRUCTEUR; } }
  };
  /* Ventes déclarées « neuves » : chez BMW, le portail RDR déclare aussi les usagés / certifiés (U), les changements de propriétaire (P)
     et le wholesale (W) — ils comptent dans le tableau BMW, pas dans les ventes de neufs. */
  function venteNeuve(v) { return !(String((v && v.source) || '') === 'bmw' && /^[UPW]$/.test(String((v && v.typeCode) || '').toUpperCase())); }
  var RDR_TYPES_BMW = { N: 'Neuf', D: 'Démo', U: 'Usagé / certifié', P: 'Changement de propriétaire', W: 'Wholesale' };
  /* (11 oct., Maxime : « très important : les inventaires que tu prends des sites de constructeur sont différents des inventaires
     que tu as avec des fichiers ou des Google Sheets — fais la distinction, on va vouloir les comparer et demander les
     différences ») : deux ORIGINES jamais mélangées — « dms » (export du DMS, fichier, feuille Google) et « constructeur »
     (portail lu par le favori). La page montre une origine à la fois (sélecteur) et l'onglet Écarts compare les deux. */
  var ORIGINES = { dms: 'DMS / fichier', constructeur: 'Manufacturier' };   /* Maxime, 11 oct. : « le choix DMS et manufacturier » */
  var ORIGINES_LONG = { dms: 'DMS / fichier', constructeur: 'manufacturier (portail)' };
  function origineDe(v) { if (v && v.origine) return v.origine; return /^portail-/i.test(String((v && v.source) || '')) ? 'constructeur' : 'dms'; }
  function statutNorme(v) { var s = String((v && v.statutLibelle) || (v && v.statut) || '').toUpperCase(); if (/TRANSIT/.test(s)) return 'En transit'; if (/DEMO|DÉMO|COURTOISIE/.test(s)) return 'Démo / courtoisie'; if (/ECH/.test(s)) return 'Échange concessionnaire'; return 'En stock'; }
  /* Marquage interne (Maxime, 11 oct.) : « on utilise un fichier Google […] il faut indiquer quand le NIV est exportable
     […] ça doit être très clair quand les véhicules sont disponibles ou non » ; « jaune vendu, vert pré-enregistré (non
     vendu) ». Remplace la feuille « INVENTAIRE HAWKS ET STMARIE » (Status Vendu / Trade / Démo / LIVRÉ, Vendeur, Client,
     Localisation, PUNCH oui / non, livraison, notes) : les conseillers marquent ici, le jour même, sans attendre Global Connect. */
  var MARQUES = { vendu: ['Vendu', 'jaune'], echange: ['Échangé', 'orange'], demo: ['Démo', 'bleu'], livre: ['Livré', 'gris'] };
  var MARQUES_ORDRE = ['vendu', 'echange', 'demo', 'livre'];
  var RAISONS = { sorti: 'Sorti', vendu: 'Vendu', echange: 'Échangé', demo: 'Démo', livre: 'Livré', 'vendu-dms': 'Vendu au DMS', 'demo-dms': 'Démo au DMS', 'echange-dms': 'Échange conc. au DMS', 'vendu-constructeur': 'Vendu (manufacturier)', 'demo-constructeur': 'Démo déclarée (CTP)' };
  var EXPORTABLES = { oui: 'Exportable', non: 'Non exportable' };
  /* Menu de notes (Maxime, 11 oct. soir) : « Tire hiver · Vitre teintée · Tag / domino · À body shop · Recall » — plusieurs à la fois. */
  var ETIQUETTES = { pneus: 'Tires hiver', vitres: 'Vitres teintées', tag: 'Tag / Domino', bodyshop: 'À body shop', recall: 'Recall' };
  var ETIQUETTES_ORDRE = ['pneus', 'vitres', 'tag', 'bodyshop', 'recall'];
  function etiquettesDe(v) { var m = marquageDe(v); var e = m && m.etiquettes; if (!e) return []; if (typeof e === 'string') e = e.split(','); return ETIQUETTES_ORDRE.filter(function (k) { return e.indexOf(k) >= 0; }); }
  /* Km (Maxime : « ajoute le km ; si tu ne le vois pas, indique 25, et permets qu'on l'indique nous-mêmes ») : celui marqué par l'équipe, sinon le DMS, sinon 25. */
  var KM_DEFAUT = 25;
  function kmDe(v) {
    var m = marquageDe(v);
    if (m && m.km !== null && m.km !== undefined && m.km !== '') return { km: Number(m.km), source: 'marquage' };
    if (v.km !== null && v.km !== undefined && v.km !== '' && isFinite(Number(v.km))) return { km: Math.round(Number(v.km)), source: 'dms' };
    return { km: KM_DEFAUT, source: 'defaut' };
  }
  var KM_SOURCES = { marquage: 'indiqué par l\'équipe', dms: 'du DMS / portail', defaut: 'par défaut (non lu)' };
  /* PDSF : le portail GM donne msrp (PDSF) et msrpWithDfc (PDSF + transport) → prix ; extra.pdsf, extra.transport. */
  function pdsfDe(v) { var x = v.extra || {}; var pdsf = x.pdsf !== undefined && x.pdsf !== null && x.pdsf !== '' ? Number(x.pdsf) : null; var total = v.prix ? Number(v.prix) : null; if (total === null && pdsf !== null) total = pdsf + (Number(x.transport) || 0); return { pdsf: pdsf, transport: x.transport ? Number(x.transport) : null, total: total }; }
  /* Moteur (Maxime : « il faut voir le type de moteur 5,3, 6,2, 2,7, 3L… ») : le serveur le décode (v.moteur) ; sinon ici, des codes RPO GM. */
  var MOTEURS_GM = { L3B: '2.7L Turbo', L84: '5.3L V8', L87: '6.2L V8', LZ0: '3.0L Duramax', LM2: '3.0L Duramax', L8T: '6.6L V8', L5P: '6.6L Duramax', LT2: '6.2L V8', LT4: '6.2L V8 suralimenté', LT6: '5.5L V8', LT7: '5.5L V8 biturbo', LIH: '1.2L Turbo', L3T: '1.3L Turbo', LSY: '2.0L Turbo', LTG: '2.0L Turbo', LK0: '2.5L Turbo', LSD: '1.5L Turbo', LYX: '1.5L Turbo', LGX: '3.6L V6', LGY: '3.0L V6 biturbo', LFV: '1.5L Turbo', L96: '6.0L V8', LV3: '4.3L V6', L82: '5.3L V8', L8B: '5.3L V8', LV1: '4.3L V6', L83: '5.3L V8', L86: '6.2L V8' };
  function moteurDe(v) {
    if (v.moteur) return String(v.moteur);
    var x = v.extra || {};
    if (x.moteur) return String(x.moteur);
    var opts = String(x.options || '').toUpperCase().split(/[\s,;]+/);
    for (var i = 0; i < opts.length; i++) if (MOTEURS_GM[opts[i]]) return MOTEURS_GM[opts[i]];
    var nom = (String(v.modele || '') + ' ' + String(v.version || '')).toUpperCase();
    if (/\bEV\b|LYRIQ|OPTIQ|VISTIQ|ESCALADE IQ|HUMMER|\bBOLT\b|ID\.|\bIX\b|\bI[3457]\b|IONIQ|ELECTRIQUE|ÉLECTRIQUE/.test(nom)) return 'EV';
    return '';
  }
  /* Lien avec le système de commande (Maxime : « indique si le statut est vendu chez le manufacturier ») : étape « Livré au client » /
     « Retailed », commande vendue (SRE), ou RDR déclaré au portail pour ce NIV (rdrParVin, rempli quand le portail est chargé). */
  var rdrParVin = {};
  function indexerRdr(p) { rdrParVin = {}; ((p && p.ventes) || []).forEach(function (x) { if (x && x.vin) { var k = String(x.compagnie || '').toUpperCase() + '|' + String(x.vin).toUpperCase(); if (!rdrParVin[k] || String(x.dateVente || '') > String(rdrParVin[k].dateVente || '')) rdrParVin[k] = x; } }); }
  function rdrDe(v) { return rdrParVin[String(v.compagnie || '').toUpperCase() + '|' + String(v.vin || '').toUpperCase()] || null; }
  function rdrDemo(r) { return !!r && /courtesy|courtoisie|demo|démo|ctp|\bD\b/i.test(String(r.typeVente || '') + ' ' + String(r.typeCode || '')); }
  function venduConstructeur(v) {
    if (v.venduConstructeur) return true;
    var x = v.extra || {};
    if (/livr[ée]e? au client|retailed/i.test(String(x.etape || ''))) return true;
    if (/^S(RE|FL)$/i.test(String(x.typeCommande || ''))) return true;
    var r = rdrDe(v); return !!(r && !rdrDemo(r));
  }
  function commandeTexte(v) { var x = v.extra || {}; return [x.typeCommande ? 'Commande ' + x.typeCommande + (x.typeCommande === 'SRE' ? ' (vendue)' : '') : '', x.commande ? '# ' + x.commande : '', x.etape || ''].filter(Boolean).join(' · '); }
  var LOCALISATIONS_DEFAUT = ['Showroom', 'STE', 'Lacolle', 'Dorais', '320'];   /* la feuille de Hawks / STM */
  function marquageDe(v) { var m = v && v.marquage; return (m && (m.statut || m.punch || m.exportable || m.vendeur || m.client || m.livraison || m.localisation || m.note)) ? m : null; }
  function estPunch(v) { var m = marquageDe(v); return !!(m && m.punch === 'oui'); }
  /* Couleur de la rangée : le statut marqué (jaune / orange / bleu / gris), sinon vert si pré-enregistré et pas vendu. */
  /* Emplacement lisible (Maxime : « indique Stock plutôt que Livré au concessionnaire ») : les étapes du portail en court. */
  var EMPLACEMENTS_COURTS = [[/livr[ée]e? au concessionnaire/i, 'Stock'], [/livr[ée]e? au client/i, 'Livré au client'], [/d[ée]chargement .* rampe ferroviaire|rampe ferroviaire/i, 'Rampe ferroviaire'], [/livraison interm[ée]diaire/i, 'Livraison interm.'], [/^produit$/i, 'Produit (usine)'], [/^exp[ée]di[ée]e?$/i, 'Expédié'], [/^au quai$/i, 'Au quai']];
  function emplacementTexte(e) { e = String(e || '').trim(); if (!e) return ''; for (var i = 0; i < EMPLACEMENTS_COURTS.length; i++) if (EMPLACEMENTS_COURTS[i][0].test(e)) return EMPLACEMENTS_COURTS[i][1]; return e; }
  function couleurRangee(v) { if (!v.enStock) return ''; var m = marquageDe(v); if (m && MARQUES[m.statut]) return m.statut; var c = categorieIndispo(v); if (MARQUES[c]) return c; return m && m.punch === 'oui' ? 'punch' : ''; }
  /* Résumé d'une ligne de marquage : « Sam · Tremblay · livraison 18 oct. · Showroom » */
  function resumeMarquage(m) { if (!m) return ''; return [m.vendeur, m.client, m.livraison ? 'livraison ' + AMX.fmtDateCourte(m.livraison) : '', m.localisation].filter(Boolean).join(' · '); }
  /* Pourquoi pas disponible : '' = disponible ; le marquage interne prime, sinon ce que le DMS / portail dit (vendu, démo, échange) ; en transit reste disponible. */
  function raisonIndispo(v) {
    if (!v || !v.enStock) return 'sorti';
    var m = marquageDe(v); if (m && MARQUES[m.statut]) return m.statut;
    var s = String(v.statutLibelle || v.statut || '').toUpperCase();
    if (/VENDU|SOLD/.test(s) || (v.extra || {}).venduNonLivre) return 'vendu-dms';
    if (venduConstructeur(v)) return 'vendu-constructeur';
    if (/DEMO|DÉMO|COURTOISIE/.test(s)) return 'demo-dms';
    var r = rdrDe(v); if (r && rdrDemo(r)) return 'demo-constructeur';
    if (/ECH/.test(s)) return 'echange-dms';
    return '';
  }
  function estDisponible(v) { return raisonIndispo(v) === ''; }
  function categorieIndispo(v) { return raisonIndispo(v).replace(/-(dms|constructeur)$/, ''); }   /* vendu | echange | demo | livre | sorti | '' */
  function estExportable(v) { var m = marquageDe(v); return m ? (m.exportable || '') : ''; }
  function couleurRaison(r) { r = String(r || '').replace(/-(dms|constructeur)$/, ''); return MARQUES[r] ? MARQUES[r][1] : 'gris'; }
  function pucePunch(v) { var m = marquageDe(v); return m && m.punch === 'oui' ? h('span.neufs-marq-chip.vert', { text: 'Pré-enregistré', title: 'Punché / pré-enregistré chez le constructeur, pas vendu à un client' }) : null; }
  function puceRaison(v) { var m = marquageDe(v); var out = []; if (m && MARQUES[m.statut]) out.push(h('span.neufs-marq-chip.' + MARQUES[m.statut][1], { text: MARQUES[m.statut][0] })); var pp = pucePunch(v); if (pp) out.push(pp); return out; }
  function pucesEtiquettes(v) { return etiquettesDe(v).map(function (k) { return h('span.neufs-etiq', { text: ETIQUETTES[k], 'data-etiquette': k }); }); }
  /* Puce « manufacturier » : commande vendue (SRE), étape Livré au client, RDR déclaré — le lien avec le système de commande. */
  function puceConstructeur(v, court) {
    var x = v.extra || {}, rd = rdrDe(v), out = [];
    if (/^SRE$/i.test(String(x.typeCommande || ''))) out.push(h('span.neufs-marq-chip.jaune', { text: court ? 'Commande vendue' : 'Commande vendue (SRE)', title: 'Commande client (SRE) au portail du manufacturier' + (x.commande ? ' · # ' + x.commande : '') }));
    if (!court && /livr[ée]e? au client|retailed/i.test(String(x.etape || ''))) out.push(h('span.neufs-marq-chip.jaune', { text: x.etape, title: 'Étape au portail du manufacturier' }));
    if (rd) out.push(h('span.neufs-marq-chip.' + (rdrDemo(rd) ? 'bleu' : 'jaune'), { text: 'RDR ' + AMX.fmtDateCourte(rd.dateVente) + (rdrDemo(rd) ? ' (démo)' : ''), title: 'Vente déclarée au manufacturier le ' + AMX.fmtDate(rd.dateVente) + (rd.typeVente ? ' · ' + rd.typeVente : '') + (rd.client ? ' · ' + rd.client : '') }));
    return out;
  }
  /* 12 oct. (Maxime) : le droit « Neufs — responsable de la feuille » (neufsFeuille : admin et gestionnaire d'office, à cocher pour un
     utilisateur) décide qui peut marquer ; le serveur le dit aussi (marquage.peutMarquer). Session sans ce droit (ancien script) : comme avant. */
  function peutMarquer() { var d = AMX.neufs.enCache(); if (d && d.marquage && d.marquage.peutMarquer === false) return false; var p = AMX.session && AMX.session.perms; if (p && p.neufsFeuille !== undefined) return !!p.neufsFeuille; return AMX.perm('consulter') || AMX.perm('ficheAchat') || AMX.perm('changerStatut') || AMX.estAdmin(); }
  /* Pastille « Disponible » / « Vendu » / « Échangé » / « Démo » / « Vendu au DMS »… : la réponse claire, en un coup d'œil. */
  function pastilleDispo(v, grande) {
    var r = raisonIndispo(v);
    if (!r) return h('span.dispo.oui' + (grande ? '.grande' : ''), { title: 'En stock, ni vendu, ni échangé, ni démo : à vendre maintenant' }, [h('i', { text: '✓' }), h('span', { text: 'Disponible' })]);
    var m = marquageDe(v), rd = rdrDe(v);
    var titre = MARQUES[r] ? 'Marqué « ' + MARQUES[r][0] + ' » par l\'équipe' + (m && m.par ? ' (' + m.par + ')' : '') : (r === 'sorti' ? 'Disparu du feed' : (/constructeur$/.test(r) ? 'Chez le manufacturier : ' + [commandeTexte(v), rd ? 'RDR du ' + AMX.fmtDate(rd.dateVente) + (rd.typeVente ? ' (' + rd.typeVente + ')' : '') : ''].filter(Boolean).join(' · ') : 'Ce que le DMS / le portail indique'));
    return h('span.dispo.non.' + couleurRaison(r) + (grande ? '.grande' : ''), { title: titre }, [h('i', { text: '✕' }), h('span', { text: RAISONS[r] || r })]);
  }
  function puceExportable(v) { var e = estExportable(v); return e ? h('span.badge.sans-point.' + (e === 'oui' ? 'sarcelle' : 'gris'), { text: EXPORTABLES[e], title: e === 'oui' ? 'Le NIV peut être exporté' : 'Le NIV ne doit pas être exporté' }) : null; }
  var ONGLETS_NEUFS = ['liste', 'commandes', 'ventes', 'ecarts', 'absents', 'echanges', 'analyse'];   /* absents (12 oct.) : au DMS / sur la feuille, absents du manufacturier ; echanges (12 oct.) : demandes d'échange entre concessions par texto */
  var MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  function libMois(p) { var m = /^(\d{4})-(\d{2})/.exec(String(p || '')); return m ? MOIS_FR[Number(m[2]) - 1] + ' ' + m[1] : String(p || '—'); }
  function peutImporterPortail() { return !!(AMX.perm('ficheAchat') || AMX.perm('changerStatut') || AMX.perm('gererUtilisateurs') || AMX.estAdmin()); }
  /* Détail ou flotte (Maxime, 10 oct. : « une unité FNR veut dire flotte, il faut les séparer en flotte et détail pour GM »).
     Stock GM : le type de commande du portail (extra.typeCommande) — TRE / SRE = détail, FNR / FCN… (F…) = flotte ; les
     unités sans type (feed DMS, Hyundai) comptent au détail. Ventes déclarées GM : les livraisons « parcs » (codes 035, 038). */
  function typeUnite(v) { var tc = String(((v && v.extra) || {}).typeCommande || '').toUpperCase(); return tc ? (/^F/.test(tc) ? 'flotte' : 'detail') : ''; }
  function estFlotte(v) { return typeUnite(v) === 'flotte'; }
  function commandeAttente(c) { return String((c && c.etat) || '') === 'attente'; }   /* RFO (demande d'allocation) : pas encore une commande placée */
  function commandeFlotte(c) { return /^F/.test(String((c && c.typeCommande) || '').toUpperCase()); }
  function venteFlotte(v) { return /parcs|fleet|flotte/i.test(String((v && v.typeVente) || '')) || /^03[58]$/.test(String((v && v.typeCode) || '')); }
  /* Marque normalisée (le portail GM donne « Gmc », NHTSA « CHEVROLET », le DMS « VOLKSWAGEN ») ; pour une commande sans
     marque, le code modèle GM la donne : 1 = Chevrolet (autos), C = Chevrolet (camions), T = GMC, 4 = Buick, 6 = Cadillac. */
  function nomMarque(m) { var x = String(m || '').trim(); if (!x) return ''; var u = x.toUpperCase(); if (u === 'GMC' || u === 'BMW' || u === 'VW') return u; if (u === 'VOLKSWAGEN') return 'Volkswagen'; return u.charAt(0) + u.slice(1).toLowerCase(); }
  function marqueCommande(c) { if (c && c.marque) return nomMarque(c.marque); var m = String((c && c.modelNum) || '').toUpperCase(); if (c && c.source === 'gm' && m) { return { '1': 'Chevrolet', 'C': 'Chevrolet', 'T': 'GMC', '4': 'Buick', '6': 'Cadillac' }[m.charAt(0)] || ''; } return c && c.source === 'hyundai' ? 'Hyundai' : ''; }
  /* Maxime (12 oct.) : « dans Ventes déclarées, le tableau met le nombre par mois, et des détails plus clairs, structurés plus bas ».
     Les types du portail (« Achat d'un particulier », « Loc. entreprise/organisme », « Courtesy Transportation Program »…) sont
     regroupés en familles lisibles ; le type exact reste visible sous la famille dans la liste. */
  var GROUPES_VENTE = ['Détail', 'Entreprise', 'Location', 'Flotte', 'Démo / courtoisie', 'Employé / fournisseur GM', 'Autre'];
  function groupeTypeVente(t) {
    var x = String(t || '');
    if (!x) return '—';
    if (/courtesy|courtoisie|demo|démo|slc|loan/i.test(x)) return 'Démo / courtoisie';
    if (/fleet|flotte|parcs/i.test(x)) return 'Flotte';
    if (/employ|fournisseur|supplier/i.test(x)) return 'Employé / fournisseur GM';
    if (/lease|location|^loc\b|loc\./i.test(x)) return 'Location';
    if (/entreprise|organisme|business|company|commercial/i.test(x)) return 'Entreprise';
    if (/particulier|retail|detail|détail/i.test(x)) return 'Détail';
    return 'Autre';
  }
  var MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  var MOIS_LONGS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  function libelleMois(cle, long) { var m = /^(\d{4})-(\d{2})/.exec(String(cle || '')); if (!m) return String(cle || ''); return (long ? MOIS_LONGS : MOIS_COURTS)[Number(m[2]) - 1] + ' ' + m[1]; }
  function libelleTypeVente(t) { var x = String(t || ''); if (/demo|slc|loan|courtoisie/i.test(x)) return 'Démo / courtoisie'; if (/fleet|flotte|parcs/i.test(x)) return 'Flotte'; if (/lease|location|bail/i.test(x)) return 'Location'; if (/retail|detail|détail/i.test(x)) return 'Détail'; return x || '—'; }

  function tranche(j) { if (j === null || j === undefined || isNaN(j)) return null; for (var i = 0; i < TRANCHES.length; i++) if (j >= TRANCHES[i].min && j <= TRANCHES[i].max) return TRANCHES[i]; return TRANCHES[TRANCHES.length - 1]; }
  function statutDms(v) { var cle = String(v.statutLibelle || '').toUpperCase(); var s = STATUTS_DMS[cle]; if (s) return { libelle: s[0], couleur: s[1] }; if (/TRANSIT/.test(cle)) return { libelle: 'En transit', couleur: 'bleu' }; if (/DEMO|DÉMO/.test(cle)) return { libelle: 'Démo', couleur: 'violet' }; if (/ECH/.test(cle)) return { libelle: 'Échange concessionnaire', couleur: 'orange' }; if (/VENDU|SOLD/.test(cle)) return { libelle: 'Vendu', couleur: 'jaune' }; return { libelle: v.statutLibelle || v.statut || '—', couleur: 'gris' }; }
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
      '.neufs-concessions { margin-bottom: 12px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; } .neufs-concessions .neufs-flotte { margin-left: auto; } .neufs-flotte-badge { margin-left: 6px; font-size: 10.5px; vertical-align: 1px; } .neufs-concessions .choix-cie { flex-direction: row; flex-wrap: wrap; gap: 6px; } .neufs-concessions .choix-cie .choix { width: auto; border-color: var(--bordure); background: var(--carte); border-radius: 999px; padding: 5px 11px 5px 9px; } .neufs-concessions .choix-cie .choix .n { margin-left: 2px; }',
      /* Pipeline : commandées → transit → stock → démos → vendues */
      '.neufs-pipeline .neufs-etapes { display: flex; align-items: stretch; gap: 4px; padding: 10px 12px; overflow-x: auto; } .neufs-etapes .fleche { align-self: center; color: var(--encre-4); font-size: 18px; padding: 0 2px; flex: none; }',
      '.neufs-etape { flex: 1 1 140px; min-width: 130px; text-align: left; background: var(--carte-2); border: 1px solid var(--ligne); border-radius: 10px; padding: 8px 12px; cursor: pointer; font: inherit; color: var(--encre); position: relative; overflow: hidden; } .neufs-etape:hover { border-color: var(--encre-3); }',
      '.neufs-etape::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--ligne-forte); } .neufs-etape.gris::before { background: var(--encre-4); } .neufs-etape.vert::before { background: var(--vert); } .neufs-etape.bleu::before { background: var(--bleu); } .neufs-etape.violet::before { background: var(--violet); } .neufs-etape.sombre::before { background: var(--noir-2); }',
      '@media (max-width: 640px) { .neufs-pipeline .neufs-etapes { flex-wrap: wrap; overflow: visible; } .neufs-etapes .fleche { display: none; } .neufs-etape { flex: 1 1 calc(50% - 4px); min-width: 0; } }',
      '.neufs-etape .n { font-size: 24px; font-weight: 700; line-height: 1.1; } .neufs-etape .nom { font-size: 12px; font-weight: 600; margin-top: 2px; } .neufs-etape .sous { font-size: 11px; color: var(--encre-3); margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      /* Onglets de la page */
      '.neufs-onglets { display: flex; gap: 4px; border-bottom: 1px solid var(--ligne); margin: 2px 0 12px; overflow-x: auto; } .neufs-onglets button { border: 0; border-bottom: 2px solid transparent; background: none; padding: 8px 12px; font: inherit; font-size: 13.5px; color: var(--encre-3); cursor: pointer; display: inline-flex; gap: 6px; align-items: center; white-space: nowrap; margin-bottom: -1px; } .neufs-onglets button b { font-weight: 600; font-size: 12px; color: var(--encre-3); background: var(--gris-bg); border-radius: 999px; padding: 1px 7px; } .neufs-onglets button:hover { color: var(--encre); } .neufs-onglets button.actif { color: var(--vert); border-bottom-color: var(--vert); font-weight: 600; } .neufs-onglets button.actif b { color: var(--vert); background: var(--vert-clair); } .neufs-onglets button b.rouge, .neufs-onglets button.actif b.rouge { color: #fff; background: var(--rouge, #B42318); }',
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
      '.neufs-statuts { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; } .neufs-statuts .etiquette { margin-right: 4px; } .neufs-statuts .sep { width: 1px; height: 22px; background: var(--ligne); margin: 0 6px; }',
      '.neufs-marques { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin: -4px 0 12px; } .neufs-marques .etiquette { margin-right: 4px; }',
      '.neufs-marque { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border: 1px solid var(--bordure); border-radius: 999px; background: var(--carte); color: var(--encre-2); font: inherit; font-size: 12.5px; cursor: pointer; } .neufs-marque:hover { border-color: var(--encre-3); } .neufs-marque b { font-weight: 600; color: var(--encre-3); } .neufs-marque.actif { border-color: var(--encre); color: var(--encre); background: var(--gris-bg); font-weight: 600; } .neufs-marque.actif b { color: var(--encre); }',
      '.neufs-statut { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 11px; border: 1px solid var(--bordure); border-radius: 999px; background: #fff; color: var(--encre); font: inherit; font-size: 13px; cursor: pointer; } .neufs-statut:hover { border-color: var(--encre-3); } .neufs-statut b { font-weight: 700; } .neufs-statut i { width: 8px; height: 8px; border-radius: 50%; background: var(--encre-3); }',
      '.neufs-statut.vert i { background: var(--vert); } .neufs-statut.bleu i { background: var(--bleu); } .neufs-statut.violet i { background: var(--violet); } .neufs-statut.ambre i { background: var(--ambre); } .neufs-statut.gris i { background: var(--encre-3); }',
      '.neufs-statut.actif { border-color: var(--vert); background: var(--vert-clair); box-shadow: 0 0 0 1px var(--vert) inset; }',
      '.neufs-outils { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; } .neufs-outils .recherche { display: flex; align-items: center; gap: 6px; flex: 1 1 200px; } .neufs-outils .recherche svg { width: 16px; height: 16px; color: var(--encre-3); } .neufs-outils .recherche input { flex: 1; height: 32px; } .neufs-outils select { height: 32px; width: auto; } .neufs-outils .compte { margin-left: auto; font-size: 12px; }',
      '.badge.orange { color: #9A4A0B; background: #FDE8D6; border-color: #F5C9A3; } .badge.jaune { color: #5C4600; background: #FFF3B0; border-color: #E8CF5A; }',
      '.neufs-etiq { display: inline-flex; align-items: center; font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 6px; background: #EEF0F3; border: 1px solid #D5D9DF; color: var(--encre-2); margin-right: 4px; margin-top: 2px; }',
      '.neufs-table td.num { white-space: nowrap; } .neufs-table td.num .km-defaut { color: var(--encre-3); font-style: italic; }',
      '.neufs-marquage-form .etiquettes { display: flex; flex-wrap: wrap; gap: 6px; } .neufs-marquage-form .etiquettes button { font: inherit; font-size: 12.5px; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--bordure); background: #fff; cursor: pointer; } .neufs-marquage-form .etiquettes button.actif { background: var(--encre); color: #fff; border-color: var(--encre); }',
      '.neufs-table { overflow-x: auto; } .neufs-table .tableau { width: 100%; table-layout: auto; } .neufs-table td, .neufs-table th { padding: 6px 8px; vertical-align: top; } .neufs-table th { white-space: nowrap; } .neufs-table tr.rangee { cursor: pointer; } .neufs-table tr.rangee:hover td { background: var(--carte-2); }',
      '.neufs-table td.dispo-cell { white-space: nowrap; } .neufs-table td.dispo-cell .sous { margin-top: 3px; } .neufs-table td.dispo-cell .sous .neufs-marq-chip { font-size: 10.5px; padding: 1px 6px; margin-right: 0; margin-top: 2px; } .neufs-table td.note { white-space: normal; min-width: 150px; max-width: 260px; } .neufs-table td.note .details { margin-top: 2px; } .neufs-table td.note .btn.petit { margin: 3px 0 0; display: inline-block; } .neufs-table td.note .badge { margin-right: 4px; }',
      '.neufs-table td.vehicule { min-width: 150px; } .neufs-table td.vehicule .nom { font-weight: 600; } .neufs-table td.vehicule .vin { font-family: var(--mono); font-size: 11px; color: var(--encre-3); }',
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
      '.neufs-ecarts tr.ecart { cursor: pointer; } .neufs-ecarts tr.ecart:hover td { background: var(--gris-bg); }',
      '.neufs-origine { margin: 6px 0 4px; } .neufs-origine button { display: inline-flex; gap: 6px; align-items: center; padding: 5px 12px; font-size: 12.5px; } .neufs-origine button b { font-weight: 600; font-size: 11.5px; color: var(--encre-3); background: var(--gris-bg); border-radius: 999px; padding: 0 7px; } .neufs-origine button.actif b { color: var(--vert); background: var(--vert-clair); } .neufs-origine button.vide:not(.actif) { color: var(--encre-3); opacity: .75; }',
      '.neufs-filtres-ventes { margin-bottom: 10px; }',
      '.neufs-panneau .carte-entete { flex-wrap: wrap; } .neufs-panneau .carte-entete h2 { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; min-width: 0; } .neufs-panneau .carte-entete h2 .sous { font-weight: 400; font-size: 12px; color: var(--encre-3); }',
      '.neufs-portail-grille { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; }',
      '.neufs-portail-grille .tableau { min-width: 0; } .neufs-portail-grille td.num, .neufs-portail-grille th.num { text-align: right; font-variant-numeric: tabular-nums; }',
      '.neufs-mois { display: flex; gap: 4px; align-items: flex-end; height: 72px; margin: 4px 0 2px; } .neufs-mois i { flex: 1; background: var(--vert); border-radius: 3px 3px 0 0; min-height: 2px; position: relative; } .neufs-mois i.actuel { background: var(--bleu); }',
      '.neufs-mois-leg { display: flex; gap: 4px; font-size: 10px; color: var(--encre-3); } .neufs-mois-leg span { flex: 1; text-align: center; }',
      /* Marquage interne : rangées teintées aux couleurs de Maxime (vendu vert, échangé orange, démo bleu), pastille Disponible / Vendu… */
      '.neufs-table tr.marq-vendu td { background: #FFF3B0; } .neufs-table tr.marq-echange td { background: #FDE8D6; } .neufs-table tr.marq-demo td { background: #DDF0FB; } .neufs-table tr.marq-livre td { background: #ECECEC; color: var(--encre-2); } .neufs-table tr.marq-punch td { background: #DDF7D6; }',
      '.neufs-ventes-mois td, .neufs-ventes-mois th { padding: 5px 8px; } .neufs-ventes-mois tr.actuel td { background: var(--vert-clair); font-weight: 600; } .neufs-ventes-mois tr.vide td { color: var(--encre-3); } .neufs-ventes-mois tr.total td { border-top: 2px solid var(--bordure); font-weight: 600; } .neufs-livraisons tr.groupe td { background: var(--gris-bg); font-size: 12.5px; padding: 7px 10px; border-top: 2px solid var(--bordure); } .neufs-livraisons td.type .petit { font-size: 11px; }',
      '.neufs-table tr.rangee.absent-dms td { background: #FDE2E2; } .neufs-table tr.rangee.absent-dms td:first-child { box-shadow: inset 4px 0 0 #C62828; } .neufs-marq-chip.rouge { color: #8E1B1B; background: #FDE2E2; border-color: #F3B4B4; } .neufs-marq-chip.rouge.grande { font-size: 12.5px; padding: 4px 10px; } .neufs-statut.rouge i { background: #C62828; } .neufs-absent-dms { margin: 0 0 10px; padding: 8px 10px; border-radius: 8px; background: #FDE2E2; color: #8E1B1B; font-size: 12.5px; } .neufs-marq-chip.ambre { color: #7A4B00; background: #FFF1D6; border-color: #F2C879; } .neufs-ecarts tr.absent-manufacturier td:first-child { box-shadow: inset 4px 0 0 #C62828; } .neufs-ecarts tr.sorti-manufacturier td:first-child { box-shadow: inset 4px 0 0 #E0A52A; }',
      '.neufs-table tr.rangee.marq-vendu:hover td { background: #FFEC8F; } .neufs-table tr.rangee.marq-echange:hover td { background: #FBDCC0; } .neufs-table tr.rangee.marq-demo:hover td { background: #CBE7F8; } .neufs-table tr.rangee.marq-livre:hover td { background: #E2E2E2; } .neufs-table tr.rangee.marq-punch:hover td { background: #CDF1C3; } .neufs-table tr.rangee.absent-dms:hover td { background: #FACACA; }',
      '.dispo { display: inline-flex; align-items: center; gap: 5px; font-weight: 700; font-size: 12px; line-height: 1; padding: 5px 10px 5px 8px; border-radius: 999px; border: 1.5px solid; white-space: nowrap; } .dispo i { font-style: normal; font-size: 11px; } .dispo.grande { font-size: 14px; padding: 8px 14px 8px 11px; }',
      '.dispo.oui { color: var(--vert-fonce); background: #fff; border-color: var(--vert); } .dispo.non { color: #fff; } .dispo.non.jaune { color: #3A2D00; background: #F6C700; border-color: #E0B300; } .dispo.non.orange { background: #E8761B; border-color: #E8761B; } .dispo.non.bleu { background: var(--bleu); border-color: var(--bleu); } .dispo.non.gris { background: var(--encre-3); border-color: var(--encre-3); }',
      '.neufs-table td.marquage .btn.petit { margin-left: 4px; } .neufs-table td.marquage .details { font-size: 11.5px; color: var(--encre-2); margin-top: 3px; white-space: normal; max-width: 260px; } .neufs-marq-chip { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 600; padding: 2px 8px; border-radius: 999px; border: 1px solid; margin-right: 4px; } .neufs-marq-chip.vert { color: var(--vert-fonce); background: #DDF7D6; border-color: #A9DE9C; } .neufs-marq-chip.jaune { color: #5C4600; background: #FFF3B0; border-color: #E8CF5A; } .neufs-marq-chip.orange { color: #9A4A0B; background: #FDE8D6; border-color: #F5C9A3; } .neufs-marq-chip.bleu { color: var(--bleu); background: var(--bleu-bg); border-color: var(--bleu-bord); } .neufs-marq-chip.gris { color: var(--encre-2); background: #ECECEC; border-color: #CFCFCF; }',
      '.neufs-statut.dispo-oui i { background: var(--vert-fonce); box-shadow: 0 0 0 2px #fff inset; } .neufs-statut.jaune i { background: #F6C700; } .neufs-statut.orange i { background: #E8761B; } .neufs-statut.sarcelle i { background: var(--sarcelle); }',
      '.neufs-marquage-form label { display: block; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--encre-3); margin: 12px 0 6px; } .neufs-marquage-form label:first-child { margin-top: 0; } .neufs-marquage-form .segment button { padding: 8px 12px; font-size: 13px; font-weight: 600; } .neufs-marquage-form .segment button.actif.jaune { background: #F6C700; color: #3A2D00; } .neufs-marquage-form .segment button.actif.vert { background: var(--vert); color: #fff; } .neufs-marquage-form .segment button.actif.orange { background: #E8761B; color: #fff; } .neufs-marquage-form .segment button.actif.bleu { background: var(--bleu); color: #fff; } .neufs-marquage-form .segment button.actif.gris { background: var(--encre-3); color: #fff; } .neufs-marquage-form .segment button.actif.oui { background: var(--vert-fonce); color: #fff; } .neufs-marquage-form .segment button.actif.non { background: var(--encre-3); color: #fff; } .neufs-marquage-form .apercu { margin: 12px 0 0; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; } .neufs-marquage-form .saisie { width: 100%; } .neufs-marquage-form .grille { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; } @media (max-width: 560px) { .neufs-marquage-form .grille { grid-template-columns: 1fr; } }',
      '.neufs-signet { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin-top: 4px; } .neufs-signet p { margin: 4px 0 8px; font-size: 12.5px; color: var(--encre-2); line-height: 1.5; }',
      '.neufs-echanges .neufs-ech-chip { display: inline-block; font-size: 11.5px; font-weight: 700; padding: 3px 9px; border-radius: 999px; border: 1px solid; white-space: nowrap; } .neufs-ech-chip.en_attente { color: #7A4B00; background: #FFF1D6; border-color: #F2C879; } .neufs-ech-chip.accepte { color: var(--vert-fonce); background: #E3F4E6; border-color: var(--vert); } .neufs-ech-chip.refuse { color: #8E1B1B; background: #FDE2E2; border-color: #F3B4B4; } .neufs-ech-chip.annule { color: var(--encre-3); background: var(--gris-bg); border-color: var(--bordure); } .neufs-echanges td .btn.petit { margin: 2px 4px 2px 0; } .neufs-ech-texto { margin: 10px 0 0; padding: 10px 12px; border-radius: 10px; background: var(--gris-bg); font-size: 12.5px; line-height: 1.5; color: var(--encre-2); white-space: pre-wrap; } .neufs-ech-form label { display: block; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--encre-3); margin: 12px 0 6px; } .neufs-ech-form label:first-child { margin-top: 0; } .neufs-ech-form .grille { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } .neufs-ech-form .saisie, .neufs-ech-form select { width: 100%; } .neufs-ech-veh { padding: 8px 12px; border-radius: 10px; border: 1px solid var(--bordure); font-size: 13px; } .neufs-echanges .neufs-ech-attente td { background: #FFF8E8; } .neufs-echanges td.msg { white-space: normal; max-width: 260px; font-size: 12.5px; color: var(--encre-2); }'
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
    portailEnCache: function () { return cachePortail.donnees; },
    // RDR à compléter chez le constructeur (portail RDR BMW) pour les concessions visibles — tuile de l'accueil.
    aFaireConstructeur: function () { var p = cachePortail.donnees; if (!p || !p.tableaux) return null; var out = []; Object.keys(p.tableaux).forEach(function (c) { var t = p.tableaux[c]; (t.aFaire || []).forEach(function (l) { out.push({ compagnie: c, ligne: l }); }); }); return out; },
    vider: function () { cache.donnees = null; cache.le = 0; cachePortail.donnees = null; },
    // Portails des constructeurs (?constructeur=1) : ventes déclarées, commandes en attente, factures, état des lectures.
    chargerPortail: function (force) {
      if (!force && cachePortail.donnees && Date.now() - cachePortail.le < DUREE_CACHE_MS) return Promise.resolve(cachePortail.donnees);
      if (cachePortail.promesse) return cachePortail.promesse;
      cachePortail.promesse = AMX.get({ constructeur: 1 }).then(function (d) {
        cachePortail.promesse = null;
        if (!d || d.ok === false || d.refuse) throw new Error((d && (d.erreur || d.message)) || 'Réponse inattendue du serveur');
        cachePortail.donnees = d; cachePortail.le = Date.now();
        indexerRdr(d);
        return d;
      }, function (e) { cachePortail.promesse = null; throw e; });
      return cachePortail.promesse;
    },
    // Nombre de neufs en stock de la concession choisie (compteur de l'onglet).
    compteur: function () { var d = cache.donnees; if (!d) return ''; var c = AMX.compagnieChoisie('inventaire'); var def = AMX.neufs.originesDefaut(); return d.vehicules.filter(function (v) { return v.enStock && (!c || v.compagnie === c) && origineDe(v) === def[v.compagnie]; }).length; },
    // Origine par défaut de chaque concession : le DMS / fichier quand il y en a un, sinon le portail du constructeur.
    originesDefaut: function () { var d = cache.donnees, out = {}; if (!d) return out; d.vehicules.forEach(function (v) { if (!v.enStock) return; var o = origineDe(v); if (o === 'dms' || !out[v.compagnie]) out[v.compagnie] = o; }); return out; },
    monter: function (conteneur, ctx) { return new VueNeufs(conteneur, ctx); },
    // Exposés pour les tests et l'app : calculs purs.
    tranche: tranche, groupes: groupes, revue: revue,
    // Marquage interne (11 oct.) : calculs purs partagés (tests, accueil).
    disponible: estDisponible, raisonIndispo: raisonIndispo, MARQUES: MARQUES
  };
  // Section « Neufs » du menu (11 oct.) — à côté de « Usagé » ; la page a ses propres onglets, pas de sous-barre.
  // 11 oct. (Maxime : « un onglet Inventaire, puis Neufs et Usagé ») : plus de section à part — la vue est montée par
  // Inventaire › Neufs (assets/inventaire.js, VueInventaire). L'ancienne adresse #/neufs est redirigée (app.js).
  AMX.neufs.monter = function (conteneur, ctx) { return new VueNeufs(conteneur, ctx); };

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
    this.filtres = { recherche: '', tranche: '', modele: '', version: '', statut: '', annee: '', emplacement: '', sortis: false, ncp: '', dispo: '', moteur: '', etiquette: '' };   /* dispo : '' | dispo | indispo | punch | vendu | echange | demo | livre | exportable */
    this.marque = AMX.memo.lire('neufs_marque', '');   /* filtre de marque (Chevrolet, GMC, Buick, Cadillac…), '' = toutes */
    this.flotte = AMX.memo.lire('neufs_flotte', 'detail'); if (['detail', 'flotte', 'tout'].indexOf(this.flotte) < 0) this.flotte = 'detail';   /* détail par défaut : la flotte fausse les jours d'appro et l'âge */
    this.origine = AMX.memo.lire('neufs_origine', ''); if (['dms', 'constructeur'].indexOf(this.origine) < 0) this.origine = '';   /* '' = l'origine par défaut (DMS s'il y en a un) */
    this.tri = AMX.memo.lire('neufs_tri', { cle: 'jours', desc: true });
    this.construire();
    if (ctx && ctx.params && ctx.params.vin) { this.filtres.recherche = String(ctx.params.vin).toUpperCase(); this.elRecherche.value = this.filtres.recherche; this.vinDemande = true; }
    if (ctx && ctx.params && ONGLETS_NEUFS.indexOf(ctx.params.onglet) >= 0) this.onglet = ctx.params.onglet;   /* #/neufs?onglet=ventes (tuile de l'accueil) */
    this.charger();
    this.surProfil = function () { if (!self.detruit) { self.compagnie = AMX.compagnieChoisie('inventaire'); self.rendre(); } };
    document.addEventListener('amx:profil', this.surProfil);
    document.addEventListener('amx:compagnie', this.surProfil);
  }
  VueNeufs.prototype.demonter = function () { this.detruit = true; this.generation++; document.removeEventListener('amx:profil', this.surProfil); document.removeEventListener('amx:compagnie', this.surProfil); };
  // Même section, nouvelle adresse (ex. recherche globale avec un NIV).
  VueNeufs.prototype.naviguer = function (ctx) {
    if (ctx.params && ctx.params.vin) { this.filtres.recherche = String(ctx.params.vin).toUpperCase(); this.elRecherche.value = this.filtres.recherche; this.vinDemande = true; this.rendre(); }
    if (ctx.params && ONGLETS_NEUFS.indexOf(ctx.params.onglet) >= 0) { if (this.donnees) this.montrer(ctx.params.onglet, { defiler: true }); else this.onglet = ctx.params.onglet; }
  };

  VueNeufs.prototype.construire = function () {
    var self = this;
    this.elEtat = h('p', { text: 'Chargement des neufs…' });
    this.btnRafraichir = h('button.btn', { type: 'button', html: I.rafraichir + '<span>Rafraîchir</span>', onclick: function () { self.charger(true); } });
    this.btnExport = h('button.btn', { type: 'button', html: I.telecharger + '<span>Exporter Excel</span>', onclick: function () { self.exporter(); } });
    this.btnPortail = h('button.btn', { type: 'button', html: I.externe + '<span>Portail du constructeur</span>', title: 'Lire l\'inventaire, les commandes et les ventes déclarées depuis le portail du constructeur (favori à cliquer sur le portail, connecté)', onclick: function () { self.ouvrirSignet(self.compagnie || 'HYUNDAI'); } });
    this.elOrigine = h('div.segment.neufs-origine', { role: 'group', 'aria-label': 'Origine de l\'inventaire', title: 'Deux inventaires distincts, jamais mélangés : l\'export du DMS (fichier ou feuille Google) et le portail du manufacturier (favori) — l\'onglet Écarts les compare' });
    var entete = h('div.entete-page', [h('div', { style: { minWidth: 0 } }, [h('h1', 'Véhicules neufs'), this.elOrigine, this.elEtat]), h('div.actions', [this.btnPortail, this.btnRafraichir, this.btnExport])]);
    this.elChoix = h('div.neufs-concessions');
    this.elMarques = h('div.neufs-marques');
    this.elPipeline = h('div.carte.neufs-pipeline');
    this.elCartes = h('div.neufs-cartes');
    this.elOnglets = h('div.neufs-onglets', { role: 'tablist' });
    // Onglets : Liste · Commandes · Ventes déclarées · Analyse — un seul affiché à la fois (page courte, Maxime 10 oct.)
    this.onglet = AMX.memo.lire('neufs_onglet', 'liste'); if (ONGLETS_NEUFS.indexOf(this.onglet) < 0) this.onglet = 'liste';
    this.elVieillissement = h('div.carte');
    this.elRevue = h('div.carte');
    this.elGroupes = h('div.carte');
    this.elCommandes = h('div.neufs-panneau');
    this.elVentes = h('div.neufs-panneau');
    this.elEcarts = h('div.neufs-panneau');   /* DMS vs constructeur (11 oct.) */
    this.elAbsents = h('div.neufs-panneau');   /* 12 oct. (Maxime : « absent de Global mais dans le DMS, comme onglet ») */
    this.elEchanges = h('div.neufs-panneau');   /* 12 oct. : demandes d'échange entre concessions, par texto */
    this.elRecherche = h('input.saisie', { type: 'search', placeholder: 'NIV, # stock, modèle, version, couleur…', autocomplete: 'off', oninput: AMX.debounce(function (e) { self.filtres.recherche = e.target.value; self.rendreTable(); }, 120) });
    this.selModele = h('select.saisie', { 'aria-label': 'Modèle', onchange: function (e) { self.filtres.modele = e.target.value; self.filtres.version = ''; self.rendreTable(); self.rendreSelects(); } });
    this.selVersion = h('select.saisie', { 'aria-label': 'Version', onchange: function (e) { self.filtres.version = e.target.value; self.rendreTable(); } });
    this.elStatuts = h('div.neufs-statuts', { role: 'group', 'aria-label': 'Statut' });   /* pastilles cliquables avec le compte par statut */
    this.selAnnee = h('select.saisie', { 'aria-label': 'Année-modèle', onchange: function (e) { self.filtres.annee = e.target.value; self.rendreTable(); } });
    this.selEmplacement = h('select.saisie', { 'aria-label': 'Emplacement', onchange: function (e) { self.filtres.emplacement = e.target.value; self.rendreTable(); } });
    this.selMoteur = h('select.saisie', { 'aria-label': 'Moteur', onchange: function (e) { self.filtres.moteur = e.target.value; self.rendreTable(); } });
    this.selEtiquette = h('select.saisie', { 'aria-label': 'Étiquette', title: 'Menu de notes : tires hiver, vitres teintées, Tag / Domino, body shop, recall', onchange: function (e) { self.filtres.etiquette = e.target.value; self.rendreTable(); } });
    this.selNcp = h('select.saisie.cache', { 'aria-label': 'NCP', title: 'Numéro de compte parc (FAN) du client de flotte', onchange: function (e) { self.filtres.ncp = e.target.value; self.rendreTable(); } });   /* flotte GM : visible dès qu'un NCP est connu */
    var caseSortis = h('input', { type: 'checkbox' });
    caseSortis.addEventListener('change', function () { self.filtres.sortis = caseSortis.checked; self.rendreSelects(); self.rendreTable(); });
    this.elCompte = h('span.compte.doux');
    var barre = h('div.carte', [h('div.carte-corps', [this.elStatuts, h('div.neufs-outils', [
      h('div.recherche', [h('span', { html: I.recherche }), this.elRecherche]), this.selModele, this.selVersion, this.selMoteur, this.selAnnee, this.selEmplacement, this.selEtiquette, this.selNcp,
      h('label.case', { title: 'Les véhicules disparus du feed (vendus, livrés, transférés) sont gardés avec leur date de sortie' }, [caseSortis, h('span', 'Inclure les sortis')]), this.elCompte
    ])])]);
    this.elBarre = barre;
    this.elTable = h('div.neufs-table');
    this.elExclus = h('div.neufs-exclus');
    this.elListe = h('div.neufs-panneau', [barre, h('div.carte', [h('div.carte-corps', [this.elTable, this.elExclus])])]);
    this.elAnalyse = h('div.neufs-panneau', [this.elVieillissement, this.elGroupes, this.elRevue]);
    this.el = h('div.page.neufs-page', [entete, this.elChoix, this.elMarques, this.elPipeline, this.elCartes, this.elOnglets, this.elListe, this.elCommandes, this.elVentes, this.elEcarts, this.elAbsents, this.elEchanges, this.elAnalyse]);
    this.conteneur.appendChild(this.el);
  };
  /* Sélecteur Détail · Flotte · Tout (GM seulement : les unités FNR / FCN du portail sont de la flotte). */
  VueNeufs.prototype.rendreFlotte = function () {
    var self = this, ancien = this.elChoix.querySelector('.neufs-flotte');
    if (ancien) ancien.remove();
    if (!this.aFlotte()) return;
    var tous = this.visiblesTous().filter(function (v) { return v.enStock; }), nF = tous.filter(estFlotte).length, nD = tous.length - nF;
    var seg = h('div.segment.neufs-flotte', { role: 'group', 'aria-label': 'Détail ou flotte', title: 'GM : les unités commandées en FNR / FCN sont de la flotte (parcs) ; TRE / SRE, le détail' }, [['detail', 'Détail', nD], ['flotte', 'Flotte', nF], ['tout', 'Tout', tous.length]].map(function (o) {
      return h('button' + (self.flotte === o[0] ? '.actif' : ''), { type: 'button', text: o[1] + ' ' + AMX.fmtNombre(o[2]), onclick: function () { if (self.flotte === o[0]) return; self.flotte = o[0]; AMX.memo.ecrire('neufs_flotte', o[0]); self.filtres.modele = ''; self.filtres.version = ''; self.filtres.statut = ''; self.rendre(); } });
    }));
    this.elChoix.appendChild(seg);
  };
  /* Filtre de marque (Maxime, 11 oct.) : pastilles sous les concessions quand la concession vend plusieurs marques (GM). */
  VueNeufs.prototype.rendreMarques = function () {
    var self = this;
    AMX.vider(this.elMarques);
    var marques = this.marques();
    if (this.marque && !marques.some(function (m) { return m[0] === self.marque; })) marques.push([this.marque, 0]);
    if (marques.length < 2 && !this.marque) return;
    var total = marques.reduce(function (s, m) { return s + m[1]; }, 0);
    var pastille = function (cle, libelle, n) {
      return h('button.neufs-marque' + (self.marque === cle ? '.actif' : ''), { type: 'button', title: cle ? 'Ne montrer que ' + libelle : 'Toutes les marques', onclick: function () { self.marque = self.marque === cle ? '' : cle; AMX.memo.ecrire('neufs_marque', self.marque); self.filtres.modele = ''; self.filtres.version = ''; self.rendre(); } }, [h('span', { text: libelle }), h('b', { text: AMX.fmtNombre(n) })]);
    };
    this.elMarques.appendChild(h('span.etiquette', { text: 'Marque' }));
    this.elMarques.appendChild(pastille('', 'Toutes', total));
    marques.forEach(function (m) { self.elMarques.appendChild(pastille(m[0], m[0], m[1])); });
  };
  /* Onglet actif : un seul panneau visible ; mémorisé pour la prochaine visite. */
  VueNeufs.prototype.montrer = function (onglet, options) {
    this.onglet = onglet; AMX.memo.ecrire('neufs_onglet', onglet);
    var self = this;
    [['liste', this.elListe], ['commandes', this.elCommandes], ['ventes', this.elVentes], ['ecarts', this.elEcarts], ['absents', this.elAbsents], ['echanges', this.elEchanges], ['analyse', this.elAnalyse]].forEach(function (p) { p[1].classList.toggle('cache', p[0] !== onglet); });
    this.rendreOnglets();
    if (options && options.defiler) { var cible = { liste: this.elBarre, commandes: this.elCommandes, ventes: this.elVentes, ecarts: this.elEcarts, absents: this.elAbsents, echanges: this.elEchanges, analyse: this.elAnalyse }[onglet]; if (cible) cible.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  };
  VueNeufs.prototype.rendreOnglets = function () {
    var self = this, d = this.donnees;
    AMX.vider(this.elOnglets);
    if (!d) return;
    var enStock = this.visibles().filter(function (v) { return v.enStock; }).length;
    var c = this.compagnie, pv = this.portailVisible();   /* concession ET mode détail / flotte */
    var commandes = pv.commandes.filter(function (x) { return !commandeAttente(x); }).reduce(function (s, x) { return s + (x.n || 0); }, 0);
    var depuis12 = debut12Mois(), ventes = pv.ventes.filter(function (x) { return String(x.dateVente) >= depuis12; }).length;
    var portail = !c || !!PORTAILS[c];
    var ec = this.deuxOrigines() ? this.ecarts() : null, ab = this.absentsConstructeur();
    var echA = this.echangesEnAttente(), echMoi = echA.filter(function (o) { return o.peutRepondre; }).length;
    var onglets = [['liste', 'Liste', enStock], ['commandes', 'Commandes', portail ? commandes : null], ['ventes', 'Ventes déclarées', portail ? ventes : null], ['ecarts', 'Écarts DMS / manufacturier', ec ? ec.total : null], ['absents', 'Absents du manufacturier', ab ? ab.lignes.length : null], ['echanges', 'Échanges', echA.length || null], ['analyse', 'Analyse', null]];
    onglets.forEach(function (o) {
      if (o[2] === null && (o[0] === 'commandes' || o[0] === 'ventes' || o[0] === 'ecarts' || o[0] === 'absents')) return;   /* concession sans portail (ou sans rien à comparer) : pas d'onglets vides */
      self.elOnglets.appendChild(h('button' + (self.onglet === o[0] ? '.actif' : ''), { type: 'button', role: 'tab', 'aria-selected': self.onglet === o[0] ? 'true' : 'false', 'data-onglet': o[0], onclick: function () { self.montrer(o[0]); } }, [h('span', { text: o[1] }), o[2] !== null ? h('b' + ((o[0] === 'absents' && o[2]) || (o[0] === 'echanges' && echMoi) ? '.rouge' : ''), { text: AMX.fmtNombre(o[2]) }) : null]));
    });
    if (!this.elOnglets.querySelector('button.actif')) { this.onglet = 'liste'; this.montrer('liste'); }
  };

  VueNeufs.prototype.charger = function (force) {
    var self = this, gen = ++this.generation;
    if (force) this.btnRafraichir.classList.add('occupe');
    if (!AMX.neufs.enCache()) this.elTable.appendChild(AMX.chargeur('Véhicules neufs'));
    this.portail = this.portail || null;
    AMX.neufs.chargerPortail(force).then(function (p) { if (gen !== self.generation) return; self.portail = p; indexerRdr(p); self.rendrePortailOnglets(); if (self.donnees) self.rendre(); }, function () { if (gen !== self.generation) return; self.portail = null; self.rendrePortailOnglets(); });
    this.chargerEchanges(gen);
    return AMX.neufs.charger(force).then(function (d) {
      if (gen !== self.generation) return;
      self.donnees = d; self.erreur = ''; self.typeParVin = null;
      self.btnRafraichir.classList.remove('occupe');
      self.rendre();
      if (AMX.rafraichirSousBarre) AMX.rafraichirSousBarre();   /* compteur « Neufs » de la sous-barre (11 oct.) */
      if (force) AMX.toast('Neufs mis à jour — ' + self.visibles().filter(function (v) { return v.enStock; }).length + ' en stock', 'ok');
    }).catch(function (e) {
      if (gen !== self.generation) return;
      self.btnRafraichir.classList.remove('occupe');
      self.erreur = AMX.erreurTexte(e); self.rendre();
      AMX.toast('Impossible de charger les neufs — ' + self.erreur, 'erreur');
    });
  };

  /** Véhicules de la concession choisie (toutes si « Toutes »). */
  /** Véhicules de la concession choisie, tous types (détail et flotte). */
  VueNeufs.prototype.visiblesTous = function () {
    var d = this.donnees, c = this.compagnie, o = this.origineCourante();
    if (!d) return [];
    return d.vehicules.filter(function (v) { return (!c || v.compagnie === c) && origineDe(v) === o; });
  };
  /* Origines présentes dans la portée (véhicules en stock de la concession choisie) : { dms: n, constructeur: n }. */
  VueNeufs.prototype.originesDispo = function () {
    var d = this.donnees, c = this.compagnie, out = {};
    if (!d) return out;
    d.vehicules.forEach(function (v) { if (!v.enStock || (c && v.compagnie !== c)) return; var o = origineDe(v); out[o] = (out[o] || 0) + 1; });
    return out;
  };
  VueNeufs.prototype.deuxOrigines = function () { var o = this.originesDispo(); return !!(o.dms && o.constructeur); };
  /* Origine affichée : celle choisie si elle existe dans la portée, sinon le DMS / fichier s'il y en a un, sinon le constructeur. */
  VueNeufs.prototype.origineCourante = function () {
    var o = this.originesDispo();
    if (this.origine) return this.origine;   /* choix explicite (mémorisé) : respecté même si cette origine est vide pour la concession */
    return o.dms || !o.constructeur ? 'dms' : 'constructeur';
  };
  /* Écarts entre les deux origines pour la concession choisie (véhicules en stock, par NIV). */
  VueNeufs.prototype.ecarts = function () {
    var d = this.donnees, c = this.compagnie, parCie = {};
    if (!d) return null;
    d.vehicules.forEach(function (v) { if (!v.enStock || (c && v.compagnie !== c)) return; var k = parCie[v.compagnie] || (parCie[v.compagnie] = { dms: {}, constructeur: {} }); k[origineDe(v)][v.vin] = v; });
    var out = { dmsSeul: [], constructeurSeul: [], statut: [], communs: 0, total: 0, cies: [] };
    Object.keys(parCie).sort().forEach(function (cie) {
      var k = parCie[cie]; if (!Object.keys(k.dms).length || !Object.keys(k.constructeur).length) return;
      out.cies.push(cie);
      Object.keys(k.dms).forEach(function (vin) { var a = k.dms[vin], b = k.constructeur[vin]; if (!b) out.dmsSeul.push(a); else { out.communs++; if (statutNorme(a) !== statutNorme(b)) out.statut.push({ dms: a, constructeur: b }); } });
      Object.keys(k.constructeur).forEach(function (vin) { if (!k.dms[vin]) out.constructeurSeul.push(k.constructeur[vin]); });
    });
    out.total = out.dmsSeul.length + out.constructeurSeul.length + out.statut.length;
    return out;
  };
  /* Maxime (12 oct.) : « affiche les unités présentes en stock dans manufacturier mais pas dans DMS en rouge ». Pour chaque
     concession qui a les deux origines : les lignes du portail en stock (ni en transit, ni livrées au client) dont le NIV n'est
     pas dans l'export du DMS → { 'CIE|NIV': true }. Recalculé à chaque rendu (quelques centaines de lignes). */
  function enStockPortail(v) { return v.enStock && statutNorme(v) !== 'En transit' && !/livr[ée]e? au client|retailed/i.test(String((v.extra || {}).etape || '')); }
  VueNeufs.prototype.calculerAbsentsDms = function () {
    var d = this.donnees, parCie = {}, out = {};
    if (!d) return out;
    d.vehicules.forEach(function (v) { if (!v.enStock) return; var k = parCie[v.compagnie] || (parCie[v.compagnie] = { dms: {}, constructeur: [] }); if (origineDe(v) === 'dms') k.dms[v.vin] = true; else k.constructeur.push(v); });
    Object.keys(parCie).forEach(function (cie) {
      var k = parCie[cie];
      // Pas de feed DMS pour la concession : le serveur a comparé avec la référence provisoire (feuille Google) → v.absentDms
      // (Maxime, 12 oct. : « utilise les données que tu as jusqu'à ce que le feed soit ok »)
      if (!Object.keys(k.dms).length) { if (d.referenceDms && d.referenceDms[cie]) k.constructeur.forEach(function (v) { if (v.absentDms === true) out[cie + '|' + v.vin] = true; }); return; }
      k.constructeur.forEach(function (v) { if (enStockPortail(v) && !k.dms[v.vin]) out[cie + '|' + v.vin] = true; });
    });
    return out;
  };
  VueNeufs.prototype.absentDms = function (v) { return !!(this.absents && this.absents[v.compagnie + '|' + v.vin]); };
  /* D'où vient la comparaison pour une concession : le vrai DMS, ou la feuille Google en attendant le feed. */
  VueNeufs.prototype.referenceAbsents = function (cie) {
    var d = this.donnees || {}, o = {}; (d.vehicules || []).forEach(function (v) { if (v.enStock && v.compagnie === cie && origineDe(v) === 'dms') o.dms = true; });
    if (o.dms) return { type: 'dms', texte: 'l\'export du DMS' };
    var r = d.referenceDms && d.referenceDms[cie];
    if (r) return { type: 'feuille', texte: (r.source || 'la feuille Google') + (r.le ? ' du ' + AMX.fmtDateCourte(String(r.le).slice(0, 10)) : '') + ' (référence provisoire, en attendant le feed du DMS)', n: r.n, le: r.le, source: r.source || 'feuille Google' };
    return null;
  };
  function puceAbsentDms(grande, ref) { var t = ref && ref.type === 'feuille' ? 'En stock au portail du manufacturier (livré au concessionnaire), mais pas sur ' + ref.texte + ' : à vérifier' : 'En stock au portail du manufacturier (livré au concessionnaire), mais pas dans l\'export du DMS : à vérifier au DMS'; return h('span.neufs-marq-chip.rouge' + (grande ? '.grande' : ''), { text: 'Absent du DMS', title: t }); }
  /* Sélecteur « DMS / fichier · Constructeur » (seulement quand la concession a les deux origines) ; sinon une mention de la source. */
  VueNeufs.prototype.rendreOrigine = function () {
    var self = this;
    AMX.vider(this.elOrigine);
    var o = this.originesDispo(), courante = this.origineCourante();
    [['dms', ORIGINES.dms, o.dms || 0], ['constructeur', ORIGINES.constructeur, o.constructeur || 0]].forEach(function (x) {
      self.elOrigine.appendChild(h('button' + (courante === x[0] ? '.actif' : '') + (x[2] ? '' : '.vide'), { type: 'button', 'data-origine': x[0], title: x[0] === 'dms' ? 'L\'inventaire du DMS (export reçu par courriel, fichier ou feuille Google)' : 'L\'inventaire du manufacturier (portail lu par le favori)', onclick: function () { if (courante === x[0]) return; self.origine = x[0]; AMX.memo.ecrire('neufs_origine', x[0]); self.typeParVin = null; self.filtres.modele = ''; self.filtres.version = ''; self.filtres.statut = ''; self.rendre(); } }, [h('span', { text: x[1] }), h('b', { text: AMX.fmtNombre(x[2]) })]));
    });
  };
  /** Y a-t-il des unités de flotte dans la portée (stock ou commandes GM) ? Sinon le sélecteur détail / flotte reste caché
      et tout s'affiche (Hyundai : ses RDR « Fleet » restent dans les ventes). */
  VueNeufs.prototype.aFlotte = function () {
    var c = this.compagnie, p = this.portail || {};
    return this.visiblesTous().some(estFlotte) || (p.commandes || []).some(function (x) { return (!c || x.compagnie === c) && commandeFlotte(x); });
  };
  VueNeufs.prototype.modeFlotte = function () { return this.aFlotte() ? this.flotte : 'tout'; };
  VueNeufs.prototype.garde = function (flotte) { var m = this.modeFlotte(); return m === 'tout' || (m === 'flotte') === !!flotte; };
  /** Marques présentes dans la portée (véhicules en stock de la concession, tous types) avec leur compte. */
  VueNeufs.prototype.marques = function () {
    var self = this, comptes = {};
    this.visiblesTous().forEach(function (v) { if (!v.enStock || !self.garde(estFlotte(v))) return; var m = nomMarque(v.marque); if (m) comptes[m] = (comptes[m] || 0) + 1; });
    return Object.keys(comptes).sort(function (a, b) { return comptes[b] - comptes[a] || a.localeCompare(b); }).map(function (m) { return [m, comptes[m]]; });
  };
  VueNeufs.prototype.gardeMarque = function (marque) { return !this.marque || nomMarque(marque) === this.marque; };
  VueNeufs.prototype.visibles = function () {
    var self = this;
    return this.visiblesTous().filter(function (v) { return self.garde(estFlotte(v)) && self.gardeMarque(v.marque); });
  };
  VueNeufs.prototype.mouvements = function () {
    var d = this.donnees, c = this.compagnie, self = this;
    if (!d) return [];
    if (!this.typeParVin) { this.typeParVin = {}; this.marqueParVin = {}; (d.vehicules || []).forEach(function (v) { if (v.vin) { self.typeParVin[v.vin] = estFlotte(v); self.marqueParVin[v.vin] = nomMarque(v.marque); } }); }
    var o = this.origineCourante();
    return (d.mouvements || []).filter(function (m) { return (!c || m.compagnie === c) && origineDe(m) === o && self.garde(!!self.typeParVin[m.vin]) && (!self.marque || self.marqueParVin[m.vin] === self.marque || (!self.marqueParVin[m.vin] && nomMarque(m.marque) === self.marque)); });
  };

  VueNeufs.prototype.rendre = function () {
    var self = this;
    if (this.donnees && this.vinDemande) {   /* NIV demandé (recherche globale) : on bascule concession, origine, mode et marque pour le montrer */
      this.vinDemande = false;
      if (!this.filtrees().length) {
        var q = this.filtres.recherche.trim().toUpperCase(), cieQ = this.compagnie, oQ = this.origineCourante();
        var autre = this.donnees.vehicules.filter(function (v) { return v.vin === q && (!cieQ || v.compagnie === cieQ) && origineDe(v) !== oQ; })[0] || this.donnees.vehicules.filter(function (v) { return v.vin === q; })[0];
        if (autre) { if (autre.compagnie !== this.compagnie && this.compagnie) { this.compagnie = autre.compagnie; AMX.choisirCompagnie(autre.compagnie); } this.origine = origineDe(autre); this.typeParVin = null; }
        if (!this.filtrees().length && this.filtreesSans().length) { this.flotte = 'tout'; this.marque = ''; }
      }
    }   /* NIV demandé (recherche globale) caché par l'origine, le mode ou la marque : on bascule */
    AMX.vider(this.elChoix);
    var tous = this.donnees ? this.donnees.vehicules : [];
    var def = AMX.neufs.originesDefaut ? AMX.neufs.originesDefaut() : {}, oc = this.origineCourante();
    var choix = AMX.choixCompagnie({ domaine: 'inventaire', valeur: this.compagnie, compte: function (c) { return tous.filter(function (v) { return v.enStock && (!c || v.compagnie === c) && origineDe(v) === (c ? (self.origine && self.compagnie === c ? oc : def[c]) : def[v.compagnie]) && self.garde(estFlotte(v)); }).length; }, onchange: function (c) { self.compagnie = c; self.typeParVin = null; self.filtres.modele = ''; self.filtres.version = ''; self.filtres.statut = ''; self.rendre(); if (AMX.rafraichirSousBarre) AMX.rafraichirSousBarre(); } });
    if (choix) this.elChoix.appendChild(choix);
    this.rendreOrigine();
    this.rendreFlotte();
    this.rendreMarques();
    if (this.erreur && !this.donnees) { this.elEtat.textContent = this.erreur; AMX.vider(this.elTable); this.elTable.appendChild(h('div.neufs-vide', { text: 'Impossible de charger les neufs : ' + this.erreur })); return; }
    if (!this.donnees) return;
    var liste = this.visibles(), enStock = liste.filter(function (v) { return v.enStock; });
    var origine = this.origineCourante(), feeds = (origine === 'constructeur' ? this.donnees.feedsConstructeur : this.donnees.feeds) || {}, cies = this.compagnie ? [this.compagnie] : Object.keys(AMX.COMPAGNIES);
    var derniers = cies.map(function (c) { return feeds[c] ? nomCie(c) + ' ' + AMX.fmtDate(feeds[c].le, true) : null; }).filter(Boolean);
    var nTerrain = enStock.filter(function (v) { return String(v.statutLibelle || '').toUpperCase() === 'EN-INVENT.'; }).length, nTransit = enStock.filter(function (v) { return /TRANSIT/.test(String(v.statutLibelle || '').toUpperCase()); }).length, nDemos = enStock.filter(estDemo).length;
    var mode = this.modeFlotte(), tousEnStock = this.visiblesTous().filter(function (v) { return v.enStock; }), nFlotte = tousEnStock.filter(estFlotte).length, nDetail = tousEnStock.length - nFlotte;
    var quoi = mode === 'detail' ? ' neuf' + (enStock.length > 1 ? 's' : '') + ' au détail' : (mode === 'flotte' ? ' neuf' + (enStock.length > 1 ? 's' : '') + ' en flotte' : ' neuf' + (enStock.length > 1 ? 's' : ''));
    var reste = mode === 'detail' && nFlotte ? ' · ' + nFlotte + ' en flotte' : (mode === 'flotte' ? ' · ' + nDetail + ' au détail' : (mode === 'tout' && this.aFlotte() ? ' · ' + nDetail + ' détail, ' + nFlotte + ' flotte' : ''));
    void quoi; void reste; void nTerrain; void nTransit; void nDemos;
    var codesVis = AMX.codesPour ? AMX.codesPour('inventaire') : [];
    var nDispoE = enStock.filter(estDisponible).length;
    this.elEtat.textContent = (this.compagnie ? nomCie(this.compagnie) : (codesVis.length === 1 ? nomCie(codesVis[0]) : 'Tout le groupe')) + ' · ' + enStock.length + ' neuf' + (enStock.length > 1 ? 's' : '') + ' · ' + nDispoE + ' disponible' + (nDispoE > 1 ? 's' : '') + (derniers.length ? ' · lu le ' + derniers.map(function (x) { return x.replace(/^.*? (\d{4}-\d{2}-\d{2}.*)$/, '$1'); }).join(' · ') : ' · rien reçu encore du ' + ORIGINES_LONG[origine]);   /* Maxime, 11 oct. : pas de longue phrase sous le titre */
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
    this.rendreEcarts();
    this.rendreAbsents();
    this.rendreEchanges();
    this.montrer(this.onglet);
  };
  /* Onglet Écarts : ce que le DMS / fichier a et pas le constructeur, l'inverse, et les NIV des deux côtés dont le statut diffère
     (en stock / en transit / démo). C'est la liste à envoyer au constructeur ou au DMS pour demander les différences. */
  VueNeufs.prototype.rendreEcarts = function () {
    var self = this;
    AMX.vider(this.elEcarts);
    if (!this.deuxOrigines()) return;
    var e = this.ecarts(), d = this.donnees;
    var fd = (d.feeds || {}), fc = (d.feedsConstructeur || {});
    var luDms = e.cies.map(function (c) { return fd[c] ? nomCie(c) + ' ' + AMX.fmtDate(fd[c].le, true) : null; }).filter(Boolean).join(' · ');
    var luCon = e.cies.map(function (c) { return fc[c] ? nomCie(c) + ' ' + AMX.fmtDate(fc[c].le, true) : null; }).filter(Boolean).join(' · ');
    var carte = function (cls, nom, n, bas) { return h('div.neufs-carte.' + cls, [h('div.nom', { text: nom }), h('div.n', { text: AMX.fmtNombre(n) }), bas ? h('div.bas', { text: bas }) : null]); };
    var tuiles = h('div.neufs-cartes', { style: { marginBottom: '0' } }, [
      carte('vert', 'Dans les deux', e.communs, 'même NIV au DMS et chez le constructeur'),
      carte(e.dmsSeul.length ? 'ambre' : 'vert', 'DMS seulement', e.dmsSeul.length, 'au DMS / fichier, absent du portail'),
      carte(e.constructeurSeul.length ? 'ambre' : 'vert', 'Manufacturier seulement', e.constructeurSeul.length, 'sur le portail, absent du DMS'),
      carte(e.statut.length ? 'rouge' : 'vert', 'Statut différent', e.statut.length, 'en stock d\'un côté, transit ou démo de l\'autre')
    ]);
    var ligneV = function (v, cols) { var tr = h('tr.ecart', [h('td.vehicule', [h('div.nom', { text: nomVehicule(v) }), h('div.vin', { text: v.vin + (v.stock ? ' · #' + v.stock : '') })]), h('td', { text: v.couleur || '—' })].concat(cols)); tr.addEventListener('click', function () { self.ouvrir(v); }); return tr; };
    var table = function (titre, lignes, entetes, rangee) {
      if (!lignes.length) return null;
      return h('div', { style: { marginTop: '14px' } }, [h('h3', { text: titre + ' (' + lignes.length + ')' }), h('div.neufs-table.neufs-ecarts', [h('table.tableau', [h('thead', [h('tr', [h('th', 'Véhicule'), h('th', 'Couleur')].concat(entetes.map(function (x) { return h('th', x); })))]), h('tbody', lignes.slice(0, 200).map(rangee))])]), lignes.length > 200 ? h('p.doux.petit', { text: '… et ' + (lignes.length - 200) + ' autres (export Excel pour le tout).' }) : null]);
    };
    var tri = function (l) { return l.slice().sort(function (a, b) { return (b.jours || 0) - (a.jours || 0); }); };
    var corps = [tuiles,
      h('p.doux.petit', { style: { margin: '10px 0 0' }, text: 'Véhicules en stock seulement. DMS / fichier : ' + (luDms || 'pas de lecture') + ' · manufacturier : ' + (luCon || 'pas de lecture') + '. Un NIV « DMS seulement » est en général vendu ou transféré côté manufacturier sans que le DMS le sache (ou un échange concessionnaire) ; un NIV « manufacturier seulement » n\'est pas encore reçu au DMS (en transit, livré ce matin) ou a été oublié. Exportez la liste pour demander les différences.' }),
      table('DMS / fichier seulement', tri(e.dmsSeul), ['Statut DMS', 'Jours', 'Emplacement'], function (v) { return ligneV(v, [h('td', { text: statutNorme(v) }), h('td.num', { text: fmtJours(v.jours) }), h('td', { text: v.emplacement || '—' })]); }),
      table('Manufacturier seulement', tri(e.constructeurSeul), ['Statut au portail', 'Jours', 'Étape / emplacement'], function (v) { return ligneV(v, [h('td', { text: statutNorme(v) }), h('td.num', { text: fmtJours(v.jours) }), h('td', { text: v.emplacement || (v.extra || {}).etape || '—' })]); }),
      table('Statut différent', e.statut.map(function (x) { return x.dms; }).sort(function (a, b) { return (b.jours || 0) - (a.jours || 0); }), ['Au DMS', 'Chez le manufacturier'], function (v) { var x = e.statut.filter(function (y) { return y.dms === v; })[0]; return ligneV(v, [h('td', { text: statutNorme(x.dms) + (x.dms.emplacement ? ' · ' + x.dms.emplacement : '') }), h('td', { text: statutNorme(x.constructeur) + ((x.constructeur.extra || {}).etape ? ' · ' + x.constructeur.extra.etape : '') })]); })
    ];
    this.elEcarts.appendChild(h('div.carte', [
      h('div.carte-entete', [h('h2', ['Écarts entre le DMS / fichier et le manufacturier', h('span.sous', { text: e.total ? e.total + ' écart' + (e.total > 1 ? 's' : '') + ' sur ' + (e.communs + e.dmsSeul.length + e.constructeurSeul.length) + ' NIV' : 'aucun écart : les deux inventaires concordent' })]), h('button.btn.petit', { type: 'button', html: I.telecharger + '<span>Exporter les écarts</span>', onclick: function () { self.exporterEcarts(); } })]),
      h('div.carte-corps', corps)
    ]));
  };
  VueNeufs.prototype.exporterEcarts = function () {
    var e = this.ecarts();
    if (!e || !e.total) { AMX.toast('Aucun écart à exporter.', 'attention'); return; }
    if (typeof XLSX === 'undefined') { AMX.toast('La bibliothèque Excel n\'est pas encore chargée. Réessayez.', 'erreur'); return; }
    var ligne = function (v, quoi, autre) { return { 'Écart': quoi, 'Concession': nomCie(v.compagnie), 'NIV': v.vin, '# Stock': v.stock || '', 'Année': v.annee, 'Marque': v.marque, 'Modèle': v.modele, 'Version': v.version, 'Couleur': v.couleur, 'Statut DMS': origineDe(v) === 'dms' ? statutNorme(v) : (autre ? statutNorme(autre) : ''), 'Statut constructeur': origineDe(v) === 'constructeur' ? statutNorme(v) : (autre ? statutNorme(autre) : ''), 'Jours': v.jours, 'Emplacement': v.emplacement || (v.extra || {}).etape || '' }; };
    var rows = e.dmsSeul.map(function (v) { return ligne(v, 'DMS seulement'); }).concat(e.constructeurSeul.map(function (v) { return ligne(v, 'Manufacturier seulement'); })).concat(e.statut.map(function (x) { return ligne(x.dms, 'Statut différent', x.constructeur); }));
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Écarts');
    XLSX.writeFile(wb, 'neufs-ecarts-' + (this.compagnie || 'groupe').toLowerCase() + '-' + new Date().toISOString().slice(0, 10) + '.xlsx');
    AMX.toast('Export des écarts — ' + rows.length + ' NIV', 'ok');
  };

  /* 12 oct. (Maxime : « j'ai aussi besoin de absent de Global (manufacturier) mais dans DMS, comme onglet dans le neuf ») — l'inverse
     d'« Absent du DMS » : les unités que le DMS (ou, sans feed, la feuille Google de référence) connaît et que le portail du
     manufacturier n'a pas. Concession avec les deux origines : les lignes « DMS seulement » des écarts ; concession sans feed DMS :
     la liste calculée par le serveur d'après la feuille (absentsConstructeur : jamais vu au portail, ou sorti du portail — vendu /
     livré — mais encore sur la feuille). null = rien à comparer (pas d'inventaire du manufacturier). */
  VueNeufs.prototype.absentsConstructeur = function () {
    var d = this.donnees, c = this.compagnie, self = this;
    if (!d) return null;
    var cies = c ? [c] : Object.keys(AMX.COMPAGNIES_TOUTES || AMX.COMPAGNIES), lignes = [], sources = {}, parCie = {};
    d.vehicules.forEach(function (v) { var k = parCie[v.compagnie] || (parCie[v.compagnie] = { dms: 0, constructeur: 0 }); if (v.enStock) k[origineDe(v)]++; });
    var e = null;
    cies.forEach(function (cie) {
      var k = parCie[cie] || { dms: 0, constructeur: 0 };
      if (!k.constructeur) return;   /* pas d'inventaire du manufacturier : rien à comparer */
      if (k.dms) {
        sources[cie] = { type: 'dms', texte: 'l\'export du DMS' };
        e = e || self.ecarts();
        e.dmsSeul.forEach(function (v) { if (v.compagnie !== cie) return; lignes.push({ compagnie: cie, vin: v.vin, vin8: String(v.vin).slice(-8), stock: v.stock || '', modele: nomVehicule(v), couleur: v.couleur || '', statut: statutNorme(v) + (v.emplacement ? ' · ' + v.emplacement : ''), onglet: 'DMS', etat: 'jamais', sortiLe: '', jours: v.jours, v: v }); });
        return;
      }
      var abs = d.absentsConstructeur && d.absentsConstructeur[cie];
      if (!abs) return;
      sources[cie] = self.referenceAbsents(cie) || { type: 'feuille', texte: 'la feuille Google', source: 'feuille Google' };
      abs.forEach(function (a) {
        var v = a.vin ? d.vehicules.filter(function (x) { return x.compagnie === cie && x.vin === a.vin && origineDe(x) === 'constructeur'; })[0] : null;
        lignes.push({ compagnie: cie, vin: a.vin || '', vin8: a.vin8, stock: a.stock || '', modele: a.modele || '', couleur: a.couleur || '', statut: a.statut || '', onglet: a.onglet || '', etat: a.etat, sortiLe: a.sortiLe || '', jours: v ? v.jours : null, v: v || null });
      });
    });
    if (!Object.keys(sources).length) return null;
    lignes.sort(function (a, b) { return (a.etat === b.etat ? 0 : (a.etat === 'jamais' ? -1 : 1)) || String(a.compagnie).localeCompare(String(b.compagnie)) || String(a.stock).localeCompare(String(b.stock)); });
    return { lignes: lignes, sources: sources, cies: Object.keys(sources) };
  };
  function texteEtatAbsent(l) { return l.etat === 'sorti' ? 'Sorti du portail' + (l.sortiLe ? ' le ' + AMX.fmtDateCourte(l.sortiLe) : '') + ' (vendu ou transféré)' : 'Jamais vu au portail'; }
  VueNeufs.prototype.rendreAbsents = function () {
    var self = this;
    AMX.vider(this.elAbsents);
    var ab = this.absentsConstructeur();
    if (!ab) return;
    var d = this.donnees, fc = (d.feedsConstructeur || {}), c = this.compagnie;
    var luCon = ab.cies.map(function (x) { return fc[x] ? nomCie(x) + ' ' + AMX.fmtDate(fc[x].le, true) : null; }).filter(Boolean).join(' · ');
    var cote = ab.cies.map(function (x) { var s = ab.sources[x]; return nomCie(x) + ' : ' + (s.type === 'feuille' ? s.texte : 'l\'export du DMS'); }).join(' · ');
    var nJamais = ab.lignes.filter(function (l) { return l.etat === 'jamais'; }).length, nSortis = ab.lignes.length - nJamais;
    var carte = function (cls, nom, n, bas) { return h('div.neufs-carte.' + cls, [h('div.nom', { text: nom }), h('div.n', { text: AMX.fmtNombre(n) }), bas ? h('div.bas', { text: bas }) : null]); };
    var tuiles = h('div.neufs-cartes', { style: { marginBottom: '0' } }, [
      carte(ab.lignes.length ? 'rouge' : 'vert', 'Absents du manufacturier', ab.lignes.length, 'au DMS / sur la feuille, pas au portail'),
      carte(nJamais ? 'rouge' : 'vert', 'Jamais vus au portail', nJamais, 'échange concessionnaire non transféré, NIV mal tapé…'),
      carte(nSortis ? 'ambre' : 'vert', 'Sortis du portail', nSortis, 'vendus ou transférés chez le manufacturier, encore au DMS / sur la feuille')
    ]);
    var rangee = function (l) {
      var tr = h('tr.ecart' + (l.etat === 'jamais' ? '.absent-manufacturier' : '.sorti-manufacturier'), (c ? [] : [h('td', { text: nomCie(l.compagnie) })]).concat([
        h('td', { text: l.stock || '—' }),
        h('td.vehicule', [h('div.nom', { text: l.modele || '—' }), h('div.vin', { text: l.vin || ('…' + l.vin8) })]),
        h('td', { text: l.couleur || '—' }),
        h('td', { text: l.statut || '—' }),
        h('td', { text: l.onglet || '—' }),
        h('td', [h('span.neufs-marq-chip' + (l.etat === 'jamais' ? '.rouge' : '.ambre'), { text: texteEtatAbsent(l) })])
      ]));
      if (l.v) { tr.addEventListener('click', function () { self.ouvrir(l.v); }); tr.title = 'Ouvrir la fiche du portail (sortie)'; } else tr.style.cursor = 'default';
      return tr;
    };
    var entetes = (c ? [] : ['Concession']).concat(['# Stock', 'Véhicule', 'Couleur', 'Statut (DMS / feuille)', 'Onglet / source', 'Au manufacturier']);
    var corps = [tuiles,
      h('p.doux.petit', { style: { margin: '10px 0 0' }, text: 'Côté DMS — ' + cote + '. Portail du manufacturier lu : ' + (luCon || 'pas de lecture') + '. Un NIV « jamais vu au portail » est en général un échange concessionnaire (le véhicule vient d\'un autre concessionnaire et n\'a pas été transféré dans Global Connect) ou un NIV mal tapé ; un NIV « sorti du portail » a été vendu / livré ou transféré côté manufacturier mais figure encore au DMS / sur la feuille. Exportez la liste pour demander les corrections.' }),
      ab.lignes.length ? h('div.neufs-table.neufs-ecarts', { style: { marginTop: '14px' } }, [h('table.tableau', [h('thead', [h('tr', entetes.map(function (x) { return h('th', x); }))]), h('tbody', ab.lignes.slice(0, 300).map(rangee))])]) : h('div.neufs-vide', { text: 'Tout ce que le DMS / la feuille connaît est au portail du manufacturier.' }),
      ab.lignes.length > 300 ? h('p.doux.petit', { text: '… et ' + (ab.lignes.length - 300) + ' autres (export Excel pour le tout).' }) : null
    ];
    this.elAbsents.appendChild(h('div.carte', [
      h('div.carte-entete', [h('h2', ['Au DMS / sur la feuille, absents du manufacturier', h('span.sous', { text: ab.lignes.length ? ab.lignes.length + ' NIV à vérifier' : 'rien à signaler' })]), h('button.btn.petit', { type: 'button', html: I.telecharger + '<span>Exporter</span>', onclick: function () { self.exporterAbsents(); } })]),
      h('div.carte-corps', corps)
    ]));
  };
  VueNeufs.prototype.exporterAbsents = function () {
    var ab = this.absentsConstructeur();
    if (!ab || !ab.lignes.length) { AMX.toast('Aucune unité absente du manufacturier à exporter.', 'attention'); return; }
    if (typeof XLSX === 'undefined') { AMX.toast('La bibliothèque Excel n\'est pas encore chargée. Réessayez.', 'erreur'); return; }
    var rows = ab.lignes.map(function (l) { return { 'Concession': nomCie(l.compagnie), '# Stock': l.stock, 'NIV': l.vin || '', 'NIV (8 derniers)': l.vin8, 'Véhicule': l.modele, 'Couleur': l.couleur, 'Statut (DMS / feuille)': l.statut, 'Onglet / source': l.onglet, 'Au manufacturier': texteEtatAbsent(l), 'Sorti le': l.sortiLe || '' }; });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Absents du manufacturier');
    XLSX.writeFile(wb, 'neufs-absents-manufacturier-' + (this.compagnie || 'groupe').toLowerCase() + '-' + new Date().toISOString().slice(0, 10) + '.xlsx');
    AMX.toast('Export — ' + rows.length + ' NIV absents du manufacturier', 'ok');
  };

  /* ---------------- Échanges entre concessions, par texto (12 oct.) ----------------
     Maxime : « je veux pouvoir générer un texto pour faire une demande d'échange entre Ste-Marie et Hawks, et que la réponse
     puisse faire un update directement par les textos dans la base de données ». Le responsable de la feuille des neufs d'une
     concession demande un véhicule (fiche d'un neuf d'une autre concession, ou modèle recherché en texte libre) ; le serveur
     (Echange.gs) texte les responsables de l'autre concession (admins, gestionnaires, direction des ventes, droit « Neufs —
     responsable de la feuille », avec un numéro) : « OUI E101 » marque le véhicule « Échangé » à la concession demandeuse et
     prévient le demandeur ; « NON E101 » refuse. On peut aussi répondre ici. GET ?echanges=1, POST echangeCreer / echangeRepondre. */
  VueNeufs.prototype.chargerEchanges = function (gen) {
    var self = this;
    return AMX.get({ echanges: 1 }).then(function (d) {
      if (self.detruit || (gen !== undefined && gen !== self.generation)) return;
      /* L'ancien script répond à un GET inconnu par la liste de l'inventaire (ok + vehicules) : sans tableau echanges, la route n'est pas déployée. */
      self.echanges = (d && d.ok && Array.isArray(d.echanges)) ? d : { echanges: [], peutDemander: false, textosActifs: false, indisponible: (d && (d.erreur || d.message)) || 'route absente — redéployez le script (Echange.gs)' };
      self.rendreEchanges(); self.rendreOnglets();
    }).catch(function (e) { if (self.detruit) return; self.echanges = { echanges: [], peutDemander: false, textosActifs: false, indisponible: AMX.erreurTexte(e) }; self.rendreEchanges(); self.rendreOnglets(); });
  };
  VueNeufs.prototype.echangesEnAttente = function () {
    var c = this.compagnie;
    return ((this.echanges && this.echanges.echanges) || []).filter(function (o) { return o.statut === 'en_attente' && (!c || o.deCompagnie === c || o.aCompagnie === c); });
  };
  /* Les concessions au nom desquelles je peux demander (portée inventaire), sans celle qui a le véhicule. */
  VueNeufs.prototype.concessionsDemandeuses = function (sauf) {
    return (AMX.codesPour ? AMX.codesPour('inventaire') : Object.keys(AMX.COMPAGNIES)).filter(function (c) { return c !== sauf; });
  };
  VueNeufs.prototype.peutDemanderEchange = function (v) {
    return !!(v && v.enStock && this.echanges && this.echanges.peutDemander && this.concessionsDemandeuses(v.compagnie).length);
  };
  function textoEchange(o) {
    var veh = [o.modele, o.stock ? '# ' + o.stock : '', o.vin ? '(NIV …' + String(o.vin).slice(-8) + ')' : ''].filter(Boolean).join(' '), msg = String(o.message || '').trim();
    return 'ScanAutomax — Échange ' + (o.id || 'E…') + ' : ' + nomCie(o.deCompagnie) + ' (' + (o.parNom || '') + ') demande ' + (veh || '…') + '.' + (msg ? ' ' + msg.slice(0, 160) + (msg.length > 160 ? '…' : '') + '.' : '') + ' Répondez OUI ' + (o.id || 'E…') + ' pour accepter ou NON ' + (o.id || 'E…') + ' pour refuser.';
  }
  VueNeufs.prototype.rendreEchanges = function () {
    var self = this, e = this.echanges, c = this.compagnie;
    AMX.vider(this.elEchanges);
    if (!this.donnees) return;
    var liste = ((e && e.echanges) || []).filter(function (o) { return !c || o.deCompagnie === c || o.aCompagnie === c; });
    var attente = liste.filter(function (o) { return o.statut === 'en_attente'; }), aMoi = attente.filter(function (o) { return o.peutRepondre; });
    var btnDemander = e && e.peutDemander ? h('button.btn.primaire.petit.neufs-echange-nouvelle', { type: 'button', html: I.texto + '<span>Demander un échange…</span>', onclick: function () { self.demanderEchange(null); } }) : null;
    var btnRafraichir = h('button.btn.petit', { type: 'button', html: I.rafraichir + '<span>Rafraîchir</span>', onclick: function () { btnRafraichir.classList.add('occupe'); self.chargerEchanges().then(function () { btnRafraichir.classList.remove('occupe'); }); } });
    var rangee = function (o) {
      var actions = [];
      if (o.peutRepondre) { actions.push(h('button.btn.petit.primaire.neufs-ech-oui', { type: 'button', text: 'Accepter', onclick: function () { self.repondreEchange(o, 'oui'); } })); actions.push(h('button.btn.petit.neufs-ech-non', { type: 'button', text: 'Refuser', onclick: function () { self.repondreEchange(o, 'non'); } })); }
      if (o.peutAnnuler) actions.push(h('button.btn.petit.fantome.neufs-ech-annuler', { type: 'button', text: 'Annuler', onclick: function () { self.repondreEchange(o, 'annuler'); } }));
      var dest = (o.destinataires || []).map(function (d) { return d.nom + (d.ok ? '' : ' (texto non parti)'); }).join(', ');
      var reponse = o.statut === 'en_attente' ? (dest ? 'Texto envoyé à ' + dest : '—') : ((o.reponduPar ? o.reponduPar : '') + (o.repondu ? ' · ' + AMX.fmtDate(o.repondu, true) : '') + (o.reponse ? ' — « ' + o.reponse + ' »' : '') + (o.note && o.statut === 'annule' ? ' — ' + o.note : ''));
      var veh = this_veh(o);
      var tr = h('tr' + (o.statut === 'en_attente' ? '.neufs-ech-attente' : ''), { 'data-id': o.id }, [
        h('td', [h('b', { text: o.id }), h('div.doux.petit', { text: AMX.fmtDate(o.cree, true) })]),
        h('td', [h('div', { text: o.deNom || nomCie(o.deCompagnie) }), h('div.doux.petit', { text: o.parNom || o.par })]),
        h('td', { text: o.aNom || nomCie(o.aCompagnie) }),
        h('td.vehicule', [h('div.nom', { text: o.modele || '—' }), h('div.vin', { text: (o.stock ? '# ' + o.stock : '') + (o.vin ? (o.stock ? ' · ' : '') + o.vin : '') })]),
        h('td.msg', { text: o.message || '' }),
        h('td', [h('span.neufs-ech-chip.' + o.statut, { text: o.statutLibelle || o.statut })]),
        h('td.msg', { text: reponse }),
        h('td', actions.length ? actions : [h('span.doux', '—')])
      ]);
      if (veh) { tr.querySelector('td.vehicule').style.cursor = 'pointer'; tr.querySelector('td.vehicule').title = 'Ouvrir la fiche'; tr.querySelector('td.vehicule').addEventListener('click', function () { self.ouvrir(veh); }); }
      return tr;
    };
    function this_veh(o) { if (!o.vin) return null; return (self.donnees.vehicules || []).filter(function (v) { return v.compagnie === o.aCompagnie && v.vin === o.vin; })[0] || null; }
    var corps = [
      h('p.doux.petit', { style: { margin: 0 }, text: 'Un responsable de la feuille des neufs demande un véhicule à une autre concession du groupe : le site envoie un texto aux responsables de cette concession (admins, gestionnaires, direction des ventes et comptes avec le droit « Neufs — responsable de la feuille », qui ont un numéro de cellulaire). Ils répondent « OUI E101 » ou « NON E101 » par texto — ou ici, Accepter / Refuser. Un OUI marque aussitôt le véhicule « Échangé » à la concession demandeuse (comme un marquage) et prévient le demandeur par texto et courriel.' }),
      e && e.indisponible ? h('p.neufs-absent-dms', { text: 'Les échanges ne sont pas disponibles : ' + e.indisponible }) : null,
      e && !e.indisponible && !e.textosActifs ? h('p.neufs-absent-dms', { text: 'Les textos ne sont pas activés (Admin › Alertes aux directeurs (textos) : compte Infobip) : les demandes seront enregistrées mais aucun texto ne partira.' }) : null,
      e && !e.indisponible && e.textosActifs && e.lectureInstallee === false && AMX.estAdmin() ? h('p.doux.petit', { style: { margin: '8px 0 0' }, text: 'Les réponses par texto ne sont pas encore lues automatiquement : Admin › Réponses par texto › Installer la lecture (toutes les minutes).' }) : null,
      liste.length ? h('div.neufs-table.neufs-echanges', { style: { marginTop: '14px' } }, [h('table.tableau', [h('thead', [h('tr', ['#', 'Demandé par', 'À', 'Véhicule', 'Message', 'Statut', 'Réponse / textos', ''].map(function (x) { return h('th', x); }))]), h('tbody', liste.slice(0, 200).map(rangee))])]) : h('div.neufs-vide', { style: { marginTop: '14px' }, text: e && e.indisponible ? '' : 'Aucune demande d\'échange' + (c ? ' pour ' + nomCie(c) : '') + '.' })
    ];
    this.elEchanges.appendChild(h('div.carte', [
      h('div.carte-entete', [h('h2', ['Demandes d\'échange entre concessions', h('span.sous', { text: attente.length ? attente.length + ' en attente' + (aMoi.length ? ' · ' + aMoi.length + ' à répondre' : '') : (liste.length ? 'aucune en attente' : 'par texto') })]), h('div.actions', [btnRafraichir, btnDemander])]),
      h('div.carte-corps', corps)
    ]));
  };
  /* Formulaire de demande : concession demandeuse, concession qui a le véhicule, véhicule (fiche) ou modèle recherché, message, aperçu du texto. */
  VueNeufs.prototype.demanderEchange = function (v) {
    var self = this, e = this.echanges || {};
    var codesDe = this.concessionsDemandeuses(v ? v.compagnie : ''), tous = Object.keys(AMX.COMPAGNIES_TOUTES || AMX.COMPAGNIES);
    if (!codesDe.length) { AMX.toast('Aucune concession au nom de laquelle demander.', 'attention'); return; }
    var maCie = AMX.maConcession ? AMX.maConcession() : '';
    var deDefaut = (maCie && codesDe.indexOf(maCie) >= 0) ? maCie : ((this.compagnie && codesDe.indexOf(this.compagnie) >= 0 && (!v || this.compagnie !== v.compagnie)) ? this.compagnie : codesDe[0]);
    var aDefaut = v ? v.compagnie : (tous.filter(function (x) { return x !== deDefaut; })[0] || '');
    var selDe = h('select.saisie.ech-de', { 'aria-label': 'Concession demandeuse' }, codesDe.map(function (x) { return h('option', { value: x, selected: x === deDefaut || null, text: nomCie(x) }); }));
    var selA = h('select.saisie.ech-a', { 'aria-label': 'Concession qui a le véhicule', disabled: !!v || null }, tous.map(function (x) { return h('option', { value: x, selected: x === aDefaut || null, text: nomCie(x) }); }));
    var modele = h('input.saisie.ech-modele', { type: 'text', maxlength: '80', placeholder: 'Ex. : Silverado 1500 LT 2026, noir, 5.3L', autocomplete: 'off' });
    var vin = h('input.saisie.ech-vin', { type: 'text', maxlength: '17', placeholder: 'NIV (facultatif, 17 caractères)', autocomplete: 'off', style: { textTransform: 'uppercase' } });
    var message = h('input.saisie.ech-message', { type: 'text', maxlength: '300', placeholder: 'Ex. : client prêt à signer, livraison vendredi (facultatif)', autocomplete: 'off' });
    var apercu = h('div.neufs-ech-texto');
    var lire = function () { return { compagnie: selDe.value, aCompagnie: selA.value, vin: v ? v.vin : vin.value.trim().toUpperCase(), modele: v ? '' : modele.value.trim(), message: message.value.trim() }; };
    var rendre = function () {
      var o = lire();
      Array.prototype.forEach.call(selA.options, function (op) { op.disabled = op.value === o.compagnie; });
      if (selA.value === o.compagnie) { var autre = tous.filter(function (x) { return x !== o.compagnie; })[0]; if (autre) selA.value = autre; o = lire(); }
      apercu.textContent = 'Texto aux responsables de ' + nomCie(o.aCompagnie) + ' :\n' + textoEchange({ id: '', deCompagnie: o.compagnie, parNom: AMX.session.nom || AMX.session.courriel, modele: v ? nomVehicule(v) + (v.couleur ? ' ' + v.couleur : '') : o.modele, stock: v ? v.stock : '', vin: o.vin, message: o.message });
    };
    [selDe, selA, modele, vin, message].forEach(function (el) { el.addEventListener('input', rendre); el.addEventListener('change', rendre); });
    var corps = h('div.neufs-ech-form', [
      h('label', 'Concession qui demande'), selDe,
      h('label', 'Concession qui a le véhicule'), selA,
      h('label', 'Véhicule demandé'),
      v ? h('div.neufs-ech-veh', [h('b', { text: nomVehicule(v) + (v.couleur ? ' · ' + v.couleur : '') }), h('div.doux.petit', { text: (v.stock ? '# ' + v.stock + ' · ' : '') + v.vin + ' · ' + nomCie(v.compagnie) })]) : h('div.grille', [modele, vin]),
      h('label', 'Message (facultatif)'), message,
      apercu,
      e.textosActifs === false ? h('p.neufs-absent-dms', { style: { marginTop: '10px' }, text: 'Les textos ne sont pas activés : la demande sera enregistrée mais aucun texto ne partira.' }) : h('p.doux.petit', { style: { margin: '10px 0 0' }, text: 'Les responsables de la concession répondent OUI ou NON au texto (avec le numéro E…) : un OUI marque le véhicule « Échangé » à ' + nomCie(deDefaut) + ' et vous prévient par texto et courriel.' })
    ]);
    rendre();
    AMX.modale({ titre: 'Demande d\'échange par texto', corps: corps, large: true, boutons: [
      { texte: 'Annuler', action: function (fermer) { fermer(); } },
      { texte: 'Envoyer le texto', classe: 'primaire neufs-ech-envoyer', action: function () {
        var o = lire();
        if (!v && !o.modele && !o.vin) { AMX.toast('Indiquez le véhicule demandé (modèle recherché ou NIV).', 'attention'); return false; }
        if (o.vin && !/^[A-HJ-NPR-Z0-9]{17}$/.test(o.vin)) { AMX.toast('NIV invalide (17 caractères).', 'attention'); return false; }
        return AMX.post(Object.assign({ action: 'echangeCreer' }, o)).then(function (r) {
          if (r && r.refuse) throw new Error(r.erreur || 'Refusé.');
          if (!r || (!r.ok && !r.echange)) throw new Error((r && r.erreur) || 'Réponse inattendue.');
          AMX.toast(r.ok ? 'Demande ' + r.echange.id + ' envoyée par texto à ' + r.envoyes + ' responsable' + (r.envoyes > 1 ? 's' : '') + ' de ' + nomCie(o.aCompagnie) : 'Demande ' + r.echange.id + ' enregistrée — ' + (r.erreur || 'aucun texto parti'), r.ok ? 'ok' : 'attention');
          return self.chargerEchanges().then(function () { self.montrer('echanges', { defiler: true }); return true; });
        }).catch(function (err) { AMX.toast('Demande impossible — ' + AMX.erreurTexte(err), 'erreur'); return false; });
      } }
    ] });
  };
  /* Répondre depuis le site (oui / non) ou annuler sa demande. Un OUI recharge les neufs (le véhicule passe « Échangé »). */
  VueNeufs.prototype.repondreEchange = function (o, reponse) {
    var self = this;
    var note = h('input.saisie.ech-note', { type: 'text', maxlength: '200', placeholder: reponse === 'oui' ? 'Ex. : transfert mardi (facultatif)' : (reponse === 'non' ? 'Ex. : déjà vendu (facultatif)' : 'Raison (facultatif)'), autocomplete: 'off' });
    var titres = { oui: 'Accepter l\'échange ' + o.id + ' ?', non: 'Refuser l\'échange ' + o.id + ' ?', annuler: 'Annuler la demande ' + o.id + ' ?' };
    var textes = { oui: (o.vin ? o.modele + (o.stock ? ' # ' + o.stock : '') + ' sera marqué « Échangé » à ' + (o.deNom || nomCie(o.deCompagnie)) + ' et ' : 'La demande sera acceptée et ') + (o.parNom || o.par) + ' sera prévenu par texto et courriel.', non: (o.parNom || o.par) + ' sera prévenu du refus par texto et courriel.', annuler: 'La demande ne pourra plus être acceptée ; les responsables de ' + (o.aNom || nomCie(o.aCompagnie)) + ' qui répondraient par texto seront avisés qu\'elle est annulée.' };
    var corps = h('div', [h('p', { style: { margin: '0 0 10px', color: 'var(--encre-2)', lineHeight: '1.5' }, text: textes[reponse] }), note]);
    return AMX.confirmer(titres[reponse], corps, { ok: { oui: 'Accepter', non: 'Refuser', annuler: 'Annuler la demande' }[reponse], danger: reponse !== 'oui' }).then(function (ok) {
      if (!ok) return;
      return AMX.post({ action: 'echangeRepondre', id: o.id, reponse: reponse, note: note.value.trim() }).then(function (r) {
        AMX.verifier(r, 'Réponse refusée.');
        AMX.toast('Échange ' + o.id + ' ' + ({ oui: 'accepté', non: 'refusé', annuler: 'annulé' }[reponse]) + (r.marque ? ' — véhicule marqué « Échangé »' : ''), 'ok');
        if (r.marque) { AMX.neufs.vider(); return self.charger(true); }
        return self.chargerEchanges();
      }).catch(function (e) { AMX.toast('Échec — ' + AMX.erreurTexte(e), 'erreur'); });
    });
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
    var self = this;
    var filtre = function (l, flotte, marque) { return (l || []).filter(function (x) { return (!c || x.compagnie === c) && self.garde(flotte(x)) && (!self.marque || marque(x) === self.marque); }); };
    var cies = c ? [c] : Object.keys(PORTAILS), etats = p.etats || {}, tableaux = {};
    var lus = cies.filter(function (x) { return etats[x] && etats[x].le; });
    cies.forEach(function (x) { if (p.tableaux && p.tableaux[x]) tableaux[x] = p.tableaux[x]; });
    var neuves = (p.ventes || []).filter(venteNeuve), usagees = (p.ventes || []).filter(function (v) { return !venteNeuve(v) && (!c || v.compagnie === c); });
    var commandes = filtre(p.commandes, commandeFlotte, marqueCommande), autresAnnees = {}, anneeMin = new Date().getFullYear();
    // Maxime (12 oct.) : « je vois des commandes 2023 chez Hawks, faut enlever ça » : les années-modèle plus vieilles que l'année
    // civile en cours (vieilles commandes jamais fermées dans le carnet du constructeur) sont masquées ; un clic les ramène.
    if (!this.commandesToutesAnnees) commandes = commandes.filter(function (x) { var a = Number(x.annee) || 0; if (!a || a >= anneeMin) return true; var k = String(x.annee); autresAnnees[k] = (autresAnnees[k] || 0) + (x.n || 0); return false; });
    return { ventes: filtre(neuves, venteFlotte, function (v) { return nomMarque(v.marque); }), ventesUsagees: usagees, commandes: commandes, autresAnnees: autresAnnees, anneeMin: anneeMin, etats: etats, tableaux: tableaux, lus: lus, cies: cies, montants: !!p.montants, factures: p.factures || {} };
  };
  /* (11 oct.) Tableau du constructeur — portail RDR BMW : objectifs (mois et cumul), crédits, RDR à compléter, usagés déclarés. */
  VueNeufs.prototype.rendreTableau = function (pv) {
    var self = this, cies = Object.keys(pv.tableaux || {});
    if (!cies.length) return null;
    var cie = cies[0], t = pv.tableaux[cie], o = t.objectifs || {}, cr = t.credits || {}, aFaire = t.aFaire || [];
    var fmtObj = function (x) { return x && x.objectif ? AMX.fmtNombre(x.reel || 0) + ' / ' + AMX.fmtNombre(x.objectif) : (x && x.reel !== null && x.reel !== undefined ? AMX.fmtNombre(x.reel) : '—'); };
    var pct = function (x) { return x && x.objectif ? Math.round(100 * (x.reel || 0) / x.objectif) : null; };
    var couleur = function (x) { var p = pct(x); return p === null ? 'gris' : (p >= 100 ? 'vert' : (p >= 85 ? 'ambre' : 'rouge')); };
    var moisLib = o.periode ? libMois(o.periode) : 'mois en cours';
    var carte = function (cls, nom, n, bas, action) { var b = h('button.neufs-carte.' + cls, { type: 'button' }, [h('div.nom', { text: nom }), h('div.n', { text: n }), bas ? h('div.bas', { text: bas }) : null]); if (action) b.addEventListener('click', action); return b; };
    var tuiles = h('div.neufs-cartes', { style: { marginBottom: '0' } });
    var m = o.mois || {}, cu = o.cumul || {};
    if (m.neufs) tuiles.appendChild(carte(couleur(m.neufs), 'Neufs + démos — ' + moisLib, fmtObj(m.neufs), (pct(m.neufs) !== null ? pct(m.neufs) + ' % de l\'objectif' : 'pas d\'objectif') + (m.neufs.vsAnDernier !== null && m.neufs.vsAnDernier !== undefined ? ' · ' + m.neufs.vsAnDernier + ' % de l\'an dernier' : '')));
    if (m.usages) tuiles.appendChild(carte(couleur(m.usages), 'Usagés — ' + moisLib, fmtObj(m.usages), (pct(m.usages) !== null ? pct(m.usages) + ' % de l\'objectif' : 'pas d\'objectif') + (m.usages.vsAnDernier ? ' · ' + m.usages.vsAnDernier + ' % de l\'an dernier' : '')));
    if (cu.neufs) tuiles.appendChild(carte(couleur(cu.neufs), 'Neufs + démos — cumul ' + (o.annee || ''), fmtObj(cu.neufs), pct(cu.neufs) !== null ? pct(cu.neufs) + ' % de l\'objectif annuel' : 'pas d\'objectif'));
    if (cu.usages) tuiles.appendChild(carte(couleur(cu.usages), 'Usagés — cumul ' + (o.annee || ''), fmtObj(cu.usages), pct(cu.usages) !== null ? pct(cu.usages) + ' % de l\'objectif annuel' : 'pas d\'objectif'));
    var tot = cr.total || {};
    if (cr.total) tuiles.appendChild(carte(tot.attente ? 'ambre' : 'vert', 'Crédits ' + nomMarque(cie) + ' approuvés', AMX.fmtArgent(tot.approuve || 0, 0), 'depuis ' + (cr.depuis || '—') + ' · en attente ' + AMX.fmtArgent(tot.attente || 0, 0) + (tot.refuse ? ' · refusés ' + AMX.fmtArgent(tot.refuse, 0) : '')));
    var parType = {}; aFaire.forEach(function (l) { var k = RDR_TYPES_BMW[l.type] || l.type || '—'; parType[k] = (parType[k] || 0) + 1; });
    tuiles.appendChild(carte(aFaire.length ? 'rouge' : 'vert', 'RDR à compléter', AMX.fmtNombre(aFaire.length), aFaire.length ? Object.keys(parType).map(function (k) { return k + ' ' + parType[k]; }).join(' · ') : 'rien en suspens sur le portail'));
    var usag = pv.ventesUsagees.filter(function (v) { return String(v.dateVente) >= debut12Mois(); }), parU = {}; usag.forEach(function (v) { var k = RDR_TYPES_BMW[v.typeCode] || v.typeVente || '—'; parU[k] = (parU[k] || 0) + 1; });
    if (usag.length) tuiles.appendChild(carte('sombre', 'Usagés déclarés — 12 mois', AMX.fmtNombre(usag.length), Object.keys(parU).map(function (k) { return k + ' ' + parU[k]; }).join(' · ')));
    var corps = [tuiles];
    if (aFaire.length) {
      var rows = aFaire.slice(0, 80).map(function (l) { return h('tr', [h('td', { text: RDR_TYPES_BMW[l.type] || l.type || '—' }), h('td', { text: l.dateRdr ? AMX.fmtDate(l.dateRdr) : '—' }), h('td.vehicule', [h('div.nom', { text: l.vehicule || '—' }), h('div.vin', { text: l.vin || '' })]), h('td', { text: l.client || '—' }), h('td', { text: l.conseiller || '—' }), h('td', [h('span.badge.' + (/corriger/.test(l.statut || '') ? 'rouge' : 'ambre'), { text: l.statut || '—' })])]); });
      corps.push(h('h3', { style: { margin: '14px 0 6px' }, text: 'RDR à compléter sur le portail (' + aFaire.length + ')' }));
      corps.push(h('div.neufs-table', [h('table.tableau', [h('thead', [h('tr', [h('th', 'Type'), h('th', 'Date RDR'), h('th', 'Véhicule'), h('th', 'Client'), h('th', 'Conseiller'), h('th', 'Statut')])]), h('tbody', rows)])]));
      corps.push(h('p.doux.petit', { style: { margin: '6px 0 0' }, text: 'Les RDR « à corriger » bloquent le crédit du constructeur : à régler sur le portail (RDR › RDR List). Un usagé vendu en gros (encan) doit être déclaré en « Wholesale Registration ».' + (aFaire.length > 80 ? ' … ' + (aFaire.length - 80) + ' autres sur le portail.' : '') }));
    }
    if (cr.mois && cr.mois.length) {
      corps.push(h('h3', { style: { margin: '14px 0 6px' }, text: 'Crédits ' + nomMarque(cie) + ' par mois' }));
      corps.push(h('table.tableau', [h('thead', [h('tr', [h('th', 'Mois'), h('th.num', 'Approuvés'), h('th.num', 'En attente'), h('th.num', 'Refusés'), h('th.num', 'NIV')])]), h('tbody', cr.mois.slice(0, 13).map(function (x) { var n = (cr.lignes || []).filter(function (l) { return l.periode === x.periode; }).length; return h('tr', [h('td', { text: libMois(x.periode) }), h('td.num', { text: AMX.fmtArgent(x.approuve || 0, 0) }), h('td.num', { style: x.attente ? { color: 'var(--ambre)', fontWeight: '600' } : {}, text: x.attente ? AMX.fmtArgent(x.attente, 0) : '—' }), h('td.num', { text: x.refuse ? AMX.fmtArgent(x.refuse, 0) : '—' }), h('td.num', { text: n ? String(n) : '—' })]); }))]));
    }
    return h('div.carte', [
      h('div.carte-entete', [h('h2', ['Objectifs et crédits ' + nomMarque(cie) + ' (portail RDR)', h('span.sous', { text: 'lu le ' + AMX.fmtDate(t.luLe, true) + (t.par ? ' par ' + String(t.par).split('@')[0] : '') })]), peutImporterPortail() ? h('button.btn.petit', { type: 'button', html: I.externe + '<span>Relire le portail</span>', onclick: function () { self.ouvrirSignet(cie); } }) : null]),
      h('div.carte-corps', corps)
    ]);
  };
  VueNeufs.prototype.rendrePortailOnglets = function () {
    if (!this.donnees) return;
    var enStock = this.visibles().filter(function (v) { return v.enStock; });
    this.rendreFlotte(); this.rendreMarques(); this.rendrePipeline(enStock); this.rendreCommandes(); this.rendreVentes(); this.rendreOnglets();
  };
  /* Bande « pipeline » : commandées → en transit → en stock → démos / courtoisie → vendues (RDR). Chaque étape mène au détail. */
  VueNeufs.prototype.rendrePipeline = function (enStock) {
    var self = this, pv = this.portailVisible();
    AMX.vider(this.elPipeline);
    var statut = function (cle) { return enStock.filter(function (v) { return String(v.statutLibelle || '').toUpperCase() === cle; }).length; };
    var transit = enStock.filter(function (v) { return /TRANSIT/.test(String(v.statutLibelle || '').toUpperCase()); }).length;
    var demos = enStock.filter(estDemo).length, echanges = enStock.filter(estEchange).length;
    var terrain = statut('EN-INVENT.');
    var commandes = pv.commandes.filter(function (x) { return !commandeAttente(x); }).reduce(function (s, x) { return s + (x.n || 0); }, 0);
    var attente = pv.commandes.filter(commandeAttente).reduce(function (s, x) { return s + (x.n || 0); }, 0);
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
    if (attente) etapes.push(etape('gris', 'En attente (RFO)', attente, 'demandes d\'allocation, années à venir', function () { self.montrer('commandes', { defiler: true }); }));
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
    var total = pv.commandes.filter(function (x) { return !commandeAttente(x); }).reduce(function (s, x) { return s + (x.n || 0); }, 0);
    var totalAttente = pv.commandes.filter(commandeAttente).reduce(function (s, x) { return s + (x.n || 0); }, 0);
    var carte = h('div.carte');
    carte.appendChild(h('div.carte-entete', [h('h2', ['Commandes chez le constructeur', h('span.sous', { text: (total || totalAttente ? total + ' commandée' + (total > 1 ? 's' : '') + (totalAttente ? ' · ' + totalAttente + ' en attente (RFO, années à venir)' : '') : '') + (lu ? (total || totalAttente ? ' · ' : '') + lu : '') })]), peutImporterPortail() ? h('button.btn.petit', { type: 'button', html: I.externe + '<span>Relire le portail</span>', onclick: function () { self.ouvrirSignet(pv.lus[0] || pv.cies[0]); } }) : null]));
    if (!pv.commandes.length) {
      carte.appendChild(h('div.carte-corps', [h('div.neufs-vide', { text: pv.lus.length ? 'Aucune commande en cours au dernier passage.' : 'Pas encore de lecture du portail : cliquez le favori « Automax ← Constructeur » sur le portail du constructeur, connecté.' })]));
      this.elCommandes.appendChild(carte); return;
    }
    // Par modèle (regroupé), détail version · couleur · type en dessous
    var parModele = {};
    pv.commandes.forEach(function (x) { var k = x.modele || '—'; var m = parModele[k] || (parModele[k] = { modele: k, n: 0, attente: 0, lignes: [], annees: {}, cies: {} }); if (commandeAttente(x)) m.attente += x.n || 0; else m.n += x.n || 0; m.lignes.push(x); if (x.annee) m.annees[x.annee] = (m.annees[x.annee] || 0) + (x.n || 0); if (!self.compagnie) m.cies[x.compagnie] = (m.cies[x.compagnie] || 0) + (x.n || 0); });
    var modeles = Object.keys(parModele).map(function (k) { return parModele[k]; }).sort(function (a, b) { return (b.n + b.attente) - (a.n + a.attente) || a.modele.localeCompare(b.modele); });
    var enStockPar = {}; this.visibles().forEach(function (v) { if (v.enStock && !/TRANSIT/.test(String(v.statutLibelle || '').toUpperCase())) enStockPar[v.modele || '—'] = (enStockPar[v.modele || '—'] || 0) + 1; });
    var transitPar = {}; this.visibles().forEach(function (v) { if (v.enStock && /TRANSIT/.test(String(v.statutLibelle || '').toUpperCase())) transitPar[v.modele || '—'] = (transitPar[v.modele || '—'] || 0) + 1; });
    var g = groupes(this.visibles(), this.mouvements()), sortiesPar = {}; g.modeles.forEach(function (m) { sortiesPar[m.modele] = m.sorties; });
    var corps = h('tbody');
    modeles.forEach(function (m) {
      var annees = Object.keys(m.annees).sort().map(function (a) { return a + ' ×' + m.annees[a]; }).join(', ');
      var tr = h('tr.modele', [h('td', [h('b', { text: m.modele }), self.compagnie ? null : h('span.doux.petit', { text: ' ' + Object.keys(m.cies).map(function (c) { return nomCie(c) + ' ' + m.cies[c]; }).join(' · ') })]), h('td', { text: annees })].concat(totalAttente ? [h('td.num.doux', { text: m.attente ? String(m.attente) : '' })] : []).concat([h('td.num', [h('b', { text: m.n ? String(m.n) : '' })]), h('td.num', { text: transitPar[m.modele] ? String(transitPar[m.modele]) : '' }), h('td.num', { text: enStockPar[m.modele] ? String(enStockPar[m.modele]) : '' }), h('td.num', { text: sortiesPar[m.modele] ? String(sortiesPar[m.modele]) : '' })]));
      var ouvert = false, details = [];
      tr.addEventListener('click', function () { ouvert = !ouvert; details.forEach(function (d) { d.classList.toggle('cache', !ouvert); }); tr.classList.toggle('ouvert', ouvert); });
      corps.appendChild(tr);
      m.lignes.sort(function (a, b) { return (commandeAttente(a) ? 1 : 0) - (commandeAttente(b) ? 1 : 0) || (b.n || 0) - (a.n || 0); }).forEach(function (x) {
        var d = h('tr.version.cache', [h('td', { text: [x.annee, x.version || '—', x.couleur].filter(Boolean).join(' · ') + (x.typeCommande ? ' — ' + (x.source === 'gm' ? (commandeFlotte(x) ? 'flotte' : 'détail') + ' (' + x.typeCommande + ')' : x.typeCommande) : '') + (x.ncp ? ' · NCP ' + x.ncp + (x.ncpNom ? ' — ' + x.ncpNom : '') : '') + (commandeAttente(x) ? ' · en attente (RFO)' : '') }), h('td')].concat(totalAttente ? [h('td.num.doux', { text: commandeAttente(x) ? String(x.n || 0) : '' })] : []).concat([h('td.num', { text: commandeAttente(x) ? '' : String(x.n || 0) }), h('td'), h('td'), h('td')]));
        details.push(d); corps.appendChild(d);
      });
    });
    corps.appendChild(h('tr.total', [h('td', 'Total'), h('td')].concat(totalAttente ? [h('td.num.doux', { text: String(totalAttente) })] : []).concat([h('td.num', [h('b', { text: String(total) })]), h('td.num', { text: String(Object.keys(transitPar).reduce(function (s, k) { return s + transitPar[k]; }, 0) || '') }), h('td.num', { text: String(Object.keys(enStockPar).reduce(function (s, k) { return s + enStockPar[k]; }, 0) || '') }), h('td.num', { text: String(g.total.sorties || '') })])));
    carte.appendChild(h('div.carte-corps', [
      h('div.neufs-cmd', { style: { overflowX: 'auto' } }, [h('table.tableau', [h('thead', [h('tr', [h('th', 'Modèle'), h('th', 'Années-modèle')].concat(totalAttente ? [h('th.num', { text: 'En attente', title: 'RFO : demandes d\'allocation pas encore commandées, années-modèle à venir seulement' })] : []).concat([h('th.num', 'Commandées'), h('th.num', 'En transit'), h('th.num', 'En stock'), h('th.num', 'Sorties ' + g.fenetre + ' j')]))]), corps])]),
      (function () { var a = Object.keys(pv.autresAnnees || {}).sort().reverse(); if (!a.length && !self.commandesToutesAnnees) return null; return h('p.doux.petit.neufs-cmd-annees', { style: { margin: '8px 0 0' } }, [h('span', { text: self.commandesToutesAnnees ? 'Toutes les années-modèle sont affichées, même les vieilles commandes jamais fermées. ' : 'Vieilles commandes masquées (année-modèle avant ' + pv.anneeMin + ', jamais fermées dans le carnet du constructeur) : ' + a.map(function (k) { return k + ' (' + pv.autresAnnees[k] + ')'; }).join(', ') + '. ' }), h('a', { text: self.commandesToutesAnnees ? 'Les masquer' : 'Les afficher', onclick: function () { self.commandesToutesAnnees = !self.commandesToutesAnnees; self.rendre(); } })]); })(),
      h('p.doux.petit', { style: { margin: '8px 0 0' }, text: 'Cliquez un modèle pour le détail par version et couleur.' + (totalAttente ? ' « En attente » = demandes d\'allocation (RFO) des années-modèle à venir, pas encore commandées ; les RFO des années passées ne sont pas comptées.' : '') + ' Les sorties sont celles des ' + g.fenetre + ' derniers jours : commandes + transit + stock très au-dessus des sorties = surapprovisionnement à venir.' + (etat && etat.stock ? ' Dernier passage : ' + (etat.stock.total || 0) + ' NIV (' + (etat.stock.enStock || 0) + ' en stock, ' + (etat.stock.demos || 0) + ' démos / courtoisie, ' + (etat.stock.transit || 0) + ' en transit)' + (etat.stock.initial ? ' — premier import' : ' · ' + (etat.stock.arrivees || 0) + ' arrivée' + (etat.stock.arrivees > 1 ? 's' : '') + ', ' + (etat.stock.sorties || 0) + ' sortie' + (etat.stock.sorties > 1 ? 's' : '')) + '.' : '') })
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
    var tableau = this.rendreTableau(pv);
    if (tableau) this.elVentes.appendChild(tableau);
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
    mois.forEach(function (m) { m.par = {}; });
    pv.ventes.forEach(function (v) { var k = String(v.dateVente).slice(0, 7); if (parMois[k]) { parMois[k].n++; total12++; var t = groupeTypeVente(v.typeVente); parType[t] = (parType[t] || 0) + 1; parMois[k].par[t] = (parMois[k].par[t] || 0) + 1; var m = v.modele || '—'; parModele[m] = parModele[m] || { n: 0, cout: 0, nCout: 0 }; parModele[m].n++; if (v.coutFacture) { parModele[m].cout += v.coutFacture; parModele[m].nCout++; } } if (k === cleMois) ceMois++; if (k === moisPrec) nPrec++; });
    var jourMois = now.getDate(), rythme = ceMois / Math.max(1, jourMois), joursMois = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    carte.appendChild(h('div.carte-entete', [h('h2', ['Ventes déclarées au constructeur (RDR)', h('span.sous', { text: total12 + ' sur 12 mois · ' + ceMois + ' ce mois' + (lu ? ' · ' + lu : '') })]), h('span.doux.petit', { text: 'livraisons déclarées, pas les profits (voir Résultat › Véhicules neufs)' })]));
    // Tableau par mois (Maxime, 12 oct. : « le tableau met le nombre par mois ») : une ligne par mois, le total et les familles de vente
    var familles = GROUPES_VENTE.filter(function (g) { return parType[g]; }).concat(parType['—'] ? ['—'] : []);
    var colMois = h('div', [
      h('h3', { text: 'Par mois — 12 mois' }),
      h('table.tableau.neufs-ventes-mois', [
        h('thead', [h('tr', [h('th', 'Mois'), h('th.num', 'Ventes')].concat(familles.map(function (g) { return h('th.num', { text: g === '—' ? 'Sans type' : g }); })))]),
        h('tbody', mois.map(function (m, i) {
          return h('tr' + (i === 11 ? '.actuel' : '') + (m.n ? '' : '.vide'), [h('td', { text: libelleMois(m.cle) + (i === 11 ? ' (en cours)' : '') }), h('td.num', [h('b', { text: String(m.n) })])].concat(familles.map(function (g) { return h('td.num', { text: m.par[g] ? String(m.par[g]) : '' }); })));
        }).concat([h('tr.total', [h('td', '12 mois'), h('td.num', [h('b', { text: String(total12) })])].concat(familles.map(function (g) { return h('td.num', { text: String(parType[g] || '') }); })))]))
      ]),
      h('p.doux.petit', { style: { margin: '6px 0 0' }, text: 'Ce mois : ' + ceMois + ' en ' + jourMois + ' jour' + (jourMois > 1 ? 's' : '') + (ceMois ? ' (≈ ' + Math.round(rythme * joursMois) + ' au rythme actuel)' : '') + ' · mois précédent : ' + nPrec + '. Détail = particulier ; Entreprise = achat d\'une entreprise ou d\'un organisme ; Démo / courtoisie = CTP, démos et prêts.' })
    ]);
    var modeles = Object.keys(parModele).sort(function (a, b) { return parModele[b].n - parModele[a].n; }).slice(0, 10);
    var colModeles = h('div', [
      h('h3', { text: 'Par modèle — 12 mois' }),
      h('table.tableau', [h('thead', [h('tr', [h('th', 'Modèle'), h('th.num', 'Ventes'), h('th.num', 'Part')].concat(pv.montants ? [h('th.num', 'Coût facture moy.')] : []))]), h('tbody', modeles.map(function (m) { var x = parModele[m]; return h('tr', [h('td', { text: m }), h('td.num', { text: String(x.n) }), h('td.num', { text: Math.round(100 * x.n / Math.max(1, total12)) + ' %' })].concat(pv.montants ? [h('td.num', { text: x.nCout ? AMX.fmtArgent(x.cout / x.nCout, 0) : '—' })] : [])); }))])
    ]);
    carte.appendChild(h('div.carte-corps', [h('div.neufs-portail-grille', [colMois, colModeles])]));
    this.elVentes.appendChild(carte);
    // Livraisons déclarées avec filtres (Maxime, 11 oct. : « mettre un filtre aux livraisons déclarées ») : période, type, modèle,
    // conseiller, recherche (NIV, client, modèle) ; 60 jours par défaut, 200 lignes au plus à l'écran (export pour le tout).
    this.filtresVentes = this.filtresVentes || { q: '', type: '', modele: '', conseiller: '', periode: '60' };
    var fv = this.filtresVentes, toutes = pv.ventes.slice().sort(function (a, b) { return String(b.dateVente).localeCompare(String(a.dateVente)); });
    var depuis = fv.periode === '12m' ? debut12Mois() : isoJoursAvant(Number(fv.periode) || 60);
    var recentes = toutes.filter(function (v) { return String(v.dateVente) >= depuis; });
    if (recentes.length || toutes.length) {
      var elLivr = h('div.neufs-table'), elCompteLivr = h('span.sous');
      var options = function (sel, valeurs, libelleTous, courant) { AMX.vider(sel); sel.appendChild(h('option', { value: '', text: libelleTous })); valeurs.forEach(function (x) { sel.appendChild(h('option', { value: x[0], selected: courant === x[0], text: x[1] })); }); };
      var comptes = function (liste, cle, fmt) { var n = {}; liste.forEach(function (v) { var k = cle(v); if (k) n[k] = (n[k] || 0) + 1; }); return Object.keys(n).sort(function (a, b) { return n[b] - n[a] || a.localeCompare(b); }).map(function (k) { return [k, (fmt ? fmt(k) : k) + ' (' + n[k] + ')']; }); };
      var selPeriode = h('select.saisie', { 'aria-label': 'Période', onchange: function (e) { fv.periode = e.target.value; self.rendreVentes(); } });
      [['30', '30 jours'], ['60', '60 jours'], ['90', '90 jours'], ['12m', '12 mois']].forEach(function (o) { selPeriode.appendChild(h('option', { value: o[0], selected: fv.periode === o[0], text: o[1] })); });
      var selType = h('select.saisie', { 'aria-label': 'Type', onchange: function (e) { fv.type = e.target.value; dessiner(); } });
      var selModele = h('select.saisie', { 'aria-label': 'Modèle', onchange: function (e) { fv.modele = e.target.value; dessiner(); } });
      var selConseiller = h('select.saisie', { 'aria-label': 'Conseiller', onchange: function (e) { fv.conseiller = e.target.value; dessiner(); } });
      var inputQ = h('input.saisie', { type: 'search', placeholder: 'NIV, client, modèle…', value: fv.q, oninput: AMX.debounce(function (e) { fv.q = e.target.value; dessiner(); }, 120) });
      options(selType, comptes(recentes, function (v) { return groupeTypeVente(v.typeVente); }), 'Tous les types', fv.type);
      options(selModele, comptes(recentes, function (v) { return v.modele || '—'; }), 'Tous les modèles', fv.modele);
      var conseillers = comptes(recentes, function (v) { return v.conseiller || ''; });
      options(selConseiller, conseillers, 'Tous les conseillers', fv.conseiller);
      selConseiller.classList.toggle('cache', !conseillers.length);
      var dessiner = function () {
        var q = fv.q.trim().toUpperCase();
        var lignes = recentes.filter(function (v) { return (!fv.type || groupeTypeVente(v.typeVente) === fv.type) && (!fv.modele || (v.modele || '—') === fv.modele) && (!fv.conseiller || v.conseiller === fv.conseiller) && (!q || [v.vin, v.client, v.modele, v.version, v.couleur, v.annee, v.conseiller, v.saisiPar, v.reference].join(' ').toUpperCase().indexOf(q) >= 0); });
        AMX.vider(elLivr);
        elCompteLivr.textContent = lignes.length + (lignes.length !== recentes.length ? ' sur ' + recentes.length : '') + ' · ' + (fv.periode === '12m' ? '12 mois' : fv.periode + ' jours');
        if (!lignes.length) { elLivr.appendChild(h('div.neufs-vide', { text: recentes.length ? 'Aucune livraison déclarée ne correspond aux filtres.' : 'Aucune livraison déclarée sur cette période.' })); return; }
        var avecClient = lignes.some(function (v) { return v.client; }), avecPar = lignes.some(function (v) { return v.saisiPar; }), avecConseiller = lignes.some(function (v) { return v.conseiller; });
        var nCol = 4 + (avecClient ? 1 : 0) + (avecConseiller ? 1 : 0) + (avecPar ? 1 : 0) + (pv.montants ? 1 : 0);
        // Structuré par mois (Maxime, 12 oct.) : une ligne d'en-tête par mois avec le total et les familles, puis les livraisons du mois
        var rows = [], moisCourant = '', parMoisL = {};
        lignes.forEach(function (v) { var k = String(v.dateVente).slice(0, 7); var m = parMoisL[k] || (parMoisL[k] = { n: 0, par: {} }); m.n++; var g = groupeTypeVente(v.typeVente); m.par[g] = (m.par[g] || 0) + 1; });
        lignes.slice(0, 200).forEach(function (v) {
          var k = String(v.dateVente).slice(0, 7);
          if (k !== moisCourant) { moisCourant = k; var m = parMoisL[k]; rows.push(h('tr.groupe', [h('td', { colspan: nCol }, [h('b', { text: libelleMois(k, true) + ' — ' + m.n + ' livraison' + (m.n > 1 ? 's' : '') }), h('span.doux', { text: ' · ' + GROUPES_VENTE.concat(['—']).filter(function (g) { return m.par[g]; }).map(function (g) { return (g === '—' ? 'sans type' : g) + ' ' + m.par[g]; }).join(' · ') })])])); }
          var g = groupeTypeVente(v.typeVente);
          rows.push(h('tr', [h('td', { text: AMX.fmtDate(v.dateVente) }), h('td.vehicule', [h('div.nom', { text: [v.annee, v.modele, v.version].filter(Boolean).join(' ') }), h('div.vin', { text: v.vin + (v.statut && !/compl/.test(v.statut) ? ' · ' + v.statut : '') })]), h('td', { text: v.couleur || '—' }), h('td.type', [h('div', { text: g }), v.typeVente && String(v.typeVente) !== g ? h('div.doux.petit', { text: String(v.typeVente) }) : null])].concat(avecClient ? [h('td', { text: v.client || '—' })] : []).concat(avecConseiller ? [h('td', { text: v.conseiller || '—' })] : []).concat(avecPar ? [h('td', { text: v.saisiPar || '—' })] : []).concat(pv.montants ? [h('td.num', { text: v.coutFacture ? AMX.fmtArgent(v.coutFacture) : '—' })] : [])));
        });
        elLivr.appendChild(h('table.tableau.neufs-livraisons', [h('thead', [h('tr', [h('th', 'Date'), h('th', 'Véhicule'), h('th', 'Couleur'), h('th', 'Type')].concat(avecClient ? [h('th', 'Client')] : []).concat(avecConseiller ? [h('th', 'Conseiller')] : []).concat(avecPar ? [h('th', 'Saisi par')] : []).concat(pv.montants ? [h('th.num', 'Coût facture')] : []))]), h('tbody', rows)]));
        if (lignes.length > 200) elLivr.appendChild(h('p.doux.petit', { style: { margin: '8px 0 0' }, text: '… et ' + (lignes.length - 200) + ' autres (export Excel pour le tout).' }));
      };
      dessiner();
      var c2 = h('div.carte', [h('div.carte-entete', [h('h2', ['Livraisons déclarées', elCompteLivr])]), h('div.carte-corps', [h('div.neufs-outils.neufs-filtres-ventes', [h('div.recherche', [h('span', { html: I.recherche }), inputQ]), selPeriode, selType, selModele, selConseiller]), elLivr])]);
      this.elVentes.appendChild(c2);
    }
  };
  /* Fenêtre du signet : le favori à glisser, le mode d'emploi, les liens vers le portail et le CSI. */
  VueNeufs.prototype.ouvrirSignet = function (cie) {
    var p = PORTAILS[cie] || PORTAILS.HYUNDAI, code = p.signet();
    var signet = h('a.btn.primaire', { href: code, text: 'Automax ← Constructeur', title: 'Glissez ce bouton dans votre barre de favoris', draggable: 'true' });
    signet.addEventListener('click', function (e) { e.preventDefault(); AMX.toast('Glissez ce bouton dans la barre de favoris de Chrome (Cmd+Shift+B pour l\'afficher), puis cliquez-le depuis le portail, connecté.', 'attention', 8000); });
    var corps = h('div', [
      h('p', { style: { margin: '0 0 12px', color: 'var(--encre-2)', lineHeight: '1.5' } }, 'Un seul favori pour tous les portails des constructeurs (Hyundai, GM, BMW…), reconnu à l\'adresse de la page. Cliqué sur le portail des ventes, il lit l\'inventaire complet (en stock, démos et courtoisie, en transit, commandes en cours), les ventes déclarées des 12 derniers mois et, quand le portail les donne, les factures du constructeur (coût de chaque NIV), puis les envoie ici : le suivi des neufs se remplit comme avec un feed du DMS. Sur le portail RDR BMW (Retail Reporting), il lit les RDR des 12 mois, les RDR à compléter, les objectifs et les crédits. Cliqué sur le site CSI du constructeur (BoostCX, ISC InMoment), il lit les scores, le composite de la marque et les sondages (onglet CSI). Rien n\'est modifié sur les portails.'),
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
      c.addEventListener('click', function () { if (filtre) { var o = filtre(); self.rendreSelects(); self.montrer(typeof o === 'string' ? o : 'liste', { defiler: true }); } });   /* un filtre peut renvoyer le nom d'un onglet (12 oct. : « absents ») */
      return c;
    };
    var nDispo = enStock.filter(estDisponible).length, nMarq = enStock.filter(function (v) { return !!couleurRangee(v); }).length;
    this.elCartes.appendChild(carte('sombre', 'Disponibles', AMX.fmtNombre(nDispo), 'sur ' + enStock.length + ' en stock · ' + (nMarq ? nMarq + ' marqué' + (nMarq > 1 ? 's' : '') + ' par l\'équipe' : 'ni vendus, ni échangés, ni démos'), function () { self.filtres.dispo = 'dispo'; self.rendreTable(); }));
    this.elCartes.appendChild(carte(g.total.sorties ? 'vert' : 'gris', 'Sorties 90 jours', AMX.fmtNombre(g.total.sorties), g.total.sorties ? (Math.round(g.total.parJour * 7 * 10) / 10) + ' par semaine' : 'déduites du feed, d\'un jour à l\'autre', function () { self.montrer('analyse', { defiler: true }); }));
    this.elCartes.appendChild(carte(g.total.appro === null ? 'gris' : (g.total.appro > 90 ? 'rouge' : (g.total.appro > 60 ? 'ambre' : 'vert')), 'Jours d\'approvisionnement', g.total.appro === null ? '—' : fmtJours(g.total.appro), 'stock ÷ ventes/jour (90 j) · norme ~75 j'));
    this.elCartes.appendChild(carte(ages.length ? (moyenne(ages) > 90 ? 'rouge' : (moyenne(ages) > 60 ? 'ambre' : 'vert')) : 'gris', 'Âge moyen', fmtJours(moyenne(ages)), 'cible < 45 j · hors échanges et fantômes'));
    this.elCartes.appendChild(carte(pct60 > 10 ? 'rouge' : 'vert', 'Plus de 60 jours', AMX.fmtNombre(plus60) + ' (' + pct60 + ' %)', 'cible < 10 % · hors échanges et fantômes', function () { self.filtres.tranche = 'plus60'; self.rendreTable(); }));
    if (anneeMax) this.elCartes.appendChild(carte(ancienne ? 'ambre' : 'vert', 'Ancienne année-modèle', AMX.fmtNombre(ancienne), 'avant ' + anneeMax + ' — à écouler d\'abord', function () { self.filtres.annee = 'ancienne'; self.rendreTable(); }));
    if (detention !== null) this.elCartes.appendChild(carte('sombre', 'Coût de détention', AMX.fmtArgent(detention), AMX.fmtArgent(detentionJour) + ' / jour à ' + (d.parametres.tauxPlan || 5) + ' %'));
    // Maxime (12 oct.) : « les unités en stock chez le manufacturier [mais pas au DMS] : mettre le nombre dans un icône en haut, en rouge »
    var o = this.originesDispo(), c = this.compagnie;
    if (o.constructeur) {
      this.absents = this.calculerAbsentsDms();
      var nAbs = d.vehicules.filter(function (v) { return v.enStock && (!c || v.compagnie === c) && self.absentDms(v); }).length;
      var ref = c ? this.referenceAbsents(c) : (o.dms ? { type: 'dms' } : (d.referenceDms && Object.keys(d.referenceDms).length ? { type: 'feuille', source: 'feuille Google' } : null));
      var versListe = function () { self.origine = 'constructeur'; AMX.memo.ecrire('neufs_origine', 'constructeur'); self.filtres.dispo = 'absentDms'; self.rendre(); };
      if (ref && ref.type === 'dms') this.elCartes.appendChild(carte(nAbs ? 'rouge' : 'vert', 'Absents du DMS', AMX.fmtNombre(nAbs), nAbs ? 'en stock chez le manufacturier, pas au DMS' : 'tout le stock du manufacturier est au DMS', versListe));
      else if (ref && ref.type === 'feuille') this.elCartes.appendChild(carte(nAbs ? 'rouge' : 'vert', 'Absents du DMS', AMX.fmtNombre(nAbs), 'd\'après ' + (ref.source || 'la feuille Google') + (ref.le ? ' du ' + AMX.fmtDateCourte(String(ref.le).slice(0, 10)) : '') + ', en attendant le feed du DMS', versListe));
      else this.elCartes.appendChild(carte('gris', 'Absents du DMS', '—', 'aucun export du DMS à comparer'));
      // 12 oct. (Maxime : « absent de Global (manufacturier) mais dans le DMS ») — l'inverse, en rouge aussi ; le clic ouvre l'onglet
      var ab = this.absentsConstructeur();
      if (ab) {
        var src = c ? ab.sources[c] : null, nAb = ab.lignes.length;
        this.elCartes.appendChild(carte(nAb ? 'rouge' : 'vert', 'Absents du manufacturier', AMX.fmtNombre(nAb), nAb ? (src && src.type === 'feuille' ? 'sur ' + (src.source || 'la feuille Google') + ', pas au portail du manufacturier' : 'au DMS, pas au portail du manufacturier') : (src && src.type === 'feuille' ? 'toute la feuille Google est au portail' : 'tout le DMS est au portail du manufacturier'), function () { return 'absents'; }));
      }
    }
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
    // Disponibilité (11 oct.) : la première chose à voir — disponibles, vendus, échangés, démos (marquage interne ou DMS), exportables
    var enStockBase = base.filter(function (v) { return v.enStock; });
    var nDispo = enStockBase.filter(estDisponible).length, parCat = { vendu: 0, echange: 0, demo: 0, livre: 0 }, nExp = enStockBase.filter(function (v) { return estExportable(v) === 'oui'; }).length, nPunch = enStockBase.filter(estPunch).length;
    enStockBase.forEach(function (v) { var c = categorieIndispo(v); if (parCat[c] !== undefined) parCat[c]++; });
    var pastilleDispoF = function (cle, libelle, n, cls, titre) {
      return h('button.neufs-statut' + (cls ? '.' + cls : '') + (f.dispo === cle ? '.actif' : ''), { type: 'button', title: titre, onclick: function () { f.dispo = f.dispo === cle ? '' : cle; self.rendreSelects(); self.rendreTable(); } }, [cls ? h('i') : null, h('span', { text: libelle }), h('b', { text: AMX.fmtNombre(n) })]);
    };
    this.elStatuts.appendChild(h('span.etiquette', { text: 'Disponibilité' }));
    this.elStatuts.appendChild(pastilleDispoF('dispo', 'Disponibles', nDispo, 'dispo-oui', 'En stock, ni vendus, ni échangés, ni démos, ni livrés : à vendre maintenant (les pré-enregistrés en font partie)'));
    if (nPunch || f.dispo === 'punch') this.elStatuts.appendChild(pastilleDispoF('punch', 'Pré-enregistrés', nPunch, 'vert', 'Punchés / pré-enregistrés chez le constructeur, pas vendus (vert) — toujours disponibles'));
    this.elStatuts.appendChild(pastilleDispoF('vendu', 'Vendus', parCat.vendu, 'jaune', 'Marqués vendus par l\'équipe (jaune), ou vendus au DMS — pas encore livrés'));
    this.elStatuts.appendChild(pastilleDispoF('echange', 'Échangés', parCat.echange, 'orange', 'Échangés à un autre concessionnaire — « Trade » (orange)'));
    this.elStatuts.appendChild(pastilleDispoF('demo', 'Démos', parCat.demo, 'bleu', 'En service comme démo / courtoisie (bleu)'));
    if (parCat.livre || f.dispo === 'livre') this.elStatuts.appendChild(pastilleDispoF('livre', 'Livrés', parCat.livre, 'gris', 'Livrés au client, pas encore sortis du DMS (gris)'));
    if (nExp || f.dispo === 'exportable') this.elStatuts.appendChild(pastilleDispoF('exportable', 'Exportables', nExp, 'sarcelle', 'NIV marqués exportables'));
    this.absents = this.calculerAbsentsDms();
    var nAbs = enStockBase.filter(function (v) { return self.absentDms(v); }).length;
    var refP = this.compagnie ? this.referenceAbsents(this.compagnie) : null;
    if (nAbs || f.dispo === 'absentDms') this.elStatuts.appendChild(pastilleDispoF('absentDms', 'Absents du DMS', nAbs, 'rouge', refP && refP.type === 'feuille' ? 'En stock au portail du manufacturier mais pas sur ' + refP.texte + ' (rouge)' : 'En stock au portail du manufacturier mais pas dans l\'export du DMS (rouge) — à vérifier au DMS'));
    this.elStatuts.appendChild(h('span.sep'));
    this.elStatuts.appendChild(h('span.etiquette', { text: 'Statut' }));
    this.elStatuts.appendChild(pastille('', 'Tous', base.length, ''));
    ordre.forEach(function (k) { self.elStatuts.appendChild(pastille(k, statuts[k].libelle, statuts[k].n, statuts[k].couleur)); });
    // Type : les mêmes boutons Détail / Flotte / Tout que le sélecteur du haut (pour trouver les unités de flotte depuis la liste)
    if (this.aFlotte()) {
      var tous = this.visiblesTous().filter(function (v) { return (f.sortis || v.enStock) && self.gardeMarque(v.marque); }), nF = tous.filter(estFlotte).length;
      this.elStatuts.appendChild(h('span.sep'));
      this.elStatuts.appendChild(h('span.etiquette', { text: 'Type' }));
      [['detail', 'Détail', tous.length - nF, ''], ['flotte', 'Flotte', nF, 'ambre'], ['tout', 'Tout', tous.length, '']].forEach(function (o) {
        self.elStatuts.appendChild(h('button.neufs-statut' + (o[3] ? '.' + o[3] : '') + (self.flotte === o[0] ? '.actif' : ''), { type: 'button', title: o[0] === 'flotte' ? 'Les unités commandées en flotte (FNR / FCN)' : (o[0] === 'detail' ? 'Les unités au détail (TRE / SRE) et celles sans type' : 'Détail et flotte ensemble'), onclick: function () { if (self.flotte === o[0]) return; self.flotte = o[0]; AMX.memo.ecrire('neufs_flotte', o[0]); self.filtres.modele = ''; self.filtres.version = ''; self.rendre(); } }, [o[3] ? h('i') : null, h('span', { text: o[1] }), h('b', { text: AMX.fmtNombre(o[2]) })]));
      });
    }
    var annees = uniques(function (v) { return v.annee; }).reverse();
    remplir(this.selAnnee, [['ancienne', 'Ancienne année-modèle']].concat(annees), 'Toutes les années', f.annee);
    remplir(this.selEmplacement, uniques(function (v) { return v.emplacement; }).map(function (o) { return [o[0], o[1].replace(o[0], emplacementTexte(o[0]))]; }), 'Tous les emplacements', f.emplacement);
    remplir(this.selMoteur, uniques(function (v) { return (f.sortis || v.enStock) ? moteurDe(v) : ''; }), 'Tous les moteurs', f.moteur);
    var etiq = {}; liste.forEach(function (v) { if (f.sortis || v.enStock) etiquettesDe(v).forEach(function (k) { etiq[k] = (etiq[k] || 0) + 1; }); });
    remplir(this.selEtiquette, ETIQUETTES_ORDRE.map(function (k) { return [k, ETIQUETTES[k] + ' (' + (etiq[k] || 0) + ')']; }), 'Toutes les notes', f.etiquette);
    // NCP (numéro de compte parc, flotte GM) : « 123456 — Nom du client (n) »
    var ncps = {}; liste.forEach(function (v) { var x = v.extra || {}; if (x.ncp && (f.sortis || v.enStock)) { var k = String(x.ncp); ncps[k] = ncps[k] || { nom: x.ncpNom || '', n: 0 }; ncps[k].n++; if (!ncps[k].nom && x.ncpNom) ncps[k].nom = x.ncpNom; } });
    var listeNcp = Object.keys(ncps).sort(function (a, b) { return ncps[b].n - ncps[a].n || a.localeCompare(b); }).map(function (k) { return [k, 'NCP ' + k + (ncps[k].nom ? ' — ' + ncps[k].nom : '') + ' (' + ncps[k].n + ')']; });
    if (f.ncp && !ncps[f.ncp]) f.ncp = '';
    remplir(this.selNcp, listeNcp, 'Tous les NCP', f.ncp);
    this.selNcp.classList.toggle('cache', !listeNcp.length);
  };

  /** Ce que les filtres de la liste retiendraient parmi les véhicules cachés par le mode détail / flotte ou la marque. */
  VueNeufs.prototype.filtreesSans = function () {
    var self = this, vus = {};
    this.visibles().forEach(function (v) { vus[v.vin] = true; });
    return this.filtrees(this.visiblesTous().filter(function (v) { return !vus[v.vin]; }));
  };
  VueNeufs.prototype.filtrees = function (source) {
    var self = this, f = this.filtres, q = f.recherche.trim().toUpperCase();
    if (!this.absents) this.absents = this.calculerAbsentsDms();
    var liste = source || this.visibles();
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
      if (f.moteur && moteurDe(v) !== f.moteur) return false;
      if (f.etiquette && etiquettesDe(v).indexOf(f.etiquette) < 0) return false;
      if (f.ncp && String((v.extra || {}).ncp || '') !== f.ncp) return false;
      if (f.dispo === 'dispo' && !estDisponible(v)) return false;
      if (f.dispo === 'indispo' && estDisponible(v)) return false;
      if (f.dispo === 'exportable' && estExportable(v) !== 'oui') return false;
      if (f.dispo === 'punch' && !estPunch(v)) return false;
      if (f.dispo === 'absentDms' && !self.absentDms(v)) return false;
      if (MARQUES[f.dispo] && categorieIndispo(v) !== f.dispo) return false;
      var mq = marquageDe(v) || {};
      if (q && [v.vin, v.stock, v.modele, v.version, v.couleur, v.annee, v.modelNum, v.emplacement, (v.extra || {}).ncp, (v.extra || {}).ncpNom, (v.extra || {}).commande, mq.vendeur, mq.client, mq.localisation, mq.note, moteurDe(v), etiquettesDe(v).map(function (k) { return ETIQUETTES[k]; }).join(' ')].join(' ').toUpperCase().indexOf(q) < 0) return false;
      return true;
    });
  };

  /* Origine choisie sans aucun véhicule pour la concession : on le dit au lieu d'une liste vide muette. */
  VueNeufs.prototype.messageOrigineVide = function () {
    var o = this.originesDispo(), c = this.origineCourante();
    if (o[c]) return null;
    var cie = this.compagnie ? nomCie(this.compagnie) : 'ce groupe';
    return c === 'constructeur' ? 'Aucun inventaire du manufacturier pour ' + cie + ' : cliquez le favori « Automax ← Constructeur » sur le portail du manufacturier, connecté (bouton « Portail du constructeur »).' + (o.dms ? ' Le DMS / fichier, lui, a ' + o.dms + ' véhicule' + (o.dms > 1 ? 's' : '') + '.' : '') : 'Aucun inventaire DMS / fichier pour ' + cie + ' : il faut programmer l\'export quotidien du DMS (ou une feuille Google) vers le site.' + (o.constructeur ? ' Le manufacturier, lui, en a ' + o.constructeur + '.' : '');
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
        case 'emplacement': return emplacementTexte(v.emplacement);
        case 'statut': return statutDms(v).libelle;
        case 'dispo': return estDisponible(v) ? 0 : (MARQUES_ORDRE.indexOf(categorieIndispo(v)) + 1 || 9);
        case 'moteur': return moteurDe(v);
        case 'km': return kmDe(v).km;
        case 'pdsf': return pdsfDe(v).total || 0;
        case 'note': var mq = marquageDe(v); return mq ? [etiquettesDe(v).map(function (k) { return ETIQUETTES[k]; }).join(' '), resumeMarquage(mq), mq.exportable || '', mq.note || ''].join(' ').trim() : '';
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
    var marquable = peutMarquer();
    /* Maxime (12 oct.) : « Marquage » devient « Note », à la fin ; « Reçu le » enlevé (on a les jours) ; le tableau tient dans la page. */
    var entete = h('tr', [th('stock', '# Stock'), th('vehicule', 'Véhicule'), th('moteur', 'Moteur'), th('couleur', 'Couleur'), th('km', 'Km', true), th('pdsf', 'PDSF', true), th('dispo', 'Disponible'), th('emplacement', 'Emplacement'), th('statut', 'Statut DMS'), th('jours', 'Jours', true)].concat(d.montants ? [th('cout', 'Coût facture', true), th('detention', 'Détention', true)] : []).concat([th('note', 'Note')]));
    var corps = h('tbody');
    if (!lignes.length) {
      // Les mêmes filtres sur ce que le mode cache (flotte en mode détail, etc.) : on le dit et on propose de l'afficher
      var caches = this.filtreesSans();
      var vide = h('div.neufs-vide', [h('div', { text: this.messageOrigineVide() || 'Aucun véhicule neuf ne correspond.' })]);
      if (caches.length) {
        var nF = caches.filter(estFlotte).length;
        vide.appendChild(h('p', { style: { margin: '8px 0 0' } }, [h('span', { text: caches.length + ' véhicule' + (caches.length > 1 ? 's' : '') + ' correspond' + (caches.length > 1 ? 'ent' : '') + ' hors du filtre actuel' + (nF ? ' (' + nF + ' en flotte)' : '') + '. ' }), h('a', { text: 'Tout afficher', onclick: function () { self.flotte = 'tout'; AMX.memo.ecrire('neufs_flotte', 'tout'); self.marque = ''; AMX.memo.ecrire('neufs_marque', ''); self.rendre(); } })]));
      }
      corps.appendChild(h('tr', [h('td', { colspan: d.montants ? 13 : 11 }, [vide])]));
    }
    this.absents = this.calculerAbsentsDms();
    lignes.forEach(function (v) {
      var t = tranche(v.jours), s = statutDms(v), mq = marquageDe(v), cat = couleurRangee(v), absent = self.absentDms(v);
      var btnMarq = marquable && v.enStock ? h('button.btn.petit.fantome.neufs-marquer', { type: 'button', text: mq ? 'Modifier' : 'Marquer', title: 'Vendu, échangé, démo, livré, pré-enregistré, exportable, vendeur, client…', onclick: function (e) { e.stopPropagation(); self.marquer(v); } }) : null;
      var details = mq ? [resumeMarquage(mq), mq.note].filter(Boolean).join(' — ') : '';
      var pe = pucesEtiquettes(v), pc = (absent ? [puceAbsentDms(false, self.referenceAbsents(v.compagnie))] : []).concat(puceConstructeur(v, true));
      var cellNote = h('td.marquage.note', [pucePunch(v), puceExportable(v)].concat(pe).concat([details ? h('div.details', { text: details }) : null, btnMarq]));
      var km = kmDe(v), pd = pdsfDe(v);
      var tr = h('tr.rangee' + (v.enStock ? '' : '.sorti') + (cat ? '.marq-' + cat : '') + (absent ? '.absent-dms' : ''), [
        h('td', { text: v.stock || '—' }),
        h('td.vehicule', [h('div.nom', [nomVehicule(v), estFlotte(v) ? h('span.badge.ambre.sans-point.neufs-flotte-badge', { text: 'Flotte', title: 'Commande ' + ((v.extra || {}).typeCommande || '') + ' (flotte / parcs)' }) : null]), h('div.vin', { text: v.vin + (v.modelNum ? ' · ' + v.modelNum : '') + ((v.extra || {}).ncp ? ' · NCP ' + v.extra.ncp + (v.extra.ncpNom ? ' — ' + v.extra.ncpNom : '') : '') })]),
        h('td', { text: moteurDe(v) || '—', title: 'Moteur' }),
        h('td', { text: v.couleur || '—' }),
        h('td.num', [h('span' + (km.source === 'defaut' ? '.km-defaut' : ''), { text: AMX.fmtNombre(km.km) + ' km', title: 'Km ' + KM_SOURCES[km.source] + (km.source === 'defaut' ? ' — cliquez Marquer pour l\'indiquer' : '') })]),
        h('td.num', { text: pd.total ? AMX.fmtArgent(pd.total) : '—', title: pd.pdsf ? 'PDSF ' + AMX.fmtArgent(pd.pdsf) + (pd.transport ? ' + transport ' + AMX.fmtArgent(pd.transport) : '') : 'PDSF (avec transport) lu au portail du manufacturier' }),
        h('td.dispo-cell', [pastilleDispo(v)].concat(pc.length ? [h('div.sous', pc)] : [])),
        h('td', { text: emplacementTexte(v.emplacement) || '—', title: v.emplacement || '' }),
        h('td', [v.enStock ? h('span.badge.' + s.couleur, { text: s.libelle }) : h('span.badge.gris', { text: 'Sorti le ' + AMX.fmtDateCourte(v.sortiLe) })]),
        h('td.num', [t ? h('span.badge.' + t.couleur + '.sans-point', { text: fmtJours(v.jours), title: v.recuLe ? 'Reçu le ' + AMX.fmtDate(v.recuLe) : '' }) : h('span', '—')])
      ].concat(d.montants ? [h('td.num', { text: v.coutFacture ? AMX.fmtArgent(v.coutFacture) : '—' }), h('td.num', { text: v.coutDetention ? AMX.fmtArgent(v.coutDetention) : '—' })] : []).concat([cellNote]));
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
      dl([['NIV', v.vin], ['# Stock', v.stock], ['Moteur', moteurDe(v)], ['Km', AMX.fmtNombre(kmDe(v).km) + ' km (' + KM_SOURCES[kmDe(v).source] + ')'], ['Code modèle', v.modelNum], ['Type', typeUnite(v) === 'flotte' ? 'Flotte (' + (x.typeCommande || '') + ')' : (x.typeCommande ? 'Détail (' + x.typeCommande + ')' : '')], ['NCP (compte parc)', x.ncp ? x.ncp + (x.ncpNom ? ' — ' + x.ncpNom : '') : ''], ['Commande', x.commande], ['Série', x.serie], ['Carrosserie', v.carrosserie === 'T' ? 'Camion / VUS' : (v.carrosserie === 'C' ? 'Auto' : '')], ['Groupe', x.groupe], ['Couleur', v.couleur + (v.couleurCode ? ' (' + v.couleurCode + ')' : '')], ['Intérieur', v.couleurInt], ['Cylindres', x.cylindres], ['Transmission', x.transmission], ['Carburant', x.carburant]]),
      h('h4', { text: origineDe(v) === 'constructeur' ? 'Au portail du constructeur' : 'Au DMS / fichier' }),
      dl([['Statut', s.libelle + (v.statut ? ' (' + v.statut + ')' : '')], ['Emplacement', v.emplacement], ['Reçu le', v.recuLe ? AMX.fmtDate(v.recuLe) : ''], ['Jours en stock', fmtJours(v.jours)], ['Sorti le', v.sortiLe ? AMX.fmtDate(v.sortiLe) : ''], ['Mémo', v.memo], ['Vu dans le feed', (v.premiereVue ? 'du ' + AMX.fmtDate(v.premiereVue) : '') + (v.derniereVue ? ' au ' + AMX.fmtDate(v.derniereVue, true) : '')]]),
      (v.options || []).length || (v.ensembles || []).length ? h('h4', 'Options et ensembles') : null,
      (v.options || []).length || (v.ensembles || []).length ? h('div.neufs-options', (v.ensembles || []).map(function (o) { return h('span', { text: 'Ensemble ' + o }); }).concat((v.options || []).map(function (o) { return h('span', { text: o }); }))) : null,
      (x.accessoiresUsine || []).length ? h('h4', 'Accessoires d\'usine') : null,
      (x.accessoiresUsine || []).length ? h('div.neufs-options', x.accessoiresUsine.map(function (o) { return h('span', { text: o }); })) : null,
      (x.accessoiresConc || []).length ? h('h4', 'Accessoires concessionnaire') : null,
      (x.accessoiresConc || []).length ? h('div.neufs-options', x.accessoiresConc.map(function (o) { return h('span', { text: o }); })) : null
    ]);
    var mq = marquageDe(v);
    var droite = h('div', [
      h('h4', 'Disponibilité'),
      h('div.neufs-dispo-fiche', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '8px' } }, [pastilleDispo(v, true), pucePunch(v), puceExportable(v)].concat(this.absentDms(v) ? [puceAbsentDms(true, this.referenceAbsents(v.compagnie))] : []).concat(puceConstructeur(v)).concat(pucesEtiquettes(v))),
      this.absentDms(v) ? h('p.neufs-absent-dms', { text: (function (ref) { return ref && ref.type === 'feuille' ? 'En stock au portail du manufacturier (livré au concessionnaire) mais absent de ' + ref.texte + ' : à vérifier (réception non saisie au DMS, mauvais NIV, ou véhicule déjà vendu).' : 'En stock au portail du manufacturier (livré au concessionnaire) mais absent de l\'export du DMS : à vérifier au DMS (réception non saisie, mauvais NIV, ou véhicule déjà vendu côté DMS).'; })(this.referenceAbsents(v.compagnie)) }) : null,
      v.absentDmsNonCompare ? h('p.doux.petit', { style: { margin: '0 0 10px' }, text: v.absentDmsNonCompare === 'flotte' ? 'Unité de flotte : la feuille Google de référence ne liste que le détail, pas de comparaison au DMS pour l\'instant.' : 'Reçu après la dernière mise à jour de la feuille Google : pas encore comparé au DMS.' }) : null,
      mq ? dl([['Vendeur', mq.vendeur], ['Client', mq.client], ['Livraison', mq.livraison ? AMX.fmtDate(mq.livraison) : ''], ['Localisation', mq.localisation], ['Notes', etiquettesDe(v).map(function (k) { return ETIQUETTES[k]; }).join(', ')], ['Note', mq.note], ['Marqué', (mq.par ? 'par ' + mq.par : '') + (mq.le ? ' le ' + AMX.fmtDate(mq.le, true) : '')]]) : h('p.doux.petit', { style: { margin: '6px 0 0' }, text: v.enStock ? 'Aucun marquage interne : ce que le DMS / le portail dit fait foi.' : 'Sorti du feed.' }),
      (function () { var rd = rdrDe(v), cmd = commandeTexte(v), pdf = pdsfDe(v); return (cmd || rd || pdf.total) ? h('div', [h('h4', 'Chez le manufacturier'), dl([['Commande', cmd], ['Vendu chez le manufacturier', venduConstructeur(v) ? 'Oui' : 'Non'], ['RDR déclaré', rd ? AMX.fmtDate(rd.dateVente) + (rd.typeVente ? ' · ' + rd.typeVente : '') + (rd.client ? ' · ' + rd.client : '') : ''], ['PDSF', pdf.pdsf ? AMX.fmtArgent(pdf.pdsf) + (pdf.transport ? ' + transport ' + AMX.fmtArgent(pdf.transport) + ' = ' + AMX.fmtArgent(pdf.total) : '') : (pdf.total ? AMX.fmtArgent(pdf.total) : '')]])]) : null; })(),
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
    if (this.peutDemanderEchange(v)) boutons.push({ texte: 'Demander un échange…', classe: 'fantome neufs-demander-echange', action: function (fermer) { fermer(); self.demanderEchange(v); return false; } });
    if (peutMarquer() && v.enStock) boutons.push({ texte: mq ? 'Modifier le marquage' : 'Marquer (vendu, échangé, démo…)', classe: 'primaire', action: function (fermer) { fermer(); self.marquer(v); return false; } });
    boutons.push({ texte: 'Fermer', action: function (fermer) { fermer(); } });
    AMX.modale({ titre: nomVehicule(v) + (v.stock ? ' — # ' + v.stock : ''), corps: h('div.neufs-fiche', [gauche, droite]), large: true, boutons: boutons });
  };

  /* Marquer un neuf : vendu (vert) / échangé (orange) / démo (bleu), exportable oui / non, une note — ce que l'équipe sait
     avant que Global Connect ou le DMS le montre. Tout utilisateur de la concession peut le faire (Maxime, 11 oct.). */
  /* Vendeurs et localisations déjà saisis dans la concession (listes de suggestions du formulaire). */
  VueNeufs.prototype.suggestionsMarquage = function (cie) {
    var d = this.donnees || {}, vendeurs = {}, locs = {};
    (d.vehicules || []).forEach(function (x) { var m = marquageDe(x); if (!m || (cie && x.compagnie !== cie)) return; if (m.vendeur) vendeurs[m.vendeur] = (vendeurs[m.vendeur] || 0) + 1; if (m.localisation) locs[m.localisation] = (locs[m.localisation] || 0) + 1; });
    var tri = function (o) { return Object.keys(o).sort(function (a, b) { return o[b] - o[a] || a.localeCompare(b, 'fr'); }); };
    var locDefaut = (d.marquage && d.marquage.localisations && d.marquage.localisations.length) ? d.marquage.localisations : LOCALISATIONS_DEFAUT;
    return { vendeurs: tri(vendeurs), localisations: locDefaut.concat(tri(locs).filter(function (l) { return locDefaut.indexOf(l) < 0; })) };
  };
  VueNeufs.prototype.marquer = function (v) {
    var self = this, m = marquageDe(v) || {};
    var etat = { statut: MARQUES[m.statut] ? m.statut : '', punch: m.punch === 'oui' || m.punch === 'non' ? m.punch : '', exportable: m.exportable === 'oui' || m.exportable === 'non' ? m.exportable : '' };
    var segStatut = h('div.segment.bloc', { role: 'group', 'aria-label': 'Marquage' }), segPunch = h('div.segment.bloc', { role: 'group', 'aria-label': 'Pré-enregistré' }), segExp = h('div.segment.bloc', { role: 'group', 'aria-label': 'Exportable' });
    var apercu = h('div.apercu');
    var sugg = this.suggestionsMarquage(v.compagnie), id = 'marq-' + Date.now();
    var listeV = h('datalist#' + id + '-v', sugg.vendeurs.map(function (x) { return h('option', { value: x }); }));
    var listeL = h('datalist#' + id + '-l', sugg.localisations.map(function (x) { return h('option', { value: x }); }));
    var champ = function (nom, cls, attrs) { return h('input.saisie.' + cls, Object.assign({ type: 'text', autocomplete: 'off', oninput: function () { rendre(); } }, attrs)); };
    var vendeur = champ('vendeur', 'marq-vendeur', { value: m.vendeur || '', placeholder: 'Sam, Martin, House…', maxlength: '80', list: id + '-v' });
    var client = champ('client', 'marq-client', { value: m.client || '', placeholder: 'Nom du client', maxlength: '80' });
    var livraison = h('input.saisie.marq-livraison', { type: 'date', value: m.livraison || '', onchange: function () { rendre(); } });
    var localisation = champ('localisation', 'marq-localisation', { value: m.localisation || '', placeholder: 'Showroom, STE, Lacolle, Dorais, 320…', maxlength: '80', list: id + '-l' });
    var note = h('input.saisie.marq-note', { type: 'text', value: m.note || '', placeholder: 'Essai routier, accessoires… (facultatif)', maxlength: '300', autocomplete: 'off', oninput: function () { rendre(); } });
    var kmActuel = kmDe(v);
    var km = h('input.saisie.marq-km', { type: 'number', min: '0', step: '1', inputmode: 'numeric', value: m.km !== null && m.km !== undefined && m.km !== '' ? String(m.km) : '', placeholder: kmActuel.source === 'marquage' ? '' : AMX.fmtNombre(kmActuel.km) + ' (' + KM_SOURCES[kmActuel.source] + ')', oninput: function () { rendre(); } });
    etat.etiquettes = etiquettesDe(v).slice();
    var elEtiquettes = h('div.etiquettes');
    var lire = function () { return { statut: etat.statut, punch: etat.punch, exportable: etat.exportable, vendeur: vendeur.value.trim(), client: client.value.trim(), livraison: livraison.value || '', localisation: localisation.value.trim(), note: note.value.trim(), km: km.value.trim(), etiquettes: etat.etiquettes.slice() }; };
    var simule = function () { return Object.assign({}, v, { marquage: lire() }); };
    var rendre = function () {
      AMX.vider(segStatut); AMX.vider(segPunch); AMX.vider(segExp); AMX.vider(apercu);
      [['', 'Disponible', ''], ['vendu', 'Vendu', 'jaune'], ['echange', 'Échangé (trade)', 'orange'], ['demo', 'Démo', 'bleu'], ['livre', 'Livré', 'gris']].forEach(function (o) {
        segStatut.appendChild(h('button' + (etat.statut === o[0] ? '.actif' : '') + (o[2] ? '.' + o[2] : ''), { type: 'button', 'data-statut': o[0], onclick: function () { etat.statut = o[0]; rendre(); } }, [h('span', { text: o[1] })]));
      });
      [['', 'Pas indiqué', ''], ['oui', 'Pré-enregistré (punch)', 'vert'], ['non', 'Pas punché', 'non']].forEach(function (o) {
        segPunch.appendChild(h('button' + (etat.punch === o[0] ? '.actif' : '') + (o[2] ? '.' + o[2] : ''), { type: 'button', 'data-punch': o[0], onclick: function () { etat.punch = o[0]; rendre(); } }, [h('span', { text: o[1] })]));
      });
      [['', 'Pas indiqué', ''], ['oui', 'Exportable', 'oui'], ['non', 'Non exportable', 'non']].forEach(function (o) {
        segExp.appendChild(h('button' + (etat.exportable === o[0] ? '.actif' : '') + (o[2] ? '.' + o[2] : ''), { type: 'button', 'data-exportable': o[0], onclick: function () { etat.exportable = o[0]; rendre(); } }, [h('span', { text: o[1] })]));
      });
      AMX.vider(elEtiquettes);
      ETIQUETTES_ORDRE.forEach(function (k) { elEtiquettes.appendChild(h('button' + (etat.etiquettes.indexOf(k) >= 0 ? '.actif' : ''), { type: 'button', 'data-etiquette': k, text: ETIQUETTES[k], onclick: function () { var i = etat.etiquettes.indexOf(k); if (i >= 0) etat.etiquettes.splice(i, 1); else etat.etiquettes.push(k); rendre(); } })); });
      var sim = simule();
      apercu.appendChild(h('span.doux.petit', { text: 'Résultat : ' })); apercu.appendChild(pastilleDispo(sim)); var pp = pucePunch(sim); if (pp) apercu.appendChild(pp); var pe = puceExportable(sim); if (pe) apercu.appendChild(pe); pucesEtiquettes(sim).forEach(function (c) { apercu.appendChild(c); });
      var kmS = kmDe(sim); apercu.appendChild(h('span.doux.petit', { text: AMX.fmtNombre(kmS.km) + ' km (' + KM_SOURCES[kmS.source] + ')' }));
      var r = resumeMarquage(sim.marquage); if (r) apercu.appendChild(h('span.doux.petit', { text: r }));
    };
    var corps = h('div.neufs-marquage-form', [
      h('p.doux', { style: { margin: '0 0 10px', fontSize: '12.5px', lineHeight: '1.5' }, text: 'Ce que l\'équipe sait avant Global Connect / le DMS — l\'ancienne feuille Google. Vendu (jaune), échangé à un autre concessionnaire (orange), démo (bleu) ou livré (gris) : plus disponible. Pré-enregistré (vert) : punché, pas vendu, toujours disponible. Visible par tous les utilisateurs de ' + nomCie(v.compagnie) + '.' }),
      h('label', 'Marquage'), segStatut,
      h('div.grille', [h('div', [h('label', 'Pré-enregistré'), segPunch]), h('div', [h('label', 'Exportable'), segExp])]),
      h('div.grille', [h('div', [h('label', 'Vendeur'), vendeur, listeV]), h('div', [h('label', 'Client'), client])]),
      h('div.grille', [h('div', [h('label', 'Date de livraison'), livraison]), h('div', [h('label', 'Localisation'), localisation, listeL])]),
      h('div.grille', [h('div', [h('label', 'Km'), km]), h('div', [h('label', 'Notes (menu)'), elEtiquettes])]),
      h('label', 'Note libre'), note,
      apercu,
      m.par ? h('p.doux.petit', { style: { margin: '10px 0 0' }, text: 'Dernier marquage par ' + m.par + (m.le ? ' le ' + AMX.fmtDate(m.le, true) : '') }) : null
    ]);
    rendre();
    var boutons = [];
    if (marquageDe(v)) boutons.push({ texte: 'Effacer le marquage', classe: 'danger fantome', action: function () { return self.enregistrerMarquage(v, {}); } });
    boutons.push({ texte: 'Annuler', action: function (fermer) { fermer(); } });
    boutons.push({ texte: 'Enregistrer', classe: 'primaire', action: function () { return self.enregistrerMarquage(v, lire()); } });
    AMX.modale({ titre: 'Marquer — ' + nomVehicule(v) + (v.stock ? ' · # ' + v.stock : ''), corps: corps, boutons: boutons, large: true });
  };
  VueNeufs.prototype.enregistrerMarquage = function (v, donnees) {
    var self = this;
    var corps = { action: 'neufsMarquer', compagnie: v.compagnie, vin: v.vin };
    ['statut', 'punch', 'exportable', 'vendeur', 'client', 'livraison', 'localisation', 'note', 'km'].forEach(function (c) { corps[c] = (donnees || {})[c] || ''; });
    corps.etiquettes = (donnees && donnees.etiquettes) ? donnees.etiquettes.join(',') : '';
    return AMX.post(corps).then(function (r) {
      AMX.verifier(r, 'Marquage refusé.');
      var mq = r.marquage || null;
      (self.donnees && self.donnees.vehicules || []).forEach(function (x) { if (x.compagnie === v.compagnie && x.vin === v.vin) { x.marquage = mq; x.indisponible = raisonIndispo(x); x.disponible = x.indisponible === ''; } });
      v.marquage = mq; v.indisponible = raisonIndispo(v); v.disponible = v.indisponible === '';
      AMX.toast(mq ? nomVehicule(v) + ' — ' + (MARQUES[mq.statut] ? MARQUES[mq.statut][0] : (mq.punch === 'oui' ? 'pré-enregistré, disponible' : 'disponible')) + (mq.exportable ? ' · ' + EXPORTABLES[mq.exportable].toLowerCase() : '') : nomVehicule(v) + ' — marquage effacé, disponible', 'ok');
      self.rendre();
      if (AMX.rafraichirSousBarre) AMX.rafraichirSousBarre();
      return true;
    }).catch(function (e) { AMX.toast('Marquage impossible — ' + AMX.erreurTexte(e), 'erreur'); return false; });
  };

  VueNeufs.prototype.exporter = function () {
    var self = this, d = this.donnees || {}, lignes = this.filtrees();
    if (!lignes.length) { AMX.toast('Aucun véhicule à exporter.', 'attention'); return; }
    if (typeof XLSX === 'undefined') { AMX.toast('La bibliothèque Excel n\'est pas encore chargée. Réessayez.', 'erreur'); return; }
    var rows = lignes.map(function (v) {
      var mq = marquageDe(v) || {}, rI = raisonIndispo(v);
      var r = { 'Concession': nomCie(v.compagnie), 'Origine': ORIGINES[origineDe(v)], '# Stock': v.stock, 'NIV': v.vin, 'Année': v.annee, 'Marque': v.marque, 'Modèle': v.modele, 'Code modèle': v.modelNum, 'Version': v.version, 'Couleur': v.couleur, 'Code couleur': v.couleurCode, 'Intérieur': v.couleurInt, 'Moteur': moteurDe(v), 'Km': kmDe(v).km, 'Source km': KM_SOURCES[kmDe(v).source], 'PDSF': pdsfDe(v).pdsf, 'Transport': pdsfDe(v).transport, 'PDSF + transport': pdsfDe(v).total, 'Disponible': rI ? 'Non — ' + (RAISONS[rI] || rI) : 'Oui', 'Vendu chez le manufacturier': venduConstructeur(v) ? 'Oui' : '', 'Absent du DMS': self.absentDms(v) ? 'Oui' : '', 'Commande': commandeTexte(v), 'RDR': (function () { var r = rdrDe(v); return r ? String(r.dateVente || '') + (r.typeVente ? ' ' + r.typeVente : '') : ''; })(), 'Marquage': MARQUES[mq.statut] ? MARQUES[mq.statut][0] : '', 'Pré-enregistré': mq.punch === 'oui' ? 'Oui' : (mq.punch === 'non' ? 'Non' : ''), 'Exportable': EXPORTABLES[mq.exportable] || '', 'Notes': etiquettesDe(v).map(function (k) { return ETIQUETTES[k]; }).join(', '), 'Vendeur': mq.vendeur || '', 'Client': mq.client || '', 'Livraison': mq.livraison || '', 'Localisation': mq.localisation || '', 'Note marquage': mq.note || '', 'Marqué par': mq.par || '', 'Marqué le': mq.le ? String(mq.le).slice(0, 10) : '', 'Emplacement': v.emplacement, 'Statut': statutDms(v).libelle, 'Type': typeUnite(v) === 'flotte' ? 'Flotte' : (typeUnite(v) ? 'Détail' : ''), 'NCP': (v.extra || {}).ncp || '', 'Client de parc': (v.extra || {}).ncpNom || '', 'Reçu le': v.recuLe, 'Jours': v.jours, 'Tranche': (tranche(v.jours) || {}).libelle || '', 'Sorti le': v.sortiLe, 'Options': (v.options || []).join(', '), 'Ensembles': (v.ensembles || []).join(', '), 'Mémo': v.memo };
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
