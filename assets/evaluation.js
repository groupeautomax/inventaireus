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

   Les comparables tapés à la main de l'ancienne fiche n'existent plus à
   l'écran (retirés le 2 oct. à la demande de Maxime) ; ceux des évaluations
   déjà enregistrées sont conservés tels quels dans la sauvegarde.
   ========================================================================= */
(function () {
  'use strict';
  var h = AMX.h, I = AMX.icones;

  var URL_NHTSA = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVINValuesBatch/';
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
      '.eval-page .carte { margin-bottom: 12px; }',
      '.eval-page .carte-corps { padding: 12px 14px; }',
      '.eval-page .carte-entete { padding: 10px 14px; }',
      '.eval-page .carte-entete .titre { min-width: 0; }',
      '.eval-page .carte-entete .titre p { margin: 2px 0 0; font-size: 12px; color: var(--encre-3); }',
      '.eval-page .carte-entete .droite { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }',
      '.eval-page .entete-page { margin-bottom: 10px; }',
      '.eval-page .champ > label { font-size: 10px; }',
      '.eval-page .champ input, .eval-page .champ select { height: 32px; font-size: 13px; }',
      '.eval-sommaire { position: sticky; top: calc(var(--barre-h) + var(--sous-h) + 6px); z-index: 20; display: flex; align-items: center; gap: 14px; background: var(--noir-2); color: #fff; border-radius: var(--rayon); padding: 8px 14px; margin-bottom: 12px; overflow-x: auto; scrollbar-width: none; box-shadow: 0 6px 16px rgba(0,0,0,.18); }',
      '.eval-sommaire .veh { min-width: 180px; flex: 1 1 220px; }',
      '.eval-sommaire .veh .nom { font-weight: 700; font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      '.eval-sommaire .veh .sous { font-size: 11px; color: #9AA6B2; font-family: var(--mono); white-space: nowrap; }',
      '.eval-sommaire .item { flex: none; min-width: 72px; }',
      '.eval-sommaire .item .l { font-size: 9.5px; letter-spacing: .08em; text-transform: uppercase; color: #9AA6B2; font-weight: 600; white-space: nowrap; }',
      '.eval-sommaire .item .v { font-size: 15px; font-weight: 700; white-space: nowrap; }',
      '.eval-sommaire .item.fort .v { color: var(--vert-vif); font-size: 17px; }',
      '.eval-sommaire .item.pos .v { color: var(--vert-vif); } .eval-sommaire .item.neg .v { color: #F97066; }',
      '.eval-sommaire .sauts { margin-left: auto; display: flex; gap: 4px; flex: none; }',
      '.eval-sommaire .sauts a { color: #fff; font-size: 11.5px; padding: 4px 9px; border-radius: 6px; background: rgba(255,255,255,.1); white-space: nowrap; }',
      '.eval-sommaire .sauts a:hover { background: rgba(255,255,255,.22); text-decoration: none; }',
      '.eval-grille-vehicule { grid-template-columns: 1.6fr .7fr 1fr 1fr 1fr .9fr 1.5fr .8fr; gap: 10px 12px; }',
      '.eval-sous-vehicule { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; margin-top: 10px; }',
      '.eval-sous-vehicule:empty { display: none; }',
      '.eval-contexte { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 12.5px; color: var(--encre-2); }',
      '.eval-contexte .modele { font-weight: 600; color: var(--encre); }',
      '.eval-liens { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-left: auto; }',
      '.eval-liens .sep { color: var(--encre-4); font-size: 11.5px; margin-left: 4px; }',
      '.eval-liens a.btn.desactive { opacity: .55; pointer-events: none; }',
      '.eval-prix-grille { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 14px 22px; align-items: start; }',
      '.eval-prix-calc { display: flex; flex-direction: column; gap: 10px; }',
      '.eval-formule { display: flex; align-items: flex-end; gap: 8px; flex-wrap: wrap; }',
      '.eval-formule .champ { flex: 1 1 120px; min-width: 110px; }',
      '.eval-formule .op { height: 32px; display: flex; align-items: center; font-weight: 700; color: var(--encre-3); font-size: 16px; flex: none; }',
      '.eval-formule .op.rappel { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; border: 1px dashed var(--ligne-forte); border-radius: var(--rayon-s); padding: 0 10px; }',
      '.eval-champ-calcule input { background: var(--carte-2); font-weight: 600; }',
      '.eval-champ-detail input { border-color: var(--vert); background: var(--vert-clair); font-weight: 700; font-size: 15px; }',
      '.eval-detail-ligne { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; font-size: 12.5px; }',
      '.eval-detail-ligne .l { font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--encre-3); font-weight: 700; }',
      '.eval-detail-ligne .v { font-size: 18px; font-weight: 700; }',
      '.eval-cibles-titre { font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--encre-3); font-weight: 700; margin-bottom: 6px; }',
      '.eval-cibles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }',
      '.eval-cible { border: 1px solid var(--ligne); border-radius: var(--rayon-s); padding: 8px 10px; display: flex; flex-direction: column; gap: 2px; }',
      '.eval-cible .l { font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--encre-3); font-weight: 700; }',
      '.eval-cible .v { font-size: 17px; font-weight: 700; }',
      '.eval-cible .s { font-size: 11px; color: var(--encre-3); line-height: 1.35; }',
      '.eval-cible .s.pos { color: var(--vert); } .eval-cible .s.neg { color: var(--rouge); }',
      '.eval-cible .btn { align-self: flex-start; margin-top: 4px; }',
      '.eval-cible.agressif { box-shadow: inset 4px 0 0 var(--rouge); } .eval-cible.standard { box-shadow: inset 4px 0 0 var(--vert); background: var(--vert-clair); } .eval-cible.conservateur { box-shadow: inset 4px 0 0 var(--bleu); }',
      '.eval-attente.mini { padding: 14px; font-size: 12px; }',
      '.eval-pile { display: flex; flex-direction: column; gap: 12px; }',
      '.eval-note { margin: 0; font-size: 11.5px; color: var(--encre-3); line-height: 1.5; }',
      '#eval-detail-resume:not(:empty) { margin-top: 2px; }',
      '@media (max-width: 1200px) { .eval-grille-vehicule { grid-template-columns: repeat(4, minmax(0, 1fr)); } .eval-prix-grille { grid-template-columns: 1fr; } }',
      '@media (max-width: 900px) { .eval-cibles { grid-template-columns: 1fr; } .eval-grille-vehicule { grid-template-columns: repeat(2, minmax(0, 1fr)); } .eval-sommaire .sauts { display: none; } }',
      '.eval-resume { margin-bottom: 12px; }',
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
      '.eval-table tr.eval-moi td { background: var(--vert-clair); font-weight: 600; }',
      '.eval-table tr.eval-moi td:first-child { box-shadow: inset 3px 0 0 var(--vert); }',
      '.eval-table td.sous .mini { display: block; }',
      '.eval-table .sup { color: var(--rouge); } .eval-table .inf { color: var(--vert); }',
      '.eval-pied { display: flex; gap: 8px 14px; flex-wrap: wrap; align-items: center; margin-top: 10px; font-size: 11.5px; color: var(--encre-3); }',
      '.eval-attente { padding: 26px 16px; text-align: center; color: var(--encre-3); font-size: 13px; border: 1px dashed var(--ligne-forte); border-radius: var(--rayon-s); }',
      '.eval-attente .btn { margin-top: 10px; }',
      '.registre-cartes { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; margin-bottom: 12px; }',
      '.registre-carte { text-align: left; background: var(--carte); border: 1px solid var(--ligne); border-radius: var(--rayon); padding: 10px 12px 9px; cursor: pointer; display: flex; flex-direction: column; gap: 6px; box-shadow: var(--ombre); transition: border-color .12s, transform .12s; position: relative; overflow: hidden; }',
      '.registre-carte::before { content: \'\'; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--gris); }',
      '.registre-carte.vert::before { background: var(--vert); } .registre-carte.bleu::before { background: var(--bleu); } .registre-carte.violet::before { background: var(--violet); } .registre-carte.sombre::before { background: var(--noir-2); } .registre-carte.ambre::before { background: var(--ambre); } .registre-carte.toutes::before { background: linear-gradient(var(--vert), var(--noir-2)); }',
      '.registre-carte:hover { border-color: var(--ligne-forte); transform: translateY(-1px); }',
      '.registre-carte.actif { border-color: var(--vert); box-shadow: 0 0 0 2px rgba(0,136,64,.16); background: var(--vert-clair); }',
      '.registre-carte .haut { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }',
      '.registre-carte .nom { font-weight: 700; font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      '.registre-carte .n { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; line-height: 1; }',
      '.registre-carte .bas { display: flex; gap: 10px; flex-wrap: wrap; font-size: 11px; color: var(--encre-3); }',
      '.registre-carte .bas b { color: var(--encre); font-weight: 600; } .registre-carte .bas .pos b { color: var(--vert); } .registre-carte .bas .neg b { color: var(--rouge); }',
      '.registre-barre { margin-bottom: 12px; } .registre-barre .carte-corps { padding: 10px 14px; }',
      '.registre-outils { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }',
      '.registre-outils .recherche { flex: 1 1 240px; position: relative; display: flex; align-items: center; } .registre-outils .recherche > span { position: absolute; left: 10px; width: 14px; height: 14px; color: var(--encre-4); display: flex; } .registre-outils .recherche > span svg { width: 14px; height: 14px; } .registre-outils .recherche input { padding-left: 30px; height: 32px; width: 100%; }',
      '.registre-outils .compte { margin-left: auto; font-size: 12px; }',
      '.registre-corps { padding: 0 !important; }',
      '.registre-table .tableau { min-width: 1060px; border: none; border-radius: 0; box-shadow: none; }',
      '.registre-table td { padding: 8px 10px; }',
      '.registre-table td.num, .registre-table td.mono, .registre-table .registre-date { white-space: nowrap; }',
      '.registre-table .registre-date .mini { font-size: 11px; color: var(--encre-4); }',
      '.registre-table .registre-vehicule { display: flex; align-items: center; gap: 10px; min-width: 220px; }',
      '.registre-table .registre-vehicule .logo-marque { width: 34px; height: 34px; flex: none; border: 1px solid var(--ligne); border-radius: 8px; display: grid; place-items: center; background: #fff; font-size: 10px; font-weight: 700; color: var(--encre-3); overflow: hidden; }',
      '.registre-table .registre-vehicule .logo-marque img { width: 24px; height: 24px; object-fit: contain; }',
      '.registre-table .registre-vehicule .nom { font-weight: 600; }',
      '.registre-table .registre-vin { font-size: 11.5px; color: var(--encre-3); }',
      '.registre-table .registre-detail { font-weight: 700; }',
      '.registre-table .registre-par { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; }',
      '.registre-table .registre-par .avatar { width: 24px; height: 24px; border-radius: 50%; background: var(--noir-2); color: #fff; font-size: 10px; font-weight: 700; display: grid; place-items: center; }',
      '.registre-table tfoot td { font-weight: 600; background: var(--carte-2); border-top: 1px solid var(--ligne); }',
      '.registre-table th.registre-triable { cursor: pointer; user-select: none; } .registre-table th.registre-triable.actif { color: var(--vert); }',
      '.registre-table tr.cliquable:focus-visible td { box-shadow: inset 0 0 0 2px rgba(0,136,64,.35); outline: none; }',
      '@media (max-width: 900px) {',
      '  .eval-stats { grid-template-columns: 1fr; }',
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
    this.comparablesCharges = [];           // comparables manuels d'une ancienne évaluation, renvoyés tels quels
    this.pays = AMX.memo.lire('eval_pays', 'ca') === 'us' ? 'us' : 'ca';
    this.analyses = { ca: null, us: null };   // réponses du serveur par pays
    this.enCours = { ca: false, us: false };
    this.genAnalyse = { ca: 0, us: 0 };       // une analyse plus récente (ou un autre NIV) rend la réponse caduque
    this.portee = { ca: AMX.memo.lire('eval_portee_ca', 'local') === 'national' ? 'national' : 'local', us: AMX.memo.lire('eval_portee_us', 'national') === 'local' ? 'local' : 'national' };
    this.filtres = { memeVersion: false, kmProche: false, tri: 'prix' };
    this.derniereSauvegarde = null;           // bloc `marche` d'une évaluation rechargée

    this.construire();
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

    // --- Sommaire fixe (sous la barre) : les chiffres clés + navigation ----
    this.elSommaire = h('div.eval-sommaire#eval-sommaire');

    // --- Véhicule : une seule rangée dense -------------------------------
    var cNiv = champ('e-niv', 'NIV', { mono: true, vin: true, placeholder: '17 caractères' });
    var cAnnee = champ('e-annee', 'Année', { type: 'number', inputmode: 'numeric' });
    var cMarque = champ('e-marque', 'Marque');
    var cModele = champ('e-modele', 'Modèle');
    var cVersion = champ('e-version', 'Version', { placeholder: 'LT, SLE, Limited…' });
    var cKm = champ('e-km', 'Kilométrage', { type: 'number', inputmode: 'numeric' });
    var cTaux = champ('e-taux-km', 'Ajustement $/km', { type: 'number', step: '0.01', value: '0.10' });
    this.elConcession = h('select#e-concession', Object.keys(AMX.CONCESSIONS).map(function (k) {
      return h('option', { value: k, selected: k === 'stemarie' ? true : undefined, text: AMX.CONCESSIONS[k] });
    }));
    var cConcession = h('div.champ', [h('label', { 'for': 'e-concession', text: 'Concession (marché local)' }), this.elConcession]);
    this.elNiv = cNiv.input; this.elMarque = cMarque.input; this.elModele = cModele.input; this.elVersion = cVersion.input;
    this.elAnnee = cAnnee.input; this.elKm = cKm.input; this.elTaux = cTaux.input;
    this.elContexte = h('div.eval-contexte.cache');
    this.elLiens = h('div.eval-liens');
    var vehicule = h('div.carte#sec-vehicule', [h('div.carte-corps', [
      h('div.grille.eval-grille-vehicule', [cNiv.el, cAnnee.el, cMarque.el, cModele.el, cVersion.el, cKm.el, cConcession, cTaux.el]),
      h('div.eval-sous-vehicule', [this.elContexte, this.elLiens])
    ])]);

    // --- Prix : achat + frais = payé ; payé + recon + marge = détail -------
    var cAchat = champ('e-prix-achat', 'Prix d\'achat ($)', { type: 'number', inputmode: 'numeric', placeholder: 'Enchère / vendeur' });
    var cFrais = champ('e-frais', 'Frais d\'achat ($)', { type: 'number', inputmode: 'numeric', placeholder: 'Encan, transport, CARFAX' });
    var cPaye = champ('e-prix-paye', 'Prix payé ($)', { type: 'number', inputmode: 'numeric', placeholder: '= achat + frais' });
    var cRecon = champ('e-recon', 'Reconditionnement ($)', { type: 'number', inputmode: 'numeric', placeholder: 'Carrosserie, mécanique, esthétique' });
    var cMarge = champ('e-marge', 'Marge visée ($)', { type: 'number', inputmode: 'numeric', value: AMX.memo.lire('eval_marge', '2000') });
    var cPrix = champ('e-prix', 'Prix de détail ($)', { type: 'number', inputmode: 'numeric', placeholder: '= payé + recon + marge' });
    this.elAchat = cAchat.input; this.elFrais = cFrais.input; this.elPaye = cPaye.input; this.elRecon = cRecon.input; this.elMarge = cMarge.input; this.elPrix = cPrix.input;
    cPaye.el.classList.add('eval-champ-calcule'); cPrix.el.classList.add('eval-champ-calcule', 'eval-champ-detail');
    this.elDetailResume = h('div#eval-detail-resume');
    this.elCibles = h('div#eval-cibles');
    var detail = h('div.carte#sec-prix', [h('div.carte-corps', [h('div.eval-prix-grille', [
      h('div.eval-prix-calc', [
        h('div.eval-formule', [cAchat.el, h('span.op', '+'), cFrais.el, h('span.op', '='), cPaye.el]),
        h('div.eval-formule', [h('span.op.rappel', 'payé'), h('span.op', '+'), cRecon.el, h('span.op', '+'), cMarge.el, h('span.op', '='), cPrix.el]),
        this.elDetailResume
      ]),
      this.elCibles
    ])])]);
    [this.elAchat, this.elFrais].forEach(function (el) { el.addEventListener('input', function () { self.recalculerDetail('achat'); }); });
    this.elPaye.addEventListener('input', function () { self.recalculerDetail('paye'); });
    this.elRecon.addEventListener('input', function () { self.recalculerDetail('couts'); });
    this.elMarge.addEventListener('input', function () { self.recalculerDetail('marge'); });
    this.elNiv.addEventListener('blur', function () {
      var vin = self.elNiv.value.trim();
      if (vin.length < 11) return;
      if (vin !== self.vinCharge) self.charger(vin);
    });
    this.elNiv.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); self.elNiv.blur(); } });
    this.elNiv.addEventListener('input', function () { self.rendreLiens(); });
    [this.elMarque, this.elModele, this.elAnnee].forEach(function (el) { el.addEventListener('input', AMX.debounce(function () { self.rendreSommaire(); }, 200)); });
    this.elKm.addEventListener('input', function () { self.rendreMarche(); });
    this.elPrix.addEventListener('input', function () { self.recalculerDetail('prix'); });
    this.elVersion.addEventListener('input', AMX.debounce(function () { if (self.analyses[self.pays]) self.rendreMarche(); }, 200));
    this.elConcession.addEventListener('change', function () { AMX.memo.ecrire('eval_concession', self.elConcession.value); self.oublierAnalyses(); });
    if (AMX.CONCESSIONS[AMX.memo.lire('eval_concession', '')]) this.elConcession.value = AMX.memo.lire('eval_concession', '');

    // --- Analyse de marché ----------------------------------------------
    this.btnCa = h('button', { type: 'button', text: 'Canada', onclick: function () { self.choisirPays('ca'); } });
    this.btnUs = h('button', { type: 'button', text: 'États-Unis', onclick: function () { self.choisirPays('us'); } });
    this.elSegment = h('div.segment#eval-pays', [this.btnCa, this.btnUs]);
    this.btnRafraichir = h('button.btn.petit', { type: 'button', title: 'Relancer la recherche', html: I.rafraichir + '<span>Relancer</span>', onclick: function () { self.analyser(self.pays, true); } });
    this.elPortee = h('select.saisie#eval-portee', { 'aria-label': 'Portée géographique', style: { height: '28px', width: 'auto' } }, [
      h('option', { value: 'local', text: 'Autour de la concession (160 km)' }),
      h('option', { value: 'national', text: 'Tout le pays' })
    ]);
    this.elPortee.addEventListener('change', function () {
      self.portee[self.pays] = self.elPortee.value === 'national' ? 'national' : 'local';
      AMX.memo.ecrire('eval_portee_' + self.pays, self.portee[self.pays]);
      self.analyses[self.pays] = null; self.genAnalyse[self.pays]++; self.enCours[self.pays] = false;
      if (self.parametresPrets()) self.analyser(self.pays, false); else self.rendreMarche();
    });
    this.elMarche = h('div#eval-marche');
    var marche = carte(
      h('div.titre', [h('h2', 'Analyse de marché'), h('p', 'Annonces actives de concessionnaires et ventes déduites des 90 derniers jours (MarketCheck).')]),
      [this.elMarche],
      h('div.droite', [this.elSegment, this.elPortee, this.btnRafraichir])
    );
    marche.id = 'sec-marche';
    this.majSegment();

    this.elTaux.addEventListener('input', function () { self.rendreMarche(); });

    this.el = h('div.page.eval-page', [entete, this.elSommaire, vehicule, detail, marche]);
    this.rendreSommaire();
    this.rendreLiens();
  };

  /* --------------------------- Prix de détail ---------------------------- */
  // source : 'couts' (payé ou recon changé), 'marge', 'prix' (détail tapé à la main).
  // source : 'achat' (achat ou frais changé), 'paye' (payé tapé directement),
  // 'couts' (recon), 'marge', 'prix' (détail tapé à la main → marge déduite).
  Evaluation.prototype.recalculerDetail = function (source) {
    var achat = nombre(this.elAchat.value), frais = nombre(this.elFrais.value) || 0;
    if (source === 'achat') {
      if (achat !== null) this.elPaye.value = String(Math.round(achat + frais));
      else if (!this.elFrais.value.trim()) this.elPaye.value = '';
    } else if (source === 'paye') {
      var payeTape = nombre(this.elPaye.value);
      if (payeTape !== null) this.elAchat.value = String(Math.round(payeTape - frais)); else this.elAchat.value = '';
    }
    var paye = nombre(this.elPaye.value), recon = nombre(this.elRecon.value) || 0, marge = nombre(this.elMarge.value), prix = nombre(this.elPrix.value);
    if (source === 'prix') {
      if (paye !== null && prix !== null) this.elMarge.value = String(Math.round(prix - paye - recon));
    } else if (paye !== null && marge !== null) {
      this.elPrix.value = String(Math.round(paye + recon + marge));
    }
    if (source === 'marge' && marge !== null) AMX.memo.ecrire('eval_marge', String(marge));
    this.rendreMarche();
  };

  Evaluation.prototype.rendrePrixDetail = function () {
    var self = this;
    AMX.vider(this.elDetailResume); AMX.vider(this.elCibles);
    var achat = nombre(this.elAchat.value), frais = nombre(this.elFrais.value) || 0, paye = nombre(this.elPaye.value), recon = nombre(this.elRecon.value) || 0, marge = nombre(this.elMarge.value), prix = nombre(this.elPrix.value);
    var a = this.analyses[this.pays], c = (a && a.ok) ? this.calculs(a) : null;
    if (prix !== null) {
      var pos = c ? c.marchePct : null;
      this.elDetailResume.appendChild(h('div.eval-detail-ligne', [
        h('span.l', { text: 'Prix de détail' }), h('span.v.num', { text: fmt(prix) }),
        paye !== null ? h('span.doux', { text: (achat !== null ? fmt(achat) + ' achat + ' + fmt(frais) + ' frais = ' : '') + fmt(paye) + ' payé · + ' + fmt(recon) + ' recon · + ' + fmt(marge === null ? prix - paye - recon : marge) + ' marge' }) : null,
        c ? h('span.puce' + (pos === null ? '' : (pos <= 0.97 ? '.ok' : (pos <= 1.03 ? '.attention' : '.alerte'))), { text: 'marché ' + pct(pos) + (c.rang ? ' · rang ' + c.rang + '/' + c.rangSur : '') }) : h('span.doux', { text: 'Lancez l\'analyse pour situer ce prix.' })
      ]));
    } else if (paye === null && achat === null) {
      this.elDetailResume.appendChild(h('p.eval-note', { text: 'Prix d\'achat, frais et reconditionnement se remplissent depuis la fiche d\'achat quand elle existe ; sinon tapez-les. La marge visée est mémorisée d\'une évaluation à l\'autre.' }));
    }
    if (this.ficheSource) this.elDetailResume.appendChild(h('p.eval-note', [h('span', { text: 'Montants repris de la fiche d\'achat (' + this.ficheSource + '). ' }), h('a.petit', { href: AMX.lien('achat', '', { vin: this.vinCourant }), text: 'Ouvrir la fiche pour corriger les coûts' })]));
    this.elCibles.appendChild(h('div.eval-cibles-titre', { text: c && c.standard ? 'Prix de marché, ramenés à votre kilométrage' : 'Prix de marché' }));
    if (c && c.standard) {
      var cible = function (nom, v, cls) {
        var maxAchat = (v !== null && marge !== null) ? v - recon - marge - frais : null;
        var margeSi = (v !== null && paye !== null) ? v - paye - recon : null;
        return h('div.eval-cible.' + cls, [
          h('div.l', { text: nom }), h('div.v.num', { text: fmt(v) }),
          h('div.s', { text: maxAchat !== null ? 'Achat max. ' + fmt(maxAchat) + ' pour garder ' + fmt(marge) + ' de marge' : 'Entrez une marge pour le prix d\'achat maximal' }),
          margeSi !== null ? h('div.s.' + (margeSi >= (marge || 0) ? 'pos' : 'neg'), { text: 'Au prix payé : marge ' + fmt(margeSi) }) : null,
          h('button.btn.petit', { type: 'button', text: 'Prendre ce prix', onclick: function () { self.elPrix.value = String(Math.round(v)); self.recalculerDetail('prix'); } })
        ]);
      };
      this.elCibles.appendChild(h('div.eval-cibles', [cible('Agressif', c.agressif, 'agressif'), cible('Standard', c.standard, 'standard'), cible('Conservateur', c.conservateur, 'conservateur')]));
    } else {
      this.elCibles.appendChild(h('div.eval-attente.mini', { text: this.enCours[this.pays] ? 'Analyse en cours…' : 'Les prix agressif / standard / conservateur apparaissent ici après l\'analyse de marché.' }));
    }
    this.rendreSommaire();
  };

  // Bandeau collant : chiffres clés + liens vers les sections.
  Evaluation.prototype.rendreSommaire = function () {
    if (!this.elSommaire) return;
    AMX.vider(this.elSommaire);
    var veh = [this.elAnnee.value, this.elMarque.value, this.elModele.value, this.elVersion.value].filter(Boolean).join(' ');
    var km = nombre(this.elKm.value), paye = nombre(this.elPaye.value), recon = nombre(this.elRecon.value), marge = nombre(this.elMarge.value), prix = nombre(this.elPrix.value);
    var a = this.analyses[this.pays], c = (a && a.ok) ? this.calculs(a) : null;
    var pos = c ? c.marchePct : null;
    function item(l, v, cls) { return h('div.item' + (cls ? '.' + cls : ''), [h('div.l', { text: l }), h('div.v.num', { text: v })]); }
    this.elSommaire.appendChild(h('div.veh', [h('div.nom', { text: veh || 'Aucun véhicule' }), h('div.sous', { text: [this.vinCourant || '', km !== null ? fmtKm(km) : ''].filter(Boolean).join(' · ') })]));
    this.elSommaire.appendChild(item('Payé', fmt(paye)));
    this.elSommaire.appendChild(item('Recon', fmt(recon)));
    this.elSommaire.appendChild(item('Marge', fmt(marge), marge !== null ? (marge >= 0 ? 'pos' : 'neg') : ''));
    this.elSommaire.appendChild(item('Détail', fmt(prix), 'fort'));
    this.elSommaire.appendChild(item('Marché std', c ? fmt(c.standard) : '—'));
    this.elSommaire.appendChild(item('Marché %', pct(pos), pos === null ? '' : (pos <= 0.97 ? 'pos' : (pos <= 1.03 ? '' : 'neg'))));
    this.elSommaire.appendChild(item('Rang', c && c.rang ? c.rang + '/' + c.rangSur : '—'));
    this.elSommaire.appendChild(h('nav.sauts', [['sec-vehicule', 'Véhicule'], ['sec-prix', 'Prix'], ['sec-marche', 'Marché']].map(function (x) {
      return h('a', { href: '#', text: x[1], onclick: function (e) { e.preventDefault(); var el = document.getElementById(x[0]); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
    })));
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
    if (this.elPortee) this.elPortee.value = this.portee[this.pays];
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
    var p = { marche: 1, pays: pays, portee: this.portee[pays], annee: this.elAnnee.value.trim(), marque: this.elMarque.value.trim(), modele: this.elModele.value.trim(), version: this.elVersion.value.trim(), km: this.elKm.value.trim(), concession: this.elConcession.value };
    if (/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) p.vin = vin;
    return p;
  };
  Evaluation.prototype.analyser = function (pays, manuel) {
    var self = this;
    pays = pays === 'us' ? 'us' : 'ca';
    if (!this.parametresPrets()) {
      var vinSaisi = this.elNiv.value.trim().toUpperCase();
      if (/^[A-HJ-NPR-Z0-9]{11,17}$/.test(vinSaisi)) {
        // Un NIV mais pas encore de modèle : on décode d'abord, puis on analyse.
        this.vinCourant = vinSaisi;
        return this.decoder(vinSaisi).then(function () { if (self.parametresPrets()) return self.analyser(pays, manuel); if (manuel) AMX.toast('Le décodeur ne connaît pas ce NIV — remplissez marque, modèle et année.', 'attention'); });
      }
      if (manuel) { AMX.toast('Entrez un NIV (ou l\'année, la marque et le modèle).', 'attention'); this.elNiv.focus(); }
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
    this.rendrePrixDetail();

    if (this.enCours[pays]) {
      this.elMarche.appendChild(h('div.chargement', [h('span', { html: I.rafraichir }), 'Recherche des annonces ' + (pays === 'us' ? 'américaines' : 'canadiennes') + ' et des ventes récentes…']));
      return;
    }
    if (!a) {
      var prets = this.parametresPrets();
      var attente = h('div.eval-attente', [
        h('div', { text: prets ? 'Prêt à analyser ' + [this.elAnnee.value, this.elMarque.value, this.elModele.value, this.elVersion.value].filter(Boolean).join(' ') + ' sur le marché ' + (pays === 'us' ? 'américain' : 'canadien') + (self.portee[pays] === 'national' ? ' (tout le pays)' : ' (autour de la concession)') + '.' : 'Décodez le NIV (ou entrez l\'année, la marque et le modèle), puis lancez l\'analyse.' }),
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

    // Deux cartes de statistiques
    function mini(l, v, m) { return h('div', [h('div.l', { text: l }), h('div.v', { text: v }), m ? h('div.m', { text: m }) : null]); }
    var statAct = h('div.eval-stat', [
      h('h3', [h('span.n', { text: String(act.n || 0) }), 'véhicules similaires sur le marché', h('span.mini.doux', { text: a.portee === 'national' ? ' · ' + (a.lieu || 'tout le pays') + ((act.annonces || []).length < (act.n || 0) ? ' — les ' + (act.annonces || []).length + ' annonces les plus récentes sont listées' : '') : ' · rayon ' + (a.rayonKm || '—') + ' km autour de ' + (a.lieu || '—') })]),
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

    var pied = [h('span', { text: 'Source : MarketCheck · ' + (a.lieu || (pays === 'us' ? 'États-Unis' : 'Canada')) + ', prix en ' + devise }), h('span', { text: 'Reçu ' + AMX.fmtDate(a.genereLe || new Date().toISOString(), true) })];
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

  /* ------------------------------ Données ------------------------------- */
  Evaluation.prototype.collecter = function () {
    var a = this.analyses[this.pays], marche = null;
    if (a && a.ok) {
      var c = this.calculs(a);
      marche = {
        pays: this.pays, portee: a.portee || this.portee[this.pays], devise: a.devise, lieu: a.lieu, rayonKm: a.rayonKm, genereLe: a.genereLe || new Date().toISOString(),
        agressif: c.agressif, standard: c.standard, conservateur: c.conservateur, marchePct: c.marchePct, rang: c.rang || null, rangSur: c.rangSur || null,
        actifs: a.actifs ? { n: a.actifs.n, prixMoy: a.actifs.prix && a.actifs.prix.moyenne, prixMed: a.actifs.prix && a.actifs.prix.mediane, kmMoy: a.actifs.km && a.actifs.km.moyenne, joursMoy: a.actifs.jours && a.actifs.jours.moyenne } : null,
        vendus: a.vendus ? { n90: a.vendus.n90, parMois: a.vendus.parMois, prixMoy: a.vendus.prix && a.vendus.prix.moyenne, kmMoy: a.vendus.km && a.vendus.km.moyenne } : null,
        filtres: Object.assign({}, this.filtres)
      };
    } else if (this.derniereSauvegarde) marche = this.derniereSauvegarde;
    return {
      marque: this.elMarque.value, modele: this.elModele.value, annee: this.elAnnee.value, version: this.elVersion.value,
      km: this.elKm.value, tauxKm: this.elTaux.value, prixVente: this.elPrix.value, prixAchat: this.elAchat.value, frais: this.elFrais.value, prixPaye: this.elPaye.value, recon: this.elRecon.value, marge: this.elMarge.value, concession: this.elConcession.value,
      comparables: this.comparablesCharges || [],
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
    if (data.prixPaye) this.elPaye.value = data.prixPaye;
    if (data.prixAchat) this.elAchat.value = data.prixAchat;
    if (data.frais !== undefined && data.frais !== '') this.elFrais.value = data.frais;
    if (!this.elAchat.value && data.prixPaye) this.elAchat.value = data.prixPaye;
    if (data.recon !== undefined && data.recon !== '') this.elRecon.value = data.recon;
    if (data.marge !== undefined && data.marge !== '') this.elMarge.value = data.marge;
    if (data.concession && AMX.CONCESSIONS[data.concession]) this.elConcession.value = data.concession;
    this.comparablesCharges = Array.isArray(data.comparables) ? data.comparables.filter(function (c) { return c && (c.prix || c.source); }) : [];
    this.derniereSauvegarde = (data.marche && typeof data.marche === 'object') ? data.marche : null;
    if (this.derniereSauvegarde && this.derniereSauvegarde.pays) { this.pays = this.derniereSauvegarde.pays === 'us' ? 'us' : 'ca'; this.majSegment(); }
    this.analyses = { ca: null, us: null };
    this.enCours = { ca: false, us: false };
    this.genAnalyse.ca++; this.genAnalyse.us++;
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
    ['elMarque', 'elModele', 'elAnnee', 'elVersion', 'elKm', 'elPrix', 'elPaye', 'elRecon', 'elAchat', 'elFrais'].forEach(function (k) { self[k].value = ''; });
    this.ficheSource = '';
    this.comparablesCharges = [];
    this.derniereSauvegarde = null;
    this.analyses = { ca: null, us: null };
    this.enCours = { ca: false, us: false };
    this.genAnalyse.ca++; this.genAnalyse.us++;
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
        if (!self.parametresPrets() || !self.elVersion.value.trim()) self.decoder(vin).then(function () { if (gen === self.generation && self.parametresPrets() && !d.donnees.marche) self.analyser(self.pays, false); });
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
    if (v.compagnie === 'HAWKS') this.elConcession.value = 'hawkesbury';
    else if (v.compagnie === 'STM' && (this.elConcession.value === 'hawkesbury' || !this.elConcession.value)) this.elConcession.value = 'stemarie';
  };

  Evaluation.prototype.decoderDepuisChamp = function () {
    var vin = this.elNiv.value.trim();
    if (vin.length < 11) { AMX.toast('Entrez un NIV d\'au moins 11 caractères pour le décoder.', 'attention'); this.elNiv.focus(); return; }
    this.vinCourant = vin;
    this.rendreContexte(); this.rendreLiens();
    this.decoder(vin);
  };

  // Décodage : le décodeur du serveur d'abord (Decodeur.gs — année, marque,
  // modèle, version, feuille Decodage), NHTSA depuis le navigateur en repli ;
  // en parallèle, la fiche d'achat fournit le kilométrage (et le reste si le
  // décodeur ne répond pas). Renvoie une promesse tenue quand tout est posé.
  Evaluation.prototype.decoder = function (vin) {
    var self = this, btn = this.btnDecoder;
    vin = String(vin || '').trim().toUpperCase();
    btn.classList.add('occupe');
    this.etat('Décodage du véhicule…');
    var serveur = AMX.get({ decoder: vin }).then(function (d) {
      if (d && d.ok && d.marque) return { make: d.marque, model: d.modele, year: d.annee, trim: d.version, source: 'serveur' };
      return decoderVin(vin).then(function (r) { return r ? Object.assign(r, { source: 'nhtsa' }) : null; });
    }).catch(function () { return decoderVin(vin).then(function (r) { return r ? Object.assign(r, { source: 'nhtsa' }) : null; }); });
    var fiche = AMX.ficheDe(vin).catch(function () { return null; });
    return Promise.all([serveur, fiche]).then(function (res) {
      if (self.vinCourant !== vin) return;
      var r = res[0], f = res[1] || {};
      if (r) {
        if (r.make) self.elMarque.value = r.make;
        if (r.model) self.elModele.value = r.model;
        if (r.year) self.elAnnee.value = r.year;
        if (r.trim) self.elVersion.value = r.trim;
      }
      // La fiche d'achat complète ce qui manque (et donne le km).
      if (!self.elMarque.value.trim() && f['f-marque']) self.elMarque.value = f['f-marque'];
      if (!self.elModele.value.trim() && f['f-modele']) self.elModele.value = f['f-modele'];
      if (!self.elAnnee.value.trim() && f['f-annee']) self.elAnnee.value = String(f['f-annee']).replace(/[^0-9]/g, '');
      if (!self.elKm.value.trim() && f['f-km']) self.elKm.value = String(f['f-km']).replace(/[^0-9]/g, '');
      // Coûts de la fiche : acquisition (achat + frais) → prix payé ; remise en état → reconditionnement.
      var somme = function (cles) { var t = 0, vu = false; cles.forEach(function (k) { var n = nombre(f[k]); if (n !== null) { t += n; vu = true; } }); return vu ? Math.round(t) : null; };
      var achatFiche = somme(['f-prixachat']);
      var fraisFiche = somme(['f-fraisencan', 'f-fraisautres', 'f-fraistransport', 'f-carfax']);
      var remise = somme(['f-accessoires', 'f-carrosserie', 'f-service', 'f-lavage', 'f-lavagelivraison', 'f-enregistrementcout', 'f-adj1montant', 'f-adj2montant', 'f-presafetymontant']);
      var repris = [];
      if (!self.elAchat.value.trim() && achatFiche) { self.elAchat.value = String(achatFiche); repris.push('achat'); }
      if (!self.elFrais.value.trim() && fraisFiche) { self.elFrais.value = String(fraisFiche); repris.push('frais'); }
      if (!self.elRecon.value.trim() && remise) { self.elRecon.value = String(remise); repris.push('reconditionnement'); }
      if (repris.length) { self.ficheSource = repris.join(', '); self.recalculerDetail('achat'); }
      else if (!self.elPrix.value.trim()) self.recalculerDetail('couts');
      self.rendreSommaire();
      if (!r && !self.parametresPrets()) AMX.toast('Décodage indisponible pour ce NIV — remplissez marque, modèle et année à la main.', 'attention');
      else if (r) self.etat('Véhicule décodé : ' + [self.elAnnee.value, self.elMarque.value, self.elModele.value, self.elVersion.value].filter(Boolean).join(' ') + (f['f-km'] ? ' · ' + AMX.fmtNombre(parseInt(self.elKm.value, 10)) + ' km (fiche d\'achat)' : '') + '.');
      self.oublierAnalyses();
    }).then(function () { btn.classList.remove('occupe'); }, function () { btn.classList.remove('occupe'); });
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


  /* =====================================================================
     Registre des évaluations (Outils › Registre d'évaluations)
     GET ?evaluations=1[&concession=] → { ok, evaluations: [...], parConcession, total }
     Une ligne par véhicule évalué ; filtre par concession (toutes les
     concessions du groupe, y compris celles qu'on ajoute), recherche, tri,
     export Excel ; cliquer une ligne ouvre l'évaluation.
     ===================================================================== */
  function Registre(ctx) {
    var self = this;
    injecterCss();
    this.liste = null; this.parConcession = {}; this.erreur = ''; this.refus = '';
    this.generation = 0;
    this.concession = AMX.memo.lire('registre_eval_concession', '');
    if (this.concession && !AMX.CONCESSIONS[this.concession]) this.concession = '';
    this.recherche = '';
    this.tri = { cle: 'dateMaj', desc: true };
    this.construire();
    this.charger(false);
  }
  Registre.prototype.demonter = function () { this.generation++; };
  Registre.prototype.naviguer = function () {};

  var COL_REGISTRE = [
    { cle: 'dateMaj', libelle: 'Date', valeur: function (r) { return r.dateMaj || ''; } },
    { cle: 'vehicule', libelle: 'Véhicule', valeur: function (r) { return [r.annee, r.marque, r.modele, r.version].filter(Boolean).join(' '); } },
    { cle: 'vin', libelle: 'NIV' },
    { cle: 'concession', libelle: 'Concession', valeur: function (r) { return AMX.CONCESSIONS[r.concession] || r.concession || ''; } },
    { cle: 'prixPaye', libelle: 'Payé', num: true, valeur: function (r) { return nombre(r.prixPaye); } },
    { cle: 'recon', libelle: 'Recon', num: true, valeur: function (r) { return nombre(r.recon); } },
    { cle: 'marge', libelle: 'Marge', num: true, valeur: function (r) { return nombre(r.marge); } },
    { cle: 'prixVente', libelle: 'Prix de détail', num: true, valeur: function (r) { return nombre(r.prixVente); } },
    { cle: 'standard', libelle: 'Marché std', num: true, valeur: function (r) { return r.standard; } },
    { cle: 'marchePct', libelle: 'Marché %', num: true, valeur: function (r) { return r.marchePct; } },
    { cle: 'par', libelle: 'Évaluateur', valeur: function (r) { return (r.par || '').split('@')[0]; } }
  ];

  var PERIODES_REGISTRE = [['tout', 'Tout'], ['j30', '30 jours'], ['trimestre', 'Trimestre'], ['annee', 'Année']];
  function debutPeriode(cle) {
    var now = new Date(), y = now.getFullYear(), m = now.getMonth();
    if (cle === 'j30') { var d = new Date(now); d.setDate(d.getDate() - 30); return d.getTime(); }
    if (cle === 'trimestre') return new Date(y, Math.floor(m / 3) * 3, 1).getTime();
    if (cle === 'annee') return new Date(y, 0, 1).getTime();
    return -Infinity;
  }
  function nomCourt(cle) { return (AMX.CONCESSIONS[cle] || cle || '').replace(' Automobiles Ltée', '').replace(' Chevrolet Buick Cadillac', ' Chevrolet'); }
  var COULEUR_CONCESSION = { stemarie: 'vert', hawkesbury: 'bleu', vwbrossard: 'violet', bmwsherbrooke: 'sombre', hyundailongueuil: 'ambre' };
  function depuis(iso) {
    var t = new Date(iso).getTime(); if (isNaN(t)) return '';
    var j = Math.floor((Date.now() - t) / 86400000);
    if (j <= 0) return 'aujourd\'hui'; if (j === 1) return 'hier'; if (j < 30) return 'il y a ' + j + ' j'; if (j < 365) return 'il y a ' + Math.round(j / 30) + ' mois'; return 'il y a ' + Math.round(j / 365) + ' an' + (j >= 730 ? 's' : '');
  }

  Registre.prototype.construire = function () {
    var self = this;
    this.periode = AMX.memo.lire('registre_eval_periode', 'tout');
    if (!PERIODES_REGISTRE.some(function (p) { return p[0] === self.periode; })) this.periode = 'tout';
    this.acheteur = '';
    this.elEtat = h('p', { text: 'Chargement du registre…' });
    this.btnRafraichir = h('button.btn', { type: 'button', html: I.rafraichir + '<span>Rafraîchir</span>', onclick: function () { self.charger(true); } });
    this.btnExport = h('button.btn', { type: 'button', html: I.telecharger + '<span>Exporter Excel</span>', onclick: function () { self.exporter(); } });
    this.btnNouvelle = h('a.btn.primaire', { href: AMX.lien('outils', 'evaluation', {}), html: I.plus + '<span>Nouvelle évaluation</span>' });
    var entete = h('div.entete-page', [
      h('div', { style: { minWidth: 0 } }, [h('h1', 'Registre des évaluations'), this.elEtat]),
      h('div.actions', [this.btnRafraichir, this.btnExport, this.btnNouvelle])
    ]);
    this.elCartes = h('div.registre-cartes#registre-kpis');
    this.elRecherche = h('input.saisie#registre-recherche', { type: 'search', placeholder: 'NIV, modèle, version, acheteur…', autocomplete: 'off', oninput: AMX.debounce(function (e) { self.recherche = e.target.value; self.rendreTable(); }, 120) });
    this.elSegment = h('div.segment', { role: 'group', 'aria-label': 'Période' });
    this.elAcheteur = h('select.saisie#registre-acheteur', { 'aria-label': 'Évaluateur', style: { height: '32px', width: 'auto' } });
    this.elAcheteur.addEventListener('change', function () { self.acheteur = self.elAcheteur.value; self.rendreTable(); });
    this.elCompte = h('span.compte.doux');
    var barre = h('div.carte.registre-barre', [h('div.carte-corps', [h('div.registre-outils', [
      h('div.recherche', [h('span', { html: I.recherche }), this.elRecherche]), this.elSegment, this.elAcheteur, this.elCompte
    ])])]);
    this.elTable = h('div.eval-table.registre-table');
    this.elVide = h('div');
    this.el = h('div.page.eval-page.registre-page', [entete, this.elCartes, barre, this.elVide, h('div.carte', [h('div.carte-corps.registre-corps', [this.elTable])])]);
  };

  Registre.prototype.charger = function (manuel) {
    var self = this, gen = ++this.generation;
    if (manuel) this.btnRafraichir.classList.add('occupe');
    return AMX.get({ evaluations: 1 }).then(function (d) {
      if (gen !== self.generation) return;
      self.btnRafraichir.classList.remove('occupe');
      if (d && d.refuse) { self.refus = d.erreur || 'Accès refusé.'; self.rendre(); return; }
      if (!d || !d.ok) throw new Error((d && (d.erreur || d.message)) || 'Réponse inattendue du serveur');
      self.liste = d.evaluations || []; self.parConcession = d.parConcession || {}; self.erreur = ''; self.refus = '';
      self.rendre();
      if (manuel) AMX.toast('Registre mis à jour — ' + self.liste.length + ' évaluation' + (self.liste.length > 1 ? 's' : ''), 'ok');
    }).catch(function (e) {
      if (gen !== self.generation) return;
      self.btnRafraichir.classList.remove('occupe');
      self.erreur = AMX.erreurTexte(e); self.rendre();
      AMX.toast('Impossible de charger le registre — ' + self.erreur, 'erreur');
    });
  };

  // Lignes de la période et de l'évaluateur choisis (la concession et la recherche s'appliquent ensuite).
  Registre.prototype.base = function () {
    var self = this, debut = debutPeriode(this.periode);
    return (this.liste || []).filter(function (r) { var t = new Date(r.dateMaj).getTime(); return (isNaN(t) || t >= debut) && (!self.acheteur || (r.par || '') === self.acheteur); });
  };
  Registre.prototype.filtrees = function () {
    var self = this, q = this.recherche.trim().toUpperCase();
    return this.base().filter(function (r) {
      if (self.concession && r.concession !== self.concession) return false;
      if (!q) return true;
      return [r.vin, r.marque, r.modele, r.version, r.annee, r.par, AMX.CONCESSIONS[r.concession]].join(' ').toUpperCase().indexOf(q) >= 0;
    });
  };
  function agregerRegistre(lignes) {
    var n = lignes.length, paye = 0, detail = 0, marge = 0, nMarge = 0, pct = 0, nPct = 0;
    lignes.forEach(function (r) { var p = nombre(r.prixPaye), d = nombre(r.prixVente), m = nombre(r.marge); if (p !== null) paye += p; if (d !== null) detail += d; if (m !== null) { marge += m; nMarge++; } if (r.marchePct) { pct += r.marchePct; nPct++; } });
    return { n: n, paye: paye, detail: detail, marge: marge, margeMoy: nMarge ? marge / nMarge : null, pctMoy: nPct ? pct / nPct : null };
  }

  Registre.prototype.rendre = function () {
    var self = this;
    AMX.vider(this.elCartes); AMX.vider(this.elSegment); AMX.vider(this.elVide);
    if (this.refus) { this.elEtat.textContent = this.refus; this.elVide.appendChild(h('div.vide', [h('div', { html: I.cadenas }), h('h3', 'Accès non autorisé'), h('div', { text: this.refus })])); this.elTable.textContent = ''; return; }
    if (!this.liste) { this.elEtat.textContent = this.erreur ? 'Serveur injoignable : ' + this.erreur : 'Chargement du registre…'; return; }
    var total = this.liste.length;
    this.elEtat.textContent = total + ' évaluation' + (total > 1 ? 's' : '') + ' enregistrée' + (total > 1 ? 's' : '') + ' — une par véhicule, pour toutes les concessions du groupe. Cliquez une concession pour filtrer, une ligne pour ouvrir.';
    // Période
    PERIODES_REGISTRE.forEach(function (p) {
      self.elSegment.appendChild(h('button' + (p[0] === self.periode ? '.actif' : ''), { type: 'button', text: p[1], onclick: function () { self.periode = p[0]; AMX.memo.ecrire('registre_eval_periode', p[0]); self.rendre(); } }));
    });
    // Évaluateurs
    var acheteurs = {}; (this.liste || []).forEach(function (r) { if (r.par) acheteurs[r.par] = (acheteurs[r.par] || 0) + 1; });
    AMX.vider(this.elAcheteur);
    this.elAcheteur.appendChild(h('option', { value: '', text: 'Tous les évaluateurs' }));
    Object.keys(acheteurs).sort().forEach(function (a) { self.elAcheteur.appendChild(h('option', { value: a, selected: a === self.acheteur ? true : undefined, text: a.split('@')[0] + ' (' + acheteurs[a] + ')' })); });
    // Cartes par concession (sur la période / l'évaluateur)
    var base = this.base();
    var carte = function (cle, libelle, lignes) {
      var ag = agregerRegistre(lignes), actif = self.concession === cle;
      var k = h('button.registre-carte' + (actif ? '.actif' : '') + (cle ? '.' + (COULEUR_CONCESSION[cle] || 'gris') : '.toutes'), { type: 'button', 'aria-pressed': actif ? 'true' : 'false', onclick: function () { self.concession = cle; AMX.memo.ecrire('registre_eval_concession', cle); self.rendre(); } }, [
        h('div.haut', [h('div.nom', { text: libelle }), h('div.n.num', { text: String(ag.n) })]),
        h('div.bas', ag.n ? [
          h('span', [h('b', { text: fmt(ag.detail) }), ' détail']),
          h('span.' + (ag.margeMoy !== null && ag.margeMoy >= 0 ? 'pos' : 'neg'), [h('b', { text: ag.margeMoy !== null ? fmt(ag.margeMoy) : '—' }), ' marge moy.']),
          h('span', [h('b', { text: ag.pctMoy !== null ? pct(ag.pctMoy) : '—' }), ' marché'])
        ] : [h('span.doux', { text: 'aucune évaluation' })])
      ]);
      return k;
    };
    this.elCartes.appendChild(carte('', 'Toutes les concessions', base));
    Object.keys(AMX.CONCESSIONS).forEach(function (c) { self.elCartes.appendChild(carte(c, nomCourt(c), base.filter(function (r) { return r.concession === c; }))); });
    var sans = base.filter(function (r) { return !r.concession; });
    if (sans.length) this.elCartes.appendChild(carte('(aucune)', 'Sans concession', sans));
    this.rendreTable();
  };

  Registre.prototype.rendreTable = function () {
    var self = this;
    AMX.vider(this.elTable);
    var lignes = this.filtrees();
    if (this.concession === '(aucune)') lignes = this.base().filter(function (r) { return !r.concession; });
    this.elCompte.textContent = lignes.length + ' évaluation' + (lignes.length > 1 ? 's' : '') + (this.concession && this.concession !== '(aucune)' ? ' · ' + nomCourt(this.concession) : '');
    if (!lignes.length) { this.elTable.appendChild(h('div.vide', [h('div', { html: I.filtre }), h('h3', 'Aucune évaluation'), h('div', { text: this.recherche ? 'Rien ne correspond à la recherche.' : 'Aucune évaluation pour ce filtre — ouvrez « Évaluation marché », entrez un NIV et enregistrez.' })])); return; }
    var c = COL_REGISTRE.filter(function (x) { return x.cle === self.tri.cle; })[0] || COL_REGISTRE[0];
    var val = c.valeur || function (r) { return r[c.cle]; };
    lignes = lignes.slice().sort(function (a, b) {
      var va = val(a), vb = val(b), r;
      if (typeof va === 'number' || typeof vb === 'number') { va = (typeof va === 'number' && !isNaN(va)) ? va : -Infinity; vb = (typeof vb === 'number' && !isNaN(vb)) ? vb : -Infinity; r = va === vb ? 0 : (va < vb ? -1 : 1); }
      else r = String(va || '').localeCompare(String(vb || ''), 'fr', { numeric: true, sensitivity: 'base' });
      return self.tri.desc ? -r : r;
    });
    var thead = h('thead', [h('tr', COL_REGISTRE.map(function (col) {
      var actif = self.tri.cle === col.cle;
      var th = h('th' + (col.num ? '.num' : '') + '.registre-triable' + (actif ? '.actif' : ''), { 'aria-sort': actif ? (self.tri.desc ? 'descending' : 'ascending') : 'none', title: 'Trier par ' + col.libelle.toLowerCase() }, [col.libelle, actif ? h('span', { text: self.tri.desc ? ' ▼' : ' ▲', style: { fontSize: '9px' } }) : null]);
      th.addEventListener('click', function () { if (self.tri.cle === col.cle) self.tri.desc = !self.tri.desc; else { self.tri.cle = col.cle; self.tri.desc = !!col.num || col.cle === 'dateMaj'; } self.rendreTable(); });
      return th;
    }))]);
    var tbody = h('tbody');
    lignes.forEach(function (r) {
      var m = r.marchePct, marge = nombre(r.marge), kmV = nombre(r.km);
      var tr = h('tr.cliquable', { tabindex: '0' }, [
        h('td.num.registre-date', [h('div', { text: r.dateMaj ? AMX.fmtDate(r.dateMaj) : '—' }), h('div.mini', { text: depuis(r.dateMaj) })]),
        h('td.registre-vehicule', [AMX.logoMarque(r.marque, 'petit'), h('div', [h('div.nom', { text: [r.annee, r.marque, r.modele].filter(Boolean).join(' ') || '—' }), h('div.mini', { text: [r.version, kmV !== null ? fmtKm(kmV) : ''].filter(Boolean).join(' · ') })])]),
        h('td.mono.registre-vin', { text: r.vin }),
        h('td', [h('span.badge.sans-point.' + (COULEUR_CONCESSION[r.concession] || 'gris'), { text: r.concession ? nomCourt(r.concession) : '—' })]),
        h('td.num', { text: fmt(nombre(r.prixPaye)) }),
        h('td.num', { text: fmt(nombre(r.recon)) }),
        h('td.num' + (marge !== null ? (marge >= 0 ? '.inf' : '.sup') : ''), { text: fmt(marge) }),
        h('td.num.registre-detail', { text: fmt(nombre(r.prixVente)) }),
        h('td.num', { text: fmt(r.standard), title: r.analyseLe ? 'Analyse du ' + AMX.fmtDate(r.analyseLe, true) + (r.pays === 'us' ? ' (États-Unis)' : ' (Canada)') : 'Pas d\'analyse de marché enregistrée' }),
        h('td.num', m ? [h('span.puce' + (m > 1.03 ? '.alerte' : (m < 0.97 ? '.ok' : '.attention')), { text: pct(m) }), r.rang ? h('div.mini', { text: 'rang ' + r.rang + '/' + r.rangSur }) : null] : '—'),
        h('td', r.par ? [h('span.registre-par', { title: r.par }, [h('span.avatar', { text: AMX.initiales(r.par.split('@')[0].replace(/[._-]/g, ' ')) }), h('span', { text: r.par.split('@')[0] })])] : '—')
      ]);
      var ouvrir = function () { AMX.aller('outils', 'evaluation', { vin: r.vin }); };
      tr.addEventListener('click', ouvrir);
      tr.addEventListener('keydown', function (e) { if (e.key === 'Enter') ouvrir(); });
      tbody.appendChild(tr);
    });
    var ag = agregerRegistre(lignes);
    var tfoot = h('tfoot', [h('tr', [
      h('td', { colspan: '4', text: 'Total — ' + ag.n + ' évaluation' + (ag.n > 1 ? 's' : '') }),
      h('td.num', { text: fmt(ag.paye) }), h('td.num', ''), h('td.num.' + (ag.marge >= 0 ? 'inf' : 'sup'), { text: fmt(ag.marge) + (ag.margeMoy !== null ? ' (moy. ' + fmt(ag.margeMoy) + ')' : '') }),
      h('td.num', { text: fmt(ag.detail) }), h('td.num', ''), h('td.num', { text: ag.pctMoy !== null ? 'moy. ' + pct(ag.pctMoy) : '' }), h('td', '')
    ])]);
    this.elTable.appendChild(h('table.tableau#registre-table', [thead, tbody, tfoot]));
  };

  Registre.prototype.exporter = function () {
    var lignes = this.filtrees();
    if (!lignes.length) { AMX.toast('Aucune évaluation à exporter.', 'attention'); return; }
    if (typeof XLSX === 'undefined') { AMX.toast('La bibliothèque Excel n\'est pas encore chargée. Réessayez.', 'erreur'); return; }
    var rows = lignes.map(function (r) {
      return { 'Date': r.dateMaj ? AMX.fmtDate(r.dateMaj) : '', 'NIV': r.vin, 'Année': r.annee, 'Marque': r.marque, 'Modèle': r.modele, 'Version': r.version, 'Concession': AMX.CONCESSIONS[r.concession] || r.concession,
        'KM': nombre(r.km), 'Prix payé': nombre(r.prixPaye), 'Reconditionnement': nombre(r.recon), 'Marge': nombre(r.marge), 'Prix de détail': nombre(r.prixVente),
        'Marché agressif': r.agressif, 'Marché standard': r.standard, 'Marché conservateur': r.conservateur, 'Marché %': r.marchePct !== null && r.marchePct !== undefined ? Math.round(r.marchePct * 1000) / 10 : '', 'Rang': r.rang ? r.rang + '/' + r.rangSur : '', 'Pays': r.pays, 'Analyse le': r.analyseLe ? AMX.fmtDate(r.analyseLe, true) : '', 'Par': r.par };
    });
    var ws = XLSX.utils.json_to_sheet(rows);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Évaluations');
    XLSX.writeFile(wb, 'evaluations-' + (this.concession || 'toutes') + '-' + new Date().toISOString().slice(0, 10) + '.xlsx');
    AMX.toast('Export Excel — ' + lignes.length + ' ligne' + (lignes.length > 1 ? 's' : ''), 'ok');
  };

  AMX.vues = AMX.vues || {};
  AMX.vues.Evaluation = Evaluation;
  AMX.vues.RegistreEvaluations = Registre;
})();
