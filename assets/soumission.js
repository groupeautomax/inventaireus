/* Inventaire › Soumissions (21 octobre 2026) — les véhicules neufs bâtis dans GM AutoBook PRO,
   avec leur feuille de soumission, la comparaison et le PDF client / interne.

   Maxime : « j'ai besoin de bâtir une plateforme comme celle-là » (AutoBook PRO = CarBook Pro de
   ChromeData : build & price toutes marques, PDSF + Invoice, équipement, specs, feuille de
   soumission). Décision : AutoBook reste la source (sa base est sous licence, on ne la copie
   pas) ; on lit UN véhicule à la fois — celui qu'on vient de bâtir — avec le favori
   « Automax ← AutoBook » (chargeur CODE_SIGNET_AUTOBOOK, code complet dans
   assets/signet-autobook.js, source mock/signet-autobook.src.js), par pont.html. Ici vivent la
   liste des soumissions, la fiche (options, équipement, fiche technique), la FEUILLE de
   soumission (client en PDSF, interne en Invoice : lignes ajoutées, rabais, échange, taxes par
   province, profit), la comparaison côte à côte et l'impression (client sans Invoice / interne).

   Routes : GET ?soumissions=1, ?soumission=1&id= ; POST soumissionEnregistrer, soumissionDupliquer,
   soumissionSupprimer (Soumission.gs). Montée par Inventaire › Soumissions (assets/inventaire.js).

   CATALOGUE (21 oct., 08 h 40 — Maxime : « copie le catalogue alors ») : le favori « Automax ← AutoBook
   (catalogue) » (même code, chargeur CODE_SIGNET_AUTOBOOK_CATALOGUE) lit un style à la fois dans
   AutoBook — toutes ses options avec leur statut par défaut, PDSF et Invoice, prix de base, transport,
   équipement, specs — et l'envoie au catalogue (Catalogue.gs : GET ?catalogue=1, ?catalogueStyle=,
   POST catalogueImporter, catalogueSupprimer). Le site BÂTIT ensuite sans AutoBook (?batir=1) : année →
   marque → modèle → style, options cochées (catégories à choix unique = celles où un seul choix est
   fait par défaut), total PDSF / Invoice en direct → POST soumissionBatir → la fiche habituelle.
   Limite assumée : les règles de compatibilité d'AutoBook (telle option exige / exclut telle autre)
   ne sont pas copiées ; les statuts par défaut (inclus, requis, exclu) le sont.
   Les montants Invoice n'arrivent que pour les comptes qui modifient les montants, les
   gestionnaires / admins et ceux qui voient les résultats (comme les coûts des neufs). */
(function () {
  'use strict';
  var h = AMX.h, esc = AMX.esc, I = AMX.icones;
  var URL_AUTOBOOK = 'https://carbookpro.carbook.com/';
  // Chargeur du signet (généré par mock/signet-build.py) — ne jamais éditer la constante à la main.
  var CODE_SIGNET_AUTOBOOK = "javascript:(function () { var s = document.createElement('script'); s.src = " + JSON.stringify(AMX.SITE) + " + 'assets/signet-autobook.js?t=' + Date.now(); s.onerror = function () { alert(\"Impossible de charger le signet depuis le site d'inventaire (groupeautomax.github.io). V\u00e9rifiez votre connexion, puis recliquez.\"); }; document.body.appendChild(s); })();";
  var CODE_SIGNET_AUTOBOOK_CATALOGUE = "javascript:(function () { window.__amxAutobookMode = 'catalogue'; var s = document.createElement('script'); s.src = " + JSON.stringify(AMX.SITE) + " + 'assets/signet-autobook.js?t=' + Date.now(); s.onerror = function () { alert(\"Impossible de charger le signet depuis le site d'inventaire (groupeautomax.github.io). V\u00e9rifiez votre connexion, puis recliquez.\"); }; document.body.appendChild(s); })();";

  var STATUTS = { brouillon: ['Brouillon', 'gris'], envoyee: ['Envoyée', 'bleu'], acceptee: ['Acceptée', 'vert'], perdue: ['Perdue', 'rouge'], annulee: ['Annulée', 'sombre'] };
  var STATUTS_ORDRE = ['brouillon', 'envoyee', 'acceptee', 'perdue', 'annulee'];
  var STATUT_OPTION = { selected: ['Choisie', 'vert'], included: ['Incluse', 'bleu'], required: ['Requise', 'ambre'], upgraded: ['Rehaussée', 'violet'], excluded: ['Exclue', 'rouge'], unselected: ['Non choisie', 'gris'], varies: ['Prix variable', 'ambre'] };
  var TAXES_DEFAUT = { QC: [{ nom: 'TPS', taux: 5 }, { nom: 'TVQ', taux: 9.975 }], ON: [{ nom: 'HST', taux: 13 }], NB: [{ nom: 'HST', taux: 15 }], NS: [{ nom: 'HST', taux: 15 }], PE: [{ nom: 'HST', taux: 15 }], NL: [{ nom: 'HST', taux: 15 }], AB: [{ nom: 'TPS', taux: 5 }], BC: [{ nom: 'TPS', taux: 5 }, { nom: 'TVP', taux: 7 }], MB: [{ nom: 'TPS', taux: 5 }, { nom: 'TVD', taux: 7 }], SK: [{ nom: 'TPS', taux: 5 }, { nom: 'TVP', taux: 6 }], AUCUNE: [] };
  var PROVINCES = [['QC', 'Québec (TPS + TVQ)'], ['ON', 'Ontario (HST 13 %)'], ['NB', 'Nouveau-Brunswick (HST 15 %)'], ['NS', 'Nouvelle-Écosse (HST 15 %)'], ['PE', 'Î.-P.-É. (HST 15 %)'], ['NL', 'Terre-Neuve (HST 15 %)'], ['AB', 'Alberta (TPS)'], ['BC', 'Colombie-Britannique (TPS + TVP)'], ['MB', 'Manitoba (TPS + TVD)'], ['SK', 'Saskatchewan (TPS + TVP)'], ['AUCUNE', 'Aucune taxe (exportation)']];
  var PROVINCE_CIE_DEFAUT = { STM: 'QC', VW: 'QC', HYUNDAI: 'QC', BMW: 'QC', HAWKS: 'ON' };
  var MODES = { Fleet: 'Flotte', Retail: 'Détail' };
  var reglages = { taxes: TAXES_DEFAUT, provinces: PROVINCE_CIE_DEFAUT, voitInvoice: false, peutEcrire: false };

  function nombre(v) { if (v === null || v === undefined || v === '') return null; if (typeof v === 'number') return isNaN(v) ? null : v; var n = parseFloat(String(v).replace(/\s/g, '').replace(/[^0-9.,\-]/g, '').replace(',', '.')); return isNaN(n) ? null : n; }
  function num0(v) { var n = nombre(v); return n === null ? 0 : n; }
  function fmt(n, dec) { n = nombre(n); return n === null ? '—' : AMX.fmtArgent(n, dec === undefined ? 0 : dec); }
  function fmt2(n) { return fmt(n, 2); }
  function arrondi(n) { return Math.round(n * 100) / 100; }
  function nomCie(code) { return AMX.COMPAGNIES_TOUTES[code] || code || 'Sans concession'; }
  function couleurCie(code) { return (AMX.COULEUR_COMPAGNIE && AMX.COULEUR_COMPAGNIE[code]) || 'gris'; }
  function badgeStatut(s) { var d = STATUTS[s] || STATUTS.brouillon; return h('span.badge.sans-point.' + d[1], { text: d[0] }); }
  function badgeOption(s) { var d = STATUT_OPTION[s] || STATUT_OPTION.unselected; return h('span.badge.sans-point.' + d[1], { text: d[0] }); }
  function optionChoisie(o) { return /^(selected|included|required|upgraded)$/.test(String(o.statut || '')); }
  function vehiculeCourt(s) { return [s.annee, s.marque, s.modele].filter(Boolean).join(' ') + (s.style ? ' · ' + s.style : ''); }
  function modeTexte(s) { return MODES[s.mode] || s.mode || ''; }
  function peutEcrire() { return reglages.peutEcrire || AMX.perm('ficheAchat') || AMX.perm('changerStatut') || AMX.estAdmin(); }
  function voitInvoice() { return !!reglages.voitInvoice; }
  function provinceDefaut(s) { return (reglages.provinces && reglages.provinces[s.compagnie]) || PROVINCE_CIE_DEFAUT[s.compagnie] || 'QC'; }
  function feuilleDefaut(s) { return { province: provinceDefaut(s), exempt: false, rabais: '', echange: '', soldeEchange: '', echangeTexte: '', lignes: [], commentaire: '', validite: '30 jours', vendeur: AMX.session.nom || '' }; }

  /** Les mêmes calculs que Soumission.gs (SOUM_calculer_) : sous-totaux client / interne, taxes, profit. */
  function calculer(s, f) {
    f = f || {};
    var lignes = Array.isArray(f.lignes) ? f.lignes : [];
    var somme = function (cote) { return lignes.reduce(function (acc, l) { var c = String(l.cote || 'deux'); return acc + ((c === 'deux' || c === cote) ? num0(l.montant) : 0); }, 0); };
    var pdsf = num0(s.pdsfBase) + num0(s.pdsfDest) + num0(s.pdsfOptions) + num0(s.pdsfTaxe) + num0(s.pdsfAjust);
    var inv = num0(s.invBase) + num0(s.invDest) + num0(s.invOptions) + num0(s.invTaxe) + num0(s.invAjust);
    var sousClient = pdsf + somme('client'), sousInterne = inv + somme('interne');
    var rabais = num0(f.rabais), echange = num0(f.echange), solde = num0(f.soldeEchange);
    var taxable = Math.max(0, sousClient - rabais - echange);
    var taux = Array.isArray(f.taxes) ? f.taxes : ((reglages.taxes || TAXES_DEFAUT)[f.province] || []);
    var taxes = f.exempt ? [] : taux.map(function (t) { return { nom: t.nom, taux: num0(t.taux), montant: Math.round(taxable * num0(t.taux)) / 100 }; });
    var totalTaxes = taxes.reduce(function (acc, t) { return acc + t.montant; }, 0);
    var total = arrondi(taxable + totalTaxes + solde);
    var profit = arrondi(sousClient - rabais - sousInterne);
    return { pdsf: pdsf, invoice: inv, sousClient: sousClient, sousInterne: sousInterne, rabais: rabais, echange: echange, soldeEchange: solde, taxable: taxable, taxes: taxes, totalTaxes: totalTaxes, total: total, profit: profit, profitPct: sousInterne ? Math.round(profit / sousInterne * 10000) / 100 : null, invoiceConnu: !!(s.invBase !== '' && s.invBase !== null && s.invBase !== undefined) };
  }

  function injecterCss() {
    if (document.getElementById('css-soumission')) return;
    var s = document.createElement('style');
    s.id = 'css-soumission';
    s.textContent = [
      '.so-page .carte { margin-bottom: 12px; }',
      '.so-etapes { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; } .so-etapes .section-titre { margin-bottom: 4px; } .so-etapes p { margin: 0 0 8px; color: var(--encre-2); font-size: 12.5px; }',
      '.so-outils { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; } .so-outils .recherche { display: flex; align-items: center; gap: 6px; flex: 1 1 220px; } .so-outils .recherche svg { width: 16px; height: 16px; color: var(--encre-3); } .so-outils .recherche input { flex: 1; } .so-outils .compte { margin-left: auto; font-size: 12px; }',
      '.so-table { overflow-x: auto; } .so-table .tableau { min-width: 900px; } .so-table td, .so-table th { padding: 7px 10px; vertical-align: middle; } .so-table td.num { white-space: nowrap; font-variant-numeric: tabular-nums; } .so-table td.vehicule .nom { font-weight: 600; } .so-table td.vehicule .sous { font-size: 11.5px; color: var(--encre-3); margin-top: 2px; } .so-table td.fort { font-weight: 700; } .so-table td.pos { color: var(--vert); } .so-table td.neg { color: var(--rouge); } .so-table td.coche { width: 28px; } .so-table .par { font-size: 11px; color: var(--encre-4); }',
      '.so-entete .sous { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 6px; color: var(--encre-3); font-size: 12.5px; } .so-entete input.titre { font-size: 20px; font-weight: 600; letter-spacing: -0.01em; border: 1px solid transparent; background: transparent; padding: 2px 6px; margin-left: -6px; border-radius: 6px; width: 100%; max-width: 700px; } .so-entete input.titre:hover, .so-entete input.titre:focus { border-color: var(--ligne-forte); background: #fff; outline: none; }',
      '.so-kpis .kpi.neutre { cursor: default; } .so-kpis .kpi .valeur.pos { color: var(--vert); } .so-kpis .kpi .valeur.neg { color: var(--rouge); }',
      '.so-feuille { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 14px; align-items: start; }',
      '.so-col h3 { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--encre-3); display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; border-bottom: 1px solid var(--ligne); background: var(--carte-2); border-radius: var(--rayon) var(--rayon) 0 0; } .so-col h3 .badge { text-transform: none; letter-spacing: 0; }',
      '.so-lignes { display: flex; flex-direction: column; } .so-l { display: grid; grid-template-columns: minmax(0, 1fr) 150px; gap: 8px; align-items: center; padding: 7px 14px; border-bottom: 1px solid var(--ligne); font-size: 12.5px; } .so-l:last-child { border-bottom: none; } .so-l .lib { min-width: 0; overflow-wrap: anywhere; } .so-l .lib .m { font-size: 11px; color: var(--encre-4); } .so-l .v { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; } .so-l.sous { background: var(--carte-2); font-weight: 600; } .so-l.total { background: var(--noir-2); color: #fff; font-weight: 700; font-size: 14px; } .so-l.total .lib .m { color: #9AA6B2; } .so-l.moins .v { color: var(--rouge); } .so-l.profit .v.pos { color: var(--vert); } .so-l.profit .v.neg { color: var(--rouge); } .so-l.faible { color: var(--encre-3); }',
      '.so-l input.saisie, .so-l select.saisie { height: 30px; text-align: right; font-variant-numeric: tabular-nums; } .so-l select.saisie { text-align: left; } .so-l .lib input.saisie { text-align: left; }',
      '.so-ajouts { padding: 10px 14px; border-top: 1px dashed var(--ligne); } .so-ajouts .ajout { display: grid; grid-template-columns: minmax(0, 1fr) 110px 120px 30px; gap: 6px; align-items: center; margin-bottom: 6px; } .so-ajouts .ajout input.saisie, .so-ajouts .ajout select.saisie { height: 30px; } .so-ajouts .ajout .suppr { width: 28px; height: 28px; border: none; background: transparent; color: var(--encre-3); border-radius: 6px; display: grid; place-items: center; } .so-ajouts .ajout .suppr:hover { background: var(--rouge-bg); color: var(--rouge); } .so-ajouts .ajout .suppr svg { width: 14px; height: 14px; }',
      '.so-taxes { padding: 8px 14px; border-top: 1px dashed var(--ligne); display: flex; gap: 10px; align-items: center; flex-wrap: wrap; font-size: 12.5px; } .so-taxes select.saisie { width: auto; height: 30px; }',
      '.so-client .grille { margin-top: 4px; }',
      '.so-opts-outils { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; } .so-opts-outils .recherche { flex: 1 1 200px; display: flex; align-items: center; gap: 6px; } .so-opts-outils .recherche svg { width: 15px; height: 15px; color: var(--encre-3); } .so-opts-outils .recherche input { flex: 1; } .so-opts-outils .compte { margin-left: auto; font-size: 12px; color: var(--encre-3); }',
      '.so-options table { width: 100%; border-collapse: collapse; font-size: 12.5px; } .so-options th { text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--encre-3); padding: 6px 8px; border-bottom: 1px solid var(--ligne); white-space: nowrap; } .so-options td { padding: 6px 8px; border-bottom: 1px solid var(--ligne); vertical-align: top; } .so-options tr.cat td { background: var(--carte-2); font-weight: 700; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--encre-2); } .so-options td.code { font-family: var(--mono); font-size: 12px; white-space: nowrap; } .so-options td.num, .so-options th.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; } .so-options tr.choisie td.desc { font-weight: 600; } .so-options tr.exclue td { color: var(--encre-4); } .so-options td.desc .inc { display: block; font-size: 11.5px; color: var(--encre-3); font-weight: 400; }',
      '.so-equip { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; } .so-equip .groupe h4 { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--encre-3); margin: 0 0 6px; padding-bottom: 4px; border-bottom: 1px solid var(--ligne); } .so-equip ul { margin: 0; padding: 0; list-style: none; font-size: 12.5px; } .so-equip li { padding: 3px 0; border-bottom: 1px dotted var(--ligne); } .so-equip li.change { font-weight: 600; } .so-equip li.change::after { content: " ★"; color: var(--ambre); font-size: 10px; }',
      '.so-specs { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; } .so-specs dl { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 3px 10px; margin: 0; font-size: 12.5px; } .so-specs dt { color: var(--encre-3); overflow-wrap: anywhere; } .so-specs dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; } .so-specs h4 { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--encre-3); margin: 0 0 6px; padding-bottom: 4px; border-bottom: 1px solid var(--ligne); } .so-specs h5 { font-size: 12px; margin: 10px 0 4px; color: var(--encre-2); }',
      '.so-comp { overflow-x: auto; } .so-comp table { border-collapse: collapse; width: 100%; font-size: 12.5px; } .so-comp th, .so-comp td { padding: 7px 10px; border-bottom: 1px solid var(--ligne); text-align: left; vertical-align: top; } .so-comp th { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--encre-3); } .so-comp th.col { font-size: 12.5px; text-transform: none; letter-spacing: 0; color: var(--encre); font-weight: 700; min-width: 180px; } .so-comp td.lib { color: var(--encre-3); white-space: nowrap; } .so-comp td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; } .so-comp tr.diff td { background: #FFFBEB; } .so-comp tr.sec td { background: var(--carte-2); font-weight: 700; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; } .so-comp td.meilleur { color: var(--vert); font-weight: 700; } .so-comp .colonnes-choix { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }',
      '.so-vide-fiche { padding: 30px; text-align: center; color: var(--encre-3); }',
      '.so-batir { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 14px; align-items: start; } .so-batir .colonne-droite { position: sticky; top: 70px; } .so-choix { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; } .so-choix label { display: block; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--encre-3); margin-bottom: 4px; } .so-choix select.saisie { width: 100%; }',
      '.so-style-info { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 10px; font-size: 12.5px; color: var(--encre-2); } .so-style-info b { color: var(--encre); }',
      '.so-batir-opts tr.choix td.coche { width: 30px; } .so-batir-opts tr.choix input { width: 16px; height: 16px; } .so-batir-opts tr.choix.off td { color: var(--encre-4); } .so-batir-opts tr.choix.on td.desc { font-weight: 600; } .so-batir-opts tr.cat td .unique { font-weight: 400; text-transform: none; letter-spacing: 0; color: var(--encre-3); margin-left: 8px; }',
      '.so-recap .so-l { padding: 7px 12px; } .so-recap .champ { padding: 8px 12px; border-top: 1px dashed var(--ligne); } .so-recap .champ label { display: block; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--encre-3); margin-bottom: 4px; } .so-recap .champ input.saisie, .so-recap .champ select.saisie { width: 100%; height: 32px; } .so-recap .actions { padding: 12px; display: flex; flex-direction: column; gap: 8px; } .so-recap .actions .btn { justify-content: center; }',
      '.so-cat-table .tableau td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; } .so-cat-table tr.marque td { background: var(--carte-2); font-weight: 700; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; } .so-cat-table td .sous { font-size: 11.5px; color: var(--encre-3); }',
      '@media (max-width: 960px) { .so-batir { grid-template-columns: 1fr; } .so-batir .colonne-droite { position: static; } }',
      '@media (max-width: 720px) { .so-l { grid-template-columns: minmax(0, 1fr) 120px; } .so-ajouts .ajout { grid-template-columns: minmax(0, 1fr) 90px 100px 28px; } }'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ------------------------------ Données ------------------------------ */
  var cache = { liste: null, le: 0, promesse: null, fiches: {} };
  var DUREE_CACHE_MS = 3 * 60000;
  // Un script déployé sans les routes des soumissions répond comme l'ancien traitement d'inventaire ({ ok, vehicules }) :
  // on le dit clairement plutôt que d'afficher « Aucune soumission » (leçon du 21 oct. : RoutesAjout.gs écrasé par un onglet périmé).
  var SCRIPT_PAS_A_JOUR = 'Le script n\'est pas à jour : redéployez-le avec Soumission.gs et RoutesAjout.gs (version du 21 octobre).';
  function verifierScript(d) { if (d && d.ok && !d.soumission && !d.id && Array.isArray(d.vehicules)) throw new Error(SCRIPT_PAS_A_JOUR); }
  AMX.soumission = {
    charger: function (force) {
      if (!force && cache.liste && Date.now() - cache.le < DUREE_CACHE_MS) return Promise.resolve(cache.liste);
      if (cache.promesse) return cache.promesse;
      cache.promesse = AMX.get({ soumissions: 1 }, { secours: false, copie: 'soumissions' }).then(function (d) {
        cache.promesse = null;
        if (!d || d.refuse) { var e = new Error((d && (d.erreur || d.message)) || 'Accès refusé.'); e.refuse = true; throw e; }
        if (!d.ok) throw new Error((d && (d.erreur || d.message)) || 'Réponse inattendue du serveur');
        // Un script déployé sans Soumission.gs / RoutesAjout.gs renvoie l'inventaire ({ ok, vehicules }) au lieu de la liste.
        if (!Array.isArray(d.soumissions)) throw new Error(SCRIPT_PAS_A_JOUR);
        cache.liste = d.soumissions; cache.le = Date.now(); cache.duCache = false;
        reglages.voitInvoice = !!d.voitInvoice; reglages.peutEcrire = !!d.peutEcrire;
        if (d.taxes) reglages.taxes = d.taxes; if (d.provinces) reglages.provinces = d.provinces;
        try { document.dispatchEvent(new CustomEvent('amx:soumissions')); } catch (e) {}
        return cache.liste;
      }, function (e) { cache.promesse = null; throw e; });
      return cache.promesse;
    },
    copie: function () {
      if (cache.liste) return Promise.resolve(cache.liste);
      return AMX.cacheLocal.lireGz('soumissions', 7 * 86400000).then(function (o) {
        if (!o || !o.donnees || !Array.isArray(o.donnees.soumissions) || cache.liste) return cache.liste || null;
        cache.liste = o.donnees.soumissions; cache.le = 0; cache.duCache = true;
        reglages.voitInvoice = !!o.donnees.voitInvoice; reglages.peutEcrire = !!o.donnees.peutEcrire;
        return cache.liste;
      }).catch(function () { return null; });
    },
    enCache: function () { return cache.liste; },
    vider: function () { cache.liste = null; cache.le = 0; cache.fiches = {}; AMX.cacheLocal.oublier('soumissions'); },
    une: function (id, force) {
      id = String(id || '').toUpperCase();
      if (!force && cache.fiches[id] && Date.now() - cache.fiches[id].le < DUREE_CACHE_MS) return Promise.resolve(cache.fiches[id].donnees);
      return AMX.get({ soumission: 1, id: id }, { secours: false }).then(function (d) {
        if (!d || d.refuse) { var e = new Error((d && (d.erreur || d.message)) || 'Accès refusé.'); e.refuse = true; throw e; }
        if (!d.ok) throw new Error((d && (d.erreur || d.message)) || 'Soumission introuvable.');
        if (!d.soumission) throw new Error(SCRIPT_PAS_A_JOUR);
        reglages.voitInvoice = !!d.voitInvoice; reglages.peutEcrire = !!d.peutEcrire;
        if (d.taxes) reglages.taxes = d.taxes; if (d.provinces) reglages.provinces = d.provinces;
        cache.fiches[id] = { donnees: d, le: Date.now() };
        return d;
      });
    },
    enregistrer: function (corps) {
      return AMX.post(Object.assign({ action: 'soumissionEnregistrer' }, corps), { rejouer: true }).then(function (d) {
        AMX.verifier(d, 'Soumission non enregistrée'); verifierScript(d);
        var s = d.soumission; if (s) { poserDansListe(s); if (cache.fiches[s.id]) cache.fiches[s.id].donnees.soumission = s; }
        return d;
      });
    },
    dupliquer: function (id) { return AMX.post({ action: 'soumissionDupliquer', id: id }).then(function (d) { AMX.verifier(d, 'Copie impossible'); verifierScript(d); if (d.soumission) poserDansListe(d.soumission); return d; }); },
    supprimer: function (id) { return AMX.post({ action: 'soumissionSupprimer', id: id }, { rejouer: true }).then(function (d) { AMX.verifier(d, 'Suppression impossible'); verifierScript(d); if (cache.liste) cache.liste = cache.liste.filter(function (s) { return s.id !== id; }); delete cache.fiches[String(id).toUpperCase()]; return d; }); },
    // Nombre de soumissions ouvertes (brouillon, envoyée) de la concession choisie — compteur de l'onglet.
    compteur: function () { var l = cache.liste; if (!l) return ''; var c = AMX.compagnieChoisie('inventaire'); return l.filter(function (s) { return (!c || s.compagnie === c) && (s.statut === 'brouillon' || s.statut === 'envoyee'); }).length; },
    calculer: calculer, STATUTS: STATUTS, TAXES: TAXES_DEFAUT,
    monter: function (conteneur, ctx) { return new VueSoumissions(conteneur, ctx); },
    signet: function () { return CODE_SIGNET_AUTOBOOK; },
    signetCatalogue: function () { return CODE_SIGNET_AUTOBOOK_CATALOGUE; }
  };
  /* Catalogue copié d'AutoBook (Catalogue.gs) : styles (liste légère), un style avec son détail, bâtir, retirer. */
  var catalogue = { liste: null, le: 0, promesse: null, styles: {}, reglages: {} };
  AMX.catalogue = {
    charger: function (force) {
      if (!force && catalogue.liste && Date.now() - catalogue.le < DUREE_CACHE_MS) return Promise.resolve(catalogue.liste);
      if (catalogue.promesse) return catalogue.promesse;
      catalogue.promesse = AMX.get({ catalogue: 1 }, { secours: false, copie: 'catalogue' }).then(function (d) {
        catalogue.promesse = null;
        if (!d || d.refuse) { var e = new Error((d && (d.erreur || d.message)) || 'Accès refusé.'); e.refuse = true; throw e; }
        if (!d.ok) throw new Error((d && (d.erreur || d.message)) || 'Réponse inattendue du serveur');
        if (!Array.isArray(d.styles)) throw new Error(SCRIPT_PAS_A_JOUR);
        catalogue.liste = d.styles; catalogue.le = Date.now();
        catalogue.reglages = { voitInvoice: !!d.voitInvoice, peutEcrire: !!d.peutEcrire, peutSupprimer: !!d.peutSupprimer, marques: d.marques || {}, annees: d.annees || {} };
        reglages.voitInvoice = !!d.voitInvoice;
        return catalogue.liste;
      }, function (e) { catalogue.promesse = null; throw e; });
      return catalogue.promesse;
    },
    enCache: function () { return catalogue.liste; },
    reglages: function () { return catalogue.reglages; },
    vider: function () { catalogue.liste = null; catalogue.le = 0; catalogue.styles = {}; AMX.cacheLocal.oublier('catalogue'); },
    style: function (id, force) {
      id = String(id || '').toUpperCase();
      if (!force && catalogue.styles[id] && Date.now() - catalogue.styles[id].le < 10 * 60000) return Promise.resolve(catalogue.styles[id].donnees);
      return AMX.get({ catalogueStyle: id }, { secours: false }).then(function (d) {
        if (!d || d.refuse) { var e = new Error((d && (d.erreur || d.message)) || 'Accès refusé.'); e.refuse = true; throw e; }
        if (!d.ok) throw new Error((d && (d.erreur || d.message)) || 'Style introuvable.');
        if (!d.style) throw new Error(SCRIPT_PAS_A_JOUR);
        catalogue.styles[id] = { donnees: d, le: Date.now() };
        return d;
      });
    },
    batir: function (corps) {
      return AMX.post(Object.assign({ action: 'soumissionBatir' }, corps)).then(function (d) {
        AMX.verifier(d, 'Soumission non créée'); verifierScript(d);
        if (!d.id) throw new Error(SCRIPT_PAS_A_JOUR);
        cache.liste = null; cache.le = 0;
        return d;
      });
    },
    supprimer: function (id) {
      return AMX.post({ action: 'catalogueSupprimer', id: id }, { rejouer: true }).then(function (d) {
        AMX.verifier(d, 'Retrait impossible'); verifierScript(d);
        if (catalogue.liste) catalogue.liste = catalogue.liste.filter(function (s) { return s.id !== id; });
        delete catalogue.styles[String(id).toUpperCase()];
        return d;
      });
    }
  };
  function poserDansListe(s) {
    if (!cache.liste) return;
    var i = -1; cache.liste.forEach(function (x, k) { if (x.id === s.id) i = k; });
    if (i >= 0) cache.liste[i] = s; else cache.liste.unshift(s);
  }

  /* ------------------------------ La vue ------------------------------- */
  function VueSoumissions(conteneur, ctx) {
    injecterCss();
    this.conteneur = conteneur; this.generation = 0;
    this.liste = null; this.erreur = ''; this.refus = '';
    this.compagnie = AMX.compagnieChoisie('inventaire');
    this.recherche = ''; this.filtreStatut = AMX.memo.lire('so_statut', 'ouvertes');
    this.coches = {};
    this.mode = 'liste'; this.fiche = null;
    this.el = h('div.page.so-page');
    conteneur.appendChild(this.el);
    var moi = this;
    this.surProfil = function () { moi.compagnie = AMX.compagnieChoisie('inventaire'); if (moi.mode === 'liste') moi.rendreListe(); };
    this.surCompagnie = function (e) { moi.compagnie = (e.detail && e.detail.compagnie) || ''; if (moi.mode === 'liste') moi.rendreListe(); };
    document.addEventListener('amx:profil', this.surProfil);
    document.addEventListener('amx:compagnie', this.surCompagnie);
    this.naviguer(ctx || {});
  }
  VueSoumissions.prototype.demonter = function () { this.generation++; document.removeEventListener('amx:profil', this.surProfil); document.removeEventListener('amx:compagnie', this.surCompagnie); };
  VueSoumissions.prototype.naviguer = function (ctx) {
    var p = (ctx && ctx.params) || {};
    if (p.id) { this.ouvrirFiche(String(p.id).toUpperCase(), p.onglet); return; }
    if (p.comparer) { this.comparer(String(p.comparer).split(',').map(function (x) { return x.trim().toUpperCase(); }).filter(Boolean)); return; }
    if (p.batir) { this.montrerBatir(p); return; }
    if (p.catalogue) { this.montrerCatalogue(); return; }
    this.montrerListe(!!p.nouvelle);
  };

  /* ----------------------------- Liste ------------------------------ */
  VueSoumissions.prototype.montrerListe = function (ouvrirImport) {
    var self = this;
    this.mode = 'liste'; this.fiche = null;
    AMX.vider(this.el);
    this.elEtat = h('p', { text: 'Chargement des soumissions…' });
    this.btnRafraichir = h('button.btn', { type: 'button', html: I.rafraichir + '<span>Rafraîchir</span>', onclick: function () { self.charger(true); } });
    this.btnExport = h('button.btn', { type: 'button', html: I.telecharger + '<span>Exporter Excel</span>', onclick: function () { self.exporter(); } });
    this.btnComparer = h('button.btn', { type: 'button', text: 'Comparer', onclick: function () { var ids = Object.keys(self.coches).filter(function (k) { return self.coches[k]; }); if (ids.length < 2) { AMX.toast('Cochez 2 à 4 soumissions à comparer.', 'attention'); return; } AMX.aller('inventaire', 'soumissions', { comparer: ids.slice(0, 4).join(',') }); } });
    this.btnNouvelle = h('button.btn', { type: 'button', text: 'Nouvelle depuis AutoBook', onclick: function () { self.elImport.open = !self.elImport.open; if (self.elImport.open) self.elImport.scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
    this.btnCatalogue = h('a.btn', { href: AMX.lien('inventaire', 'soumissions', { catalogue: 1 }), text: 'Catalogue' });
    this.btnBatir = h('a.btn.primaire', { href: AMX.lien('inventaire', 'soumissions', { batir: 1 }), text: 'Bâtir un véhicule' });
    var entete = h('div.entete-page', [
      h('div', { style: { minWidth: 0 } }, [h('h1', 'Soumissions'), this.elEtat]),
      h('div.actions', [this.btnRafraichir, this.btnExport, this.btnComparer, this.btnNouvelle, this.btnCatalogue, this.btnBatir])
    ]);
    this.elImport = this.construireImport();
    if (ouvrirImport) this.elImport.open = true;
    this.elCies = h('div.barre-cies');
    this.elRecherche = h('input.saisie#so-recherche', { type: 'search', placeholder: 'Véhicule, client, code style, titre…', autocomplete: 'off', oninput: AMX.debounce(function (e) { self.recherche = e.target.value; self.rendreTable(); }, 120) });
    this.elSegment = h('div.segment', { role: 'group', 'aria-label': 'Statut' });
    this.elCompte = h('span.compte.doux');
    var barre = h('div.carte', [h('div.carte-corps', [h('div.so-outils', [h('div.recherche', [h('span', { html: I.recherche }), this.elRecherche]), this.elSegment, this.elCompte])])]);
    this.elTable = h('div.so-table');
    this.elVide = h('div');
    this.el.appendChild(entete); this.el.appendChild(this.elImport); this.el.appendChild(this.elCies); this.el.appendChild(barre); this.el.appendChild(this.elVide); this.el.appendChild(h('div.carte', [h('div.carte-corps', [this.elTable])]));
    this.liste = AMX.soumission.enCache();
    this.rendreListe();
    AMX.soumission.copie().then(function (l) { if (self.mode === 'liste' && l && !self.liste) { self.liste = l; self.duCache = true; self.rendreListe(); } });
    this.charger();
  };
  VueSoumissions.prototype.construireImport = function () {
    var signet = h('a.btn.primaire', { href: CODE_SIGNET_AUTOBOOK, text: 'Automax ← AutoBook', title: 'Glissez ce bouton dans votre barre de favoris', draggable: 'true' });
    signet.addEventListener('click', function (e) { e.preventDefault(); AMX.toast('Glissez ce bouton dans la barre de favoris de Chrome (Cmd+Shift+B pour l\'afficher), puis cliquez-le depuis AutoBook, sur le véhicule bâti.', 'attention', 8000); });
    var d = h('details.carte#so-import', [
      h('summary.carte-entete', { style: { cursor: 'pointer' } }, [h('h2', 'Nouvelle soumission depuis GM AutoBook PRO')]),
      h('div.carte-corps', [
        h('p', { style: { margin: '0 0 12px', color: 'var(--encre-2)' } }, 'AutoBook reste l\'outil pour bâtir le véhicule (toutes les marques, prix à jour). Le favori lit le véhicule que vous venez de bâtir — style, options choisies et leurs prix (PDSF et Invoice), équipement de série, fiche technique — et le dépose ici, où se fait la soumission : rabais, échange, taxes, profit, PDF client, comparaison. Un véhicule à la fois ; rien n\'est modifié dans AutoBook.'),
        h('div.so-etapes', [
          h('div', [h('div.section-titre', '1. Installer (une fois)'), h('p', 'Glissez ce bouton dans la barre de favoris de Chrome. Si la barre est cachée : Cmd+Shift+B.'), signet]),
          h('div', [h('div.section-titre', '2. Dans AutoBook'), h('p', ['Connectez-vous sur ', h('a', { href: URL_AUTOBOOK, target: '_blank', rel: 'noopener', text: 'carbookpro.carbook.com' }), ', « Build Vehicle » : année, marque, modèle, style, puis cochez les options. Gardez cet onglet du site ouvert et connecté.'])]),
          h('div', [h('div.section-titre', '3. Cliquer le signet'), h('p', 'Sur l\'onglet « Build A Vehicle » du véhicule. Une bande verte suit la lecture (une dizaine de secondes : options, prix, équipement, specs), puis « Ouvrir dans ScanAutomax ». Recliquer sur le même véhicule met le brouillon à jour.')])
        ])
      ])
    ]);
    d.open = false;
    return d;
  };
  VueSoumissions.prototype.charger = function (manuel) {
    var self = this, gen = ++this.generation;
    if (manuel && this.btnRafraichir) this.btnRafraichir.classList.add('occupe');
    return AMX.soumission.charger(true).then(function (l) {
      if (gen !== self.generation || self.mode !== 'liste') return;
      if (self.btnRafraichir) self.btnRafraichir.classList.remove('occupe');
      self.liste = l; self.duCache = false; self.erreur = ''; self.refus = '';
      self.rendreListe();
      AMX.rafraichirSousBarre();
      if (manuel) AMX.toast('Soumissions mises à jour — ' + l.length, 'ok');
    }).catch(function (e) {
      if (gen !== self.generation || self.mode !== 'liste') return;
      if (self.btnRafraichir) self.btnRafraichir.classList.remove('occupe');
      if (e && e.refuse) { self.refus = AMX.erreurTexte(e); self.rendreListe(); return; }
      self.erreur = AMX.erreurTexte(e); self.rendreListe();
      AMX.toast('Impossible de charger les soumissions — ' + self.erreur, 'erreur');
    });
  };
  VueSoumissions.prototype.filtrees = function () {
    var self = this, l = this.liste || [];
    if (this.compagnie) l = l.filter(function (s) { return String(s.compagnie || '').toUpperCase() === self.compagnie; });
    if (this.filtreStatut === 'ouvertes') l = l.filter(function (s) { return s.statut === 'brouillon' || s.statut === 'envoyee'; });
    else if (this.filtreStatut !== 'toutes') l = l.filter(function (s) { return s.statut === self.filtreStatut; });
    var q = String(this.recherche || '').trim().toLowerCase();
    if (q) l = l.filter(function (s) { return [s.id, s.titre, s.vehicule, s.client, s.codeStyle, s.marque, s.modele, s.annee, s.creePar, s.note].join(' ').toLowerCase().indexOf(q) >= 0; });
    return l;
  };
  VueSoumissions.prototype.rendreListe = function () {
    var self = this;
    if (this.mode !== 'liste') return;
    AMX.vider(this.elCies); AMX.vider(this.elSegment); AMX.vider(this.elVide);
    if (this.refus) { this.elEtat.textContent = this.refus; this.elVide.appendChild(h('div.vide', [h('div', { html: I.cadenas }), h('h3', 'Accès non autorisé'), h('div', { text: this.refus })])); this.elTable.textContent = ''; return; }
    if (!this.liste) { this.elEtat.textContent = this.erreur ? 'Serveur injoignable : ' + this.erreur : 'Chargement des soumissions…'; if (!this.erreur) this.elVide.appendChild(AMX.chargeur('Soumissions')); return; }
    var total = this.liste.length, ouvertes = this.liste.filter(function (s) { return s.statut === 'brouillon' || s.statut === 'envoyee'; }).length;
    this.elEtat.textContent = (total ? (total + ' soumission' + (total > 1 ? 's' : '') + ', ' + ouvertes + ' ouverte' + (ouvertes > 1 ? 's' : '') + ' — véhicules bâtis dans AutoBook, feuille client / interne, PDF, comparaison. Cliquez une ligne.') : 'Aucune soumission pour l\'instant : installez le favori ci-dessous et cliquez-le depuis AutoBook sur un véhicule bâti.') + (this.duCache ? ' (mise à jour en cours…)' : (this.erreur ? ' (liste gardée localement — serveur injoignable)' : ''));
    this.btnNouvelle.style.display = peutEcrire() ? '' : 'none'; this.btnBatir.style.display = peutEcrire() ? '' : 'none';
    AMX.barreConcessions(this.elCies, { domaine: 'inventaire', valeur: this.compagnie, compte: function (c) { return self.liste.filter(function (s) { return !c || s.compagnie === c; }).length; }, onchange: function (c) { self.compagnie = c; self.rendreListe(); } });
    [['ouvertes', 'Ouvertes'], ['acceptee', 'Acceptées'], ['perdue', 'Perdues'], ['toutes', 'Toutes']].forEach(function (p) {
      self.elSegment.appendChild(h('button' + (p[0] === self.filtreStatut ? '.actif' : ''), { type: 'button', text: p[1], onclick: function () { self.filtreStatut = p[0]; AMX.memo.ecrire('so_statut', p[0]); self.rendreListe(); } }));
    });
    this.rendreTable();
  };
  VueSoumissions.prototype.rendreTable = function () {
    var self = this, l = this.filtrees();
    AMX.vider(this.elTable);
    this.elCompte.textContent = l.length + ' soumission' + (l.length > 1 ? 's' : '') + (this.liste && l.length !== this.liste.length ? ' sur ' + this.liste.length : '');
    this.btnComparer.textContent = 'Comparer' + (Object.keys(this.coches).filter(function (k) { return self.coches[k]; }).length ? ' (' + Object.keys(this.coches).filter(function (k) { return self.coches[k]; }).length + ')' : '');
    if (!l.length) { this.elTable.appendChild(h('div.vide', [h('div', { html: I.achat }), h('h3', this.liste && this.liste.length ? 'Rien avec ces filtres' : 'Aucune soumission'), h('div', this.liste && this.liste.length ? 'Changez de concession, de statut ou de recherche.' : 'Le favori « Automax ← AutoBook » (ci-dessus) crée la première.')])); return; }
    var inv = voitInvoice();
    var thead = h('thead', [h('tr', [
      h('th.coche', { title: 'Cocher pour comparer' }), h('th', 'Date'), h('th', 'Véhicule'), h('th', 'Client'), h('th', 'Concession'), h('th', 'Statut'), h('th.num', 'Options'), h('th.num', 'PDSF AutoBook'), h('th.num', 'Prix de vente'),
      inv ? h('th.num', 'Invoice') : null, inv ? h('th.num', 'Profit') : null, h('th', 'Par')
    ])]);
    var tbody = h('tbody');
    l.forEach(function (s) {
      var coche = h('input', { type: 'checkbox', checked: !!self.coches[s.id], onclick: function (e) { e.stopPropagation(); }, onchange: function (e) { self.coches[s.id] = e.target.checked; if (Object.keys(self.coches).filter(function (k) { return self.coches[k]; }).length > 4) { e.target.checked = false; self.coches[s.id] = false; AMX.toast('4 soumissions au plus.', 'attention'); } self.rendreTable(); } });
      var profit = nombre(s.profit);
      var tr = h('tr.cliquable', { onclick: function () { AMX.aller('inventaire', 'soumissions', { id: s.id }); } }, [
        h('td.coche', [coche]),
        h('td.num', { text: AMX.fmtDateCourte(s.majLe || s.creeLe), title: AMX.fmtDate(s.majLe || s.creeLe, true) }),
        h('td.vehicule', [h('div.nom', { text: s.titre || vehiculeCourt(s) }), h('div.sous', { text: [s.id, modeTexte(s), s.codeStyle ? 'style ' + s.codeStyle : '', s.vehicule && s.vehicule !== s.titre ? s.vehicule : ''].filter(Boolean).join(' · ') })]),
        h('td', { text: s.client || '—' }),
        h('td', [s.compagnie ? h('span.badge.sans-point.' + couleurCie(s.compagnie), { text: nomCie(s.compagnie) }) : h('span.doux', '—')]),
        h('td', [badgeStatut(s.statut)]),
        h('td.num', { text: nombre(s.nbOptions) === null ? '—' : String(s.nbOptions) }),
        h('td.num', { text: fmt(s.pdsfTotal) }),
        h('td.num.fort', { text: fmt(s.prixVente !== '' && s.prixVente !== null ? s.prixVente : s.pdsfTotal) }),
        inv ? h('td.num', { text: fmt(s.invTotal) }) : null,
        inv ? h('td.num.fort' + (profit === null ? '' : (profit >= 0 ? '.pos' : '.neg')), { text: fmt(s.profit) }) : null,
        h('td', [h('span.par', { text: AMX.initiales(s.creePar), title: s.creePar || '' })])
      ]);
      tbody.appendChild(tr);
    });
    this.elTable.appendChild(h('table.tableau', [thead, tbody]));
  };
  VueSoumissions.prototype.exporter = function () {
    var l = this.filtrees(), inv = voitInvoice();
    if (!l.length) { AMX.toast('Rien à exporter.', 'attention'); return; }
    if (typeof XLSX === 'undefined') { AMX.toast('Export indisponible (SheetJS non chargé).', 'erreur'); return; }
    var lignes = l.map(function (s) {
      var o = { Id: s.id, Date: AMX.fmtDate(s.majLe || s.creeLe), Titre: s.titre, Véhicule: s.vehicule, Mode: modeTexte(s), 'Année': s.annee, Marque: s.marque, 'Modèle': s.modele, 'Code style': s.codeStyle, Style: s.style, Client: s.client, Courriel: s.clientCourriel, 'Téléphone': s.clientTel, Concession: nomCie(s.compagnie), Statut: (STATUTS[s.statut] || ['?'])[0], Options: s.nbOptions, 'PDSF base': s.pdsfBase, 'PDSF transport': s.pdsfDest, 'PDSF options': s.pdsfOptions, 'PDSF total': s.pdsfTotal, 'Prix de vente': s.prixVente, 'Date des prix': s.datePrix, 'Créée par': s.creePar, Note: s.note };
      if (inv) { o['Invoice base'] = s.invBase; o['Invoice options'] = s.invOptions; o['Invoice total'] = s.invTotal; o.Profit = s.profit; }
      return o;
    });
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lignes), 'Soumissions');
    XLSX.writeFile(wb, 'soumissions-' + new Date().toISOString().slice(0, 10) + '.xlsx');
  };

  /* ----------------------------- Fiche ------------------------------ */
  VueSoumissions.prototype.ouvrirFiche = function (id, onglet) {
    var self = this, gen = ++this.generation;
    this.mode = 'fiche'; this.ficheOnglet = onglet || this.ficheOnglet || 'feuille';
    AMX.vider(this.el);
    this.el.appendChild(h('div.entete-page', [h('div', [h('h1', { text: id }), h('p', 'Chargement de la soumission…')]), h('div.actions', [h('a.btn', { href: AMX.lien('inventaire', 'soumissions'), text: '← Soumissions' })])]));
    this.el.appendChild(AMX.chargeur('Soumission ' + id));
    AMX.soumission.une(id).then(function (d) {
      if (gen !== self.generation || self.mode !== 'fiche') return;
      self.fiche = { s: d.soumission, detail: d.detail || { options: [], equipement: [], specs: [] }, feuille: d.soumission.feuille ? Object.assign(feuilleDefaut(d.soumission), d.soumission.feuille) : feuilleDefaut(d.soumission), modifie: false };
      self.rendreFiche();
    }).catch(function (e) {
      if (gen !== self.generation) return;
      AMX.vider(self.el);
      self.el.appendChild(h('div.entete-page', [h('div', [h('h1', { text: id })]), h('div.actions', [h('a.btn', { href: AMX.lien('inventaire', 'soumissions'), text: '← Soumissions' })])]));
      self.el.appendChild(h('div.vide', [h('div', { html: e && e.refuse ? I.cadenas : I.alerte }), h('h3', e && e.refuse ? 'Accès non autorisé' : 'Soumission introuvable'), h('div', { text: AMX.erreurTexte(e) })]));
    });
  };
  VueSoumissions.prototype.rendreFiche = function () {
    var self = this, f = this.fiche, s = f.s, inv = voitInvoice(), ecrit = peutEcrire();
    AMX.vider(this.el);
    var titre = h('input.titre', { type: 'text', value: s.titre || vehiculeCourt(s), disabled: !ecrit, 'aria-label': 'Titre de la soumission', oninput: function () { f.modifie = true; } });
    this.elTitre = titre;
    var sous = h('div.sous', [
      h('span', { text: s.id }), h('span', '·'),
      h('span', { text: s.vehicule || vehiculeCourt(s) }),
      s.mode ? h('span.badge.sans-point.gris', { text: modeTexte(s) }) : null,
      s.codeStyle ? h('span.puce.mono', { text: 'style ' + s.codeStyle }) : null,
      badgeStatut(s.statut),
      s.compagnie ? h('span.badge.sans-point.' + couleurCie(s.compagnie), { text: nomCie(s.compagnie) }) : null,
      h('span.doux', { text: 'AutoBook' + (s.datePrix ? ' · prix du ' + s.datePrix : '') + (s.luLe ? ' · lu ' + AMX.fmtDate(s.luLe, true) : '') + (s.creePar ? ' · par ' + s.creePar : '') })
    ]);
    this.btnEnregistrer = h('button.btn.primaire', { type: 'button', text: 'Enregistrer', onclick: function () { self.enregistrerFiche(); } });
    var actions = h('div.actions', [
      h('a.btn', { href: AMX.lien('inventaire', 'soumissions'), text: '← Soumissions' }),
      h('button.btn', { type: 'button', html: I.imprimer + '<span>PDF client</span>', title: 'Impression sans les prix Invoice', onclick: function () { self.imprimer('client'); } }),
      inv ? h('button.btn', { type: 'button', html: I.imprimer + '<span>PDF interne</span>', title: 'Avec Invoice et profit', onclick: function () { self.imprimer('interne'); } }) : null,
      ecrit ? h('button.btn', { type: 'button', html: I.copier + '<span>Dupliquer</span>', onclick: function () { self.dupliquerFiche(); } }) : null,
      ecrit ? h('button.btn.danger', { type: 'button', html: I.corbeille, title: 'Supprimer', 'aria-label': 'Supprimer', onclick: function () { self.supprimerFiche(); } }) : null,
      ecrit ? this.btnEnregistrer : null
    ]);
    this.el.appendChild(h('div.entete-page.so-entete', [h('div', { style: { minWidth: 0 } }, [titre, sous]), actions]));
    this.elKpis = h('div.kpis.so-kpis');
    this.el.appendChild(this.elKpis);
    this.elOnglets = h('div.onglets');
    this.elCorps = h('div');
    this.el.appendChild(this.elOnglets); this.el.appendChild(this.elCorps);
    this.rendreKpis();
    this.rendreOnglets();
  };
  VueSoumissions.prototype.rendreKpis = function () {
    var f = this.fiche, s = f.s, c = calculer(s, f.feuille), inv = voitInvoice();
    AMX.vider(this.elKpis);
    var tuile = function (lib, val, sous, cls) { return h('button.kpi.neutre', { type: 'button' }, [h('div.valeur' + (cls ? '.' + cls : ''), { text: val }), h('div.libelle', { text: lib }), sous ? h('div.sous', { text: sous }) : null]); };
    this.elKpis.appendChild(tuile('PDSF AutoBook', fmt(s.pdsfTotal), 'base ' + fmt(s.pdsfBase) + (num0(s.pdsfOptions) ? ' + options ' + fmt(s.pdsfOptions) : '')));
    this.elKpis.appendChild(tuile('Prix de vente', fmt2(c.total), c.taxes.length ? 'taxes incluses (' + c.taxes.map(function (t) { return t.nom; }).join(' + ') + ')' : (f.feuille.exempt || f.feuille.province === 'AUCUNE' ? 'sans taxes' : 'avant taxes')));
    if (inv) this.elKpis.appendChild(tuile('Invoice AutoBook', fmt(s.invTotal), 'base ' + fmt(s.invBase)));
    if (inv) this.elKpis.appendChild(tuile('Profit', c.invoiceConnu ? fmt(c.profit) : '—', c.profitPct !== null && c.invoiceConnu ? c.profitPct.toLocaleString('fr-CA') + ' % de l\'Invoice' : 'Invoice inconnu', c.invoiceConnu ? (c.profit >= 0 ? 'pos' : 'neg') : ''));
    this.elKpis.appendChild(tuile('Options choisies', String(num0(s.nbOptions)), (f.detail.options || []).length + ' options lues'));
    this.elKpis.appendChild(tuile('Statut', (STATUTS[s.statut] || ['?'])[0], s.client || 'sans client'));
  };
  VueSoumissions.prototype.rendreOnglets = function () {
    var self = this, f = this.fiche;
    AMX.vider(this.elOnglets);
    var nOpt = (f.detail.options || []).filter(optionChoisie).length, nEq = (f.detail.equipement || []).reduce(function (a, c) { return a + c.items.length; }, 0), nSp = (f.detail.specs || []).reduce(function (a, g) { return a + g.sections.reduce(function (b, x) { return b + x.lignes.length; }, 0); }, 0);
    [['feuille', 'Feuille de soumission'], ['options', 'Options (' + nOpt + ')'], ['equipement', 'Équipement de série' + (nEq ? ' (' + nEq + ')' : '')], ['specs', 'Fiche technique' + (nSp ? ' (' + nSp + ')' : '')]].forEach(function (o) {
      self.elOnglets.appendChild(h('button' + (o[0] === self.ficheOnglet ? '.actif' : ''), { type: 'button', text: o[1], onclick: function () { self.ficheOnglet = o[0]; self.rendreOnglets(); } }));
    });
    AMX.vider(this.elCorps);
    if (this.ficheOnglet === 'options') this.elCorps.appendChild(this.rendreOptions());
    else if (this.ficheOnglet === 'equipement') this.elCorps.appendChild(this.rendreEquipement());
    else if (this.ficheOnglet === 'specs') this.elCorps.appendChild(this.rendreSpecs());
    else this.elCorps.appendChild(this.rendreFeuille());
  };

  /* --- Feuille de soumission : client (PDSF) et interne (Invoice) --- */
  VueSoumissions.prototype.rendreFeuille = function () {
    var self = this, f = this.fiche, s = f.s, fe = f.feuille, inv = voitInvoice(), ecrit = peutEcrire();
    var c = calculer(s, fe);
    var ligne = function (lib, val, cls, mini) { return h('div.so-l' + (cls ? '.' + cls : ''), [h('div.lib', [lib, mini ? h('div.m', { text: mini }) : null]), h('div.v', { text: val })]); };
    var champ = function (cle, lib, opts) {
      opts = opts || {};
      var inp = h('input.saisie', { type: 'text', inputmode: 'decimal', value: fe[cle] === '' || fe[cle] === null || fe[cle] === undefined ? '' : String(fe[cle]), placeholder: '0', disabled: !ecrit, oninput: function (e) { fe[cle] = e.target.value === '' ? '' : nombre(e.target.value); f.modifie = true; self.recalculer(); } });
      return h('div.so-l' + (opts.cls ? '.' + opts.cls : ''), [h('div.lib', [lib, opts.mini ? h('div.m', { text: opts.mini }) : null]), inp]);
    };
    var nOpt = num0(s.nbOptions);
    var colClient = h('div.carte.so-col', [
      h('h3', ['Client', h('span.badge.sans-point.gris', { text: 'PDSF' })]),
      h('div.so-lignes', [
        ligne('Prix de base', fmt2(s.pdsfBase), '', s.vehicule || ''),
        ligne('Transport et préparation', fmt2(s.pdsfDest)),
        ligne('Options choisies', fmt2(s.pdsfOptions), '', nOpt + ' option' + (nOpt > 1 ? 's' : '') + ' à code'),
        num0(s.pdsfTaxe) ? ligne('Taxe sur la climatisation', fmt2(s.pdsfTaxe)) : null,
        num0(s.pdsfAjust) ? ligne('Ajustements AutoBook', fmt2(s.pdsfAjust)) : null,
        this.lignesAjoutees('client'),
        ligne('Sous-total', fmt2(c.sousClient), 'sous'),
        champ('rabais', 'Rabais', { cls: 'moins' }),
        champ('echange', 'Échange (valeur accordée)', { cls: 'moins', mini: fe.echangeTexte || '' }),
        ligne('Prix taxable', fmt2(c.taxable), 'sous'),
        c.taxes.length ? c.taxes.map(function (t) { return ligne(t.nom + ' ' + t.taux.toLocaleString('fr-CA') + ' %', fmt2(t.montant), 'faible'); }) : ligne('Taxes', fe.exempt ? 'exempt' : 'aucune', 'faible'),
        num0(fe.soldeEchange) ? champ('soldeEchange', 'Solde dû sur l\'échange') : null,
        ligne('Total', fmt2(c.total), 'total', fe.validite ? 'valide ' + fe.validite : '')
      ]),
      h('div.so-taxes', [
        h('span', 'Taxes :'),
        h('select.saisie', { disabled: !ecrit, onchange: function (e) { fe.province = e.target.value; fe.taxes = undefined; f.modifie = true; self.recalculer(true); } }, PROVINCES.map(function (p) { return h('option', { value: p[0], selected: fe.province === p[0], text: p[1] }); })),
        h('label.case', [h('input', { type: 'checkbox', checked: !!fe.exempt, disabled: !ecrit, onchange: function (e) { fe.exempt = e.target.checked; f.modifie = true; self.recalculer(true); } }), 'Exempt']),
        num0(fe.soldeEchange) ? null : h('button.btn.petit.fantome', { type: 'button', text: '+ solde dû sur l\'échange', disabled: !ecrit, onclick: function () { fe.soldeEchange = 0.01; self.recalculer(true); } })
      ]),
      this.editeurAjouts()
    ]);
    var colInterne = inv ? h('div.carte.so-col', [
      h('h3', ['Interne', h('span.badge.sans-point.ambre', { text: 'Invoice' })]),
      h('div.so-lignes', [
        ligne('Prix de base', fmt2(s.invBase)),
        ligne('Transport et préparation', fmt2(s.invDest)),
        ligne('Options choisies', fmt2(s.invOptions)),
        num0(s.invTaxe) ? ligne('Taxe sur la climatisation', fmt2(s.invTaxe)) : null,
        num0(s.invAjust) ? ligne('Ajustements AutoBook', fmt2(s.invAjust)) : null,
        this.lignesAjoutees('interne'),
        ligne('Coût total', fmt2(c.sousInterne), 'sous'),
        ligne('Prix de vente avant taxes', fmt2(c.sousClient - c.rabais), '', c.rabais ? 'sous-total client − rabais ' + fmt2(c.rabais) : 'sous-total client'),
        h('div.so-l.profit', [h('div.lib', ['Profit brut', h('div.m', { text: c.profitPct !== null && c.invoiceConnu ? c.profitPct.toLocaleString('fr-CA') + ' % de l\'Invoice' : '' })]), h('div.v' + (c.invoiceConnu ? (c.profit >= 0 ? '.pos' : '.neg') : ''), { text: c.invoiceConnu ? fmt2(c.profit) : '—' })]),
        num0(fe.echange) ? ligne('Échange repris', fmt2(fe.echange), 'faible', 'valeur accordée au client — à revendre') : null
      ])
    ]) : h('div.carte.so-col', [h('h3', ['Interne', h('span.badge.sans-point.gris', { text: 'Invoice' })]), h('div.so-vide-fiche', 'Les prix Invoice et le profit ne sont montrés qu\'aux comptes qui modifient les montants, aux gestionnaires et aux administrateurs.')]);
    var client = h('div.carte.so-client', [
      h('div.carte-entete', [h('h2', 'Client et suivi')]),
      h('div.carte-corps', [h('div.grille.c3', [
        this.champTexte('client', 'Client', s.client, 'Nom ou entreprise'),
        this.champTexte('clientCourriel', 'Courriel', s.clientCourriel, 'courriel@exemple.com'),
        this.champTexte('clientTel', 'Téléphone', s.clientTel, '514 555 0123'),
        h('div.champ', [h('label', 'Statut'), h('select.saisie', { disabled: !ecrit, onchange: function (e) { s.statut = e.target.value; f.modifie = true; self.rendreKpis(); } }, STATUTS_ORDRE.map(function (k) { return h('option', { value: k, selected: s.statut === k, text: STATUTS[k][0] }); }))]),
        h('div.champ', [h('label', 'Concession'), h('select.saisie', { disabled: !ecrit || (!AMX.estGroupe() && AMX.codesPour('inventaire').length < 2), onchange: function (e) { s.compagnie = e.target.value; f.modifie = true; if (!fe.provinceChoisie) { fe.province = provinceDefaut(s); } self.recalculer(true); } }, [h('option', { value: '', selected: !s.compagnie, text: 'Sans concession' })].concat(AMX.codesPour('inventaire').map(function (code) { return h('option', { value: code, selected: s.compagnie === code, text: nomCie(code) }); })))]),
        h('div.champ', [h('label', 'Vendeur'), h('input.saisie', { type: 'text', value: fe.vendeur || '', disabled: !ecrit, oninput: function (e) { fe.vendeur = e.target.value; f.modifie = true; } })]),
        h('div.champ', [h('label', 'Validité de la soumission'), h('input.saisie', { type: 'text', value: fe.validite || '', placeholder: '30 jours', disabled: !ecrit, oninput: function (e) { fe.validite = e.target.value; f.modifie = true; } })]),
        h('div.champ', [h('label', 'Échange (description)'), h('input.saisie', { type: 'text', value: fe.echangeTexte || '', placeholder: '2021 Silverado LT, 80 000 km', disabled: !ecrit, oninput: function (e) { fe.echangeTexte = e.target.value; f.modifie = true; } })]),
        h('div.champ.plein', [h('label', 'Commentaire sur la soumission (imprimé pour le client)'), h('textarea.saisie', { rows: '2', disabled: !ecrit, oninput: function (e) { fe.commentaire = e.target.value; f.modifie = true; } }, fe.commentaire || '')]),
        h('div.champ.plein', [h('label', 'Note interne (jamais imprimée pour le client)'), h('textarea.saisie', { rows: '2', disabled: !ecrit, oninput: function (e) { s.note = e.target.value; f.modifie = true; } }, s.note || '')])
      ])])
    ]);
    return h('div', [h('div.so-feuille', [colClient, colInterne]), client]);
  };
  VueSoumissions.prototype.champTexte = function (cle, lib, val, ph) {
    var f = this.fiche, s = f.s;
    return h('div.champ', [h('label', lib), h('input.saisie', { type: cle === 'clientCourriel' ? 'email' : (cle === 'clientTel' ? 'tel' : 'text'), value: val || '', placeholder: ph || '', disabled: !peutEcrire(), oninput: function (e) { s[cle] = e.target.value; f.modifie = true; } })]);
  };
  VueSoumissions.prototype.lignesAjoutees = function (cote) {
    var fe = this.fiche.feuille, lignes = (fe.lignes || []).filter(function (l) { var c = String(l.cote || 'deux'); return c === 'deux' || c === cote; });
    return lignes.map(function (l) { return h('div.so-l', [h('div.lib', [l.libelle || '(sans libellé)', h('div.m', { text: l.cote === 'deux' ? 'client et interne' : (l.cote === 'client' ? 'client seulement' : 'interne seulement') })]), h('div.v', { text: fmt2(l.montant) })]); });
  };
  VueSoumissions.prototype.editeurAjouts = function () {
    var self = this, f = this.fiche, fe = f.feuille, ecrit = peutEcrire();
    if (!ecrit && !(fe.lignes || []).length) return null;
    var liste = h('div');
    var dessiner = function () {
      AMX.vider(liste);
      (fe.lignes || []).forEach(function (l, i) {
        liste.appendChild(h('div.ajout', [
          h('input.saisie', { type: 'text', value: l.libelle || '', placeholder: 'Libellé (accessoire, frais, protection…)', disabled: !ecrit, oninput: function (e) { l.libelle = e.target.value; f.modifie = true; } }),
          h('input.saisie', { type: 'text', inputmode: 'decimal', value: l.montant === '' || l.montant === null || l.montant === undefined ? '' : String(l.montant), placeholder: '0', disabled: !ecrit, oninput: function (e) { l.montant = e.target.value === '' ? '' : nombre(e.target.value); f.modifie = true; self.recalculer(); } }),
          h('select.saisie', { disabled: !ecrit, onchange: function (e) { l.cote = e.target.value; f.modifie = true; self.recalculer(true); } }, [['deux', 'Client + interne'], ['client', 'Client'], ['interne', 'Interne (coût)']].map(function (o) { return h('option', { value: o[0], selected: (l.cote || 'deux') === o[0], text: o[1] }); })),
          ecrit ? h('button.suppr', { type: 'button', html: I.corbeille, title: 'Retirer', onclick: function () { fe.lignes.splice(i, 1); f.modifie = true; self.recalculer(true); } }) : h('span')
        ]));
      });
    };
    dessiner();
    return h('div.so-ajouts', [
      h('div.section-titre', 'Lignes ajoutées'),
      liste,
      ecrit ? h('button.btn.petit', { type: 'button', text: '+ Ajouter une ligne', onclick: function () { fe.lignes = fe.lignes || []; fe.lignes.push({ libelle: '', montant: '', cote: 'deux' }); f.modifie = true; self.recalculer(true); setTimeout(function () { var inputs = self.elCorps.querySelectorAll('.so-ajouts .ajout input'); if (inputs.length) inputs[inputs.length - 2].focus(); }, 30); } }) : null
    ]);
  };
  /** Recalcule les totaux ; `tout` redessine la feuille (une ligne ajoutée ou retirée, province…), sinon seulement les chiffres. */
  VueSoumissions.prototype.recalculer = function (tout) {
    this.rendreKpis();
    if (tout) { this.rendreOnglets(); return; }
    var self = this, f = this.fiche, c = calculer(f.s, f.feuille);
    var maj = function (sel, val) { self.elCorps.querySelectorAll(sel).forEach(function (el) { el.textContent = val; }); };
    var sous = this.elCorps.querySelectorAll('.so-col:first-child .so-l.sous .v');
    if (sous[0]) sous[0].textContent = fmt2(c.sousClient); if (sous[1]) sous[1].textContent = fmt2(c.taxable);
    var total = this.elCorps.querySelector('.so-col:first-child .so-l.total .v'); if (total) total.textContent = fmt2(c.total);
    var faibles = this.elCorps.querySelectorAll('.so-col:first-child .so-l.faible');
    c.taxes.forEach(function (t, i) { if (faibles[i]) faibles[i].querySelector('.v').textContent = fmt2(t.montant); });
    var interne = this.elCorps.querySelectorAll('.so-col:nth-child(2) .so-l.sous .v'); if (interne[0]) interne[0].textContent = fmt2(c.sousInterne);
    var profit = this.elCorps.querySelector('.so-col:nth-child(2) .so-l.profit .v'); if (profit) { profit.textContent = c.invoiceConnu ? fmt2(c.profit) : '—'; profit.classList.toggle('pos', c.invoiceConnu && c.profit >= 0); profit.classList.toggle('neg', c.invoiceConnu && c.profit < 0); var m = this.elCorps.querySelector('.so-col:nth-child(2) .so-l.profit .m'); if (m) m.textContent = c.profitPct !== null && c.invoiceConnu ? c.profitPct.toLocaleString('fr-CA') + ' % de l\'Invoice' : ''; }
    var avant = this.elCorps.querySelectorAll('.so-col:nth-child(2) .so-l'); avant.forEach(function (el) { if (/Prix de vente avant taxes/.test(el.textContent)) el.querySelector('.v').textContent = fmt2(c.sousClient - c.rabais); });
    maj('.so-recalc-rabais', fmt2(c.rabais));
    // Les lignes ajoutées affichées (lecture) dans les deux colonnes.
    this.elCorps.querySelectorAll('.so-col .so-lignes').forEach(function (col) { var lignes = col.querySelectorAll('.so-l'); lignes.forEach(function (l) { var lib = l.querySelector('.lib'); if (!lib) return; var t = lib.firstChild && lib.firstChild.nodeType === 3 ? lib.firstChild.textContent : ''; (f.feuille.lignes || []).forEach(function (x) { if (x.libelle && t === x.libelle) l.querySelector('.v').textContent = fmt2(x.montant); }); }); });
  };
  VueSoumissions.prototype.enregistrerFiche = function () {
    var self = this, f = this.fiche, s = f.s;
    if (!peutEcrire()) return;
    var titre = this.elTitre ? this.elTitre.value.trim() : s.titre;
    var fe = Object.assign({}, f.feuille, { soldeEchange: num0(f.feuille.soldeEchange) === 0.01 ? '' : f.feuille.soldeEchange, lignes: (f.feuille.lignes || []).filter(function (l) { return l.libelle || (l.montant !== '' && l.montant !== null && l.montant !== undefined); }) });
    delete fe.provinceChoisie;
    this.btnEnregistrer.classList.add('occupe');
    return AMX.soumission.enregistrer({ id: s.id, titre: titre, client: s.client, clientCourriel: s.clientCourriel, clientTel: s.clientTel, statut: s.statut, compagnie: s.compagnie, note: s.note, feuille: fe }).then(function (d) {
      self.btnEnregistrer.classList.remove('occupe');
      f.s = d.soumission; f.feuille = d.soumission.feuille ? Object.assign(feuilleDefaut(d.soumission), d.soumission.feuille) : feuilleDefaut(d.soumission); f.modifie = false;
      AMX.toast('Soumission enregistrée — ' + fmt2(d.calcul ? d.calcul.total : calculer(f.s, f.feuille).total), 'ok');
      self.rendreFiche();
      AMX.rafraichirSousBarre();
    }).catch(function (e) { self.btnEnregistrer.classList.remove('occupe'); AMX.toast('Échec — ' + AMX.erreurTexte(e), 'erreur'); });
  };
  VueSoumissions.prototype.dupliquerFiche = function () {
    var s = this.fiche.s;
    return AMX.soumission.dupliquer(s.id).then(function (d) { AMX.toast('Copie ' + d.id + ' créée.', 'ok'); AMX.aller('inventaire', 'soumissions', { id: d.id }); }).catch(function (e) { AMX.toast('Copie impossible — ' + AMX.erreurTexte(e), 'erreur'); });
  };
  VueSoumissions.prototype.supprimerFiche = function () {
    var s = this.fiche.s;
    return AMX.confirmer('Supprimer la soumission', s.id + ' — ' + (s.titre || vehiculeCourt(s)) + ' sera supprimée, avec ses options et sa feuille. Cette action est définitive.', { ok: 'Supprimer', danger: true }).then(function (oui) {
      if (!oui) return;
      return AMX.soumission.supprimer(s.id).then(function () { AMX.toast('Soumission ' + s.id + ' supprimée.', 'ok'); AMX.aller('inventaire', 'soumissions'); }).catch(function (e) { AMX.toast('Suppression impossible — ' + AMX.erreurTexte(e), 'erreur'); });
    });
  };

  /* --- Options --- */
  VueSoumissions.prototype.rendreOptions = function () {
    var self = this, f = this.fiche, options = f.detail.options || [], inv = voitInvoice();
    this.optToutes = this.optToutes || false; this.optRecherche = this.optRecherche || '';
    var conteneur = h('div.carte', [h('div.carte-corps')]);
    var corps = conteneur.firstChild;
    var dessiner = function () {
      AMX.vider(corps);
      var q = self.optRecherche.trim().toLowerCase();
      var l = options.filter(function (o) { return (self.optToutes || optionChoisie(o)) && (!q || [o.code, o.description, o.categorie].join(' ').toLowerCase().indexOf(q) >= 0); });
      var choisies = options.filter(optionChoisie);
      corps.appendChild(h('div.so-opts-outils', [
        h('div.recherche', [h('span', { html: I.recherche }), h('input.saisie', { type: 'search', placeholder: 'Code, description, catégorie…', value: self.optRecherche, oninput: AMX.debounce(function (e) { self.optRecherche = e.target.value; dessiner(); }, 120) })]),
        h('div.segment', [h('button' + (!self.optToutes ? '.actif' : ''), { type: 'button', text: 'Choisies (' + choisies.length + ')', onclick: function () { self.optToutes = false; dessiner(); } }), h('button' + (self.optToutes ? '.actif' : ''), { type: 'button', text: 'Toutes (' + options.length + ')', onclick: function () { self.optToutes = true; dessiner(); } })]),
        h('span.compte', { text: l.length + ' ligne' + (l.length > 1 ? 's' : '') + ' · PDSF options ' + fmt(f.s.pdsfOptions) + (inv ? ' · Invoice ' + fmt(f.s.invOptions) : '') })
      ]));
      if (!options.length) { corps.appendChild(h('div.vide', [h('div', { html: I.info }), h('h3', 'Aucune option lue'), h('div', 'Recliquez le favori sur l\'onglet « Build A Vehicle » du véhicule dans AutoBook.')])); return; }
      if (!l.length) { corps.appendChild(h('div.vide', [h('h3', 'Rien avec cette recherche')])); return; }
      var tbody = h('tbody'), cat = null;
      l.forEach(function (o) {
        if (o.categorie !== cat) { cat = o.categorie; tbody.appendChild(h('tr.cat', [h('td', { colspan: inv ? 5 : 4, text: cat || 'Autres' })])); }
        var parts = String(o.description || '').split(/\s+-inc:\s*/);
        tbody.appendChild(h('tr' + (optionChoisie(o) ? '.choisie' : '') + (o.statut === 'excluded' ? '.exclue' : ''), [
          h('td', [badgeOption(o.varie ? 'varies' : o.statut)]),
          h('td.code', { text: o.code && o.code !== '___' ? o.code : '—' }),
          h('td.desc', [parts[0] || '', parts[1] ? h('span.inc', { text: 'inclut : ' + parts.slice(1).join(' · ') }) : null]),
          h('td.num', { text: fmt(o.pdsf) }),
          inv ? h('td.num', { text: fmt(o.invoice) }) : null
        ]));
      });
      corps.appendChild(h('div.so-options', [h('table', [h('thead', [h('tr', [h('th', 'Statut'), h('th', 'Code'), h('th', 'Description'), h('th.num', 'PDSF'), inv ? h('th.num', 'Invoice') : null])]), tbody])]));
    };
    dessiner();
    return conteneur;
  };
  /* --- Équipement de série --- */
  VueSoumissions.prototype.rendreEquipement = function () {
    var eq = this.fiche.detail.equipement || [];
    if (!eq.length) return h('div.carte', [h('div.carte-corps', [h('div.vide', [h('div', { html: I.info }), h('h3', 'Équipement de série non lu'), h('div', 'AutoBook ne l\'a pas montré au favori (onglet « Standard Equipment »). Recliquez le favori sur le véhicule.')])])]);
    return h('div.carte', [h('div.carte-corps', [
      h('p.doux.petit', { style: { margin: '0 0 12px' } }, '★ = équipement qui change avec les options choisies (en gras dans AutoBook).'),
      h('div.so-equip', eq.map(function (g) { return h('div.groupe', [h('h4', { text: g.categorie }), h('ul', g.items.map(function (it) { return h('li' + (it.change ? '.change' : ''), { text: it.texte }); }))]); }))
    ])]);
  };
  /* --- Fiche technique --- */
  VueSoumissions.prototype.rendreSpecs = function () {
    var specs = this.fiche.detail.specs || [];
    if (!specs.length) return h('div.carte', [h('div.carte-corps', [h('div.vide', [h('div', { html: I.info }), h('h3', 'Fiche technique non lue'), h('div', 'AutoBook ne l\'a pas montrée au favori (onglet « Tech Specs »). Recliquez le favori sur le véhicule.')])])]);
    return h('div.carte', [h('div.carte-corps', [h('div.so-specs', specs.map(function (g) {
      return h('div', [h('h4', { text: g.onglet })].concat(g.sections.map(function (sec) { return h('div', [sec.titre ? h('h5', { text: sec.titre }) : null, h('dl', sec.lignes.map(function (l) { return [h('dt', { text: l[0] }), h('dd', { text: l[1] || '—' })]; }))]); })));
    }))])]);
  };

  /* ----------------------------- Impression (PDF) ------------------------------ */
  VueSoumissions.prototype.imprimer = function (mode) {
    var f = this.fiche, s = f.s, fe = f.feuille, c = calculer(s, fe), interne = mode === 'interne' && voitInvoice();
    var options = (f.detail.options || []).filter(function (o) { return optionChoisie(o) && o.code && o.code !== '___'; });
    var cie = nomCie(s.compagnie), titre = (this.elTitre && this.elTitre.value.trim()) || s.titre || vehiculeCourt(s);
    var L = function (lib, val, cls) { return '<tr class="' + (cls || '') + '"><td>' + esc(lib) + '</td><td class="n">' + esc(val) + '</td></tr>'; };
    var lignesAj = function (cote) { return (fe.lignes || []).filter(function (l) { var k = String(l.cote || 'deux'); return k === 'deux' || k === cote; }).map(function (l) { return L(l.libelle || '', fmt2(l.montant)); }).join(''); };
    var tableClient = '<table class="prix"><tbody>' + L('Prix de base', fmt2(s.pdsfBase)) + L('Transport et préparation', fmt2(s.pdsfDest)) + L('Options choisies', fmt2(s.pdsfOptions)) + (num0(s.pdsfTaxe) ? L('Taxe sur la climatisation', fmt2(s.pdsfTaxe)) : '') + (num0(s.pdsfAjust) ? L('Ajustements', fmt2(s.pdsfAjust)) : '') + lignesAj('client') + L('Sous-total', fmt2(c.sousClient), 'sous') + (c.rabais ? L('Rabais', '− ' + fmt2(c.rabais)) : '') + (c.echange ? L('Échange' + (fe.echangeTexte ? ' — ' + fe.echangeTexte : ''), '− ' + fmt2(c.echange)) : '') + L('Prix taxable', fmt2(c.taxable), 'sous') + (c.taxes.length ? c.taxes.map(function (t) { return L(t.nom + ' ' + t.taux.toLocaleString('fr-CA') + ' %', fmt2(t.montant)); }).join('') : L('Taxes', fe.exempt ? 'exempt' : 'aucune')) + (c.soldeEchange ? L('Solde dû sur l\'échange', fmt2(c.soldeEchange)) : '') + L('TOTAL', fmt2(c.total), 'total') + '</tbody></table>';
    var tableInterne = interne ? '<h2>Interne — Invoice</h2><table class="prix"><tbody>' + L('Prix de base', fmt2(s.invBase)) + L('Transport et préparation', fmt2(s.invDest)) + L('Options choisies', fmt2(s.invOptions)) + (num0(s.invTaxe) ? L('Taxe sur la climatisation', fmt2(s.invTaxe)) : '') + (num0(s.invAjust) ? L('Ajustements', fmt2(s.invAjust)) : '') + lignesAj('interne') + L('Coût total', fmt2(c.sousInterne), 'sous') + L('Prix de vente avant taxes', fmt2(c.sousClient - c.rabais)) + L('Profit brut' + (c.profitPct !== null ? ' (' + c.profitPct.toLocaleString('fr-CA') + ' %)' : ''), c.invoiceConnu ? fmt2(c.profit) : '—', 'total') + '</tbody></table>' : '';
    var tableOptions = options.length ? '<h2>Options choisies (' + options.length + ')</h2><table class="opts"><thead><tr><th>Code</th><th>Description</th><th class="n">PDSF</th>' + (interne ? '<th class="n">Invoice</th>' : '') + '</tr></thead><tbody>' + options.map(function (o) { return '<tr><td class="c">' + esc(o.code) + '</td><td>' + esc(String(o.description).split(/\s+-inc:\s*/)[0]) + '</td><td class="n">' + esc(fmt(o.pdsf)) + '</td>' + (interne ? '<td class="n">' + esc(fmt(o.invoice)) + '</td>' : '') + '</tr>'; }).join('') + '</tbody></table>' : '';
    var eq = f.detail.equipement || [];
    var tableEq = (!interne && eq.length) ? '<h2 class="saut">Équipement de série</h2><div class="eq">' + eq.map(function (g) { return '<div class="g"><h3>' + esc(g.categorie) + '</h3><ul>' + g.items.map(function (it) { return '<li' + (it.change ? ' class="b"' : '') + '>' + esc(it.texte) + '</li>'; }).join('') + '</ul></div>'; }).join('') + '</div>' : '';
    var html = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>' + esc(s.id + ' — ' + titre) + '</title><style>' +
      'body{font:12px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:28px 34px}h1{font-size:19px;margin:0 0 2px}h2{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#555;margin:18px 0 6px;border-bottom:1px solid #ddd;padding-bottom:4px}h3{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#666;margin:10px 0 4px}' +
      '.tete{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #008840;padding-bottom:10px;margin-bottom:12px}.tete .cie{font-weight:700;font-size:15px}.tete .d{color:#555;font-size:11.5px;text-align:right}.sous{color:#555;margin-bottom:10px}' +
      '.deux{display:grid;grid-template-columns:1fr 1fr;gap:18px}table{border-collapse:collapse;width:100%}table.prix td{padding:5px 8px;border-bottom:1px solid #eee}table.prix td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}table.prix tr.sous td{background:#f4f6f8;font-weight:600}table.prix tr.total td{background:#141A1F;color:#fff;font-weight:700;font-size:13.5px}' +
      'table.opts th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:#666;padding:4px 8px;border-bottom:1px solid #ccc}table.opts td{padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top}table.opts td.c{font-family:ui-monospace,Menlo,monospace;white-space:nowrap}table.opts td.n,table.opts th.n{text-align:right;white-space:nowrap}' +
      '.eq{columns:2;column-gap:24px}.eq .g{break-inside:avoid;margin-bottom:8px}.eq ul{margin:0;padding:0;list-style:none;font-size:11px}.eq li{padding:1.5px 0;border-bottom:1px dotted #eee}.eq li.b{font-weight:600}.saut{break-before:page}.com{white-space:pre-wrap;background:#f4f6f8;padding:8px 10px;border-radius:6px;margin-top:10px}.pied{margin-top:22px;color:#666;font-size:10.5px;border-top:1px solid #ddd;padding-top:8px}.badge{display:inline-block;padding:1px 7px;border:1px solid #bbb;border-radius:999px;font-size:10.5px;margin-left:6px}' +
      '@media print{body{margin:14mm 16mm}}</style></head><body>' +
      '<div class="tete"><div><div class="cie">' + esc(cie) + '</div><h1>' + esc(titre) + (interne ? '<span class="badge">INTERNE</span>' : '') + '</h1><div class="sous">' + esc(s.vehicule || vehiculeCourt(s)) + (s.codeStyle ? ' · style ' + esc(s.codeStyle) : '') + (s.mode ? ' · ' + esc(modeTexte(s)) : '') + '</div></div><div class="d">Soumission ' + esc(s.id) + '<br>' + esc(AMX.fmtDate(new Date().toISOString())) + (fe.validite ? '<br>Valide ' + esc(fe.validite) : '') + (s.datePrix ? '<br>Prix du ' + esc(s.datePrix) : '') + '</div></div>' +
      (s.client || fe.vendeur ? '<div class="deux"><div>' + (s.client ? '<h2>Client</h2><div>' + esc(s.client) + (s.clientTel ? '<br>' + esc(s.clientTel) : '') + (s.clientCourriel ? '<br>' + esc(s.clientCourriel) : '') + '</div>' : '') + '</div><div>' + (fe.vendeur ? '<h2>Conseiller</h2><div>' + esc(fe.vendeur) + '</div>' : '') + '</div></div>' : '') +
      '<h2>Prix' + (interne ? ' client (PDSF)' : '') + '</h2>' + tableClient + tableInterne +
      (fe.commentaire ? '<div class="com">' + esc(fe.commentaire) + '</div>' : '') +
      (interne && s.note ? '<h2>Note interne</h2><div class="com">' + esc(s.note) + '</div>' : '') +
      tableOptions + tableEq +
      '<div class="pied">' + esc(cie) + ' — Groupe Automax · Prix suggérés du manufacturier (PDSF) lus dans GM AutoBook PRO' + (s.datePrix ? ' au ' + esc(s.datePrix) : '') + '. Sous réserve des programmes en vigueur à la livraison.</div>' +
      '</body></html>';
    var w = window.open('', '_blank');
    if (!w) { AMX.toast('Autorisez les fenêtres pop-up pour imprimer.', 'attention'); return; }
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(function () { try { w.focus(); w.print(); } catch (e) {} }, 400);
  };

  /* ----------------------------- Catalogue (copié d'AutoBook) ------------------------------ */
  VueSoumissions.prototype.construireImportCatalogue = function () {
    var signet = h('a.btn.primaire', { href: CODE_SIGNET_AUTOBOOK_CATALOGUE, text: 'Automax ← AutoBook (catalogue)', title: 'Glissez ce bouton dans votre barre de favoris', draggable: 'true' });
    signet.addEventListener('click', function (e) { e.preventDefault(); AMX.toast('Glissez ce bouton dans la barre de favoris de Chrome (Cmd+Shift+B pour l\'afficher), puis cliquez-le depuis AutoBook, sur un style.', 'attention', 8000); });
    return h('details.carte#so-import-catalogue', { open: true }, [
      h('summary.carte-entete', { style: { cursor: 'pointer' } }, [h('h2', 'Remplir le catalogue depuis GM AutoBook PRO')]),
      h('div.carte-corps', [
        h('p', { style: { margin: '0 0 12px', color: 'var(--encre-2)' } }, 'Le favori « catalogue » lit, dans AutoBook, le style affiché avec sa configuration par défaut — toutes ses options (statut par défaut, PDSF, Invoice), prix de base, transport, équipement de série, fiche technique — et le garde ici. Quand il trouve le sélecteur des styles, il propose de lire tous les styles du modèle d\'un coup (une dizaine de secondes par style). Relire un style met ses prix à jour. Les règles de compatibilité des options d\'AutoBook ne sont pas copiées : le site garde les statuts par défaut (inclus, requis, exclu) et vous laisse cocher le reste.'),
        h('div.so-etapes', [
          h('div', [h('div.section-titre', '1. Installer (une fois)'), h('p', 'Glissez ce bouton dans la barre de favoris de Chrome (Cmd+Shift+B si elle est cachée). C\'est un favori distinct de « Automax ← AutoBook ».'), signet]),
          h('div', [h('div.section-titre', '2. Dans AutoBook'), h('p', ['Connectez-vous sur ', h('a', { href: URL_AUTOBOOK, target: '_blank', rel: 'noopener', text: 'carbookpro.carbook.com' }), ', « Build Vehicle » : année, marque, modèle, puis un style. Gardez cet onglet du site ouvert et connecté.'])]),
          h('div', [h('div.section-titre', '3. Cliquer le favori'), h('p', 'Sur l\'onglet « Build A Vehicle » du style. La bande verte lit le style, puis propose de lire les autres styles du modèle. À la fin : « Ouvrir le catalogue », puis « Bâtir un véhicule ».')])
        ])
      ])
    ]);
  };
  VueSoumissions.prototype.montrerCatalogue = function () {
    var self = this, gen = ++this.generation;
    this.mode = 'catalogue'; this.fiche = null;
    AMX.vider(this.el);
    this.elEtat = h('p', { text: 'Chargement du catalogue…' });
    this.btnRafraichir = h('button.btn', { type: 'button', html: I.rafraichir + '<span>Rafraîchir</span>', onclick: function () { self.chargerCatalogue(true); } });
    this.el.appendChild(h('div.entete-page', [
      h('div', { style: { minWidth: 0 } }, [h('h1', 'Catalogue AutoBook'), this.elEtat]),
      h('div.actions', [h('a.btn', { href: AMX.lien('inventaire', 'soumissions'), text: '← Soumissions' }), this.btnRafraichir, h('a.btn.primaire', { href: AMX.lien('inventaire', 'soumissions', { batir: 1 }), text: 'Bâtir un véhicule' })])
    ]));
    this.elImportCat = this.construireImportCatalogue();
    this.el.appendChild(this.elImportCat);
    this.elRechercheCat = h('input.saisie#so-cat-recherche', { type: 'search', placeholder: 'Marque, modèle, style, code…', autocomplete: 'off', oninput: AMX.debounce(function (e) { self.rechercheCat = e.target.value; self.rendreCatalogue(); }, 120) });
    this.elCompteCat = h('span.compte.doux');
    this.el.appendChild(h('div.carte', [h('div.carte-corps', [h('div.so-outils', [h('div.recherche', [h('span', { html: I.recherche }), this.elRechercheCat]), this.elCompteCat])])]));
    this.elCatTable = h('div.so-cat-table');
    this.el.appendChild(h('div.carte', [h('div.carte-corps', [this.elCatTable])]));
    this.rechercheCat = '';
    this.catalogueListe = AMX.catalogue.enCache();
    this.rendreCatalogue();
    this.chargerCatalogue();
  };
  VueSoumissions.prototype.chargerCatalogue = function (manuel) {
    var self = this, gen = ++this.generation;
    if (manuel && this.btnRafraichir) this.btnRafraichir.classList.add('occupe');
    return AMX.catalogue.charger(true).then(function (l) {
      if (gen !== self.generation || (self.mode !== 'catalogue' && self.mode !== 'batir')) return;
      if (self.btnRafraichir) self.btnRafraichir.classList.remove('occupe');
      self.catalogueListe = l; self.erreurCat = '';
      if (self.mode === 'catalogue') self.rendreCatalogue(); else { self.rendreChoixStyle(); if (self.batir && self.batir.styleId && !self.batir.detail) self.chargerStyle(self.batir.styleId); }
      if (manuel) AMX.toast('Catalogue mis à jour — ' + l.length + ' style' + (l.length > 1 ? 's' : ''), 'ok');
    }).catch(function (e) {
      if (gen !== self.generation) return;
      if (self.btnRafraichir) self.btnRafraichir.classList.remove('occupe');
      self.erreurCat = AMX.erreurTexte(e); self.catalogueRefus = !!(e && e.refuse);
      if (self.mode === 'catalogue') self.rendreCatalogue(); else self.rendreChoixStyle();
    });
  };
  function stylesFiltres(liste, q) {
    q = String(q || '').trim().toLowerCase();
    if (!q) return liste;
    return liste.filter(function (s) { return [s.annee, s.marque, s.modele, s.style, s.codeStyle, s.vehicule].join(' ').toLowerCase().indexOf(q) >= 0; });
  }
  VueSoumissions.prototype.rendreCatalogue = function () {
    var self = this;
    if (this.mode !== 'catalogue') return;
    AMX.vider(this.elCatTable);
    if (this.catalogueRefus) { this.elEtat.textContent = this.erreurCat; this.elCatTable.appendChild(h('div.vide', [h('div', { html: I.cadenas }), h('h3', 'Accès non autorisé'), h('div', { text: this.erreurCat })])); return; }
    var l = this.catalogueListe;
    if (!l) { this.elEtat.textContent = this.erreurCat ? 'Serveur injoignable : ' + this.erreurCat : 'Chargement du catalogue…'; if (!this.erreurCat) this.elCatTable.appendChild(AMX.chargeur('Catalogue')); return; }
    var r = AMX.catalogue.reglages(), marques = Object.keys(r.marques || {}).sort();
    this.elEtat.textContent = l.length ? (l.length + ' style' + (l.length > 1 ? 's' : '') + ' — ' + marques.map(function (m) { return m + ' ' + r.marques[m]; }).join(', ') + (this.erreurCat ? ' (liste gardée localement — serveur injoignable)' : '') + '. Prix et options tels que lus dans AutoBook ; relire un style met ses prix à jour.') : 'Le catalogue est vide : installez le favori « catalogue » ci-dessous et cliquez-le dans AutoBook sur un style.';
    var f = stylesFiltres(l, this.rechercheCat), inv = voitInvoice();
    this.elCompteCat.textContent = f.length + ' style' + (f.length > 1 ? 's' : '') + (f.length !== l.length ? ' sur ' + l.length : '');
    if (!f.length) { this.elCatTable.appendChild(h('div.vide', [h('div', { html: I.achat }), h('h3', l.length ? 'Rien avec cette recherche' : 'Catalogue vide'), h('div', l.length ? 'Essayez un autre mot.' : 'Le favori « catalogue » (ci-dessus) remplit la première ligne.')])); return; }
    var thead = h('thead', [h('tr', [h('th', 'Année'), h('th', 'Modèle'), h('th', 'Style'), h('th', 'Code'), h('th', 'Mode'), h('th.num', 'PDSF base'), h('th.num', 'Transport'), inv ? h('th.num', 'Invoice base') : null, h('th.num', 'Options'), h('th', 'Prix du'), h('th', 'Lu'), h('th', '')])]);
    var tbody = h('tbody'), marqueCourante = null;
    f.forEach(function (s) {
      if (s.marque !== marqueCourante) { marqueCourante = s.marque; tbody.appendChild(h('tr.marque', [h('td', { colspan: inv ? 12 : 11, text: s.marque })])); }
      var actions = [h('a.btn.petit.primaire', { href: AMX.lien('inventaire', 'soumissions', { batir: 1, style: s.id }), text: 'Bâtir' })];
      if (r.peutSupprimer) actions.push(h('button.btn.petit', { type: 'button', text: 'Retirer', onclick: function () {
        AMX.confirmer('Retirer ce style du catalogue ?', s.vehicule || (s.annee + ' ' + s.marque + ' ' + s.modele + ' ' + s.style), { danger: 'Retirer' }).then(function (oui) {
          if (!oui) return;
          AMX.catalogue.supprimer(s.id).then(function () { self.catalogueListe = AMX.catalogue.enCache(); self.rendreCatalogue(); AMX.toast('Style retiré.', 'ok'); }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); });
        });
      } }));
      tbody.appendChild(h('tr', [
        h('td.num', { text: String(s.annee || '') }),
        h('td', [h('div', { text: s.modele }), h('div.sous', { text: s.vehicule || '' })]),
        h('td', { text: s.style || '—' }),
        h('td', [h('code', { text: s.codeStyle || '—' })]),
        h('td', { text: modeTexte(s) || '—' }),
        h('td.num', { text: fmt(s.pdsfBase) }),
        h('td.num', { text: fmt(s.pdsfDest) }),
        inv ? h('td.num', { text: fmt(s.invBase) }) : null,
        h('td.num', { text: String(num0(s.nbOptions)) }),
        h('td', { text: s.datePrix || '—' }),
        h('td', { text: s.luLe ? AMX.fmtDateCourte(s.luLe) : '—', title: (s.luLe ? AMX.fmtDate(s.luLe, true) : '') + (s.luPar ? ' par ' + s.luPar : '') }),
        h('td', { style: { whiteSpace: 'nowrap' } }, actions)
      ]));
    });
    this.elCatTable.appendChild(h('table.tableau', [thead, tbody]));
  };

  /* ----------------------------- Bâtir depuis le catalogue ------------------------------ */
  function categorieUnique(options) {
    /* Choix unique (peinture, roues, sellerie, moteur…) : la catégorie a au moins deux options et exactement une choisie par défaut. */
    var n = 0, choisies = 0;
    options.forEach(function (o) { if (!o.code || o.code === '___') return; n++; if (o.statut === 'selected') choisies++; });
    return n >= 2 && choisies === 1;
  }
  VueSoumissions.prototype.montrerBatir = function (p) {
    var self = this;
    this.mode = 'batir'; this.fiche = null;
    this.batir = { styleId: p && p.style ? String(p.style).toUpperCase() : '', annee: '', marque: '', modele: '', detail: null, coches: {}, compagnie: AMX.compagnieChoisie('inventaire') || (AMX.codesPour('inventaire')[0] || ''), titre: '', client: '', recherche: '', toutes: false };
    AMX.vider(this.el);
    this.elEtat = h('p', { text: 'Choisissez l\'année, la marque, le modèle et le style, cochez les options : le prix se calcule en direct.' });
    this.el.appendChild(h('div.entete-page', [
      h('div', { style: { minWidth: 0 } }, [h('h1', 'Bâtir un véhicule'), this.elEtat]),
      h('div.actions', [h('a.btn', { href: AMX.lien('inventaire', 'soumissions'), text: '← Soumissions' }), h('a.btn', { href: AMX.lien('inventaire', 'soumissions', { catalogue: 1 }), text: 'Catalogue' })])
    ]));
    this.elChoix = h('div.so-choix');
    this.elStyleInfo = h('div.so-style-info');
    this.elBatirOpts = h('div.so-options.so-batir-opts');
    this.elRecap = h('div.so-recap');
    this.el.appendChild(h('div.so-batir', [
      h('div', [h('div.carte', [h('div.carte-corps', [this.elChoix, this.elStyleInfo])]), h('div.carte', [h('div.carte-corps', [this.elBatirOpts])])]),
      h('div.colonne-droite', [h('div.carte.so-col', [h('h3', [h('span', 'Soumission'), h('span.badge.sans-point.gris', 'en direct')]), this.elRecap])])
    ]));
    this.catalogueListe = AMX.catalogue.enCache();
    this.rendreChoixStyle();
    if (!this.catalogueListe) this.chargerCatalogue(); else if (this.batir.styleId) this.chargerStyle(this.batir.styleId);
    this.rendreRecap();
  };
  VueSoumissions.prototype.rendreChoixStyle = function () {
    var self = this, b = this.batir, l = this.catalogueListe;
    if (this.mode !== 'batir') return;
    AMX.vider(this.elChoix); AMX.vider(this.elStyleInfo);
    if (this.catalogueRefus) { this.elChoix.appendChild(h('div.vide', [h('div', { html: I.cadenas }), h('h3', 'Accès non autorisé'), h('div', { text: this.erreurCat })])); return; }
    if (!l) { this.elChoix.appendChild(this.erreurCat ? h('p.doux', { text: 'Catalogue injoignable : ' + this.erreurCat }) : AMX.chargeur('Catalogue')); return; }
    if (!l.length) { this.elChoix.appendChild(h('div.vide', [h('h3', 'Le catalogue est vide'), h('div', ['Lisez d\'abord un modèle dans AutoBook avec le favori « catalogue » (', h('a', { href: AMX.lien('inventaire', 'soumissions', { catalogue: 1 }), text: 'Catalogue' }), ').'])])); return; }
    var courant = null; l.forEach(function (s) { if (s.id === b.styleId) courant = s; });
    if (courant) { b.annee = String(courant.annee); b.marque = courant.marque; b.modele = courant.modele; }
    var annees = {}, marques = {}, modeles = {}, styles = [];
    l.forEach(function (s) { annees[s.annee] = 1; });
    l.forEach(function (s) { if (!b.annee || String(s.annee) === b.annee) marques[s.marque] = 1; });
    l.forEach(function (s) { if ((!b.annee || String(s.annee) === b.annee) && (!b.marque || s.marque === b.marque)) modeles[s.modele] = 1; });
    l.forEach(function (s) { if ((!b.annee || String(s.annee) === b.annee) && (!b.marque || s.marque === b.marque) && (!b.modele || s.modele === b.modele)) styles.push(s); });
    var sel = function (id, lib, valeurs, valeur, vide, onchange) {
      var s = h('select.saisie#' + id, { onchange: function (e) { onchange(e.target.value); } }, [h('option', { value: '', text: vide })].concat(valeurs.map(function (v) { return h('option', { value: v[0], text: v[1], selected: v[0] === valeur }); })));
      return h('div', [h('label', { text: lib }), s]);
    };
    this.elChoix.appendChild(sel('so-b-annee', 'Année', Object.keys(annees).sort().reverse().map(function (a) { return [a, a]; }), b.annee, 'Toutes', function (v) { b.annee = v; b.marque = ''; b.modele = ''; b.styleId = ''; b.detail = null; self.rendreChoixStyle(); self.rendreOptionsBatir(); self.rendreRecap(); }));
    this.elChoix.appendChild(sel('so-b-marque', 'Marque', Object.keys(marques).sort().map(function (m) { return [m, m]; }), b.marque, 'Choisir…', function (v) { b.marque = v; b.modele = ''; b.styleId = ''; b.detail = null; self.rendreChoixStyle(); self.rendreOptionsBatir(); self.rendreRecap(); }));
    this.elChoix.appendChild(sel('so-b-modele', 'Modèle', Object.keys(modeles).sort().map(function (m) { return [m, m]; }), b.modele, 'Choisir…', function (v) { b.modele = v; b.styleId = ''; b.detail = null; var seuls = l.filter(function (s) { return (!b.annee || String(s.annee) === b.annee) && (!b.marque || s.marque === b.marque) && s.modele === v; }); if (seuls.length === 1) { b.styleId = seuls[0].id; self.chargerStyle(seuls[0].id); } self.rendreChoixStyle(); self.rendreOptionsBatir(); self.rendreRecap(); }));
    this.elChoix.appendChild(sel('so-b-style', 'Style', styles.map(function (s) { return [s.id, (s.style || s.codeStyle) + (s.codeStyle ? ' (' + s.codeStyle + ')' : '') + ' — ' + fmt(s.pdsfBase) + (b.modele ? '' : ' · ' + s.annee + ' ' + s.marque + ' ' + s.modele)]; }), b.styleId, b.modele ? 'Choisir…' : 'Choisissez d\'abord le modèle', function (v) { b.styleId = v; b.detail = null; b.coches = {}; if (v) self.chargerStyle(v); self.rendreChoixStyle(); self.rendreOptionsBatir(); self.rendreRecap(); }));
    if (courant) {
      this.elStyleInfo.appendChild(h('span', ['Style : ', h('b', { text: courant.vehicule || (courant.annee + ' ' + courant.marque + ' ' + courant.modele + ' ' + courant.style) })]));
      this.elStyleInfo.appendChild(h('span', ['PDSF de base : ', h('b', { text: fmt(courant.pdsfBase) })]));
      this.elStyleInfo.appendChild(h('span', ['Transport : ', h('b', { text: fmt(courant.pdsfDest) })]));
      if (courant.datePrix) this.elStyleInfo.appendChild(h('span', ['Prix du ', h('b', { text: courant.datePrix })]));
      if (courant.luLe) this.elStyleInfo.appendChild(h('span', { text: 'lu dans AutoBook le ' + AMX.fmtDate(courant.luLe) }));
    }
  };
  VueSoumissions.prototype.chargerStyle = function (id) {
    var self = this, gen = ++this.generation;
    AMX.vider(this.elBatirOpts); this.elBatirOpts.appendChild(AMX.chargeur('Options du style'));
    AMX.catalogue.style(id).then(function (d) {
      if (gen !== self.generation || self.mode !== 'batir' || self.batir.styleId !== id) return;
      self.batir.detail = d.detail || { options: [], equipement: [], specs: [] };
      self.batir.styleObj = d.style;
      self.batir.coches = {};
      (self.batir.detail.options || []).forEach(function (o) { if (o.code && o.code !== '___' && o.statut === 'selected') self.batir.coches[String(o.code).toUpperCase()] = true; });
      self.rendreOptionsBatir(); self.rendreRecap();
    }).catch(function (e) {
      if (gen !== self.generation || self.mode !== 'batir') return;
      AMX.vider(self.elBatirOpts); self.elBatirOpts.appendChild(h('div.vide', [h('h3', 'Style injoignable'), h('div', { text: AMX.erreurTexte(e) })]));
    });
  };
  VueSoumissions.prototype.optionsBatirCochees = function () {
    var b = this.batir; return Object.keys(b.coches).filter(function (k) { return b.coches[k]; });
  };
  VueSoumissions.prototype.calculBatir = function () {
    var b = this.batir, s = b.styleObj;
    if (!s || !b.detail) return null;
    var opts = 0, inv = 0, taxe = 0, taxeInv = 0, n = 0, sansCode = false;
    (b.detail.options || []).forEach(function (o) {
      var code = String(o.code || '').toUpperCase(), statut = o.statut;
      if (!o.code || o.code === '___') { sansCode = true; if (optionChoisie(o)) { taxe += num0(o.pdsf); taxeInv += num0(o.invoice); } return; }
      if (statut === 'excluded' || statut === 'varies') return;
      var choisie = (statut === 'included' || statut === 'required') ? true : !!b.coches[code];
      if (!choisie) return;
      n++; opts += num0(o.pdsf); inv += num0(o.invoice);
    });
    if (!sansCode) { taxe = num0(s.pdsfTaxe); taxeInv = num0(s.invTaxe); }
    var pdsf = num0(s.pdsfBase) + num0(s.pdsfDest) + num0(s.pdsfAjust) + opts + taxe;
    var invConnu = s.invBase !== '' && s.invBase !== null && s.invBase !== undefined;
    var invoice = invConnu ? num0(s.invBase) + num0(s.invDest) + num0(s.invAjust) + inv + taxeInv : null;
    return { n: n, options: opts, taxe: taxe, pdsf: arrondi(pdsf), optionsInv: inv, invoice: invoice === null ? null : arrondi(invoice), profit: invoice === null ? null : arrondi(pdsf - invoice), invConnu: invConnu };
  };
  VueSoumissions.prototype.rendreOptionsBatir = function () {
    var self = this, b = this.batir;
    if (this.mode !== 'batir') return;
    AMX.vider(this.elBatirOpts);
    if (!b.styleId) { this.elBatirOpts.appendChild(h('div.vide', [h('h3', 'Choisissez un style'), h('div', 'Année, marque, modèle, puis le style : ses options apparaissent ici.')])); return; }
    if (!b.detail) { this.elBatirOpts.appendChild(AMX.chargeur('Options du style')); return; }
    var inv = voitInvoice();
    var outils = h('div.so-opts-outils', [
      h('div.recherche', [h('span', { html: I.recherche }), h('input.saisie#so-b-recherche', { type: 'search', placeholder: 'Code, description…', value: b.recherche, oninput: AMX.debounce(function (e) { b.recherche = e.target.value; self.rendreOptionsBatir(); }, 120) })]),
      h('div.segment', [h('button' + (b.toutes ? '' : '.actif'), { type: 'button', text: 'À choisir', onclick: function () { b.toutes = false; self.rendreOptionsBatir(); } }), h('button' + (b.toutes ? '.actif' : ''), { type: 'button', text: 'Toutes (inclus, requis, exclus)', onclick: function () { b.toutes = true; self.rendreOptionsBatir(); } })]),
      h('span.compte', { text: (b.detail.options || []).length + ' options lues dans AutoBook' })
    ]);
    this.elBatirOpts.appendChild(outils);
    var q = String(b.recherche || '').trim().toLowerCase();
    var options = (b.detail.options || []).filter(function (o) {
      if (!b.toutes && (o.statut === 'excluded' || o.statut === 'included' || o.statut === 'required' || !o.code || o.code === '___')) return false;
      if (q && [o.code, o.description, o.categorie].join(' ').toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    if (!options.length) { this.elBatirOpts.appendChild(h('div.vide', [h('h3', q ? 'Rien avec cette recherche' : 'Aucune option à choisir'), h('div', q ? 'Essayez un autre mot.' : 'Ce style n\'a que des options incluses ou requises (voir « Toutes »).')])); return; }
    var parCat = {}, ordre = [];
    (b.detail.options || []).forEach(function (o) { var c = o.categorie || 'Options'; if (!parCat[c]) { parCat[c] = []; ordre.push(c); } parCat[c].push(o); });
    var thead = h('thead', [h('tr', [h('th', ''), h('th', 'Code'), h('th', 'Description'), h('th', 'Statut'), h('th.num', 'PDSF'), inv ? h('th.num', 'Invoice') : null])]);
    var tbody = h('tbody');
    ordre.forEach(function (cat) {
      var lignes = parCat[cat].filter(function (o) { return options.indexOf(o) >= 0; });
      if (!lignes.length) return;
      var unique = categorieUnique(parCat[cat]);
      tbody.appendChild(h('tr.cat', [h('td', { colspan: inv ? 6 : 5 }, [h('span', { text: cat }), unique ? h('span.unique', '— un seul choix') : null])]));
      lignes.forEach(function (o) {
        var code = String(o.code || '').toUpperCase(), fixe = o.statut === 'included' || o.statut === 'required' || o.statut === 'excluded' || o.statut === 'varies' || !o.code || o.code === '___';
        var cochee = fixe ? (o.statut === 'included' || o.statut === 'required' || (!o.code || o.code === '___') && o.statut === 'selected') : !!b.coches[code];
        var case_ = h('input', { type: unique && !fixe ? 'radio' : 'checkbox', name: unique ? 'so-cat-' + cat.replace(/\W+/g, '-') : null, checked: cochee, disabled: fixe, 'data-code': code, onchange: function (e) {
          if (unique) { parCat[cat].forEach(function (x) { if (x.code && x.code !== '___' && !(x.statut === 'included' || x.statut === 'required' || x.statut === 'excluded')) b.coches[String(x.code).toUpperCase()] = false; }); }
          b.coches[code] = e.target.checked;
          self.rendreOptionsBatir(); self.rendreRecap();
        } });
        var desc = String(o.description || ''), parts = desc.split(/\s+-inc:\s*/);
        tbody.appendChild(h('tr.choix' + (cochee ? '.on' : '') + (fixe && o.statut === 'excluded' ? '.off' : ''), [
          h('td.coche', [case_]), h('td.code', { text: o.code === '___' ? '—' : o.code }),
          h('td.desc', [h('span', { text: parts[0] }), parts[1] ? h('span.inc', { text: 'inclut : ' + parts.slice(1).join(' ; ') }) : null]),
          h('td', [badgeOption(fixe ? o.statut : (cochee ? 'selected' : 'unselected'))]),
          h('td.num', { text: o.varie ? 'varie' : fmt(o.pdsf) }), inv ? h('td.num', { text: fmt(o.invoice) }) : null
        ]));
      });
    });
    this.elBatirOpts.appendChild(h('table', [thead, tbody]));
  };
  VueSoumissions.prototype.rendreRecap = function () {
    var self = this, b = this.batir, c = this.calculBatir(), s = b.styleObj, inv = voitInvoice();
    if (this.mode !== 'batir') return;
    AMX.vider(this.elRecap);
    var L = function (lib, val, cls) { return h('div.so-l' + (cls ? '.' + cls : ''), [h('div.lib', { text: lib }), h('div.v', { text: val })]); };
    if (!c) { this.elRecap.appendChild(h('div.so-vide-fiche', 'Choisissez un style pour voir le prix.')); return; }
    this.elRecap.appendChild(L('Prix de base', fmt2(s.pdsfBase)));
    this.elRecap.appendChild(L('Transport et préparation', fmt2(s.pdsfDest)));
    if (num0(s.pdsfAjust)) this.elRecap.appendChild(L('Ajustements', fmt2(s.pdsfAjust)));
    this.elRecap.appendChild(L('Options choisies (' + c.n + ')', fmt2(c.options)));
    if (c.taxe) this.elRecap.appendChild(L('Taxe sur la climatisation', fmt2(c.taxe)));
    this.elRecap.appendChild(L('PDSF du véhicule', fmt2(c.pdsf), 'total'));
    if (inv && c.invConnu) { this.elRecap.appendChild(L('Invoice (coût)', fmt2(c.invoice), 'sous')); this.elRecap.appendChild(h('div.so-l.profit', [h('div.lib', 'Profit brut avant rabais'), h('div.v' + (c.profit >= 0 ? '.pos' : '.neg'), { text: fmt2(c.profit) })])); }
    var cies = AMX.compagniesPour('inventaire'), codes = Object.keys(cies);
    this.elRecap.appendChild(h('div.champ', [h('label', 'Concession'), h('select.saisie#so-b-cie', { onchange: function (e) { b.compagnie = e.target.value; } }, codes.map(function (k) { return h('option', { value: k, text: cies[k], selected: k === b.compagnie }); }))]));
    this.elRecap.appendChild(h('div.champ', [h('label', 'Titre (facultatif)'), h('input.saisie#so-b-titre', { type: 'text', value: b.titre, placeholder: s.annee + ' ' + s.marque + ' ' + s.modele + ' ' + (s.style || ''), oninput: function (e) { b.titre = e.target.value; } })]));
    this.elRecap.appendChild(h('div.champ', [h('label', 'Client (facultatif)'), h('input.saisie#so-b-client', { type: 'text', value: b.client, placeholder: 'Nom, entreprise', oninput: function (e) { b.client = e.target.value; } })]));
    var btn = h('button.btn.primaire#so-b-creer', { type: 'button', text: 'Créer la soumission', disabled: !peutEcrire(), onclick: function () {
      btn.disabled = true; btn.textContent = 'Création…';
      AMX.catalogue.batir({ styleId: b.styleId, codes: self.optionsBatirCochees(), compagnie: b.compagnie, titre: b.titre, client: b.client }).then(function (d) {
        AMX.toast('Soumission ' + d.id + ' créée — ' + fmt(d.pdsfTotal), 'ok');
        AMX.aller('inventaire', 'soumissions', { id: d.id });
      }).catch(function (e) { btn.disabled = false; btn.textContent = 'Créer la soumission'; AMX.toast(AMX.erreurTexte(e), 'erreur'); });
    } });
    this.elRecap.appendChild(h('div.actions', [btn, h('p.doux', { style: { margin: 0, fontSize: '11.5px' }, text: 'La soumission s\'ouvre ensuite : feuille client / interne, rabais, échange, taxes, PDF. Les règles de compatibilité des options d\'AutoBook ne sont pas vérifiées ici.' })]));
  };

  /* ----------------------------- Comparaison ------------------------------ */
  VueSoumissions.prototype.comparer = function (ids) {
    var self = this, gen = ++this.generation;
    this.mode = 'comparer';
    AMX.vider(this.el);
    this.el.appendChild(h('div.entete-page', [h('div', [h('h1', 'Comparaison'), h('p', 'Chargement des soumissions…')]), h('div.actions', [h('a.btn', { href: AMX.lien('inventaire', 'soumissions'), text: '← Soumissions' })])]));
    this.el.appendChild(AMX.chargeur('Comparaison'));
    Promise.all(ids.slice(0, 4).map(function (id) { return AMX.soumission.une(id).catch(function () { return null; }); })).then(function (fiches) {
      if (gen !== self.generation || self.mode !== 'comparer') return;
      fiches = fiches.filter(Boolean);
      AMX.vider(self.el);
      self.el.appendChild(h('div.entete-page', [h('div', [h('h1', 'Comparaison'), h('p', { text: fiches.length + ' soumission' + (fiches.length > 1 ? 's' : '') + ' côte à côte — prix, options, équipement, fiche technique ; les lignes qui diffèrent sont surlignées.' })]), h('div.actions', [h('a.btn', { href: AMX.lien('inventaire', 'soumissions'), text: '← Soumissions' }), h('button.btn', { type: 'button', html: I.imprimer + '<span>Imprimer</span>', onclick: function () { window.print(); } })])]));
      if (fiches.length < 2) { self.el.appendChild(h('div.vide', [h('h3', 'Il faut au moins deux soumissions'), h('div', 'Cochez-les dans la liste, puis « Comparer ».')])); return; }
      self.el.appendChild(h('div.carte', [h('div.carte-corps', [self.tableComparaison(fiches)])]));
    });
  };
  VueSoumissions.prototype.tableComparaison = function (fiches) {
    var inv = voitInvoice();
    var cols = fiches.map(function (d) { var s = d.soumission; return { s: s, d: d.detail || {}, c: calculer(s, s.feuille ? Object.assign(feuilleDefaut(s), s.feuille) : feuilleDefaut(s)) }; });
    var tbody = h('tbody');
    var rangee = function (lib, vals, opts) {
      opts = opts || {};
      var diff = vals.some(function (v) { return String(v) !== String(vals[0]); });
      var meilleur = -1;
      if (opts.min || opts.max) { var nums = vals.map(nombre); var ref = null; nums.forEach(function (n, i) { if (n === null) return; if (ref === null || (opts.min ? n < ref : n > ref)) { ref = n; meilleur = i; } }); if (nums.filter(function (n) { return n !== null; }).length < 2) meilleur = -1; }
      tbody.appendChild(h('tr' + (diff ? '.diff' : ''), [h('td.lib', { text: lib })].concat(vals.map(function (v, i) { return h('td' + (opts.num ? '.num' : '') + (i === meilleur ? '.meilleur' : ''), { text: v }); }))));
    };
    var section = function (t) { tbody.appendChild(h('tr.sec', [h('td', { colspan: cols.length + 1, text: t })])); };
    section('Véhicule');
    rangee('Véhicule', cols.map(function (x) { return x.s.vehicule || vehiculeCourt(x.s); }));
    rangee('Mode', cols.map(function (x) { return modeTexte(x.s) || '—'; }));
    rangee('Code style', cols.map(function (x) { return x.s.codeStyle || '—'; }));
    rangee('Client', cols.map(function (x) { return x.s.client || '—'; }));
    rangee('Statut', cols.map(function (x) { return (STATUTS[x.s.statut] || ['?'])[0]; }));
    section('Prix');
    rangee('PDSF base', cols.map(function (x) { return fmt(x.s.pdsfBase); }), { num: true, min: true });
    rangee('Transport', cols.map(function (x) { return fmt(x.s.pdsfDest); }), { num: true });
    rangee('Options choisies', cols.map(function (x) { return String(num0(x.s.nbOptions)); }), { num: true });
    rangee('PDSF options', cols.map(function (x) { return fmt(x.s.pdsfOptions); }), { num: true });
    rangee('PDSF total AutoBook', cols.map(function (x) { return fmt(x.s.pdsfTotal); }), { num: true, min: true });
    rangee('Rabais', cols.map(function (x) { return fmt(x.c.rabais); }), { num: true });
    rangee('Prix de vente (taxes incluses)', cols.map(function (x) { return fmt2(x.c.total); }), { num: true, min: true });
    if (inv) { rangee('Invoice total', cols.map(function (x) { return fmt(x.s.invTotal); }), { num: true, min: true }); rangee('Profit brut', cols.map(function (x) { return x.c.invoiceConnu ? fmt(x.c.profit) : '—'; }), { num: true, max: true }); }
    // Options : codes présents dans une soumission et pas dans les autres.
    section('Options choisies');
    var codes = {}; cols.forEach(function (x, i) { (x.d.options || []).filter(function (o) { return optionChoisie(o) && o.code && o.code !== '___'; }).forEach(function (o) { codes[o.code] = codes[o.code] || { desc: o.description, dans: [] }; codes[o.code].dans[i] = fmt(o.pdsf); }); });
    var listeCodes = Object.keys(codes).sort();
    var montrees = 0;
    listeCodes.forEach(function (code) { var e = codes[code]; var vals = cols.map(function (x, i) { return e.dans[i] === undefined ? '—' : e.dans[i]; }); if (vals.every(function (v) { return v === vals[0]; }) && listeCodes.length > 25) return; montrees++; rangee(code + ' — ' + String(e.desc).split(/\s+-inc:\s*/)[0].slice(0, 70), vals, { num: true }); });
    if (!listeCodes.length) rangee('Options', cols.map(function () { return '—'; }));
    else if (montrees < listeCodes.length) rangee('(' + (listeCodes.length - montrees) + ' options identiques masquées)', cols.map(function () { return ''; }));
    // Fiche technique : les libellés communs qui diffèrent.
    var specs = {}; cols.forEach(function (x, i) { (x.d.specs || []).forEach(function (g) { g.sections.forEach(function (sec) { sec.lignes.forEach(function (l) { var k = l[0]; specs[k] = specs[k] || { onglet: g.onglet, section: sec.titre, vals: [] }; specs[k].vals[i] = l[1]; }); }); }); });
    var clesSpecs = Object.keys(specs), nDiff = 0, nMeme = 0;
    if (clesSpecs.length) {
      section('Fiche technique (différences)');
      clesSpecs.forEach(function (k) { var e = specs[k], vals = cols.map(function (x, i) { return e.vals[i] === undefined ? '—' : e.vals[i]; }); if (vals.every(function (v) { return v === vals[0]; })) { nMeme++; return; } if (nDiff >= 60) return; nDiff++; rangee(k, vals); });
      if (!nDiff) rangee('Aucune différence', cols.map(function () { return nMeme + ' lignes identiques'; }));
      else rangee('(' + nMeme + ' lignes identiques masquées)', cols.map(function () { return ''; }));
    }
    // Équipement de série : ce qu'une a et pas les autres.
    var eq = {}; cols.forEach(function (x, i) { (x.d.equipement || []).forEach(function (g) { g.items.forEach(function (it) { eq[it.texte] = eq[it.texte] || []; eq[it.texte][i] = true; }); }); });
    var exclusifs = Object.keys(eq).filter(function (t) { return cols.some(function (x, i) { return !eq[t][i]; }) && cols.some(function (x, i) { return eq[t][i]; }); });
    if (exclusifs.length) { section('Équipement de série (différences — ' + exclusifs.length + ')'); exclusifs.slice(0, 60).forEach(function (t) { rangee(t, cols.map(function (x, i) { return eq[t][i] ? '✓' : '—'; })); }); }
    var thead = h('thead', [h('tr', [h('th', '')].concat(cols.map(function (x) { return h('th.col', [h('a', { href: AMX.lien('inventaire', 'soumissions', { id: x.s.id }), text: x.s.titre || vehiculeCourt(x.s) }), h('div.doux.petit', { text: x.s.id + (x.s.compagnie ? ' · ' + nomCie(x.s.compagnie) : '') })]); })))]);
    return h('div.so-comp', [h('table', [thead, tbody])]);
  };
})();
