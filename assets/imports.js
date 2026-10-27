/* Outils › Imports (27 octobre 2026) — une seule page pour tous les imports, concession par concession.

   Maxime : « je crois que tous les onglets d'importation devraient être à une même page pour chaque concession ».
   - La concession choisie en haut du site décide de ce qu'on voit ; « Tout le groupe » les montre toutes, l'une sous l'autre.
   - Une carte par import : rouge = à faire, vert = fait (date du dernier passage), le portail du fournisseur, le favori
     à cliquer et les étapes. Les cartes rouges sont ouvertes, les vertes repliées.
   - Les favoris à installer une fois dans Chrome sont réunis en haut (registre AMX.signets : chaque module y inscrit le sien).
   - Données : GET ?importsEtat=1 (Imports.gs), la même lecture que la carte de l'Accueil (AMX.importsEtat, accueil.js).
   - Les étapes lourdes restent sur leur page (simulation et import D2C, dépôt du fichier InfoBahn, collage CARFAX) :
     le bouton « Page détaillée » y mène.
   - #/outils/imports?imp=<id> ouvre et montre l'import demandé (lien « Comment faire » de l'Accueil). */
(function () {
  'use strict';
  var h = AMX.h, I = AMX.icones;
  var ORDRE_CIES = ['STM', 'HAWKS', 'BMW', 'VW', 'HYUNDAI'];
  var MODES = { favori: 'favori à cliquer', tache: 'tâche du Mac', auto: 'automatique' };
  var RANG_MODE = { favori: 0, tache: 1, auto: 2 };

  /* Ce qu'il faut faire pour chaque import (id d'Imports.gs). parCie remplace des champs pour une concession. */
  var GUIDE = {
    d2c: { court: 'inventaire D2C', favori: 'd2c', page: ['outils', 'd2c'], pageTexte: 'Simulation et import',
      partage: 'Un seul passage lit les 5 concessions.',
      tache: 'La tâche du Mac le fait du lundi au samedi à 6 h 15, quand le Mac est allumé.',
      etapes: ['Ouvrez D2C Media (bouton « Ouvrir le portail »), Inventory › Summary, au niveau « Groupe Auto Max » (menu en haut à gauche).',
        'Cliquez le favori : il lit toute la table (une vingtaine de secondes) et l\'envoie au site.',
        'Dans l\'onglet du site qui s\'ouvre (Outils › Import D2C), attendez la simulation puis cliquez « Importer ». Sans ce clic, rien n\'est importé.'] },
    ivsr: { court: 'IVS-R (BMW)', favori: 'constructeur', page: ['inventaire', 'neufs'], pageTexte: 'Neufs',
      tache: 'La tâche du Mac le fait du lundi au samedi à 6 h 40, quand le Mac est allumé.',
      etapes: ['Dans S-Gate, ouvrez Sales › IVS-R Ordering (bouton « Ouvrir le portail »).',
        'Allez dans Order Tracking › Order Locator Dealer.',
        'Cliquez le favori et restez sur l\'onglet environ une minute : stock et commandes.'] },
    rdr: { court: 'portail RDR (BMW)', favori: 'constructeur', page: ['inventaire', 'neufs', { onglet: 'ventes' }], pageTexte: 'Ventes déclarées',
      etapes: ['Dans S-Gate, ouvrez Sales › Retail Reporting (bouton « Ouvrir le portail »).',
        'Sur la liste des RDR, cliquez le favori : RDR des 12 derniers mois, objectifs et crédits (environ une minute).'] },
    gm: { court: 'utilitaire des commandes GM', favori: 'constructeur', page: ['inventaire', 'neufs'], pageTexte: 'Neufs',
      etapes: ['Ouvrez l\'utilitaire des commandes GM (bouton « Ouvrir le portail »), Gestion des stocks › Afficher l\'inventaire et les commandes.',
        'Vérifiez que la concession affichée est la bonne, puis cliquez le favori : stock, commandes et livraisons.',
        'Faites-le aussi pour l\'autre concession GM (Ste Marie ou Hawkesbury).'] },
    hyundai: { court: 'portail Hyundai', favori: 'constructeur', page: ['inventaire', 'neufs'], pageTexte: 'Neufs',
      etapes: ['Ouvrez le portail Hyundai (bouton « Ouvrir le portail »), Stock › Dealer Stock List.',
        'Cliquez le favori : stock, factures et ventes déclarées.'] },
    csi: { court: 'CSI BoostCX et InMoment', favori: 'constructeur', page: ['csi'], pageTexte: 'CSI',
      etapes: ['Ouvrez le site du CSI (bouton « Ouvrir le portail »).', 'Cliquez le favori : scores et sondages.'],
      parCie: {
        HYUNDAI: { etapes: ['Ouvrez BoostCX (bouton « Ouvrir le portail »), tableau de bord combiné.', 'Cliquez le favori : scores et sondages.'] },
        STM: { etapes: ['Ouvrez ISC InMoment (bouton « Ouvrir le portail »), Field Reporting.', 'Cliquez le favori et gardez l\'onglet au premier plan : les rapports InMoment prennent quelques minutes.'] },
        HAWKS: { etapes: ['Ouvrez ISC InMoment (bouton « Ouvrir le portail »), Field Reporting, avec le compte de Hawkesbury.', 'Cliquez le favori et gardez l\'onglet au premier plan : les rapports InMoment prennent quelques minutes.'] },
        BMW: { court: 'CSI BMW (Forsta)', favori: 'forsta', etapes: ['Ouvrez Forsta (bouton « Ouvrir le portail »), rapport « Ventes et service après-vente VoC ».',
          'Cliquez le favori « Automax ← CSI BMW » (pas le favori Constructeur : Forsta le bloque).',
          'Gardez l\'onglet au premier plan pendant la lecture des réponses (quelques minutes).'] }
      } },
    infobahn: { favori: '', page: ['outils', 'equite'], pageTexte: 'Déposer le fichier',
      etapes: ['Dans InfoBahn › Portfolio (bouton « Ouvrir le portail »), choisissez « Entire Portfolio ».',
        'Menu « … » de la liste › Export : le fichier SearchResults.xls se télécharge.',
        'Déposez-le dans Outils › Portefeuille BMW (bouton « Déposer le fichier »).'] },
    banque: { court: 'transactions bancaires InfoBahn', favori: 'infobahn', page: ['outils', 'equite'], pageTexte: 'Portefeuille BMW',
      etapes: ['Dans InfoBahn, ouvrez Payments › Bank Transactions (bouton « Ouvrir le portail »).',
        'Choisissez la période au besoin (Date Range › Filter).',
        'Cliquez le favori : dates de déboursé au Livre des ventes et liens payés.'] },
    gmf: { court: 'achats DealerSource', favori: 'gmf', page: ['outils', 'opportunites', { onglet: 'sources' }], pageTexte: 'Sources',
      note: 'Le favori a changé le 26 oct. (lecture de « Mes transactions ») : re-glissez-le une fois.',
      etapes: ['Connectez-vous à GM Financial DealerSource (bouton « Ouvrir le portail »).',
        'Ouvrez Mes transactions › Véhicules achetés et choisissez la concession en haut de la page.',
        'Cliquez le favori : les achats absents du registre y entrent en violet.',
        'Refaites-le pour l\'autre concession (changer de concession recharge la page).'] },
    manheim: { court: 'achats Manheim', favori: 'manheim', page: ['outils', 'opportunites', { onglet: 'sources' }], pageTexte: 'Sources',
      etapes: ['Ouvrez Manheim (bouton « Ouvrir le portail »), onglet Achats.',
        'Cliquez le favori : photos, état et CARFAX des achats ; ceux absents du registre y entrent en violet.',
        'Facultatif : onglet Disponible, même favori, pour les opportunités d\'achat.'] },
    carfax: { court: 'rapports CARFAX', favori: 'carfax', page: ['outils', 'carfax'], pageTexte: 'Import CARFAX',
      partage: 'La date vaut pour les trois emplacements CARFAX (Ste Marie, Hawkesbury, Hyundai Longueuil).',
      tache: 'La tâche du Mac le fait du lundi au samedi à 12 h 10 et 17 h 10, quand le Mac est allumé.',
      etapes: ['Ouvrez CARFAX (bouton « Ouvrir le portail »), Mes rapports › Mes RHV.',
        'Choisissez l\'emplacement en haut, puis cliquez le favori : il parcourt les pages tout seul.',
        'Refaites-le pour chaque emplacement.'] },
    eblock: { court: 'fiches eBlock', favori: 'eblock', page: ['outils', 'eblock'], pageTexte: 'Fiches eBlock',
      etapes: ['Ouvrez eBlock (bouton « Ouvrir le portail »), My Block › Buyer.',
        'Cliquez le favori : il lit les achats depuis janvier et les fiches des véhicules encore à l\'inventaire.'] },
    dms: { texte: 'Rien à faire : le serveur de la concession dépose l\'export du DMS chaque nuit dans le dossier Drive « Synchro », et ScanAutomax le lit tout seul. En rouge, l\'export n\'est pas arrivé : vérifier le serveur (NAS) de la concession.' },
    bmwhebdo: { texte: 'Claude Poulin ajoute chaque semaine l\'onglet « BMW Neuf AAAA-MM-JJ » dans le classeur « Inventaires BMW Sherbrooke et STM » ; ScanAutomax le lit le matin. En rouge, l\'onglet de la semaine manque.' },
    openlane: { texte: 'Le serveur lit les achats OPENLANE aux 2 heures avec sa propre session. En rouge, la session OpenLane est sans doute à refaire.', page: ['outils', 'openlane'], pageTexte: 'Valeurs OpenLane' },
    kpi: { texte: 'Le tableau de bord KPI envoie les chiffres quand un nouveau Réalisé arrive dans les Drive partagés (vers le 20 du mois).', page: ['kpi'], pageTexte: 'KPI' }
  };
  function guide(id, cie) { var g = GUIDE[id] || {}; return (g.parCie && g.parCie[cie]) ? Object.assign({}, g, g.parCie[cie]) : g; }
  function nomCie(c) { return c === '*' ? 'Tout le groupe' : ((AMX.COMPAGNIES_TOUTES && AMX.COMPAGNIES_TOUTES[c]) || c); }
  function signet(cle) { return cle && AMX.signets ? AMX.signets[cle] || null : null; }
  function estChargeur(s) { return !!s && /createElement\('script'\)/.test(s.code) && s.code.length < 2000; }
  function voitSection(id) { var s = (AMX.sources && AMX.sources[id]) || AMX.sections[id]; return !!s && (!s.visible || s.visible()); }

  function quand(iso, long) {
    var d = iso ? new Date(iso) : null; if (!d || isNaN(d)) return '';
    var auj = new Date(), hier = new Date(auj.getTime() - 864e5), heure = d.getHours() + ' h ' + String(d.getMinutes()).padStart(2, '0');
    if (d.toDateString() === auj.toDateString()) return 'aujourd\'hui ' + heure;
    if (d.toDateString() === hier.toDateString()) return 'hier ' + heure;
    return d.toLocaleDateString('fr-CA', long ? { weekday: 'long', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short' }) + (long ? '' : ' ' + heure);
  }
  function texteEtat(x) {
    if (x.etat === 'fait') return 'Fait ' + quand(x.le) + (x.info ? ' · ' + x.info : '') + (x.avant ? ' · à refaire d\'ici ' + quand(x.avant, true) : '');
    return x.jamais ? 'À faire — jamais fait' : 'À faire — dernier ' + quand(x.le) + (x.info ? ' · ' + x.info : '');
  }

  function injecterCss() {
    if (document.getElementById('css-imports')) return;
    var s = document.createElement('style');
    s.id = 'css-imports';
    s.textContent = [
      '.imx-page { max-width: 1100px; }',
      '.imx-filtres { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 4px 0 12px; }',
      '.imx-resume .kpi { min-width: 160px; }',
      '.imx-favoris { margin-bottom: 16px; } .imx-favoris summary { cursor: pointer; font-weight: 650; padding: 12px 16px; list-style: none; display: flex; align-items: center; gap: 10px; }',
      '.imx-favoris summary::-webkit-details-marker { display: none; } .imx-favoris summary::before { content: "▸"; color: var(--encre-3); } .imx-favoris[open] summary::before { content: "▾"; }',
      '.imx-favoris .corps { padding: 0 16px 14px; } .imx-favoris .aide { font-size: 13px; color: var(--encre-3); margin: 0 0 10px; }',
      '.imx-fav-liste { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 8px; }',
      '.imx-fav { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--ligne); border-radius: 10px; background: var(--carte); }',
      '.imx-fav .sert { font-size: 12.5px; color: var(--encre-3); line-height: 1.35; } .imx-fav .btn { flex: none; cursor: grab; }',
      '.imx-groupe { margin: 0 0 18px; } .imx-groupe-tete { display: flex; align-items: center; gap: 10px; margin: 0 0 8px; } .imx-groupe-tete h2 { font-size: 17px; margin: 0; }',
      '.imx-groupe-tete .pt { width: 10px; height: 10px; border-radius: 50%; } .imx-groupe-tete .puce.rouge { background: var(--rouge); color: #fff; } .imx-groupe-tete .puce.vert { background: var(--vert-bg); color: var(--vert-fonce); }',
      '.imx-liste { display: flex; flex-direction: column; gap: 6px; }',
      '.imx-imp { border: 1px solid var(--ligne); border-left: 4px solid var(--vert); border-radius: 10px; background: var(--carte); scroll-margin-top: 90px; }',
      '.imx-imp.rouge { border-left-color: var(--rouge); border-color: var(--rouge-bord); }',
      '.imx-imp.cible { box-shadow: 0 0 0 3px var(--vert-clair); }',
      '.imx-imp summary { list-style: none; cursor: pointer; display: grid; grid-template-columns: 12px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 10px 12px; }',
      '.imx-imp summary::-webkit-details-marker { display: none; }',
      '.imx-imp.rouge summary { background: var(--rouge-bg); border-radius: 6px 9px 0 0; } .imx-imp.rouge:not([open]) summary { border-radius: 6px 9px 9px 6px; }',
      '.imx-imp .pt { width: 12px; height: 12px; border-radius: 50%; background: var(--vert); } .imx-imp.rouge .pt { background: var(--rouge); }',
      '.imx-imp .t { font-weight: 650; display: flex; flex-wrap: wrap; gap: 2px 8px; align-items: baseline; } .imx-imp .mode { font-size: 12px; font-weight: 500; color: var(--encre-3); }',
      '.imx-imp .d { font-size: 13px; color: var(--vert-fonce); margin-top: 2px; } .imx-imp.rouge .d { color: var(--rouge); font-weight: 600; }',
      '.imx-imp .chev { color: var(--encre-4); font-size: 13px; } .imx-imp[open] .chev { transform: rotate(90deg); }',
      '.imx-imp .corps { padding: 6px 14px 14px 36px; font-size: 13.5px; }',
      '.imx-imp ol { margin: 4px 0 10px; padding-left: 20px; } .imx-imp ol li { margin: 3px 0; line-height: 1.4; }',
      '.imx-imp .note { font-size: 13px; color: var(--encre-3); margin: 0 0 8px; } .imx-imp .note.ambre { color: var(--ambre); }',
      '.imx-imp .actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; } .imx-imp .actions .btn.signet { cursor: grab; }',
      '@media (max-width: 640px) { .imx-imp summary { grid-template-columns: 10px minmax(0, 1fr); } .imx-imp .chev { display: none; } .imx-imp .corps { padding-left: 14px; } }'
    ].join('\n');
    document.head.appendChild(s);
  }

  function VueImports(ctx) {
    injecterCss();
    var self = this;
    this.filtre = AMX.memo.lire('imx_filtre', 'tous');
    this.cible = (ctx && ctx.params && ctx.params.imp) || '';
    this.ouverts = {};
    this.el = h('div.page.imx-page');
    this.btnRafraichir = h('button.btn.fantome', { type: 'button', html: (I.rafraichir || '') + '<span>Rafraîchir</span>', onclick: function () { self.charger(true); } });
    this.el.appendChild(h('div.entete-page', [
      h('div', [h('h1', 'Imports'), h('p', 'Tout ce qui doit être lu dans les portails des fournisseurs, concession par concession : le site à ouvrir, le favori à cliquer, et la date du dernier passage. Rouge = à faire, vert = fait.')]),
      h('div.actions-ligne', AMX.actionsEntete ? AMX.actionsEntete([this.btnRafraichir], [this.btnRafraichir]) : [this.btnRafraichir])
    ]));
    this.elCies = this.el.appendChild(h('div'));
    this.elFiltres = this.el.appendChild(h('div.imx-filtres'));
    this.elResume = this.el.appendChild(h('div.kpis.imx-resume'));
    this.elFavoris = this.el.appendChild(h('div'));
    this.elListe = this.el.appendChild(h('div'));
    this.surCie = function () { if (self.el.isConnected) self.rendre(); };
    document.addEventListener('amx:compagnie', this.surCie);
    this.charger(false);
  }
  VueImports.prototype.demonter = function () { document.removeEventListener('amx:compagnie', this.surCie); };
  VueImports.prototype.naviguer = function (ctx) {
    var imp = (ctx && ctx.params && ctx.params.imp) || '';
    if (imp) { this.cible = imp; this.ciblee = false; }
    this.charger(false);
  };
  VueImports.prototype.charger = function (force) {
    var self = this, E = AMX.importsEtat;
    if (!E) { this.erreur = 'La page d\'accueil n\'est pas chargée (accueil.js).'; this.rendre(); return; }
    this.rendre();
    (force ? E.rafraichir() : E.charger()).then(function () { self.rendre(); if (force) AMX.toast('État des imports relu.', 'ok'); }, function () { self.rendre(); });
  };

  /* Les imports visibles pour la concession choisie, rangés par concession. */
  VueImports.prototype.groupes = function () {
    var d = AMX.importsEtat && AMX.importsEtat.enCache(), cie = AMX.compagnieChoisie('inventaire') || '';
    if (!d) return null;
    var par = {};
    d.imports.forEach(function (im) {
      Object.keys(im.cies || {}).forEach(function (c) {
        if (c === '*' ? cie : (cie && c !== cie)) return;
        (par[c] = par[c] || []).push({ im: im, x: im.cies[c], cie: c });
      });
    });
    var codes = ORDRE_CIES.filter(function (c) { return par[c]; }).concat(Object.keys(par).filter(function (c) { return c !== '*' && ORDRE_CIES.indexOf(c) < 0; }));
    if (par['*']) codes.push('*');
    return codes.map(function (c) {
      var items = par[c].sort(function (a, b) { return (a.x.etat === 'fait' ? 1 : 0) - (b.x.etat === 'fait' ? 1 : 0) || (RANG_MODE[a.im.mode] || 0) - (RANG_MODE[b.im.mode] || 0); });
      return { cie: c, items: items, rouges: items.filter(function (it) { return it.x.etat !== 'fait'; }).length };
    });
  };

  VueImports.prototype.rendre = function () {
    var self = this, E = AMX.importsEtat;
    var groupes = this.groupes();
    // Concessions : la rangée commune (cachée dans la nouvelle interface, où la barre du haut fait le choix).
    var parCie = {}; (groupes || []).forEach(function (g) { parCie[g.cie] = g.rouges; });
    AMX.barreConcessions(this.elCies, { domaine: 'inventaire', valeur: AMX.compagnieChoisie('inventaire'), compte: function (c) { return parCie[c] ? parCie[c] + ' à faire' : ''; }, onchange: function () { self.rendre(); } });
    AMX.vider(this.elFiltres); AMX.vider(this.elResume); AMX.vider(this.elFavoris); AMX.vider(this.elListe);
    if (!groupes) {
      var err = (E && E.erreur && E.erreur()) || this.erreur || '';
      this.elListe.appendChild(err ? h('div.alerte-bloc.erreur', { text: err }) : (AMX.chargeur ? AMX.chargeur('Lecture de l\'état des imports…') : h('div.doux', 'Lecture de l\'état des imports…')));
      return;
    }
    var tous = [], rouges = 0;
    groupes.forEach(function (g) { g.items.forEach(function (it) { tous.push(it); if (it.x.etat !== 'fait') rouges++; }); });
    // Filtre : à faire / tous
    var seg = h('div.segment', [['afaire', 'À faire ' + rouges], ['tous', 'Tous ' + tous.length]].map(function (o) {
      return h('button' + (self.filtre === o[0] ? '.actif' : ''), { type: 'button', text: o[1], onclick: function () { self.filtre = o[0]; AMX.memo.ecrire('imx_filtre', o[0]); self.rendre(); } });
    }));
    this.elFiltres.appendChild(seg);
    var cie = AMX.compagnieChoisie('inventaire');
    this.elFiltres.appendChild(h('span.doux.petit', { text: (cie ? nomCie(cie) : 'Tout le groupe') + (self.filtre === 'afaire' ? ' · seulement ce qui est à faire' : '') }));
    // Chiffres
    var faits = tous.length - rouges, dernier = tous.map(function (it) { return it.x.le; }).filter(Boolean).sort().pop();
    var kpi = function (cls, l, v, d) { return h('div.kpi.neutre' + (cls ? '.' + cls : ''), [h('div.libelle', l), h('div.valeur', { text: v }), d ? h('div.sous', { text: d }) : null]); };
    this.elResume.appendChild(kpi(rouges ? 'alerte' : '', 'À faire', String(rouges), rouges ? 'en retard ou jamais faits' : 'tout est à jour'));
    this.elResume.appendChild(kpi('', 'Faits', String(faits), 'dans les délais'));
    if (dernier) this.elResume.appendChild(kpi('', 'Dernier import', quand(dernier), ''));
    // Favoris à installer : ceux des imports visibles, une fois chacun
    var favs = {}, ordre = [];
    tous.forEach(function (it) { var g = guide(it.im.id, it.cie); if (!g.favori) return; if (!favs[g.favori]) { favs[g.favori] = []; ordre.push(g.favori); } var n = g.court || it.im.nom.split(' — ')[0]; if (favs[g.favori].indexOf(n) < 0) favs[g.favori].push(n); });
    var cartesFav = ordre.map(function (cle) {
      var s = signet(cle);
      return h('div.imx-fav', [
        s ? h('a.btn.petit.primaire', { href: s.code, text: s.nom, draggable: 'true', title: 'Glissez ce bouton dans la barre de favoris de Chrome', onclick: function (e) { e.preventDefault(); AMX.toast('Glissez ce bouton dans la barre de favoris de Chrome (Cmd+Maj+B pour l\'afficher).', 'info'); } }) : h('span.btn.petit.desactive', { text: cle }),
        h('div.sert', { text: 'Sert à : ' + favs[cle].join(', ') + '.' + (s && !estChargeur(s) ? ' Favori complet : re-glissez-le quand il change.' : '') })
      ]);
    });
    if (cartesFav.length) {
      var det = h('details.carte.imx-favoris', [
        h('summary', [h('span', 'Favoris à installer dans Chrome'), h('span.puce', { text: String(cartesFav.length) })]),
        h('div.corps', [h('p.aide', 'Glissez chaque bouton dans la barre de favoris de Chrome (Cmd+Maj+B pour l\'afficher), une seule fois. Ensuite, on clique le favori sur le site du fournisseur, pas ici.'), h('div.imx-fav-liste', cartesFav)])
      ]);
      if (AMX.memo.lire('imx_favoris_ouverts', false)) det.open = true;
      det.addEventListener('toggle', function () { AMX.memo.ecrire('imx_favoris_ouverts', det.open); });
      this.elFavoris.appendChild(det);
    }
    // Liste par concession
    var rien = true;
    groupes.forEach(function (g) {
      var items = self.filtre === 'afaire' ? g.items.filter(function (it) { return it.x.etat !== 'fait'; }) : g.items;
      if (!items.length) return;
      rien = false;
      var couleur = g.cie === '*' ? 'var(--encre-3)' : ((AMX.COULEUR_COMPAGNIE && AMX.COULEUR_COMPAGNIE[g.cie]) || 'var(--encre-3)');
      self.elListe.appendChild(h('section.imx-groupe', { dataset: { cie: g.cie } }, [
        h('div.imx-groupe-tete', [h('span.pt', { style: { background: couleur } }), h('h2', { text: nomCie(g.cie) }), h('span.puce.' + (g.rouges ? 'rouge' : 'vert'), { text: g.rouges ? g.rouges + ' à faire' : 'tout est fait' })]),
        h('div.imx-liste', items.map(function (it) { return self.carte(it); }))
      ]));
    });
    if (rien) this.elListe.appendChild(h('div.vide', [h('h3', self.filtre === 'afaire' ? 'Rien à faire' : 'Aucun import'), h('div', self.filtre === 'afaire' ? 'Tous les imports de ' + (cie ? nomCie(cie) : 'groupe') + ' sont à jour.' : 'Aucun import pour cette concession.')]));
    // Import demandé par l'adresse (« Comment faire » de l'Accueil) : ouvert et montré une fois
    if (this.cible && !this.ciblee) {
      var el = this.elListe.querySelector('details.imx-imp.cible');
      if (el) { this.ciblee = true; setTimeout(function () { var e = self.elListe.querySelector('details.imx-imp.cible'); if (e) e.scrollIntoView({ block: 'start' }); }, 60); }   // relu : un 2e rendu a pu remplacer la carte
    }
  };

  VueImports.prototype.carte = function (it) {
    var self = this, im = it.im, x = it.x, g = guide(im.id, it.cie), rouge = x.etat !== 'fait';
    var cle = im.id + '|' + it.cie;
    var portail = typeof im.portail === 'string' ? im.portail : ((im.portail || {})[it.cie] || '');
    var s = signet(g.favori);
    var corps = [];
    if (g.texte) corps.push(h('p', { text: g.texte }));
    if (g.etapes) corps.push(h('ol', g.etapes.map(function (e) { return h('li', { text: e }); })));
    if (g.partage) corps.push(h('p.note', { text: g.partage }));
    if (g.tache) corps.push(h('p.note', { text: g.tache + (rouge ? ' Elle n\'a pas tourné : faites-le à la main.' : '') }));
    if (g.note) corps.push(h('p.note.ambre', { text: g.note }));
    var actions = [];
    if (portail) actions.push(h('a.btn.petit' + (rouge ? '.primaire' : ''), { href: portail, target: '_blank', rel: 'noopener', html: '<span>Ouvrir le portail</span>' + (I.externe ? ' ' + I.externe : ' ↗') }));
    if (s) actions.push(h('a.btn.petit.fantome.signet', { href: s.code, draggable: 'true', text: s.nom, title: 'Le favori à cliquer sur le portail. Glissez-le dans la barre de favoris de Chrome s\'il n\'y est pas.', onclick: function (e) { e.preventDefault(); AMX.toast('Ce favori se clique sur le site du fournisseur. Glissez-le dans la barre de favoris de Chrome s\'il n\'y est pas.', 'info'); } }));
    if (g.page && voitSection(g.page[0])) actions.push(h('a.lien', { href: AMX.lien(g.page[0], g.page[1] || '', g.page[2]), text: g.pageTexte || 'Page détaillée' }));
    if (actions.length) corps.push(h('div.actions', actions));
    var cible = !!this.cible && im.id === this.cible;   // l'import demandé par l'adresse reste ouvert et marqué à chaque rendu
    var det = h('details.imx-imp.' + (rouge ? 'rouge' : 'vert') + (cible ? '.cible' : ''), { dataset: { imp: im.id, cie: it.cie } }, [
      h('summary', [
        h('span.pt', { 'aria-label': rouge ? 'À faire' : 'Fait' }),
        h('div', [h('div.t', [h('span', { text: im.nom }), h('span.mode', { text: (MODES[im.mode] || '') + ' · ' + im.cadence })]), h('div.d', { text: texteEtat(x) })]),
        h('span.chev', '▸')
      ]),
      h('div.corps', corps)
    ]);
    det.open = this.ouverts.hasOwnProperty(cle) ? this.ouverts[cle] : (rouge || cible);
    det.addEventListener('toggle', function () { self.ouverts[cle] = det.open; });
    return det;
  };

  AMX.vues = AMX.vues || {};
  AMX.vues.Imports = VueImports;
})();
