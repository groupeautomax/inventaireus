/* =====================================================================================================
   portefeuille.js — Relance › Portefeuille clients, façon Drive AI (5 nov. 2026)

   Maxime : rapport « Plateforme de relance type Drive AI », puis « on construit et après on fait les demandes ».
   Sprint 1 : le socle. Une fiche par véhicule et par concession (Portefeuille.gs) : ventes du Livre des ventes,
   contrats des prêteurs captifs, service (Texto, Rendez-vous), évaluations, valeurs OpenLane, et les fichiers du DMS
   dès qu'ils arrivent (clients, véhicules, ventes, bons de travail fermés, rendez-vous).
   - Ici : valeur ajustée au km projeté, fourchette, dette du jour (AMX.equite.detteDe), équité, segments à la Drive AI.
   - Règle v138 : filtres → « Chiffres et liste » → chiffres de la liste filtrée → segments → liste.
   - Aucun envoi d'ici : « Campagne avec cette liste » (6 nov., campagnes-relance.js) prépare une campagne avec la liste filtrée ;
     elle ne part que sur le clic « Envoyer » d'une personne qui a le droit nommé.
   ===================================================================================================== */
(function () {
  'use strict';
  var h = AMX.h, I = AMX.icones || {};

  var CSS = [
    '.ptf-avis { padding: 10px 14px; border-radius: 10px; margin: 0 0 12px; font-size: 13px; border-left: 4px solid var(--ambre); background: var(--ambre-bg); display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }',
    '.ptf-avis.ok { border-left-color: var(--vert); background: var(--vert-clair); }', '.ptf-prog-auto .ptf-avis { display: block; } .ptf-prog-auto .ptf-avis p { margin: 0 0 6px; }', '.ptf-prog-autos { margin: 0 0 12px; } .ptf-prog-autos summary { cursor: pointer; font-weight: 600; padding: 6px 0; }',
    '.ptf-avis p { margin: 0; flex: 1 1 360px; }',
    '.ptf-filtres { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 0 0 8px; }',
    '.ptf-filtres .saisie.recherche { flex: 1 1 260px; max-width: 460px; }',
    '.ptf-pastilles { display: flex; gap: 6px; flex-wrap: wrap; margin: 0 0 8px; align-items: center; }',
    '.ptf-pastilles .l { font-size: 12px; color: var(--encre-3); margin-right: 2px; }',
    '.ptf-pastilles button { border: 1px solid var(--ligne); background: var(--carte); border-radius: 999px; padding: 4px 11px; font-size: 12.5px; cursor: pointer; color: var(--encre-2); }',
    '.ptf-pastilles button .n { font-weight: 700; margin-left: 4px; font-variant-numeric: tabular-nums; opacity: .8; }',
    '.ptf-pastilles button.actif { background: var(--vert-fonce); border-color: var(--vert-fonce); color: #fff; }',
    '.ptf-chiffres { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; margin: 0 0 12px; }',
    '.ptf-chiffre { background: var(--carte); border: 1px solid var(--ligne); border-radius: 12px; padding: 10px 12px; }',
    '.ptf-chiffre .t { font-size: 12px; color: var(--encre-3); font-weight: 600; }',
    '.ptf-chiffre .v { font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums; margin-top: 2px; }',
    '.ptf-chiffre .s { font-size: 12px; color: var(--encre-3); margin-top: 2px; }',
    '.ptf-portrait { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; margin: 0 0 12px; }',
    '.ptf-portrait .carte { padding: 10px 12px; }',
    '.ptf-portrait h3 { font-size: 13px; margin: 0 0 8px; text-transform: uppercase; letter-spacing: .03em; color: var(--encre-2); }',
    '.ptf-barre { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; font-size: 13px; margin: 0 0 6px; }',
    '.ptf-barre .j { grid-column: 1 / -1; height: 6px; border-radius: 3px; background: var(--gris-bg); overflow: hidden; }',
    '.ptf-barre .j i { display: block; height: 100%; background: var(--vert); }',
    '.ptf-barre .j i.ambre { background: var(--ambre); } .ptf-barre .j i.rouge { background: var(--rouge); } .ptf-barre .j i.bleu { background: var(--bleu); }',
    '.ptf-segments { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 8px; margin: 0 0 12px; }',
    '.ptf-segment { text-align: left; border: 1px solid var(--ligne); background: var(--carte); border-radius: 12px; padding: 9px 12px; cursor: pointer; display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; align-items: baseline; }',
    '.ptf-segment b { font-size: 13px; } .ptf-segment .n { font-size: 18px; font-weight: 800; font-variant-numeric: tabular-nums; }',
    '.ptf-segment .s { grid-column: 1 / -1; font-size: 12px; color: var(--encre-3); }',
    '.ptf-segment.actif { border-color: var(--vert-fonce); box-shadow: 0 0 0 2px var(--vert-clair); }',
    '.ptf-segment.zero { opacity: .55; }',
    '.ptf-cadre { overflow-x: auto; }',
    '.ptf-table tbody tr { cursor: pointer; } .ptf-table tbody tr:hover { background: var(--carte-2); }',
    '.ptf-table td { vertical-align: top; } .ptf-table td .s { display: block; color: var(--encre-3); font-size: 12px; }',
    '.ptf-table td.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }',
    '.ptf-table .mono { font-family: var(--mono); font-size: 12px; }',
    '.ptf-puce { display: inline-block; border-radius: 999px; padding: 1px 7px; font-size: 11.5px; font-weight: 600; margin: 0 4px 3px 0; white-space: nowrap; background: var(--gris-bg); color: var(--encre-2); }',
    '.ptf-puce.vert { background: var(--vert-clair); color: var(--vert-fonce); } .ptf-puce.ambre { background: var(--ambre-bg); color: var(--ambre); } .ptf-puce.rouge { background: var(--rouge-bg); color: var(--rouge); } .ptf-puce.bleu { background: #E6F0FB; color: #1A64BF; } .ptf-puce.mauve { background: #EEE8FB; color: #5B3FB0; }',
    '.ptf-eq.plus { color: var(--vert-fonce); font-weight: 700; } .ptf-eq.moins { color: var(--rouge); }',
    '.ptf-plus { margin: 10px 0; text-align: center; }',
    '.ptf-detail { display: grid; grid-template-columns: minmax(150px, 34%) 1fr; margin: 0 0 10px; }',
    '.ptf-detail dt, .ptf-detail dd { padding: 5px 8px; border-bottom: 1px solid var(--ligne); margin: 0; font-size: 13px; }',
    '.ptf-detail dt { color: var(--encre-3); font-weight: 600; }',
    '.ptf-h { font-size: 12.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .03em; color: var(--encre-2); margin: 14px 0 4px; }',
    '.ptf-import .etape { margin: 0 0 12px; } .ptf-import table td, .ptf-import table th { font-size: 12.5px; padding: 4px 6px; }',
    '.ptf-import select { max-width: 230px; } .ptf-import .ex { color: var(--encre-3); max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    '.ptf-import .genres { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 6px; }',
    '.ptf-import .genres label { border: 1px solid var(--ligne); border-radius: 10px; padding: 8px 10px; display: flex; gap: 8px; align-items: flex-start; cursor: pointer; font-size: 13px; }',
    '.ptf-import .genres label.actif { border-color: var(--vert-fonce); background: var(--vert-clair); }',
    '.ptf-import .progres { height: 8px; background: var(--gris-bg); border-radius: 4px; overflow: hidden; margin: 8px 0; } .ptf-import .progres i { display: block; height: 100%; width: 0; background: var(--vert); transition: width .2s; }',
    '.ptf-reglages .grille { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }',
    '.ptf-reglages textarea { width: 100%; min-height: 90px; font-family: var(--mono); font-size: 12.5px; }',
    '.ptf-vide { padding: 28px; text-align: center; color: var(--encre-3); }',
    '.ptf-sync { font-size: 12.5px; color: var(--encre-3); margin: 0 0 8px; }',
    '.ptf-offre-l b { display: block; } .ptf-offre-l .ec { font-weight: 700; } .ptf-offre-l .ec.plus { color: var(--rouge); } .ptf-offre-l .ec.moins { color: var(--vert-fonce); }',
    '.ptf-offres { display: grid; gap: 8px; margin: 0 0 8px; }',
    '.ptf-offre { border: 1px solid var(--ligne); border-radius: 12px; padding: 10px 12px; }',
    '.ptf-offre.prete { border-color: var(--vert); } .ptf-offre .t { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; flex-wrap: wrap; }',
    '.ptf-offre .p { font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums; }',
    '.ptf-offre table { width: 100%; font-size: 12.5px; margin-top: 6px; border-collapse: collapse; } .ptf-offre td { padding: 2px 0; border-bottom: 1px dashed var(--ligne); } .ptf-offre td.num { text-align: right; font-variant-numeric: tabular-nums; }',
    '.ptf-offre .r { font-size: 12px; color: var(--ambre); margin-top: 4px; }',
    '.ptf-prog table td, .ptf-prog table th { font-size: 12.5px; padding: 4px 6px; } .ptf-prog .form { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin: 8px 0; }',
    '.ptf-prog .barre-mois { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 0 0 8px; }',
    '.ptf-page { border: 1px solid var(--ligne); border-radius: 12px; padding: 10px 12px; margin: 0 0 8px; }',
    '.ptf-page.atraiter { border-color: var(--vert); box-shadow: 0 0 0 2px var(--vert-clair); }',
    '.ptf-page .t { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; flex-wrap: wrap; }',
    '.ptf-page .rep { margin: 6px 0 0; padding: 6px 10px; border-radius: 8px; background: var(--vert-clair); color: var(--vert-fonce); font-size: 13px; }',
    '.ptf-page .av { font-size: 12px; color: var(--ambre); margin-top: 4px; }',
    '.ptf-page .acts { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }',
    '.ptf-prep .offre-choix { display: flex; gap: 10px; align-items: flex-start; border: 1px solid var(--ligne); border-radius: 10px; padding: 8px 10px; margin: 0 0 6px; cursor: pointer; }',
    '.ptf-prep .offre-choix.actif { border-color: var(--vert-fonce); background: var(--vert-clair); }',
    '.ptf-prep .offre-choix .r { font-size: 12px; color: var(--ambre); }',
    '.ptf-prep textarea { width: 100%; min-height: 80px; }',
    '.ptf-prep .avis { padding: 8px 10px; border-radius: 8px; background: var(--ambre-bg); color: var(--ambre); font-size: 12.5px; margin: 0 0 8px; }',
    '.ptf-prep .lien { font-family: var(--mono); font-size: 12px; word-break: break-all; background: var(--gris-bg); padding: 8px 10px; border-radius: 8px; margin: 6px 0; }',
    /* 6 nov. : visuel façon Drive AI */
    '.ptf-vues { display: flex; gap: 4px; margin: 2px 0 12px; border-bottom: 1px solid var(--ligne); }',
    '.ptf-vue { border: 0; background: none; padding: 9px 14px 10px; font-size: 14px; font-weight: 700; color: var(--encre-3); cursor: pointer; border-bottom: 3px solid transparent; margin-bottom: -1px; display: flex; gap: 8px; align-items: center; }',
    '.ptf-vue .n { font-size: 12px; font-weight: 700; background: var(--gris-bg); color: var(--encre-2); border-radius: 999px; padding: 1px 8px; font-variant-numeric: tabular-nums; }',
    '.ptf-vue.actif { color: var(--vert-fonce); border-bottom-color: var(--vert); } .ptf-vue.actif .n { background: var(--vert-clair); color: var(--vert-fonce); }',
    '.ptf-apercu { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 14px; margin: 0 0 16px; }',
    '.ptf-carte { background: var(--carte); border: 1px solid var(--ligne); border-radius: 14px; padding: 16px 18px; min-width: 0; display: flex; flex-direction: column; gap: 10px; box-shadow: 0 1px 2px rgba(16,24,40,.04); }',
    '.ptf-carte header h3 { font-size: 15px; margin: 0; color: var(--encre); } .ptf-carte header p { margin: 2px 0 0; font-size: 12.5px; color: var(--encre-3); }',
    '.ptf-carte.c12 { grid-column: span 12; } .ptf-carte.c8 { grid-column: span 8; } .ptf-carte.c7 { grid-column: span 7; } .ptf-carte.c5 { grid-column: span 5; } .ptf-carte.c4 { grid-column: span 4; }',
    '@media (max-width: 1180px) { .ptf-carte.c4 { grid-column: span 6; } .ptf-carte.c8, .ptf-carte.c7, .ptf-carte.c5 { grid-column: span 12; } }',
    '@media (max-width: 760px) { .ptf-apercu { grid-template-columns: 1fr; } .ptf-carte.c4, .ptf-carte.c5, .ptf-carte.c7, .ptf-carte.c8, .ptf-carte.c12 { grid-column: auto; } }',
    '.ptf-svg { width: 100%; height: auto; display: block; overflow: visible; font-family: inherit; }',
    '.ptf-svg .ptf-clic, .ptf-clic { cursor: pointer; } .ptf-svg .ptf-clic:hover { opacity: .82; } .ptf-svg .ptf-clic:focus { outline: none; } .ptf-svg .ptf-clic:focus-visible circle { stroke: var(--encre); }',
    '.ptf-pied { display: flex; gap: 8px; flex-wrap: wrap; border-top: 1px solid var(--ligne); padding-top: 10px; margin-top: auto; }',
    '.ptf-pc { border: 0; background: none; text-align: left; padding: 4px 10px 4px 0; display: flex; flex-direction: column; gap: 1px; cursor: pointer; border-radius: 8px; min-width: 110px; }',
    '.ptf-pc.fixe { cursor: default; } button.ptf-pc:hover { background: var(--carte-2); }',
    '.ptf-pc .t { font-size: 12px; color: var(--encre-3); } .ptf-pc b { font-size: 22px; font-weight: 800; color: var(--encre); }',
    '.ptf-anneau { display: grid; grid-template-columns: minmax(130px, 170px) 1fr; gap: 14px; align-items: center; }',
    '.ptf-anneau .ptf-svg.anneau { max-width: 170px; }',
    '@media (max-width: 420px) { .ptf-anneau { grid-template-columns: 1fr; } }',
    '.ptf-legende { display: flex; flex-direction: column; gap: 2px; } .ptf-legende.horiz { flex-direction: row; flex-wrap: wrap; gap: 4px 16px; }',
    '.ptf-cote { display: grid; grid-template-columns: minmax(0, 1fr) minmax(170px, 210px); gap: 14px; align-items: center; } @media (max-width: 520px) { .ptf-cote { grid-template-columns: 1fr; } }',
    '.ptf-leg { display: grid; grid-template-columns: 12px 1fr auto auto; gap: 8px; align-items: center; border: 0; background: none; padding: 5px 6px; border-radius: 8px; text-align: left; font-size: 13px; color: var(--encre-2); cursor: pointer; }',
    '.ptf-legende.horiz .ptf-leg { grid-template-columns: 12px auto; padding: 0; }',
    '.ptf-leg.fixe { cursor: default; } button.ptf-leg:not(.fixe):hover { background: var(--carte-2); }',
    '.ptf-leg i { width: 12px; height: 12px; border-radius: 3px; display: block; }',
    '.ptf-leg b { font-variant-numeric: tabular-nums; color: var(--encre); } .ptf-leg .p { font-size: 12px; color: var(--encre-3); min-width: 36px; text-align: right; font-variant-numeric: tabular-nums; }',
    '.ptf-barres { display: flex; flex-direction: column; gap: 4px; }',
    '.ptf-bh { display: grid; grid-template-columns: minmax(110px, 38%) 1fr auto; gap: 10px; align-items: center; border: 0; background: none; padding: 6px 6px; border-radius: 8px; text-align: left; cursor: pointer; font-size: 13px; color: var(--encre-2); }',
    '.ptf-bh.fixe { cursor: default; } button.ptf-bh:hover { background: var(--carte-2); }',
    '.ptf-bh .l { display: flex; gap: 6px; align-items: center; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .ptf-bh .ic { display: inline-flex; gap: 2px; color: var(--vert-fonce); }',
    '.ptf-bh .piste { height: 10px; background: #E6F4EC; border-radius: 999px; overflow: hidden; } .ptf-bh .piste i { display: block; height: 100%; border-radius: 999px; }',
    '.ptf-bh b { font-variant-numeric: tabular-nums; color: var(--encre); white-space: nowrap; }',
    '.ptf-mini-onglets { display: flex; gap: 2px; margin: -2px 0 6px; border-bottom: 1px solid var(--ligne); }',
    '.ptf-mini-onglets button { border: 0; background: none; padding: 6px 10px 8px; font-size: 13px; font-weight: 600; color: var(--encre-3); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; }',
    '.ptf-mini-onglets button.actif { color: var(--bleu); border-bottom-color: var(--bleu); }',
    '.ptf-modeles { width: 100%; border-collapse: collapse; } .ptf-modeles td { padding: 7px 6px; border-bottom: 1px solid var(--ligne); font-size: 13px; vertical-align: middle; }',
    '.ptf-modeles tr:hover td { background: var(--carte-2); } .ptf-modeles td .s { display: block; font-size: 11.5px; color: var(--encre-3); } .ptf-modeles td.num { text-align: right; font-variant-numeric: tabular-nums; }',
    '.ptf-modeles td.mq { width: 34px; } .ptf-modeles .logo-marque { width: 26px; height: 26px; }',
    '.ptf-note { margin: 0; font-size: 12px; color: var(--encre-3); }',
    '.ptf-cons { display: grid; grid-template-columns: 1fr 200px; gap: 18px; align-items: start; } @media (max-width: 760px) { .ptf-cons { grid-template-columns: 1fr; } }',
    '.ptf-cons-s { display: flex; flex-direction: column; gap: 8px; }',
    '.ptf-bulle { position: fixed; z-index: 4000; display: none; background: #111827; color: #fff; font-size: 12.5px; padding: 6px 9px; border-radius: 8px; max-width: 280px; pointer-events: none; box-shadow: 0 6px 18px rgba(0,0,0,.18); }',
    '.ptf-photo { position: relative; border-radius: 10px; overflow: hidden; background: #F3F5F8; aspect-ratio: 16 / 9; display: flex; align-items: center; justify-content: center; }',
    '.ptf-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }',
    '.ptf-photo.silh { background: linear-gradient(180deg, #F7F9FB, #EDF1F5); } .ptf-photo .ptf-silh { width: 86%; height: auto; }',
    '.ptf-photo .note { position: absolute; left: 8px; bottom: 8px; background: rgba(17,24,39,.72); color: #fff; font-size: 11.5px; padding: 2px 8px; border-radius: 999px; }',
    '.ptf-photo.grand { aspect-ratio: 4 / 3; } .ptf-photo.offre { aspect-ratio: 16 / 9; border-radius: 10px; }',
    '.ptf-rangees { display: flex; flex-direction: column; gap: 8px; }',
    '.ptf-rangee { display: grid; grid-template-columns: 116px minmax(150px, 1.15fr) minmax(160px, 1.25fr) minmax(120px, .85fr) minmax(170px, 1.15fr) minmax(120px, .8fr) 16px; gap: 14px; align-items: center; background: var(--carte); border: 1px solid var(--ligne); border-radius: 12px; padding: 10px 14px 10px 10px; cursor: pointer; }',
    '.ptf-rangee:hover { border-color: #C9D0D8; box-shadow: 0 2px 8px rgba(16,24,40,.06); } .ptf-rangee:focus-visible { outline: 2px solid var(--vert); outline-offset: 2px; }',
    '.ptf-rangee.tete { background: none; border: 0; padding: 0 14px 0 10px; cursor: default; box-shadow: none; font-size: 12px; font-weight: 700; color: var(--encre-3); text-transform: uppercase; letter-spacing: .03em; }',
    '.ptf-rangee .ptf-photo { width: 116px; border-radius: 8px; }',
    '.ptf-rangee > div { min-width: 0; display: flex; flex-direction: column; gap: 2px; font-size: 13px; }',
    '.ptf-rangee .s { color: var(--encre-3); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    '.ptf-rangee .cli b { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .ptf-rangee .segs { margin-top: 3px; }',
    '.ptf-rangee .veh .l1 { font-size: 13px; } .ptf-rangee .veh .mq { color: var(--encre-3); } .ptf-rangee .veh .l2 b { font-size: 15px; } .ptf-rangee .veh .ver { color: var(--encre-3); font-size: 12.5px; }',
    '.ptf-rangee .of b.vh { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .ptf-rangee .of .ptf-puce { align-self: flex-start; }',
    '.ptf-rangee .of .ec { font-weight: 700; font-size: 12.5px; } .ptf-rangee .of .ec.plus { color: var(--rouge); } .ptf-rangee .of .ec.moins { color: var(--vert-fonce); }',
    '.ptf-rangee .fl { color: var(--encre-3); font-size: 22px; line-height: 1; }',
    '.ptf-beq { display: inline-block; align-self: flex-start; border-radius: 8px; padding: 3px 8px; font-weight: 800; font-size: 14px; font-variant-numeric: tabular-nums; }',
    '.ptf-beq.plus { background: var(--vert-clair); color: var(--vert-fonce); } .ptf-beq.moins { background: var(--rouge-bg); color: var(--rouge); }',
    '.ptf-beq.grand { font-size: 15px; padding: 4px 10px; margin-left: 10px; }',
    '.ptf-canaux { display: inline-flex; gap: 4px; margin-bottom: 3px; }',
    '.ptf-canaux .can, .ptf-consent .can { display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; }',
    '.ptf-canaux .can { width: 28px; height: 28px; }',
    '.can.ok { background: var(--vert-clair); color: var(--vert-fonce); } .can.non { background: var(--rouge-bg); color: var(--rouge); } .can.aucun { background: var(--gris-bg); color: #AEB6C1; } .can.consent { background: var(--ambre-bg); color: var(--ambre); }',
    '@media (max-width: 1100px) {',
    '  .ptf-rangee { grid-template-columns: 96px 1fr 1fr; grid-template-areas: none; }',
    '  .ptf-rangee .ptf-photo { width: 96px; grid-row: span 2; } .ptf-rangee .fl { display: none; } .ptf-rangee.tete { display: none; }',
    '}',
    '@media (max-width: 1100px) { .ptf-rangee .ct { grid-column: 2 / -1; flex-direction: row; gap: 8px; align-items: center; flex-wrap: wrap; } }',
    '@media (max-width: 640px) { .ptf-rangee { grid-template-columns: 96px 1fr; gap: 8px 12px; } .ptf-rangee .ptf-photo { width: 96px; grid-row: auto; } .ptf-rangee .veh, .ptf-rangee .eq, .ptf-rangee .of, .ptf-rangee .ct { grid-column: 1 / -1; } .ptf-rangee .eq, .ptf-rangee .of { border-top: 1px dashed var(--ligne); padding-top: 6px; } }',
    '.voile.ptf-modale .modale.large { width: min(1220px, calc(100vw - 32px)); max-width: none; }',
    '.ptf-fv-onglets { display: flex; gap: 8px; overflow-x: auto; margin: 0 0 12px; padding-bottom: 2px; }',
    '.ptf-fv { border: 1px solid var(--ligne); background: var(--carte); border-radius: 10px; padding: 7px 12px; text-align: left; cursor: pointer; display: flex; flex-direction: column; gap: 1px; white-space: nowrap; }',
    '.ptf-fv span { font-size: 12px; color: var(--encre-3); } .ptf-fv.actif { border-color: var(--vert); box-shadow: inset 0 -3px 0 var(--vert); }',
    '.ptf-fiche-grille { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 20px; align-items: start; }',
    '@media (max-width: 980px) { .ptf-fiche-grille { grid-template-columns: 1fr; } }',
    '.ptf-fv-tete { display: grid; grid-template-columns: 300px 1fr; gap: 18px; background: var(--carte-2); border: 1px solid var(--ligne); border-radius: 14px; padding: 14px; }',
    '@media (max-width: 760px) { .ptf-fv-tete { grid-template-columns: 1fr; } }',
    '.ptf-fv-tete .niv { font-family: var(--mono); font-size: 12.5px; text-align: center; margin-top: 8px; color: var(--encre-2); } .ptf-fv-tete .km { text-align: center; font-size: 12.5px; color: var(--encre-3); }',
    '.ptf-fv-tete .nom { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; } .ptf-fv-tete .nom b { font-size: 19px; }',
    '.ptf-fv-tete .puces { margin: 6px 0 8px; }',
    '.ptf-fv-infos { display: grid; grid-template-columns: repeat(auto-fill, minmax(128px, 1fr)); gap: 10px 16px; }',
    '.ptf-fv-infos .t { display: block; font-size: 12px; color: var(--encre-3); } .ptf-fv-infos b { font-size: 14px; }',
    '.ptf-h2 { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin: 18px 0 8px; } .ptf-h2 h3 { margin: 0; font-size: 17px; } .ptf-h2 .s { font-size: 12.5px; color: var(--encre-3); }',
    '.ptf-ocartes { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }',
    '.ptf-ocarte { border: 1px solid var(--ligne); border-radius: 14px; padding: 14px; display: flex; flex-direction: column; gap: 10px; background: var(--carte); }',
    '.ptf-ocarte.prete { border-color: #9DD4B3; }',
    '.ptf-ocarte .haut { display: flex; justify-content: space-between; gap: 8px; align-items: center; } .ptf-ocarte .type { font-size: 11.5px; font-weight: 700; letter-spacing: .04em; color: var(--encre-3); }',
    '.ptf-etq { font-size: 11px; font-weight: 800; letter-spacing: .05em; border-radius: 6px; padding: 2px 8px; } .ptf-etq.vert { background: var(--vert); color: #fff; } .ptf-etq.ambre { border: 1px solid var(--ambre); color: var(--ambre); }',
    '.ptf-ocarte .titre b { font-size: 17px; line-height: 1.25; }',
    '.ptf-ocarte .boite { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid var(--ligne); border-radius: 10px; }',
    '.ptf-ocarte .boite > div { padding: 8px 10px; display: flex; flex-direction: column; } .ptf-ocarte .boite > div + div { border-left: 1px solid var(--ligne); }',
    '.ptf-ocarte .boite .t { font-size: 12px; color: var(--encre-3); } .ptf-ocarte .boite b { font-size: 19px; font-variant-numeric: tabular-nums; } .ptf-ocarte .boite .s { font-size: 11.5px; color: var(--encre-3); }',
    '.ptf-ocarte .boite b.ec.plus { color: var(--rouge); } .ptf-ocarte .boite b.ec.moins { color: var(--vert-fonce); }',
    '.ptf-ocarte .pied { font-size: 12px; color: var(--encre-3); text-align: right; } .ptf-ocarte .r { font-size: 12px; color: var(--ambre); }',
    '.ptf-ocarte details.calc summary { font-size: 12.5px; color: var(--bleu); cursor: pointer; } .ptf-ocarte details.calc .ptf-offre { border: 0; padding: 6px 0 0; }',
    'details.ptf-tout { margin: 16px 0 0; } details.ptf-tout summary { cursor: pointer; font-weight: 700; font-size: 13px; color: var(--encre-2); }',
    '.ptf-fiche-d { display: flex; flex-direction: column; gap: 14px; position: sticky; top: 0; }',
    '.ptf-cli h2 { margin: 0; font-size: 20px; } .ptf-cli-l { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; font-size: 13.5px; }',
    '.ptf-cli-l > div { display: flex; gap: 8px; align-items: flex-start; } .ptf-cli-l .ic { color: var(--encre-3); display: inline-flex; margin-top: 1px; }',
    '.ptf-bloc-d { border-top: 1px solid var(--ligne); padding-top: 12px; } .ptf-bloc-d h4 { margin: 0 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: .03em; color: var(--encre-2); }',
    '.ptf-bloc-d p { margin: 6px 0 0; } .ptf-bloc-d .rouge { color: var(--rouge); }',
    '.ptf-consent { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }',
    '.ptf-consent .can { flex-direction: column; gap: 2px; padding: 8px 4px; font-size: 12px; position: relative; } .ptf-consent .can .e { position: absolute; top: 4px; right: 7px; font-weight: 800; font-size: 12px; }',
    '.ptf-activite { list-style: none; margin: 0; padding: 0 0 0 14px; border-left: 2px solid var(--ligne); display: flex; flex-direction: column; gap: 10px; }',
    '.ptf-activite li { position: relative; font-size: 13px; display: flex; flex-direction: column; } .ptf-activite li::before { content: \'\'; position: absolute; left: -20px; top: 4px; width: 10px; height: 10px; border-radius: 50%; background: var(--vert); border: 2px solid var(--carte); }',
    '.ptf-activite li.avenir::before { background: var(--bleu); } .ptf-activite .d { font-size: 12px; color: var(--encre-3); } .ptf-activite .s { font-size: 12px; color: var(--encre-3); }',
    '.ptf-liens { display: flex; gap: 8px; flex-wrap: wrap; }'
  ].join('\n');
  function css() { if (!document.getElementById('css-portefeuille')) { var s = document.createElement('style'); s.id = 'css-portefeuille'; s.textContent = CSS; document.head.appendChild(s); } }

  /* --------------------------------------------------------------------------------------------- données */
  var cache = { par: {}, enCours: {} }, format = null;
  function charger(cie, force) {
    var cle = cie || '';
    if (cache.enCours[cle] && !force) return cache.enCours[cle];
    var p = { portefeuille: '1' }; if (cie) p.compagnie = cie; if (force === 'frais') p.frais = '1';
    cache.enCours[cle] = AMX.get(p, { delai: 180000, secours: false, gz: true, copie: 'portefeuille_' + (cie || 'defaut') }).then(function (d) {
      cache.enCours[cle] = null;
      if (d && d.refuse) throw new Error(d.erreur || 'Non autorisé.');
      if (!d || d.ok === false) throw new Error((d && d.erreur) || 'Lecture impossible.');
      if (!Array.isArray(d.vehicules)) throw new Error('Le script n\'est pas à jour — déployez la version qui contient Portefeuille.gs.');
      cache.par[d.compagnie || cle] = { rep: d, le: Date.now() };
      try { document.dispatchEvent(new CustomEvent('amx:portefeuille', { detail: { compagnie: d.compagnie } })); } catch (e) {}
      return d;
    }, function (e) { cache.enCours[cle] = null; throw e; });
    return cache.enCours[cle];
  }
  function chargerFormat() {
    if (format) return Promise.resolve(format);
    return AMX.get({ portefeuilleFormat: '1' }, { delai: 60000 }).then(function (d) {
      if (!d || !d.genres) throw new Error('Le script n\'est pas à jour — déployez la version qui contient Portefeuille.gs.');
      format = d; return d;
    });
  }
  /* 5 nov. (nuit) : pages client des offres (PageOffre.gs) — préparées par l'équipe, lues par le client, ses réponses. */
  var pages = { par: {}, enCours: {} };
  function chargerPages(cie, force) {
    if (!cie) return Promise.resolve(null);
    var x = pages.par[cie];
    if (!force && x && Date.now() - x.le < 60000) return Promise.resolve(x.rep);
    if (pages.enCours[cie] && !force) return pages.enCours[cie];
    pages.enCours[cie] = AMX.get({ pagesOffre: '1', compagnie: cie }, { delai: 60000, discret: true }).then(function (d) {
      pages.enCours[cie] = null;
      if (!d || d.refuse || d.ok === false || !Array.isArray(d.pages)) { pages.par[cie] = { rep: null, le: Date.now(), absent: !(d && (d.refuse || d.ok === false)) }; return null; }
      d.parCle = {}; d.pages.forEach(function (p) { (d.parCle[p.cle] = d.parCle[p.cle] || []).push(p); });
      pages.par[cie] = { rep: d, le: Date.now() };
      try { document.dispatchEvent(new CustomEvent('amx:pagesOffre', { detail: { compagnie: cie } })); } catch (e) {}
      return d;
    }, function () { pages.enCours[cie] = null; return null; });
    return pages.enCours[cie];
  }
  function pagesDe(cie, cle) { var x = pages.par[cie]; return x && x.rep && x.rep.parCle ? (x.rep.parCle[cle] || []) : []; }
  var REPONSES = { evaluer: 'veut faire évaluer son véhicule', essai: 'veut un essai routier', rappel: 'demande un rappel', refus: 'ne veut plus recevoir d\'offres' };
  /** L'état de la page client la plus parlante d'un véhicule : refus › réponse à traiter › vue › pas encore vue. */
  function etatPage(liste) {
    if (!liste || !liste.length) return null;
    if (liste.some(function (p) { return p.etat === 'refus'; })) return { cle: 'refus', texte: 'Ne plus recevoir', ton: 'rouge' };
    var t = liste.filter(function (p) { return p.aTraiter; })[0];
    if (t) { var r = t.reponses.filter(function (x) { return x.geste !== 'refus'; }).pop(); return { cle: 'aTraiter', texte: 'Client : ' + (r ? REPONSES[r.geste] : 'a répondu'), ton: 'vert' }; }
    var vues = liste.filter(function (p) { return p.vues; }).reduce(function (n, p) { return n + p.vues; }, 0);
    if (vues) return { cle: 'vue', texte: 'Page vue' + (vues > 1 ? ' ×' + vues : ''), ton: 'bleu' };
    return { cle: 'envoyee', texte: 'Page pas encore vue', ton: '' };
  }
  function perms() { return (AMX.session && AMX.session.perms) || {}; }
  function peutVoir() { var p = perms(); return !!(p.consulter || p.ficheAchat || p.changerStatut || p.voirResultats || p.gererUtilisateurs); }

  /* --------------------------------------------------------------------------------------------- calculs */
  var NOMS_RELATION = { vente: 'Ventes seulement', venteService: 'Ventes et service', service: 'Service seulement', evaluation: 'Évalués (pas clients)' };
  var NOMS_ETAT = { actif: 'Au client', echange: 'Repris en échange', chezNous: 'Revenu chez nous' };
  var NOMS_LCAP = { expres: 'Consentement exprès', tacite: 'Tacite (LCAP, 2 ans)', echu: 'Tacite échu', refus: 'Refus / STOP', inconnu: 'Inconnu' };
  var GARANTIES = { CHEVROLET: [36, 60000], GMC: [36, 60000], BUICK: [36, 60000], CADILLAC: [48, 80000], BMW: [48, 80000], MINI: [48, 80000], VOLKSWAGEN: [48, 80000], VW: [48, 80000], HYUNDAI: [60, 100000], KIA: [60, 100000], GENESIS: [60, 100000], TOYOTA: [36, 60000], HONDA: [36, 60000], NISSAN: [36, 60000], MAZDA: [36, 80000], FORD: [36, 60000] };
  function nombre(x) { if (x === null || x === undefined || x === '') return null; var n = Number(x); return isNaN(n) ? null : n; }
  function auj() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function jours(a, b) { var x = Date.parse(a + 'T12:00:00Z'), y = Date.parse(b + 'T12:00:00Z'); return isNaN(x) || isNaN(y) ? null : Math.round((y - x) / 864e5); }
  function ajMois(iso, n) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); if (!m) return ''; var d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + n, Number(m[3]))); return d.toISOString().slice(0, 10); }
  function arrondi25(x) { return Math.round(x / 25) * 25; }
  function vehiculeTexte(v) { return [v.annee, v.marque, v.modele, v.version].filter(Boolean).join(' ') || '(véhicule à préciser)'; }
  function marqueCle(m) { m = String(m || '').toUpperCase().replace(/[^A-Z]/g, ''); return m === 'VW' ? 'VOLKSWAGEN' : m; }
  function regle(params, v) {
    var rs = (params && params.reglesValeur) || [], mq = marqueCle(v.marque), md = String(v.modele || '').toLowerCase();
    for (var i = 0; i < rs.length; i++) {
      var r = rs[i];
      if (r.marque && marqueCle(r.marque) !== mq) continue;
      if (r.modele && md.indexOf(String(r.modele).toLowerCase()) < 0) continue;
      if (r.anneeMin && (!v.annee || v.annee < r.anneeMin)) continue;
      if (r.anneeMax && (!v.annee || v.annee > r.anneeMax)) continue;
      return r;
    }
    return null;
  }
  /** Tout ce qui dépend des réglages et du jour : valeur, fourchette, dette, équité, segments. */
  function analyser(v, params, ajd) {
    var a = { v: v, segments: [] }, p = params || {};
    a.km = v.km && v.km.projete ? v.km.projete : null;
    /* valeur : OpenLane lu en direct sur ce poste d'abord, sinon celle du portefeuille bâti */
    var ol = AMX.openlane && AMX.openlane.valeur ? AMX.openlane.valeur(v.vin) : null, base = null, kmBase = null, lu = '';
    /* 8 nov. (Maxime, après Équité : « la moyenne des unités vendues et non les prévisions ») : la base est le prix moyen des ventes
       comparables d'OpenLane, jamais la prévision ; le réglage « Ajustement au km » la ramène au km projeté (0 = telle quelle). */
    if (ol && nombre(ol.prixMoy)) { base = nombre(ol.prixMoy); kmBase = nombre(ol.kmMoy); lu = String(ol.luLe || '').slice(0, 10); }
    else if (v.valeur && nombre(v.valeur.prixMoy)) { base = nombre(v.valeur.prixMoy); kmBase = nombre(v.valeur.kmMoy); lu = v.valeur.luLe || ''; }
    if (base) {
      var val = base;
      var tk = nombre(p.tauxKm); if (a.km && kmBase) val += (kmBase - a.km) * (tk !== null ? tk : 0.10);   /* 0 = pas d'ajustement */
      var rg = regle(p, v); if (rg) { val += Number(rg.ajustement) || 0; a.regle = rg; }
      val = Math.max(0, val);
      a.valeur = Math.round(val); a.valeurLu = lu; a.valeurBase = base;
      a.bas = arrondi25(val * (1 - (nombre(p.fourchetteBasPct) || 0) / 100)); a.haut = arrondi25(val * (1 + (nombre(p.fourchetteHautPct) || 0) / 100));
    }
    /* dette du jour : le contrat du prêteur ou du DMS (même calcul que Relance › Équité) */
    if (v.contrat && AMX.equite && AMX.equite.detteDe && /location|lease|financ|retail|loan/i.test(v.contrat.typeContrat || '')) {
      try { a.dette = AMX.equite.detteDe(v.contrat, ajd); } catch (e) { a.dette = null; }
    }
    var comptant = v.contrat && /comptant|cash/i.test(v.contrat.typeContrat || '');
    if (a.valeur !== undefined && a.dette && a.dette.solde !== null) a.equite = Math.round(a.valeur - a.dette.solde);
    else if (a.valeur !== undefined && comptant) a.equite = a.valeur;
    /* mois depuis l'achat, fin du contrat */
    if (v.achat && v.achat.le) a.moisAchat = Math.floor((jours(v.achat.le, ajd) || 0) / 30.44);
    if (v.contrat && v.contrat.echeance) a.finDans = jours(ajd, v.contrat.echeance);
    /* garantie de base (neuf vendu par nous, ou mise en service connue du DMS) */
    var g = GARANTIES[marqueCle(v.marque)], debut = v.livreLe || (v.achat && v.achat.type === 'neuf' ? v.achat.le : '');
    if (g && debut) {
      var fin = ajMois(debut, g[0]), dj = jours(ajd, fin), kmRestant = a.km !== null ? g[1] - a.km : null;
      a.garantie = { fin: fin, km: g[1], dans: dj, kmRestant: kmRestant };
    }
    if (v.etat !== 'actif') return a;
    var S = a.segments, mois = nombre(p.finContratMois) || 6;
    if (a.finDans !== undefined && a.finDans !== null && a.finDans >= 0 && a.finDans <= mois * 30.5) S.push(/location|lease/i.test(v.contrat.typeContrat) ? 'finLocation' : 'finFinancement');
    if (a.equite !== undefined && a.equite >= (nombre(p.seuilEquite) || 0)) S.push('equitePositive');
    if (a.moisAchat !== undefined && a.moisAchat >= (nombre(p.sweetSpotMin) || 30) && a.moisAchat <= (nombre(p.sweetSpotMax) || 54)) S.push('sweetSpot');
    var inactif = nombre(p.serviceInactifMois) || 12;
    if (v.service && v.service.derniere && (jours(v.service.derniere, ajd) || 0) > inactif * 30.44 && (jours(v.service.derniere, ajd) || 0) < 1100) S.push('serviceInactif');
    if (v.relation === 'service') S.push('serviceSeulement');
    if (v.relation === 'vente' && (a.moisAchat || 0) >= 6) S.push('achatSansService');
    if (a.garantie && ((a.garantie.dans !== null && a.garantie.dans >= 0 && a.garantie.dans <= 183) || (a.garantie.kmRestant !== null && a.garantie.kmRestant >= 0 && v.km && v.km.parJour && a.garantie.kmRestant <= v.km.parJour * 183))) S.push('garantieFin');
    if (v.evaluation && v.evaluation.statut === 'perdu' && (jours(v.evaluation.le, ajd) || 999) <= 120) S.push('evaluationPerdue');
    if (v.consent && v.consent.falaise) S.push('falaise');
    if (v.prochainRdv) S.push('rdvProchain');
    /* offres du moteur (MoteurOffres.gs) : calculées à la construction du portefeuille */
    var marge = nombre(p.margePaiement); if (marge === null) marge = 50;
    a.offres = v.offres || [];
    var pretes = a.offres.filter(function (o) { return o.statut === 'prete'; });
    a.meilleure = (pretes.length ? pretes : a.offres).slice().sort(function (x, y) { var ex = x.ecart === null ? 1e9 : Math.abs(x.ecart), ey = y.ecart === null ? 1e9 : Math.abs(y.ecart); return ex - ey; })[0] || null;
    if (pretes.length) S.push('offrePrete');
    if (pretes.some(function (o) { return o.ecart !== null && o.ecart !== undefined && o.ecart <= marge; })) S.unshift('paiementSemblable');
    return a;
  }
  var SEGMENTS = [
    ['paiementSemblable', 'Paiement semblable', 'offre prête, au plus {marge} de plus par mois'],
    ['offrePrete', 'Offre prête', 'tous les chiffres connus'],
    ['finLocation', 'Fin de location', 'dans les {mois} prochains mois'],
    ['finFinancement', 'Fin de financement', 'dans les {mois} prochains mois'],
    ['equitePositive', 'Équité positive', '{seuil} et plus (valeur − dette du jour)'],
    ['sweetSpot', 'Bon moment pour remplacer', 'achat il y a {min} à {max} mois'],
    ['rdvProchain', 'Rendez-vous au service à venir', 'offre à préparer avant la visite'],
    ['serviceInactif', 'Service inactif', 'aucune visite depuis {inactif} mois'],
    ['serviceSeulement', 'Service seulement', 'jamais acheté chez nous'],
    ['achatSansService', 'Achat sans visite au service', 'acheté ici, jamais revu au service'],
    ['garantieFin', 'Garantie de base qui finit', 'dans 6 mois (temps ou km)'],
    ['evaluationPerdue', 'Évaluation perdue', 'dans les 120 derniers jours'],
    ['falaise', 'Consentement qui finit', 'tacite LCAP, dans 90 jours']
  ];
  var NOM_SEGMENT = {}; SEGMENTS.forEach(function (s) { NOM_SEGMENT[s[0]] = s[1]; });
  function texteSegment(s, p) { return s[2].replace('{marge}', AMX.fmtArgent(p.margePaiement === undefined ? 50 : p.margePaiement)).replace('{mois}', p.finContratMois || 6).replace('{seuil}', AMX.fmtArgent(p.seuilEquite || 0)).replace('{min}', p.sweetSpotMin || 30).replace('{max}', p.sweetSpotMax || 54).replace('{inactif}', p.serviceInactifMois || 12); }
  function joignable(v) { var c = v.consent || {}; return c.lcap === 'expres' || c.lcap === 'tacite'; }
  function offresOk(v) { var c = v.consent || {}; return c.lcap === 'expres' || (!c.loi25 && c.lcap === 'tacite'); }

  /* --------------------------------------------------------------------------------------------- visuel (6 nov.)
     Maxime : « regarde à nouveau comment Unleashd (Drive AI) est bien fait […] les graphiques, les véhicules, les sections, je veux
     que notre module soit aussi bien fait sinon mieux, les photos des véhicules ». D'où : un Aperçu en graphiques (cliquer un
     graphique filtre la liste — Drive AI ne le fait pas), une liste en cartes avec la photo du véhicule, une fiche client en deux
     colonnes (véhicule, offres avec la photo du véhicule de notre stock ; coordonnées, consentement par canal, activité).
     Photos : celles de NOTRE site (D2C, chemin gardé par l'import du matin, AMX.photosD2c.image) — la photo exacte du NIV
     quand le véhicule est dans notre stock, sinon une photo « représentative » d'un véhicule du même modèle de notre stock,
     sinon une silhouette dessinée selon la catégorie (VUS, auto, camionnette, fourgonnette, sport). Jamais d'image d'un tiers.
     Couleurs des graphiques vérifiées (daltonisme, contraste) : une série = vert de la marque ; catégories = bleu, orange,
     sarcelle (+ gris pour « inconnu ») ; âge = rampe de verts ; équité = orange (négative) ↔ bleu (positive). */
  var C_VERT = '#008840', C_PISTE = '#E6F4EC', C_BLEU = '#2a78d6', C_ORANGE = '#eb6834', C_SARCELLE = '#1baf7a', C_GRIS = '#9aa3ad';
  var C_AGES = ['#6DBB8E', '#33A066', '#008840', '#005228'];
  var NS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs, enfants) {
    var e = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]); });
    (enfants || []).forEach(function (c) { if (c === null || c === undefined) return; e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function court(n) { n = Math.round(n || 0); return Math.abs(n) >= 10000 ? (Math.round(n / 100) / 10).toString().replace('.', ',') + ' k' : AMX.fmtNombre(n); }
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }

  /* Infobulle commune : tout élément qui porte data-tip (texte) l'affiche au survol. */
  var bulle = null;
  function brancherBulles(racine) {
    if (!bulle) { bulle = h('div.ptf-bulle'); document.body.appendChild(bulle); }
    racine.addEventListener('mousemove', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-tip]') : null;
      if (!t || !racine.contains(t)) { bulle.style.display = 'none'; return; }
      bulle.textContent = t.getAttribute('data-tip'); bulle.style.display = 'block';
      var x = e.clientX + 14, y = e.clientY + 14, w = bulle.offsetWidth, hh = bulle.offsetHeight;
      if (x + w > window.innerWidth - 8) x = e.clientX - w - 14; if (y + hh > window.innerHeight - 8) y = e.clientY - hh - 14;
      bulle.style.left = x + 'px'; bulle.style.top = y + 'px';
    });
    racine.addEventListener('mouseleave', function () { if (bulle) bulle.style.display = 'none'; });
  }

  /* Catégorie d'un véhicule d'après son modèle (même table que MoteurOffres.gs, MOF_SEGMENTS_). */
  var CATS = {
    vus: ['trax', 'trailblazer', 'encore', 'kona', 'venue', 'taos', 'x1', 'x2', 'countryman', 'kicks', 'hr-v', 'seltos', 'niro', 'corolla cross', 'qashqai', 'cx-30', 'equinox', 'terrain', 'tucson', 'tiguan', 'x3', 'escape', 'rav4', 'cr-v', 'rogue', 'cx-5', 'cx-50', 'sportage', 'envision', 'xt4', 'q5', 'glc', 'nx', 'forester', 'outback', 'atlas', 'blazer', 'traverse', 'acadia', 'enclave', 'xt5', 'xt6', 'santa fe', 'palisade', 'x5', 'x4', 'x6', 'x7', 'highlander', 'pilot', 'pathfinder', 'sorento', 'telluride', 'explorer', 'edge', 'cx-9', 'cx-90', 'murano', 'passport', 'grand cherokee', 'cherokee', 'tahoe', 'suburban', 'yukon', 'escalade', 'expedition', 'sequoia', 'armada', 'equinox ev', 'blazer ev', 'lyriq', 'optiq', 'vistiq', 'ioniq 5', 'ioniq 9', 'kona electric', 'id.4', 'id4', 'ix', 'ix1', 'ix3', 'ev9', 'bolt euv', 'santa cruz'],
    camion: ['silverado', 'sierra', 'f-150', 'f-250', 'f-350', 'ram', 'tundra', 'titan', 'colorado', 'canyon', 'tacoma', 'ranger', 'frontier', 'ridgeline', 'maverick', 'hummer'],
    fourgonnette: ['express', 'savana', 'pacifica', 'sienna', 'carnival', 'odyssey', 'grand caravan', 'transit', 'promaster', 'id.buzz', 'sprinter'],
    sport: ['camaro', 'corvette', 'm2', 'm4', 'm8', 'z4', 'mustang', 'supra', '86', 'brz', 'mx-5', 'miata', 'serie 4', 'serie 8', 'i8'],
    auto: ['malibu', 'elantra', 'jetta', 'golf', 'gti', 'civic', 'corolla', 'sentra', 'mazda3', 'forte', 'sonata', 'camry', 'accord', 'k5', 'arteon', 'passat', 'ct4', 'ct5', '330', '320', '328', '340', '530', '540', 'serie', 'a3', 'a4', 'c-class', 'cla', 'bolt', 'ioniq 6', 'ioniq', 'i4', 'i5', 'i7', 'accent', 'cruze', 'spark', 'sonic', 'impala', 'cooper', 'mini', 'veloster', 'beetle', 'm3', 'm5', 'regal', 'ats', 'cts', 'xts']
  };
  var NOMS_CAT = { vus: 'VUS', auto: 'Autos', camion: 'Camionnettes', fourgonnette: 'Fourgonnettes', sport: 'Sport', autre: 'À préciser' };
  var CACHE_CAT = {};
  function categorieDe(marque, modele) {
    var m = ' ' + String(modele || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9.\- ]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
    if (CACHE_CAT[m]) return CACHE_CAT[m];
    var ordre = ['fourgonnette', 'camion', 'sport', 'vus', 'auto'], r = 'autre';
    for (var i = 0; i < ordre.length && r === 'autre'; i++) {
      var l = CATS[ordre[i]];
      for (var j = 0; j < l.length; j++) if (m.indexOf(' ' + l[j] + ' ') >= 0) { r = ordre[i]; break; }
    }
    if (r === 'autre' && /^ x\d/.test(m)) r = 'vus';
    if (r === 'autre' && /^ (\d{3}[ide]|m\d)/.test(m)) r = 'auto';
    return (CACHE_CAT[m] = r);
  }
  /* Silhouettes dessinées ici (profil de côté), une par catégorie — 240 × 100. */
  var SILH = {
    auto: 'M14,72 Q14,60 30,57 L70,52 Q88,34 112,32 L150,32 Q172,33 192,50 L216,54 Q228,57 228,66 L228,74 Q228,79 222,79 L201,79 A21,21 0 0 0 159,79 L81,79 A21,21 0 0 0 39,79 L20,79 Q14,79 14,73 Z',
    vus: 'M12,73 L12,56 Q12,49 21,48 L48,46 L70,26 Q74,22 83,22 L176,22 Q185,22 191,29 L210,46 L224,48 Q230,50 230,58 L230,74 Q230,79 224,79 L203,79 A21,21 0 0 0 161,79 L81,79 A21,21 0 0 0 39,79 L18,79 Q12,79 12,73 Z',
    camion: 'M10,74 L10,52 Q10,47 17,47 L56,45 L75,24 Q79,20 88,20 L128,20 Q134,20 134,26 L134,46 L227,46 Q232,46 232,51 L232,74 Q232,79 226,79 L205,79 A21,21 0 0 0 163,79 L83,79 A21,21 0 0 0 41,79 L16,79 Q10,79 10,74 Z',
    fourgonnette: 'M12,74 L12,40 Q12,21 34,20 L192,18 Q205,18 213,30 L226,48 Q230,53 230,60 L230,74 Q230,79 224,79 L203,79 A21,21 0 0 0 161,79 L81,79 A21,21 0 0 0 39,79 L18,79 Q12,79 12,74 Z',
    sport: 'M14,73 Q14,63 27,61 L78,55 Q102,38 126,37 L150,37 Q170,39 190,53 L218,57 Q228,59 228,67 L228,74 Q228,79 222,79 L201,79 A21,21 0 0 0 159,79 L81,79 A21,21 0 0 0 39,79 L20,79 Q14,79 14,73 Z'
  };
  var VITRES = {
    auto: 'M78,52 Q92,38 112,37 L148,37 Q166,38 182,51 Z',
    vus: 'M58,46 L76,28 Q79,26 85,26 L172,26 Q180,26 185,31 L201,46 Z',
    camion: 'M64,45 L79,27 Q82,25 88,25 L127,25 L127,45 Z',
    fourgonnette: 'M30,40 Q30,27 44,26 L190,24 Q199,24 205,33 L214,46 L30,46 Z',
    sport: 'M86,55 Q104,42 126,41 L148,41 Q164,43 178,53 Z'
  };
  function silhouette(cat) {
    cat = SILH[cat] ? cat : (cat === 'autre' ? 'vus' : 'auto');
    return svg('svg', { viewBox: '0 0 240 100', class: 'ptf-silh', 'aria-hidden': 'true' }, [
      svg('path', { d: SILH[cat], fill: '#C9D0D8' }), svg('path', { d: VITRES[cat], fill: '#EEF2F6' }),
      svg('circle', { cx: 60, cy: 79, r: 15, fill: '#4B5563' }), svg('circle', { cx: 60, cy: 79, r: 6, fill: '#AEB6C1' }),
      svg('circle', { cx: 182, cy: 79, r: 15, fill: '#4B5563' }), svg('circle', { cx: 182, cy: 79, r: 6, fill: '#AEB6C1' })
    ]);
  }
  /* Photo d'un véhicule : exacte (NIV dans notre stock), sinon représentative (même modèle dans notre stock), sinon silhouette. */
  var INDEX_PHOTOS = { cle: '', par: {} };
  function cleModele(marque, modele) {
    var mq = marqueCle(marque), md = String(modele || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9. ]+/g, ' ').trim().split(/\s+/);
    var mots = md.slice(0, /^(1500|2500|3500|ev|hybrid|hybride|electric|xl|esv|hd|cross|fe|5|6|9)$/.test(md[1] || '') ? 2 : 1).join(' ');
    return mq + '|' + mots;
  }
  function indexPhotos() {
    var im = AMX.photosD2c && AMX.photosD2c.images ? AMX.photosD2c.images() : {}, cles = Object.keys(im);
    var cle = cles.length + '|' + (cles[0] || '');
    if (INDEX_PHOTOS.cle === cle) return INDEX_PHOTOS.par;
    var par = {}, base = AMX.photosD2c.base();
    cles.forEach(function (vin) { var x = im[vin]; var k = cleModele(x[1], x[2]); (par[k] = par[k] || []).push({ url: base + x[0], annee: Number(x[3]) || 0, neuf: x[4] === 'n' }); });
    INDEX_PHOTOS = { cle: cle, par: par };
    return par;
  }
  function photoDe(vin, marque, modele, annee) {
    var ex = vin && AMX.photosD2c && AMX.photosD2c.image ? AMX.photosD2c.image(vin) : null;
    if (ex) return { url: ex.url, exacte: true };
    var l = indexPhotos()[cleModele(marque, modele)];
    if (!l || !l.length) return null;
    var a = Number(annee) || 0, m = l.slice().sort(function (x, y) { return Math.abs(x.annee - a) - Math.abs(y.annee - a); })[0];
    return { url: m.url, exacte: false, annee: m.annee };
  }
  /** Élément photo : { vin, marque, modele, annee, grand, drive } — drive : chercher nos photos (app) du NIV si rien d'exact. */
  function elPhoto(o) {
    var cat = categorieDe(o.marque, o.modele), cadre = h('div.ptf-photo' + (o.grand ? '.grand' : '')), p = photoDe(o.vin, o.marque, o.modele, o.annee);
    function silh() { AMX.vider(cadre); cadre.classList.add('silh'); cadre.appendChild(silhouette(cat)); if (o.grand) cadre.appendChild(h('span.note', { text: 'Pas de photo' })); }
    function image(url, note) {
      AMX.vider(cadre); cadre.classList.remove('silh');
      var img = h('img', { src: url, alt: '', loading: 'lazy', decoding: 'async' });
      img.addEventListener('error', function () { silh(); });
      cadre.appendChild(img);
      if (note) cadre.appendChild(h('span.note', { text: note }));
    }
    if (p) image(p.url, p.exacte ? '' : (o.grand ? 'Photo représentative' + (p.annee ? ' (' + p.annee + ')' : '') : ''));
    else silh();
    if (o.drive && o.vin && (!p || !p.exacte) && AMX.photosDe) {
      AMX.photosDe(o.vin).then(function (ph) { if (ph && ph.length && AMX.vignetteDrive) image(AMX.vignetteDrive(ph[0].url, o.grand ? 800 : 300), o.grand ? 'Photo prise par l\'équipe' : ''); }).catch(function () {});
    }
    return cadre;
  }

  /* ---------------- petits graphiques (SVG maison, couleurs vérifiées) ---------------- */
  /** Sucettes (Drive AI « Customer Contact Information ») : items [{ lib, n, couleur, tip, clic }]. */
  function graphSucettes(items) {
    var W = 820, H = 230, base = 182, haut = 34, bas = base - 32, max = Math.max.apply(null, items.map(function (i) { return i.n; }).concat([1]));
    var pas = W / items.length, g = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'ptf-svg', role: 'img' });
    [0, 1, 2, 3].forEach(function (k) { var y = base - (base - haut) * k / 3; g.appendChild(svg('line', { x1: 0, x2: W, y1: y, y2: y, stroke: '#EEF1F4', 'stroke-width': 1 })); });
    items.forEach(function (it, i) {
      var x = pas * i + pas / 2, y = bas - (bas - haut) * (it.n / max);
      var grp = svg('g', { class: 'ptf-clic', 'data-tip': it.tip || (it.lib + ' : ' + AMX.fmtNombre(it.n)), tabindex: it.clic ? 0 : null, role: it.clic ? 'button' : null });
      grp.appendChild(svg('line', { x1: x, x2: x, y1: base, y2: y + 22, stroke: '#C9D0D8', 'stroke-width': 2 }));
      grp.appendChild(svg('circle', { cx: x, cy: base, r: 3, fill: '#C9D0D8' }));
      grp.appendChild(svg('circle', { cx: x, cy: y, r: 23, fill: it.couleur || C_VERT, stroke: '#fff', 'stroke-width': 2 }));
      grp.appendChild(svg('text', { x: x, y: y + 4.5, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 700, fill: '#fff' }, [court(it.n)]));
      it.lib.split('\n').forEach(function (l, k) { grp.appendChild(svg('text', { x: x, y: base + 20 + k * 14, 'text-anchor': 'middle', 'font-size': 12, fill: '#4B5563' }, [l])); });
      if (it.clic) { grp.addEventListener('click', it.clic); grp.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); it.clic(); } }); }
      g.appendChild(grp);
    });
    return g;
  }
  /** Anneau : segs [{ lib, n, couleur, clic }], centre { v, t }. Légende HTML à côté (valeurs et %). */
  function graphAnneau(segs, centre) {
    var tot = segs.reduce(function (s, x) { return s + x.n; }, 0), R = 62, r = 42, cx = 80, cy = 80, g = svg('svg', { viewBox: '0 0 160 160', class: 'ptf-svg anneau', role: 'img' });
    var a0 = -Math.PI / 2, ecart = segs.filter(function (s) { return s.n; }).length > 1 ? 0.025 : 0;
    function pt(rr, a) { return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)]; }
    if (!tot) g.appendChild(svg('circle', { cx: cx, cy: cy, r: (R + r) / 2, fill: 'none', stroke: '#EEF1F4', 'stroke-width': R - r }));
    segs.forEach(function (s) {
      if (!s.n) return;
      var ang = s.n / tot * Math.PI * 2, a1 = a0 + ecart / 2, a2 = a0 + ang - ecart / 2; a0 += ang;
      if (ang >= Math.PI * 2 - 0.001) { g.appendChild(svg('circle', { cx: cx, cy: cy, r: (R + r) / 2, fill: 'none', stroke: s.couleur, 'stroke-width': R - r, class: 'ptf-clic', 'data-tip': s.lib + ' : ' + AMX.fmtNombre(s.n) + ' (100 %)' })); return; }
      var gr = ang - ecart > Math.PI ? 1 : 0, p1 = pt(R, a1), p2 = pt(R, a2), p3 = pt(r, a2), p4 = pt(r, a1);
      var chemin = svg('path', { d: 'M' + p1 + ' A' + R + ',' + R + ' 0 ' + gr + ' 1 ' + p2 + ' L' + p3 + ' A' + r + ',' + r + ' 0 ' + gr + ' 0 ' + p4 + ' Z', fill: s.couleur, class: 'ptf-clic', 'data-tip': s.lib + ' : ' + AMX.fmtNombre(s.n) + ' (' + pct(s.n, tot) + ' %)' });
      if (s.clic) chemin.addEventListener('click', s.clic);
      g.appendChild(chemin);
    });
    if (centre) { g.appendChild(svg('text', { x: cx, y: cy + 2, 'text-anchor': 'middle', 'font-size': 20, 'font-weight': 800, fill: '#111827' }, [String(centre.v)])); g.appendChild(svg('text', { x: cx, y: cy + 19, 'text-anchor': 'middle', 'font-size': 10.5, fill: '#4B5563' }, [centre.t || ''])); }
    var leg = h('div.ptf-legende');
    segs.forEach(function (s) { leg.appendChild(h('button.ptf-leg' + (s.clic ? '' : '.fixe'), { type: 'button', disabled: !s.clic, onclick: s.clic || null }, [h('i', { style: { background: s.couleur } }), h('span.l', { text: s.lib }), h('b', { text: AMX.fmtNombre(s.n) }), h('span.p', { text: pct(s.n, tot) + ' %' })])); });
    return h('div.ptf-anneau', [g, leg]);
  }
  /** Barres horizontales HTML (piste pâle, valeur à droite) : items [{ lib, n, icone, couleur, clic, s }]. */
  function graphBarres(items, opts) {
    opts = opts || {}; var max = Math.max.apply(null, items.map(function (i) { return i.n; }).concat([1])), z = h('div.ptf-barres');
    items.forEach(function (it) {
      var el = h((it.clic ? 'button' : 'div') + '.ptf-bh' + (it.clic ? '' : '.fixe'), { type: it.clic ? 'button' : null, onclick: it.clic || null, 'data-tip': it.tip || null }, [
        h('span.l', [it.icone ? h('span.ic', { html: it.icone }) : null, document.createTextNode(it.lib)]),
        h('span.piste', [h('i', { style: { width: Math.max(it.n ? 1.5 : 0, it.n / max * 100) + '%', background: it.couleur || C_VERT } })]),
        h('b', { text: AMX.fmtNombre(it.n) + (opts.pct ? ' · ' + pct(it.n, opts.pct) + ' %' : '') })
      ]);
      z.appendChild(el);
    });
    return z;
  }
  /** Colonnes (une série, ou empilées) : cols [{ lib, parts: [{ n, couleur, lib }], clic, tip }]. */
  function graphColonnes(cols, opts) {
    opts = opts || {};
    var W = opts.largeur || 560, H = 220, g0 = 30, d0 = 8, base = 186, haut = 22;
    var tots = cols.map(function (c) { return c.parts.reduce(function (s, p) { return s + p.n; }, 0); });
    var max = Math.max.apply(null, tots.concat([1])), pasY = Math.pow(10, Math.floor(Math.log10(max))) || 1;
    var mx = Math.ceil(max / pasY) * pasY; if (mx / pasY > 6) { pasY *= 2; mx = Math.ceil(max / pasY) * pasY; }
    var g = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'ptf-svg', role: 'img' }), larg = (W - g0 - d0) / cols.length, bar = Math.min(28, larg * 0.6);
    for (var v = 0; v <= mx; v += pasY) { var y = base - (base - haut) * v / mx; g.appendChild(svg('line', { x1: g0, x2: W - d0, y1: y, y2: y, stroke: v ? '#EEF1F4' : '#C9D0D8', 'stroke-width': 1 })); g.appendChild(svg('text', { x: g0 - 6, y: y + 4, 'text-anchor': 'end', 'font-size': 10.5, fill: '#5F6978' }, [court(v)])); }
    cols.forEach(function (c, i) {
      var x = g0 + larg * i + (larg - bar) / 2, y = base, grp = svg('g', { class: 'ptf-clic', 'data-tip': c.tip || (c.lib.replace(/\n/g, ' ') + ' : ' + AMX.fmtNombre(tots[i])) });
      c.parts.forEach(function (p, k) {
        if (!p.n) return;
        var hh = (base - haut) * p.n / mx, dessus = k === c.parts.length - 1 || !c.parts.slice(k + 1).some(function (q) { return q.n; });
        var yy = y - hh, rr = dessus ? Math.min(4, hh) : 0;
        grp.appendChild(svg('path', { d: 'M' + x + ',' + y + ' L' + x + ',' + (yy + rr) + ' Q' + x + ',' + yy + ' ' + (x + rr) + ',' + yy + ' L' + (x + bar - rr) + ',' + yy + ' Q' + (x + bar) + ',' + yy + ' ' + (x + bar) + ',' + (yy + rr) + ' L' + (x + bar) + ',' + y + ' Z', fill: p.couleur }));
        y = yy - (dessus ? 0 : 2);
      });
      if (tots[i] && opts.valeurs !== false) grp.appendChild(svg('text', { x: x + bar / 2, y: y - 5, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: '#111827' }, [court(tots[i])]));
      c.lib.split('\n').forEach(function (l, k) { grp.appendChild(svg('text', { x: x + bar / 2, y: base + 15 + k * 12, 'text-anchor': 'middle', 'font-size': 10.5, fill: '#4B5563' }, [l])); });
      grp.appendChild(svg('rect', { x: g0 + larg * i, y: haut - 10, width: larg, height: base - haut + 40, fill: 'transparent' }));
      if (c.clic) grp.addEventListener('click', c.clic);
      g.appendChild(grp);
    });
    return g;
  }
  /** Bulles ventes / service (Drive AI « Sales / Service ») : deux cercles qui se chevauchent. */
  function graphBulles(vente, deux, service, clics) {
    var W = 300, H = 210, tv = vente + deux, ts = service + deux, max = Math.max(tv, ts, 1);
    var rv = 22 + 58 * Math.sqrt(tv / max), rs = 22 + 58 * Math.sqrt(ts / max), cy = 112;
    var chev = deux ? Math.min(rv, rs) * Math.min(0.9, 0.25 + deux / Math.max(1, Math.min(tv, ts))) : 0;
    var cxv = W / 2 - (rv + rs - chev) / 2 + rv - 18, cxs = cxv + rv + rs - chev;
    if (cxs + rs > W - 6) { var dec = cxs + rs - (W - 6); cxv -= dec; cxs -= dec; }
    var g = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'ptf-svg', role: 'img' });
    var c1 = svg('circle', { cx: cxv, cy: cy, r: rv, fill: C_BLEU, 'fill-opacity': 0.22, stroke: C_BLEU, 'stroke-width': 2, class: 'ptf-clic', 'data-tip': 'Clients qui ont acheté chez nous : ' + AMX.fmtNombre(tv) });
    var c2 = svg('circle', { cx: cxs, cy: cy, r: rs, fill: C_SARCELLE, 'fill-opacity': 0.22, stroke: C_SARCELLE, 'stroke-width': 2, class: 'ptf-clic', 'data-tip': 'Clients du service : ' + AMX.fmtNombre(ts) });
    c1.addEventListener('click', clics.vente); c2.addEventListener('click', clics.service);
    g.appendChild(c1); g.appendChild(c2);
    var leg = h('div.ptf-legende');
    [['Ventes seulement', vente, C_BLEU, clics.vente], ['Ventes et service', deux, '#2E8F9A', clics.deux], ['Service seulement', service, C_SARCELLE, clics.service]].forEach(function (x) {
      leg.appendChild(h('button.ptf-leg', { type: 'button', onclick: x[3] }, [h('i', { style: { background: x[2] } }), h('span.l', { text: x[0] }), h('b', { text: AMX.fmtNombre(x[1]) }), h('span.p', { text: pct(x[1], vente + deux + service) + ' %' })]));
    });
    return h('div.ptf-anneau', [g, leg]);
  }
  var ICONES_CANAL = {
    texto: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    courriel: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
    tel: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>'
  };
  /** État d'un canal pour un véhicule : 'ok' | 'non' | 'aucun' (pas de coordonnée) | 'consent' (coordonnée mais pas de consentement). */
  function etatCanal(v, canal) {
    var c = v.client || {}, k = v.consent || {}, j = joignable(v);
    if (canal === 'texto') return !c.telephone ? 'aucun' : (k.textoRefus || k.stop ? 'non' : (j ? 'ok' : 'consent'));
    if (canal === 'courriel') return !c.courriel ? 'aucun' : (k.courrielRefus ? 'non' : (j ? 'ok' : 'consent'));
    return !c.telephone ? 'aucun' : (k.ndnc ? 'non' : 'ok');
  }
  var TXT_CANAL = { ok: 'joignable', non: 'refusé', aucun: 'aucune coordonnée', consent: 'pas de consentement' };
  function puceCanaux(v) {
    var z = h('span.ptf-canaux');
    [['texto', 'Texto'], ['courriel', 'Courriel'], ['tel', 'Téléphone']].forEach(function (x) { var e = etatCanal(v, x[0]); z.appendChild(h('span.can.' + e, { html: ICONES_CANAL[x[0]], 'data-tip': x[1] + ' : ' + TXT_CANAL[e], 'aria-label': x[1] + ' : ' + TXT_CANAL[e] })); });
    return z;
  }
  function estEntreprise(nom) { return /\b(inc|ltee|ltée|enr|corp|corporation|compagnie|cie|s\.?e\.?n\.?c|ltd|limited|gestion|transport|construction|entreprises?|location|groupe|services?)\b|\d{4}-\d{4}/i.test(String(nom || '')); }
  function modePaiement(v) {
    var t = String((v.contrat && v.contrat.typeContrat) || (v.achat && v.achat.paiement) || '').toLowerCase();
    if (/location|lease|bail/.test(t)) return 'location';
    if (/financ|retail|loan|pret|prêt|credit|crédit/.test(t)) return 'financement';
    if (/comptant|cash|cheque|chèque/.test(t)) return 'comptant';
    return 'inconnu';
  }
  var NOMS_MODE = { financement: 'Financement', location: 'Location', comptant: 'Comptant', inconnu: 'Inconnu' }, C_MODE = { financement: C_BLEU, location: C_ORANGE, comptant: C_SARCELLE, inconnu: C_GRIS };
  var NOS_MARQUES = { STM: ['CHEVROLET', 'GMC', 'BUICK', 'CADILLAC'], HAWKS: ['CHEVROLET', 'GMC', 'BUICK', 'CADILLAC'], BMW: ['BMW', 'MINI'], VW: ['VOLKSWAGEN'], HYUNDAI: ['HYUNDAI', 'GENESIS'] };
  var TRANCHES_EQ = [[-Infinity, -10000, '−10 k et moins'], [-10000, -5000, '−10 k à −5 k'], [-5000, 0, '−5 k à 0'], [0, 2500, '0 à 2,5 k'], [2500, 5000, '2,5 k à 5 k'], [5000, 10000, '5 k à 10 k'], [10000, Infinity, '10 k et plus']];
  var MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

  AMX.section('portefeuille', {
    titre: 'Portefeuille clients', icone: 'relance', ordre: 31,
    visible: function () { return peutVoir(); },
    monter: function (conteneur, ctx) { return new VuePortefeuille(conteneur, ctx); }
  });
  AMX.portefeuille = { charger: charger, enCache: function (cie) { return cache.par[cie] ? cache.par[cie].rep : null; }, analyser: analyser, vider: function () { cache = { par: {}, enCours: {} }; pages = { par: {}, enCours: {} }; },
    pages: chargerPages, pagesEnCache: function (cie) { return pages.par[cie] ? pages.par[cie].rep : null; },
    reponsesATraiter: function (cie) { var out = []; (cie ? [cie] : Object.keys(pages.par)).forEach(function (c) { var x = pages.par[c]; if (x && x.rep) x.rep.pages.forEach(function (p) { if (p.aTraiter) out.push(p); }); }); return out; } };

  /* --------------------------------------------------------------------------------------------- page */
  function VuePortefeuille(conteneur, ctx) {
    css();
    var self = this, p = (ctx && ctx.params) || {};
    this.conteneur = conteneur; this.detruit = false; this.limite = 150;
    var codes = AMX.codesPour ? AMX.codesPour('inventaire') : [];
    this.cie = AMX.compagnieChoisie ? AMX.compagnieChoisie('inventaire') : '';
    if (!this.cie) this.cie = codes[0] || 'STM';
    this.f = { q: p.q || '', etat: 'actif', relation: '', consent: '', segment: p.segment || '', page: p.page || '' };
    AMX.vider(conteneur);
    this.btnRafraichir = h('button.btn', { type: 'button', text: 'Rafraîchir', onclick: function () { self.charger(true); } });
    this.btnRebatir = h('button.btn', { type: 'button', text: 'Rebâtir maintenant', title: 'Relit toutes les sources tout de suite (sinon chaque nuit après 3 h)', onclick: function () { self.charger('frais'); } });
    this.btnImporter = h('button.btn.primaire', { type: 'button', text: 'Importer un fichier du DMS', onclick: function () { self.importer(); } });
    this.btnReglages = h('button.btn', { type: 'button', text: 'Réglages', onclick: function () { self.reglages(); } });
    this.btnExport = h('button.btn', { type: 'button', text: 'Exporter (Excel)', onclick: function () { self.exporter(); } });
    this.btnProgrammes = h('button.btn', { type: 'button', text: 'Programmes du mois', title: 'Taux, termes, résiduels et rabais du mois, par concession : ils font les offres', onclick: function () { self.programmes(); } });
    this.btnCampagne = h('button.btn', { type: 'button', text: 'Campagne avec cette liste', title: 'Prépare une campagne de textos avec la liste affichée (consentement vérifié, groupe témoin mis de côté) ; rien ne part sans « Envoyer »', onclick: function () { self.creerCampagne(); } });
    this.elSous = h('p', { text: 'Chargement du portefeuille…' });
    conteneur.appendChild(h('div.entete-page', [
      h('div', { style: { minWidth: 0 } }, [h('h1', 'Portefeuille clients'), this.elSous]),
      h('div.actions', AMX.actionsEntete([this.btnRafraichir, this.btnRebatir, this.btnReglages, this.btnExport, this.btnProgrammes, this.btnImporter, this.btnCampagne], [this.btnProgrammes, this.btnImporter, this.btnCampagne]))
    ]));
    this.elCies = h('div.barre-cies'); conteneur.appendChild(this.elCies);
    this.elAvis = h('div'); conteneur.appendChild(this.elAvis);
    /* 6 nov. : deux vues, Aperçu (graphiques) et Clients et offres (cartes) — la vue est gardée sur l'appareil */
    this.vue = p.segment || p.page || p.q ? 'clients' : (AMX.memo.lire('ptf_vue', 'apercu') === 'clients' ? 'clients' : 'apercu');
    this.elVues = h('div.ptf-vues', { role: 'tablist' }); conteneur.appendChild(this.elVues);
    this.elFiltres = h('div'); conteneur.appendChild(this.elFiltres);
    this.elPortee = h('div'); conteneur.appendChild(this.elPortee);
    this.elChiffres = h('div.ptf-chiffres'); conteneur.appendChild(this.elChiffres);
    this.elApercu = h('div.ptf-apercu'); conteneur.appendChild(this.elApercu);
    this.elClients = h('div'); conteneur.appendChild(this.elClients);
    this.elSegments = h('div.ptf-segments'); this.elClients.appendChild(this.elSegments);
    this.elSync = h('p.ptf-sync'); this.elClients.appendChild(this.elSync);
    this.elListe = h('div'); this.elClients.appendChild(this.elListe);
    brancherBulles(conteneur);
    if (AMX.photosD2c && AMX.photosD2c.charger) AMX.photosD2c.charger().then(function () { if (!self.detruit && self.rep) self.planifier(); }).catch(function () {});
    this.construireFiltres();
    this.surCie = function () { var c = AMX.compagnieChoisie('inventaire'); if (c && c !== self.cie && !self.detruit) { self.cie = c; self.charger(); } };
    document.addEventListener('amx:compagnie', this.surCie);
    this.surOl = function () { if (!self.detruit && self.rep) self.planifier(); };
    document.addEventListener('amx:openlane', this.surOl);
    document.addEventListener('amx:pagesOffre', this.surOl);
    if (AMX.openlane && AMX.openlane.charger) AMX.openlane.charger().then(this.surOl).catch(function () {});
    this.charger();
  }
  VuePortefeuille.prototype.demonter = function () { this.detruit = true; this.arreterSync = true; document.removeEventListener('amx:compagnie', this.surCie); document.removeEventListener('amx:openlane', this.surOl); document.removeEventListener('amx:pagesOffre', this.surOl); };
  VuePortefeuille.prototype.naviguer = function (ctx) { var p = (ctx && ctx.params) || {}, chg = false; if (p.segment !== undefined) { this.f.segment = p.segment; chg = true; } if (p.page !== undefined) { this.f.page = p.page; chg = true; } if (chg) { this.vue = 'clients'; this.rafraichir(); } };
  VuePortefeuille.prototype.planifier = function () { var self = this; clearTimeout(this.minuterie); this.minuterie = setTimeout(function () { if (!self.detruit) self.rafraichir(); }, 250); };

  VuePortefeuille.prototype.charger = function (force) {
    var self = this, cie = this.cie;
    this.elSous.textContent = force === 'frais' ? 'Relecture de toutes les sources… (jusqu\'à une minute)' : 'Chargement du portefeuille…';
    var copie = !force && cache.par[cie] ? cache.par[cie].rep : null;
    if (copie) { this.rep = copie; this.rendre(); }
    chargerPages(cie, !!force);
    return charger(cie, force).then(function (d) {
      if (self.detruit || cie !== self.cie) return;
      self.rep = d; self.rendre();
      if (force === 'frais') AMX.toast('Portefeuille rebâti.', 'ok');
    }, function (e) {
      if (self.detruit) return;
      self.elSous.textContent = 'Lecture impossible : ' + AMX.erreurTexte(e);
      if (!self.rep) { AMX.vider(self.elListe); self.elListe.appendChild(h('div.ptf-vide', { text: AMX.erreurTexte(e) })); }
    });
  };

  VuePortefeuille.prototype.construireFiltres = function () {
    var self = this;
    this.inRecherche = h('input.saisie.recherche', { type: 'search', placeholder: 'Client, téléphone, NIV, modèle, conseiller…', value: this.f.q });
    this.inRecherche.addEventListener('input', AMX.debounce ? AMX.debounce(function () { self.f.q = self.inRecherche.value; self.limite = 150; self.rafraichir(); }, 200) : function () { self.f.q = self.inRecherche.value; self.rafraichir(); });
    this.elEtats = h('div.ptf-pastilles'); this.elRelations = h('div.ptf-pastilles'); this.elConsent = h('div.ptf-pastilles'); this.elPages = h('div.ptf-pastilles');
    this.elFiltres.appendChild(h('div.ptf-filtres', [this.inRecherche]));
    this.elFiltres.appendChild(this.elEtats); this.elFiltres.appendChild(this.elRelations); this.elFiltres.appendChild(this.elConsent); this.elFiltres.appendChild(this.elPages);
  };

  VuePortefeuille.prototype.rendre = function () {
    var self = this, d = this.rep; if (!d) return;
    var p = perms(), direction = !!d.peutImporter;
    [this.btnRebatir, this.btnImporter, this.btnReglages].forEach(function (b) { b.style.display = direction ? '' : 'none'; });
    this.btnCampagne.style.display = direction || p.envoyerCampagnes ? '' : 'none';
    AMX.barreConcessions(this.elCies, { domaine: 'inventaire', valeur: this.cie, sansToutes: true, compte: function (c) { var x = cache.par[c]; return x ? x.rep.resume.actifs : null; }, onchange: function (c) { if (c && c !== self.cie) { self.cie = c; self.charger(); } } });
    var r = d.resume || {}, s = r.sources || {};
    this.elSous.textContent = 'Bâti le ' + (d.construitLe ? AMX.fmtDate(d.construitLe, true) : '—') + ' · ' + AMX.fmtNombre(r.actifs || 0) + ' véhicules au client · sources : ventes ' + AMX.fmtNombre(s.vente || 0) + ', prêteurs ' + AMX.fmtNombre(s.preteur || 0) + ', service ' + AMX.fmtNombre(s.service || 0) + ', évaluations ' + AMX.fmtNombre(s.evaluation || 0) + ', DMS ' + AMX.fmtNombre(s.dms || 0) + (d.offres ? ' · offres : stock ' + AMX.fmtNombre(d.offres.stockNeufs) + ' neufs et ' + AMX.fmtNombre(d.offres.stockOccasion) + ' occasions, ' + AMX.fmtNombre(d.offres.programmes) + ' programme' + (d.offres.programmes > 1 ? 's' : '') + ' ce mois' + (d.offres.modelesGm ? ', taux de la Financière GM pour ' + AMX.fmtNombre(d.offres.modelesGm) + ' modèle' + (d.offres.modelesGm > 1 ? 's' : '') : '') : '') + (d.aRebatir ? ' · changement reçu, rebâti dans la minute' : '');
    /* avis : le DMS */
    AMX.vider(this.elAvis);
    var dms = d.dms || {};
    if (!dms.vehicules && !dms.bts && !dms.clients) {
      this.elAvis.appendChild(h('div.ptf-avis', [
        h('p', { html: '<b>Les fichiers du DMS ne sont pas encore reçus.</b> Les clients « service seulement » (souvent la moitié du portefeuille et plus) viendront avec eux. En attendant, le portefeuille est bâti avec les ventes du Livre des ventes, les contrats des prêteurs, le service (Texto, Rendez-vous) et les évaluations.' }),
        direction ? h('button.btn.petit', { type: 'button', text: 'Importer un fichier du DMS', onclick: function () { self.importer(); } }) : null
      ]));
    }
    if (d.offres && !d.offres.programmes && !d.offres.modelesGm) this.elAvis.appendChild(h('div.ptf-avis', [
      h('p', { html: '<b>Aucun programme du mois pour cette concession.</b> Les offres utilisent les taux et les termes par défaut des réglages et restent « à réviser » tant que les programmes du constructeur (taux, résiduels, rabais) ne sont pas saisis.' }),
      h('button.btn.petit', { type: 'button', text: 'Programmes du mois', onclick: function () { self.programmes(); } })
    ]));
    if ((d.erreurs || []).length && direction) this.elAvis.appendChild(h('div.ptf-avis', [h('p', { text: 'Sources illisibles au dernier passage : ' + d.erreurs.join(' · ') })]));
    this.rafraichir();
  };

  /* La liste analysée, filtrée (sauf un filtre au choix, pour compter les pastilles). */
  VuePortefeuille.prototype.analyses = function () {
    var d = this.rep, ajd = auj(), cle = (d && d.construitLe) + '|' + JSON.stringify(d && d.params) + '|' + (AMX.openlane && AMX.openlane.enCache && AMX.openlane.enCache() ? Object.keys(AMX.openlane.enCache()).length : 0);
    if (this._cle === cle && this._an) return this._an;
    this._cle = cle;
    this._an = (d ? d.vehicules : []).map(function (v) { return analyser(v, d.params, ajd); });
    return this._an;
  };
  VuePortefeuille.prototype.garde = function (a, sauf) {
    var f = this.f, v = a.v;
    if (sauf !== 'etat' && f.etat && v.etat !== f.etat) return false;
    if (sauf !== 'relation' && f.relation && v.relation !== f.relation) return false;
    if (sauf !== 'consent' && f.consent) {
      if (f.consent === 'joignable' && !joignable(v)) return false;
      if (f.consent === 'offres' && !offresOk(v)) return false;
      if (f.consent === 'nonJoignable' && joignable(v)) return false;
    }
    if (sauf !== 'segment' && f.segment && a.segments.indexOf(f.segment) < 0) return false;
    if (sauf !== 'graph' && f.graph && f.graph.test && !f.graph.test(a)) return false;
    if (sauf !== 'page' && f.page) { var ep = etatPage(pagesDe(this.cie, v.cle)); if (f.page === 'aucune' ? !!ep : (!ep || ep.cle !== f.page)) return false; }
    if (sauf !== 'q' && f.q) {
      var c = v.client || {};
      if (!AMX.correspond([c.nom, c.telephone, c.courriel, c.ville, c.noClient, v.vin, vehiculeTexte(v), v.achat && v.achat.conseiller, v.contrat && v.contrat.compte, v.plaque], f.q)) return false;
    }
    return true;
  };
  VuePortefeuille.prototype.filtrees = function (sauf) { var self = this; return this.analyses().filter(function (a) { return self.garde(a, sauf); }); };

  VuePortefeuille.prototype.rafraichir = function () {
    if (!this.rep) return;
    var self = this, d = this.rep, params = d.params || {};
    this.pastilles(this.elEtats, 'État', 'etat', [['actif', NOMS_ETAT.actif], ['echange', NOMS_ETAT.echange], ['chezNous', NOMS_ETAT.chezNous], ['', 'Tous']], function (a, k) { return !k || a.v.etat === k; });
    this.pastilles(this.elRelations, 'Relation', 'relation', [['', 'Toutes'], ['vente', NOMS_RELATION.vente], ['venteService', NOMS_RELATION.venteService], ['service', NOMS_RELATION.service], ['evaluation', NOMS_RELATION.evaluation]], function (a, k) { return !k || a.v.relation === k; });
    this.pastilles(this.elConsent, 'Consentement', 'consent', [['', 'Tous'], ['joignable', 'Joignables (LCAP)'], ['offres', 'Offres personnalisées OK'], ['nonJoignable', 'Pas joignables']], function (a, k) { return !k || (k === 'joignable' ? joignable(a.v) : (k === 'offres' ? offresOk(a.v) : !joignable(a.v))); });
    var repPages = pages.par[this.cie] ? pages.par[this.cie].rep : null;
    if (repPages && (repPages.pages.length || this.f.page)) this.pastilles(this.elPages, 'Page client', 'page', [['', 'Toutes'], ['aTraiter', 'Réponses à traiter'], ['vue', 'Vues'], ['envoyee', 'Pas encore vues'], ['refus', 'Ne plus recevoir'], ['aucune', 'Sans page']], function (a, k) { var e = etatPage(pagesDe(self.cie, a.v.cle)); return !k || (k === 'aucune' ? !e : (e && e.cle === k)); });
    else AMX.vider(this.elPages);
    var liste = this.filtrees(), apercu = this.vue === 'apercu';
    if (apercu) liste = this.filtrees('graph');
    this.rendreVues(apercu ? this.filtrees().length : liste.length);
    var filtres = [];
    if (this.f.etat) filtres.push(NOMS_ETAT[this.f.etat]);
    if (this.f.relation) filtres.push(NOMS_RELATION[this.f.relation]);
    if (this.f.consent) filtres.push({ joignable: 'Joignables', offres: 'Offres OK', nonJoignable: 'Pas joignables' }[this.f.consent]);
    if (this.f.segment) filtres.push(NOM_SEGMENT[this.f.segment]);
    if (this.f.page) filtres.push({ aTraiter: 'Réponses à traiter', vue: 'Pages vues', envoyee: 'Pages pas encore vues', refus: 'Ne plus recevoir', aucune: 'Sans page client' }[this.f.page]);
    if (this.f.q) filtres.push('« ' + this.f.q + ' »');
    if (this.f.graph && !apercu) filtres.push(this.f.graph.libelle);
    this._filtresTexte = filtres.filter(function (x) { return x && x !== NOM_SEGMENT[self.f.segment] && !(self.f.etat === 'actif' && x === NOMS_ETAT.actif); }).join(' · ');
    var nCamp = liste.filter(function (a) { return a.v.etat === 'actif'; }).length;
    this.btnCampagne.textContent = 'Campagne avec cette liste (' + AMX.fmtNombre(nCamp) + ')';
    AMX.porteeChiffres(this.elPortee, { n: liste.length, unite: ['véhicule', 'véhicules'], contexte: AMX.COMPAGNIES_TOUTES[this.cie] || this.cie, filtres: filtres, effacer: function () { self.f = { q: '', etat: 'actif', relation: '', consent: '', segment: '', page: '', graph: null }; self.inRecherche.value = ''; self.rafraichir(); } });
    this.rendreChiffres(liste, params);
    this.elApercu.style.display = apercu ? '' : 'none';
    this.elClients.style.display = apercu ? 'none' : '';
    if (apercu) { this.rendreApercu(liste); return; }
    this.rendreSegments(params);
    this.rendreSync(liste);
    this.rendreListe(liste);
  };
  /* 6 nov. (sprint 6) : la liste affichée devient une campagne (campagnes-relance.js, CampagnesRelance.gs). Le serveur refait toutes
     les vérifications (consentement, Loi 25, STOP, offre prête) et met le groupe témoin de côté. */
  VuePortefeuille.prototype.creerCampagne = function () {
    if (!AMX.campagnesRelance) { AMX.toast('Le module des campagnes n\'est pas chargé : rechargez la page.', 'erreur'); return; }
    var liste = this.filtrees().filter(function (a) { return a.v.etat === 'actif'; });
    if (!liste.length) { AMX.toast('La liste est vide : choisissez un segment ou des filtres.', 'attention'); return; }
    AMX.campagnesRelance.preparer({ cie: this.cie, cles: liste.map(function (a) { return a.v.cle; }), segment: this.f.segment ? NOM_SEGMENT[this.f.segment] : '', filtres: this._filtresTexte || '' });
  };
  VuePortefeuille.prototype.pastilles = function (el, libelle, cle, options, test) {
    var self = this, base = this.filtrees(cle);
    AMX.vider(el); el.appendChild(h('span.l', { text: libelle + ' :' }));
    options.forEach(function (o) {
      var n = base.filter(function (a) { return test(a, o[0]); }).length;
      el.appendChild(h('button' + (self.f[cle] === o[0] ? '.actif' : ''), { type: 'button', onclick: function () { self.f[cle] = o[0]; self.limite = 150; self.rafraichir(); } }, [o[1], h('span.n', { text: AMX.fmtNombre(n) })]));
    });
  };
  VuePortefeuille.prototype.rendreChiffres = function (liste, params) {
    AMX.vider(this.elChiffres);
    var self = this, n = liste.length;
    var clients = {}; liste.forEach(function (a) { clients[a.v.clientCle || a.v.cle] = 1; });
    var avecVal = liste.filter(function (a) { return a.valeur !== undefined; });
    var eqPos = liste.filter(function (a) { return a.equite !== undefined && a.equite >= (nombre(params.seuilEquite) || 0); });
    var totEq = eqPos.reduce(function (s, a) { return s + a.equite; }, 0);
    var tel = liste.filter(function (a) { var c = a.v.client || {}, k = a.v.consent || {}; return c.telephone && !k.textoRefus && joignable(a.v); }).length;
    var cour = liste.filter(function (a) { var c = a.v.client || {}, k = a.v.consent || {}; return c.courriel && !k.courrielRefus && joignable(a.v); }).length;
    var falaise = liste.filter(function (a) { return a.v.consent && a.v.consent.falaise; }).length;
    var ages = liste.filter(function (a) { return a.v.annee; }), age = ages.length ? ages.reduce(function (s, a) { return s + (new Date().getFullYear() - a.v.annee); }, 0) / ages.length : null;
    function carte(t, v, s) { self.elChiffres.appendChild(h('div.ptf-chiffre', [h('div.t', { text: t }), h('div.v', { text: v }), s ? h('div.s', { text: s }) : null])); }
    carte('Véhicules', AMX.fmtNombre(n), AMX.fmtNombre(Object.keys(clients).length) + ' clients');
    carte('Avec une valeur', AMX.fmtNombre(avecVal.length), n ? Math.round(avecVal.length / n * 100) + ' % · OpenLane (gros)' : '');
    carte('Équité positive', AMX.fmtNombre(eqPos.length), eqPos.length ? AMX.fmtArgent(totEq) + ' en tout' : 'valeur et dette connues');
    carte('Joignables par texto', AMX.fmtNombre(tel), 'courriel : ' + AMX.fmtNombre(cour));
    carte('Consentement qui finit', AMX.fmtNombre(falaise), 'tacite, dans 90 jours');
    var pretes = liste.filter(function (a) { return a.segments.indexOf('offrePrete') >= 0; }).length, semb = liste.filter(function (a) { return a.segments.indexOf('paiementSemblable') >= 0; }).length;
    carte('Offres prêtes', AMX.fmtNombre(pretes), 'paiement semblable : ' + AMX.fmtNombre(semb));
    carte('Âge moyen', age === null ? '—' : (Math.round(age * 10) / 10).toString().replace('.', ',') + ' ans', '');
  };
  VuePortefeuille.prototype.rendreSegments = function (params) {
    var self = this, base = this.filtrees('segment');
    AMX.vider(this.elSegments);
    SEGMENTS.forEach(function (s) {
      var n = base.filter(function (a) { return a.segments.indexOf(s[0]) >= 0; }).length;
      self.elSegments.appendChild(h('button.ptf-segment' + (self.f.segment === s[0] ? '.actif' : '') + (n ? '' : '.zero'), { type: 'button', onclick: function () { self.f.segment = self.f.segment === s[0] ? '' : s[0]; self.limite = 150; self.rafraichir(); } }, [
        h('b', { text: s[1] }), h('span.n', { text: AMX.fmtNombre(n) }), h('span.s', { text: texteSegment(s, params) })
      ]));
    });
  };
  /* Valeurs OpenLane à lire : le poste qui a la session OpenLane du site les lit, 3 à la fois, sur demande. */
  VuePortefeuille.prototype.peutLireOpenlane = function () {
    if (!AMX.openlane || !AMX.openlane.direct || AMX.openlane.enDirect() === false) return false;
    var p = perms(); return !!(p.ficheAchat || p.changerStatut || p.gererUtilisateurs || (AMX.estAdmin && AMX.estAdmin()));
  };
  VuePortefeuille.prototype.rendreSync = function (liste) {
    var self = this; AMX.vider(this.elSync);
    var sans = liste.filter(function (a) { return a.valeur === undefined && a.v.vin && a.v.etat === 'actif'; });
    if (this.sync && this.sync.enCours) {
      this.elSync.appendChild(document.createTextNode('Lecture des valeurs OpenLane : ' + this.sync.faits + ' sur ' + this.sync.total + '… '));
      this.elSync.appendChild(h('button.lien', { type: 'button', text: 'Arrêter', onclick: function () { self.arreterSync = true; } }));
      return;
    }
    if (!sans.length || !this.peutLireOpenlane()) return;
    this.elSync.appendChild(document.createTextNode(AMX.fmtNombre(sans.length) + ' véhicules de cette liste sans valeur. '));
    this.elSync.appendChild(h('button.btn.petit', { type: 'button', text: 'Lire les valeurs OpenLane (' + Math.min(60, sans.length) + ')', onclick: function () { self.lireValeurs(sans.slice(0, 60)); } }));
  };
  VuePortefeuille.prototype.lireValeurs = function (liste) {
    var self = this, i = 0, actifs = 0; this.arreterSync = false;
    this.sync = { enCours: true, faits: 0, total: liste.length };
    return new Promise(function (fin) {
      function suivant() {
        if (self.detruit) return fin();
        if ((self.arreterSync || i >= liste.length) && !actifs) { self.sync.enCours = false; self.planifier(); return fin(); }
        while (actifs < 3 && i < liste.length && !self.arreterSync) {
          var a = liste[i++]; actifs++;
          AMX.openlane.direct(a.v.vin, a.km || '', { source: 'portefeuille', compagnie: self.cie }).catch(function () {}).then(function (r) {
            actifs--; self.sync.faits++;
            if (r && r.nonConnecte) self.arreterSync = true;
            self.planifier(); suivant();
          });
        }
        self.rendreSync(self.filtrees());
      }
      suivant();
    });
  };

  /** La cellule « Meilleure offre » : véhicule, paiement, écart avec le paiement actuel. */
  function celluleOffre(a) {
    var o = a.meilleure; if (!o) return [h('span.s', { text: '—' })];
    var ec = o.ecart === null || o.ecart === undefined ? null : o.ecart;
    return [h('b', { text: o.vehicule }), h('span', { text: AMX.fmtArgent(o.paiement) + ' / mois · ' + (o.type === 'location' ? 'location ' : 'financement ') + o.terme + ' mois' }),
      ec !== null ? h('span.ec' + (ec > 0 ? '.plus' : '.moins'), { text: (ec > 0 ? '+' : '') + AMX.fmtArgent(ec) + ' vs actuel' }) : null,
      h('span.s', { text: (o.statut === 'prete' ? 'prête' : 'à réviser') + (a.offres.length > 1 ? ' · ' + a.offres.length + ' offres' : '') })];
  }
  function dateAn(iso) { iso = String(iso || '').slice(0, 10); return iso ? AMX.fmtDateCourte(iso + 'T12:00:00') + ' ' + iso.slice(0, 4) : ''; }
  function puceConsent(v) {
    var c = v.consent || {};
    if (c.lcap === 'refus') return h('span.ptf-puce.rouge', { text: c.stop ? 'STOP' : 'Refus' });
    if (c.lcap === 'expres') return h('span.ptf-puce.vert', { text: 'Exprès' });
    if (c.lcap === 'tacite') return h('span.ptf-puce' + (c.falaise ? '.ambre' : '.bleu'), { text: 'Tacite → ' + dateAn(c.jusqua) });
    if (c.lcap === 'echu') return h('span.ptf-puce.ambre', { text: 'Échu' });
    return h('span.ptf-puce', { text: 'Inconnu' });
  }
  function contactTexte(c, rep) {
    if (!rep.contact) return [c.telephone ? 'téléphone au dossier' : '', c.courriel ? 'courriel au dossier' : ''].filter(Boolean).join(' · ');
    return [c.telephone ? AMX.telephoneTexte ? AMX.telephoneTexte(c.telephone) : c.telephone : '', c.courriel].filter(Boolean).join(' · ');
  }
  /* --------------------------------------------------------------------------------------------- Aperçu / Clients (6 nov.) */
  VuePortefeuille.prototype.rendreVues = function (nClients) {
    var self = this; AMX.vider(this.elVues);
    [['apercu', 'Aperçu'], ['clients', 'Clients et offres']].forEach(function (x) {
      var actif = self.vue === x[0];
      self.elVues.appendChild(h('button.ptf-vue' + (actif ? '.actif' : ''), { type: 'button', role: 'tab', 'aria-selected': actif ? 'true' : 'false', onclick: function () { self.choisirVue(x[0]); } }, [x[1], x[0] === 'clients' ? h('span.n', { text: AMX.fmtNombre(nClients) }) : null]));
    });
  };
  VuePortefeuille.prototype.choisirVue = function (v) { this.vue = v; try { AMX.memo.ecrire('ptf_vue', v); } catch (e) {} this.rafraichir(); };
  /** Un clic dans un graphique de l'Aperçu : filtre la liste et montre les clients. */
  VuePortefeuille.prototype.filtrerGraphique = function (libelle, test) {
    this.f.graph = { libelle: libelle, test: test }; this.limite = 150;
    this.choisirVue('clients');
    try { this.elVues.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
  };
  VuePortefeuille.prototype.filtrerPastille = function (cle, valeur) {
    this.f[cle] = valeur; this.f.graph = null; this.limite = 150;
    this.choisirVue('clients');
    try { this.elVues.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
  };

  VuePortefeuille.prototype.rendreApercu = function (base) {
    var self = this, el = this.elApercu, d = this.rep, ajd = auj(), annee = Number(ajd.slice(0, 4));
    AMX.vider(el);
    if (!base.length) { el.appendChild(h('div.ptf-vide', { text: (d && d.vehicules.length) ? 'Aucun véhicule avec ces filtres.' : 'Le portefeuille est vide pour cette concession.' })); return; }
    function carte(cls, titre, sous, corps, pied) { var c = h('section.ptf-carte.' + cls, [h('header', [h('h3', { text: titre }), sous ? h('p', { text: sous }) : null]), corps, pied || null]); el.appendChild(c); return c; }
    function filtre(lib, test) { return function () { self.filtrerGraphique(lib, test); }; }
    function chiffres(l) { return h('div.ptf-pied', l.map(function (x) { return h(x[2] ? 'button.ptf-pc' : 'div.ptf-pc.fixe', { type: x[2] ? 'button' : null, onclick: x[2] || null }, [h('span.t', { text: x[0] }), h('b', { text: x[1] })]); })); }
    /* clients (une personne, plusieurs véhicules) */
    var parClient = {}; base.forEach(function (a) { var k = a.v.clientCle || a.v.cle; if (!parClient[k]) parClient[k] = a; });
    var clients = Object.keys(parClient).map(function (k) { return parClient[k]; }), nCli = clients.length;
    function cc(t) { return clients.filter(t).length; }
    function cv(t) { return base.filter(t).length; }
    var tel = function (a) { return !!(a.v.client || {}).telephone; }, cou = function (a) { return !!(a.v.client || {}).courriel; };
    var adr = function (a) { var c = a.v.client || {}; return !!(c.ville || c.codePostal); }, jo = function (a) { return joignable(a.v); };
    var njo = function (a) { return !joignable(a.v); }, fal = function (a) { return !!(a.v.consent && a.v.consent.falaise); };
    var complet = function (a) { return tel(a) && cou(a) && adr(a); }, sans = function (a) { return !tel(a) && !cou(a); };

    /* 1. Coordonnées */
    carte('c8', 'Coordonnées des clients', AMX.fmtNombre(nCli) + ' clients · ' + AMX.fmtNombre(base.length) + ' véhicules — cliquez un rond pour voir la liste', graphSucettes([
      { lib: 'Téléphones', n: cc(tel), clic: filtre('Avec un téléphone', tel) },
      { lib: 'Courriels', n: cc(cou), clic: filtre('Avec un courriel', cou) },
      { lib: 'Adresses', n: cc(adr), clic: filtre('Avec une adresse', adr) },
      { lib: 'Joignables\n(LCAP)', n: cc(jo), clic: filtre('Joignables (LCAP)', jo) },
      { lib: 'Pas\njoignables', n: cc(njo), couleur: C_ORANGE, clic: filtre('Pas joignables', njo), tip: 'Ni consentement exprès, ni tacite en cours (ou refus, STOP)' },
      { lib: 'Consentement\nqui finit (90 j)', n: cc(fal), couleur: C_ORANGE, clic: filtre('Consentement qui finit dans 90 jours', fal), tip: 'Consentement tacite LCAP qui finit dans les 90 jours : à renouveler par une visite ou un achat' }
    ]), chiffres([['Clients complets', AMX.fmtNombre(cc(complet)), filtre('Clients complets (téléphone, courriel, adresse)', complet)], ['Sans coordonnées', AMX.fmtNombre(cc(sans)), filtre('Sans téléphone ni courriel', sans)], ['Clients', AMX.fmtNombre(nCli)], ['Véhicules', AMX.fmtNombre(base.length)]]));

    /* 2. Ventes et service */
    var nV = cv(function (a) { return a.v.relation === 'vente'; }), nVS = cv(function (a) { return a.v.relation === 'venteService'; }), nS = cv(function (a) { return a.v.relation === 'service'; }), nE = cv(function (a) { return a.v.relation === 'evaluation'; });
    carte('c4', 'Ventes et service', 'véhicules du portefeuille', graphBulles(nV, nVS, nS, { vente: function () { self.filtrerPastille('relation', 'vente'); }, deux: function () { self.filtrerPastille('relation', 'venteService'); }, service: function () { self.filtrerPastille('relation', 'service'); } }),
      nE ? chiffres([['Évalués seulement', AMX.fmtNombre(nE), function () { self.filtrerPastille('relation', 'evaluation'); }]]) : null);

    /* 3. Joignables en numérique */
    var okT = function (a) { return etatCanal(a.v, 'texto') === 'ok'; }, okC = function (a) { return etatCanal(a.v, 'courriel') === 'ok'; }, okTel = function (a) { return etatCanal(a.v, 'tel') === 'ok'; };
    var lesDeux = function (a) { return okT(a) && okC(a); };
    carte('c4', 'Joignables en numérique', AMX.fmtNombre(cc(function (a) { return okT(a) || okC(a); })) + ' clients joignables par texto ou courriel', graphBarres([
      { lib: 'Texto', icone: ICONES_CANAL.texto, n: cc(okT), clic: filtre('Joignables par texto', okT), tip: 'Cellulaire au dossier, consentement en cours, pas de STOP' },
      { lib: 'Courriel', icone: ICONES_CANAL.courriel, n: cc(okC), clic: filtre('Joignables par courriel', okC) },
      { lib: 'Texto et courriel', icone: ICONES_CANAL.texto + ICONES_CANAL.courriel, n: cc(lesDeux), clic: filtre('Joignables par texto et courriel', lesDeux) },
      { lib: 'Téléphone', icone: ICONES_CANAL.tel, n: cc(okTel), clic: filtre('Joignables par téléphone (pas « Ne pas téléphoner »)', okTel), tip: 'Téléphone au dossier, pas sur une liste « Ne pas téléphoner »' }
    ], { pct: nCli }));

    /* 4. Offres */
    var actifs = base.filter(function (a) { return a.v.etat === 'actif'; });
    var pr = function (a) { return a.segments.indexOf('offrePrete') >= 0; }, rev = function (a) { return (a.offres || []).length && a.segments.indexOf('offrePrete') < 0; }, so = function (a) { return a.v.etat === 'actif' && !(a.offres || []).length; };
    var nPr = actifs.filter(pr).length, nSem = actifs.filter(function (a) { return a.segments.indexOf('paiementSemblable') >= 0; }).length;
    carte('c4', 'Offres', 'véhicules au client', graphAnneau([
      { lib: 'Offre prête', n: nPr, couleur: C_BLEU, clic: filtre('Offre prête', pr) },
      { lib: 'À réviser', n: actifs.filter(rev).length, couleur: C_ORANGE, clic: filtre('Offre à réviser', rev) },
      { lib: 'Sans offre', n: actifs.filter(so).length, couleur: C_GRIS, clic: filtre('Sans offre', so) }
    ], { v: court(nPr), t: 'prêtes' }), chiffres([['Paiement semblable', AMX.fmtNombre(nSem), function () { self.f.graph = null; self.filtrerPastille('segment', 'paiementSemblable'); }]]));

    /* 5. Catégories de véhicules */
    var cats = {}; base.forEach(function (a) { var k = categorieDe(a.v.marque, a.v.modele); cats[k] = (cats[k] || 0) + 1; });
    carte('c4', 'Catégories de véhicules', 'd\'après le modèle', graphBarres(['vus', 'auto', 'camion', 'fourgonnette', 'sport', 'autre'].filter(function (k) { return cats[k]; }).map(function (k) {
      return { lib: NOMS_CAT[k], n: cats[k], couleur: k === 'autre' ? C_GRIS : C_VERT, clic: filtre('Catégorie : ' + NOMS_CAT[k], function (a) { return categorieDe(a.v.marque, a.v.modele) === k; }) };
    }), { pct: base.length }));

    /* 6. Modèles principaux */
    var nos = NOS_MARQUES[this.cie] || [], modeles = {};
    base.forEach(function (a) {
      var v = a.v, k = cleModele(v.marque, v.modele); if (!v.marque && !v.modele) k = '|?';
      var m = modeles[k] || (modeles[k] = { k: k, marque: v.marque || '', modele: k.split('|')[1] || '(à préciser)', n: 0, financement: 0, location: 0, comptant: 0, inconnu: 0, nos: nos.indexOf(marqueCle(v.marque)) >= 0 });
      m.n++; m[modePaiement(v)]++;
      if (!m.modeleAffiche || String(v.modele || '').length < m.modeleAffiche.length) m.modeleAffiche = String(v.modele || '').split(/\s+/).slice(0, k.split('|')[1].split(' ').length).join(' ');
    });
    var lm = Object.keys(modeles).map(function (k) { return modeles[k]; }).sort(function (x, y) { return y.n - x.n; });
    var nNos = lm.filter(function (m) { return m.nos; }).reduce(function (s, m) { return s + m.n; }, 0);
    this.ongletModeles = this.ongletModeles || 'nos';
    var corpsModeles = h('div'), tabsM = h('div.ptf-mini-onglets');
    function dessinerModeles() {
      AMX.vider(corpsModeles); AMX.vider(tabsM);
      [['nos', 'Nos marques (' + pct(nNos, base.length) + ' %)'], ['autres', 'Autres marques (' + pct(base.length - nNos, base.length) + ' %)']].forEach(function (x) { tabsM.appendChild(h('button' + (self.ongletModeles === x[0] ? '.actif' : ''), { type: 'button', onclick: function () { self.ongletModeles = x[0]; dessinerModeles(); } }, x[1])); });
      var l = lm.filter(function (m) { return self.ongletModeles === 'nos' ? m.nos : !m.nos; }), tout = !!self.modelesTout;
      var tb = h('tbody');
      l.slice(0, tout ? 40 : 8).forEach(function (m) {
        var test = function (a) { return (a.v.marque || a.v.modele ? cleModele(a.v.marque, a.v.modele) : '|?') === m.k; };
        tb.appendChild(h('tr.ptf-clic', { onclick: filtre('Modèle : ' + (m.marque + ' ' + (m.modeleAffiche || m.modele)).trim(), test), 'data-tip': 'Voir les ' + AMX.fmtNombre(m.n) + ' véhicules' }, [
          h('td.mq', [m.marque && AMX.logoMarque ? AMX.logoMarque(m.marque) : null]),
          h('td', [h('b', { text: m.modeleAffiche || m.modele }), h('span.s', { text: m.marque })]),
          h('td.num', [h('b', { text: AMX.fmtNombre(m.location) }), h('span.s', { text: 'location' })]),
          h('td.num', [h('b', { text: AMX.fmtNombre(m.financement) }), h('span.s', { text: 'financement' })]),
          h('td.num', [h('b', { text: AMX.fmtNombre(m.comptant) }), h('span.s', { text: 'comptant' })]),
          h('td.num', [h('b', { text: AMX.fmtNombre(m.inconnu) }), h('span.s', { text: 'inconnu' })]),
          h('td.num', [h('b', { text: AMX.fmtNombre(m.n) }), h('span.s', { text: 'total' })])
        ]));
      });
      corpsModeles.appendChild(l.length ? h('table.ptf-modeles', [tb]) : h('p.doux', { text: 'Aucun véhicule.' }));
      if (l.length > 8) corpsModeles.appendChild(h('button.lien', { type: 'button', text: tout ? 'Voir moins' : 'Voir les ' + Math.min(40, l.length) + ' premiers modèles', onclick: function () { self.modelesTout = !tout; dessinerModeles(); } }));
    }
    dessinerModeles();
    carte('c7', 'Modèles principaux', 'par mode d\'achat (contrat du prêteur, sinon le Livre des ventes)', h('div', [tabsM, corpsModeles]));

    /* 7. Âge des véhicules */
    var tranches = [[0, 2, '0 à 2 ans'], [3, 5, '3 à 5 ans'], [6, 8, '6 à 8 ans'], [9, 99, '9 ans et plus']], ages = base.filter(function (a) { return a.v.annee; });
    var moy = ages.length ? ages.reduce(function (s, a) { return s + (annee - a.v.annee); }, 0) / ages.length : null;
    var coulAge = [C_AGES[3], C_AGES[2], C_AGES[1], C_AGES[0]];
    var colsAge = tranches.map(function (t, i) {
      var test = function (a) { var g = a.v.annee ? annee - a.v.annee : null; return g !== null && g >= t[0] && g <= t[1]; };
      return { lib: t[2], parts: [{ n: base.filter(test).length, couleur: coulAge[i] }], clic: filtre('Âge : ' + t[2], test) };
    });
    var legAge = h('div.ptf-legende');
    colsAge.forEach(function (c, i) { legAge.appendChild(h('button.ptf-leg', { type: 'button', onclick: c.clic }, [h('i', { style: { background: coulAge[i] } }), h('span.l', { text: c.lib }), h('b', { text: AMX.fmtNombre(c.parts[0].n) }), h('span.p', { text: pct(c.parts[0].n, base.length) + ' %' })])); });
    carte('c5', 'Âge des véhicules', moy === null ? 'année inconnue' : 'moyenne ' + (Math.round(moy * 10) / 10).toString().replace('.', ',') + ' ans', h('div.ptf-cote', [graphColonnes(colsAge, { largeur: 380 }), legAge]));

    /* 8. Équité */
    var avecEq = base.filter(function (a) { return a.equite !== undefined; }), posTot = avecEq.filter(function (a) { return a.equite > 0; }).reduce(function (s, a) { return s + a.equite; }, 0);
    var colsEq = TRANCHES_EQ.map(function (t) {
      var test = function (a) { return a.equite !== undefined && a.equite >= t[0] && a.equite < t[1]; };
      return { lib: t[2].replace(' à ', '\nà ').replace(' et ', '\net '), parts: [{ n: avecEq.filter(test).length, couleur: t[1] <= 0 ? C_ORANGE : C_BLEU }], clic: filtre('Équité : ' + t[2], test), tip: 'Équité ' + t[2] + ' : ' + AMX.fmtNombre(avecEq.filter(test).length) + ' véhicules' };
    });
    carte('c7', 'Équité (valeur − dette du jour)', AMX.fmtNombre(avecEq.length) + ' véhicules avec valeur et dette connues · équité positive : ' + AMX.fmtArgent(posTot) + ' en tout',
      h('div', [h('div.ptf-legende.horiz', [h('span.ptf-leg.fixe', [h('i', { style: { background: C_ORANGE } }), h('span.l', { text: 'Équité négative' })]), h('span.ptf-leg.fixe', [h('i', { style: { background: C_BLEU } }), h('span.l', { text: 'Équité positive' })])]), graphColonnes(colsEq, { largeur: 760 })]),
      h('p.ptf-note', { text: 'Valeur interne : OpenLane (gros), ajustée au km projeté. Pour l\'équipe seulement — jamais montrée au client.' }));

    /* 9. Mode d'achat */
    var modes = { financement: 0, location: 0, comptant: 0, inconnu: 0 }; base.forEach(function (a) { modes[modePaiement(a.v)]++; });
    var ach = base.filter(function (a) { return a.v.achat && a.v.achat.le; });
    var neuf = function (a) { return a.v.achat && a.v.achat.type === 'neuf'; }, occ = function (a) { return a.v.achat && a.v.achat.type === 'usage'; }, an1 = function (a) { return a.v.achat && a.v.achat.le && (jours(a.v.achat.le, ajd) || 9999) <= 365; };
    carte('c5', 'Mode d\'achat', AMX.fmtNombre(ach.length) + ' achats connus', graphAnneau(['financement', 'location', 'comptant', 'inconnu'].map(function (k) {
      return { lib: NOMS_MODE[k], n: modes[k], couleur: C_MODE[k], clic: filtre('Mode d\'achat : ' + NOMS_MODE[k], function (a) { return modePaiement(a.v) === k; }) };
    }), { v: court(base.length - modes.inconnu), t: 'connus' }), chiffres([['Neufs', AMX.fmtNombre(cv(neuf)), filtre('Achetés neufs chez nous', neuf)], ['Occasions', AMX.fmtNombre(cv(occ)), filtre('Achetés d\'occasion chez nous', occ)], ['12 derniers mois', AMX.fmtNombre(cv(an1)), filtre('Achetés dans les 12 derniers mois', an1)]]));

    /* 10. Fins de contrat, 12 prochains mois */
    var moisL = [], d0 = new Date(Number(ajd.slice(0, 4)), Number(ajd.slice(5, 7)) - 1, 1);
    for (var i = 0; i < 12; i++) { var dm = new Date(d0.getFullYear(), d0.getMonth() + i, 1); moisL.push(dm.getFullYear() + '-' + ('0' + (dm.getMonth() + 1)).slice(-2)); }
    var colsFin = moisL.map(function (mo) {
      var dans = function (a) { return a.v.contrat && String(a.v.contrat.echeance || '').slice(0, 7) === mo; };
      var loc = base.filter(function (a) { return dans(a) && modePaiement(a.v) === 'location'; }).length, fin = base.filter(function (a) { return dans(a) && modePaiement(a.v) !== 'location'; }).length;
      var lib = MOIS_COURTS[Number(mo.slice(5, 7)) - 1] + (mo.slice(5, 7) === '01' || mo === moisL[0] ? '\n' + mo.slice(0, 4) : '');
      return { lib: lib, parts: [{ n: fin, couleur: C_BLEU }, { n: loc, couleur: C_ORANGE }], clic: filtre('Contrat qui finit en ' + MOIS_COURTS[Number(mo.slice(5, 7)) - 1] + ' ' + mo.slice(0, 4), dans), tip: MOIS_COURTS[Number(mo.slice(5, 7)) - 1] + ' ' + mo.slice(0, 4) + ' : ' + loc + ' location' + (loc > 1 ? 's' : '') + ', ' + fin + ' financement' + (fin > 1 ? 's' : '') };
    });
    var nFin = colsFin.reduce(function (s, c) { return s + c.parts[0].n + c.parts[1].n; }, 0);
    carte('c7', 'Fins de contrat — 12 prochains mois', AMX.fmtNombre(nFin) + ' contrats (prêteurs captifs et DMS)', h('div', [h('div.ptf-legende.horiz', [h('span.ptf-leg.fixe', [h('i', { style: { background: C_BLEU } }), h('span.l', { text: 'Financement' })]), h('span.ptf-leg.fixe', [h('i', { style: { background: C_ORANGE } }), h('span.l', { text: 'Location' })])]), graphColonnes(colsFin, { largeur: 760 })]));

    /* 11. Type de client */
    var ent = function (a) { return estEntreprise((a.v.client || {}).nom); }, par = function (a) { return !estEntreprise((a.v.client || {}).nom); };
    carte('c5', 'Type de client', 'd\'après le nom au dossier', graphAnneau([
      { lib: 'Particuliers', n: cc(par), couleur: C_BLEU, clic: filtre('Particuliers', par) },
      { lib: 'Entreprises', n: cc(ent), couleur: C_ORANGE, clic: filtre('Entreprises', ent) }
    ], { v: court(nCli), t: 'clients' }));

    /* 12. Conseillers */
    var cons = {}; base.forEach(function (a) { var n = a.v.achat && a.v.achat.conseiller ? String(a.v.achat.conseiller).trim() : ''; if (n) cons[n] = (cons[n] || 0) + 1; });
    var lc = Object.keys(cons).sort(function (x, y) { return cons[y] - cons[x]; });
    var sansCons = function (a) { return (a.v.relation === 'vente' || a.v.relation === 'venteService') && !(a.v.achat && a.v.achat.conseiller); };
    var srvSeul = function (a) { return a.v.relation === 'service'; };
    carte('c12', 'Attribution aux conseillers', 'véhicules achetés chez nous, par conseiller de la vente', h('div.ptf-cons', [
      graphBarres(lc.slice(0, 12).map(function (n) { return { lib: n, n: cons[n], clic: filtre('Conseiller : ' + n, function (a) { return a.v.achat && String(a.v.achat.conseiller || '').trim() === n; }) }; })),
      h('div.ptf-cons-s', [[AMX.fmtNombre(lc.length), 'conseillers'], [AMX.fmtNombre(base.length - cv(sansCons) - cv(srvSeul) - nE), 'véhicules attribués'], [AMX.fmtNombre(cv(sansCons)), 'ventes sans conseiller', filtre('Ventes sans conseiller', sansCons)], [AMX.fmtNombre(cv(srvSeul)), 'service seulement (à attribuer)', filtre('Service seulement', srvSeul)]].map(function (x) {
        return h(x[2] ? 'button.ptf-pc' : 'div.ptf-pc.fixe', { type: x[2] ? 'button' : null, onclick: x[2] || null }, [h('b', { text: x[0] }), h('span.t', { text: x[1] })]);
      }))
    ]));
  };

  /* --------------------------------------------------------------------------------------------- liste en cartes */
  function celluleOffreCarte(a) {
    var o = a.meilleure; if (!o) return [h('span.s', { text: a.v.etat === 'actif' ? 'Aucune offre' : NOMS_ETAT[a.v.etat] })];
    var ec = o.ecart === null || o.ecart === undefined ? null : o.ecart;
    return [h('span.ptf-puce' + (o.statut === 'prete' ? '.vert' : '.ambre'), { text: o.statut === 'prete' ? 'Offre prête' : 'À réviser' }),
      h('b.vh', { text: o.vehicule }),
      h('span', { text: AMX.fmtArgent(o.paiement) + ' / mois · ' + (o.type === 'location' ? 'location' : 'financement') + ' ' + o.terme + ' mois' }),
      ec !== null ? h('span.ec' + (ec > 0 ? '.plus' : '.moins'), { text: (ec > 0 ? '+' : '') + AMX.fmtArgent(ec) + ' / mois vs actuel' }) : null,
      a.offres.length > 1 ? h('span.s', { text: a.offres.length + ' offres' }) : null];
  }
  VuePortefeuille.prototype.rendreListe = function (liste) {
    var self = this, d = this.rep;
    AMX.vider(this.elListe);
    if (!liste.length) { this.elListe.appendChild(h('div.ptf-vide', { text: d.vehicules.length ? 'Aucun véhicule avec ces filtres.' : 'Le portefeuille est vide pour cette concession.' })); return; }
    liste = liste.slice().sort(function (a, b) {
      var sa = (a.equite !== undefined ? a.equite : -1e9), sb = (b.equite !== undefined ? b.equite : -1e9);
      if (sb !== sa) return sb - sa;
      return String((b.v.achat && b.v.achat.le) || (b.v.service && b.v.service.derniere) || '').localeCompare(String((a.v.achat && a.v.achat.le) || (a.v.service && a.v.service.derniere) || ''));
    });
    var z = h('div.ptf-rangees');
    z.appendChild(h('div.ptf-rangee.tete', ['', 'Client', 'Véhicule', 'Équité', 'Meilleure offre', 'Contact', ''].map(function (t) { return h('span', { text: t }); })));
    liste.slice(0, this.limite).forEach(function (a) {
      var v = a.v, c = v.client || {}, eq = a.equite;
      var segs = a.segments.filter(function (s) { return s !== 'offrePrete'; }).slice(0, 2).map(function (s) { return h('span.ptf-puce.mauve', { text: NOM_SEGMENT[s] }); });
      var r = h('div.ptf-rangee', { tabindex: '0', role: 'button', 'aria-label': (c.nom || 'Client') + ', ' + vehiculeTexte(v), onclick: function () { self.fiche(a); }, onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); self.fiche(a); } } }, [
        elPhoto({ vin: v.vin, marque: v.marque, modele: v.modele, annee: v.annee }),
        h('div.cli', [h('b', { text: c.nom || '(client inconnu)' }), h('span.s', { text: contactTexte(c, d) || 'aucune coordonnée' }), h('span.s', { text: [c.ville, NOMS_RELATION[v.relation]].filter(Boolean).join(' · ') }), segs.length ? h('div.segs', segs) : null]),
        h('div.veh', [h('div.l1', [h('b', { text: v.annee ? String(v.annee) : '' }), h('span.mq', { text: ' ' + (v.marque || '') })]), h('div.l2', [h('b', { text: v.modele || '(modèle à préciser)' }), v.version ? h('span.ver', { text: ' ' + v.version }) : null]),
          h('span.s', { text: [a.km ? AMX.fmtNombre(a.km) + ' km' : '', v.etat !== 'actif' ? NOMS_ETAT[v.etat] : (v.prochainRdv ? 'RDV service ' + dateAn(v.prochainRdv) : '')].filter(Boolean).join(' · ') })]),
        h('div.eq', [eq !== undefined ? h('span.ptf-beq.' + (eq >= 0 ? 'plus' : 'moins'), { text: (eq > 0 ? '+' : '') + AMX.fmtArgent(eq) }) : h('span.s', { text: a.valeur !== undefined ? 'dette inconnue' : 'valeur à lire' }),
          h('span.s', { text: a.valeur !== undefined ? 'valeur ' + AMX.fmtArgent(a.bas) + ' – ' + AMX.fmtArgent(a.haut) : '' }),
          h('span.s', { text: v.contrat ? (v.contrat.typeContrat || '') + (a.finDans !== undefined && a.finDans !== null && a.finDans >= 0 ? ' · fin ' + dateAn(v.contrat.echeance) : '') : '' })]),
        h('div.of', celluleOffreCarte(a)),
        h('div.ct', [puceCanaux(v), h('div', [puceConsent(v)].concat(puceTPage(pagesDe(self.cie, v.cle))))]),
        h('span.fl', { 'aria-hidden': 'true', text: '›' })
      ]);
      z.appendChild(r);
    });
    this.elListe.appendChild(z);
    if (liste.length > this.limite) this.elListe.appendChild(h('div.ptf-plus', [h('button.btn', { type: 'button', text: 'Afficher ' + Math.min(150, liste.length - this.limite) + ' de plus (' + AMX.fmtNombre(liste.length - this.limite) + ' restants)', onclick: function () { self.limite += 150; self.rendreListe(self.filtrees()); } })]));
  };

  /* --------------------------------------------------------------------------------------------- fiche client */
  var NOMS_GROUPE = { memeModele: 'Même modèle, neuf', memeSegment: 'Même catégorie, neuf', occasion: 'Même modèle, d\'occasion plus récent' };
  function carteOffreVisuelle(o) {
    var m = /^(\d{4})\s+(\S+)\s+(.+)$/.exec(o.vehicule || '') || [], titre = [m[1], m[2], m[3]].filter(Boolean).join(' ') || o.vehicule;
    var ec = o.ecart, prete = o.statut === 'prete';
    var photo = elPhoto({ vin: o.vin, marque: m[2], modele: m[3], annee: m[1], grand: false });
    photo.classList.add('offre');
    return h('div.ptf-ocarte' + (prete ? '.prete' : ''), [
      h('div.haut', [h('span.ptf-etq' + (prete ? '.vert' : '.ambre'), { text: prete ? 'PRÊTE' : 'À RÉVISER' }), h('span.type', { text: (NOMS_GROUPE[o.groupe] || (o.neuf ? 'Neuf' : 'Occasion')).toUpperCase() })]),
      h('div.titre', [h('b', { text: titre })]),
      h('div.boite', [
        h('div', [h('span.t', { text: o.type === 'location' ? 'Location' : 'Financement' }), h('b', { text: AMX.fmtArgent(o.paiement) }), h('span.s', { text: '/ mois · ' + o.terme + ' mois à ' + String(o.taux).replace('.', ',') + ' %' + (o.kmAn ? ' · ' + AMX.fmtNombre(o.kmAn) + ' km/an' : '') })]),
        h('div', [h('span.t', { text: 'Écart' }), h('b.ec' + (ec === null || ec === undefined ? '' : (ec > 0 ? '.plus' : '.moins')), { text: ec === null || ec === undefined ? '—' : (ec > 0 ? '+' : '') + AMX.fmtArgent(ec) }), h('span.s', { text: o.actuel ? 'vs ' + AMX.fmtArgent(o.actuel) + ' / mois actuel' : 'paiement actuel inconnu' })])
      ]),
      photo,
      h('div.pied', { text: [o.stock ? '# ' + o.stock : '', o.jours !== null && o.jours !== undefined ? 'en stock depuis ' + o.jours + ' j' : '', o.programme ? 'programme : ' + (o.programme.note || o.programme.id) : ''].filter(Boolean).join(' · ') }),
      (o.raisons || []).length ? h('div.r', { text: o.raisons.join(' · ') }) : null,
      h('details.calc', [h('summary', { text: 'Détail du calcul' }), carteOffre(o)])
    ]);
  }
  VuePortefeuille.prototype.fiche = function (a) {
    var self = this, v = a.v, c = v.client || {}, d = this.rep, ajd = auj(), m = null;
    function date(iso) { return iso ? AMX.fmtDateCourte(String(iso).slice(0, 10) + 'T12:00:00') + ' ' + String(iso).slice(0, 4) : ''; }
    function dl(lignes) { var x = h('dl.ptf-detail'); lignes.forEach(function (l) { if (l[1] === '' || l[1] === null || l[1] === undefined) return; x.appendChild(h('dt', { text: l[0] })); x.appendChild(h('dd', typeof l[1] === 'string' || typeof l[1] === 'number' ? { text: String(l[1]) } : {}, typeof l[1] === 'object' ? [l[1]] : null)); }); return x; }
    var corps = h('div.ptf-fiche');
    /* les autres véhicules du même client (onglets, comme Drive AI) */
    var memes = v.clientCle ? this.analyses().filter(function (x) { return x.v.clientCle === v.clientCle; }) : [a];
    if (memes.length > 1) {
      var tabs = h('div.ptf-fv-onglets');
      memes.forEach(function (x) { tabs.appendChild(h('button.ptf-fv' + (x === a ? '.actif' : ''), { type: 'button', onclick: function () { if (x === a) return; if (m && m.fermer) m.fermer(); self.fiche(x); } }, [h('b', { text: [x.v.annee, x.v.marque, x.v.modele].filter(Boolean).join(' ') || 'Véhicule' }), h('span', { text: (x.offres || []).length ? x.offres.length + ' offre' + (x.offres.length > 1 ? 's' : '') : NOMS_ETAT[x.v.etat] })])); });
      corps.appendChild(tabs);
    }
    var g = h('div.ptf-fiche-g'), dr = h('aside.ptf-fiche-d');
    corps.appendChild(h('div.ptf-fiche-grille', [g, dr]));
    /* en-tête du véhicule */
    var ct = v.contrat, paiement = ct ? [ct.typeContrat, ct.paiement ? AMX.fmtArgent(ct.paiement) + ' / mois' : ''].filter(Boolean).join(' · ') : (v.achat && v.achat.paiement) || '';
    var infos = [['Date d\'achat', v.achat ? date(v.achat.le) : ''], ['Paiement', paiement], ['Conseiller', v.achat ? v.achat.conseiller : ''], ['Version', v.version], ['Garantie de base', a.garantie ? 'jusqu\'au ' + date(a.garantie.fin) : ''], ['Dernier service', v.service ? date(v.service.derniere) : ''],
      ['Valeur (fourchette)', a.valeur !== undefined ? AMX.fmtArgent(a.bas) + ' – ' + AMX.fmtArgent(a.haut) : ''], ['Dette du jour', a.dette && a.dette.solde !== null ? AMX.fmtArgent(a.dette.solde) : '']];
    var grilleInfos = h('div.ptf-fv-infos');
    infos.forEach(function (x) { grilleInfos.appendChild(h('div', [h('span.t', { text: x[0] }), h('b', { text: x[1] || '—' })])); });
    var badgeEq = a.equite !== undefined ? h('span.ptf-beq.grand.' + (a.equite >= 0 ? 'plus' : 'moins'), { text: (a.equite > 0 ? '+' : '') + AMX.fmtArgent(a.equite) + ' d\'équité' }) : null;
    g.appendChild(h('div.ptf-fv-tete', [
      h('div.ph', [elPhoto({ vin: v.vin, marque: v.marque, modele: v.modele, annee: v.annee, grand: true, drive: true }), h('div.niv', { text: v.vin ? 'NIV : ' + v.vin : 'sans NIV' }), h('div.km', { text: a.km ? AMX.fmtNombre(a.km) + ' km ' + (v.km.methode === 'lectures' ? '(projeté)' : '(estimé)') : '' })]),
      h('div.info', [h('div.nom', [h('b', { text: vehiculeTexte(v) }), badgeEq]), h('div.puces', [h('span.ptf-puce', { text: NOMS_ETAT[v.etat] }), h('span.ptf-puce', { text: NOMS_RELATION[v.relation] || '' })].concat(a.segments.slice(0, 4).map(function (s) { return h('span.ptf-puce.mauve', { text: NOM_SEGMENT[s] }); }))), grilleInfos])
    ]));
    /* offres */
    if ((a.offres || []).length) {
      g.appendChild(h('div.ptf-h2', [h('h3', { text: 'Offres (' + a.offres.length + ')' }), h('span.s', { text: 'calculées le ' + dateAn(d.construitLe) + ' · notre stock et les programmes du mois · paiements avec taxes (' + (d.offres ? String(d.offres.taxePct).replace('.', ',') : '') + ' %), échange au bas de la fourchette' })]));
      var go = h('div.ptf-ocartes'); a.offres.forEach(function (o) { go.appendChild(carteOffreVisuelle(o)); }); g.appendChild(go);
    } else g.appendChild(h('p.doux', { text: v.etat === 'actif' ? 'Aucune offre pour ce véhicule : rien de semblable dans notre stock, ou modèle à préciser.' : 'Ce véhicule n\'est plus au client (' + NOMS_ETAT[v.etat] + ').' }));
    g.appendChild(h('div.ptf-h2', [h('h3', { text: 'Page client' }), h('span.s', { text: 'rien n\'est envoyé d\'ici : préparez la page, copiez le lien et envoyez-le vous-même' })]));
    g.appendChild(this.sectionPages(a));
    /* valeur et équité */
    g.appendChild(h('div.ptf-h2', [h('h3', { text: 'Valeur et équité' })]));
    var zoneVal = h('div');
    function dessinerValeur() {
      AMX.vider(zoneVal);
      var b = analyser(v, d.params, auj());
      zoneVal.appendChild(dl([['Valeur interne', b.valeur !== undefined ? AMX.fmtArgent(b.valeur) + ' (OpenLane, gros, ajustée au km projeté)' + (b.regle ? ' · règle ' + AMX.fmtArgent(b.regle.ajustement) : '') : 'pas encore lue'], ['Fourchette', b.valeur !== undefined ? AMX.fmtArgent(b.bas) + ' – ' + AMX.fmtArgent(b.haut) : ''], ['Lue le', date(b.valeurLu)], ['Dette du jour', b.dette && b.dette.solde !== null ? AMX.fmtArgent(b.dette.solde) + (b.dette.source === 'preteur' ? ' (solde du prêteur reporté à aujourd\'hui)' : (b.dette.source === 'contrat' ? ' (calculée d\'après le contrat)' : '')) : (v.contrat ? 'à calculer' : 'inconnue (financement hors prêteur captif)')], ['Équité', b.equite !== undefined ? AMX.fmtArgent(b.equite) : '']]));
      if (v.vin && self.peutLireOpenlane()) zoneVal.appendChild(h('button.btn.petit', { type: 'button', text: b.valeur !== undefined ? 'Relire la valeur OpenLane' : 'Lire la valeur OpenLane', onclick: function (e) {
        var btn = e.currentTarget; btn.classList.add('occupe');
        AMX.openlane.direct(v.vin, b.km || '', { source: 'portefeuille', compagnie: self.cie, forcer: b.valeur !== undefined }).then(function (r) { btn.classList.remove('occupe'); if (r && r.nonConnecte) AMX.toast('OpenLane n\'est pas branché au site.', 'erreur'); dessinerValeur(); self.planifier(); }, function (er) { btn.classList.remove('occupe'); AMX.toast(AMX.erreurTexte(er), 'erreur'); });
      } }));
      zoneVal.appendChild(h('p.doux.petit', { text: 'La valeur OpenLane est une valeur de gros, pour l\'équipe seulement : elle ne se montre pas au client (licence).' }));
    }
    dessinerValeur(); g.appendChild(zoneVal);
    /* tous les détails (repliés) */
    var det = h('div');
    det.appendChild(h('div.ptf-h', { text: 'Véhicule' }));
    det.appendChild(dl([['NIV', v.vin || 'sans NIV'], ['Plaque', v.plaque], ['État', NOMS_ETAT[v.etat] + (v.echangeLe ? ' le ' + date(v.echangeLe) : '') + (v.chezNous ? ' (registre ' + v.chezNous + ')' : '')], ['Relation', NOMS_RELATION[v.relation]], ['Km projeté', a.km ? AMX.fmtNombre(a.km) + ' km' + (v.km.methode === 'lectures' ? ' (' + v.km.parJour + ' km/jour d\'après les lectures)' : (v.km.methode === 'une' ? ' (une lecture + ' + AMX.fmtNombre(d.params.kmParAn) + ' km/an)' : ' (estimé d\'après l\'année)')) : ''], ['Dernière lecture', v.km && v.km.dernier ? AMX.fmtNombre(v.km.dernier.km) + ' km le ' + date(v.km.dernier.le) + ' (' + v.km.dernier.source + ')' : '']]));
    if (v.achat) { det.appendChild(h('div.ptf-h', { text: 'Achat' })); det.appendChild(dl([['Date', date(v.achat.le)], ['Type', v.achat.type === 'neuf' ? 'Neuf' : (v.achat.type === 'usage' ? 'Occasion' : '')], ['Conseiller', v.achat.conseiller], ['Paiement', v.achat.paiement], ['Prix', v.achat.prix ? AMX.fmtArgent(v.achat.prix) : ''], ['Source', { livre: 'Livre des ventes', dms: 'DMS', preteur: 'prêteur' }[v.achat.source] || ''], ['Vente', v.achat.venteId]])); }
    if (ct) { det.appendChild(h('div.ptf-h', { text: 'Contrat' })); det.appendChild(dl([['Type', ct.typeContrat], ['Prêteur', ct.source === 'dms' ? ct.preteur : ({ bmw: 'BMW Financial Services', gm: 'Financière GM', vwf: 'VW Finance', hmf: 'Hyundai Finance' }[ct.source] || ct.source)], ['Échéance', date(ct.echeance)], ['Paiement', ct.paiement ? AMX.fmtArgent(ct.paiement) + ' / mois' : ''], ['Taux', ct.taux !== null && ct.taux !== undefined ? String(ct.taux).replace('.', ',') + ' %' : ''], ['Résiduel', ct.residuel ? AMX.fmtArgent(ct.residuel) : ''], ['Km du contrat', ct.kmContrat ? AMX.fmtNombre(ct.kmContrat) + ' km' : '']])); }
    if (v.service || v.prochainRdv) { det.appendChild(h('div.ptf-h', { text: 'Service' })); det.appendChild(dl([['Dernière visite', v.service ? date(v.service.derniere) : ''], ['Dernière visite payée', v.service ? date(v.service.derniereFacturee) : ''], ['Visites (24 mois)', v.service ? String(v.service.visites24) : ''], ['Client depuis', v.service ? date(v.service.premiere) : ''], ['Prochain rendez-vous', date(v.prochainRdv)]])); }
    if (v.evaluation) { det.appendChild(h('div.ptf-h', { text: 'Évaluation' })); det.appendChild(dl([['Évalué le', date(v.evaluation.le)], ['Suivi', v.evaluation.statut]])); }
    g.appendChild(h('details.ptf-tout', [h('summary', { text: 'Tous les détails (véhicule, achat, contrat, service)' }), det]));

    /* colonne de droite : le client */
    var ville = [c.ville, c.province, d.contact ? c.codePostal : ''].filter(Boolean).join(' ');
    var lignesCli = h('div.ptf-cli-l');
    function ligne(icone, texte) { if (texte) lignesCli.appendChild(h('div', [h('span.ic', { html: icone }), h('span', { text: texte })])); }
    ligne(ICONES_CANAL.tel, c.telephone ? (d.contact ? (AMX.telephoneTexte ? AMX.telephoneTexte(c.telephone) : c.telephone) : 'téléphone au dossier') : '');
    ligne(ICONES_CANAL.courriel, c.courriel ? (d.contact ? c.courriel : 'courriel au dossier') : '');
    ligne('<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>', ville);
    dr.appendChild(h('div.ptf-cli', [h('h2', { text: c.nom || 'Client inconnu' }), h('div.doux.petit', { text: [c.langue === 'en' ? 'anglais' : (c.langue === 'fr' ? 'français' : ''), c.noClient ? 'no client ' + c.noClient : '', v.vehiculesClient > 1 ? v.vehiculesClient + ' véhicules' : ''].filter(Boolean).join(' · ') }), lignesCli]));
    var k = v.consent || {}, tuiles = h('div.ptf-consent');
    [['texto', 'Texto'], ['courriel', 'Courriel'], ['tel', 'Téléphone']].forEach(function (x) { var e = etatCanal(v, x[0]); tuiles.appendChild(h('div.can.' + e, { 'data-tip': x[1] + ' : ' + TXT_CANAL[e] }, [h('span.ic', { html: ICONES_CANAL[x[0]] }), h('span.l', { text: x[1] }), h('span.e', { text: e === 'ok' ? '✓' : (e === 'non' ? '✕' : '—') })])); });
    dr.appendChild(h('div.ptf-bloc-d', [h('h4', { text: 'Consentement' }), tuiles,
      h('p.petit', { text: NOMS_LCAP[k.lcap] + (k.jusqua ? ' — jusqu\'au ' + date(k.jusqua) : '') + (k.base ? ' (dernier ' + (k.base === 'achat' ? 'achat' : 'service payé') + ' le ' + date(k.baseLe) + ')' : '') }),
      h('p.petit.doux', { text: k.loi25 ? (k.offres === 'oui' ? 'Offres personnalisées : oui (consentement distinct, Loi 25).' : 'Offres personnalisées : pas de consentement distinct — exigé au Québec (Loi 25).') : 'Offres personnalisées : consentement LCAP suffisant (Ontario).' }),
      [k.stop ? 'STOP par texto' : '', k.textoRefus && !k.stop ? 'textos refusés' : '', k.courrielRefus ? 'courriels refusés' : '', k.ndnc ? 'Ne pas téléphoner' : ''].filter(Boolean).length ? h('p.petit.rouge', { text: [k.stop ? 'STOP par texto' : '', k.textoRefus && !k.stop ? 'textos refusés' : '', k.courrielRefus ? 'courriels refusés' : '', k.ndnc ? 'Ne pas téléphoner' : ''].filter(Boolean).join(' · ') }) : null]));
    /* activité */
    var act = [];
    if (v.prochainRdv) act.push([v.prochainRdv, 'Rendez-vous au service', 'à venir']);
    if (ct && ct.echeance) act.push([ct.echeance, 'Fin ' + (modePaiement(v) === 'location' ? 'de la location' : 'du contrat'), ct.echeance >= ajd ? 'prévue' : '']);
    pagesDe(this.cie, v.cle).forEach(function (p) {
      act.push([String(p.creeLe || '').slice(0, 10), 'Page client ' + p.id + ' préparée', p.creeParNom || '']);
      if (p.premiereVue) act.push([String(p.premiereVue).slice(0, 10), 'Page client ouverte par le client', p.vues > 1 ? p.vues + ' fois' : '']);
      (p.reponses || []).forEach(function (r) { act.push([String(r.le || '').slice(0, 10), 'Le client ' + (REPONSES[r.geste] || r.geste), '']); });
    });
    if (v.evaluation && v.evaluation.le) act.push([v.evaluation.le, 'Évaluation', v.evaluation.statut || '']);
    if (v.service && v.service.derniere) act.push([v.service.derniere, 'Visite au service', v.service.visites24 ? v.service.visites24 + ' visite' + (v.service.visites24 > 1 ? 's' : '') + ' en 24 mois' : '']);
    if (v.service && v.service.premiere && v.service.premiere !== v.service.derniere) act.push([v.service.premiere, 'Premier passage au service', '']);
    if (v.echangeLe) act.push([v.echangeLe, 'Repris en échange', '']);
    if (ct && ct.dateContrat) act.push([ct.dateContrat, 'Début du contrat', ({ bmw: 'BMW FS', gm: 'Financière GM', vwf: 'VW Finance', hmf: 'Hyundai Finance' }[ct.source] || ct.preteur || '')]);
    if (v.achat && v.achat.le) act.push([v.achat.le, 'Achat ' + (v.achat.type === 'neuf' ? 'neuf' : (v.achat.type === 'usage' ? 'd\'occasion' : '')) + ' chez nous', [v.achat.conseiller, v.achat.paiement].filter(Boolean).join(' · ')]);
    act = act.filter(function (x) { return x[0]; }).sort(function (x, y) { return String(y[0]).localeCompare(String(x[0])); });
    var ul = h('ol.ptf-activite');
    act.forEach(function (x) { ul.appendChild(h('li' + (x[0] > ajd ? '.avenir' : ''), [h('span.d', { text: date(x[0]) }), h('b', { text: x[1] }), x[2] ? h('span.s', { text: x[2] }) : null])); });
    dr.appendChild(h('div.ptf-bloc-d', [h('h4', { text: 'Activité' }), act.length ? ul : h('p.doux.petit', { text: 'Rien de connu.' })]));
    var liens = h('div.ptf-liens');
    if (v.vin) liens.appendChild(h('a.btn.petit', { href: AMX.lien('outils', 'evaluation', { vin: v.vin }), text: 'Évaluer ce véhicule' }));
    if (ct && ct.source !== 'dms') liens.appendChild(h('a.btn.petit', { href: AMX.lien('relance', 'equite', {}), text: 'Ouvrir dans Équité' }));
    dr.appendChild(liens);
    brancherBulles(corps);
    m = AMX.modale({ titre: (c.nom || 'Client inconnu') + ' — ' + vehiculeTexte(v), corps: corps, large: true, classe: 'ptf-modale', proteger: false });
  };

  function puceTPage(liste) { var e = etatPage(liste); return e ? [h('span.ptf-puce' + (e.ton ? '.' + e.ton : ''), { text: e.texte })] : []; }

  /* --------------------------------------------------------------------------------------------- page client (PageOffre.gs) */
  VuePortefeuille.prototype.sectionPages = function (a) {
    var self = this, v = a.v, d = this.rep, z = h('div');
    function dessiner() {
      AMX.vider(z);
      var x = pages.par[self.cie], rep = x ? x.rep : null, liste = pagesDe(self.cie, v.cle), k = v.consent || {};
      if (!x) { z.appendChild(h('p.doux.petit', { text: 'Lecture des pages client…' })); return; }
      if (!rep) { z.appendChild(h('p.doux.petit', { text: x.absent ? 'Le script n\'est pas à jour : déployez la version qui contient PageOffre.gs pour préparer des pages client.' : 'Pages client illisibles pour le moment.' })); return; }
      liste.forEach(function (p) { z.appendChild(self.cartePage(p, function () { chargerPages(self.cie, true).then(dessiner); })); });
      if (!liste.length) z.appendChild(h('p.doux.petit', { text: 'Aucune page client pour ce véhicule.' }));
      if (k.lcap === 'refus') z.appendChild(h('p.doux.petit', { text: 'Ce client a refusé les offres (« Ne plus recevoir » ou STOP par texto) : pas de page client.' }));
      else if (v.etat !== 'actif') z.appendChild(h('p.doux.petit', { text: 'Ce véhicule n\'est plus au client : pas de page client.' }));
      else if (!(a.offres || []).length) z.appendChild(h('p.doux.petit', { text: 'Aucune offre calculée pour ce véhicule (stock semblable ou programme manquant) : pas de page client.' }));
      else if (rep.peutCreer && d.contact) z.appendChild(h('button.btn.primaire.petit', { type: 'button', text: liste.length ? 'Préparer une autre page client' : 'Préparer la page client', onclick: function () { self.preparerPage(a, function () { chargerPages(self.cie, true).then(dessiner); }); } }));
      else z.appendChild(h('p.doux.petit', { text: 'Préparer une page client demande l\'accès aux coordonnées des clients.' }));
    }
    dessiner();
    if (!pages.par[this.cie]) chargerPages(this.cie).then(dessiner);
    return z;
  };
  VuePortefeuille.prototype.cartePage = function (p, apres) {
    var self = this;
    var etat = p.etat === 'refus' ? ['rouge', 'Ne plus recevoir'] : (p.etat === 'retiree' ? ['', 'Lien retiré'] : (p.expiree ? ['', 'Lien expiré'] : (p.terminee ? ['ambre', 'Offre terminée'] : (p.vues ? ['bleu', 'Vue ' + p.vues + ' fois'] : ['', 'Pas encore vue']))));
    var c = h('div.ptf-page' + (p.aTraiter ? '.atraiter' : ''));
    c.appendChild(h('div.t', [h('b', { text: p.id + ' — préparée le ' + dateAn(p.creeLe) + (p.creeParNom ? ' par ' + p.creeParNom : '') }), h('span.ptf-puce' + (etat[0] ? '.' + etat[0] : ''), { text: etat[1] })]));
    c.appendChild(h('div.doux.petit', { text: (p.offres || []).map(function (o) { return o.vehicule + ' · ' + AMX.fmtArgent(o.paiement) + ' / mois' + (o.avecEchange ? ' (≈ ' + AMX.fmtArgent(o.avecEchange) + ' avec l\'échange)' : ''); }).join(' — ') + (p.valideJusqua ? ' · valide jusqu\'au ' + dateAn(p.valideJusqua) : '') + (p.langue === 'en' ? ' · en anglais' : '') }));
    if (p.premiereVue) c.appendChild(h('div.doux.petit', { text: 'Ouverte le ' + AMX.fmtDate(p.premiereVue, true) + (p.vues > 1 ? ' · dernière fois le ' + AMX.fmtDate(p.vuLe, true) : '') }));
    (p.reponses || []).forEach(function (r) {
      c.appendChild(h('div.rep', { text: AMX.fmtDate(r.le, true) + ' — le client ' + (REPONSES[r.geste] || r.geste) + (r.moment ? ' (' + { matin: 'le matin', apresMidi: 'l\'après-midi', soir: 'le soir' }[r.moment] + ')' : '') + (r.telephone ? ' · au ' + r.telephone.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3') : '') + (r.note ? ' — « ' + r.note + ' »' : '') }));
    });
    if (p.traiteLe) c.appendChild(h('div.doux.petit', { text: 'Pris en charge le ' + AMX.fmtDate(p.traiteLe, true) + (p.traitePar ? ' par ' + p.traitePar : '') + (p.traiteNote ? ' — ' + p.traiteNote : '') }));
    (p.avertissements || []).forEach(function (t) { c.appendChild(h('div.av', { text: '⚠ ' + t })); });
    var acts = h('div.acts'), actif = p.etat === 'active' && !p.expiree;
    if (p.aTraiter) acts.appendChild(h('button.btn.primaire.petit', { type: 'button', text: 'Pris en charge…', onclick: function () {
      var note = h('textarea.saisie', { rows: 3, placeholder: 'Ce qui a été fait (rappelé, essai réservé le…, évaluation prévue…)' });
      AMX.modale({ titre: 'Réponse prise en charge — ' + p.id, corps: h('div', [h('p.doux', { text: 'La réponse quitte la liste « à traiter ». Une nouvelle réponse du client la ramène.' }), note]), boutons: [{ texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: function () {
        return AMX.post({ action: 'offreClientTraiter', id: p.id, note: note.value.trim() }).then(function (r) { if (!r || !r.ok) throw new Error((r && r.erreur) || 'Non enregistré.'); AMX.toast('Réponse prise en charge.', 'ok'); apres(); }, function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); throw e; });
      } }] });
    } }));
    if (p.lien && actif) {
      acts.appendChild(h('button.btn.petit', { type: 'button', text: 'Copier le lien', onclick: function () { AMX.copier(p.lien, 'Lien copié : envoyez-le au client vous-même.'); } }));
      acts.appendChild(h('a.btn.petit', { href: p.lien + '&apercu=1', target: '_blank', rel: 'noopener', text: 'Aperçu', title: 'Ouvre la page comme le client la voit (l\'aperçu ne compte pas comme une vue)' }));
      acts.appendChild(h('button.btn.petit.fantome', { type: 'button', text: 'Retirer le lien', onclick: function () {
        AMX.confirmer('Retirer le lien ' + p.id + ' ?', 'La page ne s\'ouvrira plus (par exemple si le véhicule offert est vendu). Le client verra « Offre retirée ».', { ok: 'Retirer', danger: true }).then(function (oui) {
          if (!oui) return;
          AMX.post({ action: 'offreClientRetirer', id: p.id }).then(function (r) { if (!r || !r.ok) throw new Error((r && r.erreur) || 'Non retiré.'); AMX.toast('Lien retiré.', 'ok'); apres(); }, function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); });
        });
      } }));
    }
    if (acts.childNodes.length) c.appendChild(acts);
    return c;
  };
  /** Préparer la page client : les offres à montrer, le mot du conseiller, la langue. Rien n'est envoyé : on copie le lien. */
  VuePortefeuille.prototype.preparerPage = function (a, apres) {
    var self = this, v = a.v, c = v.client || {}, k = v.consent || {}, corps = h('div.ptf-prep');
    var choisies = {}, offres = (a.offres || []).slice(0, 5);
    offres.filter(function (o) { return o.statut === 'prete'; }).slice(0, 3).forEach(function (o) { choisies[o.vin] = true; });
    if (!Object.keys(choisies).length && offres[0]) choisies[offres[0].vin] = true;
    var avis = [];
    if (k.lcap === 'echu' || k.lcap === 'inconnu' || !k.lcap) avis.push('Consentement LCAP ' + (k.lcap === 'echu' ? 'échu' : 'inconnu') + ' : envoyez ce lien seulement si le client vous l\'a demandé.');
    if (k.loi25 && k.offres !== 'oui') avis.push('Québec (Loi 25) : pas de consentement distinct aux offres personnalisées. Présentez la page comme une réponse à sa demande, ou obtenez son accord d\'abord.');
    if (k.ndnc) avis.push('« Ne pas téléphoner » : ne l\'appelez pas sans qu\'il le demande.');
    avis.forEach(function (t) { corps.appendChild(h('div.avis', { text: t })); });
    corps.appendChild(h('div.ptf-h', { text: 'Offres à montrer (3 au plus)' }));
    var zoneOffres = h('div'); corps.appendChild(zoneOffres);
    var avecEchange = h('input', { type: 'checkbox', checked: true });
    var ligneEchange = h('label.case', { style: { display: 'flex', gap: '8px', alignItems: 'flex-start', margin: '8px 0' } }, [avecEchange, h('span', { text: 'Montrer aussi le paiement « avec votre véhicule actuel en échange » (une estimation : ni la valeur d\'échange ni la dette ne sont affichées)' })]);
    function dessinerOffres() {
      AMX.vider(zoneOffres);
      offres.forEach(function (o) {
        var cb = h('input', { type: 'checkbox', checked: !!choisies[o.vin] });
        var lab = h('label.offre-choix' + (choisies[o.vin] ? '.actif' : ''), [cb, h('div', [
          h('b', { text: o.vehicule + (o.stock ? ' · # ' + o.stock : '') }),
          h('div.doux.petit', { text: (o.type === 'location' ? 'Location ' : 'Financement ') + o.terme + ' mois à ' + String(o.taux).replace('.', ',') + ' % · ' + AMX.fmtArgent(o.paiement) + ' / mois avec l\'échange' + (o.ecart !== null && o.ecart !== undefined ? ' (' + (o.ecart > 0 ? '+' : '') + AMX.fmtArgent(o.ecart) + ' vs aujourd\'hui)' : '') }),
          (o.raisons || []).length ? h('div.r', { text: o.raisons.join(' · ') }) : null
        ])]);
        cb.addEventListener('change', function () {
          if (cb.checked && Object.keys(choisies).length >= 3) { cb.checked = false; AMX.toast('Trois offres au plus.', 'attention'); return; }
          if (cb.checked) choisies[o.vin] = true; else delete choisies[o.vin];
          dessinerOffres();
        });
        zoneOffres.appendChild(lab);
      });
      ligneEchange.style.display = offres.some(function (o) { return choisies[o.vin] && o.categorie === 'miseANiveau'; }) ? '' : 'none';
    }
    dessinerOffres();
    corps.appendChild(ligneEchange);
    var prenom = String(c.nom || '').indexOf(',') > 0 ? String(c.nom).split(',')[1].trim().split(' ')[0] : String(c.nom || '').split(' ')[0];
    prenom = prenom ? prenom.charAt(0).toUpperCase() + prenom.slice(1).toLowerCase() : '';
    var langue = h('select.saisie', [h('option', { value: 'fr', text: 'Français' }), h('option', { value: 'en', text: 'Anglais (seulement si le client l\'a demandé)' })]);
    langue.value = c.langue === 'en' ? 'en' : 'fr';
    var message = h('textarea.saisie', { rows: 4 });
    function messageType() { return langue.value === 'en'
      ? 'Hello' + (prenom ? ' ' + prenom : '') + ', here are a few vehicles from our inventory that could replace your ' + [v.marque, v.modele].filter(Boolean).join(' ') + '. I am available for any questions.'
      : 'Bonjour' + (prenom ? ' ' + prenom : '') + ', voici quelques véhicules de notre inventaire qui pourraient remplacer votre ' + [v.marque, v.modele].filter(Boolean).join(' ') + '. Je reste disponible pour vos questions.'; }
    message.value = messageType();
    var touche = false; message.addEventListener('input', function () { touche = true; });
    langue.addEventListener('change', function () { if (!touche) message.value = messageType(); });
    corps.appendChild(h('div.ptf-h', { text: 'Votre mot au client' }));
    corps.appendChild(message);
    corps.appendChild(h('label', { style: { display: 'block', marginTop: '8px' } }, [h('span.doux.petit', { text: 'Langue de la page ' }), langue]));
    corps.appendChild(h('p.doux.petit', { text: 'La page montre le prix total d\'abord, tout le détail du crédit et les mentions de ' + (k.loi25 ? 'la Loi sur la protection du consommateur (Québec)' : 'l\'OMVIC (Ontario)') + '. Elle est figée maintenant : le client verra exactement ces chiffres. Rien n\'est envoyé : vous copiez le lien et l\'envoyez vous-même.' }));
    var m = AMX.modale({ titre: 'Page client — ' + (c.nom || 'client') + ' — ' + vehiculeTexte(v), corps: corps, large: true, boutons: [{ texte: 'Annuler' }, { texte: 'Préparer la page', classe: 'primaire', action: function () {
      var vins = offres.filter(function (o) { return choisies[o.vin]; }).map(function (o) { return o.vin; });
      if (!vins.length) { AMX.toast('Choisissez au moins une offre.', 'attention'); return false; }
      return AMX.post({ action: 'offreClientCreer', compagnie: self.cie, cle: v.cle, vins: vins, message: message.value.trim(), langue: langue.value, avecEchange: avecEchange.checked }, { secours: false }).then(function (r) {
        if (!r || !r.ok || !r.page) throw new Error((r && r.erreur) || (r && !r.page && r.ok ? 'Le script n\'est pas à jour : déployez la version qui contient PageOffre.gs.' : 'Page non préparée.'));
        apres();
        var cp = h('div.ptf-prep', [h('p', { text: 'La page ' + r.page.id + ' est prête. Envoyez ce lien au client vous-même (texto, courriel) :' }), h('div.lien', { text: r.page.lien })].concat((r.avertissements || []).map(function (t) { return h('div.avis', { text: t }); })));
        AMX.modale({ titre: 'Page client prête', corps: cp, proteger: false, boutons: [
          { texte: 'Aperçu', action: function () { window.open(r.page.lien + '&apercu=1', '_blank', 'noopener'); return false; } },
          { texte: 'Copier le lien', classe: 'primaire', action: function () { AMX.copier(r.page.lien, 'Lien copié.'); } }
        ] });
      }, function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); throw e; });
    } }] });
    return m;
  };

  function carteOffre(o) {
    var c = o.calc || {}, lignes = [['Prix' + (o.neuf ? '' : ' affiché'), o.prix], ['Frais', o.frais], ['Rabais' + (o.rabaisAvantTaxes ? ' (avant taxes)' : ''), o.rabais ? -o.rabais : 0], [o.type === 'location' ? 'Taxes (sur chaque paiement)' : 'Taxes', c.taxes], ['Échange (bas de la fourchette)', o.echange ? -o.echange : 0], ['Dette du véhicule actuel', o.dette], ['Comptant', o.comptant ? -o.comptant : 0]];
    if (o.type === 'location') lignes.push(['Coût capitalisé net', c.capNet], ['Résiduel (' + o.residuelPct + ' % du PDSF)', c.residuel]); else lignes.push(['Montant financé', c.finance]);
    var tb = h('tbody'); lignes.forEach(function (l) { if (l[1] === null || l[1] === undefined || l[1] === 0 && !/Prix/.test(l[0])) return; tb.appendChild(h('tr', [h('td', { text: l[0] }), h('td.num', { text: AMX.fmtArgent(l[1]) })])); });
    var ec = o.ecart;
    return h('div.ptf-offre' + (o.statut === 'prete' ? '.prete' : ''), [
      h('div.t', [h('b', { text: o.vehicule + (o.stock ? ' · # ' + o.stock : '') }), h('span.ptf-puce' + (o.statut === 'prete' ? '.vert' : '.ambre'), { text: o.statut === 'prete' ? 'Prête' : 'À réviser' })]),
      h('div.t', [h('span.p', { text: AMX.fmtArgent(o.paiement) + ' / mois' }), h('span', { text: (o.type === 'location' ? 'Location ' : 'Financement ') + o.terme + ' mois à ' + String(o.taux).replace('.', ',') + ' %' + (o.kmAn ? ' · ' + AMX.fmtNombre(o.kmAn) + ' km / an' : '') + (ec !== null && ec !== undefined ? ' · ' + (ec > 0 ? '+' : '') + AMX.fmtArgent(ec) + ' vs le paiement actuel (' + AMX.fmtArgent(o.actuel) + ')' : '') })]),
      h('div.doux.petit', { text: (o.neuf ? 'Neuf' : 'Occasion') + ' · ' + ({ memeModele: 'même modèle', memeSegment: 'même catégorie', occasion: 'même modèle, plus récent' }[o.groupe] || '') + (o.programme ? ' · programme : ' + (o.programme.note || o.programme.id) : '') + (o.rabaisNotes && o.rabaisNotes.length ? ' · rabais : ' + o.rabaisNotes.join(', ') : '') + (o.rabaisD2c && o.rabaisD2c.length ? ' · rabais du site (D2C) : ' + o.rabaisD2c.map(function (x) { return x.nom + ' ' + AMX.fmtArgent(x.montant) + (x.comptant ? ' (comptant)' : ''); }).join(', ') + (o.choixRabais === 'comptant' ? ' — pris au comptant, au taux par défaut : moins cher que le taux spécial' : (o.choixRabais === 'taux' ? ' — taux spécial gardé, sans le rabais comptant' : '')) : '') }),
      h('table', [tb]),
      (o.raisons || []).length ? h('div.r', { text: o.raisons.join(' · ') }) : null
    ]);
  }

  /* --------------------------------------------------------------------------------------------- programmes du mois */
  VuePortefeuille.prototype.programmes = function () {
    var self = this, cie = this.cie, mois = auj().slice(0, 7), corps = h('div.ptf-prog'), zone = h('div'), m;
    var selMois = h('input.saisie', { type: 'month', value: mois, onchange: function () { mois = selMois.value || mois; lire(); } });
    var btnCopier = h('button.btn.petit', { type: 'button', text: 'Copier le mois précédent', onclick: function () { copier(); } });
    corps.appendChild(h('p', { text: 'Programmes de ' + (AMX.COMPAGNIES_TOUTES[cie] || cie) + ' : taux, termes, résiduels et rabais du constructeur pour le mois. Le programme le plus précis (modèle, version, années) l\'emporte ; les rabais qui s\'appliquent s\'additionnent (constructeur, Roulez vert, fédéral). Les offres sont recalculées dans la minute.' }));
    var zoneAuto = h('div.ptf-prog-auto');
    corps.appendChild(zoneAuto);
    corps.appendChild(h('div.barre-mois', [h('label', { text: 'Mois' }), selMois, btnCopier]));
    corps.appendChild(zone);
    /* 6 nov. : programmes du manufacturier lus tout seuls (ProgrammesAuto.gs) — Hyundai : hyundaicanada.com ; VW, BMW, Ste-Marie,
       Hawkesbury : la grille de paiements du site de la concession (fait par D2C) ; GM : en plus, le bulletin « Programmes
       principaux » reçu par courriel ou déposé dans Drive (pas relu quand le site de la concession a été lu ce mois-ci). */
    var sourcesAuto = cie === 'HYUNDAI' ? ['hyundai'] : (cie === 'VW' || cie === 'BMW') ? ['site_' + cie] : cie === 'STM' ? ['site_STM', 'gm'] : cie === 'HAWKS' ? ['site_HAWKS', 'site_HAWKSCAD', 'gm'] : [];
    function nomSource(src, r) {
      if (src === 'hyundai') return 'hyundaicanada.com';
      if (src === 'gm') return 'bulletin « Programmes principaux » de GM';
      var x = r && r.sites ? r.sites[src.slice(5)] : null;
      return 'site ' + ((x && x.nom) || 'de la concession');
    }
    function lireAuto() {
      AMX.vider(zoneAuto);
      if (!sourcesAuto.length) { zoneAuto.appendChild(h('p.doux.petit', { text: 'Lecture automatique : pas encore pour cette concession.' })); return; }
      AMX.get({ programmesAuto: '1' }, { discret: true }).then(function (r) {
        if (!r || !r.etat) throw new Error('Le script n\'est pas à jour — déployez la version qui contient ProgrammesAuto.gs.');
        var connues = r.sources || ['hyundai', 'gm'];
        var liste = sourcesAuto.filter(function (src) { return connues.indexOf(src) >= 0; });
        AMX.vider(zoneAuto);
        if (!liste.length) { zoneAuto.appendChild(h('p.doux.petit', { text: 'Le script n\'est pas à jour — déployez la version qui lit les sites des concessions.' })); return; }
        liste.forEach(function (src) {
          var e = r.etat[src] || null, nom = nomSource(src, r);
          var t = e ? ('Lu automatiquement (' + nom + ') le ' + AMX.fmtDate(e.le, true) + (e.fichier ? ' · ' + e.fichier : '') + ' · ' + AMX.fmtNombre(e.lignes || 0) + ' programmes' + (e.erreur ? ' — ' + e.erreur : '')) : ('Lecture automatique chaque jour après 5 h (' + nom + ') : pas encore faite.');
          zoneAuto.appendChild(h('div.ptf-avis' + (e && e.ok ? '.ok' : ''), [
            h('p', { text: t }),
            src === 'gm' ? h('p.doux.petit', { text: 'Bulletin GM, en secours du site : transférez chaque mois le courriel « Programmes principaux » à ' + (r.adresse || 'maximeallard207+programmes@gmail.com') + ' (ou déposez le fichier Excel dans le dossier Drive « ' + (r.dossier || 'ScanAutomax — Programmes du manufacturier') + ' »). Pas relu quand le site de la concession a été lu ce mois-ci.' }) : null,
            /^site_/.test(src) ? h('p.doux.petit', { text: 'Taux, termes, résiduels et km de chaque version, tels que le site de la concession les affiche (calculateur de paiements fait par D2C).' }) : null,
            r.peutLancer ? h('button.btn.petit', { type: 'button', text: 'Lire maintenant', onclick: function (ev) { var b = ev.currentTarget; b.disabled = true; b.textContent = 'Lecture… (jusqu\'à 3 min)'; AMX.post({ action: 'programmesAuto', source: src }, { delai: 300000, secours: false }).then(function (x) { AMX.toast(x && x.ok ? AMX.fmtNombre(x.lignes || 0) + ' programmes lus.' : ((x && x.erreur) || 'Lecture impossible.'), x && x.ok ? 'ok' : 'attention', 6000); lireAuto(); lire(); }).catch(function (er) { AMX.toast(AMX.erreurTexte(er), 'erreur'); b.disabled = false; b.textContent = 'Lire maintenant'; }); } }) : null
          ]));
        });
      }).catch(function (er) { AMX.vider(zoneAuto); zoneAuto.appendChild(h('p.doux.petit', { text: AMX.erreurTexte(er) })); });
    }
    lireAuto();
    m = AMX.modale({ titre: 'Programmes du mois', corps: corps, large: true, proteger: false, boutons: [{ texte: 'Fermer' }] });
    var peut = false;
    function lire() {
      AMX.vider(zone); zone.appendChild(h('p.doux', { text: 'Lecture…' }));
      AMX.get({ programmesMois: '1', compagnie: cie, mois: mois }, { delai: 60000 }).then(function (r) {
        if (!r || !Array.isArray(r.programmes)) throw new Error((r && r.erreur) || 'Le script n\'est pas à jour — déployez la version qui contient MoteurOffres.gs.');
        peut = !!r.peutRegler; btnCopier.style.display = peut ? '' : 'none';
        dessiner(r);
      }).catch(function (e) { AMX.vider(zone); zone.appendChild(h('p.ptf-avis', { text: AMX.erreurTexte(e) })); });
    }
    function dessiner(r) {
      AMX.vider(zone);
      zone.appendChild(h('p.doux.petit', { text: 'Taxes : ' + (r.province === 'ON' ? 'TVH ' : 'TPS + TVQ ') + String(r.taxePct).replace('.', ',') + ' %.' }));
      var estAuto = function (p) { return /automatique/.test(String(p.par || '')) || /^(HY|GM|SVW|SBMW|SSTM|SHAWKS)-/.test(String(p.id || '')); };
      var autos = r.programmes.filter(estAuto), manuels = r.programmes.filter(function (p) { return !estAuto(p); });
      if (!r.programmes.length) zone.appendChild(h('p.doux', { text: 'Aucun programme pour ce mois.' }));
      else {
        var tb = h('tbody'), tbA = h('tbody');
        var ligne = function (p, auto) {
          return h('tr', [
            h('td', { text: { financement: 'Financement', location: 'Location', rabais: 'Rabais' }[p.type] }),
            h('td', { text: [p.marque, p.modele, p.version].filter(Boolean).join(' ') || 'tous' }),
            h('td', { text: [p.anneeMin, p.anneeMax].filter(function (x, i, l) { return x && l.indexOf(x) === i; }).join('–') || 'toutes' }),
            h('td', { text: p.type === 'rabais' ? AMX.fmtArgent(p.rabais) : p.terme + ' mois · ' + String(p.taux).replace('.', ',') + ' %' + (p.residuelPct ? ' · résiduel ' + String(p.residuelPct).replace('.', ',') + ' %' : '') + (p.kmAn ? ' · ' + AMX.fmtNombre(p.kmAn) + ' km/an' : '') + (nombre(p.rabais) ? ' · rabais ' + AMX.fmtArgent(p.rabais) : '') }),
            h('td', { text: (p.fin ? 'jusqu\'au ' + dateAn(p.fin) + ' · ' : '') + (p.note || '') })
          ]);
        };
        autos.forEach(function (p) { tbA.appendChild(ligne(p, true)); });
        if (autos.length) zone.appendChild(h('details.ptf-prog-autos', [h('summary', { text: AMX.fmtNombre(autos.length) + ' programmes lus automatiquement (remplacés à chaque lecture ; un programme saisi à la main passe avant)' }), h('div.ptf-cadre', [h('table.tableau', [h('thead', [h('tr', ['Type', 'Véhicules', 'Années', 'Conditions', 'Fin · source'].map(function (t) { return h('th', { text: t }); }))]), tbA])])]));
        if (!manuels.length) zone.appendChild(h('p.doux', { text: 'Aucun programme saisi à la main pour ce mois.' }));
        manuels.forEach(function (p) {
          tb.appendChild(h('tr', [
            h('td', { text: { financement: 'Financement', location: 'Location', rabais: 'Rabais' }[p.type] }),
            h('td', { text: [p.marque, p.modele, p.version].filter(Boolean).join(' ') || 'tous' }),
            h('td', { text: [p.anneeMin, p.anneeMax].filter(Boolean).join('–') || 'toutes' }),
            h('td', { text: p.etat === 'neuf' ? 'neuf' : (p.etat === 'occasion' ? 'occasion' : 'tous') }),
            h('td', { text: p.type === 'rabais' ? AMX.fmtArgent(p.rabais) + (p.rabaisAvantTaxes === 'oui' ? ' avant taxes' : '') + (p.electrique === 'oui' ? ' · électrique' : '') : p.terme + ' mois · ' + String(p.taux).replace('.', ',') + ' %' + (p.type === 'location' ? ' · résiduel ' + p.residuelPct + ' %' + (p.kmAn ? ' · ' + AMX.fmtNombre(p.kmAn) + ' km' : '') : '') + (p.rabais ? ' · rabais ' + AMX.fmtArgent(p.rabais) : '') }),
            h('td', { text: (p.fin ? 'jusqu\'au ' + dateAn(p.fin) + ' · ' : '') + (p.note || '') }),
            h('td', peut ? [h('button.lien', { type: 'button', text: 'Modifier', onclick: function () { formulaire(p); } }), ' ', h('button.lien', { type: 'button', text: 'Retirer', onclick: function () { retirer(p); } })] : [])
          ]));
        });
        if (manuels.length) zone.appendChild(h('div.ptf-cadre', [h('table.tableau', [h('thead', [h('tr', ['Type', 'Véhicules', 'Années', 'État', 'Conditions', 'Fin · note', ''].map(function (t) { return h('th', { text: t }); }))]), tb])]));
      }
      if (peut) zone.appendChild(h('button.btn.primaire', { type: 'button', text: 'Ajouter un programme', onclick: function () { formulaire(null); } }));
    }
    function formulaire(p) {
      p = p || { type: 'financement', etat: 'neuf' };
      var f = {};
      function champ(cle, lib, type, opts) { var el; if (opts) { el = h('select.saisie', opts.map(function (o) { return h('option', { value: o[0], text: o[1] }); })); el.value = p[cle] === undefined ? '' : String(p[cle]); } else el = h('input.saisie', { type: type || 'text', step: 'any', value: p[cle] === undefined || p[cle] === null ? '' : p[cle] }); f[cle] = el; return h('div.champ', [h('label', { text: lib }), el]); }
      var c = h('div', [h('div.form', [
        champ('type', 'Type', null, [['financement', 'Financement'], ['location', 'Location'], ['rabais', 'Rabais']]),
        champ('etat', 'Neuf ou occasion', null, [['neuf', 'Neuf'], ['occasion', 'Occasion'], ['', 'Tous']]),
        champ('marque', 'Marque (vide = toutes)'), champ('modele', 'Modèle (vide = tous)'), champ('version', 'Version (vide = toutes)'),
        champ('anneeMin', 'Année min.', 'number'), champ('anneeMax', 'Année max.', 'number'),
        champ('terme', 'Terme (mois)', 'number'), champ('taux', 'Taux (%)', 'number'), champ('residuelPct', 'Résiduel (% du PDSF, location)', 'number'), champ('kmAn', 'Km par an (location)', 'number'),
        champ('rabais', 'Rabais ($)', 'number'), champ('rabaisAvantTaxes', 'Rabais avant taxes ?', null, [['non', 'Non (après taxes)'], ['oui', 'Oui (avant taxes)']]),
        champ('electrique', 'Seulement les électriques ?', null, [['non', 'Non'], ['oui', 'Oui']]), champ('fin', 'Fin (facultatif)', 'date'), champ('note', 'Note (ex. « Boni GM novembre »)')
      ])]);
      AMX.modale({ titre: p.id ? 'Modifier le programme' : 'Ajouter un programme', corps: c, large: true, boutons: [{ texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: function () {
        var prog = { id: p.id || '', mois: mois }; Object.keys(f).forEach(function (k) { prog[k] = f[k].value; });
        return AMX.post({ action: 'programmeEnregistrer', compagnie: cie, programme: prog }, { secours: false }).then(function (r) {
          if (!r || r.ok === false || r.refuse || !r.programme) { AMX.toast((r && r.erreur) || 'Le script n\'est pas à jour.', 'erreur'); return false; }
          AMX.toast('Programme enregistré — les offres seront recalculées dans la minute.', 'ok'); lire();
        }, function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); return false; });
      } }] });
    }
    function retirer(p) {
      AMX.confirmer('Retirer ce programme ?', [p.type, p.marque, p.modele].filter(Boolean).join(' ') + ' — ' + mois).then(function (oui) {
        if (!oui) return;
        AMX.post({ action: 'programmeSupprimer', compagnie: cie, id: p.id }, { secours: false }).then(function (r) { if (!r || r.ok === false) { AMX.toast((r && r.erreur) || 'Retrait impossible.', 'erreur'); return; } AMX.toast('Programme retiré.', 'ok'); lire(); }, function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); });
      });
    }
    function copier() {
      var d = new Date(mois + '-15T12:00:00'); d.setMonth(d.getMonth() - 1); var de = d.toISOString().slice(0, 7);
      AMX.post({ action: 'programmesCopier', compagnie: cie, de: de, vers: mois }, { secours: false }).then(function (r) {
        if (!r || r.ok === false || r.refuse) { AMX.toast((r && r.erreur) || 'Copie impossible.', 'erreur'); return; }
        AMX.toast(r.copies + ' programme' + (r.copies > 1 ? 's copiés' : ' copié') + ' de ' + de + '.', 'ok'); lire();
      }, function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); });
    }
    lire(); void m;
  };

  /* --------------------------------------------------------------------------------------------- import des fichiers du DMS */
  function lireFichier(fichier) {
    return new Promise(function (ok, ko) {
      var nom = fichier.name || '';
      var lecteur = new FileReader();
      if (/\.xlsx?$/i.test(nom)) {
        lecteur.onload = function () {
          try {
            if (typeof XLSX === 'undefined') throw new Error('Lecteur Excel indisponible : rechargez la page.');
            var wb = XLSX.read(new Uint8Array(lecteur.result), { type: 'array', cellDates: true });
            var ws = wb.Sheets[wb.SheetNames[0]];
            ok(XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'yyyy-mm-dd', defval: '' }));
          } catch (e) { ko(e); }
        };
        lecteur.onerror = function () { ko(new Error('Lecture du fichier impossible.')); };
        lecteur.readAsArrayBuffer(fichier);
        return;
      }
      lecteur.onload = function () {
        try {
          var octets = new Uint8Array(lecteur.result), texte = new TextDecoder('utf-8').decode(octets);
          if (/�/.test(texte)) texte = new TextDecoder('windows-1252').decode(octets);
          ok(analyserTexte(texte));
        } catch (e) { ko(e); }
      };
      lecteur.onerror = function () { ko(new Error('Lecture du fichier impossible.')); };
      lecteur.readAsArrayBuffer(fichier);
    });
  }
  /** CSV / TXT : séparateur « sep=X » d'Excel, sinon celui qui découpe le plus la première ligne ; guillemets respectés. */
  function analyserTexte(texte) {
    texte = String(texte || '').replace(/^﻿/, '');
    var lignes = texte.split(/\r\n|\n|\r/), sep = null;
    var m = /^sep=(.)$/i.exec((lignes[0] || '').trim()); if (m) { sep = m[1]; lignes.shift(); }
    if (!sep) { var l0 = lignes[0] || '', best = ',', n = -1; ['|', '\t', ';', ','].forEach(function (s) { var c = l0.split(s).length; if (c > n) { n = c; best = s; } }); sep = best; }
    var out = [];
    lignes.forEach(function (l) {
      if (!l.trim() || /^TRAILER:/i.test(l)) return;
      var cells = [], cur = '', q = false;
      for (var i = 0; i < l.length; i++) {
        var ch = l.charAt(i);
        if (q) { if (ch === '"') { if (l.charAt(i + 1) === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
        else if (ch === '"') q = true;
        else if (ch === sep) { cells.push(cur); cur = ''; }
        else cur += ch;
      }
      cells.push(cur);
      out.push(cells.map(function (x) { return x.trim(); }));
    });
    if (out[0] && /^HEADER:/i.test(out[0][0])) out[0][0] = out[0][0].replace(/^HEADER:/i, '');
    return out;
  }
  function cleEntete(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
  function associer(champs, entetes) {
    var pris = {};
    return entetes.map(function (e) {
      var k = cleEntete(e); if (!k) return '';
      for (var i = 0; i < champs.length; i++) { var c = champs[i]; if (pris[c[0]]) continue; if (k === cleEntete(c[0]) || c[2].indexOf(k) >= 0) { pris[c[0]] = 1; return c[0]; } }
      return '';
    });
  }
  function formatDates(valeurs) {
    var dmy = 0, mdy = 0, ambigu = 0;
    valeurs.forEach(function (v) { var m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.]\d{2,4}/.exec(String(v || '').trim()); if (!m) return; if (Number(m[1]) > 12) dmy++; else if (Number(m[2]) > 12) mdy++; else ambigu++; });
    return { fmt: mdy > dmy ? 'mdy' : (dmy ? 'dmy' : ''), ambigu: !dmy && !mdy && ambigu > 0 };
  }
  var REQUIS = { clients: [['noClient']], vehicules: [['vin']], ventes: [['vin'], ['dateVente', 'dateLivraison']], bt: [['vin'], ['dateFermeture', 'dateOuverture']], rdv: [['date'], ['vin', 'noClient']] };
  var DATES = { creeLe: 1, kmLe: 1, livreLe: 1, dateVente: 1, dateLivraison: 1, premierPaiement: 1, echeance: 1, dateOuverture: 1, dateFermeture: 1, date: 1 };

  VuePortefeuille.prototype.importer = function () {
    var self = this, cie = this.cie, etat = { genre: '', rangs: null, entetes: [], assoc: [], fichier: null, debut: 1, fmt: '' };
    var corps = h('div.ptf-import');
    var elGenres = h('div.genres'), elFichier = h('div.etape'), elAssoc = h('div.etape'), elEnvoi = h('div.etape');
    corps.appendChild(h('p', { html: 'Pour <b>' + (AMX.COMPAGNIES_TOUTES[cie] || cie) + '</b>. Un export du DMS (CSV, TXT ou Excel) : les colonnes sont reconnues seules et vous pouvez corriger. Rien n\'est envoyé à un client ; le portefeuille est rebâti tout de suite après.' }));
    corps.appendChild(h('div.ptf-h', { text: '1. Quel fichier ?' })); corps.appendChild(elGenres);
    corps.appendChild(elFichier); corps.appendChild(elAssoc); corps.appendChild(elEnvoi);
    var m = AMX.modale({ titre: 'Importer un fichier du DMS', corps: corps, large: true, boutons: [{ texte: 'Fermer' }] });
    chargerFormat().then(function (f) {
      f.ordre.forEach(function (g) {
        var lab = h('label', [h('input', { type: 'radio', name: 'ptf-genre', value: g, onchange: function () { etat.genre = g; Array.prototype.forEach.call(elGenres.children, function (x) { x.classList.toggle('actif', x === lab); }); dessinerFichier(); if (etat.rangs) associerTout(); } }), h('span', [h('b', { text: f.genres[g].nom }), h('br'), h('span.doux.petit', { text: { clients: 'no client, nom, téléphone, courriel, consentements', vehicules: 'NIV, no client, km, mise en service', ventes: 'contrats : terme, taux, paiement, échéance', bt: 'NIV, date, km, montant payé par le client', rdv: 'date, NIV ou no client, aviseur' }[g] })])]);
        elGenres.appendChild(lab);
      });
    }, function (e) { AMX.vider(elGenres); elGenres.appendChild(h('p.ptf-avis', { text: AMX.erreurTexte(e) })); });
    function dessinerFichier() {
      AMX.vider(elFichier);
      elFichier.appendChild(h('div.ptf-h', { text: '2. Le fichier' }));
      var input = h('input', { type: 'file', accept: '.csv,.txt,.xlsx,.xls' });
      input.addEventListener('change', function () {
        var fi = input.files && input.files[0]; if (!fi) return;
        etat.fichier = fi.name; AMX.vider(elAssoc); elAssoc.appendChild(h('p.doux', { text: 'Lecture de ' + fi.name + '…' }));
        lireFichier(fi).then(function (rangs) {
          rangs = (rangs || []).filter(function (r) { return r && r.some(function (x) { return String(x).trim(); }); });
          var debut = 0; for (var i = 0; i < Math.min(10, rangs.length); i++) { if (rangs[i].filter(function (x) { return String(x).trim(); }).length >= 2) { debut = i; break; } }
          etat.entetes = (rangs[debut] || []).map(function (x) { return String(x).trim(); }); etat.rangs = rangs.slice(debut + 1);
          associerTout();
        }, function (e) { AMX.vider(elAssoc); elAssoc.appendChild(h('p.ptf-avis', { text: AMX.erreurTexte(e) })); });
      });
      elFichier.appendChild(input);
    }
    function associerTout() {
      if (!format || !etat.genre || !etat.rangs) return;
      var champs = format.genres[etat.genre].champs;
      etat.assoc = associer(champs, etat.entetes);
      dessinerAssoc();
    }
    function dessinerAssoc() {
      var champs = format.genres[etat.genre].champs;
      AMX.vider(elAssoc);
      elAssoc.appendChild(h('div.ptf-h', { text: '3. Les colonnes (' + AMX.fmtNombre(etat.rangs.length) + ' lignes)' }));
      var tbody = h('tbody');
      etat.entetes.forEach(function (e, j) {
        var ex = ''; for (var i = 0; i < Math.min(etat.rangs.length, 30); i++) { if (String(etat.rangs[i][j] || '').trim()) { ex = String(etat.rangs[i][j]); break; } }
        var sel = h('select.saisie', { onchange: function () { etat.assoc[j] = sel.value; verifier(); } }, [h('option', { value: '', text: '— ignorer —' })].concat(champs.map(function (c) { return h('option', { value: c[0], text: c[1] }); })));
        sel.value = etat.assoc[j] || '';
        tbody.appendChild(h('tr', [h('td', { text: e || '(sans titre)' }), h('td.ex', { text: ex, title: ex }), h('td', [sel])]));
      });
      elAssoc.appendChild(h('div.ptf-cadre', [h('table.tableau', [h('thead', [h('tr', [h('th', 'Colonne du fichier'), h('th', 'Exemple'), h('th', 'Champ')])]), tbody])]));
      etat.elFmt = h('div'); elAssoc.appendChild(etat.elFmt);
      verifier();
    }
    function verifier() {
      AMX.vider(elEnvoi);
      var manque = (REQUIS[etat.genre] || []).filter(function (gr) { return !gr.some(function (k) { return etat.assoc.indexOf(k) >= 0; }); });
      /* dates à barres ambiguës : on demande */
      var vals = []; etat.assoc.forEach(function (k, j) { if (DATES[k]) etat.rangs.slice(0, 500).forEach(function (r) { vals.push(r[j]); }); });
      var fd = formatDates(vals); if (!etat.fmtChoisi) etat.fmt = fd.fmt;
      AMX.vider(etat.elFmt);
      if (fd.ambigu || fd.fmt) {
        var sel = h('select.saisie', { onchange: function () { etat.fmt = sel.value; etat.fmtChoisi = true; } }, [h('option', { value: 'dmy', text: 'jour/mois/année (05/11/2026 = 5 nov.)' }), h('option', { value: 'mdy', text: 'mois/jour/année (11/05/2026 = 5 nov.)' })]);
        sel.value = etat.fmt || 'dmy'; if (!etat.fmt) etat.fmt = 'dmy';
        etat.elFmt.appendChild(h('div.champ', [h('label', { text: fd.ambigu && !fd.fmt ? 'Format des dates (impossible à deviner dans ce fichier)' : 'Format des dates (deviné)' }), sel]));
      }
      if (manque.length) { elEnvoi.appendChild(h('p.ptf-avis', { text: 'Colonne obligatoire à choisir : ' + manque.map(function (gr) { return gr.map(function (k) { var c = format.genres[etat.genre].champs.filter(function (x) { return x[0] === k; })[0]; return c ? c[1] : k; }).join(' ou '); }).join(' ; ') + '.' })); return; }
      var barre = h('div.progres', [h('i')]), info = h('p.doux');
      var btn = h('button.btn.primaire', { type: 'button', text: 'Envoyer ' + AMX.fmtNombre(etat.rangs.length) + ' lignes', onclick: function () { envoyer(btn, barre, info); } });
      elEnvoi.appendChild(h('div.ptf-h', { text: '4. Envoyer' })); elEnvoi.appendChild(btn); elEnvoi.appendChild(barre); elEnvoi.appendChild(info);
    }
    function envoyer(btn, barre, info) {
      btn.disabled = true;
      var lignes = etat.rangs.map(function (r) { var o = {}; etat.assoc.forEach(function (k, j) { if (k && r[j] !== undefined && r[j] !== '') o[k] = String(r[j]); }); return o; });
      var taille = etat.genre === 'bt' ? 2000 : 1000, lots = [], passage = new Date().toISOString(), cumul = { lus: 0, gardes: 0, ignores: 0, nouveaux: 0 };
      for (var i = 0; i < lignes.length; i += taille) lots.push(lignes.slice(i, i + taille));
      var k = 0;
      function suivant() {
        if (k >= lots.length) {
          info.textContent = 'Terminé : ' + AMX.fmtNombre(cumul.gardes) + ' lignes gardées (' + AMX.fmtNombre(cumul.nouveaux) + ' nouvelles), ' + AMX.fmtNombre(cumul.ignores) + ' ignorées (sans la clé requise). Le portefeuille est rebâti…';
          AMX.toast('Fichier importé — portefeuille rebâti dans un instant.', 'ok');
          self.charger('frais');
          return;
        }
        var dernier = k === lots.length - 1;
        AMX.post({ action: 'portefeuilleImporter', compagnie: cie, genre: etat.genre, lignes: lots[k], fichier: etat.fichier, formatDate: etat.fmt || '', passage: passage, dernier: dernier }, { delai: 180000, secours: false }).then(function (r) {
          if (!r || r.ok === false || r.refuse) throw new Error((r && r.erreur) || 'Envoi refusé.');
          if (!r.resume) throw new Error('Le script n\'est pas à jour — déployez la version qui contient Portefeuille.gs.');
          ['lus', 'gardes', 'ignores', 'nouveaux'].forEach(function (x) { cumul[x] += r.resume[x] || 0; });
          k++; barre.firstChild.style.width = Math.round(k / lots.length * 100) + '%';
          info.textContent = 'Lot ' + k + ' sur ' + lots.length + '…';
          suivant();
        }).catch(function (e) { btn.disabled = false; info.textContent = 'Arrêté au lot ' + (k + 1) + ' : ' + AMX.erreurTexte(e) + ' (les lots déjà envoyés sont gardés ; renvoyer le fichier ne crée pas de doublon).'; });
      }
      suivant();
    }
    void m;
  };

  /* --------------------------------------------------------------------------------------------- réglages */
  VuePortefeuille.prototype.reglages = function () {
    var self = this, p = (this.rep && this.rep.params) || {}, corps = h('div.ptf-reglages'), champs = {};
    function champ(cle, libelle, aide) { var i = h('input.saisie', { type: 'number', step: 'any', value: p[cle] === undefined ? '' : p[cle] }); champs[cle] = i; return h('div.champ', [h('label', { text: libelle }), i, aide ? h('small.doux', { text: aide }) : null]); }
    corps.appendChild(h('p', { text: 'Réglages de ' + (AMX.COMPAGNIES_TOUTES[this.cie] || this.cie) + ' : ils changent la valeur montrée, la fourchette et les segments, sans relire les sources.' }));
    corps.appendChild(h('div.grille', [
      champ('kmParAn', 'Km par année (estimé)', 'quand on n\'a qu\'une lecture ou aucune'), champ('tauxKm', 'Ajustement au km ($ / km)', 'moyenne des ventes OpenLane ramenée au km projeté ; 0 = la moyenne telle quelle, comme dans Équité'),
      champ('fourchetteBasPct', 'Fourchette : bas (%)', 'valeur − ce %'), champ('fourchetteHautPct', 'Fourchette : haut (%)', 'valeur + ce %'),
      champ('seuilEquite', 'Équité positive à partir de ($)'), champ('finContratMois', 'Fin de contrat dans (mois)'),
      champ('serviceInactifMois', 'Service inactif après (mois)'), champ('sweetSpotMin', 'Bon moment : à partir de (mois après l\'achat)'), champ('sweetSpotMax', 'Bon moment : jusqu\'à (mois)')
    ]));
    corps.appendChild(h('div.ptf-h', { text: 'Offres — valeurs par défaut quand le programme du mois ne dit rien' }));
    corps.appendChild(h('div.grille', [
      champ('tauxFinancement', 'Taux financement neuf (%)'), champ('termeFinancement', 'Terme financement neuf (mois)'),
      champ('tauxOccasion', 'Taux financement occasion (%)'), champ('termeOccasion', 'Terme occasion (mois)'),
      champ('tauxLocation', 'Taux location (%)'), champ('termeLocation', 'Terme location (mois)'), champ('residuelPct', 'Résiduel location (% du PDSF)'), champ('kmAnLocation', 'Km par an (location)'), champ('kmExcedent', 'Km excédentaire ($ / km)', 'montré au client sur la page d\'une location ; 0 = « précisé au contrat »'),
      champ('fraisOffre', 'Frais ajoutés au prix ($)', 'administration, préparation…'), champ('comptantOffre', 'Comptant ($)'),
      champ('margePaiement', 'Paiement semblable : au plus ($ de plus par mois)'), champ('offresParVehicule', 'Offres par véhicule (1 à 5)'),
      champ('occasionAnsMax', 'Occasion offerte : au plus (ans)'), champ('detteNulleApresAns', 'Sans contrat connu : payé après (ans)')
    ]));
    var demos = h('input', { type: 'checkbox' }); demos.checked = !!p.demosOffertes;
    corps.appendChild(h('label.case', { style: { display: 'flex', gap: '8px', alignItems: 'center', margin: '6px 0 10px' } }, [demos, 'Offrir aussi les démos']));
    var regles = h('textarea.saisie', { placeholder: 'Chevrolet; Equinox; 2020; 2023; -500' });
    regles.value = (p.reglesValeur || []).map(function (r) { return [r.marque, r.modele, r.anneeMin, r.anneeMax, r.ajustement].join('; '); }).join('\n');
    corps.appendChild(h('div.champ', [h('label', { text: 'Règles de valeur (une par ligne : marque; modèle; année min; année max; ajustement en $) — la plus précise d\'abord' }), regles]));
    AMX.modale({ titre: 'Réglages du portefeuille', corps: corps, boutons: [{ texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: function () {
      var params = {}; Object.keys(champs).forEach(function (k) { params[k] = champs[k].value; }); params.demosOffertes = demos.checked;
      params.reglesValeur = regles.value.split('\n').map(function (l) { var x = l.split(';').map(function (s) { return s.trim(); }); return x.length >= 5 ? { marque: x[0], modele: x[1], anneeMin: x[2], anneeMax: x[3], ajustement: x[4] } : null; }).filter(Boolean);
      return AMX.post({ action: 'portefeuilleReglages', compagnie: self.cie, params: params }).then(function (r) {
        if (!r || r.ok === false || r.refuse || !r.params) { AMX.toast((r && r.erreur) || 'Le script n\'est pas à jour.', 'erreur'); return false; }
        if (self.rep) { self.rep.params = r.params; self._cle = null; }
        AMX.toast('Réglages enregistrés.', 'ok'); self.rafraichir();
      }, function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); return false; });
    } }] });
  };

  /* --------------------------------------------------------------------------------------------- export */
  VuePortefeuille.prototype.exporter = function () {
    if (typeof XLSX === 'undefined') { AMX.toast('Lecteur Excel indisponible : rechargez la page.', 'erreur'); return; }
    var d = this.rep, liste = this.filtrees();
    var rangs = liste.map(function (a) {
      var v = a.v, c = v.client || {}, k = v.consent || {};
      return { 'Client': c.nom, 'Téléphone': d.contact ? c.telephone : (c.telephone ? 'au dossier' : ''), 'Courriel': d.contact ? c.courriel : (c.courriel ? 'au dossier' : ''), 'Ville': c.ville, 'No client': c.noClient, 'Année': v.annee, 'Marque': v.marque, 'Modèle': v.modele, 'Version': v.version, 'NIV': v.vin,
        'Relation': NOMS_RELATION[v.relation], 'État': NOMS_ETAT[v.etat], 'Acheté le': v.achat ? v.achat.le : '', 'Conseiller': v.achat ? v.achat.conseiller : '', 'Contrat': v.contrat ? v.contrat.typeContrat : '', 'Échéance': v.contrat ? v.contrat.echeance : '',
        'Dernier service': v.service ? v.service.derniere : '', 'Prochain rendez-vous': v.prochainRdv, 'Km projeté': a.km, 'Valeur (OpenLane)': a.valeur, 'Fourchette bas': a.bas, 'Fourchette haut': a.haut, 'Dette du jour': a.dette ? a.dette.solde : '', 'Équité': a.equite,
        'Consentement': NOMS_LCAP[k.lcap], 'Jusqu\'au': k.jusqua, 'Offres personnalisées': k.offres, 'Segments': a.segments.map(function (s) { return NOM_SEGMENT[s]; }).join(' · '),
        'Offre : véhicule': a.meilleure ? a.meilleure.vehicule : '', 'Offre : # stock': a.meilleure ? a.meilleure.stock : '', 'Offre : type': a.meilleure ? a.meilleure.type : '', 'Offre : paiement / mois': a.meilleure ? a.meilleure.paiement : '',
        'Offre : écart vs actuel': a.meilleure ? a.meilleure.ecart : '', 'Offre : statut': a.meilleure ? (a.meilleure.statut === 'prete' ? 'prête' : 'à réviser') : '' };
    });
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rangs), 'Portefeuille');
    XLSX.writeFile(wb, 'portefeuille-' + this.cie + '-' + auj() + '.xlsx');
  };
})();
