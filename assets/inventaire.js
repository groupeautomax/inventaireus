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
  AMX.section('inventaire', {
    titre: 'Inventaire', icone: 'inventaire', ordre: 10,
    onglets: Object.keys(FEUILLES).map(function (id) {
      return { id: id, titre: FEUILLES[id].titre, compteur: function () {
        var l = AMX.inventaire.enCache(FEUILLES[id].feuille);
        return l ? l.filter(function (v) { return v.statut !== 'arrive' && v.statut !== 'comptabilise'; }).length : '';
      } };
    }),
    monter: function (conteneur, ctx) { return new Registre(conteneur, ctx); }
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
    this.minuterie = setInterval(function () { self.rafraichir(); }, 60000);
    this.surVisible = function () { if (!document.hidden) self.rafraichir(); };
    document.addEventListener('visibilitychange', this.surVisible);
    window.addEventListener('focus', this.surVisible);
  }

  Registre.prototype.filtresDefaut = function () {
    return { recherche: '', compagnie: '', statuts: null /* null = actifs */, origine: '', rappel: '', importateur: '', registre: '', alerte: '' };
  };

  Registre.prototype.demonter = function () {
    clearInterval(this.minuterie);
    document.removeEventListener('visibilitychange', this.surVisible);
    document.removeEventListener('amx:carfax', this.surCarfax);
    window.removeEventListener('focus', this.surVisible);
    if (this.observateur) this.observateur.disconnect();
  };

  Registre.prototype.naviguer = function (ctx) {
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
      this.elKpis, this.elAgencement
    ]);
    this.conteneur.appendChild(page);
    this.construireRail();
  };

  Registre.prototype.construireRail = function () {
    var self = this, f = this.filtres, cfg = this.cfg;
    AMX.vider(this.elRail);
    var rech = h('div.recherche', [h('span', { html: I.recherche }), h('input.saisie', { type: 'search', placeholder: 'VIN, modèle, # stock', value: f.recherche, oninput: AMX.debounce(function (e) { f.recherche = e.target.value; f.alerte = ''; self.rendre(); }, 120) })]);
    // Compagnie
    var seg = h('div.segment.bloc');
    [['', 'Toutes']].concat(Object.keys(AMX.COMPAGNIES).map(function (c) { return [c, c]; })).forEach(function (c) {
      seg.appendChild(h('button' + (f.compagnie === c[0] ? '.actif' : ''), { type: 'button', text: c[1], onclick: function () { f.compagnie = c[0]; self.construireRail(); self.rendre(); } }));
    });
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
    this.elRail.appendChild(h('div.groupe', [h('h3', 'Recherche'), rech, h('div', { style: { height: '10px' } }), h('div.etiquette', { style: { marginBottom: '6px' }, text: 'Compagnie' }), seg]));
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
    this.charger(true);
  };

  // Une écriture : jamais rejouée, liste rafraîchie ensuite.
  Registre.prototype.ecrire = function (payload, message) {
    var self = this;
    payload = Object.assign({}, payload, { sheet: this.cfg.feuille });
    this.ecritures++; this.generation++;
    var etat = document.getElementById('inv-etat'); if (etat) etat.textContent = 'Enregistrement…';
    var redessiner = function () {
      self.vehicules = AMX.inventaire.enCache(self.cfg.feuille) || self.vehicules;
      self.construireRail(); self.rendre(); AMX.rafraichirSousBarre();
      if (etat) etat.textContent = self.vehicules.length + ' véhicules · synchronisé à ' + new Date().toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });
    };
    var relire = function () { return AMX.inventaire.lire(self.cfg.feuille, true).catch(function () {}); };
    return AMX.post(payload).then(function (d) {
      self.ecritures--;
      if (d.refuse || d.ok === false) {
        var motif = d.erreur || d.message || (d.code ? 'action refusée (' + d.code + ')' : 'action refusée');
        AMX.toast('Non enregistré — ' + motif, 'erreur');
        redessiner();
        throw new Error(motif);
      }
      var p = Array.isArray(d.vehicules) ? (AMX.inventaire.remplacer(self.cfg.feuille, d.vehicules), Promise.resolve()) : relire();
      if (d.doublonsIgnores && d.doublonsIgnores.length) AMX.toast(d.doublonsIgnores.length + ' VIN déjà présent(s) ignoré(s) : ' + d.doublonsIgnores.join(', '), 'attention', 7000);
      else if (d.doublonIgnore) AMX.toast('VIN déjà présent, non ajouté : ' + d.doublonIgnore, 'attention');
      else if (message) AMX.toast(message, 'ok');
      return p.then(function () { redessiner(); return d; });
    }, function (e) {
      self.ecritures--;
      // Google a mal répondu : le script a souvent fait le travail quand même. On relit.
      AMX.toast('Réponse du serveur incertaine — vérification dans le registre… (' + AMX.erreurTexte(e) + ')', 'attention', 6000);
      return relire().then(function () { redessiner(); throw e; });
    });
  };

  /* ------------------------------ Filtrage ----------------------------- */
  Registre.prototype.base = function () {
    var f = this.filtres;
    return this.vehicules.filter(function (v) { return !f.compagnie || v.compagnie === f.compagnie; });
  };
  Registre.prototype.filtrer = function () {
    var f = this.filtres, cfg = this.cfg;
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
      var k = h('button.kpi' + (opts.classe ? '.' + opts.classe : '') + (opts.actif ? '.actif' : ''), { type: 'button' }, [
        h('div.valeur', { text: valeur }), h('div.libelle', { text: libelle }), opts.sous ? h('div.sous', { text: opts.sous }) : null,
        opts.couleur ? h('span.pastille', { style: { background: 'var(--' + opts.couleur + ')' } }) : null
      ]);
      if (opts.onclick) k.addEventListener('click', opts.onclick);
      return k;
    };
    var tousActifs = f.statuts === null && !f.alerte;
    this.elKpis.appendChild(kpi(base.length, 'Total', { classe: 'neutre', sous: f.compagnie ? AMX.COMPAGNIES[f.compagnie] : 'Toutes compagnies', actif: f.statuts && f.statuts.length === cfg.statuts.length && !f.alerte, onclick: function () { f.statuts = cfg.statuts.slice(); f.alerte = ''; self.construireRail(); self.rendre(); } }));
    cfg.statuts.forEach(function (s) {
      var st = AMX.statut(s, cfg.feuille);
      var n = base.filter(function (v) { return v.statut === s; }).length;
      var actif = !f.alerte && f.statuts && f.statuts.length === 1 && f.statuts[0] === s;
      self.elKpis.appendChild(kpi(n, st.libelle, { couleur: st.couleur, actif: actif, onclick: function () {
        f.alerte = '';
        f.statuts = actif ? null : [s];
        self.construireRail(); self.rendre();
      } }));
    });
    var retard = base.filter(enRetardRegistre).length, retardAchat = base.filter(enRetardAchat).length;
    if (retard) this.elKpis.appendChild(kpi(retard, 'Registre 10 j+', { classe: 'alerte', sous: 'non reçu', actif: f.alerte === 'retard', onclick: function () { f.alerte = f.alerte === 'retard' ? '' : 'retard'; self.rendre(); } }));
    if (retardAchat) this.elKpis.appendChild(kpi(retardAchat, 'Achat 7 j+', { classe: 'attention', sous: 'pas encore en stock', actif: f.alerte === 'retardAchat', onclick: function () { f.alerte = f.alerte === 'retardAchat' ? '' : 'retardAchat'; self.rendre(); } }));
    void tousActifs;
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
    if (f.compagnie) puces.push([AMX.COMPAGNIES[f.compagnie] || f.compagnie, function () { f.compagnie = ''; }]);
    if (f.recherche) puces.push(['« ' + f.recherche + ' »', function () { f.recherche = ''; }]);
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
    var st = AMX.statut(v.statut, cfg.feuille);
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
      cfg.importateur && v.importateur ? h('span.puce', { text: v.importateur }) : null
    ];
    var el = h(cls, { dataset: { id: v.id } }, [
      vignette,
      h('div', { style: { minWidth: 0 } }, [
        h('div.titre', { text: v.modele || '(modèle à préciser)' }),
        h('div.sous', [h('span.vin', { text: v.vin }), v.stock ? h('span.puce.mono', { text: v.stock }) : null, h('span.puce', { text: v.compagnie || '—' }), v.origine === 'Échange' ? h('span.puce', { text: 'Échange' }) : null])
      ]),
      h('div.cell.statut', [h('span.l', 'Statut'), h('span', [h('span.badge.' + st.couleur, { text: st.libelle })]),
        v.statut === 'transit' ? h('span.jours.attention', { text: 'Expédié depuis ' + AMX.joursDepuis(v.maj) + ' j' }) : (retardA ? h('span.jours.attention', { text: 'Acheté depuis ' + jours + ' j' }) : h('span.jours', { text: 'Acheté il y a ' + jours + ' j' }))]),
      h('div.cell.maj', [h('span.l', 'Mise à jour'), h('span.v', { text: AMX.fmtDate(v.maj, true) })]),
      h('div.cell.indic', [h('span.l', 'Suivi'), h('div.indicateurs', indicateurs)]),
      h('div.montant', [h('span.l', 'Coût'), h('span', { text: v.cout ? AMX.fmtArgent(v.cout) : '—' })]),
      h('button.plus', { type: 'button', title: 'Ouvrir', html: I.chevron })
    ]);
    el.addEventListener('click', function () { self.selectionner(v.vin); });
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
        AMX.confirmer('Corriger le statut', 'Passer ' + v.vin + ' de « ' + st.libelle + ' » à « ' + AMX.statut(ns, cfg.feuille).libelle + ' » ?').then(function (ok) { if (ok) self.ecrire({ action: 'setStatus', id: v.id, newStatut: ns }, 'Statut corrigé'); });
      });
      actions.appendChild(sel);
      blocStatut.appendChild(actions);
    }

    // Registre reçu
    var reg = registreDe(v);
    var segReg = h('div.segment.bloc');
    [['non', 'Non reçu'], ['oui-bon', 'Reçu · bon nom'], ['oui-mauvais', 'Mauvais nom']].forEach(function (o) {
      segReg.appendChild(h('button' + (reg === o[0] ? '.actif' : ''), { type: 'button', text: o[1], disabled: verrouille || !peutStatut, onclick: function () { if (reg !== o[0]) self.ecrire({ action: 'setDoc', id: v.id, value: o[0] }, 'Registre mis à jour'); } }));
    });
    var blocRegistre = h('div.bloc', [h('h3', ['Registre d\'immatriculation', enRetardRegistre(v) ? h('span.puce.alerte', { text: AMX.joursDepuis(v.dateAjout) + ' j sans registre' }) : null]), segReg]);

    // Informations éditables
    var champ = function (libelle, valeur, opts) {
      opts = opts || {};
      var inp = h('input.saisie', { type: opts.type || 'text', value: valeur || '', placeholder: opts.placeholder || '—', disabled: opts.disabled, step: opts.step });
      if (opts.mono) inp.classList.add('mono');
      var bouton = opts.action ? h('button.btn.petit', { text: opts.texteBouton || 'Enregistrer', style: { visibility: 'hidden' } }) : null;
      inp.addEventListener('input', function () { if (bouton) bouton.style.visibility = (inp.value.trim() !== String(valeur || '').trim()) ? 'visible' : 'hidden'; });
      var sauver = function () { if (!opts.action) return; var val = inp.value.trim(); if (val === String(valeur || '').trim()) return; opts.action(val, inp); };
      if (bouton) bouton.addEventListener('click', sauver);
      if (!opts.explicite) inp.addEventListener('change', sauver);
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); sauver(); } });
      return h('div.champ', [h('label', { text: libelle }), bouton ? h('div', { style: { display: 'flex', gap: '6px' } }, [inp, bouton]) : inp]);
    };
    var selCompagnie = h('select.saisie', { disabled: verrouille || !peutMontants }, AMX.optionsCompagnies('—'));
    selCompagnie.value = AMX.COMPAGNIES[v.compagnie] ? v.compagnie : '';
    selCompagnie.addEventListener('change', function () { self.ecrire({ action: 'setCompagnie', id: v.id, value: selCompagnie.value }, 'Compagnie enregistrée'); });
    var blocInfos = h('div.bloc', [h('h3', 'Informations'),
      h('div.grille.c2', [
        champ('# Stock', v.stock, { mono: true, disabled: verrouille || !peutMontants, action: function (val) { self.ecrire({ action: 'setStock', id: v.id, value: val }, '# stock enregistré'); } }),
        champ('Coût', v.cout, { type: 'number', step: '0.01', disabled: verrouille || !peutMontants, action: function (val) { self.ecrire({ action: 'setCost', id: v.id, value: val }, 'Coût enregistré'); } }),
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
    var blocEblock = null;
    if (v.ficheExiste && AMX.ficheDe) {
      blocEblock = h('div.bloc.cache', [h('h3', ['Rapport d\'état eBlock'])]);
      AMX.ficheDe(v.vin).then(function (f) {
        if (!f || !blocEblock.isConnected) return;
        var lien = AMX.eblockValide(f['f-eblock']), dommages = AMX.listeDommages(f['f-dommages']);
        if (!lien && !dommages.length) return;
        blocEblock.classList.remove('cache');
        if (dommages.length) {
          blocEblock.appendChild(h('div', [
            h('span.badge.rouge', { text: dommages.length + ' dommage' + (dommages.length > 1 ? 's' : '') + ' répertorié' + (dommages.length > 1 ? 's' : '') }),
            h('ul.dommages-liste', dommages.map(function (d) { return h('li', { text: d }); }))
          ]));
        }
        if (lien) blocEblock.appendChild(h('div', { style: { marginTop: '8px' } }, [h('a.btn.petit', { href: lien, target: '_blank', rel: 'noopener', html: I.externe + '<span>Ouvrir sur eBlock</span>' })]));
      }).catch(function () {});
    }

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
    var blocCarfax = h('div.bloc', [h('h3', ['Rapport CARFAX', lienCfx ? h('span.puce.ok', { text: 'disponible' }) : h('a.btn.petit', { href: AMX.lien('outils', 'carfax'), text: 'Importer depuis mon compte' })]),
      lienCfx ? h('div.actions-ligne', [
        h('a.btn.primaire', { href: lienCfx, target: '_blank', rel: 'noopener', html: I.externe + '<span>Voir le rapport</span>' }),
        h('button.btn', { html: I.copier + '<span>Copier le lien</span>', onclick: function () { AMX.copier(lienCfx, 'Lien du rapport copié'); } }),
        h('button.btn.fantome', { text: 'Remplacer', onclick: function () { blocCarfax.querySelector('.cfx-saisie').classList.remove('cache'); champCfx.focus(); champCfx.select(); } }),
        h('button.btn.fantome', { text: 'Retirer', onclick: function () { AMX.confirmer('Retirer le lien CARFAX', 'Le bouton « Rapport CARFAX » disparaîtra de la page de l\'acheteur pour ce véhicule.').then(function (ok) { if (ok) sauverCfx(''); }); } })
      ]) : null,
      h('div.cfx-saisie' + (lienCfx ? '.cache' : ''), { style: { marginTop: lienCfx ? '10px' : '0' } }, [
        h('div.champ', [h('label', 'Lien du rapport'), h('div', { style: { display: 'flex', gap: '6px' } }, [champCfx, h('button.btn.petit', { text: 'Enregistrer', onclick: function () { sauverCfx(champCfx.value); } })]),
          h('div.aide', 'Dans votre compte CARFAX (Mes rapports › Mes RHV), ouvrez le rapport et copiez l\'adresse de la page. Le lien s\'affiche ensuite sur la page publique du véhicule.')])
      ])
    ]);

    // Liens
    var sticker = stickerUrl(v);
    var blocLiens = h('div.bloc', [h('h3', 'Liens'), h('div.actions-ligne', [
      h('a.btn', { href: AMX.lien('achat', '', { vin: v.vin }), html: I.achat + '<span>' + (v.ficheExiste ? 'Fiche d\'achat' : 'Créer la fiche d\'achat') + '</span>' }),
      sticker ? h('a.btn', { href: sticker, target: '_blank', rel: 'noopener', html: I.externe + '<span>Window sticker</span>' }) : null,
      lienCfx ? null : h('a.btn', { href: 'https://dealer.carfax.ca/', target: '_blank', rel: 'noopener', title: 'Ouvre votre compte CARFAX (le VIN est copié)', html: I.externe + '<span>Commander un CARFAX</span>', onclick: function () { AMX.copier(v.vin, 'VIN copié — collez-le dans « Commander les rapports »'); } }),
      AMX.sections.offres ? h('a.btn', { href: AMX.lien('offres', 'vente', { vin: v.vin }), html: I.offres + '<span>Mettre en vente</span>' }) : null
    ])]);

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
      blocStatut, (cfg.feuille === 'DETAIL' && AMX.service && !verrouille && v.statut !== 'arrive') ? AMX.service.bloc(v) : null, blocRegistre, blocInfos, blocRappel, blocEblock, blocPhotos, blocCarfax, blocLiens, blocGestion
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
    this.ecrire({ action: 'advance', id: v.id, newStatut: suivant }, AMX.statut(suivant, cfg.feuille).libelle);
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
