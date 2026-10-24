/* =========================================================================
   Inventaire › Analyse usagé (24 octobre 2026) — AMX.analyseUsage

   Maxime (24 oct.) : « monte une analyse de nos inventaires d'usagés (regarde vAuto et les autres) avec les rangs du
   marché, le nombre de jours, le % du prix du marché et toute l'analyse nécessaire pour mieux gérer notre inventaire
   détail ; ça peut être un autre onglet ».

   Les mesures de vAuto Provision, avec nos données :
     · Jours en stock (date d'entrée au registre Detail) et tranche d'âge (0–15, 16–30, 31–45, 46–60, 61–90, 90 j +).
     · % du marché (« price to market ») = notre prix affiché ÷ médiane des comparables ajustée à notre km (Prix du
       marché, OccMarche.gs : annonces des concessionnaires lues chaque lundi) ; rang (« 3e sur 12 », du moins cher).
     · % coût / marché (« cost to market ») = notre coût ÷ la même médiane (cible ≤ 84 %) ; profit affiché = prix − coût.
     · MDS (« market days supply ») de MarketCheck : annonces actives ÷ ventes par jour des 45 derniers jours, par
       année-marque-modèle, autour de la concession (AnalyseUsage.gs, lu aux 2 heures par l'horloge).
     · Profil de prix par âge : un % du marché visé par tranche (réglable, par défaut 100 / 98 / 96 / 94 / 92 / 90 %) ;
       chaque véhicule reçoit un conseil — Baisser à X $, Monter à X $, Envisager le gros (OpenLane), Afficher un prix,
       Prix à valider (peu de comparables), En préparation, Bien placé.
     · Nos ventes au détail des 90 derniers jours (registre Detail : véhicules vendus) → délai de vente et jours
       d'approvisionnement par modèle.
     · Coût de détention : coût × taux du plan (5 % par an) × jours.
   Règle v138 : filtres → « Chiffres et liste » → chiffres calculés sur la liste filtrée → liste. Montants (coût, profit,
   % coût / marché, gros) seulement pour qui voit les coûts (même règle que les opportunités d'achat).
   ========================================================================= */
(function () {
  'use strict';
  var h = AMX.h, I = AMX.icones;
  var COURTS = { STM: 'Ste Marie', HAWKS: 'Hawkesbury', BMW: 'BMW Sherbrooke', VW: 'VW Brossard', HYUNDAI: 'Hyundai Longueuil' };
  var STOCK = ['achete', 'transitqc', 'stock'], VENDUS = ['arrive', 'comptabilise'];
  var STATUT_LIB = { achete: 'Acheté', transitqc: 'Transit QC', stock: 'En stock' };
  /* [code, pastille, couleur, ordre de priorité] */
  var ACTIONS = [['baisser', 'À baisser', 'rouge', 2], ['gros', 'Envisager le gros', 'ambre', 1], ['sansprix', 'Sans prix affiché', 'gris', 3], ['valider', 'Prix à valider', 'gris', 4],
    ['monter', 'À monter', 'bleu', 5], ['prep', 'En préparation', 'gris', 6], ['ok', 'Bien placés', 'vert', 7]];
  var A_LIB = {}; ACTIONS.forEach(function (a) { A_LIB[a[0]] = { t: a[1], c: a[2], o: a[3] }; });
  var TRIS = [['priorite', 'Priorité'], ['jours', 'Jours en stock'], ['ptm', '% du marché'], ['ctm', '% coût / marché'], ['profit', 'Profit affiché'], ['mds', 'MDS'], ['modele', 'Modèle']];
  var DEFAUTS = { tranches: [{ max: 15, cible: 100 }, { max: 30, cible: 98 }, { max: 45, cible: 96 }, { max: 60, cible: 94 }, { max: 90, cible: 92 }, { max: 0, cible: 90 }],
    tolerance: 2, ctmMax: 84, ageGros: 75, mdsHaut: 75, mdsBas: 30, tauxDetention: 5, mdsActif: true, mdsBudgetMois: 600, mdsJours: 14, mdsRayonMi: 100 };
  var LIMITE = 100;

  function nb(v) { return typeof v === 'number' && isFinite(v); }
  function num(v) { if (v === null || v === undefined || v === '') return null; if (typeof v === 'number') return isFinite(v) ? v : null; var n = AMX.montant ? AMX.montant(v) : parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : null; }
  function argent(v) { return nb(v) ? AMX.fmtArgent(Math.round(v)) : '—'; }
  function signe(v) { return nb(v) ? (v > 0 ? '+' : (v < 0 ? '−' : '')) + AMX.fmtArgent(Math.abs(Math.round(v))) : '—'; }
  function pct(v) { return nb(v) ? String(Math.round(v * 10) / 10).replace('.', ',') + ' %' : '—'; }
  function km(v) { return nb(v) ? AMX.fmtNombre(Math.round(v)) + ' km' : 'km inconnu'; }
  function rangTexte(r, n) { return nb(r) ? (r === 1 ? '1er' : r + 'e') + ' sur ' + n : ''; }
  function moyenne(l) { l = l.filter(nb); return l.length ? l.reduce(function (a, b) { return a + b; }, 0) / l.length : null; }
  function mediane(l) { l = l.filter(nb); if (!l.length) return null; var s = l.slice().sort(function (a, b) { return a - b; }), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function somme(l) { return l.filter(nb).reduce(function (a, b) { return a + b; }, 0); }
  function nomMarque(m) { var x = String(m || '').replace(/-/g, ' '); if (/^(gmc|bmw|ram|mini)$/i.test(x)) return x.toUpperCase(); return x.replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  function joursEntre(iso, maintenant) { if (!iso) return null; var t = new Date(String(iso).length === 10 ? iso + 'T12:00:00' : iso).getTime(); return isFinite(t) ? Math.max(0, Math.floor(((maintenant || Date.now()) - t) / 86400000)) : null; }
  function voitCouts() { return !!(AMX.perm && (AMX.perm('modifierMontants') || AMX.perm('voirResultats'))) || (AMX.estAdmin && AMX.estAdmin()); }
  function peutRegler(d) { return !!(d && d.peutRegler); }
  /* Clé de modèle tirée du texte du registre (« CHEVROLET Equinox 2022 » → chevrolet|equinox) : nos ventes et notre stock
     comparés au même niveau. */
  var ALIAS = { chev: 'chevrolet', chevy: 'chevrolet', vw: 'volkswagen', volks: 'volkswagen', mercedes: 'mercedes' };
  function cleModele(texte) {
    var t = String(texte || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
    if (!t.length) return '';
    var marque = ALIAS[t[0]] || t[0], i = 1;
    if (t[1] === 'benz' || t[1] === 'rover') i = 2;
    while (i < t.length && /^(19|20)\d\d$/.test(t[i])) i++;
    return t[i] ? marque + '|' + t[i] : '';
  }

  /* ------------------------------ Données ------------------------------ */
  var cacheA = { rep: null, quand: 0, promesse: null };
  function chargerAnalyse(force) {
    if (!force && cacheA.rep && Date.now() - cacheA.quand < 5 * 60000) return Promise.resolve(cacheA.rep);
    if (cacheA.promesse) return cacheA.promesse;
    cacheA.promesse = AMX.get({ analyseUsage: 1 }, { copie: 'analyse_usage', secours: false, delai: 60000 }).then(function (d) {
      cacheA.promesse = null;
      if (d && d.refuse) return d;
      if (!d || d.ok === false) throw new Error((d && d.erreur) || 'Réponse inattendue du serveur');
      if (!d.params) d = { ok: true, ancien: true, params: DEFAUTS, mds: {}, etat: null };   // script pas encore déployé : réglages par défaut, sans MDS
      cacheA.rep = d; cacheA.quand = Date.now();
      return d;
    }, function (e) { cacheA.promesse = null; throw e; });
    return cacheA.promesse;
  }
  function params(d) { return (d && d.params) || DEFAUTS; }
  function trancheDe(jours, tranches) {
    for (var i = 0; i < tranches.length; i++) { if (tranches[i].max && nb(jours) && jours <= tranches[i].max) return i; if (!tranches[i].max) return i; }
    return tranches.length - 1;
  }
  function libTranche(i, tranches) {
    var t = tranches[i], avant = i ? tranches[i - 1].max : -1;
    if (!t) return '';
    if (!t.max) return (avant + 1) + ' j et +';
    return (avant + 1) + '–' + t.max + ' j';
  }

  /* Un véhicule analysé : r = ligne du registre Detail, m = véhicule du Prix du marché, ctx = { p, mds, ventes }. */
  function analyser(r, m, ctx) {
    var p = ctx.p, maintenant = ctx.maintenant;
    var a = { vin: (r && r.vin) || m.vin, stock: (r && r.stock) || (m && m.stock) || '', compagnie: String((r && r.compagnie) || (m && m.compagnie) || '').toUpperCase(),
      statut: (r && r.statut) || (m && m.statut) || 'stock', dateAjout: (r && r.dateAjout) || (m && m.dateAjout) || '', texte: (r && r.modele) || (m && m.texte) || '' };
    a.vin = String(a.vin || '').toUpperCase();
    a.marque = m ? m.marque : ''; a.modele = m ? m.modele : ''; a.annee = m ? m.annee : null; a.version = m ? m.version : '';
    a.nom = m ? [m.annee, nomMarque(m.marque), m.modele, m.version].filter(Boolean).join(' ') : a.texte;
    a.km = m && nb(m.km) ? m.km : null;
    a.cout = num(r ? r.cout : null); if (!nb(a.cout) || a.cout <= 0) a.cout = m && nb(m.cout) && m.cout > 0 ? m.cout : null;
    // Coût absent du registre : le prix payé sur Manheim (achats BMW Financial Services), à défaut de mieux.
    var mh = AMX.manheim && AMX.manheim.parVin ? AMX.manheim.parVin(a.vin) : null;
    a.manheim = !!mh; a.coutSource = nb(a.cout) ? 'registre' : '';
    if (!nb(a.cout) && mh && mh.type === 'achat' && nb(num(mh.prix)) && num(mh.prix) > 0) { a.cout = num(mh.prix); a.coutSource = 'manheim'; }
    a.jours = joursEntre(a.dateAjout, maintenant);
    a.cle = cleModele(a.texte);
    var n = m && m.notre;
    a.prix = n && nb(n.prix) ? n.prix : null; a.source = n ? n.source || 'annonce' : ''; a.site = n ? n.site : ''; a.lien = n ? n.lien : ''; a.prixLe = n ? n.le : '';
    a.avant = n && nb(n.avant) ? n.avant : null; a.changeLe = n ? n.changeLe || '' : ''; a.vuLe = n ? n.vuLe || '' : '';
    a.joursPrix = a.changeLe ? joursEntre(a.changeLe, maintenant) : (a.vuLe ? joursEntre(a.vuLe, maintenant) : null);
    a.joursPrixDepuisVu = !a.changeLe && !!a.vuLe;
    a.med = m && nb(m.mediane) ? m.mediane : null; a.n = m ? m.n || 0 : 0; a.elargi = !!(m && m.elargi); a.rang = m && nb(m.rang) ? m.rang : null;
    a.p25 = m ? m.p25 : null; a.p75 = m ? m.p75 : null; a.joursMed = m ? m.joursMed : null; a.comps = (m && m.comps) || [];
    a.ptm = nb(a.prix) && nb(a.med) && a.med > 0 ? Math.round(a.prix / a.med * 1000) / 10 : null;
    a.ctm = nb(a.cout) && nb(a.med) && a.med > 0 ? Math.round(a.cout / a.med * 1000) / 10 : null;
    a.profitAff = nb(a.prix) && nb(a.cout) ? a.prix - a.cout : null;
    a.profitMarche = nb(a.med) && nb(a.cout) ? a.med - a.cout : null;
    a.detJour = nb(a.cout) ? a.cout * p.tauxDetention / 100 / 365 : null;
    a.detention = nb(a.detJour) && nb(a.jours) ? a.detJour * a.jours : null;
    a.tranche = trancheDe(a.jours, p.tranches); a.cible = p.tranches[a.tranche].cible;
    a.prixCible = nb(a.med) ? Math.round(a.med * a.cible / 100 / 100) * 100 : null;
    a.ecartCible = nb(a.prix) && nb(a.prixCible) ? a.prixCible - a.prix : null;
    var ol = AMX.openlane && AMX.openlane.valeur ? AMX.openlane.valeur(a.vin) : null;
    a.gros = ol ? (num(ol.prevision) || (AMX.openlane.ajuste ? AMX.openlane.ajuste(ol, a.km === null ? undefined : a.km) : null) || num(ol.prixMoy)) : null;
    a.grosEcart = nb(a.gros) && nb(a.cout) ? a.gros - a.cout : null;
    var md = ctx.mds[a.vin];
    a.mds = md && nb(md.mds) ? Math.round(md.mds) : null; a.mdsActifs = md ? md.actifs : null; a.mdsVendus = md ? md.vendus : null; a.mdsLu = !!md;
    var vt = ctx.ventes[a.cle];
    a.ventes90 = vt ? vt.n : 0;
    a.action = conseil(a, p);
    a.alertes = alertes(a, p);
    return a;
  }
  function conseil(a, p) {
    var tol = p.tolerance, c = a.cible, vieux = nb(a.jours) && a.jours >= p.ageGros;
    var grosTexte = function () { return nb(a.gros) ? 'OpenLane ' + argent(a.gros) + (voitCouts() && nb(a.grosEcart) ? ' (' + signe(a.grosEcart) + ' vs coût)' : '') : 'pas encore de valeur OpenLane'; };
    if (a.statut !== 'stock' && !vieux) return { code: 'prep', titre: 'En préparation', detail: (STATUT_LIB[a.statut] || a.statut) + (nb(a.jours) ? ' depuis ' + a.jours + ' j' : '') + (nb(a.prixCible) ? ' · prix visé à la mise en ligne ≈ ' + argent(a.prixCible) + ' (' + pct(c) + ' du marché)' : '') };
    if (vieux && (a.ptm === null || a.ptm > c + tol || (nb(a.mds) && a.mds > p.mdsHaut))) return { code: 'gros', titre: 'Envisager le gros', detail: a.jours + ' j en stock · ' + grosTexte() + (nb(a.ptm) && a.ptm > c + tol && nb(a.prixCible) ? ' · sinon baisser à ' + argent(a.prixCible) : '') };
    if (!nb(a.prix)) return { code: 'sansprix', titre: 'Afficher un prix', detail: nb(a.prixCible) ? 'Prix visé ≈ ' + argent(a.prixCible) + ' (' + pct(c) + ' du marché à ' + (a.jours || 0) + ' j)' : 'Aucun prix trouvé sur les sites ni dans D2C, et pas de marché pour ce modèle' };
    if (a.n < 3 || !nb(a.med)) return { code: 'valider', titre: 'Prix à valider', detail: 'Peu de comparables (' + a.n + ') : comparer à la main' };
    if (a.ptm > c + tol) return { code: 'baisser', titre: 'Baisser à ' + argent(a.prixCible), montant: a.ecartCible, detail: signe(a.ecartCible) + ' · ' + pct(a.ptm) + ' du marché, visé ' + pct(c) + ' à ' + a.jours + ' j' + (nb(a.joursPrix) && a.joursPrix >= 14 ? ' · prix inchangé depuis ' + a.joursPrix + ' j' : '') };
    if (a.ptm < c - tol) return { code: 'monter', titre: 'Monter à ' + argent(a.prixCible), montant: a.ecartCible, detail: signe(a.ecartCible) + ' · ' + pct(a.ptm) + ' du marché, visé ' + pct(c) + ' à ' + a.jours + ' j' };
    return { code: 'ok', titre: 'Bien placé', detail: pct(a.ptm) + ' du marché (visé ' + pct(c) + ')' + (nb(a.rang) ? ' · ' + rangTexte(a.rang, a.n + 1) : '') };
  }
  function alertes(a, p) {
    var l = [];
    if (voitCouts() && nb(a.ctm) && a.ctm > p.ctmMax) l.push({ t: 'Coût élevé : ' + pct(a.ctm) + ' du marché', c: 'rouge', title: 'Notre coût dépasse ' + p.ctmMax + ' % de la médiane du marché : peu de place pour le prix.' });
    if (nb(a.mds) && a.mds > p.mdsHaut) l.push({ t: 'Offre abondante (MDS ' + a.mds + ' j)', c: 'ambre', title: a.mdsActifs + ' en vente pour ' + a.mdsVendus + ' vendus en 45 jours autour de la concession (MarketCheck).' });
    else if (a.mdsLu && a.mds === null && nb(a.mdsActifs) && a.mdsActifs > 0) l.push({ t: 'Aucune vente en 45 j au marché', c: 'ambre', title: a.mdsActifs + ' en vente, aucun vendu en 45 jours (MarketCheck).' });
    else if (nb(a.mds) && a.mds < p.mdsBas) l.push({ t: 'Forte demande (MDS ' + a.mds + ' j)', c: 'vert', title: a.mdsActifs + ' en vente pour ' + a.mdsVendus + ' vendus en 45 jours (MarketCheck).' });
    if (nb(a.joursPrix) && a.joursPrix >= 21 && nb(a.jours) && a.jours > 30 && a.action.code !== 'ok' && a.action.code !== 'monter') l.push({ t: 'Prix inchangé ' + a.joursPrix + ' j', c: 'gris', title: a.joursPrixDepuisVu ? 'Même prix depuis qu\'on le lit dans D2C.' : 'Dernier changement le ' + AMX.fmtDate(a.changeLe) });
    if (a.elargi) l.push({ t: 'Marché élargi', c: 'gris', title: 'Moins de 3 comparables à l\'année ± 1 et km ± 30 000 : élargi à l\'année ± 2, tout km.' });
    return l;
  }
  /* Nos ventes au détail des 90 derniers jours (registre Detail : vendus), par modèle. La date de vente est la dernière mise à
     jour de la ligne (passage à « vendu ») : une approximation, assez juste pour un rythme de vente. */
  function ventesDe(detail, cie, maintenant) {
    var out = {}, tot = { n: 0, jours: [] };
    (detail || []).forEach(function (r) {
      if (VENDUS.indexOf(String(r.statut || '')) < 0) return;
      if (cie && String(r.compagnie || '').toUpperCase() !== cie) return;
      var j = joursEntre(r.maj, maintenant); if (!nb(j) || j > 90) return;
      var k = cleModele(r.modele); if (!k) return;
      var d = (r.dateAjout && r.maj) ? Math.round((new Date(r.maj).getTime() - new Date(String(r.dateAjout).length === 10 ? r.dateAjout + 'T12:00:00' : r.dateAjout).getTime()) / 86400000) : null;
      var x = out[k] = out[k] || { n: 0, jours: [] }; x.n++; tot.n++;
      if (nb(d) && d >= 0 && d < 730) { x.jours.push(d); tot.jours.push(d); }
    });
    out._tout = tot;
    return out;
  }

  /* ------------------------------ La page ------------------------------ */
  AMX.section('analyse', {
    titre: 'Analyse usagé', icone: 'inventaire', ordre: 21,
    visible: function () { return AMX.perm('ficheAchat') || AMX.perm('changerStatut') || AMX.perm('modifierMontants') || AMX.estAdmin(); },
    monter: function (conteneur, ctx) { return new VueAnalyse(conteneur, ctx); }
  });
  function VueAnalyse(conteneur, ctx) {
    var self = this;
    injecterCss();
    this.conteneur = conteneur; this.compagnie = AMX.compagnieChoisie('inventaire');
    this.d = null; this.marche = null; this.detail = null; this.ouverts = {}; this.limite = LIMITE; this.erreurs = {};
    this.f = { q: (ctx && ctx.params && ctx.params.q) || '', action: (ctx && ctx.params && ctx.params.action) || AMX.memo.lire('anu_action', '') || '', tranche: '', tri: AMX.memo.lire('anu_tri', 'priorite') };
    this.construire();
    this.surCie = function (e) { self.compagnie = (e.detail && e.detail.compagnie) || ''; self.limite = LIMITE; self.rendre(); };
    this.surDonnees = function () { self.rendre(); };
    document.addEventListener('amx:compagnie', this.surCie);
    document.addEventListener('amx:occmarche', this.surDonnees);
    document.addEventListener('amx:openlane', this.surDonnees);
    this.charger(false);
  }
  VueAnalyse.prototype.demonter = function () {
    document.removeEventListener('amx:compagnie', this.surCie); document.removeEventListener('amx:occmarche', this.surDonnees); document.removeEventListener('amx:openlane', this.surDonnees);
  };
  VueAnalyse.prototype.charger = function (force) {
    var self = this;
    var fin = function () { self.rendre(); };
    // Copies du navigateur d'abord (affichage immédiat), puis le serveur.
    if (AMX.occMarche && !this.marche) AMX.occMarche.copie().then(function (d) { if (d && !self.marche) { self.marche = d; fin(); } });
    if (AMX.occMarche) AMX.occMarche.charger(force).then(function (d) { if (d && d.refuse) { self.erreurs.marche = d.erreur; } else self.marche = d; delete self.erreurs.marche; fin(); }, function (e) { self.erreurs.marche = AMX.erreurTexte(e); fin(); });
    chargerAnalyse(force).then(function (d) { if (d && d.refuse) self.erreurs.analyse = d.erreur; else { self.d = d; delete self.erreurs.analyse; } fin(); }, function (e) { self.erreurs.analyse = AMX.erreurTexte(e); fin(); });
    AMX.inventaire.lire('DETAIL', force).then(function (l) { self.detail = l || []; fin(); }, function () { self.detail = self.detail || []; fin(); });
    if (AMX.openlane && AMX.openlane.charger) AMX.openlane.charger(false).then(fin, function () {});
    if (AMX.manheim && AMX.manheim.charger) AMX.manheim.charger(false).then(function () { self._cle = null; fin(); }, function () {});
  };
  VueAnalyse.prototype.construire = function () {
    var self = this;
    this.elSous = h('p', 'Chargement…');
    this.btnReglages = h('button.btn', { type: 'button', html: (I.reglages || I.outils || '') + '<span>Réglages</span>', onclick: function () { self.reglages(); } });
    this.btnExport = h('button.btn', { type: 'button', html: (I.telecharger || '') + '<span>Exporter Excel</span>', onclick: function () { self.exporter(); } });
    this.btnRafraichir = h('button.btn', { type: 'button', html: (I.rafraichir || '') + '<span>Rafraîchir</span>', onclick: function () { self.charger(true); AMX.toast('Analyse relue', 'ok'); } });
    this.btnMds = h('button.btn', { type: 'button', html: (I.rafraichir || '') + '<span>Lire des MDS maintenant</span>', onclick: function (e) { self.lireMds(e.currentTarget); } });
    var actions = [this.btnRafraichir, this.btnMds, this.btnExport, this.btnReglages];
    this.elActions = h('div.actions', AMX.actionsEntete ? AMX.actionsEntete(actions, [this.btnReglages]) : actions);
    this.elCies = h('div.barre-cies');
    this.elQ = h('input.saisie#anu-recherche', { type: 'search', placeholder: '# stock, modèle, NIV…', 'aria-label': 'Chercher un usagé', autocomplete: 'off', value: this.f.q,
      oninput: AMX.debounce(function (e) { self.f.q = e.target.value; self.limite = LIMITE; self.rafraichir(); }, 150),
      onkeydown: function (e) { if (e.key === 'Escape' && self.elQ.value) { e.stopPropagation(); self.elQ.value = ''; self.f.q = ''; self.rafraichir(); } } });
    this.elTri = h('select.saisie#anu-tri', { 'aria-label': 'Trier', onchange: function () { self.f.tri = self.elTri.value; AMX.memo.ecrire('anu_tri', self.f.tri); self.rafraichir(); } },
      TRIS.map(function (t) { return h('option', { value: t[0], text: 'Tri : ' + t[1] }); }));
    this.elTri.value = this.f.tri;
    this.elActionsF = h('div.inv2-statuts#anu-actions', { role: 'group', 'aria-label': 'Conseil' });
    this.elTranches = h('div.inv2-statuts#anu-tranches', { role: 'group', 'aria-label': 'Âge' });
    this.elFiltres = h('div.inv2-filtres.anu-filtres', [
      h('div.anu-ligne', [h('div.recherche.inv2-recherche', [h('span', { html: I.recherche }), this.elQ]), this.elTri]),
      h('div.anu-ligne', [h('span.anu-lib', 'Conseil'), this.elActionsF]),
      h('div.anu-ligne', [h('span.anu-lib', 'Âge'), this.elTranches])]);
    this.elPortee = h('div.portee-chiffres');
    this.elKpis = h('div.kpis.anu-kpis');
    this.elProfil = h('div.carte.anu-profil');
    this.elCiesTable = h('div.carte.anu-cies');
    this.elListe = h('div.carte.anu-liste');
    this.conteneur.appendChild(h('div.page.anu-page', [h('div.entete-page', [h('div', [h('h1', 'Analyse usagé'), this.elSous]), this.elActions]),
      this.elCies, this.elFiltres, this.elPortee, this.elKpis, this.elProfil, this.elCiesTable, this.elListe]));
  };
  VueAnalyse.prototype.p = function () { return params(this.d); };
  /* Tous nos usagés au détail : le registre Detail (en stock, acheté, transit) et ce que le Prix du marché en sait. */
  VueAnalyse.prototype.base = function () {
    var self = this, cle = [this.d ? this.d.genereLe : '', this.marche ? this.marche.calculeLe || this.marche.le : '', this.detail ? this.detail.length : -1, AMX.inventaire.quand ? AMX.inventaire.quand('DETAIL') : 0,
      AMX.openlane && AMX.openlane.enCache && AMX.openlane.enCache() ? Object.keys(AMX.openlane.enCache()).length : 0].join('|');
    if (this._cle === cle && this._base) return this._base;
    var p = this.p(), maintenant = Date.now(), mParVin = {};
    ((this.marche && this.marche.vehicules) || []).forEach(function (m) { if (m && m.vin) mParVin[String(m.vin).toUpperCase()] = m; });
    var ctx = { p: p, maintenant: maintenant, mds: (this.d && this.d.mds) || {}, ventes: ventesDe(this.detail, '', maintenant) };
    var vus = {}, out = [];
    (this.detail || []).forEach(function (r) {
      var vin = String(r.vin || '').toUpperCase(); if (!vin || STOCK.indexOf(String(r.statut || '')) < 0 || vus[vin]) return;
      if (AMX.codesPour) { var codes = AMX.codesPour('inventaire'); if (Array.isArray(codes) && codes.indexOf(String(r.compagnie || '').toUpperCase()) < 0) return; }
      vus[vin] = true; out.push(analyser(r, mParVin[vin] || null, ctx));
    });
    Object.keys(mParVin).forEach(function (vin) { if (!vus[vin]) { vus[vin] = true; out.push(analyser(null, mParVin[vin], ctx)); } });
    this._cle = cle; this._base = out; this._ctx = ctx;
    void self;
    return out;
  };
  VueAnalyse.prototype.filtrer = function (sauf) {
    var f = this.f, cie = this.compagnie;
    return this.base().filter(function (a) {
      if (cie && a.compagnie !== cie) return false;
      if (sauf !== 'action' && f.action && a.action.code !== f.action) return false;
      if (sauf !== 'tranche' && f.tranche !== '' && String(a.tranche) !== String(f.tranche)) return false;
      if (f.q && !AMX.correspond([a.stock, a.vin, a.nom, a.texte, COURTS[a.compagnie], a.action.titre], f.q)) return false;
      return true;
    });
  };
  VueAnalyse.prototype.trier = function (l) {
    var t = this.f.tri, c = l.slice();
    var v = function (a) {
      if (t === 'jours') return nb(a.jours) ? a.jours : -1;
      if (t === 'ptm') return nb(a.ptm) ? a.ptm : -1e6;
      if (t === 'ctm') return nb(a.ctm) ? a.ctm : -1e6;
      if (t === 'profit') return nb(a.profitAff) ? a.profitAff : -1e9;
      if (t === 'mds') return nb(a.mds) ? a.mds : (a.mdsLu && nb(a.mdsActifs) ? 1e5 : -1);
      return 0;
    };
    if (t === 'modele') c.sort(function (a, b) { return String(a.nom).localeCompare(String(b.nom), 'fr'); });
    else if (t === 'priorite') c.sort(function (a, b) { return ((A_LIB[a.action.code] || {}).o - (A_LIB[b.action.code] || {}).o) || ((b.jours || 0) - (a.jours || 0)); });
    else c.sort(function (a, b) { return v(b) - v(a); });
    return c;
  };
  VueAnalyse.prototype.rendre = function () {
    var self = this, d = this.d, m = this.marche, p = this.p();
    AMX.barreConcessions(this.elCies, { domaine: 'inventaire', valeur: this.compagnie, onchange: function (c) { self.compagnie = c; self.limite = LIMITE; self.rendre(); } });
    var bouts = [];
    if (m && m.le) bouts.push('marché lu le ' + AMX.fmtDate(m.le)); else if (m) bouts.push('lecture du marché pas encore faite (le lundi)');
    var ps = (m && m.prixSite) || {}, cies = Object.keys(ps);
    if (cies.length) bouts.push('nos prix (D2C) : ' + cies.map(function (c) { return (COURTS[c] || c) + ' ' + AMX.fmtDate(ps[c].le); }).join(', '));
    if (d && d.etat) bouts.push('MDS : ' + d.etat.aJour + ' / ' + d.etat.cles + ' modèles à jour' + (d.etat.erreur ? ' (' + d.etat.erreur + ')' : ''));
    if (d && d.ancien) bouts.push('réglages par défaut (script à déployer pour les réglages et le MDS)');
    var errs = Object.keys(this.erreurs).map(function (k) { return self.erreurs[k]; });
    this.elSous.textContent = (errs.length ? errs.join(' · ') + ' — ' : '') + (bouts.length ? 'Registre Detail · ' + bouts.join(' · ') : 'Chargement…');
    this.btnReglages.hidden = !peutRegler(d);
    this.btnMds.hidden = !(d && d.admin && !d.ancien && p.mdsActif);
    if (!this.detail && !m) return;
    this.rafraichir();
  };
  VueAnalyse.prototype.rafraichir = function () {
    var self = this, f = this.f, p = this.p();
    // Pastilles de conseil (comptées avec les autres filtres)
    AMX.vider(this.elActionsF);
    var pourA = this.filtrer('action');
    var pastille = function (cont, actif, lib, n, couleur, clic) {
      cont.appendChild(h('button.inv2-pastille' + (actif ? '.actif' : ''), { type: 'button', 'aria-pressed': actif ? 'true' : 'false', onclick: clic },
        [couleur ? h('i.anu-pt.' + couleur) : null, h('span', { text: lib }), h('b', { text: String(n) })]));
    };
    pastille(this.elActionsF, !f.action, 'Tous', pourA.length, '', function () { f.action = ''; AMX.memo.ecrire('anu_action', ''); self.limite = LIMITE; self.rafraichir(); });
    ACTIONS.slice().sort(function (a, b) { return a[3] - b[3]; }).forEach(function (a) {
      var n = pourA.filter(function (x) { return x.action.code === a[0]; }).length;
      if (!n && f.action !== a[0]) return;
      pastille(self.elActionsF, f.action === a[0], a[1], n, a[2], function () { f.action = a[0]; AMX.memo.ecrire('anu_action', a[0]); self.limite = LIMITE; self.rafraichir(); });
    });
    AMX.vider(this.elTranches);
    var pourT = this.filtrer('tranche');
    pastille(this.elTranches, f.tranche === '', 'Tous', pourT.length, '', function () { f.tranche = ''; self.rafraichir(); });
    p.tranches.forEach(function (t, i) {
      var n = pourT.filter(function (x) { return x.tranche === i; }).length;
      pastille(self.elTranches, String(f.tranche) === String(i), libTranche(i, p.tranches), n, i >= p.tranches.length - 2 ? 'ambre' : '', function () { f.tranche = String(f.tranche) === String(i) ? '' : i; self.rafraichir(); });
    });
    var liste = this.trier(this.filtrer());
    var actifs = [];
    if (f.q) actifs.push('« ' + f.q + ' »');
    if (f.action) actifs.push((A_LIB[f.action] || {}).t);
    if (f.tranche !== '') actifs.push(libTranche(Number(f.tranche), p.tranches));
    AMX.porteeChiffres(this.elPortee, { n: liste.length, unite: ['usagé', 'usagés'], contexte: [this.compagnie ? COURTS[this.compagnie] || this.compagnie : 'toutes les concessions', 'registre Detail'],
      filtres: actifs, effacer: function () { f.q = ''; f.action = ''; f.tranche = ''; self.elQ.value = ''; AMX.memo.ecrire('anu_action', ''); self.rafraichir(); } });
    this.rendreKpis(liste);
    this.rendreProfil(liste);
    this.rendreCies(liste);
    this.rendreListe(liste);
  };
  VueAnalyse.prototype.rendreKpis = function (liste) {
    var p = this.p(), couts = voitCouts();
    AMX.vider(this.elKpis);
    var tuile = function (val, lib, sous, cls, titre) { return h('div.kpi.inv2-fixe' + (cls ? '.' + cls : ''), { title: titre || '' }, [h('div.valeur', { text: val }), h('div.libelle', { text: lib }), h('div.sous', { text: sous })]); };
    var enStock = liste.filter(function (a) { return a.statut === 'stock'; });
    var ageMoy = moyenne(liste.map(function (a) { return a.jours; }));
    var vieux = liste.filter(function (a) { return nb(a.jours) && a.jours > 60; }).length, jeunes = liste.filter(function (a) { return nb(a.jours) && a.jours <= 30; }).length;
    var pVieux = liste.length ? Math.round(vieux / liste.length * 100) : 0, pJeunes = liste.length ? Math.round(jeunes / liste.length * 100) : 0;
    var avecPtm = liste.filter(function (a) { return nb(a.ptm); });
    var ptmMoy = moyenne(avecPtm.map(function (a) { return a.ptm; })), cibleMoy = moyenne(avecPtm.map(function (a) { return a.cible; }));
    var avecCtm = liste.filter(function (a) { return nb(a.ctm); }), ctmMoy = moyenne(avecCtm.map(function (a) { return a.ctm; }));
    var profitMoy = moyenne(liste.map(function (a) { return a.profitAff; }));
    var detJour = somme(liste.map(function (a) { return a.detJour; }));
    var coutTot = somme(liste.map(function (a) { return a.cout; }));
    var baisser = liste.filter(function (a) { return a.action.code === 'baisser'; }), monter = liste.filter(function (a) { return a.action.code === 'monter'; });
    var gros = liste.filter(function (a) { return a.action.code === 'gros'; });
    var mdsMed = mediane(liste.map(function (a) { return a.mds; })), mdsHaut = liste.filter(function (a) { return nb(a.mds) && a.mds > p.mdsHaut; }).length;
    // Nos ventes 90 j des MÊMES modèles que la liste (même concession) : approvisionnement = stock ÷ ventes par jour.
    var vm = ventesDe(this.detail, this.compagnie, Date.now()), cles = {}, vt = { n: 0, jours: [] };
    liste.forEach(function (a) { if (a.cle) cles[a.cle] = true; });
    Object.keys(cles).forEach(function (k) { var x = vm[k]; if (x) { vt.n += x.n; vt.jours = vt.jours.concat(x.jours); } });
    var appro = vt.n ? Math.round(liste.length / (vt.n / 90)) : null, delai = mediane(vt.jours);
    this.elKpis.appendChild(tuile(AMX.fmtNombre(liste.length), 'Usagés au détail', (couts && coutTot ? argent(coutTot) + ' au coût · ' : '') + AMX.fmtNombre(liste.length - enStock.length) + ' en préparation'));
    this.elKpis.appendChild(tuile(nb(ageMoy) ? Math.round(ageMoy) + ' j' : '—', 'Âge moyen', pJeunes + ' % à 30 j et moins · ' + pVieux + ' % au-delà de 60 j', pVieux > 10 ? 'neg' : '',
      'Repères courants : 60 à 70 % du stock à 30 jours et moins, au plus 5 % au-delà de 60 jours.'));
    this.elKpis.appendChild(tuile(pct(ptmMoy), '% du marché', nb(cibleMoy) ? 'visé ' + pct(cibleMoy) + ' · ' + avecPtm.length + ' avec prix et marché' : 'notre prix ÷ médiane ajustée au km', nb(ptmMoy) && nb(cibleMoy) && ptmMoy > cibleMoy + p.tolerance ? 'neg' : '',
      'Notre prix affiché ÷ médiane des annonces comparables, ajustée à notre km (vAuto : « price to market »).'));
    if (couts) this.elKpis.appendChild(tuile(pct(ctmMoy), '% coût / marché', 'repère ≤ ' + p.ctmMax + ' %' + (nb(profitMoy) ? ' · profit affiché moyen ' + argent(profitMoy) : ''), nb(ctmMoy) && ctmMoy > p.ctmMax ? 'neg' : '',
      'Notre coût ÷ médiane du marché (vAuto : « cost to market »). Au-delà de ' + p.ctmMax + ' %, il reste peu de place pour le prix.'));
    this.elKpis.appendChild(tuile(AMX.fmtNombre(baisser.length) + ' · ' + AMX.fmtNombre(monter.length), 'À baisser · à monter', baisser.length || monter.length ? signe(somme(baisser.map(function (a) { return a.ecartCible; }))) + ' · ' + signe(somme(monter.map(function (a) { return a.ecartCible; }))) : 'tous dans le profil visé', baisser.length ? 'neg' : ''));
    this.elKpis.appendChild(tuile(AMX.fmtNombre(gros.length), 'Envisager le gros', p.ageGros + ' j et plus, au-dessus du marché ou en offre abondante', gros.length ? 'neg' : ''));
    this.elKpis.appendChild(tuile(nb(mdsMed) ? Math.round(mdsMed) + ' j' : '—', 'MDS (médiane)', nb(mdsMed) ? mdsHaut + ' modèle(s) au-dessus de ' + p.mdsHaut + ' j' : ((this.d && this.d.ancien) ? 'après le déploiement du script' : 'lu aux 2 heures par MarketCheck'), '',
      'Market days supply : annonces en vente ÷ ventes par jour des 45 derniers jours, même année-marque-modèle, autour de la concession (MarketCheck).'));
    this.elKpis.appendChild(tuile(AMX.fmtNombre(vt.n), 'Nos ventes · mêmes modèles', '90 j · ' + (nb(delai) ? 'délai médian ' + Math.round(delai) + ' j' : 'délai inconnu') + (nb(appro) ? ' · ' + appro + ' j d\'approvisionnement' : '') + (couts && detJour ? ' · détention ' + argent(detJour) + '/j' : ''), '',
      'Véhicules des mêmes modèles que la liste, passés à « vendu » au registre Detail dans les 90 derniers jours. Approvisionnement = usagés de la liste ÷ ventes par jour. Détention = coût × ' + p.tauxDetention + ' % par an.'));
  };
  /* Profil de prix par âge (vAuto « pricing profile ») : le % du marché moyen de chaque tranche contre le % visé. */
  VueAnalyse.prototype.rendreProfil = function (liste) {
    var self = this, p = this.p(), couts = voitCouts();
    AMX.vider(this.elProfil);
    if (!liste.length) { this.elProfil.hidden = true; return; }
    this.elProfil.hidden = false;
    var rangs = p.tranches.map(function (t, i) {
      var l = liste.filter(function (a) { return a.tranche === i; });
      return { i: i, n: l.length, part: liste.length ? l.length / liste.length * 100 : 0, ptm: moyenne(l.map(function (a) { return a.ptm; })), cible: t.cible,
        ctm: moyenne(l.map(function (a) { return a.ctm; })), profit: moyenne(l.map(function (a) { return a.profitAff; })), baisser: l.filter(function (a) { return a.action.code === 'baisser'; }).length,
        sansPrix: l.filter(function (a) { return a.action.code === 'sansprix'; }).length };
    });
    var tete = ['Âge', 'Usagés', 'Part du stock', '% du marché (moyen)', 'Visé', couts ? '% coût / marché' : null, couts ? 'Profit affiché moyen' : null, 'À baisser', 'Sans prix'].filter(function (x) { return x !== null; });
    var corps = rangs.map(function (r) {
      var ecart = nb(r.ptm) ? r.ptm - r.cible : null, cls = !nb(ecart) ? '' : (ecart > p.tolerance ? 'neg' : (ecart < -p.tolerance ? 'bleu' : 'pos'));
      var barre = h('div.anu-barre', { title: 'Part du stock : ' + Math.round(r.part) + ' %' }, [h('i', { style: 'width:' + Math.min(100, Math.round(r.part)) + '%' })]);
      return h('tr' + (String(self.f.tranche) === String(r.i) ? '.actif' : ''), { tabindex: '0', title: 'Voir ces usagés', onclick: function () { self.f.tranche = String(self.f.tranche) === String(r.i) ? '' : r.i; self.rafraichir(); } }, [
        h('td', [h('b', { text: libTranche(r.i, p.tranches) })]), h('td.num', { text: AMX.fmtNombre(r.n) }), h('td', [h('div.anu-part', [barre, h('span', { text: Math.round(r.part) + ' %' })])]),
        h('td.num.' + (cls || 'x'), { text: pct(r.ptm) }), h('td.num.doux', { text: pct(r.cible) }),
        couts ? h('td.num' + (nb(r.ctm) && r.ctm > p.ctmMax ? '.neg' : ''), { text: pct(r.ctm) }) : null, couts ? h('td.num', { text: argent(r.profit) }) : null,
        h('td.num' + (r.baisser ? '.neg' : ''), { text: r.baisser ? String(r.baisser) : '·' }), h('td.num', { text: r.sansPrix ? String(r.sansPrix) : '·' })].filter(Boolean));
    });
    var j30 = liste.filter(function (a) { return nb(a.jours) && a.jours <= 30; }).length, j60 = liste.filter(function (a) { return nb(a.jours) && a.jours > 30 && a.jours <= 60; }).length, j60p = liste.length - j30 - j60;
    var pc = function (n) { return Math.round(n / liste.length * 100); };
    this.elProfil.appendChild(h('div.carte-corps', [
      h('div.anu-titre', [h('h3', 'Profil de prix par âge'), h('span.mini.doux', { text: 'Chaque tranche : son % du marché moyen contre le % visé (Réglages). Cliquez une tranche pour la voir.' })]),
      h('div.anu-defile', [h('table.anu-table', [h('thead', [h('tr', tete.map(function (t, i) { return h('th' + (i ? '.num' : ''), { text: t }); }))]), h('tbody', corps)])]),
      h('div.anu-repartition', [
        h('span', [h('b', { text: pc(j30) + ' %' }), ' à 30 j et moins ', h('span.doux', { text: '(repère 60 à 70 %)' })]),
        h('span', [h('b.' + (pc(j60) > 25 ? 'neg' : 'x'), { text: pc(j60) + ' %' }), ' de 31 à 60 j ', h('span.doux', { text: '(au plus 25 %)' })]),
        h('span', [h('b.' + (pc(j60p) > 5 ? 'neg' : 'x'), { text: pc(j60p) + ' %' }), ' au-delà de 60 j ', h('span.doux', { text: '(au plus 5 %)' })])])]));
  };
  VueAnalyse.prototype.rendreCies = function (liste) {
    var self = this, p = this.p(), couts = voitCouts();
    AMX.vider(this.elCiesTable);
    var codes = {}; liste.forEach(function (a) { codes[a.compagnie] = true; });
    var cs = Object.keys(codes).filter(Boolean);
    if (this.compagnie || cs.length < 2) { this.elCiesTable.hidden = true; return; }
    this.elCiesTable.hidden = false;
    var lignes = cs.map(function (c) {
      var l = liste.filter(function (a) { return a.compagnie === c; });
      return { c: c, n: l.length, age: moyenne(l.map(function (a) { return a.jours; })), vieux: l.filter(function (a) { return nb(a.jours) && a.jours > 60; }).length,
        ptm: moyenne(l.map(function (a) { return a.ptm; })), ctm: moyenne(l.map(function (a) { return a.ctm; })), baisser: l.filter(function (a) { return a.action.code === 'baisser'; }).length,
        gros: l.filter(function (a) { return a.action.code === 'gros'; }).length, sansPrix: l.filter(function (a) { return a.action.code === 'sansprix'; }).length };
    }).sort(function (a, b) { return b.n - a.n; });
    var tete = ['Concession', 'Usagés', 'Âge moyen', 'Au-delà de 60 j', '% du marché', couts ? '% coût / marché' : null, 'À baisser', 'Gros', 'Sans prix'].filter(function (x) { return x !== null; });
    this.elCiesTable.appendChild(h('div.carte-corps', [h('div.anu-titre', [h('h3', 'Par concession')]),
      h('div.anu-defile', [h('table.anu-table', [h('thead', [h('tr', tete.map(function (t, i) { return h('th' + (i ? '.num' : ''), { text: t }); }))]),
        h('tbody', lignes.map(function (r) {
          return h('tr', { tabindex: '0', title: 'Voir cette concession', onclick: function () { AMX.choisirCompagnie(r.c); } }, [
            h('td', [h('b', { text: COURTS[r.c] || r.c })]), h('td.num', { text: AMX.fmtNombre(r.n) }), h('td.num', { text: nb(r.age) ? Math.round(r.age) + ' j' : '—' }),
            h('td.num' + (r.n && r.vieux / r.n > 0.1 ? '.neg' : ''), { text: r.vieux + ' (' + (r.n ? Math.round(r.vieux / r.n * 100) : 0) + ' %)' }), h('td.num', { text: pct(r.ptm) }),
            couts ? h('td.num' + (nb(r.ctm) && r.ctm > p.ctmMax ? '.neg' : ''), { text: pct(r.ctm) }) : null,
            h('td.num' + (r.baisser ? '.neg' : ''), { text: String(r.baisser) }), h('td.num', { text: String(r.gros) }), h('td.num', { text: String(r.sansPrix) })].filter(Boolean));
        }))])]), h('div.mini.doux', { text: 'Cliquez une concession pour la choisir en haut.' })]));
    void self;
  };
  VueAnalyse.prototype.rendreListe = function (liste) {
    var self = this, couts = voitCouts();
    AMX.vider(this.elListe);
    if (!this.detail && !this.marche) { this.elListe.appendChild(AMX.chargeur ? AMX.chargeur('Analyse de l\'usagé', { compact: true }) : h('div.vide', 'Chargement…')); return; }
    if (!liste.length) { this.elListe.appendChild(h('div.vide', [h('div', { html: I.filtre }), h('h3', 'Aucun usagé pour ces filtres'), h('div', { text: 'Effacez les filtres ou choisissez « Tous ».' })])); return; }
    this.elListe.classList.toggle('sans-couts', !couts);
    var tetes = [['anu-veh', 'Usagé'], ['anu-age', 'Âge'], ['anu-prix', 'Prix · marché'], ['anu-ptm', '% du marché'], couts ? ['anu-ctm', '% coût · profit'] : null, ['anu-mds', 'MDS · ventes'], ['anu-conseil', 'Conseil'], ['anu-act', '']].filter(Boolean);
    this.elListe.appendChild(h('div.anu-rangee.anu-tete', tetes.map(function (t) { return h('div.' + t[0], { text: t[1] }); })));
    liste.slice(0, this.limite).forEach(function (a) { self.elListe.appendChild(self.rangee(a)); });
    if (liste.length > this.limite) this.elListe.appendChild(h('button.btn.anu-plus', { type: 'button', text: 'Afficher ' + Math.min(LIMITE, liste.length - this.limite) + ' de plus (' + (liste.length - this.limite) + ' restants)', onclick: function () { self.limite += LIMITE; self.rafraichir(); } }));
  };
  VueAnalyse.prototype.rangee = function (a) {
    var self = this, p = this.p(), couts = voitCouts(), ouvert = !!this.ouverts[a.vin];
    var veh = h('div.anu-veh', [AMX.logoMarque ? AMX.logoMarque(nomMarque(a.marque) || String(a.texte || '').split(' ')[0], 'petit') : null, h('div', [
      h('div.nom', [h('a', { href: AMX.inventaire.lien ? AMX.inventaire.lien('DETAIL', { vin: a.vin }) : '#', text: a.nom || a.vin, title: 'Ouvrir dans Usagé — ' + a.vin })]),
      h('div.mini', { text: [a.stock ? '# ' + a.stock : '', km(a.km), COURTS[a.compagnie] || a.compagnie, a.statut !== 'stock' ? STATUT_LIB[a.statut] || a.statut : ''].filter(Boolean).join(' · ') }),
      a.alertes.length ? h('div.anu-alertes', a.alertes.map(function (x) { return h('span.puce.' + x.c, { text: x.t, title: x.title || '' }); })) : null])]);
    var age = h('div.anu-age', [h('span.anu-jours.t' + Math.min(a.tranche, 5) + (a.tranche >= p.tranches.length - 2 ? '.vieux' : ''), { text: nb(a.jours) ? a.jours + ' j' : '—', title: a.dateAjout ? 'Entré au registre le ' + AMX.fmtDate(a.dateAjout) : '' }),
      nb(a.avant) && a.changeLe ? h('div.mini', { text: (a.prix < a.avant ? 'baissé' : 'monté') + ' de ' + argent(Math.abs(a.prix - a.avant)) + ' il y a ' + (a.joursPrix || 0) + ' j' }) :
        (nb(a.joursPrix) ? h('div.mini.doux', { text: 'prix inchangé ' + a.joursPrix + ' j' + (a.joursPrixDepuisVu ? '+' : '') }) : null)]);
    var prix = h('div.anu-prix', [nb(a.prix) ? h('b', { text: argent(a.prix) }) : h('span.doux', { text: 'pas de prix' }),
      h('div.mini', { text: nb(a.med) ? 'marché ' + argent(a.med) + ' (' + a.n + ' comp.' + (a.elargi ? ', élargi' : '') + ')' : (a.n ? a.n + ' comparable(s)' : 'pas de marché lu'),
        title: nb(a.p25) ? 'Moitié des comparables entre ' + argent(a.p25) + ' et ' + argent(a.p75) + ' (ajustés à notre km)' : '' }),
      a.source === 'site' ? h('div.mini.doux', { text: 'prix du site (D2C)' }) : (a.lien ? h('div.mini', [h('a', { href: a.lien, target: '_blank', rel: 'noopener', text: 'notre annonce ↗' })]) : null)]);
    var ecart = nb(a.ptm) ? a.ptm - a.cible : null, clsP = !nb(ecart) ? 'doux' : (ecart > p.tolerance ? 'neg' : (ecart < -p.tolerance ? 'bleu' : 'pos'));
    var ptm = h('div.anu-ptm', [h('b.' + clsP, { text: pct(a.ptm) }), h('div.mini.doux', { text: 'visé ' + pct(a.cible) }), nb(a.rang) ? h('div.mini', { text: rangTexte(a.rang, a.n + 1) }) : null]);
    var ctm = couts ? h('div.anu-ctm', [h('b' + (nb(a.ctm) && a.ctm > p.ctmMax ? '.neg' : ''), { text: pct(a.ctm) }), h('div.mini', { text: nb(a.profitAff) ? 'profit affiché ' + signe(a.profitAff) : (nb(a.cout) ? 'coût ' + argent(a.cout) : 'coût inconnu') }),
      a.coutSource === 'manheim' ? h('div.mini.doux', { text: 'coût = prix payé Manheim', title: 'Pas de coût au registre : le prix payé sur Manheim sert de coût (sans les frais).' }) : null,
      nb(a.detention) && a.detention >= 50 ? h('div.mini.doux', { text: 'détention ' + argent(a.detention) }) : null]) : null;
    var appro = (this._ctx && this._ctx.ventes[a.cle]) || null;
    var mds = h('div.anu-mds', [h('b', { text: nb(a.mds) ? a.mds + ' j' : (a.mdsLu ? (nb(a.mdsActifs) && a.mdsActifs > 0 ? '∞' : '—') : '—'), title: a.mdsLu ? (a.mdsActifs + ' en vente, ' + a.mdsVendus + ' vendus en 45 jours (MarketCheck)') : 'Pas encore lu' }),
      h('div.mini' + (a.ventes90 ? '' : '.doux'), { text: a.ventes90 ? a.ventes90 + ' vendu' + (a.ventes90 > 1 ? 's' : '') + ' chez nous (90 j)' : 'aucun vendu chez nous (90 j)', title: appro && appro.jours.length ? 'Délai médian de vente : ' + Math.round(mediane(appro.jours)) + ' j' : '' })]);
    var lib = A_LIB[a.action.code] || A_LIB.ok;
    var conseilEl = h('div.anu-conseil', [h('span.puce.' + lib.c + '.anu-action', { text: a.action.titre }), h('div.mini', { text: a.action.detail })]);
    var menu = AMX.menuActions ? AMX.menuActions([
      { texte: 'Ouvrir dans Usagé', action: function () { AMX.inventaire.aller('DETAIL', { vin: a.vin }); } },
      a.n ? { texte: ouvert ? 'Masquer les comparables' : 'Voir les comparables', action: function () { self.ouverts[a.vin] = !self.ouverts[a.vin]; self.rafraichir(); } } : null,
      { texte: 'Prix du marché (Opportunités)', action: function () { AMX.aller('outils', 'opportunites', { onglet: 'marche', q: a.stock || a.vin }); } },
      a.manheim && AMX.manheim.ouvrir ? { texte: 'Fiche Manheim (photos, état)', action: function () { AMX.manheim.ouvrir(a.vin); } } : null
    ].filter(Boolean), { titre: 'Actions — ' + (a.stock || a.vin) }) : h('span');
    var r = h('div.anu-rangee.a-' + a.action.code, { 'data-vin': a.vin }, [veh, age, prix, ptm, ctm, mds, conseilEl, h('div.anu-act', [menu])].filter(Boolean));
    if (ouvert) r.appendChild(comparables(a));
    return r;
  };
  function comparables(a) {
    return h('div.anu-comps', [h('div.anu-defile', [h('table.anu-table', [h('thead', [h('tr', ['Comparable', 'Km', 'Prix', 'Ajusté à notre km', 'Concessionnaire', 'En ligne', ''].map(function (t, i) { return h('th' + (i && i < 4 ? '.num' : ''), { text: t }); }))]),
      h('tbody', a.comps.map(function (c) {
        return h('tr', [h('td', { text: [c.a, c.mo, c.ve].filter(Boolean).join(' ') }), h('td.num', { text: nb(c.k) ? AMX.fmtNombre(c.k) : '—' }), h('td.num', { text: argent(c.p) }), h('td.num', [h('b', { text: argent(c.aj) })]),
          h('td', { text: [c.s, c.vi].filter(Boolean).join(', ') }), h('td', { text: nb(c.j) ? c.j + ' j' : '—' }), h('td', [/^https:\/\//.test(c.l || '') ? h('a', { href: c.l, target: '_blank', rel: 'noopener', text: 'Annonce ↗' }) : null])]);
      }))])]), h('div.mini.doux', { text: 'Les ' + a.comps.length + ' moins chers' + (a.n > a.comps.length ? ' sur ' + a.n : '') + (a.elargi ? ' · élargi à l\'année ± 2, tout km' : ' · même modèle, année ± 1, km ± 30 000') })]);
  }
  VueAnalyse.prototype.lireMds = function (b) {
    var self = this;
    if (b) b.classList.add('occupe');
    AMX.post({ action: 'analyseUsageMds', max: 15 }, { delai: 300000, secours: false }).then(function (r) {
      if (b) b.classList.remove('occupe');
      if (!r || r.refuse || (r.ok === false && !(r.resultat && r.resultat.lus))) { AMX.toast((r && r.erreur) || 'Refusé', 'attention', 9000); return; }
      if (r.vehicules) throw new Error('Le script n\'est pas à jour : déployez une nouvelle version (AnalyseUsage.gs, RoutesAjout.gs).');
      var x = r.resultat || {};
      AMX.toast(x.saut ? x.saut : (x.lus + ' MDS lus chez MarketCheck' + (x.restants ? ' · ' + x.restants + ' modèles restants (l\'horloge continue aux 2 heures)' : '') + (x.erreur ? ' · ' + x.erreur : '')), x.erreurs ? 'attention' : 'ok', 9000);
      chargerAnalyse(true).then(function (d) { self.d = d; self.rendre(); });
    }).catch(function (e) { if (b) b.classList.remove('occupe'); AMX.toast(AMX.erreurTexte(e), 'erreur'); });
  };
  VueAnalyse.prototype.reglages = function () {
    var self = this, d = this.d || {}, p = this.p();
    if (d.ancien) { AMX.toast('Les réglages s\'enregistrent après le déploiement du script (AnalyseUsage.gs).', 'attention', 8000); return; }
    var champ = function (val, opts) { return h('input.saisie', Object.assign({ type: 'number', value: String(val), step: 'any' }, opts || {})); };
    var lignesT = p.tranches.map(function (t) { return { max: champ(t.max || '', { min: '1', max: '730', placeholder: 'au-delà' }), cible: champ(t.cible, { min: '70', max: '120' }) }; });
    var tbody = h('tbody', lignesT.map(function (l, i) { return h('tr', [h('td', { text: i === lignesT.length - 1 ? 'Au-delà' : 'Jusqu\'à' }), h('td', [i === lignesT.length - 1 ? h('span.doux', '—') : l.max]), h('td', [l.cible, h('span.doux', ' %')])]); }));
    var c = {
      tolerance: champ(p.tolerance, { min: '0', max: '10' }), ctmMax: champ(p.ctmMax, { min: '50', max: '120' }), ageGros: champ(p.ageGros, { min: '15', max: '365' }),
      mdsHaut: champ(p.mdsHaut, { min: '10', max: '365' }), mdsBas: champ(p.mdsBas, { min: '0', max: '365' }), tauxDetention: champ(p.tauxDetention, { min: '0', max: '30' }),
      mdsBudgetMois: champ(p.mdsBudgetMois, { min: '0', max: '5000' }), mdsJours: champ(p.mdsJours, { min: '1', max: '60' })
    };
    var actif = h('input', { type: 'checkbox', checked: p.mdsActif ? 'checked' : undefined });
    var lab = function (t, el, aide) { return h('label.champ', [h('span', { text: t }), el, aide ? h('small.doux', { text: aide }) : null]); };
    var corps = h('div.anu-reglages', [
      h('h4', 'Profil de prix par âge (% du marché visé)'),
      h('p.mini.doux', { text: 'vAuto propose par exemple 97, 95, 93, 91 % par tranches de 15 jours : un usagé frais peut être au marché, un vieux doit passer sous le marché.' }),
      h('table.anu-table', [h('thead', [h('tr', [h('th', ''), h('th', 'Âge (jours)'), h('th', '% visé')])]), tbody]),
      h('div.anu-grille', [
        lab('Tolérance (points de %)', c.tolerance, 'Écart permis avant « baisser » ou « monter ».'),
        lab('% coût / marché maximal', c.ctmMax, 'Au-delà : « coût élevé » (repère vAuto : 84 %).'),
        lab('Envisager le gros à partir de (jours)', c.ageGros),
        lab('Taux de détention (% par an)', c.tauxDetention, 'Intérêts du plan sur le coût.'),
        lab('MDS élevé (jours)', c.mdsHaut, 'Offre abondante : plus agressif.'),
        lab('MDS bas (jours)', c.mdsBas, 'Forte demande.')]),
      h('h4', 'MDS MarketCheck'),
      h('label.case', [actif, h('span', ' Lire le MDS des modèles de notre stock (forfait MarketCheck)')]),
      h('div.anu-grille', [lab('Appels par mois au plus', c.mdsBudgetMois), lab('Relire chaque modèle aux (jours)', c.mdsJours)])
    ]);
    AMX.modale({ titre: 'Réglages — analyse de l\'usagé', corps: corps, large: true, boutons: [{ texte: 'Remettre par défaut', action: function () {
      var df = (d.defauts || DEFAUTS);
      return AMX.post({ action: 'analyseUsageParams', params: df }).then(function (r) { return self.apresReglages(r); });
    } }, { texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: function () {
      var v = function (el) { var x = parseFloat(String(el.value).replace(',', '.')); return isFinite(x) ? x : null; };
      var tranches = lignesT.map(function (l, i) { return { max: i === lignesT.length - 1 ? 0 : v(l.max), cible: v(l.cible) }; }).filter(function (t) { return t.cible !== null && (t.max === 0 || t.max > 0); });
      var params = { tranches: tranches, mdsActif: !!actif.checked };
      Object.keys(c).forEach(function (k) { var x = v(c[k]); if (x !== null) params[k] = x; });
      return AMX.post({ action: 'analyseUsageParams', params: params }).then(function (r) { return self.apresReglages(r); });
    } }] });
  };
  VueAnalyse.prototype.apresReglages = function (r) {
    if (!r || r.refuse || r.ok === false) { AMX.toast((r && r.erreur) || 'Refusé', 'erreur'); return false; }
    if (r.vehicules || !r.params) { AMX.toast('Le script n\'est pas à jour : déployez une nouvelle version (AnalyseUsage.gs, RoutesAjout.gs).', 'erreur', 9000); return false; }
    if (cacheA.rep) cacheA.rep.params = r.params;
    this.d = cacheA.rep || this.d; this._cle = null;
    AMX.toast('Réglages enregistrés', 'ok');
    this.rendre();
    return true;
  };
  VueAnalyse.prototype.exporter = function () {
    if (typeof XLSX === 'undefined') { AMX.toast('La bibliothèque Excel n\'est pas encore chargée. Réessayez.', 'erreur'); return; }
    var p = this.p(), couts = voitCouts(), liste = this.trier(this.filtrer());
    if (!liste.length) { AMX.toast('Rien à exporter.', 'attention'); return; }
    var lignes = liste.map(function (a) {
      var o = { 'Stock': a.stock, 'NIV': a.vin, 'Concession': COURTS[a.compagnie] || a.compagnie, 'Véhicule': a.nom, 'Km': a.km, 'Statut': STATUT_LIB[a.statut] || a.statut, 'Entré le': a.dateAjout, 'Jours en stock': a.jours,
        'Tranche': libTranche(a.tranche, p.tranches), 'Notre prix': a.prix, 'Source du prix': a.source === 'site' ? 'site (D2C)' : (a.source ? 'annonce' : ''), 'Prix d\'avant': a.avant, 'Prix changé le': a.changeLe,
        'Médiane du marché (ajustée au km)': a.med, 'Comparables': a.n, 'Rang (du moins cher)': a.rang, '% du marché': a.ptm, '% visé': a.cible, 'Prix visé': a.prixCible, 'Écart au prix visé': a.ecartCible };
      if (couts) { o['Coût'] = a.cout; o['Source du coût'] = a.coutSource === 'manheim' ? 'prix payé Manheim' : (a.coutSource ? 'registre' : ''); o['% coût / marché'] = a.ctm; o['Profit affiché'] = a.profitAff; o['Profit au marché'] = a.profitMarche; o['Coût de détention cumulé'] = nb(a.detention) ? Math.round(a.detention) : null; o['Gros OpenLane'] = a.gros; o['Gros − coût'] = a.grosEcart; }
      o['MDS (j)'] = a.mds; o['En vente (MarketCheck)'] = a.mdsActifs; o['Vendus 45 j (MarketCheck)'] = a.mdsVendus; o['Nos ventes du modèle (90 j)'] = a.ventes90;
      o['Conseil'] = a.action.titre; o['Détail'] = a.action.detail; o['Alertes'] = a.alertes.map(function (x) { return x.t; }).join(' · ');
      return o;
    });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lignes), 'Analyse usagé');
    XLSX.writeFile(wb, 'analyse-usage-' + (this.compagnie || 'groupe').toLowerCase() + '-' + new Date().toISOString().slice(0, 10) + '.xlsx');
    AMX.toast('Export Excel — ' + lignes.length + ' usagés', 'ok');
  };

  /* Pour les tests et l'Accueil. */
  AMX.analyseUsage = { analyser: analyser, conseil: conseil, cleModele: cleModele, trancheDe: trancheDe, libTranche: libTranche, ventesDe: ventesDe, charger: chargerAnalyse, DEFAUTS: DEFAUTS };

  function injecterCss() {
    if (document.getElementById('css-anu')) return;
    var s = document.createElement('style'); s.id = 'css-anu';
    s.textContent = [
      '.inv2-filtres.anu-filtres { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; } .anu-filtres > .anu-ligne { width: 100%; min-width: 0; }',
      '.anu-ligne { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; }',
      '.anu-ligne .recherche { flex: 1 1 320px; max-width: 520px; } .anu-ligne #anu-tri { flex: 0 0 auto; width: auto; }',
      '.anu-lib { font-size: 12px; font-weight: 600; color: var(--encre-3); text-transform: uppercase; letter-spacing: .04em; min-width: 58px; }',
      '.anu-pt { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; background: var(--encre-4); }',
      '.anu-pt.rouge { background: var(--rouge); } .anu-pt.vert { background: var(--vert); } .anu-pt.bleu { background: var(--bleu); } .anu-pt.ambre { background: var(--ambre); }',
      '.kpis.anu-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); overflow: visible; } .kpis.anu-kpis .kpi { min-width: 0; border-bottom: 1px solid var(--ligne); } .kpis.anu-kpis .kpi:nth-child(4n) { border-right: 0; }',
      '@media (max-width: 900px) { .kpis.anu-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }',
      '.anu-profil, .anu-cies { margin-bottom: 14px; }',
      '.anu-titre { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline; margin-bottom: 8px; } .anu-titre h3 { margin: 0; font-size: 15px; }',
      '.anu-defile { overflow-x: auto; }',
      '.anu-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }',
      '.anu-table th { text-align: left; font-size: 12px; font-weight: 600; color: var(--encre-3); padding: 6px 8px; border-bottom: 1px solid var(--trait); white-space: nowrap; }',
      '.anu-table td { padding: 7px 8px; border-bottom: 1px solid var(--trait); vertical-align: middle; }',
      '.anu-table th.num, .anu-table td.num { text-align: right; white-space: nowrap; }',
      '.anu-profil tbody tr, .anu-cies tbody tr { cursor: pointer; } .anu-profil tbody tr:hover, .anu-cies tbody tr:hover { background: var(--fond); }',
      '.anu-profil tbody tr.actif { background: var(--vert-clair); }',
      '.anu-part { display: flex; align-items: center; gap: 8px; } .anu-part span { font-variant-numeric: tabular-nums; min-width: 38px; }',
      '.anu-barre { flex: 1 1 auto; min-width: 60px; max-width: 160px; height: 8px; border-radius: 4px; background: var(--fond-2, #EEF1F4); overflow: hidden; }',
      '.anu-barre i { display: block; height: 100%; background: var(--vert); }',
      '.anu-repartition { display: flex; flex-wrap: wrap; gap: 6px 22px; margin-top: 10px; font-size: 13.5px; }',
      '.anu-table .neg, .anu-repartition .neg, .anu-rangee .neg { color: var(--rouge); } .anu-table .pos, .anu-rangee .pos { color: var(--vert-fonce); } .anu-table .bleu, .anu-rangee .bleu { color: var(--bleu); }',
      '.anu-liste { padding: 0; overflow: hidden; }',
      '.anu-rangee { display: grid; gap: 10px; padding: 10px 14px; border-top: 1px solid var(--trait); align-items: start; font-size: 13.5px;',
      '  grid-template-columns: minmax(220px, 2fr) 92px 150px 96px 130px 120px minmax(190px, 1.6fr) 40px; }',
      '.anu-liste.sans-couts .anu-rangee { grid-template-columns: minmax(220px, 2fr) 92px 150px 96px 120px minmax(190px, 1.6fr) 40px; }',
      '.anu-rangee.anu-tete { border-top: 0; background: var(--fond); font-size: 12px; font-weight: 600; color: var(--encre-3); text-transform: uppercase; letter-spacing: .04em; }',
      '.anu-rangee .mini { font-size: 12px; color: var(--encre-3); margin-top: 2px; } .anu-rangee .mini.doux, .anu-rangee .doux { color: var(--encre-4); }',
      '.anu-veh { display: flex; gap: 10px; align-items: flex-start; min-width: 0; } .anu-veh .nom a { font-weight: 600; color: var(--encre); text-decoration: none; } .anu-veh .nom a:hover { text-decoration: underline; }',
      '.anu-alertes { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px; } .anu-alertes .puce { font-size: 12px; }',
      '.anu-jours { display: inline-block; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: var(--vert-clair); color: var(--vert-fonce); font-variant-numeric: tabular-nums; }',
      '.anu-jours.t2, .anu-jours.t3 { background: #FFF4DB; color: var(--ambre); } .anu-jours.vieux { background: #FDE2E2; color: var(--rouge); }',
      '.anu-ptm b, .anu-ctm b, .anu-mds b, .anu-prix b { font-size: 14.5px; font-variant-numeric: tabular-nums; }',
      '.anu-action { font-weight: 600; } .anu-page .puce.rouge { background: #FDE2E2; color: var(--rouge); } .anu-page .puce.ambre { background: #FFF4DB; color: var(--ambre); } .anu-page .puce.bleu { background: #E3EEFB; color: var(--bleu); } .anu-page .puce.vert { background: var(--vert-clair); color: var(--vert-fonce); }',
      '.anu-act { display: flex; justify-content: flex-end; }',
      '.anu-comps { grid-column: 1 / -1; background: var(--fond); border-radius: 8px; padding: 8px 10px; }',
      '.anu-plus { margin: 12px auto; display: block; }',
      '.anu-reglages h4 { margin: 14px 0 6px; } .anu-reglages h4:first-child { margin-top: 0; }',
      '.anu-reglages .anu-table input { width: 90px; } .anu-grille { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px 14px; margin-top: 10px; }',
      '.anu-grille small { display: block; margin-top: 3px; font-size: 12px; }',
      '@media (max-width: 1180px) { .anu-rangee { grid-template-columns: minmax(200px, 1.6fr) 84px 140px 92px 120px minmax(170px, 1.4fr) 40px; } .anu-liste.sans-couts .anu-rangee { grid-template-columns: minmax(200px, 1.6fr) 84px 140px 92px minmax(170px, 1.4fr) 40px; } .anu-rangee .anu-mds { display: none; } }',
      '@media (max-width: 760px) { .anu-rangee, .anu-liste.sans-couts .anu-rangee { grid-template-columns: 1fr 1fr; } .anu-rangee.anu-tete { display: none; } .anu-veh, .anu-conseil { grid-column: 1 / -1; } .anu-act { position: absolute; right: 10px; } .anu-rangee { position: relative; } .anu-rangee .anu-mds { display: block; } }'
    ].join('\n');
    document.head.appendChild(s);
  }
})();
