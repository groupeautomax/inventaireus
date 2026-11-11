/* =====================================================================================================
   location-bmw.js — Inventaire › Occasion › Location BMW (10 nov. 2026)

   Maxime : « voici l'outil pour calculer les locations des véhicules d'occasion […] un outil dans le site avec un NIV et un
   km pour calculer les locations uniquement pour BMW ; ce programme est bon nov et déc ».

   L'employé tape (ou scanne) le NIV et le km : la page décode le NIV (?decoder=, sinon NHTSA vPIC), trouve la version dans
   la grille des valeurs résiduelles de BMW Services financiers et donne, pour chaque durée offerte (24, 36, 48 mois), le
   résiduel, le taux du programme et le paiement mensuel avant taxes et taxes incluses. Prix de vente, frais et comptant se
   tapent ; le km par année se choisit (18 000, 24 000 ou 24 001 à 30 000).
   - Données : GET ?locationBmw=1 (LocationBmw.gs) — la grille « Nov-Dec'26 PO RV Tool.xlsx » et les taux du bulletin
     42-26. Elles restent dans le script (bulletin « CONFIDENTIEL », dépôt du site public) : jamais dans ce fichier, jamais
     dans le navigateur (aucune copie locale).
   - Résiduel (comme le classeur de BMW FS) : résiduel de la grille − $/km × km au compteur − $/km × (km par année − 24 000)
     × durée ÷ 12. Km au retour : 150 000 au plus.
   - Paiement (comme MOF_location_ / mensualiteLocation d'equite.js) : coût capitalisé = prix + frais − comptant ;
     (coût − résiduel) ÷ durée + (coût + résiduel) × taux ÷ 2 400 ; TPS 5 % et TVQ 9,975 % sur chaque paiement.
   Qui la voit : un compte qui voit BMW Sherbrooke et qui vend ou évalue (pas le service, le marketing, la RH ni le rôle
   utilisateur) — même règle que le serveur (LBMW_peut_).
   ===================================================================================================== */
(function () {
  'use strict';
  var A = (typeof AMX !== 'undefined') ? AMX : {};
  var h = A.h;
  var SCRIPT_PAS_A_JOUR = 'Le script n\'est pas à jour : déployez la version qui contient LocationBmw.gs.';
  var ROLES_EXCLUS = ['service', 'direction_service', 'marketing', 'utilisateur', 'rh', 'inactif'];
  var URL_VPIC = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/';
  var NOMS_SERIES = { '2 SERIES': 'Série 2', '3 SERIES': 'Série 3', '4 SERIES': 'Série 4', '5 SERIES': 'Série 5', '7 SERIES': 'Série 7', '8 SERIES': 'Série 8', IX: 'iX' };

  /* ======================================================= Le calcul (sans page : testé par t_location_bmw.jxa.js) */
  function norm(s) { return String(s === undefined || s === null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim(); }
  /* « 48 995 », « 48 995,50 », « 48,995 » (milliers à l'anglaise), « 48995.50 $ » → nombre ; vide ou illisible → null. */
  function nombre(x) {
    if (x === null || x === undefined) return null;
    if (typeof x === 'number') return isNaN(x) ? null : x;
    var t = String(x).replace(/[\s  $]/g, '');
    if (!t) return null;
    t = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
    var n = Number(t); return isNaN(n) ? null : n;
  }
  function arrondi(n) { return Math.round(n * 100) / 100; }
  function nomSerie(s) { return NOMS_SERIES[s] || s; }
  /* La version telle que BMW l'écrit, en plus lisible : « M340I XDRIVE SEDAN » → « M340i xDrive Sedan ». */
  function joli(v) {
    return String(v || '').toLowerCase().replace(/\b([a-z])/g, function (x) { return x.toUpperCase(); })
      .replace(/\b(\d+)I\b/g, '$1i').replace(/\b(\d+)E\b/g, '$1e').replace(/\bX(drive|DRIVE)(\d*)I?\b/gi, function (x, a, n) { return 'xDrive' + n + (/i$/i.test(x) && n ? 'i' : ''); })
      .replace(/\bEdrive(\d+)/g, 'eDrive$1').replace(/\bSdrive(\d+)I\b/g, 'sDrive$1i').replace(/\bSdrive(\d+)/g, 'sDrive$1')
      .replace(/\bIx\b/g, 'iX').replace(/\bI([4-7])\b/g, 'i$1').replace(/\b(M\d+)I\b/g, '$1i').replace(/\bXm\b/g, 'XM').replace(/\bCs\b/g, 'CS').replace(/\bXb7\b/g, 'XB7').replace(/\bB8\b/g, 'B8');
  }
  function libelleLigne(l) { return l[0] + ' BMW ' + joli(l[2]); }

  /* -- Trouver la version dans la grille -- */
  var GENERIQUES = { XDRIVE: 1, SDRIVE: 1, EDRIVE: 1, SERIES: 1, SERIE: 1, SEDAN: 1, COUPE: 1, GRAN: 1, CABRIOLET: 1, ROADSTER: 1, TOURING: 1, M: 1, EDITION: 1, BMW: 1 };
  var SERIE_JETON = /^(X[1-7]|XM|Z4|IX|I[4-7]|M[2-8])$/;
  function jetons(s) {
    var out = [];
    var ajout = function (x) { if (x && out.indexOf(x) < 0) out.push(x); };
    norm(s).split(' ').forEach(function (t) {
      if (!t) return;
      ajout(t);
      if (/\d/.test(t) && /I$/.test(t)) ajout(t.slice(0, -1));
      var m = /^([XSE]DRIVE)(\d+)([IE]?)$/.exec(t);
      if (m) { ajout(m[1]); ajout(m[2]); ajout(m[1] + m[2]); }
    });
    return out;
  }
  function poids(t) { return (GENERIQUES[t] || /^\d$/.test(t)) ? 0.3 : 2; }
  function corpsDe(txt) {
    var t = ' ' + norm(txt) + ' ';
    if (/ GRAN COUPE /.test(t)) return 'gran';
    if (/ CABRIOLET | ROADSTER | CONVERTIBLE /.test(t)) return 'cabriolet';
    if (/ COUPE /.test(t)) return 'coupe';
    if (/ SEDAN /.test(t)) return 'berline';
    if (/ TOURING /.test(t)) return 'familiale';
    return '';
  }
  var CORPS_DECODEUR = { coupe: 'coupe', cabriolet: 'cabriolet', berline: 'berline', hayon: 'gran', familiale: 'familiale' };
  /** La série de la grille d'après le texte du décodeur (modèle + version) : « X3 », « 3 SERIES », « IX »… ou ''. */
  function serieDe(txt) {
    var t = ' ' + norm(txt) + ' ', m;
    if ((m = / (X[1-7]|XM|Z4|IX)(?= )/.exec(t))) return m[1];
    if (/ ALPINA XB7 /.test(t)) return 'X7';
    if (/ ALPINA B8 /.test(t)) return '8 SERIES';
    if ((m = / I([4-7]) /.exec(t))) return m[1] + ' SERIES';
    if ((m = / ([2-8]) SERIES /.exec(t))) return m[1] + ' SERIES';
    if ((m = / SERIE ([2-8]) /.exec(t))) return m[1] + ' SERIES';   /* « BMW SERIE 3 2015 » (registre, export du DMS) */
    if ((m = / M?([2-8])\d\d[A-Z]{0,2} /.exec(t))) return m[1] + ' SERIES';
    if ((m = / M([2-8]) /.exec(t))) return m[1] + ' SERIES';
    return '';
  }
  function pointage(dec, ligne) {
    var dj = jetons(dec.texte), cj = jetons(ligne[2]), s = 0, communs = 0;
    cj.forEach(function (t) {
      var p = poids(t);
      if (dj.indexOf(t) >= 0) { s += p; if (p > 1 && !SERIE_JETON.test(t)) communs++; }   /* communs = mots de la version (pas la série) */
      else if (p > 1 && !SERIE_JETON.test(t)) s -= 0.6;
    });
    var cd = CORPS_DECODEUR[dec.carrosserie] || corpsDe(dec.texte), cc = corpsDe(ligne[2]);
    if (cd && cc) s += cd === cc ? 1 : (((cd === 'berline' && cc === 'gran') || (cd === 'gran' && cc === 'berline')) ? 0 : -2);
    if (/ - /.test(ligne[2])) s -= 0.3;   /* une édition spéciale (« - M SPORT EDITION ») : le NIV ne le dit pas ; la version de base d'abord */
    return { s: s, communs: communs };
  }
  /** dec = { annee, marque, modele, version, carrosserie } → { serie, annee, candidats: [{ ligne, s }], choix, sur, raison }. */
  function trouver(prog, dec) {
    var marque = norm(dec.marque), annee = parseInt(dec.annee, 10);
    var texte = [dec.modele, dec.version].filter(Boolean).join(' ');
    var r = { serie: '', annee: annee || null, candidats: [], choix: null, sur: false, raison: '' };
    if (marque && marque !== 'BMW') { r.horsProgramme = true; r.raison = /MINI/.test(marque) ? 'MINI : ce programme est seulement pour les BMW (la MINI a son propre bulletin).' : 'Ce NIV est un véhicule ' + (dec.marque || '?') + ' : ce programme est seulement pour les BMW.'; return r; }
    r.serie = serieDe(texte);
    if (!annee) { r.raison = 'Année-modèle inconnue : choisissez la version à la main.'; return r; }
    if (prog.annees.indexOf(annee) < 0) { r.horsProgramme = true; r.raison = 'Année-modèle ' + annee + ' : la grille de BMW FS couvre ' + prog.annees[0] + ' à ' + prog.annees[prog.annees.length - 1] + '.'; return r; }
    if (!r.serie) { r.raison = 'Série pas reconnue dans « ' + (texte || '?') + ' » : choisissez la version à la main.'; return r; }
    var lignes = prog.grille.filter(function (l) { return l[0] === annee && l[1] === r.serie; });
    if (!lignes.length) { r.raison = 'Aucune ' + nomSerie(r.serie) + ' ' + annee + ' dans la grille de BMW FS.'; return r; }
    var d = { texte: texte, carrosserie: dec.carrosserie };
    r.candidats = lignes.map(function (l) { var p = pointage(d, l); return { ligne: l, s: p.s, communs: p.communs }; })
      .sort(function (a, b) { return (b.s - a.s) || (a.ligne[2].length - b.ligne[2].length); });
    r.choix = r.candidats[0].ligne;
    var ecart = r.candidats.length > 1 ? r.candidats[0].s - r.candidats[1].s : 99;
    r.sur = r.candidats[0].communs >= 1 && ecart >= 1;
    if (!r.sur) r.raison = r.candidats.length > 1 ? 'Le NIV ne dit pas la version exacte : confirmez-la dans la liste.' : 'Vérifiez que c\'est la bonne version.';
    return r;
  }

  /* -- Le résiduel, le taux, le paiement -- */
  function estBev(ligne) { return ligne[1] === 'IX' || /^I[4-7] /.test(ligne[2]); }
  function dureeMax(prog, ligne) { var t = prog.dureeMax[ligne[1]]; var i = prog.annees.indexOf(ligne[0]); return (t && i >= 0) ? t[i] : 0; }
  /** La règle de taux qui s'applique (la première qui convient), ou null. o = { cpo, ixNbv }. */
  function regleTaux(prog, ligne, terme, o) {
    var an = ligne[0], serie = ligne[1], ver = ligne[2], bev = estBev(ligne), cpo = !!(o && o.cpo);
    var l = prog.taux || [];
    for (var i = 0; i < l.length; i++) {
      var r = l[i];
      if (!!r.cpo !== cpo) continue;
      if (an < r.annees[0] || an > r.annees[1]) continue;
      if (terme < r.termes[0] || terme > r.termes[1]) continue;
      if (r.series && r.series.indexOf(serie) < 0) continue;
      if (r.versions && r.versions.indexOf(ver) < 0) continue;
      if (r.bev !== undefined && r.bev !== bev) continue;
      if (r.ixNbv && !(o && o.ixNbv)) continue;
      return r;
    }
    return null;
  }
  function taxePct(prog) { var t = prog.taxes || {}; return (t.tps || 0) + (t.tvq || 0); }
  /** Mensualité d'une location — même formule que MOF_location_ (MoteurOffres.gs) et mensualiteLocation (equite.js). */
  function mensualite(capNet, residuel, taux, terme, tx) {
    var amort = (capNet - residuel) / terme, loyer = (capNet + residuel) * (taux || 0) / 2400;
    var avant = Math.max(0, amort + loyer), taxes = avant * (tx || 0) / 100;
    return { amortissement: amort, loyer: loyer, avantTaxes: avant, taxes: taxes, mensualite: avant + taxes };
  }
  /** Une durée : o = { km, kmAn, prix, frais, comptant, cpo, ixNbv }. */
  function calculerTerme(prog, ligne, terme, o) {
    var i = prog.termes.indexOf(terme), base = i >= 0 ? ligne[3 + i] : 0;
    var r = { terme: terme, offert: false, raison: '', base: base };
    var mx = dureeMax(prog, ligne);
    if (!base) { r.raison = 'Pas offert : ' + mx + ' mois au plus pour l\'année-modèle ' + ligne[0] + ' (' + nomSerie(ligne[1]) + ').'; return r; }
    var km = Math.max(0, nombre(o.km) || 0), kmAn = nombre(o.kmAn) || prog.kmAn.std;
    var ch = prog.chargeKm[ligne[1]] || 0;
    r.charge = ch;
    r.ajOdometre = -ch * km;
    r.ajKmAn = -ch * (kmAn - prog.kmAn.std) * terme / 12;
    r.residuel = base + r.ajOdometre + r.ajKmAn;
    r.kmFin = km + kmAn * terme / 12;
    r.allocation = kmAn * terme / 12;
    if (r.kmFin > prog.kmFinMax) { r.raison = 'Pas offert : ' + Math.round(r.kmFin).toLocaleString('fr-CA') + ' km au retour (' + prog.kmFinMax.toLocaleString('fr-CA') + ' au plus).'; return r; }
    if (r.residuel <= 0) { r.raison = 'Pas offert : le résiduel tombe à zéro avec ce kilométrage.'; return r; }
    var regle = regleTaux(prog, ligne, terme, o);
    if (!regle) { r.raison = 'Pas de taux au bulletin pour cette durée (' + (o.cpo ? 'certifié' : 'non certifié') + ', ' + ligne[0] + ').'; return r; }
    r.offert = true; r.regle = regle; r.taux = regle.taux;
    var prix = nombre(o.prix);
    r.capNet = prix === null ? null : prix + (nombre(o.frais) || 0) - (nombre(o.comptant) || 0);
    r.residuelPct = prix ? r.residuel / prix * 100 : null;
    if (r.capNet !== null) {
      var m = mensualite(r.capNet, r.residuel, regle.taux, terme, taxePct(prog));
      Object.keys(m).forEach(function (k) { r[k] = m[k]; });
      r.residuelPlusHaut = r.residuel >= r.capNet;
    }
    return r;
  }
  /** Validité du programme pour une date AAAA-MM-JJ : { ok, etat: avant | ok | apresBulletin | echu, texte }. */
  function validite(prog, ajd) {
    var b = prog.bulletin || {};
    if (ajd < prog.valideDu) return { ok: false, etat: 'avant', texte: 'Le programme commence le ' + dateFr(prog.valideDu) + '.' };
    if (ajd > prog.valideAu) return { ok: false, etat: 'echu', texte: 'Programme échu le ' + dateFr(prog.valideAu) + ' : il faut la grille et le bulletin du nouveau mois.' };
    if (b.demandesAu && ajd > b.demandesAu) return { ok: true, etat: 'apresBulletin', texte: 'Taux du bulletin ' + (b.no || '') + ' (demandes du ' + dateFr(b.demandesDu) + ' au ' + dateFr(b.demandesAu) + '), gardés pour décembre selon Maxime : vérifiez le bulletin du mois s\'il est arrivé.' };
    return { ok: true, etat: 'ok', texte: 'Demande de crédit jusqu\'au ' + dateFr(b.demandesAu || prog.valideAu) + ', contrat au plus tard le ' + dateFr(b.contratAu || prog.valideAu) + '.' };
  }
  var MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  /* « 9 novembre 2026 à 12 h 55 », à l'heure d'ici. */
  function quandFr(iso, sansHeure) {
    var d = new Date(iso); if (!iso || isNaN(d.getTime())) return '';
    var p2 = function (n) { return String(n).padStart(2, '0'); };
    return dateFr(d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate())) + (sansHeure ? '' : ' à ' + d.getHours() + ' h ' + p2(d.getMinutes()));
  }
  function dateFr(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? (Number(m[3]) === 1 ? '1er' : Number(m[3])) + ' ' + MOIS[Number(m[2]) - 1] + ' ' + m[1] : String(iso || ''); }

  /* -- Chercher un véhicule de nos registres par # stock ou NIV (complet, fin du NIV, ou un bout) : Maxime, 10 nov. -- */
  function cleRech(s) { return String(s === undefined || s === null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function chercherInventaire(liste, q, max) {
    var k = cleRech(q), vus = {}, out = [];
    if (k.length < 3) return [];
    (liste || []).forEach(function (v) {
      var vin = cleRech(v.vin), st = cleRech(v.stock), s = 0;
      if (vin.length !== 17) return;
      if (st && st === k) s = 100;
      else if (vin === k) s = 95;
      else if (k.length >= 4 && vin.slice(-k.length) === k) s = 80;          /* la fin du NIV : les 6 (ou 8) derniers */
      else if (st && st.indexOf(k) === 0) s = 60;
      else if (st && st.indexOf(k) >= 0) s = 40;
      else if (k.length >= 5 && vin.indexOf(k) >= 0) s = 30;
      if (!s) return;
      if (String(v.compagnie || '').toUpperCase() === 'BMW') s += 5;
      if (['arrive', 'comptabilise'].indexOf(v.statut) < 0) s += 3;
      if (/\bBMW\b/i.test(String(v.modele || ''))) s += 2;
      out.push({ v: v, s: s, vin: vin });
    });
    out.sort(function (a, b) { return b.s - a.s; });
    return out.filter(function (x) { if (vus[x.vin]) return false; vus[x.vin] = 1; return true; }).slice(0, max || 8).map(function (x) { return x.v; });
  }

  /* -- Nos BMW en stock (Maxime, 10 nov. : « à côté de Trouver, cliquer et chercher une BMW à travers nos stocks de BMW ») --
     Les BMW de nos registres (le modèle dit BMW), pas vendues ni parties ; un NIV une fois (Detail d'abord). */
  var STATUTS_PARTIS = ['arrive', 'comptabilise', 'transit', 'manheimpa'];
  var RANG_FEUILLE = { DETAIL: 0, CAN: 1, US: 2 };
  function anneeDe(txt) { var m = /\b(19[89]\d|20\d\d)\b/.exec(String(txt || '')); return m ? Number(m[1]) : null; }
  function bmwEnStock(liste) {
    var vus = {}, out = [];
    (liste || []).slice().sort(function (a, b) { return (RANG_FEUILLE[a._feuille] === undefined ? 9 : RANG_FEUILLE[a._feuille]) - (RANG_FEUILLE[b._feuille] === undefined ? 9 : RANG_FEUILLE[b._feuille]); }).forEach(function (v) {
      var vin = cleRech(v.vin);
      if (vin.length !== 17 || vus[vin]) return;
      if (!/\bBMW\b/i.test(String(v.modele || ''))) return;
      if (STATUTS_PARTIS.indexOf(v.statut) >= 0) return;
      vus[vin] = 1;
      out.push({ v: v, vin: vin, annee: anneeDe(v.modele), serie: serieDe(v.modele) });
    });
    return out;
  }
  /* Dans la grille ? { ok, raison } — l'année, puis la série pour cette année (une série inconnue : on laisse choisir). */
  function admissible(prog, x) {
    var annees = {}, series = {};
    ((prog && prog.grille) || []).forEach(function (l) { annees[l[0]] = 1; series[l[0] + '|' + l[1]] = 1; });
    var liste = Object.keys(annees).map(Number).sort();
    if (!x.annee || !liste.length) return { ok: true, raison: '' };
    if (!annees[x.annee]) return { ok: false, raison: x.annee + ' : hors de la grille (' + liste[0] + ' à ' + liste[liste.length - 1] + ')' };
    if (x.serie && !series[x.annee + '|' + x.serie]) return { ok: false, raison: 'pas de ' + nomSerie(x.serie) + ' ' + x.annee + ' dans la grille' };
    return { ok: true, raison: '' };
  }

  /* -- BMW FS (Maxime, 11 nov. : « il faut pouvoir avoir accès au véhicule sur BMW FS pour faire les paiements de location ») --
     Les véhicules à vendre sur la place de marché de BMW Financial Services (Manheim › Disponible), lus par le favori
     « Automax ← Manheim » : les fiches `type: 'dispo'` de ?manheim=1. Une fiche est « à vendre » quand elle a été lue au
     dernier passage du favori (au plus 6 h avant la plus récente) ; les plus vieilles restent, marquées « plus vue ». */
  var FS_FENETRE_MS = 6 * 3600000;
  function bmwfsDisponibles(fiches) {
    var vus = {}, out = [], maxLu = 0;
    (fiches || []).forEach(function (f) { if (f && f.type === 'dispo') { var t = Date.parse(f.luLe || '') || 0; if (t > maxLu) maxLu = t; } });
    (fiches || []).forEach(function (f) {
      if (!f || f.type !== 'dispo') return;
      var vin = cleRech(f.vin);
      if (vin.length !== 17 || vus[vin]) return;
      vus[vin] = 1;
      var t = Date.parse(f.luLe || '') || 0, txt = [f.modele, f.version].filter(Boolean).join(' ');
      out.push({ f: f, vin: vin, annee: Number(f.annee) || anneeDe(txt), serie: serieDe(txt), bmw: /^BMW$/i.test(String(f.marque || '').trim()), actuel: !!maxLu && t >= maxLu - FS_FENETRE_MS });
    });
    return { liste: out, lu: maxLu ? new Date(maxLu).toISOString() : '' };
  }
  function admissibleFs(prog, x) {
    if (!x.bmw) return { ok: false, raison: ((x.f && x.f.marque) || 'Cette marque') + ' : pas dans ce programme (BMW seulement)' };
    return admissible(prog, x);
  }
  /* « 2023 BMW iX xDrive40 » : Manheim répète souvent le modèle dans la version (« iX » + « iX xDrive40 »). */
  function texteFs(f) {
    var mo = f.modele || '', v = f.version || '';
    if (mo && v && (' ' + norm(v) + ' ').indexOf(' ' + norm(mo) + ' ') >= 0) mo = '';
    return [f.annee, f.marque, mo, v].filter(Boolean).join(' ');
  }
  /* Une fiche de BMW FS sous la forme d'une ligne de registre : pour la recherche par la fin du NIV. */
  function fsCommeInv(x) { return { vin: x.vin, stock: '', modele: texteFs(x.f), statut: '', _feuille: 'BMWFS', compagnie: '', _bmwfs: x.f }; }

  var Calcul = { bmwfsDisponibles: bmwfsDisponibles, admissibleFs: admissibleFs, fsCommeInv: fsCommeInv, texteFs: texteFs, bmwEnStock: bmwEnStock, admissible: admissible, anneeDe: anneeDe, chercherInventaire: chercherInventaire, norm: norm, jetons: jetons, serieDe: serieDe, trouver: trouver, regleTaux: regleTaux, calculerTerme: calculerTerme, mensualite: mensualite, validite: validite, estBev: estBev, dureeMax: dureeMax, taxePct: taxePct, joli: joli, libelleLigne: libelleLigne };
  if (!h) { A.locationBmw = { calcul: Calcul }; return; }   /* tests sans page */

  /* ======================================================= La page */
  var CSS = [
    '.lbm-page .lbm-grille { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px 14px; align-items: start; }',
    '.lbm-page .lbm-niv { display: flex; gap: 8px; align-items: stretch; } .lbm-page .lbm-niv .scan-env, .lbm-page .lbm-niv input { flex: 1 1 auto; min-width: 0; }',
    '.lbm-page .lbm-niv input { font-family: ui-monospace, Menlo, Consolas, monospace; letter-spacing: .04em; text-transform: uppercase; }',
    '.lbm-page .lbm-sugg { display: flex; flex-direction: column; border: 1px solid var(--ligne); border-radius: 10px; margin-top: 6px; overflow: hidden; background: var(--carte); box-shadow: var(--ombre); }',
    '.lbm-page .lbm-sugg button { text-align: left; border: none; border-bottom: 1px solid var(--ligne); background: transparent; padding: 10px 12px; font: inherit; color: var(--encre); cursor: pointer; display: flex; gap: 6px 12px; align-items: baseline; flex-wrap: wrap; min-height: 44px; }',
    '.lbm-page .lbm-sugg button:last-child { border-bottom: none; } .lbm-page .lbm-sugg button:hover, .lbm-page .lbm-sugg button:focus-visible { background: var(--vert-clair); outline: none; }',
    '.lbm-page .lbm-sugg .st { font-weight: 800; min-width: 64px; } .lbm-page .lbm-sugg .mod { font-weight: 600; } .lbm-page .lbm-sugg .vin { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12.5px; color: var(--encre-3); } .lbm-page .lbm-sugg .etat { margin-left: auto; font-size: 12px; color: var(--encre-3); }',
    '.lbm-page .lbm-sugg .rien { padding: 10px 12px; font-size: 13px; color: var(--encre-3); }',
    '.lbm-stock .lbm-stock-outils { display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; }',
    '.lbm-stock .lbm-stock-outils input[type=search] { width: 100%; }',
    '.lbm-stock .lbm-stock-pastilles { display: flex; flex-wrap: wrap; gap: 6px; }',
    '.lbm-stock .lbm-stock-pastilles button { border: 1px solid var(--ligne); background: var(--carte); color: var(--encre); border-radius: 999px; padding: 5px 12px; font: inherit; font-size: 13px; cursor: pointer; min-height: 34px; }',
    '.lbm-stock .lbm-stock-pastilles button.actif { background: var(--vert-fonce); border-color: var(--vert-fonce); color: #fff; }',
    '.lbm-stock .lbm-stock-pastilles button .n { opacity: .75; margin-left: 5px; font-variant-numeric: tabular-nums; }',
    '.lbm-stock .lbm-stock-case { display: inline-flex; gap: 6px; align-items: center; font-size: 13.5px; cursor: pointer; } .lbm-stock .lbm-stock-case input { width: 18px; height: 18px; }',
    '.lbm-stock .lbm-stock-compte { font-size: 13px; color: var(--encre-3); }',
    '.lbm-stock .lbm-stock-liste { display: flex; flex-direction: column; border: 1px solid var(--ligne); border-radius: 10px; overflow: hidden; }',
    '.lbm-stock .lbm-stock-liste button { text-align: left; border: none; border-bottom: 1px solid var(--ligne); background: transparent; padding: 10px 12px; font: inherit; color: var(--encre); cursor: pointer; display: flex; gap: 4px 12px; align-items: baseline; flex-wrap: wrap; min-height: 48px; }',
    '.lbm-stock .lbm-stock-liste button:last-child { border-bottom: none; } .lbm-stock .lbm-stock-liste button:hover, .lbm-stock .lbm-stock-liste button:focus-visible { background: var(--vert-clair); outline: none; }',
    '.lbm-stock .lbm-stock-liste .st { font-weight: 800; min-width: 72px; } .lbm-stock .lbm-stock-liste .mod { font-weight: 600; } .lbm-stock .lbm-stock-liste .vin { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12.5px; color: var(--encre-3); }',
    '.lbm-stock .lbm-stock-liste .etat { margin-left: auto; font-size: 12.5px; color: var(--encre-3); text-align: right; }',
    '.lbm-stock .lbm-stock-liste button.hors .mod, .lbm-stock .lbm-stock-liste button.hors .st { color: var(--encre-3); }',
    '.lbm-stock .lbm-stock-liste .hors-puce { font-size: 12px; color: var(--ambre); background: var(--ambre-bg); border-radius: 999px; padding: 1px 8px; }',
    '.lbm-stock .lbm-stock-liste .rien { padding: 16px; text-align: center; font-size: 13.5px; color: var(--encre-3); }',
    '@media (max-width: 640px) { .lbm-page .lbm-niv { flex-wrap: wrap; } .lbm-page .lbm-niv .scan-env, .lbm-page .lbm-niv > input { flex: 1 1 100%; } .lbm-page .lbm-niv > .btn { flex: 1 1 0; justify-content: center; } .lbm-stock .lbm-stock-liste .etat { margin-left: 0; text-align: left; flex-basis: 100%; } }',
    '.lbm-page .lbm-vehicule { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }',
    '.lbm-page .lbm-fs { border: 1px solid var(--bleu-bord); background: var(--bleu-bg); border-radius: 10px; padding: 10px 12px; font-size: 13.5px; line-height: 1.45; display: flex; flex-direction: column; gap: 6px; }',
    '.lbm-page .lbm-fs b { color: var(--bleu); } .lbm-page .lbm-fs-actions { display: flex; gap: 8px; flex-wrap: wrap; }',
    '.lbm-page .lbm-sugg .st.fs, .lbm-stock .lbm-stock-liste .st.fs { color: var(--bleu); }',
    '.lbm-page .lbm-veh-titre { font-size: 17px; font-weight: 700; } .lbm-page .lbm-veh-sous { font-size: 13px; color: var(--encre-3); }',
    '.lbm-page .lbm-version { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; } .lbm-page .lbm-version select { flex: 1 1 320px; min-width: 0; max-width: 620px; }',
    '.lbm-page .lbm-avis { border-radius: 10px; padding: 10px 12px; font-size: 13.5px; line-height: 1.45; margin: 10px 0 0; }',
    '.lbm-page .lbm-avis.rouge { background: var(--rouge-bg); color: var(--rouge); border: 1px solid var(--rouge-bord); }',
    '.lbm-page .lbm-avis.ambre { background: var(--ambre-bg); color: var(--ambre); border: 1px solid var(--ambre-bord); }',
    '.lbm-page .lbm-avis.bleu { background: var(--bleu-bg); color: var(--bleu); border: 1px solid var(--bleu-bord); }',
    '.lbm-page .lbm-avis.vert { background: var(--vert-clair); color: var(--vert-fonce); border: 1px solid #B6E0C6; }',
    '.lbm-page [hidden] { display: none !important; }',
    '.lbm-page .lbm-km-autre, .lbm-page .champ input.lbm-km-autre { width: 150px; flex: 0 0 150px; } .lbm-page .lbm-cases { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; margin-top: 12px; font-size: 13.5px; }',
    '.lbm-page .lbm-cases label { display: inline-flex; gap: 6px; align-items: center; cursor: pointer; }',
    '.lbm-page .lbm-cases input[type=checkbox] { width: 18px; height: 18px; }',
    '.lbm-page .lbm-tableau td.num, .lbm-page .lbm-tableau th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }',
    '.lbm-page .lbm-tableau td { font-size: 13.5px; } .lbm-page .lbm-tableau .gros { font-size: 17px; font-weight: 800; }',
    '.lbm-page .lbm-tableau .doux { display: block; font-size: 12px; color: var(--encre-3); font-weight: 400; white-space: normal; }',
    '.lbm-page .lbm-tableau tr.non td { color: var(--encre-3); background: var(--carte-2); }',
    '.lbm-page .lbm-tableau tr.meilleur td { background: var(--vert-clair); }',
    '.lbm-page .lbm-defile { overflow-x: auto; }',
    '.lbm-page .lbm-matrice { width: auto; min-width: 360px; } .lbm-page .lbm-matrice td, .lbm-page .lbm-matrice th { text-align: right; } .lbm-page .lbm-matrice td:first-child, .lbm-page .lbm-matrice th:first-child { text-align: left; }',
    '.lbm-page .lbm-matrice tr.actif td { font-weight: 700; }',
    '.lbm-page .lbm-cond { margin: 0; padding-left: 18px; font-size: 13px; line-height: 1.5; color: var(--encre-2); } .lbm-page .lbm-cond li { margin-bottom: 4px; }',
    '.lbm-page .lbm-vide { padding: 22px; text-align: center; color: var(--encre-3); font-size: 14px; }',
    '.lbm-page .kpis .kpi { min-width: 170px; }',
    '.lbm-detail table { width: 100%; border-collapse: collapse; font-size: 14px; } .lbm-detail td { padding: 6px 4px; border-bottom: 1px solid var(--ligne); } .lbm-detail td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }',
    '.lbm-detail tr.total td { font-weight: 800; border-top: 2px solid var(--encre-4); } .lbm-detail tr.sec td { padding-top: 14px; font-weight: 700; color: var(--encre-3); font-size: 12px; text-transform: uppercase; letter-spacing: .05em; border-bottom: none; }',
    '.lbm-detail p { font-size: 13px; color: var(--encre-3); margin: 10px 0 0; line-height: 1.45; }',
    '.lbm-page .lbm-tableau td:first-child b, .lbm-page .lbm-matrice td { white-space: nowrap; }',
    '@media (max-width: 640px) { .lbm-page .lbm-grille { grid-template-columns: 1fr 1fr; } .lbm-page .lbm-tableau .col-taxes, .lbm-page .lbm-tableau .col-avant, .lbm-page .lbm-tableau .col-total { display: none; } .lbm-page .lbm-tableau td, .lbm-page .lbm-tableau th { padding: 8px 7px; } .lbm-page .lbm-tableau .gros { font-size: 16px; } .lbm-page .lbm-matrice { min-width: 0; } .lbm-page .lbm-matrice td, .lbm-page .lbm-matrice th { padding: 7px 6px; font-size: 12.5px; } }'
  ].join('\n');
  function css() { if (document.getElementById('css-location-bmw')) return; var s = document.createElement('style'); s.id = 'css-location-bmw'; s.textContent = CSS; document.head.appendChild(s); }

  function role() { return String((A.session && (A.session.role || (A.session.perms || {}).role)) || '').toLowerCase(); }
  function peutVoir() {
    var r = role();
    if (!r || ROLES_EXCLUS.indexOf(r) >= 0) return false;
    return A.codesPour ? A.codesPour('inventaire').indexOf('BMW') >= 0 : false;
  }
  function argent(n, d) { if (n === null || n === undefined || isNaN(n)) return '—'; if (Math.abs(n) < 0.005) n = 0; return A.fmtArgent(n, d === undefined ? 0 : d); }
  function pct(n, d) { return (n === null || n === undefined || isNaN(n)) ? '—' : Number(n).toLocaleString('fr-CA', { minimumFractionDigits: d === undefined ? 2 : d, maximumFractionDigits: d === undefined ? 2 : d }) + ' %'; }
  function kmTxt(n) { return (n === null || n === undefined || isNaN(n)) ? '—' : A.fmtNombre(Math.round(n)) + ' km'; }
  function ajd() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  /* Les données du programme : gardées en mémoire seulement (confidentielles), 6 h. */
  var cache = { rep: null, le: 0, enCours: null };
  function charger(force) {
    if (cache.enCours) return cache.enCours;
    if (!force && cache.rep && Date.now() - cache.le < 6 * 3600000) return Promise.resolve(cache.rep);
    cache.enCours = A.get({ locationBmw: '1' }, { secours: false, delai: 60000 }).then(function (d) {
      cache.enCours = null;
      if (d && d.refuse) throw new Error(d.erreur || 'Accès refusé.');
      if (!d || !d.programme || !Array.isArray(d.programme.grille)) throw new Error((d && d.erreur) || SCRIPT_PAS_A_JOUR);
      cache.rep = d; cache.le = Date.now();
      return d;
    }, function (e) { cache.enCours = null; throw e; });
    return cache.enCours;
  }

  /* Le décodeur : le script (?decoder=, vPIC puis MarketCheck), sinon vPIC directement. */
  function decoder(vin) {
    var vpic = function () {
      return fetch(URL_VPIC + encodeURIComponent(vin) + '?format=json').then(function (r) { return r.json(); }).then(function (d) {
        var r = (d && d.Results || [])[0]; if (!r || !r.Make) return null;
        var body = String(r.BodyClass || '').toLowerCase();
        var c = /convertible|cabriolet|roadster/.test(body) ? 'cabriolet' : (/coupe/.test(body) ? 'coupe' : (/sedan|saloon/.test(body) ? 'berline' : (/hatchback|liftback/.test(body) ? 'hayon' : (/sport utility|suv|mpv/.test(body) ? 'vus' : ''))));
        return { annee: r.ModelYear || '', marque: r.Make || '', modele: r.Model || '', version: [r.Trim, r.Series].filter(Boolean).join(' '), carrosserie: c, source: 'NHTSA vPIC' };
      }).catch(function () { return null; });
    };
    return A.get({ decoder: vin }, { secours: false, delai: 30000 }).then(function (d) {
      if (d && d.ok && d.marque) return { annee: d.annee, marque: d.marque, modele: d.modele, version: d.version, carrosserie: d.carrosserie, source: d.source || 'serveur' };
      return vpic();
    }, function () { return vpic(); });
  }

  function VueLocation(conteneur, ctx) {
    css();
    var self = this, p = (ctx && ctx.params) || {};
    this.detruit = false; this.rep = null; this.dec = null; this.trouve = null; this.ligne = null; this.manuel = false; this.vinCourant = '';
    this.o = {
      km: p.km || '', kmAn: Number(A.memo.lire('locbmw_kman', 24000)) || 24000, kmAutre: '',
      prix: p.prix || '', frais: String(A.memo.lire('locbmw_frais', '') || ''), comptant: '', cpo: A.memo.lire('locbmw_cpo', '1') !== '0', ixNbv: false
    };
    if ([18000, 24000].indexOf(this.o.kmAn) < 0) { this.o.kmAutre = String(this.o.kmAn); }
    A.vider(conteneur);
    this.el = h('div.page.lbm-page'); conteneur.appendChild(this.el);
    this.elSous = h('p', { text: 'Programme BMW Services financiers pour les BMW d\'occasion.' });
    this.btnConditions = h('button.btn', { type: 'button', html: (A.icones.info || '') + '<span>Conditions du programme</span>', onclick: function () { self.ouvrirConditions(); } });
    this.btnEffacer = h('button.btn', { type: 'button', text: 'Nouveau calcul', onclick: function () { self.effacer(); } });
    this.el.appendChild(h('div.entete-page', [
      h('div', [h('h1', 'Location BMW'), this.elSous]),
      h('div.actions', A.actionsEntete ? A.actionsEntete([this.btnEffacer, this.btnConditions], [this.btnConditions]) : [this.btnEffacer, this.btnConditions])
    ]));
    this.elAvisProg = h('div'); this.el.appendChild(this.elAvisProg);

    /* 1. Le véhicule */
    this.inVin = h('input.saisie.niv#lbm-vin', { type: 'text', maxlength: '17', value: String(p.vin || p.stock || '').toUpperCase(), placeholder: 'NIV, 6 derniers du NIV ou # stock', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'NIV ou # stock' });
    this.btnTrouver = h('button.btn.primaire', { type: 'button', html: (A.icones.recherche || '') + '<span>Trouver</span>', onclick: function () { self.trouverSaisie(); } });
    this.btnStock = h('button.btn', { type: 'button', title: 'Parcourir nos BMW en stock (tous les registres)', html: (A.icones.voiture || A.icones.inventaire || '') + '<span>Nos BMW</span>', onclick: function () { self.ouvrirStock(); } });
    this.btnFs = h('button.btn', { type: 'button', hidden: !A.manheim, title: 'Les BMW à vendre sur la place de marché de BMW Financial Services (Manheim), lues par le favori « Automax ← Manheim »', html: (A.icones.voiture || A.icones.inventaire || '') + '<span>BMW FS</span>', onclick: function () { self.ouvrirFs(); } });
    this.elSugg = h('div.lbm-sugg', { hidden: true, role: 'listbox', 'aria-label': 'Véhicules de notre inventaire' });
    this.inKm = h('input#lbm-km', { type: 'text', inputmode: 'numeric', value: this.o.km, placeholder: 'ex. 42 000', autocomplete: 'off' });
    this.elKmAide = h('div.aide', { text: 'Le km au compteur aujourd\'hui.' });
    this.elVeh = h('div.lbm-vehicule');
    this.el.appendChild(h('div.carte', { style: { marginBottom: '14px' } }, [
      h('div.carte-entete', [h('h2', '1. Le véhicule')]),
      h('div.carte-corps', [
        h('div.lbm-grille', [
          h('div.champ', { style: { gridColumn: 'span 2' } }, [h('label', { for: 'lbm-vin', text: 'NIV ou # stock' }), h('div.lbm-niv', [this.inVin, this.btnTrouver, this.btnStock, this.btnFs]), this.elSugg, h('div.aide', { text: 'Le NIV complet, ses 6 derniers caractères ou le # stock d\'un véhicule de nos registres — ou « Nos BMW » pour parcourir nos BMW en stock, « BMW FS » pour les BMW à vendre chez BMW Financial Services.' })]),
          h('div.champ', [h('label', { for: 'lbm-km', text: 'Km au compteur' }), this.inKm, this.elKmAide])
        ]),
        this.elVeh
      ])
    ]));

    /* 2. La location */
    var champ = function (id, lib, input, aide) { return h('div.champ', [h('label', { for: id, text: lib }), input, aide ? h('div.aide', { text: aide }) : null]); };
    this.inPrix = h('input#lbm-prix', { type: 'text', inputmode: 'decimal', value: this.o.prix, placeholder: 'ex. 48 995', autocomplete: 'off' });
    this.inFrais = h('input#lbm-frais', { type: 'text', inputmode: 'decimal', value: this.o.frais, placeholder: '0', autocomplete: 'off' });
    this.inComptant = h('input#lbm-comptant', { type: 'text', inputmode: 'decimal', value: this.o.comptant, placeholder: '0', autocomplete: 'off' });
    this.segCpo = h('div.segment.bloc', { role: 'radiogroup', 'aria-label': 'Certification' });
    this.segKm = h('div.segment.bloc', { role: 'radiogroup', 'aria-label': 'Km par année' });
    this.inKmAutre = h('input.lbm-km-autre#lbm-km-autre', { type: 'text', inputmode: 'numeric', value: this.o.kmAutre, placeholder: '24 001 à 30 000', autocomplete: 'off', 'aria-label': 'Km par année (24 001 à 30 000)' });
    this.caseIx = h('input#lbm-ixnbv', { type: 'checkbox' });
    this.elIx = h('label', { for: 'lbm-ixnbv', hidden: true }, [this.caseIx, h('span', { text: 'iX hors bail acheté de BMW FS à la valeur comptable nette (programme iX amélioré)' })]);
    this.el.appendChild(h('div.carte', { style: { marginBottom: '14px' } }, [
      h('div.carte-entete', [h('h2', '2. La location')]),
      h('div.carte-corps', [
        h('div.lbm-grille', [
          h('div.champ', [h('label', { text: 'Certification' }), this.segCpo]),
          h('div.champ', { style: { gridColumn: 'span 2' } }, [h('label', { text: 'Km par année' }), h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } }, [this.segKm, this.inKmAutre])]),
          champ('lbm-prix', 'Prix de vente', this.inPrix, 'Avant taxes.'),
          champ('lbm-frais', 'Frais d\'administration', this.inFrais, 'Ajoutés au coût capitalisé.'),
          champ('lbm-comptant', 'Comptant (avant taxes)', this.inComptant, 'Réduit le coût capitalisé.')
        ]),
        h('div.lbm-cases', [this.elIx])
      ])
    ]));
    this.dessinerSegments();

    /* 3. Le résultat */
    this.elKpis = h('div.kpis', { hidden: true });
    this.elResultat = h('div');
    this.el.appendChild(this.elKpis);
    this.el.appendChild(this.elResultat);
    this.elResultat.appendChild(h('div.carte', [h('div.lbm-vide', { text: 'Entrez le NIV et le km : le paiement de chaque durée s\'affiche ici.' })]));

    /* Les saisies : chaque changement refait le calcul sur place (aucune lecture au serveur). */
    var recalc = A.debounce(function () { self.lireSaisies(); self.rendreResultat(); }, 180);
    [this.inKm, this.inPrix, this.inFrais, this.inComptant, this.inKmAutre].forEach(function (i) { i.addEventListener('input', recalc); });
    this.inKmAutre.addEventListener('focus', function () { if (self.o.kmAn === 18000 || self.o.kmAn === 24000) { self.o.kmAutre = self.inKmAutre.value; } });
    this.caseIx.addEventListener('change', function () { self.o.ixNbv = self.caseIx.checked; self.rendreResultat(); });
    this.inFrais.addEventListener('change', function () { try { A.memo.ecrire('locbmw_frais', self.inFrais.value.trim()); } catch (e) {} });
    this.inVin.addEventListener('input', function () {
      var v = self.inVin.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (v !== self.inVin.value) self.inVin.value = v;
      if (v.length === 17 && v !== self.vinCourant) { self.cacherSugg(); self.lireVin(false); }
      else if (v.length < 17) suggerer();
    });
    var suggerer = A.debounce(function () { self.suggerer(false); }, 200);
    this.inVin.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); self.trouverSaisie(); }
      else if (e.key === 'Escape') self.cacherSugg();
      else if (e.key === 'ArrowDown' && !self.elSugg.hidden) { var b = self.elSugg.querySelector('button'); if (b) { e.preventDefault(); b.focus(); } }
    });
    this.elSugg.addEventListener('keydown', function (e) {
      var l = [].slice.call(self.elSugg.querySelectorAll('button')), i = l.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' && i < l.length - 1) { e.preventDefault(); l[i + 1].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (i > 0) l[i - 1].focus(); else self.inVin.focus(); }
      else if (e.key === 'Escape') { self.cacherSugg(); self.inVin.focus(); }
    });
    /* Un clic ailleurs ferme la liste des véhicules. */
    document.addEventListener('click', function (e) { if (self.detruit || self.elSugg.hidden) return; if (self.elSugg.contains(e.target) || e.target === self.inVin || self.btnTrouver.contains(e.target)) return; self.cacherSugg(); });
    /* Nos registres (É.-U., Canada, Detail) : pour chercher par # stock ou par la fin du NIV. */
    this.invListe = null;
    this.invPret = (A.inventaire && A.inventaire.tout ? A.inventaire.tout() : Promise.resolve([])).then(function (l) { self.invListe = l || []; return self.invListe; }, function () { self.invListe = []; return []; });
    /* BMW FS : les véhicules à vendre sur la place de marché de BMW Financial Services (fiches Manheim « Disponible »). */
    this.fs = null; this.fsChoisi = null; this.fsVeh = null; this.fsMarche = null;
    this.fsPret = (A.manheim && A.manheim.charger ? A.manheim.charger(false) : Promise.resolve(null)).then(function (d) {
      self.fs = bmwfsDisponibles((d && d.fiches) || []); self.fsEtat = (d && d.etat && d.etat.dispos) || null; return self.fs;
    }, function (e) { self.fs = { liste: [], lu: '' }; self.fsErreur = A.erreurTexte ? A.erreurTexte(e) : String(e && e.message || e); return self.fs; });
    this.inVin.addEventListener('change', function () { var v = self.inVin.value.trim().toUpperCase(); if (v.length === 17 && v !== self.vinCourant) self.lireVin(false); });

    charger(false).then(function (rep) {
      if (self.detruit) return;
      self.rep = rep; self.rendreProgramme();
      if (self.inVin.value.trim().length === 17) self.lireVin(false); else { self.rendreResultat(); if (self.inVin.value.trim()) self.trouverSaisie(); }
    }, function (e) {
      if (self.detruit) return;
      A.vider(self.elAvisProg);
      self.elAvisProg.appendChild(h('div.lbm-avis.rouge', { text: A.erreurTexte(e) }));
      A.vider(self.elResultat);
    });
  }
  VueLocation.prototype.demonter = function () { this.detruit = true; };
  VueLocation.prototype.naviguer = function (ctx) {
    var p = (ctx && ctx.params) || {};
    if (p.stock && !p.vin) { this.nouveauVehicule(''); this.inVin.value = String(p.stock).toUpperCase(); if (p.km) this.inKm.value = p.km; if (p.prix) this.inPrix.value = p.prix; this.lireSaisies(); if (this.rep) this.trouverSaisie(); return; }
    if (p.vin && String(p.vin).toUpperCase() !== this.vinCourant) {
      this.nouveauVehicule(p.vin);
      this.inVin.value = String(p.vin).toUpperCase();
      if (p.km) this.inKm.value = p.km;
      if (p.prix) this.inPrix.value = p.prix;
      this.lireSaisies();
      if (this.rep) this.lireVin(false);
    }
  };
  VueLocation.prototype.prog = function () { return this.rep && this.rep.programme; };
  VueLocation.prototype.dessinerSegments = function () {
    var self = this;
    A.vider(this.segCpo);
    [[true, 'Certifié (CPO)'], [false, 'Non certifié']].forEach(function (c) {
      var actif = self.o.cpo === c[0];
      self.segCpo.appendChild(h('button' + (actif ? '.actif' : ''), { type: 'button', role: 'radio', 'aria-checked': actif ? 'true' : 'false', text: c[1], onclick: function () {
        self.o.cpo = c[0]; try { A.memo.ecrire('locbmw_cpo', c[0] ? '1' : '0'); } catch (e) {} self.dessinerSegments(); self.rendreResultat();
      } }));
    });
    A.vider(this.segKm);
    var autre = [18000, 24000].indexOf(this.o.kmAn) < 0;
    [[18000, '18 000'], [24000, '24 000'], ['autre', 'Plus élevé']].forEach(function (c) {
      var actif = c[0] === 'autre' ? autre : self.o.kmAn === c[0];
      self.segKm.appendChild(h('button' + (actif ? '.actif' : ''), { type: 'button', role: 'radio', 'aria-checked': actif ? 'true' : 'false', text: c[1], onclick: function () {
        if (c[0] === 'autre') {
          var n = nombre(self.inKmAutre.value);
          self.o.kmAn = (n && n >= 24001 && n <= 30000) ? Math.round(n) : 30000;
          if (!n || n < 24001 || n > 30000) self.inKmAutre.value = '30 000';
          self.inKmAutre.hidden = false; setTimeout(function () { self.inKmAutre.focus(); self.inKmAutre.select(); }, 0);
        } else { self.o.kmAn = c[0]; self.inKmAutre.hidden = true; }
        try { A.memo.ecrire('locbmw_kman', self.o.kmAn); } catch (e) {}
        self.dessinerSegments(); self.rendreResultat();
      } }));
    });
    this.inKmAutre.hidden = !autre;
    if (autre && !this.inKmAutre.value) this.inKmAutre.value = A.fmtNombre(this.o.kmAn);
  };
  VueLocation.prototype.lireSaisies = function () {
    this.o.km = this.inKm.value; this.o.prix = this.inPrix.value; this.o.frais = this.inFrais.value; this.o.comptant = this.inComptant.value;
    if ([18000, 24000].indexOf(this.o.kmAn) < 0) {
      var n = nombre(this.inKmAutre.value);
      this.kmAutreHors = !(n && n >= 24001 && n <= 30000);
      this.o.kmAn = this.kmAutreHors ? 30000 : Math.round(n);
      try { A.memo.ecrire('locbmw_kman', this.o.kmAn); } catch (e) {}
    } else this.kmAutreHors = false;
  };
  VueLocation.prototype.rendreProgramme = function () {
    var prog = this.prog(); if (!prog) return;
    var b = prog.bulletin || {}, v = validite(prog, this.rep.aujourdhui || ajd());
    this.validite = v;
    this.elSous.textContent = (prog.nom || 'Location BMW d\'occasion') + ' — bulletin ' + (b.no || '') + ' et grille des résiduels de BMW FS.';
    A.vider(this.elAvisProg);
    if (!v.ok) this.elAvisProg.appendChild(h('div.lbm-avis.rouge', { text: v.texte }));
    else if (v.etat === 'apresBulletin') this.elAvisProg.appendChild(h('div.lbm-avis.ambre', { text: v.texte }));
  };
  VueLocation.prototype.effacer = function () {
    this.inVin.value = ''; this.inKm.value = ''; this.inPrix.value = ''; this.inComptant.value = '';
    this.vinCourant = ''; this.invChoisi = null; this.fsChoisi = null; this.fsVeh = null; this.fsMarche = null; this.cacherSugg(); this.dec = null; this.trouve = null; this.ligne = null; this.manuel = false; this.forcerManuel = false; this.choixManuel = false; this.caseIx.checked = false; this.o.ixNbv = false;
    this.lireSaisies(); A.vider(this.elVeh); this.elKmAide.textContent = 'Le km au compteur aujourd\'hui.'; this.rendreResultat();
    try { this.inVin.focus(); } catch (e) {}
  };

  /* -- Chercher par # stock ou NIV dans nos registres -- */
  VueLocation.prototype.cacherSugg = function () { A.vider(this.elSugg); this.elSugg.hidden = true; this.entreeQ = ''; };
  VueLocation.prototype.ligneSugg = function (v) {
    var self = this, vin = String(v.vin || '').toUpperCase();
    if (v._bmwfs) {
      var ff = v._bmwfs;
      return h('button', { type: 'button', role: 'option', title: vin, onclick: function () { self.choisirFs(ff); } }, [
        h('span.st.fs', { text: 'BMW FS' }),
        h('span.mod', { text: v.modele || '—' }),
        h('span.vin', { text: '…' + vin.slice(-8) }),
        h('span.etat', { text: [kmTxt(ff.km), ff.prix ? argent(ff.prix) : '', [ff.ville, ff.province].filter(Boolean).join(', ')].filter(Boolean).join(' · ') })
      ]);
    }
    var st = A.statut ? A.statut(v.statut, v._feuille) : { libelle: v.statut || '' };
    return h('button', { type: 'button', role: 'option', title: vin, onclick: function () { self.choisirInv(v); } }, [
      h('span.st', { text: v.stock ? '# ' + v.stock : 'sans # stock' }),
      h('span.mod', { text: v.modele || '—' }),
      h('span.vin', { text: '…' + vin.slice(-8) }),
      h('span.etat', { text: [st.libelle, A.inventaire && A.inventaire.nomFeuille ? A.inventaire.nomFeuille(v._feuille) : v._feuille, v.compagnie].filter(Boolean).join(' · ') })
    ]);
  };
  /** Montre les véhicules qui répondent (dès 3 caractères). entree = l'employé a fait Entrée ou « Trouver ». */
  VueLocation.prototype.suggerer = function (entree) {
    var self = this, q = this.inVin.value.trim();
    if (q.length < 3 || q.length >= 17) { this.cacherSugg(); return; }
    if (!this.invListe || !this.fs) { Promise.all([this.invPret, this.fsPret]).then(function () { if (!self.detruit && self.inVin.value.trim() === q) self.suggerer(entree); }); return; }
    var l = chercherInventaire(this.listeRech(), q, 8);
    if (entree && l.length === 1) { this.choisirInv(l[0]); return; }
    if (entree && l.length && cleRech(l[0].stock) === cleRech(q) && !(l[1] && cleRech(l[1].stock) === cleRech(q))) { this.choisirInv(l[0]); return; }
    if (entree) this.entreeQ = q;
    else if (this.entreeQ === q) return;   /* la liste (ou « aucun véhicule ») d'un Entrée reste : la frappe en attente ne l'efface pas */
    A.vider(this.elSugg);
    if (!l.length) { if (entree) this.elSugg.appendChild(h('div.rien', { text: 'Aucun véhicule de nos registres ni de BMW FS avec « ' + q + ' ». Tapez le NIV complet (17 caractères).' })); else { this.cacherSugg(); return; } }
    l.forEach(function (v) { self.elSugg.appendChild(self.ligneSugg(v)); });
    this.elSugg.hidden = false;
  };
  /* Nos registres, puis les véhicules à vendre sur BMW FS (une même BMW chez nous passe en premier). */
  VueLocation.prototype.listeRech = function () {
    var l = (this.invListe || []).slice();
    ((this.fs && this.fs.liste) || []).forEach(function (x) { l.push(fsCommeInv(x)); });
    return l;
  };
  VueLocation.prototype.trouverSaisie = function () {
    var v = this.inVin.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    this.inVin.value = v;
    if (v.length === 17) { this.cacherSugg(); this.lireVin(true); return; }
    if (v.length < 3) { A.toast('Tapez le NIV, les 6 derniers du NIV ou le # stock.', 'attention'); return; }
    this.suggerer(true);
  };
  /* -- « Nos BMW » et « BMW FS » : une liste à parcourir et filtrer ; un clic met le véhicule dans le calculateur --
     mode 'stock' = les BMW de nos registres (Detail, Canada, É.-U.) ; mode 'fs' = les véhicules à vendre sur la place de
     marché de BMW Financial Services (Manheim › Disponible, lus par le favori « Automax ← Manheim »). */
  VueLocation.prototype.ouvrirStock = function () { this.ouvrirListe('stock'); };
  VueLocation.prototype.ouvrirFs = function () { this.ouvrirListe('fs'); };
  VueLocation.prototype.ouvrirListe = function (mode) {
    var self = this, fs = mode === 'fs';
    this.cacherSugg();
    var f = { q: '', feuille: '', serie: '', seulsProgramme: true, anciens: false };
    var inQ = h('input.saisie', { type: 'search', placeholder: fs ? 'Modèle, série, année, ville ou 6 derniers du NIV' : 'Modèle, série, année, # stock ou 6 derniers du NIV', autocomplete: 'off', spellcheck: 'false', 'aria-label': fs ? 'Chercher dans les véhicules de BMW FS' : 'Chercher dans nos BMW' });
    var elFeuilles = h('div.lbm-stock-pastilles', { role: 'group', 'aria-label': 'Registre', hidden: fs });
    var elSeries = h('div.lbm-stock-pastilles', { role: 'group', 'aria-label': 'Série' });
    var caseProg = h('input', { type: 'checkbox', checked: true });
    var caseAnciens = h('input', { type: 'checkbox' });
    var elAnciens = h('label.lbm-stock-case', { hidden: true }, [caseAnciens, h('span')]);
    var elCompte = h('span.lbm-stock-compte');
    var elInfo = h('div', { hidden: !fs });
    var elListe = h('div.lbm-stock-liste', { role: 'listbox', 'aria-label': fs ? 'Véhicules à vendre sur BMW FS' : 'Nos BMW en stock' });
    var corps = h('div', [
      elInfo,
      h('div.lbm-stock-outils', [inQ, elFeuilles, elSeries, h('div', { style: { display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' } }, [h('label.lbm-stock-case', [caseProg, h('span', { text: 'Seulement les années et séries du programme' })]), elAnciens, elCompte])]),
      elListe
    ]);
    var m = A.modale({ titre: fs ? 'À vendre sur BMW FS' : 'Nos BMW en stock', corps: corps, large: true, classe: 'lbm-stock', proteger: false, boutons: [{ texte: 'Fermer' }] });
    elListe.appendChild(A.chargeur(fs ? 'Lecture des véhicules de BMW FS' : 'Lecture de nos registres', { compact: true }));
    var tous = null;
    var nomF = function (fe) { return A.inventaire && A.inventaire.nomFeuille ? A.inventaire.nomFeuille(fe) : fe; };
    var champs = function (x) {
      if (fs) return [texteFs(x.f), x.vin, x.f.ville, x.f.province, x.f.couleur, x.serie ? nomSerie(x.serie) : '', x.annee];
      return [x.v.modele, x.v.stock, x.vin, x.v.compagnie, nomF(x.v._feuille), x.serie ? nomSerie(x.serie) : '', x.annee];
    };
    var garde = function (x, sauf) {
      if (!fs && sauf !== 'feuille' && f.feuille && x.v._feuille !== f.feuille) return false;
      if (fs && sauf !== 'anciens' && !f.anciens && !x.actuel) return false;
      if (sauf !== 'serie' && f.serie && (x.serie || '?') !== f.serie) return false;
      if (sauf !== 'prog' && f.seulsProgramme && !x.adm.ok) return false;
      if (f.q && !(A.correspond ? A.correspond(champs(x), f.q) : champs(x).join(' ').toUpperCase().indexOf(f.q.toUpperCase()) >= 0)) return false;
      return true;
    };
    var pastilles = function (el, cle, choix) {
      A.vider(el);
      choix.forEach(function (c) {
        var n = tous.filter(function (x) { return garde(x, cle) && (!c.val || (cle === 'feuille' ? x.v._feuille : (x.serie || '?')) === c.val); }).length;
        if (c.val && !n && f[cle] !== c.val) return;
        el.appendChild(h('button' + (f[cle] === c.val ? '.actif' : ''), { type: 'button', 'aria-pressed': f[cle] === c.val ? 'true' : 'false', onclick: function () { f[cle] = c.val; dessiner(); } }, [document.createTextNode(c.lib), h('span.n', { text: String(n) })]));
      });
    };
    var ligne = function (x) {
      if (fs) {
        var ff = x.f, puces = [];
        if (!x.adm.ok) puces.push(h('span.hors-puce', { text: 'Hors programme · ' + x.adm.raison }));
        if (!x.actuel) puces.push(h('span.hors-puce', { text: 'Plus vu sur BMW FS depuis le ' + (quandFr(ff.luLe, true) || '?') }));
        return h('button' + (x.adm.ok && x.actuel ? '' : '.hors'), { type: 'button', role: 'option', title: x.vin, onclick: function () { m.fermer(); self.choisirFs(ff); } }, [
          h('span.st.fs', { text: ff.prix ? argent(ff.prix) : 'BMW FS' }),
          h('span.mod', { text: texteFs(ff) || '—' }),
          h('span.vin', { text: '…' + x.vin.slice(-8) })
        ].concat(puces, [
          h('span.etat', { text: [kmTxt(ff.km), typeof ff.cote === 'number' ? 'CR ' + String(ff.cote.toFixed(1)).replace('.', ',') : '', [ff.ville, ff.province].filter(Boolean).join(', ')].filter(Boolean).join(' · ') })
        ]));
      }
      var v = x.v, st = A.statut ? A.statut(v.statut, v._feuille) : { libelle: v.statut || '' };
      var jours = A.joursDepuis && v.dateAjout ? A.joursDepuis(v.dateAjout) : null;
      return h('button' + (x.adm.ok ? '' : '.hors'), { type: 'button', role: 'option', title: x.vin, onclick: function () { m.fermer(); self.choisirInv(v); } }, [
        h('span.st', { text: v.stock ? '# ' + v.stock : 'sans # stock' }),
        h('span.mod', { text: v.modele || '—' }),
        h('span.vin', { text: '…' + x.vin.slice(-8) }),
        x.adm.ok ? null : h('span.hors-puce', { text: 'Hors programme · ' + x.adm.raison }),
        h('span.etat', { text: [st.libelle, nomF(v._feuille), v.compagnie, (jours !== null && !isNaN(jours)) ? jours + ' j' : ''].filter(Boolean).join(' · ') })
      ]);
    };
    var dessiner = function () {
      if (!tous) return;
      if (!fs) pastilles(elFeuilles, 'feuille', [{ val: '', lib: 'Tous les registres' }].concat(['DETAIL', 'CAN', 'US'].map(function (fe) { return { val: fe, lib: nomF(fe) }; })));
      var vues = {}; tous.forEach(function (x) { vues[x.serie || '?'] = 1; });
      var series = [{ val: '', lib: 'Toutes les séries' }].concat(Object.keys(vues).sort(function (a, b) { return (a === '?') - (b === '?') || nomSerie(a).localeCompare(nomSerie(b), 'fr', { numeric: true }); }).map(function (s) { return { val: s, lib: s === '?' ? 'Autre' : nomSerie(s) }; }));
      pastilles(elSeries, 'serie', series);
      if (fs) {
        var nAnciens = tous.filter(function (x) { return !x.actuel && garde(x, 'anciens'); }).length;
        elAnciens.hidden = !nAnciens && !f.anciens;
        elAnciens.lastChild.textContent = 'Montrer aussi ceux qui ne sont plus vus sur BMW FS (' + nAnciens + ')';
      }
      var l = tous.filter(function (x) { return garde(x); });
      var hors = tous.filter(function (x) { return garde(x, 'prog') && !x.adm.ok; }).length;
      elCompte.textContent = l.length + (fs ? ' véhicule' + (l.length > 1 ? 's' : '') : ' BMW') + (f.seulsProgramme && hors ? ' · ' + hors + ' hors programme caché' + (fs ? '' : 'e') + (hors > 1 ? 's' : '') : '');
      A.vider(elListe);
      if (!l.length) { elListe.appendChild(h('div.rien', { text: tous.length ? (fs ? 'Aucun véhicule ne répond à ces filtres.' : 'Aucune BMW ne répond à ces filtres.') : (fs ? 'Aucun véhicule de BMW FS : cliquez le favori « Automax ← Manheim » dans Manheim › Disponible (Outils › Opportunités d\'achat › Sources).' : 'Aucune BMW en stock dans nos registres.') })); return; }
      l.forEach(function (x) { elListe.appendChild(ligne(x)); });
    };
    inQ.addEventListener('input', A.debounce(function () { f.q = inQ.value.trim(); dessiner(); }, 150));
    inQ.addEventListener('keydown', function (e) { if (e.key === 'Enter') { var b = elListe.querySelector('button'); if (b && elListe.querySelectorAll('button').length === 1) { e.preventDefault(); b.click(); } } else if (e.key === 'ArrowDown') { var p = elListe.querySelector('button'); if (p) { e.preventDefault(); p.focus(); } } });
    elListe.addEventListener('keydown', function (e) {
      var l = [].slice.call(elListe.querySelectorAll('button')), i = l.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' && i < l.length - 1) { e.preventDefault(); l[i + 1].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (i > 0) l[i - 1].focus(); else inQ.focus(); }
    });
    caseProg.addEventListener('change', function () { f.seulsProgramme = caseProg.checked; dessiner(); });
    caseAnciens.addEventListener('change', function () { f.anciens = caseAnciens.checked; dessiner(); });
    var prog = this.prog();
    if (fs) {
      this.fsPret.then(function () {
        var lu = self.fs && self.fs.lu, age = lu ? (Date.now() - Date.parse(lu)) / 86400000 : null;
        A.vider(elInfo);
        if (self.fsErreur) elInfo.appendChild(h('div.lbm-avis.rouge', { style: { marginTop: 0, marginBottom: '10px' }, text: 'Lecture des fiches Manheim impossible : ' + self.fsErreur }));
        else if (!lu) elInfo.appendChild(h('div.lbm-avis.ambre', { style: { marginTop: 0, marginBottom: '10px' }, text: 'Les véhicules de BMW FS n\'ont pas encore été lus : dans Manheim (marketplace.manheim.ca › Disponible), cliquez le favori « Automax ← Manheim ».' }));
        else elInfo.appendChild(h('div.lbm-avis.' + (age > 3 ? 'ambre' : 'bleu'), { style: { marginTop: 0, marginBottom: '10px' }, text: 'Lus sur BMW FS (Manheim › Disponible) le ' + quandFr(lu) + ' par le favori « Automax ← Manheim »' + (age > 3 ? ' : il y a ' + Math.floor(age) + ' jours — recliquez le favori dans Manheim pour la liste du jour.' : '.') + ' Le prix est le prix demandé par BMW FS (ce que la concession paierait), pas un prix de vente.' }));
        tous = ((self.fs && self.fs.liste) || []).map(function (x) { x.adm = admissibleFs(prog, x); return x; });
        tous.sort(function (a, b) { return (b.actuel - a.actuel) || (b.adm.ok - a.adm.ok) || (b.bmw - a.bmw) || texteFs(a.f).replace(/^\d+ /, '').localeCompare(texteFs(b.f).replace(/^\d+ /, ''), 'fr', { numeric: true }) || ((b.annee || 0) - (a.annee || 0)); });
        if (!tous.some(function (x) { return x.adm.ok && x.actuel; })) { f.seulsProgramme = false; caseProg.checked = false; }
        if (!tous.some(function (x) { return x.actuel; })) { f.anciens = true; caseAnciens.checked = true; }
        dessiner();
      });
      return;
    }
    this.invPret.then(function () {
      tous = bmwEnStock(self.invListe).map(function (x) { x.adm = admissible(prog, x); return x; });
      tous.sort(function (a, b) { return (b.adm.ok - a.adm.ok) || (RANG_FEUILLE[a.v._feuille] - RANG_FEUILLE[b.v._feuille]) || String(a.v.modele || '').localeCompare(String(b.v.modele || ''), 'fr', { numeric: true }) || ((b.annee || 0) - (a.annee || 0)); });
      if (!tous.some(function (x) { return x.adm.ok; })) { f.seulsProgramme = false; caseProg.checked = false; }
      dessiner();
    });
  };
  VueLocation.prototype.choisirInv = function (v) {
    if (v && v._bmwfs) { this.choisirFs(v._bmwfs); return; }
    this.cacherSugg();
    this.nouveauVehicule(v.vin);
    this.inVin.value = String(v.vin || '').toUpperCase();
    this.invChoisi = v; this.fsChoisi = null;
    this.vinCourant = '';
    this.lireVin(false);
  };
  /* Un véhicule de BMW FS : son NIV et son km (lu sur BMW FS) ; le prix de vente reste à entrer. */
  VueLocation.prototype.choisirFs = function (ff) {
    this.cacherSugg();
    this.nouveauVehicule(ff.vin);
    this.inVin.value = String(ff.vin || '').toUpperCase();
    this.fsChoisi = ff; this.invChoisi = null;
    if (!this.inKm.value.trim() && typeof ff.km === 'number' && ff.km > 0) { this.inKm.value = A.fmtNombre(Math.round(ff.km)); this.elKmAide.textContent = 'Km lu sur BMW FS (Manheim) — vérifiez le compteur.'; }
    this.vinCourant = '';
    this.lireVin(false);
  };
  /* Un autre véhicule que celui à l'écran : le km et le prix de l'ancien ne le suivent pas. */
  VueLocation.prototype.nouveauVehicule = function (vin) {
    if (String(vin || '').toUpperCase() === this.vinCourant) return;
    this.inKm.value = ''; this.inPrix.value = ''; this.prixSource = '';
    this.elKmAide.textContent = 'Le km au compteur aujourd\'hui.';
    this.lireSaisies();
  };

  /* -- Le NIV : décoder, retrouver la version, compléter le km et le prix si le véhicule est à notre inventaire -- */
  VueLocation.prototype.lireVin = function (manuel) {
    var self = this, vin = this.inVin.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    this.inVin.value = vin;
    if (!this.rep) return;
    if (vin.length !== 17) { if (manuel) A.toast('Le NIV a 17 caractères.', 'attention'); return; }
    this.vinCourant = vin; this.dec = null; this.trouve = null; this.ligne = null; this.manuel = false; this.forcerManuel = false; this.choixManuel = false;
    A.vider(this.elVeh);
    this.elVeh.appendChild(A.chargeur('Décodage du NIV', { compact: true }));
    var cleOk = A.niv ? A.niv.cleValide(vin) : true;
    var inv = (this.invChoisi && String(this.invChoisi.vin || '').toUpperCase() === vin) ? this.invChoisi : (A.inventaire && A.inventaire.parVin ? A.inventaire.parVin(vin) : null);
    var fiche = A.ficheDe ? A.ficheDe(vin).catch(function () { return null; }) : Promise.resolve(null);
    var fsVeh = (this.fsChoisi && String(this.fsChoisi.vin || '').toUpperCase() === vin) ? this.fsChoisi : null;
    this.fsVeh = null; this.fsMarche = null;
    Promise.all([decoder(vin), fiche, this.fsPret.catch(function () { return null; })]).then(function (res) {
      if (self.detruit || self.vinCourant !== vin) return;
      var dec = res[0], f = res[1] || {};
      /* À vendre sur BMW FS ? (choisi dans la liste, ou un NIV tapé qui y est) */
      if (!fsVeh && self.fs) self.fs.liste.forEach(function (x) { if (x.vin === vin) fsVeh = x.f; });
      self.fsVeh = fsVeh;
      if (fsVeh) {
        if (!self.inKm.value.trim() && typeof fsVeh.km === 'number' && fsVeh.km > 0) { self.inKm.value = A.fmtNombre(Math.round(fsVeh.km)); self.elKmAide.textContent = 'Km lu sur BMW FS (Manheim) — vérifiez le compteur.'; }
        /* Le décodeur muet : l'année, le modèle et la version de la fiche BMW FS. */
        if (!dec && fsVeh.marque) dec = { annee: fsVeh.annee, marque: fsVeh.marque, modele: fsVeh.modele, version: fsVeh.version, source: 'BMW FS (Manheim)' };
        self.chargerMarcheFs(vin);
      }
      self.dec = dec; self.cleOk = cleOk; self.inv = inv;
      /* Le km de la fiche d'achat, et le prix affiché (D2C) quand on l'a déjà en mémoire. */
      var kmFiche = A.kmValide ? A.kmValide(f['f-km']) : null;
      if (!self.inKm.value.trim() && kmFiche) { self.inKm.value = A.fmtNombre(kmFiche); self.elKmAide.textContent = 'Km de la fiche d\'achat — vérifiez le compteur.'; }
      if (!self.inPrix.value.trim()) {
        var m = A.occMarche && A.occMarche.enCache && A.occMarche.enCache(), mv = m && (m.vehicules || []).filter(function (x) { return String(x.vin || '').toUpperCase() === vin; })[0];
        if (mv && mv.notre && mv.notre.prix) { self.inPrix.value = A.fmtNombre(mv.notre.prix); self.prixSource = 'prix affiché sur le site de la concession'; }
      }
      self.lireSaisies();
      /* La version écrite par BMW FS (« iX xDrive40 », « X5 xDrive40i ») aide à trouver la bonne ligne de la grille. */
      var decT = (dec && fsVeh && fsVeh.version && dec.source !== 'BMW FS (Manheim)') ? Object.assign({}, dec, { version: [dec.version, fsVeh.version].filter(Boolean).join(' ') }) : dec;
      self.trouve = decT ? trouver(self.prog(), decT) : null;
      self.ligne = self.trouve && self.trouve.choix;
      self.rendreVehicule(); self.rendreResultat();
    });
  };
  /* Le marché au détail estimé de ce véhicule (Outils › Opportunités d'achat, calcul de BMW Sherbrooke), pour proposer un prix
     de vente. Seulement pour qui voit les Opportunités (le serveur refuse les autres). */
  VueLocation.prototype.chargerMarcheFs = function (vin) {
    var self = this;
    if (!A.opportunites || !(A.voitOnglet ? A.voitOnglet('outils', 'opportunites') : true)) return;
    A.opportunites.charger().then(function (d) {
      if (self.detruit || self.vinCourant !== vin || !d || !Array.isArray(d.occasions)) return;
      var o = d.occasions.filter(function (x) { return String(x.vin || '').toUpperCase() === vin; })[0];
      var k = o && ((o.par && (o.par.BMW || o.par[o.dest])) || o.calc);
      if (!k || typeof k.refAjuste !== 'number' || !(k.refAjuste > 0)) return;
      self.fsMarche = { ref: k.refAjuste, plafonne: !!k.plafonne, n: o.refN || null };
      self.rendreVehicule();
    }, function () {});
  };
  VueLocation.prototype.blocFs = function () {
    var self = this, ff = this.fsVeh, vu = this.fs && this.fs.liste.filter(function (x) { return x.vin === String(ff.vin || '').toUpperCase(); })[0];
    var plusVu = vu && !vu.actuel;
    var infos = [ff.prix ? 'prix demandé ' + argent(ff.prix) : '', typeof ff.cote === 'number' ? 'CR ' + String(ff.cote.toFixed(1)).replace('.', ',') : '', kmTxt(ff.km), [ff.ville, ff.province].filter(Boolean).join(', '), ff.luLe ? 'lu le ' + quandFr(ff.luLe, true) : ''].filter(Boolean).join(' · ');
    var actions = [];
    if (A.manheim && A.manheim.ouvrir) actions.push(h('button.btn.petit', { type: 'button', text: 'Photos et état', onclick: function () { A.manheim.ouvrir(ff.vin); } }));
    if (this.fsMarche) actions.push(h('button.btn.petit', { type: 'button', title: 'Prix médian du modèle-année au Canada, ajusté au km' + (this.fsMarche.plafonne ? ', plafonné au gros OpenLane + 15 %' : '') + ' (Outils › Opportunités d\'achat)', text: 'Marché au détail estimé ' + argent(this.fsMarche.ref) + ' — prendre ce prix', onclick: function () { self.inPrix.value = A.fmtNombre(Math.round(self.fsMarche.ref)); self.prixSource = 'marché au détail estimé'; self.lireSaisies(); self.rendreResultat(); } }));
    return h('div.lbm-fs', [
      h('div', [h('b', { text: 'À vendre sur BMW FS' }), document.createTextNode(' (Manheim) : ' + infos + '.')]),
      h('div.lbm-veh-sous', { text: 'Le prix demandé est ce que la concession paierait à BMW FS, pas le prix de vente : entrez le prix de vente plus bas.' + (plusVu ? ' Plus vu sur BMW FS au dernier passage du favori : il est peut-être déjà vendu.' : '') }),
      actions.length ? h('div.lbm-fs-actions', actions) : null
    ]);
  };
  VueLocation.prototype.rendreVehicule = function () {
    var self = this, prog = this.prog(), dec = this.dec, t = this.trouve;
    A.vider(this.elVeh);
    var lignes = [];
    if (!this.cleOk) lignes.push(h('div.lbm-avis.ambre', { text: 'Le chiffre de contrôle de ce NIV ne concorde pas : vérifiez-le (une lettre ou un chiffre mal lu).' }));
    if (!dec) lignes.push(h('div.lbm-avis.ambre', { text: 'Le NIV n\'a pas pu être décodé : choisissez l\'année et la version à la main.' }));
    else lignes.push(h('div', [h('div.lbm-veh-titre', { text: [dec.annee, dec.marque, dec.modele, dec.version].filter(Boolean).join(' ') }), h('div.lbm-veh-sous', { text: 'Décodé par ' + (dec.source || 'NHTSA vPIC') + (this.inv ? ' · à notre inventaire : # stock ' + (this.inv.stock || '—') + ' · ' + [A.statut ? A.statut(this.inv.statut, this.inv._feuille).libelle : this.inv.statut, A.inventaire && A.inventaire.nomFeuille ? A.inventaire.nomFeuille(this.inv._feuille) : this.inv._feuille, this.inv.compagnie].filter(Boolean).join(' · ') : '') })]));
    if (this.fsVeh) lignes.push(this.blocFs());
    if (t && t.raison && !t.candidats.length) lignes.push(h('div.lbm-avis.rouge', { text: t.raison }));
    /* La version de la grille : les candidats de la même série et de la même année, sinon toute la grille (à la main). */
    if (!t || !t.candidats.length) this.manuel = true;
    var options = [], liste = (!this.manuel && t && t.candidats.length) ? t.candidats.map(function (c) { return c.ligne; }) : prog.grille.slice().sort(function (a, b) { return (b[0] - a[0]) || a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]); });
    var sel = h('select.saisie#lbm-version', { 'aria-label': 'Version dans la grille de BMW FS', onchange: function () {
      var k = sel.value; self.ligne = null;
      prog.grille.forEach(function (l) { if (l.join('|') === k) self.ligne = l; });
      self.choixManuel = true; self.rendreVehicule(); self.rendreResultat();
    } });
    sel.appendChild(h('option', { value: '', text: '— Choisir la version —' }));
    var groupes = {};
    liste.forEach(function (l) {
      var cle = l[0] + ' · ' + nomSerie(l[1]);
      if (!groupes[cle]) { groupes[cle] = h('optgroup', { label: cle }); options.push(groupes[cle]); }
      groupes[cle].appendChild(h('option', { value: l.join('|'), selected: self.ligne === l, text: libelleLigne(l) }));
    });
    options.forEach(function (o) { sel.appendChild(o); });
    var btnMain = h('button.btn.petit.fantome', { type: 'button', text: this.manuel ? 'Seulement les versions du NIV' : 'Toutes les versions de la grille', onclick: function () { self.manuel = !self.manuel; self.rendreVehicule(); } });
    /* Pas une BMW, ou une année hors de la grille : pas de liste, sauf si l'employé la demande (le décodeur s'est peut-être trompé). */
    if (t && t.horsProgramme && !this.forcerManuel) lignes.push(h('button.btn.petit.fantome', { type: 'button', text: 'Choisir une version à la main quand même', onclick: function () { self.forcerManuel = true; self.rendreVehicule(); } }));
    else lignes.push(h('div.champ', [h('label', { for: 'lbm-version', text: 'Version dans la grille de BMW FS' }), h('div.lbm-version', [sel, (t && t.candidats.length) ? btnMain : null])]));
    if (this.ligne && t && t.candidats.length && !this.choixManuel) {
      if (t.sur) lignes.push(h('div.lbm-avis.vert', { text: 'Version trouvée : ' + libelleLigne(this.ligne) + '.' }));
      else lignes.push(h('div.lbm-avis.ambre', { text: t.raison + ' Proposée : ' + libelleLigne(this.ligne) + '.' }));
    }
    var ix = this.ligne && this.ligne[1] === 'IX';
    this.elIx.hidden = !ix; if (!ix) { this.caseIx.checked = false; this.o.ixNbv = false; }
    lignes.forEach(function (l) { self.elVeh.appendChild(l); });
  };

  /* -- Le résultat -- */
  VueLocation.prototype.calculs = function (kmAn) {
    var prog = this.prog(), l = this.ligne, o = Object.assign({}, this.o, kmAn ? { kmAn: kmAn } : {});
    return prog.termes.map(function (t) { return calculerTerme(prog, l, t, o); });
  };
  VueLocation.prototype.rendreResultat = function () {
    var self = this, prog = this.prog();
    A.vider(this.elResultat); this.elKpis.hidden = true;
    if (!prog) return;
    if (!this.ligne && this.trouve && this.trouve.horsProgramme) { this.elResultat.appendChild(h('div.carte', [h('div.lbm-vide', { text: 'Pas admissible : ' + this.trouve.raison })])); return; }
    if (!this.ligne) { this.elResultat.appendChild(h('div.carte', [h('div.lbm-vide', { text: this.vinCourant ? 'Choisissez la version du véhicule pour voir les paiements.' : 'Entrez le NIV et le km : le paiement de chaque durée s\'affiche ici.' })])); return; }
    var avis = [];
    if (this.validite && !this.validite.ok) avis.push(h('div.lbm-avis.rouge', { text: 'Pas admissible : ' + this.validite.texte }));
    if (!String(this.o.km || '').trim()) avis.push(h('div.lbm-avis.ambre', { text: 'Entrez le km au compteur : le résiduel en dépend (' + Math.round((prog.chargeKm[this.ligne[1]] || 0) * 100) + ' ¢ retranchés par km, ' + nomSerie(this.ligne[1]) + ').' }));
    if (this.kmAutreHors) avis.push(h('div.lbm-avis.ambre', { text: 'Km par année : entre 24 001 et 30 000 — calculé à 30 000 en attendant.' }));
    if (nombre(this.o.prix) === null) avis.push(h('div.lbm-avis.bleu', { text: 'Entrez le prix de vente pour avoir le paiement : le résiduel et le taux sont déjà là.' }));
    if (this.o.cpo && this.ligne[0] <= 2022) avis.push(h('div.lbm-avis.ambre', { text: 'Certifié (CPO) seulement si le véhicule a moins de 5 ans depuis sa mise en service.' }));
    var res = this.calculs(), offerts = res.filter(function (r) { return r.offert; });
    if (!offerts.length) avis.push(h('div.lbm-avis.rouge', { text: 'Pas admissible à la location : ' + res.map(function (r) { return r.terme + ' mois — ' + r.raison.replace(/^Pas offert : /, ''); }).join(' · ') }));
    var avecPaiement = offerts.filter(function (r) { return r.mensualite !== undefined; });
    var meilleur = avecPaiement.slice().sort(function (a, b) { return a.mensualite - b.mensualite; })[0] || null;
    if (avecPaiement.some(function (r) { return r.residuelPlusHaut; })) avis.push(h('div.lbm-avis.ambre', { text: 'Le résiduel dépasse le coût capitalisé pour au moins une durée : vérifiez le prix de vente.' }));
    var aConf = offerts.filter(function (r) { return r.regle && r.regle.aConfirmer; })[0];
    if (aConf) avis.push(h('div.lbm-avis.ambre', { text: aConf.terme + ' mois : ' + aConf.regle.aConfirmer }));
    if (this.ligne[1] === 'X5' && this.o.cpo && prog.creditX5) avis.push(h('div.lbm-avis.bleu', { text: prog.creditX5.texte }));
    avis.forEach(function (a) { self.elResultat.appendChild(a); });

    /* Les chiffres */
    A.vider(this.elKpis);
    if (offerts.length) {
      this.elKpis.hidden = false;
      var kpi = function (lib, val, sous, cls) { return h('div.kpi' + (cls || ''), [h('div.libelle', { text: lib }), h('div.valeur', { text: val }), sous ? h('div.sous', { text: sous }) : null]); };
      var r0 = meilleur || offerts[0];
      this.elKpis.appendChild(kpi('Paiement le plus bas', meilleur ? argent(meilleur.mensualite, 2) : '—', meilleur ? meilleur.terme + ' mois, taxes incluses' : 'entrez le prix de vente'));
      this.elKpis.appendChild(kpi('Taux — ' + r0.terme + ' mois', pct(r0.taux), r0.regle.libelle));
      this.elKpis.appendChild(kpi('Coût capitalisé', r0.capNet === null || r0.capNet === undefined ? '—' : argent(r0.capNet), 'prix + frais − comptant'));
      this.elKpis.appendChild(kpi('Km par année', A.fmtNombre(this.o.kmAn), this.o.kmAn === 24000 ? 'standard' : (this.o.kmAn < 24000 ? 'bas : résiduel plus haut' : 'élevé : résiduel plus bas')));
    }

    /* Le tableau par durée */
    var tbody = h('tbody');
    res.forEach(function (r) {
      if (!r.offert) {
        tbody.appendChild(h('tr.non', [h('td', [h('b', { text: r.terme + ' mois' })]), h('td', { colspan: '6', text: r.raison })]));
        return;
      }
      var tr = h('tr.cliquable' + (meilleur === r ? '.meilleur' : ''), { tabindex: '0', title: 'Voir le détail du calcul', onclick: function () { self.ouvrirDetail(r); }, onkeydown: function (e) { if (e.key === 'Enter') self.ouvrirDetail(r); } }, [
        h('td', [h('b', { text: r.terme + ' mois' }), h('span.doux', { text: kmTxt(r.kmFin) + ' au retour' })]),
        h('td.num', [h('span', { text: argent(r.residuel) }), h('span.doux', { text: r.residuelPct === null ? 'du prix : —' : pct(r.residuelPct, 1) + ' du prix' })]),
        h('td.num', [h('span', { text: pct(r.taux) }), h('span.doux', { text: r.regle.code + (r.regle.aConfirmer ? ' · à confirmer' : '') })]),
        h('td.num.col-avant', { text: r.avantTaxes === undefined ? '—' : argent(r.avantTaxes, 2) }),
        h('td.num.col-taxes', { text: r.taxes === undefined ? '—' : argent(r.taxes, 2) }),
        h('td.num', [h('span.gros', { text: r.mensualite === undefined ? '—' : argent(r.mensualite, 2) })]),
        h('td.num.col-total', [h('span', { text: r.mensualite === undefined ? '—' : argent(r.mensualite * r.terme + (nombre(self.o.comptant) || 0) * (1 + taxePct(prog) / 100)) }), h('span.doux', { text: 'paiements' + ((nombre(self.o.comptant) || 0) > 0 ? ' + comptant' : '') })])
      ]);
      tbody.appendChild(tr);
    });
    this.elResultat.appendChild(h('div.carte', { style: { marginBottom: '14px' } }, [
      h('div.carte-entete', [h('h2', { text: 'Paiements par durée — ' + libelleLigne(this.ligne) }), h('span.badge.' + (this.o.cpo ? 'vert' : 'gris'), { text: this.o.cpo ? 'Certifié' : 'Non certifié' })]),
      h('div.lbm-defile', [h('table.tableau.lbm-tableau', [
        h('thead', [h('tr', [h('th', 'Durée'), h('th.num', 'Résiduel'), h('th.num', 'Taux'), h('th.num.col-avant', 'Avant taxes'), h('th.num.col-taxes', 'TPS + TVQ'), h('th.num', 'Par mois'), h('th.num.col-total', 'Total payé')])]),
        tbody
      ])]),
      h('div.carte-corps', { style: { paddingTop: '8px', paddingBottom: '10px', fontSize: '12.5px', color: 'var(--encre-3)' } }, 'Touchez une durée pour le détail du calcul. Taxes : TPS 5 % et TVQ 9,975 % sur chaque paiement' + ((nombre(this.o.comptant) || 0) > 0 ? ' ; le comptant est aussi taxé à la signature (' + argent((nombre(this.o.comptant) || 0) * taxePct(prog) / 100, 2) + ').' : '.'))
    ]));

    /* Selon le km par année */
    if (offerts.length && nombre(this.o.prix) !== null) {
      var kms = [18000, 24000, 30000];
      if (kms.indexOf(this.o.kmAn) < 0) { kms.push(this.o.kmAn); kms.sort(function (a, b) { return a - b; }); }
      var tb = h('tbody');
      kms.forEach(function (k) {
        var rr = self.calculs(k);
        tb.appendChild(h('tr' + (k === self.o.kmAn ? '.actif' : ''), [h('td', { text: A.fmtNombre(k) })].concat(rr.map(function (r) { return h('td', { text: (r.offert && r.mensualite !== undefined) ? argent(r.mensualite, 2) : '—', title: r.offert ? '' : r.raison }); }))));
      });
      this.elResultat.appendChild(h('div.carte', { style: { marginBottom: '14px' } }, [
        h('div.carte-entete', [h('h2', 'Selon le km par année (par mois, taxes incluses)')]),
        h('div.carte-corps.lbm-defile', [h('table.tableau.lbm-matrice', [h('thead', [h('tr', [h('th', 'Km par année')].concat(prog.termes.map(function (t) { return h('th', { text: t + ' mois' }); })))]), tb])])
      ]));
    }
  };

  VueLocation.prototype.ouvrirDetail = function (r) {
    var prog = this.prog(), l = this.ligne, montants = this.rep && this.rep.montants;
    var ligne = function (lib, val, cls) { return h('tr' + (cls || ''), [h('td', { text: lib }), h('td.num', { text: val })]); };
    var sec = function (t) { return h('tr.sec', [h('td', { colspan: '2', text: t })]); };
    var corps = h('div.lbm-detail', [h('table', [
      sec('Le résiduel'),
      ligne('Résiduel de la grille (' + r.terme + ' mois, 0 km)', argent(r.base)),
      ligne('Km au compteur : ' + kmTxt(nombre(this.o.km) || 0) + ' × ' + argent(r.charge, 2), argent(r.ajOdometre, 2)),
      ligne('Km par année : ' + A.fmtNombre(this.o.kmAn) + ' (standard 24 000) × ' + r.terme + ' mois', argent(r.ajKmAn, 2)),
      ligne('Résiduel du contrat', argent(r.residuel, 2), '.total'),
      sec('Le coût capitalisé'),
      ligne('Prix de vente', argent(nombre(this.o.prix), 2)),
      ligne('Frais d\'administration', argent(nombre(this.o.frais) || 0, 2)),
      ligne('Comptant', argent(-(nombre(this.o.comptant) || 0), 2)),
      ligne('Coût capitalisé', argent(r.capNet, 2), '.total'),
      sec('Le paiement'),
      ligne('Amortissement : (coût − résiduel) ÷ ' + r.terme, argent(r.amortissement, 2)),
      ligne('Frais de location : (coût + résiduel) × ' + pct(r.taux) + ' ÷ 2 400', argent(r.loyer, 2)),
      ligne('Paiement avant taxes', argent(r.avantTaxes, 2)),
      ligne('TPS 5 % + TVQ 9,975 %', argent(r.taxes, 2)),
      ligne('Paiement par mois', argent(r.mensualite, 2), '.total')
    ]),
      h('p', { text: 'Taux : ' + r.regle.libelle + ' (' + r.regle.code + ', bulletin ' + ((prog.bulletin || {}).no || '') + ', page ' + r.regle.page + ').' + (r.regle.aConfirmer ? ' ' + r.regle.aConfirmer : '') + (montants && r.regle.commission !== undefined ? ' Commission BMW FS au concessionnaire : ' + pct(r.regle.commission) + '.' : '') }),
      h('p', { text: 'Allocation : ' + kmTxt(r.allocation) + ' pour la durée ; ' + kmTxt(r.kmFin) + ' au retour (' + A.fmtNombre(prog.kmFinMax) + ' au plus). Les montants exacts sont ceux du contrat dans InfoBahn ou Dealertrack.' })
    ]);
    A.modale({ titre: libelleLigne(l) + ' — ' + r.terme + ' mois', corps: corps, proteger: false, boutons: [{ texte: 'Fermer' }] });
  };
  VueLocation.prototype.ouvrirConditions = function () {
    var prog = this.prog();
    if (!prog) { A.toast('Le programme n\'est pas encore chargé.', 'attention'); return; }
    var b = prog.bulletin || {}, montants = this.rep && this.rep.montants;
    var taux = prog.taux.map(function (t) {
      return h('tr', [h('td', { text: t.libelle + (t.aConfirmer ? ' (à confirmer)' : '') }), h('td.num', { text: t.termes[0] === t.termes[1] ? t.termes[0] + ' mois' : t.termes[0] + '–' + t.termes[1] + ' mois' }), h('td.num', { text: pct(t.taux) }), montants ? h('td.num', { text: t.commission === undefined ? '—' : pct(t.commission) }) : null]);
    });
    var corps = h('div.lbm-detail', [
      h('p', { style: { marginTop: 0 }, text: (prog.nom || '') + '. Grille : ' + (prog.grilleSource || '') + '. Bulletin ' + (b.no || '') + ' (' + (b.ref || '') + ') du ' + dateFr(b.date) + ' : demandes du ' + dateFr(b.demandesDu) + ' au ' + dateFr(b.demandesAu) + ', contrat au plus tard le ' + dateFr(b.contratAu) + '. Codes : ' + ((b.codes || {}).cpo || '') + ' ; ' + ((b.codes || {}).nonCpo || '') + '.' }),
      h('table', [h('tbody', [h('tr.sec', [h('td', { text: 'Taux de location' }), h('td', ''), h('td', ''), montants ? h('td', { text: 'Commission' }) : null])].concat(taux))]),
      h('ul.lbm-cond', { style: { marginTop: '12px' } }, prog.conditions.map(function (c) { return h('li', { text: c }); }).concat(prog.creditX5 ? [h('li', { text: prog.creditX5.texte })] : []))
    ]);
    A.modale({ titre: 'Conditions du programme', corps: corps, large: true, proteger: false, boutons: [{ texte: 'Fermer' }] });
  };

  /* 11 nov. : le rôle « Location BMW seulement » (un dirigeant de BMW) — le calculateur est sa seule page (Onglets.gs, app.js,
     LocationBmwSeul.gs) ; pas de bulle d'Einstein AI ni de recherche du haut. */
  function seul() { return role() === 'locationbmw'; }
  function marquerSeul() { try { document.documentElement.classList.toggle('role-locbmw-seul', seul()); } catch (e) {} }
  if (!document.getElementById('css-locbmw-seul')) { var cs = document.createElement('style'); cs.id = 'css-locbmw-seul'; cs.textContent = 'html.role-locbmw-seul #maxai-bulle, html.role-locbmw-seul .maxai-flottant, html.role-locbmw-seul .recherche-globale, html.role-locbmw-seul .cie-globale { display: none !important; }'; document.head.appendChild(cs); }
  marquerSeul(); document.addEventListener('amx:profil', marquerSeul); document.addEventListener('automax:connecte', marquerSeul);
  A.locationBmw = { calcul: Calcul, peutVoir: peutVoir, charger: charger, seul: seul, vider: function () { cache = { rep: null, le: 0, enCours: null }; } };
  A.section('locbmw', {
    titre: 'Location BMW', icone: 'voiture', ordre: 26,
    visible: function () { return peutVoir(); },
    monter: function (conteneur, ctx) { return new VueLocation(conteneur, ctx); }
  });
})();
