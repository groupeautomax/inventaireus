/* ===========================================================================
   recherche-vehicule.js — Vente › Recherche de véhicule avec Einstein AI (16 nov. 2026)

   Maxime : « un onglet de recherche de véhicule avec Einstein : la recherche se fait en continu chaque jour quand il y a des
   nouveautés ; par exemple je cherche une Corvette rouge 2020 moins de 50 000 km et la recherche se crée » ; « partout
   comme dans Opportunités d'achat, sur les encans ».

   1. On décrit le véhicule ; Einstein en tire les critères (POST rechercheVehiculeInterpreter) ; on les corrige au besoin ;
      « Créer la recherche » (rechercheVehiculeCreer) la lit tout de suite.
   2. Le serveur la relit chaque jour (RechercheVehicule.gs, AMX_tic) : annonces d'Opportunités d'achat (concessionnaires,
      AutoTrader, Kijiji, CarGurus, Carpages, DealerSource, Manheim / BMW FS), MarketCheck, nos inventaires.
   3. Les véhicules trouvés depuis la dernière visite sont « nouveaux » : pastille sur l'onglet, ligne sur l'Accueil.
   Aucun courriel ni texto.
   ======================================================================== */
(function () {
  'use strict';
  var h = AMX.h, I = AMX.icones || {};
  var cache = { d: null, quand: 0, promesse: null };
  var SOURCES = { nous: ['Notre inventaire', 'vert'], marketcheck: ['Concessionnaire', 'bleu'], marketcheck_us: ['Concessionnaire É.-U.', 'bleu'], autotrader: ['AutoTrader', 'violet'], kijiji: ['Kijiji', 'violet'],
    cargurus: ['CarGurus', 'violet'], carpages: ['Carpages', 'violet'], gmf: ['GM Financial (encan)', 'ambre'], manheim: ['Manheim / BMW FS (encan)', 'ambre'] };
  var COULEURS = [['rouge', 'Rouge'], ['noir', 'Noir'], ['blanc', 'Blanc'], ['gris', 'Gris'], ['argent', 'Argent'], ['bleu', 'Bleu'], ['vert', 'Vert'], ['jaune', 'Jaune'], ['orange', 'Orange'], ['brun', 'Brun'], ['beige', 'Beige'], ['or', 'Or'], ['violet', 'Violet']];
  var CARROSSERIES = [['', 'Toutes'], ['vus', 'VUS'], ['berline', 'Berline'], ['coupe', 'Coupé'], ['cabriolet', 'Cabriolet'], ['camionnette', 'Camionnette'], ['fourgonnette', 'Fourgonnette'], ['hayon', 'Hayon'], ['familiale', 'Familiale']];

  function peutVoir() { return !!(AMX.session && AMX.session.perms && (AMX.perm('consulter') || AMX.perm('ficheAchat') || AMX.perm('changerStatut'))); }   /* l'onglet caché par le rôle : app.js (voitOnglet appelle ce visible : pas de boucle) */
  function charger(force) {
    if (!force && cache.d && Date.now() - cache.quand < (AMX.dureeCopie ? AMX.dureeCopie(120000) : 120000)) return Promise.resolve(cache.d);
    if (cache.promesse) return cache.promesse;
    cache.promesse = AMX.get('recherchesVehicule=1', { discret: true }).then(function (d) {
      if (!d || !Array.isArray(d.recherches)) throw new Error('Le script n\'est pas à jour : redéployez-le (RechercheVehicule.gs).');
      cache.d = d; cache.quand = Date.now(); cache.promesse = null;
      try { document.dispatchEvent(new CustomEvent('amx:recherchesVehicule')); } catch (e) {}
      if (AMX.rafraichirSousBarre) AMX.rafraichirSousBarre();
      return d;
    }, function (e) { cache.promesse = null; throw e; });
    return cache.promesse;
  }
  function mesRecherches() { return ((cache.d && cache.d.recherches) || []).filter(function (r) { return r.mienne && r.etat === 'active'; }); }
  function nouveautes() { var l = mesRecherches().filter(function (r) { return r.nbNouveaux > 0; }); return { n: l.reduce(function (t, r) { return t + r.nbNouveaux; }, 0), recherches: l }; }
  function compteur() { if (!cache.d) { charger().catch(function () {}); return ''; } var n = nouveautes().n; return n ? String(n) : ''; }
  AMX.rechercheVehicule = { charger: charger, enCache: function () { return cache.d; }, compteur: compteur, nouveautes: nouveautes, peutVoir: peutVoir, vider: function () { cache = { d: null, quand: 0, promesse: null }; } };

  function argent(n) { return n ? AMX.fmtArgent(n) : '—'; }
  function km(n) { return n === null || n === undefined || n === '' ? 'km ?' : Math.round(n).toLocaleString('fr-CA') + ' km'; }
  function liste(s) { return String(s || '').split(/[,;]+/).map(function (x) { return x.trim(); }).filter(Boolean); }
  function quand(iso) { return iso ? AMX.fmtDate(iso, true) : 'jamais'; }

  function css() {
    if (document.getElementById('css-rcv')) return;
    var st = document.createElement('style'); st.id = 'css-rcv';
    st.textContent = [
      '.rcv-creer { display: grid; gap: 10px; }',
      '.rcv-creer textarea { font-size: 17px; min-height: 64px; }',
      '.rcv-creer .rcv-exemples { display: flex; flex-wrap: wrap; gap: 6px; }',
      '.rcv-crit { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px 14px; margin-top: 8px; }',
      '.rcv-couleurs { display: flex; flex-wrap: wrap; gap: 6px; }',
      '.rcv-couleurs label { display: inline-flex; gap: 6px; align-items: center; border: 1px solid var(--ligne); border-radius: 999px; padding: 4px 10px; cursor: pointer; }',
      '.rcv-couleurs input:checked + span { font-weight: 700; color: var(--vert-fonce); }',
      '.rcv-resume { font-size: 17px; font-weight: 600; margin: 4px 0; }',
      '.rcv-questions { background: var(--ambre-bg, #FFF4DE); border-radius: 10px; padding: 8px 12px; margin-top: 8px; }',
      '.rcv-liste { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }',
      '.rcv-carte { border: 1px solid var(--ligne); border-radius: 14px; padding: 14px; background: var(--fond-carte, #fff); cursor: pointer; display: grid; gap: 6px; }',
      '.rcv-carte:hover { border-color: var(--vert); }',
      '.rcv-carte .t { font-weight: 700; font-size: 16px; }',
      '.rcv-carte .q { color: var(--encre-3); font-style: italic; }',
      '.rcv-carte.pause { opacity: .65; }',
      '.rcv-nouv { background: var(--vert); color: #fff; border-radius: 999px; padding: 2px 10px; font-weight: 700; font-size: 13px; }',
      '.rcv-res { display: grid; grid-template-columns: 112px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 10px 12px; border-bottom: 1px solid var(--ligne); }',
      '.rcv-res img, .rcv-res .ph { width: 112px; height: 76px; object-fit: cover; border-radius: 8px; background: var(--fond-2, #EEF1F4); display: block; }',
      '.rcv-res .t { font-weight: 700; }',
      '.rcv-res .s { color: var(--encre-3); font-size: 14px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 3px; }',
      '.rcv-res .prix { font-size: 18px; font-weight: 700; text-align: right; }',
      '.rcv-res .prix .avant { display: block; font-size: 13px; color: var(--vert-fonce); font-weight: 600; }',
      '.rcv-res .act { display: flex; gap: 6px; justify-content: flex-end; margin-top: 6px; flex-wrap: wrap; }',
      '.rcv-res.nouveau { background: var(--vert-clair); }',
      '.rcv-res.ecarte, .rcv-res.parti { opacity: .55; }',
      '.rcv-filtres { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0; }',
      '@media (max-width: 640px) { .rcv-res { grid-template-columns: 84px minmax(0, 1fr); } .rcv-res img, .rcv-res .ph { width: 84px; height: 60px; } .rcv-res .droite { grid-column: 1 / -1; } .rcv-res .prix { text-align: left; } .rcv-res .act { justify-content: flex-start; } }'
    ].join('\n');
    document.head.appendChild(st);
  }

  function Vue(conteneur, ctx) {
    css();
    this.c = conteneur; this.id = (ctx && ctx.params && ctx.params.id) || ''; this.filtre = 'tous'; this.equipe = false; this.detail = null;
    this.construire(); this.charger();
  }
  Vue.prototype.demonter = function () {};
  Vue.prototype.naviguer = function (ctx) { var id = (ctx && ctx.params && ctx.params.id) || ''; if (id !== this.id) { this.id = id; this.detail = null; this.rendre(); if (id) this.ouvrir(id); } };
  Vue.prototype.construire = function () {
    var self = this;
    this.elCorps = h('div');
    this.c.appendChild(h('div.page', [
      h('div.entete-page', [h('div', [h('h1', 'Recherche de véhicule'), h('p', 'Décrivez le véhicule : Einstein crée la recherche et la relit chaque jour partout — concessionnaires, sites d\'annonces (particuliers compris), encans et nos inventaires.')]),
        h('div.actions', [h('button.btn', { html: (I.rafraichir || '') + '<span>Rafraîchir</span>', onclick: function () { self.charger(true); } })])]),
      this.elCorps
    ]));
  };
  Vue.prototype.charger = function (force) {
    var self = this;
    if (!cache.d) { AMX.vider(this.elCorps); this.elCorps.appendChild(AMX.chargeur('Vos recherches')); }
    return charger(force).then(function () { self.rendre(); if (self.id) self.ouvrir(self.id); }).catch(function (e) { AMX.vider(self.elCorps); self.elCorps.appendChild(h('div.vide', [h('h3', 'Recherches indisponibles'), h('div', { text: AMX.erreurTexte(e) })])); });
  };
  Vue.prototype.rendre = function () {
    var self = this; AMX.vider(this.elCorps);
    if (this.id) { this.elCorps.appendChild(this.detail ? this.vueDetail() : AMX.chargeur('Résultats de la recherche')); return; }
    this.elCorps.appendChild(this.carteCreer());
    var d = cache.d || { recherches: [] };
    var liste = self.equipe ? ((self.dEquipe && self.dEquipe.recherches) || []) : d.recherches.filter(function (r) { return r.mienne; });
    var tete = h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', margin: '18px 0 10px', flexWrap: 'wrap' } }, [h('h2', { style: { margin: 0 }, text: self.equipe ? 'Les recherches de l\'équipe' : 'Mes recherches' })]);
    if (d.direction) tete.appendChild(h('button.btn.petit', { text: self.equipe ? 'Seulement les miennes' : 'Voir celles de l\'équipe', onclick: function () {
      self.equipe = !self.equipe;
      if (self.equipe && !self.dEquipe) AMX.get('recherchesVehicule=1&tous=1').then(function (x) { self.dEquipe = AMX.verifier(x, 'Lecture impossible'); self.rendre(); }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); self.equipe = false; self.rendre(); });
      self.rendre();
    } }));
    if (self.equipe && !self.dEquipe) { this.elCorps.appendChild(AMX.chargeur('Les recherches de l\'équipe', { compact: true })); return; }
    this.elCorps.appendChild(tete);
    if (!liste.length) { this.elCorps.appendChild(h('div.vide', [h('div', 'Aucune recherche pour l\'instant : décrivez un véhicule ci-dessus.')])); return; }
    var grille = h('div.rcv-liste');
    liste.forEach(function (r) {
      grille.appendChild(h('div.rcv-carte' + (r.etat === 'pause' ? '.pause' : ''), { role: 'button', tabindex: '0', onclick: function () { self.allerA(r.id); }, onkeydown: function (e) { if (e.key === 'Enter') self.allerA(r.id); } }, [
        h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'start' } }, [h('div.t', { text: r.resume }), r.nbNouveaux ? h('span.rcv-nouv', { text: r.nbNouveaux + ' nouveau' + (r.nbNouveaux > 1 ? 'x' : '') }) : null]),
        r.texte ? h('div.q', { text: '« ' + r.texte + ' »' }) : null,
        h('div.doux', { text: r.nbResultats + ' véhicule' + (r.nbResultats > 1 ? 's' : '') + ' · lue ' + quand(r.luLe) + (r.etat === 'pause' ? ' · en pause' : '') + (r.mienne ? '' : ' · ' + (r.creeParNom || r.creePar)) }),
        r.erreur ? h('div.doux', { style: { color: 'var(--ambre)' }, text: r.erreur }) : null
      ]));
    });
    this.elCorps.appendChild(grille);
  };
  Vue.prototype.allerA = function (id) { location.hash = AMX.lien('rechercheVehicule', '', id ? { id: id } : {}); };

  /* --------- Créer une recherche --------- */
  Vue.prototype.carteCreer = function () {
    var self = this;
    var zone = h('textarea.saisie', { rows: '2', placeholder: 'Ex. : Corvette rouge 2020 moins de 50 000 km', 'aria-label': 'Le véhicule recherché' });
    var etat = h('div.doux'), crit = h('div');
    var btn = h('button.btn.primaire', { html: (I.recherche || '') + '<span>Chercher avec Einstein</span>' });
    var go = function () {
      var t = zone.value.trim(); if (t.length < 4) { zone.focus(); return; }
      btn.disabled = true; etat.textContent = 'Einstein lit votre demande…'; AMX.vider(crit);
      AMX.post({ action: 'rechercheVehiculeInterpreter', texte: t }, { delai: 60000 }).then(function (d) {
        d = AMX.verifier(d, 'Einstein n\'a pas compris'); btn.disabled = false; etat.textContent = '';
        if (!d.criteres) throw new Error('Le script n\'est pas à jour : redéployez-le (RechercheVehicule.gs).');
        crit.appendChild(self.editeurCriteres(d, t));
      }).catch(function (e) { btn.disabled = false; etat.textContent = AMX.erreurTexte(e); });
    };
    btn.onclick = go;
    zone.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } });
    var ex = ['Corvette rouge 2020 moins de 50 000 km', 'Sierra 1500 Denali 2022 et plus, noir, moins de 70 000 $', 'BMW X5 xDrive40i 2021-2023 moins de 60 000 km'];
    return h('div.carte', [h('div.rcv-creer', [
      h('label', { style: { fontWeight: 700 }, text: 'Quel véhicule cherchez-vous ?' }), zone,
      h('div.rcv-exemples', ex.map(function (x) { return h('button.btn.petit.fantome', { type: 'button', text: x, onclick: function () { zone.value = x; zone.focus(); } }); })),
      h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' } }, [btn, etat]),
      crit
    ])]);
  };
  Vue.prototype.editeurCriteres = function (d, texte, existante, apres) {
    var self = this, c = d.criteres || {};
    var ch = function (lib, el) { return h('div.champ', [h('label', lib), el]); };
    var t = function (v, ph) { return h('input.saisie', { type: 'text', value: v || '', placeholder: ph || '' }); };
    var n = function (v, ph) { return h('input.saisie', { type: 'number', value: v === null || v === undefined ? '' : v, placeholder: ph || '' }); };
    var f = { marques: t((c.marques || []).join(', '), 'Chevrolet'), modeles: t((c.modeles || []).join(', '), 'Corvette'), versions: t((c.versions || []).join(', '), 'Z06, 3LT…'),
      anneeMin: n(c.anneeMin, 'de'), anneeMax: n(c.anneeMax, 'à'), kmMax: n(c.kmMax, 'km max'), prixMin: n(c.prixMin, 'min $'), prixMax: n(c.prixMax, 'max $'),
      provinces: t((c.provinces || []).join(', '), 'QC, ON (vide = tout le Canada)') };
    var carr = h('select.saisie', CARROSSERIES.map(function (x) { return h('option', { value: x[0], text: x[1], selected: (c.carrosserie || '') === x[0] }); }));
    var mot = h('select.saisie', [['', 'Toutes'], ['int', 'Intégrale (AWD, 4x4)'], ['2rm', 'Deux roues motrices']].map(function (x) { return h('option', { value: x[0], text: x[1], selected: (c.motricite || '') === x[0] }); }));
    var carb = h('select.saisie', [['', 'Tous'], ['essence', 'Essence'], ['diesel', 'Diesel'], ['hybride', 'Hybride'], ['electrique', 'Électrique']].map(function (x) { return h('option', { value: x[0], text: x[1], selected: (c.carburant || '') === x[0] }); }));
    var etatSel = h('select.saisie', [['occasion', 'Occasion'], ['neuf', 'Neuf'], ['tous', 'Neuf ou occasion']].map(function (x) { return h('option', { value: x[0], text: x[1], selected: (c.etat || 'occasion') === x[0] }); }));
    var cases = {}, couleurs = h('div.rcv-couleurs', COULEURS.map(function (x) { var i = h('input', { type: 'checkbox', checked: (c.couleurs || []).indexOf(x[0]) >= 0 }); cases[x[0]] = i; return h('label', [i, h('span', { text: x[1] })]); }));
    var ca = h('input', { type: 'checkbox', checked: (c.pays || ['CA']).indexOf('CA') >= 0 }), us = h('input', { type: 'checkbox', checked: (c.pays || []).indexOf('US') >= 0 });
    var critLus = function () {
      return { marques: liste(f.marques.value), modeles: liste(f.modeles.value), versions: liste(f.versions.value), anneeMin: f.anneeMin.value, anneeMax: f.anneeMax.value, kmMax: f.kmMax.value,
        prixMin: f.prixMin.value, prixMax: f.prixMax.value, couleurs: COULEURS.map(function (x) { return x[0]; }).filter(function (k) { return cases[k].checked; }),
        carrosserie: carr.value || null, motricite: mot.value || null, carburant: carb.value || null, provinces: liste(f.provinces.value).map(function (p) { return p.toUpperCase(); }),
        pays: [ca.checked ? 'CA' : '', us.checked ? 'US' : ''].filter(Boolean), etat: etatSel.value, etats: c.etats || [], transmission: c.transmission || null };
    };
    var msg = h('div.doux');
    var btn = h('button.btn.primaire', { text: existante ? 'Enregistrer les critères' : 'Créer la recherche (relue chaque jour)', onclick: function () {
      var cr = critLus();
      if (!cr.marques.length && !cr.modeles.length) { msg.textContent = 'Il faut au moins une marque ou un modèle.'; return; }
      btn.disabled = true; msg.textContent = existante ? 'Enregistrement…' : 'Création et première lecture (environ 20 secondes)…';
      var corps = existante ? { action: 'rechercheVehiculeModifier', id: existante.id, criteres: cr } : { action: 'rechercheVehiculeCreer', texte: texte, criteres: cr, resume: d.comprise ? d.resume : '', compagnie: AMX.compagnieChoisie ? AMX.compagnieChoisie('inventaire') : '' };
      AMX.post(corps, { delai: 120000 }).then(function (r) {
        r = AMX.verifier(r, 'Impossible d\'enregistrer la recherche'); cache.quand = 0;
        if (existante) { if (apres) apres(); AMX.toast('Critères enregistrés : la recherche sera relue', 'ok'); return self.relire(existante.id, true); }
        AMX.toast(r.trouves + ' véhicule' + (r.trouves > 1 ? 's trouvés' : ' trouvé') + ' — la recherche sera relue chaque jour', 'ok');
        charger(true).then(function () { self.allerA(r.recherche.id); });
      }).catch(function (e) { btn.disabled = false; msg.textContent = AMX.erreurTexte(e); });
    } });
    return h('div', { style: { marginTop: '10px' } }, [
      d.resume ? h('div.rcv-resume', { text: (d.comprise === false ? 'À préciser : ' : '') + d.resume }) : null,
      (d.questions && d.questions.length) ? h('div.rcv-questions', d.questions.map(function (q) { return h('div', { text: q }); })) : null,
      h('div.rcv-crit', [ch('Marque(s)', f.marques), ch('Modèle(s)', f.modeles), ch('Version(s) (une suffit)', f.versions), ch('Année de', f.anneeMin), ch('Année à', f.anneeMax),
        ch('Km maximum', f.kmMax), ch('Prix minimum ($)', f.prixMin), ch('Prix maximum ($)', f.prixMax), ch('Carrosserie', carr), ch('Motricité', mot), ch('Carburant', carb), ch('Neuf ou occasion', etatSel), ch('Provinces', f.provinces),
        ch('Où chercher', h('div', { style: { display: 'flex', gap: '14px' } }, [h('label.case', [ca, h('span', 'Canada')]), h('label.case', [us, h('span', 'États-Unis')])]))]),
      h('div.champ', { style: { marginTop: '8px' } }, [h('label', 'Couleur (une suffit)'), couleurs]),
      h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', marginTop: '12px', flexWrap: 'wrap' } }, [btn, msg])
    ]);
  };

  /* --------- Une recherche et ses résultats --------- */
  Vue.prototype.ouvrir = function (id) {
    var self = this;
    AMX.get('recherchesVehicule=1&id=' + encodeURIComponent(id)).then(function (d) {
      d = AMX.verifier(d, 'Recherche introuvable'); if (self.id !== id) return;
      self.detail = d; self.rendre();
      var r = d.recherche;
      if (r && r.mienne && r.nbNouveaux) AMX.post({ action: 'rechercheVehiculeVu', id: id }).then(function () { cache.quand = 0; charger(true).catch(function () {}); }).catch(function () {});
    }).catch(function (e) { AMX.vider(self.elCorps); self.elCorps.appendChild(h('div.vide', [h('h3', 'Recherche introuvable'), h('div', { text: AMX.erreurTexte(e) })])); });
  };
  Vue.prototype.relire = function (id, force) {
    var self = this;
    AMX.toast('Lecture de la recherche…', 'info');
    return AMX.post({ action: 'rechercheVehiculeLancer', id: id }, { delai: 120000 }).then(function (r) {
      r = AMX.verifier(r, 'Lecture impossible'); AMX.toast(r.trouves + ' véhicule' + (r.trouves > 1 ? 's' : '') + (r.nouveaux ? ', dont ' + r.nouveaux + ' nouveau' + (r.nouveaux > 1 ? 'x' : '') : ''), 'ok');
      cache.quand = 0; self.ouvrir(id);
    }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), force ? 'info' : 'erreur'); if (force) self.ouvrir(id); });
  };
  Vue.prototype.vueDetail = function () {
    var self = this, d = this.detail, r = d.recherche, res = d.resultats || [];
    var nb = { nouveaux: 0, tous: 0, suivi: 0, ecarte: 0, parti: 0, nous: 0 };
    res.forEach(function (x) { if (x.statut === 'ecarte') nb.ecarte++; else if (x.parti) nb.parti++; else { nb.tous++; if (x.nouveau) nb.nouveaux++; if (x.statut === 'suivi') nb.suivi++; if (x.source === 'nous') nb.nous++; } });
    var garde = function (x) {
      if (self.filtre === 'ecarte') return x.statut === 'ecarte';
      if (self.filtre === 'parti') return x.parti && x.statut !== 'ecarte';
      if (x.statut === 'ecarte' || x.parti) return false;
      if (self.filtre === 'nouveaux') return x.nouveau;
      if (self.filtre === 'suivi') return x.statut === 'suivi';
      if (self.filtre === 'nous') return x.source === 'nous';
      return true;
    };
    var l = res.filter(garde).sort(function (a, b) { return (b.nouveau - a.nouveau) || ((b.statut === 'suivi') - (a.statut === 'suivi')) || ((a.source === 'nous') ? -1 : (b.source === 'nous') ? 1 : 0) || ((a.prix || 9e9) - (b.prix || 9e9)); });
    var pastille = function (id, lib, n) { return h('button.btn.petit' + (self.filtre === id ? '.primaire' : ''), { type: 'button', text: lib + ' (' + n + ')', onclick: function () { self.filtre = id; self.rendre(); } }); };
    var menu = AMX.menuActions ? AMX.menuActions([
      { texte: 'Relire maintenant', icone: I.rafraichir, action: function () { self.relire(r.id); } },
      r.mienne || d.direction ? { texte: 'Modifier les critères', icone: I.filtre, action: function () { self.modifier(); } } : null,
      r.mienne || d.direction ? { texte: r.etat === 'pause' ? 'Reprendre le suivi quotidien' : 'Mettre en pause', icone: I.info, action: function () { AMX.post({ action: 'rechercheVehiculeModifier', id: r.id, etat: r.etat === 'pause' ? 'active' : 'pause' }).then(function (x) { AMX.verifier(x, 'Impossible'); cache.quand = 0; self.ouvrir(r.id); }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); }); } } : null,
      r.mienne || d.direction ? { texte: 'Supprimer la recherche', icone: I.corbeille, action: function () { AMX.confirmer('Supprimer la recherche', 'Elle ne sera plus relue et disparaît de vos recherches.', { danger: true, ok: 'Supprimer' }).then(function (ok) { if (!ok) return; AMX.post({ action: 'rechercheVehiculeSupprimer', id: r.id }).then(function (x) { AMX.verifier(x, 'Impossible'); cache.quand = 0; charger(true).catch(function () {}); self.allerA(''); }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); }); }); } } : null
    ].filter(Boolean)) : null;
    var corps = h('div', [
      h('div', { style: { marginBottom: '8px' } }, [h('a', { href: AMX.lien('rechercheVehicule', '', {}), text: '‹ Toutes les recherches' })]),
      h('div.carte', [h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'start' } }, [
        h('div', [h('div.rcv-resume', { text: r.resume }), r.texte ? h('div.doux', { text: '« ' + r.texte + ' »' }) : null,
          h('div.doux', { text: 'Lue ' + quand(r.luLe) + (r.etat === 'pause' ? ' · en pause (plus relue chaque jour)' : ' · relue chaque jour') + (r.mienne ? '' : ' · ' + (r.creeParNom || r.creePar)) }),
          r.erreur ? h('div.doux', { style: { color: 'var(--ambre)' }, text: r.erreur }) : null]),
        menu ? (menu.el || menu) : null
      ])]),
      h('div.rcv-filtres', [pastille('tous', 'Tous', nb.tous), pastille('nouveaux', 'Nouveaux', nb.nouveaux), pastille('nous', 'Notre inventaire', nb.nous), pastille('suivi', 'Suivis', nb.suivi), pastille('parti', 'Plus en vente', nb.parti), pastille('ecarte', 'Écartés', nb.ecarte)])
    ]);
    var box = h('div.carte', { style: { padding: '0' } });
    if (!l.length) box.appendChild(h('div.vide', { style: { padding: '24px' } }, [h('div', self.filtre === 'tous' ? 'Rien trouvé pour l\'instant. La recherche sera relue chaque jour : les nouveautés paraîtront ici et sur l\'Accueil.' : 'Rien dans ce filtre.')]));
    l.forEach(function (x) { box.appendChild(self.ligne(r, x)); });
    corps.appendChild(box);
    return corps;
  };
  Vue.prototype.ligne = function (r, x) {
    var self = this, s = SOURCES[x.source] || [x.source || 'Annonce', 'gris'];
    var src = x.particulier ? (s[0] + ' · particulier') : s[0];
    var statut = function (st) { AMX.post({ action: 'rechercheVehiculeResultat', id: r.id, cle: x.cle, statut: st }).then(function (d) { AMX.verifier(d, 'Impossible'); x.statut = st; self.rendre(); }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); }); };
    var actions = [];
    if (x.lien) actions.push(h('a.btn.petit', { href: x.lien, target: '_blank', rel: 'noopener', text: 'Voir l\'annonce' }));
    if (x.vin) actions.push(h('a.btn.petit', { href: '#/outils/evaluation?vin=' + encodeURIComponent(x.vin) + (x.km ? '&km=' + Math.round(x.km) : ''), text: 'Évaluer' }));
    if (r.mienne || (this.detail && this.detail.direction)) {
      actions.push(h('button.btn.petit' + (x.statut === 'suivi' ? '.primaire' : ''), { type: 'button', text: x.statut === 'suivi' ? '★ Suivi' : '☆ Suivre', onclick: function () { statut(x.statut === 'suivi' ? '' : 'suivi'); } }));
      actions.push(h('button.btn.petit.fantome', { type: 'button', text: x.statut === 'ecarte' ? 'Remettre' : 'Écarter', onclick: function () { statut(x.statut === 'ecarte' ? '' : 'ecarte'); } }));
    }
    var img = x.photo ? h('img', { src: x.photo, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', onerror: function () { this.replaceWith(h('div.ph')); } }) : h('div.ph');
    return h('div.rcv-res' + (x.nouveau ? '.nouveau' : '') + (x.statut === 'ecarte' ? '.ecarte' : '') + (x.parti ? '.parti' : ''), [
      img,
      h('div', { style: { minWidth: 0 } }, [
        h('div.t', [x.nouveau ? h('span.rcv-nouv', { style: { marginRight: '6px' }, text: 'Nouveau' }) : null, h('span', { text: x.titre || x.vin || 'Véhicule' })]),
        h('div.s', [h('span.puce.' + s[1], { text: src }), h('span', { text: km(x.km) }), x.couleur ? h('span', { text: x.couleur }) : null, (x.ville || x.province) ? h('span', { text: [x.ville, x.province].filter(Boolean).join(', ') }) : null,
          x.vendeur && x.source !== 'nous' && !x.particulier ? h('span', { text: x.vendeur }) : null, x.source === 'nous' ? h('span', { text: x.vendeur }) : null]),
        h('div.s', [x.vin ? h('span.vin', { text: x.vin }) : null, (x.aVerifier || []).length ? h('span.puce.ambre', { text: 'À vérifier : ' + x.aVerifier.join(', ') }) : null,
          x.parti ? h('span.puce.gris', { text: 'Plus vu depuis le ' + AMX.fmtDate(x.dernierVuLe) }) : h('span.doux', { text: 'Trouvé le ' + AMX.fmtDate(x.premierVuLe) })])
      ]),
      h('div.droite', [h('div.prix', [h('span', { text: argent(x.prix) }), (x.prixAvant && x.prix && x.prixAvant > x.prix) ? h('span.avant', { text: '↓ ' + AMX.fmtArgent(x.prixAvant - x.prix) + ' (était ' + AMX.fmtArgent(x.prixAvant) + ')' }) : null]), h('div.act', actions)])
    ]);
  };
  Vue.prototype.modifier = function () {
    var self = this, r = this.detail.recherche;
    var m = null;
    m = AMX.modale({ titre: 'Critères de la recherche', large: true, proteger: false, corps: this.editeurCriteres({ criteres: r.criteres, resume: r.resume, comprise: true }, r.texte, r, function () { if (m) m.fermer(); }), boutons: [{ texte: 'Fermer' }] });
    return m;
  };

  AMX.section('rechercheVehicule', {
    titre: 'Recherche de véhicule', icone: 'recherche', ordre: 13,
    visible: function () { return peutVoir(); },
    monter: function (c, ctx) { return new Vue(c, ctx); }
  });
})();
