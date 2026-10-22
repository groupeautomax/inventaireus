/* =========================================================================
   Vente › KPI — le tableau de bord KPI du Groupe dans le site (22 octobre 2026)

   Maxime : « joindre le projet KPI pour le mettre dans le site » ; « tous les
   chiffres doivent venir des Drive partagés ».

   Les chiffres : le dépôt kpi-groupeautomax tire toutes les 6 heures les
   Réalisés et les états financiers des constructeurs dans les Drive partagés
   des concessions, les lit, puis envoie l'essentiel à ScanAutomax (Kpi.gs,
   GET ?kpi=1). Rien n'est retapé : chaque mois porte son fichier source, avec
   un lien vers le Drive ; un mois dont le fichier n'est pas dans le Drive
   (déposé à la main sur GitHub) est signalé en ambre.

   Trois vues : Sommaire (tuiles, tableau des concessions, faits saillants,
   évolution, sources), Indicateurs (tous les indicateurs par groupe, avec la
   courbe de celui qu'on touche), Départements. Réel contre budget ou année
   précédente, au mois ou au cumul. Le groupe additionne les concessions ; un
   ratio est recalculé à partir des sommes, jamais moyenné. Les écarts se
   comptent sur les concessions qui ont les deux chiffres.

   Droit « Voir les résultats » (ou admin) ; le serveur applique la portée
   « resultats ». Toutes les données serveur passent par textContent.
   ========================================================================= */
(function () {
  'use strict';
  var h = AMX.h, I = AMX.icones;

  var ORDRE = ['STM', 'HAWKS', 'BMW', 'VW', 'HYUNDAI'];
  var COURTS = { STM: 'Ste Marie', HAWKS: 'Hawkesbury', BMW: 'BMW', VW: 'VW', HYUNDAI: 'Hyundai' };
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var GROUPES = [['volume', 'Volume (unités)'], ['profit', 'Profit brut'], ['revenue_expense', 'Revenus et dépenses'], ['net', 'Profit net'], ['ebitda', 'BAIIA / EBT'], ['other', 'Autres indicateurs']];
  // Dépenses : le fichier les garde négatives ; on les montre positives (comme le tableau de bord).
  var NEGATIFS = { depenses: 1, depenses_variables: 1, depenses_personnel: 1, depenses_semifixes: 1 };
  var MOINS_MIEUX = { depenses: 1, depenses_variables: 1, depenses_personnel: 1, depenses_semifixes: 1, total_variables: 1, total_personnel: 1, total_semifixes: 1, total_depenses: 1, impot: 1, amort_interets: 1, amortissement: 1 };
  // Ratios : recalculés à partir des sommes (numérateur, dénominateur) pour le groupe.
  var RATIOS = { ebt_pct_profit_brut: ['ebt', 'pb_total'], ros: ['ebt', 'ventes_nettes'], gpa_neuf: ['pb_neuf', 'unites_neuf'], gpa_usage: ['pb_usage', 'unites_usage'],
    pbv_unite_neuf: ['pbv_neuf', 'unites_neuf'], fi_unite_neuf: ['fi_neuf', 'unites_neuf'], pbv_unite_usage: ['pbv_usage', 'unites_usage'], fi_unite_usage: ['fi_usage', 'unites_usage'] };
  var TUILES = [['profit_net', 'Profit net'], ['pb_total', 'Profit brut'], ['ventes_nettes', 'Ventes nettes'], ['depenses', 'Dépenses'], ['unites_neuf', 'Unités neuves'], ['unites_usage', 'Unités usagées'], ['ebt_pct_profit_brut', 'EBT % du profit brut']];
  var TABLEAU = [['profit_net', 'Profit net'], ['pb_total', 'Profit brut'], ['ventes_nettes', 'Ventes nettes'], ['unites_neuf', 'Unités neuves'], ['unites_usage', 'Unités usagées'], ['ebt_pct_profit_brut', 'EBT % PB']];
  var DEPTS = ['Véhicules neufs', 'Véhicules usagés', 'Service', 'Carrosserie', 'Pièces'];
  var DEPTS_CACHES = { Boutique: 1 };
  var DEP_METRIQUES = [['units', 'Unités', 'volume'], ['units_flottes', 'Unités flottes', 'volume'], ['profit_brut', 'Profit brut', ''], ['total_variables', 'Dépenses variables', ''], ['total_personnel', 'Dépenses de personnel', ''],
    ['total_semifixes', 'Dépenses semi-fixes', ''], ['total_depenses', 'Total des dépenses', ''], ['autres_revenus', 'Autres revenus', ''], ['profit_departemental', 'Profit départemental', '']];
  var FORMATS_SOURCE = { gabarit: 'Réalisé (gabarit du Groupe)', etat_gm: 'État financier GM', etat_vw: 'État financier VW', etat_hyundai: 'État financier Hyundai' };
  var VUES = ['sommaire', 'indicateurs', 'departements'];

  AMX.icones.kpi = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="12" width="4" height="8" rx="1"/><rect x="10" y="7" width="4" height="13" rx="1"/><rect x="17" y="3" width="4" height="17" rx="1"/></svg>';

  /* ------------------------------ Outils ------------------------------ */
  function nb(v) { return typeof v === 'number' && isFinite(v); }
  function nomCie(c) { return (AMX.COMPAGNIES_TOUTES && AMX.COMPAGNIES_TOUTES[c]) || c; }
  function cle(y, m) { return y + '-' + (m < 10 ? '0' : '') + m; }
  function moisLib(p, maj) { var y = +p.slice(0, 4), m = +p.slice(5, 7); var s = (MOIS[m - 1] || '?') + ' ' + y; return maj ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  var MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  function moisCourt(p) { return (MOIS_COURTS[+p.slice(5, 7) - 1] || '?') + ' ' + p.slice(2, 4); }
  function moisPrec(p, n) { var y = +p.slice(0, 4), m = +p.slice(5, 7) - (n || 1); while (m < 1) { m += 12; y--; } return cle(y, m); }
  function argent(v) { return nb(v) ? AMX.fmtArgent(v) : '—'; }
  function argentCourt(v) {
    if (!nb(v)) return '—';
    if (Math.abs(v) >= 1e6) return (v / 1e6).toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' M$';
    return AMX.fmtArgent(v);
  }
  function pct(v, d) { return nb(v) ? (v * 100).toLocaleString('fr-CA', { minimumFractionDigits: d === undefined ? 1 : d, maximumFractionDigits: d === undefined ? 1 : d }) + ' %' : '—'; }
  function signe(t) { return t.charAt(0) === '-' || t.charAt(0) === '−' ? '−' + t.slice(1) : '+' + t; }

  /* ------------------------------ Données ------------------------------ */
  var cache = { rep: null, quand: 0, promesse: null, copieLe: 0 };
  function chargerKpi(force) {
    if (!force && cache.rep && Date.now() - cache.quand < 5 * 60000) return Promise.resolve(cache.rep);
    if (cache.promesse) return cache.promesse;
    cache.promesse = AMX.get({ kpi: 1 }, { gz: true, copie: 'kpi', secours: false }).then(function (d) {
      cache.promesse = null;
      if (!d || d.refuse) throw new Error((d && (d.erreur || d.message)) || 'Accès refusé.');
      if (d.ok === false) throw new Error(d.erreur || 'Réponse inattendue du serveur');
      if (!d.vide && (!d.concessions || !d.libelles)) throw new Error('Le script n\'est pas à jour : déployez une nouvelle version (Kpi.gs).');
      cache.rep = d; cache.quand = Date.now(); cache.copieLe = 0;
      return d;
    }, function (e) { cache.promesse = null; throw e; });
    return cache.promesse;
  }

  /* Le moteur : lit, additionne et compare. `d` = réponse de ?kpi=1. */
  function Moteur(d, base, mode) {
    this.d = d; this.base = base === 'ap' ? 2 : 1; this.mode = mode === 'c' ? 'c' : 'm';
    this.lib = d.libelles || {};
  }
  Moteur.prototype.periode = function (c, p) { var x = (this.d.concessions[c] || {}).periodes; return x ? x[p] || null : null; };
  /* Un budget à 0 veut dire « pas de budget saisi » (même règle que le tableau de bord KPI). */
  function sansBudgetNul(t) { return (t && t[1] === 0) ? [t[0], null, t[2]] : t; }
  /* Année précédente absente du fichier : le réel du même mois l'an passé, s'il est en mémoire (même règle que le tableau de bord KPI). */
  Moteur.prototype.avecAp = function (t, lireAn) {
    if (!t || nb(t[2])) return t;
    var a = lireAn(); if (!a || !nb(a[0])) return t;
    this.apReconstituee = true;
    return [t[0], t[1], a[0]];
  };
  Moteur.prototype.brut = function (c, p, k) {
    var self = this, mode = this.mode, lire = function (q) { var x = self.periode(c, q), s = x && x[mode]; return sansBudgetNul(s && s[k]) || null; };
    var t = this.avecAp(lire(p), function () { return lire(moisPrec(p, 12)); });
    if (!t) return null;
    return NEGATIFS[k] ? t.map(function (v) { return nb(v) ? -v : v; }) : t;
  };
  Moteur.prototype.brutDep = function (c, p, dep, met) {
    var self = this, mode = this.mode, lire = function (q) { var x = self.periode(c, q), s = x && x['d' + mode]; return sansBudgetNul(s && s[dep] && s[dep][met]) || null; };
    return this.avecAp(lire(p), function () { return lire(moisPrec(p, 12)); });
  };
  /* { r, c, ecart, ecartPct, n, paires } pour une liste de concessions ; `lire(c)` donne [réel, budget, AP]. */
  Moteur.prototype.somme = function (cies, lire) {
    var b = this.base, r = null, cp = null, ec = null, n = 0, paires = 0;
    cies.forEach(function (c) {
      var t = lire(c); if (!t || !nb(t[0])) return;
      r = (r || 0) + t[0]; n++;
      if (nb(t[b])) { cp = (cp || 0) + t[b]; ec = (ec || 0) + (t[0] - t[b]); paires++; }
    });
    return { r: r, c: cp, ecart: ec, ecartPct: (nb(ec) && nb(cp) && cp !== 0) ? ec / Math.abs(cp) : null, n: n, paires: paires };
  };
  Moteur.prototype.valeur = function (cies, p, k) {
    var self = this, rat = RATIOS[k];
    if (cies.length === 1 || !rat) return this.somme(cies, function (c) { return self.brut(c, p, k); });
    // Ratio du groupe : sommes des numérateurs ÷ sommes des dénominateurs (concessions qui ont les deux).
    var b = this.base, nr = 0, dr = 0, nc = 0, dc = 0, n = 0, paires = 0;
    cies.forEach(function (c) {
      var a = self.brut(c, p, rat[0]), z = self.brut(c, p, rat[1]);
      if (!a || !z || !nb(a[0]) || !nb(z[0]) || !z[0]) return;
      nr += a[0]; dr += z[0]; n++;
      if (nb(a[b]) && nb(z[b]) && z[b]) { nc += a[b]; dc += z[b]; paires++; }
    });
    var r = n ? nr / dr : null, cp = paires ? nc / dc : null;
    return { r: r, c: cp, ecart: (nb(r) && nb(cp)) ? r - cp : null, ecartPct: (nb(r) && nb(cp) && cp) ? (r - cp) / Math.abs(cp) : null, n: n, paires: paires };
  };
  Moteur.prototype.valeurDep = function (cies, p, dep, met) { var self = this; return this.somme(cies, function (c) { return self.brutDep(c, p, dep, met); }); };
  Moteur.prototype.format = function (k, v, court) {
    var l = this.lib[k] || {};
    if (l.f === 'percent') return pct(v);
    if (l.g === 'volume' || /^unites/.test(k)) return nb(v) ? AMX.fmtNombre(Math.round(v)) : '—';
    return court ? argentCourt(v) : argent(v);
  };
  Moteur.prototype.formatEcart = function (k, v) {
    var l = this.lib[k] || {};
    if (!nb(v)) return '—';
    if (l.f === 'percent') return signe((v * 100).toLocaleString('fr-CA', { minimumFractionDigits: 1, maximumFractionDigits: 1 })) + ' pt';
    return signe(this.format(k, v, true));
  };
  Moteur.prototype.ton = function (k, ecart) { if (!nb(ecart) || Math.abs(ecart) < 1e-9) return ''; return (ecart > 0) !== !!MOINS_MIEUX[k] ? 'pos' : 'neg'; };
  Moteur.prototype.libelle = function (k) { return (this.lib[k] && this.lib[k].l) || k; };

  /* ------------------------------ Section ------------------------------ */
  AMX.section('kpi', {
    titre: 'KPI', icone: 'kpi', ordre: 51,
    visible: function () { return AMX.perm('voirResultats') || AMX.estAdmin(); },
    onglets: [{ id: 'sommaire', titre: 'Sommaire' }, { id: 'indicateurs', titre: 'Indicateurs' }, { id: 'departements', titre: 'Départements' }],
    monter: function (conteneur, ctx) { return new Kpi(conteneur, ctx); }
  });

  function Kpi(conteneur, ctx) {
    injecterCss();
    var self = this;
    this.conteneur = conteneur; this.generation = 0; this.detruit = false;
    this.donnees = null; this.erreur = ''; this.copieLe = 0;
    this.vue = VUES.indexOf(ctx && ctx.onglet) >= 0 ? ctx.onglet : 'sommaire';
    this.compagnie = AMX.compagnieChoisie('resultats') || '';
    this.mode = AMX.memo.lire('kpi_mode', 'm') === 'c' ? 'c' : 'm';
    this.base = AMX.memo.lire('kpi_base', 'budget') === 'ap' ? 'ap' : 'budget';
    this.mois = '';            // vide = le dernier mois complet
    this.tendance = 'profit_net';
    this.construire();
    this.charger(false);
    this.surCie = function () { if (!self.detruit) { self.compagnie = AMX.compagnieChoisie('resultats') || ''; self.rendre(); } };
    document.addEventListener('amx:compagnie', this.surCie);
  }
  Kpi.prototype.demonter = function () { this.detruit = true; this.generation++; document.removeEventListener('amx:compagnie', this.surCie); };
  Kpi.prototype.naviguer = function (ctx) {
    var v = ctx && ctx.onglet; if (VUES.indexOf(v) < 0 || v === this.vue) return;
    this.vue = v; this.rendre();
  };

  Kpi.prototype.construire = function () {
    var self = this;
    this.elEtat = h('p', { text: 'Chargement du tableau de bord KPI…' });
    this.btnRafraichir = h('button.btn', { type: 'button', html: I.rafraichir + '<span>Rafraîchir</span>', onclick: function () { self.charger(true); } });
    this.btnExport = h('button.btn', { type: 'button', html: I.telecharger + '<span>Exporter Excel</span>', onclick: function () { self.exporter(); } });
    this.elChoix = h('div.barre-cies');
    this.elFiltres = h('div.kpi-filtres');
    this.elCorps = h('div.kpi-corps');
    this.el = h('div.page.kpi-page', [
      h('div.entete-page', [h('div', { style: { minWidth: 0 } }, [h('h1', ['KPI du Groupe', h('span.kpi-h1-sous', { text: 'Réalisés et états financiers des concessions, lus dans les Drive partagés — réel contre budget ou année précédente' })]), this.elEtat]), h('div.actions', [this.btnRafraichir, this.btnExport])]),
      this.elChoix, this.elFiltres, this.elCorps
    ]);
    this.conteneur.appendChild(this.el);
  };

  Kpi.prototype.charger = function (manuel) {
    var self = this, gen = ++this.generation;
    if (manuel) this.btnRafraichir.classList.add('occupe');
    if (!this.donnees) {
      AMX.vider(this.elCorps); this.elCorps.appendChild(AMX.chargeur('KPI'));
      if (cache.rep) { this.donnees = cache.rep; this.rendre(); }
      else AMX.cacheLocal.lireGz('kpi', 7 * 86400000).then(function (o) {
        if (self.detruit || gen !== self.generation || self.donnees || !o || !o.donnees || !o.donnees.concessions) return;
        self.donnees = o.donnees; self.copieLe = o.quand; self.rendre();
      }).catch(function () {});
    }
    return chargerKpi(!!manuel).then(function (d) {
      if (self.detruit || gen !== self.generation) return;
      self.btnRafraichir.classList.remove('occupe');
      self.donnees = d; self.erreur = ''; self.copieLe = 0;
      self.rendre();
      if (manuel) AMX.toast(d.vide ? 'Le tableau de bord KPI n\'a encore rien envoyé.' : 'KPI à jour — tableau de bord du ' + AMX.fmtDate(d.genereLe, true), d.vide ? 'attention' : 'ok');
    }, function (e) {
      if (self.detruit || gen !== self.generation) return;
      self.btnRafraichir.classList.remove('occupe');
      self.erreur = AMX.erreurTexte(e); self.rendre();
      AMX.toast((self.donnees ? 'KPI : mise à jour impossible (copie du navigateur affichée) — ' : 'Impossible de charger les KPI — ') + self.erreur, 'erreur');
    });
  };

  /* Concessions de la sélection qui ont des données ; `toutes` = sans le filtre du mois. */
  Kpi.prototype.cies = function () {
    var d = this.donnees, c = this.compagnie;
    var dispo = ORDRE.filter(function (x) { return d && d.concessions && d.concessions[x]; });
    Object.keys((d && d.concessions) || {}).forEach(function (x) { if (dispo.indexOf(x) < 0) dispo.push(x); });
    return c ? dispo.filter(function (x) { return x === c; }) : dispo;
  };
  Kpi.prototype.moisDispo = function () {
    var d = this.donnees, vus = {}, self = this;
    this.cies().forEach(function (c) { Object.keys(d.concessions[c].periodes || {}).forEach(function (p) { if (d.concessions[c].periodes[p][self.mode]) vus[p] = true; }); });
    return Object.keys(vus).sort().reverse();
  };
  /* Le dernier mois où toutes les concessions de la sélection ont des chiffres ; sinon le plus récent. */
  Kpi.prototype.moisDefaut = function () {
    var d = this.donnees, cies = this.cies(), self = this, liste = this.moisDispo();
    for (var i = 0; i < liste.length; i++) {
      var p = liste[i];
      if (cies.every(function (c) { var x = d.concessions[c].periodes[p]; return x && x[self.mode]; })) return p;
    }
    return liste[0] || '';
  };
  Kpi.prototype.moisRef = function () { var l = this.moisDispo(); return (this.mois && l.indexOf(this.mois) >= 0) ? this.mois : this.moisDefaut(); };
  Kpi.prototype.ciesAvec = function (p) { var self = this; return this.cies().filter(function (c) { var x = self.donnees.concessions[c].periodes[p]; return x && x[self.mode]; }); };

  Kpi.prototype.rendre = function () {
    var self = this, d = this.donnees;
    AMX.vider(this.elFiltres);
    AMX.barreConcessions(this.elChoix, { domaine: 'resultats', valeur: this.compagnie, onchange: function (c) { self.compagnie = c; self.mois = ''; self.rendre(); } });
    if (!d) {
      if (this.erreur) { this.elEtat.textContent = 'Serveur injoignable.'; AMX.vider(this.elCorps); this.elCorps.appendChild(h('div.vide', [h('div', { html: I.alerte }), h('h3', 'Serveur injoignable'), h('div', { text: this.erreur })])); }
      return;
    }
    if (d.vide || !this.cies().length) {
      this.elEtat.textContent = d.vide ? 'Le tableau de bord KPI n\'a encore rien envoyé.' : 'Aucun chiffre pour ' + nomCie(this.compagnie) + '.';
      AMX.vider(this.elCorps);
      this.elCorps.appendChild(h('div.vide', [h('div', { html: I.filtre }), h('h3', d.vide ? 'Pas encore de KPI' : 'Aucun chiffre pour cette concession'),
        h('div', { text: d.vide ? 'Les chiffres arrivent du tableau de bord KPI (dépôt kpi-groupeautomax), qui les lit dans les Drive partagés des concessions. Il les envoie après chaque mise à jour, dès que le jeton est en place (KPI_genererJeton dans l\'éditeur, puis le secret GitHub SCANAUTOMAX_KPI_JETON).' : 'Le tableau de bord KPI n\'a pas de Réalisé ni d\'état financier pour cette concession dans le Drive.' })]));
      return;
    }
    var p = this.moisRef();
    this.elEtat.textContent = (this.copieLe ? 'Copie du ' + AMX.copieTexte(this.copieLe) + (this.erreur ? ' — mise à jour impossible : ' + this.erreur : ' — mise à jour en cours…') + ' · ' : '') +
      'Tableau de bord KPI du ' + AMX.fmtDate(d.genereLe, true) + (d.horsPortee ? '' : '') + ' · ' + moisLib(p) + (this.mode === 'c' ? ' (cumul de l\'année)' : '');
    this.rendreFiltres(p);
    AMX.vider(this.elCorps);
    var m = new Moteur(d, this.base, this.mode);
    if (this.vue === 'indicateurs') this.rendreIndicateurs(m, p);
    else if (this.vue === 'departements') this.rendreDepartements(m, p);
    else this.rendreSommaire(m, p);
  };

  Kpi.prototype.rendreFiltres = function (p) {
    var self = this;
    var sel = h('select.saisie#kpi-mois', { onchange: function () { self.mois = sel.value; self.rendre(); } }, this.moisDispo().map(function (x) { return h('option', { value: x, text: moisLib(x, true) }); }));
    sel.value = p;
    var seg = function (id, options, valeur, quand) {
      return h('div.segment#' + id, options.map(function (o) { return h('button' + (valeur === o[0] ? '.actif' : ''), { type: 'button', 'data-v': o[0], text: o[1], onclick: function () { quand(o[0]); } }); }));
    };
    this.elFiltres.appendChild(h('label.kpi-filtre', [h('span', 'Mois'), sel]));
    this.elFiltres.appendChild(h('label.kpi-filtre', [h('span', 'Période'), seg('kpi-mode', [['m', 'Mois'], ['c', 'Cumul de l\'année']], this.mode, function (v) { self.mode = v; AMX.memo.ecrire('kpi_mode', v); self.rendre(); })]));
    this.elFiltres.appendChild(h('label.kpi-filtre', [h('span', 'Comparer à'), seg('kpi-base', [['budget', 'Budget'], ['ap', 'Année précédente']], this.base, function (v) { self.base = v; AMX.memo.ecrire('kpi_base', v); self.rendre(); })]));
    var dflt = this.moisDefaut();
    if (p !== dflt) this.elFiltres.appendChild(h('button.btn.fantome.petit', { type: 'button', text: 'Revenir au dernier mois complet (' + moisLib(dflt) + ')', onclick: function () { self.mois = ''; self.rendre(); } }));
  };

  /* Comparatif du groupe : « sur n conc. » quand toutes les concessions n'ont pas de budget (ou d'année précédente). */
  function celluleComp(texte, v) {
    var td = h('td.num', { text: texte });
    if (nb(v.c) && v.paires < v.n) td.appendChild(h('div.mini', { text: 'sur ' + v.paires + ' conc.' }));
    return td;
  }
  function libBase(base) { return base === 'ap' ? 'année précédente' : 'budget'; }
  function cellule(m, k, v, avecEcart) {
    var td = h('td.num', [h('b', { text: m.format(k, v.r) })]);
    if (avecEcart) td.appendChild(h('div.mini.' + (m.ton(k, v.ecart) || 'neutre'), { text: nb(v.ecart) ? m.formatEcart(k, v.ecart) : 'pas de ' + (m.base === 2 ? 'AP' : 'budget') }));
    return td;
  }

  /* ------------------------------ Sommaire ------------------------------ */
  Kpi.prototype.rendreSommaire = function (m, p) {
    var self = this, cies = this.ciesAvec(p), lb = libBase(this.base);
    // Tuiles
    var kpis = h('div.kpis.kpi-tuiles');
    TUILES.forEach(function (t) {
      var v = m.valeur(cies, p, t[0]);
      var sous = nb(v.ecart) ? m.formatEcart(t[0], v.ecart) + (nb(v.ecartPct) && (m.lib[t[0]] || {}).f !== 'percent' ? ' (' + signe(pct(v.ecartPct, 0)) + ')' : '') + ' vs ' + lb + (v.paires < v.n ? ' · sur ' + v.paires + ' conc.' : '') : 'pas de ' + lb;
      kpis.appendChild(h('div.kpi.neutre' + (t[0] === self.tendance ? '.actif' : ''), { role: 'button', tabindex: '0', 'data-cle': t[0], style: { cursor: 'pointer' }, onclick: function () { self.tendance = t[0]; self.rendre(); } }, [
        h('div.valeur' + (t[0] === 'profit_net' && nb(v.r) && v.r < 0 ? '.kpi-neg' : ''), { text: m.format(t[0], v.r, true) }), h('div.libelle', { text: t[1] }), h('div.sous.' + (m.ton(t[0], v.ecart) || 'neutre'), { text: sous })]));
    });
    this.elCorps.appendChild(kpis);

    // Tableau des concessions (avec le groupe) — seulement s'il y en a plusieurs
    var toutes = this.cies();
    if (toutes.length > 1) {
      var corps = toutes.map(function (c) {
        var a = self.donnees.concessions[c].periodes[p];
        if (!a || !a[self.mode]) return h('tr', [h('td', { text: nomCie(c) }), h('td.mini', { colSpan: TABLEAU.length, text: 'Aucun chiffre pour ' + moisLib(p) + ' — dernier mois reçu : ' + moisLib(Object.keys(self.donnees.concessions[c].periodes).sort().pop()) })]);
        return h('tr.cliquable', { 'data-cie': c, onclick: function () { AMX.choisirCompagnie(c); self.compagnie = c; self.mois = ''; self.rendre(); } }, [h('td', { text: nomCie(c) })].concat(TABLEAU.map(function (t) { return cellule(m, t[0], m.valeur([c], p, t[0]), true); })));
      });
      corps.push(h('tr.total', [h('td', { text: 'Groupe (' + cies.length + ' concession' + (cies.length > 1 ? 's' : '') + ')' })].concat(TABLEAU.map(function (t) { return cellule(m, t[0], m.valeur(cies, p, t[0]), true); }))));
      this.elCorps.appendChild(h('div.carte', [h('div.carte-entete', [h('h2', ['Concessions', h('span.sous', { text: moisLib(p) + (this.mode === 'c' ? ' · cumul' : '') + ' · écart vs ' + lb + ' · touchez une ligne pour la voir seule' })])]),
        h('div.carte-corps.kpi-defile', [h('table.tableau.kpi-tab#kpi-concessions', [h('thead', [h('tr', [h('th', 'Concession')].concat(TABLEAU.map(function (t) { return h('th.num', { text: t[1] }); })))]), h('tbody', corps)])])]));
    }

    // Faits saillants + évolution, côte à côte
    var rangee = h('div.kpi-rangee');
    rangee.appendChild(this.carteFaits(m, p, toutes));
    rangee.appendChild(this.carteTendance(m, p, this.tendance));
    this.elCorps.appendChild(rangee);
    this.elCorps.appendChild(this.carteSources(p));
  };

  Kpi.prototype.carteFaits = function (m, p, toutes) {
    var self = this, k = 'profit_net', lb = libBase(this.base), items = [];
    var lignes = toutes.map(function (c) { return { c: c, v: m.valeur([c], p, k) }; }).filter(function (x) { return nb(x.v.r); });
    var groupe = m.valeur(lignes.map(function (x) { return x.c; }), p, k);
    if (lignes.length > 1 && nb(groupe.r) && groupe.r > 0) {
      var top = lignes.slice().sort(function (a, b) { return b.v.r - a.v.r; })[0];
      if (top.v.r > 0) items.push(['info', nomCie(top.c) + ' est le plus gros contributeur : ' + argent(top.v.r) + ', ' + Math.round(top.v.r / groupe.r * 100) + ' % du profit net du groupe.']);
    }
    var cmp = lignes.filter(function (x) { return nb(x.v.ecart); }).sort(function (a, b) { return b.v.ecart - a.v.ecart; });
    if (cmp.length) {
      var best = cmp[0], worst = cmp[cmp.length - 1];
      if (best.v.ecart > 0) items.push(['pos', 'Meilleur écart : ' + nomCie(best.c) + ', ' + signe(argent(best.v.ecart)) + ' vs ' + lb + '.']);
      if (worst !== best && worst.v.ecart < 0) items.push(['neg', 'Plus faible écart : ' + nomCie(worst.c) + ', ' + signe(argent(worst.v.ecart)) + ' vs ' + lb + '.']);
      else if (cmp.length === 1 && best.v.ecart < 0) items.push(['neg', nomCie(best.c) + ' : ' + signe(argent(best.v.ecart)) + ' vs ' + lb + '.']);
      if (cmp.length > 1) { var au = cmp.filter(function (x) { return x.v.ecart > 0; }).length; items.push(['info', au + ' concession' + (au > 1 ? 's' : '') + ' sur ' + cmp.length + ' au-dessus ' + (this.base === 'ap' ? 'de l\'année précédente' : 'du budget') + '.']); }
    }
    lignes.filter(function (x) { return x.v.r < 0; }).forEach(function (x) { items.push(['neg', nomCie(x.c) + ' est en perte : ' + argent(x.v.r) + '.']); });
    var sansComp = lignes.filter(function (x) { return !nb(x.v.ecart); }).map(function (x) { return nomCie(x.c); });
    if (sansComp.length) items.push(['muet', sansComp.join(', ') + ' : pas ' + (this.base === 'ap' ? 'd\'année précédente' : 'de budget') + ' dans ' + (sansComp.length > 1 ? 'leurs fichiers' : 'son fichier') + ', hors des écarts.']);
    var absentes = toutes.filter(function (c) { var x = self.donnees.concessions[c].periodes[p]; return !x || !x[self.mode]; }).map(nomCie);
    if (absentes.length) items.push(['muet', 'Aucun chiffre pour ' + moisLib(p) + ' : ' + absentes.join(', ') + ' (le fichier du mois n\'est pas encore dans le Drive).']);
    if (!items.length) items.push(['muet', 'Rien à signaler pour ' + moisLib(p) + '.']);
    return h('div.carte.kpi-faits', [h('div.carte-entete', [h('h2', ['Faits saillants', h('span.sous', { text: 'profit net · ' + moisLib(p) + (this.mode === 'c' ? ' (cumul)' : '') })])]),
      h('div.carte-corps', [h('ul', items.map(function (it) { return h('li.' + it[0], { text: it[1] }); }))])]);
  };

  /* Évolution sur 13 mois (réel et comparatif) de l'indicateur `k`, pour la sélection. */
  Kpi.prototype.carteTendance = function (m, p, k) {
    var self = this, cies = this.cies(), etiquettes = [], reel = [], comp = [], partiel = false;
    for (var i = 12; i >= 0; i--) {
      var q = moisPrec(p, i), avec = cies.filter(function (c) { var x = self.donnees.concessions[c].periodes[q]; return x && x[self.mode]; });
      var v = avec.length ? m.valeur(avec, q, k) : { r: null, c: null, n: 0, paires: 0 };
      etiquettes.push(q); reel.push(nb(v.r) ? v.r : null);
      // Groupe : le comparatif n'a de sens que si toutes les concessions du mois en ont un (sinon on comparerait 5 réels à 2 budgets).
      var complet = nb(v.c) && v.paires === v.n; comp.push(complet ? v.c : null);
      if (nb(v.c) && !complet) partiel = true;
    }
    var carte = h('div.carte.kpi-tendance#kpi-tendance', [h('div.carte-entete', [h('h2', [m.libelle(k), h('span.sous', { text: '13 mois' + (this.mode === 'c' ? ' · cumul de l\'année à chaque mois' : '') + ' · ' + (this.compagnie ? nomCie(this.compagnie) : 'groupe') })])]),
      h('div.carte-corps', [courbe(m, k, etiquettes, reel, comp, p), h('div.kpi-legende', [h('span.reel', 'Réel'), h('span.comp', libBase(this.base) === 'budget' ? 'Budget' : 'Année précédente'),
        partiel ? h('em', { text: (this.base === 'ap' ? 'Année précédente' : 'Budget') + ' du groupe tracé seulement les mois où toutes les concessions en ont un — choisissez une concession pour le voir' }) : null])])]);
    return carte;
  };

  /* Graduations rondes (1, 2, 2,5 ou 5 × 10^n), ~4 intervalles. */
  function echelle(a, b) {
    if (a === b) b = a + 1;
    var brut = (b - a) / 4, p10 = Math.pow(10, Math.floor(Math.log(brut) / Math.LN10)), pas = p10;
    [1, 2, 2.5, 5, 10].some(function (f) { if (f * p10 >= brut) { pas = f * p10; return true; } return false; });
    return { min: Math.floor(a / pas) * pas, max: Math.ceil(b / pas) * pas, pas: pas };
  }

  /* Courbe SVG maison (format selon l'indicateur ; un mois sans chiffre coupe la ligne). */
  function courbe(m, k, etiquettes, reel, comp, actif) {
    var NS = 'http://www.w3.org/2000/svg', L = 720, H = 220, mg = { g: 64, d: 12, h: 12, b: 28 };
    var el = function (t, a, enfants) { var e = document.createElementNS(NS, t); Object.keys(a || {}).forEach(function (x) { e.setAttribute(x, a[x]); }); (enfants || []).forEach(function (c) { if (typeof c === 'string') e.textContent = c; else e.appendChild(c); }); return e; };
    var svg = el('svg', { viewBox: '0 0 ' + L + ' ' + H, class: 'kpi-svg', role: 'img', 'aria-label': m.libelle(k) });
    var tous = reel.concat(comp).filter(nb);
    if (!tous.length) { svg.appendChild(el('text', { x: L / 2, y: H / 2, 'text-anchor': 'middle', class: 'kpi-axe' }, ['Aucun chiffre sur ces 13 mois'])); return svg; }
    var e = echelle(Math.min.apply(null, tous.concat([0])), Math.max.apply(null, tous.concat([0])));
    var min = e.min, max = e.max;
    var zx = mg.g, zl = L - mg.g - mg.d, zy = mg.h, zh = H - mg.h - mg.b, n = etiquettes.length;
    var X = function (i) { return zx + zl * i / Math.max(1, n - 1); }, Y = function (v) { return zy + zh - (v - min) / (max - min) * zh; };
    for (var v = min; v <= max + e.pas / 2; v += e.pas) {
      var y = Y(v);
      svg.appendChild(el('line', { x1: zx, x2: zx + zl, y1: y, y2: y, class: 'kpi-grille' }));
      svg.appendChild(el('text', { x: zx - 6, y: y + 4, 'text-anchor': 'end', class: 'kpi-axe' }, [m.format(k, v, true).replace(/\s?\$$/, ' $')]));
    }
    if (min < 0 && max > 0) svg.appendChild(el('line', { x1: zx, x2: zx + zl, y1: Y(0), y2: Y(0), class: 'kpi-zero' }));
    etiquettes.forEach(function (et, i) { svg.appendChild(el('text', { x: X(i), y: H - 8, 'text-anchor': 'middle', class: 'kpi-axe' + (et === actif ? ' actif' : '') }, [moisCourt(et)])); });
    var trace = function (serie, cls, nom) {
      var d = '', ouvert = false;
      serie.forEach(function (v, i) { if (!nb(v)) { ouvert = false; return; } d += (ouvert ? ' L ' : ' M ') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); ouvert = true; });
      if (d) svg.appendChild(el('path', { d: d.trim(), class: 'kpi-ligne ' + cls }));
      serie.forEach(function (v, i) { if (nb(v)) svg.appendChild(el('circle', { cx: X(i), cy: Y(v), r: 3.2, class: 'kpi-point ' + cls }, [el('title', {}, [nom + ' — ' + moisLib(etiquettes[i]) + ' : ' + m.format(k, v)])])); });
    };
    trace(comp, 'comp', m.base === 2 ? 'Année précédente' : 'Budget');
    trace(reel, 'reel', 'Réel');
    return svg;
  }

  /* D'où vient chaque chiffre du mois : le fichier, son lien Drive, ou l'avis « déposé à la main ». */
  Kpi.prototype.carteSources = function (p) {
    var self = this, d = this.donnees;
    var lignes = this.cies().map(function (c) {
      var x = d.concessions[c].periodes[p];
      if (!x) return h('li', [h('b', { text: nomCie(c) }), h('span.mini', { text: ' — aucun fichier pour ' + moisLib(p) })]);
      var lien = x.di ? h('a', { href: 'https://drive.google.com/file/d/' + encodeURIComponent(x.di) + '/view', target: '_blank', rel: 'noopener', text: x.f || 'Fichier' }) : h('span', { text: x.f || 'Fichier' });
      return h('li' + (x.di ? '' : '.hors'), [h('b', { text: nomCie(c) }), ' — ', lien, h('span.mini', { text: ' · ' + (FORMATS_SOURCE[x.t] || x.t || '') + (x.dt ? ' · modifié le ' + AMX.fmtDate(x.dt) : '') }),
        x.di ? null : h('span.puce.attention', { text: 'Déposé à la main — pas trouvé dans le Drive' })]);
    });
    return h('div.carte.kpi-sources', [h('div.carte-entete', [h('h2', ['Sources des chiffres', h('span.sous', { text: moisLib(p) + ' · fichiers lus dans les Drive partagés des concessions · tableau de bord du ' + AMX.fmtDate(d.genereLe, true) + ', reçu par ScanAutomax le ' + AMX.fmtDate(d.recuLe, true) })])]),
      h('div.carte-corps', [h('ul', lignes)])]);
  };

  /* ------------------------------ Indicateurs ------------------------------ */
  Kpi.prototype.rendreIndicateurs = function (m, p) {
    var self = this, cies = this.ciesAvec(p), plusieurs = cies.length > 1, lb = libBase(this.base);
    this.elCorps.appendChild(this.carteTendance(m, p, this.tendance));
    var cles = {}; cies.forEach(function (c) { var x = self.donnees.concessions[c].periodes[p][self.mode] || {}; Object.keys(x).forEach(function (k) { cles[k] = true; }); });
    var tete = [h('th', 'Indicateur')].concat(plusieurs ? cies.map(function (c) { return h('th.num', { text: COURTS[c] || c }); }) : []).concat([h('th.num', { text: plusieurs ? 'Groupe' : 'Réel' }), h('th.num', { text: lb === 'budget' ? 'Budget' : 'Année préc.' }), h('th.num', 'Écart'), h('th.num', 'Écart %')]);
    var corps = [];
    GROUPES.forEach(function (g) {
      var ks = Object.keys(cles).filter(function (k) { return ((m.lib[k] || {}).g || 'other') === g[0]; });
      if (!ks.length) return;
      corps.push(h('tr.groupe', [h('td', { colSpan: tete.length, text: g[1] })]));
      ks.sort(function (a, b) { return m.libelle(a).localeCompare(m.libelle(b), 'fr'); });
      ks.forEach(function (k) {
        var v = m.valeur(cies, p, k), ton = m.ton(k, v.ecart);
        corps.push(h('tr.cliquable' + (k === self.tendance ? '.actif' : ''), { 'data-cle': k, onclick: function () { self.tendance = k; self.rendre(); var t = document.getElementById('kpi-tendance'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } },
          [h('td', { text: m.libelle(k) })]
            .concat(plusieurs ? cies.map(function (c) { var x = m.valeur([c], p, k); return h('td.num', { text: m.format(k, x.r, true), title: nb(x.ecart) ? 'Écart vs ' + lb + ' : ' + m.formatEcart(k, x.ecart) : '' }); }) : [])
            .concat([h('td.num', [h('b', { text: m.format(k, v.r) })]), celluleComp(m.format(k, v.c), v), h('td.num.' + (ton || 'neutre'), { text: m.formatEcart(k, v.ecart) }),
              h('td.num.' + (ton || 'neutre'), { text: nb(v.ecartPct) && (m.lib[k] || {}).f !== 'percent' ? signe(pct(v.ecartPct)) : '—' })])));
      });
    });
    this.elCorps.appendChild(h('div.carte', [h('div.carte-entete', [h('h2', ['Indicateurs', h('span.sous', { text: moisLib(p) + (this.mode === 'c' ? ' · cumul' : '') + ' · ' + (plusieurs ? 'le groupe additionne les concessions, les ratios sont recalculés' : nomCie(cies[0] || this.compagnie)) + ' · touchez une ligne pour sa courbe' })])]),
      h('div.carte-corps.kpi-defile', [h('table.tableau.kpi-tab#kpi-indicateurs', [h('thead', [h('tr', tete)]), h('tbody', corps)])])]));
  };

  /* ------------------------------ Départements ------------------------------ */
  Kpi.prototype.rendreDepartements = function (m, p) {
    var self = this, cies = this.ciesAvec(p), plusieurs = cies.length > 1, lb = libBase(this.base);
    var noms = {}; cies.forEach(function (c) { var x = self.donnees.concessions[c].periodes[p]['d' + self.mode] || {}; Object.keys(x).forEach(function (n) { if (!DEPTS_CACHES[n]) noms[n] = true; }); });
    var liste = DEPTS.filter(function (n) { return noms[n]; }).concat(Object.keys(noms).filter(function (n) { return DEPTS.indexOf(n) < 0; }).sort());
    if (!liste.length) { this.elCorps.appendChild(h('div.vide', [h('h3', 'Pas de départements pour ' + moisLib(p)), h('div', { text: 'Le fichier de ce mois ne détaille pas les départements.' })])); return; }
    var grille = h('div.kpi-deps');
    liste.forEach(function (dep) {
      var tete = [h('th', '')].concat(plusieurs ? cies.map(function (c) { return h('th.num', { text: COURTS[c] || c }); }) : []).concat([h('th.num', { text: plusieurs ? 'Groupe' : 'Réel' }), h('th.num', { text: lb === 'budget' ? 'Budget' : 'Année préc.' }), h('th.num', 'Écart')]);
      var lignes = DEP_METRIQUES.map(function (mt) {
        var v = m.valeurDep(cies, p, dep, mt[0]); if (!nb(v.r)) return null;
        var fmt = function (x) { return mt[2] === 'volume' ? (nb(x) ? AMX.fmtNombre(Math.round(x)) : '—') : argent(x); };
        var ton = !nb(v.ecart) || Math.abs(v.ecart) < 1e-9 ? 'neutre' : ((v.ecart > 0) !== !!MOINS_MIEUX[mt[0]] ? 'pos' : 'neg');
        return h('tr' + (mt[0] === 'profit_departemental' ? '.total' : ''), [h('td', { text: mt[1] })]
          .concat(plusieurs ? cies.map(function (c) { return h('td.num', { text: fmt(m.valeurDep([c], p, dep, mt[0]).r) }); }) : [])
          .concat([h('td.num', [h('b', { text: fmt(v.r) })]), celluleComp(fmt(v.c), v), h('td.num.' + ton, { text: nb(v.ecart) ? signe(fmt(v.ecart)) : '—' })]));
      }).filter(Boolean);
      var net = m.valeurDep(cies, p, dep, 'profit_departemental');
      grille.appendChild(h('div.carte', [h('div.carte-entete', [h('h2', [dep, h('span.sous', { text: 'profit départemental ' + argent(net.r) + (nb(net.ecart) ? ' · ' + signe(argent(net.ecart)) + ' vs ' + lb : '') })])]),
        h('div.carte-corps.kpi-defile', [h('table.tableau.kpi-tab', { 'data-dep': dep }, [h('thead', [h('tr', tete)]), h('tbody', lignes)])])]));
    });
    this.elCorps.appendChild(h('p.mini.kpi-note', { text: moisLib(p) + (this.mode === 'c' ? ' (cumul)' : '') + ' · dépenses en montants positifs : un écart négatif sur une dépense est une bonne nouvelle (en vert).' }));
    this.elCorps.appendChild(grille);
  };

  /* ------------------------------ Export ------------------------------ */
  Kpi.prototype.exporter = function () {
    var self = this, d = this.donnees;
    if (!d || d.vide) { AMX.toast('Rien à exporter.', 'attention'); return; }
    if (typeof XLSX === 'undefined') { AMX.toast('La bibliothèque Excel n\'est pas encore chargée. Réessayez.', 'erreur'); return; }
    var p = this.moisRef(), cies = this.ciesAvec(p), lignes = [], deps = [], sources = [];
    ['m', 'c'].forEach(function (mode) {
      var m = new Moteur(d, self.base, mode);
      cies.forEach(function (c) {
        var x = (d.concessions[c].periodes[p] || {})[mode] || {};
        Object.keys(x).forEach(function (k) { var t = m.brut(c, p, k); lignes.push({ 'Concession': nomCie(c), 'Mois': p, 'Période': mode === 'c' ? 'Cumul' : 'Mois', 'Groupe': ((m.lib[k] || {}).g) || '', 'Indicateur': m.libelle(k), 'Clé': k, 'Réel': t[0], 'Budget': t[1], 'Année précédente': t[2] }); });
        var dx = (d.concessions[c].periodes[p] || {})['d' + mode] || {};
        Object.keys(dx).forEach(function (dep) { DEP_METRIQUES.forEach(function (mt) { var t = dx[dep][mt[0]]; if (t) deps.push({ 'Concession': nomCie(c), 'Mois': p, 'Période': mode === 'c' ? 'Cumul' : 'Mois', 'Département': dep, 'Mesure': mt[1], 'Réel': t[0], 'Budget': t[1], 'Année précédente': t[2] }); }); });
      });
    });
    this.cies().forEach(function (c) {
      Object.keys(d.concessions[c].periodes).sort().forEach(function (q) { var x = d.concessions[c].periodes[q]; sources.push({ 'Concession': nomCie(c), 'Mois': q, 'Fichier': x.f, 'Format': FORMATS_SOURCE[x.t] || x.t, 'Drive': x.di ? 'https://drive.google.com/file/d/' + x.di + '/view' : 'déposé à la main (pas dans le Drive)', 'Modifié le': x.dt || '' }); });
    });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lignes), 'Indicateurs');
    if (deps.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(deps), 'Départements');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sources), 'Sources');
    XLSX.writeFile(wb, 'kpi-' + (this.compagnie || 'groupe').toLowerCase() + '-' + p + '.xlsx');
    AMX.toast('Export Excel — ' + moisLib(p) + ', ' + cies.length + ' concession' + (cies.length > 1 ? 's' : ''), 'ok');
  };

  AMX.kpi = { charger: chargerKpi, enCache: function () { return cache.rep; }, Moteur: Moteur };

  function injecterCss() {
    if (document.getElementById('css-kpi')) return;
    var s = document.createElement('style'); s.id = 'css-kpi';
    s.textContent = [
      '.kpi-page .carte { margin-bottom: 14px; }',
      '.kpi-page .mini { font-size: 11.5px; color: var(--encre-3); }',
      '.kpi-page .carte-entete h2 .sous { font-size: 12px; font-weight: 400; color: var(--encre-3); margin-left: 8px; letter-spacing: 0; text-transform: none; }',
      '.kpi-page h1 .kpi-h1-sous { display: block; font-size: 12.5px; font-weight: 400; color: var(--encre-3); letter-spacing: 0; margin-top: 2px; }',
      '.kpi-filtres { display: flex; flex-wrap: wrap; gap: 10px 18px; align-items: center; margin: 0 0 14px; }',
      '.kpi-filtre { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: var(--encre-3); }',
      '.kpi-filtre > span { font-weight: 600; text-transform: uppercase; letter-spacing: .05em; font-size: 10.5px; }',
      '.kpi-filtre select { min-width: 170px; }',
      '.kpi-page .kpi .sous.pos, .kpi-page td.pos, .kpi-page .mini.pos { color: var(--vert); }',
      '.kpi-page .kpi .sous.neg, .kpi-page td.neg, .kpi-page .mini.neg { color: var(--rouge); }',
      '.kpi-page .kpi .valeur.kpi-neg { color: var(--rouge); }',
      '.kpi-page .kpi-tuiles .kpi .sous { white-space: normal; line-height: 1.35; }',
      '.kpi-legende em { font-style: normal; color: var(--encre-4); margin-left: auto; }',
      '.kpi-defile { overflow-x: auto; }',
      '.kpi-tab td, .kpi-tab th { white-space: nowrap; }',
      '.kpi-tab tr.groupe td { background: var(--carte-2); font-size: 10.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--encre-3); padding-top: 7px; padding-bottom: 7px; }',
      '.kpi-tab tr.total td { font-weight: 700; background: var(--carte-2); border-top: 2px solid var(--ligne-forte); }',
      '.kpi-page .carte-corps.kpi-defile { padding: 0; }',
      '.kpi-page .carte-corps.kpi-defile .tableau { border: none; border-radius: 0; box-shadow: none; }',
      '.kpi-rangee { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); gap: 14px; }',
      '@media (max-width: 1000px) { .kpi-rangee { grid-template-columns: 1fr; } }',
      '.kpi-faits ul, .kpi-sources ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 8px; }',
      '.kpi-faits li { padding-left: 14px; position: relative; font-size: 13px; line-height: 1.45; }',
      '.kpi-faits li::before { content: ""; position: absolute; left: 0; top: 7px; width: 6px; height: 6px; border-radius: 50%; background: var(--encre-4); }',
      '.kpi-faits li.pos::before { background: var(--vert); } .kpi-faits li.neg::before { background: var(--rouge); } .kpi-faits li.muet { color: var(--encre-3); }',
      '.kpi-page .carte-corps { padding: 12px 16px; }',
      '.kpi-svg { width: 100%; height: auto; display: block; }',
      '.kpi-svg .kpi-grille { stroke: var(--ligne); stroke-width: 1; } .kpi-svg .kpi-zero { stroke: var(--encre-4); stroke-width: 1; }',
      '.kpi-svg .kpi-axe { font-size: 11px; fill: var(--encre-3); } .kpi-svg .kpi-axe.actif { fill: var(--encre); font-weight: 700; }',
      '.kpi-svg .kpi-ligne { fill: none; stroke-width: 2.4; stroke-linejoin: round; } .kpi-svg .kpi-ligne.reel { stroke: var(--vert); } .kpi-svg .kpi-ligne.comp { stroke: var(--encre-4); stroke-dasharray: 5 4; stroke-width: 1.8; }',
      '.kpi-svg .kpi-point.reel { fill: var(--vert); } .kpi-svg .kpi-point.comp { fill: var(--encre-4); }',
      '.kpi-legende { display: flex; gap: 16px; font-size: 11.5px; color: var(--encre-3); margin-top: 6px; }',
      '.kpi-legende span::before { content: ""; display: inline-block; width: 16px; height: 0; border-top: 2.4px solid var(--vert); vertical-align: middle; margin-right: 6px; }',
      '.kpi-legende span.comp::before { border-top: 2px dashed var(--encre-4); }',
      '.kpi-sources li { font-size: 13px; line-height: 1.5; } .kpi-sources li.hors b { color: var(--ambre); } .kpi-sources .puce { margin-left: 8px; }',
      '.kpi-deps { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 460px), 1fr)); gap: 14px; }',
      '.kpi-deps .carte { margin-bottom: 0; }',
      '.kpi-note { margin: 0 0 10px; color: var(--encre-3); }'
    ].join('\n');
    document.head.appendChild(s);
  }
})();
