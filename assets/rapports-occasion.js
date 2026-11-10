/* =========================================================================
   Inventaire › Occasion › Rapports — les échanges par conseiller et les achats par acheteur (10 novembre 2026)

   Maxime : « des rapports sur les échanges et les achats de véhicules d'occasion : un rapport par concession pour les
   échanges chaque semaine qui ramène les résultats par conseiller des ventes, et un rapport pour les acheteurs pour les
   achats et le statut de leur véhicule acheté et les ventes ; ça doit aussi être accessible dans le site ».

   Les données viennent du serveur (RapportsOccasion.gs) : GET ?rapportEchanges=1 / ?rapportAchats=1 avec la concession et la
   période ; rien n'est retapé. Un échange est relié à sa vente par le # stock (27049A = l'échange de la vente 27049) ou par ce
   que le livre en dit ; ce qu'il est devenu : en stock, revendu au détail, en gros (Canada / É.-U.), vendu aux É.-U., sorti.
   Règle v138 : filtres → « Chiffres et liste » → chiffres de la liste filtrée → tableau par personne → liste. Montants seulement
   avec le droit (le serveur les retire). Le courriel du lundi se règle ici (carte « Courriel du lundi », la propriétaire).
   ========================================================================= */
(function () {
  'use strict';
  var h = AMX.h, I = AMX.icones;
  var SCRIPT_PAS_A_JOUR = 'Le script n\'est pas à jour : déployez une nouvelle version (RapportsOccasion.gs).';
  var VUES = ['echanges', 'achats', 'hausses'];
  /* 10 nov. : hausses de valeur d'échange (HaussesEchange.gs) — la valeur donnée au client dépasse celle de l'évaluateur. */
  var SOURCES_H = [['torque', 'Torque', 'violet'], ['evaluation', 'Évaluation ScanAutomax', 'vert'], ['demande', 'Demande d\'évaluation', 'bleu'], ['livre', 'Livre des ventes', 'sarcelle']];
  var SOURCE_LIB = {}; SOURCES_H.forEach(function (x) { SOURCE_LIB[x[0]] = x; });
  var SANS_EVAL = '__sans';
  function cleNom(n) { return String(n || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim() || SANS_EVAL; }
  function pctTxt(x) { return nb(x) ? (Math.round(x * 10) / 10).toLocaleString('fr-CA') + ' %' : ''; }
  var PERIODES = [['semaine', 'La semaine dernière'], ['semaineCourante', 'Cette semaine'], ['mois', 'Ce mois-ci'], ['moisPrec', 'Le mois dernier'],
    ['30j', '30 derniers jours'], ['90j', '90 derniers jours'], ['annee', 'Depuis le 1er janvier'], ['dates', 'Dates…']];
  var ETATS = [['stock', 'En stock', 'bleu'], ['detail', 'Vendu au détail', 'vert'], ['gros', 'Vendu en gros', 'sarcelle'], ['us', 'Vendu aux É.-U.', 'violet'], ['parti', 'Sorti du registre', 'gris'], ['inconnu', 'Introuvable', 'ambre']];
  var ETAT_LIB = {}; ETATS.forEach(function (e) { ETAT_LIB[e[0]] = e; });
  var STATUTS = { achete: 'Acheté', transitqc: 'Transit QC', stock: 'En stock', transit: 'Expédié', arrive: 'Vendu', manheimpa: 'Manheim PA', comptabilise: 'Comptabilisé' };
  var REGISTRES = { US: 'É.-U.', CAN: 'Canada', DETAIL: 'Detail' };
  var LONG = 45;
  var SANS_VENTE = '__sans', SANS_ACHETEUR = '__aucun';

  function nb(x) { return typeof x === 'number' && isFinite(x); }
  function argent(x) { return nb(x) ? AMX.fmtArgent(x) : '—'; }
  function unites(x) { if (!nb(x)) return '—'; return (Math.round(x * 10) / 10).toLocaleString('fr-CA', { maximumFractionDigits: 1 }); }
  function jour(iso) { if (!iso) return ''; var d = new Date(iso + 'T12:00:00'); return isFinite(d.getTime()) ? d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' }) : iso; }
  function jourLong(iso) { if (!iso) return ''; var d = new Date(iso + 'T12:00:00'); return isFinite(d.getTime()) ? d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' }) : iso; }
  function aujIso() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function peutVoir() {
    var p = AMX.session && AMX.session.perms, r = String((AMX.session && AMX.session.role) || '');
    if (!p) return AMX.estAdmin();
    return !!(p.voirResultats || p.modifierMontants || p.ficheAchat || p.changerStatut || p.gererUtilisateurs || p.gererAdmins || ['proprietaire', 'admin', 'gestionnaire', 'direction_ventes', 'evaluateur'].indexOf(r) >= 0);
  }
  function estDirection() { var r = String((AMX.session && AMX.session.role) || ''); return AMX.estAdmin() || ['gestionnaire', 'direction_ventes'].indexOf(r) >= 0; }

  /* ------------------------------ Données ------------------------------ */
  var cache = {};
  function charger(vue, cie, per, force) {
    var cle = vue + '|' + (cie || '*') + '|' + per.du + '|' + per.au, c = cache[cle];
    if (!force && c && c.rep && Date.now() - c.quand < AMX.dureeCopie(120000)) return Promise.resolve(c.rep);
    if (!force && c && c.promesse) return c.promesse;
    var params = vue === 'achats' ? { rapportAchats: 1 } : (vue === 'hausses' ? { haussesEchange: 1 } : { rapportEchanges: 1 });
    if (force === 'frais') params.frais = 1;
    params.du = per.du; params.au = per.au; if (cie) params.compagnie = cie;
    c = cache[cle] = cache[cle] || {};
    c.promesse = AMX.get(params, { delai: 90000, gz: true }).then(function (d) {
      AMX.verifier(d, 'Rapport illisible');
      if (!Array.isArray(d.lignes)) throw new Error(SCRIPT_PAS_A_JOUR);
      c.rep = d; c.quand = Date.now(); c.promesse = null; return d;
    }, function (e) { c.promesse = null; throw e; });
    return c.promesse;
  }
  function vider() { cache = {}; }

  /* La période choisie → { du, au, nom }. */
  function periode(nom, du, au) {
    var auj = aujIso(), d = new Date(auj + 'T12:00:00'), plus = function (iso, n) { var x = new Date(iso + 'T12:00:00'); x.setDate(x.getDate() + n); return x.getFullYear() + '-' + ('0' + (x.getMonth() + 1)).slice(-2) + '-' + ('0' + x.getDate()).slice(-2); };
    var lundi = plus(auj, -((d.getDay() + 6) % 7));
    if (nom === 'dates' && du && au && du <= au) return { du: du, au: au, nom: nom };
    if (nom === 'semaine') return { du: plus(lundi, -7), au: plus(lundi, -1), nom: nom };
    if (nom === 'semaineCourante') return { du: lundi, au: auj, nom: nom };
    if (nom === '30j') return { du: plus(auj, -29), au: auj, nom: nom };
    if (nom === '90j') return { du: plus(auj, -89), au: auj, nom: nom };
    if (nom === 'moisPrec') { var fin = plus(auj.slice(0, 8) + '01', -1); return { du: fin.slice(0, 8) + '01', au: fin, nom: nom }; }
    if (nom === 'annee') return { du: auj.slice(0, 4) + '-01-01', au: auj, nom: nom };
    return { du: auj.slice(0, 8) + '01', au: auj, nom: 'mois' };
  }

  /* Le sommaire par conseiller (même calcul que RPO_parConseiller_ du serveur). */
  function parConseiller(lignes, ventesPar) {
    var p = {};
    var obtenir = function (cle, nom, genre) { return p[cle] = p[cle] || { cle: cle, nom: nom, genre: genre, ventes: 0, echanges: 0, valeur: 0, nValeur: 0, overUnder: 0, nOverUnder: 0, cout: 0, nCout: 0, enStock: 0, joursStock: 0, longs: 0, detail: 0, gros: 0, us: 0, partis: 0, profit: 0, nProfit: 0, joursVente: 0, nJoursVente: 0 }; };
    Object.keys(ventesPar || {}).forEach(function (k) { var v = ventesPar[k]; obtenir(k, v.nom, v.genre).ventes += v.n; });
    lignes.forEach(function (l) {
      l.conseillers.forEach(function (r) {
        var x = obtenir(r.cle, r.nom, r.genre), part = r.part, e = l.echange;
        x.echanges += part;
        if (nb(e.valeur)) { x.valeur += e.valeur * part; x.nValeur += part; }
        if (nb(e.overUnder)) { x.overUnder += e.overUnder * part; x.nOverUnder += part; }
        if (nb(e.cout)) { x.cout += e.cout * part; x.nCout += part; }
        if (l.etat === 'stock') { x.enStock += part; if (nb(l.jours)) x.joursStock += l.jours * part; if ((l.jours || 0) > LONG) x.longs += part; }
        if (l.etat === 'detail') x.detail += part; if (l.etat === 'gros') x.gros += part; if (l.etat === 'us') x.us += part; if (l.etat === 'parti') x.partis += part;
        if (l.revente && nb(l.revente.profit)) { x.profit += l.revente.profit * part; x.nProfit += part; }
        if (l.revente && nb(l.jours) && ['detail', 'gros', 'us'].indexOf(l.etat) >= 0) { x.joursVente += l.jours * part; x.nJoursVente += part; }
      });
    });
    return Object.keys(p).map(function (k) {
      var x = p[k];
      x.taux = x.ventes > 0 ? Math.round(x.echanges / x.ventes * 100) : null;
      x.joursStockMoy = x.enStock > 0 ? Math.round(x.joursStock / x.enStock) : null;
      x.joursVenteMoy = x.nJoursVente > 0 ? Math.round(x.joursVente / x.nJoursVente) : null;
      return x;
    }).sort(function (a, b) { return (b.echanges - a.echanges) || (b.ventes - a.ventes) || String(a.nom).localeCompare(String(b.nom), 'fr'); });
  }
  /* Le sommaire par acheteur (même calcul que RPO_parAcheteur_). */
  function parAcheteur(lignes) {
    var p = {};
    lignes.forEach(function (l) {
      var a = l.acheteur, x = p[a.cle] = p[a.cle] || { cle: a.cle, nom: a.nom, courriel: a.courriel, achats: 0, cout: 0, nCout: 0, enStock: 0, joursStock: 0, longs: 0, valeurStock: 0, detail: 0, gros: 0, us: 0, partis: 0, profit: 0, nProfit: 0, gagnants: 0, joursVente: 0, nJoursVente: 0 };
      x.achats++;
      var c = nb(l.cout) ? l.cout : l.prixAchat; if (nb(c)) { x.cout += c; x.nCout++; }
      if (l.etat === 'stock') { x.enStock++; if (nb(l.jours)) x.joursStock += l.jours; if ((l.jours || 0) > LONG) x.longs++; if (nb(c)) x.valeurStock += c; }
      if (l.etat === 'detail') x.detail++; if (l.etat === 'gros') x.gros++; if (l.etat === 'us') x.us++; if (l.etat === 'parti') x.partis++;
      if (l.revente && nb(l.revente.profit)) { x.profit += l.revente.profit; x.nProfit++; if (l.revente.profit >= 0) x.gagnants++; }
      if (l.revente && nb(l.jours) && ['detail', 'gros', 'us'].indexOf(l.etat) >= 0) { x.joursVente += l.jours; x.nJoursVente++; }
    });
    return Object.keys(p).map(function (k) {
      var x = p[k];
      x.joursStockMoy = x.enStock > 0 ? Math.round(x.joursStock / x.enStock) : null;
      x.joursVenteMoy = x.nJoursVente > 0 ? Math.round(x.joursVente / x.nJoursVente) : null;
      x.profitMoy = x.nProfit > 0 ? Math.round(x.profit / x.nProfit) : null;
      return x;
    }).sort(function (a, b) { return (b.achats - a.achats) || String(a.nom).localeCompare(String(b.nom), 'fr'); });
  }

  /* ------------------------------ Section ------------------------------ */
  AMX.section('rapportsocc', {
    titre: 'Rapports échanges et achats', icone: 'resultat', ordre: 24,
    visible: function () { return peutVoir(); },
    monter: function (c, ctx) { return new VueRapports(c, ctx); }
  });
  AMX.rapportsOccasion = { charger: charger, vider: vider, parConseiller: parConseiller, parAcheteur: parAcheteur, periode: periode };

  /* Hausses : par évaluateur et par concession. */
  function parEvaluateur(lignes, seuil) {
    var m = {};
    lignes.forEach(function (l) {
      var k = cleNom(l.evaluateur), x = m[k] = m[k] || { cle: k, nom: l.evaluateur || '(sans évaluateur)', n: 0, plus: 0, total: 0, max: 0, cies: {} };
      x.n++; x.total += l.ecart || 0; x.max = Math.max(x.max, l.ecart || 0); if ((l.ecart || 0) > (seuil || 1000)) x.plus++; x.cies[l.compagnie] = 1;
    });
    return Object.keys(m).map(function (k) { var x = m[k]; x.moyenne = x.n ? x.total / x.n : 0; return x; }).sort(function (a, b) { return b.total - a.total; });
  }
  /* Le nombre d'évaluations (Torque et ScanAutomax) d'une concession dans la période : les mois, au prorata des jours. */
  function evaluationsPeriode(base, c, du, au) {
    var b = base && base[c]; if (!b || !du || !au) return 0;
    var total = 0;
    Object.keys(b).forEach(function (m) {
      var d1 = m + '-01', fin = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0), jours = fin.getDate(), d2 = m + '-' + ('0' + jours).slice(-2);
      var a = du > d1 ? du : d1, z = au < d2 ? au : d2; if (a > z) return;
      var n = Math.round((new Date(z + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5) + 1;
      total += b[m] * n / jours;
    });
    return total;
  }
  function parConcessionH(lignes, seuil, base, du, au) {
    var m = {};
    lignes.forEach(function (l) {
      var x = m[l.compagnie] = m[l.compagnie] || { cie: l.compagnie, n: 0, plus: 0, total: 0, max: 0, nEval: 0 };
      x.n++; x.total += l.ecart || 0; x.max = Math.max(x.max, l.ecart || 0); if ((l.ecart || 0) > (seuil || 1000)) x.plus++;
      if ((l.sources || [l.source]).some(function (s) { return s === 'torque' || s === 'evaluation'; })) x.nEval++;
    });
    return Object.keys(m).map(function (k) {
      var x = m[k], ev = evaluationsPeriode(base, k, du, au);
      x.moyenne = x.n ? x.total / x.n : 0; x.evals = Math.round(ev); x.taux = ev >= 1 && x.nEval <= ev ? Math.round(x.nEval * 1000 / ev) / 10 : null;
      return x;
    }).sort(function (a, b) { return b.total - a.total; });
  }

  function VueRapports(conteneur, ctx) {
    injecterCss();
    var self = this, pr = (ctx && ctx.params) || {};
    this.conteneur = conteneur; this.detruit = false; this.generation = 0;
    this.vue = VUES.indexOf(ctx && ctx.onglet) >= 0 ? ctx.onglet : (VUES.indexOf(pr.vue) >= 0 ? pr.vue : 'echanges');
    if (pr.cie) AMX.choisirCompagnie(String(pr.cie).toUpperCase());
    this.perNom = pr.du && pr.au ? 'dates' : AMX.memo.lire('rpo_periode', 'semaine');
    this.du = pr.du || ''; this.au = pr.au || '';
    this.f = { q: '', etat: '', personne: pr.acheteur || pr.conseiller || pr.evaluateur || '', plus: false };
    if (this.vue === 'achats' && !this.f.personne && !estDirection() && AMX.session.perms && AMX.session.perms.estAcheteur) this.f.personne = String(AMX.session.courriel || '').toLowerCase();
    this.d = null; this.erreur = '';
    this.construire();
    this.charger(false);
    this.surCie = function () { if (!self.detruit) { self.f.personne = ''; self.charger(false); } };
    document.addEventListener('amx:compagnie', this.surCie);
  }
  VueRapports.prototype.demonter = function () { this.detruit = true; this.generation++; document.removeEventListener('amx:compagnie', this.surCie); };
  VueRapports.prototype.naviguer = function (ctx) {
    var v = ctx && ctx.onglet; if (VUES.indexOf(v) < 0 || v === this.vue) return;
    this.vue = v; this.f = { q: '', etat: '', personne: '', plus: false }; this.elQ.value = ''; this.d = null; this.majBoutons(); this.charger(false);
  };
  VueRapports.prototype.cie = function () { return AMX.compagnieChoisie('inventaire') || ''; };
  VueRapports.prototype.per = function () { return periode(this.perNom, this.du, this.au); };

  VueRapports.prototype.construire = function () {
    var self = this;
    this.elTitre = h('h1', 'Rapports');
    this.elSous = h('p', 'Chargement…');
    this.btnRafraichir = h('button.btn', { type: 'button', html: (I.rafraichir || '') + '<span>Rafraîchir</span>', onclick: function () { self.charger(true); } });
    this.btnExport = h('button.btn', { type: 'button', html: (I.telecharger || '') + '<span>Exporter Excel</span>', onclick: function () { self.exporter(); } });
    this.btnEnvoi = h('button.btn', { type: 'button', html: (I.courriel || I.ok || '') + '<span>Courriel du lundi</span>', onclick: function () { if (self.vue === 'hausses') self.fenetreHausses(); else self.fenetreEnvoi(); } });
    this.btnEnvoi.hidden = !AMX.estAdmin();
    this.btnRelire = h('button.btn', { type: 'button', html: (I.rafraichir || '') + '<span>Relire les sources maintenant</span>', onclick: function () { self.charger('frais'); } });
    this.btnRelire.hidden = true;
    var actions = [this.btnRafraichir, this.btnExport, this.btnEnvoi, this.btnRelire];
    this.elCies = h('div.barre-cies');
    this.selPer = h('select.saisie#rpo-periode', { 'aria-label': 'Période', onchange: function () { self.perNom = self.selPer.value; if (self.perNom !== 'dates') AMX.memo.ecrire('rpo_periode', self.perNom); self.majDates(); if (self.perNom !== 'dates' || (self.inDu.value && self.inAu.value)) self.charger(false); } },
      PERIODES.map(function (p) { return h('option', { value: p[0], text: p[1] }); }));
    this.selPer.value = this.perNom;
    this.inDu = h('input.saisie#rpo-du', { type: 'date', 'aria-label': 'Du', value: this.du, onchange: function () { self.du = self.inDu.value; if (self.du && self.au) self.charger(false); } });
    this.inAu = h('input.saisie#rpo-au', { type: 'date', 'aria-label': 'Au', value: this.au, onchange: function () { self.au = self.inAu.value; if (self.du && self.au) self.charger(false); } });
    this.elDates = h('span.rpo-dates', [this.inDu, h('span', '→'), this.inAu]);
    this.elQ = h('input.saisie#rpo-recherche', { type: 'search', placeholder: '# stock, modèle, NIV, nom…', 'aria-label': 'Chercher', autocomplete: 'off',
      oninput: AMX.debounce(function (e) { self.f.q = e.target.value; self.rafraichir(); }, 150),
      onkeydown: function (e) { if (e.key === 'Escape' && self.elQ.value) { e.stopPropagation(); self.elQ.value = ''; self.f.q = ''; self.rafraichir(); } } });
    this.selPers = h('select.saisie#rpo-personne', { 'aria-label': 'Personne', onchange: function () { self.f.personne = self.selPers.value; self.rafraichir(); } });
    this.elEtats = h('div.inv2-statuts#rpo-etats', { role: 'group', 'aria-label': 'Ce qu\'il est devenu' });
    this.elFiltres = h('div.inv2-filtres.rpo-filtres', [
      h('div.rpo-ligne', [this.selPer, this.elDates, h('div.recherche.inv2-recherche', [h('span', { html: I.recherche }), this.elQ]), this.selPers]),
      h('div.rpo-ligne', [this.elEtatsLib = h('span.rpo-lib', 'Devenu'), this.elEtats])]);
    this.elPortee = h('div.portee-chiffres');
    this.elKpis = h('div.kpis.rpo-kpis');
    this.elPar = h('div.carte.rpo-par');
    this.elListe = h('div.carte.rpo-liste');
    this.conteneur.appendChild(h('div.page.rpo-page', [h('div.entete-page', [h('div', [this.elTitre, this.elSous]), h('div.actions', AMX.actionsEntete ? AMX.actionsEntete(actions, []) : actions)]),
      this.elCies, this.elFiltres, this.elPortee, this.elKpis, this.elPar, this.elListe]));
    this.majDates();
    this.majBoutons();
  };
  VueRapports.prototype.majBoutons = function () {
    var hs = this.vue === 'hausses';
    var sp = this.btnEnvoi.querySelector('span'); if (sp) sp.textContent = hs ? 'Courriel et texto des hausses' : 'Courriel du lundi';
    this.btnRelire.hidden = !(hs && AMX.estAdmin());
  };
  VueRapports.prototype.majDates = function () { this.elDates.hidden = this.perNom !== 'dates'; };

  VueRapports.prototype.charger = function (force) {
    var self = this, gen = ++this.generation, per = this.per(), vue = this.vue;
    this.elTitre.textContent = vue === 'achats' ? 'Achats par acheteur' : (vue === 'hausses' ? 'Hausses de valeur d\'échange' : 'Échanges par conseiller');
    AMX.barreConcessions(this.elCies, { domaine: 'inventaire', valeur: this.cie(), onchange: function (c) { AMX.choisirCompagnie(c); } });
    if (!this.d || force === 'frais') { AMX.vider(this.elListe); this.elListe.appendChild(AMX.chargeur(vue === 'achats' ? 'Achats' : (vue === 'hausses' ? (force === 'frais' ? 'Lecture de Torque, des évaluations et du Livre des ventes' : 'Hausses') : 'Échanges'))); }
    this.elSous.textContent = 'Lecture du ' + jour(per.du) + ' au ' + jour(per.au) + '…';
    charger(vue, this.cie(), per, force).then(function (d) {
      if (gen !== self.generation || self.detruit) return;
      self.d = d; self.erreur = ''; if (force === 'frais' && d.relu) AMX.toast('Sources relues : ' + d.relu.nouvelles + ' nouvelle(s) hausse(s)', 'ok'); else if (force) AMX.toast('Rapport relu', 'ok');
      self.rendre();
    }, function (e) {
      if (gen !== self.generation || self.detruit) return;
      self.erreur = AMX.erreurTexte(e); self.d = null;
      AMX.vider(self.elListe); self.elListe.appendChild(h('div.vide', { text: self.erreur }));
      AMX.vider(self.elKpis); AMX.vider(self.elPar); AMX.vider(self.elPortee);
      self.elSous.textContent = self.erreur;
    });
  };

  /* Les lignes que les filtres gardent (sauf `sauf`). */
  VueRapports.prototype.filtrer = function (sauf) {
    var f = this.f, d = this.d, achats = this.vue === 'achats', mots = AMX.motsCherches(f.q);
    if (!d) return [];
    if (this.vue === 'hausses') return d.lignes.filter(function (l) {
      if (sauf !== 'etat' && f.etat && (l.sources || [l.source]).indexOf(f.etat) < 0) return false;
      if (sauf !== 'plus' && f.plus && !((l.ecart || 0) > (d.seuil || 1000))) return false;
      if (sauf !== 'personne' && f.personne && cleNom(l.evaluateur) !== f.personne) return false;
      if (mots.length && !AMX.correspond([l.vin, l.vehicule, l.evaluateur, l.hausseePar, l.conseiller, l.statut, l.sourceId].filter(Boolean), mots)) return false;
      return true;
    });
    return d.lignes.filter(function (l) {
      if (sauf !== 'etat' && f.etat && l.etat !== f.etat) return false;
      if (sauf !== 'personne' && f.personne) {
        if (achats) { if (l.acheteur.cle !== f.personne) return false; }
        else if (!l.conseillers.some(function (r) { return r.cle === f.personne; })) return false;
      }
      if (mots.length) {
        var champs = achats ? [l.stock, l.vin, l.vehicule, l.acheteur.nom, l.fournisseur, l.revente && l.revente.venduA]
          : [l.echange.stock, l.echange.vin, l.echange.vehicule, l.vente && l.vente.stock, l.vente && l.vente.vehicule, l.conseillers.map(function (r) { return r.nom; }).join(' ')];
        if (!AMX.correspond(champs.filter(Boolean), mots)) return false;
      }
      return true;
    });
  };
  VueRapports.prototype.rendre = function () {
    var d = this.d, self = this;
    var lu = d.genereLe ? new Date(d.genereLe) : null;
    this.elSous.textContent = 'Du ' + jourLong(d.du) + ' au ' + jourLong(d.au) + (lu ? ' · lu à ' + lu.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' }) : '')
      + (d.montants ? '' : ' · sans les montants (droit des coûts)') + (d.erreurs && d.erreurs.length ? ' · ' + d.erreurs.join(' · ') : '');
    if (this.vue === 'hausses') {
      var ls = d.dernierScan ? new Date(d.dernierScan) : null;
      this.elSous.textContent = 'Du ' + jourLong(d.du) + ' au ' + jourLong(d.au) + (ls ? ' · sources lues le ' + ls.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' }) + ' à ' + ls.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' }) : ' · sources pas encore lues')
        + ' · envois ' + (d.actif ? 'activés' : 'pas activés') + (d.erreurs && d.erreurs.length ? ' · ' + d.erreurs.join(' · ') : '');
      var evs = parEvaluateur(d.lignes, d.seuil), act = this.f.personne;
      AMX.vider(this.selPers);
      this.selPers.appendChild(h('option', { value: '', text: 'Tous les évaluateurs' }));
      evs.forEach(function (x) { self.selPers.appendChild(h('option', { value: x.cle, text: x.nom })); });
      if (act && ![].some.call(this.selPers.options, function (o) { return o.value === act; })) this.selPers.appendChild(h('option', { value: act, text: act }));
      this.selPers.value = act;
      this.rafraichir();
      return;
    }
    // Le choix de la personne (conseiller ou acheteur), tiré du rapport.
    var gens = this.vue === 'achats' ? parAcheteur(d.lignes) : parConseiller(d.lignes, this.ventesPar());
    var actuel = this.f.personne;
    AMX.vider(this.selPers);
    this.selPers.appendChild(h('option', { value: '', text: this.vue === 'achats' ? 'Tous les acheteurs' : 'Tous les conseillers' }));
    if (this.vue === 'achats' && AMX.session.perms && AMX.session.perms.estAcheteur) this.selPers.appendChild(h('option', { value: String(AMX.session.courriel || '').toLowerCase(), text: 'Mes achats' }));
    gens.forEach(function (x) { if (self.vue === 'achats' ? x.achats > 0 : x.echanges > 0) self.selPers.appendChild(h('option', { value: x.cle, text: x.nom })); });
    if (actuel && ![].some.call(this.selPers.options, function (o) { return o.value === actuel; })) this.selPers.appendChild(h('option', { value: actuel, text: actuel }));
    this.selPers.value = actuel;
    this.rafraichir();
  };
  VueRapports.prototype.ventesPar = function () {
    var vp = (this.d && this.d.ventesPar) || {}, out = {};
    Object.keys(vp).forEach(function (c) { Object.keys(vp[c]).forEach(function (k) { var x = vp[c][k], y = out[k] = out[k] || { nom: x.nom, genre: x.genre, n: 0 }; y.n += x.n; }); });
    return out;
  };
  VueRapports.prototype.rafraichir = function () {
    if (!this.d) return;
    var self = this, f = this.f, achats = this.vue === 'achats', hausses = this.vue === 'hausses';
    // Pastilles « Devenu » (« Source » pour les hausses), comptées avec les autres filtres.
    AMX.vider(this.elEtats);
    this.elEtatsLib.textContent = hausses ? 'Source' : 'Devenu';
    var pourE = this.filtrer('etat');
    var pastille = function (actif, lib, n, couleur, clic) {
      self.elEtats.appendChild(h('button.inv2-pastille' + (actif ? '.actif' : ''), { type: 'button', 'aria-pressed': actif ? 'true' : 'false', onclick: clic }, [couleur ? h('i.rpo-pt.' + couleur) : null, h('span', { text: lib }), h('b', { text: String(n) })]));
    };
    pastille(!f.etat, 'Tous', pourE.length, '', function () { f.etat = ''; self.rafraichir(); });
    (hausses ? SOURCES_H : ETATS).forEach(function (e) {
      var n = pourE.filter(function (l) { return hausses ? (l.sources || [l.source]).indexOf(e[0]) >= 0 : l.etat === e[0]; }).length;
      if (!n && f.etat !== e[0]) return;
      pastille(f.etat === e[0], e[1], n, e[2], function () { f.etat = f.etat === e[0] ? '' : e[0]; self.rafraichir(); });
    });
    var liste = this.filtrer();
    var actifs = [];
    if (f.q) actifs.push('« ' + f.q + ' »');
    if (f.etat) actifs.push((hausses ? SOURCE_LIB[f.etat] : ETAT_LIB[f.etat])[1]);
    if (hausses && f.plus) actifs.push('plus de ' + argent(this.d.seuil || 1000));
    if (f.personne) { var o = [].filter.call(this.selPers.options, function (x) { return x.value === f.personne; })[0]; actifs.push(o ? o.text : f.personne); }
    var cie = this.cie();
    AMX.porteeChiffres(this.elPortee, { n: liste.length, unite: hausses ? ['hausse', 'hausses'] : (achats ? ['achat', 'achats'] : ['échange', 'échanges']), contexte: [cie ? (AMX.COMPAGNIES_TOUTES && AMX.COMPAGNIES_TOUTES[cie]) || cie : 'toutes les concessions', this.selPer.options[this.selPer.selectedIndex].text],
      filtres: actifs, effacer: function () { f.q = ''; f.etat = ''; f.personne = ''; f.plus = false; self.elQ.value = ''; self.selPers.value = ''; self.rafraichir(); } });
    if (hausses) { this.rendreKpisHausses(liste); this.rendreParHausses(liste); this.rendreListeHausses(liste); }
    else if (achats) { this.rendreKpisAchats(liste); this.rendreParAcheteur(liste); this.rendreListeAchats(liste); }
    else { this.rendreKpisEchanges(liste); this.rendreParConseiller(liste); this.rendreListeEchanges(liste); }
  };

  function tuile(val, lib, sous, cls, titre, clic) {
    return h((clic ? 'button.kpi' : 'div.kpi.inv2-fixe') + (cls ? '.' + cls : ''), { type: clic ? 'button' : undefined, title: titre || '', onclick: clic || null },
      [h('div.valeur', { text: val }), h('div.libelle', { text: lib }), sous ? h('div.sous', { text: sous }) : null]);
  }
  function somme(l, f) { return l.reduce(function (t, x) { var v = f(x); return t + (nb(v) ? v : 0); }, 0); }
  function moyenne(l) { var v = l.filter(nb); return v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : null; }

  /* ------------------------------ Échanges ------------------------------ */
  VueRapports.prototype.rendreKpisEchanges = function (liste) {
    var self = this, d = this.d, f = this.f;
    AMX.vider(this.elKpis);
    var vp = this.ventesPar(), ventes = 0;
    Object.keys(vp).forEach(function (k) { if (!f.personne || k === f.personne) ventes += vp[k].n; });
    var stock = liste.filter(function (l) { return l.etat === 'stock'; }), longs = stock.filter(function (l) { return (l.jours || 0) > LONG; });
    var vendus = liste.filter(function (l) { return ['detail', 'gros', 'us'].indexOf(l.etat) >= 0; });
    var avecV = liste.filter(function (l) { return nb(l.echange.valeur); }), avecOU = liste.filter(function (l) { return nb(l.echange.overUnder); });
    var profit = somme(vendus, function (l) { return l.revente && l.revente.profit; }), nP = vendus.filter(function (l) { return l.revente && nb(l.revente.profit); }).length;
    var relies = liste.filter(function (l) { return l.vente; }).length;
    this.elKpis.appendChild(tuile(AMX.fmtNombre(liste.length), 'Échanges', ventes ? unites(ventes) + ' ventes' + (f.etat ? '' : ' · taux ' + Math.round(relies / ventes * 100) + ' %') : '', '', 'Taux = échanges reliés à une vente ÷ ventes neuves et d\'occasion de la période. Une vente peut avoir plus d\'un échange ; une vente partagée compte une demi-unité à chaque conseiller.'));
    this.elKpis.appendChild(tuile(AMX.fmtNombre(stock.length), 'En stock', stock.length ? Math.round(moyenne(stock.map(function (l) { return l.jours; })) || 0) + ' j en moyenne' + (longs.length ? ' · ' + longs.length + ' à plus de ' + LONG + ' j' : '') : '', longs.length ? 'neg' : '', '', stock.length ? function () { f.etat = f.etat === 'stock' ? '' : 'stock'; self.rafraichir(); } : null));
    this.elKpis.appendChild(tuile(AMX.fmtNombre(vendus.length), 'Revendus', liste.filter(function (l) { return l.etat === 'detail'; }).length + ' au détail · ' + liste.filter(function (l) { return l.etat === 'gros' || l.etat === 'us'; }).length + ' en gros', '', 'Revente lue au Livre des ventes (# stock ou NIV) ou au Résultat É.-U.'));
    if (d.montants) {
      this.elKpis.appendChild(tuile(nP ? argent(profit) : '—', 'Profit à la revente', nP ? 'moyenne ' + argent(profit / nP) : 'pas encore de revente', nP && profit < 0 ? 'neg' : '', 'Profit réel inscrit par la comptabilité, sinon prévu.'));
      if (avecV.length || avecOU.length) this.elKpis.appendChild(tuile(avecV.length ? argent(somme(avecV, function (l) { return l.echange.valeur; })) : '—', 'Valeur accordée', avecOU.length ? 'over / under ' + argent(somme(avecOU, function (l) { return l.echange.overUnder; })) + ' (' + avecOU.length + ')' : avecV.length + ' inscrite(s) au livre', '', 'Seulement quand la vente inscrit sa valeur d\'échange.'));
      else this.elKpis.appendChild(tuile(argent(somme(liste, function (l) { return l.echange.cout; })), 'Coût au registre', 'valeur d\'achat des échanges', '', 'La valeur accordée n\'est presque jamais inscrite au livre : le coût au registre (ACV) la remplace.'));
    }
    var sansVente = liste.filter(function (l) { return !l.vente; }).length;
    if (sansVente) this.elKpis.appendChild(tuile(AMX.fmtNombre(sansVente), 'Vente non retrouvée', 'pas de vente au livre pour ce # stock', 'neg', 'Échange au registre dont la vente d\'origine n\'est pas au Livre des ventes (vendue avant l\'import, # stock tapé autrement).', function () { f.personne = f.personne === SANS_VENTE ? '' : SANS_VENTE; self.selPers.value = f.personne; self.rafraichir(); }));
  };
  VueRapports.prototype.rendreParConseiller = function (liste) {
    var self = this, d = this.d, mt = d.montants, f = this.f;
    AMX.vider(this.elPar);
    var vp = this.ventesPar(), lignes = parConseiller(liste, f.etat || f.q ? {} : vp);
    if (!f.etat && !f.q) lignes = lignes.filter(function (x) { return x.echanges > 0 || x.genre === 'rep'; });
    if (!lignes.length) { this.elPar.hidden = true; return; }
    this.elPar.hidden = false;
    this.elPar.appendChild(h('div.rpo-tete', [h('h3', 'Par conseiller des ventes'), h('p.mini', { text: 'Clic sur une ligne : ses échanges seulement. Taux = échanges ÷ ventes neuves et d\'occasion de la période.' })]));
    var tete = ['Conseiller', ['Ventes', 1], ['Échanges', 1], ['Taux', 1]].concat(mt ? [['Valeur accordée', 1], ['Over / under', 1]] : []).concat([['En stock', 1], ['Revendus', 1]]).concat(mt ? [['Profit revente', 1]] : []).concat([['Jours à la revente', 1]]);
    var tbody = h('tbody');
    lignes.forEach(function (x) {
      var actif = f.personne === x.cle;
      tbody.appendChild(h('tr.cliquable' + (actif ? '.actif' : ''), { onclick: function () { f.personne = actif ? '' : x.cle; self.selPers.value = f.personne; self.rafraichir(); } }, [
        h('td', [h('b', { text: x.nom }), x.genre === 'inconnu' ? h('span.mini', { text: ' · à identifier' }) : null]),
        h('td.num', { text: x.ventes ? unites(x.ventes) : '—' }), h('td.num', [h('b', { text: unites(x.echanges) })]), h('td.num', { text: x.taux === null ? '—' : x.taux + ' %' })
      ].concat(mt ? [h('td.num', { text: x.nValeur ? argent(x.valeur) : '—' }), h('td.num' + (x.overUnder > 0 ? '.neg' : ''), { text: x.nOverUnder ? argent(x.overUnder) : '—' })] : [])
       .concat([h('td.num', { text: x.enStock ? unites(x.enStock) + (x.joursStockMoy !== null ? ' · ' + x.joursStockMoy + ' j' : '') : '—' }),
         h('td.num', { text: (x.detail + x.gros + x.us) ? unites(x.detail) + ' détail · ' + unites(x.gros + x.us) + ' gros' : '—' })])
       .concat(mt ? [h('td.num' + (x.profit < 0 ? '.neg' : ''), { text: x.nProfit ? argent(x.profit) : '—' })] : [])
       .concat([h('td.num', { text: x.joursVenteMoy !== null ? x.joursVenteMoy + ' j' : '—' })])));
    });
    this.elPar.appendChild(h('div.rpo-defile', [h('table.tableau.rpo-table', [h('thead', [h('tr', tete.map(function (t) { return Array.isArray(t) ? h('th.num', { text: t[0] }) : h('th', { text: t }); }))]), tbody])]));
  };
  VueRapports.prototype.rendreListeEchanges = function (liste) {
    var d = this.d, mt = d.montants;
    AMX.vider(this.elListe);
    if (!liste.length) { this.elListe.appendChild(h('div.vide', { text: 'Aucun échange pour cette période et ces filtres.' })); return; }
    var tete = ['Date', 'Conseiller', 'Vente', 'Échange'].concat(mt ? [['Coût / valeur', 1]] : []).concat(['Devenu', ['Jours', 1]]).concat(mt ? [['Profit', 1]] : []);
    var tbody = h('tbody');
    liste.slice(0, 600).forEach(function (l) {
      var e = l.echange, v = l.vente, rv = l.revente, et = ETAT_LIB[l.etat] || ['', l.etat, 'gris'];
      var conseillers = l.conseillers.map(function (r) { return r.nom; }).join(' / ');
      tbody.appendChild(h('tr', [
        h('td', [h('span', { text: jour(l.date) }), l.dateSource !== 'vente' ? h('div.mini', { text: l.dateSource === 'registre' ? 'entrée au registre' : 'revente' }) : null]),
        h('td', { text: conseillers }),
        h('td', v ? [h('span', { text: (v.stock ? '# ' + v.stock + ' · ' : '') + (v.vehicule || '') }), h('div.mini', { text: (v.type === 'neuf' ? 'Neuf' : 'Occasion') + ' · ' + (l.lien === 'livre' ? 'échange inscrit au livre' : 'relié par le # stock') })] : [h('span.mini', { text: 'Vente non retrouvée' })]),
        h('td', [h('span', { text: (e.stock ? '# ' + e.stock + ' · ' : '') + (e.vehicule || '—') }), e.vin ? h('div.mini.mono', { text: e.vin }) : null]),
      ].concat(mt ? [h('td.num', [h('span', { text: nb(e.valeur) ? argent(e.valeur) : argent(e.cout) }), nb(e.valeur) ? h('div.mini', { text: 'valeur accordée' + (nb(e.overUnder) ? ' · O/U ' + argent(e.overUnder) : '') }) : (nb(e.cout) ? h('div.mini', { text: 'coût au registre' }) : null)])] : [])
       .concat([h('td', [h('span.rpo-etat.' + et[2], { text: et[1] }), rv && rv.date ? h('div.mini', { text: jour(rv.date) + (rv.type === 'wholesale' ? ' · gros ' + (rv.marche === 'US' ? 'É.-U.' : 'Canada') : '') + (rv.venduA ? ' · ' + rv.venduA : '') }) : (l.registre ? h('div.mini', { text: (REGISTRES[l.registre.feuille] || l.registre.feuille) + ' · ' + (STATUTS[l.registre.statut] || l.registre.statut) }) : null)]),
         h('td.num' + (l.etat === 'stock' && (l.jours || 0) > LONG ? '.neg' : ''), { text: nb(l.jours) ? l.jours + ' j' : '—' })])
       .concat(mt ? [h('td.num' + (rv && rv.profit < 0 ? '.neg' : ''), [h('span', { text: rv && nb(rv.profit) ? argent(rv.profit) : '—' }), rv && rv.profitSource === 'prevu' ? h('div.mini', { text: 'prévu' }) : null])] : [])));
    });
    this.elListe.appendChild(h('div.rpo-tete', [h('h3', 'Les échanges'), liste.length > 600 ? h('p.mini', { text: '600 premiers sur ' + liste.length + ' (l\'export Excel les a tous).' }) : null]));
    this.elListe.appendChild(h('div.rpo-defile', [h('table.tableau.rpo-table', [h('thead', [h('tr', tete.map(function (t) { return Array.isArray(t) ? h('th.num', { text: t[0] }) : h('th', { text: t }); }))]), tbody])]));
  };

  /* ------------------------------ Achats ------------------------------ */
  VueRapports.prototype.rendreKpisAchats = function (liste) {
    var self = this, d = this.d, f = this.f;
    AMX.vider(this.elKpis);
    var stock = liste.filter(function (l) { return l.etat === 'stock'; }), longs = stock.filter(function (l) { return (l.jours || 0) > LONG; });
    var vendus = liste.filter(function (l) { return ['detail', 'gros', 'us'].indexOf(l.etat) >= 0; });
    var cout = somme(liste, function (l) { return nb(l.cout) ? l.cout : l.prixAchat; });
    var profit = somme(vendus, function (l) { return l.revente && l.revente.profit; }), nP = vendus.filter(function (l) { return l.revente && nb(l.revente.profit); }).length;
    var jv = moyenne(vendus.map(function (l) { return l.jours; }));
    this.elKpis.appendChild(tuile(AMX.fmtNombre(liste.length), 'Achats', d.montants && cout ? argent(cout) + ' au coût' : ''));
    this.elKpis.appendChild(tuile(AMX.fmtNombre(stock.length), 'Encore en stock', stock.length ? Math.round(moyenne(stock.map(function (l) { return l.jours; })) || 0) + ' j en moyenne' + (longs.length ? ' · ' + longs.length + ' à plus de ' + LONG + ' j' : '') : '', longs.length ? 'neg' : '', '', stock.length ? function () { f.etat = f.etat === 'stock' ? '' : 'stock'; self.rafraichir(); } : null));
    this.elKpis.appendChild(tuile(AMX.fmtNombre(vendus.length), 'Vendus', liste.filter(function (l) { return l.etat === 'detail'; }).length + ' au détail · ' + liste.filter(function (l) { return l.etat === 'gros'; }).length + ' en gros · ' + liste.filter(function (l) { return l.etat === 'us'; }).length + ' aux É.-U.'));
    if (d.montants) this.elKpis.appendChild(tuile(nP ? argent(profit) : '—', 'Profit', nP ? 'moyenne ' + argent(profit / nP) + ' · ' + vendus.filter(function (l) { return l.revente && nb(l.revente.profit) && l.revente.profit >= 0; }).length + ' / ' + nP + ' gagnants' : 'pas encore de vente', nP && profit < 0 ? 'neg' : '', 'Profit réel inscrit par la comptabilité, sinon prévu ; aux É.-U., le Résultat É.-U.'));
    this.elKpis.appendChild(tuile(nb(jv) ? Math.round(jv) + ' j' : '—', 'Jours avant la vente', 'de l\'achat à la vente'));
    var sans = liste.filter(function (l) { return l.acheteur.cle === SANS_ACHETEUR; }).length;
    if (sans) this.elKpis.appendChild(tuile(AMX.fmtNombre(sans), 'Sans acheteur', 'fiche d\'achat sans acheteur', 'neg', 'Inscrire l\'acheteur dans la fiche d\'achat (Occasion › Fiche d\'achat).', function () { f.personne = f.personne === SANS_ACHETEUR ? '' : SANS_ACHETEUR; self.selPers.value = f.personne; self.rafraichir(); }));
  };
  VueRapports.prototype.rendreParAcheteur = function (liste) {
    var self = this, d = this.d, mt = d.montants, f = this.f;
    AMX.vider(this.elPar);
    var lignes = parAcheteur(liste);
    if (lignes.length < 1) { this.elPar.hidden = true; return; }
    this.elPar.hidden = false;
    this.elPar.appendChild(h('div.rpo-tete', [h('h3', 'Par acheteur'), h('p.mini', { text: 'Acheteur : la fiche d\'achat, sinon l\'acheteur interne de la vente au livre, sinon les fichiers d\'achats.' })]));
    var tete = ['Acheteur', ['Achats', 1]].concat(mt ? [['Coût', 1]] : []).concat([['En stock', 1], ['Vendus', 1]]).concat(mt ? [['Profit', 1], ['Moyenne', 1]] : []).concat([['Jours avant la vente', 1]]);
    var tbody = h('tbody');
    lignes.forEach(function (x) {
      var actif = f.personne === x.cle;
      tbody.appendChild(h('tr.cliquable' + (actif ? '.actif' : ''), { onclick: function () { f.personne = actif ? '' : x.cle; self.selPers.value = f.personne; self.rafraichir(); } }, [
        h('td', [h('b', { text: x.nom }), !x.courriel && x.cle !== SANS_ACHETEUR ? h('span.mini', { text: ' · pas de compte' }) : null]), h('td.num', [h('b', { text: String(x.achats) })])
      ].concat(mt ? [h('td.num', { text: x.nCout ? argent(x.cout) : '—' })] : [])
       .concat([h('td.num' + (x.longs ? '.neg' : ''), { text: x.enStock ? x.enStock + (x.joursStockMoy !== null ? ' · ' + x.joursStockMoy + ' j' : '') : '—' }),
         h('td.num', { text: (x.detail + x.gros + x.us) ? (x.detail + x.gros + x.us) + ' (' + x.detail + ' dét. · ' + x.gros + ' gros · ' + x.us + ' É.-U.)' : '—' })])
       .concat(mt ? [h('td.num' + (x.profit < 0 ? '.neg' : ''), { text: x.nProfit ? argent(x.profit) : '—' }), h('td.num', { text: x.profitMoy !== null ? argent(x.profitMoy) : '—' })] : [])
       .concat([h('td.num', { text: x.joursVenteMoy !== null ? x.joursVenteMoy + ' j' : '—' })])));
    });
    this.elPar.appendChild(h('div.rpo-defile', [h('table.tableau.rpo-table', [h('thead', [h('tr', tete.map(function (t) { return Array.isArray(t) ? h('th.num', { text: t[0] }) : h('th', { text: t }); }))]), tbody])]));
  };
  VueRapports.prototype.rendreListeAchats = function (liste) {
    var d = this.d, mt = d.montants;
    AMX.vider(this.elListe);
    if (!liste.length) { this.elListe.appendChild(h('div.vide', { text: 'Aucun achat pour cette période et ces filtres.' })); return; }
    var tete = ['Acheté le', 'Acheteur', 'Véhicule'].concat(mt ? [['Prix / coût', 1]] : []).concat(['Statut', ['Jours', 1]]).concat(mt ? [['Profit', 1]] : []);
    var tbody = h('tbody');
    liste.slice(0, 600).forEach(function (l) {
      var rv = l.revente, et = ETAT_LIB[l.etat] || ['', l.etat, 'gris'];
      tbody.appendChild(h('tr', [
        h('td', [h('span', { text: jour(l.dateAchat) }), l.dateSource !== 'fiche' ? h('div.mini', { text: l.dateSource === 'registre' ? 'entrée au registre' : 'date de vente' }) : null]),
        h('td', [h('span', { text: l.acheteur.nom }), l.acheteurSource && l.acheteurSource !== 'fiche' ? h('div.mini', { text: l.acheteurSource === 'livre' ? 'du Livre des ventes' : 'du fichier d\'achats' }) : null]),
        h('td', [h('span', { text: (l.stock ? '# ' + l.stock + ' · ' : '') + (l.vehicule || '—') }), h('div.mini', { text: [l.fournisseur, l.vin].filter(Boolean).join(' · ') })])
      ].concat(mt ? [h('td.num', [h('span', { text: nb(l.prixAchat) ? argent(l.prixAchat) : argent(l.cout) }), nb(l.prixAchat) && nb(l.cout) && Math.abs(l.cout - l.prixAchat) > 1 ? h('div.mini', { text: 'coût ' + argent(l.cout) }) : null])] : [])
       .concat([h('td', [h('span.rpo-etat.' + et[2], { text: et[1] }), rv && rv.date ? h('div.mini', { text: jour(rv.date) + (rv.type === 'wholesale' ? ' · gros ' + (rv.marche === 'US' ? 'É.-U.' : 'Canada') : '') + (rv.venduA ? ' · ' + rv.venduA : '') }) : (l.registre ? h('div.mini', { text: (REGISTRES[l.registre.feuille] || l.registre.feuille) + ' · ' + (STATUTS[l.registre.statut] || l.registre.statut) }) : null)]),
         h('td.num' + (l.etat === 'stock' && (l.jours || 0) > LONG ? '.neg' : ''), { text: nb(l.jours) ? l.jours + ' j' : '—' })])
       .concat(mt ? [h('td.num' + (rv && rv.profit < 0 ? '.neg' : ''), [h('span', { text: rv && nb(rv.profit) ? argent(rv.profit) : '—' }), rv && rv.profitSource === 'prevu' ? h('div.mini', { text: 'prévu' }) : null])] : [])));
    });
    this.elListe.appendChild(h('div.rpo-tete', [h('h3', 'Les achats'), liste.length > 600 ? h('p.mini', { text: '600 premiers sur ' + liste.length + ' (l\'export Excel les a tous).' }) : null]));
    this.elListe.appendChild(h('div.rpo-defile', [h('table.tableau.rpo-table', [h('thead', [h('tr', tete.map(function (t) { return Array.isArray(t) ? h('th.num', { text: t[0] }) : h('th', { text: t }); }))]), tbody])]));
  };

  /* ------------------------------ Hausses de valeur d'échange ------------------------------ */
  function nomCie(c) { return (AMX.COMPAGNIES_TOUTES && AMX.COMPAGNIES_TOUTES[c]) || c; }
  VueRapports.prototype.rendreKpisHausses = function (liste) {
    var self = this, d = this.d, f = this.f, seuil = d.seuil || 1000;
    AMX.vider(this.elKpis);
    var total = somme(liste, function (l) { return l.ecart; }), plus = liste.filter(function (l) { return (l.ecart || 0) > seuil; });
    var tri = liste.map(function (l) { return l.ecart || 0; }).sort(function (a, b) { return a - b; }), med = tri.length ? tri[Math.floor(tri.length / 2)] : null;
    var top = liste.slice().sort(function (a, b) { return (b.ecart || 0) - (a.ecart || 0); })[0];
    this.elKpis.appendChild(tuile(AMX.fmtNombre(liste.length), 'Hausses', liste.length ? argent(total) + ' donnés en plus' : 'aucune dans la période', '', 'La valeur donnée au client dépasse la valeur de l\'évaluateur : Torque (valeur client contre valeur interne), évaluations et demandes de ScanAutomax, Livre des ventes (over / under). Une même voiture compte une fois.'));
    this.elKpis.appendChild(tuile(liste.length ? argent(total / liste.length) : '—', 'Hausse moyenne', nb(med) ? 'médiane ' + argent(med) : ''));
    this.elKpis.appendChild(tuile(AMX.fmtNombre(plus.length), 'Plus de ' + argent(seuil), plus.length ? argent(somme(plus, function (l) { return l.ecart; })) + ' · seuil du texto' : 'le seuil du texto', plus.length ? 'neg' : '', 'Hausses qui dépassent le seuil du texto (Hawkesbury, Ste-Marie, Hyundai).', function () { f.plus = !f.plus; self.rafraichir(); }));
    if (top) this.elKpis.appendChild(tuile(argent(top.ecart), 'Plus grosse', (top.vehicule || '') + ' · ' + nomCie(top.compagnie)));
    var cies = parConcessionH(liste, seuil, d.base, d.du, d.au), nE = 0, ev = 0;
    cies.forEach(function (x) { if (x.evals) { nE += x.nEval; ev += x.evals; } });
    if (ev >= 1 && nE <= ev) this.elKpis.appendChild(tuile(pctTxt(nE * 100 / ev), 'Des évaluations', nE + ' sur ' + Math.round(ev) + ' évaluations', '', 'Hausses vues dans une évaluation (Torque ou ScanAutomax) ÷ évaluations de la période (au prorata des jours du mois).'));
  };
  VueRapports.prototype.rendreParHausses = function (liste) {
    var self = this, d = this.d, f = this.f, seuil = d.seuil || 1000, toutes = !this.cie();
    AMX.vider(this.elPar);
    if (!liste.length) { this.elPar.hidden = true; return; }
    this.elPar.hidden = false;
    var tbody = h('tbody'), tete;
    if (toutes) {
      this.elPar.appendChild(h('div.rpo-tete', [h('h3', 'Par concession'), h('p.mini', { text: 'Clic sur une concession pour la choisir. Taux : hausses vues dans une évaluation ÷ évaluations de la période.' })]));
      tete = ['Concession', ['Hausses', 1], ['Plus de ' + argent(seuil), 1], ['Total', 1], ['Moyenne', 1], ['Plus grosse', 1], ['Taux', 1]];
      parConcessionH(liste, seuil, d.base, d.du, d.au).forEach(function (x) {
        tbody.appendChild(h('tr.cliquable', { onclick: function () { AMX.choisirCompagnie(x.cie); } }, [h('td', [h('b', { text: nomCie(x.cie) }), (d.ciesEnvoi || []).indexOf(x.cie) < 0 ? h('span.mini', { text: ' · pas d\'envoi' }) : null]),
          h('td.num', [h('b', { text: String(x.n) })]), h('td.num' + (x.plus ? '.neg' : ''), { text: String(x.plus) }), h('td.num', { text: argent(x.total) }), h('td.num', { text: argent(x.moyenne) }), h('td.num', { text: argent(x.max) }),
          h('td.num', { text: x.taux !== null ? pctTxt(x.taux) + ' (' + x.nEval + ' / ' + x.evals + ')' : '—' })]));
      });
    } else {
      this.elPar.appendChild(h('div.rpo-tete', [h('h3', 'Par évaluateur'), h('p.mini', { text: 'Évaluateur : le directeur inscrit dans Torque, celui qui a enregistré l\'évaluation ou fait la demande. Clic sur une ligne : ses hausses seulement.' })]));
      tete = ['Évaluateur', ['Hausses', 1], ['Plus de ' + argent(seuil), 1], ['Total', 1], ['Moyenne', 1], ['Plus grosse', 1]];
      parEvaluateur(liste, seuil).forEach(function (x) {
        var actif = f.personne === x.cle;
        tbody.appendChild(h('tr.cliquable' + (actif ? '.actif' : ''), { onclick: function () { f.personne = actif ? '' : x.cle; self.selPers.value = f.personne; self.rafraichir(); } }, [h('td', [h('b', { text: x.nom })]),
          h('td.num', [h('b', { text: String(x.n) })]), h('td.num' + (x.plus ? '.neg' : ''), { text: String(x.plus) }), h('td.num', { text: argent(x.total) }), h('td.num', { text: argent(x.moyenne) }), h('td.num', { text: argent(x.max) })]));
      });
    }
    this.elPar.appendChild(h('div.rpo-defile', [h('table.tableau.rpo-table', [h('thead', [h('tr', tete.map(function (t) { return Array.isArray(t) ? h('th.num', { text: t[0] }) : h('th', { text: t }); }))]), tbody])]));
  };
  VueRapports.prototype.rendreListeHausses = function (liste) {
    var d = this.d, seuil = d.seuil || 1000, toutes = !this.cie();
    AMX.vider(this.elListe);
    if (!liste.length) { this.elListe.appendChild(h('div.vide', { text: d.dernierScan ? 'Aucune hausse pour cette période et ces filtres.' : 'Les sources n\'ont pas encore été lues : elles le sont aux 2 heures de 7 h à 21 h (ou « Relire les sources maintenant »).' })); return; }
    var tete = ['Date', 'Véhicule'].concat(toutes ? ['Concession'] : []).concat(['Évaluateur', 'Haussé par / conseiller', ['Évaluateur $', 1], ['Donné $', 1], ['Hausse', 1], 'Source']);
    var tbody = h('tbody');
    liste.slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (b.ecart || 0) - (a.ecart || 0); }).slice(0, 600).forEach(function (l) {
      var envois = [l.texteLe ? (/déjà/.test(l.texteA || '') ? 'texto déjà parti (demande)' : 'texto ' + jour(l.texteLe)) : '', l.courrielLe ? 'courriel ' + jour(l.courrielLe) : ''].filter(Boolean).join(' · ');
      tbody.appendChild(h('tr', [
        h('td', { text: jour(l.date) }),
        h('td', [h('span', { text: l.vehicule || '—' }), h('div.mini', { text: [l.vin ? '…' + l.vin.slice(-8) : '', l.statut, l.disparue ? 'plus dans les sources' : ''].filter(Boolean).join(' · ') })])
      ].concat(toutes ? [h('td', { text: nomCie(l.compagnie) })] : []).concat([
        h('td', { text: l.evaluateur || '—' }),
        h('td', { text: [l.hausseePar, l.conseiller].filter(Boolean).join(' / ') || '—' }),
        h('td.num', { text: nb(l.valeurEval) ? argent(l.valeurEval) : '—' }),
        h('td.num', { text: nb(l.valeurDonnee) ? argent(l.valeurDonnee) : '—' }),
        h('td.num' + ((l.ecart || 0) > seuil ? '.neg' : ''), [h('b', { text: '+' + argent(l.ecart) }), nb(l.pct) ? h('div.mini', { text: '+' + pctTxt(l.pct) }) : (nb(l.valeurEval) ? null : h('div.mini', { text: 'over / under' }))]),
        h('td', [h('span', { text: (l.sources || [l.source]).map(function (s) { return (SOURCE_LIB[s] || [0, s])[1]; }).join(', ') }), envois ? h('div.mini', { text: envois }) : null])
      ])));
    });
    this.elListe.appendChild(h('div.rpo-tete', [h('h3', 'Les hausses'), liste.length > 600 ? h('p.mini', { text: '600 premières sur ' + liste.length + ' (l\'export Excel les a toutes).' }) : null]));
    this.elListe.appendChild(h('div.rpo-defile', [h('table.tableau.rpo-table', [h('thead', [h('tr', tete.map(function (t) { return Array.isArray(t) ? h('th.num', { text: t[0] }) : h('th', { text: t }); }))]), tbody])]));
  };

  /* ------------------------------ Export ------------------------------ */
  VueRapports.prototype.exporter = function () {
    if (typeof XLSX === 'undefined') { AMX.toast('La bibliothèque Excel n\'est pas encore chargée. Réessayez.', 'erreur'); return; }
    if (!this.d) return;
    var liste = this.filtrer(), mt = this.d.montants, achats = this.vue === 'achats', wb = XLSX.utils.book_new();
    if (!liste.length) { AMX.toast('Rien à exporter.', 'attention'); return; }
    var etat = function (l) { return (ETAT_LIB[l.etat] || [])[1] || l.etat; };
    var rv = function (l, k) { return l.revente ? l.revente[k] : ''; };
    if (this.vue === 'hausses') {
      var seuilX = this.d.seuil || 1000;
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(liste.map(function (l) {
        return { Concession: l.compagnie, Date: l.date, 'Véhicule': l.vehicule, NIV: l.vin, Statut: l.statut, 'Évaluateur': l.evaluateur, 'Haussé par': l.hausseePar, Conseiller: l.conseiller,
          'Valeur de l\'évaluateur': nb(l.valeurEval) ? l.valeurEval : '', 'Valeur donnée': nb(l.valeurDonnee) ? l.valeurDonnee : '', Hausse: l.ecart, 'Hausse (%)': nb(l.pct) ? l.pct : '',
          'Plus que le seuil': (l.ecart || 0) > seuilX ? 'oui' : '', Sources: (l.sources || [l.source]).map(function (s) { return (SOURCE_LIB[s] || [0, s])[1]; }).join(', '), 'Référence': l.sourceId,
          'Vue le': l.premiereVue, 'Texto le': l.texteLe, 'Courriel le': l.courrielLe };
      })), 'Hausses');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(parEvaluateur(liste, seuilX).map(function (x) { return { 'Évaluateur': x.nom, Hausses: x.n, 'Plus que le seuil': x.plus, Total: Math.round(x.total), Moyenne: Math.round(x.moyenne), 'Plus grosse': x.max, Concessions: Object.keys(x.cies).join(', ') }; })), 'Par évaluateur');
      XLSX.writeFile(wb, 'hausses-echange-' + (this.cie() || 'groupe').toLowerCase() + '-' + this.d.du + '-' + this.d.au + '.xlsx');
      return;
    }
    if (achats) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(parAcheteur(liste).map(function (x) {
        var o = { Acheteur: x.nom, Courriel: x.courriel, Achats: x.achats, 'En stock': x.enStock, 'Plus de 45 j': x.longs, 'Vendus détail': x.detail, 'Vendus gros': x.gros, 'Vendus É.-U.': x.us, 'Jours avant la vente': x.joursVenteMoy };
        if (mt) { o['Coût'] = x.cout; o.Profit = x.profit; o['Profit moyen'] = x.profitMoy; }
        return o;
      })), 'Par acheteur');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(liste.map(function (l) {
        var o = { Concession: l.compagnie, 'Acheté le': l.dateAchat, 'Source de la date': l.dateSource, Acheteur: l.acheteur.nom, 'Source acheteur': l.acheteurSource, '# stock': l.stock, NIV: l.vin, 'Véhicule': l.vehicule, Fournisseur: l.fournisseur,
          Registre: l.registre ? l.registre.feuille : '', 'Statut au registre': l.registre ? (STATUTS[l.registre.statut] || l.registre.statut) : '', Devenu: etat(l), Jours: l.jours, 'Vendu le': rv(l, 'date'), 'Vendu à': rv(l, 'venduA') };
        if (mt) { o['Prix d\'achat'] = l.prixAchat; o['Coût'] = l.cout; o['Prix de vente'] = rv(l, 'prix'); o.Profit = rv(l, 'profit'); o['Source du profit'] = rv(l, 'profitSource'); }
        return o;
      })), 'Achats');
    } else {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(parConseiller(liste, this.f.etat || this.f.q ? {} : this.ventesPar()).map(function (x) {
        var o = { Conseiller: x.nom, Ventes: x.ventes, 'Échanges': x.echanges, 'Taux (%)': x.taux, 'En stock': x.enStock, 'Plus de 45 j': x.longs, 'Revendus détail': x.detail, 'Revendus gros': x.gros + x.us, 'Jours à la revente': x.joursVenteMoy };
        if (mt) { o['Valeur accordée'] = x.nValeur ? x.valeur : ''; o['Over / under'] = x.nOverUnder ? x.overUnder : ''; o['Coût au registre'] = x.cout; o['Profit revente'] = x.profit; }
        return o;
      })), 'Par conseiller');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(liste.map(function (l) {
        var e = l.echange, v = l.vente || {};
        var o = { Concession: l.compagnie, Date: l.date, 'Source de la date': l.dateSource, Conseiller: l.conseillers.map(function (r) { return r.nom; }).join(' / '), 'Vente': v.id || '', '# stock vendu': v.stock || '', 'Véhicule vendu': v.vehicule || '',
          'Lien': l.lien === 'livre' ? 'inscrit au livre' : (l.lien === 'stock' ? '# stock' : ''), '# stock échange': e.stock, 'NIV échange': e.vin, 'Véhicule échange': e.vehicule, 'Km': e.km,
          Devenu: etat(l), Jours: l.jours, 'Revendu le': rv(l, 'date'), 'Revente': l.revente ? (l.revente.type === 'wholesale' ? 'gros ' + (l.revente.marche === 'US' ? 'É.-U.' : 'Canada') : l.revente.type) : '' };
        if (mt) { o['Valeur accordée'] = e.valeur; o['Évaluation'] = e.evaluation; o['Over / under'] = e.overUnder; o['Coût au registre'] = e.cout; o['Prix de revente'] = rv(l, 'prix'); o['Profit revente'] = rv(l, 'profit'); o['Source du profit'] = rv(l, 'profitSource'); }
        return o;
      })), 'Échanges');
    }
    XLSX.writeFile(wb, (achats ? 'achats-' : 'echanges-') + (this.cie() || 'groupe').toLowerCase() + '-' + this.d.du + '-' + this.d.au + '.xlsx');
  };

  /* ------------------------------ Courriel du lundi ------------------------------ */
  VueRapports.prototype.fenetreEnvoi = function () {
    var corps = h('div.rpo-envoi', [AMX.chargeur('Courriel du lundi', { compact: true })]);
    AMX.modale({ titre: 'Courriel du lundi — rapports de la semaine', corps: corps, large: true, proteger: false, boutons: [{ texte: 'Fermer', classe: 'fantome' }] });
    var dessiner = function () {
      AMX.get({ rapportsOccasionEnvoi: 1 }, { delai: 120000 }).then(function (d) {
        AMX.verifier(d, 'Lecture impossible');
        if (!d.reglages) throw new Error(SCRIPT_PAS_A_JOUR);
        AMX.vider(corps);
        var r = d.reglages, st = d.etat || {};
        corps.appendChild(h('p', { html: r.actif ? '<b>Activé</b> : le lundi vers 7 h, les rapports de la semaine d\'avant partent par courriel.' : '<b>Pas activé</b> : rien ne part tant que la propriétaire ne l\'a pas activé. Voici qui le recevrait lundi.' }));
        if (st.semaine) corps.appendChild(h('p.mini', { text: 'Dernier envoi : semaine du ' + jourLong(st.semaine) + ' — ' + (st.envoyes || 0) + ' courriel(s)' + (st.arret ? ' · ' + st.arret : '') }));
        corps.appendChild(h('p.mini', { text: 'Semaine du ' + jourLong(d.semaine.du) + ' au ' + jourLong(d.semaine.au) + '. Le directeur général de chaque concession reçoit les échanges par conseiller et les achats par acheteur de sa concession ; les acheteurs cochés plus bas reçoivent seulement leurs propres achats. Les conseillers ne reçoivent rien. Un autre compte seulement si on lui coche le droit « Rapport du lundi » (Admin › Comptes et droits).' }));
        if (!d.destinataires.length) corps.appendChild(h('div.vide', { text: 'Personne ne recevrait de rapport cette semaine.' }));
        else corps.appendChild(h('table.tableau', [h('thead', [h('tr', [h('th', 'Personne'), h('th', 'Concession'), h('th', 'Échanges'), h('th', 'Achats de la concession'), h('th', 'Ses achats')])]),
          h('tbody', d.destinataires.map(function (x) { return h('tr', [h('td', { text: x.nom || x.qui }), h('td', { text: x.concession === '*' ? 'Tout le groupe' : x.concession }), h('td', { text: x.echanges.join(', ') || '—' }), h('td', { text: x.achats.join(', ') || '—' }), h('td', { text: x.moi ? x.moi.achetes + ' acheté(s), ' + x.moi.vendus + ' vendu(s), ' + x.moi.enStock + ' en stock' : '—' })]); }))]));
        if (d.erreurs && d.erreurs.length) corps.appendChild(h('p.mini', { text: 'Sources illisibles : ' + d.erreurs.join(' · ') }));
        /* Les acheteurs qui reçoivent leurs propres achats (10 nov., Maxime : Tristan, Fred, Julien et Marc-André). */
        var possibles = d.acheteursPossibles || [], cases = [];
        if (possibles.length) {
          corps.appendChild(h('p.rpo-sous', { text: 'Acheteurs qui reçoivent leurs propres achats' }));
          corps.appendChild(h('div.rpo-acheteurs', possibles.map(function (a) {
            var c = h('input', { type: 'checkbox', checked: !!a.choisi, disabled: !d.peutRegler, value: a.courriel }); cases.push(c);
            return h('label.rpo-case', [c, ' ' + a.nom + (a.actif ? '' : ' (compte inactif)')]);
          })));
        }
        if (d.peutRegler) {
          var choisis = function () { return cases.filter(function (c) { return c.checked; }).map(function (c) { return c.value; }); };
          var envoyer = function (corpsPost, msg, bouton) {
            bouton.disabled = true;
            AMX.post(Object.assign({ action: 'rapportsOccasionReglages' }, corpsPost)).then(function (x) { AMX.verifier(x, 'Refusé'); AMX.toast(msg(x.reglages), 'ok'); dessiner(); }, function (e) { bouton.disabled = false; AMX.toast(AMX.erreurTexte(e), 'erreur'); });
          };
          var btnListe = h('button.btn.fantome', { type: 'button', text: 'Enregistrer les acheteurs', onclick: function () { envoyer({ acheteursListe: choisis(), acheteurs: true }, function (x) { return x.acheteursListe.length + ' acheteur(s) recevront leurs achats'; }, btnListe); } });
          var btn = h('button.btn' + (r.actif ? '.fantome' : '.primaire'), { type: 'button', text: r.actif ? 'Désactiver le courriel du lundi' : 'Activer le courriel du lundi', onclick: function () {
            envoyer({ actif: !r.actif, acheteursListe: choisis(), acheteurs: true }, function (x) { return x.actif ? 'Courriel du lundi activé' : 'Courriel du lundi désactivé'; }, btn);
          } });
          corps.appendChild(h('div.rpo-envoi-actions', possibles.length ? [btnListe, btn] : [btn]));
        }
      }).catch(function (e) { AMX.vider(corps); corps.appendChild(h('div.vide', { text: AMX.erreurTexte(e) })); });
    };
    dessiner();
  };

  /* ------------------------------ Courriel et texto des hausses ------------------------------ */
  VueRapports.prototype.fenetreHausses = function () {
    var corps = h('div.rpo-envoi', [AMX.chargeur('Envois des hausses', { compact: true })]);
    AMX.modale({ titre: 'Hausses de valeur d\'échange — courriel et texto', corps: corps, large: true, proteger: false, boutons: [{ texte: 'Fermer', classe: 'fantome' }] });
    var dessiner = function () {
      AMX.get({ haussesEchangeEnvoi: 1 }, { delai: 120000 }).then(function (d) {
        AMX.verifier(d, 'Lecture impossible');
        if (!d.reglages || !d.simulation) throw new Error('Le script n\'est pas à jour : déployez une nouvelle version (HaussesEchange.gs).');
        AMX.vider(corps);
        var r = d.reglages, sim = d.simulation, noms = function (l) { return (l || []).map(function (x) { return x.nom; }).join(', ') || 'personne'; };
        corps.appendChild(h('p', { html: r.actif ? '<b>Activé</b> : les textos et le courriel du jour partent.' : '<b>Pas activé</b> : rien ne part tant que la propriétaire ne l\'a pas activé. Voici ce qui partirait maintenant.' }));
        corps.appendChild(h('ul.rpo-regles', [
          h('li', { text: 'Concessions : ' + r.cies.map(nomCie).join(', ') + '.' }),
          h('li', { text: 'Texto à ' + noms(r.texteDest) + ' pour chaque nouvelle hausse de plus de ' + argent(r.seuil) + ' (date de 14 jours ou moins), une fois par hausse ; plusieurs hausses du même passage dans un seul texto. Une hausse confirmée dans une demande d\'évaluation est déjà textée à ce moment-là : elle ne repart pas.' }),
          h('li', { text: 'Courriel une fois par jour, au premier passage après 7 h, avec les hausses vues depuis le dernier courriel : au directeur général de chaque concession (' + r.cies.map(function (c) { return nomCie(c) + ' : ' + ((d.dgs && d.dgs[c] || []).join(', ') || 'personne'); }).join(' · ') + ') et à ' + noms(r.dest) + '. Rien s\'il n\'y a aucune nouvelle hausse.' })
        ]));
        if (d.etat && d.etat.dernierEnvoi) corps.appendChild(h('p.mini', { text: 'Dernier envoi : ' + new Date(d.etat.dernierEnvoi.le).toLocaleString('fr-CA') + ' — ' + d.etat.dernierEnvoi.textos + ' texto(s), ' + d.etat.dernierEnvoi.courriels + ' courriel(s)' + (d.etat.dernierEnvoi.arret ? ' · ' + d.etat.dernierEnvoi.arret : '') }));
        corps.appendChild(h('p.rpo-sous', { text: 'Ce qui partirait maintenant (simulation, rien n\'est envoyé)' }));
        corps.appendChild(h('p.mini', { text: sim.lues + ' hausse(s) dans les sources, dont ' + sim.nouvelles + ' pas encore vue(s) · lu en ' + Math.round((sim.duree || 0) / 1000) + ' s' + (sim.erreurs && sim.erreurs.length ? ' · sources illisibles : ' + sim.erreurs.join(' · ') : '') }));
        if (!sim.textos.length) corps.appendChild(h('p.mini', { text: 'Aucun texto.' }));
        sim.textos.forEach(function (t) { corps.appendChild(h('div.rpo-texto', [h('b', { text: 'Texto à ' + t.nom + ' — ' + t.n + ' hausse(s)' + (t.deja ? ' (+' + t.deja + ' déjà textée(s) par la demande)' : '') }), t.texte ? h('p', { text: '« ' + t.texte + ' »' }) : null])); });
        if (!sim.courriels.length) corps.appendChild(h('p.mini', { text: 'Aucun courriel.' }));
        else corps.appendChild(h('table.tableau', [h('thead', [h('tr', [h('th', 'Courriel à'), h('th', 'Comme'), h('th', 'Hausses')])]),
          h('tbody', sim.courriels.map(function (p) { return h('tr', [h('td', { text: p.nom }), h('td', { text: p.dg.length ? 'DG ' + p.dg.map(nomCie).join(', ') : 'les trois concessions' }), h('td', { text: Object.keys(p.parCie).map(function (c) { return nomCie(c) + ' ' + p.parCie[c]; }).join(' · ') })]); }))]));
        if (d.peutRegler) {
          var btn = h('button.btn' + (r.actif ? '.fantome' : '.primaire'), { type: 'button', text: r.actif ? 'Désactiver les envois' : 'Activer le texto et le courriel du jour', onclick: function () {
            btn.disabled = true;
            AMX.post({ action: 'haussesEchangeReglages', actif: !r.actif }).then(function (x) { AMX.verifier(x, 'Refusé'); AMX.toast(x.reglages.actif ? 'Envois des hausses activés' : 'Envois des hausses désactivés', 'ok'); dessiner(); }, function (e) { btn.disabled = false; AMX.toast(AMX.erreurTexte(e), 'erreur'); });
          } });
          corps.appendChild(h('div.rpo-envoi-actions', [btn]));
        }
      }).catch(function (e) { AMX.vider(corps); corps.appendChild(h('div.vide', { text: AMX.erreurTexte(e) })); });
    };
    dessiner();
  };

  /* ------------------------------ Styles ------------------------------ */
  function injecterCss() {
    if (document.getElementById('css-rapports-occasion')) return;
    var css = [
      '.rpo-filtres { display: block; }',
      '.rpo-filtres .rpo-ligne { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; width: 100%; }',
      '.rpo-filtres .rpo-ligne + .rpo-ligne { margin-top: 8px; }',
      '.rpo-filtres .inv2-recherche { flex: 1 1 220px; min-width: 180px; }',
      '.rpo-filtres select.saisie, .rpo-filtres input[type=date].saisie { width: auto; flex: 0 0 auto; max-width: 100%; }',
      '.rpo-lib { font-size: 12px; font-weight: 600; color: var(--encre-3); text-transform: uppercase; letter-spacing: .04em; min-width: 64px; }',
      '.rpo-dates { display: inline-flex; gap: 6px; align-items: center; }',
      '.rpo-dates[hidden] { display: none; }',
      '.rpo-pt { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; background: var(--encre-4); }',
      '.rpo-pt.vert, .rpo-etat.vert { --c: var(--vert); } .rpo-pt.bleu, .rpo-etat.bleu { --c: var(--bleu); } .rpo-pt.sarcelle, .rpo-etat.sarcelle { --c: var(--sarcelle); }',
      '.rpo-pt.violet, .rpo-etat.violet { --c: #6D4FC7; } .rpo-pt.gris, .rpo-etat.gris { --c: var(--encre-4); } .rpo-pt.ambre, .rpo-etat.ambre { --c: var(--ambre); }',
      '.rpo-pt { background: var(--c, var(--encre-4)); }',
      '.rpo-etat { display: inline-block; font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 999px; color: var(--c, var(--encre-3)); border: 1px solid currentColor; white-space: nowrap; }',
      '.rpo-kpis { margin: 12px 0; }',
      '.rpo-par, .rpo-liste { padding: 0; overflow: hidden; margin-bottom: 14px; }',
      '.rpo-par[hidden] { display: none; }',
      '.rpo-tete { padding: 12px 14px 6px; } .rpo-tete h3 { margin: 0; font-size: 15px; } .rpo-tete .mini { margin: 2px 0 0; font-size: 12px; color: var(--encre-3); }',
      '.rpo-defile { overflow-x: auto; }',
      '.rpo-table { border: none; border-radius: 0; min-width: 640px; }',
      '.rpo-table td .mini { font-size: 12px; color: var(--encre-3); margin-top: 2px; }',
      '.rpo-table td.neg, .rpo-table td.neg span { color: var(--rouge); }',
      '.rpo-table .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }',
      '.rpo-liste .vide { margin: 14px; }',
      '.rpo-envoi table { margin-top: 10px; } .rpo-envoi .mini { font-size: 12px; color: var(--encre-3); }',
      '.rpo-case { display: flex; align-items: center; gap: 8px; margin-top: 14px; font-size: 14px; }',
      '.rpo-envoi-actions { margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap; }',
      '.rpo-sous { margin: 16px 0 4px; font-weight: 600; font-size: 14px; }',
      '.rpo-acheteurs { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 2px 14px; }',
      '.rpo-acheteurs .rpo-case { margin-top: 6px; }',
      '.rpo-regles { margin: 6px 0 4px 18px; padding: 0; font-size: 14px; } .rpo-regles li { margin: 3px 0; }',
      '.rpo-texto { border: 1px solid var(--bordure); border-radius: 8px; padding: 8px 10px; margin: 6px 0; font-size: 14px; } .rpo-texto p { margin: 4px 0 0; color: var(--encre-2, inherit); }'
    ].join('\n');
    document.head.appendChild(h('style#css-rapports-occasion', { text: css }));
  }
})();
