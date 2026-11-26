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
    '.ana-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; } .ana-kpis.k5 { grid-template-columns: repeat(5, minmax(0, 1fr)); }',
    '.ana-k { border: 1px solid var(--ligne); background: var(--carte); border-radius: 14px; padding: 14px 16px 15px; text-align: left; font: inherit; color: var(--encre); box-shadow: var(--ombre); min-width: 0; }',
    'button.ana-k { cursor: pointer; } button.ana-k:hover { border-color: var(--vert); }',
    '.ana-k .lib { display: block; font-size: 16px; font-weight: 700; color: var(--encre-2); }',
    '.ana-k b { display: block; font-size: 32px; line-height: 1.15; margin-top: 4px; font-variant-numeric: tabular-nums; letter-spacing: -0.5px; overflow-wrap: anywhere; }',
    '.ana-k .note { display: block; font-size: 15px; color: var(--encre-2); margin-top: 6px; line-height: 1.35; }',
    '.ana-k .var { display: inline-block; font-size: 15px; font-weight: 700; border-radius: 999px; padding: 2px 10px; margin-top: 8px; background: var(--gris-bg); color: var(--encre-2); }',
    '.ana-k .var.hausse { background: var(--vert-clair); color: var(--vert-fonce); } .ana-k .var.baisse { background: var(--rouge-bg); color: var(--rouge); }',
    '.ana-k.zero b { color: var(--encre-3); }',
    /* 15 nov. : la ligne « Marché : … » d'une tuile (repère externe, source dans l'infobulle) */
    '.ana-k .marche, .ana-tuile .marche { display: block; font-size: 15px; color: var(--encre-2); margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--ligne); line-height: 1.4; font-weight: 400; cursor: help; }',
    '.ana-k .marche .ec, .ana-tuile .marche .ec { display: inline-block; font-weight: 700; border-radius: 999px; padding: 0 8px; margin-left: 6px; background: var(--gris-bg); color: var(--encre-2); white-space: nowrap; }',
    '.marche .ec.mieux { background: var(--vert-clair) !important; color: var(--vert-fonce) !important; } .marche .ec.moins { background: var(--rouge-bg) !important; color: var(--rouge) !important; }',
    '.ana-reperes .ana-carte.bleu { line-height: 1.5; } .ana-sous-titre { font-size: 19px; margin: 22px 0 6px; }',
    '.ana-table.rep td { vertical-align: top; } .ana-table.rep td b { font-weight: 700; } .ana-table.rep a { color: var(--vert-fonce); font-weight: 600; }',
    '.ana-autres .rangee { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; } .ana-autres .rangee .ana-note { margin: 0; }',
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
    /* 26 nov. : Einstein pilote (AnnoncesPilote.gs) */
    '.ana-pilote { border: 1px solid var(--ligne); background: var(--carte); border-radius: 14px; padding: 16px 18px; margin: 0 0 26px; }',
    '.ana-pilote .tete { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; } .ana-pilote .tete h2 { font-size: 20px; margin: 0; flex: 1 1 240px; }',
    '.ana-pilote .mode { display: flex; gap: 6px; flex-wrap: wrap; } .ana-pilote .mode button { font-size: 15px; padding: 7px 12px; border-radius: 999px; border: 1px solid var(--ligne); background: var(--fond); cursor: pointer; }',
    '.ana-pilote .mode button.actif { background: var(--encre); color: #fff; border-color: var(--encre); } .ana-pilote .mode button.actif.appliquer { background: var(--vert); border-color: var(--vert); }',
    '.ana-pilote .expl { font-size: 15px; color: var(--encre-2); margin: 8px 0 0; line-height: 1.5; }',
    '.ana-pilote .prop { border: 1px solid var(--ambre-bord); background: var(--ambre-bg); border-radius: 12px; padding: 12px 14px; margin: 12px 0 0; font-size: 16px; }',
    '.ana-pilote .prop.fait { border-color: var(--vert-bord); background: var(--vert-bg); } .ana-pilote .prop.gris { border-color: var(--ligne); background: var(--fond); color: var(--encre-2); }',
    '.ana-pilote .prop b { display: block; margin-bottom: 2px; } .ana-pilote .prop .refs { margin: 4px 0 0; } .ana-pilote .prop .refs button { font-size: 14px; margin: 2px 4px 2px 0; padding: 3px 8px; border-radius: 999px; border: 1px solid var(--ligne); background: var(--carte); cursor: pointer; }',
    '.ana-pilote .prop .quand { font-size: 14px; color: var(--encre-2); margin-top: 4px; } .ana-pilote .prop .boutons { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }',
    '.ana-pilote .prop .refus { font-size: 14px; color: var(--encre-2); margin-top: 4px; }',
    '.ana-pilote details { margin-top: 12px; } .ana-pilote summary { font-size: 16px; cursor: pointer; }',
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
    /* 18 nov. : de Google à la vente, être mieux vu sur Google, détails repliés */
    '.ana-parcours { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 14px; }',
    '.ana-etape { position: relative; border: 1px solid var(--ligne); background: var(--carte); border-radius: 14px; padding: 14px 16px; text-align: left; font: inherit; color: var(--encre); box-shadow: var(--ombre); min-width: 0; }',
    'button.ana-etape { cursor: pointer; } button.ana-etape:hover { border-color: var(--vert); }',
    '.ana-etape .lib { display: block; font-size: 15px; font-weight: 700; color: var(--encre-2); line-height: 1.3; }',
    '.ana-etape b { display: block; font-size: 28px; line-height: 1.15; margin-top: 6px; font-variant-numeric: tabular-nums; }',
    '.ana-etape em { display: block; font-style: normal; font-size: 15px; color: var(--encre-2); margin-top: 4px; line-height: 1.35; }',
    '.ana-etape.zero b { color: var(--encre-3); }',
    '.ana-etape .fl { position: absolute; right: -13px; top: 50%; transform: translateY(-50%); width: 22px; height: 22px; border-radius: 50%; background: var(--carte); border: 1px solid var(--ligne); display: grid; place-items: center; font-style: normal; font-weight: 800; color: var(--encre-3); z-index: 1; font-size: 15px; line-height: 1; }',
    '.ana-point { display: flex; gap: 12px; align-items: center; border: 1px solid var(--ligne); background: var(--carte); border-radius: 14px; padding: 12px 16px; margin: 0 0 10px; }',
    '.ana-point > div { flex: 1 1 auto; min-width: 0; } .ana-point b { font-size: 17px; } .ana-point p { margin: 4px 0 0; font-size: 16px; color: var(--encre-2); line-height: 1.5; }',
    '.ana-point .rond { width: 12px; height: 12px; border-radius: 50%; flex: 0 0 auto; background: var(--gris); align-self: flex-start; margin-top: 6px; }',
    '.ana-ctrl-tete { display: flex; flex-wrap: wrap; gap: 8px 10px; align-items: center; margin: 0 0 12px; } .ana-ctrl-tete > b { font-size: 18px; } .ana-ctrl-tete .esp { flex: 1 1 auto; }',
    '.ana-ctrl .ana-point { margin: 0 0 8px; flex-wrap: nowrap !important; } .ana-ctrl-ok { margin: 10px 0 0; font-size: 15px; color: var(--encre-2); line-height: 1.6; } .ana-ctrl-ok b { color: var(--vert-fonce); }',
    '.ana-point.rouge .rond { background: var(--rouge); } .ana-point.ambre .rond { background: var(--ambre); } .ana-point.bleu .rond { background: var(--bleu); } .ana-point.vert .rond { background: var(--vert); }',
    '.ana-cols.serre { gap: 3px; } .ana-cols.serre .c .b { border-radius: 3px 3px 0 0; }',
    '.ana-replis > details { border: 1px solid var(--ligne); border-radius: 14px; background: var(--carte); padding: 6px 14px; margin: 0 0 10px; }',
    '.ana-replis > details > summary { font-size: 18px; } .ana-replis details .ana-defile { margin: 8px 0 10px; } .ana-replis details .ana-note { margin-top: 8px; }',
    '.ana-table td a { color: var(--vert-fonce); font-weight: 600; text-decoration: none; word-break: break-all; } .ana-table td a:hover { text-decoration: underline; }',
    '@media (max-width: 1100px) { .ana-parcours { grid-template-columns: repeat(3, minmax(0, 1fr)); } .ana-etape .fl { display: none; } }',
    '@media (max-width: 640px) { .ana-parcours { grid-template-columns: 1fr 1fr; gap: 8px; } .ana-etape b { font-size: 24px; } .ana-point { flex-wrap: wrap; } }',
    '.ana-defile:has(> table.vt) { container-type: inline-size; } @container (max-width: 1360px) { table.vt .cache-moyen { display: none; } }',
    '@media (max-width: 1100px) { .ana-kpis, .ana-kpis.k5 { grid-template-columns: repeat(2, minmax(0, 1fr)); } .ana-kpis.k5 > :last-child { grid-column: 1 / -1; } }',
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
  var ONGLETS = [['resume', 'Résumé'], ['site', 'Site web'], ['ficheGoogle', 'Fiche Google'], ['conversions', 'Conversions'], ['vehicules', 'Véhicules'], ['ventes', 'Ventes'], ['branchement', 'Branchement Google Ads']];   /* 18 nov. : + Site web, Fiche Google */
  /* 17 nov. (Maxime : « voir le détail des conversions ») — les types d'action de Google Ads, en mots simples. */
  var GROUPES_CONV = [['appel', 'Appels'], ['demande', 'Demandes du site'], ['autre', 'Autres conversions']];
  var CAT_CONV = { PHONE_CALL_LEAD: ['appel', 'Appel'], REQUEST_QUOTE: ['demande', 'Formulaire du site'], SUBMIT_LEAD_FORM: ['demande', 'Formulaire du site'], CONTACT: ['demande', 'Contact'],
    BOOK_APPOINTMENT: ['demande', 'Rendez-vous'], IMPORTED_LEAD: ['demande', 'Lead importé'], QUALIFIED_LEAD: ['demande', 'Lead qualifié'], CONVERTED_LEAD: ['demande', 'Lead converti'],
    GET_DIRECTIONS: ['autre', 'Itinéraire'], PAGE_VIEW: ['autre', 'Page vue'], OUTBOUND_CLICK: ['autre', 'Clic vers un autre site'], ENGAGEMENT: ['autre', 'Engagement'],
    STORE_VISIT: ['autre', 'Visite en magasin'], STORE_SALE: ['autre', 'Vente en magasin'], SIGNUP: ['autre', 'Inscription'], DOWNLOAD: ['autre', 'Téléchargement'], PURCHASE: ['autre', 'Achat'] };
  var NOMS_ACTION = { 'AI-qualified call leads': 'Appels jugés sérieux par Google', 'Calls from ads': 'Appels venus des annonces', 'Phone call leads': 'Appels', 'Store visits': 'Visites en magasin', 'Local actions - Directions': 'Itinéraires' };
  var REGIONS_TEL = { '819': 'Estrie, Mauricie, Centre-du-Québec', '873': 'Estrie, Mauricie, Centre-du-Québec', '450': 'Montérégie, Laurentides, Lanaudière', '579': 'Montérégie, Laurentides, Lanaudière',
    '354': 'Montérégie, Laurentides, Lanaudière', '514': 'Montréal', '438': 'Montréal', '263': 'Montréal', '418': 'Québec, Est du Québec', '581': 'Québec, Est du Québec', '367': 'Québec, Est du Québec',
    '613': 'Est de l\'Ontario', '343': 'Est de l\'Ontario', '753': 'Est de l\'Ontario', '416': 'Toronto', '647': 'Toronto', '437': 'Toronto', '905': 'Grand Toronto', '289': 'Grand Toronto', '365': 'Grand Toronto',
    '705': 'Nord de l\'Ontario', '249': 'Nord de l\'Ontario', '506': 'Nouveau-Brunswick', '902': 'Maritimes', '782': 'Maritimes' };
  function catConv(c) { return CAT_CONV[c] || ['autre', c ? 'Autre' : 'Autre']; }
  function nomAction(n) { return NOMS_ACTION[n] || n; }
  function duree(s) { s = Math.round(s || 0); if (s < 60) return s + ' s'; var m = Math.floor(s / 60), r = s % 60; return m + ' min' + (r ? ' ' + String(r).padStart(2, '0') + ' s' : ''); }
  function heureAppel(t) { var m = String(t || '').match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/); return m ? fmtJour(m[1]) + ', ' + Number(m[2]) + ' h ' + m[3] : String(t || ''); }
  var FILTRES_V = [['', 'Tous'], ['vedette', 'Mis de l\'avant'], ['propose', 'Proposés'], ['avecClics', 'Avec des clics'], ['gratuits', 'Clics gratuits'], ['sous', 'Sous-exposés'], ['sansConv', 'Dépense sans conversion'], ['photos', 'Moins de 10 photos'], ['sansVue', 'Jamais vus sur le site'], ['refuse', 'Refusés par Google'], ['exclu', 'Exclus du flux']];
  var GRAPHES = [['impressions', 'Impressions'], ['clics', 'Clics'], ['cout', 'Dépense'], ['conversions', 'Conversions']];
  /* colonnes du tableau des véhicules : clé, titre, cachée sur téléphone, cachée quand le tableau manque de place (les ratios restent dans les chiffres du haut) */
  var COLS_V = [['impressions', 'Impressions', false], ['clics', 'Clics', false], ['ctr', 'Taux de clic', true, true], ['cout', 'Dépense', false], ['cpc', 'Coût / clic', true, true], ['conversions', 'Conv.', true], ['cpa', 'Coût / conv.', true, true], ['gratuits', 'Clics gratuits', true], ['vues', 'Vues (site)', true], ['demandesSite', 'Demandes (site)', true]];   /* 18 nov. : vues de la fiche et demandes, Google Analytics */
  var GESTES = {
    mettre_avant: { texte: 'Ouvrir Annonces Google pour les cocher', href: '#/marketing/google' },
    retirer_avant: { texte: 'Ouvrir Annonces Google pour les décocher', href: '#/marketing/google' },
    prix: { texte: 'Voir l\'analyse occasion (prix du marché)', href: '#/inventaire/analyse' },
    budget: { texte: 'Ouvrir Google Ads', href: URL_ADS, dehors: true },
    ficheGoogle: { texte: 'Ouvrir le profil d\'entreprise Google', href: 'https://business.google.com/locations', dehors: true },
    corrigerGoogle: { texte: 'Ouvrir Annonces Google', href: '#/marketing/google' }
  };

  /* ---- Repères du marché (15 nov.) — À UN SEUL ENDROIT : pour les mettre à jour, changer seulement ce tableau.
     Google ne publie AUCUN repère officiel pour les annonces de véhicules : ce sont des garde-fous, jamais des cibles.
     D'où viennent les chiffres : reports/Analyse des annonces de véhicules Google.md (section « Peu de repères fiables »).
       valeur : un chiffre · min / max : une fourchette · neuf / occasion : un chiffre par genre (une démo compte comme un neuf)
       etendue : fourchette montrée à titre d'information (la comparaison se fait sur la valeur)
       devise : 'CAD' | 'USD' (un montant US reste en $ US, avec « ≈ $ CA » au taux du jour de la Banque du Canada)
       sens : 1 = plus haut, c'est mieux · -1 = plus bas, c'est mieux · 0 = mesure différente de la nôtre, pas de jugement */
  var REPERES = [
    { cle: 'ctr', titre: 'Taux de clic', valeur: 0.85, unite: '%', dec: 2, sens: 1,
      portee: 'annonces de véhicules Google, concessions canadiennes qui dépensaient environ 500 $ par mois',
      source: 'DealerRefresh (forum de concessionnaires)', date: 'mai 2022',
      lien: 'https://forum.dealerrefresh.com/threads/how-are-google-vehicle-listing-ads-doing-for-you.7865/post-64355',
      note: 'Ne jamais le comparer au 6 à 9 % de la recherche texte : le carrousel montre beaucoup d\'annonces à la fois.' },
    { cle: 'cpc', titre: 'Coût par clic', valeur: 1.25, etendue: [0.45, 3.69], devise: 'CAD', dec: 2, sens: -1,
      portee: 'annonces de véhicules Google, concessions canadiennes (moyenne)',
      source: 'DealerRefresh (forum de concessionnaires)', date: 'mai 2022',
      lien: 'https://forum.dealerrefresh.com/threads/how-are-google-vehicle-listing-ads-doing-for-you.7865/post-64355' },
    { cle: 'conv', titre: 'Taux de conversion', valeur: 0.76, unite: '%', dec: 2, sens: 1, suffixe: ' des clics',
      portee: 'conversions ÷ clics, annonces de véhicules Google, concessions canadiennes',
      source: 'DealerRefresh (forum de concessionnaires)', date: 'mai 2022',
      lien: 'https://forum.dealerrefresh.com/threads/how-are-google-vehicle-listing-ads-doing-for-you.7865/post-64355' },
    { cle: 'cpl', titre: 'Coût par lead', neuf: 35.87, occasion: 59.74, devise: 'USD', dec: 2, sens: -1,
      portee: 'recherche Google (annonces texte) en automobile, États-Unis, médianes de 1 983 campagnes — pas les annonces de véhicules',
      source: 'LocaliQ / WordStream', date: 'avril 2025 à juin 2026',
      lien: 'https://localiq.com/blog/automotive-search-advertising-benchmarks/' },
    { cle: 'cpv', titre: 'Coût par vente', min: 250, max: 500, devise: 'USD', dec: 0, sens: -1,
      portee: 'recherche Google, concessions américaines (estimation d\'un fournisseur)',
      source: 'LocalShift', date: 'date non publiée (lu en 2026)',
      lien: 'https://www.localshift.io/blog/dealership-cost-per-vdp' },
    { cle: 'pubNeuf', titre: 'Publicité par neuf vendu', valeur: 739, devise: 'USD', dec: 0, sens: -1,
      portee: 'toute la publicité d\'une concession franchisée moyenne, les trois quarts en numérique, États-Unis (791 $ US au premier semestre 2026)',
      source: 'NADA (cité par Ritner Digital)', date: '2025',
      lien: 'https://www.ritnerdigital.com/blog/why-are-dealer-advertising-costs-per-vehicle-sold-rising-in-2026and-what-can-dealerships-do-about-it' },
    { cle: 'jours', titre: 'Jours à la vente', neuf: 78, occasion: 71, unite: 'j', dec: 0, sens: -1,
      portee: 'médianes, États-Unis',
      source: 'Fullpath, Auto Intelligence Index', date: '2e trimestre 2026',
      lien: 'https://www.fullpath.com/wp-content/uploads/2026/07/FULLPATH-AUTO-INTELLIGENCE-INDEX-·-Q2-2026-1.pdf' },
    { cle: 'sansVue', titre: 'Véhicules sans vue de fiche', neuf: 53, occasion: 44, unite: '%', dec: 0, sens: 0,
      portee: 'part des véhicules sans aucune vue de fiche un jour moyen, États-Unis — sur une période, la part sans clic est forcément plus basse',
      source: 'Lotlinx (VINcensus)', date: '2e trimestre 2026',
      lien: 'https://www.autosuccessonline.com/lotlinx-q2-2026-vincensus/' }
  ];
  var REP = {}; REPERES.forEach(function (r) { REP[r.cle] = r; });

  /* Le taux du jour $ US → $ CA (Banque du Canada, ?tauxUsd=1 d'Export.gs), gardé 6 h dans la page. */
  var tauxJour = { t: null, le: 0, p: null };
  function chargerTaux() {
    if (tauxJour.t && Date.now() - tauxJour.le < 6 * 3600000) return Promise.resolve(tauxJour.t);
    if (tauxJour.p) return tauxJour.p;
    tauxJour.p = AMX.get({ tauxUsd: '1' }, { discret: true, secours: false }).then(function (d) {
      tauxJour.p = null;
      if (d && d.ok && d.taux > 0) { tauxJour.t = d; tauxJour.le = Date.now(); }
      return tauxJour.t;
    }, function () { tauxJour.p = null; return tauxJour.t; });
    return tauxJour.p;
  }
  function taux() {
    if (tauxJour.t) return tauxJour.t;
    var t = AMX.export && AMX.export.taux ? AMX.export.taux() : null;
    return t && t.ok && t.taux > 0 ? t : null;
  }
  function nombreRep(n, dec) { return Number(n).toLocaleString('fr-CA', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 }); }
  function suffixeRep(rep) { return rep.unite === '%' ? ' %' : (rep.unite === 'j' ? ' j' : (rep.devise === 'USD' ? ' $ US' : ' $')); }
  function fmtRep(n, rep) { return nombreRep(n, rep.dec) + suffixeRep(rep); }
  /* La valeur du repère pour un genre : { lo, hi, texte } dans la devise du repère. */
  function valeurRep(rep, genre) {
    if (rep.neuf !== undefined) {
      if (genre === 'occasion') return { lo: rep.occasion, hi: rep.occasion, texte: fmtRep(rep.occasion, rep) + ' (occasion)' };
      if (genre === 'neuf' || genre === 'demo') return { lo: rep.neuf, hi: rep.neuf, texte: fmtRep(rep.neuf, rep) + ' (neuf)' };
      return { lo: Math.min(rep.neuf, rep.occasion), hi: Math.max(rep.neuf, rep.occasion), texte: fmtRep(rep.neuf, rep) + ' neuf · ' + fmtRep(rep.occasion, rep) + ' occasion' };
    }
    if (rep.valeur !== undefined) return { lo: rep.valeur, hi: rep.valeur, texte: fmtRep(rep.valeur, rep) };
    return { lo: rep.min, hi: rep.max, texte: nombreRep(rep.min, rep.dec) + ' à ' + fmtRep(rep.max, rep) };
  }
  function enCad(n, rep) { if (rep.devise !== 'USD') return n; var t = taux(); return t ? n * t.taux : null; }
  function approxCad(rep, v) {
    if (rep.devise !== 'USD') return '';
    var t = taux(); if (!t) return '';
    var a = Math.round(v.lo * t.taux), b = Math.round(v.hi * t.taux);
    return ' (≈ ' + (a === b ? nombreRep(a) : nombreRep(a) + ' à ' + nombreRep(b)) + ' $ CA)';
  }
  /* Comparaison d'un de nos chiffres à un repère : { lib, ecart, cls, pct }. */
  function comparer(rep, notre, genre) {
    var v = valeurRep(rep, genre), lo = enCad(v.lo, rep), hi = enCad(v.hi, rep);
    var res = { lib: v.texte + (rep.suffixe || '') + approxCad(rep, v), ecart: '', cls: '', pct: null };
    if (notre === null || notre === undefined || !isFinite(notre) || !rep.sens || lo === null || !(lo > 0)) return res;
    var tol = 0.05;
    if (notre < lo * (1 - tol)) res.ecart = rep.sens < 0 ? 'mieux' : 'moins bien';
    else if (notre > hi * (1 + tol)) res.ecart = rep.sens > 0 ? 'mieux' : 'moins bien';
    else res.ecart = lo === hi ? 'comme le marché' : 'dans la fourchette';
    res.cls = res.ecart === 'mieux' ? 'mieux' : (res.ecart === 'moins bien' ? 'moins' : 'egal');
    if (lo === hi && res.cls !== 'egal') res.pct = Math.round(100 * (notre - lo) / lo);
    return res;
  }
  function titreRep(rep, extra) {
    var t = taux(), dev = rep.devise === 'USD' ? ' Montant en dollars américains' + (t ? ', converti au taux du jour de la Banque du Canada (1 $ US = ' + nombreRep(t.taux, 4) + ' $ CA' + (t.date ? ', ' + t.date : '') + ') pour la comparaison' : ' (taux du jour pas encore lu : pas de comparaison)') + '.' : (rep.devise === 'CAD' ? ' Montant en dollars canadiens.' : '');
    return rep.titre + ' — ' + rep.portee + '. Source : ' + rep.source + ', ' + rep.date + '.' + dev
      + (rep.etendue ? ' Fourchette observée : ' + nombreRep(rep.etendue[0], rep.dec) + ' à ' + fmtRep(rep.etendue[1], rep) + '.' : '')
      + (rep.note ? ' ' + rep.note : '') + (extra ? ' ' + extra : '') + ' Google ne publie aucun repère officiel pour les annonces de véhicules.';
  }
  /* La ligne « Marché : … » d'une tuile. nous : notre valeur en texte, quand elle n'est pas déjà le chiffre de la tuile. */
  function ligneMarche(rep, notre, genre, o) {
    o = o || {};
    var c = comparer(rep, notre, genre);
    var ec = c.ecart ? h('span.ec.' + c.cls, { text: c.ecart + (c.pct !== null ? ' (' + (c.pct > 0 ? '+' : '−') + Math.abs(c.pct) + ' %)' : '') }) : null;
    return h('span.marche', { title: titreRep(rep, o.extra) }, [
      document.createTextNode('Marché : ' + c.lib + (o.nous ? ' · nous : ' + o.nous : '')), ec]);
  }

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
    /* 26 nov. : le script v3 (annonces-script-ads.js) lit aussi les composants et applique les consignes d'Einstein (onglet Consignes). */
    if (window.AMX_SCRIPT_ADS_V3) return window.AMX_SCRIPT_ADS_V3.replace('__FEUILLE__', url).replace('__NOM__', nom || 'la concession');
    return [
      '/* ScanAutomax — résultats des annonces de véhicules, par véhicule (NIV), pour ' + (nom || 'la concession') + '.',
      '   Ce script ne change RIEN dans Google Ads : il lit les statistiques des 30 derniers jours (aujourd\'hui compris)',
      '   et les écrit dans la feuille de ScanAutomax. À programmer « Toutes les heures ».',
      '   Version 2 (17 nov. 2026) : aussi le détail des conversions (par type, par véhicule) et les appels venus des annonces. */',
      'var FEUILLE = \'' + url + '\';',
      'var JOURS = 30;',
      '',
      'function lire(q) { var out = [], it = AdsApp.search(q); while (it.hasNext()) out.push(it.next()); return out; }',
      'function essai(q, repli) { try { return lire(q); } catch (e) { if (repli) { try { return lire(repli); } catch (e2) {} } Logger.log(\'Pas lu : \' + String(e).slice(0, 200)); return null; } }',
      'function n(x) { var v = Number(x); return isFinite(v) ? v : 0; }',
      'function ecrire(ss, nom, tete, lignes, nTexte) {',
      '  var sh = ss.getSheetByName(nom) || ss.insertSheet(nom);',
      '  sh.clearContents();',
      '  var t = [tete].concat(lignes);',
      '  sh.getRange(1, 1, t.length, nTexte || 4).setNumberFormat(\'@\');',
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
      '  /* Le détail des conversions par type d\'action : « conversions » au jour du clic (comme dans Google Ads),',
      '     « jour_conversion » au jour où la demande est arrivée. */',
      '  var k = [], kv = [], ap = [];',
      '  rows = essai(\'SELECT segments.date, campaign.name, segments.conversion_action_name, segments.conversion_action_category, metrics.conversions, metrics.conversions_value, metrics.all_conversions, metrics.conversions_by_conversion_date FROM campaign WHERE \' + PLAGE,',
      '    \'SELECT segments.date, campaign.name, segments.conversion_action_name, segments.conversion_action_category, metrics.conversions, metrics.conversions_value, metrics.all_conversions FROM campaign WHERE \' + PLAGE);',
      '  (rows || []).forEach(function (r) {',
      '    if (!n(r.metrics.allConversions) && !n(r.metrics.conversions) && !n(r.metrics.conversionsByConversionDate)) return;',
      '    k.push([r.segments.date, r.campaign.name, r.segments.conversionActionName || \'\', r.segments.conversionActionCategory || \'\', n(r.metrics.conversions), n(r.metrics.conversionsValue), n(r.metrics.allConversions),',
      '      r.metrics.conversionsByConversionDate === undefined ? \'\' : n(r.metrics.conversionsByConversionDate)]);',
      '  });',
      '  if (rows) ecrire(ss, \'Conversions\', [\'date\', \'campagne\', \'action\', \'categorie\', \'conversions\', \'valeur\', \'toutes\', \'jour_conversion\'], k, 4);',
      '  /* Par véhicule (NIV) et par type d\'action. */',
      '  rows = essai(\'SELECT segments.date, segments.product_item_id, segments.conversion_action_name, metrics.conversions, metrics.all_conversions FROM shopping_performance_view WHERE \' + PLAGE + \' AND metrics.all_conversions > 0\');',
      '  (rows || []).forEach(function (r) {',
      '    kv.push([r.segments.date, String(r.segments.productItemId || \'\').toUpperCase(), r.segments.conversionActionName || \'\', n(r.metrics.conversions), n(r.metrics.allConversions)]);',
      '  });',
      '  if (rows) ecrire(ss, \'ConvVehicules\', [\'date\', \'item_id\', \'action\', \'conversions\', \'toutes\'], kv, 3);',
      '  /* Les appels venus des annonces (numéro de transfert de Google) : jamais le numéro de la personne, seulement l\'indicatif. */',
      '  rows = essai(\'SELECT call_view.start_call_date_time, call_view.call_duration_seconds, call_view.caller_area_code, call_view.call_status, call_view.type, call_view.call_tracking_display_location, campaign.name FROM call_view ORDER BY call_view.start_call_date_time DESC LIMIT 1000\');',
      '  (rows || []).forEach(function (r) {',
      '    var cv = r.callView || {}, d = String(cv.startCallDateTime || \'\');',
      '    if (d.slice(0, 10) < debut) return;',
      '    ap.push([d, String(n(cv.callDurationSeconds)), String(cv.callerAreaCode || \'\'), String(cv.callStatus || \'\'), String(cv.type || \'\'), String(cv.callTrackingDisplayLocation || \'\'), (r.campaign || {}).name || \'\']);',
      '  });',
      '  if (rows) ecrire(ss, \'Appels\', [\'debut\', \'duree\', \'indicatif\', \'statut\', \'type\', \'emplacement\', \'campagne\'], ap, 7);',
      '  var info = ss.getSheetByName(\'Info\') || ss.insertSheet(\'Info\');',
      '  info.clearContents();',
      '  info.getRange(1, 1, 5, 2).setNumberFormat(\'@\');',
      '  info.getRange(1, 1, 5, 2).setValues([[\'maj\', new Date().toISOString()], [\'compte\', compte.getCustomerId()], [\'devise\', compte.getCurrencyCode()], [\'periode\', debut + \' au \' + fin], [\'version\', \'2\']]);',
      '  Logger.log(v.length + \' lignes par véhicule, \' + c.length + \' par campagne, \' + k.length + \' de conversions, \' + kv.length + \' de conversions par véhicule, \' + ap.length + \' appels (\' + debut + \' au \' + fin + \').\');',
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
    this.btnRapport = h('button.btn', { type: 'button', text: 'Rapport', title: 'Recevoir par courriel le rapport Google Ads de la semaine ou du mois', onclick: function () { self.envoyerRapport(); } });
    this.btnBranchement.hidden = true; this.btnFeuille.hidden = true;
    this.elSous = h('p');
    conteneur.appendChild(h('div.entete-page', [
      h('div', [h('h1', 'Analyse des annonces'), this.elSous]),
      h('div.actions', AMX.actionsEntete([this.btnRafraichir, this.btnRapport, this.btnExporter, this.btnAds, this.btnFeuille, this.btnBranchement], [this.btnRafraichir]))
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
    /* 26 nov. (vitesse) : Google Ads (cache serveur, ~2 s) s'affiche dès qu'il arrive ; le flux et Google Analytics (6 à 8 s)
       complètent la page ensuite, sans attendre l'un l'autre. */
    var pA = charger(cie, p.du, p.au, force);
    if (!this.rep) pA.then(function (d0) {
      if (self.detruit || cie !== (self.cie || 'BMW') || self.rep) return;
      self.rep = d0; self.flux = { erreurFlux: 'Lecture du flux…' }; self.ga = { erreur: 'Lecture de Google Analytics…' }; self.rendre();
    }).catch(function () {});
    return Promise.all([pA, fl, chargerGa(cie, p.du, p.au, force)]).then(function (r) {
      if (self.detruit || cie !== (self.cie || 'BMW')) return;
      self.rep = r[0]; self.flux = r[1]; self.ga = r[2]; self.rendre();
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
    /* 15 nov. : le taux du jour $ US → $ CA pour les repères du marché, lu une fois ; la page se redessine quand il arrive. */
    if (!taux() && !this.tauxDemande) { this.tauxDemande = true; chargerTaux().then(function (tx) { if (tx && !self.detruit && self.rep) self.rendre(); }); }
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
      var n = o[0] === 'vehicules' ? nVeh : (o[0] === 'ventes' ? nVen : (o[0] === 'conversions' ? Math.round(d.conv && d.conv.lu ? (d.conv.actions || []).reduce(function (t, x) { return t + (x.conversions || 0); }, 0) : ((d.totaux || {}).conversions || 0)) : null));
      return h('button' + (self.onglet === o[0] ? '.actif' : ''), { type: 'button', role: 'tab', 'aria-selected': self.onglet === o[0] ? 'true' : 'false', onclick: function () { self.aller(o[0]); } },
        [document.createTextNode(o[1]), n !== null ? h('span.n', { text: nb(n) }) : null]);
    }));
    this.elCorps.appendChild(this.elOnglets);
    if (this.onglet === 'vehicules') this.ongletVehicules();
    else if (this.onglet === 'site') this.ongletSite();
    else if (this.onglet === 'ficheGoogle') this.ongletFiche();
    else if (this.onglet === 'conversions') this.ongletConversions();
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
      [h('span.lib', { text: libelle }), h('b', { text: valeur }), bas, o.marche || null]);
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
        kpi(r.ctr === null ? '—' : pctVal(r.ctr, 2), 'Taux de clic', { zero: r.ctr === null, v: vr('ctr', 1), note: 'clics ÷ impressions', marche: ligneMarche(REP.ctr, r.ctr, this.genre) }),
        kpi(argentFin(t.cout), 'Dépense', { zero: !t.cout, v: v('cout', 0), note: 'facturée par Google' }),
        kpi(r.cpc === null ? '—' : argent(r.cpc, 2), 'Coût par clic', { zero: r.cpc === null, v: vr('cpc', -1), note: 'dépense ÷ clics', marche: ligneMarche(REP.cpc, r.cpc, this.genre) }),
        kpi(dec1(t.conversions), 'Conversions', { zero: !t.conversions, v: v('conversions', 1), note: t.conversions ? 'voir le détail ›' : 'appels, formulaires, itinéraires', onclick: function () { self.aller('conversions'); }, title: 'Le détail : appels, demandes du site, jour par jour, véhicules',
          marche: ligneMarche(REP.conv, t.clics ? 100 * t.conversions / t.clics : null, this.genre, { nous: t.clics ? pctVal(100 * t.conversions / t.clics, 2) : '' }) }),
        kpi(r.cpa === null ? '—' : argentFin(r.cpa), 'Coût par conversion', { zero: r.cpa === null, v: vr('cpa', -1), note: 'dépense ÷ conversions', marche: ligneMarche(REP.cpl, r.cpa, this.genre) }),
        kpi(t.valeur ? argentFin(t.valeur) : '—', 'Valeur des conversions', { zero: !t.valeur, v: t.valeur ? v('valeur', 1) : null, note: 'valeur inscrite dans Google Ads' })
      ])]));
    /* 26 nov. : le rythme du mois en cours (jusqu'à hier) et la projection de fin de mois, tous genres confondus. */
    var M = d.mois;
    if (!this.genre && M && M.joursEcoules > 0 && M.cout > 0) {
      var parJour = M.cout / M.joursEcoules, proj = parJour * M.joursMois;
      z.appendChild(h('p.ana-note', [h('b', { text: 'Mois en cours : ' }), document.createTextNode(argentFin(M.cout) + ' dépensés du ' + fmtJour(M.du) + ' au ' + fmtJour(M.au) + ' (' + argent(parJour, 2) + ' par jour) → environ '),
        h('b', { text: argentFin(proj) }), document.createTextNode(' sur le mois complet (' + M.joursMois + ' jours) · ' + nb(M.clics) + ' clics · ' + dec1(M.conversions) + ' conversions.')]));
    }
    /* 26 nov. (Maxime : « on ne met pas assez d'emphase sur le neuf », budget du neuf 3 000 $ par mois) : la part du neuf dans la dépense. */
    var GN = d.genres || null;
    if (!this.genre && GN && GN.partNeuf !== null && GN.partNeuf !== undefined) {
      var pn = Math.round(GN.partNeuf * 100), cibleN = Math.round((GN.cible || 0.5) * 100);
      z.appendChild(h('p.ana-note', [h('b', { text: 'Part du neuf : ' + pn + ' %' }), document.createTextNode(' de la dépense rattachée aux véhicules va aux neufs et démos (cible ' + cibleN + ' %, budget du neuf 3 000 $ par mois) · neufs ' + argent((GN.neuf || {}).cout || 0) + ' · démos ' + argent((GN.demo || {}).cout || 0) + ' · occasions ' + argent((GN.occasion || {}).cout || 0) + '.')]));
      if (GN.partNeuf < (GN.cible || 0.5)) z.appendChild(h('div.ana-carte.ambre', { text: 'Le neuf d\'abord : ' + pn + ' % seulement. Einstein met les neufs de l\'avant en premier dans le flux ; la campagne « Neuf » séparée dans Google Ads (3 000 $ par mois) règle le reste.' }));
    }
    if (this.genre && this.donneesAds()) z.appendChild(h('p.ana-note', { text: 'Somme des véhicules ' + (NOM_GENRE[this.genre] || '').toLowerCase() + 's seulement : la dépense rattachée à aucun véhicule n\'est pas comptée.' }));
    else if (!this.genre && d.sourceTotaux === 'campagnes' && d.totauxVehicules && t.cout > 0) {
      /* Dépense qui ne va à aucun véhicule = annonces texte de Performance Max. Jusqu'à hier seulement :
         Google rattache la dépense du jour aux véhicules avec quelques heures de retard (horsFlux du serveur). */
      var ajdHf = new Date().toLocaleDateString('en-CA'), hf = d.horsFlux || null;
      if (!hf && d.periode && d.periode.au < ajdHf) hf = { du: d.periode.du, au: d.periode.au, cout: Math.max(0, t.cout - d.totauxVehicules.cout), total: t.cout };
      if (hf && hf.cout >= 1 && hf.total > 0) {
        var partHf = hf.cout / hf.total;
        z.appendChild(h('p.ana-note', { text: 'Annonces de véhicules : ' + argent(hf.total - hf.cout) + ' · annonces texte de Google (titres et descriptions de la campagne, sans véhicule précis) : ' +
          argent(hf.cout) + ' (' + pct(hf.cout, hf.total) + ')' + (hf.au < (d.periode || {}).au ? ', jusqu\'à hier' : '') + '.' +
          (hf.aujourdhui || (d.periode && d.periode.au >= ajdHf) ? ' La dépense d\'aujourd\'hui est rattachée aux véhicules plus tard dans la journée.' : '') }));
        if (partHf > 0.25) z.appendChild(h('div.ana-carte.ambre', { text: pct(hf.cout, hf.total) + ' de la dépense va aux annonces texte plutôt qu\'aux véhicules : la campagne s\'éloigne du flux. Revoir les titres et descriptions du groupe de composants dans Google Ads.' }));
      }
    }
/* 26 nov. (Maxime : « ce ne sont pas des bonnes statistiques » en tête de page) : le site et la fiche Google ne sont plus en haut ;
   ils sont au bas du Résumé (zoneSiteFiche) et dans leurs onglets. Le haut de page, c'est Google Ads et les ventes. */
    /* ventes et publicité */
    var s = this.statsVentes(), ads = this.donneesAds(), allerV = function () { self.aller('ventes'); };
    var tiles = [
      kpi(nb(s.L.length), 'Ventes de la période', { zero: !s.L.length, note: s.L.length ? nb(s.neufs) + ' neuf' + (s.neufs > 1 ? 's' : '') + ' · ' + nb(s.occasions) + ' occasion' + (s.occasions > 1 ? 's' : '') : 'au Livre des ventes', onclick: allerV }),
      kpi(nb(s.inf.length), 'Vendues après un clic', { zero: !s.inf.length, classe: s.inf.length ? 'vert' : '', note: s.L.length - s.sansNiv.length ? pct(s.inf.length, s.L.length - s.sansNiv.length) + ' des ventes avec un NIV' : 'clic payé avant la date de vente', onclick: allerV }),
      kpi(s.inf.length && s.depense ? argentFin(s.depense / s.inf.length) : '—', 'Dépense par vente', { zero: !(s.inf.length && s.depense), note: 'dépense ÷ ventes après un clic', onclick: allerV,
        marche: ligneMarche(REP.cpv, s.inf.length && s.depense ? s.depense / s.inf.length : null, this.genre, { extra: 'Autre repère : ' + REP.pubNeuf.titre.toLowerCase() + ', ' + fmtRep(REP.pubNeuf.valeur, REP.pubNeuf) + ' (' + REP.pubNeuf.portee + ' ; ' + REP.pubNeuf.source + ', ' + REP.pubNeuf.date + ').' }) })
    ];
    if (d.montants) tiles.push(kpi(s.depense > 0 && s.nProfit ? dec1(s.profitInf / s.depense) + ' ×' : '—', 'Profit ÷ dépense', { zero: !(s.depense > 0 && s.nProfit), classe: s.depense > 0 && s.nProfit ? (s.profitInf / s.depense >= 1 ? 'vert' : 'rouge') : '', note: s.nProfit ? argentCourt(s.profitInf) + ' de profit brut sur ces ventes' : 'profit brut des ventes après un clic', onclick: allerV }));
    else tiles.push(kpi(s.jA !== null ? Math.round(s.jA) + ' j' : (s.jT !== null ? Math.round(s.jT) + ' j' : '—'), 'Jours à la vente', { zero: s.jA === null && s.jT === null, note: s.jA !== null ? 'médiane, vendues après un clic' : 'médiane de la période', onclick: allerV,
      marche: ligneMarche(REP.jours, s.jA !== null ? s.jA : s.jT, this.genre) }));
    z.appendChild(h('div.ana-kgroupe', [h('h2', [document.createTextNode('Ventes et publicité'), h('small', { text: ads ? 'les ventes du Livre des ventes et la publicité reçue avant la vente' : 'les ventes du Livre des ventes ; la publicité s\'ajoutera avec les premiers clics' })]), h('div.ana-kpis', tiles)]));
    return z;
  };

  /* ---- 26 nov. : le site (Google Analytics) et la fiche Google, au bas du Résumé — « — » tant que ce n'est pas lu ---- */
  Vue.prototype.zoneSiteFiche = function () {
    var self = this, G = this.gaRep(), gaOk = this.gaDonnees(), Fi = G ? G.fiche : null, sfi = sommeFiche(Fi), fOk = !!(Fi && Fi.fiches.length), gt = gaOk ? G.ga.totaux : null, gp = gaOk && this.periode !== 'tout' ? G.ga.precedent : null;
    var pasLu = (this.ga || {}).pasAJour ? 'script à déployer' : ((this.ga || {}).erreur ? 'lecture en cours' : 'à brancher'), pf = this.merchantPerf(), pfOk = !!pf;
    return h('section.ana-zone', h('div.ana-kgroupe', [h('h2', [document.createTextNode('Le site et la fiche Google'), h('small', { text: 'Google Analytics et le profil d\'entreprise Google' + (this.genre ? ' · tous les genres' : '') })]),
      h('div.ana-kpis.k5', [
        kpi(gaOk ? nb(gt.sessions) : '—', 'Visites du site', { zero: !gaOk || !gt.sessions, v: gp ? variation(gt.sessions, gp.sessions, 1) : null, note: gaOk ? pct(gt.payant, gt.sessions) + ' payées · ' + pct(gt.naturel, gt.sessions) + ' recherche gratuite' : pasLu, onclick: function () { self.aller('site'); } }),
        kpi(gaOk ? nb(gt.demandes) : '—', 'Demandes envoyées', { zero: !gaOk || !gt.demandes, classe: gaOk && gt.demandes ? 'vert' : '', v: gp ? variation(gt.demandes, gp.demandes, 1) : null, note: gaOk ? 'formulaires du site · ' + (gt.sessions ? pct(gt.demandes, gt.sessions, 2) + ' des visites' : '') : pasLu, onclick: function () { self.aller('site'); } }),
        kpi(fOk ? nb(sfi.t.vues) : '—', 'Vues de la fiche Google', { zero: !fOk || !sfi.t.vues, v: fOk && this.periode !== 'tout' ? variation(sfi.t.vues, sfi.pr.vues, 1) : null, note: fOk ? 'recherche et Maps (3 à 5 jours de retard)' : (Fi && Fi.erreur ? 'pas encore lisible' : pasLu), onclick: function () { self.aller('ficheGoogle'); } }),
        kpi(fOk ? nb(sfi.t.appels) : '—', 'Appels de la fiche Google', { zero: !fOk || !sfi.t.appels, classe: fOk && sfi.t.appels ? 'vert' : '', v: fOk && this.periode !== 'tout' ? variation(sfi.t.appels, sfi.pr.appels, 1) : null, note: fOk ? nb(sfi.t.siteWeb) + ' clics vers le site · ' + nb(sfi.t.itineraires) + ' itinéraires' : pasLu, onclick: function () { self.aller('ficheGoogle'); } }),
        kpi(pfOk ? nb(pf.totaux.clicsGratuit) : '—', 'Clics gratuits dans Google', { zero: !pfOk || !pf.totaux.clicsGratuit, classe: pfOk && pf.totaux.clicsGratuit ? 'vert' : '', v: pfOk && pf.precedent && this.periode !== 'tout' ? variation(pf.totaux.clicsGratuit, pf.precedent.clicsGratuit, 1) : null,
          note: pfOk ? nb(pf.totaux.imprGratuit) + ' fois vus sans payer · ' + nb(pf.totaux.clicsAds) + ' clics d\'annonces' : (G && G.merchant && G.merchant.perf && G.merchant.perf.erreur ? 'pas encore lisible' : ((this.ga || {}).pasAJour ? 'script à déployer' : 'Merchant Center, lu chaque matin')),
          onclick: function () { self.aller('vehicules', { filtre: pfOk && pf.totaux.clicsGratuit ? 'gratuits' : '', q: '' }); } })
      ])]));
  };

  /* 26 nov. (Maxime : « un rapport de performance de Google Ads », puis « 1 x par semaine ») : le rapport de la semaine dernière ou
     d'un mois, envoyé par courriel à la personne connectée (AnnoncesRapport.gs). Le lundi matin, le rapport de la semaine part de
     lui-même à la propriétaire et aux DG de chaque concession branchée, avec une lecture fraîche d'Einstein et le marché des occasions. */
  Vue.prototype.envoyerRapport = function () {
    var self = this, a = ((this.rep || {}).ads) || {}, d = new Date(), prec = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    if (!a.branche) { AMX.toast('Google Ads n\'est pas branché pour cette concession.', 'erreur', 6000); return; }
    var nomMois = function (x) { return x.toLocaleDateString('fr-CA', { month: 'long', year: 'numeric' }); };
    var envoyer = function (mois) {
      return AMX.post({ action: 'annoncesResultats', op: 'rapport', compagnie: self.cie || 'BMW', mois: mois }, { secours: false, delai: 120000 }).then(function (r) {
        if (!r || r.refuse || r.ok === false) throw new Error((r && r.erreur) || 'Refusé');
        AMX.toast(r.message || 'Rapport envoyé.', 'ok', 7000);
      }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur', 9000); return false; });
    };
    AMX.modale({ titre: 'Rapport mensuel Google Ads',
      corps: h('p', { style: { margin: 0, lineHeight: '1.5' }, text: 'Envoyé par courriel à votre adresse, pour ' + ((this.rep || {}).nom || this.cie) + ' : les chiffres comparés à la période d\'avant, les ventes, les conversions, les véhicules les plus cliqués, les recommandations d\'Einstein et ce qui a suivi, le prix face au marché et les points à surveiller. Le rapport de la semaine part de lui-même chaque lundi matin.' }),
      boutons: [{ texte: 'Annuler' }, { texte: nomMois(prec), action: function () { return envoyer(prec.getFullYear() + '-' + ('0' + (prec.getMonth() + 1)).slice(-2)); } }, { texte: nomMois(d) + ' (à date)', action: function () { return envoyer('courant'); } }, { texte: 'Semaine dernière', classe: 'primaire', action: function () { return envoyer('semaine'); } }] });
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

  function tuile(valeur, libelle, classe, note, onclick, marche) {
    return h((onclick ? 'button' : 'div') + '.ana-tuile' + (classe ? '.' + classe : ''), onclick ? { type: 'button', onclick: onclick } : {}, [
      h('b', { text: typeof valeur === 'number' ? nb(valeur) : String(valeur) }), h('span', { text: libelle }), note ? h('em', { text: note }) : null, marche || null]);
  }

  /* =============================== Résumé =============================== */
  Vue.prototype.ongletResume = function () {
    var c = this.elCorps;
    c.appendChild(this.carteEinstein());
    c.appendChild(this.cartePilote());
    c.appendChild(this.zoneParcours());
    c.appendChild(this.zonePresence());
    c.appendChild(this.zoneReperes());
    c.appendChild(this.zoneSemaines());
    c.appendChild(this.zoneFlux());
    c.appendChild(this.zoneAge());
    c.appendChild(this.zoneSurveiller());
    c.appendChild(this.zoneLocation());
    c.appendChild(this.zoneSiteFiche());
    var t = this.genre ? null : this.tablesCampagnes();
    if (t) c.appendChild(h('section.ana-zone', [h('details', [h('summary', { text: 'Par campagne et par réseau' }), t])]));
  };

  /* ---- 26 nov. (Maxime : « la location BMW doit être liée à notre analyse Google ») : les offres de location du site et leurs chiffres Google Ads ---- */
  Vue.prototype.zoneLocation = function () {
    var self = this, d = this.rep || {}, L = d.location || null;
    if (!L || !L.offres || !L.offres.length) return document.createDocumentFragment();
    var T = L.totaux || {}, refs = this.indexRefs();
    var z = h('section.ana-zone', h('div.ana-kgroupe', [h('h2', [document.createTextNode('Offres de location du site'), h('small', { text: L.offres.length + ' véhicule' + (L.offres.length > 1 ? 's' : '') + ' à 0 $ comptant · ' + (nomPeriode(this.periode) || '').toLowerCase() })]),
      h('div.ana-kpis', [
        kpi(nb(T.clics || 0), 'Clics sur les offres', { zero: !T.clics, note: nb(T.impressions || 0) + ' impressions' }),
        kpi(argent(T.cout || 0), 'Dépense', { zero: !T.cout, note: T.clics ? argent(T.cout / T.clics, 2) + ' par clic' : '' }),
        kpi(dec1(T.conversions || 0), 'Conversions', { zero: !T.conversions, classe: T.conversions ? 'vert' : '', note: T.conversions ? argent(T.cout / T.conversions) + ' par conversion' : '' }),
        kpi(String(L.offres.length), 'Offres publiées', { note: 'mises de l\'avant d\'office par Einstein' })]),
      h('p.ana-note', [document.createTextNode('La description Google de ces véhicules dit « Location 0 $ comptant dès X $/mois ». '), L.page ? h('a', { href: L.page, target: '_blank', rel: 'noopener', text: 'Voir la page des offres' }) : null, document.createTextNode(' · '), h('a', { href: '#/occasion/locbmw', text: 'Location BMW › Offres du site' })]),
      h('div.ana-defile', h('table.ana-table', [h('thead', h('tr', [h('th', { text: 'Véhicule' }), h('th', { text: 'Mensualité' }), h('th', { text: 'Terme' }), h('th', { text: 'Économie / mois' }), h('th', { text: 'Impr.' }), h('th', { text: 'Clics' }), h('th', { text: 'Dépense' }), h('th', { text: 'Conv.' })])),
        h('tbody', L.offres.slice(0, 20).map(function (o) { var x = refs[o.vin.slice(-8)]; var nom = x && x.vehicule ? x.vehicule : '…' + o.vin.slice(-8); var st = x ? refDe(x) : '';
          return h('tr', [h('td', h('button', { type: 'button', title: 'Voir ce véhicule', text: (st ? st + ' · ' : '') + nom, style: { font: 'inherit', background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'var(--vert-fonce)', fontWeight: '600', textAlign: 'left' }, onclick: function () { self.aller('vehicules', { filtre: '', q: st || o.vin.slice(-8) }); } })),
            h('td.n', { text: o.mensualite ? argent(Math.round(o.mensualite)) + ' avant taxes' : '—' }), h('td.n', { text: o.terme ? o.terme + ' mois' : '—' }), h('td.n', { text: o.economie ? argent(o.economie) : '—' }),
            h('td.n' + (o.impressions ? '' : '.zero'), { text: nb(o.impressions) }), h('td.n' + (o.clics ? '' : '.zero'), { text: nb(o.clics) }), h('td.n' + (o.cout ? '' : '.zero'), { text: argent(o.cout) }), h('td.n' + (o.conversions ? '' : '.zero'), { text: dec1(o.conversions) })]); }))]))]));
    return z;
  };

  /* ---- Repères du marché (15 nov.) : les repères externes, puis nous-mêmes (quatre dernières semaines, par genre) ---- */
  function ligneGenre(nom, t, note) {
    var r = ratios(t), conv = t.clics ? 100 * t.conversions / t.clics : null;
    return h('tr', [h('td', [h('b', { text: nom }), note ? h('span.sous', { text: note }) : null]),
      h('td.n' + (t.impressions ? '' : '.zero'), { text: nb(t.impressions) }), h('td.n' + (t.clics ? '' : '.zero'), { text: nb(t.clics) }),
      h('td.n' + (r.ctr === null ? '.zero' : ''), { text: r.ctr === null ? '—' : pctVal(r.ctr, 2) }),
      h('td.n' + (r.cpc === null ? '.zero' : ''), { text: r.cpc === null ? '—' : argent(r.cpc, 2) }),
      h('td.n' + (conv === null ? '.zero' : ''), { text: conv === null ? '—' : pctVal(conv, 2) }),
      h('td.n' + (r.cpa === null ? '.zero' : ''), { text: r.cpa === null ? '—' : argentFin(r.cpa) })]);
  }
  function teteGenres(premier) {
    return h('thead', h('tr', [h('th', { text: premier }), h('th.n', { text: 'Impressions' }), h('th.n', { text: 'Clics' }), h('th.n', { text: 'Taux de clic' }),
      h('th.n', { text: 'Coût par clic' }), h('th.n', { text: 'Conversion' }), h('th.n', { text: 'Coût par conv.' })]));
  }
  function quatreSemaines() { var au = new Date(), du = new Date(au.getTime() - 27 * 86400000); return { du: iso(du), au: iso(au) }; }
  Vue.prototype.zoneReperes = function () {
    var self = this, z = h('section.ana-zone.ana-reperes'), x = this.totauxGenre(), t = x.t, r = ratios(t), s = this.statsVentes(), g = this.genre;
    z.appendChild(h('h2', 'Repères du marché'));
    z.appendChild(h('div.ana-carte.bleu', [h('b', { text: 'Google ne publie aucun repère officiel pour les annonces de véhicules. ' }),
      document.createTextNode('Ces chiffres viennent d\'études et de forums, souvent américains ou anciens : ce sont des garde-fous, jamais des cibles. '
        + 'Les montants américains restent en $ US' + (taux() ? ', avec leur équivalent en $ CA au taux du jour (1 $ US = ' + nombreRep(taux().taux, 4) + ' $ CA).' : '.')
        + ' Le meilleur repère, c\'est nous-mêmes : nos quatre dernières semaines, plus bas, neuf, occasion et démo séparés.')]));
    var conv = t.clics ? 100 * t.conversions / t.clics : null, dpv = s.inf.length && s.depense ? s.depense / s.inf.length : null;
    var L = this.lignesVehicules(), base15 = L.filter(function (v) { return v.surSite && v.vedette && v.etat !== 'exclu' && (v.jours || 0) >= 15; }), sans15 = base15.filter(function (v) { return !v.s.clics; });
    var lignes = [
      [REP.ctr, r.ctr, r.ctr === null ? '' : pctVal(r.ctr, 2)],
      [REP.cpc, r.cpc, r.cpc === null ? '' : argent(r.cpc, 2)],
      [REP.conv, conv, conv === null ? '' : pctVal(conv, 2)],
      [REP.cpl, r.cpa, r.cpa === null ? '' : argentFin(r.cpa) + ' par conversion'],
      [REP.cpv, dpv, dpv === null ? '' : argentFin(dpv) + ' par vente après un clic'],
      [REP.pubNeuf, null, 'pas mesuré : il faudrait toute la publicité de la concession'],
      [REP.jours, s.jA !== null ? s.jA : s.jT, s.jA !== null ? Math.round(s.jA) + ' j (après un clic)' : (s.jT !== null ? Math.round(s.jT) + ' j' : '')],
      [REP.sansVue, null, this.donneesAds() && base15.length ? pct(sans15.length, base15.length) + ' sans clic sur la période (annoncés, 15 j et +)' : '']
    ];
    var tb = h('tbody');
    lignes.forEach(function (l) {
      var rep = l[0], c = comparer(rep, l[1], g);
      tb.appendChild(h('tr', { title: titreRep(rep) }, [
        h('td', [h('b', { text: rep.titre }), h('span.sous', { text: rep.portee.charAt(0).toUpperCase() + rep.portee.slice(1) })]),
        h('td', [h('b', { text: c.lib }), rep.etendue ? h('span.sous', { text: 'fourchette ' + nombreRep(rep.etendue[0], rep.dec) + ' à ' + fmtRep(rep.etendue[1], rep) }) : null]),
        h('td' + (l[2] ? '' : '.zero'), { text: l[2] || '—' }),
        h('td', c.ecart ? h('span.ana-pastille.' + (c.cls === 'mieux' ? 'vert' : (c.cls === 'moins' ? 'rouge' : 'gris')), { text: c.ecart + (c.pct !== null ? ' (' + (c.pct > 0 ? '+' : '−') + Math.abs(c.pct) + ' %)' : '') }) : h('span.sous', { text: rep.sens ? '—' : 'pas comparable' })),
        h('td', [h('a', { href: rep.lien, target: '_blank', rel: 'noopener', text: rep.source }), h('span.sous', { text: rep.date + (rep.devise === 'USD' ? ' · $ US' : (rep.devise === 'CAD' ? ' · $ CA' : '')) })])
      ]));
    });
    z.appendChild(h('div.ana-defile', h('table.ana-table.rep', [h('thead', h('tr', [h('th', { text: 'Indicateur' }), h('th', { text: 'Marché' }),
      h('th', { text: 'Nous (' + (nomPeriode(this.periode) || '').toLowerCase() + ')' }), h('th', { text: 'Écart' }), h('th', { text: 'Source' })])), tb])));
    /* nous-mêmes : les quatre dernières semaines, par genre */
    var q = quatreSemaines(), cie = this.cie || 'BMW', cle = cie + '|' + q.du + '|' + q.au;
    var bloc = h('div.ana-interne');
    z.appendChild(h('h3.ana-sous-titre', 'Nous-mêmes : les quatre dernières semaines'));
    z.appendChild(h('p.ana-note', { text: 'Du ' + fmtJour(q.du) + ' au ' + fmtJour(q.au) + ' (aujourd\'hui compris), chez ' + (AMX.COMPAGNIES_TOUTES[cie] || cie) + '. La dépense qui ne va à aucun véhicule n\'est comptée que dans la ligne « Toute la campagne ».' }));
    z.appendChild(bloc);
    if (this.interne && this.interne.cle === cle && this.interne.rep) this.rendreInterne(bloc, this.interne.rep);
    else {
      bloc.appendChild(h('p.ana-note', { text: this.interne && this.interne.cle === cle && this.interne.erreur ? 'Lecture impossible : ' + this.interne.erreur : 'Lecture des quatre dernières semaines…' }));
      if (!(this.interne && this.interne.cle === cle && (this.interne.erreur || this.interne.enCours))) {
        this.interne = { cle: cle, enCours: true };
        charger(cie, q.du, q.au, false).then(function (d) { self.interne = { cle: cle, rep: d }; }, function (e) { self.interne = { cle: cle, erreur: AMX.erreurTexte(e) }; })
          .then(function () { if (!self.detruit && self.onglet === 'resume') self.rendre(); });
      }
    }
    /* les autres concessions, sur demande (chaque lecture relit aussi le Livre des ventes) */
    var autres = Object.keys(AMX.compagniesPour ? AMX.compagniesPour('inventaire') : {}).filter(function (c) { return c !== cie; });
    if (autres.length) {
      var ba = h('div.ana-autres');
      z.appendChild(h('h3.ana-sous-titre', 'Les autres concessions du groupe'));
      z.appendChild(ba);
      if (this.autres && this.autres.cle === q.du + '|' + cie) this.rendreAutres(ba, autres, q);
      else ba.appendChild(h('div.rangee', [h('button.btn', { type: 'button', text: 'Comparer avec les autres concessions', onclick: function () { self.chargerAutres(autres, q, cie); } }),
        h('span.ana-note', { text: 'Seule une concession qui a des annonces Google a des chiffres.' })]));
    }
    return z;
  };
  Vue.prototype.rendreInterne = function (bloc, d) {
    var self = this, g = this.genres();
    (d.ventes || []).forEach(function (v) { if (v.vin && !g[v.vin]) g[v.vin] = genreVente(v); });
    var par = { neuf: vide(), occasion: vide(), demo: vide(), '': vide() }, nVeh = { neuf: 0, occasion: 0, demo: 0, '': 0 };
    Object.keys(d.vehicules || {}).forEach(function (vin) { var k = g[vin] || ''; if (!par[k]) k = ''; ajoute(par[k], d.vehicules[vin]); nVeh[k]++; });
    var a = d.ads || {};
    if (!a.joursAvecDonnees || !(a.dernierJour >= d.periode.du)) { bloc.appendChild(h('div.ana-vide', { text: 'Pas encore de résultats de Google Ads dans ces quatre semaines : ce repère se remplira avec les premières impressions.' })); return; }
    var tb = h('tbody');
    [['neuf', 'Neufs'], ['occasion', 'Occasions'], ['demo', 'Démos'], ['', 'Autres (genre inconnu)']].forEach(function (x) {
      if (!x[0] && !par[''].impressions) return;
      tb.appendChild(ligneGenre(x[1], par[x[0]], nVeh[x[0]] ? nVeh[x[0]] + ' véhicule' + (nVeh[x[0]] > 1 ? 's' : '') + ' avec des impressions' : 'aucune impression'));
    });
    tb.appendChild(ligneGenre('Toute la campagne', d.totaux || vide(), d.sourceTotaux === 'campagnes' ? 'avec la dépense hors véhicules' : ''));
    bloc.appendChild(h('div.ana-defile', h('table.ana-table', [teteGenres('Genre'), tb])));
  };
  Vue.prototype.chargerAutres = function (autres, q, cie) {
    var self = this, cle = q.du + '|' + cie;
    this.autres = { cle: cle, enCours: true, rep: {} };
    this.rendre();
    Promise.all(autres.map(function (c) {
      return charger(c, q.du, q.au, false).then(function (d) { self.autres.rep[c] = d; }, function (e) { self.autres.rep[c] = { erreur: AMX.erreurTexte(e) }; });
    })).then(function () { self.autres.enCours = false; if (!self.detruit && self.onglet === 'resume') self.rendre(); });
  };
  Vue.prototype.rendreAutres = function (ba, autres, q) {
    var A = this.autres || {};
    if (A.enCours) { ba.appendChild(h('p.ana-note', { text: 'Lecture des autres concessions…' })); return; }
    var tb = h('tbody'), sans = [];
    autres.forEach(function (c) {
      var d = A.rep[c] || {}, a = d.ads || {}, nom = AMX.COMPAGNIES_TOUTES[c] || c;
      if (d.erreur) { sans.push(nom + ' (lecture impossible)'); return; }
      if (!a.joursAvecDonnees || !(a.dernierJour >= q.du)) { sans.push(nom); return; }
      tb.appendChild(ligneGenre(nom, d.totaux || vide(), 'toute la campagne'));
    });
    if (tb.children.length) ba.appendChild(h('div.ana-defile', h('table.ana-table', [teteGenres('Concession'), tb])));
    if (sans.length) ba.appendChild(h('p.ana-note', { text: 'Pas encore d\'annonces Google : ' + sans.join(', ') + '.' }));
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

  /* ---- 26 nov. (Maxime : « ton intelligence artificielle doit gérer les Google Ads ») : Einstein pilote (AnnoncesPilote.gs).
     Chaque jour, Einstein relit 14 jours et choisit les véhicules mis de l'avant / retirés du flux Google ; en mode « proposer »
     il attend un clic ici, en mode « appliquer » il le fait tout seul (garde-fous côté serveur). Le reste (prix, photos, fiches)
     reste à l'équipe. L'état `pilote` voyage avec l'analyse (GET annoncesAnalyse). ---- */
  var GESTES_PILOTE = { mettre_avant: 'Mettre de l\'avant', retirer_avant: 'Retirer de l\'avant', photos: 'Photos', prix: 'Prix', budget: 'Budget', fiche: 'Fiche sur le site', ficheGoogle: 'Fiche Google', corrigerGoogle: 'Corriger dans Google', attendre: 'Attendre', autre: 'Autre', textesAds: 'Textes Google Ads', campagneAds: 'Campagne Google Ads', budgetAds: 'Budget Google Ads', partNeuf: 'Part du neuf' };
  var ETATS_PILOTE = { fait: 'fait', propose: 'à approuver', ignore: 'ignoré', refuse: 'retenu par les garde-fous', a_faire: 'à faire par l\'équipe', erreur: 'erreur' };
  Vue.prototype.cartePilote = function () {
    var self = this, d = this.rep || {}, P = d.pilote, a = d.ads || {}, el = h('section.ana-pilote');
    if (!a.branche) { el.hidden = true; return el; }
    if (!P) { el.appendChild(h('p.expl', { text: 'Einstein pilote arrive avec la prochaine version du script.' })); return el; }
    var occupe = !!this.piloteEnCours, mode = P.mode || 'proposer';
    var modes = [['off', 'Éteint'], ['proposer', 'Propose, j\'approuve'], ['appliquer', 'Applique tout seul']];
    el.appendChild(h('div.tete', [h('h2', 'Einstein pilote — les véhicules mis de l\'avant'),
      h('div.mode', modes.map(function (m) { return h('button' + (mode === m[0] ? '.actif.' + m[0] : ''), { type: 'button', text: m[1], disabled: occupe, onclick: function () { if (m[0] !== mode) self.pilote({ quoi: 'regler', mode: m[0] }, m[0] === 'appliquer' ? 'Einstein appliquera tout seul ses choix dans le flux Google (au plus ' + (P.maxParJour || 6) + ' véhicules par jour, jamais un choix fait à la main récemment). Continuer ?' : null); } }); })),
      h('button.btn', { type: 'button', text: occupe ? 'Einstein travaille…' : 'Lancer maintenant', disabled: occupe, title: 'Einstein relit 14 jours et décide (30 à 60 s)', onclick: function () { self.pilote({ quoi: 'lancer' }); } })]));
    el.appendChild(h('p.expl', { text: (mode === 'off' ? 'Éteint : Einstein ne touche à rien. ' : mode === 'appliquer' ? 'Chaque matin, Einstein met de l\'avant ou retire des véhicules du flux Google tout seul, puis la feuille Merchant Center est récrite. ' : 'Chaque matin, Einstein propose les véhicules à mettre de l\'avant ou à retirer du flux Google ; vous approuvez d\'un clic. ') +
      'Garde-fous : au plus ' + (P.maxParJour || 6) + ' véhicules par jour, seulement des véhicules prêts et bien photographiés, jamais un choix fait à la main dans les 14 derniers jours, jamais deux fois le même véhicule en 7 jours. Le prix, les photos et les fiches restent à l\'équipe.' + (P.dernierePasse ? ' Dernière passe : ' + quand(P.dernierePasse) + '.' : '') }));
    if (occupe) { el.appendChild(AMX.chargeur('Einstein relit les résultats et décide', { compact: true })); return el; }
    var J = P.journal || [], props = J.filter(function (e) { return e.etat === 'propose'; }), autres = J.filter(function (e) { return e.etat !== 'propose'; });
    var refs = this.indexRefs();
    var ligne = function (e, avecBoutons) {
      var cls = e.etat === 'fait' ? '.fait' : (e.etat === 'propose' ? '' : '.gris');
      return h('div.prop' + cls, [h('b', { text: (GESTES_PILOTE[e.geste] || e.geste) + (e.refs && e.refs.length ? ' · ' + e.refs.length + ' véhicule' + (e.refs.length > 1 ? 's' : '') : '') + ' — ' + (e.titre || '') }),
        h('div', { text: e.pourquoi || '' }),
        e.refs && e.refs.length ? h('div.refs', e.refs.slice(0, 12).map(function (r) { var x = refs[r] || refs[String(r).toUpperCase()]; return h('button', { type: 'button', title: 'Voir ce véhicule', text: (x && x.vehicule ? x.vehicule.replace(/^\d{4}\s+/, '').slice(0, 30) + ' · ' : '') + r, onclick: function () { self.aller('vehicules', { filtre: '', q: String(r) }); } }); })) : null,
        e.refus && e.refus.length ? h('div.refus', { text: 'Retenu : ' + e.refus.slice(0, 4).join(' ; ') }) : null,
        e.textes && e.textes.titres ? h('details', [h('summary', { text: 'Les textes' }), h('div', { text: 'Titres : ' + e.textes.titres.join(' · ') }), h('div', { text: 'Titres longs : ' + (e.textes.longsTitres || []).join(' · ') }), h('div', { text: 'Descriptions : ' + (e.textes.descriptions || []).join(' · ') })]) : null,
        e.consigne ? h('div.refus', { text: 'Consigne au script Google Ads v3 : ' + ({ a_appliquer: 'à appliquer au prochain passage du script', apercu: 'aperçu (le script simule, à approuver ici)', fait: 'appliquée dans Google Ads', apercu_fait: 'aperçu fait par le script', erreur: 'erreur du script', ignore: 'ignorée' }[e.consigneEtat] || e.consigneEtat || 'écrite') + (e.consigneResultat ? ' — ' + String(e.consigneResultat).slice(0, 200) : '') }) : null,
        h('div.quand', { text: quand(e.le) + ' · ' + (ETATS_PILOTE[e.etat] || e.etat) + (e.par && e.par !== 'einstein' ? ' par ' + e.par : '') + (e.erreur ? ' · ' + e.erreur : '') }),
        avecBoutons ? h('div.boutons', [h('button.btn.primaire', { type: 'button', text: e.consigne ? 'Appliquer dans Google Ads' : 'Appliquer dans le flux', onclick: function () { self.pilote({ quoi: 'appliquer', id: e.id }); } }), h('button.btn', { type: 'button', text: 'Ignorer', onclick: function () { self.pilote({ quoi: 'ignorer', id: e.id }); } })]) : null]);
    };
    if (props.length) { el.appendChild(h('h3', { text: props.length + ' proposition' + (props.length > 1 ? 's' : '') + ' à approuver', style: { fontSize: '18px', margin: '14px 0 0' } })); props.forEach(function (e) { el.appendChild(ligne(e, true)); }); }
    else if (mode !== 'off') el.appendChild(h('p.expl', { text: 'Aucune proposition en attente.' }));
    if (autres.length) el.appendChild(h('details', [h('summary', { text: 'Journal d\'Einstein (' + autres.length + ')' })].concat(autres.slice(0, 20).map(function (e) { return ligne(e, false); }))));
    return el;
  };
  Vue.prototype.pilote = function (corps, confirmation) {
    var self = this, cie = this.cie || 'BMW';
    var go = function () {
      self.piloteEnCours = true; self.rendre();
      corps.action = 'annoncesResultats'; corps.op = 'pilote'; corps.compagnie = cie;
      return AMX.post(corps, { secours: false, delai: 150000 }).then(function (r) {
        if (!r || r.refuse || r.ok === false) throw new Error((r && r.erreur) || 'Refusé');
        if (r.pilote && self.rep && cie === (self.cie || 'BMW')) { self.rep.pilote = r.pilote; Object.keys(cache).forEach(function (k) { if (k.indexOf(cie + '|') === 0) cache[k].rep.pilote = r.pilote; }); }
        if (r.message) AMX.toast(r.message, 'ok', 7000);
        if (corps.quoi === 'appliquer' || corps.quoi === 'lancer') { if (AMX.fluxGoogle && AMX.fluxGoogle.charger) AMX.fluxGoogle.charger(cie, true).then(function (f) { if (!self.detruit) { self.flux = f; self.rendre(); } }).catch(function () {}); }
      }).catch(function (e) { AMX.toast('Einstein pilote : ' + AMX.erreurTexte(e), 'erreur', 10000); }).then(function () { self.piloteEnCours = false; if (!self.detruit) self.rendre(); });
    };
    if (confirmation) AMX.confirmer('Einstein pilote', confirmation, { ok: 'Oui, appliquer tout seul' }).then(function (oui) { if (oui) go(); });
    else go();
  };

  /* ---- 13 semaines, en barres (une seule mesure à la fois) ---- */
  Vue.prototype.zoneSemaines = function () {
    var self = this, d = this.rep || {}, z = h('section.ana-zone');
    var seg = h('div.segment.seg', GRAPHES.map(function (g) {
      return h('button' + (self.graphe === g[0] ? '.actif' : ''), { type: 'button', 'aria-pressed': self.graphe === g[0] ? 'true' : 'false', text: g[1], onclick: function () { self.graphe = g[0]; AMX.memo.ecrire('ann_graphe', g[0]); self.rendre(); } });
    }));
    /* 26 nov. : jour par jour quand la période fait 45 jours ou moins (d.jours du serveur), sinon semaine par semaine. */
    var J = (d.jours || []).length && d.jours.length <= 45 ? d.jours : null;
    z.appendChild(h('h2', [document.createTextNode(J ? 'Jour par jour' : 'Semaine par semaine'), seg]));
    var S = J ? J.map(function (j) { return { du: j.j, impressions: j.impressions, clics: j.clics, cout: j.cout, conversions: j.conversions }; }) : (d.semaines || []), cle = this.graphe, max = 0;
    S.forEach(function (s) { max = Math.max(max, s[cle] || 0); });
    if (!max) { z.appendChild(h('div.ana-vide', { text: 'Les barres paraîtront avec les premiers résultats de Google Ads.' })); return z; }
    var fmt = cle === 'cout' ? argentCourt : (cle === 'conversions' ? dec1 : nbCourt), pas = S.length > 16 ? Math.ceil(S.length / 8) : (S.length > 8 ? 2 : 1);
    z.appendChild(h('div.ana-carte', [
      h('div.ana-cols' + (S.length > 20 ? '.serre' : ''), S.map(function (s, i) {
        var v = s[cle] || 0, haut = Math.max(v ? 2 : 0, Math.round(100 * v / max));
        return h('div.c' + (i === S.length - 1 ? '.der' : ''), { title: (J ? '' : 'Semaine du ') + fmtJour(s.du) + ' : ' + fmt(v) }, [h('div.v', { text: v && S.length <= 20 ? fmt(v) : '' }), h('div.b', { style: { height: haut + '%' } })]);
      })),
      h('div.ana-dates', S.map(function (s, i) { return h('span', { text: i % pas === 0 || i === S.length - 1 ? fmtJour(s.du) : '' }); }))
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
      var base15 = L.filter(function (x) { return x.surSite && x.vedette && x.etat !== 'exclu' && (x.jours || 0) >= 15; }).length;
      t.push(tuile(cpt.sous, 'Sous-exposés', cpt.sous ? 'ambre' : 'vert', 'annoncés, 15 j et +, aucun clic', function () { self.aller('vehicules', { filtre: 'sous', q: '' }); },
        ligneMarche(REP.sansVue, null, this.genre, { nous: base15 ? pct(cpt.sous, base15) + ' sans clic' : '' })));
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
    /* 18 nov. : vues de la fiche sur le site (Google Analytics) et état chez Google (Merchant Center) */
    var pv = this.parVinSite(), mp = this.merchantParId(), pf = this.merchantPerf(), pvm = pf ? (pf.parVin || {}) : null;
    out.forEach(function (x) { x.site = pv ? (pv[x.vin] || { vues: 0, demandes: 0 }) : null; x.gm = mp ? (mp[x.vin] || null) : null; x.mc = pvm ? (pvm[String(x.vin || '').toUpperCase()] || [0, 0, 0, 0]) : null; });
    return tous ? out : out.filter(function (x) { return self.garde(x.genre); });
  };
  Vue.prototype.passe = function (x, fl) {
    if (!fl) return true;
    if (fl === 'sansVue') return !!(x.site && x.surSite && x.etat !== 'exclu' && !x.site.vues && !x.site.demandes);
    if (fl === 'refuse') return !!(x.gm && x.gm[0] === 'refuse');
    if (fl === 'vedette') return !!x.vedette && x.etat !== 'exclu';
    if (fl === 'propose') return !!x.suggestion && !x.vedette && x.etat !== 'exclu';
    if (fl === 'avecClics') return x.s.clics > 0;
    if (fl === 'gratuits') return !!(x.mc && x.mc[2] > 0);
    if (fl === 'sous') return x.surSite && x.vedette && x.etat !== 'exclu' && (x.jours || 0) >= 15 && !x.s.clics;
    if (fl === 'sansConv') return x.s.cout > 0 && !x.s.conversions;
    if (fl === 'photos') return x.surSite && x.etat !== 'exclu' && (x.nbPhotos || 0) < 10;
    if (fl === 'exclu') return x.etat === 'exclu';
    return true;
  };
  /* d'où vient une colonne : Google Analytics (site), Merchant Center (fiches gratuites) ou Google Ads */
  function sourceCol(k) { return k === 'vues' || k === 'demandesSite' ? 'ga' : (k === 'gratuits' ? 'mc' : 'ads'); }
  function valeurV(x, cle) {
    var s = x.s || vide(), r = ratios(s);
    if (cle === 'ctr' || cle === 'cpc' || cle === 'cpa') return r[cle];
    if (cle === 'age') return x.jours;
    if (cle === 'prix') return x.prix;
    if (cle === 'vues') return x.site ? x.site.vues : null;
    if (cle === 'demandesSite') return x.site ? x.site.demandes : null;
    if (cle === 'gratuits') return x.mc ? x.mc[2] : null;
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
      if (fv[0] === 'gratuits' && !self.merchantPerf()) return null;
      return h('button' + (fl === fv[0] ? '.actif' : ''), { type: 'button', 'aria-pressed': fl === fv[0] ? 'true' : 'false', onclick: function () { self.filtreV = fv[0]; self.nV = 100; self.rendre(); } }, [document.createTextNode(fv[1]), h('b', { text: String(n) })]);
    })));
    var inp = h('input.saisie', { type: 'search', placeholder: 'Chercher : modèle, # stock, NIV', value: q });
    inp.addEventListener('input', AMX.debounce ? AMX.debounce(function () { self.q = inp.value; self.nV = 100; self.rendreGrille(); }, 250) : function () { self.q = inp.value; self.rendreGrille(); });
    z.appendChild(h('div.ana-filtres', [inp]));
    if (!ads) z.appendChild(h('p.ana-note', { text: 'Les chiffres de chaque véhicule (impressions, clics, dépense…) paraîtront ici dès que Google aura montré les annonces.' }));
    var notesV = [];
    if (this.merchantPerf()) notesV.push('« Clics gratuits » : clics sur le véhicule dans les fiches gratuites de Google (onglet Shopping, recherche, images), sans payer — Merchant Center');
    if (this.gaDonnees()) notesV.push('« Vues (site) » : fois que la fiche du véhicule a été ouverte sur le site, toutes sources confondues (Google Analytics) ; « Demandes (site) » : formulaires envoyés depuis cette fiche');
    if (notesV.length) z.appendChild(h('p.ana-note', { text: notesV.join('. ') + '.' }));
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
    var th = function (c, titre, num, tel, moy) {
      var actif = self.tri === c;
      return h('th' + (num ? '.n' : '') + (tel ? '.cache-tel' : '') + (moy ? '.cache-moyen' : '') + (actif ? '.trie' : ''), { 'aria-sort': actif ? (self.sens > 0 ? 'ascending' : 'descending') : 'none' },
        [h('button', { type: 'button', title: 'Trier par ' + titre.toLowerCase(), text: titre + (actif ? (self.sens > 0 ? ' ▲' : ' ▼') : ''), onclick: function () { self.trier(c); } })]);
    };
    var tete = h('tr', [th('vehicule', 'Véhicule', false, false), th('age', 'Âge', true, true)].concat(COLS_V.map(function (c) { return th(c[0], c[1], true, c[2], c[3]); })));
    var tb = h('tbody'), tot = vide();
    L.forEach(function (x) { ajoute(tot, x.s); });
    L.slice(0, this.nV).forEach(function (x) { tb.appendChild(self.rangeeVehicule(x, ads)); });
    var rt = ratios(tot), ga = this.gaDonnees(), totGa = { vues: 0, demandesSite: 0, gratuits: 0 }, montreSrc = { ga: ga, mc: !!this.merchantPerf(), ads: ads };
    L.forEach(function (x) { if (x.site) { totGa.vues += x.site.vues || 0; totGa.demandesSite += x.site.demandes || 0; } if (x.mc) totGa.gratuits += x.mc[2] || 0; });
    var pied = h('tr', [h('td', [document.createTextNode('Total · ' + nb(L.length) + ' véhicule' + (L.length > 1 ? 's' : '')), ads ? h('span.tot-tel', { text: chiffresTel(tot) }) : null]), h('td.n.cache-tel')].concat(COLS_V.map(function (c) {
      var src = sourceCol(c[0]);
      var val = src !== 'ads' ? totGa[c[0]] : (c[0] === 'ctr' || c[0] === 'cpc' || c[0] === 'cpa' ? rt[c[0]] : tot[c[0]]);
      return h('td.n' + (c[2] ? '.cache-tel' : '') + (c[3] ? '.cache-moyen' : ''), { text: montreSrc[src] ? texteV(c[0], val) : '—' });
    })));
    g.appendChild(h('div.ana-defile', [h('table.ana-table.vt', [h('thead', [tete]), tb, h('tfoot', [pied])])]));
    if (L.length > this.nV) g.appendChild(h('button.btn.ana-plus', { type: 'button', text: 'Afficher ' + Math.min(100, L.length - this.nV) + ' de plus (' + (L.length - this.nV) + ' restants)', onclick: function () { self.nV += 100; self.rendreGrille(); } }));
  };
  Vue.prototype.rangeeVehicule = function (x, ads) {
    var self = this, s = x.s, past = [], ga = this.gaDonnees(), montreSrc = { ga: ga, mc: !!this.merchantPerf(), ads: ads };
    if (x.vedette && x.etat !== 'exclu') past.push(['violet', 'Annoncé']);
    if (x.etat === 'exclu') past.push(['rouge', 'Exclu' + (x.problemes[0] ? ' : ' + String(x.problemes[0]).replace(/ — .*$/, '') : '')]);
    if (!x.surSite) past.push(['gris', x.vente ? 'Vendu le ' + fmtJour(x.vente.dateVente) : 'Plus sur le site']);
    else if (x.vente) past.push(['vert', 'Vendu le ' + fmtJour(x.vente.dateVente)]);
    if (x.suggestion && !x.vedette && x.etat !== 'exclu') past.push(['bleu', 'Proposé']);
    if (ads && x.vedette && x.surSite && x.etat !== 'exclu' && (x.jours || 0) >= 15 && !s.clics) past.push(['ambre', 'Aucun clic']);
    if (s.cout > 0 && !s.conversions) past.push(['ambre', 'Sans conversion']);
    if (x.surSite && (x.nbPhotos || 0) < 10 && x.etat !== 'exclu') past.push(['gris', (x.nbPhotos || 0) + ' photos']);
    if (x.gm && x.gm[0] === 'refuse') past.push(['rouge', 'Refusé par Google' + (x.gm[1] && x.gm[1][0] ? ' : ' + self.nomProbleme(x.gm[1][0]) : '')]);
    else if (x.gm && x.gm[0] === 'attente') past.push(['gris', 'En examen chez Google']);
    if (x.site && x.surSite && x.etat !== 'exclu' && !x.site.vues && !x.site.demandes) past.push(['ambre', 'Jamais vu sur le site']);
    if (x.site && x.site.demandes) past.push(['vert', x.site.demandes + ' demande' + (x.site.demandes > 1 ? 's' : '') + ' sur la fiche']);
    var det = [x.stock ? '# ' + x.stock : '', NOM_GENRE[x.genre] || '', x.prix ? argent(x.prix) : ''].filter(Boolean).join(' · ');
    var nom = x.url ? h('a.nom', { href: x.url, target: '_blank', rel: 'noopener', title: 'Voir la fiche sur le site', text: x.vehicule || x.vin }) : h('div.nom', { text: x.vehicule || x.vin });
    var cell = h('div.ana-veh', [h('div.ph', [x.photo ? h('img', { src: x.photo, alt: '', loading: 'lazy' }) : h('span', { text: '—' })]),
      h('div', [nom, h('span.sous', { text: det }), ads ? h('span.tel', { text: chiffresTel(s) }) : null, past.length ? h('div.pas', past.map(function (p) { return h('span.ana-pastille.' + p[0], { text: p[1] }); })) : null])]);
    return h('tr', { 'data-ref': refDe(x) }, [h('td', [cell]), h('td.n.cache-tel', { text: x.jours !== null && x.jours !== undefined ? x.jours + ' j' : '—' })].concat(COLS_V.map(function (c) {
      var montre = montreSrc[sourceCol(c[0])], val = valeurV(x, c[0]), z = !montre || !val;
      return h('td.n' + (c[2] ? '.cache-tel' : '') + (c[3] ? '.cache-moyen' : '') + (z ? '.zero' : ''), { text: montre ? texteV(c[0], val) : '—' });
    })));
  };

  /* =============================== Ventes =============================== */
  /* =============================== Conversions (17 nov.) ===============================
     Maxime : « je veux pouvoir voir le détail des conversions ». Par type (appels, demandes du site), jour par jour, par véhicule,
     et les appels venus des annonces (heure, durée, indicatif — jamais le numéro). Les noms des clients ne passent pas par Google :
     les demandes du site sont dans le CRM, les appels dans le téléphone de la concession. */
  Vue.prototype.ongletConversions = function () {
    var self = this, d = this.rep || {}, a = d.ads || {}, cv = d.conv || {}, z = h('section.ana-zone');
    this.elCorps.appendChild(z);
    if (!a.branche) { z.appendChild(h('div.ana-carte.ambre', { text: 'Google Ads n\'est pas encore branché : le détail des conversions paraîtra ici.' })); return; }
    if (!cv.lu) {
      z.appendChild(h('div.ana-carte.ambre', [h('b', 'Le détail arrive au prochain passage du script Google Ads.'), document.createTextNode(' Il passe toutes les heures. Si rien ne paraît d\'ici deux heures, le script de Google Ads est encore l\'ancien : copiez le nouveau (Actions › Branchement Google Ads).')]));
      return;
    }
    var tot = d.totaux || vide(), parG = { appel: 0, demande: 0, autre: 0 };
    (cv.actions || []).forEach(function (x) { parG[catConv(x.categorie)[0]] += x.conversions || 0; });
    var totConv = (cv.actions || []).reduce(function (t, x) { return t + (x.conversions || 0); }, 0);
    var surVeh = (cv.vehicules || []).reduce(function (t, x) { return t + (x.total || 0); }, 0);
    var app = cv.appels || [], dureeMoy = app.length ? app.reduce(function (t, x) { return t + (x.duree || 0); }, 0) / app.length : 0;
    var manques = app.filter(function (x) { return x.statut === 'MISSED'; }).length;
    if (this.genre) z.appendChild(h('p.ana-note', { text: 'Les types, les jours et les appels comptent toute la campagne : Google ne les sépare pas entre neufs et occasions. Seule la liste des véhicules suit le choix « ' + (NOM_GENRE[this.genre] || '') + 's ».' }));
    /* 1. les chiffres */
    var tu = [tuile(dec1(totConv), 'Conversions', totConv ? 'vert' : '', tot.cout && totConv ? argentFin(tot.cout / totConv) + ' chacune' : 'dans la période')];
    GROUPES_CONV.forEach(function (g) { if (parG[g[0]] || g[0] !== 'autre') tu.push(tuile(dec1(parG[g[0]]), g[1], '', g[0] === 'appel' ? 'jugés sérieux par Google' : (g[0] === 'demande' ? 'formulaires envoyés' : ''))); });
    tu.push(tuile(dec1(surVeh), 'Sur un véhicule précis', '', totConv ? 'sur ' + dec1(totConv) + ' — les autres viennent des annonces texte ou du bouton Appeler' : ''));
    if (cv.appelsLu) tu.push(tuile(app.length, 'Appels venus des annonces', manques ? 'ambre' : '', app.length ? 'durée moyenne ' + duree(dureeMoy) + (manques ? ' · ' + manques + ' manqué' + (manques > 1 ? 's' : '') : '') : 'aucun dans la période'));
    z.appendChild(h('div.ana-tuiles', tu));
    if (!totConv && !app.length) { z.appendChild(h('div.ana-vide', { text: 'Aucune conversion ni aucun appel dans cette période.' })); return; }
    /* 2. par type */
    if ((cv.actions || []).length) {
      z.appendChild(h('h2', 'Par type'));
      z.appendChild(h('div.ana-defile', [h('table.ana-table', [h('thead', [h('tr', [h('th', 'Type'), h('th', 'Action dans Google Ads'), h('th.n', 'Conversions'), h('th.n.cache-tel', { text: 'Au jour de la demande', title: 'Google compte une conversion au jour du clic ; cette colonne la compte au jour où l\'appel ou la demande est arrivé.' }), h('th.n.cache-tel', 'Valeur')])]),
        h('tbody', cv.actions.map(function (x) { var c = catConv(x.categorie);
          return h('tr', [h('td', [h('span.ana-pastille.' + (c[0] === 'appel' ? 'vert' : (c[0] === 'demande' ? 'bleu' : 'gris')), { text: c[1] })]),
            h('td', [h('b', { text: nomAction(x.nom) }), nomAction(x.nom) !== x.nom ? h('span.sous', { text: x.nom }) : null]),
            h('td.n', { text: dec1(x.conversions) }), h('td.n.cache-tel', { text: dec1(x.jourConv) }), h('td.n.cache-tel', { text: x.valeur ? argentFin(x.valeur) : '—' })]); }))])]));
    }
    /* 3. jour par jour */
    if ((cv.jours || []).length) {
      var nomsG = {}; (cv.actions || []).forEach(function (x) { nomsG[x.nom] = catConv(x.categorie)[0]; });
      var gs = GROUPES_CONV.filter(function (g) { return parG[g[0]]; });
      z.appendChild(h('h2', 'Jour par jour'));
      z.appendChild(h('div.ana-defile', [h('table.ana-table', [h('thead', [h('tr', [h('th', 'Jour')].concat(gs.map(function (g) { return h('th.n', { text: g[1] }); })).concat([h('th.n', 'Total'), h('th.n.cache-tel', { text: 'Arrivées ce jour-là', title: 'Au jour de l\'appel ou de la demande (Google compte la conversion au jour du clic).' })]))]),
        h('tbody', cv.jours.map(function (j) { var pg = { appel: 0, demande: 0, autre: 0 }; Object.keys(j.actions || {}).forEach(function (n) { pg[nomsG[n] || 'autre'] += j.actions[n]; });
          return h('tr', [h('td', { text: fmtJour(j.date) })].concat(gs.map(function (g) { return h('td.n' + (pg[g[0]] ? '' : '.zero'), { text: dec1(pg[g[0]]) }); }))
            .concat([h('td.n', [h('b', { text: dec1(j.total) })]), h('td.n.cache-tel' + (j.jourConv ? '' : '.zero'), { text: dec1(j.jourConv) })])); }))])]));
    }
    /* 4. les véhicules qui ont amené une conversion */
    var L = this.lignesVehicules(true), parVin = {}; L.forEach(function (x) { parVin[x.vin] = x; });
    var vs = (cv.vehicules || []).filter(function (y) { var x = parVin[y.vin]; return !self.genre || (x && self.garde(x.genre)); });
    if (vs.length) {
      z.appendChild(h('h2', 'Véhicules qui ont amené une conversion'));
      z.appendChild(h('div.ana-defile', [h('table.ana-table', [h('thead', [h('tr', [h('th', 'Véhicule'), h('th', 'Type'), h('th.n', 'Conversions'), h('th.n.cache-tel', 'Clics'), h('th.n.cache-tel', 'Dépense')])]),
        h('tbody', vs.map(function (y) { var x = parVin[y.vin] || {}, s = (d.vehicules || {})[y.vin] || vide();
          var types = Object.keys(y.actions || {}).map(function (n) { var c = catConv(((cv.actions || []).filter(function (q) { return q.nom === n; })[0] || {}).categorie); return c[1] + (y.actions[n] !== 1 ? ' × ' + dec1(y.actions[n]) : ''); }).join(', ');
          return h('tr', [h('td', [h('b', { text: x.vehicule || y.vin }), h('span.sous', { text: [x.stock ? '# ' + x.stock : '', y.vin.slice(-8), (y.dates || []).map(fmtJour).join(', ')].filter(Boolean).join(' · ') })]),
            h('td', { text: types }), h('td.n', { text: dec1(y.total) }), h('td.n.cache-tel', { text: nb(s.clics) }), h('td.n.cache-tel', { text: argentFin(s.cout || 0) })]); }))])]));
    }
    /* 5. les appels */
    if (cv.appelsLu) {
      z.appendChild(h('h2', 'Appels venus des annonces'));
      if (!app.length) z.appendChild(h('div.ana-vide', { text: 'Aucun appel venu des annonces dans cette période.' }));
      else z.appendChild(h('div.ana-defile', [h('table.ana-table', [h('thead', [h('tr', [h('th', 'Quand'), h('th.n', 'Durée'), h('th', 'Région'), h('th', 'Réponse'), h('th.cache-tel', 'Comment')])]),
        h('tbody', app.slice(0, 300).map(function (x) {
          return h('tr', [h('td', { text: heureAppel(x.debut) }), h('td.n', { text: duree(x.duree) }),
            h('td', x.indicatif ? [h('b', { text: x.indicatif }), h('span.sous', { text: REGIONS_TEL[x.indicatif] || '' })] : [h('span.sous', { text: 'indicatif non transmis' })]),
            h('td', [h('span.ana-pastille.' + (x.statut === 'MISSED' ? 'rouge' : 'vert'), { text: x.statut === 'MISSED' ? 'Manqué' : 'Répondu' })]),
            h('td.cache-tel', { text: (x.type === 'HIGH_END_MOBILE_SEARCH' ? 'Bouton Appeler de l\'annonce' : (x.type === 'MANUALLY_DIALED' ? 'Numéro composé' : (x.type || ''))) + (x.emplacement === 'LANDING_PAGE' ? ' (site)' : '') })]); }))])]));
      if (app.length > 300) z.appendChild(h('p.ana-note', { text: 'Les 300 plus récents sur ' + app.length + '.' }));
    }
    z.appendChild(h('p.ana-note', { text: 'Google compte une conversion au jour du clic sur l\'annonce. « Appels jugés sérieux » : Google garde les appels qu\'il juge sérieux (durée, contenu) ; un appel court ou manqué peut ne pas compter. Les noms des clients ne passent jamais par Google : les demandes du site arrivent au CRM, les appels au téléphone de la concession (comparez l\'heure et l\'indicatif).' }));
  };

  Vue.prototype.ongletVentes = function () {
    var d = this.rep || {}, z = h('section.ana-zone'), ads = this.donneesAds();
    this.elCorps.appendChild(z);
    if (d.ventesErreur) { z.appendChild(h('div.ana-vide', { text: d.ventesErreur })); return; }
    var s = this.statsVentes(), L = s.L;
    if (!L.length) { z.appendChild(h('div.ana-vide', { text: 'Aucune vente dans la période' + (this.genre ? ' pour ce genre' : '') + '.' })); return; }
    var tu = [tuile(s.jT !== null ? Math.round(s.jT) + ' j' : '—', 'Jours à la vente', '', 'médiane de toutes les ventes', null, ligneMarche(REP.jours, s.jT, this.genre))];
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
    z.appendChild(this.carteSourcesGoogle());   /* 18 nov. */
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
    var pfx = this.merchantPerf();
    if (pfx) res.push({ 'Mesure': 'Clics gratuits sur nos véhicules (Merchant Center, tous genres)', 'Valeur': pfx.totaux.clicsGratuit }, { 'Mesure': 'Fois vus sans payer (Merchant Center)', 'Valeur': pfx.totaux.imprGratuit }, { 'Mesure': 'Clics d\'annonces (Merchant Center)', 'Valeur': pfx.totaux.clicsAds });
    var veh = this.lignesVehicules().map(function (v) { var rv = ratios(v.s); return { 'Vues de la fiche (site)': v.site ? v.site.vues : '', 'Demandes (site)': v.site ? v.site.demandes : '', 'Clics gratuits (Google)': v.mc ? v.mc[2] : '', 'Vu sans payer (Google)': v.mc ? v.mc[3] : '', 'Google (Merchant Center)': v.gm ? ({ approuve: 'approuvé', refuse: 'refusé', attente: 'en examen', inconnu: '' }[v.gm[0]] || '') + (v.gm[1] && v.gm[1].length ? ' — ' + v.gm[1].join(', ') : '') : '', 'NIV': v.vin, '# stock': v.stock || '', 'Véhicule': v.vehicule || '', 'Genre': NOM_GENRE[v.genre] || '', 'Âge (jours)': v.jours === null || v.jours === undefined ? '' : v.jours, 'Prix': v.prix || '', 'Photos': v.nbPhotos || '', 'Mis de l\'avant': v.vedette ? 'oui' : 'non', 'Impressions': v.s.impressions, 'Clics': v.s.clics, 'Taux de clic (%)': rv.ctr === null ? '' : Math.round(rv.ctr * 100) / 100, 'Dépense': Math.round(v.s.cout * 100) / 100, 'Coût par clic': rv.cpc === null ? '' : Math.round(rv.cpc * 100) / 100, 'Conversions': v.s.conversions, 'Coût par conversion': rv.cpa === null ? '' : Math.round(rv.cpa * 100) / 100, 'Sur le site': v.surSite ? 'oui' : 'non', 'Vendu le': v.vente ? v.vente.dateVente : '' }; });
    var ven = (d.ventes || []).map(function (v) { var o = { 'Vendue le': v.dateVente, 'NIV': v.vin, '# stock': v.stock, 'Véhicule': v.vehicule, 'Type': v.type === 'usage' ? 'Occasion' : 'Neuf', 'Jours en stock': v.joursVente === undefined ? '' : v.joursVente, 'Impressions avant la vente': v.pub ? v.pub.impressions : 0, 'Clics avant la vente': v.pub ? v.pub.clics : 0, 'Dépense avant la vente': v.pub ? v.pub.cout : 0, 'Après un clic': v.influence ? 'oui' : 'non' }; if (d.montants) o['Profit brut'] = typeof v.profit === 'number' ? v.profit : ''; return o; });
    var sem = (d.semaines || []).map(function (w) { return { 'Semaine du': w.du, 'Au': w.au, 'Impressions': w.impressions, 'Clics': w.clics, 'Dépense': w.cout, 'Conversions': w.conversions }; });
    var g = this.genre, rep = REPERES.map(function (rp) { var v = valeurRep(rp, g); return { 'Indicateur': rp.titre, 'Repère': v.texte + (rp.suffixe || ''), 'Équivalent $ CA': approxCad(rp, v).replace(/^ \(≈ |\)$/g, ''), 'Portée': rp.portee, 'Source': rp.source, 'Date': rp.date, 'Lien': rp.lien }; });
    rep.push({ 'Indicateur': 'Note', 'Repère': 'Google ne publie aucun repère officiel pour les annonces de véhicules : ce sont des garde-fous, pas des cibles.' });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(res), 'Chiffres');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rep), 'Repères du marché');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(veh.length ? veh : [{ '': 'aucun véhicule' }]), 'Véhicules');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ven.length ? ven : [{ '': 'aucune vente' }]), 'Ventes');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sem), 'Semaines');
    var cv = d.conv || {};
    if (cv.lu) {
      var kt = (cv.actions || []).map(function (x) { return { 'Type': catConv(x.categorie)[1], 'Action': nomAction(x.nom), 'Nom dans Google Ads': x.nom, 'Conversions': x.conversions, 'Au jour de la demande': x.jourConv, 'Valeur': x.valeur }; });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kt.length ? kt : [{ '': 'aucune conversion' }]), 'Conversions');
      var kj = (cv.jours || []).map(function (j) { var o = { 'Jour': j.date }; Object.keys(j.actions || {}).forEach(function (n) { o[nomAction(n)] = j.actions[n]; }); o['Total'] = j.total; o['Arrivées ce jour-là'] = j.jourConv; return o; });
      if (kj.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kj), 'Conversions par jour');
      var ka = (cv.appels || []).map(function (x) { return { 'Début': x.debut, 'Durée (s)': x.duree, 'Indicatif': x.indicatif, 'Région': REGIONS_TEL[x.indicatif] || '', 'Réponse': x.statut === 'MISSED' ? 'Manqué' : 'Répondu', 'Comment': x.type === 'HIGH_END_MOBILE_SEARCH' ? 'Bouton Appeler de l\'annonce' : (x.type === 'MANUALLY_DIALED' ? 'Numéro composé' : x.type) }; });
      if (cv.appelsLu) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ka.length ? ka : [{ '': 'aucun appel' }]), 'Appels');
    }
    /* 18 nov. : site web, fiche Google, Merchant Center */
    var G = this.gaRep();
    if (G && this.gaDonnees()) {
      var gt = G.ga.totaux;
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ 'Mesure': 'Visites', 'Valeur': gt.sessions }, { 'Mesure': 'Visiteurs', 'Valeur': gt.utilisateurs }, { 'Mesure': 'Nouveaux visiteurs', 'Valeur': gt.nouveaux },
        { 'Mesure': 'Visites engagées', 'Valeur': gt.engagees }, { 'Mesure': 'Demandes envoyées', 'Valeur': gt.demandes }, { 'Mesure': 'Vues de fiches de véhicules', 'Valeur': G.ga.fiches.vues },
        { 'Mesure': 'Visites payées', 'Valeur': gt.payant }, { 'Mesure': 'Recherche Google gratuite', 'Valeur': gt.naturel }, { 'Mesure': 'En vente, jamais vus', 'Valeur': G.ga.fiches.sansVue.length }]
        .concat(G.ga.canaux.map(function (c) { return { 'Mesure': 'Canal — ' + c.nom, 'Valeur': c.sessions, 'Demandes': c.demandes, 'Engagées': c.engagees }; }))), 'Site web');
      if (G.ga.jours.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(G.ga.jours.map(function (j) { return { 'Jour': j.jour, 'Visites': j.sessions, 'Demandes': j.demandes, 'Visites payées': j.payant, 'Recherche gratuite': j.naturel }; })), 'Site par jour');
    }
    if (G && G.fiche && G.fiche.fiches.length) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(G.fiche.fiches.map(function (f) { var a2 = f.totaux; return { 'Fiche': f.nom, 'Vues': a2.vues, 'Recherche': a2.rechercheMobile + a2.rechercheOrdi, 'Maps': a2.mapsMobile + a2.mapsOrdi, 'Appels': a2.appels, 'Clics vers le site': a2.siteWeb, 'Itinéraires': a2.itineraires, 'Messages': a2.messages }; })
        .concat((G.fiche.mots || []).map(function (m) { return { 'Fiche': 'Recherche : ' + m.mot, 'Vues': m.valeur || (m.seuil ? '< ' + m.seuil : '') }; }))), 'Fiche Google');
      var ctl = []; G.fiche.fiches.forEach(function (f) { (f.controles || []).forEach(function (c) { ctl.push({ 'Fiche': f.titre || f.nom, 'Point': c.titre, 'État': { vert: 'correct', ambre: 'à améliorer', rouge: 'à corriger' }[c.ton] || c.ton, 'Quoi faire': c.quoi }); }); });
      if (ctl.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ctl), 'Fiche à compléter');
    }
    if (G && G.merchant && G.merchant.n) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((G.merchant.problemes || []).map(function (pb) { return { 'Problème': pb.description || pb.code, 'Code': pb.code, 'Véhicules': pb.n, 'Attribut': pb.attribut, 'Détail': pb.detail, 'NIV': (pb.ids || []).join(', ') }; }).concat([{ 'Problème': 'Total : ' + G.merchant.n + ' véhicules — ' + G.merchant.approuve + ' approuvés, ' + G.merchant.refuse + ' refusés, ' + G.merchant.attente + ' en examen' }])), 'Merchant Center');
    var e = d.einstein;
    if (e) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ 'Einstein': e.resume }].concat((e.actions || []).map(function (a, i) { return { 'Einstein': (i + 1) + '. ' + a.titre + ' — ' + a.pourquoi + (a.vehicules.length ? ' (' + a.vehicules.join(', ') + ')' : '') }; }))), 'Einstein');
    XLSX.writeFile(wb, 'analyse-annonces-' + String(d.compagnie || 'BMW').toLowerCase() + '-' + p.du + '-' + p.au + '.xlsx');
  };

  /* =============================== Site web et fiche Google (18 nov.) ===============================
     Maxime : « revois le module de marketing avec Google Analytics et améliore la qualité de notre présence sur Google et la qualité
     de l'analyse ». GoogleAnalytics.gs lit (lecture seule) Google Analytics des sites, les statistiques des fiches Google et l'état
     de chaque véhicule dans Merchant Center ; GET ?googleAnalytics=1&compagnie=&du=&au=. */
  var NOMS_COMPTES = { nous: 'Notre campagne (Google Ads 958-027-4646)', axifuge: 'Axifuge (l\'agence)', autre: 'Autre compte Google Ads' };
  var URL_FICHES = 'https://business.google.com/locations';
  var cacheGa = {};
  function chargerGa(cie, du, au, force) {
    var cle = cie + '|' + du + '|' + au, c = cacheGa[cle];
    if (!force && c && Date.now() - c.le < AMX.dureeCopie(300000)) return Promise.resolve(c.rep);
    return AMX.get({ googleAnalytics: '1', compagnie: cie, du: du, au: au }, { delai: 90000, secours: false, discret: true }).then(function (d) {
      if (d && d.refuse) return { erreur: d.erreur || 'Accès refusé.' };
      if (!d || d.ok === false) return { erreur: (d && d.erreur) || 'Lecture impossible.' };
      if (!d.ga || !d.fiche) return { pasAJour: true };
      cacheGa[cle] = { rep: d, le: Date.now() };
      return d;
    }).catch(function (e) { return { erreur: AMX.erreurTexte(e) }; });
  }
  Vue.prototype.gaRep = function () { var g = this.ga || {}; return g.ga ? g : null; };
  Vue.prototype.gaDonnees = function () { var g = this.gaRep(); return !!(g && g.ga.branche && (g.ga.sites || []).some(function (s) { return s.dernier; })); };
  Vue.prototype.parVinSite = function () { var g = this.gaRep(); return g && this.gaDonnees() ? (g.ga.fiches.parVin || {}) : null; };
  /* 18 nov. : clics et impressions par véhicule dans Google (Merchant Center, rapport des produits) : [clics annonces, impressions annonces, clics gratuits, impressions gratuites] */
  Vue.prototype.merchantPerf = function () { var g = this.gaRep(); return g && g.merchant && g.merchant.perf && g.merchant.perf.lu ? g.merchant.perf : null; };
  Vue.prototype.merchantParId = function () { var g = this.gaRep(); return g && g.merchant && g.merchant.n ? (g.merchant.parId || {}) : null; };
  Vue.prototype.nomProbleme = function (code) {
    var g = this.gaRep(), p = g && g.merchant ? (g.merchant.problemes || []).filter(function (x) { return x.code === code; })[0] : null;
    return p ? (p.description || code) : String(code || '').replace(/_/g, ' ');
  };
  function sommeFiche(F) { var t = { vues: 0, appels: 0, siteWeb: 0, itineraires: 0, messages: 0, recherche: 0, maps: 0 }, pr = { vues: 0, appels: 0, siteWeb: 0, itineraires: 0 };
    ((F && F.fiches) || []).forEach(function (f) { var a = f.totaux, b = f.precedent || {};
      t.vues += a.vues; t.appels += a.appels; t.siteWeb += a.siteWeb; t.itineraires += a.itineraires; t.messages += a.messages || 0;
      t.recherche += a.rechercheMobile + a.rechercheOrdi; t.maps += a.mapsMobile + a.mapsOrdi;
      pr.vues += b.vues || 0; pr.appels += b.appels || 0; pr.siteWeb += b.siteWeb || 0; pr.itineraires += b.itineraires || 0; });
    return { t: t, pr: pr };
  }
  /* Une série jour par jour, regroupée par semaine quand la période dépasse 45 jours. */
  function serie(jours, cles) {
    if (jours.length <= 45) return jours.map(function (j) { var o = { du: j.jour, etiquette: fmtJour(j.jour) }; cles.forEach(function (k) { o[k] = j[k] || 0; }); return o; });
    var out = [];
    for (var i = 0; i < jours.length; i += 7) {
      var bloc = jours.slice(i, i + 7), o = { du: bloc[0].jour, etiquette: fmtJour(bloc[0].jour) };
      cles.forEach(function (k) { o[k] = bloc.reduce(function (s, j) { return s + (j[k] || 0); }, 0); });
      out.push(o);
    }
    return out;
  }
  function barres(S, cle, fmt, titre) {
    var max = 0; S.forEach(function (s) { max = Math.max(max, s[cle] || 0); });
    if (!max) return h('div.ana-vide', { text: 'Rien à montrer pour cette période.' });
    var pas = S.length > 16 ? Math.ceil(S.length / 8) : (S.length > 8 ? 2 : 1);
    return h('div.ana-carte', [
      h('div.ana-cols' + (S.length > 20 ? '.serre' : ''), S.map(function (s, i) {
        var v = s[cle] || 0, haut = Math.max(v ? 2 : 0, Math.round(100 * v / max));
        return h('div.c' + (i === S.length - 1 ? '.der' : ''), { title: (titre ? titre + ' — ' : '') + s.etiquette + ' : ' + fmt(v) }, [h('div.v', { text: v && S.length <= 20 ? fmt(v) : '' }), h('div.b', { style: { height: haut + '%' } })]);
      })),
      h('div.ana-dates', S.map(function (s, i) { return h('span', { text: i % pas === 0 || i === S.length - 1 ? s.etiquette : '' }); }))
    ]);
  }

  /* ---- la ligne d'état de Google Analytics : elle dit pourquoi un chiffre manque ---- */
  Vue.prototype.zoneEtatGa = function () {
    var self = this, G = this.gaRep(), g0 = this.ga || {}, cls, txt, actions = [];
    if (g0.pasAJour) { cls = 'ambre'; txt = [h('b', 'Le script n\'est pas à jour.'), document.createTextNode(' Déployez la version qui contient GoogleAnalytics.gs : le site web et la fiche Google paraîtront ici.')]; }
    else if (g0.erreur && !G) { cls = 'ambre'; txt = [h('b', 'Google Analytics n\'a pas pu être lu.'), document.createTextNode(' ' + g0.erreur)]; }
    else if (!G || !G.ga.branche) {
      cls = 'ambre'; txt = [h('b', 'Google Analytics n\'est pas encore branché.'), document.createTextNode(' Une seule autorisation, connecté comme mallard@groupeautomax.com (le compte qui a accès aux sites dans Google Analytics) : ScanAutomax pourra lire, jamais changer.')];
      if (G && G.ga.peutBrancher) actions.push(h('button.btn.primaire', { type: 'button', text: 'Brancher Google Analytics', onclick: function () { self.brancherGa(); } }));
      else txt.push(document.createTextNode(' La propriétaire ou un administrateur du groupe le branche.'));
    } else {
      var err = G.ga.sites.filter(function (s) { return s.erreur; }), lu = G.ga.sites.filter(function (s) { return s.dernier; });
      if (err.length && !lu.length) { cls = 'ambre'; txt = [h('b', 'Google Analytics est branché, mais la lecture a échoué.'), document.createTextNode(' ' + err[0].nom + ' : ' + err[0].erreur)]; }
      else if (!lu.length) { cls = 'bleu'; txt = [h('b', 'Google Analytics est branché.'), document.createTextNode(' La première lecture se fait dans l\'heure (ou « Relire maintenant »).')]; }
      else {
        cls = err.length ? 'ambre' : 'vert';
        txt = [h('b', 'Google Analytics à jour'), document.createTextNode(' — ' + lu.map(function (s) { return s.nom; }).join(', ') + ', lu le ' + quand(lu[0].luLe) + '. '),
          h('span.doux', { text: 'Les chiffres d\'hier et d\'aujourd\'hui bougent encore : Google les finalise en 24 à 48 h.' })];
        if (err.length) txt.push(h('span.doux', { text: ' ' + err.map(function (s) { return s.nom + ' : ' + s.erreur; }).join(' · ') }));
      }
      actions.push(h('button.btn', { type: 'button', text: this.relectureGa ? 'Lecture…' : 'Relire maintenant', disabled: !!this.relectureGa, onclick: function () { self.relireGa(); } }));
    }
    return h('div.ana-statut.' + cls, [h('span.rond'), h('div.t', txt)].concat(actions));
  };
  Vue.prototype.brancherGa = function () {
    var self = this;
    AMX.post({ action: 'googleAnalytics', op: 'lien', compagnie: this.cie || 'BMW' }, { secours: false }).then(function (r) {
      if (!r || r.refuse || r.ok === false) throw new Error((r && r.erreur) || 'Refusé');
      if (!r.url) throw new Error(SCRIPT_PAS_A_JOUR.replace('AnnoncesAnalyse.gs', 'GoogleAnalytics.gs'));
      AMX.modale({ titre: 'Brancher Google Analytics', corps: h('div', [
        h('p', { text: 'Ouvrez le lien connecté comme ' + (r.compte || 'mallard@groupeautomax.com') + ' (le compte qui a accès aux sites dans Google Analytics), puis cliquez « Autoriser ». ScanAutomax pourra seulement lire les statistiques.' }),
        h('p', { text: 'Le lien est bon ' + (r.valide || 30) + ' minutes. Revenez ensuite ici et cliquez « Relire maintenant ».' })]),
        boutons: [{ texte: 'Fermer' }, { texte: 'Ouvrir le lien', classe: 'primaire', action: function () { window.open(r.url, '_blank', 'noopener'); } }] });
    }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur', 9000); });
  };
  Vue.prototype.relireGa = function () {
    var self = this, p = periodeDates(this.periode), cie = this.cie || 'BMW';
    if (this.relectureGa) return; this.relectureGa = true; this.rendre();
    AMX.post({ action: 'googleAnalytics', op: 'relire', compagnie: cie }, { secours: false, delai: 240000 }).then(function (r) {
      if (!r || r.refuse || r.ok === false) throw new Error((r && r.erreur) || 'Refusé');
      AMX.toast(r.message || 'Relu.', (r.sources || []).some(function (s) { return s.erreur; }) ? 'erreur' : 'ok', 9000);
    }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur', 9000); }).then(function () {
      Object.keys(cacheGa).forEach(function (k) { if (k.indexOf(cie + '|') === 0) delete cacheGa[k]; });
      return chargerGa(cie, p.du, p.au, true);
    }).then(function (g) { self.relectureGa = false; if (self.detruit) return; self.ga = g; self.rendre(); });
  };

  /* ---- Résumé : de Google à la vente ---- */
  Vue.prototype.zoneParcours = function () {
    var self = this, d = this.rep || {}, G = this.gaRep(), z = h('section.ana-zone'), ga = this.gaDonnees();
    var F = G ? G.fiche : null, sf = sommeFiche(F), t = this.totauxGenre().t, s = this.statsVentes();
    var appelsAds = 0; ((d.conv || {}).actions || []).forEach(function (x) { if (catConv(x.categorie)[0] === 'appel') appelsAds += x.conversions || 0; });
    var etapes = [
      ['Vues de la fiche Google', F && F.fiches.length ? nbCourt(sf.t.vues) : '—', 'recherche et Maps, gratuit', function () { self.aller('ficheGoogle'); }],
      ['Impressions des annonces', this.donneesAds() ? nbCourt(t.impressions) : '—', this.merchantPerf() ? 'Google Ads · + ' + nbCourt(this.merchantPerf().totaux.imprGratuit) + ' gratuites' : 'Google Ads', null],
      ['Visites du site', ga ? nbCourt(G.ga.totaux.sessions) : '—', ga ? pct(G.ga.totaux.payant, G.ga.totaux.sessions) + ' payées' : 'Google Analytics', function () { self.aller('site'); }],
      ['Vues de fiches de véhicules', ga ? nbCourt(G.ga.fiches.vues) : '—', 'pages des véhicules du site', function () { self.aller('vehicules', { filtre: '', q: '' }); }],
      ['Demandes et appels', ga || appelsAds || (F && F.fiches.length) ? nb((ga ? G.ga.totaux.demandes : 0) + sf.t.appels + Math.round(appelsAds)) : '—',
        [ga ? nb(G.ga.totaux.demandes) + ' formulaire' + (G.ga.totaux.demandes > 1 ? 's' : '') : '', F && F.fiches.length ? nb(sf.t.appels) + ' appel' + (sf.t.appels > 1 ? 's' : '') + ' (fiche)' : '', appelsAds ? nb(appelsAds) + ' (annonces)' : ''].filter(Boolean).join(' · ') || 'formulaires, appels', function () { self.aller(ga ? 'site' : 'conversions'); }],
      ['Ventes', nb(s.L.length), 'Livre des ventes', function () { self.aller('ventes'); }]
    ];
    z.appendChild(h('h2', 'De Google à la vente'));
    z.appendChild(h('div.ana-parcours', etapes.map(function (e, i) {
      return h((e[3] ? 'button' : 'div') + '.ana-etape' + (e[1] === '—' ? '.zero' : ''), e[3] ? { type: 'button', onclick: e[3] } : {}, [
        h('span.lib', { text: e[0] }), h('b', { text: e[1] }), h('em', { text: e[2] }), i < etapes.length - 1 ? h('i.fl', { 'aria-hidden': 'true', text: '›' }) : null]);
    })));
    if (!ga || !(F && F.fiches.length)) z.appendChild(h('p.ana-note', { text: '« — » : ' + [!ga ? 'Google Analytics' : '', !(F && F.fiches.length) ? 'la fiche Google' : ''].filter(Boolean).join(' et ') + ' pas encore lu' + (!ga && !(F && F.fiches.length) ? 's' : '') + ' — voir les onglets Site web et Fiche Google.' }));
    return z;
  };

  /* ---- Résumé : être mieux vu sur Google — ce qui est à corriger ---- */
  Vue.prototype.zonePresence = function () {
    var self = this, G = this.gaRep(), z = h('section.ana-zone'), items = [];
    var item = function (cls, titre, texte, bouton) { items.push(h('div.ana-point.' + cls, [h('span.rond'), h('div', [h('b', { text: titre }), texte ? h('p', { text: texte }) : null]), bouton || null])); };
    if (!G) { if ((this.ga || {}).pasAJour) item('ambre', 'Le script n\'est pas à jour', 'Déployez la version qui contient GoogleAnalytics.gs.'); }
    else {
      var g = G.ga, m = G.merchant || {}, F = G.fiche || {};
      if (!g.branche) item('ambre', 'Brancher Google Analytics', 'Sans lui, on ne voit pas ce que font les visiteurs une fois sur le site (visites, fiches de véhicules vues, demandes).',
        g.peutBrancher ? h('button.btn.primaire', { type: 'button', text: 'Brancher', onclick: function () { self.brancherGa(); } }) : null);
      if (m.n && m.refuse) {
        var p0 = (m.problemes || [])[0];
        item('rouge', m.refuse + ' véhicule' + (m.refuse > 1 ? 's' : '') + ' refusé' + (m.refuse > 1 ? 's' : '') + ' par Google', p0 ? 'Raison la plus fréquente : ' + (p0.description || p0.code) + (p0.n > 1 ? ' (' + p0.n + ' véhicules)' : '') + '.' + (p0.detail ? ' ' + p0.detail : '') : 'Ces véhicules ne paraissent pas dans les annonces.',
          h('button.btn', { type: 'button', text: 'Voir', onclick: function () { self.aller('vehicules', { filtre: 'refuse', q: '' }); } }));
      }
      if (m.n && m.attente) item('bleu', m.attente + ' véhicule' + (m.attente > 1 ? 's' : '') + ' en examen chez Google', 'Google vérifie chaque nouveau véhicule avant de l\'annoncer (quelques heures à quelques jours).');
      if (this.gaDonnees() && g.fiches.sansVue.length) {
        item('ambre', g.fiches.sansVue.length + ' véhicule' + (g.fiches.sansVue.length > 1 ? 's' : '') + ' en vente sans aucune vue sur le site', 'Dans la période, personne n\'a ouvert leur fiche sur le site (sur ' + g.fiches.nFlux + ' en vente). Les mettre de l\'avant dans les annonces, revoir le prix ou les photos.',
          h('button.btn', { type: 'button', text: 'Voir', onclick: function () { self.aller('vehicules', { filtre: 'sansVue', q: '' }); } }));
      }
      if (this.gaDonnees() && g.totaux.sessions >= 300 && g.totaux.demandes / g.totaux.sessions < 0.004) {
        item('ambre', 'Peu de demandes pour le nombre de visites', pct(g.totaux.demandes, g.totaux.sessions, 2) + ' des visites envoient une demande. Vérifier que les formulaires des fiches marchent et que le bouton de demande se voit sur téléphone.');
      }
      var pc = g.parCompte || {};
      if (pc.nous && pc.axifuge && pc.nous.sessions && pc.axifuge.sessions) {
        item('bleu', 'Deux campagnes Google Ads amènent des visites sur ce site', 'Notre campagne : ' + nb(pc.nous.sessions) + ' visites · Axifuge : ' + nb(pc.axifuge.sessions) + ' visites. Sur les mêmes véhicules, elles peuvent enchérir l\'une contre l\'autre.',
          h('button.btn', { type: 'button', text: 'Comparer', onclick: function () { self.aller('site'); } }));
      }
      (F.fiches || []).forEach(function (f) {
        var nv = (f.controles || []).filter(function (c) { return c.ton !== 'vert'; });
        if (!nv.length) return;
        var rouge = nv.some(function (c) { return c.ton === 'rouge'; });
        item(rouge ? 'rouge' : 'ambre', 'Fiche Google « ' + (f.titre || f.nom) + ' » : ' + nv.length + ' point' + (nv.length > 1 ? 's' : '') + ' à compléter',
          nv.slice(0, 3).map(function (c) { return c.titre; }).join(' · ') + (nv.length > 3 ? ' · et ' + (nv.length - 3) + ' autre' + (nv.length - 3 > 1 ? 's' : '') : '') + '. Une fiche complète est montrée pour plus de recherches.',
          h('button.btn', { type: 'button', text: 'Voir', onclick: function () { self.aller('ficheGoogle'); } }));
      });
      if (F.erreur) item('ambre', 'Les statistiques de la fiche Google ne se lisent pas', F.erreur);
      else if (F.fiches && F.fiches.length) {
        var sf = sommeFiche(F);
        if (sf.pr.appels >= 10 && sf.t.appels < sf.pr.appels * 0.8) item('ambre', 'Moins d\'appels venus de la fiche Google', nb(sf.t.appels) + ' appels contre ' + nb(sf.pr.appels) + ' la période d\'avant. Vérifier les heures d\'ouverture, les photos et les réponses aux avis.',
          h('button.btn', { type: 'button', text: 'Voir', onclick: function () { self.aller('ficheGoogle'); } }));
      }
    }
    z.appendChild(h('h2', 'Être mieux vu sur Google'));
    if (!items.length) { z.appendChild(h('div.ana-point.vert', [h('span.rond'), h('div', [h('b', 'Rien à corriger pour l\'instant'), h('p', { text: 'Aucun véhicule refusé, et chaque véhicule en vente a été vu sur le site.' })])])); return z; }
    items.forEach(function (x) { z.appendChild(x); });
    return z;
  };

  /* =============================== Onglet Site web =============================== */
  Vue.prototype.ongletSite = function () {
    var self = this, G = this.gaRep(), z = h('section.ana-zone'), d = this.rep || {};
    this.elCorps.appendChild(z);
    z.appendChild(this.zoneEtatGa());
    if (!this.gaDonnees()) return;
    var g = G.ga, t = g.totaux, pr = this.periode === 'tout' ? null : g.precedent, evt = (g.sites.filter(function (s) { return s.evtDemande; })[0] || {}).evtDemande || '';
    var v = function (a, b, sens) { return pr ? variation(a, b, sens) : null; };
    var pv = g.fiches.parVin || {}, nVus = Object.keys(pv).filter(function (k) { return pv[k].vues; }).length;
    z.appendChild(h('div.ana-kgroupe', [h('h2', [document.createTextNode('Le site web'), h('small', { text: g.sites.map(function (s) { return s.nom; }).join(' · ') + ' · Google Analytics · ' + (nomPeriode(this.periode) || '').toLowerCase() })]),
      h('div.ana-kpis', [
        kpi(nb(t.sessions), 'Visites', { zero: !t.sessions, v: v(t.sessions, pr && pr.sessions, 1), note: nb(t.utilisateurs) + ' visiteurs, dont ' + nb(t.nouveaux) + ' nouveaux' }),
        kpi(pct(t.engagees, t.sessions), 'Visites engagées', { zero: !t.sessions, note: 'restés 10 s et plus, ou 2 pages et plus' }),
        kpi(nb(t.demandes), 'Demandes envoyées', { zero: !t.demandes, classe: t.demandes ? 'vert' : '', v: v(t.demandes, pr && pr.demandes, 1), note: evt ? 'formulaires du site (événement « ' + evt + ' »)' : 'aucun événement de demande trouvé' }),
        kpi(t.sessions ? pct(t.demandes, t.sessions, 2) : '—', 'Taux de demande', { zero: !t.demandes, note: 'demandes ÷ visites' }),
        kpi(nb(g.fiches.vues), 'Vues de fiches de véhicules', { zero: !g.fiches.vues, note: nb(nVus) + ' véhicule' + (nVus > 1 ? 's' : '') + ' vu' + (nVus > 1 ? 's' : '') + ' · voir le tableau ›', onclick: function () { self.aller('vehicules', { filtre: '', q: '' }); } }),
        kpi(nb(g.fiches.sansVue.length), 'En vente, jamais vus', { zero: false, classe: g.fiches.sansVue.length ? 'ambre' : 'vert', note: 'sur ' + nb(g.fiches.nFlux) + ' fiches en vente' + (g.fiches.sansVue.length ? ' · voir ›' : ''),
          onclick: g.fiches.sansVue.length ? function () { self.aller('vehicules', { filtre: 'sansVue', q: '' }); } : null,
          marche: ligneMarche(REP.sansVue, null, this.genre, { nous: g.fiches.nFlux ? pct(g.fiches.sansVue.length, g.fiches.nFlux) + ' sur la période' : '' }) }),
        kpi(nb(t.payant), 'Visites payées', { zero: !t.payant, v: v(t.payant, pr && pr.payant, 0), note: pct(t.payant, t.sessions) + ' des visites (annonces Google, Performance Max…)' }),
        kpi(nb(t.naturel), 'Recherche Google gratuite', { zero: !t.naturel, v: v(t.naturel, pr && pr.naturel, 1), note: pct(t.naturel, t.sessions) + ' des visites' })
      ])]));
    /* jour par jour */
    var cleG = this.grapheSite || 'sessions';
    var segG = h('div.segment.seg', [['sessions', 'Visites'], ['demandes', 'Demandes'], ['payant', 'Visites payées'], ['naturel', 'Recherche gratuite']].map(function (x) {
      return h('button' + (cleG === x[0] ? '.actif' : ''), { type: 'button', 'aria-pressed': cleG === x[0] ? 'true' : 'false', text: x[1], onclick: function () { self.grapheSite = x[0]; self.rendre(); } });
    }));
    var S = serie(g.jours, ['sessions', 'demandes', 'payant', 'naturel']);
    z.appendChild(h('div.ana-zone', [h('h2', [document.createTextNode(S.length && g.jours.length > 45 ? 'Semaine par semaine' : 'Jour par jour'), segG]), barres(S, cleG, nbCourt)]));
    /* par canal */
    var tot = t.sessions || 0;
    z.appendChild(h('div.ana-zone', [h('h2', 'D\'où viennent les visiteurs'), h('div.ana-defile', [h('table.ana-table', [
      h('thead', [h('tr', [h('th', 'Canal'), h('th.n', 'Visites'), h('th.n', 'Part'), h('th.n.cache-tel', 'Engagées'), h('th.n', 'Demandes'), h('th.n.cache-tel', 'Taux de demande'), h('th.n.cache-tel', 'vs avant')])]),
      h('tbody', g.canaux.filter(function (c) { return c.sessions || c.demandes; }).map(function (c) {
        var vv = pr ? variation(c.sessions, c.avant.sessions, 1) : null;
        return h('tr', [h('td', [h('b', { text: c.nom }), c.payant ? h('span.ana-pastille.violet', { text: 'payant' }) : null]), h('td.n', { text: nb(c.sessions) }), h('td.n', { text: pct(c.sessions, tot) }),
          h('td.n.cache-tel', { text: pct(c.engagees, c.sessions) }), h('td.n' + (c.demandes ? '' : '.zero'), { text: nb(c.demandes) }), h('td.n.cache-tel', { text: c.sessions ? pct(c.demandes, c.sessions, 2) : '—' }),
          h('td.n.cache-tel', { text: vv ? vv.t.replace(' vs avant', '') : '—' })]);
      }))])])]));
    /* les comptes Google Ads */
    var pc = g.parCompte || {}, cles = ['nous', 'axifuge', 'autre'].filter(function (k) { return pc[k] && pc[k].sessions; });
    if (cles.length) {
      var coutNous = this.donneesAds() ? ((d.totaux || {}).cout || 0) : 0;
      z.appendChild(h('div.ana-zone', [h('h2', 'Les visites payées par Google Ads, compte par compte'),
        h('div.ana-defile', [h('table.ana-table', [
          h('thead', [h('tr', [h('th', 'Compte Google Ads'), h('th.n', 'Visites'), h('th.n.cache-tel', 'Engagées'), h('th.n', 'Événements clés'), h('th.n', 'Coût par visite')])]),
          h('tbody', cles.map(function (k) { var a = pc[k];
            return h('tr', [h('td', { text: NOMS_COMPTES[k] || k }), h('td.n', { text: nb(a.sessions) }), h('td.n.cache-tel', { text: pct(a.engagees, a.sessions) }), h('td.n', { text: nb(a.evenementsCles) }),
              h('td.n', { text: k === 'nous' && coutNous && a.sessions ? argent(coutNous / a.sessions, 2) : '—' })]); }))])]),
        h('p.ana-note', { text: 'Les visites sont comptées par Google Analytics sur le site ; la dépense de notre campagne vient de Google Ads. La dépense d\'Axifuge n\'est pas connue de ScanAutomax.' + (pc.nous && pc.axifuge ? ' Les deux campagnes annoncent les mêmes véhicules : elles peuvent enchérir l\'une contre l\'autre.' : '') })]));
    }
    /* événements clés, campagnes, pages (repliés) */
    var det = h('div');
    if (g.evenements.length) det.appendChild(h('details', [h('summary', { text: 'Événements clés (' + g.evenements.length + ')' }), h('div.ana-defile', [h('table.ana-table', [
      h('thead', [h('tr', [h('th', 'Événement'), h('th.n', 'Nombre'), h('th.n', 'Période d\'avant')])]),
      h('tbody', g.evenements.map(function (e) { return h('tr', [h('td', [document.createTextNode(e.nom), e.nom === evt ? h('span.ana-pastille.vert', { text: 'demande' }) : null]), h('td.n', { text: nb(e.n) }), h('td.n', { text: pr ? nb(e.avant) : '—' })]); }))])])]));
    if (g.campagnes.length) det.appendChild(h('details', [h('summary', { text: 'Sources et campagnes (' + g.campagnes.length + ')' }), h('div.ana-defile', [h('table.ana-table', [
      h('thead', [h('tr', [h('th', 'Source / support'), h('th', 'Campagne'), h('th.n', 'Visites'), h('th.n', 'Événements clés')])]),
      h('tbody', g.campagnes.slice(0, 40).map(function (c) { return h('tr', [h('td', { text: c.source }), h('td', [document.createTextNode(c.campagne), c.compte ? h('span.ana-pastille.' + (c.compte === 'nous' ? 'vert' : 'gris'), { text: c.compte === 'nous' ? 'nous' : (c.compte === 'axifuge' ? 'Axifuge' : 'autre') }) : null]), h('td.n', { text: nb(c.sessions) }), h('td.n', { text: nb(c.evenementsCles) })]); }))])])]));
    var site0 = (g.sites[0] || {}).nom || '', lien = function (chemin, site) { var s = (g.sites.filter(function (x) { return x.cle === site; })[0] || {}).nom || site0; return 'https://www.' + s + chemin; };
    var perP = g.pagesPeriode ? ' — du ' + fmtJour(g.pagesPeriode.du) + ' au ' + fmtJour(g.pagesPeriode.au) : '';
    if (g.entrees.length) det.appendChild(h('details', [h('summary', { text: 'Pages d\'entrée (30 derniers jours)' + perP }), h('div.ana-defile', [h('table.ana-table', [
      h('thead', [h('tr', [h('th', 'Page'), h('th.cache-tel', 'Canal'), h('th.n', 'Visites'), h('th.n', 'Événements clés')])]),
      h('tbody', g.entrees.map(function (e) { return h('tr', [h('td', [h('a', { href: lien(e.page, e.site), target: '_blank', rel: 'noopener', text: e.page || '/' })]), h('td.cache-tel', { text: e.canal }), h('td.n', { text: nb(e.sessions) }), h('td.n', { text: nb(e.cles) })]); }))])])]));
    if (g.pages.length) det.appendChild(h('details', [h('summary', { text: 'Pages les plus vues (30 derniers jours)' + perP }), h('div.ana-defile', [h('table.ana-table', [
      h('thead', [h('tr', [h('th', 'Page'), h('th.n', 'Vues'), h('th.n.cache-tel', 'Visiteurs'), h('th.n', 'Événements clés')])]),
      h('tbody', g.pages.map(function (p) { return h('tr', [h('td', [h('a', { href: lien(p.chemin, p.site), target: '_blank', rel: 'noopener', text: p.chemin || '/' })]), h('td.n', { text: nb(p.vues) }), h('td.n.cache-tel', { text: nb(p.utilisateurs) }), h('td.n', { text: nb(p.cles) })]); }))])])]));
    if (g.fiches.sansNiv.length) det.appendChild(h('details', [h('summary', { text: 'Fiches de véhicules vues, plus en vente (' + g.fiches.sansNiv.length + ')' }),
      h('p.ana-note', { text: 'Des fiches vendues ou retirées que des visiteurs ouvrent encore (anciens liens, recherche Google).' }), h('div.ana-defile', [h('table.ana-table', [
      h('thead', [h('tr', [h('th', 'Fiche'), h('th.n', 'Vues'), h('th.n', 'Demandes')])]),
      h('tbody', g.fiches.sansNiv.slice(0, 40).map(function (f) { return h('tr', [h('td', { text: (f.nom || 'Fiche ' + f.id) + ' (no ' + f.id + ')' }), h('td.n', { text: nb(f.vues) }), h('td.n', { text: nb(f.demandes) })]); }))])])]));
    if (det.childNodes.length) z.appendChild(h('div.ana-zone.ana-replis', [h('h2', 'Le détail')].concat([].slice.call(det.childNodes))));
  };

  /* =============================== Onglet Fiche Google =============================== */
  var NOMS_DEP = { ventes: 'Ventes', service: 'Service', occasion: 'Occasion' };
  Vue.prototype.ongletFiche = function () {
    var self = this, G = this.gaRep(), z = h('section.ana-zone'), g0 = this.ga || {};
    this.elCorps.appendChild(z);
    var F = G ? G.fiche : null;
    var etat = function (cls, titre, texte, bouton) { z.appendChild(h('div.ana-statut.' + cls, [h('span.rond'), h('div.t', [h('b', { text: titre }), texte ? document.createTextNode(' ' + texte) : null])].concat(bouton ? [bouton] : []))); };
    if (g0.pasAJour) { etat('ambre', 'Le script n\'est pas à jour.', 'Déployez la version qui contient GoogleAnalytics.gs.'); return; }
    if (!F) { etat('ambre', 'La fiche Google n\'a pas pu être lue.', g0.erreur || ''); return; }
    if (!F.branche) { etat('ambre', 'Les fiches Google ne sont pas branchées.', 'Elles se branchent avec le suivi des avis (Relance › Avis Google).'); return; }
    if (F.erreur && !F.fiches.length) { etat('ambre', 'Les statistiques des fiches Google ne se lisent pas.', F.erreur); return; }
    if (!F.fiches.length) { etat('bleu', 'Pas encore lu.', 'La première lecture se fait dans l\'heure (ou « Relire maintenant » dans l\'onglet Site web).'); return; }
    etat(F.erreur ? 'ambre' : 'vert', 'Fiche Google lue le ' + quand(F.luLe) + '.', 'Google publie ces chiffres avec 3 à 5 jours de retard' + (F.dernier ? ' : dernier jour reçu, le ' + String(fmtJour(F.dernier)).replace(/\.$/, '') + '.' : '.') + (F.erreur ? ' ' + F.erreur : ''),
      h('a.btn', { href: URL_FICHES, target: '_blank', rel: 'noopener', text: 'Ouvrir le profil d\'entreprise' }));
    var sf = sommeFiche(F), t = sf.t, pr = this.periode === 'tout' ? null : sf.pr, v = function (a, b) { return pr ? variation(a, b, 1) : null; };
    z.appendChild(h('div.ana-kgroupe', [h('h2', [document.createTextNode('La fiche Google'), h('small', { text: F.fiches.map(function (f) { return f.nom; }).join(' · ') + ' · ' + (nomPeriode(this.periode) || '').toLowerCase() })]),
      h('div.ana-kpis', [
        kpi(nb(t.vues), 'Vues de la fiche', { zero: !t.vues, v: v(t.vues, pr && pr.vues), note: nb(t.recherche) + ' dans la recherche · ' + nb(t.maps) + ' dans Maps' }),
        kpi(nb(t.appels), 'Appels', { zero: !t.appels, classe: t.appels ? 'vert' : '', v: v(t.appels, pr && pr.appels), note: 'bouton « Appeler » de la fiche' }),
        kpi(nb(t.siteWeb), 'Clics vers le site', { zero: !t.siteWeb, v: v(t.siteWeb, pr && pr.siteWeb), note: 'bouton « Site Web »' }),
        kpi(nb(t.itineraires), 'Itinéraires', { zero: !t.itineraires, v: v(t.itineraires, pr && pr.itineraires), note: 'demandes d\'itinéraire vers la concession' }),
        kpi(t.vues ? pct(t.appels + t.siteWeb + t.itineraires + t.messages, t.vues, 1) : '—', 'Taux d\'action', { zero: !t.vues, note: 'appels, clics, itinéraires ÷ vues' }),
        kpi(nb(t.messages), 'Messages', { zero: !t.messages, note: 'clics sur « Message »' })
      ])]));
    z.appendChild(this.zoneControlesFiche(F));
    if (F.fiches.length > 1) {
      z.appendChild(h('div.ana-zone', [h('h2', 'Fiche par fiche'), h('div.ana-defile', [h('table.ana-table', [
        h('thead', [h('tr', [h('th', 'Fiche'), h('th.n', 'Vues'), h('th.n.cache-tel', 'Recherche'), h('th.n.cache-tel', 'Maps'), h('th.n', 'Appels'), h('th.n', 'Site'), h('th.n.cache-tel', 'Itinéraires')])]),
        h('tbody', F.fiches.map(function (f) { var a = f.totaux;
          return h('tr', [h('td', [h('b', { text: f.nom }), f.departement ? h('span.sous', { text: NOMS_DEP[f.departement] || f.departement }) : null]), h('td.n', { text: nb(a.vues) }), h('td.n.cache-tel', { text: nb(a.rechercheMobile + a.rechercheOrdi) }),
            h('td.n.cache-tel', { text: nb(a.mapsMobile + a.mapsOrdi) }), h('td.n', { text: nb(a.appels) }), h('td.n', { text: nb(a.siteWeb) }), h('td.n.cache-tel', { text: nb(a.itineraires) })]); }))])])]));
    }
    var cleF = this.grapheFiche || 'vues';
    var segF = h('div.segment.seg', [['vues', 'Vues'], ['appels', 'Appels'], ['siteWeb', 'Clics vers le site'], ['itineraires', 'Itinéraires']].map(function (x) {
      return h('button' + (cleF === x[0] ? '.actif' : ''), { type: 'button', 'aria-pressed': cleF === x[0] ? 'true' : 'false', text: x[1], onclick: function () { self.grapheFiche = x[0]; self.rendre(); } });
    }));
    var S = serie(F.jours, ['vues', 'appels', 'siteWeb', 'itineraires']);
    z.appendChild(h('div.ana-zone', [h('h2', [document.createTextNode(F.jours.length > 45 ? 'Semaine par semaine' : 'Jour par jour'), segF]), barres(S, cleF, nbCourt)]));
    if (F.mots && F.mots.length) {
      var mm = F.moisMots ? new Date(F.moisMots + '-15T12:00:00').toLocaleDateString('fr-CA', { month: 'long', year: 'numeric' }) : '';
      z.appendChild(h('div.ana-zone', [h('h2', 'Ce que les gens cherchent quand ils trouvent la fiche' + (mm ? ' — ' + mm : '')), h('div.ana-defile', [h('table.ana-table', [
        h('thead', [h('tr', [h('th', 'Recherche'), h('th.n', 'Personnes')])]),
        h('tbody', F.mots.slice(0, 40).map(function (m) { return h('tr', [h('td', { text: m.mot }), h('td.n', { text: m.valeur ? nb(m.valeur) : (m.seuil ? 'moins de ' + nb(m.seuil) : '—') })]); }))])]),
        h('p.ana-note', { text: 'Google donne ces recherches par mois, au début du mois suivant. « Moins de 15 » : Google ne donne pas le chiffre exact quand il est petit.' })]));
    }
  };

  /* ---- 18 nov. : la fiche Google est-elle complète ? (catégories, description, heures, jours fériés, photos, publications…)
     Lu une fois par jour dans le profil d'entreprise (API Business Information, en lecture), contrôlé par GoogleAnalytics.gs. ---- */
  Vue.prototype.zoneControlesFiche = function (F) {
    var z = h('div.ana-zone'), fs = (F.fiches || []).filter(function (f) { return (f.controles || []).length || f.infoErreur; });
    var le = fs.reduce(function (m, f) { return f.infoLe && f.infoLe > m ? f.infoLe : m; }, '');
    z.appendChild(h('h2', [document.createTextNode('La fiche est-elle complète ?'), h('small', { text: le ? 'vérifiée le ' + quand(le) : 'vérifiée chaque matin dans le profil d\'entreprise' })]));
    if (!fs.length) { z.appendChild(h('p.ana-note', { text: 'La vérification se fait à la prochaine lecture des fiches (une fois par jour, le matin) : catégories, description, heures et jours fériés, photos, publications.' })); return z; }
    fs.forEach(function (f) {
      var cs = f.controles || [], nv = cs.filter(function (c) { return c.ton !== 'vert'; }), ok = cs.filter(function (c) { return c.ton === 'vert'; });
      var rouge = nv.some(function (c) { return c.ton === 'rouge'; });
      var tete = h('div.ana-ctrl-tete', [h('b', { text: f.titre || f.nom }),
        h('span.ana-pastille.' + (f.infoErreur && !cs.length ? 'gris' : (rouge ? 'rouge' : (nv.length ? 'ambre' : 'vert'))), { text: f.infoErreur && !cs.length ? 'pas lisible' : (nv.length ? nv.length + ' point' + (nv.length > 1 ? 's' : '') + ' à compléter' : 'Complète') }),
        h('span.esp'),
        f.mapsUri ? h('a.btn.petit', { href: f.mapsUri, target: '_blank', rel: 'noopener', text: 'Voir sur Google Maps' }) : null,
        h('a.btn.petit', { href: URL_FICHES, target: '_blank', rel: 'noopener', text: 'Modifier la fiche' })]);
      var carte = h('div.ana-carte.ana-ctrl', [tete]);
      if (f.infoErreur && !cs.length) carte.appendChild(h('p.ana-note', { text: f.infoErreur }));
      nv.forEach(function (c) { carte.appendChild(h('div.ana-point.' + c.ton, [h('span.rond'), h('div', [h('b', { text: c.titre }), c.quoi ? h('p', { text: c.quoi }) : null])])); });
      if (ok.length) carte.appendChild(h('p.ana-ctrl-ok', [h('b', { text: '✓ ' }), document.createTextNode(ok.map(function (c) { return c.titre; }).join(' · '))]));
      z.appendChild(carte);
    });
    z.appendChild(h('p.ana-note', { text: 'ScanAutomax ne change rien à la fiche : il la lit et dit quoi corriger. Les heures des jours fériés des 45 prochains jours sont comparées au calendrier ' + 'du Québec (de l\'Ontario pour Hawkesbury).' }));
    return z;
  };

  /* ---- Branchement : l'état des trois sources Google ---- */
  Vue.prototype.carteSourcesGoogle = function () {
    var self = this, G = this.gaRep(), g0 = this.ga || {}, el = h('div.ana-carte');
    el.appendChild(h('h3', 'Google Analytics, fiches Google et Merchant Center'));
    if (g0.pasAJour || !G) { el.appendChild(h('p', { text: g0.pasAJour ? 'Le script n\'est pas à jour : déployez la version qui contient GoogleAnalytics.gs.' : (g0.erreur || 'Pas encore lu.') })); return el; }
    var l = h('ul');
    l.appendChild(h('li', { text: 'Google Analytics : ' + (G.ga.branche ? 'branché (' + (G.ga.compte || 'mallard@groupeautomax.com') + ')' + G.ga.sites.map(function (s) { return ' · ' + s.nom + (s.erreur ? ' : ' + s.erreur : (s.dernier ? ' lu jusqu\'au ' + fmtJour(s.dernier) : ' pas encore lu')); }).join('') : 'pas branché') }));
    l.appendChild(h('li', { text: 'Fiches Google : ' + (G.fiche.branche ? (G.fiche.fiches.length ? G.fiche.fiches.length + ' fiche' + (G.fiche.fiches.length > 1 ? 's' : '') + ', lue' + (G.fiche.fiches.length > 1 ? 's' : '') + ' le ' + quand(G.fiche.luLe) : (G.fiche.erreur || 'pas encore lues')) : 'pas branchées (Relance › Avis Google)') }));
    l.appendChild(h('li', { text: 'Merchant Center : ' + (G.merchant.compte ? (G.merchant.n ? G.merchant.n + ' véhicules lus le ' + quand(G.merchant.luLe) + ' (' + G.merchant.approuve + ' approuvés, ' + G.merchant.refuse + ' refusés, ' + G.merchant.attente + ' en examen)' : (G.merchant.erreur || 'pas encore lu')) : 'pas de compte pour cette concession') }));
    el.appendChild(l);
    el.appendChild(h('div.rangee', [G.ga.peutBrancher && !G.ga.branche ? h('button.btn.primaire', { type: 'button', text: 'Brancher Google Analytics', onclick: function () { self.brancherGa(); } }) : null,
      h('button.btn', { type: 'button', text: 'Relire maintenant', onclick: function () { self.relireGa(); } })]));
    return el;
  };

  AMX.annoncesAnalyse = { charger: charger, chargerGa: chargerGa, peutVoir: peutVoir, scriptAds: scriptAds, vider: function () { cache = {}; cacheGa = {}; } };
  AMX.section('annoncesanalyse', {
    titre: 'Analyse des annonces', icone: 'resultat', ordre: 37,
    visible: function () { return peutVoir(); },
    monter: function (conteneur, ctx) { return new Vue(conteneur, ctx); }
  });
})();
