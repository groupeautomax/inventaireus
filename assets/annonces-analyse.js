/* =====================================================================================================
   annonces-analyse.js — Marketing › Analyse (12 nov. 2026, refaite le soir même)

   Maxime : « je veux vraiment une analyse poussée des résultats de la bannière » (rapport reports/Analyse des annonces de
   véhicules Google.md) ; puis « je n'aime pas quand il y a des petits écrits, la grosse boîte cache-la derrière un onglet ;
   est-ce que Einstein pourrait aider ? » ; puis, le 12 nov. au soir : « l'analyse est pas simple, fais des plus belles pages,
   je ne trouve plus le data des clics, des $ dépensés etc., assure-toi que tous les KPI sont là ».

   La page, de haut en bas (règle des filtres d'abord) :
     1. Période et genre (Tous, Neufs, Occasions, Démos). Les périodes vont jusqu'à aujourd'hui.
     2. Une ligne d'état : Google Ads à jour, pas encore d'annonce montrée, ou pas branché — elle dit pourquoi un chiffre est à 0.
     3. Les chiffres, toujours visibles, même à zéro :
          Google Ads — impressions, clics, taux de clic, dépense, coût par clic, conversions, coût par conversion, valeur ;
          Ventes et publicité — ventes de la période, vendues après un clic, dépense par vente, profit ÷ dépense.
        Chacun comparé à la période précédente de même durée.
     4. Trois onglets :
          Résumé    — Einstein (sur demande), semaine par semaine, le flux envoyé à Google, les clics par âge en stock,
                      à surveiller, et le détail par campagne et par réseau (replié).
          Véhicules — un tableau : chaque véhicule avec ses impressions, clics, taux de clic, dépense, coût par clic,
                      conversions et coût par conversion ; un clic sur un titre de colonne trie.
          Ventes    — chaque vente avec la publicité reçue avant la date de vente.
        « Branchement Google Ads » n'est un onglet que tant que Google Ads n'est pas branché ; ensuite, Actions.
   « Rafraîchir » relit la feuille du script Google Ads puis l'analyse. Texte jamais sous 15 px.
   Rien n'est envoyé à Einstein sans un clic ; il ne reçoit aucun client.
   Routes : GET ?annoncesAnalyse=1&compagnie=&du=&au= ; POST annoncesResultats { op: creer | partager | lire | einstein } ;
   et ?fluxGoogle=1 (FluxGoogle.gs) pour le flux.
   ===================================================================================================== */
(function () {
  'use strict';
  var h = AMX.h;
  var SCRIPT_PAS_A_JOUR = 'Le script n\'est pas à jour : déployez la version qui contient AnnoncesAnalyse.gs.';
  var URL_ADS = 'https://ads.google.com/aw/campaigns?ocid=8664050367';
  var CSS = [
    '.ana-page { font-size: 16px; }',
    '.ana-page .ana-filtres { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin: 0 0 14px; }',
    '.ana-filtres select.saisie, .ana-filtres input.saisie { width: auto; flex: 0 0 auto; min-width: 210px; font-size: 16px; min-height: 42px; }',
    '.ana-filtres input.saisie { flex: 1 1 240px; max-width: 360px; }',
    '.ana-filtres .segment button { font-size: 15px; padding: 9px 14px; }',
    '.entete-page .btn[hidden] { display: none; }',   /* ancienne interface : .btn met display: inline-flex */
    /* ligne d'état */
    '.ana-statut { display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: center; border: 1px solid var(--ligne); border-radius: 14px; padding: 12px 16px; margin: 0 0 16px; font-size: 16px; line-height: 1.45; background: var(--carte); }',
    '.ana-statut .t { flex: 1 1 220px; min-width: 0; } .ana-statut .t b { font-weight: 700; } .ana-statut .t .doux { color: var(--encre-2); }',
    '.ana-statut .rond { width: 12px; height: 12px; border-radius: 50%; flex: 0 0 auto; background: var(--gris); }',
    '.ana-statut.vert { background: var(--vert-clair); border-color: #B9E3C9; } .ana-statut.vert .rond { background: var(--vert); }',
    '.ana-statut.ambre { background: var(--ambre-bg); border-color: var(--ambre-bord); } .ana-statut.ambre .rond { background: var(--ambre); }',
    '.ana-statut.bleu { background: var(--bleu-bg); border-color: var(--bleu-bord); } .ana-statut.bleu .rond { background: var(--bleu); }',
    '.ana-statut .btn { min-height: 40px; }',
    /* les chiffres */
    '.ana-kpi-zone { display: grid; gap: 18px; margin: 0 0 24px; }',
    '.ana-kgroupe > h2 { font-size: 20px; margin: 0 0 10px; display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: baseline; }',
    '.ana-kgroupe > h2 small { font-size: 15px; font-weight: 400; color: var(--encre-2); }',
    '.ana-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }',
    '.ana-k { border: 1px solid var(--ligne); background: var(--carte); border-radius: 14px; padding: 14px 16px 15px; text-align: left; font: inherit; color: var(--encre); box-shadow: var(--ombre); min-width: 0; }',
    'button.ana-k { cursor: pointer; } button.ana-k:hover { border-color: var(--vert); }',
    '.ana-k .lib { display: block; font-size: 16px; font-weight: 700; color: var(--encre-2); }',
    '.ana-k b { display: block; font-size: 32px; line-height: 1.15; margin-top: 4px; font-variant-numeric: tabular-nums; letter-spacing: -0.5px; overflow-wrap: anywhere; }',
    '.ana-k .note { display: block; font-size: 15px; color: var(--encre-2); margin-top: 6px; line-height: 1.35; }',
    '.ana-k .var { display: inline-block; font-size: 15px; font-weight: 700; border-radius: 999px; padding: 2px 10px; margin-top: 8px; background: var(--gris-bg); color: var(--encre-2); }',
    '.ana-k .var.hausse { background: var(--vert-clair); color: var(--vert-fonce); } .ana-k .var.baisse { background: var(--rouge-bg); color: var(--rouge); }',
    '.ana-k.zero b { color: var(--encre-3); }',
    '.ana-k.vert b { color: var(--vert-fonce); } .ana-k.rouge b { color: var(--rouge); } .ana-k.ambre b { color: var(--ambre); }',
    /* onglets */
    '.ana-onglets { display: flex; gap: 6px; flex-wrap: wrap; border-bottom: 2px solid var(--ligne); margin: 0 0 18px; }',
    '.ana-onglets button { font: inherit; font-size: 17px; font-weight: 700; color: var(--encre-3); background: none; border: 0; border-bottom: 3px solid transparent; margin-bottom: -2px; padding: 12px 16px; cursor: pointer; display: inline-flex; gap: 8px; align-items: center; }',
    '.ana-onglets button:hover { color: var(--encre); } .ana-onglets button.actif { color: var(--vert-fonce); border-bottom-color: var(--vert); }',
    '.ana-onglets button .n { font-size: 15px; font-weight: 700; background: var(--gris-bg); color: var(--encre-2); border-radius: 999px; padding: 1px 9px; }',
    '.ana-retour { font: inherit; font-size: 16px; font-weight: 700; color: var(--vert-fonce); background: none; border: 0; padding: 6px 0; margin: 0 0 12px; cursor: pointer; }',
    /* zones */
    '.ana-zone { margin: 0 0 30px; } .ana-zone > h2 { font-size: 22px; margin: 0 0 12px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }',
    '.ana-zone > h2 .seg { margin-left: auto; font-size: 15px; font-weight: 400; }',
    '.ana-zone > details > summary { font-size: 20px; font-weight: 700; cursor: pointer; padding: 6px 0; }',
    '.ana-zone > details .ana-deux { margin-top: 12px; }',
    /* petites tuiles (flux, à surveiller) */
    '.ana-tuiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; margin: 0 0 14px; }',
    '.ana-tuile { border: 1px solid var(--ligne); background: var(--carte); border-radius: 14px; padding: 14px 16px; text-align: left; font: inherit; color: var(--encre); box-shadow: var(--ombre); }',
    'button.ana-tuile { cursor: pointer; } button.ana-tuile:hover { border-color: var(--vert); }',
    '.ana-tuile b { display: block; font-size: 28px; line-height: 1.15; font-variant-numeric: tabular-nums; }',
    '.ana-tuile span { display: block; font-size: 16px; color: var(--encre-2); margin-top: 4px; font-weight: 600; }',
    '.ana-tuile em { display: block; font-style: normal; font-size: 15px; margin-top: 6px; color: var(--encre-2); }',
    '.ana-tuile.vert b { color: var(--vert-fonce); } .ana-tuile.ambre b { color: var(--ambre); } .ana-tuile.rouge b { color: var(--rouge); } .ana-tuile.violet b { color: var(--violet); }',
    /* cartes */
    '.ana-carte { border: 1px solid var(--ligne); background: var(--carte); border-radius: 14px; padding: 16px 18px; margin: 0 0 14px; font-size: 16px; line-height: 1.5; }',
    '.ana-carte.ambre { border-color: var(--ambre-bord); background: var(--ambre-bg); } .ana-carte.bleu { border-color: var(--bleu-bord); background: var(--bleu-bg); }',
    '.ana-carte h3 { font-size: 19px; margin: 0 0 8px; } .ana-carte ol { margin: 8px 0 0 22px; padding: 0; } .ana-carte li { margin: 8px 0; }',
    '.ana-carte pre { white-space: pre-wrap; word-break: break-word; font-size: 15px; background: var(--fond); border: 1px solid var(--ligne); border-radius: 8px; padding: 12px; max-height: 360px; overflow: auto; }',
    '.ana-carte .rangee { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 12px; }',
    /* Einstein */
    '.ana-ein { border: 2px solid var(--violet-bord); background: linear-gradient(180deg, var(--violet-bg), var(--carte) 120px); border-radius: 16px; padding: 18px 20px; margin: 0 0 26px; }',
    '.ana-ein .tete { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; } .ana-ein .tete .t { flex: 1 1 260px; } .ana-ein .tete h2 { font-size: 22px; margin: 0; }',
    '.ana-ein .tete .quand { font-size: 15px; color: var(--encre-2); margin-top: 2px; }',
    '.ana-ein .resume { font-size: 18px; line-height: 1.55; margin: 14px 0 6px; color: var(--encre); }',
    '.ana-ein .actions { display: grid; gap: 10px; margin-top: 12px; }',
    '.ana-ein .act { display: grid; grid-template-columns: 40px 1fr; gap: 12px; background: var(--carte); border: 1px solid var(--ligne); border-radius: 12px; padding: 14px 16px; }',
    '.ana-ein .act .no { width: 36px; height: 36px; border-radius: 50%; background: var(--violet); color: #fff; display: grid; place-items: center; font-weight: 800; font-size: 17px; }',
    '.ana-ein .act b { display: block; font-size: 18px; } .ana-ein .act p { margin: 4px 0 0; font-size: 16px; color: var(--encre-2); line-height: 1.5; }',
    '.ana-ein .act .vh { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }',
    '.ana-ein .act .vh button { font: inherit; font-size: 15px; border: 1px solid var(--ligne-forte); background: var(--carte-2); border-radius: 999px; padding: 4px 12px; cursor: pointer; }',
    '.ana-ein .act .vh button:hover { border-color: var(--vert); color: var(--vert-fonce); }',
    '.ana-ein .act .faire { margin-top: 10px; }',
    '.ana-ein .alertes { margin-top: 14px; background: var(--ambre-bg); border: 1px solid var(--ambre-bord); border-radius: 12px; padding: 12px 16px; }',
    '.ana-ein .alertes b { font-size: 17px; } .ana-ein .alertes ul { margin: 6px 0 0 20px; padding: 0; } .ana-ein .alertes li { margin: 5px 0; font-size: 16px; }',
    '.ana-ein .vide-ein { font-size: 17px; color: var(--encre-2); margin: 12px 0 0; line-height: 1.5; }',
    /* barres par semaine (HTML, texte à sa vraie taille) */
    '.ana-cols { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 8px; align-items: end; height: 240px; padding: 10px 6px 0; border-bottom: 2px solid var(--ligne-forte); }',
    '.ana-cols .c { display: flex; flex-direction: column; justify-content: flex-end; align-items: center; height: 100%; min-width: 0; }',
    '.ana-cols .c .v { font-size: 15px; font-weight: 700; color: var(--encre-2); margin-bottom: 4px; white-space: nowrap; font-variant-numeric: tabular-nums; }',
    '.ana-cols .c .b { width: 100%; max-width: 54px; background: var(--vert); border-radius: 6px 6px 0 0; min-height: 0; }',
    '.ana-cols .c.der .b { background: var(--vert-fonce); } .ana-cols .c:hover .b { background: var(--vert-fonce); }',
    '.ana-dates { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 8px; padding: 6px 6px 0; } .ana-dates span { font-size: 15px; color: var(--encre-2); text-align: center; white-space: nowrap; overflow: hidden; }',
    /* par âge : deux barres par tranche */
    '.ana-age { display: grid; gap: 14px; } .ana-age .r { display: grid; grid-template-columns: 120px 1fr; gap: 14px; align-items: center; }',
    '.ana-age .r > b { font-size: 17px; } .ana-age .barres { display: grid; gap: 6px; }',
    '.ana-age .l { display: grid; grid-template-columns: 1fr 160px; gap: 10px; align-items: center; } .ana-age .l span { font-size: 15px; color: var(--encre-2); font-variant-numeric: tabular-nums; }',
    '.ana-age .p { height: 16px; border-radius: 999px; background: var(--fond); position: relative; overflow: hidden; } .ana-age .p i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 999px; }',
    '.ana-age .p.stock i { background: #8A94A3; } .ana-age .p.clics i { background: var(--vert); }',
    '.ana-legende { display: flex; gap: 18px; flex-wrap: wrap; font-size: 15px; color: var(--encre-2); margin: 0 0 12px; } .ana-legende i { display: inline-block; width: 14px; height: 14px; border-radius: 4px; vertical-align: -2px; margin-right: 6px; }',
    /* pastilles et pilules */
    '.ana-pastille { display: inline-block; font-size: 15px; font-weight: 700; border-radius: 999px; padding: 2px 10px; margin: 2px 4px 2px 0; white-space: nowrap; }',
    '.ana-pastille.vert { background: var(--vert-clair); color: var(--vert-fonce); } .ana-pastille.ambre { background: var(--ambre-bg); color: var(--ambre); } .ana-pastille.rouge { background: var(--rouge-bg); color: var(--rouge); } .ana-pastille.gris { background: var(--gris-bg); color: var(--gris); } .ana-pastille.violet { background: var(--violet-bg); color: var(--violet); } .ana-pastille.bleu { background: var(--bleu-bg); color: var(--bleu); }',
    '.ana-pilules { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 12px; }',
    '.ana-pilules button { font: inherit; font-size: 16px; border: 1px solid var(--ligne-forte); background: var(--carte); border-radius: 999px; padding: 8px 16px; cursor: pointer; }',
    '.ana-pilules button.actif { background: var(--noir); border-color: var(--noir); color: #fff; } .ana-pilules button b { margin-left: 6px; }',
    /* tableaux */
    '.ana-defile { overflow-x: auto; border: 1px solid var(--ligne); border-radius: 14px; background: var(--carte); }',
    '.ana-table { width: 100%; border-collapse: collapse; font-size: 16px; }',
    '.ana-table th { text-align: left; font-weight: 700; color: var(--encre-2); border-bottom: 2px solid var(--ligne); padding: 10px 12px; white-space: nowrap; font-size: 15px; background: var(--carte-2); }',
    '.ana-table th button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; white-space: nowrap; }',
    '.ana-table th button:hover, .ana-table th.trie button { color: var(--vert-fonce); }',
    '.ana-table td { border-bottom: 1px solid var(--ligne); padding: 10px 12px; vertical-align: middle; }',
    '.ana-table td.n, .ana-table th.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }',
    '.ana-table td .sous { display: block; font-size: 15px; color: var(--encre-2); }',
    '.ana-table td.zero { color: var(--encre-3); }',
    '.ana-table tbody tr:hover td { background: var(--carte-2); }',
    '.ana-table tfoot td { font-weight: 700; border-top: 2px solid var(--ligne); border-bottom: 0; background: var(--carte-2); }',
    '.ana-veh { display: flex; gap: 12px; align-items: center; min-width: 280px; }',
    '.ana-veh .ph { width: 72px; height: 50px; border-radius: 8px; background: var(--fond); flex: 0 0 auto; overflow: hidden; display: grid; place-items: center; color: var(--encre-3); font-size: 15px; }',
    '.ana-veh .ph img { width: 100%; height: 100%; object-fit: cover; display: block; }',
    '.ana-veh .nom { font-weight: 700; line-height: 1.3; } .ana-veh a.nom { color: var(--encre); text-decoration: none; } .ana-veh a.nom:hover { color: var(--vert-fonce); text-decoration: underline; }',
    '.ana-veh .pas { margin-top: 2px; } .ana-veh .pas .ana-pastille { white-space: normal; }',
    '.ana-veh .tel, .ana-table .tot-tel { display: none; }',
    '.ana-deux { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 14px; }',
    '.ana-vide { padding: 26px; text-align: center; color: var(--encre-2); font-size: 17px; border: 1px dashed var(--ligne-forte); border-radius: 14px; background: var(--carte); }',
    '.ana-note { font-size: 16px; color: var(--encre-2); margin: 0 0 12px; line-height: 1.5; }',
    '.ana-plus { display: block; margin: 16px auto 0; }',
    '@media (max-width: 1100px) { .ana-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }',
    '@media (max-width: 640px) { .ana-kpis { gap: 8px; } .ana-k { padding: 12px 12px 13px; } .ana-k b { font-size: 26px; } .ana-k .lib { font-size: 15px; }',
    '  .ana-tuiles { grid-template-columns: 1fr 1fr; } .ana-tuile b { font-size: 24px; } .ana-tuile span { font-size: 15px; } .ana-cols { height: 190px; } .ana-cols .c .v { display: none; }',
    '  .ana-age .r { grid-template-columns: 1fr; } .ana-age .l { grid-template-columns: 1fr 130px; } .ana-onglets button { font-size: 16px; padding: 10px 10px; }',
    '  .ana-table .cache-tel { display: none; } .ana-veh { min-width: 0; } .ana-veh .ph { width: 56px; height: 40px; }',
    '  .ana-table.vt td.n, .ana-table.vt th.n { display: none; } .ana-veh .tel, .ana-table .tot-tel { display: block; font-size: 15px; font-weight: 700; color: var(--encre); margin-top: 2px; } }'
  ].join('\n');
  function css() { if (!document.getElementById('css-annonces-analyse')) { var s = document.createElement('style'); s.id = 'css-annonces-analyse'; s.textContent = CSS; document.head.appendChild(s); } }
  function peutVoir() { return !!(AMX.fluxGoogle && AMX.fluxGoogle.peutVoir()); }

  var PERIODES = [['jour', 'Aujourd\'hui'], ['7', '7 derniers jours'], ['30', '30 derniers jours'], ['mois', 'Ce mois-ci'], ['moisprec', 'Le mois passé'], ['90', '90 derniers jours'], ['tout', 'Depuis le début']];
  var GENRES = [['', 'Tous'], ['neuf', 'Neufs'], ['occasion', 'Occasions'], ['demo', 'Démos']];
  var NOM_GENRE = { neuf: 'Neuf', occasion: 'Occasion', demo: 'Démo' };
  var TRANCHES = [[15, '0 à 15 j'], [30, '16 à 30 j'], [45, '31 à 45 j'], [60, '46 à 60 j'], [90, '61 à 90 j'], [Infinity, '90 j et +']];
  var RESEAUX = { SEARCH: 'Recherche Google', SEARCH_PARTNERS: 'Partenaires de recherche', CONTENT: 'Display', YOUTUBE: 'YouTube', YOUTUBE_SEARCH: 'YouTube', YOUTUBE_WATCH: 'YouTube', CROSS_NETWORK: 'Plusieurs réseaux (Performance Max)', GOOGLE_TV: 'Google TV', MIXED: 'Mixte', TOUS: 'Tous les réseaux', UNKNOWN: 'Inconnu', UNSPECIFIED: 'Non précisé' };
  var ONGLETS = [['resume', 'Résumé'], ['vehicules', 'Véhicules'], ['ventes', 'Ventes'], ['branchement', 'Branchement Google Ads']];
  var FILTRES_V = [['', 'Tous'], ['vedette', 'Mis de l\'avant'], ['propose', 'Proposés'], ['avecClics', 'Avec des clics'], ['sous', 'Sous-exposés'], ['sansConv', 'Dépense sans conversion'], ['photos', 'Moins de 10 photos'], ['exclu', 'Exclus du flux']];
  var GRAPHES = [['impressions', 'Impressions'], ['clics', 'Clics'], ['cout', 'Dépense'], ['conversions', 'Conversions']];
  /* colonnes du tableau des véhicules : clé, titre, cachée sur téléphone */
  var COLS_V = [['impressions', 'Impressions', false], ['clics', 'Clics', false], ['ctr', 'Taux de clic', true], ['cout', 'Dépense', false], ['cpc', 'Coût / clic', true], ['conversions', 'Conv.', true], ['cpa', 'Coût / conv.', true]];
  var GESTES = {
    mettre_avant: { texte: 'Ouvrir Annonces Google pour les cocher', href: '#/marketing/google' },
    retirer_avant: { texte: 'Ouvrir Annonces Google pour les décocher', href: '#/marketing/google' },
    prix: { texte: 'Voir l\'analyse occasion (prix du marché)', href: '#/inventaire/analyse' },
    budget: { texte: 'Ouvrir Google Ads', href: URL_ADS, dehors: true }
  };

  function iso(d) { var p = function (n) { return String(n).padStart(2, '0'); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  /* Les périodes vont jusqu'à aujourd'hui : le script Google Ads écrit aussi la journée en cours. */
  function periodeDates(code) {
    var ajd = new Date(); ajd.setHours(12, 0, 0, 0);
    if (code === 'jour') return { du: iso(ajd), au: iso(ajd) };
    if (code === 'mois') return { du: iso(new Date(ajd.getFullYear(), ajd.getMonth(), 1, 12)), au: iso(ajd) };
    if (code === 'moisprec') { var a = new Date(ajd.getFullYear(), ajd.getMonth() - 1, 1, 12), b = new Date(ajd.getFullYear(), ajd.getMonth(), 0, 12); return { du: iso(a), au: iso(b) }; }
    var n = code === 'tout' ? 400 : (parseInt(code, 10) || 30), du = new Date(ajd); du.setDate(du.getDate() - (n - 1));
    return { du: iso(du), au: iso(ajd) };
  }
  function nomPeriode(code) { var x = PERIODES.filter(function (p) { return p[0] === code; })[0]; return x ? x[1] : ''; }
  function fmtJour(s) { if (!s) return ''; var d = new Date(String(s).slice(0, 10) + 'T12:00:00'); return isNaN(d) ? s : d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' }); }
  function argent(n, dec) { return AMX.fmtArgent ? AMX.fmtArgent(n, dec) : (Math.round(n) + ' $'); }
  function argentCourt(n) { n = n || 0; if (Math.abs(n) >= 10000) return (Math.round(n / 100) / 10).toLocaleString('fr-CA') + ' k$'; return argent(n, n < 100 && n % 1 ? 2 : 0); }
  function argentFin(n) { return argent(n, Math.abs(n) < 100 ? 2 : 0); }
  function nb(n) { return AMX.fmtNombre(Math.round(n || 0)); }
  function nbCourt(n) { n = n || 0; if (n >= 10000) return (Math.round(n / 100) / 10).toLocaleString('fr-CA') + ' k'; return nb(n); }
  function dec1(n) { return (Math.round((n || 0) * 10) / 10).toLocaleString('fr-CA'); }
  function pctVal(v, dec) { return (Math.round(v * Math.pow(10, dec || 0)) / Math.pow(10, dec || 0)).toLocaleString('fr-CA') + ' %'; }
  function pct(a, b, dec) { if (!b) return '—'; return pctVal(100 * a / b, dec); }
  function mediane(l) { var a = l.filter(function (x) { return x !== null && x !== undefined && isFinite(x); }).sort(function (x, y) { return x - y; }); if (!a.length) return null; var m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; }
  function tranche(j) { if (j === null || j === undefined || !isFinite(j)) return null; for (var i = 0; i < TRANCHES.length; i++) if (j <= TRANCHES[i][0]) return i; return TRANCHES.length - 1; }
  function vide() { return { impressions: 0, clics: 0, cout: 0, conversions: 0, valeur: 0 }; }
  function ajoute(a, b) { if (b) ['impressions', 'clics', 'cout', 'conversions', 'valeur'].forEach(function (k) { a[k] += b[k] || 0; }); return a; }
  /* Les ratios d'un total : taux de clic, coût par clic, coût par conversion (null quand le diviseur est 0). */
  function ratios(t) { return { ctr: t.impressions ? 100 * t.clics / t.impressions : null, cpc: t.clics ? t.cout / t.clics : null, cpa: t.conversions ? t.cout / t.conversions : null }; }
  /* Comparaison à la période précédente : sens = 1 (plus c'est haut, mieux c'est), -1 (l'inverse), 0 (neutre, la dépense). */
  function variation(a, b, sens) {
    if (a === null || a === undefined || !b) return null;
    var v = (a - b) / b * 100; if (Math.abs(v) < 0.5) return { t: 'pareil qu\'avant', c: '' };
    var mieux = sens === 0 ? null : (v > 0) === (sens !== -1);
    return { t: (v >= 0 ? '+' : '−') + Math.abs(Math.round(v)).toLocaleString('fr-CA') + ' % vs avant', c: mieux === null ? '' : (mieux ? 'hausse' : 'baisse') };
  }
  function quand(s) { if (!s) return '—'; var d = new Date(s); if (isNaN(d)) return String(s); return fmtJour(iso(d)) + ', ' + d.getHours() + ' h ' + String(d.getMinutes()).padStart(2, '0'); }
  function refDe(x) { return String(x.stock || (x.vin ? x.vin.slice(-8) : '')).toUpperCase(); }
  function genreVente(v) { return v.type === 'usage' ? 'occasion' : (/demo|courtoisie/i.test(v.categorie || '') ? 'demo' : 'neuf'); }

  /* Le script Google Ads à coller dans Google Ads › Outils › Actions groupées › Scripts (il ne change rien dans le compte).
     12 nov. au soir : il lit les 30 derniers jours AUJOURD'HUI COMPRIS et se programme « Toutes les heures ». */
  function scriptAds(url, nom) {
    return [
      '/* ScanAutomax — résultats des annonces de véhicules, par véhicule (NIV), pour ' + (nom || 'la concession') + '.',
      '   Ce script ne change RIEN dans Google Ads : il lit les statistiques des 30 derniers jours (aujourd\'hui compris)',
      '   et les écrit dans la feuille de ScanAutomax. À programmer « Toutes les heures ». */',
      'var FEUILLE = \'' + url + '\';',
      'var JOURS = 30;',
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
      '  var compte = AdsApp.currentAccount(), tz = compte.getTimeZone();',
      '  var fin = Utilities.formatDate(new Date(), tz, \'yyyy-MM-dd\');',
      '  var debut = Utilities.formatDate(new Date(Date.now() - (JOURS - 1) * 864e5), tz, \'yyyy-MM-dd\');',
      '  var PLAGE = "segments.date BETWEEN \'" + debut + "\' AND \'" + fin + "\'";',
      '  q = \'SELECT segments.date, segments.product_item_id, segments.ad_network_type, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM shopping_performance_view WHERE \' + PLAGE + \' AND metrics.impressions > 0\';',
      '  try { rows = lire(q); } catch (e) { rows = lire(q.replace(\', segments.ad_network_type\', \'\')); }',
      '  rows.forEach(function (r) {',
      '    v.push([r.segments.date, String(r.segments.productItemId || \'\').toUpperCase(), r.segments.adNetworkType || \'\', r.campaign.name,',
      '      n(r.metrics.impressions), n(r.metrics.clicks), n(r.metrics.costMicros) / 1e6, n(r.metrics.conversions), n(r.metrics.conversionsValue)]);',
      '  });',
      '  q = \'SELECT segments.date, campaign.name, campaign.advertising_channel_type, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE \' + PLAGE + \' AND metrics.impressions > 0\';',
      '  lire(q).forEach(function (r) {',
      '    c.push([r.segments.date, r.campaign.name, r.campaign.advertisingChannelType || \'\', n(r.metrics.impressions), n(r.metrics.clicks), n(r.metrics.costMicros) / 1e6, n(r.metrics.conversions), n(r.metrics.conversionsValue)]);',
      '  });',
      '  ecrire(ss, \'Vehicules\', [\'date\', \'item_id\', \'reseau\', \'campagne\', \'impressions\', \'clics\', \'cout\', \'conversions\', \'valeur\'], v);',
      '  ecrire(ss, \'Campagnes\', [\'date\', \'campagne\', \'type\', \'impressions\', \'clics\', \'cout\', \'conversions\', \'valeur\'], c);',
      '  var info = ss.getSheetByName(\'Info\') || ss.insertSheet(\'Info\');',
      '  info.clearContents();',
      '  info.getRange(1, 1, 4, 2).setNumberFormat(\'@\');',
      '  info.getRange(1, 1, 4, 2).setValues([[\'maj\', new Date().toISOString()], [\'compte\', compte.getCustomerId()], [\'devise\', compte.getCurrencyCode()], [\'periode\', debut + \' au \' + fin]]);',
      '  Logger.log(v.length + \' lignes par véhicule, \' + c.length + \' lignes par campagne (\' + debut + \' au \' + fin + \').\');',
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

  function Vue(conteneur, ctx) {
    css();
    var self = this;
    this.conteneur = conteneur; this.detruit = false;
    this.cie = (AMX.compagnieChoisie && AMX.compagnieChoisie('inventaire')) || 'BMW';
    this.periode = AMX.memo.lire('ann_periode', '') || '30';
    if (!PERIODES.some(function (p) { return p[0] === self.periode; })) this.periode = '30';
    this.genre = AMX.memo.lire('ann_genre', '') || '';
    this.onglet = (ctx && ctx.params && ctx.params.voir) || AMX.memo.lire('ann_onglet', '') || 'resume';   // ?voir= (le paramètre « vue » est réservé par la tuile)
    if (!ONGLETS.some(function (o) { return o[0] === self.onglet; })) this.onglet = 'resume';
    this.ongletDemande = !!(ctx && ctx.params && ctx.params.voir === 'branchement');   // le mémo seul ne rouvre pas le branchement
    this.graphe = AMX.memo.lire('ann_graphe', '') || 'clics';
    if (!GRAPHES.some(function (g) { return g[0] === self.graphe; })) this.graphe = 'clics';
    this.tri = 'cout'; this.sens = -1; this.filtreV = ''; this.q = ''; this.nV = 100;
    AMX.vider(conteneur);
    this.btnRafraichir = h('button.btn', { type: 'button', text: 'Rafraîchir', title: 'Relire les résultats de Google Ads, puis l\'analyse', onclick: function () { self.rafraichir(); } });
    this.btnExporter = h('button.btn', { type: 'button', text: 'Exporter Excel', onclick: function () { self.exporter(); } });
    this.btnBranchement = h('button.btn', { type: 'button', text: 'Branchement Google Ads', onclick: function () { self.ouvrirBranchement(); } });
    this.btnAds = h('button.btn', { type: 'button', text: 'Ouvrir Google Ads', onclick: function () { window.open(URL_ADS, '_blank', 'noopener'); } });
    this.btnFeuille = h('button.btn', { type: 'button', text: 'Ouvrir la feuille des résultats', onclick: function () { var fe = ((self.rep || {}).ads || {}).feuille; if (fe && fe.url) window.open(fe.url, '_blank', 'noopener'); } });
    this.btnBranchement.hidden = true; this.btnFeuille.hidden = true;
    this.elSous = h('p');
    conteneur.appendChild(h('div.entete-page', [
      h('div', [h('h1', 'Analyse des annonces'), this.elSous]),
      h('div.actions', AMX.actionsEntete([this.btnRafraichir, this.btnExporter, this.btnAds, this.btnFeuille, this.btnBranchement], [this.btnRafraichir]))
    ]));
    this.elCies = h('div.barre-cies'); conteneur.appendChild(this.elCies);
    this.elCorps = h('div.ana-page'); conteneur.appendChild(this.elCorps);
    this.surCie = function (e) { self.cie = (e.detail && e.detail.compagnie) || 'BMW'; self.rep = null; self.charger(false); };
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
  /* « Rafraîchir » : relit d'abord la feuille du script Google Ads (sans message quand tout va bien), puis l'analyse. */
  Vue.prototype.rafraichir = function () {
    var self = this, a = ((this.rep || {}).ads) || {};
    if (this.lecture) return; this.lecture = true;
    this.btnRafraichir.disabled = true; this.btnRafraichir.textContent = 'Lecture…';
    var p = a.branche ? AMX.post({ action: 'annoncesResultats', op: 'lire', compagnie: this.cie || 'BMW' }, { secours: false, delai: 120000 }).catch(function (e) { return { ok: false, erreur: AMX.erreurTexte(e) }; }) : Promise.resolve(null);
    return p.then(function (r) {
      if (r && (r.refuse || r.ok === false) && r.erreur) AMX.toast('Google Ads : ' + r.erreur, 'erreur', 8000);
      return self.charger(true);
    }).then(function () {
      self.lecture = false; self.btnRafraichir.disabled = false; self.btnRafraichir.textContent = 'Rafraîchir';
      if (!self.detruit) AMX.toast('Analyse à jour.', 'ok', 3000);
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
    (d.ventes || []).forEach(function (v) { if (v.vin) g[v.vin] = genreVente(v); });
    (f.lignes || []).forEach(function (l) { var vin = l.google && l.google.vin; if (vin) g[vin] = l.genre; });
    return g;
  };
  Vue.prototype.garde = function (genre) { return !this.genre || genre === this.genre; };
  Vue.prototype.donneesAds = function () { var a = (this.rep || {}).ads || {}, p = (this.rep || {}).periode || {}; return !!(a.joursAvecDonnees && a.dernierJour >= p.du); };
  Vue.prototype.aller = function (onglet, opts) {
    this.onglet = onglet; AMX.memo.ecrire('ann_onglet', onglet);
    if (onglet !== 'branchement') this.ongletDemande = false;
    if (opts) { if (opts.filtre !== undefined) this.filtreV = opts.filtre; if (opts.q !== undefined) this.q = opts.q; this.nV = 100; }
    this.rendre();
    try { this.elOnglets.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
  };
  Vue.prototype.ouvrirBranchement = function () { this.ongletDemande = true; this.aller('branchement'); };

  Vue.prototype.rendre = function () {
    var self = this, d = this.rep || {}, a = d.ads || {}, p = d.periode || {};
    this.elSous.textContent = (d.nom || this.cie) + ' · ' + (p.du === p.au ? fmtJour(p.du) : 'du ' + fmtJour(p.du) + ' au ' + fmtJour(p.au));
    this.btnBranchement.hidden = !a.branche;
    this.btnFeuille.hidden = !(a.feuille && a.feuille.url);
    if (this.onglet === 'branchement' && a.branche && !this.ongletDemande) this.onglet = 'resume';
    if (AMX.barreConcessions) AMX.barreConcessions(this.elCies, { domaine: 'inventaire', valeur: this.cie, onchange: function (c) { if (AMX.choisirCompagnie) AMX.choisirCompagnie(c); self.cie = c || 'BMW'; self.rep = null; self.charger(false); } });
    AMX.vider(this.elCorps);
    /* 1. les filtres */
    var selP = h('select.saisie', { 'aria-label': 'Période', onchange: function () { self.periode = selP.value; AMX.memo.ecrire('ann_periode', self.periode); self.rep = null; self.charger(false); } },
      PERIODES.map(function (x) { return h('option', { value: x[0], text: x[1], selected: x[0] === self.periode }); }));
    var seg = h('div.segment', GENRES.map(function (x) {
      return h('button' + (self.genre === x[0] ? '.actif' : ''), { type: 'button', 'aria-pressed': self.genre === x[0] ? 'true' : 'false', text: x[1], onclick: function () { self.genre = x[0]; AMX.memo.ecrire('ann_genre', x[0]); self.rendre(); } });
    }));
    this.elCorps.appendChild(h('div.ana-filtres', [selP, seg]));
    /* 2. l'état de Google Ads, 3. les chiffres */
    this.elCorps.appendChild(this.zoneStatut());
    this.elCorps.appendChild(this.zoneKpis());
    /* 4. les onglets */
    var nVeh = this.lignesVehicules().filter(function (x) { return x.etat !== 'exclu' || x.s.impressions; }).length, nVen = this.statsVentes().L.length;
    this.elOnglets = h('div.ana-onglets', { role: 'tablist' }, ONGLETS.filter(function (o) { return o[0] !== 'branchement' || !a.branche || self.onglet === 'branchement'; }).map(function (o) {
      var n = o[0] === 'vehicules' ? nVeh : (o[0] === 'ventes' ? nVen : null);
      return h('button' + (self.onglet === o[0] ? '.actif' : ''), { type: 'button', role: 'tab', 'aria-selected': self.onglet === o[0] ? 'true' : 'false', onclick: function () { self.aller(o[0]); } },
        [document.createTextNode(o[1]), n !== null ? h('span.n', { text: nb(n) }) : null]);
    }));
    this.elCorps.appendChild(this.elOnglets);
    if (this.onglet === 'vehicules') this.ongletVehicules();
    else if (this.onglet === 'ventes') this.ongletVentes();
    else if (this.onglet === 'branchement') {
      if (a.branche) this.elCorps.appendChild(h('button.ana-retour', { type: 'button', text: '‹ Retour au Résumé', onclick: function () { self.aller('resume'); } }));
      this.ongletBranchement();
    }
    else this.ongletResume();
  };

  /* ---- la ligne d'état : elle dit pourquoi un chiffre est à 0 ---- */
  Vue.prototype.zoneStatut = function () {
    var self = this, d = this.rep || {}, a = d.ads || {}, cls, txt, actions = [];
    if (!a.branche) {
      cls = 'ambre'; txt = [h('b', 'Les résultats de Google Ads ne sont pas encore branchés.'), document.createTextNode(' Les chiffres de Google Ads resteront à 0 tant qu\'ils ne le sont pas.')];
      actions.push(h('button.btn.primaire', { type: 'button', text: 'Brancher Google Ads', onclick: function () { self.ouvrirBranchement(); } }));
    } else if (!a.joursAvecDonnees) {
      cls = 'ambre';
      txt = a.majAds
        ? [h('b', 'Google n\'a encore montré aucune annonce.'), document.createTextNode(' 0 impression, 0 clic, 0 $ dépensé. '), h('span.doux', { text: 'Dernière vérification du script Google Ads : ' + quand(a.majAds) + '.' })]
        : [h('b', 'Le script Google Ads n\'a pas encore écrit ses résultats.'), document.createTextNode(' Il passe toutes les heures.')];
      actions.push(h('button.btn', { type: 'button', text: 'Ouvrir Google Ads', onclick: function () { window.open(URL_ADS, '_blank', 'noopener'); } }));
    } else if (!this.donneesAds()) {
      cls = 'bleu'; txt = [h('b', 'Aucun résultat dans cette période.'), document.createTextNode(' Les résultats de Google Ads vont du ' + fmtJour(a.premierJour) + ' au ' + fmtJour(a.dernierJour) + '.')];
    } else {
      cls = 'vert'; txt = [h('b', 'Résultats de Google Ads à jour'), document.createTextNode(' au ' + quand(a.majAds || a.luLe) + '. '), h('span.doux', { text: 'Google peut prendre jusqu\'à 3 heures pour compter un clic.' })];
    }
    if (a.branche) actions.push(h('button.btn', { type: 'button', text: 'Rafraîchir', onclick: function () { self.rafraichir(); } }));
    return h('div.ana-statut.' + cls, [h('span.rond'), h('div.t', txt)].concat(actions));
  };

  /* ---- les chiffres ---- */
  Vue.prototype.totauxGenre = function () {
    var self = this, d = this.rep || {};
    if (!this.genre) return { t: d.totaux || vide(), pr: this.periode === 'tout' ? null : (d.precedent || null) };
    var g = this.genres(), t = vide();
    Object.keys(d.vehicules || {}).forEach(function (vin) { if ((g[vin] || '') === self.genre) ajoute(t, d.vehicules[vin]); });
    return { t: t, pr: null };
  };
  function kpi(valeur, libelle, o) {
    o = o || {};
    var cls = (o.zero ? '.zero' : '') + (o.classe ? '.' + o.classe : '');
    var bas = o.v ? h('span.var' + (o.v.c ? '.' + o.v.c : ''), { text: o.v.t }) : (o.note ? h('span.note', { text: o.note }) : null);
    return h((o.onclick ? 'button' : 'div') + '.ana-k' + cls, o.onclick ? { type: 'button', onclick: o.onclick, title: o.title || '' } : { title: o.title || '' },
      [h('span.lib', { text: libelle }), h('b', { text: valeur }), bas]);
  }
  Vue.prototype.zoneKpis = function () {
    var self = this, d = this.rep || {}, x = this.totauxGenre(), t = x.t, pr = x.pr, z = h('section.ana-kpi-zone');
    var r = ratios(t), rp = pr ? ratios(pr) : {};
    var v = function (cle, sens) { return pr ? variation(t[cle], pr[cle], sens) : null; };
    var vr = function (cle, sens) { return pr ? variation(r[cle], rp[cle], sens) : null; };
    var perTxt = this.periode === 'tout' ? '' : 'comparé à la période d\'avant de même durée';
    z.appendChild(h('div.ana-kgroupe', [h('h2', [document.createTextNode('Google Ads'), h('small', { text: (this.genre ? (NOM_GENRE[this.genre] || '') + 's seulement · ' : '') + (nomPeriode(this.periode) || '').toLowerCase() + (perTxt ? ' · ' + perTxt : '') })]),
      h('div.ana-kpis', [
        kpi(nb(t.impressions), 'Impressions', { zero: !t.impressions, v: v('impressions', 1), note: 'fois qu\'une annonce a été vue', title: 'Nombre de fois qu\'une annonce a été montrée' }),
        kpi(nb(t.clics), 'Clics', { zero: !t.clics, v: v('clics', 1), note: 'vers la fiche du véhicule' }),
        kpi(r.ctr === null ? '—' : pctVal(r.ctr, 2), 'Taux de clic', { zero: r.ctr === null, v: vr('ctr', 1), note: 'clics ÷ impressions' }),
        kpi(argentFin(t.cout), 'Dépense', { zero: !t.cout, v: v('cout', 0), note: 'facturée par Google' }),
        kpi(r.cpc === null ? '—' : argent(r.cpc, 2), 'Coût par clic', { zero: r.cpc === null, v: vr('cpc', -1), note: 'dépense ÷ clics' }),
        kpi(dec1(t.conversions), 'Conversions', { zero: !t.conversions, v: v('conversions', 1), note: 'appels, formulaires, itinéraires' }),
        kpi(r.cpa === null ? '—' : argentFin(r.cpa), 'Coût par conversion', { zero: r.cpa === null, v: vr('cpa', -1), note: 'dépense ÷ conversions' }),
        kpi(t.valeur ? argentFin(t.valeur) : '—', 'Valeur des conversions', { zero: !t.valeur, v: t.valeur ? v('valeur', 1) : null, note: 'valeur inscrite dans Google Ads' })
      ])]));
    if (this.genre && this.donneesAds()) z.appendChild(h('p.ana-note', { text: 'Somme des véhicules ' + (NOM_GENRE[this.genre] || '').toLowerCase() + 's seulement : la dépense rattachée à aucun véhicule n\'est pas comptée.' }));
    else if (!this.genre && d.sourceTotaux === 'campagnes' && d.totauxVehicules && t.cout > 0) {
      var hors = Math.max(0, t.cout - d.totauxVehicules.cout);
      if (hors > 0.5 && hors / t.cout > 0.15) z.appendChild(h('div.ana-carte.ambre', { text: argent(hors) + ' (' + pct(hors, t.cout) + ' de la dépense) ne va à aucun véhicule : annonces de Performance Max hors du flux (YouTube, Display, texte). À surveiller.' }));
    }
    /* ventes et publicité */
    var s = this.statsVentes(), ads = this.donneesAds(), allerV = function () { self.aller('ventes'); };
    var tiles = [
      kpi(nb(s.L.length), 'Ventes de la période', { zero: !s.L.length, note: s.L.length ? nb(s.neufs) + ' neuf' + (s.neufs > 1 ? 's' : '') + ' · ' + nb(s.occasions) + ' occasion' + (s.occasions > 1 ? 's' : '') : 'au Livre des ventes', onclick: allerV }),
      kpi(nb(s.inf.length), 'Vendues après un clic', { zero: !s.inf.length, classe: s.inf.length ? 'vert' : '', note: s.L.length - s.sansNiv.length ? pct(s.inf.length, s.L.length - s.sansNiv.length) + ' des ventes avec un NIV' : 'clic payé avant la date de vente', onclick: allerV }),
      kpi(s.inf.length && s.depense ? argentFin(s.depense / s.inf.length) : '—', 'Dépense par vente', { zero: !(s.inf.length && s.depense), note: 'dépense ÷ ventes après un clic', onclick: allerV })
    ];
    if (d.montants) tiles.push(kpi(s.depense > 0 && s.nProfit ? dec1(s.profitInf / s.depense) + ' ×' : '—', 'Profit ÷ dépense', { zero: !(s.depense > 0 && s.nProfit), classe: s.depense > 0 && s.nProfit ? (s.profitInf / s.depense >= 1 ? 'vert' : 'rouge') : '', note: s.nProfit ? argentCourt(s.profitInf) + ' de profit brut sur ces ventes' : 'profit brut des ventes après un clic', onclick: allerV }));
    else tiles.push(kpi(s.jA !== null ? Math.round(s.jA) + ' j' : (s.jT !== null ? Math.round(s.jT) + ' j' : '—'), 'Jours à la vente', { zero: s.jA === null && s.jT === null, note: s.jA !== null ? 'médiane, vendues après un clic' : 'médiane de la période', onclick: allerV }));
    z.appendChild(h('div.ana-kgroupe', [h('h2', [document.createTextNode('Ventes et publicité'), h('small', { text: ads ? 'les ventes du Livre des ventes et la publicité reçue avant la vente' : 'les ventes du Livre des ventes ; la publicité s\'ajoutera avec les premiers clics' })]), h('div.ana-kpis', tiles)]));
    return z;
  };

  /* ---- les ventes de la période, pour les chiffres et l'onglet Ventes ---- */
  Vue.prototype.statsVentes = function () {
    var self = this, d = this.rep || {}, ads = this.donneesAds();
    var L = (d.ventes || []).filter(function (v) { return self.garde(genreVente(v)); });
    var inf = L.filter(function (v) { return v.influence; }), sansNiv = L.filter(function (v) { return !v.vin; }), sansClic = L.filter(function (v) { return v.vin && !v.influence; });
    var profitInf = 0, nProfit = 0; inf.forEach(function (v) { if (typeof v.profit === 'number') { profitInf += v.profit; nProfit++; } });
    return { L: L, inf: inf, sansNiv: sansNiv, sansClic: sansClic, depense: ads ? (this.totauxGenre().t.cout || 0) : 0, profitInf: profitInf, nProfit: nProfit,
      neufs: L.filter(function (v) { return v.type !== 'usage'; }).length, occasions: L.filter(function (v) { return v.type === 'usage'; }).length,
      jA: mediane(inf.map(function (v) { return v.joursVente; })), jN: mediane(sansClic.map(function (v) { return v.joursVente; })), jT: mediane(L.map(function (v) { return v.joursVente; })) };
  };

  function tuile(valeur, libelle, classe, note, onclick) {
    return h((onclick ? 'button' : 'div') + '.ana-tuile' + (classe ? '.' + classe : ''), onclick ? { type: 'button', onclick: onclick } : {}, [
      h('b', { text: typeof valeur === 'number' ? nb(valeur) : String(valeur) }), h('span', { text: libelle }), note ? h('em', { text: note }) : null]);
  }

  /* =============================== Résumé =============================== */
  Vue.prototype.ongletResume = function () {
    var c = this.elCorps;
    c.appendChild(this.carteEinstein());
    c.appendChild(this.zoneSemaines());
    c.appendChild(this.zoneFlux());
    c.appendChild(this.zoneAge());
    c.appendChild(this.zoneSurveiller());
    var t = this.genre ? null : this.tablesCampagnes();
    if (t) c.appendChild(h('section.ana-zone', [h('details', [h('summary', { text: 'Par campagne et par réseau' }), t])]));
  };

  /* ---- Einstein ---- */
  Vue.prototype.carteEinstein = function () {
    var self = this, d = this.rep || {}, e = d.einstein, el = h('section.ana-ein');
    var av = AMX.maxai && AMX.maxai.avatar ? AMX.maxai.avatar(48, { bouton: false }) : null;
    var occupe = !!this.einsteinEnCours;
    var btn = h('button.btn.primaire.gros', { type: 'button', disabled: occupe, text: occupe ? 'Einstein lit les résultats…' : (e ? 'Refaire l\'analyse' : 'Demander à Einstein'), onclick: function () { self.demanderEinstein(); } });
    var p = d.periode || {};
    var quandTxt = e ? 'Analysé le ' + quand(e.le) + ' · période du ' + fmtJour(e.du) + ' au ' + fmtJour(e.au) + ((e.du !== p.du || e.au !== p.au) ? ' (pas la période affichée)' : '') : 'Il lit les résultats et vous dit quoi faire.';
    el.appendChild(h('div.tete', [av, h('div.t', [h('h2', 'Einstein — quoi faire'), h('div.quand', { text: quandTxt })]), btn]));
    if (occupe) { el.appendChild(AMX.chargeur('Einstein lit les résultats', { compact: true })); return el; }
    if (!e) {
      el.appendChild(h('p.vide-ein', { text: 'Quels véhicules mettre de l\'avant, où l\'argent ne rapporte pas, ce qui a changé depuis la semaine passée : un clic, et Einstein répond en quelques phrases. Il ne reçoit que des chiffres et des véhicules, jamais un client.' }));
      return el;
    }
    el.appendChild(h('p.resume', { text: e.resume }));
    var refs = this.indexRefs();
    if (e.actions && e.actions.length) {
      el.appendChild(h('div.actions', e.actions.map(function (a, i) {
        var g = GESTES[a.geste];
        return h('div.act', [h('div.no', { text: String(i + 1) }), h('div', [h('b', { text: a.titre }), h('p', { text: a.pourquoi }),
          a.vehicules && a.vehicules.length ? h('div.vh', a.vehicules.map(function (r) {
            var x = refs[r];
            return h('button', { type: 'button', title: 'Voir ce véhicule', text: x ? (x.vehicule ? x.vehicule.replace(/^\d{4}\s+/, '').slice(0, 34) + ' · ' : '') + r : r, onclick: function () { self.aller('vehicules', { filtre: '', q: r }); } });
          })) : null,
          g ? h('div.faire', [h('a.btn', { href: g.href, target: g.dehors ? '_blank' : null, rel: g.dehors ? 'noopener' : null, text: g.texte })]) : null])]);
      })));
    }
    if (e.alertes && e.alertes.length) el.appendChild(h('div.alertes', [h('b', 'À vérifier'), h('ul', e.alertes.map(function (t) { return h('li', { text: t }); }))]));
    return el;
  };
  Vue.prototype.indexRefs = function () {
    var out = {};
    this.lignesVehicules(true).forEach(function (x) { out[refDe(x)] = x; if (x.vin) out[x.vin.slice(-8)] = out[x.vin.slice(-8)] || x; });
    return out;
  };
  Vue.prototype.demanderEinstein = function () {
    var self = this, p = periodeDates(this.periode), cie = this.cie || 'BMW';
    this.einsteinEnCours = true; this.rendre();
    AMX.post({ action: 'annoncesResultats', op: 'einstein', compagnie: cie, du: p.du, au: p.au }, { secours: false, delai: 150000 }).then(function (r) {
      if (!r || r.refuse || r.ok === false) throw new Error((r && r.erreur) || 'Refusé');
      if (!r.einstein) throw new Error(SCRIPT_PAS_A_JOUR);
      if (self.rep && cie === (self.cie || 'BMW')) self.rep.einstein = r.einstein;
      Object.keys(cache).forEach(function (k) { if (k.indexOf(cie + '|') === 0) cache[k].rep.einstein = r.einstein; });
    }).catch(function (e) { AMX.toast('Einstein : ' + AMX.erreurTexte(e), 'erreur', 10000); }).then(function () {
      self.einsteinEnCours = false; if (!self.detruit) self.rendre();
    });
  };

  /* ---- 13 semaines, en barres (une seule mesure à la fois) ---- */
  Vue.prototype.zoneSemaines = function () {
    var self = this, d = this.rep || {}, z = h('section.ana-zone');
    var seg = h('div.segment.seg', GRAPHES.map(function (g) {
      return h('button' + (self.graphe === g[0] ? '.actif' : ''), { type: 'button', 'aria-pressed': self.graphe === g[0] ? 'true' : 'false', text: g[1], onclick: function () { self.graphe = g[0]; AMX.memo.ecrire('ann_graphe', g[0]); self.rendre(); } });
    }));
    z.appendChild(h('h2', [document.createTextNode('Semaine par semaine'), seg]));
    var S = d.semaines || [], cle = this.graphe, max = 0;
    S.forEach(function (s) { max = Math.max(max, s[cle] || 0); });
    if (!max) { z.appendChild(h('div.ana-vide', { text: 'Les barres paraîtront avec les premiers résultats de Google Ads.' })); return z; }
    var fmt = cle === 'cout' ? argentCourt : (cle === 'conversions' ? dec1 : nbCourt);
    z.appendChild(h('div.ana-carte', [
      h('div.ana-cols', S.map(function (s, i) {
        var v = s[cle] || 0, haut = Math.max(v ? 2 : 0, Math.round(100 * v / max));
        return h('div.c' + (i === S.length - 1 ? '.der' : ''), { title: 'Semaine du ' + fmtJour(s.du) + ' : ' + fmt(v) }, [h('div.v', { text: v ? fmt(v) : '' }), h('div.b', { style: { height: haut + '%' } })]);
      })),
      h('div.ana-dates', S.map(function (s, i) { return h('span', { text: i % 2 === 0 || i === S.length - 1 ? fmtJour(s.du) : '' }); }))
    ]));
    return z;
  };

  /* ---- le flux envoyé à Google ---- */
  Vue.prototype.zoneFlux = function () {
    var self = this, f = this.flux || {}, z = h('section.ana-zone');
    z.appendChild(h('h2', 'Le flux envoyé à Google'));
    if (f.erreurFlux) { z.appendChild(h('div.ana-vide', { text: f.erreurFlux })); return z; }
    if (!f.lignes || f.jamaisLu) { z.appendChild(h('div.ana-vide', { text: 'Le site de la concession n\'a pas encore été lu (Marketing › Annonces Google).' })); return z; }
    var L = f.lignes.filter(function (l) { return self.garde(l.genre); }), n = { pret: 0, completer: 0, exclu: 0 }, ved = 0;
    L.forEach(function (l) { n[l.etat] = (n[l.etat] || 0) + 1; if (l.vedette && l.etat !== 'exclu') ved++; });
    var absents = (f.absents || []).filter(function (s) { return self.garde(s.quoi); }).length;
    var fraiche = f.feuille && f.feuille.le && (Date.now() - Date.parse(f.feuille.le)) / 3600e3 < 30;
    z.appendChild(h('div.ana-tuiles', [
      tuile(ved, 'Annoncés (mis de l\'avant)', 'violet', 'sur ' + nb((n.pret || 0) + (n.completer || 0)) + ' prêts pour Google', function () { self.aller('vehicules', { filtre: 'vedette', q: '' }); }),
      tuile((n.exclu || 0), 'Exclus du flux', n.exclu ? 'rouge' : 'vert', n.exclu ? 'voir pourquoi' : 'aucun', n.exclu ? function () { self.aller('vehicules', { filtre: 'exclu', q: '' }); } : null),
      tuile(absents, 'En stock, absents du site', absents ? 'ambre' : 'vert', absents ? 'Google ne peut pas les annoncer' : 'aucun'),
      tuile(f.feuille && f.feuille.le ? quand(f.feuille.le) : '—', 'Flux envoyé à Google', fraiche ? 'vert' : 'rouge', 'dernière écriture de la feuille')
    ]));
    return z;
  };

  /* ---- les clics par âge en stock ---- */
  Vue.prototype.zoneAge = function () {
    var self = this, d = this.rep || {}, f = this.flux || {}, z = h('section.ana-zone'), ads = this.donneesAds();
    z.appendChild(h('h2', 'Les clics vont-ils aux bons véhicules ?'));
    var L = (f.lignes || []).filter(function (l) { return l.etat !== 'exclu' && self.garde(l.genre) && (l.vedette || !ads); });
    if (!L.length) L = (f.lignes || []).filter(function (l) { return l.etat !== 'exclu' && self.garde(l.genre); });
    if (!L.length) { z.appendChild(h('div.ana-vide', { text: 'Aucun véhicule annoncé ici.' })); return z; }
    var V = d.vehicules || {}, rangs = TRANCHES.map(function (t) { return { nom: t[1], n: 0, s: vide() }; }), tot = vide();
    L.forEach(function (l) { var i = tranche(l.jours); if (i === null) return; var st = V[(l.google && l.google.vin) || ''] || null; rangs[i].n++; ajoute(rangs[i].s, st); ajoute(tot, st); });
    var nTot = rangs.reduce(function (s, r) { return s + r.n; }, 0);
    z.appendChild(h('div.ana-legende', [h('span', [h('i', { style: { background: '#8A94A3' } }), document.createTextNode('Part des véhicules annoncés')]), ads ? h('span', [h('i', { style: { background: 'var(--vert)' } }), document.createTextNode('Part des clics')]) : null]));
    z.appendChild(h('div.ana-carte', [h('div.ana-age', rangs.filter(function (r) { return r.n; }).map(function (r) {
      var ps = nTot ? r.n / nTot : 0, pc = tot.clics ? r.s.clics / tot.clics : 0;
      return h('div.r', [h('b', { text: r.nom }), h('div.barres', [
        h('div.l', [h('div.p.stock', [h('i', { style: { width: Math.round(ps * 100) + '%' } })]), h('span', { text: pct(r.n, nTot) + ' · ' + r.n + ' véh.' })]),
        ads ? h('div.l', [h('div.p.clics', [h('i', { style: { width: Math.round(pc * 100) + '%' } })]), h('span', { text: pct(r.s.clics, tot.clics) + ' · ' + nb(r.s.clics) + ' clics' })]) : null])]);
    }))]));
    if (!ads) z.appendChild(h('p.ana-note', { text: 'Les clics paraîtront ici avec les résultats de Google Ads : les véhicules les plus vieux devraient recevoir leur part.' }));
    return z;
  };

  /* ---- à surveiller : chaque tuile ouvre la liste filtrée ---- */
  Vue.prototype.zoneSurveiller = function () {
    var self = this, z = h('section.ana-zone'), ads = this.donneesAds();
    var L = this.lignesVehicules(), cpt = {};
    FILTRES_V.forEach(function (fv) { cpt[fv[0]] = L.filter(function (x) { return self.passe(x, fv[0]); }).length; });
    var t = [];
    if (ads) {
      t.push(tuile(cpt.sous, 'Sous-exposés', cpt.sous ? 'ambre' : 'vert', 'annoncés, 15 j et +, aucun clic', function () { self.aller('vehicules', { filtre: 'sous', q: '' }); }));
      t.push(tuile(cpt.sansConv, 'Dépense sans conversion', cpt.sansConv ? 'rouge' : 'vert', 'dans la période', function () { self.aller('vehicules', { filtre: 'sansConv', q: '' }); }));
    }
    t.push(tuile(cpt.propose, 'Proposés à mettre de l\'avant', cpt.propose ? 'violet' : '', 'vieux stock, démos, assez de photos', function () { self.aller('vehicules', { filtre: 'propose', q: '' }); }));
    t.push(tuile(cpt.photos, 'Moins de 10 photos', cpt.photos ? 'ambre' : 'vert', 'une annonce sans photos ne se clique pas', function () { self.aller('vehicules', { filtre: 'photos', q: '' }); }));
    z.appendChild(h('h2', 'À surveiller'));
    z.appendChild(h('div.ana-tuiles', t));
    return z;
  };

  /* =============================== Véhicules =============================== */
  Vue.prototype.lignesVehicules = function (tous) {
    var self = this, d = this.rep || {}, f = this.flux || {}, V = d.vehicules || {}, vie = d.vie || {}, vus = {}, out = [];
    var vendues = {}; (d.ventes || []).forEach(function (v) { if (v.vin) vendues[v.vin] = v; });
    (f.lignes || []).forEach(function (l) {
      var vin = l.google && l.google.vin; if (!vin || vus[vin]) return; vus[vin] = 1;
      out.push({ vin: vin, genre: l.genre, vehicule: l.vehicule, stock: l.stock, photo: l.photo, jours: l.jours, prix: l.prix, nbPhotos: l.nbPhotos, etat: l.etat, problemes: l.problemes || [],
        vedette: l.vedette, suggestion: l.suggestion, url: l.url, s: V[vin] || vide(), vie: vie[vin] || null, vente: vendues[vin] || null, surSite: true });
    });
    var g = this.genres();
    Object.keys(V).forEach(function (vin) {
      if (vus[vin]) return; var ve = vendues[vin];
      out.push({ vin: vin, genre: g[vin] || '', vehicule: ve ? ve.vehicule : '', stock: ve ? ve.stock : '', jours: ve ? ve.joursVente : null, s: V[vin], vie: vie[vin] || null, vente: ve || null, surSite: false, problemes: [] });
    });
    return tous ? out : out.filter(function (x) { return self.garde(x.genre); });
  };
  Vue.prototype.passe = function (x, fl) {
    if (!fl) return true;
    if (fl === 'vedette') return !!x.vedette && x.etat !== 'exclu';
    if (fl === 'propose') return !!x.suggestion && !x.vedette && x.etat !== 'exclu';
    if (fl === 'avecClics') return x.s.clics > 0;
    if (fl === 'sous') return x.surSite && x.vedette && x.etat !== 'exclu' && (x.jours || 0) >= 15 && !x.s.clics;
    if (fl === 'sansConv') return x.s.cout > 0 && !x.s.conversions;
    if (fl === 'photos') return x.surSite && x.etat !== 'exclu' && (x.nbPhotos || 0) < 10;
    if (fl === 'exclu') return x.etat === 'exclu';
    return true;
  };
  function valeurV(x, cle) {
    var s = x.s || vide(), r = ratios(s);
    if (cle === 'ctr' || cle === 'cpc' || cle === 'cpa') return r[cle];
    if (cle === 'age') return x.jours;
    if (cle === 'prix') return x.prix;
    if (cle === 'vehicule') return x.vehicule || x.vin;
    return s[cle] || 0;
  }
  function texteV(cle, val) {
    if (val === null || val === undefined) return '—';
    if (cle === 'ctr') return pctVal(val, 1);
    if (cle === 'cpc') return argent(val, 2);
    if (cle === 'cpa') return argentFin(val);
    if (cle === 'cout') return argentFin(val);
    if (cle === 'conversions') return dec1(val);
    return nb(val);
  }
  /* Sur téléphone, les colonnes de chiffres sont cachées : les trois principaux passent sous le nom du véhicule. */
  function chiffresTel(s) { return nb(s.impressions) + ' impr. · ' + nb(s.clics) + ' clic' + (s.clics > 1 ? 's' : '') + ' · ' + argentFin(s.cout || 0); }
  Vue.prototype.ongletVehicules = function () {
    var self = this, z = h('section.ana-zone'), ads = this.donneesAds();
    var tous = this.lignesVehicules(), fl = this.filtreV || '';
    var q = (this.q || '').trim();
    var cherche = function (x) { return AMX.correspond ? AMX.correspond([x.vehicule, x.stock, x.vin], q) : String([x.vehicule, x.stock, x.vin].join(' ')).toUpperCase().indexOf(q.toUpperCase()) >= 0; };
    var avecQ = q ? tous.filter(cherche) : tous;
    z.appendChild(h('div.ana-pilules', FILTRES_V.map(function (fv) {
      var n = avecQ.filter(function (x) { return self.passe(x, fv[0]); }).length;
      if (fv[0] && !n && fv[0] !== fl) return null;
      if ((fv[0] === 'sous' || fv[0] === 'sansConv' || fv[0] === 'avecClics') && !ads) return null;
      return h('button' + (fl === fv[0] ? '.actif' : ''), { type: 'button', 'aria-pressed': fl === fv[0] ? 'true' : 'false', onclick: function () { self.filtreV = fv[0]; self.nV = 100; self.rendre(); } }, [document.createTextNode(fv[1]), h('b', { text: String(n) })]);
    })));
    var inp = h('input.saisie', { type: 'search', placeholder: 'Chercher : modèle, # stock, NIV', value: q });
    inp.addEventListener('input', AMX.debounce ? AMX.debounce(function () { self.q = inp.value; self.nV = 100; self.rendreGrille(); }, 250) : function () { self.q = inp.value; self.rendreGrille(); });
    z.appendChild(h('div.ana-filtres', [inp]));
    if (!ads) z.appendChild(h('p.ana-note', { text: 'Les chiffres de chaque véhicule (impressions, clics, dépense…) paraîtront ici dès que Google aura montré les annonces.' }));
    else if (!Object.keys((this.rep || {}).vehicules || {}).length) z.appendChild(h('div.ana-carte.ambre', { text: 'Google Ads a donné des résultats par campagne, mais pas encore par véhicule pour cette période. Les totaux du haut sont justes ; le détail par véhicule suivra.' }));
    this.elGrille = h('div'); z.appendChild(this.elGrille);
    this.elCorps.appendChild(z);
    this.rendreGrille();
    if (q) setTimeout(function () { try { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) {} }, 0);
  };
  Vue.prototype.trier = function (cle) {
    if (this.tri === cle) this.sens = -this.sens; else { this.tri = cle; this.sens = cle === 'vehicule' ? 1 : -1; }
    this.rendreGrille();
  };
  Vue.prototype.rendreGrille = function () {
    var self = this, ads = this.donneesAds(), fl = this.filtreV || '', q = (this.q || '').trim();
    var L = this.lignesVehicules().filter(function (x) { return self.passe(x, fl); });
    if (q) L = L.filter(function (x) { return AMX.correspond ? AMX.correspond([x.vehicule, x.stock, x.vin], q) : String([x.vehicule, x.stock, x.vin].join(' ')).toUpperCase().indexOf(q.toUpperCase()) >= 0; });
    var cle = this.tri, sens = this.sens;
    L.sort(function (a, b) {
      var va = valeurV(a, cle), vb = valeurV(b, cle);
      if (cle === 'vehicule') return sens * String(va).localeCompare(String(vb), 'fr');
      var na = va === null || va === undefined, nb2 = vb === null || vb === undefined;
      if (na !== nb2) return na ? 1 : -1;          // les « — » toujours en bas
      return (sens * ((va || 0) - (vb || 0))) || ((b.s.impressions || 0) - (a.s.impressions || 0)) || ((b.jours || 0) - (a.jours || 0));
    });
    var g = this.elGrille; AMX.vider(g);
    if (AMX.porteeChiffres) {
      var pt = h('div'); g.appendChild(pt);
      AMX.porteeChiffres(pt, { n: L.length, unite: ['véhicule', 'véhicules'], contexte: [], filtres: [fl ? FILTRES_V.filter(function (x) { return x[0] === fl; })[0][1] : '', q ? '« ' + q + ' »' : ''].filter(Boolean),
        effacer: function () { self.filtreV = ''; self.q = ''; self.rendre(); } });
    }
    if (!L.length) { g.appendChild(h('div.ana-vide', { text: 'Aucun véhicule ici.' })); return; }
    var th = function (c, titre, num, tel) {
      var actif = self.tri === c;
      return h('th' + (num ? '.n' : '') + (tel ? '.cache-tel' : '') + (actif ? '.trie' : ''), { 'aria-sort': actif ? (self.sens > 0 ? 'ascending' : 'descending') : 'none' },
        [h('button', { type: 'button', title: 'Trier par ' + titre.toLowerCase(), text: titre + (actif ? (self.sens > 0 ? ' ▲' : ' ▼') : ''), onclick: function () { self.trier(c); } })]);
    };
    var tete = h('tr', [th('vehicule', 'Véhicule', false, false), th('age', 'Âge', true, true)].concat(COLS_V.map(function (c) { return th(c[0], c[1], true, c[2]); })));
    var tb = h('tbody'), tot = vide();
    L.forEach(function (x) { ajoute(tot, x.s); });
    L.slice(0, this.nV).forEach(function (x) { tb.appendChild(self.rangeeVehicule(x, ads)); });
    var rt = ratios(tot);
    var pied = h('tr', [h('td', [document.createTextNode('Total · ' + nb(L.length) + ' véhicule' + (L.length > 1 ? 's' : '')), ads ? h('span.tot-tel', { text: chiffresTel(tot) }) : null]), h('td.n.cache-tel')].concat(COLS_V.map(function (c) {
      var val = c[0] === 'ctr' || c[0] === 'cpc' || c[0] === 'cpa' ? rt[c[0]] : tot[c[0]];
      return h('td.n' + (c[2] ? '.cache-tel' : ''), { text: ads ? texteV(c[0], val) : '—' });
    })));
    g.appendChild(h('div.ana-defile', [h('table.ana-table.vt', [h('thead', [tete]), tb, h('tfoot', [pied])])]));
    if (L.length > this.nV) g.appendChild(h('button.btn.ana-plus', { type: 'button', text: 'Afficher ' + Math.min(100, L.length - this.nV) + ' de plus (' + (L.length - this.nV) + ' restants)', onclick: function () { self.nV += 100; self.rendreGrille(); } }));
  };
  Vue.prototype.rangeeVehicule = function (x, ads) {
    var s = x.s, past = [];
    if (x.vedette && x.etat !== 'exclu') past.push(['violet', 'Annoncé']);
    if (x.etat === 'exclu') past.push(['rouge', 'Exclu' + (x.problemes[0] ? ' : ' + String(x.problemes[0]).replace(/ — .*$/, '') : '')]);
    if (!x.surSite) past.push(['gris', x.vente ? 'Vendu le ' + fmtJour(x.vente.dateVente) : 'Plus sur le site']);
    else if (x.vente) past.push(['vert', 'Vendu le ' + fmtJour(x.vente.dateVente)]);
    if (x.suggestion && !x.vedette && x.etat !== 'exclu') past.push(['bleu', 'Proposé']);
    if (ads && x.vedette && x.surSite && x.etat !== 'exclu' && (x.jours || 0) >= 15 && !s.clics) past.push(['ambre', 'Aucun clic']);
    if (s.cout > 0 && !s.conversions) past.push(['ambre', 'Sans conversion']);
    if (x.surSite && (x.nbPhotos || 0) < 10 && x.etat !== 'exclu') past.push(['gris', (x.nbPhotos || 0) + ' photos']);
    var det = [x.stock ? '# ' + x.stock : '', NOM_GENRE[x.genre] || '', x.prix ? argent(x.prix) : ''].filter(Boolean).join(' · ');
    var nom = x.url ? h('a.nom', { href: x.url, target: '_blank', rel: 'noopener', title: 'Voir la fiche sur le site', text: x.vehicule || x.vin }) : h('div.nom', { text: x.vehicule || x.vin });
    var cell = h('div.ana-veh', [h('div.ph', [x.photo ? h('img', { src: x.photo, alt: '', loading: 'lazy' }) : h('span', { text: '—' })]),
      h('div', [nom, h('span.sous', { text: det }), ads ? h('span.tel', { text: chiffresTel(s) }) : null, past.length ? h('div.pas', past.map(function (p) { return h('span.ana-pastille.' + p[0], { text: p[1] }); })) : null])]);
    return h('tr', { 'data-ref': refDe(x) }, [h('td', [cell]), h('td.n.cache-tel', { text: x.jours !== null && x.jours !== undefined ? x.jours + ' j' : '—' })].concat(COLS_V.map(function (c) {
      var val = valeurV(x, c[0]), z = !ads || !val;
      return h('td.n' + (c[2] ? '.cache-tel' : '') + (z ? '.zero' : ''), { text: ads ? texteV(c[0], val) : '—' });
    })));
  };

  /* =============================== Ventes =============================== */
  Vue.prototype.ongletVentes = function () {
    var d = this.rep || {}, z = h('section.ana-zone'), ads = this.donneesAds();
    this.elCorps.appendChild(z);
    if (d.ventesErreur) { z.appendChild(h('div.ana-vide', { text: d.ventesErreur })); return; }
    var s = this.statsVentes(), L = s.L;
    if (!L.length) { z.appendChild(h('div.ana-vide', { text: 'Aucune vente dans la période' + (this.genre ? ' pour ce genre' : '') + '.' })); return; }
    var tu = [tuile(s.jT !== null ? Math.round(s.jT) + ' j' : '—', 'Jours à la vente', '', 'médiane de toutes les ventes')];
    if (ads) {
      tu.push(tuile(s.jA !== null ? Math.round(s.jA) + ' j' : '—', 'Vendues après un clic', 'vert', 'jours à la vente, médiane'));
      tu.push(tuile(s.jN !== null ? Math.round(s.jN) + ' j' : '—', 'Vendues sans clic', '', 'jours à la vente, médiane'));
    }
    if (s.sansNiv.length) tu.push(tuile(s.sansNiv.length, 'Ventes sans NIV au livre', 'ambre', 'on ne peut pas les relier à la publicité'));
    z.appendChild(h('div.ana-tuiles', tu));
    if (ads) z.appendChild(h('p.ana-note', { text: '« Après un clic » : le véhicule a reçu au moins un clic payé avant sa date de vente. C\'est généreux pour la publicité : la vente se serait peut-être faite sans l\'annonce.' }));
    var tb = h('tbody');
    L.slice(0, 300).forEach(function (v) {
      var p = v.pub || {};
      tb.appendChild(h('tr', [h('td', { text: fmtJour(v.dateVente) }),
        h('td', [h('b', { text: v.vehicule || '—' }), h('span.sous', { text: [v.stock ? '# ' + v.stock : '', v.vin ? v.vin.slice(-8) : 'sans NIV', NOM_GENRE[genreVente(v)]].filter(Boolean).join(' · ') })]),
        h('td.n.cache-tel', { text: v.joursVente !== undefined && v.joursVente !== null ? v.joursVente + ' j' : '—' }),
        h('td.n.cache-tel' + (ads && p.impressions ? '' : '.zero'), { text: ads ? nb(p.impressions) : '—' }),
        h('td.n' + (ads && p.clics ? '' : '.zero'), { text: ads ? nb(p.clics) : '—' }),
        h('td.n' + (ads && p.cout ? '' : '.zero'), { text: ads ? argentFin(p.cout || 0) : '—' }),
        h('td.cache-tel', [ads ? h('span.ana-pastille.' + (v.influence ? 'vert' : 'gris'), { text: v.influence ? 'Après un clic' : (v.vin ? 'Sans clic' : 'Sans NIV') }) : null]),
        d.montants ? h('td.n', { text: typeof v.profit === 'number' ? argent(v.profit) + (v.profitSource === 'estime' ? ' (est.)' : '') : '—' }) : null]));
    });
    z.appendChild(h('div.ana-defile', [h('table.ana-table', [h('thead', [h('tr', [h('th', 'Vendue le'), h('th', 'Véhicule'), h('th.n.cache-tel', 'En stock'), h('th.n.cache-tel', 'Impressions avant'), h('th.n', 'Clics avant'), h('th.n', 'Dépense avant'), h('th.cache-tel', ''), d.montants ? h('th.n', 'Profit brut') : null])]), tb])]));
    if (L.length > 300) z.appendChild(h('p.ana-note', { text: 'Les 300 plus récentes sur ' + L.length + '.' }));
  };

  /* =============================== Branchement Google Ads =============================== */
  Vue.prototype.ongletBranchement = function () {
    var self = this, d = this.rep || {}, a = d.ads || {}, fe = a.feuille, z = h('section.ana-zone');
    this.elCorps.appendChild(z);
    if (a.branche) {
      z.appendChild(h('div.ana-carte', [h('h3', 'Google Ads est branché'),
        h('p', { text: (a.joursAvecDonnees ? 'Résultats du ' + fmtJour(a.premierJour) + ' au ' + fmtJour(a.dernierJour) + ' (' + a.joursAvecDonnees + ' jour' + (a.joursAvecDonnees > 1 ? 's' : '') + ').' : 'Pas encore de résultats : Google n\'a montré aucune annonce.') + (a.majAds ? ' Script Google Ads passé le ' + quand(a.majAds) + '.' : '') + (a.luLe ? ' Lu par ScanAutomax le ' + quand(a.luLe) + '.' : '') + (a.devise && a.devise !== 'CAD' ? ' Montants en ' + a.devise + '.' : '') }),
        h('div.rangee', [fe && fe.url ? h('a.btn', { href: fe.url, target: '_blank', rel: 'noopener', text: 'Ouvrir la feuille des résultats' }) : null,
          h('button.btn', { type: 'button', text: 'Relire maintenant', onclick: function () { self.resultats({ op: 'lire' }); } })])]));
    }
    var el = h('div.ana-carte' + (a.branche ? '' : '.bleu'));
    el.appendChild(h('h3', { text: a.branche ? 'Le script Google Ads' : 'Brancher les résultats de Google Ads' }));
    el.appendChild(h('p', { text: 'Un petit script Google Ads écrit toutes les heures les résultats par véhicule dans une feuille que ScanAutomax relit. Il ne change rien dans Google Ads.' }));
    var etapes = h('ol');
    if (!a.branche) {
      etapes.appendChild(h('li', [h('span', { text: 'Créer la feuille des résultats (partagée avec le compte Google qui ouvre Google Ads, sans courriel d\'avis). ' }),
        a.peutBrancher ? h('button.btn.primaire', { type: 'button', text: 'Créer la feuille', onclick: function () { self.brancher(); } }) : h('span', { text: 'La propriétaire ou un administrateur du groupe la crée.' })]));
    } else {
      etapes.appendChild(h('li', [h('span', { text: 'Feuille créée' + (fe && fe.partages && fe.partages.length ? ', partagée avec ' + fe.partages.map(function (x) { return x.courriel; }).join(', ') : '') + '. ' }),
        fe && fe.url ? h('a', { href: fe.url, target: '_blank', rel: 'noopener', text: 'Ouvrir' }) : null]));
    }
    etapes.appendChild(h('li', { text: 'Dans Google Ads (le compte de la concession) : Outils › Actions groupées › Scripts › « + » › Nouveau script. Collez le script, cliquez « Autoriser », puis « Exécuter ».' }));
    etapes.appendChild(h('li', { text: 'Dans la liste des scripts, Fréquence : « Toutes les heures ». « Rafraîchir » dans cette page relit la feuille tout de suite.' }));
    el.appendChild(etapes);
    if (a.branche && fe && fe.url) {
      var txt = scriptAds(fe.url, d.nom);
      el.appendChild(h('div.rangee', [h('button.btn.primaire', { type: 'button', text: 'Copier le script', onclick: function () { AMX.copier(txt, 'Script copié : collez-le dans Google Ads › Scripts.'); } }),
        a.peutBrancher ? h('button.btn', { type: 'button', text: 'Partager la feuille avec un autre compte', onclick: function () { self.brancher(); } }) : null]));
      el.appendChild(h('details', [h('summary', { text: 'Voir le script' }), h('pre', { text: txt })]));
      if (fe.erreur) el.appendChild(h('p', { text: 'Dernière lecture : ' + fe.erreur }));
    }
    z.appendChild(el);
  };
  Vue.prototype.tablesCampagnes = function () {
    var d = this.rep || {};
    var tab = function (titre, liste, nom) {
      if (!liste || !liste.length) return null;
      liste = liste.slice().sort(function (x, y) { return y.cout - x.cout; });
      return h('div', [h('h3', { style: { fontSize: '19px', margin: '6px 0 10px' }, text: titre }), h('div.ana-defile', [h('table.ana-table', [h('thead', [h('tr', [h('th', titre === 'Par réseau' ? 'Réseau' : 'Campagne'), h('th.n', 'Impressions'), h('th.n', 'Clics'), h('th.n', 'Dépense'), h('th.n', 'Conv.')])]),
        h('tbody', liste.map(function (r) { return h('tr', [h('td', { text: nom(r.nom) }), h('td.n', { text: nbCourt(r.impressions) }), h('td.n', { text: nb(r.clics) }), h('td.n', { text: argentCourt(r.cout) }), h('td.n', { text: dec1(r.conversions) })]); }))])])]);
    };
    var r = tab('Par réseau', d.reseaux, function (n) { return RESEAUX[n] || n; }), c = tab('Par campagne', d.campagnes, function (n) { return n; });
    return r || c ? h('div.ana-deux', [r, c]) : null;
  };
  Vue.prototype.brancher = function () {
    var self = this, d = this.rep || {}, a = d.ads || {};
    if (!a.peutBrancher) { AMX.toast('Réservé à la propriétaire ou à un administrateur du groupe.', 'erreur'); return; }
    var inp = h('input.saisie', { type: 'email', value: a.compteDefaut || '', placeholder: 'adresse du compte Google Ads' });
    var titre = a.branche ? 'Partager la feuille des résultats avec un autre compte' : 'Créer la feuille des résultats Google Ads';
    AMX.modale({ titre: titre, corps: h('div', [
      h('p', { text: 'Le compte Google qui ouvre Google Ads doit pouvoir modifier la feuille. Le partage se fait sans courriel d\'avis.' }),
      h('label.champ', [h('span', 'Compte Google de Google Ads'), inp])]),
      boutons: [{ texte: 'Annuler' }, { texte: a.branche ? 'Partager' : 'Créer la feuille', classe: 'primaire', action: function () { return self.resultats({ op: a.branche ? 'partager' : 'creer', courriel: inp.value.trim() }); } }] });
  };

  Vue.prototype.exporter = function () {
    if (typeof XLSX === 'undefined') { AMX.toast('Excel n\'est pas chargé sur cette page.', 'erreur'); return; }
    var d = this.rep || {}, p = d.periode || {}, x = this.totauxGenre(), t = x.t, r = ratios(t), s = this.statsVentes();
    var res = [
      { 'Mesure': 'Impressions', 'Valeur': t.impressions }, { 'Mesure': 'Clics', 'Valeur': t.clics },
      { 'Mesure': 'Taux de clic (%)', 'Valeur': r.ctr === null ? '' : Math.round(r.ctr * 100) / 100 }, { 'Mesure': 'Dépense', 'Valeur': Math.round(t.cout * 100) / 100 },
      { 'Mesure': 'Coût par clic', 'Valeur': r.cpc === null ? '' : Math.round(r.cpc * 100) / 100 }, { 'Mesure': 'Conversions', 'Valeur': t.conversions },
      { 'Mesure': 'Coût par conversion', 'Valeur': r.cpa === null ? '' : Math.round(r.cpa * 100) / 100 }, { 'Mesure': 'Valeur des conversions', 'Valeur': t.valeur },
      { 'Mesure': 'Ventes de la période', 'Valeur': s.L.length }, { 'Mesure': 'Vendues après un clic', 'Valeur': s.inf.length },
      { 'Mesure': 'Dépense par vente après un clic', 'Valeur': s.inf.length && s.depense ? Math.round(s.depense / s.inf.length * 100) / 100 : '' }
    ];
    var veh = this.lignesVehicules().map(function (v) { var rv = ratios(v.s); return { 'NIV': v.vin, '# stock': v.stock || '', 'Véhicule': v.vehicule || '', 'Genre': NOM_GENRE[v.genre] || '', 'Âge (jours)': v.jours === null || v.jours === undefined ? '' : v.jours, 'Prix': v.prix || '', 'Photos': v.nbPhotos || '', 'Mis de l\'avant': v.vedette ? 'oui' : 'non', 'Impressions': v.s.impressions, 'Clics': v.s.clics, 'Taux de clic (%)': rv.ctr === null ? '' : Math.round(rv.ctr * 100) / 100, 'Dépense': Math.round(v.s.cout * 100) / 100, 'Coût par clic': rv.cpc === null ? '' : Math.round(rv.cpc * 100) / 100, 'Conversions': v.s.conversions, 'Coût par conversion': rv.cpa === null ? '' : Math.round(rv.cpa * 100) / 100, 'Sur le site': v.surSite ? 'oui' : 'non', 'Vendu le': v.vente ? v.vente.dateVente : '' }; });
    var ven = (d.ventes || []).map(function (v) { var o = { 'Vendue le': v.dateVente, 'NIV': v.vin, '# stock': v.stock, 'Véhicule': v.vehicule, 'Type': v.type === 'usage' ? 'Occasion' : 'Neuf', 'Jours en stock': v.joursVente === undefined ? '' : v.joursVente, 'Impressions avant la vente': v.pub ? v.pub.impressions : 0, 'Clics avant la vente': v.pub ? v.pub.clics : 0, 'Dépense avant la vente': v.pub ? v.pub.cout : 0, 'Après un clic': v.influence ? 'oui' : 'non' }; if (d.montants) o['Profit brut'] = typeof v.profit === 'number' ? v.profit : ''; return o; });
    var sem = (d.semaines || []).map(function (w) { return { 'Semaine du': w.du, 'Au': w.au, 'Impressions': w.impressions, 'Clics': w.clics, 'Dépense': w.cout, 'Conversions': w.conversions }; });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(res), 'Chiffres');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(veh.length ? veh : [{ '': 'aucun véhicule' }]), 'Véhicules');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ven.length ? ven : [{ '': 'aucune vente' }]), 'Ventes');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sem), 'Semaines');
    var e = d.einstein;
    if (e) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ 'Einstein': e.resume }].concat((e.actions || []).map(function (a, i) { return { 'Einstein': (i + 1) + '. ' + a.titre + ' — ' + a.pourquoi + (a.vehicules.length ? ' (' + a.vehicules.join(', ') + ')' : '') }; }))), 'Einstein');
    XLSX.writeFile(wb, 'analyse-annonces-' + String(d.compagnie || 'BMW').toLowerCase() + '-' + p.du + '-' + p.au + '.xlsx');
  };

  AMX.annoncesAnalyse = { charger: charger, peutVoir: peutVoir, scriptAds: scriptAds, vider: function () { cache = {}; } };
  AMX.section('annoncesanalyse', {
    titre: 'Analyse des annonces', icone: 'resultat', ordre: 37,
    visible: function () { return peutVoir(); },
    monter: function (conteneur, ctx) { return new Vue(conteneur, ctx); }
  });
})();
