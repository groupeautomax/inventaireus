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
    '.ptf-prep .lien { font-family: var(--mono); font-size: 12px; word-break: break-all; background: var(--gris-bg); padding: 8px 10px; border-radius: 8px; margin: 6px 0; }'
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
    if (ol && (nombre(ol.prevision) || nombre(ol.prixMoy))) { base = nombre(ol.prevision) || nombre(ol.prixMoy); kmBase = nombre(ol.prevision) ? (nombre(ol.previsionKm) || nombre(ol.km)) : nombre(ol.kmMoy); lu = String(ol.luLe || '').slice(0, 10); }
    else if (v.valeur) { base = nombre(v.valeur.prevision) || nombre(v.valeur.prixMoy); kmBase = nombre(v.valeur.prevision) ? nombre(v.valeur.previsionKm) : nombre(v.valeur.kmMoy); lu = v.valeur.luLe || ''; }
    if (base) {
      var val = base;
      if (a.km && kmBase) val += (kmBase - a.km) * (nombre(p.tauxKm) || 0.10);
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
    this.elFiltres = h('div'); conteneur.appendChild(this.elFiltres);
    this.elPortee = h('div'); conteneur.appendChild(this.elPortee);
    this.elChiffres = h('div.ptf-chiffres'); conteneur.appendChild(this.elChiffres);
    this.elSegments = h('div.ptf-segments'); conteneur.appendChild(this.elSegments);
    this.elPortrait = h('div.ptf-portrait'); conteneur.appendChild(this.elPortrait);
    this.elSync = h('p.ptf-sync'); conteneur.appendChild(this.elSync);
    this.elListe = h('div'); conteneur.appendChild(this.elListe);
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
  VuePortefeuille.prototype.naviguer = function (ctx) { var p = (ctx && ctx.params) || {}, chg = false; if (p.segment !== undefined) { this.f.segment = p.segment; chg = true; } if (p.page !== undefined) { this.f.page = p.page; chg = true; } if (chg) this.rafraichir(); };
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
    this.elSous.textContent = 'Bâti le ' + (d.construitLe ? AMX.fmtDate(d.construitLe, true) : '—') + ' · ' + AMX.fmtNombre(r.actifs || 0) + ' véhicules au client · sources : ventes ' + AMX.fmtNombre(s.vente || 0) + ', prêteurs ' + AMX.fmtNombre(s.preteur || 0) + ', service ' + AMX.fmtNombre(s.service || 0) + ', évaluations ' + AMX.fmtNombre(s.evaluation || 0) + ', DMS ' + AMX.fmtNombre(s.dms || 0) + (d.offres ? ' · offres : stock ' + AMX.fmtNombre(d.offres.stockNeufs) + ' neufs et ' + AMX.fmtNombre(d.offres.stockOccasion) + ' occasions, ' + AMX.fmtNombre(d.offres.programmes) + ' programme' + (d.offres.programmes > 1 ? 's' : '') + ' ce mois' : '') + (d.aRebatir ? ' · changement reçu, rebâti dans la minute' : '');
    /* avis : le DMS */
    AMX.vider(this.elAvis);
    var dms = d.dms || {};
    if (!dms.vehicules && !dms.bts && !dms.clients) {
      this.elAvis.appendChild(h('div.ptf-avis', [
        h('p', { html: '<b>Les fichiers du DMS ne sont pas encore reçus.</b> Les clients « service seulement » (souvent la moitié du portefeuille et plus) viendront avec eux. En attendant, le portefeuille est bâti avec les ventes du Livre des ventes, les contrats des prêteurs, le service (Texto, Rendez-vous) et les évaluations.' }),
        direction ? h('button.btn.petit', { type: 'button', text: 'Importer un fichier du DMS', onclick: function () { self.importer(); } }) : null
      ]));
    }
    if (d.offres && !d.offres.programmes) this.elAvis.appendChild(h('div.ptf-avis', [
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
    var liste = this.filtrees();
    var filtres = [];
    if (this.f.etat) filtres.push(NOMS_ETAT[this.f.etat]);
    if (this.f.relation) filtres.push(NOMS_RELATION[this.f.relation]);
    if (this.f.consent) filtres.push({ joignable: 'Joignables', offres: 'Offres OK', nonJoignable: 'Pas joignables' }[this.f.consent]);
    if (this.f.segment) filtres.push(NOM_SEGMENT[this.f.segment]);
    if (this.f.page) filtres.push({ aTraiter: 'Réponses à traiter', vue: 'Pages vues', envoyee: 'Pages pas encore vues', refus: 'Ne plus recevoir', aucune: 'Sans page client' }[this.f.page]);
    if (this.f.q) filtres.push('« ' + this.f.q + ' »');
    this._filtresTexte = filtres.filter(function (x) { return x && x !== NOM_SEGMENT[self.f.segment] && !(self.f.etat === 'actif' && x === NOMS_ETAT.actif); }).join(' · ');
    var nCamp = liste.filter(function (a) { return a.v.etat === 'actif'; }).length;
    this.btnCampagne.textContent = 'Campagne avec cette liste (' + AMX.fmtNombre(nCamp) + ')';
    AMX.porteeChiffres(this.elPortee, { n: liste.length, unite: ['véhicule', 'véhicules'], contexte: AMX.COMPAGNIES_TOUTES[this.cie] || this.cie, filtres: filtres, effacer: function () { self.f = { q: '', etat: 'actif', relation: '', consent: '', segment: '', page: '' }; self.inRecherche.value = ''; self.rafraichir(); } });
    this.rendreChiffres(liste, params);
    this.rendreSegments(params);
    this.rendrePortrait(liste);
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
  VuePortefeuille.prototype.rendrePortrait = function (liste) {
    AMX.vider(this.elPortrait);
    var self = this, n = liste.length || 1;
    function bloc(titre, lignes) {
      var c = h('div.carte', [h('h3', { text: titre })]);
      lignes.forEach(function (l) { var pct = Math.round(l[1] / n * 100); c.appendChild(h('div.ptf-barre', [h('span', { text: l[0] }), h('b', { text: AMX.fmtNombre(l[1]) + ' · ' + pct + ' %' }), h('div.j', [h('i' + (l[2] ? '.' + l[2] : ''), { style: { width: pct + '%' } })])])); });
      self.elPortrait.appendChild(c);
    }
    function compte(test) { return liste.filter(test).length; }
    bloc('Relation', [['Ventes seulement', compte(function (a) { return a.v.relation === 'vente'; })], ['Ventes et service', compte(function (a) { return a.v.relation === 'venteService'; })], ['Service seulement', compte(function (a) { return a.v.relation === 'service'; }), 'bleu'], ['Évalués', compte(function (a) { return a.v.relation === 'evaluation'; }), 'ambre']]);
    bloc('Consentement (LCAP)', [['Exprès', compte(function (a) { return a.v.consent && a.v.consent.lcap === 'expres'; })], ['Tacite (2 ans)', compte(function (a) { return a.v.consent && a.v.consent.lcap === 'tacite'; }), 'bleu'], ['Échu ou inconnu', compte(function (a) { return a.v.consent && (a.v.consent.lcap === 'echu' || a.v.consent.lcap === 'inconnu'); }), 'ambre'], ['Refus ou STOP', compte(function (a) { return a.v.consent && a.v.consent.lcap === 'refus'; }), 'rouge']]);
    bloc('Financement', [['Location', compte(function (a) { return a.v.contrat && /location|lease/i.test(a.v.contrat.typeContrat); })], ['Financement', compte(function (a) { return a.v.contrat && /financ|retail|loan/i.test(a.v.contrat.typeContrat); }), 'bleu'], ['Comptant', compte(function (a) { return a.v.contrat && /comptant|cash/i.test(a.v.contrat.typeContrat); }), 'ambre'], ['Inconnu', compte(function (a) { return !a.v.contrat; }), 'rouge']]);
    var y = new Date().getFullYear();
    bloc('Âge du véhicule', [['0 à 2 ans', compte(function (a) { return a.v.annee && y - a.v.annee <= 2; })], ['3 à 5 ans', compte(function (a) { return a.v.annee && y - a.v.annee >= 3 && y - a.v.annee <= 5; }), 'bleu'], ['6 à 8 ans', compte(function (a) { return a.v.annee && y - a.v.annee >= 6 && y - a.v.annee <= 8; }), 'ambre'], ['9 ans et plus', compte(function (a) { return a.v.annee && y - a.v.annee >= 9; }), 'rouge']]);
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
  VuePortefeuille.prototype.rendreListe = function (liste) {
    var self = this, d = this.rep;
    AMX.vider(this.elListe);
    if (!liste.length) { this.elListe.appendChild(h('div.ptf-vide', { text: d.vehicules.length ? 'Aucun véhicule avec ces filtres.' : 'Le portefeuille est vide pour cette concession.' })); return; }
    liste = liste.slice().sort(function (a, b) {
      var sa = (a.equite !== undefined ? a.equite : -1e9), sb = (b.equite !== undefined ? b.equite : -1e9);
      if (sb !== sa) return sb - sa;
      return String((b.v.achat && b.v.achat.le) || (b.v.service && b.v.service.derniere) || '').localeCompare(String((a.v.achat && a.v.achat.le) || (a.v.service && a.v.service.derniere) || ''));
    });
    var tbody = h('tbody');
    liste.slice(0, this.limite).forEach(function (a) {
      var v = a.v, c = v.client || {};
      var segs = a.segments.slice(0, 3).map(function (s) { return h('span.ptf-puce.mauve', { text: NOM_SEGMENT[s] }); });
      tbody.appendChild(h('tr', { onclick: function () { self.fiche(a); } }, [
        h('td', [h('b', { text: c.nom || '(client inconnu)' }), h('span.s', { text: contactTexte(c, d) || '—' })]),
        h('td', [h('span', { text: vehiculeTexte(v) }), h('span.s.mono', { text: v.vin || 'sans NIV' })]),
        h('td', [h('span', { text: NOMS_RELATION[v.relation] || '' }), h('span.s', { text: v.etat !== 'actif' ? NOMS_ETAT[v.etat] : (v.achat ? 'acheté ' + dateAn(v.achat.le) : (v.service && v.service.derniere ? 'service ' + dateAn(v.service.derniere) : '')) })]),
        h('td.num', [h('span', { text: a.km ? AMX.fmtNombre(a.km) + ' km' : '—' }), h('span.s', { text: v.km && v.km.methode === 'lectures' ? 'projeté (lectures)' : (v.km && v.km.methode === 'une' ? 'estimé (une lecture)' : (v.km && v.km.methode ? 'estimé (année)' : '')) })]),
        h('td.num', [h('span', { text: a.valeur !== undefined ? AMX.fmtArgent(a.bas) + ' – ' + AMX.fmtArgent(a.haut) : '—' }), h('span.s', { text: a.valeur !== undefined ? 'OpenLane ' + AMX.fmtArgent(a.valeur) : '' })]),
        h('td.num', [h('span.ptf-eq' + (a.equite === undefined ? '' : (a.equite >= 0 ? '.plus' : '.moins')), { text: a.equite !== undefined ? AMX.fmtArgent(a.equite) : '—' }), h('span.s', { text: a.dette && a.dette.solde !== null ? 'dette ' + AMX.fmtArgent(a.dette.solde) : (v.contrat ? '' : 'dette inconnue') }), h('span.s', { text: v.contrat ? (v.contrat.typeContrat || '') + (a.finDans !== undefined && a.finDans !== null && a.finDans >= 0 ? ' · fin ' + dateAn(v.contrat.echeance) : '') : '' })]),
        h('td.ptf-offre-l', celluleOffre(a)),
        h('td', [puceConsent(v)].concat(puceTPage(pagesDe(self.cie, v.cle)), segs))
      ]));
    });
    this.elListe.appendChild(h('div.ptf-cadre', [h('table.tableau.ptf-table', [
      h('thead', [h('tr', ['Client', 'Véhicule', 'Relation', 'Km', 'Valeur (fourchette)', 'Équité · dette du jour', 'Meilleure offre', 'Consentement · segments'].map(function (t) { return h('th', { text: t }); }))]),
      tbody
    ])]));
    if (liste.length > this.limite) this.elListe.appendChild(h('div.ptf-plus', [h('button.btn', { type: 'button', text: 'Afficher ' + Math.min(150, liste.length - this.limite) + ' de plus (' + AMX.fmtNombre(liste.length - this.limite) + ' restants)', onclick: function () { self.limite += 150; self.rendreListe(self.filtrees()); } })]));
  };

  /* --------------------------------------------------------------------------------------------- fiche */
  VuePortefeuille.prototype.fiche = function (a) {
    var self = this, v = a.v, c = v.client || {}, d = this.rep, corps = h('div');
    function dl(lignes) { var x = h('dl.ptf-detail'); lignes.forEach(function (l) { if (l[1] === '' || l[1] === null || l[1] === undefined) return; x.appendChild(h('dt', { text: l[0] })); x.appendChild(h('dd', typeof l[1] === 'string' || typeof l[1] === 'number' ? { text: String(l[1]) } : {}, typeof l[1] === 'object' ? [l[1]] : null)); }); return x; }
    function date(iso) { return iso ? AMX.fmtDateCourte(String(iso).slice(0, 10) + 'T12:00:00') + ' ' + String(iso).slice(0, 4) : ''; }
    corps.appendChild(h('div.ptf-h', { text: 'Véhicule' }));
    corps.appendChild(dl([['Véhicule', vehiculeTexte(v)], ['NIV', v.vin || 'sans NIV'], ['Plaque', v.plaque], ['État', NOMS_ETAT[v.etat] + (v.echangeLe ? ' le ' + date(v.echangeLe) : '') + (v.chezNous ? ' (registre ' + v.chezNous + ')' : '')], ['Relation', NOMS_RELATION[v.relation]],
      ['Km projeté', a.km ? AMX.fmtNombre(a.km) + ' km' + (v.km.methode === 'lectures' ? ' (' + v.km.parJour + ' km/jour d\'après les lectures)' : (v.km.methode === 'une' ? ' (une lecture + ' + AMX.fmtNombre(d.params.kmParAn) + ' km/an)' : ' (estimé d\'après l\'année)')) : ''],
      ['Dernière lecture', v.km && v.km.dernier ? AMX.fmtNombre(v.km.dernier.km) + ' km le ' + date(v.km.dernier.le) + ' (' + v.km.dernier.source + ')' : '']]));
    corps.appendChild(h('div.ptf-h', { text: 'Client' }));
    corps.appendChild(dl([['Nom', c.nom || '(inconnu)'], ['Coordonnées', contactTexte(c, d)], ['Ville', [c.ville, c.province, d.contact ? c.codePostal : ''].filter(Boolean).join(' ')], ['Langue', c.langue === 'en' ? 'anglais' : (c.langue === 'fr' ? 'français' : '')], ['No client (DMS)', c.noClient], ['Véhicules de ce client', v.vehiculesClient > 1 ? String(v.vehiculesClient) : '']]));
    var k = v.consent || {};
    corps.appendChild(h('div.ptf-h', { text: 'Consentement' }));
    corps.appendChild(dl([['LCAP', NOMS_LCAP[k.lcap] + (k.jusqua ? ' — jusqu\'au ' + date(k.jusqua) : '') + (k.base ? ' (dernier ' + (k.base === 'achat' ? 'achat' : 'service payé') + ' le ' + date(k.baseLe) + ')' : '')],
      ['Offres personnalisées', k.loi25 ? (k.offres === 'oui' ? 'oui (consentement distinct, Loi 25)' : 'pas de consentement distinct — exigé au Québec pour une offre personnalisée (Loi 25, art. 12)') : (k.offres === 'oui' ? 'oui' : 'consentement LCAP suffisant en Ontario')],
      ['Restrictions', [k.stop ? 'STOP par texto' : '', k.textoRefus && !k.stop ? 'textos refusés' : '', k.courrielRefus ? 'courriels refusés' : '', k.ndnc ? 'Ne pas téléphoner' : ''].filter(Boolean).join(' · ')]]));
    if (v.achat) { corps.appendChild(h('div.ptf-h', { text: 'Achat' })); corps.appendChild(dl([['Date', date(v.achat.le)], ['Type', v.achat.type === 'neuf' ? 'Neuf' : (v.achat.type === 'usage' ? 'Occasion' : '')], ['Conseiller', v.achat.conseiller], ['Paiement', v.achat.paiement], ['Prix', v.achat.prix ? AMX.fmtArgent(v.achat.prix) : ''], ['Source', { livre: 'Livre des ventes', dms: 'DMS', preteur: 'prêteur' }[v.achat.source] || ''], ['Vente', v.achat.venteId]])); }
    if (v.contrat) {
      var ct = v.contrat;
      corps.appendChild(h('div.ptf-h', { text: 'Contrat' }));
      corps.appendChild(dl([['Type', ct.typeContrat], ['Prêteur', ct.source === 'dms' ? ct.preteur : ({ bmw: 'BMW Financial Services', gm: 'Financière GM', vwf: 'VW Finance', hmf: 'Hyundai Finance' }[ct.source] || ct.source)], ['Échéance', date(ct.echeance)], ['Paiement', ct.paiement ? AMX.fmtArgent(ct.paiement) + ' / mois' : ''], ['Taux', ct.taux !== null && ct.taux !== undefined ? String(ct.taux).replace('.', ',') + ' %' : ''], ['Résiduel', ct.residuel ? AMX.fmtArgent(ct.residuel) : ''],
        ['Dette du jour', a.dette && a.dette.solde !== null ? AMX.fmtArgent(a.dette.solde) + (a.dette.source === 'preteur' ? ' (solde du prêteur reporté à aujourd\'hui)' : (a.dette.source === 'contrat' ? ' (calculée d\'après le contrat)' : '')) : 'à calculer'], ['Km du contrat', ct.kmContrat ? AMX.fmtNombre(ct.kmContrat) + ' km' : '']]));
    }
    if (v.service || v.prochainRdv) { corps.appendChild(h('div.ptf-h', { text: 'Service' })); corps.appendChild(dl([['Dernière visite', v.service ? date(v.service.derniere) : ''], ['Dernière visite payée', v.service ? date(v.service.derniereFacturee) : ''], ['Visites (24 mois)', v.service ? String(v.service.visites24) : ''], ['Client depuis', v.service ? date(v.service.premiere) : ''], ['Prochain rendez-vous', date(v.prochainRdv)]])); }
    if (v.evaluation) { corps.appendChild(h('div.ptf-h', { text: 'Évaluation' })); corps.appendChild(dl([['Évalué le', date(v.evaluation.le)], ['Suivi', v.evaluation.statut]])); }
    if ((a.offres || []).length) {
      corps.appendChild(h('div.ptf-h', { text: 'Offres (calculées le ' + dateAn(d.construitLe) + ', notre stock et les programmes du mois)' }));
      var zo = h('div.ptf-offres');
      a.offres.forEach(function (o) { zo.appendChild(carteOffre(o)); });
      corps.appendChild(zo);
      corps.appendChild(h('p.doux.petit', { text: 'Paiements avec taxes (' + (d.offres ? String(d.offres.taxePct).replace('.', ',') : '') + ' %), échange au bas de la fourchette interne. Rien n\'est envoyé d\'ici : préparez la page client ci-dessous et envoyez-lui le lien vous-même.' }));
    }
    corps.appendChild(h('div.ptf-h', { text: 'Page client' }));
    corps.appendChild(this.sectionPages(a));
    corps.appendChild(h('div.ptf-h', { text: 'Valeur et équité' }));
    var zoneVal = h('div');
    function dessinerValeur() {
      AMX.vider(zoneVal);
      var b = analyser(v, d.params, auj());
      zoneVal.appendChild(dl([['Valeur interne', b.valeur !== undefined ? AMX.fmtArgent(b.valeur) + ' (OpenLane, gros, ajustée au km projeté)' + (b.regle ? ' · règle ' + AMX.fmtArgent(b.regle.ajustement) : '') : 'pas encore lue'], ['Fourchette', b.valeur !== undefined ? AMX.fmtArgent(b.bas) + ' – ' + AMX.fmtArgent(b.haut) : ''], ['Lue le', date(b.valeurLu)], ['Équité', b.equite !== undefined ? AMX.fmtArgent(b.equite) : (v.contrat ? '' : 'dette inconnue (financement hors prêteur captif)')],
        ['Garantie de base', b.garantie ? 'jusqu\'au ' + date(b.garantie.fin) + ' ou ' + AMX.fmtNombre(b.garantie.km) + ' km' : ''], ['Segments', b.segments.map(function (s) { return NOM_SEGMENT[s]; }).join(' · ')]]));
      if (v.vin && self.peutLireOpenlane()) zoneVal.appendChild(h('button.btn.petit', { type: 'button', text: b.valeur !== undefined ? 'Relire la valeur OpenLane' : 'Lire la valeur OpenLane', onclick: function (e) {
        var btn = e.currentTarget; btn.classList.add('occupe');
        AMX.openlane.direct(v.vin, b.km || '', { source: 'portefeuille', compagnie: self.cie, forcer: b.valeur !== undefined }).then(function (r) { btn.classList.remove('occupe'); if (r && r.nonConnecte) AMX.toast('OpenLane n\'est pas branché au site.', 'erreur'); dessinerValeur(); self.planifier(); }, function (er) { btn.classList.remove('occupe'); AMX.toast(AMX.erreurTexte(er), 'erreur'); });
      } }));
      zoneVal.appendChild(h('p.doux.petit', { text: 'La valeur OpenLane est une valeur de gros, pour l\'équipe seulement : elle ne se montre pas au client (licence).' }));
    }
    dessinerValeur(); corps.appendChild(zoneVal);
    var liens = h('div.actions-ligne', { style: { marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' } });
    if (v.vin) liens.appendChild(h('a.btn.petit', { href: AMX.lien('outils', 'evaluation', { vin: v.vin }), text: 'Évaluer ce véhicule' }));
    if (v.contrat && v.contrat.source !== 'dms') liens.appendChild(h('a.btn.petit', { href: AMX.lien('relance', 'equite', {}), text: 'Ouvrir dans Équité' }));
    corps.appendChild(liens);
    AMX.modale({ titre: (c.nom || 'Client inconnu') + ' — ' + vehiculeTexte(v), corps: corps, large: true, proteger: false });
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
      h('div.doux.petit', { text: (o.neuf ? 'Neuf' : 'Occasion') + ' · ' + ({ memeModele: 'même modèle', memeSegment: 'même catégorie', occasion: 'même modèle, plus récent' }[o.groupe] || '') + (o.programme ? ' · programme : ' + (o.programme.note || o.programme.id) : '') + (o.rabaisNotes && o.rabaisNotes.length ? ' · rabais : ' + o.rabaisNotes.join(', ') : '') }),
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
    corps.appendChild(h('div.barre-mois', [h('label', { text: 'Mois' }), selMois, btnCopier]));
    corps.appendChild(zone);
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
      if (!r.programmes.length) zone.appendChild(h('p.doux', { text: 'Aucun programme pour ce mois.' }));
      else {
        var tb = h('tbody');
        r.programmes.forEach(function (p) {
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
        zone.appendChild(h('div.ptf-cadre', [h('table.tableau', [h('thead', [h('tr', ['Type', 'Véhicules', 'Années', 'État', 'Conditions', 'Fin · note', ''].map(function (t) { return h('th', { text: t }); }))]), tb])]));
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
      champ('kmParAn', 'Km par année (estimé)', 'quand on n\'a qu\'une lecture ou aucune'), champ('tauxKm', 'Ajustement au km ($ / km)', 'prévision OpenLane ramenée au km projeté'),
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
