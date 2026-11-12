/* =====================================================================================================
   annonces-analyse.js — Marketing › Analyse (12 nov. 2026)

   Maxime : « je veux vraiment une analyse poussée des résultats de la bannière, fais un onglet Analyse » (rapport
   reports/Analyse des annonces de véhicules Google.md). Cinq zones, dans l'ordre du rapport :
   1. Santé du flux — ce que Google reçoit (FluxGoogle : prêts, à compléter, exclus, absents du site, photos, fraîcheur).
   2. Exposition par âge — la part du stock contre la part des impressions, des clics et de la dépense, par tranche d'âge ;
      les sous-exposés et la dépense sans conversion.
   3. Entonnoir — dépense, impressions, clics, conversions de la période contre la période précédente, 13 semaines.
   4. Ventes et profit — chaque vente du Livre des ventes avec ce que son NIV a reçu en publicité AVANT la vente
      (« NIV influencé » = au moins un clic et un coût), jours à la vente annoncés ou non, coût par vente, profit ÷ dépense.
   5. Par véhicule — le tableau par NIV.
   Les résultats Google Ads arrivent par un script Google Ads (collé par Maxime, programmé chaque jour) qui écrit dans une
   feuille que ScanAutomax relit (AnnoncesAnalyse.gs). Tout est calculé ici et sur le serveur : rien ne part à une IA.
   Routes : GET ?annoncesAnalyse=1&compagnie=&du=&au= ; POST annoncesResultats { op: creer | partager | lire } ;
   et ?fluxGoogle=1 (FluxGoogle.gs) pour le flux.
   ===================================================================================================== */
(function () {
  'use strict';
  var h = AMX.h;
  var SCRIPT_PAS_A_JOUR = 'Le script n\'est pas à jour : déployez la version qui contient AnnoncesAnalyse.gs.';
  var CSS = [
    '.ana-page .ana-filtres { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 0 0 10px; }',
    '.ana-filtres select.saisie { width: auto; flex: 0 0 auto; min-width: 190px; }',
    '.ana-zone { margin: 0 0 22px; } .ana-zone > h2 { font-size: 17px; margin: 0 0 4px; } .ana-zone > p.q { margin: 0 0 10px; font-size: 13px; color: var(--encre-3); }',
    '.ana-tuiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 0 0 12px; }',
    '.ana-tuile { border: 1px solid var(--ligne); background: var(--carte); border-radius: 12px; padding: 11px 14px; text-align: left; font: inherit; color: var(--encre); }',
    'button.ana-tuile { cursor: pointer; } button.ana-tuile:hover { border-color: var(--encre-4); }',
    '.ana-tuile b { display: block; font-size: 24px; line-height: 1.15; font-variant-numeric: tabular-nums; } .ana-tuile span { display: block; font-size: 13px; color: var(--encre-3); } .ana-tuile em { display: block; font-style: normal; font-size: 12px; margin-top: 3px; color: var(--encre-3); }',
    '.ana-tuile.vert b { color: var(--vert-fonce); } .ana-tuile.ambre b { color: var(--ambre); } .ana-tuile.rouge b { color: var(--rouge); } .ana-tuile em.hausse { color: var(--vert-fonce); } .ana-tuile em.baisse { color: var(--rouge); }',
    '.ana-carte { border: 1px solid var(--ligne); background: var(--carte); border-radius: 12px; padding: 12px 14px; margin: 0 0 12px; font-size: 14px; }',
    '.ana-carte.ambre { border-color: var(--ambre); background: var(--ambre-bg, #fff6e5); } .ana-carte.bleu { border-color: var(--bleu); background: var(--bleu-bg); }',
    '.ana-carte h3 { font-size: 15px; margin: 0 0 6px; } .ana-carte ol { margin: 6px 0 0 18px; padding: 0; } .ana-carte li { margin: 5px 0; } .ana-carte .m { color: var(--encre-3); font-size: 13px; }',
    '.ana-carte pre { white-space: pre-wrap; word-break: break-word; font-size: 12px; background: var(--fond); border: 1px solid var(--ligne); border-radius: 8px; padding: 10px; max-height: 320px; overflow: auto; }',
    '.ana-carte .rangee { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 8px; }',
    '.ana-table { width: 100%; border-collapse: collapse; font-size: 13px; } .ana-table th { text-align: left; font-weight: 700; color: var(--encre-2); border-bottom: 1px solid var(--ligne); padding: 6px 8px; white-space: nowrap; }',
    '.ana-table td { border-bottom: 1px solid var(--ligne); padding: 6px 8px; vertical-align: middle; } .ana-table td.n, .ana-table th.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }',
    '.ana-table tr:last-child td { border-bottom: 0; } .ana-defile { overflow-x: auto; border: 1px solid var(--ligne); border-radius: 12px; background: var(--carte); }',
    '.ana-barre { position: relative; height: 8px; border-radius: 999px; background: var(--fond); min-width: 80px; } .ana-barre i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 999px; background: var(--vert); }',
    '.ana-barre.stock i { background: var(--encre-4); }',
    '.ana-pastille { display: inline-block; font-size: 12px; font-weight: 700; border-radius: 999px; padding: 1px 8px; margin: 1px 4px 1px 0; white-space: nowrap; }',
    '.ana-pastille.vert { background: var(--vert-clair); color: var(--vert-fonce); } .ana-pastille.ambre { background: #fff1d6; color: var(--ambre); } .ana-pastille.rouge { background: #fde2e2; color: var(--rouge); } .ana-pastille.gris { background: var(--fond); color: var(--encre-3); } .ana-pastille.violet { background: #f1ebff; color: #6d28d9; } .ana-pastille.bleu { background: var(--bleu-bg); color: var(--bleu); }',
    '.ana-vh { display: flex; gap: 10px; align-items: center; } .ana-vh img, .ana-vh .sans { width: 64px; height: 44px; object-fit: cover; border-radius: 6px; background: var(--fond); flex: none; } .ana-vh .sans { display: grid; place-items: center; font-size: 11px; color: var(--encre-3); }',
    '.ana-vh b { display: block; font-size: 13px; } .ana-vh span { display: block; font-size: 12px; color: var(--encre-3); }',
    '.ana-mini { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; } .ana-mini .graph { border: 1px solid var(--ligne); background: var(--carte); border-radius: 12px; padding: 10px 12px; }',
    '.ana-mini .graph h4 { margin: 0 0 6px; font-size: 13px; color: var(--encre-2); } .ana-mini svg { width: 100%; height: auto; display: block; } .ana-mini svg rect.b { fill: var(--vert); } .ana-mini svg rect.b:hover { fill: var(--vert-fonce); } .ana-mini svg text { fill: var(--encre-3); font-size: 10px; } .ana-mini svg line { stroke: var(--ligne); }',
    '.ana-vide { padding: 22px; text-align: center; color: var(--encre-3); border: 1px dashed var(--ligne); border-radius: 12px; background: var(--carte); }',
    '.ana-deux { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; }',
    '@media (max-width: 640px) { .ana-tuile b { font-size: 20px; } .ana-table .cache-tel { display: none; } }'
  ].join('\n');
  function css() { if (!document.getElementById('css-annonces-analyse')) { var s = document.createElement('style'); s.id = 'css-annonces-analyse'; s.textContent = CSS; document.head.appendChild(s); } }
  function peutVoir() { return !!(AMX.fluxGoogle && AMX.fluxGoogle.peutVoir()); }

  var PERIODES = [['7', '7 derniers jours'], ['30', '30 derniers jours'], ['90', '90 derniers jours'], ['mois', 'Ce mois-ci'], ['moisprec', 'Le mois passé'], ['13s', '13 semaines']];
  var GENRES = [['', 'Tous'], ['neuf', 'Neufs'], ['occasion', 'Occasions'], ['demo', 'Démos']];
  var NOM_GENRE = { neuf: 'Neuf', occasion: 'Occasion', demo: 'Démo' };
  var TRANCHES = [[15, '0-15 j'], [30, '16-30 j'], [45, '31-45 j'], [60, '46-60 j'], [90, '61-90 j'], [Infinity, '90 j et +']];
  var RESEAUX = { SEARCH: 'Recherche Google', SEARCH_PARTNERS: 'Partenaires de recherche', CONTENT: 'Display', YOUTUBE: 'YouTube', YOUTUBE_SEARCH: 'YouTube', YOUTUBE_WATCH: 'YouTube', CROSS_NETWORK: 'Plusieurs réseaux (Performance Max)', GOOGLE_TV: 'Google TV', MIXED: 'Mixte', TOUS: 'Tous les réseaux', UNKNOWN: 'Inconnu', UNSPECIFIED: 'Non précisé' };

  function iso(d) { var p = function (n) { return String(n).padStart(2, '0'); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  function periodeDates(code) {
    var ajd = new Date(); ajd.setHours(12, 0, 0, 0);
    var hier = new Date(ajd); hier.setDate(hier.getDate() - 1);
    if (code === 'mois') { var d1 = new Date(ajd.getFullYear(), ajd.getMonth(), 1, 12); return { du: iso(d1), au: iso(hier < d1 ? d1 : hier) }; }
    if (code === 'moisprec') { var a = new Date(ajd.getFullYear(), ajd.getMonth() - 1, 1, 12), b = new Date(ajd.getFullYear(), ajd.getMonth(), 0, 12); return { du: iso(a), au: iso(b) }; }
    var n = code === '13s' ? 91 : (parseInt(code, 10) || 30), du = new Date(hier); du.setDate(du.getDate() - (n - 1));
    return { du: iso(du), au: iso(hier) };
  }
  function fmtJour(s) { if (!s) return ''; var d = new Date(String(s).slice(0, 10) + 'T12:00:00'); return isNaN(d) ? s : d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' }); }
  function argent(n, dec) { return AMX.fmtArgent ? AMX.fmtArgent(n, dec) : (Math.round(n) + ' $'); }
  function nb(n) { return AMX.fmtNombre(Math.round(n || 0)); }
  function pct(a, b, dec) { if (!b) return '—'; var v = 100 * a / b; return (Math.round(v * Math.pow(10, dec || 0)) / Math.pow(10, dec || 0)).toLocaleString('fr-CA') + ' %'; }
  function mediane(l) { var a = l.filter(function (x) { return x !== null && x !== undefined && isFinite(x); }).sort(function (x, y) { return x - y; }); if (!a.length) return null; var m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; }
  function tranche(j) { if (j === null || j === undefined || !isFinite(j)) return null; for (var i = 0; i < TRANCHES.length; i++) if (j <= TRANCHES[i][0]) return i; return TRANCHES.length - 1; }
  function vide() { return { impressions: 0, clics: 0, cout: 0, conversions: 0, valeur: 0 }; }
  function ajoute(a, b) { if (b) ['impressions', 'clics', 'cout', 'conversions', 'valeur'].forEach(function (k) { a[k] += b[k] || 0; }); return a; }
  function variation(a, b) {
    if (!b) return null; var v = (a - b) / b * 100; return { t: (v >= 0 ? '+' : '−') + Math.abs(Math.round(v)).toLocaleString('fr-CA') + ' % vs période précédente', c: v >= 0 ? 'hausse' : 'baisse' };
  }

  /* Le script Google Ads à coller dans Google Ads › Outils › Actions groupées › Scripts (il ne change rien dans le compte). */
  function scriptAds(url, nom) {
    return [
      '/* ScanAutomax — résultats des annonces de véhicules, par véhicule (NIV), pour ' + (nom || 'la concession') + '.',
      '   Ce script ne change RIEN dans Google Ads : il lit les statistiques des 30 derniers jours et les écrit dans la',
      '   feuille de ScanAutomax. À programmer « Tous les jours ». */',
      'var FEUILLE = \'' + url + '\';',
      'var PERIODE = \'LAST_30_DAYS\';',
      '',
      'function lire(q) { var out = [], it = AdsApp.search(q); while (it.hasNext()) out.push(it.next()); return out; }',
      'function n(x) { var v = Number(x); return isFinite(v) ? v : 0; }',
      'function ecrire(ss, nom, tete, lignes) {',
      '  var sh = ss.getSheetByName(nom) || ss.insertSheet(nom);',
      '  sh.clearContents();',
      '  var t = [tete].concat(lignes);',
      '  sh.getRange(1, 1, t.length, 4).setNumberFormat(\'@\');',
      '  sh.getRange(1, 1, t.length, tete.length).setValues(t);',
      '}',
      'function main() {',
      '  var ss = SpreadsheetApp.openByUrl(FEUILLE), v = [], c = [], q, rows;',
      '  q = \'SELECT segments.date, segments.product_item_id, segments.ad_network_type, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM shopping_performance_view WHERE segments.date DURING \' + PERIODE + \' AND metrics.impressions > 0\';',
      '  try { rows = lire(q); } catch (e) { rows = lire(q.replace(\', segments.ad_network_type\', \'\')); }',
      '  rows.forEach(function (r) {',
      '    v.push([r.segments.date, String(r.segments.productItemId || \'\').toUpperCase(), r.segments.adNetworkType || \'\', r.campaign.name,',
      '      n(r.metrics.impressions), n(r.metrics.clicks), n(r.metrics.costMicros) / 1e6, n(r.metrics.conversions), n(r.metrics.conversionsValue)]);',
      '  });',
      '  q = \'SELECT segments.date, campaign.name, campaign.advertising_channel_type, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date DURING \' + PERIODE + \' AND metrics.impressions > 0\';',
      '  lire(q).forEach(function (r) {',
      '    c.push([r.segments.date, r.campaign.name, r.campaign.advertisingChannelType || \'\', n(r.metrics.impressions), n(r.metrics.clicks), n(r.metrics.costMicros) / 1e6, n(r.metrics.conversions), n(r.metrics.conversionsValue)]);',
      '  });',
      '  ecrire(ss, \'Vehicules\', [\'date\', \'item_id\', \'reseau\', \'campagne\', \'impressions\', \'clics\', \'cout\', \'conversions\', \'valeur\'], v);',
      '  ecrire(ss, \'Campagnes\', [\'date\', \'campagne\', \'type\', \'impressions\', \'clics\', \'cout\', \'conversions\', \'valeur\'], c);',
      '  var compte = AdsApp.currentAccount(), info = ss.getSheetByName(\'Info\') || ss.insertSheet(\'Info\');',
      '  info.clearContents();',
      '  info.getRange(1, 1, 4, 2).setNumberFormat(\'@\');',
      '  info.getRange(1, 1, 4, 2).setValues([[\'maj\', new Date().toISOString()], [\'compte\', compte.getCustomerId()], [\'devise\', compte.getCurrencyCode()], [\'periode\', PERIODE]]);',
      '  Logger.log(v.length + \' lignes par véhicule, \' + c.length + \' lignes par campagne.\');',
      '}'
    ].join('\n');
  }

  var cache = {};   // par concession|du|au : { rep, le }
  function charger(cie, du, au, force) {
    var cle = cie + '|' + du + '|' + au, c = cache[cle];
    if (!force && c && Date.now() - c.le < AMX.dureeCopie(120000)) return Promise.resolve(c.rep);
    return AMX.get({ annoncesAnalyse: '1', compagnie: cie, du: du, au: au }, { delai: 90000, secours: false }).then(function (d) {
      if (d && d.refuse) throw new Error(d.erreur || 'Accès refusé.');
      if (!d || d.ok === false) throw new Error((d && d.erreur) || 'Lecture impossible.');
      if (!d.periode || !d.ads) throw new Error(SCRIPT_PAS_A_JOUR);
      cache[cle] = { rep: d, le: Date.now() };
      return d;
    });
  }

  function Vue(conteneur) {
    css();
    var self = this;
    this.conteneur = conteneur; this.detruit = false;
    this.cie = (AMX.compagnieChoisie && AMX.compagnieChoisie('inventaire')) || 'BMW';
    this.periode = AMX.memo.lire('ann_periode', '') || '30';
    this.genre = AMX.memo.lire('ann_genre', '') || '';
    this.tri = 'cout';
    AMX.vider(conteneur);
    this.btnRafraichir = h('button.btn', { type: 'button', text: 'Rafraîchir', onclick: function () { self.charger(true); } });
    this.btnRelire = h('button.btn', { type: 'button', text: 'Relire les résultats Google Ads', onclick: function () { self.resultats({ op: 'lire' }); } });
    this.btnBrancher = h('button.btn', { type: 'button', text: 'Brancher Google Ads…', onclick: function () { self.brancher(); } });
    this.btnExporter = h('button.btn', { type: 'button', text: 'Exporter Excel', onclick: function () { self.exporter(); } });
    this.elSous = h('p');
    conteneur.appendChild(h('div.entete-page', [
      h('div', [h('h1', 'Analyse des annonces'), this.elSous]),
      h('div.actions', AMX.actionsEntete([this.btnRafraichir, this.btnRelire, this.btnBrancher, this.btnExporter], [this.btnRafraichir]))
    ]));
    this.elCies = h('div.barre-cies'); conteneur.appendChild(this.elCies);
    this.elCorps = h('div.ana-page'); conteneur.appendChild(this.elCorps);
    this.surCie = function (e) { self.cie = (e.detail && e.detail.compagnie) || 'BMW'; self.charger(false); };
    document.addEventListener('amx:compagnie', this.surCie);
    this.charger(false);
  }
  Vue.prototype.demonter = function () { this.detruit = true; document.removeEventListener('amx:compagnie', this.surCie); };
  Vue.prototype.charger = function (force) {
    var self = this, cie = this.cie || 'BMW', p = periodeDates(this.periode);
    if (!this.rep) { AMX.vider(this.elCorps); this.elCorps.appendChild(AMX.chargeur('Analyse des annonces')); }
    var fl = AMX.fluxGoogle ? AMX.fluxGoogle.charger(cie, force).catch(function (e) { return { erreurFlux: AMX.erreurTexte(e) }; }) : Promise.resolve({ erreurFlux: 'Module Annonces Google absent.' });
    return Promise.all([charger(cie, p.du, p.au, force), fl]).then(function (r) {
      if (self.detruit || cie !== (self.cie || 'BMW')) return;
      self.rep = r[0]; self.flux = r[1]; self.rendre();
    }).catch(function (e) {
      if (self.detruit) return; AMX.vider(self.elCorps); self.elCorps.appendChild(h('div.ana-vide', { text: AMX.erreurTexte(e) }));
    });
  };
  Vue.prototype.resultats = function (corps) {
    var self = this;
    corps.action = 'annoncesResultats'; corps.compagnie = this.cie || 'BMW';
    return AMX.post(corps, { secours: false, delai: 120000 }).then(function (r) {
      if (!r || r.refuse || r.ok === false) throw new Error((r && r.erreur) || 'Refusé');
      if (!r.message && r.vehicules) throw new Error(SCRIPT_PAS_A_JOUR);
      AMX.toast(r.message || 'Fait.', 'ok', 6000); return self.charger(true);
    }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur', 9000); return false; });
  };

  /* Le genre d'un NIV : le flux d'abord, sinon la vente. */
  Vue.prototype.genres = function () {
    var g = {}, f = this.flux || {}, d = this.rep || {};
    (d.ventes || []).forEach(function (v) { if (v.vin) g[v.vin] = v.type === 'usage' ? 'occasion' : (/demo|courtoisie/i.test(v.categorie || '') ? 'demo' : 'neuf'); });
    (f.lignes || []).forEach(function (l) { var vin = l.google && l.google.vin; if (vin) g[vin] = l.genre; });
    return g;
  };
  Vue.prototype.garde = function (genre) { return !this.genre || genre === this.genre; };

  Vue.prototype.rendre = function () {
    var self = this, d = this.rep || {}, f = this.flux || {}, a = d.ads || {};
    var p = d.periode || {};
    this.elSous.textContent = (d.nom || this.cie) + ' · ' + fmtJour(p.du) + ' au ' + fmtJour(p.au) + (a.luLe ? ' · résultats Google Ads lus ' + AMX.fmtDate(a.luLe, true) : '');
    this.btnRelire.hidden = !a.branche;
    AMX.vider(this.elCorps);
    /* filtres d'abord */
    var selP = h('select.saisie', { onchange: function () { self.periode = selP.value; AMX.memo.ecrire('ann_periode', self.periode); self.rep = null; self.charger(false); } },
      PERIODES.map(function (x) { return h('option', { value: x[0], text: x[1], selected: x[0] === self.periode }); }));
    var seg = h('div.segment', GENRES.map(function (x) {
      return h('button' + (self.genre === x[0] ? '.actif' : ''), { type: 'button', 'aria-pressed': self.genre === x[0] ? 'true' : 'false', text: x[1], onclick: function () { self.genre = x[0]; AMX.memo.ecrire('ann_genre', x[0]); self.rendre(); } });
    }));
    this.elCorps.appendChild(h('div.ana-filtres', [selP, seg]));
    var portee = h('div'); this.elCorps.appendChild(portee);
    AMX.porteeChiffres(portee, { n: (f.lignes || []).filter(function (l) { return self.garde(l.genre); }).length, unite: ['véhicule sur le site', 'véhicules sur le site'],
      contexte: [d.nom || this.cie, fmtJour(p.du) + ' – ' + fmtJour(p.au)], filtres: this.genre ? [NOM_GENRE[this.genre]] : [], effacer: function () { self.genre = ''; AMX.memo.ecrire('ann_genre', ''); self.rendre(); } });
    this.elCorps.appendChild(this.carteGoogleAds());
    this.elCorps.appendChild(this.zoneFlux());
    this.elCorps.appendChild(this.zoneExposition());
    this.elCorps.appendChild(this.zoneEntonnoir());
    this.elCorps.appendChild(this.zoneVentes());
    this.elCorps.appendChild(this.zoneVehicules());
  };

  /* ---------- branchement de Google Ads ---------- */
  Vue.prototype.carteGoogleAds = function () {
    var self = this, d = this.rep || {}, a = d.ads || {}, fe = a.feuille;
    if (a.branche && a.joursAvecDonnees) {
      var maj = a.majAds ? 'Google Ads à jour le ' + AMX.fmtDate(a.majAds, true) : '';
      return h('div.ana-carte', [h('span', { text: 'Résultats Google Ads du ' + fmtJour(a.premierJour) + ' au ' + fmtJour(a.dernierJour) + ' (' + a.joursAvecDonnees + ' jour' + (a.joursAvecDonnees > 1 ? 's' : '') + ')' + (maj ? ' · ' + maj : '') + (a.devise && a.devise !== 'CAD' ? ' · montants en ' + a.devise : '') + '. ' }),
        fe && fe.url ? h('a', { href: fe.url, target: '_blank', rel: 'noopener', text: 'Ouvrir la feuille' }) : null]);
    }
    var el = h('div.ana-carte.bleu');
    el.appendChild(h('h3', { text: a.branche ? 'En attente des premiers résultats de Google Ads' : 'Brancher les résultats de Google Ads' }));
    el.appendChild(h('p.m', { text: 'Les zones « Santé du flux » et les ventes fonctionnent déjà. Pour les impressions, les clics et la dépense par véhicule, un petit script Google Ads écrit chaque jour les résultats dans une feuille que ScanAutomax relit. Le script ne change rien dans Google Ads.' }));
    var etapes = h('ol');
    if (!a.branche) {
      etapes.appendChild(h('li', [h('span', { text: 'Créer la feuille des résultats (partagée avec le compte Google qui ouvre Google Ads, sans courriel d\'avis). ' }),
        a.peutBrancher ? h('button.btn.petit.primaire', { type: 'button', text: 'Créer la feuille', onclick: function () { self.brancher(); } }) : h('span.m', { text: 'La propriétaire ou un administrateur du groupe la crée.' })]));
    } else {
      etapes.appendChild(h('li', [h('span', { text: 'Feuille créée' + (fe && fe.partages && fe.partages.length ? ', partagée avec ' + fe.partages.map(function (x) { return x.courriel; }).join(', ') : '') + '. ' }),
        fe && fe.url ? h('a', { href: fe.url, target: '_blank', rel: 'noopener', text: 'Ouvrir' }) : null]));
    }
    etapes.appendChild(h('li', { text: 'Dans Google Ads (le compte de la concession) : Outils › Actions groupées › Scripts › « + » › Nouveau script. Collez le script, cliquez « Autoriser », puis « Exécuter ».' }));
    etapes.appendChild(h('li', { text: 'Dans la liste des scripts, Fréquence : « Tous les jours », vers 5 h. ScanAutomax relit la feuille chaque matin (et « Relire les résultats Google Ads » dans Actions).' }));
    el.appendChild(etapes);
    if (a.branche && fe && fe.url) {
      var txt = scriptAds(fe.url, d.nom);
      el.appendChild(h('div.rangee', [h('button.btn.petit.primaire', { type: 'button', text: 'Copier le script', onclick: function () { AMX.copier(txt, 'Script copié : collez-le dans Google Ads › Scripts.'); } }),
        h('button.btn.petit', { type: 'button', text: 'Relire la feuille maintenant', onclick: function () { self.resultats({ op: 'lire' }); } })]));
      el.appendChild(h('details', [h('summary', { text: 'Voir le script' }), h('pre', { text: txt })]));
      if (fe.erreur) el.appendChild(h('p.m', { text: 'Dernière lecture : ' + fe.erreur }));
    }
    return el;
  };
  Vue.prototype.brancher = function () {
    var self = this, d = this.rep || {}, a = d.ads || {};
    if (!a.peutBrancher) { AMX.toast('Réservé à la propriétaire ou à un administrateur du groupe.', 'erreur'); return; }
    var inp = h('input.saisie', { type: 'email', value: a.compteDefaut || '', placeholder: 'adresse du compte Google Ads' });
    var titre = a.branche ? 'Partager la feuille des résultats avec un autre compte' : 'Créer la feuille des résultats Google Ads';
    AMX.modale({ titre: titre, corps: h('div', [
      h('p.mini', { text: 'Le script Google Ads tourne sous le compte Google qui ouvre Google Ads ; ce compte doit pouvoir modifier la feuille. Le partage se fait sans courriel d\'avis.' }),
      h('label.champ', [h('span', 'Compte Google de Google Ads'), inp])]),
      boutons: [{ texte: 'Annuler' }, { texte: a.branche ? 'Partager' : 'Créer la feuille', classe: 'primaire', action: function () { return self.resultats({ op: a.branche ? 'partager' : 'creer', courriel: inp.value.trim() }); } }] });
  };

  /* ---------- 1. santé du flux ---------- */
  Vue.prototype.zoneFlux = function () {
    var self = this, f = this.flux || {}, z = h('section.ana-zone');
    z.appendChild(h('h2', 'Santé du flux'));
    z.appendChild(h('p.q', { text: 'Google montre-t-il les bons véhicules, au bon prix, avec de bonnes photos ?' }));
    if (f.erreurFlux) { z.appendChild(h('div.ana-vide', { text: f.erreurFlux })); return z; }
    if (f.prepare === false) { z.appendChild(h('div.ana-vide', { text: 'Le flux Google n\'est pas encore préparé pour cette concession (BMW Sherbrooke seulement pour l\'instant).' })); return z; }
    if (f.jamaisLu) { z.appendChild(h('div.ana-vide', { text: 'Le site de la concession n\'a pas encore été lu : Marketing › Annonces Google › « Lire le site maintenant ».' })); return z; }
    var L = (f.lignes || []).filter(function (l) { return self.garde(l.genre); });
    var n = { pret: 0, completer: 0, exclu: 0 }, raisons = {}, peuPhotos = 0, vieux = 0, plusVieux = '';
    L.forEach(function (l) {
      n[l.etat] = (n[l.etat] || 0) + 1;
      if (l.etat === 'exclu') (l.problemes || []).slice(0, 1).forEach(function (r) { var k = String(r).replace(/ le \d{4}-\d{2}-\d{2}.*$/, '').replace(/ — .*$/, ''); raisons[k] = (raisons[k] || 0) + 1; });
      if (l.etat !== 'exclu' && (l.nbPhotos || 0) < 10) peuPhotos++;
      if (l.luLe) { if (!plusVieux || l.luLe < plusVieux) plusVieux = l.luLe; if (Date.now() - Date.parse(l.luLe) > 36 * 3600e3) vieux++; }
    });
    var absents = (f.absents || []).filter(function (s) { return self.garde(s.quoi); }).length;
    var feuille = f.feuille || {};
    var feuilleAge = feuille.le ? (Date.now() - Date.parse(feuille.le)) / 3600e3 : null;
    var t = h('div.ana-tuiles', [
      tuile(n.pret || 0, 'Prêts pour Google', 'vert'),
      tuile(n.completer || 0, 'À compléter', n.completer ? 'ambre' : ''),
      tuile(n.exclu || 0, 'Exclus du flux', n.exclu ? 'rouge' : ''),
      tuile(absents, 'En stock, absents du site', absents ? 'ambre' : '', 'Google ne peut pas les annoncer'),
      tuile(peuPhotos, 'Moins de 10 photos', peuPhotos ? 'ambre' : '', 'parmi les véhicules annoncés'),
      tuile(feuille.le ? (feuilleAge < 30 ? 'À jour' : 'En retard') : '—', 'Feuille de Merchant Center', feuille.le ? (feuilleAge < 30 ? 'vert' : 'rouge') : '', feuille.le ? 'écrite ' + AMX.fmtDate(feuille.le, true) + (feuille.n ? ' · ' + feuille.n + ' véhicules' : '') : 'pas encore créée')
    ]);
    z.appendChild(t);
    var lr = Object.keys(raisons).sort(function (x, y) { return raisons[y] - raisons[x]; });
    if (lr.length) z.appendChild(h('div.ana-carte', [h('b', { text: 'Pourquoi des véhicules sont exclus : ' }), h('span', { text: lr.map(function (r) { return r + ' (' + raisons[r] + ')'; }).join(' · ') + '.' }),
      h('span.m', { text: ' Un véhicule vendu chez nous mais encore sur le site est exclu : le prix du flux doit toujours être celui de la fiche (exigé par Google, la LPC et l\'OMVIC).' })]));
    if (vieux) z.appendChild(h('div.ana-carte.ambre', { text: vieux + ' fiche' + (vieux > 1 ? 's' : '') + ' du site lue' + (vieux > 1 ? 's' : '') + ' il y a plus de 36 heures. Depuis avril 2026, Google compare le flux à la page du véhicule et refuse un écart de prix : relisez le site (Annonces Google › Lire le site maintenant).' }));
    return z;
  };
  function tuile(valeur, libelle, classe, note, onclick, noteClasse) {
    return h((onclick ? 'button' : 'div') + '.ana-tuile' + (classe ? '.' + classe : ''), onclick ? { type: 'button', onclick: onclick } : {}, [
      h('b', { text: typeof valeur === 'number' ? nb(valeur) : String(valeur) }), h('span', { text: libelle }), note ? h('em' + (noteClasse ? '.' + noteClasse : ''), { text: note }) : null]);
  }

  /* ---------- 2. exposition par âge ---------- */
  Vue.prototype.donneesAds = function () { var a = (this.rep || {}).ads || {}, p = (this.rep || {}).periode || {}; return !!(a.joursAvecDonnees && a.dernierJour >= p.du); };
  Vue.prototype.zoneExposition = function () {
    var self = this, d = this.rep || {}, f = this.flux || {}, z = h('section.ana-zone'), ads = this.donneesAds();
    z.appendChild(h('h2', 'Exposition de l\'inventaire'));
    z.appendChild(h('p.q', { text: 'L\'argent va-t-il aux bons véhicules ? Part du stock contre part des impressions, des clics et de la dépense, par âge en stock.' }));
    var L = (f.lignes || []).filter(function (l) { return l.etat !== 'exclu' && self.garde(l.genre); });
    if (!L.length) { z.appendChild(h('div.ana-vide', { text: 'Aucun véhicule annoncé ici.' })); return z; }
    var V = d.vehicules || {}, lignes = TRANCHES.map(function (t) { return { nom: t[1], n: 0, s: vide() }; }), inconnu = { nom: 'Âge inconnu', n: 0, s: vide() }, tot = vide();
    L.forEach(function (l) {
      var i = tranche(l.jours), r = i === null ? inconnu : lignes[i], st = V[(l.google && l.google.vin) || ''] || null;
      r.n++; ajoute(r.s, st); ajoute(tot, st);
    });
    if (inconnu.n) lignes.push(inconnu);
    var tb = h('tbody');
    lignes.forEach(function (r) {
      if (!r.n) return;
      tb.appendChild(h('tr', [h('td', { text: r.nom }), h('td.n', { text: nb(r.n) }), h('td', [barre(r.n / L.length, 'stock')]),
        h('td.n', { text: ads ? pct(r.s.impressions, tot.impressions) : '—' }),
        h('td', [ads ? barre(tot.clics ? r.s.clics / tot.clics : 0) : h('span.m', { text: '—' })]), h('td.n', { text: ads ? pct(r.s.clics, tot.clics) : '—' }),
        h('td.n', { text: ads ? pct(r.s.cout, tot.cout) : '—' }), h('td.n.cache-tel', { text: ads && r.s.impressions ? pct(r.s.clics, r.s.impressions, 1) : '—' })]));
    });
    z.appendChild(h('div.ana-defile', [h('table.ana-table', [h('thead', [h('tr', [h('th', 'Âge en stock'), h('th.n', 'Véhicules'), h('th', 'Part du stock'), h('th.n', 'Impressions'), h('th', 'Part des clics'), h('th.n', 'Clics'), h('th.n', 'Dépense'), h('th.n.cache-tel', 'Taux de clics')])]), tb])]));
    if (!ads) {
      var prop = L.filter(function (l) { return l.suggestion; }).length;
      z.appendChild(h('div.ana-carte', { style: { marginTop: '10px' } }, [h('span', { text: 'Pas encore de résultats Google Ads pour la période. ' + (prop ? prop + ' véhicule' + (prop > 1 ? 's sont proposés' : ' est proposé') + ' pour être mis de l\'avant (âge, démos, photos) : ' : '') }),
        prop ? h('a', { href: '#/marketing/google', text: 'Annonces Google' }) : null]));
      return z;
    }
    /* concentration : part des clics qui vont au quart le plus exposé */
    var parClics = L.map(function (l) { var s = V[(l.google && l.google.vin) || '']; return s ? s.clics : 0; }).sort(function (x, y) { return y - x; });
    var quart = Math.max(1, Math.ceil(parClics.length / 4)), haut = parClics.slice(0, quart).reduce(function (x, y) { return x + y; }, 0);
    var sous = L.filter(function (l) { var s = V[(l.google && l.google.vin) || '']; return (l.jours || 0) >= 15 && !(s && s.clics); });
    var sansConv = L.filter(function (l) { var s = V[(l.google && l.google.vin) || '']; return s && s.cout > 0 && !s.conversions; }).sort(function (x, y) { return (V[y.google.vin].cout) - (V[x.google.vin].cout); });
    var t2 = h('div.ana-tuiles', { style: { marginTop: '12px' } }, [
      tuile(tot.clics ? pct(haut, tot.clics) : '—', 'des clics vont au quart le plus exposé', '', quart + ' véhicule' + (quart > 1 ? 's' : '') + ' sur ' + L.length),
      tuile(sous.length, 'Sous-exposés', sous.length ? 'ambre' : '', 'en stock depuis 15 j et +, aucun clic', function () { self.tri = 'age'; self.filtreListe = 'sous'; self.rendre(); self.allerListe(); }),
      tuile(sansConv.length, 'Dépense sans conversion', sansConv.length ? 'rouge' : '', 'pour la période', function () { self.tri = 'cout'; self.filtreListe = 'sansConv'; self.rendre(); self.allerListe(); })
    ]);
    z.appendChild(t2);
    return z;
  };
  function barre(part, classe) { var w = Math.max(0, Math.min(1, part || 0)) * 100; return h('div.ana-barre' + (classe ? '.' + classe : ''), { title: Math.round(w) + ' %' }, [h('i', { style: { width: w + '%' } })]); }

  /* ---------- 3. entonnoir ---------- */
  Vue.prototype.zoneEntonnoir = function () {
    var self = this, d = this.rep || {}, z = h('section.ana-zone'), ads = this.donneesAds();
    z.appendChild(h('h2', 'Entonnoir'));
    z.appendChild(h('p.q', { text: 'Dépense, impressions, clics et conversions de la période, contre la période précédente de même durée.' }));
    if (!ads) { z.appendChild(h('div.ana-vide', { text: 'Les chiffres arriveront avec les premiers résultats de Google Ads.' })); return z; }
    var t, pr = d.precedent || vide(), note = '';
    if (this.genre) {
      /* un genre choisi : la somme des véhicules de ce genre (la dépense sans véhicule n'est pas comptée) */
      var g = this.genres(); t = vide();
      Object.keys(d.vehicules || {}).forEach(function (vin) { if ((g[vin] || '') === self.genre) ajoute(t, d.vehicules[vin]); });
      pr = null; note = 'Somme des véhicules ' + (NOM_GENRE[this.genre] || '').toLowerCase() + 's (sans la dépense qui n\'est rattachée à aucun véhicule).';
    } else t = d.totaux || vide();
    var cpc = t.clics ? t.cout / t.clics : null, cpa = t.conversions ? t.cout / t.conversions : null;
    var v = function (a, b) { return pr ? variation(a, b) : null; }, vc = v(t.cout, pr && pr.cout), vk = v(t.clics, pr && pr.clics), vi = v(t.impressions, pr && pr.impressions), vv = v(t.conversions, pr && pr.conversions);
    z.appendChild(h('div.ana-tuiles', [
      tuile(argent(t.cout), 'Dépense', '', vc ? vc.t : '', null, vc ? (vc.c === 'hausse' ? 'baisse' : 'hausse') : ''),
      tuile(t.impressions, 'Impressions', '', vi ? vi.t : '', null, vi ? vi.c : ''),
      tuile(t.clics, 'Clics', '', vk ? vk.t : '', null, vk ? vk.c : ''),
      tuile(t.impressions ? pct(t.clics, t.impressions, 2) : '—', 'Taux de clics'),
      tuile(cpc !== null ? argent(cpc, 2) : '—', 'Coût par clic'),
      tuile(Math.round(t.conversions * 10) / 10, 'Conversions', '', vv ? vv.t : 'formulaires, appels… selon Google Ads', null, vv ? vv.c : ''),
      tuile(cpa !== null ? argent(cpa) : '—', 'Coût par conversion')
    ]));
    if (note) z.appendChild(h('p.m', { text: note }));
    if (!this.genre && d.sourceTotaux === 'campagnes' && d.totauxVehicules && d.totaux.cout > 0) {
      var hors = Math.max(0, d.totaux.cout - d.totauxVehicules.cout);
      if (hors > 0.5) z.appendChild(h('div.ana-carte.ambre', { text: 'Dépense rattachée à aucun véhicule : ' + argent(hors) + ' (' + pct(hors, d.totaux.cout) + ' de la dépense). Ce sont surtout les annonces de Performance Max hors flux (YouTube, Display, texte). Un fournisseur estime qu\'une petite part seulement des clics de Performance Max vient vraiment des annonces de véhicules : surveillez cette part.' }));
    }
    /* 13 semaines : trois petits graphiques (un seul axe chacun) */
    var S = d.semaines || [];
    z.appendChild(h('div.ana-mini', [graphe(S, 'cout', 'Dépense par semaine', function (x) { return argent(x); }), graphe(S, 'clics', 'Clics par semaine', nb), graphe(S, 'conversions', 'Conversions par semaine', function (x) { return String(Math.round(x * 10) / 10); })]));
    /* réseaux et campagnes */
    var tab = function (titre, liste, nom) {
      if (!liste || !liste.length) return null;
      liste = liste.slice().sort(function (a, b) { return b.cout - a.cout; });
      return h('div', [h('h4', { style: { margin: '10px 0 6px', fontSize: '13px' }, text: titre }), h('div.ana-defile', [h('table.ana-table', [h('thead', [h('tr', [h('th', titre === 'Par réseau' ? 'Réseau' : 'Campagne'), h('th.n', 'Impr.'), h('th.n', 'Clics'), h('th.n', 'Dépense'), h('th.n', 'Conv.')])]),
        h('tbody', liste.map(function (r) { return h('tr', [h('td', { text: nom(r.nom) }), h('td.n', { text: nb(r.impressions) }), h('td.n', { text: nb(r.clics) }), h('td.n', { text: argent(r.cout) }), h('td.n', { text: String(Math.round(r.conversions * 10) / 10) })]); }))])])]);
    };
    if (!this.genre) z.appendChild(h('div.ana-deux', [tab('Par réseau', d.reseaux, function (n) { return RESEAUX[n] || n; }), tab('Par campagne', d.campagnes, function (n) { return n; })]));
    return z;
  };
  function graphe(S, cle, titre, fmt) {
    var W = 300, H = 120, g = 18, l = 6, max = 0;
    S.forEach(function (s) { max = Math.max(max, s[cle] || 0); });
    var bw = (W - l * 2) / Math.max(1, S.length), ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', titre);
    var base = document.createElementNS(ns, 'line'); base.setAttribute('x1', l); base.setAttribute('x2', W - l); base.setAttribute('y1', H - g); base.setAttribute('y2', H - g); svg.appendChild(base);
    S.forEach(function (s, i) {
      var v = s[cle] || 0, hh = max ? (H - g - 8) * v / max : 0, x = l + i * bw + 2, y = H - g - hh;
      var r = document.createElementNS(ns, 'rect'); r.setAttribute('class', 'b'); r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('width', Math.max(2, bw - 4)); r.setAttribute('height', Math.max(v ? 2 : 0, hh)); r.setAttribute('rx', 2);
      var tt = document.createElementNS(ns, 'title'); tt.textContent = 'Semaine du ' + fmtJour(s.du) + ' : ' + fmt(v); r.appendChild(tt); svg.appendChild(r);
      if (i === 0 || i === S.length - 1 || i === Math.floor(S.length / 2)) { var tx = document.createElementNS(ns, 'text'); tx.setAttribute('x', x); tx.setAttribute('y', H - 4); tx.textContent = fmtJour(s.du); svg.appendChild(tx); }
    });
    var dern = S.length ? S[S.length - 1][cle] || 0 : 0;
    return h('div.graph', [h('h4', { text: titre + ' · dernière : ' + fmt(dern) }), svg]);
  }

  /* ---------- 4. ventes et profit ---------- */
  Vue.prototype.zoneVentes = function () {
    var self = this, d = this.rep || {}, z = h('section.ana-zone'), ads = this.donneesAds();
    z.appendChild(h('h2', 'Ventes et profit'));
    z.appendChild(h('p.q', { text: 'Chaque vente de la période au Livre des ventes, avec ce que son NIV a reçu en publicité avant la vente. « NIV influencé » : au moins un clic et un coût avant la date de vente — une règle flatteuse : la vente se serait peut-être faite sans l\'annonce.' }));
    if (d.ventesErreur) { z.appendChild(h('div.ana-vide', { text: d.ventesErreur })); return z; }
    var genre = function (v) { return v.type === 'usage' ? 'occasion' : (/demo|courtoisie/i.test(v.categorie || '') ? 'demo' : 'neuf'); };
    var L = (d.ventes || []).filter(function (v) { return self.garde(genre(v)); });
    if (!L.length) { z.appendChild(h('div.ana-vide', { text: 'Aucune vente dans la période' + (this.genre ? ' pour ce genre' : '') + '.' })); return z; }
    var inf = L.filter(function (v) { return v.influence; }), sansNiv = L.filter(function (v) { return !v.vin; }), sansClic = L.filter(function (v) { return v.vin && !v.influence; });
    var jA = mediane(inf.map(function (v) { return v.joursVente; })), jN = mediane(sansClic.map(function (v) { return v.joursVente; })), jT = mediane(L.map(function (v) { return v.joursVente; }));
    var depense = 0;
    if (ads) { if (this.genre) { var g = this.genres(); Object.keys(d.vehicules || {}).forEach(function (vin) { if ((g[vin] || '') === self.genre) depense += d.vehicules[vin].cout || 0; }); } else depense = (d.totaux || {}).cout || 0; }
    var profitInf = 0, nProfit = 0; inf.forEach(function (v) { if (typeof v.profit === 'number') { profitInf += v.profit; nProfit++; } });
    var tu = [tuile(L.length, 'Ventes de la période', '', sansNiv.length ? sansNiv.length + ' sans NIV au livre' : '')];
    if (ads) {
      tu.push(tuile(inf.length, 'NIV influencés', inf.length ? 'vert' : '', pct(inf.length, L.length - sansNiv.length) + ' des ventes avec NIV'));
      tu.push(tuile(sansClic.length, 'Ventes sans aucun clic', '', 'se sont vendues sans annonce cliquée'));
      tu.push(tuile(inf.length ? argent(depense / inf.length) : '—', 'Dépense par vente influencée', '', 'dépense de la période ÷ ventes influencées'));
      tu.push(tuile(jA !== null ? Math.round(jA) + ' j' : '—', 'Jours à la vente — annoncés', '', jN !== null ? 'sans clic : ' + Math.round(jN) + ' j (médianes)' : 'médiane'));
      if (d.montants && depense > 0 && nProfit) tu.push(tuile((Math.round(profitInf / depense * 10) / 10).toLocaleString('fr-CA') + ' ×', 'Profit ÷ dépense', profitInf / depense >= 1 ? 'vert' : 'rouge', 'profit brut des ventes influencées (' + argent(profitInf) + ')'));
    } else {
      tu.push(tuile(jT !== null ? Math.round(jT) + ' j' : '—', 'Jours à la vente (médiane)', '', 'base de comparaison avant les annonces'));
    }
    z.appendChild(h('div.ana-tuiles', tu));
    var tb = h('tbody');
    L.slice(0, 300).forEach(function (v) {
      tb.appendChild(h('tr', [h('td.n', { text: fmtJour(v.dateVente) }),
        h('td', [h('div.ana-vh', [h('div', [h('b', { text: v.vehicule || '—' }), h('span', { text: [v.stock ? '# ' + v.stock : '', v.vin ? v.vin.slice(-8) : 'sans NIV', NOM_GENRE[genre(v)]].filter(Boolean).join(' · ') })])])]),
        h('td.n', { text: v.joursVente !== undefined && v.joursVente !== null ? v.joursVente + ' j' : '—' }),
        h('td.n', { text: v.pub && v.pub.clics ? nb(v.pub.clics) + ' clic' + (v.pub.clics > 1 ? 's' : '') + ' · ' + argent(v.pub.cout) : (ads ? 'aucun clic' : '—') }),
        h('td', [ads ? h('span.ana-pastille.' + (v.influence ? 'vert' : 'gris'), { text: v.influence ? 'Influencé' : (v.vin ? 'Sans clic' : 'Sans NIV') }) : null]),
        d.montants ? h('td.n', { text: typeof v.profit === 'number' ? argent(v.profit) + (v.profitSource === 'estime' ? ' (est.)' : '') : '—' }) : null]));
    });
    z.appendChild(h('div.ana-defile', [h('table.ana-table', [h('thead', [h('tr', [h('th.n', 'Vendue le'), h('th', 'Véhicule'), h('th.n', 'Jours en stock'), h('th.n', 'Publicité avant la vente'), h('th', ''), d.montants ? h('th.n', 'Profit brut') : null])]), tb])]));
    if (L.length > 300) z.appendChild(h('p.m', { text: 'Les 300 plus récentes sur ' + L.length + '.' }));
    return z;
  };

  /* ---------- 5. par véhicule ---------- */
  Vue.prototype.allerListe = function () { var el = document.getElementById('ana-liste'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  Vue.prototype.lignesVehicules = function () {
    var self = this, d = this.rep || {}, f = this.flux || {}, V = d.vehicules || {}, vie = d.vie || {}, vus = {}, out = [];
    var vendues = {}; (d.ventes || []).forEach(function (v) { if (v.vin) vendues[v.vin] = v; });
    (f.lignes || []).forEach(function (l) {
      var vin = l.google && l.google.vin; if (!vin || vus[vin]) return; vus[vin] = 1;
      out.push({ vin: vin, genre: l.genre, vehicule: l.vehicule, stock: l.stock, photo: l.photo, jours: l.jours, prix: l.prix, nbPhotos: l.nbPhotos, etat: l.etat, vedette: l.vedette, url: l.url, s: V[vin] || vide(), vie: vie[vin] || null, vente: vendues[vin] || null, surSite: true });
    });
    var g = this.genres();
    Object.keys(V).forEach(function (vin) {
      if (vus[vin]) return; var ve = vendues[vin];
      out.push({ vin: vin, genre: g[vin] || '', vehicule: ve ? ve.vehicule : '', stock: ve ? ve.stock : '', jours: ve ? ve.joursVente : null, s: V[vin], vie: vie[vin] || null, vente: ve || null, surSite: false });
    });
    return out.filter(function (x) { return self.garde(x.genre); });
  };
  Vue.prototype.zoneVehicules = function () {
    var self = this, z = h('section.ana-zone#ana-liste'), ads = this.donneesAds();
    z.appendChild(h('h2', 'Par véhicule'));
    var L = this.lignesVehicules();
    var filtres = { '': 'Tous', sous: 'Sous-exposés', sansConv: 'Dépense sans conversion', vedette: 'Mis de l\'avant' };
    var fl = this.filtreListe || '';
    if (fl === 'sous') L = L.filter(function (x) { return x.surSite && x.etat !== 'exclu' && (x.jours || 0) >= 15 && !x.s.clics; });
    if (fl === 'sansConv') L = L.filter(function (x) { return x.s.cout > 0 && !x.s.conversions; });
    if (fl === 'vedette') L = L.filter(function (x) { return x.vedette; });
    var cle = { cout: function (x) { return x.s.cout; }, clics: function (x) { return x.s.clics; }, impressions: function (x) { return x.s.impressions; }, age: function (x) { return x.jours || 0; }, prix: function (x) { return x.prix || 0; } }[this.tri] || function (x) { return x.s.cout; };
    L.sort(function (a, b) { return cle(b) - cle(a); });
    var selF = h('select.saisie', { onchange: function () { self.filtreListe = selF.value; self.rendre(); self.allerListe(); } }, Object.keys(filtres).map(function (k) { return h('option', { value: k, text: filtres[k], selected: k === fl }); }));
    var selT = h('select.saisie', { onchange: function () { self.tri = selT.value; self.rendre(); self.allerListe(); } }, [['cout', 'Trier par dépense'], ['clics', 'Trier par clics'], ['impressions', 'Trier par impressions'], ['age', 'Trier par âge en stock'], ['prix', 'Trier par prix']].map(function (x) { return h('option', { value: x[0], text: x[1], selected: x[0] === self.tri }); }));
    z.appendChild(h('div.ana-filtres', [selF, selT, h('span.m', { text: L.length + ' véhicule' + (L.length > 1 ? 's' : '') })]));
    if (!L.length) { z.appendChild(h('div.ana-vide', { text: 'Aucun véhicule ici.' })); return z; }
    var tb = h('tbody');
    L.slice(0, 250).forEach(function (x) {
      var s = x.s, past = [];
      if (x.vedette) past.push(['violet', 'Mis de l\'avant']);
      if (x.etat === 'exclu') past.push(['rouge', 'Exclu du flux']);
      if (!x.surSite) past.push(['gris', x.vente ? 'Vendu le ' + fmtJour(x.vente.dateVente) : 'Plus sur le site']);
      else if (x.vente) past.push(['vert', 'Vendu le ' + fmtJour(x.vente.dateVente)]);
      if (ads && x.surSite && x.etat !== 'exclu' && (x.jours || 0) >= 15 && !s.clics) past.push(['ambre', 'Sous-exposé']);
      if (s.cout > 0 && !s.conversions) past.push(['ambre', 'Sans conversion']);
      if (x.surSite && (x.nbPhotos || 0) < 10 && x.etat !== 'exclu') past.push(['gris', (x.nbPhotos || 0) + ' photos']);
      var img = x.photo ? h('img', { src: x.photo, alt: '', loading: 'lazy' }) : h('div.sans', { text: 'photo' });
      tb.appendChild(h('tr', [
        h('td', [h('div.ana-vh', [img, h('div', [h('b', { text: x.vehicule || x.vin }), h('span', { text: [x.stock ? '# ' + x.stock : '', x.vin.slice(-8), NOM_GENRE[x.genre] || ''].filter(Boolean).join(' · ') })])])]),
        h('td.n', { text: x.jours !== null && x.jours !== undefined ? x.jours + ' j' : '—' }),
        h('td.n.cache-tel', { text: x.prix ? argent(x.prix) : '—' }),
        h('td.n', { text: ads ? nb(s.impressions) : '—' }), h('td.n', { text: ads ? nb(s.clics) : '—' }),
        h('td.n.cache-tel', { text: ads && s.impressions ? pct(s.clics, s.impressions, 1) : '—' }),
        h('td.n', { text: ads ? argent(s.cout, s.cout < 100 ? 2 : 0) : '—' }), h('td.n.cache-tel', { text: ads ? String(Math.round(s.conversions * 10) / 10) : '—' }),
        h('td', past.map(function (p) { return h('span.ana-pastille.' + p[0], { text: p[1] }); }))]));
    });
    z.appendChild(h('div.ana-defile', [h('table.ana-table', [h('thead', [h('tr', [h('th', 'Véhicule'), h('th.n', 'Âge'), h('th.n.cache-tel', 'Prix'), h('th.n', 'Impr.'), h('th.n', 'Clics'), h('th.n.cache-tel', 'Taux'), h('th.n', 'Dépense'), h('th.n.cache-tel', 'Conv.'), h('th', '')])]), tb])]));
    if (L.length > 250) z.appendChild(h('p.m', { text: 'Les 250 premiers sur ' + L.length + ' (export Excel : tous).' }));
    return z;
  };

  Vue.prototype.exporter = function () {
    if (typeof XLSX === 'undefined') { AMX.toast('Excel n\'est pas chargé sur cette page.', 'erreur'); return; }
    var d = this.rep || {}, p = d.periode || {};
    var veh = this.lignesVehicules().map(function (x) { return { 'NIV': x.vin, '# stock': x.stock || '', 'Véhicule': x.vehicule || '', 'Genre': NOM_GENRE[x.genre] || '', 'Âge (jours)': x.jours === null || x.jours === undefined ? '' : x.jours, 'Prix': x.prix || '', 'Photos': x.nbPhotos || '', 'Impressions': x.s.impressions, 'Clics': x.s.clics, 'Dépense': Math.round(x.s.cout * 100) / 100, 'Conversions': x.s.conversions, 'Sur le site': x.surSite ? 'oui' : 'non', 'Vendu le': x.vente ? x.vente.dateVente : '' }; });
    var ven = (d.ventes || []).map(function (v) { var o = { 'Vendue le': v.dateVente, 'NIV': v.vin, '# stock': v.stock, 'Véhicule': v.vehicule, 'Type': v.type === 'usage' ? 'Occasion' : 'Neuf', 'Jours en stock': v.joursVente === undefined ? '' : v.joursVente, 'Clics avant la vente': v.pub ? v.pub.clics : 0, 'Dépense avant la vente': v.pub ? v.pub.cout : 0, 'Influencé': v.influence ? 'oui' : 'non' }; if (d.montants) o['Profit brut'] = typeof v.profit === 'number' ? v.profit : ''; return o; });
    var sem = (d.semaines || []).map(function (s) { return { 'Semaine du': s.du, 'Au': s.au, 'Impressions': s.impressions, 'Clics': s.clics, 'Dépense': s.cout, 'Conversions': s.conversions }; });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(veh.length ? veh : [{ '': 'aucun véhicule' }]), 'Véhicules');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ven.length ? ven : [{ '': 'aucune vente' }]), 'Ventes');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sem), 'Semaines');
    XLSX.writeFile(wb, 'analyse-annonces-' + String(d.compagnie || 'BMW').toLowerCase() + '-' + p.du + '-' + p.au + '.xlsx');
  };

  AMX.annoncesAnalyse = { charger: charger, peutVoir: peutVoir, scriptAds: scriptAds, vider: function () { cache = {}; } };
  AMX.section('annoncesanalyse', {
    titre: 'Analyse des annonces', icone: 'resultat', ordre: 37,
    visible: function () { return peutVoir(); },
    monter: function (conteneur, ctx) { return new Vue(conteneur, ctx); }
  });
})();
