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

   Import CARFAX — signet « Automax ← CARFAX » et zone de collage (plus bas).

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
      '.outils-page .outils-note { margin: 0; font-size: 11.5px; color: var(--encre-3); line-height: 1.5; }',
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
      { id: 'evaluations', titre: 'Registre d\'évaluations' },
      { id: 'torque', titre: 'Archive Torque' },
      { id: 'eblock', titre: 'Fiches eBlock' },
      { id: 'openlane', titre: 'Valeurs OpenLane' },
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
    var id = (ctx && (ctx.onglet === 'verification' || ctx.onglet === 'carfax' || ctx.onglet === 'evaluations' || ctx.onglet === 'torque' || ctx.onglet === 'eblock' || ctx.onglet === 'openlane')) ? ctx.onglet : 'evaluation';
    if (!this.vues[id]) {
      this.vues[id] = id === 'verification' ? new Verification(ctx) : (id === 'carfax' ? new ImportCarfax(ctx) : (id === 'evaluations' ? new AMX.vues.RegistreEvaluations(ctx) : (id === 'torque' ? new AMX.vues.ArchiveTorque(ctx) : (id === 'eblock' ? new AMX.vues.FichesEblock(ctx) : (id === 'openlane' ? new AMX.vues.ValeursOpenlane(ctx) : new AMX.vues.Evaluation(ctx))))));
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
  var CODE_SIGNET = "javascript:(function () { var s = document.createElement('script'); s.src = " + JSON.stringify(AMX.SITE) + " + 'assets/signet-carfax.js?t=' + Date.now(); s.onerror = function () { alert(\"Impossible de charger le signet depuis le site d'inventaire (groupeautomax.github.io). V\u00e9rifiez votre connexion, puis recliquez.\"); }; document.body.appendChild(s); })();";

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
    signet.addEventListener('click', function (e) { e.preventDefault(); AMX.toast('Glissez ce bouton dans la barre de favoris de Chrome (Cmd+Shift+B pour l\'afficher), puis cliquez-le depuis votre compte CARFAX (Mes rapports › Mes RHV).', 'attention', 7000); });
    this.zoneColle = h('textarea.saisie', { rows: '6', placeholder: 'Ou collez ici des liens de rapports (un par ligne, avec le VIN devant si possible) :\n1FT8W2BT7NEC52018  https://vhr.carfax.ca/?id=…' });
    var btnColle = h('button.btn', { text: 'Lire ce qui est collé', onclick: function () { self.lireCollage(); } });
    this.elListe = h('div');
    this.elResume = h('div.doux.petit', { style: { marginTop: '8px' } });
    this.el.appendChild(h('div.entete-page', [
      h('div', [h('h1', 'Import des rapports CARFAX'), h('p', 'Récupère en un clic les liens publics des rapports que vous avez déjà commandés dans votre compte CARFAX Canada, et les attache aux véhicules — à l\'inventaire ou non. Le lien apparaît dans la fiche du véhicule, sur la page de l\'acheteur, et la recherche du site (en haut) retrouve le rapport d\'un véhicule parti par son NIV.')]),
      h('div.actions', [h('a.btn', { href: SITE_CARFAX, target: '_blank', rel: 'noopener', html: I.externe + '<span>Ouvrir mon compte CARFAX</span>' })])
    ]));
    this.el.appendChild(h('div.carte', { style: { marginBottom: '14px' } }, [
      h('div.carte-entete', [h('h2', 'En un clic : le signet « Automax ← CARFAX »')]),
      h('div.carte-corps', [
        h('div.grille.c3', [
          h('div', [h('div.section-titre', '1. Installer (une fois)'), h('p', { style: { margin: '0 0 10px', color: 'var(--encre-2)' } }, 'Glissez ce bouton dans la barre de favoris de Chrome. Si la barre est cachée : Cmd+Shift+B.'), signet]),
          h('div', [h('div.section-titre', '2. Dans CARFAX'), h('p', { style: { margin: 0, color: 'var(--encre-2)' } }, 'Ouvrez Mes rapports › Mes RHV dans votre compte (une concession à la fois : « Changez d\'emplacement » pour les autres).')]),
          h('div', [h('div.section-titre', '3. Cliquer le signet'), h('p', { style: { margin: 0, color: 'var(--encre-2)' } }, 'Il parcourt lui-même les pages et enregistre au fur et à mesure (une petite fenêtre du site s\'ouvre à côté : laissez-la). Interrompu ? Recliquez-le : il reprend à la page où il était. Rien à faire ici ensuite.')])
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
      var lien = (l.match(/https:\/\/vhr\.carfax\.ca\/(?:main)?\?id=[^\s"'<>]+/i) || [])[0];
      if (!lien) return;
      var vin = (l.toUpperCase().match(/\b[A-HJ-NPR-Z0-9]{17}\b/) || [])[0] || '';
      liste.push({ vin: vin, lien: lien });
    });
    if (!liste.length) { AMX.toast('Aucun lien vhr.carfax.ca trouvé dans le texte collé.', 'attention'); return; }
    this.recevoir(liste, 'collage');
  };
  // Vrai si la date a (jj/mm/aaaa) est strictement plus récente que b.
  function plusRecent(a, b) {
    var ma = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(a || ''), mb = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(b || '');
    if (!ma || !mb) return false;
    return (ma[3] + ma[2] + ma[1]) > (mb[3] + mb[2] + mb[1]);
  }
  ImportCarfax.prototype.recevoir = function (liste, source) {
    var self = this;
    var recus = liste.map(function (x) { return { vin: String(x.vin || '').toUpperCase(), lien: String(x.lien || '').trim(), rapport: String(x.rapport || ''), date: String(x.date || ''), source: source }; })
      .filter(function (x) { return AMX.carfax.valide(x.lien); });
    // Fusion avec ce qui attend déjà (autres pages de « Mes RHV ») : le plus
    // récent gagne pour un même VIN.
    var parVin = {};
    this.liens.forEach(function (x) { if (x.vin) parVin[x.vin] = x; });
    var ajoutes = 0;
    // Deux rapports pour un même VIN (ex. commandé à deux concessions) : on
    // garde le plus récent quand les dates sont connues, sinon le dernier reçu.
    recus.forEach(function (x) { if (!x.vin) { self.liens.push(x); ajoutes++; return; } if (!parVin[x.vin]) ajoutes++; else if (plusRecent(parVin[x.vin].date, x.date)) return; parVin[x.vin] = x; });
    this.liens = this.liens.filter(function (x) { return !x.vin; }).concat(Object.keys(parVin).map(function (k) { return parVin[k]; }));
    AMX.memo.ecrire('carfax_attente', this.liens);
    AMX.toast(recus.length + ' rapport' + (recus.length > 1 ? 's' : '') + ' reçu' + (recus.length > 1 ? 's' : '') + ' de CARFAX' + (ajoutes !== recus.length ? ' (' + (recus.length - ajoutes) + ' déjà dans la liste)' : '') + '. Vérifiez puis « Enregistrer » ; autre concession ? « Changez d\'emplacement » dans CARFAX puis le signet.', 'ok', 7000);
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
      if (btn) { btn.disabled = true; btn.textContent = 'Enregistrer'; }
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
  var LOT_CARFAX = 40;
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
