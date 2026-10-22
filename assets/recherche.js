/* Recherche partout (22 oct. 2026) — la boîte de la barre et la grande boîte de l'Accueil.
   Maxime : « la zone de recherche dans la page d'accueil doit tout rechercher ce qui se rapporte à l'item cherché,
   pas juste le CARFAX ; quand on choisit une compagnie pour chercher, ça doit être plus clair quelle compagnie on
   cherche ». Avant : l'inventaire usagé + les rapports CARFAX hors inventaire, sans tenir compte de la concession.

   On cherche un NIV (ou ses derniers caractères), un # stock, un modèle, un client ou un téléphone dans :
   l'usagé (3 registres), les neufs, les évaluations (client et suivi), le Livre des ventes, le Suivi service et les
   demandes de travaux, les offres reçues, les soumissions, l'archive Torque, et par NIV : eBlock, OpenLane, CARFAX.
   Chaque véhicule trouvé = une carte avec tout ce qui s'y rapporte (une puce par élément, qui ouvre la bonne page) ;
   ce qui n'a pas de NIV (vente wholesale, soumission bâtie) est listé à part. Chaque liste se charge une fois, en
   arrière-plan dès qu'on touche la boîte ; les résultats se complètent à mesure qu'elles arrivent.

   Concession : celle du site (AMX.compagnieChoisie), affichée en tête des résultats avec les pastilles pour en
   changer ; quand une concession est choisie, une ligne dit combien de résultats il y a ailleurs. Sur l'Accueil, la
   même rangée est sous la boîte (AMX.recherche.portee). */
(function () {
  'use strict';
  var AMX = window.AMX, h = AMX.h;
  var DUREE = 10 * 60000;
  var MAX_VEHICULES = 8, MAX_AUTRES = 6;

  /* ------------------------------ Outils ------------------------------ */
  function norm(s) { return String(s === undefined || s === null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase(); }
  function chiffres(s) { return String(s || '').replace(/\D/g, ''); }
  function vinDe(x) { var v = String(x || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase(); return v.length === 17 ? v : ''; }
  function visible(id) { var s = (AMX.sections && AMX.sections[id]) || (AMX.sources && AMX.sources[id]); return !!s && (!s.visible || s.visible()); }
  function nomCie(c) { return (AMX.COMPAGNIES_TOUTES && AMX.COMPAGNIES_TOUTES[c]) || c || ''; }
  function cieDeConcession(id) { return (AMX.CONCESSION_COMPAGNIE && AMX.CONCESSION_COMPAGNIE[String(id || '').toLowerCase()]) || ''; }
  function jour(d) { var t = AMX.fmtDate ? AMX.fmtDate(d) : String(d || '').slice(0, 10); return t || ''; }
  function etapeLibelle(id) { var l = (AMX.service && AMX.service.etapes ? AMX.service.etapes() : []).filter(function (e) { return e.id === id; })[0]; return l ? l.libelle : (id || ''); }
  function vehiculeTexte(o) { return [o.annee, o.marque, o.modele, o.version].filter(Boolean).join(' ').trim(); }

  /* ------------------------------ Les sources ------------------------------
     charger() → Promise<liste> ; cie(x) → code concession ; champs(x) → texte cherché ; tel(x) → téléphones ;
     vin(x) ; puce(x) → { t, c (couleur), href | action, titre } ; titre(x) / sous(x) pour les résultats sans NIV. */
  var SOURCES = [
    { id: 'usage', nom: 'Usagé', section: 'inventaire', charger: function () { return AMX.inventaire.tout(); },
      cie: function (v) { return v.compagnie; }, vin: function (v) { return v.vin; }, champs: function (v) { return [v.vin, v.stock, v.modele, v.compagnie].join(' '); },
      modele: function (v) { return v.modele; }, stock: function (v) { return v.stock; },
      actif: function (v) { return v.statut !== 'arrive' && v.statut !== 'comptabilise'; },
      puce: function (v) { var s = AMX.statut(v.statut, v._feuille); return { t: 'Usagé · ' + AMX.inventaire.nomFeuille(v._feuille) + ' · ' + s.libelle, c: s.couleur, href: AMX.lien('inventaire', String(v._feuille || '').toLowerCase(), { vin: v.vin }), principal: true }; } },
    { id: 'neuf', nom: 'Neufs', section: 'inventaire', charger: function () { return AMX.neufs ? AMX.neufs.charger().then(function () { var d = AMX.neufs.enCache(); return d ? d.vehicules : []; }) : Promise.resolve([]); },
      cie: function (v) { return v.compagnie; }, vin: function (v) { return v.vin; }, champs: function (v) { return [v.vin, v.stock, v.annee, v.marque, v.modele, v.version, v.couleur].join(' '); },
      modele: function (v) { return vehiculeTexte(v); }, stock: function (v) { return v.stock; }, actif: function (v) { return !v.sortiLe; },
      puce: function (v) { return { t: 'Neuf · ' + (v.sortiLe ? 'sorti' : (v.statutLibelle || 'en stock')) + (v.origine === 'constructeur' ? ' (manufacturier)' : ''), c: v.sortiLe ? 'gris' : 'bleu', href: AMX.lien('inventaire', 'neufs', { vin: v.vin }), principal: true }; } },
    { id: 'evaluation', nom: 'Évaluations', section: 'outils', charger: function () { return AMX.get({ evaluations: 1 }, { copie: 'evaluations', secours: false }).then(function (d) { return (d && d.evaluations) || []; }); },
      cie: function (e) { return cieDeConcession(e.concession); }, vin: function (e) { return e.vin; },
      champs: function (e) { var s = e.suivi || {}; return [e.vin, e.annee, e.marque, e.modele, e.version, s.client, s.courriel, s.conseiller, e.par].join(' '); }, tel: function (e) { return (e.suivi || {}).telephone; },
      modele: function (e) { return vehiculeTexte(e); },
      puce: function (e) { var s = e.suivi || {}; return { t: 'Évaluation ' + jour(e.dateMaj) + (s.client ? ' · ' + s.client : ''), c: 'violet', href: AMX.lien('outils', 'evaluation', { vin: e.vin }) }; } },
    { id: 'vente', nom: 'Livre des ventes', section: 'ventes', charger: function () { return AMX.ventes ? AMX.ventes.charger('', 'tout').then(function (d) { return d.ventes || []; }) : Promise.resolve([]); },
      cie: function (v) { return v.compagnie; }, vin: function (v) { return v.vin; },
      champs: function (v) { return [v.id, v.vin, v.stock, v.annee, v.marque, v.modele, v.client, v.courriel, v.conseiller, v.venduA, v.echangeVin, v.echangeStock].join(' '); }, tel: function (v) { return v.telephone; },
      modele: function (v) { return vehiculeTexte(v); }, stock: function (v) { return v.stock; },
      puce: function (v) { return { t: 'Vente ' + v.id + ' · ' + jour(v.dateLivraison || v.dateVente) + (v.client ? ' · ' + v.client : '') + (v.statut === 'annulee' ? ' (annulée)' : ''), c: v.statut === 'annulee' ? 'gris' : 'vert', href: AMX.lien('vente', 'ventes', { id: v.id }) }; },
      titre: function (v) { return vehiculeTexte(v) || 'Vente ' + v.id; }, sous: function (v) { return [v.id, v.stock ? '# ' + v.stock : '', v.client, jour(v.dateVente)].filter(Boolean).join(' · '); } },
    { id: 'service', nom: 'Suivi service', section: 'service', charger: function () { return AMX.service ? AMX.service.charger().then(function () { return AMX.service.enCache() || []; }) : Promise.resolve([]); },
      cie: function (s) { return s.compagnie; }, vin: function (s) { return s.vin; }, champs: function (s) { return [s.vin, s.stock, s.modele].join(' '); },
      modele: function (s) { return s.modele; }, stock: function (s) { return s.stock; },
      puce: function (s) { return { t: 'Service · ' + (s.statut === 'termine' ? 'terminé' : s.statut === 'refuse' ? 'refusé au détail' : (etapeLibelle(s.etapeCourante) || 'en cours')), c: 'sarcelle', href: AMX.lien('service', s.statut === 'termine' ? 'termines' : 'encours', { vin: s.vin }) }; } },
    { id: 'demande', nom: 'Demandes de travaux', section: 'service', charger: function () { return AMX.demandes ? AMX.demandes.charger().then(function () { return AMX.demandes.enCache() || []; }) : Promise.resolve([]); },
      cie: function (d) { return d.compagnie; }, vin: function (d) { return d.vin; }, champs: function (d) { return [d.vin, d.stock, d.vehicule, d.btNo].join(' '); },
      puce: function (d) { return { t: 'Demande de travaux · ' + ({ envoyee: 'envoyée', approuvee: 'BT ' + (d.btNo || 'approuvé'), retournee: 'retournée', annulee: 'annulée' }[d.etat] || d.etat || ''), c: 'ambre', href: AMX.lien('service', 'encours', { vin: d.vin }) }; } },
    { id: 'offre', nom: 'Offres reçues', section: 'offres', charger: function () { return AMX.post({ action: 'offresRecues' }).then(function (d) { return (d && d.offres) || []; }); },
      cie: function (o) { var v = AMX.inventaire.parVin ? AMX.inventaire.parVin(o.vin) : null; return o.compagnie || (v && v.compagnie) || ''; }, vin: function (o) { return o.vin; },
      champs: function (o) { return [o.id, o.vin, o.modele, o.nom, o.entreprise, o.courriel].join(' '); }, tel: function (o) { return o.telephone; }, modele: function (o) { return o.modele; },
      puce: function (o) { var st = (AMX.STATUTS_OFFRE || {})[o.statut] || { libelle: o.statut || 'offre', couleur: 'gris' }; return { t: 'Offre · ' + st.libelle + (o.nom || o.entreprise ? ' · ' + (o.entreprise || o.nom) : ''), c: st.couleur, href: AMX.lien('offres', 'recues', { o: o.id }) }; } },
    { id: 'soumission', nom: 'Soumissions', section: 'inventaire', charger: function () { return AMX.soumission ? AMX.soumission.charger().then(function () { return AMX.soumission.enCache() || []; }) : Promise.resolve([]); },
      cie: function (s) { return s.compagnie; }, vin: function (s) { return s.vin; }, champs: function (s) { return [s.id, s.titre, s.client, s.clientCourriel, s.vehicule, s.annee, s.marque, s.modele, s.style].join(' '); }, tel: function (s) { return s.clientTel; },
      modele: function (s) { return s.vehicule || vehiculeTexte(s); },
      puce: function (s) { return { t: 'Soumission ' + s.id + (s.client ? ' · ' + s.client : ''), c: 'prune', href: AMX.lien('inventaire', 'soumissions', { id: s.id }) }; },
      titre: function (s) { return s.titre || s.vehicule || vehiculeTexte(s) || s.id; }, sous: function (s) { return [s.id, s.client, s.statut].filter(Boolean).join(' · '); } },
    { id: 'torque', nom: 'Archive Torque', section: 'outils', lourd: true, charger: function () { return AMX.get({ torque: 1 }, { copie: 'torque', secours: false, delai: 60000 }).then(function (d) { return (d && d.evaluations) || []; }); },
      cie: function (r) { return cieDeConcession(r.concession); }, vin: function (r) { return r.vin; }, champs: function (r) { return [r.vin, r.annee, r.marque, r.modele, r.client, r.conseiller].join(' '); }, tel: function (r) { return r.telephone; },
      modele: function (r) { return vehiculeTexte(r); },
      puce: function (r) { return { t: 'Torque · ' + jour(r.creeLe) + (r.client ? ' · ' + r.client : ''), c: 'gris', href: AMX.lien('outils', 'torque', { vin: r.vin, id: r.id }) }; } }
  ];
  // Rattachés par NIV seulement (index déjà gardés par leur module) : rien à chercher dedans, tout à montrer.
  function extrasNiv(vin) {
    var out = [];
    if (AMX.eblockPuce && visible('outils')) { var e = AMX.eblockPuce(vin); if (e) out.push(e); }
    if (AMX.openlanePuce && visible('outils')) { var o = AMX.openlanePuce(vin); if (o) out.push(o); }
    var cf = AMX.carfax && AMX.carfax.lien ? AMX.carfax.lien(vin) : '';
    if (cf) out.push(h('a.puce.rech-puce.vert', { href: cf, target: '_blank', rel: 'noopener', title: 'Rapport CARFAX partagé', text: 'CARFAX' }));
    return out;
  }

  /* ------------------------------ Chargement ------------------------------ */
  var etat = {};   // id → { liste, quand, promesse, erreur }
  var foin = new WeakMap();   // objet → { t: texte normalisé, d: chiffres des téléphones } (sans toucher aux objets des modules)
  function charger(src, apres) {
    var e = etat[src.id] || (etat[src.id] = {});
    if (e.promesse) return e.promesse;
    if (e.liste && Date.now() - e.quand < DUREE) return Promise.resolve(e.liste);
    e.promesse = Promise.resolve().then(function () { return src.charger(); }).then(function (l) {
      e.liste = Array.isArray(l) ? l : []; e.quand = Date.now(); e.erreur = ''; e.promesse = null; if (apres) apres(); return e.liste;
    }, function (err) { e.promesse = null; e.erreur = AMX.erreurTexte(err); if (!e.liste) e.liste = []; e.quand = Date.now(); if (apres) apres(); return e.liste; });
    return e.promesse;
  }
  function sourcesActives() { return SOURCES.filter(function (s) { return visible(s.section); }); }
  function prechauffer(apres) {
    sourcesActives().forEach(function (s) { charger(s, apres); });
    if (AMX.carfax) AMX.carfax.charger().then(apres, function () {});
    if (AMX.eblock && visible('outils')) AMX.eblock.charger().then(apres, function () {});
    if (AMX.openlane && visible('outils')) AMX.openlane.charger().then(apres, function () {});
  }
  function botte(src, x) {
    var f = foin.get(x);
    if (!f) { f = { t: norm(src.champs(x)), d: chiffres(src.tel ? src.tel(x) : '') }; foin.set(x, f); }
    return f;
  }
  function correspond(src, x, mots) {
    var f = botte(src, x);
    return mots.every(function (m) { return f.t.indexOf(m) >= 0 || (/^\d{4,}$/.test(m) && f.d.indexOf(m) >= 0); });
  }

  /* ------------------------------ Résultats ------------------------------ */
  function resultats(q, cie) {
    var mots = norm(q).split(/\s+/).filter(Boolean);
    var parVin = {}, ordre = [], autres = [], ailleurs = 0, enLecture = [];
    var src2 = sourcesActives();
    // 1. Les NIV qui répondent à la recherche (dans n'importe quelle liste).
    src2.forEach(function (src) {
      var e = etat[src.id];
      if (!e || !e.liste) { enLecture.push(src.nom); return; }
      e.liste.forEach(function (x) {
        if (!correspond(src, x, mots)) return;
        var c = src.cie(x) || '', vin = vinDe(src.vin(x));
        if (cie && c && c !== cie) { ailleurs++; return; }
        if (!vin) { autres.push({ src: src, x: x }); return; }
        if (!parVin[vin]) { parVin[vin] = { vin: vin, cie: c, items: [], score: 0 }; ordre.push(vin); }
        if (!parVin[vin].cie) parVin[vin].cie = c;
      });
      if (e.promesse) enLecture.push(src.nom);
    });
    // 2. Tout ce qui se rapporte à ces NIV, même ce qui ne contenait pas le mot cherché.
    var trouves = {}; ordre.forEach(function (v) { trouves[v] = true; });
    src2.forEach(function (src) {
      var e = etat[src.id];
      if (!e || !e.liste) return;
      e.liste.forEach(function (x) {
        var vin = vinDe(src.vin(x));
        if (!vin || !trouves[vin]) return;
        var g = parVin[vin]; g.items.push({ src: src, x: x });
        if (!g.cie) g.cie = src.cie(x) || '';
      });
    });
    var qn = norm(q).replace(/\s+/g, '');
    var vehicules = ordre.map(function (vin) {
      var g = parVin[vin], s = 0;
      if (vin === qn) s += 200; else if (vin.slice(-qn.length) === qn && qn.length >= 6) s += 120;
      g.items.forEach(function (it) {
        if (it.src.stock && norm(it.src.stock(it.x)) === qn) s += 150;
        if (it.src.actif && it.src.actif(it.x)) s += 30;
      });
      g.score = s + g.items.length;
      return g;
    }).filter(function (g) { return !cie || !g.cie || g.cie === cie; });
    vehicules.sort(function (a, b) { return b.score - a.score; });
    return { vehicules: vehicules, autres: autres, ailleurs: ailleurs, enLecture: enLecture };
  }

  function puceDe(it) {
    var p = it.src.puce(it.x);
    var a = h('a.puce.rech-puce' + (p.c ? '.' + p.c : ''), { href: p.href || '#', title: p.titre || p.t, text: p.t });
    return a;
  }
  function carteVehicule(g, fermer) {
    var principal = null, titre = '', stock = '';
    g.items.forEach(function (it) {
      if (!titre && it.src.modele) titre = it.src.modele(it.x) || '';
      if (!stock && it.src.stock) stock = it.src.stock(it.x) || '';
      if (!principal) { var p = it.src.puce(it.x); if (p.principal) principal = p.href; }
    });
    if (!principal && g.items.length) principal = g.items[0].src.puce(g.items[0].x).href;
    // Une puce par élément ; l'usagé et les neufs d'abord, puis le reste dans l'ordre des sources.
    var rang = {}; SOURCES.forEach(function (s, i) { rang[s.id] = i; });
    var items = g.items.slice().sort(function (a, b) { return rang[a.src.id] - rang[b.src.id]; });
    var vus = {}, puces = [];
    items.forEach(function (it) {
      // Torque : une puce (la plus récente) + le nombre ; le reste une par élément.
      if (it.src.id === 'torque') { if (vus.torque) { vus.torque.n++; vus.torque.el.textContent = 'Torque · ' + vus.torque.n + ' évaluations'; return; } var el = puceDe(it); vus.torque = { n: 1, el: el }; puces.push(el); return; }
      puces.push(puceDe(it));
    });
    puces = puces.concat(extrasNiv(g.vin));
    var cie = g.cie;
    var carte = h('div.rech-vehicule', [
      h('a.rech-tete', { href: principal || '#' }, [
        h('div.rech-titre', { text: titre || 'Véhicule ' + g.vin }),
        h('div.rech-sous', [h('span.mono', { text: g.vin }), stock ? h('span.mono', { text: '# ' + stock }) : null, cie ? h('span.rech-cie.' + ((AMX.COULEUR_COMPAGNIE || {})[cie] || 'gris'), [h('i'), nomCie(cie)]) : null])
      ]),
      h('div.rech-liens', puces)
    ]);
    carte.addEventListener('click', function (e) { var a = e.target.closest('a, button'); if (a && (a.getAttribute('href') || '').charAt(0) === '#') setTimeout(fermer, 0); else if (a && a.tagName === 'BUTTON') setTimeout(fermer, 0); });
    return carte;
  }
  function ligneAutre(it, fermer) {
    var p = it.src.puce(it.x), c = it.src.cie(it.x);
    var a = h('a.rech-autre', { href: p.href || '#' }, [
      h('div', { style: { flex: 1, minWidth: 0 } }, [h('div.rech-titre', { text: it.src.titre ? it.src.titre(it.x) : p.t }), h('div.rech-sous', [h('span', { text: it.src.sous ? it.src.sous(it.x) : '' }), c ? h('span.rech-cie.' + ((AMX.COULEUR_COMPAGNIE || {})[c] || 'gris'), [h('i'), nomCie(c)]) : null])]),
      h('span.puce', { text: it.src.nom })
    ]);
    a.addEventListener('click', function () { setTimeout(fermer, 0); });
    return a;
  }

  /* ------------------------------ La portée (quelle concession) ------------------------------ */
  function portee(conteneur, opts) {
    opts = opts || {};
    if (!conteneur) return null;
    AMX.vider(conteneur);
    conteneur.classList.add('rech-portee');
    var codes = AMX.codesPour ? AMX.codesPour('inventaire') : [];
    var cie = AMX.compagnieChoisie ? AMX.compagnieChoisie('inventaire') : '';
    if (codes.length < 2) { conteneur.appendChild(h('span.l', { text: 'Recherche dans : ' + (nomCie(codes[0]) || 'votre concession') })); return conteneur; }
    conteneur.appendChild(h('span.l', 'Recherche dans :'));
    [['', 'Tout le groupe']].concat(codes.map(function (c) { return [c, nomCie(c)]; })).forEach(function (l) {
      var actif = cie === l[0];
      conteneur.appendChild(h('button.rech-choix' + (actif ? '.actif' : '') + '.' + (l[0] ? ((AMX.COULEUR_COMPAGNIE || {})[l[0]] || 'gris') : 'toutes'), {
        type: 'button', 'aria-pressed': actif ? 'true' : 'false', title: actif ? 'La recherche se fait ici' : 'Chercher dans ' + l[1],
        onmousedown: function (e) { e.preventDefault(); },   // garde le curseur dans la boîte
        onclick: function (e) { e.stopPropagation(); if (!actif) { AMX.choisirCompagnie(l[0]); if (opts.onchange) opts.onchange(l[0]); } }
      }, [h('i'), h('span', { text: l[1] })]));
    });
    return conteneur;
  }
  function texteIndice() {
    var cie = AMX.compagnieChoisie ? AMX.compagnieChoisie('inventaire') : '';
    return 'Chercher' + (cie ? ' chez ' + nomCie(cie) : ' dans tout le groupe') + ' : NIV, # stock, modèle, client, téléphone…';
  }

  /* ------------------------------ La boîte ------------------------------ */
  var entrees = [];
  function brancher(input) {
    if (!input || input.__amxRecherche) return;
    input.__amxRecherche = true;
    entrees.push(input);
    input.setAttribute('placeholder', texteIndice());
    var boite = null, derniere = '';
    var fermer = function () { if (boite) { boite.remove(); boite = null; } };
    var dessiner = function () {
      var q = input.value.trim();
      if (q.length < 2) { fermer(); return; }
      var cie = AMX.compagnieChoisie ? AMX.compagnieChoisie('inventaire') : '';
      var r = resultats(q, cie);
      var nouvelle = !boite;
      if (nouvelle) {
        boite = h('div.carte.rech-boite');
        input.parentNode.appendChild(boite);
      }
      var defile = boite.scrollTop;
      AMX.vider(boite);
      boite.appendChild(portee(h('div'), { onchange: function () { input.focus(); dessiner(); } }));
      if (!r.vehicules.length && !r.autres.length) {
        boite.appendChild(h('div.rech-vide', { text: r.enLecture.length ? 'Recherche en cours…' : 'Rien trouvé pour « ' + q + ' »' + (cie ? ' chez ' + nomCie(cie) : '') + '.' }));
      }
      r.vehicules.slice(0, MAX_VEHICULES).forEach(function (g) { boite.appendChild(carteVehicule(g, fermer)); });
      if (r.vehicules.length > MAX_VEHICULES) boite.appendChild(h('div.rech-plus', { text: (r.vehicules.length - MAX_VEHICULES) + ' autre(s) véhicule(s) : précisez la recherche (NIV complet, # stock).' }));
      if (r.autres.length) {
        boite.appendChild(h('div.rech-groupe', 'Sans NIV'));
        r.autres.slice(0, MAX_AUTRES).forEach(function (it) { boite.appendChild(ligneAutre(it, fermer)); });
      }
      if (cie && r.ailleurs) {
        boite.appendChild(h('button.rech-ailleurs', { type: 'button', onmousedown: function (e) { e.preventDefault(); }, onclick: function (e) { e.stopPropagation(); AMX.choisirCompagnie(''); input.focus(); dessiner(); } },
          [h('b', { text: r.ailleurs + ' résultat' + (r.ailleurs > 1 ? 's' : '') }), ' dans d\'autres concessions — chercher dans tout le groupe']));
      }
      if (r.enLecture.length) boite.appendChild(h('div.rech-lecture', { text: 'Encore en lecture : ' + r.enLecture.join(', ') + '…' }));
      if (!nouvelle) boite.scrollTop = defile;
    };
    var chercher = AMX.debounce(function () { var q = input.value.trim(); if (q === derniere && boite) return; derniere = q; dessiner(); }, 160);
    var auRetour = AMX.debounce(function () { if (boite && input.value.trim().length >= 2) dessiner(); }, 120);
    input.addEventListener('focus', function () { prechauffer(auRetour); if (input.value.trim().length >= 2 && !boite) dessiner(); });
    input.addEventListener('input', function () { prechauffer(auRetour); derniere = ''; chercher(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { input.value = ''; fermer(); input.blur(); }
      if (e.key === 'Enter' && boite) { var a = boite.querySelector('.rech-tete, .rech-autre'); if (a) { e.preventDefault(); location.hash = a.getAttribute('href').replace(/^.*#/, '#'); fermer(); } }
    });
    input.__amxFermer = fermer;
    input.__amxDessiner = function () { input.setAttribute('placeholder', texteIndice()); if (boite) dessiner(); };
  }
  document.addEventListener('click', function (e) {
    entrees.forEach(function (input) { if (input.__amxFermer && input.parentNode && !input.parentNode.contains(e.target)) input.__amxFermer(); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== '/' || /input|textarea|select/i.test((document.activeElement || {}).tagName || '')) return;
    var cible = document.getElementById('accueil-recherche') || document.getElementById('recherche-globale');
    if (cible && cible.offsetParent) { e.preventDefault(); cible.focus(); }
  });
  document.addEventListener('amx:compagnie', function () {
    entrees = entrees.filter(function (i) { return i.isConnected; });
    entrees.forEach(function (i) { if (i.__amxDessiner) i.__amxDessiner(); });
    document.querySelectorAll('.acc-recherche-portee').forEach(function (el) { portee(el); });
  });

  /* ------------------------------ Styles ------------------------------ */
  var css = [
    '.rech-boite { position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 60; max-height: min(70vh, 640px); overflow: auto; color: var(--encre); padding: 0; text-align: left; min-width: min(560px, 92vw); }',
    '.rech-portee { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }',
    '.rech-boite .rech-portee { position: sticky; top: 0; z-index: 1; background: var(--carte-2); border-bottom: 1px solid var(--ligne); padding: 8px 10px; }',
    '.rech-portee .l { font-size: 12px; font-weight: 600; color: var(--encre-3); margin-right: 2px; }',
    '.rech-choix { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border-radius: 999px; border: 1px solid var(--ligne-forte); background: var(--carte); color: var(--encre-2); font: inherit; font-size: 12px; cursor: pointer; }',
    '.rech-choix i { width: 8px; height: 8px; border-radius: 50%; background: var(--encre-4); }',
    '.rech-choix.vert i { background: var(--vert); } .rech-choix.bleu i { background: var(--bleu); } .rech-choix.violet i { background: var(--violet); } .rech-choix.sombre i { background: var(--noir); } .rech-choix.ambre i { background: var(--ambre); } .rech-choix.toutes i { background: linear-gradient(135deg, var(--vert), var(--bleu)); }',
    '.rech-choix.actif { background: var(--noir); border-color: var(--noir); color: #fff; font-weight: 600; } .rech-choix.actif i { box-shadow: 0 0 0 2px #fff; }',
    '.rech-vehicule { padding: 10px 12px; border-bottom: 1px solid var(--ligne); }',
    '.rech-tete { display: block; color: inherit; text-decoration: none; } .rech-tete:hover .rech-titre { color: var(--vert); }',
    '.rech-titre { font-weight: 600; font-size: 14px; }',
    '.rech-sous { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; font-size: 12px; color: var(--encre-3); margin-top: 2px; }',
    '.rech-cie { display: inline-flex; align-items: center; gap: 5px; font-weight: 600; color: var(--encre-2); } .rech-cie i { width: 8px; height: 8px; border-radius: 50%; background: var(--encre-4); }',
    '.rech-cie.vert i { background: var(--vert); } .rech-cie.bleu i { background: var(--bleu); } .rech-cie.violet i { background: var(--violet); } .rech-cie.sombre i { background: var(--noir); } .rech-cie.ambre i { background: var(--ambre); }',
    '.rech-liens { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 7px; }',
    '.rech-liens .puce, .rech-puce { text-decoration: none; cursor: pointer; }',
    '.rech-puce.vert { background: var(--vert-clair); color: var(--vert-fonce); } .rech-puce.bleu { background: var(--bleu-bg); color: var(--bleu); } .rech-puce.violet { background: var(--violet-bg); color: var(--violet); }',
    '.rech-puce.sarcelle { background: var(--sarcelle-bg); color: var(--sarcelle); } .rech-puce.ambre { background: var(--ambre-bg); color: var(--ambre); } .rech-puce.prune { background: var(--prune-bg); color: var(--prune); } .rech-puce.rouge { background: var(--rouge-bg); color: var(--rouge); }',
    '.rech-groupe { padding: 8px 12px 4px; font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--encre-3); }',
    '.rech-autre { display: flex; gap: 10px; align-items: center; padding: 9px 12px; border-bottom: 1px solid var(--ligne); color: inherit; text-decoration: none; } .rech-autre:hover { background: var(--carte-2); }',
    '.rech-vide, .rech-plus, .rech-lecture { padding: 10px 12px; font-size: 13px; color: var(--encre-3); }',
    '.rech-lecture { font-size: 12px; border-top: 1px dashed var(--ligne); }',
    '.rech-ailleurs { display: block; width: 100%; text-align: left; padding: 10px 12px; border: 0; border-top: 1px solid var(--ligne); background: var(--ambre-bg); color: var(--ambre); font: inherit; font-size: 13px; cursor: pointer; }',
    '.acc-recherche-portee { margin-top: 10px; } .acc-recherche-portee .l { color: rgba(255,255,255,.75); }',
    '.acc-recherche-portee .rech-choix { background: rgba(255,255,255,.08); border-color: rgba(255,255,255,.25); color: #fff; }',
    '.acc-recherche-portee .rech-choix.actif { background: #fff; color: var(--noir); border-color: #fff; } .acc-recherche-portee .rech-choix.actif i { box-shadow: none; }',
    '@media (max-width: 640px) { .rech-boite { min-width: 0; } }'
  ].join('\n');
  document.head.appendChild(h('style#rech-style', { text: css }));

  // Après une déconnexion (AMX.deconnecter), rien de l'ancienne personne ne doit rester en mémoire.
  function vider() { etat = {}; foin = new WeakMap(); entrees.forEach(function (i) { if (i.__amxFermer) i.__amxFermer(); }); }

  /* 22 oct. (Listes et audits, listes.js) : charger les sources voulues d'un coup, puis un index par NIV, par
     8 derniers caractères du NIV et par # stock — pour dire où est chaque véhicule d'une liste déposée. */
  function chargerSources(ids, force) {
    var srcs = sourcesActives().filter(function (s) { return !ids || ids.indexOf(s.id) >= 0; });
    if (force) srcs.forEach(function (s) { var e = etat[s.id]; if (e && !e.promesse) e.quand = 0; });
    return Promise.all(srcs.map(function (s) { return charger(s); })).then(function () {
      return srcs.map(function (s) { var e = etat[s.id] || {}; return { id: s.id, nom: s.nom, n: (e.liste || []).length, erreur: e.erreur || '', quand: e.quand || 0 }; });
    });
  }
  function indexSources(ids) {
    var parVin = {}, parVin8 = {}, parStock = {};
    sourcesActives().forEach(function (src) {
      if (ids && ids.indexOf(src.id) < 0) return;
      var e = etat[src.id]; if (!e || !e.liste) return;
      e.liste.forEach(function (x) {
        var vin = vinDe(src.vin(x)), it = { src: src, x: x, cie: src.cie(x) || '' };
        if (vin) { (parVin[vin] = parVin[vin] || []).push(it); (parVin8[vin.slice(-8)] = parVin8[vin.slice(-8)] || []).push(it); }
        var st = src.stock ? norm(src.stock(x)).replace(/[^A-Z0-9]/g, '') : '';
        if (st) (parStock[st] = parStock[st] || []).push(it);
      });
    });
    return { parVin: parVin, parVin8: parVin8, parStock: parStock };
  }
  AMX.recherche = { vider: vider, brancher: brancher, portee: function (el) { return portee(el); }, resultats: resultats, prechauffer: prechauffer, indice: texteIndice, sources: SOURCES,
    chargerSources: chargerSources, index: indexSources, puce: puceDe, extrasNiv: extrasNiv };
  AMX.brancherRecherche = brancher;
})();
