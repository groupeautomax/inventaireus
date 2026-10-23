/* ScanAutomax — Service après-vente › Texto : estimés par texto, conversations avec les clients, paiements, suivi de courtoisie (20 oct. 2026).
   Maxime, devant Kimoby (BMW Sherbrooke › Estimés) : « on doit se créer cette application mais elle doit être meilleure.
   Mets-la dans Service, appelle l'onglet Texto » — puis « je veux toutes les options incluant paiement et suivi courtoisie ».

   Ce que fait la page (une seule, cinq vues) :
   - Estimés : liste (référence, client, véhicule, BT, total, approuvé, statut, vues, envoyé, conseiller), filtres par statut,
     recherche ; fiche = lignes de travaux (menu ou libre, main-d'œuvre fixe ou taux × heures, pièces, frais, priorité, photos /
     vidéos), message au client, totaux TPS / TVQ, Envoyer (texto et / ou courriel), Relancer, Copier le lien, Travaux terminés,
     Demande de paiement, Suivi de courtoisie, Dupliquer, Annuler, BT #, journal. Réponse consignée au comptoir / au téléphone.
   - Conversations : un fil par client (entrants et sortants, non lus), composer avec les modèles, nouveau texto.
   - Paiements : demandes envoyées, payées (en ligne par Stripe ou au comptoir), relance, marquer payé.
   - Travaux refusés : les lignes refusées par les clients, à relancer plus tard.
   - Statistiques : par conseiller et par mois (envoyés, approuvés, taux, $ approuvés, délai de réponse, vues).
   Données : GET ?texto=1[&compagnie=] · ?textoEstime=1&id= · ?textoMessages=1&id= · ?textoPaiement=1&id= ; POST estime*, texto*, paiement* (Texto.gs).
   Règle : rien ne part sans un clic (le suivi de courtoisie automatique est un réglage de la direction, OFF par défaut). */
(function () {
  'use strict';
  var h = AMX.h, I = AMX.icones;

  var STATUTS = { brouillon: 'Brouillon', envoye: 'En attente', vu: 'Vu par le client', approuve: 'Approuvé', partiel: 'Partiellement approuvé', decline: 'Décliné', expire: 'Expiré', annule: 'Annulé' };
  var COULEUR = { brouillon: 'gris', envoye: 'ambre', vu: 'bleu', approuve: 'vert', partiel: 'sarcelle', decline: 'rouge', expire: 'gris', annule: 'gris' };
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
  function gabarit(texte, v) { return String(texte || '').replace(/\{(\w+)\}/g, function (m, k) { return v[k] !== undefined && v[k] !== null && v[k] !== '' ? String(v[k]) : m; }).replace(/\s{2,}/g, ' ').trim(); }
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
    '.txt-ligne table.pieces { width: 100%; border-collapse: collapse; } .txt-ligne table.pieces td { padding: 2px 3px; } .txt-ligne table.pieces input { height: 28px; font-size: 12px; } .txt-ligne table.pieces td.n input { width: 56px; text-align: right; } .txt-ligne table.pieces td.p input { width: 86px; text-align: right; } .txt-ligne table.pieces td.t { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; width: 90px; }',
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
    '.txt-fil .composer .btn-media { align-self: flex-end; height: 38px; padding: 0 10px; font-size: 18px; line-height: 1; }'
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
      var nonLus = (d.conversations || []).filter(function (x) { return (!c || x.compagnie === c) && x.nonLus > 0; }).length;
      var attente = (d.estimes || []).filter(function (x) { return (!c || x.compagnie === c) && x.ouvert; }).length;
      return nonLus || attente || '';
    },
    monter: function (conteneur, ctx) { return new VueTexto(conteneur, ctx); },
    Vue: null,   /* posé plus bas : texto-plus.js étend VueTexto.prototype (clients, campagnes, automatisations, médias, métriques) */
    outils: { h: h, telChiffres: telChiffres, telJoli: telJoli, num: num, r2: r2, argent: argent, nomCie: nomCie, prenom: prenom, quand: quand, duree: duree, nomCourt: nomCourt, zoneTexte: zoneTexte, gabarit: gabarit, reduireImage: reduireImage, lireBase64: lireBase64, joursDepuis: joursDepuis }
  };

  /* ------------------------------------------------------------------ vue */
  function VueTexto(conteneur, ctx) {
    var self = this;
    this.conteneur = conteneur;
    this.compagnie = AMX.compagnieChoisie('service') || (AMX.codesPour('service').length === 1 ? AMX.codesPour('service')[0] : '');
    this.vue = AMX.memo.lire('txt_vue', 'estimes'); if (['estimes', 'conversations', 'paiements', 'refuses', 'clients', 'campagnes', 'autos', 'stats'].indexOf(this.vue) < 0) this.vue = 'estimes';
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
  VueTexto.prototype.naviguer = function (ctx) { var p = (ctx && ctx.params) || {}; if (p.estime) this.ouvrirEstime(p.estime); else if (p.tel) { this.vue = 'conversations'; this.ouvrirTel = telChiffres(p.tel); this.rendre(); } };
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
    this.btnTexto = h('button.btn', { type: 'button', text: '+ Texto', title: 'Envoyer un texto à un client', onclick: function () { self.nouveauTexto(); } });
    this.btnPaiement = h('button.btn', { type: 'button', text: '+ Paiement', title: 'Demande de paiement par texto', onclick: function () { self.nouveauPaiement(null); } });
    this.btnNouveau = h('button.btn.primaire', { type: 'button', text: '+ Nouvel estimé', onclick: function () { self.ouvrirEstime(null); } });
    this.elCies = h('div.barre-cies');
    this.elKpis = h('div.kpis');
    var choisir = function (v) { self.vue = v; AMX.memo.ecrire('txt_vue', v); self.filtre = ''; self.rendre(); };
    this.elSeg = h('div.segment', [['estimes', 'Estimés'], ['conversations', 'Conversations'], ['paiements', 'Paiements'], ['refuses', 'Travaux refusés'], ['clients', 'Clients'], ['campagnes', 'Campagnes'], ['autos', 'Automatisations'], ['stats', 'Statistiques']].map(function (s) { return h('button', { type: 'button', text: s[1], 'data-vue': s[0], onclick: function () { choisir(s[0]); } }); }));
    this.elRecherche = h('input.saisie', { type: 'search', placeholder: 'Client, téléphone, NIV, véhicule, BT, référence…', autocomplete: 'off', oninput: AMX.debounce(function (e) { self.recherche = e.target.value; self.rendreCorps(); }, 120) });
    this.elFiltres = h('div.filtres');
    this.elCompte = h('span.compte.doux');
    this.elOutils = h('div.txt-outils', [this.elSeg, h('div.recherche', [h('span', { html: I.recherche }), this.elRecherche]), this.elFiltres, this.elCompte]);
    this.elCorps = h('div');
    var entete = h('div.entete-page', [
      h('div', { style: { minWidth: 0 } }, [h('h1', 'Texto'), this.elEtat]),
      h('div.actions', [this.btnRafraichir, this.btnReglages, this.btnTexto, this.btnPaiement, this.btnNouveau])
    ]);
    this.conteneur.appendChild(h('div.page.txt-page', [entete, this.elCies, this.elKpis, this.elOutils, this.elCorps]));
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
    this.elEtat.textContent = (textos.actif ? 'Textos actifs' + (textos.numero ? ' · ' + telJoli(textos.numero) : '') + (textos.lectureInstallee ? ' · réponses lues chaque minute' : ' · lecture des réponses non installée (Outils › Comptes et droits › Échanges par texto)') : 'Textos non configurés (Outils › Comptes et droits › Alertes)') + ' · ' + new Date(d.genereLe || Date.now()).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });
    [].forEach.call(this.elSeg.querySelectorAll('button'), function (b) { b.classList.toggle('actif', b.dataset.vue === self.vue); });
    this.rendreKpis();
    this.rendreCorps();
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
    var nonLus = convs.filter(function (c) { return c.nonLus > 0; }).length;
    var paiAttente = pais.filter(function (p) { return p.statut === 'en_attente'; }), paiMontant = paiAttente.reduce(function (a, p) { return a + (p.montant || 0); }, 0);
    this.elKpis.appendChild(kpi(attente.length, 'À approuver', { classe: attente.length ? 'attention' : '', sous: montantAttente ? argent(montantAttente) + ' en attente' : 'aucun estimé envoyé', actif: this.vue === 'estimes' && this.filtre === 'attente', onclick: function () { self.vue = 'estimes'; self.filtre = 'attente'; self.rendre(); } }));
    this.elKpis.appendChild(kpi(repondus.length ? Math.round(gagnes.length / repondus.length * 100) + ' %' : '—', 'Taux d\'approbation', { sous: '30 jours · ' + gagnes.length + ' sur ' + repondus.length, actif: this.vue === 'estimes' && this.filtre === 'approuve', onclick: function () { self.vue = 'estimes'; self.filtre = 'approuve'; self.rendre(); } }));
    this.elKpis.appendChild(kpi(argent(dollarsApprouves), 'Approuvés 30 j', { sous: 'avant taxes', classe: 'neutre' }));
    this.elKpis.appendChild(kpi(delaiMoy === null ? '—' : duree(delaiMoy), 'Délai de réponse', { sous: 'moyenne 30 jours', classe: 'neutre' }));
    this.elKpis.appendChild(kpi(nonLus, 'Textos non lus', { classe: nonLus ? 'alerte' : '', sous: convs.length + ' conversation' + (convs.length > 1 ? 's' : ''), actif: this.vue === 'conversations', onclick: function () { self.vue = 'conversations'; self.rendre(); } }));
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
        h('td', [h('b', { text: e.client || '—' }), h('span.sous', { text: (e.telephoneJoli || '') + (e.vehicule ? ' · ' + e.vehicule : '') })]),
        h('td.num', { text: argent(e.total) }),
        h('td.num', [e.totalApprouve ? h('b', { text: argent(e.totalApprouve) }) : h('span.doux', '—'), e.nRefuse ? h('span.sous.ico-refus', { text: e.nRefuse + ' refusé' + (e.nRefuse > 1 ? 's' : '') }) : null]),
        h('td', [h('span.badge.' + (COULEUR[e.statut] || 'gris'), { text: STATUTS[e.statut] || e.statut }), e.vues ? h('span.vues', { text: '👁 ' + e.vues, title: 'Ouvert ' + e.vues + ' fois par le client' }) : null, e.relances ? h('span.vues', { text: '↻ ' + e.relances, title: e.relances + ' relance(s)' }) : null, e.paiementId ? h('span.vues', { text: '$', title: 'Demande de paiement ' + e.paiementId }) : null, e.courtoisieNote !== null && e.courtoisieNote !== undefined ? h('span.vues' + (e.courtoisieNote <= 3 ? '.ico-refus' : '.ico-ok'), { text: '★ ' + e.courtoisieNote, title: 'Note de courtoisie' }) : null]),
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
    var champ = function (label, el, aide) { return h('div.champ', [h('label', label), el, aide ? h('span.aide', { text: aide }) : null]); };
    /* --- client et véhicule --- */
    var inClient = h('input.saisie', { type: 'text', value: v.client || '', placeholder: 'Prénom et nom', autocomplete: 'off' });
    var inTel = h('input.saisie', { type: 'tel', value: v.telephoneJoli || telJoli(v.telephone) || '', placeholder: '514 555-1234', autocomplete: 'off' });
    var inCourriel = h('input.saisie', { type: 'email', value: v.courriel || '', placeholder: 'facultatif' });
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
    [inClient, inTel, inCourriel, inVin, inVeh, inPlaque, inKm, inBt, selCons].forEach(function (x) { if (!peut) x.disabled = true; });
    /* --- lignes --- */
    var elLignes = h('div.lignes'), lignesUI = [];
    var elTotaux = h('div.totaux');
    var totalLigne = function (L) { var mo = L.mo.type === 'taux' ? r2(num(L.mo.heures) * (num(L.mo.taux) || cfg.tauxMo)) : r2(num(L.mo.montant)); var p = L.pieces.reduce(function (a, x) { return a + (num(x.qte) || 1) * num(x.prix); }, 0), f = L.frais.reduce(function (a, x) { return a + (num(x.qte) || 1) * num(x.prix); }, 0); return { mo: mo, pieces: r2(p), frais: r2(f), total: r2(mo + p + f) }; };
    var lireLignes = function () { return lignesUI.filter(function (u) { return elLignes.contains(u.el); }).map(function (u) { return u.lire(); }).filter(function (L) { return L.libelle; }); };
    var majTotaux = function () {
      var lignes = lireLignes(), sous = 0, appr = 0;
      lignes.forEach(function (L) { if (L.paiement === 'garantie' || L.paiement === 'interne') return; var t = totalLigne(L).total; sous += t; if (L.etat === 'approuve') appr += t; });
      sous = r2(sous); appr = r2(appr);
      var taxes = cfg.taxes !== false, tps = taxes ? r2(sous * 0.05) : 0, tvq = taxes ? r2(sous * 0.09975) : 0;
      AMX.vider(elTotaux);
      elTotaux.appendChild(h('span', 'Sous-total')); elTotaux.appendChild(h('span', { text: argent(sous) }));
      if (taxes) { elTotaux.appendChild(h('span', 'TPS 5 %')); elTotaux.appendChild(h('span', { text: argent(tps) })); elTotaux.appendChild(h('span', 'TVQ 9,975 %')); elTotaux.appendChild(h('span', { text: argent(tvq) })); }
      elTotaux.appendChild(h('span.t', 'Total')); elTotaux.appendChild(h('span.t', { text: argent(sous + tps + tvq) }));
      if (appr || lignes.some(function (L) { return L.etat === 'refuse'; })) { elTotaux.appendChild(h('span.a', 'Approuvé par le client')); elTotaux.appendChild(h('span.a', { text: argent(appr) + (taxes ? ' + taxes = ' + argent(appr * (taxes ? 1.14975 : 1)) : '') })); }
      lignesUI.forEach(function (u) { if (elLignes.contains(u.el)) u.majTotal(); });
    };
    var ligneUI = function (L, k) {
      L = Object.assign({ code: '', libelle: '', description: '', urgence: 'recommande', mo: { type: 'fixe', heures: 0, taux: cfg.tauxMo, montant: 0 }, pieces: [], frais: [], medias: [], etat: 'propose' }, L || {});
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
      var rangeePiece = function (p) { var inNo = h('input.saisie', { type: 'text', value: p.no || '', placeholder: '# pièce' }), inNom = h('input.saisie', { type: 'text', value: p.nom || '', placeholder: 'Pièce' }), inQ = h('input.saisie', { type: 'number', step: '1', min: 0, value: p.qte || 1 }), inPx = h('input.saisie', { type: 'number', step: '0.01', min: 0, value: p.prix || '', placeholder: '0,00' }), tdT = h('td.t'); var tr = h('tr', [h('td', { style: { width: '120px' } }, [inNo]), h('td', [inNom]), h('td.n', [inQ]), h('td.p', [inPx]), tdT, h('td', { style: { width: '26px' } }, [h('button.btn.petit.fantome', { type: 'button', text: '×', onclick: function () { tr.remove(); majTotaux(); } })])]); tr._lire = function () { return { no: inNo.value.trim(), nom: inNom.value.trim(), qte: num(inQ.value) || 1, prix: num(inPx.value), dispo: p.dispo || '' }; }; tr._maj = function () { tdT.textContent = argent((num(inQ.value) || 1) * num(inPx.value)); }; [inQ, inPx].forEach(function (x) { x.addEventListener('input', majTotaux); }); tbP.appendChild(tr); tr._maj(); };
      var rangeeFrais = function (f) { var inNom = h('input.saisie', { type: 'text', value: f.nom || '', placeholder: 'Frais (atelier, recyclage, fournitures…)' }), inQ = h('input.saisie', { type: 'number', step: '1', min: 0, value: f.qte || 1 }), inPx = h('input.saisie', { type: 'number', step: '0.01', min: 0, value: f.prix || '', placeholder: '0,00' }), tdT = h('td.t'); var tr = h('tr', [h('td', { colspan: 2 }, [inNom]), h('td.n', [inQ]), h('td.p', [inPx]), tdT, h('td', { style: { width: '26px' } }, [h('button.btn.petit.fantome', { type: 'button', text: '×', onclick: function () { tr.remove(); majTotaux(); } })])]); tr._lire = function () { return { nom: inNom.value.trim(), qte: num(inQ.value) || 1, prix: num(inPx.value) }; }; tr._maj = function () { tdT.textContent = argent((num(inQ.value) || 1) * num(inPx.value)); }; [inQ, inPx].forEach(function (x) { x.addEventListener('input', majTotaux); }); tbF.appendChild(tr); tr._maj(); };
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
      var u = { el: el, lire: function () { return { code: L.code || selMenu.value || '', libelle: inLib.value.trim(), description: inDesc.value.trim(), urgence: selUrg.value, mo: { type: selType.value, heures: num(inHeures.value), taux: num(inTaux.value) || cfg.tauxMo, montant: num(inMontant.value) }, pieces: [].map.call(tbP.querySelectorAll('tr'), function (tr) { return tr._lire(); }).filter(function (p) { return p.nom || p.no; }), frais: [].map.call(tbF.querySelectorAll('tr'), function (tr) { return tr._lire(); }).filter(function (f) { return f.nom; }), medias: L.medias, etat: L.etat, reponduLe: L.reponduLe, paiement: selPai.value }; }, majTotal: function () { var t = totalLigne(u.lire()); elTotal.textContent = argent(t.total) + (selPai.value === 'garantie' ? ' · garantie' : (selPai.value === 'interne' ? ' · interne' : '')); [].forEach.call(el.querySelectorAll('table.pieces tr'), function (tr) { if (tr._maj) tr._maj(); }); } };
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
    majTotaux();
    /* --- en-tête : statut, suivi, étapes --- */
    var titre = h('div.titre', [v.id ? 'Estimé ' + v.id : 'Nouvel estimé', h('span.badge.' + (COULEUR[v.statut] || 'gris'), { text: STATUTS[v.statut] || v.statut }), v.statut === 'annule' && v.annuleRaison ? h('span.doux', { text: '— ' + v.annuleRaison }) : null]);
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
    /* --- lecture de l'état local --- */
    var lire = function () { return { id: v.id || undefined, compagnie: v.compagnie, client: inClient.value.trim(), clientId: v.clientId || '', telephone: inTel.value, courriel: inCourriel.value.trim(), vin: inVin.value.trim().toUpperCase(), vehicule: inVeh.value.trim(), plaque: inPlaque.value.trim(), km: inKm.value, btNo: inBt.value.trim(), rdvId: v.rdvId || '', conseiller: selCons.value, note: inNote.value, noteInterne: inNoteInt.value, lignes: lireLignes() }; };
    var enregistrer = function (silencieux) {
      var e2 = lire();
      if (!e2.client && !telChiffres(e2.telephone)) { AMX.toast('Nom ou cellulaire du client requis', 'erreur'); inClient.focus(); return Promise.resolve(null); }
      if (!e2.lignes.length) { AMX.toast('Ajoutez au moins un travail', 'erreur'); return Promise.resolve(null); }
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
      actions.appendChild(h('button.btn.primaire', { type: 'button', text: v.envoyeLe ? 'Renvoyer au client' : 'Envoyer au client', onclick: function () { enregistrer(true).then(function (r) { if (r) self.modaleEnvoi(r, cfg, false, function (est) { rouvrir(est); }); }); } }));
      if (v.ouvert) actions.appendChild(h('button.btn', { type: 'button', text: 'Relancer', title: 'Petit rappel par texto', onclick: function () { self.modaleEnvoi(v, cfg, true, function (est) { rouvrir(est); }); } }));
      if (v.id && v.envoyeLe) { actions.appendChild(h('button.btn.fantome', { type: 'button', text: 'Copier le lien', onclick: function () { AMX.copier(lienEstime(v), 'Lien copié — collez-le dans un texto ou montrez-le au comptoir'); } })); actions.appendChild(h('button.btn.fantome', { type: 'button', text: 'Page client', onclick: function () { window.open(lienEstime(v) + '&apercu=1', '_blank', 'noopener'); } })); }
      if (v.id && (v.statut === 'approuve' || v.statut === 'partiel')) {
        if (!v.termineLe) actions.appendChild(h('button.btn', { type: 'button', text: '✓ Travaux terminés', title: 'Véhicule prêt — propose le texto « véhicule prêt »', onclick: function () { self.terminerTravaux(v, cfg, function (est) { rouvrir(est); }); } }));
        actions.appendChild(h('button.btn' + (pai && pai.statut === 'paye' ? '.fantome' : ''), { type: 'button', text: pai ? 'Paiement ' + (PAI_STATUTS[pai.statut] || '').toLowerCase() : '$ Demande de paiement', title: pai ? pai.id + ' · ' + argent(pai.montant) : 'Envoyer le montant à payer par texto (en ligne par carte si Stripe est configuré)', onclick: function () { if (pai) self.ouvrirPaiement(pai.id); else self.nouveauPaiement(v); } }));
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
      h('h4', { style: { margin: '6px 0 4px', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--encre-3)' } }, 'Travaux proposés'),
      elLignes, peut ? btnLigne : null,
      elTotaux,
      h('div.grille.c2', [champ('Message au client', inNote), champ('Note interne', inNoteInt)]),
      actions,
      (v.journal || []).length ? h('details', [h('summary', { style: { cursor: 'pointer', fontSize: '12px', color: 'var(--encre-3)' }, text: 'Journal (' + v.journal.length + ')' }), journal]) : null
    ]);
    modale = AMX.modale({ titre: v.id ? 'Estimé ' + v.id + ' — ' + (v.client || '') : 'Nouvel estimé', corps: corps, large: true, sansPied: true, sansFocus: !neuf });
    this.ficheOuverte = modale;
    this.fermerFiche = function () { try { modale.fermer(); } catch (e) {} self.ficheOuverte = null; };
  };
  VueTexto.prototype.fermerFiche = function () {};
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
  /* Modale d'envoi (estimé ou relance) : canaux, aperçu du texto, lien. */
  VueTexto.prototype.modaleEnvoi = function (v, cfg, relance, apres) {
    var self = this, textosActifs = !!(this.donnees && this.donnees.textos && this.donnees.textos.actif), tel = telChiffres(v.telephone);
    var cbT = h('input', { type: 'checkbox', checked: tel && textosActifs ? true : undefined, disabled: tel && textosActifs ? undefined : true });
    var cbC = h('input', { type: 'checkbox', checked: /@/.test(v.courriel || '') && !relance ? true : undefined, disabled: /@/.test(v.courriel || '') ? undefined : true });
    var modele = (cfg.modeles || []).filter(function (m) { return m.id === (relance ? 'relance' : 'estime'); })[0];
    var defaut = modele ? gabarit(modele.texte, { prenom: prenom(v.client), client: v.client, concession: nomCie(v.compagnie), vehicule: v.vehicule || 'véhicule', ref: v.id, total: argent(v.total), lien: lienEstime(v), conseiller: cfg.signature || nomCourt(AMX.session.courriel) }) : '';
    var inMsg = zoneTexte({ placeholder: 'Texto envoyé au client', style: { minHeight: '70px' } }, defaut);
    var compte = h('div.doux.petit', { style: { textAlign: 'right' } });
    var majCompte = function () { var n = inMsg.value.length + (relance ? 0 : 50); compte.textContent = n + ' caractères' + (n > 160 ? ' · ' + Math.ceil(n / 153) + ' textos' : ''); };
    inMsg.addEventListener('input', majCompte); majCompte();
    var corps = h('div.txt-envoi', [
      h('p', { text: relance ? 'Un rappel au client : le lien vers son estimé est ajouté au message.' : 'Le client reçoit un lien vers une page sans compte : les travaux avec les prix, les photos, Approuver / Refuser par ligne, Tout approuver. Il peut aussi répondre OUI ' + v.id + ' ou NON ' + v.id + ' par texto.' }),
      h('label.champ.inline', [cbT, h('span', { text: 'Texto' + (tel ? ' au ' + telJoli(tel) : ' — aucun cellulaire') + (!textosActifs ? ' — textos non configurés' : '') })]),
      h('label.champ.inline', [cbC, h('span', { text: 'Courriel' + (v.courriel ? ' à ' + v.courriel : ' — aucune adresse') })]),
      h('div.champ', { style: { marginTop: '8px' } }, [h('label', 'Message'), inMsg, compte, relance ? null : h('span.aide', '« Répondez STOP pour ne plus recevoir de textos » est ajouté automatiquement.')]),
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
  VueTexto.prototype.terminerTravaux = function (v, cfg, apres) {
    var self = this, tel = telChiffres(v.telephone), textosActifs = !!(this.donnees && this.donnees.textos && this.donnees.textos.actif);
    var modele = (cfg.modeles || []).filter(function (m) { return m.id === 'pret'; })[0];
    var texte = modele ? gabarit(modele.texte, { prenom: prenom(v.client), client: v.client, concession: nomCie(v.compagnie), vehicule: v.vehicule || 'véhicule', ref: v.id, conseiller: cfg.signature || nomCourt(AMX.session.courriel) }) : '';
    var cb = h('input', { type: 'checkbox', checked: tel && textosActifs ? true : undefined, disabled: tel && textosActifs ? undefined : true });
    var inMsg = zoneTexte({ style: { minHeight: '60px' } }, texte);
    AMX.modale({ titre: 'Travaux terminés — ' + v.id, corps: h('div.txt-envoi', [h('p', 'Le véhicule est prêt. La date est notée sur l\'estimé (le suivi de courtoisie compte à partir d\'ici).'), h('label.champ.inline', [cb, h('span', { text: 'Prévenir le client par texto' + (tel ? ' au ' + telJoli(tel) : ' — aucun cellulaire') })]), h('div.champ', [h('label', 'Message'), inMsg])]), boutons: [{ texte: 'Annuler' }, { texte: 'Terminer', classe: 'primaire', action: function () {
      return self.action({ action: 'estimeEtat', id: v.id, etat: 'termine' }, 'Travaux terminés').then(function (d) {
        if (!d || !d.ok) return false;
        var suite = Promise.resolve(d);
        if (cb.checked && inMsg.value.trim()) suite = self.action({ action: 'textoEnvoyer', compagnie: v.compagnie, telephone: tel, texte: inMsg.value.trim(), client: v.client, clientId: v.clientId, vin: v.vin, vehicule: v.vehicule }, 'Client prévenu par texto').then(function () { return d; });
        return suite.then(function () { if (apres) apres(d.estime); return true; });
      });
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
    var self = this, convs = this.liste('conversations');
    this.elCompte.textContent = convs.length + ' conversation' + (convs.length > 1 ? 's' : '');
    if (this.ouvrirTel) { var c0 = convs.filter(function (c) { return c.telephone === self.ouvrirTel; })[0]; if (c0) this.convId = c0.id; else if (this.peutEcrire()) { var telV = this.ouvrirTel; this.ouvrirTel = ''; setTimeout(function () { self.nouveauTexto({ telephone: telV }); }, 100); } this.ouvrirTel = ''; }
    var liste = h('div.txt-liste' + (this.convId ? '.cache-mobile' : ''));
    if (!convs.length) liste.appendChild(h('div.vide-petit', { text: this.recherche ? 'Aucune conversation ne correspond.' : 'Aucune conversation. Les textos envoyés et reçus apparaissent ici.' }));
    convs.forEach(function (c) {
      liste.appendChild(h('div.item' + (c.nonLus ? '.nonlu' : '') + (c.id === self.convId ? '.actif' : ''), { onclick: function () { self.convId = c.id; self.rendreCorps(); } }, [
        h('div.nom', [c.client || telJoli(c.telephone), c.nonLus ? h('span.badge-nonlu', { text: c.nonLus }) : null, c.stop ? h('span.stop', ' STOP') : null]),
        h('div.q', { text: quand(c.dernierLe || c.maj) }),
        h('div.apercu', { text: (c.dernierSens === 'sortant' ? '↗ ' : (c.dernierSens === 'entrant' ? '↙ ' : '')) + (c.dernierTexte || '') }),
        h('div.cie', { text: (self.compagnie ? '' : nomCie(c.compagnie) + ' · ') + (c.client ? telJoli(c.telephone) : '') + (c.vehicule ? ' · ' + c.vehicule : '') })
      ]));
    });
    var fil = h('div.txt-fil' + (this.convId ? '' : '.cache-mobile'));
    if (!this.convId) fil.appendChild(h('div.vide-petit', { style: { margin: 'auto', border: 'none' }, text: 'Choisissez une conversation, ou « + Texto » pour écrire à un client.' }));
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
      h('div', [h('div.nom', { text: c.client || telJoli(c.telephone) }), h('div.d', { text: (c.client ? telJoli(c.telephone) + ' · ' : '') + nomCie(c.compagnie) + (c.vehicule ? ' · ' + c.vehicule : '') + (c.conseiller ? ' · ' + nomCourt(c.conseiller) : '') })]),
      h('div.actions', [
        peut ? h('button.btn.petit', { type: 'button', text: '+ Estimé', onclick: function () { self.ouvrirEstime(null, { compagnie: c.compagnie, client: c.client, telephone: c.telephone, clientId: c.clientId, vin: c.vin, vehicule: c.vehicule }); } }) : null,
        peut ? h('button.btn.petit', { type: 'button', text: '$ Paiement', onclick: function () { self.nouveauPaiement({ compagnie: c.compagnie, client: c.client, telephone: c.telephone, vehicule: c.vehicule }); } }) : null,
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
      (cfg.modeles || []).filter(function (m) { return ['estime', 'relance', 'paiement', 'courtoisie'].indexOf(m.id) < 0; }).forEach(function (m) { modeles.appendChild(h('button', { type: 'button', text: m.titre, title: m.texte, onclick: function () { inMsg.value = gabarit(m.texte, { prenom: prenom(c.client), client: c.client, concession: nomCie(c.compagnie), vehicule: c.vehicule || 'véhicule', conseiller: cfg.signature || nomCourt(AMX.session.courriel) }); majCompte(); inMsg.focus(); } })); });
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
    var d = this.donnees || {}, stripeCie = this.compagnie ? !!(d.stripe || {})[this.compagnie] : Object.keys(d.stripe || {}).some(function (k) { return d.stripe[k]; });
    this.elCorps.appendChild(h('div.doux.petit', { style: { marginBottom: '8px' }, text: stripeCie ? 'Paiement en ligne par carte actif (Stripe). Le client paie depuis le lien ; le paiement se marque tout seul.' : 'Paiement en ligne non configuré : le client reçoit le montant et paie au comptoir ou par téléphone — marquez « Payé » ici. (Réglages › Stripe pour activer la carte en ligne.)' }));
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
        h('td', [h('b', { text: p.client || '—' }), h('span.sous', { text: (p.telephoneJoli || '') + (p.vehicule ? ' · ' + p.vehicule : '') })]),
        h('td', [h('span', { text: p.description || '' })]),
        h('td.num', [h('b', { text: argent(p.montant) })]),
        h('td', [h('span.badge.' + (PAI_COULEUR[p.statut] || 'gris'), { text: PAI_STATUTS[p.statut] || p.statut }), p.statut === 'paye' && p.moyen ? h('span.vues', { text: PAI_MOYENS[p.moyen] || p.moyen }) : null, p.vues ? h('span.vues', { text: '👁 ' + p.vues }) : null, p.enLigne && p.statut === 'en_attente' ? h('span.vues', { text: 'lien carte' }) : null, p.rappels ? h('span.vues', { text: p.rappels + ' rappel' + (p.rappels > 1 ? 's' : '') }) : null, p.statut === 'en_attente' && p.envoyeLe && p.telephone && self.peutEcrire() && p.peutEcrire ? h('button.btn.petit.fantome', { type: 'button', text: 'Rappeler', title: 'Renvoyer un rappel par texto', style: { marginLeft: '6px' }, onclick: function (ev) { ev.stopPropagation(); self.action({ action: 'paiementRappeler', id: p.id }, 'Rappel envoyé').then(function (d) { if (d && d.ok) self.charger(true); }); } }) : null]),
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
    var rouvrir = function (p2) { try { modale.fermer(); } catch (e) {} self.fichePaiement(p2, stripe); };
    var dl = h('dl', { style: { display: 'grid', gridTemplateColumns: '140px 1fr', gap: '4px 12px', margin: '0 0 10px', fontSize: '13px' } }, [
      h('dt.doux', 'Client'), h('dd', { style: { margin: 0 }, text: (p.client || '—') + (p.telephoneJoli ? ' · ' + p.telephoneJoli : '') + (p.courriel ? ' · ' + p.courriel : '') }),
      h('dt.doux', 'Montant'), h('dd', { style: { margin: 0, fontWeight: 700, fontSize: '16px' }, text: argent(p.montant) }),
      h('dt.doux', 'Description'), h('dd', { style: { margin: 0 }, text: p.description || '—' }),
      h('dt.doux', 'Statut'), h('dd', { style: { margin: 0 } }, [h('span.badge.' + (PAI_COULEUR[p.statut] || 'gris'), { text: PAI_STATUTS[p.statut] || p.statut }), p.statut === 'paye' ? h('span.doux', { text: ' ' + (PAI_MOYENS[p.moyen] || p.moyen || '') + (p.reference ? ' · ' + p.reference : '') + (p.payeLe ? ' · ' + quand(p.payeLe) : '') }) : null]),
      h('dt.doux', 'Envoi'), h('dd', { style: { margin: 0 }, text: p.envoyeLe ? 'envoyé ' + quand(p.envoyeLe) + (p.canal ? ' par ' + p.canal.replace('+', ' et ') : '') + (p.vues ? ' · ouvert ' + p.vues + ' fois' : ' · pas encore ouvert') : 'pas encore envoyé' }),
      h('dt.doux', 'En ligne'), h('dd', { style: { margin: 0 }, text: p.enLigne ? 'Lien de paiement par carte (Stripe) créé' : (stripe ? 'La session Stripe se crée à l\'envoi' : 'Stripe non configuré — paiement au comptoir / par téléphone') }),
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
        var modele = (cfg.modeles || []).filter(function (x) { return x.id === 'paiement'; })[0];
        var defaut = modele ? gabarit(modele.texte, { prenom: prenom(p.client), client: p.client, concession: nomCie(p.compagnie), vehicule: p.vehicule || 'véhicule', ref: p.id, montant: argent(p.montant), lien: p.lien, conseiller: cfg.signature || nomCourt(AMX.session.courriel) }) : '';
        var inMsg = zoneTexte({ style: { minHeight: '70px' } }, defaut);
        AMX.modale({ titre: 'Envoyer la demande de paiement', corps: h('div.txt-envoi', [h('p', { text: stripe ? 'Le client ouvre la page, voit le montant et paie par carte (Stripe Checkout). Le paiement se marque tout seul.' : 'Le client ouvre la page et voit le montant, votre téléphone et les façons de payer. Marquez « Payé » quand c\'est fait.' }), h('label.champ.inline', [cbT, h('span', { text: 'Texto' + (tel ? ' au ' + telJoli(tel) : ' — aucun cellulaire') })]), h('label.champ.inline', [cbC, h('span', { text: 'Courriel' + (p.courriel ? ' à ' + p.courriel : ' — aucune adresse') })]), h('div.champ', { style: { marginTop: '8px' } }, [h('label', 'Message'), inMsg]), h('div.champ', { style: { marginTop: '8px' } }, [h('label', 'Lien'), h('div', { style: { display: 'flex', gap: '6px' } }, [h('input.saisie.mono', { type: 'text', value: p.lien, readonly: true, style: { fontSize: '12px' } }), h('button.btn.petit', { type: 'button', text: 'Copier', onclick: function () { AMX.copier(p.lien, 'Lien copié'); } })])])]), boutons: [{ texte: 'Annuler' }, { texte: 'Envoyer', classe: 'primaire', action: function () {
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
      p.enLigne ? h('button.btn.petit.fantome', { type: 'button', text: 'Vérifier chez Stripe', onclick: function () { self.action({ action: 'paiementMarquer', id: p.id, statut: 'verifier' }, null).then(function (d) { if (d && d.ok) { AMX.toast(d.change ? 'Payé !' : 'Toujours en attente chez Stripe', d.change ? 'ok' : 'info'); rouvrir(d.paiement); } }); } }) : null,
      h('button.btn.petit.fantome.danger', { type: 'button', text: 'Annuler la demande', onclick: function () { AMX.confirmer('Annuler ' + p.id, 'Le lien ne permettra plus de payer.', { ok: 'Annuler la demande', danger: true }).then(function (oui) { if (oui) self.action({ action: 'paiementMarquer', id: p.id, statut: 'annule' }, 'Demande annulée').then(function (d) { if (d && d.ok) rouvrir(d.paiement); }); }); } })
    ]) : null, peut && p.statut === 'paye' ? h('div', { style: { marginBottom: '10px' } }, [h('button.btn.petit.fantome', { type: 'button', text: 'Marquer remboursé', onclick: function () { self.action({ action: 'paiementMarquer', id: p.id, statut: 'rembourse' }, 'Marqué remboursé').then(function (d) { if (d && d.ok) rouvrir(d.paiement); }); } })]) : null, (p.journal || []).length ? h('details', [h('summary', { style: { cursor: 'pointer', fontSize: '12px', color: 'var(--encre-3)' }, text: 'Journal' }), journal]) : null]);
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
      h('div.grille.c2', { style: { marginTop: '8px' } }, [h('label.champ.inline', [cbTaxes, h('span', 'Afficher TPS / TVQ au client')]), h('label.champ.inline', [cbRegrouper, h('span', 'Un seul prix par ligne (masquer pièces / main-d\'œuvre / frais)')])]),
      h('div.grille.c2', { style: { marginTop: '8px' } }, [champ('Signature des textos', inSig), null]),
      champ('Pied de page de l\'estimé (le client le lit)', inPied, '{concession} et {validite} sont remplacés'),
      h('h4', 'Suivi de courtoisie'),
      h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', fontSize: '12.5px' } }, [cbAuto, h('span', 'Envoyer automatiquement'), inDelai, h('span', 'jour(s) après'), selApres]),
      h('div.aide', { text: (d.avisModule ? 'Via le module Avis (page sondage, lien Google, alerte directeur si ≤ 3, rappel à 3 jours, 9 h – 20 h). ' : 'Texto « note de 1 à 5 » (sans le module Avis). ') + (d.courtoisie && d.courtoisie.installee ? 'Déclencheur quotidien installé (10 h).' : 'Déclencheur quotidien NON installé — un administrateur l\'installe ci-dessous.') + (d.courtoisie && d.courtoisie.dernier ? ' Dernier passage ' + quand(d.courtoisie.dernier.le) + ' : ' + d.courtoisie.dernier.envoyes + ' envoyé(s).' : '') }),
      AMX.estAdmin() ? h('div', { style: { marginTop: '6px' } }, [h('button.btn.petit', { type: 'button', text: d.courtoisie && d.courtoisie.installee ? 'Retirer le déclencheur quotidien' : 'Installer le déclencheur quotidien', onclick: function () { self.action({ action: 'textoCourtoisieInstaller', installer: !(d.courtoisie && d.courtoisie.installee) }, 'Déclencheur ' + (d.courtoisie && d.courtoisie.installee ? 'retiré' : 'installé')).then(function (r) { if (r && r.ok) { modale.fermer(); self.charger(true).then(function () { self.ouvrirReglages(); }); } }); } })]) : null,
      h('h4', 'Modèles de textos'),
      modeles,
      h('button.btn.petit', { type: 'button', text: '+ Modèle', style: { marginTop: '6px' }, onclick: function () { ajouterModele({}); } }),
      h('div.aide', 'estime, relance, paiement et courtoisie sont les modèles utilisés par les boutons ; les autres apparaissent dans les conversations.'),
      AMX.estAdmin() ? h('div', [h('h4', 'Paiement en ligne (Stripe)'), h('div.aide', { text: (d.stripe && d.stripe[cie] ? 'Clé Stripe active pour ' + nomCie(cie) + ' : les demandes de paiement créent un lien de paiement par carte.' : 'Aucune clé Stripe : le client paie au comptoir / par téléphone et vous marquez « Payé ».') + ' Compte Stripe → Développeurs › Clés API › clé secrète (sk_live_…). Une clé par concession, ou une commune pour le groupe.' }), h('div', { style: { display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' } }, [
        (function () { var inCle = h('input.saisie.mono', { type: 'password', placeholder: 'sk_live_… (vide = retirer)', style: { flex: '1 1 260px', fontSize: '12px' } }), selPour = h('select.saisie', { style: { width: 'auto' } }, [h('option', { value: cie, text: nomCie(cie) }), h('option', { value: '', text: 'Tout le groupe' })]); return h('div', { style: { display: 'flex', gap: '6px', flex: '1 1 auto', flexWrap: 'wrap' } }, [inCle, selPour, h('button.btn.petit', { type: 'button', text: 'Enregistrer la clé', onclick: function () { self.action({ action: 'textoStripe', compagnie: selPour.value, cle: inCle.value.trim() }, null).then(function (r) { if (r && r.ok) { AMX.toast(r.actif ? 'Stripe actif (' + r.mode + ')' : 'Clé Stripe retirée', 'ok'); modale.fermer(); self.charger(true).then(function () { self.ouvrirReglages(); }); } }); } })]); })()
      ])]) : null
    ]);
    var modale = AMX.modale({ titre: 'Réglages Texto — ' + nomCie(cie), corps: corps, large: true, boutons: [{ texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: function () {
      var config = { tauxMo: num(inTaux.value), taxes: cbTaxes.checked, regrouper: cbRegrouper.checked, validiteJours: Math.max(1, Math.round(num(inValid.value)) || 30), telephone: inTel.value, signature: inSig.value.trim(), pied: inPied.value.trim(), courtoisie: { auto: cbAuto.checked, delaiJours: Math.max(0, Math.round(num(inDelai.value))), apres: selApres.value }, modeles: lignesM.filter(function (x) { return document.body.contains(x.el); }).map(function (x) { return x.lire(); }).filter(function (m) { return m.titre && m.texte; }) };
      return self.action({ action: 'textoConfig', compagnie: cie, config: config }, 'Réglages enregistrés').then(function (r) { if (!r || !r.ok) return false; if (self.donnees && self.donnees.configs) self.donnees.configs[cie] = r.config; AMX.texto.invalider(); self.charger(true); return true; });
    } }] });
  };
  AMX.texto.Vue = VueTexto;
})();
