/* Équité BMW (21 octobre 2026) — portefeuille BMW Financial Services (InfoBahn) et détection d'équité.

   Maxime : « dans InfoBahn il y a la liste des clients de BMW ; je veux faire un outil de détection de
   l'équité dans les dossiers […] trouver des clients avec équité qui vont payer moins cher mensuellement
   pour une nouvelle auto similaire » → « tu peux procéder ».

   Deux morceaux :
   - Relance › Équité › Importer le portefeuille (AMX.vues.ImportPortefeuille ; était Relance › Équité › Importer le portefeuille) : on y dépose l'export d'InfoBahn (Portfolio ›
     Entire Portfolio › « … » › Export → SearchResults.xls, une table HTML de 35 colonnes) ; la page le lit
     dans le navigateur, montre ce qu'elle a compris et l'envoie au serveur par lots (POST
     constructeurImporter, phase « portefeuille » → Equite.gs, feuille ConstructeurPortefeuille). Une tâche
     planifiée pourra faire l'export et le dépôt elle-même (#eq-fichier, #eq-envoyer, .eq-page[data-etat]).
   - Relance › Équité › Clients (AMX.equite.monter, page assets/relance.js ; était l'onglet Équité des Neufs) : pour chaque client, la valeur
     du véhicule (OpenLane Market guide si lu, sinon l'estimation BMW), le solde (payoff du financement ;
     résiduel + paiements restants pour une location), l'équité, un neuf SIMILAIRE en stock ou en route
     (même série dans l'inventaire IVS-R, PDSF connu), la nouvelle mensualité (prix + frais − équité, taxes du
     Québec sur la différence, financement au taux et au terme choisis) et l'écart avec la mensualité actuelle.
     Cibles = nouvelle mensualité ≤ actuelle + marge. Suivi par client (contacté, rendez-vous, vendu…),
     export Excel, lecture OpenLane à la demande (un client ou les N suivants).

   GM (4 novembre 2026) — Hawkesbury et Ste-Marie : le favori « Automax ← Constructeur », cliqué dans GM Dealer
   Direct (www.gmdealerdirect.ca), envoie les clients de la Financière GM (même phase « portefeuille », source gm).
   Pour eux : solde = rachat de GM, valeur = OpenLane sinon l'évaluation de la reprise de GM, équité GM = « avoir
   net », km estimé de GM, et la nouvelle mensualité vient d'abord des scénarios DealDriver (calculés par GM avec
   les programmes du mois : location / financement, semblable / alternatif, « sur terrain » = notre stock) ; sans
   scénario, le même calcul que BMW avec nos neufs. Rien n'est écrit dans GM Dealer Direct.

   Calculs purs exposés (tests, app) : AMX.equite.lireExport, serieDe, analyser, pmt, famille. */
(function () {
  'use strict';
  var h = AMX.h, I = AMX.icones;
  var DEALER_BMW = '05155BM', NOM_BMW = 'BMW Sherbrooke';
  var TAILLE_LOT = 300;
  var PARAMS_DEFAUT = { taux: 5.99, terme: 60, frais: 2995, marge: 50, taxes: 14.975, comptant: 0, kmAn: 20000 };
  var SUIVIS = { '': '—', contacte: 'Contacté', rdv: 'Rendez-vous', vendu: 'Vendu', pasInteresse: 'Pas intéressé', plusTard: 'Plus tard' };
  var SUIVIS_ORDRE = ['', 'contacte', 'rdv', 'vendu', 'pasInteresse', 'plusTard'];
  /* Colonnes de l'export InfoBahn → clés du serveur (Equite.gs). L'adresse civique n'est pas gardée. */
  var COLONNES = { 'last/company name': 'nom', 'first name': 'prenom', 'co-signer': 'cosignataire', 'city': 'ville', 'state': 'province', 'zip': 'codePostal', 'home phone': 'telephone', 'work phone': 'telephoneTravail', 'email': 'courriel', 'account no': 'compte', 'maturity date': 'echeance', 'contract date': 'dateContrat', 'termination date': 'dateFin', 'term': 'terme', 'contract type': 'typeContrat', 'contract km': 'kmContrat', 'interest rate': 'taux', 'monthly billing': 'paiement', 'excess wear & use': 'usure', 'excess wear and use': 'usure', 'extended warranty': 'garantieProlongee', 'other products': 'autresProduits', 'residual amount': 'residuel', 'security deposit': 'depot', 'estimated market value': 'valeurBmw', 'estimated payoff': 'payoffBmw', 'estimated equity': 'equiteBmw', 'vin': 'vin', 'year': 'annee', 'make & model': 'vehicule', 'make and model': 'vehicule', 'exterior color': 'couleur', 'new/used': 'neufUsage', 'sales person': 'conseiller', 'account status': 'statut' };
  var DATES = { echeance: 1, dateContrat: 1, dateFin: 1 };
  /* Séries voisines : quand aucun neuf de la même série n'est en stock, on propose la plus proche. */
  var FAMILLES = { X1: ['X2', 'X3'], X2: ['X1', 'X3'], X3: ['X4', 'X5', 'X1'], X4: ['X3', 'X5'], X5: ['X6', 'X7', 'X3'], X6: ['X5', 'X7'], X7: ['X5', 'X6'], 'Série 2': ['Série 3', 'Série 4'], 'Série 3': ['Série 4', 'Série 5', 'i4'], 'Série 4': ['Série 3', 'i4'], 'Série 5': ['Série 3', 'i5', 'Série 7'], 'Série 7': ['Série 5', 'i7'], 'Série 8': ['Série 5'], i4: ['Série 4', 'Série 3', 'i5'], i5: ['Série 5', 'i4'], i7: ['Série 7'], iX: ['X5', 'X7'], Z4: ['Série 4'], XM: ['X7'], 'X3 M': ['X3'], 'X5 M': ['X5'], 'X6 M': ['X6'], 'X4 M': ['X4'], M2: ['Série 2'], M3: ['Série 3'], M4: ['Série 4'], M5: ['Série 5'], M8: ['Série 8'] };

  function texte(v) { return v === null || v === undefined ? '' : String(v).trim(); }
  /** Montant : « $6,457.52 », « ($106,439.74) » (négatif, comptable), « N/A » → null. */
  function nombre(v) { if (v === null || v === undefined || v === '' || /^n\/?a$/i.test(String(v).trim())) return null; if (typeof v === 'number') return isNaN(v) ? null : v; var s = String(v).trim(), neg = /^\(.*\)$/.test(s); var n = parseFloat(s.replace(/[^0-9.\-]/g, '')); return isNaN(n) ? null : (neg ? -Math.abs(n) : n); }
  function fmt$(n) { return n === null || n === undefined || isNaN(n) ? '—' : AMX.fmtArgent(Math.round(n), 0); }
  function fmtSigne(n) { if (n === null || n === undefined || isNaN(n)) return '—'; var r = Math.round(n); return (r < 0 ? '−' : '+') + AMX.fmtArgent(Math.abs(r), 0); }
  function iso(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  /** M/D/YYYY (InfoBahn) ou ISO → ISO. */
  function dateIso(s) {
    s = texte(s); if (!s || /^n\/?a$/i.test(s)) return '';
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return m[1] + '-' + m[2] + '-' + m[3];
    var m2 = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s); if (m2) return m2[3] + '-' + ('0' + m2[1]).slice(-2) + '-' + ('0' + m2[2]).slice(-2);
    var d = new Date(s); return isNaN(d.getTime()) ? '' : iso(d);
  }
  function moisEntre(deIso, aIso) { var a = new Date(deIso + 'T12:00:00'), b = new Date(aIso + 'T12:00:00'); if (isNaN(a) || isNaN(b)) return null; return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + (b.getDate() > a.getDate() ? 1 : 0); }
  function nomCie(code) { return (AMX.COMPAGNIES_TOUTES[code] || code || '').replace(' Chevrolet Buick Cadillac', ''); }
  function estLocation(c) { return /lease|location/i.test(texte(c.typeContrat)); }
  /* 4 nov. : GM (Hawkesbury, Ste-Marie) — portefeuille de la Financière GM lu dans GM Dealer Direct. */
  var CIES_GM = { HAWKS: 1, STM: 1 };
  function estGm(cie) { return !!CIES_GM[cie]; }
  function estVw(cie) { return cie === 'VW'; }   /* 4 nov. : VW Finance (Dealer Extranet › Portfolio Manager) */
  function estHmf(cie) { return cie === 'HYUNDAI'; }   /* 5 nov. : Hyundai Finance (www.hmfdealer.ca › Customer Portfolio) */
  function modeCie(cie) { return estGm(cie) ? 'gm' : (estVw(cie) ? 'vw' : (estHmf(cie) ? 'hmf' : 'bmw')); }
  function preteur(cie) { return estGm(cie) ? 'Financière GM' : (estVw(cie) ? 'VW Finance' : (estHmf(cie) ? 'Hyundai Finance' : 'BMW Financial Services')); }
  function libConst(cie) { return estGm(cie) ? 'GM' : (estVw(cie) ? 'VW' : (estHmf(cie) ? 'Hyundai' : 'BMW')); }
  var URL_PORTAIL = { gm: 'https://www.gmdealerdirect.ca/lm/Lead/myLeadLists.aspx', vw: 'https://dealerportal.vwfinance.ca/dashboard/portfolio-management', hmf: 'https://www.hmfdealer.ca/hmfdp/s/' };
  var NOM_PORTAIL = { gm: 'GM Dealer Direct', vw: 'VW Finance', hmf: 'Hyundai Finance' };
  /* 4 nov. (Maxime) : « on n'utilise pas Black Book mais OpenLane, et indique ceux qu'on peut envoyer aux États-Unis » ;
     « option US pour toutes les marques qui s'exportent ». La valeur vient d'OpenLane seulement ; un NIV qui commence par un
     préfixe exportable (AMX.export, 1 / 4 / 5 par défaut) porte « É.-U. » et ouvre l'évaluation (boîte Canada ou É.-U.). */
  function exportable(vin) { return !!(vin && AMX.export && AMX.export.exportable && AMX.export.exportable(vin)); }
  function cle(t) { return AMX.texteCherche ? AMX.texteCherche(t) : texte(t).toLowerCase(); }
  /** Meilleur scénario DealDriver : la plus basse mensualité, semblable avant alternatif à égalité ; notre stock signalé. */
  function meilleureProposition(liste) {
    var ps = (liste || []).filter(function (p) { return p && nombre(p.mensualite) > 0; });
    if (!ps.length) return null;
    ps.sort(function (a, b) { return (nombre(a.mensualite) - nombre(b.mensualite)) || ((a.groupe === 'alternatif') - (b.groupe === 'alternatif')) || ((b.terrain ? 1 : 0) - (a.terrain ? 1 : 0)); });
    return ps[0];
  }
  /* 4 nov. : questions à Einstein AI — le serveur (EQ_demander) rend des filtres { champ, op, valeur, valeur2 } ;
     la page les applique ici aux clients qu'elle a déjà. Einstein ne voit aucune donnée de client. */
  function valeurChamp(r, champ) {
    var c = r.compte;
    switch (champ) {
      case 'taux': return nombre(c.taux); case 'paiement': return nombre(c.paiement); case 'terme': return nombre(c.terme);
      case 'moisRestants': return r.moisRestants; case 'echeance': return texte(c.echeance); case 'dateContrat': return texte(c.dateContrat);
      case 'typeContrat': return r.location ? 'location' : 'financement'; case 'annee': return nombre(c.annee);
      case 'marque': return texte(c.marque); case 'modele': return texte(c.modele); case 'version': return texte(c.version);
      case 'valeur': return r.valeur; case 'solde': return r.solde; case 'equite': return r.equite; case 'equiteConstructeur': return nombre(c.equiteBmw);
      case 'residuel': return nombre(c.residuel); case 'kmEstime': return r.kmEstime; case 'kmContrat': return nombre(c.kmContrat); case 'kmFin': return nombre(c.kmFin);
      case 'depassement': return nombre(c.coutDepassement); case 'nouvelleMensualite': return r.mensualite; case 'ecart': return r.ecart;
      case 'cible': return r.cible ? 'oui' : 'non'; case 'scenarioStock': return (r.propositions || []).some(function (p) { return p.terrain; }) ? 'oui' : 'non';
      case 'conseiller': return texte(c.conseiller); case 'ville': return texte(c.ville); case 'suivi': return texte(c.suivi);
      case 'ndnc': return r.ndnc ? 'oui' : 'non'; case 'exportable': return r.exportable ? 'oui' : 'non'; case 'listes': return texte(c.listes); case 'etatLead': return texte(c.etatLead); case 'pdsf': return nombre(c.pdsf);
    }
    return null;
  }
  function condRespectee(r, k) {
    var v = valeurChamp(r, k.champ), op = k.op;
    var vide = v === null || v === undefined || v === '';
    if (op === 'vide') return vide;
    if (op === 'nonVide') return !vide;
    if (vide) return op === '!=';
    var a = texte(k.valeur), b = texte(k.valeur2);
    if (typeof v === 'number') {
      var na = nombre(a), nb = nombre(b);
      if (na === null) return false;
      if (op === '>') return v > na; if (op === '>=') return v >= na; if (op === '<') return v < na; if (op === '<=') return v <= na;
      if (op === '=') return Math.abs(v - na) < 0.005; if (op === '!=') return Math.abs(v - na) >= 0.005;
      if (op === 'entre') return nb !== null && v >= Math.min(na, nb) && v <= Math.max(na, nb);
      return String(v).indexOf(a) >= 0;
    }
    var tv = cle(v), ta = cle(a), tb = cle(b);
    if (op === 'contient') return tv.indexOf(ta) >= 0;
    if (op === '=') return tv === ta; if (op === '!=') return tv !== ta;
    if (op === '>') return tv > ta; if (op === '>=') return tv >= ta; if (op === '<') return tv < ta; if (op === '<=') return tv <= ta;
    if (op === 'entre') return tv >= (ta < tb ? ta : tb) && tv <= (ta < tb ? tb : ta);
    return false;
  }
  function texteCondition(k) {
    var lib = { '>': 'plus de', '>=': 'au moins', '<': 'moins de', '<=': 'au plus', '=': '=', '!=': '≠', contient: 'contient', entre: 'entre', vide: 'vide', nonVide: 'rempli' }[k.op] || k.op;
    return k.champ + ' ' + lib + (k.op === 'vide' || k.op === 'nonVide' ? '' : ' ' + k.valeur + (k.op === 'entre' ? ' et ' + k.valeur2 : ''));
  }
  function texteProposition(p) { return (p.type === 'financement' ? 'Financement' : 'Location') + (p.terme ? ' ' + p.terme + ' mois' : '') + (p.taux !== null && p.taux !== undefined && p.taux !== '' ? ' à ' + String(p.taux).replace('.', ',') + ' %' : '') + (p.groupe === 'alternatif' ? ' · autre modèle' : '') + (p.terrain ? ' · en stock' : ''); }
  function nomClient(c) { return [c.prenom, c.nom].filter(Boolean).join(' ') || c.compte; }
  function vehiculeTexte(c) { return [c.annee, c.marque, c.modele, c.version].filter(Boolean).join(' ') || c.vehicule || '—'; }

  /* ---- « BMW X1 xDrive28i » → série (X1, Série 3, i4, X3 M…). Même règle que le serveur (EQ_vehicule_). ---- */
  function serieDe(s) {
    var t = texte(s).replace(/\s+/g, ' ').replace(/^(BMW Motorrad|BMW|MINI|Motorrad)\s+/i, '');
    var mots = t.split(' ').filter(Boolean), premier = mots[0] || '';
    var serie = /^M?(\d)(\d{2})[A-Za-z]*$/.exec(premier);
    if (serie) return 'Série ' + serie[1];
    if (/^(X|Z)\d$/i.test(premier) && /^M$/i.test(mots[1] || '')) return premier + ' M';
    return premier;
  }
  function famille(serie) { return FAMILLES[serie] || []; }
  /** Mensualité d'un financement : montant, taux annuel (%), nombre de mois. */
  function pmt(montant, tauxPct, mois) {
    montant = nombre(montant); mois = nombre(mois); var t = nombre(tauxPct);
    if (montant === null || !mois || mois <= 0) return null;
    if (montant <= 0) return 0;
    var r = (t || 0) / 100 / 12;
    if (!r) return montant / mois;
    return montant * r / (1 - Math.pow(1 + r, -mois));
  }

  /* ---- Dette au jour le jour (5 nov., Maxime : « que le solde de la dette soit toujours à jour sans qu'on doive se
     reconnecter aux différents systèmes ; un bouton calcul dette ou on le fait automatique »). Calculée à chaque affichage,
     pour la date du jour, d'après le contrat : aucun portail à rouvrir.
       1) Solde lu chez le prêteur (payoff BMW, rachat GM, solde VW) : reporté à aujourd'hui. Chaque mensualité passée depuis
          la lecture retire le capital qu'elle rembourse ; les intérêts courent depuis la dernière mensualité.
       2) Sans solde du prêteur (locations BMW) : valeur des mensualités qui restent, plus le résiduel (location), au taux du
          contrat.
     Mensualités le jour du mois de l'échéance, la dernière à l'échéance. Contrat échu : 0 (financement), résiduel (location).
     Estimation : un paiement manqué, un remboursement anticipé ou des frais ne se voient qu'à la prochaine lecture du prêteur. ---- */
  var JOUR_MS = 86400000, MOIS_J = 30.4375;
  function dateMidi(x) { var t = String(x || '').slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null; var d = new Date(t + 'T12:00:00'); return isNaN(d) ? null : d; }
  function ajouterMois(d, n) { var r = new Date(d.getTime()), jour = r.getDate(); r.setDate(1); r.setMonth(r.getMonth() + n); var fin = new Date(r.getFullYear(), r.getMonth() + 1, 0, 12).getDate(); r.setDate(Math.min(jour, fin)); return r; }
  /** Mensualités qui restent après le jour `ajd` (celle du jour est faite). */
  function mensualitesRestantes(ajd, ech) {
    var a = dateMidi(ajd), e = dateMidi(ech); if (!a || !e) return null;
    if (e <= a) return 0;
    var m = (e.getFullYear() - a.getFullYear()) * 12 + (e.getMonth() - a.getMonth());
    return e.getDate() > a.getDate() ? m + 1 : m;
  }
  /** Part du mois écoulée depuis la dernière mensualité (intérêts courus). */
  function fractionMois(ajd, ech, n) {
    var a = dateMidi(ajd), e = dateMidi(ech); if (!a || !e || !n) return 0;
    return Math.max(0, Math.min(1, (a - ajouterMois(e, -n)) / JOUR_MS / MOIS_J));
  }
  /** La dette d'un compte au jour `ajd` → { solde, echeance (dû à l'échéance), source : preteur | contrat | fige | '', base, baseLe, paiements, n, taux, paiement }. */
  function detteDe(c, ajd) {
    var loc = estLocation(c), P = nombre(c.paiement) || 0, t = nombre(c.taux);
    var i = t !== null && t > 0 && t < 40 ? t / 1200 : 0;
    var R = loc ? nombre(c.residuel) : null;
    var d = { solde: null, echeance: loc ? R : 0, source: '', base: null, baseLe: '', paiements: 0, n: null, taux: i ? t : null, paiement: P || null, location: loc };
    var n = c.echeance ? mensualitesRestantes(ajd, c.echeance) : null; d.n = n;
    var B0 = nombre(c.payoffBmw), le = texte(c.payoffLe || c.luLe).slice(0, 10);
    if (B0 !== null && B0 >= 0 && dateMidi(le) && n !== null) {
      var n0 = le < ajd ? mensualitesRestantes(le, c.echeance) : n, k = Math.max(0, (n0 || 0) - n);
      var Bp = B0 / (1 + i * fractionMois(le, c.echeance, n0)), g = Math.pow(1 + i, k);
      var Bk = Math.max(0, i ? Bp * g - P * (g - 1) / i : Bp - P * k);
      d.solde = n === 0 ? (loc ? (R !== null ? R : Bk) : 0) : Bk * (1 + i * fractionMois(ajd, c.echeance, n));
      d.source = 'preteur'; d.base = B0; d.baseLe = le; d.paiements = k;
    } else if (n !== null && (P || R !== null)) {
      var pv = i ? P * (1 - Math.pow(1 + i, -n)) / i : P * n;
      var pvR = loc && R !== null ? R * Math.pow(1 + i, -n) : 0;
      d.solde = (pv + pvR) * (1 + i * fractionMois(ajd, c.echeance, n));
      d.source = 'contrat';
    } else if (B0 !== null) { d.solde = B0; d.source = 'fige'; d.base = B0; d.baseLe = le; }
    if (d.solde !== null) d.solde = Math.round(d.solde * 100) / 100;
    return d;
  }
  /** Le petit texte sous la dette : d'où elle vient. */
  function texteDette(r) {
    var d = r.dette || {}, qui = r.gm ? 'rachat GM' : (r.mode === 'vw' ? 'solde VW' : (r.mode === 'hmf' ? 'rachat Hyundai Finance' : 'solde BMW'));
    if (d.source === 'preteur') return qui + ' du ' + AMX.fmtDateCourte(d.baseLe) + (d.paiements ? ' − ' + d.paiements + ' mensualité' + (d.paiements > 1 ? 's' : '') : '');
    if (d.source === 'contrat') return 'calculée (contrat)';
    if (d.source === 'fige') return qui + ' du ' + AMX.fmtDateCourte(d.baseLe) + ' (non reporté)';
    return 'à calculer';
  }

  /* ---- Export InfoBahn : une table HTML (SearchResults.xls) → lignes normalisées (clés du serveur, dates ISO) ---- */
  function lireExport(contenu) {
    var out = { lignes: [], entetes: [], inconnues: [], erreurs: [], total: 0 };
    var t = String(contenu || '');
    var lignesBrutes = [];
    if (/<table/i.test(t) && /<th/i.test(t)) {
      var doc = new DOMParser().parseFromString(t, 'text/html');
      var trs = doc.querySelectorAll('tr');
      var entetes = Array.prototype.map.call(trs[0] ? trs[0].querySelectorAll('th, td') : [], function (e) { return texte(e.textContent); });
      for (var i = 1; i < trs.length; i++) { var cells = Array.prototype.map.call(trs[i].querySelectorAll('td'), function (e) { return texte(e.textContent); }); if (cells.length) lignesBrutes.push(cells); }
      out.entetes = entetes;
    } else if (typeof XLSX !== 'undefined' && (/[,;\t]/.test(t.split('\n')[0] || ''))) {
      var wb = XLSX.read(t, { type: 'string' }), ws = wb.Sheets[wb.SheetNames[0]];
      var aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
      out.entetes = (aoa[0] || []).map(texte); lignesBrutes = aoa.slice(1);
    } else { out.erreurs.push('Fichier non reconnu : attendu l\'export « SearchResults.xls » d\'InfoBahn (Portfolio › Export).'); return out; }
    var cles = out.entetes.map(function (e) { var k = COLONNES[e.toLowerCase().replace(/\s+/g, ' ')]; if (!k && e && !/^address$|^balloon amount$/i.test(e)) out.inconnues.push(e); return k || null; });
    if (cles.indexOf('compte') < 0 || cles.indexOf('vin') < 0) { out.erreurs.push('Colonnes « Account No » et « VIN » introuvables : est-ce bien l\'export du portefeuille InfoBahn ?'); return out; }
    lignesBrutes.forEach(function (cells) {
      var o = {}; cles.forEach(function (k, j) { if (k) o[k] = DATES[k] ? dateIso(cells[j]) : texte(cells[j]); });
      out.total++;
      if (!texte(o.compte)) return;
      /* Locations (Lease, Pre Pay Lease, Flex Lease) : InfoBahn laisse valeur et payoff à N/A mais met un montant dans
         « Estimated Equity » qui n'en est pas une (il est voisin du résiduel, parfois plus bas) : c'est l'estimation de
         valeur du véhicule. On la range comme valeur BMW et l'équité BMW devient valeur − résiduel (à l'échéance). */
      if (/lease/i.test(o.typeContrat) && nombre(o.valeurBmw) === null && nombre(o.payoffBmw) === null && nombre(o.equiteBmw) !== null) {
        var vl = nombre(o.equiteBmw), rl = nombre(o.residuel);
        o.valeurBmw = vl > 0 ? String(vl) : ''; o.equiteBmw = vl > 0 && rl !== null ? String(Math.round((vl - rl) * 100) / 100) : '';
      }
      var veh = texte(o.vehicule); o.marque = /^mini/i.test(veh) ? 'MINI' : 'BMW'; o.modele = serieDe(veh); o.version = veh.replace(/^(BMW Motorrad|BMW|MINI|Motorrad)\s+/i, '').split(' ').filter(Boolean).slice(o.modele.indexOf('Série') === 0 ? 0 : (/ M$/.test(o.modele) ? 2 : 1)).join(' ');
      out.lignes.push(o);
    });
    return out;
  }

  /* ---- Analyse : valeur, solde, équité, neuf similaire, nouvelle mensualité ---- */
  /** comptes (?equite=1), neufs = véhicules du suivi des neufs (origine constructeur), params, options.valeurs = fn(vin) → valeur OpenLane. */
  function analyser(comptes, neufs, params, options) {
    params = Object.assign({}, PARAMS_DEFAUT, params || {}); options = options || {};
    var ajd = iso(new Date());
    var mode = options.mode || (options.gm ? 'gm' : 'bmw'), gm = mode === 'gm', parModele = mode !== 'bmw';
    var stock = (neufs || []).filter(function (v) { return v && v.enStock && (v.origine === 'constructeur' || /^portail-/.test(String(v.source || ''))) && (gm || (mode === 'vw' ? /VOLKSWAGEN|^VW$/.test(String(v.marque || '').toUpperCase()) : (mode === 'hmf' ? /HYUNDAI/.test(String(v.marque || '').toUpperCase()) : String(v.marque || '').toUpperCase() === 'BMW'))); });
    var parSerie = {};
    stock.forEach(function (v) { var prix = nombre(v.prix) || nombre(v.extra && v.extra.pdsf); if (!prix) return; var s = parModele ? cle(v.modele) : texte(v.modele); (parSerie[s] = parSerie[s] || []).push({ vin: v.vin, annee: v.annee, modele: v.modele, version: v.version, couleur: v.couleur, prix: prix, enStock: !/TRANSIT/.test(String(v.statutLibelle || v.statut || '').toUpperCase()), statut: v.statutLibelle || v.statut || '', v: v }); });
    Object.keys(parSerie).forEach(function (s) { parSerie[s].sort(function (a, b) { return (b.enStock - a.enStock) || (a.prix - b.prix); }); });
    return (comptes || []).filter(function (c) { return c.actif !== false; }).map(function (c) {
      var r = { compte: c, location: estLocation(c), serie: parModele ? cle(c.modele) : (c.modele || serieDe(c.vehicule)), gm: gm, mode: mode, exportable: exportable(c.vin) };
      r.moisRestants = c.echeance ? Math.max(0, moisEntre(ajd, c.echeance) || 0) : null;
      r.moisEcoules = c.dateContrat ? Math.max(0, moisEntre(c.dateContrat, ajd) || 0) : null;
      r.echeanceProche = r.moisRestants !== null && r.moisRestants <= 6;
      var paiement = nombre(c.paiement) || 0;
      /* Km estimé : location → allocation du contrat au prorata ; financement → kmAn par année. */
      if (gm && nombre(c.kmEstime)) r.kmEstime = Math.round(nombre(c.kmEstime));   /* GM estime le km du client */
      else if (r.location && nombre(c.kmContrat) && nombre(c.terme)) r.kmEstime = Math.round(nombre(c.kmContrat) * Math.min(1, (r.moisEcoules || 0) / nombre(c.terme)));
      else r.kmEstime = r.moisEcoules !== null ? Math.round(params.kmAn * r.moisEcoules / 12) : null;
      /* Solde : financement → payoff BMW ; location → résiduel + paiements restants (rachat maintenant) ; à l'échéance = résiduel. */
      /* 5 nov. : la dette du jour (detteDe) — solde du prêteur reporté à aujourd'hui, sinon calculée d'après le contrat. */
      r.dette = detteDe(c, ajd);
      r.solde = r.dette.solde; r.soldeEcheance = r.location ? nombre(c.residuel) : 0;
      /* Valeur : OpenLane seulement (prévision, sinon ajusté au km, sinon moyenne des ventes). 4 nov. : plus l'estimation du prêteur
         (Black Book chez GM et VW) — Maxime : « on n'utilise pas Black Book mais OpenLane ». Sans lecture OpenLane : « à lire ». */
      var ol = options.valeurs ? options.valeurs(c.vin) : null;
      r.openlane = ol || null;
      var vOl = ol ? (nombre(ol.prevision) || (AMX.openlane && AMX.openlane.ajuste ? AMX.openlane.ajuste(ol, r.kmEstime) : null) || nombre(ol.prixMoy)) : null;
      if (vOl) { r.valeur = vOl; r.valeurSource = 'openlane'; }
      else { r.valeur = null; r.valeurSource = ''; }
      r.equite = r.valeur !== null && r.solde !== null ? r.valeur - r.solde : null;
      r.equiteEcheance = r.valeur !== null && r.soldeEcheance !== null ? r.valeur - r.soldeEcheance : null;
      r.equiteBmw = nombre(c.equiteBmw);
      /* Neuf similaire : même série en stock (sinon en route), sinon une série voisine. */
      var cands = parSerie[r.serie] || [], voisine = '';
      if (!cands.length) { famille(r.serie).some(function (s) { if (parSerie[s] && parSerie[s].length) { cands = parSerie[s]; voisine = s; return true; } return false; }); }
      r.neuf = cands[0] || null; r.neufVoisin = voisine; r.alternatives = Math.max(0, cands.length - 1);
      /* 4 nov. (Maxime) : « je veux aucune valeur de reprise de GM, juste les comparables OpenLane ». Les scénarios DealDriver
         sont calculés par GM avec SA valeur de reprise : ils ne servent plus au calcul. Pour GM comme pour BMW et VW, la nouvelle
         mensualité part de la valeur OpenLane, du neuf semblable en stock et du taux et du terme de la page. */
      r.propositions = [];
      var prop = null;
      r.proposition = prop;
      if (prop) {
        r.mensualite = nombre(prop.mensualite); r.finance = null; r.taxes = null; r.prixNeuf = null;
        r.ecart = r.mensualite !== null && paiement ? r.mensualite - paiement : null;
        r.cible = r.ecart !== null && r.ecart <= (nombre(params.marge) || 0);
      } else if (r.neuf) {
        var prix = r.neuf.prix + (nombre(params.frais) || 0);
        var valeur = r.valeur !== null ? r.valeur : 0;
        var taxable = Math.max(0, prix - valeur), taxes = taxable * (nombre(params.taxes) || 0) / 100;
        r.finance = Math.max(0, prix + taxes - valeur + (r.solde || 0) - (nombre(params.comptant) || 0));
        r.taxes = taxes; r.prixNeuf = prix;
        r.mensualite = pmt(r.finance, params.taux, params.terme);
        r.ecart = r.mensualite !== null && paiement ? r.mensualite - paiement : null;
        r.cible = r.valeur !== null && r.ecart !== null && r.ecart <= (nombre(params.marge) || 0);
      } else { r.finance = null; r.mensualite = null; r.ecart = null; r.cible = false; }
      r.sansValeur = r.valeur === null;
      r.ndnc = c.ndnc === 'oui';
      r.score = (r.cible ? 100000 : 0) + (r.equite || 0) + (r.echeanceProche ? 5000 : 0);
      return r;
    }).sort(function (a, b) { return b.score - a.score; });
  }

  /* ---- Données ---- */
  var cache = { donnees: null, le: 0, promesse: null };
  var DUREE_CACHE_MS = 5 * 60000;
  AMX.equite = {
    charger: function (force) {
      if (!force && cache.donnees && Date.now() - cache.le < AMX.dureeCopie(DUREE_CACHE_MS)) return Promise.resolve(cache.donnees);
      if (cache.promesse) return cache.promesse;
      cache.promesse = AMX.get({ equite: 1 }, { gz: true, copie: 'equite' }).then(function (d) {
        cache.promesse = null;
        if (!d || d.refuse || d.ok === false) throw new Error((d && (d.erreur || d.message)) || 'Réponse inattendue du serveur');
        cache.donnees = d; cache.le = Date.now();
        return d;
      }, function (e) { cache.promesse = null; throw e; });
      return cache.promesse;
    },
    enCache: function () { return cache.donnees; },
    vider: function () { cache.donnees = null; cache.le = 0; AMX.cacheLocal.oublier('equite'); },
    /** Comptes actifs d'une concession (ou de toutes), d'après le cache. */
    comptes: function (cie) { var d = cache.donnees; if (!d) return []; return (d.comptes || []).filter(function (c) { return c.actif !== false && (!cie || c.compagnie === cie); }); },
    etat: function (cie) { var d = cache.donnees; return d && d.etats ? d.etats[cie] || null : null; },
    suivi: function (cie, compte, suivi, note) {
      return AMX.post({ action: 'equiteSuivi', compagnie: cie, compte: compte, suivi: suivi || '', note: note || '' }, { rejouer: true }).then(function (r) {
        AMX.verifier(r, 'Suivi non enregistré');
        if (cache.donnees) (cache.donnees.comptes || []).forEach(function (c) { if (c.compagnie === cie && c.compte === compte) { c.suivi = r.suivi; c.suiviNote = r.suiviNote; c.suiviLe = r.suiviLe; c.suiviPar = r.suiviPar; } });
        return r;
      });
    },
    params: function () { var p = AMX.memo.lire('equite_params', null); return Object.assign({}, PARAMS_DEFAUT, p && typeof p === 'object' ? p : {}); },
    poserParams: function (p) { AMX.memo.ecrire('equite_params', Object.assign({}, AMX.equite.params(), p || {})); },
    lireExport: lireExport, serieDe: serieDe, famille: famille, analyser: analyser, pmt: pmt, dateIso: dateIso, detteDe: detteDe, mensualitesRestantes: mensualitesRestantes,
    PARAMS_DEFAUT: PARAMS_DEFAUT, SUIVIS: SUIVIS,
    monter: function (conteneur, cie, ctx) { return new VueEquite(conteneur, cie, ctx); }
  };

  function injecterCss() {
    if (document.getElementById('css-equite')) return;
    var s = document.createElement('style'); s.id = 'css-equite';
    s.textContent = [
      '.eq-params { display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end; margin-bottom: 12px; } .eq-params .champ { width: 110px; } .eq-params .champ input { height: 30px; }',
      '.eq-filtres { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; } .eq-filtres .recherche { flex: 1 1 180px; height: 30px; } .eq-filtres select { height: 30px; width: auto; } .eq-filtres .compte { margin-left: auto; font-size: 12px; color: var(--encre-3); }',
      '.eq-table { overflow-x: auto; } .eq-table .tableau { width: 100%; } .eq-table td, .eq-table th { padding: 6px 8px; vertical-align: top; font-size: 12.5px; } .eq-table th { white-space: nowrap; } .eq-table td.num, .eq-table th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }',
      '.eq-table td .sous { font-size: 12px; color: var(--encre-3); } .eq-table td .vin { font-family: var(--mono); font-size: 12px; color: var(--encre-3); } .eq-table td .nom { font-weight: 600; }',
      '.eq-table tr.cible td { background: var(--vert-clair); } .eq-table tr.sans td .valeur { color: var(--encre-3); font-style: italic; }',
      '.eq-table button.eq-dette { background: none; border: 0; padding: 0; font: inherit; color: inherit; cursor: pointer; text-decoration: underline dotted; text-underline-offset: 3px; } .eq-table button.eq-dette:hover { color: var(--vert-fonce, var(--vert)); }',
      '.eq-dette-tab { width: 100%; border-collapse: collapse; font-size: 13px; } .eq-dette-tab td { padding: 5px 6px; border-bottom: 1px solid var(--ligne, #E3E7EB); } .eq-dette-tab td.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; } .eq-dette-tab tr.total td { font-weight: 700; border-bottom: 0; }',
      '.eq-pos { color: var(--vert); font-weight: 700; } .eq-neg { color: var(--rouge); font-weight: 700; } .eq-nul { color: var(--encre-3); }',
      '.eq-table select.suivi { height: 26px; font-size: 12px; width: auto; max-width: 130px; } .eq-table .suivi-note { font-size: 12px; color: var(--encre-3); margin-top: 2px; max-width: 160px; }',
      '.eq-table .btn.petit { height: 24px; padding: 0 7px; font-size: 12px; }',
      '.eq-contact a { color: inherit; text-decoration: none; } .eq-contact a:hover { text-decoration: underline; }',
      '.eq-page .eq-zone { display: block; border: 1.5px dashed var(--ligne-forte); border-radius: var(--rayon-s); padding: 22px 14px; text-align: center; cursor: pointer; color: var(--encre-3); font-size: 13px; } .eq-page .eq-zone:hover, .eq-page .eq-zone.survol { border-color: var(--vert); background: var(--vert-clair); } .eq-page .eq-zone input { display: none; } .eq-page .eq-zone.charge { border-style: solid; border-color: var(--vert); color: var(--vert); font-weight: 600; }',
      '.eq-page .eq-resume { margin-top: 12px; padding: 10px 12px; border-radius: 10px; background: var(--fond-2, #F4F6F8); font-size: 13px; } .eq-page .eq-resume.ok { background: var(--vert-bg, #E6F4EC); } .eq-page .eq-resume.erreur { background: var(--rouge-bg); }',
      '.eq-page .eq-etapes { margin: 0; padding-left: 18px; line-height: 1.6; font-size: 13px; }',
      '.eq-ia { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; } .eq-ia .eq-ia-champ { flex: 1 1 auto; height: 34px; } .eq-ia .maxai-avatar, .eq-ia img { flex: 0 0 auto; }',
      '.eq-us { display: flex; gap: 6px; align-items: center; margin-top: 3px; } .eq-us-puce { background: #E8F0FE; color: #1A64BF; font-weight: 700; font-size: 11.5px; padding: 1px 6px; border-radius: 8px; }',
      '.eq-ia-res { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; padding: 8px 12px; border-radius: 10px; background: var(--vert-clair); font-size: 13px; } .eq-ia-res .sous { color: var(--encre-3); font-size: 12px; flex: 1 1 200px; }',
      '.eq-sync { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin: 0 0 12px; padding: 8px 12px; border-radius: 10px; background: var(--fond-2, #F4F6F8); font-size: 13px; } .eq-sync.ok { background: var(--vert-clair); } .eq-sync.alerte { background: #FFF4E0; color: var(--ambre); } .eq-sync .eq-sync-txt { flex: 1 1 260px; }',
      '.eq-sync .eq-sync-barre { flex: 1 1 180px; height: 6px; border-radius: 3px; background: var(--ligne, #E3E7EB); overflow: hidden; } .eq-sync .eq-sync-barre span { display: block; height: 100%; background: var(--vert); transition: width .3s; }',
      '.eq-table td.eq-us-cell { min-width: 120px; } .eq-table input.eq-mmr { width: 92px; height: 24px; font-size: 12px; text-align: right; } .eq-table .eq-us-lien { font-size: 12px; }',
      '@media (max-width: 860px) { .eq-params .champ { width: 46%; } }'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* =====================================================================
     Vue « Équité » (par concession) — montée par Relance › Équité › Clients
     ===================================================================== */
  function VueEquite(conteneur, cie, ctx) {
    injecterCss();
    this.el = conteneur; this.cie = cie || 'BMW'; this.ctx = ctx || {};
    this.params = AMX.equite.params();
    this.filtres = { quoi: 'cibles', type: '', echeance: '', conseiller: '', q: '' };
    this.ia = null;   /* filtres rendus par Einstein AI : { question, resume, conditions, tri, sens } */
    this.lignes = []; this.lecture = null;
    this.us = null;          /* calculs É.-U. des évaluations (?evaluationsUs=1), par NIV */
    this.sync = null;        /* lecture OpenLane en cours ou finie (synchroniser) */
    this.essayes = {};       /* NIV déjà demandés à OpenLane depuis l'ouverture de la page */
    this.syncAuto = {};      /* concessions dont la lecture automatique a déjà été lancée */
    this.rendre();
    var self = this;
    this.surOpenlane = function () { self.planifierRendu(); };
    document.addEventListener('amx:openlane', this.surOpenlane);
    if (AMX.openlane && AMX.openlane.charger) AMX.openlane.charger().catch(function () {});
    /* 4 nov. (Maxime) : « la comparaison de la dette avec le montant du calcul US doit être visible » — le gros É.-U. vient
       de l'évaluation du NIV (boîte Canada ou É.-U.), sinon d'un MMR tapé dans la ligne, avec le taux du jour. */
    if (AMX.export && AMX.export.charger) Promise.all([AMX.export.charger(), AMX.export.verdicts ? AMX.export.verdicts() : {}]).then(function (r) { self.us = r[1] || {}; if (!self.detruit) self.planifierRendu(); }).catch(function () {});
  }
  VueEquite.prototype.demonter = function () { this.detruit = true; if (this.sync) this.sync.arret = true; clearTimeout(this.minuterieRendu); document.removeEventListener('amx:openlane', this.surOpenlane); };
  /* Redessin regroupé (lecture OpenLane, export É.-U.) : jamais pendant qu'on tape dans un champ de la page. */
  VueEquite.prototype.planifierRendu = function (ms) {
    var self = this;
    clearTimeout(this.minuterieRendu);
    this.minuterieRendu = setTimeout(function () {
      if (self.detruit || !self.el.isConnected) return;
      var a = document.activeElement;
      if (a && self.el.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) { self.planifierRendu(1500); return; }
      self.rendre();
    }, ms === undefined ? 1200 : ms);
  };
  VueEquite.prototype.neufs = function () { var d = this.ctx.neufs || (AMX.neufs && AMX.neufs.enCache && AMX.neufs.enCache()); var self = this; return d && d.vehicules ? d.vehicules.filter(function (v) { return v.compagnie === self.cie; }) : []; };
  VueEquite.prototype.analyser = function () {
    var comptes = AMX.equite.comptes(this.cie);
    var valeurs = AMX.openlane && AMX.openlane.valeur ? function (vin) { var r = AMX.openlane.valeur(vin); return r && r.luLe ? r : null; } : null;
    this.lignes = analyser(comptes, this.neufs(), this.params, { valeurs: valeurs, mode: modeCie(this.cie) });
    var us = this.us || {}, mmrs = AMX.memo.lire('eq_mmr', {}) || {};
    var P = AMX.export && AMX.export.params ? AMX.export.params() : null, T = AMX.export && AMX.export.taux ? AMX.export.taux() : null;
    var ecart = P ? (nombre(P.ecartEchangePct) !== null ? nombre(P.ecartEchangePct) : nombre(P.ecartPct)) : null;
    this.lignes.forEach(function (r) {
      r.grosUS = null; r.equiteUS = null; r.usSource = ''; r.mmr = null; r.us = null; r.meilleurUS = false;
      if (!r.exportable) return;
      var vin = texte(r.compte.vin).toUpperCase(), u = us[vin];
      if (u && nombre(u.grosUS) !== null) { r.us = u; r.grosUS = nombre(u.grosUS); r.mmr = nombre(u.mmr); r.usSource = 'evaluation'; }
      else if (nombre(mmrs[vin]) && T && nombre(T.taux) && AMX.export.calculer) { var cal = AMX.export.calculer(nombre(mmrs[vin]), T.taux, ecart, P ? P.ajustement : 0); r.grosUS = cal.grosUS; r.mmr = cal.mmr; r.usSource = 'mmr'; }
      if (r.grosUS !== null && r.solde !== null) r.equiteUS = r.grosUS - r.solde;
      r.meilleurUS = r.equiteUS !== null && (r.equite === null || r.equiteUS > r.equite);
    });
    return this.lignes;
  };
  VueEquite.prototype.visibles = function () {
    var f = this.filtres, q = f.q.toLowerCase(), ia = this.ia;
    var liste = this.lignes.filter(function (r) {
      var c = r.compte;
      if (ia && !ia.conditions.every(function (k) { return condRespectee(r, k); })) return false;
      if (!ia && f.quoi === 'cibles' && !r.cible) return false;
      if (f.quoi === 'equite' && !(r.equite !== null && r.equite > 0)) return false;
      if (f.quoi === 'sansValeur' && !r.sansValeur) return false;
      if (f.quoi === 'suivi' && !c.suivi) return false;
      if (f.quoi === 'exportables' && !r.exportable) return false;
      if (f.quoi === 'meilleurUS' && !r.meilleurUS) return false;
      if (f.type === 'location' && !r.location) return false;
      if (f.type === 'financement' && r.location) return false;
      if (f.echeance && (r.moisRestants === null || r.moisRestants > Number(f.echeance))) return false;
      if (f.conseiller && (f.conseiller === '—' ? !!c.conseiller : c.conseiller !== f.conseiller)) return false;
      if (q && [c.nom, c.prenom, c.vin, c.vehicule, c.compte, c.ville, c.conseiller].join(' ').toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    if (ia && ia.tri) {
      var sens = ia.sens === 'croissant' ? 1 : -1;
      liste.sort(function (a, b) { var x = valeurChamp(a, ia.tri), y = valeurChamp(b, ia.tri); if (x === null || x === '') return 1; if (y === null || y === '') return -1; return (x > y ? 1 : x < y ? -1 : 0) * sens; });
    }
    return liste;
  };
  /** Question à Einstein AI → filtres (POST equiteDemander). */
  VueEquite.prototype.demander = function (question, bouton) {
    var self = this;
    question = texte(question);
    if (question.length < 3) { AMX.toast('Écrivez une question, par exemple « taux de plus de 5 % ».', 'attention'); return; }
    if (bouton) { bouton.disabled = true; bouton.classList.add('occupe'); }
    AMX.post({ action: 'equiteDemander', question: question }, { secours: false }).then(function (r) {
      if (bouton) { bouton.disabled = false; bouton.classList.remove('occupe'); }
      if (r && r.vehicules && r.comprise === undefined) throw new Error('Le script n\'est pas à jour : déployez Equite.gs.');
      AMX.verifier(r, 'Einstein AI n\'a pas répondu');
      if (!r.comprise) { AMX.toast('Einstein AI : ' + (r.resume || 'question pas comprise, reformulez.'), 'attention', 7000); return; }
      self.ia = { question: question, resume: r.resume, conditions: r.conditions || [], tri: r.tri || '', sens: r.sens || '' };
      self.rendre();
    }).catch(function (e) {
      if (bouton) { bouton.disabled = false; bouton.classList.remove('occupe'); }
      AMX.toast('Einstein AI — ' + AMX.erreurTexte(e), 'erreur', 7000);
    });
  };
  VueEquite.prototype.rendre = function () {
    var self = this, el = this.el;
    AMX.vider(el);
    var d = AMX.equite.enCache();
    if (!d) { el.appendChild(AMX.chargeur('Portefeuille ' + libConst(this.cie))); AMX.equite.charger().then(function () { self.rendre(); }, function (e) { AMX.vider(el); el.appendChild(h('p.doux', { text: 'Portefeuille non lu : ' + AMX.erreurTexte(e) })); }); return; }
    var etat = AMX.equite.etat(this.cie), comptes = AMX.equite.comptes(this.cie);
    if (!comptes.length) {
      el.appendChild(h('div.carte', [h('div.carte-entete', [h('h2', 'Équité — clients ' + nomCie(this.cie))]), h('div.carte-corps', [
        estHmf(this.cie)
          ? h('p', { style: { margin: '0 0 8px' } }, 'Aucun portefeuille lu pour ' + nomCie(this.cie) + '. Dans Chrome, connecté au portail de Hyundai Finance (www.hmfdealer.ca), ouvrez « Customer Portfolio » et cliquez le favori « Automax ← Hyundai Finance » : il lit tous les prêts et les locations actifs (environ 1 minute). Rien n\'est écrit chez Hyundai Finance.')
          : estVw(this.cie)
          ? h('p', { style: { margin: '0 0 8px' } }, 'Aucun portefeuille lu pour ' + nomCie(this.cie) + '. Dans Chrome, connecté au Dealer Extranet de VW Finance, ouvrez Portfolio Manager et cliquez le favori « Automax ← Constructeur » : il lit les contrats qui finissent dans les 12 prochains mois (prêts et locations) et leur fiche. Rien n\'est écrit chez VW.')
          : estGm(this.cie)
          ? h('p', { style: { margin: '0 0 8px' } }, 'Aucun portefeuille lu pour ' + nomCie(this.cie) + '. Dans Chrome, connecté à GM Dealer Direct (www.gmdealerdirect.ca) au nom de ' + nomCie(this.cie) + ', cliquez le favori « Automax ← Constructeur » : il lit les clients de la Financière GM (location, échéances, DealDriver) et leur fiche. Rien n\'est écrit dans GM Dealer Direct.')
          : h('p', { style: { margin: '0 0 8px' } }, 'Aucun portefeuille importé pour ' + nomCie(this.cie) + '. Exportez le portefeuille d\'InfoBahn (Portfolio › Entire Portfolio › « … » › Export) et déposez le fichier dans Relance › Équité › Importer le portefeuille.'),
        modeCie(this.cie) !== 'bmw' ? h('a.btn', { href: URL_PORTAIL[modeCie(this.cie)], target: '_blank', rel: 'noopener' }, 'Ouvrir ' + NOM_PORTAIL[modeCie(this.cie)]) : h('a.btn', { href: AMX.lien('relance', 'equite', { vue: 'import' }) }, 'Importer le portefeuille')
      ])]));
      return;
    }
    var lignes = this.analyser(), vis = this.visibles();
    var nExport = lignes.filter(function (r) { return r.exportable; }).length, nCalculUS = lignes.filter(function (r) { return r.grosUS !== null; }).length, nMeilleurUS = lignes.filter(function (r) { return r.meilleurUS; }).length;
    var nCibles = lignes.filter(function (r) { return r.cible; }).length, nEquite = lignes.filter(function (r) { return r.equite !== null && r.equite > 0; }).length, nSans = lignes.filter(function (r) { return r.sansValeur; }).length, nProches = lignes.filter(function (r) { return r.echeanceProche; }).length, nSuivi = lignes.filter(function (r) { return r.compte.suivi; }).length;
    var carte = function (cls, nom, n, bas, quoi) { var b = h('button.neufs-carte.' + cls + (self.filtres.quoi === quoi ? '.actif' : ''), { type: 'button' }, [h('div.nom', { text: nom }), h('div.n', { text: AMX.fmtNombre(n) }), bas ? h('div.bas', { text: bas }) : null]); b.addEventListener('click', function () { self.filtres.quoi = quoi; self.rendre(); }); return b; };
    var tuiles = h('div.neufs-cartes', [
      carte('sombre', 'Comptes actifs', lignes.length, lignes.filter(function (r) { return r.location; }).length + ' locations · ' + lignes.filter(function (r) { return !r.location; }).length + ' financements', 'tous'),
      carte('vert', 'Cibles', nCibles, 'nouvelle mensualité ≤ actuelle + ' + fmt$(this.params.marge), 'cibles'),
      carte('bleu', 'Équité positive', nEquite, 'valeur > solde (aujourd\'hui)', 'equite'),
      carte('ambre', 'Échéance ≤ 6 mois', nProches, 'contrats qui finissent bientôt', 'proches'),
      carte(nSans ? 'rouge' : 'gris', 'Sans valeur', nSans, nSans ? (this.sync && this.sync.enCours ? 'lecture OpenLane en cours' : 'OpenLane n\'a pas de valeur') : 'tout est valorisé', 'sansValeur'),
      carte('bleu', 'Exportables É.-U.', nExport, nCalculUS + ' avec le gros É.-U. calculé', 'exportables'),
      carte(nMeilleurUS ? 'vert' : 'gris', 'Plus payant aux É.-U.', nMeilleurUS, 'gros É.-U. − dette > équité au Canada', 'meilleurUS'),
      carte('violet', 'En suivi', nSuivi, 'contactés, rendez-vous, vendus', 'suivi')
    ]);
    if (this.filtres.quoi === 'proches') vis = lignes.filter(function (r) { return r.echeanceProche; });
    /* Paramètres du calcul */
    var champ = function (cle, libelle, pas, aide) { var inp = h('input', { type: 'number', step: pas || '0.01', value: String(self.params[cle]), title: aide || '' }); inp.addEventListener('change', function () { var v = nombre(inp.value); if (v === null) return; self.params[cle] = v; AMX.equite.poserParams(self.params); try { inp.blur(); } catch (e) {} setTimeout(function () { self.rendre(); }, 0); });   /* redessin différé : retirer le champ pendant son propre « change » fait échouer removeChild */ return h('div.champ', [h('label', { text: libelle }), inp]); };
    var params = h('div.eq-params', [
      champ('taux', 'Taux %', '0.01', 'Taux annuel du financement du neuf (' + preteur(this.cie) + ', programme du mois)'), champ('terme', 'Terme (mois)', '1'), champ('frais', 'Frais $', '1', 'Transport et préparation, autres frais ajoutés au PDSF'),
      champ('marge', 'Marge $/mois', '1', 'Une cible peut payer jusqu\'à ce montant de plus par mois'), champ('taxes', 'Taxes %', '0.001', 'TPS + TVQ sur la différence prix − valeur de l\'échange'), champ('comptant', 'Comptant $', '1'), champ('kmAn', 'Km / an', '1000', 'Km estimé d\'un véhicule financé (pour OpenLane)'),
      h('span.doux.petit', { style: { alignSelf: 'center' } }, 'Nouvelle mensualité = (PDSF + frais − valeur) + taxes + solde, financé au taux et au terme choisis. Estimation : sans incitatifs ni programme de location.')
    ]);
    /* Filtres */
    var conseillers = {}; lignes.forEach(function (r) { conseillers[r.compte.conseiller || '—'] = 1; });
    var sel = function (cle, options) { var s = h('select', options.map(function (o) { return h('option', { value: o[0], selected: self.filtres[cle] === o[0] ? 'selected' : null, text: o[1] }); })); s.value = self.filtres[cle]; s.addEventListener('change', function () { self.filtres[cle] = s.value; setTimeout(function () { self.rendre(); }, 0); }); return s; };
    var rech = h('input.recherche', { type: 'search', placeholder: 'Client, NIV, modèle, ville…', value: this.filtres.q });
    rech.addEventListener('input', function () { self.filtres.q = rech.value; self.rendreTable(); });
    var filtres = h('div.eq-filtres', [
      sel('quoi', [['cibles', 'Cibles'], ['equite', 'Équité positive'], ['proches', 'Échéance ≤ 6 mois'], ['sansValeur', 'Sans valeur'], ['exportables', 'Exportables É.-U.'], ['meilleurUS', 'Plus payant aux É.-U.'], ['suivi', 'En suivi'], ['tous', 'Tous les comptes']]),
      sel('type', [['', 'Location et financement'], ['location', 'Locations'], ['financement', 'Financements']]),
      sel('echeance', [['', 'Toute échéance'], ['3', '≤ 3 mois'], ['6', '≤ 6 mois'], ['12', '≤ 12 mois'], ['24', '≤ 24 mois']]),
      sel('conseiller', [['', 'Tous les conseillers']].concat(Object.keys(conseillers).sort().map(function (k) { return [k, k === '—' ? 'Sans conseiller' : k]; }))),
      rech,
      h('span.compte', { text: vis.length + ' / ' + lignes.length }),
      h('button.btn.petit', { type: 'button', html: I.externe + '<span>Exporter Excel</span>', onclick: function () { self.exporter(); } })
    ]);
    var entete = h('div.carte-entete', [h('h2', ['Équité — clients ' + nomCie(this.cie) + ' (' + preteur(this.cie) + ')', h('span.sous', { text: etat && etat.le ? 'portefeuille lu le ' + AMX.fmtDate(etat.le, true) + (etat.par ? ' par ' + String(etat.par).split('@')[0] : '') : '' })]),
      h('div.actions-ligne', [h('button.btn.petit', { type: 'button', text: 'Calcul de la dette', title: 'La dette de chaque client est recalculée chaque jour d\'après son contrat : voir le détail', onclick: function () { self.calculDette(); } }), modeCie(this.cie) !== 'bmw' ? h('a.btn.petit', { href: URL_PORTAIL[modeCie(this.cie)], target: '_blank', rel: 'noopener', html: I.externe + '<span>' + NOM_PORTAIL[modeCie(this.cie)] + '</span>', title: 'Relire : cliquez le favori « Automax ← Constructeur » dans le portail' }) : h('a.btn.petit', { href: AMX.lien('outils', 'equite'), html: I.rafraichir + '<span>Importer un nouvel export</span>' })])]);
    /* Einstein AI : une question en français, des filtres en retour (rien des clients n'est envoyé). */
    var champQ = h('input.recherche.eq-ia-champ', { type: 'search', placeholder: 'Demandez à Einstein : « taux de plus de 5 % », « paiement de plus de 1 200 $ », « finit dans 6 mois et équité positive »…', value: this.ia ? this.ia.question : '' });
    var btnQ = h('button.btn.primaire.petit', { type: 'button', text: 'Demander' });
    btnQ.addEventListener('click', function () { self.demander(champQ.value, btnQ); });
    champQ.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); self.demander(champQ.value, btnQ); } });
    var avatar = AMX.maxai && AMX.maxai.avatar ? AMX.maxai.avatar(28) : null;
    var iaBarre = h('div.eq-ia', [avatar, champQ, btnQ]);
    var iaRes = null;
    if (this.ia) {
      var nIa = this.visibles().length;
      var effacer = h('button.btn.petit.fantome', { type: 'button', text: '× Effacer', title: 'Revenir à la liste complète' });
      effacer.addEventListener('click', function () { self.ia = null; self.rendre(); });
      iaRes = h('div.eq-ia-res', [h('span', [h('b', { text: 'Einstein : ' }), this.ia.resume || this.ia.question, ' — ', h('b', { text: AMX.fmtNombre(nIa) + ' client' + (nIa > 1 ? 's' : '') })]),
        h('span.sous', { text: this.ia.conditions.map(texteCondition).join(' · ') + (this.ia.tri ? ' · trié par ' + this.ia.tri + (this.ia.sens === 'croissant' ? ' ↑' : ' ↓') : '') }), effacer]);
    }
    this.elTable = h('div.eq-table');
    this.elSync = h('div.eq-sync');
    el.appendChild(h('div.carte', [entete, h('div.carte-corps', [iaBarre, iaRes, tuiles, this.elSync, params, filtres, this.elTable])]));
    this.majSync();
    this.rendreTable();
    /* Lecture OpenLane automatique : une fois par concession à l'ouverture, les comptes sans valeur (4 nov., Maxime : « la
       lecture OpenLane doit être plus simple pour que les valeurs se synchronisent et que les calculs se fassent »). */
    if (nSans && !this.syncAuto[this.cie] && this.peutLireOpenlane() && !(this.sync && this.sync.enCours)) { this.syncAuto[this.cie] = true; setTimeout(function () { if (!self.detruit) self.synchroniser(); }, 400); }
  };
  VueEquite.prototype.peutLireOpenlane = function () {
    if (!AMX.openlane || !AMX.openlane.direct || AMX.openlane.enDirect() === false) return false;
    return !AMX.perm || AMX.perm('ficheAchat') || AMX.perm('changerStatut') || AMX.perm('gererUtilisateurs') || (AMX.estAdmin && AMX.estAdmin());
  };
  /** Lit sur OpenLane, 3 à la fois, la valeur des comptes sans valeur de la concession ; la page se recalcule à mesure. */
  VueEquite.prototype.synchroniser = function (relire) {
    var self = this;
    if (this.sync && this.sync.enCours) return;
    if (relire) this.essayes = {};
    var vinOk = function (v) { return /^[A-HJ-NPR-Z0-9]{17}$/.test(texte(v).toUpperCase()); };
    var aLire = this.lignes.filter(function (r) { return r.sansValeur && vinOk(r.compte.vin) && !self.essayes[texte(r.compte.vin).toUpperCase()]; });
    if (!aLire.length) { this.majSync(); return; }
    var s = this.sync = { cie: this.cie, total: aLire.length, faits: 0, valorises: 0, sansResultat: 0, erreurs: 0, enCours: true, arret: false, message: '' };
    var i = 0, actifs = 0, PAR = 3;
    var fin = function () { if (!s.enCours) return; s.enCours = false; if (!self.detruit) self.planifierRendu(0); };
    var suivant = function () {
      if (s.arret || self.detruit) { if (!actifs) fin(); return; }
      while (actifs < PAR && i < aLire.length) lancer(aLire[i++]);
      if (!actifs && i >= aLire.length) fin();
    };
    var lancer = function (r) {
      actifs++;
      var vin = texte(r.compte.vin).toUpperCase();
      self.essayes[vin] = 1;
      AMX.openlane.direct(vin, r.kmEstime || '', { source: 'equite', compagnie: self.cie }).then(function (x) {
        if (x && x.nonConnecte) { s.arret = true; s.message = x.erreur || 'OpenLane n\'est pas connecté au site : un administrateur doit recliquer le favori « Automax ← OpenLane » dans OpenLane.'; }
        else if (x && x.refuse) { s.arret = true; s.message = x.erreur || 'Lecture OpenLane refusée pour ce compte.'; }
        else if (x && x.ok && x.valeur && (nombre(x.valeur.prevision) || nombre(x.valeur.prixMoy))) s.valorises++;
        else s.sansResultat++;
      }).catch(function (e) {
        s.erreurs++; s.message = 'OpenLane — ' + AMX.erreurTexte(e);
        if (s.erreurs >= 5) s.arret = true;
      }).then(function () {
        actifs--; s.faits++;
        if (!self.detruit) { self.majSync(); if (s.valorises) self.planifierRendu(2500); }
        suivant();
      });
    };
    this.majSync();
    suivant();
  };
  VueEquite.prototype.majSync = function () {
    var self = this, el = this.elSync;
    if (!el) return;
    AMX.vider(el);
    var s = this.sync && this.sync.cie === this.cie ? this.sync : null;
    var nSans = this.lignes.filter(function (r) { return r.sansValeur; }).length, n = this.lignes.length;
    var btn = function (texteB, cls, action) { return h('button.btn.petit' + (cls || ''), { type: 'button', text: texteB, onclick: action }); };
    el.className = 'eq-sync';
    if (s && s.enCours) {
      el.classList.add('encours');
      el.appendChild(h('div.eq-sync-txt', [h('b', { text: 'Valeurs OpenLane : ' }), AMX.fmtNombre(s.faits) + ' / ' + AMX.fmtNombre(s.total) + ' lues · ' + AMX.fmtNombre(s.valorises) + ' valorisée' + (s.valorises > 1 ? 's' : '') + (s.sansResultat ? ' · ' + s.sansResultat + ' sans valeur chez OpenLane' : '') + ' — les calculs se mettent à jour à mesure.']));
      el.appendChild(h('div.eq-sync-barre', [h('span', { style: { width: Math.round(100 * s.faits / Math.max(1, s.total)) + '%' } })]));
      el.appendChild(btn('Arrêter', '.fantome', function () { s.arret = true; self.majSync(); }));
      return;
    }
    if (s && s.message && s.arret) { el.classList.add('alerte'); el.appendChild(h('div.eq-sync-txt', { text: s.message })); }
    else if (!nSans) { el.classList.add('ok'); el.appendChild(h('div.eq-sync-txt', { text: 'Valeurs OpenLane à jour : les ' + AMX.fmtNombre(n) + ' comptes ont une valeur.' })); }
    else if (!this.peutLireOpenlane()) { el.appendChild(h('div.eq-sync-txt', { text: AMX.fmtNombre(nSans) + ' compte' + (nSans > 1 ? 's' : '') + ' sans valeur. ' + (AMX.openlane && AMX.openlane.enDirect && AMX.openlane.enDirect() === false ? 'OpenLane n\'est pas connecté au site : un administrateur doit recliquer le favori « Automax ← OpenLane » dans OpenLane.' : 'La lecture OpenLane demande le droit « Fiche d\'achat » ou « Changer le statut ».') })); }
    else {
      var restants = this.lignes.filter(function (r) { return r.sansValeur && !self.essayes[texte(r.compte.vin).toUpperCase()]; }).length;
      el.appendChild(h('div.eq-sync-txt', { text: s ? 'Lecture OpenLane terminée : ' + AMX.fmtNombre(s.valorises) + ' valorisée' + (s.valorises > 1 ? 's' : '') + ' sur ' + AMX.fmtNombre(s.total) + (nSans ? ' · ' + nSans + ' toujours sans valeur (OpenLane n\'a pas de ventes comparables ou le NIV est inconnu)' : '') + '.' : AMX.fmtNombre(nSans) + ' compte' + (nSans > 1 ? 's' : '') + ' sans valeur OpenLane.' }));
      el.appendChild(btn(restants ? 'Lire OpenLane (' + restants + ')' : 'Relire les comptes sans valeur', '.primaire', function () { self.synchroniser(!restants); }));
    }
  };
  VueEquite.prototype.rendreTable = function () {
    var self = this, vis = this.visibles(), contact = !!(AMX.equite.enCache() && AMX.equite.enCache().contact);
    AMX.vider(this.elTable);
    if (!vis.length) { this.elTable.appendChild(h('p.doux', { style: { padding: '14px', textAlign: 'center' }, text: this.filtres.quoi === 'cibles' ? 'Aucune cible avec ces paramètres : élargissez la marge, changez le terme, ou lisez les valeurs OpenLane des comptes sans valeur.' : 'Aucun compte ne correspond.' })); return; }
    var rows = vis.slice(0, 400).map(function (r) { return self.rangee(r, contact); });
    this.elTable.appendChild(h('table.tableau', [h('thead', [h('tr', [h('th', 'Client'), h('th', 'Véhicule actuel'), h('th', 'Contrat'), h('th.num', 'Paiement'), h('th.num', 'Valeur'), h('th.num', 'Solde'), h('th.num', 'Équité'), h('th.num', { title: 'Gros É.-U. ($ CA) = MMR × taux du jour ajusté − ajustement, comparé à la dette' }, 'É.-U. vs dette'), h('th', 'Neuf proposé'), h('th.num', 'Nouvelle mensualité'), h('th', 'Conseiller'), h('th', 'Suivi')])]), h('tbody', rows)]));
    if (vis.length > 400) this.elTable.appendChild(h('p.doux.petit', { text: '… ' + (vis.length - 400) + ' autres : affinez les filtres ou exportez.' }));
  };
  VueEquite.prototype.rangee = function (r, contact) {
    var self = this, c = r.compte;
    var cls = (r.cible ? '.cible' : '') + (r.sansValeur ? '.sans' : '');
    var contactEl = contact ? h('div.sous.eq-contact', [c.telephone ? h('a', { href: 'tel:' + c.telephone.replace(/[^\d+]/g, ''), text: c.telephone }) : null, c.courriel ? h('span', [' · ', h('a', { href: 'mailto:' + c.courriel, text: c.courriel })]) : null]) : null;
    var eqCls = r.equite === null ? '.eq-nul' : (r.equite >= 0 ? '.eq-pos' : '.eq-neg');
    var valeurEl = r.valeur !== null ? h('div', [h('div', { text: fmt$(r.valeur) }), h('div.sous', { text: 'OpenLane' + (r.kmEstime ? ' · ' + AMX.fmtNombre(r.kmEstime) + ' km est.' : '') })]) : h('div', [h('span.valeur', { text: 'à lire' }), AMX.openlane ? h('div', [h('button.btn.petit', { type: 'button', text: 'OpenLane', onclick: function (ev) { ev.stopPropagation(); self.lireUn(r); } })]) : null]);
    var autres = r.proposition && r.propositions.length > 1 ? r.propositions.filter(function (p) { return p !== r.proposition; }).map(function (p) { return p.vehicule + ' — ' + fmt$(p.mensualite) + ' / mois · ' + texteProposition(p); }).join('\n') : '';
    var neufEl = r.proposition ? h('div', { title: autres ? 'Autres scénarios DealDriver :\n' + autres : '' }, [h('div.nom', { text: r.proposition.vehicule || '—' }), h('div.sous', { text: texteProposition(r.proposition) + ' · DealDriver' + (r.propositions.length > 1 ? ' · +' + (r.propositions.length - 1) + ' autre' + (r.propositions.length > 2 ? 's' : '') : '') })])
      : r.neuf ? h('div', [h('div.nom', { text: [r.neuf.annee, r.mode !== 'bmw' ? r.neuf.v && r.neuf.v.marque : 'BMW', r.neuf.modele, r.neuf.version].filter(Boolean).join(' ') }), h('div.sous', { text: 'PDSF ' + fmt$(r.neuf.prix) + ' · ' + (r.neuf.enStock ? 'en stock' : 'en route') + (r.alternatives ? ' · +' + r.alternatives + ' autre' + (r.alternatives > 1 ? 's' : '') : '') + (r.neufVoisin ? ' · série voisine' : '') })]) : h('span.sous', { text: 'aucun ' + (r.gm ? (c.modele || 'modèle semblable') : r.serie) + ' en stock' });
    var mensEl = r.mensualite !== null ? h('div', [h('div' + (r.cible ? '.eq-pos' : ''), { text: fmt$(r.mensualite) + ' / mois' }), h('div.sous', { text: r.proposition ? (r.ecart !== null ? fmtSigne(r.ecart) + ' vs actuel · calcul GM' : 'calcul GM') : (r.sansValeur ? 'sans valeur d\'échange' : (fmtSigne(r.ecart) + ' vs actuel · financé ' + fmt$(r.finance))) })]) : h('span.eq-nul', '—');
    var selSuivi = h('select.suivi', SUIVIS_ORDRE.map(function (k) { return h('option', { value: k, text: SUIVIS[k] }); }));
    selSuivi.value = c.suivi || '';
    selSuivi.disabled = !contact;
    selSuivi.addEventListener('change', function () {
      var val = selSuivi.value, note = c.suiviNote || '';
      var fin = function (n) { selSuivi.disabled = true; AMX.equite.suivi(self.cie, c.compte, val, n).then(function () { selSuivi.disabled = false; AMX.toast('Suivi enregistré : ' + SUIVIS[val] + '.', 'ok'); self.rendre(); }).catch(function (e) { selSuivi.disabled = false; selSuivi.value = c.suivi || ''; AMX.toast('Suivi non enregistré — ' + AMX.erreurTexte(e), 'erreur'); }); };
      if (val && AMX.modale) { var ta = h('textarea.saisie', { placeholder: 'Note (facultatif) : ce qui a été dit, le véhicule proposé…', value: note }); AMX.modale({ titre: SUIVIS[val] + ' — ' + nomClient(c), corps: ta, boutons: [{ texte: 'Enregistrer', classe: 'btn primaire', action: function () { fin(ta.value); return true; } }, { texte: 'Annuler', action: function () { selSuivi.value = c.suivi || ''; return true; } }] }); }
      else fin(note);
    });
    return h('tr' + cls, [
      h('td', [h('div.nom', { text: nomClient(c) }), h('div.sous', { text: [c.ville, r.gm ? c.etatLead : c.compte].filter(Boolean).join(' · ') }), contactEl, r.ndnc ? h('div.sous.eq-neg', { text: 'Ne pas téléphoner (LCAP)', title: 'Inscrit à la Liste nationale de numéros de télécommunication exclus ou à la liste interne de la concession, selon GM Dealer Direct' }) : null]),
      h('td', [h('div', { text: vehiculeTexte(c) }), h('div.vin', { text: c.vin || '' }), c.neufUsage && /used|pre/i.test(c.neufUsage) ? h('div.sous', { text: 'acheté d\'occasion' }) : null,
        r.exportable ? h('div.eq-us', [h('span.puce.eq-us-puce', { text: 'É.-U.', title: 'NIV fabriqué aux États-Unis : le véhicule peut être vendu aux É.-U. — voir la colonne « É.-U. vs dette ».' })]) : null]),
      h('td', [h('div', { text: (r.location ? 'Location' : 'Financement') + (c.terme ? ' ' + c.terme + ' mois' : '') + (c.taux !== null && c.taux !== undefined ? ' · ' + c.taux + ' %' : '') }), h('div.sous' + (r.echeanceProche ? '.eq-neg' : ''), { text: c.echeance ? 'échéance ' + AMX.fmtDate(c.echeance) + (r.moisRestants !== null ? ' (' + r.moisRestants + ' mois)' : '') : '' }), r.location && c.kmContrat ? h('div.sous', { text: AMX.fmtNombre(c.kmContrat) + ' km au contrat' + (c.usure === 'oui' ? ' · usure' : '') }) : null]),
      h('td.num', { text: fmt$(c.paiement) }),
      h('td.num', [valeurEl]),
      h('td.num', [h('button.eq-dette', { type: 'button', text: fmt$(r.solde), title: 'Comment la dette est calculée', onclick: function () { self.detailDette(r); } }), h('div.sous', { text: texteDette(r) }), r.location && r.soldeEcheance !== null ? h('div.sous', { text: 'résiduel ' + fmt$(r.soldeEcheance) }) : null]),
      h('td.num', [h('div' + eqCls, { text: r.equite === null ? '—' : fmtSigne(r.equite) }), null, r.location && r.equiteEcheance !== null ? h('div.sous', { text: 'à l\'échéance ' + fmtSigne(r.equiteEcheance) }) : null]),
      h('td.num.eq-us-cell', [self.celluleUS(r)]),
      h('td', [neufEl]),
      h('td.num', [mensEl]),
      h('td', { text: c.conseiller || '—' }),
      h('td', [selSuivi, c.suiviNote ? h('div.suivi-note', { text: c.suiviNote }) : null, c.suiviLe ? h('div.suivi-note', { text: AMX.fmtDateCourte(c.suiviLe) + (c.suiviPar ? ' · ' + String(c.suiviPar).split('@')[0] : '') }) : null])
    ]);
  };
  /* ---- Calcul de la dette (5 nov.) : le détail d'un compte, et le bilan de la page ---- */
  VueEquite.prototype.detailDette = function (r) {
    var c = r.compte, d = r.dette || {}, lignes = [];
    var ligne = function (a, b, cls) { lignes.push(h('tr' + (cls || ''), [h('td', { text: a }), h('td.num', { text: b })])); };
    var ajd = AMX.fmtDate(iso(new Date()));
    if (d.source === 'preteur') {
      ligne((r.gm ? 'Rachat de GM' : r.mode === 'vw' ? 'Solde de VW Finance' : r.mode === 'hmf' ? 'Rachat de Hyundai Finance' : 'Solde de BMW Financial Services') + ' lu le ' + AMX.fmtDate(d.baseLe), fmt$(d.base));
      ligne(d.paiements ? d.paiements + ' mensualité' + (d.paiements > 1 ? 's' : '') + ' de ' + fmt$(d.paiement) + ' depuis (capital remboursé, intérêts courus compris)' : 'Aucune mensualité depuis la lecture (intérêts courus compris)', r.solde !== null && d.base !== null ? (r.solde <= d.base ? '−' : '+') + fmt$(Math.abs(d.base - r.solde)) : '');
    } else if (d.source === 'contrat') {
      ligne(d.n + ' mensualité' + (d.n > 1 ? 's' : '') + ' de ' + fmt$(d.paiement) + ' qui restent jusqu\'au ' + AMX.fmtDate(c.echeance), '');
      if (d.location && d.echeance !== null) ligne('Résiduel à l\'échéance', fmt$(d.echeance));
    } else if (d.source === 'fige') {
      ligne('Solde du prêteur lu le ' + AMX.fmtDate(d.baseLe) + ' (pas d\'échéance au contrat : il n\'est pas reporté)', fmt$(d.base));
    }
    ligne('Taux du contrat', d.taux !== null ? String(d.taux).replace('.', ',') + ' %' : 'inconnu (aucun intérêt compté)');
    ligne('Dette au ' + ajd, fmt$(r.solde), '.total');
    var expl = d.source === 'preteur' ? 'Le solde lu chez le prêteur est reporté à aujourd\'hui : chaque mensualité passée retire le capital qu\'elle rembourse, et les intérêts courent depuis la dernière mensualité.'
      : d.source === 'contrat' ? 'Pas de solde fourni par le prêteur pour ce contrat : la dette est la valeur, au taux du contrat, des mensualités qui restent' + (d.location ? ' et du résiduel (rachat aujourd\'hui).' : '.')
      : d.source === 'fige' ? 'Il manque l\'échéance du contrat : la dette reste celle lue chez le prêteur.'
      : 'Il manque l\'échéance ou le paiement du contrat : la dette ne peut pas être calculée. Relisez le portefeuille chez le prêteur.';
    AMX.modale({ titre: 'Dette — ' + nomClient(c), corps: h('div', [h('p.doux', { style: { margin: '0 0 8px' }, text: vehiculeTexte(c) + (c.vin ? ' · ' + c.vin : '') + ' · ' + (r.location ? 'location' : 'financement') }), h('table.eq-dette-tab', [h('tbody', lignes)]), h('p.doux.petit', { style: { margin: '10px 0 0' }, text: expl + ' Un paiement manqué ou un remboursement anticipé se voit à la prochaine lecture du prêteur.' })]), boutons: [{ texte: 'Fermer' }] });
  };
  VueEquite.prototype.calculDette = function () {
    var self = this, lignes = this.analyser(), n = { preteur: 0, contrat: 0, fige: 0, '': 0 }, total = 0, vieux = 0, depuis = 0;
    lignes.forEach(function (r) { var d = r.dette || {}; n[d.source || ''] = (n[d.source || ''] || 0) + 1; if (r.solde !== null) total += r.solde; if (d.source === 'preteur' && d.paiements) depuis++; if (d.baseLe && (Date.now() - new Date(d.baseLe + 'T12:00:00')) / 86400000 > 45) vieux++; });
    var lien = function (t) { return h('li', { text: t }); };
    var pl = function (k, un, plusieurs) { return AMX.fmtNombre(k) + ' ' + (k > 1 ? plusieurs : un); };
    var corps = h('div', [
      h('p', { style: { margin: '0 0 8px' } }, 'La dette de chaque client est recalculée automatiquement, chaque jour, à l\'ouverture de la page : rien à rouvrir chez BMW, GM ou VW.'),
      h('ul', { style: { margin: '0 0 10px', paddingLeft: '18px', lineHeight: '1.6' } }, [
        lien(pl(n.preteur, 'dette', 'dettes') + ' d\'après le solde du prêteur, reporté à aujourd\'hui' + (depuis ? ' (' + pl(depuis, 'compte', 'comptes') + ' avec des mensualités passées depuis la lecture)' : '')),
        lien(pl(n.contrat, 'dette calculée', 'dettes calculées') + ' d\'après le contrat (mensualités qui restent, + résiduel pour une location)'),
        n.fige ? lien(pl(n.fige, 'compte', 'comptes') + ' sans échéance au contrat : solde du prêteur non reporté') : null,
        n[''] ? lien(pl(n[''], 'compte', 'comptes') + ' sans échéance ni paiement : dette inconnue') : null
      ]),
      h('p', { style: { margin: '0 0 8px' } }, [h('b', { text: 'Dette totale au ' + AMX.fmtDate(iso(new Date())) + ' : ' + fmt$(total) }), ' (' + AMX.fmtNombre(lignes.length) + ' comptes de ' + nomCie(this.cie) + ').']),
      vieux ? h('p.doux.petit', { style: { margin: 0 }, text: pl(vieux, 'compte a', 'comptes ont') + ' un solde du prêteur lu il y a plus de 45 jours : le calcul reste bon tant que le client paie à temps ; une nouvelle lecture du portefeuille corrige les écarts (paiement manqué, remboursement anticipé).' }) : null,
      h('p.doux.petit', { style: { margin: '6px 0 0' }, text: 'Cliquez la dette d\'un client dans la liste pour voir son calcul.' })
    ]);
    AMX.modale({ titre: 'Calcul de la dette', corps: corps, boutons: [{ texte: 'Fermer' }, { texte: 'Recalculer maintenant', classe: 'btn primaire', action: function () { self.rendre(); AMX.toast('Dettes recalculées au ' + AMX.fmtDate(iso(new Date())) + '.', 'ok'); return true; } }] });
  };
  /** É.-U. vs dette : gros É.-U. (évaluation, sinon MMR tapé ici) − solde. Vide si le NIV n'est pas fabriqué aux É.-U. */
  VueEquite.prototype.celluleUS = function (r) {
    var self = this, c = r.compte, vin = texte(c.vin).toUpperCase();
    if (!r.exportable) return h('span.eq-nul', { text: '—', title: 'NIV pas fabriqué aux É.-U.' });
    var T = AMX.export && AMX.export.taux ? AMX.export.taux() : null;
    var lienEval = h('a.eq-us-lien', { href: AMX.lien('outils', 'evaluation', r.kmEstime ? { vin: c.vin, km: String(r.kmEstime) } : { vin: c.vin }), text: 'évaluation', title: 'Ouvre l\'évaluation : la boîte « Canada ou États-Unis ? » fait le calcul complet (profits É.-U., gros Canada, détail).' });
    var mmrEl = h('input.eq-mmr', { type: 'number', step: '100', min: '0', placeholder: 'MMR $ US', value: r.usSource === 'mmr' && r.mmr ? String(r.mmr) : '', title: 'MMR en $ US : le gros É.-U. se calcule tout de suite avec le taux du jour' + (T && T.taux ? ' (' + T.taux + ')' : '') + ', l\'écart et l\'ajustement des réglages. Gardé sur cet appareil.' });
    mmrEl.addEventListener('click', function (ev) { ev.stopPropagation(); });
    mmrEl.addEventListener('change', function () {
      var m = AMX.memo.lire('eq_mmr', {}) || {}, v = nombre(mmrEl.value);
      if (v && v > 0) m[vin] = Math.round(v); else delete m[vin];
      AMX.memo.ecrire('eq_mmr', m);
      try { mmrEl.blur(); } catch (e) {}
      self.planifierRendu(0);
    });
    if (r.grosUS === null) return h('div.eq-us-vide', [T && T.taux ? mmrEl : h('span.sous', { text: 'taux du jour…' }), h('div.sous', [lienEval])]);
    var cls = r.equiteUS === null ? '.eq-nul' : (r.equiteUS >= 0 ? '.eq-pos' : '.eq-neg');
    return h('div', { title: 'Gros É.-U. ' + fmt$(r.grosUS) + ' − dette ' + fmt$(r.solde) + (r.equite !== null ? ' ; au Canada (OpenLane) : ' + fmtSigne(r.equite) : '') }, [
      h('div' + cls, { text: r.equiteUS === null ? '—' : fmtSigne(r.equiteUS) }),
      h('div.sous', { text: 'gros É.-U. ' + fmt$(r.grosUS) }),
      h('div.sous', { text: 'dette ' + fmt$(r.solde) }),
      r.meilleurUS && r.equite !== null ? h('div.sous.eq-pos', { text: fmtSigne(r.equiteUS - r.equite) + ' vs Canada' }) : null,
      r.usSource === 'evaluation'
        ? h('div.sous', [(r.mmr ? 'MMR ' + AMX.fmtNombre(r.mmr) + ' $ US · ' : ''), lienEval, r.us && r.us.calculeLe ? ' du ' + AMX.fmtDateCourte(r.us.calculeLe) : ''])
        : h('div.sous', [mmrEl, ' ', lienEval])
    ]);
  };
  VueEquite.prototype.lireUn = function (r) {
    var self = this, c = r.compte;
    if (!AMX.openlane || !AMX.openlane.direct) return Promise.resolve();
    AMX.toast('Lecture OpenLane de ' + vehiculeTexte(c) + '…', 'ok');
    return AMX.openlane.direct(c.vin, r.kmEstime || '', { source: 'equite', compagnie: self.cie }).then(function (x) {
      if (x && x.nonConnecte) { AMX.toast(x.erreur || 'OpenLane n\'est pas connecté au site.', 'attention', 6000); return x; }
      AMX.verifier(x, 'Lecture OpenLane impossible');
      self.essayes[texte(c.vin).toUpperCase()] = 1;
      if (x && x.valeur && !nombre(x.valeur.prevision) && !nombre(x.valeur.prixMoy)) AMX.toast('OpenLane n\'a pas de valeur pour ce véhicule.', 'attention');
      self.planifierRendu(0);
      return x;
    }).catch(function (e) { AMX.toast('OpenLane — ' + AMX.erreurTexte(e), 'erreur'); });
  };
  VueEquite.prototype.exporter = function () {
    if (typeof XLSX === 'undefined') { AMX.toast('Export Excel indisponible (SheetJS non chargé).', 'erreur'); return; }
    var rows = this.visibles().map(function (r) { var c = r.compte; return { 'Client': nomClient(c), 'Téléphone': c.telephone || '', 'Courriel': c.courriel || '', 'Ville': c.ville || '', 'Compte': c.compte, 'Véhicule': vehiculeTexte(c), 'NIV': c.vin, 'Contrat': c.typeContrat, 'Terme': c.terme, 'Taux %': c.taux, 'Échéance': c.echeance, 'Mois restants': r.moisRestants, 'Paiement actuel': c.paiement, 'Valeur': r.valeur, 'Source valeur': r.valeurSource, 'Dette du jour': r.solde === null ? '' : Math.round(r.solde * 100) / 100, 'Source de la dette': texteDette(r), 'Équité': r.equite === null ? '' : Math.round(r.equite), 'Fabriqué aux É.-U.': r.exportable ? 'oui' : '', 'MMR ($ US)': r.mmr === null ? '' : r.mmr, 'Gros É.-U.': r.grosUS === null ? '' : Math.round(r.grosUS), 'Équité É.-U.': r.equiteUS === null ? '' : Math.round(r.equiteUS), 'Neuf proposé': r.proposition ? r.proposition.vehicule : (r.neuf ? [r.neuf.annee, r.neuf.modele, r.neuf.version].join(' ') : ''), 'PDSF neuf': r.neuf && !r.proposition ? r.neuf.prix : '', 'Ne pas téléphoner': r.ndnc ? 'oui' : '', 'Nouvelle mensualité': r.mensualite === null ? '' : Math.round(r.mensualite), 'Écart / mois': r.ecart === null ? '' : Math.round(r.ecart), 'Cible': r.cible ? 'oui' : '', 'Conseiller': c.conseiller || '', 'Suivi': SUIVIS[c.suivi || ''], 'Note': c.suiviNote || '' }; });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Équité');
    XLSX.writeFile(wb, 'equite-' + this.cie.toLowerCase() + '-' + iso(new Date()) + '.xlsx');
  };

  /* =====================================================================
     Relance › Équité › Importer le portefeuille : dépôt de l'export InfoBahn
     ===================================================================== */
  /* 26 oct. : favori « Automax ← InfoBahn (banque) » (mock/signet-infobahn.src.js, généré par mock/signet-infobahn-build.py). */
  var CODE_SIGNET_INFOBAHN = "javascript:(function () { var SITE = " + JSON.stringify(AMX.SITE) + "; var ORIGINE_SITE = SITE.replace(/^(https?:\\/\\/[^\\/]+).*$/, '$1'); if (!/infobahn\\.bmwgroup\\.com$/.test(location.hostname)) { alert('Cliquez ce favori dans InfoBahn (infobahn.bmwgroup.com), \u00e0 la page Payments \u203a Bank Transactions.'); return; } if (window.__amxBanque) { alert('Une lecture est d\u00e9j\u00e0 en cours dans cette page.'); return; } window.__amxBanque = true; var bande = document.createElement('div'); bande.setAttribute('style', 'position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483647;background:#0F7B4F;color:#fff;font:14px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;padding:12px 16px;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.25);display:flex;gap:12px;align-items:center;'); var etiquette = document.createElement('div'); etiquette.style.flex = '1'; var fermer = document.createElement('button'); fermer.textContent = 'Fermer'; fermer.setAttribute('style', 'background:rgba(255,255,255,.18);border:0;color:#fff;padding:6px 12px;border-radius:6px;cursor:pointer;font:inherit;'); bande.appendChild(etiquette); bande.appendChild(fermer); document.body.appendChild(bande); var pont = null; fermer.onclick = function () { bande.remove(); window.__amxBanque = false; try { if (pont && !pont.closed) pont.close(); } catch (e) {} }; function dire(t) { etiquette.textContent = 'InfoBahn (banque) \u2014 ' + t; } function erreur(t) { bande.style.background = '#B42318'; dire(t); window.__amxBanque = false; try { if (pont && !pont.closed) pont.close(); } catch (e) {} } if (!/banktransactions/i.test(location.pathname)) { erreur('ouvrez Payments \u203a Bank Transactions (menu \u2630 \u203a Payments, onglet Bank Transactions), puis recliquez le favori.'); return; } pont = window.open(SITE + 'pont.html?v=' + Date.now(), 'amxPont', 'width=460,height=240,menubar=no,toolbar=no,location=no,status=no'); if (!pont) { erreur('Chrome a bloqu\u00e9 la petite fen\u00eatre du site : autorisez les fen\u00eatres pop-up pour infobahn.bmwgroup.com, puis recliquez le favori.'); return; } var attentes = {}, compteur = 0, pret = null; window.addEventListener('message', function (ev) { if (ev.source !== pont) return; var m = ev.data || {}; if (m.type === 'amx:pret' && pret) { pret(m); pret = null; } if (m.type === 'amx:resultat' && attentes[m.id]) { attentes[m.id](m.resultat); delete attentes[m.id]; } }); function attendrePont() { return new Promise(function (res, rej) { var fini = false, essais = 0; pret = function (m) { fini = true; res(m); }; (function ping() { if (fini) return; essais++; try { pont.postMessage({ type: 'amx:ping' }, ORIGINE_SITE); } catch (e) {} if (pont.closed) { rej(new Error('La petite fen\u00eatre du site a \u00e9t\u00e9 ferm\u00e9e : recliquez le favori et laissez-la ouverte.')); return; } if (essais > 60) { rej(new Error('Le site d\\'inventaire ne r\u00e9pond pas.')); return; } setTimeout(ping, 500); })(); }); } function envoyer(corps) { return new Promise(function (res) { var id = 'lot' + (++compteur); attentes[id] = res; pont.postMessage({ type: 'amx:lot', id: id, corps: corps }, ORIGINE_SITE); setTimeout(function () { if (attentes[id]) { delete attentes[id]; res({ ok: false, erreur: 'Pas de r\u00e9ponse du site (d\u00e9lai).' }); } }, 280000); }); } function texte(e) { return String((e && (e.innerText || e.textContent)) || '').replace(/\\s+/g, ' ').trim(); } function lireTableau() { var tete = document.querySelectorAll('mat-header-cell').length ? 'mat-header-cell' : 'thead th', rangs = document.querySelectorAll('mat-row').length ? 'mat-row' : 'tbody tr'; var entetes = Array.prototype.map.call(document.querySelectorAll(tete), function (c) { return texte(c).toLowerCase(); }); var idx = function (re, defaut) { for (var i = 0; i < entetes.length; i++) if (re.test(entetes[i])) return i; return defaut; }; var iNom = idx(/customer/, 0), iCompte = idx(/account number/, 1), iVin = idx(/^vin/, 2), iType = idx(/^type/, 3), iBanque = idx(/bank account/, 4), iDate = idx(/date/, 5), iMontant = idx(/amount/, 6); var lignes = []; Array.prototype.forEach.call(document.querySelectorAll(rangs), function (r) { var el = r.querySelectorAll('mat-cell, td'), c = Array.prototype.map.call(el, texte); if (c.length < 7 || !/\\d{1,2}\\/\\d{1,2}\\/\\d{4}/.test(c[iDate] || '')) return; var montant = c[iMontant] || '', cm = el[iMontant]; var signe = cm && cm.querySelector('.fa-minus, .minus') ? -1 : (cm && cm.querySelector('.fa-plus, .plus') ? 1 : 0); var neg = signe ? signe < 0 : (/[\\u2212-]/.test(montant) || /payoff/i.test(c[iType] || '')); lignes.push({ nom: c[iNom], compte: c[iCompte], vin: c[iVin], type: c[iType], banque: c[iBanque], date: c[iDate], montant: (neg ? '-' : '') + montant.replace(/[\u2212+-]/g, '').trim() }); }); return lignes; } (async function () { try { dire('ouverture du pont vers le site\u2026'); var p = await attendrePont(); if (!p.connecte) { erreur('Vous n\\'\u00eates pas connect\u00e9 au site d\\'inventaire dans ce navigateur : ouvrez ' + SITE + ' dans un onglet, connectez-vous, puis recliquez le favori.'); return; } var lignes = lireTableau(); if (!lignes.length) { erreur('Aucune transaction dans le tableau : choisissez une p\u00e9riode (Date Range \u203a Filter), puis recliquez le favori.'); return; } dire(lignes.length + ' transactions lues \u2014 envoi au site (dates de d\u00e9bours\u00e9, liens pay\u00e9s)\u2026'); var rep = await envoyer({ action: 'banqueImporter', compagnie: 'BMW', lignes: lignes }); if (rep && rep.refuse && !rep.erreur) throw new Error('Votre session du site d\\'inventaire a expir\u00e9 : reconnectez-vous, puis recliquez le favori.'); if (!rep || rep.ok === false || rep.refuse) throw new Error('Le site a refus\u00e9 l\\'envoi : ' + ((rep && rep.erreur) || 'erreur inconnue')); if (rep.vehicules && rep.nouvelles === undefined) throw new Error('Le script du site n\\'est pas \u00e0 jour (Banque.gs) : il faut le d\u00e9ployer.'); var al = (rep.alertes || []).length; dire('termin\u00e9 : ' + lignes.length + ' lues, ' + rep.nouvelles + ' nouvelles \u00b7 ' + rep.deboursements + ' date(s) de d\u00e9bours\u00e9 inscrite(s) au livre \u00b7 ' + rep.liens + ' lien(s) pay\u00e9(s) not\u00e9(s)' + (rep.sansVente ? ' \u00b7 ' + rep.sansVente + ' sans vente (repris au prochain passage)' : '') + (al ? ' \u00b7 \u26a0 ' + al + ' montant(s) en double : courriel envoy\u00e9' : '') + (rep.erreurs && rep.erreurs.length ? ' \u00b7 ' + rep.erreurs.length + ' erreur(s) : ' + rep.erreurs[0] : '') + '.'); if (al) bande.style.background = '#B54708'; window.__amxBanque = false; setTimeout(function () { try { if (!pont.closed) pont.close(); } catch (e) {} }, 1500); } catch (e) { erreur('Arr\u00eat : ' + (e && e.message || e)); } })(); })();";
  var CODE_SIGNET_HMF = "javascript:(function () { var SITE = " + JSON.stringify(AMX.SITE) + "; var ORIGINE_SITE = SITE.replace(/^(https?:\\/\\/[^\\/]+).*$/, '$1'); var DELAI_MS = 60000, TAILLE_LOT = 400, PAGE_CSI = 500; var hote = location.hostname; var PASSAGE = new Date().toISOString(); var mode = /hyundai-corp\\.io$/.test(hote) ? 'portail' : (/boostcx\\.com$/.test(hote) ? 'csi' : (/owb\\.vsp\\.autopartners\\.net$/.test(hote) ? 'owb' : (/field-reporting\\.inmoment\\.com$/.test(hote) ? 'inmoment' : (/salesreporting\\.bmwgroup\\.ca$/.test(hote) ? 'rdr' : (/^ivsrfe(-[a-z]+)?\\.bmwgroup\\.com$/.test(hote) ? 'ivsr' : (/(^|\\.)confirmit\\.ca$/.test(hote) ? 'forsta' : (/(^|\\.)vwhub\\.com$/.test(hote) ? 'omc' : (/(^|\\.)vwexperience\\.vw\\.ca$/.test(hote) ? 'cemvw' : (/(^|\\.)gmdealerdirect\\.ca$/.test(hote) ? 'gmdd' : (/^dealerportal\\.vwfinance\\.ca$/.test(hote) ? 'vwf' : (/(^|\\.)hmfdealer\\.ca$/.test(hote) ? 'hmf' : ''))))))))))); if (!mode) { alert('Cliquez ce signet, connect\u00e9, sur un portail du constructeur : portail des ventes Hyundai, BoostCX, L\\'utilitaire des commandes GM (owb.vsp.autopartners.net), l\\'ISC GM (field-reporting.inmoment.com), le portail RDR BMW (salesreporting.bmwgroup.ca), IVS-R Ordering BMW (ivsrfe.bmwgroup.com, Order Locator) le CSI BMW Forsta (horizons.confirmit.ca), la console OMC de VW (www.vwhub.com) le portail 5-Star CEM de VW (reporting.vwexperience.vw.ca) GM Dealer Direct (www.gmdealerdirect.ca) le Dealer Extranet de VW Finance (dealerportal.vwfinance.ca, Portfolio Manager) ou le portail de Hyundai Finance (www.hmfdealer.ca, Customer Portfolio).'); return; } if (window.__amxHyundai) { alert('Une lecture est d\u00e9j\u00e0 en cours dans cette page.'); return; } window.__amxHyundai = true; var passage = (window.__amxHyundaiPassage = (window.__amxHyundaiPassage || 0) + 1); var bande = document.createElement('div'); bande.setAttribute('style', 'position:fixed;left:16px;right:16px;bottom:16px;top:auto;width:auto;height:auto;max-height:40vh;box-sizing:border-box;z-index:2147483647;background:#0F7B4F;color:#fff;font:14px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;padding:12px 16px;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.35);display:flex;gap:14px;align-items:center;'); var etiquette = document.createElement('div'); etiquette.style.flex = '1'; var barre = document.createElement('div'); barre.setAttribute('style', 'height:6px;background:rgba(255,255,255,.25);border-radius:3px;margin-top:6px;overflow:hidden;'); var rempli = document.createElement('div'); rempli.setAttribute('style', 'height:100%;width:0;background:#fff;transition:width .3s;'); barre.appendChild(rempli); var boite = document.createElement('div'); boite.style.flex = '1'; boite.appendChild(etiquette); boite.appendChild(barre); var fermer = document.createElement('button'); fermer.textContent = 'Fermer'; fermer.setAttribute('style', 'background:rgba(255,255,255,.18);border:0;color:#fff;padding:6px 12px;border-radius:6px;cursor:pointer;font:inherit;'); var arrete = false; fermer.onclick = function () { arrete = true; bande.remove(); window.__amxHyundai = false; try { if (window.__amxPont && !window.__amxPont.closed) window.__amxPont.close(); } catch (e) {} }; bande.appendChild(boite); bande.appendChild(fermer); document.body.appendChild(bande); var titre = { portail: 'Portail Hyundai', csi: 'CSI Hyundai', owb: 'Portail GM', inmoment: 'CSI GM', rdr: 'Portail BMW', ivsr: 'IVS-R BMW', forsta: 'CSI BMW', omc: 'Portail VW', cemvw: 'CSI VW', gmdd: 'GM Dealer Direct', vwf: 'VW Finance', hmf: 'Hyundai Finance' }[mode]; function dire(t, pct) { etiquette.textContent = titre + ' \u2014 ' + t; if (pct !== undefined) rempli.style.width = Math.max(0, Math.min(100, pct)) + '%'; } function erreur(t) { bande.style.background = '#B42318'; dire(t, 100); window.__amxHyundai = false; try { if (window.__amxPont && !window.__amxPont.closed) window.__amxPont.close(); } catch (e) {} } var pont = window.open(SITE + 'pont.html?v=' + Date.now(), 'amxPont', 'width=460,height=240,menubar=no,toolbar=no,location=no,status=no'); if (!pont) { erreur('Chrome a bloqu\u00e9 la petite fen\u00eatre du site : autorisez les fen\u00eatres pop-up pour ' + hote + ' (ic\u00f4ne \u00e0 droite de la barre d\\'adresse), puis recliquez le signet.'); return; } window.__amxPont = pont; var attentes = {}, compteur = 0, pret = null; window.addEventListener('message', function (ev) { if (ev.source !== pont) return; var m = ev.data || {}; if (m.type === 'amx:pret' && pret) { pret(m); pret = null; } if (m.type === 'amx:resultat' && attentes[m.id]) { attentes[m.id](m.resultat); delete attentes[m.id]; } }); function attendrePont() { return new Promise(function (res, rej) { var fini = false; pret = function (m) { fini = true; res(m); }; var essais = 0; (function ping() { if (fini) return; essais++; try { pont.postMessage({ type: 'amx:ping' }, ORIGINE_SITE); } catch (e) {} if (pont.closed) { rej(new Error('La petite fen\u00eatre du site a \u00e9t\u00e9 ferm\u00e9e : recliquez le signet et laissez-la ouverte.')); return; } if (essais > 60) { rej(new Error('Le site d\\'inventaire ne r\u00e9pond pas.')); return; } setTimeout(ping, 500); })(); }); } function fermerPontPlusTard() { setTimeout(function () { try { if (window.__amxHyundaiPassage === passage && !pont.closed) pont.close(); } catch (e) {} }, 1500); } function lecture(requete) { return new Promise(function (res) { var id = 'lec' + (++compteur); attentes[id] = res; pont.postMessage({ type: 'amx:lecture', id: id, requete: requete }, ORIGINE_SITE); setTimeout(function () { if (attentes[id]) { delete attentes[id]; res({ ok: false, erreur: 'Pas de r\u00e9ponse du site (d\u00e9lai).' }); } }, 60000); }); } function envoyer(corps) { return new Promise(function (res) { var id = 'lot' + (++compteur); attentes[id] = res; pont.postMessage({ type: 'amx:lot', id: id, corps: corps }, ORIGINE_SITE); setTimeout(function () { if (attentes[id]) { delete attentes[id]; res({ ok: false, erreur: 'Pas de r\u00e9ponse du site (d\u00e9lai).' }); } }, 240000); }); } function verifier(rep, quoi) { if (rep && rep.refuse && !rep.erreur) throw new Error('Votre session du site d\\'inventaire a expir\u00e9 : reconnectez-vous sur ' + SITE + ' dans un onglet, puis recliquez le signet.'); if (!rep || rep.ok === false || rep.refuse) throw new Error('Le site a refus\u00e9 ' + quoi + ' : ' + ((rep && rep.erreur) || 'erreur inconnue')); return rep; } function appel(url, opts) { opts = opts || {}; var ctl = (typeof AbortController === 'function') ? new AbortController() : null; var minuterie = ctl ? setTimeout(function () { ctl.abort(); }, DELAI_MS) : null; var entetes = opts.entetes || { Accept: 'application/json' }; return fetch(url, { method: opts.corps ? 'POST' : 'GET', credentials: opts.credentials || 'include', headers: entetes, body: opts.corps, signal: ctl ? ctl.signal : undefined }) .then(function (r) { if (minuterie) clearTimeout(minuterie); if (r.status === 401 || r.status === 403) { var e = new Error('session refus\u00e9e (' + r.status + ') : reconnectez-vous, puis recliquez le signet'); e.session = true; throw e; } if (!r.ok) throw new Error('HTTP ' + r.status); return r.text().then(function (t) { if (/<html/i.test(t.slice(0, 200))) { var e2 = new Error('la page de connexion a r\u00e9pondu \u00e0 la place des donn\u00e9es : reconnectez-vous, puis recliquez le signet'); e2.session = true; throw e2; } try { return t ? JSON.parse(t) : null; } catch (e3) { throw new Error('r\u00e9ponse illisible'); } }); }, function (e) { if (minuterie) clearTimeout(minuterie); throw new Error(e && e.name === 'AbortError' ? 'd\u00e9lai d\u00e9pass\u00e9' : (e && e.message || String(e))); }); } function texte(v) { return v === null || v === undefined ? '' : String(v).trim(); } function nombre(v) { if (v === null || v === undefined || v === '') return null; if (typeof v === 'number') return isNaN(v) ? null : v; var n = parseFloat(String(v).replace(/[^0-9.\\-]/g, '')); return isNaN(n) ? null : n; } function dateSap(v) { var s = texte(v); if (!s || /^0000/.test(s)) return ''; var m = /\\/Date\\((-?\\d+)\\)\\//.exec(s); if (m) return iso(new Date(parseInt(m[1], 10))); return s.slice(0, 10); } function iso(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); } function yyyymmdd(d) { return iso(d).replace(/-/g, ''); } function ilYa(jours) { return new Date(Date.now() - jours * 86400000); } function alerteVentes(rv) { var r = rv && rv.resume; return r && r.retraitRefuse ? ' \u26a0 Lecture partielle des ventes : ' + r.retraitRefuse + ' RDR connus du site n\\'ont pas \u00e9t\u00e9 revus \u2014 ils sont conserv\u00e9s ; relancez le favori plus tard.' : ''; } function lots(liste, taille) { var out = []; for (var i = 0; i < liste.length; i += taille) out.push(liste.slice(i, i + taille)); return out; } function vwCadre(chemin, opts) { return new Promise(function (res, rej) { var f = document.createElement('iframe'); f.setAttribute('style', 'position:fixed;width:1400px;height:900px;left:-3000px;top:0;opacity:0;pointer-events:none;border:0;'); f.src = chemin; document.body.appendChild(f); var recus = [], debut = Date.now(), pose = false, fini = false; var finir = function (err) { if (fini) return; fini = true; try { f.remove(); } catch (e) {} if (err) rej(err); else res(recus); }; (function sonder() { if (fini) return; if (arrete) { finir(new Error('arr\u00eat\u00e9')); return; } try { var w = f.contentWindow; if (!pose && w && w.location && w.location.href.indexOf(opts.dans) >= 0 && w.XMLHttpRequest) { pose = true; var P = w.XMLHttpRequest.prototype, op = P.open, se = P.send; P.open = function (m, u) { var url = String(u); if (opts.url) url = opts.url(url); this.__amx = url; arguments[1] = url; return op.apply(this, arguments); }; P.send = function (b) { var x = this; if (opts.corps && typeof b === 'string') { b = opts.corps(x.__amx, b); arguments[0] = b; } var corpsEnvoye = typeof b === 'string' ? b : ''; x.addEventListener('load', function () { recus.push({ url: x.__amx, texte: x.responseText || '', corpsEnvoye: corpsEnvoye }); }); return se.apply(this, arguments); }; } } catch (e) {} if (pose && opts.pret(recus)) { setTimeout(function () { finir(); }, opts.marge || 800); return; } if (Date.now() - debut > (opts.delai || 90000)) { finir(new Error('la page ' + chemin + ' ne s\\'est pas charg\u00e9e (d\u00e9lai)')); return; } setTimeout(sonder, pose ? 300 : 5); })(); }); } function hmfNom(s) { return texte(s).toLowerCase().replace(/(^|[\\s\\-])([a-z\u00e0-\u00ff])/g, function (m, a, b) { return a + b.toUpperCase(); }).replace(/\\b(Ev|Hev|Phev|Xrt|N)\\b/g, function (m) { return m.toUpperCase(); }); } function hmfParMois(montant, freq) { var n = nombre(montant); if (n === null) return null; var f = texte(freq).toLowerCase(); if (/bi-?weekly|deux semaines/.test(f)) return Math.round(n * 26 / 12 * 100) / 100; if (/weekly|semaine/.test(f)) return Math.round(n * 52 / 12 * 100) / 100; return n; } function hmfCompte(a) { var compte = texte(a && a.accountNumber); if (!compte) return null; var loc = /lease/i.test(texte(a.financeType)); var prolonge = a.isMaturityDateExtended === true || a.isMaturityDateExtended === 'true'; var listes = []; if (prolonge) listes.push('\u00c9ch\u00e9ance prolong\u00e9e'); if (texte(a.overterm) === 'Y') listes.push('D\u00e9passement de terme'); if (texte(a.payoffRequestedDate)) listes.push('Rachat demand\u00e9 le ' + texte(a.payoffRequestedDate)); if (a.vehicleProgramFlag === true) listes.push('Programme du constructeur'); if (a.preApprovalProgramFlag === true) listes.push('Pr\u00e9-approuv\u00e9'); var valeur = nombre(a.currentMarketValue), rachat = nombre(a.payoutAmount) !== null ? nombre(a.payoutAmount) : nombre(a.remainingBalance); return { compte: compte, nom: texte(a.applicantName), prenom: '', cosignataire: texte(a.coApplicantName), telephone: texte(a.applicantPhone || a.applicantMobilePhone), telephoneTravail: texte(a.applicantOtherPhone), courriel: texte(a.applicantEmail), ville: hmfNom(a.applicantPersonMailingCity), province: texte(a.applicantPersonalMailingStateCode || a.applicantPersonalMailingState), codePostal: texte(a.applicantPersonalMailingPostalCode), vin: texte(a.vin).toUpperCase(), annee: texte(a.year), marque: hmfNom(a.make), modele: hmfNom(a.model), version: texte(a.trim), vehicule: texte(a.vehicleName), neufUsage: { New: 'Neuf', Used: 'Occasion', DEMO: 'D\u00e9mo', CPO: 'Certifi\u00e9' }[texte(a.vehicleType)] || texte(a.vehicleType), typeContrat: loc ? 'Location' : 'Financement', terme: nombre(a.leaseLoanTerm), dateContrat: texte(a.contractDate), echeance: texte(prolonge && a.extendedMaturityDate ? a.extendedMaturityDate : a.maturityDate), kmContrat: loc ? nombre(a.contractMileage) : null, taux: null, paiement: hmfParMois(a.afterTaxPayment, a.paymentFrequency), residuel: loc ? nombre(a.residualValue) : null, depot: nombre(a.securityDeposit), valeurBmw: valeur, payoffBmw: rachat, equiteBmw: valeur !== null && rachat !== null ? Math.round(valeur - rachat) : null, garantieProlongee: a.warranty === true ? 'oui' : (a.warranty === false ? 'non' : ''), autresProduits: ['gap', 'creditLife', 'accidentHealth', 'appearance'].some(function (k) { return a[k] === true; }) ? 'oui' : 'non', usure: a.excessWear === true ? 'oui' : 'non', statut: texte(a.accountStatus) || 'Active', pdsf: nombre(a.vehicleMsrp), listes: listes, etatLead: texte(a.intentEDW) }; } async function passageHmf() { if (!/^\\/hmfdp\\/s\\//.test(location.pathname)) { erreur('Ouvrez le portail de Hyundai Finance (www.hmfdealer.ca), page \u00ab Customer Portfolio \u00bb, puis recliquez le favori.'); return; } dire('lecture du portefeuille (Customer Portfolio)\u2026', 5); var recus = await vwCadre('/hmfdp/s/', { dans: '/hmfdp/s', delai: 150000, marge: 200, pret: function (r) { return r.some(function (x) { return /fetchLoggedInUserAccount/.test(x.url); }); } }); var rep = recus.filter(function (x) { return /fetchLoggedInUserAccount/.test(x.url); })[0], j = null; try { j = JSON.parse(rep.texte); } catch (e) {} if (!j || !Array.isArray(j.actions)) throw new Error('r\u00e9ponse du portefeuille illisible : rechargez la page Customer Portfolio, puis recliquez le favori'); var brut = null, nom = '', idCompte = ''; j.actions.forEach(function (a) { var v = a && a.returnValue; if (Array.isArray(v) && v.length && v[0] && typeof v[0] === 'object' && 'accountNumber' in v[0]) brut = v; if (v && typeof v === 'object' && !Array.isArray(v) && v.Account && v.Account.Name) { nom = texte(v.Account.Name); idCompte = texte(v.AccountId || v.Account.Id); } }); if (j.actions.some(function (a) { return a && a.state === 'ERROR'; }) && !brut) throw new Error('Hyundai Finance a refus\u00e9 la lecture : reconnectez-vous au portail, puis recliquez le favori'); if (!brut || !brut.length) throw new Error('aucun contrat dans Customer Portfolio'); if (!nom) nom = 'Hyundai Longueuil'; var liste = brut.map(hmfCompte).filter(Boolean); var LOT = 300, resume = {}; for (var i = 0; i < liste.length; i += LOT) { if (arrete) return; var dernier = i + LOT >= liste.length; dire('envoi au site \u00b7 ' + Math.min(i + LOT, liste.length) + ' / ' + liste.length + '\u2026', 20 + Math.round(76 * Math.min(1, (i + LOT) / liste.length))); var r = verifier(await envoyer({ action: 'constructeurImporter', source: 'hmf', dealer: 'hmf-' + idCompte, nomConcession: nom, phase: 'portefeuille', lignes: liste.slice(i, i + LOT), dernier: dernier, passage: PASSAGE }), 'le portefeuille'); if (!r.resume && r.vehicules) throw new Error('le script du site n\\'est pas \u00e0 jour (Equite.gs) : il faut le d\u00e9ployer'); if (dernier) resume = r.resume || {}; } var nLoc = liste.filter(function (c) { return c.typeContrat === 'Location'; }).length, nEq = liste.filter(function (c) { return c.equiteBmw !== null && c.equiteBmw > 0; }).length; dire('termin\u00e9 : ' + nom + ' \u2014 ' + liste.length + ' contrats actifs de Hyundai Finance (' + (liste.length - nLoc) + ' pr\u00eats, ' + nLoc + ' locations), ' + nEq + ' en \u00e9quit\u00e9 positive selon Hyundai Finance' + (resume.inactives ? ', ' + resume.inactives + ' contrat(s) termin\u00e9(s)' : '') + '. Voir Relance \u203a \u00c9quit\u00e9 sur le site.', 100); } (async function () { try { if (mode !== 'hmf') { erreur('Ce favori sert au portail de Hyundai Finance (www.hmfdealer.ca), page \u00ab Customer Portfolio \u00bb.'); return; } dire('ouverture du pont vers le site\u2026', 2); var p = await attendrePont(); if (!p.connecte) { erreur('Vous n\\'\u00eates pas connect\u00e9 au site d\\'inventaire dans ce navigateur : ouvrez ' + SITE + ' dans un onglet, connectez-vous, puis recliquez le signet.'); return; } await passageHmf(); window.__amxHyundai = false; fermerPontPlusTard(); } catch (e) { erreur('Arr\u00eat : ' + (e && e.message || e)); } })(); })();";
  (AMX.signets = AMX.signets || {}).hmf = { nom: 'Automax ← Hyundai Finance', code: CODE_SIGNET_HMF };   /* 6 nov. : favori autonome (CSP de Hyundai Finance) */
  (AMX.signets = AMX.signets || {}).infobahn = { nom: 'Automax ← InfoBahn (banque)', code: CODE_SIGNET_INFOBAHN };   /* 27 oct. : registre des favoris (Outils › Imports) */
  /* 4 nov. (Maxime : « je vois la procédure BMW dans VW dans Équité ») : la page suit la concession choisie en haut du site.
     BMW (ou tout le groupe) = dépôt de l'export InfoBahn ; GM (Ste-Marie, Hawkesbury) et VW = le favori dans leur portail. */
  function cieImport() { var c = AMX.compagnieChoisie ? AMX.compagnieChoisie('inventaire') : ''; return (c && modeCie(c) !== 'bmw') ? c : 'BMW'; }
  function ImportPortefeuille(ctx) {
    injecterCss();
    this.ctx = ctx || {};
    this.cie = cieImport();
    this.lu = null; this.nomFichier = '';
    this.el = h('div.page.etroite.outils-page.eq-page', { 'data-etat': 'attente' });
    this.construire();
    var self = this;
    this.surCie = function () { var c = cieImport(); if (c === self.cie || !self.el.isConnected) return; self.cie = c; self.lu = null; self.nomFichier = ''; self.construire(); };
    document.addEventListener('amx:compagnie', this.surCie);
  }
  AMX.vues = AMX.vues || {};
  AMX.vues.ImportPortefeuille = ImportPortefeuille;
  ImportPortefeuille.prototype.demonter = function () { document.removeEventListener('amx:compagnie', this.surCie); };
  ImportPortefeuille.prototype.naviguer = function () {};
  ImportPortefeuille.prototype.construire = function () {
    var self = this;
    AMX.vider(this.el);
    this.el.setAttribute('data-etat', 'attente');
    this.elEtat = h('div');
    AMX.equite.charger().then(function () { self.rendreEtat(); }, function () { self.rendreEtat(); });
    if (modeCie(this.cie) !== 'bmw') { this.construirePortail(); return; }
    this.construireBmw();
    this.chargerBanque();
  };
  /* GM Dealer Direct ou VW Finance : rien à déposer, le favori « Automax ← Constructeur » lit le portail et envoie au site. */
  ImportPortefeuille.prototype.construirePortail = function () {
    var vw = estVw(this.cie), hmf = estHmf(this.cie), nom = nomCie(this.cie), url = URL_PORTAIL[modeCie(this.cie)], portail = NOM_PORTAIL[modeCie(this.cie)];
    var sig = AMX.signets && (hmf ? AMX.signets.hmf : AMX.signets.constructeur);   /* 6 nov. : Hyundai Finance refuse les scripts d'un autre site → favori autonome */
    var signet = sig ? h('a.btn', { href: sig.code, text: sig.nom, title: 'Glissez ce bouton dans votre barre de favoris (une seule fois)', draggable: 'true', onclick: function (e) { e.preventDefault(); AMX.toast('Glissez ce bouton dans la barre de favoris de Chrome, puis cliquez-le dans le portail.', 'attention', 5000); } }) : null;
    var etapes = hmf ? [
      h('li', ['Ouvrez ', h('a', { href: url, target: '_blank', rel: 'noopener', text: 'Hyundai Finance › Customer Portfolio' }), ' (www.hmfdealer.ca, connecté au nom de ' + nom + ').']),
      h('li', 'Cliquez le favori « Automax ← Hyundai Finance » dans votre barre de favoris (pas « Automax ← Constructeur » : le portail de Hyundai Finance le bloque). Il lit tous les prêts et les locations actifs de Hyundai Finance (paiement, solde, rachat, résiduel, échéance) et les envoie au site, en une minute environ.'),
      h('li', 'Laissez l\'onglet ouvert jusqu\'à la bande verte « terminé ». Relisez une fois par semaine : les contrats terminés sortent tout seuls.')
    ] : vw ? [
      h('li', ['Ouvrez ', h('a', { href: url, target: '_blank', rel: 'noopener', text: 'VW Finance › Portfolio Manager' }), ' (Dealer Extranet, connecté au nom de ' + nom + '), onglet « Active Contracts ».']),
      h('li', 'Cliquez le favori « Automax ← Constructeur » dans votre barre de favoris. Il lit les prêts et les locations qui finissent dans les 12 prochains mois, puis la fiche de chaque client, et envoie au site toutes les 20 fiches.'),
      h('li', 'Laissez l\'onglet ouvert pendant la lecture (environ 20 minutes pour 300 contrats). Si VW vous déconnecte, reconnectez-vous, rouvrez Portfolio Manager et recliquez le favori : il reprend où il était.')
    ] : [
      h('li', ['Ouvrez ', h('a', { href: url, target: '_blank', rel: 'noopener', text: 'GM Dealer Direct' }), ' connecté au nom de ' + nom + ' (le compte de la concession).']),
      h('li', 'Cliquez le favori « Automax ← Constructeur » dans votre barre de favoris, sur n\'importe quelle page de GM Dealer Direct. Il lit les clients en location de la Financière GM et leur fiche (environ 3 minutes).')
    ];
    if (signet) etapes.push(h('li', ['Pas encore le favori ? Glissez une fois ce bouton dans la barre de favoris : ', signet]));
    this.el.appendChild(h('div.entete-page', [h('div', { style: { minWidth: 0 } }, [h('h1', 'Portefeuille ' + (hmf ? 'Hyundai Finance' : vw ? 'VW Finance' : 'Financière GM') + ' — ' + nom), h('p', hmf ? 'Tous les prêts et les locations actifs de Hyundai Motor Finance, lus dans le portail des concessionnaires : la base de Relance › Équité pour ' + nom + '.' : vw ? 'Les prêts et les locations de VW Credit Canada qui finissent dans les 12 prochains mois : la base de Relance › Équité pour ' + nom + '.' : 'Les clients en location de la Financière GM, lus dans GM Dealer Direct : la base de Relance › Équité pour ' + nom + '.')])]));
    this.el.appendChild(h('div.carte', [h('div.carte-entete', [h('h2', 'Dernier import')]), h('div.carte-corps', [this.elEtat])]));
    this.el.appendChild(h('div.carte', [h('div.carte-entete', [h('h2', 'Lire le portefeuille')]), h('div.carte-corps', [h('ol.eq-etapes', etapes), h('div.actions-ligne', { style: { marginTop: '12px' } }, [h('a.btn.primaire', { href: url, target: '_blank', rel: 'noopener', html: I.externe + '<span>Ouvrir ' + portail + '</span>' })])])]));
    this.el.appendChild(h('p.outils-note', 'Rien n\'est écrit dans le portail : le favori lit seulement. La valeur des véhicules vient d\'OpenLane, jamais du prêteur. Pour BMW Sherbrooke (export InfoBahn), choisissez BMW Sherbrooke en haut de la page.'));
  };
  ImportPortefeuille.prototype.construireBmw = function () {
    var self = this;
    var input = h('input', { type: 'file', id: 'eq-fichier', accept: '.xls,.xlsx,.csv,.html,.htm' });
    input.addEventListener('change', function () { if (input.files && input.files[0]) self.lireFichier(input.files[0]); });
    var zone = h('label.eq-zone', { 'for': 'eq-fichier' }, [h('div', { text: 'Déposez ici le fichier « SearchResults.xls » exporté d\'InfoBahn, ou cliquez pour le choisir.' }), input]);
    ['dragenter', 'dragover'].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('survol'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove('survol'); }); });
    zone.addEventListener('drop', function (e) { var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) self.lireFichier(f); });
    this.elZone = zone;
    this.elResume = h('div');
    this.btnEnvoyer = h('button.btn.primaire', { type: 'button', id: 'eq-envoyer', disabled: 'disabled', text: 'Envoyer au site' });
    this.btnEnvoyer.addEventListener('click', function () { self.envoyer(); });
    [
      h('div.entete-page', [h('div', { style: { minWidth: 0 } }, [h('h1', 'Portefeuille BMW (InfoBahn)'), h('p', 'Les clients financés ou en location chez BMW Financial Services, avec le solde et la valeur estimés par BMW : la base de Relance › Équité (clients à relancer).')])]),
      h('div.carte', [h('div.carte-entete', [h('h2', 'Dernier import')]), h('div.carte-corps', [this.elEtat])]),
      h('div.carte', [h('div.carte-entete', [h('h2', '1. Exporter le portefeuille d\'InfoBahn')]), h('div.carte-corps', [
        h('ol.eq-etapes', [
          h('li', ['Ouvrez ', h('a', { href: 'https://infobahn.bmwgroup.com/ngxca/portfolio', target: '_blank', rel: 'noopener', text: 'InfoBahn › Portfolio' }), ' (connecté, concession BMW Sherbrooke).']),
          h('li', 'À droite, « Search for a set of customers » : Entire Portfolio › Search (statut Active).'),
          h('li', 'En haut à droite de la liste, le menu « … » › Export : le fichier SearchResults.xls arrive dans Téléchargements.')
        ])
      ])]),
      h('div.carte', [h('div.carte-entete', [h('h2', '2. Déposer le fichier ici')]), h('div.carte-corps', [zone, this.elResume, h('div.actions-ligne', { style: { marginTop: '12px' } }, [this.btnEnvoyer])])]),
      this.construireBanque(),
      h('p.outils-note', 'Rien n\'est modifié dans InfoBahn. Les coordonnées des clients ne sont visibles sur le site que pour les comptes qui peuvent lire les portails (fiche d\'achat, changer le statut, gérer les utilisateurs). Usage interne seulement.')
    ].forEach(function (x) { self.el.appendChild(x); });
  };
  /* 26 oct. (Maxime : « dans InfoBahn va chercher les bank transactions pour avoir les dates de déboursé et inscris-les
     automatiquement ; les + sont des paiements, les − des liens payés ; un montant qui revient deux fois → courriel à Claude
     et Caroline ») : carte du favori et état du dernier passage (GET ?banqueBmw=1, Banque.gs). */
  ImportPortefeuille.prototype.construireBanque = function () {
    this.elBanque = h('div', { text: 'Chargement…' });
    var signet = CODE_SIGNET_INFOBAHN ? h('a.btn.primaire', { href: CODE_SIGNET_INFOBAHN, text: 'Automax ← InfoBahn (banque)', title: 'Glissez ce bouton dans votre barre de favoris', draggable: 'true', onclick: function (e) { e.preventDefault(); AMX.toast('Glissez ce bouton dans la barre de favoris de Chrome, puis cliquez-le dans InfoBahn.', 'info', 7000); } }) : null;
    return h('div.carte#eq-banque', [h('div.carte-entete', [h('h2', '3. Transactions bancaires (déboursés et liens payés)')]), h('div.carte-corps', [
      h('ol.eq-etapes', [
        h('li', ['Glissez une fois ce bouton dans la barre de favoris : ', signet || h('span', '(favori à générer)')]),
        h('li', ['Dans ', h('a', { href: 'https://infobahn.bmwgroup.com/ngxca/payments/banktransactions', target: '_blank', rel: 'noopener', text: 'InfoBahn › Payments › Bank Transactions' }), ' (connecté, BMW Sherbrooke), choisissez la période au besoin, puis cliquez le favori.']),
        h('li', 'Les « + » (Initial Disbursement) inscrivent la date de déboursé dans la comptabilité du livre (si la case est vide) ; les « − » (Dealer Payoff) sont notés comme liens payés sur la vente du véhicule d\'échange. Un même montant qui revient deux fois envoie un courriel à Claude Poulin et à Caroline Desforges.')
      ]),
      this.elBanque
    ])]);
  };
  ImportPortefeuille.prototype.chargerBanque = function () {
    var self = this;
    AMX.get({ banqueBmw: 1 }, { secours: false }).then(function (d) {
      AMX.vider(self.elBanque);
      if (!d || d.refuse) { self.elBanque.appendChild(h('p.doux', { text: (d && d.erreur) || 'Réservé à la comptabilité et à la direction.' })); return; }
      if (!Array.isArray(d.transactions)) { self.elBanque.appendChild(h('p.doux', { text: 'Le script n\'est pas à jour (Banque.gs) : il faut le déployer.' })); return; }
      var e = d.etat;
      self.elBanque.appendChild(h('p', { text: e ? 'Dernier passage : ' + AMX.fmtDate(e.le, true) + ' — ' + e.recues + ' lues, ' + e.nouvelles + ' nouvelles, ' + e.deboursements + ' déboursé(s) inscrit(s), ' + e.liens + ' lien(s) payé(s)' + (e.sansVente ? ', ' + e.sansVente + ' sans vente' : '') + (e.alertes ? ', ' + e.alertes + ' alerte(s)' : '') + '.' : 'Aucun passage pour l\'instant.' }));
      var l = d.transactions.slice(0, 12);
      if (l.length) self.elBanque.appendChild(h('table.tableau', [h('thead', [h('tr', ['Date', 'Type', 'Client', 'NIV', 'Montant', 'Vente'].map(function (t) { return h('th', { text: t }); }))]), h('tbody', l.map(function (t) {
        return h('tr', [h('td', { text: t.date }), h('td', { text: t.genre === 'deboursement' ? 'Déboursé (+)' : (t.genre === 'lien' ? 'Lien payé (−)' : (t.type || '')) }), h('td', { text: t.nom || '' }), h('td.mono', { text: t.vin || '' }),
          h('td.num', { text: t.montant === null || t.montant === undefined ? '' : AMX.fmtArgent(t.montant) }), h('td', { text: t.venteId ? t.venteId + (t.note ? ' · ' + t.note : '') : (t.genre === 'autre' ? '' : 'pas encore de vente') })]);
      }))]));
      if (d.destinataires && d.destinataires.length) self.elBanque.appendChild(h('p.doux', { text: 'Alerte « montant en double » : ' + d.destinataires.join(', ') + '.' }));
    }, function (er) { AMX.vider(self.elBanque); self.elBanque.appendChild(h('p.doux', { text: AMX.erreurTexte(er) })); });
  };
  ImportPortefeuille.prototype.rendreEtat = function () {
    AMX.vider(this.elEtat);
    var e = AMX.equite.etat(this.cie), n = AMX.equite.comptes(this.cie).length;
    if (!e || !e.le) { this.elEtat.appendChild(h('p.doux', { style: { margin: 0 }, text: 'Aucun portefeuille importé pour ' + nomCie(this.cie) + '.' })); return; }
    var r = e.resume || {};
    this.elEtat.appendChild(h('p', { style: { margin: 0 } }, [h('b', { text: n + ' comptes actifs' }), ' — lu le ' + AMX.fmtDate(e.le, true) + (e.par ? ' par ' + String(e.par).split('@')[0] : '') + (r.location !== undefined ? ' · ' + r.location + ' locations, ' + r.financement + ' financements' : '') + (r.equitePositiveBmw !== undefined ? ' · ' + r.equitePositiveBmw + ' en équité positive selon BMW' : '') + (r.inactives ? ' · ' + r.inactives + ' contrat' + (r.inactives > 1 ? 's' : '') + ' terminé' + (r.inactives > 1 ? 's' : '') + ' au dernier passage' : '') + '.']));
    this.elEtat.appendChild(h('p', { style: { margin: '8px 0 0' } }, [h('a.btn.petit', { href: AMX.lien('relance', 'equite', { vue: 'clients' }), text: 'Voir l\'onglet Équité' })]));
  };
  ImportPortefeuille.prototype.lireFichier = function (fichier) {
    var self = this, lecteur = new FileReader();
    this.nomFichier = fichier.name;
    lecteur.onload = function () { self.poserContenu(String(lecteur.result || '')); };
    lecteur.onerror = function () { self.poserErreur('Fichier illisible.'); };
    lecteur.readAsText(fichier);
  };
  ImportPortefeuille.prototype.poserErreur = function (t) { this.lu = null; this.btnEnvoyer.disabled = true; AMX.vider(this.elResume); this.elResume.appendChild(h('div.eq-resume.erreur', { text: t })); this.el.dataset.etat = 'erreur'; };
  ImportPortefeuille.prototype.poserContenu = function (contenu) {
    var lu = lireExport(contenu);
    if (lu.erreurs.length) { this.poserErreur(lu.erreurs.join(' ')); return; }
    this.lu = lu;
    var loc = lu.lignes.filter(function (l) { return /lease/i.test(l.typeContrat); }).length, actifs = lu.lignes.filter(function (l) { return /^active$/i.test(l.statut || 'Active'); }).length;
    var eq = lu.lignes.filter(function (l) { var e = nombre(l.equiteBmw); return e !== null && e > 0; }).length;
    AMX.vider(this.elResume);
    this.elResume.appendChild(h('div.eq-resume.ok', [h('b', { text: this.nomFichier + ' : ' + lu.lignes.length + ' comptes' }), ' (' + actifs + ' actifs · ' + loc + ' locations, ' + (lu.lignes.length - loc) + ' financements · ' + eq + ' en équité positive selon BMW)' + (lu.total > lu.lignes.length ? ' · ' + (lu.total - lu.lignes.length) + ' ligne' + (lu.total - lu.lignes.length > 1 ? 's' : '') + ' sans no de compte ignorée' + (lu.total - lu.lignes.length > 1 ? 's' : '') : '') + '.', lu.inconnues.length ? h('div.sous', { text: 'Colonnes non reprises : ' + lu.inconnues.join(', ') }) : null]));
    this.elZone.classList.add('charge');
    this.btnEnvoyer.disabled = !lu.lignes.length;
    this.el.dataset.etat = 'lu';
    if (this.ctx && this.ctx.params && this.ctx.params.auto) this.envoyer();
  };
  ImportPortefeuille.prototype.envoyer = function () {
    var self = this, lu = this.lu;
    if (!lu || !lu.lignes.length) return;
    var lots = [], n = 0; for (var i = 0; i < lu.lignes.length; i += TAILLE_LOT) lots.push(lu.lignes.slice(i, i + TAILLE_LOT));
    var passage = new Date().toISOString();
    this.btnEnvoyer.disabled = true; this.btnEnvoyer.classList.add('occupe'); this.el.dataset.etat = 'envoi';
    var resume = null;
    var suivant = function (j) {
      if (j >= lots.length) return Promise.resolve();
      self.btnEnvoyer.textContent = 'Envoi… ' + Math.min(n + lots[j].length, lu.lignes.length) + ' / ' + lu.lignes.length;
      return AMX.post({ action: 'constructeurImporter', source: 'bmw', dealer: DEALER_BMW, nomConcession: NOM_BMW, phase: 'portefeuille', lignes: lots[j], dernier: j === lots.length - 1, passage: passage }, { delai: 120000 }).then(function (r) {
        if (r && r.ok && Array.isArray(r.vehicules)) throw new Error('Le script du serveur n\'est pas à jour (Equite.gs, Constructeur.gs, RoutesAjout.gs) : déployer une nouvelle version dans l\'éditeur Apps Script.');
        AMX.verifier(r, 'Lot refusé');
        resume = r.resume || resume; n += lots[j].length;
        return suivant(j + 1);
      });
    };
    suivant(0).then(function () {
      self.btnEnvoyer.textContent = 'Envoyer au site'; self.btnEnvoyer.classList.remove('occupe'); self.el.dataset.etat = 'termine';
      var r = resume || {};
      AMX.vider(self.elResume);
      self.elResume.appendChild(h('div.eq-resume.ok', { id: 'eq-fini' }, [h('b', { text: 'Importé — ' + (r.total || lu.lignes.length) + ' comptes actifs' }), ' · ' + (r.ajoutes || 0) + ' nouveaux, ' + (r.modifies || 0) + ' modifiés' + (r.inactives ? ', ' + r.inactives + ' terminés' : '') + ' · ' + (r.location || 0) + ' locations, ' + (r.financement || 0) + ' financements.', ' ', h('a', { href: AMX.lien('relance', 'equite', { vue: 'clients' }), text: 'Voir l\'onglet Équité' })]));
      AMX.equite.vider();
      AMX.toast('Portefeuille BMW importé : ' + (r.total || lu.lignes.length) + ' comptes.', 'ok', 5000);
      return AMX.equite.charger(true).then(function () { self.rendreEtat(); });
    }).catch(function (e) {
      self.btnEnvoyer.textContent = 'Envoyer au site'; self.btnEnvoyer.classList.remove('occupe'); self.btnEnvoyer.disabled = false; self.el.dataset.etat = 'erreur';
      AMX.vider(self.elResume); self.elResume.appendChild(h('div.eq-resume.erreur', { id: 'eq-erreur', text: 'Import interrompu après ' + n + ' comptes — ' + AMX.erreurTexte(e) }));
      AMX.toast('Import interrompu — ' + AMX.erreurTexte(e), 'erreur', 7000);
    });
  };
})();
