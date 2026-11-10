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
  var VUES = ['echanges', 'achats'];
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
    var params = vue === 'achats' ? { rapportAchats: 1 } : { rapportEchanges: 1 };
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

  function VueRapports(conteneur, ctx) {
    injecterCss();
    var self = this, pr = (ctx && ctx.params) || {};
    this.conteneur = conteneur; this.detruit = false; this.generation = 0;
    this.vue = VUES.indexOf(ctx && ctx.onglet) >= 0 ? ctx.onglet : (VUES.indexOf(pr.vue) >= 0 ? pr.vue : 'echanges');
    if (pr.cie) AMX.choisirCompagnie(String(pr.cie).toUpperCase());
    this.perNom = pr.du && pr.au ? 'dates' : AMX.memo.lire('rpo_periode', 'semaine');
    this.du = pr.du || ''; this.au = pr.au || '';
    this.f = { q: '', etat: '', personne: pr.acheteur || pr.conseiller || '' };
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
    this.vue = v; this.f = { q: '', etat: '', personne: '' }; this.elQ.value = ''; this.d = null; this.charger(false);
  };
  VueRapports.prototype.cie = function () { return AMX.compagnieChoisie('inventaire') || ''; };
  VueRapports.prototype.per = function () { return periode(this.perNom, this.du, this.au); };

  VueRapports.prototype.construire = function () {
    var self = this;
    this.elTitre = h('h1', 'Rapports');
    this.elSous = h('p', 'Chargement…');
    this.btnRafraichir = h('button.btn', { type: 'button', html: (I.rafraichir || '') + '<span>Rafraîchir</span>', onclick: function () { self.charger(true); } });
    this.btnExport = h('button.btn', { type: 'button', html: (I.telecharger || '') + '<span>Exporter Excel</span>', onclick: function () { self.exporter(); } });
    this.btnEnvoi = h('button.btn', { type: 'button', html: (I.courriel || I.ok || '') + '<span>Courriel du lundi</span>', onclick: function () { self.fenetreEnvoi(); } });
    this.btnEnvoi.hidden = !AMX.estAdmin();
    var actions = [this.btnRafraichir, this.btnExport, this.btnEnvoi];
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
      h('div.rpo-ligne', [h('span.rpo-lib', 'Devenu'), this.elEtats])]);
    this.elPortee = h('div.portee-chiffres');
    this.elKpis = h('div.kpis.rpo-kpis');
    this.elPar = h('div.carte.rpo-par');
    this.elListe = h('div.carte.rpo-liste');
    this.conteneur.appendChild(h('div.page.rpo-page', [h('div.entete-page', [h('div', [this.elTitre, this.elSous]), h('div.actions', AMX.actionsEntete ? AMX.actionsEntete(actions, []) : actions)]),
      this.elCies, this.elFiltres, this.elPortee, this.elKpis, this.elPar, this.elListe]));
    this.majDates();
  };
  VueRapports.prototype.majDates = function () { this.elDates.hidden = this.perNom !== 'dates'; };

  VueRapports.prototype.charger = function (force) {
    var self = this, gen = ++this.generation, per = this.per(), vue = this.vue;
    this.elTitre.textContent = vue === 'achats' ? 'Achats par acheteur' : 'Échanges par conseiller';
    AMX.barreConcessions(this.elCies, { domaine: 'inventaire', valeur: this.cie(), onchange: function (c) { AMX.choisirCompagnie(c); } });
    if (!this.d) { AMX.vider(this.elListe); this.elListe.appendChild(AMX.chargeur(vue === 'achats' ? 'Achats' : 'Échanges')); }
    this.elSous.textContent = 'Lecture du ' + jour(per.du) + ' au ' + jour(per.au) + '…';
    charger(vue, this.cie(), per, force).then(function (d) {
      if (gen !== self.generation || self.detruit) return;
      self.d = d; self.erreur = ''; if (force) AMX.toast('Rapport relu', 'ok');
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
    var self = this, f = this.f, achats = this.vue === 'achats';
    // Pastilles « Devenu », comptées avec les autres filtres.
    AMX.vider(this.elEtats);
    var pourE = this.filtrer('etat');
    var pastille = function (actif, lib, n, couleur, clic) {
      self.elEtats.appendChild(h('button.inv2-pastille' + (actif ? '.actif' : ''), { type: 'button', 'aria-pressed': actif ? 'true' : 'false', onclick: clic }, [couleur ? h('i.rpo-pt.' + couleur) : null, h('span', { text: lib }), h('b', { text: String(n) })]));
    };
    pastille(!f.etat, 'Tous', pourE.length, '', function () { f.etat = ''; self.rafraichir(); });
    ETATS.forEach(function (e) {
      var n = pourE.filter(function (l) { return l.etat === e[0]; }).length;
      if (!n && f.etat !== e[0]) return;
      pastille(f.etat === e[0], e[1], n, e[2], function () { f.etat = f.etat === e[0] ? '' : e[0]; self.rafraichir(); });
    });
    var liste = this.filtrer();
    var actifs = [];
    if (f.q) actifs.push('« ' + f.q + ' »');
    if (f.etat) actifs.push(ETAT_LIB[f.etat][1]);
    if (f.personne) { var o = [].filter.call(this.selPers.options, function (x) { return x.value === f.personne; })[0]; actifs.push(o ? o.text : f.personne); }
    var cie = this.cie();
    AMX.porteeChiffres(this.elPortee, { n: liste.length, unite: achats ? ['achat', 'achats'] : ['échange', 'échanges'], contexte: [cie ? (AMX.COMPAGNIES_TOUTES && AMX.COMPAGNIES_TOUTES[cie]) || cie : 'toutes les concessions', this.selPer.options[this.selPer.selectedIndex].text],
      filtres: actifs, effacer: function () { f.q = ''; f.etat = ''; f.personne = ''; self.elQ.value = ''; self.selPers.value = ''; self.rafraichir(); } });
    if (achats) { this.rendreKpisAchats(liste); this.rendreParAcheteur(liste); this.rendreListeAchats(liste); }
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

  /* ------------------------------ Export ------------------------------ */
  VueRapports.prototype.exporter = function () {
    if (typeof XLSX === 'undefined') { AMX.toast('La bibliothèque Excel n\'est pas encore chargée. Réessayez.', 'erreur'); return; }
    if (!this.d) return;
    var liste = this.filtrer(), mt = this.d.montants, achats = this.vue === 'achats', wb = XLSX.utils.book_new();
    if (!liste.length) { AMX.toast('Rien à exporter.', 'attention'); return; }
    var etat = function (l) { return (ETAT_LIB[l.etat] || [])[1] || l.etat; };
    var rv = function (l, k) { return l.revente ? l.revente[k] : ''; };
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
        corps.appendChild(h('p.mini', { text: 'Semaine du ' + jourLong(d.semaine.du) + ' au ' + jourLong(d.semaine.au) + '. Échanges : droit « Rapport du lundi — échanges » (DG et direction des ventes d\'office). Achats : droit « Rapport du lundi — achats » (DG d\'office) et chaque acheteur pour ses propres achats. Un compte « tout le groupe » seulement si on lui coche le droit (Admin › Comptes et droits).' }));
        if (!d.destinataires.length) corps.appendChild(h('div.vide', { text: 'Personne ne recevrait de rapport cette semaine.' }));
        else corps.appendChild(h('table.tableau', [h('thead', [h('tr', [h('th', 'Personne'), h('th', 'Concession'), h('th', 'Échanges'), h('th', 'Achats de la concession'), h('th', 'Ses achats')])]),
          h('tbody', d.destinataires.map(function (x) { return h('tr', [h('td', { text: x.nom || x.qui }), h('td', { text: x.concession === '*' ? 'Tout le groupe' : x.concession }), h('td', { text: x.echanges.join(', ') || '—' }), h('td', { text: x.achats.join(', ') || '—' }), h('td', { text: x.moi ? x.moi.achetes + ' acheté(s), ' + x.moi.vendus + ' vendu(s), ' + x.moi.enStock + ' en stock' : '—' })]); }))]));
        if (d.erreurs && d.erreurs.length) corps.appendChild(h('p.mini', { text: 'Sources illisibles : ' + d.erreurs.join(' · ') }));
        if (d.peutRegler) {
          var chk = h('input', { type: 'checkbox', checked: r.acheteurs !== false });
          corps.appendChild(h('label.rpo-case', [chk, ' Les acheteurs reçoivent leurs propres achats']));
          var btn = h('button.btn' + (r.actif ? '.fantome' : '.primaire'), { type: 'button', text: r.actif ? 'Désactiver le courriel du lundi' : 'Activer le courriel du lundi', onclick: function () {
            btn.disabled = true;
            AMX.post({ action: 'rapportsOccasionReglages', actif: !r.actif, acheteurs: chk.checked }).then(function (x) { AMX.verifier(x, 'Refusé'); AMX.toast(x.reglages.actif ? 'Courriel du lundi activé' : 'Courriel du lundi désactivé', 'ok'); dessiner(); }, function (e) { btn.disabled = false; AMX.toast(AMX.erreurTexte(e), 'erreur'); });
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
      '.rpo-envoi-actions { margin-top: 12px; }'
    ].join('\n');
    document.head.appendChild(h('style#css-rapports-occasion', { text: css }));
  }
})();
