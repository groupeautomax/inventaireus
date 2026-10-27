/* =========================================================================
   Section « Outils » : trois onglets.

   Évaluation marché — vue `AMX.vues.Evaluation` (assets/evaluation.js) :
   analyse de marché MarketCheck, prix agressif / standard / conservateur,
   comparables. Route : #/outils/evaluation?vin=… préremplit et charge.
   Registre d'évaluations — `AMX.vues.RegistreEvaluations` (même fichier) :
   toutes les évaluations enregistrées, par concession.

   Vérification Excel — aucun serveur : on lit des fichiers Excel (SheetJS,
   `XLSX` chargé par index.html en defer) et on compare les listes de NIV de
   chaque groupe (Neuf, Usager Canada, US) à leur source de financement.
     Les ids générés (file-/col-/drop-/label-/colrow-/count-{groupe}-{source},
     compare-btn-{g}, results-zone-{g}, toggle-full-table-{g},
     full-table-zone-{g}, search-{g}, results-tbody-{g}, results-empty-{g})
     reprennent ceux de l'ancienne page.

   (27 oct. : l'onglet « Import CARFAX » et son favori sont retirés — l'API officielle de CARFAX, Carfax.gs, lit
   elle-même les rapports ; un lien se colle encore à la main dans le panneau Occasion.)

   Les onglets restent montés tant qu'on est dans la section : changer
   d'onglet ne perd pas ce qui a été tapé ou téléversé.
   ========================================================================= */
(function () {
  'use strict';
  var h = AMX.h, esc = AMX.esc, I = AMX.icones;

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
  function injecterCss() {
    if (document.getElementById('css-outils')) return;
    var s = document.createElement('style');
    s.id = 'css-outils';
    s.textContent = [
      '.outils-page .carte { margin-bottom: 14px; }',
      '.outils-page .carte-entete .titre { min-width: 0; }',
      '.outils-page .carte-entete .titre p { margin: 2px 0 0; font-size: 12px; color: var(--encre-3); }',
      '.outils-page .outils-pile { display: flex; flex-direction: column; gap: 12px; }',
      '.outils-page .outils-note { margin: 0; font-size: 12px; color: var(--encre-3); line-height: 1.5; }',
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
      '.outils-ecart .alerte-bloc .texte span { display: block; font-size: 12px; opacity: .85; margin-top: 1px; }',
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
      '  .outils-page .carte-entete { flex-wrap: wrap; }',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ------------------------------ Section ------------------------------ */
  AMX.section('outils', {
    titre: 'Outils', icone: 'outils', ordre: 40,
    onglets: [
      { id: 'imports', titre: 'Imports', visible: function () { return !!(AMX.importsEtat && AMX.importsEtat.voit()); }, compteur: function () { return AMX.importsEtat ? AMX.importsEtat.compteur() : ''; } },   /* 27 oct. : tous les imports, par concession (imports.js) */
      { id: 'evaluation', titre: 'Évaluation marché' },
      { id: 'evaluations', titre: 'Registre d\'évaluations' },
      { id: 'torque', titre: 'Archive Torque' },
      { id: 'eblock', titre: 'Fiches eBlock' },
      { id: 'openlane', titre: 'Valeurs OpenLane' },
      { id: 'opportunites', titre: 'Opportunités d\'achat' },   /* 24 oct. : assets/opportunites.js (AMX.vues.Opportunites) */
      { id: 'verification', titre: 'Vérification Excel' },
      { id: 'd2c', titre: 'Import D2C' },
      { id: 'equite', titre: 'Portefeuille BMW' }   /* 21 oct. : export InfoBahn (BMW Financial Services) → onglet Équité des neufs */
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
    var id = (ctx && (ctx.onglet === 'verification' || ctx.onglet === 'evaluations' || ctx.onglet === 'torque' || ctx.onglet === 'eblock' || ctx.onglet === 'openlane' || ctx.onglet === 'd2c' || ctx.onglet === 'equite' || ctx.onglet === 'opportunites' || ctx.onglet === 'imports')) ? ctx.onglet : 'evaluation';
    if (!this.vues[id]) {
      // 16 oct. : « Import D2C » (assets/d2c.js, AMX.vues.ImportD2c) — l'inventaire que D2C Media reçoit du DMS.
      this.vues[id] = id === 'imports' ? new AMX.vues.Imports(ctx) : id === 'verification' ? new Verification(ctx) : (id === 'd2c' ? new AMX.vues.ImportD2c(ctx) : (id === 'equite' ? new AMX.vues.ImportPortefeuille(ctx) : (id === 'evaluations' ? new AMX.vues.RegistreEvaluations(ctx) : (id === 'torque' ? new AMX.vues.ArchiveTorque(ctx) : (id === 'eblock' ? new AMX.vues.FichesEblock(ctx) : (id === 'openlane' ? new AMX.vues.ValeursOpenlane(ctx) : (id === 'opportunites' ? new AMX.vues.Opportunites(ctx) : new AMX.vues.Evaluation(ctx))))))));
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
        h('h1', 'Vérification Excel'),
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
})();
