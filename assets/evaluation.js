/* =========================================================================
   Inventaire › Évaluations — la fiche d'évaluation (refaite le 2 oct.).

   Modèle : l'« Analyse de marché » de Torque, mais à partir de nos propres
   sources. Les données viennent du serveur (Marche.gs → MarketCheck) :
     GET ?marche=1&annee=&marque=&modele=&version=&km=&pays=ca|us&concession=&vin=
       → { ok, pays, devise, lieu, rayonKm, actifs: { n, annonces[], prix, km, jours },
            vendus: { n90, parMois, prix, km, jours, portee }, versionElargie,
            ventesElargies, avertissements[], genereLe }
       ou { ok: false, sansCle: true, erreur } quand la clé MarketCheck manque
       (un administrateur la pose dans Outils › Comptes et droits › Données de marché).
     GET  ?evalVin=VIN                               → { trouve, donnees, dateMaj }
     POST { action: 'saveEvaluation', vin, data }    → { dateMaj }
     Externe : NHTSA vPIC pour décoder le NIV (marque / modèle / année / version).

   Ce que la page calcule elle-même (tout est recalculé quand on change le km,
   le taux ou le prix visé — pas d'appel serveur) :
     - prix ajusté de chaque annonce = prix − (km véhicule − km annonce) × taux ;
     - Prix agressif / standard / conservateur = 25e centile / médiane / 75e
       centile des prix ajustés (repli : −7 % / médiane / +4 % des stats) ;
     - Marché % = prix visé ÷ prix moyen des annonces actives ;
     - Rang = position du prix visé parmi les annonces (1 = le moins cher).
   La table des comparables insère la ligne « Votre véhicule » à son rang.

   Les comparables tapés à la main de l'ancienne fiche n'existent plus à
   l'écran (retirés le 2 oct. à la demande de Maxime) ; ceux des évaluations
   déjà enregistrées sont conservés tels quels dans la sauvegarde.
   ========================================================================= */
(function () {
  'use strict';
  var h = AMX.h, I = AMX.icones;

  var URL_NHTSA = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVINValuesBatch/';
  var URL_TORQUE = 'https://dealer.torquemanagement.ca/vehicle-management/evaluations/list';
  var TOLERANCE_KM = 30000;
  /* 7 nov. (suggestion S7E7AB6F535, Eric Morin, VW : « petite flèche à côté du prix et de l'odomètre pour choisir l'ordre ;
     plus de filtres pour choisir la propulsion, comme dans Torque ; une colonne rang versus millage ») */
  function tractionDe(x) {
    var s = String(x || '').toLowerCase();
    if (!s) return '';
    if (/^(ti|4ri|4rm)$/.test(s)) return 'int';
    if (/^ta$/.test(s)) return 'avant';
    if (/^(tp|2rm)$/.test(s)) return 'deux';
    if (/awd|4wd|4x4|all.?wheel|four.?wheel|int[eé]grale|quattro|xdrive|4motion|htrac|e-4orce|4matic|sh-awd/.test(s)) return 'int';
    if (/fwd|front|avant/.test(s)) return 'avant';
    if (/rwd|rear|arri[eè]re|propulsion|sdrive/.test(s)) return 'arriere';
    if (/4x2|2wd|2 ?roues|two.?wheel/.test(s)) return 'deux';
    return '';
  }
  var TRACTIONS = [['', 'Toutes les tractions'], ['int', 'Intégrale / 4x4'], ['deux', '2 roues (avant ou arrière)'], ['avant', 'Traction avant'], ['arriere', 'Propulsion (arrière)']];
  var NOM_TRACTION = { int: 'intégrale', avant: 'traction avant', arriere: 'propulsion', deux: '2 roues' };
  function tractionVa(voulu, x) {
    if (!voulu) return true;
    var t = tractionDe(x);
    if (!t) return false;
    if (voulu === 'deux') return t === 'avant' || t === 'arriere' || t === 'deux';
    if (voulu === 'avant' || voulu === 'arriere') return t === voulu;
    return t === voulu;
  }
  var URL_MMR = 'https://mmr.manheim.com/';

  /* ------------------- AMX.export : Canada ou États-Unis ? -------------------
     LE calcul de gros É.-U., le même que Export.gs (serveur), que la section
     Export de la fiche d'achat et que l'app (ExportCalc) :
       tauxAjusté = taux × (1 − écart %) ; converti = MMR × tauxAjusté ;
       grosUS ($ CA) = converti − ajustement (6 000 $ retirés APRÈS la conversion).
     Les paramètres (préfixes de NIV exportables, écart, ajustement, pas des
     flèches, dates d'encan) et le taux du jour (Banque du Canada) viennent de
     GET ?exportParams=1, gardés 1 h dans la session. */
  var EXPORT_DEFAUT = { prefixes: ['1', '4', '5'], ecartPct: 3, ecartAchatPct: 4, ecartEchangePct: 3, pasEcart: 0.5, ajustement: 6000, pasAjustement: 500, grosPct: 15, pasGrosPct: 1, alerteMmrPct: 10, tauxManuel: 0, premierEncan: '', derniereExpedition: '' };
  var exportCache = { rep: null, quand: 0, promesse: null };
  (function () { try { var o = JSON.parse(sessionStorage.getItem('amx_export_params_v1') || 'null'); if (o && o.rep && Date.now() - o.quand < 3600000) { exportCache.rep = o.rep; exportCache.quand = o.quand; } } catch (e) {} })();
  AMX.export = {
    charger: function (force) {
      if (!force && exportCache.rep && Date.now() - exportCache.quand < 3600000) return Promise.resolve(exportCache.rep);
      if (exportCache.promesse) return exportCache.promesse;
      exportCache.promesse = AMX.get({ exportParams: 1 }).then(function (d) {
        exportCache.promesse = null;
        if (!d || d.refuse || !d.ok) return exportCache.rep || { ok: false, params: EXPORT_DEFAUT, taux: { ok: false } };
        exportCache.rep = d; exportCache.quand = Date.now();
        try { sessionStorage.setItem('amx_export_params_v1', JSON.stringify({ rep: d, quand: exportCache.quand })); } catch (e) {}
        document.dispatchEvent(new CustomEvent('amx:export'));
        return d;
      }, function () { exportCache.promesse = null; return exportCache.rep || { ok: false, params: EXPORT_DEFAUT, taux: { ok: false } }; });
      return exportCache.promesse;
    },
    params: function () { return (exportCache.rep && exportCache.rep.params) || EXPORT_DEFAUT; },
    taux: function () { return (exportCache.rep && exportCache.rep.taux) || null; },
    peutModifier: function () { return !!(exportCache.rep && exportCache.rep.peutModifier); },
    oublier: function () { exportCache.rep = null; exportCache.quand = 0; try { sessionStorage.removeItem('amx_export_params_v1'); } catch (e) {} },
    // Les verdicts de toutes les évaluations (?evaluationsUs=1) : registre, panneau du suivi service. 5 min en mémoire.
    verdicts: function (force) {
      if (!force && exportCache.verdicts && Date.now() - exportCache.verdictsQuand < 300000) return Promise.resolve(exportCache.verdicts);
      if (exportCache.pVerdicts) return exportCache.pVerdicts;
      exportCache.pVerdicts = AMX.get({ evaluationsUs: 1 }).then(function (d) { exportCache.pVerdicts = null; if (d && d.ok) { exportCache.verdicts = d.parVin || {}; exportCache.verdictsQuand = Date.now(); } return exportCache.verdicts || {}; }, function () { exportCache.pVerdicts = null; return exportCache.verdicts || {}; });
      return exportCache.pVerdicts;
    },
    oublierVerdicts: function () { exportCache.verdictsQuand = 0; },
    exportable: function (vin) { var v = String(vin || '').trim().toUpperCase(); if (!v) return false; return (AMX.export.params().prefixes || []).some(function (p) { return v.indexOf(String(p).toUpperCase()) === 0; }); },
    calculer: function (mmr, taux, ecartPct, ajustement) {
      var m = nombre(mmr), t = nombre(taux), e = nombre(ecartPct), a = nombre(ajustement);
      if (e === null) e = 0; if (a === null) a = 0;
      var tauxAjuste = t !== null ? Math.round(t * (1 - e / 100) * 10000) / 10000 : null;
      var converti = (m !== null && tauxAjuste !== null) ? Math.round(m * tauxAjuste) : null;
      return { mmr: m, taux: t, ecartPct: e, tauxAjuste: tauxAjuste, converti: converti, ajustement: a, grosUS: converti !== null ? Math.round(converti - a) : null };
    },
    // Verdict sur les PROFITS (8 oct., soir) : le meilleur des trois (É.-U., gros Canada, détail) et son avance sur le deuxième.
    verdict: function (profitUS, profitCA, profitDetail) {
      var out = { profitUS: nombre(profitUS), profitCA: nombre(profitCA), profitDetail: nombre(profitDetail), meilleur: '', second: '', ecart: null, verdict: '' };
      var c = [];
      if (out.profitUS !== null) c.push({ k: 'us', v: out.profitUS });
      if (out.profitCA !== null) c.push({ k: 'ca', v: out.profitCA });
      if (out.profitDetail !== null) c.push({ k: 'detail', v: out.profitDetail });
      if (c.length < 2) { if (c.length) out.meilleur = c[0].k; return out; }
      c.sort(function (x, y) { return y.v - x.v; });
      out.meilleur = c[0].k; out.second = c[1].k; out.ecart = Math.round(c[0].v - c[1].v);
      out.verdict = out.ecart < 250 ? 'egal' : c[0].k;
      return out;
    },
    LIBELLES: { us: 'É.-U.', ca: 'Gros Canada', detail: 'Détail' },
    // « É.-U. +1 996 $ » : le meilleur canal et son avance sur le deuxième (registre, sommaire, suivi service).
    texteVerdict: function (v) {
      if (!v || !v.verdict) return '';
      if (v.verdict === 'egal') return 'Égal (± ' + fmt(Math.abs(v.ecart || 0)) + ')';
      return (AMX.export.LIBELLES[v.verdict] || v.verdict) + ' +' + fmt(Math.abs(v.ecart || 0));
    },
    phraseVerdict: function (v) {
      if (!v || !v.verdict) return '';
      if (v.verdict === 'egal') return 'Profits égaux (' + (AMX.export.LIBELLES[v.meilleur] || '') + ' / ' + (AMX.export.LIBELLES[v.second] || '') + ')';
      return v.verdict === 'us' ? 'Plus payant aux États-Unis' : (v.verdict === 'ca' ? 'Plus payant en gros au Canada' : 'Plus payant au détail');
    },
    classeVerdict: function (v) { return !v || !v.verdict ? 'gris' : (v.verdict === 'us' ? 'bleu' : (v.verdict === 'ca' ? 'vert' : (v.verdict === 'detail' ? 'ambre' : 'gris'))); },
    // « profit É.-U. 1 996 $ · gros Canada −3 000 $ · détail 3 200 $ »
    texteProfits: function (v) {
      if (!v) return '';
      var parts = [];
      if (v.profitUS !== null && v.profitUS !== undefined) parts.push('É.-U. ' + fmt(v.profitUS));
      if (v.profitCA !== null && v.profitCA !== undefined) parts.push('gros Canada ' + fmt(v.profitCA));
      if (v.profitDetail !== null && v.profitDetail !== undefined) parts.push('détail ' + fmt(v.profitDetail));
      return parts.length ? 'profit ' + parts.join(' · ') : '';
    }
  };

  /* ------------------------------ Helpers ------------------------------ */
  // Montants de la page (vrai signe moins « − » pour les profits négatifs).
  function fmt(n) { return (n === null || n === undefined || isNaN(n)) ? '—' : AMX.fmtArgent(n, 0).replace(/^-/, '\u2212'); }
  function fmtKm(n) { return (n === null || n === undefined || isNaN(n)) ? '—' : AMX.fmtNombre(Math.round(n)) + ' km'; }
  function fmtJ(n) { return (n === null || n === undefined || isNaN(n)) ? '—' : Math.round(n) + ' j'; }
  function pct(n) { return (n === null || n === undefined || isNaN(n)) ? '—' : Math.round(n * 100) + ' %'; }
  function asc(a, b) { return a - b; }
  function nombre(v) { var n = parseFloat(String(v === undefined || v === null ? '' : v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? null : n; }
  function mediane(t) { var n = t.length, m = Math.floor(n / 2); return n ? (n % 2 === 0 ? (t[m - 1] + t[m]) / 2 : t[m]) : null; }
  function centile(t, p) { if (!t.length) return null; var i = (t.length - 1) * p, b = Math.floor(i), r = i - b; return t[b + 1] !== undefined ? t[b] + r * (t[b + 1] - t[b]) : t[b]; }
  function moyenne(t) { return t.length ? t.reduce(function (a, b) { return a + b; }, 0) / t.length : null; }
  function arrondi50(n) { return n === null ? null : Math.round(n / 50) * 50; }
  function carte(titre, enfants, actions, cls) {
    var entete = typeof titre === 'string' ? h('h2', { text: titre }) : titre;
    return h('div.carte' + (cls ? '.' + cls : ''), [h('div.carte-entete', [entete, actions || null]), h('div.carte-corps', enfants)]);
  }
  function champ(id, libelle, opts) {
    opts = opts || {};
    var attrs = { type: opts.type || 'text', id: id, step: opts.step, placeholder: opts.placeholder, value: opts.value, autocomplete: 'off' };
    if (opts.type === 'number') attrs.inputmode = opts.inputmode || 'decimal';
    if (opts.vin) { attrs.spellcheck = 'false'; attrs.autocapitalize = 'characters'; }
    var inp = h('input' + (opts.mono ? '.mono' : ''), attrs);
    return { el: h('div.champ', [h('label', { 'for': id, text: libelle }), inp]), input: inp };
  }
  /* 26 oct. (Gabriel, BMW Sherbrooke) : « un onglet pour les TRIM, pour séparer les coupés, 4 portes, cabriolets… » — Maxime :
     « applicable partout ». La carrosserie choisie filtre les annonces de MarketCheck (body_type / doors) et les comparables. */
  var STYLES = [['', 'Toutes'], ['coupe', 'Coupé (2 portes)'], ['berline', 'Berline (4 portes)'], ['grancoupe', 'Gran Coupé (4 portes, hayon)'], ['cabriolet', 'Cabriolet'],
    ['hayon', 'Hatchback'], ['familiale', 'Familiale'], ['vus', 'VUS'], ['vuscoupe', 'VUS coupé (X4, X6, GLC coupé…)'], ['camionnette', 'Camionnette'], ['fourgonnette', 'Fourgonnette']];
  /* Le texte du décodeur (vPIC / MarketCheck) ou d'une annonce → un code de STYLES ('' = on ne sait pas). */
  function styleDe(carrosserie, portes, version, modele) {
    var t = (String(carrosserie || '') + ' ' + String(version || '') + ' ' + String(modele || '')).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    var n = Number(portes) || 0;
    if (/gran\s*coupe/.test(t)) return 'grancoupe';
    if (/convertible|cabriolet|roadster|spyder|spider/.test(t)) return 'cabriolet';
    var mod = String(modele || '').toLowerCase();
    if (/^(x2|x4|x6)\b/.test(mod) || (/\b(glc|gle|q3|q4|q5|q8|cayenne|e-tron|eqc|eqe suv)\b/.test(mod) && /coupe|sportback/.test(t))) return 'vuscoupe';
    if (/pickup|pick-up|camionnette|crew cab|double cab/.test(t)) return 'camionnette';
    if (/minivan|fourgon|\bvan\b|cargo/.test(t)) return 'fourgonnette';
    if (/sport utility|\bsuv\b|vus|multi-purpose|crossover/.test(t)) return 'vus';
    if (/wagon|familiale|estate|allroad|sportwagen|alltrack/.test(t)) return 'familiale';
    if (/coupe/.test(t)) return n >= 4 ? 'grancoupe' : 'coupe';
    if (/hatchback|liftback|hayon/.test(t)) return (n === 4 || /\b[2468]\s*series\b|\bserie\s*[2468]\b|\bi4\b/.test(t)) ? 'grancoupe' : 'hayon';
    if (/sedan|saloon|berline/.test(t)) return 'berline';
    return '';
  }
  function lienMarketGuide(vin) { return 'https://app.eblock.com/my-market-guide?soldWithinDays=90&vin=' + encodeURIComponent(vin); }

  // NHTSA : marque / modèle / année / version (null si rien ou injoignable).
  function decoderVin(vin) {
    var corps = new URLSearchParams(); corps.append('format', 'json'); corps.append('data', vin);
    return fetch(URL_NHTSA, { method: 'POST', body: corps })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var r = (d && d.Results || [])[0];
        if (!r) return null;
        return { make: r.Make || '', model: r.Model || '', year: r.ModelYear || '', trim: r.Trim || r.Series || '', carrosserie: r.BodyClass || '', portes: r.Doors || '' };
      })
      .catch(function () { return null; });
  }

  function injecterCss() {
    if (document.getElementById('css-evaluation')) return;
    var s = document.createElement('style');
    s.id = 'css-evaluation';
    s.textContent = [
      '.eval-page .carte { margin-bottom: 12px; }',
      '.eval-page .carte-corps { padding: 12px 14px; }',
      '.eval-page .carte-entete { padding: 10px 14px; }',
      '.eval-page .carte-entete .titre { min-width: 0; }',
      '.eval-page .carte-entete .titre p { margin: 2px 0 0; font-size: 12px; color: var(--encre-3); }',
      '.eval-page .carte-entete .droite { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }',
      '.eval-page .entete-page { margin-bottom: 10px; }',
      '.eval-sauvegarde { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 6px; font-size: 12px; }',
      '.eval-sauvegarde .puce.gris { background: var(--gris-bg); color: var(--encre-2); }',
      '.eval-page .btn.ok { border-color: var(--vert); color: var(--vert); background: var(--vert-clair); }',
      '.registre-table tr.registre-auto td:first-child { box-shadow: inset 3px 0 0 var(--ligne-forte); }',
      '.registre-alerte { margin-bottom: 12px; }',
      '.registre-alerte .liste-derives { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 4px; }',
      '.registre-table .registre-veille .mini { font-size: 12px; color: var(--encre-4); }',
      '.registre-table tr.registre-auto .registre-date, .registre-table tr.registre-auto .registre-vin { color: var(--encre-3); }',
      '.registre-table tr.registre-enregistree td:first-child { box-shadow: inset 3px 0 0 var(--vert); }',
      '.registre-table .badge.gris { background: var(--gris-bg); color: var(--encre-2); }',
      '.eval-page .champ > label { font-size: 12px; }',
      '.eval-page .champ input, .eval-page .champ select { height: 32px; font-size: 13px; }',
      '.eval-sommaire { position: sticky; top: calc(var(--barre-h) + var(--sous-h) + 6px); z-index: 20; display: flex; align-items: center; gap: 14px; background: var(--noir-2); color: #fff; border-radius: var(--rayon); padding: 8px 14px; margin-bottom: 12px; overflow-x: auto; scrollbar-width: none; box-shadow: 0 6px 16px rgba(0,0,0,.18); }',
      '.eval-sommaire .veh { min-width: 180px; flex: 1 1 220px; }',
      '.eval-sommaire .veh .nom { font-weight: 700; font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      '.eval-sommaire .veh .sous { font-size: 12px; color: #9AA6B2; font-family: var(--mono); white-space: nowrap; }',
      '.eval-sommaire .item { flex: none; min-width: 72px; }',
      '.eval-sommaire .item .l { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: #9AA6B2; font-weight: 600; white-space: nowrap; }',
      '.eval-sommaire .item .v { font-size: 15px; font-weight: 700; white-space: nowrap; }',
      '.eval-sommaire .item.fort .v { color: var(--vert-vif); font-size: 17px; }',
      '.eval-sommaire .item.pos .v { color: var(--vert-vif); } .eval-sommaire .item.neg .v { color: #F97066; }',
      '.eval-sommaire .item.marche { padding: 4px 12px; border-radius: 8px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.14); min-width: 118px; }',
      '.eval-sommaire .item.marche .v { font-size: 20px; letter-spacing: -.01em; }',
      '.eval-sommaire .item.marche.pos { background: rgba(31,160,90,.22); border-color: rgba(31,160,90,.5); } .eval-sommaire .item.marche.pos .v { color: var(--vert-vif); }',
      '.eval-sommaire .item.marche.moyen { background: rgba(245,158,11,.18); border-color: rgba(245,158,11,.45); } .eval-sommaire .item.marche.moyen .v { color: #FFC66D; }',
      '.eval-sommaire .item.marche.neg { background: rgba(239,68,68,.2); border-color: rgba(239,68,68,.5); } .eval-sommaire .item.marche.neg .v { color: #F97066; }',
      '.eval-marche-bandeau { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; padding: 10px 14px; border-radius: var(--rayon-s); border: 1px solid var(--ligne); background: var(--fond); margin-bottom: 10px; }',
      '.eval-marche-bandeau .gros { font-size: 26px; font-weight: 800; letter-spacing: -.02em; font-variant-numeric: tabular-nums; line-height: 1; }',
      '.eval-marche-bandeau .rang { font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums; }',
      '.eval-marche-bandeau .l { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--encre-3); font-weight: 700; }',
      '.eval-marche-bandeau .expl { font-size: 12px; color: var(--encre-2); }',
      '.eval-marche-bandeau.pos { background: var(--vert-clair); border-color: var(--vert); } .eval-marche-bandeau.pos .gros, .eval-marche-bandeau.pos .rang { color: var(--vert); }',
      '.eval-marche-bandeau.moyen { background: var(--ambre-bg); border-color: var(--ambre-bord); } .eval-marche-bandeau.moyen .gros, .eval-marche-bandeau.moyen .rang { color: var(--ambre); }',
      '.eval-marche-bandeau.neg { background: var(--rouge-bg, #FDECEC); border-color: var(--rouge); } .eval-marche-bandeau.neg .gros, .eval-marche-bandeau.neg .rang { color: var(--rouge); }',
      '.eval-sommaire .sauts { margin-left: auto; display: flex; gap: 4px; flex: none; }',
      '.eval-sommaire .sauts a { color: #fff; font-size: 12px; padding: 4px 9px; border-radius: 6px; background: rgba(255,255,255,.1); white-space: nowrap; }',
      '.eval-sommaire .sauts a:hover { background: rgba(255,255,255,.22); text-decoration: none; }',
      '.eval-sous-vehicule { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; margin-top: 10px; }',
      '.eval-sous-vehicule:empty { display: none; }',
      '.eval-contexte { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 12.5px; color: var(--encre-2); }',
      '.eval-contexte .modele { font-weight: 600; color: var(--encre); }',
      '.eval-liens { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }',
      '.eval-liens .sep { color: var(--encre-4); font-size: 12px; margin-left: 4px; }',
      '.eval-liens a.btn.desactive { opacity: .55; pointer-events: none; }',
      '.eval-prix-grille { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 14px 22px; align-items: start; }',
      '.eval-prix-calc { display: flex; flex-direction: column; gap: 10px; }',
      '.eval-formule { display: flex; align-items: flex-end; gap: 8px; flex-wrap: wrap; }',
      '.eval-formule .champ { flex: 1 1 120px; min-width: 110px; }',
      '.eval-formule .op { height: 32px; display: flex; align-items: center; font-weight: 700; color: var(--encre-3); font-size: 16px; flex: none; }',
      '.eval-formule .op.rappel { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; border: 1px dashed var(--ligne-forte); border-radius: var(--rayon-s); padding: 0 10px; }',
      '.eval-champ-calcule input { background: var(--carte-2); font-weight: 600; }',
      '.eval-champ-detail input { border-color: var(--vert); background: var(--vert-clair); font-weight: 700; font-size: 15px; }',
      '.eval-detail-ligne { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; font-size: 12.5px; }',
      '.eval-detail-ligne .l { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--encre-3); font-weight: 700; }',
      '.eval-detail-ligne .v { font-size: 18px; font-weight: 700; }',
      '.eval-cibles-titre { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--encre-3); font-weight: 700; margin-bottom: 6px; }',
      '.eval-cibles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }',
      '.eval-valeurs { margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--ligne); }',
      '.eval-liste-rappels { display: flex; flex-direction: column; gap: 10px; max-height: 60vh; overflow: auto; }',
      '.eval-rappel { border: 1px solid var(--ligne); border-radius: var(--rayon-s); padding: 10px 12px; font-size: 12.5px; line-height: 1.45; }',
      '.eval-rappel .entete { display: flex; gap: 10px; align-items: center; margin-bottom: 2px; }',
      '.eval-rappel .composant { font-weight: 600; margin-bottom: 4px; }',
      '.eval-rappel p { margin: 4px 0 0; }',
      '.eval-valeurs-entete { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }',
      '.eval-valeurs-entete h3 { margin: 0; font-size: 13px; }',
      '.chargement.mini { font-size: 12px; padding: 6px 0; }',
      // Feuille d'offre (modale) et page imprimée
      '.offre-formulaire { display: flex; flex-direction: column; gap: 10px; min-width: 320px; }',
      '.offre-formulaire .grille { display: grid; grid-template-columns: 1fr auto; gap: 10px; }',
      '.offre-impression { display: none; }',
      '@media print { body.impression-offre > *:not(#offre-impression) { display: none !important; } body.impression-offre { background: #fff; } body.impression-offre #offre-impression { display: block; font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #111; padding: 28px 36px; max-width: 760px; margin: 0 auto; font-size: 13px; line-height: 1.45; } .offre-entete { display: flex; justify-content: space-between; gap: 20px; border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 16px; } .offre-concession { font-size: 17px; font-weight: 700; } .offre-titre { text-align: right; } .offre-titre h1 { margin: 0 0 4px; font-size: 24px; letter-spacing: .02em; } .offre-impression .doux { color: #555; font-size: 12px; } .offre-client { margin: 0 0 12px; } .offre-client .l, .offre-montant .l, .offre-notes .l, .offre-conditions .l { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #555; font-weight: 700; display: block; margin-bottom: 2px; } .offre-client .l { display: inline; margin-right: 8px; } .offre-vehicule { width: 100%; border-collapse: collapse; margin-bottom: 16px; } .offre-vehicule th { text-align: left; width: 140px; padding: 6px 8px; background: #f3f4f6; border: 1px solid #ddd; font-size: 12px; } .offre-vehicule td { padding: 6px 8px; border: 1px solid #ddd; } .offre-vehicule .mono { font-family: Menlo, Consolas, monospace; } .offre-montant { border: 2px solid #111; border-radius: 8px; padding: 12px 16px; margin: 0 0 14px; } .offre-montant .v { font-size: 30px; font-weight: 800; } .offre-montant .m { font-size: 11.5px; color: #555; } .offre-marche { font-size: 12px; color: #444; margin: 0 0 12px; } .offre-notes { margin-bottom: 12px; white-space: pre-wrap; } .offre-conditions ul { margin: 4px 0 0; padding-left: 18px; font-size: 12px; } .offre-signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 44px; } .offre-signatures .trait { border-bottom: 1px solid #111; height: 34px; margin-bottom: 4px; } .offre-pied { margin-top: 30px; font-size: 10.5px; color: #777; text-align: center; } }',
      '.eval-cible { border: 1px solid var(--ligne); border-radius: var(--rayon-s); padding: 8px 10px; display: flex; flex-direction: column; gap: 2px; }',
      '.eval-cible .l { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--encre-3); font-weight: 700; }',
      '.eval-cible .v { font-size: 17px; font-weight: 700; }',
      '.eval-cible .s { font-size: 12px; color: var(--encre-3); line-height: 1.35; }',
      '.eval-cible .s.pos { color: var(--vert); } .eval-cible .s.neg { color: var(--rouge); }',
      '.eval-cible .btn { align-self: flex-start; margin-top: 4px; }',
      '.eval-cible.agressif { box-shadow: inset 4px 0 0 var(--rouge); } .eval-cible.standard { box-shadow: inset 4px 0 0 var(--vert); background: var(--vert-clair); } .eval-cible.conservateur { box-shadow: inset 4px 0 0 var(--bleu); }',
      '.eval-attente.mini { padding: 14px; font-size: 12px; }',
      // Boîte « Canada ou États-Unis ? » (8 oct.)
      '#sec-export .carte-corps { padding: 12px 14px; }',
      '.eval-export-tete { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }',
      '.eval-export-tete h2 { margin: 0; font-size: 14px; }',
      '.eval-export-tete .mini { color: var(--encre-3); }',
      '.eval-export-tete .droite { margin-left: auto; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }',
      '.eval-export-resume { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 12.5px; color: var(--encre-2); }',
      '.eval-export-resume .badge { font-size: 12.5px; padding: 4px 10px; }',
      '.eval-export-corps { display: flex; flex-direction: column; gap: 10px; }',
      '.eval-export-ligne { display: flex; align-items: flex-end; gap: 8px; flex-wrap: wrap; }',
      '.eval-export-ligne .champ { flex: 1 1 150px; min-width: 130px; max-width: 260px; }',
      '.eval-export-ligne.saisie .champ.reglages { flex: 1 1 auto; max-width: none; display: flex; align-items: flex-end; }',
      '.eval-export-ligne.saisie .champ.reglages label { display: none; }',
      '.eval-export-ligne.saisie .champ.reglages .btn { height: 32px; white-space: nowrap; }',
      '.eval-export-reglages { border: 1px dashed var(--ligne); border-radius: var(--rayon-s); padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; background: var(--fond); }',
      '.eval-export-ligne .op { height: 32px; display: flex; align-items: center; font-weight: 700; color: var(--encre-3); font-size: 16px; flex: none; }',
      '.eval-export-champ-us input { background: var(--vert-clair); border-color: var(--vert); font-weight: 700; font-size: 15px; }',
      '.eval-stepper { display: flex; align-items: center; gap: 0; }',
      '.eval-stepper input { border-radius: var(--rayon-s) 0 0 var(--rayon-s); text-align: right; }',
      '.eval-stepper .fleches { display: flex; flex-direction: column; border: 1px solid var(--ligne); border-left: none; border-radius: 0 var(--rayon-s) var(--rayon-s) 0; overflow: hidden; height: 32px; }',
      '.eval-stepper .fleches button { border: none; background: var(--carte-2); color: var(--encre-2); width: 26px; height: 16px; line-height: 14px; font-size: 12px; cursor: pointer; padding: 0; }',
      '.eval-stepper .fleches button:hover { background: var(--ligne); }',
      '.eval-export-prereglages { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; font-size: 12px; color: var(--encre-3); }',
      '.eval-export-prereglages button { font-size: 12px; padding: 3px 8px; }',
      '.eval-export-chaine { font-size: 12.5px; color: var(--encre-2); line-height: 1.5; font-variant-numeric: tabular-nums; }',
      '.eval-export-chaine b { font-size: 14px; }',
      '.eval-export-taux { font-size: 12px; color: var(--encre-3); display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }',
      '.eval-export-cols { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }',
      '@media (max-width: 1200px) { .eval-export-cols { grid-template-columns: repeat(2, minmax(0, 1fr)); } }',
      '.eval-export-col.marche { box-shadow: inset 4px 0 0 var(--ligne-forte, #98A2B3); }',
      '.eval-export-col.marche.ok { box-shadow: inset 4px 0 0 var(--vert); } .eval-export-col.marche.ok .v { color: var(--vert); }',
      '.eval-export-col.marche.alerte { box-shadow: inset 4px 0 0 var(--rouge); background: var(--rouge-bg); border-color: var(--rouge-bord); } .eval-export-col.marche.alerte .v { color: var(--rouge); } .eval-export-col.marche.alerte .l { color: var(--rouge); }',
      '.eval-export-col.marche .s button { margin-top: 3px; }',
      '.eval-export-resume .badge.rouge, .eval-export-verdict .badge.rouge { font-weight: 700; }',
      '.eval-export-col { border: 1px solid var(--ligne); border-radius: var(--rayon-s); padding: 8px 10px; display: flex; flex-direction: column; gap: 3px; background: var(--fond); }',
      '.eval-export-col.ca.estime .v { color: var(--encre-2); font-style: italic; }',
      '.eval-export-col.ca.estime .v::before { content: "≈ "; font-style: normal; }',
      '.eval-export-col .l { font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: var(--encre-3); font-weight: 700; }',
      '.eval-export-col .v { font-size: 19px; font-weight: 700; font-variant-numeric: tabular-nums; }',
      '.eval-export-col .s { font-size: 12px; color: var(--encre-3); line-height: 1.35; }',
      '.eval-export-col input { height: 30px; font-size: 14px; font-weight: 700; margin-top: 2px; }',
      '.eval-export-col.us { box-shadow: inset 4px 0 0 var(--bleu); } .eval-export-col.ca { box-shadow: inset 4px 0 0 var(--vert); } .eval-export-col.detail { box-shadow: inset 4px 0 0 var(--ambre); }',
      '.eval-export-col.gagnant { background: var(--vert-clair); border-color: var(--vert); }',
      '.eval-export-verdict { margin-top: 8px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 13px; }',
      '.eval-export-verdict .badge { font-size: 13px; padding: 5px 12px; }',
      '.eval-sommaire .item.verdict .v { color: #fff; } .eval-sommaire .item.verdict.us .v { color: #7CC4FF; } .eval-sommaire .item.verdict.ca .v { color: var(--vert-vif); } .eval-sommaire .item.verdict.detail .v { color: #FFC66D; }',
      '@media (max-width: 900px) { .eval-export-cols { grid-template-columns: 1fr; } }',
      /* 1er nov. : page plus compacte, une rangée d'icônes qui ouvre un panneau à la fois */
      '.eval-veh-1 { display: grid; grid-template-columns: minmax(0, 2.2fr) minmax(0, .9fr) minmax(0, 1.3fr); gap: 8px 12px; align-items: end; }',
      '.eval-veh-2 { display: grid; grid-template-columns: .7fr 1fr 1fr 1.2fr 1fr; gap: 8px 12px; margin-top: 8px; }',
      '.eval-niv { display: flex; gap: 6px; align-items: flex-end; } .eval-niv .champ { flex: 1 1 auto; min-width: 0; } .eval-niv .btn { height: 32px; flex: none; }',
      '.eval-veh-bas { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 8px; } .eval-veh-bas .eval-contexte { flex: 1 1 auto; } .eval-fiche { margin-left: auto; display: flex; gap: 6px; } .eval-fiche:empty { display: none; }',
      '.eval-taux-km { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--encre-3); white-space: nowrap; } .eval-taux-km input { width: 72px; height: 28px; font-size: 13px; text-align: right; }',
      '.eval-tuiles { display: flex; gap: 8px; overflow-x: auto; scroll-snap-type: x proximity; padding: 2px 2px 8px; margin: 0 0 4px; scrollbar-width: thin; scroll-margin-top: calc(var(--barre-h) + var(--sous-h) + 70px); }',
      '.eval-tuile { flex: 0 0 auto; scroll-snap-align: start; display: flex; align-items: center; gap: 10px; min-width: 150px; max-width: 240px; padding: 9px 12px; border: 1px solid var(--ligne); border-radius: var(--rayon); background: var(--carte); color: var(--encre); font: inherit; text-align: left; cursor: pointer; box-shadow: 0 1px 2px rgba(16,24,40,.04); }',
      '.eval-tuile:hover { border-color: var(--ligne-forte); background: var(--carte-2); }',
      '.eval-tuile:focus-visible { outline: 2px solid var(--vert); outline-offset: 2px; }',
      '.eval-tuile .ico { width: 34px; height: 34px; flex: none; border-radius: 9px; display: grid; place-items: center; background: var(--gris-bg); color: var(--encre-2); }',
      '.eval-tuile .ico svg { width: 18px; height: 18px; } .eval-tuile .ico b { font-size: 12px; font-weight: 800; letter-spacing: .02em; }',
      '.eval-tuile .txt { display: flex; flex-direction: column; min-width: 0; }',
      '.eval-tuile .t { font-size: 12px; color: var(--encre-3); font-weight: 600; white-space: nowrap; }',
      '.eval-tuile .c { font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }',
      '.eval-tuile.vert .ico { background: var(--vert-clair); color: var(--vert); } .eval-tuile.vert .c { color: var(--vert); }',
      '.eval-tuile.ambre .ico { background: var(--ambre-bg); color: var(--ambre); } .eval-tuile.ambre .c { color: var(--ambre); }',
      '.eval-tuile.rouge .ico { background: var(--rouge-bg, #FDECEC); color: var(--rouge); } .eval-tuile.rouge .c { color: var(--rouge); }',
      '.eval-tuile.bleu .ico { background: var(--bleu-bg); color: var(--bleu); } .eval-tuile.bleu .c { color: var(--bleu); }',
      '.eval-tuile.violet .ico { background: var(--violet-bg, #F1ECFB); color: var(--violet); } .eval-tuile.violet .c { color: var(--violet); }',
      '.eval-tuile.gris .c { color: var(--encre-3); font-weight: 600; }',
      '.eval-tuile.actif { border-color: var(--vert); box-shadow: 0 0 0 1px var(--vert), 0 2px 8px rgba(0,136,64,.12); background: var(--carte); }',
      '.eval-tuile.actif .t { color: var(--vert); }',
      '.eval-panneau[hidden] { display: none !important; }',
      '.eval-prix-plus { display: flex; align-items: center; gap: 8px 12px; flex-wrap: wrap; }',
      '.eval-prix-type { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--encre-3); font-weight: 600; } .eval-prix-type select { height: 28px; font-size: 13px; }',
      '#e-prix-note { flex: 1 1 180px; min-width: 140px; height: 28px; font-size: 13px; }',
      '.eval-recon-detail { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; padding: 8px 10px; border: 1px dashed var(--ligne); border-radius: var(--rayon-s); background: var(--fond); }',
      '.eval-recon-detail.cache { display: none; }',
      '.eval-chips-bloc { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }',
      '.eval-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }',
      '.eval-chips .l { font-size: 12px; font-weight: 700; color: var(--encre-3); text-transform: uppercase; letter-spacing: .06em; min-width: 86px; }',
      '.eval-chip { border: 1px solid var(--ligne); background: var(--carte); color: var(--encre-2); border-radius: 999px; padding: 4px 10px; font: inherit; font-size: 12.5px; cursor: pointer; }',
      '.eval-chip:hover { border-color: var(--ligne-forte); }',
      '.eval-chip:focus-visible { outline: 2px solid var(--vert); outline-offset: 1px; }',
      '.eval-chips.rouge .eval-chip.actif { background: var(--rouge-bg, #FDECEC); border-color: var(--rouge); color: var(--rouge); font-weight: 600; }',
      '.eval-chips.rouge .eval-chip.actif[data-code="vu"] { background: var(--vert-clair); border-color: var(--vert); color: var(--vert); }',
      '.eval-chips.bleu .eval-chip.actif { background: var(--bleu-bg); border-color: var(--bleu); color: var(--bleu); font-weight: 600; }',
      '.eval-chips.vert .eval-chip.actif { background: var(--vert-clair); border-color: var(--vert); color: var(--vert); font-weight: 600; }',
      '.eval-chip.actif::before { content: "✓ "; }',
      '.eval-panneau > .carte { margin-bottom: 12px; }',
      '#sec-openlane .eval-valeurs { margin-top: 0; padding-top: 0; border-top: none; }',
      '#sec-historique .eval-sous-vehicule { margin-top: 0; } #sec-historique .eval-sous-vehicule + .eval-sous-vehicule { margin-top: 10px; }',
      '.eval-rappels-tete { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }',
      '.eval-rappels-tete .badge { font-size: 12.5px; padding: 4px 10px; }',
      '#sec-rappels .eval-liste-rappels { max-height: none; }',
      '.eval-detail-resume .eval-marche-bandeau, #eval-detail-resume .eval-marche-bandeau { padding: 8px 12px; margin-bottom: 8px; }',
      '#eval-detail-resume .eval-marche-bandeau .gros { font-size: 22px; } #eval-detail-resume .eval-marche-bandeau .rang { font-size: 16px; }',
      '@media (max-width: 1100px) { .eval-veh-2 { grid-template-columns: repeat(3, minmax(0, 1fr)); } }',
      '@media (max-width: 600px) { .eval-cible { flex-direction: row; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; padding: 6px 10px; } .eval-cible .v { font-size: 15px; } .eval-cible .btn { margin: 0 0 0 auto; } }',
      '@media (max-width: 760px) { .eval-veh-1 { grid-template-columns: 1fr 1fr; } .eval-veh-1 .eval-niv { grid-column: 1 / -1; } .eval-veh-2 { grid-template-columns: 1fr 1fr; } .eval-tuile { min-width: 132px; padding: 8px 10px; } .eval-tuile .ico { width: 30px; height: 30px; } .eval-fiche { margin-left: 0; } }',
      '.eval-pile { display: flex; flex-direction: column; gap: 12px; }',
      '.eval-note { margin: 0; font-size: 12px; color: var(--encre-3); line-height: 1.5; }',
      '#eval-detail-resume:not(:empty) { margin-top: 2px; }',
      '@media (max-width: 1200px) { .eval-prix-grille { grid-template-columns: 1fr; } }',
      '@media (max-width: 900px) { .eval-cibles { grid-template-columns: 1fr; } .eval-sommaire .sauts { display: none; } }',
      '.eval-resume { margin-bottom: 12px; }',
      '.eval-grille-suivi { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px 12px; }',
      '.eval-grille-etat { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px 12px; }',
      '.eval-suivi-ecart:not(:empty) { margin-top: 10px; }',
      '.eval-etat-notes { margin-top: 10px; } .eval-etat-notes textarea { width: 100%; min-height: 54px; resize: vertical; }',
      '.eval-photos-entete { display: flex; align-items: center; gap: 10px; margin: 14px 0 8px; } .eval-photos-entete h3 { margin: 0; font-size: 13px; }',
      '.eval-photos { display: flex; flex-wrap: wrap; gap: 8px; } .eval-photo img { width: 120px; height: 90px; object-fit: cover; border-radius: 6px; border: 1px solid var(--ligne); display: block; background: var(--gris-bg); }',
      '#eval-suivi-statut button.actif.s-ambre { color: var(--ambre); } #eval-suivi-statut button.actif.s-vert { color: var(--vert); } #eval-suivi-statut button.actif.s-rouge { color: var(--rouge); } #eval-suivi-statut button.actif.s-bleu { color: var(--bleu); } #eval-suivi-statut button.actif.s-violet { color: var(--violet); }',
      '.eval-sommaire .item.suivi.s-ambre .v { color: var(--ambre); } .eval-sommaire .item.suivi.s-vert .v { color: var(--vert); } .eval-sommaire .item.suivi.s-rouge .v { color: var(--rouge); } .eval-sommaire .item.suivi.s-bleu .v { color: var(--bleu); } .eval-sommaire .item.suivi.s-violet .v { color: var(--violet); }',
      '@media (max-width: 600px) { .eval-grille-suivi, .eval-grille-etat { grid-template-columns: repeat(2, minmax(0, 1fr)); } .eval-recon-detail { grid-template-columns: repeat(2, minmax(0, 1fr)); } .eval-chips .l { min-width: 0; width: 100%; } }',
      '@media (max-width: 900px) and (min-width: 601px) { .eval-recon-detail { grid-template-columns: repeat(3, minmax(0, 1fr)); } }',
      '.eval-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 12px; }',
      '.eval-stat { border: 1px solid var(--ligne); border-radius: var(--rayon-s); padding: 12px 14px; }',
      '.eval-stat h3 { font-size: 13px; margin: 0 0 8px; }',
      '.eval-stat h3 .n { font-size: 20px; font-weight: 700; margin-right: 6px; font-variant-numeric: tabular-nums; }',
      '.eval-stat .grille-mini { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }',
      '.eval-stat .grille-mini .l { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--encre-3); font-weight: 600; }',
      '.eval-stat .grille-mini .v { font-size: 13.5px; font-weight: 600; font-variant-numeric: tabular-nums; margin-top: 1px; }',
      '.eval-stat .grille-mini .m { font-size: 12px; color: var(--encre-4); font-variant-numeric: tabular-nums; }',
      '.eval-stat p.eval-note { margin-top: 8px; }',
      '.eval-filtres { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; font-size: 12.5px; }',
      '.eval-filtres .case { display: inline-flex; align-items: center; gap: 6px; }',
      '.eval-filtres .espace { flex: 1; }',
      '#eval-comparables th.eval-tri { cursor: pointer; user-select: none; white-space: nowrap; } #eval-comparables th.eval-tri .fl { color: var(--encre-4, #5F6978); font-size: 11px; } #eval-comparables th.eval-tri.actif { color: var(--vert-fonce, #0B6B3A); } #eval-comparables th.eval-tri.actif .fl { color: inherit; } .eval-filtres .eval-sens { height: 28px; }',
      '.eval-table { overflow-x: auto; }',
      '.eval-table .tableau { min-width: 900px; }',
      '.eval-table td, .eval-table th { padding: 7px 10px; }',
      '.eval-table tr.eval-moi td { background: var(--vert-clair); font-weight: 600; }',
      '.eval-table tr.eval-moi td:first-child { box-shadow: inset 3px 0 0 var(--vert); }',
      '.eval-table td.sous .mini { display: block; }',
      '.eval-table .sup { color: var(--rouge); } .eval-table .inf { color: var(--vert); }',
      '.eval-pied { display: flex; gap: 8px 14px; flex-wrap: wrap; align-items: center; margin-top: 10px; font-size: 12px; color: var(--encre-3); }',
      '.eval-attente { padding: 26px 16px; text-align: center; color: var(--encre-3); font-size: 13px; border: 1px dashed var(--ligne-forte); border-radius: var(--rayon-s); }',
      '.eval-attente .btn { margin-top: 10px; }',
      '.registre-barre { margin-bottom: 12px; } .registre-barre .carte-corps { padding: 10px 14px; }',
      '.registre-outils { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }',
      '.registre-outils .recherche { flex: 1 1 240px; position: relative; display: flex; align-items: center; } .registre-outils .recherche > span { position: absolute; left: 10px; width: 14px; height: 14px; color: var(--encre-4); display: flex; } .registre-outils .recherche > span svg { width: 14px; height: 14px; } .registre-outils .recherche input { padding-left: 30px; height: 32px; width: 100%; }',
      '.registre-outils .compte { margin-left: auto; font-size: 12px; }',
      '.registre-corps { padding: 0 !important; }',
      '.registre-table .tableau { min-width: 1240px; border: none; border-radius: 0; box-shadow: none; }',
      '.registre-table td { padding: 8px 10px; }',
      '.registre-table td.num, .registre-table td.mono, .registre-table .registre-date { white-space: nowrap; }',
      '.registre-table .registre-date .mini { font-size: 12px; color: var(--encre-4); }',
      '.registre-table .registre-vehicule { display: flex; align-items: center; gap: 10px; min-width: 220px; }',
      '.registre-table .registre-vehicule .logo-marque { width: 34px; height: 34px; flex: none; border: 1px solid var(--ligne); border-radius: 8px; display: grid; place-items: center; background: #fff; font-size: 12px; font-weight: 700; color: var(--encre-3); overflow: hidden; }',
      '.registre-table .registre-vehicule .logo-marque img { width: 24px; height: 24px; object-fit: contain; }',
      '.registre-table .registre-vehicule .nom { font-weight: 600; }',
      '.registre-table .registre-vin { font-size: 12px; color: var(--encre-3); }',
      '.registre-table .registre-detail { font-weight: 700; }',
      '.registre-table .registre-par { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; }',
      '.registre-table .registre-par .avatar { width: 24px; height: 24px; border-radius: 50%; background: var(--noir-2); color: #fff; font-size: 12px; font-weight: 700; display: grid; place-items: center; }',
      '.registre-table tfoot td { font-weight: 600; background: var(--carte-2); border-top: 1px solid var(--ligne); }',
      '.registre-table th.registre-triable { cursor: pointer; user-select: none; } .registre-table th.registre-triable.actif { color: var(--vert); }',
      '.registre-table tr.cliquable:focus-visible td { box-shadow: inset 0 0 0 2px rgba(0,136,64,.35); outline: none; }',
      /* 26 oct. : registre simple à regarder (tableau « Simple » sans largeur minimale, pastilles du suivi, par concession) */
      '.registre-table.simple .tableau { min-width: 0; }',
      '.eval-titre { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; } .eval-titre h1 { margin: 0; } .eval-cie:empty { display: none; }',
      '.registre-outils.registre-suivis { margin-top: 10px; gap: 8px; }',
      '.registre-chiffres .kpi { flex: 1 1 0; } @media (max-width: 860px) { .registre-chiffres .kpi { flex: 1 0 140px; } }',
      '.registre-par-cie { margin-bottom: 12px; } .registre-par-cie .tableau { min-width: 0 !important; } .registre-par-cie tr.cliquable { cursor: pointer; } .registre-par-cie tr.cliquable:hover td { background: var(--carte-2); }',
      '.registre-table td.registre-relancer { color: var(--ambre); font-weight: 700; }',
      '.registre-table tr.registre-a-relancer td:first-child { box-shadow: inset 3px 0 0 var(--ambre); }',
      '.registre-suivi-puces { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 3px; }',
      '@media (max-width: 900px) {',
      '  .eval-stats { grid-template-columns: 1fr; }',
      '  .eval-page .carte-entete { flex-wrap: wrap; }',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ============================== Vue ================================== */
  // Portée « État / province » (paramètre state de MarketCheck) : mêmes codes
  // et noms que Marche.gs. Pennsylvanie en tête : c'est là que vont nos véhicules.
  var ETATS = {
    us: { PA: 'Pennsylvanie', NY: 'New York', NJ: 'New Jersey', OH: 'Ohio', MI: 'Michigan', VT: 'Vermont', NH: 'New Hampshire', ME: 'Maine', MA: 'Massachusetts', CT: 'Connecticut', RI: 'Rhode Island', MD: 'Maryland', DE: 'Delaware', VA: 'Virginie', WV: 'Virginie-Occidentale', KY: 'Kentucky', IN: 'Indiana', IL: 'Illinois', WI: 'Wisconsin', MN: 'Minnesota', NC: 'Caroline du Nord', TN: 'Tennessee', GA: 'Géorgie', FL: 'Floride', TX: 'Texas' },
    ca: { QC: 'Québec', ON: 'Ontario', NB: 'Nouveau-Brunswick', NS: 'Nouvelle-Écosse', PE: 'Île-du-Prince-Édouard', NL: 'Terre-Neuve-et-Labrador', MB: 'Manitoba', SK: 'Saskatchewan', AB: 'Alberta', BC: 'Colombie-Britannique' }
  };
  function porteeValide(v, defaut) { return (v === 'local' || v === 'national' || v === 'etat') ? v : defaut; }
  function nomPortee(portee, pays, etat) {
    if (portee === 'etat') return (ETATS[pays] && ETATS[pays][etat]) ? ETATS[pays][etat] + (pays === 'us' ? ' (État)' : ' (province)') : (pays === 'us' ? 'un État' : 'une province');
    if (portee === 'national') return pays === 'us' ? 'tout le pays (États-Unis)' : 'tout le pays (Canada)';
    return 'autour de la concession (160 km)';
  }

  function Evaluation(ctx) {
    var self = this;
    injecterCss();
    this.vinCourant = '';
    this.vinCharge = '';
    this.generation = 0;
    this.comparablesCharges = [];           // comparables manuels d'une ancienne évaluation, renvoyés tels quels
    this.pays = AMX.memo.lire('eval_pays', 'ca') === 'us' ? 'us' : 'ca';
    this.analyses = { ca: null, us: null };   // réponses du serveur par pays
    this.enCours = { ca: false, us: false };
    this.genAnalyse = { ca: 0, us: 0 };       // une analyse plus récente (ou un autre NIV) rend la réponse caduque
    this.portee = { ca: porteeValide(AMX.memo.lire('eval_portee_ca', 'local'), 'local'), us: porteeValide(AMX.memo.lire('eval_portee_us', 'national'), 'national') };
    this.etats = { ca: ETATS.ca[AMX.memo.lire('eval_etat_ca', 'QC')] ? AMX.memo.lire('eval_etat_ca', 'QC') : 'QC', us: ETATS.us[AMX.memo.lire('eval_etat_us', 'PA')] ? AMX.memo.lire('eval_etat_us', 'PA') : 'PA' };
    this.sauvegarde = null;                   // { statut: 'auto'|'enregistree', dateMaj, enregistreLe, enregistrePar }
    this.tuileOuverte = '';                   // 1er nov. : la tuile dont le panneau est ouvert sous la rangée ('' = tout fermé)
    this.nbPhotos = null; this.nTorque = null; this.nEchanges = null;
    this.rappels = null;                     // rappels NHTSA pour année / marque / modèle (gratuit, chargé après le décodage)
    this.rappelsCle = '';
    this.minuterieAuto = null;
    this.filtres = { memeVersion: false, kmProche: false, tri: 'prix', sens: 'asc', traction: '' };
    this.tractionVehicule = ''; this.tractionManuelle = false;   /* 7 nov. : traction du véhicule (décodeur) et choix de l'utilisateur */
    this.derniereSauvegarde = null;           // bloc `marche` d'une évaluation rechargée
    // Boîte « Canada ou États-Unis ? » (8 oct.) : ce que l'utilisateur a tapé ou réglé pour ce NIV.
    this.us = { mmr: '', taux: null, tauxDate: '', tauxSource: '', ecartPct: null, ajustement: null, grosCA: '', grosCASource: '', grosPct: null };
    this.exportForce = false;                 // « Comparer quand même » pour un NIV non exportable

    this.construire();
    this.rendreMarche();
    this.surExport = function () { self.rendreExport(); };
    document.addEventListener('amx:export', this.surExport);
    AMX.export.charger().then(function () { self.rendreExport(); }, function () {});

    this.surInventaire = function () { self.rendreContexte(); };
    document.addEventListener('amx:inventaire', this.surInventaire);
    this.surCarfax = function () { self.rendreLiens(); };
    document.addEventListener('amx:carfax', this.surCarfax);
    // 26 oct. : une évaluation pas encore conservée suit la concession choisie en haut du site.
    this.surCompagnie = function () {
      if (self.sauvegarde || self.vinCharge) return;
      var k = self.concessionDepart();
      if (k && k !== self.elConcession.value) { self.elConcession.value = k; self.oublierAnalyses(); self.rendreCie(); }
    };
    document.addEventListener('amx:compagnie', this.surCompagnie);
    this.surOpenlane = function () { self.majTuiles(); };
    document.addEventListener('amx:openlane', this.surOpenlane);
    if (AMX.carfax && AMX.carfax.charger) AMX.carfax.charger().catch(function () {});

    var vin = (ctx && ctx.params && ctx.params.vin) ? String(ctx.params.vin).trim() : '';
    this.demandeId = (ctx && ctx.params && ctx.params.demande) ? String(ctx.params.demande) : '';
    if (vin) { this.elNiv.value = vin; this.charger(vin); }
    this.rendreDemande();
  }

  Evaluation.prototype.demonter = function () {
    document.removeEventListener('amx:inventaire', this.surInventaire);
    document.removeEventListener('amx:carfax', this.surCarfax);
    document.removeEventListener('amx:export', this.surExport);
    document.removeEventListener('amx:compagnie', this.surCompagnie);
    document.removeEventListener('amx:openlane', this.surOpenlane);
    if (this.surDemandes) document.removeEventListener('amx:evalDemandes', this.surDemandes);
    if (this.obsOpenlane) this.obsOpenlane.disconnect();
    this.generation++;
  };

  /* 26 oct. (Maxime : « l'outil d'évaluation doit pouvoir être suivi facilement par concessionnaire ») : une nouvelle
     évaluation part sur la concession choisie en haut du site, sinon celle du compte, sinon la dernière utilisée ici. */
  Evaluation.prototype.concessionDepart = function () {
    var ok = AMX.concessionsPour('evaluations') || {};
    var site = AMX.COMPAGNIE_CONCESSION[AMX.compagnieChoisie('evaluations')] || '';
    var moi = AMX.COMPAGNIE_CONCESSION[(AMX.maConcession && AMX.maConcession()) || ''] || '';
    return [site, moi, AMX.memo.lire('eval_concession', '')].filter(function (k) { return k && ok[k]; })[0] || '';
  };
  Evaluation.prototype.rendreCie = function () {
    if (!this.elCieBadge || !this.elConcession) return;
    var k = this.elConcession.value;
    this.elCieBadge.className = 'badge sans-point eval-cie ' + (COULEUR_CONCESSION[k] || 'gris');
    this.elCieBadge.textContent = AMX.CONCESSIONS_TOUTES[k] || k || '';
  };

  Evaluation.prototype.naviguer = function (ctx) {
    var vin = (ctx && ctx.params && ctx.params.vin) ? String(ctx.params.vin).trim() : '';
    var dem = (ctx && ctx.params && ctx.params.demande) ? String(ctx.params.demande) : '';
    if (dem || (vin && vin !== this.vinCharge)) this.demandeId = dem;
    if (vin && vin !== this.vinCharge) { this.elNiv.value = vin; this.charger(vin); }
    this.rendreDemande();
  };

  /* 27 oct. (Maxime : « l'envoi des évaluations à des évaluateurs par des représentants doit être simple ») : ouverte depuis
     une demande (?demande=DE-101), la page montre qui demande, pour quel client, et préremplit le km, le client et le
     conseiller s'ils sont vides ; l'évaluateur « prend » la demande en l'ouvrant ; « Enregistrer l'évaluation » la marque
     faite et le représentant reçoit la valeur (DemandesEval.gs). */
  Evaluation.prototype.rendreDemande = function () {
    var self = this, el = this.elDemande, id = this.demandeId;
    if (!el) return;
    AMX.vider(el);
    if (!id || !AMX.evalDemandes) return;
    AMX.evalDemandes.charger(false).then(function () {
      var x = AMX.evalDemandes.une(id);
      if (!x || self.demandeId !== id) return;
      self.demande = x;
      var dessiner = function (x) {
        /* 12 nov. (Maxime : « plein d'écrits partout… ») : une ligne — où en est la demande, qui l'a faite, le client, le km —
           et un seul gros bouton, celui de mon étape. Le reste (transférer, messages, refuser, renvoyer) dans « Actions ». */
        AMX.vider(el);
        var moi = (AMX.evalDemandes.enCache() || {}).moi || {};
        var argentD = function (v) { return v ? AMX.fmtArgent(v) : ''; };
        var priseAutre = x.prise && !x.pourMoi;
        var ouverte = x.etat === 'afaire' || x.etat === 'encours';
        var etiquette = x.etat === 'approbation' ? ['À approuver', 'violet'] : x.etat === 'aconfirmer' ? ['Montant à confirmer' + (x.valeurEvaluateur ? ' · ' + argentD(x.valeurEvaluateur) : ''), 'bleu']
          : x.etat === 'faite' ? [(x.circuit ? 'Valeur confirmée' : 'Valeur donnée') + (x.valeur ? ' · ' + argentD(x.valeur) : ''), 'vert'] : x.etat === 'refusee' ? ['Refusée', 'gris']
          : x.etat === 'annulee' ? ['Annulée', 'gris'] : priseAutre ? ['Prise par ' + (x.prisParNom || x.evaluateurNom || 'un autre évaluateur'), 'ambre'] : ['À évaluer', 'rouge'];
        var principal = null, autres = [];
        if (x.etat === 'approbation' && moi.diriger) {
          principal = h('button.btn.primaire', { type: 'button', text: 'Approuver', onclick: function () { AMX.evalDemandes.approuver(x.id); } });
          if (AMX.evalDemandes.refuser) autres.push({ texte: 'Refuser la demande', action: function () { AMX.evalDemandes.refuser(x.id); } });
        } else if (x.etat === 'aconfirmer' && moi.diriger) {
          principal = h('button.btn.primaire', { type: 'button', text: 'Confirmer le montant', onclick: function () { AMX.evalDemandes.confirmer(x.id); } });
          if (AMX.evalDemandes.renvoyer) autres.push({ texte: 'Renvoyer à l\'évaluateur', action: function () { AMX.evalDemandes.renvoyer(x.id); } });
        } else if (x.etat === 'faite' && AMX.evalDemandes.modifierMontant && (moi.diriger || (x.circuit !== 'directeur' && (x.pourMoi || moi.evaluateur)))) {
          /* 12 nov. (Maxime) : le montant donné se corrige d'un clic */
          autres.push({ texte: 'Modifier le montant', action: function () { AMX.evalDemandes.modifierMontant(x.id); } });
        } else if (ouverte && !priseAutre && (x.pourMoi || moi.evaluateur)) {
          principal = h('button.btn.primaire', { type: 'button', text: 'Envoyer la valeur', title: 'Enregistre l\'évaluation et envoie la valeur' + (x.circuit ? ' à la direction pour confirmation' : ''), onclick: function () { self.enregistrer(); } });
        }
        /* le bouton du bandeau remplace « Enregistrer l'évaluation » de l'en-tête (un seul bouton à l'écran) */
        if (self.btnEnregistrer) self.btnEnregistrer.style.display = principal && ouverte ? 'none' : '';
        if (ouverte && AMX.evalDemandes.transferer && (moi.direction || moi.evaluateur || x.pourMoi)) autres.push({ texte: 'Transférer à un autre évaluateur', action: function () { AMX.evalDemandes.transferer(x.id); } });
        if (AMX.evalDemandes.ouvrirFil && x.etat !== 'refusee' && x.etat !== 'annulee') autres.push({ texte: x.messages && x.messages.length ? 'Messages (' + x.messages.length + ')' : 'Question au représentant', action: function () { AMX.evalDemandes.ouvrirFil(x.id); } });
        if (AMX.evalDemandes.fiche) autres.push({ texte: 'Fiche de la demande', action: function () { AMX.evalDemandes.fiche(x.id); } });
        el.appendChild(h('div.eval-demande.' + x.etat, [
          h('span.badge.sans-point.' + etiquette[1], { text: etiquette[0], title: x.refusRaison || x.annuleRaison || '' }),
          h('span.eval-demande-txt', { text: ['Demande de ' + (x.demandeParNom || '—'), x.client || '', x.km ? AMX.fmtNombre(Number(x.km)) + ' km' : ''].filter(Boolean).join(' · ') }),
          x.note ? h('span.eval-demande-note', { text: '« ' + x.note + ' »' }) : null,
          x.renvoiRaison && ouverte ? h('span.badge.ambre.sans-point', { text: 'Renvoyée : ' + x.renvoiRaison }) : null,
          x.infoDemandee ? h('span.badge.ambre.sans-point', { text: 'Question en attente' }) : null,
          h('div.eval-demande-boutons', [autres.length && AMX.menuActions ? AMX.menuActions(autres, { petit: true }) : null, principal])
        ]));
      };
      dessiner(x);
      if (x.vin === self.vinCourant || !self.vinCourant) self.appliquerDemande();
      if (x.etat === 'afaire' && !(x.prise && !x.pourMoi) && (x.pourMoi || (AMX.evalDemandes.enCache() || {}).moi && AMX.evalDemandes.enCache().moi.evaluateur)) {
        /* 4 nov. : le premier qui la prend la fait — arrivé deuxième, le bandeau dit qui l'a prise */
        AMX.evalDemandes.prendre(id).then(function (r) { if (self.demandeId === id && r.demande) dessiner(r.demande); })
          .catch(function (e) { if (/Déjà prise/.test((e && e.message) || '')) { AMX.toast(e.message, 'attention', 6000); AMX.evalDemandes.charger(true).then(function () { var y = AMX.evalDemandes.une(id); if (y && self.demandeId === id) dessiner(y); }).catch(function () {}); } });
      }
      self.dessinerDemande = dessiner;
      if (!self.surDemandes) {   /* un message ou une réponse arrive : le bandeau suit */
        self.surDemandes = function () { var y = self.demandeId && AMX.evalDemandes.une(self.demandeId); if (y && self.dessinerDemande && self.elDemande && self.elDemande.isConnected) self.dessinerDemande(y); };
        document.addEventListener('amx:evalDemandes', self.surDemandes);
      }
    }).catch(function () {});
  };

  /* l'adresse garde la demande tant qu'on est sur son véhicule (un rechargement remontre le bandeau) */
  /* Ce que le représentant a inscrit dans sa demande (km, client, et depuis le 2 nov. le détail : client et état du véhicule)
     remplit les cases encore vides, jamais par-dessus. Appelé à l'arrivée de la demande et après chaque remplissage de la page
     (le chargement de l'évaluation peut arriver après la demande et vider les cases). */
  Evaluation.prototype.appliquerDemande = function () {
    var x = this.demande, self = this;
    if (!x || !this.elClient || (this.demandeId && x.id !== this.demandeId)) return;
    var vin = String(this.vinCourant || (this.elNiv && this.elNiv.value) || '').trim().toUpperCase();
    if (vin && x.vin !== vin) return;
    /* 12 nov. : la concession de l'évaluation est celle de la demande (avant : la concession choisie en haut) */
    var idCie = x.compagnie && AMX.COMPAGNIE_CONCESSION ? AMX.COMPAGNIE_CONCESSION[x.compagnie] : '';
    if (idCie && this.elConcession && this.elConcession.value !== idCie && Array.prototype.some.call(this.elConcession.options, function (o) { return o.value === idCie; }) && !this.sauvegarde) {
      this.elConcession.value = idCie; this.rendreCie();
    }
    var vide = function (el) { return el && !String(el.value || '').trim(); };
    var texte = function (el, v) { if (v && vide(el)) el.value = String(v); };
    var choix = function (el, v) { if (v && vide(el)) poserChoix(el, v); };
    if (x.km && vide(this.elKm)) { this.elKm.value = x.km; try { this.elKm.dispatchEvent(new Event('input')); } catch (e) {} }
    texte(this.elClient, x.client); texte(this.elClientTel, x.telephone); texte(this.elConseiller, x.demandeParNom);
    var d = x.detail || {}, s = d.suivi || {}, e = d.etatVehicule || {};
    texte(this.elClientCourriel, s.courriel); choix(this.elTypeClient, s.typeClient); choix(this.elLangue, s.langue);
    choix(this.elOrigine, s.origine); choix(this.elTransaction, s.transaction); texte(this.elCherche, s.cherche);
    choix(this.elEtatGeneral, e.general); choix(this.elCles, e.cles); texte(this.elCouleurExt, e.couleurExt); texte(this.elCouleurInt, e.couleurInt);
    choix(this.elPneusEte, e.pneusEte); choix(this.elPneusHiver, e.pneusHiver); texte(this.elPneusDim, e.pneusDim); choix(this.elPareBrise, e.pareBrise);
    choix(this.elAccident, e.accident); texte(this.elAccidentMontant, e.accidentMontant); choix(this.elFinancement, e.financement); texte(this.elSoldePret, e.soldePret);
    texte(this.elCarrosserie, e.carrosserie); texte(this.elVoyants, e.voyants);
    /* 12 nov. (Maxime : « les notes sur un véhicule doivent suivre partout ») : la note de la demande va dans les notes du
       véhicule de l'évaluation, qui suivent dans l'inventaire et la fiche d'achat */
    texte(this.elEtatNotes, [e.notes, x.note].filter(function (n, i, l) { return n && l.indexOf(n) === i; }).join(' — '));
    [['chipsConstats', 'constats'], ['chipsGaranties', 'garanties'], ['chipsOptions', 'options']].forEach(function (p) {
      var c = self[p[0]], l = e[p[1]];
      if (c && Array.isArray(l) && l.length && !c.get().length) c.set(l);
    });
    if (this.majChampsEtat) this.majChampsEtat();
  };
  Evaluation.prototype.paramsAdresse = function (vin) { var p = { vin: vin }; if (this.demandeId && (!this.demande || this.demande.vin === vin)) p.demande = this.demandeId; return p; };

  Evaluation.prototype.etat = function (texte) { this.elEtat.textContent = texte; };

  /* --------------------------- Construction ---------------------------- */
  Evaluation.prototype.construire = function () {
    var self = this;

    this.elEtat = h('p#eval-statut');   /* 12 nov. : plus de phrase d'explication — seulement l'état du moment, court */
    this.btnDecoder = h('button.btn#decode-btn', { type: 'button', html: I.scan + '<span>Décoder</span>', title: 'Décoder le NIV (année, marque, modèle, version)', onclick: function () { self.decoderDepuisChamp(); } });
    this.btnAnalyser = h('button.btn.primaire#analyser-btn', { type: 'button', html: I.recherche + '<span>Analyser le marché</span>', onclick: function () { self.analyser(self.pays, true); } });
    this.btnEnregistrer = h('button.btn#save-eval-btn', { type: 'button', html: I.ok + '<span>Enregistrer l\'évaluation</span>', onclick: function () { self.enregistrer(); } });
    // 21 oct. (Maxime : « un bouton effacer serait bon ») : visible quand l'évaluation existe et qu'on a le droit « Supprimer ».
    this.btnEffacer = h('button.btn.danger#effacer-eval-btn', { type: 'button', html: I.corbeille + '<span>Effacer</span>', title: 'Effacer cette évaluation du registre', style: { display: 'none' }, onclick: function () { self.effacer(); } });
    this.btnOffre = h('button.btn#offre-btn', { type: 'button', title: 'Feuille d\'offre d\'achat à imprimer ou enregistrer en PDF', html: I.telecharger + '<span>Feuille d\'offre</span>', onclick: function () { self.feuilleOffre(); } });
    this.elSauvegarde = h('div.eval-sauvegarde#eval-sauvegarde');
    var entete = h('div.entete-page', [
      h('div', { style: { minWidth: 0 } }, [h('div.eval-titre', [h('h1', 'Évaluation'), this.elCieBadge = h('span.badge.sans-point.eval-cie#eval-concession-badge', { title: 'Concession de cette évaluation (registre, marché local) — se change dans la carte Véhicule' })]), this.elEtat, this.elSauvegarde]),
      h('div.actions', (AMX.ui2 && AMX.ui2())
        /* v134 (nouvelle interface) ; 12 nov. (« plein d'écrits partout ») : un seul bouton, Enregistrer — l'analyse part
           toute seule ; la relancer, la feuille d'offre et Effacer vont dans « Actions » (les boutons gardent leur code). */
        ? [AMX.menuActions([{ bouton: this.btnAnalyser, texte: 'Relancer l\'analyse du marché' }, { texte: 'Feuille d\'offre (imprimer / PDF)', icone: I.telecharger, action: function () { self.feuilleOffre(); } }, { bouton: this.btnEffacer, texte: 'Effacer l\'évaluation' }]), this.btnEnregistrer]
        : [this.btnAnalyser, this.btnOffre, this.btnEnregistrer, this.btnEffacer])
    ]);
    this.rendreSauvegarde();

    // --- Sommaire fixe (sous la barre) : les chiffres clés + navigation ----
    this.elSommaire = h('div.eval-sommaire#eval-sommaire');

    // --- Véhicule (1er nov. : deux rangées serrées) -----------------------
    // Rangée 1 : NIV + Décoder, km, concession. Rangée 2 : année, marque, modèle, version, carrosserie.
    // L'ajustement $/km descend dans le panneau Marché (il ne sert qu'aux comparables).
    var cNiv = champ('e-niv', 'NIV', { mono: true, vin: true, placeholder: '17 caractères' });
    var cAnnee = champ('e-annee', 'Année', { type: 'number', inputmode: 'numeric' });
    var cMarque = champ('e-marque', 'Marque');
    var cModele = champ('e-modele', 'Modèle');
    var cVersion = champ('e-version', 'Version', { placeholder: 'LT, SLE, Limited…' });
    this.elStyle = h('select#e-style', { title: 'Carrosserie : seules les annonces de la même carrosserie servent de comparables' }, STYLES.map(function (x) { return h('option', { value: x[0], text: x[1] }); }));
    var cStyle = h('div.champ', [h('label', { 'for': 'e-style', text: 'Carrosserie' }), this.elStyle]);
    var cKm = champ('e-km', 'Kilométrage', { type: 'number', inputmode: 'numeric' });
    this.elTaux = h('input#e-taux-km', { type: 'number', step: '0.01', value: '0.10', inputmode: 'decimal', 'aria-label': 'Ajustement des comparables, en $ par km' });
    var concessionsEval = AMX.concessionsPour('evaluations');   // portée du domaine « évaluations » (accès supplémentaires compris)
    this.elConcession = h('select#e-concession', Object.keys(concessionsEval).map(function (k) {
      return h('option', { value: k, selected: k === 'stemarie' ? true : undefined, text: concessionsEval[k] });
    }));
    var cConcession = h('div.champ', [h('label', { 'for': 'e-concession', text: 'Concession' }), this.elConcession]);
    this.elNiv = cNiv.input; this.elMarque = cMarque.input; this.elModele = cModele.input; this.elVersion = cVersion.input;
    this.elAnnee = cAnnee.input; this.elKm = cKm.input;
    this.elContexte = h('div.eval-contexte.cache');
    this.elFiche = h('div.eval-fiche');            // « Créer la fiche d'achat » (rendreLiens)
    this.elCfx = h('div.eval-cfx'); this.cfxVin = '';   // 5 nov. : pastille CARFAX (accident déclaré ou non, rien de commandé)
    this.elLiens = h('div.eval-liens');            // panneau « CARFAX et liens »
    // Historique Torque du NIV (archive des évaluations importées de Torque) : rempli par AMX.torqueHistorique.
    this.elTorque = h('div.eval-sous-vehicule#eval-torque');
    this.torqueVin = '';
    // Vente où ce véhicule a servi d'échange (Livre des ventes, 21 oct.) : rempli par rendreVenteEchange.
    this.elEchange = h('div.eval-sous-vehicule#eval-vente-echange');
    this.echangeVin = '';
    var vehicule = h('div.carte#sec-vehicule', [h('div.carte-corps', [
      h('div.grille.eval-veh-1', [h('div.eval-niv', [cNiv.el, this.btnDecoder]), cKm.el, cConcession]),
      h('div.grille.eval-veh-2', [cAnnee.el, cMarque.el, cModele.el, cVersion.el, cStyle]),
      h('div.eval-veh-bas', [this.elContexte, this.elCfx, this.elFiche])
    ])]);

    // --- Prix : achat + frais = payé ; payé + recon + marge = détail -------
    var cAchat = champ('e-prix-achat', 'Prix d\'achat ($)', { type: 'number', inputmode: 'numeric', placeholder: 'Enchère / vendeur' });
    var cFrais = champ('e-frais', 'Frais ($)', { type: 'number', inputmode: 'numeric', placeholder: 'Encan, transport' });
    var cPaye = champ('e-prix-paye', 'Payé ($)', { type: 'number', inputmode: 'numeric', placeholder: '= achat + frais' });
    var cRecon = champ('e-recon', 'Recon ($)', { type: 'number', inputmode: 'numeric', placeholder: 'Remise en état' });
    var cMarge = champ('e-marge', 'Marge visée ($)', { type: 'number', inputmode: 'numeric', value: AMX.memo.lire('eval_marge', '2000') });
    var cPrix = champ('e-prix', 'Prix de détail ($)', { type: 'number', inputmode: 'numeric', placeholder: '= payé + recon + marge' });
    this.elAchat = cAchat.input; this.elFrais = cFrais.input; this.elPaye = cPaye.input; this.elRecon = cRecon.input; this.elMarge = cMarge.input; this.elPrix = cPrix.input;
    cPaye.el.classList.add('eval-champ-calcule'); cPrix.el.classList.add('eval-champ-calcule', 'eval-champ-detail');
    this.elDetailResume = h('div#eval-detail-resume');
    this.elCibles = h('div#eval-cibles');
    // Valeurs OpenLane (9 oct.) : ventes comparables et prévision Market guide du NIV — panneau « OpenLane ».
    this.elOpenlane = h('div.eval-valeurs.eval-openlane#eval-openlane.cache');
    this.construirePrixPlus();
    var detail = h('div.carte#sec-prix', [h('div.carte-corps', [h('div.eval-prix-grille', [
      h('div.eval-prix-calc', [
        h('div.eval-formule', [cAchat.el, h('span.op', '+'), cFrais.el, h('span.op', '='), cPaye.el]),
        h('div.eval-formule', [h('span.op.rappel', 'payé'), h('span.op', '+'), cRecon.el, h('span.op', '+'), cMarge.el, h('span.op', '='), cPrix.el]),
        this.elPrixPlus, this.elReconDetail,
        this.elDetailResume
      ]),
      this.elCibles
    ])])]);
    [this.elAchat, this.elFrais].forEach(function (el) { el.addEventListener('input', function () { self.recalculerDetail('achat'); }); });
    this.elPaye.addEventListener('input', function () { self.recalculerDetail('paye'); });
    this.elRecon.addEventListener('input', function () { self.recalculerDetail('couts'); });
    this.elMarge.addEventListener('input', function () { self.recalculerDetail('marge'); });
    this.elNiv.addEventListener('blur', function () {
      var vin = self.elNiv.value.trim();
      if (vin.length < 11) return;
      if (vin !== self.vinCharge) self.charger(vin);
    });
    this.elNiv.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); self.elNiv.blur(); } });
    this.elNiv.addEventListener('input', function () { self.rendreLiens(); });
    [this.elMarque, this.elModele, this.elAnnee].forEach(function (el) { el.addEventListener('input', AMX.debounce(function () { self.rendreSommaire(); self.chargerRappels(); }, 600)); });
    this.elKm.addEventListener('input', function () { self.rendreMarche(); self.rendreExport(); });
    this.elKm.addEventListener('change', function () { self.rendreOpenlane(); });
    this.elPrix.addEventListener('input', function () { self.recalculerDetail('prix'); self.elPrixType.value = 'manuel'; });
    this.elVersion.addEventListener('input', AMX.debounce(function () { if (self.analyses[self.pays]) self.rendreMarche(); }, 200));
    // La carrosserie change la recherche MarketCheck : on relance l'analyse du pays affiché.
    this.elStyle.addEventListener('change', function () { self.styleManuel = true; self.analyses = {}; self.planifierAuto(); if (self.parametresPrets()) self.analyser(self.pays, false); else self.rendreMarche(); });
    this.elConcession.addEventListener('change', function () { AMX.memo.ecrire('eval_concession', self.elConcession.value); self.oublierAnalyses(); self.rendreCie(); });
    var depart = this.concessionDepart();
    if (depart) this.elConcession.value = depart;
    this.rendreCie();
    // Toute modification des prix ou du véhicule est conservée d'office (1,5 s après la dernière frappe).
    [this.elAchat, this.elFrais, this.elPaye, this.elRecon, this.elMarge, this.elPrix, this.elKm, this.elTaux, this.elVersion, this.elMarque, this.elModele, this.elAnnee].forEach(function (el) { el.addEventListener('input', function () { self.planifierAuto(); }); });
    this.elConcession.addEventListener('change', function () { self.planifierAuto(); });

    // --- Analyse de marché ----------------------------------------------
    this.btnCa = h('button', { type: 'button', text: 'Canada', onclick: function () { self.choisirPays('ca'); } });
    this.btnUs = h('button', { type: 'button', text: 'États-Unis', onclick: function () { self.choisirPays('us'); } });
    this.elSegment = h('div.segment#eval-pays', [this.btnCa, this.btnUs]);
    this.btnRafraichir = h('button.btn.petit', { type: 'button', title: 'Relancer la recherche', html: I.rafraichir + '<span>Relancer</span>', onclick: function () { self.analyser(self.pays, true); } });
    this.elPortee = h('select.saisie#eval-portee', { 'aria-label': 'Portée géographique', style: { height: '28px', width: 'auto' } }, [
      h('option', { value: 'local', text: 'Autour de la concession (160 km)' }),
      h('option', { value: 'etat', text: 'Un État / une province' }),
      h('option', { value: 'national', text: 'Tout le pays' })
    ]);
    this.elPortee.addEventListener('change', function () {
      self.portee[self.pays] = porteeValide(self.elPortee.value, 'local');
      AMX.memo.ecrire('eval_portee_' + self.pays, self.portee[self.pays]);
      self.majSegment();
      self.relancerPortee();
    });
    // État américain (Pennsylvanie par défaut) ou province, quand la portée est « État / province ».
    this.elSelEtat = h('select.saisie#eval-etat', { 'aria-label': 'État ou province', style: { height: '28px', width: 'auto' } });
    this.elSelEtat.addEventListener('change', function () {
      if (!ETATS[self.pays][self.elSelEtat.value]) return;
      self.etats[self.pays] = self.elSelEtat.value;
      AMX.memo.ecrire('eval_etat_' + self.pays, self.etats[self.pays]);
      self.relancerPortee();
    });
    this.elMarche = h('div#eval-marche');
    var marche = carte(
      h('div.titre', [h('h2', 'Analyse de marché'), h('p', 'Annonces de concessionnaires et ventes des 90 derniers jours (MarketCheck).')]),
      [this.elMarche],
      h('div.droite', [this.elSegment, this.elPortee, this.elSelEtat, h('label.eval-taux-km', { title: 'Les prix des annonces sont ramenés au km de votre véhicule à ce taux' }, [h('span', 'Ajustement'), this.elTaux, h('span', '$/km')]), this.btnRafraichir])
    );
    marche.id = 'sec-marche';
    this.majSegment();

    this.elTaux.addEventListener('input', function () { self.rendreMarche(); self.rendreExport(); });

    // --- Client et suivi, état et photos (21 oct.) : ce qui remplace Torque au quotidien
    this.construireSuivi();

    // --- Canada ou États-Unis ? (8 oct.)
    this.elExport = h('div.carte#sec-export');
    this.construireExport();

    // --- 1er nov. (Maxime : « on prend beaucoup trop d'espace… des icônes principales qui défilent ; on clique pour voir ») :
    //     une rangée de tuiles sous le prix, un clic ouvre UN panneau, un 2e clic le ferme. Tout est fermé au départ.
    this.construireTuiles({ marche: marche });

    this.elDemande = h('div.eval-demande-zone');   /* 27 oct. : demande d'évaluation d'un représentant (demandes-eval.js) */
    this.el = h('div.page.eval-page', [entete, this.elDemande, this.elSommaire, vehicule, detail, this.elTuiles, this.elPanneaux]);
    this.rendreSommaire();
    this.rendreLiens();
    this.rendreExport();
  };

  /* ------------------ Rangée de tuiles et panneaux (1er nov.) ------------------
     Chaque tuile porte un petit chiffre (le % du marché et le rang, la valeur OpenLane, les rappels en rouge,
     le statut du suivi, les photos…) ; un clic ouvre son panneau sous la rangée, un 2e clic le ferme. Les
     panneaux sont les éléments déjà construits (montrés / cachés, jamais reconstruits) : toute la logique reste. */
  var ICO_ECHANGE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h13l-4-4"/><path d="M17 17H4l4 4"/></svg>';
  var ICO_HORLOGE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  var TUILES = [
    { id: 'ca', titre: 'Marché Canada', ico: '<b>CA</b>', panneau: 'marche' },
    { id: 'us', titre: 'Marché É.-U.', ico: '<b>US</b>', panneau: 'marche' },
    { id: 'export', titre: 'Canada ou É.-U. ?', ico: ICO_ECHANGE, panneau: 'export' },
    { id: 'openlane', titre: 'OpenLane', ico: I.resultat, panneau: 'openlane' },
    { id: 'suivi', titre: 'Client et suivi', ico: I.relance, panneau: 'suivi' },
    { id: 'etat', titre: 'État et photos', ico: I.photo, panneau: 'etat' },
    { id: 'rappels', titre: 'Rappels', ico: I.alerte, panneau: 'rappels' },
    { id: 'liens', titre: 'CARFAX et liens', ico: I.lien, panneau: 'liens' },
    { id: 'historique', titre: 'Historique', ico: ICO_HORLOGE, panneau: 'historique' }
  ];
  function tuileDe(id) { return TUILES.filter(function (t) { return t.id === id; })[0] || null; }

  Evaluation.prototype.construireTuiles = function (o) {
    var self = this;
    this.tuiles = {};
    this.elTuiles = h('div.eval-tuiles#eval-tuiles', { role: 'tablist', 'aria-label': 'Sections de l\'évaluation' });
    TUILES.forEach(function (t) {
      var c = h('span.c', '—');
      var b = h('button.eval-tuile', { type: 'button', role: 'tab', 'aria-selected': 'false', 'aria-controls': 'eval-p-' + t.panneau, 'data-tuile': t.id, onclick: function () { self.ouvrirTuile(t.id); } }, [
        h('span.ico', { html: t.ico }),
        h('span.txt', [h('span.t', { text: t.titre }), c])
      ]);
      self.tuiles[t.id] = { el: b, c: c };
      self.elTuiles.appendChild(b);
    });

    // Panneaux : un seul visible à la fois.
    this.elOpenlaneVide = h('p.eval-note', { text: 'Entrez un NIV complet : les ventes OpenLane et la prévision s\'affichent ici.' });
    var pOpenlane = h('div.carte#sec-openlane', [h('div.carte-corps', [this.elOpenlaneVide, this.elOpenlane])]);
    this.elRappelsCorps = h('div#eval-rappels');
    var pRappels = carte(h('div.titre', [h('h2', 'Rappels de sécurité'), h('p', 'NHTSA, par année, marque et modèle (pas par NIV).')]), [this.elRappelsCorps]);
    pRappels.id = 'sec-rappels';
    var pLiens = carte('CARFAX et liens', [this.elLiens]);
    pLiens.id = 'sec-liens';
    this.elHistVide = h('p.eval-note', { text: '' });
    var pHist = carte(h('div.titre', [h('h2', 'Historique de ce véhicule'), h('p', 'Évaluations faites dans Torque et vente où il a servi d\'échange.')]), [this.elTorque, this.elEchange, this.elHistVide]);
    pHist.id = 'sec-historique';
    var contenus = { marche: o.marche, export: this.elExport, openlane: pOpenlane, suivi: this.elSuiviCarte, etat: this.elEtatCarte, rappels: pRappels, liens: pLiens, historique: pHist };
    this.panneaux = {};
    this.elPanneaux = h('div.eval-panneaux#eval-panneaux');
    // Ordre des panneaux dans la page : Canada / É.-U. avant le marché (comme avant), le reste ensuite.
    ['suivi', 'etat', 'export', 'marche', 'openlane', 'rappels', 'liens', 'historique'].forEach(function (k) {
      var p = h('div.eval-panneau#eval-p-' + k, { role: 'tabpanel', hidden: 'hidden' }, [contenus[k]]);
      self.panneaux[k] = p;
      self.elPanneaux.appendChild(p);
    });
    // OpenLane se lit parfois après coup (lecture en direct) : la tuile suit ce qui s'affiche dans le panneau.
    if (window.MutationObserver) {
      var maj = AMX.debounce(function () { self.majTuiles(); }, 150);
      this.obsOpenlane = new MutationObserver(maj);
      this.obsOpenlane.observe(this.elOpenlane, { childList: true, subtree: true });
    }
  };

  // Ouvre la tuile (et son panneau) ; un 2e clic sur la même tuile ferme tout. opts.forcer : ne jamais fermer ;
  // opts.defiler : amener la rangée sous le sommaire (sauts du sommaire).
  Evaluation.prototype.ouvrirTuile = function (id, opts) {
    opts = opts || {};
    var self = this, t = tuileDe(id);
    if (!t) return;
    var fermer = this.tuileOuverte === id && !opts.forcer;
    if (!fermer && (id === 'ca' || id === 'us') && this.pays !== id) this.choisirPays(id);
    this.tuileOuverte = fermer ? '' : id;
    var panneau = fermer ? '' : t.panneau;
    Object.keys(this.panneaux).forEach(function (k) {
      if (k === panneau) self.panneaux[k].removeAttribute('hidden'); else self.panneaux[k].setAttribute('hidden', 'hidden');
    });
    // La boîte Canada / É.-U. est « ouverte » tant que son panneau l'est (l'analyse américaine part alors d'elle-même).
    var exOuvert = panneau === 'export';
    if (this.exportOuvert !== exOuvert) { this.exportOuvert = exOuvert; this.rendreExport(); }
    if (panneau === 'marche' && !this.analyses[this.pays] && !this.enCours[this.pays] && this.parametresPrets()) this.analyser(this.pays, false);
    this.majTuiles();
    var b = this.tuiles[id] && this.tuiles[id].el;
    if (!fermer && b && b.scrollIntoView) { try { b.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' }); } catch (e) {} }
    if (!fermer && opts.defiler && this.elTuiles.scrollIntoView) { try { this.elTuiles.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} }
  };

  // Les petits chiffres des tuiles (appelé à chaque rendu du sommaire, des rappels, des photos, de l'historique…).
  Evaluation.prototype.majTuiles = function () {
    if (!this.tuiles) return;
    var self = this;
    var vin = (this.vinCourant || this.elNiv.value || '').trim().toUpperCase();
    var vinOk = /^[A-HJ-NPR-Z0-9]{17}$/.test(vin);
    var poser = function (id, texte, ton, titre) {
      var x = self.tuiles[id]; if (!x) return;
      if (x.c.textContent !== texte) x.c.textContent = texte;
      x.el.className = 'eval-tuile' + (ton ? ' ' + ton : '') + (self.tuileOuverte === id ? ' actif' : '');
      x.el.setAttribute('aria-selected', self.tuileOuverte === id ? 'true' : 'false');
      x.el.title = titre || '';
    };
    // Marchés : % du marché et rang au Canada ; prix standard en $ US aux É.-U.
    ['ca', 'us'].forEach(function (p) {
      var a = self.analyses[p];
      if (self.enCours[p]) { poser(p, 'Analyse…', ''); return; }
      if (a && a.ok) {
        var c = self.calculs(a), n = (a.actifs && a.actifs.n) || 0;
        if (p === 'ca' && c.marchePct !== null && c.marchePct !== undefined) {
          var pos = c.marchePct;
          poser(p, pct(pos) + (c.rang ? ' · ' + c.rang + '/' + c.rangSur : ''), pos <= 0.97 ? 'vert' : (pos <= 1.03 ? 'ambre' : 'rouge'), '% du marché et rang de votre prix de détail parmi ' + n + ' annonces');
        } else if (c.standard) poser(p, p === 'us' ? AMX.fmtNombre(c.standard) + ' $ US' : fmt(c.standard), '', 'Prix standard (médiane ramenée à votre km), ' + n + ' annonces');
        else poser(p, n + ' annonce' + (n > 1 ? 's' : ''), 'gris');
        return;
      }
      if (a && !a.ok) { poser(p, 'Indisponible', 'gris', a.erreur || ''); return; }
      var sv = self.derniereSauvegarde;
      if (sv && sv.standard && ((sv.pays === 'us') === (p === 'us'))) { poser(p, (p === 'us' ? AMX.fmtNombre(sv.standard) + ' $ US' : fmt(sv.standard)), 'gris', 'Analyse conservée' + (sv.genereLe ? ' du ' + AMX.fmtDateCourte(sv.genereLe) : '') + ' — cliquez pour la relancer'); return; }
      poser(p, self.parametresPrets() ? 'À analyser' : '—', 'gris');
    });
    // Canada ou É.-U.
    if (!vinOk) poser('export', '—', 'gris');
    else {
      var us = (AMX.export.exportable(vin) || this.exportForce) ? this.usCollecter() : null;
      if (!us && !AMX.export.exportable(vin)) poser('export', 'Pas fabriqué É.-U.', 'gris', 'NIV pas fabriqué aux É.-U. : ouvrez le panneau pour comparer quand même');
      else if (us && us.alerteMmr) poser('export', 'Alerte MMR', 'rouge', 'Le marché É.-U. ne couvre pas le MMR de ' + (us.alerteMmrSeuil || 10) + ' %');
      else if (us && us.verdict) poser('export', AMX.export.texteVerdict(us), us.verdict === 'us' ? 'bleu' : (us.verdict === 'ca' ? 'vert' : (us.verdict === 'detail' ? 'ambre' : '')), AMX.export.texteProfits(us));
      else poser('export', AMX.export.exportable(vin) ? 'À comparer' : 'Pas fabriqué É.-U.', 'gris');
    }
    // OpenLane : la prévision, sinon la moyenne des ventes comparables.
    var ol = vinOk && AMX.openlane && AMX.openlane.valeur ? AMX.openlane.valeur(vin) : null;
    if ((!ol || !ol.luLe) && this.olValeur && this.olValeur.vin === vin) ol = this.olValeur;
    if (!vinOk) poser('openlane', '—', 'gris');
    else if (ol && ol.luLe) {
      var prev = nombre(ol.prevision), moy = nombre(ol.prixMoy);
      poser('openlane', prev !== null ? fmt(prev) : (moy !== null ? fmt(moy) : 'Aucune vente'), prev !== null || moy !== null ? 'bleu' : 'gris', prev !== null ? 'Prévision OpenLane' : (moy !== null ? 'Moyenne des ventes comparables OpenLane' : ''));
    } else poser('openlane', 'À lire', 'gris');
    // Client et suivi
    var st = statutSuivi(this.suiviStatut);
    if (st) poser('suivi', st[1], st[2]);
    else poser('suivi', (this.elClient && this.elClient.value.trim()) || 'À remplir', this.elClient && this.elClient.value.trim() ? '' : 'gris');
    // État et photos
    var gen = this.elEtatGeneral && this.elEtatGeneral.value ? ((ETAT_GENERAL.filter(function (x) { return x[0] === self.elEtatGeneral.value; })[0] || [])[1] || this.elEtatGeneral.value) : '';
    var nPh = this.nbPhotos;
    var accidentOui = this.elAccident && this.elAccident.value === 'oui';
    var etatRempli = this.chipsOptions ? !!this.collecterSuivi().etatVehicule : false;
    var etatTxt = [gen, accidentOui && !gen ? 'Accident' : '', nPh ? nPh + ' photo' + (nPh > 1 ? 's' : '') : ''].filter(Boolean).join(' · ') || (etatRempli ? 'Rempli' : '');
    poser('etat', etatTxt || 'À remplir', this.elAccident && this.elAccident.value === 'oui' ? 'rouge' : (etatTxt ? '' : 'gris'), this.elAccident && this.elAccident.value === 'oui' ? 'Accident déclaré' : '');
    // Rappels
    var r = this.rappels;
    if (!r) poser('rappels', '—', 'gris');
    else if (r.chargement) poser('rappels', '…', 'gris');
    else if (!r.ok) poser('rappels', 'Indisponibles', 'gris', r.erreur || '');
    else { var nR = (r.rappels || []).length; poser('rappels', nR ? nR + ' rappel' + (nR > 1 ? 's' : '') : 'Aucun', nR ? 'rouge' : 'vert'); }
    // CARFAX et liens
    var cfx = vinOk && AMX.carfax && AMX.carfax.lien ? AMX.carfax.lien(vin) : '';
    poser('liens', !vinOk ? '—' : (cfx ? 'Rapport CARFAX' : 'Pas de CARFAX'), cfx ? 'vert' : 'gris');
    // Historique : Torque + vente d'échange
    if (!vinOk) poser('historique', '—', 'gris');
    else if (this.nTorque === null || this.nEchanges === null) poser('historique', '…', 'gris');
    else {
      var parts = [];
      if (this.nTorque) parts.push(this.nTorque + ' Torque');
      if (this.nEchanges) parts.push(this.nEchanges > 1 ? this.nEchanges + ' échanges' : 'Échange');
      poser('historique', parts.join(' · ') || 'Rien', parts.length ? '' : 'gris');
    }
    if (this.elHistVide) this.elHistVide.textContent = (vinOk && this.nTorque === 0 && this.nEchanges === 0) ? 'Aucune évaluation Torque ni vente liée à ce NIV.' : (!vinOk ? 'Entrez un NIV complet.' : '');
  };

  /* ------------------- Canada ou États-Unis ? (8 oct.) --------------------
     Maxime : « pour les véhicules qui peuvent être exportés (NIV débutant par
     1, 4 et 5) on devrait avoir une boîte de comparaison pour déterminer si le
     véhicule est plus rentable à vendre aux États-Unis ou au Canada. Le calcul
     US est MMR (l'utilisateur met la valeur) × taux actuel (−3 %, qui peut
     varier) − 6 000 (à faire varier avec des flèches) = valeur wholesale pour
     les États-Unis. Le 6 000 se soustrait après la conversion ; on compare
     wholesale vs wholesale, et la marge potentielle détail Canada en plus. »
     Les champs sont construits une fois (construireExport) ; les résultats
     se redessinent à chaque frappe (rendreExport) sans toucher aux champs. */
  /* --------------------- Boîte « Canada ou États-Unis ? » ---------------------
     (8 oct., soir) Maxime : « pour la comparaison É.-U. / Canada / détail il faut
     comparer le PROFIT final : profit É.-U. = prix de vente É.-U. − prix payé ;
     profit Canada = gros Canada − prix payé ; détail = la marge déjà calculée.
     Réaligne la page, trop de cases ; pas tout le monde s'en sert. »
     → Boîte REPLIÉE par défaut (mémo par navigateur), deux cases visibles (MMR et
     gros Canada), le reste (taux, écart, ajustement, écart gros/détail) sous
     « Réglages ». Les champs sont construits une fois (construireExport) ; les
     résultats se redessinent à chaque frappe (rendreExport) sans toucher aux
     champs qui ont le focus.
     (9 oct.) 4e tuile « Marché É.-U. vs MMR » : la moyenne des annonces américaines
     ramenées au km (en $ US) doit dépasser le MMR de EXPORT_PARAMS.alerteMmrPct
     (10 %) — sinon la tuile, le résumé replié, le verdict et le sommaire passent au
     ROUGE. L'analyse américaine part d'elle-même dès qu'un MMR est tapé. */
  Evaluation.prototype.construireExport = function () {
    var self = this;
    this.exportOuvert = false;          // toujours repliée au chargement : il faut cliquer dessus pour l'ouvrir
    this.reglagesOuverts = false;
    // Les deux cases visibles
    var cMmr = champ('e-us-mmr', 'MMR ($ US)', { type: 'number', inputmode: 'numeric', placeholder: 'Valeur Manheim' });
    cMmr.el.classList.add('eval-export-champ-us');
    var cGros = champ('e-us-grosca', 'Gros Canada ($ CA)', { type: 'number', inputmode: 'numeric', placeholder: 'Encan / eBlock' });
    this.elUsMmr = cMmr.input; this.elUsGrosCA = cGros.input;
    // Réglages (repliés) : taux du jour, écart au taux, ajustement, écart gros / détail
    var cTaux = champ('e-us-taux', 'Taux USD→CAD du jour', { type: 'number', step: '0.0001', placeholder: '1,3650' });
    this.elUsTaux = cTaux.input;
    this.elUsEcart = h('input#e-us-ecart', { type: 'number', step: '0.5', inputmode: 'decimal', 'aria-label': 'Écart au taux, en %' });
    this.elUsAjust = h('input#e-us-ajust', { type: 'number', step: '500', inputmode: 'numeric', 'aria-label': 'Ajustement en $ CA' });
    this.elUsGrosPct = h('input#e-us-grospct', { type: 'number', step: '1', inputmode: 'decimal', 'aria-label': 'Écart gros / détail, en %' });
    var stepper = function (input, nom) {
      var pas = function () { var p = AMX.export.params(); return nom === 'ecart' ? (p.pasEcart || 0.5) : (nom === 'grospct' ? (p.pasGrosPct || 1) : (p.pasAjustement || 500)); };
      var defaut = function () { var p = AMX.export.params(); return nom === 'ecart' ? (p.ecartPct || 0) : (nom === 'grospct' ? (p.grosPct || 0) : (p.ajustement || 0)); };
      var bouger = function (sens) { var v = nombre(input.value); if (v === null) v = defaut(); v = Math.max(0, Math.round((v + sens * pas()) * 100) / 100); input.value = String(v); self.usModifie(nom); };
      return h('div.eval-stepper', [input, h('div.fleches', [h('button', { type: 'button', title: '+ pas', text: '▲', onclick: function () { bouger(1); } }), h('button', { type: 'button', title: '− pas', text: '▼', onclick: function () { bouger(-1); } })])]);
    };
    var cEcart = h('div.champ', [h('label', { 'for': 'e-us-ecart', text: 'Écart au taux (−%)' }), stepper(this.elUsEcart, 'ecart')]);
    var cAjust = h('div.champ', [h('label', { 'for': 'e-us-ajust', text: 'Ajustement ($ CA, après conversion)' }), stepper(this.elUsAjust, 'ajust')]);
    var cGrosPct = h('div.champ', [h('label', { 'for': 'e-us-grospct', text: 'Gros Canada estimé : marché − %' }), stepper(this.elUsGrosPct, 'grospct')]);
    this.elUsPrereglages = h('div.eval-export-prereglages');
    this.elUsTauxInfo = h('div.eval-export-taux');
    this.elUsReglages = h('div.eval-export-reglages', [h('div.eval-export-ligne', [cTaux.el, cEcart, cAjust, cGrosPct]), this.elUsPrereglages, this.elUsTauxInfo]);
    this.btnUsReglages = h('button.btn.fantome.petit#e-us-reglages', { type: 'button', onclick: function () { self.reglagesOuverts = !self.reglagesOuverts; self.rendreExport(); } });
    this.elUsChaine = h('div.eval-export-chaine');
    // Les trois colonnes de profit, construites une fois
    var col = function (cls, libelle) { var o = { el: null, v: h('div.v.num', '—'), s: h('div.s', '') }; o.el = h('div.eval-export-col.' + cls, [h('div.l', libelle), o.v, o.s]); return o; };
    this.colUs = col('us', 'Profit É.-U.'); this.colCa = col('ca', 'Profit gros Canada'); this.colDetail = col('detail', 'Profit détail Canada');
    // (9 oct. — Maxime) 4e tuile : la moyenne des annonces américaines ramenées au km doit dépasser le MMR de 10 %, sinon ROUGE.
    this.colMarche = col('marche', 'Marché É.-U. vs MMR');
    this.elUsCols = h('div.eval-export-cols', [this.colUs.el, this.colCa.el, this.colDetail.el, this.colMarche.el]);
    this.elUsVerdict = h('div.eval-export-verdict');
    this.elUsCorps = h('div.eval-export-corps', [
      h('div.eval-export-ligne.saisie', [cMmr.el, cGros.el, h('div.champ.reglages', [h('label', { text: ' ' }), this.btnUsReglages])]),
      this.elUsReglages, this.elUsChaine, this.elUsCols, this.elUsVerdict
    ]);
    this.elUsResume = h('div.eval-export-resume');
    this.btnUsMmr = h('a.btn.petit', { href: URL_MMR, target: '_blank', rel: 'noopener', title: 'Ouvrir Manheim MMR (le NIV est copié)', html: I.externe + '<span>Ouvrir MMR</span>', onclick: function () { if (self.vinCourant) AMX.copier(self.vinCourant); } });
    this.btnUsOuvrir = h('button.btn.petit#e-us-ouvrir', { type: 'button', onclick: function () { self.basculerExport(!self.exportOuvert); } });
    this.btnUsComparer = h('button.btn.petit', { type: 'button', text: 'Comparer quand même', onclick: function () { self.exportForce = true; self.basculerExport(true); self.majTuiles(); self.elUsMmr.focus(); } });
    this.elUsEtiquette = h('span.mini');
    // 1er nov. : la boîte s'ouvre et se ferme par sa tuile (« Canada ou É.-U. ? ») — plus de bouton Comparer / Fermer ici.
    this.btnUsOuvrir.style.display = 'none';
    this.elUsTete = h('div.eval-export-tete', [h('h2', 'Canada ou États-Unis ?'), this.elUsEtiquette, h('div.droite', [this.btnUsMmr])]);
    this.elExport.appendChild(h('div.carte-corps', [this.elUsTete, this.elUsResume, this.elUsCorps]));
    var champs = [[this.elUsMmr, 'mmr'], [this.elUsTaux, 'taux'], [this.elUsEcart, 'ecart'], [this.elUsAjust, 'ajust'], [this.elUsGrosPct, 'grospct']];
    champs.forEach(function (c) { c[0].addEventListener('input', function () { self.usModifie(c[1]); }); });
    this.elUsGrosCA.addEventListener('input', function () { self.us.grosCA = self.elUsGrosCA.value; self.us.grosCASource = self.elUsGrosCA.value ? 'saisie' : ''; self.rendreExport(); self.planifierAuto(); });
  };

  Evaluation.prototype.basculerExport = function (ouvrir) {
    this.exportOuvert = !!ouvrir;
    this.rendreExport();
  };

  Evaluation.prototype.usModifie = function (quoi) {
    if (quoi === 'mmr') this.us.mmr = this.elUsMmr.value;
    else if (quoi === 'taux') { this.us.taux = nombre(this.elUsTaux.value); this.us.tauxSource = 'saisie'; this.us.tauxDate = ''; }
    else if (quoi === 'ecart') this.us.ecartPct = nombre(this.elUsEcart.value);
    else if (quoi === 'ajust') this.us.ajustement = nombre(this.elUsAjust.value);
    else if (quoi === 'grospct') this.us.grosPct = nombre(this.elUsGrosPct.value);
    this.rendreExport();
    this.planifierAuto();
  };

  // Les valeurs effectives : ce que l'utilisateur a réglé, sinon les paramètres du serveur et le taux du jour.
  Evaluation.prototype.usEffectif = function () {
    var p = AMX.export.params(), t = AMX.export.taux();
    var taux = this.us.taux !== null && this.us.taux !== undefined ? this.us.taux : (t && t.ok ? t.taux : null);
    var ecart = this.us.ecartPct !== null && this.us.ecartPct !== undefined ? this.us.ecartPct : p.ecartPct;
    var ajust = this.us.ajustement !== null && this.us.ajustement !== undefined ? this.us.ajustement : p.ajustement;
    var tauxSource = this.us.taux !== null && this.us.taux !== undefined ? 'saisie' : (t && t.ok ? t.source : '');
    var tauxDate = this.us.taux !== null && this.us.taux !== undefined ? '' : (t && t.ok ? t.date : '');
    return { taux: taux, ecartPct: ecart, ajustement: ajust, tauxSource: tauxSource, tauxDate: tauxDate };
  };

  // Écart gros / détail effectif (%) : réglé pour ce NIV, sinon le paramètre (15 % par défaut).
  Evaluation.prototype.usGrosPct = function () {
    var p = AMX.export.params();
    return this.us.grosPct !== null && this.us.grosPct !== undefined ? this.us.grosPct : (p.grosPct !== undefined && p.grosPct !== null ? p.grosPct : 15);
  };
  // Marché standard Canada (MarketCheck) : l'analyse en page, sinon celle conservée avec l'évaluation.
  Evaluation.prototype.usStandardCA = function () {
    var a = this.analyses.ca, c = (a && a.ok) ? this.calculs(a) : null;
    if (c && c.standard) return c.standard;
    var sv = this.derniereSauvegarde;
    if (sv && sv.pays !== 'us' && sv.standard) return sv.standard;
    return null;
  };
  // Gros Canada : la saisie (encan / eBlock), sinon l'ESTIMÉ MarketCheck (marché standard − écart gros/détail %).
  // Maxime, 8 oct. : « utiliser MarketCheck » ; 1er nov. : VinAudit retiré.
  Evaluation.prototype.usGrosCA = function () {
    if (this.us.grosCA !== '' && this.us.grosCA !== null && this.us.grosCA !== undefined && nombre(this.us.grosCA) !== null) return { valeur: nombre(this.us.grosCA), source: this.us.grosCASource || 'saisie', estime: false };
    var std = this.usStandardCA(), pct = this.usGrosPct();
    if (std !== null) return { valeur: Math.round(std * (1 - pct / 100)), source: 'MarketCheck ' + fmt(std) + ' − ' + pct + ' % (estimé)', estime: true, base: std, pct: pct };
    return { valeur: null, source: '', estime: false };
  };

  /* Marché américain « pondéré au km » (9 oct.) : la moyenne des prix des annonces É.-U. ramenés au kilométrage
     du véhicule (mêmes règles que les cibles : prix − (km véhicule − km annonce) × taux, filtres de la page),
     en $ US comme le MMR. Sans analyse en page : celle conservée avec l'évaluation si elle était américaine. */
  Evaluation.prototype.usMarcheUS = function () {
    var a = this.analyses.us;
    if (a && a.ok) {
      var liste = this.annoncesRetenues(a);
      var ajustes = liste.map(function (x) { return x.ajuste; }).filter(function (v) { return v !== null && v !== undefined && !isNaN(v); });
      if (ajustes.length) return { moyenne: Math.round(moyenne(ajustes)), n: ajustes.length, source: ajustes.length + ' annonce' + (ajustes.length > 1 ? 's' : '') + ' au km', vivant: true };
      var st = a.actifs && a.actifs.prix;
      if (st && st.moyenne) return { moyenne: Math.round(st.moyenne), n: (a.actifs && a.actifs.n) || 0, source: 'moyenne du marché', vivant: true };
      return null;
    }
    var sv = this.derniereSauvegarde;
    if (sv && sv.pays === 'us' && sv.standard) return { moyenne: Math.round(sv.standard), n: (sv.actifs && sv.actifs.n) || 0, source: 'analyse conservée' + (sv.genereLe ? ' du ' + AMX.fmtDateCourte(sv.genereLe) : ''), vivant: false };
    return null;
  };
  // Seuil : paramètre EXPORT_PARAMS.alerteMmrPct (10 % par défaut). pct = moyenne É.-U. ÷ MMR − 1 ; alerte si pct < seuil.
  Evaluation.prototype.usAlerteMmr = function (mmr) {
    var p = AMX.export.params();
    var seuil = (p.alerteMmrPct !== undefined && p.alerteMmrPct !== null && nombre(p.alerteMmrPct) !== null) ? nombre(p.alerteMmrPct) : 10;
    var m = this.usMarcheUS(), mmrN = nombre(mmr);
    var out = { seuil: seuil, marche: m, mmr: mmrN, pct: null, alerte: null };
    if (m && m.moyenne && mmrN) { out.pct = Math.round((m.moyenne / mmrN - 1) * 1000) / 10; out.alerte = out.pct < seuil; }
    return out;
  };
  // Dès qu'un MMR est tapé et que la boîte est ouverte, l'analyse américaine part d'elle-même (une fois par NIV) :
  // on ne peut pas juger le MMR sans le marché É.-U. Un appel MarketCheck de plus par évaluation comparée.
  Evaluation.prototype.usAssurerAnalyseUS = function () {
    var vin = (this.vinCourant || this.elNiv.value || '').trim().toUpperCase();
    if (!this.exportOuvert || !this.us.mmr || !vin) return;
    if ((this.analyses.us && this.analyses.us.ok) || this.enCours.us || this.usAutoUS === vin || !this.parametresPrets()) return;
    this.usAutoUS = vin;
    this.analyser('us', false);
  };

  // Marge potentielle détail Canada : prix de détail visé (sinon marché standard) − payé − recon.
  Evaluation.prototype.usMargeDetail = function () {
    var paye = nombre(this.elPaye.value), recon = nombre(this.elRecon.value) || 0, prix = nombre(this.elPrix.value);
    var base = prix !== null ? prix : this.usStandardCA();
    if (base === null || base === undefined || paye === null) return { valeur: null, base: base, source: prix !== null ? 'votre détail' : 'marché standard' };
    return { valeur: Math.round(base - paye - recon), base: base, source: prix !== null ? 'votre détail' : 'marché standard' };
  };

  // Les trois profits : É.-U. (gros É.-U. − payé), gros Canada (gros Canada − payé), détail (marge déjà calculée).
  Evaluation.prototype.usProfits = function () {
    var e = this.usEffectif();
    var c = AMX.export.calculer(this.us.mmr, e.taux, e.ecartPct, e.ajustement);
    var paye = nombre(this.elPaye.value);
    var gca = this.usGrosCA(), md = this.usMargeDetail();
    var profitUS = (c.grosUS !== null && paye !== null) ? Math.round(c.grosUS - paye) : null;
    var profitCA = (gca.valeur !== null && paye !== null) ? Math.round(gca.valeur - paye) : null;
    var v = AMX.export.verdict(profitUS, profitCA, md.valeur);
    return { e: e, c: c, paye: paye, gca: gca, md: md, profitUS: profitUS, profitCA: profitCA, profitDetail: md.valeur, v: v };
  };

  // Le bloc conservé avec l'évaluation (registre, suivi service, fiche d'achat).
  Evaluation.prototype.usCollecter = function () {
    var r = this.usProfits(), c = r.c, gca = r.gca, md = r.md, v = r.v;
    if (c.grosUS === null && gca.valeur === null && !this.us.mmr) return null;
    var al = this.usAlerteMmr(c.mmr);
    return { mmr: c.mmr, taux: r.e.taux, tauxDate: r.e.tauxDate, tauxSource: r.e.tauxSource, ecartPct: c.ecartPct, tauxAjuste: c.tauxAjuste, converti: c.converti, ajustement: c.ajustement,
      grosUS: c.grosUS, grosCA: gca.valeur, grosCASource: gca.source, grosCAEstime: !!gca.estime, grosPct: this.usGrosPct(),
      marcheUS: al.marche ? al.marche.moyenne : null, marcheUSn: al.marche ? al.marche.n : null, marcheUSPct: al.pct, alerteMmr: al.alerte === true, alerteMmrSeuil: al.seuil,
      paye: r.paye, profitUS: r.profitUS, profitCA: r.profitCA, profitDetail: r.profitDetail, margeDetailCA: md.valeur, margeDetailBase: md.base,
      meilleur: v.meilleur, second: v.second, ecart: v.ecart, verdict: v.verdict, calculeLe: new Date().toISOString() };
  };

  Evaluation.prototype.rendreExport = function () {
    var self = this; if (!this.elExport) return;
    var vin = (this.vinCourant || this.elNiv.value || '').trim().toUpperCase();
    var p = AMX.export.params();
    var exportable = AMX.export.exportable(vin);
    var montrer = exportable || this.exportForce;
    this.exportDisponible = montrer;
    // (8 oct., soir — Maxime) pas de phrases d'explication (« NIV en 1, 4, 5 »…) ; un NIV pas fabriqué aux É.-U.
    // n'a que le bouton « Comparer quand même ». (1er nov.) La boîte vit dans le panneau de sa tuile.
    this.elExport.classList.toggle('eval-export-repliee', !montrer);
    this.elExport.classList.toggle('eval-export-ouverte', montrer && this.exportOuvert);
    AMX.vider(this.elUsResume);
    this.elUsEtiquette.textContent = vin ? (exportable ? 'Fabriqué aux É.-U.' : 'Pas fabriqué aux É.-U.') : '';
    if (!montrer) {
      this.elUsCorps.style.display = 'none'; this.btnUsOuvrir.style.display = 'none'; this.btnUsMmr.style.display = 'none';
      if (vin) this.elUsResume.appendChild(this.btnUsComparer);
      else this.elUsResume.appendChild(h('span.doux', { text: 'Entrez le NIV pour comparer les profits (É.-U., gros Canada, détail).' }));
      this.rendreSommaire();
      return;
    }
    var r = this.usProfits(), e = r.e, c = r.c, gca = r.gca, md = r.md, v = r.v;
    this.btnUsOuvrir.style.display = 'none';
    this.btnUsMmr.style.display = this.exportOuvert ? '' : 'none';
    if (!this.exportOuvert) {
      // Repliée (par défaut) : une ligne — le verdict s'il existe, sinon l'invitation.
      this.elUsCorps.style.display = 'none';
      var alR = this.usAlerteMmr(c.mmr);
      if (alR.alerte) this.elUsResume.appendChild(h('span.badge.rouge', { text: 'Marché É.-U. ' + (alR.pct >= 0 ? '+' : '') + alR.pct + ' % vs MMR (seuil ' + alR.seuil + ' %)' }));
      if (v.verdict) {
        this.elUsResume.appendChild(h('span.badge.' + AMX.export.classeVerdict(v), { text: AMX.export.phraseVerdict(v) }));
        this.elUsResume.appendChild(h('span', { text: AMX.export.texteProfits(v) }));
      } else if (!alR.alerte) {
        this.elUsResume.appendChild(h('span', { text: 'Cliquez pour comparer les profits (É.-U., gros Canada, détail).' }));
      }
      this.rendreSommaire();
      return;
    }
    this.elUsCorps.style.display = '';
    this.usAssurerAnalyseUS();
    // Champs : on ne touche à un champ que s'il n'a pas le focus (sinon la frappe est cassée).
    var poser = function (el, val) { if (document.activeElement === el) return; var s = (val === null || val === undefined) ? '' : String(val); if (el.value !== s) el.value = s; };
    poser(this.elUsMmr, this.us.mmr);
    poser(this.elUsTaux, e.taux !== null ? e.taux.toFixed(4) : '');
    poser(this.elUsEcart, e.ecartPct);
    poser(this.elUsAjust, e.ajustement);
    poser(this.elUsGrosPct, this.usGrosPct());
    poser(this.elUsGrosCA, this.us.grosCA !== '' && this.us.grosCA !== null ? this.us.grosCA : '');
    if (this.us.grosCA === '' || this.us.grosCA === null) this.elUsGrosCA.placeholder = gca.valeur !== null ? fmt(gca.valeur) + (gca.estime ? ' (estimé)' : '') : 'Encan / eBlock';
    // Réglages : un résumé sur une ligne, les champs seulement si on ouvre.
    var t = AMX.export.taux();
    this.btnUsReglages.textContent = (this.reglagesOuverts ? 'Fermer les réglages' : 'Réglages') + ' : taux ' + (e.taux !== null ? e.taux.toFixed(4) : '—') + ' − ' + e.ecartPct + ' % · − ' + fmt(e.ajustement) + ' · gros estimé − ' + this.usGrosPct() + ' %';
    this.elUsReglages.style.display = this.reglagesOuverts ? '' : 'none';
    AMX.vider(this.elUsPrereglages);
    var pre = function (txt, pct, actif) { return h('button.btn' + (actif ? '.primaire' : '.fantome'), { type: 'button', text: txt + ' ' + pct + ' %', onclick: function () { self.elUsEcart.value = String(pct); self.usModifie('ecart'); } }); };
    this.elUsPrereglages.appendChild(h('span', { text: 'Écart au taux :' }));
    this.elUsPrereglages.appendChild(pre('Achat', p.ecartAchatPct, e.ecartPct === p.ecartAchatPct));
    this.elUsPrereglages.appendChild(pre('Échange', p.ecartEchangePct, e.ecartPct === p.ecartEchangePct && p.ecartEchangePct !== p.ecartAchatPct));
    this.elUsPrereglages.appendChild(h('span.doux', { text: '· flèches : ' + (p.pasEcart || 0.5) + ' %, ' + fmt(p.pasAjustement || 500) + ' et ' + (p.pasGrosPct || 1) + ' %' }));
    AMX.vider(this.elUsTauxInfo);
    if (e.tauxSource === 'saisie') this.elUsTauxInfo.appendChild(h('span', { text: 'Taux tapé à la main' + (t && t.ok ? ' · Banque du Canada ' + t.taux.toFixed(4) + (t.date ? ' (' + t.date + ')' : '') : '') }));
    else if (t && t.ok) this.elUsTauxInfo.appendChild(h('span', { text: 'Banque du Canada ' + (t.date ? 'le ' + t.date : '') + (t.source === 'dernier' ? ' (dernier taux reçu)' : (t.source === 'manuel' ? ' (taux manuel du propriétaire)' : '')) }));
    else this.elUsTauxInfo.appendChild(h('span.puce.attention', { text: 'Taux du jour indisponible' }));
    if (e.tauxSource === 'saisie' && t && t.ok) this.elUsTauxInfo.appendChild(h('button.btn.fantome.petit', { type: 'button', text: 'Reprendre le taux du jour', onclick: function () { self.us.taux = null; self.us.tauxSource = ''; self.rendreExport(); self.planifierAuto(); } }));
    if (p.premierEncan) this.elUsTauxInfo.appendChild(h('span.doux', { text: '· premier encan US ' + AMX.fmtDate(p.premierEncan) + (p.derniereExpedition ? ', dernières expéditions ' + AMX.fmtDate(p.derniereExpedition) : '') }));
    // La chaîne du calcul É.-U., en clair
    AMX.vider(this.elUsChaine);
    if (c.grosUS !== null) {
      this.elUsChaine.appendChild(h('span', { text: 'Prix de vente É.-U. : ' + AMX.fmtNombre(c.mmr) + ' $ US × ' + c.tauxAjuste.toFixed(4) + ' (' + c.taux.toFixed(4) + ' − ' + c.ecartPct + ' %) = ' + fmt(c.converti) + ' − ' + fmt(c.ajustement) + ' = ' }));
      this.elUsChaine.appendChild(h('b', { text: fmt(c.grosUS) + ' CA' }));
    } else this.elUsChaine.appendChild(h('span.doux', { text: c.taux === null ? 'Taux du jour indisponible : tapez-le dans les réglages.' : 'Entrez le MMR ($ US).' }));
    // Trois colonnes : profit É.-U. | profit gros Canada | profit détail Canada
    var payeTexte = r.paye !== null ? fmt(r.paye) : 'prix payé ?';
    this.colUs.el.classList.toggle('gagnant', v.verdict === 'us'); this.colUs.v.textContent = fmt(r.profitUS);
    this.colUs.s.textContent = c.grosUS !== null ? (r.paye !== null ? fmt(c.grosUS) + ' − payé ' + payeTexte : 'Prix payé à entrer') : 'MMR à entrer';
    this.colCa.el.classList.toggle('gagnant', v.verdict === 'ca'); this.colCa.el.classList.toggle('estime', !!gca.estime); this.colCa.v.textContent = fmt(r.profitCA);
    this.colCa.s.textContent = gca.valeur !== null ? ((gca.estime ? '≈ ' : '') + fmt(gca.valeur) + ' − payé ' + payeTexte + (gca.estime ? ' · estimé : ' + gca.source : ' · ' + gca.source)) : 'Tapez la valeur de gros (encan / eBlock), ou lancez l\'analyse de marché : MarketCheck donne un gros estimé.';
    this.colDetail.el.classList.toggle('gagnant', v.verdict === 'detail'); this.colDetail.v.textContent = fmt(md.valeur);
    this.colDetail.s.textContent = md.valeur !== null ? md.source + ' ' + fmt(md.base) + ' − payé − recon' : 'Prix payé + prix de détail (ou analyse de marché) pour la calculer';
    // 4e tuile : marché É.-U. (moyenne des annonces au km, $ US) face au MMR — ROUGE sous le seuil.
    var al = this.usAlerteMmr(c.mmr);
    this.colMarche.el.classList.toggle('alerte', al.alerte === true);
    this.colMarche.el.classList.toggle('ok', al.alerte === false);
    AMX.vider(this.colMarche.s);
    if (al.pct !== null) {
      this.colMarche.v.textContent = (al.pct >= 0 ? '+' : '') + AMX.fmtNombre(al.pct) + ' %';
      this.colMarche.s.appendChild(h('span', { text: 'moyenne ' + AMX.fmtNombre(al.marche.moyenne) + ' $ US (' + al.marche.source + ') vs MMR ' + AMX.fmtNombre(al.mmr) + ' $ US · seuil + ' + al.seuil + ' %' + (al.alerte ? ' — le marché ne couvre pas le MMR' : '') }));
    } else {
      this.colMarche.v.textContent = '—';
      if (c.mmr === null) this.colMarche.s.appendChild(h('span', { text: 'MMR à entrer : la moyenne des annonces É.-U. doit le dépasser de ' + al.seuil + ' %.' }));
      else if (this.enCours.us) this.colMarche.s.appendChild(h('span', { text: 'Analyse du marché américain en cours…' }));
      else {
        this.colMarche.s.appendChild(h('span', { text: 'Marché américain à analyser (seuil + ' + al.seuil + ' % du MMR).' }));
        this.colMarche.s.appendChild(h('button.btn.petit', { type: 'button', text: 'Analyser le marché américain', onclick: function () { self.usAutoUS = ''; self.analyser('us', true); } }));
      }
    }
    AMX.vider(this.elUsVerdict);
    if (al.alerte) this.elUsVerdict.appendChild(h('span.badge.rouge', { text: 'Alerte : marché É.-U. ' + (al.pct >= 0 ? '+' : '') + al.pct + ' % vs MMR, sous le seuil de ' + al.seuil + ' %' }));
    if (v.verdict) {
      this.elUsVerdict.appendChild(h('span.badge.' + AMX.export.classeVerdict(v), { text: AMX.export.phraseVerdict(v) }));
      this.elUsVerdict.appendChild(h('span', { text: AMX.export.texteProfits(v) }));
    } else this.elUsVerdict.appendChild(h('span.doux', { text: r.paye === null ? 'Le verdict compare les profits : il faut le prix payé (section Prix).' : 'Le verdict apparaît dès que deux profits sont connus (É.-U., gros Canada, détail).' }));
    this.rendreSommaire();
  };

  /* --------------------------- Prix de détail ---------------------------- */
  // source : 'couts' (payé ou recon changé), 'marge', 'prix' (détail tapé à la main).
  // source : 'achat' (achat ou frais changé), 'paye' (payé tapé directement),
  // 'couts' (recon), 'marge', 'prix' (détail tapé à la main → marge déduite).
  Evaluation.prototype.recalculerDetail = function (source) {
    var achat = nombre(this.elAchat.value), frais = nombre(this.elFrais.value) || 0;
    if (source === 'achat') {
      if (achat !== null) this.elPaye.value = String(Math.round(achat + frais));
      else if (!this.elFrais.value.trim()) this.elPaye.value = '';
    } else if (source === 'paye') {
      var payeTape = nombre(this.elPaye.value);
      if (payeTape !== null) this.elAchat.value = String(Math.round(payeTape - frais)); else this.elAchat.value = '';
    }
    var paye = nombre(this.elPaye.value), recon = nombre(this.elRecon.value) || 0, marge = nombre(this.elMarge.value), prix = nombre(this.elPrix.value);
    if (source === 'prix') {
      if (paye !== null && prix !== null) this.elMarge.value = String(Math.round(prix - paye - recon));
    } else if (paye !== null && marge !== null) {
      this.elPrix.value = String(Math.round(paye + recon + marge));
    }
    if (source === 'marge' && marge !== null) AMX.memo.ecrire('eval_marge', String(marge));
    this.rendreMarche();
    this.rendreExport();
  };

  /* 1er nov. (Torque, points 6 et 7) : le recon par poste — quand un poste est rempli, le recon est leur somme —
     et le prix retenu (manuel / agressif / standard / conservateur) avec une note. Gardés dans `reconDetail`,
     `prixType`, `prixNote`. */
  Evaluation.prototype.construirePrixPlus = function () {
    var self = this;
    this.reconPostes = {};
    this.elReconDetail = h('div.eval-recon-detail.cache#eval-recon-detail', RECON_POSTES.map(function (p) {
      var c = champ('e-recon-' + p[0], p[1], { type: 'number', inputmode: 'numeric', placeholder: '0' });
      self.reconPostes[p[0]] = c.input;
      c.input.addEventListener('input', function () { self.reconDetailModifie(); });
      return c.el;
    }));
    this.btnReconDetail = h('button.btn.fantome.petit#eval-recon-detailler', { type: 'button', 'aria-expanded': 'false', 'aria-controls': 'eval-recon-detail', text: 'Détailler le recon ▸', onclick: function () { self.basculerReconDetail(); } });
    this.elPrixType = h('select#e-prix-type', [h('option', { value: '', text: '—' })].concat(PRIX_TYPES.map(function (o) { return h('option', { value: o[0], text: o[1] }); })));
    this.elPrixNote = h('input#e-prix-note', { type: 'text', autocomplete: 'off', placeholder: 'Note sur le prix', 'aria-label': 'Note sur le prix' });
    this.elPrixPlus = h('div.eval-prix-plus', [this.btnReconDetail, h('label.eval-prix-type', [h('span', 'Prix retenu'), this.elPrixType]), this.elPrixNote]);
    this.elPrixType.addEventListener('change', function () { self.planifierAuto(); });
    this.elPrixNote.addEventListener('input', function () { self.planifierAuto(); });
  };
  Evaluation.prototype.basculerReconDetail = function (ouvrir) {
    var o = ouvrir === undefined ? this.elReconDetail.classList.contains('cache') : !!ouvrir;
    this.elReconDetail.classList.toggle('cache', !o);
    this.btnReconDetail.setAttribute('aria-expanded', o ? 'true' : 'false');
    this.btnReconDetail.textContent = o ? 'Détail du recon ▾' : 'Détailler le recon ▸';
  };
  Evaluation.prototype.reconDetail = function () {
    var self = this, d = {}, total = 0, n = 0;
    RECON_POSTES.forEach(function (p) { var v = nombre(self.reconPostes[p[0]].value); if (v !== null) { d[p[0]] = String(v); total += v; n++; } });
    return { postes: n ? d : null, total: n ? Math.round(total) : null };
  };
  Evaluation.prototype.reconDetailModifie = function () {
    var r = this.reconDetail();
    var calcule = r.total !== null;
    this.elRecon.readOnly = calcule;
    this.elRecon.parentNode.classList.toggle('eval-champ-calcule', calcule);
    this.elRecon.title = calcule ? 'Somme des postes du détail du recon' : '';
    if (calcule) { this.elRecon.value = String(r.total); this.recalculerDetail('couts'); this.planifierAuto(); }
  };
  Evaluation.prototype.poserReconDetail = function (d) {
    var self = this;
    d = (d && typeof d === 'object') ? d : {};
    RECON_POSTES.forEach(function (p) { self.reconPostes[p[0]].value = d[p[0]] === null || d[p[0]] === undefined ? '' : String(d[p[0]]); });
    var rempli = this.reconDetail().total !== null;
    this.elRecon.readOnly = rempli;
    this.elRecon.parentNode.classList.toggle('eval-champ-calcule', rempli);
    this.basculerReconDetail(rempli);
  };

  // « Prendre ce prix » (suggestion d'un utilisateur, 9 oct.) : le prix de détail choisi (agressif / standard /
  // conservateur) donne le prix d'ACHAT à ne pas dépasser pour garder la marge visée et le reconditionnement :
  // achat = prix − marge − recon − frais (payé = achat + frais). Sans marge inscrite : ancienne règle (marge déduite).
  Evaluation.prototype.prendrePrix = function (v, type) {
    this.elPrix.value = String(Math.round(v));
    if (type) this.elPrixType.value = type;
    var marge = nombre(this.elMarge.value);
    if (marge === null) { this.recalculerDetail('prix'); return; }
    var recon = nombre(this.elRecon.value) || 0, frais = nombre(this.elFrais.value) || 0;
    var achatMax = Math.round(v - marge - recon - frais);
    this.elAchat.value = String(achatMax);
    this.recalculerDetail('achat');   // payé = achat + frais, détail = payé + recon + marge (= le prix pris), puis rendu
    this.planifierAuto();
    AMX.toast('Prix d\'achat calculé : ' + fmt(achatMax) + ' = ' + fmt(v) + ' − ' + fmt(marge) + ' de marge − ' + fmt(recon) + ' recon − ' + fmt(frais) + ' frais', 'ok');
  };

  Evaluation.prototype.rendrePrixDetail = function () {
    var self = this;
    AMX.vider(this.elDetailResume); AMX.vider(this.elCibles);
    var achat = nombre(this.elAchat.value), frais = nombre(this.elFrais.value) || 0, paye = nombre(this.elPaye.value), recon = nombre(this.elRecon.value) || 0, marge = nombre(this.elMarge.value), prix = nombre(this.elPrix.value);
    var a = this.analyses[this.pays], c = (a && a.ok) ? this.calculs(a) : null;
    if (prix !== null) {
      var pos = c ? c.marchePct : null;
      // (8 oct., soir — Maxime) le % du marché et le rang en gros, avant tout le reste.
      if (c && pos !== null) {
        var ton = pos <= 0.97 ? 'pos' : (pos <= 1.03 ? 'moyen' : 'neg');
        var lecture = pos <= 0.97 ? 'sous le marché : se vend vite' : (pos <= 1.03 ? 'dans le marché' : 'au-dessus du marché : plus long à vendre');
        this.elDetailResume.appendChild(h('div.eval-marche-bandeau.' + ton, { title: 'Votre détail ' + fmt(prix) + ' vs marché standard ' + fmt(c.standard) + (a.actifs && a.actifs.n ? ' (' + a.actifs.n + ' annonces, ramenées à votre km)' : '') }, [
          h('div', [h('div.l', { text: '% du marché' }), h('div.gros.num', { text: pct(pos) })]),
          c.rang ? h('div', [h('div.l', { text: 'Rang' }), h('div.rang.num', { text: c.rang + ' sur ' + c.rangSur })]) : null,
          h('div.expl', { text: lecture })
        ]));
      }
    }
    if (this.ficheSource) this.elDetailResume.appendChild(h('p.eval-note', [h('span', { text: 'Repris de la fiche d\'achat (' + this.ficheSource + '). ' }), h('a.petit', { href: AMX.lien('achat', '', { vin: this.vinCourant }), text: 'Corriger' })]));
    this.elCibles.appendChild(h('div.eval-cibles-titre', { text: c && c.standard ? 'Prix du marché (à votre km)' : 'Prix du marché' }));
    if (c && c.standard) {
      var cible = function (nom, v, cls) {
        var maxAchat = (v !== null && marge !== null) ? v - recon - marge - frais : null;
        var margeSi = (v !== null && paye !== null) ? v - paye - recon : null;
        return h('div.eval-cible.' + cls, [
          h('div.l', { text: nom }), h('div.v.num', { text: fmt(v) }),
          h('div.s', { title: maxAchat !== null ? 'Prix d\'achat maximal pour garder ' + fmt(marge) + ' de marge' : '', text: maxAchat !== null ? 'Achat max. ' + fmt(maxAchat) : 'Marge à entrer' }),
          margeSi !== null ? h('div.s.' + (margeSi >= (marge || 0) ? 'pos' : 'neg'), { text: 'Marge ' + fmt(margeSi), title: 'Marge au prix payé' }) : null,
          h('button.btn.petit', { type: 'button', text: 'Prendre', title: 'Prendre ce prix : le prix d\'achat se calcule pour garder la marge visée', onclick: function () { self.prendrePrix(v, cls); } })
        ]);
      };
      this.elCibles.appendChild(h('div.eval-cibles', [cible('Agressif', c.agressif, 'agressif'), cible('Standard', c.standard, 'standard'), cible('Conservateur', c.conservateur, 'conservateur')]));
    } else {
      this.elCibles.appendChild(h('div.eval-attente.mini', { text: this.enCours[this.pays] ? 'Analyse en cours…' : 'Agressif / standard / conservateur après l\'analyse de marché.' }));
    }
    this.rendreSommaire();
  };

  // Bandeau collant : chiffres clés + liens vers les sections.
  Evaluation.prototype.rendreSommaire = function () {
    if (!this.elSommaire) return;
    AMX.vider(this.elSommaire);
    var veh = [this.elAnnee.value, this.elMarque.value, this.elModele.value, this.elVersion.value].filter(Boolean).join(' ');
    var km = nombre(this.elKm.value), paye = nombre(this.elPaye.value), recon = nombre(this.elRecon.value), marge = nombre(this.elMarge.value), prix = nombre(this.elPrix.value);
    var a = this.analyses[this.pays], c = (a && a.ok) ? this.calculs(a) : null;
    var pos = c ? c.marchePct : null;
    function item(l, v, cls) { return h('div.item' + (cls ? '.' + cls : ''), [h('div.l', { text: l }), h('div.v.num', { text: v })]); }
    this.elSommaire.appendChild(h('div.veh', [h('div.nom', { text: veh || 'Aucun véhicule' }), h('div.sous', { text: [this.vinCourant || '', km !== null ? fmtKm(km) : ''].filter(Boolean).join(' · ') })]));
    // (8 oct., soir — Maxime) le % du marché et le rang sont la donnée la plus importante : grande tuile, en premier.
    this.elSommaire.appendChild(h('div.item.marche' + (pos === null ? '' : (pos <= 0.97 ? '.pos' : (pos <= 1.03 ? '.moyen' : '.neg'))), [
      h('div.l', { text: 'Marché · rang' }),
      h('div.v.num', { text: c ? pct(pos) + (c.rang ? ' · ' + c.rang + '/' + c.rangSur : '') : '—' })
    ]));
    this.elSommaire.appendChild(item('Payé', fmt(paye)));
    this.elSommaire.appendChild(item('Recon', fmt(recon)));
    this.elSommaire.appendChild(item('Marge', fmt(marge), marge !== null ? (marge >= 0 ? 'pos' : 'neg') : ''));
    this.elSommaire.appendChild(item('Détail', fmt(prix), 'fort'));
    this.elSommaire.appendChild(item('Marché std', c ? fmt(c.standard) : '—'));
    // Verdict Canada / É.-U. (8 oct.) — seulement quand la boîte a de quoi comparer.
    var us = this.elExport ? this.usCollecter() : null;
    if (us && us.verdict) this.elSommaire.appendChild(item('Verdict', AMX.export.texteVerdict(us), 'verdict.' + us.verdict));
    if (us && us.alerteMmr) this.elSommaire.appendChild(item('É.-U. vs MMR', (us.marcheUSPct >= 0 ? '+' : '') + us.marcheUSPct + ' %', 'neg'));
    var st = this.suiviStatut ? statutSuivi(this.suiviStatut) : null;
    if (st) this.elSommaire.appendChild(item('Suivi', st[1], 'suivi.s-' + st[2]));
    // 12 nov. : plus de boutons de saut (« pas besoin de toujours répéter les menus ») — les tuiles sous le prix suffisent.
    this.rendreEcartClient && this.rendreEcartClient();
    this.majTuiles();
  };

  /* ------------- Client, suivi, état et photos (21 oct.) -------------
     Ce que Torque donnait au quotidien : le client (nom, téléphone, courriel, origine, transaction, ce
     qu'il cherche), le conseiller, le statut (En attente → Complété / relance → Perdu ou Repris), la
     valeur offerte au client contre la valeur interne (prix d'achat), l'état du véhicule et ses photos.
     Tout vit dans le JSON de l'évaluation (`suivi`, `etatVehicule`, plus etat / pneus / pareBrise /
     accident à plat pour le panneau d'inventaire) ; les photos passent par uploadPhoto (par NIV) et
     suivent le véhicule s'il est acheté. */
  var SUIVI_STATUTS = [['attente', 'En attente', 'ambre'], ['complete', 'Complété / relance', 'vert'], ['perdu', 'Perdu', 'rouge'], ['repris', 'Repris', 'bleu'], ['reprisWholesale', 'Repris wholesale', 'violet']];
  var SUIVI_ORIGINES = ['Sans rendez-vous', 'Téléphone', 'Internet', 'Référence', 'Service', 'Client existant', 'Autre'];
  var SUIVI_TRANSACTIONS = [['echange', 'Échange (achète chez nous)'], ['achat', 'Achat seulement']];
  var ETAT_GENERAL = [['excellent', 'Excellent'], ['bon', 'Bon'], ['normal', 'Normal'], ['mauvais', 'Mauvais']];
  var ETAT_PNEUS = ['Neufs', 'Bons', 'Moyens', 'À changer', 'Aucun'];
  var ETAT_PARE_BRISE = ['Bon', 'Éclat', 'Fissuré', 'À changer'];
  var ETAT_ACCIDENT = [['non', 'Non'], ['oui', 'Oui'], ['inconnu', 'Inconnu']];
  /* 1er nov. : les champs que Torque avait et pas nous (rapport « Torque face à ScanAutomax », points 1 à 7). Mêmes
     codes que l'app (EvaluationSuivi.swift). Les cases oui / non sont des pastilles à cocher (tableaux de codes). */
  var SUIVI_TYPES_CLIENT = [['particulier', 'Particulier'], ['entreprise', 'Entreprise'], ['commercant', 'Commerçant'], ['employe', 'Employé']];
  var SUIVI_LANGUES = [['fr', 'Français'], ['en', 'Anglais']];
  var ETAT_CLES = [['0', 'Aucune'], ['1', '1'], ['2', '2'], ['3', '3 et plus']];
  var ETAT_FINANCEMENT = [['paye', 'Payé (aucun solde)'], ['finance', 'Financé'], ['loue', 'Location']];
  var ETAT_CONSTATS = [['vu', 'Véhicule vu'], ['moteur', 'Témoin moteur'], ['abs', 'Témoin ABS'], ['coussins', 'Témoin coussins'], ['clim', 'Clim défectueuse'], ['fumeur', 'Fumeur'], ['modifie', 'Modifié'], ['americain', 'Véhicule américain']];
  var ETAT_GARANTIES = [['origine', 'Garantie d\'origine'], ['prolongee', 'Garantie prolongée'], ['motopropulseur', 'Motopropulseur'], ['assurance', 'Produits d\'assurance']];
  var ETAT_OPTIONS = [['toit', 'Toit ouvrant'], ['cuir', 'Cuir'], ['siegesChauffants', 'Sièges chauffants'], ['volantChauffant', 'Volant chauffant'], ['siegesVentiles', 'Sièges ventilés'],
    ['navigation', 'Navigation'], ['camera360', 'Caméra 360°'], ['demarreur', 'Démarreur à distance'], ['regulateur', 'Régulateur adaptatif'], ['anglesMorts', 'Angles morts'],
    ['hayon', 'Hayon électrique'], ['attelage', 'Attelage'], ['son', 'Son haut de gamme'], ['teteHaute', 'Affichage tête haute'], ['marchepieds', 'Marchepieds'], ['caisse', 'Doublure de caisse'], ['cable', 'Câble de recharge (VÉ)']];
  var RECON_POSTES = [['mecanique', 'Mécanique'], ['carrosserie', 'Carrosserie'], ['pneus', 'Pneus'], ['pareBrise', 'Pare-brise'], ['esthetique', 'Esthétique'], ['certification', 'Certification']];
  var PRIX_TYPES = [['manuel', 'Manuel'], ['agressif', 'Agressif'], ['standard', 'Standard'], ['conservateur', 'Conservateur']];
  /* 2 nov. : les mêmes listes servent au détail que le représentant inscrit dans sa demande (demandes-eval.js). */
  AMX.evalListes = { origines: SUIVI_ORIGINES, transactions: SUIVI_TRANSACTIONS, typesClient: SUIVI_TYPES_CLIENT, langues: SUIVI_LANGUES,
    etatGeneral: ETAT_GENERAL, pneus: ETAT_PNEUS, pareBrise: ETAT_PARE_BRISE, accident: ETAT_ACCIDENT, cles: ETAT_CLES, financement: ETAT_FINANCEMENT,
    constats: ETAT_CONSTATS, garanties: ETAT_GARANTIES, options: ETAT_OPTIONS };
  function statutSuivi(cle) { return SUIVI_STATUTS.filter(function (s) { return s[0] === cle; })[0] || null; }
  // Une rangée de pastilles à cocher : { el, get() → [codes], set([codes]) } ; un code inconnu (ancienne fiche) est gardé.
  function pastilles(id, libelle, liste, ton, surChange) {
    var choisis = [], autres = [];
    var boutons = liste.map(function (o) {
      return h('button.eval-chip', { type: 'button', 'data-code': o[0], 'aria-pressed': 'false', text: o[1], onclick: function () {
        var i = choisis.indexOf(o[0]);
        if (i < 0) choisis.push(o[0]); else choisis.splice(i, 1);
        maj(); if (surChange) surChange();
      } });
    });
    var el = h('div.eval-chips#' + id + (ton ? '.' + ton : ''), [h('span.l', { text: libelle })].concat(boutons));
    function maj() { boutons.forEach(function (b) { var on = choisis.indexOf(b.getAttribute('data-code')) >= 0; b.classList.toggle('actif', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }); }
    return {
      el: el,
      get: function () { return liste.map(function (o) { return o[0]; }).filter(function (c) { return choisis.indexOf(c) >= 0; }).concat(autres); },
      set: function (arr) {
        arr = Array.isArray(arr) ? arr.map(String) : [];
        var connus = liste.map(function (o) { return o[0]; });
        choisis = arr.filter(function (c) { return connus.indexOf(c) >= 0; });
        autres = arr.filter(function (c) { return connus.indexOf(c) < 0; });
        maj();
      }
    };
  }
  function listeChoix(id, libelle, options) {
    var sel = h('select#' + id, [h('option', { value: '', text: '—' })].concat(options.map(function (o) {
      return h('option', { value: Array.isArray(o) ? o[0] : o, text: Array.isArray(o) ? o[1] : o });
    })));
    return { el: h('div.champ', [h('label', { 'for': id, text: libelle }), sel]), input: sel };
  }
  // Une valeur gardée qui n'est plus dans la liste (ancienne fiche) reste choisie.
  function poserChoix(sel, v) {
    v = v === null || v === undefined ? '' : String(v);
    if (v && !Array.prototype.some.call(sel.options, function (o) { return o.value === v; })) sel.appendChild(h('option', { value: v, text: v }));
    sel.value = v;
  }
  function reduirePhoto(fichier) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(fichier), img = new Image();
      img.onload = function () {
        try {
          var k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
          c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(url);
          res(c.toDataURL('image/jpeg', 0.82).replace(/^data:image\/jpeg;base64,/, ''));
        } catch (e) { rej(e); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('Image illisible')); };
      img.src = url;
    });
  }

  Evaluation.prototype.construireSuivi = function () {
    var self = this;
    this.suiviStatut = ''; this.suiviStatutLe = ''; this.suiviStatutPar = '';
    this.elSuiviSegment = h('div.segment.petit#eval-suivi-statut', { role: 'group', 'aria-label': 'Statut du suivi' });
    this.elSuiviInfo = h('span.mini.doux#eval-suivi-info');
    var cNom = champ('e-client', 'Client', { placeholder: 'Nom du client' });
    var cTel = champ('e-client-tel', 'Téléphone', { type: 'tel', placeholder: '514 555-0100' });
    var cCourriel = champ('e-client-courriel', 'Courriel', { type: 'email' });
    var cOrigine = listeChoix('e-client-origine', 'Origine', SUIVI_ORIGINES);
    var cTransaction = listeChoix('e-client-transaction', 'Transaction', SUIVI_TRANSACTIONS);
    var cConseiller = champ('e-conseiller', 'Conseiller', { placeholder: (AMX.session && AMX.session.nom) || '' });
    cConseiller.input.setAttribute('list', 'e-conseillers');
    this.elConseillers = h('datalist#e-conseillers');
    var cTypeClient = listeChoix('e-client-type', 'Type de client', SUIVI_TYPES_CLIENT);
    var cLangue = listeChoix('e-client-langue', 'Langue', SUIVI_LANGUES);
    var cCherche = champ('e-client-cherche', 'Ce que le client cherche', { placeholder: 'VUS 2024, 400 $ / mois…' });
    var cValeur = champ('e-valeur-client', 'Valeur offerte au client ($)', { type: 'number', inputmode: 'numeric', placeholder: 'Montant annoncé au client' });
    var cRelance = champ('e-relance', 'Relancer le', { type: 'date' });
    this.elClient = cNom.input; this.elClientTel = cTel.input; this.elClientCourriel = cCourriel.input;
    this.elOrigine = cOrigine.input; this.elTransaction = cTransaction.input; this.elConseiller = cConseiller.input;
    this.elCherche = cCherche.input; this.elValeurClient = cValeur.input; this.elRelance = cRelance.input;
    this.elTypeClient = cTypeClient.input; this.elLangue = cLangue.input;
    this.elEcartClient = h('div.eval-suivi-ecart#eval-ecart-client');
    this.elSuiviCarte = carte(h('div.titre', [h('h2', 'Client et suivi'), this.elSuiviInfo]), [
      h('div.grille.eval-grille-suivi', [cNom.el, cTel.el, cCourriel.el, cTypeClient.el, cLangue.el, cOrigine.el, cTransaction.el, cConseiller.el, cCherche.el, cValeur.el, cRelance.el]),
      this.elEcartClient, this.elConseillers
    ], h('div.droite', [this.elSuiviSegment]));
    this.elSuiviCarte.id = 'sec-suivi';

    var cGeneral = listeChoix('e-etat-general', 'État général', ETAT_GENERAL);
    var cPneusEte = listeChoix('e-pneus-ete', 'Pneus d\'été', ETAT_PNEUS);
    var cPneusHiver = listeChoix('e-pneus-hiver', 'Pneus d\'hiver', ETAT_PNEUS);
    var cPareBrise = listeChoix('e-pare-brise', 'Pare-brise', ETAT_PARE_BRISE);
    var cAccident = listeChoix('e-accident', 'Accident déclaré', ETAT_ACCIDENT);
    var cCarrosserie = champ('e-carrosserie', 'Carrosserie', { placeholder: 'Égratignures, bosses…' });
    var cVoyants = champ('e-voyants', 'Autres voyants', { placeholder: 'Pression des pneus…' });
    var cSolde = champ('e-solde-pret', 'Solde de prêt ($)', { type: 'number', inputmode: 'numeric' });
    var cCles = listeChoix('e-cles', 'Clés', ETAT_CLES);
    var cCoulExt = champ('e-couleur-ext', 'Couleur ext.', { placeholder: 'Blanc' });
    var cCoulInt = champ('e-couleur-int', 'Couleur int.', { placeholder: 'Noir' });
    var cPneusDim = champ('e-pneus-dim', 'Dimension pneus', { placeholder: '235/55R19' });
    var cAccMontant = champ('e-accident-montant', 'Montant de l\'accident ($)', { type: 'number', inputmode: 'numeric' });
    var cFinancement = listeChoix('e-financement', 'Financement', ETAT_FINANCEMENT);
    this.elCles = cCles.input; this.elCouleurExt = cCoulExt.input; this.elCouleurInt = cCoulInt.input; this.elPneusDim = cPneusDim.input;
    this.elAccidentMontant = cAccMontant.input; this.elChampAccMontant = cAccMontant.el; this.elFinancement = cFinancement.input;
    var modif = function () { self.suiviModifie(); };
    this.chipsConstats = pastilles('eval-constats', 'Constats', ETAT_CONSTATS, 'rouge', modif);
    this.chipsGaranties = pastilles('eval-garanties', 'Garanties', ETAT_GARANTIES, 'bleu', modif);
    this.chipsOptions = pastilles('eval-options', 'Options', ETAT_OPTIONS, 'vert', modif);
    this.elEtatGeneral = cGeneral.input; this.elPneusEte = cPneusEte.input; this.elPneusHiver = cPneusHiver.input;
    this.elPareBrise = cPareBrise.input; this.elAccident = cAccident.input; this.elCarrosserie = cCarrosserie.input;
    this.elVoyants = cVoyants.input; this.elSoldePret = cSolde.input;
    this.elEtatNotes = h('textarea.saisie#e-etat-notes', { rows: '2', placeholder: 'Odeurs, entretien, livrets…' });
    this.elPhotos = h('div.eval-photos#eval-photos');
    this.elPhotoInput = h('input#eval-photo-fichier', { type: 'file', accept: 'image/*', multiple: 'multiple', style: { display: 'none' } });
    this.elPhotoInput.addEventListener('change', function () {
      var f = Array.prototype.slice.call(self.elPhotoInput.files || []);
      self.elPhotoInput.value = '';
      if (f.length) self.ajouterPhotos(f);
    });
    this.btnPhotos = h('button.btn.petit#eval-photos-btn', { type: 'button', html: I.plus + '<span>Ajouter des photos</span>', onclick: function () { self.elPhotoInput.click(); } });
    this.elEtatCarte = carte(h('div.titre', [h('h2', 'État du véhicule et photos'), h('p', 'Ce que le client déclare et ce que vous voyez. Les photos restent avec le NIV et suivent le véhicule s\'il est acheté.')]), [
      h('div.grille.eval-grille-etat', [cGeneral.el, cCles.el, cCoulExt.el, cCoulInt.el, cPneusEte.el, cPneusHiver.el, cPneusDim.el, cPareBrise.el,
        cAccident.el, cAccMontant.el, cCarrosserie.el, cVoyants.el, cSolde.el, cFinancement.el]),
      h('div.eval-chips-bloc', [this.chipsConstats.el, this.chipsGaranties.el, this.chipsOptions.el]),
      h('div.champ.eval-etat-notes', [h('label', { 'for': 'e-etat-notes', text: 'Notes' }), this.elEtatNotes]),
      h('div.eval-photos-entete', [h('h3', 'Photos'), this.btnPhotos, this.elPhotoInput]),
      this.elPhotos
    ]);
    this.elEtatCarte.id = 'sec-etat';

    // Le premier client tapé sans conseiller : le conseiller est la personne connectée (modifiable).
    [this.elClient, this.elClientTel].forEach(function (el) {
      el.addEventListener('input', function () {
        if (el.value.trim() && !self.elConseiller.value.trim() && AMX.session && AMX.session.nom) self.elConseiller.value = AMX.session.nom;
      });
    });
    [this.elClient, this.elClientTel, this.elClientCourriel, this.elConseiller, this.elCherche, this.elValeurClient, this.elRelance,
      this.elCarrosserie, this.elVoyants, this.elSoldePret, this.elEtatNotes, this.elCouleurExt, this.elCouleurInt, this.elPneusDim, this.elAccidentMontant].forEach(function (el) { el.addEventListener('input', function () { self.suiviModifie(); }); });
    [this.elOrigine, this.elTransaction, this.elEtatGeneral, this.elPneusEte, this.elPneusHiver, this.elPareBrise, this.elAccident, this.elRelance,
      this.elTypeClient, this.elLangue, this.elCles, this.elFinancement].forEach(function (el) { el.addEventListener('change', function () { self.suiviModifie(); }); });
    this.elAccident.addEventListener('change', function () { self.majChampsEtat(); });
    [this.elAchat, this.elFrais].forEach(function (el) { el.addEventListener('input', function () { self.rendreEcartClient(); }); });
    this.rendreSuiviStatut();
    this.rendreConseillers();
    this.majChampsEtat();
    this.rendrePhotos();   // page sans NIV : bouton grisé et « dès que le NIV est complet »
  };

  // Le montant d'un accident ne se demande que si un accident est déclaré (ou qu'un montant était déjà inscrit).
  Evaluation.prototype.majChampsEtat = function () {
    if (!this.elChampAccMontant) return;
    this.elChampAccMontant.classList.toggle('cache', this.elAccident.value !== 'oui' && !this.elAccidentMontant.value);
  };

  Evaluation.prototype.rendreSuiviStatut = function () {
    var self = this;
    AMX.vider(this.elSuiviSegment);
    SUIVI_STATUTS.forEach(function (s) {
      self.elSuiviSegment.appendChild(h('button' + (self.suiviStatut === s[0] ? '.actif.s-' + s[2] : ''), { type: 'button', text: s[1], 'data-statut': s[0], onclick: function () { self.choisirStatutSuivi(self.suiviStatut === s[0] ? '' : s[0]); } }));
    });
    var s = statutSuivi(this.suiviStatut);
    this.elSuiviInfo.textContent = s ? s[1] + (this.suiviStatutLe ? ' depuis le ' + AMX.fmtDate(this.suiviStatutLe) : '') + (this.suiviStatutPar ? ' · ' + this.suiviStatutPar.split('@')[0] : '') : 'Statut à choisir à droite';
  };

  Evaluation.prototype.choisirStatutSuivi = function (cle) {
    this.suiviStatut = cle;
    this.suiviStatutLe = cle ? new Date().toISOString() : '';
    this.suiviStatutPar = cle ? ((AMX.session && AMX.session.courriel) || '') : '';
    this.rendreSuiviStatut();
    this.rendreSommaire();
    this.suiviModifie();
    if (cle === 'repris' || cle === 'reprisWholesale') AMX.toast('Véhicule repris : « Créer la fiche d\'achat » sous le véhicule le fait entrer à l\'inventaire.', 'info', 6000);
  };

  // Les noms déjà utilisés sur ce navigateur, plus la personne connectée.
  Evaluation.prototype.rendreConseillers = function () {
    var noms = AMX.memo.lire('eval_conseillers', []);
    if (!Array.isArray(noms)) noms = [];
    if (AMX.session && AMX.session.nom && noms.indexOf(AMX.session.nom) < 0) noms = [AMX.session.nom].concat(noms);
    AMX.vider(this.elConseillers);
    var dl = this.elConseillers;
    noms.slice(0, 30).forEach(function (n) { dl.appendChild(h('option', { value: n })); });
  };

  // Une modification du suivi ou de l'état est conservée comme le reste (1,5 s), dès que le véhicule est connu.
  Evaluation.prototype.suiviModifie = function () {
    var self = this;
    this.rendreEcartClient();
    this.majTuiles();
    if (!this.vinPourSauvegarde() || !this.parametresPrets()) return;
    clearTimeout(this.minuterieAuto);
    this.minuterieAuto = setTimeout(function () { self.sauvegarderAuto(); }, 1500);
  };

  Evaluation.prototype.rendreEcartClient = function () {
    var el = this.elEcartClient; if (!el) return;
    AMX.vider(el);
    var vc = nombre(this.elValeurClient.value), vi = nombre(this.elAchat.value);
    if (vc === null) return;
    if (vi === null) { el.appendChild(h('span.mini.doux', { text: 'Entrez le prix d\'achat (valeur interne) dans la carte Prix pour voir l\'écart avec la valeur offerte.' })); return; }
    var ecart = vc - vi;
    var texte = ecart === 0 ? 'Valeur offerte égale à la valeur interne (' + fmt(vi) + ')'
      : 'Valeur offerte ' + fmt(vc) + ' : ' + fmt(Math.abs(ecart)) + (ecart > 0 ? ' au-dessus de' : ' sous') + ' la valeur interne (' + fmt(vi) + ')';
    el.appendChild(h('span.puce' + (ecart > 0 ? '.attention' : '.ok'), { text: texte }));
  };

  Evaluation.prototype.collecterSuivi = function () {
    function t(el) { return String(el.value || '').trim(); }
    function vide(o) { return !Object.keys(o).some(function (k) { return Array.isArray(o[k]) ? o[k].length : o[k]; }); }
    var suivi = {
      statut: this.suiviStatut, statutLe: this.suiviStatutLe, statutPar: this.suiviStatutPar,
      client: t(this.elClient), telephone: t(this.elClientTel), courriel: t(this.elClientCourriel), origine: t(this.elOrigine),
      transaction: t(this.elTransaction), cherche: t(this.elCherche), conseiller: t(this.elConseiller),
      valeurClient: t(this.elValeurClient), relanceLe: t(this.elRelance), typeClient: t(this.elTypeClient), langue: t(this.elLangue)
    };
    var etat = {
      general: t(this.elEtatGeneral), pneusEte: t(this.elPneusEte), pneusHiver: t(this.elPneusHiver), pareBrise: t(this.elPareBrise),
      accident: t(this.elAccident), carrosserie: t(this.elCarrosserie), voyants: t(this.elVoyants), soldePret: t(this.elSoldePret), notes: t(this.elEtatNotes),
      cles: t(this.elCles), couleurExt: t(this.elCouleurExt), couleurInt: t(this.elCouleurInt), pneusDim: t(this.elPneusDim),
      accidentMontant: t(this.elAccidentMontant), financement: t(this.elFinancement),
      constats: this.chipsConstats.get(), garanties: this.chipsGaranties.get(), options: this.chipsOptions.get()
    };
    if (suivi.conseiller) {
      var noms = AMX.memo.lire('eval_conseillers', []);
      if (!Array.isArray(noms)) noms = [];
      if (noms[0] !== suivi.conseiller) AMX.memo.ecrire('eval_conseillers', [suivi.conseiller].concat(noms.filter(function (n) { return n !== suivi.conseiller; })).slice(0, 30));
    }
    // À plat pour le bloc « Évaluation » du panneau d'inventaire (inventaire.js : état, pneus, pare-brise, accident).
    var general = (ETAT_GENERAL.filter(function (x) { return x[0] === etat.general; })[0] || [])[1] || '';
    var pneus = [etat.pneusEte ? 'été ' + etat.pneusEte.toLowerCase() : '', etat.pneusHiver ? 'hiver ' + etat.pneusHiver.toLowerCase() : ''].filter(Boolean).join(' · ');
    return {
      suivi: vide(suivi) ? null : suivi,
      etatVehicule: vide(etat) ? null : etat,
      etat: general.toLowerCase(), pneus: pneus, pareBrise: etat.pareBrise.toLowerCase(), accident: etat.accident === 'oui' ? 'oui (déclaré)' : ''
    };
  };

  Evaluation.prototype.remplirSuivi = function (data) {
    data = data || {};
    var s = (data.suivi && typeof data.suivi === 'object') ? data.suivi : {};
    var e = (data.etatVehicule && typeof data.etatVehicule === 'object') ? data.etatVehicule : {};
    function v(x) { return x === null || x === undefined ? '' : String(x); }
    this.elClient.value = v(s.client); this.elClientTel.value = v(s.telephone); this.elClientCourriel.value = v(s.courriel);
    poserChoix(this.elOrigine, s.origine); poserChoix(this.elTransaction, s.transaction);
    this.elConseiller.value = v(s.conseiller); this.elCherche.value = v(s.cherche);
    this.elValeurClient.value = v(s.valeurClient); this.elRelance.value = v(s.relanceLe).slice(0, 10);
    poserChoix(this.elTypeClient, s.typeClient); poserChoix(this.elLangue, s.langue);
    this.suiviStatut = statutSuivi(s.statut) ? s.statut : '';
    this.suiviStatutLe = this.suiviStatut ? v(s.statutLe) : ''; this.suiviStatutPar = this.suiviStatut ? v(s.statutPar) : '';
    poserChoix(this.elEtatGeneral, e.general); poserChoix(this.elPneusEte, e.pneusEte); poserChoix(this.elPneusHiver, e.pneusHiver);
    poserChoix(this.elPareBrise, e.pareBrise); poserChoix(this.elAccident, e.accident);
    this.elCarrosserie.value = v(e.carrosserie); this.elVoyants.value = v(e.voyants); this.elSoldePret.value = v(e.soldePret); this.elEtatNotes.value = v(e.notes);
    poserChoix(this.elCles, e.cles); poserChoix(this.elFinancement, e.financement);
    this.elCouleurExt.value = v(e.couleurExt); this.elCouleurInt.value = v(e.couleurInt); this.elPneusDim.value = v(e.pneusDim); this.elAccidentMontant.value = v(e.accidentMontant);
    this.chipsConstats.set(e.constats); this.chipsGaranties.set(e.garanties); this.chipsOptions.set(e.options);
    this.majChampsEtat();
    this.appliquerDemande();   /* 2 nov. : le détail inscrit par le représentant remplit les cases restées vides */
    this.rendreSuiviStatut();
    this.rendreEcartClient();
    this.rendrePhotos();
  };

  /* Photos du NIV (celles de l'inventaire aussi) : AMX.photosDe (getPhotosByVin), ajout par uploadPhoto. */
  Evaluation.prototype.rendrePhotos = function (force) {
    var self = this, el = this.elPhotos; if (!el) return;
    var vin = String(this.vinCourant || this.elNiv.value || '').trim().toUpperCase();
    var valide = /^[A-HJ-NPR-Z0-9]{17}$/.test(vin), droit = AMX.perm('photos') || AMX.estAdmin();
    this.btnPhotos.disabled = !valide || !droit;
    this.btnPhotos.title = !valide ? 'Entrez un NIV complet' : (droit ? '' : 'Le droit « Photos » est requis');
    if (!valide) { this.photosVin = ''; this.nbPhotos = null; AMX.vider(el); el.appendChild(h('span.mini.doux', { text: 'Les photos s\'ajoutent dès que le NIV est complet.' })); this.majTuiles(); return; }
    if (this.photosVin === vin && !force) return;
    this.photosVin = vin;
    if (!force) this.nbPhotos = null;
    if (force && typeof AMX.photosOublier === 'function') AMX.photosOublier(vin);
    AMX.vider(el); el.appendChild(h('span.mini.doux', { text: 'Chargement des photos…' }));
    var lire = typeof AMX.photosDe === 'function' ? AMX.photosDe(vin) : Promise.resolve([]);
    lire.then(function (p) {
      if (self.photosVin !== vin) return;
      AMX.vider(el);
      self.nbPhotos = (p && p.length) || 0; self.majTuiles();
      if (!p || !p.length) { el.appendChild(h('span.mini.doux', { text: 'Aucune photo pour ce NIV.' })); return; }
      p.forEach(function (x) {
        var u = typeof x === 'string' ? x : (x.url || '');
        if (!u) return;
        el.appendChild(h('a.eval-photo', { href: u, target: '_blank', rel: 'noopener', title: (x && x.description) || '' }, [h('img', { src: AMX.vignetteDrive(u, 320), alt: (x && x.description) || 'Photo', loading: 'lazy' })]));
      });
    });
  };

  Evaluation.prototype.ajouterPhotos = function (fichiers) {
    var self = this, vin = this.photosVin, n = 0, suite = Promise.resolve();
    if (!vin) return;
    this.btnPhotos.classList.add('occupe');
    fichiers.forEach(function (f, i) {
      suite = suite.then(function () {
        if (fichiers.length > 1) AMX.toast('Envoi de la photo ' + (i + 1) + ' / ' + fichiers.length + '…', 'info', 1500);
        return reduirePhoto(f).then(function (b64) {
          return AMX.post({ action: 'uploadPhoto', vin: vin, angle: '', description: 'Évaluation', montant: '', imageBase64: b64, mimeType: 'image/jpeg' }, { delai: 120000 });
        }).then(function (d) {
          if (!d || d.ok === false || d.refuse) throw new Error((d && (d.erreur || d.message)) || 'refusée par le serveur');
          n++;
        });
      });
    });
    suite.catch(function (e) { AMX.toast('Photo non envoyée — ' + AMX.erreurTexte(e), 'erreur'); }).then(function () {
      self.btnPhotos.classList.remove('occupe');
      if (n) AMX.toast(n + ' photo' + (n > 1 ? 's' : '') + ' ajoutée' + (n > 1 ? 's' : '') + ' au NIV ' + vin, 'ok');
      self.rendrePhotos(true);
    });
  };

  /* ----------------------------- Liens ---------------------------------- */
  /* Bloc « Valeurs OpenLane » (9 oct.) : pour un NIV complet, les valeurs lues par le signet (ou le bouton pour
     les demander, avec le km du formulaire pour la prévision). Rafraîchi quand le NIV ou le km change. */
  Evaluation.prototype.rendreOpenlane = function () {
    var self = this, el = this.elOpenlane; if (!el || typeof AMX.openlaneBloc !== 'function') return;
    var vin = (this.elNiv.value || '').trim().toUpperCase();
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) { el.classList.add('cache'); AMX.vider(el); this.openlaneVin = ''; if (this.elOpenlaneVide) this.elOpenlaneVide.classList.remove('cache'); return; }
    if (this.elOpenlaneVide) this.elOpenlaneVide.classList.add('cache');
    var km = AMX.kmValide(this.elKm.value), cle = vin + '|' + (km || '');
    if (this.openlaneVin === cle) return;
    this.openlaneVin = cle;
    // L'index OpenLane (cache local 7 j) donne la valeur à la tuile, et suit les lectures en direct.
    if (AMX.openlane && AMX.openlane.charger && !this.olIndexDemande) { this.olIndexDemande = true; AMX.openlane.charger().then(function () { self.majTuiles(); }, function () {}); }
    AMX.vider(el);
    el.appendChild(h('div.eval-valeurs-entete', [h('div', [h('h3', 'Valeurs OpenLane'), h('span.mini.doux', { text: 'Market guide (compte Hawkesbury Chevrolet) · ventes comparables 90 j, prévision aujourd\'hui et 30-60-90 j au km du formulaire' })])]));
    var zone = h('div'); el.appendChild(zone); el.classList.remove('cache');
    // 14 oct. : OpenLane en direct — le bloc lit Market Guide tout seul (auto) quand le site tient la session du groupe.
    var cie = ''; Object.keys(AMX.COMPAGNIE_CONCESSION || {}).forEach(function (k) { if (AMX.COMPAGNIE_CONCESSION[k] === self.elConcession.value) cie = k; });
    AMX.openlaneBloc(vin, zone, { km: km || undefined, auto: true, source: 'evaluation', compagnie: cie, previsionComplete: true }).then(function (r) { if (self.openlaneVin !== cle) return; if (r) { self.olValeur = r; self.majTuiles(); } if (!r && !zone.childNodes.length) zone.appendChild(h('span.doux.petit', 'Rien de lu pour ce NIV.')); }).catch(function () {});
  };

  // Vente où ce véhicule a servi d'échange (21 oct., Maxime) : ?venteVin=NIV renvoie aussi `echanges` (Vente.gs).
  // Sans vente liée (ou script d'avant), rien ne s'affiche.
  Evaluation.prototype.rendreVenteEchange = function (vin) {
    var self = this, el = this.elEchange;
    AMX.vider(el);
    this.nEchanges = null;
    AMX.get({ venteVin: vin }, { essais: 1 }).then(function (d) {
      if (self.echangeVin !== vin) return;
      AMX.vider(el);
      self.nEchanges = ((d && d.ok && d.echanges) || []).length; self.majTuiles();
      ((d && d.ok && d.echanges) || []).forEach(function (v) {
        var annulee = v.statut === 'annulee';
        var vendu = v.vehicule || 'véhicule';
        var texte = 'Pris en échange le ' + (v.dateVente ? AMX.fmtDate(v.dateVente) : '—') + ' — vente ' + v.id + ' : ' + vendu + (v.client ? ' à ' + v.client : '') + (v.conseiller ? ' (' + v.conseiller + ')' : '');
        var chiffres = [];
        if (v.echangeValeur !== undefined && v.echangeValeur !== null && v.echangeValeur !== '') chiffres.push('valeur accordée ' + fmt(nombre(v.echangeValeur)));
        if (v.echangeEvaluation !== undefined && v.echangeEvaluation !== null && v.echangeEvaluation !== '') chiffres.push('évaluation ' + fmt(nombre(v.echangeEvaluation)));
        if (v.overUnder !== undefined && v.overUnder !== null && v.overUnder !== '') chiffres.push('over / under ' + fmt(nombre(v.overUnder)));
        el.appendChild(h('div.eval-torque-historique', [
          h('span.badge.sans-point.' + (annulee ? 'gris' : 'vert'), { text: annulee ? 'Échange · vente annulée' : 'Échange', title: 'Ce véhicule a été pris en échange dans cette vente (Livre des ventes)' }),
          h('span', { text: texte }),
          chiffres.length ? h('span', { text: chiffres.join(' · ') }) : null,
          h('a', { href: AMX.lien('vente', 'ventes', { id: v.id }), text: 'Ouvrir la vente' })
        ]));
      });
    }).catch(function () { if (self.echangeVin === vin) { self.nEchanges = 0; self.majTuiles(); } });
  };

  Evaluation.prototype.rendreLiens = function () {
    var self = this;
    var vin = (this.elNiv.value || '').trim().toUpperCase();
    var vinOk = /^[A-HJ-NPR-Z0-9]{17}$/.test(vin);
    this.rendreOpenlane();
    if (this.cfxVin !== (vinOk ? vin : '')) { this.cfxVin = vinOk ? vin : ''; AMX.vider(this.elCfx); if (vinOk && AMX.cfxPastilles) { var pc = AMX.cfxPastilles.puce(vin, { grande: true }); if (pc) this.elCfx.appendChild(pc); } }
    AMX.vider(this.elLiens);
    var carfax = (vinOk && AMX.carfax && AMX.carfax.lien) ? AMX.carfax.lien(vin) : '';
    // 27 oct. : sans rapport, « Commander le CARFAX » par l'API officielle (carfax-api.js) ; plus de lien vers le portail CARFAX.
    if (carfax) this.elLiens.appendChild(h('a.btn.petit.primaire', { href: carfax, target: '_blank', rel: 'noopener', title: 'Rapport CARFAX partagé de ce véhicule', html: I.externe + '<span>Rapport CARFAX</span>' }));
    else if (vinOk && AMX.carfaxApi) this.elLiens.appendChild(AMX.carfaxApi.bouton(vin, { classe: '.petit', source: 'evaluation',
      compagnie: function () { return AMX.CONCESSION_COMPAGNIE[self.elConcession ? self.elConcession.value : ''] || ''; },
      vehicule: function () { return [self.elAnnee.value, self.elMarque.value, self.elModele.value].filter(Boolean).join(' '); } }));
    this.elLiens.appendChild(h('a.btn.petit' + (vinOk ? '' : '.desactive'), { href: vinOk ? lienMarketGuide(vin) : '#', target: '_blank', rel: 'noopener', title: 'Valeurs d\'encan eBlock (vendus 90 jours) pour ce NIV', html: I.externe + '<span>eBlock Market Guide</span>' }));
    this.elLiens.appendChild(h('a.btn.petit', { href: URL_TORQUE, target: '_blank', rel: 'noopener', title: 'Évaluations Torque (Hawkesbury)', html: I.externe + '<span>Torque</span>' }));
    this.elLiens.appendChild(h('span.sep', { text: vinOk ? 'NIV ' + vin : 'Entrez un NIV complet pour les liens par véhicule' }));
    // Évaluation → fiche d'achat → inventaire (sous le véhicule) : la fiche s'ouvre préremplie avec cette
    // évaluation (l'analyse en cours est conservée d'abord).
    AMX.vider(this.elFiche);
    var veh = vinOk ? AMX.inventaire.parVin(vin) : null, ficheExiste = !!(veh && veh.ficheExiste);
    if (vinOk) this.elFiche.appendChild(h('button.btn.petit.primaire', { type: 'button', title: ficheExiste ? 'Ouvrir la fiche d\'achat de ce véhicule (elle proposera d\'importer cette évaluation)' : 'Créer la fiche d\'achat de ce véhicule, préremplie avec cette évaluation, pour l\'envoyer à l\'inventaire', html: I.achat + '<span>' + (ficheExiste ? 'Fiche d\'achat' : 'Créer la fiche d\'achat') + '</span>', onclick: function () { self.versFicheAchat(vin); } }));
    // Historique Torque : une requête par NIV, seulement quand il change.
    if (vinOk && this.torqueVin !== vin && typeof AMX.torqueHistorique === 'function') {
      this.torqueVin = vin; this.nTorque = null;
      AMX.torqueHistorique(vin, this.elTorque).then(function (l) { if (self.torqueVin === vin) { self.nTorque = (l && l.length) || 0; self.majTuiles(); } }, function () { if (self.torqueVin === vin) { self.nTorque = 0; self.majTuiles(); } });
    } else if (vinOk && typeof AMX.torqueHistorique !== 'function' && this.nTorque === null) this.nTorque = 0;
    else if (!vinOk && this.torqueVin) { this.torqueVin = ''; this.nTorque = null; AMX.vider(this.elTorque); }
    // Vente où ce véhicule a servi d'échange : une requête par NIV, seulement quand il change.
    if (vinOk && this.echangeVin !== vin) { this.echangeVin = vin; this.rendreVenteEchange(vin); }
    else if (!vinOk && this.echangeVin) { this.echangeVin = ''; this.nEchanges = null; AMX.vider(this.elEchange); }
    if (this.elExport && (vin || this.vinCourant) !== this.vinExport) { this.vinExport = vin || this.vinCourant; this.rendreExport(); }
    this.majTuiles();
  };

  // Conserve l'analyse (sauvegarde automatique) puis ouvre la fiche d'achat du
  // NIV : les champs connus ici voyagent aussi dans l'adresse, au cas où la
  // sauvegarde n'aurait pas eu le temps.
  Evaluation.prototype.versFicheAchat = function (vin) {
    var self = this;
    var params = { vin: vin, source: 'evaluation' };
    if (this.elMarque.value.trim()) params.marque = this.elMarque.value.trim();
    if (this.elModele.value.trim()) params.modele = this.elModele.value.trim();
    if (this.elAnnee.value.trim()) params.annee = this.elAnnee.value.trim();
    if (this.elKm.value.trim()) params.km = this.elKm.value.trim();
    var us = this.usCollecter();
    if (us && us.mmr !== null) { params.mmr = String(us.mmr); if (us.tauxAjuste !== null) params.tauxUs = us.tauxAjuste.toFixed(4); params.depenseUs = String(us.ajustement); if (us.verdict === 'us') params.destination = 'US'; }
    var partir = function () { AMX.aller('achat', '', params); };
    var p = this.parametresPrets() ? this.sauvegarderAuto() : Promise.resolve();
    Promise.resolve(p).then(partir, partir);
  };

  /* ------------------------- Rappels de sécurité (NHTSA) -----------------
     Gratuit et sans quota, par année / marque / modèle (pas par NIV) : chargé
     dès que le véhicule est connu, en cache 6 h côté serveur. Transport Canada
     n'a plus d'API : lien vers leur recherche. */
  Evaluation.prototype.chargerRappels = function () {
    var self = this, annee = this.elAnnee.value.trim(), marque = this.elMarque.value.trim(), modele = this.elModele.value.trim();
    if (!annee || !marque || !modele) { this.rappels = null; this.rappelsCle = ''; this.rendreRappels(); return Promise.resolve(); }
    var cle = [annee, marque, modele].join('|').toLowerCase();
    if (cle === this.rappelsCle && this.rappels) { this.rendreRappels(); return Promise.resolve(); }
    this.rappelsCle = cle; this.rappels = { chargement: true }; this.rendreRappels();
    return AMX.get({ rappelsNhtsa: 1, annee: annee, marque: marque, modele: modele }).then(function (d) {
      if (self.rappelsCle !== cle) return;
      self.rappels = (d && d.ok) ? d : { ok: false, erreur: (d && (d.erreur || d.message)) || 'indisponible' };
      self.rendreRappels();
    }).catch(function (e) { if (self.rappelsCle !== cle) return; self.rappels = { ok: false, erreur: AMX.erreurTexte(e) }; self.rendreRappels(); });
  };
  Evaluation.prototype.rendreRappels = function () {
    var el = this.elRappelsCorps; if (!el) return;
    AMX.vider(el);
    var r = this.rappels;
    if (!r) el.appendChild(h('p.eval-note', { text: 'Les rappels se chargent dès que l\'année, la marque et le modèle sont connus.' }));
    else if (r.chargement) el.appendChild(h('div.chargement.mini', [h('span', { html: I.rafraichir }), 'Recherche des rappels…']));
    else if (!r.ok) el.appendChild(h('p.eval-note', { text: 'Rappels indisponibles' + (r.erreur ? ' : ' + r.erreur : '') + '.' }));
    else {
      var liste = r.rappels || [];
      el.appendChild(h('div.eval-rappels-tete', [
        h('span.badge.sans-point.' + (liste.length ? 'rouge' : 'vert'), { text: liste.length ? liste.length + ' rappel' + (liste.length > 1 ? 's' : '') + ' — ' + [r.annee, r.marque, r.modele].join(' ') : 'Aucun rappel NHTSA pour ' + [r.annee, r.marque, r.modele].join(' ') }),
        h('span.doux.petit', { text: 'Un rappel listé ne vise pas forcément ce NIV : à confirmer chez le concessionnaire de la marque.' + (r.recuLe ? ' Reçu ' + AMX.fmtDate(r.recuLe, true) + '.' : '') })
      ]));
      if (liste.length) el.appendChild(h('div.eval-liste-rappels', liste.map(function (x) {
        return h('div.eval-rappel', [
          h('div.entete', [h('span.mono', { text: x.campagne || '—' }), h('span.doux', { text: x.date ? AMX.fmtDate(x.date) : '' }), x.parcStop || x.nePasConduire ? h('span.puce.alerte', { text: x.parcStop ? 'Ne pas conduire' : 'Stationner dehors' }) : null]),
          h('div.composant', { text: x.composant || '' }),
          x.resume ? h('p', { text: x.resume }) : null,
          x.consequence ? h('p.doux', { text: 'Risque : ' + x.consequence }) : null,
          x.remede ? h('p.doux', { text: 'Correctif : ' + x.remede }) : null
        ]);
      })));
      el.appendChild(h('p.doux.petit', { style: { margin: '8px 0 0' } }, ['Côté canadien : ', h('a', { href: r.lienTc || 'https://wwwapps.tc.gc.ca/Saf-Sec-Sur/7/VRDB-BDRV/search-recherche/menu.aspx?lang=fra', target: '_blank', rel: 'noopener', text: 'rappels de Transport Canada' }), '.']));
    }
    this.majTuiles();
  };

  /* ------------------------- Analyse de marché -------------------------- */
  Evaluation.prototype.majSegment = function () {
    var self = this;
    this.btnCa.classList.toggle('actif', this.pays === 'ca');
    this.btnUs.classList.toggle('actif', this.pays === 'us');
    if (this.elPortee) this.elPortee.value = this.portee[this.pays];
    if (this.elSelEtat) {
      AMX.vider(this.elSelEtat);
      Object.keys(ETATS[this.pays]).forEach(function (code) { self.elSelEtat.appendChild(h('option', { value: code, selected: code === self.etats[self.pays] ? true : undefined, text: ETATS[self.pays][code] + ' (' + code + ')' })); });
      this.elSelEtat.value = this.etats[this.pays];
      this.elSelEtat.style.display = this.portee[this.pays] === 'etat' ? '' : 'none';
    }
  };
  // La portée ou l'État a changé : l'analyse en page ne vaut plus, on relance.
  Evaluation.prototype.relancerPortee = function () {
    this.analyses[this.pays] = null; this.genAnalyse[this.pays]++; this.enCours[this.pays] = false;
    if (this.parametresPrets()) this.analyser(this.pays, false); else this.rendreMarche();
  };
  Evaluation.prototype.choisirPays = function (pays) {
    var avant = this.pays;
    this.pays = pays === 'us' ? 'us' : 'ca';
    AMX.memo.ecrire('eval_pays', this.pays);
    this.majSegment();
    if (this.tuileOuverte === 'ca' || this.tuileOuverte === 'us') this.tuileOuverte = this.pays;
    if (!this.analyses[this.pays] && !this.enCours[this.pays] && this.parametresPrets()) this.analyser(this.pays, false);
    else this.rendreMarche();
  };
  Evaluation.prototype.parametresPrets = function () {
    return !!(nombre(this.elAnnee.value) && this.elMarque.value.trim() && this.elModele.value.trim());
  };
  Evaluation.prototype.parametres = function (pays) {
    var vin = this.elNiv.value.trim().toUpperCase();
    var p = { marche: 1, pays: pays, portee: this.portee[pays], annee: this.elAnnee.value.trim(), marque: this.elMarque.value.trim(), modele: this.elModele.value.trim(), version: this.elVersion.value.trim(), km: this.elKm.value.trim(), concession: this.elConcession.value };
    if (this.elStyle.value) p.carrosserie = this.elStyle.value;
    if (this.portee[pays] === 'etat') p.etat = this.etats[pays];
    if (/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) p.vin = vin;
    return p;
  };
  Evaluation.prototype.analyser = function (pays, manuel) {
    var self = this;
    pays = pays === 'us' ? 'us' : 'ca';
    if (!this.parametresPrets()) {
      var vinSaisi = this.elNiv.value.trim().toUpperCase();
      if (/^[A-HJ-NPR-Z0-9]{11,17}$/.test(vinSaisi)) {
        // Un NIV mais pas encore de modèle : on décode d'abord, puis on analyse.
        this.vinCourant = vinSaisi;
        return this.decoder(vinSaisi).then(function () { if (self.parametresPrets()) return self.analyser(pays, manuel); if (manuel) AMX.toast('Le décodeur ne connaît pas ce NIV — remplissez marque, modèle et année.', 'attention'); });
      }
      if (manuel) { AMX.toast('Entrez un NIV (ou l\'année, la marque et le modèle).', 'attention'); this.elNiv.focus(); }
      return Promise.resolve();
    }
    var g = ++this.genAnalyse[pays];
    this.enCours[pays] = true;
    this.analyses[pays] = null;
    this.rendreMarche();
    this.btnAnalyser.classList.add('occupe');
    return AMX.get(this.parametres(pays)).then(function (d) {
      if (g !== self.genAnalyse[pays]) return;
      self.enCours[pays] = false;
      if (d && d.refuse) { self.analyses[pays] = { ok: false, erreur: d.erreur || 'Accès refusé' }; }
      else self.analyses[pays] = d || { ok: false, erreur: 'Réponse vide' };
      self.analyses[pays]._recu = Date.now();
      self.rendreMarche();
      self.rendreExport();
      if (self.analyses[pays].ok) {
        self.etat('Marché ' + (pays === 'us' ? 'É.-U.' : 'Canada') + ' : ' + ((self.analyses[pays].actifs || {}).n || 0) + ' annonces, ' + ((self.analyses[pays].vendus || {}).n90 || 0) + ' ventes en 90 jours.');
        // Chaque analyse est conservée d'office dans le registre (évaluateur + concession).
        self.sauvegarderAuto();
      }
    }).catch(function (e) {
      if (g !== self.genAnalyse[pays]) return;
      self.enCours[pays] = false;
      self.analyses[pays] = { ok: false, erreur: AMX.erreurTexte(e) };
      self.rendreMarche();
      AMX.toast('Analyse impossible — ' + AMX.erreurTexte(e), 'erreur');
    }).then(function () { self.btnAnalyser.classList.remove('occupe'); });
  };

  // Annonces filtrées + prix ajustés, triées selon le filtre.
  Evaluation.prototype.annoncesRetenues = function (a) {
    var self = this;
    var kmV = nombre(this.elKm.value), taux = nombre(this.elTaux.value) || 0;
    var version = this.elVersion.value.trim().toLowerCase();
    var liste = ((a && a.actifs && a.actifs.annonces) || []).map(function (x) {
      var ajuste = (kmV !== null && x.km !== null && x.km !== undefined) ? x.prix - (kmV - x.km) * taux : x.prix;
      return Object.assign({}, x, { ajuste: Math.round(ajuste) });
    });
    if (this.filtres.memeVersion && version) liste = liste.filter(function (x) { return String(x.version || '').toLowerCase().indexOf(version) >= 0; });
    var st = this.elStyle.value;
    var modEval = this.elModele.value;
    if (st) liste = liste.filter(function (x) { var s2 = styleDe(x.style, x.portes, x.version, x.modele || modEval); return !s2 || s2 === st || (st === 'grancoupe' && s2 === 'berline') || (st === 'berline' && s2 === 'grancoupe'); });
    if (this.filtres.kmProche && kmV !== null) liste = liste.filter(function (x) { return x.km === null || x.km === undefined || Math.abs(x.km - kmV) <= TOLERANCE_KM; });
    var trac = this.filtres.traction;
    if (trac) liste = liste.filter(function (x) { return tractionVa(trac, x.motricite); });
    /* rang de chaque annonce par prix ramené au km du véhicule (1 = la moins chère), quel que soit le tri */
    var parAjuste = liste.map(function (x) { return x.ajuste; }).sort(asc);
    liste.forEach(function (x) { var r = 1; parAjuste.forEach(function (p) { if (p < x.ajuste) r++; }); x.rangAjuste = r; });
    var tri = this.filtres.tri, sens = this.filtres.sens === 'desc' ? -1 : 1;
    var val = function (x) { return tri === 'km' ? (x.km || 0) : (tri === 'dist' ? (x.distKm || 0) : (tri === 'jours' ? (x.jours || 0) : (tri === 'brut' ? (x.prix || 0) : (tri === 'annee' ? (Number(x.annee) || 0) : x.ajuste)))); };
    liste.sort(function (p, q) { return (val(p) - val(q)) * sens; });
    return liste;
  };

  // Les trois prix + la position du prix visé.
  Evaluation.prototype.calculs = function (a) {
    var liste = this.annoncesRetenues(a);
    var ajustes = liste.map(function (x) { return x.ajuste; }).sort(asc);
    var prixVise = nombre(this.elPrix.value);
    var res = { n: liste.length, agressif: null, standard: null, conservateur: null, base: '' };
    if (ajustes.length >= 3) {
      res.agressif = arrondi50(centile(ajustes, 0.25)); res.standard = arrondi50(mediane(ajustes)); res.conservateur = arrondi50(centile(ajustes, 0.75));
      res.base = ajustes.length + ' annonces, prix ramenés à votre kilométrage';
    } else {
      var st = a && a.actifs && a.actifs.prix, med = st && (st.mediane || st.moyenne);
      if (ajustes.length) { med = mediane(ajustes); }
      if (med) { res.agressif = arrondi50(med * 0.93); res.standard = arrondi50(med); res.conservateur = arrondi50(med * 1.04); res.base = ajustes.length ? ajustes.length + ' annonce(s) seulement : −7 % / +4 % autour de la médiane' : 'statistiques du marché : −7 % / +4 % autour de la médiane'; }
    }
    var moyActive = a && a.actifs && a.actifs.prix && a.actifs.prix.moyenne;
    if (!moyActive && ajustes.length) moyActive = moyenne(liste.map(function (x) { return x.prix; }));
    res.marchePct = (prixVise && moyActive) ? prixVise / moyActive : null;
    if (prixVise && ajustes.length) {
      var rang = 1; ajustes.forEach(function (p) { if (p < prixVise) rang++; });
      res.rang = rang; res.rangSur = ajustes.length + 1;
    }
    res.prixVise = prixVise;
    return res;
  };

  Evaluation.prototype.rendreMarche = function () {
    var self = this;
    var pays = this.pays, a = this.analyses[pays];
    AMX.vider(this.elMarche);
    this.rendrePrixDetail();

    if (this.enCours[pays]) {
      this.elMarche.appendChild(h('div.chargement', [h('span', { html: I.rafraichir }), 'Recherche des annonces ' + (pays === 'us' ? 'américaines' : 'canadiennes') + ' et des ventes récentes…']));
      return;
    }
    if (!a) {
      var prets = this.parametresPrets();
      var attente = h('div.eval-attente', [
        h('div', { text: prets ? 'Prêt à analyser ' + [this.elAnnee.value, this.elMarque.value, this.elModele.value, this.elVersion.value].filter(Boolean).join(' ') + ' sur le marché ' + (pays === 'us' ? 'américain' : 'canadien') + ' — ' + nomPortee(self.portee[pays], pays, self.etats[pays]) + '.' : 'Décodez le NIV (ou entrez l\'année, la marque et le modèle), puis lancez l\'analyse.' }),
        prets ? h('button.btn.primaire', { type: 'button', html: I.recherche + '<span>Analyser le marché ' + (pays === 'us' ? 'américain' : 'canadien') + '</span>', onclick: function () { self.analyser(pays, true); } }) : null
      ]);
      this.elMarche.appendChild(attente);
      if (this.derniereSauvegarde) this.elMarche.appendChild(this.blocSauvegarde(this.derniereSauvegarde));
      return;
    }
    if (!a.ok) {
      var admin = AMX.estAdmin();
      this.elMarche.appendChild(h('div.alerte-bloc.' + (a.sansCle ? 'attention' : 'erreur'), [
        h('span', { html: I.alerte }),
        h('div', [
          h('div', { text: a.sansCle ? 'La clé MarketCheck n\'est pas en place sur le serveur.' : 'Analyse impossible : ' + (a.erreur || 'erreur inconnue') }),
          a.sansCle ? h('div.mini', { style: { marginTop: '4px' } }, admin ? [h('a', { href: AMX.lien('admin', '', {}), text: 'Coller la clé dans Outils › Comptes et droits › Données de marché' })] : 'Demandez à un administrateur de la coller dans Outils › Comptes et droits › Données de marché.') : null
        ])
      ]));
      if (this.derniereSauvegarde) this.elMarche.appendChild(this.blocSauvegarde(this.derniereSauvegarde));
      return;
    }

    var c = this.calculs(a);
    var act = a.actifs || {}, ven = a.vendus || {};
    var devise = a.devise || (pays === 'us' ? 'USD' : 'CAD');

    // Résumé sombre
    this.elMarche.appendChild(h('div.resume-sombre.eval-resume', [
      h('div', [h('div.l', 'Annonces actives'), h('div.v.num', { text: String(act.n || 0) })]),
      h('div', [h('div.l', 'Prix moyen actif'), h('div.v.num', { text: fmt(act.prix && act.prix.moyenne) })]),
      h('div', [h('div.l', 'Médiane active'), h('div.v.num', { text: fmt(act.prix && act.prix.mediane) })]),
      h('div', [h('div.l', 'Jours affichés moy.'), h('div.v.num', { text: fmtJ(act.jours && act.jours.moyenne) })]),
      h('div', [h('div.l', 'Vendus / mois (90 j)'), h('div.v.num', { text: ven.parMois !== undefined && ven.parMois !== null ? String(ven.parMois) : '—' })]),
      h('div', [h('div.l', 'Prix moyen vendu'), h('div.v.num', { text: fmt(ven.prix && ven.prix.moyenne) })])
    ]));

    // Deux cartes de statistiques
    function mini(l, v, m) { return h('div', [h('div.l', { text: l }), h('div.v', { text: v }), m ? h('div.m', { text: m }) : null]); }
    var statAct = h('div.eval-stat', [
      h('h3', [h('span.n', { text: String(act.n || 0) }), 'véhicules similaires sur le marché', h('span.mini.doux', { text: (a.portee === 'national' || a.portee === 'etat') ? ' · ' + (a.lieu || 'tout le pays') + ((act.annonces || []).length < (act.n || 0) ? ' — les ' + (act.annonces || []).length + ' annonces les plus récentes sont listées' : '') : ' · rayon ' + (a.rayonKm || '—') + ' km autour de ' + (a.lieu || '—') })]),
      h('div.grille-mini', [
        mini('KM moyen', fmtKm(act.km && act.km.moyenne), act.km ? fmtKm(act.km.min) + ' – ' + fmtKm(act.km.max) : ''),
        mini('Prix moyen', fmt(act.prix && act.prix.moyenne), act.prix ? fmt(act.prix.min) + ' – ' + fmt(act.prix.max) : ''),
        mini('Jours affichés', fmtJ(act.jours && act.jours.moyenne), act.jours ? fmtJ(act.jours.min) + ' – ' + fmtJ(act.jours.max) : '')
      ]),
      a.versionElargie ? h('p.eval-note', { text: 'Trop peu d\'annonces pour la version « ' + (a.version || this.elVersion.value) + ' » : la recherche a été élargie à tout le modèle.' }) : null
    ]);
    var statVen = h('div.eval-stat', [
      h('h3', [h('span.n', { text: String(ven.n90 || 0) }), 'ventes déduites en 90 jours', h('span.mini.doux', { text: ven.parMois !== undefined && ven.parMois !== null ? ' · ≈ ' + ven.parMois + ' par mois' : '' })]),
      h('div.grille-mini', [
        mini('Prix moyen vendu', fmt(ven.prix && ven.prix.moyenne), ven.prix ? 'médiane ' + fmt(ven.prix.mediane) : ''),
        mini('KM moyen vendu', fmtKm(ven.km && ven.km.moyenne), ven.km ? fmtKm(ven.km.min) + ' – ' + fmtKm(ven.km.max) : ''),
        mini('Jours avant vente', fmtJ(ven.jours && ven.jours.moyenne), ven.jours ? 'médiane ' + fmtJ(ven.jours.mediane) : '')
      ]),
      h('p.eval-note', { text: (ven.portee === 'version' ? 'Portée : année, marque, modèle et version' : 'Portée : année, marque et modèle') + (a.ventesPays ? ' (aucune vente recensée dans ' + (a.etatNom || 'cet État') + ' : ventes de tout le pays)' : (a.ventesElargies ? ' (élargie, la version n\'avait pas de ventes recensées)' : '')) + ' — ' + (a.portee === 'etat' && !a.ventesPays ? (a.lieu || '') : (pays === 'us' ? 'États-Unis' : 'Canada')) + ', annonces disparues des sites de concessionnaires, en ' + devise + '.' })
    ]);
    this.elMarche.appendChild(h('div.eval-stats', [statAct, statVen]));

    // Filtres + table des comparables
    var liste = this.annoncesRetenues(a);
    var caseVersion = h('input', { type: 'checkbox', checked: this.filtres.memeVersion ? true : undefined, disabled: this.elVersion.value.trim() ? undefined : true });
    caseVersion.addEventListener('change', function () { self.filtres.memeVersion = caseVersion.checked; self.rendreMarche(); });
    var caseKm = h('input', { type: 'checkbox', checked: this.filtres.kmProche ? true : undefined, disabled: nombre(this.elKm.value) === null ? true : undefined });
    caseKm.addEventListener('change', function () { self.filtres.kmProche = caseKm.checked; self.rendreMarche(); });
    var TRIS = [['prix', 'Prix ajusté'], ['brut', 'Prix affiché'], ['km', 'Odomètre'], ['annee', 'Année'], ['jours', 'Jours affichés'], ['dist', 'Distance']];
    var tri = h('select.saisie', { style: { height: '28px', width: 'auto' } }, TRIS.map(function (o) { return h('option', { value: o[0], selected: self.filtres.tri === o[0] ? true : undefined, text: 'Trier : ' + o[1] }); }));
    tri.addEventListener('change', function () { self.filtres.tri = tri.value; self.filtres.sens = 'asc'; self.rendreMarche(); });
    var sensBtn = h('button.btn.petit.fantome.eval-sens', { type: 'button', text: this.filtres.sens === 'desc' ? '↓ décroissant' : '↑ croissant', title: 'Inverser l\'ordre', onclick: function () { self.filtres.sens = self.filtres.sens === 'desc' ? 'asc' : 'desc'; self.rendreMarche(); } });
    var nbTrac = {}; ((a && a.actifs && a.actifs.annonces) || []).forEach(function (x) { var k = tractionDe(x.motricite) || '?'; nbTrac[k] = (nbTrac[k] || 0) + 1; });
    var selTraction = h('select.saisie', { style: { height: '28px', width: 'auto' }, title: 'Traction des annonces (MarketCheck)' + (this.tractionVehicule ? ' — votre véhicule : ' + NOM_TRACTION[this.tractionVehicule] + ' (décodeur)' : '') }, TRACTIONS.map(function (o) {
      var n = o[0] === '' ? null : (o[0] === 'deux' ? (nbTrac.avant || 0) + (nbTrac.arriere || 0) + (nbTrac.deux || 0) : (nbTrac[o[0]] || 0));
      return h('option', { value: o[0], selected: self.filtres.traction === o[0] ? true : undefined, text: o[1] + (n !== null ? ' (' + n + ')' : '') + (o[0] && o[0] === self.tractionVehicule ? ' — votre véhicule' : '') });
    }));
    selTraction.addEventListener('change', function () { self.filtres.traction = selTraction.value; self.tractionManuelle = true; self.rendreMarche(); self.rendreSommaire && self.rendreSommaire(); });
    this.elMarche.appendChild(h('div.eval-filtres', [
      h('label.case', [caseVersion, h('span', { text: 'Même version seulement' })]),
      h('label.case', [caseKm, h('span', { text: '± ' + AMX.fmtNombre(TOLERANCE_KM) + ' km du véhicule' })]),
      selTraction,
      h('span.espace'),
      h('span.doux', { text: liste.length + ' annonce' + (liste.length > 1 ? 's' : '') + ' retenue' + (liste.length > 1 ? 's' : '') }),
      tri, sensBtn
    ]));

    var moy = act.prix && act.prix.moyenne;
    var lignes = [];
    var moiInsere = !c.prixVise;
    var kmV = nombre(this.elKm.value);
    var ligneMoi = function () {
      return h('tr.eval-moi', [
        h('td.num', { text: c.rang ? String(c.rang) : '—', title: c.rang ? 'Votre rang : ' + c.rang + ' sur ' + c.rangSur + ', prix ramenés à votre kilométrage (1 = le moins cher)' : 'Entrez le prix de détail visé' }),
        h('td', [h('div', { text: 'Votre véhicule' }), h('div.mini', { text: AMX.CONCESSIONS_TOUTES[self.elConcession.value] || '' })]),
        h('td', [h('div', { text: self.elVersion.value.trim() || '—' }), self.tractionVehicule ? h('span.mini', { text: NOM_TRACTION[self.tractionVehicule] }) : null]),
        h('td.num', { text: self.elAnnee.value || '—' }),
        h('td.num', { text: kmV !== null ? fmtKm(kmV) : '—' }),
        h('td.num', { text: fmt(c.prixVise) }),
        h('td.num', { text: fmt(c.prixVise) }),
        h('td.num', { text: '—' }), h('td.num', { text: '—' }),
        h('td.num', { text: pct(c.marchePct) }),
        h('td', '')
      ]);
    };
    var desc = self.filtres.sens === 'desc', triK = self.filtres.tri;
    var moiVal = triK === 'prix' ? c.prixVise : (triK === 'km' ? kmV : null);
    var placerFin = moiVal === null || moiVal === undefined;   /* tri par année, jours, distance : « Votre véhicule » en dernier */
    liste.forEach(function (x, i) {
      var xv = triK === 'prix' ? x.ajuste : (triK === 'km' ? x.km : null);
      if (!moiInsere && !placerFin && xv !== null && xv !== undefined && (desc ? xv <= moiVal : xv >= moiVal)) { lignes.push(ligneMoi()); moiInsere = true; }
      var m = moy ? x.prix / moy : null;
      var tr = tractionDe(x.motricite);
      lignes.push(h('tr', [
        h('td.num', { text: String(x.rangAjuste || ''), title: 'Rang du prix ramené à votre kilométrage (1 = le moins cher)' }),
        h('td.sous', [h('div', { text: x.concession || '—' }), h('span.mini', { text: [x.ville, x.province].filter(Boolean).join(', ') + (x.certifie ? ' · certifié' : '') })]),
        h('td', [h('div', { text: x.version || '—' }), (x.style || tr) ? h('span.mini', { text: [x.style ? (STYLES.filter(function (y) { return y[0] === styleDe(x.style, x.portes, x.version, x.modele || self.elModele.value); })[0] || [, x.style])[1] : '', tr ? NOM_TRACTION[tr] : ''].filter(Boolean).join(' · ') }) : null]),
        h('td.num', { text: x.annee || '—' }),
        h('td.num', { text: fmtKm(x.km) }),
        h('td.num', { text: fmt(x.prix) }),
        h('td.num', { text: fmt(x.ajuste), title: kmV !== null ? 'Ramené à ' + fmtKm(kmV) : 'Entrez le km du véhicule pour ajuster' }),
        h('td.num', { text: fmtJ(x.jours) }),
        h('td.num', { text: x.distKm !== null && x.distKm !== undefined ? AMX.fmtNombre(x.distKm) + ' km' : '—' }),
        h('td.num' + (m ? (m > 1.03 ? '.sup' : (m < 0.97 ? '.inf' : '')) : ''), { text: pct(m) }),
        h('td', x.lien ? [h('a.petit', { href: x.lien, target: '_blank', rel: 'noopener', text: 'Voir' })] : '')
      ]));
    });
    if (!moiInsere) lignes.push(ligneMoi());
    var th = function (texte, cle, titre) {
      var actif = self.filtres.tri === cle, fl = actif ? (self.filtres.sens === 'desc' ? ' ▼' : ' ▲') : ' ↕';
      var b = h('th.num.eval-tri' + (actif ? '.actif' : ''), { title: (titre ? titre + ' — ' : '') + 'cliquez pour trier' }, [texte, h('span.fl', { text: fl })]);
      b.addEventListener('click', function () { if (self.filtres.tri === cle) self.filtres.sens = self.filtres.sens === 'desc' ? 'asc' : 'desc'; else { self.filtres.tri = cle; self.filtres.sens = 'asc'; } self.rendreMarche(); });
      return b;
    };
    this.elMarche.appendChild(h('div.eval-table', [h('table.tableau#eval-comparables', [
      h('thead', [h('tr', [th('Rang', 'prix', 'Rang du prix ramené à votre kilométrage (1 = le moins cher) — cliquez pour trier'), h('th', 'Concession'), h('th', 'Version'), th('Année', 'annee'), th('Odomètre', 'km'), th('Prix', 'brut'), th('Prix ajusté', 'prix', 'Prix ramené à votre kilométrage'), th('Jours', 'jours'), th('Distance', 'dist'), h('th.num', 'Marché %'), h('th', '')])]),
      h('tbody', lignes.length ? lignes : [h('tr', [h('td', { colspan: 11, text: 'Aucune annonce ne correspond aux filtres.' })])])
    ])]));

    var pied = [h('span', { text: 'Source : MarketCheck · ' + (a.lieu || (pays === 'us' ? 'États-Unis' : 'Canada')) + ', prix en ' + devise }), h('span', { text: 'Reçu ' + AMX.fmtDate(a.genereLe || new Date().toISOString(), true) })];
    (a.avertissements || []).forEach(function (t) { pied.push(h('span.puce.attention', { text: t })); });
    if (a.appels && typeof a.appels.n === 'number' && AMX.estAdmin()) {
      var q = a.appels.quota || 500, pctQ = Math.round(a.appels.n / q * 100);
      pied.push(h('span.puce' + (pctQ >= 85 ? '.alerte' : (pctQ >= 60 ? '.attention' : '')) + '#eval-appels', { text: 'Appels MarketCheck ce mois : ' + AMX.fmtNombre(a.appels.n) + ' / ' + AMX.fmtNombre(q), title: 'Compteur du plan gratuit — détails dans Outils › Comptes et droits › Données de marché' }));
    }
    if (this.derniereSauvegarde) pied.push(h('span.puce', { text: 'Dernière analyse conservée : standard ' + fmt(this.derniereSauvegarde.standard) + ' (' + AMX.fmtDateCourte(this.derniereSauvegarde.genereLe) + ')' }));
    this.elMarche.appendChild(h('div.eval-pied', pied));
  };

  // Rappel d'une évaluation enregistrée (sans les annonces, qui ne sont pas conservées).
  Evaluation.prototype.blocSauvegarde = function (m) {
    return h('div.alerte-bloc.ok', { style: { marginTop: '12px' } }, [
      h('span', { html: I.info }),
      h('div', [
        h('div', { text: 'Dernière analyse conservée le ' + AMX.fmtDate(m.genereLe, true) + (m.pays ? ' (marché ' + (m.pays === 'us' ? 'américain' : 'canadien') + (m.lieu ? ', ' + m.lieu : '') + ')' : '') + ' : agressif ' + fmt(m.agressif) + ' · standard ' + fmt(m.standard) + ' · conservateur ' + fmt(m.conservateur) + '.' }),
        h('div.mini', { text: (m.actifs ? m.actifs.n + ' annonces actives, prix moyen ' + fmt(m.actifs.prixMoy) : '') + (m.vendus ? ' · ' + m.vendus.n90 + ' ventes en 90 j' : '') + ' — relancez l\'analyse pour des chiffres du jour.' })
      ])
    ]);
  };

  /* ------------------------------ Données ------------------------------- */
  Evaluation.prototype.collecter = function () {
    var a = this.analyses[this.pays], marche = null;
    if (a && a.ok) {
      var c = this.calculs(a);
      marche = {
        pays: this.pays, portee: a.portee || this.portee[this.pays], etat: a.etat || '', etatNom: a.etatNom || '', devise: a.devise, lieu: a.lieu, rayonKm: a.rayonKm, genereLe: a.genereLe || new Date().toISOString(),
        agressif: c.agressif, standard: c.standard, conservateur: c.conservateur, marchePct: c.marchePct, rang: c.rang || null, rangSur: c.rangSur || null,
        actifs: a.actifs ? { n: a.actifs.n, prixMoy: a.actifs.prix && a.actifs.prix.moyenne, prixMed: a.actifs.prix && a.actifs.prix.mediane, kmMoy: a.actifs.km && a.actifs.km.moyenne, joursMoy: a.actifs.jours && a.actifs.jours.moyenne } : null,
        vendus: a.vendus ? { n90: a.vendus.n90, parMois: a.vendus.parMois, prixMoy: a.vendus.prix && a.vendus.prix.moyenne, kmMoy: a.vendus.km && a.vendus.km.moyenne } : null,
        filtres: Object.assign({}, this.filtres)
      };
    } else if (this.derniereSauvegarde) marche = this.derniereSauvegarde;
    if (marche && marche.valeurs) { marche = Object.assign({}, marche); delete marche.valeurs; }   // 1er nov. : plus de valeurs de guide (VinAudit)
    // Boîte « Canada ou États-Unis ? » : le bloc `us`, plus trois clés plates pour la fiche d'achat (EVAL_VERS_FICHE).
    var us = this.usCollecter();
    var sv = this.collecterSuivi();
    return {
      marque: this.elMarque.value, modele: this.elModele.value, annee: this.elAnnee.value, version: this.elVersion.value, carrosserie: this.elStyle.value,
      km: this.elKm.value, tauxKm: this.elTaux.value, prixVente: this.elPrix.value, prixAchat: this.elAchat.value, frais: this.elFrais.value, prixPaye: this.elPaye.value, recon: this.elRecon.value, marge: this.elMarge.value, concession: this.elConcession.value,
      comparables: this.comparablesCharges || [],
      reconDetail: this.reconDetail().postes, prixType: this.elPrixType.value, prixNote: this.elPrixNote.value.trim(),
      marche: marche,
      us: us,
      mmr: us && us.mmr !== null ? String(us.mmr) : '',
      tauxUs: us && us.tauxAjuste !== null ? String(us.tauxAjuste) : '',
      depenseUs: us ? String(us.ajustement) : '',
      suivi: sv.suivi, etatVehicule: sv.etatVehicule,
      etat: sv.etat, pneus: sv.pneus, pareBrise: sv.pareBrise, accident: sv.accident
    };
  };

  Evaluation.prototype.remplir = function (data) {
    var self = this;
    data = data || {};
    if (data.marque) this.elMarque.value = data.marque;
    if (data.modele) this.elModele.value = data.modele;
    if (data.annee) this.elAnnee.value = data.annee;
    if (data.version) this.elVersion.value = data.version;
    if (data.carrosserie !== undefined) { this.elStyle.value = data.carrosserie || ''; this.styleManuel = !!data.carrosserie; }
    if (data.km) this.elKm.value = data.km;
    if (data.tauxKm) this.elTaux.value = data.tauxKm;
    if (data.prixVente) this.elPrix.value = data.prixVente;
    if (data.prixPaye) this.elPaye.value = data.prixPaye;
    if (data.prixAchat) this.elAchat.value = data.prixAchat;
    if (data.frais !== undefined && data.frais !== '') this.elFrais.value = data.frais;
    if (!this.elAchat.value && data.prixPaye) this.elAchat.value = data.prixPaye;
    if (data.recon !== undefined && data.recon !== '') this.elRecon.value = data.recon;
    if (data.marge !== undefined && data.marge !== '') this.elMarge.value = data.marge;
    this.poserReconDetail(data.reconDetail);
    poserChoix(this.elPrixType, data.prixType); this.elPrixNote.value = data.prixNote || '';
    if (data.concession && AMX.concessionsPour('evaluations')[data.concession]) { this.elConcession.value = data.concession; this.rendreCie(); }
    this.comparablesCharges = Array.isArray(data.comparables) ? data.comparables.filter(function (c) { return c && (c.prix || c.source); }) : [];
    this.derniereSauvegarde = (data.marche && typeof data.marche === 'object') ? data.marche : null;
    this.chargerRappels();
    // Boîte « Canada ou États-Unis ? » : ce qui avait été réglé pour ce NIV.
    var u = (data.us && typeof data.us === 'object') ? data.us : null;
    this.us = { mmr: u && u.mmr !== null && u.mmr !== undefined ? String(u.mmr) : '', taux: u && u.tauxSource === 'saisie' && u.taux ? u.taux : null, tauxDate: '', tauxSource: u && u.tauxSource === 'saisie' ? 'saisie' : '',
      ecartPct: u && u.ecartPct !== null && u.ecartPct !== undefined ? u.ecartPct : null, ajustement: u && u.ajustement !== null && u.ajustement !== undefined ? u.ajustement : null,
      grosCA: u && u.grosCASource === 'saisie' && u.grosCA !== null && u.grosCA !== undefined ? String(u.grosCA) : '', grosCASource: u && u.grosCASource === 'saisie' ? 'saisie' : '',
      grosPct: u && u.grosPct !== null && u.grosPct !== undefined ? nombre(u.grosPct) : null };
    this.exportForce = !!(u && u.mmr !== null && u.mmr !== undefined && String(u.mmr) !== '');
    if (this.derniereSauvegarde && this.derniereSauvegarde.portee) { var pv = this.derniereSauvegarde.pays === 'us' ? 'us' : 'ca'; this.portee[pv] = porteeValide(this.derniereSauvegarde.portee, this.portee[pv]); if (this.derniereSauvegarde.etat && ETATS[pv][this.derniereSauvegarde.etat]) this.etats[pv] = this.derniereSauvegarde.etat; }
    // Statut posé par le serveur (Api.gs) : « auto » ou « enregistree » ; les anciennes fiches sans statut ont été enregistrées à la main.
    this.sauvegarde = { statut: data._statut === 'auto' ? 'auto' : 'enregistree', dateMaj: data._le || '', enregistreLe: data._enregistreLe || (data._statut === 'auto' ? '' : (data._le || '')), enregistrePar: data._enregistrePar || (data._statut === 'auto' ? '' : (data._par || '')) };
    this.rendreSauvegarde();
    this.remplirSuivi(data);
    if (this.derniereSauvegarde && this.derniereSauvegarde.pays) { this.pays = this.derniereSauvegarde.pays === 'us' ? 'us' : 'ca'; this.majSegment(); }
    this.analyses = { ca: null, us: null };
    this.enCours = { ca: false, us: false };
    this.genAnalyse.ca++; this.genAnalyse.us++;
    this.rendreMarche();
    this.rendreExport();
  };

  Evaluation.prototype.oublierAnalyses = function () {
    this.analyses = { ca: null, us: null };
    this.enCours = { ca: false, us: false };
    this.genAnalyse.ca++; this.genAnalyse.us++;
    this.rendreMarche();
  };

  Evaluation.prototype.reinitialiser = function () {
    var self = this;
    ['elMarque', 'elModele', 'elAnnee', 'elVersion', 'elKm', 'elPrix', 'elPaye', 'elRecon', 'elAchat', 'elFrais'].forEach(function (k) { self[k].value = ''; });
    this.elStyle.value = ''; this.styleManuel = false;
    this.poserReconDetail(null); this.elPrixType.value = ''; this.elPrixNote.value = '';
    this.ficheSource = '';
    this.comparablesCharges = [];
    this.derniereSauvegarde = null;
    this.sauvegarde = null; clearTimeout(this.minuterieAuto);
    this.rendreSauvegarde();
    this.remplirSuivi({});
    this.rappels = null; this.rappelsCle = ''; this.rendreRappels();
    this.us = { mmr: '', taux: null, tauxDate: '', tauxSource: '', ecartPct: null, ajustement: null, grosCA: '', grosCASource: '', grosPct: null };
    this.exportForce = false;
    this.analyses = { ca: null, us: null };
    this.enCours = { ca: false, us: false };
    this.genAnalyse.ca++; this.genAnalyse.us++;
    this.rendreMarche();
    this.rendreExport();
  };

  /* ---------------------------- Chargement ------------------------------ */
  Evaluation.prototype.charger = function (vin) {
    var self = this;
    vin = String(vin || '').trim().toUpperCase();
    if (!vin) return Promise.resolve();
    var gen = ++this.generation;
    this.vinCourant = vin; this.vinCharge = vin;
    this.reinitialiser();
    this.rendreContexte(); this.rendreLiens();
    if (!AMX.inventaire.parVin(vin)) AMX.inventaire.tout().then(function () { self.rendreContexte(); self.preremplirDepuisInventaire(); }, function () {});
    else this.preremplirDepuisInventaire();
    this.etat('Recherche…');
    return AMX.get('evalVin=' + encodeURIComponent(vin)).then(function (d) {
      if (gen !== self.generation) return;
      if (d && d.refuse) throw new Error(d.erreur || d.message || 'Accès refusé');
      if (d && d.trouve) {
        self.remplir(d.donnees || {});
        self.etat(d.dateMaj ? 'Évaluation du ' + AMX.fmtDate(d.dateMaj, true) : 'Évaluation chargée');
        if (!self.parametresPrets() || !self.elVersion.value.trim()) self.decoder(vin).then(function () { if (gen === self.generation && self.parametresPrets() && !d.donnees.marche) self.analyser(self.pays, false); });
      } else {
        self.etat('Décodage…');
        self.decoder(vin).then(function () { if (gen === self.generation && self.parametresPrets()) { self.etat(''); self.analyser(self.pays, false); } });
      }
      history.replaceState(null, '', AMX.lien('outils', 'evaluation', self.paramsAdresse(vin)));
    }).catch(function (e) {
      if (gen !== self.generation) return;
      self.vinCharge = '';
      self.etat('Impossible de joindre le serveur : ' + AMX.erreurTexte(e));
      AMX.toast('Impossible de charger l\'évaluation — ' + AMX.erreurTexte(e), 'erreur');
    });
  };

  // Le registre connaît souvent le km (fiche d'achat) et la concession : on s'en sert si les champs sont vides.
  Evaluation.prototype.preremplirDepuisInventaire = function () {
    var v = this.vinCourant ? AMX.inventaire.parVin(this.vinCourant) : null;
    if (!v) return;
    var cle = AMX.COMPAGNIE_CONCESSION[String(v.compagnie || '').toUpperCase()] || '';
    if (cle && cle !== 'stemarie') this.elConcession.value = cle;
    else if (cle === 'stemarie' && (this.elConcession.value === 'hawkesbury' || !this.elConcession.value)) this.elConcession.value = 'stemarie';
    this.rendreCie();
  };

  Evaluation.prototype.decoderDepuisChamp = function () {
    var vin = this.elNiv.value.trim();
    if (vin.length < 11) { AMX.toast('Entrez un NIV d\'au moins 11 caractères pour le décoder.', 'attention'); this.elNiv.focus(); return; }
    this.vinCourant = vin;
    this.rendreContexte(); this.rendreLiens();
    this.decoder(vin);
  };

  // Décodage : le décodeur du serveur d'abord (Decodeur.gs — année, marque,
  // modèle, version, feuille Decodage), NHTSA depuis le navigateur en repli ;
  // en parallèle, la fiche d'achat fournit le kilométrage (et le reste si le
  // décodeur ne répond pas). Renvoie une promesse tenue quand tout est posé.
  Evaluation.prototype.decoder = function (vin) {
    var self = this, btn = this.btnDecoder;
    vin = String(vin || '').trim().toUpperCase();
    btn.classList.add('occupe');
    this.etat('Décodage…');
    var serveur = AMX.get({ decoder: vin }).then(function (d) {
      if (d && d.ok && d.marque) return { make: d.marque, model: d.modele, year: d.annee, trim: d.version, carrosserie: d.carrosserie, portes: d.portes, motricite: d.motricite, source: 'serveur' };
      return decoderVin(vin).then(function (r) { return r ? Object.assign(r, { source: 'nhtsa' }) : null; });
    }).catch(function () { return decoderVin(vin).then(function (r) { return r ? Object.assign(r, { source: 'nhtsa' }) : null; }); });
    var fiche = AMX.ficheDe(vin).catch(function () { return null; });
    return Promise.all([serveur, fiche]).then(function (res) {
      if (self.vinCourant !== vin) return;
      var r = res[0], f = res[1] || {};
      if (r) {
        if (r.make) self.elMarque.value = r.make;
        if (r.model) self.elModele.value = r.model;
        if (r.year) self.elAnnee.value = r.year;
        if (r.trim) self.elVersion.value = r.trim;
        if (!self.styleManuel) self.elStyle.value = styleDe(r.carrosserie, r.portes, r.trim, r.model);
        self.tractionVehicule = tractionDe(r.motricite);
        if (!self.tractionManuelle) self.filtres.traction = self.tractionVehicule === 'avant' || self.tractionVehicule === 'arriere' ? self.tractionVehicule : (self.tractionVehicule || '');
      }
      // La fiche d'achat complète ce qui manque (et donne le km).
      if (!self.elMarque.value.trim() && f['f-marque']) self.elMarque.value = f['f-marque'];
      if (!self.elModele.value.trim() && f['f-modele']) self.elModele.value = f['f-modele'];
      if (!self.elAnnee.value.trim() && f['f-annee']) self.elAnnee.value = String(f['f-annee']).replace(/[^0-9]/g, '');
      if (!self.elKm.value.trim() && f['f-km']) self.elKm.value = String(f['f-km']).replace(/[^0-9]/g, '');
      // Coûts de la fiche : acquisition (achat + frais) → prix payé ; remise en état → reconditionnement.
      var somme = function (cles) { var t = 0, vu = false; cles.forEach(function (k) { var n = nombre(f[k]); if (n !== null) { t += n; vu = true; } }); return vu ? Math.round(t) : null; };
      var achatFiche = somme(['f-prixachat']);
      var fraisFiche = somme(['f-fraisencan', 'f-fraisautres', 'f-fraistransport', 'f-carfax']);
      var remise = somme(['f-accessoires', 'f-carrosserie', 'f-service', 'f-lavage', 'f-lavagelivraison', 'f-enregistrementcout', 'f-adj1montant', 'f-adj2montant', 'f-presafetymontant']);
      var repris = [];
      if (!self.elAchat.value.trim() && achatFiche) { self.elAchat.value = String(achatFiche); repris.push('achat'); }
      if (!self.elFrais.value.trim() && fraisFiche) { self.elFrais.value = String(fraisFiche); repris.push('frais'); }
      if (!self.elRecon.value.trim() && remise) { self.elRecon.value = String(remise); repris.push('reconditionnement'); }
      if (repris.length) { self.ficheSource = repris.join(', '); self.recalculerDetail('achat'); }
      else if (!self.elPrix.value.trim()) self.recalculerDetail('couts');
      self.rendreSommaire();
      self.chargerRappels();
      if (!r && !self.parametresPrets()) AMX.toast('Décodage indisponible pour ce NIV — remplissez marque, modèle et année à la main.', 'attention');
      else if (r) self.etat('Véhicule décodé : ' + [self.elAnnee.value, self.elMarque.value, self.elModele.value, self.elVersion.value].filter(Boolean).join(' ') + (f['f-km'] ? ' · ' + AMX.fmtNombre(parseInt(self.elKm.value, 10)) + ' km (fiche d\'achat)' : '') + '.');
      self.oublierAnalyses();
    }).then(function () { btn.classList.remove('occupe'); }, function () { btn.classList.remove('occupe'); });
  };

  Evaluation.prototype.rendreContexte = function () {
    var vin = this.vinCourant;
    AMX.vider(this.elContexte);
    var v = vin ? AMX.inventaire.parVin(vin) : null;
    if (!v) { this.elContexte.classList.add('cache'); return; }
    this.elContexte.classList.remove('cache');
    this.elContexte.appendChild(h('span.mono.doux', { text: vin }));
    this.elContexte.appendChild(AMX.badgeStatut(v.statut, v._feuille));
    if (v.modele) this.elContexte.appendChild(h('span.modele', { text: v.modele }));
    if (v._feuille) this.elContexte.appendChild(h('span.puce', { text: 'Registre ' + AMX.inventaire.nomFeuille(v._feuille) }));
    if (v.stock) this.elContexte.appendChild(h('span.puce.mono', { text: v.stock }));
    if (v.compagnie) this.elContexte.appendChild(h('span.puce', { text: v.compagnie }));
    if (v._feuille) this.elContexte.appendChild(h('a.petit', { href: AMX.lien('inventaire', String(v._feuille).toLowerCase(), { vin: vin }), text: 'Voir dans l\'inventaire' }));
  };

  /* ---------------------------- Feuille d'offre ---------------------------
     Page imprimable (Enregistrer en PDF du navigateur) : la concession, le
     véhicule, l'offre d'achat / valeur d'échange, la validité, les conditions
     et les signatures. L'en-tête vient de ?concessionInfo= (Contrat.gs) ; sans
     la route, le nom de la concession suffit. */
  Evaluation.prototype.feuilleOffre = function () {
    var self = this;
    var veh = [this.elAnnee.value, this.elMarque.value, this.elModele.value, this.elVersion.value].filter(Boolean).join(' ');
    if (!veh) { AMX.toast('Décodez d\'abord le véhicule (année, marque, modèle).', 'attention'); return; }
    var montantDefaut = nombre(this.elAchat.value) || nombre(this.elPaye.value) || '';
    var cMontant = h('input.saisie#offre-montant', { type: 'number', inputmode: 'numeric', value: montantDefaut !== '' ? String(Math.round(montantDefaut)) : '', placeholder: 'Montant offert' });
    var cValidite = h('input.saisie#offre-validite', { type: 'number', inputmode: 'numeric', value: String(AMX.memo.lire('offre_validite', '7')), min: '1', max: '60', style: { width: '80px' } });
    var cClient = h('input.saisie#offre-client', { type: 'text', placeholder: 'Nom du client (facultatif)', autocomplete: 'off' });
    var cNotes = h('textarea.saisie#offre-notes', { rows: '3', placeholder: 'Conditions particulières, équipement, remarques (facultatif)' });
    var corps = h('div.offre-formulaire', [
      h('p.doux.petit', { text: veh + (this.vinCourant ? ' · ' + this.vinCourant : '') + (this.elKm.value ? ' · ' + fmtKm(nombre(this.elKm.value)) : '') }),
      h('div.grille', [
        h('div.champ', [h('label', { 'for': 'offre-montant', text: 'Offre d\'achat / valeur d\'échange ($)' }), cMontant]),
        h('div.champ', [h('label', { 'for': 'offre-validite', text: 'Valide (jours)' }), cValidite])
      ]),
      h('div.champ', [h('label', { 'for': 'offre-client', text: 'Client' }), cClient]),
      h('div.champ', [h('label', { 'for': 'offre-notes', text: 'Notes' }), cNotes])
    ]);
    AMX.confirmer('Feuille d\'offre — ' + veh, corps, { ok: 'Imprimer / PDF' }).then(function (oui) {
      if (!oui) return;
      var montant = nombre(cMontant.value);
      if (!montant) { AMX.toast('Entrez le montant offert.', 'attention'); return; }
      AMX.memo.ecrire('offre_validite', String(parseInt(cValidite.value, 10) || 7));
      var cle = self.elConcession.value;
      AMX.get({ concessionInfo: cle }).catch(function () { return null; }).then(function (info) {
        self.imprimerOffre({ montant: montant, validite: parseInt(cValidite.value, 10) || 7, client: cClient.value.trim(), notes: cNotes.value.trim(), concession: (info && info.ok) ? info : { nom: AMX.CONCESSIONS_TOUTES[cle] || cle } });
      });
    }).catch(function () {});
  };
  Evaluation.prototype.imprimerOffre = function (o) {
    var c = o.concession || {}, veh = [this.elAnnee.value, this.elMarque.value, this.elModele.value, this.elVersion.value].filter(Boolean).join(' ');
    var km = nombre(this.elKm.value), a = this.analyses[this.pays], calc = (a && a.ok) ? this.calculs(a) : null;
    var auj = new Date(), fin = new Date(auj.getTime() + o.validite * 86400000);
    var ancienne = document.getElementById('offre-impression'); if (ancienne) ancienne.remove();
    var adresse = [c.adressePhys || c.adresse, [c.villePhys || c.ville, c.province].filter(Boolean).join(', '), c.codePostalPhys || c.codePostal].filter(Boolean).join(' · ');
    var page = h('div#offre-impression.offre-impression', [
      h('div.offre-entete', [
        h('div', [h('div.offre-concession', { text: c.nomOfficiel || c.nom || AMX.CONCESSIONS_TOUTES[this.elConcession.value] || '' }), adresse ? h('div.doux', { text: adresse }) : null, h('div.doux', { text: [c.telephone, c.courriel].filter(Boolean).join(' · ') }), c.noConcessionnaire ? h('div.doux', { text: (c.province === 'ON' ? 'Permis de commerçant (OMVIC) ' : 'Permis de commerçant (SAAQ) ') + c.noConcessionnaire }) : null]),
        h('div.offre-titre', [h('h1', 'Offre d\'achat'), h('div.doux', { text: 'Émise le ' + AMX.fmtDate(auj.toISOString()) + ' · valide jusqu\'au ' + AMX.fmtDate(fin.toISOString()) + ' (' + o.validite + ' jours)' })])
      ]),
      o.client ? h('div.offre-client', [h('span.l', 'Client'), h('span', { text: o.client })]) : null,
      h('table.offre-vehicule', [h('tbody', [
        h('tr', [h('th', 'Véhicule'), h('td', { text: veh })]),
        h('tr', [h('th', 'NIV'), h('td.mono', { text: this.vinCourant || this.elNiv.value.trim().toUpperCase() || '—' })]),
        h('tr', [h('th', 'Kilométrage'), h('td', { text: km !== null ? fmtKm(km) : '—' })]),
        h('tr', [h('th', 'Concession'), h('td', { text: c.nomOfficiel || c.nom || AMX.CONCESSIONS_TOUTES[this.elConcession.value] || '' })])
      ])]),
      h('div.offre-montant', [h('div.l', 'Offre d\'achat / valeur d\'échange'), h('div.v', { text: fmt(o.montant) }), h('div.m', 'Taxes en sus s\'il y a lieu. Montant payable à la livraison du véhicule et des documents.')]),
      calc && calc.standard ? h('p.offre-marche', { text: 'Repère de marché (' + (a.lieu || '') + ', ' + AMX.fmtDate(a.genereLe || auj.toISOString()) + ') : prix de détail standard ' + fmt(calc.standard) + ' sur ' + ((a.actifs && a.actifs.n) || 0) + ' annonces actives comparables.' }) : null,
      o.notes ? h('div.offre-notes', [h('div.l', 'Notes'), h('div', { text: o.notes })]) : null,
      h('div.offre-conditions', [h('div.l', 'Conditions'), h('ul', [
        h('li', 'Offre conditionnelle à l\'inspection mécanique et esthétique du véhicule et à la conformité de l\'odomètre.'),
        h('li', 'Conditionnelle à la vérification de l\'historique (CARFAX) et à l\'absence de lien, de dette ou de saisie sur le véhicule.'),
        h('li', 'Le véhicule doit être livré avec ses clés, son certificat d\'immatriculation et, s\'il y a lieu, la quittance du créancier.'),
        h('li', 'Offre valide ' + o.validite + ' jours à compter de son émission ; l\'état du véhicule doit être le même qu\'au moment de l\'évaluation.')
      ])]),
      h('div.offre-signatures', [
        h('div', [h('div.trait'), h('div.doux', { text: 'Évaluateur — ' + (AMX.session.nom || AMX.session.courriel || '') })]),
        h('div', [h('div.trait'), h('div.doux', 'Client — date')])
      ]),
      h('div.offre-pied', { text: 'Document généré par ScanAutomax · ' + AMX.fmtDate(auj.toISOString(), true) })
    ]);
    document.body.appendChild(page);
    document.body.classList.add('impression-offre');
    var nettoyer = function () { document.body.classList.remove('impression-offre'); window.removeEventListener('afterprint', nettoyer); setTimeout(function () { if (page.parentNode) page.remove(); }, 500); };
    window.addEventListener('afterprint', nettoyer);
    setTimeout(function () { window.print(); }, 60);
    // Sans événement afterprint (certains navigateurs), on nettoie après coup.
    setTimeout(function () { if (document.body.classList.contains('impression-offre')) nettoyer(); }, 60000);
  };

  /* --------------------------- Enregistrement --------------------------- */
  // Sauvegarde automatique : après chaque analyse, et 1,5 s après une
  // modification des prix ou du véhicule, dès qu'il y a un NIV complet. Le
  // serveur garde le statut « enregistree » si « Enregistrer » a déjà été cliqué.
  Evaluation.prototype.vinPourSauvegarde = function () {
    var vin = this.elNiv.value.trim().toUpperCase();
    return /^[A-HJ-NPR-Z0-9]{17}$/.test(vin) ? vin : '';
  };
  Evaluation.prototype.planifierAuto = function () {
    var self = this;
    if (!this.vinPourSauvegarde()) return;
    if (!(this.analyses[this.pays] && this.analyses[this.pays].ok) && !this.derniereSauvegarde) return;
    clearTimeout(this.minuterieAuto);
    this.minuterieAuto = setTimeout(function () { self.sauvegarderAuto(); }, 1500);
  };
  Evaluation.prototype.sauvegarderAuto = function () {
    var self = this, vin = this.vinPourSauvegarde();
    clearTimeout(this.minuterieAuto);
    if (!vin || !this.parametresPrets()) return Promise.resolve();
    if (this.vinEfface && vin === this.vinEfface) return Promise.resolve();   /* 21 oct. : ne pas recréer l'évaluation qu'on vient d'effacer */
    // (9 oct.) un NIV tapé mais pas encore chargé : on ne sauvegarde pas les chiffres de l'ancien véhicule sous le nouveau.
    if (this.vinCourant && vin !== String(this.vinCourant).trim().toUpperCase()) return Promise.resolve();
    var data = this.collecter(), gen = this.generation;
    return AMX.post({ action: 'saveEvaluation', vin: vin, data: data, auto: true }).then(function (d) {
      if (gen !== self.generation || !d || !d.ok) return;
      self.vinCourant = vin; self.vinCharge = vin;
      if (data.marche) self.derniereSauvegarde = data.marche;
      if (data.us) AMX.export.oublierVerdicts();
      self.sauvegarde = { statut: d.statut || 'auto', dateMaj: d.dateMaj || new Date().toISOString(), enregistreLe: d.enregistreLe || '', enregistrePar: d.enregistrePar || '' };
      self.rendreSauvegarde();
      history.replaceState(null, '', AMX.lien('outils', 'evaluation', self.paramsAdresse(vin)));
    }).catch(function () { /* silencieux : le bouton Enregistrer reste là */ });
  };
  Evaluation.prototype.rendreSauvegarde = function () {
    var el = this.elSauvegarde; if (!el) return;
    AMX.vider(el);
    var sv = this.sauvegarde;
    if (this.btnEffacer) this.btnEffacer.style.display = (sv && (AMX.perm('supprimer') || AMX.estAdmin())) ? '' : 'none';
    if (!sv) { this.btnEnregistrer.classList.remove('ok'); return; }   /* 12 nov. : rien à dire tant qu'il n'y a pas de NIV */
    if (sv.statut === 'enregistree') {
      el.appendChild(h('span.puce.ok', { text: 'Enregistrée' + (sv.enregistreLe ? ' le ' + AMX.fmtDate(sv.enregistreLe, true) : '') + (sv.enregistrePar ? ' par ' + sv.enregistrePar.split('@')[0] : '') }));
      if (sv.dateMaj && sv.enregistreLe && sv.dateMaj > sv.enregistreLe) el.appendChild(h('span.mini.doux', { text: 'modifiée depuis (' + AMX.fmtDate(sv.dateMaj, true) + ')' }));
      this.btnEnregistrer.classList.add('ok');
    } else {
      el.appendChild(h('span.puce.gris', { text: 'Brouillon gardé' + (sv.dateMaj ? ' · ' + AMX.fmtDate(sv.dateMaj, true) : ''), title: 'Gardée automatiquement ; « Enregistrer » la confirme (verte dans le registre)' }));
      this.btnEnregistrer.classList.remove('ok');
    }
  };

  /* Effacer l'évaluation du NIV (21 oct.) : POST evaluationEffacer (EvaluationEffacer.gs), confirmation en retapant le NIV ;
     la page repart à vide et le registre est relu. */
  Evaluation.prototype.effacer = function () {
    var self = this, vin = this.elNiv.value.trim().toUpperCase();
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin) || !this.sauvegarde) return;
    AMX.confirmerSaisie('Effacer l\'évaluation', 'L\'évaluation de ' + vin + ' sera retirée du registre (analyse, prix, comparaison Canada / É.-U.). Retapez le NIV complet pour confirmer.', vin, { ok: 'Effacer', danger: true }).then(function (ok) {
      if (!ok) return;
      clearTimeout(self.minuterieAuto);
      self.vinEfface = vin;
      return AMX.post({ action: 'evaluationEffacer', vin: vin }).then(function (r) {
        if (r && r.vehicules && !r.efface) throw new Error('le script n\'est pas à jour : redéployez-le (EvaluationEffacer.gs)');
        if (!r || r.ok === false || r.refuse) throw new Error((r && r.erreur) || 'refusé par le serveur');
        try { AMX.cacheLocal.oublier('evaluations'); } catch (e) {}
        AMX.toast('Évaluation de ' + vin + ' effacée' + (r.lignes > 1 ? ' (' + r.lignes + ' lignes)' : '') + '.', 'ok');
        self.elNiv.value = ''; self.vinCourant = ''; self.vinCharge = '';
        self.reinitialiser();
        try { history.replaceState(null, '', AMX.lien('outils', 'evaluation', {})); } catch (e2) {}
        if (typeof self.rendreLiens === 'function') self.rendreLiens();
        setTimeout(function () { if (self.vinEfface === vin) self.vinEfface = ''; }, 20000);
      });
    }).catch(function (e) { self.vinEfface = ''; AMX.toast('Effacement impossible — ' + AMX.erreurTexte(e), 'erreur'); });
  };

  Evaluation.prototype.enregistrer = function () {
    var self = this, btn = this.btnEnregistrer;
    var vin = this.elNiv.value.trim().toUpperCase();
    if (!vin) {
      this.etat('Entrez le NIV.');
      AMX.toast('Entrez un NIV pour enregistrer l\'évaluation.', 'attention');
      this.elNiv.focus();
      return;
    }
    btn.classList.add('occupe');
    this.etat('Enregistrement…');
    var data = this.collecter();
    AMX.post({ action: 'saveEvaluation', vin: vin, data: data }).then(function (d) {
      AMX.verifier(d, 'Enregistrement refusé par le serveur');
      var quand = AMX.fmtDate(d.dateMaj || new Date().toISOString(), true);
      self.vinCourant = vin; self.vinCharge = vin;
      if (data.marche) self.derniereSauvegarde = data.marche;
      if (data.us) AMX.export.oublierVerdicts();
      self.sauvegarde = { statut: 'enregistree', dateMaj: d.dateMaj || new Date().toISOString(), enregistreLe: d.enregistreLe || d.dateMaj || new Date().toISOString(), enregistrePar: d.enregistrePar || (AMX.session && AMX.session.courriel) || '' };
      self.rendreSauvegarde();
      self.etat('Enregistrée (' + quand + ')');
      AMX.toast('Évaluation enregistrée (NIV ' + vin + ')', 'ok');
      // Alerte aux directeurs (Notif.gs, 6 oct.) : ce NIV a été évalué dans une autre concession il y a moins de 30 jours.
      if (d.alerte && d.alerte.ok) {
        var n = (d.alerte.destinataires || []).length;
        self.etat('Attention : ce véhicule a aussi été évalué chez ' + (AMX.COMPAGNIES_TOUTES[(d.alerte.concessions || [])[0]] || 'une autre concession') + ' — ' + n + ' directeur' + (n > 1 ? 's' : '') + ' prévenu' + (n > 1 ? 's' : '') + ' (' + (d.alerte.courriels || 0) + ' courriel' + ((d.alerte.courriels || 0) > 1 ? 's' : '') + ', ' + (d.alerte.textos || 0) + ' texto' + ((d.alerte.textos || 0) > 1 ? 's' : '') + ').', 'attention');
        AMX.toast('Alerte envoyée aux directeurs : même véhicule évalué dans deux concessions (' + (d.alerte.textos || 0) + ' texto' + ((d.alerte.textos || 0) > 1 ? 's' : '') + ', ' + (d.alerte.courriels || 0) + ' courriel' + ((d.alerte.courriels || 0) > 1 ? 's' : '') + ').', 'attention', 8000);
      }
      history.replaceState(null, '', AMX.lien('outils', 'evaluation', self.paramsAdresse(vin)));
      self.rendreContexte();
      // 27 oct. : la demande d'évaluation de ce NIV est faite (DemandesEval.gs). 2 nov. : dans le circuit du directeur, le
      // montant attend sa confirmation ; si c'est un directeur qui enregistre, la fenêtre « Confirmer le montant » s'ouvre.
      // Sans ?demande= dans l'adresse, une demande ouverte de ce NIV qui m'est confiée est marquée faite quand même.
      var idDem = (self.demandeId && self.demande && self.demande.vin === vin) ? self.demandeId : '';
      if (AMX.evalDemandes) (idDem || AMX.evalDemandes.enCache() ? Promise.resolve() : AMX.evalDemandes.charger(false)).then(function () {
        if (!idDem) {
          var cacheDem = AMX.evalDemandes.enCache() || {}, moiDem = cacheDem.moi || {};
          var ouverte = (cacheDem.demandes || []).filter(function (x) { return x.vin === vin && (x.etat === 'afaire' || x.etat === 'encours') && (x.pourMoi || moiDem.evaluateur || moiDem.diriger); })[0];
          if (!ouverte) return;
          idDem = ouverte.id;
        }
        return AMX.evalDemandes.faite(idDem).then(function (r) {
          AMX.toast(r.message || 'Demande faite', 'ok', 6000);
          if (self.demandeId === idDem && self.dessinerDemande && r.demande) self.dessinerDemande(r.demande);
          if (r.peutConfirmer && AMX.evalDemandes.confirmer) AMX.evalDemandes.confirmer(idDem);
        });
      }).catch(function (e) { if (idDem) AMX.toast('Demande ' + idDem + ' : ' + AMX.erreurTexte(e), 'attention', 8000); });
    }).catch(function (e) {
      self.etat('Échec de l\'enregistrement : ' + AMX.erreurTexte(e));
      AMX.toast('Échec de l\'enregistrement — ' + AMX.erreurTexte(e), 'erreur');
    }).then(function () { btn.classList.remove('occupe'); });
  };


  /* =====================================================================
     Registre des évaluations (Inventaire › Évaluations › Registre)
     GET ?evaluations=1[&concession=] → { ok, evaluations: [...], parConcession, total }
     Une ligne par véhicule évalué ; filtre par concession (toutes les
     concessions du groupe, y compris celles qu'on ajoute), recherche, tri,
     export Excel ; cliquer une ligne ouvre l'évaluation.
     ===================================================================== */
  function Registre(ctx) {
    var self = this;
    injecterCss();
    this.liste = null; this.parConcession = {}; this.erreur = ''; this.refus = '';
    this.generation = 0;
    // Même concession que le reste du site (7 oct.) : choix partagé Inventaire / Service / Résultats.
    this.concession = AMX.COMPAGNIE_CONCESSION[AMX.compagnieChoisie('evaluations')] || '';
    if (this.concession && !AMX.concessionsPour('evaluations')[this.concession]) this.concession = '';
    this.recherche = '';
    this.statut = AMX.memo.lire('registre_eval_statut', 'tous');
    if (!STATUTS_REGISTRE.some(function (x) { return x[0] === self.statut; })) this.statut = 'tous';
    this.tri = { cle: 'dateMaj', desc: true };
    this.construire();
    this.appliquerParams(ctx);
    // 26 oct. : la concession choisie en haut du site change le registre sur place (sans recharger la page).
    this.surCompagnie = function () { var k = AMX.COMPAGNIE_CONCESSION[AMX.compagnieChoisie('evaluations')] || ''; if (k !== self.concession) { self.concession = k; self.rendre(); if (AMX.gesteMenuRecent()) self.charger(); } };
    document.addEventListener('amx:compagnie', this.surCompagnie);
    this.charger(false);
  }
  Registre.prototype.demonter = function () { this.generation++; document.removeEventListener('amx:compagnie', this.surCompagnie); };
  Registre.prototype.naviguer = function (ctx) { if (this.appliquerParams(ctx) && this.liste) this.rafraichir(); };
  /** ?suivi=relancer (lien de l'Accueil « Clients à relancer ») ; renvoie vrai si un filtre a changé. */
  Registre.prototype.appliquerParams = function (ctx) {
    var s = ctx && ctx.params && ctx.params.suivi;
    if (!s || (s !== 'relancer' && s !== 'aucun' && !statutSuivi(s)) || s === this.suivi) return false;
    this.suivi = s; if (s !== 'relancer') AMX.memo.ecrire('registre_eval_suivi', s);
    return true;
  };

  /* 26 oct. (Maxime : « le registre des évaluations doit suivre le concessionnaire et être simple à regarder ») :
     même règle que les autres pages — les filtres d'abord, « Chiffres et liste », des chiffres calculés sur la liste
     filtrée, puis la liste. Le tableau « Simple » (par défaut) garde l'essentiel ; « Détaillé » remet tout. Quand on
     regarde tout le groupe, un tableau « Par concession » dit où en est chaque concessionnaire (un clic = choisir). */
  var COL_REGISTRE = [
    { cle: 'dateMaj', libelle: 'Date', simple: true, valeur: function (r) { return r.dateMaj || ''; } },
    { cle: 'vehicule', libelle: 'Véhicule', simple: true, valeur: function (r) { return [r.annee, r.marque, r.modele, r.version].filter(Boolean).join(' '); } },
    { cle: 'vin', libelle: 'NIV' },
    { cle: 'concession', libelle: 'Concession', simple: true, groupe: true, valeur: function (r) { return AMX.CONCESSIONS_TOUTES[concessionDe(r)] || ''; } },
    { cle: 'client', libelle: 'Client · suivi', simple: true, valeur: function (r) { return (r.suivi && r.suivi.client) || ''; } },
    { cle: 'par', libelle: 'Évaluateur', simple: true, valeur: function (r) { return (r.par || '').split('@')[0]; } },
    { cle: 'prixPaye', libelle: 'Payé', num: true, simple: true, valeur: function (r) { return nombre(r.prixPaye); } },
    { cle: 'recon', libelle: 'Recon', num: true, valeur: function (r) { return nombre(r.recon); } },
    { cle: 'prixVente', libelle: 'Détail', num: true, simple: true, valeur: function (r) { return nombre(r.prixVente); } },
    { cle: 'marge', libelle: 'Marge', num: true, simple: true, valeur: function (r) { return nombre(r.marge); } },
    { cle: 'standard', libelle: 'Marché std', num: true, valeur: function (r) { return r.standard; } },
    { cle: 'marchePct', libelle: 'Marché %', num: true, simple: true, valeur: function (r) { return r.marchePct; } },
    { cle: 'us', libelle: 'CA / É.-U.', num: true, valeur: function (r) { return r.us && typeof r.us.ecart === 'number' ? r.us.ecart : null; } },
    { cle: 'veille', libelle: 'Veille', num: true, valeur: function (r) { return r.veille && typeof r.veille.marchePct === 'number' ? r.veille.marchePct : null; } },
    { cle: 'statut', libelle: 'Statut', simple: true, valeur: function (r) { return r.statut === 'auto' ? 'auto' : 'enregistree'; } }
  ];

  var PERIODES_REGISTRE = [['tout', 'Tout'], ['j30', '30 jours'], ['trimestre', 'Trimestre'], ['annee', 'Année']];
  var STATUTS_REGISTRE = [['tous', 'Toutes'], ['enregistree', 'Enregistrées'], ['auto', 'Analyses auto']];
  var SUIVIS_FINAUX = { perdu: 1, repris: 1, reprisWholesale: 1 };
  function debutPeriode(cle) {
    var now = new Date(), y = now.getFullYear(), m = now.getMonth();
    if (cle === 'j30') { var d = new Date(now); d.setDate(d.getDate() - 30); return d.getTime(); }
    if (cle === 'trimestre') return new Date(y, Math.floor(m / 3) * 3, 1).getTime();
    if (cle === 'annee') return new Date(y, 0, 1).getTime();
    return -Infinity;
  }
  function nomCourt(cle) { return (AMX.CONCESSIONS_TOUTES[cle] || cle || '').replace(' Chevrolet Buick Cadillac', '').replace(/^Hawkesbury Chevrolet$/, 'Hawkesbury'); }   // « Ste Marie Automobiles Ltée » reste entier (Maxime, 6 oct.)
  var COULEUR_CONCESSION = { stemarie: 'vert', hawkesbury: 'bleu', vwbrossard: 'violet', bmwsherbrooke: 'sombre', hyundailongueuil: 'ambre' };
  function depuis(iso) {
    var t = new Date(iso).getTime(); if (isNaN(t)) return '';
    var j = Math.floor((Date.now() - t) / 86400000);
    if (j <= 0) return 'aujourd\'hui'; if (j === 1) return 'hier'; if (j < 30) return 'il y a ' + j + ' j'; if (j < 365) return 'il y a ' + Math.round(j / 30) + ' mois'; return 'il y a ' + Math.round(j / 365) + ' an' + (j >= 730 ? 's' : '');
  }
  function aujourdhui() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  /** Client à relancer : une date de relance passée (ou aujourd'hui) et un suivi pas encore réglé. */
  function aRelancer(r) { var su = r.suivi; return !!(su && su.relanceLe && !SUIVIS_FINAUX[su.statut] && String(su.relanceLe).slice(0, 10) <= aujourdhui()); }
  function suiviCorrespond(r, s) {
    var st = (r.suivi && r.suivi.statut) || '';
    if (s === 'aucun') return !st;
    if (s === 'relancer') return aRelancer(r);
    return st === s;
  }

  Registre.prototype.construire = function () {
    var self = this;
    this.periode = AMX.memo.lire('registre_eval_periode', 'tout');
    if (!PERIODES_REGISTRE.some(function (p) { return p[0] === self.periode; })) this.periode = 'tout';
    this.colonnes = AMX.memo.lire('registre_eval_colonnes', 'simple') === 'detail' ? 'detail' : 'simple';
    this.acheteur = '';
    this.suivi = AMX.memo.lire('registre_eval_suivi', '');
    if (this.suivi !== 'aucun' && !statutSuivi(this.suivi)) this.suivi = '';
    this.elEtat = h('p', { text: 'Chargement du registre…' });
    this.btnRafraichir = h('button.btn', { type: 'button', html: I.rafraichir + '<span>Rafraîchir</span>', onclick: function () { self.charger(true); } });
    this.btnExport = h('button.btn', { type: 'button', html: I.telecharger + '<span>Exporter Excel</span>', onclick: function () { self.exporter(); } });
    this.btnNouvelle = h('a.btn.primaire', { href: AMX.lien('outils', 'evaluation', {}), html: I.plus + '<span>Nouvelle évaluation</span>' });
    var actions = AMX.actionsEntete ? AMX.actionsEntete([this.btnRafraichir, this.btnExport, this.btnNouvelle], [this.btnNouvelle]) : [this.btnRafraichir, this.btnExport, this.btnNouvelle];
    var entete = h('div.entete-page', [
      h('div', { style: { minWidth: 0 } }, [h('h1#registre-titre', 'Registre des évaluations'), this.elEtat]),
      h('div.actions', actions)
    ]);
    this.elCartes = h('div.barre-cies#registre-kpis');   /* 16 oct. : même rangée de concessions que partout */
    this.elVeille = h('div#registre-veille');
    // Filtres
    this.elRecherche = h('input.saisie#registre-recherche', { type: 'search', placeholder: 'NIV, modèle, client, téléphone, conseiller…', autocomplete: 'off', 'aria-label': 'Chercher dans le registre',
      oninput: AMX.debounce(function (e) { self.recherche = e.target.value; self.rafraichir(); }, 120) });
    this.elSuiviPastilles = h('div.inv2-statuts#registre-suivis', { role: 'group', 'aria-label': 'Suivi du client' });
    this.elSegment = h('div.segment', { role: 'group', 'aria-label': 'Période' });
    this.elSegmentStatut = h('div.segment#registre-statut', { role: 'group', 'aria-label': 'Statut' });
    this.elColonnes = h('div.segment#registre-colonnes', { role: 'group', 'aria-label': 'Colonnes' });
    this.elAcheteur = h('select.saisie#registre-acheteur', { 'aria-label': 'Évaluateur', style: { height: '34px', width: 'auto' } });
    this.elAcheteur.addEventListener('change', function () { self.acheteur = self.elAcheteur.value; self.rafraichir(); });
    var barre = h('div.carte.registre-barre', [h('div.carte-corps', [
      h('div.registre-outils', [h('div.recherche', [h('span', { html: I.recherche }), this.elRecherche]), this.elSegment, this.elSegmentStatut, this.elAcheteur, this.elColonnes]),
      h('div.registre-outils.registre-suivis', [h('span.doux.petit', { text: 'Suivi du client' }), this.elSuiviPastilles])
    ])]);
    this.elPortee = h('div.portee-chiffres');
    this.elKpis = h('div.kpis.registre-chiffres#registre-chiffres');
    this.elParCie = h('div#registre-par-concession');
    this.elTable = h('div.eval-table.registre-table');
    this.elVide = h('div');
    this.el = h('div.page.eval-page.registre-page', [entete, this.elCartes, barre, this.elPortee, this.elKpis, this.elVeille, this.elParCie, this.elVide, h('div.carte', [h('div.carte-corps.registre-corps', [this.elTable])])]);
  };

  Registre.prototype.charger = function (manuel) {
    var self = this, gen = ++this.generation;
    if (manuel) this.btnRafraichir.classList.add('occupe');
    // Les verdicts Canada / É.-U. (8 oct.) arrivent par une seconde route, sans bloquer le registre.
    AMX.get({ evaluationsUs: 1 }).then(function (u) { if (gen !== self.generation || !u || !u.ok) return; self.us = u.parVin || {}; if (self.liste) { self.liste.forEach(function (r) { r.us = self.us[r.vin] || null; }); self.rendreTable(); } }).catch(function () {});
    var appliquer = function (d, copieLe) {
      self.liste = d.evaluations || []; self.parConcession = d.parConcession || {}; self.erreur = ''; self.refus = ''; self.copieLe = copieLe || 0;
      if (self.us) self.liste.forEach(function (r) { r.us = self.us[r.vin] || null; });
      self.rendre();
    };
    if (!this.liste) {   /* 16 oct. (Google lent) : la dernière copie du navigateur s'affiche tout de suite, le serveur corrige ensuite */
      AMX.cacheLocal.lireGz('evaluations', 7 * 86400000).then(function (o) { if (gen !== self.generation || self.liste || !o || !o.donnees || !Array.isArray(o.donnees.evaluations)) return; appliquer(o.donnees, o.quand); }).catch(function () {});
    }
    return AMX.get({ evaluations: 1 }, { copie: 'evaluations', secours: false }).then(function (d) {
      if (gen !== self.generation) return;
      self.btnRafraichir.classList.remove('occupe');
      if (d && d.refuse) { self.refus = d.erreur || 'Accès refusé.'; self.liste = null; self.copieLe = 0; self.rendre(); return; }
      if (!d || !d.ok) throw new Error((d && (d.erreur || d.message)) || 'Réponse inattendue du serveur');
      appliquer(d, 0);
      if (manuel) AMX.toast('Registre mis à jour — ' + self.liste.length + ' évaluation' + (self.liste.length > 1 ? 's' : ''), 'ok');
    }).catch(function (e) {
      if (gen !== self.generation) return;
      self.btnRafraichir.classList.remove('occupe');
      self.erreur = AMX.erreurTexte(e); self.rendre();
      AMX.toast((self.liste ? 'Registre : mise à jour impossible (copie du navigateur affichée) — ' : 'Impossible de charger le registre — ') + self.erreur, 'erreur');
    });
  };

  /** Un filtre passe ? `sauf` ignore un filtre (pour compter les pastilles avec les autres filtres). */
  Registre.prototype.garde = function (r, sauf) {
    if (sauf !== 'periode') { var t = new Date(r.dateMaj).getTime(); if (!(isNaN(t) || t >= debutPeriode(this.periode))) return false; }
    if (sauf !== 'par' && this.acheteur && (r.par || '') !== this.acheteur) return false;
    if (sauf !== 'statut' && this.statut !== 'tous' && (r.statut === 'auto' ? 'auto' : 'enregistree') !== this.statut) return false;
    if (sauf !== 'suivi' && this.suivi && !suiviCorrespond(r, this.suivi)) return false;
    if (sauf !== 'concession' && this.concession && concessionDe(r) !== this.concession) return false;
    if (sauf !== 'recherche' && this.recherche.trim()) {
      var su = r.suivi || {}, champs = [r.vin, r.marque, r.modele, r.version, r.annee, r.par, AMX.CONCESSIONS_TOUTES[concessionDe(r)], su.client, su.telephone, su.courriel, su.conseiller];
      if (AMX.correspond ? !AMX.correspond(champs, this.recherche) : champs.join(' ').toUpperCase().indexOf(this.recherche.trim().toUpperCase()) < 0) return false;
    }
    return true;
  };
  Registre.prototype.filtrees = function (sauf) { var self = this; return (this.liste || []).filter(function (r) { return self.garde(r, sauf); }); };
  // Client · suivi (21 oct.) : nom, téléphone et conseiller, statut en pastille de couleur ; « à relancer » en ambre.
  function celluleSuivi(r) {
    var su = r.suivi || null, st = su && su.statut ? statutSuivi(su.statut) : null;
    if (!su) return h('td.registre-client', { text: '—' });
    return h('td.registre-client', [
      h('div.nom', { text: su.client || '—' }),
      (su.telephone || su.conseiller) ? h('div.mini', { text: [su.telephone, su.conseiller].filter(Boolean).join(' · ') }) : null,
      h('div.registre-suivi-puces', [st ? h('span.badge.sans-point.' + st[2], { text: st[1] }) : null,
        aRelancer(r) ? h('span.badge.sans-point.ambre', { text: 'À relancer' + (su.relanceLe ? ' · ' + AMX.fmtDateCourte(su.relanceLe) : '') }) : null])
    ]);
  }
  function concessionDe(r) { return (r.concession && AMX.CONCESSIONS_TOUTES[r.concession]) ? r.concession : 'stemarie'; }
  function agregerRegistre(lignes) {
    var n = lignes.length, paye = 0, detail = 0, marge = 0, nMarge = 0, pctS = 0, nPct = 0, nEnr = 0, nClient = 0, nAttente = 0, nRelancer = 0, nRepris = 0, nPerdu = 0;
    lignes.forEach(function (r) {
      var p = nombre(r.prixPaye), d = nombre(r.prixVente), m = nombre(r.marge), st = (r.suivi && r.suivi.statut) || '';
      if (p !== null) paye += p; if (d !== null) detail += d; if (m !== null) { marge += m; nMarge++; } if (r.marchePct) { pctS += r.marchePct; nPct++; } if (r.statut !== 'auto') nEnr++;
      if (r.suivi && r.suivi.client) nClient++;
      if (st === 'attente') nAttente++; if (st === 'repris' || st === 'reprisWholesale') nRepris++; if (st === 'perdu') nPerdu++; if (aRelancer(r)) nRelancer++;
    });
    var conclues = nRepris + nPerdu;
    return { n: n, paye: paye, detail: detail, marge: marge, nMarge: nMarge, margeMoy: nMarge ? marge / nMarge : null, pctMoy: nPct ? pctS / nPct : null, nEnr: nEnr, nAuto: n - nEnr,
      nClient: nClient, nAttente: nAttente, nRelancer: nRelancer, nRepris: nRepris, nPerdu: nPerdu, taux: conclues ? nRepris / conclues : null };
  }

  /** Tout ce qui dépend des données et des filtres (les filtres eux-mêmes restent en place : la recherche garde le curseur). */
  Registre.prototype.rendre = function () {
    var self = this;
    AMX.vider(this.elCartes); AMX.vider(this.elVide);
    if (this.refus) { this.elEtat.textContent = this.refus; this.elVide.appendChild(h('div.vide', [h('div', { html: I.cadenas }), h('h3', 'Accès non autorisé'), h('div', { text: this.refus })])); this.elTable.textContent = ''; AMX.vider(this.elKpis); AMX.vider(this.elParCie); AMX.vider(this.elPortee); return; }
    if (!this.liste) { this.elEtat.textContent = this.erreur ? 'Serveur injoignable : ' + this.erreur : 'Chargement du registre…'; if (!this.erreur) this.elVide.appendChild(AMX.chargeur('Registre des évaluations')); return; }
    // Une pastille par concession, toujours les cinq ; une évaluation sans concession (anciennes fiches) compte pour Ste-Marie.
    AMX.barreConcessions(this.elCartes, { domaine: 'evaluations', valeur: AMX.CONCESSION_COMPAGNIE[this.concession] || '',
      compte: function (c) { var cle = AMX.COMPAGNIE_CONCESSION[c] || ''; return String(self.filtrees('concession').filter(function (r) { return !cle || concessionDe(r) === cle; }).length); },
      onchange: function (c) { self.concession = AMX.COMPAGNIE_CONCESSION[c] || ''; self.rafraichir(); } });
    this.rendreFiltres();
    this.rafraichir();
  };

  Registre.prototype.rendreFiltres = function () {
    var self = this;
    AMX.vider(this.elSegment);
    PERIODES_REGISTRE.forEach(function (p) {
      self.elSegment.appendChild(h('button' + (p[0] === self.periode ? '.actif' : ''), { type: 'button', text: p[1], onclick: function () { self.periode = p[0]; AMX.memo.ecrire('registre_eval_periode', p[0]); self.rendreFiltres(); self.rafraichir(); } }));
    });
    AMX.vider(this.elSegmentStatut);
    STATUTS_REGISTRE.forEach(function (p) {
      self.elSegmentStatut.appendChild(h('button' + (p[0] === self.statut ? '.actif' : ''), { type: 'button', text: p[1], onclick: function () { self.statut = p[0]; AMX.memo.ecrire('registre_eval_statut', p[0]); self.rendreFiltres(); self.rafraichir(); } }));
    });
    AMX.vider(this.elColonnes);
    [['simple', 'Simple'], ['detail', 'Détaillé']].forEach(function (p) {
      self.elColonnes.appendChild(h('button' + (p[0] === self.colonnes ? '.actif' : ''), { type: 'button', text: p[1], title: p[0] === 'simple' ? 'Les colonnes essentielles' : 'Toutes les colonnes (NIV, recon, marché standard, Canada / É.-U., veille)', onclick: function () { self.colonnes = p[0]; AMX.memo.ecrire('registre_eval_colonnes', p[0]); self.rendreFiltres(); self.rendreTable(); } }));
    });
  };

  /** Les compteurs qui suivent les autres filtres, la portée, les chiffres, le tableau par concession et la liste. */
  Registre.prototype.rafraichir = function () {
    var self = this;
    if (!this.liste) return;
    // Évaluateurs de la concession choisie (avec leur nombre, sans le filtre évaluateur).
    var acheteurs = {}; this.filtrees('par').forEach(function (r) { if (r.par) acheteurs[r.par] = (acheteurs[r.par] || 0) + 1; });
    if (this.acheteur && !acheteurs[this.acheteur]) acheteurs[this.acheteur] = 0;
    AMX.vider(this.elAcheteur);
    this.elAcheteur.appendChild(h('option', { value: '', text: 'Tous les évaluateurs' }));
    Object.keys(acheteurs).sort().forEach(function (a) { self.elAcheteur.appendChild(h('option', { value: a, selected: a === self.acheteur ? true : undefined, text: a.split('@')[0] + ' (' + acheteurs[a] + ')' })); });
    // Suivi du client en pastilles, comptées avec les autres filtres.
    var sansSuivi = this.filtrees('suivi'), compte = function (s) { return s ? sansSuivi.filter(function (r) { return suiviCorrespond(r, s); }).length : sansSuivi.length; };
    AMX.vider(this.elSuiviPastilles);
    [['', 'Tous', ''], ['relancer', 'À relancer', 'ambre']].concat(SUIVI_STATUTS.map(function (s) { return [s[0], s[1], s[2]]; }), [['aucun', 'Sans suivi', 'gris']]).forEach(function (p) {
      var n = compte(p[0]), actif = self.suivi === p[0];
      if (!n && !actif && p[0]) return;
      self.elSuiviPastilles.appendChild(h('button.inv2-pastille' + (actif ? '.actif' : ''), { type: 'button', 'data-suivi': p[0], 'aria-pressed': actif ? 'true' : 'false',
        onclick: function () { self.suivi = actif ? '' : p[0]; AMX.memo.ecrire('registre_eval_suivi', self.suivi === 'relancer' ? '' : self.suivi); self.rafraichir(); } },
        [p[2] ? h('i', { style: { background: 'var(--' + (p[2] === 'gris' ? 'encre-4' : p[2]) + ')' } }) : null, h('span', { text: p[1] }), h('b', { text: String(n) })]));
    });
    var lignes = this.filtrees(), ag = agregerRegistre(lignes);
    var nomCie = this.concession ? (AMX.CONCESSIONS_TOUTES[this.concession] || this.concession) : 'toutes les concessions';
    this.elEtat.textContent = (this.copieLe ? 'Copie du ' + AMX.copieTexte(this.copieLe) + (this.erreur ? ' — mise à jour impossible : ' + this.erreur : ' — mise à jour en cours…') + ' · ' : '') +
      (function (n) { return n + ' évaluation' + (n > 1 ? 's' : ''); })(this.filtrees('concession').filter(function (r) { return !self.concession || concessionDe(r) === self.concession; }).length) + ' · ' + nomCie;
    // « Chiffres et liste »
    var filtres = [];
    if (this.periode !== 'tout') filtres.push((PERIODES_REGISTRE.filter(function (p) { return p[0] === self.periode; })[0] || [])[1]);
    if (this.statut !== 'tous') filtres.push((STATUTS_REGISTRE.filter(function (p) { return p[0] === self.statut; })[0] || [])[1]);
    if (this.suivi) filtres.push(this.suivi === 'relancer' ? 'À relancer' : (this.suivi === 'aucun' ? 'Sans suivi' : (statutSuivi(this.suivi) || [])[1]));
    if (this.acheteur) filtres.push(this.acheteur.split('@')[0]);
    if (this.recherche.trim()) filtres.push('« ' + this.recherche.trim() + ' »');
    AMX.porteeChiffres(this.elPortee, { n: lignes.length, unite: ['évaluation', 'évaluations'], contexte: [nomCie], filtres: filtres, effacer: function () {
      self.periode = 'tout'; self.statut = 'tous'; self.suivi = ''; self.acheteur = ''; self.recherche = ''; self.elRecherche.value = '';
      ['registre_eval_periode', 'registre_eval_statut', 'registre_eval_suivi'].forEach(function (k) { AMX.memo.ecrire(k, k === 'registre_eval_statut' ? 'tous' : (k === 'registre_eval_periode' ? 'tout' : '')); });
      self.rendreFiltres(); self.rafraichir();
    } });
    // Chiffres (sur la liste filtrée)
    AMX.vider(this.elKpis);
    var tuile = function (valeur, libelle, sous, cls, clic) {
      var el = h('div.kpi' + (cls ? '.' + cls : '') + (clic ? '' : '.inv2-fixe'), clic ? { role: 'button', tabindex: '0', onclick: clic } : {}, [h('div.valeur', { text: valeur }), h('div.libelle', { text: libelle }), sous ? h('div.sous', { text: sous }) : null]);
      return el;
    };
    this.elKpis.appendChild(tuile(String(ag.n), 'Évaluations', ag.nEnr + ' enregistrée' + (ag.nEnr > 1 ? 's' : '') + ' · ' + ag.nAuto + ' auto'));
    this.elKpis.appendChild(tuile(String(ag.nClient), 'Avec un client', ag.nAttente + ' en attente'));
    this.elKpis.appendChild(tuile(String(ag.nRelancer), 'À relancer', ag.nRelancer ? 'date de relance passée' : 'aucune relance due', ag.nRelancer ? 'attention' + (this.suivi === 'relancer' ? '.actif' : '') : (this.suivi === 'relancer' ? 'actif' : ''), function () { self.suivi = self.suivi === 'relancer' ? '' : 'relancer'; self.rafraichir(); }));
    this.elKpis.appendChild(tuile(String(ag.nRepris), 'Repris', ag.taux !== null ? Math.round(ag.taux * 100) + ' % des suivis conclus' : 'aucun suivi conclu'));
    this.elKpis.appendChild(tuile(ag.margeMoy !== null ? fmt(ag.margeMoy) : '—', 'Marge moyenne', ag.nMarge ? 'sur ' + ag.nMarge + ' évaluation' + (ag.nMarge > 1 ? 's' : '') : 'aucune marge inscrite'));
    this.elKpis.appendChild(tuile(ag.pctMoy !== null ? pct(ag.pctMoy) : '—', 'Marché moyen', 'prix ÷ prix moyen actif'));
    this.rendreParConcession();
    this.rendreVeille();
    this.rendreTable(lignes);
  };

  /** Toutes les concessions : une ligne par concessionnaire (sur les mêmes filtres), un clic la choisit. */
  Registre.prototype.rendreParConcession = function () {
    var self = this, el = this.elParCie; AMX.vider(el);
    var cles = Object.keys(AMX.concessionsPour('evaluations') || {});
    if (this.concession || cles.length < 2) return;
    var base = this.filtrees('concession');
    var corps = h('tbody', cles.map(function (cle) {
      var ag = agregerRegistre(base.filter(function (r) { return concessionDe(r) === cle; }));
      var tr = h('tr.cliquable', { tabindex: '0', 'data-concession': cle, title: 'Voir le registre de ' + (AMX.CONCESSIONS_TOUTES[cle] || cle) }, [
        h('td', [h('span.badge.sans-point.' + (COULEUR_CONCESSION[cle] || 'gris'), { text: nomCourt(cle) })]),
        h('td.num', { text: String(ag.n) }), h('td.num', { text: String(ag.nEnr) }), h('td.num', { text: String(ag.nAttente) }),
        h('td.num' + (ag.nRelancer ? '.registre-relancer' : ''), { text: String(ag.nRelancer) }), h('td.num', { text: String(ag.nRepris) }), h('td.num', { text: String(ag.nPerdu) }),
        h('td.num', { text: ag.taux !== null ? Math.round(ag.taux * 100) + ' %' : '—' }),
        h('td.num', { text: ag.margeMoy !== null ? fmt(ag.margeMoy) : '—' }), h('td.num', { text: ag.pctMoy !== null ? pct(ag.pctMoy) : '—' })
      ]);
      var choisir = function () { self.concession = cle; AMX.choisirCompagnie(AMX.CONCESSION_COMPAGNIE[cle] || ''); self.rendre(); };
      tr.addEventListener('click', choisir); tr.addEventListener('keydown', function (e) { if (e.key === 'Enter') choisir(); });
      return tr;
    }));
    el.appendChild(h('div.carte.registre-par-cie', [h('div.carte-entete', [h('h2', 'Par concession'), h('span.doux.petit', { text: 'mêmes filtres · cliquez une concession pour voir son registre' })]),
      h('div.carte-corps.registre-corps', [h('div.eval-table.registre-table', [h('table.tableau', [
        h('thead', [h('tr', ['Concession', 'Évaluations', 'Enregistrées', 'En attente', 'À relancer', 'Repris', 'Perdus', 'Taux de reprise', 'Marge moy.', 'Marché moy.'].map(function (t, i) { return h('th' + (i ? '.num' : ''), { text: t }); }))]),
        corps])])])]));
  };

  // Bandeau « prix hors marché » : les véhicules dont la veille hebdomadaire
  // (Marche.gs, MARCHE_veille) a trouvé un prix de détail > 105 % de la moyenne active (concession choisie).
  Registre.prototype.rendreVeille = function () {
    var self = this, el = this.elVeille; AMX.vider(el);
    var dans = (this.liste || []).filter(function (r) { return !self.concession || concessionDe(r) === self.concession; });
    var derives = dans.filter(function (r) { return r.veille && r.veille.derive; }).sort(function (a, b) { return (b.veille.marchePct || 0) - (a.veille.marchePct || 0); });
    if (!derives.length) return;
    el.appendChild(h('div.alerte-bloc.attention.registre-alerte#registre-derives', [h('span', { html: I.alerte }), h('div', [
      h('div', { text: derives.length + ' véhicule' + (derives.length > 1 ? 's' : '') + ' affiché' + (derives.length > 1 ? 's' : '') + ' au-dessus du marché (veille hebdomadaire) :' }),
      h('div.mini.liste-derives', derives.slice(0, 6).map(function (r) {
        return h('a', { href: AMX.lien('outils', 'evaluation', { vin: r.vin }), text: [r.annee, r.marque, r.modele].filter(Boolean).join(' ') + ' · ' + fmt(nombre(r.prixVente)) + ' vs ' + fmt(r.veille.moyenneActive) + ' (+' + Math.round((r.veille.marchePct - 1) * 100) + ' %)' });
      }).concat(derives.length > 6 ? [h('span.doux', { text: '… et ' + (derives.length - 6) + ' autre(s)' })] : []))
    ])]));
  };

  Registre.prototype.colonnesVisibles = function () {
    var simple = this.colonnes !== 'detail', groupe = !this.concession;
    return COL_REGISTRE.filter(function (c) { return (!simple || c.simple) && (!c.groupe || groupe); });
  };

  Registre.prototype.rendreTable = function (lignes) {
    var self = this;
    AMX.vider(this.elTable);
    if (!this.liste) return;
    lignes = lignes || this.filtrees();
    var cols = this.colonnesVisibles(), simple = this.colonnes !== 'detail';
    this.elTable.classList.toggle('simple', simple);
    if (!lignes.length) { this.elTable.appendChild(h('div.vide', [h('div', { html: I.filtre }), h('h3', 'Aucune évaluation'), h('div', { text: (this.recherche || this.suivi || this.acheteur || this.periode !== 'tout' || this.statut !== 'tous') ? 'Rien ne correspond aux filtres.' : 'Aucune évaluation pour cette concession : chaque NIV analysé dans « Nouvelle » est conservé ici.' })])); return; }
    var c = COL_REGISTRE.filter(function (x) { return x.cle === self.tri.cle; })[0] || COL_REGISTRE[0];
    var val = c.valeur || function (r) { return r[c.cle]; };
    lignes = lignes.slice().sort(function (a, b) {
      var va = val(a), vb = val(b), r;
      if (typeof va === 'number' || typeof vb === 'number') { va = (typeof va === 'number' && !isNaN(va)) ? va : -Infinity; vb = (typeof vb === 'number' && !isNaN(vb)) ? vb : -Infinity; r = va === vb ? 0 : (va < vb ? -1 : 1); }
      else r = String(va || '').localeCompare(String(vb || ''), 'fr', { numeric: true, sensitivity: 'base' });
      return self.tri.desc ? -r : r;
    });
    var thead = h('thead', [h('tr', cols.map(function (col) {
      var actif = self.tri.cle === col.cle;
      var th = h('th' + (col.num ? '.num' : '') + '.registre-triable' + (actif ? '.actif' : ''), { 'aria-sort': actif ? (self.tri.desc ? 'descending' : 'ascending') : 'none', title: 'Trier par ' + col.libelle.toLowerCase() }, [col.libelle, actif ? h('span', { text: self.tri.desc ? ' ▼' : ' ▲', style: { fontSize: '12px' } }) : null]);
      th.addEventListener('click', function () { if (self.tri.cle === col.cle) self.tri.desc = !self.tri.desc; else { self.tri.cle = col.cle; self.tri.desc = !!col.num || col.cle === 'dateMaj'; } self.rendreTable(); });
      return th;
    }))]);
    var cellules = {
      dateMaj: function (r) { return h('td.num.registre-date', [h('div', { text: r.dateMaj ? AMX.fmtDate(r.dateMaj) : '—' }), h('div.mini', { text: depuis(r.dateMaj) })]); },
      vehicule: function (r) { var kmV = nombre(r.km); return h('td.registre-vehicule', [AMX.logoMarque(r.marque, 'petit'), h('div', [h('div.nom', { text: [r.annee, r.marque, r.modele].filter(Boolean).join(' ') || '—' }), h('div.mini', { text: [r.version, kmV !== null ? fmtKm(kmV) : '', simple ? '…' + String(r.vin || '').slice(-8) : ''].filter(Boolean).join(' · '), title: r.vin })])]); },
      vin: function (r) { return h('td.mono.registre-vin', { text: r.vin }); },
      concession: function (r) { return h('td', [h('span.badge.sans-point.' + (COULEUR_CONCESSION[concessionDe(r)] || 'gris'), { text: nomCourt(concessionDe(r)) })]); },
      client: celluleSuivi,
      par: function (r) { return h('td', r.par ? [h('span.registre-par', { title: r.par }, [h('span.avatar', { text: AMX.initiales(r.par.split('@')[0].replace(/[._-]/g, ' ')) }), h('span', { text: r.par.split('@')[0] })])] : '—'); },
      prixPaye: function (r) { return h('td.num', { text: fmt(nombre(r.prixPaye)) }); },
      recon: function (r) { return h('td.num', { text: fmt(nombre(r.recon)) }); },
      prixVente: function (r) { return h('td.num.registre-detail', { text: fmt(nombre(r.prixVente)) }); },
      marge: function (r) { var marge = nombre(r.marge); return h('td.num' + (marge !== null ? (marge >= 0 ? '.inf' : '.sup') : ''), { text: fmt(marge) }); },
      standard: function (r) { return h('td.num', { text: fmt(r.standard), title: r.analyseLe ? 'Analyse du ' + AMX.fmtDate(r.analyseLe, true) + (r.pays === 'us' ? ' (États-Unis)' : ' (Canada)') : 'Pas d\'analyse de marché enregistrée' }); },
      marchePct: function (r) { var m = r.marchePct; return h('td.num', m ? [h('span.puce' + (m > 1.03 ? '.alerte' : (m < 0.97 ? '.ok' : '.attention')), { text: pct(m) }), r.rang ? h('div.mini', { text: 'rang ' + r.rang + '/' + r.rangSur }) : null] : '—'); },
      us: function (r) { return h('td.num.registre-us', r.us && r.us.verdict ? [h('span.puce' + (r.us.verdict === 'us' ? '.info' : (r.us.verdict === 'ca' ? '.ok' : (r.us.verdict === 'detail' ? '.attention' : ''))), { text: (r.us.grosCAEstime && r.us.verdict !== 'us' ? '≈ ' : '') + AMX.export.texteVerdict(r.us), title: AMX.export.phraseVerdict(r.us) + ' — ' + AMX.export.texteProfits(r.us) + ' (gros É.-U. ' + fmt(r.us.grosUS) + ', gros Canada ' + fmt(r.us.grosCA) + (r.us.grosCAEstime ? ' estimé' : '') + (r.us.paye !== null && r.us.paye !== undefined ? ', payé ' + fmt(r.us.paye) : '') + ')' + (r.us.calculeLe ? ' · ' + AMX.fmtDateCourte(r.us.calculeLe) : '') }), r.us.mmr ? h('div.mini', { text: 'MMR ' + AMX.fmtNombre(r.us.mmr) + ' $ US' }) : null] : [h('span.doux', '—')]); },
      veille: function (r) { return h('td.num.registre-veille', r.veille && typeof r.veille.marchePct === 'number' ? [h('span.puce' + (r.veille.derive ? '.alerte' : (r.veille.marchePct < 0.97 ? '.ok' : '')), { text: (r.veille.marchePct >= 1 ? '+' : '') + Math.round((r.veille.marchePct - 1) * 100) + ' %', title: 'Détail ' + fmt(nombre(r.prixVente)) + ' vs moyenne active ' + fmt(r.veille.moyenneActive) + ' (' + r.veille.nActifs + ' annonces, ' + (r.veille.lieu || '') + ')' }), h('div.mini', { text: AMX.fmtDateCourte(r.veille.le) })] : [h('span.doux', '—')]); },
      statut: function (r) { var auto = r.statut === 'auto'; return h('td.registre-statut', [h('span.badge.sans-point.' + (auto ? 'gris' : 'vert'), { text: auto ? 'Auto' : 'Enregistrée', title: auto ? 'Analyse conservée automatiquement — ouvrez-la et cliquez « Enregistrer » pour la confirmer' : 'Enregistrée' + (r.enregistreLe ? ' le ' + AMX.fmtDate(r.enregistreLe, true) : '') + (r.enregistrePar ? ' par ' + r.enregistrePar.split('@')[0] : '') })]); }
    };
    var tbody = h('tbody');
    lignes.forEach(function (r) {
      var auto = r.statut === 'auto';
      var tr = h('tr.cliquable' + (auto ? '.registre-auto' : '.registre-enregistree') + (aRelancer(r) ? '.registre-a-relancer' : ''), { tabindex: '0', 'data-vin': r.vin }, cols.map(function (col) { return cellules[col.cle](r); }));
      var ouvrir = function () { AMX.aller('outils', 'evaluation', { vin: r.vin }); };
      tr.addEventListener('click', ouvrir);
      tr.addEventListener('keydown', function (e) { if (e.key === 'Enter') ouvrir(); });
      tbody.appendChild(tr);
    });
    var ag = agregerRegistre(lignes);
    var pied = {
      dateMaj: 'Total — ' + ag.n, prixPaye: fmt(ag.paye), prixVente: fmt(ag.detail),
      marge: ag.margeMoy !== null ? 'moy. ' + fmt(ag.margeMoy) : '', marchePct: ag.pctMoy !== null ? 'moy. ' + pct(ag.pctMoy) : '', statut: ag.nEnr + ' enr. · ' + ag.nAuto + ' auto'
    };
    var tfoot = h('tfoot', [h('tr', cols.map(function (col) { return h('td' + (col.num ? '.num' : ''), { text: pied[col.cle] || '' }); }))]);
    this.elTable.appendChild(h('table.tableau#registre-table', [thead, tbody, tfoot]));
  };

  Registre.prototype.exporter = function () {
    var lignes = this.filtrees();
    if (!lignes.length) { AMX.toast('Aucune évaluation à exporter.', 'attention'); return; }
    if (typeof XLSX === 'undefined') { AMX.toast('La bibliothèque Excel n\'est pas encore chargée. Réessayez.', 'erreur'); return; }
    var rows = lignes.map(function (r) {
      return { 'Date': r.dateMaj ? AMX.fmtDate(r.dateMaj) : '', 'Statut': r.statut === 'auto' ? 'Analyse automatique' : 'Enregistrée', 'Enregistrée le': r.enregistreLe ? AMX.fmtDate(r.enregistreLe, true) : '', 'Enregistrée par': r.enregistrePar || '', 'NIV': r.vin, 'Année': r.annee, 'Marque': r.marque, 'Modèle': r.modele, 'Version': r.version, 'Concession': AMX.CONCESSIONS_TOUTES[concessionDe(r)],
        'Client': (r.suivi && r.suivi.client) || '', 'Téléphone': (r.suivi && r.suivi.telephone) || '', 'Courriel': (r.suivi && r.suivi.courriel) || '', 'Origine': (r.suivi && r.suivi.origine) || '',
        'Transaction': (r.suivi && r.suivi.transaction) === 'achat' ? 'Achat seulement' : ((r.suivi && r.suivi.transaction) === 'echange' ? 'Échange' : ''), 'Conseiller': (r.suivi && r.suivi.conseiller) || '',
        'Suivi': r.suivi && statutSuivi(r.suivi.statut) ? statutSuivi(r.suivi.statut)[1] : '', 'Valeur offerte au client': r.suivi ? nombre(r.suivi.valeurClient) : null, 'Relancer le': (r.suivi && r.suivi.relanceLe) || '',
        'KM': nombre(r.km), 'Prix payé': nombre(r.prixPaye), 'Reconditionnement': nombre(r.recon), 'Marge': nombre(r.marge), 'Prix de détail': nombre(r.prixVente),
        'Marché agressif': r.agressif, 'Marché standard': r.standard, 'Marché conservateur': r.conservateur, 'Marché %': r.marchePct !== null && r.marchePct !== undefined ? Math.round(r.marchePct * 1000) / 10 : '', 'Rang': r.rang ? r.rang + '/' + r.rangSur : '', 'Pays': r.pays, 'CA / É.-U.': r.us && r.us.verdict ? AMX.export.texteVerdict(r.us) : '', 'Gros É.-U.': r.us ? r.us.grosUS : '', 'Gros Canada': r.us ? r.us.grosCA : '', 'MMR ($ US)': r.us ? r.us.mmr : '', 'État / province': r.etat || '', 'Veille %': r.veille && typeof r.veille.marchePct === 'number' ? Math.round((r.veille.marchePct - 1) * 1000) / 10 : '', 'Veille le': r.veille && r.veille.le ? AMX.fmtDate(r.veille.le) : '', 'Analyse le': r.analyseLe ? AMX.fmtDate(r.analyseLe, true) : '', 'Par': r.par };
    });
    var ws = XLSX.utils.json_to_sheet(rows);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Évaluations');
    XLSX.writeFile(wb, 'evaluations-' + (this.concession || 'toutes') + '-' + new Date().toISOString().slice(0, 10) + '.xlsx');
    AMX.toast('Export Excel — ' + lignes.length + ' ligne' + (lignes.length > 1 ? 's' : ''), 'ok');
  };

  AMX.vues = AMX.vues || {};
  AMX.vues.Evaluation = Evaluation;
  Evaluation.styleDe = styleDe; Evaluation.STYLES = STYLES;   /* tests */
  AMX.vues.RegistreEvaluations = Registre;

  /* 26 oct. : « Clients à relancer » sur l'Accueil (accueil.js), même règle que le registre (2 min en mémoire). */
  var cacheEvals = { d: null, le: 0, promesse: null };
  AMX.evaluations = {
    aRelancer: aRelancer, concessionDe: concessionDe,
    charger: function () {
      if (cacheEvals.d && Date.now() - cacheEvals.le < AMX.dureeCopie(120000)) return Promise.resolve(cacheEvals.d);
      if (cacheEvals.promesse) return cacheEvals.promesse;
      cacheEvals.promesse = AMX.get({ evaluations: 1 }, { copie: 'evaluations', secours: false }).then(function (d) {
        cacheEvals.promesse = null;
        if (!d || !d.ok || !Array.isArray(d.evaluations)) throw new Error('registre des évaluations illisible');
        cacheEvals.d = d; cacheEvals.le = Date.now(); return d;
      }, function (e) { cacheEvals.promesse = null; throw e; });
      return cacheEvals.promesse;
    },
    enCache: function () { return cacheEvals.d; },
    vider: function () { cacheEvals.d = null; cacheEvals.le = 0; },
    aRelancerPour: function (cie) { var cle = cie ? (AMX.COMPAGNIE_CONCESSION[cie] || '') : ''; return ((cacheEvals.d && cacheEvals.d.evaluations) || []).filter(function (r) { return aRelancer(r) && (!cle || concessionDe(r) === cle); }); }
  };
})();
