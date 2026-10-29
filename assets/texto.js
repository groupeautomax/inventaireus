/* ScanAutomax — Service après-vente › Texto : estimés par texto, conversations avec les clients, paiements, suivi de courtoisie (20 oct. 2026).
   Maxime, devant Kimoby (BMW Sherbrooke › Estimés) : « on doit se créer cette application mais elle doit être meilleure.
   Mets-la dans Service, appelle l'onglet Texto » — puis « je veux toutes les options incluant paiement et suivi courtoisie ».

   Ce que fait la page (une seule, cinq vues) :
   - Estimés : liste (référence, client, véhicule, BT, total, approuvé, statut, vues, envoyé, conseiller), filtres par statut,
     recherche ; fiche = lignes de travaux (menu ou libre, main-d'œuvre fixe ou taux × heures, pièces, frais, priorité, photos /
     vidéos), message au client, totaux avec les taxes de la province (TPS + TVQ, TVH en Ontario), Envoyer (texto et / ou courriel), Relancer, Copier le lien, Travaux terminés,
     Demande de paiement, Suivi de courtoisie, Dupliquer, Annuler, BT #, journal. Réponse consignée au comptoir / au téléphone.
   - Conversations : un fil par client (entrants et sortants, non lus), composer avec les modèles, nouveau texto.
   - Paiements : demandes envoyées, payées (en ligne par Clover — 28 oct., remplace Stripe — ou au comptoir), relance, marquer payé.
   - Travaux refusés : les lignes refusées par les clients, à relancer plus tard.
   - Statistiques : par conseiller et par mois (envoyés, approuvés, taux, $ approuvés, délai de réponse, vues).
   Données : GET ?texto=1[&compagnie=] · ?textoEstime=1&id= · ?textoMessages=1&id= · ?textoPaiement=1&id= ; POST estime*, texto*, paiement* (Texto.gs).
   Règle : rien ne part sans un clic (le suivi de courtoisie automatique est un réglage de la direction, OFF par défaut). */
(function () {
  'use strict';
  var h = AMX.h, I = AMX.icones;

  var STATUTS = { brouillon: 'Brouillon', envoye: 'En attente', vu: 'Vu par le client', approuve: 'Approuvé', partiel: 'Partiellement approuvé', decline: 'Décliné', expire: 'Expiré', annule: 'Annulé' };
  var COULEUR = { brouillon: 'gris', envoye: 'ambre', vu: 'bleu', approuve: 'vert', partiel: 'sarcelle', decline: 'rouge', expire: 'gris', annule: 'gris' };
  /* 28 oct. : type de chaque pièce (exigé sur l'estimé au Québec) et taxes de la province de la concession (le serveur envoie
     cfg.taxesListe et cfg.province ; un script d'avant n'en envoie pas : TPS + TVQ comme avant). */
  var TYPES_PIECE = { neuve: 'Neuve', usagee: 'Usagée', reusinee: 'Réusinée', remise: 'Remise à neuf' };
  var TAXES_PROVINCE = { QC: [{ nom: 'TPS', libelle: 'TPS 5 %', taux: 0.05 }, { nom: 'TVQ', libelle: 'TVQ 9,975 %', taux: 0.09975 }], ON: [{ nom: 'TVH', libelle: 'TVH 13 %', taux: 0.13 }] };
  /* 28 oct. — pastille d'initiales colorée par client (couleur stable : tirée du nom ou du numéro), comme dans Kimoby. */
  var COULEURS_AV = ['#0F7A43', '#1A64BF', '#7C3AED', '#C2410C', '#0B7189', '#B42318', '#4D7C0F', '#A21CAF', '#9A6700', '#3730A3', '#0E7490', '#BE185D'];
  function initiales(nom) { var m = String(nom || '').replace(/[^A-Za-zÀ-ÿ' -]/g, ' ').trim().split(/\s+/).filter(Boolean); if (!m.length) return ''; return (m[0].charAt(0) + (m.length > 1 ? m[m.length - 1].charAt(0) : (m[0].charAt(1) || ''))).toUpperCase(); }
  function avatar(nom, cle, petit) {
    var ini = initiales(nom), k = String(cle || nom || ''), hsh = 0; for (var i = 0; i < k.length; i++) hsh = (hsh * 31 + k.charCodeAt(i)) >>> 0;
    var el = h('span.txt-av' + (petit ? '.petit' : '') + (ini ? '' : '.inconnu'), { text: ini || '#', 'aria-hidden': 'true' });
    if (ini) el.style.background = COULEURS_AV[hsh % COULEURS_AV.length];
    return el;
  }
  var SVG = function (d) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>'; };
  var ICO_NAV = {
    conversations: SVG('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>'),
    estimes: SVG('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>'),
    paiements: SVG('<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/>'),
    refuses: SVG('<circle cx="12" cy="12" r="9"/><path d="M8.5 8.5l7 7"/>'),
    clients: SVG('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
    campagnes: SVG('<path d="M3 11v2a2 2 0 0 0 2 2h2l5 4V5L7 9H5a2 2 0 0 0-2 2zM16 8a5 5 0 0 1 0 8"/>'),
    autos: SVG('<path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5"/>'),
    stats: SVG('<path d="M5 20V11M12 20V5M19 20v-7"/>'),
    reglages: SVG('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    alertes: SVG('<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/>'),
    tel: SVG('<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>')
  };
  var ICO_STATUT = { brouillon: '✎', envoye: '◷', vu: '◉', approuve: '✓', partiel: '◐', decline: '✕', expire: '⌛', annule: '⊘', en_attente: '◷', paye: '✓', rembourse: '↺' };
  /* 28 oct. (étape 2) : un client attend une réponse quand son texto est le dernier de la conversation depuis 10 minutes ou plus
     (une réponse automatique — confirmation d'un OUI, AIDE — compte comme une réponse). */
  var ATTENTE_MIN = 10;
  function minutesSansReponse(c, maintenant) {
    if (!c || c.etat === 'fermee' || c.stop || c.dernierSens !== 'entrant' || !c.dernierLe) return 0;
    var m = Math.floor(((maintenant || Date.now()) - new Date(c.dernierLe).getTime()) / 60000);
    return m >= ATTENTE_MIN ? m : 0;
  }
  function dureeAttente(m) { return m < 60 ? m + ' min' : (m < 1440 ? Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) : '') : Math.floor(m / 1440) + ' j'); }
  function estMoi(courriel) { var moi = String((AMX.session && AMX.session.courriel) || '').toLowerCase(); return !!moi && String(courriel || '').toLowerCase() === moi; }
  function taxesDe(cfg) { if (cfg && cfg.taxesListe && cfg.taxesListe.length) return cfg.taxesListe; return TAXES_PROVINCE[(cfg && cfg.province) || 'QC'] || TAXES_PROVINCE.QC; }
  var URGENCES = { urgent: 'Urgent', recommande: 'Recommandé', suggere: 'Suggéré' };
  var PAI_STATUTS = { en_attente: 'En attente', paye: 'Payé', annule: 'Annulé', rembourse: 'Remboursé' };
  var PAI_COULEUR = { en_attente: 'ambre', paye: 'vert', annule: 'gris', rembourse: 'violet' };
  var PAI_MOYENS = { en_ligne: 'En ligne (carte)', comptoir: 'Au comptoir', telephone: 'Carte au téléphone', virement: 'Virement / Interac', autre: 'Autre' };
  var FILTRES = [['', 'Tous'], ['attente', 'À approuver'], ['approuve', 'Approuvés'], ['partiel', 'Partiels'], ['decline', 'Déclinés'], ['brouillon', 'Brouillons'], ['termine', 'Terminés'], ['expire', 'Expirés']];
  var LIEN_ESTIME = 'https://groupeautomax.github.io/inventaireus/service/estime.html';
  var MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

  /* ------------------------------------------------------------------ utilitaires */
  function telChiffres(x) { var s = String(x || '').replace(/[^\d]/g, ''); if (s.length === 11 && s.charAt(0) === '1') s = s.slice(1); return s; }
  function telJoli(x) { var s = telChiffres(x); return s.length === 10 ? s.slice(0, 3) + ' ' + s.slice(3, 6) + '-' + s.slice(6) : String(x || ''); }
  function num(x) { var n = Number(String(x === undefined || x === null ? '' : x).replace(/\s/g, '').replace(/[^\d.,-]/g, '').replace(',', '.')); return isNaN(n) ? 0 : n; }
  function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function argent(n) { return AMX.fmtArgent(r2(n), 2); }
  function nomCie(c) { return AMX.COMPAGNIES_TOUTES[c] || c || 'Numéro inconnu'; }
  function prenom(nom) { return String(nom || '').trim().split(/\s+/)[0] || ''; }
  function quand(iso) { if (!iso) return ''; var d = new Date(iso); if (isNaN(d)) return ''; var auj = new Date(); var meme = d.toDateString() === auj.toDateString(); return meme ? d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' }) : d.getDate() + ' ' + MOIS[d.getMonth()] + (d.getFullYear() !== auj.getFullYear() ? ' ' + d.getFullYear() : '') + ' ' + d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' }); }
  function duree(min) { if (min === null || min === undefined) return '—'; min = Math.round(min); if (min < 60) return min + ' min'; if (min < 48 * 60) return Math.floor(min / 60) + ' h ' + String(min % 60).padStart(2, '0'); return Math.round(min / 1440) + ' j'; }
  function nomCourt(courriel) { var s = String(courriel || ''); if (!s) return ''; if (s.indexOf('@') < 0) return s; return s.split('@')[0].split(/[._]/).map(function (x) { return x.charAt(0).toUpperCase() + x.slice(1); }).join(' '); }
  function zoneTexte(attrs, valeur) { var t = h('textarea.saisie', attrs); t.value = valeur || ''; return t; }
  function lienEstime(e) { return e.lien || (LIEN_ESTIME + '?e=' + encodeURIComponent(e.id) + '&k=' + encodeURIComponent(e.code || '')); }
  function joursDepuis(iso) { return iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null; }
  function gabarit(texte, v, langue) { return String(texte || '').replace(/\{(\w+)\}/g, function (m, k) { if (k === 'bt') return v.bt ? (langue === 'en' ? ' (work order ' : ' (bon de travail ') + v.bt + ')' : ''; if (k === 'vehicule' && !v.vehicule) return langue === 'en' ? 'vehicle' : 'véhicule'; return v[k] !== undefined && v[k] !== null && v[k] !== '' ? String(v[k]) : m; }).replace(/\s{2,}/g, ' ').replace(/\s+([.,])/g, '$1').trim(); }
  /* 28 oct. : le client a demandé l'anglais (TextoLangue.gs) — modèles anglais et montants à l'anglaise ; sinon le français. */
  function argentL(n, langue) { if (langue !== 'en') return argent(n); return '$' + r2(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function modeleL(cfg, id, langue) { var fr = ((cfg && cfg.modeles) || []).filter(function (m) { return m.id === id; })[0]; if (langue !== 'en') return fr; return ((cfg && cfg.modelesEn) || []).filter(function (m) { return m.id === id; })[0] || fr; }
  var CANAUX_LANGUE = { texto: 'par texto', page: 'sur la page web', conseiller: 'au conseiller', telephone: 'au téléphone', comptoir: 'au comptoir', fiche: 'dans la fiche client' };
  function avisLangue(langue, info) { if (langue !== 'en') return null; return h('div.txt-langue', { text: '🇬🇧 Client anglophone : le texto part en anglais' + (info && info.langueLe ? ' (demandé ' + (CANAUX_LANGUE[info.langueCanal] || '') + ' ' + quand(info.langueLe) + ')' : '') + '.' }); }
  /* Photo : réduite à 1600 px, JPEG 0,82 (comme l'inspection du carnet). */
  function reduireImage(fichier) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(fichier), img = new Image();
      img.onload = function () { try { var max = 1600, k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res({ base64: c.toDataURL('image/jpeg', 0.82), mime: 'image/jpeg' }); } catch (e) { rej(e); } };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('Image illisible')); };
      img.src = url;
    });
  }
  function lireBase64(blob) { return new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(String(fr.result)); }; fr.onerror = function () { rej(new Error('Lecture impossible')); }; fr.readAsDataURL(blob); }); }

  /* ------------------------------------------------------------------ styles */
  var STYLE = [
    '.txt-page .txt-outils { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin: 0 0 12px; }',
    '.txt-page .txt-outils .recherche { flex: 1 1 240px; display: flex; align-items: center; gap: 8px; } .txt-page .txt-outils .recherche input { flex: 1; }',
    '.txt-page .filtres { display: flex; gap: 4px; flex-wrap: wrap; }',
    '.txt-page .filtres button { border: 1px solid var(--ligne); background: #fff; border-radius: 999px; padding: 3px 10px; font-size: 12px; color: var(--encre-2); cursor: pointer; }',
    '.txt-page .filtres button.actif { background: var(--noir-2); color: #fff; border-color: var(--noir-2); } .txt-page .filtres button .n { opacity: .7; margin-left: 4px; font-variant-numeric: tabular-nums; }',
    '.txt-page .tableau td.ref { font-family: var(--mono); font-weight: 600; white-space: nowrap; } .txt-page .tableau td .sous { display: block; font-size: 12px; color: var(--encre-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px; }',
    '.txt-page .tableau .vues { font-size: 12px; color: var(--encre-3); margin-left: 6px; white-space: nowrap; }',
    '.txt-page .tableau tr.attention td { background: #fffaf0; }',
    '.txt-page .tableau .ico-refus { color: var(--rouge); } .txt-page .tableau .ico-ok { color: var(--vert); }',
    '.txt-conv { display: grid; grid-template-columns: 340px 1fr; gap: 12px; align-items: start; min-height: 420px; }',
    '@media (max-width: 860px) { .txt-conv { grid-template-columns: 1fr; } .txt-conv .txt-fil.cache-mobile { display: none; } .txt-conv .txt-liste.cache-mobile { display: none; } }',
    '.txt-liste { background: var(--carte); border: 1px solid var(--ligne); border-radius: var(--rayon); max-height: 70vh; overflow: auto; }',
    '.txt-liste .item { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; padding: 9px 12px; border-bottom: 1px solid var(--ligne); cursor: pointer; }',
    '.txt-liste .item:hover { background: var(--carte-2); } .txt-liste .item.actif { background: var(--vert-clair); }',
    '.txt-liste .item.attend { box-shadow: inset 3px 0 0 var(--rouge); } .txt-liste .item .attente { color: var(--rouge); font-weight: 700; font-size: 12px; white-space: nowrap; }',
    '.txt-liste .seg-conv { display: flex; gap: 4px; padding: 8px; border-bottom: 1px solid var(--ligne); position: sticky; top: 0; background: var(--carte); z-index: 1; } .txt-liste .seg-conv button { flex: 1; padding: 5px 6px; font: inherit; font-size: 12px; border: 1px solid var(--ligne); border-radius: 999px; background: var(--carte); color: var(--encre-2); cursor: pointer; } .txt-liste .seg-conv button.actif { background: var(--vert); border-color: var(--vert); color: #fff; } .txt-liste .seg-conv button.rouge:not(.actif) { color: var(--rouge); border-color: var(--rouge); font-weight: 700; }',
    '.txt-liste .item .nom { font-weight: 600; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .txt-liste .item.nonlu .nom { font-weight: 800; }',
    '.txt-liste .item .q { font-size: 12px; color: var(--encre-3); white-space: nowrap; }',
    '.txt-liste .item .apercu { grid-column: 1 / -1; font-size: 12px; color: var(--encre-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .txt-liste .item.nonlu .apercu { color: var(--encre); }',
    '.txt-liste .item .badge-nonlu { display: inline-block; min-width: 18px; height: 18px; line-height: 18px; text-align: center; border-radius: 9px; background: var(--rouge); color: #fff; font-size: 12px; font-weight: 700; padding: 0 5px; margin-left: 6px; }',
    '.txt-liste .item .cie { font-size: 12px; color: var(--encre-4); text-transform: uppercase; letter-spacing: .04em; } .txt-liste .item .stop { color: var(--rouge); font-weight: 700; font-size: 12px; }',
    '.txt-fil { background: var(--carte); border: 1px solid var(--ligne); border-radius: var(--rayon); display: flex; flex-direction: column; max-height: 70vh; min-height: 420px; }',
    '.txt-fil .tete { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid var(--ligne); flex-wrap: wrap; } .txt-fil .tete .nom { font-weight: 700; font-size: 14px; } .txt-fil .tete .d { color: var(--encre-3); font-size: 12px; } .txt-fil .tete .actions { margin-left: auto; display: flex; gap: 6px; flex-wrap: wrap; }',
    '.txt-fil .messages { flex: 1; overflow: auto; padding: 14px; display: flex; flex-direction: column; gap: 8px; background: var(--fond); }',
    '.txt-fil .bulle { max-width: 78%; padding: 8px 12px; border-radius: 14px; font-size: 13px; line-height: 1.4; white-space: pre-wrap; word-break: break-word; position: relative; }',
    '.txt-fil .bulle.entrant { align-self: flex-start; background: #fff; border: 1px solid var(--ligne); border-bottom-left-radius: 4px; }',
    '.txt-fil .bulle.sortant { align-self: flex-end; background: var(--vert); color: #fff; border-bottom-right-radius: 4px; } .txt-fil .bulle.sortant a { color: #fff; text-decoration: underline; }',
    '.txt-fil .bulle.sortant.automatique { background: var(--noir-2); } .txt-fil .bulle.echec { background: var(--rouge-bg); color: var(--rouge); border: 1px solid var(--rouge-bord); }',
    '.txt-fil .bulle .meta { display: block; font-size: 12px; opacity: .75; margin-top: 3px; }',
    '.txt-fil .jour { align-self: center; font-size: 12px; color: var(--encre-4); background: var(--gris-bg); padding: 2px 10px; border-radius: 999px; margin: 4px 0; }',
    '.txt-fil .composer { border-top: 1px solid var(--ligne); padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; }',
    '.txt-fil .composer .rangee { display: flex; gap: 6px; align-items: flex-end; } .txt-fil .composer textarea { flex: 1; min-height: 44px; height: 44px; }',
    '.txt-langue { margin: 0 0 8px; padding: 6px 10px; border-radius: 8px; background: #eef4ff; color: #1e3a8a; font-size: 12.5px; } .txt-fil .tete select.langue { height: 27px; font-size: 12px; width: auto; min-width: 0; flex: 0 0 auto; }',
    '.txt-fil .composer .modeles { display: flex; gap: 4px; flex-wrap: wrap; } .txt-fil .composer .modeles button { font-size: 12px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--ligne); background: #fff; cursor: pointer; color: var(--encre-2); } .txt-fil .composer .modeles button:hover { background: var(--carte-2); }',
    '.txt-fil .composer .compte { font-size: 12px; color: var(--encre-4); text-align: right; }',
    '.txt-fil .stop-bandeau { background: var(--rouge-bg); color: var(--rouge); padding: 8px 12px; font-size: 12.5px; }',
    '.txt-fiche .entete { display: grid; grid-template-columns: 1fr auto; gap: 8px 16px; align-items: start; margin-bottom: 10px; }',
    '.txt-fiche .entete .titre { font-size: 15px; font-weight: 700; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; } .txt-fiche .entete .sous { color: var(--encre-3); font-size: 12.5px; margin-top: 2px; }',
    '.txt-fiche .entete .suivi { font-size: 12px; color: var(--encre-2); text-align: right; line-height: 1.5; } .txt-fiche .entete .suivi b { color: var(--encre); }',
    '.txt-fiche .grille { margin-bottom: 10px; }',
    '.txt-fiche .lignes { display: flex; flex-direction: column; gap: 10px; margin: 8px 0; }',
    '.txt-ligne { border: 1px solid var(--ligne); border-left: 4px solid var(--gris); border-radius: 10px; padding: 10px 12px; background: #fff; }',
    '.txt-ligne.u-urgent { border-left-color: var(--rouge); } .txt-ligne.u-recommande { border-left-color: var(--ambre); } .txt-ligne.u-suggere { border-left-color: var(--bleu); }',
    '.txt-ligne.e-approuve { background: #f3fbf6; } .txt-ligne.e-refuse { background: #fff5f4; opacity: .9; } .txt-ligne.p-couvert .total { color: var(--encre-3); font-weight: 600; }',
    '.txt-ligne .rangee1 { display: grid; grid-template-columns: 150px 1fr 120px auto auto; gap: 6px; align-items: center; } @media (max-width: 760px) { .txt-ligne .rangee1 { grid-template-columns: 1fr 1fr; } }',
    '.txt-ligne .rangee1 .total { font-weight: 700; font-size: 14px; white-space: nowrap; min-width: 92px; text-align: right; font-variant-numeric: tabular-nums; }',
    '.txt-ligne .etat-ligne { font-size: 12px; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: var(--gris-bg); color: var(--encre-3); white-space: nowrap; }',
    '.txt-ligne .etat-ligne.approuve { background: var(--vert-clair); color: var(--vert); } .txt-ligne .etat-ligne.refuse { background: var(--rouge-bg); color: var(--rouge); }',
    '.txt-ligne .detail { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 14px; margin-top: 8px; } @media (max-width: 760px) { .txt-ligne .detail { grid-template-columns: 1fr; } }',
    '.txt-ligne .bloc-mo, .txt-ligne .bloc-pieces, .txt-ligne .bloc-frais { font-size: 12px; } .txt-ligne .bloc-pieces, .txt-ligne .bloc-desc { grid-column: 1 / -1; }',
    '.txt-ligne .bloc h5 { margin: 0 0 4px; font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--encre-3); display: flex; align-items: center; gap: 8px; } .txt-ligne .bloc h5 .btn { text-transform: none; letter-spacing: 0; }',
    '.txt-ligne .mo { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; } .txt-ligne .mo input { width: 86px; } .txt-ligne .mo select { width: auto; } .txt-ligne .mo .eq { color: var(--encre-3); }',
    '.txt-ligne table.pieces { width: 100%; border-collapse: collapse; } .txt-ligne table.pieces td { padding: 2px 3px; } .txt-ligne table.pieces input { height: 28px; font-size: 12px; } .txt-ligne table.pieces td.n input { width: 56px; text-align: right; } .txt-ligne table.pieces td.p input { width: 86px; text-align: right; } .txt-ligne table.pieces td.t { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; width: 90px; } .txt-ligne table.pieces td.ty select { width: 118px; height: 28px; font-size: 12px; } .txt-manques { color: var(--ambre); font-size: 12.5px; margin: 6px 0; font-weight: 600; }',
    '.txt-ligne .medias { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; } .txt-ligne .media { position: relative; width: 84px; height: 64px; border-radius: 8px; overflow: hidden; border: 1px solid var(--ligne); background: var(--carte-2); cursor: pointer; } .txt-ligne .media img { width: 100%; height: 100%; object-fit: cover; display: block; }',
    '.txt-ligne .media .lecture { position: absolute; inset: 0; display: grid; place-items: center; color: #fff; font-size: 22px; text-shadow: 0 1px 4px rgba(0,0,0,.6); pointer-events: none; } .txt-ligne .media .retirer { position: absolute; top: 2px; right: 2px; width: 18px; height: 18px; border-radius: 50%; border: none; background: rgba(0,0,0,.6); color: #fff; font-size: 12px; line-height: 18px; padding: 0; cursor: pointer; }',
    '.txt-ligne .media.ajout { display: grid; place-items: center; font-size: 12px; color: var(--encre-3); text-align: center; border-style: dashed; }',
    '.txt-ligne .reponse { display: flex; gap: 4px; } .txt-ligne .reponse button { font-size: 12px; }',
    '.txt-fiche .totaux { display: grid; grid-template-columns: 1fr auto; gap: 2px 18px; font-size: 13px; margin: 10px 0; justify-content: end; max-width: 360px; margin-left: auto; } .txt-fiche .totaux .t { font-weight: 700; font-size: 15px; border-top: 1px solid var(--ligne); padding-top: 4px; } .txt-fiche .totaux .a { color: var(--vert); font-weight: 700; } .txt-fiche .totaux span:nth-child(even) { text-align: right; font-variant-numeric: tabular-nums; }',
    '.txt-fiche .actions-fiche { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--ligne); }',
    '.txt-fiche .journal { font-size: 12px; color: var(--encre-3); margin-top: 10px; max-height: 140px; overflow: auto; } .txt-fiche .journal div { padding: 2px 0; border-bottom: 1px dashed var(--ligne); } .txt-fiche .journal b { color: var(--encre-2); font-weight: 600; font-family: var(--mono); font-size: 12px; }',
    '.txt-fiche .etapes { display: flex; gap: 0; margin: 8px 0 12px; flex-wrap: wrap; } .txt-fiche .etapes span { font-size: 12px; padding: 3px 10px; background: var(--gris-bg); color: var(--encre-3); border-right: 2px solid #fff; } .txt-fiche .etapes span:first-child { border-radius: 999px 0 0 999px; } .txt-fiche .etapes span:last-child { border-radius: 0 999px 999px 0; } .txt-fiche .etapes span.fait { background: var(--vert-clair); color: var(--vert); font-weight: 600; } .txt-fiche .etapes span.courant { background: var(--noir-2); color: #fff; font-weight: 600; }',
    '.txt-envoi p { margin: 0 0 10px; color: var(--encre-2); } .txt-envoi .apercu { background: var(--carte-2); border-radius: 8px; padding: 8px 10px; font-size: 12.5px; white-space: pre-wrap; margin: 6px 0; }',
    '.txt-envoi input[type="checkbox"], .txt-reglages input[type="checkbox"], .txt-fiche input[type="checkbox"] { width: 16px; height: 16px; flex: none; margin: 0; padding: 0; accent-color: var(--vert); }',
    '.txt-reglages .modeles-liste { display: flex; flex-direction: column; gap: 6px; } .txt-reglages .modele { display: grid; grid-template-columns: 170px 1fr auto; gap: 6px; align-items: start; } .txt-reglages .modele textarea { min-height: 52px; } @media (max-width: 700px) { .txt-reglages .modele { grid-template-columns: 1fr; } }',
    '.txt-reglages h4 { margin: 14px 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--encre-3); } .txt-reglages .aide { font-size: 12px; color: var(--encre-4); }',
    '.txt-stats table.tableau td.num { text-align: right; } .txt-stats h4 { margin: 14px 0 6px; font-size: 13px; }',
    '.txt-page .refus-ligne .quand { color: var(--encre-3); font-size: 12px; }',
    '.txt-page .vide-petit { padding: 24px; text-align: center; color: var(--encre-3); background: var(--carte); border: 1px dashed var(--ligne-forte); border-radius: var(--rayon); }',
    '.txt-fil .bulle-medias { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 4px; } .txt-fil .bulle-medias .bm { position: relative; width: 120px; height: 90px; border-radius: 8px; overflow: hidden; background: rgba(0,0,0,.08); display: block; } .txt-fil .bulle-medias img { width: 100%; height: 100%; object-fit: cover; display: block; } .txt-fil .bulle-medias .lecture { position: absolute; inset: 0; display: grid; place-items: center; color: #fff; font-size: 26px; text-shadow: 0 1px 4px rgba(0,0,0,.6); }',
    '.txt-fil .composer .btn-media { align-self: flex-end; height: 38px; padding: 0 10px; font-size: 18px; line-height: 1; }',
    /* 28 oct. — allure à la Kimoby : menu à gauche avec compteurs, pastilles d'initiales, statuts en couleur, pleine hauteur */
    '.txt-app .entete-page { margin-bottom: 10px; } .txt-app .entete-page h1 { font-size: 22px; } .txt-app .entete-page p { font-size: 13px; color: var(--encre-3); margin-top: 2px; }',
    '.txt-cadre { display: grid; grid-template-columns: 214px minmax(0, 1fr); gap: 18px; align-items: start; }',
    '.txt-nav { position: sticky; top: calc(var(--barre-h, 62px) + 12px); display: flex; flex-direction: column; gap: 2px; background: var(--carte); border: 1px solid var(--ligne); border-radius: 14px; padding: 8px; }',
    '.txt-nav button { display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 10px; border: 0; background: none; border-radius: 10px; font: inherit; font-size: 14px; color: var(--encre-2); cursor: pointer; text-align: left; }',
    '.txt-nav button svg { width: 18px; height: 18px; flex: none; color: var(--encre-4); } .txt-nav button:hover { background: var(--carte-2); }',
    '.txt-nav button.actif { background: var(--vert-clair); color: var(--vert-fonce); font-weight: 650; } .txt-nav button.actif svg { color: var(--vert); }',
    '.txt-nav .n { margin-left: auto; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px; font-size: 12px; font-weight: 700; line-height: 20px; text-align: center; background: var(--gris-bg); color: var(--encre-3); }',
    '.txt-nav .n.rouge { background: var(--rouge); color: #fff; } .txt-nav .n.ambre { background: var(--ambre-bg); color: var(--ambre); } .txt-nav .n:empty { display: none; }',
    '.txt-nav .sep { height: 1px; background: var(--ligne); margin: 6px 4px; }',
    '@media (max-width: 860px) { .txt-cadre { grid-template-columns: 1fr; gap: 10px; } .txt-nav { position: static; flex-direction: row; overflow-x: auto; padding: 6px; } .txt-nav button { width: auto; white-space: nowrap; padding: 7px 10px; } .txt-nav .sep { display: none; } }',
    '.txt-av { display: inline-grid; place-items: center; width: 38px; height: 38px; border-radius: 50%; color: #fff; font-size: 13px; font-weight: 700; flex: none; letter-spacing: .02em; text-transform: uppercase; }',
    '.txt-av.petit { width: 30px; height: 30px; font-size: 11.5px; } .txt-av.inconnu { background: var(--gris-bg) !important; color: var(--encre-3); }',
    '.txt-app .txt-outils { margin-bottom: 10px; } .txt-app .kpis { margin-bottom: 12px; }',
    '.txt-app .txt-conv { grid-template-columns: 350px minmax(0, 1fr); gap: 14px; }',
    '.txt-app .txt-liste, .txt-app .txt-fil { height: calc(100vh - var(--barre-h, 62px) - 210px); min-height: 480px; max-height: none; border-radius: 14px; }',
    '.txt-app .txt-liste .item { grid-template-columns: 40px minmax(0, 1fr) auto; gap: 2px 10px; padding: 12px 14px; align-items: center; }',
    '.txt-app .txt-liste .item > .txt-av { grid-row: span 3; align-self: start; }',
    '.txt-app .txt-liste .item .nom { font-size: 14px; } .txt-app .txt-liste .item .apercu, .txt-app .txt-liste .item .cie { grid-column: 2 / -1; }',
    '.txt-app .txt-liste .item .tel { grid-column: 2 / -1; font-size: 12.5px; color: var(--encre-3); display: flex; align-items: center; gap: 4px; }',
    '.txt-app .txt-liste .item .apercu { font-size: 13px; margin-top: 2px; }',
    '.txt-app .txt-liste .item .attente::before { content: ""; display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--rouge); margin-right: 5px; vertical-align: 1px; }',
    '.txt-app .txt-liste .item.attend { box-shadow: none; background: #fff6f5; } .txt-app .txt-liste .item.attend.actif, .txt-app .txt-liste .item.actif { background: var(--vert-clair); box-shadow: inset 3px 0 0 var(--vert); }',
    '.txt-app .txt-fil .tete { padding: 12px 16px; gap: 12px; } .txt-app .txt-fil .tete .nom { font-size: 16px; } .txt-app .txt-fil .messages { padding: 18px 20px; gap: 10px; }',
    '.txt-app .txt-fil .bulle { font-size: 14px; padding: 9px 13px; border-radius: 16px; } .txt-app .txt-fil .bulle.entrant { background: #fff; box-shadow: 0 1px 2px rgba(16,24,40,.06); }',
    '.txt-app .txt-fil .composer { padding: 12px 14px; background: var(--carte); border-radius: 0 0 14px 14px; }',
    '.txt-app .tableau { background: var(--carte); border-radius: 14px; overflow: hidden; } .txt-app .tableau th { font-size: 11px; letter-spacing: .07em; text-transform: uppercase; color: var(--encre-3); font-weight: 700; }',
    '.txt-app .tableau td { vertical-align: middle; } .txt-app .tableau td.client-cell > div { display: flex; align-items: center; gap: 10px; min-width: 0; } .txt-app .tableau td.client-cell .txt-av { width: 30px; height: 30px; font-size: 11.5px; }',
    '.txt-app .tableau td.client-cell .t { min-width: 0; } .txt-app .tableau td.client-cell b { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    '.txt-app .tableau td.statut-cell { font-weight: 650; font-size: 13px; white-space: nowrap; } .txt-app .tableau td.statut-cell .ic { margin-right: 6px; }',
    '.txt-app .tableau td.s-brouillon { background: var(--bleu-bg); color: var(--bleu); } .txt-app .tableau td.s-envoye, .txt-app .tableau td.s-en_attente { background: var(--ambre-bg); color: var(--ambre); }',
    '.txt-app .tableau td.s-vu { background: var(--bleu-bg); color: var(--bleu); } .txt-app .tableau td.s-approuve, .txt-app .tableau td.s-paye { background: var(--vert-clair); color: var(--vert-fonce); }',
    '.txt-app .tableau td.s-partiel { background: #E6F6F7; color: #0B7189; } .txt-app .tableau td.s-decline { background: var(--rouge-bg); color: var(--rouge); }',
    '.txt-app .tableau td.s-expire, .txt-app .tableau td.s-annule, .txt-app .tableau td.s-rembourse { background: var(--gris-bg); color: var(--gris); }',
    '.txt-app .tableau td.statut-cell .vues { color: inherit; opacity: .8; font-weight: 500; }',
    '.voile.txt-pleine .modale { width: min(1180px, 96vw); max-width: none; } .voile.txt-pleine .modale-corps { padding-bottom: 0; }',
    '.txt-fiche .totaux.barre-totaux { position: sticky; bottom: 0; z-index: 3; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px 26px; max-width: none; margin: 14px -18px 0; padding: 12px 18px; background: var(--carte); border-top: 1px solid var(--ligne); box-shadow: 0 -8px 14px -12px rgba(16,24,40,.35); }',
    '.txt-fiche .totaux.barre-totaux .paire { display: flex; flex-direction: column; align-items: flex-end; line-height: 1.25; } .txt-fiche .totaux.barre-totaux .paire > span:first-child { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--encre-3); }',
    '.txt-fiche .totaux.barre-totaux .paire > span:last-child { font-size: 15px; font-weight: 650; font-variant-numeric: tabular-nums; } .txt-fiche .totaux.barre-totaux .paire.t > span:last-child { font-size: 19px; font-weight: 800; } .txt-fiche .totaux.barre-totaux .paire.a > span { color: var(--vert-fonce); }',
    '.txt-fiche .entete .client-tete { display: flex; align-items: center; gap: 10px; }',
    '.voile.txt-pleine .txt-ligne .rangee1 { grid-template-columns: 180px minmax(180px, 1fr) 250px auto auto; } .voile.txt-pleine .txt-ligne .rangee1 > div:nth-child(3) select { flex: 1; min-width: 0; }',
    '@media (max-width: 980px) { .voile.txt-pleine .txt-ligne .rangee1 { grid-template-columns: 1fr 1fr; } }',
    '.txt-app .tableau td.ref .sous { font-family: inherit; font-weight: 400; letter-spacing: 0; }',
    '@media (max-width: 640px) { .txt-app .txt-outils .compte { display: none; } .txt-app .txt-liste, .txt-app .txt-fil { height: calc(100vh - var(--barre-h, 54px) - 260px); min-height: 420px; } }',
    '.txt-app .txt-liste .item .cie { text-transform: none; letter-spacing: 0; font-size: 12px; color: var(--encre-4); }',
    '.txt-app .txt-fil .vide-fil { margin: auto; text-align: center; color: var(--encre-3); display: flex; flex-direction: column; align-items: center; gap: 10px; } .txt-app .txt-fil .vide-fil svg { width: 34px; height: 34px; color: var(--encre-4); }',
    /* 29 oct. : un seul lien par visite — l'inspection en couleurs dans la fiche de l'estimé */
    '.txt-insp { border: 1px solid var(--ligne); border-radius: 12px; padding: 10px 12px; margin: 6px 0 12px; background: #fff; }',
    '.txt-insp > summary { cursor: pointer; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 14px; list-style: revert; }',
    '.txt-insp .resume { display: inline-flex; gap: 6px; flex-wrap: wrap; font-size: 12px; } .txt-insp .resume span { padding: 1px 8px; border-radius: 999px; font-weight: 700; }',
    '.txt-insp .r-rouge { background: var(--rouge-bg); color: var(--rouge); } .txt-insp .r-jaune { background: var(--ambre-bg); color: var(--ambre); } .txt-insp .r-vert { background: var(--vert-clair); color: var(--vert-fonce); } .txt-insp .r-gris { background: var(--gris-bg); color: var(--encre-3); }',
    '.txt-insp .tete-insp { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 10px 0 4px; } .txt-insp .tete-insp .saisie { width: auto; max-width: 220px; }',
    '.txt-insp .cat { font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--encre-3); margin: 12px 0 2px; }',
    '.txt-insp .pt { display: grid; grid-template-columns: minmax(150px, 1.2fr) auto 110px minmax(120px, 1.5fr) 92px; gap: 6px; align-items: center; padding: 4px 6px; border-bottom: 1px dashed var(--ligne); border-radius: 6px; }',
    '.txt-insp .pt .lib { font-size: 13px; } .txt-insp .pt input { height: 30px; font-size: 12.5px; } .txt-insp .pt .btn { white-space: nowrap; }',
    '.txt-insp .pt.c-rouge { background: #fff4f3; } .txt-insp .pt.c-jaune { background: #fffaeb; }',
    '.txt-insp .coul { display: inline-flex; gap: 3px; } .txt-insp .coul button { width: 32px; height: 30px; border-radius: 8px; border: 1px solid var(--ligne); background: #fff; font-weight: 800; font-size: 13px; cursor: pointer; color: var(--encre-4); padding: 0; }',
    '.txt-insp .coul button.vert.actif { background: #12a150; border-color: #12a150; color: #fff; } .txt-insp .coul button.jaune.actif { background: #e8a400; border-color: #e8a400; color: #fff; } .txt-insp .coul button.rouge.actif { background: #d92d20; border-color: #d92d20; color: #fff; }',
    '.txt-insp .coul button:disabled { cursor: default; opacity: .7; }',
    '@media (max-width: 760px) { .txt-insp .pt { grid-template-columns: 1fr auto; } .txt-insp .pt input, .txt-insp .pt .btn { grid-column: 1 / -1; } }',
    '.txt-insp .medias { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; } .txt-insp .media { position: relative; width: 112px; height: 84px; border-radius: 8px; overflow: hidden; border: 1px solid var(--ligne); background: var(--carte-2); cursor: pointer; } .txt-insp .media img { width: 100%; height: 100%; object-fit: cover; display: block; }',
    '.txt-insp .media .lecture { position: absolute; inset: 0; display: grid; place-items: center; color: #fff; font-size: 24px; text-shadow: 0 1px 4px rgba(0,0,0,.6); pointer-events: none; } .txt-insp .media .retirer { position: absolute; top: 2px; right: 2px; width: 18px; height: 18px; border-radius: 50%; border: none; background: rgba(0,0,0,.6); color: #fff; font-size: 12px; line-height: 18px; padding: 0; cursor: pointer; }',
    '.txt-insp .media.ajout { display: grid; place-items: center; font-size: 12px; color: var(--encre-3); text-align: center; border-style: dashed; }',
    '.txt-insp .pied-insp { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; align-items: center; }'
  ].join('\n');
  if (!document.getElementById('txt-style')) { var st = document.createElement('style'); st.id = 'txt-style'; st.textContent = STYLE; document.head.appendChild(st); }

  /* ------------------------------------------------------------------ données */
  var cache = { cle: '', reponse: null, quand: 0, promesse: null, cleEnCours: '' };
  AMX.texto = {
    charger: function (cie, force) {
      var cle = cie || '';
      if (!force && cache.reponse && cache.cle === cle && Date.now() - cache.quand < 45000) return Promise.resolve(cache.reponse);
      if (cache.promesse && cache.cleEnCours === cle && !force) return cache.promesse;
      cache.cleEnCours = cle;
      var q = { texto: 1 }; if (cie) q.compagnie = cie;
      var promesse = AMX.get(q, { secours: false, copie: 'texto_' + (cie || 'tous') }).then(function (d) {
        if (cache.promesse === promesse) cache.promesse = null;
        if (!d || d.refuse) throw new Error((d && (d.erreur || d.message)) || 'Accès refusé.');
        if (d.ok === false) throw new Error(d.erreur || 'Réponse inattendue du serveur');
        if (!Array.isArray(d.estimes) || !d.configs) throw new Error('Module Texto indisponible — redéployez le script (Texto.gs).');
        cache.reponse = d; cache.cle = cle; cache.quand = Date.now();
        try { document.dispatchEvent(new CustomEvent('amx:texto')); } catch (e) {}
        return d;
      }, function (e) { if (cache.promesse === promesse) cache.promesse = null; throw e; });
      cache.promesse = promesse;
      return promesse;
    },
    copie: function (cie) { return AMX.cacheLocal.lireGz('texto_' + (cie || 'tous'), 2 * 86400000).then(function (o) { return o && o.donnees && Array.isArray(o.donnees.estimes) ? o : null; }).catch(function () { return null; }); },
    enCache: function () { return cache.reponse; },
    invalider: function () { cache.quand = 0; },
    compteur: function () {
      var d = cache.reponse; if (!d) return '';
      var c = AMX.compagnieChoisie('service');
      var nonLus = (d.conversations || []).filter(function (x) { return (!c || x.compagnie === c) && (x.nonLus > 0 || minutesSansReponse(x)); }).length;
      var attente = (d.estimes || []).filter(function (x) { return (!c || x.compagnie === c) && x.ouvert; }).length;
      return nonLus || attente || '';
    },
    /* clients qui attendent une réponse depuis 10 minutes ou plus (Accueil, compteur) */
    sansReponse: function (cie) { var d = cache.reponse; if (!d) return []; return (d.conversations || []).filter(function (x) { return (!cie || x.compagnie === cie) && minutesSansReponse(x); }); },
    monter: function (conteneur, ctx) { return new VueTexto(conteneur, ctx); },
    Vue: null,   /* posé plus bas : texto-plus.js étend VueTexto.prototype (clients, campagnes, automatisations, médias, métriques) */
    outils: { avatar: function (n, k, p) { return avatar(n, k, p); }, h: h, telChiffres: telChiffres, telJoli: telJoli, num: num, r2: r2, argent: argent, nomCie: nomCie, prenom: prenom, quand: quand, duree: duree, nomCourt: nomCourt, zoneTexte: zoneTexte, gabarit: gabarit, reduireImage: reduireImage, lireBase64: lireBase64, joursDepuis: joursDepuis }
  };

  /* ------------------------------------------------------------------ vue */
  function VueTexto(conteneur, ctx) {
    var self = this;
    this.conteneur = conteneur;
    this.compagnie = AMX.compagnieChoisie('service') || (AMX.codesPour('service').length === 1 ? AMX.codesPour('service')[0] : '');
    this.vue = AMX.memo.lire('txt_vue', 'conversations'); if (['estimes', 'conversations', 'paiements', 'refuses', 'clients', 'campagnes', 'autos', 'stats'].indexOf(this.vue) < 0) this.vue = 'conversations';
    this.filtre = ''; this.recherche = ''; this.convId = ''; this.messages = null;
    this.donnees = null; this.erreur = ''; this.generation = 0; this.detruit = false;
    this.construire();
    this.charger();
    this.surCompagnie = function () { if (self.detruit) return; var c = AMX.compagnieChoisie('service'); if (c !== self.compagnie) { self.compagnie = c; self.convId = ''; self.messages = null; self.charger(); } };
    document.addEventListener('amx:compagnie', this.surCompagnie);
    this.minuterie = setInterval(function () { if (!document.hidden && !self.enEcriture) { self.charger(); if (self.vue === 'conversations' && self.convId) self.chargerFil(self.convId, true); } }, 45000);
    this.surVisible = function () { if (!document.hidden) self.charger(); };
    document.addEventListener('visibilitychange', this.surVisible);
    var p = (ctx && ctx.params) || {};
    if (p.estime) setTimeout(function () { self.ouvrirEstime(p.estime); }, 400);
    else if (p.tel) { this.vue = 'conversations'; this.ouvrirTel = telChiffres(p.tel); }
    else if (p.nouveau === 'estime') setTimeout(function () { self.ouvrirEstime(null); }, 400);
    else if (p.nouveau === 'texto') setTimeout(function () { self.nouveauTexto(); }, 400);
    else if (p.paiement) setTimeout(function () { self.ouvrirPaiement(p.paiement); }, 400);
  }
  VueTexto.prototype.demonter = function () { this.detruit = true; clearInterval(this.minuterie); document.removeEventListener('amx:compagnie', this.surCompagnie); document.removeEventListener('visibilitychange', this.surVisible); };
  VueTexto.prototype.naviguer = function (ctx) { var p = (ctx && ctx.params) || {}; if (p.estime) this.ouvrirEstime(p.estime); else if (p.tel) { this.vue = 'conversations'; this.ouvrirTel = telChiffres(p.tel); this.rendre(); } else if (p.conv) { this.vue = 'conversations'; this.filtreConv = p.conv === 'attente' || p.conv === 'moi' ? p.conv : ''; this.rendre(); } };
  /* Nom d'un conseiller (id des réglages du carnet) ou d'un compte (courriel). */
  VueTexto.prototype.nomConseiller = function (cie, id) { var cfg = this.config(cie); var c = cfg && (cfg.conseillers || []).filter(function (x) { return x.id === id; })[0]; return c ? c.nom : nomCourt(id); };
  VueTexto.prototype.config = function (cie) { var d = this.donnees; cie = cie || this.compagnie; return (d && d.configs && (d.configs[cie] || (!cie && d.configs[Object.keys(d.configs)[0]]))) || null; };
  VueTexto.prototype.peutEcrire = function () { return !!(this.donnees && this.donnees.peutEcrire); };

  VueTexto.prototype.construire = function () {
    var self = this;
    AMX.vider(this.conteneur);
    this.elEtat = h('p', { text: 'Chargement…' });
    this.btnRafraichir = h('button.btn', { type: 'button', html: I.rafraichir + '<span>Rafraîchir</span>', onclick: function () { self.charger(true, true); } });
    this.btnReglages = h('button.btn.fantome', { type: 'button', text: 'Réglages', onclick: function () { self.ouvrirReglages(); } });
    this.btnAlertes = h('button.btn.fantome', { type: 'button', text: 'Mes alertes', title: 'Être prévenu par texto ou par courriel quand un client attend une réponse depuis 10 minutes', onclick: function () { self.mesAlertes(); } });
    this.btnTexto = h('button.btn', { type: 'button', text: 'Nouveau message', title: 'Envoyer un texto à un client', onclick: function () { self.nouveauTexto(); } });
    this.btnPaiement = h('button.btn', { type: 'button', text: '+ Paiement', title: 'Demande de paiement par texto', onclick: function () { self.nouveauPaiement(null); } });
    this.btnNouveau = h('button.btn.primaire', { type: 'button', text: '+ Nouvel estimé', onclick: function () { self.ouvrirEstime(null); } });
    this.elCies = h('div.barre-cies');
    this.elKpis = h('div.kpis');
    var choisir = function (v) { self.vue = v; AMX.memo.ecrire('txt_vue', v); self.filtre = ''; self.rendre(); };
    this.elSegAncien = h('div.segment', [['estimes', 'Estimés'], ['conversations', 'Conversations'], ['paiements', 'Paiements'], ['refuses', 'Travaux refusés'], ['clients', 'Clients'], ['campagnes', 'Campagnes'], ['autos', 'Automatisations'], ['stats', 'Statistiques']].map(function (s) { return h('button', { type: 'button', text: s[1], 'data-vue': s[0], onclick: function () { choisir(s[0]); } }); }));
    /* 28 oct. — menu à gauche, à la Kimoby : une ligne par vue, avec son compteur (non lus en rouge, à approuver en ambre). */
    this.elSeg = h('nav.txt-nav', { 'aria-label': 'Texto' });
    var entreeNav = function (v, titre) { return h('button', { type: 'button', 'data-vue': v, onclick: function () { choisir(v); } }, [h('span', { html: ICO_NAV[v] || '' }), h('span', { text: titre }), h('span.n', { 'data-n': v })]); };
    [['conversations', 'Conversations'], ['estimes', 'Estimés'], ['paiements', 'Paiements'], ['refuses', 'Travaux refusés'], ['clients', 'Clients'], ['campagnes', 'Campagnes'], ['autos', 'Automatisations'], ['stats', 'Statistiques']].forEach(function (x) { self.elSeg.appendChild(entreeNav(x[0], x[1])); });
    this.elSeg.appendChild(h('div.sep'));
    this.elNavReglages = h('button', { type: 'button', onclick: function () { self.ouvrirReglages(); } }, [h('span', { html: ICO_NAV.reglages }), h('span', 'Réglages')]);
    this.elSeg.appendChild(this.elNavReglages);
    this.elSeg.appendChild(h('button', { type: 'button', onclick: function () { self.mesAlertes(); } }, [h('span', { html: ICO_NAV.alertes }), h('span', 'Mes alertes')]));
    this.elRecherche = h('input.saisie', { type: 'search', placeholder: 'Client, téléphone, NIV, véhicule, BT, référence…', autocomplete: 'off', oninput: AMX.debounce(function (e) { self.recherche = e.target.value; self.rendreCorps(); }, 120) });
    this.elFiltres = h('div.filtres');
    this.elCompte = h('span.compte.doux');
    this.elOutils = h('div.txt-outils', [h('div.recherche', [h('span', { html: I.recherche }), this.elRecherche]), this.elFiltres, this.elCompte]);
    this.elCorps = h('div');
    var entete = h('div.entete-page', [
      h('div', { style: { minWidth: 0 } }, [h('h1', 'Texto'), this.elEtat]),
      h('div.actions', AMX.actionsEntete([this.btnRafraichir, this.btnTexto, this.btnPaiement, this.btnNouveau], [this.btnTexto, this.btnNouveau]))
    ]);
    this.conteneur.appendChild(h('div.page.txt-page.txt-app', [entete, this.elCies, h('div.txt-cadre', [this.elSeg, h('div.txt-zone', [this.elKpis, this.elOutils, this.elCorps])])]));
  };

  VueTexto.prototype.charger = function (force, annoncer) {
    var self = this, gen = ++this.generation;
    if (force) this.btnRafraichir.classList.add('occupe');
    if (!this.donnees) {
      this.elCorps.appendChild(AMX.chargeur('Texto'));
      AMX.texto.copie(this.compagnie).then(function (o) { if (gen !== self.generation || self.donnees || !o) return; self.donnees = o.donnees; self.rendre(); }).catch(function () {});
    }
    return AMX.texto.charger(this.compagnie, force).then(function (d) {
      if (gen !== self.generation || self.detruit) return;
      self.donnees = d; self.erreur = '';
      self.btnRafraichir.classList.remove('occupe');
      self.rendre();
      if (self.vue === 'conversations' && self.convId) self.chargerFil(self.convId, true);
      if (AMX.rafraichirSousBarre) AMX.rafraichirSousBarre();
      if (annoncer) AMX.toast('Texto mis à jour', 'ok');
    }).catch(function (e) {
      if (gen !== self.generation || self.detruit) return;
      self.btnRafraichir.classList.remove('occupe');
      self.erreur = AMX.erreurTexte(e); self.rendre();
      AMX.toast((self.donnees ? 'Texto : mise à jour impossible — ' : 'Impossible de charger Texto — ') + self.erreur, 'erreur');
    });
  };

  /* Estimés / conversations / paiements de la concession choisie, filtre et recherche. */
  VueTexto.prototype.liste = function (quoi) {
    var self = this, d = this.donnees, q = this.recherche.trim().toUpperCase(), qTel = telChiffres(q);
    if (!d) return [];
    var src = quoi === 'conversations' ? (d.conversations || []) : (quoi === 'paiements' ? (d.paiements || []) : (d.estimes || []));
    return src.filter(function (x) {
      if (self.compagnie && x.compagnie !== self.compagnie) return false;
      if (!q) return true;
      var champs = [x.id, x.client, x.telephone, x.telephoneJoli, x.vin, x.vehicule, x.btNo, x.plaque, x.estimeId, x.description, x.dernierTexte, nomCourt(x.conseiller), nomCourt(x.creePar)].join(' ').toUpperCase();
      return champs.indexOf(q) >= 0 || (qTel.length >= 4 && telChiffres(x.telephone).indexOf(qTel) >= 0);
    });
  };
  function filtreEstime(e, f) {
    if (!f) return e.statut !== 'annule';
    if (f === 'attente') return e.ouvert;
    if (f === 'termine') return !!e.termineLe;
    return e.statut === f;
  }

  VueTexto.prototype.rendre = function () {
    var self = this, d = this.donnees;
    if (!d) { if (this.erreur) { AMX.vider(this.elCorps); this.elCorps.appendChild(h('div.vide', [h('h3', 'Texto indisponible'), h('div', { text: this.erreur })])); this.elEtat.textContent = ''; } return; }
    AMX.barreConcessions(this.elCies, { domaine: 'service', valeur: this.compagnie, compte: function (code) { var n = (d.conversations || []).filter(function (c) { return (!code || c.compagnie === code) && c.nonLus > 0; }).length; return n || null; }, onchange: function (code) { self.compagnie = code; self.convId = ''; self.messages = null; self.charger(); } });
    this.btnReglages.classList.toggle('cache', !d.peutConfigurer);
    [this.btnTexto, this.btnPaiement, this.btnNouveau].forEach(function (b) { b.classList.toggle('cache', !d.peutEcrire); });
    var textos = d.textos || {};
    this.elEtat.textContent = (textos.actif ? 'Textos actifs' + (textos.numero ? ' · ' + telJoli(textos.numero) : '') + (d.reception && d.reception.actif ? ' · réponses reçues instantanément' : (textos.lectureInstallee ? ' · réponses lues chaque minute' : ' · lecture des réponses non installée (Outils › Comptes et droits › Échanges par texto)')) : 'Textos non configurés (Outils › Comptes et droits › Alertes)') + ' · ' + new Date(d.genereLe || Date.now()).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });
    [].forEach.call(this.elSeg.querySelectorAll('button[data-vue]'), function (b) { b.classList.toggle('actif', b.dataset.vue === self.vue); });
    this.elNavReglages.classList.toggle('cache', !d.peutConfigurer);
    this.majNav();
    this.elKpis.classList.toggle('cache', ['estimes', 'stats'].indexOf(this.vue) < 0);
    this.elOutils.classList.toggle('cache', ['clients', 'campagnes', 'autos'].indexOf(this.vue) >= 0);   /* ces vues ont leur propre barre */
    this.rendreKpis();
    this.rendreCorps();
  };
  /* compteurs du menu de gauche */
  VueTexto.prototype.majNav = function () {
    var convs = this.liste('conversations'), est = this.liste('estimes'), pais = this.liste('paiements'), m = Date.now();
    var attente = convs.filter(function (c) { return minutesSansReponse(c, m); }).length, nonLus = convs.filter(function (c) { return c.nonLus > 0; }).length;
    var pose = function (v, n, cls) { var el = this.elSeg.querySelector('.n[data-n="' + v + '"]'); if (!el) return; el.textContent = n ? String(n) : ''; el.className = 'n' + (cls && n ? '.' + cls : '').replace('.', ' '); }.bind(this);
    pose('conversations', attente || nonLus, attente ? 'rouge' : 'ambre');
    pose('estimes', est.filter(function (e) { return e.ouvert; }).length, 'ambre');
    pose('paiements', pais.filter(function (p) { return p.statut === 'en_attente'; }).length, '');
  };
  VueTexto.prototype.rendreKpis = function () {
    var self = this, est = this.liste('estimes'), convs = this.liste('conversations'), pais = this.liste('paiements');
    AMX.vider(this.elKpis);
    var kpi = function (valeur, libelle, opts) { opts = opts || {}; var k = h('button.kpi' + (opts.classe ? '.' + opts.classe : '') + (opts.actif ? '.actif' : ''), { type: 'button' }, [h('div.valeur', { text: valeur }), h('div.libelle', { text: libelle }), opts.sous ? h('div.sous', { text: opts.sous }) : null]); if (opts.onclick) k.addEventListener('click', opts.onclick); return k; };
    var attente = est.filter(function (e) { return e.ouvert; }), montantAttente = attente.reduce(function (a, e) { return a + (e.total || 0); }, 0);
    var depuis30 = function (e) { return joursDepuis(e.envoyeLe || e.creeLe) <= 30; };
    var repondus = est.filter(function (e) { return depuis30(e) && ['approuve', 'partiel', 'decline', 'expire'].indexOf(e.statut) >= 0; });
    var gagnes = repondus.filter(function (e) { return e.statut === 'approuve' || e.statut === 'partiel'; });
    var dollarsApprouves = est.filter(function (e) { return depuis30(e) && (e.statut === 'approuve' || e.statut === 'partiel'); }).reduce(function (a, e) { return a + (e.totalApprouve || 0); }, 0);
    var delais = est.filter(function (e) { return depuis30(e) && e.delaiMin !== null && e.delaiMin !== undefined; }).map(function (e) { return e.delaiMin; });
    var delaiMoy = delais.length ? delais.reduce(function (a, b) { return a + b; }, 0) / delais.length : null;
    var nonLus = convs.filter(function (c) { return c.nonLus > 0; }).length, sansRep = convs.filter(function (c) { return minutesSansReponse(c); }).length;
    var paiAttente = pais.filter(function (p) { return p.statut === 'en_attente'; }), paiMontant = paiAttente.reduce(function (a, p) { return a + (p.montant || 0); }, 0);
    this.elKpis.appendChild(kpi(attente.length, 'À approuver', { classe: attente.length ? 'attention' : '', sous: montantAttente ? argent(montantAttente) + ' en attente' : 'aucun estimé envoyé', actif: this.vue === 'estimes' && this.filtre === 'attente', onclick: function () { self.vue = 'estimes'; self.filtre = 'attente'; self.rendre(); } }));
    this.elKpis.appendChild(kpi(repondus.length ? Math.round(gagnes.length / repondus.length * 100) + ' %' : '—', 'Taux d\'approbation', { sous: '30 jours · ' + gagnes.length + ' sur ' + repondus.length, actif: this.vue === 'estimes' && this.filtre === 'approuve', onclick: function () { self.vue = 'estimes'; self.filtre = 'approuve'; self.rendre(); } }));
    this.elKpis.appendChild(kpi(argent(dollarsApprouves), 'Approuvés 30 j', { sous: 'avant taxes', classe: 'neutre' }));
    this.elKpis.appendChild(kpi(delaiMoy === null ? '—' : duree(delaiMoy), 'Délai de réponse', { sous: 'moyenne 30 jours', classe: 'neutre' }));
    this.elKpis.appendChild(kpi(nonLus, 'Textos non lus', { classe: nonLus || sansRep ? 'alerte' : '', sous: sansRep ? sansRep + ' client' + (sansRep > 1 ? 's' : '') + ' sans réponse depuis ' + ATTENTE_MIN + ' min' : convs.length + ' conversation' + (convs.length > 1 ? 's' : ''), actif: this.vue === 'conversations', onclick: function () { self.vue = 'conversations'; if (sansRep) self.filtreConv = 'attente'; self.rendre(); } }));
    this.elKpis.appendChild(kpi(paiAttente.length, 'Paiements en attente', { classe: paiAttente.length ? 'attention' : '', sous: paiMontant ? argent(paiMontant) : 'aucun', actif: this.vue === 'paiements', onclick: function () { self.vue = 'paiements'; self.rendre(); } }));
  };
  VueTexto.prototype.rendreCorps = function () {
    var self = this;
    AMX.vider(this.elCorps); AMX.vider(this.elFiltres);
    this.elFiltres.classList.toggle('cache', this.vue !== 'estimes');
    if (this.vue === 'estimes') {
      var tous = this.liste('estimes');
      FILTRES.forEach(function (f) { var n = tous.filter(function (e) { return filtreEstime(e, f[0]); }).length; if (f[0] && !n && f[0] !== 'attente') return; self.elFiltres.appendChild(h('button' + (self.filtre === f[0] ? '.actif' : ''), { type: 'button', onclick: function () { self.filtre = f[0]; self.rendreCorps(); } }, [f[1], h('span.n', { text: n })])); });
      this.rendreEstimes(tous.filter(function (e) { return filtreEstime(e, self.filtre); }));
    } else if (this.vue === 'conversations') this.rendreConversations();
    else if (this.vue === 'paiements') this.rendrePaiements();
    else if (this.vue === 'refuses') this.rendreRefuses();
    else if (this.vue === 'clients' && this.rendreClients) this.rendreClients();
    else if (this.vue === 'campagnes' && this.rendreCampagnes) this.rendreCampagnes();
    else if (this.vue === 'autos' && this.rendreAutos) this.rendreAutos();
    else this.rendreStats();
  };

  /* ------------------------------------------------------------------ estimés : liste */
  VueTexto.prototype.rendreEstimes = function (liste) {
    var self = this;
    this.elCompte.textContent = liste.length + ' estimé' + (liste.length > 1 ? 's' : '');
    if (!liste.length) { this.elCorps.appendChild(h('div.vide', [h('h3', this.recherche ? 'Aucun estimé ne correspond.' : 'Aucun estimé ici.'), h('div.doux', { text: this.peutEcrire() ? 'Créez-en un avec « + Nouvel estimé » : le client reçoit un lien par texto et approuve chaque ligne.' : '' })])); return; }
    var tbody = h('tbody');
    liste.forEach(function (e) {
      var tr = h('tr.cliquable' + (e.ouvert && joursDepuis(e.envoyeLe) >= 2 ? '.attention' : ''), { onclick: function () { self.ouvrirEstime(e.id); } }, [
        h('td.ref', [e.id, e.termineLe ? h('span.sous', { text: 'travaux terminés' }) : (e.btNo ? h('span.sous', { text: 'BT ' + e.btNo }) : null)]),
        h('td.client-cell', [h('div', [avatar(e.client, e.telephone, true), h('div.t', [h('b', { text: e.client || '—' }), h('span.sous', { text: (e.telephoneJoli || '') + (e.vehicule ? ' · ' + e.vehicule : '') })])])]),
        h('td.num', { text: argent(e.total) }),
        h('td.num', [e.totalApprouve ? h('b', { text: argent(e.totalApprouve) }) : h('span.doux', '—'), e.nRefuse ? h('span.sous.ico-refus', { text: e.nRefuse + ' refusé' + (e.nRefuse > 1 ? 's' : '') }) : null]),
        h('td.statut-cell.s-' + e.statut, [h('span.ic', { text: ICO_STATUT[e.statut] || '•' }), h('span', { text: STATUTS[e.statut] || e.statut }), e.vues ? h('span.vues', { text: '👁 ' + e.vues, title: 'Ouvert ' + e.vues + ' fois par le client' }) : null, e.relances ? h('span.vues', { text: '↻ ' + e.relances, title: e.relances + ' relance(s)' }) : null, e.paiementId ? h('span.vues', { text: '$', title: 'Demande de paiement ' + e.paiementId }) : null, e.courtoisieNote !== null && e.courtoisieNote !== undefined ? h('span.vues' + (e.courtoisieNote <= 3 ? '.ico-refus' : '.ico-ok'), { text: '★ ' + e.courtoisieNote, title: 'Note de courtoisie' }) : null]),
        h('td', [h('span', { text: e.envoyeLe ? quand(e.envoyeLe) : (e.creeLe ? 'créé ' + quand(e.creeLe) : '') }), e.reponduLe ? h('span.sous', { text: 'réponse ' + quand(e.reponduLe) + (e.delaiMin !== null ? ' (' + duree(e.delaiMin) + ')' : '') }) : (e.vuLe ? h('span.sous', { text: 'vu ' + quand(e.vuLe) }) : null)]),
        h('td', [h('span', { text: self.nomConseiller(e.compagnie, e.conseiller || e.creePar) }), !self.compagnie ? h('span.sous', { text: nomCie(e.compagnie) }) : null])
      ]);
      tbody.appendChild(tr);
    });
    this.elCorps.appendChild(h('table.tableau', [h('thead', [h('tr', [h('th', 'Référence'), h('th', 'Client'), h('th.num', 'Total'), h('th.num', 'Approuvé'), h('th', 'Statut'), h('th', 'Envoyé'), h('th', 'Conseiller')])]), tbody]));
  };

  /* ------------------------------------------------------------------ estimés : fiche (éditeur) */
  VueTexto.prototype.ouvrirEstime = function (id, prefill) {
    var self = this;
    if (!id) {
      if (!this.peutEcrire()) { AMX.toast('Lecture seule : vous ne pouvez pas créer d\'estimé.', 'erreur'); return; }
      var cie = (prefill && prefill.compagnie) || this.compagnie;
      if (!cie) { AMX.toast('Choisissez d\'abord une concession.', 'erreur'); return; }
      this.fiche(Object.assign({ id: '', compagnie: cie, statut: 'brouillon', lignes: [], client: '', telephone: '', courriel: '', vin: '', vehicule: '', plaque: '', km: '', btNo: '', rdvId: '', note: '', noteInterne: '', vues: 0, relances: 0, journal: [] }, prefill || {}), this.config(cie));
      return;
    }
    var m = AMX.modale({ titre: 'Estimé ' + id, corps: AMX.chargeur('Estimé ' + id, { compact: true }), large: true, boutons: [{ texte: 'Fermer' }] });
    AMX.get({ textoEstime: 1, id: id }, { secours: false }).then(function (d) {
      m.fermer();
      if (!d || !d.ok) { AMX.toast((d && (d.erreur || d.message)) || 'Estimé introuvable', 'erreur'); return; }
      self.fiche(d.estime, d.config || self.config(d.estime.compagnie));
    }).catch(function (e) { m.fermer(); AMX.toast(AMX.erreurTexte(e), 'erreur'); });
  };
  /* L'éditeur : état local `v` (l'estimé) ; chaque bouton enregistre d'abord (les lignes modifiées) puis fait l'action. */
  VueTexto.prototype.fiche = function (e, cfg) {
    var self = this, v = JSON.parse(JSON.stringify(e)), peut = this.peutEcrire() && v.statut !== 'annule';
    cfg = cfg || { tauxMo: 139.95, taxes: true, travaux: [], modeles: [], conseillers: [] };
    var neuf = !v.id, modale;
    var liste0 = function () { return cfg.taxes !== false ? taxesDe(cfg) : []; };
    var champ = function (label, el, aide) { return h('div.champ', [h('label', label), el, aide ? h('span.aide', { text: aide }) : null]); };
    /* --- client et véhicule --- */
    var inClient = h('input.saisie', { type: 'text', value: v.client || '', placeholder: 'Prénom et nom', autocomplete: 'off' });
    var inTel = h('input.saisie', { type: 'tel', value: v.telephoneJoli || telJoli(v.telephone) || '', placeholder: '514 555-1234', autocomplete: 'off' });
    var inCourriel = h('input.saisie', { type: 'email', value: v.courriel || '', placeholder: 'facultatif' });
    var inAdresse = h('input.saisie', { type: 'text', value: v.adresse || '', placeholder: 'No, rue, ville, code postal', autocomplete: 'off' });
    var inVin = h('input.saisie.mono', { type: 'text', value: v.vin || '', placeholder: 'NIV', maxlength: 17, style: { textTransform: 'uppercase' } });
    var inVeh = h('input.saisie', { type: 'text', value: v.vehicule || '', placeholder: '2023 BMW X3' });
    var inPlaque = h('input.saisie', { type: 'text', value: v.plaque || '', placeholder: 'ABC 123' });
    var inKm = h('input.saisie', { type: 'text', inputmode: 'numeric', value: v.km || '', placeholder: 'km' });
    var inBt = h('input.saisie', { type: 'text', value: v.btNo || '', placeholder: 'Bon de travail #' });
    var selCons = h('select.saisie', [h('option', { value: '', text: '— conseiller —' })].concat((cfg.conseillers || []).map(function (c) { return h('option', { value: c.id, selected: v.conseiller === c.id ? true : undefined, text: c.nom }); })).concat(v.conseiller && !(cfg.conseillers || []).some(function (c) { return c.id === v.conseiller; }) ? [h('option', { value: v.conseiller, selected: true, text: nomCourt(v.conseiller) })] : []));
    var resultats = h('div.resultats-clients.cache');
    var chercher = AMX.debounce(function (q) {
      q = String(q || '').trim(); if (q.length < 3) { resultats.classList.add('cache'); return; }
      AMX.get({ rdvClients: 1, compagnie: v.compagnie, q: q }, { secours: false, essais: 1 }).then(function (d) {
        AMX.vider(resultats);
        if (!d || !d.ok || !(d.clients || []).length) { resultats.classList.add('cache'); return; }
        d.clients.forEach(function (c) { resultats.appendChild(h('button', { type: 'button', onclick: function () { v.clientId = c.id; inClient.value = c.affichage; inTel.value = c.telephoneJoli || c.telephone; inCourriel.value = c.courriel || ''; var veh = (c.vehicules || [])[0]; if (veh && !inVin.value) { inVin.value = veh.vin || ''; inVeh.value = veh.texte || ''; inPlaque.value = veh.plaque || ''; inKm.value = veh.km || ''; } resultats.classList.add('cache'); } }, [h('b', { text: c.affichage }), h('span.d', { text: ' · ' + (c.telephoneJoli || '') + ((c.vehicules || []).length ? ' · ' + c.vehicules.map(function (x) { return x.texte || x.vin; }).join(', ') : '') })])); });
        resultats.classList.remove('cache');
      }).catch(function () { resultats.classList.add('cache'); });
    }, 250);
    inClient.addEventListener('input', function () { v.clientId = ''; chercher(inClient.value); });
    inTel.addEventListener('input', function () { v.clientId = ''; chercher(inTel.value); });
    var btnDecoder = h('button.btn.petit', { type: 'button', text: 'Décoder', onclick: function () {
      var vin = inVin.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); if (vin.length !== 17) { AMX.toast('NIV de 17 caractères attendu', 'erreur'); return; }
      btnDecoder.classList.add('occupe');
      fetch('https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/' + vin + '?format=json').then(function (x) { return x.json(); }).then(function (d) { btnDecoder.classList.remove('occupe'); var r0 = (d.Results || [])[0] || {}; var texte = [r0.ModelYear, r0.Make ? r0.Make.charAt(0) + r0.Make.slice(1).toLowerCase() : '', r0.Model, r0.Trim].filter(Boolean).join(' '); if (texte) inVeh.value = texte; else AMX.toast('NIV non reconnu', 'attention'); }).catch(function () { btnDecoder.classList.remove('occupe'); AMX.toast('Décodage impossible', 'erreur'); });
    } });
    var grilleClient = h('div.grille.c4.rdv-form', [champ('Client', h('div', [inClient, resultats])), champ('Cellulaire', inTel, 'le lien part par texto à ce numéro'), champ('Courriel', inCourriel), champ('Conseiller', selCons),
      champ('NIV', h('div', { style: { display: 'flex', gap: '6px' } }, [inVin, btnDecoder])), champ('Véhicule', inVeh), champ('Plaque · km', h('div', { style: { display: 'flex', gap: '6px' } }, [inPlaque, inKm])), champ('Bon de travail #', inBt)]);
    /* 28 oct. : l'adresse du client est exigée sur l'estimé (LPC art. 170) ; en Ontario aussi le NIV et le kilométrage (Règl. 17/05). */
    var chAdresse = champ('Adresse du client', inAdresse, 'exigée sur l\'estimé'); chAdresse.style.gridColumn = 'span 2'; grilleClient.appendChild(chAdresse);
    var elManques = h('div.txt-manques.cache');
    var manquesLocal = function () {
      if (!cfg.province) return [];   /* script d'avant le 28 oct. : le serveur ne vérifie pas */
      var m = [];
      if (!inClient.value.trim()) m.push('le nom du client');
      if (!inAdresse.value.trim()) m.push('l\'adresse du client');
      if (!inVeh.value.trim()) m.push('le véhicule (marque et modèle)');
      if (!inPlaque.value.trim()) m.push('la plaque d\'immatriculation');
      if (cfg.province === 'ON') { if (!inVin.value.trim()) m.push('le NIV'); if (!String(inKm.value || '').trim()) m.push('le kilométrage'); }
      return m;
    };
    var majManques = function () { var m = peut ? manquesLocal() : []; elManques.textContent = m.length ? 'Avant l\'envoi au client, ajoutez : ' + m.join(', ') + '.' : ''; elManques.classList.toggle('cache', !m.length); return m; };
    [inClient, inAdresse, inVeh, inPlaque, inVin, inKm].forEach(function (x) { x.addEventListener('input', majManques); });
    [inClient, inTel, inCourriel, inAdresse, inVin, inVeh, inPlaque, inKm, inBt, selCons].forEach(function (x) { if (!peut) x.disabled = true; });
    /* --- lignes --- */
    var elLignes = h('div.lignes'), lignesUI = [];
    var elTotaux = h('div.totaux.barre-totaux');
    var paire = function (libelle, valeur, cls) { elTotaux.appendChild(h('div.paire' + (cls ? '.' + cls : ''), [h('span', { text: libelle }), h('span', { text: valeur })])); };
    var totalLigne = function (L) { var mo = L.mo.type === 'taux' ? r2(num(L.mo.heures) * (num(L.mo.taux) || cfg.tauxMo)) : r2(num(L.mo.montant)); var p = L.pieces.reduce(function (a, x) { return a + (num(x.qte) || 1) * num(x.prix); }, 0), f = L.frais.reduce(function (a, x) { return a + (num(x.qte) || 1) * num(x.prix); }, 0); return { mo: mo, pieces: r2(p), frais: r2(f), total: r2(mo + p + f) }; };
    var lireLignes = function () { return lignesUI.filter(function (u) { return elLignes.contains(u.el); }).map(function (u) { return u.lire(); }).filter(function (L) { return L.libelle; }); };
    var majTotaux = function () {
      var lignes = lireLignes(), sous = 0, appr = 0;
      lignes.forEach(function (L) { if (L.paiement === 'garantie' || L.paiement === 'interne') return; var t = totalLigne(L).total; sous += t; if (L.etat === 'approuve') appr += t; });
      sous = r2(sous); appr = r2(appr);
      /* Taxes de la province de la concession (TPS + TVQ au Québec, TVH 13 % en Ontario), comme le serveur. */
      var taxes = cfg.taxes !== false, liste = taxes ? taxesDe(cfg) : [], tx = 0, txA = 0;
      AMX.vider(elTotaux);
      paire('Sous-total', argent(sous));
      liste.forEach(function (x) { var mt = r2(sous * x.taux); tx += mt; txA += r2(appr * x.taux); paire(x.libelle, argent(mt)); });
      if (appr || lignes.some(function (L) { return L.etat === 'refuse'; })) paire('Approuvé par le client', argent(liste.length ? r2(appr + txA) : appr) + (liste.length ? ' taxes incl.' : ''), 'a');
      paire('Total', argent(r2(sous + tx)), 't');
      lignesUI.forEach(function (u) { if (elLignes.contains(u.el)) u.majTotal(); });
    };
    var ligneUI = function (L, k) {
      L = Object.assign({ code: '', libelle: '', description: '', urgence: 'recommande', mo: { type: 'fixe', heures: 0, taux: cfg.tauxMo, montant: 0 }, pieces: [], frais: [], medias: [], etat: 'propose', point: '' }, L || {});
      L.mo = Object.assign({ type: 'fixe', heures: 0, taux: cfg.tauxMo, montant: 0 }, L.mo || {}); L.pieces = (L.pieces || []).slice(); L.frais = (L.frais || []).slice();
      var el = h('div.txt-ligne.u-' + L.urgence + (L.etat !== 'propose' ? '.e-' + L.etat : ''));
      var selMenu = h('select.saisie', [h('option', { value: '', text: '— menu —' })].concat((cfg.travaux || []).map(function (t) { return h('option', { value: t.code, selected: t.code === L.code ? true : undefined, text: t.libelle + (t.prix ? ' · ' + argent(t.prix) : '') }); })));
      var inLib = h('input.saisie', { type: 'text', value: L.libelle, placeholder: 'Travail proposé (ex. Plaquettes et disques avant)' });
      var selUrg = h('select.saisie', Object.keys(URGENCES).map(function (u) { return h('option', { value: u, selected: L.urgence === u ? true : undefined, text: URGENCES[u] }); }));
      /* 20 oct. soir : type de paiement (comme les codes OP de Kimoby) — garantie / interne : la ligne est montrée au client mais ne compte pas dans son total */
      var selPai = h('select.saisie', { title: 'Qui paie cette ligne' }, [['client', 'Client'], ['garantie', 'Garantie'], ['interne', 'Interne']].map(function (x) { return h('option', { value: x[0], selected: (L.paiement || 'client') === x[0] ? true : undefined, text: x[1] }); }));
      selPai.addEventListener('change', function () { el.classList.toggle('p-couvert', selPai.value !== 'client'); majTotaux(); });
      var elTotal = h('span.total');
      var elEtat = h('span.etat-ligne' + (L.etat !== 'propose' ? '.' + L.etat : ''), { text: L.etat === 'approuve' ? 'Approuvé' : (L.etat === 'refuse' ? 'Refusé' : 'Proposé'), title: L.reponduLe ? 'Réponse ' + quand(L.reponduLe) : '' });
      var btnRetirer = h('button.btn.petit.fantome', { type: 'button', text: '×', title: 'Retirer la ligne', onclick: function () { el.remove(); majTotaux(); } });
      selMenu.addEventListener('change', function () { var t = (cfg.travaux || []).filter(function (x) { return x.code === selMenu.value; })[0]; if (t) { inLib.value = t.libelle; L.code = t.code; if (t.prix) { selType.value = 'fixe'; inMontant.value = t.prix; } if (t.heures && !t.prix) { selType.value = 'taux'; inHeures.value = t.heures; } majMo(); } });
      selUrg.addEventListener('change', function () { el.className = 'txt-ligne u-' + selUrg.value + (L.etat !== 'propose' ? ' e-' + L.etat : ''); });
      /* main-d'œuvre */
      var selType = h('select.saisie', [h('option', { value: 'fixe', selected: L.mo.type !== 'taux' ? true : undefined, text: 'Prix fixe' }), h('option', { value: 'taux', selected: L.mo.type === 'taux' ? true : undefined, text: 'Taux × heures' })]);
      var inMontant = h('input.saisie', { type: 'number', step: '0.01', min: 0, value: L.mo.montant || '', placeholder: '0,00' }), inHeures = h('input.saisie', { type: 'number', step: '0.1', min: 0, value: L.mo.heures || '', placeholder: 'h' }), inTaux = h('input.saisie', { type: 'number', step: '0.01', min: 0, value: L.mo.taux || cfg.tauxMo, placeholder: 'taux' });
      var spanFixe = h('span', [inMontant, h('span.eq', ' $')]), spanTaux = h('span', [inHeures, h('span.eq', ' h ×'), inTaux, h('span.eq', ' $/h')]);
      var majMo = function () { var taux = selType.value === 'taux'; spanFixe.classList.toggle('cache', taux); spanTaux.classList.toggle('cache', !taux); majTotaux(); };
      selType.addEventListener('change', majMo);
      [inMontant, inHeures, inTaux].forEach(function (x) { x.addEventListener('input', majTotaux); });
      /* pièces et frais */
      var tbP = h('tbody'), tbF = h('tbody');
      var rangeePiece = function (p) { var selTypeP = h('select.saisie', { title: 'Type de pièce (exigé sur l\'estimé)' }, Object.keys(TYPES_PIECE).map(function (k) { return h('option', { value: k, selected: (p.type || 'neuve') === k ? true : undefined, text: TYPES_PIECE[k] }); })), inNo = h('input.saisie', { type: 'text', value: p.no || '', placeholder: '# pièce' }), inNom = h('input.saisie', { type: 'text', value: p.nom || '', placeholder: 'Pièce' }), inQ = h('input.saisie', { type: 'number', step: '1', min: 0, value: p.qte || 1 }), inPx = h('input.saisie', { type: 'number', step: '0.01', min: 0, value: p.prix || '', placeholder: '0,00' }), tdT = h('td.t'); var tr = h('tr', [h('td', { style: { width: '120px' } }, [inNo]), h('td', [inNom]), h('td.ty', [selTypeP]), h('td.n', [inQ]), h('td.p', [inPx]), tdT, h('td', { style: { width: '26px' } }, [h('button.btn.petit.fantome', { type: 'button', text: '×', onclick: function () { tr.remove(); majTotaux(); } })])]); tr._lire = function () { return { no: inNo.value.trim(), nom: inNom.value.trim(), type: selTypeP.value, qte: num(inQ.value) || 1, prix: num(inPx.value), dispo: p.dispo || '' }; }; tr._maj = function () { tdT.textContent = argent((num(inQ.value) || 1) * num(inPx.value)); }; [inQ, inPx].forEach(function (x) { x.addEventListener('input', majTotaux); }); tbP.appendChild(tr); tr._maj(); };
      var rangeeFrais = function (f) { var inNom = h('input.saisie', { type: 'text', value: f.nom || '', placeholder: 'Frais (atelier, recyclage, fournitures…)' }), inQ = h('input.saisie', { type: 'number', step: '1', min: 0, value: f.qte || 1 }), inPx = h('input.saisie', { type: 'number', step: '0.01', min: 0, value: f.prix || '', placeholder: '0,00' }), tdT = h('td.t'); var tr = h('tr', [h('td', { colspan: 3 }, [inNom]), h('td.n', [inQ]), h('td.p', [inPx]), tdT, h('td', { style: { width: '26px' } }, [h('button.btn.petit.fantome', { type: 'button', text: '×', onclick: function () { tr.remove(); majTotaux(); } })])]); tr._lire = function () { return { nom: inNom.value.trim(), qte: num(inQ.value) || 1, prix: num(inPx.value) }; }; tr._maj = function () { tdT.textContent = argent((num(inQ.value) || 1) * num(inPx.value)); }; [inQ, inPx].forEach(function (x) { x.addEventListener('input', majTotaux); }); tbF.appendChild(tr); tr._maj(); };
      L.pieces.forEach(rangeePiece); L.frais.forEach(rangeeFrais);
      var inDesc = zoneTexte({ placeholder: 'Ce que vous avez vu, pourquoi c\'est recommandé (le client le lit)…', style: { minHeight: '44px' } }, L.description);
      /* médias de la ligne */
      var elMedias = h('div.medias'), inFichier = h('input', { type: 'file', accept: 'image/*,video/*', multiple: true, style: { display: 'none' } });
      var rendreMedias = function () {
        AMX.vider(elMedias);
        (L.medias || []).forEach(function (m) { elMedias.appendChild(h('div.media', { title: m.nom, onclick: function () { window.open(m.type === 'video' ? m.lecture : m.url, '_blank', 'noopener'); } }, [h('img', { src: m.apercu, alt: m.nom, loading: 'lazy', onerror: function () { this.style.display = 'none'; } }), m.type === 'video' ? h('span.lecture', { html: '&#9654;' }) : null, peut ? h('button.retirer', { type: 'button', text: '×', title: 'Retirer', onclick: function (ev) { ev.stopPropagation(); self.action({ action: 'estimeMediaRetirer', id: v.id, mediaId: m.id }, 'Média retiré').then(function (d) { if (d && d.ok) { L.medias = ((d.estime.lignes || []).filter(function (x) { return x.code === L.code; })[0] || {}).medias || []; rendreMedias(); } }); } }) : null])); });
        if (peut) elMedias.appendChild(h('div.media.ajout', { text: '📷 Photo / vidéo', title: 'Le client voit les photos et vidéos de cette ligne', onclick: function () { if (!v.id) { AMX.toast('Enregistrez d\'abord l\'estimé, puis ajoutez les photos.', 'attention'); return; } inFichier.click(); } }));
      };
      inFichier.addEventListener('change', function () {
        var fichiers = [].slice.call(inFichier.files || []); inFichier.value = '';
        var suite = Promise.resolve();
        fichiers.forEach(function (f) { suite = suite.then(function () { var mime = f.type || 'application/octet-stream'; var prep = /^image\//.test(mime) ? reduireImage(f) : lireBase64(f).then(function (b) { return { base64: b, mime: mime }; }); return prep.then(function (p) { if (p.base64.length * 0.75 > 35 * 1024 * 1024) throw new Error('Fichier trop lourd (35 Mo max)'); AMX.toast('Envoi de ' + (/^video/.test(mime) ? 'la vidéo' : 'la photo') + '…', 'info', 2000); self.enEcriture = true; return AMX.post({ action: 'estimeMedia', id: v.id, ligne: L.code, nom: f.name, mime: p.mime, base64: p.base64 }, { delai: 240000 }); }).then(function (d) { self.enEcriture = false; if (!d || d.ok === false || d.refuse) throw new Error((d && (d.erreur || d.message)) || 'Envoi refusé'); L.medias = ((d.estime.lignes || []).filter(function (x) { return x.code === L.code; })[0] || {}).medias || []; rendreMedias(); AMX.texto.invalider(); }).catch(function (e) { self.enEcriture = false; AMX.toast(AMX.erreurTexte(e), 'erreur'); }); }); });
      });
      rendreMedias();
      /* réponse consignée par le conseiller (comptoir / téléphone) */
      var elReponse = h('div.reponse');
      if (peut && v.id && v.statut !== 'brouillon') {
        var consigner = function (etat) { self.action({ action: 'estimeReponseInterne', id: v.id, reponses: (function () { var o = {}; o[L.code] = etat; return o; })() }, etat === 'approuve' ? 'Ligne approuvée (consignée)' : (etat === 'refuse' ? 'Ligne refusée (consignée)' : 'Ligne remise en attente')).then(function (d) { if (d && d.ok) { self.fermerFiche(); self.fiche(d.estime, cfg); } }); };
        elReponse.appendChild(h('button.btn.petit', { type: 'button', text: '✓', title: 'Le client a approuvé (au comptoir / au téléphone)', onclick: function () { consigner('approuve'); } }));
        elReponse.appendChild(h('button.btn.petit', { type: 'button', text: '✗', title: 'Le client a refusé', onclick: function () { consigner('refuse'); } }));
        if (L.etat !== 'propose') elReponse.appendChild(h('button.btn.petit.fantome', { type: 'button', text: '↺', title: 'Remettre en attente', onclick: function () { consigner('propose'); } }));
      }
      if ((L.paiement || 'client') !== 'client') el.classList.add('p-couvert');
      el.appendChild(h('div.rangee1', [selMenu, inLib, h('div', { style: { display: 'flex', gap: '4px' } }, [selUrg, selPai]), elTotal, h('div', { style: { display: 'flex', gap: '4px', alignItems: 'center' } }, [elEtat, elReponse, peut ? btnRetirer : null])]));
      var btnPiece = h('button.btn.petit.fantome', { type: 'button', text: '+ pièce', onclick: function () { rangeePiece({}); } }), btnFrais = h('button.btn.petit.fantome', { type: 'button', text: '+ frais', onclick: function () { rangeeFrais({}); } });
      el.appendChild(h('div.detail', [
        h('div.bloc.bloc-mo', [h('h5', 'Main-d\'œuvre'), h('div.mo', [selType, spanFixe, spanTaux])]),
        h('div.bloc.bloc-frais', [h('h5', ['Frais', peut ? btnFrais : null]), h('table.pieces', [tbF])]),
        h('div.bloc.bloc-pieces', [h('h5', ['Pièces', peut ? btnPiece : null]), h('table.pieces', [tbP])]),
        h('div.bloc.bloc-desc', [h('h5', 'Note au client · photos et vidéos'), inDesc, elMedias, inFichier])
      ]));
      majMo();
      var u = { el: el, lire: function () { return { code: L.code || selMenu.value || '', libelle: inLib.value.trim(), description: inDesc.value.trim(), urgence: selUrg.value, mo: { type: selType.value, heures: num(inHeures.value), taux: num(inTaux.value) || cfg.tauxMo, montant: num(inMontant.value) }, pieces: [].map.call(tbP.querySelectorAll('tr'), function (tr) { return tr._lire(); }).filter(function (p) { return p.nom || p.no; }), frais: [].map.call(tbF.querySelectorAll('tr'), function (tr) { return tr._lire(); }).filter(function (f) { return f.nom; }), medias: L.medias, etat: L.etat, reponduLe: L.reponduLe, paiement: selPai.value, point: L.point || '' }; }, majTotal: function () { var t = totalLigne(u.lire()); elTotal.textContent = argent(t.total) + (selPai.value === 'garantie' ? ' · garantie' : (selPai.value === 'interne' ? ' · interne' : '')); [].forEach.call(el.querySelectorAll('table.pieces tr'), function (tr) { if (tr._maj) tr._maj(); }); } };
      if (!peut) [].forEach.call(el.querySelectorAll('input, select, textarea'), function (x) { x.disabled = true; });
      [inLib, inDesc].forEach(function (x) { x.addEventListener('input', majTotaux); });
      lignesUI.push(u); elLignes.appendChild(el);
      return u;
    };
    (v.lignes || []).forEach(ligneUI);
    if (!(v.lignes || []).length && peut) ligneUI({});
    var btnLigne = h('button.btn.petit', { type: 'button', text: '+ Ajouter un travail', onclick: function () { var u = ligneUI({}); u.el.querySelector('input').focus(); } });
    var inNote = zoneTexte({ placeholder: 'Message au client (en tête de la page) — facultatif', style: { minHeight: '48px' } }, v.note);
    var inNoteInt = zoneTexte({ placeholder: 'Note interne (le client ne la voit pas)', style: { minHeight: '36px' } }, v.noteInterne);
    if (!peut) { inNote.disabled = true; inNoteInt.disabled = true; }
    majTotaux(); majManques();
    /* --- 29 oct. : inspection en couleurs (un seul lien par visite) --- */
    var insp = self.sectionInspection(v, cfg, peut, {
      id: function () { return v.id; },
      aLigne: function (code) { return lireLignes().some(function (L) { return L.point === code; }); },
      versTravail: function (p) { var u = ligneUI({ libelle: p.libelle, urgence: p.couleur === 'rouge' ? 'urgent' : 'recommande', point: p.code, description: p.note || '' }); majTotaux(); try { u.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e3) {} }
    });
    /* --- en-tête : statut, suivi, étapes --- */
    var titre = h('div.titre', [v.client ? avatar(v.client, v.telephone) : null, v.id ? 'Estimé ' + v.id : 'Nouvel estimé', h('span.badge.' + (COULEUR[v.statut] || 'gris'), { text: STATUTS[v.statut] || v.statut }), v.statut === 'annule' && v.annuleRaison ? h('span.doux', { text: '— ' + v.annuleRaison }) : null]);
    var suivi = h('div.suivi');
    if (v.envoyeLe) suivi.appendChild(h('div', [h('b', 'Envoyé '), quand(v.envoyeLe) + (v.canal ? ' par ' + v.canal.replace('+', ' et ') : '') + (v.envoyePar ? ' (' + nomCourt(v.envoyePar) + ')' : '')]));
    if (v.vues) suivi.appendChild(h('div', [h('b', 'Vu '), v.vues + ' fois' + (v.vuLe ? ', la première ' + quand(v.vuLe) : '')])); else if (v.envoyeLe) suivi.appendChild(h('div', 'Pas encore ouvert par le client'));
    if (v.reponduLe) suivi.appendChild(h('div', [h('b', 'Réponse '), quand(v.reponduLe) + (v.delaiMin !== null && v.delaiMin !== undefined ? ' (' + duree(v.delaiMin) + ' après l\'envoi)' : '')]));
    if (v.relances) suivi.appendChild(h('div', [h('b', 'Relancé '), v.relances + ' fois, la dernière ' + quand(v.relanceLe)]));
    if (v.expireLe && v.ouvert) suivi.appendChild(h('div', [h('b', 'Valide '), 'jusqu\'au ' + new Date(v.expireLe).toLocaleDateString('fr-CA')]));
    if (v.termineLe) suivi.appendChild(h('div', [h('b', 'Travaux terminés '), quand(v.termineLe)]));
    if (v.courtoisieLe) suivi.appendChild(h('div', [h('b', 'Suivi de courtoisie '), quand(v.courtoisieLe) + (v.courtoisieNote !== null && v.courtoisieNote !== undefined ? ' · note ' + v.courtoisieNote + ' / 5' : (v.sondageId ? ' · sondage ' + v.sondageId : ''))]));
    if (v.noteClient) suivi.appendChild(h('div', { style: { borderLeft: '3px solid var(--vert)', paddingLeft: '8px', textAlign: 'left', marginTop: '4px', whiteSpace: 'pre-wrap' }, text: v.noteClient }));
    var etapes = h('div.etapes');
    var etapeDef = [['cree', 'Créé'], ['envoye', 'Envoyé'], ['vu', 'Vu'], ['repondu', 'Réponse'], ['termine', 'Travaux terminés'], ['paye', 'Payé'], ['courtoisie', 'Suivi de courtoisie']];
    var faits = { cree: !!v.id, envoye: !!v.envoyeLe, vu: !!v.vuLe, repondu: !!v.reponduLe, termine: !!v.termineLe, paye: false, courtoisie: !!v.courtoisieLe };
    var pai = v.paiementId && self.donnees ? (self.donnees.paiements || []).filter(function (p) { return p.id === v.paiementId; })[0] : null;
    if (pai && pai.statut === 'paye') faits.paye = true;
    var courant = ''; for (var i = 0; i < etapeDef.length; i++) if (!faits[etapeDef[i][0]]) { courant = etapeDef[i][0]; break; }
    etapeDef.forEach(function (d) { etapes.appendChild(h('span' + (faits[d[0]] ? '.fait' : (d[0] === courant ? '.courant' : '')), { text: d[1] })); });
    /* --- journal --- */
    var journal = h('div.journal');
    (v.journal || []).slice().reverse().forEach(function (j) { journal.appendChild(h('div', [h('b', { text: quand(j.le) }), ' ', j.quoi, j.par ? h('span.doux', { text: ' · ' + nomCourt(j.par) }) : null])); });
    /* --- approbations figées (28 oct.) : ce que le client a approuvé, quand, par où, avec l'empreinte de la copie --- */
    var CANAUX_APPR = { page: 'page de l\'estimé', texto: 'texto', comptoir: 'au comptoir (consigné)' };
    var approbations = h('div.journal');
    (v.approbations || []).slice().reverse().forEach(function (a) {
      var ok = (a.lignes || []).filter(function (l) { return l.etat === 'approuve'; }).map(function (l) { return l.libelle; }), non = (a.lignes || []).filter(function (l) { return l.etat === 'refuse'; }).map(function (l) { return l.libelle; });
      approbations.appendChild(h('div', [h('b', { text: quand(a.le) }), ' ', 'Par ' + (CANAUX_APPR[a.canal] || a.canal || '—') + (a.qui ? ' · ' + a.qui : '') + (a.telephone ? ' · ' + telJoli(a.telephone) : '') + ' — approuvé : ' + (ok.join(', ') || 'rien') + ' (' + argent(a.totalApprouveTaxes) + (liste0().length ? ' taxes incluses' : '') + ')' + (non.length ? ' · refusé : ' + non.join(', ') : ''), a.empreinte ? h('span.doux.mono', { text: ' · ' + String(a.empreinte).slice(0, 12), title: 'Empreinte de la copie : ' + a.empreinte }) : null]));
    });
    /* --- lecture de l'état local --- */
    var lire = function () { return { id: v.id || undefined, compagnie: v.compagnie, client: inClient.value.trim(), clientId: v.clientId || '', telephone: inTel.value, courriel: inCourriel.value.trim(), adresse: inAdresse.value.trim(), vin: inVin.value.trim().toUpperCase(), vehicule: inVeh.value.trim(), plaque: inPlaque.value.trim(), km: inKm.value, btNo: inBt.value.trim(), rdvId: v.rdvId || '', conseiller: selCons.value, note: inNote.value, noteInterne: inNoteInt.value, lignes: lireLignes(), inspection: insp ? insp.lire() : undefined }; };
    var enregistrer = function (silencieux) {
      var e2 = lire();
      if (!e2.client && !telChiffres(e2.telephone)) { AMX.toast('Nom ou cellulaire du client requis', 'erreur'); inClient.focus(); return Promise.resolve(null); }
      if (!e2.lignes.length && !(insp && insp.aDesNotes())) { AMX.toast('Ajoutez au moins un travail (ou notez l\'inspection)', 'erreur'); return Promise.resolve(null); }
      self.enEcriture = true;
      return AMX.post({ action: 'estimeEnregistrer', estime: e2 }, { delai: 60000 }).then(function (d) {
        self.enEcriture = false;
        if (!d || d.ok === false || d.refuse) { AMX.toast((d && (d.erreur || d.message)) || 'Refusé', 'erreur'); return null; }
        v = JSON.parse(JSON.stringify(d.estime)); AMX.texto.invalider(); self.charger();
        if (!silencieux) AMX.toast('Estimé ' + v.id + ' enregistré', 'ok');
        return v;
      }, function (e) { self.enEcriture = false; AMX.toast('Non enregistré — ' + AMX.erreurTexte(e), 'erreur'); return null; });
    };
    var rouvrir = function (est) { self.fermerFiche(); self.fiche(est || v, cfg); };
    /* --- actions --- */
    var actions = h('div.actions-fiche');
    if (peut) {
      actions.appendChild(h('button.btn', { type: 'button', text: 'Enregistrer', onclick: function () { enregistrer().then(function (r) { if (r) rouvrir(r); }); } }));
      actions.appendChild(h('button.btn.primaire', { type: 'button', text: v.envoyeLe ? 'Renvoyer au client' : 'Envoyer au client', onclick: function () { var m = majManques(); if (m.length) { AMX.toast('Avant l\'envoi, ajoutez : ' + m.join(', ') + '.', 'erreur', 7000); return; } enregistrer(true).then(function (r) { if (r) self.modaleEnvoi(r, cfg, false, function (est) { rouvrir(est); }); }); } }));
      if (v.ouvert) actions.appendChild(h('button.btn', { type: 'button', text: 'Relancer', title: 'Petit rappel par texto', onclick: function () { self.modaleEnvoi(v, cfg, true, function (est) { rouvrir(est); }); } }));
      if (v.id && v.envoyeLe) { actions.appendChild(h('button.btn.fantome', { type: 'button', text: 'Copier le lien', onclick: function () { AMX.copier(lienEstime(v), 'Lien copié — collez-le dans un texto ou montrez-le au comptoir'); } })); actions.appendChild(h('button.btn.fantome', { type: 'button', text: 'Page client', onclick: function () { window.open(lienEstime(v) + '&apercu=1', '_blank', 'noopener'); } })); }
      if (v.id && (v.statut === 'approuve' || v.statut === 'partiel')) {
        if (!v.termineLe) actions.appendChild(h('button.btn', { type: 'button', text: '✓ Véhicule prêt', title: 'Travaux terminés + texto au client avec le lien de paiement', onclick: function () { self.terminerTravaux(v, cfg, function (est) { rouvrir(est); }); } }));
        actions.appendChild(h('button.btn' + (pai && pai.statut === 'paye' ? '.fantome' : ''), { type: 'button', text: pai ? 'Paiement ' + (PAI_STATUTS[pai.statut] || '').toLowerCase() : '$ Demande de paiement', title: pai ? pai.id + ' · ' + argent(pai.montant) : 'Envoyer le montant à payer par texto (en ligne par carte si Clover est configuré)', onclick: function () { if (pai) self.ouvrirPaiement(pai.id); else self.nouveauPaiement(v); } }));
        actions.appendChild(h('button.btn', { type: 'button', text: v.courtoisieLe ? '★ Suivi envoyé' : '★ Suivi de courtoisie', title: 'Demander au client comment ça s\'est passé (note sur 5, lien Google)', onclick: function () { self.courtoisie(v, function (est) { rouvrir(est); }); } }));
      }
      if (v.id) actions.appendChild(h('button.btn.fantome', { type: 'button', text: 'Dupliquer', onclick: function () { self.action({ action: 'estimeDupliquer', id: v.id }, 'Copie créée').then(function (d) { if (d && d.ok) rouvrir(d.estime); }); } }));
      if (v.id && v.statut !== 'annule') actions.appendChild(h('button.btn.fantome.danger', { type: 'button', text: 'Annuler', onclick: function () { self.demanderTexte('Annuler ' + v.id, 'Raison (facultatif)', 'Client parti ailleurs, erreur…').then(function (raison) { if (raison === null) return; self.action({ action: 'estimeEtat', id: v.id, etat: 'annule', raison: raison }, 'Estimé annulé').then(function (d) { if (d && d.ok) rouvrir(d.estime); }); }); } }));
    }
    if (v.telephone) actions.appendChild(h('button.btn.fantome', { type: 'button', text: '💬 Conversation', onclick: function () { self.fermerFiche(); self.vue = 'conversations'; self.ouvrirTel = telChiffres(v.telephone); self.rendre(); } }));
    var corps = h('div.txt-fiche', [
      h('div.entete', [h('div', [titre, h('div.sous', { text: nomCie(v.compagnie) + (v.rdvId ? ' · rendez-vous ' + v.rdvId : '') + (v.creeLe ? ' · créé ' + quand(v.creeLe) + ' par ' + nomCourt(v.creePar) : '') })]), suivi]),
      v.id ? etapes : null,
      grilleClient,
      insp ? insp.el : null,
      h('h4', { style: { margin: '6px 0 4px', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--encre-3)' } }, 'Travaux proposés'),
      elLignes, peut ? btnLigne : null,
      elTotaux,
      h('div.grille.c2', [champ('Message au client', inNote), champ('Note interne', inNoteInt)]),
      elManques,
      actions,
      (v.approbations || []).length ? h('details', [h('summary', { style: { cursor: 'pointer', fontSize: '12px', color: 'var(--encre-3)' }, text: 'Approbations du client (' + v.approbations.length + ')' }), approbations]) : null,
      (v.journal || []).length ? h('details', [h('summary', { style: { cursor: 'pointer', fontSize: '12px', color: 'var(--encre-3)' }, text: 'Journal (' + v.journal.length + ')' }), journal]) : null
    ]);
    modale = AMX.modale({ titre: v.id ? 'Estimé ' + v.id + ' — ' + (v.client || '') : 'Nouvel estimé', corps: corps, large: true, sansPied: true, sansFocus: !neuf, classe: 'txt-pleine' });
    this.ficheOuverte = modale;
    this.fermerFiche = function () { try { modale.fermer(); } catch (e) {} self.ficheOuverte = null; };
  };
  VueTexto.prototype.fermerFiche = function () {};
  /* 29 oct. — un seul lien par visite : l'inspection en couleurs (vert = en bon état, jaune = à surveiller, rouge = à faire
     maintenant), la vidéo et les photos de toute la visite, en tête de la page du client. Un point jaune ou rouge devient un
     travail d'un clic. Les points viennent de la liste de la concession (cfg.mpi, 25 points par défaut). */
  var COULEURS_INSP = [['vert', '✓', 'En bon état'], ['jaune', '!', 'À surveiller'], ['rouge', '✕', 'À faire maintenant']];
  VueTexto.prototype.sectionInspection = function (v, cfg, peut, ctx) {
    var self = this, insp = v.inspection || null;
    if (!insp && !(cfg && cfg.mpi && cfg.mpi.length)) return null;   /* script d'avant le 29 oct. */
    var points = (insp && insp.points && insp.points.length) ? JSON.parse(JSON.stringify(insp.points)) : (cfg.mpi || []).map(function (g) { return { code: g.code, libelle: g.libelle, categorie: g.categorie, mesureUnite: g.mesure || '', couleur: '', mesure: '', note: '', gabarit: true }; });
    var medias = (insp && insp.medias) ? insp.medias.slice() : [];
    var det = h('details.txt-insp'), resume = h('span.resume');
    det.appendChild(h('summary', [h('b', 'Inspection du véhicule'), resume]));
    var inTech = h('input.saisie', { type: 'text', value: (insp && insp.technicien) || '', placeholder: 'Technicien (facultatif)' });
    var inNote = zoneTexte({ placeholder: 'Note de l\'inspection (le client la lit en tête de sa page)', style: { minHeight: '40px', marginTop: '8px' } }, (insp && insp.note) || '');
    if (!peut) { inTech.disabled = true; inNote.disabled = true; }
    var majResume = function () {
      var n = { rouge: 0, jaune: 0, vert: 0 }, reste = 0; points.forEach(function (p) { if (n[p.couleur] !== undefined) n[p.couleur]++; else reste++; });
      AMX.vider(resume);
      if (n.rouge) resume.appendChild(h('span.r-rouge', { text: n.rouge + ' à faire maintenant' }));
      if (n.jaune) resume.appendChild(h('span.r-jaune', { text: n.jaune + ' à surveiller' }));
      if (n.vert) resume.appendChild(h('span.r-vert', { text: n.vert + ' en bon état' }));
      if (reste) resume.appendChild(h('span.r-gris', { text: reste + ' à vérifier' }));
      if (medias.length) resume.appendChild(h('span.r-gris', { text: medias.length + (medias.length > 1 ? ' photos ou vidéos' : ' photo ou vidéo') }));
    };
    var elMedias = h('div.medias'), inFichier = h('input', { type: 'file', accept: 'image/*,video/*', multiple: true, style: { display: 'none' } }), etatEnvoi = h('span.doux');
    var rendreMedias;
    var poser = function (d) { if (!d || d.ok === false || d.refuse) throw new Error((d && (d.erreur || d.message)) || 'Envoi refusé'); medias = ((d.estime && d.estime.inspection) || {}).medias || medias; rendreMedias(); AMX.texto.invalider(); };
    var envoyerBlob = function (blob, nom, mime, surEtat) {
      var prep = /^image\//.test(mime) ? reduireImage(blob) : lireBase64(blob).then(function (b) { return { base64: b, mime: mime }; });
      return prep.then(function (p) {
        var octets = Math.round(p.base64.length * 0.75);
        if (octets > 35 * 1024 * 1024) throw new Error('Fichier trop lourd (' + Math.round(octets / 1048576) + ' Mo) — filmez moins de 90 secondes.');
        if (surEtat) surEtat('Envoi de ' + (/^video/.test(mime) ? 'la vidéo' : 'la photo') + ' (' + Math.round(octets / 1024) + ' Ko)…');
        self.enEcriture = true;
        return AMX.post({ action: 'estimeMedia', id: ctx.id(), cible: 'inspection', nom: nom || '', mime: p.mime, base64: p.base64 }, { delai: 240000 }).then(function (d) { self.enEcriture = false; poser(d); return true; }, function (e) { self.enEcriture = false; throw e; });
      });
    };
    rendreMedias = function () {
      AMX.vider(elMedias);
      medias.forEach(function (m) {
        elMedias.appendChild(h('div.media', { title: m.nom || '', onclick: function () { window.open(m.type === 'video' ? m.lecture : m.url, '_blank', 'noopener'); } }, [
          h('img', { src: m.apercu, alt: m.nom || '', loading: 'lazy', onerror: function () { this.style.display = 'none'; } }),
          m.type === 'video' ? h('span.lecture', { html: '&#9654;' }) : null,
          peut ? h('button.retirer', { type: 'button', text: '×', title: 'Retirer', onclick: function (ev) { ev.stopPropagation(); self.action({ action: 'estimeMediaRetirer', id: ctx.id(), mediaId: m.id }, 'Média retiré').then(function (d) { if (d && d.ok) { medias = ((d.estime && d.estime.inspection) || {}).medias || []; rendreMedias(); } }); } }) : null
        ]));
      });
      if (peut) {
        var exige = function () { if (!ctx.id()) { AMX.toast('Enregistrez d\'abord l\'estimé, puis ajoutez les photos et la vidéo.', 'attention'); return false; } return true; };
        elMedias.appendChild(h('div.media.ajout', { text: '📷 Photo / vidéo', title: 'Le client voit ces photos et vidéos en tête de sa page', onclick: function () { if (exige()) inFichier.click(); } }));
        if (AMX.enregistreurVideo) elMedias.appendChild(h('div.media.ajout', { text: '🎥 Filmer', title: 'Filmer avec la caméra (640 × 360, 90 s max)', onclick: function () { if (!exige()) return; AMX.enregistreurVideo({ titre: 'Vidéo pour ' + (v.client || ctx.id()), nomBase: 'video-' + ctx.id(), envoyer: envoyerBlob }); } }));
      }
      majResume();
    };
    inFichier.addEventListener('change', function () {
      var fichiers = [].slice.call(inFichier.files || []); inFichier.value = '';
      var suite = Promise.resolve();
      fichiers.forEach(function (f) { suite = suite.then(function () { return envoyerBlob(f, f.name, f.type || 'application/octet-stream', function (t) { etatEnvoi.textContent = t; }); }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); }); });
      suite.then(function () { etatEnvoi.textContent = ''; });
    });
    var elPoints = h('div');
    var rendrePoints = function () {
      AMX.vider(elPoints);
      var cats = []; points.forEach(function (p) { var c = p.categorie || 'Autres'; if (cats.indexOf(c) < 0) cats.push(c); });
      cats.forEach(function (c) {
        elPoints.appendChild(h('div.cat', { text: c }));
        points.filter(function (p) { return (p.categorie || 'Autres') === c; }).forEach(function (p) {
          var rangee = h('div.pt' + (p.couleur ? '.c-' + p.couleur : ''));
          var coul = h('div.coul');
          var btnTravail = h('button.btn.petit', { type: 'button', text: '→ Travail', title: 'Ajouter ce point aux travaux proposés' });
          var majTravail = function () { var deja = ctx.aLigne(p.code); btnTravail.style.visibility = (peut && p.code && (p.couleur === 'rouge' || p.couleur === 'jaune')) ? 'visible' : 'hidden'; btnTravail.disabled = deja; btnTravail.textContent = deja ? 'Au devis' : '→ Travail'; };
          COULEURS_INSP.forEach(function (x) {
            coul.appendChild(h('button.' + x[0] + (p.couleur === x[0] ? '.actif' : ''), { type: 'button', text: x[1], title: x[2], disabled: peut ? undefined : true, onclick: function () {
              p.couleur = p.couleur === x[0] ? '' : x[0];
              [].forEach.call(coul.querySelectorAll('button'), function (b) { b.classList.toggle('actif', !!p.couleur && b.classList.contains(p.couleur)); });
              rangee.className = 'pt' + (p.couleur ? ' c-' + p.couleur : ''); majTravail(); majResume();
            } }));
          });
          var inMes = h('input.saisie', { type: 'text', value: p.mesure || '', placeholder: p.mesureUnite ? 'mesure (' + p.mesureUnite + ')' : 'mesure', disabled: peut ? undefined : true });
          var inNt = h('input.saisie', { type: 'text', value: p.note || '', placeholder: 'note pour le client', disabled: peut ? undefined : true });
          inMes.addEventListener('input', function () { p.mesure = inMes.value.trim(); });
          inNt.addEventListener('input', function () { p.note = inNt.value.trim(); });
          btnTravail.addEventListener('click', function () { ctx.versTravail(p); majTravail(); });
          rangee.appendChild(h('div.lib', { text: p.libelle }));
          rangee.appendChild(coul); rangee.appendChild(inMes); rangee.appendChild(inNt); rangee.appendChild(btnTravail);
          majTravail();
          elPoints.appendChild(rangee);
        });
      });
      majResume();
    };
    var pied = h('div.pied-insp');
    if (peut) {
      pied.appendChild(h('button.btn.petit', { type: 'button', text: '✓ Le reste en bon état', title: 'Marquer en vert tous les points pas encore notés', onclick: function () { points.forEach(function (p) { if (!p.couleur) p.couleur = 'vert'; }); rendrePoints(); } }));
      pied.appendChild(h('button.btn.petit.fantome', { type: 'button', text: '+ Point', onclick: function () { self.demanderTexte('Ajouter un point', 'Ce que vous avez vérifié', 'Ex. Bruit à la roue avant').then(function (t) { t = String(t || '').trim(); if (!t) return; points.push({ code: '', libelle: t.slice(0, 80), categorie: 'Autres', mesureUnite: '', couleur: '', mesure: '', note: '', gabarit: false }); rendrePoints(); }); } }));
      pied.appendChild(h('span.doux', { text: 'Enregistrez l\'estimé pour garder l\'inspection.' }));
    }
    det.appendChild(h('div.tete-insp', [inTech, etatEnvoi]));
    det.appendChild(elMedias); det.appendChild(inFichier);
    det.appendChild(elPoints); det.appendChild(inNote); det.appendChild(pied);
    rendreMedias(); rendrePoints();
    if (points.some(function (p) { return p.couleur; }) || medias.length || (insp && insp.note)) det.open = true;
    return {
      el: det,
      aDesNotes: function () { return points.some(function (p) { return p.couleur; }); },
      lire: function () { return { technicien: inTech.value.trim(), note: inNote.value, points: points.filter(function (p) { return p.couleur || p.mesure || p.note || !p.gabarit; }).map(function (p) { return { code: p.code, libelle: p.libelle, categorie: p.categorie, couleur: p.couleur || '', mesure: p.mesure || '', note: p.note || '' }; }) }; }
    };
  };
  /* POST générique avec toast ; renvoie la réponse (ou null). */
  VueTexto.prototype.action = function (corps, messageOk) {
    var self = this; this.enEcriture = true;
    return AMX.post(corps, { delai: 60000 }).then(function (d) { self.enEcriture = false; if (!d || d.ok === false || d.refuse) { AMX.toast((d && (d.erreur || d.message)) || 'Refusé', 'erreur'); return d && d.ok === false ? d : null; } if (messageOk) AMX.toast(messageOk, 'ok'); AMX.texto.invalider(); self.charger(); return d; }, function (e) { self.enEcriture = false; AMX.toast(AMX.erreurTexte(e), 'erreur'); return null; });
  };
  VueTexto.prototype.demanderTexte = function (titre, message, placeholder, valeur) {
    return new Promise(function (res) {
      var champ = h('input.saisie', { type: 'text', placeholder: placeholder || '', autocomplete: 'off', value: valeur || '' }), fini = false;
      var m = AMX.modale({ titre: titre, corps: h('div', [h('p', { style: { margin: '0 0 12px', color: 'var(--encre-2)' }, text: message }), champ]), boutons: [{ texte: 'Annuler', action: function (f) { fini = true; res(null); f(); return false; } }, { texte: 'Continuer', classe: 'primaire', action: function (f) { fini = true; res(champ.value.trim()); f(); return false; } }], onFermer: function () { if (!fini) res(null); } });
      champ.addEventListener('keydown', function (e) { if (e.key === 'Enter') m.el.querySelector('.modale-pied .btn.primaire').click(); });
      setTimeout(function () { champ.focus(); }, 30);
    });
  };
  /* 28 oct. : la langue du client — celle de l'objet (estimé ou paiement complet), sinon celle de sa conversation. */
  VueTexto.prototype.langueDe = function (o) {
    if (!o) return { langue: 'fr' };
    var tel = telChiffres(o.telephone), d = this.donnees || {};
    var c = (d.conversations || []).filter(function (x) { return telChiffres(x.telephone) === tel && (!o.compagnie || !x.compagnie || x.compagnie === o.compagnie); })[0];
    if (o.langue) return { langue: o.langue === 'en' ? 'en' : 'fr', langueLe: c ? c.langueLe : '', langueCanal: c ? c.langueCanal : '' };
    return c ? { langue: c.langue === 'en' ? 'en' : 'fr', langueLe: c.langueLe, langueCanal: c.langueCanal } : { langue: 'fr' };
  };
  /* Modale d'envoi (estimé ou relance) : canaux, aperçu du texto, lien. */
  VueTexto.prototype.modaleEnvoi = function (v, cfg, relance, apres) {
    var self = this, textosActifs = !!(this.donnees && this.donnees.textos && this.donnees.textos.actif), tel = telChiffres(v.telephone);
    var cbT = h('input', { type: 'checkbox', checked: tel && textosActifs ? true : undefined, disabled: tel && textosActifs ? undefined : true });
    var cbC = h('input', { type: 'checkbox', checked: /@/.test(v.courriel || '') && !relance ? true : undefined, disabled: /@/.test(v.courriel || '') ? undefined : true });
    var lg = this.langueDe(v), modele = modeleL(cfg, relance ? 'relance' : 'estime', lg.langue);
    var defaut = modele ? gabarit(modele.texte, { prenom: prenom(v.client), client: v.client, concession: nomCie(v.compagnie), vehicule: v.vehicule, ref: v.id, bt: v.btNo || '', total: argentL(v.total, lg.langue), lien: lienEstime(v), conseiller: cfg.signature || nomCourt(AMX.session.courriel) }, lg.langue) : '';
    var inMsg = zoneTexte({ placeholder: 'Texto envoyé au client', style: { minHeight: '70px' } }, defaut);
    var compte = h('div.doux.petit', { style: { textAlign: 'right' } });
    var majCompte = function () { var n = inMsg.value.length + (relance ? 0 : 50); compte.textContent = n + ' caractères' + (n > 160 ? ' · ' + Math.ceil(n / 153) + ' textos' : ''); };
    inMsg.addEventListener('input', majCompte); majCompte();
    var corps = h('div.txt-envoi', [
      h('p', { text: relance ? 'Un rappel au client : le lien vers son estimé est ajouté au message.' : 'Le client reçoit un lien vers une page sans compte : les travaux avec les prix, les photos, Approuver / Refuser par ligne, Tout approuver. Il peut aussi répondre OUI ' + v.id + ' ou NON ' + v.id + ' par texto.' }),
      avisLangue(lg.langue, lg),
      h('label.champ.inline', [cbT, h('span', { text: 'Texto' + (tel ? ' au ' + telJoli(tel) : ' — aucun cellulaire') + (!textosActifs ? ' — textos non configurés' : '') })]),
      h('label.champ.inline', [cbC, h('span', { text: 'Courriel' + (v.courriel ? ' à ' + v.courriel : ' — aucune adresse') })]),
      h('div.champ', { style: { marginTop: '8px' } }, [h('label', 'Message'), inMsg, compte, relance ? null : h('span.aide', lg.langue === 'en' ? '« Reply STOP to opt out. » est ajouté automatiquement.' : '« Répondez ARRET ou STOP pour ne plus recevoir de textos » est ajouté automatiquement.')]),
      h('div.champ', { style: { marginTop: '8px' } }, [h('label', 'Lien de la page client'), h('div', { style: { display: 'flex', gap: '6px' } }, [h('input.saisie.mono', { type: 'text', value: lienEstime(v), readonly: true, style: { fontSize: '12px' } }), h('button.btn.petit', { type: 'button', text: 'Copier', onclick: function () { AMX.copier(lienEstime(v), 'Lien copié'); } })])])
    ]);
    AMX.modale({ titre: (relance ? 'Relancer ' : 'Envoyer ') + v.id + ' — ' + (v.client || ''), corps: corps, boutons: [{ texte: 'Annuler' }, { texte: relance ? 'Relancer' : 'Envoyer', classe: 'primaire', action: function () {
      if (!cbT.checked && !cbC.checked) { AMX.toast('Cochez texto ou courriel (ou copiez le lien).', 'erreur'); return false; }
      return self.action({ action: relance ? 'estimeRelancer' : 'estimeEnvoyer', id: v.id, canaux: { texto: cbT.checked, courriel: cbC.checked }, message: inMsg.value.trim() === defaut ? '' : inMsg.value.trim() }, null).then(function (d) {
        if (!d || !d.ok) return false;
        if (d.envoye && d.envoye.length) AMX.toast((relance ? 'Relance envoyée' : 'Estimé envoyé') + ' par ' + d.envoye.join(' et '), 'ok'); else AMX.toast('Rien n\'est parti — copiez le lien.', 'attention', 7000);
        (d.erreurs || []).forEach(function (x) { AMX.toast(x, 'attention', 7000); });
        if (apres) apres(d.estime);
        return true;
      });
    } }] });
  };
  /* Travaux terminés : date posée, puis on propose (case cochée) le texto « véhicule prêt ». */
  /* 28 oct. (étape 2) : « véhicule prêt » en un geste — travaux terminés, demande de paiement du montant approuvé et UN texto
     (véhicule, montant, bon de travail, lien de paiement). POST estimePret ; {lien} est remplacé par le serveur. */
  VueTexto.prototype.terminerTravaux = function (v, cfg, apres) {
    var self = this, tel = telChiffres(v.telephone), textosActifs = !!(this.donnees && this.donnees.textos && this.donnees.textos.actif);
    var pai = v.paiementId && this.donnees ? (this.donnees.paiements || []).filter(function (p) { return p.id === v.paiementId; })[0] : null;
    var aPayer = !(pai && pai.statut !== 'en_attente') && Number(v.totalApprouveTaxes || 0) > 0;
    var lg = this.langueDe(v), modeleDe = function (id) { return modeleL(cfg, id, lg.langue); };
    var vars = function (avecPaiement) { return { prenom: prenom(v.client), client: v.client, concession: nomCie(v.compagnie), vehicule: v.vehicule, ref: v.id, bt: v.btNo || '', montant: avecPaiement ? argentL(pai ? pai.montant : v.totalApprouveTaxes, lg.langue) : '', conseiller: cfg.signature || nomCourt(AMX.session.courriel) }; };
    var texteDe = function (avecPaiement) { var m = modeleDe(avecPaiement ? 'pretPayer' : 'pret'); var t = m ? m.texte : (avecPaiement ? '{concession} : votre {vehicule}{bt} est prêt ! Montant à payer : {montant}. Payez en ligne avant de venir le chercher : {lien}' : '{concession} : votre {vehicule}{bt} est prêt. Vous pouvez venir le chercher au service.'); return gabarit(t, vars(avecPaiement), lg.langue); };
    var cb = h('input', { type: 'checkbox', checked: tel && textosActifs ? true : undefined, disabled: tel && textosActifs ? undefined : true });
    var cbPai = h('input', { type: 'checkbox', checked: aPayer ? true : undefined, disabled: aPayer ? undefined : true });
    var inMsg = zoneTexte({ style: { minHeight: '70px' } }, texteDe(aPayer)), touche = false;
    inMsg.addEventListener('input', function () { touche = true; });
    cbPai.addEventListener('change', function () { if (!touche) inMsg.value = texteDe(cbPai.checked); });
    var aide = h('div.aide', { text: '« {lien} » devient le lien de paiement (Clover si la concession est branchée, sinon la page avec le montant et les façons de payer).' });
    var majAide = function () { aide.classList.toggle('cache', !cbPai.checked); }; cbPai.addEventListener('change', majAide); majAide();
    AMX.modale({ titre: 'Véhicule prêt — ' + v.id, corps: h('div.txt-envoi', [
      h('p', 'Les travaux sont marqués terminés (le suivi de courtoisie compte à partir d\'ici).'), avisLangue(lg.langue, lg),
      h('label.champ.inline', [cb, h('span', { text: 'Prévenir le client par texto' + (tel ? ' au ' + telJoli(tel) : ' — aucun cellulaire') + (tel && !textosActifs ? ' (textos non configurés)' : '') })]),
      h('label.champ.inline', [cbPai, h('span', { text: aPayer ? 'Joindre le lien de paiement (' + argent(pai ? pai.montant : v.totalApprouveTaxes) + (pai ? ', ' + pai.id : ' taxes incluses') + ')' : (pai && pai.statut === 'paye' ? 'Déjà payé (' + pai.id + ')' : 'Rien à payer sur cet estimé') })]),
      h('div.champ', { style: { marginTop: '8px' } }, [h('label', 'Texto'), inMsg]), aide
    ]), boutons: [{ texte: 'Annuler' }, { texte: 'Confirmer', classe: 'primaire', action: function () {
      return self.action({ action: 'estimePret', id: v.id, texto: cb.checked, paiement: cbPai.checked, message: inMsg.value.trim() }, null).then(function (d) {
        if (!d || !d.ok) return false;
        AMX.toast('Véhicule prêt' + (d.paiement ? ' · paiement ' + d.paiement.id : '') + ((d.envoye || []).length ? ' · client prévenu par texto' : ''), 'ok');
        (d.erreurs || []).forEach(function (x) { AMX.toast(x, 'attention', 8000); });
        if (apres) apres(d.estime); return true;
      });
    } }] });
  };
  /* 28 oct. : comment le compte est prévenu qu'un client attend une réponse depuis 10 minutes (texto, courriel ou rien).
     Demande de Maxime : « texto ou courriel selon la préférence, après 10 minutes ». POST textoAlertePref. */
  VueTexto.prototype.mesAlertes = function () {
    var self = this, a = (this.donnees && this.donnees.alertePref) || null;
    if (!a) { AMX.toast('Le script n\'est pas encore à jour (Reception.gs) : réessayez après le déploiement.', 'attention', 7000); return; }
    var choix = a.pref || '', boutons = [];
    var ligne = function (val, titre, detail, actif) {
      var r = h('input', { type: 'radio', name: 'txt-alerte', value: val, checked: choix === val ? true : undefined, disabled: actif === false ? true : undefined });
      r.addEventListener('change', function () { choix = val; });
      return h('label.champ.inline', { style: { alignItems: 'flex-start', marginTop: '6px' } }, [r, h('span', [h('b', { text: titre }), h('div.aide', { text: detail })])]);
    };
    var defaut = a.telephone && a.textosActifs ? 'texto au ' + a.telephone : 'courriel';
    var corps = h('div.txt-envoi', [
      h('p', { text: 'Quand un client attend une réponse par texto depuis 10 minutes (de 7 h à 20 h), ScanAutomax prévient le responsable de la conversation ; sans responsable, l\'équipe du service de la concession.' }),
      ligne('', 'Par défaut', 'En ce moment : ' + defaut + '.'),
      ligne('texto', 'Par texto', a.telephone ? 'Au ' + a.telephone + (a.textosActifs ? '' : ' (textos pas configurés : courriel en attendant)') : 'Aucun cellulaire dans votre compte : ajoutez-le dans le menu du compte › Mon cellulaire.', !!a.telephone),
      ligne('courriel', 'Par courriel', 'À votre adresse ScanAutomax.'),
      ligne('aucune', 'Ne pas me prévenir', 'Vous verrez quand même les clients en rouge dans Conversations et dans l\'Accueil.')
    ]);
    AMX.modale({ titre: 'Mes alertes — client sans réponse', corps: corps, boutons: [{ texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: function () {
      return self.action({ action: 'textoAlertePref', pref: choix }, null).then(function (d) {
        if (!d || !d.ok) return false;
        if (self.donnees) self.donnees.alertePref = d.alertePref;
        var e = d.alertePref ? d.alertePref.effectif : choix;
        AMX.toast(e === 'aucune' ? 'Vous ne serez plus prévenu' : 'Vous serez prévenu par ' + (e === 'texto' ? 'texto' : 'courriel'), 'ok');
        return true;
      });
    } }] });
  };
  /* 28 oct. (étape 2) : texto « paiement reçu » proposé quand le paiement est marqué payé (le conseiller l'envoie ; rien d'automatique). */
  VueTexto.prototype.textoPaye = function (p) {
    var self = this, cfg = this.config(p.compagnie) || { modeles: [] }, tel = telChiffres(p.telephone);
    var lg = this.langueDe(p), m = modeleL(cfg, 'paye', lg.langue);
    var inMsg = zoneTexte({ style: { minHeight: '60px' } }, gabarit(m ? m.texte : '{concession} : nous avons bien reçu votre paiement de {montant}{bt}. Merci ! Vos clés vous attendent au comptoir du service.', { prenom: prenom(p.client), client: p.client, concession: nomCie(p.compagnie), vehicule: p.vehicule, montant: argentL(p.montant, lg.langue), bt: p.btNo || '', conseiller: cfg.signature || nomCourt(AMX.session.courriel) }, lg.langue));
    AMX.modale({ titre: 'Texto « paiement reçu »', corps: h('div.txt-envoi', [avisLangue(lg.langue, lg), h('p', { text: 'À ' + (p.client || '') + (tel ? ' · ' + telJoli(tel) : '') }), inMsg]), boutons: [{ texte: 'Annuler' }, { texte: 'Envoyer', classe: 'primaire', action: function () {
      if (!tel) { AMX.toast('Aucun cellulaire pour ce paiement.', 'erreur'); return false; }
      return self.action({ action: 'textoEnvoyer', compagnie: p.compagnie, telephone: tel, texte: inMsg.value.trim(), client: p.client, vehicule: p.vehicule }, 'Texto envoyé').then(function (d) { return !!(d && d.ok); });
    } }] });
  };
  VueTexto.prototype.courtoisie = function (v, apres) {
    var self = this, d0 = this.donnees || {}, viaAvis = !!d0.avisModule;
    AMX.confirmer('Suivi de courtoisie — ' + (v.client || v.id), viaAvis ? 'Le client reçoit la demande d\'avis du module Avis (note sur 5, commentaire, lien Google ; alerte au directeur si ≤ 3 ; rappel à 3 jours ; jamais hors 9 h – 20 h).' : 'Le client reçoit un texto : « Comment ça s\'est passé ? Répondez par une note de 1 à 5 ». Sa note s\'inscrit sur l\'estimé ; 4 ou 5 → lien Google ; 3 ou moins → les directeurs sont prévenus.' + (v.courtoisieLe ? '\n\nUn suivi a déjà été envoyé ' + quand(v.courtoisieLe) + ' — en envoyer un autre ?' : ''), { ok: 'Envoyer' }).then(function (oui) {
      if (!oui) return;
      self.action({ action: 'estimeCourtoisie', id: v.id, encore: !!v.courtoisieLe }, null).then(function (d) { if (!d || !d.ok) return; AMX.toast(d.via === 'avis' ? 'Demande d\'avis envoyée' + (d.envoi && d.envoi.horsHeures ? ' — partira à 9 h' : '') : 'Suivi envoyé par texto', 'ok'); if (apres) apres(d.estime); });
    });
  };

  /* ------------------------------------------------------------------ conversations */
  VueTexto.prototype.rendreConversations = function () {
    var self = this, toutes = this.liste('conversations'), maintenant = Date.now();
    var nAttente = toutes.filter(function (c) { return minutesSansReponse(c, maintenant); }).length, nMoi = toutes.filter(function (c) { return estMoi(c.conseiller); }).length;
    var f = this.filtreConv || '';
    var convs = toutes.filter(function (c) { return f === 'attente' ? minutesSansReponse(c, maintenant) : (f === 'moi' ? estMoi(c.conseiller) : true); });
    /* les clients qui attendent le plus longtemps d'abord ; le reste dans l'ordre d'avant */
    convs = convs.map(function (c, i) { return { c: c, i: i, m: minutesSansReponse(c, maintenant) }; }).sort(function (a, b) { return (b.m ? 1 : 0) - (a.m ? 1 : 0) || b.m - a.m || a.i - b.i; }).map(function (x) { return x.c; });
    this.elCompte.textContent = convs.length + ' conversation' + (convs.length > 1 ? 's' : '');
    if (this.ouvrirTel) { var c0 = convs.filter(function (c) { return c.telephone === self.ouvrirTel; })[0]; if (c0) this.convId = c0.id; else if (this.peutEcrire()) { var telV = this.ouvrirTel; this.ouvrirTel = ''; setTimeout(function () { self.nouveauTexto({ telephone: telV }); }, 100); } this.ouvrirTel = ''; }
    var liste = h('div.txt-liste' + (this.convId ? '.cache-mobile' : ''));
    var segConv = function (cle, libelle, n) { return h('button' + (f === cle ? '.actif' : '') + (cle === 'attente' && n ? '.rouge' : ''), { type: 'button', text: libelle + (n !== undefined ? ' ' + n : ''), onclick: function () { self.filtreConv = cle; self.rendreCorps(); } }); };
    liste.appendChild(h('div.seg-conv', [segConv('', 'Toutes'), segConv('moi', 'Les miennes', nMoi), segConv('attente', 'Sans réponse', nAttente)]));
    if (!convs.length) liste.appendChild(h('div.vide-petit', { text: f === 'attente' ? 'Aucun client n\'attend de réponse depuis ' + ATTENTE_MIN + ' minutes.' : (f === 'moi' ? 'Aucune conversation dont vous êtes responsable.' : (this.recherche ? 'Aucune conversation ne correspond.' : 'Aucune conversation. Les textos envoyés et reçus apparaissent ici.')) }));
    convs.forEach(function (c) {
      var mAtt = minutesSansReponse(c, maintenant);
      liste.appendChild(h('div.item' + (c.nonLus ? '.nonlu' : '') + (mAtt ? '.attend' : '') + (c.id === self.convId ? '.actif' : ''), { onclick: function () { self.convId = c.id; self.rendreCorps(); } }, [
        avatar(c.client, c.telephone),
        h('div.nom', [c.client || telJoli(c.telephone), c.nonLus ? h('span.badge-nonlu', { text: c.nonLus }) : null, c.stop ? h('span.stop', ' STOP') : null]),
        h('div.q', mAtt ? [h('span.attente', { text: dureeAttente(mAtt), title: 'Le client attend une réponse depuis ' + dureeAttente(mAtt) })] : [quand(c.dernierLe || c.maj)]),
        h('div.tel', [h('span', { html: ICO_NAV.tel, style: { width: '13px', height: '13px', display: 'inline-flex' } }), c.client ? telJoli(c.telephone) : (c.compagnie ? nomCie(c.compagnie) : 'Numéro inconnu')]),
        h('div.apercu', { text: (c.dernierSens === 'sortant' ? 'Vous : ' : '') + (c.dernierTexte || '') }),
        h('div.cie', { text: [self.compagnie ? '' : nomCie(c.compagnie), c.vehicule || '', c.conseiller ? (estMoi(c.conseiller) ? 'vous' : nomCourt(c.conseiller)) : 'sans responsable'].filter(Boolean).join(' · ') })
      ]));
    });
    var fil = h('div.txt-fil' + (this.convId ? '' : '.cache-mobile'));
    if (!this.convId) fil.appendChild(h('div.vide-fil', [h('span', { html: ICO_NAV.conversations }), h('div', { text: 'Choisissez une conversation' }), this.peutEcrire() ? h('button.btn.petit', { type: 'button', text: 'Nouveau message', onclick: function () { self.nouveauTexto(); } }) : null]));
    else this.rendreFil(fil, convs.filter(function (c) { return c.id === self.convId; })[0]);
    this.elCorps.appendChild(h('div.txt-conv', [liste, fil]));
  };
  VueTexto.prototype.chargerFil = function (id, silencieux) {
    var self = this;
    return AMX.get({ textoMessages: 1, id: id }, { secours: false, essais: 1 }).then(function (d) {
      if (!d || !d.ok) throw new Error((d && (d.erreur || d.message)) || 'Fil introuvable');
      var avant = self.messages && self.messages.conversation.id === id ? self.messages.messages.length : -1;
      self.messages = d;
      if (self.donnees) { var c = (self.donnees.conversations || []).filter(function (x) { return x.id === id; })[0]; if (c && c.nonLus) { c.nonLus = 0; self.rendreKpis(); if (AMX.rafraichirSousBarre) AMX.rafraichirSousBarre(); } }
      if (self.vue === 'conversations' && self.convId === id && (!silencieux || avant !== d.messages.length)) self.rendreCorps();
      return d;
    }).catch(function (e) { if (!silencieux) AMX.toast(AMX.erreurTexte(e), 'erreur'); });
  };
  VueTexto.prototype.rendreFil = function (fil, c) {
    var self = this;
    if (!c) { fil.appendChild(h('div.vide-petit', 'Conversation introuvable.')); return; }
    var cfg = this.config(c.compagnie) || { modeles: [] }, peut = c.peutEcrire && this.peutEcrire();
    var tete = h('div.tete', [
      h('button.btn.petit.fantome', { type: 'button', text: '‹', title: 'Retour à la liste', style: { display: 'none' }, class: 'retour', onclick: function () { self.convId = ''; self.rendreCorps(); } }),
      avatar(c.client, c.telephone),
      h('div', { style: { flex: '1 1 200px', minWidth: 0 } }, [h('div.nom', { text: c.client || telJoli(c.telephone) }), h('div.d', { text: (c.client ? telJoli(c.telephone) + ' · ' : '') + nomCie(c.compagnie) + (c.vehicule ? ' · ' + c.vehicule : '') + ' · responsable : ' + (c.conseiller ? (estMoi(c.conseiller) ? 'vous' : nomCourt(c.conseiller)) : 'personne') })]),
      h('div.actions', [
        peut && !estMoi(c.conseiller) ? h('button.btn.petit' + (c.conseiller ? '.fantome' : '.primaire'), { type: 'button', text: 'Je m\'en occupe', title: c.conseiller ? 'Prendre la conversation de ' + nomCourt(c.conseiller) : 'Devenir le responsable de cette conversation', onclick: function () { self.action({ action: 'textoConversation', id: c.id, conseiller: AMX.session.courriel }, 'Vous êtes responsable de cette conversation').then(function () { self.rendreCorps(); }); } }) : null,
        peut ? h('button.btn.petit', { type: 'button', text: '+ Estimé', onclick: function () { self.ouvrirEstime(null, { compagnie: c.compagnie, client: c.client, telephone: c.telephone, clientId: c.clientId, vin: c.vin, vehicule: c.vehicule }); } }) : null,
        peut ? h('button.btn.petit', { type: 'button', text: '$ Paiement', onclick: function () { self.nouveauPaiement({ compagnie: c.compagnie, client: c.client, telephone: c.telephone, vehicule: c.vehicule }); } }) : null,
        peut ? h('select.saisie.langue', { title: c.langueLe ? 'Demandé ' + (CANAUX_LANGUE[c.langueCanal] || '') + ' ' + quand(c.langueLe) : 'Français par défaut ; l\'anglais seulement si le client le demande', onchange: function (e) { var voulu = e.target.value; AMX.confirmer(voulu === 'en' ? 'Écrire en anglais' : 'Revenir au français', voulu === 'en' ? 'Seulement si ' + (c.client || 'le client') + ' a demandé l\'anglais. Sa demande est consignée (vous, aujourd\'hui) ; les modèles, les pages de l\'estimé et du paiement passent en anglais.' : 'Les textos, les pages et les courriels de ' + (c.client || 'ce client') + ' repassent en français.', { ok: 'Confirmer' }).then(function (oui) { if (!oui) { e.target.value = c.langue === 'en' ? 'en' : 'fr'; return; } self.action({ action: 'textoLangue', conversationId: c.id, langue: voulu, canal: 'conseiller' }, voulu === 'en' ? 'Client noté anglophone' : 'Client noté francophone').then(function (d) { if (d && d.ok) self.charger(true).then(function () { self.rendreCorps(); }); else e.target.value = c.langue === 'en' ? 'en' : 'fr'; }); }); } }, [h('option', { value: 'fr', selected: c.langue !== 'en' ? true : undefined, text: 'Français' }), h('option', { value: 'en', selected: c.langue === 'en' ? true : undefined, text: 'English (demandé)' })]) : null,
        peut ? h('button.btn.petit.fantome', { type: 'button', text: c.client ? 'Renommer' : 'Nommer', onclick: function () { self.demanderTexte('Nom du client', 'Tel qu\'il apparaît dans la liste', 'Prénom et nom', c.client).then(function (nom) { if (nom === null) return; self.action({ action: 'textoConversation', id: c.id, client: nom }, 'Nom enregistré').then(function (d) { if (d && d.ok) self.rendreCorps(); }); }); } }) : null,
        peut && !c.compagnie ? h('select.saisie', { style: { height: '27px', fontSize: '12px' }, onchange: function (e) { if (!e.target.value) return; self.action({ action: 'textoConversation', id: c.id, compagnie: e.target.value }, 'Conversation attribuée à ' + nomCie(e.target.value)).then(function () { self.rendreCorps(); }); } }, [h('option', { value: '', text: 'Attribuer à…' })].concat(AMX.codesPour('service').map(function (k) { return h('option', { value: k, text: nomCie(k) }); }))) : null,
        peut ? h('button.btn.petit.fantome', { type: 'button', text: c.etat === 'fermee' ? 'Rouvrir' : 'Fermer', onclick: function () { self.action({ action: 'textoConversation', id: c.id, etat: c.etat === 'fermee' ? 'ouverte' : 'fermee' }, c.etat === 'fermee' ? 'Conversation rouverte' : 'Conversation fermée').then(function () { self.rendreCorps(); }); } }) : null,
        c.stop && peut ? h('button.btn.petit.fantome', { type: 'button', text: 'Rétablir les textos', title: 'Le client a redemandé les textos (au comptoir)', onclick: function () { AMX.confirmer('Rétablir les textos', 'Seulement si ' + (c.client || 'le client') + ' a redemandé lui-même à recevoir nos textos.', { ok: 'Rétablir' }).then(function (oui) { if (oui) self.action({ action: 'textoConversation', id: c.id, stop: 'non' }, 'Textos rétablis').then(function () { self.rendreCorps(); }); }); } }) : null
      ])
    ]);
    if (window.innerWidth <= 860) tete.querySelector('.retour').style.display = '';
    fil.appendChild(tete);
    if (c.stop) fil.appendChild(h('div.stop-bandeau', { text: 'Ce client a répondu STOP : plus aucun texto ne peut lui être envoyé. Appelez-le' + (c.telephone ? ' au ' + telJoli(c.telephone) : '') + '.' }));
    var zone = h('div.messages');
    var d = this.messages && this.messages.conversation && this.messages.conversation.id === c.id ? this.messages : null;
    if (!d) { zone.appendChild(AMX.chargeur('Messages', { compact: true })); this.chargerFil(c.id); }
    else {
      var dernierJour = '';
      if (!d.messages.length) zone.appendChild(h('div.jour', 'Aucun message pour l\'instant'));
      d.messages.forEach(function (m) {
        var jour = new Date(m.le).toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' });
        if (jour !== dernierJour) { zone.appendChild(h('div.jour', { text: jour })); dernierJour = jour; }
        var texte = String(m.texte || ''), html = AMX.esc(texte).replace(/(https?:\/\/\S+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
        var medias = (m.medias || []).length ? h('div.bulle-medias', (m.medias || []).map(function (x) { return h('a.bm', { href: x.type === 'video' ? x.lecture : x.url, target: '_blank', rel: 'noopener', title: x.nom || '' }, [h('img', { src: x.apercu, alt: x.nom || '', loading: 'lazy', onerror: function () { this.style.display = 'none'; } }), x.type === 'video' ? h('span.lecture', { html: '&#9654;' }) : null]); })) : null;
        var auteur = m.par === 'automatique' ? 'automatique' : (/^campagne /.test(m.par || '') ? m.par : nomCourt(m.par));
        zone.appendChild(h('div.bulle.' + m.sens + (m.par === 'automatique' || /^campagne /.test(m.par || '') ? '.automatique' : '') + (m.statut === 'echec' ? '.echec' : ''), [medias, h('span', { html: html }), h('span.meta', { text: new Date(m.le).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' }) + (m.sens === 'sortant' ? ' · ' + auteur : '') + (m.statut === 'echec' ? ' · NON ENVOYÉ' + (m.detail ? ' (' + m.detail + ')' : '') : (m.statut === 'attente' ? ' · en attente' : '')) + (m.estimeId ? ' · ' + m.estimeId : '') + (m.detail && /^(campagne|note)/.test(m.detail) && m.statut !== 'echec' ? ' · ' + m.detail : '') })]));
      });
      if ((d.estimes || []).length) { var liens = h('div.jour', { style: { marginTop: '6px' } }); d.estimes.slice(0, 4).forEach(function (e) { liens.appendChild(h('a', { href: '#', style: { marginRight: '8px' }, text: e.id + ' ' + (STATUTS[e.statut] || e.statut) + ' ' + argent(e.total), onclick: function (ev) { ev.preventDefault(); self.ouvrirEstime(e.id); } })); }); zone.appendChild(liens); }
    }
    fil.appendChild(zone);
    setTimeout(function () { zone.scrollTop = zone.scrollHeight; }, 20);
    if (peut && !c.stop) {
      var inMsg = zoneTexte({ placeholder: 'Écrire au client… (Entrée = envoyer, Maj+Entrée = nouvelle ligne)' });
      var compte = h('div.compte');
      var majCompte = function () { var n = inMsg.value.length; compte.textContent = n ? n + ' car.' + (n > 160 ? ' · ' + Math.ceil(n / 153) + ' textos' : '') : ''; };
      inMsg.addEventListener('input', majCompte);
      var btnEnvoyer = h('button.btn.primaire', { type: 'button', text: 'Envoyer' });
      var envoyer = function () {
        var t = inMsg.value.trim(); if (!t) return;
        btnEnvoyer.classList.add('occupe'); inMsg.disabled = true;
        self.action({ action: 'textoEnvoyer', conversationId: c.id, compagnie: c.compagnie, telephone: c.telephone, texte: t }, null).then(function (d2) {
          btnEnvoyer.classList.remove('occupe'); inMsg.disabled = false;
          if (d2 && d2.ok) { inMsg.value = ''; majCompte(); self.chargerFil(c.id); } else if (d2 && d2.message) { self.chargerFil(c.id); }
          inMsg.focus();
        });
      };
      btnEnvoyer.addEventListener('click', envoyer);
      inMsg.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyer(); } });
      var modeles = h('div.modeles');
      var lgC = c.langue === 'en' ? 'en' : 'fr';
      (cfg.modeles || []).filter(function (m) { return ['estime', 'relance', 'paiement', 'courtoisie', 'pretPayer'].indexOf(m.id) < 0; }).forEach(function (m) { var mL = modeleL(cfg, m.id, lgC) || m; modeles.appendChild(h('button', { type: 'button', text: m.titre, title: mL.texte, onclick: function () { inMsg.value = gabarit(mL.texte, { prenom: prenom(c.client), client: c.client, concession: nomCie(c.compagnie), vehicule: c.vehicule, conseiller: cfg.signature || nomCourt(AMX.session.courriel) }, lgC); majCompte(); inMsg.focus(); } })); });
      var btnMedia = self.boutonMedia ? self.boutonMedia(c, inMsg) : null;
      fil.appendChild(h('div.composer', [modeles, h('div.rangee', [inMsg, btnMedia, btnEnvoyer]), compte]));
      setTimeout(function () { try { inMsg.focus(); } catch (e) {} }, 50);
    }
  };
  /* Nouveau texto : concession, client (recherche dans RdvClients), numéro, message. */
  VueTexto.prototype.nouveauTexto = function (prefill) {
    var self = this, cie = (prefill && prefill.compagnie) || this.compagnie, codes = AMX.codesPour('service');
    if (!this.peutEcrire()) { AMX.toast('Lecture seule.', 'erreur'); return; }
    var selCie = h('select.saisie', codes.map(function (k) { return h('option', { value: k, selected: k === cie ? true : undefined, text: nomCie(k) }); }));
    var inClient = h('input.saisie', { type: 'text', value: (prefill && prefill.client) || '', placeholder: 'Prénom et nom (recherche dans les clients du service)', autocomplete: 'off' });
    var inTel = h('input.saisie', { type: 'tel', value: prefill && prefill.telephone ? telJoli(prefill.telephone) : '', placeholder: '514 555-1234', autocomplete: 'off' });
    var resultats = h('div.resultats-clients.cache'), clientId = '';
    var chercher = AMX.debounce(function (q) {
      q = String(q || '').trim(); if (q.length < 3) { resultats.classList.add('cache'); return; }
      AMX.get({ rdvClients: 1, compagnie: selCie.value, q: q }, { secours: false, essais: 1 }).then(function (d) { AMX.vider(resultats); if (!d || !d.ok || !(d.clients || []).length) { resultats.classList.add('cache'); return; } d.clients.forEach(function (c) { resultats.appendChild(h('button', { type: 'button', onclick: function () { clientId = c.id; inClient.value = c.affichage; inTel.value = c.telephoneJoli || c.telephone; resultats.classList.add('cache'); } }, [h('b', { text: c.affichage }), h('span.d', { text: ' · ' + (c.telephoneJoli || '') })])); }); resultats.classList.remove('cache'); }).catch(function () { resultats.classList.add('cache'); });
    }, 250);
    inClient.addEventListener('input', function () { clientId = ''; chercher(inClient.value); });
    var inMsg = zoneTexte({ placeholder: 'Message…', style: { minHeight: '80px' } }, '');
    var modeles = h('div.modeles', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } });
    var majModeles = function () { AMX.vider(modeles); var cfg = self.config(selCie.value) || { modeles: [] }; (cfg.modeles || []).filter(function (m) { return ['estime', 'relance', 'paiement', 'courtoisie'].indexOf(m.id) < 0; }).forEach(function (m) { modeles.appendChild(h('button.btn.petit.fantome', { type: 'button', text: m.titre, onclick: function () { inMsg.value = gabarit(m.texte, { prenom: prenom(inClient.value), client: inClient.value, concession: nomCie(selCie.value), vehicule: 'véhicule', conseiller: cfg.signature || nomCourt(AMX.session.courriel) }); } })); }); };
    selCie.addEventListener('change', majModeles); majModeles();
    var corps = h('div.rdv-form', [h('div.grille.c2', [h('div.champ', [h('label', 'Concession'), selCie]), h('div.champ', [h('label', 'Cellulaire'), inTel]), h('div.champ', { style: { gridColumn: '1 / -1' } }, [h('label', 'Client'), inClient, resultats])]), h('div.champ', { style: { marginTop: '10px' } }, [h('label', 'Message'), inMsg, modeles])]);
    AMX.modale({ titre: 'Nouveau texto', corps: corps, boutons: [{ texte: 'Annuler' }, { texte: 'Envoyer', classe: 'primaire', action: function () {
      var tel = telChiffres(inTel.value); if (tel.length !== 10) { AMX.toast('Cellulaire à 10 chiffres requis', 'erreur'); return false; }
      if (!inMsg.value.trim()) { AMX.toast('Message vide', 'erreur'); return false; }
      return self.action({ action: 'textoEnvoyer', compagnie: selCie.value, telephone: tel, texte: inMsg.value.trim(), client: inClient.value.trim(), clientId: clientId }, 'Texto envoyé').then(function (d) { if (!d || !d.ok) return false; self.vue = 'conversations'; self.convId = d.conversation.id; self.messages = null; self.compagnie = AMX.compagnieChoisie('service') || self.compagnie; self.charger(true).then(function () { self.rendre(); }); return true; });
    } }] });
  };

  /* ------------------------------------------------------------------ paiements */
  function filtrePai(p, f) { if (!f) return true; if (f === 'en_attente' || f === 'paye') return p.statut === f; if (f === 'en_ligne') return p.statut === 'paye' && p.moyen === 'en_ligne'; if (f === 'en_personne') return p.statut === 'paye' && p.moyen !== 'en_ligne'; if (f === 'annule') return p.statut === 'annule' || p.statut === 'rembourse'; return true; }
  VueTexto.prototype.rendrePaiements = function () {
    var self = this, liste = this.liste('paiements');
    this.elCompte.textContent = liste.length + ' paiement' + (liste.length > 1 ? 's' : '');
    var d = this.donnees || {}, cies = this.compagnie ? [this.compagnie] : Object.keys(d.enLigne || d.stripe || {});
    var fourn = cies.map(function (c) { return (d.enLigne || {})[c] || ((d.stripe || {})[c] ? 'stripe' : ''); }).filter(Boolean)[0] || '';
    var verifie = cies.some(function (c) { return d.clover && d.clover[c] && d.clover[c].verifie; });
    this.elCorps.appendChild(h('div.doux.petit', { style: { marginBottom: '8px' }, text: fourn === 'clover' ? 'Paiement en ligne par carte actif (Clover). Le client paie depuis le lien ; ' + (verifie ? 'le paiement se marque tout seul.' : 'marquez « Payé » quand Clover l\'a reçu (ajoutez le jeton API dans Réglages pour la confirmation automatique).') : (fourn === 'stripe' ? 'Paiement en ligne par carte actif (Stripe). Le client paie depuis le lien ; le paiement se marque tout seul.' : 'Paiement en ligne non configuré : le client reçoit le montant et paie au comptoir ou par téléphone — marquez « Payé » ici. (Réglages › Clover pour activer la carte en ligne.)') }));
    if (!liste.length) { this.elCorps.appendChild(h('div.vide', [h('h3', 'Aucune demande de paiement.'), h('div.doux', 'Depuis un estimé approuvé (« Demande de paiement ») ou « + Paiement » pour un montant libre.')])); return; }
    /* filtres : statut, en ligne / en personne */
    var fp = this.filtrePaiement || '', boutons = h('div.filtres', { style: { marginBottom: '8px' } });
    [['', 'Tous'], ['en_attente', 'Impayés'], ['paye', 'Payés'], ['en_ligne', 'En ligne'], ['en_personne', 'En personne'], ['annule', 'Annulés / remboursés']].forEach(function (f) { var n = liste.filter(function (p) { return filtrePai(p, f[0]); }).length; if (f[0] && !n) return; boutons.appendChild(h('button' + (fp === f[0] ? '.actif' : ''), { type: 'button', onclick: function () { self.filtrePaiement = f[0]; self.rendreCorps(); } }, [f[1], h('span.n', { text: n })])); });
    this.elCorps.appendChild(boutons);
    liste = liste.filter(function (p) { return filtrePai(p, fp); });
    var tbody = h('tbody');
    liste.forEach(function (p) {
      tbody.appendChild(h('tr.cliquable', { onclick: function () { self.ouvrirPaiement(p.id); } }, [
        h('td.ref', [p.id, p.estimeId ? h('span.sous', { text: p.estimeId + (p.btNo ? ' · BT ' + p.btNo : '') }) : (p.btNo ? h('span.sous', { text: 'BT ' + p.btNo }) : null)]),
        h('td.client-cell', [h('div', [avatar(p.client, p.telephone, true), h('div.t', [h('b', { text: p.client || '—' }), h('span.sous', { text: (p.telephoneJoli || '') + (p.vehicule ? ' · ' + p.vehicule : '') })])])]),
        h('td', [h('span', { text: p.description || '' })]),
        h('td.num', [h('b', { text: argent(p.montant) })]),
        h('td.statut-cell.s-' + p.statut, [h('span.ic', { text: ICO_STATUT[p.statut] || '•' }), h('span', { text: (p.statut === 'en_attente' ? 'Impayé' : (PAI_STATUTS[p.statut] || p.statut)) + (p.statut === 'paye' && p.payeLe ? ' ' + quand(p.payeLe) : '') }), p.statut === 'paye' && p.moyen ? h('span.vues', { text: PAI_MOYENS[p.moyen] || p.moyen }) : null, p.vues ? h('span.vues', { text: '👁 ' + p.vues }) : null, p.enLigne && p.statut === 'en_attente' ? h('span.vues', { text: 'lien carte' }) : null, p.rappels ? h('span.vues', { text: p.rappels + ' rappel' + (p.rappels > 1 ? 's' : '') }) : null, p.statut === 'en_attente' && p.envoyeLe && p.telephone && self.peutEcrire() && p.peutEcrire ? h('button.btn.petit.fantome', { type: 'button', text: 'Rappeler', title: 'Renvoyer un rappel par texto', style: { marginLeft: '6px' }, onclick: function (ev) { ev.stopPropagation(); self.action({ action: 'paiementRappeler', id: p.id }, 'Rappel envoyé').then(function (d) { if (d && d.ok) self.charger(true); }); } }) : null]),
        h('td', [h('span', { text: p.payeLe ? 'payé ' + quand(p.payeLe) : (p.envoyeLe ? 'envoyé ' + quand(p.envoyeLe) : 'créé ' + quand(p.creeLe)) }), !self.compagnie ? h('span.sous', { text: nomCie(p.compagnie) }) : null])
      ]));
    });
    this.elCorps.appendChild(h('table.tableau', [h('thead', [h('tr', [h('th', 'Référence'), h('th', 'Client'), h('th', 'Description'), h('th.num', 'Montant'), h('th', 'Statut'), h('th', 'Quand')])]), tbody]));
  };
  VueTexto.prototype.nouveauPaiement = function (src) {
    var self = this, cie = (src && src.compagnie) || this.compagnie, codes = AMX.codesPour('service');
    if (!this.peutEcrire()) { AMX.toast('Lecture seule.', 'erreur'); return; }
    var estime = src && src.id ? src : null;
    var selCie = h('select.saisie', codes.map(function (k) { return h('option', { value: k, selected: k === cie ? true : undefined, text: nomCie(k) }); }));
    if (estime) selCie.disabled = true;
    var inClient = h('input.saisie', { type: 'text', value: (src && src.client) || '', placeholder: 'Prénom et nom' });
    var inTel = h('input.saisie', { type: 'tel', value: src && src.telephone ? telJoli(src.telephone) : '', placeholder: '514 555-1234' });
    var inCourriel = h('input.saisie', { type: 'email', value: (src && src.courriel) || '', placeholder: 'facultatif (reçu)' });
    var inMontant = h('input.saisie', { type: 'number', step: '0.01', min: 0, value: estime ? r2(estime.totalApprouveTaxes || 0) : '', placeholder: '0,00' });
    var inDesc = h('input.saisie', { type: 'text', value: estime ? 'Travaux approuvés — estimé ' + estime.id + (estime.btNo ? ' · BT ' + estime.btNo : '') : '', placeholder: 'Facture service, pneus, entreposage…' });
    var inBt = h('input.saisie', { type: 'text', value: (src && src.btNo) || '', placeholder: 'BT #' });
    var corps = h('div', [h('div.grille.c2', [h('div.champ', [h('label', 'Concession'), selCie]), h('div.champ', [h('label', 'Montant à payer (taxes incluses)'), inMontant]), h('div.champ', [h('label', 'Client'), inClient]), h('div.champ', [h('label', 'Cellulaire'), inTel]), h('div.champ', [h('label', 'Courriel'), inCourriel]), h('div.champ', [h('label', 'Bon de travail #'), inBt]), h('div.champ', { style: { gridColumn: '1 / -1' } }, [h('label', 'Description (le client la voit)'), inDesc])]), estime ? h('p.doux.petit', { style: { marginTop: '8px' }, text: 'Montant proposé = lignes approuvées de ' + estime.id + ' + taxes. Ajustez-le si la facture finale diffère.' }) : null]);
    AMX.modale({ titre: 'Demande de paiement', corps: corps, boutons: [{ texte: 'Annuler' }, { texte: 'Créer et envoyer', classe: 'primaire', action: function () {
      if (!(num(inMontant.value) > 0)) { AMX.toast('Montant requis', 'erreur'); return false; }
      if (!inClient.value.trim() && telChiffres(inTel.value).length !== 10) { AMX.toast('Nom ou cellulaire requis', 'erreur'); return false; }
      return self.action({ action: 'paiementCreer', compagnie: selCie.value, estimeId: estime ? estime.id : '', montant: num(inMontant.value), description: inDesc.value.trim(), client: inClient.value.trim(), telephone: inTel.value, courriel: inCourriel.value.trim(), vehicule: (src && src.vehicule) || '', btNo: inBt.value.trim() }, null).then(function (d) { if (!d || !d.ok) return false; self.ouvrirPaiement(d.paiement.id, true); return true; });
    } }] });
  };
  VueTexto.prototype.ouvrirPaiement = function (id, envoyerTout) {
    var self = this;
    var m = AMX.modale({ titre: 'Paiement ' + id, corps: AMX.chargeur('Paiement', { compact: true }), boutons: [{ texte: 'Fermer' }] });
    AMX.get({ textoPaiement: 1, id: id }, { secours: false }).then(function (d) {
      m.fermer();
      if (!d || !d.ok) { AMX.toast((d && (d.erreur || d.message)) || 'Paiement introuvable', 'erreur'); return; }
      self.fichePaiement(d.paiement, d.stripe, envoyerTout);
    }).catch(function (e) { m.fermer(); AMX.toast(AMX.erreurTexte(e), 'erreur'); });
  };
  VueTexto.prototype.fichePaiement = function (p, stripe, ouvrirEnvoi) {
    var self = this, peut = this.peutEcrire() && p.peutEcrire, cfg = this.config(p.compagnie) || { modeles: [] }, textosActifs = !!(this.donnees && this.donnees.textos && this.donnees.textos.actif);
    /* 28 oct. : Clover remplace Stripe — fournisseur du paiement, sinon celui de la concession. */
    var dn = this.donnees || {}, fourn = p.fournisseur || (dn.enLigne && dn.enLigne[p.compagnie]) || (stripe === 'clover' || stripe === 'stripe' ? stripe : (stripe ? 'stripe' : ''));
    var cloverVerifie = !!(dn.clover && dn.clover[p.compagnie] && dn.clover[p.compagnie].verifie), nomFourn = fourn === 'clover' ? 'Clover' : 'Stripe';
    var texteEnLigne = fourn === 'clover'
      ? (p.sessions ? 'Page de paiement Clover ouverte ' + p.sessions + ' fois' : 'Clover : la page de paiement se crée quand le client clique « Payer par carte »') + (p.retourLe ? ' · le client est revenu de Clover ' + quand(p.retourLe) + (p.statut === 'paye' ? '' : ' — à confirmer') : '') + (cloverVerifie ? '' : ' · confirmation à la main (pas de jeton API)')
      : (fourn === 'stripe' ? (p.enLigne ? 'Lien de paiement par carte (Stripe) créé' : 'La session Stripe se crée à l\'envoi') : 'Paiement en ligne non configuré — paiement au comptoir / par téléphone');
    var rouvrir = function (p2) { try { modale.fermer(); } catch (e) {} self.fichePaiement(p2, stripe); };
    var dl = h('dl', { style: { display: 'grid', gridTemplateColumns: '140px 1fr', gap: '4px 12px', margin: '0 0 10px', fontSize: '13px' } }, [
      h('dt.doux', 'Client'), h('dd', { style: { margin: 0 }, text: (p.client || '—') + (p.telephoneJoli ? ' · ' + p.telephoneJoli : '') + (p.courriel ? ' · ' + p.courriel : '') }),
      h('dt.doux', 'Montant'), h('dd', { style: { margin: 0, fontWeight: 700, fontSize: '16px' }, text: argent(p.montant) }),
      h('dt.doux', 'Description'), h('dd', { style: { margin: 0 }, text: p.description || '—' }),
      h('dt.doux', 'Statut'), h('dd', { style: { margin: 0 } }, [h('span.badge.' + (PAI_COULEUR[p.statut] || 'gris'), { text: PAI_STATUTS[p.statut] || p.statut }), p.statut === 'paye' ? h('span.doux', { text: ' ' + (PAI_MOYENS[p.moyen] || p.moyen || '') + (p.reference ? ' · ' + p.reference : '') + (p.payeLe ? ' · ' + quand(p.payeLe) : '') }) : null]),
      h('dt.doux', 'Envoi'), h('dd', { style: { margin: 0 }, text: p.envoyeLe ? 'envoyé ' + quand(p.envoyeLe) + (p.canal ? ' par ' + p.canal.replace('+', ' et ') : '') + (p.vues ? ' · ouvert ' + p.vues + ' fois' : ' · pas encore ouvert') : 'pas encore envoyé' }),
      h('dt.doux', 'En ligne'), h('dd', { style: { margin: 0 }, text: texteEnLigne }),
      p.estimeId ? h('dt.doux', 'Estimé') : null, p.estimeId ? h('dd', { style: { margin: 0 } }, [h('a', { href: '#', text: p.estimeId, onclick: function (e) { e.preventDefault(); self.ouvrirEstime(p.estimeId); } })]) : null
    ]);
    var journal = h('div.journal', { style: { fontSize: '12px', color: 'var(--encre-3)', maxHeight: '120px', overflow: 'auto' } });
    (p.journal || []).slice().reverse().forEach(function (j) { journal.appendChild(h('div', [h('b', { style: { fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--encre-2)' }, text: quand(j.le) }), ' ', j.quoi, j.par ? h('span.doux', { text: ' · ' + nomCourt(j.par) }) : null])); });
    var boutons = [{ texte: 'Fermer' }];
    if (peut && p.statut === 'en_attente') {
      boutons.push({ texte: 'Marquer payé', action: function (fermer) {
        var selMoyen = h('select.saisie', Object.keys(PAI_MOYENS).filter(function (k) { return k !== 'en_ligne'; }).map(function (k) { return h('option', { value: k, text: PAI_MOYENS[k] }); })), inRef = h('input.saisie', { type: 'text', placeholder: 'Référence (4 derniers chiffres, n° de transaction…)' }), inNote = h('input.saisie', { type: 'text', placeholder: 'Note (facultatif)' });
        AMX.modale({ titre: 'Paiement reçu — ' + argent(p.montant), corps: h('div.grille', [h('div.champ', [h('label', 'Moyen'), selMoyen]), h('div.champ', [h('label', 'Référence'), inRef]), h('div.champ', [h('label', 'Note'), inNote])]), boutons: [{ texte: 'Annuler' }, { texte: 'Payé', classe: 'primaire', action: function () { return self.action({ action: 'paiementMarquer', id: p.id, statut: 'paye', moyen: selMoyen.value, reference: inRef.value.trim(), note: inNote.value.trim() }, 'Paiement marqué payé').then(function (d) { if (!d || !d.ok) return false; fermer(); self.fichePaiement(d.paiement, stripe); return true; }); } }] });
        return false;
      } });
      boutons.push({ texte: p.envoyeLe ? 'Renvoyer' : 'Envoyer', classe: 'primaire', action: function (fermer) {
        var tel = telChiffres(p.telephone), cbT = h('input', { type: 'checkbox', checked: tel && textosActifs ? true : undefined, disabled: tel && textosActifs ? undefined : true }), cbC = h('input', { type: 'checkbox', checked: /@/.test(p.courriel || '') ? true : undefined, disabled: /@/.test(p.courriel || '') ? undefined : true });
        var lgP = self.langueDe(p), modele = modeleL(cfg, 'paiement', lgP.langue);
        var defaut = modele ? gabarit(modele.texte, { prenom: prenom(p.client), client: p.client, concession: nomCie(p.compagnie), vehicule: p.vehicule, ref: p.id, bt: p.btNo || '', montant: argentL(p.montant, lgP.langue), lien: p.lien, conseiller: cfg.signature || nomCourt(AMX.session.courriel) }, lgP.langue) : '';
        var inMsg = zoneTexte({ style: { minHeight: '70px' } }, defaut);
        AMX.modale({ titre: 'Envoyer la demande de paiement', corps: h('div.txt-envoi', [avisLangue(lgP.langue, lgP), h('p', { text: fourn === 'clover' ? 'Le client ouvre la page, voit le montant et paie par carte (Clover).' + (cloverVerifie ? ' Le paiement se marque tout seul.' : ' Marquez « Payé » quand Clover l\'a reçu.') : (fourn === 'stripe' ? 'Le client ouvre la page, voit le montant et paie par carte (Stripe Checkout). Le paiement se marque tout seul.' : 'Le client ouvre la page et voit le montant, votre téléphone et les façons de payer. Marquez « Payé » quand c\'est fait.') }), h('label.champ.inline', [cbT, h('span', { text: 'Texto' + (tel ? ' au ' + telJoli(tel) : ' — aucun cellulaire') })]), h('label.champ.inline', [cbC, h('span', { text: 'Courriel' + (p.courriel ? ' à ' + p.courriel : ' — aucune adresse') })]), h('div.champ', { style: { marginTop: '8px' } }, [h('label', 'Message'), inMsg]), h('div.champ', { style: { marginTop: '8px' } }, [h('label', 'Lien'), h('div', { style: { display: 'flex', gap: '6px' } }, [h('input.saisie.mono', { type: 'text', value: p.lien, readonly: true, style: { fontSize: '12px' } }), h('button.btn.petit', { type: 'button', text: 'Copier', onclick: function () { AMX.copier(p.lien, 'Lien copié'); } })])])]), boutons: [{ texte: 'Annuler' }, { texte: 'Envoyer', classe: 'primaire', action: function () {
          if (!cbT.checked && !cbC.checked) { AMX.toast('Cochez texto ou courriel.', 'erreur'); return false; }
          return self.action({ action: 'paiementEnvoyer', id: p.id, canaux: { texto: cbT.checked, courriel: cbC.checked }, message: inMsg.value.trim() === defaut ? '' : inMsg.value.trim() }, null).then(function (d) { if (!d || !d.ok) return false; if (d.envoye && d.envoye.length) AMX.toast('Demande envoyée par ' + d.envoye.join(' et '), 'ok'); else AMX.toast('Rien n\'est parti — copiez le lien.', 'attention', 7000); (d.erreurs || []).forEach(function (x) { AMX.toast(x, 'attention', 8000); }); fermer(); self.fichePaiement(d.paiement, stripe); return true; });
        } }] });
        return false;
      } });
    }
    var corps = h('div', [dl, peut && p.statut === 'en_attente' ? h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' } }, [
      h('button.btn.petit.fantome', { type: 'button', text: 'Copier le lien', onclick: function () { AMX.copier(p.lien, 'Lien copié'); } }),
      h('button.btn.petit.fantome', { type: 'button', text: 'Page client', onclick: function () { window.open(p.lien + '&apercu=1', '_blank', 'noopener'); } }),
      p.envoyeLe && p.telephone ? h('button.btn.petit.fantome', { type: 'button', text: 'Rappeler par texto' + (p.rappels ? ' (' + p.rappels + ')' : ''), onclick: function () { self.action({ action: 'paiementRappeler', id: p.id }, 'Rappel envoyé').then(function (d) { if (d && d.ok) rouvrir(d.paiement); }); } }) : null,
      (fourn === 'clover' ? cloverVerifie && p.sessions : p.enLigne) ? h('button.btn.petit.fantome', { type: 'button', text: 'Vérifier chez ' + nomFourn, onclick: function () { self.action({ action: 'paiementMarquer', id: p.id, statut: 'verifier' }, null).then(function (d) { if (d && d.ok) { AMX.toast(d.change ? 'Payé !' : 'Toujours en attente chez ' + nomFourn, d.change ? 'ok' : 'info'); rouvrir(d.paiement); } }); } }) : null,
      h('button.btn.petit.fantome.danger', { type: 'button', text: 'Annuler la demande', onclick: function () { AMX.confirmer('Annuler ' + p.id, 'Le lien ne permettra plus de payer.', { ok: 'Annuler la demande', danger: true }).then(function (oui) { if (oui) self.action({ action: 'paiementMarquer', id: p.id, statut: 'annule' }, 'Demande annulée').then(function (d) { if (d && d.ok) rouvrir(d.paiement); }); }); } })
    ]) : null, peut && p.statut === 'paye' ? h('div', { style: { marginBottom: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap' } }, [p.telephone ? h('button.btn.petit', { type: 'button', text: 'Texto « paiement reçu »', title: 'Dire au client que le paiement est reçu et où sont ses clés', onclick: function () { self.textoPaye(p); } }) : null, h('button.btn.petit.fantome', { type: 'button', text: 'Marquer remboursé', onclick: function () { self.action({ action: 'paiementMarquer', id: p.id, statut: 'rembourse' }, 'Marqué remboursé').then(function (d) { if (d && d.ok) rouvrir(d.paiement); }); } })]) : null, (p.journal || []).length ? h('details', [h('summary', { style: { cursor: 'pointer', fontSize: '12px', color: 'var(--encre-3)' }, text: 'Journal' }), journal]) : null]);
    var modale = AMX.modale({ titre: 'Paiement ' + p.id + ' — ' + (p.client || ''), corps: corps, boutons: boutons });
    if (ouvrirEnvoi && peut && p.statut === 'en_attente') setTimeout(function () { var b = modale.el.querySelector('.modale-pied .btn.primaire'); if (b) b.click(); }, 50);
  };

  /* ------------------------------------------------------------------ travaux refusés */
  VueTexto.prototype.rendreRefuses = function () {
    var self = this, lignes = [];
    this.liste('estimes').forEach(function (e) { (e.lignes || []).forEach(function (l) { if (l.etat === 'refuse') lignes.push({ e: e, l: l }); }); });
    lignes.sort(function (a, b) { return (b.e.reponduLe || b.e.maj || '') < (a.e.reponduLe || a.e.maj || '') ? -1 : 1; });
    this.elCompte.textContent = lignes.length + ' travail' + (lignes.length > 1 ? 'x refusés' : ' refusé');
    this.elCorps.appendChild(h('div.doux.petit', { style: { marginBottom: '8px' }, text: 'Les travaux que les clients ont refusés — à proposer de nouveau à la prochaine visite ou par texto quand le moment est bon.' }));
    if (!lignes.length) { this.elCorps.appendChild(h('div.vide', [h('h3', 'Aucun travail refusé.')])); return; }
    var tbody = h('tbody');
    lignes.forEach(function (x) {
      tbody.appendChild(h('tr.cliquable.refus-ligne', { onclick: function () { self.ouvrirEstime(x.e.id); } }, [
        h('td', [h('b', { text: x.l.libelle }), h('span.sous', { text: (URGENCES[x.l.urgence] || '') })]),
        h('td.num', { text: argent(x.l.total) }),
        h('td', [h('b', { text: x.e.client || '—' }), h('span.sous', { text: (x.e.telephoneJoli || '') + (x.e.vehicule ? ' · ' + x.e.vehicule : '') })]),
        h('td', [h('span.quand', { text: 'refusé ' + quand(x.e.reponduLe || x.e.maj) + ' · ' + x.e.id }), !self.compagnie ? h('span.sous', { text: nomCie(x.e.compagnie) }) : null]),
        h('td', [self.peutEcrire() && x.e.telephone ? h('button.btn.petit', { type: 'button', text: 'Relancer par texto', onclick: function (ev) { ev.stopPropagation(); self.vue = 'conversations'; self.ouvrirTel = x.e.telephone; self.rendre(); } }) : null, self.peutEcrire() ? h('button.btn.petit.fantome', { type: 'button', text: 'Nouvel estimé', onclick: function (ev) { ev.stopPropagation(); self.ouvrirEstime(null, { compagnie: x.e.compagnie, client: x.e.client, clientId: x.e.clientId, telephone: x.e.telephone, courriel: x.e.courriel, vin: x.e.vin, vehicule: x.e.vehicule, plaque: x.e.plaque, km: x.e.km, lignes: [{ code: x.l.code, libelle: x.l.libelle, urgence: x.l.urgence, mo: { type: 'fixe', montant: x.l.total } }] }); } }) : null])
      ]));
    });
    this.elCorps.appendChild(h('table.tableau', [h('thead', [h('tr', [h('th', 'Travail'), h('th.num', 'Prix'), h('th', 'Client'), h('th', 'Quand'), h('th', '')])]), tbody]));
  };

  /* ------------------------------------------------------------------ statistiques */
  VueTexto.prototype.rendreStats = function () {
    var self = this, est = this.liste('estimes').filter(function (e) { return e.statut !== 'annule' && e.statut !== 'brouillon'; }), pais = this.liste('paiements');
    this.elCompte.textContent = est.length + ' estimés envoyés (90 jours)';
    var groupes = function (cle) {
      var g = {};
      est.forEach(function (e) { var k = cle(e); if (!g[k]) g[k] = { k: k, envoyes: 0, repondus: 0, gagnes: 0, approuve: 0, propose: 0, delais: [], vues: 0, relances: 0, notes: [] }; var x = g[k]; x.envoyes++; x.propose += e.total || 0; x.vues += e.vues || 0; x.relances += e.relances || 0; if (['approuve', 'partiel', 'decline', 'expire'].indexOf(e.statut) >= 0) x.repondus++; if (e.statut === 'approuve' || e.statut === 'partiel') { x.gagnes++; x.approuve += e.totalApprouve || 0; } if (e.delaiMin !== null && e.delaiMin !== undefined) x.delais.push(e.delaiMin); if (e.courtoisieNote !== null && e.courtoisieNote !== undefined) x.notes.push(e.courtoisieNote); });
      return Object.keys(g).map(function (k) { return g[k]; }).sort(function (a, b) { return b.approuve - a.approuve; });
    };
    var table = function (titre, lignes, libelle) {
      var tbody = h('tbody');
      lignes.forEach(function (x) { var moy = x.delais.length ? x.delais.reduce(function (a, b) { return a + b; }, 0) / x.delais.length : null, note = x.notes.length ? (x.notes.reduce(function (a, b) { return a + b; }, 0) / x.notes.length).toFixed(1) : '—'; tbody.appendChild(h('tr', [h('td', { text: libelle(x.k) }), h('td.num', { text: x.envoyes }), h('td.num', { text: x.gagnes + (x.repondus ? ' (' + Math.round(x.gagnes / x.repondus * 100) + ' %)' : '') }), h('td.num', { text: argent(x.propose) }), h('td.num', [h('b', { text: argent(x.approuve) })]), h('td.num', { text: x.propose ? Math.round(x.approuve / x.propose * 100) + ' %' : '—' }), h('td.num', { text: moy === null ? '—' : duree(moy) }), h('td.num', { text: x.envoyes ? (x.vues / x.envoyes).toFixed(1) : '—' }), h('td.num', { text: note })])); });
      return h('div', [h('h4', titre), h('table.tableau', [h('thead', [h('tr', [h('th', ''), h('th.num', 'Envoyés'), h('th.num', 'Approuvés (taux)'), h('th.num', 'Proposé'), h('th.num', 'Approuvé $'), h('th.num', '% du proposé'), h('th.num', 'Délai moyen'), h('th.num', 'Vues / estimé'), h('th.num', 'Courtoisie /5')])]), tbody])]);
    };
    var zone = h('div.txt-stats');
    zone.appendChild(table('Par conseiller', groupes(function (e) { return e.conseiller || e.creePar || '?'; }), function (k) { return self.nomConseiller(self.compagnie, k); }));
    zone.appendChild(table('Par mois', groupes(function (e) { return String(e.envoyeLe || e.creeLe || '').slice(0, 7); }).sort(function (a, b) { return a.k < b.k ? 1 : -1; }), function (k) { var p = k.split('-'); return p.length === 2 ? MOIS[Number(p[1]) - 1] + ' ' + p[0] : k; }));
    if (!this.compagnie) zone.appendChild(table('Par concession', groupes(function (e) { return e.compagnie; }), nomCie));
    /* travaux les plus refusés / approuvés */
    var parTravail = {};
    est.forEach(function (e) { (e.lignes || []).forEach(function (l) { var k = (l.libelle || '').toLowerCase().replace(/\s+/g, ' ').trim(); if (!k) return; if (!parTravail[k]) parTravail[k] = { lib: l.libelle, n: 0, ok: 0, non: 0, total: 0 }; var x = parTravail[k]; x.n++; if (l.etat === 'approuve') { x.ok++; x.total += l.total || 0; } else if (l.etat === 'refuse') x.non++; }); });
    var trav = Object.keys(parTravail).map(function (k) { return parTravail[k]; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 15);
    if (trav.length) { var tb = h('tbody'); trav.forEach(function (x) { tb.appendChild(h('tr', [h('td', { text: x.lib }), h('td.num', { text: x.n }), h('td.num', { text: x.ok + (x.ok + x.non ? ' (' + Math.round(x.ok / (x.ok + x.non) * 100) + ' %)' : '') }), h('td.num', { text: x.non }), h('td.num', { text: argent(x.total) })])); }); zone.appendChild(h('div', [h('h4', 'Travaux proposés (15 plus fréquents)'), h('table.tableau', [h('thead', [h('tr', [h('th', 'Travail'), h('th.num', 'Proposé'), h('th.num', 'Approuvé (taux)'), h('th.num', 'Refusé'), h('th.num', '$ approuvé')])]), tb])])); }
    var payes = pais.filter(function (p) { return p.statut === 'paye'; }), enLigne = payes.filter(function (p) { return p.moyen === 'en_ligne'; });
    zone.appendChild(h('div', [h('h4', 'Paiements (90 jours)'), h('div.doux', { text: payes.length + ' payé' + (payes.length > 1 ? 's' : '') + ' · ' + argent(payes.reduce(function (a, p) { return a + p.montant; }, 0)) + ' · ' + enLigne.length + ' en ligne par carte · ' + pais.filter(function (p) { return p.statut === 'en_attente'; }).length + ' en attente' })]));
    this.elCorps.appendChild(zone);
  };

  /* ------------------------------------------------------------------ réglages (direction) */
  VueTexto.prototype.ouvrirReglages = function () {
    var self = this, cie = this.compagnie || AMX.codesPour('service')[0], cfg = this.config(cie), d = this.donnees || {};
    if (!cfg) { AMX.toast('Réglages introuvables — rafraîchissez.', 'erreur'); return; }
    var champ = function (label, el, aide) { return h('div.champ', [h('label', label), el, aide ? h('span.aide', { text: aide }) : null]); };
    var inTaux = h('input.saisie', { type: 'number', step: '0.01', min: 0, value: cfg.tauxMo }), cbTaxes = h('input', { type: 'checkbox', checked: cfg.taxes !== false ? true : undefined }), cbRegrouper = h('input', { type: 'checkbox', checked: cfg.regrouper ? true : undefined });
    var inValid = h('input.saisie', { type: 'number', step: '1', min: 1, value: cfg.validiteJours }), inTel = h('input.saisie', { type: 'tel', value: cfg.telephone ? telJoli(cfg.telephone) : '', placeholder: 'téléphone du service (page client)' }), inSig = h('input.saisie', { type: 'text', value: cfg.signature || '', placeholder: 'ex. Caroline, conseillère' });
    var inPied = zoneTexte({ style: { minHeight: '70px' } }, cfg.pied);
    var cbAuto = h('input', { type: 'checkbox', checked: cfg.courtoisie && cfg.courtoisie.auto ? true : undefined }), inDelai = h('input.saisie', { type: 'number', step: '1', min: 0, value: cfg.courtoisie ? cfg.courtoisie.delaiJours : 2, style: { width: '80px' } }), selApres = h('select.saisie', [h('option', { value: 'termine', selected: !cfg.courtoisie || cfg.courtoisie.apres !== 'paye' ? true : undefined, text: 'les travaux terminés' }), h('option', { value: 'paye', selected: cfg.courtoisie && cfg.courtoisie.apres === 'paye' ? true : undefined, text: 'le paiement reçu' })]);
    var modeles = h('div.modeles-liste'), lignesM = [];
    var ajouterModele = function (m) { var inId = h('input.saisie', { type: 'text', value: m.id || '', placeholder: 'id', style: { fontFamily: 'var(--mono)', fontSize: '12px' } }), inTitre = h('input.saisie', { type: 'text', value: m.titre || '', placeholder: 'Titre du bouton' }), inTexte = zoneTexte({ placeholder: 'Texte — {prenom} {client} {concession} {vehicule} {ref} {total} {montant} {lien} {conseiller}' }, m.texte); var el = h('div.modele', [h('div', [inTitre, inId]), inTexte, h('button.btn.petit.fantome', { type: 'button', text: '×', onclick: function () { el.remove(); } })]); lignesM.push({ el: el, lire: function () { return { id: inId.value.trim(), titre: inTitre.value.trim(), texte: inTexte.value.trim() }; } }); modeles.appendChild(el); };
    (cfg.modeles || []).forEach(ajouterModele);
    var corps = h('div.txt-reglages', [
      h('div.doux.petit', { text: 'Réglages de ' + nomCie(cie) + '. Le menu des travaux (codes, prix, heures) est celui du carnet de rendez-vous (Rendez-vous › Réglages).' }),
      h('h4', 'Estimés'),
      h('div.grille.c3', [champ('Taux horaire ($/h)', inTaux), champ('Validité (jours)', inValid), champ('Téléphone du service', inTel, 'affiché au client (Appeler)')]),
      h('div.grille.c2', { style: { marginTop: '8px' } }, [h('label.champ.inline', [cbTaxes, h('span', 'Afficher les taxes au client (' + ((cfg.taxesListe && cfg.taxesListe.length ? cfg.taxesListe : taxesDe(cfg)).map(function (x) { return x.nom; }).join(' + ')) + ')')]), h('label.champ.inline', [cbRegrouper, h('span', 'Un seul prix par ligne (masquer pièces / main-d\'œuvre / frais)')])]),
      h('div.grille.c2', { style: { marginTop: '8px' } }, [champ('Signature des textos', inSig), null]),
      champ('Pied de page de l\'estimé (le client le lit)', inPied, '{concession} et {validite} sont remplacés' + (cfg.piedDefaut ? ' — videz la case pour revenir au texte par défaut ' + (cfg.province === 'ON' ? 'de l\'Ontario' : 'du Québec') : '')),
      h('h4', 'Suivi de courtoisie'),
      h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', fontSize: '12.5px' } }, [cbAuto, h('span', 'Envoyer automatiquement'), inDelai, h('span', 'jour(s) après'), selApres]),
      h('div.aide', { text: (d.avisModule ? 'Via le module Avis (page sondage, lien Google, alerte directeur si ≤ 3, rappel à 3 jours, 9 h – 20 h). ' : 'Texto « note de 1 à 5 » (sans le module Avis). ') + (d.courtoisie && d.courtoisie.installee ? 'Déclencheur quotidien installé (10 h).' : 'Déclencheur quotidien NON installé — un administrateur l\'installe ci-dessous.') + (d.courtoisie && d.courtoisie.dernier ? ' Dernier passage ' + quand(d.courtoisie.dernier.le) + ' : ' + d.courtoisie.dernier.envoyes + ' envoyé(s).' : '') }),
      AMX.estAdmin() ? h('div', { style: { marginTop: '6px' } }, [h('button.btn.petit', { type: 'button', text: d.courtoisie && d.courtoisie.installee ? 'Retirer le déclencheur quotidien' : 'Installer le déclencheur quotidien', onclick: function () { self.action({ action: 'textoCourtoisieInstaller', installer: !(d.courtoisie && d.courtoisie.installee) }, 'Déclencheur ' + (d.courtoisie && d.courtoisie.installee ? 'retiré' : 'installé')).then(function (r) { if (r && r.ok) { modale.fermer(); self.charger(true).then(function () { self.ouvrirReglages(); }); } }); } })]) : null,
      h('h4', 'Modèles de textos'),
      modeles,
      h('button.btn.petit', { type: 'button', text: '+ Modèle', style: { marginTop: '6px' }, onclick: function () { ajouterModele({}); } }),
      h('div.aide', 'estime, relance, paiement et courtoisie sont les modèles utilisés par les boutons ; les autres apparaissent dans les conversations.'),
      (d.peutClover || AMX.estAdmin()) ? self.blocClover(cie, function () { modale.fermer(); self.charger(true).then(function () { self.ouvrirReglages(); }); }) : null,
      d.reception && (AMX.estAdmin() || d.peutClover) ? self.blocReception(d.reception) : null
    ]);
    var modale = AMX.modale({ titre: 'Réglages Texto — ' + nomCie(cie), corps: corps, large: true, boutons: [{ texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: function () {
      var config = { tauxMo: num(inTaux.value), taxes: cbTaxes.checked, regrouper: cbRegrouper.checked, validiteJours: Math.max(1, Math.round(num(inValid.value)) || 30), telephone: inTel.value, signature: inSig.value.trim(), pied: inPied.value.trim(), courtoisie: { auto: cbAuto.checked, delaiJours: Math.max(0, Math.round(num(inDelai.value))), apres: selApres.value }, modeles: lignesM.filter(function (x) { return document.body.contains(x.el); }).map(function (x) { return x.lire(); }).filter(function (m) { return m.titre && m.texte; }) };
      return self.action({ action: 'textoConfig', compagnie: cie, config: config }, 'Réglages enregistrés').then(function (r) { if (!r || !r.ok) return false; if (self.donnees && self.donnees.configs) self.donnees.configs[cie] = r.config; AMX.texto.invalider(); self.charger(true); return true; });
    } }] });
  };
  /* 28 oct. : réception instantanée (Reception.gs). Infobip pousse chaque texto reçu vers l'adresse du script ; le propriétaire
     la crée ici et la colle lui-même dans le portail Infobip (Numbers › le numéro › Inbound configuration › Forward to HTTP).
     L'adresse contient un jeton : elle ne s'affiche qu'à la demande et ne se garde nulle part dans la page. */
  VueTexto.prototype.blocReception = function (r) {
    var self = this, zone = h('div');
    var etat = r.actif ? 'Active — dernier texto reçu ' + quand(r.dernierPousse) + (r.poussesAujourdhui ? ' · ' + r.poussesAujourdhui + ' aujourd\'hui' : '') + '. La lecture de la boîte Infobip n\'est plus qu\'un secours, aux 10 minutes.'
      : (r.adresseCreee ? 'Adresse créée, aucun texto reçu par elle depuis 3 jours : les réponses sont lues dans la boîte Infobip (chaque minute de 7 h à 19 h).' : 'Pas encore en place : les réponses sont lues dans la boîte Infobip (chaque minute de 7 h à 19 h, moins souvent le soir).');
    var montrer = function (nouveau) {
      return self.action({ action: 'textoReception', montrer: true, nouveau: !!nouveau }, null).then(function (d) {
        if (!d || !d.ok) return;
        AMX.vider(zone);
        zone.appendChild(h('div.champ', { style: { marginTop: '6px' } }, [h('label', 'Adresse à coller dans Infobip (Forward to HTTP)'), h('div', { style: { display: 'flex', gap: '6px' } }, [h('input.saisie.mono', { type: 'text', value: d.adresse, readonly: true, style: { fontSize: '11.5px' } }), h('button.btn.petit', { type: 'button', text: 'Copier', onclick: function () { AMX.copier(d.adresse, 'Adresse copiée — collez-la dans Infobip'); } })])]));
        zone.appendChild(h('ol.aide', { style: { margin: '6px 0 0', paddingLeft: '18px' } }, [h('li', 'Portail Infobip › Channels and Numbers › Numbers › votre numéro › onglet SMS › Keywords : modifiez la règle qui reçoit les textos (aujourd\'hui « Pull »).'), h('li', 'Forwarding action : Forward to HTTP · URL : collez l\'adresse · Renderer Type : MO_JSON_2 › CONFIGURE.'), h('li', 'Envoyez un texto de test au numéro, puis rouvrez ces réglages : la réception doit être « Active ».')]));
        if (d.cree) AMX.toast(nouveau ? 'Nouvelle adresse : remplacez l\'ancienne dans Infobip' : 'Adresse de réception créée', 'ok', 6000);
      });
    };
    return h('div', [h('h4', 'Réception instantanée des réponses'), h('div.aide', { text: etat }), zone,
      h('div', { style: { display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' } }, [
        h('button.btn.petit', { type: 'button', text: r.adresseCreee ? 'Montrer l\'adresse de réception' : 'Créer l\'adresse de réception', onclick: function () { montrer(false); } }),
        r.adresseCreee ? h('button.btn.petit.fantome', { type: 'button', text: 'Nouvelle adresse', title: 'L\'ancienne ne marchera plus', onclick: function () { AMX.confirmer('Nouvelle adresse de réception', 'L\'ancienne adresse ne marchera plus : il faudra coller la nouvelle dans Infobip tout de suite, sinon les réponses ne seront lues qu\'aux 10 minutes.', { ok: 'Faire une nouvelle adresse' }).then(function (oui) { if (oui) montrer(true); }); } }) : null
      ])]);
  };
  /* 28 oct. : Clover (Fiserv) remplace Stripe. Chaque concession est un marchand Clover ; ses jetons sont collés ici par le
     propriétaire (jamais renvoyés au site). Le jeton « Hosted checkout » ouvre la page de paiement ; le jeton API (facultatif,
     lecture des commandes et des paiements) permet de marquer « Payé » tout seul. */
  VueTexto.prototype.blocClover = function (cie, recharger) {
    var self = this, d = this.donnees || {}, e = (d.clover && d.clover[cie]) || {};
    var inMid = h('input.saisie.mono', { type: 'text', placeholder: e.actif ? 'Marchand ' + e.marchand + ' (vide = garder)' : 'Identifiant du marchand (13 caractères)', autocomplete: 'off', style: { fontSize: '12px' } });
    var inHco = h('input.saisie.mono', { type: 'password', placeholder: e.actif ? '•••• (vide = garder)' : 'Jeton privé « Hosted checkout »', autocomplete: 'new-password', style: { fontSize: '12px' } });
    var inApi = h('input.saisie.mono', { type: 'password', placeholder: e.verifie ? '•••• (vide = garder)' : 'Jeton API (facultatif)', autocomplete: 'new-password', style: { fontSize: '12px' } });
    var cbEssai = h('input', { type: 'checkbox', checked: e.essai ? true : undefined });
    var etat = e.actif ? 'Clover actif pour ' + nomCie(cie) + ' (marchand ' + e.marchand + ')' + (e.verifie ? ' · paiements confirmés tout seuls' : ' · confirmation à la main') + (e.essai ? ' · ENVIRONNEMENT D\'ESSAI' : '') + '.' : 'Clover n\'est pas configuré pour ' + nomCie(cie) + ' : le client paie au comptoir / par téléphone et vous marquez « Payé ».';
    var enregistrer = function (retirer) {
      var corps = { action: 'textoClover', compagnie: cie };
      if (retirer) corps.retirer = true;
      else {
        corps.merchantId = inMid.value.trim(); corps.cleHco = inHco.value.trim(); corps.essai = cbEssai.checked;
        if (inApi.value.trim()) corps.cleApi = inApi.value.trim();
        if (!e.actif && (!corps.merchantId || !corps.cleHco)) { AMX.toast('Entrez l\'identifiant du marchand et le jeton « Hosted checkout ».', 'erreur'); return; }
      }
      self.action(corps, null).then(function (r) {
        if (!r || !r.ok) return;
        if (!r.clover) { AMX.toast('Le script n\'est pas à jour (Texto.gs) : redéployez-le.', 'erreur', 8000); return; }
        AMX.toast(retirer ? 'Clover retiré pour ' + nomCie(cie) : 'Clover actif pour ' + nomCie(cie) + (r.clover.verifie ? ' — confirmation automatique' : ''), 'ok');
        inHco.value = ''; inApi.value = '';
        if (recharger) recharger();
      });
    };
    return h('div', [h('h4', 'Paiement en ligne (Clover)'),
      h('div.aide', { text: etat }),
      h('div.aide', { text: 'Tableau de bord Clover de la concession › Paramètres › Commerce électronique › Jetons API › Créer un jeton, type « Hosted checkout » (un seul jeton actif par marchand : vérifiez que le site de la concession n\'en utilise pas déjà un). Jeton API (facultatif) : Paramètres › Jetons API, lecture des commandes et des paiements — sans lui, marquez « Payé » à la main. ScanAutomax vérifie les jetons avant de les garder (une page de paiement d\'essai de 1,00 $ est créée puis expire seule).' }),
      h('div.grille', { style: { marginTop: '6px' } }, [h('div.champ', [h('label', 'Identifiant du marchand'), inMid]), h('div.champ', [h('label', 'Jeton Hosted checkout'), inHco]), h('div.champ', [h('label', 'Jeton API (facultatif)'), inApi])]),
      h('label.champ.inline', { style: { marginTop: '4px' } }, [cbEssai, h('span', { text: 'Environnement d\'essai (sandbox) — aucun vrai paiement' })]),
      h('div', { style: { display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' } }, [
        h('button.btn.petit', { type: 'button', text: e.actif ? 'Mettre à jour Clover' : 'Activer Clover', onclick: function () { enregistrer(false); } }),
        e.actif ? h('button.btn.petit.fantome.danger', { type: 'button', text: 'Retirer Clover', onclick: function () { AMX.confirmer('Retirer Clover', 'Les demandes de paiement de ' + nomCie(cie) + ' ne proposeront plus la carte en ligne.', { ok: 'Retirer', danger: true }).then(function (oui) { if (oui) enregistrer(true); }); } }) : null
      ])]);
  };
  AMX.texto.Vue = VueTexto;
})();
