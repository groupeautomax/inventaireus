/* =========================================================================
   Section « Inventaire » : les registres É.-U. / Canada / Detail, un seul code.
   Remplace index.html, canada.html et detail.html (trois copies de 1 350
   lignes) par un module paramétré par la feuille.

   Routes serveur utilisées (inchangées) :
     GET  ?sheet=US|CAN|DETAIL
     POST addBulk, advance, setStatus, delete, setDoc, transfer, setCost,
          setStock, setVin, setCompagnie (+ sheet),
          updateStatusByVinBulk, updateDocByVinBulk, updateRecallResults,
          getPhotosByVin
   ========================================================================= */
(function () {
  'use strict';
  var h = AMX.h, esc = AMX.esc, I = AMX.icones;

  /* 26 oct. : « auto » = achats entrés automatiquement (AchatsAuto.gs), pas encore confirmés — en violet. */
  function alerteValide(a) { return a === 'retard' || a === 'retardAchat' || a === 'auto'; }
  function estAuto(v) { return !!(AMX.achatsAuto && v && AMX.achatsAuto.entree(v.vin)); }
  var FEUILLES = {
    us:     { feuille: 'US',     titre: 'É.-U.',  statuts: ['achete', 'transitqc', 'stock', 'transit', 'manheimpa', 'arrive', 'comptabilise'], importateur: true,  suivant: { achete: 'transitqc', transitqc: 'stock', stock: 'transit', transit: 'arrive', arrive: 'comptabilise' }, transferts: ['DETAIL', 'CAN'] },
    can:    { feuille: 'CAN',    titre: 'Canada', statuts: ['achete', 'transitqc', 'stock', 'transit', 'arrive', 'comptabilise'],              importateur: false, suivant: { achete: 'transitqc', transitqc: 'stock', stock: 'transit', transit: 'arrive', arrive: 'comptabilise' }, transferts: ['DETAIL', 'US'] },
    detail: { feuille: 'DETAIL', titre: 'Detail', statuts: ['achete', 'stock', 'transit', 'arrive', 'comptabilise'],                           importateur: false, suivant: { achete: 'stock', stock: 'transit', transit: 'arrive', arrive: 'comptabilise' },                       transferts: ['US', 'CAN'] }
  };
  var LIBELLE_SUIVANT = { transitqc: 'Marquer transit QC', stock: 'Marquer en stock', transit: 'Marquer expédié', arrive: 'Marquer vendu', comptabilise: 'Marquer comptabilisé' };
  var REGISTRE = { 'non': { libelle: 'Non reçu', couleur: 'gris' }, 'oui-bon': { libelle: 'Reçu · bon nom', couleur: 'vert' }, 'oui-mauvais': { libelle: 'Reçu · mauvais nom', couleur: 'ambre' } };
  var RAPPELS_FABRICANT = {
    FORD: 'https://www.ford.ca/support/recalls-details/', LINCOLN: 'https://www.ford.ca/support/recalls-details/',
    CHEVROLET: 'https://experience.gm.ca/en/ownercenter/recalls', GMC: 'https://experience.gm.ca/en/ownercenter/recalls', BUICK: 'https://experience.gm.ca/en/ownercenter/recalls', CADILLAC: 'https://experience.gm.ca/en/ownercenter/recalls',
    CHRYSLER: 'https://www.mopar.com/en-ca/my-vehicle/recalls/search.html', DODGE: 'https://www.mopar.com/en-ca/my-vehicle/recalls/search.html', JEEP: 'https://www.mopar.com/en-ca/my-vehicle/recalls/search.html', RAM: 'https://www.mopar.com/en-ca/my-vehicle/recalls/search.html',
    BMW: 'https://www.bmw.ca/en/ssl/VehicleRecall.html', VOLKSWAGEN: 'https://www.vw.ca/en/owners-and-drivers/recalls.html', VW: 'https://www.vw.ca/en/owners-and-drivers/recalls.html',
    KIA: 'https://www.kia.ca/en/owners/recalls', TOYOTA: 'https://www.toyota.ca/en/owners/recalls/', ACURA: 'https://www.acura.ca/en/recalls', HYUNDAI: 'https://www.hyundaicanada.com/en/owners/recalls', TESLA: 'https://www.tesla.com/support/recalls'
  };

  /* ------------------------------ Helpers ------------------------------ */
  function marque(v) { return String(v.modele || '').trim().split(' ')[0].toUpperCase(); }
  function registreDe(v) { return v.enregistrement === 'oui' ? 'oui-bon' : (v.enregistrement || 'non'); }
  function enRetardRegistre(v) { return !String(v.enregistrement || '').startsWith('oui') && AMX.joursDepuis(v.dateAjout) >= 10; }
  function enRetardAchat(v) { return (v.statut === 'achete' || v.statut === 'transitqc') && AMX.joursDepuis(v.dateAjout) >= 7; }
  function stickerUrl(v) {
    var m = marque(v);
    if (['CHEVROLET', 'GMC', 'BUICK', 'CADILLAC'].indexOf(m) >= 0) return 'https://cws.gm.com/vs-cws/vehshop/v2/vehicle/windowsticker?vin=' + encodeURIComponent(v.vin);
    if (m === 'FORD' || m === 'LINCOLN') return 'https://www.windowsticker.ford.com/vin/' + encodeURIComponent(v.vin);
    return '';
  }
  /* 1 161 135 → « 1,16 M$ », 345 200 → « 345 k$ » (pastilles des registres, v138). */
  function montantCourt(n) { n = Number(n) || 0; if (Math.abs(n) >= 1e6) return (Math.round(n / 1e4) / 100).toLocaleString('fr-CA') + ' M$'; if (Math.abs(n) >= 1e3) return Math.round(n / 1e3).toLocaleString('fr-CA') + ' k$'; return Math.round(n) + ' $'; }
  function trier(liste, cle) {
    var l = liste.slice();
    var cmp = {
      maj: function (a, b) { return new Date(b.maj) - new Date(a.maj); },
      achat: function (a, b) { return new Date(b.dateAjout) - new Date(a.dateAjout); },
      achatAsc: function (a, b) { return new Date(a.dateAjout) - new Date(b.dateAjout); },
      modele: function (a, b) { return String(a.modele || '').localeCompare(String(b.modele || ''), 'fr'); },
      stock: function (a, b) { return String(a.stock || 'zzz').localeCompare(String(b.stock || 'zzz'), 'fr', { numeric: true }); },
      cout: function (a, b) { return (AMX.montant(b.cout) || 0) - (AMX.montant(a.cout) || 0); },
      statut: function (a, b) { return (AMX.statut(a.statut).ordre - AMX.statut(b.statut).ordre) || (new Date(b.maj) - new Date(a.maj)); }
    }[cle] || function () { return 0; };
    return l.sort(cmp);
  }

  // NHTSA : décodage et rappels (comme avant, depuis le navigateur).
  var cacheRappels = {};
  function decoderVins(vins) {
    if (!vins.length) return Promise.resolve({});
    var corps = new URLSearchParams(); corps.append('format', 'json'); corps.append('data', vins.join(';'));
    return fetch('https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVINValuesBatch/', { method: 'POST', body: corps })
      .then(function (r) { return r.json(); })
      .then(function (d) { var m = {}; (d.Results || []).forEach(function (r) { m[r.VIN] = { make: r.Make || '', model: r.Model || '', year: r.ModelYear || '' }; }); return m; })
      .catch(function () { return {}; });
  }
  function rappelsPour(make, model, year) {
    var cle = (make + '|' + model + '|' + year).toUpperCase();
    if (cacheRappels[cle] !== undefined) return Promise.resolve(cacheRappels[cle]);
    return fetch('https://api.nhtsa.gov/recalls/recallsByVehicle?make=' + encodeURIComponent(make) + '&model=' + encodeURIComponent(model) + '&modelYear=' + encodeURIComponent(year))
      .then(function (r) { return r.json(); }).then(function (d) { cacheRappels[cle] = d.results || []; return cacheRappels[cle]; })
      .catch(function () { cacheRappels[cle] = null; return null; });
  }
  function resultatRappel(info) {
    if (!(info && info.make && info.model && info.year)) return Promise.resolve({ rappel: '', rappelDetail: '' });
    return rappelsPour(info.make, info.model, info.year).then(function (r) {
      if (r === null) return { rappel: '', rappelDetail: '' };
      if (r.length) return { rappel: 'oui', rappelDetail: r.map(function (x) { return x.Component || 'Composant non précisé'; }).join(', ') };
      return { rappel: 'non', rappelDetail: '' };
    });
  }

  // Photos : cache mémoire + sessionStorage (1 h), 3 chargements à la fois.
  var cachePhotos = {};
  var fileAttente = [], actifs = 0;
  function photosDe(vin) {
    vin = String(vin).toUpperCase();
    if (cachePhotos[vin]) return Promise.resolve(cachePhotos[vin]);
    try { var s = JSON.parse(sessionStorage.getItem('amx_photos_' + vin) || 'null'); if (s && Date.now() - s.t < 3600000) { cachePhotos[vin] = s.p; return Promise.resolve(s.p); } } catch (e) {}
    return new Promise(function (res) {
      fileAttente.push(function () {
        return AMX.post({ action: 'getPhotosByVin', vin: vin }).then(function (d) {
          var p = d.photos || (d.urls ? d.urls.map(function (u) { return { url: u }; }) : []);
          cachePhotos[vin] = p;
          try { sessionStorage.setItem('amx_photos_' + vin, JSON.stringify({ t: Date.now(), p: p })); } catch (e) {}
          res(p);
        }, function () { res([]); });
      });
      pomper();
    });
  }
  function pomper() {
    while (actifs < 3 && fileAttente.length) {
      var f = fileAttente.shift(); actifs++;
      f().then(function () { actifs--; pomper(); });
    }
  }
  AMX.photosDe = photosDe;   // partagé avec Vente
  // Après un ajout (Évaluation, 21 oct.) : relire les photos du NIV au prochain appel.
  AMX.photosOublier = function (vin) { vin = String(vin || '').toUpperCase(); delete cachePhotos[vin]; try { sessionStorage.removeItem('amx_photos_' + vin); } catch (e) {} };

  /* ------------------------------ Section ------------------------------ */
  // Pour revenir d'un autre onglet (Neufs) au registre sans recharger la section.
  AMX.inventaire = AMX.inventaire || {};
  AMX.inventaire.monterRegistre = function (conteneur, ctx) { return new Registre(conteneur, ctx); };
  // Total en $ d'une liste de véhicules (coût d'achat de la colonne Coût) — Maxime, 7 oct. :
  // « dans les inventaires il faudrait le total en $ par type d'inventaire ».
  AMX.inventaire.sommeCouts = function (liste) {
    var total = 0, n = 0;
    (liste || []).forEach(function (v) { var c = AMX.montant(v.cout); if (!isNaN(c) && c > 0) { total += c; n++; } });
    var sans = (liste || []).length - n;
    return { total: total, n: n, sans: sans, texte: AMX.fmtArgent(total, 0), detail: AMX.fmtArgent(total, 0) + ' de coût d\'achat sur ' + n + ' véhicule' + (n > 1 ? 's' : '') + (sans ? ' — ' + sans + ' sans coût' : '') };
  };
  // Valeur des trois registres (véhicules actifs : pas vendus, pas comptabilisés), pour la compagnie choisie.
  AMX.inventaire.valeurRegistres = function (compagnie) {
    return Object.keys(FEUILLES).map(function (id) {
      var l = AMX.inventaire.enCache(FEUILLES[id].feuille);
      if (!l) return { id: id, titre: FEUILLES[id].titre, charge: false };
      var actifs = l.filter(function (v) { return v.statut !== 'arrive' && v.statut !== 'comptabilise' && (!compagnie || v.compagnie === compagnie); });
      var s = AMX.inventaire.sommeCouts(actifs);
      return { id: id, titre: FEUILLES[id].titre, charge: true, n: actifs.length, total: s.total, texte: s.texte, sans: s.sans };
    });
  };

  // v131 (Accueil « À faire ») : par registre, les véhicules actifs en retard — registre non reçu 10 j+, acheté depuis 7 j+.
  AMX.inventaire.alertes = function (compagnie) {
    return Object.keys(FEUILLES).map(function (id) {
      var l = AMX.inventaire.enCache(FEUILLES[id].feuille);
      if (!l) return { id: id, titre: FEUILLES[id].titre, charge: false, retard: 0, retardAchat: 0 };
      var actifs = l.filter(function (v) { return v.statut !== 'arrive' && v.statut !== 'comptabilise' && (!compagnie || v.compagnie === compagnie); });
      return { id: id, titre: FEUILLES[id].titre, charge: true, retard: actifs.filter(enRetardRegistre).length, retardAchat: actifs.filter(enRetardAchat).length };
    });
  };

  // 11 oct. (Maxime : « un onglet Inventaire, puis Neufs et Usagé ») : une seule section « Inventaire » avec deux onglets dans
  // la sous-barre — Neufs (assets/neufs.js, VueNeufs) et Usagé (les trois registres É.-U. / Canada / Detail, choisis par des
  // pastilles dans la page et mémorisés). Anciennes adresses : #/neufs → #/inventaire/neufs ; #/inventaire/us|can|detail →
  // #/inventaire/usage?registre=… (app.js).
  var REGISTRE_DEFAUT = 'us';
  function registreDemande(ctx) {
    var r = String((ctx && ctx.params && ctx.params.registre) || '').toLowerCase();
    if (!FEUILLES[r]) r = String(AMX.memo.lire('inv_registre', REGISTRE_DEFAUT) || REGISTRE_DEFAUT).toLowerCase();
    return FEUILLES[r] ? r : REGISTRE_DEFAUT;
  }
  AMX.inventaire.registres = FEUILLES;
  AMX.inventaire.lien = function (registre, params) { var p = { registre: registre }; Object.keys(params || {}).forEach(function (k) { p[k] = params[k]; }); return AMX.lien('inventaire', 'usage', p); };
  AMX.inventaire.aller = function (registre, params) { var p = { registre: registre }; Object.keys(params || {}).forEach(function (k) { p[k] = params[k]; }); AMX.aller('inventaire', 'usage', p); };
  AMX.section('inventaire', {
    titre: 'Inventaire', icone: 'inventaire', ordre: 10,
    onglets: [
      { id: 'neufs', titre: 'Neufs', compteur: function () { return AMX.neufs && AMX.neufs.compteur ? AMX.neufs.compteur() : ''; } },
      { id: 'usage', titre: 'Usagé', compteur: function () {
        var n = 0, charge = false;
        Object.keys(FEUILLES).forEach(function (id) { var l = AMX.inventaire.enCache(FEUILLES[id].feuille); if (l) { charge = true; n += l.filter(function (v) { return v.statut !== 'arrive' && v.statut !== 'comptabilise'; }).length; } });
        return charge ? n : '';
      } },
      // 21 oct. : soumissions de neufs bâtis dans GM AutoBook PRO (assets/soumission.js) — compteur = ouvertes (brouillon, envoyée).
      { id: 'soumissions', titre: 'Soumissions', compteur: function () { return AMX.soumission && AMX.soumission.compteur ? AMX.soumission.compteur() : ''; } }
    ],
    monter: function (conteneur, ctx) { return new VueInventaire(conteneur, ctx); }
  });

  /* Enveloppe : monte la bonne vue selon l'onglet (Neufs ou Usagé) et change de vue quand l'onglet change. */
  function VueInventaire(conteneur, ctx) {
    this.conteneur = conteneur; this.enfant = null; this.type = '';
    this.monterEnfant(ctx);
  }
  VueInventaire.prototype.monterEnfant = function (ctx) {
    if (this.enfant && this.enfant.demonter) { try { this.enfant.demonter(); } catch (e) {} }
    AMX.vider(this.conteneur);
    if (ctx.onglet === 'neufs' && AMX.neufs && AMX.neufs.monter) { this.type = 'neufs'; this.enfant = AMX.neufs.monter(this.conteneur, ctx); return; }
    if (ctx.onglet === 'soumissions' && AMX.soumission && AMX.soumission.monter) { this.type = 'soumissions'; this.enfant = AMX.soumission.monter(this.conteneur, ctx); return; }
    this.type = 'usage';
    var reg = registreDemande(ctx);
    AMX.memo.ecrire('inv_registre', reg);
    this.enfant = new Registre(this.conteneur, { onglet: reg, params: ctx.params || {} });
  };
  VueInventaire.prototype.naviguer = function (ctx) {
    var type = ctx.onglet === 'neufs' ? 'neufs' : (ctx.onglet === 'soumissions' ? 'soumissions' : 'usage');
    if (type !== this.type) { this.monterEnfant(ctx); return; }
    if (type === 'usage') { var reg = registreDemande(ctx); AMX.memo.ecrire('inv_registre', reg); if (this.enfant.naviguer) this.enfant.naviguer({ onglet: reg, params: ctx.params || {} }); return; }
    if (this.enfant && this.enfant.naviguer) this.enfant.naviguer(ctx);
  };
  VueInventaire.prototype.demonter = function () { if (this.enfant && this.enfant.demonter) this.enfant.demonter(); this.enfant = null; };

  function Registre(conteneur, ctx) {
    var self = this;
    this.conteneur = conteneur;
    this.cfg = FEUILLES[ctx.onglet] || FEUILLES.us;
    this.onglet = ctx.onglet;
    this.vehicules = [];
    this.selection = ctx.params.vin || '';
    this.ecritures = 0; this.generation = 0;
    this.filtres = this.filtresDefaut();
    if (alerteValide(ctx.params.alerte)) this.filtres.alerte = ctx.params.alerte;
    this.tri = AMX.memo.lire('inv_tri', 'maj');
    this.observateur = null;
    this.ui2 = !!(AMX.ui2 && AMX.ui2());   /* v131 : nouvelle interface (page refaite) */
    // v131 : la concession choisie dans la barre du haut (ou ailleurs) s'applique tout de suite.
    this.surCie = function () { if (self.detruit) return; self.filtres.compagnie = AMX.compagnieChoisie('inventaire'); self.construireRail(); self.rendre(); };
    document.addEventListener('amx:compagnie', this.surCie);

    this.construire();
    this.charger();
    this.contratsDemandes(ctx);
    AMX.carfax.charger().then(function () { self.rendre(); }).catch(function () {});
    this.surCarfax = function () { self.rendre(); };
    document.addEventListener('amx:carfax', this.surCarfax);
    // Achats eBlock (puce « eBlock · n dommages » sur les lignes) : même cache que la page Fiches eBlock.
    if (AMX.eblock) { AMX.eblock.charger().then(function () { if (!self.detruit) self.rendre(); }).catch(function () {}); document.addEventListener('amx:eblock', this.surCarfax); }
    if (AMX.openlane) { AMX.openlane.charger().then(function () { if (!self.detruit) self.rendre(); }).catch(function () {}); document.addEventListener('amx:openlane', this.surCarfax); }
    if (AMX.demandes) { AMX.demandes.charger().then(function () { if (!self.detruit) self.rendre(); }).catch(function () {}); document.addEventListener('amx:demandes', this.surCarfax); }
    if (AMX.achatsAuto) { AMX.achatsAuto.charger().then(function () { if (!self.detruit) self.rendre(); }).catch(function () {}); document.addEventListener('amx:achatsAuto', this.surCarfax); }
    this.minuterie = setInterval(function () { self.rafraichir(); }, 60000);
    this.surVisible = function () { if (!document.hidden) self.rafraichir(); };
    document.addEventListener('visibilitychange', this.surVisible);
    window.addEventListener('focus', this.surVisible);
  }

  Registre.prototype.filtresDefaut = function () {
    // La compagnie n'est PAS remise à zéro : c'est le choix du site (AMX.compagnieChoisie), gardé
    // d'un onglet et d'une page à l'autre tant qu'on ne clique pas sur une autre concession.
    return { recherche: '', compagnie: AMX.compagnieChoisie('inventaire'), statuts: null /* null = actifs */, origine: '', rappel: '', importateur: '', registre: '', alerte: '' };
  };

  Registre.prototype.demonter = function () {
    this.detruit = true;
    if (this.sel) this.sel.quitter();
    clearInterval(this.minuterie);
    document.removeEventListener('visibilitychange', this.surVisible);
    document.removeEventListener('amx:carfax', this.surCarfax);
    document.removeEventListener('amx:eblock', this.surCarfax);
    document.removeEventListener('amx:openlane', this.surCarfax);
    document.removeEventListener('amx:achatsAuto', this.surCarfax);
    document.removeEventListener('amx:compagnie', this.surCie);
    window.removeEventListener('focus', this.surVisible);
    if (this.observateur) this.observateur.disconnect();
  };

  /* 26 oct. : ?contrats=1 (lien de l'Accueil) ouvre la fenêtre « Contrats d'achat reçus » (achats-auto.js). */
  Registre.prototype.contratsDemandes = function (ctx) {
    var self = this;
    if (!ctx.params.contrats || this.contratsVu || !AMX.achatsAuto || !AMX.achatsAuto.contrats) return;
    this.contratsVu = true;
    setTimeout(function () { if (!self.detruit) self.ouvrirContrats(); }, 0);
  };
  Registre.prototype.ouvrirContrats = function () {
    var self = this;
    AMX.achatsAuto.contrats.ouvrir({ apres: function () { if (!self.detruit) self.charger(true); }, onFermer: function () { self.contratsVu = false; } });
  };

  Registre.prototype.naviguer = function (ctx) {
    this.contratsDemandes(ctx);
    if (ctx.onglet !== this.onglet) {
      this.onglet = ctx.onglet; this.cfg = FEUILLES[ctx.onglet] || FEUILLES.us;
      this.filtres = this.filtresDefaut(); this.selection = ctx.params.vin || '';
      if (alerteValide(ctx.params.alerte)) this.filtres.alerte = ctx.params.alerte;
      this.vehicules = AMX.inventaire.enCache(this.cfg.feuille) || [];
      this.construire(); this.charger();
    } else if ((alerteValide(ctx.params.alerte)) && ctx.params.alerte !== this.filtres.alerte) {
      this.filtres.alerte = ctx.params.alerte; this.filtres.recherche = ''; this.construireRail(); this.rendre();
    } else if (ctx.params.vin && ctx.params.vin !== this.selection) {
      this.selection = ctx.params.vin; this.filtres.recherche = ''; this.rendre();
    }
  };

  /* --------------------------- Construction ---------------------------- */
  Registre.prototype.construire = function () {
    var self = this;
    if (this.ui2) { this.construireUi2(); return; }
    AMX.vider(this.conteneur);
    this.elKpis = h('div.kpis');
    this.elValeur = h('div.valeur-registres');
    this.elRail = h('aside.rail');
    this.elListe = h('div');
    this.creerSelection();
    this.elPanneau = h('aside.panneau');
    this.elOutils = h('div.outils-liste');
    this.elAgencement = h('div.agencement', [this.elRail, h('div.colonne-liste', [this.elOutils, this.elListe]), this.elPanneau]);
    this.elCies = h('div.barre-cies');   /* 16 oct. : rangée de concessions sous l'en-tête, comme partout */
    var page = h('div.page', [
      h('div.entete-page', [
        h('div', [h('h1', { text: 'Usagé — ' + this.cfg.titre }), h('p#inv-etat', { text: 'Chargement…' }), this.elRegistres = h('div.segment.choix-registre', { style: { marginTop: '8px' }, 'aria-label': 'Registre' })]),
        h('div.actions', [
          h('button.btn.fantome.icone#inv-filtres-btn', { title: 'Filtres', html: I.filtre, onclick: function () { self.elRail.classList.toggle('ouvert'); } }),
          h('button.btn', { html: I.rafraichir + '<span>Rafraîchir</span>', onclick: function () { self.charger(true); } }),
          h('button.btn', { html: I.telecharger + '<span>Exporter Excel</span>', onclick: function () { self.exporter(); } }),
          h('button.btn', { html: I.scan + '<span>Actions en lot</span>', onclick: function () { self.modaleLot('ajout'); } }),
          h('button.btn', { html: (I.corbeille) + '<span>Usagés effacés</span>', onclick: function () { AMX.inventaire.effaces(); } }),
          (AMX.achatsAuto && AMX.achatsAuto.contrats && AMX.achatsAuto.peutLire()) ? h('button.btn', { html: (I.courriel) + '<span>Contrats d\'achat reçus</span>', onclick: function () { self.ouvrirContrats(); } }) : null,
          this.sel.bouton,
          AMX.perm('ajouterVehicule') ? h('button.btn.primaire', { html: I.plus + '<span>Ajouter</span>', onclick: function () { self.modaleLot('ajout'); } }) : null
        ])
      ]),
      this.elCies, this.elKpis, this.elValeur, this.elAgencement
    ]);
    this.conteneur.appendChild(page);
    this.rendreRegistres();
    this.construireRail();
    // Les permissions (portée, compagnies visibles) arrivent souvent après le premier rendu : on refait le rail.
    // Profil (portée) arrivé après le montage : on revalide la concession choisie (un vieux choix hors portée est ignoré).
    this.surProfil = function () { if (!self.detruit) { self.filtres.compagnie = AMX.compagnieChoisie('inventaire'); self.construireRail(); self.rendre(); } };
    document.addEventListener('amx:profil', this.surProfil);
  };

  Registre.prototype.construireRail = function () {
    var self = this, f = this.filtres, cfg = this.cfg;
    if (this.ui2) { this.construireFiltresUi2(); return; }
    AMX.vider(this.elRail);
    var rech = h('div.recherche', [h('span', { html: I.recherche }), h('input.saisie', { type: 'search', placeholder: 'VIN, modèle, # stock — tous statuts, tous registres', value: f.recherche, oninput: AMX.debounce(function (e) { f.recherche = e.target.value; f.alerte = ''; self.rendre(); }, 120) })]);
    // Concession : rangée de pastilles sous l'en-tête (16 oct., même présentation que Neufs et partout), compte des
    // véhicules actifs du registre par concession, choix gardé pour tout le site (AMX.choisirCompagnie).
    var actifsCie = cfg.statuts.filter(function (s) { return s !== 'arrive' && s !== 'comptabilise'; }), vehicules = this.vehicules;
    AMX.barreConcessions(this.elCies, { domaine: 'inventaire', valeur: f.compagnie,
      compte: function (c) { return vehicules.filter(function (v) { return actifsCie.indexOf(v.statut) >= 0 && (!c || v.compagnie === c); }).length; },
      onchange: function (c) { f.compagnie = c; f.alerte = ''; self.construireRail(); self.rendre(); } });
    // Statuts
    var actifs = cfg.statuts.filter(function (s) { return s !== 'arrive' && s !== 'comptabilise'; });
    var statutsSel = f.statuts || actifs;
    var grpStatut = h('div.groupe', [h('h3', ['Statut', h('button', { type: 'button', text: f.statuts === null ? 'Tout voir' : 'Actifs', onclick: function () { f.statuts = f.statuts === null ? cfg.statuts.slice() : null; f.alerte = ''; self.construireRail(); self.rendre(); } })])]);
    cfg.statuts.forEach(function (s) {
      var st = AMX.statut(s, cfg.feuille);
      var n = self.vehicules.filter(function (v) { return v.statut === s && (!f.compagnie || v.compagnie === f.compagnie); }).length;
      var cb = h('input', { type: 'checkbox', checked: statutsSel.indexOf(s) >= 0 });
      cb.addEventListener('change', function () {
        var cur = (f.statuts || actifs).slice();
        if (cb.checked) { if (cur.indexOf(s) < 0) cur.push(s); } else cur = cur.filter(function (x) { return x !== s; });
        f.statuts = cur; f.alerte = ''; self.construireRail(); self.rendre();
      });
      grpStatut.appendChild(h('label.case', [cb, h('span.pastille', { style: { background: 'var(--' + st.couleur + ')' } }), h('span', { text: st.libelle }), h('span.compte', { text: n })]));
    });
    var selectFiltre = function (libelle, cle, options) {
      var sel = h('select.saisie', { onchange: function (e) { f[cle] = e.target.value; f.alerte = ''; self.rendre(); } });
      options.forEach(function (o) { sel.appendChild(h('option', { value: o[0], selected: f[cle] === o[0], text: o[1] })); });
      return h('div.champ', [h('label', { text: libelle }), sel]);
    };
    var grpAutres = h('div.groupe', [h('h3', ['Filtres', h('button', { type: 'button', text: 'Réinitialiser', onclick: function () { self.filtres = self.filtresDefaut(); self.construireRail(); self.rendre(); } })]),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, [
        selectFiltre('Origine', 'origine', [['', 'Toutes'], ['Achat', 'Achat'], ['Échange', 'Échange']]),
        selectFiltre('Rappel', 'rappel', [['', 'Tous'], ['oui', 'Rappel ouvert'], ['non', 'Aucun rappel'], ['inconnu', 'Non vérifié']]),
        cfg.importateur ? selectFiltre('Importateur', 'importateur', [['', 'Tous'], ['DENT', 'DENT'], ['Direct', 'Direct']]) : null,
        selectFiltre('Registre reçu', 'registre', [['', 'Tous'], ['non', 'Non reçu'], ['oui-bon', 'Reçu · bon nom'], ['oui-mauvais', 'Reçu · mauvais nom']])
      ])
    ]);
    this.elBandeau = AMX.bandeauPortee('inventaire', f.compagnie, !!f.recherche);
    this.elRail.appendChild(h('div.groupe', [h('h3', 'Recherche'), this.elBandeau, rech]));
    this.elRail.appendChild(grpStatut);
    this.elRail.appendChild(grpAutres);
  };

  /* ------------------- v131 : page Usagé refaite (nouvelle interface, html.ui2) -------------------
     Rapport « Refonte ergonomique » : un en-tête avec UNE action principale et un menu « … », au plus quatre chiffres,
     une barre de filtres au-dessus de la liste (plus de volet de gauche), la concession dans la barre du haut du site. */
  Registre.prototype.construireUi2 = function () {
    var self = this;
    AMX.vider(this.conteneur);
    this.elKpis = h('div.kpis.inv2-resume');
    this.elValeur = h('div');
    this.elRail = h('div.inv2-filtres');
    this.elPortee = h('div.portee-chiffres');
    this.elListe = h('div');
    this.creerSelection();
    this.elPanneau = h('aside.panneau');
    this.elOutils = h('div.outils-liste');
    this.elAgencement = h('div.agencement.sans-rail', [h('div.colonne-liste', [this.elOutils, this.elListe]), this.elPanneau]);
    this.elCies = h('div');
    this.elRegistres = h('div.segment.choix-registre', { 'aria-label': 'Registre' });
    this.elRechercheUi2 = h('input.saisie', { type: 'search', placeholder: 'NIV, modèle, # stock — tous statuts, tous registres', value: this.filtres.recherche, 'aria-label': 'Chercher dans l\'usagé',
      oninput: AMX.debounce(function (e) { self.filtres.recherche = e.target.value; self.filtres.alerte = ''; self.construireFiltresUi2(); self.rendre(); }, 140) });
    var menu = AMX.menuActions([
      { texte: 'Rafraîchir', icone: I.rafraichir, action: function () { self.charger(true); } },
      { texte: 'Exporter Excel', icone: I.telecharger, action: function () { self.exporter(); } },
      { texte: 'Actions en lot', icone: I.scan, action: function () { self.modaleLot('ajout'); } },
      { texte: 'Usagés effacés', icone: I.corbeille, action: function () { AMX.inventaire.effaces(); } },
      (AMX.achatsAuto && AMX.achatsAuto.peutLire()) ? { texte: 'Lire les achats OPENLANE', icone: I.rafraichir, action: function () { AMX.achatsAuto.lireOpenlane(AMX.compagnieChoisie('inventaire') || '').then(function () { self.charger(true); }).catch(function () {}); } } : null,
      (AMX.achatsAuto && AMX.achatsAuto.contrats && AMX.achatsAuto.peutLire()) ? { texte: 'Contrats d\'achat reçus (courriel)', icone: I.courriel, action: function () { self.ouvrirContrats(); } } : null
    ].filter(Boolean));
    this.conteneur.appendChild(h('div.page.inv2', [
      h('div.entete-page.inv2-tete', [
        h('div.inv2-titre', [h('h1', 'Usagé'), this.elRegistres, h('p#inv-etat.inv2-etat', { text: 'Chargement…' })]),
        h('div.actions', [menu, this.sel.bouton, AMX.perm('ajouterVehicule') ? h('button.btn.primaire', { html: I.plus + '<span>Ajouter</span>', onclick: function () { self.modaleLot('ajout'); } }) : null])
      ]),
      /* v138 (Maxime : « la recherche et les onglets avant les carrés ; les chiffres doivent représenter ce qu'on a choisi ») */
      this.elRail, this.elPortee, this.elKpis, this.elAgencement
    ]));
    this.rendreRegistres();
    this.construireFiltresUi2();
    this.surProfil = function () { if (!self.detruit) { self.filtres.compagnie = AMX.compagnieChoisie('inventaire'); self.construireRail(); self.rendre(); } };
    document.addEventListener('amx:profil', this.surProfil);
  };
  // La barre de filtres : recherche, statuts en pastilles (avec leur nombre), « Filtres » pour le reste.
  Registre.prototype.construireFiltresUi2 = function () {
    var self = this, f = this.filtres, cfg = this.cfg;
    // La boîte de recherche reste en place (le curseur ne saute pas) ; seules les pastilles et « Filtres » sont refaites.
    if (!this.elRechWrap || this.elRechWrap.parentNode !== this.elRail) {
      AMX.vider(this.elRail);
      this.elRechWrap = h('div.recherche.inv2-recherche', [h('span', { html: I.recherche }), this.elRechercheUi2]);
      this.elPastillesUi2 = h('div.inv2-statuts', { role: 'group', 'aria-label': 'Statut' });
      this.elPlusUi2 = h('div.inv2-plus-env');
      this.elRail.appendChild(this.elRechWrap); this.elRail.appendChild(this.elPastillesUi2); this.elRail.appendChild(this.elPlusUi2);
    }
    // v138 : le nombre d'une pastille = ce qu'on verra en la choisissant (alerte et filtres secondaires appliqués) ;
    // l'alerte (« Registre 10 j+ », « Achat 7 j+ ») se combine avec le statut.
    var base = this.filtrer('statut');
    var actifs = cfg.statuts.filter(function (s) { return s !== 'arrive' && s !== 'comptabilise'; });
    var pastilles = AMX.vider(this.elPastillesUi2);
    var pastille = function (texte, n, actif, couleur, clic) {
      var b = h('button.inv2-pastille' + (actif ? '.actif' : ''), { type: 'button', 'aria-pressed': actif ? 'true' : 'false' }, [couleur ? h('i', { style: { background: 'var(--' + couleur + ')' } }) : null, h('span', { text: texte }), h('b', { text: String(n) })]);
      b.addEventListener('click', function () { clic(); f.recherche = ''; self.elRechercheUi2.value = ''; self.construireFiltresUi2(); self.rendre(); });
      return b;
    };
    var cherche = !!(f.recherche && f.recherche.trim());
    pastilles.appendChild(pastille('Actifs', base.filter(function (v) { return actifs.indexOf(v.statut) >= 0; }).length, !cherche && f.statuts === null, '', function () { f.statuts = null; }));
    cfg.statuts.forEach(function (s) {
      var st = AMX.statut(s, cfg.feuille), n = base.filter(function (v) { return v.statut === s; }).length;
      var actif = !cherche && f.statuts && f.statuts.length === 1 && f.statuts[0] === s;
      pastilles.appendChild(pastille(st.libelle, n, actif, st.couleur, function () { f.statuts = actif ? null : [s]; }));
    });
    pastilles.appendChild(pastille('Tous', base.length, !cherche && f.statuts && f.statuts.length === cfg.statuts.length, '', function () { f.statuts = cfg.statuts.slice(); }));
    // Filtres secondaires dans un menu déroulant
    var nbAutres = ['origine', 'rappel', 'importateur', 'registre'].filter(function (k) { return f[k]; }).length;
    var selectFiltre = function (libelle, cle, options) {
      var sel = h('select.saisie', { onchange: function (e) { f[cle] = e.target.value; f.alerte = ''; self.construireFiltresUi2(); self.rendre(); } });
      options.forEach(function (o) { sel.appendChild(h('option', { value: o[0], selected: f[cle] === o[0], text: o[1] })); });
      return h('div.champ', [h('label', { text: libelle }), sel]);
    };
    var pop = h('div.inv2-pop', { hidden: true, role: 'dialog', 'aria-label': 'Autres filtres' }, [
      selectFiltre('Origine', 'origine', [['', 'Toutes'], ['Achat', 'Achat'], ['Échange', 'Échange']]),
      selectFiltre('Rappel', 'rappel', [['', 'Tous'], ['oui', 'Rappel ouvert'], ['non', 'Aucun rappel'], ['inconnu', 'Non vérifié']]),
      cfg.importateur ? selectFiltre('Importateur', 'importateur', [['', 'Tous'], ['DENT', 'DENT'], ['Direct', 'Direct']]) : null,
      selectFiltre('Registre reçu', 'registre', [['', 'Tous'], ['non', 'Non reçu'], ['oui-bon', 'Reçu · bon nom'], ['oui-mauvais', 'Reçu · mauvais nom']]),
      h('button.btn.petit.fantome', { type: 'button', text: 'Réinitialiser les filtres', onclick: function () { var c = f.compagnie; self.filtres = self.filtresDefaut(); self.filtres.compagnie = c; self.elRechercheUi2.value = ''; self.construireFiltresUi2(); self.rendre(); } })
    ]);
    var btnFiltres = h('button.btn.inv2-plus' + (nbAutres ? '.actif' : ''), { type: 'button', 'aria-expanded': 'false', html: I.filtre + '<span>Filtres' + (nbAutres ? ' (' + nbAutres + ')' : '') + '</span>' });
    var dehors = function (e) { if (!enveloppe.contains(e.target)) { pop.hidden = true; btnFiltres.setAttribute('aria-expanded', 'false'); document.removeEventListener('mousedown', dehors, true); } };
    btnFiltres.addEventListener('click', function () { pop.hidden = !pop.hidden; btnFiltres.setAttribute('aria-expanded', pop.hidden ? 'false' : 'true'); if (!pop.hidden) document.addEventListener('mousedown', dehors, true); });
    var enveloppe = AMX.vider(this.elPlusUi2);
    enveloppe.appendChild(btnFiltres); enveloppe.appendChild(pop);
  };
  // v138 (Maxime, 23 oct. : « quand je choisis un onglet, le calcul doit changer pour le représenter — partout ») : les chiffres
  // portent sur la liste que les filtres gardent. Véhicules et coût total, registre non reçu 10 j+ et achat 7 j+ (chacun :
  // ce qu'on verra en cliquant, l'alerte se combinant avec le statut), coût moyen et âge moyen. La valeur des trois
  // registres est sur les pastilles É.-U. · Canada · Detail, à côté du titre.
  Registre.prototype.rendreResumeUi2 = function (kpi, liste) {
    var self = this, f = this.filtres;
    liste = liste || this.filtrer();
    var sA = AMX.inventaire.sommeCouts(liste);
    var sansAlerte = this.filtrer('alerte'), retard = sansAlerte.filter(enRetardRegistre).length, retardAchat = sansAlerte.filter(enRetardAchat).length;
    var clic = function (alerte) { return function () { f.alerte = f.alerte === alerte ? '' : alerte; self.construireFiltresUi2(); self.rendre(); }; };
    var avecCout = liste.filter(function (v) { return Number(v.cout) > 0; }), coutMoy = avecCout.length ? Math.round(avecCout.reduce(function (t, v) { return t + Number(v.cout); }, 0) / avecCout.length) : null;
    var ages = liste.map(function (v) { return AMX.joursDepuis(v.dateAjout); }).filter(function (j) { return j !== null && j !== undefined && !isNaN(j) && j >= 0; });
    var ageMoy = ages.length ? Math.round(ages.reduce(function (t, j) { return t + j; }, 0) / ages.length) : null;
    this.elKpis.appendChild(kpi(String(liste.length), liste.length > 1 ? 'Véhicules' : 'Véhicule', { classe: 'neutre.inv2-fixe', sous: sA.texte + ' de coût', titre: sA.detail }));
    this.elKpis.appendChild(kpi(String(retard), 'Registre 10 j+', { classe: retard ? 'alerte' : 'neutre', sous: retard ? 'non reçu — à relancer' : 'tout est reçu', actif: f.alerte === 'retard', onclick: clic('retard') }));
    this.elKpis.appendChild(kpi(String(retardAchat), 'Achat 7 j+', { classe: retardAchat ? 'attention' : 'neutre', sous: retardAchat ? 'pas encore en stock' : 'aucun retard', actif: f.alerte === 'retardAchat', onclick: clic('retardAchat') }));
    var nAuto = sansAlerte.filter(estAuto).length;
    if (nAuto || f.alerte === 'auto') this.elKpis.appendChild(kpi(String(nAuto), 'Entrés automatiquement', { classe: 'auto', sous: 'achats à confirmer', actif: f.alerte === 'auto', onclick: clic('auto') }));
    this.elKpis.appendChild(kpi(coutMoy === null ? '—' : AMX.fmtArgent(coutMoy, 0), 'Coût moyen', { classe: 'neutre.inv2-fixe', sous: ageMoy === null ? '' : 'âge moyen ' + ageMoy + ' j depuis l\'achat', titre: avecCout.length + ' véhicule(s) avec un coût' + (liste.length - avecCout.length ? ', ' + (liste.length - avecCout.length) + ' sans coût' : '') }));
    this.rendreRegistres();
    this.rendrePorteeUi2(liste);
  };
  /* « Chiffres et liste : 34 véhicules · É.-U. · Ste Marie… · En stock · Registre 10 j+ » + « Effacer les filtres ». */
  Registre.prototype.rendrePorteeUi2 = function (liste) {
    var self = this, f = this.filtres, cfg = this.cfg;
    if (!this.elPortee) return;
    var t = (f.recherche || '').trim(), filtres = [];
    if (t) filtres.push('« ' + t + ' » — tous statuts, tous registres');
    else if (f.statuts && f.statuts.length === cfg.statuts.length) filtres.push('Tous les statuts (vendus compris)');
    else if (f.statuts) filtres.push(f.statuts.map(function (s) { return AMX.statut(s, cfg.feuille).libelle; }).join(' + '));
    if (f.alerte === 'retard') filtres.push('Registre non reçu 10 j+');
    if (f.alerte === 'retardAchat') filtres.push('Achat 7 j+, pas en stock');
    if (f.alerte === 'auto') filtres.push('Entrés automatiquement, à confirmer');
    if (!t) {
      if (f.origine) filtres.push('Origine : ' + f.origine);
      if (f.rappel) filtres.push({ oui: 'Rappel ouvert', non: 'Aucun rappel', inconnu: 'Rappel non vérifié' }[f.rappel] || f.rappel);
      if (f.importateur) filtres.push('Importateur : ' + f.importateur);
      if (f.registre) filtres.push({ non: 'Registre non reçu', 'oui-bon': 'Registre reçu · bon nom', 'oui-mauvais': 'Registre reçu · mauvais nom' }[f.registre] || f.registre);
    }
    AMX.porteeChiffres(this.elPortee, { n: liste.length, unite: ['véhicule', 'véhicules'],
      contexte: ['Registre ' + cfg.titre, f.compagnie ? (AMX.COMPAGNIES_TOUTES[f.compagnie] || f.compagnie) : 'toutes les concessions', (!t && f.statuts === null) ? 'actifs' : ''],
      filtres: filtres,
      effacer: function () { var c = f.compagnie; self.filtres = self.filtresDefaut(); self.filtres.compagnie = c; self.elRechercheUi2.value = ''; self.construireFiltresUi2(); self.rendre(); } });
  };

  /* ------------------------------ Données ------------------------------ */
  Registre.prototype.charger = function (force) {
    var self = this, gen = this.generation;
    var etat = document.getElementById('inv-etat');
    var enCache = AMX.inventaire.enCache(this.cfg.feuille);
    if (enCache) { this.vehicules = enCache; this.rendre(); }
    else { this.elListe.innerHTML = ''; this.elListe.appendChild(AMX.chargeur('Inventaire ' + this.cfg.titre)); }
    if (etat && !enCache) etat.textContent = 'Chargement depuis le serveur…';
    return AMX.inventaire.lire(this.cfg.feuille, force !== false).then(function (liste) {
      if (gen !== self.generation) return;
      self.vehicules = liste;
      if (etat) etat.textContent = liste.length + ' véhicules · synchronisé à ' + new Date().toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });
      self.construireRail(); self.rendre(); AMX.rafraichirSousBarre();
    }).catch(function (e) {
      if (etat) etat.textContent = 'Serveur injoignable : ' + AMX.erreurTexte(e);
      if (!enCache) self.elListe.innerHTML = '';
      AMX.toast('Impossible de charger le registre ' + self.cfg.titre + ' : ' + AMX.erreurTexte(e), 'erreur');
    });
  };
  Registre.prototype.rafraichir = function () {
    if (document.hidden || this.ecritures > 0) return;
    var a = document.activeElement;
    if (a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) && this.elAgencement.contains(a)) return;
    this.charger('frais');   // v=39 : seul le rafraîchissement explicite exige un recalcul côté serveur
  };

  // Une écriture : jamais rejouée, liste rafraîchie ensuite.
  // Actions idempotentes d'un seul véhicule : la liste est retouchée TOUT DE SUITE (mise à jour
  // optimiste, 7 oct. — Maxime : « changer de statut est trop long »), la requête part avec une
  // requête de secours (AMX.post secours) et, à la réponse, le serveur a le dernier mot ; en cas
  // de refus ou d'erreur, on remet l'ancienne valeur. Les actions qui créent / déplacent / suppriment
  // gardent le chemin complet (relecture).
  var ACTIONS_OPTIMISTES = { advance: 1, setStatus: 1, setDoc: 1, setStock: 1, setCost: 1, setCompagnie: 1 };
  Registre.prototype.ecrire = function (payload, message, opts) {
    var self = this;
    opts = opts || {};
    payload = Object.assign({}, payload, { sheet: this.cfg.feuille });
    this.ecritures++; this.generation++;
    var etat = document.getElementById('inv-etat'); if (etat) etat.textContent = 'Enregistrement…';
    var redessiner = function () {
      self.vehicules = AMX.inventaire.enCache(self.cfg.feuille) || self.vehicules;
      self.construireRail(); self.rendre(); AMX.rafraichirSousBarre();
      if (etat) etat.textContent = self.vehicules.length + ' véhicules · synchronisé à ' + new Date().toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });
    };
    var relire = function () { return AMX.inventaire.lire(self.cfg.feuille, true).catch(function () {}); };
    // Mise à jour optimiste : on retouche la liste avant même d'envoyer.
    var optimiste = opts.optimiste || null, avant = null;
    if (optimiste && ACTIONS_OPTIMISTES[payload.action]) {
      avant = AMX.inventaire.retoucher(self.cfg.feuille, optimiste.cle || payload.id, optimiste.champs);
      if (avant) setTimeout(function () { if (!avant && !self.ecritures) return; self.construireRail(); self.rendre(); AMX.rafraichirSousBarre(); if (etat) etat.textContent = 'Enregistrement…'; }, 0);
    }
    var revenir = function () { if (avant) { AMX.inventaire.retoucher(self.cfg.feuille, optimiste.cle || payload.id, avant); avant = null; } };
    return AMX.post(payload, { secours: ACTIONS_OPTIMISTES[payload.action] ? true : false }).then(function (d) {
      self.ecritures--;
      if (d.refuse || d.ok === false) {
        var motif = d.erreur || d.message || (d.code ? 'action refusée (' + d.code + ')' : 'action refusée');
        AMX.toast('Non enregistré — ' + motif, 'erreur');
        revenir(); redessiner();
        throw new Error(motif);
      }
      var p;
      if (Array.isArray(d.vehicules)) { AMX.inventaire.remplacer(self.cfg.feuille, d.vehicules); p = Promise.resolve(); }
      else if (d.vehicule && d.vehicule.vin) { AMX.inventaire.retoucher(self.cfg.feuille, d.vehicule.vin, d.vehicule); p = Promise.resolve(); }
      else if (avant) p = Promise.resolve();          // le serveur a dit oui sans renvoyer la liste : notre retouche tient
      else p = relire();
      if (d.doublonsIgnores && d.doublonsIgnores.length) AMX.toast(d.doublonsIgnores.length + ' VIN déjà présent(s) ignoré(s) : ' + d.doublonsIgnores.join(', '), 'attention', 7000);
      else if (d.doublonIgnore) AMX.toast('VIN déjà présent, non ajouté : ' + d.doublonIgnore, 'attention');
      else if (message) AMX.toast(message, 'ok');
      return p.then(function () { redessiner(); return d; });
    }, function (e) {
      self.ecritures--;
      // Google a mal répondu : le script a souvent fait le travail quand même. On relit.
      AMX.toast('Réponse du serveur incertaine — vérification dans le registre… (' + AMX.erreurTexte(e) + ')', 'attention', 6000);
      revenir();
      return relire().then(function () { redessiner(); throw e; });
    });
  };

  /* ------------------------------ Filtrage ----------------------------- */
  Registre.prototype.base = function () {
    var f = this.filtres;
    return this.vehicules.filter(function (v) { return !f.compagnie || v.compagnie === f.compagnie; });
  };
  // Recherche « partout » (Maxime, 6 oct. : « on doit toujours trouver le stock, peu importe où il
  // est, sans cliquer Acheté / En stock / Expédié ») : dès qu'on tape, les statuts et les autres
  // filtres ne comptent plus, et les deux autres registres sont fouillés aussi (en cache ; sinon
  // on les charge et la liste se redessine à leur arrivée). Seule la compagnie choisie reste.
  Registre.prototype.rechercherPartout = function (t) {
    var self = this, f = this.filtres, cfg = this.cfg;
    var tout = this.vehicules.slice();
    ['US', 'CAN', 'DETAIL'].forEach(function (feuille) {
      if (feuille === cfg.feuille) return;
      var l = AMX.inventaire.enCache(feuille);
      if (l) { tout = tout.concat(l); return; }
      if (!self.chargementsAutres) self.chargementsAutres = {};
      if (self.chargementsAutres[feuille]) return;
      self.chargementsAutres[feuille] = true;
      AMX.inventaire.lire(feuille, false).then(function () { if (!self.detruit && self.filtres.recherche) self.rendre(); }).catch(function () {});
    });
    var mots = AMX.motsCherches(t);   /* v138 : accents, ordre des mots, « série 3 » = « 3 series » = 328i (AMX.correspond) */
    return tout.filter(function (v) {
      if (f.compagnie && v.compagnie !== f.compagnie) return false;
      return AMX.correspond([v.vin, v.modele, v.stock, v.origine], mots);
    });
  };
  // v138 : `sauf` ('statut' ou 'alerte') = le filtre à ne pas appliquer, pour compter une pastille ou un chiffre. L'alerte
  // (registre 10 j+, achat 7 j+) se combine maintenant avec le statut (avant, elle le remplaçait) : par défaut on voit donc les
  // véhicules ACTIFS en retard, le même compte que l'Accueil (AMX.inventaire.alertes).
  Registre.prototype.filtrer = function (sauf) {
    var f = this.filtres, cfg = this.cfg, alerte = sauf === 'alerte' ? '' : f.alerte;
    var gardeAlerte = function (v) { return alerte === 'retard' ? enRetardRegistre(v) : (alerte === 'retardAchat' ? enRetardAchat(v) : (alerte === 'auto' ? estAuto(v) : true)); };
    if (f.recherche && f.recherche.trim()) return trier(this.rechercherPartout(f.recherche.trim().toLowerCase()).filter(gardeAlerte), this.tri);
    var actifs = cfg.statuts.filter(function (s) { return s !== 'arrive' && s !== 'comptabilise'; });
    var statuts = f.statuts || actifs;
    var l = this.base().filter(function (v) {
      if (sauf !== 'statut' && !(statuts.indexOf(v.statut) >= 0 || statuts.length === cfg.statuts.length)) return false;
      return gardeAlerte(v);
    });
    if (f.origine) l = l.filter(function (v) { return v.origine === f.origine; });
    if (f.rappel === 'oui') l = l.filter(function (v) { return v.rappel === 'oui'; });
    else if (f.rappel === 'non') l = l.filter(function (v) { return v.rappel === 'non'; });
    else if (f.rappel === 'inconnu') l = l.filter(function (v) { return !v.rappel; });
    if (f.importateur) l = l.filter(function (v) { return v.importateur === f.importateur; });
    if (f.registre) l = l.filter(function (v) { return registreDe(v) === f.registre; });
    if (f.recherche) {
      var mots = AMX.motsCherches(f.recherche);
      l = l.filter(function (v) { return AMX.correspond([v.vin, v.modele, v.stock, v.origine], mots); });
    }
    return trier(l, this.tri);
  };

  /* -------------------------------- Rendu ------------------------------ */
  Registre.prototype.rendre = function () {
    if (this.elBandeau && this.elBandeau.parentNode) { var nb = AMX.bandeauPortee('inventaire', this.filtres.compagnie, !!this.filtres.recherche); this.elBandeau.parentNode.replaceChild(nb, this.elBandeau); this.elBandeau = nb; }
    if (this.ui2 && this.elPastillesUi2) this.construireFiltresUi2();   /* v138 : les nombres des pastilles suivent les données et les filtres */
    var liste = this.filtrer();
    this.listeCourante = liste;
    this.rendreKpis(liste);
    this.rendreOutils(liste);
    this.rendreListe(liste);
    this.rendrePanneau();
  };

  Registre.prototype.rendreKpis = function (liste) {
    var self = this, base = this.base(), f = this.filtres, cfg = this.cfg;
    AMX.vider(this.elKpis);
    var kpi = function (valeur, libelle, opts) {
      opts = opts || {};
      var k = h((opts.onclick ? 'button' : 'div') + '.kpi' + (opts.classe ? '.' + opts.classe : '') + (opts.actif ? '.actif' : ''), opts.onclick ? { type: 'button', title: opts.titre || '', 'aria-pressed': opts.actif ? 'true' : 'false' } : { title: opts.titre || '' }, [
        h('div.valeur', { text: valeur }), h('div.libelle', { text: libelle }), opts.sous ? h('div.sous', { text: opts.sous }) : null,
        opts.couleur ? h('span.pastille', { style: { background: 'var(--' + opts.couleur + ')' } }) : null
      ]);
      if (opts.onclick) k.addEventListener('click', opts.onclick);
      return k;
    };
    var tousActifs = f.statuts === null && !f.alerte;
    if (this.ui2) { this.rendreResumeUi2(kpi, liste); return; }
    // Total en $ (coût d'achat) par registre et par statut — demande de Maxime, 7 oct.
    var sommeCouts = AMX.inventaire.sommeCouts;
    var sTotal = sommeCouts(base);
    this.elKpis.appendChild(kpi(base.length, 'Total', { classe: 'neutre', sous: sTotal.texte + ' · ' + (f.compagnie ? AMX.COMPAGNIES[f.compagnie] : 'toutes'), titre: sTotal.detail + (f.compagnie ? '' : ' — toutes les compagnies'), actif: f.statuts && f.statuts.length === cfg.statuts.length && !f.alerte, onclick: function () { f.statuts = cfg.statuts.slice(); f.alerte = ''; self.construireRail(); self.rendre(); } }));
    cfg.statuts.forEach(function (s) {
      var st = AMX.statut(s, cfg.feuille);
      var dansStatut = base.filter(function (v) { return v.statut === s; });
      var n = dansStatut.length, sS = sommeCouts(dansStatut);
      var actif = !f.alerte && f.statuts && f.statuts.length === 1 && f.statuts[0] === s;
      self.elKpis.appendChild(kpi(n, st.libelle, { couleur: st.couleur, actif: actif, sous: n ? sS.texte : '', titre: sS.detail, onclick: function () {
        f.alerte = '';
        f.statuts = actif ? null : [s];
        self.construireRail(); self.rendre();
      } }));
    });
    var sansAlerte = this.filtrer('alerte'), retard = sansAlerte.filter(enRetardRegistre).length, retardAchat = sansAlerte.filter(enRetardAchat).length;
    if (retard) this.elKpis.appendChild(kpi(retard, 'Registre 10 j+', { classe: 'alerte', sous: 'non reçu', actif: f.alerte === 'retard', onclick: function () { f.alerte = f.alerte === 'retard' ? '' : 'retard'; self.rendre(); } }));
    if (retardAchat) this.elKpis.appendChild(kpi(retardAchat, 'Achat 7 j+', { classe: 'attention', sous: 'pas encore en stock', actif: f.alerte === 'retardAchat', onclick: function () { f.alerte = f.alerte === 'retardAchat' ? '' : 'retardAchat'; self.rendre(); } }));
    var nAuto2 = sansAlerte.filter(estAuto).length;
    if (nAuto2) this.elKpis.appendChild(kpi(nAuto2, 'Entrés automatiquement', { classe: 'auto', sous: 'achats à confirmer', actif: f.alerte === 'auto', onclick: function () { f.alerte = f.alerte === 'auto' ? '' : 'auto'; self.rendre(); } }));
    void tousActifs;
    this.rendreValeur();
  };

  // Pastilles É.-U. · Canada · Detail sous le titre (11 oct.) : le registre courant, avec le nombre de véhicules actifs de la
  // concession choisie ; cliquer change de registre (#/inventaire/usage?registre=…).
  Registre.prototype.rendreRegistres = function () {
    var self = this; if (!this.elRegistres) return;
    AMX.vider(this.elRegistres);
    var regs = AMX.inventaire.valeurRegistres(this.filtres.compagnie);
    regs.forEach(function (r) {
      self.elRegistres.appendChild(h('button' + (r.id === self.onglet ? '.actif' : ''), { type: 'button', 'data-registre': r.id, title: r.charge ? r.n + ' véhicule(s) actif(s) · ' + r.texte + ' de coût' : '', onclick: function () { if (r.id !== self.onglet) AMX.inventaire.aller(r.id); } }, [r.titre, r.charge ? h('span.compteur', { text: ' ' + r.n }) : null, (self.ui2 && r.charge && r.total) ? h('span.valeur-reg', { text: montantCourt(r.total) }) : null]));
    });
  };
  // Bande « Valeur des inventaires » : les trois registres côte à côte (véhicules actifs), registre courant en évidence.
  Registre.prototype.rendreValeur = function () {
    var self = this, f = this.filtres;
    AMX.vider(this.elValeur);
    var regs = AMX.inventaire.valeurRegistres(f.compagnie);
    var charges = regs.filter(function (r) { return r.charge; });
    var total = charges.reduce(function (t, r) { return t + r.total; }, 0), nTotal = charges.reduce(function (t, r) { return t + r.n; }, 0);
    this.elValeur.appendChild(h('span.l', { text: 'Valeur des inventaires' + (f.compagnie ? ' — ' + (AMX.COMPAGNIES[f.compagnie] || f.compagnie) : '') }));
    regs.forEach(function (r) {
      var el = h('button.reg' + (r.id === self.onglet ? '.courant' : ''), { type: 'button', title: r.charge ? r.n + ' véhicule(s) actif(s)' + (r.sans ? ', ' + r.sans + ' sans coût' : '') : 'Pas encore chargé', onclick: function () { if (r.id !== self.onglet) AMX.inventaire.aller(r.id); } }, [
        h('span.t', { text: r.titre }), h('span.v', { text: r.charge ? r.texte : '…' }), h('span.n', { text: r.charge ? r.n + ' véh.' : '' })
      ]);
      self.elValeur.appendChild(el);
    });
    this.elValeur.appendChild(h('span.total', [h('span.t', 'Total'), h('span.v', { text: AMX.fmtArgent(total, 0) }), h('span.n', { text: nTotal + ' véh.' + (charges.length < regs.length ? ' (partiel)' : '') })]));
    this.rendreRegistres();
  };

  Registre.prototype.rendreOutils = function (liste) {
    var self = this;
    AMX.vider(this.elOutils);
    var sel = h('select.saisie', { onchange: function (e) { self.tri = e.target.value; AMX.memo.ecrire('inv_tri', self.tri); self.rendre(); } });
    [['maj', 'Dernière mise à jour'], ['achat', 'Achat récent'], ['achatAsc', 'Achat ancien'], ['statut', 'Statut'], ['modele', 'Modèle'], ['stock', '# stock'], ['cout', 'Coût']].forEach(function (o) { sel.appendChild(h('option', { value: o[0], selected: self.tri === o[0], text: 'Tri : ' + o[1] })); });
    if (this.ui2) { this.elOutils.appendChild(h('span.espace')); this.elOutils.appendChild(sel); return; }
    var f = this.filtres;
    var puces = [];
    if (f.alerte === 'retard') puces.push(['Registre non reçu 10 j+', function () { f.alerte = ''; }]);
    if (f.alerte === 'retardAchat') puces.push(['Pas en stock 7 j+', function () { f.alerte = ''; }]);
    if (f.alerte === 'auto') puces.push(['Entrés automatiquement', function () { f.alerte = ''; }]);
    if (f.statuts && f.statuts.length === 1) puces.push([AMX.statut(f.statuts[0], this.cfg.feuille).libelle, function () { f.statuts = null; }]);
    else if (f.statuts && f.statuts.length === this.cfg.statuts.length) puces.push(['Vendus et comptabilisés inclus', function () { f.statuts = null; }]);
    if (f.compagnie) puces.push([AMX.COMPAGNIES[f.compagnie] || f.compagnie, function () { f.compagnie = ''; AMX.choisirCompagnie(''); }]);
    if (f.recherche) puces = [['« ' + f.recherche + ' » — tous statuts, tous registres' + (f.compagnie ? ', ' + (AMX.COMPAGNIES_TOUTES[f.compagnie] || f.compagnie) : ''), function () { f.recherche = ''; }]];
    this.elOutils.appendChild(h('span.compte', [h('b', { text: liste.length }), ' véhicule' + (liste.length > 1 ? 's' : '')]));
    puces.forEach(function (p) {
      var b = h('button.puce.info', { type: 'button', title: 'Retirer ce filtre', html: esc(p[0]) + ' ✕' });
      b.addEventListener('click', function () { p[1](); self.construireRail(); self.rendre(); });
      self.elOutils.appendChild(b);
    });
    this.elOutils.appendChild(h('span.espace'));
    this.elOutils.appendChild(sel);
  };

  Registre.prototype.rendreListe = function (liste) {
    var self = this;
    AMX.vider(this.elListe);
    if (this.observateur) this.observateur.disconnect();
    if (!liste.length) {
      this.elListe.appendChild(h('div.vide', [h('div', { html: I.voiture }), h('h3', 'Aucun véhicule'), h('div', 'Aucun véhicule ne correspond aux filtres choisis.')]));
      return;
    }
    var frag = document.createDocumentFragment();
    var MAX = 400;
    /* v138 : la liste se lit comme un tableau — les titres de colonnes une seule fois, en haut, au lieu de « Statut / Mise à
       jour / Suivi / Coût » répétés sur chaque ligne. */
    if (this.ui2) frag.appendChild(h('div.ligne.ligne-tete', { 'aria-hidden': 'true' }, [h('div'), h('div', 'Véhicule'), h('div.cell.statut', 'Statut'), h('div.cell.maj', 'Mise à jour'), h('div.cell.indic', 'Suivi'), h('div.montant', 'Coût'), h('div')]));
    liste.slice(0, MAX).forEach(function (v) { frag.appendChild(self.ligne(v)); });
    if (liste.length > MAX) frag.appendChild(h('div.vide', { text: (liste.length - MAX) + ' autres véhicules — affinez les filtres pour les voir.' }));
    this.elListe.appendChild(h('div.liste', [frag]));
    // Vignettes à la demande
    if ('IntersectionObserver' in window) {
      this.observateur = new IntersectionObserver(function (entrees) {
        entrees.forEach(function (en) {
          if (!en.isIntersecting) return;
          self.observateur.unobserve(en.target);
          var vin = en.target.dataset.vin;
          photosDe(vin).then(function (p) {
            if (!(p && p.length)) return;
            var repli = Array.prototype.slice.call(en.target.childNodes);
            var img = h('img', { src: AMX.vignetteDrive(p[0].url, 200), alt: '', loading: 'lazy' });
            img.addEventListener('error', function () { AMX.vider(en.target); repli.forEach(function (n) { en.target.appendChild(n); }); });   // miniature Drive indisponible : on garde le logo
            AMX.vider(en.target).appendChild(img);
          });
        });
      }, { rootMargin: '200px' });
      this.elListe.querySelectorAll('.vignette[data-vin]').forEach(function (el) { self.observateur.observe(el); });
    }
  };

  Registre.prototype.ligne = function (v) {
    var self = this, cfg = this.cfg;
    var autreRegistre = v._feuille && v._feuille !== cfg.feuille ? v._feuille : '';
    var st = AMX.statut(v.statut, autreRegistre || cfg.feuille);
    var reg = registreDe(v), regInfo = REGISTRE[reg] || REGISTRE.non;
    var retard = enRetardRegistre(v), retardA = enRetardAchat(v);
    var jours = AMX.joursDepuis(v.dateAjout);
    var cls = 'div.ligne' + (retard ? '.retard' : (retardA ? '.retard-achat' : '')) + (estAuto(v) ? '.achat-auto' : '') + (v.statut === 'comptabilise' ? '.verrouille' : '') + (this.selection && String(v.vin).toUpperCase() === String(this.selection).toUpperCase() ? '.actif' : '');
    // Sans photo : le logo du constructeur (voir AMX.logoMarque) ; avec photos,
    // le logo tient lieu de repli jusqu'à ce que la miniature charge.
    var vignette = v.hasPhotos ? h('div.vignette', { dataset: { vin: v.vin }, title: 'Photos disponibles' }, [AMX.logoMarque(marque(v)), h('span.cam', { html: I.photo })]) : h('div.vignette', { title: 'Aucune photo' }, [AMX.logoMarque(marque(v))]);
    // Rappels (8 oct., soir — Maxime) : rouge ou vert, pas le détail ; un clic sur la puce rouge ouvre le détail.
    var puceRappel = v.rappel === 'oui'
      ? h('span.puce.alerte.rappel-puce', { text: 'Rappel', title: 'Rappel ouvert — cliquez pour le détail', onclick: function (e) { e.stopPropagation(); self.rappelsOuverts = true; self.selectionner(v.vin); } })
      : (v.rappel === 'non' ? h('span.puce.ok', { text: 'Sans rappel', title: 'Aucun rappel ouvert (NHTSA)' }) : h('span.puce', { text: 'Rappel ?', title: 'Rappel non vérifié' }));
    var indicateurs = [
      // 26 oct. : entré automatiquement depuis un portail (GMF, Manheim), à confirmer — violet.
      AMX.achatsAuto ? AMX.achatsAuto.puce(v.vin) : null,
      puceRappel,
      h('span.puce' + (reg === 'oui-bon' ? '.ok' : (reg === 'oui-mauvais' ? '.attention' : (retard ? '.alerte' : ''))), { text: reg === 'non' ? (retard ? 'Registre · ' + jours + ' j' : 'Registre à recevoir') : regInfo.libelle }),
      v.ficheExiste ? h('span.puce' + (v.ficheStockRempli ? '.ok' : '.attention'), { text: v.ficheStockRempli ? 'Fiche ✓' : 'Fiche sans stock' }) : null,
      // Un clic sur la puce ouvre le rapport directement (comme sur eBlock), sans ouvrir la fiche.
      AMX.carfax.lien(v.vin) ? h('a.puce.info.lien-puce', { href: AMX.carfax.lien(v.vin), target: '_blank', rel: 'noopener', text: 'CARFAX', title: 'Voir le rapport CARFAX', onclick: function (e) { e.stopPropagation(); } }) : null,
      // Acheté sur eBlock : la fiche descriptive (dommages, cote) s'ouvre d'un clic, sans ouvrir le panneau.
      AMX.eblockPuce ? AMX.eblockPuce(v.vin) : null,
      // Valeurs OpenLane (9 oct.) : prévision (ou moyenne des ventes comparables) d'un clic, sans ouvrir le panneau.
      AMX.openlanePuce ? AMX.openlanePuce(v.vin) : null,
      // Demande de travaux au service (8 oct.) : orange = envoyée, verte = BT approuvé, rouge = retournée.
      (cfg.feuille === 'DETAIL' && AMX.demandePuce) ? AMX.demandePuce(v.vin) : null,
      cfg.importateur && v.importateur ? h('span.puce', { text: v.importateur }) : null
    ];
    var el = h(cls, { dataset: { id: v.id, vin: v.vin } }, [
      vignette,
      h('div', { style: { minWidth: 0 } }, [
        h('div.titre', { text: v.modele || '(modèle à préciser)' }),
        // Les informations du véhicule sont ici, dans la ligne (8 oct., soir — Maxime) : le NIV (une seule fois,
        // un clic le copie), # stock, compagnie, origine, importateur ; la date d'achat est sous le statut.
        h('div.sous', [h('span.vin', { text: v.vin, title: 'Copier le NIV', onclick: function (e) { e.stopPropagation(); AMX.copier(v.vin, 'NIV copié'); } }), v.stock ? h('span.puce.mono', { text: v.stock }) : null, h('span.puce', { text: v.compagnie || '—' }), v.origine ? h('span.puce', { text: v.origine }) : null, autreRegistre ? h('span.puce.registre-autre', { text: 'Registre ' + AMX.inventaire.nomFeuille(autreRegistre), title: 'Ce véhicule est dans un autre registre — cliquez pour l\'ouvrir là-bas.' }) : null])
      ]),
      h('div.cell.statut', [h('span.l', 'Statut'), h('span', [h('span.badge.' + st.couleur, { text: st.libelle })]),
        v.statut === 'transit' ? h('span.jours.attention', { text: 'Expédié depuis ' + AMX.joursDepuis(v.maj) + ' j' }) : h('span.jours' + (retardA ? '.attention' : ''), { text: 'Acheté le ' + AMX.fmtDate(v.dateAjout) + ' · ' + jours + ' j' })]),
      h('div.cell.maj', [h('span.l', 'Mise à jour'), h('span.v', { text: AMX.fmtDate(v.maj, true) })]),
      h('div.cell.indic', [h('span.l', 'Suivi'), h('div.indicateurs', indicateurs)]),
      h('div.montant', [h('span.l', 'Coût'), h('span', { text: v.cout ? AMX.fmtArgent(v.cout) : '—' })]),
      h('button.plus', { 'aria-label': 'Ouvrir la fiche', type: 'button', title: 'Ouvrir', html: I.chevron })
    ]);
    el.addEventListener('click', function () { if (autreRegistre) AMX.inventaire.aller(autreRegistre.toLowerCase(), { vin: v.vin }); else self.selectionner(v.vin); });
    return el;
  };

  /* 26 oct. — Maxime : « mode glisser et cliquer », « effacer plus d'un véhicule à la fois ». « Sélectionner » : cliquer ou
     glisser sur les lignes, puis Supprimer (droit « Supprimer »). La suppression passe par AMX.inventaire.supprimer : le
     véhicule disparaît aussi de l'Analyse usagé, du Prix du marché et du Suivi service. */
  Registre.prototype.creerSelection = function () {
    var self = this;
    if (this.sel) this.sel.quitter();
    this.sel = AMX.modeSelection({ liste: this.elListe, selecteur: '.ligne', actions: [
      AMX.perm('supprimer') ? { texte: 'Supprimer', icone: I.corbeille, danger: true, action: function (vins, vider) {
        AMX.inventaire.supprimer(vins, { feuille: self.cfg.feuille }).then(function (faits) {
          if (!faits) return;
          vider();
          if (faits.indexOf(String(self.selection || '').toUpperCase()) >= 0) self.selectionner('');
          self.vehicules = AMX.inventaire.enCache(self.cfg.feuille) || self.vehicules;
          self.construireRail(); self.rendre(); AMX.rafraichirSousBarre();
        });
      } } : null
    ] });
  };

  Registre.prototype.selectionner = function (vin) {
    this.selection = vin;
    var hsh = AMX.inventaire.lien(this.onglet, vin ? { vin: vin } : {});
    history.replaceState(null, '', hsh);
    this.elListe.querySelectorAll('.ligne').forEach(function (l) { l.classList.remove('actif'); });
    var v = this.vehicules.filter(function (x) { return String(x.vin).toUpperCase() === String(vin || '').toUpperCase(); })[0];
    if (v) { var el = this.elListe.querySelector('.ligne[data-id="' + CSS.escape(String(v.id)) + '"]'); if (el) el.classList.add('actif'); }
    this.rendrePanneau();
  };

  /* ------------------------------ Panneau ------------------------------ */
  Registre.prototype.rendrePanneau = function () {
    var self = this, cfg = this.cfg;
    var v = this.selection ? this.vehicules.filter(function (x) { return String(x.vin).toUpperCase() === String(self.selection).toUpperCase(); })[0] : null;
    this.elAgencement.classList.toggle('avec-panneau', !!v);
    AMX.vider(this.elPanneau);
    if (!v) { this.elPanneau.style.display = 'none'; return; }
    this.elPanneau.style.display = '';
    var st = AMX.statut(v.statut, cfg.feuille);
    var verrouille = v.statut === 'comptabilise';
    var peutStatut = AMX.perm('changerStatut'), peutMontants = AMX.perm('modifierMontants'), peutSupprimer = AMX.perm('supprimer');
    var suivant = cfg.suivant[v.statut];
    var fermer = function () { self.selectionner(''); };

    // Statut
    var blocStatut = h('div.bloc', [h('h3', 'Statut')]);
    var ligneStatut = h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' } }, [h('span.badge.' + st.couleur, { text: st.libelle }), h('span.doux.petit', { text: 'depuis le ' + AMX.fmtDate(v.maj, true) })]);
    blocStatut.appendChild(ligneStatut);
    if (verrouille) {
      blocStatut.appendChild(h('div.alerte-bloc.info', [h('span', { html: I.cadenas }), h('div', 'Dossier comptabilisé : verrouillé. Déverrouillez-le pour corriger (inscrit au journal sous votre nom).')]));
      if (peutStatut) blocStatut.appendChild(h('div', { style: { marginTop: '10px' } }, [h('button.btn.bloc', { html: I.cadenas + '<span>Déverrouiller (remettre « Vendu »)</span>', onclick: function () {
        AMX.confirmer('Déverrouiller ce dossier ?', 'Le véhicule repasse au statut « Vendu » pour correction. L\'opération est inscrite au journal sous votre nom.').then(function (ok) { if (ok) self.ecrire({ action: 'advance', id: v.id, newStatut: 'arrive' }, 'Dossier déverrouillé'); });
      } })]));
    } else if (peutStatut) {
      var actions = h('div.actions-ligne');
      if (suivant) actions.appendChild(h('button.btn.primaire', { html: I.ok + '<span>' + esc(LIBELLE_SUIVANT[suivant] || 'Avancer') + '</span>', onclick: function () { self.avancer(v, suivant); } }));
      var sel = h('select.saisie', { style: { height: '32px', flex: '1 1 140px' } }, [h('option', { value: '', text: 'Corriger le statut…' })]);
      cfg.statuts.forEach(function (s) { if (s !== v.statut) sel.appendChild(h('option', { value: s, text: AMX.statut(s, cfg.feuille).libelle })); });
      sel.addEventListener('change', function () {
        var ns = sel.value; if (!ns) return; sel.value = '';
        if (ns === 'transit' && cfg.importateur) { self.avancer(v, 'transit'); return; }
        AMX.confirmer('Corriger le statut', 'Passer ' + v.vin + ' de « ' + st.libelle + ' » à « ' + AMX.statut(ns, cfg.feuille).libelle + ' » ?').then(function (ok) { if (ok) self.ecrire({ action: 'setStatus', id: v.id, newStatut: ns }, 'Statut corrigé', { optimiste: { champs: { statut: ns, maj: new Date().toISOString() } } }).catch(function () {}); });
      });
      actions.appendChild(sel);
      blocStatut.appendChild(actions);
    }

    // Registre reçu — une ligne compacte au bas du bloc Statut (7 oct. : « trop gros » en bloc à part).
    var reg = registreDe(v);
    var segReg = h('div.segment.petit');
    [['non', 'Non reçu'], ['oui-bon', 'Reçu · bon nom'], ['oui-mauvais', 'Mauvais nom']].forEach(function (o) {
      segReg.appendChild(h('button' + (reg === o[0] ? '.actif' : ''), { type: 'button', text: o[1], disabled: verrouille || !peutStatut, onclick: function () { if (reg !== o[0]) self.ecrire({ action: 'setDoc', id: v.id, value: o[0] }, 'Registre mis à jour', { optimiste: { champs: { enregistrement: o[0] } } }).catch(function () {}); } }));
    });
    blocStatut.appendChild(h('div.ligne-registre', [h('span.l', { text: 'Registre' }), segReg, enRetardRegistre(v) ? h('span.puce.alerte', { text: AMX.joursDepuis(v.dateAjout) + ' j sans registre' }) : null]));

    var selCompagnie = h('select.saisie', { disabled: verrouille || !peutMontants }, AMX.optionsCompagnies('—'));
    selCompagnie.value = AMX.COMPAGNIES[v.compagnie] ? v.compagnie : '';
    // Km obligatoire pour enregistrer un # stock (Maxime, 7 oct.) : le km vit dans la fiche d'achat (f-km) ;
    // le serveur refuse un # stock sans km (Stock.gs), le site l'envoie avec le # stock quand il vient d'être tapé.
    var peutStock = peutMontants || AMX.perm('ficheAchat');
    var kmConnu = null;
    var puceKm = h('span.puce.cache', { title: 'Kilométrage (fiche d\'achat)' });
    AMX.ficheDe(v.vin).then(function (f) {
      if (self.selection !== v.vin) return;
      kmConnu = f ? AMX.kmValide(f['f-km']) : null;
      if (kmConnu) { puceKm.textContent = AMX.fmtNombre(kmConnu) + ' km'; puceKm.classList.remove('cache'); }
    }).catch(function () {});
    // Les informations (stock, km, coût, compagnie, NIV) se corrigent dans une petite fenêtre « Modifier… » (bloc Gestion) :
    // dans le panneau elles ne sont plus affichées, la ligne les montre déjà (8 oct., soir — Maxime).
    var modifierInfos = function () {
      var inpStock = h('input.saisie.mono#inv-stock', { value: v.stock || '', placeholder: '—', disabled: verrouille || !peutStock });
      var inpKm2 = h('input.saisie#inv-km', { type: 'number', step: '1', value: kmConnu || '', placeholder: kmConnu ? '' : 'obligatoire avec un # stock', disabled: verrouille || !peutStock });
      var inpCout = h('input.saisie', { type: 'number', step: '0.01', value: v.cout || '', placeholder: '—', disabled: verrouille || !peutMontants });
      var inpVin = h('input.saisie.mono', { value: v.vin, disabled: verrouille || !peutMontants });
      var corps = h('div.grille.c2', [
        h('div.champ', [h('label', '# Stock'), inpStock]),
        h('div.champ', [h('label', 'Km'), inpKm2]),
        h('div.champ', [h('label', 'Coût'), inpCout]),
        h('div.champ', [h('label', 'Compagnie'), selCompagnie]),
        h('div.champ.plein', [h('label', 'NIV (correction — modifie le registre)'), inpVin])
      ]);
      AMX.modale({ titre: 'Modifier — ' + (v.modele || v.vin), corps: corps, boutons: [{ texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: function () {
        var stock = inpStock.value.trim(), km = AMX.kmValide(inpKm2.value), cout = inpCout.value.trim(), vinNouveau = inpVin.value.trim().toUpperCase();
        if (inpKm2.value.trim() && !km) { AMX.toast('Kilométrage invalide : un nombre de km supérieur à zéro.', 'erreur'); inpKm2.focus(); return false; }
        if (stock && stock !== String(v.stock || '').trim() && !kmConnu && !km) { AMX.toast('Le kilométrage est obligatoire pour enregistrer un # stock : entrez le km.', 'erreur'); inpKm2.classList.add('manque'); inpKm2.focus(); return false; }
        if (vinNouveau !== v.vin && !/^[A-HJ-NPR-Z0-9]{11,17}$/.test(vinNouveau)) { AMX.toast('NIV invalide (11 à 17 caractères, sans I, O ni Q).', 'erreur'); inpVin.focus(); return false; }
        var suite = Promise.resolve();
        var stockChange = stock !== String(v.stock || '').trim(), kmChange = !!(km && km !== kmConnu);
        // Un nouveau # stock avec un km tapé : les deux partent ensemble (setStock { value, km }) ; sinon setKm seul.
        if (kmChange && !(stockChange && stock)) suite = suite.then(function () { return AMX.post({ action: 'setKm', vin: v.vin, value: km }).then(function (d) { AMX.verifier(d, 'Kilométrage refusé'); kmConnu = d.km || km; AMX.ficheOublier(v.vin); AMX.toast('Kilométrage enregistré — ' + AMX.fmtNombre(kmConnu) + ' km', 'ok'); }); });
        if (stockChange) suite = suite.then(function () { var corps = { action: 'setStock', id: v.id, value: stock }; if (stock && kmChange) corps.km = km; return self.ecrire(corps, '# stock enregistré' + (corps.km ? ' avec le kilométrage' : ''), { optimiste: { champs: { stock: stock } } }).then(function () { if (corps.km) { kmConnu = km; AMX.ficheOublier(v.vin); } }); });
        if (cout !== String(v.cout || '').trim()) suite = suite.then(function () { return self.ecrire({ action: 'setCost', id: v.id, value: cout }, 'Coût enregistré', { optimiste: { champs: { cout: cout } } }); });
        if (selCompagnie.value !== (AMX.COMPAGNIES[v.compagnie] ? v.compagnie : '')) suite = suite.then(function () { return self.ecrire({ action: 'setCompagnie', id: v.id, value: selCompagnie.value }, 'Compagnie enregistrée', { optimiste: { champs: { compagnie: selCompagnie.value } } }); });
        if (vinNouveau !== v.vin) suite = suite.then(function () { return AMX.confirmer('Corriger le NIV', 'Remplacer ' + v.vin + ' par ' + vinNouveau + ' ? Cette action modifie le registre.').then(function (ok) { if (!ok) return; return self.ecrire({ action: 'setVin', id: v.id, value: vinNouveau }, 'NIV corrigé').then(function () { self.selection = vinNouveau; self.rendre(); }); }); });
        return suite.then(function () { if (self.selection === v.vin) self.rendrePanneau(); }).catch(function (e) { AMX.toast('Échec — ' + AMX.erreurTexte(e), 'erreur'); });
      } }] });
      setTimeout(function () { (stockVide() ? inpStock : inpKm2).focus(); }, 50);
    };
    var stockVide = function () { return !String(v.stock || '').trim(); };

    // Rappels (8 oct., soir — Maxime) : rouge ou vert, le détail seulement en cliquant.
    var ouvrirRappels = !!self.rappelsOuverts; self.rappelsOuverts = false;
    var blocRappel = h('div.bloc', [h('h3', ['Rappels', h('button.btn.petit.fantome', { text: 'Revérifier', onclick: function (e) { e.target.classList.add('occupe'); e.target.textContent = 'Vérification…'; self.reverifierRappel(v); } })])]);
    var rapUrl = RAPPELS_FABRICANT[marque(v)];
    if (v.rappel === 'oui') {
      var comps = String(v.rappelDetail || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      var uniques = comps.filter(function (c, i) { return comps.indexOf(c) === i; });
      var detailRappel = h('div.rappel-detail' + (ouvrirRappels ? '' : '.cache'), [
        h('ul', { style: { margin: '8px 0 0', paddingLeft: '18px', color: 'var(--encre-2)', fontSize: '12px', lineHeight: '1.5' } }, uniques.map(function (c) { return h('li', { text: c }); })),
        rapUrl ? h('div', { style: { marginTop: '8px' } }, [h('a.btn.petit', { href: rapUrl, target: '_blank', rel: 'noopener', html: I.externe + '<span>Page des rappels ' + esc(marque(v)) + '</span>' })]) : null
      ]);
      var badgeRappel = h('button.badge.rouge.rappel-badge', { type: 'button', title: 'Cliquez pour le détail', text: uniques.length + ' rappel' + (uniques.length > 1 ? 's' : '') + ' ouvert' + (uniques.length > 1 ? 's' : '') + (ouvrirRappels ? ' ▾' : ' ▸'), onclick: function () { var ouvert = detailRappel.classList.toggle('cache'); badgeRappel.textContent = badgeRappel.textContent.replace(/[▸▾]$/, ouvert ? '▸' : '▾'); } });
      blocRappel.appendChild(badgeRappel); blocRappel.appendChild(detailRappel);
    } else if (v.rappel === 'non') blocRappel.appendChild(h('span.badge.vert', { text: 'Aucun rappel' }));
    else blocRappel.appendChild(h('span.badge.gris', { text: 'Non vérifié' }));

    // Rapport d'état eBlock (fiche d'achat) : lien de partage et dommages
    // répertoriés, en rouge. Chargé à part, seulement si une fiche existe, et
    // montré seulement s'il y a quelque chose.
    // Fiche descriptive eBlock importée (Outils › Fiches eBlock, 7 oct.) : cote d'état,
    // dommages avec photos, pneus — montrée seulement si le véhicule a été acheté sur eBlock.
    var blocFicheEblock = null, ficheEblockLa = false;
    if (typeof AMX.eblockFiche === 'function') {
      var zoneEb = h('div');
      blocFicheEblock = h('div.bloc.cache', [h('h3', ['Fiche eBlock']), zoneEb]);
      AMX.eblockFiche(v.vin, zoneEb, { maxPieces: 6 }).then(function (achats) { if (achats && achats.length && blocFicheEblock.isConnected) { ficheEblockLa = true; blocFicheEblock.classList.remove('cache'); if (blocEblock) blocEblock.classList.add('cache'); } });
    }
    // Fiche Manheim (24 oct., manheim.js) : photos, cote CR, dommages, pneus — montrée seulement si le véhicule a été vu sur
    // Manheim (achats de BMW Sherbrooke sur la place de marché BMW Financial Services, ou annonce disponible).
    var blocManheim = null;
    if (AMX.manheim) {
      var zoneMh = h('div');
      blocManheim = h('div.bloc.cache', [h('h3', ['Fiche Manheim']), zoneMh]);
      AMX.manheim.bloc(v.vin, zoneMh).then(function (la) { if (la && blocManheim.isConnected) blocManheim.classList.remove('cache'); });
    }
    // Valeurs OpenLane (9 oct.) : ventes comparables, prévision 30-60-90 j, ajusté au km — ou le bouton pour les demander.
    var blocOpenlane = null;
    if (typeof AMX.openlaneBloc === 'function') {
      var zoneOl = h('div');
      blocOpenlane = h('div.bloc', [h('h3', ['Valeurs OpenLane']), zoneOl]);
      // Le km du moment vient de la fiche d'achat (comme la puce km de l'en-tête) : il sert à la prévision.
      AMX.ficheDe(v.vin).then(function (f) { return f ? AMX.kmValide(f['f-km']) : null; }, function () { return null; }).then(function (km) { AMX.openlaneBloc(v.vin, zoneOl, { km: km || undefined, source: 'inventaire', compagnie: String(v.compagnie || '').toUpperCase() }); }).catch(function () {});
    }
    // Prix du marché (24 oct., OccMarche.gs) : notre annonce comparée à celles des concessionnaires voisins (lecture du lundi).
    var blocMarche = null;
    if (cfg.feuille === 'DETAIL' && AMX.occMarche && v.statut !== 'arrive' && v.statut !== 'comptabilise') {
      var zoneMa = h('div');
      blocMarche = h('div.bloc', [h('h3', ['Prix du marché']), zoneMa]);
      AMX.occMarche.bloc(v.vin, zoneMa);
    }
    // Dommages de la fiche d'achat (en français) — seulement s'il n'y a pas de fiche eBlock, sinon c'est en double.
    var blocEblock = null;
    if (v.ficheExiste && AMX.ficheDe) {
      blocEblock = h('div.bloc.cache', [h('h3', ['Dommages (fiche d\'achat)'])]);
      AMX.ficheDe(v.vin).then(function (f) {
        if (!f || !blocEblock.isConnected || ficheEblockLa) return;
        var lien = AMX.eblockValide(f['f-eblock']), dommages = AMX.listeDommages(f['f-dommages']);
        if (AMX.eblockTraduireLignes) dommages = AMX.eblockTraduireLignes(dommages);
        if (!lien && !dommages.length) return;
        blocEblock.classList.remove('cache');
        if (dommages.length) {
          var nDom = AMX.nbDommages(dommages);
          blocEblock.appendChild(h('div', [
            h('span.badge.rouge', { text: nDom + ' dommage' + (nDom > 1 ? 's' : '') + ' répertorié' + (nDom > 1 ? 's' : '') }),
            h('ul.dommages-liste', dommages.map(function (d) { return h('li', { text: d }); }))
          ]));
        }
        if (lien) blocEblock.appendChild(h('div', { style: { marginTop: '8px' } }, [h('a.btn.petit', { href: lien, target: '_blank', rel: 'noopener', html: I.externe + '<span>Ouvrir sur eBlock</span>' })]));
      }).catch(function () {});
    }

    // Évaluation (Inventaire › Évaluations) : ce qu'on en sait, depuis la fiche d'inventaire (7 oct.).
    var blocEval = h('div.bloc', [h('h3', ['Évaluation', h('a.btn.petit', { href: AMX.lien('outils', 'evaluation', { vin: v.vin }), text: 'Ouvrir' })])]);
    var zoneEval = h('div.doux.petit', 'Chargement…');
    blocEval.appendChild(zoneEval);
    AMX.get('evalVin=' + encodeURIComponent(v.vin), { essais: 1 }).then(function (d) {
      if (!zoneEval.isConnected) return;
      AMX.vider(zoneEval); zoneEval.className = '';
      if (!d || !d.trouve) {
        zoneEval.appendChild(h('div.actions-ligne', [h('span.doux.petit', { style: { alignSelf: 'center' }, text: 'Pas encore évalué.' }), h('a.btn.petit', { href: AMX.lien('outils', 'evaluation', { vin: v.vin }), html: I.outils + '<span>Évaluer ce véhicule</span>' })]));
        return;
      }
      var e = d.donnees || {}, m = (e.marche && typeof e.marche === 'object') ? e.marche : null;
      var argent = function (x) { var n = parseFloat(String(x === undefined || x === null ? '' : x).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? null : n; };
      var paye = argent(e.prixPaye) || argent(e.prixAchat), recon = argent(e.recon), vente = argent(e.prixVente), standard = m ? argent(m.standard) : null, marge = argent(e.marge);
      var qui = String(e._enregistrePar || e._par || '').split('@')[0], quand = d.dateMaj || e._le || '';
      var veh = [e.annee, e.marque, e.modele, e.version].filter(Boolean).join(' '), kmEval = parseInt(String(e.km || '').replace(/[^0-9]/g, ''), 10);
      if (veh || kmEval) zoneEval.appendChild(h('div', { style: { marginBottom: '6px', fontSize: '12.5px' }, text: [veh, kmEval ? AMX.fmtNombre(kmEval) + ' km' : ''].filter(Boolean).join(' · ') }));
      zoneEval.appendChild(h('div.actions-ligne', [
        paye !== null ? h('span.puce', { text: 'payé ' + AMX.fmtArgent(paye, 0) }) : null,
        recon !== null ? h('span.puce', { text: 'recon ' + AMX.fmtArgent(recon, 0) }) : null,
        vente !== null ? h('span.puce.ok', { text: 'détail ' + AMX.fmtArgent(vente, 0) }) : null,
        standard !== null ? h('span.puce.info', { text: 'marché ' + AMX.fmtArgent(standard, 0) + (m && m.actifs && m.actifs.n ? ' · ' + m.actifs.n + ' annonces' : ''), title: 'Prix standard de l\'analyse de marché' }) : null,
        marge !== null ? h('span.puce' + (marge < 0 ? '.alerte' : ''), { text: 'marge ' + AMX.fmtArgent(marge, 0) }) : null,
        e.etat ? h('span.puce', { text: 'état : ' + e.etat }) : null, e.pneus ? h('span.puce', { text: 'pneus : ' + e.pneus }) : null, e.pareBrise ? h('span.puce', { text: 'pare-brise : ' + e.pareBrise }) : null, e.accident ? h('span.puce.alerte', { text: 'accident : ' + e.accident }) : null
      ]));
      var note = e.notes || e.note;
      if (note) zoneEval.appendChild(h('div.doux.petit', { style: { marginTop: '6px' }, text: String(note).slice(0, 240) }));
      zoneEval.appendChild(h('div.doux.petit', { style: { marginTop: '6px' }, text: 'Évaluée' + (quand ? ' le ' + AMX.fmtDate(quand, true) : '') + (qui ? ' par ' + qui : '') + (e.concession ? ' · ' + (AMX.CONCESSIONS_TOUTES && AMX.CONCESSIONS_TOUTES[e.concession] ? AMX.CONCESSIONS_TOUTES[e.concession] : e.concession) : '') }));
    }).catch(function (err) { if (!zoneEval.isConnected) return; zoneEval.textContent = 'Évaluation indisponible : ' + AMX.erreurTexte(err); });

    // Photos
    var blocPhotos = h('div.bloc', [h('h3', ['Photos', h('a.btn.petit', { href: 'scan.html', target: '_blank', rel: 'noopener', html: I.photo + '<span>Ajouter (scan)</span>' })])]);
    var zonePhotos = h('div.chargement', [h('span.spin'), 'Chargement des photos…']);
    blocPhotos.appendChild(zonePhotos);
    photosDe(v.vin).then(function (p) {
      AMX.vider(zonePhotos); zonePhotos.className = '';
      if (!p.length) { zonePhotos.appendChild(h('div.doux.petit', 'Aucune photo pour ce véhicule.')); return; }
      var grille = h('div.vignettes');
      p.forEach(function (ph, i) { var img = h('img', { src: AMX.vignetteDrive(ph.url, 300), alt: ph.angle || '', title: ph.angle || '', loading: 'lazy' }); img.addEventListener('click', function () { AMX.galerie(p.map(function (x) { return { url: AMX.vignetteDrive(x.url, 1600), angle: x.angle }; }), i); }); grille.appendChild(img); });
      zonePhotos.appendChild(grille);
    });

    // Rapport CARFAX : le lien public du compte concessionnaire, par VIN.
    var lienCfx = AMX.carfax.lien(v.vin);
    var champCfx = h('input.saisie', { type: 'url', placeholder: 'Coller le lien du rapport (vhr.carfax.ca/?id=…)', value: lienCfx });
    var sauverCfx = function (val) {
      var l = val.trim();
      if (l && !AMX.carfax.valide(l)) { AMX.toast('Ce n\'est pas un lien de rapport CARFAX Canada (attendu : vhr.carfax.ca/?id=…).', 'erreur'); champCfx.focus(); return; }
      champCfx.disabled = true;
      AMX.carfax.enregistrer([{ vin: v.vin, lien: l }]).then(function () { AMX.toast(l ? 'Rapport CARFAX enregistré' : 'Lien CARFAX retiré', 'ok'); self.rendrePanneau(); }).catch(function (e) { champCfx.disabled = false; AMX.toast(AMX.erreurTexte(e), 'erreur'); });
    };
    champCfx.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); sauverCfx(champCfx.value); } });
    champCfx.addEventListener('paste', function () { setTimeout(function () { if (AMX.carfax.valide(champCfx.value)) sauverCfx(champCfx.value); }, 30); });
    // Rapports et liens : CARFAX, fiche d'achat, window sticker, mise en vente — un seul bloc, une
    // rangée de boutons (7 oct. : le CARFAX était en double et prenait trop de place). Le lien
    // CARFAX se gère derrière « lien… » (coller / remplacer / retirer).
    var zoneCfx = h('div.cfx-saisie.cache', { style: { marginTop: '10px' } }, [
      h('div.champ', [h('label', lienCfx ? 'Remplacer le lien du rapport' : 'Coller le lien du rapport'), h('div', { style: { display: 'flex', gap: '6px' } }, [champCfx, h('button.btn.petit', { text: 'Enregistrer', onclick: function () { sauverCfx(champCfx.value); } })]),
        h('div.aide', 'Compte CARFAX › Mes rapports › Mes RHV : ouvrez le rapport et copiez l\'adresse de la page (vhr.carfax.ca/?id=…). Le lien sort aussi sur la page publique du véhicule.')]),
      lienCfx ? h('div.actions-ligne', { style: { marginTop: '6px' } }, [
        h('button.btn.petit', { html: I.copier + '<span>Copier le lien</span>', onclick: function () { AMX.copier(lienCfx, 'Lien du rapport copié'); } }),
        h('button.btn.petit.fantome', { text: 'Retirer le lien', onclick: function () { AMX.confirmer('Retirer le lien CARFAX', 'Le bouton « Rapport CARFAX » disparaîtra de la page de l\'acheteur pour ce véhicule.').then(function (ok) { if (ok) sauverCfx(''); }); } })
      ]) : null
    ]);
    var sticker = stickerUrl(v);
    // v130 (rapport « Refonte ergonomique », gain rapide 12) : les gestes principaux en haut du panneau, juste sous
    // l'en-tête — avant, « Déclarer la vente » était dans l'avant-dernier bloc.
    var blocActions = h('div.bloc.inv-actions', [h('h3', 'Actions'),
      h('div.actions-ligne', [
        // 21 oct. : déclarer la vente (ventes.js) — le script remplit le Livre des ventes (détail ou wholesale selon le registre).
        (AMX.ventes && AMX.ventes.peutDeclarer() && ['comptabilise'].indexOf(v.statut) < 0) ? h('button.btn.primaire.inv-vendre', { type: 'button', title: 'Déclarer la vente de ce véhicule — ScanAutomax écrit la ligne dans le Livre des ventes', html: I.vente + '<span>Déclarer la vente</span>', onclick: function () { AMX.ventes.declarer({ compagnie: v.compagnie, type: cfg.feuille === 'DETAIL' ? 'usage' : 'wholesale', vin: v.vin, stock: v.stock, modeleTexte: v.modele, coutant: v.cout, source: 'Inventaire › Usagé › ' + cfg.titre, resterIci: true }); } }) : null,
        // 14 oct. (Maxime) : « un véhicule disponible à la vente doit pouvoir être envoyé à un acheteur inscrit, par texto et par courriel ».
        (AMX.offres && AMX.offres.envoyerAcheteurs && (AMX.perm('changerStatut') || AMX.perm('voirResultats')) && ['arrive', 'comptabilise'].indexOf(v.statut) < 0) ? h('button.btn', { type: 'button', title: 'Envoyer la page publique de ce véhicule à des acheteurs inscrits, par courriel et par texto (publié dans la vitrine si besoin)', html: I.courriel + '<span>Envoyer à un acheteur</span>', onclick: function () { AMX.offres.envoyerAcheteurs(v.vin, { concession: AMX.COMPAGNIE_CONCESSION[String(v.compagnie || '').toUpperCase()] || '' }); } }) : null,
        // 26 oct. (Louis Prassinos) : changer le prix de détail — courriel aux vendeurs, puis inscrit sur le site par le favori D2C.
        (cfg.feuille === 'DETAIL' && AMX.prixDetail && AMX.prixDetail.peut() && ['achete', 'transitqc', 'stock'].indexOf(v.statut) >= 0) ? h('button.btn', { type: 'button', title: 'Changer le prix de détail affiché sur le site de la concession', html: (I.argent || I.offres || '') + '<span>Modifier le prix</span>', onclick: function () {
          var m = AMX.occMarche && AMX.occMarche.enCache && AMX.occMarche.enCache(), mv = m && (m.vehicules || []).filter(function (x) { return String(x.vin || '').toUpperCase() === String(v.vin || '').toUpperCase(); })[0];
          AMX.prixDetail.charger().then(function () { AMX.prixDetail.modifier({ vin: v.vin, stock: v.stock, nom: v.modele, compagnie: v.compagnie, prix: mv && mv.notre ? mv.notre.prix : null }); }, function () { AMX.prixDetail.modifier({ vin: v.vin, stock: v.stock, nom: v.modele, compagnie: v.compagnie }); });
        } }) : null,
        AMX.sections.offres ? h('a.btn', { href: AMX.lien('offres', 'vente', { vin: v.vin }), html: I.offres + '<span>Mettre en vente</span>' }) : null,
        h('a.btn', { href: AMX.lien('achat', '', { vin: v.vin }), html: I.achat + '<span>' + (v.ficheExiste ? 'Fiche d\'achat' : 'Créer la fiche d\'achat') + '</span>' })
      ])
    ]);
    if (!blocActions.querySelector('.actions-ligne').children.length) blocActions = null;
    // 23 oct. : transport de l'achat par Central Fleet (transport.js) — état, prix, dates, documents, ou le bouton de demande.
    var blocTransport = null;
    if (AMX.transport && (['arrive', 'comptabilise'].indexOf(v.statut) < 0 || AMX.transport.parVin(v.vin).length)) {
      var zoneTr = h('div'), mots = String(v.modele || '').trim().split(/\s+/), anTr = /^\d{4}$/.test(mots[mots.length - 1] || '') ? mots.pop() : '';
      // 26 oct. : le release (payé, release reçu, où cueillir) — ses données partent avec la demande Central Fleet.
      var zoneRel = h('div.inv-release'), ctxTr = { compagnie: v.compagnie, stock: v.stock, annee: anTr, marque: mots.shift() || '', modele: mots.join(' ') };
      if (AMX.release && ['achete', 'transitqc'].indexOf(v.statut) >= 0) {
        var dessinerRel = function (r) {
          AMX.vider(zoneRel); ctxTr.releaseLu = r || {};
          if (r && r.inutile) { zoneRel.appendChild(h('p.doux.petit', { text: 'Déjà chez nous : pas de release ni de transport.' })); return; }
          var etat = r && r.recu ? 'pret' : (r && r.paye ? 'attente' : 'apayer');
          zoneRel.appendChild(h('div.actions-ligne', { style: { alignItems: 'center', marginBottom: '8px' } }, [AMX.release.badge(etat),
            h('span.doux.petit', { text: [r && r.recu ? 'reçu le ' + AMX.fmtDateCourte(r.recu) : '', r && r.no ? '# ' + r.no : '', r && (r.lieu || r.ville) ? [r.lieu, r.ville].filter(Boolean).join(', ') : ''].filter(Boolean).join(' · ') }),
            h('button.btn.petit', { type: 'button', text: 'Release…', onclick: function () { AMX.release.modale(v.vin, { titre: v.modele, onEnregistre: dessinerRel }); } })]));
        };
        zoneRel.appendChild(h('p.doux.petit', { text: 'Lecture du release…' }));
        AMX.release.vin(v.vin).then(function (d) { dessinerRel(d.release); }, function () { AMX.vider(zoneRel); });
        ctxTr.prefill = function () {
          var r = ctxTr.releaseLu; if (!r) return {};
          return { depart: { adresse: r.adresse, ville: r.ville, province: r.province }, consignes: AMX.release.consignes(r), release: { recu: r.recu, paye: r.paye, no: r.no } };
        };
      }
      blocTransport = h('div.bloc.inv-transport', [h('h3', 'Transport (Central Fleet)'), zoneRel, zoneTr]);
      AMX.transport.bloc(v.vin, zoneTr, ctxTr);
    }
    var blocLiens = h('div.bloc', [h('h3', ['Rapports', h('button.btn.petit.fantome', { type: 'button', text: lienCfx ? 'lien CARFAX…' : 'coller un lien CARFAX…', onclick: function () { zoneCfx.classList.toggle('cache'); if (!zoneCfx.classList.contains('cache')) { champCfx.focus(); champCfx.select(); } } })]),
      h('div.actions-ligne', [
        lienCfx ? h('a.btn.primaire', { href: lienCfx, target: '_blank', rel: 'noopener', html: I.externe + '<span>Rapport CARFAX</span>' })
          : h('a.btn', { href: 'https://dealer.carfax.ca/', target: '_blank', rel: 'noopener', title: 'Ouvre votre compte CARFAX (le VIN est copié) — ou Outils › Import CARFAX pour tout le compte', html: I.externe + '<span>Commander un CARFAX</span>', onclick: function () { AMX.copier(v.vin, 'VIN copié — collez-le dans « Commander les rapports »'); } }),
        sticker ? h('a.btn', { href: sticker, target: '_blank', rel: 'noopener', html: I.externe + '<span>Window sticker</span>' }) : null
      ]),
      zoneCfx
    ]);

    // Transfert + suppression
    var selTransfert = h('select.saisie', { style: { flex: '1 1 170px', minWidth: '170px' } }, [h('option', { value: '', text: 'Transférer vers…' })].concat(cfg.transferts.map(function (t) { return h('option', { value: t, text: AMX.inventaire.nomFeuille(t) }); })));
    selTransfert.addEventListener('change', function () {
      var cible = selTransfert.value; if (!cible) return; selTransfert.value = '';
      AMX.confirmer('Transférer le véhicule', v.vin + ' sera retiré du registre ' + cfg.titre + ' et ajouté au registre ' + AMX.inventaire.nomFeuille(cible) + ' avec le statut « Acheté ».').then(function (ok) {
        if (!ok) return;
        self.ecrire({ action: 'transfer', id: v.id, toSheet: cible }, 'Transféré vers ' + AMX.inventaire.nomFeuille(cible)).then(function () { AMX.inventaire.lire(cible, true).catch(function () {}); self.selectionner(''); });
      });
    });
    var blocGestion = h('div.bloc', [h('h3', 'Gestion'), h('div.actions-ligne', [
      (peutStock || peutMontants) && !verrouille ? h('button.btn', { html: I.outils + '<span>Modifier (stock, km, coût)…</span>', onclick: modifierInfos }) : null,
      peutStatut && !verrouille ? selTransfert : null,
      peutSupprimer ? h('button.btn.danger', { html: I.corbeille + '<span>Supprimer</span>', onclick: function () {
        AMX.confirmerSaisie('Supprimer définitivement', 'Suppression de ' + v.vin + (v.stock ? ' (stock ' + v.stock + ')' : '') + '. Cette action est irréversible, et la relecture du DMS ou de D2C ne le rajoutera pas (sauf sous un nouveau # stock). Retapez le VIN complet pour confirmer.', v.vin, { ok: 'Supprimer', danger: true }).then(function (ok) {
          if (ok) self.ecrire({ action: 'delete', id: v.id }, 'Véhicule supprimé').then(function () { self.selectionner(''); });
        });
      } }) : null
    ])]);

    var carte = h('div.carte', [
      h('div.panneau-entete', [
        h('div', { style: { minWidth: 0 } }, [
          h('h2', { text: v.modele || '(modèle à préciser)' }),
          // Pas de NIV ici (il est dans la ligne, 8 oct., soir — Maxime) : # stock, km (de la fiche d'achat), compagnie.
          h('div.sous', [v.stock ? h('span.puce.mono', { text: v.stock }) : null, puceKm, h('span.puce', { text: v.compagnie || '—' })])
        ]),
        h('button.fermer', { title: 'Fermer', html: I.fermer, onclick: fermer })
      ]),
      AMX.achatsAuto ? AMX.achatsAuto.bloc(v.vin) : null, blocActions, blocStatut, (cfg.feuille === 'DETAIL' && AMX.service && !verrouille && v.statut !== 'arrive') ? AMX.service.bloc(v) : null, blocTransport, blocEval, blocFicheEblock, blocManheim, blocEblock, blocMarche, blocOpenlane, blocRappel, blocPhotos, blocLiens, blocGestion
    ]);
    this.elPanneau.appendChild(carte);
  };

  Registre.prototype.avancer = function (v, suivant) {
    var self = this, cfg = this.cfg;
    if (suivant === 'transit' && cfg.importateur) {
      // Comme la mise à jour en lot : l'expédition É.-U. demande l'importateur.
      var sel = h('select.saisie', [h('option', { value: '', text: 'Choisir…' }), h('option', { value: 'DENT', text: 'DENT' }), h('option', { value: 'Direct', text: 'Direct' })]);
      if (v.importateur) sel.value = v.importateur;
      AMX.modale({ titre: 'Marquer expédié', corps: h('div', [h('p', { style: { margin: '0 0 12px', color: 'var(--encre-2)' }, text: v.modele + ' · ' + v.vin }), h('div.champ', [h('label', 'Importateur'), sel])]),
        boutons: [{ texte: 'Annuler' }, { texte: 'Marquer expédié', classe: 'primaire', action: function () {
          if (!sel.value) { sel.style.borderColor = 'var(--rouge)'; return false; }
          return self.ecrire({ action: 'updateStatusByVinBulk', vins: [v.vin], newStatut: 'transit', importateur: sel.value }, 'Marqué expédié (' + sel.value + ')');
        } }] });
      return;
    }
    this.ecrire({ action: 'advance', id: v.id, newStatut: suivant }, AMX.statut(suivant, cfg.feuille).libelle, { optimiste: { champs: { statut: suivant, maj: new Date().toISOString() } } }).catch(function () {});
  };

  Registre.prototype.reverifierRappel = function (v) {
    var self = this;
    decoderVins([v.vin]).then(function (dec) {
      var info = dec[v.vin];
      if (info) delete cacheRappels[(info.make + '|' + info.model + '|' + info.year).toUpperCase()];
      return resultatRappel(info);
    }).then(function (r) {
      return self.ecrire({ action: 'updateRecallResults', results: [{ vin: v.vin, rappel: r.rappel, rappelDetail: r.rappelDetail }] }, r.rappel === 'oui' ? 'Rappel ouvert trouvé' : (r.rappel === 'non' ? 'Aucun rappel ouvert' : 'NHTSA injoignable'));
    }).catch(function () {});
  };

  /* ------------------------------ Export ------------------------------- */
  Registre.prototype.exporter = function () {
    var liste = this.listeCourante || [];
    if (!liste.length) { AMX.toast('Aucune ligne à exporter avec les filtres actuels.', 'attention'); return; }
    if (typeof XLSX === 'undefined') { AMX.toast('La bibliothèque Excel n\'est pas encore chargée. Réessayez.', 'erreur'); return; }
    var cfg = this.cfg;
    var rows = liste.map(function (v) {
      var r = { 'Stock #': v.stock || '', 'VIN': v.vin, 'Modèle': v.modele, 'Compagnie': v.compagnie || '', 'Origine': v.origine || '', 'Statut': AMX.statut(v.statut, cfg.feuille).libelle,
        'Jours depuis achat': AMX.joursDepuis(v.dateAjout), 'Rappel': v.rappel === 'oui' ? 'Rappel ouvert' : v.rappel === 'non' ? 'Aucun rappel' : 'Non vérifié' };
      if (cfg.importateur) r['Importateur'] = v.importateur || '';
      r['Registre reçu'] = REGISTRE[registreDe(v)].libelle;
      r['Coût'] = v.cout ? Number(AMX.montant(v.cout)) : '';
      r['Dernière mise à jour'] = AMX.fmtDate(v.maj, true);
      return r;
    });
    var ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 10 }, { wch: 19 }, { wch: 26 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 10 }, { wch: 16 }];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventaire ' + cfg.titre.replace(/[^A-Za-z]/g, '') || 'Inventaire');
    XLSX.writeFile(wb, 'inventaire-' + this.onglet + '-' + new Date().toISOString().slice(0, 10) + '.xlsx');
  };

  /* ---------------------------- Actions en lot -------------------------- */
  Registre.prototype.modaleLot = function (ongletInitial) {
    var self = this, cfg = this.cfg;
    var onglets = [['ajout', 'Ajouter des véhicules'], ['statut', 'Changer le statut'], ['registre', 'Registre reçu'], ['verif', 'Vérification physique']];
    var corps = h('div');
    var barre = h('div.onglets');
    var zone = h('div');
    var actif = ongletInitial || 'ajout';
    var lignesVin = function (t) { return String(t || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean); };
    var compteur = function (ta, fmt) { var c = h('div.doux.petit', { style: { marginTop: '6px', minHeight: '16px' } }); var maj = function () { var n = lignesVin(ta.value).length; c.textContent = n ? fmt(n) : ''; }; ta.addEventListener('input', maj); return c; };
    var dessiner = function () {
      AMX.vider(barre); AMX.vider(zone);
      onglets.forEach(function (o) { barre.appendChild(h('button' + (actif === o[0] ? '.actif' : ''), { type: 'button', text: o[1], onclick: function () { actif = o[0]; dessiner(); } })); });
      if (actif === 'ajout') {
        var ta = h('textarea.saisie', { rows: '7', placeholder: 'Un VIN par ligne.\nFacultatif : VIN, Modèle  (ex. 1GCUDEEL7RZ262077, CHEVROLET Silverado 2024)\nSans modèle, il est décodé automatiquement (NHTSA), avec vérification des rappels.' });
        var selC = h('select.saisie', AMX.optionsCompagnies('Compagnie…'));
        var selO = h('select.saisie', [h('option', { value: 'Achat', text: 'Achat' }), h('option', { value: 'Échange', text: 'Échange' })]);
        var c = compteur(ta, function (n) { return n + ' véhicule' + (n > 1 ? 's' : '') + ' prêt' + (n > 1 ? 's' : '') + ' à ajouter'; });
        var etat = h('div.doux.petit', { style: { marginTop: '8px' } });
        var btn = h('button.btn.primaire', { html: I.plus + '<span>Ajouter au registre ' + esc(cfg.titre) + '</span>' });
        btn.addEventListener('click', function () {
          var lignes = lignesVin(ta.value).map(function (l) { var p = l.split(','); return { vin: (p[0] || '').trim().toUpperCase(), modele: p.slice(1).join(',').trim() }; }).filter(function (x) { return x.vin; });
          if (!lignes.length) return;
          if (!selC.value) { AMX.toast('Choisissez une compagnie (' + Object.keys(AMX.COMPAGNIES).join(', ') + ').', 'attention'); selC.focus(); return; }
          var vus = {}, internes = 0, existants = [];
          var presents = {}; self.vehicules.forEach(function (v) { presents[String(v.vin).toUpperCase()] = true; });
          lignes = lignes.filter(function (x) { if (vus[x.vin]) { internes++; return false; } vus[x.vin] = true; if (presents[x.vin]) { existants.push(x.vin); return false; } return true; });
          if (internes || existants.length) AMX.toast((internes ? internes + ' doublon(s) dans la liste ignoré(s). ' : '') + (existants.length ? existants.length + ' VIN déjà au registre : ' + existants.join(', ') : ''), 'attention', 7000);
          if (!lignes.length) return;
          btn.classList.add('occupe'); etat.textContent = 'Décodage de ' + lignes.length + ' VIN (NHTSA)…';
          decoderVins(lignes.map(function (x) { return x.vin; })).then(function (dec) {
            etat.textContent = 'Vérification des rappels…';
            var lot = new Array(lignes.length), i = 0;
            var suivant = function () {
              if (i >= lignes.length) return Promise.resolve();
              var tranche = lignes.slice(i, i + 8), base = i; i += 8;
              return Promise.all(tranche.map(function (x, j) {
                var info = dec[x.vin];
                var modeleAuto = info && info.make ? [info.make, info.model, info.year].filter(Boolean).join(' ') : '';
                return resultatRappel(info).then(function (r) { lot[base + j] = { vin: x.vin, modele: x.modele || modeleAuto || '(modèle non reconnu — à préciser)', origine: selO.value, compagnie: selC.value, rappel: r.rappel, rappelDetail: r.rappelDetail }; });
              })).then(suivant);
            };
            return suivant().then(function () {
              etat.textContent = 'Enregistrement…';
              return self.ecrire({ action: 'addBulk', vehicules: lot }, lot.length + ' véhicule' + (lot.length > 1 ? 's' : '') + ' ajouté' + (lot.length > 1 ? 's' : ''));
            });
          }).then(function () { m.fermer(); }, function () { btn.classList.remove('occupe'); etat.textContent = ''; });
        });
        zone.appendChild(h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, [ta, c, h('div.grille.c2', [h('div.champ', [h('label', 'Compagnie'), selC]), h('div.champ', [h('label', 'Origine'), selO])]), h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, [btn, etat])]));
      } else if (actif === 'statut') {
        var ta2 = h('textarea.saisie', { rows: '7', placeholder: 'Un VIN par ligne' });
        var selS = h('select.saisie', cfg.statuts.map(function (s) { return h('option', { value: s, text: AMX.statut(s, cfg.feuille).libelle, selected: s === 'stock' }); }));
        var selImp = h('select.saisie', [h('option', { value: '', text: 'Importateur…' }), h('option', { value: 'DENT', text: 'DENT' }), h('option', { value: 'Direct', text: 'Direct' })]);
        var champImp = h('div.champ', { style: { display: 'none' } }, [h('label', 'Importateur (requis pour « Expédié »)'), selImp]);
        selS.addEventListener('change', function () { champImp.style.display = (cfg.importateur && selS.value === 'transit') ? '' : 'none'; });
        var c2 = compteur(ta2, function (n) { return n + ' VIN à mettre à jour'; });
        var btn2 = h('button.btn.primaire', { text: 'Appliquer le statut' });
        btn2.addEventListener('click', function () {
          var vins = lignesVin(ta2.value).map(function (x) { return x.toUpperCase(); }); if (!vins.length) return;
          var imp = '';
          if (cfg.importateur && selS.value === 'transit') { imp = selImp.value; if (!imp) { AMX.toast('Choisissez l\'importateur (DENT ou Direct).', 'attention'); return; } }
          btn2.classList.add('occupe');
          self.ecrire({ action: 'updateStatusByVinBulk', vins: vins, newStatut: selS.value, importateur: imp }).then(function (d) {
            if (d.notFound && d.notFound.length) AMX.toast(d.notFound.length + ' VIN introuvable(s) : ' + d.notFound.join(', '), 'attention', 8000); else AMX.toast(vins.length + ' véhicule(s) mis à jour', 'ok');
            m.fermer();
          }, function () { btn2.classList.remove('occupe'); });
        });
        zone.appendChild(h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, [ta2, c2, h('div.grille.c2', [h('div.champ', [h('label', 'Nouveau statut'), selS]), champImp]), h('div', [btn2])]));
      } else if (actif === 'registre') {
        var ta3 = h('textarea.saisie', { rows: '7', placeholder: 'Un VIN par ligne' });
        var selR = h('select.saisie', [h('option', { value: 'oui-bon', text: 'Reçu · bon nom' }), h('option', { value: 'oui-mauvais', text: 'Reçu · mauvais nom' }), h('option', { value: 'non', text: 'Non reçu' })]);
        var c3 = compteur(ta3, function (n) { return n + ' VIN à mettre à jour'; });
        var btn3 = h('button.btn.primaire', { text: 'Appliquer' });
        btn3.addEventListener('click', function () {
          var vins = lignesVin(ta3.value).map(function (x) { return x.toUpperCase(); }); if (!vins.length) return;
          btn3.classList.add('occupe');
          self.ecrire({ action: 'updateDocByVinBulk', vins: vins, value: selR.value }).then(function (d) {
            if (d.notFound && d.notFound.length) AMX.toast(d.notFound.length + ' VIN introuvable(s) : ' + d.notFound.join(', '), 'attention', 8000); else AMX.toast(vins.length + ' véhicule(s) mis à jour', 'ok');
            m.fermer();
          }, function () { btn3.classList.remove('occupe'); });
        });
        zone.appendChild(h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, [ta3, c3, h('div.champ', [h('label', 'Registre d\'immatriculation'), selR]), h('div', [btn3])]));
      } else {
        var ta4 = h('textarea.saisie', { rows: '7', placeholder: 'Collez les VIN relevés physiquement sur le terrain, un par ligne' });
        var res = h('div', { style: { marginTop: '12px' } });
        var btn4 = h('button.btn.primaire', { text: 'Comparer au registre' });
        btn4.addEventListener('click', function () {
          var phys = lignesVin(ta4.value).map(function (x) { return x.toUpperCase(); });
          AMX.vider(res); if (!phys.length) return;
          var sys = {}; self.vehicules.forEach(function (v) { sys[String(v.vin).toUpperCase()] = v; });
          var manquants = self.vehicules.filter(function (v) { return phys.indexOf(String(v.vin).toUpperCase()) < 0; });
          var inconnus = phys.filter(function (x) { return !sys[x]; });
          res.appendChild(h('div.section-titre', { style: { color: 'var(--rouge)' }, text: 'Au registre mais absents de votre liste (' + manquants.length + ')' }));
          res.appendChild(manquants.length ? h('div.mono.petit', { style: { lineHeight: '1.9', background: 'var(--rouge-bg)', padding: '8px 10px', borderRadius: '7px', marginBottom: '12px' } }, manquants.map(function (v) { return h('div', [v.vin, h('span', { style: { fontFamily: 'var(--police)', color: 'var(--encre-3)' }, text: ' — ' + v.modele + ' (' + AMX.statut(v.statut, cfg.feuille).libelle + ')' })]); })) : h('div.doux.petit', { style: { marginBottom: '12px' }, text: 'Aucun — tout le registre a été retrouvé.' }));
          res.appendChild(h('div.section-titre', { style: { color: 'var(--ambre)' }, text: 'Dans votre liste mais absents du registre (' + inconnus.length + ')' }));
          res.appendChild(inconnus.length ? h('div.mono.petit', { style: { lineHeight: '1.9', background: 'var(--ambre-bg)', padding: '8px 10px', borderRadius: '7px' } }, inconnus.map(function (x) { return h('div', { text: x }); })) : h('div.doux.petit', 'Aucun — tous vos véhicules sont au registre.'));
        });
        zone.appendChild(h('div', [ta4, h('div', { style: { marginTop: '10px' } }, [btn4]), res]));
      }
    };
    corps.appendChild(barre); corps.appendChild(zone);
    dessiner();
    var m = AMX.modale({ titre: 'Actions en lot — registre ' + cfg.titre, corps: corps, large: true, sansPied: true });
  };
})();
