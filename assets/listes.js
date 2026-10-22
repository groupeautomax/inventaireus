/* =========================================================================
   Inventaire › Listes et audits (22 octobre 2026)

   Maxime : « j'ai besoin d'un endroit de dépôt de document et que le système
   me dise où sont les véhicules — par exemple cette liste (New Units de GM
   Financial) ; je veux aussi pouvoir déposer une liste et la sélectionner dans
   l'app pour faire l'audit ».

   1. Déposer : un PDF (lu dans le navigateur par pdf.js : colonnes repérées par
      leur en-tête — VIN, Year, Make, Model, Credit Line, Stock #…), un Excel /
      CSV (XLSX), ou une liste collée. Le fichier ne quitte pas le navigateur :
      seules les lignes (NIV, # stock, année, marque, modèle, ligne de crédit)
      partent au serveur (Listes.gs, listeDeposer).
   2. Rapport « où est chaque véhicule » : calculé ici avec ce que le site
      connaît déjà (AMX.recherche : usagé, neufs, Livre des ventes, service,
      demandes, offres), rangé en Vendu · sorti / Introuvable / Vendu, pas
      livré / En route / Au service / Démo / En stock. Une copie est gardée
      ligne par ligne au serveur (listeRapport) pour l'app.
   3. Audit : l'app choisit la liste et scanne les NIV ; ce qu'elle voit
      revient ici (colonne Audit). « Marquer vu » fait la même chose à la main.

   Toutes les données passent par textContent (jamais innerHTML).
   ========================================================================= */
(function () {
  'use strict';
  var h = AMX.h, I = AMX.icones;

  AMX.icones.listes = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M8.5 11.5l2 2 4-4"/><path d="M9 17h6"/></svg>';

  var PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  var PDFJS_TRAVAILLEUR = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  var SOURCES_LIEU = ['usage', 'neuf', 'vente', 'service', 'demande', 'offre'];
  var CATS = {
    sorti: { libelle: 'Vendu · sorti', court: 'Vendu, sorti', ordre: 1 },
    introuvable: { libelle: 'Introuvable', court: 'Introuvable', ordre: 2 },
    vendu: { libelle: 'Vendu, pas livré', court: 'Vendu, pas livré', ordre: 3 },
    transit: { libelle: 'En route', court: 'En route', ordre: 4 },
    service: { libelle: 'Au service', court: 'Au service', ordre: 5 },
    demo: { libelle: 'Démo', court: 'Démo', ordre: 6 },
    stock: { libelle: 'En stock', court: 'En stock', ordre: 7 }
  };
  var ORDRE_CATS = ['sorti', 'introuvable', 'vendu', 'transit', 'service', 'demo', 'stock'];
  var CREDITS = { NEWGM: 'Neuf (GM)', NEWGMDEMO: 'Neuf démo (GM)', USED: 'Usagé', USEDWHOLESALE: 'Usagé wholesale', NEW: 'Neuf', DEMO: 'Démo' };
  var MARQUES = { CHEV: 'Chevrolet', CADI: 'Cadillac', BUIC: 'Buick', HYUN: 'Hyundai', NISS: 'Nissan', VOLK: 'Volkswagen', ACUR: 'Acura', MAZD: 'Mazda',
    LEXS: 'Lexus', SUBA: 'Subaru', MITS: 'Mitsubishi', HOND: 'Honda', TOYO: 'Toyota', DODG: 'Dodge', CHRY: 'Chrysler', LINC: 'Lincoln', INFI: 'Infiniti',
    MERZ: 'Mercedes-Benz', MERC: 'Mercedes-Benz', PORS: 'Porsche', VOLV: 'Volvo', TESL: 'Tesla', GENE: 'Genesis', JAGU: 'Jaguar', LAND: 'Land Rover', POLE: 'Polestar' };
  var CIES_PAR_NOM = [['HAWKS', /hawkesbury/i], ['STM', /ste[\s.\-]*marie|sainte[\s\-]*marie|saint[\s\-]*r[ée]mi/i], ['BMW', /bmw\s*sherbrooke|sherbrooke/i], ['VW', /volkswagen|vw\s*brossard|brossard/i], ['HYUNDAI', /hyundai\s*longueuil|longueuil/i]];

  /* ------------------------------ Outils ------------------------------ */
  function nb(v) { return typeof v === 'number' && isFinite(v); }
  function nomCie(c) { return (AMX.COMPAGNIES_TOUTES && AMX.COMPAGNIES_TOUTES[c]) || c || ''; }
  function norm(s) { return String(s === undefined || s === null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase(); }
  function cleStock(s) { return norm(s).replace(/[^A-Z0-9]/g, ''); }
  function aujourdhui() { var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  function jourDe(x) { var t = String(x || ''); var m = /^(\d{4}-\d{2}-\d{2})/.exec(t); return m ? m[1] : ''; }
  function date(x) { var j = jourDe(x); return j ? AMX.fmtDate(j) : ''; }
  function dateHeure(x) { return x ? AMX.fmtDate(x, true) : ''; }
  function joursDepuis(j) { if (!j) return null; var a = new Date(j + 'T12:00:00'), b = new Date(aujourdhui() + 'T12:00:00'); var n = Math.round((b - a) / 86400000); return isNaN(n) ? null : n; }
  function pluriel(n, mot, pl) { return n + ' ' + (n > 1 ? (pl || mot + 's') : mot); }
  function personne(c) { return String(c || '').split('@')[0]; }

  /* Chiffre de contrôle d'un NIV nord-américain (position 9). Les NIV européens / asiatiques peuvent ne pas le respecter : on ne refuse rien, on le signale. */
  var TRANS = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9 };
  var POIDS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
  function vinValide(v) {
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(v)) return false;
    var s = 0; for (var i = 0; i < 17; i++) { var c = v.charAt(i); s += (/\d/.test(c) ? +c : TRANS[c]) * POIDS[i]; }
    var r = s % 11; return v.charAt(8) === (r === 10 ? 'X' : String(r));
  }
  function vinDe(x) { var v = String(x || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase(); return /^[A-HJ-NPR-Z0-9]{17}$/.test(v) ? v : ''; }
  function vinsDansTexte(t) { var m = String(t || '').toUpperCase().match(/\b[A-HJ-NPR-Z0-9]{17}\b/g) || []; return m.filter(function (v) { return /\d/.test(v) && /[A-Z]/.test(v); }); }
  function marqueLisible(m) { var t = String(m || '').trim(); var c = t.toUpperCase(); return MARQUES[c] || (c.length <= 4 && c === t ? (c === 'GMC' || c === 'BMW' || c === 'RAM' || c === 'KIA' || c === 'MINI' || c === 'FIAT' ? c : t) : t); }
  function creditLisible(c) { var t = String(c || '').toUpperCase().replace(/\s+/g, ''); return CREDITS[t] || c || ''; }
  function vehiculeDe(l) { return [l.annee, marqueLisible(l.marque), l.modele].filter(Boolean).join(' '); }
  function cieDepuisTexte(t) { var r = ''; CIES_PAR_NOM.some(function (x) { if (x[1].test(t || '')) { r = x[0]; return true; } return false; }); return r; }

  /* ------------------------------ Lecture des fichiers ------------------------------ */
  function chargerPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (chargerPdfJs.p) return chargerPdfJs.p;
    chargerPdfJs.p = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = PDFJS; s.async = true;
      s.onload = function () { if (!window.pdfjsLib) { chargerPdfJs.p = null; rej(new Error('Le lecteur de PDF ne s\'est pas chargé.')); return; } window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_TRAVAILLEUR; res(window.pdfjsLib); };
      s.onerror = function () { chargerPdfJs.p = null; rej(new Error('Impossible de charger le lecteur de PDF (réseau).')); };
      document.head.appendChild(s);
    });
    return chargerPdfJs.p;
  }
  /* Un PDF reçu par Messages arrive enveloppé (en-tête Java de 27 octets) : on repart du « %PDF- ». */
  function debutPdf(o) {
    for (var i = 0; i < Math.min(o.length - 5, 2048); i++) if (o[i] === 0x25 && o[i + 1] === 0x50 && o[i + 2] === 0x44 && o[i + 3] === 0x46 && o[i + 4] === 0x2d) return i;
    return -1;
  }
  function rangeesDe(items) {
    var cellules = [];
    items.forEach(function (it) { var s = String(it.str || '').replace(/\s+/g, ' ').trim(); if (s) cellules.push({ x: it.transform[4], y: it.transform[5], w: it.width || 0, s: s }); });
    cellules.sort(function (a, b) { return (b.y - a.y) || (a.x - b.x); });
    var rangees = [];
    cellules.forEach(function (c) { var r = rangees[rangees.length - 1]; if (r && Math.abs(r.y - c.y) <= 2.5) r.cellules.push(c); else rangees.push({ y: c.y, cellules: [c] }); });
    rangees.forEach(function (r) { r.cellules.sort(function (a, b) { return a.x - b.x; }); r.texte = r.cellules.map(function (c) { return c.s; }).join(' '); });
    return rangees;
  }
  function lirePdf(buffer) {
    var octets = new Uint8Array(buffer), i0 = debutPdf(octets);
    if (i0 < 0) return Promise.reject(new Error('Ce fichier n\'est pas un PDF lisible.'));
    if (i0 > 0) octets = octets.slice(i0);
    return chargerPdfJs().then(function (pdfjs) { return pdfjs.getDocument({ data: octets }).promise; }).then(function (doc) {
      var pages = [], suite = Promise.resolve();
      for (var n = 1; n <= doc.numPages; n++) (function (n) {
        suite = suite.then(function () { return doc.getPage(n).then(function (page) { return page.getTextContent().then(function (tc) { pages.push(rangeesDe(tc.items)); }); }); });
      })(n);
      return suite.then(function () { return pages; });
    });
  }

  /* En-têtes de colonnes reconnus (anglais et français). */
  function cleColonne(t) {
    var n = norm(t).replace(/[^A-Z0-9#/ ]/g, '').trim();
    if (/^(VIN|VINSN|VIN\/SN|NIV|N I V|SERIAL|NO DE SERIE|NUMERO DE SERIE|SN)\b/.test(n) || n === 'VIN/SN') return 'vin';
    if (/^(YEAR|ANNEE|AN|YR|MODEL YEAR)$/.test(n)) return 'annee';
    if (/^(MAKE|MARQUE|MFR|MANUFACTURER)$/.test(n)) return 'marque';
    if (/^(MODEL|MODELE|DESCRIPTION|VEHICLE|VEHICULE)/.test(n)) return 'modele';
    if (/CREDIT|LIGNE DE CREDIT|FLOOR ?PLAN|^LINE$/.test(n)) return 'credit';
    if (/^AUDIT/.test(n)) return 'codeAudit';
    if (/STOCK|^STK|INVENTAIRE ?#|^NO ?STOCK/.test(n)) return 'stock';
    if (/COLOU?R|COULEUR/.test(n)) return 'couleur';
    if (/^(KM|MILEAGE|ODOMETER|ODOMETRE|KILOMETRAGE|MILES)/.test(n)) return 'km';
    if (/^(DAYS|JOURS|AGE)/.test(n)) return 'jours';
    if (/AMOUNT|BALANCE|SOLDE|MONTANT|PRINCIPAL/.test(n)) return 'montant';
    return '';
  }
  function estEnteteTableau(r) { return r.cellules.some(function (c) { return cleColonne(c.s) === 'vin'; }) && r.cellules.filter(function (c) { return cleColonne(c.s); }).length >= 2; }
  function colonnesDe(r) {
    var cols = [];
    r.cellules.forEach(function (c) {
      var cle = cleColonne(c.s), prec = cols[cols.length - 1];
      // « Credit » + « Line », « Stock » + « # » : un libellé coupé en deux reste une seule colonne.
      if (prec && c.x <= prec.xFin + 14 && (!cle || cle === prec.cle || !prec.cle)) { prec.libelle += ' ' + c.s; prec.xFin = c.x + c.w; if (!prec.cle) prec.cle = cleColonne(prec.libelle); return; }
      cols.push({ cle: cle, libelle: c.s, x: c.x, xFin: c.x + c.w });
    });
    cols.forEach(function (c, i) { if (!c.cle) c.cle = 'col' + i; });
    return cols;
  }
  function placer(cols, c) {
    var centre = c.x + c.w / 2, k = 0;
    for (var i = 0; i < cols.length; i++) { if (centre >= cols[i].x - 8) k = i; }
    // Un texte qui commence nettement avant la colonne suivante mais déborde : on garde la colonne de son début.
    if (k > 0 && c.x < cols[k].x - 30) { for (var j = 0; j < cols.length; j++) if (c.x >= cols[j].x - 8) k = j; }
    return cols[k];
  }
  var LIBELLES_ENTETE = { 'DEALER': 'concessionnaire', 'CONCESSIONNAIRE': 'concessionnaire', 'AUDIT DATE': 'dateAudit', 'DATE D AUDIT': 'dateAudit', 'DATE DE L AUDIT': 'dateAudit',
    'AUDITOR': 'auditeur', 'AUDITEUR': 'auditeur', 'COMPANY': 'preteur', 'PRETEUR': 'preteur', 'LENDER': 'preteur', 'AUDIT CONTACT': 'contact', 'CONTACT': 'contact', 'TITLE': 'fonction' };
  function enteteDepuisRangees(rangees) {
    var e = {};
    if (rangees.length && !estEnteteTableau(rangees[0])) e.titre = rangees[0].texte.slice(0, 120);
    rangees.forEach(function (r, i) {
      r.cellules.forEach(function (c) {
        var cle = LIBELLES_ENTETE[norm(c.s).replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim()];
        if (!cle || e[cle]) return;
        // Les deux colonnes de l'en-tête s'entrelacent (« Company » à droite, « Audit contact » à gauche) : on prend les
        // valeurs sous le libellé, dans la même colonne, en sautant les rangées qui n'ont rien à cet endroit.
        var vals = [], max = cle === 'concessionnaire' ? 5 : 1;
        for (var k = i + 1; k < Math.min(rangees.length, i + 10) && vals.length < max; k++) {
          var v = rangees[k].cellules.filter(function (x) { return Math.abs(x.x - c.x) < 30; })[0];
          if (!v) continue;
          if (LIBELLES_ENTETE[norm(v.s).replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim()] || estEnteteTableau(rangees[k])) break;
          if (!/^N\\?A$/i.test(v.s)) vals.push(v.s);
        }
        if (vals.length) e[cle] = vals.join(' · ').slice(0, 160);
      });
    });
    return e;
  }
  function ligneDepuisValeurs(vals) {
    // vals : { vin, stock, annee, marque, modele, credit, codeAudit, couleur, km, jours, montant, colN… } (textes)
    var vin = vinDe(vals.vin);
    if (!vin) { var tous = Object.keys(vals).map(function (k) { return vals[k]; }).join(' '); vin = vinsDansTexte(tous)[0] || ''; }
    var stock = String(vals.stock || '').trim();
    if (!vin && !stock) return null;
    var extra = {};
    ['codeAudit', 'couleur', 'km', 'jours', 'montant'].forEach(function (k) { if (vals[k]) extra[k] = String(vals[k]).trim(); });
    Object.keys(vals).forEach(function (k) { if (/^col\d+$/.test(k) && vals[k] && Object.keys(extra).length < 10) extra[vals['_libelle_' + k] || k] = String(vals[k]).trim(); });
    var annee = String(vals.annee || '').trim(); if (!/^(19|20)\d{2}$/.test(annee)) annee = '';
    return { vin: vin, stock: stock.slice(0, 20), annee: annee, marque: String(vals.marque || '').trim(), modele: String(vals.modele || '').trim(), credit: String(vals.credit || '').trim(), extra: extra, vinDouteux: !!vin && !vinValide(vin) };
  }
  function analyserPdf(pages, nomFichier) {
    var cols = null, lignes = [], premieres = [];
    pages.forEach(function (rangees, p) {
      rangees.forEach(function (r) {
        if (estEnteteTableau(r)) { cols = colonnesDe(r); return; }
        if (!cols) { if (p === 0) premieres.push(r); }
        var vals = {};
        if (cols) {
          r.cellules.forEach(function (c) { var col = placer(cols, c); vals[col.cle] = vals[col.cle] ? vals[col.cle] + ' ' + c.s : c.s; if (/^col/.test(col.cle)) vals['_libelle_' + col.cle] = col.libelle; });
        } else {
          var v = vinsDansTexte(r.texte)[0]; if (!v) return;
          vals = devinerValeurs(r.cellules.map(function (c) { return c.s; }));
        }
        var l = ligneDepuisValeurs(vals);
        if (l && l.vin) lignes.push(l);
      });
    });
    return { lignes: lignes, entete: enteteDepuisRangees(premieres), colonnes: cols ? cols.map(function (c) { return c.libelle; }) : [], fichier: nomFichier };
  }
  /* Une ligne sans en-tête connu (texte collé, tableau sans titre de colonne) : NIV, année, marque, # stock devinés. */
  function devinerValeurs(cellules) {
    var vals = {}, reste = [];
    cellules.forEach(function (s) {
      var t = String(s || '').trim(); if (!t) return;
      var v = vinsDansTexte(t)[0];
      if (v && !vals.vin) { vals.vin = v; var autour = t.toUpperCase().replace(v, ' ').trim(); if (autour) reste.push(autour); return; }
      if (!vals.annee && /^(19|20)\d{2}$/.test(t)) { vals.annee = t; return; }
      reste.push(t);
    });
    var mots = reste.join(' ').split(/\s+/).filter(Boolean);
    // # stock : le dernier mot qui ressemble à un numéro de stock (lettres + chiffres, 3 à 10 caractères), pas une ligne de crédit.
    for (var i = mots.length - 1; i >= 0; i--) {
      var m = mots[i].replace(/^#/, '');
      if (/^[A-Z]{0,3}\d{3,7}[A-Z]{0,2}$/i.test(m) && !/^(19|20)\d{2}$/.test(m)) { vals.stock = m; mots.splice(i, 1); break; }
    }
    var credit = mots.filter(function (m) { return CREDITS[m.toUpperCase()]; })[0];
    if (credit) { vals.credit = credit; mots = mots.filter(function (m) { return m !== credit; }); }
    if (mots.length) { if (MARQUES[mots[0].toUpperCase()] || /^(GMC|BMW|RAM|KIA|FORD|JEEP|AUDI|MINI|FIAT)$/i.test(mots[0])) { vals.marque = mots.shift(); } vals.modele = mots.join(' ').slice(0, 80); }
    return vals;
  }
  function analyserTableau(rangs, nomFichier) {
    rangs = (rangs || []).map(function (r) { return (r || []).map(function (c) { return String(c === null || c === undefined ? '' : c).trim(); }); });
    var iEntete = -1, cles = [];
    for (var i = 0; i < Math.min(rangs.length, 30); i++) {
      var c = rangs[i].map(cleColonne);
      if (c.indexOf('vin') >= 0 && c.filter(Boolean).length >= 2) { iEntete = i; cles = c; break; }
    }
    var lignes = [], entete = {};
    if (iEntete > 0) entete.titre = rangs.slice(0, iEntete).map(function (r) { return r.filter(Boolean).join(' '); }).filter(Boolean).join(' · ').slice(0, 160);
    rangs.slice(iEntete + 1).forEach(function (r) {
      var vals;
      if (iEntete >= 0) { vals = {}; r.forEach(function (v, j) { if (!v) return; var k = cles[j] || ('col' + j); vals[k] = vals[k] ? vals[k] + ' ' + v : v; if (!cles[j]) vals['_libelle_col' + j] = (rangs[iEntete][j] || ('Colonne ' + (j + 1))); }); }
      else { if (!vinsDansTexte(r.join(' ')).length) return; vals = devinerValeurs(r); }
      var l = ligneDepuisValeurs(vals); if (l && l.vin) lignes.push(l); else if (l && iEntete >= 0 && l.stock && (l.modele || l.marque)) lignes.push(l);
    });
    return { lignes: lignes, entete: entete, colonnes: iEntete >= 0 ? rangs[iEntete].filter(Boolean) : [], fichier: nomFichier };
  }
  function lireFichier(fichier) {
    var nom = fichier.name || 'liste';
    return fichier.arrayBuffer().then(function (buf) {
      var o = new Uint8Array(buf.slice(0, 2048));
      if (/\.pdf$/i.test(nom) || debutPdf(o) >= 0) return lirePdf(buf).then(function (pages) { var r = analyserPdf(pages, nom); r.type = 'pdf'; return r; });
      if (/\.(xlsx|xlsm|xls|csv|txt|tsv)$/i.test(nom)) {
        if (/\.(csv|txt|tsv)$/i.test(nom) || typeof XLSX === 'undefined') {
          var texte = new TextDecoder('utf-8').decode(buf);
          if (texte.indexOf('�') >= 0) texte = new TextDecoder('iso-8859-1').decode(buf);
          return analyserTexte(texte, nom);
        }
        var wb = XLSX.read(buf, { type: 'array' }), meilleur = null;
        wb.SheetNames.forEach(function (n) {
          var rangs = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '' });
          var r = analyserTableau(rangs, nom); r.feuille = n;
          if (!meilleur || r.lignes.length > meilleur.lignes.length) meilleur = r;
        });
        if (meilleur) meilleur.type = 'excel';
        return meilleur || { lignes: [], entete: {}, colonnes: [], fichier: nom };
      }
      throw new Error('Format non reconnu : déposez un PDF, un fichier Excel (.xlsx) ou CSV.');
    });
  }
  function analyserTexte(texte, nom) {
    var lignesTexte = String(texte || '').replace(/^﻿/, '').split(/\r?\n/).filter(function (l) { return l.trim() && !/^sep=/i.test(l); });
    var sep = ['\t', ';', '|', ','].filter(function (s) { return lignesTexte.slice(0, 5).some(function (l) { return l.split(s).length >= 3; }); })[0];
    var rangs = lignesTexte.map(function (l) { return sep ? l.split(sep).map(function (c) { return c.replace(/^"|"$/g, ''); }) : l.split(/\s{2,}|\t/); });
    var r = analyserTableau(rangs, nom || 'liste collée'); r.type = 'texte'; return r;
  }

  /* ------------------------------ Où est le véhicule ------------------------------ */
  function trouver(l, idx, cieListe) {
    if (l.vin && idx.parVin[l.vin]) return { items: idx.parVin[l.vin], par: 'vin' };
    if (l.vin) {
      var c8 = idx.parVin8[l.vin.slice(-8)] || [], vins = {};
      c8.forEach(function (it) { vins[String(it.src.vin(it.x)).toUpperCase()] = true; });
      if (Object.keys(vins).length === 1 && c8.length) return { items: c8, par: 'vin8', autreVin: Object.keys(vins)[0] };
    }
    if (l.stock) {
      var cs = (idx.parStock[cleStock(l.stock)] || []).filter(function (it) { return !cieListe || !it.cie || it.cie === cieListe; }), v2 = {};
      cs.forEach(function (it) { v2[String(it.src.vin(it.x) || '').toUpperCase()] = true; });
      if (cs.length && Object.keys(v2).length === 1) return { items: cs, par: 'stock', autreVin: Object.keys(v2)[0] };
    }
    return { items: [], par: '' };
  }
  function localiser(l, idx, cieListe, typeListe) {
    var t = trouver(l, idx, cieListe), items = t.items, auj = aujourdhui();
    var de = function (id) { return items.filter(function (it) { return it.src.id === id; }).map(function (it) { return it.x; }); };
    var usages = de('usage'), neufs = de('neuf');
    var usageActif = usages.filter(function (u) { return u.statut !== 'arrive' && u.statut !== 'comptabilise'; })[0] || null;
    var usageVendu = usages.filter(function (u) { return u.statut === 'arrive' || u.statut === 'comptabilise'; })[0] || null;
    var neufDms = neufs.filter(function (n) { return n.origine !== 'constructeur'; })[0] || null, neufC = neufs.filter(function (n) { return n.origine === 'constructeur'; })[0] || null;
    var neuf = neufDms || neufC;
    // Une vente plus vieille que l'entrée du véhicule à l'usagé (revenu en échange) ne compte pas.
    var entreeUsage = usageActif ? jourDe(usageActif.dateAjout || usageActif.ajouteLe || usageActif.date) : '';
    var ventes = de('vente').filter(function (v) { var j = jourDe(v.dateVente || v.dateLivraison); return v.statut !== 'annulee' && (!entreeUsage || !j || j >= entreeUsage) && (!j || joursDepuis(j) <= 400); })
      .sort(function (a, b) { return String(b.dateLivraison || b.dateVente).localeCompare(String(a.dateLivraison || a.dateVente)); });
    var vente = ventes[0] || null;
    var services = de('service').filter(function (s) { return s.statut !== 'termine' && s.statut !== 'refuse'; });
    var demandes = de('demande').filter(function (d) { return d.etat === 'envoyee' || d.etat === 'approuvee'; });
    var offres = de('offre').filter(function (o) { return o.statut === 'contrat' || o.statut === 'acceptee'; });
    var r = { cat: '', texte: '', detail: '', alerte: '', items: items, par: t.par };
    var alertes = [];
    var cieTrouvee = (items.filter(function (it) { return it.cie; })[0] || {}).cie || '';
    if (cieListe && cieTrouvee && cieTrouvee !== cieListe) alertes.push('Inscrit chez ' + nomCie(cieTrouvee));
    if (t.par === 'vin8') alertes.push('NIV différent chez nous : ' + t.autreVin);
    if (t.par === 'stock') alertes.push('Trouvé par le # stock — NIV chez nous : ' + (t.autreVin || '?'));
    var notreStock = (usageActif || neuf || vente || usageVendu || {}).stock || '';
    if (l.stock && notreStock && cleStock(l.stock) !== cleStock(notreStock)) alertes.push('# stock différent : ' + l.stock + ' sur la liste, ' + notreStock + ' chez nous');
    var plan = typeListe === 'plan';
    var livreLe = vente && jourDe(vente.dateLivraison) && jourDe(vente.dateLivraison) <= auj ? jourDe(vente.dateLivraison) : '';
    var indispo = neuf ? String(neuf.indisponible || '') : '';
    var marq = (neuf && neuf.marquage) || {};
    var statutNeuf = neuf ? norm(neuf.statutLibelle || neuf.statut || '') : '';

    if (livreLe) {
      var n = joursDepuis(livreLe);
      r.cat = 'sorti'; r.texte = 'Vendu et livré le ' + date(livreLe) + (vente.client ? ' — ' + vente.client : (vente.venduA ? ' — ' + vente.venduA : ''));
      r.detail = 'Livre des ventes ' + vente.id + (vente.conseiller ? ' · ' + vente.conseiller : '') + (nb(n) ? ' · il y a ' + pluriel(n, 'jour') : '');
      if (plan) alertes.unshift('Vendu mais encore sur la liste du prêteur : à rembourser');
    } else if (neufDms && neufDms.sortiLe && !usageActif) {
      r.cat = 'sorti'; r.texte = 'Sorti du DMS le ' + date(neufDms.sortiLe); r.detail = 'Neuf · ' + (neufDms.statutLibelle || '') + (neufDms.stock ? ' · # ' + neufDms.stock : '');
      if (plan) alertes.unshift('Sorti du DMS mais encore sur la liste du prêteur');
    } else if (usageVendu && !usageActif && !neuf) {
      var st = AMX.statut ? AMX.statut(usageVendu.statut, usageVendu._feuille) : { libelle: usageVendu.statut };
      r.cat = 'sorti'; r.texte = 'Usagé · ' + st.libelle + ' (' + (AMX.inventaire.nomFeuille ? AMX.inventaire.nomFeuille(usageVendu._feuille) : usageVendu._feuille) + ')';
      r.detail = usageVendu.stock ? '# ' + usageVendu.stock : '';
      if (plan) alertes.unshift('Vendu mais encore sur la liste du prêteur');
    } else if (/livre|vendu-constructeur/.test(indispo) && !usageActif) {
      r.cat = 'sorti'; r.texte = indispo === 'livre' ? 'Livré (marquage)' + (marq.client ? ' — ' + marq.client : '') : 'Livré au client (manufacturier)';
      r.detail = 'Neuf' + (neuf.stock ? ' · # ' + neuf.stock : '');
      if (plan) alertes.unshift('Livré mais encore sur la liste du prêteur');
    } else if (vente || offres.length || /^vendu/.test(indispo)) {
      r.cat = 'vendu';
      if (vente) { r.texte = 'Vendu le ' + date(vente.dateVente) + (vente.client ? ' — ' + vente.client : '') + (jourDe(vente.dateLivraison) ? ', livraison le ' + date(vente.dateLivraison) : ', livraison à venir'); r.detail = 'Livre des ventes ' + vente.id + (vente.conseiller ? ' · ' + vente.conseiller : ''); }
      else if (offres.length) { var o = offres[0]; r.texte = 'Offre ' + (o.statut === 'contrat' ? 'signée' : 'acceptée') + (o.entreprise || o.nom ? ' — ' + (o.entreprise || o.nom) : ''); r.detail = 'Offre ' + o.id; }
      else { r.texte = 'Marqué vendu' + (marq.client ? ' — ' + marq.client : '') + (marq.livraison ? ', livraison le ' + date(marq.livraison) : ''); r.detail = 'Neuf' + (neuf.stock ? ' · # ' + neuf.stock : '') + (marq.vendeur ? ' · ' + marq.vendeur : ''); }
    } else if (neuf && (/DEMO/.test(statutNeuf) || /demo/.test(indispo))) {
      r.cat = 'demo'; r.texte = 'Démo' + (marq.localisation ? ' · ' + marq.localisation : '') + (neuf.km ? ' · ' + AMX.fmtNombre(neuf.km) + ' km' : '');
      r.detail = 'Neuf · ' + (neuf.statutLibelle || 'DEMO') + (neuf.stock ? ' · # ' + neuf.stock : '');
    } else if ((usageActif && /^(transit|transitqc|manheimpa)$/.test(usageActif.statut)) || (neuf && !usageActif && /TRANSIT|COMMANDE/.test(statutNeuf))) {
      r.cat = 'transit';
      if (usageActif && !neuf) { var st2 = AMX.statut ? AMX.statut(usageActif.statut, usageActif._feuille) : { libelle: usageActif.statut }; r.texte = 'Usagé · ' + st2.libelle; r.detail = AMX.inventaire.nomFeuille ? AMX.inventaire.nomFeuille(usageActif._feuille) : usageActif._feuille; }
      else { r.texte = 'Neuf · ' + (neuf.statutLibelle || 'en route') + (neuf.emplacement ? ' · ' + neuf.emplacement : ''); r.detail = neuf.origine === 'constructeur' ? 'Portail du manufacturier' : 'DMS'; }
    } else if (services.length || demandes.length) {
      var s = services[0];
      r.cat = 'service'; r.texte = 'Au service' + (s ? ' — ' + (AMX.service && AMX.service.etapes ? ((AMX.service.etapes().filter(function (e) { return e.id === s.etapeCourante; })[0] || {}).libelle || 'en cours') : 'en cours') : ' — demande de travaux');
      r.detail = demandes.length ? 'Demande de travaux' + (demandes[0].btNo ? ' · BT ' + demandes[0].btNo : '') : (usageActif ? 'Usagé · ' + (AMX.inventaire.nomFeuille ? AMX.inventaire.nomFeuille(usageActif._feuille) : '') : '');
    } else if (usageActif || neuf) {
      r.cat = 'stock';
      if (usageActif) { var st3 = AMX.statut ? AMX.statut(usageActif.statut, usageActif._feuille) : { libelle: usageActif.statut }; r.texte = 'Usagé · ' + (AMX.inventaire.nomFeuille ? AMX.inventaire.nomFeuille(usageActif._feuille) : usageActif._feuille) + ' · ' + st3.libelle; r.detail = usageActif.stock ? '# ' + usageActif.stock : ''; }
      else { r.texte = 'Neuf · ' + (neuf.statutLibelle || 'en stock') + (marq.localisation ? ' · ' + marq.localisation : (neuf.emplacement ? ' · ' + neuf.emplacement : '')); r.detail = (neuf.origine === 'constructeur' ? 'Portail du manufacturier' : 'DMS') + (neuf.stock ? ' · # ' + neuf.stock : '') + (nb(neuf.jours) ? ' · ' + neuf.jours + ' j' : ''); }
    } else {
      r.cat = 'introuvable'; r.texte = 'Aucune trace dans ScanAutomax';
      r.detail = 'Ni à l\'usagé, ni aux neufs, ni au Livre des ventes, ni au service';
      if (plan) alertes.unshift('Financé par le prêteur mais inconnu chez nous');
    }
    r.alerte = alertes.join(' · ');
    return r;
  }
  function resumeDe(lignes) {
    var r = { total: lignes.length, vus: 0, alertes: 0 };
    ORDRE_CATS.forEach(function (c) { r[c] = 0; });
    lignes.forEach(function (l) { if (l.vuLe) r.vus++; var o = l._ou || l.ou; if (o && o.cat) r[o.cat] = (r[o.cat] || 0) + 1; if (o && o.alerte) r.alertes++; });
    return r;
  }

  /* ------------------------------ Données ------------------------------ */
  var cache = { listes: null, quand: 0, promesse: null };
  function chargerListes(force) {
    if (!force && cache.listes && Date.now() - cache.quand < 60000) return Promise.resolve(cache.listes);
    if (cache.promesse) return cache.promesse;
    cache.promesse = AMX.get({ listesDepot: 1 }, { secours: false }).then(function (d) {
      cache.promesse = null;
      if (!d || d.refuse) throw new Error((d && d.erreur) || 'Accès refusé.');
      if (d.ok === false) throw new Error(d.erreur || 'Réponse inattendue du serveur');
      if (!Array.isArray(d.listes)) throw new Error('Le script n\'est pas à jour : déployez une nouvelle version (Listes.gs).');
      cache.listes = d; cache.quand = Date.now();
      return d;
    }, function (e) { cache.promesse = null; throw e; });
    return cache.promesse;
  }
  function chargerUne(id) {
    return AMX.get({ listeDepot: id }, { secours: false }).then(function (d) {
      if (!d || d.refuse) throw new Error((d && d.erreur) || 'Accès refusé.');
      if (d.ok === false) throw new Error(d.erreur || 'Liste introuvable.');
      if (!d.liste || !Array.isArray(d.lignes)) throw new Error('Le script n\'est pas à jour : déployez une nouvelle version (Listes.gs).');
      return d;
    });
  }
  function ecrire(corps) {
    return AMX.post(corps).then(function (r) {
      if (!r || r.refuse) throw new Error((r && r.erreur) || 'Refusé.');
      if (r.ok === false) throw new Error(r.erreur || 'Refusé.');
      if (r.vehicules && !r.liste && r.nb === undefined && r.vus === undefined && r.misAJour === undefined && r.retirees === undefined && !r.deja) throw new Error('Le script n\'est pas à jour : déployez une nouvelle version (Listes.gs).');
      return r;
    });
  }

  /* ------------------------------ Section ------------------------------ */
  AMX.section('listes', {
    titre: 'Listes et audits', icone: 'listes', ordre: 24,
    visible: function () { return AMX.perm('consulter') || AMX.perm('audit') || AMX.perm('changerStatut') || AMX.estAdmin(); },
    monter: function (conteneur, ctx) { return new Listes(conteneur, ctx); }
  });

  function Listes(conteneur, ctx) {
    injecterCss();
    var self = this;
    this.conteneur = conteneur; this.detruit = false; this.generation = 0;
    this.compagnie = AMX.compagnieChoisie('inventaire') || '';
    this.donnees = null; this.erreur = '';
    this.apercu = null;          // lecture d'un fichier pas encore enregistrée
    this.liste = null;           // liste ouverte { liste, lignes, peutEcrire, peutSupprimer }
    this.filtre = ''; this.recherche = '';
    this.sources = null; this.idx = null;
    this.el = h('div.page.lst-page');
    conteneur.appendChild(this.el);
    this.surCie = function () { if (!self.detruit) { self.compagnie = AMX.compagnieChoisie('inventaire') || ''; if (!self.liste) self.rendre(); } };
    document.addEventListener('amx:compagnie', this.surCie);
    this.naviguer(ctx || {});
  }
  Listes.prototype.demonter = function () { this.detruit = true; this.generation++; document.removeEventListener('amx:compagnie', this.surCie); };
  Listes.prototype.naviguer = function (ctx) {
    var id = ctx && ctx.params && ctx.params.id;
    if (id) { if (!this.liste || this.liste.liste.id !== id) this.ouvrir(id); return; }
    this.liste = null; this.filtre = ''; this.recherche = '';
    this.charger(false);
  };
  Listes.prototype.charger = function (force) {
    var self = this, gen = ++this.generation;
    if (!this.donnees) this.rendre();
    return chargerListes(force).then(function (d) { if (self.detruit || gen !== self.generation) return; self.donnees = d; self.erreur = ''; if (!self.liste) self.rendre(); },
      function (e) { if (self.detruit || gen !== self.generation) return; self.erreur = AMX.erreurTexte(e); if (!self.liste) self.rendre(); });
  };

  /* ------------------------------ Page des listes ------------------------------ */
  Listes.prototype.rendre = function () {
    var self = this, d = this.donnees;
    AMX.vider(this.el);
    var btnDeposer = h('button.btn.primaire', { type: 'button', html: (I.plus || '') + '<span>Déposer une liste</span>', onclick: function () { self.choisirFichier(); } });
    var btnColler = h('button.btn', { type: 'button', text: 'Coller une liste', onclick: function () { self.collerListe(); } });
    var peut = d ? d.peutDeposer : true;
    this.el.appendChild(h('div.entete-page', [h('div', [h('h1', 'Listes et audits'), h('p', { text: 'Déposez une liste de véhicules (PDF, Excel, CSV) : ScanAutomax dit où est chacun. Choisissez-la ensuite dans l\'app pour l\'audit sur le terrain.' })]),
      h('div.actions', peut ? [btnColler, btnDeposer] : [])]));
    var cies = h('div.barre-cies');
    AMX.barreConcessions(cies, { domaine: 'inventaire', valeur: this.compagnie, onchange: function (c) { self.compagnie = c; self.rendre(); } });
    this.el.appendChild(cies);
    if (this.apercu) { this.el.appendChild(this.carteApercu()); }
    else if (peut) this.el.appendChild(this.zoneDepot());
    if (this.erreur && !d) { this.el.appendChild(h('div.vide', [h('div', { html: I.alerte }), h('h3', 'Impossible de charger les listes'), h('div', { text: this.erreur })])); return; }
    if (!d) { this.el.appendChild(AMX.chargeur('Listes')); return; }
    var listes = d.listes.filter(function (l) { return !self.compagnie || l.compagnie === self.compagnie; });
    if (!listes.length) { this.el.appendChild(h('div.vide', [h('div', { html: I.listes }), h('h3', 'Aucune liste déposée'), h('div', { text: 'Déposez la liste reçue du prêteur (GM Financial, BMW FS…), un export du DMS ou une liste à vérifier : chaque véhicule sera situé.' })])); return; }
    var corps = listes.map(function (l) {
      var r = l.resume || null;
      var puces = [];
      if (r) {
        if (r.sorti) puces.push(h('span.lst-cat.sorti', { text: r.sorti + ' vendu' + (r.sorti > 1 ? 's' : '') + ', sorti' + (r.sorti > 1 ? 's' : '') }));
        if (r.introuvable) puces.push(h('span.lst-cat.introuvable', { text: r.introuvable + ' introuvable' + (r.introuvable > 1 ? 's' : '') }));
        if (r.vendu) puces.push(h('span.lst-cat.vendu', { text: r.vendu + ' vendu' + (r.vendu > 1 ? 's' : '') + ', pas livré' + (r.vendu > 1 ? 's' : '') }));
        if (!r.sorti && !r.introuvable && !r.vendu) puces.push(h('span.lst-cat.stock', { text: 'Tout est situé' }));
      } else puces.push(h('span.mini', { text: 'rapport à calculer' }));
      var pct = l.nb ? Math.round(100 * l.vus / l.nb) : 0;
      return h('tr.cliquable', { 'data-id': l.id, onclick: function () { AMX.aller('listes', '', { id: l.id }); } }, [
        h('td', [h('b', { text: l.nom }), h('div.mini', { text: [l.id, l.fichier].filter(Boolean).join(' · ') })]),
        h('td', { text: nomCie(l.compagnie) }),
        h('td', [h('div', { text: date(l.deposeLe) }), h('div.mini', { text: personne(l.deposePar) })]),
        h('td.num', { text: String(l.nb) }),
        h('td', [h('div.lst-jauge', [h('i', { style: { width: pct + '%' } })]), h('div.mini', { text: l.vus ? l.vus + ' / ' + l.nb + ' vus' + (l.auditLe ? ' · ' + date(l.auditLe) : '') : 'pas encore audité' })]),
        h('td', [h('div.lst-puces', puces)])
      ]);
    });
    this.el.appendChild(h('div.carte', [h('div.carte-entete', [h('h2', ['Listes déposées', h('span.sous', { text: pluriel(listes.length, 'liste') })]), h('button.btn.fantome.petit', { type: 'button', html: I.rafraichir + '<span>Rafraîchir</span>', onclick: function () { self.charger(true); } })]),
      h('div.carte-corps.lst-defile', [h('table.tableau#lst-listes', [h('thead', [h('tr', [h('th', 'Liste'), h('th', 'Concession'), h('th', 'Déposée'), h('th.num', 'Véhicules'), h('th', 'Audit'), h('th', 'Rapport')])]), h('tbody', corps)])])]));
  };

  Listes.prototype.zoneDepot = function () {
    var self = this;
    var zone = h('div.lst-depot#lst-depot', { role: 'button', tabindex: '0', onclick: function () { self.choisirFichier(); }, onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); self.choisirFichier(); } } }, [
      h('div.lst-depot-icone', { html: I.listes }),
      h('div', [h('b', 'Glissez ici une liste de véhicules'), h('div.mini', { text: 'PDF (ex. New Units de GM Financial), Excel ou CSV — ou cliquez pour choisir un fichier. Le fichier reste dans votre navigateur : seuls les NIV, # stock et modèles sont enregistrés.' })])
    ]);
    ['dragenter', 'dragover'].forEach(function (t) { zone.addEventListener(t, function (e) { e.preventDefault(); zone.classList.add('survol'); }); });
    ['dragleave', 'drop'].forEach(function (t) { zone.addEventListener(t, function (e) { e.preventDefault(); zone.classList.remove('survol'); }); });
    zone.addEventListener('drop', function (e) { var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) self.lire(f); });
    return zone;
  };
  Listes.prototype.choisirFichier = function () {
    var self = this;
    var inp = h('input#lst-fichier', { type: 'file', accept: '.pdf,.xlsx,.xlsm,.xls,.csv,.txt,application/pdf', style: { display: 'none' } });
    inp.addEventListener('change', function () { var f = inp.files && inp.files[0]; inp.remove(); if (f) self.lire(f); });
    document.body.appendChild(inp); inp.click();
  };
  Listes.prototype.collerListe = function () {
    var self = this;
    var zone = h('textarea.saisie#lst-colle', { rows: 12, placeholder: 'Collez ici la liste (une ligne par véhicule : NIV, année, marque, modèle, # stock…)' });
    AMX.modale({ titre: 'Coller une liste', corps: h('div', [h('p.mini', { text: 'Copiez les lignes d\'un courriel, d\'un tableau ou d\'un PDF puis collez-les : chaque ligne qui contient un NIV devient un véhicule.' }), zone]),
      boutons: [{ texte: 'Annuler' }, { texte: 'Lire la liste', classe: 'primaire', action: function () {
        var r = analyserTexte(zone.value, 'liste collée');
        if (!r.lignes.length) { AMX.toast('Aucun NIV trouvé dans le texte collé.', 'attention'); return false; }
        self.montrerApercu(r); return true;
      } }] });
    setTimeout(function () { zone.focus(); }, 50);
  };
  Listes.prototype.lire = function (fichier) {
    var self = this;
    AMX.toast('Lecture de ' + fichier.name + '…', 'info', 2500);
    lireFichier(fichier).then(function (r) {
      if (!r.lignes.length) { AMX.toast('Aucun véhicule reconnu dans ' + fichier.name + ' (il faut une colonne VIN / NIV, ou des NIV dans le texte).', 'attention', 8000); return; }
      self.montrerApercu(r);
    }, function (e) { AMX.toast('Lecture impossible : ' + AMX.erreurTexte(e), 'erreur', 8000); });
  };
  Listes.prototype.montrerApercu = function (r) {
    var e = r.entete || {};
    var texteCie = [e.concessionnaire, e.titre, r.fichier].join(' ');
    var cie = cieDepuisTexte(texteCie) || this.compagnie || AMX.maConcession && AMX.maConcession() || '';
    var plan = /GMF|GM FINANCIAL|FINANCIAL|FLOOR ?PLAN|NEW UNITS|BMW FS|PLAN DE FINANCEMENT/i.test([e.preteur, e.titre, r.fichier].join(' ')) || r.lignes.some(function (l) { return /^(NEW|USED)/i.test(l.credit); });
    var nom = '';
    if (plan) nom = (/GMF|GM FIN/i.test(e.preteur || '') ? 'GM Financial' : (e.preteur || 'Prêteur')) + ' — ' + (e.titre ? e.titre.replace(/\s*-\s*\d.*$/, '') : 'audit') + (e.dateAudit ? ' — ' + e.dateAudit : '');
    else nom = String(r.fichier || 'Liste').replace(/\.[a-z0-9]+$/i, '');
    this.apercu = { r: r, compagnie: cie, type: plan ? 'plan' : 'liste', nom: nom.slice(0, 100) };
    if (this.liste) { this.liste = null; AMX.aller('listes', '', {}); }
    this.rendre();
    var c = this.el.querySelector('#lst-apercu'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  Listes.prototype.carteApercu = function () {
    var self = this, a = this.apercu, r = a.r, e = r.entete || {};
    var douteux = r.lignes.filter(function (l) { return l.vinDouteux; }).length;
    var inpNom = h('input.saisie#lst-nom', { type: 'text', value: a.nom, maxlength: 100 });
    inpNom.addEventListener('input', function () { a.nom = inpNom.value; });
    var choix = h('div.barre-cies.lst-choix-cie');
    AMX.barreConcessions(choix, { domaine: 'inventaire', valeur: a.compagnie, garder: false, onchange: function (c) { a.compagnie = c; } });
    var segType = h('div.segment#lst-type', [['plan', 'Plan de financement (prêteur)'], ['liste', 'Autre liste']].map(function (t) { return h('button' + (a.type === t[0] ? '.actif' : ''), { type: 'button', 'data-type': t[0], text: t[1], onclick: function () { a.type = t[0]; segType.querySelectorAll('button').forEach(function (b) { b.classList.toggle('actif', b.dataset.type === t[0]); }); } }); }));
    var infos = [['Concessionnaire', e.concessionnaire], ['Prêteur', e.preteur], ['Date d\'audit', e.dateAudit], ['Auditeur', e.auditeur], ['Contact', e.contact]].filter(function (x) { return x[1]; });
    var apercuLignes = r.lignes.slice(0, 8).map(function (l) { return h('tr', [h('td.mono', { text: l.vin || '—' }), h('td', { text: vehiculeDe(l) }), h('td', { text: creditLisible(l.credit) }), h('td', { text: l.stock || '' })]); });
    var enregistrer = h('button.btn.primaire#lst-enregistrer', { type: 'button', text: 'Enregistrer et voir où sont les véhicules', onclick: function () {
      if (!a.compagnie) { AMX.toast('Choisissez la concession de la liste.', 'attention'); return; }
      enregistrer.classList.add('occupe');
      ecrire({ action: 'listeDeposer', nom: a.nom, compagnie: a.compagnie, type: a.type, fichier: r.fichier, entete: e,
        lignes: r.lignes.map(function (l) { return { vin: l.vin, stock: l.stock, annee: l.annee, marque: marqueLisible(l.marque), modele: l.modele, credit: l.credit, extra: l.extra }; }) })
        .then(function (rep) { enregistrer.classList.remove('occupe'); self.apercu = null; cache.quand = 0; AMX.toast('Liste enregistrée — ' + pluriel(rep.nb, 'véhicule') + '.', 'ok'); AMX.aller('listes', '', { id: rep.liste.id }); },
          function (err) { enregistrer.classList.remove('occupe'); AMX.toast('Liste non enregistrée : ' + AMX.erreurTexte(err), 'erreur', 8000); });
    } });
    return h('div.carte.lst-apercu#lst-apercu', [
      h('div.carte-entete', [h('h2', ['Liste lue', h('span.sous', { text: [r.fichier, pluriel(r.lignes.length, 'véhicule')].filter(Boolean).join(' · ') })]), h('button.btn.fantome.petit', { type: 'button', text: 'Annuler', onclick: function () { self.apercu = null; self.rendre(); } })]),
      h('div.carte-corps', [
        infos.length ? h('div.lst-infos', infos.map(function (x) { return h('div', [h('span', { text: x[0] }), h('b', { text: x[1] })]); })) : null,
        douteux ? h('p.lst-avis', { text: pluriel(douteux, 'NIV') + ' sans chiffre de contrôle valide (NIV hors Amérique du Nord, ou mal lu) : vérifiez-les dans le rapport.' }) : null,
        h('label.champ', [h('span', 'Nom de la liste'), inpNom]),
        h('div.champ', [h('span', 'Concession'), choix]),
        h('div.champ', [h('span', 'Type'), segType]),
        h('div.lst-defile', [h('table.tableau.lst-mini', [h('thead', [h('tr', [h('th', 'NIV'), h('th', 'Véhicule'), h('th', 'Ligne de crédit'), h('th', '# stock')])]), h('tbody', apercuLignes)])]),
        r.lignes.length > 8 ? h('p.mini', { text: '… et ' + (r.lignes.length - 8) + ' autres.' }) : null,
        h('div.lst-actions', [enregistrer])
      ])
    ]);
  };

  /* ------------------------------ Une liste : le rapport ------------------------------ */
  Listes.prototype.ouvrir = function (id) {
    var self = this, gen = ++this.generation;
    this.liste = { liste: { id: id, nom: 'Liste ' + id }, lignes: [], chargement: true };
    AMX.vider(this.el); this.el.appendChild(AMX.chargeur('Liste ' + id));
    Promise.all([chargerUne(id), AMX.recherche ? AMX.recherche.chargerSources(SOURCES_LIEU).catch(function () { return []; }) : Promise.resolve([])]).then(function (res) {
      if (self.detruit || gen !== self.generation) return;
      self.liste = res[0]; self.sources = res[1];
      self.idx = AMX.recherche ? AMX.recherche.index(SOURCES_LIEU) : { parVin: {}, parVin8: {}, parStock: {} };
      self.calculer(); self.rendreListe(); self.sauverRapport();
    }, function (e) {
      if (self.detruit || gen !== self.generation) return;
      self.liste = null; AMX.vider(self.el);
      self.el.appendChild(h('div.vide', [h('div', { html: I.alerte }), h('h3', 'Liste introuvable'), h('div', { text: AMX.erreurTexte(e) }), h('p', [h('a', { href: AMX.lien('listes', '', {}), text: '← Toutes les listes' })])]));
    });
  };
  Listes.prototype.calculer = function () {
    var L = this.liste, idx = this.idx;
    L.lignes.forEach(function (l) { l._ou = localiser(l, idx, L.liste.compagnie, L.liste.type); });
    L.resume = resumeDe(L.lignes);
  };
  /* Garde au serveur la copie du rapport (pour l'app) quand elle a changé. */
  Listes.prototype.sauverRapport = function (force) {
    var L = this.liste; if (!L) return;
    var cle = function (o) { return o ? [o.cat, o.texte, o.detail, o.alerte].join('|') : ''; };
    var changees = L.lignes.filter(function (l) { return force || cle(l._ou) !== cle(l.ou); });
    if (!changees.length && L.liste.rapportLe) return;
    var resume = L.resume;
    ecrire({ action: 'listeRapport', id: L.liste.id, resume: resume, lignes: changees.map(function (l) { return { rang: l.rang, ou: { cat: l._ou.cat, texte: l._ou.texte, detail: l._ou.detail, alerte: l._ou.alerte } }; }) })
      .then(function (r) { changees.forEach(function (l) { l.ou = { cat: l._ou.cat, texte: l._ou.texte, detail: l._ou.detail, alerte: l._ou.alerte }; }); L.liste.rapportLe = r.rapportLe; L.liste.resume = resume; cache.quand = 0; }, function () {});
  };
  Listes.prototype.rafraichirRapport = function () {
    var self = this, L = this.liste; if (!L) return;
    var id = L.liste.id;
    AMX.toast('Relecture de l\'inventaire, des ventes et du service…', 'info', 2500);
    Promise.all([chargerUne(id), AMX.recherche.chargerSources(SOURCES_LIEU, true)]).then(function (res) {
      if (self.detruit || !self.liste || self.liste.liste.id !== id) return;
      self.liste = res[0]; self.sources = res[1]; self.idx = AMX.recherche.index(SOURCES_LIEU);
      self.calculer(); self.rendreListe(); self.sauverRapport();
      AMX.toast('Rapport à jour.', 'ok');
    }, function (e) { AMX.toast('Mise à jour impossible : ' + AMX.erreurTexte(e), 'erreur'); });
  };

  Listes.prototype.lignesVisibles = function () {
    var f = this.filtre, q = norm(this.recherche).trim();
    return this.liste.lignes.filter(function (l) {
      if (f === 'alertes' && !(l._ou && l._ou.alerte)) return false;
      if (f === 'vus' && !l.vuLe) return false;
      if (f === 'nonvus' && l.vuLe) return false;
      if (f && CATS[f] && (!l._ou || l._ou.cat !== f)) return false;
      if (q && norm([l.vin, l.stock, l.annee, marqueLisible(l.marque), l.modele, l.credit, l._ou && l._ou.texte, l._ou && l._ou.detail, l.note].join(' ')).indexOf(q) < 0) return false;
      return true;
    });
  };
  Listes.prototype.rendreListe = function () {
    var self = this, L = this.liste, li = L.liste, e = li.entete || {}, r = L.resume;
    AMX.vider(this.el);
    var menu = [
      h('button.btn', { type: 'button', html: I.rafraichir + '<span>Mettre à jour le rapport</span>', onclick: function () { self.rafraichirRapport(); } }),
      h('button.btn', { type: 'button', html: I.telecharger + '<span>Exporter Excel</span>', onclick: function () { self.exporter(); } })
    ];
    if (L.peutEcrire) menu.push(h('button.btn.fantome', { type: 'button', text: 'Renommer', onclick: function () { self.renommer(); } }));
    if (L.peutSupprimer) menu.push(h('button.btn.fantome.danger', { type: 'button', text: 'Supprimer', onclick: function () { self.supprimer(); } }));
    var sous = [nomCie(li.compagnie), li.type === 'plan' ? 'plan de financement' : 'liste', li.fichier, 'déposée le ' + date(li.deposeLe) + ' par ' + personne(li.deposePar)].filter(Boolean).join(' · ');
    this.el.appendChild(h('div.entete-page', [h('div', [h('p.lst-retour', [h('a', { href: AMX.lien('listes', '', {}), text: '← Toutes les listes' })]), h('h1', { text: li.nom }), h('p', { text: sous })]), h('div.actions', menu)]));
    var infos = [['Concessionnaire', e.concessionnaire], ['Prêteur', e.preteur], ['Date d\'audit', e.dateAudit], ['Auditeur', e.auditeur], ['Contact', e.contact]].filter(function (x) { return x[1]; });
    if (infos.length) this.el.appendChild(h('div.lst-infos.carte', infos.map(function (x) { return h('div', [h('span', { text: x[0] }), h('b', { text: x[1] })]); })));
    // Chiffres clés = filtres
    var kpi = function (cle, valeur, libelle, cls, sousTxt) {
      return h('div.kpi' + (cls ? '.' + cls : '') + (self.filtre === cle ? '.actif' : ''), { role: 'button', tabindex: '0', 'data-filtre': cle, onclick: function () { self.filtre = self.filtre === cle ? '' : cle; self.rendreListe(); } },
        [h('div.valeur', { text: String(valeur) }), h('div.libelle', { text: libelle }), sousTxt ? h('div.sous', { text: sousTxt }) : null]);
    };
    var kpis = h('div.kpis.lst-kpis', [
      kpi('', r.total, 'Véhicules', '', li.type === 'plan' ? 'sur la liste du prêteur' : 'sur la liste'),
      kpi('stock', r.stock, 'En stock', ''),
      kpi('service', r.service, 'Au service', ''),
      kpi('demo', r.demo, 'Démos', ''),
      kpi('transit', r.transit, 'En route', ''),
      kpi('vendu', r.vendu, 'Vendus, pas livrés', r.vendu ? 'attention' : ''),
      kpi('sorti', r.sorti, 'Vendus, sortis', r.sorti ? 'alerte' : '', li.type === 'plan' && r.sorti ? 'à rembourser au prêteur' : ''),
      kpi('introuvable', r.introuvable, 'Introuvables', r.introuvable ? 'alerte' : ''),
      kpi('vus', r.vus, 'Vus à l\'audit', '', r.vus + ' / ' + r.total + (li.auditLe ? ' · ' + date(li.auditLe) : ''))
    ]);
    this.el.appendChild(kpis);
    // Barre : recherche + filtres + état des sources
    var inp = h('input.saisie#lst-recherche', { type: 'search', placeholder: 'NIV, # stock, modèle…', value: this.recherche });
    inp.addEventListener('input', AMX.debounce(function () { self.recherche = inp.value; self.rendreTable(); }, 150));
    var segAudit = h('div.segment.petit#lst-audit-filtre', [['', 'Tous'], ['alertes', 'Avec alerte'], ['nonvus', 'Pas vus'], ['vus', 'Vus']].map(function (x) { return h('button' + ((self.filtre === x[0] || (!CATS[self.filtre] && self.filtre === x[0])) ? '.actif' : ''), { type: 'button', 'data-f': x[0], text: x[1], onclick: function () { self.filtre = x[0]; self.rendreListe(); } }); }));
    var srcTexte = (this.sources || []).map(function (s) { return s.nom + (s.erreur ? ' (non lu)' : ' ' + s.n); }).join(' · ');
    this.el.appendChild(h('div.lst-outils', [inp, segAudit, h('span.mini.lst-sources', { text: srcTexte ? 'Comparé à : ' + srcTexte : '' })]));
    this.elTable = h('div.carte.lst-rapport');
    this.el.appendChild(this.elTable);
    this.rendreTable();
    this.el.appendChild(h('p.mini.lst-note', { text: 'L\'audit sur le terrain se fait dans l\'app ScanAutomax : Audit › Une liste déposée › ' + li.nom + '. Chaque NIV scanné revient ici dans la colonne Audit.' }));
  };
  Listes.prototype.rendreTable = function () {
    var self = this, L = this.liste, lignes = this.lignesVisibles().slice();
    lignes.sort(function (a, b) {
      var ca = a._ou ? (CATS[a._ou.cat] || {}).ordre || 9 : 9, cb = b._ou ? (CATS[b._ou.cat] || {}).ordre || 9 : 9;
      return (ca - cb) || ((a._ou && a._ou.alerte ? 0 : 1) - (b._ou && b._ou.alerte ? 0 : 1)) || (a.rang - b.rang);
    });
    AMX.vider(this.elTable);
    this.elTable.appendChild(h('div.carte-entete', [h('h2', ['Où sont les véhicules', h('span.sous', { text: pluriel(lignes.length, 'véhicule') + (this.filtre || this.recherche ? ' (filtrés)' : '') + ' · les cas à régler en premier' })])]));
    if (!lignes.length) { this.elTable.appendChild(h('div.carte-corps', [h('p.mini', { text: 'Aucun véhicule pour ce filtre.' })])); return; }
    var corps = lignes.map(function (l) {
      var o = l._ou || {}, cat = CATS[o.cat] || { libelle: '?' };
      var puces = (o.items || []).filter(function (it) { return it.src.puce; }).slice(0, 4).map(function (it) { return AMX.recherche.puce(it); });
      var audit = l.vuLe ? h('div.lst-vu', [h('b', { text: '✓ Vu' }), h('div.mini', { text: dateHeure(l.vuLe) + (l.vuPar ? ' · ' + personne(l.vuPar) : '') + (l.vuSource ? ' (' + (l.vuSource === 'app' ? 'app' : 'site') + ')' : '') })])
        : (L.peutEcrire ? h('button.btn.petit.lst-marquer', { type: 'button', text: 'Marquer vu', onclick: function (ev) { ev.stopPropagation(); self.marquerVu(l, true); } }) : h('span.mini', { text: 'pas vu' }));
      return h('tr' + (o.alerte ? '.lst-alerte' : ''), { 'data-rang': String(l.rang), 'data-cat': o.cat || '' }, [
        h('td.num.mini', { text: String(l.rang) }),
        h('td', [h('div.mono.lst-vin', { text: l.vin || '—', title: l.vinDouteux ? 'Chiffre de contrôle à vérifier' : '' }), h('div.mini', { text: vehiculeDe(l) })]),
        h('td', [h('div', { text: creditLisible(l.credit) || '—' }), l.stock ? h('div.mini', { text: '# ' + l.stock }) : null]),
        h('td', [h('span.lst-cat.' + (o.cat || 'introuvable'), { text: cat.libelle }), h('div.lst-ou', { text: o.texte || '' }), o.detail ? h('div.mini', { text: o.detail }) : null,
          o.alerte ? h('div.lst-alerte-texte', { text: o.alerte }) : null, puces.length ? h('div.lst-puces', puces) : null]),
        h('td', [audit, l.note ? h('div.mini.lst-note-ligne', { text: '« ' + l.note + ' »' }) : null, L.peutEcrire ? h('button.lien.mini', { type: 'button', text: l.note ? 'Modifier la note' : 'Note', onclick: function () { self.noter(l); } }) : null])
      ]);
    });
    this.elTable.appendChild(h('div.carte-corps.lst-defile', [h('table.tableau#lst-rapport', [h('thead', [h('tr', [h('th.num', '#'), h('th', 'NIV · véhicule'), h('th', 'Liste'), h('th', 'Où il est selon ScanAutomax'), h('th', 'Audit')])]), h('tbody', corps)])]));
  };
  Listes.prototype.marquerVu = function (l, vu) {
    var self = this, L = this.liste;
    ecrire({ action: 'listeLigne', id: L.liste.id, rang: String(l.rang), vu: vu }).then(function (r) {
      l.vuLe = r.ligne.vuLe; l.vuPar = r.ligne.vuPar; l.vuSource = r.ligne.vuSource; L.resume = resumeDe(L.lignes); cache.quand = 0; self.rendreListe();
    }, function (e) { AMX.toast('Non enregistré : ' + AMX.erreurTexte(e), 'erreur'); });
  };
  Listes.prototype.noter = function (l) {
    var self = this, L = this.liste;
    var zone = h('textarea.saisie', { rows: 4, maxlength: 300 }); zone.value = l.note || '';
    var cases = l.vuLe ? h('label.champ.inline', [h('input', { type: 'checkbox', id: 'lst-pas-vu' }), h('span', 'Retirer « vu »')]) : null;
    AMX.modale({ titre: 'Note — ' + (l.vin || '# ' + l.stock), corps: h('div', [zone, cases]), boutons: [{ texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: function () {
      var corps = { action: 'listeLigne', id: L.liste.id, rang: String(l.rang), note: zone.value };
      var pv = document.getElementById('lst-pas-vu'); if (pv && pv.checked) corps.vu = false;
      return ecrire(corps).then(function (r) { l.note = r.ligne.note; l.vuLe = r.ligne.vuLe; l.vuPar = r.ligne.vuPar; l.vuSource = r.ligne.vuSource; L.resume = resumeDe(L.lignes); self.rendreListe(); }, function (e) { AMX.toast('Non enregistré : ' + AMX.erreurTexte(e), 'erreur'); return false; });
    } }] });
    setTimeout(function () { zone.focus(); }, 50);
  };
  Listes.prototype.renommer = function () {
    var self = this, L = this.liste;
    var inp = h('input.saisie', { type: 'text', maxlength: 100 }); inp.value = L.liste.nom;
    AMX.modale({ titre: 'Renommer la liste', corps: inp, boutons: [{ texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: function () {
      return ecrire({ action: 'listeModifier', id: L.liste.id, nom: inp.value }).then(function (r) { L.liste.nom = r.liste.nom; cache.quand = 0; self.rendreListe(); }, function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); return false; });
    } }] });
  };
  Listes.prototype.supprimer = function () {
    var L = this.liste;
    AMX.confirmer('Supprimer la liste ?', 'La liste « ' + L.liste.nom + ' », son rapport et son audit seront effacés. Le fichier d\'origine n\'est pas touché.', { ok: 'Supprimer', danger: true }).then(function (oui) {
      if (!oui) return;
      ecrire({ action: 'listeSupprimer', id: L.liste.id }).then(function () { cache.quand = 0; AMX.toast('Liste supprimée.', 'ok'); AMX.aller('listes', '', {}); }, function (e) { AMX.toast('Non supprimée : ' + AMX.erreurTexte(e), 'erreur'); });
    });
  };
  Listes.prototype.exporter = function () {
    var L = this.liste;
    if (typeof XLSX === 'undefined') { AMX.toast('La bibliothèque Excel n\'est pas encore chargée. Réessayez.', 'erreur'); return; }
    var rows = L.lignes.map(function (l) {
      var o = l._ou || {}, row = { '#': l.rang, 'NIV': l.vin, 'Année': l.annee, 'Marque': marqueLisible(l.marque), 'Modèle': l.modele, 'Ligne de crédit': l.credit, '# stock (liste)': l.stock,
        'Où (ScanAutomax)': (CATS[o.cat] || {}).libelle || '', 'Détail': [o.texte, o.detail].filter(Boolean).join(' — '), 'Alerte': o.alerte || '',
        'Vu à l\'audit': l.vuLe ? dateHeure(l.vuLe) : '', 'Vu par': l.vuPar || '', 'Note': l.note || '' };
      Object.keys(l.extra || {}).forEach(function (k) { row[k] = l.extra[k]; });
      return row;
    });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Rapport');
    XLSX.writeFile(wb, 'liste-' + String(L.liste.id).toLowerCase() + '-' + aujourdhui() + '.xlsx');
    AMX.toast('Export Excel — ' + pluriel(rows.length, 'véhicule'), 'ok');
  };

  /* Pour les tests et l'app : la même lecture et le même classement. */
  AMX.listes = { charger: chargerListes, lireFichier: lireFichier, analyserTexte: analyserTexte, analyserPdf: analyserPdf, localiser: localiser, vinValide: vinValide, cats: CATS };

  function injecterCss() {
    if (document.getElementById('css-listes')) return;
    var s = document.createElement('style'); s.id = 'css-listes';
    s.textContent = [
      '.lst-page .carte { margin-bottom: 14px; }',
      '.lst-page .mini { font-size: 11.5px; color: var(--encre-3); }',
      '.lst-page .carte-entete h2 .sous { font-size: 12px; font-weight: 400; color: var(--encre-3); margin-left: 8px; }',
      '.lst-page .carte-corps { padding: 12px 16px; }',
      '.lst-page .carte-corps.lst-defile { padding: 0; overflow-x: auto; }',
      '.lst-page .carte-corps.lst-defile .tableau { border: none; border-radius: 0; box-shadow: none; }',
      '.lst-depot { display: flex; align-items: center; gap: 16px; padding: 22px; margin-bottom: 14px; border: 2px dashed var(--ligne-forte); border-radius: var(--rayon); background: var(--carte); cursor: pointer; }',
      '.lst-depot:hover, .lst-depot.survol { border-color: var(--vert); background: var(--vert-clair); }',
      '.lst-depot-icone svg { width: 34px; height: 34px; color: var(--vert); }',
      '.lst-depot b { font-size: 14px; }',
      '.lst-apercu .champ { margin-top: 10px; }',
      '.lst-apercu .lst-actions { margin-top: 14px; display: flex; justify-content: flex-end; }',
      '.lst-infos { display: flex; flex-wrap: wrap; gap: 8px 22px; padding: 10px 16px; margin-bottom: 14px; }',
      '.lst-apercu .lst-infos { padding: 0; margin-bottom: 4px; }',
      '.lst-infos div { display: flex; flex-direction: column; } .lst-infos span { font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; color: var(--encre-3); font-weight: 600; } .lst-infos b { font-size: 13px; }',
      '.lst-avis { background: var(--ambre-bg); border: 1px solid var(--ambre-bord); color: var(--encre-2); padding: 8px 10px; border-radius: 8px; font-size: 12.5px; }',
      '.lst-mini td, .lst-mini th { white-space: nowrap; }',
      '.lst-page .mono, .lst-vin { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 12px; letter-spacing: .02em; }',
      '.lst-jauge { height: 6px; width: 110px; background: var(--gris-bg); border-radius: 3px; overflow: hidden; margin-bottom: 3px; } .lst-jauge i { display: block; height: 100%; background: var(--vert); }',
      '.lst-puces { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }',
      '.lst-cat { display: inline-block; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; white-space: nowrap; }',
      '.lst-cat.sorti, .lst-cat.introuvable { background: var(--rouge-bg); color: var(--rouge); border: 1px solid var(--rouge-bord); }',
      '.lst-cat.vendu { background: var(--ambre-bg); color: var(--ambre); border: 1px solid var(--ambre-bord); }',
      '.lst-cat.transit { background: var(--violet-bg); color: var(--violet); border: 1px solid var(--violet-bord); }',
      '.lst-cat.service { background: var(--sarcelle-bg); color: var(--sarcelle); border: 1px solid var(--sarcelle-bord); }',
      '.lst-cat.demo { background: var(--bleu-bg); color: var(--bleu); border: 1px solid var(--bleu-bord); }',
      '.lst-cat.stock { background: var(--vert-clair); color: var(--vert-fonce); border: 1px solid var(--vert); }',
      '.lst-ou { font-size: 13px; margin-top: 3px; }',
      '.lst-alerte-texte { color: var(--rouge); font-size: 12px; font-weight: 600; margin-top: 2px; }',
      '#lst-rapport tr.lst-alerte td:first-child { box-shadow: inset 3px 0 0 var(--rouge); }',
      '#lst-rapport td { vertical-align: top; }',
      '.lst-vu b { color: var(--vert); }',
      '.lst-outils { display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: center; margin-bottom: 12px; }',
      '.lst-outils input { max-width: 260px; }',
      '.lst-sources { margin-left: auto; }',
      '.lst-retour { margin: 0 0 4px; } .lst-retour a { color: var(--encre-3); text-decoration: none; font-size: 12.5px; }',
      '.lst-note { margin-top: 8px; }',
      'button.lien { background: none; border: none; padding: 0; color: var(--vert); cursor: pointer; font: inherit; }',
      '.lst-choix-cie { margin-bottom: 0; }',
      '@media (max-width: 700px) { .lst-sources { margin-left: 0; } .lst-depot { padding: 16px; } }'
    ].join('\n');
    document.head.appendChild(s);
  }
})();
