/* =========================================================================
   Section « Résultat » : remplace resultat.html (administrateurs seulement).
   Profit par période, calculé côté client à partir des registres de ventes
   (Ste-Marie et Hawkesbury). Aucun graphique : des cartes KPI, la liste des
   véhicules de la période choisie, puis la ventilation de l'année en cours.

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
  var COMPAGNIES = [['TOUT', 'Toutes'], ['STM', 'STM'], ['HAWKS', 'HAWKS']];

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
      '@media (max-width: 860px) { .resultat-page .entete-page .actions { width: 100%; justify-content: space-between; } }'
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
      annee: new Date(y, 0, 1).getTime()
    };
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
    if (!trouver(COMPAGNIES.map(function (c) { return { cle: c[0] }; }), this.compagnie)) this.compagnie = 'TOUT';
    this.periode = null;         // cle de la période ouverte (liste des véhicules)
    this.regroupement = AMX.memo.lire('resultat_regroupement', 'marque');
    if (!trouver(REGROUPEMENTS, this.regroupement)) this.regroupement = 'marque';
    this.triVehicules = { cle: 'profit', desc: true };
    this.triGroupes = { cle: 'profitTotal', desc: true };
    this.groupesOuverts = {};

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
    COMPAGNIES.forEach(function (c) {
      var b = h('button', { type: 'button', text: c[1], onclick: function () { self.changerCompagnie(c[0]); } });
      self.btnsCie[c[0]] = b;
      self.elSegment.appendChild(b);
    });
    this.btnRafraichir = h('button.btn', { type: 'button', html: I.rafraichir + '<span>Rafraîchir</span>', onclick: function () { self.charger(true); } });
    this.elActions = h('div.actions', [this.elSegment, this.btnRafraichir]);

    this.elVide = h('div');
    this.elKpis = h('div.kpis');
    this.elNote = h('p.resultat-note.doux.petit.cache');
    this.elDetail = h('div.carte.resultat-detail.cache');
    this.elVentilation = h('div.carte.resultat-ventilation.cache');

    this.elPage = h('div.page.etroite.resultat-page', [
      h('div.entete-page', [h('div', { style: { minWidth: 0 } }, [h('h1', 'Résultat'), this.elEtat]), this.elActions]),
      this.elVide, this.elKpis, this.elNote, this.elDetail, this.elVentilation
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
    this.rendre();
  };

  /* -------------------------------- Rendu ------------------------------ */
  Resultat.prototype.rendre = function () {
    this.rendreEntete();
    this.rendreVide();
    this.rendreKpis();
    this.rendreNote();
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
        self.rendreKpis();
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
    var p = trouver(PERIODES, this.periode);
    if (!p || !this.lignes || this.refus) { this.elDetail.classList.add('cache'); return; }
    this.elDetail.classList.remove('cache');
    var f = this.fenetres[p.cle] || agreger([]);

    var sous = f.nb
      ? pluriel(f.nb, 'vente') + ' · profit moyen ' + AMX.fmtArgent(f.profitMoyen) + ' · marge ' + (f.coutTotal > 0 ? fmtPct(f.marge) : '—') + (this.compagnie !== 'TOUT' ? ' · ' + this.compagnie : '')
      : 'aucune vente dans cette fenêtre' + (this.compagnie !== 'TOUT' ? ' pour ' + this.compagnie : '');
    var titre = h('h2', [p.libelle, p.approx ? h('span.resultat-approx', { text: '≈', title: TEXTE_APPROX }) : null, h('span.sous', { text: sous })]);
    var btnExport = h('button.btn.petit', { type: 'button', html: I.telecharger + '<span>Exporter Excel</span>', disabled: !f.nb, onclick: function () { self.exporter(); } });
    var btnFermer = h('button.btn.petit.icone.fantome', { type: 'button', 'aria-label': 'Fermer la liste', title: 'Fermer', html: I.fermer, onclick: function () { self.periode = null; self.rendreKpis(); self.rendreDetail(); } });
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
    var p = trouver(PERIODES, this.periode);
    var f = p ? this.fenetres[p.cle] : null;
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
