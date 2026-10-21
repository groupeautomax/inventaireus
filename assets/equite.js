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
  function estLocation(c) { return /lease/i.test(texte(c.typeContrat)); }
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
    var stock = (neufs || []).filter(function (v) { return v && v.enStock && (v.origine === 'constructeur' || /^portail-/.test(String(v.source || ''))) && String(v.marque || '').toUpperCase() === 'BMW'; });
    var parSerie = {};
    stock.forEach(function (v) { var prix = nombre(v.prix) || nombre(v.extra && v.extra.pdsf); if (!prix) return; var s = texte(v.modele); (parSerie[s] = parSerie[s] || []).push({ vin: v.vin, annee: v.annee, modele: v.modele, version: v.version, couleur: v.couleur, prix: prix, enStock: !/TRANSIT/.test(String(v.statutLibelle || v.statut || '').toUpperCase()), statut: v.statutLibelle || v.statut || '', v: v }); });
    Object.keys(parSerie).forEach(function (s) { parSerie[s].sort(function (a, b) { return (b.enStock - a.enStock) || (a.prix - b.prix); }); });
    return (comptes || []).filter(function (c) { return c.actif !== false; }).map(function (c) {
      var r = { compte: c, location: estLocation(c), serie: c.modele || serieDe(c.vehicule) };
      r.moisRestants = c.echeance ? Math.max(0, moisEntre(ajd, c.echeance) || 0) : null;
      r.moisEcoules = c.dateContrat ? Math.max(0, moisEntre(c.dateContrat, ajd) || 0) : null;
      r.echeanceProche = r.moisRestants !== null && r.moisRestants <= 6;
      var paiement = nombre(c.paiement) || 0;
      /* Km estimé : location → allocation du contrat au prorata ; financement → kmAn par année. */
      if (r.location && nombre(c.kmContrat) && nombre(c.terme)) r.kmEstime = Math.round(nombre(c.kmContrat) * Math.min(1, (r.moisEcoules || 0) / nombre(c.terme)));
      else r.kmEstime = r.moisEcoules !== null ? Math.round(params.kmAn * r.moisEcoules / 12) : null;
      /* Solde : financement → payoff BMW ; location → résiduel + paiements restants (rachat maintenant) ; à l'échéance = résiduel. */
      if (r.location) { var res = nombre(c.residuel); r.solde = res !== null ? res + paiement * (r.moisRestants || 0) : null; r.soldeEcheance = res; }
      else { r.solde = nombre(c.payoffBmw); if (r.solde === null && r.moisRestants !== null) r.solde = paiement * r.moisRestants; r.soldeEcheance = 0; }
      /* Valeur : OpenLane (prévision, sinon ajusté au km, sinon moyenne des ventes) ; sinon l'estimation BMW (financement). */
      var ol = options.valeurs ? options.valeurs(c.vin) : null;
      r.openlane = ol || null;
      var vOl = ol ? (nombre(ol.prevision) || (AMX.openlane && AMX.openlane.ajuste ? AMX.openlane.ajuste(ol, r.kmEstime) : null) || nombre(ol.prixMoy)) : null;
      if (vOl) { r.valeur = vOl; r.valeurSource = 'openlane'; }
      else if (nombre(c.valeurBmw)) { r.valeur = nombre(c.valeurBmw); r.valeurSource = 'bmw'; }
      else { r.valeur = null; r.valeurSource = ''; }
      r.equite = r.valeur !== null && r.solde !== null ? r.valeur - r.solde : null;
      r.equiteEcheance = r.valeur !== null && r.soldeEcheance !== null ? r.valeur - r.soldeEcheance : null;
      r.equiteBmw = nombre(c.equiteBmw);
      /* Neuf similaire : même série en stock (sinon en route), sinon une série voisine. */
      var cands = parSerie[r.serie] || [], voisine = '';
      if (!cands.length) { famille(r.serie).some(function (s) { if (parSerie[s] && parSerie[s].length) { cands = parSerie[s]; voisine = s; return true; } return false; }); }
      r.neuf = cands[0] || null; r.neufVoisin = voisine; r.alternatives = Math.max(0, cands.length - 1);
      if (r.neuf) {
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
      r.score = (r.cible ? 100000 : 0) + (r.equite || 0) + (r.echeanceProche ? 5000 : 0);
      return r;
    }).sort(function (a, b) { return b.score - a.score; });
  }

  /* ---- Données ---- */
  var cache = { donnees: null, le: 0, promesse: null };
  var DUREE_CACHE_MS = 5 * 60000;
  AMX.equite = {
    charger: function (force) {
      if (!force && cache.donnees && Date.now() - cache.le < DUREE_CACHE_MS) return Promise.resolve(cache.donnees);
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
    lireExport: lireExport, serieDe: serieDe, famille: famille, analyser: analyser, pmt: pmt, dateIso: dateIso,
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
      '.eq-table td .sous { font-size: 11px; color: var(--encre-3); } .eq-table td .vin { font-family: var(--mono); font-size: 10.5px; color: var(--encre-3); } .eq-table td .nom { font-weight: 600; }',
      '.eq-table tr.cible td { background: var(--vert-clair); } .eq-table tr.sans td .valeur { color: var(--encre-3); font-style: italic; }',
      '.eq-pos { color: var(--vert); font-weight: 700; } .eq-neg { color: var(--rouge); font-weight: 700; } .eq-nul { color: var(--encre-3); }',
      '.eq-table select.suivi { height: 26px; font-size: 12px; width: auto; max-width: 130px; } .eq-table .suivi-note { font-size: 11px; color: var(--encre-3); margin-top: 2px; max-width: 160px; }',
      '.eq-table .btn.petit { height: 24px; padding: 0 7px; font-size: 11.5px; }',
      '.eq-contact a { color: inherit; text-decoration: none; } .eq-contact a:hover { text-decoration: underline; }',
      '.eq-page .eq-zone { display: block; border: 1.5px dashed var(--ligne-forte); border-radius: var(--rayon-s); padding: 22px 14px; text-align: center; cursor: pointer; color: var(--encre-3); font-size: 13px; } .eq-page .eq-zone:hover, .eq-page .eq-zone.survol { border-color: var(--vert); background: var(--vert-clair); } .eq-page .eq-zone input { display: none; } .eq-page .eq-zone.charge { border-style: solid; border-color: var(--vert); color: var(--vert); font-weight: 600; }',
      '.eq-page .eq-resume { margin-top: 12px; padding: 10px 12px; border-radius: 10px; background: var(--fond-2, #F4F6F8); font-size: 13px; } .eq-page .eq-resume.ok { background: var(--vert-bg, #E6F4EC); } .eq-page .eq-resume.erreur { background: var(--rouge-bg); }',
      '.eq-page .eq-etapes { margin: 0; padding-left: 18px; line-height: 1.6; font-size: 13px; }',
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
    this.lignes = []; this.lecture = null;
    this.rendre();
    var self = this;
    this.surOpenlane = function () { self.rendre(); };
    document.addEventListener('amx:openlane', this.surOpenlane);
    if (AMX.openlane && AMX.openlane.charger) AMX.openlane.charger().catch(function () {});
  }
  VueEquite.prototype.demonter = function () { document.removeEventListener('amx:openlane', this.surOpenlane); };
  VueEquite.prototype.neufs = function () { var d = this.ctx.neufs || (AMX.neufs && AMX.neufs.enCache && AMX.neufs.enCache()); var self = this; return d && d.vehicules ? d.vehicules.filter(function (v) { return v.compagnie === self.cie; }) : []; };
  VueEquite.prototype.analyser = function () {
    var comptes = AMX.equite.comptes(this.cie);
    var valeurs = AMX.openlane && AMX.openlane.valeur ? function (vin) { var r = AMX.openlane.valeur(vin); return r && r.luLe ? r : null; } : null;
    this.lignes = analyser(comptes, this.neufs(), this.params, { valeurs: valeurs });
    return this.lignes;
  };
  VueEquite.prototype.visibles = function () {
    var f = this.filtres, q = f.q.toLowerCase();
    return this.lignes.filter(function (r) {
      var c = r.compte;
      if (f.quoi === 'cibles' && !r.cible) return false;
      if (f.quoi === 'equite' && !(r.equite !== null && r.equite > 0)) return false;
      if (f.quoi === 'sansValeur' && !r.sansValeur) return false;
      if (f.quoi === 'suivi' && !c.suivi) return false;
      if (f.type === 'location' && !r.location) return false;
      if (f.type === 'financement' && r.location) return false;
      if (f.echeance && (r.moisRestants === null || r.moisRestants > Number(f.echeance))) return false;
      if (f.conseiller && (f.conseiller === '—' ? !!c.conseiller : c.conseiller !== f.conseiller)) return false;
      if (q && [c.nom, c.prenom, c.vin, c.vehicule, c.compte, c.ville, c.conseiller].join(' ').toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  };
  VueEquite.prototype.rendre = function () {
    var self = this, el = this.el;
    AMX.vider(el);
    var d = AMX.equite.enCache();
    if (!d) { el.appendChild(AMX.chargeur('Portefeuille BMW')); AMX.equite.charger().then(function () { self.rendre(); }, function (e) { AMX.vider(el); el.appendChild(h('p.doux', { text: 'Portefeuille non lu : ' + AMX.erreurTexte(e) })); }); return; }
    var etat = AMX.equite.etat(this.cie), comptes = AMX.equite.comptes(this.cie);
    if (!comptes.length) {
      el.appendChild(h('div.carte', [h('div.carte-entete', [h('h2', 'Équité — clients ' + nomCie(this.cie))]), h('div.carte-corps', [
        h('p', { style: { margin: '0 0 8px' } }, 'Aucun portefeuille importé pour ' + nomCie(this.cie) + '. Exportez le portefeuille d\'InfoBahn (Portfolio › Entire Portfolio › « … » › Export) et déposez le fichier dans Relance › Équité › Importer le portefeuille.'),
        h('a.btn', { href: AMX.lien('relance', 'equite', { vue: 'import' }) }, 'Importer le portefeuille')
      ])]));
      return;
    }
    var lignes = this.analyser(), vis = this.visibles();
    var nCibles = lignes.filter(function (r) { return r.cible; }).length, nEquite = lignes.filter(function (r) { return r.equite !== null && r.equite > 0; }).length, nSans = lignes.filter(function (r) { return r.sansValeur; }).length, nProches = lignes.filter(function (r) { return r.echeanceProche; }).length, nSuivi = lignes.filter(function (r) { return r.compte.suivi; }).length;
    var carte = function (cls, nom, n, bas, quoi) { var b = h('button.neufs-carte.' + cls + (self.filtres.quoi === quoi ? '.actif' : ''), { type: 'button' }, [h('div.nom', { text: nom }), h('div.n', { text: AMX.fmtNombre(n) }), bas ? h('div.bas', { text: bas }) : null]); b.addEventListener('click', function () { self.filtres.quoi = quoi; self.rendre(); }); return b; };
    var tuiles = h('div.neufs-cartes', [
      carte('sombre', 'Comptes actifs', lignes.length, lignes.filter(function (r) { return r.location; }).length + ' locations · ' + lignes.filter(function (r) { return !r.location; }).length + ' financements', 'tous'),
      carte('vert', 'Cibles', nCibles, 'nouvelle mensualité ≤ actuelle + ' + fmt$(this.params.marge), 'cibles'),
      carte('bleu', 'Équité positive', nEquite, 'valeur > solde (aujourd\'hui)', 'equite'),
      carte('ambre', 'Échéance ≤ 6 mois', nProches, 'contrats qui finissent bientôt', 'proches'),
      carte(nSans ? 'rouge' : 'gris', 'Sans valeur', nSans, nSans ? 'à lire sur OpenLane' : 'tout est valorisé', 'sansValeur'),
      carte('violet', 'En suivi', nSuivi, 'contactés, rendez-vous, vendus', 'suivi')
    ]);
    if (this.filtres.quoi === 'proches') vis = lignes.filter(function (r) { return r.echeanceProche; });
    /* Paramètres du calcul */
    var champ = function (cle, libelle, pas, aide) { var inp = h('input', { type: 'number', step: pas || '0.01', value: String(self.params[cle]), title: aide || '' }); inp.addEventListener('change', function () { var v = nombre(inp.value); if (v === null) return; self.params[cle] = v; AMX.equite.poserParams(self.params); try { inp.blur(); } catch (e) {} setTimeout(function () { self.rendre(); }, 0); });   /* redessin différé : retirer le champ pendant son propre « change » fait échouer removeChild */ return h('div.champ', [h('label', { text: libelle }), inp]); };
    var params = h('div.eq-params', [
      champ('taux', 'Taux %', '0.01', 'Taux annuel du financement du neuf (BMW FS, programme du mois)'), champ('terme', 'Terme (mois)', '1'), champ('frais', 'Frais $', '1', 'Transport et préparation, autres frais ajoutés au PDSF'),
      champ('marge', 'Marge $/mois', '1', 'Une cible peut payer jusqu\'à ce montant de plus par mois'), champ('taxes', 'Taxes %', '0.001', 'TPS + TVQ sur la différence prix − valeur de l\'échange'), champ('comptant', 'Comptant $', '1'), champ('kmAn', 'Km / an', '1000', 'Km estimé d\'un véhicule financé (pour OpenLane)'),
      h('span.doux.petit', { style: { alignSelf: 'center' } }, 'Nouvelle mensualité = (PDSF + frais − valeur) + taxes + solde, financé au taux et au terme choisis. Estimation : sans incitatifs ni programme de location.')
    ]);
    /* Filtres */
    var conseillers = {}; lignes.forEach(function (r) { conseillers[r.compte.conseiller || '—'] = 1; });
    var sel = function (cle, options) { var s = h('select', options.map(function (o) { return h('option', { value: o[0], selected: self.filtres[cle] === o[0] ? 'selected' : null, text: o[1] }); })); s.value = self.filtres[cle]; s.addEventListener('change', function () { self.filtres[cle] = s.value; setTimeout(function () { self.rendre(); }, 0); }); return s; };
    var rech = h('input.recherche', { type: 'search', placeholder: 'Client, NIV, modèle, ville…', value: this.filtres.q });
    rech.addEventListener('input', function () { self.filtres.q = rech.value; self.rendreTable(); });
    var filtres = h('div.eq-filtres', [
      sel('quoi', [['cibles', 'Cibles'], ['equite', 'Équité positive'], ['proches', 'Échéance ≤ 6 mois'], ['sansValeur', 'Sans valeur'], ['suivi', 'En suivi'], ['tous', 'Tous les comptes']]),
      sel('type', [['', 'Location et financement'], ['location', 'Locations'], ['financement', 'Financements']]),
      sel('echeance', [['', 'Toute échéance'], ['3', '≤ 3 mois'], ['6', '≤ 6 mois'], ['12', '≤ 12 mois'], ['24', '≤ 24 mois']]),
      sel('conseiller', [['', 'Tous les conseillers']].concat(Object.keys(conseillers).sort().map(function (k) { return [k, k === '—' ? 'Sans conseiller' : k]; }))),
      rech,
      h('span.compte', { text: vis.length + ' / ' + lignes.length }),
      h('button.btn.petit', { type: 'button', html: I.externe + '<span>Exporter Excel</span>', onclick: function () { self.exporter(); } }),
      (AMX.openlane && nSans) ? h('button.btn.petit', { type: 'button', text: 'Lire OpenLane (' + Math.min(12, nSans) + ' suivants)', onclick: function () { self.lireOpenlane(12); } }) : null
    ]);
    var entete = h('div.carte-entete', [h('h2', ['Équité — clients ' + nomCie(this.cie) + ' (BMW Financial Services)', h('span.sous', { text: etat && etat.le ? 'portefeuille lu le ' + AMX.fmtDate(etat.le, true) + (etat.par ? ' par ' + String(etat.par).split('@')[0] : '') : '' })]),
      h('div.actions-ligne', [h('a.btn.petit', { href: AMX.lien('outils', 'equite'), html: I.rafraichir + '<span>Importer un nouvel export</span>' })])]);
    this.elTable = h('div.eq-table');
    el.appendChild(h('div.carte', [entete, h('div.carte-corps', [tuiles, params, filtres, this.elTable])]));
    this.rendreTable();
  };
  VueEquite.prototype.rendreTable = function () {
    var self = this, vis = this.visibles(), contact = !!(AMX.equite.enCache() && AMX.equite.enCache().contact);
    AMX.vider(this.elTable);
    if (!vis.length) { this.elTable.appendChild(h('p.doux', { style: { padding: '14px', textAlign: 'center' }, text: this.filtres.quoi === 'cibles' ? 'Aucune cible avec ces paramètres : élargissez la marge, changez le terme, ou lisez les valeurs OpenLane des comptes sans valeur.' : 'Aucun compte ne correspond.' })); return; }
    var rows = vis.slice(0, 400).map(function (r) { return self.rangee(r, contact); });
    this.elTable.appendChild(h('table.tableau', [h('thead', [h('tr', [h('th', 'Client'), h('th', 'Véhicule actuel'), h('th', 'Contrat'), h('th.num', 'Paiement'), h('th.num', 'Valeur'), h('th.num', 'Solde'), h('th.num', 'Équité'), h('th', 'Neuf proposé'), h('th.num', 'Nouvelle mensualité'), h('th', 'Conseiller'), h('th', 'Suivi')])]), h('tbody', rows)]));
    if (vis.length > 400) this.elTable.appendChild(h('p.doux.petit', { text: '… ' + (vis.length - 400) + ' autres : affinez les filtres ou exportez.' }));
  };
  VueEquite.prototype.rangee = function (r, contact) {
    var self = this, c = r.compte;
    var cls = (r.cible ? '.cible' : '') + (r.sansValeur ? '.sans' : '');
    var contactEl = contact ? h('div.sous.eq-contact', [c.telephone ? h('a', { href: 'tel:' + c.telephone.replace(/[^\d+]/g, ''), text: c.telephone }) : null, c.courriel ? h('span', [' · ', h('a', { href: 'mailto:' + c.courriel, text: c.courriel })]) : null]) : null;
    var eqCls = r.equite === null ? '.eq-nul' : (r.equite >= 0 ? '.eq-pos' : '.eq-neg');
    var valeurEl = r.valeur !== null ? h('div', [h('div', { text: fmt$(r.valeur) }), h('div.sous', { text: r.valeurSource === 'openlane' ? 'OpenLane' + (r.kmEstime ? ' · ' + AMX.fmtNombre(r.kmEstime) + ' km est.' : '') : 'estimation BMW' })]) : h('div', [h('span.valeur', { text: 'à lire' }), AMX.openlane ? h('div', [h('button.btn.petit', { type: 'button', text: 'OpenLane', onclick: function (ev) { ev.stopPropagation(); self.lireUn(r); } })]) : null]);
    var neufEl = r.neuf ? h('div', [h('div.nom', { text: [r.neuf.annee, 'BMW', r.neuf.modele, r.neuf.version].filter(Boolean).join(' ') }), h('div.sous', { text: 'PDSF ' + fmt$(r.neuf.prix) + ' · ' + (r.neuf.enStock ? 'en stock' : 'en route') + (r.alternatives ? ' · +' + r.alternatives + ' autre' + (r.alternatives > 1 ? 's' : '') : '') + (r.neufVoisin ? ' · série voisine' : '') })]) : h('span.sous', { text: 'aucun ' + r.serie + ' en stock' });
    var mensEl = r.mensualite !== null ? h('div', [h('div' + (r.cible ? '.eq-pos' : ''), { text: fmt$(r.mensualite) + ' / mois' }), h('div.sous', { text: r.sansValeur ? 'sans valeur d\'échange' : (fmtSigne(r.ecart) + ' vs actuel · financé ' + fmt$(r.finance)) })]) : h('span.eq-nul', '—');
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
      h('td', [h('div.nom', { text: nomClient(c) }), h('div.sous', { text: [c.ville, c.compte].filter(Boolean).join(' · ') }), contactEl]),
      h('td', [h('div', { text: vehiculeTexte(c) }), h('div.vin', { text: c.vin || '' }), c.neufUsage && /used|pre/i.test(c.neufUsage) ? h('div.sous', { text: 'acheté usagé' }) : null]),
      h('td', [h('div', { text: (r.location ? 'Location' : 'Financement') + (c.terme ? ' ' + c.terme + ' mois' : '') + (c.taux !== null && c.taux !== undefined ? ' · ' + c.taux + ' %' : '') }), h('div.sous' + (r.echeanceProche ? '.eq-neg' : ''), { text: c.echeance ? 'échéance ' + AMX.fmtDate(c.echeance) + (r.moisRestants !== null ? ' (' + r.moisRestants + ' mois)' : '') : '' }), r.location && c.kmContrat ? h('div.sous', { text: AMX.fmtNombre(c.kmContrat) + ' km au contrat' + (c.usure === 'oui' ? ' · usure' : '') }) : null]),
      h('td.num', { text: fmt$(c.paiement) }),
      h('td.num', [valeurEl]),
      h('td.num', [h('div', { text: fmt$(r.solde) }), r.location && r.soldeEcheance !== null ? h('div.sous', { text: 'résiduel ' + fmt$(r.soldeEcheance) }) : null]),
      h('td.num', [h('div' + eqCls, { text: r.equite === null ? '—' : fmtSigne(r.equite) }), r.equiteBmw !== null && !r.location ? h('div.sous', { text: 'BMW ' + fmtSigne(r.equiteBmw) }) : null, r.location && r.equiteEcheance !== null ? h('div.sous', { text: 'à l\'échéance ' + fmtSigne(r.equiteEcheance) }) : null]),
      h('td', [neufEl]),
      h('td.num', [mensEl]),
      h('td', { text: c.conseiller || '—' }),
      h('td', [selSuivi, c.suiviNote ? h('div.suivi-note', { text: c.suiviNote }) : null, c.suiviLe ? h('div.suivi-note', { text: AMX.fmtDateCourte(c.suiviLe) + (c.suiviPar ? ' · ' + String(c.suiviPar).split('@')[0] : '') }) : null])
    ]);
  };
  VueEquite.prototype.lireUn = function (r) {
    var self = this, c = r.compte;
    if (!AMX.openlane || !AMX.openlane.direct) return Promise.resolve();
    AMX.toast('Lecture OpenLane de ' + vehiculeTexte(c) + '…', 'ok');
    return AMX.openlane.direct(c.vin, r.kmEstime || '', { source: 'equite', compagnie: self.cie }).then(function (x) {
      if (x && x.nonConnecte) { AMX.toast(x.erreur || 'OpenLane n\'est pas connecté au site.', 'attention', 6000); return x; }
      AMX.verifier(x, 'Lecture OpenLane impossible');
      self.rendre();
      return x;
    }).catch(function (e) { AMX.toast('OpenLane — ' + AMX.erreurTexte(e), 'erreur'); });
  };
  VueEquite.prototype.lireOpenlane = function (max) {
    var self = this, aLire = this.lignes.filter(function (r) { return r.sansValeur && r.compte.vin; }).slice(0, max || 12), i = 0;
    if (!aLire.length) return;
    var suivant = function () { if (i >= aLire.length) { AMX.toast(aLire.length + ' NIV lus sur OpenLane.', 'ok'); self.rendre(); return; } var r = aLire[i++]; return AMX.openlane.direct(r.compte.vin, r.kmEstime || '', { source: 'equite', compagnie: self.cie }).then(function (x) { if (x && x.nonConnecte) { AMX.toast(x.erreur || 'OpenLane non connecté.', 'attention', 6000); self.rendre(); return; } return suivant(); }).catch(function (e) { AMX.toast('OpenLane — ' + AMX.erreurTexte(e), 'erreur'); self.rendre(); }); };
    suivant();
  };
  VueEquite.prototype.exporter = function () {
    if (typeof XLSX === 'undefined') { AMX.toast('Export Excel indisponible (SheetJS non chargé).', 'erreur'); return; }
    var rows = this.visibles().map(function (r) { var c = r.compte; return { 'Client': nomClient(c), 'Téléphone': c.telephone || '', 'Courriel': c.courriel || '', 'Ville': c.ville || '', 'Compte': c.compte, 'Véhicule': vehiculeTexte(c), 'NIV': c.vin, 'Contrat': c.typeContrat, 'Terme': c.terme, 'Taux %': c.taux, 'Échéance': c.echeance, 'Mois restants': r.moisRestants, 'Paiement actuel': c.paiement, 'Valeur': r.valeur, 'Source valeur': r.valeurSource, 'Solde': r.solde, 'Équité': r.equite === null ? '' : Math.round(r.equite), 'Équité BMW': c.equiteBmw, 'Neuf proposé': r.neuf ? [r.neuf.annee, r.neuf.modele, r.neuf.version].join(' ') : '', 'PDSF neuf': r.neuf ? r.neuf.prix : '', 'Nouvelle mensualité': r.mensualite === null ? '' : Math.round(r.mensualite), 'Écart / mois': r.ecart === null ? '' : Math.round(r.ecart), 'Cible': r.cible ? 'oui' : '', 'Conseiller': c.conseiller || '', 'Suivi': SUIVIS[c.suivi || ''], 'Note': c.suiviNote || '' }; });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Équité');
    XLSX.writeFile(wb, 'equite-' + this.cie.toLowerCase() + '-' + iso(new Date()) + '.xlsx');
  };

  /* =====================================================================
     Relance › Équité › Importer le portefeuille : dépôt de l'export InfoBahn
     ===================================================================== */
  function ImportPortefeuille(ctx) {
    injecterCss();
    this.ctx = ctx || {};
    this.cie = 'BMW';
    this.lu = null; this.nomFichier = '';
    this.construire();
    var self = this;
    AMX.equite.charger().then(function () { self.rendreEtat(); }, function () { self.rendreEtat(); });
  }
  AMX.vues = AMX.vues || {};
  AMX.vues.ImportPortefeuille = ImportPortefeuille;
  ImportPortefeuille.prototype.demonter = function () {};
  ImportPortefeuille.prototype.naviguer = function () {};
  ImportPortefeuille.prototype.construire = function () {
    var self = this;
    var input = h('input', { type: 'file', id: 'eq-fichier', accept: '.xls,.xlsx,.csv,.html,.htm' });
    input.addEventListener('change', function () { if (input.files && input.files[0]) self.lireFichier(input.files[0]); });
    var zone = h('label.eq-zone', { 'for': 'eq-fichier' }, [h('div', { text: 'Déposez ici le fichier « SearchResults.xls » exporté d\'InfoBahn, ou cliquez pour le choisir.' }), input]);
    ['dragenter', 'dragover'].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('survol'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove('survol'); }); });
    zone.addEventListener('drop', function (e) { var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) self.lireFichier(f); });
    this.elZone = zone;
    this.elResume = h('div');
    this.elEtat = h('div');
    this.btnEnvoyer = h('button.btn.primaire', { type: 'button', id: 'eq-envoyer', disabled: 'disabled', text: 'Envoyer au site' });
    this.btnEnvoyer.addEventListener('click', function () { self.envoyer(); });
    this.el = h('div.page.etroite.outils-page.eq-page', { 'data-etat': 'attente' }, [
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
      h('p.outils-note', 'Rien n\'est modifié dans InfoBahn. Les coordonnées des clients ne sont visibles sur le site que pour les comptes qui peuvent lire les portails (fiche d\'achat, changer le statut, gérer les utilisateurs). Usage interne seulement.')
    ]);
  };
  ImportPortefeuille.prototype.rendreEtat = function () {
    AMX.vider(this.elEtat);
    var e = AMX.equite.etat(this.cie), n = AMX.equite.comptes(this.cie).length;
    if (!e || !e.le) { this.elEtat.appendChild(h('p.doux', { style: { margin: 0 }, text: 'Aucun portefeuille importé pour ' + nomCie(this.cie) + '.' })); return; }
    var r = e.resume || {};
    this.elEtat.appendChild(h('p', { style: { margin: 0 } }, [h('b', { text: n + ' comptes actifs' }), ' — lu le ' + AMX.fmtDate(e.le, true) + (e.par ? ' par ' + String(e.par).split('@')[0] : '') + (r.location !== undefined ? ' · ' + r.location + ' locations, ' + r.financement + ' financements' : '') + (r.equitePositiveBmw !== undefined ? ' · ' + r.equitePositiveBmw + ' en équité positive selon BMW' : '') + (r.inactives ? ' · ' + r.inactives + ' contrat' + (r.inactives > 1 ? 's' : '') + ' terminé' + (r.inactives > 1 ? 's' : '') + ' au dernier passage' : '') + '.']));
    this.elEtat.appendChild(h('p', { style: { margin: '8px 0 0' } }, [h('a.btn.petit', { href: AMX.lien('inventaire', 'neufs', { onglet: 'equite' }), text: 'Voir l\'onglet Équité' })]));
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
      self.elResume.appendChild(h('div.eq-resume.ok', { id: 'eq-fini' }, [h('b', { text: 'Importé — ' + (r.total || lu.lignes.length) + ' comptes actifs' }), ' · ' + (r.ajoutes || 0) + ' nouveaux, ' + (r.modifies || 0) + ' modifiés' + (r.inactives ? ', ' + r.inactives + ' terminés' : '') + ' · ' + (r.location || 0) + ' locations, ' + (r.financement || 0) + ' financements.', ' ', h('a', { href: AMX.lien('inventaire', 'neufs', { onglet: 'equite' }), text: 'Voir l\'onglet Équité' })]));
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
