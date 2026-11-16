/* Marketing › Générateur de contenu (15 nov. 2026) — script Contenu.gs.
   Maxime : « on pourrait faire un onglet générateur de contenu si on va de l'avant » → « Oui, construis-le ».
   Une page UTILE par site et par semaine (reports/Contenu et référencement des concessions.md) :
     1. « Nouvelle page » : le sujet (un modèle en stock, un guide du service, un secteur desservi, un sujet libre) et les
        faits de l'équipe ; Einstein écrit la page française à partir du stock réel du site, puis la traduit.
     2. Une personne de la concession relit, corrige au besoin, et la direction approuve (« J'ai relu »).
     3. Dans D2C › Custom Pages du site, un clic sur le favori « Automax → D2C (pages) » : il crée la page, met le
        texte et le titre pour Google, et ScanAutomax relit la page en ligne (16 nov. : un seul clic).
   16 nov. : onglet « Demander à Einstein » dans la fiche (idées d'amélioration, modifier le texte à la demande, revenir à
   la version d'avant ; l'anglais est refait tout de suite après) et onglet « Comparaisons » de la liste (notre modèle contre
   celui d'une autre marque, jamais deux marques du groupe).
   Les garde-fous (même texte sur deux sites, rythme, montants, secteurs) sont refaits par le serveur.
   Rien ne se garde dans le navigateur, rien ne se publie tout seul. */
(function () {
  'use strict';
  var A = AMX, h = AMX.h;
  var SCRIPT_PAS_A_JOUR = 'Le script n\'est pas à jour : déployez la version qui contient Contenu.gs.';
  var CODE_SIGNET_D2C_PAGES = "javascript:(function () { var s = document.createElement('script'); s.src = " + JSON.stringify(A.SITE || "https://groupeautomax.github.io/inventaireus/") + " + 'assets/signet-d2c-pages.js?t=' + Date.now(); s.onerror = function () { alert(\"Impossible de charger le signet depuis le site d'inventaire (groupeautomax.github.io). V\u00e9rifiez votre connexion, puis recliquez.\"); }; document.body.appendChild(s); })();";
  (AMX.signets = AMX.signets || {}).d2cpages = { nom: 'Automax → D2C (pages)', code: CODE_SIGNET_D2C_PAGES };

  var CSS = [
    '.ctn-page { max-width: 1100px; }',
    '.ctn-sites { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 12px; }',
    '.ctn-sites button { border: 1px solid var(--ligne); background: var(--carte); color: var(--encre-2); border-radius: 999px; padding: 7px 14px; font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }',
    '.ctn-sites button.actif { background: var(--encre); border-color: var(--encre); color: #fff; } .ctn-sites button .n { opacity: .75; margin-left: 6px; }',
    '.ctn-site { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; border: 1px solid var(--ligne); background: var(--carte); border-radius: 12px; padding: 12px 16px; margin: 0 0 14px; font-size: 14px; }',
    '.ctn-site .t { flex: 1 1 300px; } .ctn-site .t b { font-size: 16px; } .ctn-site .m { color: var(--encre-3); margin-top: 2px; }',
    '.ctn-site .rythme { font-weight: 700; } .ctn-site .rythme.ok { color: var(--vert-fonce); } .ctn-site .rythme.att { color: var(--ambre); }',
    '.ctn-aide { border: 1px solid var(--ligne); background: var(--carte); border-radius: 12px; padding: 10px 14px; margin: 0 0 14px; font-size: 14px; }',
    '.ctn-aide > summary { cursor: pointer; font-weight: 700; } .ctn-aide ol { margin: 8px 0 0 18px; padding: 0; } .ctn-aide li { margin: 4px 0; line-height: 1.45; }',
    '.ctn-groupe { margin: 18px 0 8px; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: .03em; color: var(--encre-2); }',
    '.ctn-liste { display: flex; flex-direction: column; gap: 8px; }',
    '.ctn-ligne { display: grid; grid-template-columns: 1fr auto; gap: 8px 14px; align-items: center; width: 100%; text-align: left; border: 1px solid var(--ligne); background: var(--carte); color: var(--encre); border-radius: 12px; padding: 12px 14px; font: inherit; cursor: pointer; }',
    '.ctn-ligne:hover { border-color: var(--encre-3); } .ctn-ligne b { font-size: 15px; } .ctn-ligne .m { font-size: 13px; color: var(--encre-3); margin-top: 3px; }',
    '.ctn-ligne .d { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }',
    '.ctn-p { font-size: 12px; font-weight: 700; border-radius: 999px; padding: 2px 10px; white-space: nowrap; }',
    '.ctn-p.ambre { background: #fff1d6; color: #8a4b00; } .ctn-p.bleu { background: #e7f0fb; color: #0b5cad; } .ctn-p.vert { background: #e3f4ea; color: var(--vert-fonce); } .ctn-p.gris { background: var(--fond); color: var(--encre-3); } .ctn-p.rouge { background: #fde2e2; color: var(--rouge); }',
    '.ctn-vide { padding: 26px; text-align: center; color: var(--encre-3); border: 1px dashed var(--ligne); border-radius: 12px; }',
    /* nouvelle page */
    '.ctn-types { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; margin: 0 0 14px; }',
    '.ctn-type { text-align: left; border: 2px solid var(--ligne); background: var(--carte); border-radius: 12px; padding: 12px; font: inherit; cursor: pointer; color: var(--encre); }',
    '.ctn-type b { display: block; font-size: 15px; } .ctn-type span { display: block; font-size: 13px; color: var(--encre-3); margin-top: 4px; line-height: 1.4; } .ctn-type.actif { border-color: var(--vert); box-shadow: 0 0 0 1px var(--vert) inset; }',
    '.ctn-champs { display: flex; flex-direction: column; gap: 10px; } .ctn-champs label { display: flex; flex-direction: column; gap: 4px; font-size: 14px; font-weight: 600; }',
    '.ctn-champs label .aide { font-weight: 400; font-size: 13px; color: var(--encre-3); } .ctn-champs textarea { min-height: 96px; }',
    '.ctn-seg { display: inline-flex; gap: 6px; flex-wrap: wrap; } .ctn-seg button { border: 1px solid var(--ligne); background: var(--carte); border-radius: 999px; padding: 6px 12px; font: inherit; font-size: 14px; cursor: pointer; } .ctn-seg button.actif { background: var(--encre); color: #fff; border-color: var(--encre); }',
    '.ctn-etat { margin-top: 12px; padding: 10px 12px; border-radius: 10px; background: var(--fond); font-size: 14px; } .ctn-etat.err { background: #fde2e2; color: var(--rouge); }',
    /* fiche */
    '.ctn-fiche .tete { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; margin: 0 0 10px; } .ctn-fiche .tete .m { color: var(--encre-3); font-size: 13px; flex: 1 1 260px; }',
    '.ctn-boite { border-radius: 10px; padding: 10px 12px; margin: 0 0 10px; font-size: 14px; } .ctn-boite ul { margin: 6px 0 0 18px; padding: 0; } .ctn-boite li { margin: 3px 0; line-height: 1.4; }',
    '.ctn-boite.rouge { background: #fde2e2; border: 1px solid #f3b4b4; } .ctn-boite.ambre { background: #fff6e5; border: 1px solid #f0c36d; } .ctn-boite.bleu { background: #eef5fd; border: 1px solid #b9d3f2; }',
    '.ctn-onglets { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 12px; border-bottom: 1px solid var(--ligne); }',
    '.ctn-onglets button { border: 0; background: none; padding: 8px 12px; font: inherit; font-size: 14px; font-weight: 600; color: var(--encre-3); cursor: pointer; border-bottom: 3px solid transparent; margin-bottom: -1px; }',
    '.ctn-onglets button.actif { color: var(--encre); border-bottom-color: var(--vert); }',
    '.ctn-apercu { width: 100%; height: 620px; border: 1px solid var(--ligne); border-radius: 10px; background: #fff; }',
    '.ctn-ed { display: flex; flex-direction: column; gap: 10px; } .ctn-ed label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; font-weight: 700; color: var(--encre-2); }',
    '.ctn-ed .compte { font-weight: 400; color: var(--encre-3); } .ctn-ed .compte.trop { color: var(--rouge); font-weight: 700; } .ctn-ed textarea { min-height: 70px; }',
    '.ctn-sec { border: 1px solid var(--ligne); border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 8px; } .ctn-sec .haut { display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 800; color: var(--encre-3); }',
    '.ctn-pub ol { margin: 6px 0 0 18px; padding: 0; } .ctn-pub li { margin: 8px 0; line-height: 1.45; } .ctn-pub .copie { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 4px 0; } .ctn-pub code { background: var(--fond); padding: 3px 6px; border-radius: 6px; font-size: 13px; word-break: break-word; }',
    '.ctn-lien { margin-top: 12px; border: 1px solid var(--bordure); border-radius: 8px; padding: 8px 12px; } .ctn-lien summary { cursor: pointer; font-weight: 600; } .ctn-lien .aide { margin: 6px 0; color: var(--encre-3); font-size: 14px; } .ctn-lien label { margin-top: 8px; }' +
    '.ctn-un-clic { font-size: 15px; line-height: 1.5; margin: 4px 0 8px; } .ctn-main { margin-top: 12px; border: 1px solid var(--bordure); border-radius: 8px; padding: 8px 12px; } .ctn-main summary { cursor: pointer; font-weight: 600; } ' +
    '.ctn-pub .fav { margin: 8px 0; } .ctn-relu { display: flex; gap: 8px; align-items: flex-start; font-size: 14px; margin-top: 8px; } .ctn-relu input { width: 20px; height: 20px; margin-top: 1px; }',
    /* 16 nov. : onglets de la liste, Einstein dans la fiche, comparaisons */
    '.ctn-vues { display: flex; gap: 6px; margin: 4px 0 12px; border-bottom: 1px solid var(--ligne); }',
    '.ctn-vues button { border: 0; background: none; padding: 10px 14px; font: inherit; font-size: 15px; font-weight: 700; color: var(--encre-3); cursor: pointer; border-bottom: 3px solid transparent; margin-bottom: -1px; }',
    '.ctn-vues button.actif { color: var(--encre); border-bottom-color: var(--vert); } .ctn-vues button .n { font-weight: 600; opacity: .7; margin-left: 6px; }',
    '.ctn-intro-cmp { display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: center; border: 1px solid var(--ligne); background: var(--carte); border-radius: 12px; padding: 14px 16px; margin: 0 0 12px; }',
    '.ctn-intro-cmp .t { flex: 1 1 320px; font-size: 14px; line-height: 1.5; color: var(--encre-2); } .ctn-intro-cmp .t b { display: block; font-size: 16px; color: var(--encre); margin-bottom: 2px; }',
    '.ctn-deux { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } @media (max-width: 640px) { .ctn-deux { grid-template-columns: 1fr; } }',
    '.ctn-ein { display: flex; flex-direction: column; gap: 12px; } .ctn-ein textarea { min-height: 84px; }',
    '.ctn-puces { display: flex; flex-wrap: wrap; gap: 6px; } .ctn-puces button { border: 1px solid var(--ligne); background: var(--carte); border-radius: 999px; padding: 6px 12px; font: inherit; font-size: 13px; cursor: pointer; } .ctn-puces button:hover { border-color: var(--encre-3); }',
    '.ctn-idees { display: flex; flex-direction: column; gap: 8px; } .ctn-idee { border: 1px solid var(--ligne); border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; background: var(--carte); }',
    '.ctn-idee b { font-size: 15px; } .ctn-idee .p { font-size: 13px; color: var(--encre-3); } .ctn-idee .bas { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; } .ctn-idee .bas input { flex: 1 1 240px; }',
    '.ctn-ein h3 { font-size: 15px; margin: 6px 0 0; }',
    '@media (max-width: 640px) { .ctn-ligne { grid-template-columns: 1fr; } .ctn-ligne .d { justify-content: flex-start; } .ctn-apercu { height: 480px; } }'
  ].join('\n');
  function css() { if (!document.getElementById('css-contenu')) { var s = document.createElement('style'); s.id = 'css-contenu'; s.textContent = CSS; document.head.appendChild(s); } }
  function perms() { return (A.session && A.session.perms) || {}; }
  function role() { var p = perms(); return String(p.role || (A.session && A.session.role) || ''); }
  function peutVoir() { var p = perms(), r = role(); return ['proprietaire', 'admin', 'gestionnaire', 'direction_ventes', 'direction_service', 'marketing'].indexOf(r) >= 0 || !!(p.gererUtilisateurs || p.gererAdmins); }

  var ETATS = { brouillon: ['À relire', 'ambre'], approuvee: ['Approuvée — à publier', 'bleu'], publiee: ['En ligne', 'vert'], retiree: ['Retirée', 'gris'] };
  var TYPES = [
    ['modele', 'Un modèle en stock', 'Les véhicules d\'un modèle vraiment en vente sur le site, avec leurs fiches. Le plus utile pour Google.'],
    ['service', 'Guide du service', 'Un sujet d\'atelier (pneus d\'hiver, entretien…) avec ce que votre atelier offre vraiment.'],
    ['secteur', 'Secteur desservi', 'Pourquoi les clients d\'une ville voisine viennent chez vous. Cinq au plus par site, avec des faits locaux.'],
    ['libre', 'Sujet libre', 'Un événement, une nouveauté, une question fréquente : avec vos faits.'],
    ['comparaison', 'Comparaison avec une autre marque', 'Notre modèle contre celui d\'une autre marque (ex. BMW X3 contre Mercedes-Benz GLC). Jamais deux marques du groupe.']
  ];
  /* Concurrents proposés selon notre marque (une suggestion : on peut taper toute autre marque hors du groupe) */
  var CONCURRENTS = {
    BMW: ['Mercedes-Benz', 'Audi', 'Lexus', 'Volvo', 'Genesis', 'Acura', 'Porsche', 'Tesla', 'Land Rover', 'Infiniti', 'Lincoln'],
    Cadillac: ['Lincoln', 'Mercedes-Benz', 'Audi', 'Lexus', 'Genesis', 'Volvo', 'Acura', 'Tesla'],
    Chevrolet: ['Ford', 'Ram', 'Toyota', 'Honda', 'Nissan', 'Jeep', 'Kia', 'Mazda', 'Subaru', 'Tesla'],
    GMC: ['Ford', 'Ram', 'Toyota', 'Nissan', 'Jeep'],
    Buick: ['Kia', 'Mazda', 'Toyota', 'Honda', 'Nissan', 'Subaru', 'Ford'],
    Volkswagen: ['Toyota', 'Honda', 'Mazda', 'Subaru', 'Kia', 'Nissan', 'Ford', 'Mitsubishi', 'Jeep', 'Tesla'],
    Hyundai: ['Toyota', 'Honda', 'Kia', 'Mazda', 'Nissan', 'Subaru', 'Mitsubishi', 'Ford', 'Tesla']
  };
  var MARQUES_GROUPE = ['BMW', 'MINI', 'Chevrolet', 'GMC', 'Buick', 'Cadillac', 'Volkswagen', 'Hyundai'];
  var ALIAS_GROUPE = { vw: 'Volkswagen', chevy: 'Chevrolet' };
  function sansAccent(t) { return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  /** La marque du groupe que nomme ce texte, sinon '' (même règle que le serveur, CTN_marqueGroupe_). */
  function marqueGroupe(m, liste) {
    var n = sansAccent(m); if (!n) return '';
    if (ALIAS_GROUPE[n]) return ALIAS_GROUPE[n];
    return (liste || MARQUES_GROUPE).filter(function (x) { return sansAccent(x) === n; })[0] || '';
  }
  var LIM = { metaTitre: 60, metaDescription: 155, titre: 70 };

  /* ---- Données ---- */
  var cache = { rep: null, le: 0 };
  function charger(force) {
    if (!force && cache.rep && Date.now() - cache.le < A.dureeCopie(60000)) return Promise.resolve(cache.rep);
    return A.get({ contenuPages: '1' }, { delai: 90000, secours: false }).then(function (d) {
      if (d && d.refuse) throw new Error(d.erreur || 'Accès refusé.');
      if (!d || d.ok === false) throw new Error((d && d.erreur) || 'Lecture impossible.');
      if (!Array.isArray(d.pages) || !Array.isArray(d.sites)) throw new Error(SCRIPT_PAS_A_JOUR);
      cache = { rep: d, le: Date.now() };
      return d;
    });
  }
  function lirePage(id) {
    return A.get({ contenuPage: id }, { delai: 90000, secours: false }).then(function (d) {
      if (!d || d.ok === false) throw new Error((d && d.erreur) || 'Page introuvable.');
      if (!d.page) throw new Error(SCRIPT_PAS_A_JOUR);
      return d;
    });
  }
  function poster(corps, delai) {
    return A.post(corps, { secours: false, delai: delai || 120000 }).then(function (r) {
      if (!r || r.refuse || r.ok === false) { var e = new Error((r && r.erreur) || 'Refusé.'); e.rep = r; throw e; }
      if (r.vehicules && !r.page && !r.id && r.lus === undefined) throw new Error(SCRIPT_PAS_A_JOUR);
      cache.le = 0;
      return r;
    });
  }
  function compteur() {
    var d = cache.rep; if (!d) return '';
    var n = d.pages.filter(function (p) { return p.etat === 'brouillon' || (p.etat === 'approuvee') || (p.etat === 'publiee' && !p.enLigne.aJour); }).length;
    return n || '';
  }

  /* ---- Petits morceaux ---- */
  function pastille(etat) { var e = ETATS[etat] || [etat, 'gris']; return h('span.ctn-p.' + e[1], { text: e[0] }); }
  function copie(lib, val) {
    return h('div.copie', [h('span', { text: lib }), h('code', { text: val || '—' }),
      val ? h('button.btn.petit.fantome', { type: 'button', text: 'Copier', onclick: function () { A.copier(val, 'Copié'); } }) : null]);
  }
  function favori() {
    return h('a.btn.petit.primaire', { href: CODE_SIGNET_D2C_PAGES || '#', draggable: 'true', title: 'Glissez ce bouton dans votre barre de favoris', text: 'Automax → D2C (pages)',
      onclick: function (e) { e.preventDefault(); A.toast('Glissez ce bouton dans la barre de favoris, puis cliquez-le dans D2C, la page ouverte.', 'info'); } });
  }
  function dateCourte(iso) {
    if (!iso) return '';
    var d = A.dateDe ? A.dateDe(iso) : new Date(iso);
    if (!d || isNaN(d.getTime())) return String(iso);
    var t = d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' });
    return d.getFullYear() !== new Date().getFullYear() ? t + ' ' + d.getFullYear() : t;
  }

  /* =============================== La page =============================== */
  function VueContenu(conteneur) {
    css();
    var self = this;
    this.conteneur = conteneur; this.detruit = false;
    A.vider(conteneur);
    this.btnNouvelle = h('button.btn.primaire', { type: 'button', text: 'Nouvelle page', onclick: function () { self.nouvelle(self.vue === 'comparaisons' ? 'comparaison' : ''); } });
    this.btnRafraichir = h('button.btn', { type: 'button', text: 'Rafraîchir', onclick: function () { self.charger(true); } });
    this.btnFavori = h('button.btn', { type: 'button', text: 'Le favori D2C', onclick: function () { self.aideFavori(); } });
    conteneur.appendChild(h('div.entete-page', [
      h('div', [h('h1', 'Générateur de contenu'), h('p', { text: 'Une page utile par site et par semaine : Einstein écrit à partir de nos données, la concession relit et approuve, le favori la publie dans D2C.' })]),
      h('div.actions', A.actionsEntete([this.btnRafraichir, this.btnFavori, this.btnNouvelle], [this.btnNouvelle]))
    ]));
    this.elSites = h('div.ctn-sites'); conteneur.appendChild(this.elSites);
    this.elCorps = h('div.ctn-page'); conteneur.appendChild(this.elCorps);
    this.site = (A.memo && A.memo.lire('ctn_site', '')) || '';
    this.vue = (A.memo && A.memo.lire('ctn_vue', '')) === 'comparaisons' ? 'comparaisons' : 'pages';
    this.surCie = function (e) { var c = e.detail && e.detail.compagnie; if (c && self.rep) { var s = self.rep.sites.filter(function (x) { return x.cie === c; })[0]; if (s) { self.choisirSite(s.cle); } } };
    document.addEventListener('amx:compagnie', this.surCie);
    this.charger(false);
  }
  VueContenu.prototype.demonter = function () { this.detruit = true; document.removeEventListener('amx:compagnie', this.surCie); };
  VueContenu.prototype.charger = function (force) {
    var self = this;
    if (!cache.rep) { A.vider(this.elCorps); this.elCorps.appendChild(A.chargeur('Générateur de contenu')); }
    return charger(force).then(function (d) { if (self.detruit) return; self.rep = d; self.rendre(); }).catch(function (e) {
      if (self.detruit) return; A.vider(self.elCorps); self.elCorps.appendChild(h('div.ctn-vide', { text: A.erreurTexte(e) }));
    });
  };
  VueContenu.prototype.siteCourant = function () {
    var d = this.rep, s = d.sites.filter(function (x) { return x.cle === this.site; }, this)[0];
    if (!s) {
      var cie = A.compagnieChoisie ? A.compagnieChoisie('inventaire') : '';
      s = d.sites.filter(function (x) { return x.cie === cie; })[0] || d.sites[0];
      this.site = s ? s.cle : '';
    }
    return s;
  };
  VueContenu.prototype.choisirSite = function (cle) { this.site = cle; if (A.memo) A.memo.ecrire('ctn_site', cle); this.rendre(); };
  VueContenu.prototype.rendre = function () {
    var self = this, d = this.rep, s = this.siteCourant();
    A.vider(this.elSites); A.vider(this.elCorps);
    if (!s) { this.elCorps.appendChild(h('div.ctn-vide', { text: 'Aucun site à votre portée.' })); return; }
    d.sites.forEach(function (x) {
      var n = d.pages.filter(function (p) { return p.site === x.cle && p.etat !== 'retiree'; }).length;
      self.elSites.appendChild(h('button' + (x.cle === s.cle ? '.actif' : ''), { type: 'button', onclick: function () { self.choisirSite(x.cle); } }, [document.createTextNode(x.nom), n ? h('span.n', { text: String(n) }) : null]));
    });
    /* le site : lu le, véhicules, rythme de la semaine */
    var lu = s.lu && s.lu.n ? 'Site lu ' + (s.lu.le ? 'le ' + dateCourte(s.lu.le) : '') + ' : ' + s.lu.n + ' véhicules en vente, ' + s.modeles.length + ' modèles.' : 'Le site n\'a pas encore été lu : « Lire le site » (deux à quatre minutes) avant une page « modèle ».';
    var r = s.rythme7 || 0;
    this.btnLire = h('button.btn', { type: 'button', text: s.lu && s.lu.n ? 'Relire le site' : 'Lire le site', onclick: function () { self.lireSite(s); } });
    this.elCorps.appendChild(h('div.ctn-site', [
      h('div.t', [h('b', { text: s.nom }), h('div.m', [h('a', { href: s.base, target: '_blank', rel: 'noopener', text: s.base.replace(/^https:\/\/(www\.)?/, '') }), document.createTextNode(' · ' + lu)])]),
      h('div.rythme' + (r > 1 ? '.att' : '.ok'), { text: !r ? 'Aucune page cette semaine : c\'est le moment' : r === 1 ? '1 page cette semaine : le bon rythme' : r + ' pages cette semaine : une par semaine suffit' + (r >= 3 ? ' (la prochaine ne pourra être approuvée que la semaine prochaine)' : '') }),
      this.btnLire
    ]));
    this.elCorps.appendChild(h('details.ctn-aide', [h('summary', { text: 'Comment ça marche' }), h('ol', [
      h('li', { text: '« Nouvelle page » : choisissez le sujet et donnez les faits. Einstein écrit la page française à partir du stock réel du site, puis la version anglaise. Il n\'invente ni chiffre, ni prix, ni promotion.' }),
      h('li', { text: 'Relisez. Corrigez au besoin dans « Texte français » et « Texte anglais ». Chaque affirmation de la liste « à confirmer » doit être vraie.' }),
      h('li', { text: 'La direction approuve (« J\'ai relu la page et vérifié chaque fait »). Une page par semaine par site suffit ; jamais le même texte sur deux sites.' }),
      h('li', { text: 'Publier : dans D2C, ouvrez Custom Pages du site et cliquez le favori « Automax → D2C (pages) ». C\'est tout : il crée la page, met le texte et le titre pour Google, et vérifie qu\'elle est en ligne.' }),
      h('li', { text: 'ScanAutomax relit la page en ligne. Un véhicule vendu disparaît de la page à la prochaine publication : la page passe « à republier ».' })])]));
    var toutes = d.pages.filter(function (p) { return p.site === s.cle; });
    var nCmp = toutes.filter(function (p) { return p.type === 'comparaison' && p.etat !== 'retiree'; }).length, nPg = toutes.filter(function (p) { return p.type !== 'comparaison' && p.etat !== 'retiree'; }).length;
    var vues = [['pages', 'Pages', nPg], ['comparaisons', 'Comparaisons', nCmp]];
    this.elCorps.appendChild(h('div.ctn-vues', { role: 'tablist' }, vues.map(function (v) {
      return h('button' + (v[0] === self.vue ? '.actif' : ''), { type: 'button', role: 'tab', 'aria-selected': v[0] === self.vue ? 'true' : 'false', onclick: function () { self.vue = v[0]; if (A.memo) A.memo.ecrire('ctn_vue', v[0]); self.btnNouvelle.textContent = v[0] === 'comparaisons' ? 'Nouvelle comparaison' : 'Nouvelle page'; self.rendre(); } },
        [document.createTextNode(v[1]), v[2] ? h('span.n', { text: String(v[2]) }) : null]);
    })));
    this.btnNouvelle.textContent = this.vue === 'comparaisons' ? 'Nouvelle comparaison' : 'Nouvelle page';
    var cmp = this.vue === 'comparaisons';
    if (cmp) this.elCorps.appendChild(h('div.ctn-intro-cmp', [
      h('div.t', [h('b', { text: 'Notre modèle contre celui d\'une autre marque' }),
        document.createTextNode('Ex. ' + (s.marques && s.marques[0] === 'BMW' ? 'BMW X3 contre Mercedes-Benz GLC ou Audi Q5' : (s.marques || [''])[0] + ' contre un concurrent d\'une autre marque') + '. Jamais deux marques du groupe entre elles. Einstein met en avant les vrais avantages de notre modèle, à partir des chiffres que vous donnez (fiche du constructeur, même année) : une comparaison fausse ou trompeuse est interdite, et une page honnête convainc mieux.')]),
      h('button.btn.primaire', { type: 'button', text: 'Nouvelle comparaison', onclick: function () { self.nouvelle('comparaison'); } })]));
    var pages = toutes.filter(function (p) { return cmp ? p.type === 'comparaison' : p.type !== 'comparaison'; });
    if (!pages.length) { this.elCorps.appendChild(h('div.ctn-vide', { text: cmp ? 'Aucune comparaison pour ce site. « Nouvelle comparaison » : choisissez notre modèle et celui d\'une autre marque.' : 'Aucune page pour ce site. « Nouvelle page » : Einstein prépare un brouillon à partir de nos données.' })); return; }
    var groupes = [
      ['À relire et approuver', pages.filter(function (p) { return p.etat === 'brouillon'; })],
      ['Approuvées — à publier dans D2C', pages.filter(function (p) { return p.etat === 'approuvee' || (p.etat === 'publiee' && !p.enLigne.aJour); })],
      ['En ligne', pages.filter(function (p) { return p.etat === 'publiee' && p.enLigne.aJour; })]
    ];
    groupes.forEach(function (g) {
      if (!g[1].length) return;
      self.elCorps.appendChild(h('div.ctn-groupe', { text: g[0] + ' (' + g[1].length + ')' }));
      self.elCorps.appendChild(h('div.ctn-liste', g[1].map(function (p) { return self.ligne(p); })));
    });
    var ret = pages.filter(function (p) { return p.etat === 'retiree'; });
    if (ret.length) this.elCorps.appendChild(h('details', { style: { marginTop: '14px' } }, [h('summary', { text: 'Retirées (' + ret.length + ')', style: { cursor: 'pointer', fontWeight: '700', color: 'var(--encre-3)' } }), h('div.ctn-liste', { style: { marginTop: '8px' } }, ret.map(function (p) { return self.ligne(p); }))]));
  };
  VueContenu.prototype.ligne = function (p) {
    var self = this, puces = [pastille(p.etat)];
    if (p.problemes.length) puces.push(h('span.ctn-p.rouge', { text: p.problemes.length + ' à corriger' }));
    if (!p.traduit) puces.push(h('span.ctn-p.ambre', { text: 'Anglais à faire' }));
    if (p.etat === 'publiee' && !p.enLigne.aJour) puces.push(h('span.ctn-p.ambre', { text: 'À republier' }));
    var bl = p.avertissements.filter(function (a) { return a.bloquant && a.code !== 'anglais'; });
    if (bl.length) puces.push(h('span.ctn-p.rouge', { text: 'Bloquée' }));
    var pr = p.params || {};
    var sous = [p.id, p.type === 'comparaison' ? pr.marque + ' ' + pr.modele + ' contre ' + pr.concurrentMarque + ' ' + pr.concurrentModele : p.typeNom, p.type === 'modele' ? p.nbVehicules + ' véhicule' + (p.nbVehicules > 1 ? 's' : '') : '', 'modifiée le ' + dateCourte(p.maj || p.creeLe) + (p.majPar ? ' par ' + p.majPar : '')].filter(Boolean).join(' · ');
    return h('button.ctn-ligne', { type: 'button', onclick: function () { self.fiche(p.id); } }, [h('div', [h('b', { text: p.titre || '(sans titre)' }), h('div.m', { text: sous })]), h('div.d', puces)]);
  };
  VueContenu.prototype.lireSite = function (s) {
    var self = this, b = this.btnLire, total = 0, tours = 0;
    if (b) b.disabled = true;
    var tour = function () {
      tours++; if (b) b.textContent = 'Lecture du site… (' + total + ' fiches)';
      return poster({ action: 'contenuLireSite', site: s.cle }, 330000).then(function (r) {
        total += r.lus || 0;
        if (r.restants > 0 && tours < 6) return tour();
        A.toast(total + ' fiche' + (total > 1 ? 's' : '') + ' lue' + (total > 1 ? 's' : '') + ' sur ' + s.nom + (r.fiches ? ' (' + r.fiches + ' au total)' : '') + '.', 'ok');
      });
    };
    tour().then(function () { return self.charger(true); }).catch(function (e) { A.toast(A.erreurTexte(e), 'erreur', 9000); if (b) { b.disabled = false; b.textContent = 'Lire le site'; } });
  };
  VueContenu.prototype.aideFavori = function () {
    A.modale({ titre: 'Le favori « Automax → D2C (pages) »', corps: h('div.ctn-pub', [
      h('p', { text: 'Une fois : glissez ce bouton dans la barre de favoris de Chrome.' }), h('div.fav', [favori()]),
      h('p', { text: 'Ensuite, quand une page est approuvée : D2C › My Sites › le site › Configurator › Custom Pages › cliquez le favori. Il crée la page, met le texte français et anglais et le titre pour Google, puis vérifie qu\'elle est en ligne — pour toutes les pages approuvées de ce site. Il ne touche jamais une adresse déjà prise par un autre texte (la page des offres de location, une page tapée à la main).' })
    ]), boutons: [{ texte: 'Fermer' }] });
  };

  /* ------------------------------ Nouvelle page ------------------------------ */
  VueContenu.prototype.nouvelle = function (typeDepart) {
    var self = this, d = this.rep; if (!d) return;
    var s = this.siteCourant(); if (!s) return;
    var type = typeDepart === 'comparaison' ? 'comparaison' : 'modele', genre = 'occasion';
    var groupe = d.marquesGroupe || MARQUES_GROUPE, marquesSite = s.marques || [];
    var champs = h('div.ctn-champs'), etat = h('div.ctn-etat', { hidden: true });
    var types = h('div.ctn-types', TYPES.map(function (t) {
      return h('button.ctn-type' + (t[0] === type ? '.actif' : ''), { type: 'button', 'data-type': t[0], onclick: function () { type = t[0]; [].forEach.call(types.children, function (b) { b.classList.toggle('actif', b.getAttribute('data-type') === type); }); dessiner(); } }, [h('b', { text: t[1] }), h('span', { text: t[2] })]);
    }));
    var inModele, inSujet, inVille, inFaits, inAngle, inLien, inLienEn, inLienTexte, inLienTexteEn;
    var inNotreMarque, inNotreModele, inAnnee, inConcMarque, inConcModele, autreModele;
    function champ(lib, aide, el) { return h('label', [h('span', { text: lib }), aide ? h('span.aide', { text: aide }) : null, el]); }
    function dessiner() {
      A.vider(champs);
      inAngle = h('input.saisie', { type: 'text', maxlength: '300', placeholder: 'Facultatif : ex. les familles, l\'hiver, les premiers acheteurs' });
      inFaits = h('textarea.saisie', { maxlength: '3000' });
      if (type === 'modele') {
        if (!s.modeles.length) { champs.appendChild(h('div.ctn-etat.err', { text: 'Le site de ' + s.nom + ' n\'a pas encore été lu : « Lire le site » d\'abord (sur la page).' })); return; }
        inModele = h('select.saisie', s.modeles.map(function (m, i) { return h('option', { value: String(i), text: m.marque + ' ' + m.modele + ' — ' + m.n + ' en vente (' + [m.occasion ? m.occasion + ' occasion' : '', m.neuf ? m.neuf + ' neuf' + (m.neuf > 1 ? 's' : '') : '', m.demo ? m.demo + ' démo' : ''].filter(Boolean).join(', ') + ')' }); }));
        var seg = h('div.ctn-seg', [['occasion', 'Occasion'], ['neuf', 'Neufs et démos'], ['tous', 'Tous']].map(function (g) {
          return h('button' + (g[0] === genre ? '.actif' : ''), { type: 'button', 'data-g': g[0], onclick: function () { genre = g[0]; [].forEach.call(seg.children, function (b) { b.classList.toggle('actif', b.getAttribute('data-g') === genre); }); } }, [document.createTextNode(g[1])]);
        }));
        champs.appendChild(champ('Le modèle', 'Seulement des modèles vraiment en vente sur le site.', inModele));
        champs.appendChild(champ('Lesquels', '', seg));
        champs.appendChild(champ('Ce que l\'équipe veut dire (facultatif)', 'Des faits vrais : essai routier sur rendez-vous, préparation, garantie… Einstein n\'ajoute rien d\'autre.', inFaits));
      } else if (type === 'comparaison') {
        genre = 'tous';
        var dansSite = s.modeles.filter(function (m) { return marquesSite.some(function (x) { return sansAccent(x) === sansAccent(m.marque); }); });
        inModele = h('select.saisie', dansSite.map(function (m, i) { return h('option', { value: String(i), text: m.marque + ' ' + m.modele + ' — ' + m.n + ' sur le site' }); }).concat([h('option', { value: 'autre', text: 'Un autre modèle de la gamme (à taper)' })]));
        inNotreMarque = h('select.saisie', marquesSite.map(function (x) { return h('option', { value: x, text: x }); }));
        inNotreModele = h('input.saisie', { type: 'text', maxlength: '60', placeholder: 'ex. X5' });
        autreModele = h('div.ctn-deux', [champ('Notre marque', '', inNotreMarque), champ('Notre modèle', '', inNotreModele)]);
        var majAutre = function () { autreModele.hidden = inModele.value !== 'autre'; majListe(); };
        inModele.addEventListener('change', majAutre);
        inAnnee = h('input.saisie', { type: 'number', min: '2000', max: '2100', placeholder: 'ex. ' + new Date().getFullYear() });
        var dl = h('datalist', { id: 'ctn-concurrents' });
        inConcMarque = h('input.saisie', { type: 'text', maxlength: '40', placeholder: 'ex. Mercedes-Benz', list: 'ctn-concurrents' });
        inConcModele = h('input.saisie', { type: 'text', maxlength: '60', placeholder: 'ex. GLC' });
        var avisMarque = h('div.ctn-etat.err', { hidden: true });
        var majListe = function () {
          var mq = notreMarque(); A.vider(dl);
          (CONCURRENTS[mq] || []).forEach(function (c) { dl.appendChild(h('option', { value: c })); });
        };
        inConcMarque.addEventListener('input', function () {
          var g = marqueGroupe(inConcMarque.value, groupe);
          avisMarque.hidden = !g; avisMarque.textContent = g ? g + ' est une marque du groupe : on compare notre modèle à une AUTRE marque (ex. ' + (CONCURRENTS[notreMarque()] || ['Toyota']).slice(0, 3).join(', ') + ').' : '';
        });
        champs.appendChild(champ('Notre modèle', 'Un modèle en vente sur le site, ou un autre modèle de la gamme.', inModele));
        champs.appendChild(autreModele);
        champs.appendChild(h('div.ctn-deux', [champ('Le concurrent : la marque', 'Une autre marque que les nôtres (' + groupe.join(', ') + ').', inConcMarque), champ('Le concurrent : le modèle', '', inConcModele)]));
        champs.appendChild(dl); champs.appendChild(avisMarque);
        champs.appendChild(champ('Année-modèle (facultatif)', 'La même pour les deux.', inAnnee));
        champs.appendChild(champ('Les faits de la comparaison (80 caractères au moins)', 'Les chiffres des deux modèles avec leur source (fiche du constructeur, même année) : puissance, autonomie, espace, garantie, équipement de série. Einstein n\'utilise que ceux-là et met en avant les vrais avantages de notre modèle.', inFaits));
        inFaits.placeholder = 'ex. X3 30 xDrive 2026 : 255 ch, xDrive de série, coffre 850 L (bmw.ca). GLC 300 2026 : 255 ch, coffre 620 L (mercedes-benz.ca).';
        majAutre();
      } else if (type === 'secteur') {
        inVille = h('input.saisie', { type: 'text', maxlength: '60', placeholder: 'ex. Magog' });
        champs.appendChild(champ('La ville voisine', (s.secteurs || 0) + ' page' + ((s.secteurs || 0) > 1 ? 's' : '') + ' de secteur sur ce site (5 au plus).', inVille));
        champs.appendChild(champ('Les faits vraiment locaux (80 caractères au moins)', 'Le trajet, la livraison, ce qu\'on fait pour les clients de cette ville… Sans faits propres, Google y voit une page de porte.', inFaits));
      } else {
        inSujet = h('input.saisie', { type: 'text', maxlength: '120', placeholder: type === 'service' ? 'ex. Pneus d\'hiver' : 'ex. Soirée de lancement du nouveau X3' });
        champs.appendChild(champ('Le sujet', '', inSujet));
        champs.appendChild(champ('Les faits (40 caractères au moins)', type === 'service' ? 'Ce que votre atelier offre vraiment sur ce sujet : délais, ce qui est inclus, comment prendre rendez-vous. Pas de prix.' : 'Ce qui est vrai et utile au client. Pas de prix, pas de paiement.', inFaits));
      }
      champs.appendChild(champ('Un angle (facultatif)', '', inAngle));
      /* Un bouton vers une page du site (ex. l'article sur la location d'occasion → la page des offres) */
      inLien = h('input.saisie', { type: 'text', maxlength: '160', placeholder: '/location-bmw-occasion.html' });
      inLienEn = h('input.saisie', { type: 'text', maxlength: '160', placeholder: '/bmw-pre-owned-lease.html (facultatif)' });
      inLienTexte = h('input.saisie', { type: 'text', maxlength: '60', placeholder: 'Voir les offres de location' });
      inLienTexteEn = h('input.saisie', { type: 'text', maxlength: '60', placeholder: 'See the lease offers (facultatif)' });
      champs.appendChild(h('details.ctn-lien', [h('summary', { text: 'Un bouton vers une page du site (facultatif)' }),
        h('p.aide', { text: 'La page finira par ce bouton, avant « Nous joindre ». Une page du même site seulement (ex. la page des offres de location).' }),
        champ('Adresse de la page (français)', '', inLien), champ('Adresse anglaise', 'Vide = la même.', inLienEn),
        champ('Texte du bouton', 'Sans montant ni paiement.', inLienTexte), champ('Texte du bouton (anglais)', 'Vide = « Learn more ».', inLienTexteEn)]));
    }
    function notreMarque() {
      if (!inModele) return marquesSite[0] || '';
      if (inModele.value === 'autre') return inNotreMarque ? inNotreMarque.value : (marquesSite[0] || '');
      var dansSite = s.modeles.filter(function (m) { return marquesSite.some(function (x) { return sansAccent(x) === sansAccent(m.marque); }); });
      var mo = dansSite[Number(inModele.value)]; return mo ? (marquesSite.filter(function (x) { return sansAccent(x) === sansAccent(mo.marque); })[0] || mo.marque) : (marquesSite[0] || '');
    }
    dessiner();
    var corps = h('div', [h('p', { style: { margin: '0 0 10px', color: 'var(--encre-2)' }, text: 'Pour ' + s.nom + '. Einstein prépare un brouillon ; rien n\'est publié avant votre approbation.' }), types, champs, etat]);
    var m = A.modale({ titre: type === 'comparaison' ? 'Nouvelle comparaison' : 'Nouvelle page', corps: corps, large: true, boutons: [
      { texte: 'Annuler' },
      { texte: 'Préparer avec Einstein', classe: 'primaire', action: function (fermer, btn) {
        var b = { action: 'contenuGenerer', site: s.cle, type: type, genre: genre, angle: inAngle ? inAngle.value : '', faits: inFaits ? inFaits.value.trim() : '' };
        if (type === 'modele') { var mo = s.modeles[Number(inModele && inModele.value)]; if (!mo) return false; b.marque = mo.marque; b.modele = mo.modele; }
        if (type === 'comparaison') {
          b.marque = notreMarque();
          if (inModele.value === 'autre') b.modele = inNotreModele.value.trim();
          else { var ds = s.modeles.filter(function (x) { return marquesSite.some(function (y) { return sansAccent(y) === sansAccent(x.marque); }); })[Number(inModele.value)]; b.modele = ds ? ds.modele : ''; }
          b.concurrentMarque = inConcMarque.value.trim(); b.concurrentModele = inConcModele.value.trim(); b.annee = inAnnee.value.trim();
          if (!b.modele) { montrer('Choisissez ou tapez notre modèle.', true); return false; }
          if (!b.concurrentMarque || !b.concurrentModele) { montrer('Donnez la marque et le modèle du concurrent.', true); return false; }
          var g = marqueGroupe(b.concurrentMarque, groupe);
          if (g) { montrer(g + ' est une marque du groupe : choisissez une autre marque.', true); return false; }
          if (b.faits.length < 80) { montrer('Donnez les faits de la comparaison avec leur source (80 caractères au moins).', true); return false; }
        }
        if (inLien && inLien.value.trim()) { b.lien = inLien.value.trim(); b.lienEn = inLienEn.value.trim(); b.lienTexte = inLienTexte.value.trim(); b.lienTexteEn = inLienTexteEn.value.trim(); }
        if (type === 'secteur') { b.ville = inVille.value.trim(); if (b.faits.length < 80 || b.ville.length < 2) { montrer('Donnez la ville et des faits vraiment locaux (80 caractères au moins).', true); return false; } }
        if (type === 'service' || type === 'libre') { b.sujet = inSujet.value.trim(); if (b.sujet.length < 4 || b.faits.length < 40) { montrer('Donnez le sujet et les faits (40 caractères au moins).', true); return false; } }
        btn.disabled = true;
        montrer('Einstein écrit la page française… (30 à 60 secondes)');
        return poster(b, 150000).then(function (r) {
          montrer('Page française prête (' + r.id + '). Traduction anglaise… (30 à 60 secondes)');
          return poster({ action: 'contenuTraduire', id: r.id }, 150000).then(function () { return r.id; }, function (e) { A.toast('Page française prête ; la traduction a échoué : ' + A.erreurTexte(e) + ' (« Traduire en anglais » dans la page).', 'attention', 9000); return r.id; });
        }).then(function (id) {
          m.modifie(false); fermer();
          A.toast('Brouillon ' + id + ' prêt : relisez-le.', 'ok');
          self.charger(true).then(function () { self.fiche(id); });
          return false;
        }).catch(function (e) { btn.disabled = false; montrer(A.erreurTexte(e), true); return false; });
      } }
    ] });
    function montrer(t, err) { etat.hidden = false; etat.className = 'ctn-etat' + (err ? ' err' : ''); etat.textContent = t; }
  };

  /* ------------------------------ La fiche d'une page ------------------------------ */
  VueContenu.prototype.fiche = function (id) {
    var self = this;
    var corps = h('div.ctn-fiche', [A.chargeur('Page ' + id, { compact: true })]);
    var m = A.modale({ titre: 'Page ' + id, corps: corps, large: true, boutons: [{ texte: 'Fermer' }] });
    var onglet = 'apercu', langue = 'fr', p = null, peutApprouver = false, ideesDemandees = false, enCours = '', dernierFait = '';
    function charger() { return lirePage(id).then(function (d) { p = d.page; peutApprouver = !!d.peutApprouver; dessiner(); }).catch(function (e) { A.vider(corps); corps.appendChild(h('div.ctn-vide', { text: A.erreurTexte(e) })); }); }
    function apres(r) { if (r && r.page) { p = r.page; dessiner(); } self.charger(true); }
    function dessiner() {
      A.vider(corps);
      var site = p.siteInfo || {};
      corps.appendChild(h('div.tete', [pastille(p.etat), h('span.m', { text: [site.nom, p.typeNom, 'créée le ' + dateCourte(p.creeLe) + (p.creePar ? ' par ' + p.creePar : ''), p.approuveLe ? 'approuvée le ' + dateCourte(p.approuveLe) + ' par ' + p.approuvePar : '', p.publieLe ? 'en ligne depuis le ' + dateCourte(p.publieLe) : ''].filter(Boolean).join(' · ') })]));
      corps.appendChild(A.ligneAvancement([
        { court: 'Brouillon', titre: 'Écrit par Einstein', etat: 'fait' },
        { court: 'Anglais', titre: 'Version anglaise', etat: p.traduit ? 'fait' : 'encours' },
        { court: 'Approuvée', titre: 'Relue et approuvée par la direction', etat: p.etat === 'approuvee' || p.etat === 'publiee' ? 'fait' : (p.traduit ? 'encours' : 'afaire') },
        { court: 'En ligne', titre: 'Publiée dans D2C et vérifiée', etat: p.etat === 'publiee' ? (p.enLigne.aJour ? 'fait' : 'encours') : (p.etat === 'approuvee' ? 'encours' : 'afaire') }
      ]));
      if (p.problemes.length) corps.appendChild(h('div.ctn-boite.rouge', [h('b', { text: 'À corriger avant d\'approuver' }), h('ul', p.problemes.map(function (x) { return h('li', { text: (x.langue === 'en' ? '(anglais) ' : '') + libProbleme(x.code) + ' : « ' + x.texte + ' »' }); }))]));
      var av = p.avertissements.filter(function (a) { return a.code !== 'verifier'; });
      if (av.length) corps.appendChild(h('div.ctn-boite.ambre', [h('ul', av.map(function (a) { return h('li', { text: (a.bloquant ? 'Bloquant — ' : '') + a.texte }); }))]));
      if ((p.aVerifier || []).length) corps.appendChild(h('div.ctn-boite.bleu', [h('b', { text: 'À confirmer avant d\'approuver (Einstein n\'a fait que reprendre vos faits)' }), h('ul', p.aVerifier.map(function (t) { return h('li', { text: t }); }))]));
      var ong = h('div.ctn-onglets', [['apercu', 'Aperçu'], ['einstein', 'Demander à Einstein'], ['fr', 'Texte français'], ['en', 'Texte anglais'], ['publier', 'Publier dans D2C']].map(function (o) {
        return h('button' + (o[0] === onglet ? '.actif' : ''), { type: 'button', onclick: function () { onglet = o[0]; dessiner(); } }, [document.createTextNode(o[1])]);
      }));
      corps.appendChild(ong);
      if (onglet === 'apercu') corps.appendChild(apercu());
      else if (onglet === 'einstein') corps.appendChild(einstein());
      else if (onglet === 'fr' || onglet === 'en') corps.appendChild(editeur(onglet));
      else corps.appendChild(publication());
      m.boutons(boutons());
    }
    function libProbleme(c) { return ({ montant: 'Un montant ou un pourcentage (les prix ne vont que sous les véhicules)', paiement: 'Un paiement, un taux ou un rabais', superlatif: 'Une affirmation invérifiable', titre: 'Titre manquant', vide: 'Aucune section', marqueGroupe: 'Une autre marque du groupe dans une comparaison (on ne compare pas nos marques entre elles)' })[c] || c; }
    /* 16 nov. : Einstein sur la page déjà écrite — idées, modification à la demande, version d'avant */
    function einstein() {
      var box = h('div.ctn-ein');
      if (p.etat === 'retiree') { box.appendChild(h('div.ctn-vide', { text: 'Page retirée : remettez-la en brouillon d\'abord.' })); return box; }
      if (enCours) box.appendChild(h('div.ctn-etat', { text: enCours }));
      if (dernierFait) box.appendChild(h('div.ctn-boite.bleu', [h('b', { text: 'Fait : ' }), document.createTextNode(dernierFait + ' '), h('button.btn.petit', { type: 'button', text: 'Voir l\'aperçu', onclick: function () { onglet = 'apercu'; dessiner(); } })]));
      if (p.avant) box.appendChild(h('div.ctn-boite.ambre', [h('b', { text: 'Dernière modification par Einstein' + (p.avant.le ? ' (' + dateCourte(p.avant.le) + (p.avant.par ? ', ' + p.avant.par : '') + ')' : '') + ' : ' }),
        document.createTextNode('« ' + p.avant.demande + ' »' + (p.avant.changements ? ' — ' + p.avant.changements : '') + ' '),
        h('button.btn.petit', { type: 'button', text: 'Revenir à la version d\'avant', disabled: !!enCours, onclick: function () { annuler(); } })]));
      var dem = h('textarea.saisie', { maxlength: '1500', placeholder: 'ex. Raccourcis l\'introduction. Ajoute une question sur l\'essai routier. Mets l\'accent sur la conduite l\'hiver.' });
      var puces = h('div.ctn-puces', ['Plus court', 'Ton plus chaleureux', 'Un titre plus accrocheur', 'Ajoute une question fréquente utile', 'Plus de détails pour les familles', 'Mets l\'accent sur l\'hiver au Québec'].map(function (t) {
        return h('button', { type: 'button', text: t, onclick: function () { dem.value = dem.value ? dem.value.replace(/\s*$/, '') + '\n' + t + '.' : t + '.'; dem.focus(); } });
      }));
      box.appendChild(h('label', { style: { display: 'flex', flexDirection: 'column', gap: '6px', fontWeight: '700', fontSize: '14px' } }, [h('span', { text: 'Que voulez-vous changer ?' }),
        h('span', { style: { fontWeight: '400', fontSize: '13px', color: 'var(--encre-3)' }, text: 'Einstein modifie le texte français en gardant les règles (aucun prix, aucun chiffre inventé) ; la version anglaise est refaite tout de suite après. Un fait nouveau que vous donnez ici ira dans « à confirmer ».' }), puces, dem]));
      box.appendChild(h('div', [h('button.btn.primaire', { type: 'button', text: 'Modifier le texte avec Einstein', disabled: !!enCours, onclick: function () { reviser(dem.value.trim(), -1); } })]));
      box.appendChild(h('h3', { text: 'Idées d\'Einstein pour améliorer la page' }));
      var idees = p.idees || [];
      if (!idees.length && !ideesDemandees && !enCours) { ideesDemandees = true; setTimeout(proposerIdees, 0); }
      if (!idees.length) box.appendChild(h('div.ctn-vide', { text: enCours ? 'Einstein travaille…' : (ideesDemandees ? 'Einstein relit la page…' : 'Aucune idée pour le moment.') }));
      else box.appendChild(h('div.ctn-idees', idees.map(function (x, i) {
        var inFait = x.aCompleter ? h('input.saisie', { type: 'text', maxlength: '300', placeholder: x.aCompleter }) : null;
        return h('div.ctn-idee', [h('b', { text: x.titre }), h('div.p', { text: x.pourquoi }), x.aCompleter ? h('div.p', { text: 'Il faut un fait : ' + x.aCompleter }) : null,
          h('div.bas', [inFait, h('button.btn.petit.primaire', { type: 'button', text: 'Appliquer', disabled: !!enCours, onclick: function () {
            var t = x.demande;
            if (inFait) { if (!inFait.value.trim()) { A.toast('Répondez d\'abord : ' + x.aCompleter, 'attention'); inFait.focus(); return; } t += '\nFait donné par l\'équipe : ' + inFait.value.trim(); }
            reviser(t, i);
          } })])]);
      })));
      if (idees.length) box.appendChild(h('div', [h('button.btn.petit', { type: 'button', text: 'D\'autres idées', disabled: !!enCours, onclick: function () { proposerIdees(); } })]));
      return box;
    }
    function proposerIdees() {
      if (enCours) return;
      enCours = 'Einstein relit la page et prépare des idées… (15 à 40 secondes)'; if (onglet === 'einstein') dessiner();
      poster({ action: 'contenuEinstein', id: p.id, mode: 'idees' }, 120000).then(function (r) { enCours = ''; if (r.page) p = r.page; dessiner(); })
        .catch(function (e) { enCours = ''; dessiner(); A.toast(A.erreurTexte(e), 'erreur', 9000); });
    }
    function reviser(demande, idee) {
      if (demande.length < 5) { A.toast('Écrivez ce qu\'Einstein doit changer.', 'attention'); return; }
      if (enCours) return;
      dernierFait = ''; enCours = 'Einstein modifie le texte français… (30 à 60 secondes)'; dessiner();
      poster({ action: 'contenuEinstein', id: p.id, mode: 'reviser', demande: demande, idee: idee }, 150000).then(function (r) {
        if (r.page) p = r.page; dernierFait = r.changements || 'Texte modifié.';
        enCours = 'Traduction anglaise… (30 à 60 secondes)'; dessiner();
        return poster({ action: 'contenuTraduire', id: p.id }, 150000).then(function (t) { if (t.page) p = t.page; }, function (e) { A.toast('Texte français modifié ; la traduction a échoué : ' + A.erreurTexte(e) + ' (« Traduire en anglais » en bas).', 'attention', 9000); });
      }).then(function () { enCours = ''; dessiner(); self.charger(true); })
        .catch(function (e) { enCours = ''; dessiner(); A.toast(A.erreurTexte(e), 'erreur', 9000); });
    }
    function annuler() {
      A.confirmer('Revenir à la version d\'avant ?', 'Le texte d\'avant la dernière modification par Einstein revient (français et anglais).', { ok: 'Revenir' }).then(function (oui) {
        if (!oui) return;
        enCours = 'Retour à la version d\'avant…'; dessiner();
        poster({ action: 'contenuEinstein', id: p.id, mode: 'annuler' }).then(function (r) { enCours = ''; dernierFait = 'Version d\'avant remise.'; if (r.page) p = r.page; dessiner(); self.charger(true); })
          .catch(function (e) { enCours = ''; dessiner(); A.toast(A.erreurTexte(e), 'erreur', 9000); });
      });
    }
    function apercu() {
      var seg = h('div.ctn-seg', { style: { margin: '0 0 8px' } }, [['fr', 'Français'], ['en', 'English']].map(function (l) {
        return h('button' + (l[0] === langue ? '.actif' : ''), { type: 'button', onclick: function () { langue = l[0]; dessiner(); } }, [document.createTextNode(l[1])]);
      }));
      var html = langue === 'en' ? p.htmlEn : p.html;
      if (!html) return h('div', [seg, h('div.ctn-vide', { text: langue === 'en' ? 'Pas encore de version anglaise : « Traduire en anglais ».' : 'Pas de texte.' })]);
      var doc = '<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/twitter-bootstrap/4.6.2/css/bootstrap.min.css"><style>body{padding:12px 18px;font-family:Arial,Helvetica,sans-serif;color:#262626}h2[data-theme-style]{font-size:26px;border-bottom:2px solid #1c69d4;padding-bottom:6px;margin-top:10px}</style></head><body>' + html + '</body></html>';
      var f = h('iframe.ctn-apercu', { title: 'Aperçu de la page', sandbox: 'allow-popups allow-popups-to-escape-sandbox' });
      f.srcdoc = doc;
      return h('div', [seg, h('p', { style: { fontSize: '13px', color: 'var(--encre-3)', margin: '0 0 6px' }, text: 'Aperçu approximatif : sur le site, la page prend les couleurs et le menu de D2C. Les véhicules et leurs prix viennent des fiches du site, lues ' + (p.nbVehicules ? 'pour ' + p.nbVehicules + ' véhicule' + (p.nbVehicules > 1 ? 's' : '') : 'au besoin') + '.' }), f]);
    }
    function editeur(lg) {
      var t = JSON.parse(JSON.stringify((lg === 'en' ? p.en : p.fr) || null));
      if (!t) return h('div.ctn-vide', { text: 'Pas encore de version anglaise : « Traduire en anglais » (en bas).' });
      var ed = h('div.ctn-ed');
      function compte(input, max) {
        var c = h('span.compte'), maj = function () { var n = input.value.length; c.textContent = ' — ' + n + ' / ' + max; c.className = 'compte' + (n > max ? ' trop' : ''); };
        input.addEventListener('input', maj); maj(); return c;
      }
      var fT = h('input.saisie', { type: 'text', value: t.titre || '' }), fMT = h('input.saisie', { type: 'text', value: t.metaTitre || '' }), fMD = h('textarea.saisie', { text: t.metaDescription || '' });
      var fS = h('input.saisie', { type: 'text', value: t.slug || '' }), fI = h('textarea.saisie', { text: t.intro || '' });
      fMD.value = t.metaDescription || ''; fI.value = t.intro || '';
      ed.appendChild(h('label', [h('span', ['Titre de la page (H1)', compte(fT, LIM.titre)]), fT]));
      ed.appendChild(h('label', [h('span', ['Titre pour Google', compte(fMT, LIM.metaTitre)]), fMT]));
      ed.appendChild(h('label', [h('span', ['Description pour Google', compte(fMD, LIM.metaDescription)]), fMD]));
      ed.appendChild(h('label', [h('span', { text: 'Adresse de la page (sans .html)' }), fS]));
      ed.appendChild(h('label', [h('span', { text: 'Introduction' }), fI]));
      var secs = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } });
      var lignesSec = [];
      function ajouterSec(s) {
        var st = h('input.saisie', { type: 'text', value: s.titre || '' }), sp = h('textarea.saisie'), spt = h('textarea.saisie');
        sp.value = (s.paragraphes || []).join('\n\n'); spt.value = (s.points || []).join('\n');
        var bloc = h('div.ctn-sec', [h('div.haut', [h('span', { text: 'Section' }), h('button.btn.petit.fantome', { type: 'button', text: 'Retirer', onclick: function () { bloc.remove(); lignesSec = lignesSec.filter(function (x) { return x.bloc !== bloc; }); } })]),
          h('label', [h('span', { text: 'Titre' }), st]), h('label', [h('span', { text: 'Paragraphes (une ligne vide entre deux)' }), sp]), h('label', [h('span', { text: 'Points (un par ligne, facultatif)' }), spt])]);
        lignesSec.push({ bloc: bloc, t: st, p: sp, pt: spt }); secs.appendChild(bloc);
      }
      (t.sections || []).forEach(ajouterSec);
      ed.appendChild(secs);
      ed.appendChild(h('button.btn.petit', { type: 'button', text: '+ Section', onclick: function () { ajouterSec({}); } }));
      var faqs = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }), lignesFaq = [];
      function ajouterFaq(q) {
        var fq = h('input.saisie', { type: 'text', value: q.q || '' }), fr = h('textarea.saisie'); fr.value = q.r || '';
        var bloc = h('div.ctn-sec', [h('div.haut', [h('span', { text: 'Question' }), h('button.btn.petit.fantome', { type: 'button', text: 'Retirer', onclick: function () { bloc.remove(); lignesFaq = lignesFaq.filter(function (x) { return x.bloc !== bloc; }); } })]),
          h('label', [h('span', { text: 'Question' }), fq]), h('label', [h('span', { text: 'Réponse' }), fr])]);
        lignesFaq.push({ bloc: bloc, q: fq, r: fr }); faqs.appendChild(bloc);
      }
      (t.faq || []).forEach(ajouterFaq);
      ed.appendChild(h('div', { style: { fontWeight: '800', fontSize: '13px', color: 'var(--encre-3)', marginTop: '6px' }, text: 'QUESTIONS FRÉQUENTES' }));
      ed.appendChild(faqs);
      ed.appendChild(h('button.btn.petit', { type: 'button', text: '+ Question', onclick: function () { ajouterFaq({}); } }));
      ed.appendChild(h('div', [h('button.btn.primaire', { type: 'button', text: 'Enregistrer le texte ' + (lg === 'en' ? 'anglais' : 'français'), onclick: function (e) {
        var b = e.currentTarget, nv = { titre: fT.value, metaTitre: fMT.value, metaDescription: fMD.value, slug: fS.value, intro: fI.value,
          sections: lignesSec.map(function (x) { return { titre: x.t.value, paragraphes: x.p.value.split(/\n\s*\n/).map(function (s) { return s.trim(); }).filter(Boolean), points: x.pt.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean) }; }),
          faq: lignesFaq.map(function (x) { return { q: x.q.value, r: x.r.value }; }) };
        var corpsP = { action: 'contenuModifier', id: p.id }; corpsP[lg] = nv;
        b.disabled = true;
        poster(corpsP).then(function (r) { m.modifie(false); A.toast('Texte enregistré.' + (p.etat !== 'brouillon' ? ' La page redevient un brouillon : à approuver de nouveau.' : ''), 'ok'); apres(r); }).catch(function (er) { b.disabled = false; A.toast(A.erreurTexte(er), 'erreur', 8000); });
      } })]));
      return ed;
    }
    function publication() {
      var x = p.d2c || {}, site = p.siteInfo || {};
      var pret = p.etat === 'approuvee' || p.etat === 'publiee';
      var el = p.enLigne || {};
      return h('div.ctn-pub', [
        pret ? null : h('div.ctn-boite.ambre', { text: 'La page doit d\'abord être approuvée par la direction (bouton « Approuver » en bas).' }),
        /* 16 nov. : un seul clic — le favori crée la page, met le texte et le titre pour Google, puis vérifie qu'elle est en ligne */
        h('p.ctn-un-clic', [h('b', { text: 'Un clic : ' }), document.createTextNode('dans D2C, ouvrez My Sites › ' + (site.base || '').replace(/^https?:\/\/(www\.)?/, '') + ' › Configurator › Custom Pages, puis cliquez le favori. Il crée la page ' + (x.urlFr || '') + ', met le texte français et anglais et le titre pour Google, puis vérifie qu\'elle est en ligne. Google la trouve par le plan du site de D2C.')]),
        h('div.fav', [favori()]),
        h('details.ctn-main', [h('summary', { text: 'Le faire à la main (sans le favori)' }),
          copie('Nom (français) :', x.nomFr), copie('Nom (anglais) :', x.nomEn), copie('Adresse (français) :', x.urlFr), copie('Adresse (anglais) :', x.urlEn),
          h('div', { text: 'Custom Pages › ligne vide au bas du tableau · Tab : None · Type : HTML · « Add », puis « Save ». Le texte : crayon de la page. Le titre pour Google : bouton « i ».' }),
          copie('Titre (français) :', x.metaTitre), copie('Titre (anglais) :', x.metaTitreEn), copie('Description (français) :', x.metaDescription), copie('Description (anglais) :', x.metaDescriptionEn)]),
        h('div.ctn-boite.' + (el.aJour ? 'bleu' : 'ambre'), { text: el.le ? (el.aJour ? 'En ligne et à jour (vérifié le ' + dateCourte(el.le) + ') : ' + el.url : (el.code === 404 ? 'La page n\'existe pas encore à ' + el.url + ' (vérifié le ' + dateCourte(el.le) + ').' : (el.trouve ? 'La page en ligne porte une ancienne version (vérifié le ' + dateCourte(el.le) + ') : republiez avec le favori.' : 'La page en ligne ne porte pas ce texte (vérifié le ' + dateCourte(el.le) + ').'))) : 'Pas encore vérifiée en ligne.' })
      ]);
    }
    function boutons() {
      var l = [{ texte: 'Fermer' }];
      var act = function (texte, classe, fn) { l.push({ texte: texte, classe: classe, action: function (f, b) { b.disabled = true; Promise.resolve(fn()).then(function () { b.disabled = false; }, function (e) { b.disabled = false; A.toast(A.erreurTexte(e), 'erreur', 9000); }); return false; } }); };
      if (p.etat === 'retiree') { act('Remettre en brouillon', '', function () { return poster({ action: 'contenuEtat', id: p.id, etat: 'brouillon' }).then(apres); }); return l; }
      act('Retirer', 'danger', function () { return A.confirmer('Retirer ' + p.id + ' ?', 'La page ne sera plus proposée. Si elle est en ligne, retirez-la aussi dans D2C (Custom Pages).', { ok: 'Retirer', danger: true }).then(function (oui) { return oui ? poster({ action: 'contenuEtat', id: p.id, etat: 'retiree' }).then(apres) : null; }); });
      if (p.etat === 'brouillon') {
        act(p.traduit ? 'Refaire la traduction' : 'Traduire en anglais', '', function () { A.toast('Traduction par Einstein… (30 à 60 secondes)', 'info', 5000); return poster({ action: 'contenuTraduire', id: p.id }, 150000).then(function (r) { A.toast('Version anglaise prête.', 'ok'); apres(r); }); });
        if (peutApprouver) act('Approuver…', 'primaire', approuver);
      } else {
        act('Remettre en brouillon', '', function () { return poster({ action: 'contenuEtat', id: p.id, etat: 'brouillon' }).then(apres); });
        act('Vérifier en ligne', 'primaire', function () { return poster({ action: 'contenuVerifier', id: p.id, force: true }, 60000).then(function (r) { var e = (r.page || {}).enLigne || {}; A.toast(e.aJour ? 'En ligne et à jour.' : 'Pas encore à jour en ligne.', e.aJour ? 'ok' : 'attention'); apres(r); }); });
      }
      return l;
    }
    function approuver() {
      return new Promise(function (res) {
        var cb = h('input', { type: 'checkbox' });
        var bl = p.avertissements.filter(function (a) { return a.bloquant; });
        var corpsA = h('div', [
          h('p', { style: { margin: '0 0 8px' }, text: 'En approuvant, vous confirmez que chaque fait de la page est vrai pour ' + ((p.siteInfo || {}).nom || 'la concession') + ', en français et en anglais.' }),
          p.type === 'comparaison' ? h('div.ctn-boite.ambre', { text: 'Comparaison : chaque chiffre sur le ' + ((p.params || {}).concurrentMarque || 'concurrent') + ' ' + ((p.params || {}).concurrentModele || '') + ' vient de sa fiche officielle, même année, et rien n\'est faux ni trompeur (Loi sur la concurrence, Loi sur la protection du consommateur).' }) : null,
          (p.aVerifier || []).length ? h('div.ctn-boite.bleu', [h('b', { text: 'À confirmer' }), h('ul', p.aVerifier.map(function (t) { return h('li', { text: t }); }))]) : null,
          bl.length || p.problemes.length ? h('div.ctn-boite.rouge', { text: 'Le serveur refusera : ' + (p.problemes.length ? p.problemes.length + ' problème(s) à corriger. ' : '') + bl.map(function (a) { return a.texte; }).join(' ') }) : null,
          h('label.ctn-relu', [cb, h('span', { text: 'J\'ai relu la page et vérifié chaque fait.' })])
        ]);
        A.modale({ titre: 'Approuver ' + p.id, corps: corpsA, proteger: false, boutons: [{ texte: 'Annuler', action: function (f) { f(); res(); return false; } },
          { texte: 'Approuver', classe: 'primaire', action: function (f, b) {
            if (!cb.checked) { A.toast('Cochez « J\'ai relu la page et vérifié chaque fait ».', 'attention'); return false; }
            b.disabled = true;
            poster({ action: 'contenuEtat', id: p.id, etat: 'approuvee', relu: true }).then(function (r) { f(); A.toast(p.id + ' approuvée. Pour la mettre en ligne : D2C › Custom Pages du site › un clic sur le favori « Automax → D2C (pages) ».', 'ok', 9000); onglet = 'publier'; apres(r); res(); }).catch(function (e) { b.disabled = false; A.toast(A.erreurTexte(e), 'erreur', 10000); });
            return false;
          } }], onFermer: function () { res(); } });
      });
    }
    charger();
  };

  AMX.contenu = { charger: charger, peutVoir: peutVoir, compteur: compteur, vider: function () { cache = { rep: null, le: 0 }; } };
  AMX.section('contenu', {
    titre: 'Générateur de contenu', icone: 'aide', ordre: 37,
    visible: function () { return peutVoir(); },
    monter: function (conteneur, ctx) { return new VueContenu(conteneur, ctx); }
  });
})();
