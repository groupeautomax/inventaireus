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
   ========================================================================= */
(function () {
  'use strict';
  var h = AMX.h, I = AMX.icones;

  var SEUIL_ERREUR = 8000;   // |profit| au-delà : erreur de saisie, exclu
  // Calculé au rendu (pas au chargement) : la liste visible dépend du compte (portée, 6 oct.).
  function COMPAGNIES_() { return [['TOUT', 'Toutes']].concat(Object.keys(AMX.compagniesPour('resultats')).map(function (c) { return [c, c]; })); }

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

  function injecterCss() {
    if (document.getElementById('css-resultat')) return;
    var s = document.createElement('style');
    s.id = 'css-resultat';
    s.textContent = [
      '.resultat-page .carte { margin-bottom: 14px; overflow: hidden; }',
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
  function normaliser(rows) {
    var gardees = [], exclues = 0;
    (rows || []).forEach(function (r) {
      if (!r) return;
      var profit = num(r.profit);
      if (Math.abs(profit) > SEUIL_ERREUR) { exclues++; return; }
      var d = r.date ? new Date(r.date) : null;
      gardees.push({
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
    var nb = liste.length, profit = 0, cout = 0, vente = 0, approx = 0;
    liste.forEach(function (r) { profit += r.profit; cout += r.coutTotal; vente += r.prixVenteUS; if (r.dateApprox) approx++; });
    return {
      nb: nb, profitTotal: profit, coutTotal: cout, venteTotal: vente, nbApprox: approx,
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
    visible: function () { return AMX.estAdmin(); },
    monter: function (conteneur, ctx) { return new Resultat(conteneur, ctx); }
  });

  function Resultat(conteneur) {
    injecterCss();
    this.conteneur = conteneur;
    this.lignes = null;          // lignes normalisées (null tant que rien n'est chargé)
    this.exclues = 0;            // lignes écartées (|profit| > seuil)
    this.quand = null;           // heure du dernier chargement réussi
    this.fenetres = {};          // cle de période → agrégat (recalculé à chaque rendu des KPI)
    this.erreur = ''; this.refus = '';
    this.enChargement = false; this.generation = 0; this.detruit = false;

    this.compagnie = AMX.memo.lire('resultat_cie', 'TOUT');
    if (!trouver(COMPAGNIES_().map(function (c) { return { cle: c[0] }; }), this.compagnie)) this.compagnie = 'TOUT';
    this.periode = null;         // cle de la période ouverte (liste des véhicules)
    this.regroupement = AMX.memo.lire('resultat_regroupement', 'marque');
    if (!trouver(REGROUPEMENTS, this.regroupement)) this.regroupement = 'marque';
    this.triVehicules = { cle: 'profit', desc: true };
    this.triGroupes = { cle: 'profitTotal', desc: true };
    this.groupesOuverts = {};
    this.fenetrePerso = null;    // { debut, fin, libelle, approx } quand la liste vient d'une barre ou d'un acheteur
    this.granularite = AMX.memo.lire('resultat_granularite', 'mois');
    if (!trouver(GRANULARITES, this.granularite)) this.granularite = 'mois';
    this.horizon = parseInt(AMX.memo.lire('resultat_horizon_' + this.granularite, ''), 10) || trouver(GRANULARITES, this.granularite).horizons[1][0];
    this.fenetreAcheteurs = AMX.memo.lire('resultat_acheteurs_fenetre', 'annee');
    if (!trouver(FENETRES_ACHETEURS, this.fenetreAcheteurs)) this.fenetreAcheteurs = 'annee';
    this.mesureAcheteurs = AMX.memo.lire('resultat_acheteurs_mesure', 'profitTotal');
    if (!trouver(MESURES_ACHETEURS, this.mesureAcheteurs)) this.mesureAcheteurs = 'profitTotal';
    this.seauActif = -1; this.acheteurActif = '';
    if (AMX.graph && AMX.graph.css) AMX.graph.css();

    this.construire();
    this.charger(false);
  }

  Resultat.prototype.demonter = function () { this.detruit = true; this.generation++; };

  /* --------------------------- Construction ---------------------------- */
  Resultat.prototype.construire = function () {
    var self = this;
    AMX.vider(this.conteneur);

    this.elEtat = h('p', { text: 'Chargement des registres de ventes…' });
    this.btnsCie = {};
    this.elSegment = h('div.segment', { role: 'group', 'aria-label': 'Compagnie' });
    COMPAGNIES_().forEach(function (c) {
      var b = h('button', { type: 'button', text: c[1], onclick: function () { self.changerCompagnie(c[0]); } });
      self.btnsCie[c[0]] = b;
      self.elSegment.appendChild(b);
    });
    this.btnRafraichir = h('button.btn', { type: 'button', html: I.rafraichir + '<span>Rafraîchir</span>', onclick: function () { self.charger(true); } });
    this.elActions = h('div.actions', [this.elSegment, this.btnRafraichir]);

    this.elVide = h('div');
    this.elKpis = h('div.kpis');
    this.elNote = h('p.resultat-note.doux.petit.cache');
    this.elEvolution = h('div.carte.resultat-evolution.cache');
    this.elAcheteurs = h('div.carte.resultat-acheteurs.cache');
    this.elDetail = h('div.carte.resultat-detail.cache');
    this.elVentilation = h('div.carte.resultat-ventilation.cache');

    this.elPage = h('div.page.etroite.resultat-page', [
      h('div.entete-page', [h('div', { style: { minWidth: 0 } }, [h('h1', 'Résultat'), this.elEtat]), this.elActions]),
      this.elVide, this.elKpis, this.elNote, this.elEvolution, this.elAcheteurs, this.elDetail, this.elVentilation
    ]);
    this.conteneur.appendChild(this.elPage);
  };

  /* ------------------------------ Données ------------------------------ */
  Resultat.prototype.charger = function (manuel) {
    var self = this, gen = ++this.generation;
    this.enChargement = true;
    if (manuel) this.btnRafraichir.classList.add('occupe');
    if (!this.lignes) this.rendre();   // squelettes
    return AMX.get('resultatRaw=1').then(function (d) {
      if (self.detruit || gen !== self.generation) return;
      self.enChargement = false;
      self.btnRafraichir.classList.remove('occupe');
      if (d && d.refuse) {
        self.refus = d.erreur || d.message || 'Les résultats sont réservés aux administrateurs.';
        self.rendre();
        return;
      }
      if (!d || d.ok === false) throw new Error((d && (d.erreur || d.message)) || 'Réponse inattendue du serveur');
      var n = normaliser(d.rows || []);
      self.lignes = n.lignes; self.exclues = n.exclues; self.quand = new Date();
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
    var c = this.compagnie;
    return (this.lignes || []).filter(function (r) { return c === 'TOUT' || r.compagnie === c; });
  };

  Resultat.prototype.changerCompagnie = function (cie) {
    if (cie === this.compagnie) return;
    this.compagnie = cie;
    AMX.memo.ecrire('resultat_cie', cie);
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
    this.rendreEvolution();
    this.rendreAcheteurs();
    this.rendreDetail();
    this.rendreVentilation();
  };

  Resultat.prototype.rendreEntete = function () {
    var self = this;
    Object.keys(this.btnsCie).forEach(function (k) { self.btnsCie[k].classList.toggle('actif', k === self.compagnie); });
    AMX.vider(this.elEtat);
    if (this.refus) { this.elEtat.textContent = 'Accès réservé aux administrateurs.'; this.elActions.classList.add('cache'); return; }
    this.elActions.classList.remove('cache');
    if (!this.lignes) { this.elEtat.textContent = this.erreur ? 'Serveur injoignable.' : 'Chargement des registres de ventes…'; return; }
    var n = this.filtrees().length;
    this.elEtat.appendChild(document.createTextNode(
      pluriel(n, 'vente') + (this.compagnie !== 'TOUT' ? ' · ' + this.compagnie : '') + ' · mis à jour à ' + heure(this.quand)
    ));
    if (this.exclues) {
      this.elEtat.appendChild(h('span.puce.attention', {
        title: pluriel(this.exclues, 'ligne') + ' dont le profit dépasse ' + AMX.fmtArgent(SEUIL_ERREUR) + ' en valeur absolue : erreur de saisie probable, exclue' + (this.exclues > 1 ? 's' : '') + ' des calculs.',
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
    }
  };

  Resultat.prototype.rendreKpis = function () {
    var self = this;
    AMX.vider(this.elKpis);
    var cache = !!this.refus || (!this.lignes && !!this.erreur);
    this.elKpis.classList.toggle('cache', cache);
    if (cache) return;
    if (!this.lignes) {
      PERIODES.forEach(function () { self.elKpis.appendChild(h('div.kpi.neutre.squelette', { 'aria-hidden': 'true' })); });
      return;
    }
    var b = bornes(), lignes = this.filtrees();
    this.fenetres = {};
    PERIODES.forEach(function (p) {
      var f = self.fenetres[p.cle] = fenetre(lignes, p.debut(b), b.fin);
      var actif = self.periode === p.cle;
      var titre = p.libelle + ' : ' + pluriel(f.nb, 'vente') + ', profit moyen ' + AMX.fmtArgent(f.profitMoyen) + '.';
      if (p.approx) titre += '\n≈ ' + TEXTE_APPROX + (f.nbApprox ? ' Ici, ' + f.nbApprox + ' date' + (f.nbApprox > 1 ? 's' : '') + ' sur ' + f.nb + ' ' + (f.nbApprox > 1 ? 'sont approximatives' : 'est approximative') + '.' : '');
      titre += '\nCliquer pour ' + (actif ? 'masquer' : 'voir') + ' la liste des véhicules.';
      var k = h('button.kpi' + (actif ? '.actif' : '') + (p.approx ? '.resultat-kpi-approx' : ''), { type: 'button', title: titre, 'aria-pressed': actif ? 'true' : 'false' }, [
        h('div.valeur.num.' + signeClasse(f.profitTotal), { text: AMX.fmtArgent(f.profitTotal) }),
        h('div.libelle', [p.libelle, p.approx ? h('span.resultat-approx', { text: '≈', 'aria-label': 'approximatif' }) : null]),
        h('div.sous', { text: f.nb ? pluriel(f.nb, 'vente') + ' · marge ' + (f.coutTotal > 0 ? fmtPct(f.marge) : '—') : 'aucune vente' })
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
    this.elNote.appendChild(h('span.resultat-approx', { text: '≈', 'aria-hidden': 'true' }));
    this.elNote.appendChild(document.createTextNode(
      ' Les fenêtres 10 et 30 jours sont approximatives (mois de dépôt, le 15 servant de repère) ; trimestre, semestre et année restent fiables. ' +
      'Marge = profit ÷ coût total. ' +
      (this.exclues ? pluriel(this.exclues, 'vente') + ' dont |profit| dépasse ' + AMX.fmtArgent(SEUIL_ERREUR) + ' ' + (this.exclues > 1 ? 'sont exclues' : 'est exclue') + ' (erreur de saisie probable).' : 'Les ventes dont |profit| dépasse ' + AMX.fmtArgent(SEUIL_ERREUR) + ' seraient exclues comme erreurs de saisie ; aucune aujourd\'hui.')
    ));
  };

  // Liste des véhicules de la période ouverte.
  Resultat.prototype.rendreDetail = function () {
    var self = this;
    AMX.vider(this.elDetail);
    var p = this.periode === 'perso' && this.fenetrePerso ? { cle: 'perso', libelle: this.fenetrePerso.libelle, approx: !!this.fenetrePerso.approx } : trouver(PERIODES, this.periode);
    if (!p || !this.lignes || this.refus) { this.elDetail.classList.add('cache'); return; }
    this.elDetail.classList.remove('cache');
    var f = p.cle === 'perso' ? this.fenetreListe(this.fenetrePerso) : (this.fenetres[p.cle] || agreger([]));

    var sous = f.nb
      ? pluriel(f.nb, 'vente') + ' · profit moyen ' + AMX.fmtArgent(f.profitMoyen) + ' · marge ' + (f.coutTotal > 0 ? fmtPct(f.marge) : '—') + (this.compagnie !== 'TOUT' ? ' · ' + this.compagnie : '')
      : 'aucune vente dans cette fenêtre' + (this.compagnie !== 'TOUT' ? ' pour ' + this.compagnie : '');
    var titre = h('h2', [p.libelle, p.approx ? h('span.resultat-approx', { text: '≈', title: TEXTE_APPROX }) : null, h('span.sous', { text: sous })]);
    var btnExport = h('button.btn.petit', { type: 'button', html: I.telecharger + '<span>Exporter Excel</span>', disabled: !f.nb, onclick: function () { self.exporter(); } });
    var btnFermer = h('button.btn.petit.icone.fantome', { type: 'button', 'aria-label': 'Fermer la liste', title: 'Fermer', html: I.fermer, onclick: function () { self.periode = null; self.fenetrePerso = null; self.seauActif = -1; self.acheteurActif = ''; self.rendreKpis(); self.rendreEvolution(); self.rendreAcheteurs(); self.rendreDetail(); } });
    this.elDetail.appendChild(h('div.carte-entete', [titre, h('div.resultat-actions', [btnExport, btnFermer])]));

    if (!f.vehicules.length) {
      this.elDetail.appendChild(h('div.carte-corps', [h('div.vide', [h('div', { html: I.voiture }), h('h3', 'Aucune vente'), h('div', { text: 'Aucun véhicule vendu dans cette fenêtre' + (this.compagnie !== 'TOUT' ? ' pour ' + this.compagnie : '') + '.' })])]));
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
    var reg = trouver(REGROUPEMENTS, this.regroupement) || REGROUPEMENTS[0];
    var base = reg.requiertMarque ? annee.filter(function (r) { return r.marque; }) : annee;
    var groupes = grouper(base, reg.champ);

    this.elVentilation.appendChild(h('div.carte-entete', [
      h('h2', ['Ventilation', h('span.sous', { text: 'année ' + new Date().getFullYear() + ' · ' + pluriel(base.length, 'vente') + (base.length !== annee.length ? ' avec marque sur ' + annee.length : '') + (this.compagnie !== 'TOUT' ? ' · ' + this.compagnie : '') })]),
      h('span.doux.petit', { text: 'Cliquez une ligne pour voir ses véhicules' })
    ]));

    var onglets = h('div.onglets', { role: 'tablist' });
    REGROUPEMENTS.forEach(function (r) {
      onglets.appendChild(h('button' + (r.cle === reg.cle ? '.actif' : ''), {
        type: 'button', role: 'tab', 'aria-selected': r.cle === reg.cle ? 'true' : 'false', text: r.libelle,
        onclick: function () {
          if (r.cle === self.regroupement) return;
          self.regroupement = r.cle;
          AMX.memo.ecrire('resultat_regroupement', r.cle);
          self.groupesOuverts = {};
          self.rendreVentilation();
        }
      }));
    });
    this.elVentilation.appendChild(h('div.resultat-onglets', [onglets]));

    if (!groupes.length) {
      this.elVentilation.appendChild(h('div.carte-corps', [h('div.vide', [h('div', { html: I.filtre }), h('h3', 'Aucune donnée'), h('div', { text: 'Aucune vente de l\'année en cours pour cette catégorie' + (this.compagnie !== 'TOUT' ? ' (' + this.compagnie + ')' : '') + '.' })])]));
      return;
    }
    this.elVentilation.appendChild(this.tableGroupes(groupes, reg));
  };

  /* ---------------------------- Évolution ------------------------------- */
  // Agrégat d'une fenêtre personnalisée { debut, fin, acheteur? }.
  Resultat.prototype.fenetreListe = function (w) {
    var lignes = this.filtrees().filter(function (r) { return r.t >= w.debut && r.t <= w.fin && (!w.acheteur || (r.acheteur || '(non spécifié)') === w.acheteur); });
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
      var p = 0; dans.forEach(function (r) { p += r.profit; if (r.dateApprox) approx++; });
      total += p; nbTotal += dans.length;
      valeurs.push(p); nb.push(dans.length); cumul.push(total);
    });

    // En-tête : titre + granularité + horizon
    var segment = h('div.segment', { role: 'group', 'aria-label': 'Granularité' }, GRANULARITES.map(function (g) {
      return h('button' + (g.cle === self.granularite ? '.actif' : ''), { type: 'button', text: g.libelle, onclick: function () {
        if (g.cle === self.granularite) return;
        self.granularite = g.cle; AMX.memo.ecrire('resultat_granularite', g.cle);
        self.horizon = parseInt(AMX.memo.lire('resultat_horizon_' + g.cle, ''), 10) || g.horizons[1][0];
        self.seauActif = -1; if (self.periode === 'perso' && self.fenetrePerso && !self.fenetrePerso.acheteur) { self.periode = null; self.fenetrePerso = null; }
        self.rendreEvolution(); self.rendreAcheteurs(); self.rendreDetail();
      } });
    }));
    var selHorizon = h('select.saisie', { 'aria-label': 'Horizon', style: { height: '28px', width: 'auto' } }, gran.horizons.map(function (o) { return h('option', { value: String(o[0]), selected: o[0] === self.horizon ? true : undefined, text: o[1] }); }));
    selHorizon.addEventListener('change', function () { self.horizon = parseInt(selHorizon.value, 10); AMX.memo.ecrire('resultat_horizon_' + self.granularite, String(self.horizon)); self.seauActif = -1; self.rendreEvolution(); self.rendreAcheteurs(); });
    this.elEvolution.appendChild(h('div.carte-entete', [
      h('h2', ['Évolution du profit', h('span.sous', { text: pluriel(nbTotal, 'vente') + ' · ' + AMX.fmtArgent(total) + ' sur ' + trouver(gran.horizons.map(function (o) { return { cle: o[0], libelle: o[1] }; }), this.horizon).libelle + (this.compagnie !== 'TOUT' ? ' · ' + this.compagnie : '') })]),
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
        self.ouvrirPerso({ debut: sx.debut, fin: sx.fin, libelle: sx.long, approx: gran.approx });
      }
    }));
    corps.appendChild(h('div.graph-legende', [
      h('span.graph-legende-item', [h('i', { style: { background: 'var(--vert)' } }), 'Profit de la période (rouge si perte)']),
      h('span.graph-legende-item', [h('i', { style: { background: 'var(--bleu)', borderRadius: '50%' } }), 'Profit cumulé depuis le début de la fenêtre (axe de droite)']),
      h('span.doux', { text: 'Cliquez une barre pour voir ses véhicules.' })
    ]));
    if (gran.approx && approx) corps.appendChild(h('p.resultat-note.doux.petit', { style: { margin: '10px 0 0' } }, [h('span.resultat-approx', { text: '≈' }), ' ' + approx + ' des ' + nbTotal + ' ventes affichées n\'ont que le mois de dépôt (placées au 15) : la répartition par semaine est approximative, le total par mois reste juste.']));
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
    var groupes = grouper(lignes, 'acheteur').sort(function (x, y) { return y[mesure.cle] - x[mesure.cle]; });

    var segFen = h('div.segment', { role: 'group', 'aria-label': 'Fenêtre' }, FENETRES_ACHETEURS.map(function (f) {
      return h('button' + (f.cle === self.fenetreAcheteurs ? '.actif' : ''), { type: 'button', text: f.libelle, onclick: function () { if (f.cle === self.fenetreAcheteurs) return; self.fenetreAcheteurs = f.cle; AMX.memo.ecrire('resultat_acheteurs_fenetre', f.cle); self.acheteurActif = ''; self.rendreAcheteurs(); } });
    }));
    var selMesure = h('select.saisie', { 'aria-label': 'Mesure', style: { height: '28px', width: 'auto' } }, MESURES_ACHETEURS.map(function (m) { return h('option', { value: m.cle, selected: m.cle === self.mesureAcheteurs ? true : undefined, text: m.libelle }); }));
    selMesure.addEventListener('change', function () { self.mesureAcheteurs = selMesure.value; AMX.memo.ecrire('resultat_acheteurs_mesure', selMesure.value); self.rendreAcheteurs(); });
    var total = 0; groupes.forEach(function (g) { total += g.profitTotal; });
    this.elAcheteurs.appendChild(h('div.carte-entete', [
      h('h2', ['Par acheteur', h('span.sous', { text: fen.libelle.toLowerCase() + ' · ' + pluriel(lignes.length, 'vente') + ' · ' + AMX.fmtArgent(total) + (this.compagnie !== 'TOUT' ? ' · ' + this.compagnie : '') })]),
      h('div.resultat-actions', [segFen, selMesure])
    ]));
    var corps = h('div.carte-corps');
    if (!groupes.length) {
      corps.appendChild(h('div.vide', [h('div', { html: I.filtre }), h('h3', 'Aucune vente'), h('div', { text: 'Aucune vente dans cette fenêtre' + (this.compagnie !== 'TOUT' ? ' pour ' + this.compagnie : '') + '.' })]));
      this.elAcheteurs.appendChild(corps); return;
    }
    var actifIdx = -1;
    var items = groupes.map(function (g, i) {
      if (g.cle === self.acheteurActif) actifIdx = i;
      return { nom: g.cle, valeur: g[mesure.cle], sous: mesure.cle === 'nb' ? AMX.fmtArgent(g.profitTotal, 0) : (pluriel(g.nb, 'vente') + ' · marge ' + (g.coutTotal > 0 ? fmtPct(g.marge) : '—')), couleur: AMX.graph.couleurs[i % AMX.graph.couleurs.length] };
    });
    corps.appendChild(h('div.resultat-graph-acheteurs', [AMX.graph.horizontal(items, {
      libelle: mesure.libelle, format: mesure.format, actif: actifIdx, aria: mesure.libelle + ' par acheteur',
      surClic: function (i) {
        var g = groupes[i];
        if (self.acheteurActif === g.cle) { self.acheteurActif = ''; self.periode = null; self.fenetrePerso = null; self.rendreKpis(); self.rendreEvolution(); self.rendreAcheteurs(); self.rendreDetail(); return; }
        self.acheteurActif = g.cle; self.seauActif = -1;
        self.ouvrirPerso({ debut: debut, fin: b.fin, acheteur: g.cle, libelle: g.cle + ' — ' + fen.libelle.toLowerCase(), approx: false });
      }
    })]));
    corps.appendChild(h('p.doux.petit', { style: { margin: '6px 0 0' }, text: 'Cliquez un acheteur pour voir ses véhicules. Les ventes sans acheteur inscrit au registre sont regroupées sous « (non spécifié) ».' }));

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
    var lignes = trierPar(liste, COL_VEHICULES, tri);
    var tbody = h('tbody');
    lignes.forEach(function (v) {
      var complet = vinLong(v);
      var tdVin = h('td.mono' + (complet ? '.resultat-vin' : ''), { title: complet ? 'NIV ' + complet + ' — cliquer pour copier' : null, text: vinCourt(v) || '—' });
      if (complet) tdVin.addEventListener('click', function () { AMX.copier(complet, 'NIV copié'); });
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
        h('td', { colspan: '6', text: 'Total — ' + pluriel(a.nb, 'vente') }),
        h('td.num', { text: AMX.fmtArgent(a.coutTotal) }),
        h('td.num', { text: AMX.fmtArgent(a.venteTotal) }),
        h('td.num.' + signeClasse(a.profitTotal), { text: AMX.fmtArgent(a.profitTotal) }),
        h('td.num', { text: a.coutTotal > 0 ? fmtPct(a.marge) : '—' })
      ])]);
    }
    return h('div.resultat-defilant', [h('table.tableau.resultat-tv', [entete(COL_VEHICULES, tri, surTri), tbody, pied])]);
  };

  // Tableau des groupes ; une ligne cliquée déplie les véhicules du groupe.
  Resultat.prototype.tableGroupes = function (groupes, reg) {
    var self = this;
    var colonnes = [
      { cle: 'cle', libelle: reg.colonne },
      { cle: 'nb', libelle: 'Ventes', num: true },
      { cle: 'profitTotal', libelle: 'Profit total', num: true },
      { cle: 'marge', libelle: 'Marge moyenne', num: true },
      { cle: 'profitMoyen', libelle: 'Profit moyen', num: true }
    ];
    var lignes = trierPar(groupes, colonnes, this.triGroupes);
    var tbody = h('tbody');
    lignes.forEach(function (g) {
      var ouvert = !!self.groupesOuverts[g.cle];
      var tr = h('tr.cliquable' + (ouvert ? '.actif' : ''), { tabindex: '0', 'aria-expanded': ouvert ? 'true' : 'false' }, [
        h('td', [h('span.resultat-chevron', { html: I.chevron }), h('b', { text: g.cle })]),
        h('td.num', { text: String(g.nb) }),
        h('td.num.' + signeClasse(g.profitTotal), { text: AMX.fmtArgent(g.profitTotal) }),
        h('td.num', { text: g.coutTotal > 0 ? fmtPct(g.marge) : '—' }),
        h('td.num', { text: AMX.fmtArgent(g.profitMoyen) })
      ]);
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
    var liste = f ? trierPar(f.vehicules, COL_VEHICULES, this.triVehicules) : [];
    if (!liste.length) { AMX.toast('Aucune vente à exporter.', 'attention'); return; }
    if (typeof XLSX === 'undefined') { AMX.toast('La bibliothèque Excel n\'est pas encore chargée. Réessayez.', 'erreur'); return; }
    var rows = liste.map(function (v) {
      var m = marge(v);
      return {
        'Date': AMX.fmtDate(v.date), 'Date approximative': v.dateApprox ? 'oui' : '',
        'Marque': v.marque, 'Modèle': v.modele, 'Année': v.annee, 'Stock #': v.stock, 'NIV': vinLong(v),
        'Compagnie': v.compagnie, 'Provenance': v.provenance, 'Acheteur': v.acheteur,
        'Coût total': v.coutTotal, 'Prix de vente US': v.prixVenteUS, 'Profit': v.profit,
        'Marge (%)': isNaN(m) ? '' : Math.round(m * 1000) / 10
      };
    });
    var ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 11 }, { wch: 9 }, { wch: 12 }, { wch: 18 }, { wch: 7 }, { wch: 10 }, { wch: 19 }, { wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 10 }, { wch: 10 }];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Résultat');
    XLSX.writeFile(wb, 'resultat-' + p.cle + '-' + this.compagnie.toLowerCase() + '-' + new Date().toISOString().slice(0, 10) + '.xlsx');
    AMX.toast('Export Excel — ' + pluriel(liste.length, 'ligne') + ' (' + p.libelle + ')', 'ok');
  };
})();
