/* =========================================================================
   Section « Service » : suivi du reconditionnement des véhicules au détail
   (6 octobre 2026). Même logique que l'app (Service.swift) et le script
   (Service.gs) : chaque véhicule du registre Detail suit neuf étapes —
   Arrivée → Inspection réception → Autorisation détail → BT ouvert →
   Mécanique → Carrosserie → Esthétique → Photos → Prêt à vendre — avec une
   date, un responsable, une note et une cible en jours par étape ; on mesure
   le temps jusqu'à la ligne de vente.

   Règle (Maxime, 6 oct.) : tant que l'autorisation n'est pas « accepté »,
   le BT et tout ce qui suit restent verrouillés. Un refus ferme le suivi :
   le véhicule part en wholesale (transfert Canada / É.-U. depuis ce panneau).

   Routes serveur :
     GET  ?service=1&tout=1[&compagnie=]   POST serviceEtape, serviceAutoriser,
     GET  ?serviceVin=NIV                  serviceNote, serviceCibles, serviceMiroir
   ========================================================================= */
(function () {
  'use strict';
  var h = AMX.h, esc = AMX.esc, I = AMX.icones;

  // Même liste que SERVICE_ETAPES côté script (le serveur renvoie la sienne ; celle-ci sert avant le premier chargement).
  var ETAPES = [
    { id: 'arrivee',      libelle: 'Arrivée',                     court: 'Arrivée', cible: 0, sautable: false },
    { id: 'verification', libelle: 'Vérification à la livraison', court: 'Vérif.',  cible: 1, sautable: false, directeur: true },
    { id: 'autorisation', libelle: 'Autorisation détail',         court: 'Autor.',  cible: 1, sautable: false, porte: true, directeur: true },
    { id: 'bt',           libelle: 'BT ouvert',                   court: 'BT',      cible: 1, sautable: false },
    { id: 'mecanique',    libelle: 'Mécanique',                   court: 'Méca.',   cible: 2, sautable: true },
    { id: 'carrosserie',  libelle: 'Carrosserie',                 court: 'Carr.',   cible: 3, sautable: true },
    { id: 'esthetique',   libelle: 'Esthétique',                  court: 'Esth.',   cible: 1, sautable: false },
    { id: 'photos',       libelle: 'Photos',                      court: 'Photos',  cible: 1, sautable: false },
    { id: 'pret',         libelle: 'Prêt à vendre',               court: 'Prêt',    cible: 0, sautable: false }
  ];
  var RESULTATS = { conforme: { libelle: 'Conforme à l\'évaluation', couleur: 'vert' }, ecarts: { libelle: 'Écarts constatés', couleur: 'rouge' } };
  var STATUTS = { encours: { libelle: 'En cours', couleur: 'bleu' }, pret: { libelle: 'Prêt à vendre', couleur: 'vert' }, refuse: { libelle: 'Refusé au détail', couleur: 'rouge' }, annule: { libelle: 'Annulé', couleur: 'gris' } };
  var ETATS = { afaire: { libelle: 'À faire', couleur: 'gris' }, encours: { libelle: 'En cours', couleur: 'bleu' }, fait: { libelle: 'Fait', couleur: 'vert' }, saute: { libelle: 'Sauté', couleur: 'gris' } };

  // Au directeur : vérification à la livraison et autorisation détail.
  function attendDirecteur(s) { return s.statut === 'encours' && (s.etapeCourante === 'verification' || s.etapeCourante === 'autorisation'); }
  function etapeDef(id, liste) { var l = liste || ETAPES; for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
  function indexEtape(id, liste) { var l = liste || ETAPES; for (var i = 0; i < l.length; i++) if (l[i].id === id) return i; return -1; }
  function marque(s) { return String(s.modele || '').trim().split(' ')[0].toUpperCase(); }
  function nomCourt(courriel) { var s = String(courriel || ''); if (!s) return ''; var n = AMX.session && AMX.session.courriel === s && AMX.session.nom ? AMX.session.nom : s.split('@')[0]; return n.replace(/[._-]/g, ' '); }

  /* ------------------------- Cache partagé (AMX.service) -------------------- */
  var cache = { reponse: null, quand: 0 };
  var promesse = null;
  AMX.service = {
    etapes: function () { return (cache.reponse && cache.reponse.etapes) || ETAPES; },
    cibles: function () { return (cache.reponse && cache.reponse.cibles) || { etapes: {}, total: 5 }; },
    charger: function (force) {
      if (!force && cache.reponse && Date.now() - cache.quand < 60000) return Promise.resolve(cache.reponse);
      if (promesse) return promesse;
      // force (bouton Rafraîchir, après une écriture) : frais=1 saute le cache serveur (120 s).
      promesse = AMX.get(force ? { service: 1, tout: 1, frais: 1 } : { service: 1, tout: 1 }).then(function (d) {
        AMX.verifier(d, 'Suivi service indisponible');
        cache.reponse = d; cache.quand = Date.now(); promesse = null;
        document.dispatchEvent(new CustomEvent('amx:service'));
        return d;
      }, function (e) { promesse = null; throw e; });
      return promesse;
    },
    enCache: function () { return cache.reponse ? cache.reponse.suivis : null; },
    resume: function () { return (cache.reponse && cache.reponse.resume) || null; },
    parVin: function (vin) {
      vin = String(vin || '').toUpperCase();
      var l = cache.reponse ? cache.reponse.suivis : [];
      for (var i = 0; i < l.length; i++) if (String(l[i].vin).toUpperCase() === vin) return l[i];
      return null;
    },
    remplacer: function (suivi) {
      if (!cache.reponse || !suivi) return;
      var l = cache.reponse.suivis, trouve = false;
      for (var i = 0; i < l.length; i++) if (String(l[i].vin).toUpperCase() === String(suivi.vin).toUpperCase()) { l[i] = suivi; trouve = true; }
      if (!trouve) l.unshift(suivi);
      document.dispatchEvent(new CustomEvent('amx:service'));
    },
    parcours: parcours,
    bloc: blocRegistre
  };

  /* ------------------------------ Parcours -------------------------------- */
  // Neuf pastilles : fait (vert), en cours (bleu), à faire (gris), sauté (hachuré),
  // autorisation en attente (ambre) ou refusée (rouge), verrouillé (cadenas).
  function parcours(s, opts) {
    opts = opts || {};
    var etapes = AMX.service.etapes();
    var idxPorte = indexEtape('autorisation', etapes);
    var accepte = s.autorisation && s.autorisation.decision === 'accepte';
    var refuse = s.autorisation && s.autorisation.decision === 'refuse';
    var el = h('div.svc-parcours' + (opts.compact ? '.compact' : ''));
    etapes.forEach(function (e, i) {
      var x = (s.etapes && s.etapes[e.id]) || { etat: 'afaire' };
      var cls = x.etat;
      var titre = e.libelle + ' — ' + (ETATS[x.etat] ? ETATS[x.etat].libelle : x.etat);
      if (e.porte) { cls = refuse ? 'refuse' : (accepte ? 'fait' : 'attente'); titre = e.libelle + ' — ' + (refuse ? 'refusé' : (accepte ? 'accepté' : 'en attente')); }
      else if (i > idxPorte && !accepte) { cls = 'verrou'; titre = e.libelle + ' — verrouillé (autorisation détail requise)'; }
      if (s.statut === 'encours' && e.id === s.etapeCourante && cls !== 'verrou') cls += ' courante';
      el.appendChild(h('div.svc-pas.' + cls.split(' ').join('.'), { title: titre }, [h('span.pt', e.porte && !accepte && !refuse ? '!' : (cls.indexOf('verrou') === 0 ? '' : '')), opts.compact ? null : h('span.lb', { text: e.court })]));
    });
    return el;
  }

  /* -------------------- Bloc pour le panneau du registre Detail --------------- */
  function blocRegistre(v, onChange) {
    var bloc = h('div.bloc', [h('h3', ['Suivi service', h('a.btn.petit', { href: AMX.lien('service', 'encours', { vin: v.vin }), text: 'Ouvrir le suivi' })])]);
    var zone = h('div.chargement', [h('span.spin'), 'Chargement…']);
    bloc.appendChild(zone);
    var dessiner = function () {
      var s = AMX.service.parVin(v.vin);
      AMX.vider(zone); zone.className = '';
      if (!s) { zone.appendChild(h('div.doux.petit', v.statut === 'stock' ? 'Déjà en stock : aucun suivi en cours.' : 'Aucun suivi pour ce véhicule.')); return; }
      var st = STATUTS[s.statut] || STATUTS.encours, cour = etapeDef(s.etapeCourante, AMX.service.etapes());
      zone.appendChild(h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '8px' } }, [
        h('span.badge.' + st.couleur, { text: st.libelle }),
        s.statut === 'encours' && cour ? h('span.puce' + (s.enRetard ? '.alerte' : ''), { text: 'Étape : ' + cour.libelle + (s.joursEtape !== null && s.joursEtape !== undefined ? ' · ' + s.joursEtape + ' j' : '') }) : null,
        s.joursTotal !== null && s.joursTotal !== undefined ? h('span.puce' + (s.enRetard ? '.alerte' : ''), { text: s.joursTotal + ' j depuis l\'arrivée' }) : null
      ]));
      zone.appendChild(parcours(s));
      if (s.statut === 'encours' && s.etapeCourante === 'autorisation') zone.appendChild(h('div.alerte-bloc.attention', { style: { marginTop: '8px' } }, [h('span', { html: I.alerte }), h('div', 'En attente de l\'autorisation détail : le BT ne peut pas être ouvert.')]));
    };
    AMX.service.charger().then(dessiner).catch(function (e) { AMX.vider(zone); zone.className = 'doux petit'; zone.textContent = 'Suivi indisponible : ' + AMX.erreurTexte(e); });
    return bloc;
  }

  /* ------------------------------- Section -------------------------------- */
  AMX.section('service', {
    titre: 'Service', icone: 'service', ordre: 15,
    onglets: [
      { id: 'encours', titre: 'En cours', compteur: function () { var l = AMX.service.enCache(); return l ? l.filter(function (s) { return s.statut === 'encours'; }).length : ''; } },
      { id: 'autoriser', titre: 'Direction', compteur: function () { var l = AMX.service.enCache(); return l ? l.filter(attendDirecteur).length : ''; } },
      { id: 'termines', titre: 'Terminés' }
    ],
    monter: function (conteneur, ctx) { return new Suivi(conteneur, ctx); }
  });

  function Suivi(conteneur, ctx) {
    var self = this;
    this.conteneur = conteneur;
    this.onglet = ctx.onglet || 'encours';
    this.selection = ctx.params.vin || '';
    this.suivis = [];
    this.filtres = this.filtresDefaut();
    this.tri = AMX.memo.lire('svc_tri', 'jours');
    this.ecritures = 0; this.generation = 0;
    this.construire();
    this.charger();
    this.surService = function () { self.suivis = AMX.service.enCache() || self.suivis; self.construireRail(); self.rendre(); AMX.rafraichirSousBarre(); };
    document.addEventListener('amx:service', this.surService);
    // Rafraîchissement périodique : sans frais=1 (le cache serveur suffit, il est vidé à chaque écriture).
    this.minuterie = setInterval(function () { if (!document.hidden && !self.ecritures) self.charger(); }, 120000);
  }
  Suivi.prototype.filtresDefaut = function () { return { recherche: '', compagnie: '', etapes: null, retard: false }; };
  Suivi.prototype.demonter = function () { clearInterval(this.minuterie); document.removeEventListener('amx:service', this.surService); };
  Suivi.prototype.naviguer = function (ctx) {
    if (ctx.onglet !== this.onglet) { this.onglet = ctx.onglet; this.filtres = this.filtresDefaut(); this.selection = ctx.params.vin || ''; this.construireRail(); this.rendre(); }
    else if (ctx.params.vin && ctx.params.vin !== this.selection) { this.selection = ctx.params.vin; this.rendre(); }
  };

  /* ---------------------------- Construction ------------------------------ */
  Suivi.prototype.construire = function () {
    var self = this;
    AMX.vider(this.conteneur);
    this.elKpis = h('div.kpis');
    this.elRail = h('aside.rail');
    this.elListe = h('div');
    this.elPanneau = h('aside.panneau');
    this.elOutils = h('div.outils-liste');
    this.elAgencement = h('div.agencement', [this.elRail, h('div.colonne-liste', [this.elOutils, this.elListe]), this.elPanneau]);
    this.conteneur.appendChild(h('div.page', [
      h('div.entete-page', [
        h('div', [h('h1', 'Suivi service'), h('p#svc-etat', { text: 'Chargement…' })]),
        h('div.actions', [
          h('button.btn.fantome.icone', { title: 'Filtres', html: I.filtre, onclick: function () { self.elRail.classList.toggle('ouvert'); } }),
          h('button.btn', { html: I.rafraichir + '<span>Rafraîchir</span>', onclick: function () { self.charger(true); } }),
          h('button.btn', { html: I.telecharger + '<span>Exporter Excel</span>', onclick: function () { self.exporter(); } }),
          AMX.estAdmin() ? h('button.btn', { html: I.outils + '<span>Cibles</span>', onclick: function () { self.modaleCibles(); } }) : null,
          AMX.estAdmin() ? h('button.btn', { title: 'Recopie les suivis dans l\'onglet « Service » des feuilles de concession (BMW)', html: I.externe + '<span>Feuilles</span>', onclick: function () { self.miroir(); } }) : null
        ])
      ]),
      this.elKpis, this.elAgencement
    ]));
    this.construireRail();
  };

  Suivi.prototype.construireRail = function () {
    var self = this, f = this.filtres, etapes = AMX.service.etapes();
    AMX.vider(this.elRail);
    var rech = h('div.recherche', [h('span', { html: I.recherche }), h('input.saisie', { type: 'search', placeholder: 'VIN, modèle, # stock, BT', value: f.recherche, oninput: AMX.debounce(function (e) { f.recherche = e.target.value; self.rendre(); }, 120) })]);
    var seg = h('div.segment.bloc');
    [['', 'Toutes']].concat(Object.keys(AMX.compagniesPour('service')).map(function (c) { return [c, c]; })).forEach(function (c) {
      seg.appendChild(h('button' + (f.compagnie === c[0] ? '.actif' : ''), { type: 'button', text: c[1], onclick: function () { f.compagnie = c[0]; self.construireRail(); self.rendre(); } }));
    });
    this.elRail.appendChild(h('div.groupe', [h('h3', 'Recherche'), rech, h('div', { style: { height: '10px' } }), h('div.etiquette', { style: { marginBottom: '6px' }, text: 'Compagnie' }), seg]));
    if (this.onglet !== 'termines') {
      var grp = h('div.groupe', [h('h3', ['Étape courante', h('button', { type: 'button', text: f.etapes ? 'Toutes' : '', onclick: function () { f.etapes = null; self.construireRail(); self.rendre(); } })])]);
      var base = this.base();
      etapes.forEach(function (e) {
        if (e.id === 'arrivee') return;
        var n = base.filter(function (s) { return s.statut === 'encours' && s.etapeCourante === e.id; }).length;
        var cb = h('input', { type: 'checkbox', checked: !f.etapes || f.etapes.indexOf(e.id) >= 0 });
        cb.addEventListener('change', function () {
          var cur = (f.etapes || etapes.map(function (x) { return x.id; })).slice();
          if (cb.checked) { if (cur.indexOf(e.id) < 0) cur.push(e.id); } else cur = cur.filter(function (x) { return x !== e.id; });
          f.etapes = cur; self.construireRail(); self.rendre();
        });
        grp.appendChild(h('label.case', [cb, h('span.pastille', { style: { background: e.porte ? 'var(--ambre)' : 'var(--bleu)' } }), h('span', { text: e.libelle }), h('span.compte', { text: n })]));
      });
      var cbRetard = h('input', { type: 'checkbox', checked: f.retard });
      cbRetard.addEventListener('change', function () { f.retard = cbRetard.checked; self.rendre(); });
      grp.appendChild(h('div', { style: { marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--ligne)' } }, [h('label.case', [cbRetard, h('span.pastille', { style: { background: 'var(--rouge)' } }), h('span', 'En retard seulement')])]));
      this.elRail.appendChild(grp);
    }
    var cibles = AMX.service.cibles();
    this.elRail.appendChild(h('div.groupe', [h('h3', 'Cibles'), h('div.doux.petit', { style: { lineHeight: '1.6' } }, [
      h('div', [h('b', { text: cibles.total + ' j' }), ' de l\'arrivée à « Prêt à vendre »']),
      h('div', etapes.filter(function (e) { return (cibles.etapes[e.id] || 0) > 0; }).map(function (e) { return e.court + ' ' + cibles.etapes[e.id] + ' j'; }).join(' · '))
    ])]));
  };

  /* ------------------------------- Données -------------------------------- */
  Suivi.prototype.charger = function (force) {
    var self = this, gen = this.generation, etat = document.getElementById('svc-etat');
    var enCache = AMX.service.enCache();
    if (enCache) { this.suivis = enCache; this.rendre(); }
    else { this.elListe.innerHTML = ''; this.elListe.appendChild(AMX.chargeur('Suivi service')); }
    return AMX.service.charger(force).then(function (d) {
      if (gen !== self.generation) return;
      self.suivis = d.suivis || [];
      if (etat) etat.textContent = self.suivis.filter(function (s) { return s.statut === 'encours'; }).length + ' véhicules en reconditionnement · synchronisé à ' + new Date().toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });
      self.construireRail(); self.rendre(); AMX.rafraichirSousBarre();
    }).catch(function (e) {
      if (etat) etat.textContent = 'Serveur injoignable : ' + AMX.erreurTexte(e);
      if (!enCache) this.elListe.innerHTML = '';
      AMX.toast('Impossible de charger le suivi service : ' + AMX.erreurTexte(e), 'erreur');
    }.bind(this));
  };

  // Une écriture : jamais rejouée ; le serveur renvoie le suivi à jour.
  Suivi.prototype.ecrire = function (payload, message) {
    var self = this;
    this.ecritures++; this.generation++;
    var etat = document.getElementById('svc-etat'); if (etat) etat.textContent = 'Enregistrement…';
    return AMX.post(payload).then(function (d) {
      self.ecritures--;
      if (d.refuse || d.ok === false) {
        var motif = d.erreur || d.message || 'action refusée';
        AMX.toast('Non enregistré — ' + motif, d.bloque ? 'attention' : 'erreur', 6000);
        if (etat) etat.textContent = motif;
        throw new Error(motif);
      }
      if (d.suivi) AMX.service.remplacer(d.suivi);
      AMX.toast(d.message || message || 'Enregistré', 'ok');
      if (etat) etat.textContent = 'Enregistré à ' + new Date().toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });
      // Un changement de statut du véhicule (prêt → en stock) se voit au registre.
      if (payload.etape === 'pret' || payload.action === 'serviceAutoriser') AMX.inventaire.lire('DETAIL', true).catch(function () {});
      return d;
    }, function (e) {
      self.ecritures--;
      AMX.toast('Réponse du serveur incertaine — relecture… (' + AMX.erreurTexte(e) + ')', 'attention', 6000);
      return AMX.service.charger(true).then(function () { throw e; });
    });
  };

  /* ------------------------------- Filtres -------------------------------- */
  Suivi.prototype.base = function () {
    var f = this.filtres, o = this.onglet;
    return this.suivis.filter(function (s) {
      if (f.compagnie && String(s.compagnie || '').toUpperCase() !== f.compagnie) return false;
      if (o === 'termines') return s.statut !== 'encours';
      if (o === 'autoriser') return attendDirecteur(s);
      return s.statut === 'encours';
    });
  };
  Suivi.prototype.filtrer = function () {
    var f = this.filtres;
    var l = this.base();
    if (f.etapes && this.onglet !== 'termines') l = l.filter(function (s) { return f.etapes.indexOf(s.etapeCourante) >= 0; });
    if (f.retard) l = l.filter(function (s) { return s.enRetard; });
    if (f.recherche) {
      var t = f.recherche.trim().toLowerCase();
      l = l.filter(function (s) { return String(s.vin).toLowerCase().indexOf(t) >= 0 || String(s.modele || '').toLowerCase().indexOf(t) >= 0 || String(s.stock || '').toLowerCase().indexOf(t) >= 0 || String(s.btNo || '').toLowerCase().indexOf(t) >= 0; });
    }
    var etapes = AMX.service.etapes();
    var cmp = {
      jours: function (a, b) { return (b.joursTotal || 0) - (a.joursTotal || 0); },
      etape: function (a, b) { return indexEtape(a.etapeCourante, etapes) - indexEtape(b.etapeCourante, etapes) || (b.joursEtape || 0) - (a.joursEtape || 0); },
      maj: function (a, b) { return new Date(b.maj) - new Date(a.maj); },
      modele: function (a, b) { return String(a.modele || '').localeCompare(String(b.modele || ''), 'fr'); },
      stock: function (a, b) { return String(a.stock || 'zzz').localeCompare(String(b.stock || 'zzz'), 'fr', { numeric: true }); }
    }[this.tri] || function () { return 0; };
    return l.slice().sort(cmp);
  };

  /* -------------------------------- Rendu --------------------------------- */
  Suivi.prototype.rendre = function () {
    this.rendreKpis();
    var liste = this.filtrer();
    this.listeCourante = liste;
    this.rendreOutils(liste);
    this.rendreListe(liste);
    this.rendrePanneau();
  };

  Suivi.prototype.rendreKpis = function () {
    var self = this, f = this.filtres, cibles = AMX.service.cibles();
    AMX.vider(this.elKpis);
    var tous = this.suivis.filter(function (s) { return !f.compagnie || String(s.compagnie || '').toUpperCase() === f.compagnie; });
    var enCours = tous.filter(function (s) { return s.statut === 'encours'; });
    var aAutoriser = enCours.filter(attendDirecteur).length;
    var enRetard = enCours.filter(function (s) { return s.enRetard; }).length;
    var prets = tous.filter(function (s) { return s.statut === 'pret' && AMX.joursDepuis(s.maj) <= 30; });
    var refuses = tous.filter(function (s) { return s.statut === 'refuse' && AMX.joursDepuis(s.maj) <= 30; }).length;
    var moy = prets.length ? Math.round(prets.reduce(function (a, s) { return a + (s.joursTotal || 0); }, 0) / prets.length * 10) / 10 : null;
    var kpi = function (valeur, libelle, opts) {
      opts = opts || {};
      var k = h('button.kpi' + (opts.classe ? '.' + opts.classe : '') + (opts.actif ? '.actif' : ''), { type: 'button' }, [h('div.valeur', { text: valeur }), h('div.libelle', { text: libelle }), opts.sous ? h('div.sous', { text: opts.sous }) : null]);
      if (opts.onclick) k.addEventListener('click', opts.onclick);
      return k;
    };
    // Même compte que le registre Detail : au détail = en cours + prêts (suivis fermés).
    var resume = AMX.service.resume() || {};
    var auDetail = f.compagnie ? ((resume.parCompagnie || {})[f.compagnie] || {}).auDetail : resume.auDetail;
    if (auDetail === undefined || auDetail === null) auDetail = tous.filter(function (s) { return s.statut !== 'refuse' && s.dansRegistre !== false; }).length;
    var parStatut = resume.registreParStatut || {};
    var sousDetail = f.compagnie ? 'registre Detail · ' + AMX.COMPAGNIES_TOUTES[f.compagnie] : (parStatut.achete || parStatut.stock ? (parStatut.achete || 0) + ' acheté' + ((parStatut.achete || 0) > 1 ? 's' : '') + ' · ' + (parStatut.stock || 0) + ' en stock' : 'registre Detail');
    this.elKpis.appendChild(kpi(auDetail, 'Au détail', { classe: 'neutre', sous: sousDetail, onclick: function () { AMX.aller('inventaire', 'detail'); } }));
    this.elKpis.appendChild(kpi(enCours.length, 'En reconditionnement', { sous: f.compagnie ? AMX.COMPAGNIES_TOUTES[f.compagnie] : 'Toutes compagnies', actif: this.onglet === 'encours' && !f.retard, onclick: function () { f.retard = false; f.etapes = null; AMX.aller('service', 'encours'); } }));
    this.elKpis.appendChild(kpi(aAutoriser, 'Direction', { classe: aAutoriser ? 'attention' : '', sous: 'à vérifier / autoriser', actif: this.onglet === 'autoriser', onclick: function () { AMX.aller('service', 'autoriser'); } }));
    this.elKpis.appendChild(kpi(enRetard, 'En retard', { classe: enRetard ? 'alerte' : '', sous: 'cible ' + cibles.total + ' j', actif: f.retard, onclick: function () { f.retard = !f.retard; if (self.onglet !== 'encours') { AMX.aller('service', 'encours'); return; } self.rendre(); } }));
    this.elKpis.appendChild(kpi(moy === null ? '—' : moy + ' j', 'Moyenne → ligne', { classe: 'neutre', sous: prets.length ? 'sur ' + prets.length + ' prêt' + (prets.length > 1 ? 's' : '') + ' (30 j)' : 'aucun prêt (30 j)' }));
    this.elKpis.appendChild(kpi(prets.length, 'Prêts 30 j', { sous: 'passés en stock', actif: this.onglet === 'termines', onclick: function () { AMX.aller('service', 'termines'); } }));
    if (refuses) this.elKpis.appendChild(kpi(refuses, 'Refusés 30 j', { classe: 'neutre', sous: 'vers wholesale' }));
  };

  Suivi.prototype.rendreOutils = function (liste) {
    var self = this, f = this.filtres;
    AMX.vider(this.elOutils);
    var sel = h('select.saisie', { onchange: function (e) { self.tri = e.target.value; AMX.memo.ecrire('svc_tri', self.tri); self.rendre(); } });
    [['jours', 'Jours depuis l\'arrivée'], ['etape', 'Étape'], ['maj', 'Dernière mise à jour'], ['modele', 'Modèle'], ['stock', '# stock']].forEach(function (o) { sel.appendChild(h('option', { value: o[0], selected: self.tri === o[0], text: 'Tri : ' + o[1] })); });
    this.elOutils.appendChild(h('span.compte', [h('b', { text: liste.length }), ' véhicule' + (liste.length > 1 ? 's' : '')]));
    var puces = [];
    if (f.retard) puces.push(['En retard', function () { f.retard = false; }]);
    if (f.compagnie) puces.push([AMX.COMPAGNIES_TOUTES[f.compagnie] || f.compagnie, function () { f.compagnie = ''; }]);
    if (f.etapes) puces.push([f.etapes.length + ' étape(s)', function () { f.etapes = null; }]);
    if (f.recherche) puces.push(['« ' + f.recherche + ' »', function () { f.recherche = ''; }]);
    puces.forEach(function (p) { var b = h('button.puce.info', { type: 'button', title: 'Retirer ce filtre', html: esc(p[0]) + ' ✕' }); b.addEventListener('click', function () { p[1](); self.construireRail(); self.rendre(); }); self.elOutils.appendChild(b); });
    this.elOutils.appendChild(h('span.espace'));
    this.elOutils.appendChild(sel);
  };

  Suivi.prototype.rendreListe = function (liste) {
    var self = this;
    AMX.vider(this.elListe);
    if (!liste.length) {
      var texte = this.onglet === 'autoriser' ? 'Aucun véhicule n\'attend la vérification à la livraison ni l\'autorisation détail.' : (this.onglet === 'termines' ? 'Aucun suivi terminé dans les 90 derniers jours.' : 'Aucun véhicule en reconditionnement — les véhicules « Acheté » du registre Detail apparaissent ici d\'eux-mêmes.');
      this.elListe.appendChild(h('div.vide', [h('div', { html: I.voiture }), h('h3', 'Rien à montrer'), h('div', texte)]));
      return;
    }
    var frag = document.createDocumentFragment();
    liste.slice(0, 400).forEach(function (s) { frag.appendChild(self.ligne(s)); });
    this.elListe.appendChild(h('div.liste', [frag]));
  };

  Suivi.prototype.ligne = function (s) {
    var self = this, etapes = AMX.service.etapes();
    var st = STATUTS[s.statut] || STATUTS.encours;
    var cour = etapeDef(s.etapeCourante, etapes);
    var cls = 'div.ligne.svc' + (s.enRetard ? '.retard' : '') + (s.statut === 'encours' && s.etapeCourante === 'autorisation' ? '.attente' : '') + (this.selection && String(s.vin).toUpperCase() === String(this.selection).toUpperCase() ? '.actif' : '');
    var etapeTexte = s.statut === 'encours' ? (cour ? cour.libelle : '—') : st.libelle;
    var sousEtape = s.statut === 'encours' && s.joursEtape !== null && s.joursEtape !== undefined ? ('depuis ' + s.joursEtape + ' j' + (s.cibleEtape ? ' · cible ' + s.cibleEtape + ' j' : '')) : '';
    var el = h(cls, { dataset: { vin: s.vin } }, [
      h('div.vignette', { title: s.hasPhotos ? 'Photos disponibles' : 'Aucune photo' }, [AMX.logoMarque(marque(s)), s.hasPhotos ? h('span.cam', { html: I.photo }) : null]),
      h('div', { style: { minWidth: 0 } }, [
        h('div.titre', { text: s.modele || '(modèle à préciser)' }),
        h('div.sous', [h('span.vin', { text: s.vin }), s.stock ? h('span.puce.mono', { text: s.stock }) : null, h('span.puce', { text: s.compagnie || '—' }), s.btNo ? h('span.puce.info', { text: 'BT ' + s.btNo }) : null, s.implicite ? h('span.puce', { text: 'Nouveau', title: 'Acheté au registre Detail, aucune action encore' }) : null])
      ]),
      h('div.cell.parcours', [h('span.l', 'Parcours'), parcours(s, { compact: true })]),
      h('div.cell.statut', [h('span.l', 'Étape'), h('span', [h('span.badge.' + (s.statut === 'encours' ? (s.etapeCourante === 'autorisation' ? 'ambre' : (s.enRetard ? 'rouge' : 'bleu')) : st.couleur), { text: etapeTexte })]), sousEtape ? h('span.jours' + (s.cibleEtape && s.joursEtape > s.cibleEtape ? '.alerte' : ''), { text: sousEtape }) : null]),
      h('div.montant', [h('span.l', 'Arrivée'), h('span' + (s.enRetard ? '.svc-rouge' : ''), { text: s.joursTotal === null || s.joursTotal === undefined ? '—' : s.joursTotal + ' j' })]),
      h('button.plus', { type: 'button', title: 'Ouvrir', html: I.chevron })
    ]);
    el.addEventListener('click', function () { self.selectionner(s.vin); });
    return el;
  };

  Suivi.prototype.selectionner = function (vin) {
    this.selection = vin;
    history.replaceState(null, '', AMX.lien('service', this.onglet, vin ? { vin: vin } : {}));
    this.elListe.querySelectorAll('.ligne').forEach(function (l) { l.classList.toggle('actif', !!vin && l.dataset.vin === vin); });
    this.rendrePanneau();
  };

  /* ------------------------------- Panneau -------------------------------- */
  Suivi.prototype.rendrePanneau = function () {
    var self = this, etapes = AMX.service.etapes(), cibles = AMX.service.cibles();
    var s = this.selection ? AMX.service.parVin(this.selection) : null;
    this.elAgencement.classList.toggle('avec-panneau', !!s);
    AMX.vider(this.elPanneau);
    if (!s) { this.elPanneau.style.display = 'none'; return; }
    this.elPanneau.style.display = '';
    var st = STATUTS[s.statut] || STATUTS.encours;
    var peutEtape = AMX.perm('changerStatut');
    var directeur = AMX.perm('modifierMontants') || AMX.session.role === 'admin' || AMX.session.role === 'proprietaire' || AMX.session.role === 'gestionnaire';
    var peutAutoriser = directeur;
    var accepte = s.autorisation.decision === 'accepte', refuse = s.autorisation.decision === 'refuse';
    var idxPorte = indexEtape('autorisation', etapes);
    var fermer = function () { self.selectionner(''); };

    // Dossier : ce qu'on sait déjà du véhicule (portail d'évaluation) — rapport
    // eBlock et dommages de la fiche d'achat, photos de l'app, évaluation,
    // Torque. C'est ce que le directeur corrobore à la livraison.
    var blocDossier = h('div.bloc', [h('h3', ['Évaluation, photos et dommages', h('a.btn.petit', { href: AMX.lien('achat', '', { vin: s.vin }), text: s.ficheExiste ? 'Fiche d\'achat' : 'Créer la fiche' })])]);
    var zoneDossier = h('div.chargement', [h('span.spin'), 'Chargement du dossier…']);
    blocDossier.appendChild(zoneDossier);
    AMX.get({ serviceDossier: s.vin }).then(function (d) {
      if (!zoneDossier.isConnected) return;
      AMX.vider(zoneDossier); zoneDossier.className = 'svc-dossier';
      if (!d || d.ok === false) { zoneDossier.appendChild(h('div.doux.petit', 'Dossier indisponible.')); return; }
      var rien = true;
      if (d.dommages && d.dommages.length) {
        rien = false;
        zoneDossier.appendChild(h('div', { style: { marginBottom: '8px' } }, [h('span.badge.rouge', { text: d.dommages.length + ' dommage' + (d.dommages.length > 1 ? 's' : '') + ' répertorié' + (d.dommages.length > 1 ? 's' : '') + ' à l\'achat' }), h('ul.dommages-liste', d.dommages.map(function (x) { return h('li', { text: x }); }))]));
      } else if (d.fiche) zoneDossier.appendChild(h('div', { style: { marginBottom: '8px' } }, [h('span.badge.vert', { text: 'Aucun dommage répertorié à l\'achat' })]));
      if (d.eblock) { rien = false; zoneDossier.appendChild(h('div', { style: { marginBottom: '8px' } }, [h('a.btn.petit', { href: d.eblock, target: '_blank', rel: 'noopener', html: I.externe + '<span>Rapport d\'état eBlock</span>' })])); }
      if (d.fiche) {
        rien = false;
        zoneDossier.appendChild(h('dl.kv.serre', { style: { marginBottom: '8px' } }, [
          d.fiche.km ? h('dt', 'Km à l\'achat') : null, d.fiche.km ? h('dd', { text: AMX.fmtNombre(AMX.montant(d.fiche.km)) + ' km' }) : null,
          d.fiche.couleur ? h('dt', 'Couleur') : null, d.fiche.couleur ? h('dd', { text: d.fiche.couleur }) : null,
          d.fiche.prixAchat ? h('dt', 'Prix d\'achat') : null, d.fiche.prixAchat ? h('dd', { text: AMX.fmtArgent(d.fiche.prixAchat) }) : null,
          (d.fiche.recon && (d.fiche.recon.carrosserie || d.fiche.recon.service || d.fiche.recon.lavage)) ? h('dt', 'Recon prévu') : null,
          (d.fiche.recon && (d.fiche.recon.carrosserie || d.fiche.recon.service || d.fiche.recon.lavage)) ? h('dd', { text: ['carrosserie ' + (d.fiche.recon.carrosserie ? AMX.fmtArgent(d.fiche.recon.carrosserie) : '—'), 'service ' + (d.fiche.recon.service ? AMX.fmtArgent(d.fiche.recon.service) : '—'), 'lavage ' + (d.fiche.recon.lavage ? AMX.fmtArgent(d.fiche.recon.lavage) : '—')].join(' · ') }) : null
        ]));
      }
      if (d.evaluation) {
        rien = false;
        var ev = d.evaluation;
        zoneDossier.appendChild(h('div.svc-eval', [
          h('div.doux.petit', { text: 'Évaluation ' + (ev.par ? 'par ' + nomCourt(ev.par) + ' ' : '') + (ev.dateMaj ? 'le ' + AMX.fmtDate(ev.dateMaj) : '') }),
          h('div.actions-ligne', { style: { marginTop: '4px' } }, [
            ev.prixPaye ? h('span.puce', { text: 'payé ' + AMX.fmtArgent(ev.prixPaye) }) : null, ev.recon ? h('span.puce', { text: 'recon ' + AMX.fmtArgent(ev.recon) }) : null, ev.prixVente ? h('span.puce.ok', { text: 'détail ' + AMX.fmtArgent(ev.prixVente) }) : null,
            ev.etat ? h('span.puce', { text: 'état : ' + ev.etat }) : null, ev.pneus ? h('span.puce', { text: 'pneus : ' + ev.pneus }) : null, ev.pareBrise ? h('span.puce', { text: 'pare-brise : ' + ev.pareBrise }) : null, ev.accident ? h('span.puce.alerte', { text: 'accident : ' + ev.accident }) : null,
            h('a.btn.petit', { href: AMX.lien('outils', 'evaluation', { vin: s.vin }), text: 'Ouvrir l\'évaluation' })
          ]),
          ev.notes ? h('div.doux.petit', { style: { marginTop: '4px' }, text: ev.notes }) : null
        ]));
      }
      if (d.torque && d.torque.length) {
        rien = false;
        var t = d.torque[0];
        zoneDossier.appendChild(h('div.svc-eval', [
          h('div.doux.petit', { text: 'Torque : ' + (t.statutLibelle || t.statut || '') + (t.creeLe ? ' · ' + AMX.fmtDate(t.creeLe) : '') + (t.conseiller ? ' · ' + t.conseiller : '') + (d.torque.length > 1 ? ' (+' + (d.torque.length - 1) + ')' : '') }),
          h('div.actions-ligne', { style: { marginTop: '4px' } }, [
            t.etatGeneral || t.etat ? h('span.puce', { text: 'état : ' + (t.etatGeneral || t.etat) }) : null, t.pneus ? h('span.puce', { text: 'pneus : ' + t.pneus }) : null, t.pareBrise ? h('span.puce', { text: 'pare-brise : ' + t.pareBrise }) : null, t.carrosserie ? h('span.puce', { text: 'carrosserie : ' + t.carrosserie }) : null, t.accident ? h('span.puce.alerte', { text: 'accident : ' + t.accident }) : null,
            t.id ? h('a.btn.petit', { href: AMX.lien('outils', 'torque', { id: t.id }), text: 'Fiche Torque' }) : null
          ])
        ]));
      }
      if (d.photos && d.photos.length) {
        rien = false;
        var grille = h('div.vignettes', { style: { marginTop: '8px' } });
        d.photos.slice(0, 8).forEach(function (ph, i) { var img = h('img', { src: AMX.vignetteDrive(ph.url, 300), alt: ph.angle || '', title: ph.angle || ph.description || '', loading: 'lazy' }); img.addEventListener('click', function () { AMX.galerie(d.photos.map(function (x) { return { url: AMX.vignetteDrive(x.url, 1600), angle: x.angle || x.description }; }), i); }); grille.appendChild(img); });
        zoneDossier.appendChild(h('div.doux.petit', { style: { marginTop: '8px' }, text: d.photos.length + ' photo' + (d.photos.length > 1 ? 's' : '') + ' prise' + (d.photos.length > 1 ? 's' : '') + ' avec l\'app' + (d.photos.length > 8 ? ' (8 montrées)' : '') }));
        zoneDossier.appendChild(grille);
      } else zoneDossier.appendChild(h('div.doux.petit', { style: { marginTop: '6px' }, text: 'Aucune photo prise avec l\'app.' }));
      if (rien && !(d.photos && d.photos.length)) zoneDossier.insertBefore(h('div.alerte-bloc.info', { style: { marginBottom: '8px' } }, [h('span', { html: I.info }), h('div', 'Rien de connu sur ce véhicule : ni fiche d\'achat, ni évaluation, ni photos. Le directeur vérifie sur place et note ce qu\'il voit.')]), zoneDossier.firstChild);
    }).catch(function (e) { if (!zoneDossier.isConnected) return; AMX.vider(zoneDossier); zoneDossier.className = 'doux petit'; zoneDossier.textContent = 'Dossier indisponible : ' + AMX.erreurTexte(e); });

    // Résumé
    var blocResume = h('div.bloc', [h('h3', 'Parcours'),
      h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '10px' } }, [
        h('span.badge.' + st.couleur, { text: st.libelle }),
        s.joursTotal !== null && s.joursTotal !== undefined ? h('span.puce' + (s.enRetard ? '.alerte' : (s.statut === 'pret' ? '.ok' : '')), { text: s.joursTotal + ' j' + (s.statut === 'pret' ? ' jusqu\'à la ligne' : ' depuis l\'arrivée') + ' · cible ' + cibles.total + ' j' }) : null
      ]),
      parcours(s)
    ]);

    // Autorisation détail — la porte
    var blocAuto = h('div.bloc', [h('h3', ['Autorisation détail', accepte ? h('span.puce.ok', { text: 'Accepté' }) : (refuse ? h('span.puce.alerte', { text: 'Refusé' }) : h('span.puce.attention', { text: 'En attente' }))])]);
    if (accepte || refuse) {
      blocAuto.appendChild(h('div.doux.petit', { style: { marginBottom: '8px' } }, [(accepte ? 'Accepté au détail' : 'Refusé au détail') + ' le ' + AMX.fmtDate(s.autorisation.le, true) + (s.autorisation.par ? ' par ' + nomCourt(s.autorisation.par) : ''), refuse && s.autorisation.motif ? h('div', { style: { color: 'var(--rouge)', marginTop: '4px' } }, ['Motif : ' + s.autorisation.motif]) : null]));
      if (refuse) blocAuto.appendChild(h('div.alerte-bloc.erreur', { style: { marginBottom: '8px' } }, [h('span', { html: I.alerte }), h('div', 'Pas d\'inspection, de lavage ni de photos pour le détail. Le véhicule part en wholesale : transférez-le vers le registre Canada ou É.-U. ci-dessous.')]));
      if (peutAutoriser) blocAuto.appendChild(h('div.actions-ligne', [h('button.btn.fantome.petit', { text: 'Remettre en attente', onclick: function () { AMX.confirmer('Remettre l\'autorisation en attente', 'La décision « ' + (accepte ? 'accepté' : 'refusé') + ' » sera effacée pour ' + s.vin + '.').then(function (ok) { if (ok) self.ecrire({ action: 'serviceAutoriser', vin: s.vin, decision: 'annuler' }); }); } })]));
    } else {
      blocAuto.appendChild(h('div.alerte-bloc.attention', { style: { marginBottom: '10px' } }, [h('span', { html: I.alerte }), h('div', 'Tant que le véhicule n\'est pas accepté au détail, le BT, la mécanique, la carrosserie, l\'esthétique et les photos restent verrouillés.')]));
      if (peutAutoriser) blocAuto.appendChild(h('div.actions-ligne', [
        h('button.btn.primaire', { html: I.ok + '<span>Accepter au détail</span>', onclick: function () { self.ecrire({ action: 'serviceAutoriser', vin: s.vin, decision: 'accepte' }); } }),
        h('button.btn.danger', { text: 'Refuser (wholesale)', onclick: function () { self.modaleRefus(s); } })
      ]));
      else blocAuto.appendChild(h('div.doux.petit', 'Seuls les gestionnaires et administrateurs peuvent accepter ou refuser (droit « Modifier les coûts »).'));
    }

    // Étapes
    var blocEtapes = h('div.bloc', [h('h3', 'Étapes')]);
    var liste = h('div.svc-etapes');
    etapes.forEach(function (e, i) {
      if (e.porte) return;
      var x = s.etapes[e.id] || { etat: 'afaire' };
      var verrou = i > idxPorte && !accepte;
      var et = ETATS[x.etat] || ETATS.afaire;
      var cible = cibles.etapes[e.id] || 0;
      var jours = x.etat === 'encours' ? AMX.joursDepuis(x.debut) : (x.etat === 'fait' && x.debut && x.fin ? Math.max(0, Math.round((new Date(x.fin) - new Date(x.debut)) / 86400000)) : null);
      var courante = s.statut === 'encours' && s.etapeCourante === e.id;
      var ligne = h('div.svc-etape' + (courante ? '.courante' : '') + (verrou ? '.verrou' : '') + (x.etat === 'fait' ? '.fait' : '') + (x.etat === 'saute' ? '.saute' : ''), [
        h('div.svc-etape-tete', [
          h('span.svc-point.' + (verrou ? 'verrou' : x.etat)),
          h('div', { style: { minWidth: 0, flex: 1 } }, [
            h('div.svc-etape-nom', [e.libelle, cible ? h('span.doux.petit', { text: ' · cible ' + cible + ' j' }) : null]),
            h('div.doux.petit', { text: verrou ? 'Verrouillé — autorisation détail requise' : (x.etat === 'fait' ? 'Fait le ' + AMX.fmtDate(x.fin, true) + (x.par ? ' · ' + nomCourt(x.par) : '') + (jours !== null && jours > 0 ? ' · ' + jours + ' j' : '') : (x.etat === 'encours' ? 'Commencé le ' + AMX.fmtDate(x.debut, true) + (x.par ? ' · ' + nomCourt(x.par) : '') + (jours !== null ? ' · ' + jours + ' j' + (cible && jours > cible ? ' (en retard)' : '') : '') : (x.etat === 'saute' ? 'Sauté' + (x.par ? ' · ' + nomCourt(x.par) : '') : 'À faire'))) })
          ]),
          h('span.badge.' + (verrou ? 'gris' : (cible && jours !== null && jours > cible && x.etat === 'encours' ? 'rouge' : et.couleur)), { text: verrou ? 'Verrouillé' : et.libelle })
        ])
      ]);
      var res = x.resultat && RESULTATS[x.resultat];
      if (x.no || x.note || res) ligne.appendChild(h('div.svc-etape-detail', [res ? h('span.badge.' + res.couleur, { text: res.libelle }) : null, x.no ? h('span.puce.info.mono', { text: (e.id === 'bt' ? 'BT ' : '') + x.no }) : null, x.note ? h('span.doux.petit', { text: x.note }) : null]));
      if (e.directeur && !directeur) {
        if (x.etat !== 'fait') ligne.appendChild(h('div.doux.petit', { style: { marginTop: '6px' } }, 'Réservée aux directeurs (gestionnaires et administrateurs).'));
      } else if (peutEtape && !verrou && s.statut !== 'refuse') {
        var actions = h('div.actions-ligne.svc-actions');
        var envoyer = function (etat, extra) { return self.ecrire(Object.assign({ action: 'serviceEtape', vin: s.vin, etape: e.id, etat: etat }, extra || {})); };
        if (e.id === 'verification') {
          // Le directeur corrobore les dommages de l'évaluation (bloc du dessus) sur le véhicule livré.
          if (x.etat !== 'fait') {
            actions.appendChild(h('button.btn.primaire.petit', { html: I.ok + '<span>Conforme à l\'évaluation</span>', onclick: function () { envoyer('fait', { resultat: 'conforme' }); } }));
            actions.appendChild(h('button.btn.danger.petit', { text: 'Écarts constatés…', onclick: function () { self.modaleEcarts(s, e, x); } }));
          } else {
            actions.appendChild(h('button.btn.fantome.petit', { text: 'Modifier', onclick: function () { self.modaleEcarts(s, e, x); } }));
            actions.appendChild(h('button.btn.fantome.petit', { text: 'Refaire', onclick: function () { envoyer('afaire'); } }));
          }
          ligne.appendChild(actions);
          liste.appendChild(ligne);
          return;
        }
        if (x.etat === 'afaire' || x.etat === 'saute') {
          if (e.id === 'bt') actions.appendChild(h('button.btn.primaire.petit', { text: 'Ouvrir le BT', onclick: function () { self.modaleBt(s, e, 'fait'); } }));
          else if (e.id === 'pret') actions.appendChild(h('button.btn.primaire.petit', { html: I.ok + '<span>Marquer prêt à vendre</span>', onclick: function () { envoyer('fait'); } }));
          else if (e.id === 'arrivee') actions.appendChild(h('button.btn.petit', { text: 'Marquer arrivé', onclick: function () { envoyer('fait'); } }));
          else { actions.appendChild(h('button.btn.primaire.petit', { text: 'Commencer', onclick: function () { envoyer('encours'); } })); actions.appendChild(h('button.btn.petit', { text: 'Terminer', onclick: function () { envoyer('fait'); } })); }
          if (e.sautable && x.etat !== 'saute') actions.appendChild(h('button.btn.fantome.petit', { text: 'Sauter', title: 'Rien à faire pour cette étape', onclick: function () { envoyer('saute'); } }));
          if (x.etat === 'saute') actions.appendChild(h('button.btn.fantome.petit', { text: 'Rouvrir', onclick: function () { envoyer('afaire'); } }));
        } else if (x.etat === 'encours') {
          actions.appendChild(h('button.btn.primaire.petit', { html: I.ok + '<span>Terminer</span>', onclick: function () { envoyer('fait'); } }));
          if (e.sautable) actions.appendChild(h('button.btn.fantome.petit', { text: 'Sauter', onclick: function () { envoyer('saute'); } }));
          actions.appendChild(h('button.btn.fantome.petit', { text: 'Annuler', onclick: function () { envoyer('afaire'); } }));
        } else if (x.etat === 'fait') {
          if (e.id === 'arrivee') actions.appendChild(h('button.btn.fantome.petit', { text: 'Corriger la date', onclick: function () { self.modaleDate(s, e); } }));
          else if (e.id === 'bt') actions.appendChild(h('button.btn.fantome.petit', { text: 'Modifier le no', onclick: function () { self.modaleBt(s, e, 'fait'); } }));
          else actions.appendChild(h('button.btn.fantome.petit', { text: 'Rouvrir', onclick: function () { envoyer('encours'); } }));
        }
        if (e.id !== 'arrivee') actions.appendChild(h('button.btn.fantome.petit', { title: 'Note sur cette étape', text: x.note ? 'Modifier la note' : 'Note', onclick: function () { self.modaleNoteEtape(s, e, x); } }));
        ligne.appendChild(actions);
      }
      liste.appendChild(ligne);
    });
    blocEtapes.appendChild(liste);
    // Véhicule déjà sur la ligne (en stock avant le suivi, ou reconditionné
    // sans l'app) : un clic de directeur, tout est sauté avec une note.
    if (directeur && s.statut === 'encours') {
      var dejaStock = String(s.statutVehicule || '') === 'stock';
      blocEtapes.appendChild(h('div.svc-deja', { style: { marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--ligne)' } }, [
        h('div.doux.petit', { style: { marginBottom: '6px' }, text: dejaStock ? 'Ce véhicule est déjà « En stock » au registre : s\'il est déjà reconditionné, passez-le prêt d\'un coup.' : 'Déjà reconditionné sans passer par ici ?' }),
        h('button.btn' + (dejaStock ? '' : '.fantome') + '.petit', { html: I.ok + '<span>Déjà prêt à vendre</span>', title: 'Marque les étapes restantes « sautées » (avec une note), accepte au détail et passe « Prêt à vendre »', onclick: function () {
          AMX.confirmer('Déjà prêt à vendre', 'Les étapes non faites seront marquées « sautées » avec la note « déjà sur la ligne à la mise en place du suivi », l\'autorisation détail sera acceptée et ' + s.vin + ' passera « Prêt à vendre »' + (dejaStock ? '.' : ' (et « En stock » au registre).'), { ok: 'Marquer prêt' }).then(function (oui) {
            if (oui) self.ecrire({ action: 'serviceDejaPret', vin: s.vin });
          });
        } })
      ]));
    }

    // Notes
    var blocNotes = h('div.bloc', [h('h3', 'Notes')]);
    if (s.notes && s.notes.length) {
      blocNotes.appendChild(h('ul.chrono', s.notes.slice().reverse().slice(0, 20).map(function (n) { return h('li', [h('div', { text: n.texte }), h('div.quand', { text: AMX.fmtDate(n.quand, true) + (n.par ? ' · ' + nomCourt(n.par) : '') })]); })));
    } else blocNotes.appendChild(h('div.doux.petit', { style: { marginBottom: '8px' }, text: 'Aucune note.' }));
    if (peutEtape) {
      var champNote = h('input.saisie', { type: 'text', placeholder: 'Ajouter une note (pièce en attente, fournisseur, détail…)', maxlength: 1000 });
      var envoyerNote = function () { var t = champNote.value.trim(); if (!t) return; champNote.disabled = true; self.ecrire({ action: 'serviceNote', vin: s.vin, texte: t }, 'Note ajoutée').catch(function () { champNote.disabled = false; }); };
      champNote.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); envoyerNote(); } });
      blocNotes.appendChild(h('div', { style: { display: 'flex', gap: '6px' } }, [champNote, h('button.btn.petit', { text: 'Ajouter', onclick: envoyerNote })]));
    }

    // Véhicule + liens
    var lienCfx = AMX.carfax.lien(s.vin);
    var blocVehicule = h('div.bloc', [h('h3', 'Véhicule'),
      h('dl.kv.serre', [
        h('dt', '# stock'), h('dd', { text: s.stock || '—' }),
        h('dt', 'Compagnie'), h('dd', { text: (AMX.COMPAGNIES_TOUTES[s.compagnie] || s.compagnie || '—') }),
        h('dt', 'Registre'), h('dd', [s.dansRegistre ? AMX.badgeStatut(s.statutVehicule, 'DETAIL') : h('span.puce.attention', { text: 'absent du registre Detail' })]),
        h('dt', 'Acheté le'), h('dd', { text: s.dateAjout ? AMX.fmtDate(s.dateAjout) + ' (' + AMX.joursDepuis(s.dateAjout) + ' j)' : '—' }),
        h('dt', 'Arrivée'), h('dd', { text: s.arrivee ? AMX.fmtDate(s.arrivee) : '—' }),
        h('dt', 'Coût'), h('dd', { text: s.cout ? AMX.fmtArgent(s.cout) : '—' }),
        s.rappel === 'oui' ? h('dt', 'Rappel') : null, s.rappel === 'oui' ? h('dd', [h('span.badge.rouge', { text: 'Rappel ouvert' })]) : null
      ]),
      h('div.actions-ligne', { style: { marginTop: '10px' } }, [
        s.dansRegistre ? h('a.btn.petit', { href: AMX.lien('inventaire', 'detail', { vin: s.vin }), html: I.inventaire + '<span>Registre Detail</span>' }) : null,
        h('a.btn.petit', { href: AMX.lien('achat', '', { vin: s.vin }), html: I.achat + '<span>' + (s.ficheExiste ? 'Fiche d\'achat' : 'Créer la fiche d\'achat') + '</span>' }),
        h('button.btn.petit', { html: I.photo + '<span>Photos' + (s.hasPhotos ? '' : ' (aucune)') + '</span>', onclick: function (ev) {
          ev.target.classList.add('occupe');
          AMX.photosDe(s.vin).then(function (p) { ev.target.classList.remove('occupe'); if (!p.length) { AMX.toast('Aucune photo pour ce véhicule — prenez-les avec l\'app.', 'attention'); return; } AMX.galerie(p.map(function (x) { return { url: AMX.vignetteDrive(x.url, 1600), angle: x.angle }; }), 0); });
        } }),
        lienCfx ? h('a.btn.petit', { href: lienCfx, target: '_blank', rel: 'noopener', html: I.externe + '<span>CARFAX</span>' }) : null
      ])
    ]);

    // Refusé : transfert wholesale
    var blocWholesale = null;
    if (refuse && s.dansRegistre && peutEtape) {
      blocWholesale = h('div.bloc', [h('h3', 'Wholesale'), h('div.actions-ligne', [['CAN', 'Transférer → Canada'], ['US', 'Transférer → É.-U.']].map(function (t) {
        return h('button.btn', { text: t[1], onclick: function () {
          AMX.confirmer('Transférer le véhicule', s.vin + ' sera retiré du registre Detail et ajouté au registre ' + AMX.inventaire.nomFeuille(t[0]) + ' avec le statut « Acheté ».').then(function (ok) {
            if (!ok) return;
            AMX.post({ action: 'transfer', id: s.id, toSheet: t[0], sheet: 'DETAIL' }).then(function (d) {
              AMX.verifier(d, 'Transfert refusé');
              AMX.toast('Transféré vers ' + AMX.inventaire.nomFeuille(t[0]), 'ok');
              AMX.inventaire.lire('DETAIL', true).catch(function () {}); AMX.inventaire.lire(t[0], true).catch(function () {});
              AMX.service.charger(true).then(function () { self.selectionner(''); });
            }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); });
          });
        } });
      }))]);
    }

    this.elPanneau.appendChild(h('div.carte', [
      h('div.panneau-entete', [
        h('div', { style: { minWidth: 0 } }, [
          h('h2', { text: s.modele || '(modèle à préciser)' }),
          h('div.sous', [h('span.mono', { text: s.vin }), h('button.btn.fantome.petit.icone', { title: 'Copier le VIN', html: I.copier, onclick: function () { AMX.copier(s.vin, 'VIN copié'); } }), s.stock ? h('span.puce.mono', { text: s.stock }) : null, h('span.puce', { text: s.compagnie || '—' }), s.btNo ? h('span.puce.info', { text: 'BT ' + s.btNo }) : null])
        ]),
        h('button.fermer', { title: 'Fermer', html: I.fermer, onclick: fermer })
      ]),
      blocResume, blocDossier, blocAuto, blocEtapes, blocNotes, blocVehicule, blocWholesale
    ]));
  };

  /* ------------------------------- Modales -------------------------------- */
  Suivi.prototype.modaleEcarts = function (s, e, x) {
    var self = this;
    var seg = h('div.segment', { style: { marginBottom: '12px' } });
    var choix = x.resultat || 'ecarts';
    [['conforme', 'Conforme à l\'évaluation'], ['ecarts', 'Écarts constatés']].forEach(function (o) {
      var b = h('button' + (choix === o[0] ? '.actif' : ''), { type: 'button', text: o[1] });
      b.addEventListener('click', function () { choix = o[0]; seg.querySelectorAll('button').forEach(function (bb) { bb.classList.toggle('actif', bb === b); }); });
      seg.appendChild(b);
    });
    var note = h('textarea.saisie', { rows: 4, placeholder: 'Dommages non répertoriés, pièces manquantes, km différent, état des pneus… (sert à la réclamation au transporteur ou à l\'encan)', maxlength: 500 });
    note.value = x.note || '';
    AMX.modale({ titre: 'Vérification à la livraison — ' + s.vin, corps: h('div', [h('p', { style: { margin: '0 0 12px', color: 'var(--encre-2)', lineHeight: '1.5' }, text: 'Comparez le véhicule livré aux photos et aux dommages répertoriés à l\'achat (bloc « Évaluation, photos et dommages »).' }), seg, h('div.champ', [h('label', 'Constat'), note])]),
      boutons: [{ texte: 'Annuler' }, { texte: 'Enregistrer la vérification', classe: 'primaire', action: function () {
        if (choix === 'ecarts' && !note.value.trim()) { note.style.borderColor = 'var(--rouge)'; note.focus(); return false; }
        return self.ecrire({ action: 'serviceEtape', vin: s.vin, etape: 'verification', etat: 'fait', resultat: choix, note: note.value.trim() });
      } }] });
  };
  // Refus au détail : on choisit tout de suite où part le véhicule (Maxime, 6 oct. :
  // « quand on fait un refus de détail, il faut proposer US ou Canada et faire le
  // choix immédiatement ») — le serveur refuse ET transfère dans la même action.
  Suivi.prototype.modaleRefus = function (s) {
    var self = this;
    var destination = '';
    var motif = h('textarea.saisie', { rows: 3, placeholder: 'Pourquoi le véhicule ne va pas au détail (kilométrage, état, marché…)', maxlength: 500 });
    var btnOk;
    var choix = h('div.svc-destinations', [['US', 'É.-U.', 'Registre É.-U. — export'], ['CAN', 'Canada', 'Registre Canada — wholesale local']].map(function (d) {
      return h('button.svc-destination', { type: 'button', dataset: { dest: d[0] }, onclick: function () {
        destination = d[0];
        choix.querySelectorAll('.svc-destination').forEach(function (b) { b.classList.toggle('actif', b.dataset.dest === destination); });
        if (btnOk) { btnOk.disabled = false; btnOk.innerHTML = 'Refuser et transférer → ' + d[1]; }
      } }, [h('b', { text: d[1] }), h('span', { text: d[2] })]);
    }));
    var corps = h('div', [
      h('p', { style: { margin: '0 0 12px', color: 'var(--encre-2)', lineHeight: '1.5' }, text: s.modele + ' · ' + s.vin + ' — aucune inspection, aucun lavage ni photo ne seront faits pour le détail.' }),
      h('div.champ', [h('label', 'Où part le véhicule ?'), choix, h('div.doux.petit', { style: { marginTop: '6px' }, text: 'Il quitte le registre Detail et arrive au registre choisi avec le statut « Acheté », tout de suite.' })]),
      h('div.champ', { style: { marginTop: '12px' } }, [h('label', 'Motif'), motif])
    ]);
    var m = AMX.modale({ titre: 'Refuser au détail', corps: corps,
      boutons: [{ texte: 'Annuler' }, { texte: 'Choisissez É.-U. ou Canada', classe: 'danger', action: function () {
        if (!destination) return false;
        return self.ecrire({ action: 'serviceAutoriser', vin: s.vin, decision: 'refuse', motif: motif.value.trim(), destination: destination }).then(function (d) {
          // Le véhicule a changé de registre : on rafraîchit les deux et la liste du service.
          AMX.inventaire.lire('DETAIL', true).catch(function () {}); AMX.inventaire.lire(destination, true).catch(function () {});
          if (d && d.transfere) AMX.service.charger(true).catch(function () {});
          return d;
        });
      } }] });
    btnOk = m && m.el ? m.el.querySelector('.btn.danger') : document.querySelector('.modale .btn.danger');
    if (btnOk) btnOk.disabled = true;
  };
  Suivi.prototype.modaleBt = function (s, e, etat) {
    var self = this;
    var no = h('input.saisie.mono', { type: 'text', placeholder: 'No du bon de travail', value: s.btNo || '', maxlength: 40 });
    AMX.modale({ titre: s.etapes.bt && s.etapes.bt.etat === 'fait' ? 'Numéro du BT' : 'Ouvrir le bon de travail', corps: h('div', [h('p', { style: { margin: '0 0 12px', color: 'var(--encre-2)' }, text: s.modele + ' · ' + s.vin }), h('div.champ', [h('label', 'No du BT'), no])]),
      boutons: [{ texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: function () { return self.ecrire({ action: 'serviceEtape', vin: s.vin, etape: e.id, etat: etat, no: no.value.trim() }); } }] });
  };
  Suivi.prototype.modaleDate = function (s, e) {
    var self = this;
    var val = s.arrivee ? new Date(s.arrivee) : new Date();
    var inp = h('input.saisie', { type: 'date', value: isNaN(val.getTime()) ? '' : val.toISOString().slice(0, 10) });
    AMX.modale({ titre: 'Date d\'arrivée', corps: h('div', [h('p', { style: { margin: '0 0 12px', color: 'var(--encre-2)' }, text: 'Le temps jusqu\'à la ligne de vente se compte à partir de cette date.' }), h('div.champ', [h('label', 'Arrivé le'), inp])]),
      boutons: [{ texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: function () { if (!inp.value) return false; return self.ecrire({ action: 'serviceEtape', vin: s.vin, etape: 'arrivee', etat: 'fait', date: inp.value + 'T12:00:00' }); } }] });
  };
  Suivi.prototype.modaleNoteEtape = function (s, e, x) {
    var self = this;
    var note = h('textarea.saisie', { rows: 3, placeholder: 'Ex. : pneus à remplacer, pare-brise commandé…', maxlength: 500 });
    note.value = x.note || '';
    AMX.modale({ titre: 'Note — ' + e.libelle, corps: h('div', [h('div.champ', [h('label', 'Note'), note])]),
      boutons: [{ texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: function () { return self.ecrire({ action: 'serviceEtape', vin: s.vin, etape: e.id, etat: x.etat || 'afaire', note: note.value.trim() }); } }] });
  };
  Suivi.prototype.modaleCibles = function () {
    var self = this, etapes = AMX.service.etapes(), cibles = AMX.service.cibles();
    var champs = {};
    var grille = h('div.grille.c2');
    etapes.forEach(function (e) { if (e.id === 'arrivee' || e.id === 'pret') return; var inp = h('input.saisie', { type: 'number', min: '0', step: '0.5', value: cibles.etapes[e.id] || 0 }); champs[e.id] = inp; grille.appendChild(h('div.champ', [h('label', { text: e.libelle }), inp])); });
    var total = h('input.saisie', { type: 'number', min: '1', step: '0.5', value: cibles.total });
    AMX.modale({ titre: 'Cibles en jours', corps: h('div', [h('p', { style: { margin: '0 0 12px', color: 'var(--encre-2)', lineHeight: '1.5' }, text: 'Au-delà de la cible, l\'étape ou le véhicule passe en rouge. Les outils du marché visent 3 à 5 jours de l\'arrivée à la ligne de vente.' }), h('div.champ', { style: { marginBottom: '12px' } }, [h('label', 'Total — de l\'arrivée à « Prêt à vendre »'), total]), grille]),
      boutons: [{ texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: function () {
        var c = { etapes: {}, total: Number(total.value) || 5 };
        Object.keys(champs).forEach(function (k) { c.etapes[k] = Number(champs[k].value) || 0; });
        return AMX.post({ action: 'serviceCibles', cibles: c }).then(function (d) { AMX.verifier(d, 'Cibles refusées'); AMX.toast('Cibles enregistrées', 'ok'); return AMX.service.charger(true); }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); return false; });
      } }] });
  };
  Suivi.prototype.miroir = function () {
    AMX.post({ action: 'serviceMiroir' }).then(function (d) {
      AMX.verifier(d, 'Miroir refusé');
      var r = (d.miroir && d.miroir.resultats) || {};
      var textes = Object.keys(r).map(function (c) { return c + ' : ' + (r[c].ok ? r[c].lignes + ' ligne(s)' : 'erreur — ' + r[c].erreur); });
      AMX.toast(textes.length ? 'Feuilles mises à jour · ' + textes.join(' · ') : 'Aucune feuille de concession configurée', textes.some(function (t) { return t.indexOf('erreur') >= 0; }) ? 'attention' : 'ok', 8000);
    }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); });
  };

  /* -------------------------------- Export -------------------------------- */
  Suivi.prototype.exporter = function () {
    if (typeof XLSX === 'undefined') { AMX.toast('Export indisponible (bibliothèque non chargée).', 'erreur'); return; }
    var etapes = AMX.service.etapes();
    var fin = function (s, id) { var e = s.etapes[id]; if (!e) return ''; if (e.etat === 'saute') return 'sauté'; if (e.etat === 'fait') return AMX.fmtDate(e.fin); if (e.etat === 'encours') return 'en cours'; return ''; };
    var rows = (this.listeCourante || []).map(function (s) {
      var r = { '# Stock': s.stock || '', 'VIN': s.vin, 'Modèle': s.modele || '', 'Compagnie': s.compagnie || '', 'Statut': (STATUTS[s.statut] || {}).libelle || s.statut, 'Étape courante': (etapeDef(s.etapeCourante, etapes) || {}).libelle || '', 'Jours depuis l\'arrivée': s.joursTotal === null ? '' : s.joursTotal, 'En retard': s.enRetard ? 'OUI' : '', 'Arrivée': AMX.fmtDate(s.arrivee),
        'Autorisation': s.autorisation.decision === 'accepte' ? 'Accepté' : (s.autorisation.decision === 'refuse' ? 'Refusé' : 'En attente'), 'Autorisé par': nomCourt(s.autorisation.par), 'Motif refus': s.autorisation.motif || '', 'BT no': s.btNo || '' };
      etapes.forEach(function (e) { if (e.id !== 'arrivee' && !e.porte) r[e.libelle] = fin(s, e.id); });
      r['Dernière note'] = s.notes && s.notes.length ? s.notes[s.notes.length - 1].texte : '';
      r['Mis à jour'] = AMX.fmtDate(s.maj, true);
      return r;
    });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Suivi service');
    XLSX.writeFile(wb, 'suivi-service-' + new Date().toISOString().slice(0, 10) + '.xlsx');
  };
})();
