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
  /* 6 nov. : `taux` et `terme` ne servent plus (Maxime : « il faut enlever le paiement par défaut ») — gardés pour les réglages
     déjà mémorisés ; la mensualité vient seulement d'un programme du manufacturier, au terme du contrat. */
  var PARAMS_DEFAUT = { taux: 5.99, terme: 60, frais: 2995, marge: 50, taxes: 14.975, comptant: 0, kmAn: 20000, ecartTaux: 2 };
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
      case 'taux': return r.tauxContrat !== undefined ? r.tauxContrat : nombre(c.taux); case 'paiement': return nombre(c.paiement); case 'terme': return nombre(c.terme);
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
  /* ---- 7 nov. (Maxime : « faire des recherches de clients qui paient plus d'intérêt sur leur prêt qu'ils pourraient en payer
     aujourd'hui, par 2 % et plus — pastille « Sauver de l'intérêt » », « pour toutes les concessions »). Le taux du contrat vient
     du prêteur (InfoBahn, GM Dealer Direct, VW Finance) ; Hyundai Finance ne le donne pas : il se déduit du rachat, du paiement,
     des mensualités qui restent (et du résiduel d'une location). Vérifié le 7 nov. sur 2 598 contrats : prêts 5,1 % en moyenne,
     locations 4,1 % (paiement ramené avant taxes). ---- */
  /** Le paiement qui rembourse `montant` en `mois` mensualités en laissant `reste` (résiduel d'une location) à la fin. */
  function annuite(montant, reste, mois, tauxPct) {
    var B = nombre(montant), R = nombre(reste) || 0, n = nombre(mois), i = (nombre(tauxPct) || 0) / 1200;
    if (B === null || !n || n <= 0) return null;
    var a = i ? (B - R * Math.pow(1 + i, -n)) * i / (1 - Math.pow(1 + i, -n)) : (B - R) / n;
    return Math.max(0, a);
  }
  /** Le taux (% par année) qui fait que `mois` paiements de `paiement` (+ `reste` à la fin) valent `solde` aujourd'hui ; null hors de 0-30 %. */
  function tauxDeduit(solde, paiement, mois, reste) {
    var B = nombre(solde), P = nombre(paiement), n = nombre(mois), R = nombre(reste) || 0;
    if (!(B > 0) || !(P > 0) || !(n > 0)) return null;
    var va = function (i) { return (i ? P * (1 - Math.pow(1 + i, -n)) / i : P * n) + R * Math.pow(1 + i, -n); };
    if (va(0) < B || va(0.025) > B) return null;
    var lo = 0, hi = 0.025;
    for (var k = 0; k < 60; k++) { var m = (lo + hi) / 2; if (va(m) > B) lo = m; else hi = m; }
    return Math.round((lo + hi) / 2 * 1200 * 100) / 100;
  }
  /** Le taux du contrat d'un compte → { taux, source : preteur | estime | '' }. */
  function tauxContrat(c, params, mode) {
    var t = nombre(c.taux);
    if (t !== null && t >= 100 && t < 100000) t = Math.round(t / 2400 * 1000) / 1000;   /* VW Finance : taux de location lu ×2 400 (favori du 4 nov.) */
    else if (t !== null && t > 0 && t < 0.1) t = Math.round(t * 2400 * 1000) / 1000;   /* facteur de location pas converti */
    if (t !== null && t >= 0 && t < 40) return { taux: t, source: 'preteur' };
    var B = nombre(c.payoffBmw), P = nombre(c.paiement), le = texte(c.payoffLe || c.luLe).slice(0, 10);
    if (!(B > 0) || !(P > 0) || !c.echeance || !dateMidi(le)) return { taux: null, source: '' };
    var n = mensualitesRestantes(le, c.echeance); if (!n) return { taux: null, source: '' };
    var loc = estLocation(c), R = loc ? (nombre(c.residuel) || 0) : 0;
    if (loc && mode === 'hmf') P = P / (1 + (nombre(params && params.taxes) || 0) / 100);   /* Hyundai Finance : paiement taxes comprises */
    var x = tauxDeduit(B, P, n, R);
    return x === null ? { taux: null, source: '' } : { taux: x, source: 'estime' };
  }
  function fmtTaux(x) { return x === null || x === undefined ? '—' : String(Math.round(x * 100) / 100).replace('.', ',') + ' %'; }
  /** Le texte de la pastille « Sauver de l'intérêt ». */
  function texteInteret(r) {
    return fmtTaux(r.tauxContrat) + (r.tauxSource === 'estime' ? ' (estimé)' : '') + ' → ' + fmtTaux(r.tauxJour) + ' · −' + String(r.ecartTaux).replace('.', ',') + ' pts'
      + (r.interetSauve ? ' · ≈ ' + fmt$(r.interetSauve) + ' d\'intérêts' : '');
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

  /* ---- Neuf semblable (6 nov.) ----
     Maxime : « pourquoi dans Hyundai Longueuil, section Équité, ça ne compare pas à des neufs, on les a en inventaire ; si on
     ne l'a pas en inventaire, prendre les prix du manufacturier ou de D2C ; pour toutes les marques ». Avant : seulement les
     lignes du portail du manufacturier qui ont un prix — celles de Hyundai n'en ont pas (le PDSF est au DMS et chez D2C, avec
     un nom de modèle plus long : « TUCSON PREFERRED HMC TREND »). Maintenant : les neufs de toutes les origines (DMS, D2C,
     manufacturier) qui ont un PDSF, un NIV une fois ; le modèle est rattaché par son nom (le plus long modèle connu qui le
     commence) ; faute de ce modèle en stock : en route ou commandé, puis le PDSF d'un neuf du même modèle sorti (prix de
     référence), puis le modèle qui l'a remplacé (Accent → Venue…), puis un modèle voisin (même premier mot). */
  var ETATS_NEUF = { stock: 'en stock', demo: 'démo', transit: 'en route', commande: 'commandé', reference: 'prix de référence' };
  var RANG_ETAT = { stock: 1, demo: 2, transit: 3, commande: 4, reference: 5 };
  var REMPLACANTS = { accent: 'venue', veloster: 'elantra', ioniq: 'elantra', 'elantra gt': 'elantra', 'santa cruz': 'tucson', malibu: 'equinox', spark: 'trax', sonic: 'trax', cruze: 'trax', impala: 'equinox', 'bolt ev': 'equinox ev', 'bolt euv': 'equinox ev', volt: 'equinox ev', encore: 'encore gx', xt4: 'optiq', passat: 'jetta', golf: 'jetta', beetle: 'jetta', 'e golf': 'id 4', touareg: 'atlas', arteon: 'jetta' };
  /* Modèles jumeaux (même véhicule, autre marque ou autre taille) : essayés avant le « même premier mot ». */
  var JUMEAUX = { canyon: ['colorado'], colorado: ['canyon'], 'sierra 1500': ['silverado 1500'], 'silverado 1500': ['sierra 1500'], 'sierra hd': ['silverado hd'], 'silverado hd': ['sierra hd'], yukon: ['tahoe'], tahoe: ['yukon'], 'yukon xl': ['suburban', 'yukon'], suburban: ['yukon xl', 'tahoe'], terrain: ['equinox'], equinox: ['terrain'], acadia: ['traverse'], traverse: ['acadia'], trailblazer: ['trax', 'envista', 'encore gx'], trax: ['trailblazer', 'envista'], envista: ['trax'], 'encore gx': ['trailblazer', 'trax'], xt5: ['xt6'], xt6: ['xt5'], 'hummer ev pickup': ['hummer ev suv'], 'hummer ev suv': ['hummer ev pickup'], 'escalade iq': ['escalade'], 'id 4': ['id buzz', 'tiguan'], 'e golf': ['jetta'], gti: ['golf gti', 'golf r', 'jetta'], 'golf gti': ['golf r', 'jetta'], 'golf r': ['golf gti'], 'golf sportwagen': ['golf alltrack', 'jetta'], kona: ['venue'], venue: ['kona'] };
  function normModele(t) {
    return cle(t).replace(/\belectrique\b|\belectric\b/g, 'ev').replace(/\bheavy duty\b/g, 'hd').replace(/\b(silverado|sierra) (2500|3500) ?(hd)?\b/g, '$1 hd')
      .replace(/^(silverado|sierra)( ltd| limited)?$/, '$1 1500').replace(/\bcamion\b/g, 'pickup').replace(/\bvus\b/g, 'suv')
      .replace(/\b(escalade iq|lyriq|optiq|vistiq|celestiq) ev\b/g, '$1').replace(/\s+/g, ' ').trim();
  }
  function racineModele(k) { var m = String(k || '').split(' '); return /^(santa|grand)$/.test(m[0]) && m[1] ? m[0] + ' ' + m[1] : (m[0] || ''); }
  function etatNeuf(v) {
    if (!v.enStock) return 'reference';
    var s = String(v.statutLibelle || v.statut || '').toUpperCase();
    if (/DEMO|COURTOIS/.test(s)) return 'demo';
    if (/TRANSIT|ROUTE/.test(s)) return 'transit';
    if (/COMMAND|ORDER/.test(s)) return 'commande';
    return 'stock';
  }
  function origineNeuf(v) { var s = String(v.source || ''); return /d2c/i.test(s) ? 'D2C' : ((v.origine === 'constructeur' || /^portail-/.test(s)) ? 'manufacturier' : 'DMS'); }
  /** Texte court sous le neuf proposé : PDSF, état, source, et d'où vient le choix. */
  function texteNeuf(r) {
    var n = r.neuf; if (!n) return '';
    var t = 'PDSF ' + fmt$(n.prix) + ' · ';
    if (n.etat === 'reference') t += 'prix de référence' + (n.sortiLe ? ' (sorti le ' + AMX.fmtDateCourte(n.sortiLe) + ')' : '');
    else t += ETATS_NEUF[n.etat] + ' (' + n.origine + ')';
    if (r.alternatives) t += ' · +' + r.alternatives + ' autre' + (r.alternatives > 1 ? 's' : '');
    if (r.neufVoie === 'remplacant') t += ' · remplace « ' + (r.compte.modele || 'le modèle') + ' »';
    else if (r.neufVoie === 'voisin') t += ' · ' + (r.mode === 'bmw' ? 'série voisine' : 'modèle voisin');
    return t;
  }
  /** La transaction du neuf comparée (6 nov., soir) : « Location 36 mois · 20 000 km · résiduel 55 % · 2,99 % · source » ou
      « Financement 72 mois à 0,99 % · source ». */
  function texteProgramme(r) {
    var p = r.programme; if (!p || p.manquant) return '';
    var t = (p.type === 'location' ? 'Location ' : 'Financement ') + p.terme + ' mois';
    if (p.type === 'location') t += (p.kmAn ? ' · ' + AMX.fmtNombre(p.kmAn) + ' km' : '') + (p.residuelPct ? ' · résiduel ' + String(p.residuelPct).replace('.', ',') + ' %' : '') + ' · ';
    else t += ' à ';
    /* la note de la source (« vwbrossard.com · Tiguan 2026 · toutes versions ») va dans l'infobulle */
    var tx = String(p.taux).replace('.', ',') + ' %' + (p.fidelite ? ' (' + String(p.tauxAvantFidelite).replace('.', ',') + ' % − ' + p.fidelite.pct + ' pt' + (p.fidelite.pct > 1 ? 's' : '') + ' fidélité)' : '');
    return t + tx + ' · ' + String(p.libelle || '').replace(/\s*\([^)]*\)/, '') + (p.rabais ? ' · rabais ' + fmt$(p.rabais) : '');
  }
  /** 6 nov. : texte de l'offre de fidélité Hyundai d'un compte (« Double fidélité −2 pts »). */
  function texteFidelite(fo) { return fo ? (fo.type === 'double' ? 'Double fidélité' : 'Fidélité') + ' −' + fo.pct + ' pt' + (fo.pct > 1 ? 's' : '') : ''; }
  /** Ce qui n'est pas exactement la transaction du contrat : terme ou km pas offerts, taux d'un autre terme, résiduel de la page. */
  function ecartsTransaction(r) {
    var p = r.programme, out = []; if (!p || p.manquant) return out;
    if (p.interpole) out.push(p.terme + ' mois pas offert : ' + (p.type === 'location' ? 'résiduel entre ' : 'taux de ') + p.interpole[0] + ' et ' + p.interpole[1] + ' mois');
    if (p.type === 'location' && p.kmExact === false && p.kmVoulu && p.kmAn) out.push(AMX.fmtNombre(p.kmVoulu) + ' km pas offerts : ' + AMX.fmtNombre(p.kmAn) + ' km');
    return out;
  }
  /** Le texte quand aucun programme ne donne la transaction du contrat : « Programme à trouver — location 36 mois · 20 000 km ». */
  function texteManquant(r) {
    var p = r.programme; if (!p || !p.manquant) return '';
    return (p.type === 'location' ? 'Location ' : 'Financement ') + (p.termeVoulu ? p.termeVoulu + ' mois' : '(terme du contrat inconnu)') + (p.type === 'location' && p.kmVoulu ? ' · ' + AMX.fmtNombre(p.kmVoulu) + ' km' : '');
  }

  /* ---- Version (finition) du véhicule — 6 nov. (Maxime) : « un Elantra Essential ne peut pas être comparé à un Ultimate,
     soit le plus précis possible », « une option pour choisir le trim de comparaison ». Une version = le niveau de finition
     (le premier nommé dans le texte) + les ensembles (les autres niveaux nommés, Trend, Tech, autonomie longue…) + la
     motorisation (hybride, hybride rechargeable) + la motricité (intégrale ou non). Lue dans le texte du prêteur pour le client,
     dans le nom et la version du neuf (DMS, D2C, manufacturier). */
  var NIVEAUX = {
    hmf: [[/\bESS(ENTIAL|ENTIEL)?\b/, 'essential', 1, 'Essential'], [/\bPRE(F|FERRED|FERE)?\b/, 'preferred', 2, 'Preferred'], [/\bN LINE\b/, 'n line', 3, 'N Line'],
      [/\bXRT\b/, 'xrt', 3, 'XRT'], [/\bURBAN\b/, 'urban', 3, 'Urban'], [/\bNIGHT\b/, 'night', 4, 'Night Edition'], [/\bLUX(URY|E)?\b/, 'luxury', 4, 'Luxury'],
      [/\bULT(I|IMATE)?\b/, 'ultimate', 5, 'Ultimate'], [/\bCAL(L|LIG|LIGRAPHY)?\b/, 'calligraphy', 6, 'Calligraphy'], [/\bN\b(?! LINE)/, 'n', 7, 'N']],
    vw: [[/\bTRENDLINE\b/, 'trendline', 1, 'Trendline'], [/\bCOMFORTLINE\b/, 'comfortline', 2, 'Comfortline'], [/\bPRO S\b/, 'pro s', 3, 'Pro S'], [/\bPRO\b/, 'pro', 2, 'Pro'],
      [/\bSPORTLINE\b/, 'sportline', 3, 'Sportline'], [/\bHIGHLINE\b/, 'highline', 3, 'Highline'], [/\bPEAK\b/, 'peak', 4, 'Peak Edition'], [/\bEXECLINE\b/, 'execline', 5, 'Execline'],
      [/\bGLI\b/, 'gli', 5, 'GLI'], [/\bGTI\b/, 'gti', 5, 'GTI'], [/\bAUTOBAHN\b/, 'autobahn', 6, 'Autobahn'], [/\bR\b(?! LINE)/, 'r', 7, 'R']],
    /* 6 nov. (Maxime : « il manque le trim comme Silverado RST, LT, High Country ») : les formes réelles du DMS (Serti, D2C
       abrégé : « Hicnty », « Dnli », « Luxu1 », « Sportt », « Cust ») et du portail GM (français, codes d'option « 1RS », « 2TR »,
       « Groupe RS (à TI) », « Sport de tourisme », « Personnalisée »). */
    gm: [[/\bWT\b|\bWORK TRUCK\b|\bWORK VAN\b/, 'wt', 0, 'WT'], [/\bPRO\b/, 'pro', 0, 'Pro'], [/\bLS\b/, 'ls', 1, 'LS'], [/\bCUST(OM)?\b|\bPERSONNALISEE?\b/, 'custom', 1, 'Custom'], [/\bSLE\b/, 'sle', 1, 'SLE'],
      [/\b1LT\b|\bLT1\b/, '1lt', 2, '1LT'], [/\bLT\b/, 'lt', 2, 'LT'], [/\bPRIVILEGIE\b|\bPREFERRED\b/, 'preferred', 2, 'Preferred'], [/\bELEVATION\b/, 'elevation', 2, 'Elevation'], [/\bACTIVE?\b/, 'activ', 3, 'Activ'], [/\b2LT\b|\bLT2\b/, '2lt', 3, '2LT'],
      [/\bST\b|\bSPORT TOURING\b|\bSPORT DE TOURISME?\b/, 'st', 3, 'Sport Touring'], [/\bESSENCE\b/, 'essence', 3, 'Essence'],
      [/\bLUX(E|URY|RY|U1?)?\b/, 'luxury', 3, 'Luxury'], [/\bPREMIUM LUXURY\b|\bLUXE HAUT DE GAMME\b/, 'premium luxury', 4, 'Premium Luxury'], [/\bPREMIUM SPORT\b|\bSPORT HAUT DE GAMME\b/, 'premium sport', 5, 'Premium Sport'],
      [/\b[123]?RS\b/, 'rs', 4, 'RS'], [/\bRST\b/, 'rst', 4, 'RST'], [/\bTRAIL ?BO(SS)?\b|\b[123]TR\b|\bTB\b/, 'trail boss', 4, 'Trail Boss'],
      [/\b3LT\b|\bLT3\b/, '3lt', 4, '3LT'], [/\bSLT\d?\b/, 'slt', 4, 'SLT'], [/\bPREMIUM\b/, 'premium', 4, 'Premium'], [/\bSPORT[T2]?\b/, 'sport', 4, 'Sport'], [/\bPREMIER\b/, 'premier', 5, 'Premier'], [/\bAVENIR\b/, 'avenir', 5, 'Avenir'],
      [/\bLTZ\b/, 'ltz', 5, 'LTZ'], [/\bAT4\b/, 'at4', 5, 'AT4'], [/\bAT4X\b/, 'at4x', 6, 'AT4X'], [/\bZR2\b/, 'zr2', 6, 'ZR2'], [/\b[12]?SS\b/, 'ss', 6, 'SS'],
      [/\bHIGH COUNTRY\b|\bHI COUNTRY\b|\bHICNTY\b|\bHICTRY\b/, 'high country', 6, 'High Country'], [/\bDENALI\b|\bDNLI\b/, 'denali', 6, 'Denali'], [/\bPLATINUM\b/, 'platinum', 7, 'Platinum'],
      [/\bSERIE V\b|\bV SERIES\b/, 'v', 7, 'Série V'], [/\b2X\b/, '2x', 3, '2X'], [/\b3X\b/, '3x', 5, '3X']]
  };
  var ENSEMBLES = {
    hmf: [[/\bTREND\b|\bTRE\b/, 'trend', 'Trend'], [/\bTECH\b/, 'tech', 'Tech'], [/\bLR\b|\bLONG RANGE\b|\bLONGUE AUTONOMIE\b/, 'lr', 'longue autonomie']],
    vw: [[/\bR LINE\b/, 'r line', 'R-Line'], [/\bBLACK\b/, 'black', 'Black Edition']],
    gm: [[/\bZ71\b/, 'z71', 'Z71'], [/\bULTIMATE\b/, 'ultimate', 'Ultimate'], [/\bMIDNIGHT\b/, 'midnight', 'Midnight'], [/\bAUTONOMIE MAXIMALE\b|\bMAX RANGE\b|\bEXTENDED RANGE\b|\bAUTONOMIE PROLONGEE\b/, 'autonomie max', 'autonomie maximale']],
    bmw: [[/\bCOMPETITION\b/, 'competition', 'Competition']]
  };
  var LIB_ENSEMBLE = {}; ['hmf', 'vw', 'gm', 'bmw'].forEach(function (m) { (NIVEAUX[m] || []).forEach(function (n) { LIB_ENSEMBLE[n[1]] = n[3]; }); (ENSEMBLES[m] || []).forEach(function (e) { LIB_ENSEMBLE[e[1]] = e[2]; }); });
  function texteVersion(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim(); }
  /** La version lue dans un texte : { niveau, rang, libNiveau, ensembles: [], moteur: ''|'hev'|'phev', motricite: ''|'int'|'2rm', cle }. */
  function versionDe(mode, t) {
    /* Portail GM : un groupe d'options écrit pour deux modèles, « SIERRA : SLT/YKN/YKNXL : ÉLÉVATION » = SLT sur un Sierra,
       Élévation sur un Yukon (le modèle est au début du texte). */
    t = String(t || '').replace(/SIERRA\s*:\s*([^\/]+?)\s*\/\s*(?:YKN|YUKON)\s*\/\s*YKNXL\s*:\s*(.+)$/i, function (m, a, b, pos, tout) { return /YUKON|YKN/i.test(tout.slice(0, pos)) ? b : a; });
    var s = ' ' + texteVersion(t) + ' ', v = { niveau: '', rang: null, libNiveau: '', ensembles: [], moteur: '', motricite: '' };
    if (/\bPHEV\b|\bPLUG IN\b|\bRECHARGEABLE\b|\bBRANCHABLE\b/.test(s)) v.moteur = 'phev';
    else if (/\bHEV\b|\bHYB(RID|RIDE)?\b/.test(s)) v.moteur = 'hev';
    if (/\bTA TI\b|\bTI TA\b/.test(s)) v.motricite = '';   /* « (TA/TI) » : les deux sont offertes */
    else if (/\bAWD\b|\bHTRAC\b|\b4MOTION\b|\b4M\b|\bXDRIVE|\bQUATTRO\b|\b4X4\b|\b4WD\b|\b4RM\b|\bTI\b|\bINTEGRALE\b|\bTRACTION INTEGRALE\b/.test(s)) v.motricite = 'int';
    else if (/\bFWD\b|\bRWD\b|\b2WD\b|\b2RM\b|\bSDRIVE|\b4X2\b|\bTRACTION AVANT\b|\bTRACTION ARRIERE\b|\bTA\b/.test(s)) v.motricite = '2rm';
    if (mode === 'bmw') {
      var m = /\bM(\d)(\d{2})([IE])?\b/.exec(s) || null, k = '';
      if (m) k = 'm' + m[2] + (m[3] || '').toLowerCase();
      else if ((m = /\bM(\d{2})([IE])?\b/.exec(s))) k = 'm' + m[1] + (m[2] || '').toLowerCase();
      else if ((m = /\b[XSE]DRIVE ?(\d{2})([IE])?\b/.exec(s))) k = m[1] + (m[2] || '').toLowerCase();
      else if ((m = /\b(\d{2})([IE])? [XSE]DRIVE\b/.exec(s))) k = m[1] + (m[2] || '').toLowerCase();   /* 2025 : « X3 30 xDrive », « iX3 50 xDrive » */
      else if ((m = /\b\d(\d{2})([IED])\b/.exec(s))) k = m[1] + m[2].toLowerCase();
      if (k) { v.niveau = k; v.rang = (k.charAt(0) === 'm' ? 100 : 0) + (parseInt(k.replace(/\D/g, ''), 10) || 0); v.libNiveau = k.charAt(0) === 'm' ? 'M' + k.slice(1) : k; }
    } else {
      /* Toutes les finitions nommées, la plus à gauche d'abord (la plus longue à égalité) ; une finition comprise dans une
         autre déjà prise ne compte pas (« Sport de tourisme » n'est pas aussi « Sport », « Luxe haut de gamme » pas aussi « Luxe »). */
      var trouves = [];
      (NIVEAUX[mode] || []).forEach(function (n) {
        var re = new RegExp(n[0].source, 'g'), x;
        while ((x = re.exec(s))) { trouves.push({ pos: x.index, fin: x.index + x[0].length, cle: n[1], rang: n[2], lib: n[3] }); if (!x[0].length) re.lastIndex++; }
      });
      trouves.sort(function (a, b) { return (a.pos - b.pos) || ((b.fin - b.pos) - (a.fin - a.pos)); });
      var pris = [], premier = null;
      trouves.forEach(function (o) {
        if (pris.some(function (p) { return o.pos < p.fin && o.fin > p.pos; })) return;
        pris.push(o);
        if (!premier) premier = o; else if (o.cle !== premier.cle && v.ensembles.indexOf(o.cle) < 0) v.ensembles.push(o.cle);
      });
      if (premier) { v.niveau = premier.cle; v.rang = premier.rang; v.libNiveau = premier.lib; }
    }
    (ENSEMBLES[mode] || []).forEach(function (e) { if (e[0].test(s) && v.ensembles.indexOf(e[1]) < 0 && e[1] !== v.niveau) v.ensembles.push(e[1]); });
    /* Un ensemble seul fait office de finition : Ioniq 5 « Trend », Traverse « Z71 », M3 « Competition ». */
    if (!v.niveau && v.ensembles.length) { var p0 = v.ensembles.shift(); v.niveau = p0; v.rang = { trend: 2.5, z71: 4, competition: 110 }[p0] || null; v.libNiveau = LIB_ENSEMBLE[p0] || p0; }
    v.ensembles.sort();
    v.cle = [v.niveau].concat(v.ensembles).concat([v.moteur, v.motricite]).join('|');
    return v;
  }
  function libelleVersion(v) {
    if (!v) return '';
    var t = [v.libNiveau || (v.niveau ? v.niveau : '')].concat(v.ensembles.map(function (e) { return LIB_ENSEMBLE[e] || e; }));
    if (v.moteur) t.push(v.moteur === 'phev' ? 'hybride rechargeable' : 'hybride');
    if (v.motricite) t.push(v.motricite === 'int' ? 'intégrale' : '2 roues motrices');
    return t.filter(Boolean).join(' · ');
  }
  /** Écart entre la version du client (a) et celle d'un neuf (b), à niveau égal : ensembles, motorisation, motricité. */
  function ecartVersion(a, b) {
    var p = 0;
    a.ensembles.forEach(function (e) { if (b.ensembles.indexOf(e) < 0) p += 2; });
    b.ensembles.forEach(function (e) { if (a.ensembles.indexOf(e) < 0) p += 2; });
    if (a.moteur !== b.moteur) p += 6;
    if (a.motricite && b.motricite && a.motricite !== b.motricite) p += 1;
    return p;
  }

  /* ---- Programmes du manufacturier — 6 nov. (Maxime) : « je veux que ce soit branché au manufacturier ». Taux, terme et
     rabais du financement du neuf proposé, dans l'ordre : 1) les Programmes du mois de la concession (Relance › Portefeuille
     clients › Programmes du mois ; même règle que le moteur d'offres : le plus précis l'emporte, les rabais s'additionnent) ;
     2) GM : le taux et le terme des scénarios DealDriver de GM Dealer Direct lus ce mois-ci (programmes de la Financière GM),
     pour le même modèle et la même version ; 3) sinon les réglages de « Calcul de la nouvelle mensualité ». */
  /* Correspondance par mots (même règle que MOF_correspond_ de MoteurOffres.gs) : tous les mots du modèle et de la version du
     programme dans le nom du neuf, même motorisation ; abréviations du DMS et des bulletins ramenées au même mot. */
  function jetonsProg(t) {
    var s = ' ' + String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ') + ' ';
    s = s.replace(/ plug in hybrid | plug in | hybride rechargeable | rechargeable | phev /g, ' phev ').replace(/ hybride | hybrid | hyb | hev /g, ' hev ').replace(/ electrique | electric /g, ' ev ')
      .replace(/ (2500|3500) ?hd /g, ' hd ').replace(/ ld /g, ' 1500 ').replace(/ ess /g, ' essential ').replace(/ pref | pre /g, ' preferred ').replace(/ ulti | ult /g, ' ultimate ')
      .replace(/ cal | callig /g, ' calligraphy ').replace(/ lt([123]) /g, ' $1lt ').replace(/ trailboss /g, ' trail boss ').replace(/ privilegie /g, ' preferred ');
    var j = s.trim().split(/\s+/).filter(Boolean);
    if (j.some(function (x) { return /^[123]lt$/.test(x); }) && j.indexOf('lt') < 0) j.push('lt');   /* « LT » du bulletin GM = 1LT, 2LT, 3LT */
    if (/\b(lyriq|optiq|vistiq|celestiq|ioniq|hummer|bolt)\b/.test(j.join(' '))) j = j.filter(function (x) { return x !== 'ev'; });
    return j;
  }
  /* une motorisation une fois : « SANTA FE … HEV » + « HEV AWD … » ne doit pas donner « hev,hev » (6 nov.) */
  function moteurProg(j) { return j.filter(function (x, i) { return (x === 'ev' || x === 'hev' || x === 'phev') && j.indexOf(x) === i; }).sort().join(','); }
  function progCorrespond(p, s) {
    if (p.etat && p.etat !== 'neuf') return false;
    if (p.marque && texteVersion(p.marque) !== texteVersion(s.marque)) return false;
    var js = jetonsProg(s.modele + ' ' + s.version);
    if (p.modele) {
      var jm = jetonsProg(p.modele);
      if (!jm.every(function (x) { return x === 'ev' || x === 'hev' || x === 'phev' || js.indexOf(x) >= 0; })) return false;
      if (moteurProg(jm) !== moteurProg(js)) return false;
    }
    if (p.version && !jetonsProg(p.version).every(function (x) { return js.indexOf(x) >= 0; })) return false;
    var an = nombre(s.annee);
    if (nombre(p.anneeMin) && (!an || an < nombre(p.anneeMin))) return false;
    if (nombre(p.anneeMax) && (!an || an > nombre(p.anneeMax))) return false;
    if (p.electrique === 'oui' && !/\bEV\b|ELECTRI|IONIQ|LYRIQ|OPTIQ|BOLT|\bID\b|\bIX\b|\bI4\b|\bI5\b|\bI7\b/.test(texteVersion(s.modele + ' ' + s.version))) return false;
    return true;
  }
  function progPrecision(p) { return (p.marque ? 1 : 0) + (p.modele ? 2 : 0) + (p.version ? 2 : 0) + (nombre(p.anneeMin) || nombre(p.anneeMax) ? 1 : 0) + (p.etat ? 1 : 0) + (p.version ? jetonsProg(p.version).length * 0.1 : 0) + (p.modele ? jetonsProg(p.modele).length * 0.01 : 0); }
  /** Programmes valables aujourd'hui (mois courant, ou un mois d'avant dont la fin n'est pas passée). */
  function programmesDuJour(liste, ajd) {
    var mois = ajd.slice(0, 7);
    return (liste || []).filter(function (p) { return (p.mois === mois || (p.fin && p.fin >= ajd && p.mois <= mois)) && (!p.fin || p.fin >= ajd); });
  }
  /** Taux GM du mois : par famille de modèle, les scénarios de financement de DealDriver (véhicule, version, terme, taux). */
  function indexTauxGm(comptes, familleDe, ajd) {
    var idx = {}, mois = ajd.slice(0, 7);
    (comptes || []).forEach(function (c) {
      if (String(c.luLe || '').slice(0, 7) !== mois) return;
      var ps = c.propositions; if (typeof ps === 'string') { try { ps = JSON.parse(ps); } catch (e) { ps = null; } }
      (Array.isArray(ps) ? ps : []).forEach(function (q) {
        if (!q || q.type !== 'financement' || nombre(q.taux) === null || !nombre(q.terme)) return;
        var veh = texte(q.vehicule).replace(/^\d{4}\s+/, '').replace(/^(chevrolet|gmc|buick|cadillac)\s+/i, '');
        var fam = familleDe(veh); if (!fam) return;
        (idx[fam] = idx[fam] || []).push({ ver: versionDe('gm', veh), terme: nombre(q.terme), taux: nombre(q.taux), vehicule: texte(q.vehicule) });
      });
    });
    return idx;
  }
  /* ---- Même transaction que le contrat — 6 nov., Maxime : « assure-toi que les paiements comparés sont les mêmes que la
     transaction initiale : location 36 mois contre location 36 mois », puis « il faut enlever le paiement par défaut ; le
     système doit proposer le même terme de 36 mois » (exemple : 5NMP5DGL9SH119787). Un client en location se compare à une
     LOCATION du neuf au terme EXACT de son contrat et à ses km par année ; un client en financement, à un FINANCEMENT au terme
     exact de son contrat. Taux, résiduel et rabais viennent de la grille du programme du manufacturier (colonne `grille` des
     Programmes du mois, lue sur le site de la concession ou chez Hyundai). Un terme que le programme n'offre pas mais qui tombe
     entre deux termes offerts (39 mois entre 36 et 42) : résiduel interpolé, le plus haut des deux taux (prudent), signalé ;
     hors des termes offerts : pas de programme. Des km pas offerts : les plus proches, signalés. SANS PROGRAMME DU
     MANUFACTURIER POUR CE TYPE ET CE TERME : AUCUNE MENSUALITÉ (« programme à trouver ») — jamais un taux, un terme ou un
     résiduel « par défaut ». Le Portefeuille clients (MOF_grilleChoix_) garde, lui, le terme offert le plus proche. */
  /** Km par année du contrat : le km du contrat est un total ; divisé par les années du terme (un total qui donnerait moins de
      8 000 km par année est en fait un km annuel). Arrondi au millier. */
  function kmAnContrat(c) {
    var km = nombre(c && c.kmContrat), t = nombre(c && c.terme); if (!(km > 0)) return null;
    var parAn = t > 0 ? km / (t / 12) : null;
    if (parAn !== null && parAn >= 8000) return Math.round(parAn / 1000) * 1000;
    return km >= 8000 && km <= 40000 ? Math.round(km / 1000) * 1000 : null;
  }
  /** Une grille doit contenir le terme, le taux (et le résiduel) de sa propre ligne ; sinon elle est ignorée (MOF_grilleCoherente_). */
  function grilleCoherente(p, g) {
    var t = nombre(p.terme), x = nombre(p.taux), pareil = function (a, b) { return a !== null && a !== undefined && Math.abs(Number(a) - Number(b)) < 0.001; };
    if (!(t > 0) || x === null) return true;
    if (p.type === 'location') { var l = g.l && g.l[String(nombre(p.kmAn) || 0)], y = l && l[String(t)]; return !!y && pareil(y[0], x) && (nombre(p.residuelPct) === null || y[1] === null || pareil(y[1], p.residuelPct)); }
    return !!g.f && pareil(g.f[String(t)], x);
  }
  /** Dans la grille d'un programme, au terme voulu (et aux km voulus) : { terme, taux, residuelPct, kmAn, rabais, termeExact,
      kmExact, interpole: [t1, t2] | null } ; null si le terme n'est ni offert ni entre deux termes offerts. Le terme rendu est
      toujours le terme voulu. Km pas offerts : les plus proches (les plus hauts à égalité), signalés. */
  function grilleChoix(p, terme, kmAn) {
    var g = p && p.grille; if (typeof g === 'string') { try { g = g ? JSON.parse(g) : null; } catch (e) { g = null; } }
    if (!g || !grilleCoherente(p, g)) return null;
    terme = nombre(terme); kmAn = nombre(kmAn);
    if (!(terme > 0)) return null;
    /* les deux termes offerts qui entourent le terme voulu (ou le terme lui-même) */
    var autour = function (ts) {
      ts = ts.filter(function (t) { return t > 0; }).sort(function (a, b) { return a - b; });
      if (ts.indexOf(terme) >= 0) return [terme, terme];
      var bas = null, haut = null; ts.forEach(function (t) { if (t < terme) bas = t; else if (haut === null && t > terme) haut = t; });
      return bas !== null && haut !== null ? [bas, haut] : null;
    };
    if (p.type === 'location' && g.l) {
      var kms = Object.keys(g.l).map(Number).filter(function (k) { return !isNaN(k); });
      if (!kms.length) return null;
      var k = kms.length === 1 ? kms[0] : (kms.indexOf(kmAn) >= 0 ? kmAn : (!(kmAn > 0) ? Math.max.apply(null, kms) : kms.slice().sort(function (a, b) { return Math.abs(a - kmAn) - Math.abs(b - kmAn) || b - a; })[0]));
      var gt = g.l[String(k)] || {}, a = autour(Object.keys(gt).map(Number)); if (!a) return null;
      var x1 = gt[String(a[0])] || [], x2 = gt[String(a[1])] || [];
      var r1 = nombre(x1[1]), r2 = nombre(x2[1]), res = null;
      if (r1 !== null && r2 !== null) res = a[0] === a[1] ? r1 : Math.round((r1 + (r2 - r1) * (terme - a[0]) / (a[1] - a[0])) * 100) / 100;
      return { terme: terme, taux: Math.max(nombre(x1[0]) || 0, nombre(x2[0]) || 0), residuelPct: res, kmAn: k || null, rabais: Math.min(nombre(x1[2]) || 0, nombre(x2[2]) || 0),
        termeExact: a[0] === a[1], interpole: a[0] === a[1] ? null : a, kmExact: !k ? true : (!(kmAn > 0) || k === kmAn) };   /* km « 0 » : la source ne précise pas les km */
    }
    if (p.type !== 'location' && g.f) {
      var b = autour(Object.keys(g.f).map(Number)); if (!b) return null;
      var y1 = nombre(g.f[String(b[0])]), y2 = nombre(g.f[String(b[1])]); if (y1 === null || y2 === null) return null;
      return { terme: terme, taux: Math.max(y1, y2), residuelPct: null, kmAn: null, rabais: 0, termeExact: b[0] === b[1], interpole: b[0] === b[1] ? null : b, kmExact: true };
    }
    return null;
  }
  /** Le programme du neuf pour la même transaction que le contrat : { type: location | financement, taux, terme, residuelPct,
      kmAn, rabais, rabaisAvantTaxes, source: programme | gm, libelle, termeVoulu, termeExact, interpole, kmVoulu, kmExact,
      rabaisNoms } ; ou { type, manquant: true, termeVoulu, kmVoulu, raison } quand aucun programme du manufacturier ne donne ce
      type à ce terme (jamais de taux ni de résiduel « par défaut »). `contrat` = { location, terme, kmAn }. */
  function programmeNeuf(n, famille, params, progs, tauxGm, contrat) {
    contrat = contrat || {};
    var s = { marque: n.v && n.v.marque || '', modele: n.modele || '', version: n.version || '', annee: n.annee };
    var location = !!contrat.location, type = location ? 'location' : 'financement';
    var voulu = nombre(contrat.terme) || null, kmVoulu = location ? (nombre(contrat.kmAn) || nombre(params.kmAn) || 20000) : null;
    var rabais = 0, avant = true, noms = [];
    (progs || []).forEach(function (p) { if (p.type === 'rabais' && progCorrespond(p, s)) { rabais += nombre(p.rabais) || 0; if (p.rabaisAvantTaxes !== 'oui') avant = false; noms.push(p.note || p.modele || 'rabais'); } });
    var base = { type: type, rabais: rabais, rabaisAvantTaxes: avant, rabaisNoms: noms, termeVoulu: voulu, kmVoulu: kmVoulu, residuelPct: null, kmAn: kmVoulu, interpole: null, termeExact: true, kmExact: true };
    var c = (progs || []).filter(function (p) { return p.type === type && nombre(p.taux) !== null && (nombre(p.terme) || p.grille) && progCorrespond(p, s); });
    c.sort(function (a, b) { return progPrecision(b) - progPrecision(a); });
    /* le programme le plus précis qui DONNE ce terme (sa grille, ou sa ligne quand elle est à ce terme) */
    for (var i = 0; i < c.length; i++) {
      var p0 = c[i], t0 = voulu || nombre(p0.terme), ch = grilleChoix(p0, t0, kmVoulu), o = null;
      var lib = { source: 'programme', libelle: 'programme du mois' + (p0.note ? ' (' + p0.note + ')' : '') };
      if (ch && ch.taux !== null && (!location || ch.residuelPct > 0)) {
        o = Object.assign({}, base, lib, { taux: ch.taux, terme: ch.terme, termeExact: ch.termeExact, interpole: ch.interpole });
        if (location) Object.assign(o, { kmAn: ch.kmAn || kmVoulu, kmExact: ch.kmExact, residuelPct: ch.residuelPct });
      } else if (!ch && nombre(p0.terme) === t0 && (!location || nombre(p0.residuelPct) > 0)) {
        /* un programme sans grille (saisi à la main, ou lu avant les grilles), à ce terme exactement */
        o = Object.assign({}, base, lib, { taux: nombre(p0.taux), terme: t0 });
        if (location) Object.assign(o, { residuelPct: nombre(p0.residuelPct), kmAn: nombre(p0.kmAn) || kmVoulu, kmExact: !nombre(p0.kmAn) || nombre(p0.kmAn) === kmVoulu });
      }
      if (o) return o;
    }
    /* GM (financement) : les scénarios de la Financière GM lus ce mois-ci, au terme du contrat (même version d'abord) */
    if (!location && voulu) {
      var g = tauxGm && famille ? tauxGm[famille] : null;
      var auT = (g || []).filter(function (x) { return x.terme === voulu; });
      if (auT.length) {
        var memes = n.ver && n.ver.niveau ? auT.filter(function (x) { return x.ver.niveau === n.ver.niveau; }) : [];
        var l = memes.length ? memes : auT, compte = {};
        l.forEach(function (x) { compte[x.taux] = (compte[x.taux] || 0) + 1; });
        var tx = Object.keys(compte).sort(function (a, b) { return (compte[b] - compte[a]) || (Number(a) - Number(b)); })[0];
        return Object.assign({}, base, { taux: Number(tx), terme: voulu, source: 'gm', libelle: 'Financière GM' + (memes.length ? '' : ' (même modèle, autre version)') });
      }
    }
    var quoi = (location ? 'location ' : 'financement ') + (voulu ? voulu + ' mois' : '') + (location && kmVoulu ? ' · ' + AMX.fmtNombre(kmVoulu) + ' km' : '');
    return Object.assign({}, base, { manquant: true, terme: voulu, raison: c.length ? 'le programme du manufacturier n\'offre pas la ' + quoi.trim() : 'aucun programme de ' + (location ? 'location' : 'financement') + ' du manufacturier pour ce modèle ce mois-ci' });
  }
  /** Mensualité d'une location (même formule que MOF_location_) : coût capitalisé net = prix + frais − rabais − (valeur −
      dette) − comptant ; résiduel = % du PDSF ; (cap net − résiduel) ÷ terme + (cap net + résiduel) × taux ÷ 2 400 ; taxes sur
      chaque paiement. */
  function mensualiteLocation(o) {
    var res = (o.pdsf || 0) * (o.residuelPct || 0) / 100, terme = o.terme || 0;
    var capNet = (o.prix || 0) - (o.rabais || 0) - ((o.valeur || 0) - (o.dette || 0)) - (o.comptant || 0);
    if (!terme) return { capNet: capNet, residuel: res, taxes: null, mensualite: null };
    var avant = Math.max(0, (capNet - res) / terme + (capNet + res) * (o.taux || 0) / 2400), tx = avant * (o.taxePct || 0) / 100;
    return { capNet: capNet, residuel: res, avantTaxes: avant, taxes: tx, mensualite: avant + tx };
  }

  /* ---- Analyse : valeur, solde, équité, neuf similaire, nouvelle mensualité ---- */
  /** comptes (?equite=1), neufs = véhicules du suivi des neufs de la concession (toutes origines), params, options.valeurs = fn(vin) → valeur OpenLane. */
  function analyser(comptes, neufs, params, options) {
    params = Object.assign({}, PARAMS_DEFAUT, params || {}); options = options || {};
    var ajd = iso(new Date());
    var mode = options.mode || (options.gm ? 'gm' : 'bmw'), gm = mode === 'gm', parModele = mode !== 'bmw';
    var marqueOk = function (v) { var m = String(v.marque || '').toUpperCase(); if (!m || gm) return true; return mode === 'vw' ? /VOLKSWAGEN|^VW$/.test(m) : (mode === 'hmf' ? /HYUNDAI/.test(m) : m === 'BMW'); };
    /* 6 nov. : la version d'un NIV vient de la ligne du manufacturier quand elle nomme une finition (donnée officielle), sinon
       de sa propre ligne, sinon d'une autre ligne du même NIV — le DMS laisse souvent la version vide (88 neufs GM le 6 nov.). */
    var versionsVin = {};
    (neufs || []).forEach(function (v) {
      if (!v || !v.vin) return;
      var ver = versionDe(mode, [v.modele, v.version].join(' ')); if (!ver.niveau) return;
      var k0 = texte(v.vin).toUpperCase(), cote = v.origine === 'constructeur' || /^portail-/.test(String(v.source || '')) ? 'c' : 'd';
      var x = versionsVin[k0] = versionsVin[k0] || {};
      if (!x[cote]) x[cote] = { ver: ver, texte: v.version };
    });
    var meilleureVersion = function (v, propre) {
      var x = versionsVin[texte(v.vin).toUpperCase()] || {};
      if (x.c) return x.c; if (propre.niveau) return { ver: propre, texte: v.version }; return x.d || { ver: propre, texte: v.version };
    };
    /* Un NIV une fois : la ligne la plus « disponible » (stock › démo › en route › commandé › sorti). */
    var parVin = {}, uniques = [];
    (neufs || []).forEach(function (v) {
      if (!v || !marqueOk(v)) return;
      var prix = nombre(v.prix) || nombre(v.extra && v.extra.pdsf);
      if (!prix || prix < 5000) return;
      var e = etatNeuf(v);
      var mv = meilleureVersion(v, versionDe(mode, [v.modele, v.version].join(' ')));
      var o = { vin: v.vin, annee: v.annee, modele: v.modele, version: mv.texte || v.version, couleur: v.couleur, prix: prix, etat: e, enStock: e === 'stock' || e === 'demo', statut: v.statutLibelle || v.statut || '', origine: origineNeuf(v), sortiLe: v.sortiLe || '', v: v, ver: mv.ver };
      var k = texte(v.vin).toUpperCase();
      if (!k) { uniques.push(o); return; }
      if (!parVin[k] || RANG_ETAT[e] < RANG_ETAT[parVin[k].etat]) parVin[k] = o;
    });
    Object.keys(parVin).forEach(function (k) { uniques.push(parVin[k]); });
    /* Les modèles connus : ceux des clients, ceux du portail (noms courts) et les remplaçants ; le plus long d'abord. */
    var connus = {};
    if (parModele) {
      (comptes || []).forEach(function (c) { var k = normModele(c.modele); if (k) connus[k] = 1; });
      (neufs || []).forEach(function (v) { if (v && (v.origine === 'constructeur' || /^portail-/.test(String(v.source || '')))) { var k = normModele(v.modele); if (k) connus[k] = 1; } });
      Object.keys(REMPLACANTS).forEach(function (k) { connus[REMPLACANTS[k]] = 1; }); Object.keys(JUMEAUX).forEach(function (k) { connus[k] = 1; });
    }
    var connusListe = Object.keys(connus).sort(function (a, b) { return b.length - a.length; });
    var familleDe = function (t) { var k = normModele(t); if (!k) return ''; for (var i = 0; i < connusListe.length; i++) { var x = connusListe[i]; if (k === x || k.indexOf(x + ' ') === 0) return x; } return k; };
    var progs = programmesDuJour(options.programmes, ajd), tauxGm = gm ? indexTauxGm(comptes, familleDe, ajd) : null;
    var parSerie = {}, parRacine = {};
    uniques.forEach(function (o) {
      var s = parModele ? familleDe(o.modele) : texte(o.modele); if (!s) return;
      (parSerie[s] = parSerie[s] || []).push(o);
      if (parModele) { var rc = racineModele(s); (parRacine[rc] = parRacine[rc] || []).push(o); }
    });
    var trier = function (l) { l.sort(function (a, b) { return (RANG_ETAT[a.etat] - RANG_ETAT[b.etat]) || (a.etat === 'reference' ? (Number(b.annee) || 0) - (Number(a.annee) || 0) : 0) || (a.prix - b.prix); }); };
    Object.keys(parSerie).forEach(function (s) { trier(parSerie[s]); });
    Object.keys(parRacine).forEach(function (s) { trier(parRacine[s]); });
    return (comptes || []).filter(function (c) { return c.actif !== false; }).map(function (c) {
      var r = { compte: c, location: estLocation(c), serie: parModele ? normModele(c.modele) : (c.modele || serieDe(c.vehicule)), gm: gm, mode: mode, exportable: exportable(c.vin), version: versionDe(mode, [c.version, c.vehicule].join(' ')) };
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
      var tc = tauxContrat(c, params, mode); r.tauxContrat = tc.taux; r.tauxSource = tc.source;
      r.solde = r.dette.solde; r.soldeEcheance = r.location ? nombre(c.residuel) : 0;
      /* Valeur : OpenLane seulement (prévision, sinon ajusté au km, sinon moyenne des ventes). 4 nov. : plus l'estimation du prêteur
         (Black Book chez GM et VW) — Maxime : « on n'utilise pas Black Book mais OpenLane ». Sans lecture OpenLane : « à lire ». */
      var ol = options.valeurs ? options.valeurs(c.vin) : null;
      r.openlane = ol || null;
      var vPrev = ol ? nombre(ol.prevision) : null, vAj = ol && !vPrev && AMX.openlane && AMX.openlane.ajuste ? AMX.openlane.ajuste(ol, r.kmEstime) : null, vMoy = ol && !vPrev && !vAj ? nombre(ol.prixMoy) : null;
      var vOl = vPrev || vAj || vMoy;
      r.valeurQuoi = vPrev ? 'prevision' : (vAj ? 'ajuste' : (vMoy ? 'moyenne' : ''));
      if (vOl) { r.valeur = vOl; r.valeurSource = 'openlane'; }
      else { r.valeur = null; r.valeurSource = ''; }
      r.equite = r.valeur !== null && r.solde !== null ? r.valeur - r.solde : null;
      r.equiteEcheance = r.valeur !== null && r.soldeEcheance !== null ? r.valeur - r.soldeEcheance : null;
      r.equiteBmw = nombre(c.equiteBmw);
      /* Neuf semblable : le même modèle (stock › démo › en route › commandé › prix de référence d'un neuf sorti), sinon le
         modèle qui l'a remplacé, sinon un modèle voisin (BMW : série voisine). */
      var cands = parSerie[r.serie] || [], voie = '';
      /* Nom coupé par le prêteur (« Atlas Cross Spo ») : le modèle en stock dont le nom commence par celui du client. */
      if (!cands.length && parModele && r.serie.length >= 6) Object.keys(parSerie).some(function (k) { if (k.indexOf(r.serie) === 0 && parSerie[k].length) { cands = parSerie[k]; return true; } return false; });
      if (!cands.length && parModele && REMPLACANTS[r.serie]) { var rp = REMPLACANTS[r.serie]; cands = parSerie[rp] || parRacine[racineModele(rp)] || []; if (cands.length) voie = 'remplacant'; }
      if (!cands.length && parModele) { (JUMEAUX[r.serie] || []).some(function (j) { if (parSerie[j] && parSerie[j].length) { cands = parSerie[j]; voie = 'voisin'; return true; } return false; }); }
      if (!cands.length && parModele) { cands = parRacine[racineModele(r.serie)] || []; if (cands.length) voie = 'voisin'; }
      if (!cands.length && !parModele) { famille(r.serie).some(function (s) { if (parSerie[s] && parSerie[s].length) { cands = parSerie[s]; voie = 'voisin'; return true; } return false; }); }
      /* 6 nov. (Maxime) : la même version que le client — même finition, puis le moins d'écart (ensembles, motorisation,
         motricité) ; sinon la finition la plus proche, signalée « autre version ». Une version choisie à la main l'emporte. */
      r.famille = cands; r.versionVoie = '';
      if (cands.length) {
        var vc = r.version, choix = options.choixVersion ? options.choixVersion(c) : '';
        if (choix) { var ch = cands.filter(function (o) { return o.ver.cle === choix; }); if (ch.length) { cands = ch; r.versionVoie = 'choisie'; } }
        if (!r.versionVoie && vc.niveau) {
          var memes = cands.filter(function (o) { return o.ver.niveau === vc.niveau; });
          if (memes.length) {
            var ecarts = memes.map(function (o) { return ecartVersion(vc, o.ver); }), min = Math.min.apply(null, ecarts);
            cands = memes.filter(function (o, i) { return ecarts[i] === min; }); r.versionVoie = min === 0 ? 'meme' : 'proche';
          } else {
            var connus2 = cands.filter(function (o) { return o.ver.niveau && o.ver.rang !== null; });
            if (connus2.length && vc.rang !== null) {
              var dist = connus2.map(function (o) { return Math.abs(o.ver.rang - vc.rang) * 10 + ecartVersion(vc, o.ver); }), dmin = Math.min.apply(null, dist);
              cands = connus2.filter(function (o, i) { return dist[i] === dmin; });
            }
            r.versionVoie = 'autre';
          }
        } else if (!r.versionVoie) r.versionVoie = 'inconnue';
      }
      r.neuf = cands[0] || null; r.neufVoie = voie; r.neufVoisin = voie === 'voisin' ? (r.neuf ? r.neuf.modele : '') : '';
      r.alternatives = r.neuf ? cands.filter(function (o) { return o !== r.neuf && o.etat === r.neuf.etat; }).length : 0;
      /* 4 nov. (Maxime) : « je veux aucune valeur de reprise de GM, juste les comparables OpenLane ». Les scénarios DealDriver
         sont calculés par GM avec SA valeur de reprise : ils ne servent plus au calcul. Pour GM comme pour BMW et VW, la nouvelle
         mensualité part de la valeur OpenLane, du neuf semblable en stock et du taux et du terme de la page. */
      r.propositions = [];
      /* 6 nov. (Maxime) : offre de fidélité de Hyundai Canada (SmartPortal, Fidelite.gs) — 1 point de taux (fidélité),
         2 points (double fidélité), sur le taux du programme du manufacturier, jamais sous 0 %. */
      var fo = options.fidelite ? options.fidelite(c) : null;
      r.fidelite = fo || null;
      var prop = null;
      r.proposition = prop;
      if (prop) {
        r.mensualite = nombre(prop.mensualite); r.finance = null; r.taxes = null; r.prixNeuf = null;
        r.ecart = r.mensualite !== null && paiement ? r.mensualite - paiement : null;
        r.cible = r.ecart !== null && r.ecart <= (nombre(params.marge) || 0);
      } else if (r.neuf) {
        var prix = r.neuf.prix + (nombre(params.frais) || 0);
        var valeur = r.valeur !== null ? r.valeur : 0;
        /* 6 nov. (soir) : la même transaction que le contrat — location au terme et aux km du contrat, financement au terme */
        var contrat = { location: r.location, terme: nombre(c.terme), kmAn: r.location ? kmAnContrat(c) : null };
        var fin = programmeNeuf(r.neuf, parModele ? familleDe(r.neuf.modele) : '', params, progs, tauxGm, contrat);
        if (fo && fo.pct && !fin.manquant && nombre(fin.taux) !== null) fin = Object.assign({}, fin, { tauxAvantFidelite: fin.taux, taux: Math.max(0, Math.round((nombre(fin.taux) - fo.pct) * 1000) / 1000), fidelite: fo });
        var calcul = function (rabais, avant, taux, terme) {
          var taxable = Math.max(0, prix - avant - valeur), tx = taxable * (nombre(params.taxes) || 0) / 100;
          var f = Math.max(0, prix - rabais + tx - valeur + (r.solde || 0) - (nombre(params.comptant) || 0));
          return { finance: f, taxes: tx, mensualite: pmt(f, taux, terme) };
        };
        var calculLoc = function (rabais) {
          var l = mensualiteLocation({ prix: prix, pdsf: r.neuf.prix, rabais: rabais, valeur: valeur, dette: r.solde || 0, comptant: nombre(params.comptant) || 0, residuelPct: fin.residuelPct, taux: fin.taux, terme: fin.terme, taxePct: nombre(params.taxes) || 0 });
          return { finance: l.capNet, taxes: l.taxes, mensualite: l.mensualite, residuel: l.residuel, avantTaxes: l.avantTaxes };
        };
        var res = fin.manquant ? { finance: null, taxes: null, mensualite: null } : (fin.type === 'location' ? calculLoc(fin.rabais) : calcul(fin.rabais, fin.rabaisAvantTaxes ? fin.rabais : 0, fin.taux, fin.terme));
        /* Les rabais affichés pour CE neuf sur le site (D2C) remplacent les rabais des Programmes du mois (pas de double compte) ;
           ils sont avant taxes. 6 nov. : seulement les rabais cumulables — un rabais « comptant » (non-stackable, cash purchase)
           ne se combine pas avec le taux du programme, et il n'y a plus de « taux de la page » pour le calculer à part : il est
           seulement nommé dans l'infobulle. */
        var rv = options.rabaisVin ? options.rabaisVin(r.neuf.vin) : null;
        if (rv && rv.length && !fin.manquant) {
          var cumul = 0, cash = 0;
          rv.forEach(function (x) { if (x.comptant) cash += x.montant; else cumul += x.montant; });
          fin = Object.assign({}, fin, { rabais: cumul, rabaisAvantTaxes: true, rabaisNoms: rv.map(function (x) { return x.nom; }), rabaisD2c: rv, rabaisComptant: cash });
          res = fin.type === 'location' ? calculLoc(cumul) : calcul(cumul, cumul, fin.taux, fin.terme);
          if (cumul) fin.libelle += ' + rabais ' + (cash ? 'cumulables ' : '') + 'du site';
        }
        r.finance = res.finance; r.taxes = res.taxes; r.prixNeuf = prix; r.programme = fin; r.residuelNeuf = !fin.manquant && fin.type === 'location' ? res.residuel : null;
        r.programmeManquant = !!fin.manquant;
        r.mensualite = res.mensualite;
        r.ecart = r.mensualite !== null && paiement ? r.mensualite - paiement : null;
        r.cible = r.valeur !== null && r.ecart !== null && r.ecart <= (nombre(params.marge) || 0);
      } else { r.finance = null; r.mensualite = null; r.ecart = null; r.cible = false; }
      /* Sauver de l'intérêt : le taux du contrat dépasse d'au moins `ecartTaux` points celui du programme d'aujourd'hui (même
         transaction, même terme, fidélité comprise). Intérêts sauvés = (paiement au taux du contrat − paiement au taux du jour)
         sur la dette du jour et les mensualités qui restent. */
      r.tauxJour = r.programme && !r.programme.manquant && nombre(r.programme.taux) !== null ? nombre(r.programme.taux) : null;
      r.ecartTaux = r.tauxContrat !== null && r.tauxJour !== null ? Math.round((r.tauxContrat - r.tauxJour) * 100) / 100 : null;
      var nRest = r.dette ? r.dette.n : null, seuilTaux = nombre(params.ecartTaux) !== null ? nombre(params.ecartTaux) : 2;
      r.interetMois = null; r.interetSauve = null;
      if (r.ecartTaux !== null && r.ecartTaux > 0 && r.solde > 0 && nRest > 0) {
        var resteR = r.location ? (nombre(c.residuel) || 0) : 0, pa = annuite(r.solde, resteR, nRest, r.tauxContrat), pb = annuite(r.solde, resteR, nRest, r.tauxJour);
        if (pa !== null && pb !== null) { r.interetMois = Math.round((pa - pb) * 100) / 100; r.interetSauve = Math.round((pa - pb) * nRest); }
      }
      r.sauver = r.ecartTaux !== null && r.ecartTaux >= seuilTaux && r.solde > 0 && nRest > 0;
      r.sansValeur = r.valeur === null;
      r.ndnc = c.ndnc === 'oui';
      r.score = (r.cible ? 100000 : 0) + (r.equite || 0) + (r.echeanceProche ? 5000 : 0);
      return r;
    }).sort(function (a, b) { return b.score - a.score; });
  }

  /* ---- Offres de fidélité de Hyundai Canada (6 nov., Fidelite.gs) : ?fidelite=1&compagnie=, une lecture par concession ---- */
  var FID = {};
  function chargerFidelite(cie, force) {
    var x = FID[cie] || (FID[cie] = {});
    if (!force && x.donnees && Date.now() - x.le < AMX.dureeCopie(5 * 60000)) return Promise.resolve(x.donnees);
    if (x.promesse) return x.promesse;
    x.promesse = AMX.get({ fidelite: 1, compagnie: cie }, { discret: true }).then(function (d) {
      x.promesse = null; x.le = Date.now();
      /* script pas déployé : l'ancien traitement répond avec l'inventaire (« vehicules ») ou « route inconnue » */
      x.donnees = d && d.ok && Array.isArray(d.offres) ? d : { offres: [], parCompte: {}, etats: {}, absent: true };
      return x.donnees;
    }, function (e) { x.promesse = null; throw e; });
    return x.promesse;
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
    fidelite: chargerFidelite,
    vider: function () { cache.donnees = null; cache.le = 0; FID = {}; AMX.cacheLocal.oublier('equite'); Object.keys(SYNCS).forEach(function (c) { if (SYNCS[c].enCours) SYNCS[c].arret = true; }); },
    /** Lectures OpenLane en cours ou finies, par concession (elles continuent hors de la page Équité). */
    synchros: function () { return SYNCS; },
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
    lireExport: lireExport, serieDe: serieDe, famille: famille, analyser: analyser, pmt: pmt, dateIso: dateIso, detteDe: detteDe, mensualitesRestantes: mensualitesRestantes, tauxContrat: tauxContrat, tauxDeduit: tauxDeduit, annuite: annuite,
    kmAnContrat: kmAnContrat, grilleChoix: grilleChoix, programmeNeuf: programmeNeuf, mensualiteLocation: mensualiteLocation,
    PARAMS_DEFAUT: PARAMS_DEFAUT, SUIVIS: SUIVIS,
    monter: function (conteneur, cie, ctx) { return new VueEquite(conteneur, cie, ctx); }
  };

  function injecterCss() {
    if (document.getElementById('css-equite')) return;
    var s = document.createElement('style'); s.id = 'css-equite';
    s.textContent = [
      '.eq-params { display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end; margin-bottom: 12px; } .eq-params .champ { width: 110px; } .eq-params .champ input { height: 30px; }',
      '.eq-filtres { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; } .eq-filtres .recherche { flex: 1 1 180px; height: 30px; } .eq-filtres select { height: 30px; width: auto; } .eq-filtres .compte { margin-left: auto; font-size: 12px; color: var(--encre-3); }',
      '.eq-table { overflow-x: auto; } .eq-table .tableau { width: 100%; } .eq-table .tableau.eq-compact { table-layout: fixed; } .eq-table .eq-compact td, .eq-table .eq-compact th { padding: 4px 6px; line-height: 1.3; overflow: hidden; } .eq-table .coupe { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .eq-table .eq-puces { display: flex; gap: 3px; flex-wrap: nowrap; overflow: hidden; margin-top: 2px; } .eq-table .eq-puces .puce { font-size: 11.5px; padding: 0 5px; line-height: 17px; border-radius: 7px; white-space: nowrap; } .eq-ndnc { background: #FDE2E2; color: #B42318; font-weight: 700; } .eq-table a.eq-mail { text-decoration: none; } .eq-table .eq-v.meme, .eq-table .eq-v.choisie { color: var(--vert-fonce, #0B6B3A); font-weight: 700; } .eq-table .eq-v.autre { color: var(--ambre, #955F10); font-weight: 700; } .eq-table .eq-v.proche, .eq-table .eq-v.inconnue { color: var(--encre-3); } .eq-table .eq-compact select.suivi { width: 100%; max-width: none; height: 24px; } .eq-table .eq-compact input.eq-mmr { width: 100%; max-width: 92px; } .eq-table .eq-compact td.eq-us-cell { min-width: 0; } .eq-table .eq-compact .btn.petit { height: 22px; padding: 0 6px; } @media (max-width: 1000px) { .eq-table .tableau.eq-compact { table-layout: auto; min-width: 980px; } } .eq-table td, .eq-table th { padding: 6px 8px; vertical-align: top; font-size: 12.5px; } .eq-table th { white-space: nowrap; } .eq-table td.num, .eq-table th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }',
      '.eq-table td .sous { font-size: 12px; color: var(--encre-3); } .eq-table td .vin { font-family: var(--mono); font-size: 12px; color: var(--encre-3); } .eq-table td .nom { font-weight: 600; }',
      '.eq-table tr.cible td { background: var(--vert-clair); } .eq-table tr.sans td .valeur { color: var(--encre-3); font-style: italic; }',
      '.eq-table button.eq-dette { background: none; border: 0; padding: 0; font: inherit; color: inherit; cursor: pointer; text-decoration: underline dotted; text-underline-offset: 3px; } .eq-table button.eq-dette:hover { color: var(--vert-fonce, var(--vert)); }',
      '.eq-dette-tab { width: 100%; border-collapse: collapse; font-size: 13px; } .eq-dette-tab td { padding: 5px 6px; border-bottom: 1px solid var(--ligne, #E3E7EB); } .eq-dette-tab td.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; } .eq-dette-tab tr.total td { font-weight: 700; border-bottom: 0; }',
      '.eq-pos { color: var(--vert); font-weight: 700; } .eq-neg { color: var(--rouge); font-weight: 700; } .eq-nul { color: var(--encre-3); }',
      '.eq-table button.eq-valeur { background: none; border: 0; padding: 0; font: inherit; color: inherit; cursor: pointer; text-align: right; } .eq-table button.eq-valeur > div:first-child { text-decoration: underline dotted; text-underline-offset: 3px; } .eq-table button.eq-valeur:hover > div:first-child { color: var(--vert-fonce, #0B6B3A); }',
      '.eq-table .eq-version { display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; font-size: 12px; margin-top: 2px; } .eq-table .eq-version .v-txt { color: var(--encre-3); } .eq-table .eq-version.meme .v-txt { color: var(--vert-fonce, #0B6B3A); } .eq-table .eq-version.autre .v-txt { color: var(--ambre); font-weight: 600; } .eq-table .eq-version.choisie .v-txt { color: var(--bleu, #1A64BF); }',
      '.eq-table .eq-prog.programme, .eq-table .eq-prog.gm { color: var(--vert-fonce, #0B6B3A); } .eq-table .eq-ecart-tr { color: var(--ambre, #955F10); } .eq-table .eq-prog, .eq-table .eq-ecart-tr { white-space: normal; max-width: 250px; margin-left: auto; } .eq-table .eq-manquant { color: var(--ambre, #955F10); font-weight: 600; } .eq-table .eq-manquant .sous { font-weight: 400; }',
      '.eq-table .eq-version button { background: none; border: 0; padding: 0; font: inherit; font-size: 12px; color: var(--bleu, #1A64BF); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }',
      '.eq-versions { display: flex; flex-direction: column; gap: 6px; } .eq-versions button { display: flex; justify-content: space-between; gap: 12px; align-items: center; text-align: left; font: inherit; background: var(--carte, #fff); border: 1px solid var(--ligne, #E3E7EB); border-radius: 8px; padding: 8px 10px; cursor: pointer; } .eq-versions button:hover { border-color: var(--ligne-forte, #C9D0D6); } .eq-versions button.actif { border-color: var(--vert); box-shadow: 0 0 0 2px var(--vert-clair); } .eq-versions .droite { text-align: right; white-space: nowrap; font-size: 12.5px; color: var(--encre-3); } .eq-versions .client { color: var(--vert-fonce, #0B6B3A); font-size: 12px; font-weight: 600; }',
      '.eq-table select.suivi { height: 26px; font-size: 12px; width: auto; max-width: 130px; } .eq-table .suivi-note { font-size: 12px; color: var(--encre-3); margin-top: 2px; max-width: 160px; }',
      '.eq-table .btn.petit { height: 24px; padding: 0 7px; font-size: 12px; }',
      '.eq-contact a { color: inherit; text-decoration: none; } .eq-contact a:hover { text-decoration: underline; }',
      '.eq-page .eq-zone { display: block; border: 1.5px dashed var(--ligne-forte); border-radius: var(--rayon-s); padding: 22px 14px; text-align: center; cursor: pointer; color: var(--encre-3); font-size: 13px; } .eq-page .eq-zone:hover, .eq-page .eq-zone.survol { border-color: var(--vert); background: var(--vert-clair); } .eq-page .eq-zone input { display: none; } .eq-page .eq-zone.charge { border-style: solid; border-color: var(--vert); color: var(--vert); font-weight: 600; }',
      '.eq-page .eq-resume { margin-top: 12px; padding: 10px 12px; border-radius: 10px; background: var(--fond-2, #F4F6F8); font-size: 13px; } .eq-page .eq-resume.ok { background: var(--vert-bg, #E6F4EC); } .eq-page .eq-resume.erreur { background: var(--rouge-bg); }',
      '.eq-page .eq-etapes { margin: 0; padding-left: 18px; line-height: 1.6; font-size: 13px; }',
      '.eq-ia { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; } .eq-ia .eq-ia-champ { flex: 1 1 auto; height: 34px; } .eq-ia .maxai-avatar, .eq-ia img { flex: 0 0 auto; }',
      '.eq-int-puce { background: #E6EEFB; color: #1A4FA0; font-weight: 700; font-size: 12px; padding: 1px 7px; border-radius: 8px; } .eq-fid { display: flex; gap: 6px; align-items: center; margin-top: 3px; flex-wrap: wrap; } .eq-fid-puce { background: #E3F4EA; color: #0B6B3A; font-weight: 700; font-size: 12px; padding: 1px 7px; border-radius: 8px; }',
      '.eq-fid-carte { margin: 10px 0 4px; border: 1px solid #BFE3CC; border-left: 4px solid #0B8A45; border-radius: 8px; background: #F4FBF6; padding: 2px 12px 8px; } .eq-fid-carte summary { cursor: pointer; padding: 8px 0 4px; list-style: none; display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; } .eq-fid-carte summary::-webkit-details-marker { display: none; } .eq-fid-carte summary .fleche { display: inline-block; transition: transform .15s; color: #0B6B3A; } .eq-fid-carte details[open] summary .fleche { transform: rotate(90deg); } .eq-fid-carte summary .ouvrir { margin-left: auto; color: #0B6B3A; font-weight: 600; font-size: 13px; } .eq-fid-carte .eq-fid-vues { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; } .eq-fid-carte .eq-fid-vues button { border: 1px solid #BFE3CC; background: #fff; border-radius: 14px; padding: 3px 10px; font-size: 13px; cursor: pointer; } .eq-fid-carte .eq-fid-vues button[aria-pressed="true"] { background: #0B8A45; border-color: #0B8A45; color: #fff; } .eq-fid-carte table { background: #fff; } .eq-exp-ok { color: #0B6B3A; font-weight: 700; } .eq-fid-barre { padding: 6px 0 0; } .eq-fid-barre .outils { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 8px; } .eq-fid-exp { font-size: 13px; display: inline-flex; gap: 4px; align-items: center; } tr.eq-offre-seule td { background: #FAFDFB; } .eq-exp-non { color: #B42318; font-weight: 700; } .eq-fid-carte table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 6px; } .eq-fid-carte th, .eq-fid-carte td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--ligne, #E4E8EC); vertical-align: top; } .eq-fid-carte th { font-size: 12px; color: var(--encre-3, #4B5563); font-weight: 600; } .eq-fid-carte .pin { font-family: ui-monospace, Menlo, monospace; } .eq-fid-carte .defile { overflow-x: auto; } .eq-fid-carte .outils { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 8px; }',
      '.eq-us { display: flex; gap: 6px; align-items: center; margin-top: 3px; } .eq-us-puce { background: #E8F0FE; color: #1A64BF; font-weight: 700; font-size: 11.5px; padding: 1px 6px; border-radius: 8px; }',
      '.eq-ia-res { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; padding: 8px 12px; border-radius: 10px; background: var(--vert-clair); font-size: 13px; } .eq-ia-res .sous { color: var(--encre-3); font-size: 12px; flex: 1 1 200px; }',
      '.eq-sync { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin: 0 0 12px; padding: 8px 12px; border-radius: 10px; background: var(--fond-2, #F4F6F8); font-size: 13px; } .eq-sync.ok { background: var(--vert-clair); } .eq-sync.alerte { background: #FFF4E0; color: var(--ambre); } .eq-sync .eq-sync-txt { flex: 1 1 260px; }',
      '.eq-sync .eq-sync-barre { flex: 1 1 180px; height: 6px; border-radius: 3px; background: var(--ligne, #E3E7EB); overflow: hidden; } .eq-sync .eq-sync-barre span { display: block; height: 100%; background: var(--vert); transition: width .3s; }',
      '.eq-table td.eq-us-cell { min-width: 120px; } .eq-table input.eq-mmr { width: 92px; height: 24px; font-size: 12px; text-align: right; } .eq-table .eq-us-lien { font-size: 12px; }',
      '.eq-reglages { margin: 0 0 12px; border: 1px solid var(--ligne, #E3E7EB); border-radius: 10px; padding: 8px 12px; font-size: 13px; } .eq-reglages > summary { cursor: pointer; color: var(--encre-2, #374151); } .eq-reglages > summary span { color: var(--encre-3); } .eq-reglages[open] > summary { margin-bottom: 10px; } .eq-reglages .eq-params { margin-bottom: 0; }',
      '.eq-tuiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin-bottom: 12px; }',
      '.eq-tuile { text-align: left; font: inherit; color: inherit; background: var(--carte, #fff); border: 1px solid var(--ligne, #E3E7EB); border-radius: var(--rayon, 10px); padding: 8px 10px 7px 12px; display: flex; flex-direction: column; gap: 2px; box-shadow: var(--ombre, none); position: relative; overflow: hidden; cursor: pointer; }',
      '.eq-tuile::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--ligne-forte, #C9D0D6); } .eq-tuile.vert::before { background: var(--vert); } .eq-tuile.bleu::before { background: var(--bleu); } .eq-tuile.ambre::before { background: var(--ambre); } .eq-tuile.rouge::before { background: var(--rouge); } .eq-tuile.violet::before { background: var(--violet, #6B4FBB); } .eq-tuile.sombre::before { background: var(--noir-2, #141A1F); }',
      '.eq-tuile.actif { border-color: var(--encre, #141A1F); box-shadow: 0 0 0 2px rgba(0,0,0,.08); } .eq-tuile:hover { border-color: var(--ligne-forte, #C9D0D6); }',
      '.eq-tuile .nom { font-size: 12px; color: var(--encre-3); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; } .eq-tuile .n { font-size: 20px; font-weight: 700; line-height: 1.1; } .eq-tuile .bas { font-size: 12px; color: var(--encre-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      '.btn.eq-sync-gros { height: 40px; padding: 0 18px; font-size: 15px; font-weight: 700; } .btn.eq-sync-gros.en-cours svg { animation: eq-tourne 1.2s linear infinite; } @keyframes eq-tourne { to { transform: rotate(360deg); } }',
      '@media (max-width: 860px) { .eq-params .champ { width: 46%; } .btn.eq-sync-gros { height: 36px; font-size: 14px; } }'
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
    this.rendre();
    var self = this;
    this.surOpenlane = function () { self.planifierRendu(); };
    var vusValorises = -1;
    this.surSync = function (ev) { var d = ev && ev.detail || {}; if (self.detruit || d.cie !== self.cie) return; var s = SYNCS[self.cie]; self.majSync(); if (d.fini) self.planifierRendu(0); else if (s && s.valorises !== vusValorises) { vusValorises = s.valorises; self.planifierRendu(2500); } };
    document.addEventListener('amx:equiteSync', this.surSync);
    document.addEventListener('amx:openlane', this.surOpenlane);
    if (AMX.openlane && AMX.openlane.charger) AMX.openlane.charger().catch(function () {});
    /* 4 nov. (Maxime) : « la comparaison de la dette avec le montant du calcul US doit être visible » — le gros É.-U. vient
       de l'évaluation du NIV (boîte Canada ou É.-U.), sinon d'un MMR tapé dans la ligne, avec le taux du jour. */
    if (AMX.export && AMX.export.charger) Promise.all([AMX.export.charger(), AMX.export.verdicts ? AMX.export.verdicts() : {}]).then(function (r) { self.us = r[1] || {}; if (!self.detruit) self.planifierRendu(); }).catch(function () {});
  }
  VueEquite.prototype.demonter = function () { this.detruit = true; clearTimeout(this.minuterieRendu); document.removeEventListener('amx:openlane', this.surOpenlane); document.removeEventListener('amx:equiteSync', this.surSync); };
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
  /** Les Programmes du mois de la concession (une lecture par concession ; sans l'onglet Portefeuille, aucun). */
  VueEquite.prototype.chargerProgrammes = function () {
    var self = this, cie = this.cie; this.progs = this.progs || {};
    if (this.progs[cie] !== undefined) return;
    this.progs[cie] = [];
    AMX.get({ programmesMois: 1, compagnie: cie }, { discret: true }).then(function (d) {
      if (d && Array.isArray(d.programmes) && d.programmes.length) { self.progs[cie] = d.programmes; if (!self.detruit) self.planifierRendu(0); }
    }).catch(function () {});
  };
  VueEquite.prototype.analyser = function () {
    var comptes = AMX.equite.comptes(this.cie);
    var valeurs = AMX.openlane && AMX.openlane.valeur ? function (vin) { var r = AMX.openlane.valeur(vin); return r && r.luLe ? r : null; } : null;
    var choix = AMX.memo.lire('eq_versions', {}) || {};
    this.chargerProgrammes();
    /* 6 nov. : rabais du site par véhicule (D2C) — lus une fois, le calcul se refait à leur arrivée. */
    var self0 = this;
    if (AMX.rabaisD2c && !AMX.rabaisD2c.enCache() && !this.rabaisDemandes) { this.rabaisDemandes = true; AMX.rabaisD2c.charger().then(function () { if (!self0.detruit) self0.planifierRendu(0); }).catch(function () {}); }
    /* 6 nov. : offres de fidélité Hyundai (SmartPortal) — lues une fois par concession, le calcul se refait à leur arrivée. */
    var fid = null, fx = FID[this.cie];
    if (estHmf(this.cie)) {
      if (fx && fx.donnees) fid = fx.donnees.parCompte || {};
      if (!this.fidDemandee) { this.fidDemandee = true; chargerFidelite(this.cie).then(function () { if (!self0.detruit) self0.planifierRendu(0); }).catch(function () {}); }
    }
    this.lignes = analyser(comptes, this.neufs(), this.params, { valeurs: valeurs, mode: modeCie(this.cie), programmes: (this.progs || {})[this.cie] || [], rabaisVin: AMX.rabaisD2c ? AMX.rabaisD2c.de : null, choixVersion: function (c) { return choix[(c.compagnie || '') + '|' + c.compte] || ''; }, fidelite: fid ? function (c) { return fid[(c.compagnie || '') + '|' + c.compte] || null; } : null });
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
  /** Les comptes que les filtres gardent ; sauf = 'quoi' : sans le filtre des tuiles (pour compter chaque tuile). */
  VueEquite.prototype.visibles = function (sauf) {
    var f = this.filtres, q = AMX.motsCherches ? AMX.motsCherches(f.q) : f.q.toLowerCase(), ia = this.ia, quoi = (sauf === 'quoi' || ia) ? '' : f.quoi;
    var liste = this.lignes.filter(function (r) {
      var c = r.compte;
      if (ia && !ia.conditions.every(function (k) { return condRespectee(r, k); })) return false;
      if (quoi === 'cibles' && !r.cible) return false;
      if (quoi === 'proches' && !r.echeanceProche) return false;
      if (quoi === 'equite' && !(r.equite !== null && r.equite > 0)) return false;
      if (quoi === 'sansValeur' && !r.sansValeur) return false;
      if (quoi === 'suivi' && !c.suivi) return false;
      if (quoi === 'exportables' && !r.exportable) return false;
      if (quoi === 'meilleurUS' && !r.meilleurUS) return false;
      if (quoi === 'fidelite' && !r.fidelite) return false;
      if (quoi === 'interet' && !r.sauver) return false;
      if (f.type === 'location' && !r.location) return false;
      if (f.type === 'financement' && r.location) return false;
      if (f.echeance && (r.moisRestants === null || r.moisRestants > Number(f.echeance))) return false;
      if (f.conseiller && (f.conseiller === '—' ? !!c.conseiller : c.conseiller !== f.conseiller)) return false;
      if (q.length && !(AMX.correspond ? AMX.correspond([c.nom, c.prenom, c.vin, c.vehicule, c.compte, c.ville, c.conseiller], q) : [c.nom, c.prenom, c.vin, c.vehicule, c.compte, c.ville, c.conseiller].join(' ').toLowerCase().indexOf(q) >= 0)) return false;
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
    var comptes = AMX.equite.comptes(this.cie);
    if (!comptes.length) {
      /* 6 nov. (Maxime) : l'importation n'est plus que dans le menu Actions de la page. */
      var m = modeCie(this.cie), nom = nomCie(this.cie);
      var txt = m === 'hmf' ? 'Aucun portefeuille lu pour ' + nom + '. Ouvrez Hyundai Finance (Actions › Ouvrir Hyundai Finance), allez dans « Customer Portfolio » et cliquez le favori « Automax ← Hyundai Finance » : il lit tous les prêts et les locations actifs (environ 1 minute). Rien n\'est écrit chez Hyundai Finance.'
        : m === 'vw' ? 'Aucun portefeuille lu pour ' + nom + '. Ouvrez VW Finance (Actions › Ouvrir VW Finance), allez dans Portfolio Manager et cliquez le favori « Automax ← Constructeur » : il lit les contrats qui finissent dans les 12 prochains mois et leur fiche. Rien n\'est écrit chez VW.'
        : m === 'gm' ? 'Aucun portefeuille lu pour ' + nom + '. Ouvrez GM Dealer Direct (Actions › Ouvrir GM Dealer Direct) au nom de ' + nom + ' et cliquez le favori « Automax ← Constructeur » : il lit les clients de la Financière GM et leur fiche. Rien n\'est écrit dans GM Dealer Direct.'
        : 'Aucun portefeuille importé pour ' + nom + '. Exportez le portefeuille d\'InfoBahn (Portfolio › Entire Portfolio › « … » › Export), puis Actions › Importer le portefeuille.';
      el.appendChild(h('div.carte', [h('div.carte-corps', [h('p', { style: { margin: 0 }, text: txt })])]));
      this.lignes = []; this.majBouton();
      return;
    }
    this.analyser();
    var champ = function (cle, libelle, pas, aide) { var inp = h('input', { type: 'number', step: pas || '0.01', value: String(self.params[cle]), title: aide || '' }); inp.addEventListener('change', function () { var v = nombre(inp.value); if (v === null) return; self.params[cle] = v; AMX.equite.poserParams(self.params); try { inp.blur(); } catch (e) {} setTimeout(function () { self.rendre(); }, 0); });   /* redessin différé : retirer le champ pendant son propre « change » fait échouer removeChild */ return h('div.champ', [h('label', { text: libelle }), inp]); };
    var paramsCorps = h('div.eq-params', [
      champ('frais', 'Frais $', '1', 'Transport et préparation, autres frais ajoutés au PDSF'),
      champ('marge', 'Marge $/mois', '1', 'Une cible peut payer jusqu\'à ce montant de plus par mois'), champ('taxes', 'Taxes %', '0.001', 'TPS + TVQ sur la différence prix − valeur de l\'échange'), champ('comptant', 'Comptant $', '1'), champ('kmAn', 'Km / an', '1000', 'Km estimé d\'un véhicule financé (pour OpenLane), et km d\'une location dont le contrat ne donne pas les km'),
      champ('ecartTaux', 'Sauver de l\'intérêt : écart (pts)', '0.25', 'Pastille « Sauver de l\'intérêt » : le taux du contrat dépasse d\'au moins ce nombre de points celui du programme d\'aujourd\'hui (même transaction, même terme)'),
      h('span.doux.petit', { style: { alignSelf: 'center' } }, 'Même transaction que le contrat du client : un client en location se compare à une location du neuf au terme et aux km par année de son contrat (cap net = PDSF + frais − rabais − (valeur − dette) ; résiduel % du PDSF ; taxes sur chaque paiement) ; un client en financement, à un financement au terme de son contrat ((PDSF + frais − rabais − valeur) + taxes + dette). Taux, résiduel et rabais : programme du manufacturier seulement (Programmes du mois ; GM : Financière GM). Sans programme pour ce terme : « Programme à trouver », pas de mensualité.')
    ]);
    var P = this.params;
    var params = h('details.eq-reglages', { open: this.reglagesOuverts ? 'open' : null }, [h('summary', [h('b', { text: 'Calcul de la nouvelle mensualité' }), h('span', { text: ' · même transaction et même terme que le contrat · programmes du manufacturier · frais ' + fmt$(P.frais) + ' · marge ' + fmt$(P.marge) + ' / mois · taxes ' + String(P.taxes).replace('.', ',') + ' %' + (nombre(P.comptant) ? ' · comptant ' + fmt$(P.comptant) : '') + ' · intérêt ≥ ' + String(nombre(P.ecartTaux) !== null ? nombre(P.ecartTaux) : 2).replace('.', ',') + ' pts' })]), paramsCorps]);
    params.addEventListener('toggle', function () { self.reglagesOuverts = params.open; });
    /* Filtres : recherche, type, échéance, conseiller ; puis les tuiles (chacune filtre aussi) — elles comptent ce que ces filtres gardent. */
    var conseillers = {}; this.lignes.forEach(function (r) { conseillers[r.compte.conseiller || '—'] = 1; });
    var sel = function (cle, options) { var s = h('select', options.map(function (o) { return h('option', { value: o[0], selected: self.filtres[cle] === o[0] ? 'selected' : null, text: o[1] }); })); s.value = self.filtres[cle]; s.addEventListener('change', function () { self.filtres[cle] = s.value; setTimeout(function () { self.rendre(); }, 0); }); return s; };
    var rech = h('input.recherche', { type: 'search', placeholder: 'Client, NIV, modèle, ville…', value: this.filtres.q });
    rech.addEventListener('input', function () { self.filtres.q = rech.value; self.rendreTuiles(); self.rendreTable(); });
    this.elCompte = h('span.compte');
    var filtres = h('div.eq-filtres', [
      rech,
      sel('type', [['', 'Location et financement'], ['location', 'Locations'], ['financement', 'Financements']]),
      sel('echeance', [['', 'Toute échéance'], ['3', '≤ 3 mois'], ['6', '≤ 6 mois'], ['12', '≤ 12 mois'], ['24', '≤ 24 mois']]),
      sel('conseiller', [['', 'Tous les conseillers']].concat(Object.keys(conseillers).sort().map(function (k) { return [k, k === '—' ? 'Sans conseiller' : k]; }))),
      this.elCompte
    ]);
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
    this.elSync = h('div.eq-sync');
    this.elTuiles = h('div.eq-tuiles');
    this.elFid = estHmf(this.cie) ? h('div.eq-fid-carte') : null;
    this.elTable = h('div.eq-table');
    el.appendChild(h('div.carte', [h('div.carte-corps', [this.elSync, iaBarre, iaRes, filtres, this.elTuiles, this.elFid, params, this.elTable])]));
    this.majSync();
    this.rendreTuiles();
    this.rendreFidelite();
    this.rendreTable();
    /* Lecture OpenLane automatique : une fois par concession à l'ouverture, les comptes sans valeur (4 nov.). Le bouton
       « Synchroniser OpenLane » du haut de la page relit aussi les valeurs de plus de 30 jours (6 nov.). */
    var nSans = this.lignes.filter(function (r) { return r.sansValeur; }).length;
    if (nSans && !SYNC_AUTO[this.cie] && this.peutLireOpenlane() && !(SYNCS[this.cie] && SYNCS[this.cie].enCours)) { SYNC_AUTO[this.cie] = true; setTimeout(function () { if (!self.detruit) self.synchroniser(false, true); }, 400); }
  };
  /* ---- 6 nov. : les offres de fidélité Hyundai lues dans SmartPortal (Fidelite.gs) — la liste à télécharger, avec ou sans
     contrat Hyundai Finance. Celles d'un client de Hyundai Finance baissent déjà le taux de sa nouvelle mensualité. ---- */
  /* 6 nov. (Maxime : « ça fonctionne pas ») : home.smartdealerportal.com renvoie, sans session, à une page « logged out — close the
     tab » sans bouton de connexion. La page de connexion, elle, mène au portail une fois connecté. */
  var URL_SMARTPORTAL = 'https://login.smartdealerportal.com/';
  function boutonsFidelite() {
    var sig = AMX.signets && AMX.signets.fidelite;
    return [
      sig ? h('a.btn.petit', { href: sig.code, text: sig.nom, draggable: 'true', title: 'Glissez ce bouton dans votre barre de favoris (une seule fois), puis cliquez-le dans SmartPortal, page des pistes', onclick: function (e) { e.preventDefault(); AMX.toast('Glissez ce bouton dans la barre de favoris de Chrome, puis cliquez-le dans SmartPortal (Pistes de vente).', 'attention', 5000); } }) : null,
      h('a.btn.petit', { href: URL_SMARTPORTAL, target: '_blank', rel: 'noopener', html: I.externe + '<span>Ouvrir SmartPortal</span>' })
    ];
  }
  VueEquite.prototype.rendreFidelite = function () {
    var self = this, el = this.elFid; if (!el) return;
    AMX.vider(el);
    var fx = FID[this.cie], d = fx && fx.donnees;
    if (!d) { el.appendChild(h('p.doux.petit', { text: 'Offres de fidélité Hyundai : lecture…' })); return; }
    if (d.absent) { el.appendChild(h('p.doux.petit', { text: 'Offres de fidélité Hyundai : le script du site n\'est pas à jour (Fidelite.gs) — il faut le déployer.' })); return; }
    if (!d.offres.length) { el.appendChild(h('div.outils', [h('span.doux.petit', { text: 'Aucune offre de fidélité Hyundai lue. Dans SmartPortal (Pistes de vente), choisissez la liste « HACC CRM -- HACC CRM - Loyalty Special Offer », puis cliquez le favori :' })].concat(boutonsFidelite()))); return; }
    /* 7 nov. (Maxime : « pourquoi avoir séparé les 37 ? je les veux tous ensemble ») : plus de tableau à part. La tuile « Offres
       de fidélité » met toutes les offres actives dans la liste des comptes : les clients de Hyundai Finance avec leur contrat,
       les autres sur une ligne « Aucun contrat chez Hyundai Finance — client à appeler ». Cette barre ne garde que le résumé,
       les expirées (date en rouge) et les boutons. */
    var act = d.offres.filter(function (o) { return o.active; }), avec = act.filter(function (o) { return o.comptes && o.comptes.length; });
    var nExp = d.offres.length - act.length, nDbl = act.filter(function (o) { return o.type === 'double'; }).length, etat = d.etats && d.etats[this.cie];
    var dansListe = this.filtres.quoi === 'fidelite' && !this.ia;
    var resume = AMX.fmtNombre(act.length) + ' offre' + (act.length > 1 ? 's' : '') + ' active' + (act.length > 1 ? 's' : '') + (nDbl === act.length && act.length ? ' (toutes en double fidélité)' : ' (' + nDbl + ' double' + (nDbl > 1 ? 's' : '') + ')')
      + ' · ' + avec.length + ' avec contrat Hyundai Finance · ' + (act.length - avec.length) + ' à appeler' + (nExp ? ' · ' + nExp + ' expirée' + (nExp > 1 ? 's' : '') : '') + (etat && etat.le ? ' · lues le ' + AMX.fmtDate(etat.le) : '');
    var voir = dansListe ? null : h('button.btn.petit.primaire', { type: 'button', text: 'Voir les ' + act.length + ' offres dans la liste', onclick: function () { self.ia = null; self.filtres.quoi = 'fidelite'; self.rendre(); } });
    var exp = nExp ? h('label.case.eq-fid-exp', [h('input', { type: 'checkbox', checked: this.fidExpirees ? 'checked' : null, onchange: function (ev) { self.fidExpirees = ev.target.checked; if (self.filtres.quoi !== 'fidelite') { self.filtres.quoi = 'fidelite'; self.rendre(); } else { self.rendreFidelite(); self.rendreTable(); } } }), ' Inclure les ' + nExp + ' expirée' + (nExp > 1 ? 's' : '') + ' (date en rouge)']) : null;
    var xl = h('button.btn.petit', { type: 'button', text: 'Exporter les offres', onclick: function () { self.exporterFidelite(); } });
    el.appendChild(h('div.eq-fid-barre', [h('div', [h('b', { text: 'Offres de fidélité Hyundai' }), h('span', { text: ' · ' + resume })]),
      h('p.doux.petit', { style: { margin: '2px 0 0' }, text: 'Liste « HACC CRM – Loyalty Special Offer » de SmartPortal (J.D. Power). Fidélité : 1 point de moins sur le taux du programme du manufacturier ; double fidélité : 2 points (jamais sous 0 %). Le client présente son code PIN avant la date d\'expiration.' + (d.contact ? '' : ' Coordonnées et codes PIN : réservés aux comptes qui ont l\'accès aux coordonnées.') }),
      h('div.outils', [voir, exp, xl].concat(boutonsFidelite()))]));
  };
  /** Les offres de fidélité qui n'ont pas de ligne de contrat dans la liste (sans contrat Hyundai Finance, ou expirées). */
  VueEquite.prototype.offresSeules = function () {
    var d = FID[this.cie] && FID[this.cie].donnees; if (!d || !d.offres) return [];
    var f = this.filtres, q = AMX.motsCherches ? AMX.motsCherches(f.q) : String(f.q || '').toLowerCase(), self = this;
    return d.offres.filter(function (o) {
      if (o.active && o.comptes && o.comptes.length) return false;   /* déjà dans la liste, avec son contrat */
      if (!o.active && !self.fidExpirees) return false;
      if (q.length && !(AMX.correspond ? AMX.correspond([o.prenom, o.nom, o.courriel, o.telephone, o.ville, o.codePostal, o.pin, o.offre], q) : [o.prenom, o.nom, o.ville].join(' ').toLowerCase().indexOf(q) >= 0)) return false;
      return true;
    }).sort(function (a, b) { return (b.active ? 1 : 0) - (a.active ? 1 : 0) || String(a.expiration).localeCompare(String(b.expiration)) || String(a.nom).localeCompare(String(b.nom)); });
  };
  /** Une ligne de la liste pour une offre sans contrat chez Hyundai Finance (mêmes colonnes que les comptes). */
  VueEquite.prototype.rangeeOffre = function (o, contact) {
    var d = FID[this.cie] && FID[this.cie].donnees, voitContact = !!(d && d.contact);
    var ok = o.active && String(o.expiration || '') >= iso(new Date());
    var vide = function () { return h('td.num', [h('span.eq-nul', { text: '—' })]); };
    var nom = [o.prenom, o.nom].filter(Boolean).join(' ') || '—';
    var titre = [nom, [o.ville, o.codePostal].filter(Boolean).join(' · '), voitContact ? [o.telephone, o.courriel].filter(Boolean).join(' · ') : ''].filter(Boolean).join('\n');
    var tel = voitContact && o.telephone ? h('a', { href: 'tel:' + o.telephone.replace(/[^\d+]/g, ''), text: o.telephone }) : null;
    var mail = voitContact && o.courriel ? h('a.eq-mail', { href: 'mailto:' + o.courriel, text: '✉', title: o.courriel }) : null;
    var puce = h('span.puce.eq-fid-puce', { text: (o.type === 'double' ? 'Fid ×2' : 'Fid'), title: texteFidelite(o) + (o.offre ? ' — offre nº ' + o.offre : '') });
    var date = o.expiration ? h('span.' + (ok ? 'eq-exp-ok' : 'eq-exp-non'), { text: (ok ? 'exp. ' : 'expirée ') + AMX.fmtDateCourte(o.expiration), title: ok ? 'Offre valide jusqu\'au ' + AMX.fmtDate(o.expiration) : 'Offre expirée le ' + AMX.fmtDate(o.expiration) }) : null;
    return h('tr.eq-offre-seule', [
      h('td', { title: titre }, [h('div.nom.coupe', { text: nom }), h('div.sous.coupe', [tel || h('span', { text: court(o.ville, 18) }), mail ? ' ' : '', mail]), h('div.eq-puces', [puce, date])]),
      h('td', [h('div.doux.coupe', { text: o.vehicule && !/any\/all/i.test(o.vehicule) ? o.vehicule : '—' })]),
      h('td', { title: 'Aucun contrat chez Hyundai Finance' + (o.active ? ' — client à appeler' : ' — offre expirée') }, [h('div.coupe', { text: 'Aucun contrat HMF' }), h('div.sous.coupe', { text: o.active ? 'à appeler' : 'offre expirée' })]),
      vide(), vide(), vide(), vide(), vide(),
      h('td', { title: (o.offre ? 'Offre nº ' + o.offre : 'Offre de fidélité') + (voitContact && o.pin ? '\nCode PIN ' + o.pin : '') + (o.recuLe ? '\nReçue le ' + AMX.fmtDate(o.recuLe) : '') }, [h('div.coupe', { text: 'Offre ' + (o.offre ? 'nº ' + o.offre : 'fidélité') }), h('div.sous.coupe.pin', { text: voitContact && o.pin ? 'PIN ' + o.pin : '' })]),
      h('td', [h('span.eq-nul', { text: '—' })]),
      h('td', [h('span.eq-nul', { text: '—' })])
    ]);
  };
  VueEquite.prototype.exporterFidelite = function () {
    if (typeof XLSX === 'undefined') { AMX.toast('Export Excel indisponible (SheetJS non chargé).', 'erreur'); return; }
    var d = FID[this.cie] && FID[this.cie].donnees; if (!d) return;
    var rows = d.offres.map(function (o) { return { 'Prénom': o.prenom, 'Nom': o.nom, 'Téléphone': o.telephone || '', 'Courriel': o.courriel || '', 'Adresse': o.adresse || '', 'Ville': o.ville || '', 'Code postal': o.codePostal || '', 'Offre': texteFidelite(o), 'No de l\'offre': o.offre, 'Code PIN': o.pin || '', 'Expire le': o.expiration, 'Active': o.active ? 'oui' : 'non (expirée)', 'Reçue le': o.recuLe, 'Contrat Hyundai Finance': (o.comptes || []).join(', '), 'Trouvé par': o.par === 'courriel' ? 'courriel' : (o.par === 'nom' ? 'nom et code postal' : ''), 'Piste SmartPortal': o.id }; });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Fidélité');
    XLSX.writeFile(wb, 'fidelite-hyundai-' + iso(new Date()) + '.xlsx');
  };
  /** Les tuiles : chacune filtre la liste ; leur nombre porte sur ce que les autres filtres gardent. */
  VueEquite.prototype.rendreTuiles = function () {
    var self = this, el = this.elTuiles; if (!el) return;
    AMX.vider(el);
    var base = this.visibles('quoi'), n = function (f) { return base.filter(f).length; };
    var nCalculUS = n(function (r) { return r.exportable && r.grosUS !== null; }), nSans = n(function (r) { return r.sansValeur; }), nMeilleurUS = n(function (r) { return r.meilleurUS; });
    var carte = function (cls, nom, nb, bas, quoi) { var b = h('button.eq-tuile.' + cls + (!self.ia && self.filtres.quoi === quoi ? '.actif' : ''), { type: 'button', 'aria-pressed': !self.ia && self.filtres.quoi === quoi ? 'true' : 'false' }, [h('div.nom', { text: nom }), h('div.n', { text: AMX.fmtNombre(nb) }), bas ? h('div.bas', { text: bas }) : null]); b.addEventListener('click', function () { self.ia = null; self.filtres.quoi = quoi; self.rendre(); }); return b; };
    [carte('sombre', 'Comptes', base.length, n(function (r) { return r.location; }) + ' locations · ' + n(function (r) { return !r.location; }) + ' financements', 'tous'),
      carte('vert', 'Cibles', n(function (r) { return r.cible; }), 'nouvelle mensualité ≤ actuelle + ' + fmt$(this.params.marge), 'cibles'),
      carte('bleu', 'Équité positive', n(function (r) { return r.equite !== null && r.equite > 0; }), 'valeur > dette (aujourd\'hui)', 'equite'),
      carte('ambre', 'Échéance ≤ 6 mois', n(function (r) { return r.echeanceProche; }), 'contrats qui finissent bientôt', 'proches'),
      carte(nSans ? 'rouge' : 'gris', 'Sans valeur', nSans, nSans ? (SYNCS[this.cie] && SYNCS[this.cie].enCours ? 'lecture OpenLane en cours' : 'à synchroniser avec OpenLane') : 'tout est valorisé', 'sansValeur'),
      carte('bleu', 'Exportables É.-U.', n(function (r) { return r.exportable; }), nCalculUS + ' avec le gros É.-U. calculé', 'exportables'),
      carte(nMeilleurUS ? 'vert' : 'gris', 'Plus payant aux É.-U.', nMeilleurUS, 'gros É.-U. − dette > équité au Canada', 'meilleurUS'),
      (function () { var l = base.filter(function (r) { return r.sauver; }), tot = 0; l.forEach(function (r) { tot += r.interetSauve || 0; }); return carte(l.length ? 'vert' : 'gris', 'Sauver de l\'intérêt', l.length, 'taux ≥ ' + String(nombre(self.params.ecartTaux) !== null ? nombre(self.params.ecartTaux) : 2).replace('.', ',') + ' pts au-dessus d\'aujourd\'hui' + (tot ? ' · ≈ ' + fmt$(tot) + ' d\'intérêts' : ''), 'interet'); })(),
      carte('violet', 'En suivi', n(function (r) { return r.compte.suivi; }), 'contactés, rendez-vous, vendus', 'suivi'),
      estHmf(this.cie) ? (function () {
        /* 7 nov. : la tuile compte les offres actives (37), pas seulement les clients de Hyundai Finance ; un clic montre ceux-ci
           dans la liste ET ouvre la carte des offres. */
        var dF = FID[self.cie] && FID[self.cie].donnees, nAct = dF && dF.offres ? dF.offres.filter(function (o) { return o.active; }).length : null;
        var nListe = n(function (r) { return r.fidelite; });
        var b = carte('vert', 'Offres de fidélité', nAct === null ? nListe : nAct, nAct === null ? 'taux du programme réduit' : nListe + ' avec contrat Hyundai Finance · ' + Math.max(0, nAct - nListe) + ' à appeler · toutes dans la liste', 'fidelite');
        return b;
      })() : null
    ].forEach(function (b) { if (b) el.appendChild(b); });
  };
  VueEquite.prototype.peutLireOpenlane = function () {
    if (!AMX.openlane || !AMX.openlane.direct || AMX.openlane.enDirect() === false) return false;
    return !AMX.perm || AMX.perm('ficheAchat') || AMX.perm('changerStatut') || AMX.perm('gererUtilisateurs') || (AMX.estAdmin && AMX.estAdmin());
  };
  /* Les comptes à lire sur OpenLane (6 nov.) : sans valeur, ou valeur de plus de 30 jours, ou km estimé à plus de 10 000 km de
     celui de la lecture. `relire` = aussi ceux déjà essayés depuis l'ouverture de la page ; `sansValeurSeulement` = lecture
     automatique de l'ouverture. */
  /* 6 nov. (Maxime) : un NIV lu chez OpenLane depuis moins de 15 jours n'est pas relu par la synchronisation, même sans valeur
     trouvée ni écart de km (la lecture d'un seul client, dans sa ligne ou le détail de sa valeur, reste possible). */
  var OL_VIEUX_J = 30, OL_ECART_KM = 10000, OL_FRAIS_J = 15;
  /* 6 nov. (Maxime) : « la synchronisation OpenLane doit continuer même quand je change de page ». La lecture appartient au
     module, une par concession, pas à la page : quitter Équité ne l'arrête plus ; en revenant, la page la retrouve. Elle
     s'arrête avec le bouton « Arrêter », à la déconnexion, ou si l'onglet du site est fermé. */
  var SYNCS = {}, ESSAYES = {}, SYNC_AUTO = {};
  function syncAnnoncer(cie, fini) { try { document.dispatchEvent(new CustomEvent('amx:equiteSync', { detail: { cie: cie, fini: !!fini } })); } catch (e) {} }
  VueEquite.prototype.aLire = function (relire, sansValeurSeulement) {
    var self = this, lim = Date.now() - OL_VIEUX_J * JOUR_MS, frais = Date.now() - OL_FRAIS_J * JOUR_MS;
    return (this.lignes || []).filter(function (r) {
      var vin = texte(r.compte.vin).toUpperCase();
      if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return false;
      if (!relire && ESSAYES[vin]) return false;
      var o = r.openlane || {}, t = Date.parse(String(o.luLe || '').replace(' ', 'T'));
      if (t && t >= frais) return false;
      if (r.sansValeur) return true;
      if (sansValeurSeulement) return false;
      if (!t || t < lim) return true;
      var km = nombre(o.km);
      return !!(r.kmEstime && km !== null && Math.abs(km - r.kmEstime) > OL_ECART_KM);
    });
  };
  /** Le gros bouton du haut de la page : lancer ou arrêter la synchronisation. */
  VueEquite.prototype.basculerSync = function () {
    if (SYNCS[this.cie] && SYNCS[this.cie].enCours) { SYNCS[this.cie].arret = true; this.majSync(); return; }
    if (!this.peutLireOpenlane()) { AMX.toast(AMX.openlane && AMX.openlane.enDirect && AMX.openlane.enDirect() === false ? 'OpenLane n\'est pas connecté au site : un administrateur doit recliquer le favori « Automax ← OpenLane » dans OpenLane.' : 'La lecture OpenLane demande le droit « Fiche d\'achat » ou « Changer le statut ».', 'attention', 7000); return; }
    var neufs = this.aLire(false).length;
    if (!neufs && !this.aLire(true).length) { AMX.toast('Valeurs OpenLane à jour : chaque compte a une valeur lue il y a moins de ' + OL_VIEUX_J + ' jours.', 'ok'); this.majSync(); return; }
    this.synchroniser(!neufs);
  };
  /** Lit sur OpenLane, 3 à la fois, la valeur des comptes de la concession (voir aLire) ; la page se recalcule à mesure. */
  VueEquite.prototype.synchroniser = function (relire, sansValeurSeulement) {
    var cie = this.cie;
    if (SYNCS[cie] && SYNCS[cie].enCours) return;
    if (relire) Object.keys(ESSAYES).forEach(function (k) { delete ESSAYES[k]; });
    /* la liste est figée au départ (NIV + km estimé) : la lecture n'a plus besoin de la page */
    var aLire = this.aLire(relire, sansValeurSeulement).map(function (r) { return { vin: texte(r.compte.vin).toUpperCase(), km: r.kmEstime || '' }; });
    if (!aLire.length) { this.majSync(); return; }
    var s = SYNCS[cie] = { cie: cie, total: aLire.length, faits: 0, valorises: 0, sansResultat: 0, erreurs: 0, enCours: true, arret: false, message: '', debut: Date.now() };
    var i = 0, actifs = 0, PAR = 3;
    var fin = function () {
      if (!s.enCours) return; s.enCours = false; s.finLe = Date.now(); syncAnnoncer(cie, true);
      /* sur une autre page : un mot quand c'est fini */
      if (!document.querySelector('.eq-sync') && !s.arret) AMX.toast('Synchronisation OpenLane terminée — ' + nomCie(cie) + ' : ' + AMX.fmtNombre(s.valorises) + ' valorisée' + (s.valorises > 1 ? 's' : '') + ' sur ' + AMX.fmtNombre(s.total) + '.', 'ok', 6000);
    };
    var suivant = function () {
      if (s.arret) { if (!actifs) fin(); return; }
      while (actifs < PAR && i < aLire.length) lancer(aLire[i++]);
      if (!actifs && i >= aLire.length) fin();
    };
    var lancer = function (x0) {
      actifs++;
      ESSAYES[x0.vin] = 1;
      AMX.openlane.direct(x0.vin, x0.km, { source: 'equite', compagnie: cie }).then(function (x) {
        if (x && x.nonConnecte) { s.arret = true; s.message = x.erreur || 'OpenLane n\'est pas connecté au site : un administrateur doit recliquer le favori « Automax ← OpenLane » dans OpenLane.'; }
        else if (x && x.refuse) { s.arret = true; s.message = x.erreur || 'Lecture OpenLane refusée pour ce compte.'; }
        else if (x && x.ok && x.valeur && (nombre(x.valeur.prevision) || nombre(x.valeur.prixMoy))) s.valorises++;
        else s.sansResultat++;
      }).catch(function (e) {
        s.erreurs++; s.message = 'OpenLane — ' + AMX.erreurTexte(e);
        if (s.erreurs >= 5) s.arret = true;
      }).then(function () {
        actifs--; s.faits++;
        syncAnnoncer(cie, false);
        suivant();
      });
    };
    syncAnnoncer(cie, false);
    suivant();
  };
  /** Le gros bouton du haut de la page (passé par la page : ctx.boutonSync) suit la lecture. */
  VueEquite.prototype.majBouton = function () {
    var b = this.ctx.boutonSync; if (!b) return;
    var s = SYNCS[this.cie] || null, peut = this.peutLireOpenlane();
    var n = this.lignes && this.lignes.length ? this.aLire(false).length : 0;
    b.disabled = !(this.lignes && this.lignes.length);
    b.classList.toggle('en-cours', !!(s && s.enCours));
    b.innerHTML = s && s.enCours ? I.rafraichir + '<span>Arrêter · ' + AMX.fmtNombre(s.faits) + ' / ' + AMX.fmtNombre(s.total) + '</span>'
      : I.rafraichir + '<span>Synchroniser OpenLane' + (n ? ' (' + AMX.fmtNombre(n) + ')' : '') + '</span>';
    b.title = !peut ? 'La lecture OpenLane n\'est pas offerte : OpenLane pas connecté au site, ou droit « Fiche d\'achat » / « Changer le statut » manquant.'
      : (s && s.enCours ? 'Arrêter la lecture des valeurs OpenLane' : (n ? 'Lire sur OpenLane la valeur de ' + AMX.fmtNombre(n) + ' compte' + (n > 1 ? 's' : '') + ' (sans valeur, ou lue il y a plus de ' + OL_VIEUX_J + ' jours ; un NIV lu depuis moins de ' + OL_FRAIS_J + ' jours est passé) : l\'équité et la nouvelle mensualité se recalculent à mesure.' : 'Toutes les valeurs ont moins de ' + OL_VIEUX_J + ' jours : un clic relit les comptes sans valeur.'));
  };
  VueEquite.prototype.majSync = function () {
    var self = this, el = this.elSync;
    this.majBouton();
    if (!el) return;
    AMX.vider(el);
    var s = SYNCS[this.cie] || null;
    var nSans = this.lignes.filter(function (r) { return r.sansValeur; }).length, n = this.lignes.length, nVieux = this.aLire(true).length - nSans;
    el.className = 'eq-sync';
    if (s && s.enCours) {
      el.classList.add('encours');
      el.appendChild(h('div.eq-sync-txt', [h('b', { text: 'Synchronisation OpenLane : ' }), AMX.fmtNombre(s.faits) + ' / ' + AMX.fmtNombre(s.total) + ' lues · ' + AMX.fmtNombre(s.valorises) + ' valorisée' + (s.valorises > 1 ? 's' : '') + (s.sansResultat ? ' · ' + s.sansResultat + ' sans valeur chez OpenLane' : '') + ' — les calculs se mettent à jour à mesure.']));
      el.appendChild(h('div.eq-sync-barre', [h('span', { style: { width: Math.round(100 * s.faits / Math.max(1, s.total)) + '%' } })]));
      return;
    }
    if (s && s.message && s.arret) { el.classList.add('alerte'); el.appendChild(h('div.eq-sync-txt', { text: s.message })); return; }
    if (!this.peutLireOpenlane()) { el.appendChild(h('div.eq-sync-txt', { text: (nSans ? AMX.fmtNombre(nSans) + ' compte' + (nSans > 1 ? 's' : '') + ' sans valeur. ' : '') + (AMX.openlane && AMX.openlane.enDirect && AMX.openlane.enDirect() === false ? 'OpenLane n\'est pas connecté au site : un administrateur doit recliquer le favori « Automax ← OpenLane » dans OpenLane.' : 'La lecture OpenLane demande le droit « Fiche d\'achat » ou « Changer le statut ».') })); return; }
    if (!nSans && nVieux <= 0) { el.classList.add('ok'); el.appendChild(h('div.eq-sync-txt', { text: 'Valeurs OpenLane à jour : les ' + AMX.fmtNombre(n) + ' comptes ont une valeur de moins de ' + OL_VIEUX_J + ' jours.' })); return; }
    el.appendChild(h('div.eq-sync-txt', { text: (s ? 'Dernière synchronisation : ' + AMX.fmtNombre(s.valorises) + ' valorisée' + (s.valorises > 1 ? 's' : '') + ' sur ' + AMX.fmtNombre(s.total) + '. ' : '') + (nSans ? AMX.fmtNombre(nSans) + ' sans valeur' : '') + (nSans && nVieux > 0 ? ' · ' : '') + (nVieux > 0 ? AMX.fmtNombre(nVieux) + ' à rafraîchir (plus de ' + OL_VIEUX_J + ' jours)' : '') + (this.ctx.boutonSync ? ' — bouton « Synchroniser OpenLane » en haut de la page.' : '') }));
    if (!this.ctx.boutonSync) el.appendChild(h('button.btn.petit.primaire', { type: 'button', text: 'Synchroniser OpenLane', onclick: function () { self.basculerSync(); } }));
  };
  VueEquite.prototype.rendreTable = function () {
    var self = this, vis = this.visibles(), contact = !!(AMX.equite.enCache() && AMX.equite.enCache().contact);
    var seules = this.filtres.quoi === 'fidelite' && !this.ia && estHmf(this.cie) ? this.offresSeules() : [];
    if (this.elCompte) this.elCompte.textContent = seules.length ? AMX.fmtNombre(vis.length + seules.length) + ' offres de fidélité (' + AMX.fmtNombre(vis.length) + ' avec contrat Hyundai Finance)' : AMX.fmtNombre(vis.length) + ' / ' + AMX.fmtNombre(this.lignes.length) + ' comptes';
    AMX.vider(this.elTable);
    if (!vis.length && !seules.length) { this.elTable.appendChild(h('p.doux', { style: { padding: '14px', textAlign: 'center' }, text: this.filtres.quoi === 'cibles' ? 'Aucune cible avec ces paramètres : élargissez la marge, changez le terme, ou lisez les valeurs OpenLane des comptes sans valeur.' : 'Aucun compte ne correspond.' })); return; }
    var rows = vis.slice(0, 400).map(function (r) { return self.rangee(r, contact); }).concat(seules.map(function (o) { return self.rangeeOffre(o, contact); }));
    var largeurs = ['15%', '14%', '11%', '6%', '7%', '7%', '7%', '7%', '14%', '6%', '6%'];
    this.elTable.appendChild(h('table.tableau.eq-compact', [h('colgroup', largeurs.map(function (w) { return h('col', { style: { width: w } }); })), h('thead', [h('tr', [h('th', 'Client'), h('th', 'Véhicule'), h('th', { title: 'Type, terme, taux (* = estimé), échéance' }, 'Contrat'), h('th.num', { title: 'Paiement mensuel actuel' }, 'Paiem.'), h('th.num', { title: 'Valeur OpenLane au km estimé' }, 'Valeur'), h('th.num', { title: 'Dette du jour' }, 'Dette'), h('th.num', 'Équité'), h('th.num', { title: 'Gros É.-U. ($ CA) = MMR × taux du jour ajusté − ajustement, comparé à la dette' }, 'É.-U.'), h('th', 'Neuf proposé'), h('th', { title: 'Conseiller' }, 'Cons.'), h('th', 'Suivi')])]), h('tbody', rows)]));
    if (vis.length > 400) this.elTable.appendChild(h('p.doux.petit', { text: '… ' + (vis.length - 400) + ' autres : affinez les filtres ou exportez.' }));
  };
  /* 7 nov. (Maxime : « réduire la hauteur des lignes, c'est beaucoup trop gros ; faire des abréviations et refaire la dimension
     pour ne pas avoir à bouger le tableau de gauche à droite ») : une à trois lignes par client, le détail dans les infobulles,
     colonnes de largeur fixe (table-layout: fixed) — le tableau tient dans la page. */
  function court(s, n) { s = texte(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function fmtK(x) { if (x === null || x === undefined || isNaN(x)) return '—'; var a = Math.abs(x); return (x < 0 ? '−' : '') + (a >= 100000 ? Math.round(a / 1000) + ' k$' : (a >= 10000 ? (Math.round(a / 100) / 10).toFixed(1).replace('.', ',') + ' k$' : fmt$(a))); }
  function fmtKSigne(x) { if (x === null || x === undefined || isNaN(x)) return '—'; return (x > 0 ? '+' : '') + fmtK(x); }
  function moisAn(d) { var x = texte(d).slice(0, 7); return /^\d{4}-\d{2}$/.test(x) ? x.slice(5, 7) + '/' + x.slice(2, 4) : texte(d); }
  function nomCourt(n) { var m = texte(n).split('@')[0].replace(/[._]/g, ' ').trim().split(/\s+/); if (m.length < 2) return m[0] || ''; return m[0].charAt(0).toUpperCase() + '. ' + m[m.length - 1]; }
  function sourceDetteCourte(r) {
    var d = r.dette || {}, qui = r.gm ? 'GM' : (r.mode === 'vw' ? 'VW' : (r.mode === 'hmf' ? 'HMF' : 'BMW'));
    if (d.source === 'preteur') return qui + ' ' + AMX.fmtDateCourte(d.baseLe) + (d.paiements ? ' −' + d.paiements + ' m' : '');
    if (d.source === 'contrat') return 'calculée';
    if (d.source === 'fige') return qui + ' ' + AMX.fmtDateCourte(d.baseLe);
    return 'à calc.';
  }
  VueEquite.prototype.rangee = function (r, contact) {
    var self = this, c = r.compte;
    var cls = (r.cible ? '.cible' : '') + (r.sansValeur ? '.sans' : '');
    var contactEl = contact ? h('div.sous.eq-contact', [c.telephone ? h('a', { href: 'tel:' + c.telephone.replace(/[^\d+]/g, ''), text: c.telephone }) : null, c.courriel ? h('span', [' · ', h('a', { href: 'mailto:' + c.courriel, text: c.courriel })]) : null]) : null;
    var eqCls = r.equite === null ? '.eq-nul' : (r.equite >= 0 ? '.eq-pos' : '.eq-neg');
    var valeurEl = r.valeur !== null ? h('button.eq-valeur', { type: 'button', title: 'Valeur OpenLane ' + fmt$(r.valeur) + (r.kmEstime ? ' au km estimé de ' + AMX.fmtNombre(r.kmEstime) + ' km' : '') + ' — cliquez pour voir le calcul', onclick: function (ev) { ev.stopPropagation(); self.detailValeur(r); } }, [h('div', { text: fmtK(r.valeur) }), h('div.sous', { text: 'OL' + (r.kmEstime ? ' · ' + Math.round(r.kmEstime / 1000) + ' k km' : '') })]) : (AMX.openlane ? h('button.btn.petit', { type: 'button', text: 'Lire', title: 'Pas encore de valeur : lire OpenLane pour ce véhicule', onclick: function (ev) { ev.stopPropagation(); self.lireUn(r); } }) : h('span.valeur', { text: 'à lire' }));
    var autres = r.proposition && r.propositions.length > 1 ? r.propositions.filter(function (p) { return p !== r.proposition; }).map(function (p) { return p.vehicule + ' — ' + fmt$(p.mensualite) + ' / mois · ' + texteProposition(p); }).join('\n') : '';
    var neufEl = r.proposition ? h('div', { title: autres ? 'Autres scénarios DealDriver :\n' + autres : '' }, [h('div.nom', { text: r.proposition.vehicule || '—' }), h('div.sous', { text: texteProposition(r.proposition) + ' · DealDriver' + (r.propositions.length > 1 ? ' · +' + (r.propositions.length - 1) + ' autre' + (r.propositions.length > 2 ? 's' : '') : '') })])
      : r.neuf ? (function () {
          var nomN = [r.neuf.annee, r.neuf.modele, r.neuf.version].filter(Boolean).join(' ');
          var marque = { meme: '✓', proche: '≈', choisie: '✓', autre: '⚠', inconnue: '?' }[r.versionVoie || 'inconnue'];
          var vl = self.ligneVersion(r), bt = vl.querySelector('button');
          if (bt) { bt.textContent = 'changer'; }
          var titreV = (vl.querySelector('.v-txt') || {}).textContent || '';
          return h('div', { title: nomN + '\n' + texteNeuf(r) + (titreV ? '\n' + titreV : '') }, [h('div.nom.coupe', { text: nomN }),
            h('div.sous.coupe', [h('span.eq-v.' + (r.versionVoie || 'inconnue'), { text: marque + ' ' }), 'PDSF ' + fmtK(r.neuf.prix) + (r.neuf.etat === 'stock' ? ' · stock' : (r.neuf.etat ? ' · ' + (ETATS_NEUF[r.neuf.etat] || r.neuf.etat).toLowerCase() : '')), bt ? h('span', [' · ', bt]) : null])]);
        })() : h('span.sous', { text: 'Aucun neuf connu', title: 'Aucun ' + (c.modele || 'modèle semblable') + ' neuf connu (stock, commandes, ventes)' });
    var ecartsTr = ecartsTransaction(r), titreProg = '';
    if (r.programme && !r.programme.manquant) {
      titreProg = (r.programme.libelle ? 'Source : ' + r.programme.libelle + '\n' : '') + (r.programme.type === 'location' ? 'Location comparée à la location du client : même terme et mêmes km par année que son contrat (grille du programme du manufacturier).' : 'Financement comparé au financement du client : même terme que son contrat.') + '\n'
        + (r.programme.source === 'gm' ? 'Taux des scénarios de la Financière GM lus dans GM Dealer Direct ce mois-ci, au terme du contrat.' : 'Programmes du mois (Relance › Portefeuille clients).')
        + (r.programme.type === 'location' && r.residuelNeuf ? '\nRésiduel : ' + fmt$(r.residuelNeuf) + ' (PDSF × ' + String(r.programme.residuelPct).replace('.', ',') + ' %) · coût capitalisé net ' + fmt$(r.finance) + ' · taxes sur chaque paiement.' : '')
        + (r.programme.fidelite ? '\n\nOffre de fidélité de Hyundai Canada (' + (r.programme.fidelite.type === 'double' ? 'double fidélité' : 'fidélité') + (r.programme.fidelite.offre ? ', nº ' + r.programme.fidelite.offre : '') + (r.programme.fidelite.expiration ? ', expire le ' + AMX.fmtDate(r.programme.fidelite.expiration) : '') + ') : taux ' + String(r.programme.tauxAvantFidelite).replace('.', ',') + ' % − ' + r.programme.fidelite.pct + ' point' + (r.programme.fidelite.pct > 1 ? 's' : '') + ' = ' + String(r.programme.taux).replace('.', ',') + ' % (jamais sous 0 %).' : '')
        + (r.programme.rabaisD2c ? '\n\nRabais affichés pour ce neuf sur le site (D2C) :\n' + (AMX.rabaisD2c ? AMX.rabaisD2c.texte(r.programme.rabaisD2c) : '') + (r.programme.rabaisComptant ? '\nLe rabais au comptant (' + fmt$(r.programme.rabaisComptant) + ') ne se combine pas avec le taux du programme : pas compté.' : '') : '');
    }
    var mensEl;
    if (r.mensualite !== null) mensEl = h('div', [h('div' + (r.cible ? '.eq-pos' : ''), { text: fmt$(r.mensualite) + ' / mois' }), h('div.sous', { text: r.proposition ? (r.ecart !== null ? fmtSigne(r.ecart) + ' vs actuel · calcul GM' : 'calcul GM') : (r.sansValeur ? 'sans valeur d\'échange' : (fmtSigne(r.ecart) + ' vs actuel · ' + (r.programme && r.programme.type === 'location' ? 'coût capitalisé ' : 'financé ') + fmt$(r.finance))) }), r.programme ? h('div.sous.eq-prog.' + r.programme.source, { text: texteProgramme(r), title: titreProg }) : null, ecartsTr.length ? h('div.sous.eq-ecart-tr', { text: ecartsTr.join(' · '), title: 'Le programme ne donne pas exactement la transaction du contrat du client.' }) : null]);
    else if (r.programmeManquant) mensEl = h('div.eq-manquant', { title: 'Aucune mensualité : ' + r.programme.raison + '. Pas de taux ni de résiduel « par défaut ». Les Programmes du mois sont lus tout seuls sur le site de la concession ou chez le manufacturier ; un programme peut aussi être ajouté à la main dans Relance › Portefeuille clients › Programmes du mois.' }, [h('div', { text: 'Programme à trouver' }), h('div.sous', { text: texteManquant(r) })]);
    else mensEl = h('span.eq-nul', '—');
    var selSuivi = h('select.suivi', SUIVIS_ORDRE.map(function (k) { return h('option', { value: k, text: SUIVIS[k] }); }));
    selSuivi.value = c.suivi || '';
    selSuivi.disabled = !contact;
    selSuivi.addEventListener('change', function () {
      var val = selSuivi.value, note = c.suiviNote || '';
      var fin = function (n) { selSuivi.disabled = true; AMX.equite.suivi(self.cie, c.compte, val, n).then(function () { selSuivi.disabled = false; AMX.toast('Suivi enregistré : ' + SUIVIS[val] + '.', 'ok'); self.rendre(); }).catch(function (e) { selSuivi.disabled = false; selSuivi.value = c.suivi || ''; AMX.toast('Suivi non enregistré — ' + AMX.erreurTexte(e), 'erreur'); }); };
      if (val && AMX.modale) { var ta = h('textarea.saisie', { placeholder: 'Note (facultatif) : ce qui a été dit, le véhicule proposé…', value: note }); AMX.modale({ titre: SUIVIS[val] + ' — ' + nomClient(c), corps: ta, boutons: [{ texte: 'Enregistrer', classe: 'btn primaire', action: function () { fin(ta.value); return true; } }, { texte: 'Annuler', action: function () { selSuivi.value = c.suivi || ''; return true; } }] }); }
      else fin(note);
    });
    var titreClient = [nomClient(c), [c.ville, r.gm ? c.etatLead : c.compte].filter(Boolean).join(' · '), contact ? [c.telephone, c.courriel].filter(Boolean).join(' · ') : ''].filter(Boolean).join('\n');
    var puces = [];
    if (r.ndnc) puces.push(h('span.puce.eq-ndnc', { text: 'LNNTE', title: 'Ne pas téléphoner : inscrit à la Liste nationale de numéros de télécommunication exclus ou à la liste interne de la concession (GM Dealer Direct)' }));
    if (r.sauver) puces.push(h('span.puce.eq-int-puce', { text: 'Intérêt −' + String(Math.round(r.ecartTaux * 10) / 10).replace('.', ','), title: 'Sauver de l\'intérêt\nTaux du contrat ' + fmtTaux(r.tauxContrat) + (r.tauxSource === 'estime' ? ' (estimé à partir du rachat, du paiement et des mensualités qui restent : le prêteur ne donne pas le taux)' : ' (prêteur)') + '\nTaux du programme d\'aujourd\'hui ' + fmtTaux(r.tauxJour) + (r.programme && r.programme.libelle ? ' — ' + r.programme.libelle : '') + '\nÉcart : ' + String(r.ecartTaux).replace('.', ',') + ' points' + (r.interetMois ? '\nÀ dette égale (' + fmt$(r.solde) + ', ' + r.dette.n + ' mois) : ' + fmt$(r.interetMois) + ' de moins par mois, ≈ ' + fmt$(r.interetSauve) + ' d\'intérêts sauvés' : '') }));
    if (r.fidelite) puces.push(h('span.puce.eq-fid-puce', { text: (r.fidelite.type === 'double' ? 'Fid ×2' : 'Fid') + (r.fidelite.expiration ? ' ' + AMX.fmtDateCourte(r.fidelite.expiration) : ''), title: texteFidelite(r.fidelite) + ' — offre de fidélité de Hyundai Canada' + (r.fidelite.offre ? ' nº ' + r.fidelite.offre : '') + ' (SmartPortal) : ' + r.fidelite.pct + ' point' + (r.fidelite.pct > 1 ? 's' : '') + ' de moins sur le taux du programme.' + (r.fidelite.expiration ? '\nValide jusqu\'au ' + AMX.fmtDate(r.fidelite.expiration) : '') + (r.fidelite.pin ? '\nCode PIN : ' + r.fidelite.pin : '') + (r.fidelite.par === 'nom' ? '\nClient retrouvé par le nom et le code postal (pas le même courriel).' : '') }));
    if (r.exportable) puces.push(h('span.puce.eq-us-puce', { text: 'É.-U.', title: 'NIV fabriqué aux États-Unis : le véhicule peut être vendu aux É.-U. — voir la colonne « É.-U. ».' }));
    var telEl = contact && c.telephone ? h('a', { href: 'tel:' + c.telephone.replace(/[^\d+]/g, ''), text: c.telephone, onclick: function (ev) { ev.stopPropagation(); } }) : null;
    var mailEl = contact && c.courriel ? h('a.eq-mail', { href: 'mailto:' + c.courriel, text: '✉', title: c.courriel, onclick: function (ev) { ev.stopPropagation(); } }) : null;
    var veh = vehiculeTexte(c), vehCourt = r.mode === 'gm' ? veh : ([c.annee, c.modele, c.version].filter(Boolean).join(' ') || veh), typeC = (r.location ? 'Loc ' : 'Fin ') + (c.terme ? c.terme + 'm' : '');
    var titreContrat = (r.location ? 'Location' : 'Financement') + (c.terme ? ' ' + c.terme + ' mois' : '') + (r.tauxContrat !== null ? ' à ' + fmtTaux(r.tauxContrat) + (r.tauxSource === 'estime' ? ' (estimé : rachat, paiement, mensualités)' : '') : '') + (c.echeance ? '\nÉchéance ' + AMX.fmtDate(c.echeance) + (r.moisRestants !== null ? ' (' + r.moisRestants + ' mois)' : '') : '') + (r.location && c.kmContrat ? '\n' + AMX.fmtNombre(c.kmContrat) + ' km au contrat' + (c.usure === 'oui' ? ' · usure' : '') : '') + (c.neufUsage && /used|pre/i.test(c.neufUsage) ? '\nAcheté d\'occasion' : '');
    var titreDette = 'Dette du jour ' + fmt$(r.solde) + ' — ' + texteDette(r) + (r.location && r.soldeEcheance !== null ? '\nRésiduel ' + fmt$(r.soldeEcheance) : '') + '\nCliquez pour voir le calcul';
    var noteSuivi = [c.suiviNote, c.suiviLe ? AMX.fmtDateCourte(c.suiviLe) + (c.suiviPar ? ' · ' + String(c.suiviPar).split('@')[0] : '') : ''].filter(Boolean).join('\n');
    if (noteSuivi) selSuivi.title = noteSuivi;
    return h('tr' + cls, [
      h('td', { title: titreClient }, [h('div.nom.coupe', { text: nomClient(c) }), h('div.sous.coupe', [telEl || h('span', { text: court(c.ville, 18) }), mailEl ? ' ' : '', mailEl]), puces.length ? h('div.eq-puces', puces) : null]),
      h('td', { title: veh + (c.vin ? '\nNIV ' + c.vin : '') }, [h('div.coupe', { text: vehCourt }), h('div.vin.coupe', { text: c.vin ? '…' + String(c.vin).slice(-8) : '' })]),
      h('td', { title: titreContrat }, [h('div.coupe', { text: typeC + (r.tauxContrat !== null ? ' · ' + fmtTaux(r.tauxContrat) + (r.tauxSource === 'estime' ? '*' : '') : '') }), h('div.sous.coupe' + (r.echeanceProche ? '.eq-neg' : ''), { text: c.echeance ? 'éch. ' + moisAn(c.echeance) + (r.moisRestants !== null ? ' (' + r.moisRestants + ' m)' : '') : '' })]),
      h('td.num', { text: fmtK(nombre(c.paiement)) }),
      h('td.num', [valeurEl]),
      h('td.num', { title: titreDette }, [h('button.eq-dette', { type: 'button', text: fmtK(r.solde), onclick: function () { self.detailDette(r); } }), h('div.sous.coupe', { text: sourceDetteCourte(r) })]),
      h('td.num', { title: r.location && r.equiteEcheance !== null ? 'À l\'échéance : ' + fmtSigne(r.equiteEcheance) : '' }, [h('div' + eqCls, { text: r.equite === null ? '—' : fmtKSigne(r.equite) }), r.location && r.equiteEcheance !== null ? h('div.sous', { text: 'éch. ' + fmtKSigne(r.equiteEcheance) }) : null]),
      h('td.num.eq-us-cell', [self.celluleUS(r)]),
      h('td', [neufEl]),
      h('td', { title: c.conseiller || '' }, [h('div.coupe', { text: nomCourt(c.conseiller) || '—' })]),
      h('td', [selSuivi])
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
    lienEval.textContent = 'éval.';
    if (r.grosUS === null) return h('div.eq-us-vide', [T && T.taux ? mmrEl : h('span.sous', { text: 'taux…' }), h('div.sous', [lienEval])]);
    var cls = r.equiteUS === null ? '.eq-nul' : (r.equiteUS >= 0 ? '.eq-pos' : '.eq-neg');
    return h('div', { title: 'Gros É.-U. ' + fmt$(r.grosUS) + ' − dette ' + fmt$(r.solde) + (r.equite !== null ? ' ; au Canada (OpenLane) : ' + fmtSigne(r.equite) : '') }, [
      h('div' + cls, { text: r.equiteUS === null ? '—' : fmtKSigne(r.equiteUS) }),
      h('div.sous.coupe', { text: 'gros ' + fmtK(r.grosUS) + (r.meilleurUS && r.equite !== null ? ' · ★' : '') }),
      r.usSource === 'evaluation' ? h('div.sous', [lienEval]) : h('div.sous', [mmrEl])
    ]);
  };
  var VOIES_VERSION = { meme: 'même version', proche: 'même finition, ensemble différent', autre: 'autre version (la même n\'est pas connue)', choisie: 'version choisie', inconnue: 'version du client inconnue' };
  /** Sous le neuf proposé : la version comparée à celle du client, et le bouton pour en choisir une autre. */
  VueEquite.prototype.ligneVersion = function (r) {
    var self = this, vc = r.version, vn = r.neuf && r.neuf.ver, t = '';
    if (r.versionVoie === 'meme') t = 'Même version : ' + libelleVersion(vn);
    else if (r.versionVoie === 'proche') t = 'Même finition (' + (vc.libNiveau || vc.niveau) + ') — client : ' + libelleVersion(vc) + ' · neuf : ' + libelleVersion(vn);
    else if (r.versionVoie === 'autre') t = '⚠ Autre version — client : ' + libelleVersion(vc) + ' · neuf : ' + (libelleVersion(vn) || 'non précisée');
    else if (r.versionVoie === 'choisie') t = 'Version choisie : ' + (libelleVersion(vn) || 'non précisée') + (vc.niveau ? ' (client : ' + libelleVersion(vc) + ')' : '');
    else if (r.versionVoie === 'inconnue') t = 'Version du client inconnue' + (vn && vn.niveau ? ' · neuf : ' + libelleVersion(vn) : '');
    var n = 0, vus = {}; (r.famille || []).forEach(function (o) { if (!vus[o.ver.cle]) { vus[o.ver.cle] = 1; n++; } });
    return h('div.eq-version.' + (r.versionVoie || 'inconnue'), [h('span.v-txt', { text: t }), n > 1 || r.versionVoie === 'choisie' ? h('button', { type: 'button', text: 'Changer de version', onclick: function (ev) { ev.stopPropagation(); self.choisirVersion(r); } }) : null]);
  };
  /** Choisir la version de comparaison d'un client (gardée sur cet appareil) : les versions du modèle, avec leur nombre et le PDSF le plus bas. */
  VueEquite.prototype.choisirVersion = function (r) {
    var self = this, c = r.compte, cle = (c.compagnie || self.cie) + '|' + c.compte, choix = AMX.memo.lire('eq_versions', {}) || {}, actuel = choix[cle] || '';
    var groupes = {}, ordre = [];
    (r.famille || []).forEach(function (o) {
      var g = groupes[o.ver.cle];
      if (!g) { g = groupes[o.ver.cle] = { cle: o.ver.cle, ver: o.ver, n: 0, prixMin: null, meilleur: o }; ordre.push(g); }
      g.n++; if (g.prixMin === null || o.prix < g.prixMin) g.prixMin = o.prix;
      if (RANG_ETAT[o.etat] < RANG_ETAT[g.meilleur.etat]) g.meilleur = o;
    });
    ordre.sort(function (a, b) { return ((a.ver.rang === null ? 99 : a.ver.rang) - (b.ver.rang === null ? 99 : b.ver.rang)) || (a.prixMin - b.prixMin); });
    var fermer = null;
    var poser = function (k) { var m = AMX.memo.lire('eq_versions', {}) || {}; if (k) m[cle] = k; else delete m[cle]; AMX.memo.ecrire('eq_versions', m); if (fermer) fermer(); self.planifierRendu(0); AMX.toast(k ? 'Version de comparaison choisie pour ' + nomClient(c) + '.' : 'Comparaison automatique (même version que le client).', 'ok'); };
    var boutons = [h('button' + (!actuel ? '.actif' : ''), { type: 'button', onclick: function () { poser(''); } }, [h('div', [h('div.nom', { text: 'Automatique' }), h('div.sous', { text: 'La même version que le client (' + (libelleVersion(r.version) || 'inconnue') + '), sinon la plus proche' })]), h('div.droite', { text: '' })])];
    ordre.forEach(function (g) {
      var estClient = r.version.niveau && g.ver.niveau === r.version.niveau && ecartVersion(r.version, g.ver) === 0;
      boutons.push(h('button' + (actuel === g.cle ? '.actif' : ''), { type: 'button', onclick: function () { poser(g.cle); } }, [
        h('div', [h('div.nom', { text: libelleVersion(g.ver) || 'Version non précisée' }), estClient ? h('div.client', { text: 'Version du client' }) : null]),
        h('div.droite', [h('div', { text: 'PDSF dès ' + fmt$(g.prixMin) }), h('div', { text: g.n + ' neuf' + (g.n > 1 ? 's' : '') + ' · ' + ETATS_NEUF[g.meilleur.etat] })])
      ]));
    });
    var m = AMX.modale({ titre: 'Version de comparaison — ' + nomClient(c), corps: h('div', [h('p.doux', { style: { margin: '0 0 10px' }, text: vehiculeTexte(c) + ' · version du client : ' + (libelleVersion(r.version) || 'inconnue') }), h('div.eq-versions', boutons), h('p.doux.petit', { style: { margin: '10px 0 0' }, text: 'Le choix est gardé sur cet appareil. Le neuf proposé et la nouvelle mensualité se recalculent tout de suite.' })]), boutons: [{ texte: 'Fermer', action: function () { return true; } }] });
    fermer = m && m.fermer ? m.fermer : function () { var v = document.querySelector('.voile:last-of-type'); if (v) v.remove(); };
  };
  /** Le calcul de la valeur OpenLane d'un client : d'où vient la valeur, le km, la dette, l'équité, puis le détail d'OpenLane. */
  VueEquite.prototype.detailValeur = function (r) {
    var self = this, c = r.compte, ol = r.openlane || {}, lignes = [];
    var ligne = function (a, b, cls) { lignes.push(h('tr' + (cls || ''), [h('td', { text: a }), h('td.num', { text: b })])); };
    var quoi = r.valeurQuoi === 'prevision' ? 'Prévision d\'OpenLane pour ce NIV' + (nombre(ol.kmPrevision) ? ' à ' + AMX.fmtNombre(nombre(ol.kmPrevision)) + ' km' : '')
      : r.valeurQuoi === 'ajuste' ? 'Moyenne des ventes OpenLane, ajustée au km estimé du client'
      : 'Moyenne des ventes OpenLane (sans ajustement au km)';
    if (r.kmEstime) ligne('Km estimé du client' + (r.gm && nombre(c.kmEstime) ? ' (GM)' : (r.location && nombre(c.kmContrat) ? ' (km du contrat au prorata)' : ' (' + AMX.fmtNombre(this.params.kmAn) + ' km par année)')), AMX.fmtNombre(r.kmEstime) + ' km');
    if (r.valeurQuoi === 'ajuste' && nombre(ol.prixMoy) !== null) ligne('Prix moyen des ventes' + (nombre(ol.kmMoy) ? ' (' + AMX.fmtNombre(nombre(ol.kmMoy)) + ' km en moyenne)' : ''), fmt$(nombre(ol.prixMoy)));
    ligne(quoi, fmt$(r.valeur), '.total');
    if (r.solde !== null) ligne('Dette du jour (' + texteDette(r) + ')', '− ' + fmt$(r.solde));
    if (r.equite !== null) ligne('Équité', (r.equite >= 0 ? '' : '− ') + fmt$(Math.abs(r.equite)), '.total');
    var corpsOl = h('div', { style: { marginTop: '12px' } });
    AMX.modale({ titre: 'Valeur OpenLane — ' + nomClient(c), large: true, corps: h('div', [
      h('p.doux', { style: { margin: '0 0 8px' }, text: vehiculeTexte(c) + (c.vin ? ' · ' + c.vin : '') + (ol.luLe ? ' · lu chez OpenLane le ' + AMX.fmtDate(ol.luLe) : '') }),
      h('table.eq-dette-tab', [h('tbody', lignes)]),
      h('p.doux.petit', { style: { margin: '8px 0 0' }, text: 'Ordre de préférence : la prévision d\'OpenLane pour ce NIV, sinon la moyenne des ventes ajustée au km estimé, sinon la moyenne des ventes. Valeur de gros, pour l\'équipe seulement.' }),
      corpsOl
    ]), boutons: [{ texte: 'Fermer', action: function () { return true; } }] });
    /* le détail d'OpenLane ajuste au km estimé du client (le même que le calcul ci-dessus), pas au km de sa dernière lecture */
    var ligneOl = r.openlane ? Object.assign({}, r.openlane, r.kmEstime ? { km: r.kmEstime } : {}) : null;
    if (AMX.openlaneDetail) AMX.openlaneDetail(corpsOl, c.vin, ligneOl, { km: r.kmEstime || undefined, liens: false, surValeur: function () { self.planifierRendu(800); } });
  };
  VueEquite.prototype.lireUn = function (r) {
    var self = this, c = r.compte;
    if (!AMX.openlane || !AMX.openlane.direct) return Promise.resolve();
    AMX.toast('Lecture OpenLane de ' + vehiculeTexte(c) + '…', 'ok');
    return AMX.openlane.direct(c.vin, r.kmEstime || '', { source: 'equite', compagnie: self.cie }).then(function (x) {
      if (x && x.nonConnecte) { AMX.toast(x.erreur || 'OpenLane n\'est pas connecté au site.', 'attention', 6000); return x; }
      AMX.verifier(x, 'Lecture OpenLane impossible');
      ESSAYES[texte(c.vin).toUpperCase()] = 1;
      if (x && x.valeur && !nombre(x.valeur.prevision) && !nombre(x.valeur.prixMoy)) AMX.toast('OpenLane n\'a pas de valeur pour ce véhicule.', 'attention');
      self.planifierRendu(0);
      return x;
    }).catch(function (e) { AMX.toast('OpenLane — ' + AMX.erreurTexte(e), 'erreur'); });
  };
  VueEquite.prototype.exporter = function () {
    if (typeof XLSX === 'undefined') { AMX.toast('Export Excel indisponible (SheetJS non chargé).', 'erreur'); return; }
    var rows = this.visibles().map(function (r) { var c = r.compte; return { 'Client': nomClient(c), 'Téléphone': c.telephone || '', 'Courriel': c.courriel || '', 'Ville': c.ville || '', 'Compte': c.compte, 'Véhicule': vehiculeTexte(c), 'NIV': c.vin, 'Contrat': c.typeContrat, 'Terme': c.terme, 'Taux du contrat %': r.tauxContrat === null ? '' : r.tauxContrat, 'Taux du contrat : source': r.tauxSource === 'estime' ? 'estimé (rachat, paiement, mensualités)' : (r.tauxSource === 'preteur' ? 'prêteur' : ''), 'Échéance': c.echeance, 'Mois restants': r.moisRestants, 'Paiement actuel': c.paiement, 'Valeur': r.valeur, 'Source valeur': r.valeurSource, 'Dette du jour': r.solde === null ? '' : Math.round(r.solde * 100) / 100, 'Source de la dette': texteDette(r), 'Équité': r.equite === null ? '' : Math.round(r.equite), 'Fabriqué aux É.-U.': r.exportable ? 'oui' : '', 'Fidélité Hyundai': texteFidelite(r.fidelite), 'Fidélité : PIN': r.fidelite ? r.fidelite.pin || '' : '', 'Fidélité : expiration': r.fidelite ? r.fidelite.expiration || '' : '', 'Taux avant fidélité %': r.programme && r.programme.fidelite ? r.programme.tauxAvantFidelite : '', 'MMR ($ US)': r.mmr === null ? '' : r.mmr, 'Gros É.-U.': r.grosUS === null ? '' : Math.round(r.grosUS), 'Équité É.-U.': r.equiteUS === null ? '' : Math.round(r.equiteUS), 'Neuf proposé': r.proposition ? r.proposition.vehicule : (r.neuf ? [r.neuf.annee, r.neuf.modele, r.neuf.version].join(' ') : ''), 'PDSF neuf': r.neuf && !r.proposition ? r.neuf.prix : '', 'Neuf : état': r.neuf ? ETATS_NEUF[r.neuf.etat] : '', 'Neuf : source': r.neuf ? r.neuf.origine : '', 'Neuf : choix': r.neufVoie === 'remplacant' ? 'remplaçant' : (r.neufVoie === 'voisin' ? 'modèle voisin' : (r.neuf ? 'même modèle' : '')), 'Version du client': libelleVersion(r.version), 'Version du neuf': r.neuf ? libelleVersion(r.neuf.ver) : '', 'Neuf : version': VOIES_VERSION[r.versionVoie] || '', 'Ne pas téléphoner': r.ndnc ? 'oui' : '', 'Nouvelle mensualité': r.mensualite === null ? '' : Math.round(r.mensualite), 'Transaction du neuf': r.programme ? (r.programme.type === 'location' ? 'location' : 'financement') : '', 'Taux du neuf %': r.programme ? r.programme.taux : '', 'Terme du neuf': r.programme ? r.programme.terme : '', 'Km / an du neuf': r.programme && r.programme.type === 'location' ? r.programme.kmAn || '' : '', 'Résiduel du neuf %': r.programme && r.programme.type === 'location' ? r.programme.residuelPct || '' : '', 'Écart avec le contrat': r.programmeManquant ? 'programme à trouver : ' + r.programme.raison : ecartsTransaction(r).join(' · '), 'Rabais du manufacturier': r.programme ? r.programme.rabais || '' : '', 'Source du taux': r.programme ? r.programme.libelle : '', 'Écart / mois': r.ecart === null ? '' : Math.round(r.ecart), 'Taux d\'aujourd\'hui %': r.tauxJour === null ? '' : r.tauxJour, 'Écart de taux (pts)': r.ecartTaux === null ? '' : r.ecartTaux, 'Sauver de l\'intérêt': r.sauver ? 'oui' : '', 'Intérêts sauvés (estimé)': r.interetSauve === null ? '' : r.interetSauve, 'Intérêts sauvés / mois': r.interetMois === null ? '' : r.interetMois, 'Cible': r.cible ? 'oui' : '', 'Conseiller': c.conseiller || '', 'Suivi': SUIVIS[c.suivi || ''], 'Note': c.suiviNote || '' }; });
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
  var CODE_SIGNET_FIDELITE = "javascript:(function () { var SITE = " + JSON.stringify(AMX.SITE) + "; var ORIGINE_SITE = SITE.replace(/^(https?:\\/\\/[^\\/]+).*$/, '$1'); var DELAI_MS = 60000, TAILLE_LOT = 400, PAGE_CSI = 500; var hote = location.hostname; var PASSAGE = new Date().toISOString(); var mode = /hyundai-corp\\.io$/.test(hote) ? 'portail' : (/boostcx\\.com$/.test(hote) ? 'csi' : (/owb\\.vsp\\.autopartners\\.net$/.test(hote) ? 'owb' : (/field-reporting\\.inmoment\\.com$/.test(hote) ? 'inmoment' : (/salesreporting\\.bmwgroup\\.ca$/.test(hote) ? 'rdr' : (/^ivsrfe(-[a-z]+)?\\.bmwgroup\\.com$/.test(hote) ? 'ivsr' : (/(^|\\.)confirmit\\.ca$/.test(hote) ? 'forsta' : (/(^|\\.)vwhub\\.com$/.test(hote) ? 'omc' : (/(^|\\.)vwexperience\\.vw\\.ca$/.test(hote) ? 'cemvw' : (/(^|\\.)gmdealerdirect\\.ca$/.test(hote) ? 'gmdd' : (/^dealerportal\\.vwfinance\\.ca$/.test(hote) ? 'vwf' : (/(^|\\.)hmfdealer\\.ca$/.test(hote) ? 'hmf' : (/(^|\\.)smartdealerportal\\.com$/.test(hote) ? 'jdp' : '')))))))))))); if (!mode) { alert('Cliquez ce signet, connect\u00e9, sur un portail du constructeur : portail des ventes Hyundai, BoostCX, L\\'utilitaire des commandes GM (owb.vsp.autopartners.net), l\\'ISC GM (field-reporting.inmoment.com), le portail RDR BMW (salesreporting.bmwgroup.ca), IVS-R Ordering BMW (ivsrfe.bmwgroup.com, Order Locator) le CSI BMW Forsta (horizons.confirmit.ca), la console OMC de VW (www.vwhub.com) le portail 5-Star CEM de VW (reporting.vwexperience.vw.ca) GM Dealer Direct (www.gmdealerdirect.ca) le Dealer Extranet de VW Finance (dealerportal.vwfinance.ca, Portfolio Manager) le portail de Hyundai Finance (www.hmfdealer.ca, Customer Portfolio) ou SmartPortal de J.D. Power (home.smartdealerportal.com, Pistes, offres de fid\u00e9lit\u00e9 Hyundai).'); return; } if (window.__amxHyundai) { alert('Une lecture est d\u00e9j\u00e0 en cours dans cette page.'); return; } window.__amxHyundai = true; var passage = (window.__amxHyundaiPassage = (window.__amxHyundaiPassage || 0) + 1); var bande = document.createElement('div'); bande.setAttribute('style', 'position:fixed;left:16px;right:16px;bottom:16px;top:auto;width:auto;height:auto;max-height:40vh;box-sizing:border-box;z-index:2147483647;background:#0F7B4F;color:#fff;font:14px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;padding:12px 16px;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.35);display:flex;gap:14px;align-items:center;'); var etiquette = document.createElement('div'); etiquette.style.flex = '1'; var barre = document.createElement('div'); barre.setAttribute('style', 'height:6px;background:rgba(255,255,255,.25);border-radius:3px;margin-top:6px;overflow:hidden;'); var rempli = document.createElement('div'); rempli.setAttribute('style', 'height:100%;width:0;background:#fff;transition:width .3s;'); barre.appendChild(rempli); var boite = document.createElement('div'); boite.style.flex = '1'; boite.appendChild(etiquette); boite.appendChild(barre); var fermer = document.createElement('button'); fermer.textContent = 'Fermer'; fermer.setAttribute('style', 'background:rgba(255,255,255,.18);border:0;color:#fff;padding:6px 12px;border-radius:6px;cursor:pointer;font:inherit;'); var arrete = false; fermer.onclick = function () { arrete = true; bande.remove(); window.__amxHyundai = false; try { if (window.__amxPont && !window.__amxPont.closed) window.__amxPont.close(); } catch (e) {} }; bande.appendChild(boite); bande.appendChild(fermer); document.body.appendChild(bande); var titre = { portail: 'Portail Hyundai', csi: 'CSI Hyundai', owb: 'Portail GM', inmoment: 'CSI GM', rdr: 'Portail BMW', ivsr: 'IVS-R BMW', forsta: 'CSI BMW', omc: 'Portail VW', cemvw: 'CSI VW', gmdd: 'GM Dealer Direct', vwf: 'VW Finance', hmf: 'Hyundai Finance', jdp: 'Fid\u00e9lit\u00e9 Hyundai' }[mode]; function dire(t, pct) { etiquette.textContent = titre + ' \u2014 ' + t; if (pct !== undefined) rempli.style.width = Math.max(0, Math.min(100, pct)) + '%'; } function erreur(t) { bande.style.background = '#B42318'; dire(t, 100); window.__amxHyundai = false; try { if (window.__amxPont && !window.__amxPont.closed) window.__amxPont.close(); } catch (e) {} } var pont = window.open(SITE + 'pont.html?v=' + Date.now(), 'amxPont', 'width=460,height=240,menubar=no,toolbar=no,location=no,status=no'); if (!pont) { erreur('Chrome a bloqu\u00e9 la petite fen\u00eatre du site : autorisez les fen\u00eatres pop-up pour ' + hote + ' (ic\u00f4ne \u00e0 droite de la barre d\\'adresse), puis recliquez le signet.'); return; } window.__amxPont = pont; var attentes = {}, compteur = 0, pret = null; window.addEventListener('message', function (ev) { if (ev.source !== pont) return; var m = ev.data || {}; if (m.type === 'amx:pret' && pret) { pret(m); pret = null; } if (m.type === 'amx:resultat' && attentes[m.id]) { attentes[m.id](m.resultat); delete attentes[m.id]; } }); function attendrePont() { return new Promise(function (res, rej) { var fini = false; pret = function (m) { fini = true; res(m); }; var essais = 0; (function ping() { if (fini) return; essais++; try { pont.postMessage({ type: 'amx:ping' }, ORIGINE_SITE); } catch (e) {} if (pont.closed) { rej(new Error('La petite fen\u00eatre du site a \u00e9t\u00e9 ferm\u00e9e : recliquez le signet et laissez-la ouverte.')); return; } if (essais > 60) { rej(new Error('Le site d\\'inventaire ne r\u00e9pond pas.')); return; } setTimeout(ping, 500); })(); }); } function fermerPontPlusTard() { setTimeout(function () { try { if (window.__amxHyundaiPassage === passage && !pont.closed) pont.close(); } catch (e) {} }, 1500); } function lecture(requete) { return new Promise(function (res) { var id = 'lec' + (++compteur); attentes[id] = res; pont.postMessage({ type: 'amx:lecture', id: id, requete: requete }, ORIGINE_SITE); setTimeout(function () { if (attentes[id]) { delete attentes[id]; res({ ok: false, erreur: 'Pas de r\u00e9ponse du site (d\u00e9lai).' }); } }, 60000); }); } function envoyer(corps) { return new Promise(function (res) { var id = 'lot' + (++compteur); attentes[id] = res; pont.postMessage({ type: 'amx:lot', id: id, corps: corps }, ORIGINE_SITE); setTimeout(function () { if (attentes[id]) { delete attentes[id]; res({ ok: false, erreur: 'Pas de r\u00e9ponse du site (d\u00e9lai).' }); } }, 240000); }); } function verifier(rep, quoi) { if (rep && rep.refuse && !rep.erreur) throw new Error('Votre session du site d\\'inventaire a expir\u00e9 : reconnectez-vous sur ' + SITE + ' dans un onglet, puis recliquez le signet.'); if (!rep || rep.ok === false || rep.refuse) throw new Error('Le site a refus\u00e9 ' + quoi + ' : ' + ((rep && rep.erreur) || 'erreur inconnue')); return rep; } function appel(url, opts) { opts = opts || {}; var ctl = (typeof AbortController === 'function') ? new AbortController() : null; var minuterie = ctl ? setTimeout(function () { ctl.abort(); }, DELAI_MS) : null; var entetes = opts.entetes || { Accept: 'application/json' }; return fetch(url, { method: opts.corps ? 'POST' : 'GET', credentials: opts.credentials || 'include', headers: entetes, body: opts.corps, signal: ctl ? ctl.signal : undefined }) .then(function (r) { if (minuterie) clearTimeout(minuterie); if (r.status === 401 || r.status === 403) { var e = new Error('session refus\u00e9e (' + r.status + ') : reconnectez-vous, puis recliquez le signet'); e.session = true; throw e; } if (!r.ok) throw new Error('HTTP ' + r.status); return r.text().then(function (t) { if (/<html/i.test(t.slice(0, 200))) { var e2 = new Error('la page de connexion a r\u00e9pondu \u00e0 la place des donn\u00e9es : reconnectez-vous, puis recliquez le signet'); e2.session = true; throw e2; } try { return t ? JSON.parse(t) : null; } catch (e3) { throw new Error('r\u00e9ponse illisible'); } }); }, function (e) { if (minuterie) clearTimeout(minuterie); throw new Error(e && e.name === 'AbortError' ? 'd\u00e9lai d\u00e9pass\u00e9' : (e && e.message || String(e))); }); } function texte(v) { return v === null || v === undefined ? '' : String(v).trim(); } function nombre(v) { if (v === null || v === undefined || v === '') return null; if (typeof v === 'number') return isNaN(v) ? null : v; var n = parseFloat(String(v).replace(/[^0-9.\\-]/g, '')); return isNaN(n) ? null : n; } function dateSap(v) { var s = texte(v); if (!s || /^0000/.test(s)) return ''; var m = /\\/Date\\((-?\\d+)\\)\\//.exec(s); if (m) return iso(new Date(parseInt(m[1], 10))); return s.slice(0, 10); } function iso(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); } function yyyymmdd(d) { return iso(d).replace(/-/g, ''); } function ilYa(jours) { return new Date(Date.now() - jours * 86400000); } function alerteVentes(rv) { var r = rv && rv.resume; return r && r.retraitRefuse ? ' \u26a0 Lecture partielle des ventes : ' + r.retraitRefuse + ' RDR connus du site n\\'ont pas \u00e9t\u00e9 revus \u2014 ils sont conserv\u00e9s ; relancez le favori plus tard.' : ''; } function lots(liste, taille) { var out = []; for (var i = 0; i < liste.length; i += taille) out.push(liste.slice(i, i + taille)); return out; } function jdpMagasin() { var el = document.querySelector('[data-v-app]'), app = el && el.__vue_app__; var st = app && app.config && app.config.globalProperties && app.config.globalProperties.$store; return st && st.state && st.state.dwc ? st.state.dwc : null; } function jdpDonnees() { var d = jdpMagasin(), x = d && d.ViewLeadsSearchData; return x && Array.isArray(x.content) ? x : null; } function jdpOffre(c) { c = texte(c); if (!/fid[\u00e9e]lit[\u00e9e]|loyalty/i.test(c)) return null; var dbl = /double\\s+(fid[\u00e9e]lit[\u00e9e]|loyalty)/i.test(c); var no = /\\((?:n\\s*[\u00bao\u00b0]\\.?|#)\\s*([\\d-]+)\\)/i.exec(c), pin = /(?:code\\s*PIN|PIN\\s*code)\\s*:\\s*([A-Z0-9]+)/i.exec(c), exp = /expiration[^:]*:\\s*(\\d{4}-\\d{2}-\\d{2})/i.exec(c); return { offre: no ? no[1] : '', type: dbl ? 'double' : 'simple', pin: pin ? pin[1].toUpperCase() : '', expiration: exp ? exp[1] : '', langue: /fid[\u00e9e]lit/i.test(c) ? 'fr' : 'en' }; } function jdpPiste(x) { x = x || {}; var c = texte(x.comments), prog = texte(x.leadProgramName || x.leadSourceAndLeadProgram), o = jdpOffre(c); if (!o && !/loyalty|fid[\u00e9e]lit/i.test(prog)) return null; o = o || {}; return { id: texte(x.id || x.leadUid), commentaire: c.slice(0, 500), offre: o.offre || '', type: o.type || '', pin: o.pin || '', expiration: o.expiration || '', langue: o.langue || '', recuLe: texte(x.dateReceived || x.dateReceivedWithTimeWithTimeZone), prenom: texte(x.firstName), nom: texte(x.lastName), courriel: texte(x.email), telephone: texte(x.phone), adresse: texte(x.address), ville: texte(x.city), province: texte(x.state), codePostal: texte(x.zipCode), vehicule: [x.year, x.make, x.model].map(texte).filter(Boolean).join(' '), programme: prog, statut: texte(x.leadStatus) }; } async function passageJdp() { if (!/viewLeads/i.test(location.hash)) { erreur('Ouvrez \u00ab Pistes de vente \u00bb (View Leads) dans SmartPortal, choisissez la liste \u00ab HACC CRM -- HACC CRM - Loyalty Special Offer \u00bb, puis recliquez le favori.'); return; } if (!jdpMagasin()) throw new Error('la page de SmartPortal n\\'est pas celle attendue : rechargez la page des pistes, puis recliquez le favori'); var d = jdpDonnees(); if (!d) { var b = Array.prototype.filter.call(document.querySelectorAll('button'), function (x) { return /afficher les pistes|view leads|show leads/i.test(x.innerText || ''); })[0] || document.querySelector('button.viewlead_btn'); if (!b) throw new Error('bouton \u00ab Afficher les pistes \u00bb introuvable'); dire('affichage des pistes\u2026', 10); b.click(); for (var i = 0; i < 60 && !(d = jdpDonnees()); i++) { if (arrete) return; await new Promise(function (r) { setTimeout(r, 500); }); } if (!d) throw new Error('la liste ne s\\'est pas affich\u00e9e en 30 s : cliquez \u00ab Afficher les pistes \u00bb, puis recliquez le favori'); } var tout = d.content, pistes = tout.map(jdpPiste).filter(Boolean); var dealer = texte((tout[0] || {}).dlCode) || 'HAC31016'; if (!pistes.length) throw new Error(tout.length + ' piste(s) affich\u00e9e(s), aucune offre de fid\u00e9lit\u00e9 : choisissez la liste \u00ab HACC CRM -- HACC CRM - Loyalty Special Offer \u00bb, cliquez \u00ab Afficher les pistes \u00bb, puis recliquez le favori'); dire('envoi de ' + pistes.length + ' offre(s) de fid\u00e9lit\u00e9 au site\u2026', 60); var r = verifier(await envoyer({ action: 'fideliteImporter', dealer: dealer, nomConcession: 'Hyundai Longueuil', pistes: pistes }), 'les offres de fid\u00e9lit\u00e9'); if (!r.resume && r.vehicules) throw new Error('le script du site n\\'est pas \u00e0 jour (Fidelite.gs) : il faut le d\u00e9ployer'); var s = r.resume || {}, pages = Number(d.totalPages) || 1; dire('termin\u00e9 : ' + pistes.length + ' offre(s) de fid\u00e9lit\u00e9 lue(s), ' + (s.ajoutees || 0) + ' nouvelle(s) \u2014 ' + (s.actives || 0) + ' active(s) dont ' + (s.doubles || 0) + ' double(s), ' + (s.appariees || 0) + ' client(s) de Hyundai Finance. ' + (pages > 1 ? '\u26a0 ' + pages + ' pages : seule la page ' + ((Number(d.number) || 0) + 1) + ' est lue \u2014 affichez les autres pages et recliquez le favori. ' : '') + 'Voir Relance \u203a \u00c9quit\u00e9 (Hyundai Longueuil) sur le site.', 100); } (async function () { try { if (mode !== 'jdp') { erreur('Ce favori sert \u00e0 SmartPortal de J.D. Power (home.smartdealerportal.com), page des pistes, liste \u00ab HACC CRM -- HACC CRM - Loyalty Special Offer \u00bb.'); return; } dire('ouverture du pont vers le site\u2026', 2); var p = await attendrePont(); if (!p.connecte) { erreur('Vous n\\'\u00eates pas connect\u00e9 au site d\\'inventaire dans ce navigateur : ouvrez ' + SITE + ' dans un onglet, connectez-vous, puis recliquez le signet.'); return; } await passageJdp(); window.__amxHyundai = false; fermerPontPlusTard(); } catch (e) { erreur('Arr\u00eat : ' + (e && e.message || e)); } })(); })();";
  (AMX.signets = AMX.signets || {}).fidelite = { nom: 'Automax ← Fidélité Hyundai', code: CODE_SIGNET_FIDELITE };   /* 6 nov. : favori autonome (CSP de SmartPortal) */
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
    if (modeCie(this.cie) !== 'bmw') this.construirePortail();
    else { this.construireBmw(); this.chargerBanque(); }
    /* 6 nov. : la page s'ouvre par Relance › Équité › Actions › Importer ; un lien y ramène. */
    this.el.insertBefore(h('a.lien-retour', { href: AMX.lien('relance', 'equite', { vue: 'clients' }), text: '‹ Retour à Équité', style: { display: 'inline-block', margin: '0 0 10px', fontSize: '13px' } }), this.el.firstChild);
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
    if (hmf) {
      /* 6 nov. : les offres de fidélité de Hyundai Canada (SmartPortal de J.D. Power) — favori autonome, comme Hyundai Finance. */
      var etatFid = h('p.doux', { style: { margin: '10px 0 0' }, text: 'Dernière lecture : …' });
      chargerFidelite(this.cie, true).then(function (d) {
        if (d.absent) { etatFid.textContent = 'Le script du site n\'est pas à jour (Fidelite.gs) : il faut le déployer.'; return; }
        var e = d.etats && d.etats.HYUNDAI, act = d.offres.filter(function (o) { return o.active; });
        etatFid.textContent = e && e.le ? 'Dernière lecture : ' + AMX.fmtDate(e.le) + ' — ' + d.offres.length + ' offre(s), ' + act.length + ' active(s), ' + act.filter(function (o) { return o.comptes && o.comptes.length; }).length + ' client(s) de Hyundai Finance.' : 'Aucune offre lue pour l\'instant.';
      }).catch(function (e) { etatFid.textContent = 'Dernière lecture : inconnue (' + AMX.erreurTexte(e) + ').'; });
      this.el.appendChild(h('div.carte', [h('div.carte-entete', [h('h2', 'Offres de fidélité Hyundai (SmartPortal)')]), h('div.carte-corps', [
        h('ol.eq-etapes', [
          h('li', ['Ouvrez ', h('a', { href: URL_SMARTPORTAL, target: '_blank', rel: 'noopener', text: 'SmartPortal' }), ' (J.D. Power), connectez-vous au nom de ' + nom + ', puis allez dans « Pistes de vente ».']),
          h('li', 'Dans « Origine de la piste – Programme de la piste », choisissez « HACC CRM -- HACC CRM - Loyalty Special Offer », puis cliquez « Afficher les pistes ».'),
          h('li', 'Cliquez le favori « Automax ← Fidélité Hyundai » : il lit les offres affichées (client, offre, double ou simple, code PIN, expiration) et les envoie au site. Rien n\'est écrit dans SmartPortal. À refaire quand Hyundai envoie de nouvelles offres.')
        ]),
        h('div.actions-ligne', { style: { marginTop: '12px' } }, boutonsFidelite()), etatFid
      ])]));
    }
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
