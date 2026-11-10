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
    '.crt-cat.service { background: #E6F0FB; color: #1A64BF; } .crt-cat.carrosserie { background: #FDEBDC; color: #9A4A0B; } .crt-cat.vente { background: var(--vert-clair); color: var(--vert-fonce); } .crt-cat.pieces { background: #F2ECFB; color: #5B3FB0; } .crt-cat.demo { background: #FFF1D6; color: #8A5300; }',
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
    '.crt-fichiers li { display: flex; justify-content: space-between; gap: 10px; align-items: center; padding: 6px 0; border-bottom: 1px dashed var(--ligne); font-size: 13px; }',
    '.crt-auto { display: inline-block; margin-left: 4px; padding: 0 5px; border-radius: 4px; font-size: 11px; font-weight: 700; background: #E6F0FB; color: #1A64BF; vertical-align: 1px; }',
    '.crt-tele-etat { font-size: 13px; padding: 8px 12px; border-radius: 8px; background: var(--carte-2); margin: 0 0 10px; }',
    '.crt-tele-etat.ok { background: var(--vert-clair); } .crt-tele-etat.erreur { background: var(--rouge-bg); }',
    '.crt-reglages .case { display: flex; gap: 8px; align-items: flex-start; margin: 0 0 8px; font-size: 13px; } .crt-reglages .case input { margin-top: 3px; }',
    '.crt-tele-boutons { display: flex; gap: 8px; flex-wrap: wrap; margin: 4px 0 6px; }',
    /* 10 nov. : page plus simple — accueil à grosses tuiles, listes avec « Retour », groupes « À régler » / « À sortir » */
    '.crt-recherche { margin: 0 0 14px; } .crt-recherche .saisie.recherche { width: 100%; max-width: 640px; height: 44px; font-size: 15px; }',
    '.crt-page .amx-retour { margin: 0 0 8px; }',
    '.crt-select { max-width: 260px; }',
    '.crt-groupe { margin: 0 0 16px; } .crt-groupe .carte { margin-top: 6px; }',
    '.crt-groupe-tete { display: flex; gap: 12px; align-items: flex-start; padding: 10px 12px; border-radius: 10px; background: var(--carte-2); border-left: 4px solid var(--ligne); }',
    '.crt-groupe.rouge .crt-groupe-tete { background: var(--rouge-bg); border-color: var(--rouge); } .crt-groupe.ambre .crt-groupe-tete { background: var(--ambre-bg); border-color: var(--ambre); } .crt-groupe.mauve .crt-groupe-tete { background: #EEE8FB; border-color: #5B3FB0; }',
    '.crt-groupe-tete .n { min-width: 34px; height: 30px; border-radius: 999px; display: inline-grid; place-items: center; font-weight: 800; font-size: 14px; background: var(--carte); padding: 0 9px; }',
    '.crt-groupe-tete h3 { margin: 2px 0 2px; font-size: 15px; } .crt-groupe-tete p { margin: 0; font-size: 13px; color: var(--encre-2); }',
    '.crt-table td .crt-unite { white-space: normal; } .crt-table tbody tr:focus { outline: 2px solid var(--vert); outline-offset: -2px; }',
    '.crt-table td:first-child { min-width: 210px; } .crt-filtres .saisie.recherche { flex: 1 1 240px; }',
    '@media (max-width: 640px) { .crt-table th:nth-child(3), .crt-table td:nth-child(3) { display: none; } .crt-select { max-width: none; flex: 1 1 100%; } }'
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

  var CATEGORIES = [['service', 'Service'], ['vente', 'Vente'], ['demo', 'Démo'], ['carrosserie', 'Carrosserie'], ['pieces', 'Pièces'], ['autre', 'Autre']];
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
  /* 10 nov. (Maxime : « rends le module de courtoisie plus convivial et plus facile à utiliser, il y a plein de petites
     tuiles partout et pour revenir au menu principal de la page il faut effacer les filtres ») :
     - l'accueil de la page = une recherche et quatre grosses tuiles (En service, À sortir de la route, À régler, Sortis) ;
     - une tuile ouvre SA liste, avec « ‹ Retour à Courtoisie » en haut (ou Échap, ou le bouton Précédent du navigateur) ;
     - plus de rangées de pastilles ni de petites tuiles de chiffres : dans une liste, une recherche et un menu « Utilisation » ;
     - « À régler » est rangé par problème (avec quoi faire), « À sortir » en deux groupes (maintenant, bientôt). */
  var VUES = {
    service: { titre: 'En service', desc: 'Les véhicules de courtoisie sur la route.' },
    sortir: { titre: 'À sortir de la route', desc: 'Km ou mois de service dépassés, ou bientôt.' },
    regler: { titre: 'À régler', desc: 'Le fichier de courtoisie et LMB ne disent pas la même chose : voici quoi corriger, problème par problème.' },
    sortis: { titre: 'Sortis de la route', desc: 'Les véhicules retirés de la courtoisie.' }
  };
  var CODES_SORTIR = ['aSortir', 'bientot', 'noteSortir'];
  /* La liste ouverte se lit dans ?voir= (le paramètre « vue » est réservé par la tuile du site). */
  function vueDe(p) {
    var x = p.voir || p.vue;
    if (VUES[x]) return x;
    if (x === 'tous') return 'accueil';
    if (p.ecart) return CODES_SORTIR.indexOf(p.ecart) >= 0 ? 'sortir' : 'regler';   /* anciens liens (?ecart=) */
    return 'accueil';
  }
  /* Le problème principal d'un véhicule à régler : le premier de ECARTS (les plus graves d'abord). */
  function ecartPrincipal(v) {
    for (var i = 0; i < ECARTS.length; i++) if (A_REGLER.indexOf(ECARTS[i][0]) >= 0 && aCode(v, ECARTS[i][0])) return ECARTS[i][0];
    return '';
  }

  function VueCourtoisie(conteneur, ctx) {
    css();
    var self = this, p = (ctx && ctx.params) || {};
    this.conteneur = conteneur; this.detruit = false;
    this.compagnie = AMX.compagnieChoisie ? AMX.compagnieChoisie('service') : '';
    this.vue = vueDe(p);
    this.q = p.q || ''; this.categorie = '';
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
    this.elCorps = h('div.crt-page'); conteneur.appendChild(this.elCorps);
    this.surCie = function (e) { self.compagnie = (e.detail && e.detail.compagnie) || ''; self.categorie = ''; self.rendre(); if (!self.detruit && AMX.gesteMenuRecent()) self.charger(); };
    document.addEventListener('amx:compagnie', this.surCie);
    /* Échap dans une liste = retour à l'accueil de la page (pas pendant une fenêtre ou une saisie). */
    this.surTouche = function (e) {
      if (e.key !== 'Escape' || self.vue === 'accueil' || self.detruit) return;
      if (document.querySelector('.voile')) return;
      var t = e.target; if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
      self.aller('accueil');
    };
    document.addEventListener('keydown', this.surTouche);
    if (cache.rep) { this.rep = cache.rep; this.rendre(); }
    else {
      this.elCorps.appendChild(AMX.chargeur('Courtoisie'));
      if (AMX.cacheLocal && AMX.cacheLocal.lireGz) AMX.cacheLocal.lireGz('courtoisie', 7 * 864e5).then(function (o) { if (o && o.donnees && !self.rep && !self.detruit && Array.isArray(o.donnees.vehicules)) { self.rep = o.donnees; cache.copieLe = o.quand; self.rendre(); } }).catch(function () {});
    }
    this.charger(false);
  }
  VueCourtoisie.prototype.demonter = function () { this.detruit = true; document.removeEventListener('amx:compagnie', this.surCie); document.removeEventListener('keydown', this.surTouche); };
  VueCourtoisie.prototype.naviguer = function (ctx) {
    var v = vueDe((ctx && ctx.params) || {});
    if (v !== this.vue) { this.vue = v; this.q = ''; this.categorie = ''; this.rendre(); window.scrollTo(0, 0); }
  };
  /* Changer de liste passe par l'adresse : le bouton Précédent du navigateur ramène à l'accueil de la page. */
  VueCourtoisie.prototype.aller = function (vue) {
    var base = String(location.hash || '#/service/courtoisie').split('?')[0];
    var cible = base + (vue && vue !== 'accueil' ? '?voir=' + vue : '');
    if (location.hash === cible) { this.naviguer({ params: { voir: vue } }); return; }
    location.hash = cible;
    /* au cas où le routeur ne rappelle pas naviguer pour un simple changement de paramètre */
    var self = this; setTimeout(function () { if (!self.detruit && self.vue !== (vue || 'accueil')) self.naviguer({ params: { voir: vue } }); }, 60);
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
    if (vue === 'sortir') return v.etat === 'service' && CODES_SORTIR.some(function (c) { return aCode(v, c); });
    if (vue === 'regler') return aRegler(v);
    if (vue === 'sortis') return v.etat === 'sorti';
    return true;
  };
  /* La liste ouverte : la vue, l'utilisation choisie et la recherche. */
  VueCourtoisie.prototype.filtrer = function (sansCategorie) {
    var self = this;
    return this.base().filter(function (v) {
      if (self.vue !== 'accueil' && !self.dansVue(v)) return false;
      if (!sansCategorie && self.categorie && v.categorie !== self.categorie) return false;
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
      onchange: function (c) { self.compagnie = c; self.categorie = ''; self.rendre(); } });
    AMX.vider(this.elCorps);
    var erreurs = [];
    ((rep.sources && rep.sources.fichiers) || []).forEach(function (x) { if (x.erreur) erreurs.push('Fichier « ' + (x.nom || x.id) + ' » : ' + x.erreur); });
    ((rep.sources && rep.sources.lmb && rep.sources.lmb.erreurs) || []).forEach(function (e) { erreurs.push('LMB — ' + e); });
    erreurs.forEach(function (e) { self.elCorps.appendChild(h('div.crt-erreur', { text: e })); });
    if (this.vue === 'accueil') this.rendreAccueil(); else this.rendreVue();
  };

  /* ------------------------------------------------------------------- accueil de la page */
  VueCourtoisie.prototype.rendreAccueil = function () {
    var self = this, P = this.rep.params || { kmMax: 12000, moisMax: 6 }, b = this.base();
    var n = function (vue) { return b.filter(function (v) { return self.dansVue(v, vue); }).length; };
    var enService = b.filter(function (v) { return v.etat === 'service'; });
    var maintenant = enService.filter(function (v) { return aCode(v, 'aSortir'); }).length, bientot = n('sortir') - maintenant;
    var kms = enService.map(function (v) { return v.km; }).filter(function (k) { return typeof k === 'number' && k > 0; });
    var mois = enService.map(function (v) { return v.mois; }).filter(function (m) { return typeof m === 'number'; });
    var moy = function (l) { return l.length ? l.reduce(function (x, y) { return x + y; }, 0) / l.length : null; };
    var km = moy(kms), m = moy(mois), nReg = n('regler'), nSortis = n('sortis');
    /* La recherche : toute la flotte de la concession, résultats tout de suite sous la boîte. */
    var boite = h('input.saisie.recherche', { type: 'search', value: this.q, placeholder: 'Chercher un véhicule : unité, NIV, plaque, modèle, client, no LOC…', autocomplete: 'off', 'aria-label': 'Chercher un véhicule de courtoisie' });
    var resultats = h('div');
    var tuiles = AMX.tuilesSujets([
      { titre: 'En service', n: enService.length, icone: 'voiture', couleur: 'vert', onclick: function () { self.aller('service'); },
        desc: enService.length ? [km === null ? '' : 'Km moyen ' + AMX.fmtNombre(Math.round(km)), m === null ? '' : 'âge moyen ' + (Math.round(m * 10) / 10).toLocaleString('fr-CA') + ' mois'].filter(Boolean).join(' · ') || 'Les véhicules sur la route.' : 'Aucun véhicule en service.' },
      { titre: 'À sortir de la route', n: maintenant, icone: 'alerte', couleur: maintenant ? 'rouge' : (bientot ? 'ambre' : 'gris'), onclick: function () { self.aller('sortir'); },
        desc: 'Plus de ' + AMX.fmtNombre(P.kmMax) + ' km ou ' + P.moisMax + ' mois de service' + (bientot ? ' · ' + bientot + ' bientôt' : '') + '.' },
      { titre: 'À régler', n: nReg, icone: 'info', couleur: nReg ? 'ambre' : 'gris', onclick: function () { self.aller('regler'); },
        desc: nReg ? 'Le fichier de courtoisie et LMB ne concordent pas : quoi corriger.' : 'Rien à régler : le fichier et LMB concordent.' },
      { titre: 'Sortis de la route', n: nSortis, icone: 'ok', couleur: 'gris', onclick: function () { self.aller('sortis'); }, desc: 'Les véhicules retirés de la courtoisie.' }
    ]);
    var dessiner = function () {
      AMX.vider(resultats);
      tuiles.hidden = !!self.q;
      if (!self.q) return;
      var l = self.filtrer();
      resultats.appendChild(AMX.teteSujet(pluriel(l.length, 'véhicule') + ' pour « ' + self.q + ' »', 'En service et sortis de la route. Échap efface la recherche.'));
      resultats.appendChild(l.length ? self.tableVehicules(l) : h('div.carte', [h('div.crt-vide', { text: 'Aucun véhicule de courtoisie ne correspond.' })]));
    };
    var relancer = AMX.debounce(function () { self.q = boite.value.trim(); dessiner(); }, 160);
    boite.addEventListener('input', relancer);
    boite.addEventListener('keydown', function (e) { if (e.key === 'Escape') { boite.value = ''; self.q = ''; dessiner(); } });
    this.elCorps.appendChild(h('div.crt-recherche', [boite]));
    this.elCorps.appendChild(tuiles);
    this.elCorps.appendChild(resultats);
    dessiner();
  };

  /* ------------------------------------------------------------------- une liste */
  VueCourtoisie.prototype.rendreVue = function () {
    var self = this, def = VUES[this.vue], P = this.rep.params || { kmMax: 12000, moisMax: 6 };
    var desc = this.vue === 'sortir' ? 'Plus de ' + AMX.fmtNombre(P.kmMax) + ' km ou ' + P.moisMax + ' mois de service (Réglages), ou bientôt.' : def.desc;
    this.elCorps.appendChild(AMX.retourSujets('Retour à Courtoisie', function () { self.aller('accueil'); }));
    var elTete = h('div');
    this.elCorps.appendChild(elTete);
    /* Une recherche, et un menu « Utilisation » seulement quand la liste en a plusieurs. */
    var boite = h('input.saisie.recherche', { type: 'search', value: this.q, placeholder: 'Chercher dans cette liste…', autocomplete: 'off', 'aria-label': 'Chercher dans la liste' });
    var cats = {};
    this.filtrer(true).forEach(function (v) { cats[v.categorie] = (cats[v.categorie] || 0) + 1; });
    var sel = null;
    if (Object.keys(cats).length > 1 || this.categorie) {
      sel = h('select.saisie.crt-select', { 'aria-label': 'Utilisation' }, [h('option', { value: '', text: 'Toutes les utilisations' })].concat(CATEGORIES.filter(function (c) { return cats[c[0]] || self.categorie === c[0]; }).map(function (c) {
        return h('option', { value: c[0], selected: self.categorie === c[0] ? 'selected' : null, text: c[1] + ' (' + (cats[c[0]] || 0) + ')' });
      })));
      sel.addEventListener('change', function () { self.categorie = sel.value; dessiner(); });
    }
    this.elCorps.appendChild(h('div.crt-filtres', [boite, sel]));
    var elListe = h('div');
    this.elCorps.appendChild(elListe);
    var dessiner = function () {
      var liste = self.filtrer();
      AMX.vider(elTete);
      var filtre = [self.categorie ? NOM_CAT[self.categorie] : '', self.q ? '« ' + self.q + ' »' : ''].filter(Boolean).join(' · ');
      elTete.appendChild(AMX.teteSujet(def.titre + ' · ' + liste.length, desc + (self.compagnie ? '' : ' Toutes les concessions.') + (filtre ? ' Filtre : ' + filtre + '.' : '')));
      AMX.vider(elListe);
      if (!liste.length) { elListe.appendChild(h('div.carte', [h('div.crt-vide', { text: self.q || self.categorie ? 'Aucun véhicule ne correspond.' : (self.vue === 'regler' ? 'Rien à régler : le fichier de courtoisie et LMB concordent.' : (self.vue === 'sortir' ? 'Aucun véhicule à sortir de la route.' : 'Aucun véhicule.')) })])); return; }
      if (self.vue === 'regler') self.rendreRegler(elListe, liste);
      else if (self.vue === 'sortir') self.rendreSortir(elListe, liste);
      else elListe.appendChild(self.tableVehicules(liste));
    };
    var relancer = AMX.debounce(function () { self.q = boite.value.trim(); dessiner(); }, 160);
    boite.addEventListener('input', relancer);
    boite.addEventListener('keydown', function (e) { if (e.key === 'Escape') { if (boite.value) { boite.value = ''; self.q = ''; dessiner(); } else self.aller('accueil'); } });
    dessiner();
  };
  /* « À régler » : un groupe par problème (le plus grave du véhicule), avec quoi faire. */
  VueCourtoisie.prototype.rendreRegler = function (el, liste) {
    var self = this, groupes = {};
    liste.forEach(function (v) { var c = ecartPrincipal(v); (groupes[c] = groupes[c] || []).push(v); });
    ECARTS.forEach(function (e) {
      var l = groupes[e[0]]; if (!l || !l.length) return;
      el.appendChild(h('section.crt-groupe.' + e[2], [
        h('div.crt-groupe-tete', [h('span.n', { text: String(l.length) }), h('div', [h('h3', { text: e[1] }), h('p', { text: e[3] })])]),
        self.tableVehicules(l)
      ]));
    });
  };
  /* « À sortir » : maintenant, puis bientôt ; les plus vieux en premier. */
  VueCourtoisie.prototype.rendreSortir = function (el, liste) {
    var self = this, P = this.rep.params || { kmMax: 12000, moisMax: 6 };
    var cle = function (v) { return Math.max((typeof v.km === 'number' ? v.km / P.kmMax : 0), (typeof v.mois === 'number' ? v.mois / P.moisMax : 0)); };
    var tri = function (l) { return l.slice().sort(function (a, b) { return cle(b) - cle(a); }); };
    var maintenant = liste.filter(function (v) { return aCode(v, 'aSortir'); }), bientot = liste.filter(function (v) { return !aCode(v, 'aSortir'); });
    [['Maintenant', maintenant, 'rouge', 'Le km ou les mois de service sont dépassés : planifier la sortie (retour à LMB ou revente).'],
      ['Bientôt', bientot, 'ambre', 'Approche du maximum, ou le fichier dit de le sortir : prévoir le remplaçant.']].forEach(function (g) {
      if (!g[1].length) return;
      el.appendChild(h('section.crt-groupe.' + g[2], [
        h('div.crt-groupe-tete', [h('span.n', { text: String(g[1].length) }), h('div', [h('h3', { text: g[0] }), h('p', { text: g[3] })])]),
        self.tableVehicules(tri(g[1]))
      ]));
    });
  };
  /* Le tableau des véhicules : six colonnes, un clic = la fiche. */
  VueCourtoisie.prototype.tableVehicules = function (liste) {
    var self = this, P = this.rep.params || { kmMax: 12000, moisMax: 6 };
    var tri = liste.slice().sort(function (a, b) {
      var ra = a.alertes.some(function (x) { return x.niveau === 'rouge'; }) ? 0 : (a.alertes.length ? 1 : 2), rb = b.alertes.some(function (x) { return x.niveau === 'rouge'; }) ? 0 : (b.alertes.length ? 1 : 2);
      if (ra !== rb) return ra - rb;
      return String(a.unite || 'zz').localeCompare(String(b.unite || 'zz'), 'fr', { numeric: true });
    });
    if (this.vue === 'sortir') tri = liste;   /* déjà rangée du plus vieux au plus récent */
    var tbody = h('tbody');
    tri.forEach(function (v) {
      var jaugeKm = typeof v.km === 'number' ? Math.min(100, Math.round(v.km / P.kmMax * 100)) : null;
      var clsJ = jaugeKm === null ? '' : (jaugeKm >= 100 ? 'rouge' : (v.km >= (P.kmAvertir || P.kmMax * 0.85) ? 'ambre' : ''));
      var puces = v.alertes.map(function (a) { var e = ECART[a.code]; return h('span.crt-puce.' + a.niveau, { text: e ? e[1] : a.code, title: a.texte }); });
      if (!puces.length) puces.push(h('span.crt-puce.' + (v.etat === 'sorti' ? 'gris' : 'ok'), { text: v.etat === 'sorti' ? 'Sorti · réglé' : 'OK' }));
      var source = v.lmb ? 'LMB ' + v.lmb.stock : (v.vendu ? 'LMB ' + v.vendu.stock + ' (vendu)' : (v.demo ? 'Neuf · ' + (v.demo.origine === 'dms' ? 'DMS' : 'manufacturier') : ''));
      var tr = h('tr' + (v.etat === 'sorti' ? '.sorti' : ''), { 'data-vin': v.cle, tabindex: '0' }, [
        h('td', [h('span.crt-unite', { text: (v.unite ? v.unite + ' · ' : '') + (v.vehicule || v.vehiculeFichier || 'Véhicule') }),
          h('span.s', { text: [v.plaque ? 'Plaque ' + v.plaque : '', source, self.compagnie ? '' : nomCie(v.compagnie)].filter(Boolean).join(' · ') || v.vin })]),
        h('td', [h('span.crt-cat.' + v.categorie, { text: NOM_CAT[v.categorie] || v.categorie })]),
        h('td', [h('span', { text: v.chez || '—' }), v.bt ? h('span.s', { text: 'BT ' + v.bt }) : null]),
        h('td', { title: v.demo && v.miseTexte ? 'Mise en service : ' + v.miseTexte : '' }, [h('span', { text: v.miseService ? dateCourte(v.miseService) : (v.miseTexte || '—') }), typeof v.mois === 'number' ? h('span.s', { text: (Math.round(v.mois * 10) / 10).toLocaleString('fr-CA') + ' mois' }) : null]),
        h('td.num', [h('span', { text: typeof v.km === 'number' ? AMX.fmtNombre(v.km) : '—' }), v.kmSource === 'telematique' ? h('span.crt-auto', { text: 'auto', title: infoKm(v) }) : null,
          jaugeKm === null ? null : h('div.crt-jauge', [h('i' + (clsJ ? '.' + clsJ : ''), { style: { width: jaugeKm + '%' } })]), niveauTele(v) ? h('span.s', { text: niveauTele(v) }) : null]),
        h('td', puces)
      ]);
      tr.addEventListener('click', function () { self.detail(v); });
      tr.addEventListener('keydown', function (e) { if (e.key === 'Enter') self.detail(v); });
      tbody.appendChild(tr);
    });
    return h('div.carte', [h('div.crt-cadre', [h('table.tableau.crt-table', [
      h('thead', [h('tr', ['Véhicule', 'Utilisation', 'Chez / activité', 'En service depuis', 'Km', 'État'].map(function (t, i) { return h('th' + (i === 4 ? '.num' : ''), { text: t }); }))]),
      tbody])])]);
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
        ['Km', kmFichier(v)], ['Stock', v.stock], ['Pneus', v.pneus], ['Raison', v.raison], ['Notes', v.notes],
        ['Lignes au fichier', v.fichierLignes > 1 ? v.fichierLignes : '']]));
    } else if (v.demo) {
      corps.appendChild(h('div.crt-h', { text: 'Aux neufs (' + (v.demo.origine === 'dms' ? 'DMS de la concession' : 'portail du manufacturier') + ')' }));
      corps.appendChild(dl([['Stock', v.stock], ['Utilisation', (NOM_CAT[v.categorie] || v.categorie) + (v.demo.pourquoi ? ' — ' + v.demo.pourquoi : '')], ['Compte GL', v.demo.gl],
        ['Mise en service', v.miseService ? dateCourte(v.miseService) + (typeof v.mois === 'number' ? ' (' + (Math.round(v.mois * 10) / 10).toLocaleString('fr-CA') + ' mois)' : '') + (v.miseTexte ? ' — ' + v.miseTexte : '') : ''],
        ['Km', typeof v.km === 'number' ? AMX.fmtNombre(v.km) : 'pas inscrit au DMS'], ['Note du DMS', v.notes]]));
      corps.appendChild(h('p.doux.petit', { text: 'Cette concession n\'a pas de fichier de courtoisie : ses neufs au statut démo s\'affichent ici d\'eux-mêmes et disparaissent quand le DMS les dit vendus. ' + (v.categorie === 'service' ? 'Une courtoisie service suit la règle de rotation (Réglages).' : 'Une démo de vente n\'a pas de règle de rotation.') }));
    } else corps.appendChild(h('p.doux', { text: 'Pas au fichier de courtoisie.' }));
    if (!v.demo || v.lmb || v.vendu) corps.appendChild(h('div.crt-h', { text: 'Chez LMB' }));
    if (v.demo && !v.lmb && !v.vendu) { /* rien chez LMB : une démo des neufs */ }
    else if (v.lmb) corps.appendChild(dl([['No LOC', v.lmb.stock], ['Modèle', v.lmb.modele], ['Loué à', v.lmb.loueA], ['Floor plan', v.lmb.type || 'vide'], ['Note', v.lmb.note], ['Contrat', v.lmb.contrat ? dateCourte(v.lmb.contrat) : ''], ['Punch', v.lmb.punch ? dateCourte(v.lmb.punch) : ''], ['Ligne', 'LOCATIONS 2026 EN COURS, ligne ' + v.lmb.ligne]]));
    else if (v.vendu) corps.appendChild(dl([['No LOC', v.vendu.stock], ['État', 'Vendu (onglet Vendus 2026, ligne ' + v.vendu.ligne + ')'], ['Retour', v.vendu.retour ? dateCourte(v.vendu.retour) : ''], ['Km au retour', v.vendu.kmRetour ? AMX.fmtNombre(v.vendu.kmRetour) : '']]));
    else corps.appendChild(h('p.doux', { text: 'Pas chez LMB (ni en cours ni vendu).' }));
    if (v.tele) {
      var t = v.tele;
      corps.appendChild(h('div.crt-h', { text: 'Télématique (' + typeTele(t.type) + ')' }));
      corps.appendChild(dl([['Km lu', typeof t.km === 'number' ? AMX.fmtNombre(t.km) + (t.kmLe ? ' · ' + dateHeure(t.kmLe) : '') : ''],
        ['Essence', typeof t.carburant === 'number' ? Math.round(t.carburant) + ' %' + (t.carburantLe ? ' · ' + dateHeure(t.carburantLe) : '') : ''],
        ['Charge', typeof t.charge === 'number' ? Math.round(t.charge) + ' %' + (t.chargeLe ? ' · ' + dateHeure(t.chargeLe) : '') : ''],
        ['Dernière communication', t.vuLe ? dateHeure(t.vuLe) + (t.communique === 'non' ? ' (ne communique plus)' : '') : ''],
        ['Nom chez le fournisseur', t.nom],
        ['Km au fichier', v.kmSource === 'telematique' && typeof v.kmFichier === 'number' ? AMX.fmtNombre(v.kmFichier) : '']]));
      if (v.kmSource !== 'telematique' && typeof t.km === 'number') corps.appendChild(h('p.doux.petit', { text: 'Km du boîtier trop ancien (plus de 45 jours) : la page garde celui du fichier.' }));
    }
    if ((v.neuf && !v.demo) || v.registre) {
      corps.appendChild(h('div.crt-h', { text: 'Ailleurs dans ScanAutomax' }));
      corps.appendChild(dl([['Neufs', v.neuf ? ((v.neuf.stock ? '#' + v.neuf.stock + ' · ' : '') + (v.neuf.statut || '') + (v.neuf.sorti ? ' · sorti' : '')) : ''], ['Registre', v.registre ? (v.registre.registre + (v.registre.stock ? ' #' + v.registre.stock : '') + ' · ' + v.registre.statut) : '']]));
    }
    var boutons = [{ texte: 'Fermer' }];
    var T = (this.rep && this.rep.tele) || {};
    if (v.tele && v.vin && T.position && T.peutLocaliser) boutons.push({ texte: 'Localiser…', action: function () { localiser(v); return false; } });
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
    if (rep.tele && rep.tele.peutRegler) corps.appendChild(this.blocTele(rep.tele));
    else if (!rep.tele && rep.peutFichiers) corps.appendChild(h('p.doux.petit', { text: 'Télématique : le script n\'est pas à jour (Telematique.gs).' }));
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

  /* ------------------------------------------------------------------------------------ télématique (31 oct.) */
  function dateHeure(iso) {
    var d = new Date(iso); if (isNaN(d.getTime())) return String(iso || '');
    return d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });
  }
  function typeTele(t) {
    t = String(t || '');
    if (/custom/i.test(t)) return 'OnStar ou système du constructeur';
    if (/^go/i.test(t)) return 'boîtier Geotab ' + t.toUpperCase();
    return t || 'boîtier';
  }
  function kmFichier(v) {
    var km = v.kmSource === 'telematique' ? v.kmFichier : v.km;
    return typeof km === 'number' ? AMX.fmtNombre(km) : '';
  }
  function infoKm(v) {
    return 'Lu par la télématique' + (v.kmLe ? ' le ' + dateHeure(v.kmLe) : '') + (typeof v.kmFichier === 'number' ? ' · au fichier : ' + AMX.fmtNombre(v.kmFichier) + ' km' : '');
  }
  function niveauTele(v) {
    var t = v.tele; if (!t) return '';
    if (typeof t.charge === 'number') return 'charge ' + Math.round(t.charge) + ' %';
    if (typeof t.carburant === 'number') return 'essence ' + Math.round(t.carburant) + ' %';
    return '';
  }
  /* Position sur demande seulement, avec un motif : le serveur la garde 6 h au plus et note chaque consultation au journal. */
  function localiser(v) {
    var motif = h('textarea.saisie', { rows: '3', placeholder: 'Ex. : véhicule pas rendu à la date prévue, client injoignable.' });
    var res = h('div');
    AMX.modale({ titre: 'Localiser ' + (v.unite || v.vehicule || v.vin), proteger: false,
      corps: h('div', [h('p.doux.petit', { text: 'La position n\'est consultée que pour un motif précis (Loi 25). Le motif, votre nom et l\'heure sont notés au journal.' }),
        h('label.champ', [h('span', { text: 'Motif' }), motif]), res]),
      boutons: [{ texte: 'Fermer' }, { texte: 'Voir la position', classe: 'primaire', action: function () {
        if (motif.value.trim().length < 5) { AMX.toast('Inscrivez le motif.', 'attention'); return false; }
        return AMX.post({ action: 'teleLocaliser', vin: v.vin, motif: motif.value.trim() }, { delai: 30000 }).then(function (d) {
          if (!d || d.refuse || d.ok === false) throw new Error((d && d.erreur) || 'Refusé.');
          var p = d.position || {}, lieu = p.lat + ',' + p.lon;
          res.innerHTML = '';
          res.appendChild(h('div.crt-tele-etat.ok', [h('b', { text: 'Position du ' + dateHeure(p.le) }), h('div', { text: Number(p.lat).toFixed(5) + ', ' + Number(p.lon).toFixed(5) }),
            h('a', { href: 'https://www.google.com/maps?q=' + encodeURIComponent(lieu), target: '_blank', rel: 'noopener', text: 'Ouvrir dans Google Maps' })]));
          return false;
        }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); return false; });
      } }] });
  }
  /* Branchement du compte télématique (propriétaire) : serveur, base, compte, mot de passe collé par lui ; jamais renvoyé. */
  VueCourtoisie.prototype.blocTele = function (T) {
    var self = this, el = h('div');
    var E = T.etat || {};
    el.appendChild(h('div.crt-h', { text: 'Télématique (OnStar par Geotab)' }));
    var etat = !T.motDePasse ? ['', 'Pas encore branché. OnStar arrive par un partenaire (Geotab) : il faut d\'abord le contrat, puis un compte de service en lecture seule.']
      : (!T.actif ? ['', 'Compte enregistré, lecture arrêtée.']
        : (E.erreur ? ['erreur', 'Dernier passage ' + (E.le ? dateHeure(E.le) : '—') + ' : ' + E.erreur]
          : ['ok', E.le ? 'Dernier passage ' + dateHeure(E.le) + ' · ' + pluriel(E.lus || 0, 'véhicule') + ' lu' + ((E.lus || 0) > 1 ? 's' : '') + ' · ' + (E.avecKm || 0) + ' avec km' + (E.sansNiv ? ' · ' + E.sansNiv + ' sans NIV chez Geotab' : '') : 'Activé : première lecture au prochain passage de l\'horloge.']));
    el.appendChild(h('div.crt-tele-etat' + (etat[0] ? '.' + etat[0] : ''), { text: etat[1] }));
    var inServ = h('input.saisie', { type: 'text', value: T.serveur || 'my.geotab.com', autocomplete: 'off' });
    var inBase = h('input.saisie', { type: 'text', value: T.base || '', placeholder: 'Nom de la base de données Geotab', autocomplete: 'off' });
    var inCompte = h('input.saisie', { type: 'text', value: T.compte || '', placeholder: 'Courriel du compte de service', autocomplete: 'off' });
    var inMdp = h('input.saisie', { type: 'password', value: '', placeholder: T.motDePasse ? 'Enregistré — laisser vide pour le garder' : 'Mot de passe du compte de service', autocomplete: 'new-password' });
    var inPas = h('input.saisie', { type: 'number', min: '5', max: '60', value: String(T.pasMin || 15) });
    var cAct = h('input', { type: 'checkbox' }); cAct.checked = !!T.actif;
    var cPos = h('input', { type: 'checkbox' }); cPos.checked = !!T.position;
    el.appendChild(h('div.ligne2', [h('label.champ', [h('span', { text: 'Serveur' }), inServ]), h('label.champ', [h('span', { text: 'Base de données' }), inBase])]));
    el.appendChild(h('div.ligne2', [h('label.champ', [h('span', { text: 'Compte' }), inCompte]), h('label.champ', [h('span', { text: 'Mot de passe' }), inMdp])]));
    el.appendChild(h('div.ligne2', [h('label.champ', [h('span', { text: 'Lire aux (minutes, le jour)' }), inPas]), h('div')]));
    el.appendChild(h('label.case', [cAct, h('span', { text: 'Lire le km, l\'essence et la charge des véhicules (Service › Courtoisie)' })]));
    el.appendChild(h('label.case', [cPos, h('span', { text: 'Permettre de localiser un véhicule sur demande, avec un motif (gardé 6 h, consultation notée au journal). Fermé par défaut — à valider avec l\'avocat (Loi 25).' })]));
    var envoyer = function (corps, ok) {
      return AMX.post(corps, { delai: 60000, secours: false }).then(function (d) {
        if (!d || d.refuse || d.ok === false) throw new Error((d && d.erreur) || 'Refusé.');
        if (d.telematique) self.rep.tele = Object.assign({}, self.rep.tele, d.telematique);
        AMX.toast(d.message || ok, 'ok'); inMdp.value = ''; self.charger(true);
        document.querySelectorAll('.voile').forEach(function (v) { v.remove(); });
      }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); });
    };
    el.appendChild(h('div.crt-tele-boutons', [
      h('button.btn', { type: 'button', text: 'Enregistrer la télématique', onclick: function () {
        envoyer({ action: 'teleReglages', fournisseur: 'geotab', teleServeur: inServ.value.trim(), teleBase: inBase.value.trim(), teleCompte: inCompte.value.trim(),
          teleMdp: inMdp.value, actif: cAct.checked ? 'oui' : 'non', position: cPos.checked ? 'oui' : 'non', pasMin: inPas.value }, 'Télématique enregistrée');
      } }),
      T.motDePasse ? h('button.btn', { type: 'button', text: 'Lire maintenant', onclick: function () { envoyer({ action: 'teleTester' }, 'Lecture faite'); } }) : null,
      T.motDePasse ? h('button.btn.danger', { type: 'button', text: 'Retirer le compte', onclick: function () {
        AMX.confirmer('Retirer le compte télématique ?', 'La lecture s\'arrête et le mot de passe est effacé du script.', { danger: true, ok: 'Retirer' }).then(function (ok) { if (ok) envoyer({ action: 'teleRetirer' }, 'Compte retiré'); });
      } }) : null]));
    el.appendChild(h('p.doux.petit', { text: 'Le mot de passe est vérifié chez Geotab avant d\'être gardé, puis il ne quitte plus le script. Les véhicules sont reconnus par leur NIV.' }));
    return el;
  };

  /* ------------------------------------------------------------------------------------ export */
  VueCourtoisie.prototype.exporter = function () {
    var liste = this.filtrer();
    if (!liste.length) { AMX.toast('Rien à exporter.', 'attention'); return; }
    if (typeof XLSX === 'undefined') { AMX.toast('Excel indisponible dans ce navigateur.', 'erreur'); return; }
    var lignes = [['Concession', 'Unité', 'Véhicule', 'NIV', 'Plaque', 'Utilisation', 'État', 'Chez / activité', 'BT', 'Mise en service', 'Mois', 'Km', 'Source du km', 'No LOC (LMB)', 'Floor plan', 'Note LMB', 'Écarts', 'Onglet du fichier', 'Ligne']];
    liste.forEach(function (v) {
      lignes.push([nomCie(v.compagnie), v.unite, v.vehicule || v.vehiculeFichier, v.vin, v.plaque, NOM_CAT[v.categorie] || v.categorie, v.etat === 'sorti' ? 'Sorti' : 'En service', v.chez, v.bt, v.miseService || v.miseTexte,
        typeof v.mois === 'number' ? Math.round(v.mois * 10) / 10 : '', typeof v.km === 'number' ? v.km : '', v.kmSource === 'telematique' ? 'Télématique' + (v.kmLe ? ' (' + String(v.kmLe).slice(0, 10) + ')' : '') : (v.demo ? (v.demo.origine === 'dms' ? 'DMS' : 'Manufacturier') : 'Fichier'), v.lmb ? v.lmb.stock : (v.vendu ? v.vendu.stock + ' (vendu)' : (v.demo ? 'Neuf ' + (v.demo.origine === 'dms' ? 'DMS' : 'manufacturier') + (v.demo.gl ? ' · GL ' + v.demo.gl : '') : '')), v.lmb ? (v.lmb.type || 'vide') : '', v.lmb ? v.lmb.note : '',
        v.alertes.map(function (a) { return a.texte; }).join(' | '), v.fichier ? v.fichier.onglet : '', v.fichier ? v.fichier.ligne : '']);
    });
    var wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet(lignes);
    ws['!cols'] = lignes[0].map(function (e, i) { return { wch: Math.min(48, Math.max(10, lignes.reduce(function (m, r) { return Math.max(m, String(r[i] || '').length); }, 0) + 2)) }; });
    XLSX.utils.book_append_sheet(wb, ws, 'Courtoisie');
    XLSX.writeFile(wb, 'courtoisie-' + new Date().toISOString().slice(0, 10) + '.xlsx');
    AMX.toast(pluriel(liste.length, 'véhicule') + ' exporté' + (liste.length > 1 ? 's' : ''), 'ok');
  };
})();
