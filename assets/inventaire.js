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
  AMX.photosDe = photosDe;   // partagé avec Offres & clients

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

  AMX.section('inventaire', {
    titre: 'Inventaire', icone: 'inventaire', ordre: 10,
    onglets: Object.keys(FEUILLES).map(function (id) {
      return { id: id, titre: FEUILLES[id].titre, compteur: function () {
        var l = AMX.inventaire.enCache(FEUILLES[id].feuille);
        return l ? l.filter(function (v) { return v.statut !== 'arrive' && v.statut !== 'comptabilise'; }).length : '';
      } };
    }).concat([
      // Neufs (7 oct.) : suivi des véhicules neufs du DMS, par concession (assets/neufs.js, chargé après ce fichier).
      { id: 'neufs', titre: 'Neufs', compteur: function () { return AMX.neufs ? AMX.neufs.compteur() : ''; } }
    ]),
    monter: function (conteneur, ctx) { return (ctx.onglet === 'neufs' && AMX.neufs) ? AMX.neufs.monter(conteneur, ctx) : new Registre(conteneur, ctx); }
  });

  function Registre(conteneur, ctx) {
    var self = this;
    this.conteneur = conteneur;
    this.cfg = FEUILLES[ctx.onglet] || FEUILLES.us;
    this.onglet = ctx.onglet;
    this.vehicules = [];
    this.selection = ctx.params.vin || '';
    this.ecritures = 0; this.generation = 0;
    this.filtres = this.filtresDefaut();
    this.tri = AMX.memo.lire('inv_tri', 'maj');
    this.observateur = null;

    this.construire();
    this.charger();
    AMX.carfax.charger().then(function () { self.rendre(); }).catch(function () {});
    this.surCarfax = function () { self.rendre(); };
    document.addEventListener('amx:carfax', this.surCarfax);
    // Achats eBlock (puce « eBlock · n dommages » sur les lignes) : même cache que la page Fiches eBlock.
    if (AMX.eblock) { AMX.eblock.charger().then(function () { if (!self.detruit) self.rendre(); }).catch(function () {}); document.addEventListener('amx:eblock', this.surCarfax); }
    if (AMX.demandes) { AMX.demandes.charger().then(function () { if (!self.detruit) self.rendre(); }).catch(function () {}); document.addEventListener('amx:demandes', this.surCarfax); }
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
    clearInterval(this.minuterie);
    document.removeEventListener('visibilitychange', this.surVisible);
    document.removeEventListener('amx:carfax', this.surCarfax);
    document.removeEventListener('amx:eblock', this.surCarfax);
    window.removeEventListener('focus', this.surVisible);
    if (this.observateur) this.observateur.disconnect();
  };

  Registre.prototype.naviguer = function (ctx) {
    // Onglet Neufs (7 oct.) : une autre vue (assets/neufs.js) remplace le registre dans la même section.
    if (ctx.onglet === 'neufs' && AMX.neufs) {
      this.demonter(); AMX.vider(this.conteneur);
      AMX.courante.instance = AMX.neufs.monter(this.conteneur, ctx);
      return;
    }
    if (ctx.onglet !== this.onglet) {
      this.onglet = ctx.onglet; this.cfg = FEUILLES[ctx.onglet] || FEUILLES.us;
      this.filtres = this.filtresDefaut(); this.selection = ctx.params.vin || '';
      this.vehicules = AMX.inventaire.enCache(this.cfg.feuille) || [];
      this.construire(); this.charger();
    } else if (ctx.params.vin && ctx.params.vin !== this.selection) {
      this.selection = ctx.params.vin; this.filtres.recherche = ''; this.rendre();
    }
  };

  /* --------------------------- Construction ---------------------------- */
  Registre.prototype.construire = function () {
    var self = this;
    AMX.vider(this.conteneur);
    this.elKpis = h('div.kpis');
    this.elValeur = h('div.valeur-registres');
    this.elRail = h('aside.rail');
    this.elListe = h('div');
    this.elPanneau = h('aside.panneau');
    this.elOutils = h('div.outils-liste');
    this.elAgencement = h('div.agencement', [this.elRail, h('div.colonne-liste', [this.elOutils, this.elListe]), this.elPanneau]);
    var page = h('div.page', [
      h('div.entete-page', [
        h('div', [h('h1', { text: 'Inventaire ' + this.cfg.titre }), h('p#inv-etat', { text: 'Chargement…' })]),
        h('div.actions', [
          h('button.btn.fantome.icone#inv-filtres-btn', { title: 'Filtres', html: I.filtre, onclick: function () { self.elRail.classList.toggle('ouvert'); } }),
          h('button.btn', { html: I.rafraichir + '<span>Rafraîchir</span>', onclick: function () { self.charger(true); } }),
          h('button.btn', { html: I.telecharger + '<span>Exporter Excel</span>', onclick: function () { self.exporter(); } }),
          h('button.btn', { html: I.scan + '<span>Actions en lot</span>', onclick: function () { self.modaleLot('ajout'); } }),
          AMX.perm('ajouterVehicule') ? h('button.btn.primaire', { html: I.plus + '<span>Ajouter</span>', onclick: function () { self.modaleLot('ajout'); } }) : null
        ])
      ]),
      this.elKpis, this.elValeur, this.elAgencement
    ]);
    this.conteneur.appendChild(page);
    this.construireRail();
    // Les permissions (portée, compagnies visibles) arrivent souvent après le premier rendu : on refait le rail.
    // Profil (portée) arrivé après le montage : on revalide la concession choisie (un vieux choix hors portée est ignoré).
    this.surProfil = function () { if (!self.detruit) { self.filtres.compagnie = AMX.compagnieChoisie('inventaire'); self.construireRail(); self.rendre(); } };
    document.addEventListener('amx:profil', this.surProfil);
  };

  Registre.prototype.construireRail = function () {
    var self = this, f = this.filtres, cfg = this.cfg;
    AMX.vider(this.elRail);
    var rech = h('div.recherche', [h('span', { html: I.recherche }), h('input.saisie', { type: 'search', placeholder: 'VIN, modèle, # stock — tous statuts, tous registres', value: f.recherche, oninput: AMX.debounce(function (e) { f.recherche = e.target.value; f.alerte = ''; self.rendre(); }, 120) })]);
    // Concession : liste verticale (les 5 toujours visibles), compte des véhicules actifs du
    // registre par concession, choix gardé pour tout le site (AMX.choisirCompagnie).
    var actifsCie = cfg.statuts.filter(function (s) { return s !== 'arrive' && s !== 'comptabilise'; }), vehicules = this.vehicules;
    var choix = AMX.choixCompagnie({ domaine: 'inventaire', valeur: f.compagnie,
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
    this.elRail.appendChild(h('div.groupe', [h('h3', 'Recherche'), this.elBandeau, rech, choix ? h('div', { style: { height: '10px' } }) : null, choix ? h('div.etiquette', { style: { marginBottom: '6px' }, text: 'Concession' }) : null, choix]));
    this.elRail.appendChild(grpStatut);
    this.elRail.appendChild(grpAutres);
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
    return tout.filter(function (v) {
      if (f.compagnie && v.compagnie !== f.compagnie) return false;
      return String(v.vin).toLowerCase().indexOf(t) >= 0 || String(v.modele || '').toLowerCase().indexOf(t) >= 0 || String(v.stock || '').toLowerCase().indexOf(t) >= 0;
    });
  };
  Registre.prototype.filtrer = function () {
    var f = this.filtres, cfg = this.cfg;
    if (f.recherche && f.recherche.trim()) return trier(this.rechercherPartout(f.recherche.trim().toLowerCase()), this.tri);
    var actifs = cfg.statuts.filter(function (s) { return s !== 'arrive' && s !== 'comptabilise'; });
    var statuts = f.statuts || actifs;
    var l = this.base().filter(function (v) {
      if (f.alerte === 'retard') return enRetardRegistre(v);
      if (f.alerte === 'retardAchat') return enRetardAchat(v);
      return statuts.indexOf(v.statut) >= 0 || (statuts.length === cfg.statuts.length);
    });
    if (f.origine) l = l.filter(function (v) { return v.origine === f.origine; });
    if (f.rappel === 'oui') l = l.filter(function (v) { return v.rappel === 'oui'; });
    else if (f.rappel === 'non') l = l.filter(function (v) { return v.rappel === 'non'; });
    else if (f.rappel === 'inconnu') l = l.filter(function (v) { return !v.rappel; });
    if (f.importateur) l = l.filter(function (v) { return v.importateur === f.importateur; });
    if (f.registre) l = l.filter(function (v) { return registreDe(v) === f.registre; });
    if (f.recherche) {
      var t = f.recherche.trim().toLowerCase();
      l = l.filter(function (v) { return String(v.vin).toLowerCase().indexOf(t) >= 0 || String(v.modele || '').toLowerCase().indexOf(t) >= 0 || String(v.stock || '').toLowerCase().indexOf(t) >= 0; });
    }
    return trier(l, this.tri);
  };

  /* -------------------------------- Rendu ------------------------------ */
  Registre.prototype.rendre = function () {
    if (this.elBandeau && this.elBandeau.parentNode) { var nb = AMX.bandeauPortee('inventaire', this.filtres.compagnie, !!this.filtres.recherche); this.elBandeau.parentNode.replaceChild(nb, this.elBandeau); this.elBandeau = nb; }
    this.rendreKpis();
    var liste = this.filtrer();
    this.listeCourante = liste;
    this.rendreOutils(liste);
    this.rendreListe(liste);
    this.rendrePanneau();
  };

  Registre.prototype.rendreKpis = function () {
    var self = this, base = this.base(), f = this.filtres, cfg = this.cfg;
    AMX.vider(this.elKpis);
    var kpi = function (valeur, libelle, opts) {
      opts = opts || {};
      var k = h('button.kpi' + (opts.classe ? '.' + opts.classe : '') + (opts.actif ? '.actif' : ''), { type: 'button', title: opts.titre || '' }, [
        h('div.valeur', { text: valeur }), h('div.libelle', { text: libelle }), opts.sous ? h('div.sous', { text: opts.sous }) : null,
        opts.couleur ? h('span.pastille', { style: { background: 'var(--' + opts.couleur + ')' } }) : null
      ]);
      if (opts.onclick) k.addEventListener('click', opts.onclick);
      return k;
    };
    var tousActifs = f.statuts === null && !f.alerte;
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
    var retard = base.filter(enRetardRegistre).length, retardAchat = base.filter(enRetardAchat).length;
    if (retard) this.elKpis.appendChild(kpi(retard, 'Registre 10 j+', { classe: 'alerte', sous: 'non reçu', actif: f.alerte === 'retard', onclick: function () { f.alerte = f.alerte === 'retard' ? '' : 'retard'; self.rendre(); } }));
    if (retardAchat) this.elKpis.appendChild(kpi(retardAchat, 'Achat 7 j+', { classe: 'attention', sous: 'pas encore en stock', actif: f.alerte === 'retardAchat', onclick: function () { f.alerte = f.alerte === 'retardAchat' ? '' : 'retardAchat'; self.rendre(); } }));
    void tousActifs;
    this.rendreValeur();
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
      var el = h('button.reg' + (r.id === self.onglet ? '.courant' : ''), { type: 'button', title: r.charge ? r.n + ' véhicule(s) actif(s)' + (r.sans ? ', ' + r.sans + ' sans coût' : '') : 'Pas encore chargé', onclick: function () { if (r.id !== self.onglet) AMX.aller('inventaire', r.id); } }, [
        h('span.t', { text: r.titre }), h('span.v', { text: r.charge ? r.texte : '…' }), h('span.n', { text: r.charge ? r.n + ' véh.' : '' })
      ]);
      self.elValeur.appendChild(el);
    });
    this.elValeur.appendChild(h('span.total', [h('span.t', 'Total'), h('span.v', { text: AMX.fmtArgent(total, 0) }), h('span.n', { text: nTotal + ' véh.' + (charges.length < regs.length ? ' (partiel)' : '') })]));
  };

  Registre.prototype.rendreOutils = function (liste) {
    var self = this;
    AMX.vider(this.elOutils);
    var sel = h('select.saisie', { onchange: function (e) { self.tri = e.target.value; AMX.memo.ecrire('inv_tri', self.tri); self.rendre(); } });
    [['maj', 'Dernière mise à jour'], ['achat', 'Achat récent'], ['achatAsc', 'Achat ancien'], ['statut', 'Statut'], ['modele', 'Modèle'], ['stock', '# stock'], ['cout', 'Coût']].forEach(function (o) { sel.appendChild(h('option', { value: o[0], selected: self.tri === o[0], text: 'Tri : ' + o[1] })); });
    var f = this.filtres;
    var puces = [];
    if (f.alerte === 'retard') puces.push(['Registre non reçu 10 j+', function () { f.alerte = ''; }]);
    if (f.alerte === 'retardAchat') puces.push(['Pas en stock 7 j+', function () { f.alerte = ''; }]);
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
    var cls = 'div.ligne' + (retard ? '.retard' : (retardA ? '.retard-achat' : '')) + (v.statut === 'comptabilise' ? '.verrouille' : '') + (this.selection && String(v.vin).toUpperCase() === String(this.selection).toUpperCase() ? '.actif' : '');
    // Sans photo : le logo du constructeur (voir AMX.logoMarque) ; avec photos,
    // le logo tient lieu de repli jusqu'à ce que la miniature charge.
    var vignette = v.hasPhotos ? h('div.vignette', { dataset: { vin: v.vin }, title: 'Photos disponibles' }, [AMX.logoMarque(marque(v)), h('span.cam', { html: I.photo })]) : h('div.vignette', { title: 'Aucune photo' }, [AMX.logoMarque(marque(v))]);
    var indicateurs = [
      v.rappel === 'oui' ? h('span.puce.alerte', { text: 'Rappel', title: v.rappelDetail || 'Rappel ouvert' }) : (v.rappel === 'non' ? null : h('span.puce', { text: 'Rappel ?', title: 'Rappel non vérifié' })),
      h('span.puce' + (reg === 'oui-bon' ? '.ok' : (reg === 'oui-mauvais' ? '.attention' : (retard ? '.alerte' : ''))), { text: reg === 'non' ? (retard ? 'Registre · ' + jours + ' j' : 'Registre à recevoir') : regInfo.libelle }),
      v.ficheExiste ? h('span.puce' + (v.ficheStockRempli ? '.ok' : '.attention'), { text: v.ficheStockRempli ? 'Fiche ✓' : 'Fiche sans stock' }) : null,
      // Un clic sur la puce ouvre le rapport directement (comme sur eBlock), sans ouvrir la fiche.
      AMX.carfax.lien(v.vin) ? h('a.puce.info.lien-puce', { href: AMX.carfax.lien(v.vin), target: '_blank', rel: 'noopener', text: 'CARFAX', title: 'Voir le rapport CARFAX', onclick: function (e) { e.stopPropagation(); } }) : null,
      // Acheté sur eBlock : la fiche descriptive (dommages, cote) s'ouvre d'un clic, sans ouvrir le panneau.
      AMX.eblockPuce ? AMX.eblockPuce(v.vin) : null,
      // Demande de travaux au service (8 oct.) : orange = envoyée, verte = BT approuvé, rouge = retournée.
      (cfg.feuille === 'DETAIL' && AMX.demandePuce) ? AMX.demandePuce(v.vin) : null,
      cfg.importateur && v.importateur ? h('span.puce', { text: v.importateur }) : null
    ];
    var el = h(cls, { dataset: { id: v.id } }, [
      vignette,
      h('div', { style: { minWidth: 0 } }, [
        h('div.titre', { text: v.modele || '(modèle à préciser)' }),
        h('div.sous', [h('span.vin', { text: v.vin }), v.stock ? h('span.puce.mono', { text: v.stock }) : null, h('span.puce', { text: v.compagnie || '—' }), autreRegistre ? h('span.puce.registre-autre', { text: 'Registre ' + AMX.inventaire.nomFeuille(autreRegistre), title: 'Ce véhicule est dans un autre registre — cliquez pour l\'ouvrir là-bas.' }) : null, v.origine === 'Échange' ? h('span.puce', { text: 'Échange' }) : null])
      ]),
      h('div.cell.statut', [h('span.l', 'Statut'), h('span', [h('span.badge.' + st.couleur, { text: st.libelle })]),
        v.statut === 'transit' ? h('span.jours.attention', { text: 'Expédié depuis ' + AMX.joursDepuis(v.maj) + ' j' }) : (retardA ? h('span.jours.attention', { text: 'Acheté depuis ' + jours + ' j' }) : h('span.jours', { text: 'Acheté il y a ' + jours + ' j' }))]),
      h('div.cell.maj', [h('span.l', 'Mise à jour'), h('span.v', { text: AMX.fmtDate(v.maj, true) })]),
      h('div.cell.indic', [h('span.l', 'Suivi'), h('div.indicateurs', indicateurs)]),
      h('div.montant', [h('span.l', 'Coût'), h('span', { text: v.cout ? AMX.fmtArgent(v.cout) : '—' })]),
      h('button.plus', { type: 'button', title: 'Ouvrir', html: I.chevron })
    ]);
    el.addEventListener('click', function () { if (autreRegistre) AMX.aller('inventaire', autreRegistre.toLowerCase(), { vin: v.vin }); else self.selectionner(v.vin); });
    return el;
  };

  Registre.prototype.selectionner = function (vin) {
    this.selection = vin;
    var hsh = AMX.lien('inventaire', this.onglet, vin ? { vin: vin } : {});
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

    // Informations éditables
    var champ = function (libelle, valeur, opts) {
      opts = opts || {};
      var inp = h('input.saisie', { type: opts.type || 'text', value: valeur || '', placeholder: opts.placeholder || '—', disabled: opts.disabled, step: opts.step });
      if (opts.mono) inp.classList.add('mono');
      var bouton = opts.action ? h('button.btn.petit', { text: opts.texteBouton || 'Enregistrer', style: { visibility: 'hidden' } }) : null;
      inp.addEventListener('input', function () { if (bouton) bouton.style.visibility = (inp.value.trim() !== String(valeur || '').trim()) ? 'visible' : 'hidden'; });
      // Une fois envoyée, la valeur devient la référence : le « change » du blur qui suit un Entrée ne renvoie pas.
      var sauver = function () { if (!opts.action) return; var val = inp.value.trim(); if (val === String(valeur || '').trim()) return; if (opts.action(val, inp) === false) return; valeur = val; if (bouton) bouton.style.visibility = 'hidden'; };
      if (bouton) bouton.addEventListener('click', sauver);
      if (!opts.explicite) inp.addEventListener('change', sauver);
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); sauver(); } });
      return h('div.champ', [h('label', { text: libelle }), bouton ? h('div', { style: { display: 'flex', gap: '6px' } }, [inp, bouton]) : inp]);
    };
    var selCompagnie = h('select.saisie', { disabled: verrouille || !peutMontants }, AMX.optionsCompagnies('—'));
    selCompagnie.value = AMX.COMPAGNIES[v.compagnie] ? v.compagnie : '';
    selCompagnie.addEventListener('change', function () { self.ecrire({ action: 'setCompagnie', id: v.id, value: selCompagnie.value }, 'Compagnie enregistrée', { optimiste: { champs: { compagnie: selCompagnie.value } } }).catch(function () {}); });
    // Km obligatoire pour enregistrer un # stock (Maxime, 7 oct.) : le km vit dans la fiche d'achat (f-km) ;
    // le serveur refuse un # stock sans km (Stock.gs), le site l'envoie avec le # stock quand il vient d'être tapé.
    var peutStock = peutMontants || AMX.perm('ficheAchat');
    var kmConnu = null, kmSaisi = '';
    var champKm = champ('Km', '', { type: 'number', step: '1', placeholder: 'obligatoire', disabled: verrouille || !peutStock, action: function (val, inp) {
      var n = AMX.kmValide(val);
      if (!n) { AMX.toast('Kilométrage invalide : un nombre de km supérieur à zéro.', 'erreur'); inp.focus(); return false; }
      AMX.post({ action: 'setKm', vin: v.vin, value: n }).then(function (d) {
        AMX.verifier(d, 'Kilométrage refusé');
        kmConnu = d.km || n; AMX.ficheOublier(v.vin); AMX.toast('Kilométrage enregistré — ' + AMX.fmtNombre(kmConnu) + ' km', 'ok');
        champKm.classList.remove('manque');
      }).catch(function (e) { AMX.toast('Échec — ' + AMX.erreurTexte(e), 'erreur'); });
    } });
    champKm.classList.add('champ-km');
    var inpKm = champKm.querySelector('input');
    inpKm.addEventListener('input', function () { kmSaisi = inpKm.value; });
    AMX.ficheDe(v.vin).then(function (f) {
      if (self.selection !== v.vin) return;
      kmConnu = f ? AMX.kmValide(f['f-km']) : null;
      if (kmConnu) { inpKm.value = kmConnu; inpKm.placeholder = ''; champKm.classList.remove('manque'); }
      else if (v.stock) champKm.classList.add('manque');
    }).catch(function () {});
    var blocInfos = h('div.bloc', [h('h3', 'Informations'),
      h('div.grille.c2', [
        champ('# Stock', v.stock, { mono: true, disabled: verrouille || !peutStock, action: function (val, inp) {
          var kmTape = AMX.kmValide(kmSaisi || inpKm.value);
          if (val && !kmConnu && !kmTape) {
            AMX.toast('Le kilométrage est obligatoire pour enregistrer un # stock : entrez d\'abord le km.', 'erreur');
            champKm.classList.add('manque'); inpKm.focus(); return false;
          }
          var corps = { action: 'setStock', id: v.id, value: val };
          if (val && !kmConnu && kmTape) corps.km = kmTape;
          self.ecrire(corps, '# stock enregistré' + (corps.km ? ' avec le kilométrage' : ''), { optimiste: { champs: { stock: val } } }).then(function () { if (corps.km) { kmConnu = kmTape; AMX.ficheOublier(v.vin); } }).catch(function () {});
        } }),
        champKm,
        champ('Coût', v.cout, { type: 'number', step: '0.01', disabled: verrouille || !peutMontants, action: function (val) { self.ecrire({ action: 'setCost', id: v.id, value: val }, 'Coût enregistré', { optimiste: { champs: { cout: val } } }).catch(function () {}); } }),
        h('div.champ', [h('label', 'Compagnie'), selCompagnie]),
        h('div.champ', [h('label', 'Origine'), h('input.saisie', { value: v.origine || '—', disabled: true })]),
        cfg.importateur ? h('div.champ', [h('label', 'Importateur'), h('input.saisie', { value: v.importateur || '—', disabled: true })]) : null,
        h('div.champ', [h('label', 'Acheté le'), h('input.saisie', { value: AMX.fmtDate(v.dateAjout) + ' (' + AMX.joursDepuis(v.dateAjout) + ' j)', disabled: true })]),
        h('div.plein', [champ('VIN (correction)', v.vin, { mono: true, disabled: verrouille || !peutMontants, explicite: true, texteBouton: 'Corriger', action: function (val, inp) {
          if (!/^[A-HJ-NPR-Z0-9]{11,17}$/i.test(val)) { AMX.toast('VIN invalide (11 à 17 caractères, sans I, O ni Q).', 'erreur'); return; }
          AMX.confirmer('Corriger le VIN', 'Remplacer ' + v.vin + ' par ' + val.toUpperCase() + ' ? Cette action modifie le registre.').then(function (ok) { if (ok) self.ecrire({ action: 'setVin', id: v.id, value: val.toUpperCase() }, 'VIN corrigé').then(function () { self.selection = val.toUpperCase(); self.rendre(); }); else inp.value = v.vin; });
        } })])
      ])
    ]);

    // Rappels
    var blocRappel = h('div.bloc', [h('h3', ['Rappels NHTSA', h('button.btn.petit', { text: 'Revérifier', onclick: function (e) { e.target.classList.add('occupe'); e.target.textContent = 'Vérification…'; self.reverifierRappel(v); } })])]);
    if (v.rappel === 'oui') {
      var comps = String(v.rappelDetail || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      var uniques = comps.filter(function (c, i) { return comps.indexOf(c) === i; });
      blocRappel.appendChild(h('div', [h('span.badge.rouge', { text: uniques.length + ' rappel' + (uniques.length > 1 ? 's' : '') + ' ouvert' + (uniques.length > 1 ? 's' : '') }), h('ul', { style: { margin: '8px 0 0', paddingLeft: '18px', color: 'var(--encre-2)', fontSize: '12px', lineHeight: '1.5' } }, uniques.map(function (c) { return h('li', { text: c }); }))]));
    } else if (v.rappel === 'non') blocRappel.appendChild(h('span.badge.vert', { text: 'Aucun rappel ouvert' }));
    else blocRappel.appendChild(h('span.badge.gris', { text: 'Non vérifié' }));
    var rapUrl = RAPPELS_FABRICANT[marque(v)];
    if (rapUrl) blocRappel.appendChild(h('div', { style: { marginTop: '8px' } }, [h('a.btn.petit', { href: rapUrl, target: '_blank', rel: 'noopener', html: I.externe + '<span>Page des rappels ' + esc(marque(v)) + '</span>' })]));

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

    // Évaluation (Outils › Évaluation marché) : ce qu'on en sait, depuis la fiche d'inventaire (7 oct.).
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
    var blocLiens = h('div.bloc', [h('h3', ['Rapports et liens', h('button.btn.petit.fantome', { type: 'button', text: lienCfx ? 'lien CARFAX…' : 'coller un lien CARFAX…', onclick: function () { zoneCfx.classList.toggle('cache'); if (!zoneCfx.classList.contains('cache')) { champCfx.focus(); champCfx.select(); } } })]),
      h('div.actions-ligne', [
        lienCfx ? h('a.btn.primaire', { href: lienCfx, target: '_blank', rel: 'noopener', html: I.externe + '<span>Rapport CARFAX</span>' })
          : h('a.btn', { href: 'https://dealer.carfax.ca/', target: '_blank', rel: 'noopener', title: 'Ouvre votre compte CARFAX (le VIN est copié) — ou Outils › Import CARFAX pour tout le compte', html: I.externe + '<span>Commander un CARFAX</span>', onclick: function () { AMX.copier(v.vin, 'VIN copié — collez-le dans « Commander les rapports »'); } }),
        h('a.btn', { href: AMX.lien('achat', '', { vin: v.vin }), html: I.achat + '<span>' + (v.ficheExiste ? 'Fiche d\'achat' : 'Créer la fiche d\'achat') + '</span>' }),
        sticker ? h('a.btn', { href: sticker, target: '_blank', rel: 'noopener', html: I.externe + '<span>Window sticker</span>' }) : null,
        AMX.sections.offres ? h('a.btn', { href: AMX.lien('offres', 'vente', { vin: v.vin }), html: I.offres + '<span>Mettre en vente</span>' }) : null,
        // Vérifications gratuites qui complètent CARFAX (8 oct., soir) : le NIV est copié, on le colle sur le site.
        h('a.btn.fantome', { href: 'https://www.nicb.org/vincheck', target: '_blank', rel: 'noopener', title: 'NICB VINCheck : volé non retrouvé, salvage / inondation (assureurs américains) — le NIV est copié', html: I.externe + '<span>Vérifier NICB</span>', onclick: function () { AMX.copier(v.vin, 'NIV copié — collez-le dans VINCheck'); } }),
        h('a.btn.fantome', { href: 'https://www.iseecars.com/vin', target: '_blank', rel: 'noopener', title: 'iSeeCars : historique des annonces et des prix aux États-Unis — le NIV est copié', html: I.externe + '<span>Historique É.-U.</span>', onclick: function () { AMX.copier(v.vin, 'NIV copié — collez-le dans iSeeCars'); } })
      ]),
      zoneCfx
    ]);

    // Transfert + suppression
    var selTransfert = h('select.saisie', { style: { flex: 1 } }, [h('option', { value: '', text: 'Transférer vers…' })].concat(cfg.transferts.map(function (t) { return h('option', { value: t, text: AMX.inventaire.nomFeuille(t) }); })));
    selTransfert.addEventListener('change', function () {
      var cible = selTransfert.value; if (!cible) return; selTransfert.value = '';
      AMX.confirmer('Transférer le véhicule', v.vin + ' sera retiré du registre ' + cfg.titre + ' et ajouté au registre ' + AMX.inventaire.nomFeuille(cible) + ' avec le statut « Acheté ».').then(function (ok) {
        if (!ok) return;
        self.ecrire({ action: 'transfer', id: v.id, toSheet: cible }, 'Transféré vers ' + AMX.inventaire.nomFeuille(cible)).then(function () { AMX.inventaire.lire(cible, true).catch(function () {}); self.selectionner(''); });
      });
    });
    var blocGestion = h('div.bloc', [h('h3', 'Gestion'), h('div.actions-ligne', [
      peutStatut && !verrouille ? selTransfert : null,
      peutSupprimer ? h('button.btn.danger', { html: I.corbeille + '<span>Supprimer</span>', onclick: function () {
        AMX.confirmerSaisie('Supprimer définitivement', 'Suppression de ' + v.vin + (v.stock ? ' (stock ' + v.stock + ')' : '') + '. Cette action est irréversible. Retapez le VIN complet pour confirmer.', v.vin, { ok: 'Supprimer', danger: true }).then(function (ok) {
          if (ok) self.ecrire({ action: 'delete', id: v.id }, 'Véhicule supprimé').then(function () { self.selectionner(''); });
        });
      } }) : null
    ])]);

    var carte = h('div.carte', [
      h('div.panneau-entete', [
        h('div', { style: { minWidth: 0 } }, [
          h('h2', { text: v.modele || '(modèle à préciser)' }),
          h('div.sous', [h('span.mono', { text: v.vin }), h('button.btn.fantome.petit.icone', { title: 'Copier le VIN', html: I.copier, onclick: function () { AMX.copier(v.vin, 'VIN copié'); } }), v.stock ? h('span.puce.mono', { text: v.stock }) : null, h('span.puce', { text: v.compagnie || '—' })])
        ]),
        h('button.fermer', { title: 'Fermer', html: I.fermer, onclick: fermer })
      ]),
      blocStatut, (cfg.feuille === 'DETAIL' && AMX.service && !verrouille && v.statut !== 'arrive') ? AMX.service.bloc(v) : null, blocInfos, blocEval, blocFicheEblock, blocEblock, blocRappel, blocPhotos, blocLiens, blocGestion
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
