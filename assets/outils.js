/* =========================================================================
   Section « Outils » : deux onglets qui remplacent evaluation.html et
   verification.html.

   Évaluation marché — valeur suggérée d'un véhicule d'occasion à partir de
   comparables saisis à la main (moyenne, médiane, fourchette, puis les mêmes
   ramenées au kilométrage du véhicule).
     GET  ?evalVin=VIN   → { trouve, donnees: { marque, modele, annee, km, tauxKm, comparables:[{source, prix, km}] }, dateMaj }
     POST { action: 'saveEvaluation', vin, data }   → { dateMaj }
     Externe : NHTSA vPIC (marque / modèle / année), depuis le navigateur.
     Route : #/outils/evaluation?vin=… préremplit et charge l'évaluation.

   Vérification Excel — aucun serveur : on lit des fichiers Excel (SheetJS,
   `XLSX` chargé par index.html en defer) et on compare les listes de NIV de
   chaque groupe (Neuf, Usager Canada, US) à leur source de financement.
     Les ids générés (file-/col-/drop-/label-/colrow-/count-{groupe}-{source},
     compare-btn-{g}, results-zone-{g}, toggle-full-table-{g},
     full-table-zone-{g}, search-{g}, results-tbody-{g}, results-empty-{g})
     reprennent ceux de l'ancienne page.

   Les deux onglets restent montés tant qu'on est dans la section : changer
   d'onglet ne perd pas ce qui a été tapé ou téléversé.
   ========================================================================= */
(function () {
  'use strict';
  var h = AMX.h, esc = AMX.esc, I = AMX.icones;

  var URL_NHTSA = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVINValuesBatch/';

  // Sites de recherche de comparables (mêmes liens que l'ancienne page).
  var SITES = [
    { nom: 'Kijiji Autos', url: 'https://www.kijijiautos.ca/', indice: 'Marketplace généraliste' },
    { nom: 'AutoHebdo',    url: 'https://www.autohebdo.net/',  indice: 'Marché québécois' },
    { nom: 'CarGurus',     url: 'https://www.cargurus.ca/',    indice: 'Analyse de prix' },
    { nom: 'Clutch',       url: 'https://www.clutch.ca/',      indice: 'Certifié en ligne' }
  ];

  // Groupes de vérification : la source « principale » est comparée à chacune des autres.
  var GROUPES = [
    {
      key: 'neuf', titre: 'Neuf', sous: 'Compare l\'inventaire Neuf au Financement Neuf et à Global Connect.',
      principale: 'inv', comparerA: ['fin', 'gc'],
      sources: [{ key: 'inv', libelle: 'Inventaire Neuf' }, { key: 'fin', libelle: 'Financement Neuf' }, { key: 'gc', libelle: 'Global Connect' }]
    },
    {
      key: 'usagerca', titre: 'Usager Canada', sous: 'Compare l\'inventaire Usager Canada au Financement Canada.',
      principale: 'inv', comparerA: ['fin'],
      sources: [{ key: 'inv', libelle: 'Inventaire Usager Canada' }, { key: 'fin', libelle: 'Financement Canada' }]
    },
    {
      key: 'us', titre: 'US', sous: 'Compare l\'inventaire US au Financement UVU.',
      principale: 'inv', comparerA: ['fin'],
      sources: [{ key: 'inv', libelle: 'Inventaire US' }, { key: 'fin', libelle: 'Financement UVU' }]
    }
  ];

  /* ------------------------------ Helpers ------------------------------ */
  function fmt(n) { return AMX.fmtArgent(n, 0); }
  function asc(a, b) { return a - b; }
  function mediane(tries) {
    var n = tries.length, mid = Math.floor(n / 2);
    return n % 2 === 0 ? (tries[mid - 1] + tries[mid]) / 2 : tries[mid];
  }
  function moyenne(liste) { return liste.reduce(function (a, b) { return a + b; }, 0) / liste.length; }
  function normVin(v) { return String(v === null || v === undefined ? '' : v).trim().toUpperCase(); }
  // Colonne du VIN : un en-tête contenant « vin » (comme avant), sinon « niv » (en-têtes français).
  function detecterColonneVin(entetes) {
    var normes = entetes.map(function (e) { return String(e).toLowerCase().replace(/[^a-z0-9]/g, ''); });
    for (var i = 0; i < normes.length; i++) if (normes[i].indexOf('vin') >= 0) return i;
    for (var j = 0; j < normes.length; j++) if (normes[j].indexOf('niv') >= 0) return j;
    return -1;
  }
  function libelleSource(g, key) {
    for (var i = 0; i < g.sources.length; i++) if (g.sources[i].key === key) return g.sources[i].libelle;
    return key;
  }
  function carte(titre, enfants, actions) {
    var entete = typeof titre === 'string' ? h('h2', { text: titre }) : titre;
    return h('div.carte', [h('div.carte-entete', [entete, actions || null]), h('div.carte-corps', enfants)]);
  }
  // Un champ `.champ` : label + input.
  function champ(id, libelle, opts) {
    opts = opts || {};
    var attrs = { type: opts.type || 'text', id: id, step: opts.step, placeholder: opts.placeholder, value: opts.value, autocomplete: 'off' };
    if (opts.type === 'number') attrs.inputmode = opts.inputmode || 'decimal';
    if (opts.vin) { attrs.spellcheck = 'false'; attrs.autocapitalize = 'characters'; }
    var inp = h('input' + (opts.mono ? '.mono' : ''), attrs);
    return { el: h('div.champ', [h('label', { 'for': id, text: libelle }), inp]), input: inp };
  }

  // NHTSA : marque / modèle / année d'un seul NIV (null si rien ou si le service est injoignable).
  function decoderVin(vin) {
    var corps = new URLSearchParams(); corps.append('format', 'json'); corps.append('data', vin);
    return fetch(URL_NHTSA, { method: 'POST', body: corps })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var r = (d && d.Results || [])[0];
        if (!r) return null;
        return { make: r.Make || '', model: r.Model || '', year: r.ModelYear || '' };
      })
      .catch(function () { return null; });
  }

  function injecterCss() {
    if (document.getElementById('css-outils')) return;
    var s = document.createElement('style');
    s.id = 'css-outils';
    s.textContent = [
      '.outils-page .carte { margin-bottom: 14px; }',
      '.outils-page .carte-entete .titre { min-width: 0; }',
      '.outils-page .carte-entete .titre p { margin: 2px 0 0; font-size: 12px; color: var(--encre-3); }',
      '.outils-page .outils-pile { display: flex; flex-direction: column; gap: 12px; }',
      '.outils-page .outils-note { margin: 0; font-size: 11.5px; color: var(--encre-3); line-height: 1.5; }',
      // Évaluation
      '.outils-contexte { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--ligne); font-size: 12.5px; color: var(--encre-2); }',
      '.outils-contexte .modele { font-weight: 600; color: var(--encre); }',
      '.outils-sites { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }',
      '.outils-site { display: block; border: 1px solid var(--ligne); border-radius: var(--rayon-s); padding: 10px; text-align: center; color: var(--encre); transition: border-color .15s, background .15s; }',
      '.outils-site:hover { border-color: var(--vert); background: var(--vert-clair); text-decoration: none; }',
      '.outils-site .nom { font-weight: 600; font-size: 12.5px; }',
      '.outils-site .indice { font-size: 11px; color: var(--encre-3); margin-top: 2px; }',
      '.outils-comparables { overflow-x: auto; }',
      '.outils-comparables .tableau { min-width: 460px; }',
      '.outils-comparables td { padding: 6px 8px; }',
      '.outils-comparables td input.saisie { height: 30px; }',
      '.outils-comparables .col-prix, .outils-comparables .col-km { width: 140px; }',
      '.outils-comparables .col-x { width: 44px; }',
      '.outils-comparables .outils-vide { padding: 14px; }',
      '.outils-page .resume-sombre { margin-bottom: 10px; }',
      '.outils-page .resume-sombre.outils-ajuste { box-shadow: inset 4px 0 0 var(--vert-vif); }',
      '.outils-page .resume-sombre .v.indice { font-size: 12.5px; font-weight: 500; opacity: .75; margin-top: 6px; }',
      '.outils-eval .outils-note.resume { margin: -2px 0 14px; }',
      // Vérification
      '.outils-source { display: flex; flex-direction: column; gap: 8px; min-width: 0; }',
      '.outils-zone { display: block; border: 1.5px dashed var(--ligne-forte); border-radius: var(--rayon-s); padding: 14px 10px; text-align: center; cursor: pointer; font-size: 12px; color: var(--encre-3); transition: border-color .15s, background .15s; overflow-wrap: anywhere; }',
      '.outils-zone:hover, .outils-zone.survol { border-color: var(--vert); background: var(--vert-clair); }',
      '.outils-zone.charge { border-style: solid; border-color: var(--vert); background: var(--vert-clair); color: var(--vert); font-weight: 500; }',
      '.outils-zone input { display: none; }',
      '.outils-resultats { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--ligne); }',
      '.outils-vide { padding: 16px; text-align: center; color: var(--encre-3); font-size: 12.5px; }',
      '.outils-compteurs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }',
      '.outils-ecart { margin-bottom: 12px; }',
      '.outils-ecart .alerte-bloc { align-items: center; }',
      '.outils-ecart .alerte-bloc .texte { flex: 1; }',
      '.outils-ecart .alerte-bloc .texte span { display: block; font-size: 11.5px; opacity: .85; margin-top: 1px; }',
      '.outils-ecart .alerte-bloc .badge { flex: none; }',
      '.outils-defile { max-height: 260px; overflow: auto; margin-top: 6px; border-radius: var(--rayon); }',
      '.outils-defile .tableau td { padding: 6px 12px; }',
      '.outils-centre { text-align: center; }',
      '.outils-bascule { text-align: center; margin: 14px 0; }',
      '.outils-barre { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }',
      '.outils-barre .recherche { flex: 1 1 200px; }',
      '.outils-coche { font-weight: 700; font-size: 14px; line-height: 1; }',
      '.outils-coche.oui { color: var(--vert); }',
      '.outils-coche.non { color: var(--rouge); }',
      '.tableau tr.outils-ligne-ecart td { background: var(--rouge-bg); }',
      '@media (max-width: 860px) {',
      '  .outils-sites { grid-template-columns: repeat(2, minmax(0, 1fr)); }',
      '  .outils-page .carte-entete { flex-wrap: wrap; }',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ------------------------------ Section ------------------------------ */
  AMX.section('outils', {
    titre: 'Outils', icone: 'outils', ordre: 40,
    onglets: [
      { id: 'evaluation', titre: 'Évaluation marché' },
      { id: 'verification', titre: 'Vérification Excel' },
      { id: 'carfax', titre: 'Import CARFAX' }
    ],
    monter: function (conteneur, ctx) { return new Outils(conteneur, ctx); }
  });

  // Conteneur des deux onglets : chaque vue est construite une seule fois et
  // simplement affichée / masquée, pour ne rien perdre en changeant d'onglet.
  function Outils(conteneur, ctx) {
    injecterCss();
    this.conteneur = conteneur;
    this.vues = {};
    this.onglet = '';
    this.naviguer(ctx || {});
  }
  Outils.prototype.naviguer = function (ctx) {
    var id = (ctx && (ctx.onglet === 'verification' || ctx.onglet === 'carfax')) ? ctx.onglet : 'evaluation';
    if (!this.vues[id]) {
      this.vues[id] = id === 'verification' ? new Verification(ctx) : (id === 'carfax' ? new ImportCarfax(ctx) : new Evaluation(ctx));
      this.conteneur.appendChild(this.vues[id].el);
    } else if (this.vues[id].naviguer) {
      this.vues[id].naviguer(ctx);
    }
    var vues = this.vues;
    Object.keys(vues).forEach(function (k) { vues[k].el.classList.toggle('cache', k !== id); });
    this.onglet = id;
  };
  Outils.prototype.demonter = function () {
    var vues = this.vues;
    Object.keys(vues).forEach(function (k) { if (vues[k].demonter) { try { vues[k].demonter(); } catch (e) {} } });
    this.vues = {};
  };

  /* =====================================================================
     Onglet « Évaluation marché »
     ===================================================================== */
  function Evaluation(ctx) {
    var self = this;
    this.vinCourant = '';   // NIV que l'évaluation représente
    this.vinCharge = '';    // dernier NIV chargé depuis le serveur (évite de recharger et d'écraser la saisie)
    this.generation = 0;
    this.compteur = 0;

    this.construire();
    this.recalculer();

    this.surInventaire = function () { self.rendreContexte(); };
    document.addEventListener('amx:inventaire', this.surInventaire);

    var vin = (ctx && ctx.params && ctx.params.vin) ? String(ctx.params.vin).trim() : '';
    if (vin) { this.elNiv.value = vin; this.charger(vin); }
  }

  Evaluation.prototype.demonter = function () {
    document.removeEventListener('amx:inventaire', this.surInventaire);
    this.generation++;
  };

  // Même onglet, params modifiés (#/outils/evaluation?vin=…).
  Evaluation.prototype.naviguer = function (ctx) {
    var vin = (ctx && ctx.params && ctx.params.vin) ? String(ctx.params.vin).trim() : '';
    if (vin && vin !== this.vinCharge) { this.elNiv.value = vin; this.charger(vin); }
  };

  Evaluation.prototype.etat = function (texte) { this.elEtat.textContent = texte; };

  Evaluation.prototype.construire = function () {
    var self = this;

    // En-tête
    this.elEtat = h('p#eval-statut', { text: 'Décodez le véhicule, ouvrez les recherches sur les sites du marché, puis entrez les prix comparables trouvés pour obtenir une valeur suggérée.' });
    this.btnDecoder = h('button.btn#decode-btn', { type: 'button', html: I.scan + '<span>Décoder le VIN</span>', onclick: function () { self.decoderDepuisChamp(); } });
    this.btnEnregistrer = h('button.btn.primaire#save-eval-btn', { type: 'button', html: I.ok + '<span>Enregistrer l\'évaluation</span>', onclick: function () { self.enregistrer(); } });
    var entete = h('div.entete-page', [
      h('div', { style: { minWidth: 0 } }, [h('h1', 'Évaluation de marché'), this.elEtat]),
      h('div.actions', [this.btnDecoder, this.btnEnregistrer])
    ]);

    // Identification
    var cNiv = champ('e-niv', 'NIV (optionnel — pour décoder et enregistrer)', { mono: true, vin: true, placeholder: 'Numéro d\'identification' });
    var cMarque = champ('e-marque', 'Marque');
    var cModele = champ('e-modele', 'Modèle');
    var cAnnee = champ('e-annee', 'Année', { type: 'number', inputmode: 'numeric' });
    var cKm = champ('e-km', 'Kilométrage du véhicule à évaluer', { type: 'number', inputmode: 'numeric' });
    var cTaux = champ('e-taux-km', 'Taux d\'ajustement ($/km)', { type: 'number', step: '0.01', value: '0.10' });
    this.elNiv = cNiv.input; this.elMarque = cMarque.input; this.elModele = cModele.input; this.elAnnee = cAnnee.input;
    this.elKm = cKm.input; this.elTaux = cTaux.input;
    this.elContexte = h('div.outils-contexte.cache');
    var identification = carte('Identification du véhicule', [
      h('div.outils-pile', [
        h('div.grille.c4', [cNiv.el, cMarque.el, cModele.el, cAnnee.el]),
        h('div.grille.c4', [cKm.el, cTaux.el])
      ]),
      this.elContexte
    ]);
    this.elNiv.addEventListener('blur', function () {
      var vin = self.elNiv.value.trim();
      if (vin.length < 11) return;
      if (vin !== self.vinCharge) self.charger(vin);
    });
    this.elNiv.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); self.elNiv.blur(); } });
    this.elKm.addEventListener('input', function () { self.recalculer(); });
    this.elTaux.addEventListener('input', function () { self.recalculer(); });

    // Sites de recherche
    var sites = carte('Rechercher des comparables au Québec', [
      h('div.outils-sites#site-grid', SITES.map(function (s) {
        return h('a.outils-site', { href: s.url, target: '_blank', rel: 'noopener' }, [h('div.nom', { text: s.nom }), h('div.indice', { text: s.indice })]);
      })),
      h('p.outils-note', { style: { marginTop: '10px' }, text: 'Les liens ouvrent la recherche du site — collez-y la marque, le modèle et l\'année ci-dessus (les URL de recherche directe ne sont pas garanties stables d\'un site à l\'autre).' })
    ]);

    // Comparables
    this.elLignes = h('tbody#comp-rows');
    var comparables = carte('Comparables trouvés', [
      h('div.outils-comparables', [
        h('table.tableau', [
          h('thead', [h('tr', [h('th', 'Source'), h('th.col-prix', 'Prix ($)'), h('th.col-km', 'KM'), h('th.col-x', '')])]),
          this.elLignes
        ])
      ])
    ], h('button.btn.petit#add-comp-btn', { type: 'button', html: I.plus + '<span>Ajouter un comparable</span>', onclick: function () { self.ajouterLigne(); self.elLignes.lastChild.querySelector('input').focus(); } }));
    this.ajouterLigne(); this.ajouterLigne(); this.ajouterLigne();

    // Résumés
    this.S = {
      count: h('div.v.num#s-count', '0'), avg: h('div.v.num#s-avg', '—'), median: h('div.v.num#s-median', '—'), range: h('div.v.num#s-range', '—'),
      avgAdj: h('div.v.num#s-avg-adj', '—'), medianAdj: h('div.v.num#s-median-adj', '—'), rangeAdj: h('div.v.num#s-range-adj', '—')
    };
    var brut = h('div.resume-sombre', [
      h('div', [h('div.l', 'Comparables'), this.S.count]),
      h('div', [h('div.l', 'Moyenne brute'), this.S.avg]),
      h('div', [h('div.l', 'Médiane brute'), this.S.median]),
      h('div', [h('div.l', 'Fourchette brute'), this.S.range])
    ]);
    var ajuste = h('div.resume-sombre.outils-ajuste', [
      h('div', [h('div.l', 'Moyenne ajustée au KM'), this.S.avgAdj]),
      h('div', [h('div.l', 'Médiane ajustée au KM'), this.S.medianAdj]),
      h('div', [h('div.l', 'Fourchette ajustée'), this.S.rangeAdj])
    ]);
    var note = h('p.outils-note.resume', 'La valeur ajustée ramène chaque comparable au kilométrage de votre véhicule (prix du comparable − (KM véhicule − KM comparable) × taux) — ça évite qu\'un comparable à très faible ou très haut kilométrage fausse la moyenne.');

    this.el = h('div.page.etroite.outils-page.outils-eval', [entete, identification, sites, comparables, brut, ajuste, note]);
  };

  /* --------------------------- Comparables ----------------------------- */
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

  /* ------------------------------ Calculs ------------------------------ */
  Evaluation.prototype.recalculer = function () {
    var S = this.S;
    var comps = this.lignes().map(function (tr) {
      return { prix: parseFloat(tr.querySelector('.comp-prix').value), km: parseFloat(tr.querySelector('.comp-km').value) };
    }).filter(function (c) { return !isNaN(c.prix) && c.prix > 0; });
    var prix = comps.map(function (c) { return c.prix; }).sort(asc);

    S.count.textContent = String(prix.length);
    S.avgAdj.classList.remove('indice');
    if (!prix.length) {
      ['avg', 'median', 'range', 'avgAdj', 'medianAdj', 'rangeAdj'].forEach(function (k) { S[k].textContent = '—'; });
      return;
    }
    S.avg.textContent = fmt(moyenne(prix));
    S.median.textContent = fmt(mediane(prix));
    S.range.textContent = fmt(prix[0]) + ' – ' + fmt(prix[prix.length - 1]);

    // Ajustement au kilométrage : chaque comparable est ramené au KM du véhicule évalué.
    var kmVehicule = parseFloat(this.elKm.value);
    var tauxKm = parseFloat(this.elTaux.value) || 0;
    if (!isNaN(kmVehicule)) {
      var ajustes = comps.map(function (c) { return isNaN(c.km) ? c.prix : c.prix - (kmVehicule - c.km) * tauxKm; }).sort(asc);
      S.avgAdj.textContent = fmt(moyenne(ajustes));
      S.medianAdj.textContent = fmt(mediane(ajustes));
      S.rangeAdj.textContent = fmt(ajustes[0]) + ' – ' + fmt(ajustes[ajustes.length - 1]);
    } else {
      S.avgAdj.textContent = 'Entrez le KM du véhicule';
      S.avgAdj.classList.add('indice');
      S.medianAdj.textContent = '—';
      S.rangeAdj.textContent = '—';
    }
  };

  /* ------------------------------ Données ------------------------------ */
  Evaluation.prototype.collecter = function () {
    return {
      marque: this.elMarque.value, modele: this.elModele.value, annee: this.elAnnee.value,
      km: this.elKm.value, tauxKm: this.elTaux.value,
      comparables: this.lignes().map(function (tr) {
        return { source: tr.querySelector('.comp-source').value, prix: tr.querySelector('.comp-prix').value, km: tr.querySelector('.comp-km').value };
      })
    };
  };

  Evaluation.prototype.remplir = function (data) {
    var self = this;
    data = data || {};
    if (data.marque) this.elMarque.value = data.marque;
    if (data.modele) this.elModele.value = data.modele;
    if (data.annee) this.elAnnee.value = data.annee;
    if (data.km) this.elKm.value = data.km;
    if (data.tauxKm) this.elTaux.value = data.tauxKm;
    if (data.comparables && data.comparables.length) {
      AMX.vider(this.elLignes);
      data.comparables.forEach(function (c) { self.ajouterLigne(c && c.source, c && c.prix, c && c.km); });
    }
    this.recalculer();
  };

  /* ---------------------------- Chargement ----------------------------- */
  Evaluation.prototype.charger = function (vin) {
    var self = this;
    vin = String(vin || '').trim();
    if (!vin) return Promise.resolve();
    var gen = ++this.generation;
    this.vinCourant = vin;
    this.vinCharge = vin;
    this.rendreContexte();
    if (!AMX.inventaire.parVin(vin)) AMX.inventaire.tout().then(function () { self.rendreContexte(); }, function () {});
    this.etat('Recherche d\'une évaluation existante…');
    return AMX.get('evalVin=' + encodeURIComponent(vin)).then(function (d) {
      if (gen !== self.generation) return;
      if (d && d.refuse) throw new Error(d.erreur || d.message || 'Accès refusé');
      if (d && d.trouve) {
        self.remplir(d.donnees || {});
        self.etat('Évaluation existante chargée — NIV ' + vin + (d.dateMaj ? ', mise à jour le ' + AMX.fmtDate(d.dateMaj, true) : '') + '.');
      } else {
        self.etat('Aucune évaluation existante pour ce NIV — nouvelle évaluation.');
        self.decoder(vin);
      }
      history.replaceState(null, '', AMX.lien('outils', 'evaluation', { vin: vin }));
    }).catch(function (e) {
      if (gen !== self.generation) return;
      self.vinCharge = '';
      self.etat('Impossible de joindre le serveur : ' + AMX.erreurTexte(e));
      AMX.toast('Impossible de charger l\'évaluation — ' + AMX.erreurTexte(e), 'erreur');
    });
  };

  Evaluation.prototype.decoderDepuisChamp = function () {
    var vin = this.elNiv.value.trim();
    if (vin.length < 11) { AMX.toast('Entrez un NIV d\'au moins 11 caractères pour le décoder.', 'attention'); this.elNiv.focus(); return; }
    this.vinCourant = vin;
    this.rendreContexte();
    this.decoder(vin);
  };

  // NHTSA : remplit marque / modèle / année (comme l'ancienne page, en écrasant la valeur).
  Evaluation.prototype.decoder = function (vin) {
    var self = this, btn = this.btnDecoder;
    btn.classList.add('occupe');
    return decoderVin(vin).then(function (r) {
      if (self.vinCourant !== vin) return;
      if (!r) { AMX.toast('Décodage NHTSA indisponible — remplissez marque, modèle et année à la main.', 'attention'); return; }
      if (r.make) self.elMarque.value = r.make;
      if (r.model) self.elModele.value = r.model;
      if (r.year) self.elAnnee.value = r.year;
    }).then(function () { btn.classList.remove('occupe'); });
  };

  // Contexte du véhicule s'il est dans un des registres en cache.
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

  /* --------------------------- Enregistrement -------------------------- */
  Evaluation.prototype.enregistrer = function () {
    var self = this, btn = this.btnEnregistrer;
    var vin = this.elNiv.value.trim();
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
      self.etat('Évaluation enregistrée pour ce NIV (' + quand + ').');
      AMX.toast('Évaluation enregistrée (NIV ' + vin + ')', 'ok');
      history.replaceState(null, '', AMX.lien('outils', 'evaluation', { vin: vin }));
      self.rendreContexte();
    }).catch(function (e) {
      self.etat('Échec de l\'enregistrement : ' + AMX.erreurTexte(e));
      AMX.toast('Échec de l\'enregistrement — ' + AMX.erreurTexte(e), 'erreur');
    }).then(function () { btn.classList.remove('occupe'); });
  };

  /* =====================================================================
     Onglet « Vérification Excel »
     ===================================================================== */
  function Verification() {
    this.etatSources = {};   // etatSources[groupe][source] = { data, headers, colIndex, vins (Set), nom }
    this.resultats = {};     // resultats[groupe] = { rows, filtre: 'mismatch'|'all', recherche }
    GROUPES.forEach(function (g) {
      this.etatSources[g.key] = {};
      g.sources.forEach(function (s) { this.etatSources[g.key][s.key] = { data: null, headers: [], colIndex: -1, vins: new Set(), nom: '' }; }, this);
    }, this);
    this.construire();
  }

  Verification.prototype.demonter = function () {};
  Verification.prototype.naviguer = function () {};
  Verification.prototype.q = function (id) { return this.el.querySelector('#' + id); };

  Verification.prototype.construire = function () {
    var self = this;
    var entete = h('div.entete-page', [
      h('div', { style: { minWidth: 0 } }, [
        h('h1', 'Vérification d\'inventaire'),
        h('p', 'Comparez chaque catégorie de véhicules à sa source de financement (et à Global Connect pour le Neuf) à partir de vos fichiers Excel. Rien n\'est envoyé au serveur : tout se passe dans votre navigateur.')
      ])
    ]);
    var cartes = GROUPES.map(function (g) { return self.construireGroupe(g); });
    this.el = h('div.page.etroite.outils-page.outils-verif', [entete].concat(cartes));
  };

  Verification.prototype.construireGroupe = function (g) {
    var self = this;
    var sources = g.sources.map(function (s) { return self.construireSource(g, s); });
    var btnComparer = h('button.btn.primaire#compare-btn-' + g.key, { type: 'button', disabled: true, html: I.ok + '<span>Comparer</span>', onclick: function () { self.comparer(g); } });
    var zone = h('div.outils-resultats#results-zone-' + g.key, [
      h('div.outils-vide', { text: 'Téléversez les fichiers ci-dessus, puis cliquez sur « Comparer ».' })
    ]);
    return h('div.carte', [
      h('div.carte-entete', [
        h('div.titre', [h('h2', { text: g.titre }), h('p', { text: g.sous })]),
        btnComparer
      ]),
      h('div.carte-corps', [
        h('div.grille.c' + (g.sources.length >= 3 ? '3' : '2'), sources),
        zone
      ])
    ]);
  };

  Verification.prototype.construireSource = function (g, s) {
    var self = this;
    var suffixe = g.key + '-' + s.key;
    var fichier = h('input', { type: 'file', id: 'file-' + suffixe, accept: '.xlsx,.xls,.csv' });
    fichier.addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (f) self.lireFichier(g, s, f);
      e.target.value = '';
    });
    var zone = h('label.outils-zone#drop-' + suffixe, { 'for': 'file-' + suffixe }, [
      h('span#label-' + suffixe, { text: 'Cliquez ou déposez un fichier Excel (.xlsx / .xls / .csv)' }),
      fichier
    ]);
    // Glisser-déposer
    zone.addEventListener('dragover', function (e) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; zone.classList.add('survol'); });
    zone.addEventListener('dragenter', function (e) { e.preventDefault(); zone.classList.add('survol'); });
    zone.addEventListener('dragleave', function () { zone.classList.remove('survol'); });
    zone.addEventListener('drop', function (e) {
      e.preventDefault(); zone.classList.remove('survol');
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) self.lireFichier(g, s, f);
    });
    var select = h('select#col-' + suffixe);
    select.addEventListener('change', function (e) {
      self.etatSources[g.key][s.key].colIndex = parseInt(e.target.value, 10);
      self.majVins(g, s);
    });
    var colonne = h('div.champ.cache#colrow-' + suffixe, [h('label', { 'for': 'col-' + suffixe, text: 'Colonne contenant le VIN' }), select]);
    var compte = h('div#count-' + suffixe);
    return h('div.outils-source', [h('div.etiquette', { text: s.libelle }), zone, colonne, compte]);
  };

  /* ---------------------------- Lecture ------------------------------- */
  Verification.prototype.lireFichier = function (g, s, fichier) {
    var self = this;
    if (typeof XLSX === 'undefined') {
      AMX.toast('La bibliothèque Excel n\'est pas encore chargée — réessayez dans un instant.', 'erreur');
      return;
    }
    var suffixe = g.key + '-' + s.key;
    var lecteur = new FileReader();
    lecteur.onload = function (e) {
      var lignes;
      try {
        var wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        var feuille = wb.Sheets[wb.SheetNames[0]];
        lignes = XLSX.utils.sheet_to_json(feuille, { header: 1, raw: false, defval: '' });
      } catch (err) {
        AMX.toast('Fichier illisible : ' + fichier.name, 'erreur');
        return;
      }
      if (!lignes || !lignes.length) { AMX.toast('Le fichier « ' + fichier.name + ' » est vide.', 'attention'); return; }
      var entetes = lignes[0];
      var corps = lignes.slice(1).filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });

      var etat = self.etatSources[g.key][s.key];
      etat.data = corps; etat.headers = entetes; etat.nom = fichier.name;

      var select = self.q('col-' + suffixe);
      AMX.vider(select);
      entetes.forEach(function (hd, i) {
        select.appendChild(h('option', { value: String(i), text: String(hd || '').trim() || '(colonne ' + (i + 1) + ')' }));
      });
      var detecte = detecterColonneVin(entetes);
      select.value = String(detecte !== -1 ? detecte : 0);
      etat.colIndex = parseInt(select.value, 10) || 0;

      self.q('colrow-' + suffixe).classList.remove('cache');
      self.q('label-' + suffixe).textContent = fichier.name;
      self.q('drop-' + suffixe).classList.add('charge');

      self.majVins(g, s);
      self.verifierPret(g);
    };
    lecteur.onerror = function () { AMX.toast('Lecture impossible : ' + fichier.name, 'erreur'); };
    lecteur.readAsArrayBuffer(fichier);
  };

  Verification.prototype.majVins = function (g, s) {
    var etat = this.etatSources[g.key][s.key];
    var idx = etat.colIndex;
    var vins = new Set();
    (etat.data || []).forEach(function (row) { var v = normVin(row[idx]); if (v) vins.add(v); });
    etat.vins = vins;
    var compte = this.q('count-' + g.key + '-' + s.key);
    AMX.vider(compte);
    compte.appendChild(h('span.badge.' + (vins.size ? 'vert' : 'ambre'), { text: vins.size + ' VIN détecté' + (vins.size > 1 ? 's' : '') }));
  };

  Verification.prototype.verifierPret = function (g) {
    var etats = this.etatSources[g.key];
    var pret = g.sources.every(function (s) { return etats[s.key].data !== null; });
    this.q('compare-btn-' + g.key).disabled = !pret;
  };

  /* --------------------------- Comparaison ---------------------------- */
  Verification.prototype.comparer = function (g) {
    var etats = this.etatSources[g.key];
    var ecarts = []; // { titre, vins, type }
    g.comparerA.forEach(function (cmpKey) {
      var principaux = etats[g.principale].vins, autres = etats[cmpKey].vins;
      var seulementPrincipaux = Array.from(principaux).filter(function (v) { return !autres.has(v); }).sort();
      var seulementAutres = Array.from(autres).filter(function (v) { return !principaux.has(v); }).sort();
      ecarts.push({ titre: 'Dans ' + libelleSource(g, g.principale) + ' mais absents de ' + libelleSource(g, cmpKey), vins: seulementPrincipaux, type: 'erreur' });
      ecarts.push({ titre: 'Dans ' + libelleSource(g, cmpKey) + ' mais absents de ' + libelleSource(g, g.principale), vins: seulementAutres, type: 'attention' });
    });

    var tous = new Set();
    g.sources.forEach(function (s) { etats[s.key].vins.forEach(function (v) { tous.add(v); }); });
    var rows = Array.from(tous).sort().map(function (vin) {
      var row = { vin: vin };
      g.sources.forEach(function (s) { row[s.key] = etats[s.key].vins.has(vin); });
      row._allPresent = g.sources.every(function (s) { return row[s.key]; });
      return row;
    });

    this.resultats[g.key] = { rows: rows, filtre: 'mismatch', recherche: '' };
    this.rendreResultats(g, ecarts);
    AMX.toast('Comparaison « ' + g.titre + ' » terminée', 'ok');
  };

  Verification.prototype.blocEcart = function (e) {
    var vide = e.vins.length === 0;
    var alerte = h('div.alerte-bloc.' + (vide ? 'ok' : e.type), [
      h('span', { html: vide ? I.ok : I.alerte }),
      h('div.texte', [h('b', { text: e.titre }), vide ? h('span', 'Aucun — pas d\'écart sur ce point.') : null]),
      h('span.badge.' + (vide ? 'vert' : (e.type === 'erreur' ? 'rouge' : 'ambre')), { text: String(e.vins.length) })
    ]);
    var bloc = h('div.outils-ecart', [alerte]);
    if (!vide) {
      bloc.appendChild(h('div.outils-defile', [
        h('table.tableau', [h('tbody', e.vins.map(function (v) { return h('tr', [h('td.mono', { text: v })]); }))])
      ]));
    }
    return bloc;
  };

  Verification.prototype.rendreResultats = function (g, ecarts) {
    var self = this;
    var etats = this.etatSources[g.key];
    var totalEcarts = ecarts.reduce(function (somme, e) { return somme + e.vins.length; }, 0);

    var compteurs = h('div.outils-compteurs',
      g.sources.map(function (s) { return h('span.badge.gris', { text: etats[s.key].vins.size + ' VIN · ' + s.libelle }); })
        .concat([h('span.badge.' + (totalEcarts ? 'rouge' : 'vert'), { text: totalEcarts + ' écart' + (totalEcarts > 1 ? 's' : '') + ' détecté' + (totalEcarts > 1 ? 's' : '') })])
    );

    var blocs = ecarts.map(function (e) { return self.blocEcart(e); });

    var btnBascule = h('button.btn#toggle-full-table-' + g.key, { type: 'button', text: 'Voir le tableau complet' });
    var recherche = h('input.saisie#search-' + g.key, { type: 'search', placeholder: 'Rechercher un VIN…', autocomplete: 'off', spellcheck: 'false' });
    var btnEcarts = h('button.actif', { type: 'button', text: 'Écarts seulement', dataset: { filter: 'mismatch', group: g.key } });
    var btnTous = h('button', { type: 'button', text: 'Tous les VIN', dataset: { filter: 'all', group: g.key } });
    var tbody = h('tbody#results-tbody-' + g.key);
    var vide = h('div.outils-vide.cache#results-empty-' + g.key, { text: 'Aucun véhicule ne correspond à ce filtre.' });
    var zoneTableau = h('div.cache#full-table-zone-' + g.key, [
      h('div.outils-barre', [
        h('div.recherche', [h('span', { html: I.recherche }), recherche]),
        h('div.segment', [btnEcarts, btnTous])
      ]),
      h('table.tableau', [
        h('thead', [h('tr', [h('th', 'VIN')].concat(g.sources.map(function (s) { return h('th.outils-centre', { text: s.libelle }); })))]),
        tbody
      ]),
      vide
    ]);

    var zone = this.q('results-zone-' + g.key);
    AMX.vider(zone);
    zone.appendChild(compteurs);
    blocs.forEach(function (b) { zone.appendChild(b); });
    zone.appendChild(h('div.outils-bascule', [btnBascule]));
    zone.appendChild(zoneTableau);

    btnBascule.addEventListener('click', function () {
      var visible = !zoneTableau.classList.contains('cache');
      zoneTableau.classList.toggle('cache', visible);
      btnBascule.textContent = visible ? 'Voir le tableau complet' : 'Masquer le tableau complet';
      if (!visible) self.rendreTableau(g);
    });
    [btnEcarts, btnTous].forEach(function (b) {
      b.addEventListener('click', function () {
        btnEcarts.classList.toggle('actif', b === btnEcarts);
        btnTous.classList.toggle('actif', b === btnTous);
        self.resultats[g.key].filtre = b.dataset.filter;
        self.rendreTableau(g);
      });
    });
    recherche.addEventListener('input', function () {
      self.resultats[g.key].recherche = recherche.value.trim().toUpperCase();
      self.rendreTableau(g);
    });
  };

  Verification.prototype.rendreTableau = function (g) {
    var r = this.resultats[g.key];
    if (!r) return;
    var liste = r.rows.slice();
    if (r.filtre === 'mismatch') liste = liste.filter(function (x) { return !x._allPresent; });
    if (r.recherche) liste = liste.filter(function (x) { return x.vin.indexOf(r.recherche) >= 0; });

    var tbody = this.q('results-tbody-' + g.key), vide = this.q('results-empty-' + g.key);
    AMX.vider(tbody);
    vide.classList.toggle('cache', liste.length > 0);
    liste.forEach(function (x) {
      var tr = h('tr' + (x._allPresent ? '' : '.outils-ligne-ecart'), [h('td.mono', { text: x.vin })]);
      g.sources.forEach(function (s) {
        tr.appendChild(h('td.outils-centre', [h('span.outils-coche.' + (x[s.key] ? 'oui' : 'non'), { text: x[s.key] ? '✓' : '✕', title: x[s.key] ? 'Présent' : 'Absent' })]));
      });
      tbody.appendChild(tr);
    });
  };

  /* =====================================================================
     Onglet « Import CARFAX » — les liens publics des rapports du compte
     concessionnaire (dealer.carfax.ca › Mes rapports › Mes RHV), par VIN.
     Trois chemins : le signet (un clic sur la page Mes RHV), le collage de
     la page, ou l'arrivée par #/outils/carfax?import=<base64 JSON>.
     ===================================================================== */
  var SITE_CARFAX = 'https://dealer.carfax.ca/MyReports';
  // Le signet : lit chaque ligne de « Mes RHV » (VIN + lien vhr.carfax.ca +
  // no de rapport + date) et revient ici avec la liste dans l'adresse.
  var CODE_SIGNET = "javascript:(function(){var o=[],t=[].slice.call(document.querySelectorAll('tr'));t.forEach(function(r){var a=[].slice.call(r.querySelectorAll('a')).filter(function(x){return/vhr\\.carfax\\.ca\\/\\?id=/.test(x.href)})[0];if(!a)return;var c=r.querySelector('td');var v=c?(c.textContent.trim().toUpperCase().match(/^[A-HJ-NPR-Z0-9]{17}/)||[])[0]:'';if(!v)return;var x=r.textContent;var n=(x.match(/v[ée]hicule\\s*(\\d{6,10})/i)||x.match(/Report\\s*(\\d{6,10})/i)||[])[1]||'';var d=(x.match(/\\d{2}\\/\\d{2}\\/\\d{4}/)||[])[0]||'';if(!o.some(function(y){return y.vin===v}))o.push({vin:v,lien:a.href,rapport:n,date:d})});if(!o.length){alert('Aucun rapport trouv\\u00e9 ici. Ouvrez Mes rapports > Mes RHV dans votre compte CARFAX, puis cliquez de nouveau.');return}location.href='" + AMX.SITE + "#/outils/carfax?import='+encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(o)))))})();";

  function ImportCarfax(ctx) {
    var self = this;
    // La liste en attente survit au va-et-vient avec le site CARFAX (le signet
    // recharge la page) : une page de « Mes RHV » à la fois, jusqu'à Enregistrer.
    this.liens = AMX.memo.lire('carfax_attente', []);
    this.el = h('div.page.etroite');
    this.construire();
    this.naviguer(ctx || {});
    AMX.inventaire.tout().catch(function () { return []; }).then(function () { self.rendreListe(); });
    AMX.carfax.charger().then(function () { self.rendreListe(); }).catch(function () {});
  }
  ImportCarfax.prototype.demonter = function () {};
  ImportCarfax.prototype.naviguer = function (ctx) {
    var brut = ctx && ctx.params && ctx.params['import'];
    if (!brut) return;
    try {
      var json = decodeURIComponent(escape(atob(brut)));
      var liste = JSON.parse(json);
      if (Array.isArray(liste)) { this.recevoir(liste, 'signet'); }
    } catch (e) { AMX.toast('Liste reçue illisible : recommencez depuis le signet.', 'erreur'); }
    // On nettoie l'adresse : la liste est en mémoire, inutile de la rejouer.
    history.replaceState(null, '', AMX.lien('outils', 'carfax'));
  };
  ImportCarfax.prototype.construire = function () {
    var self = this;
    var signet = h('a.btn.primaire', { href: CODE_SIGNET, text: 'Automax ← CARFAX', title: 'Glissez ce bouton dans votre barre de favoris', draggable: 'true' });
    signet.addEventListener('click', function (e) { e.preventDefault(); AMX.toast('Glissez ce bouton dans la barre de favoris de Chrome (Cmd+Shift+B pour l\'afficher), puis cliquez-le depuis votre compte CARFAX.', 'attention', 7000); });
    this.zoneColle = h('textarea.saisie', { rows: '6', placeholder: 'Ou collez ici des liens de rapports (un par ligne, avec le VIN devant si possible) :\n1FT8W2BT7NEC52018  https://vhr.carfax.ca/?id=…' });
    var btnColle = h('button.btn', { text: 'Lire ce qui est collé', onclick: function () { self.lireCollage(); } });
    this.elListe = h('div');
    this.elResume = h('div.doux.petit', { style: { marginTop: '8px' } });
    this.el.appendChild(h('div.entete-page', [
      h('div', [h('h1', 'Import des rapports CARFAX'), h('p', 'Récupère en un clic les liens publics des rapports que vous avez déjà commandés dans votre compte CARFAX Canada, et les attache aux véhicules. Le lien apparaît ensuite dans la fiche du véhicule et sur la page de l\'acheteur.')]),
      h('div.actions', [h('a.btn', { href: SITE_CARFAX, target: '_blank', rel: 'noopener', html: I.externe + '<span>Ouvrir mon compte CARFAX</span>' })])
    ]));
    this.el.appendChild(h('div.carte', { style: { marginBottom: '14px' } }, [
      h('div.carte-entete', [h('h2', 'En un clic : le signet « Automax ← CARFAX »')]),
      h('div.carte-corps', [
        h('div.grille.c3', [
          h('div', [h('div.section-titre', '1. Installer (une fois)'), h('p', { style: { margin: '0 0 10px', color: 'var(--encre-2)' } }, 'Glissez ce bouton dans la barre de favoris de Chrome. Si la barre est cachée : Cmd+Shift+B.'), signet]),
          h('div', [h('div.section-titre', '2. Dans CARFAX'), h('p', { style: { margin: 0, color: 'var(--encre-2)' } }, 'Ouvrez Mes rapports › Mes RHV dans votre compte (une concession à la fois : « Changez d\'emplacement » pour les autres).')]),
          h('div', [h('div.section-titre', '3. Cliquer le signet'), h('p', { style: { margin: 0, color: 'var(--encre-2)' } }, 'Vous revenez ici avec la liste des rapports de la page. Vérifiez, puis « Enregistrer ».')])
        ])
      ])
    ]));
    this.el.appendChild(h('div.carte', { style: { marginBottom: '14px' } }, [
      h('div.carte-entete', [h('h2', 'Ou coller des liens')]),
      h('div.carte-corps', [this.zoneColle, h('div', { style: { marginTop: '10px' } }, [btnColle])])
    ]));
    this.seulementInventaire = AMX.memo.lire('carfax_seulement_inv', true);
    var caseInv = h('input', { type: 'checkbox', checked: this.seulementInventaire });
    caseInv.addEventListener('change', function () { self.seulementInventaire = caseInv.checked; AMX.memo.ecrire('carfax_seulement_inv', caseInv.checked); self.rendreListe(); });
    this.elCarte = h('div.carte', [h('div.carte-entete', [h('h2', 'Rapports trouvés'), h('div.actions-ligne', [
      h('label.case', { title: 'Les rapports de véhicules qui ne sont plus à l\'inventaire sont laissés de côté' }, [caseInv, h('span', 'Seulement les véhicules à l\'inventaire')]),
      h('button.btn.fantome', { text: 'Vider la liste', onclick: function () { self.liens = []; AMX.memo.ecrire('carfax_attente', []); self.rendreListe(); } }),
      h('button.btn.primaire#cfx-enregistrer', { text: 'Enregistrer', disabled: true, onclick: function () { self.enregistrer(); } })])]), h('div.carte-corps', [this.elListe, this.elResume])]);
    this.el.appendChild(this.elCarte);
  };
  ImportCarfax.prototype.lireCollage = function () {
    var lignes = String(this.zoneColle.value || '').split(/\r?\n/);
    var liste = [];
    lignes.forEach(function (l) {
      var lien = (l.match(/https:\/\/vhr\.carfax\.ca\/\?id=[^\s"'<>]+/i) || [])[0];
      if (!lien) return;
      var vin = (l.toUpperCase().match(/\b[A-HJ-NPR-Z0-9]{17}\b/) || [])[0] || '';
      liste.push({ vin: vin, lien: lien });
    });
    if (!liste.length) { AMX.toast('Aucun lien vhr.carfax.ca trouvé dans le texte collé.', 'attention'); return; }
    this.recevoir(liste, 'collage');
  };
  ImportCarfax.prototype.recevoir = function (liste, source) {
    var self = this;
    var recus = liste.map(function (x) { return { vin: String(x.vin || '').toUpperCase(), lien: String(x.lien || '').trim(), rapport: String(x.rapport || ''), date: String(x.date || ''), source: source }; })
      .filter(function (x) { return AMX.carfax.valide(x.lien); });
    // Fusion avec ce qui attend déjà (autres pages de « Mes RHV ») : le plus
    // récent gagne pour un même VIN.
    var parVin = {};
    this.liens.forEach(function (x) { if (x.vin) parVin[x.vin] = x; });
    var ajoutes = 0;
    recus.forEach(function (x) { if (!x.vin) { self.liens.push(x); ajoutes++; return; } if (!parVin[x.vin]) ajoutes++; parVin[x.vin] = x; });
    this.liens = this.liens.filter(function (x) { return !x.vin; }).concat(Object.keys(parVin).map(function (k) { return parVin[k]; }));
    AMX.memo.ecrire('carfax_attente', this.liens);
    AMX.toast(recus.length + ' rapport' + (recus.length > 1 ? 's' : '') + ' reçu' + (recus.length > 1 ? 's' : '') + ' de CARFAX' + (ajoutes !== recus.length ? ' (' + (recus.length - ajoutes) + ' déjà dans la liste)' : '') + ' — page suivante ? Cliquez « Suivant » dans CARFAX puis le signet.', 'ok', 7000);
    this.rendreListe();
    if (this.elCarte.scrollIntoView) this.elCarte.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  ImportCarfax.prototype.rendreListe = function () {
    var self = this;
    AMX.vider(this.elListe);
    var btn = this.el.querySelector('#cfx-enregistrer');
    if (!this.liens.length) {
      this.elListe.appendChild(h('div.vide', [h('div', { html: I.lien }), h('h3', 'Aucun rapport en attente'), h('div', 'Cliquez le signet depuis votre compte CARFAX, ou collez des liens ci-dessus.')]));
      this.elResume.textContent = '';
      if (btn) btn.disabled = true;
      return;
    }
    var table = h('table.tableau'), corps = h('tbody');
    table.appendChild(h('thead', [h('tr', [h('th', 'VIN'), h('th', 'Véhicule à l\'inventaire'), h('th', 'Rapport'), h('th', 'État')])]));
    var nouveaux = 0, memes = 0, remplaces = 0, sansVin = 0, horsInv = 0;
    this.liens.forEach(function (x, i) {
      var v = x.vin ? AMX.inventaire.parVin(x.vin) : null;
      var actuel = x.vin ? AMX.carfax.lien(x.vin) : '';
      var etat, cls;
      if (!x.vin) { etat = 'VIN manquant — à compléter'; cls = 'attention'; sansVin++; }
      else if (!v && self.seulementInventaire) { etat = 'Hors inventaire — ignoré'; cls = ''; }
      else if (actuel === x.lien) { etat = 'Déjà enregistré'; cls = ''; memes++; }
      else if (actuel) { etat = 'Remplacera le lien actuel'; cls = 'info'; remplaces++; }
      else { etat = 'Nouveau'; cls = 'ok'; nouveaux++; }
      if (x.vin && !v) horsInv++;
      var champVin = h('input.saisie.mono', { value: x.vin, placeholder: 'VIN', style: { width: '190px', height: '30px' }, oninput: function (e) { x.vin = e.target.value.trim().toUpperCase(); } });
      champVin.addEventListener('change', function () { self.rendreListe(); });
      corps.appendChild(h('tr', [
        h('td', [x.vin ? h('span.mono', { text: x.vin }) : champVin]),
        h('td', v ? [h('div', { text: v.modele || '' }), h('div.mini', { text: AMX.inventaire.nomFeuille(v._feuille) + (v.stock ? ' · ' + v.stock : '') })] : [h('span.mini', { text: x.vin ? (self.seulementInventaire ? 'Pas à l\'inventaire' : 'Pas à l\'inventaire (lien gardé quand même)') : '' })]),
        h('td', [h('a', { href: x.lien, target: '_blank', rel: 'noopener', text: x.rapport ? 'No ' + x.rapport : 'Ouvrir' }), x.date ? h('div.mini', { text: x.date }) : null]),
        h('td', [h('span.puce' + (cls ? '.' + cls : ''), { text: etat })])
      ]));
    });
    table.appendChild(corps);
    this.elListe.appendChild(table);
    this.elResume.textContent = nouveaux + ' nouveau' + (nouveaux > 1 ? 'x' : '') + ' · ' + remplaces + ' à remplacer · ' + memes + ' déjà en place' + (sansVin ? ' · ' + sansVin + ' sans VIN (ignoré' + (sansVin > 1 ? 's' : '') + ')' : '') + (horsInv ? ' · ' + horsInv + ' hors inventaire' + (self.seulementInventaire ? ' (ignorés)' : '') : '');
    if (btn) { btn.disabled = !(nouveaux + remplaces); btn.textContent = 'Enregistrer ' + (nouveaux + remplaces) + ' lien' + (nouveaux + remplaces > 1 ? 's' : ''); }
  };
  // Taille des lots envoyés au serveur : chaque VIN sans ligne Vitrine coûte
  // une écriture dans la feuille, et la requête doit rester sous la minute.
  var LOT_CARFAX = 60;
  ImportCarfax.prototype.enregistrer = function () {
    var self = this;
    var aEnvoyer = this.liens.filter(function (x) { return x.vin && /^[A-HJ-NPR-Z0-9]{11,17}$/.test(x.vin) && AMX.carfax.lien(x.vin) !== x.lien && (!self.seulementInventaire || AMX.inventaire.parVin(x.vin)); })
      .map(function (x) { return { vin: x.vin, lien: x.lien, rapport: x.rapport, date: x.date }; });
    if (!aEnvoyer.length) return;
    var btn = this.el.querySelector('#cfx-enregistrer'); btn.classList.add('occupe');
    var lots = [];
    for (var i = 0; i < aEnvoyer.length; i += LOT_CARFAX) lots.push(aEnvoyer.slice(i, i + LOT_CARFAX));
    var enregistres = [], refuses = [], faits = 0;
    var suite = Promise.resolve();
    lots.forEach(function (lot, k) {
      suite = suite.then(function () {
        if (lots.length > 1) btn.textContent = 'Enregistrement… ' + Math.min(aEnvoyer.length, (k + 1) * LOT_CARFAX) + ' / ' + aEnvoyer.length;
        return AMX.carfax.enregistrer(lot).then(function (d) {
          enregistres = enregistres.concat(d.enregistres || []); refuses = refuses.concat(d.refuses || []); faits++;
          // Ce qui est enregistré sort tout de suite de la liste : si un lot
          // suivant échoue, on ne renverra que ce qui reste.
          self.liens = self.liens.filter(function (x) { return (d.enregistres || []).indexOf(x.vin) < 0; });
          AMX.memo.ecrire('carfax_attente', self.liens);
        });
      });
    });
    suite.then(function () {
      var n = enregistres.length;
      AMX.toast(n + ' lien' + (n > 1 ? 's' : '') + ' CARFAX enregistré' + (n > 1 ? 's' : '') + (refuses.length ? ' · ' + refuses.length + ' refusé(s)' : ''), 'ok', 6000);
      // Les « hors inventaire » ignorés sortent aussi (ils reviendront au prochain clic du signet si besoin).
      if (self.seulementInventaire) self.liens = self.liens.filter(function (x) { return !(x.vin && !AMX.inventaire.parVin(x.vin)); });
      AMX.memo.ecrire('carfax_attente', self.liens);
    }).catch(function (e) {
      AMX.toast(AMX.erreurTexte(e) + (faits ? ' — ' + enregistres.length + ' lien(s) déjà enregistré(s), cliquez de nouveau pour le reste.' : ''), 'erreur', 8000);
    }).finally(function () { btn.classList.remove('occupe'); self.rendreListe(); });
  };
})();
