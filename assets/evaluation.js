/* =========================================================================
   Outils › Évaluation marché — la fiche d'évaluation (refaite le 2 oct.).

   Modèle : l'« Analyse de marché » de Torque, mais à partir de nos propres
   sources. Les données viennent du serveur (Marche.gs → MarketCheck) :
     GET ?marche=1&annee=&marque=&modele=&version=&km=&pays=ca|us&concession=&vin=
       → { ok, pays, devise, lieu, rayonKm, actifs: { n, annonces[], prix, km, jours },
            vendus: { n90, parMois, prix, km, jours, portee }, versionElargie,
            ventesElargies, avertissements[], genereLe }
       ou { ok: false, sansCle: true, erreur } quand la clé MarketCheck manque
       (un administrateur la pose dans Admin › Données de marché).
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
  var URL_CARFAX_COMPTE = 'https://dealer.carfax.ca/';
  var TOLERANCE_KM = 30000;

  /* ------------------------------ Helpers ------------------------------ */
  function fmt(n) { return (n === null || n === undefined || isNaN(n)) ? '—' : AMX.fmtArgent(n, 0); }
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
  function lienMarketGuide(vin) { return 'https://app.eblock.com/my-market-guide?soldWithinDays=90&vin=' + encodeURIComponent(vin); }

  // NHTSA : marque / modèle / année / version (null si rien ou injoignable).
  function decoderVin(vin) {
    var corps = new URLSearchParams(); corps.append('format', 'json'); corps.append('data', vin);
    return fetch(URL_NHTSA, { method: 'POST', body: corps })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var r = (d && d.Results || [])[0];
        if (!r) return null;
        return { make: r.Make || '', model: r.Model || '', year: r.ModelYear || '', trim: r.Trim || r.Series || '' };
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
      '.registre-table .registre-veille .mini { font-size: 10.5px; color: var(--encre-4); }',
      '.registre-table tr.registre-auto .registre-date, .registre-table tr.registre-auto .registre-vin { color: var(--encre-3); }',
      '.registre-table tr.registre-enregistree td:first-child { box-shadow: inset 3px 0 0 var(--vert); }',
      '.registre-table .badge.gris { background: var(--gris-bg); color: var(--encre-2); }',
      '.registre-cartes .registre-carte .bas .statuts { display: inline-flex; gap: 6px; align-items: center; }',
      '.registre-cartes .registre-carte .bas .statuts i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }',
      '.registre-cartes .registre-carte .bas .statuts i.ok { background: var(--vert); } .registre-cartes .registre-carte .bas .statuts i.auto { background: var(--ligne-forte); }',
      '.eval-page .champ > label { font-size: 10px; }',
      '.eval-page .champ input, .eval-page .champ select { height: 32px; font-size: 13px; }',
      '.eval-sommaire { position: sticky; top: calc(var(--barre-h) + var(--sous-h) + 6px); z-index: 20; display: flex; align-items: center; gap: 14px; background: var(--noir-2); color: #fff; border-radius: var(--rayon); padding: 8px 14px; margin-bottom: 12px; overflow-x: auto; scrollbar-width: none; box-shadow: 0 6px 16px rgba(0,0,0,.18); }',
      '.eval-sommaire .veh { min-width: 180px; flex: 1 1 220px; }',
      '.eval-sommaire .veh .nom { font-weight: 700; font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      '.eval-sommaire .veh .sous { font-size: 11px; color: #9AA6B2; font-family: var(--mono); white-space: nowrap; }',
      '.eval-sommaire .item { flex: none; min-width: 72px; }',
      '.eval-sommaire .item .l { font-size: 9.5px; letter-spacing: .08em; text-transform: uppercase; color: #9AA6B2; font-weight: 600; white-space: nowrap; }',
      '.eval-sommaire .item .v { font-size: 15px; font-weight: 700; white-space: nowrap; }',
      '.eval-sommaire .item.fort .v { color: var(--vert-vif); font-size: 17px; }',
      '.eval-sommaire .item.pos .v { color: var(--vert-vif); } .eval-sommaire .item.neg .v { color: #F97066; }',
      '.eval-sommaire .sauts { margin-left: auto; display: flex; gap: 4px; flex: none; }',
      '.eval-sommaire .sauts a { color: #fff; font-size: 11.5px; padding: 4px 9px; border-radius: 6px; background: rgba(255,255,255,.1); white-space: nowrap; }',
      '.eval-sommaire .sauts a:hover { background: rgba(255,255,255,.22); text-decoration: none; }',
      '.eval-grille-vehicule { grid-template-columns: 1.6fr .7fr 1fr 1fr 1fr .9fr 1.5fr .8fr; gap: 10px 12px; }',
      '.eval-sous-vehicule { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; margin-top: 10px; }',
      '.eval-sous-vehicule:empty { display: none; }',
      '.eval-contexte { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 12.5px; color: var(--encre-2); }',
      '.eval-contexte .modele { font-weight: 600; color: var(--encre); }',
      '.eval-liens { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-left: auto; }',
      '.eval-liens .sep { color: var(--encre-4); font-size: 11.5px; margin-left: 4px; }',
      '.eval-liens a.btn.desactive { opacity: .55; pointer-events: none; }',
      '.eval-prix-grille { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 14px 22px; align-items: start; }',
      '.eval-prix-calc { display: flex; flex-direction: column; gap: 10px; }',
      '.eval-formule { display: flex; align-items: flex-end; gap: 8px; flex-wrap: wrap; }',
      '.eval-formule .champ { flex: 1 1 120px; min-width: 110px; }',
      '.eval-formule .op { height: 32px; display: flex; align-items: center; font-weight: 700; color: var(--encre-3); font-size: 16px; flex: none; }',
      '.eval-formule .op.rappel { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; border: 1px dashed var(--ligne-forte); border-radius: var(--rayon-s); padding: 0 10px; }',
      '.eval-champ-calcule input { background: var(--carte-2); font-weight: 600; }',
      '.eval-champ-detail input { border-color: var(--vert); background: var(--vert-clair); font-weight: 700; font-size: 15px; }',
      '.eval-detail-ligne { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; font-size: 12.5px; }',
      '.eval-detail-ligne .l { font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--encre-3); font-weight: 700; }',
      '.eval-detail-ligne .v { font-size: 18px; font-weight: 700; }',
      '.eval-cibles-titre { font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--encre-3); font-weight: 700; margin-bottom: 6px; }',
      '.eval-cibles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }',
      '.eval-valeurs { margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--ligne); }',
      '.eval-rappels .puce { cursor: pointer; border: none; font: inherit; font-size: 11px; font-weight: 600; }',
      '.eval-liste-rappels { display: flex; flex-direction: column; gap: 10px; max-height: 60vh; overflow: auto; }',
      '.eval-rappel { border: 1px solid var(--ligne); border-radius: var(--rayon-s); padding: 10px 12px; font-size: 12.5px; line-height: 1.45; }',
      '.eval-rappel .entete { display: flex; gap: 10px; align-items: center; margin-bottom: 2px; }',
      '.eval-rappel .composant { font-weight: 600; margin-bottom: 4px; }',
      '.eval-rappel p { margin: 4px 0 0; }',
      '.eval-valeurs-entete { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }',
      '.eval-valeurs-entete h3 { margin: 0; font-size: 13px; }',
      '.eval-valeurs-grille { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }',
      '.eval-valeurs-grille.ancien { opacity: .75; }',
      '.eval-valeur { border: 1px solid var(--ligne); border-radius: var(--rayon-s); padding: 8px 10px; background: var(--fond); display: flex; flex-direction: column; gap: 2px; }',
      '.eval-valeur .l { font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em; color: var(--encre-3); font-weight: 600; }',
      '.eval-valeur .v { font-size: 19px; font-weight: 700; font-variant-numeric: tabular-nums; }',
      '.eval-valeur .m { font-size: 11px; color: var(--encre-3); }',
      '.eval-valeur .ecart { font-size: 11.5px; font-weight: 600; color: var(--encre-2); } .eval-valeur .ecart.sup { color: var(--rouge); } .eval-valeur .ecart.inf { color: var(--vert); }',
      '.eval-valeur.vide .v { color: var(--encre-4); }',
      '.chargement.mini { font-size: 12px; padding: 6px 0; }',
      // Feuille d'offre (modale) et page imprimée
      '.offre-formulaire { display: flex; flex-direction: column; gap: 10px; min-width: 320px; }',
      '.offre-formulaire .grille { display: grid; grid-template-columns: 1fr auto; gap: 10px; }',
      '.offre-impression { display: none; }',
      '@media print { body.impression-offre > *:not(#offre-impression) { display: none !important; } body.impression-offre { background: #fff; } body.impression-offre #offre-impression { display: block; font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #111; padding: 28px 36px; max-width: 760px; margin: 0 auto; font-size: 13px; line-height: 1.45; } .offre-entete { display: flex; justify-content: space-between; gap: 20px; border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 16px; } .offre-concession { font-size: 17px; font-weight: 700; } .offre-titre { text-align: right; } .offre-titre h1 { margin: 0 0 4px; font-size: 24px; letter-spacing: .02em; } .offre-impression .doux { color: #555; font-size: 12px; } .offre-client { margin: 0 0 12px; } .offre-client .l, .offre-montant .l, .offre-notes .l, .offre-conditions .l { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #555; font-weight: 700; display: block; margin-bottom: 2px; } .offre-client .l { display: inline; margin-right: 8px; } .offre-vehicule { width: 100%; border-collapse: collapse; margin-bottom: 16px; } .offre-vehicule th { text-align: left; width: 140px; padding: 6px 8px; background: #f3f4f6; border: 1px solid #ddd; font-size: 12px; } .offre-vehicule td { padding: 6px 8px; border: 1px solid #ddd; } .offre-vehicule .mono { font-family: Menlo, Consolas, monospace; } .offre-montant { border: 2px solid #111; border-radius: 8px; padding: 12px 16px; margin: 0 0 14px; } .offre-montant .v { font-size: 30px; font-weight: 800; } .offre-montant .m { font-size: 11.5px; color: #555; } .offre-marche { font-size: 12px; color: #444; margin: 0 0 12px; } .offre-notes { margin-bottom: 12px; white-space: pre-wrap; } .offre-conditions ul { margin: 4px 0 0; padding-left: 18px; font-size: 12px; } .offre-signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 44px; } .offre-signatures .trait { border-bottom: 1px solid #111; height: 34px; margin-bottom: 4px; } .offre-pied { margin-top: 30px; font-size: 10.5px; color: #777; text-align: center; } }',
      '.eval-cible { border: 1px solid var(--ligne); border-radius: var(--rayon-s); padding: 8px 10px; display: flex; flex-direction: column; gap: 2px; }',
      '.eval-cible .l { font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--encre-3); font-weight: 700; }',
      '.eval-cible .v { font-size: 17px; font-weight: 700; }',
      '.eval-cible .s { font-size: 11px; color: var(--encre-3); line-height: 1.35; }',
      '.eval-cible .s.pos { color: var(--vert); } .eval-cible .s.neg { color: var(--rouge); }',
      '.eval-cible .btn { align-self: flex-start; margin-top: 4px; }',
      '.eval-cible.agressif { box-shadow: inset 4px 0 0 var(--rouge); } .eval-cible.standard { box-shadow: inset 4px 0 0 var(--vert); background: var(--vert-clair); } .eval-cible.conservateur { box-shadow: inset 4px 0 0 var(--bleu); }',
      '.eval-attente.mini { padding: 14px; font-size: 12px; }',
      '.eval-pile { display: flex; flex-direction: column; gap: 12px; }',
      '.eval-note { margin: 0; font-size: 11.5px; color: var(--encre-3); line-height: 1.5; }',
      '#eval-detail-resume:not(:empty) { margin-top: 2px; }',
      '@media (max-width: 1200px) { .eval-grille-vehicule { grid-template-columns: repeat(4, minmax(0, 1fr)); } .eval-prix-grille { grid-template-columns: 1fr; } }',
      '@media (max-width: 900px) { .eval-cibles { grid-template-columns: 1fr; } .eval-grille-vehicule { grid-template-columns: repeat(2, minmax(0, 1fr)); } .eval-sommaire .sauts { display: none; } }',
      '.eval-resume { margin-bottom: 12px; }',
      '.eval-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 12px; }',
      '.eval-stat { border: 1px solid var(--ligne); border-radius: var(--rayon-s); padding: 12px 14px; }',
      '.eval-stat h3 { font-size: 13px; margin: 0 0 8px; }',
      '.eval-stat h3 .n { font-size: 20px; font-weight: 700; margin-right: 6px; font-variant-numeric: tabular-nums; }',
      '.eval-stat .grille-mini { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }',
      '.eval-stat .grille-mini .l { font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--encre-3); font-weight: 600; }',
      '.eval-stat .grille-mini .v { font-size: 13.5px; font-weight: 600; font-variant-numeric: tabular-nums; margin-top: 1px; }',
      '.eval-stat .grille-mini .m { font-size: 11px; color: var(--encre-4); font-variant-numeric: tabular-nums; }',
      '.eval-stat p.eval-note { margin-top: 8px; }',
      '.eval-filtres { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; font-size: 12.5px; }',
      '.eval-filtres .case { display: inline-flex; align-items: center; gap: 6px; }',
      '.eval-filtres .espace { flex: 1; }',
      '.eval-table { overflow-x: auto; }',
      '.eval-table .tableau { min-width: 900px; }',
      '.eval-table td, .eval-table th { padding: 7px 10px; }',
      '.eval-table tr.eval-moi td { background: var(--vert-clair); font-weight: 600; }',
      '.eval-table tr.eval-moi td:first-child { box-shadow: inset 3px 0 0 var(--vert); }',
      '.eval-table td.sous .mini { display: block; }',
      '.eval-table .sup { color: var(--rouge); } .eval-table .inf { color: var(--vert); }',
      '.eval-pied { display: flex; gap: 8px 14px; flex-wrap: wrap; align-items: center; margin-top: 10px; font-size: 11.5px; color: var(--encre-3); }',
      '.eval-attente { padding: 26px 16px; text-align: center; color: var(--encre-3); font-size: 13px; border: 1px dashed var(--ligne-forte); border-radius: var(--rayon-s); }',
      '.eval-attente .btn { margin-top: 10px; }',
      '.registre-cartes { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; margin-bottom: 12px; }',
      '.registre-carte { text-align: left; background: var(--carte); border: 1px solid var(--ligne); border-radius: var(--rayon); padding: 10px 12px 9px; cursor: pointer; display: flex; flex-direction: column; gap: 6px; box-shadow: var(--ombre); transition: border-color .12s, transform .12s; position: relative; overflow: hidden; }',
      '.registre-carte::before { content: \'\'; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--gris); }',
      '.registre-carte.vert::before { background: var(--vert); } .registre-carte.bleu::before { background: var(--bleu); } .registre-carte.violet::before { background: var(--violet); } .registre-carte.sombre::before { background: var(--noir-2); } .registre-carte.ambre::before { background: var(--ambre); } .registre-carte.toutes::before { background: linear-gradient(var(--vert), var(--noir-2)); }',
      '.registre-carte:hover { border-color: var(--ligne-forte); transform: translateY(-1px); }',
      '.registre-carte.actif { border-color: var(--vert); box-shadow: 0 0 0 2px rgba(0,136,64,.16); background: var(--vert-clair); }',
      '.registre-carte .haut { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }',
      '.registre-carte .nom { font-weight: 700; font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      '.registre-carte .n { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; line-height: 1; }',
      '.registre-carte .bas { display: flex; gap: 10px; flex-wrap: wrap; font-size: 11px; color: var(--encre-3); }',
      '.registre-carte .bas b { color: var(--encre); font-weight: 600; } .registre-carte .bas .pos b { color: var(--vert); } .registre-carte .bas .neg b { color: var(--rouge); }',
      '.registre-barre { margin-bottom: 12px; } .registre-barre .carte-corps { padding: 10px 14px; }',
      '.registre-outils { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }',
      '.registre-outils .recherche { flex: 1 1 240px; position: relative; display: flex; align-items: center; } .registre-outils .recherche > span { position: absolute; left: 10px; width: 14px; height: 14px; color: var(--encre-4); display: flex; } .registre-outils .recherche > span svg { width: 14px; height: 14px; } .registre-outils .recherche input { padding-left: 30px; height: 32px; width: 100%; }',
      '.registre-outils .compte { margin-left: auto; font-size: 12px; }',
      '.registre-corps { padding: 0 !important; }',
      '.registre-table .tableau { min-width: 1240px; border: none; border-radius: 0; box-shadow: none; }',
      '.registre-table td { padding: 8px 10px; }',
      '.registre-table td.num, .registre-table td.mono, .registre-table .registre-date { white-space: nowrap; }',
      '.registre-table .registre-date .mini { font-size: 11px; color: var(--encre-4); }',
      '.registre-table .registre-vehicule { display: flex; align-items: center; gap: 10px; min-width: 220px; }',
      '.registre-table .registre-vehicule .logo-marque { width: 34px; height: 34px; flex: none; border: 1px solid var(--ligne); border-radius: 8px; display: grid; place-items: center; background: #fff; font-size: 10px; font-weight: 700; color: var(--encre-3); overflow: hidden; }',
      '.registre-table .registre-vehicule .logo-marque img { width: 24px; height: 24px; object-fit: contain; }',
      '.registre-table .registre-vehicule .nom { font-weight: 600; }',
      '.registre-table .registre-vin { font-size: 11.5px; color: var(--encre-3); }',
      '.registre-table .registre-detail { font-weight: 700; }',
      '.registre-table .registre-par { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; }',
      '.registre-table .registre-par .avatar { width: 24px; height: 24px; border-radius: 50%; background: var(--noir-2); color: #fff; font-size: 10px; font-weight: 700; display: grid; place-items: center; }',
      '.registre-table tfoot td { font-weight: 600; background: var(--carte-2); border-top: 1px solid var(--ligne); }',
      '.registre-table th.registre-triable { cursor: pointer; user-select: none; } .registre-table th.registre-triable.actif { color: var(--vert); }',
      '.registre-table tr.cliquable:focus-visible td { box-shadow: inset 0 0 0 2px rgba(0,136,64,.35); outline: none; }',
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
    this.valeurs = null;                      // réponse VinAudit (detail / gros / echange) pour le NIV courant
    this.valeursEnCours = false;
    this.rappels = null;                      // rappels NHTSA pour année / marque / modèle (gratuit, chargé après le décodage)
    this.rappelsCle = '';
    this.minuterieAuto = null;
    this.filtres = { memeVersion: false, kmProche: false, tri: 'prix' };
    this.derniereSauvegarde = null;           // bloc `marche` d'une évaluation rechargée

    this.construire();
    this.rendreMarche();

    this.surInventaire = function () { self.rendreContexte(); };
    document.addEventListener('amx:inventaire', this.surInventaire);
    this.surCarfax = function () { self.rendreLiens(); };
    document.addEventListener('amx:carfax', this.surCarfax);
    if (AMX.carfax && AMX.carfax.charger) AMX.carfax.charger().catch(function () {});

    var vin = (ctx && ctx.params && ctx.params.vin) ? String(ctx.params.vin).trim() : '';
    if (vin) { this.elNiv.value = vin; this.charger(vin); }
  }

  Evaluation.prototype.demonter = function () {
    document.removeEventListener('amx:inventaire', this.surInventaire);
    document.removeEventListener('amx:carfax', this.surCarfax);
    this.generation++;
  };

  Evaluation.prototype.naviguer = function (ctx) {
    var vin = (ctx && ctx.params && ctx.params.vin) ? String(ctx.params.vin).trim() : '';
    if (vin && vin !== this.vinCharge) { this.elNiv.value = vin; this.charger(vin); }
  };

  Evaluation.prototype.etat = function (texte) { this.elEtat.textContent = texte; };

  /* --------------------------- Construction ---------------------------- */
  Evaluation.prototype.construire = function () {
    var self = this;

    this.elEtat = h('p#eval-statut', { text: 'Décodez le NIV, lancez l\'analyse de marché, puis fixez votre prix : la page le situe parmi les annonces actives et les ventes récentes.' });
    this.btnDecoder = h('button.btn#decode-btn', { type: 'button', html: I.scan + '<span>Décoder le VIN</span>', onclick: function () { self.decoderDepuisChamp(); } });
    this.btnAnalyser = h('button.btn.primaire#analyser-btn', { type: 'button', html: I.recherche + '<span>Analyser le marché</span>', onclick: function () { self.analyser(self.pays, true); } });
    this.btnEnregistrer = h('button.btn#save-eval-btn', { type: 'button', html: I.ok + '<span>Enregistrer l\'évaluation</span>', onclick: function () { self.enregistrer(); } });
    this.btnOffre = h('button.btn#offre-btn', { type: 'button', title: 'Feuille d\'offre d\'achat à imprimer ou enregistrer en PDF', html: I.telecharger + '<span>Feuille d\'offre</span>', onclick: function () { self.feuilleOffre(); } });
    this.elSauvegarde = h('div.eval-sauvegarde#eval-sauvegarde');
    var entete = h('div.entete-page', [
      h('div', { style: { minWidth: 0 } }, [h('h1', 'Évaluation de marché'), this.elEtat, this.elSauvegarde]),
      h('div.actions', [this.btnDecoder, this.btnAnalyser, this.btnOffre, this.btnEnregistrer])
    ]);
    this.rendreSauvegarde();

    // --- Sommaire fixe (sous la barre) : les chiffres clés + navigation ----
    this.elSommaire = h('div.eval-sommaire#eval-sommaire');

    // --- Véhicule : une seule rangée dense -------------------------------
    var cNiv = champ('e-niv', 'NIV', { mono: true, vin: true, placeholder: '17 caractères' });
    var cAnnee = champ('e-annee', 'Année', { type: 'number', inputmode: 'numeric' });
    var cMarque = champ('e-marque', 'Marque');
    var cModele = champ('e-modele', 'Modèle');
    var cVersion = champ('e-version', 'Version', { placeholder: 'LT, SLE, Limited…' });
    var cKm = champ('e-km', 'Kilométrage', { type: 'number', inputmode: 'numeric' });
    var cTaux = champ('e-taux-km', 'Ajustement $/km', { type: 'number', step: '0.01', value: '0.10' });
    var concessionsEval = AMX.concessionsPour('evaluations');   // portée du domaine « évaluations » (accès supplémentaires compris)
    this.elConcession = h('select#e-concession', Object.keys(concessionsEval).map(function (k) {
      return h('option', { value: k, selected: k === 'stemarie' ? true : undefined, text: concessionsEval[k] });
    }));
    var cConcession = h('div.champ', [h('label', { 'for': 'e-concession', text: 'Concession (marché local)' }), this.elConcession]);
    this.elNiv = cNiv.input; this.elMarque = cMarque.input; this.elModele = cModele.input; this.elVersion = cVersion.input;
    this.elAnnee = cAnnee.input; this.elKm = cKm.input; this.elTaux = cTaux.input;
    this.elContexte = h('div.eval-contexte.cache');
    this.elLiens = h('div.eval-liens');
    // Historique Torque du NIV (archive des évaluations importées de Torque) : rempli par AMX.torqueHistorique.
    this.elTorque = h('div.eval-sous-vehicule#eval-torque');
    this.torqueVin = '';
    var vehicule = h('div.carte#sec-vehicule', [h('div.carte-corps', [
      h('div.grille.eval-grille-vehicule', [cNiv.el, cAnnee.el, cMarque.el, cModele.el, cVersion.el, cKm.el, cConcession, cTaux.el]),
      h('div.eval-sous-vehicule', [this.elContexte, this.elLiens]),
      this.elTorque
    ])]);

    // --- Prix : achat + frais = payé ; payé + recon + marge = détail -------
    var cAchat = champ('e-prix-achat', 'Prix d\'achat ($)', { type: 'number', inputmode: 'numeric', placeholder: 'Enchère / vendeur' });
    var cFrais = champ('e-frais', 'Frais d\'achat ($)', { type: 'number', inputmode: 'numeric', placeholder: 'Encan, transport, CARFAX' });
    var cPaye = champ('e-prix-paye', 'Prix payé ($)', { type: 'number', inputmode: 'numeric', placeholder: '= achat + frais' });
    var cRecon = champ('e-recon', 'Reconditionnement ($)', { type: 'number', inputmode: 'numeric', placeholder: 'Carrosserie, mécanique, esthétique' });
    var cMarge = champ('e-marge', 'Marge visée ($)', { type: 'number', inputmode: 'numeric', value: AMX.memo.lire('eval_marge', '2000') });
    var cPrix = champ('e-prix', 'Prix de détail ($)', { type: 'number', inputmode: 'numeric', placeholder: '= payé + recon + marge' });
    this.elAchat = cAchat.input; this.elFrais = cFrais.input; this.elPaye = cPaye.input; this.elRecon = cRecon.input; this.elMarge = cMarge.input; this.elPrix = cPrix.input;
    cPaye.el.classList.add('eval-champ-calcule'); cPrix.el.classList.add('eval-champ-calcule', 'eval-champ-detail');
    this.elDetailResume = h('div#eval-detail-resume');
    this.elCibles = h('div#eval-cibles');
    this.elValeurs = h('div.eval-valeurs#eval-valeurs');
    var detail = h('div.carte#sec-prix', [h('div.carte-corps', [h('div.eval-prix-grille', [
      h('div.eval-prix-calc', [
        h('div.eval-formule', [cAchat.el, h('span.op', '+'), cFrais.el, h('span.op', '='), cPaye.el]),
        h('div.eval-formule', [h('span.op.rappel', 'payé'), h('span.op', '+'), cRecon.el, h('span.op', '+'), cMarge.el, h('span.op', '='), cPrix.el]),
        this.elDetailResume
      ]),
      this.elCibles
    ]), this.elValeurs])]);
    this.rendreValeurs();
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
    this.elKm.addEventListener('input', function () { self.rendreMarche(); });
    this.elPrix.addEventListener('input', function () { self.recalculerDetail('prix'); });
    this.elVersion.addEventListener('input', AMX.debounce(function () { if (self.analyses[self.pays]) self.rendreMarche(); }, 200));
    this.elConcession.addEventListener('change', function () { AMX.memo.ecrire('eval_concession', self.elConcession.value); self.oublierAnalyses(); });
    if (concessionsEval[AMX.memo.lire('eval_concession', '')]) this.elConcession.value = AMX.memo.lire('eval_concession', '');
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
      h('div.titre', [h('h2', 'Analyse de marché'), h('p', 'Annonces actives de concessionnaires et ventes déduites des 90 derniers jours (MarketCheck).')]),
      [this.elMarche],
      h('div.droite', [this.elSegment, this.elPortee, this.elSelEtat, this.btnRafraichir])
    );
    marche.id = 'sec-marche';
    this.majSegment();

    this.elTaux.addEventListener('input', function () { self.rendreMarche(); });

    this.el = h('div.page.eval-page', [entete, this.elSommaire, vehicule, detail, marche]);
    this.rendreSommaire();
    this.rendreLiens();
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
  };

  Evaluation.prototype.rendrePrixDetail = function () {
    var self = this;
    AMX.vider(this.elDetailResume); AMX.vider(this.elCibles);
    var achat = nombre(this.elAchat.value), frais = nombre(this.elFrais.value) || 0, paye = nombre(this.elPaye.value), recon = nombre(this.elRecon.value) || 0, marge = nombre(this.elMarge.value), prix = nombre(this.elPrix.value);
    var a = this.analyses[this.pays], c = (a && a.ok) ? this.calculs(a) : null;
    if (prix !== null) {
      var pos = c ? c.marchePct : null;
      this.elDetailResume.appendChild(h('div.eval-detail-ligne', [
        h('span.l', { text: 'Prix de détail' }), h('span.v.num', { text: fmt(prix) }),
        paye !== null ? h('span.doux', { text: (achat !== null ? fmt(achat) + ' achat + ' + fmt(frais) + ' frais = ' : '') + fmt(paye) + ' payé · + ' + fmt(recon) + ' recon · + ' + fmt(marge === null ? prix - paye - recon : marge) + ' marge' }) : null,
        c ? h('span.puce' + (pos === null ? '' : (pos <= 0.97 ? '.ok' : (pos <= 1.03 ? '.attention' : '.alerte'))), { text: 'marché ' + pct(pos) + (c.rang ? ' · rang ' + c.rang + '/' + c.rangSur : '') }) : h('span.doux', { text: 'Lancez l\'analyse pour situer ce prix.' })
      ]));
    } else if (paye === null && achat === null) {
      this.elDetailResume.appendChild(h('p.eval-note', { text: 'Prix d\'achat, frais et reconditionnement se remplissent depuis la fiche d\'achat quand elle existe ; sinon tapez-les. La marge visée est mémorisée d\'une évaluation à l\'autre.' }));
    }
    if (this.ficheSource) this.elDetailResume.appendChild(h('p.eval-note', [h('span', { text: 'Montants repris de la fiche d\'achat (' + this.ficheSource + '). ' }), h('a.petit', { href: AMX.lien('achat', '', { vin: this.vinCourant }), text: 'Ouvrir la fiche pour corriger les coûts' })]));
    this.elCibles.appendChild(h('div.eval-cibles-titre', { text: c && c.standard ? 'Prix de marché, ramenés à votre kilométrage' : 'Prix de marché' }));
    if (c && c.standard) {
      var cible = function (nom, v, cls) {
        var maxAchat = (v !== null && marge !== null) ? v - recon - marge - frais : null;
        var margeSi = (v !== null && paye !== null) ? v - paye - recon : null;
        return h('div.eval-cible.' + cls, [
          h('div.l', { text: nom }), h('div.v.num', { text: fmt(v) }),
          h('div.s', { text: maxAchat !== null ? 'Achat max. ' + fmt(maxAchat) + ' pour garder ' + fmt(marge) + ' de marge' : 'Entrez une marge pour le prix d\'achat maximal' }),
          margeSi !== null ? h('div.s.' + (margeSi >= (marge || 0) ? 'pos' : 'neg'), { text: 'Au prix payé : marge ' + fmt(margeSi) }) : null,
          h('button.btn.petit', { type: 'button', text: 'Prendre ce prix', onclick: function () { self.elPrix.value = String(Math.round(v)); self.recalculerDetail('prix'); } })
        ]);
      };
      this.elCibles.appendChild(h('div.eval-cibles', [cible('Agressif', c.agressif, 'agressif'), cible('Standard', c.standard, 'standard'), cible('Conservateur', c.conservateur, 'conservateur')]));
    } else {
      this.elCibles.appendChild(h('div.eval-attente.mini', { text: this.enCours[this.pays] ? 'Analyse en cours…' : 'Les prix agressif / standard / conservateur apparaissent ici après l\'analyse de marché.' }));
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
    this.elSommaire.appendChild(item('Payé', fmt(paye)));
    this.elSommaire.appendChild(item('Recon', fmt(recon)));
    this.elSommaire.appendChild(item('Marge', fmt(marge), marge !== null ? (marge >= 0 ? 'pos' : 'neg') : ''));
    this.elSommaire.appendChild(item('Détail', fmt(prix), 'fort'));
    this.elSommaire.appendChild(item('Marché std', c ? fmt(c.standard) : '—'));
    this.elSommaire.appendChild(item('Marché %', pct(pos), pos === null ? '' : (pos <= 0.97 ? 'pos' : (pos <= 1.03 ? '' : 'neg'))));
    this.elSommaire.appendChild(item('Rang', c && c.rang ? c.rang + '/' + c.rangSur : '—'));
    this.elSommaire.appendChild(h('nav.sauts', [['sec-vehicule', 'Véhicule'], ['sec-prix', 'Prix'], ['sec-marche', 'Marché']].map(function (x) {
      return h('a', { href: '#', text: x[1], onclick: function (e) { e.preventDefault(); var el = document.getElementById(x[0]); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
    })));
  };

  /* ----------------------------- Liens ---------------------------------- */
  Evaluation.prototype.rendreLiens = function () {
    var vin = (this.elNiv.value || '').trim().toUpperCase();
    var vinOk = /^[A-HJ-NPR-Z0-9]{17}$/.test(vin);
    AMX.vider(this.elLiens);
    var carfax = (vinOk && AMX.carfax && AMX.carfax.lien) ? AMX.carfax.lien(vin) : '';
    this.elLiens.appendChild(h('a.btn.petit' + (carfax ? '' : ''), { href: carfax || URL_CARFAX_COMPTE, target: '_blank', rel: 'noopener', title: carfax ? 'Rapport CARFAX partagé de ce véhicule' : 'Mon compte CARFAX (aucun rapport partagé pour ce NIV)', html: I.externe + '<span>' + (carfax ? 'Rapport CARFAX' : 'CARFAX (compte)') + '</span>' }));
    this.elLiens.appendChild(h('a.btn.petit' + (vinOk ? '' : '.desactive'), { href: vinOk ? lienMarketGuide(vin) : '#', target: '_blank', rel: 'noopener', title: 'Valeurs d\'encan eBlock (vendus 90 jours) pour ce NIV', html: I.externe + '<span>eBlock Market Guide</span>' }));
    this.elLiens.appendChild(h('a.btn.petit', { href: URL_TORQUE, target: '_blank', rel: 'noopener', title: 'Évaluations Torque (Hawkesbury)', html: I.externe + '<span>Torque</span>' }));
    // Évaluation → fiche d'achat → inventaire : la fiche s'ouvre préremplie
    // avec cette évaluation (l'analyse en cours est conservée d'abord).
    var self = this, veh = vinOk ? AMX.inventaire.parVin(vin) : null, ficheExiste = !!(veh && veh.ficheExiste);
    this.elLiens.appendChild(h('button.btn.petit' + (vinOk ? '.primaire' : '.desactive'), { type: 'button', title: vinOk ? (ficheExiste ? 'Ouvrir la fiche d\'achat de ce véhicule (elle proposera d\'importer cette évaluation)' : 'Créer la fiche d\'achat de ce véhicule, préremplie avec cette évaluation, pour l\'envoyer à l\'inventaire') : 'Entrez un NIV complet', html: I.achat + '<span>' + (ficheExiste ? 'Fiche d\'achat' : 'Créer la fiche d\'achat') + '</span>', onclick: function () { if (vinOk) self.versFicheAchat(vin); } }));
    this.elRappels = h('span.eval-rappels#eval-rappels');
    this.elLiens.appendChild(this.elRappels);
    this.rendreRappels();
    this.elLiens.appendChild(h('span.sep', { text: vinOk ? 'NIV ' + vin : 'Entrez un NIV complet pour les liens par véhicule' }));
    // Historique Torque : une requête par NIV, seulement quand il change.
    if (vinOk && this.torqueVin !== vin && typeof AMX.torqueHistorique === 'function') { this.torqueVin = vin; AMX.torqueHistorique(vin, this.elTorque); }
    else if (!vinOk && this.torqueVin) { this.torqueVin = ''; AMX.vider(this.elTorque); }
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
    var self = this, el = this.elRappels; if (!el) return;
    AMX.vider(el);
    var r = this.rappels;
    if (!r) return;
    if (r.chargement) { el.appendChild(h('span.puce', { text: 'Rappels…' })); return; }
    if (!r.ok) { el.appendChild(h('span.puce', { title: r.erreur || '', text: 'Rappels : indisponibles' })); return; }
    var n = r.n || 0;
    var puce = h('button.puce.eval-puce-rappels' + (n ? '.attention' : '.ok'), { type: 'button', title: 'Rappels de sécurité NHTSA pour ' + [r.annee, r.marque, r.modele].join(' ') + ' (par modèle, pas par NIV)', text: n ? n + ' rappel' + (n > 1 ? 's' : '') + ' NHTSA' : 'Aucun rappel NHTSA', onclick: function () { self.ouvrirRappels(); } });
    el.appendChild(puce);
  };
  Evaluation.prototype.ouvrirRappels = function () {
    var r = this.rappels; if (!r || !r.ok) return;
    var liste = h('div.eval-liste-rappels', (r.rappels || []).map(function (x) {
      return h('div.eval-rappel', [
        h('div.entete', [h('span.mono', { text: x.campagne || '—' }), h('span.doux', { text: x.date ? AMX.fmtDate(x.date) : '' }), x.parcStop || x.nePasConduire ? h('span.puce.alerte', { text: x.parcStop ? 'Ne pas conduire' : 'Stationner dehors' }) : null]),
        h('div.composant', { text: x.composant || '' }),
        x.resume ? h('p', { text: x.resume }) : null,
        x.consequence ? h('p.doux', { text: 'Risque : ' + x.consequence }) : null,
        x.remede ? h('p.doux', { text: 'Correctif : ' + x.remede }) : null
      ]);
    }));
    var corps = h('div', [
      h('p.doux.petit', { style: { margin: '0 0 10px' }, text: 'Source : NHTSA (États-Unis), par année, marque et modèle — un rappel listé ne vise pas forcément ce NIV : vérifiez auprès du concessionnaire de la marque ou avec le NIV sur nhtsa.gov/recalls. ' + (r.recuLe ? 'Reçu ' + AMX.fmtDate(r.recuLe, true) + '.' : '') }),
      (r.rappels || []).length ? liste : h('p', { text: 'Aucun rappel recensé par la NHTSA pour ce modèle et cette année.' }),
      h('p.doux.petit', { style: { margin: '10px 0 0' } }, ['Côté canadien : ', h('a', { href: r.lienTc || 'https://wwwapps.tc.gc.ca/Saf-Sec-Sur/7/VRDB-BDRV/search-recherche/menu.aspx?lang=fra', target: '_blank', rel: 'noopener', text: 'base de données des rappels de Transport Canada' }), '.'])
    ]);
    AMX.modale({ titre: 'Rappels de sécurité — ' + [r.annee, r.marque, r.modele].join(' '), corps: corps, large: true });
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
    if (avant !== this.pays && this.valeurs) { this.valeurs = null; this.rendreValeurs(); }
    if (!this.analyses[this.pays] && !this.enCours[this.pays] && this.parametresPrets()) this.analyser(this.pays, false);
    else this.rendreMarche();
  };
  Evaluation.prototype.parametresPrets = function () {
    return !!(nombre(this.elAnnee.value) && this.elMarque.value.trim() && this.elModele.value.trim());
  };
  Evaluation.prototype.parametres = function (pays) {
    var vin = this.elNiv.value.trim().toUpperCase();
    var p = { marche: 1, pays: pays, portee: this.portee[pays], annee: this.elAnnee.value.trim(), marque: this.elMarque.value.trim(), modele: this.elModele.value.trim(), version: this.elVersion.value.trim(), km: this.elKm.value.trim(), concession: this.elConcession.value };
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
      if (self.analyses[pays].ok) {
        self.etat('Analyse ' + (pays === 'us' ? 'du marché américain' : 'du marché canadien') + ' reçue : ' + ((self.analyses[pays].actifs || {}).n || 0) + ' annonces actives, ' + ((self.analyses[pays].vendus || {}).n90 || 0) + ' ventes déduites sur 90 jours.');
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
    if (this.filtres.kmProche && kmV !== null) liste = liste.filter(function (x) { return x.km === null || x.km === undefined || Math.abs(x.km - kmV) <= TOLERANCE_KM; });
    var tri = this.filtres.tri;
    liste.sort(function (p, q) {
      if (tri === 'km') return (p.km || 0) - (q.km || 0);
      if (tri === 'dist') return (p.distKm || 0) - (q.distKm || 0);
      if (tri === 'jours') return (q.jours || 0) - (p.jours || 0);
      return p.ajuste - q.ajuste;
    });
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
          a.sansCle ? h('div.mini', { style: { marginTop: '4px' } }, admin ? [h('a', { href: AMX.lien('admin', '', {}), text: 'Coller la clé dans Admin › Données de marché' })] : 'Demandez à un administrateur de la coller dans Admin › Données de marché.') : null
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
    var tri = h('select.saisie', { style: { height: '28px', width: 'auto' } }, [['prix', 'Prix ajusté'], ['km', 'Kilométrage'], ['dist', 'Distance'], ['jours', 'Jours affichés']].map(function (o) { return h('option', { value: o[0], selected: self.filtres.tri === o[0] ? true : undefined, text: 'Trier : ' + o[1] }); }));
    tri.addEventListener('change', function () { self.filtres.tri = tri.value; self.rendreMarche(); });
    this.elMarche.appendChild(h('div.eval-filtres', [
      h('label.case', [caseVersion, h('span', { text: 'Même version seulement' })]),
      h('label.case', [caseKm, h('span', { text: '± ' + AMX.fmtNombre(TOLERANCE_KM) + ' km du véhicule' })]),
      h('span.espace'),
      h('span.doux', { text: liste.length + ' annonce' + (liste.length > 1 ? 's' : '') + ' retenue' + (liste.length > 1 ? 's' : '') }),
      tri
    ]));

    var moy = act.prix && act.prix.moyenne;
    var lignes = [];
    var moiInsere = !c.prixVise;
    var kmV = nombre(this.elKm.value);
    var ligneMoi = function (rang) {
      return h('tr.eval-moi', [
        h('td.num', { text: rang ? String(rang) : '' }),
        h('td', [h('div', { text: 'Votre véhicule' }), h('div.mini', { text: AMX.CONCESSIONS_TOUTES[self.elConcession.value] || '' })]),
        h('td', { text: self.elVersion.value.trim() || '—' }),
        h('td.num', { text: self.elAnnee.value || '—' }),
        h('td.num', { text: kmV !== null ? fmtKm(kmV) : '—' }),
        h('td.num', { text: fmt(c.prixVise) }),
        h('td.num', { text: fmt(c.prixVise) }),
        h('td.num', { text: '—' }), h('td.num', { text: '—' }),
        h('td.num', { text: pct(c.marchePct) }),
        h('td', '')
      ]);
    };
    liste.forEach(function (x, i) {
      if (!moiInsere && self.filtres.tri === 'prix' && x.ajuste >= c.prixVise) { lignes.push(ligneMoi(lignes.length + 1)); moiInsere = true; }
      var m = moy ? x.prix / moy : null;
      lignes.push(h('tr', [
        h('td.num', { text: String(lignes.length + 1) }),
        h('td.sous', [h('div', { text: x.concession || '—' }), h('span.mini', { text: [x.ville, x.province].filter(Boolean).join(', ') + (x.certifie ? ' · certifié' : '') })]),
        h('td', { text: x.version || '—' }),
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
    if (!moiInsere) lignes.push(ligneMoi(lignes.length + 1));
    this.elMarche.appendChild(h('div.eval-table', [h('table.tableau#eval-comparables', [
      h('thead', [h('tr', [h('th.num', '#'), h('th', 'Concession'), h('th', 'Version'), h('th.num', 'Année'), h('th.num', 'Odomètre'), h('th.num', 'Prix'), h('th.num', 'Prix ajusté'), h('th.num', 'Jours'), h('th.num', 'Distance'), h('th.num', 'Marché %'), h('th', '')])]),
      h('tbody', lignes.length ? lignes : [h('tr', [h('td', { colspan: 11, text: 'Aucune annonce ne correspond aux filtres.' })])])
    ])]));

    var pied = [h('span', { text: 'Source : MarketCheck · ' + (a.lieu || (pays === 'us' ? 'États-Unis' : 'Canada')) + ', prix en ' + devise }), h('span', { text: 'Reçu ' + AMX.fmtDate(a.genereLe || new Date().toISOString(), true) })];
    (a.avertissements || []).forEach(function (t) { pied.push(h('span.puce.attention', { text: t })); });
    if (a.appels && typeof a.appels.n === 'number' && AMX.estAdmin()) {
      var q = a.appels.quota || 500, pctQ = Math.round(a.appels.n / q * 100);
      pied.push(h('span.puce' + (pctQ >= 85 ? '.alerte' : (pctQ >= 60 ? '.attention' : '')) + '#eval-appels', { text: 'Appels MarketCheck ce mois : ' + AMX.fmtNombre(a.appels.n) + ' / ' + AMX.fmtNombre(q), title: 'Compteur du plan gratuit — détails dans Admin › Données de marché' }));
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
    var valeurs = null, v = this.valeurs;
    if (v && v.ok) {
      var res = function (b) { return b ? { moyenne: b.moyenne, bas: b.bas, haut: b.haut, n: b.n, certitude: b.certitude } : null; };
      valeurs = { source: 'VinAudit', pays: v.pays, devise: v.devise, km: v.km, vehicule: v.vehicule || '', genereLe: v.genereLe, detail: res(v.detail), gros: res(v.gros), echange: res(v.echange) };
    } else if (this.derniereSauvegarde && this.derniereSauvegarde.valeurs) valeurs = this.derniereSauvegarde.valeurs;
    if (marche && valeurs) marche.valeurs = valeurs;
    return {
      marque: this.elMarque.value, modele: this.elModele.value, annee: this.elAnnee.value, version: this.elVersion.value,
      km: this.elKm.value, tauxKm: this.elTaux.value, prixVente: this.elPrix.value, prixAchat: this.elAchat.value, frais: this.elFrais.value, prixPaye: this.elPaye.value, recon: this.elRecon.value, marge: this.elMarge.value, concession: this.elConcession.value,
      comparables: this.comparablesCharges || [],
      marche: marche,
      valeurs: valeurs
    };
  };

  Evaluation.prototype.remplir = function (data) {
    var self = this;
    data = data || {};
    if (data.marque) this.elMarque.value = data.marque;
    if (data.modele) this.elModele.value = data.modele;
    if (data.annee) this.elAnnee.value = data.annee;
    if (data.version) this.elVersion.value = data.version;
    if (data.km) this.elKm.value = data.km;
    if (data.tauxKm) this.elTaux.value = data.tauxKm;
    if (data.prixVente) this.elPrix.value = data.prixVente;
    if (data.prixPaye) this.elPaye.value = data.prixPaye;
    if (data.prixAchat) this.elAchat.value = data.prixAchat;
    if (data.frais !== undefined && data.frais !== '') this.elFrais.value = data.frais;
    if (!this.elAchat.value && data.prixPaye) this.elAchat.value = data.prixPaye;
    if (data.recon !== undefined && data.recon !== '') this.elRecon.value = data.recon;
    if (data.marge !== undefined && data.marge !== '') this.elMarge.value = data.marge;
    if (data.concession && AMX.concessionsPour('evaluations')[data.concession]) this.elConcession.value = data.concession;
    this.comparablesCharges = Array.isArray(data.comparables) ? data.comparables.filter(function (c) { return c && (c.prix || c.source); }) : [];
    this.derniereSauvegarde = (data.marche && typeof data.marche === 'object') ? data.marche : null;
    if (this.derniereSauvegarde && !this.derniereSauvegarde.valeurs && data.valeurs) this.derniereSauvegarde.valeurs = data.valeurs;
    this.chargerRappels();
    this.valeurs = null; this.valeursEnCours = false; this.rendreValeurs();
    if (this.derniereSauvegarde && this.derniereSauvegarde.portee) { var pv = this.derniereSauvegarde.pays === 'us' ? 'us' : 'ca'; this.portee[pv] = porteeValide(this.derniereSauvegarde.portee, this.portee[pv]); if (this.derniereSauvegarde.etat && ETATS[pv][this.derniereSauvegarde.etat]) this.etats[pv] = this.derniereSauvegarde.etat; }
    // Statut posé par le serveur (Api.gs) : « auto » ou « enregistree » ; les anciennes fiches sans statut ont été enregistrées à la main.
    this.sauvegarde = { statut: data._statut === 'auto' ? 'auto' : 'enregistree', dateMaj: data._le || '', enregistreLe: data._enregistreLe || (data._statut === 'auto' ? '' : (data._le || '')), enregistrePar: data._enregistrePar || (data._statut === 'auto' ? '' : (data._par || '')) };
    this.rendreSauvegarde();
    if (this.derniereSauvegarde && this.derniereSauvegarde.pays) { this.pays = this.derniereSauvegarde.pays === 'us' ? 'us' : 'ca'; this.majSegment(); }
    this.analyses = { ca: null, us: null };
    this.enCours = { ca: false, us: false };
    this.genAnalyse.ca++; this.genAnalyse.us++;
    this.rendreMarche();
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
    this.ficheSource = '';
    this.comparablesCharges = [];
    this.derniereSauvegarde = null;
    this.sauvegarde = null; clearTimeout(this.minuterieAuto);
    this.rendreSauvegarde();
    this.valeurs = null; this.valeursEnCours = false; this.rendreValeurs();
    this.rappels = null; this.rappelsCle = ''; this.rendreRappels();
    this.analyses = { ca: null, us: null };
    this.enCours = { ca: false, us: false };
    this.genAnalyse.ca++; this.genAnalyse.us++;
    this.rendreMarche();
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
    this.etat('Recherche d\'une évaluation existante…');
    return AMX.get('evalVin=' + encodeURIComponent(vin)).then(function (d) {
      if (gen !== self.generation) return;
      if (d && d.refuse) throw new Error(d.erreur || d.message || 'Accès refusé');
      if (d && d.trouve) {
        self.remplir(d.donnees || {});
        self.etat('Évaluation existante chargée — NIV ' + vin + (d.dateMaj ? ', mise à jour le ' + AMX.fmtDate(d.dateMaj, true) : '') + '. Relancez l\'analyse pour des chiffres du jour.');
        if (!self.parametresPrets() || !self.elVersion.value.trim()) self.decoder(vin).then(function () { if (gen === self.generation && self.parametresPrets() && !d.donnees.marche) self.analyser(self.pays, false); });
      } else {
        self.etat('Aucune évaluation pour ce NIV — décodage du véhicule…');
        self.decoder(vin).then(function () { if (gen === self.generation && self.parametresPrets()) { self.etat('Véhicule décodé. Lancez l\'analyse de marché.'); self.analyser(self.pays, false); } });
      }
      history.replaceState(null, '', AMX.lien('outils', 'evaluation', { vin: vin }));
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
    this.etat('Décodage du véhicule…');
    var serveur = AMX.get({ decoder: vin }).then(function (d) {
      if (d && d.ok && d.marque) return { make: d.marque, model: d.modele, year: d.annee, trim: d.version, source: 'serveur' };
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

  /* ------------------------ Valeurs de guide (VinAudit) ------------------
     Détail / gros / échange façon livre, Canada ou États-Unis, ajustées au km.
     3 requêtes facturées par demande : jamais lancées d'office — bouton
     explicite, mise en cache 6 h côté serveur, résumé gardé dans l'évaluation. */
  Evaluation.prototype.rendreValeurs = function () {
    var self = this, el = this.elValeurs; if (!el) return;
    AMX.vider(el);
    var v = this.valeurs, pays = this.pays;
    var entete = h('div.eval-valeurs-entete', [
      h('div', [h('h3', 'Valeurs de guide'), h('span.mini.doux', { text: 'VinAudit · détail / gros / échange, ' + (pays === 'us' ? 'États-Unis' : 'Canada') + ', ajustées au kilométrage' })]),
      h('button.btn.petit#valeurs-btn' + (this.valeursEnCours ? '.occupe' : ''), { type: 'button', disabled: this.valeursEnCours ? true : undefined, html: I.recherche + '<span>' + (v && v.ok ? 'Actualiser' : 'Obtenir les valeurs') + '</span>', title: '3 requêtes VinAudit (détail, gros, échange)', onclick: function () { self.chargerValeurs(true); } })
    ]);
    el.appendChild(entete);
    if (this.valeursEnCours) { el.appendChild(h('div.chargement.mini', [h('span', { html: I.rafraichir }), 'Demande des valeurs…'])); return; }
    if (!v) {
      var sv = this.derniereSauvegarde && this.derniereSauvegarde.valeurs;
      if (sv && sv.detail) { el.appendChild(this.tuilesValeurs(sv, true)); }
      else el.appendChild(h('p.eval-note', { text: 'Cliquez « Obtenir les valeurs » pour les valeurs détail, gros et échange du guide (3 requêtes VinAudit). Elles complètent l\'analyse des annonces ci-contre.' }));
      return;
    }
    if (!v.ok) {
      el.appendChild(h('div.alerte-bloc.' + (v.sansCle ? 'attention' : 'erreur'), [h('span', { html: I.alerte }), h('div', [
        h('div', { text: v.sansCle ? 'La clé VinAudit n\'est pas en place sur le serveur.' : 'Valeurs indisponibles : ' + (v.erreur || 'erreur inconnue') }),
        v.sansCle ? h('div.mini', { style: { marginTop: '4px' } }, AMX.estAdmin() ? [h('a', { href: AMX.lien('admin', '', {}), text: 'Coller la clé dans Admin › Données de marché' })] : 'Demandez à un administrateur de la coller dans Admin › Données de marché.') : null
      ])]));
      return;
    }
    el.appendChild(this.tuilesValeurs(v, false));
  };
  Evaluation.prototype.tuilesValeurs = function (v, ancien) {
    var prixVise = nombre(this.elPrix.value), paye = nombre(this.elPaye.value);
    var tuile = function (cle, libelle, repere, aide) {
      var b = v[cle]; if (!b) return h('div.eval-valeur.vide', [h('div.l', { text: libelle }), h('div.v', '—')]);
      var ecart = (repere !== null && b.moyenne) ? Math.round((repere - b.moyenne) / b.moyenne * 100) : null;
      return h('div.eval-valeur', [
        h('div.l', { text: libelle }),
        h('div.v.num', { text: fmt(b.moyenne) }),
        h('div.m', { text: (b.bas && b.haut ? fmt(b.bas) + ' – ' + fmt(b.haut) : '') + (b.n ? ' · ' + AMX.fmtNombre(b.n) + ' annonces' : '') + (b.certitude ? ' · fiabilité ' + Math.round(b.certitude) + ' %' : '') }),
        ecart !== null ? h('div.ecart' + (ecart > 3 ? '.sup' : (ecart < -3 ? '.inf' : '')), { text: aide + ' ' + (ecart >= 0 ? '+' : '') + ecart + ' %' }) : null
      ]);
    };
    var pied = [h('span', { text: 'Source : VinAudit · ' + (v.vehicule || '') + (v.km ? ' · ' + fmtKm(v.km) : '') + ' · prix en ' + (v.devise || 'CAD') })];
    if (v.genereLe) pied.push(h('span', { text: (ancien ? 'Valeurs conservées le ' : 'Reçu ') + AMX.fmtDate(v.genereLe, true) }));
    if (v.detail && v.detail.ajustementKm) pied.push(h('span', { text: 'Ajustement km : ' + (v.detail.ajustementKm > 0 ? '+' : '') + fmt(v.detail.ajustementKm) }));
    if (v.appels && typeof v.appels.n === 'number' && AMX.estAdmin()) pied.push(h('span.puce' + (v.appels.n / (v.appels.quota || 100) >= 0.85 ? '.alerte' : ''), { text: 'Requêtes VinAudit ce mois : ' + v.appels.n + ' / ' + (v.appels.quota || 100) }));
    (v.erreurs || []).forEach(function (t) { pied.push(h('span.puce.attention', { text: t })); });
    return h('div', [
      h('div.eval-valeurs-grille' + (ancien ? '.ancien' : ''), [
        tuile('detail', 'Détail (guide)', prixVise, 'votre détail'),
        tuile('gros', 'Gros (wholesale)', paye, 'votre payé'),
        tuile('echange', 'Échange (trade-in)', paye, 'votre payé')
      ]),
      h('div.eval-pied', pied)
    ]);
  };
  Evaluation.prototype.chargerValeurs = function (manuel) {
    var self = this;
    if (!this.parametresPrets() && !this.vinPourSauvegarde()) { if (manuel) AMX.toast('Décodez le NIV (ou entrez année, marque et modèle) d\'abord.', 'attention'); return Promise.resolve(); }
    var p = { valeurs: 1, pays: this.pays, annee: this.elAnnee.value.trim(), marque: this.elMarque.value.trim(), modele: this.elModele.value.trim(), version: this.elVersion.value.trim(), km: this.elKm.value.trim() };
    var vin = this.vinPourSauvegarde(); if (vin) p.vin = vin;
    var gen = this.generation;
    this.valeursEnCours = true; this.rendreValeurs();
    return AMX.get(p).then(function (d) {
      if (gen !== self.generation) return;
      self.valeursEnCours = false;
      self.valeurs = (d && d.refuse) ? { ok: false, erreur: d.erreur || 'Accès refusé' } : (d || { ok: false, erreur: 'Réponse vide' });
      self.rendreValeurs();
      if (self.valeurs.ok) self.planifierAuto();
    }).catch(function (e) {
      if (gen !== self.generation) return;
      self.valeursEnCours = false;
      self.valeurs = { ok: false, erreur: AMX.erreurTexte(e) };
      self.rendreValeurs();
    });
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
    var data = this.collecter(), gen = this.generation;
    return AMX.post({ action: 'saveEvaluation', vin: vin, data: data, auto: true }).then(function (d) {
      if (gen !== self.generation || !d || !d.ok) return;
      self.vinCourant = vin; self.vinCharge = vin;
      if (data.marche) self.derniereSauvegarde = data.marche;
      self.sauvegarde = { statut: d.statut || 'auto', dateMaj: d.dateMaj || new Date().toISOString(), enregistreLe: d.enregistreLe || '', enregistrePar: d.enregistrePar || '' };
      self.rendreSauvegarde();
      history.replaceState(null, '', AMX.lien('outils', 'evaluation', { vin: vin }));
    }).catch(function () { /* silencieux : le bouton Enregistrer reste là */ });
  };
  Evaluation.prototype.rendreSauvegarde = function () {
    var el = this.elSauvegarde; if (!el) return;
    AMX.vider(el);
    var sv = this.sauvegarde;
    if (!sv) { el.appendChild(h('span.puce', { text: 'Non conservée — l\'analyse sera gardée automatiquement dès qu\'un NIV complet est analysé' })); this.btnEnregistrer.classList.remove('ok'); return; }
    if (sv.statut === 'enregistree') {
      el.appendChild(h('span.puce.ok', { text: 'Enregistrée' + (sv.enregistreLe ? ' le ' + AMX.fmtDate(sv.enregistreLe, true) : '') + (sv.enregistrePar ? ' par ' + sv.enregistrePar.split('@')[0] : '') }));
      if (sv.dateMaj && sv.enregistreLe && sv.dateMaj > sv.enregistreLe) el.appendChild(h('span.mini.doux', { text: 'modifiée depuis (' + AMX.fmtDate(sv.dateMaj, true) + ')' }));
      this.btnEnregistrer.classList.add('ok');
    } else {
      el.appendChild(h('span.puce.gris', { text: 'Analyse conservée automatiquement' + (sv.dateMaj ? ' · ' + AMX.fmtDate(sv.dateMaj, true) : '') }));
      el.appendChild(h('span.mini.doux', { text: 'Cliquez « Enregistrer l\'évaluation » pour la confirmer (verte dans le registre).' }));
      this.btnEnregistrer.classList.remove('ok');
    }
  };

  Evaluation.prototype.enregistrer = function () {
    var self = this, btn = this.btnEnregistrer;
    var vin = this.elNiv.value.trim().toUpperCase();
    if (!vin) {
      this.etat('Entrez un NIV dans le champ NIV pour pouvoir enregistrer.');
      AMX.toast('Entrez un NIV pour enregistrer l\'évaluation.', 'attention');
      this.elNiv.focus();
      return;
    }
    btn.classList.add('occupe');
    this.etat('Enregistrement en cours…');
    var data = this.collecter();
    AMX.post({ action: 'saveEvaluation', vin: vin, data: data }).then(function (d) {
      AMX.verifier(d, 'Enregistrement refusé par le serveur');
      var quand = AMX.fmtDate(d.dateMaj || new Date().toISOString(), true);
      self.vinCourant = vin; self.vinCharge = vin;
      if (data.marche) self.derniereSauvegarde = data.marche;
      self.sauvegarde = { statut: 'enregistree', dateMaj: d.dateMaj || new Date().toISOString(), enregistreLe: d.enregistreLe || d.dateMaj || new Date().toISOString(), enregistrePar: d.enregistrePar || (AMX.session && AMX.session.courriel) || '' };
      self.rendreSauvegarde();
      self.etat('Évaluation enregistrée pour ce NIV (' + quand + ')' + (data.marche ? ' — prix standard ' + fmt(data.marche.standard) + '.' : '.'));
      AMX.toast('Évaluation enregistrée (NIV ' + vin + ')', 'ok');
      // Alerte aux directeurs (Notif.gs, 6 oct.) : ce NIV a été évalué dans une autre concession il y a moins de 30 jours.
      if (d.alerte && d.alerte.ok) {
        var n = (d.alerte.destinataires || []).length;
        self.etat('Attention : ce véhicule a aussi été évalué chez ' + (AMX.COMPAGNIES_TOUTES[(d.alerte.concessions || [])[0]] || 'une autre concession') + ' — ' + n + ' directeur' + (n > 1 ? 's' : '') + ' prévenu' + (n > 1 ? 's' : '') + ' (' + (d.alerte.courriels || 0) + ' courriel' + ((d.alerte.courriels || 0) > 1 ? 's' : '') + ', ' + (d.alerte.textos || 0) + ' texto' + ((d.alerte.textos || 0) > 1 ? 's' : '') + ').', 'attention');
        AMX.toast('Alerte envoyée aux directeurs : même véhicule évalué dans deux concessions (' + (d.alerte.textos || 0) + ' texto' + ((d.alerte.textos || 0) > 1 ? 's' : '') + ', ' + (d.alerte.courriels || 0) + ' courriel' + ((d.alerte.courriels || 0) > 1 ? 's' : '') + ').', 'attention', 8000);
      }
      history.replaceState(null, '', AMX.lien('outils', 'evaluation', { vin: vin }));
      self.rendreContexte();
    }).catch(function (e) {
      self.etat('Échec de l\'enregistrement : ' + AMX.erreurTexte(e));
      AMX.toast('Échec de l\'enregistrement — ' + AMX.erreurTexte(e), 'erreur');
    }).then(function () { btn.classList.remove('occupe'); });
  };


  /* =====================================================================
     Registre des évaluations (Outils › Registre d'évaluations)
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
    this.concession = AMX.memo.lire('registre_eval_concession', '');
    if (this.concession && !AMX.concessionsPour('evaluations')[this.concession]) this.concession = '';
    this.recherche = '';
    this.statut = AMX.memo.lire('registre_eval_statut', 'tous');
    if (!STATUTS_REGISTRE.some(function (x) { return x[0] === self.statut; })) this.statut = 'tous';
    this.tri = { cle: 'dateMaj', desc: true };
    this.construire();
    this.charger(false);
  }
  Registre.prototype.demonter = function () { this.generation++; };
  Registre.prototype.naviguer = function () {};

  var COL_REGISTRE = [
    { cle: 'dateMaj', libelle: 'Date', valeur: function (r) { return r.dateMaj || ''; } },
    { cle: 'vehicule', libelle: 'Véhicule', valeur: function (r) { return [r.annee, r.marque, r.modele, r.version].filter(Boolean).join(' '); } },
    { cle: 'vin', libelle: 'NIV' },
    { cle: 'concession', libelle: 'Concession', valeur: function (r) { return AMX.CONCESSIONS_TOUTES[r.concession] || r.concession || ''; } },
    { cle: 'prixPaye', libelle: 'Payé', num: true, valeur: function (r) { return nombre(r.prixPaye); } },
    { cle: 'recon', libelle: 'Recon', num: true, valeur: function (r) { return nombre(r.recon); } },
    { cle: 'marge', libelle: 'Marge', num: true, valeur: function (r) { return nombre(r.marge); } },
    { cle: 'prixVente', libelle: 'Prix de détail', num: true, valeur: function (r) { return nombre(r.prixVente); } },
    { cle: 'standard', libelle: 'Marché std', num: true, valeur: function (r) { return r.standard; } },
    { cle: 'marchePct', libelle: 'Marché %', num: true, valeur: function (r) { return r.marchePct; } },
    { cle: 'veille', libelle: 'Veille', num: true, valeur: function (r) { return r.veille && typeof r.veille.marchePct === 'number' ? r.veille.marchePct : null; } },
    { cle: 'statut', libelle: 'Statut', valeur: function (r) { return r.statut === 'auto' ? 'auto' : 'enregistree'; } },
    { cle: 'par', libelle: 'Évaluateur', valeur: function (r) { return (r.par || '').split('@')[0]; } }
  ];

  var PERIODES_REGISTRE = [['tout', 'Tout'], ['j30', '30 jours'], ['trimestre', 'Trimestre'], ['annee', 'Année']];
  var STATUTS_REGISTRE = [['tous', 'Toutes'], ['enregistree', 'Enregistrées'], ['auto', 'Analyses auto']];
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

  Registre.prototype.construire = function () {
    var self = this;
    this.periode = AMX.memo.lire('registre_eval_periode', 'tout');
    if (!PERIODES_REGISTRE.some(function (p) { return p[0] === self.periode; })) this.periode = 'tout';
    this.acheteur = '';
    this.elEtat = h('p', { text: 'Chargement du registre…' });
    this.btnRafraichir = h('button.btn', { type: 'button', html: I.rafraichir + '<span>Rafraîchir</span>', onclick: function () { self.charger(true); } });
    this.btnExport = h('button.btn', { type: 'button', html: I.telecharger + '<span>Exporter Excel</span>', onclick: function () { self.exporter(); } });
    this.btnNouvelle = h('a.btn.primaire', { href: AMX.lien('outils', 'evaluation', {}), html: I.plus + '<span>Nouvelle évaluation</span>' });
    var entete = h('div.entete-page', [
      h('div', { style: { minWidth: 0 } }, [h('h1', 'Registre des évaluations'), this.elEtat]),
      h('div.actions', [this.btnRafraichir, this.btnExport, this.btnNouvelle])
    ]);
    this.elCartes = h('div.registre-cartes#registre-kpis');
    this.elVeille = h('div#registre-veille');
    this.elRecherche = h('input.saisie#registre-recherche', { type: 'search', placeholder: 'NIV, modèle, version, acheteur…', autocomplete: 'off', oninput: AMX.debounce(function (e) { self.recherche = e.target.value; self.rendreTable(); }, 120) });
    this.elSegment = h('div.segment', { role: 'group', 'aria-label': 'Période' });
    this.elSegmentStatut = h('div.segment#registre-statut', { role: 'group', 'aria-label': 'Statut' });
    this.elAcheteur = h('select.saisie#registre-acheteur', { 'aria-label': 'Évaluateur', style: { height: '32px', width: 'auto' } });
    this.elAcheteur.addEventListener('change', function () { self.acheteur = self.elAcheteur.value; self.rendreTable(); });
    this.elCompte = h('span.compte.doux');
    var barre = h('div.carte.registre-barre', [h('div.carte-corps', [h('div.registre-outils', [
      h('div.recherche', [h('span', { html: I.recherche }), this.elRecherche]), this.elSegment, this.elSegmentStatut, this.elAcheteur, this.elCompte
    ])])]);
    this.elTable = h('div.eval-table.registre-table');
    this.elVide = h('div');
    this.el = h('div.page.eval-page.registre-page', [entete, this.elVeille, this.elCartes, barre, this.elVide, h('div.carte', [h('div.carte-corps.registre-corps', [this.elTable])])]);
  };

  Registre.prototype.charger = function (manuel) {
    var self = this, gen = ++this.generation;
    if (manuel) this.btnRafraichir.classList.add('occupe');
    return AMX.get({ evaluations: 1 }).then(function (d) {
      if (gen !== self.generation) return;
      self.btnRafraichir.classList.remove('occupe');
      if (d && d.refuse) { self.refus = d.erreur || 'Accès refusé.'; self.rendre(); return; }
      if (!d || !d.ok) throw new Error((d && (d.erreur || d.message)) || 'Réponse inattendue du serveur');
      self.liste = d.evaluations || []; self.parConcession = d.parConcession || {}; self.erreur = ''; self.refus = '';
      self.rendre();
      if (manuel) AMX.toast('Registre mis à jour — ' + self.liste.length + ' évaluation' + (self.liste.length > 1 ? 's' : ''), 'ok');
    }).catch(function (e) {
      if (gen !== self.generation) return;
      self.btnRafraichir.classList.remove('occupe');
      self.erreur = AMX.erreurTexte(e); self.rendre();
      AMX.toast('Impossible de charger le registre — ' + self.erreur, 'erreur');
    });
  };

  // Lignes de la période et de l'évaluateur choisis (la concession et la recherche s'appliquent ensuite).
  Registre.prototype.base = function () {
    var self = this, debut = debutPeriode(this.periode);
    return (this.liste || []).filter(function (r) {
      var t = new Date(r.dateMaj).getTime();
      if (!(isNaN(t) || t >= debut)) return false;
      if (self.acheteur && (r.par || '') !== self.acheteur) return false;
      if (self.statut !== 'tous' && (r.statut === 'auto' ? 'auto' : 'enregistree') !== self.statut) return false;
      return true;
    });
  };
  Registre.prototype.filtrees = function () {
    var self = this, q = this.recherche.trim().toUpperCase();
    return this.base().filter(function (r) {
      if (self.concession && concessionDe(r) !== self.concession) return false;
      if (!q) return true;
      return [r.vin, r.marque, r.modele, r.version, r.annee, r.par, AMX.CONCESSIONS_TOUTES[concessionDe(r)]].join(' ').toUpperCase().indexOf(q) >= 0;
    });
  };
  function concessionDe(r) { return (r.concession && AMX.CONCESSIONS_TOUTES[r.concession]) ? r.concession : 'stemarie'; }
  function agregerRegistre(lignes) {
    var n = lignes.length, paye = 0, detail = 0, marge = 0, nMarge = 0, pct = 0, nPct = 0, nEnr = 0;
    lignes.forEach(function (r) { var p = nombre(r.prixPaye), d = nombre(r.prixVente), m = nombre(r.marge); if (p !== null) paye += p; if (d !== null) detail += d; if (m !== null) { marge += m; nMarge++; } if (r.marchePct) { pct += r.marchePct; nPct++; } if (r.statut !== 'auto') nEnr++; });
    return { n: n, paye: paye, detail: detail, marge: marge, margeMoy: nMarge ? marge / nMarge : null, pctMoy: nPct ? pct / nPct : null, nEnr: nEnr, nAuto: n - nEnr };
  }

  Registre.prototype.rendre = function () {
    var self = this;
    AMX.vider(this.elCartes); AMX.vider(this.elSegment); AMX.vider(this.elVide);
    if (this.refus) { this.elEtat.textContent = this.refus; this.elVide.appendChild(h('div.vide', [h('div', { html: I.cadenas }), h('h3', 'Accès non autorisé'), h('div', { text: this.refus })])); this.elTable.textContent = ''; return; }
    if (!this.liste) { this.elEtat.textContent = this.erreur ? 'Serveur injoignable : ' + this.erreur : 'Chargement du registre…'; if (!this.erreur) this.elVide.appendChild(AMX.chargeur('Registre des évaluations')); return; }
    var total = this.liste.length;
    var nEnr = this.liste.filter(function (r) { return r.statut !== 'auto'; }).length, nAuto = total - nEnr;
    this.rendreVeille();
    this.elEtat.textContent = total + ' évaluation' + (total > 1 ? 's' : '') + ' — ' + nEnr + ' enregistrée' + (nEnr > 1 ? 's' : '') + ' (vert) et ' + nAuto + ' analyse' + (nAuto > 1 ? 's' : '') + ' conservée' + (nAuto > 1 ? 's' : '') + ' automatiquement (gris), une par véhicule, par évaluateur et par concession. Cliquez une concession pour filtrer, une ligne pour ouvrir.';
    // Période
    PERIODES_REGISTRE.forEach(function (p) {
      self.elSegment.appendChild(h('button' + (p[0] === self.periode ? '.actif' : ''), { type: 'button', text: p[1], onclick: function () { self.periode = p[0]; AMX.memo.ecrire('registre_eval_periode', p[0]); self.rendre(); } }));
    });
    // Statut (enregistrée à la main / analyse conservée d'office)
    AMX.vider(this.elSegmentStatut);
    STATUTS_REGISTRE.forEach(function (p) {
      self.elSegmentStatut.appendChild(h('button' + (p[0] === self.statut ? '.actif' : ''), { type: 'button', text: p[1], onclick: function () { self.statut = p[0]; AMX.memo.ecrire('registre_eval_statut', p[0]); self.rendre(); } }));
    });
    // Évaluateurs
    var acheteurs = {}; (this.liste || []).forEach(function (r) { if (r.par) acheteurs[r.par] = (acheteurs[r.par] || 0) + 1; });
    AMX.vider(this.elAcheteur);
    this.elAcheteur.appendChild(h('option', { value: '', text: 'Tous les évaluateurs' }));
    Object.keys(acheteurs).sort().forEach(function (a) { self.elAcheteur.appendChild(h('option', { value: a, selected: a === self.acheteur ? true : undefined, text: a.split('@')[0] + ' (' + acheteurs[a] + ')' })); });
    // Cartes par concession (sur la période / l'évaluateur)
    var base = this.base();
    var carte = function (cle, libelle, lignes) {
      var ag = agregerRegistre(lignes), actif = self.concession === cle;
      var k = h('button.registre-carte' + (actif ? '.actif' : '') + (cle ? '.' + (COULEUR_CONCESSION[cle] || 'gris') : '.toutes'), { type: 'button', 'aria-pressed': actif ? 'true' : 'false', onclick: function () { self.concession = cle; AMX.memo.ecrire('registre_eval_concession', cle); self.rendre(); } }, [
        h('div.haut', [h('div.nom', { text: libelle }), h('div.n.num', { text: String(ag.n) })]),
        h('div.bas', ag.n ? [
          h('span', [h('b', { text: fmt(ag.detail) }), ' détail']),
          h('span.' + (ag.margeMoy !== null && ag.margeMoy >= 0 ? 'pos' : 'neg'), [h('b', { text: ag.margeMoy !== null ? fmt(ag.margeMoy) : '—' }), ' marge moy.']),
          h('span', [h('b', { text: ag.pctMoy !== null ? pct(ag.pctMoy) : '—' }), ' marché']),
          h('span.statuts', { title: ag.nEnr + ' enregistrée(s), ' + ag.nAuto + ' analyse(s) automatique(s)' }, [h('i.ok'), h('b', { text: String(ag.nEnr) }), h('i.auto'), h('b', { text: String(ag.nAuto) })])
        ] : [h('span.doux', { text: 'aucune évaluation' })])
      ]);
      return k;
    };
    this.elCartes.appendChild(carte('', 'Toutes les concessions', base));
    // Une carte par concession, toujours les cinq ; une évaluation sans concession (anciennes fiches) compte pour Ste-Marie.
    Object.keys(AMX.concessionsPour('evaluations')).forEach(function (c) { self.elCartes.appendChild(carte(c, nomCourt(c), base.filter(function (r) { return concessionDe(r) === c; }))); });
    this.rendreTable();
  };

  // Bandeau « prix hors marché » : les véhicules dont la veille hebdomadaire
  // (Marche.gs, MARCHE_veille) a trouvé un prix de détail > 105 % de la moyenne active.
  Registre.prototype.rendreVeille = function () {
    var self = this, el = this.elVeille; AMX.vider(el);
    var derives = (this.liste || []).filter(function (r) { return r.veille && r.veille.derive; }).sort(function (a, b) { return (b.veille.marchePct || 0) - (a.veille.marchePct || 0); });
    var suivis = (this.liste || []).filter(function (r) { return r.veille; }).length;
    if (!suivis) return;
    if (!derives.length) { el.appendChild(h('div.alerte-bloc.ok.registre-alerte', [h('span', { html: I.ok }), h('div', { text: 'Veille des prix : ' + suivis + ' véhicule(s) suivi(s), tous dans le marché.' })])); return; }
    el.appendChild(h('div.alerte-bloc.attention.registre-alerte#registre-derives', [h('span', { html: I.alerte }), h('div', [
      h('div', { text: derives.length + ' véhicule(s) affiché(s) au-dessus du marché (veille hebdomadaire) :' }),
      h('div.mini.liste-derives', derives.slice(0, 6).map(function (r) {
        return h('a', { href: AMX.lien('outils', 'evaluation', { vin: r.vin }), text: [r.annee, r.marque, r.modele].filter(Boolean).join(' ') + ' · ' + fmt(nombre(r.prixVente)) + ' vs ' + fmt(r.veille.moyenneActive) + ' (+' + Math.round((r.veille.marchePct - 1) * 100) + ' %)' });
      }).concat(derives.length > 6 ? [h('span.doux', { text: '… et ' + (derives.length - 6) + ' autre(s)' })] : []))
    ])]));
  };

  Registre.prototype.rendreTable = function () {
    var self = this;
    AMX.vider(this.elTable);
    var lignes = this.filtrees();
    this.elCompte.textContent = lignes.length + ' évaluation' + (lignes.length > 1 ? 's' : '') + (this.concession && this.concession !== '(aucune)' ? ' · ' + nomCourt(this.concession) : '');
    if (!lignes.length) { this.elTable.appendChild(h('div.vide', [h('div', { html: I.filtre }), h('h3', 'Aucune évaluation'), h('div', { text: this.recherche ? 'Rien ne correspond à la recherche.' : 'Aucune évaluation pour ce filtre — ouvrez « Évaluation marché » et entrez un NIV : chaque analyse est conservée ici.' })])); return; }
    var c = COL_REGISTRE.filter(function (x) { return x.cle === self.tri.cle; })[0] || COL_REGISTRE[0];
    var val = c.valeur || function (r) { return r[c.cle]; };
    lignes = lignes.slice().sort(function (a, b) {
      var va = val(a), vb = val(b), r;
      if (typeof va === 'number' || typeof vb === 'number') { va = (typeof va === 'number' && !isNaN(va)) ? va : -Infinity; vb = (typeof vb === 'number' && !isNaN(vb)) ? vb : -Infinity; r = va === vb ? 0 : (va < vb ? -1 : 1); }
      else r = String(va || '').localeCompare(String(vb || ''), 'fr', { numeric: true, sensitivity: 'base' });
      return self.tri.desc ? -r : r;
    });
    var thead = h('thead', [h('tr', COL_REGISTRE.map(function (col) {
      var actif = self.tri.cle === col.cle;
      var th = h('th' + (col.num ? '.num' : '') + '.registre-triable' + (actif ? '.actif' : ''), { 'aria-sort': actif ? (self.tri.desc ? 'descending' : 'ascending') : 'none', title: 'Trier par ' + col.libelle.toLowerCase() }, [col.libelle, actif ? h('span', { text: self.tri.desc ? ' ▼' : ' ▲', style: { fontSize: '9px' } }) : null]);
      th.addEventListener('click', function () { if (self.tri.cle === col.cle) self.tri.desc = !self.tri.desc; else { self.tri.cle = col.cle; self.tri.desc = !!col.num || col.cle === 'dateMaj'; } self.rendreTable(); });
      return th;
    }))]);
    var tbody = h('tbody');
    lignes.forEach(function (r) {
      var m = r.marchePct, marge = nombre(r.marge), kmV = nombre(r.km);
      var auto = r.statut === 'auto';
      var tr = h('tr.cliquable' + (auto ? '.registre-auto' : '.registre-enregistree'), { tabindex: '0' }, [
        h('td.num.registre-date', [h('div', { text: r.dateMaj ? AMX.fmtDate(r.dateMaj) : '—' }), h('div.mini', { text: depuis(r.dateMaj) })]),
        h('td.registre-vehicule', [AMX.logoMarque(r.marque, 'petit'), h('div', [h('div.nom', { text: [r.annee, r.marque, r.modele].filter(Boolean).join(' ') || '—' }), h('div.mini', { text: [r.version, kmV !== null ? fmtKm(kmV) : ''].filter(Boolean).join(' · ') })])]),
        h('td.mono.registre-vin', { text: r.vin }),
        h('td', [h('span.badge.sans-point.' + (COULEUR_CONCESSION[concessionDe(r)] || 'gris'), { text: nomCourt(concessionDe(r)) })]),
        h('td.num', { text: fmt(nombre(r.prixPaye)) }),
        h('td.num', { text: fmt(nombre(r.recon)) }),
        h('td.num' + (marge !== null ? (marge >= 0 ? '.inf' : '.sup') : ''), { text: fmt(marge) }),
        h('td.num.registre-detail', { text: fmt(nombre(r.prixVente)) }),
        h('td.num', { text: fmt(r.standard), title: r.analyseLe ? 'Analyse du ' + AMX.fmtDate(r.analyseLe, true) + (r.pays === 'us' ? ' (États-Unis)' : ' (Canada)') : 'Pas d\'analyse de marché enregistrée' }),
        h('td.num', m ? [h('span.puce' + (m > 1.03 ? '.alerte' : (m < 0.97 ? '.ok' : '.attention')), { text: pct(m) }), r.rang ? h('div.mini', { text: 'rang ' + r.rang + '/' + r.rangSur }) : null] : '—'),
        h('td.num.registre-veille', r.veille && typeof r.veille.marchePct === 'number' ? [h('span.puce' + (r.veille.derive ? '.alerte' : (r.veille.marchePct < 0.97 ? '.ok' : '')), { text: (r.veille.marchePct >= 1 ? '+' : '') + Math.round((r.veille.marchePct - 1) * 100) + ' %', title: 'Détail ' + fmt(nombre(r.prixVente)) + ' vs moyenne active ' + fmt(r.veille.moyenneActive) + ' (' + r.veille.nActifs + ' annonces, ' + (r.veille.lieu || '') + ')' }), h('div.mini', { text: AMX.fmtDateCourte(r.veille.le) })] : [h('span.doux', '—')]),
        h('td.registre-statut', [h('span.badge.sans-point.' + (auto ? 'gris' : 'vert'), { text: auto ? 'Auto' : 'Enregistrée', title: auto ? 'Analyse conservée automatiquement — ouvrez-la et cliquez « Enregistrer » pour la confirmer' : 'Enregistrée' + (r.enregistreLe ? ' le ' + AMX.fmtDate(r.enregistreLe, true) : '') + (r.enregistrePar ? ' par ' + r.enregistrePar.split('@')[0] : '') })]),
        h('td', r.par ? [h('span.registre-par', { title: r.par }, [h('span.avatar', { text: AMX.initiales(r.par.split('@')[0].replace(/[._-]/g, ' ')) }), h('span', { text: r.par.split('@')[0] })])] : '—')
      ]);
      var ouvrir = function () { AMX.aller('outils', 'evaluation', { vin: r.vin }); };
      tr.addEventListener('click', ouvrir);
      tr.addEventListener('keydown', function (e) { if (e.key === 'Enter') ouvrir(); });
      tbody.appendChild(tr);
    });
    var ag = agregerRegistre(lignes);
    var tfoot = h('tfoot', [h('tr', [
      h('td', { colspan: '4', text: 'Total — ' + ag.n + ' évaluation' + (ag.n > 1 ? 's' : '') }),
      h('td.num', { text: fmt(ag.paye) }), h('td.num', ''), h('td.num.' + (ag.marge >= 0 ? 'inf' : 'sup'), [h('div', { text: fmt(ag.marge) }), ag.margeMoy !== null ? h('div.mini', { style: { fontWeight: 400 }, text: 'moy. ' + fmt(ag.margeMoy) }) : null]),
      h('td.num', { text: fmt(ag.detail) }), h('td.num', ''), h('td.num', { text: ag.pctMoy !== null ? 'moy. ' + pct(ag.pctMoy) : '' }), h('td.num', ''), h('td', { text: ag.nEnr + ' enr. · ' + ag.nAuto + ' auto' }), h('td', '')
    ])]);
    this.elTable.appendChild(h('table.tableau#registre-table', [thead, tbody, tfoot]));
  };

  Registre.prototype.exporter = function () {
    var lignes = this.filtrees();
    if (!lignes.length) { AMX.toast('Aucune évaluation à exporter.', 'attention'); return; }
    if (typeof XLSX === 'undefined') { AMX.toast('La bibliothèque Excel n\'est pas encore chargée. Réessayez.', 'erreur'); return; }
    var rows = lignes.map(function (r) {
      return { 'Date': r.dateMaj ? AMX.fmtDate(r.dateMaj) : '', 'Statut': r.statut === 'auto' ? 'Analyse automatique' : 'Enregistrée', 'Enregistrée le': r.enregistreLe ? AMX.fmtDate(r.enregistreLe, true) : '', 'Enregistrée par': r.enregistrePar || '', 'NIV': r.vin, 'Année': r.annee, 'Marque': r.marque, 'Modèle': r.modele, 'Version': r.version, 'Concession': AMX.CONCESSIONS_TOUTES[concessionDe(r)],
        'KM': nombre(r.km), 'Prix payé': nombre(r.prixPaye), 'Reconditionnement': nombre(r.recon), 'Marge': nombre(r.marge), 'Prix de détail': nombre(r.prixVente),
        'Marché agressif': r.agressif, 'Marché standard': r.standard, 'Marché conservateur': r.conservateur, 'Marché %': r.marchePct !== null && r.marchePct !== undefined ? Math.round(r.marchePct * 1000) / 10 : '', 'Rang': r.rang ? r.rang + '/' + r.rangSur : '', 'Pays': r.pays, 'État / province': r.etat || '', 'Veille %': r.veille && typeof r.veille.marchePct === 'number' ? Math.round((r.veille.marchePct - 1) * 1000) / 10 : '', 'Veille le': r.veille && r.veille.le ? AMX.fmtDate(r.veille.le) : '', 'Analyse le': r.analyseLe ? AMX.fmtDate(r.analyseLe, true) : '', 'Par': r.par };
    });
    var ws = XLSX.utils.json_to_sheet(rows);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Évaluations');
    XLSX.writeFile(wb, 'evaluations-' + (this.concession || 'toutes') + '-' + new Date().toISOString().slice(0, 10) + '.xlsx');
    AMX.toast('Export Excel — ' + lignes.length + ' ligne' + (lignes.length > 1 ? 's' : ''), 'ok');
  };

  AMX.vues = AMX.vues || {};
  AMX.vues.Evaluation = Evaluation;
  AMX.vues.RegistreEvaluations = Registre;
})();
