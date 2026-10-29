/* =====================================================================================================
   courtoisie.js — Service › Courtoisie : les véhicules de courtoisie (29 oct. 2026)

   Maxime : « dans l'onglet Service, ajoute une section pour les courtoisies, information puisée de LMB et du
   fichier de suivi des courtoisies (qui va être épuré) ; je vais vouloir un jour un suivi à la Kimoby ».
   - Données : GET ?courtoisie=1 (Courtoisie.gs) — une fiche par véhicule (fichier de suivi + LMB + neufs et
     registres), avec ses écarts et la règle de rotation (km et mois de service).
   - Règle v138 : filtres → « Chiffres et liste » → chiffres de la liste filtrée → liste.
   - Rien n'est écrit dans le fichier de courtoisie ni dans LMB : la page dit quoi corriger et où.
   ===================================================================================================== */
(function () {
  'use strict';
  var h = AMX.h;

  var CSS = [
    '.crt-vues { display: flex; gap: 6px; flex-wrap: wrap; margin: 0 0 10px; }',
    '.crt-vues button { border: 1px solid var(--ligne); background: var(--carte); border-radius: 999px; padding: 6px 13px; font-size: 13px; font-weight: 600; color: var(--encre-2); cursor: pointer; display: inline-flex; gap: 6px; align-items: center; }',
    '.crt-vues button.actif { background: var(--vert-fonce); border-color: var(--vert-fonce); color: #fff; }',
    '.crt-vues button .n { font-weight: 700; opacity: .8; font-variant-numeric: tabular-nums; }',
    '.crt-vues button.rouge:not(.actif) .n { color: var(--rouge); opacity: 1; }',
    '.crt-filtres { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 0 0 8px; }',
    '.crt-filtres .saisie.recherche { flex: 1 1 280px; max-width: 520px; }',
    '.crt-pastilles { display: flex; gap: 6px; flex-wrap: wrap; margin: 0 0 8px; }',
    '.crt-pastilles button { border: 1px solid var(--ligne); background: var(--carte); border-radius: 999px; padding: 4px 11px; font-size: 12.5px; cursor: pointer; color: var(--encre-2); }',
    '.crt-pastilles button.actif { background: var(--encre); border-color: var(--encre); color: #fff; }',
    '.crt-pastilles button.rouge { border-color: var(--rouge-bg); color: var(--rouge); } .crt-pastilles button.rouge.actif { background: var(--rouge); border-color: var(--rouge); color: #fff; }',
    '.crt-pastilles button.ambre { border-color: var(--ambre-bg); color: var(--ambre); } .crt-pastilles button.ambre.actif { background: var(--ambre); border-color: var(--ambre); color: #fff; }',
    '.crt-pastilles .l { font-size: 12px; color: var(--encre-3); align-self: center; margin-right: 2px; }',
    '.crt-cadre { overflow-x: auto; }',
    '.crt-table tbody tr { cursor: pointer; } .crt-table tbody tr:hover { background: var(--carte-2); }',
    '.crt-table td { vertical-align: top; }',
    '.crt-table td .s { display: block; color: var(--encre-3); font-size: 12px; }',
    '.crt-table td .mono { font-family: var(--mono); font-size: 12px; }',
    '.crt-table td.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }',
    '.crt-table tr.sorti td { color: var(--encre-3); }',
    '.crt-unite { font-weight: 800; white-space: nowrap; }',
    '.crt-puce { display: inline-block; border-radius: 999px; padding: 2px 8px; font-size: 12px; font-weight: 600; margin: 0 4px 3px 0; white-space: nowrap; }',
    '.crt-puce.rouge { background: var(--rouge-bg); color: var(--rouge); } .crt-puce.ambre { background: var(--ambre-bg); color: var(--ambre); }',
    '.crt-puce.mauve { background: #EEE8FB; color: #5B3FB0; } .crt-puce.ok { background: var(--vert-clair); color: var(--vert-fonce); } .crt-puce.gris { background: var(--gris-bg); color: var(--encre-3); }',
    '.crt-cat { font-size: 12px; font-weight: 700; padding: 2px 8px; border-radius: 6px; background: var(--gris-bg); color: var(--encre-2); white-space: nowrap; }',
    '.crt-cat.service { background: #E6F0FB; color: #1A64BF; } .crt-cat.carrosserie { background: #FDEBDC; color: #9A4A0B; } .crt-cat.vente { background: var(--vert-clair); color: var(--vert-fonce); } .crt-cat.pieces { background: #F2ECFB; color: #5B3FB0; }',
    '.crt-jauge { height: 5px; border-radius: 3px; background: var(--gris-bg); overflow: hidden; margin-top: 4px; min-width: 70px; } .crt-jauge i { display: block; height: 100%; background: var(--vert); }',
    '.crt-jauge i.ambre { background: var(--ambre); } .crt-jauge i.rouge { background: var(--rouge); }',
    '.crt-actions { margin: 0 0 12px; } .crt-actions ul { list-style: none; margin: 0; padding: 0; }',
    '.crt-actions li { display: flex; gap: 10px; align-items: flex-start; padding: 8px 0; border-bottom: 1px dashed var(--ligne); cursor: pointer; font-size: 13px; }',
    '.crt-actions li:last-child { border-bottom: none; } .crt-actions li:hover { background: var(--carte-2); }',
    '.crt-actions li .n { min-width: 30px; height: 24px; border-radius: 999px; display: inline-grid; place-items: center; font-weight: 800; font-size: 12.5px; padding: 0 8px; }',
    '.crt-actions li .n.rouge { background: var(--rouge-bg); color: var(--rouge); } .crt-actions li .n.ambre { background: var(--ambre-bg); color: var(--ambre); } .crt-actions li .n.mauve { background: #EEE8FB; color: #5B3FB0; }',
    '.crt-actions li b { display: block; } .crt-actions li span.q { color: var(--encre-3); font-size: 12.5px; }',
    '.crt-detail { display: grid; grid-template-columns: minmax(150px, 34%) 1fr; margin: 0 0 12px; }',
    '.crt-detail dt, .crt-detail dd { padding: 6px 8px; border-bottom: 1px solid var(--ligne); margin: 0; font-size: 13px; }',
    '.crt-detail dt { color: var(--encre-3); font-weight: 600; } .crt-detail dd { word-break: break-word; }',
    '.crt-h { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: .03em; color: var(--encre-2); margin: 14px 0 4px; }',
    '.crt-alerte { padding: 8px 12px; border-radius: 8px; margin: 0 0 6px; font-size: 13px; border-left: 4px solid; }',
    '.crt-alerte.rouge { background: var(--rouge-bg); border-color: var(--rouge); } .crt-alerte.ambre { background: var(--ambre-bg); border-color: var(--ambre); } .crt-alerte.mauve { background: #EEE8FB; border-color: #5B3FB0; }',
    '.crt-erreur { border-left: 4px solid var(--rouge); background: var(--rouge-bg); padding: 10px 12px; border-radius: 8px; margin: 0 0 10px; font-size: 13px; }',
    '.crt-vide { padding: 28px; text-align: center; color: var(--encre-3); }',
    '.crt-reglages .champ { margin-bottom: 10px; } .crt-reglages .ligne2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }',
    '.crt-fichiers li { display: flex; justify-content: space-between; gap: 10px; align-items: center; padding: 6px 0; border-bottom: 1px dashed var(--ligne); font-size: 13px; }'
  ].join('\n');
  function css() { if (!document.getElementById('css-courtoisie')) { var s = document.createElement('style'); s.id = 'css-courtoisie'; s.textContent = CSS; document.head.appendChild(s); } }

  /* ------------------------------------------------------------------------------- données */
  var cache = { rep: null, le: 0, enCours: null, copieLe: 0 };
  function charger(force) {
    if (cache.enCours && !force) return cache.enCours;
    var p = force ? { courtoisie: '1', frais: '1' } : { courtoisie: '1' };
    cache.enCours = AMX.get(p, { delai: 150000, secours: false, gz: true, copie: 'courtoisie' }).then(function (d) {
      cache.enCours = null;
      if (d && d.refuse) throw new Error(d.erreur || 'Réservé au service et à la direction.');
      if (!d || d.ok === false) throw new Error((d && d.erreur) || 'Lecture impossible.');
      if (!Array.isArray(d.vehicules)) throw new Error('Le script n\'est pas à jour — déployez la version qui contient Courtoisie.gs.');
      cache.rep = d; cache.le = Date.now(); cache.copieLe = 0;
      try { document.dispatchEvent(new CustomEvent('amx:courtoisie')); } catch (e) {}
      return d;
    }, function (e) { cache.enCours = null; throw e; });
    return cache.enCours;
  }
  var ROLES = ['proprietaire', 'admin', 'gestionnaire', 'direction_ventes', 'direction_service', 'service'];
  function peutVoir() {
    var p = (AMX.session && AMX.session.perms) || {}, role = p.role || (AMX.session && AMX.session.role) || '';
    return ROLES.indexOf(role) >= 0 || !!p.gererUtilisateurs;
  }

  var CATEGORIES = [['service', 'Service'], ['vente', 'Vente'], ['carrosserie', 'Carrosserie'], ['pieces', 'Pièces'], ['autre', 'Autre']];
  var NOM_CAT = {}; CATEGORIES.forEach(function (c) { NOM_CAT[c[0]] = c[1]; });
  /* Écarts : [code, libellé court, couleur, quoi faire]. L'ordre = l'ordre d'affichage. */
  var ECARTS = [
    ['aSortir', 'À sortir de la route', 'rouge', 'Le km ou les mois de service sont dépassés : planifier la sortie (retour à LMB ou revente).'],
    ['absentLmb', 'Absent de LMB', 'rouge', 'Le véhicule roule en courtoisie sans être loué à la concession chez LMB : le louer à LMB, ou le retirer de la courtoisie.'],
    ['venduEncoreAuFichier', 'Vendu, encore au fichier', 'rouge', 'LMB l\'a vendu : retirer la ligne du fichier de courtoisie.'],
    ['sortiEncoreLoue', 'Retiré mais encore loué', 'rouge', 'Le fichier dit qu\'il est sorti de la route, mais LMB le loue encore à la concession : faire le retour chez LMB.'],
    ['lmbSeulement', 'Chez LMB seulement', 'ambre', 'Loué à la concession chez LMB, mais pas au fichier de courtoisie : l\'ajouter au fichier, ou corriger LMB.'],
    ['floorPlanVide', 'Floor plan vide', 'ambre', 'La case FLOOR PLAN de LMB est vide : inscrire RENTAL.'],
    ['bientot', 'À sortir bientôt', 'ambre', 'Approche du km ou des mois maximum : prévoir le remplaçant.'],
    ['noteSortir', 'Note « à sortir »', 'ambre', 'Le fichier dit de le sortir : confirmer et planifier.'],
    ['introuvable', 'Introuvable', 'ambre', 'Retiré de la route, mais introuvable chez LMB (en cours ou vendus) : vérifier où il est.'],
    ['doublon', 'Inscrit deux fois', 'mauve', 'Le même NIV est sur deux lignes du fichier : garder la bonne ligne.']
  ];
  var ECART = {}; ECARTS.forEach(function (e) { ECART[e[0]] = e; });
  var A_REGLER = ['absentLmb', 'venduEncoreAuFichier', 'sortiEncoreLoue', 'lmbSeulement', 'floorPlanVide', 'introuvable', 'doublon'];

  function nomCie(c) { return (AMX.COMPAGNIES_TOUTES && AMX.COMPAGNIES_TOUTES[c]) || c || ''; }
  function pluriel(n, s, p) { return AMX.fmtNombre(n) + ' ' + (n > 1 ? (p || s + 's') : s); }
  function dateCourte(iso) { return iso ? AMX.fmtDateCourte(iso + 'T12:00:00') + ' ' + iso.slice(0, 4) : ''; }
  function aRegler(v) { return v.alertes.some(function (a) { return A_REGLER.indexOf(a.code) >= 0; }); }
  function aCode(v, code) { return v.alertes.some(function (a) { return a.code === code; }); }
  function champsRecherche(v) {
    return [v.unite, v.vin, v.plaque, v.vehicule, v.vehiculeFichier, v.chez, v.bt, v.stock, v.notes, v.raison, NOM_CAT[v.categorie], nomCie(v.compagnie),
      v.lmb && v.lmb.stock, v.lmb && v.lmb.note, v.lmb && v.lmb.loueA, v.vendu && v.vendu.stock, v.neuf && v.neuf.stock];
  }
  function compteur() {
    var rep = cache.rep; if (!rep) return '';
    var cie = AMX.compagnieChoisie ? AMX.compagnieChoisie('service') : '';
    var n = rep.vehicules.filter(function (v) { return (!cie || v.compagnie === cie) && (aCode(v, 'aSortir') || v.alertes.some(function (a) { return a.niveau === 'rouge'; })); }).length;
    return n || '';
  }

  AMX.section('courtoisie', {
    titre: 'Courtoisie', icone: 'service', ordre: 16,
    visible: function () { return peutVoir(); },
    monter: function (conteneur, ctx) { return new VueCourtoisie(conteneur, ctx); }
  });
  AMX.courtoisie = { charger: charger, enCache: function () { return cache.rep; }, compteur: compteur, vider: function () { cache = { rep: null, le: 0, enCours: null, copieLe: 0 }; } };

  /* ------------------------------------------------------------------------------------ page */
  function VueCourtoisie(conteneur, ctx) {
    css();
    var self = this, p = (ctx && ctx.params) || {};
    this.conteneur = conteneur; this.detruit = false;
    this.compagnie = AMX.compagnieChoisie ? AMX.compagnieChoisie('service') : '';
    this.vue = p.vue || 'service';
    this.q = p.q || ''; this.categorie = ''; this.ecart = p.ecart || '';
    AMX.vider(conteneur);
    this.btnRafraichir = h('button.btn', { type: 'button', text: 'Rafraîchir', onclick: function () { self.charger(true); } });
    this.btnExport = h('button.btn', { type: 'button', text: 'Exporter (Excel)', onclick: function () { self.exporter(); } });
    this.btnReglages = h('button.btn', { type: 'button', text: 'Réglages', onclick: function () { self.reglages(); } });
    this.btnFichier = h('button.btn.primaire', { type: 'button', text: 'Ouvrir le fichier de courtoisie', onclick: function () { var f = self.rep && self.rep.sources && self.rep.sources.fichiers[0]; if (f) window.open(f.lien, '_blank', 'noopener'); } });
    this.elSous = h('p');
    conteneur.appendChild(h('div.entete-page', [
      h('div', [h('h1', 'Courtoisie'), this.elSous]),
      h('div.actions', AMX.actionsEntete([this.btnRafraichir, this.btnExport, this.btnReglages, this.btnFichier], [this.btnFichier]))
    ]));
    this.elCies = h('div.barre-cies'); conteneur.appendChild(this.elCies);
    this.elVues = h('div.crt-vues'); conteneur.appendChild(this.elVues);
    this.inRecherche = h('input.saisie.recherche', { type: 'search', value: this.q, placeholder: 'Chercher : unité, NIV, plaque, modèle, client, no LOC…', autocomplete: 'off', 'aria-label': 'Chercher un véhicule de courtoisie' });
    conteneur.appendChild(h('div.crt-filtres', [this.inRecherche]));
    this.elCats = h('div.crt-pastilles'); conteneur.appendChild(this.elCats);
    this.elEcarts = h('div.crt-pastilles'); conteneur.appendChild(this.elEcarts);
    this.elPortee = h('div'); conteneur.appendChild(this.elPortee);
    this.elKpis = h('div.kpis'); conteneur.appendChild(this.elKpis);
    this.elCorps = h('div'); conteneur.appendChild(this.elCorps);
    var relancer = AMX.debounce(function () { self.q = self.inRecherche.value; self.rafraichir(); }, 160);
    this.inRecherche.addEventListener('input', relancer);
    this.inRecherche.addEventListener('keydown', function (e) { if (e.key === 'Escape') { self.inRecherche.value = ''; self.q = ''; self.rafraichir(); } });
    this.surCie = function (e) { self.compagnie = (e.detail && e.detail.compagnie) || ''; self.rendre(); };
    document.addEventListener('amx:compagnie', this.surCie);
    if (cache.rep) { this.rep = cache.rep; this.rendre(); }
    else {
      this.elCorps.appendChild(AMX.chargeur('Courtoisie'));
      if (AMX.cacheLocal && AMX.cacheLocal.lireGz) AMX.cacheLocal.lireGz('courtoisie', 7 * 864e5).then(function (o) { if (o && o.donnees && !self.rep && !self.detruit && Array.isArray(o.donnees.vehicules)) { self.rep = o.donnees; cache.copieLe = o.quand; self.rendre(); } }).catch(function () {});
    }
    this.charger(false);
  }
  VueCourtoisie.prototype.demonter = function () { this.detruit = true; document.removeEventListener('amx:compagnie', this.surCie); };
  VueCourtoisie.prototype.naviguer = function (ctx) {
    var p = (ctx && ctx.params) || {};
    if (p.vue && p.vue !== this.vue) { this.vue = p.vue; this.rendre(); }
  };
  VueCourtoisie.prototype.charger = function (force) {
    var self = this;
    if (force) this.elSous.textContent = 'Relecture de LMB et du fichier de courtoisie…';
    charger(force).then(function (d) {
      if (self.detruit) return;
      self.rep = d; self.erreur = ''; self.rendre(); AMX.rafraichirSousBarre && AMX.rafraichirSousBarre();
      if (force) AMX.toast('Courtoisie à jour', 'ok');
    }, function (e) {
      if (self.detruit) return;
      self.erreur = AMX.erreurTexte(e);
      if (self.rep) { self.rendre(); AMX.toast('Courtoisie : mise à jour impossible (copie du navigateur affichée)', 'attention'); return; }
      AMX.vider(self.elCorps); self.elCorps.appendChild(h('div.carte', [h('div.crt-vide', { text: self.erreur })]));
      self.elSous.textContent = '';
    });
  };

  /* Les véhicules de la concession choisie (portée déjà appliquée par le serveur). */
  VueCourtoisie.prototype.base = function () {
    var cie = this.compagnie;
    return (this.rep ? this.rep.vehicules : []).filter(function (v) { return !cie || v.compagnie === cie; });
  };
  VueCourtoisie.prototype.dansVue = function (v, vue) {
    vue = vue || this.vue;
    if (vue === 'service') return v.etat === 'service';
    if (vue === 'regler') return aRegler(v) || aCode(v, 'aSortir');
    if (vue === 'sortis') return v.etat === 'sorti';
    return true;
  };
  /* Tous les filtres sauf `sauf` (pour compter chaque pastille avec les autres filtres). */
  VueCourtoisie.prototype.filtrer = function (sauf) {
    var self = this;
    return this.base().filter(function (v) {
      if (sauf !== 'vue' && !self.dansVue(v)) return false;
      if (sauf !== 'categorie' && self.categorie && v.categorie !== self.categorie) return false;
      if (sauf !== 'ecart' && self.ecart && !aCode(v, self.ecart)) return false;
      if (self.q && !AMX.correspond(champsRecherche(v), self.q)) return false;
      return true;
    });
  };

  VueCourtoisie.prototype.rendre = function () {
    if (!this.rep || this.detruit) return;
    var self = this, rep = this.rep;
    var f = rep.sources && rep.sources.fichiers && rep.sources.fichiers[0];
    this.btnReglages.hidden = !rep.peutRegler && !rep.peutFichiers;
    this.btnFichier.hidden = !f;
    var lu = rep.luLe ? AMX.fmtDate(rep.luLe, true).replace(/^\S+\s/, '') : '';
    this.elSous.textContent = (cache.copieLe ? 'Copie du ' + AMX.copieTexte(cache.copieLe) + (this.erreur ? ' — mise à jour impossible : ' + this.erreur : ' — mise à jour en cours…') + ' · ' : '')
      + 'LMB et ' + ((rep.sources.fichiers || []).map(function (x) { return '« ' + x.nom + ' »'; }).join(', ') || 'le fichier de courtoisie') + (lu ? ' · lus à ' + lu : '');
    var base = this.rep.vehicules;
    AMX.barreConcessions(this.elCies, { domaine: 'service', valeur: this.compagnie,
      compte: function (c) { return base.filter(function (v) { return (!c || v.compagnie === c) && v.etat === 'service'; }).length; },
      onchange: function (c) { self.compagnie = c; self.rendre(); } });
    this.rendreVues();
    this.rafraichir();
  };
  VueCourtoisie.prototype.rendreVues = function () {
    var self = this, b = this.base();
    AMX.vider(this.elVues);
    [['service', 'En service'], ['regler', 'À régler'], ['sortis', 'Sortis de la route'], ['tous', 'Tous']].forEach(function (x) {
      var n = b.filter(function (v) { return self.dansVue(v, x[0]); }).length;
      self.elVues.appendChild(h('button' + (self.vue === x[0] ? '.actif' : '') + (x[0] === 'regler' && n ? '.rouge' : ''), { type: 'button', onclick: function () { self.vue = x[0]; self.ecart = ''; self.rendreVues(); self.rafraichir(); } },
        [x[1], h('span.n', { text: String(n) })]));
    });
  };
  VueCourtoisie.prototype.rafraichir = function () {
    if (!this.rep) return;
    var self = this;
    /* Catégories : comptées avec les autres filtres. */
    var pourCat = this.filtrer('categorie');
    AMX.vider(this.elCats);
    this.elCats.appendChild(h('span.l', { text: 'Utilisation' }));
    this.elCats.appendChild(h('button' + (!this.categorie ? '.actif' : ''), { type: 'button', text: 'Toutes · ' + pourCat.length, onclick: function () { self.categorie = ''; self.rafraichir(); } }));
    CATEGORIES.forEach(function (c) {
      var n = pourCat.filter(function (v) { return v.categorie === c[0]; }).length;
      if (!n && self.categorie !== c[0]) return;
      self.elCats.appendChild(h('button' + (self.categorie === c[0] ? '.actif' : ''), { type: 'button', text: c[1] + ' · ' + n, onclick: function () { self.categorie = self.categorie === c[0] ? '' : c[0]; self.rafraichir(); } }));
    });
    /* Écarts : seulement ceux qui existent. */
    var pourEc = this.filtrer('ecart');
    AMX.vider(this.elEcarts);
    var nEc = 0;
    ECARTS.forEach(function (e) {
      var n = pourEc.filter(function (v) { return aCode(v, e[0]); }).length;
      if (!n && self.ecart !== e[0]) return;
      if (!nEc) self.elEcarts.appendChild(h('span.l', { text: 'Écarts' }));
      nEc++;
      self.elEcarts.appendChild(h('button.' + (e[2] === 'mauve' ? 'ambre' : e[2]) + (self.ecart === e[0] ? '.actif' : ''), { type: 'button', text: e[1] + ' · ' + n, title: e[3], onclick: function () { self.ecart = self.ecart === e[0] ? '' : e[0]; self.rafraichir(); } }));
    });
    this.elEcarts.hidden = !nEc;
    var liste = this.filtrer();
    var filtres = [];
    if (this.categorie) filtres.push(NOM_CAT[this.categorie]);
    if (this.ecart) filtres.push(ECART[this.ecart][1]);
    if (this.q) filtres.push('« ' + this.q + ' »');
    var vueNom = { service: 'en service', regler: 'à régler', sortis: 'sortis de la route', tous: 'tous' }[this.vue];
    AMX.porteeChiffres(this.elPortee, { n: liste.length, unite: ['véhicule', 'véhicules'], contexte: [this.compagnie ? nomCie(this.compagnie) : 'toutes les concessions', vueNom], filtres: filtres,
      effacer: function () { self.categorie = ''; self.ecart = ''; self.q = ''; self.inRecherche.value = ''; self.rafraichir(); } });
    this.rendreKpis(liste);
    this.rendreListe(liste);
  };
  VueCourtoisie.prototype.rendreKpis = function (liste) {
    var self = this, P = this.rep.params || { kmMax: 12000, moisMax: 6 };
    AMX.vider(this.elKpis);
    var tuile = function (valeur, libelle, sous, cls, clic) {
      var el = h(clic ? 'button.kpi' : 'div.kpi' + (cls ? '' : ''), clic ? { type: 'button', onclick: clic } : {}, [h('div.valeur', { text: String(valeur) }), h('div.libelle', { text: libelle }), sous ? h('div.sous', { text: sous }) : null]);
      if (cls) el.classList.add(cls);
      return el;
    };
    var enService = liste.filter(function (v) { return v.etat === 'service'; });
    var aSortir = liste.filter(function (v) { return aCode(v, 'aSortir'); }).length, bientot = liste.filter(function (v) { return aCode(v, 'bientot'); }).length;
    var aReg = liste.filter(aRegler).length;
    var kms = enService.map(function (v) { return v.km; }).filter(function (k) { return typeof k === 'number' && k > 0; });
    var mois = enService.map(function (v) { return v.mois; }).filter(function (m) { return typeof m === 'number'; });
    var moy = function (l) { return l.length ? l.reduce(function (a, b) { return a + b; }, 0) / l.length : null; };
    this.elKpis.appendChild(tuile(liste.length, 'Véhicules', enService.length + ' en service', 'neutre'));
    this.elKpis.appendChild(tuile(aSortir, 'À sortir de la route', (bientot ? bientot + ' bientôt · ' : '') + 'max. ' + AMX.fmtNombre(P.kmMax) + ' km ou ' + P.moisMax + ' mois', aSortir ? 'alerte' : 'neutre',
      aSortir ? function () { self.ecart = 'aSortir'; self.rafraichir(); } : null));
    this.elKpis.appendChild(tuile(aReg, 'Écarts à régler', 'fichier de courtoisie et LMB', aReg ? 'attention' : 'neutre', aReg ? function () { self.vue = 'regler'; self.ecart = ''; self.rendreVues(); self.rafraichir(); } : null));
    var km = moy(kms), m = moy(mois);
    this.elKpis.appendChild(tuile(km === null ? '—' : AMX.fmtNombre(Math.round(km)) + ' km', 'Km moyen', kms.length ? 'sur ' + pluriel(kms.length, 'véhicule') + ' en service' : 'km pas inscrit au fichier', 'neutre'));
    this.elKpis.appendChild(tuile(m === null ? '—' : (Math.round(m * 10) / 10).toLocaleString('fr-CA') + ' mois', 'Âge moyen en service', mois.length ? 'depuis la mise en service' : 'date pas inscrite au fichier', 'neutre'));
  };
  VueCourtoisie.prototype.rendreListe = function (liste) {
    var self = this, P = this.rep.params || { kmMax: 12000, moisMax: 6 };
    AMX.vider(this.elCorps);
    var erreurs = [];
    ((this.rep.sources && this.rep.sources.fichiers) || []).forEach(function (f) { if (f.erreur) erreurs.push('Fichier « ' + (f.nom || f.id) + ' » : ' + f.erreur); });
    ((this.rep.sources && this.rep.sources.lmb && this.rep.sources.lmb.erreurs) || []).forEach(function (e) { erreurs.push('LMB — ' + e); });
    erreurs.forEach(function (e) { self.elCorps.appendChild(h('div.crt-erreur', { text: e })); });
    if (this.vue === 'regler' && !this.ecart) this.elCorps.appendChild(this.carteActions());
    if (!liste.length) { this.elCorps.appendChild(h('div.carte', [h('div.crt-vide', { text: this.base().length ? 'Aucun véhicule ne correspond à ces filtres.' : 'Aucun véhicule de courtoisie pour cette concession.' })])); return; }
    var tri = liste.slice().sort(function (a, b) {
      var ra = a.alertes.some(function (x) { return x.niveau === 'rouge'; }) ? 0 : (a.alertes.length ? 1 : 2), rb = b.alertes.some(function (x) { return x.niveau === 'rouge'; }) ? 0 : (b.alertes.length ? 1 : 2);
      if (ra !== rb) return ra - rb;
      return String(a.unite || 'zz').localeCompare(String(b.unite || 'zz'), 'fr', { numeric: true });
    });
    var tbody = h('tbody');
    tri.forEach(function (v) {
      var jaugeKm = typeof v.km === 'number' ? Math.min(100, Math.round(v.km / P.kmMax * 100)) : null;
      var clsJ = jaugeKm === null ? '' : (jaugeKm >= 100 ? 'rouge' : (v.km >= (P.kmAvertir || P.kmMax * 0.85) ? 'ambre' : ''));
      var puces = v.alertes.map(function (a) { var e = ECART[a.code]; return h('span.crt-puce.' + a.niveau, { text: e ? e[1] : a.code, title: a.texte }); });
      if (!puces.length) puces.push(h('span.crt-puce.' + (v.etat === 'sorti' ? 'gris' : 'ok'), { text: v.etat === 'sorti' ? 'Sorti · réglé' : (v.sansFichier ? 'Selon LMB' : 'Concorde') }));
      var lmb = v.lmb ? [h('span.mono', { text: v.lmb.stock }), h('span.s', { text: (v.lmb.type || 'floor plan vide') + (v.lmb.note ? ' · ' + v.lmb.note : '') })]
        : (v.vendu ? [h('span.mono', { text: v.vendu.stock }), h('span.s', { text: 'vendu' })] : [h('span.s', { text: '—' })]);
      var tr = h('tr' + (v.etat === 'sorti' ? '.sorti' : ''), { 'data-vin': v.cle }, [
        h('td', [h('span.crt-unite', { text: v.unite || '—' }), h('span.s', { text: nomCie(v.compagnie) })]),
        h('td', [h('b', { text: v.vehicule || v.vehiculeFichier || 'Véhicule' }), h('span.s.mono', { text: v.vin }), v.plaque ? h('span.s', { text: 'Plaque ' + v.plaque }) : null]),
        h('td', [h('span.crt-cat.' + v.categorie, { text: NOM_CAT[v.categorie] || v.categorie })]),
        h('td', [h('span', { text: v.chez || '—' }), v.bt ? h('span.s', { text: 'BT ' + v.bt }) : null]),
        h('td', [h('span', { text: v.miseService ? dateCourte(v.miseService) : (v.miseTexte || '—') }), typeof v.mois === 'number' ? h('span.s', { text: (Math.round(v.mois * 10) / 10).toLocaleString('fr-CA') + ' mois' }) : null]),
        h('td.num', [h('span', { text: typeof v.km === 'number' ? AMX.fmtNombre(v.km) : '—' }), jaugeKm === null ? null : h('div.crt-jauge', [h('i' + (clsJ ? '.' + clsJ : ''), { style: { width: jaugeKm + '%' } })])]),
        h('td', lmb),
        h('td', puces)
      ]);
      tr.addEventListener('click', function () { self.detail(v); });
      tbody.appendChild(tr);
    });
    this.elCorps.appendChild(h('div.carte', [h('div.crt-cadre', [h('table.tableau.crt-table', [
      h('thead', [h('tr', ['Unité', 'Véhicule', 'Utilisation', 'Chez / activité', 'En service depuis', 'Km', 'LMB', 'État'].map(function (t, i) { return h('th' + (i === 5 ? '.num' : ''), { text: t }); }))]),
      tbody])])]));
  };
  /* Vue « À régler » : un résumé par type d'écart, avec quoi faire. */
  VueCourtoisie.prototype.carteActions = function () {
    var self = this, b = this.filtrer('ecart'), ul = h('ul');
    ECARTS.forEach(function (e) {
      if (e[0] === 'bientot' || e[0] === 'noteSortir') return;
      var n = b.filter(function (v) { return aCode(v, e[0]); }).length;
      if (!n) return;
      var li = h('li', [h('span.n.' + e[2], { text: String(n) }), h('div', [h('b', { text: e[1] }), h('span.q', { text: e[3] })])]);
      li.addEventListener('click', function () { self.ecart = e[0]; self.rafraichir(); });
      ul.appendChild(li);
    });
    if (!ul.children.length) return h('div.carte.crt-actions', [h('div.crt-vide', { text: 'Rien à régler : le fichier de courtoisie et LMB concordent.' })]);
    return h('div.carte.crt-actions', [h('h2', 'Quoi faire'), ul]);
  };

  /* ------------------------------------------------------------------------------------ détail */
  VueCourtoisie.prototype.detail = function (v) {
    var dl = function (paires) {
      var el = h('dl.crt-detail');
      paires.forEach(function (p) { if (p[1] === '' || p[1] === null || p[1] === undefined) return; el.appendChild(h('dt', { text: p[0] })); el.appendChild(h('dd', { text: String(p[1]) })); });
      return el;
    };
    var corps = h('div');
    v.alertes.forEach(function (a) { corps.appendChild(h('div.crt-alerte.' + a.niveau, { text: a.texte })); });
    corps.appendChild(dl([['Véhicule', v.vehicule || v.vehiculeFichier], ['NIV', v.vin], ['Plaque', v.plaque], ['Concession', nomCie(v.compagnie)], ['Utilisation', NOM_CAT[v.categorie]]]));
    var lienLigne = '';
    if (v.fichier) {
      var fi = (this.rep.sources.fichiers || []).filter(function (x) { return x.id === v.fichier.id; })[0];
      lienLigne = (fi ? fi.lien : 'https://docs.google.com/spreadsheets/d/' + v.fichier.id + '/edit') + '#gid=' + v.fichier.gid + '&range=A' + v.fichier.ligne;
      corps.appendChild(h('div.crt-h', { text: 'Au fichier de courtoisie' }));
      corps.appendChild(dl([['Unité', v.unite], ['Onglet', v.fichier.onglet + ', ligne ' + v.fichier.ligne], ['Section', { service: 'Courtoisie service', vente: 'Courtoisie vente', carrosserie: 'VR carrosserie', sortie: 'Sortie de la route' }[v.fichier.section] || v.fichier.section],
        ['Chez / activité', v.chez], ['Bon de travail', v.bt], ['Départ', v.depart ? dateCourte(v.depart) : v.departTexte], ['Mise en service', v.miseService ? dateCourte(v.miseService) + (typeof v.mois === 'number' ? ' (' + (Math.round(v.mois * 10) / 10).toLocaleString('fr-CA') + ' mois)' : '') : v.miseTexte],
        ['Km', typeof v.km === 'number' ? AMX.fmtNombre(v.km) : ''], ['Stock', v.stock], ['Pneus', v.pneus], ['Raison', v.raison], ['Notes', v.notes],
        ['Lignes au fichier', v.fichierLignes > 1 ? v.fichierLignes : '']]));
    } else corps.appendChild(h('p.doux', { text: 'Pas au fichier de courtoisie.' }));
    corps.appendChild(h('div.crt-h', { text: 'Chez LMB' }));
    if (v.lmb) corps.appendChild(dl([['No LOC', v.lmb.stock], ['Modèle', v.lmb.modele], ['Loué à', v.lmb.loueA], ['Floor plan', v.lmb.type || 'vide'], ['Note', v.lmb.note], ['Contrat', v.lmb.contrat ? dateCourte(v.lmb.contrat) : ''], ['Punch', v.lmb.punch ? dateCourte(v.lmb.punch) : ''], ['Ligne', 'LOCATIONS 2026 EN COURS, ligne ' + v.lmb.ligne]]));
    else if (v.vendu) corps.appendChild(dl([['No LOC', v.vendu.stock], ['État', 'Vendu (onglet Vendus 2026, ligne ' + v.vendu.ligne + ')'], ['Retour', v.vendu.retour ? dateCourte(v.vendu.retour) : ''], ['Km au retour', v.vendu.kmRetour ? AMX.fmtNombre(v.vendu.kmRetour) : '']]));
    else corps.appendChild(h('p.doux', { text: 'Pas chez LMB (ni en cours ni vendu).' }));
    if (v.neuf || v.registre) {
      corps.appendChild(h('div.crt-h', { text: 'Ailleurs dans ScanAutomax' }));
      corps.appendChild(dl([['Neufs', v.neuf ? ((v.neuf.stock ? '#' + v.neuf.stock + ' · ' : '') + (v.neuf.statut || '') + (v.neuf.sorti ? ' · sorti' : '')) : ''], ['Registre', v.registre ? (v.registre.registre + (v.registre.stock ? ' #' + v.registre.stock : '') + ' · ' + v.registre.statut) : '']]));
    }
    var boutons = [{ texte: 'Fermer' }];
    if (lienLigne) boutons.push({ texte: 'Ouvrir la ligne du fichier', classe: 'primaire', action: function () { window.open(lienLigne, '_blank', 'noopener'); return false; } });
    AMX.modale({ titre: (v.unite ? v.unite + ' · ' : '') + (v.vehicule || v.vehiculeFichier || v.vin), corps: corps, large: true, proteger: false, boutons: boutons });
  };

  /* ------------------------------------------------------------------------------------ réglages */
  VueCourtoisie.prototype.reglages = function () {
    var self = this, rep = this.rep || {}, P = rep.params || {};
    var champ = function (lib, val, aide) { var i = h('input.saisie', { type: 'number', min: '1', value: String(val || '') }); return { i: i, el: h('label.champ', [h('span', { text: lib }), i, aide ? h('span.aide', { text: aide }) : null]) }; };
    var kmMax = champ('Sortir à (km)', P.kmMax), kmAv = champ('Avertir à partir de (km)', P.kmAvertir), moisMax = champ('Sortir après (mois de service)', P.moisMax), jAv = champ('Avertir avant la fin (jours)', P.joursAvertir);
    var corps = h('div.crt-reglages');
    if (rep.peutRegler) {
      [kmMax, kmAv, moisMax, jAv].forEach(function (c) { if (!rep.peutRegler) c.i.disabled = true; });
      corps.appendChild(h('div.crt-h', { text: 'Rotation des véhicules' }));
      corps.appendChild(h('div.ligne2', [kmMax.el, moisMax.el]));
      corps.appendChild(h('div.ligne2', [kmAv.el, jAv.el]));
    }
    if (rep.peutFichiers) {
      corps.appendChild(h('div.crt-h', { text: 'Fichiers de courtoisie lus' }));
      var ul = h('ul.crt-fichiers', { style: { listStyle: 'none', margin: 0, padding: 0 } });
      (rep.sources.fichiers || []).forEach(function (f) {
        ul.appendChild(h('li', [h('span', [h('b', { text: f.nom || f.id }), h('span.doux', { text: ' · ' + nomCie(f.compagnie) + ' · ' + pluriel(f.vehicules || 0, 'véhicule') + (f.erreur ? ' · ' + f.erreur : '') })]),
          (rep.sources.fichiers.length > 1) ? h('button.btn.petit', { type: 'button', text: 'Retirer', onclick: function () { self.fichiers({ op: 'retirer', id: f.id }); } }) : null]));
      });
      corps.appendChild(ul);
      var inLien = h('input.saisie', { type: 'url', placeholder: 'Lien d\'un autre classeur Google (ex. le fichier épuré)' });
      var selCie = h('select.saisie', Object.keys(AMX.COMPAGNIES_TOUTES || {}).map(function (c) { return h('option', { value: c, text: AMX.COMPAGNIES_TOUTES[c] }); }));
      corps.appendChild(h('div.ligne2', [h('label.champ', [h('span', { text: 'Ajouter un fichier' }), inLien]), h('label.champ', [h('span', { text: 'Concession par défaut' }), selCie])]));
      corps.appendChild(h('button.btn', { type: 'button', text: 'Ajouter ce fichier', onclick: function () { if (inLien.value.trim()) self.fichiers({ op: 'ajouter', lien: inLien.value.trim(), compagnie: selCie.value }); } }));
      corps.appendChild(h('p.doux.petit', { text: 'Le classeur doit être partagé en lecture avec le compte du script. Chaque onglet est lu ; les colonnes sont reconnues par leur titre (NIV ou # SÉRIE, VÉHICULE, PLAQUE, KM, MISE EN SERVICE…).' }));
    }
    var boutons = [{ texte: 'Fermer' }];
    if (rep.peutRegler) boutons.push({ texte: 'Enregistrer', classe: 'primaire', action: function () {
      return AMX.post({ action: 'courtoisieParams', kmMax: kmMax.i.value, kmAvertir: kmAv.i.value, moisMax: moisMax.i.value, joursAvertir: jAv.i.value }, { delai: 30000 }).then(function (d) {
        if (!d || d.refuse || d.ok === false) throw new Error((d && d.erreur) || 'Refusé.');
        AMX.toast('Réglages enregistrés', 'ok'); self.charger(true); return true;
      }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); return false; });
    } });
    AMX.modale({ titre: 'Réglages de la courtoisie', corps: corps, boutons: boutons });
  };
  VueCourtoisie.prototype.fichiers = function (corps) {
    var self = this;
    corps.action = 'courtoisieFichiers';
    AMX.post(corps, { delai: 30000 }).then(function (d) {
      if (!d || d.refuse || d.ok === false) throw new Error((d && d.erreur) || 'Refusé.');
      AMX.toast(corps.op === 'ajouter' ? 'Fichier ajouté : relecture…' : 'Fichier retiré', 'ok');
      document.querySelectorAll('.voile').forEach(function (v) { v.remove(); });
      self.charger(true);
    }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); });
  };

  /* ------------------------------------------------------------------------------------ export */
  VueCourtoisie.prototype.exporter = function () {
    var liste = this.filtrer();
    if (!liste.length) { AMX.toast('Rien à exporter.', 'attention'); return; }
    if (typeof XLSX === 'undefined') { AMX.toast('Excel indisponible dans ce navigateur.', 'erreur'); return; }
    var lignes = [['Concession', 'Unité', 'Véhicule', 'NIV', 'Plaque', 'Utilisation', 'État', 'Chez / activité', 'BT', 'Mise en service', 'Mois', 'Km', 'No LOC (LMB)', 'Floor plan', 'Note LMB', 'Écarts', 'Onglet du fichier', 'Ligne']];
    liste.forEach(function (v) {
      lignes.push([nomCie(v.compagnie), v.unite, v.vehicule || v.vehiculeFichier, v.vin, v.plaque, NOM_CAT[v.categorie] || v.categorie, v.etat === 'sorti' ? 'Sorti' : 'En service', v.chez, v.bt, v.miseService || v.miseTexte,
        typeof v.mois === 'number' ? Math.round(v.mois * 10) / 10 : '', typeof v.km === 'number' ? v.km : '', v.lmb ? v.lmb.stock : (v.vendu ? v.vendu.stock + ' (vendu)' : ''), v.lmb ? (v.lmb.type || 'vide') : '', v.lmb ? v.lmb.note : '',
        v.alertes.map(function (a) { return a.texte; }).join(' | '), v.fichier ? v.fichier.onglet : '', v.fichier ? v.fichier.ligne : '']);
    });
    var wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet(lignes);
    ws['!cols'] = lignes[0].map(function (e, i) { return { wch: Math.min(48, Math.max(10, lignes.reduce(function (m, r) { return Math.max(m, String(r[i] || '').length); }, 0) + 2)) }; });
    XLSX.utils.book_append_sheet(wb, ws, 'Courtoisie');
    XLSX.writeFile(wb, 'courtoisie-' + new Date().toISOString().slice(0, 10) + '.xlsx');
    AMX.toast(pluriel(liste.length, 'véhicule') + ' exporté' + (liste.length > 1 ? 's' : ''), 'ok');
  };
})();
