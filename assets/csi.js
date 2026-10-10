/* =========================================================================
   Section « CSI » — satisfaction client des constructeurs (10 octobre 2026)

   Maxime : « tu vas voir si tu peux faire un onglet CSI aussi » (BoostCX,
   hacc.boostcx.com — le programme CSI de Hyundai Canada).

   Données : GET ?csi=1 (Constructeur.gs) — ce que le signet « Automax ←
   Hyundai » a lu sur BoostCX : les scores NPS ventes / service / combiné
   (mois en cours, 3 mois, 12 mois ; district, zone, national, rangs, taux de
   réponse, promoteurs / passifs / détracteurs, KPI de base) et la liste des
   sondages ventes + service des 12 derniers mois (client, conseiller,
   directeur F&I ou technicien, NPS, commentaire, alerte). La concession suit
   le choix du site. Le signet se trouve dans Inventaire › Neufs › « Portail
   Hyundai » (même favori pour le portail des ventes et pour BoostCX).

   Toutes les données serveur sont rendues via textContent (jamais innerHTML).
   ========================================================================= */
(function () {
  'use strict';
  var h = AMX.h, I = AMX.icones;
  AMX.icones.csi = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.4l-5.3 2.8 1.1-5.9L3.5 9.2l5.9-.8z"/></svg>';

  var PERIODES = [['MTD', 'Mois en cours'], ['3M', '3 mois'], ['12M', '12 mois']];
  var TYPES = [['ventes', 'Ventes'], ['service', 'Service']];
  var FENETRES = [[30, '30 jours'], [90, '3 mois'], [365, '12 mois']];
  var BOOSTCX = 'https://hacc.boostcx.com/bcx/dashboard/combined';

  function nomCie(c) { return AMX.COMPAGNIES_TOUTES[c] || c || ''; }
  function pct(x, dec) { return x === null || x === undefined || isNaN(x) ? '—' : Number(x).toLocaleString('fr-CA', { minimumFractionDigits: dec === undefined ? 1 : dec, maximumFractionDigits: dec === undefined ? 1 : dec }) + ' %'; }
  function nb(x, dec) { return x === null || x === undefined || isNaN(x) ? '—' : Number(x).toLocaleString('fr-CA', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 }); }
  function signe(x, dec) { if (x === null || x === undefined || isNaN(x)) return '—'; var n = Number(x); return (n > 0 ? '+' : (n < 0 ? '−' : '')) + Math.abs(n).toLocaleString('fr-CA', { minimumFractionDigits: dec === undefined ? 1 : dec, maximumFractionDigits: dec === undefined ? 1 : dec }); }
  function isoJoursAvant(n) { var d = new Date(Date.now() - n * 86400000); return d.toISOString().slice(0, 10); }
  function classeNps(n) { if (n === null || n === undefined || isNaN(n)) return 'gris'; return n >= 9 ? 'vert' : (n >= 7 ? 'ambre' : 'rouge'); }
  function nomCourt(s) { return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase().replace(/(^|[\s-])([a-zà-ÿ])/g, function (m, a, b) { return a + b.toUpperCase(); }); }
  function alerteOuverte(s) { var a = String(s.alerte || '').trim(); return !!a && a !== '-' && !/resolved|closed|fermé|résolu/i.test(a); }

  function injecterCss() {
    if (document.getElementById('css-csi')) return;
    var s = document.createElement('style'); s.id = 'css-csi';
    s.textContent = [
      '.csi-page .carte { margin-bottom: 14px; }',
      '.csi-page h1 .csi-h1-sous { display: block; font-size: 12.5px; font-weight: 400; color: var(--encre-3); letter-spacing: 0; margin-top: 2px; }',
      '.csi-page .csi-neg { color: var(--rouge); }',
      '.csi-page .csi-sous-titre { font-size: 13px; font-weight: 600; margin: 0 0 6px; }',
      '.csi-page .carte-entete h2 { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; min-width: 0; } .csi-page .carte-entete h2 .sous { font-weight: 400; font-size: 12px; color: var(--encre-3); }',
      '.csi-page .carte-entete { flex-wrap: wrap; } .csi-page .csi-actions { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }',
      '.csi-scores { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 10px; margin-bottom: 14px; }',
      '.csi-score { background: var(--carte); border: 1px solid var(--ligne); border-radius: var(--rayon); box-shadow: var(--ombre); padding: 12px 14px; position: relative; overflow: hidden; }',
      '.csi-score::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--ligne-forte); } .csi-score.vert::before { background: var(--vert); } .csi-score.rouge::before { background: var(--rouge); } .csi-score.gris::before { background: var(--ligne-forte); }',
      '.csi-score .nom { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--encre-3); }',
      '.csi-score .val { font-size: 30px; font-weight: 700; line-height: 1.1; margin: 4px 0 2px; font-variant-numeric: tabular-nums; } .csi-score .val small { font-size: 13px; font-weight: 600; margin-left: 8px; } .csi-score.vert .val small { color: var(--vert); } .csi-score.rouge .val small { color: var(--rouge); }',
      '.csi-score .comp { display: flex; gap: 10px; font-size: 12px; color: var(--encre-2); margin-top: 6px; flex-wrap: wrap; } .csi-score .comp b { display: block; font-size: 14px; } .csi-score .comp span { min-width: 54px; }',
      '.csi-score .rangs { font-size: 11.5px; color: var(--encre-3); margin-top: 6px; line-height: 1.5; }',
      '.csi-repartition { display: flex; height: 12px; border-radius: 6px; overflow: hidden; background: var(--gris-bg); margin-top: 8px; } .csi-repartition i { display: block; height: 100%; } .csi-repartition .vert { background: var(--vert); } .csi-repartition .ambre { background: var(--ambre); } .csi-repartition .rouge { background: var(--rouge); }',
      '.csi-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; } .csi-kpis h3 { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--encre-3); margin: 0 0 8px; }',
      '.csi-kpi { display: grid; grid-template-columns: 1fr 120px 64px; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px solid var(--ligne); font-size: 12.5px; } .csi-kpi:last-child { border-bottom: 0; }',
      '.csi-kpi .csi-jauge { height: 10px; background: var(--gris-bg); border-radius: 5px; overflow: hidden; position: relative; } .csi-kpi .csi-jauge i { display: block; height: 100%; background: var(--vert); } .csi-kpi .csi-jauge i.sous { background: var(--rouge); } .csi-kpi .csi-jauge b { position: absolute; top: -2px; width: 2px; height: 14px; background: var(--encre); }',
      '.csi-kpi .num { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; } .csi-kpi .num small { display: block; font-weight: 400; color: var(--encre-3); font-size: 11px; }',
      '.csi-page .tableau td.num, .csi-page .tableau th.num { text-align: right; font-variant-numeric: tabular-nums; } .csi-page .csi-defilant { overflow-x: auto; } .csi-page .tableau td.date, .csi-page .tableau .mini { white-space: nowrap; }',
      '.csi-page .badge.nps { min-width: 28px; justify-content: center; font-weight: 700; }',
      '.csi-commentaire { font-size: 12.5px; line-height: 1.45; color: var(--encre-2); max-width: 520px; }',
      '.csi-page .vide { border: none; background: transparent; padding: 28px 16px; }',
      '@media (max-width: 760px) { .csi-kpi { grid-template-columns: 1fr 80px 56px; } }'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ------------------------------ Calculs ------------------------------ */
  // Sondages → par personne : n, moyenne, promoteurs (9-10), passifs (7-8), détracteurs (0-6), alertes.
  function parPersonne(sondages, champ) {
    var par = {};
    sondages.forEach(function (s) {
      var k = nomCourt(s[champ]) || '(non indiqué)';
      var p = par[k] || (par[k] = { nom: k, n: 0, somme: 0, prom: 0, pass: 0, detr: 0, alertes: 0, commentaires: 0 });
      if (s.nps !== null && s.nps !== undefined && !isNaN(s.nps)) { p.n++; p.somme += s.nps; if (s.nps >= 9) p.prom++; else if (s.nps >= 7) p.pass++; else p.detr++; }
      if (alerteOuverte(s)) p.alertes++;
      if (s.commentaire) p.commentaires++;
    });
    return Object.keys(par).map(function (k) { var p = par[k]; p.moyenne = p.n ? p.somme / p.n : null; p.pctProm = p.n ? 100 * p.prom / p.n : null; p.pctDetr = p.n ? 100 * p.detr / p.n : null; p.nps = p.n ? p.pctProm - p.pctDetr : null; return p; }).sort(function (a, b) { return b.n - a.n || (b.pctProm || 0) - (a.pctProm || 0); });
  }
  function resume(sondages) { return parPersonne(sondages.map(function (s) { return Object.assign({}, s, { tous: 'tous' }); }), 'tous')[0] || { n: 0, moyenne: null, pctProm: null, pctDetr: null, nps: null, alertes: 0, prom: 0, pass: 0, detr: 0 }; }

  /* ------------------------------ Section ------------------------------ */
  AMX.section('csi', {
    titre: 'CSI', icone: 'csi', ordre: 47,
    visible: function () { return AMX.perm('voirResultats') || AMX.estAdmin(); },
    monter: function (conteneur, ctx) { return new Csi(conteneur, ctx); }
  });

  function Csi(conteneur, ctx) {
    injecterCss();
    var self = this;
    this.conteneur = conteneur; this.generation = 0; this.detruit = false;
    this.donnees = null; this.erreur = ''; this.enChargement = false;
    this.compagnie = AMX.compagnieChoisie('resultats') || '';
    this.periode = AMX.memo.lire('csi_periode', 'MTD'); if (!PERIODES.some(function (p) { return p[0] === self.periode; })) this.periode = 'MTD';
    this.type = AMX.memo.lire('csi_type', 'ventes'); if (!TYPES.some(function (t) { return t[0] === self.type; })) this.type = 'ventes';
    this.fenetre = parseInt(AMX.memo.lire('csi_fenetre', '90'), 10) || 90;
    this.recherche = '';
    this.construire();
    this.charger(false);
    this.surProfil = function () { if (!self.detruit) { self.compagnie = AMX.compagnieChoisie('resultats') || ''; self.rendre(); } };
    document.addEventListener('amx:compagnie', this.surProfil);
  }
  Csi.prototype.demonter = function () { this.detruit = true; this.generation++; document.removeEventListener('amx:compagnie', this.surProfil); };

  Csi.prototype.construire = function () {
    var self = this;
    this.elEtat = h('p', { text: 'Chargement du CSI…' });
    this.btnRafraichir = h('button.btn', { type: 'button', html: I.rafraichir + '<span>Rafraîchir</span>', onclick: function () { self.charger(true); } });
    this.btnBoost = h('a.btn', { href: BOOSTCX, target: '_blank', rel: 'noopener', html: I.externe + '<span>BoostCX</span>', title: 'Ouvre BoostCX : cliquez-y le favori « Automax ← Hyundai » (Inventaire › Neufs › Portail Hyundai) pour mettre le CSI à jour.' });
    this.btnBoost.addEventListener('click', function () { AMX.toast('Sur BoostCX, cliquez le favori « Automax ← Hyundai » (le même que pour le portail des ventes), puis revenez ici : Rafraîchir.', 'attention', 8000); });
    this.btnExport = h('button.btn', { type: 'button', html: I.telecharger + '<span>Exporter Excel</span>', onclick: function () { self.exporter(); } });
    this.elChoix = h('div');
    this.elScores = h('div.csi-scores');
    this.elKpis = h('div.carte');
    this.elPersonnes = h('div.carte');
    this.elSondages = h('div.carte');
    this.elVide = h('div');
    this.el = h('div.page.etroite.csi-page', [
      h('div.entete-page', [h('div', { style: { minWidth: 0 } }, [h('h1', ['CSI', h('span.csi-h1-sous', { text: 'Satisfaction client déclarée au constructeur (BoostCX) — NPS ventes, service, combiné' })]), this.elEtat]), h('div.actions', [this.btnBoost, this.btnRafraichir, this.btnExport])]),
      this.elChoix, this.elVide, this.elScores, this.elKpis, this.elPersonnes, this.elSondages
    ]);
    this.conteneur.appendChild(this.el);
  };

  Csi.prototype.charger = function (manuel) {
    var self = this, gen = ++this.generation;
    this.enChargement = true;
    if (manuel) this.btnRafraichir.classList.add('occupe');
    if (!this.donnees) { AMX.vider(this.elScores); this.elScores.appendChild(AMX.chargeur('CSI')); }
    return AMX.get({ csi: 1 }).then(function (d) {
      if (self.detruit || gen !== self.generation) return;
      self.enChargement = false; self.btnRafraichir.classList.remove('occupe');
      if (!d || d.refuse) throw new Error((d && (d.erreur || d.message)) || 'Accès refusé.');
      if (d.ok === false) throw new Error(d.erreur || 'Réponse inattendue du serveur');
      self.donnees = d; self.erreur = '';
      self.rendre();
      if (manuel) AMX.toast('CSI mis à jour — ' + self.sondagesVisibles().length + ' sondage' + (self.sondagesVisibles().length > 1 ? 's' : ''), 'ok');
    }, function (e) {
      if (self.detruit || gen !== self.generation) return;
      self.enChargement = false; self.btnRafraichir.classList.remove('occupe');
      self.erreur = AMX.erreurTexte(e); self.rendre();
      AMX.toast('Impossible de charger le CSI — ' + self.erreur, 'erreur');
    });
  };

  Csi.prototype.scoresVisibles = function () { var c = this.compagnie; return ((this.donnees || {}).scores || []).filter(function (s) { return !c || s.compagnie === c; }); };
  Csi.prototype.sondagesVisibles = function () { var c = this.compagnie; return ((this.donnees || {}).sondages || []).filter(function (s) { return !c || s.compagnie === c; }); };
  Csi.prototype.compagniesLues = function () { var e = (this.donnees || {}).etats || {}; return Object.keys(e).filter(function (k) { return e[k] && e[k].csiLe; }); };

  Csi.prototype.rendre = function () {
    var self = this;
    AMX.vider(this.elChoix); AMX.vider(this.elVide);
    var d = this.donnees;
    var choix = AMX.choixCompagnie({ domaine: 'resultats', valeur: this.compagnie, compte: function (c) { return ((d && d.sondages) || []).filter(function (s) { return !c || s.compagnie === c; }).length; }, onchange: function (c) { self.compagnie = c; self.rendre(); } });
    if (choix) this.elChoix.appendChild(h('div.carte', [h('div.carte-corps', [h('div.etiquette', { style: { marginBottom: '6px' }, text: 'Concession' }), choix])]));
    if (this.erreur && !d) { this.elEtat.textContent = 'Serveur injoignable.'; this.elVide.appendChild(h('div.vide', [h('div', { html: I.alerte }), h('h3', 'Serveur injoignable'), h('div', { text: this.erreur })])); [this.elScores, this.elKpis, this.elPersonnes, this.elSondages].forEach(function (el) { AMX.vider(el); el.classList.add('cache'); }); return; }
    if (!d) return;
    var lues = this.compagniesLues().filter(function (c) { return !self.compagnie || c === self.compagnie; });
    if (!lues.length && !this.sondagesVisibles().length) {
      this.elEtat.textContent = 'Aucune lecture du CSI pour l\'instant' + (this.compagnie ? ' — ' + nomCie(this.compagnie) : '') + '.';
      this.elVide.appendChild(h('div.vide', [h('div', { html: I.filtre }), h('h3', 'Pas encore de données CSI'), h('div', { text: 'Ouvrez BoostCX (bouton en haut), connecté, et cliquez-y le favori « Automax ← Hyundai » — il se trouve dans Inventaire › Neufs › Portail Hyundai. Les scores et les sondages des 12 derniers mois arrivent ici en une minute.' })]));
      [this.elScores, this.elKpis, this.elPersonnes, this.elSondages].forEach(function (el) { AMX.vider(el); el.classList.add('cache'); });
      return;
    }
    var etats = d.etats || {};
    this.elEtat.textContent = lues.map(function (c) { return nomCie(c) + ' — lu le ' + AMX.fmtDate(etats[c].csiLe, true) + (etats[c].csiPar ? ' par ' + String(etats[c].csiPar).split('@')[0] : ''); }).join(' · ') + ' · ' + this.sondagesVisibles().length + ' sondages sur 12 mois';
    [this.elScores, this.elKpis, this.elPersonnes, this.elSondages].forEach(function (el) { el.classList.remove('cache'); });
    this.rendreScores();
    this.rendreKpis();
    this.rendrePersonnes();
    this.rendreSondages();
  };

  Csi.prototype.scoreDe = function (type, periode) {
    var liste = this.scoresVisibles().filter(function (s) { return s.type === type && s.periode === periode; });
    if (liste.length <= 1) return liste[0] || null;
    // Plusieurs concessions : on garde la plus récente par concession, puis la moyenne pondérée par le nombre de sondages.
    var tot = 0, poids = 0; liste.forEach(function (s) { if (s.score !== null) { var w = s.sondages || 1; tot += s.score * w; poids += w; } });
    return Object.assign({}, liste[0], { score: poids ? tot / poids : null, sondages: liste.reduce(function (a, s) { return a + (s.sondages || 0); }, 0), rangDistrict: '', rangZone: '', rangNational: '', multi: liste.length });
  };

  Csi.prototype.rendreScores = function () {
    var self = this;
    AMX.vider(this.elScores);
    var seg = h('div.segment', { role: 'group', 'aria-label': 'Période' }, PERIODES.map(function (p) {
      return h('button' + (p[0] === self.periode ? '.actif' : ''), { type: 'button', text: p[1], onclick: function () { if (p[0] === self.periode) return; self.periode = p[0]; AMX.memo.ecrire('csi_periode', p[0]); self.rendreScores(); self.rendreKpis(); } });
    }));
    this.elScores.appendChild(h('div', { style: { gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' } }, [h('span.doux.petit', { text: 'Scores BoostCX — ' + (PERIODES.filter(function (p) { return p[0] === self.periode; })[0] || [])[1].toLowerCase() }), seg]));
    var cartes = [['ventes', 'NPS ventes'], ['service', 'NPS service'], ['combine', 'NPS combiné']];
    cartes.forEach(function (c) {
      var s = self.scoreDe(c[0], self.periode);
      if (!s) { self.elScores.appendChild(h('div.csi-score.gris', [h('div.nom', { text: c[1] }), h('div.val', { text: '—' }), h('div.rangs', { text: 'pas lu pour cette période' })])); return; }
      var ecart = s.cibleEcart, cls = ecart === null || ecart === undefined ? 'gris' : (ecart >= 0 ? 'vert' : 'rouge');
      var tot = (s.promoteurs || 0) + (s.passifs || 0) + (s.detracteurs || 0);
      self.elScores.appendChild(h('div.csi-score.' + cls, [
        h('div.nom', { text: c[1] + (s.multi ? ' · ' + s.multi + ' concessions' : '') }),
        h('div.val', [nb(s.score, 1), ecart !== null && ecart !== undefined ? h('small', { text: signe(ecart) + ' pts vs cible', title: 'Écart par rapport à la cible du constructeur' }) : null]),
        h('div.comp', [h('span', [h('b', { text: nb(s.district, 1) }), 'District']), h('span', [h('b', { text: nb(s.zone, 1) }), 'Zone']), h('span', [h('b', { text: nb(s.national, 1) }), 'National'])]),
        h('div.rangs', { text: [s.rangDistrict ? 'District ' + s.rangDistrict : '', s.rangZone ? 'zone ' + s.rangZone : '', s.rangNational ? 'national ' + s.rangNational : '', s.changement !== null && s.changement !== undefined ? 'variation ' + signe(s.changement) : '', s.sondages !== null && s.sondages !== undefined ? nb(s.sondages) + ' sondage' + (s.sondages > 1 ? 's' : '') : '', s.tauxReponse !== null && s.tauxReponse !== undefined ? 'réponse ' + pct(s.tauxReponse) : ''].filter(Boolean).join(' · ') }),
        tot ? h('div.csi-repartition', { title: 'Promoteurs ' + pct(s.promoteurs) + ' · passifs ' + pct(s.passifs) + ' · détracteurs ' + pct(s.detracteurs) }, [h('i.vert', { style: { width: (100 * (s.promoteurs || 0) / tot) + '%' } }), h('i.ambre', { style: { width: (100 * (s.passifs || 0) / tot) + '%' } }), h('i.rouge', { style: { width: (100 * (s.detracteurs || 0) / tot) + '%' } })]) : null
      ]));
    });
  };

  Csi.prototype.rendreKpis = function () {
    var self = this;
    AMX.vider(this.elKpis);
    var cols = [['ventes', 'Questions clés — ventes'], ['service', 'Questions clés — service']].map(function (c) {
      var s = self.scoreDe(c[0], self.periode), kpis = (s && s.kpis) || [];
      return h('div', [h('h3', { text: c[1] }), kpis.length ? h('div', kpis.map(function (k) {
        var v = k.valeur, cible = k.cible, sous = v !== null && cible !== null && v < cible;
        return h('div.csi-kpi', [
          h('div', { text: k.titre + (k.n ? ' · n = ' + k.n : '') }),
          h('div.csi-jauge', [h('i' + (sous ? '.sous' : ''), { style: { width: Math.max(0, Math.min(100, v || 0)) + '%' } }), cible !== null && cible !== undefined ? h('b', { style: { left: Math.max(0, Math.min(100, cible)) + '%' }, title: 'Cible ' + pct(cible, 0) }) : null]),
          h('div.num', [pct(v, 1), h('small', { text: (cible !== null && cible !== undefined ? 'cible ' + pct(cible, 0) : '') + (k.changement !== null && k.changement !== undefined ? ' · ' + signe(k.changement) : '') })])
        ]);
      })) : h('p.doux.petit', 'pas de KPI lu pour cette période')]);
    });
    this.elKpis.appendChild(h('div.carte-entete', [h('h2', ['Questions clés du constructeur', h('span.sous', { text: 'part des clients satisfaits par question, cible du constructeur (trait), variation vs période précédente' })])]));
    this.elKpis.appendChild(h('div.carte-corps', [h('div.csi-kpis', cols)]));
  };

  Csi.prototype.sondagesFenetre = function () {
    var depuis = isoJoursAvant(this.fenetre), t = this.type;
    return this.sondagesVisibles().filter(function (s) { return s.type === t && String(s.completeLe || s.dateRdr || '') >= depuis; });
  };

  Csi.prototype.rendrePersonnes = function () {
    var self = this;
    AMX.vider(this.elPersonnes);
    var segType = h('div.segment', { role: 'group', 'aria-label': 'Type de sondage' }, TYPES.map(function (t) { return h('button' + (t[0] === self.type ? '.actif' : ''), { type: 'button', text: t[1], onclick: function () { if (t[0] === self.type) return; self.type = t[0]; AMX.memo.ecrire('csi_type', t[0]); self.rendrePersonnes(); self.rendreSondages(); } }); }));
    var segFen = h('div.segment', { role: 'group', 'aria-label': 'Fenêtre' }, FENETRES.map(function (f) { return h('button' + (f[0] === self.fenetre ? '.actif' : ''), { type: 'button', text: f[1], onclick: function () { if (f[0] === self.fenetre) return; self.fenetre = f[0]; AMX.memo.ecrire('csi_fenetre', String(f[0])); self.rendrePersonnes(); self.rendreSondages(); } }); }));
    var liste = this.sondagesFenetre(), r = resume(liste);
    var service = this.type === 'service';
    this.elPersonnes.appendChild(h('div.carte-entete', [
      h('h2', ['Par ' + (service ? 'aviseur' : 'conseiller'), h('span.sous', { text: liste.length + ' sondage' + (liste.length > 1 ? 's' : '') + ' · note moyenne ' + nb(r.moyenne, 1) + ' / 10 · ' + pct(r.pctProm, 0) + ' de 9-10 · ' + pct(r.pctDetr, 0) + ' de 0-6' + (r.alertes ? ' · ' + r.alertes + ' alerte' + (r.alertes > 1 ? 's' : '') + ' ouverte' + (r.alertes > 1 ? 's' : '') : '') })]),
      h('div.csi-actions', [segType, segFen])
    ]));
    var corps = h('div.carte-corps');
    if (!liste.length) { corps.appendChild(h('div.vide', [h('div', { html: I.filtre }), h('h3', 'Aucun sondage'), h('div', { text: 'Aucun sondage ' + (service ? 'service' : 'ventes') + ' dans cette fenêtre.' })])); this.elPersonnes.appendChild(corps); return; }
    var table = function (titre, champ) {
      var lignes = parPersonne(liste, champ);
      return h('div', { style: { marginBottom: '14px' } }, [
        h('h3.csi-sous-titre', { text: titre }),
        h('div.csi-defilant', [h('table.tableau', [
          h('thead', [h('tr', [h('th', 'Nom'), h('th.num', 'Sondages'), h('th.num', 'Moyenne / 10'), h('th.num', '9-10'), h('th.num', '7-8'), h('th.num', '0-6'), h('th.num', 'NPS'), h('th.num', 'Alertes')])]),
          h('tbody', lignes.map(function (p) {
            return h('tr', [
              h('td', [h('b', { text: p.nom }), p.commentaires ? h('span.doux.petit', { text: ' · ' + p.commentaires + ' commentaire' + (p.commentaires > 1 ? 's' : '') }) : null]),
              h('td.num', { text: String(p.n) }),
              h('td.num', [h('span.badge.sans-point.' + classeNps(p.moyenne), { text: nb(p.moyenne, 1) })]),
              h('td.num', { text: p.n ? p.prom + ' (' + Math.round(p.pctProm) + ' %)' : '—' }),
              h('td.num', { text: p.n ? String(p.pass) : '—' }),
              h('td.num' + (p.detr ? '.csi-neg' : ''), { text: p.n ? p.detr + ' (' + Math.round(p.pctDetr) + ' %)' : '—' }),
              h('td.num', { text: p.nps === null ? '—' : signe(p.nps, 0) }),
              h('td.num' + (p.alertes ? '.csi-neg' : ''), { text: p.alertes ? String(p.alertes) : '' })
            ]);
          }))
        ])])
      ]);
    };
    corps.appendChild(table(service ? 'Aviseurs service' : 'Conseillers aux ventes', 'conseiller'));
    corps.appendChild(table(service ? 'Techniciens' : 'Directeurs commerciaux (F&I)', service ? 'directeurVentes' : 'directeurFI'));
    if (!service) corps.appendChild(table('Directeurs des ventes', 'directeurVentes'));
    corps.appendChild(h('p.doux.petit', { style: { margin: '4px 0 0' }, text: 'NPS = % de 9-10 moins % de 0-6 (échelle 0-10 du sondage). Le score BoostCX en haut est celui du constructeur ; ici, le détail par personne vient des sondages lus.' }));
    this.elPersonnes.appendChild(corps);
  };

  Csi.prototype.rendreSondages = function () {
    var self = this;
    AMX.vider(this.elSondages);
    var liste = this.sondagesFenetre(), q = this.recherche.trim().toLowerCase();
    var recherche = h('input.saisie', { type: 'search', placeholder: 'Client, conseiller, commentaire, NIV…', value: this.recherche, autocomplete: 'off', style: { height: '30px', width: '240px' }, oninput: AMX.debounce(function (e) { self.recherche = e.target.value; self.rendreSondages(); }, 150) });
    var filtres = liste.filter(function (s) { return !q || [s.client, s.conseiller, s.directeurVentes, s.directeurFI, s.commentaire, s.vin, s.modele, s.alerte].join(' ').toLowerCase().indexOf(q) >= 0; });
    var alertes = filtres.filter(alerteOuverte), avecComm = filtres.filter(function (s) { return s.commentaire; });
    this.elSondages.appendChild(h('div.carte-entete', [
      h('h2', ['Sondages', h('span.sous', { text: filtres.length + ' affiché' + (filtres.length > 1 ? 's' : '') + ' · ' + alertes.length + ' alerte' + (alertes.length > 1 ? 's' : '') + ' ouverte' + (alertes.length > 1 ? 's' : '') + ' · ' + avecComm.length + ' avec commentaire' })]),
      h('div.csi-actions', [recherche])
    ]));
    var corps = h('div.carte-corps');
    if (!filtres.length) { corps.appendChild(h('div.vide', [h('div', { html: I.filtre }), h('h3', 'Aucun sondage'), h('div', 'Rien dans cette fenêtre.')])); this.elSondages.appendChild(corps); return; }
    var service = this.type === 'service';
    var tri = alertes.concat(filtres.filter(function (s) { return !alerteOuverte(s); })).slice(0, 200);
    corps.appendChild(h('div.csi-defilant', [h('table.tableau', [
      h('thead', [h('tr', [h('th', 'Date'), h('th', 'Client'), h('th', 'Véhicule'), h('th', service ? 'Aviseur · technicien' : 'Conseiller · F&I'), h('th.num', 'NPS'), h('th', 'Commentaire'), h('th', 'Alerte')])]),
      h('tbody', tri.map(function (s) {
        return h('tr', [
          h('td.date', { text: s.completeLe ? AMX.fmtDate(s.completeLe) : '—', title: s.dateRdr ? (service ? 'RO du ' : 'Livré le ') + AMX.fmtDate(s.dateRdr) : null }),
          h('td', [h('div', { text: nomCourt(s.client) || '—' }), s.courriel ? h('div.mini', { text: s.courriel }) : null]),
          h('td', [h('div', { text: [s.annee, s.modele].filter(Boolean).join(' ') || '—' }), s.vin ? h('div.mini.mono', { text: s.vin }) : (s.reference ? h('div.mini', { text: 'RO ' + String(s.reference).replace(/^RO\s*/i, '') + (s.montant ? ' · ' + AMX.fmtArgent(s.montant, 0) : '') }) : null)]),
          h('td', [h('div', { text: nomCourt(s.conseiller) || '—' }), h('div.mini', { text: nomCourt(service ? s.directeurVentes : s.directeurFI) })]),
          h('td.num', [h('span.badge.sans-point.nps.' + classeNps(s.nps), { text: s.nps === null || s.nps === undefined ? '—' : String(s.nps) })]),
          h('td', [h('div.csi-commentaire', { text: s.commentaire || '' })]),
          h('td', [alerteOuverte(s) ? h('span.badge.rouge', { text: s.alerte }) : (s.alerte ? h('span.badge.gris', { text: s.alerte }) : '')])
        ]);
      }))
    ])]));
    if (filtres.length > 200) corps.appendChild(h('p.doux.petit', { text: 'Les 200 premiers (alertes d\'abord). Précisez la recherche ou exportez en Excel.' }));
    this.elSondages.appendChild(corps);
  };

  Csi.prototype.exporter = function () {
    var liste = this.sondagesVisibles();
    if (!liste.length) { AMX.toast('Aucun sondage à exporter.', 'attention'); return; }
    if (typeof XLSX === 'undefined') { AMX.toast('La bibliothèque Excel n\'est pas encore chargée. Réessayez.', 'erreur'); return; }
    var rows = liste.map(function (s) { return { 'Concession': nomCie(s.compagnie), 'Type': s.type === 'service' ? 'Service' : 'Ventes', 'Sondage': s.id, 'Complété le': s.completeLe, 'Client': s.client, 'Courriel': s.courriel, 'NPS': s.nps, 'Conseiller / aviseur': s.conseiller, 'Directeur des ventes / technicien': s.directeurVentes, 'Directeur commercial (F&I)': s.directeurFI, 'NIV': s.vin, 'Modèle': s.modele, 'Année': s.annee, 'Livré / RO le': s.dateRdr, 'RO': s.reference, 'Montant RO': s.montant, 'Alerte': s.alerte, 'Commentaire': s.commentaire, 'Invitation le': s.invitationLe }; });
    var scores = this.scoresVisibles().map(function (s) { return { 'Concession': nomCie(s.compagnie), 'Période': s.periode, 'Type': s.type, 'Score': s.score, 'Écart cible': s.cibleEcart, 'District': s.district, 'Zone': s.zone, 'National': s.national, 'Rang district': s.rangDistrict, 'Rang zone': s.rangZone, 'Rang national': s.rangNational, 'Variation': s.changement, 'Sondages': s.sondages, 'Taux de réponse': s.tauxReponse, 'Promoteurs': s.promoteurs, 'Passifs': s.passifs, 'Détracteurs': s.detracteurs, 'Lu le': s.luLe }; });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Sondages');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(scores), 'Scores');
    XLSX.writeFile(wb, 'csi-' + (this.compagnie || 'groupe').toLowerCase() + '-' + new Date().toISOString().slice(0, 10) + '.xlsx');
    AMX.toast('Export Excel — ' + rows.length + ' sondage' + (rows.length > 1 ? 's' : ''), 'ok');
  };
})();
