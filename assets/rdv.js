/* ScanAutomax — Service › Rendez-vous : carnet de rendez-vous du service (pilote VW Brossard, 16 oct. 2026).
   Maxime : « peut-on répliquer Xtime dans notre site, et faire mieux ? » → « oui, pilote pour VW ».

   Ce que fait la page :
   - Jour : colonnes par conseiller (ou par heure quand la concession n'a pas de conseillers inscrits), cartes de
     rendez-vous (heure, client, véhicule, travaux, transport, canal, état) ; clic = fiche avec les actions d'état.
   - Semaine : sept jours avec le nombre de rendez-vous et la charge d'atelier (heures vendues / heures disponibles).
   - Tableau du jour : prévus, arrivés, en cours, en attente (pièces / approbation), terminés, absents — cliquables.
   - Nouveau rendez-vous : client (recherche dans notre base par téléphone, nom, NIV, plaque — ou ajout rapide),
     véhicule (NIV décodé par NHTSA), travaux au menu, date et créneau, transport, conseiller, canal, notes.
     Les avertissements de capacité (plafond, salle d'attente, prêts, heures d'atelier) préviennent, ne bloquent jamais.
   - Client sans rendez-vous : même formulaire, aujourd'hui, maintenant, déjà « arrivé ».
   - Réglages (direction / admin) : heures d'ouverture, pas, plafonds, conseillers, travaux au menu.
   Données : GET ?rdv=1&compagnie=&du=&au= · ?rdvClients=1&q= ; POST rdvEnregistrer, rdvEtat, rdvClient, rdvConfig (Rdv.gs).
   Textos : rien d'automatique (règle de Maxime) — les cases « confirmation » et « rappel » des réglages restent à lui. */
(function () {
  'use strict';
  var h = AMX.h, I = AMX.icones;

  var ETATS = { prevu: 'Prévu', arrive: 'Arrivé', encours: 'En cours', pieces: 'Attend les pièces', approbation: 'Attend l\'approbation', termine: 'Terminé', absent: 'Client absent', annule: 'Annulé' };
  var ETATS_ACTIFS = ['prevu', 'arrive', 'encours', 'pieces', 'approbation'];
  var TRANSPORTS = { depot: 'Déposer le véhicule', attente: 'Salle d\'attente', pret: 'Véhicule de prêt', navette: 'Navette', valet: 'Valet' };
  var CANAUX = { telephone: 'Téléphone', comptoir: 'Au comptoir', web: 'Web', texto: 'Texto', sansrdv: 'Sans rendez-vous', dms: 'DMS' };
  var JOURS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'], JOURS_LONGS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  var MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  var COULEUR_ETAT = { prevu: 'gris', arrive: 'bleu', encours: 'vert', pieces: 'ambre', approbation: 'ambre', termine: 'sombre', absent: 'rouge', annule: 'rouge' };

  /* ------------------------------------------------------------------ utilitaires */
  var p2 = function (n) { return String(n).padStart(2, '0'); };
  function isoLocal(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function aujourdhui() { return isoLocal(new Date()); }
  function maintenant() { var d = new Date(); return p2(d.getHours()) + ':' + p2(d.getMinutes()); }
  function dateDe(iso) { return new Date(String(iso) + 'T12:00:00'); }
  function ajouterJours(iso, n) { var d = dateDe(iso); d.setDate(d.getDate() + n); return isoLocal(d); }
  function lundiDe(iso) { var d = dateDe(iso), j = (d.getDay() + 6) % 7; d.setDate(d.getDate() - j); return isoLocal(d); }
  function dateLongue(iso) { var d = dateDe(iso); return JOURS_LONGS[d.getDay()] + ' ' + d.getDate() + ' ' + MOIS[d.getMonth()] + ' ' + d.getFullYear(); }
  function dateCourte(iso) { var d = dateDe(iso); return JOURS[d.getDay()] + ' ' + d.getDate() + ' ' + MOIS[d.getMonth()]; }
  function minutes(hhmm) { var m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : -1; }
  function heureJolie(hhmm) { var m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '')); return m ? Number(m[1]) + ' h ' + m[2] : String(hhmm || ''); }
  function heures(x) { var n = Number(x) || 0; return (Math.round(n * 10) / 10).toLocaleString('fr-CA') + ' h'; }
  function telChiffres(x) { return String(x || '').replace(/[^\d]/g, ''); }
  function nomCie(c) { return AMX.COMPAGNIES_TOUTES[c] || c; }
  function creneaux(config, date) {
    var hh = config && config.heures && config.heures[JOURS[dateDe(date).getDay()]];
    if (!hh) return [];
    var out = [], deb = minutes(hh[0]), fin = minutes(hh[1]), pas = (config && config.pas) || 15;
    for (var m = deb; m < fin; m += pas) out.push(p2(Math.floor(m / 60)) + ':' + p2(m % 60));
    return out;
  }
  function heuresTravaux(r) { return (r.travaux || []).reduce(function (a, t) { return a + (Number(t.heures) || 0); }, 0); }
  /* Petite question avec un champ libre (facultatif) : résout avec le texte, ou null si on annule. */
  /* h() pose « value » en attribut : un <textarea> veut la propriété. */
  function zoneTexte(attrs, valeur) { var t = h('textarea.saisie', attrs); t.value = valeur || ''; return t; }
  function demanderTexte(titre, message, placeholder) {
    return new Promise(function (res) {
      var champ = h('input.saisie', { type: 'text', placeholder: placeholder || '', autocomplete: 'off' });
      var fini = false;
      var m = AMX.modale({ titre: titre, corps: h('div', [h('p', { style: { margin: '0 0 12px', color: 'var(--encre-2)' }, text: message }), champ]),
        boutons: [{ texte: 'Annuler', action: function (f) { fini = true; res(null); f(); return false; } }, { texte: 'Continuer', classe: 'primaire', action: function (f) { fini = true; res(champ.value.trim()); f(); return false; } }],
        onFermer: function () { if (!fini) res(null); } });
      champ.addEventListener('keydown', function (e) { if (e.key === 'Enter') m.el.querySelector('.modale-pied .btn.primaire').click(); });
      setTimeout(function () { champ.focus(); }, 30);
    });
  }

  /* ------------------------------------------------------------------ styles */
  var STYLE = [
    '.rdv-page .rdv-nav { display: flex; align-items: center; gap: 6px; }',
    '.rdv-page .rdv-nav .date { font-weight: 600; min-width: 190px; text-align: center; font-size: 13.5px; }',
    '.rdv-page .rdv-outils { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin: 0 0 12px; }',
    '.rdv-page .rdv-outils .recherche { flex: 1 1 260px; display: flex; align-items: center; gap: 8px; }',
    '.rdv-page .rdv-outils .recherche input { flex: 1; }',
    '.rdv-page .rdv-outils .compte { color: var(--encre-3); font-size: 12.5px; white-space: nowrap; }',
    '.rdv-colonnes { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); align-items: start; }',
    '.rdv-col { background: var(--carte); border: 1px solid var(--ligne); border-radius: var(--rayon); min-height: 200px; }',
    '.rdv-col > .tete { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--ligne); font-weight: 700; font-size: 13px; }',
    '.rdv-col > .tete .n { font-size: 12px; color: var(--encre-3); font-weight: 600; font-variant-numeric: tabular-nums; }',
    '.rdv-col > .corps { padding: 8px; display: flex; flex-direction: column; gap: 6px; }',
    '.rdv-col .heure-sep { font-size: 11px; font-weight: 700; color: var(--encre-4); letter-spacing: .04em; margin: 4px 4px 0; }',
    '.rdv-carte { border: 1px solid var(--ligne); border-left: 4px solid var(--gris); border-radius: 8px; padding: 7px 9px; cursor: pointer; background: #fff; display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; }',
    '.rdv-carte:hover { background: var(--carte-2); }',
    '.rdv-carte.e-arrive { border-left-color: var(--bleu); } .rdv-carte.e-encours { border-left-color: var(--vert); } .rdv-carte.e-pieces, .rdv-carte.e-approbation { border-left-color: var(--ambre); }',
    '.rdv-carte.e-termine { border-left-color: var(--noir-2); opacity: .75; } .rdv-carte.e-absent, .rdv-carte.e-annule { border-left-color: var(--rouge); opacity: .6; }',
    '.rdv-carte .client { font-weight: 700; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    '.rdv-carte .quand { font-family: var(--mono); font-size: 12px; font-weight: 600; text-align: right; }',
    '.rdv-carte .veh { grid-column: 1 / -1; font-size: 12px; color: var(--encre-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    '.rdv-carte .trav { grid-column: 1 / -1; font-size: 11.5px; color: var(--encre-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    '.rdv-carte .puces { grid-column: 1 / -1; display: flex; gap: 4px; flex-wrap: wrap; margin-top: 2px; }',
    '.rdv-carte .puces .puce { font-size: 10.5px; padding: 1px 7px; }',
    '.rdv-semaine { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 10px; }',
    '.rdv-jour { background: var(--carte); border: 1px solid var(--ligne); border-radius: var(--rayon); padding: 10px 12px; cursor: pointer; display: flex; flex-direction: column; gap: 6px; min-height: 120px; }',
    '.rdv-jour:hover { background: var(--carte-2); } .rdv-jour.ferme { opacity: .55; cursor: default; } .rdv-jour.auj { box-shadow: inset 0 0 0 2px var(--vert); }',
    '.rdv-jour .j { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--encre-3); }',
    '.rdv-jour .n { font-size: 22px; font-weight: 700; line-height: 1.1; }',
    '.rdv-jour .barre-charge { height: 6px; background: var(--gris-bg); border-radius: 3px; overflow: hidden; }',
    '.rdv-jour .barre-charge i { display: block; height: 100%; background: var(--vert); } .rdv-jour .barre-charge i.plein { background: var(--ambre); } .rdv-jour .barre-charge i.trop { background: var(--rouge); }',
    '.rdv-jour .sous { font-size: 11px; color: var(--encre-4); }',
    '.rdv-cap { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12.5px; color: var(--encre-2); margin: 0 0 12px; }',
    '.rdv-cap b { font-variant-numeric: tabular-nums; }',
    '.rdv-cap .plein { color: var(--ambre); font-weight: 600; } .rdv-cap .trop { color: var(--rouge); font-weight: 600; }',
    '.rdv-fiche dl { display: grid; grid-template-columns: 130px 1fr; gap: 6px 12px; margin: 0; font-size: 13px; }',
    '.rdv-fiche dt { color: var(--encre-3); } .rdv-fiche dd { margin: 0; }',
    '.rdv-fiche .actions-etat { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 14px; }',
    '.rdv-fiche .avert { background: var(--ambre-bg); color: var(--ambre); border-radius: 8px; padding: 8px 10px; font-size: 12.5px; margin: 10px 0 0; }',
    '.rdv-form .resultats-clients { border: 1px solid var(--ligne); border-radius: 8px; max-height: 180px; overflow: auto; margin-top: 4px; }',
    '.rdv-form .resultats-clients button { display: block; width: 100%; text-align: left; border: none; background: none; padding: 7px 10px; border-bottom: 1px solid var(--ligne); cursor: pointer; font-size: 12.5px; }',
    '.rdv-form .resultats-clients button:hover { background: var(--carte-2); } .rdv-form .resultats-clients button .d { color: var(--encre-3); }',
    '.rdv-form .rdv-vehicule { grid-template-columns: minmax(260px, 1.6fr) 1.2fr .8fr .8fr; } .rdv-form .rdv-vehicule input { font-family: var(--mono); font-size: 12.5px; }',
    '@media (max-width: 760px) { .rdv-form .rdv-vehicule { grid-template-columns: 1fr 1fr; } }',
    '.rdv-form .travaux { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 4px 12px; }',
    '.rdv-form .travaux label { display: flex; align-items: center; gap: 7px; font-size: 12.5px; padding: 3px 0; cursor: pointer; min-width: 0; }',
    '.rdv-form .travaux label > span:first-of-type { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    '.rdv-form input[type="checkbox"], .rdv-reglages input[type="checkbox"] { width: 16px; height: 16px; flex: none; margin: 0; padding: 0; accent-color: var(--vert); }',
    '.rdv-form .travaux label .d { color: var(--encre-4); font-size: 11px; margin-left: auto; white-space: nowrap; }',
    '.rdv-form .creneaux { display: grid; grid-template-columns: repeat(auto-fill, minmax(64px, 1fr)); gap: 4px; max-height: 150px; overflow: auto; padding: 2px; }',
    '.rdv-form .creneaux button { border: 1px solid var(--ligne); background: #fff; border-radius: 6px; padding: 4px 0; font-size: 12px; cursor: pointer; font-family: var(--mono); }',
    '.rdv-form .creneaux button.actif { background: var(--vert-clair); border-color: var(--vert); font-weight: 700; }',
    '.rdv-form .creneaux button.plein { color: var(--ambre); } .rdv-form .creneaux button.trop { color: var(--rouge); }',
    '.rdv-form .avert-liste { background: var(--ambre-bg); color: var(--ambre); border-radius: 8px; padding: 8px 10px; font-size: 12.5px; }',
    '.rdv-reglages table input { height: 28px; font-size: 12.5px; } .rdv-reglages .heures-jour { display: grid; grid-template-columns: 76px 118px 20px 118px auto; gap: 6px; align-items: center; margin-bottom: 4px; font-size: 12.5px; }',
    '@media (max-width: 900px) { .rdv-semaine { grid-template-columns: repeat(2, minmax(0, 1fr)); } .rdv-fiche dl { grid-template-columns: 1fr; } }',
    /* classeur : grille horaire (lignes = créneaux, colonnes = conseillers / jours / concessions) + résumé à droite */
    '.rdv-classeur { display: grid; grid-template-columns: minmax(0, 1fr) 290px; gap: 14px; align-items: start; }',
    '.rdv-classeur.sans-resume { grid-template-columns: minmax(0, 1fr); }',
    '@media (max-width: 1100px) { .rdv-classeur { grid-template-columns: minmax(0, 1fr); } }',
    '.rdv-grille-cadre { background: var(--carte); border: 1px solid var(--ligne); border-radius: var(--rayon); overflow: auto; max-height: calc(100vh - 300px); min-height: 420px; position: relative; }',
    '.rdv-grille { display: grid; min-width: 100%; position: relative; }',
    '.rdv-grille .coin, .rdv-grille .tete-col { position: sticky; top: 0; z-index: 3; background: var(--carte); border-bottom: 1px solid var(--ligne-forte); min-height: 44px; }',
    '.rdv-grille .coin { left: 0; z-index: 4; border-right: 1px solid var(--ligne); }',
    '.rdv-grille .tete-col { padding: 6px 10px; display: flex; flex-direction: column; justify-content: center; gap: 1px; border-left: 1px solid var(--ligne); min-width: 0; }',
    '.rdv-grille .tete-col .t { font-weight: 700; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    '.rdv-grille .tete-col .s { font-size: 11px; color: var(--encre-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }',
    '.rdv-grille .tete-col.cliquable { cursor: pointer; } .rdv-grille .tete-col.cliquable:hover { background: var(--carte-2); }',
    '.rdv-grille .tete-col.auj .t { color: var(--vert); } .rdv-grille .tete-col.ferme .t, .rdv-grille .tete-col.ferme .s { color: var(--encre-4); }',
    '.rdv-grille .axe { position: sticky; left: 0; z-index: 2; background: var(--carte); border-right: 1px solid var(--ligne); }',
    '.rdv-grille .axe .h { position: absolute; right: 8px; margin-top: 3px; font-size: 11px; font-weight: 600; color: var(--encre-3); font-family: var(--mono); white-space: nowrap; }',
    '.rdv-grille .pile { position: relative; border-left: 1px solid var(--ligne); min-width: 0; }',
    '.rdv-grille .creneau { position: absolute; left: 0; right: 0; box-sizing: border-box; border-top: 1px dashed var(--ligne); }',
    '.rdv-grille .creneau.heure { border-top: 1px solid var(--ligne-forte); }',
    '.rdv-grille .creneau.hors { background: repeating-linear-gradient(135deg, var(--carte-2) 0 6px, transparent 6px 12px); }',
    '.rdv-grille .creneau.libre { cursor: pointer; } .rdv-grille .creneau.libre:hover { background: var(--vert-clair); }',
    '.rdv-grille .creneau.passe, .rdv-grille .case.passe { background: var(--carte-2); opacity: .7; }',
    '.rdv-grille .creneau.libre:hover::after { content: "+ " attr(data-heure); position: absolute; right: 6px; top: 2px; font-size: 11px; color: var(--vert); font-weight: 600; font-family: var(--mono); }',
    '.rdv-grille .maintenant { position: absolute; left: 0; right: 0; height: 0; border-top: 2px solid var(--rouge); z-index: 2; pointer-events: none; }',
    '.rdv-grille .maintenant::before { content: ""; position: absolute; left: -4px; top: -5px; width: 8px; height: 8px; border-radius: 50%; background: var(--rouge); }',
    '.rdv-grille .ferme-msg { position: absolute; left: 0; right: 0; top: 40%; text-align: center; color: var(--encre-4); font-size: 12.5px; pointer-events: none; }',
    '.rdv-carte.posee { position: absolute; z-index: 1; margin: 1px 3px 1px 2px; padding: 3px 7px; display: block; overflow: hidden; box-shadow: var(--ombre); line-height: 1.25; }',
    '.rdv-carte.posee .ligne1 { display: flex; justify-content: space-between; gap: 6px; align-items: baseline; }',
    '.rdv-carte.posee .client { font-size: 12.5px; flex: 1 1 auto; min-width: 0; } .rdv-carte.posee .quand { font-size: 11px; flex: none; white-space: nowrap; }',
    '.rdv-carte.posee { container-type: inline-size; }',
    '@container (max-width: 170px) { .rdv-carte.posee .quand .dur { display: none; } } @container (max-width: 105px) { .rdv-carte.posee .quand { display: none; } }',
    '.rdv-grille .case { position: absolute; left: 0; right: 0; box-sizing: border-box; border-top: 1px solid var(--ligne-forte); display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 12px; cursor: pointer; }',
    '.rdv-grille .case.hors { background: repeating-linear-gradient(135deg, var(--carte-2) 0 6px, transparent 6px 12px); cursor: default; }',
    '.rdv-grille .case.libre:hover { background: var(--vert-clair); } .rdv-grille .case.libre:hover::after { content: "+"; color: var(--vert); font-weight: 700; }',
    '.rdv-grille .case.c1 { background: #EAF6EE; } .rdv-grille .case.c2 { background: #CDEBD7; } .rdv-grille .case.presque { background: var(--ambre-bg); } .rdv-grille .case.trop { background: var(--rouge-bg); }',
    '.rdv-grille .case b { font-size: 14px; font-variant-numeric: tabular-nums; } .rdv-grille .case .s { color: var(--encre-3); font-size: 11px; }',
    '.rdv-carte.posee .veh, .rdv-carte.posee .trav { display: block; font-size: 11.5px; }',
    '.rdv-carte.posee .puces { margin-top: 3px; } .rdv-carte.posee .puces .puce { font-size: 10px; padding: 0 6px; }',
    '.rdv-carte.posee.h1 .veh, .rdv-carte.posee.h1 .trav, .rdv-carte.posee.h1 .puces, .rdv-carte.posee.h2 .trav, .rdv-carte.posee.h2 .puces, .rdv-carte.posee.h3 .puces { display: none; }',
    '.rdv-carte.posee.h1 { padding-top: 1px; padding-bottom: 1px; } .rdv-carte.posee.h1 .client { font-size: 11.5px; }',
    '.rdv-carte.posee:hover { z-index: 2; }',
    '.rdv-resume { background: var(--carte); border: 1px solid var(--ligne); border-radius: var(--rayon); padding: 12px 14px; font-size: 12.5px; display: flex; flex-direction: column; gap: 14px; position: sticky; top: 70px; }',
    '.rdv-resume h4 { margin: 0 0 6px; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--encre-3); }',
    '.rdv-resume .item { display: grid; grid-template-columns: 62px 1fr 60px; gap: 8px; align-items: center; padding: 2px 0; }',
    '.rdv-resume .item.large { grid-template-columns: 1fr 60px; }',
    '.rdv-resume .item .lib { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--encre-2); }',
    '.rdv-resume .item .val { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; font-size: 12px; }',
    '.rdv-resume .item .val.presque { color: var(--ambre); } .rdv-resume .item .val.trop { color: var(--rouge); }',
    '.rdv-resume .jauge { height: 8px; background: var(--gris-bg); border-radius: 4px; overflow: hidden; }',
    '.rdv-resume .jauge i { display: block; height: 100%; background: var(--vert); border-radius: 4px; } .rdv-resume .jauge i.presque { background: var(--ambre); } .rdv-resume .jauge i.trop { background: var(--rouge); }',
    '.rdv-resume .jauge i.nl { background: var(--bleu); }',
    '.rdv-resume .puces-cie { display: flex; flex-wrap: wrap; gap: 4px; }',
    '.rdv-semaine-tetes { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; margin-bottom: 10px; }',
    '.rdv-semaine-tetes .rdv-jour { min-height: 0; padding: 8px 10px; gap: 4px; } .rdv-semaine-tetes .rdv-jour .n { font-size: 18px; }',
    '@media (max-width: 900px) { .rdv-semaine-tetes { grid-template-columns: repeat(4, minmax(0, 1fr)); } }'
  ].join('\n');
  if (!document.getElementById('rdv-style')) { var st = document.createElement('style'); st.id = 'rdv-style'; st.textContent = STYLE; document.head.appendChild(st); }

  /* ------------------------------------------------------------------ données */
  /* cle = clé de la réponse gardée ; cleEnCours = clé de l'appel en vol (distincts : une réponse d'une autre concession
     ne doit jamais être resservie pendant qu'on charge la nouvelle). */
  var cache = { cle: '', reponse: null, quand: 0, promesse: null, cleEnCours: '' };
  AMX.rdv = {
    charger: function (cie, du, au, force) {
      var cle = [cie || '', du, au].join('|');
      if (!force && cache.reponse && cache.cle === cle && Date.now() - cache.quand < 45000) return Promise.resolve(cache.reponse);
      if (cache.promesse && cache.cleEnCours === cle && !force) return cache.promesse;
      cache.cleEnCours = cle;
      var q = { rdv: 1, du: du, au: au }; if (cie) q.compagnie = cie;
      var promesse = AMX.get(q, { secours: false, copie: 'rdv_' + (cie || 'tous') }).then(function (d) {
        if (cache.promesse === promesse) cache.promesse = null;
        if (!d || d.refuse) throw new Error((d && (d.erreur || d.message)) || 'Accès refusé.');
        if (d.ok === false) throw new Error(d.erreur || 'Réponse inattendue du serveur');
        /* script pas encore redéployé : la route inconnue renvoie l'inventaire ({ ok, vehicules }) */
        if (!Array.isArray(d.rdv) || !d.configs) throw new Error('Carnet de rendez-vous indisponible — redéployez le script (Rdv.gs).');
        cache.reponse = d; cache.cle = cle; cache.quand = Date.now();
        try { document.dispatchEvent(new CustomEvent('amx:rdv')); } catch (e) {}
        return d;
      }, function (e) { if (cache.promesse === promesse) cache.promesse = null; throw e; });
      cache.promesse = promesse;
      return promesse;
    },
    copie: function (cie) {
      return AMX.cacheLocal.lireGz('rdv_' + (cie || 'tous'), 2 * 86400000).then(function (o) { return o && o.donnees && Array.isArray(o.donnees.rdv) ? o : null; }).catch(function () { return null; });
    },
    enCache: function () { return cache.reponse; },
    invalider: function () { cache.quand = 0; },
    compteur: function () {
      var d = cache.reponse; if (!d) return '';
      var auj = aujourdhui(), c = AMX.compagnieChoisie('service');
      var n = (d.rdv || []).filter(function (r) { return r.date === auj && (!c || r.compagnie === c) && ETATS_ACTIFS.indexOf(r.etat) >= 0; }).length;
      return n || '';
    },
    monter: function (conteneur, ctx) { return new VueRdv(conteneur, ctx); }
  };

  /* ------------------------------------------------------------------ vue */
  function VueRdv(conteneur, ctx) {
    var self = this;
    this.conteneur = conteneur;
    this.compagnie = AMX.compagnieChoisie('service') || (AMX.codesPour('service').length === 1 ? AMX.codesPour('service')[0] : '');
    this.date = (ctx && ctx.params && /^\d{4}-\d{2}-\d{2}$/.test(ctx.params.date || '')) ? ctx.params.date : aujourdhui();
    this.vue = AMX.memo.lire('rdv_vue', 'jour'); if (['jour', 'semaine'].indexOf(this.vue) < 0) this.vue = 'jour';
    this.mode = AMX.memo.lire('rdv_mode', ''); if (['classeur', 'conseiller', 'heure'].indexOf(this.mode) < 0) this.mode = AMX.memo.lire('rdv_par_conseiller', true) === false ? 'heure' : 'classeur';
    this.resume = AMX.memo.lire('rdv_resume', true) !== false;
    this.filtreEtat = ''; this.recherche = '';
    this.donnees = null; this.erreur = ''; this.copieLe = 0; this.generation = 0; this.detruit = false;
    this.construire();
    this.charger();
    this.surCompagnie = function () { if (self.detruit) return; var c = AMX.compagnieChoisie('service'); if (c !== self.compagnie) { self.compagnie = c; self.charger(); } };
    document.addEventListener('amx:compagnie', this.surCompagnie);
    this.minuterie = setInterval(function () { if (!document.hidden && !self.enEcriture) self.charger(); }, 60000);
    this.surVisible = function () { if (!document.hidden) self.charger(); };
    document.addEventListener('visibilitychange', this.surVisible);
    if (ctx && ctx.params && ctx.params.nouveau) setTimeout(function () { self.ouvrirFormulaire(null, ctx.params.nouveau === 'sansrdv'); }, 300);
  }
  VueRdv.prototype.demonter = function () { this.detruit = true; clearInterval(this.minuterie); document.removeEventListener('amx:compagnie', this.surCompagnie); document.removeEventListener('visibilitychange', this.surVisible); };
  VueRdv.prototype.naviguer = function (ctx) { if (ctx && ctx.params && ctx.params.date && /^\d{4}-\d{2}-\d{2}$/.test(ctx.params.date) && ctx.params.date !== this.date) { this.date = ctx.params.date; this.charger(); } };

  VueRdv.prototype.plage = function () {
    var deb = this.vue === 'semaine' ? lundiDe(this.date) : this.date;
    return { du: ajouterJours(deb, -1), au: ajouterJours(deb, this.vue === 'semaine' ? 7 : 1) };
  };
  VueRdv.prototype.config = function (cie) { var d = this.donnees; cie = cie || this.compagnie; return (d && d.configs && d.configs[cie]) || null; };
  VueRdv.prototype.peutEcrire = function () { return !!(this.donnees && this.donnees.peutEcrire); };

  VueRdv.prototype.construire = function () {
    var self = this;
    AMX.vider(this.conteneur);
    this.elEtat = h('p', { text: 'Chargement du carnet…' });
    this.btnPrec = h('button.btn.icone', { type: 'button', title: 'Jour précédent', html: '‹', onclick: function () { self.decaler(-1); } });
    this.btnSuiv = h('button.btn.icone', { type: 'button', title: 'Jour suivant', html: '›', onclick: function () { self.decaler(1); } });
    this.btnAuj = h('button.btn', { type: 'button', text: 'Aujourd\'hui', onclick: function () { self.date = aujourdhui(); self.charger(); } });
    this.elDate = h('span.date');
    this.elSegVue = h('div.segment', [
      h('button', { type: 'button', text: 'Jour', onclick: function () { self.changerVue('jour'); } }),
      h('button', { type: 'button', text: 'Semaine', onclick: function () { self.changerVue('semaine'); } })
    ]);
    this.btnRafraichir = h('button.btn', { type: 'button', html: I.rafraichir + '<span>Rafraîchir</span>', onclick: function () { self.charger(true, true); } });
    this.btnSans = h('button.btn', { type: 'button', text: 'Client sans rendez-vous', onclick: function () { self.ouvrirFormulaire(null, true); } });
    this.btnNouveau = h('button.btn.primaire', { type: 'button', html: '<span>+ Nouveau rendez-vous</span>', onclick: function () { self.ouvrirFormulaire(null, false); } });
    this.btnReglages = h('button.btn.fantome', { type: 'button', text: 'Réglages', onclick: function () { self.ouvrirReglages(); } });
    this.elCies = h('div.barre-cies');
    this.elKpis = h('div.kpis');
    this.elCap = h('div.rdv-cap');
    this.elRecherche = h('input.saisie', { type: 'search', placeholder: 'Client, téléphone, NIV, plaque, véhicule…', autocomplete: 'off', oninput: AMX.debounce(function (e) { self.recherche = e.target.value; self.rendreCorps(); }, 120) });
    var choisirMode = function (m) { self.mode = m; AMX.memo.ecrire('rdv_mode', m); self.rendre(); };
    this.elSegMode = h('div.segment.petit', [
      h('button', { type: 'button', text: 'Classeur', title: 'Grille horaire, comme un carnet de rendez-vous', onclick: function () { choisirMode('classeur'); } }),
      h('button', { type: 'button', text: 'Par conseiller', title: 'Cartes groupées par conseiller', onclick: function () { choisirMode('conseiller'); } }),
      h('button', { type: 'button', text: 'Par heure', title: 'Cartes groupées par heure', onclick: function () { choisirMode('heure'); } })
    ]);
    this.btnResume = h('button.btn.petit', { type: 'button', text: 'Résumé', title: 'Afficher ou cacher le résumé de la journée (capacité, canaux, travaux)', onclick: function () { self.resume = !self.resume; AMX.memo.ecrire('rdv_resume', self.resume); self.rendre(); } });
    this.elCompte = h('span.compte');
    this.elOutils = h('div.rdv-outils', [h('div.recherche', [h('span', { html: I.recherche }), this.elRecherche]), this.elSegMode, this.btnResume, this.elCompte]);
    this.elCorps = h('div');
    var entete = h('div.entete-page', [
      h('div', { style: { minWidth: 0 } }, [h('h1', 'Rendez-vous service'), this.elEtat]),
      h('div.actions', [h('div.rdv-nav', [this.btnPrec, this.elDate, this.btnSuiv, this.btnAuj]), this.elSegVue, this.btnRafraichir, this.btnReglages, this.btnSans, this.btnNouveau])
    ]);
    this.conteneur.appendChild(h('div.page.rdv-page', [entete, this.elCies, this.elKpis, this.elCap, this.elOutils, this.elCorps]));
  };
  VueRdv.prototype.decaler = function (n) { this.date = ajouterJours(this.date, this.vue === 'semaine' ? 7 * n : n); this.charger(); };
  VueRdv.prototype.changerVue = function (v) { if (v === this.vue) return; this.vue = v; AMX.memo.ecrire('rdv_vue', v); this.charger(); };

  /* force : ignore le cache de 45 s ; annoncer : toast « Carnet mis à jour » (bouton Rafraîchir seulement). */
  VueRdv.prototype.charger = function (force, annoncer) {
    var self = this, gen = ++this.generation, pl = this.plage();
    if (force) this.btnRafraichir.classList.add('occupe');
    if (!this.donnees) {
      this.elCorps.appendChild(AMX.chargeur('Rendez-vous'));
      AMX.rdv.copie(this.compagnie).then(function (o) { if (gen !== self.generation || self.donnees || !o) return; self.donnees = o.donnees; self.copieLe = o.quand; self.rendre(); }).catch(function () {});
    }
    return AMX.rdv.charger(this.compagnie, pl.du, pl.au, force).then(function (d) {
      if (gen !== self.generation || self.detruit) return;
      self.donnees = d; self.erreur = ''; self.copieLe = 0;
      self.btnRafraichir.classList.remove('occupe');
      self.rendre();
      if (AMX.rafraichirSousBarre) AMX.rafraichirSousBarre();
      if (annoncer) AMX.toast('Carnet mis à jour', 'ok');
    }).catch(function (e) {
      if (gen !== self.generation || self.detruit) return;
      self.btnRafraichir.classList.remove('occupe');
      self.erreur = AMX.erreurTexte(e); self.rendre();
      AMX.toast((self.donnees ? 'Rendez-vous : mise à jour impossible (copie affichée) — ' : 'Impossible de charger les rendez-vous — ') + self.erreur, 'erreur');
    });
  };

  /* Rendez-vous de la plage affichée, concession choisie, filtre d'état, recherche. */
  VueRdv.prototype.liste = function (date) {
    var self = this, d = this.donnees, q = this.recherche.trim().toUpperCase(), qTel = telChiffres(q);
    if (!d) return [];
    return (d.rdv || []).filter(function (r) {
      if (date && r.date !== date) return false;
      if (self.compagnie && r.compagnie !== self.compagnie) return false;
      if (self.filtreEtat === 'attend' ? !(r.etat === 'pieces' || r.etat === 'approbation') : (self.filtreEtat === 'hors' ? !(r.etat === 'absent' || r.etat === 'annule') : (self.filtreEtat && r.etat !== self.filtreEtat))) return false;
      if (q) {
        if (qTel.length >= 4 && telChiffres(r.telephone).indexOf(qTel) >= 0) return true;
        return [r.client, r.vehicule, r.vin, r.plaque, r.conseiller, (r.travaux || []).map(function (t) { return t.libelle; }).join(' ')].join(' ').toUpperCase().indexOf(q) >= 0;
      }
      return true;
    }).sort(function (a, b) { return (a.date + a.heure + a.id) < (b.date + b.heure + b.id) ? -1 : 1; });
  };

  VueRdv.prototype.rendre = function () {
    var self = this, d = this.donnees;
    AMX.barreConcessions(this.elCies, { domaine: 'service', valeur: this.compagnie, compte: function (c) { return d ? (d.rdv || []).filter(function (r) { return r.date === self.date && (!c || r.compagnie === c) && ETATS_ACTIFS.indexOf(r.etat) >= 0; }).length : null; }, onchange: function (c) { self.compagnie = c; self.charger(); } });
    this.elDate.textContent = this.vue === 'semaine' ? 'Semaine du ' + dateCourte(lundiDe(this.date)) : dateLongue(this.date);
    this.btnPrec.title = this.vue === 'semaine' ? 'Semaine précédente' : 'Jour précédent'; this.btnSuiv.title = this.vue === 'semaine' ? 'Semaine suivante' : 'Jour suivant';
    [].slice.call(this.elSegVue.children).forEach(function (b, i) { b.classList.toggle('actif', (i === 0) === (self.vue === 'jour')); });
    [].slice.call(this.elSegMode.children).forEach(function (b, i) { b.classList.toggle('actif', ['classeur', 'conseiller', 'heure'][i] === self.mode); });
    this.btnResume.classList.toggle('actif', this.resume); this.btnResume.classList.toggle('cache', this.mode !== 'classeur');
    this.btnReglages.classList.toggle('cache', !(d && d.peutConfigurer && this.compagnie));
    this.btnNouveau.disabled = this.btnSans.disabled = !(d && d.peutEcrire);
    if (this.erreur && !d) { this.elEtat.textContent = 'Serveur injoignable : ' + this.erreur; AMX.vider(this.elCorps); this.elCorps.appendChild(h('div.vide', [h('h3', 'Carnet indisponible'), h('div', { text: this.erreur })])); return; }
    if (!d) return;
    var cfg = this.config();
    var prefixe = this.copieLe ? 'Copie du ' + AMX.copieTexte(this.copieLe) + (this.erreur ? ' — mise à jour impossible : ' + this.erreur : ' — mise à jour en cours…') + ' · ' : '';
    var jour = this.liste(this.date), actifs = jour.filter(function (r) { return ETATS_ACTIFS.indexOf(r.etat) >= 0; });
    var cieTexte = this.compagnie ? nomCie(this.compagnie) : 'Tout le groupe';
    this.elEtat.textContent = prefixe + cieTexte + ' · ' + (this.vue === 'semaine' ? this.liste().filter(function (r) { return ETATS_ACTIFS.indexOf(r.etat) >= 0; }).length + ' rendez-vous cette semaine' : actifs.length + ' rendez-vous ' + (this.date === aujourdhui() ? 'aujourd\'hui' : 'ce jour-là')) + (cfg && cfg.conseillers.length ? ' · ' + cfg.conseillers.filter(function (c) { return c.actif; }).length + ' conseiller(s)' : '') + (this.compagnie && cfg && !cfg.conseillers.length && d.peutConfigurer ? ' · inscrivez vos conseillers dans Réglages' : '');
    this.rendreKpis();
    this.rendreCapacite();
    this.rendreCorps();
  };
  VueRdv.prototype.rendreKpis = function () {
    var self = this, tout = this.filtreEtatSauf(), n = function (f) { return tout.filter(f).length; };
    var defs = [
      ['', 'Prévus', n(function (r) { return r.etat === 'prevu'; }), 'pas encore arrivés'],
      ['arrive', 'Arrivés', n(function (r) { return r.etat === 'arrive'; }), 'au comptoir'],
      ['encours', 'En cours', n(function (r) { return r.etat === 'encours'; }), 'dans l\'atelier'],
      ['attend', 'En attente', n(function (r) { return r.etat === 'pieces' || r.etat === 'approbation'; }), 'pièces ou approbation'],
      ['termine', 'Terminés', n(function (r) { return r.etat === 'termine'; }), 'prêts à partir'],
      ['hors', 'Absents / annulés', n(function (r) { return r.etat === 'absent' || r.etat === 'annule'; }), '']
    ];
    AMX.vider(this.elKpis);
    defs.forEach(function (k) {
      var cle = k[0] === '' ? 'prevu' : k[0];
      self.elKpis.appendChild(h('button.kpi' + (self.filtreEtat === cle ? '.actif' : '') + (cle === 'hors' && k[2] ? '.alerte' : ''), { type: 'button', onclick: function () { self.filtreEtat = self.filtreEtat === cle ? '' : cle; self.rendre(); } }, [h('span.valeur', { text: String(k[2]) }), h('span.libelle', { text: k[1] }), k[3] ? h('span.sous', { text: k[3] }) : null]));
    });
  };
  /* Rendez-vous du jour (ou de la semaine) sans le filtre d'état — pour les compteurs. */
  VueRdv.prototype.filtreEtatSauf = function () { var f = this.filtreEtat; this.filtreEtat = ''; var l = this.vue === 'semaine' ? this.liste() : this.liste(this.date); this.filtreEtat = f; return l; };
  VueRdv.prototype.rendreCapacite = function () {
    var self = this, d = this.donnees, cfg = this.config(), cap = this.compagnie && d.capacite && d.capacite[this.compagnie] && d.capacite[this.compagnie][this.date];
    AMX.vider(this.elCap);
    if (!this.compagnie || !cfg || this.vue === 'semaine' || (this.mode === 'classeur' && this.resume)) { this.elCap.classList.add('cache'); return; }
    this.elCap.classList.remove('cache');
    var hv = cap ? cap.heures : 0, ha = cfg.heuresAtelier || 0, att = cap ? cap.attente : 0, pr = cap ? cap.pret : 0;
    /* la limite de salle d'attente est par heure : on affiche l'heure la plus chargée de la journée */
    var parH = {}, attMax = 0, hMax = '';
    (d.rdv || []).forEach(function (r) { if (r.date === self.date && r.compagnie === self.compagnie && r.transport === 'attente' && ETATS_ACTIFS.indexOf(r.etat) >= 0) { var k = String(r.heure || '').slice(0, 2); parH[k] = (parH[k] || 0) + 1; if (parH[k] > attMax) { attMax = parH[k]; hMax = k; } } });
    var cls = function (v, max) { return !max ? '' : (v > max ? 'trop' : (v >= max ? 'plein' : '')); };
    this.elCap.appendChild(h('span', ['Atelier : ', h('b.' + (cls(hv, ha) || 'ok'), { text: heures(hv) + (ha ? ' sur ' + heures(ha) : '') })]));
    this.elCap.appendChild(h('span', ['Salle d\'attente : ', h('b.' + (cls(attMax, cfg.attente) || 'ok'), { text: cfg.attente ? attMax + ' / ' + cfg.attente + (hMax ? ' à ' + hMax + ' h' : '') : String(att) }), h('span.doux', { text: att ? ' · ' + att + ' aujourd\'hui' : '' })]));
    this.elCap.appendChild(h('span', ['Véhicules de prêt : ', h('b.' + (cls(pr, cfg.pret) || 'ok'), { text: pr + (cfg.pret ? ' / ' + cfg.pret : '') })]));
    if (cap && cap.imprevus) this.elCap.appendChild(h('span', ['Sans rendez-vous : ', h('b', { text: String(cap.imprevus) })]));
    var ouverts = creneaux(cfg, this.date);
    this.elCap.appendChild(h('span.doux', { text: ouverts.length ? 'Ouvert ' + heureJolie(cfg.heures[JOURS[dateDe(this.date).getDay()]][0]) + ' – ' + heureJolie(cfg.heures[JOURS[dateDe(this.date).getDay()]][1]) + ' · créneaux de ' + cfg.pas + ' min' : 'Fermé ce jour-là' }));
  };
  VueRdv.prototype.rendreCorps = function () {
    var self = this;
    AMX.vider(this.elCorps);
    if (!this.donnees) return;
    if (this.vue === 'semaine') { this.elOutils.classList.add('cache'); this.rendreSemaine(); return; }
    this.elOutils.classList.remove('cache');
    var l = this.liste(this.date), cfg = this.config();
    this.elCompte.textContent = l.length + ' rendez-vous' + (this.recherche ? ' trouvés' : '');
    if (this.mode === 'classeur') { this.rendreClasseur(l, cfg); return; }
    if (!l.length) { this.elCorps.appendChild(h('div.vide', [h('h3', this.recherche || this.filtreEtat ? 'Aucun rendez-vous pour ce filtre' : 'Aucun rendez-vous ce jour-là'), h('div.doux', { text: this.peutEcrire() ? 'Cliquez « Nouveau rendez-vous » pour en prendre un.' : '' })])); return; }
    var colonnes = [], parConseiller = this.mode !== 'heure';
    if (!this.compagnie) {
      var parCie = {}; l.forEach(function (r) { (parCie[r.compagnie] = parCie[r.compagnie] || []).push(r); });
      Object.keys(parCie).forEach(function (c) { colonnes.push({ titre: nomCie(c), rdv: parCie[c] }); });
    } else if (parConseiller && cfg && cfg.conseillers.length) {
      var parCons = { '': [] }; cfg.conseillers.forEach(function (c) { if (c.actif) parCons[c.id] = []; });
      l.forEach(function (r) { (parCons[r.conseiller] || (parCons[r.conseiller] = [])).push(r); });
      if (parCons[''].length) colonnes.push({ titre: 'Non attribué', rdv: parCons[''] });
      cfg.conseillers.forEach(function (c) { if (parCons[c.id] && (c.actif || parCons[c.id].length)) colonnes.push({ titre: c.nom, rdv: parCons[c.id] }); });
      Object.keys(parCons).forEach(function (k) { if (k && !cfg.conseillers.some(function (c) { return c.id === k; })) colonnes.push({ titre: k, rdv: parCons[k] }); });
    } else {
      var parBloc = {}; l.forEach(function (r) { var k = String(r.heure || '').slice(0, 2) + 'h'; (parBloc[k] = parBloc[k] || []).push(r); });
      Object.keys(parBloc).sort().forEach(function (k) { colonnes.push({ titre: k.replace('h', ' h 00'), rdv: parBloc[k] }); });
    }
    var grille = h('div.rdv-colonnes');
    colonnes.forEach(function (col) {
      var corps = h('div.corps'), derniere = '';
      col.rdv.forEach(function (r) {
        if (parConseiller || !self.compagnie) { var bloc = String(r.heure || '').slice(0, 2) + ' h'; if (bloc !== derniere) { corps.appendChild(h('div.heure-sep', { text: bloc })); derniere = bloc; } }
        corps.appendChild(self.carte(r));
      });
      grille.appendChild(h('div.rdv-col', [h('div.tete', [h('span', { text: col.titre }), h('span.n', { text: col.rdv.filter(function (r) { return ETATS_ACTIFS.indexOf(r.etat) >= 0; }).length + ' / ' + col.rdv.length })]), corps]));
    });
    this.elCorps.appendChild(grille);
  };
  /* Carte d'un rendez-vous ; opts.rangs = hauteur en créneaux quand elle est posée dans la grille. */
  VueRdv.prototype.carte = function (r, opts) {
    var self = this, posee = !!(opts && opts.posee);
    var trav = (r.travaux || []).map(function (t) { return t.libelle; }).join(' · ');
    var puces = h('span.puces', [
      h('span.puce' + (({ arrive: '.info', encours: '.ok', pieces: '.attention', approbation: '.attention', termine: '.mono', absent: '.alerte', annule: '.alerte' })[r.etat] || ''), { text: ETATS[r.etat] || r.etat }),
      r.transport && r.transport !== 'depot' ? h('span.puce', { text: TRANSPORTS[r.transport] || r.transport }) : null,
      r.canal === 'sansrdv' ? h('span.puce.attention', { text: 'Sans RDV' }) : (r.canal === 'web' ? h('span.puce.info', { text: 'Web' }) : null),
      r.btNo ? h('span.puce.mono', { text: 'BT ' + r.btNo }) : null,
      !self.compagnie && !posee ? h('span.puce', { text: nomCie(r.compagnie) }) : null
    ]);
    var veh = [r.vehicule, r.plaque, r.km ? AMX.fmtNombre(Number(r.km)) + ' km' : ''].filter(Boolean).join(' · ') || (r.vin || 'Véhicule non précisé');
    var titre = (r.client || r.telephoneJoli || '—') + ' · ' + r.heure + (r.heures ? ' · ' + heures(r.heures) : '') + '\n' + veh + (trav ? '\n' + trav : '') + '\n' + (ETATS[r.etat] || r.etat) + (r.transport ? ' · ' + (TRANSPORTS[r.transport] || r.transport) : '') + (r.conseiller && posee ? '' : '');
    if (posee) {
      var rangs = Math.max(1, opts.rangs || 1);
      return h('div.rdv-carte.posee.h' + Math.min(4, rangs) + '.e-' + (r.etat || 'prevu'), { title: titre, onclick: function (e) { e.stopPropagation(); self.ouvrirFiche(r); } }, [
        h('span.ligne1', [h('span.client', { text: r.client || r.telephoneJoli || '—' }), h('span.quand', [r.heure, r.heures ? h('span.dur', { text: ' · ' + heures(r.heures) }) : null])]),
        h('span.veh', { text: veh }),
        trav ? h('span.trav', { text: trav }) : null,
        puces
      ]);
    }
    return h('div.rdv-carte.e-' + (r.etat || 'prevu'), { title: 'Ouvrir le rendez-vous', onclick: function () { self.ouvrirFiche(r); } }, [
      h('span.client', { text: r.client || r.telephoneJoli || '—' }),
      h('span.quand', { text: r.heure }),
      h('span.veh', { text: veh }),
      trav ? h('span.trav', { text: trav + (r.heures ? ' (' + heures(r.heures) + ')' : '') }) : null,
      puces
    ]);
  };

  /* ---------------------------------------------------------------- classeur (grille horaire) */
  function hhmm(m) { return p2(Math.floor(m / 60)) + ':' + p2(m % 60); }
  function dureeDe(r, pas) { var d = Number(r.duree) || Math.round((r.heures || 0) * 60) || 30; return Math.max(pas, d); }
  /* Heures d'ouverture [deb, fin] en minutes d'une concession pour une date ; null si fermé. */
  function heuresDe(cfg, date) { var hj = cfg && cfg.heures && cfg.heures[JOURS[dateDe(date).getDay()]]; return hj ? [minutes(hj[0]), minutes(hj[1])] : null; }
  /* Grille : colonnes = [{ id, titre, sous, rdv[], heures: [deb, fin] | null (fermé), auj, onEntete, onCreneau(heure) }],
     o = { deb, fin (minutes), pas, auj (ligne « maintenant ») }. Les cartes qui se chevauchent se partagent la largeur. */
  VueRdv.prototype.construireGrille = function (colonnes, o) {
    var self = this, pas = o.parHeure ? 60 : (o.pas || 15), deb = o.deb, fin = o.fin, rangH = o.parHeure ? 44 : (pas >= 30 ? 36 : (pas >= 20 ? 30 : 24)), nRangs = Math.max(1, Math.ceil((fin - deb) / pas)), haut = nRangs * rangH;
    var grille = h('div.rdv-grille', { style: { gridTemplateColumns: '56px repeat(' + colonnes.length + ', minmax(' + (colonnes.length > 5 ? 140 : 170) + 'px, 1fr))' } });
    grille.appendChild(h('div.coin'));
    colonnes.forEach(function (col) {
      grille.appendChild(h('div.tete-col' + (col.heures ? '' : '.ferme') + (col.auj && col.onEntete ? '.auj' : '') + (col.onEntete ? '.cliquable' : ''), { onclick: col.onEntete || undefined, title: col.onEntete ? 'Ouvrir cette journée' : undefined }, [h('span.t', { text: col.titre }), h('span.s', { text: col.sous || '' })]));
    });
    var axe = h('div.axe', { style: { height: haut + 'px' } });
    for (var m = deb; m < fin; m += pas) if (m % 60 === 0) axe.appendChild(h('span.h', { text: heureJolie(hhmm(m)), style: { top: ((m - deb) / pas * rangH) + 'px' } }));
    grille.appendChild(axe);
    var peut = this.peutEcrire(), nowM = minutes(maintenant()), auj = aujourdhui();
    colonnes.forEach(function (col) {
      var pile = h('div.pile', { style: { height: haut + 'px' } });
      var dateCol = col.date || o.date || auj;
      var passe = function (m) { return dateCol < auj || (dateCol === auj && m + (o.parHeure ? 60 : pas) <= nowM); };
      if (o.parHeure) {
        /* semaine : une case par heure — n rendez-vous · heures vendues, colorée selon la charge (plafond par heure) */
        for (var mh = deb; mh < fin; mh += 60) (function (mh) {
          var ouvert = !!col.heures && mh >= col.heures[0] && mh < col.heures[1];
          var dans = col.rdv.filter(function (r) { var m0 = minutes(r.heure); return m0 >= mh && m0 < mh + 60 && (ETATS_ACTIFS.indexOf(r.etat) >= 0 || r.etat === 'termine'); });
          var hv = dans.reduce(function (a, r) { return a + (r.heures || 0); }, 0), plaf = o.plafond || 0;
          var charge = !dans.length ? '' : (plaf && dans.length > plaf ? '.trop' : (plaf && dans.length >= plaf ? '.presque' : (dans.length >= 3 ? '.c2' : '.c1')));
          var cell = h('div.case' + (ouvert ? '' : '.hors') + charge, { style: { top: ((mh - deb) / pas * rangH) + 'px', height: (60 / pas * rangH) + 'px' } }, dans.length ? [h('b', { text: String(dans.length) }), h('span.s', { text: heures(hv) })] : null);
          if (dans.length && col.onEntete) { cell.title = dans.length + ' rendez-vous à ' + heureJolie(hhmm(mh)) + ' — ouvrir la journée'; cell.addEventListener('click', col.onEntete); }
          else if (ouvert && peut && col.onCreneau && !passe(mh)) { cell.classList.add('libre'); cell.title = 'Prendre un rendez-vous ' + col.titre + ' à ' + heureJolie(hhmm(mh)); cell.addEventListener('click', function () { col.onCreneau(hhmm(mh)); }); }
          else if (passe(mh)) cell.classList.add('passe');
          pile.appendChild(cell);
        })(mh);
        if (!col.heures && !col.rdv.length) pile.appendChild(h('div.ferme-msg', { text: 'Fermé' }));
        if (col.auj && nowM >= deb && nowM < fin) pile.appendChild(h('div.maintenant', { style: { top: ((nowM - deb) / pas * rangH) + 'px' } }));
        grille.appendChild(pile);
        return;
      }
      for (var m = deb; m < fin; m += pas) (function (m) {
        var ouvert = !!col.heures && m >= col.heures[0] && m < col.heures[1];
        var cell = h('div.creneau' + (m % 60 === 0 ? '.heure' : '') + (ouvert ? '' : '.hors'), { style: { top: ((m - deb) / pas * rangH) + 'px', height: rangH + 'px' } });
        if (ouvert && peut && col.onCreneau && !passe(m)) { cell.classList.add('libre'); cell.dataset.heure = hhmm(m); cell.title = 'Prendre un rendez-vous à ' + heureJolie(hhmm(m)); cell.addEventListener('click', function () { col.onCreneau(hhmm(m)); }); }
        else if (ouvert && passe(m)) cell.classList.add('passe');
        pile.appendChild(cell);
      })(m);
      if (!col.heures && !col.rdv.length) pile.appendChild(h('div.ferme-msg', { text: 'Fermé' }));
      /* voies : les rendez-vous qui se chevauchent dans la colonne se partagent la largeur */
      var evts = col.rdv.map(function (r) { var d0 = minutes(r.heure); return { r: r, d0: d0, d1: d0 + dureeDe(r, pas) }; }).filter(function (e) { return e.d0 >= 0; }).sort(function (a, b) { return a.d0 - b.d0 || a.d1 - b.d1; });
      var grappe = [], finsVoies = [];
      var poser = function () {
        var nV = finsVoies.length;
        grappe.forEach(function (e) {
          var top = Math.max(0, (e.d0 - deb) / pas * rangH), bas = Math.min(haut, (e.d1 - deb) / pas * rangH), ht = Math.max(rangH - 2, bas - top - 2);
          var carte = self.carte(e.r, { posee: true, rangs: Math.round(ht / rangH) });
          carte.style.top = top + 'px'; carte.style.height = ht + 'px'; carte.style.left = (e.voie * 100 / nV) + '%'; carte.style.width = 'calc(' + (100 / nV) + '% - 5px)';
          pile.appendChild(carte);
        });
        grappe = []; finsVoies = [];
      };
      evts.forEach(function (e) {
        if (grappe.length && finsVoies.every(function (f) { return f <= e.d0; })) poser();
        var v = -1; for (var i = 0; i < finsVoies.length; i++) if (finsVoies[i] <= e.d0) { v = i; break; }
        if (v < 0) { v = finsVoies.length; finsVoies.push(e.d1); } else finsVoies[v] = e.d1;
        e.voie = v; grappe.push(e);
      });
      if (grappe.length) poser();
      if (col.auj && nowM >= deb && nowM < fin) pile.appendChild(h('div.maintenant', { style: { top: ((nowM - deb) / pas * rangH) + 'px' }, title: 'Maintenant · ' + heureJolie(maintenant()) }));
      grille.appendChild(pile);
    });
    var cadre = h('div.rdv-grille-cadre', [grille]);
    /* on ouvre la grille sur l'heure courante (ou la première heure ouverte) */
    setTimeout(function () { var cible = (o.auj && !o.parHeure && nowM >= deb && nowM < fin) ? Math.max(0, (nowM - deb) / pas * rangH - 120) : 0; cadre.scrollTop = cible; }, 0);
    return cadre;
  };
  VueRdv.prototype.rendreClasseur = function (l, cfg) {
    var self = this, d = this.donnees, date = this.date, auj = date === aujourdhui(), colonnes = [], pas = (cfg && cfg.pas) || 15, deb = 7 * 60, fin = 17 * 60;
    var prefill = function (extra) { return function (heure) { self.ouvrirFormulaire(null, false, Object.assign({ date: date, heure: heure }, extra || {})); }; };
    var sousDe = function (rdv) { var a = rdv.filter(function (r) { return ETATS_ACTIFS.indexOf(r.etat) >= 0; }); var hv = a.reduce(function (x, r) { return x + (r.heures || 0); }, 0); return a.length + ' rendez-vous' + (hv ? ' · ' + heures(hv) : ''); };
    if (!this.compagnie) {
      var cies = Object.keys(d.configs || {}), bornes = null;
      cies.forEach(function (c) { var hc = heuresDe(d.configs[c], date); if (hc) bornes = bornes ? [Math.min(bornes[0], hc[0]), Math.max(bornes[1], hc[1])] : hc.slice(); });
      if (bornes) { deb = bornes[0]; fin = bornes[1]; }
      cies.forEach(function (c) {
        var rdv = l.filter(function (r) { return r.compagnie === c; });
        colonnes.push({ id: c, titre: nomCie(c), sous: sousDe(rdv), rdv: rdv, heures: heuresDe(d.configs[c], date), auj: auj, onCreneau: prefill({ compagnie: c }) });
      });
    } else {
      var hj = heuresDe(cfg, date); if (hj) { deb = hj[0]; fin = hj[1]; }
      var actifs = (cfg ? cfg.conseillers : []).filter(function (c) { return c.actif; });
      var sans = l.filter(function (r) { return !r.conseiller || !actifs.some(function (c) { return c.id === r.conseiller; }); });
      if (!actifs.length) colonnes.push({ id: '', titre: 'Rendez-vous', sous: sousDe(l), rdv: l, heures: hj, auj: auj, onCreneau: prefill() });
      else {
        if (sans.length) colonnes.push({ id: '', titre: 'Non attribué', sous: sousDe(sans), rdv: sans, heures: hj, auj: auj, onCreneau: prefill() });
        actifs.forEach(function (c) { var rdv = l.filter(function (r) { return r.conseiller === c.id; }); colonnes.push({ id: c.id, titre: c.nom, sous: sousDe(rdv), rdv: rdv, heures: hj, auj: auj, onCreneau: prefill({ conseiller: c.id }) }); });
      }
    }
    /* la grille s'étire pour montrer un rendez-vous pris hors des heures (dépôt tôt le matin, par exemple) */
    l.forEach(function (r) { var m0 = minutes(r.heure); if (m0 >= 0) { deb = Math.min(deb, Math.floor(m0 / 60) * 60); fin = Math.max(fin, Math.ceil((m0 + dureeDe(r, pas)) / 60) * 60); } });
    var cadre = this.construireGrille(colonnes, { deb: deb, fin: fin, pas: pas, auj: auj, date: date });
    var bloc = h('div.rdv-classeur' + (this.resume ? '' : '.sans-resume'), [cadre, this.resume ? this.rendreResume(l, cfg, deb, fin) : null]);
    this.elCorps.appendChild(bloc);
  };
  /* Résumé de la journée (à droite du classeur) : rendez-vous par heure, capacité, canaux, transport, travaux par catégorie. */
  VueRdv.prototype.rendreResume = function (l, cfg, deb, fin) {
    var self = this, d = this.donnees, tout = this.filtreEtatSauf(), actifs = tout.filter(function (r) { return ETATS_ACTIFS.indexOf(r.etat) >= 0 || r.etat === 'termine'; });
    var cls = function (v, max) { return !max ? '' : (v > max ? 'trop' : (v >= max ? 'presque' : '')); };
    var barre = function (v, max, nl) { var pct = max ? Math.min(100, Math.round(v / max * 100)) : (nl ? Math.min(100, v * 12) : 0); return h('div.jauge', [h('i' + (nl ? '.nl' : (cls(v, max) ? '.' + cls(v, max) : '')), { style: { width: pct + '%' } })]); };
    var ligne = function (lib, v, max, texte, nl) { return h('div.item', [h('span.lib', { text: lib }), barre(v, max, nl), h('span.val' + (cls(v, max) ? '.' + cls(v, max) : ''), { text: texte })]); };
    var sections = [];
    /* rendez-vous par heure vs plafond */
    var parH = {}; actifs.forEach(function (r) { var k = Math.floor(minutes(r.heure) / 60); parH[k] = (parH[k] || 0) + 1; });
    var plafond = cfg ? cfg.plafondHeure : 0, secH = h('div', [h('h4', 'Rendez-vous par heure' + (plafond ? ' · plafond ' + plafond : ' · sans limite'))]);
    for (var hh = Math.floor(deb / 60); hh < Math.ceil(fin / 60); hh++) secH.appendChild(ligne(hh + ' h', parH[hh] || 0, plafond, (parH[hh] || 0) + (plafond ? ' / ' + plafond : ''), !plafond));
    sections.push(secH);
    if (this.compagnie && cfg) {
      var cap = d.capacite && d.capacite[this.compagnie] && d.capacite[this.compagnie][this.date];
      var hv = actifs.reduce(function (a, r) { return a + (r.heures || 0); }, 0), ha = cfg.heuresAtelier || 0;
      var attH = {}, attMax = 0; actifs.forEach(function (r) { if (r.transport === 'attente' && r.etat !== 'termine') { var k = Math.floor(minutes(r.heure) / 60); attH[k] = (attH[k] || 0) + 1; attMax = Math.max(attMax, attH[k]); } });
      var prets = actifs.filter(function (r) { return r.transport === 'pret'; }).length, imprevus = actifs.filter(function (r) { return r.canal === 'sansrdv'; }).length;
      var secC = h('div', [h('h4', 'Capacité')]);
      secC.appendChild(ligne('Atelier', hv, ha, heures(hv) + (ha ? ' / ' + heures(ha) : ''), !ha));
      secC.appendChild(ligne('Attente', attMax, cfg.attente, attMax + (cfg.attente ? ' / ' + cfg.attente + ' par h' : ''), !cfg.attente));
      secC.appendChild(ligne('Prêts', prets, cfg.pret, prets + (cfg.pret ? ' / ' + cfg.pret : ''), !cfg.pret));
      secC.appendChild(h('div.item.large', [h('span.lib', { text: 'Sans rendez-vous' }), h('span.val', { text: String(imprevus) })]));
      secC.appendChild(h('div.item.large', [h('span.lib', { text: 'Terminés' }), h('span.val', { text: String(actifs.filter(function (r) { return r.etat === 'termine'; }).length) })]));
      sections.push(secC);
    } else {
      var secG = h('div', [h('h4', 'Par concession')]);
      Object.keys(d.configs || {}).forEach(function (c) { var n = actifs.filter(function (r) { return r.compagnie === c; }), hv2 = n.reduce(function (a, r) { return a + (r.heures || 0); }, 0), ha2 = d.configs[c].heuresAtelier || 0; secG.appendChild(ligne(nomCie(c), hv2, ha2, n.length + ' · ' + heures(hv2), !ha2)); });
      sections.push(secG);
    }
    /* canaux et transport */
    var nCanal = {}, nTrans = {}; actifs.forEach(function (r) { nCanal[r.canal || 'telephone'] = (nCanal[r.canal || 'telephone'] || 0) + 1; nTrans[r.transport || 'depot'] = (nTrans[r.transport || 'depot'] || 0) + 1; });
    var maxC = Math.max.apply(null, [1].concat(Object.keys(nCanal).map(function (k) { return nCanal[k]; })));
    var secCa = h('div', [h('h4', 'Canaux')]); Object.keys(CANAUX).forEach(function (k) { if (nCanal[k]) secCa.appendChild(ligne(CANAUX[k], nCanal[k], 0, String(nCanal[k]), true)); });
    if (!Object.keys(nCanal).length) secCa.appendChild(h('div.doux', { text: 'Aucun rendez-vous' }));
    sections.push(secCa);
    var secT = h('div', [h('h4', 'Transport')]); Object.keys(TRANSPORTS).forEach(function (k) { if (nTrans[k]) secT.appendChild(ligne(TRANSPORTS[k], nTrans[k], 0, String(nTrans[k]), true)); });
    if (Object.keys(nTrans).length) sections.push(secT);
    /* heures d'atelier par catégorie de travaux */
    var catDe = {}; ((cfg && cfg.travaux) || []).forEach(function (t) { catDe[t.code] = t.categorie || 'Autre'; });
    var parCat = {}, totalCat = 0; actifs.forEach(function (r) { (r.travaux || []).forEach(function (t) { var c = catDe[t.code] || 'Autre', hh2 = Number(t.heures) || 0; parCat[c] = (parCat[c] || 0) + hh2; totalCat += hh2; }); });
    if (totalCat) { var secW = h('div', [h('h4', 'Travaux (heures)')]); Object.keys(parCat).sort(function (a, b) { return parCat[b] - parCat[a]; }).forEach(function (c) { secW.appendChild(ligne(c, parCat[c], totalCat, heures(parCat[c]), false)); }); sections.push(secW); }
    void maxC;
    return h('div.rdv-resume', sections);
  };
  VueRdv.prototype.rendreSemaine = function () {
    var self = this, lundi = lundiDe(this.date), auj = aujourdhui(), cfg = this.config(), d = this.donnees;
    var tetes = h('div.rdv-semaine-tetes'), colonnes = [], deb = 7 * 60, fin = 17 * 60, bornes = null, pas = (cfg && cfg.pas) || 15;
    for (var i = 0; i < 7; i++) (function (i) {
      var date = ajouterJours(lundi, i), l = self.liste(date), actifs = l.filter(function (r) { return ETATS_ACTIFS.indexOf(r.etat) >= 0 || r.etat === 'termine'; });
      var cap = self.compagnie && d.capacite && d.capacite[self.compagnie] && d.capacite[self.compagnie][date];
      var hj = self.compagnie ? heuresDe(cfg, date) : (function () { var b = null; Object.keys(d.configs || {}).forEach(function (c) { var hc = heuresDe(d.configs[c], date); if (hc) b = b ? [Math.min(b[0], hc[0]), Math.max(b[1], hc[1])] : hc.slice(); }); return b; })();
      if (hj) bornes = bornes ? [Math.min(bornes[0], hj[0]), Math.max(bornes[1], hj[1])] : hj.slice();
      var ouvert = !!hj || !cfg;
      var hv = cap ? cap.heures : actifs.reduce(function (a, r) { return a + (r.heures || 0); }, 0), ha = cfg ? cfg.heuresAtelier : 0;
      var pct = ha ? Math.min(100, Math.round(hv / ha * 100)) : 0;
      var allerAuJour = function () { if (!ouvert && !l.length) return; self.date = date; self.vue = 'jour'; AMX.memo.ecrire('rdv_vue', 'jour'); self.charger(); };
      tetes.appendChild(h('div.rdv-jour' + (ouvert ? '' : '.ferme') + (date === auj ? '.auj' : ''), { onclick: allerAuJour }, [
        h('span.j', { text: dateCourte(date) }),
        h('span.n', { text: ouvert || l.length ? String(actifs.length) : '—' }),
        ha && ouvert ? h('div.barre-charge', [h('i' + (hv > ha ? '.trop' : (pct >= 90 ? '.plein' : '')), { style: { width: pct + '%' } })]) : null,
        h('span.sous', { text: !ouvert ? 'Fermé' : (ha ? heures(hv) + ' sur ' + heures(ha) : heures(hv) + ' d\'atelier') + (cap && cap.imprevus ? ' · ' + cap.imprevus + ' sans RDV' : '') })
      ]));
      colonnes.push({ id: date, date: date, titre: dateCourte(date), sous: ouvert ? actifs.length + ' rendez-vous' + (hv ? ' · ' + heures(hv) : '') : 'Fermé', rdv: l, heures: hj, auj: date === auj, onEntete: allerAuJour, onCreneau: function (heure) { self.ouvrirFormulaire(null, false, { date: date, heure: heure }); } });
    })(i);
    if (bornes) { deb = bornes[0]; fin = bornes[1]; }
    colonnes.forEach(function (col) { col.rdv.forEach(function (r) { var m0 = minutes(r.heure); if (m0 >= 0) { deb = Math.min(deb, Math.floor(m0 / 60) * 60); fin = Math.max(fin, Math.ceil((m0 + dureeDe(r, pas)) / 60) * 60); } }); });
    this.elCorps.appendChild(tetes);
    if (this.mode === 'classeur') this.elCorps.appendChild(this.construireGrille(colonnes, { deb: deb, fin: fin, pas: pas, parHeure: true, plafond: cfg ? cfg.plafondHeure : 0, auj: lundi <= auj && auj <= ajouterJours(lundi, 6) }));
  };

  /* ------------------------------------------------------------------ fiche d'un rendez-vous */
  VueRdv.prototype.ouvrirFiche = function (r) {
    var self = this, cfg = this.config(r.compagnie), peut = r.peutEcrire && this.peutEcrire();
    var cons = cfg && cfg.conseillers.filter(function (c) { return c.id === r.conseiller; })[0];
    var corps = h('div.rdv-fiche', [
      h('dl', [
        h('dt', 'Quand'), h('dd', { text: dateLongue(r.date) + ' à ' + heureJolie(r.heure) + (r.duree ? ' · ' + r.duree + ' min' : '') }),
        h('dt', 'Client'), h('dd', [h('b', { text: r.client || '—' }), r.telephoneJoli ? h('span', { text: ' · ' + r.telephoneJoli }) : null, r.courriel ? h('span.doux', { text: ' · ' + r.courriel }) : null]),
        h('dt', 'Véhicule'), h('dd', { text: [r.vehicule, r.vin, r.plaque, r.km ? AMX.fmtNombre(Number(r.km)) + ' km' : ''].filter(Boolean).join(' · ') || '—' }),
        h('dt', 'Travaux'), h('dd', (r.travaux || []).length ? [h('ul', { style: { margin: 0, paddingLeft: '18px' } }, (r.travaux || []).map(function (t) { return h('li', { text: t.libelle + (t.heures ? ' — ' + heures(t.heures) : '') + (t.prix ? ' · ' + AMX.fmtArgent(t.prix, 2) : '') }); })), h('div.doux', { text: 'Total ' + heures(r.heures) })] : '—'),
        h('dt', 'Transport'), h('dd', { text: TRANSPORTS[r.transport] || r.transport || '—' }),
        h('dt', 'Conseiller'), h('dd', { text: cons ? cons.nom : (r.conseiller || 'Non attribué') }),
        h('dt', 'Canal'), h('dd', { text: CANAUX[r.canal] || r.canal || '—' }),
        r.notes ? h('dt', 'Notes du client') : null, r.notes ? h('dd', { text: r.notes }) : null,
        r.noteInterne ? h('dt', 'Note interne') : null, r.noteInterne ? h('dd', { text: r.noteInterne }) : null,
        h('dt', 'État'), h('dd', [h('span.puce', { text: ETATS[r.etat] || r.etat }), r.btNo ? h('span.puce.mono', { text: 'BT ' + r.btNo }) : null, r.arriveLe ? h('span.doux', { text: ' · arrivé ' + AMX.fmtDate(r.arriveLe, true) }) : null, r.termineLe ? h('span.doux', { text: ' · terminé ' + AMX.fmtDate(r.termineLe, true) }) : null, r.annuleRaison ? h('span.doux', { text: ' · ' + r.annuleRaison }) : null]),
        h('dt', 'Référence'), h('dd.doux', { text: r.id + (r.code ? ' · code ' + r.code : '') + (r.creePar ? ' · pris par ' + String(r.creePar).split('@')[0] : '') + (r.creeLe ? ' le ' + AMX.fmtDate(r.creeLe, true) : '') })
      ])
    ]);
    var modale = AMX.modale({ titre: 'Rendez-vous — ' + (r.client || r.vehicule || r.id), corps: corps, large: true, boutons: [{ texte: 'Fermer' }] });
    if (peut) {
      var actions = h('div.actions-etat');
      var bouton = function (etat, texte, classe) {
        if (etat === r.etat) return null;
        return h('button.btn.petit' + (classe ? '.' + classe : ''), { type: 'button', text: texte, onclick: function () {
          var fin = function (extra) { self.changerEtat(r, etat, extra).then(function () { modale.fermer(); }); };
          if (etat === 'encours' && !r.btNo) demanderTexte('Numéro de bon de travail', 'Inscrivez le numéro de BT ouvert dans le DMS (facultatif).', 'BT').then(function (v) { if (v !== null) fin({ btNo: v }); });
          else if (etat === 'absent' || etat === 'annule') demanderTexte(etat === 'absent' ? 'Client absent' : 'Annuler le rendez-vous', 'Raison (facultatif).', 'Raison').then(function (v) { if (v !== null) fin({ raison: v }); });
          else fin({});
        } });
      };
      [['arrive', 'Arrivé', 'info'], ['encours', 'En cours', 'primaire'], ['pieces', 'Attend les pièces'], ['approbation', 'Attend l\'approbation'], ['termine', 'Terminé', 'sombre'], ['absent', 'Absent', 'danger'], ['annule', 'Annuler', 'danger'], ['prevu', 'Remettre « prévu »']].forEach(function (b) { var el = bouton(b[0], b[1], b[2]); if (el) actions.appendChild(el); });
      actions.appendChild(h('button.btn.petit', { type: 'button', text: 'Modifier', onclick: function () { modale.fermer(); self.ouvrirFormulaire(r, false); } }));
      corps.appendChild(actions);
    }
  };
  VueRdv.prototype.changerEtat = function (r, etat, extra) {
    var self = this, corps = Object.assign({ action: 'rdvEtat', id: r.id, etat: etat }, extra || {});
    var avant = r.etat; r.etat = etat; this.rendre();   /* mise à jour optimiste, le serveur confirme */
    this.enEcriture = true;
    return AMX.post(corps, { secours: true }).then(function (d) {
      self.enEcriture = false;
      if (!d || d.ok === false || d.refuse) { r.etat = avant; self.rendre(); AMX.toast((d && (d.erreur || d.message)) || 'Changement refusé', 'erreur'); return; }
      Object.assign(r, d.rdv || {}); self.rendre(); AMX.rdv.invalider();
      AMX.toast(ETATS[etat] + ' — ' + (r.client || r.id), 'ok');
    }, function (e) { self.enEcriture = false; r.etat = avant; self.rendre(); AMX.toast('Changement non enregistré — ' + AMX.erreurTexte(e), 'erreur'); });
  };

  /* ------------------------------------------------------------------ formulaire (nouveau / modifier / sans rendez-vous) */
  /* r = rendez-vous à modifier (null = nouveau) ; sansRdv = client arrivé sans rendez-vous ; prefill = { date, heure, conseiller, compagnie } (clic dans la grille). */
  VueRdv.prototype.ouvrirFormulaire = function (r, sansRdv, prefill) {
    var self = this, cie = (r && r.compagnie) || (prefill && prefill.compagnie) || this.compagnie;
    if (!cie) { AMX.toast('Choisissez d\'abord une concession.', 'erreur'); return; }
    var cfg = this.config(cie); if (!cfg) { AMX.toast('Réglages de la concession introuvables — rafraîchissez.', 'erreur'); return; }
    var neuf = !r;
    var v = Object.assign({ compagnie: cie, date: this.date, heure: '', client: '', telephone: '', courriel: '', vin: '', vehicule: '', plaque: '', km: '', travaux: [], transport: 'depot', conseiller: '', canal: sansRdv ? 'sansrdv' : 'telephone', notes: '', noteInterne: '', clientId: '' }, r ? JSON.parse(JSON.stringify(r)) : {});
    if (prefill && neuf) Object.assign(v, prefill);
    if (sansRdv) { v.date = aujourdhui(); v.heure = maintenant(); v.transport = 'attente'; }
    if (neuf && !sansRdv && v.date < aujourdhui()) v.date = aujourdhui();
    var choisis = {}; (v.travaux || []).forEach(function (t) { choisis[t.code] = t; });
    var champ = function (label, el, aide) { return h('div.champ', [h('label', label), el, aide ? h('span.aide', { text: aide }) : null]); };
    var inClient = h('input.saisie', { type: 'text', value: v.client, placeholder: 'Prénom et nom', autocomplete: 'off' });
    var inTel = h('input.saisie', { type: 'tel', value: v.telephone, placeholder: '514 555-1234', autocomplete: 'off' });
    var inCourriel = h('input.saisie', { type: 'email', value: v.courriel, placeholder: 'facultatif' });
    var resultats = h('div.resultats-clients.cache');
    var chercher = AMX.debounce(function (q) {
      q = String(q || '').trim();
      if (q.length < 3 || !neuf) { resultats.classList.add('cache'); return; }
      AMX.get({ rdvClients: 1, compagnie: cie, q: q }, { secours: false, essais: 1 }).then(function (d) {
        AMX.vider(resultats);
        if (!d || !d.ok || !(d.clients || []).length) { resultats.classList.add('cache'); return; }
        d.clients.forEach(function (c) {
          resultats.appendChild(h('button', { type: 'button', onclick: function () {
            v.clientId = c.id; inClient.value = c.affichage; inTel.value = c.telephoneJoli || c.telephone; inCourriel.value = c.courriel || '';
            var veh = (c.vehicules || [])[0]; if (veh && !inVin.value) { inVin.value = veh.vin || ''; inVeh.value = veh.texte || ''; inPlaque.value = veh.plaque || ''; inKm.value = veh.km || ''; }
            resultats.classList.add('cache');
          } }, [h('b', { text: c.affichage }), h('span.d', { text: ' · ' + (c.telephoneJoli || '') + ((c.vehicules || []).length ? ' · ' + (c.vehicules || []).map(function (x) { return x.texte || x.vin; }).join(', ') : '') })]));
        });
        resultats.classList.remove('cache');
      }).catch(function () { resultats.classList.add('cache'); });
    }, 250);
    inClient.addEventListener('input', function () { v.clientId = ''; chercher(inClient.value); });
    inTel.addEventListener('input', function () { v.clientId = ''; chercher(inTel.value); });
    var inVin = h('input.saisie.mono', { type: 'text', value: v.vin, placeholder: '17 caractères', maxlength: 17, style: { textTransform: 'uppercase' } });
    var inVeh = h('input.saisie', { type: 'text', value: v.vehicule, placeholder: '2023 Volkswagen Tiguan' });
    var inPlaque = h('input.saisie', { type: 'text', value: v.plaque, placeholder: 'ABC 123', style: { textTransform: 'uppercase' } });
    var inKm = h('input.saisie', { type: 'text', inputmode: 'numeric', value: v.km, placeholder: 'km' });
    var btnDecoder = h('button.btn.petit', { type: 'button', text: 'Décoder le NIV', onclick: function () {
      var vin = inVin.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); if (vin.length !== 17) { AMX.toast('NIV de 17 caractères attendu', 'erreur'); return; }
      btnDecoder.classList.add('occupe');
      fetch('https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/' + vin + '?format=json').then(function (x) { return x.json(); }).then(function (d) {
        btnDecoder.classList.remove('occupe'); var r0 = (d.Results || [])[0] || {};
        var texte = [r0.ModelYear, r0.Make ? r0.Make.charAt(0) + r0.Make.slice(1).toLowerCase() : '', r0.Model, r0.Trim].filter(Boolean).join(' ');
        if (texte) { inVeh.value = texte; AMX.toast('NIV décodé : ' + texte, 'ok'); } else AMX.toast('NIV inconnu de NHTSA', 'erreur');
      }).catch(function () { btnDecoder.classList.remove('occupe'); AMX.toast('Décodage impossible pour le moment', 'erreur'); });
    } });
    var elTravaux = h('div.travaux');
    var parCat = {}; cfg.travaux.forEach(function (t) { (parCat[t.categorie || 'Autre'] = parCat[t.categorie || 'Autre'] || []).push(t); });
    var casesTravaux = [];
    Object.keys(parCat).forEach(function (cat) {
      elTravaux.appendChild(h('div.etiquette', { text: cat, style: { gridColumn: '1 / -1', marginTop: '6px' } }));
      parCat[cat].forEach(function (t) {
        var cb = h('input', { type: 'checkbox', checked: choisis[t.code] ? true : undefined, value: t.code });
        cb.addEventListener('change', function () { if (cb.checked) choisis[t.code] = { code: t.code, libelle: t.libelle, heures: t.heures, prix: t.prix }; else delete choisis[t.code]; majTotal(); });
        casesTravaux.push(cb);
        elTravaux.appendChild(h('label', [cb, h('span', { text: t.libelle }), h('span.d', { text: heures(t.heures) + (t.prix ? ' · ' + AMX.fmtArgent(t.prix, 0) : '') })]));
      });
    });
    (v.travaux || []).forEach(function (t) { if (!cfg.travaux.some(function (x) { return x.code === t.code; })) { var cb = h('input', { type: 'checkbox', checked: true, value: t.code }); cb.addEventListener('change', function () { if (cb.checked) choisis[t.code] = t; else delete choisis[t.code]; majTotal(); }); elTravaux.appendChild(h('label', [cb, h('span', { text: t.libelle + ' (hors menu)' }), h('span.d', { text: heures(t.heures) })])); } });
    var elTotal = h('div.doux', { style: { marginTop: '6px' } });
    var majTotal = function () { var hh = Object.keys(choisis).reduce(function (a, k) { return a + (Number(choisis[k].heures) || 0); }, 0); var nT = Object.keys(choisis).length; elTotal.textContent = nT ? (nT === 1 ? '1 travail' : nT + ' travaux') + ' · ' + heures(hh) + ' d\'atelier' : 'Aucun travail choisi'; };
    majTotal();
    var inDate = h('input.saisie', { type: 'date', value: v.date, min: neuf && !sansRdv ? aujourdhui() : undefined });
    var inHeure = h('input.saisie', { type: 'time', value: v.heure, step: 300, style: { width: '120px' } });
    var elCreneaux = h('div.creneaux');
    var rendreCreneaux = function () {
      AMX.vider(elCreneaux);
      var date = inDate.value, liste = creneaux(cfg, date), occ = {};
      (self.donnees.rdv || []).forEach(function (x) { if (x.compagnie === cie && x.date === date && x.id !== v.id && ETATS_ACTIFS.indexOf(x.etat) >= 0) { var k = String(x.heure || '').slice(0, 2); occ[k] = (occ[k] || 0) + 1; } });
      if (!liste.length) { elCreneaux.appendChild(h('div.doux', { text: 'Fermé ce jour-là — choisissez une autre date, ou inscrivez l\'heure à la main pour un dépôt.' })); return; }
      liste.forEach(function (hh) {
        var n = occ[hh.slice(0, 2)] || 0, cls = cfg.plafondHeure ? (n >= cfg.plafondHeure ? '.trop' : (n >= cfg.plafondHeure - 1 ? '.plein' : '')) : '';
        elCreneaux.appendChild(h('button' + cls + (inHeure.value === hh ? '.actif' : ''), { type: 'button', text: hh, title: n ? n + ' rendez-vous à ' + hh.slice(0, 2) + ' h' : 'Libre', onclick: function () { inHeure.value = hh; rendreCreneaux(); } }));
      });
    };
    inDate.addEventListener('change', rendreCreneaux); inHeure.addEventListener('change', rendreCreneaux);
    rendreCreneaux();
    var selTransport = h('select.saisie', Object.keys(TRANSPORTS).map(function (k) { return h('option', { value: k, selected: v.transport === k ? true : undefined, text: TRANSPORTS[k] }); }));
    var selCons = h('select.saisie', [h('option', { value: '', text: 'Aucune préférence' })].concat(cfg.conseillers.filter(function (c) { return c.actif || c.id === v.conseiller; }).map(function (c) { return h('option', { value: c.id, selected: v.conseiller === c.id ? true : undefined, text: c.nom }); })));
    var selCanal = h('select.saisie', Object.keys(CANAUX).map(function (k) { return h('option', { value: k, selected: v.canal === k ? true : undefined, text: CANAUX[k] }); }));
    var inNotes = zoneTexte({ placeholder: 'Ce que le client a dit (bruit, témoin, demande particulière)…' }, v.notes);
    var inNoteInt = zoneTexte({ placeholder: 'Pour l\'équipe seulement' }, v.noteInterne);
    var elAvert = h('div.avert-liste.cache');
    var corps = h('div.rdv-form', [
      sansRdv ? h('div.puce.attention', { text: 'Client sans rendez-vous — arrivé maintenant', style: { marginBottom: '10px' } }) : null,
      h('div.grille.c3', [champ('Client', inClient, neuf ? 'Tapez 3 lettres ou 4 chiffres : nos fiches apparaissent' : null), champ('Téléphone', inTel), champ('Courriel', inCourriel)]),
      resultats,
      h('div.grille.c4.rdv-vehicule', { style: { marginTop: '12px' } }, [champ('NIV', h('div', { style: { display: 'flex', gap: '6px' } }, [inVin, btnDecoder])), champ('Véhicule', inVeh), champ('Plaque', inPlaque), champ('Kilométrage', inKm)]),
      h('div.champ', { style: { marginTop: '12px' } }, [h('label', 'Travaux demandés'), elTravaux, elTotal]),
      h('div.grille.c2', { style: { marginTop: '12px' } }, [champ('Date', inDate), champ('Heure', inHeure, cfg.pas + ' min entre les créneaux · dépôt accepté dès ' + heureJolie(cfg.depotTot))]),
      h('div.champ', [h('label', 'Créneaux du jour'), elCreneaux]),
      h('div.grille.c3', { style: { marginTop: '12px' } }, [champ('Transport', selTransport), champ('Conseiller', selCons), champ('Canal', selCanal)]),
      h('div.grille.c2', { style: { marginTop: '12px' } }, [champ('Notes du client', inNotes), champ('Note interne', inNoteInt)]),
      elAvert
    ]);
    var envoyer = function (fermer, btn) {
      var rdv = { id: v.id || undefined, compagnie: cie, date: inDate.value, heure: inHeure.value, client: inClient.value.trim(), telephone: inTel.value.trim(), courriel: inCourriel.value.trim(), vin: inVin.value.toUpperCase().replace(/[^A-Z0-9]/g, ''), vehicule: inVeh.value.trim(), plaque: inPlaque.value.toUpperCase().trim(), km: inKm.value.replace(/[^\d]/g, ''), travaux: Object.keys(choisis).map(function (k) { return choisis[k]; }), transport: selTransport.value, conseiller: selCons.value, canal: selCanal.value, notes: inNotes.value.trim(), noteInterne: inNoteInt.value.trim(), clientId: v.clientId || '' };
      if (!rdv.client && !telChiffres(rdv.telephone)) { AMX.toast('Nom ou téléphone du client requis', 'erreur'); inClient.focus(); return false; }
      if (!rdv.date || !rdv.heure) { AMX.toast('Date et heure requises', 'erreur'); return false; }
      if (sansRdv && neuf) rdv.etat = 'arrive';
      self.enEcriture = true;
      return AMX.post({ action: 'rdvEnregistrer', rdv: rdv }, { delai: 60000 }).then(function (d) {
        self.enEcriture = false;
        if (!d || d.ok === false || d.refuse) { AMX.toast((d && (d.erreur || d.message)) || 'Enregistrement refusé', 'erreur'); return false; }
        if (d.avertissements && d.avertissements.length) AMX.toast('Enregistré avec avertissement : ' + d.avertissements.join(' '), 'attention', 8000); else AMX.toast(neuf ? 'Rendez-vous pris — ' + (d.rdv.client || '') + ' ' + dateCourte(d.rdv.date) + ' ' + heureJolie(d.rdv.heure) : 'Rendez-vous modifié', 'ok');
        if (d.rdv && d.rdv.date !== self.date && self.vue === 'jour' && !sansRdv) self.date = d.rdv.date;
        AMX.rdv.invalider(); self.charger(true);
        return true;
      }, function (e) { self.enEcriture = false; AMX.toast('Non enregistré — ' + AMX.erreurTexte(e), 'erreur'); return false; });
    };
    AMX.modale({ titre: sansRdv ? 'Client sans rendez-vous' : (neuf ? 'Nouveau rendez-vous — ' + nomCie(cie) : 'Modifier le rendez-vous ' + (v.id || '')), corps: corps, large: true, boutons: [{ texte: 'Annuler' }, { texte: sansRdv ? 'Enregistrer l\'arrivée' : (neuf ? 'Prendre le rendez-vous' : 'Enregistrer'), classe: 'primaire', action: envoyer }] });
    setTimeout(function () { (neuf ? inClient : inHeure).focus(); }, 50);
  };

  /* ------------------------------------------------------------------ réglages de la concession */
  VueRdv.prototype.ouvrirReglages = function () {
    var self = this, cie = this.compagnie, cfg = this.config(cie);
    if (!cie || !cfg) return;
    var c = JSON.parse(JSON.stringify(cfg));
    var champ = function (label, el, aide) { return h('div.champ', [h('label', label), el, aide ? h('span.aide', { text: aide }) : null]); };
    var num = function (val, opts) { return h('input.saisie', Object.assign({ type: 'number', value: val, min: 0, step: 1 }, opts || {})); };
    var inPas = h('select.saisie', [10, 15, 20, 30, 60].map(function (p) { return h('option', { value: p, selected: c.pas === p ? true : undefined, text: p + ' min' }); }));
    var inPlafond = num(c.plafondHeure), inAttente = num(c.attente), inPret = num(c.pret), inAtelier = num(c.heuresAtelier, { step: 0.5 }), inDepot = h('input.saisie', { type: 'time', value: c.depotTot || '06:30' });
    var heuresEl = h('div'), heuresIn = {};
    JOURS.slice(1).concat(['dim']).forEach(function (j) {
      var ouv = c.heures[j]; var cb = h('input', { type: 'checkbox', checked: ouv ? true : undefined }), d1 = h('input.saisie', { type: 'time', value: ouv ? ouv[0] : '07:00', disabled: ouv ? undefined : true }), d2 = h('input.saisie', { type: 'time', value: ouv ? ouv[1] : '17:00', disabled: ouv ? undefined : true });
      cb.addEventListener('change', function () { d1.disabled = d2.disabled = !cb.checked; });
      heuresIn[j] = { cb: cb, d1: d1, d2: d2 };
      heuresEl.appendChild(h('div.heures-jour', [h('label', { text: JOURS_LONGS[JOURS.indexOf(j)] }), d1, h('span', '→'), d2, h('label.champ.inline', [cb, h('span', 'ouvert')])]));
    });
    var consEl = zoneTexte({ placeholder: 'Un conseiller par ligne', style: { minHeight: '90px' } }, c.conseillers.map(function (x) { return x.nom + (x.actif ? '' : ' (inactif)'); }).join('\n'));
    var tbody = h('tbody');
    var ligneTravail = function (t) {
      var tr = h('tr', [
        h('td', [h('input.saisie', { type: 'text', value: t.code, placeholder: 'CODE', style: { width: '90px', textTransform: 'uppercase' } })]),
        h('td', [h('input.saisie', { type: 'text', value: t.libelle, placeholder: 'Libellé' })]),
        h('td', [h('input.saisie', { type: 'text', value: t.categorie, placeholder: 'Catégorie', style: { width: '120px' } })]),
        h('td', [h('input.saisie', { type: 'number', value: t.heures, step: 0.25, min: 0, style: { width: '70px' } })]),
        h('td', [h('input.saisie', { type: 'number', value: t.prix, step: 0.01, min: 0, style: { width: '90px' } })]),
        h('td', [h('button.btn.petit.fantome', { type: 'button', text: '×', title: 'Retirer', onclick: function () { tr.remove(); } })])
      ]);
      tbody.appendChild(tr);
    };
    c.travaux.forEach(ligneTravail);
    var table = h('table.tableau', [h('thead', [h('tr', [h('th', 'Code'), h('th', 'Travail'), h('th', 'Catégorie'), h('th', 'Heures'), h('th', 'Prix'), h('th', '')])]), tbody]);
    var cbConf = h('input', { type: 'checkbox', checked: c.textos.confirmation ? true : undefined }), cbRap = h('input', { type: 'checkbox', checked: c.textos.rappel ? true : undefined });
    var corps = h('div.rdv-reglages', [
      h('div.grille.c3', [champ('Créneaux', inPas), champ('Rendez-vous max. par heure', inPlafond, '0 = sans limite'), champ('Dépôt accepté dès', inDepot)]),
      h('div.grille.c3', { style: { marginTop: '10px' } }, [champ('Places en salle d\'attente (par heure)', inAttente), champ('Véhicules de prêt (par jour)', inPret), champ('Heures d\'atelier vendables par jour', inAtelier, 'techniciens × heures')]),
      h('div.champ', { style: { marginTop: '12px' } }, [h('label', 'Heures d\'ouverture'), heuresEl]),
      h('div.champ', { style: { marginTop: '12px' } }, [h('label', 'Conseillers'), consEl, h('span.aide', 'Un nom par ligne ; ajoutez « (inactif) » pour garder l\'historique sans l\'afficher.')]),
      h('div.champ', { style: { marginTop: '12px' } }, [h('label', 'Travaux au menu'), table, h('button.btn.petit', { type: 'button', text: '+ Ajouter un travail', style: { alignSelf: 'flex-start', marginTop: '6px' }, onclick: function () { ligneTravail({ code: '', libelle: '', categorie: '', heures: 1, prix: 0 }); } })]),
      h('div.champ', { style: { marginTop: '12px' } }, [h('label', 'Textos au client'), h('label.champ.inline', [cbConf, h('span', 'Confirmation à la prise du rendez-vous')]), h('label.champ.inline', [cbRap, h('span', 'Rappel la veille')]), h('span.aide', 'Décochés par défaut : aucun texto automatique sans l\'accord de la direction (Infobip, numéro du groupe).')])
    ]);
    AMX.modale({ titre: 'Réglages du carnet — ' + nomCie(cie), corps: corps, large: true, boutons: [{ texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: function () {
      var heures = {}; Object.keys(heuresIn).forEach(function (j) { var x = heuresIn[j]; heures[j] = x.cb.checked ? [x.d1.value, x.d2.value] : null; });
      var conseillers = consEl.value.split('\n').map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) { var inactif = /\(inactif\)/i.test(l); var nom = l.replace(/\(inactif\)/i, '').trim(); return { id: nom.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40), nom: nom, actif: !inactif }; });
      var travaux = [].slice.call(tbody.querySelectorAll('tr')).map(function (tr) { var i = tr.querySelectorAll('input'); return { code: i[0].value, libelle: i[1].value, categorie: i[2].value, heures: i[3].value, prix: i[4].value }; }).filter(function (t) { return t.code && t.libelle; });
      var config = { pas: Number(inPas.value), heures: heures, depotTot: inDepot.value, conseillers: conseillers, plafondHeure: Number(inPlafond.value), attente: Number(inAttente.value), pret: Number(inPret.value), heuresAtelier: Number(inAtelier.value), travaux: travaux, textos: { confirmation: cbConf.checked, rappel: cbRap.checked } };
      return AMX.post({ action: 'rdvConfig', compagnie: cie, config: config }).then(function (d) {
        if (!d || d.ok === false || d.refuse) { AMX.toast((d && (d.erreur || d.message)) || 'Réglages refusés', 'erreur'); return false; }
        if (self.donnees && self.donnees.configs) self.donnees.configs[cie] = d.config;
        AMX.toast('Réglages enregistrés', 'ok'); AMX.rdv.invalider(); self.charger(true);
        return true;
      }, function (e) { AMX.toast('Réglages non enregistrés — ' + AMX.erreurTexte(e), 'erreur'); return false; });
    } }] });
  };
})();
