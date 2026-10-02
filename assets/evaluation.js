/* =========================================================================
   Outils › Évaluation marché — la fiche d'évaluation (refaite le 2 oct.).

   Modèle : l'« Analyse de marché » de Torque, mais à partir de nos propres
   sources. Les données viennent du serveur (Marche.gs → MarketCheck) :
     GET ?marche=1&annee=&marque=&modele=&version=&km=&pays=ca|us&concession=&vin=
       → { ok, pays, devise, lieu, rayonKm, actifs: { n, annonces[], prix, km, jours },
            vendus: { n90, parMois, prix, km, jours, portee }, versionElargie,
            ventesElargies, avertissements[], genereLe }
       ou { ok: false, sansCle: true, erreur } quand la clé MarketCheck manque
       (un administrateur la pose dans Admin › Données de marché).
     GET  ?evalVin=VIN                               → { trouve, donnees, dateMaj }
     POST { action: 'saveEvaluation', vin, data }    → { dateMaj }
     Externe : NHTSA vPIC pour décoder le NIV (marque / modèle / année / version).

   Ce que la page calcule elle-même (tout est recalculé quand on change le km,
   le taux ou le prix visé — pas d'appel serveur) :
     - prix ajusté de chaque annonce = prix − (km véhicule − km annonce) × taux ;
     - Prix agressif / standard / conservateur = 25e centile / médiane / 75e
       centile des prix ajustés (repli : −7 % / médiane / +4 % des stats) ;
     - Marché % = prix visé ÷ prix moyen des annonces actives ;
     - Rang = position du prix visé parmi les annonces (1 = le moins cher).
   La table des comparables insère la ligne « Votre véhicule » à son rang.

   Les comparables saisis à la main (ancienne fiche) restent disponibles plus
   bas et peuvent être remplis d'un clic à partir des annonces retenues ; les
   évaluations déjà enregistrées se rechargent telles quelles.
   ========================================================================= */
(function () {
  'use strict';
  var h = AMX.h, I = AMX.icones;

  var URL_NHTSA = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVINValuesBatch/';
  var SITES = [
    { nom: 'Kijiji Autos', url: 'https://www.kijijiautos.ca/' },
    { nom: 'AutoHebdo', url: 'https://www.autohebdo.net/' },
    { nom: 'CarGurus', url: 'https://www.cargurus.ca/' },
    { nom: 'Clutch', url: 'https://www.clutch.ca/' }
  ];
  var URL_TORQUE = 'https://dealer.torquemanagement.ca/vehicle-management/evaluations/list';
  var URL_CARFAX_COMPTE = 'https://dealer.carfax.ca/';
  var TOLERANCE_KM = 30000;

  /* ------------------------------ Helpers ------------------------------ */
  function fmt(n) { return (n === null || n === undefined || isNaN(n)) ? '—' : AMX.fmtArgent(n, 0); }
  function fmtKm(n) { return (n === null || n === undefined || isNaN(n)) ? '—' : AMX.fmtNombre(Math.round(n)) + ' km'; }
  function fmtJ(n) { return (n === null || n === undefined || isNaN(n)) ? '—' : Math.round(n) + ' j'; }
  function pct(n) { return (n === null || n === undefined || isNaN(n)) ? '—' : Math.round(n * 100) + ' %'; }
  function asc(a, b) { return a - b; }
  function nombre(v) { var n = parseFloat(String(v === undefined || v === null ? '' : v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? null : n; }
  function mediane(t) { var n = t.length, m = Math.floor(n / 2); return n ? (n % 2 === 0 ? (t[m - 1] + t[m]) / 2 : t[m]) : null; }
  function centile(t, p) { if (!t.length) return null; var i = (t.length - 1) * p, b = Math.floor(i), r = i - b; return t[b + 1] !== undefined ? t[b] + r * (t[b + 1] - t[b]) : t[b]; }
  function moyenne(t) { return t.length ? t.reduce(function (a, b) { return a + b; }, 0) / t.length : null; }
  function arrondi50(n) { return n === null ? null : Math.round(n / 50) * 50; }
  function carte(titre, enfants, actions, cls) {
    var entete = typeof titre === 'string' ? h('h2', { text: titre }) : titre;
    return h('div.carte' + (cls ? '.' + cls : ''), [h('div.carte-entete', [entete, actions || null]), h('div.carte-corps', enfants)]);
  }
  function champ(id, libelle, opts) {
    opts = opts || {};
    var attrs = { type: opts.type || 'text', id: id, step: opts.step, placeholder: opts.placeholder, value: opts.value, autocomplete: 'off' };
    if (opts.type === 'number') attrs.inputmode = opts.inputmode || 'decimal';
    if (opts.vin) { attrs.spellcheck = 'false'; attrs.autocapitalize = 'characters'; }
    var inp = h('input' + (opts.mono ? '.mono' : ''), attrs);
    return { el: h('div.champ', [h('label', { 'for': id, text: libelle }), inp]), input: inp };
  }
  function lienMarketGuide(vin) { return 'https://app.eblock.com/my-market-guide?soldWithinDays=90&vin=' + encodeURIComponent(vin); }

  // NHTSA : marque / modèle / année / version (null si rien ou injoignable).
  function decoderVin(vin) {
    var corps = new URLSearchParams(); corps.append('format', 'json'); corps.append('data', vin);
    return fetch(URL_NHTSA, { method: 'POST', body: corps })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var r = (d && d.Results || [])[0];
        if (!r) return null;
        return { make: r.Make || '', model: r.Model || '', year: r.ModelYear || '', trim: r.Trim || r.Series || '' };
      })
      .catch(function () { return null; });
  }

  function injecterCss() {
    if (document.getElementById('css-evaluation')) return;
    var s = document.createElement('style');
    s.id = 'css-evaluation';
    s.textContent = [
      '.eval-page .carte { margin-bottom: 14px; }',
      '.eval-page .carte-entete .titre { min-width: 0; }',
      '.eval-page .carte-entete .titre p { margin: 2px 0 0; font-size: 12px; color: var(--encre-3); }',
      '.eval-page .carte-entete .droite { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }',
      '.eval-pile { display: flex; flex-direction: column; gap: 12px; }',
      '.eval-note { margin: 0; font-size: 11.5px; color: var(--encre-3); line-height: 1.5; }',
      '.eval-contexte { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--ligne); font-size: 12.5px; color: var(--encre-2); }',
      '.eval-contexte .modele { font-weight: 600; color: var(--encre); }',
      '.eval-liens { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--ligne); }',
      '.eval-liens .sep { color: var(--encre-4); font-size: 11.5px; margin-left: 4px; }',
      '.eval-liens a.btn.desactive { opacity: .55; pointer-events: none; }',
      '.eval-resume { margin-bottom: 12px; }',
      '.eval-prix { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-bottom: 12px; }',
      '.eval-prix .bloc { border: 1px solid var(--ligne); border-radius: var(--rayon-s); padding: 12px 14px; background: var(--carte-2); }',
      '.eval-prix .bloc .l { font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--encre-3); font-weight: 700; }',
      '.eval-prix .bloc .v { font-size: 22px; font-weight: 700; margin-top: 4px; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }',
      '.eval-prix .bloc .s { font-size: 11.5px; color: var(--encre-3); margin-top: 2px; }',
      '.eval-prix .bloc.agressif { box-shadow: inset 4px 0 0 var(--rouge); }',
      '.eval-prix .bloc.standard { box-shadow: inset 4px 0 0 var(--vert); background: var(--vert-clair); }',
      '.eval-prix .bloc.conservateur { box-shadow: inset 4px 0 0 var(--bleu); }',
      '.eval-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 12px; }',
      '.eval-stat { border: 1px solid var(--ligne); border-radius: var(--rayon-s); padding: 12px 14px; }',
      '.eval-stat h3 { font-size: 13px; margin: 0 0 8px; }',
      '.eval-stat h3 .n { font-size: 20px; font-weight: 700; margin-right: 6px; font-variant-numeric: tabular-nums; }',
      '.eval-stat .grille-mini { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }',
      '.eval-stat .grille-mini .l { font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--encre-3); font-weight: 600; }',
      '.eval-stat .grille-mini .v { font-size: 13.5px; font-weight: 600; font-variant-numeric: tabular-nums; margin-top: 1px; }',
      '.eval-stat .grille-mini .m { font-size: 11px; color: var(--encre-4); font-variant-numeric: tabular-nums; }',
      '.eval-stat p.eval-note { margin-top: 8px; }',
      '.eval-filtres { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; font-size: 12.5px; }',
      '.eval-filtres .case { display: inline-flex; align-items: center; gap: 6px; }',
      '.eval-filtres .espace { flex: 1; }',
      '.eval-table { overflow-x: auto; }',
      '.eval-table .tableau { min-width: 900px; }',
      '.eval-table td, .eval-table th { padding: 7px 10px; }',
      '.eval-table tr.eval-moi td { background: var(--vert-clair); font-weight: 600; box-shadow: inset 3px 0 0 var(--vert); }',
      '.eval-table td.sous .mini { display: block; }',
      '.eval-table .sup { color: var(--rouge); } .eval-table .inf { color: var(--vert); }',
      '.eval-pied { display: flex; gap: 8px 14px; flex-wrap: wrap; align-items: center; margin-top: 10px; font-size: 11.5px; color: var(--encre-3); }',
      '.eval-attente { padding: 26px 16px; text-align: center; color: var(--encre-3); font-size: 13px; border: 1px dashed var(--ligne-forte); border-radius: var(--rayon-s); }',
      '.eval-attente .btn { margin-top: 10px; }',
      '.eval-sites { display: flex; gap: 6px; flex-wrap: wrap; }',
      '.eval-comparables { overflow-x: auto; }',
      '.eval-comparables .tableau { min-width: 460px; }',
      '.eval-comparables td { padding: 6px 8px; }',
      '.eval-comparables td input.saisie { height: 30px; }',
      '.eval-comparables .col-prix, .eval-comparables .col-km { width: 140px; }',
      '.eval-comparables .col-x { width: 44px; }',
      '.eval-page .resume-sombre.eval-ajuste { box-shadow: inset 4px 0 0 var(--vert-vif); }',
      '.eval-page .resume-sombre .v.indice { font-size: 12.5px; font-weight: 500; opacity: .75; margin-top: 6px; }',
      '@media (max-width: 900px) {',
      '  .eval-prix, .eval-stats { grid-template-columns: 1fr; }',
      '  .eval-page .grille.c4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }',
      '  .eval-page .carte-entete { flex-wrap: wrap; }',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ============================== Vue ================================== */
  function Evaluation(ctx) {
    var self = this;
    injecterCss();
    this.vinCourant = '';
    this.vinCharge = '';
    this.generation = 0;
    this.compteur = 0;
    this.pays = AMX.memo.lire('eval_pays', 'ca') === 'us' ? 'us' : 'ca';
    this.analyses = { ca: null, us: null };   // réponses du serveur par pays
    this.enCours = { ca: false, us: false };
    this.genAnalyse = { ca: 0, us: 0 };       // une analyse plus récente (ou un autre NIV) rend la réponse caduque
    this.filtres = { memeVersion: false, kmProche: false, tri: 'prix' };
    this.derniereSauvegarde = null;           // bloc `marche` d'une évaluation rechargée

    this.construire();
    this.recalculer();
    this.rendreMarche();

    this.surInventaire = function () { self.rendreContexte(); };
    document.addEventListener('amx:inventaire', this.surInventaire);
    this.surCarfax = function () { self.rendreLiens(); };
    document.addEventListener('amx:carfax', this.surCarfax);
    if (AMX.carfax && AMX.carfax.charger) AMX.carfax.charger().catch(function () {});

    var vin = (ctx && ctx.params && ctx.params.vin) ? String(ctx.params.vin).trim() : '';
    if (vin) { this.elNiv.value = vin; this.charger(vin); }
  }

  Evaluation.prototype.demonter = function () {
    document.removeEventListener('amx:inventaire', this.surInventaire);
    document.removeEventListener('amx:carfax', this.surCarfax);
    this.generation++;
  };

  Evaluation.prototype.naviguer = function (ctx) {
    var vin = (ctx && ctx.params && ctx.params.vin) ? String(ctx.params.vin).trim() : '';
    if (vin && vin !== this.vinCharge) { this.elNiv.value = vin; this.charger(vin); }
  };

  Evaluation.prototype.etat = function (texte) { this.elEtat.textContent = texte; };

  /* --------------------------- Construction ---------------------------- */
  Evaluation.prototype.construire = function () {
    var self = this;

    this.elEtat = h('p#eval-statut', { text: 'Décodez le NIV, lancez l\'analyse de marché, puis fixez votre prix : la page le situe parmi les annonces actives et les ventes récentes.' });
    this.btnDecoder = h('button.btn#decode-btn', { type: 'button', html: I.scan + '<span>Décoder le VIN</span>', onclick: function () { self.decoderDepuisChamp(); } });
    this.btnAnalyser = h('button.btn.primaire#analyser-btn', { type: 'button', html: I.recherche + '<span>Analyser le marché</span>', onclick: function () { self.analyser(self.pays, true); } });
    this.btnEnregistrer = h('button.btn#save-eval-btn', { type: 'button', html: I.ok + '<span>Enregistrer l\'évaluation</span>', onclick: function () { self.enregistrer(); } });
    var entete = h('div.entete-page', [
      h('div', { style: { minWidth: 0 } }, [h('h1', 'Évaluation de marché'), this.elEtat]),
      h('div.actions', [this.btnDecoder, this.btnAnalyser, this.btnEnregistrer])
    ]);

    // --- Véhicule -------------------------------------------------------
    var cNiv = champ('e-niv', 'NIV', { mono: true, vin: true, placeholder: 'Numéro d\'identification' });
    var cMarque = champ('e-marque', 'Marque');
    var cModele = champ('e-modele', 'Modèle');
    var cVersion = champ('e-version', 'Version (trim)', { placeholder: 'LT, SLE, Limited…' });
    var cAnnee = champ('e-annee', 'Année', { type: 'number', inputmode: 'numeric' });
    var cKm = champ('e-km', 'Kilométrage du véhicule', { type: 'number', inputmode: 'numeric' });
    var cPrix = champ('e-prix', 'Votre prix de vente visé ($)', { type: 'number', inputmode: 'numeric', placeholder: 'Pour le rang et le marché %' });
    var cTaux = champ('e-taux-km', 'Taux d\'ajustement ($/km)', { type: 'number', step: '0.01', value: '0.10' });
    this.elConcession = h('select#e-concession', Object.keys(AMX.CONCESSIONS).map(function (k) {
      return h('option', { value: k, selected: k === 'stemarie' ? true : undefined, text: AMX.CONCESSIONS[k] });
    }));
    var cConcession = h('div.champ', [h('label', { 'for': 'e-concession', text: 'Marché local autour de' }), this.elConcession]);
    this.elNiv = cNiv.input; this.elMarque = cMarque.input; this.elModele = cModele.input; this.elVersion = cVersion.input;
    this.elAnnee = cAnnee.input; this.elKm = cKm.input; this.elPrix = cPrix.input; this.elTaux = cTaux.input;
    this.elContexte = h('div.eval-contexte.cache');
    this.elLiens = h('div.eval-liens');
    var vehicule = carte('Véhicule à évaluer', [
      h('div.eval-pile', [
        h('div.grille.c4', [cNiv.el, cMarque.el, cModele.el, cVersion.el]),
        h('div.grille.c4', [cAnnee.el, cKm.el, cPrix.el, cConcession])
      ]),
      this.elContexte,
      this.elLiens
    ]);
    this.elNiv.addEventListener('blur', function () {
      var vin = self.elNiv.value.trim();
      if (vin.length < 11) return;
      if (vin !== self.vinCharge) self.charger(vin);
    });
    this.elNiv.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); self.elNiv.blur(); } });
    this.elNiv.addEventListener('input', function () { self.rendreLiens(); });
    [this.elKm, this.elPrix].forEach(function (el) { el.addEventListener('input', function () { self.recalculer(); self.rendreMarche(); }); });
    this.elVersion.addEventListener('input', AMX.debounce(function () { if (self.analyses[self.pays]) self.rendreMarche(); }, 200));
    this.elConcession.addEventListener('change', function () { self.oublierAnalyses(); });

    // --- Analyse de marché ----------------------------------------------
    this.btnCa = h('button', { type: 'button', text: 'Canada', onclick: function () { self.choisirPays('ca'); } });
    this.btnUs = h('button', { type: 'button', text: 'États-Unis', onclick: function () { self.choisirPays('us'); } });
    this.elSegment = h('div.segment#eval-pays', [this.btnCa, this.btnUs]);
    this.btnRafraichir = h('button.btn.petit', { type: 'button', title: 'Relancer la recherche', html: I.rafraichir + '<span>Relancer</span>', onclick: function () { self.analyser(self.pays, true); } });
    this.elMarche = h('div#eval-marche');
    var marche = carte(
      h('div.titre', [h('h2', 'Analyse de marché'), h('p', 'Annonces actives de concessionnaires et ventes déduites des 90 derniers jours (MarketCheck).')]),
      [this.elMarche],
      h('div.droite', [this.elSegment, this.btnRafraichir])
    );
    this.majSegment();

    // --- Comparables saisis à la main (ancienne fiche) -------------------
    var cTauxBloc = h('div.grille.c4', [cTaux.el]);
    this.elTaux.addEventListener('input', function () { self.recalculer(); self.rendreMarche(); });
    this.elLignes = h('tbody#comp-rows');
    this.btnImporter = h('button.btn.petit#importer-comp-btn', { type: 'button', html: I.telecharger + '<span>Reprendre les annonces retenues</span>', onclick: function () { self.importerComparables(); } });
    var comparables = carte(
      h('div.titre', [h('h2', 'Comparables saisis à la main'), h('p', 'Facultatif : vos propres trouvailles (Kijiji, AutoHebdo…) ou les annonces retenues ci-dessus, ramenées au kilométrage du véhicule.')]),
      [
        cTauxBloc,
        h('div.eval-sites', { style: { margin: '12px 0' } }, SITES.map(function (s) { return h('a.btn.petit', { href: s.url, target: '_blank', rel: 'noopener', html: I.externe + '<span>' + AMX.esc(s.nom) + '</span>' }); })),
        h('div.eval-comparables', [
          h('table.tableau', [
            h('thead', [h('tr', [h('th', 'Source'), h('th.col-prix', 'Prix ($)'), h('th.col-km', 'KM'), h('th.col-x', '')])]),
            this.elLignes
          ])
        ])
      ],
      h('div.droite', [this.btnImporter, h('button.btn.petit#add-comp-btn', { type: 'button', html: I.plus + '<span>Ajouter</span>', onclick: function () { self.ajouterLigne(); self.elLignes.lastChild.querySelector('input').focus(); } })])
    );
    this.ajouterLigne(); this.ajouterLigne(); this.ajouterLigne();

    this.S = {
      count: h('div.v.num#s-count', '0'), avg: h('div.v.num#s-avg', '—'), median: h('div.v.num#s-median', '—'), range: h('div.v.num#s-range', '—'),
      avgAdj: h('div.v.num#s-avg-adj', '—'), medianAdj: h('div.v.num#s-median-adj', '—'), rangeAdj: h('div.v.num#s-range-adj', '—')
    };
    var brut = h('div.resume-sombre', [
      h('div', [h('div.l', 'Comparables saisis'), this.S.count]),
      h('div', [h('div.l', 'Moyenne brute'), this.S.avg]),
      h('div', [h('div.l', 'Médiane brute'), this.S.median]),
      h('div', [h('div.l', 'Fourchette brute'), this.S.range])
    ]);
    var ajuste = h('div.resume-sombre.eval-ajuste', [
      h('div', [h('div.l', 'Moyenne ajustée au KM'), this.S.avgAdj]),
      h('div', [h('div.l', 'Médiane ajustée au KM'), this.S.medianAdj]),
      h('div', [h('div.l', 'Fourchette ajustée'), this.S.rangeAdj])
    ]);
    this.elResumesManuels = h('div#eval-resumes-manuels.cache', [brut, h('div', { style: { height: '10px' } }), ajuste]);

    this.el = h('div.page.eval-page', [entete, vehicule, marche, comparables, this.elResumesManuels]);
    this.rendreLiens();
  };

  /* ----------------------------- Liens ---------------------------------- */
  Evaluation.prototype.rendreLiens = function () {
    var vin = (this.elNiv.value || '').trim().toUpperCase();
    var vinOk = /^[A-HJ-NPR-Z0-9]{17}$/.test(vin);
    AMX.vider(this.elLiens);
    var carfax = (vinOk && AMX.carfax && AMX.carfax.lien) ? AMX.carfax.lien(vin) : '';
    this.elLiens.appendChild(h('a.btn.petit' + (carfax ? '' : ''), { href: carfax || URL_CARFAX_COMPTE, target: '_blank', rel: 'noopener', title: carfax ? 'Rapport CARFAX partagé de ce véhicule' : 'Mon compte CARFAX (aucun rapport partagé pour ce NIV)', html: I.externe + '<span>' + (carfax ? 'Rapport CARFAX' : 'CARFAX (compte)') + '</span>' }));
    this.elLiens.appendChild(h('a.btn.petit' + (vinOk ? '' : '.desactive'), { href: vinOk ? lienMarketGuide(vin) : '#', target: '_blank', rel: 'noopener', title: 'Valeurs d\'encan eBlock (vendus 90 jours) pour ce NIV', html: I.externe + '<span>eBlock Market Guide</span>' }));
    this.elLiens.appendChild(h('a.btn.petit', { href: URL_TORQUE, target: '_blank', rel: 'noopener', title: 'Évaluations Torque (Hawkesbury)', html: I.externe + '<span>Torque</span>' }));
    this.elLiens.appendChild(h('span.sep', { text: vinOk ? 'NIV ' + vin : 'Entrez un NIV complet pour les liens par véhicule' }));
  };

  /* ------------------------- Analyse de marché -------------------------- */
  Evaluation.prototype.majSegment = function () {
    this.btnCa.classList.toggle('actif', this.pays === 'ca');
    this.btnUs.classList.toggle('actif', this.pays === 'us');
  };
  Evaluation.prototype.choisirPays = function (pays) {
    this.pays = pays === 'us' ? 'us' : 'ca';
    AMX.memo.ecrire('eval_pays', this.pays);
    this.majSegment();
    if (!this.analyses[this.pays] && !this.enCours[this.pays] && this.parametresPrets()) this.analyser(this.pays, false);
    else this.rendreMarche();
  };
  Evaluation.prototype.parametresPrets = function () {
    return !!(nombre(this.elAnnee.value) && this.elMarque.value.trim() && this.elModele.value.trim());
  };
  Evaluation.prototype.parametres = function (pays) {
    var vin = this.elNiv.value.trim().toUpperCase();
    var p = { marche: 1, pays: pays, annee: this.elAnnee.value.trim(), marque: this.elMarque.value.trim(), modele: this.elModele.value.trim(), version: this.elVersion.value.trim(), km: this.elKm.value.trim(), concession: this.elConcession.value };
    if (/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) p.vin = vin;
    return p;
  };
  Evaluation.prototype.analyser = function (pays, manuel) {
    var self = this;
    pays = pays === 'us' ? 'us' : 'ca';
    if (!this.parametresPrets()) {
      if (manuel) { AMX.toast('Il faut l\'année, la marque et le modèle — décodez le NIV ou remplissez-les.', 'attention'); (nombre(this.elAnnee.value) ? this.elMarque : this.elAnnee).focus(); }
      return Promise.resolve();
    }
    var g = ++this.genAnalyse[pays];
    this.enCours[pays] = true;
    this.analyses[pays] = null;
    this.rendreMarche();
    this.btnAnalyser.classList.add('occupe');
    return AMX.get(this.parametres(pays)).then(function (d) {
      if (g !== self.genAnalyse[pays]) return;
      self.enCours[pays] = false;
      if (d && d.refuse) { self.analyses[pays] = { ok: false, erreur: d.erreur || 'Accès refusé' }; }
      else self.analyses[pays] = d || { ok: false, erreur: 'Réponse vide' };
      self.analyses[pays]._recu = Date.now();
      self.rendreMarche();
      if (self.analyses[pays].ok) self.etat('Analyse ' + (pays === 'us' ? 'du marché américain' : 'du marché canadien') + ' reçue : ' + ((self.analyses[pays].actifs || {}).n || 0) + ' annonces actives, ' + ((self.analyses[pays].vendus || {}).n90 || 0) + ' ventes déduites sur 90 jours.');
    }).catch(function (e) {
      if (g !== self.genAnalyse[pays]) return;
      self.enCours[pays] = false;
      self.analyses[pays] = { ok: false, erreur: AMX.erreurTexte(e) };
      self.rendreMarche();
      AMX.toast('Analyse impossible — ' + AMX.erreurTexte(e), 'erreur');
    }).then(function () { self.btnAnalyser.classList.remove('occupe'); });
  };

  // Annonces filtrées + prix ajustés, triées selon le filtre.
  Evaluation.prototype.annoncesRetenues = function (a) {
    var self = this;
    var kmV = nombre(this.elKm.value), taux = nombre(this.elTaux.value) || 0;
    var version = this.elVersion.value.trim().toLowerCase();
    var liste = ((a && a.actifs && a.actifs.annonces) || []).map(function (x) {
      var ajuste = (kmV !== null && x.km !== null && x.km !== undefined) ? x.prix - (kmV - x.km) * taux : x.prix;
      return Object.assign({}, x, { ajuste: Math.round(ajuste) });
    });
    if (this.filtres.memeVersion && version) liste = liste.filter(function (x) { return String(x.version || '').toLowerCase().indexOf(version) >= 0; });
    if (this.filtres.kmProche && kmV !== null) liste = liste.filter(function (x) { return x.km === null || x.km === undefined || Math.abs(x.km - kmV) <= TOLERANCE_KM; });
    var tri = this.filtres.tri;
    liste.sort(function (p, q) {
      if (tri === 'km') return (p.km || 0) - (q.km || 0);
      if (tri === 'dist') return (p.distKm || 0) - (q.distKm || 0);
      if (tri === 'jours') return (q.jours || 0) - (p.jours || 0);
      return p.ajuste - q.ajuste;
    });
    return liste;
  };

  // Les trois prix + la position du prix visé.
  Evaluation.prototype.calculs = function (a) {
    var liste = this.annoncesRetenues(a);
    var ajustes = liste.map(function (x) { return x.ajuste; }).sort(asc);
    var prixVise = nombre(this.elPrix.value);
    var res = { n: liste.length, agressif: null, standard: null, conservateur: null, base: '' };
    if (ajustes.length >= 3) {
      res.agressif = arrondi50(centile(ajustes, 0.25)); res.standard = arrondi50(mediane(ajustes)); res.conservateur = arrondi50(centile(ajustes, 0.75));
      res.base = ajustes.length + ' annonces, prix ramenés à votre kilométrage';
    } else {
      var st = a && a.actifs && a.actifs.prix, med = st && (st.mediane || st.moyenne);
      if (ajustes.length) { med = mediane(ajustes); }
      if (med) { res.agressif = arrondi50(med * 0.93); res.standard = arrondi50(med); res.conservateur = arrondi50(med * 1.04); res.base = ajustes.length ? ajustes.length + ' annonce(s) seulement : −7 % / +4 % autour de la médiane' : 'statistiques du marché : −7 % / +4 % autour de la médiane'; }
    }
    var moyActive = a && a.actifs && a.actifs.prix && a.actifs.prix.moyenne;
    if (!moyActive && ajustes.length) moyActive = moyenne(liste.map(function (x) { return x.prix; }));
    res.marchePct = (prixVise && moyActive) ? prixVise / moyActive : null;
    if (prixVise && ajustes.length) {
      var rang = 1; ajustes.forEach(function (p) { if (p < prixVise) rang++; });
      res.rang = rang; res.rangSur = ajustes.length + 1;
    }
    res.prixVise = prixVise;
    return res;
  };

  Evaluation.prototype.rendreMarche = function () {
    var self = this;
    var pays = this.pays, a = this.analyses[pays];
    AMX.vider(this.elMarche);

    if (this.enCours[pays]) {
      this.elMarche.appendChild(h('div.chargement', [h('span', { html: I.rafraichir }), 'Recherche des annonces ' + (pays === 'us' ? 'américaines' : 'canadiennes') + ' et des ventes récentes…']));
      return;
    }
    if (!a) {
      var prets = this.parametresPrets();
      var attente = h('div.eval-attente', [
        h('div', { text: prets ? 'Prêt à analyser ' + [this.elAnnee.value, this.elMarque.value, this.elModele.value, this.elVersion.value].filter(Boolean).join(' ') + ' sur le marché ' + (pays === 'us' ? 'américain' : 'canadien') + '.' : 'Décodez le NIV (ou entrez l\'année, la marque et le modèle), puis lancez l\'analyse.' }),
        prets ? h('button.btn.primaire', { type: 'button', html: I.recherche + '<span>Analyser le marché ' + (pays === 'us' ? 'américain' : 'canadien') + '</span>', onclick: function () { self.analyser(pays, true); } }) : null
      ]);
      this.elMarche.appendChild(attente);
      if (this.derniereSauvegarde) this.elMarche.appendChild(this.blocSauvegarde(this.derniereSauvegarde));
      return;
    }
    if (!a.ok) {
      var admin = AMX.estAdmin();
      this.elMarche.appendChild(h('div.alerte-bloc.' + (a.sansCle ? 'attention' : 'erreur'), [
        h('span', { html: I.alerte }),
        h('div', [
          h('div', { text: a.sansCle ? 'La clé MarketCheck n\'est pas en place sur le serveur.' : 'Analyse impossible : ' + (a.erreur || 'erreur inconnue') }),
          a.sansCle ? h('div.mini', { style: { marginTop: '4px' } }, admin ? [h('a', { href: AMX.lien('admin', '', {}), text: 'Coller la clé dans Admin › Données de marché' })] : 'Demandez à un administrateur de la coller dans Admin › Données de marché.') : null
        ])
      ]));
      if (this.derniereSauvegarde) this.elMarche.appendChild(this.blocSauvegarde(this.derniereSauvegarde));
      return;
    }

    var c = this.calculs(a);
    var act = a.actifs || {}, ven = a.vendus || {};
    var devise = a.devise || (pays === 'us' ? 'USD' : 'CAD');

    // Résumé sombre
    this.elMarche.appendChild(h('div.resume-sombre.eval-resume', [
      h('div', [h('div.l', 'Annonces actives'), h('div.v.num', { text: String(act.n || 0) })]),
      h('div', [h('div.l', 'Prix moyen actif'), h('div.v.num', { text: fmt(act.prix && act.prix.moyenne) })]),
      h('div', [h('div.l', 'Médiane active'), h('div.v.num', { text: fmt(act.prix && act.prix.mediane) })]),
      h('div', [h('div.l', 'Jours affichés moy.'), h('div.v.num', { text: fmtJ(act.jours && act.jours.moyenne) })]),
      h('div', [h('div.l', 'Vendus / mois (90 j)'), h('div.v.num', { text: ven.parMois !== undefined && ven.parMois !== null ? String(ven.parMois) : '—' })]),
      h('div', [h('div.l', 'Prix moyen vendu'), h('div.v.num', { text: fmt(ven.prix && ven.prix.moyenne) })])
    ]));

    // Trois prix
    function blocPrix(cls, titre, valeur, sous) { return h('div.bloc.' + cls, [h('div.l', { text: titre }), h('div.v.num', { text: fmt(valeur) }), h('div.s', { text: sous })]); }
    var ecart = function (v) { return (c.standard && v) ? ((v / c.standard - 1) * 100).toFixed(1).replace('.0', '').replace('.', ',') + ' %' : '—'; };
    this.elMarche.appendChild(h('div.eval-prix', [
      blocPrix('agressif', 'Prix agressif', c.agressif, c.agressif ? ecart(c.agressif) + ' vs standard · vente rapide' : 'Pas assez d\'annonces'),
      blocPrix('standard', 'Prix standard', c.standard, c.base || '—'),
      blocPrix('conservateur', 'Prix conservateur', c.conservateur, c.conservateur ? '+' + ecart(c.conservateur) + ' vs standard · marge maximale' : '—')
    ]));

    // Position du prix visé
    if (c.prixVise) {
      var pos = c.marchePct;
      this.elMarche.appendChild(h('div.alerte-bloc.' + (pos === null ? 'attention' : (pos <= 0.97 ? 'ok' : (pos <= 1.03 ? 'attention' : 'erreur'))), { style: { marginBottom: '12px' } }, [
        h('span', { html: I.info }),
        h('div', [
          h('strong', { text: 'Votre prix ' + fmt(c.prixVise) + ' : ' }),
          h('span', { text: 'marché ' + pct(pos) + (c.rang ? ' · rang ' + c.rang + ' sur ' + c.rangSur : '') + (pos !== null ? (pos < 1 ? ' — sous le prix moyen actif' : (pos > 1 ? ' — au-dessus du prix moyen actif' : ' — au prix moyen actif')) : '') })
        ])
      ]));
    }

    // Deux cartes de statistiques
    function mini(l, v, m) { return h('div', [h('div.l', { text: l }), h('div.v', { text: v }), m ? h('div.m', { text: m }) : null]); }
    var statAct = h('div.eval-stat', [
      h('h3', [h('span.n', { text: String(act.n || 0) }), 'véhicules similaires sur le marché', h('span.mini.doux', { text: ' · rayon ' + (a.rayonKm || '—') + ' km autour de ' + (a.lieu || '—') })]),
      h('div.grille-mini', [
        mini('KM moyen', fmtKm(act.km && act.km.moyenne), act.km ? fmtKm(act.km.min) + ' – ' + fmtKm(act.km.max) : ''),
        mini('Prix moyen', fmt(act.prix && act.prix.moyenne), act.prix ? fmt(act.prix.min) + ' – ' + fmt(act.prix.max) : ''),
        mini('Jours affichés', fmtJ(act.jours && act.jours.moyenne), act.jours ? fmtJ(act.jours.min) + ' – ' + fmtJ(act.jours.max) : '')
      ]),
      a.versionElargie ? h('p.eval-note', { text: 'Trop peu d\'annonces pour la version « ' + (a.version || this.elVersion.value) + ' » : la recherche a été élargie à tout le modèle.' }) : null
    ]);
    var statVen = h('div.eval-stat', [
      h('h3', [h('span.n', { text: String(ven.n90 || 0) }), 'ventes déduites en 90 jours', h('span.mini.doux', { text: ven.parMois !== undefined && ven.parMois !== null ? ' · ≈ ' + ven.parMois + ' par mois' : '' })]),
      h('div.grille-mini', [
        mini('Prix moyen vendu', fmt(ven.prix && ven.prix.moyenne), ven.prix ? 'médiane ' + fmt(ven.prix.mediane) : ''),
        mini('KM moyen vendu', fmtKm(ven.km && ven.km.moyenne), ven.km ? fmtKm(ven.km.min) + ' – ' + fmtKm(ven.km.max) : ''),
        mini('Jours avant vente', fmtJ(ven.jours && ven.jours.moyenne), ven.jours ? 'médiane ' + fmtJ(ven.jours.mediane) : '')
      ]),
      h('p.eval-note', { text: (ven.portee === 'version' ? 'Portée : année, marque, modèle et version' : 'Portée : année, marque et modèle') + (a.ventesElargies ? ' (élargie, la version n\'avait pas de ventes recensées)' : '') + ' — ' + (pays === 'us' ? 'États-Unis' : 'Canada') + ', annonces disparues des sites de concessionnaires, en ' + devise + '.' })
    ]);
    this.elMarche.appendChild(h('div.eval-stats', [statAct, statVen]));

    // Filtres + table des comparables
    var liste = this.annoncesRetenues(a);
    var caseVersion = h('input', { type: 'checkbox', checked: this.filtres.memeVersion ? true : undefined, disabled: this.elVersion.value.trim() ? undefined : true });
    caseVersion.addEventListener('change', function () { self.filtres.memeVersion = caseVersion.checked; self.rendreMarche(); });
    var caseKm = h('input', { type: 'checkbox', checked: this.filtres.kmProche ? true : undefined, disabled: nombre(this.elKm.value) === null ? true : undefined });
    caseKm.addEventListener('change', function () { self.filtres.kmProche = caseKm.checked; self.rendreMarche(); });
    var tri = h('select.saisie', { style: { height: '28px', width: 'auto' } }, [['prix', 'Prix ajusté'], ['km', 'Kilométrage'], ['dist', 'Distance'], ['jours', 'Jours affichés']].map(function (o) { return h('option', { value: o[0], selected: self.filtres.tri === o[0] ? true : undefined, text: 'Trier : ' + o[1] }); }));
    tri.addEventListener('change', function () { self.filtres.tri = tri.value; self.rendreMarche(); });
    this.elMarche.appendChild(h('div.eval-filtres', [
      h('label.case', [caseVersion, h('span', { text: 'Même version seulement' })]),
      h('label.case', [caseKm, h('span', { text: '± ' + AMX.fmtNombre(TOLERANCE_KM) + ' km du véhicule' })]),
      h('span.espace'),
      h('span.doux', { text: liste.length + ' annonce' + (liste.length > 1 ? 's' : '') + ' retenue' + (liste.length > 1 ? 's' : '') }),
      tri
    ]));

    var moy = act.prix && act.prix.moyenne;
    var lignes = [];
    var moiInsere = !c.prixVise;
    var kmV = nombre(this.elKm.value);
    var ligneMoi = function (rang) {
      return h('tr.eval-moi', [
        h('td.num', { text: rang ? String(rang) : '' }),
        h('td', [h('div', { text: 'Votre véhicule' }), h('div.mini', { text: AMX.CONCESSIONS[self.elConcession.value] || '' })]),
        h('td', { text: self.elVersion.value.trim() || '—' }),
        h('td.num', { text: self.elAnnee.value || '—' }),
        h('td.num', { text: kmV !== null ? fmtKm(kmV) : '—' }),
        h('td.num', { text: fmt(c.prixVise) }),
        h('td.num', { text: fmt(c.prixVise) }),
        h('td.num', { text: '—' }), h('td.num', { text: '—' }),
        h('td.num', { text: pct(c.marchePct) }),
        h('td', '')
      ]);
    };
    liste.forEach(function (x, i) {
      if (!moiInsere && self.filtres.tri === 'prix' && x.ajuste >= c.prixVise) { lignes.push(ligneMoi(lignes.length + 1)); moiInsere = true; }
      var m = moy ? x.prix / moy : null;
      lignes.push(h('tr', [
        h('td.num', { text: String(lignes.length + 1) }),
        h('td.sous', [h('div', { text: x.concession || '—' }), h('span.mini', { text: [x.ville, x.province].filter(Boolean).join(', ') + (x.certifie ? ' · certifié' : '') })]),
        h('td', { text: x.version || '—' }),
        h('td.num', { text: x.annee || '—' }),
        h('td.num', { text: fmtKm(x.km) }),
        h('td.num', { text: fmt(x.prix) }),
        h('td.num', { text: fmt(x.ajuste), title: kmV !== null ? 'Ramené à ' + fmtKm(kmV) : 'Entrez le km du véhicule pour ajuster' }),
        h('td.num', { text: fmtJ(x.jours) }),
        h('td.num', { text: x.distKm !== null && x.distKm !== undefined ? AMX.fmtNombre(x.distKm) + ' km' : '—' }),
        h('td.num' + (m ? (m > 1.03 ? '.sup' : (m < 0.97 ? '.inf' : '')) : ''), { text: pct(m) }),
        h('td', x.lien ? [h('a.petit', { href: x.lien, target: '_blank', rel: 'noopener', text: 'Voir' })] : '')
      ]));
    });
    if (!moiInsere) lignes.push(ligneMoi(lignes.length + 1));
    this.elMarche.appendChild(h('div.eval-table', [h('table.tableau#eval-comparables', [
      h('thead', [h('tr', [h('th.num', '#'), h('th', 'Concession'), h('th', 'Version'), h('th.num', 'Année'), h('th.num', 'Odomètre'), h('th.num', 'Prix'), h('th.num', 'Prix ajusté'), h('th.num', 'Jours'), h('th.num', 'Distance'), h('th.num', 'Marché %'), h('th', '')])]),
      h('tbody', lignes.length ? lignes : [h('tr', [h('td', { colspan: 11, text: 'Aucune annonce ne correspond aux filtres.' })])])
    ])]));

    var pied = [h('span', { text: 'Source : MarketCheck · ' + (pays === 'us' ? 'États-Unis' : 'Canada') + ', prix en ' + devise }), h('span', { text: 'Reçu ' + AMX.fmtDate(a.genereLe || new Date().toISOString(), true) })];
    (a.avertissements || []).forEach(function (t) { pied.push(h('span.puce.attention', { text: t })); });
    if (this.derniereSauvegarde) pied.push(h('span.puce', { text: 'Dernière évaluation enregistrée : standard ' + fmt(this.derniereSauvegarde.standard) + ' (' + AMX.fmtDateCourte(this.derniereSauvegarde.genereLe) + ')' }));
    this.elMarche.appendChild(h('div.eval-pied', pied));
  };

  // Rappel d'une évaluation enregistrée (sans les annonces, qui ne sont pas conservées).
  Evaluation.prototype.blocSauvegarde = function (m) {
    return h('div.alerte-bloc.ok', { style: { marginTop: '12px' } }, [
      h('span', { html: I.info }),
      h('div', [
        h('div', { text: 'Évaluation enregistrée le ' + AMX.fmtDate(m.genereLe, true) + (m.pays ? ' (marché ' + (m.pays === 'us' ? 'américain' : 'canadien') + ')' : '') + ' : agressif ' + fmt(m.agressif) + ' · standard ' + fmt(m.standard) + ' · conservateur ' + fmt(m.conservateur) + '.' }),
        h('div.mini', { text: (m.actifs ? m.actifs.n + ' annonces actives, prix moyen ' + fmt(m.actifs.prixMoy) : '') + (m.vendus ? ' · ' + m.vendus.n90 + ' ventes en 90 j' : '') + ' — relancez l\'analyse pour des chiffres du jour.' })
      ])
    ]);
  };

  // Copie les annonces retenues dans les comparables manuels (remplace les lignes vides).
  Evaluation.prototype.importerComparables = function () {
    var self = this, a = this.analyses[this.pays];
    var liste = a && a.ok ? this.annoncesRetenues(a) : [];
    if (!liste.length) { AMX.toast('Aucune annonce retenue à reprendre — lancez d\'abord l\'analyse.', 'attention'); return; }
    this.lignes().forEach(function (tr) { if (!tr.querySelector('.comp-prix').value && !tr.querySelector('.comp-source').value) tr.remove(); });
    liste.slice(0, 25).forEach(function (x) { self.ajouterLigne([x.concession, x.ville].filter(Boolean).join(' · ') || 'MarketCheck', x.prix, x.km); });
    this.recalculer();
    AMX.toast(Math.min(liste.length, 25) + ' annonce(s) reprise(s) dans les comparables.', 'ok');
    this.elResumesManuels.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /* --------------------------- Comparables manuels ---------------------- */
  Evaluation.prototype.ajouterLigne = function (source, prix, km) {
    var self = this;
    this.compteur++;
    var tr = h('tr#comp-' + this.compteur, [
      h('td', [h('input.saisie.comp-source', { type: 'text', placeholder: 'Source (ex. Kijiji Autos)', value: source === undefined || source === null ? '' : String(source), autocomplete: 'off' })]),
      h('td.col-prix', [h('input.saisie.mono.comp-prix', { type: 'number', inputmode: 'decimal', placeholder: 'Prix $', value: prix === undefined || prix === null ? '' : String(prix) })]),
      h('td.col-km', [h('input.saisie.comp-km', { type: 'number', inputmode: 'numeric', placeholder: 'KM', value: km === undefined || km === null ? '' : String(km) })]),
      h('td.col-x', [h('button.btn.icone.petit.fantome.comp-remove', { type: 'button', title: 'Retirer', 'aria-label': 'Retirer ce comparable', html: I.corbeille, onclick: function () { tr.remove(); self.recalculer(); } })])
    ]);
    tr.querySelectorAll('input').forEach(function (inp) { inp.addEventListener('input', function () { self.recalculer(); }); });
    this.elLignes.appendChild(tr);
    return tr;
  };
  Evaluation.prototype.lignes = function () { return Array.prototype.slice.call(this.elLignes.querySelectorAll('tr')); };

  Evaluation.prototype.recalculer = function () {
    var S = this.S;
    var comps = this.lignes().map(function (tr) {
      return { prix: parseFloat(tr.querySelector('.comp-prix').value), km: parseFloat(tr.querySelector('.comp-km').value) };
    }).filter(function (c) { return !isNaN(c.prix) && c.prix > 0; });
    var prix = comps.map(function (c) { return c.prix; }).sort(asc);
    S.count.textContent = String(prix.length);
    S.avgAdj.classList.remove('indice');
    this.elResumesManuels.classList.toggle('cache', !prix.length);
    if (!prix.length) { ['avg', 'median', 'range', 'avgAdj', 'medianAdj', 'rangeAdj'].forEach(function (k) { S[k].textContent = '—'; }); return; }
    S.avg.textContent = fmt(moyenne(prix));
    S.median.textContent = fmt(mediane(prix));
    S.range.textContent = fmt(prix[0]) + ' – ' + fmt(prix[prix.length - 1]);
    var kmVehicule = parseFloat(this.elKm.value), tauxKm = parseFloat(this.elTaux.value) || 0;
    if (!isNaN(kmVehicule)) {
      var ajustes = comps.map(function (c) { return isNaN(c.km) ? c.prix : c.prix - (kmVehicule - c.km) * tauxKm; }).sort(asc);
      S.avgAdj.textContent = fmt(moyenne(ajustes));
      S.medianAdj.textContent = fmt(mediane(ajustes));
      S.rangeAdj.textContent = fmt(ajustes[0]) + ' – ' + fmt(ajustes[ajustes.length - 1]);
    } else {
      S.avgAdj.textContent = 'Entrez le KM du véhicule'; S.avgAdj.classList.add('indice');
      S.medianAdj.textContent = '—'; S.rangeAdj.textContent = '—';
    }
  };

  /* ------------------------------ Données ------------------------------- */
  Evaluation.prototype.collecter = function () {
    var a = this.analyses[this.pays], marche = null;
    if (a && a.ok) {
      var c = this.calculs(a);
      marche = {
        pays: this.pays, devise: a.devise, lieu: a.lieu, rayonKm: a.rayonKm, genereLe: a.genereLe || new Date().toISOString(),
        agressif: c.agressif, standard: c.standard, conservateur: c.conservateur, marchePct: c.marchePct, rang: c.rang || null, rangSur: c.rangSur || null,
        actifs: a.actifs ? { n: a.actifs.n, prixMoy: a.actifs.prix && a.actifs.prix.moyenne, prixMed: a.actifs.prix && a.actifs.prix.mediane, kmMoy: a.actifs.km && a.actifs.km.moyenne, joursMoy: a.actifs.jours && a.actifs.jours.moyenne } : null,
        vendus: a.vendus ? { n90: a.vendus.n90, parMois: a.vendus.parMois, prixMoy: a.vendus.prix && a.vendus.prix.moyenne, kmMoy: a.vendus.km && a.vendus.km.moyenne } : null,
        filtres: Object.assign({}, this.filtres)
      };
    } else if (this.derniereSauvegarde) marche = this.derniereSauvegarde;
    return {
      marque: this.elMarque.value, modele: this.elModele.value, annee: this.elAnnee.value, version: this.elVersion.value,
      km: this.elKm.value, tauxKm: this.elTaux.value, prixVente: this.elPrix.value, concession: this.elConcession.value,
      comparables: this.lignes().map(function (tr) { return { source: tr.querySelector('.comp-source').value, prix: tr.querySelector('.comp-prix').value, km: tr.querySelector('.comp-km').value }; }),
      marche: marche
    };
  };

  Evaluation.prototype.remplir = function (data) {
    var self = this;
    data = data || {};
    if (data.marque) this.elMarque.value = data.marque;
    if (data.modele) this.elModele.value = data.modele;
    if (data.annee) this.elAnnee.value = data.annee;
    if (data.version) this.elVersion.value = data.version;
    if (data.km) this.elKm.value = data.km;
    if (data.tauxKm) this.elTaux.value = data.tauxKm;
    if (data.prixVente) this.elPrix.value = data.prixVente;
    if (data.concession && AMX.CONCESSIONS[data.concession]) this.elConcession.value = data.concession;
    if (data.comparables && data.comparables.length) {
      AMX.vider(this.elLignes);
      data.comparables.forEach(function (c) { self.ajouterLigne(c && c.source, c && c.prix, c && c.km); });
    }
    this.derniereSauvegarde = (data.marche && typeof data.marche === 'object') ? data.marche : null;
    if (this.derniereSauvegarde && this.derniereSauvegarde.pays) { this.pays = this.derniereSauvegarde.pays === 'us' ? 'us' : 'ca'; this.majSegment(); }
    this.analyses = { ca: null, us: null };
    this.enCours = { ca: false, us: false };
    this.genAnalyse.ca++; this.genAnalyse.us++;
    this.recalculer();
    this.rendreMarche();
  };

  Evaluation.prototype.oublierAnalyses = function () {
    this.analyses = { ca: null, us: null };
    this.enCours = { ca: false, us: false };
    this.genAnalyse.ca++; this.genAnalyse.us++;
    this.rendreMarche();
  };

  Evaluation.prototype.reinitialiser = function () {
    var self = this;
    ['elMarque', 'elModele', 'elAnnee', 'elVersion', 'elKm', 'elPrix'].forEach(function (k) { self[k].value = ''; });
    AMX.vider(this.elLignes); this.ajouterLigne(); this.ajouterLigne(); this.ajouterLigne();
    this.derniereSauvegarde = null;
    this.analyses = { ca: null, us: null };
    this.enCours = { ca: false, us: false };
    this.genAnalyse.ca++; this.genAnalyse.us++;
    this.recalculer();
    this.rendreMarche();
  };

  /* ---------------------------- Chargement ------------------------------ */
  Evaluation.prototype.charger = function (vin) {
    var self = this;
    vin = String(vin || '').trim().toUpperCase();
    if (!vin) return Promise.resolve();
    var gen = ++this.generation;
    this.vinCourant = vin; this.vinCharge = vin;
    this.reinitialiser();
    this.rendreContexte(); this.rendreLiens();
    if (!AMX.inventaire.parVin(vin)) AMX.inventaire.tout().then(function () { self.rendreContexte(); self.preremplirDepuisInventaire(); }, function () {});
    else this.preremplirDepuisInventaire();
    this.etat('Recherche d\'une évaluation existante…');
    return AMX.get('evalVin=' + encodeURIComponent(vin)).then(function (d) {
      if (gen !== self.generation) return;
      if (d && d.refuse) throw new Error(d.erreur || d.message || 'Accès refusé');
      if (d && d.trouve) {
        self.remplir(d.donnees || {});
        self.etat('Évaluation existante chargée — NIV ' + vin + (d.dateMaj ? ', mise à jour le ' + AMX.fmtDate(d.dateMaj, true) : '') + '. Relancez l\'analyse pour des chiffres du jour.');
        if (!self.parametresPrets()) self.decoder(vin);
      } else {
        self.etat('Aucune évaluation pour ce NIV — décodage du véhicule…');
        self.decoder(vin).then(function () { if (gen === self.generation && self.parametresPrets()) { self.etat('Véhicule décodé. Lancez l\'analyse de marché.'); self.analyser(self.pays, false); } });
      }
      history.replaceState(null, '', AMX.lien('outils', 'evaluation', { vin: vin }));
    }).catch(function (e) {
      if (gen !== self.generation) return;
      self.vinCharge = '';
      self.etat('Impossible de joindre le serveur : ' + AMX.erreurTexte(e));
      AMX.toast('Impossible de charger l\'évaluation — ' + AMX.erreurTexte(e), 'erreur');
    });
  };

  // Le registre connaît souvent le km (fiche d'achat) et la concession : on s'en sert si les champs sont vides.
  Evaluation.prototype.preremplirDepuisInventaire = function () {
    var v = this.vinCourant ? AMX.inventaire.parVin(this.vinCourant) : null;
    if (!v) return;
    if (!this.elConcession.value || this.elConcession.value === 'stemarie') {
      if (v.compagnie === 'HAWKS') this.elConcession.value = 'hawkesbury';
    }
    if (!this.elKm.value && v.km) this.elKm.value = String(v.km).replace(/[^0-9]/g, '');
  };

  Evaluation.prototype.decoderDepuisChamp = function () {
    var vin = this.elNiv.value.trim();
    if (vin.length < 11) { AMX.toast('Entrez un NIV d\'au moins 11 caractères pour le décoder.', 'attention'); this.elNiv.focus(); return; }
    this.vinCourant = vin;
    this.rendreContexte(); this.rendreLiens();
    this.decoder(vin);
  };

  Evaluation.prototype.decoder = function (vin) {
    var self = this, btn = this.btnDecoder;
    btn.classList.add('occupe');
    return decoderVin(vin).then(function (r) {
      if (self.vinCourant !== vin) return;
      if (!r) { AMX.toast('Décodage NHTSA indisponible — remplissez marque, modèle et année à la main.', 'attention'); return; }
      if (r.make) self.elMarque.value = r.make;
      if (r.model) self.elModele.value = r.model;
      if (r.year) self.elAnnee.value = r.year;
      if (r.trim && !self.elVersion.value.trim()) self.elVersion.value = r.trim;
      self.oublierAnalyses();
    }).then(function () { btn.classList.remove('occupe'); });
  };

  Evaluation.prototype.rendreContexte = function () {
    var vin = this.vinCourant;
    AMX.vider(this.elContexte);
    var v = vin ? AMX.inventaire.parVin(vin) : null;
    if (!v) { this.elContexte.classList.add('cache'); return; }
    this.elContexte.classList.remove('cache');
    this.elContexte.appendChild(h('span.mono.doux', { text: vin }));
    this.elContexte.appendChild(AMX.badgeStatut(v.statut, v._feuille));
    if (v.modele) this.elContexte.appendChild(h('span.modele', { text: v.modele }));
    if (v._feuille) this.elContexte.appendChild(h('span.puce', { text: 'Registre ' + AMX.inventaire.nomFeuille(v._feuille) }));
    if (v.stock) this.elContexte.appendChild(h('span.puce.mono', { text: v.stock }));
    if (v.compagnie) this.elContexte.appendChild(h('span.puce', { text: v.compagnie }));
    if (v._feuille) this.elContexte.appendChild(h('a.petit', { href: AMX.lien('inventaire', String(v._feuille).toLowerCase(), { vin: vin }), text: 'Voir dans l\'inventaire' }));
  };

  /* --------------------------- Enregistrement --------------------------- */
  Evaluation.prototype.enregistrer = function () {
    var self = this, btn = this.btnEnregistrer;
    var vin = this.elNiv.value.trim().toUpperCase();
    if (!vin) {
      this.etat('Entrez un NIV dans le champ NIV pour pouvoir enregistrer.');
      AMX.toast('Entrez un NIV pour enregistrer l\'évaluation.', 'attention');
      this.elNiv.focus();
      return;
    }
    btn.classList.add('occupe');
    this.etat('Enregistrement en cours…');
    var data = this.collecter();
    AMX.post({ action: 'saveEvaluation', vin: vin, data: data }).then(function (d) {
      AMX.verifier(d, 'Enregistrement refusé par le serveur');
      var quand = AMX.fmtDate(d.dateMaj || new Date().toISOString(), true);
      self.vinCourant = vin; self.vinCharge = vin;
      if (data.marche) self.derniereSauvegarde = data.marche;
      self.etat('Évaluation enregistrée pour ce NIV (' + quand + ')' + (data.marche ? ' — prix standard ' + fmt(data.marche.standard) + '.' : '.'));
      AMX.toast('Évaluation enregistrée (NIV ' + vin + ')', 'ok');
      history.replaceState(null, '', AMX.lien('outils', 'evaluation', { vin: vin }));
      self.rendreContexte();
    }).catch(function (e) {
      self.etat('Échec de l\'enregistrement : ' + AMX.erreurTexte(e));
      AMX.toast('Échec de l\'enregistrement — ' + AMX.erreurTexte(e), 'erreur');
    }).then(function () { btn.classList.remove('occupe'); });
  };

  AMX.vues = AMX.vues || {};
  AMX.vues.Evaluation = Evaluation;
})();
