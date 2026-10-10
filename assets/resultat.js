/* =========================================================================
   Section « Résultat » : remplace resultat.html (administrateurs seulement).
   Profit par période, calculé côté client à partir des registres de ventes
   (Ste-Marie et Hawkesbury) : cartes KPI, **évolution du profit** (barres par
   semaine / mois / trimestre + courbe du cumul, cliquer une barre ouvre ses
   véhicules), **par acheteur** (classement et cumul par acheteur), la liste
   des véhicules de la période choisie, puis la ventilation de l'année.
   Graphiques : `AMX.graph` (assets/graphiques.js, SVG maison).

   Route serveur (inchangée) :
     GET ?resultatRaw=1 → { rows: [ { vin, vinComplet, stock, profit, coutTotal,
       prixVenteUS, date (ISO), dateApprox, moisOnglet, anneeOnglet, marque,
       modele, annee, provenance, acheteur, courrielAcheteur,
       compagnie ('STM' | 'HAWKS') } ] }
     Réponse { refuse: true } → état verrouillé (compte sans droit).

   Règles reprises de l'ancienne page :
     - |profit| > 8 000 $ = erreur de saisie probable → ligne exclue des calculs ;
     - fenêtres « 10 jours » et « 30 jours » approximatives (les registres
       n'ont souvent que le mois de dépôt) ; trimestre, semestre et année fiables ;
     - marge = profit / coût total (pondérée) ; profit moyen = profit / nb ventes ;
     - ventilation (marque, modèle, année, provenance, acheteur) sur l'année en
       cours ; marque, modèle et année ignorent les lignes sans marque.

   Toutes les données serveur sont rendues via textContent (jamais innerHTML).

   (9 oct.) Deux onglets, même vue paramétrée par une SOURCE :
     - « É.-U. » : les registres de ventes (?resultatRaw=1), comme avant ;
     - « Wholesale Canada » : le Livre des ventes de Ste-Marie (?resultatCan=1,
       ResultatCan.gs) — LMB exclus, achats et échanges séparés (segment), seules
       les ventes COMPTABILISÉES comptent (profit réel inscrit) ; les autres sont
       « en attente » avec leur profit prévu ; les ajustements comptables sont
       rattachés au véhicule (# stock) ou listés à part.
   ========================================================================= */
(function () {
  'use strict';
  var h = AMX.h, I = AMX.icones;

  var SEUIL_ERREUR = 8000;   // |profit| au-delà : erreur de saisie, exclu (registres É.-U.)
  // Calculé au rendu (pas au chargement) : la liste visible dépend du compte (portée, 6 oct.).
  function COMPAGNIES_() { return [['TOUT', 'Toutes']].concat(Object.keys(AMX.compagniesPour('resultats')).map(function (c) { return [c, c]; })); }

  // Les deux sources (9 oct.) : chaque onglet a sa route, ses libellés, son seuil d'erreur et ses regroupements.
  var TYPES_CAN = [['tous', 'Tous'], ['achat', 'Achats'], ['echange', 'Échanges']];
  // Véhicules neufs (10 oct.) : stock ou commande (Locate = commande) d'après « Type (neuf) » / « Provenance » du livre.
  var TYPES_NEUF = [['tous', 'Tous'], ['stock', 'Stock'], ['commande', 'Commandes']];
  var LIBELLE_TYPE = { achat: 'Achat', echange: 'Échange', stock: 'Stock', commande: 'Commande', demo: 'Démo' };
  var SOURCES = {
    us: { cle: 'us', route: 'resultatRaw=1', titre: 'Résultat', sous: '', colVente: 'Vente', exportVente: 'Prix de vente US', seuil: SEUIL_ERREUR, approx: true, compagnies: true, types: null, memo: 'resultat',
      chargement: 'Chargement des registres de ventes…', champAcheteur: 'acheteur', titreAcheteurs: 'Par acheteur' },
    can: { cle: 'can', livres: true, route: 'resultatCan=1', titre: 'Wholesale Canada', sous: 'Livres des ventes des concessions (comptabilité)', colVente: 'Vente ($ CA)', exportVente: 'Prix de vente ($ CA)', seuil: 25000, approx: false, compagnies: true, types: TYPES_CAN, memo: 'resultat_can',
      chargement: 'Lecture des Livres des ventes…', champAcheteur: 'acheteur', titreAcheteurs: 'Par acheteur interne', segmentTypes: 'Achats ou échanges', nomVente: 'vente', nomVentePl: 'ventes', comptabilisees: true },
    neuf: { cle: 'neuf', livres: true, route: 'resultatNeuf=1', titre: 'Véhicules neufs', sous: 'Livres Ventes Neuf des concessions (comptabilité) — profit front + F&I', colVente: 'Vente ($ CA)', exportVente: 'Prix de vente ($ CA)', seuil: 40000, approx: false, compagnies: true, types: TYPES_NEUF, memo: 'resultat_neuf',
      chargement: 'Lecture des Livres Ventes Neuf…', champAcheteur: 'vendeur', titreAcheteurs: 'Par conseiller', segmentTypes: 'Stock ou commande', nomVente: 'vente neuve', nomVentePl: 'ventes neuves', comptabilisees: false }
  };

  var PERIODES = [
    { cle: 'j10', libelle: '10 derniers jours', approx: true, debut: function (b) { return b.j10; } },
    { cle: 'j30', libelle: '30 derniers jours', approx: true, debut: function (b) { return b.j30; } },
    { cle: 'trimestre', libelle: 'Trimestre en cours', approx: false, debut: function (b) { return b.trimestre; } },
    { cle: 'semestre', libelle: 'Semestre en cours', approx: false, debut: function (b) { return b.semestre; } },
    { cle: 'annee', libelle: 'Année en cours', approx: false, debut: function (b) { return b.annee; } }
  ];

  var REGROUPEMENTS = [
    { cle: 'marque', libelle: 'Par marque', colonne: 'Marque', champ: 'marque', requiertMarque: true },
    { cle: 'modele', libelle: 'Par modèle', colonne: 'Modèle', champ: 'modele', requiertMarque: true },
    { cle: 'annee', libelle: 'Par année', colonne: 'Année', champ: 'annee', requiertMarque: true },
    { cle: 'provenance', libelle: 'Par provenance', colonne: 'Provenance', champ: 'provenance' },
    { cle: 'acheteur', libelle: 'Par acheteur interne', colonne: 'Acheteur', champ: 'acheteur' }
  ];
  // Wholesale Canada : en plus, par type (achat / échange) et par client (« Vendu à »).
  var REGROUPEMENTS_CAN = [
    { cle: 'type', libelle: 'Achats / échanges', colonne: 'Type', champ: 'typeLibelle' },
    { cle: 'provenance', libelle: 'Par provenance', colonne: 'Acheté de', champ: 'provenance' },
    { cle: 'client', libelle: 'Par client', colonne: 'Vendu à', champ: 'venduA' },
    { cle: 'acheteur', libelle: 'Par acheteur interne', colonne: 'Acheteur', champ: 'acheteur' },
    { cle: 'marque', libelle: 'Par marque', colonne: 'Marque', champ: 'marque', requiertMarque: true },
    { cle: 'modele', libelle: 'Par modèle', colonne: 'Modèle', champ: 'modele', requiertMarque: true },
    { cle: 'annee', libelle: 'Par année', colonne: 'Année', champ: 'annee', requiertMarque: true }
  ];

  // Véhicules neufs : par type (stock / commande), conseiller, directeur commercial, client, marque, modèle, année.
  var REGROUPEMENTS_NEUF = [
    { cle: 'type', libelle: 'Stock / commandes', colonne: 'Type', champ: 'typeLibelle' },
    { cle: 'conseiller', libelle: 'Par conseiller', colonne: 'Conseiller', champ: 'vendeur' },
    { cle: 'directeur', libelle: 'Par directeur commercial', colonne: 'Directeur', champ: 'directeur' },
    { cle: 'client', libelle: 'Par client', colonne: 'Client', champ: 'venduA' },
    { cle: 'marque', libelle: 'Par marque', colonne: 'Marque', champ: 'marque', requiertMarque: true },
    { cle: 'modele', libelle: 'Par modèle', colonne: 'Modèle', champ: 'modele', requiertMarque: true },
    { cle: 'annee', libelle: 'Par année', colonne: 'Année', champ: 'annee', requiertMarque: true }
  ];

  // Évolution : granularité × horizon (nombre de périodes affichées).
  var GRANULARITES = [
    { cle: 'semaine', libelle: 'Semaine', horizons: [[12, '12 semaines'], [26, '26 semaines'], [52, '52 semaines']], approx: true },
    { cle: 'mois', libelle: 'Mois', horizons: [[6, '6 mois'], [12, '12 mois'], [24, '24 mois']], approx: false },
    { cle: 'trimestre', libelle: 'Trimestre', horizons: [[4, '4 trimestres'], [8, '8 trimestres'], [12, '12 trimestres']], approx: false }
  ];
  var FENETRES_ACHETEURS = [
    { cle: 'trimestre', libelle: 'Trimestre en cours', debut: function (b) { return b.trimestre; } },
    { cle: 'annee', libelle: 'Année en cours', debut: function (b) { return b.annee; } },
    { cle: 'm12', libelle: '12 derniers mois', debut: function (b) { return b.m12; } },
    { cle: 'tout', libelle: 'Tout l\'historique', debut: function () { return -Infinity; } }
  ];
  var MESURES_ACHETEURS = [
    { cle: 'profitTotal', libelle: 'Profit total', format: function (v) { return AMX.fmtArgent(v, 0); } },
    { cle: 'nb', libelle: 'Ventes', format: function (v) { return String(v); } },
    { cle: 'profitMoyen', libelle: 'Profit moyen', format: function (v) { return AMX.fmtArgent(v, 0); } }
  ];
  var MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

  var TEXTE_APPROX = 'Fenêtre approximative : les registres n\'ont pas toujours la date de vente exacte (seulement le mois de dépôt, le 15 servant de repère). À interpréter avec prudence.';

  /* ------------------------------ Helpers ------------------------------ */
  function num(v) { var n = typeof v === 'number' ? v : AMX.montant(v); return isNaN(n) ? 0 : n; }
  function fmtPct(x) {
    if (x === null || x === undefined || isNaN(x) || !isFinite(x)) return '—';
    return (x * 100).toLocaleString('fr-CA', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %';
  }
  function heure(d) { return new Date(d).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' }); }
  function pluriel(n, mot) { return n + ' ' + mot + (n > 1 ? 's' : ''); }
  function nomVehicule(v) { return [v.marque, v.modele, v.annee].filter(Boolean).join(' ') || v.vinComplet || v.vin || '—'; }
  function vinLong(v) { return String(v.vinComplet || v.vin || ''); }
  function vinCourt(v) {
    var complet = vinLong(v), court = String(v.vin || '');
    if (court && court !== complet) return court;
    return complet.length > 8 ? complet.slice(-8) : complet;
  }
  function marge(v) { return v.coutTotal > 0 ? v.profit / v.coutTotal : NaN; }
  function signeClasse(n) { return n >= 0 ? 'resultat-pos' : 'resultat-neg'; }
  function trouver(liste, cle) { for (var i = 0; i < liste.length; i++) if (liste[i].cle === cle) return liste[i]; return null; }
  // Erreur d'un Livre des ventes, en clair : la note du serveur (après « — ») plutôt que le message technique.
  function erreurLivre(e) { var t = String((e && e.erreur) || ''); var i = t.lastIndexOf(' — '); return i >= 0 ? t.slice(i + 3) : (t.length > 90 ? t.slice(0, 90) + '…' : t); }

  function injecterCss() {
    if (document.getElementById('css-resultat')) return;
    var s = document.createElement('style');
    s.id = 'css-resultat';
    s.textContent = [
      '.resultat-page .carte { margin-bottom: 14px; overflow: hidden; }',
      '.resultat-page h1 .resultat-h1-sous { display: block; font-size: 12.5px; font-weight: 400; color: var(--encre-3); letter-spacing: 0; margin-top: 2px; }',
      '.resultat-page .puce.type-achat { background: var(--bleu-bg); color: var(--bleu); } .resultat-page .puce.type-echange { background: var(--ambre-bg); color: var(--ambre); } .resultat-page .puce.type-ajust { background: var(--gris-bg); color: var(--gris); }',
      '.resultat-page .puce.type-stock { background: var(--vert-bg); color: var(--vert); } .resultat-page .puce.type-commande { background: var(--violet-bg, var(--bleu-bg)); color: var(--violet, var(--bleu)); } .resultat-page .puce.type-demo { background: var(--ambre-bg); color: var(--ambre); }',
      '.resultat-page .resultat-ajust { font-size: 11px; color: var(--encre-3); cursor: help; }',
      '.resultat-page .resultat-attente .carte-corps { padding-top: 0; }',
      '.resultat-page .tableau.resultat-ta { min-width: 640px; }',
      '.resultat-page .resultat-onglet.cache { display: none; }',
      '.resultat-page .carte-entete h2 { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; min-width: 0; }',
      '.resultat-page .carte-entete h2 .sous { font-weight: 400; font-size: 12px; color: var(--encre-3); }',
      '.resultat-page .resultat-actions { display: flex; gap: 6px; align-items: center; flex: none; }',
      '.resultat-page .resultat-note { margin: -6px 0 14px; line-height: 1.5; }',
      '.resultat-page .entete-page p .puce { margin-left: 8px; vertical-align: 1px; cursor: help; }',
      '.resultat-pos { color: var(--vert); }',
      '.resultat-neg { color: var(--rouge); }',
      '.resultat-page .kpi.resultat-kpi-approx { border-left: 3px solid var(--ambre); }',
      '.resultat-page .kpi.squelette { min-height: 74px; border: none; box-shadow: none; cursor: default; }',
      '.resultat-approx { display: inline-block; margin-left: 4px; color: var(--ambre); font-weight: 700; cursor: help; }',
      '.resultat-page .resultat-onglets { padding: 4px 12px 0; }',
      '.resultat-page .resultat-onglets .onglets { margin-bottom: 0; }',
      '.resultat-page .resultat-defilant { overflow-x: auto; }',
      '.resultat-page .resultat-defilant > .tableau { border: none; border-radius: 0; box-shadow: none; }',
      '.resultat-page .tableau.resultat-tv { min-width: 860px; }',
      '.resultat-page .tableau.resultat-tg { min-width: 560px; }',
      '.resultat-page th.resultat-triable { cursor: pointer; user-select: none; }',
      '.resultat-page th.resultat-triable:hover { color: var(--encre); }',
      '.resultat-page th.resultat-triable.actif { color: var(--vert); }',
      '.resultat-page .resultat-fleche { font-size: 9px; margin-left: 4px; }',
      '.resultat-page .resultat-chevron { display: inline-block; width: 14px; height: 14px; vertical-align: -2px; margin-right: 6px; color: var(--encre-4); transition: transform .12s; }',
      '.resultat-page .resultat-chevron svg { width: 14px; height: 14px; display: block; }',
      '.resultat-page tr.actif .resultat-chevron { transform: rotate(90deg); color: var(--vert); }',
      '.resultat-page tr.cliquable:focus { outline: none; }',
      '.resultat-page tr.cliquable:focus-visible td { box-shadow: inset 0 0 0 2px rgba(0, 136, 64, .35); }',
      '.resultat-page tr.resultat-sous > td { padding: 0 0 0 26px; background: var(--carte-2); }',
      '.resultat-page tr.resultat-sous .tableau { background: transparent; }',
      '.resultat-page tr.resultat-sous .tableau th { background: transparent; }',
      '.resultat-page tfoot td { font-weight: 600; background: var(--carte-2); border-top: 1px solid var(--ligne); }',
      '.resultat-page .resultat-vin { cursor: copy; }',
      '.resultat-page .carte-corps .vide { border: none; background: transparent; padding: 28px 16px; }',
      '.resultat-page .resultat-sous-titre { font-size: 13px; margin: 18px 0 8px; }',
      '.resultat-page .resultat-graph-acheteurs { overflow-x: auto; }',
      '.resultat-page .carte-entete .resultat-actions { flex-wrap: wrap; justify-content: flex-end; }',
      '@media (max-width: 860px) { .resultat-page .entete-page .actions { width: 100%; justify-content: space-between; } .resultat-page .carte-entete { flex-wrap: wrap; } }'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ------------------------------ Calculs ------------------------------ */
  // Lignes brutes → lignes normalisées (nombres, horodatage) ; exclusion des erreurs de saisie.
  function normaliser(rows, seuil) {
    var gardees = [], exclues = 0;
    seuil = seuil || SEUIL_ERREUR;
    (rows || []).forEach(function (r) {
      if (!r) return;
      var profit = num(r.profit);
      if (Math.abs(profit) > seuil) { exclues++; return; }
      var d = r.date ? new Date(r.date) : null;
      gardees.push({
        // Livre des ventes (Wholesale Canada) : type, ajustements, client, profit prévu, comptabilisé
        type: String(r.type || '').trim(), typeLibelle: LIBELLE_TYPE[String(r.type || '').trim()] || '(autre)',
        ajust: !!r.ajust, ajustements: Array.isArray(r.ajustements) ? r.ajustements : [],
        venduA: String(r.venduA || '').trim(), vendeur: String(r.vendeur || '').trim(), directeur: String(r.directeur || '').trim(), statut: String(r.statut || '').trim(),
        profitPrevu: (r.profitPrevu === null || r.profitPrevu === undefined) ? null : num(r.profitPrevu),
        comptabilise: r.comptabilise !== false, dateCompta: r.dateCompta || '', coutEstime: !!r.coutEstime, typeSource: String(r.typeSource || ''),
        profitSource: r.profitSource === 'prevu' ? 'prevu' : 'reel',
        profitReel: (r.profitReel === null || r.profitReel === undefined) ? null : num(r.profitReel),
        vin: String(r.vin || '').trim(),
        vinComplet: String(r.vinComplet || r.vin || '').trim(),
        stock: String(r.stock || '').trim(),
        profit: profit,
        coutTotal: num(r.coutTotal),
        prixVenteUS: num(r.prixVenteUS),
        date: r.date || '',
        t: (d && !isNaN(d.getTime())) ? d.getTime() : NaN,
        dateApprox: !!r.dateApprox,
        marque: String(r.marque || '').trim(),
        modele: String(r.modele || '').trim(),
        annee: (r.annee === null || r.annee === undefined) ? '' : String(r.annee).trim(),
        provenance: String(r.provenance || '').trim(),
        acheteur: String(r.acheteur || '').trim(),
        courrielAcheteur: String(r.courrielAcheteur || '').trim(),
        compagnie: String(r.compagnie || '').trim().toUpperCase()
      });
    });
    return { lignes: gardees, exclues: exclues };
  }

  // Bornes des fenêtres, à partir d'aujourd'hui (les ventes futures sont ignorées).
  function bornes() {
    var now = new Date(), y = now.getFullYear(), m = now.getMonth();
    var j10 = new Date(now); j10.setDate(j10.getDate() - 10);
    var j30 = new Date(now); j30.setDate(j30.getDate() - 30);
    return {
      fin: now.getTime(),
      j10: j10.getTime(),
      j30: j30.getTime(),
      trimestre: new Date(y, Math.floor(m / 3) * 3, 1).getTime(),
      semestre: new Date(y, m < 6 ? 0 : 6, 1).getTime(),
      annee: new Date(y, 0, 1).getTime(),
      m12: new Date(y - 1, m, 1).getTime()
    };
  }

  /* ------------------------- Seaux de l'évolution ----------------------- */
  // Lundi de la semaine (ISO) d'une date.
  function lundi(d) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); var j = (x.getDay() + 6) % 7; x.setDate(x.getDate() - j); return x; }
  function numSemaine(d) { var x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); var jour = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() + 4 - jour); var an1 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1)); return Math.ceil(((x - an1) / 86400000 + 1) / 7); }
  function fmtJourMois(d) { return d.getDate() + ' ' + MOIS_COURTS[d.getMonth()]; }
  // Les `n` dernières périodes (la courante incluse), chacune { debut, fin, etiquette, sous }.
  function seaux(granularite, n) {
    var now = new Date(), liste = [], i, d, f;
    if (granularite === 'semaine') {
      var l0 = lundi(now);
      for (i = n - 1; i >= 0; i--) {
        d = new Date(l0); d.setDate(d.getDate() - 7 * i);
        f = new Date(d); f.setDate(f.getDate() + 6); f.setHours(23, 59, 59, 999);
        liste.push({ debut: d.getTime(), fin: f.getTime(), etiquette: 'S' + numSemaine(d), sous: fmtJourMois(d) + ' – ' + fmtJourMois(f), long: 'Semaine ' + numSemaine(d) + ' (' + fmtJourMois(d) + ' – ' + fmtJourMois(f) + ' ' + f.getFullYear() + ')' });
      }
    } else if (granularite === 'mois') {
      for (i = n - 1; i >= 0; i--) {
        d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        f = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
        liste.push({ debut: d.getTime(), fin: f.getTime(), etiquette: MOIS_COURTS[d.getMonth()], sous: String(d.getFullYear()), long: MOIS_COURTS[d.getMonth()] + ' ' + d.getFullYear() });
      }
    } else {
      var t0 = Math.floor(now.getMonth() / 3);
      for (i = n - 1; i >= 0; i--) {
        d = new Date(now.getFullYear(), (t0 - i) * 3, 1);
        f = new Date(d.getFullYear(), d.getMonth() + 3, 0, 23, 59, 59, 999);
        liste.push({ debut: d.getTime(), fin: f.getTime(), etiquette: 'T' + (Math.floor(d.getMonth() / 3) + 1), sous: String(d.getFullYear()), long: 'Trimestre ' + (Math.floor(d.getMonth() / 3) + 1) + ' ' + d.getFullYear() });
      }
    }
    return liste;
  }

  // Totaux d'une liste : nb, profit total, coût total, vente totale, profit moyen, marge pondérée.
  function agreger(liste) {
    var nb = 0, nbAjust = 0, ajust = 0, profit = 0, cout = 0, vente = 0, approx = 0;
    liste.forEach(function (r) { profit += r.profit; cout += r.coutTotal; vente += r.prixVenteUS; if (r.dateApprox) approx++; if (r.ajust) { nbAjust++; ajust += r.profit; } else nb++; });
    return {
      nb: nb, nbAjust: nbAjust, ajustTotal: ajust, profitTotal: profit, coutTotal: cout, venteTotal: vente, nbApprox: approx,
      profitMoyen: nb > 0 ? profit / nb : 0,
      marge: cout > 0 ? profit / cout : 0,
      vehicules: liste.slice().sort(function (a, b) { return b.profit - a.profit; })
    };
  }

  function fenetre(lignes, debut, fin) {
    return agreger(lignes.filter(function (r) { return r.t >= debut && r.t <= fin; }));
  }

  function grouper(lignes, champ) {
    var groupes = {};
    lignes.forEach(function (r) {
      var cle = r[champ] || '(non spécifié)';
      (groupes[cle] = groupes[cle] || []).push(r);
    });
    return Object.keys(groupes).map(function (cle) { var a = agreger(groupes[cle]); a.cle = cle; return a; })
      .sort(function (a, b) { return b.profitTotal - a.profitTotal; });
  }

  /* --------------------------- Tableaux triables ------------------------ */
  var COL_VEHICULES = [
    { cle: 'date', libelle: 'Date', valeur: function (r) { return r.t; } },
    { cle: 'vehicule', libelle: 'Véhicule', valeur: nomVehicule },
    { cle: 'stock', libelle: 'Stock', valeur: function (r) { return r.stock; } },
    { cle: 'vin', libelle: 'VIN', valeur: vinCourt },
    { cle: 'compagnie', libelle: 'Cie', valeur: function (r) { return r.compagnie; } },
    { cle: 'acheteur', libelle: 'Acheteur', valeur: function (r) { return r.acheteur; } },
    { cle: 'coutTotal', libelle: 'Coût', num: true },
    { cle: 'prixVenteUS', libelle: 'Vente', num: true },
    { cle: 'profit', libelle: 'Profit', num: true },
    { cle: 'marge', libelle: 'Marge', num: true, valeur: marge }
  ];
  var COL_VEHICULES_CAN = [
    { cle: 'date', libelle: 'Date', valeur: function (r) { return r.t; } },
    { cle: 'vehicule', libelle: 'Véhicule', valeur: function (r) { return r.ajust ? 'Ajustement ' + (r.venduA || r.provenance || r.statut) : nomVehicule(r); } },
    { cle: 'type', libelle: 'Type', valeur: function (r) { return r.typeLibelle; } },
    { cle: 'stock', libelle: 'Stock', valeur: function (r) { return r.stock; } },
    { cle: 'vin', libelle: 'VIN', valeur: vinCourt },
    { cle: 'acheteur', libelle: 'Acheteur', valeur: function (r) { return r.acheteur; } },
    { cle: 'venduA', libelle: 'Vendu à', valeur: function (r) { return r.venduA; } },
    { cle: 'coutTotal', libelle: 'Coût', num: true },
    { cle: 'prixVenteUS', libelle: 'Vente ($ CA)', num: true },
    { cle: 'profit', libelle: 'Profit réel', num: true },
    { cle: 'marge', libelle: 'Marge', num: true, valeur: marge }
  ];
  var COL_VEHICULES_NEUF = [
    { cle: 'date', libelle: 'Date', valeur: function (r) { return r.t; } },
    { cle: 'vehicule', libelle: 'Véhicule', valeur: function (r) { return r.ajust ? 'Ajustement ' + (r.venduA || r.statut) : nomVehicule(r); } },
    { cle: 'type', libelle: 'Type', valeur: function (r) { return r.typeLibelle; } },
    { cle: 'stock', libelle: 'Stock', valeur: function (r) { return r.stock; } },
    { cle: 'vin', libelle: 'VIN', valeur: vinCourt },
    { cle: 'vendeur', libelle: 'Conseiller', valeur: function (r) { return r.vendeur; } },
    { cle: 'venduA', libelle: 'Client', valeur: function (r) { return r.venduA; } },
    { cle: 'prixVenteUS', libelle: 'Vente ($ CA)', num: true },
    { cle: 'profit', libelle: 'Profit (front + F&I)', num: true }
  ];
  function colonnesDe(source) { return source && source.cle === 'neuf' ? COL_VEHICULES_NEUF : (source && source.cle === 'can' ? COL_VEHICULES_CAN : COL_VEHICULES); }

  function trierPar(liste, colonnes, tri) {
    var c = trouver(colonnes, tri.cle);
    if (!c) return liste.slice();
    var val = c.valeur || function (r) { return r[c.cle]; };
    return liste.slice().sort(function (a, b) {
      var va = val(a), vb = val(b), r;
      var na = typeof va === 'number', nb = typeof vb === 'number';
      if (na || nb) {
        va = (na && !isNaN(va)) ? va : -Infinity;
        vb = (nb && !isNaN(vb)) ? vb : -Infinity;
        r = va === vb ? 0 : (va < vb ? -1 : 1);
      } else {
        r = String(va || '').localeCompare(String(vb || ''), 'fr', { numeric: true, sensitivity: 'base' });
      }
      return tri.desc ? -r : r;
    });
  }

  // En-tête de tableau ; cliquable quand `surTri` est fourni.
  function entete(colonnes, tri, surTri) {
    return h('thead', [h('tr', colonnes.map(function (c) {
      var actif = !!(surTri && tri && tri.cle === c.cle);
      var attrs = surTri ? { title: 'Trier par ' + c.libelle.toLowerCase(), 'aria-sort': actif ? (tri.desc ? 'descending' : 'ascending') : 'none' } : {};
      var th = h('th' + (c.num ? '.num' : '') + (surTri ? '.resultat-triable' : '') + (actif ? '.actif' : ''), attrs, [
        c.libelle, actif ? h('span.resultat-fleche', { text: tri.desc ? '▼' : '▲' }) : null
      ]);
      if (surTri) th.addEventListener('click', function () { surTri(c); });
      return th;
    }))]);
  }

  // Changement de tri : même colonne → inverse ; sinon décroissant pour les nombres et la date, croissant pour le texte.
  function changerTri(tri, c) {
    if (tri.cle === c.cle) tri.desc = !tri.desc;
    else { tri.cle = c.cle; tri.desc = !!c.num || c.cle === 'date'; }
  }

  /* ------------------------------ Section ------------------------------ */
  AMX.section('resultat', {
    titre: 'Résultat', icone: 'resultat', ordre: 50,
    // Visible avec le droit « Voir les résultats » (gestionnaire par défaut), pas seulement pour les admins (6 oct. : Patrick, gestionnaire, ne voyait pas Résultats).
    visible: function () { return AMX.perm('voirResultats') || AMX.estAdmin(); },
    // (9 oct.) deux onglets : les registres É.-U. et les Livres des ventes wholesale Canada des concessions (le serveur applique la portée).
    onglets: [
      { id: 'us', titre: 'É.-U.' },
      { id: 'can', titre: 'Wholesale Canada' },
      { id: 'neuf', titre: 'Véhicules neufs' }
    ],
    monter: function (conteneur, ctx) { return new Resultats(conteneur, ctx); }
  });

  // Conteneur des onglets : chaque vue est construite une fois et simplement affichée / masquée.
  function Resultats(conteneur, ctx) {
    injecterCss();
    this.conteneur = conteneur;
    this.vues = {};
    this.naviguer(ctx || {});
  }
  Resultats.prototype.naviguer = function (ctx) {
    var id = (ctx && SOURCES[ctx.onglet] && ctx.onglet !== 'us') ? ctx.onglet : 'us';
    if (!this.vues[id]) {
      var el = h('div.resultat-onglet', { dataset: { source: id } });
      this.conteneur.appendChild(el);
      this.vues[id] = new Resultat(el, SOURCES[id]);
    }
    var vues = this.vues;
    Object.keys(vues).forEach(function (k) { vues[k].conteneur.classList.toggle('cache', k !== id); });
    this.onglet = id;
  };
  Resultats.prototype.demonter = function () {
    var vues = this.vues;
    Object.keys(vues).forEach(function (k) { if (vues[k].demonter) { try { vues[k].demonter(); } catch (e) {} } });
    this.vues = {};
  };

  function Resultat(conteneur, source) {
    var self = this;
    injecterCss();
    this.source = source || SOURCES.us;
    this.conteneur = conteneur;
    this.enAttente = [];         // Wholesale Canada : ventes pas encore comptabilisées (profit prévu)
    this.exclus = null;          // Wholesale Canada : { lmb, lmbProfit, ajustOrphelins }
    this.type = 'tous';          // Wholesale Canada : tous / achat / echange
    this.lignes = null;          // lignes normalisées (null tant que rien n'est chargé)
    this.exclues = 0;            // lignes écartées (|profit| > seuil)
    this.quand = null;           // heure du dernier chargement réussi
    this.fenetres = {};          // cle de période → agrégat (recalculé à chaque rendu des KPI)
    this.erreur = ''; this.refus = '';
    this.enChargement = false; this.generation = 0; this.detruit = false;

    // Même concession que le reste du site (7 oct.) : le choix fait dans Inventaire ou Service
    // est repris ici, et un choix fait ici est gardé pour les autres pages.
    this.compagnie = AMX.compagnieChoisie('resultats') || 'TOUT';
    if (!trouver(COMPAGNIES_().map(function (c) { return { cle: c[0] }; }), this.compagnie)) this.compagnie = 'TOUT';
    if (this.source.types) { this.type = AMX.memo.lire(this.source.memo + '_type', 'tous'); if (!this.source.types.some(function (t) { return t[0] === self.type; })) this.type = 'tous'; }
    this.periode = null;         // cle de la période ouverte (liste des véhicules)
    this.regroupement = AMX.memo.lire(this.source.memo + '_regroupement', this.regroupements()[0].cle);
    if (!trouver(this.regroupements(), this.regroupement)) this.regroupement = this.regroupements()[0].cle;
    this.triVehicules = { cle: 'profit', desc: true };
    this.triGroupes = { cle: 'profitTotal', desc: true };
    this.groupesOuverts = {};
    this.fenetrePerso = null;    // { debut, fin, libelle, approx } quand la liste vient d'une barre ou d'un acheteur
    this.granularite = AMX.memo.lire(this.source.memo + '_granularite', 'mois');
    if (!trouver(GRANULARITES, this.granularite)) this.granularite = 'mois';
    this.horizon = parseInt(AMX.memo.lire(this.source.memo + '_horizon_' + this.granularite, ''), 10) || trouver(GRANULARITES, this.granularite).horizons[1][0];
    this.fenetreAcheteurs = AMX.memo.lire(this.source.memo + '_acheteurs_fenetre', 'annee');
    if (!trouver(FENETRES_ACHETEURS, this.fenetreAcheteurs)) this.fenetreAcheteurs = 'annee';
    this.mesureAcheteurs = AMX.memo.lire(this.source.memo + '_acheteurs_mesure', 'profitTotal');
    if (!trouver(MESURES_ACHETEURS, this.mesureAcheteurs)) this.mesureAcheteurs = 'profitTotal';
    this.seauActif = -1; this.acheteurActif = '';
    if (AMX.graph && AMX.graph.css) AMX.graph.css();

    this.construire();
    this.charger(false);
  }

  Resultat.prototype.demonter = function () { this.detruit = true; this.generation++; };
  Resultat.prototype.regroupements = function () { return this.source.cle === 'neuf' ? REGROUPEMENTS_NEUF : (this.source.cle === 'can' ? REGROUPEMENTS_CAN : REGROUPEMENTS); };
  // « estCan » = une source lue dans les Livres des ventes (Wholesale Canada ET Véhicules neufs) ; « estNeuf » précise l'onglet.
  Resultat.prototype.estCan = function () { return !!this.source.livres; };
  Resultat.prototype.estNeuf = function () { return this.source.cle === 'neuf'; };
  // Suffixe des titres : la compagnie (É.-U.) ou le type (Wholesale Canada, Véhicules neufs).
  Resultat.prototype.suffixe = function () {
    var s = this.compagnie !== 'TOUT' ? ' · ' + this.compagnie : '';
    if (this.estCan() && this.type !== 'tous') s += ' · ' + ({ achat: 'achats', echange: 'échanges', stock: 'stock', commande: 'commandes' }[this.type] || this.type);
    return s;
  };

  /* --------------------------- Construction ---------------------------- */
  Resultat.prototype.construire = function () {
    var self = this;
    AMX.vider(this.conteneur);

    this.elEtat = h('p', { text: this.source.chargement });
    this.btnsCie = {}; this.btnsType = {};
    this.elSegment = h('div.segment', { role: 'group', 'aria-label': 'Compagnie' });
    COMPAGNIES_().forEach(function (c) {
      var b = h('button', { type: 'button', text: c[1], onclick: function () { self.changerCompagnie(c[0]); } });
      self.btnsCie[c[0]] = b;
      self.elSegment.appendChild(b);
    });
    this.elSegmentType = null;
    if (this.source.types) {
      // Wholesale Canada : achats et échanges séparés (Maxime, 9 oct.)
      this.elSegmentType = h('div.segment', { role: 'group', 'aria-label': this.source.segmentTypes || 'Type' });
      this.source.types.forEach(function (t) {
        var b = h('button', { type: 'button', text: t[1], onclick: function () { self.changerType(t[0]); } });
        self.btnsType[t[0]] = b;
        self.elSegmentType.appendChild(b);
      });
    }
    this.btnRafraichir = h('button.btn', { type: 'button', html: I.rafraichir + '<span>Rafraîchir</span>', onclick: function () { self.charger(true); } });
    this.elActions = h('div.actions', [this.elSegment, this.elSegmentType, this.btnRafraichir]);

    this.elVide = h('div');
    this.elKpis = h('div.kpis');
    this.elNote = h('p.resultat-note.doux.petit.cache');
    this.elAttente = h('div.carte.resultat-attente.cache');
    this.elEvolution = h('div.carte.resultat-evolution.cache');
    this.elAcheteurs = h('div.carte.resultat-acheteurs.cache');
    this.elDetail = h('div.carte.resultat-detail.cache');
    this.elVentilation = h('div.carte.resultat-ventilation.cache');

    this.elPage = h('div.page.etroite.resultat-page', [
      h('div.entete-page', [h('div', { style: { minWidth: 0 } }, [h('h1', [this.source.titre, this.source.sous ? h('span.resultat-h1-sous', { text: this.source.sous }) : null]), this.elEtat]), this.elActions]),
      this.elVide, this.elKpis, this.elNote, this.elAttente, this.elEvolution, this.elAcheteurs, this.elDetail, this.elVentilation
    ]);
    this.conteneur.appendChild(this.elPage);
  };

  /* ------------------------------ Données ------------------------------ */
  Resultat.prototype.charger = function (manuel) {
    var self = this, gen = ++this.generation;
    this.enChargement = true;
    if (manuel) this.btnRafraichir.classList.add('occupe');
    if (!this.lignes) this.rendre();   // squelettes
    // Wholesale Canada : relire les Livres des ventes prend 15 à 30 s côté serveur (Rafraîchir, ou cache
    // expiré) — une seule requête, patiente, plutôt que la requête de secours à 6 s et la coupure à 25 s.
    var opts = this.estCan() ? { delai: 60000, secours: 45000 } : undefined;
    return AMX.get(this.source.route + (manuel && this.estCan() ? '&force=1' : ''), opts).then(function (d) {
      if (self.detruit || gen !== self.generation) return;
      self.enChargement = false;
      self.btnRafraichir.classList.remove('occupe');
      if (d && d.refuse) {
        self.refus = d.erreur || d.message || 'Les résultats sont réservés aux administrateurs.';
        self.rendre();
        return;
      }
      if (!d || d.ok === false) throw new Error((d && (d.erreur || d.message)) || 'Réponse inattendue du serveur');
      var n = normaliser(d.rows || [], self.source.seuil);
      self.lignes = n.lignes; self.exclues = n.exclues;
      var lu = self.estCan() && d.genereLe ? new Date(d.genereLe) : null;   // heure de lecture des livres (cache serveur)
      self.quand = lu && !isNaN(lu.getTime()) ? lu : new Date();
      self.enAttente = normaliser(d.enAttente || [], Infinity).lignes;
      self.exclus = d.exclus || null; self.horsPortee = !!d.horsPortee; self.livres = d.livres || []; self.livreErreurs = d.erreurs || [];
      self.erreur = ''; self.refus = '';
      self.rendre();
      if (manuel) AMX.toast('Résultats mis à jour — ' + pluriel(self.lignes.length, 'vente'), 'ok');
    }, function (e) {
      if (self.detruit || gen !== self.generation) return;
      self.enChargement = false;
      self.btnRafraichir.classList.remove('occupe');
      self.erreur = AMX.erreurTexte(e);
      self.rendre();
      AMX.toast('Impossible de charger les résultats — ' + self.erreur, 'erreur');
    });
  };

  Resultat.prototype.filtrees = function () {
    var c = this.compagnie, t = this.estCan() ? this.type : 'tous';
    return (this.lignes || []).filter(function (r) { return (c === 'TOUT' || r.compagnie === c) && (t === 'tous' || r.type === t); });
  };
  // Wholesale Canada : Achats / Échanges / Tous (mémo par navigateur).
  Resultat.prototype.changerType = function (t) {
    if (t === this.type) return;
    this.type = t;
    AMX.memo.ecrire(this.source.memo + '_type', t);
    this.groupesOuverts = {};
    if (this.periode === 'perso') { this.periode = null; this.fenetrePerso = null; this.seauActif = -1; this.acheteurActif = ''; }
    this.rendre();
  };

  Resultat.prototype.changerCompagnie = function (cie) {
    if (cie === this.compagnie) return;
    this.compagnie = cie;
    AMX.choisirCompagnie(cie === 'TOUT' ? '' : cie);
    this.groupesOuverts = {};
    if (this.periode === 'perso') { this.periode = null; this.fenetrePerso = null; this.seauActif = -1; this.acheteurActif = ''; }
    this.rendre();
  };

  /* -------------------------------- Rendu ------------------------------ */
  Resultat.prototype.rendre = function () {
    this.rendreEntete();
    this.rendreVide();
    this.rendreKpis();
    this.rendreNote();
    this.rendreAttente();
    this.rendreEvolution();
    this.rendreAcheteurs();
    this.rendreDetail();
    this.rendreVentilation();
  };

  Resultat.prototype.rendreEntete = function () {
    var self = this;
    Object.keys(this.btnsCie).forEach(function (k) { self.btnsCie[k].classList.toggle('actif', k === self.compagnie); });
    Object.keys(this.btnsType).forEach(function (k) { self.btnsType[k].classList.toggle('actif', k === self.type); });
    AMX.vider(this.elEtat);
    if (this.refus) { this.elEtat.textContent = 'Accès réservé aux administrateurs.'; this.elActions.classList.add('cache'); return; }
    this.elActions.classList.remove('cache');
    if (!this.lignes) { this.elEtat.textContent = this.erreur ? 'Serveur injoignable.' : this.source.chargement; return; }
    var a = agreger(this.filtrees()), n = a.nb;
    if (this.estCan()) {
      var c = this.compagnie, parCie = (this.lignes || []).filter(function (r) { return c === 'TOUT' || r.compagnie === c; });
      var tout = agreger(parCie), attente = this.enAttente.filter(function (r) { return c === 'TOUT' || r.compagnie === c; });
      var t1 = this.source.types[1][0], t2 = this.source.types[2][0];
      var g1 = agreger(parCie.filter(function (r) { return r.type === t1; })), g2 = agreger(parCie.filter(function (r) { return r.type === t2; }));
      var nom1 = this.estNeuf() ? 'en stock' : 'achat', nom2 = this.estNeuf() ? 'commande' : 'échange';
      var p1 = this.estNeuf() ? g1.nb + ' en stock' : pluriel(g1.nb, nom1), p2 = pluriel(g2.nb, nom2);
      var tete = this.estNeuf()
        ? tout.nb + ' vente' + (tout.nb > 1 ? 's' : '') + ' neuve' + (tout.nb > 1 ? 's' : '')
        : tout.nb + ' vente' + (tout.nb > 1 ? 's' : '') + ' comptabilisée' + (tout.nb > 1 ? 's' : '');
      this.elEtat.appendChild(document.createTextNode(
        tete + ' (' + p1 + ' ' + AMX.fmtArgent(g1.profitTotal, 0) + ' · ' + p2 + ' ' + AMX.fmtArgent(g2.profitTotal, 0) + ')' + (c !== 'TOUT' ? ' · ' + c : '') + ' · livres lus à ' + heure(this.quand)
      ));
      var nPrevu = parCie.filter(function (r) { return r.profitSource === 'prevu' && !r.ajust; }).length;
      if (nPrevu) this.elEtat.appendChild(h('span.puce.gris', { title: 'Ventes dont la comptabilité n\'a pas encore inscrit le profit réel : le profit prévu (front + F&I) est pris en attendant.', text: nPrevu + ' au prévu' }));
      if (attente.length) this.elEtat.appendChild(h('span.puce.attention', { title: 'Ventes inscrites au livre mais pas encore comptabilisées : leur profit réel n\'est pas connu, elles ne comptent pas.', text: attente.length + ' en attente' }));
      if (this.exclus && this.exclus.lmb && (c === 'TOUT' || c === 'STM')) this.elEtat.appendChild(h('span.puce.gris', { title: 'Lignes LMB CAN du livre de Ste-Marie, exclues des statistiques (profit comptabilisé ' + AMX.fmtArgent(this.exclus.lmbProfit || 0) + ').', text: 'LMB exclus (' + this.exclus.lmb + ')' }));
      (this.livreErreurs || []).forEach(function (e) {
        if (c !== 'TOUT' && e.compagnie !== c) return;
        self.elEtat.appendChild(h('span.puce.alerte', { title: erreurLivre(e) + '\n' + e.erreur, text: e.compagnie + ' : livre illisible' }));
      });
    } else {
      this.elEtat.appendChild(document.createTextNode(
        pluriel(n, 'vente') + (this.compagnie !== 'TOUT' ? ' · ' + this.compagnie : '') + ' · mis à jour à ' + heure(this.quand)
      ));
    }
    if (this.exclues) {
      this.elEtat.appendChild(h('span.puce.attention', {
        title: pluriel(this.exclues, 'ligne') + ' dont le profit dépasse ' + AMX.fmtArgent(this.source.seuil) + ' en valeur absolue : erreur de saisie probable, exclue' + (this.exclues > 1 ? 's' : '') + ' des calculs.',
        text: pluriel(this.exclues, 'exclue')
      }));
    }
  };

  // États pleine largeur : accès refusé (verrouillé) ou serveur injoignable sans données.
  Resultat.prototype.rendreVide = function () {
    var self = this;
    AMX.vider(this.elVide);
    if (this.refus) {
      this.elVide.appendChild(h('div.vide.resultat-verrou', [h('div', { html: I.cadenas }), h('h3', 'Accès non autorisé'), h('div', { text: this.refus })]));
      return;
    }
    if (!this.lignes && this.erreur) {
      this.elVide.appendChild(h('div.vide', [h('div', { html: I.alerte }), h('h3', 'Serveur injoignable'), h('div', { text: this.erreur }),
        h('div', { style: { marginTop: '12px' } }, [h('button.btn', { type: 'button', html: I.rafraichir + '<span>Réessayer</span>', onclick: function () { self.charger(true); } })])]));
      return;
    }
    // Wholesale Canada : aucun Livre des ventes dans la portée du compte (ou aucune ligne lisible).
    if (this.estCan() && this.lignes && !this.lignes.length && !this.enAttente.length) {
      var ls = this.livres || [], err = this.livreErreurs || [];
      this.elVide.appendChild(h('div.vide', [h('div', { html: I.filtre }), h('h3', this.horsPortee ? 'Aucun Livre des ventes pour votre concession' : (this.estNeuf() ? 'Aucune vente de véhicule neuf' : 'Aucune vente wholesale comptabilisée')),
        h('div', { text: this.horsPortee ? 'Les Livres des ventes lus sont ceux de Ste-Marie, BMW Sherbrooke, VW Brossard et Hyundai Longueuil.' : (ls.length ? 'Livres lus : ' + ls.map(function (l) { return l.compagnie + ' (' + l.lignes + ' lignes)'; }).join(', ') + '.' : '') + (err.length ? ' Illisibles : ' + err.map(function (e) { return e.compagnie; }).join(', ') + '.' : '') })]));
    }
  };

  Resultat.prototype.rendreKpis = function () {
    var self = this;
    AMX.vider(this.elKpis);
    var cache = !!this.refus || (!this.lignes && !!this.erreur);
    this.elKpis.classList.toggle('cache', cache);
    if (cache) return;
    if (!this.lignes) {
      self.elKpis.appendChild(AMX.chargeur('Résultats'));
      return;
    }
    var b = bornes(), lignes = this.filtrees();
    this.fenetres = {};
    PERIODES.forEach(function (p) {
      var f = self.fenetres[p.cle] = fenetre(lignes, p.debut(b), b.fin);
      var actif = self.periode === p.cle;
      var approx = p.approx && self.source.approx;
      var titre = p.libelle + ' : ' + pluriel(f.nb, 'vente') + ', profit moyen ' + AMX.fmtArgent(f.profitMoyen) + '.';
      if (approx) titre += '\n≈ ' + TEXTE_APPROX + (f.nbApprox ? ' Ici, ' + f.nbApprox + ' date' + (f.nbApprox > 1 ? 's' : '') + ' sur ' + f.nb + ' ' + (f.nbApprox > 1 ? 'sont approximatives' : 'est approximative') + '.' : '');
      if (f.nbAjust) titre += '\n' + pluriel(f.nbAjust, 'ajustement comptable') + ' sans véhicule (' + AMX.fmtArgent(f.ajustTotal) + ') compris dans le total.';
      titre += '\nCliquer pour ' + (actif ? 'masquer' : 'voir') + ' la liste des véhicules.';
      var k = h('button.kpi' + (actif ? '.actif' : '') + (approx ? '.resultat-kpi-approx' : ''), { type: 'button', title: titre, 'aria-pressed': actif ? 'true' : 'false' }, [
        h('div.valeur.num.' + signeClasse(f.profitTotal), { text: AMX.fmtArgent(f.profitTotal) }),
        h('div.libelle', [p.libelle, approx ? h('span.resultat-approx', { text: '≈', 'aria-label': 'approximatif' }) : null]),
        h('div.sous', { text: f.nb || f.nbAjust ? pluriel(f.nb, 'vente') + (self.estNeuf() ? ' · profit moyen ' + AMX.fmtArgent(f.profitMoyen, 0) : ' · marge ' + (f.coutTotal > 0 ? fmtPct(f.marge) : '—')) + (f.nbAjust ? ' · ' + f.nbAjust + ' ajust.' : '') : 'aucune vente' })
      ]);
      k.addEventListener('click', function () {
        var ouvre = self.periode !== p.cle;
        self.periode = ouvre ? p.cle : null;
        self.fenetrePerso = null; self.seauActif = -1; self.acheteurActif = '';
        self.rendreKpis();
        self.rendreEvolution(); self.rendreAcheteurs();
        self.rendreDetail();
        if (ouvre && self.elDetail.scrollIntoView) self.elDetail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
      self.elKpis.appendChild(k);
    });
  };

  Resultat.prototype.rendreNote = function () {
    AMX.vider(this.elNote);
    if (!this.lignes || this.refus) { this.elNote.classList.add('cache'); return; }
    this.elNote.classList.remove('cache');
    if (this.estNeuf()) {
      var exN = this.exclus || {};
      this.elNote.appendChild(document.createTextNode(
        'Lu dans l\'onglet « Livre Ventes Neuf » de chaque concession. Profit = profit front + profit F&I : le réel quand la comptabilité l\'a inscrit, sinon le prévu (marqué « prévu »). ' +
        'Stock ou commande d\'après le livre (Locate = commande). Les « Ajust. Neuf » sont rattachés au véhicule par # stock' + (exN.ajustOrphelins ? ' ; ' + exN.ajustOrphelins + ' sans véhicule dans le livre ' + (exN.ajustOrphelins > 1 ? 'sont listés' : 'est listé') + ' à part' : '') + '. ' +
        (exN.autres ? pluriel(exN.autres, 'ligne') + ' hors ventes (échanges entre concessions…) ' + (exN.autres > 1 ? 'ignorées' : 'ignorée') + '. ' : '') +
        (exN.annulees ? exN.annulees + ' vente' + (exN.annulees > 1 ? 's' : '') + ' annulée' + (exN.annulees > 1 ? 's' : '') + ' (CANCELLÉ / REFUSÉ) ' + (exN.annulees > 1 ? 'ignorées' : 'ignorée') + '. ' : '') +
        'Pas de coût dans ces livres : pas de marge. Chaque vente a sa date exacte.' +
        ((this.livreErreurs || []).length ? ' Livre illisible : ' + this.livreErreurs.map(function (e) { return e.compagnie + ' — ' + erreurLivre(e); }).join(' ; ') + '.' : '')
      ));
      return;
    }
    if (this.estCan()) {
      var ex = this.exclus || {}, att = agreger(this.enAttente);
      this.elNote.appendChild(document.createTextNode(
        'Seules les ventes comptabilisées comptent (profit réel inscrit par la comptabilité dans le Livre des ventes). ' +
        (this.enAttente.length ? pluriel(this.enAttente.length, 'vente') + ' en attente (profit prévu ' + AMX.fmtArgent(att.profitTotal, 0) + '). ' : 'Aucune vente en attente. ') +
        (ex.lmb ? 'LMB exclus : ' + pluriel(ex.lmb, 'ligne') + ' (' + AMX.fmtArgent(ex.lmbProfit || 0, 0) + '). ' : '') +
        'Les ajustements comptables (transport, crédits, annulations) sont rattachés au véhicule par # stock' + (ex.ajustOrphelins ? ' ; ' + ex.ajustOrphelins + ' sans véhicule dans le livre ' + (ex.ajustOrphelins > 1 ? 'sont listés' : 'est listé') + ' à part' : '') + '. ' +
        'Marge = profit ÷ coût (Ste-Marie : achat + BT + frais + transport ; BMW, VW, Hyundai : coût ≈ prix de vente − profit, et achat / échange déduit du # stock). ' +
        'Hyundai Longueuil n\'a pas de wholesale dans son livre : ses ventes d\'occasion sont prises, profit = front + F&I, réel quand il est inscrit sinon prévu (marqué « prévu »)' + (ex.annulees ? ' ; ' + ex.annulees + ' vente' + (ex.annulees > 1 ? 's' : '') + ' annulée' + (ex.annulees > 1 ? 's' : '') + ' (CANCELLÉ / REFUSÉ) ' + (ex.annulees > 1 ? 'ignorées' : 'ignorée') : '') + '. Chaque vente a sa date exacte.' +
        ((this.livreErreurs || []).length ? ' Livre illisible : ' + this.livreErreurs.map(function (e) { return e.compagnie + ' — ' + erreurLivre(e); }).join(' ; ') + '.' : '')
      ));
      return;
    }
    this.elNote.appendChild(h('span.resultat-approx', { text: '≈', 'aria-hidden': 'true' }));
    this.elNote.appendChild(document.createTextNode(
      ' Les fenêtres 10 et 30 jours sont approximatives (mois de dépôt, le 15 servant de repère) ; trimestre, semestre et année restent fiables. ' +
      'Marge = profit ÷ coût total. ' +
      (this.exclues ? pluriel(this.exclues, 'vente') + ' dont |profit| dépasse ' + AMX.fmtArgent(this.source.seuil) + ' ' + (this.exclues > 1 ? 'sont exclues' : 'est exclue') + ' (erreur de saisie probable).' : 'Les ventes dont |profit| dépasse ' + AMX.fmtArgent(this.source.seuil) + ' seraient exclues comme erreurs de saisie ; aucune aujourd\'hui.')
    ));
  };

  // Wholesale Canada : les ventes inscrites mais pas encore comptabilisées (profit PRÉVU), hors statistiques.
  Resultat.prototype.rendreAttente = function () {
    var self = this;
    AMX.vider(this.elAttente);
    var liste = this.estCan() ? this.enAttente.filter(function (r) { return (self.type === 'tous' || r.type === self.type) && (self.compagnie === 'TOUT' || r.compagnie === self.compagnie); }) : [];
    var cache = !this.lignes || !!this.refus || !liste.length;
    this.elAttente.classList.toggle('cache', cache);
    if (cache) return;
    var a = agreger(liste);
    this.elAttente.appendChild(h('div.carte-entete', [
      h('h2', ['En attente de la comptabilité', h('span.sous', { text: pluriel(a.nb, 'vente') + ' · profit prévu ' + AMX.fmtArgent(a.profitTotal, 0) + ' · pas encore dans les statistiques' })])
    ]));
    var tbody = h('tbody');
    liste.slice().sort(function (x, y) { return (y.t || 0) - (x.t || 0); }).forEach(function (v) {
      tbody.appendChild(h('tr', [
        h('td.num', { text: v.date ? AMX.fmtDate(v.date) : '—' }),
        h('td', [h('div', { text: nomVehicule(v) }), v.provenance ? h('div.mini', { text: v.provenance }) : null]),
        h('td', [h('span.puce.type-' + (v.type || 'ajust'), { text: v.typeLibelle })]),
        h('td', { text: v.venduA || '—' }),
        h('td', { text: v.acheteur || '—' }),
        h('td.num', { text: AMX.fmtArgent(v.coutTotal) }),
        h('td.num', { text: AMX.fmtArgent(v.prixVenteUS) }),
        h('td.num.' + signeClasse(v.profit), { text: AMX.fmtArgent(v.profit) })
      ]));
    });
    this.elAttente.appendChild(h('div.carte-corps', [h('div.resultat-defilant', [h('table.tableau.resultat-ta', [
      h('thead', [h('tr', [h('th', 'Date'), h('th', 'Véhicule'), h('th', 'Type'), h('th', 'Vendu à'), h('th', 'Acheteur'), h('th.num', 'Coût'), h('th.num', 'Vente ($ CA)'), h('th.num', 'Profit prévu')])]),
      tbody
    ])])]));
  };

  // Liste des véhicules de la période ouverte.
  Resultat.prototype.rendreDetail = function () {
    var self = this;
    AMX.vider(this.elDetail);
    var p = this.periode === 'perso' && this.fenetrePerso ? { cle: 'perso', libelle: this.fenetrePerso.libelle, approx: !!this.fenetrePerso.approx } : trouver(PERIODES, this.periode);
    if (!p || !this.lignes || this.refus) { this.elDetail.classList.add('cache'); return; }
    this.elDetail.classList.remove('cache');
    var f = p.cle === 'perso' ? this.fenetreListe(this.fenetrePerso) : (this.fenetres[p.cle] || agreger([]));

    var sous = f.nb || f.nbAjust
      ? pluriel(f.nb, 'vente') + ' · profit moyen ' + AMX.fmtArgent(f.profitMoyen) + (this.estNeuf() ? '' : ' · marge ' + (f.coutTotal > 0 ? fmtPct(f.marge) : '—')) + (f.nbAjust ? ' · ' + pluriel(f.nbAjust, 'ajustement') : '') + this.suffixe()
      : 'aucune vente dans cette fenêtre' + (this.compagnie !== 'TOUT' && !this.estCan() ? ' pour ' + this.compagnie : '');
    var approxP = p.approx && this.source.approx;
    var titre = h('h2', [p.libelle, approxP ? h('span.resultat-approx', { text: '≈', title: TEXTE_APPROX }) : null, h('span.sous', { text: sous })]);
    var btnExport = h('button.btn.petit', { type: 'button', html: I.telecharger + '<span>Exporter Excel</span>', disabled: !f.nb, onclick: function () { self.exporter(); } });
    var btnFermer = h('button.btn.petit.icone.fantome', { type: 'button', 'aria-label': 'Fermer la liste', title: 'Fermer', html: I.fermer, onclick: function () { self.periode = null; self.fenetrePerso = null; self.seauActif = -1; self.acheteurActif = ''; self.rendreKpis(); self.rendreEvolution(); self.rendreAcheteurs(); self.rendreDetail(); } });
    this.elDetail.appendChild(h('div.carte-entete', [titre, h('div.resultat-actions', [btnExport, btnFermer])]));

    if (!f.vehicules.length) {
      this.elDetail.appendChild(h('div.carte-corps', [h('div.vide', [h('div', { html: I.voiture }), h('h3', 'Aucune vente'), h('div', { text: 'Aucun véhicule vendu dans cette fenêtre' + this.suffixe() + '.' })])]));
      return;
    }
    this.elDetail.appendChild(this.tableVehicules(f.vehicules, this.triVehicules, function (c) { changerTri(self.triVehicules, c); self.rendreDetail(); }));
  };

  // Ventilation de l'année en cours (marque / modèle / année / provenance / acheteur).
  Resultat.prototype.rendreVentilation = function () {
    var self = this;
    AMX.vider(this.elVentilation);
    var cache = !this.lignes || !!this.refus;
    this.elVentilation.classList.toggle('cache', cache);
    if (cache) return;

    var b = bornes();
    var annee = this.filtrees().filter(function (r) { return r.t >= b.annee && r.t <= b.fin; });
    var REG = this.regroupements();
    var reg = trouver(REG, this.regroupement) || REG[0];
    var base = reg.requiertMarque ? annee.filter(function (r) { return r.marque; }) : annee;
    var groupes = grouper(base, reg.champ);

    this.elVentilation.appendChild(h('div.carte-entete', [
      h('h2', ['Ventilation', h('span.sous', { text: 'année ' + new Date().getFullYear() + ' · ' + pluriel(base.length, 'vente') + (base.length !== annee.length ? ' avec marque sur ' + annee.length : '') + this.suffixe() })]),
      h('span.doux.petit', { text: 'Cliquez une ligne pour voir ses véhicules' })
    ]));

    var onglets = h('div.onglets', { role: 'tablist' });
    REG.forEach(function (r) {
      onglets.appendChild(h('button' + (r.cle === reg.cle ? '.actif' : ''), {
        type: 'button', role: 'tab', 'aria-selected': r.cle === reg.cle ? 'true' : 'false', text: r.libelle,
        onclick: function () {
          if (r.cle === self.regroupement) return;
          self.regroupement = r.cle;
          AMX.memo.ecrire(self.source.memo + '_regroupement', r.cle);
          self.groupesOuverts = {};
          self.rendreVentilation();
        }
      }));
    });
    this.elVentilation.appendChild(h('div.resultat-onglets', [onglets]));

    if (!groupes.length) {
      this.elVentilation.appendChild(h('div.carte-corps', [h('div.vide', [h('div', { html: I.filtre }), h('h3', 'Aucune donnée'), h('div', { text: 'Aucune vente de l\'année en cours pour cette catégorie' + this.suffixe() + '.' })])]));
      return;
    }
    this.elVentilation.appendChild(this.tableGroupes(groupes, reg));
  };

  /* ---------------------------- Évolution ------------------------------- */
  // Agrégat d'une fenêtre personnalisée { debut, fin, acheteur? }.
  Resultat.prototype.fenetreListe = function (w) {
    var champW = this.source.champAcheteur || 'acheteur';
    var lignes = this.filtrees().filter(function (r) { return r.t >= w.debut && r.t <= w.fin && (!w.acheteur || (r[champW] || '(non spécifié)') === w.acheteur); });
    return agreger(lignes);
  };
  Resultat.prototype.ouvrirPerso = function (w) {
    this.periode = 'perso'; this.fenetrePerso = w;
    this.rendreKpis(); this.rendreEvolution(); this.rendreAcheteurs(); this.rendreDetail();
    if (this.elDetail.scrollIntoView) this.elDetail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  Resultat.prototype.seauxCourants = function () { return seaux(this.granularite, this.horizon); };

  Resultat.prototype.rendreEvolution = function () {
    var self = this;
    AMX.vider(this.elEvolution);
    var cache = !this.lignes || !!this.refus || !AMX.graph;
    this.elEvolution.classList.toggle('cache', cache);
    if (cache) return;
    var gran = trouver(GRANULARITES, this.granularite);
    var liste = this.seauxCourants(), lignes = this.filtrees();
    var valeurs = [], nb = [], cumul = [], total = 0, approx = 0, nbTotal = 0;
    liste.forEach(function (sx) {
      var dans = lignes.filter(function (r) { return r.t >= sx.debut && r.t <= sx.fin; });
      var p = 0, nv = 0; dans.forEach(function (r) { p += r.profit; if (r.dateApprox) approx++; if (!r.ajust) nv++; });
      total += p; nbTotal += nv;
      valeurs.push(p); nb.push(nv); cumul.push(total);
    });

    // En-tête : titre + granularité + horizon
    var segment = h('div.segment', { role: 'group', 'aria-label': 'Granularité' }, GRANULARITES.map(function (g) {
      return h('button' + (g.cle === self.granularite ? '.actif' : ''), { type: 'button', text: g.libelle, onclick: function () {
        if (g.cle === self.granularite) return;
        self.granularite = g.cle; AMX.memo.ecrire(self.source.memo + '_granularite', g.cle);
        self.horizon = parseInt(AMX.memo.lire(self.source.memo + '_horizon_' + g.cle, ''), 10) || g.horizons[1][0];
        self.seauActif = -1; if (self.periode === 'perso' && self.fenetrePerso && !self.fenetrePerso.acheteur) { self.periode = null; self.fenetrePerso = null; }
        self.rendreEvolution(); self.rendreAcheteurs(); self.rendreDetail();
      } });
    }));
    var selHorizon = h('select.saisie', { 'aria-label': 'Horizon', style: { height: '28px', width: 'auto' } }, gran.horizons.map(function (o) { return h('option', { value: String(o[0]), selected: o[0] === self.horizon ? true : undefined, text: o[1] }); }));
    selHorizon.addEventListener('change', function () { self.horizon = parseInt(selHorizon.value, 10); AMX.memo.ecrire(self.source.memo + '_horizon_' + self.granularite, String(self.horizon)); self.seauActif = -1; self.rendreEvolution(); self.rendreAcheteurs(); });
    this.elEvolution.appendChild(h('div.carte-entete', [
      h('h2', ['Évolution du profit', h('span.sous', { text: pluriel(nbTotal, 'vente') + ' · ' + AMX.fmtArgent(total) + ' sur ' + trouver(gran.horizons.map(function (o) { return { cle: o[0], libelle: o[1] }; }), this.horizon).libelle + this.suffixe() })]),
      h('div.resultat-actions', [segment, selHorizon])
    ]));

    var corps = h('div.carte-corps');
    corps.appendChild(AMX.graph.barres({ valeurs: valeurs, nb: nb, cumul: cumul }, {
      etiquettes: liste.map(function (x) { return x.etiquette; }),
      sousEtiquettes: liste.map(function (x) { return x.sous; }),
      aria: 'Profit par ' + gran.libelle.toLowerCase() + ' et cumul',
      libelleCumul: 'Cumul', actif: this.seauActif,
      surClic: function (i) {
        var sx = liste[i];
        if (self.seauActif === i) { self.seauActif = -1; self.periode = null; self.fenetrePerso = null; self.rendreKpis(); self.rendreEvolution(); self.rendreAcheteurs(); self.rendreDetail(); return; }
        self.seauActif = i; self.acheteurActif = '';
        self.ouvrirPerso({ debut: sx.debut, fin: sx.fin, libelle: sx.long, approx: gran.approx && self.source.approx });
      }
    }));
    corps.appendChild(h('div.graph-legende', [
      h('span.graph-legende-item', [h('i', { style: { background: 'var(--vert)' } }), 'Profit de la période (rouge si perte)']),
      h('span.graph-legende-item', [h('i', { style: { background: 'var(--bleu)', borderRadius: '50%' } }), 'Profit cumulé depuis le début de la fenêtre (axe de droite)']),
      h('span.doux', { text: 'Cliquez une barre pour voir ses véhicules.' })
    ]));
    if (gran.approx && this.source.approx && approx) corps.appendChild(h('p.resultat-note.doux.petit', { style: { margin: '10px 0 0' } }, [h('span.resultat-approx', { text: '≈' }), ' ' + approx + ' des ' + nbTotal + ' ventes affichées n\'ont que le mois de dépôt (placées au 15) : la répartition par semaine est approximative, le total par mois reste juste.']));
    this.elEvolution.appendChild(corps);
  };

  /* --------------------------- Par acheteur ----------------------------- */
  Resultat.prototype.rendreAcheteurs = function () {
    var self = this;
    AMX.vider(this.elAcheteurs);
    var cache = !this.lignes || !!this.refus || !AMX.graph;
    this.elAcheteurs.classList.toggle('cache', cache);
    if (cache) return;
    var b = bornes();
    var fen = trouver(FENETRES_ACHETEURS, this.fenetreAcheteurs) || FENETRES_ACHETEURS[1];
    var mesure = trouver(MESURES_ACHETEURS, this.mesureAcheteurs) || MESURES_ACHETEURS[0];
    var debut = fen.debut(b);
    var lignes = this.filtrees().filter(function (r) { return r.t >= debut && r.t <= b.fin; });
    var champA = this.source.champAcheteur || 'acheteur';
    var groupes = grouper(lignes, champA).sort(function (x, y) { return y[mesure.cle] - x[mesure.cle]; });

    var segFen = h('div.segment', { role: 'group', 'aria-label': 'Fenêtre' }, FENETRES_ACHETEURS.map(function (f) {
      return h('button' + (f.cle === self.fenetreAcheteurs ? '.actif' : ''), { type: 'button', text: f.libelle, onclick: function () { if (f.cle === self.fenetreAcheteurs) return; self.fenetreAcheteurs = f.cle; AMX.memo.ecrire(self.source.memo + '_acheteurs_fenetre', f.cle); self.acheteurActif = ''; self.rendreAcheteurs(); } });
    }));
    var selMesure = h('select.saisie', { 'aria-label': 'Mesure', style: { height: '28px', width: 'auto' } }, MESURES_ACHETEURS.map(function (m) { return h('option', { value: m.cle, selected: m.cle === self.mesureAcheteurs ? true : undefined, text: m.libelle }); }));
    selMesure.addEventListener('change', function () { self.mesureAcheteurs = selMesure.value; AMX.memo.ecrire(self.source.memo + '_acheteurs_mesure', selMesure.value); self.rendreAcheteurs(); });
    var total = 0, nbVentes = 0; groupes.forEach(function (g) { total += g.profitTotal; nbVentes += g.nb; });
    this.elAcheteurs.appendChild(h('div.carte-entete', [
      h('h2', [this.source.titreAcheteurs || 'Par acheteur', h('span.sous', { text: fen.libelle.toLowerCase() + ' · ' + pluriel(nbVentes, 'vente') + ' · ' + AMX.fmtArgent(total) + this.suffixe() })]),
      h('div.resultat-actions', [segFen, selMesure])
    ]));
    var corps = h('div.carte-corps');
    if (!groupes.length) {
      corps.appendChild(h('div.vide', [h('div', { html: I.filtre }), h('h3', 'Aucune vente'), h('div', { text: 'Aucune vente dans cette fenêtre' + this.suffixe() + '.' })]));
      this.elAcheteurs.appendChild(corps); return;
    }
    var actifIdx = -1;
    var items = groupes.map(function (g, i) {
      if (g.cle === self.acheteurActif) actifIdx = i;
      return { nom: g.cle, valeur: g[mesure.cle], sous: mesure.cle === 'nb' ? AMX.fmtArgent(g.profitTotal, 0) : (pluriel(g.nb, 'vente') + (self.estNeuf() ? ' · moy. ' + AMX.fmtArgent(g.profitMoyen, 0) : ' · marge ' + (g.coutTotal > 0 ? fmtPct(g.marge) : '—'))), couleur: AMX.graph.couleurs[i % AMX.graph.couleurs.length] };
    });
    corps.appendChild(h('div.resultat-graph-acheteurs', [AMX.graph.horizontal(items, {
      libelle: mesure.libelle, format: mesure.format, actif: actifIdx, aria: mesure.libelle + ' ' + (this.source.titreAcheteurs || 'par acheteur').toLowerCase(),
      surClic: function (i) {
        var g = groupes[i];
        if (self.acheteurActif === g.cle) { self.acheteurActif = ''; self.periode = null; self.fenetrePerso = null; self.rendreKpis(); self.rendreEvolution(); self.rendreAcheteurs(); self.rendreDetail(); return; }
        self.acheteurActif = g.cle; self.seauActif = -1;
        self.ouvrirPerso({ debut: debut, fin: b.fin, acheteur: g.cle, libelle: g.cle + ' — ' + fen.libelle.toLowerCase(), approx: false });
      }
    })]));
    corps.appendChild(h('p.doux.petit', { style: { margin: '6px 0 0' }, text: this.estCan() ? 'Cliquez un acheteur pour voir ses véhicules. Les échanges sont sous « Échangé » ; les ventes sans acheteur inscrit au livre sous « (non spécifié) ».' : 'Cliquez un acheteur pour voir ses véhicules. Les ventes sans acheteur inscrit au registre sont regroupées sous « (non spécifié) ».' }));

    // Cumul par acheteur sur les périodes de l'évolution (6 premiers)
    var gran = trouver(GRANULARITES, this.granularite);
    var liste = this.seauxCourants();
    var tete = groupes.slice(0, 6);
    // Le classement vient de la fenêtre « acheteurs » ; le cumul suit les périodes du graphique d'évolution.
    var tousParAcheteur = {};
    this.filtrees().forEach(function (r) { var k = r.acheteur || '(non spécifié)'; (tousParAcheteur[k] = tousParAcheteur[k] || []).push(r); });
    var series = tete.map(function (g, i) {
      var cumul = 0, vs = tousParAcheteur[g.cle] || [];
      return { nom: g.cle, couleur: AMX.graph.couleurs[i % AMX.graph.couleurs.length], valeurs: liste.map(function (sx) { vs.forEach(function (r) { if (r.t >= sx.debut && r.t <= sx.fin) cumul += r.profit; }); return cumul; }) };
    });
    corps.appendChild(h('h3.resultat-sous-titre', { text: 'Profit cumulé par acheteur — ' + liste.length + ' ' + (gran.cle === 'semaine' ? 'dernières semaines' : gran.cle === 'mois' ? 'derniers mois' : 'derniers trimestres') + (groupes.length > 6 ? ' (6 premiers)' : '') }));
    corps.appendChild(AMX.graph.lignes(series, { etiquettes: liste.map(function (x) { return x.etiquette + (gran.cle === 'semaine' ? '' : ' ' + x.sous.slice(-2)); }), aria: 'Profit cumulé par acheteur' }));
    corps.appendChild(AMX.graph.legende(series));
    this.elAcheteurs.appendChild(corps);
  };

  /* ------------------------------ Tableaux ----------------------------- */
  // Tableau des véhicules ; `surTri` facultatif (sans lui, en-tête non cliquable). opts.sansTotal : pas de pied.
  Resultat.prototype.tableVehicules = function (liste, tri, surTri, opts) {
    opts = opts || {};
    var COLS = colonnesDe(this.source), can = this.estCan(), neuf = this.estNeuf();
    var lignes = trierPar(liste, COLS, tri);
    var tbody = h('tbody');
    lignes.forEach(function (v) {
      var complet = vinLong(v);
      var tdVin = h('td.mono' + (complet ? '.resultat-vin' : ''), { title: complet ? 'NIV ' + complet + ' — cliquer pour copier' : null, text: vinCourt(v) || '—' });
      if (complet) tdVin.addEventListener('click', function () { AMX.copier(complet, 'NIV copié'); });
      if (neuf) {
        var ajTitreN = v.ajustements.length ? v.ajustements.map(function (a) { return (a.libelle || a.statut) + ' : ' + AMX.fmtArgent(a.montant); }).join('\n') : '';
        tbody.appendChild(h('tr' + (v.ajust ? '.resultat-ligne-ajust' : ''), [
          h('td.num', { text: v.date ? AMX.fmtDate(v.date) : '—' }),
          h('td', [h('div', { text: v.ajust ? 'Ajustement — ' + (v.venduA || v.statut) : nomVehicule(v) }), v.ajust ? h('div.mini', { text: v.statut }) : (v.directeur ? h('div.mini', { text: 'dir. ' + v.directeur }) : null)]),
          h('td', [h('span.puce.type-' + (v.ajust ? 'ajust' : (v.type || 'ajust')), { text: v.ajust ? 'Ajust.' : v.typeLibelle })]),
          h('td.mono', { text: v.stock || '—' }),
          tdVin,
          h('td', { text: v.vendeur || '—' }),
          h('td', { text: v.venduA || '—' }),
          h('td.num', { text: v.ajust ? '—' : AMX.fmtArgent(v.prixVenteUS) }),
          h('td.num.' + signeClasse(v.profit), { title: v.profitSource === 'prevu' ? 'Profit prévu (front + F&I) : le réel n\'est pas encore inscrit par la comptabilité' : null }, [AMX.fmtArgent(v.profit), v.profitSource === 'prevu' ? h('span.resultat-approx', { text: ' prévu' }) : null, v.ajustements.length ? h('div.resultat-ajust', { title: ajTitreN, text: v.ajustements.length + ' ajust. (' + AMX.fmtArgent(v.ajustements.reduce(function (s, a) { return s + num(a.montant); }, 0)) + ')' }) : null])
        ]));
        return;
      }
      if (can) {
        var ajTitre = v.ajustements.length ? v.ajustements.map(function (a) { return (a.libelle || a.statut) + ' : ' + AMX.fmtArgent(a.montant); }).join('\n') : '';
        tbody.appendChild(h('tr' + (v.ajust ? '.resultat-ligne-ajust' : ''), [
          h('td.num', { text: v.date ? AMX.fmtDate(v.date) : '—' }),
          h('td', [h('div', { text: v.ajust ? 'Ajustement — ' + (v.venduA || v.provenance || v.statut) : nomVehicule(v) }), v.ajust ? h('div.mini', { text: v.statut }) : (v.provenance ? h('div.mini', { text: 'de ' + v.provenance }) : null)]),
          h('td', [h('span.puce.type-' + (v.ajust ? 'ajust' : (v.type || 'ajust')), { text: v.ajust ? 'Ajust. ' + v.typeLibelle.toLowerCase() : v.typeLibelle })]),
          h('td.mono', { text: v.stock || '—' }),
          tdVin,
          h('td', { text: v.acheteur || '—' }),
          h('td', { text: v.venduA || '—' }),
          h('td.num', { text: v.ajust ? '—' : (v.coutEstime ? '≈ ' : '') + AMX.fmtArgent(v.coutTotal), title: v.coutEstime ? 'Coût estimé : prix de vente − profit réel (le livre n\'a pas le coût)' : null }),
          h('td.num', { text: v.ajust ? '—' : AMX.fmtArgent(v.prixVenteUS) }),
          h('td.num.' + signeClasse(v.profit), { title: v.profitSource === 'prevu' ? 'Profit prévu (front + F&I) : le réel n\'est pas encore inscrit par la comptabilité' : null }, [AMX.fmtArgent(v.profit), v.profitSource === 'prevu' ? h('span.resultat-approx', { text: ' prévu' }) : null, v.ajustements.length ? h('div.resultat-ajust', { title: 'Profit réel inscrit ' + AMX.fmtArgent(v.profitReel !== undefined && v.profitReel !== null ? v.profitReel : v.profit) + '\n' + ajTitre, text: v.ajustements.length + ' ajust. (' + AMX.fmtArgent(v.ajustements.reduce(function (s, a) { return s + num(a.montant); }, 0)) + ')' }) : null]),
          h('td.num', { text: v.ajust ? '—' : fmtPct(marge(v)) })
        ]));
        return;
      }
      tbody.appendChild(h('tr', [
        h('td.num', { title: v.dateApprox ? 'Date approximative (mois de dépôt seulement)' : null }, [AMX.fmtDate(v.date), v.dateApprox ? h('span.resultat-approx', { text: '≈' }) : null]),
        h('td', [h('div', { text: nomVehicule(v) }), v.provenance ? h('div.mini', { text: v.provenance }) : null]),
        h('td.mono', { text: v.stock || '—' }),
        tdVin,
        h('td', [v.compagnie ? h('span.puce', { text: v.compagnie }) : '—']),
        h('td', { text: v.acheteur || '—', title: v.courrielAcheteur || null }),
        h('td.num', { text: AMX.fmtArgent(v.coutTotal) }),
        h('td.num', { text: AMX.fmtArgent(v.prixVenteUS) }),
        h('td.num.' + signeClasse(v.profit), { text: AMX.fmtArgent(v.profit) }),
        h('td.num', { text: fmtPct(marge(v)) })
      ]));
    });
    var pied = null;
    if (!opts.sansTotal) {
      var a = agreger(liste);
      pied = h('tfoot', [h('tr', [
        h('td', { colspan: String(COLS.length - 4), text: 'Total — ' + pluriel(a.nb, 'vente') + (a.nbAjust ? ' + ' + pluriel(a.nbAjust, 'ajustement') : '') }),
        h('td.num', { text: AMX.fmtArgent(a.coutTotal) }),
        h('td.num', { text: AMX.fmtArgent(a.venteTotal) }),
        h('td.num.' + signeClasse(a.profitTotal), { text: AMX.fmtArgent(a.profitTotal) }),
        h('td.num', { text: a.coutTotal > 0 ? fmtPct(a.marge) : '—' })
      ])]);
    }
    return h('div.resultat-defilant', [h('table.tableau.resultat-tv', [entete(COLS, tri, surTri), tbody, pied])]);
  };

  // Tableau des groupes ; une ligne cliquée déplie les véhicules du groupe.
  Resultat.prototype.tableGroupes = function (groupes, reg) {
    var self = this;
    var colonnes = [
      { cle: 'cle', libelle: reg.colonne },
      { cle: 'nb', libelle: 'Ventes', num: true },
      { cle: 'profitTotal', libelle: 'Profit total', num: true },
      this.estNeuf() ? null : { cle: 'marge', libelle: 'Marge moyenne', num: true },
      { cle: 'profitMoyen', libelle: 'Profit moyen', num: true }
    ].filter(Boolean);
    var lignes = trierPar(groupes, colonnes, this.triGroupes);
    var tbody = h('tbody');
    lignes.forEach(function (g) {
      var ouvert = !!self.groupesOuverts[g.cle];
      var tr = h('tr.cliquable' + (ouvert ? '.actif' : ''), { tabindex: '0', 'aria-expanded': ouvert ? 'true' : 'false' }, [
        h('td', [h('span.resultat-chevron', { html: I.chevron }), h('b', { text: g.cle })]),
        h('td.num', { text: String(g.nb) }),
        h('td.num.' + signeClasse(g.profitTotal), { text: AMX.fmtArgent(g.profitTotal) }),
        self.estNeuf() ? null : h('td.num', { text: g.coutTotal > 0 ? fmtPct(g.marge) : '—' }),
        h('td.num', { text: AMX.fmtArgent(g.profitMoyen) })
      ].filter(Boolean));
      var basculer = function () {
        if (self.groupesOuverts[g.cle]) delete self.groupesOuverts[g.cle]; else self.groupesOuverts[g.cle] = true;
        self.rendreVentilation();
      };
      tr.addEventListener('click', basculer);
      tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); basculer(); } });
      tbody.appendChild(tr);
      if (ouvert) {
        tbody.appendChild(h('tr.resultat-sous', [h('td', { colspan: String(colonnes.length) }, [
          self.tableVehicules(g.vehicules, { cle: 'profit', desc: true }, null, { sansTotal: true })
        ])]));
      }
    });
    return h('div.resultat-defilant', [h('table.tableau.resultat-tg', [
      entete(colonnes, this.triGroupes, function (c) { changerTri(self.triGroupes, c); self.rendreVentilation(); }),
      tbody
    ])]);
  };

  /* ------------------------------- Export ------------------------------ */
  // Exporte la liste affichée (période ouverte, tri courant) en Excel.
  Resultat.prototype.exporter = function () {
    var p = this.periode === 'perso' && this.fenetrePerso ? { cle: 'periode', libelle: this.fenetrePerso.libelle } : trouver(PERIODES, this.periode);
    var f = p ? (p.cle === 'periode' ? this.fenetreListe(this.fenetrePerso) : this.fenetres[p.cle]) : null;
    var liste = f ? trierPar(f.vehicules, colonnesDe(this.source), this.triVehicules) : [];
    if (!liste.length) { AMX.toast('Aucune vente à exporter.', 'attention'); return; }
    if (typeof XLSX === 'undefined') { AMX.toast('La bibliothèque Excel n\'est pas encore chargée. Réessayez.', 'erreur'); return; }
    var can = this.estCan(), neuf = this.estNeuf();
    var rows = liste.map(function (v) {
      var m = marge(v);
      if (neuf) {
        return {
          'Date de vente': v.date ? AMX.fmtDate(v.date) : '', 'Type': v.ajust ? 'Ajustement' : v.typeLibelle, 'Statut du livre': v.statut,
          'Marque': v.marque, 'Modèle': v.modele, 'Année': v.annee, 'Stock #': v.stock, 'NIV': vinLong(v),
          'Client': v.venduA, 'Conseiller': v.vendeur, 'Directeur commercial': v.directeur, 'Compagnie': v.compagnie,
          'Prix de vente ($ CA)': v.ajust ? '' : v.prixVenteUS,
          'Source du profit': v.profitSource === 'prevu' ? 'prévu (front + F&I)' : 'réel (front + F&I)',
          'Ajustements': v.ajustements.length ? v.ajustements.map(function (a) { return (a.libelle || a.statut) + ' ' + AMX.fmtArgent(a.montant); }).join(' ; ') : '',
          'Profit (front + F&I)': v.profit,
          'Comptabilisé le': v.dateCompta ? AMX.fmtDate(v.dateCompta) : ''
        };
      }
      if (can) {
        return {
          'Date de vente': v.date ? AMX.fmtDate(v.date) : '', 'Type': v.ajust ? 'Ajustement ' + v.typeLibelle.toLowerCase() : v.typeLibelle, 'Statut du livre': v.statut,
          'Marque': v.marque, 'Modèle': v.modele, 'Année': v.annee, 'Stock #': v.stock, 'NIV': vinLong(v),
          'Acheté de': v.provenance, 'Vendu à': v.venduA, 'Acheteur': v.acheteur, 'Vendeur': v.vendeur,
          'Coût total': v.ajust ? '' : v.coutTotal, 'Prix de vente ($ CA)': v.ajust ? '' : v.prixVenteUS,
          'Profit réel inscrit': (v.profitReel === null || v.profitReel === undefined) ? v.profit : v.profitReel,
          'Source du profit': v.profitSource === 'prevu' ? 'prévu (front + F&I)' : 'réel',
          'Ajustements': v.ajustements.length ? v.ajustements.map(function (a) { return (a.libelle || a.statut) + ' ' + AMX.fmtArgent(a.montant); }).join(' ; ') : '',
          'Profit': v.profit, 'Marge (%)': v.ajust || isNaN(m) ? '' : Math.round(m * 1000) / 10,
          'Comptabilisé le': v.dateCompta ? AMX.fmtDate(v.dateCompta) : ''
        };
      }
      return {
        'Date': AMX.fmtDate(v.date), 'Date approximative': v.dateApprox ? 'oui' : '',
        'Marque': v.marque, 'Modèle': v.modele, 'Année': v.annee, 'Stock #': v.stock, 'NIV': vinLong(v),
        'Compagnie': v.compagnie, 'Provenance': v.provenance, 'Acheteur': v.acheteur,
        'Coût total': v.coutTotal, 'Prix de vente US': v.prixVenteUS, 'Profit': v.profit,
        'Marge (%)': isNaN(m) ? '' : Math.round(m * 1000) / 10
      };
    });
    var ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = can
      ? [{ wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 16 }, { wch: 7 }, { wch: 9 }, { wch: 19 }, { wch: 16 }, { wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 30 }, { wch: 10 }, { wch: 9 }, { wch: 13 }]
      : [{ wch: 11 }, { wch: 9 }, { wch: 12 }, { wch: 18 }, { wch: 7 }, { wch: 10 }, { wch: 19 }, { wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 10 }, { wch: 10 }];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, can ? 'Wholesale Canada' : 'Résultat');
    XLSX.writeFile(wb, (neuf ? 'vehicules-neufs-' : (can ? 'wholesale-canada-' : 'resultat-')) + p.cle + '-' + (can ? this.type : this.compagnie.toLowerCase()) + '-' + new Date().toISOString().slice(0, 10) + '.xlsx');
    AMX.toast('Export Excel — ' + pluriel(liste.length, 'ligne') + ' (' + p.libelle + ')', 'ok');
  };
})();
