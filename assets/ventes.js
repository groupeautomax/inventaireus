/* ScanAutomax — Vente › Livre des ventes (21 oct. 2026, v120)
   Maxime : « je cherche à utiliser l'app et le site pour remplir le livre des ventes plutôt que de remplir le
   livre des ventes lui-même. » Puis : « importe les ventes déjà inscrites dans les livres ; un tableau récapitulatif ;
   renomme Ventes en Livre des ventes ; un lien entre la déclaration et l'évaluation de l'échange, qu'on puisse
   l'importer ; indique le mois afférent selon la date d'inscription ; sépare qui inscrit la vente (directeur des
   ventes) et le directeur commercial (F&I) qui inscrit ses profits et les produits — courriel au F&I à chaque
   inscription, rappel après 24 h. »
   Deux vues : Liste (groupée par mois) et Récapitulatif (mois × neufs / usagés / wholesale, conseillers, produits F&I).
   Routes : GET ?ventes=1 (gz) · ?ventesRecap=1 · ?venteId= · ?venteVin= · ?evalVin= ; POST venteDeclarer ·
   venteCompleter · venteAnnuler · venteRenvoyer · venteRelire · venteLivreCreer · venteImporter (Vente.gs). */
(function () {
  'use strict';
  var h = AMX.h, I = AMX.icones;
  var SCRIPT_PAS_A_JOUR = 'Le script n\'est pas à jour (Vente.gs) : redéployez-le.';
  var TYPES = { neuf: 'Neuf', usage: 'Usagé', wholesale: 'Wholesale' };
  var CATEGORIES = {
    neuf: [['stock', 'Stock'], ['locate', 'Locate'], ['commande', 'Commande'], ['demo', 'Démo'], ['courtoisie', 'Courtoisie'], ['fleet', 'Flotte']],
    usage: [['certifie', 'Certifié'], ['noncertifie', 'Non certifié'], ['autremarque', 'Autre marque'], ['rachat', 'Rachat de bail']],
    wholesale: [['achat', 'Achat revendu'], ['echange', 'Échange revendu'], ['lmb', 'LMB']]
  };
  var PAIEMENTS = [['financement', 'Financement'], ['location', 'Location'], ['comptant', 'Comptant']];
  var ETATS = { declaree: 'Attente F&I', completee: 'Au livre', comptabilisee: 'Comptabilisée', annulee: 'Annulée' };
  var PERIODES = [['', '60 jours'], ['mois', 'Ce mois'], ['precedent', 'Mois dernier'], ['annee', 'Année'], ['tout', 'Tout']];
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  /* Les 16 produits F&I du livre BMW (Maxime, 21 oct.) — le serveur envoie la même liste (`produits`), celle-ci sert de repli. */
  var PRODUITS_DEFAUT = [['ristourne', 'RISTOURNE'], ['gprolonge', 'GPROLONGÉ'], ['pneusJantes', 'PNEUS ET JANTES'], ['entretien', 'ENTRETIEN INCLUS'], ['esthetiqueUpsale', 'ESTHÉTIQUE UPSALE'], ['esthetiqueBase', 'ESTHÉTIQUE BASE'],
    ['adr', 'ADR / ass. rempl.'], ['usure', 'USURE EXCESSIVE'], ['assCredit', 'ASS CRÉDIT'], ['tag', 'TAG'], ['peinture', 'PEINTURE'], ['cuir', 'CUIR'], ['vinlock', 'VINLOCK (marquage BMW)'], ['vitres', 'VITRES'], ['demarreur', 'DÉMARREUR'], ['protex', 'PROTEX']];

  function isoLocal(d) { var p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  function moisDe(periode) {
    var d = new Date();
    if (periode === 'mois') return isoLocal(d).slice(0, 7);
    if (periode === 'precedent') { d.setDate(1); d.setMonth(d.getMonth() - 1); return isoLocal(d).slice(0, 7); }
    if (periode === 'annee') return String(d.getFullYear());
    if (/^\d{4}(-\d{2})?$/.test(periode || '')) return periode;   /* un mois ou une année précis (depuis le récapitulatif) */
    return periode === 'tout' ? 'tout' : '';
  }
  function moisLibelle(m) { var r = /^(\d{4})-(\d{2})/.exec(m || ''); return r ? MOIS[parseInt(r[2], 10) - 1] + ' ' + r[1] : (m || ''); }
  /* 22 oct. (Maxime) : une vente compte dans le mois de sa LIVRAISON (sinon de sa vente) — le serveur envoie `mois` calculé ainsi. */
  function dateLivraisonOk(v) { return /^\d{4}-\d{2}-\d{2}/.test(String(v.dateLivraison || '')); }
  function moisDeVente(v) { return v.mois || String((dateLivraisonOk(v) ? v.dateLivraison : '') || v.dateVente || v.declareLe || '').slice(0, 7); }
  function capitale(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  function nombre(x) { if (x === null || x === undefined || x === '') return null; if (typeof x === 'number') return isNaN(x) ? null : x; var s = String(x).replace(/\s| | /g, '').replace(/\$/g, ''); var neg = /^\(.*\)$/.test(s) || s.indexOf('-') >= 0; s = s.replace(/[()\-]/g, ''); var v = s.lastIndexOf(','), pt = s.lastIndexOf('.'); if (v >= 0 && pt >= 0) { if (v > pt) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, ''); } else if (v >= 0) s = s.replace(',', '.'); var n = parseFloat(s); return isNaN(n) ? null : (neg ? -n : n); }
  function argent(n) { return n === null || n === undefined || n === '' || isNaN(n) ? '—' : AMX.fmtArgent(n); }
  function signe(n) { if (n === null || n === undefined || isNaN(n)) return '—'; return (n > 0 ? '+' : '') + AMX.fmtArgent(n); }
  function libCategorie(type, c) { var l = CATEGORIES[type] || []; for (var i = 0; i < l.length; i++) if (l[i][0] === c) return l[i][1]; return c || ''; }
  function libPaiement(p) { for (var i = 0; i < PAIEMENTS.length; i++) if (PAIEMENTS[i][0] === p) return PAIEMENTS[i][1]; return p || ''; }
  function vehiculeTexte(v) { return v.vehicule || [v.annee, v.marque, v.modele, v.version].filter(Boolean).join(' ') || v.modeleTexte || ''; }
  function front(v) { return nombre(v.profitReel !== null && v.profitReel !== undefined && v.profitReel !== '' ? v.profitReel : v.profitPrevu); }
  function fiDe(v) { return nombre(v.profitFIReel !== null && v.profitFIReel !== undefined && v.profitFIReel !== '' ? v.profitFIReel : v.profitFIPrevu); }
  /* Profit estimé (front + F&I prévus) contre profit comptable (front + F&I réels inscrits par la comptabilité), côte à côte. */
  function deux(a, b) { var x = nombre(a), y = nombre(b); return x === null && y === null ? null : Math.round(((x || 0) + (y || 0)) * 100) / 100; }
  function estimeDe(v) { return v.profitEstime !== undefined ? nombre(v.profitEstime) : deux(v.profitPrevu, v.profitFIPrevu); }
  function comptableDe(v) { return v.profitComptable !== undefined ? nombre(v.profitComptable) : deux(v.profitReel, v.profitFIReel); }
  function ecartDe(v) { var e = estimeDe(v), c = comptableDe(v); return e === null || c === null ? null : Math.round((c - e) * 100) / 100; }
  /* 22 oct. (Maxime) : le front (la voiture) et le F&I séparés, chacun estimé / comptable / écart. */
  function frontE(v) { return nombre(v.profitPrevu); }
  function frontC(v) { return nombre(v.profitReel); }
  function fiE(v) { return nombre(v.profitFIPrevu); }
  function fiC(v) { return nombre(v.profitFIReel); }
  function ecartEC(e, c) { return e === null || c === null ? null : Math.round((c - e) * 100) / 100; }
  /* Le profit F&I estimé n'est pas inscrit (pas en wholesale) : le bouton « Profits F&I » apparaît partout. */
  function besoinFI(v) { return v.fiAInscrire !== undefined ? !!v.fiAInscrire : (v.statut !== 'annulee' && v.type !== 'wholesale' && fiE(v) === null); }
  function cumulPaire(liste, e, c) {
    var t = { estime: 0, nEstime: 0, comptable: 0, nComptable: 0, ecart: 0, nPaires: 0 };
    liste.forEach(function (v) { var x = e(v), y = c(v); if (x !== null) { t.estime += x; t.nEstime++; } if (y !== null) { t.comptable += y; t.nComptable++; } if (x !== null && y !== null) { t.ecart += y - x; t.nPaires++; } });
    t.ecart = Math.round(t.ecart * 100) / 100;
    return t;
  }
  function cumulProfits(liste) { var t = cumulPaire(liste, estimeDe, comptableDe); t.front = cumulPaire(liste, frontE, frontC); t.fi = cumulPaire(liste, fiE, fiC); return t; }
  /* Une carte « Front (voiture) » ou « F&I » : estimé, comptable et écart l'un sous l'autre. */
  function carteComparaison(id, titre, q, extra) {
    var ligne = function (l, v, sous, cls) { return h('div.cmp-ligne' + (cls || ''), [h('span.l', { text: l }), h('span.v', { text: v }), sous ? h('span.n', { text: sous }) : null]); };
    return h('div.kpi.neutre.ventes-comp#' + id, [h('div.titre', { text: titre }),
      ligne('Estimé', q.nEstime ? argent(q.estime) : '—', q.nEstime ? String(q.nEstime) : ''),
      ligne('Comptable', q.nComptable ? argent(q.comptable) : '—', q.nComptable ? String(q.nComptable) : ''),
      ligne('Écart', q.nPaires ? signe(q.ecart) : '—', q.nPaires ? 'sur ' + q.nPaires : '', q.nPaires ? classeEcart(q.ecart) : ''),
      extra || null]);
  }
  function classeEcart(n) { return n === null || n === undefined || !n ? '' : (n > 0 ? '.ecart-plus' : '.ecart-moins'); }
  function compteTypes(liste) { var c = { neuf: 0, usage: 0, wholesale: 0 }; liste.forEach(function (v) { if (c[v.type] !== undefined) c[v.type]++; }); return c; }
  function pluriel(n, mot) { return n + ' ' + mot + (n > 1 ? 's' : ''); }
  function produitsDe(v) {
    var x = v && v.produits; if (!x) return {};
    if (typeof x === 'string') { try { x = JSON.parse(x); } catch (e) { return {}; } }
    return x && typeof x === 'object' ? x : {};
  }
  function produitsListe(v) {
    var prd = produitsDe(v), defs = AMX.ventes.produits(), out = [];
    defs.forEach(function (p) { if (prd[p[0]] === undefined || prd[p[0]] === null || prd[p[0]] === '' || prd[p[0]] === false) return; out.push({ code: p[0], libelle: p[1], montant: typeof prd[p[0]] === 'number' ? prd[p[0]] : nombre(prd[p[0]]) }); });
    return out;
  }

  /* ------------------------------ Cache et appels ------------------------------ */
  var cache = { rep: null, quand: 0, cle: '', cleEnCours: '', promesse: null, copieLe: 0 };
  var cacheRecap = { rep: null, quand: 0, cle: '', cleEnCours: '', promesse: null, copieLe: 0 };
  function cleDe(cie, mois) { return String(cie || '') + '|' + String(mois || ''); }
  function cleCopie(prefixe, cle) { return prefixe + cle.replace(/[^A-Za-z0-9]/g, '_'); }
  function verifier(d) {
    if (!d) throw new Error('Aucune réponse');
    if (d.refuse) throw new Error(d.erreur || 'Accès refusé.');
    if (d.ok === false) throw new Error(d.erreur || 'Le serveur a refusé.');
    if (!Array.isArray(d.ventes) || !d.etats) throw new Error(SCRIPT_PAS_A_JOUR);
    return d;
  }
  function verifierRecap(r) {
    if (!r) throw new Error('Aucune réponse');
    if (r.refuse) throw new Error(r.erreur || 'Accès refusé.');
    if (r.ok === false) throw new Error(r.erreur || 'Le serveur a refusé.');
    if (!Array.isArray(r.mois) || !r.totaux) throw new Error(SCRIPT_PAS_A_JOUR);
    return r;
  }
  function verifierPost(r) {
    if (!r) throw new Error('Aucune réponse');
    if (r.refuse) throw new Error(r.erreur || 'Action refusée pour ce compte.');
    if (r.ok === false) { var e = new Error(r.erreur || 'Le serveur a refusé.'); e.code = r.code; e.vente = r.vente; throw e; }
    if (!r.vente && r.vehicules) throw new Error(SCRIPT_PAS_A_JOUR);
    return r;
  }
  AMX.ventes = {
    charger: function (cie, mois, force) {
      var cle = cleDe(cie, mois);
      if (!force && cache.rep && cache.cle === cle && Date.now() - cache.quand < 45000) return Promise.resolve(cache.rep);
      if (cache.promesse && cache.cleEnCours === cle) return cache.promesse;
      var params = { ventes: 1 }; if (cie) params.compagnie = cie; if (mois) params.mois = mois; if (force === 'relire') params.relire = 1;
      cache.cleEnCours = cle;
      cache.promesse = AMX.get(params, { gz: true, copie: cleCopie('ventes_', cle), secours: false, delai: 60000 }).then(function (d) {
        cache.promesse = null; cache.cleEnCours = '';
        verifier(d);
        cache.rep = d; cache.quand = Date.now(); cache.cle = cle; cache.copieLe = 0;
        document.dispatchEvent(new CustomEvent('amx:ventes'));
        return d;
      }, function (e) { cache.promesse = null; cache.cleEnCours = ''; throw e; });
      return cache.promesse;
    },
    copie: function (cie, mois) { return AMX.cacheLocal.lireGz(cleCopie('ventes_', cleDe(cie, mois)), 7 * 86400000); },
    /* Le tableau récapitulatif d'une année (?ventesRecap=1) : par mois × neufs / usagés / wholesale, conseillers, produits F&I. */
    recap: function (cie, annee, force) {
      var cle = cleDe(cie, annee);
      if (!force && cacheRecap.rep && cacheRecap.cle === cle && Date.now() - cacheRecap.quand < 45000) return Promise.resolve(cacheRecap.rep);
      if (cacheRecap.promesse && cacheRecap.cleEnCours === cle) return cacheRecap.promesse;
      var params = { ventesRecap: 1 }; if (cie) params.compagnie = cie; if (annee) params.annee = annee;
      cacheRecap.cleEnCours = cle;
      cacheRecap.promesse = AMX.get(params, { gz: true, copie: cleCopie('ventes_recap_', cle), secours: false, delai: 60000 }).then(function (r) {
        cacheRecap.promesse = null; cacheRecap.cleEnCours = '';
        verifierRecap(r);
        cacheRecap.rep = r; cacheRecap.quand = Date.now(); cacheRecap.cle = cle; cacheRecap.copieLe = 0;
        return r;
      }, function (e) { cacheRecap.promesse = null; cacheRecap.cleEnCours = ''; throw e; });
      return cacheRecap.promesse;
    },
    copieRecap: function (cie, annee) { return AMX.cacheLocal.lireGz(cleCopie('ventes_recap_', cleDe(cie, annee)), 7 * 86400000); },
    /* Une vente avec son historique (les grandes listes voyagent sans journal : `sansJournal`). */
    une: function (id) { return AMX.get({ venteId: id }, { secours: false }).then(function (r) { verifierPost(r); return r.vente; }); },
    /* L'évaluation d'un NIV (Outils › Évaluation) — pour l'échange d'une vente. */
    evaluation: function (vin) {
      vin = String(vin || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      if (vin.length !== 17) return Promise.resolve({ trouve: false, vin: vin });
      return AMX.get('evalVin=' + encodeURIComponent(vin), { essais: 1 }).then(function (d) {
        if (!d || !d.trouve) return { trouve: false, vin: vin };
        var e = d.donnees || {}, acv = nombre(e.prixAchat) !== null ? nombre(e.prixAchat) : nombre(e.prixPaye);
        return { trouve: true, vin: vin, le: d.dateMaj || e._enregistreLe || e._le || '', par: String(e._enregistrePar || e._par || ''), km: nombre(e.km), annee: String(e.annee || ''), marque: String(e.marque || ''), modele: String(e.modele || ''), version: String(e.version || ''),
          prixAchat: nombre(e.prixAchat), prixPaye: nombre(e.prixPaye), acv: acv, recon: nombre(e.recon), prixVente: nombre(e.prixVente), concession: String(e.concession || ''), statut: String(e._statut || ''), url: AMX.lien('outils', 'evaluation', { vin: vin }) };
      });
    },
    /* Import des lignes déjà inscrites dans le livre d'une concession (admin) : à relancer tant que `reste` > 0. */
    importer: function (cie, opts) {
      opts = opts || {};
      var corps = { action: 'venteImporter', compagnie: cie }; if (opts.max) corps.max = opts.max; if (opts.depuis) corps.depuis = opts.depuis;
      return AMX.post(corps, { delai: 180000 }).then(function (r) {
        if (!r) throw new Error('Aucune réponse');
        if (r.refuse) throw new Error(r.erreur || 'Réservé aux administrateurs.');
        if (r.vehicules && r.creees === undefined) throw new Error(SCRIPT_PAS_A_JOUR);
        if (r.ok === false) throw new Error(r.erreur || r.message || 'Import impossible');
        return r;
      });
    },
    enCache: function () { return cache.rep; },
    recapEnCache: function () { return cacheRecap.rep; },
    invalider: function () { cache.quand = 0; cacheRecap.quand = 0; },
    produits: function () { var d = cache.rep; return d && Array.isArray(d.produits) && d.produits.length ? d.produits : PRODUITS_DEFAUT; },
    produitsDe: produitsDe,
    produitsListe: produitsListe,
    poser: function (v) {
      if (!cache.rep || !v) return;
      if (v.type === 'neuf' && AMX.neufs && AMX.neufs.charger && AMX.neufs.enCache()) setTimeout(function () { AMX.neufs.charger(true).catch(function () {}); }, 150);   /* le serveur a marqué le neuf « Vendu » (ou l'a démarqué) */
      var i = cache.rep.ventes.findIndex(function (x) { return x.id === v.id; });
      if (i >= 0) cache.rep.ventes[i] = v; else cache.rep.ventes.unshift(v);
      var n = { declaree: 0, completee: 0, comptabilisee: 0, annulee: 0, erreurLivre: 0 };
      cache.rep.ventes.forEach(function (x) { if (n[x.statut] !== undefined) n[x.statut]++; if (x.livre === 'erreur') n.erreurLivre++; });
      cache.rep.compte = n;
      cacheRecap.quand = 0;
      document.dispatchEvent(new CustomEvent('amx:ventes'));
    },
    peutDeclarer: function () { var p = AMX.session && AMX.session.perms; if (cache.rep && cache.rep.peutDeclarer !== undefined) return !!cache.rep.peutDeclarer; if (p && p.ventesDeclarer !== undefined) return !!p.ventesDeclarer; return AMX.perm('ficheAchat') || AMX.perm('changerStatut') || AMX.estAdmin(); },
    /* Côté F&I : inscrire le profit F&I et les produits (droit « Ventes — F&I », ou l'ancien « compléter »). */
    peutCompleter: function () { var p = AMX.session && AMX.session.perms; if (cache.rep && cache.rep.peutCompleter !== undefined) return !!cache.rep.peutCompleter; if (p && (p.ventesFI || p.ventesCompleter)) return true; if (p && (p.ventesFI !== undefined || p.ventesCompleter !== undefined)) return false; return AMX.perm('modifierMontants') || AMX.estAdmin(); },
    estFI: function () { var p = AMX.session && AMX.session.perms; return !!(p && p.ventesFI); },
    montants: function () { if (cache.rep && cache.rep.montants !== undefined) return !!cache.rep.montants; return AMX.ventes.peutCompleter() || AMX.perm('voirResultats') || AMX.perm('modifierMontants'); },
    compteur: function () { var d = cache.rep; if (!d) return ''; var cie = AMX.compagnieChoisie('inventaire'); var n = d.ventes.filter(function (v) { return v.statut === 'declaree' && (!cie || v.compagnie === cie); }).length; return n || ''; },
    parVin: function (vin) { var d = cache.rep; vin = String(vin || '').toUpperCase(); if (!d || !vin) return null; return d.ventes.filter(function (v) { return v.vin === vin && v.statut !== 'annulee'; })[0] || null; },
    // Ouvrir la fenêtre « Inscrire une vente » depuis n'importe quelle page (ligne d'un neuf, panneau d'un usagé) :
    // prefill = { compagnie, type, vin, stock, annee, marque, modele, version, modeleTexte, coutant, echangeVin }.
    declarer: function (prefill) { return ouvrirFormulaire(prefill || {}, null); },
    completer: function (v) { return ouvrirFormulaire({}, v); },
    annuler: function (v) { return modaleAnnuler(v); },
    ouvrir: function (v) { return ouvrirFiche(v); },
    monter: function (conteneur, ctx) { return new VueVentes(conteneur, ctx); }
  };

  function injecterCss() {
    if (document.getElementById('css-ventes')) return;
    var s = document.createElement('style');
    s.id = 'css-ventes';
    s.textContent = [
      '.ventes-page .kpis { margin-bottom: 12px; }',
      '.ventes-filtres { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }',
      '.ventes-filtres input { height: 32px; min-width: 220px; }',
      '.ventes-fi-ligne { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 12.5px; color: var(--encre-3); margin: -4px 0 12px; }',
      '.ventes-fi-ligne.alerte { color: #9A3412; }',
      '.ventes-fi-ligne .puce { font-size: 12px; }',
      '.ventes-table td.vehicule .nom { font-weight: 600; } .ventes-table td.vehicule .vin { font-family: var(--mono); font-size: 12px; color: var(--encre-3); }',
      '.ventes-table td .sous { font-size: 12px; color: var(--encre-3); }',
      '.ventes-table tr.annulee td { color: var(--encre-4); text-decoration: line-through; } .ventes-table tr.annulee td .puce, .ventes-table tr.annulee td .btn { text-decoration: none; }',
      '.ventes-table tr.groupe td { background: var(--carte-2); font-weight: 700; font-size: 12.5px; padding: 8px 10px; border-top: 2px solid var(--ligne); }',
      '.ventes-table tr.groupe td .sous { font-weight: 400; margin-left: 8px; }',
      '.ventes-table td.etat { white-space: nowrap; }',
      '.ventes-page .ecart-plus { color: var(--vert); } .ventes-page .ecart-moins { color: var(--rouge); }',
      '.ventes-page .ventes-defile { overflow-x: auto; } .ventes-table td.num, .ventes-table th.num { white-space: nowrap; } .ventes-table td.vehicule { min-width: 170px; }',
      '.ventes-page .ventes-comp { min-width: 250px; } .ventes-comp .titre { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--encre-3); margin-bottom: 4px; }',
      '.ventes-comp .cmp-ligne { display: grid; grid-template-columns: 74px 1fr auto; gap: 8px; white-space: nowrap; font-size: 13px; align-items: baseline; } .ventes-comp .cmp-ligne .v { font-weight: 700; font-variant-numeric: tabular-nums; text-align: right; } .ventes-comp .cmp-ligne .n { font-size: 12px; color: var(--encre-3); }',
      '.ventes-table th.groupe-col { text-align: center; border-bottom: 1px solid var(--ligne); } .ventes-table th.debut-groupe, .ventes-table td.debut-groupe { border-left: 2px solid var(--ligne); }',
      '.ventes-recap th.groupe-col { text-align: center; } .ventes-recap th.debut-groupe, .ventes-recap td.debut-groupe { border-left: 2px solid var(--ligne); }',
      '.ventes-page .segment button .n { margin-left: 5px; font-variant-numeric: tabular-nums; opacity: .75; }',
      '.ventes-table td.actions { white-space: nowrap; text-align: right; }',
      '.ventes-table td.actions .btn { margin-left: 4px; }',
      '.ventes-vide { padding: 28px; text-align: center; color: var(--encre-3); }',
      '.ventes-form .champ { margin-bottom: 10px; }',
      '.ventes-form .grille { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px 12px; }',
      '.ventes-form .grille .large { grid-column: 1 / -1; }',
      '.ventes-form h4 { margin: 14px 0 8px; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--encre-3); display: flex; align-items: center; gap: 8px; }',
      '.ventes-form h4::after { content: ""; flex: 1; height: 1px; background: var(--ligne); }',
      '.ventes-form h4.fi { color: #1D4ED8; } .ventes-form h4.fi::after { background: #BFDBFE; }',
      '.ventes-vehicule { display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap; }',
      '.ventes-vehicule .champ { flex: 1 1 220px; margin: 0; }',
      '.ventes-trouve { margin: 6px 0 12px; padding: 8px 12px; border-radius: var(--rayon-s); background: var(--vert-clair); border: 1px solid #B6E0C6; font-size: 12.5px; }',
      '.ventes-trouve.gris { background: var(--carte-2); border-color: var(--ligne); color: var(--encre-3); }',
      '.ventes-trouve.alerte { background: #FEF3C7; border-color: #FDE68A; color: #92400E; }',
      '.ventes-trouve .btn { margin-left: 8px; }',
      '.ventes-aide { font-size: 12px; color: var(--encre-3); margin: 0 0 10px; line-height: 1.5; }',
      '.ventes-aide.fi { background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: var(--rayon-s); padding: 8px 12px; color: #1E3A8A; }',
      '.ventes-aide.alerte { background: #FEF3C7; border: 1px solid #FDE68A; border-radius: var(--rayon-s); padding: 8px 12px; color: #92400E; }',
      '.ventes-produits { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 6px 14px; margin-bottom: 10px; }',
      '.ventes-produit { display: grid; grid-template-columns: 18px 1fr 96px; gap: 6px; align-items: center; font-size: 12.5px; padding: 3px 0; }',
      '.ventes-produit input[type=checkbox] { width: 16px; height: 16px; margin: 0; }',
      '.ventes-produit input[type=text] { height: 28px; font-size: 12px; text-align: right; }',
      '.ventes-produit.coche label { font-weight: 600; }',
      '.ventes-total-fi { font-size: 12.5px; color: var(--encre-3); display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 0 0 10px; }',
      '.ventes-fiche dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 14px; margin: 0; font-size: 12.5px; }',
      '.ventes-fiche dt { color: var(--encre-3); } .ventes-fiche dd { margin: 0; }',
      '.ventes-fiche h4 { margin: 12px 0 6px; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--encre-3); }',
      '.ventes-fiche .produits { display: flex; gap: 6px; flex-wrap: wrap; } .ventes-fiche .produits .puce { font-size: 12px; }',
      '.ventes-fiche .journal { margin-top: 10px; font-size: 12px; color: var(--encre-3); } .ventes-fiche .journal li { margin: 2px 0; }',
      '.ventes-recap .carte { margin-bottom: 14px; }',
      '.ventes-recap .carte h3 { margin: 0 0 8px; font-size: 13.5px; display: flex; align-items: center; gap: 8px; }',
      '.ventes-recap .carte h3 .sous { font-weight: 400; font-size: 12px; color: var(--encre-3); }',
      '.ventes-recap .deux { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 14px; }',
      '.ventes-recap table.tableau { width: 100%; }',
      '.ventes-recap tr.total td { font-weight: 700; border-top: 2px solid var(--ligne); }',
      '.ventes-recap td.vide, .ventes-recap tr.mois-vide td { color: var(--encre-4); }',
      '.ventes-recap tr.cliquable:hover td { background: var(--carte-2); }',
      '.ventes-recap td .sous, .ventes-recap th .sous { font-size: 12px; color: var(--encre-3); font-weight: 400; }',
      '.ventes-recap .annee { display: flex; gap: 8px; align-items: center; }',
      '@media (max-width: 760px) { .ventes-table th:nth-child(5), .ventes-table td:nth-child(5), .ventes-table th:nth-child(6), .ventes-table td:nth-child(6) { display: none; } .ventes-produits { grid-template-columns: 1fr; } }'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ------------------------------ Section ------------------------------ */
  AMX.section('ventes', {
    titre: 'Livre des ventes', icone: 'vente', ordre: 12,
    visible: function () { return AMX.perm('consulter') || AMX.perm('ficheAchat') || AMX.perm('changerStatut') || AMX.estAdmin(); },
    onglets: [{ id: 'liste', titre: 'Liste', compteur: function () { return AMX.ventes.compteur(); } }, { id: 'recap', titre: 'Récapitulatif' }],
    monter: function (conteneur, ctx) { return new VueVentes(conteneur, ctx); }
  });

  function VueVentes(conteneur, ctx) {
    var self = this;
    injecterCss();
    this.conteneur = conteneur;
    this.params = (ctx && ctx.params) || {};
    this.vue = ctx && ctx.onglet === 'recap' ? 'recap' : 'liste';
    this.compagnie = AMX.compagnieChoisie('inventaire');
    this.periode = this.params.mois ? String(this.params.mois) : String(AMX.memo.lire('ventes_periode', '') || '');
    this.annee = String(this.params.annee || AMX.memo.lire('ventes_annee', '') || new Date().getFullYear());
    this.filtres = { etat: this.params.etat || '', type: this.params.type || '', recherche: '' };
    this.construire();
    this.montrer();
    this.sur = function () { self.rendre(); AMX.rafraichirSousBarre(); };
    this.surCompagnie = function (e) { self.compagnie = (e.detail && e.detail.compagnie) || ''; self.rendreCies(); self.chargerVue(false); };
    this.surProfil = function () { self.compagnie = AMX.compagnieChoisie('inventaire'); self.rendreCies(); self.rendre(); };   /* les droits et la portée arrivent après le premier rendu */
    document.addEventListener('amx:ventes', this.sur);
    document.addEventListener('amx:compagnie', this.surCompagnie);
    document.addEventListener('amx:profil', this.surProfil);
    this.ouvrirDemandes();
  }
  /* ?id= ouvre la fiche, ?nouvelle=1 le formulaire — une seule fois par adresse (les vues Liste / Récapitulatif gardent les paramètres). */
  VueVentes.prototype.ouvrirDemandes = function () {
    var self = this, p = this.params;
    if (p.nouvelle && this.nouvelleFaite !== p.nouvelle) { this.nouvelleFaite = p.nouvelle; setTimeout(function () { AMX.ventes.declarer({ compagnie: self.compagnie }); }, 60); }
    if (p.id && this.idOuvert !== p.id) { this.idOuvert = p.id; setTimeout(function () { self.ouvrirId(p.id); }, 60); }
  };
  VueVentes.prototype.demonter = function () { document.removeEventListener('amx:ventes', this.sur); document.removeEventListener('amx:compagnie', this.surCompagnie); document.removeEventListener('amx:profil', this.surProfil); };
  VueVentes.prototype.naviguer = function (ctx) {
    this.params = (ctx && ctx.params) || {};
    var vue = ctx && ctx.onglet === 'recap' ? 'recap' : 'liste';
    if (this.params.etat !== undefined) this.filtres.etat = this.params.etat;
    if (this.params.type !== undefined) this.filtres.type = this.params.type;
    if (this.params.mois) this.periode = String(this.params.mois);
    if (this.params.annee) this.annee = String(this.params.annee);
    var change = vue !== this.vue; this.vue = vue;
    if (change || this.params.mois) this.rendreCies();
    this.montrer();
    this.ouvrirDemandes();
    this.rendre();
  };

  VueVentes.prototype.construire = function () {
    var page = h('div.page.ventes-page');
    this.elSous = h('p', 'Chargement…');
    this.elActions = h('div.actions');
    page.appendChild(h('div.entete-page', [h('div', [h('h1', 'Livre des ventes'), this.elSous]), this.elActions]));
    this.elCies = h('div.barre-cies');
    this.elFi = h('div.ventes-fi-ligne');
    this.elKpis = h('div.kpis');
    this.elFiltres = h('div.ventes-filtres');
    this.elListe = h('div');
    this.elVueListe = h('div.ventes-vue-liste', [this.elKpis, this.elFiltres, this.elListe]);
    this.elVueRecap = h('div.ventes-recap');
    page.appendChild(this.elCies); page.appendChild(this.elFi); page.appendChild(this.elVueListe); page.appendChild(this.elVueRecap);
    this.conteneur.appendChild(page);
    this.rendreEntete();
    this.rendreCies();
  };
  /* Liste ou récapitulatif : les deux vivent dans la page, une seule se voit. */
  VueVentes.prototype.montrer = function () {
    var recap = this.vue === 'recap';
    this.elVueListe.style.display = recap ? 'none' : '';
    this.elVueRecap.style.display = recap ? '' : 'none';
    this.chargerVue(false);
  };
  VueVentes.prototype.chargerVue = function (force) { if (this.vue === 'recap') this.chargerRecap(force); else this.charger(force); };
  VueVentes.prototype.rendreEntete = function () {
    var self = this, d = cache.rep;
    AMX.vider(this.elActions);
    if (AMX.ui2 && AMX.ui2()) { this.rendreEnteteUi2(); return; }
    if (AMX.ventes.peutDeclarer()) this.elActions.appendChild(h('button.btn.primaire#ventes-nouvelle', { type: 'button', onclick: function () { AMX.ventes.declarer({ compagnie: self.compagnie }); } }, [AMX.svg('plus'), ' Inscrire une vente']));
    var livre = d && d.livres && self.compagnie ? d.livres[self.compagnie] : null;
    if (livre && livre.url) this.elActions.appendChild(h('a.btn#ventes-livre', { href: livre.url, target: '_blank', rel: 'noopener', title: livre.titre }, [AMX.svg('externe'), ' Ouvrir le livre']));
    if (livre && livre.aCreer && d.admin) this.elActions.appendChild(h('button.btn#ventes-creer-livre', { type: 'button', onclick: function () { self.creerLivre(); } }, [AMX.svg('plus'), ' Créer le livre de ' + (AMX.COMPAGNIES_TOUTES[self.compagnie] || self.compagnie)]));
    if (self.compagnie && d && d.admin && livre && livre.url) this.elActions.appendChild(h('button.btn#ventes-importer', { type: 'button', title: 'Importer dans ScanAutomax les ventes déjà inscrites dans le livre (depuis le 1er janvier) — les lignes importées reçoivent leur identifiant dans la colonne ScanAutomax du livre', onclick: function () { self.importer(); } }, [AMX.svg('telecharger'), ' Importer le livre']));
    if (self.compagnie) this.elActions.appendChild(h('button.btn#ventes-relire', { type: 'button', title: 'Relire tout de suite ce que la comptabilité a inscrit dans le livre (Comptabilisé, profit réel) et importer les nouvelles lignes', onclick: function () { self.relire(); } }, [AMX.svg('rafraichir'), ' Relire le livre']));
    this.elActions.appendChild(h('button.btn', { type: 'button', title: 'Rafraîchir', onclick: function () { self.chargerVue(true); } }, [AMX.svg('rafraichir')]));
  };
  /* v133 (nouvelle interface) : une action principale (« Inscrire une vente »), « Ouvrir le livre », le reste dans « … ». */
  VueVentes.prototype.rendreEnteteUi2 = function () {
    var self = this, d = cache.rep;
    var livre = d && d.livres && self.compagnie ? d.livres[self.compagnie] : null;
    var nomCie = AMX.COMPAGNIES_TOUTES[self.compagnie] || self.compagnie;
    this.elActions.appendChild(AMX.menuActions([
      { texte: 'Rafraîchir', icone: AMX.svg('rafraichir').outerHTML, action: function () { self.chargerVue(true); } },
      self.compagnie ? { texte: 'Relire le livre (comptabilité)', icone: AMX.svg('rafraichir').outerHTML, action: function () { self.relire(); } } : null,
      (typeof XLSX !== 'undefined' && self.vue !== 'recap') ? { texte: 'Exporter Excel', icone: AMX.svg('telecharger').outerHTML, action: function () { self.exporter(); } } : null,
      (self.compagnie && d && d.admin && livre && livre.url) ? { texte: 'Importer le livre (depuis le 1er janvier)', icone: AMX.svg('telecharger').outerHTML, action: function () { self.importer(); } } : null,
      (livre && livre.aCreer && d.admin) ? { texte: 'Créer le livre de ' + nomCie, icone: AMX.svg('plus').outerHTML, action: function () { self.creerLivre(); } } : null
    ]));
    if (livre && livre.url) this.elActions.appendChild(h('a.btn#ventes-livre', { href: livre.url, target: '_blank', rel: 'noopener', title: livre.titre }, [AMX.svg('externe'), ' Ouvrir le livre']));
    if (AMX.ventes.peutDeclarer()) this.elActions.appendChild(h('button.btn.primaire#ventes-nouvelle', { type: 'button', onclick: function () { AMX.ventes.declarer({ compagnie: self.compagnie }); } }, [AMX.svg('plus'), ' Inscrire une vente']));
  };
  VueVentes.prototype.rendreCies = function () {
    var self = this, d = cache.rep, extra;
    if (this.vue === 'recap') {
      var annees = {}; annees[String(new Date().getFullYear())] = 1; annees[this.annee] = 1;
      if (cacheRecap.rep && cacheRecap.rep.annees) cacheRecap.rep.annees.forEach(function (a) { if (/^\d{4}$/.test(a)) annees[a] = 1; });
      var sel = h('select.saisie#ventes-annee', Object.keys(annees).sort().reverse().map(function (a) { return h('option', { value: a, text: a, selected: a === self.annee ? 'selected' : undefined }); }));
      sel.addEventListener('change', function () { self.annee = sel.value; AMX.memo.ecrire('ventes_annee', sel.value); self.chargerRecap(false); });
      extra = [h('div.annee', [h('span.doux.petit', 'Année'), sel])];
    } else {
      var fixe = /^\d{4}(-\d{2})?$/.test(this.periode) ? this.periode : '';
      var boutons = PERIODES.map(function (p) { return h('button' + (self.periode === p[0] ? '.actif' : ''), { type: 'button', 'data-periode': p[0], text: p[1], onclick: function () { self.periode = p[0]; AMX.memo.ecrire('ventes_periode', p[0]); self.rendreCies(); self.charger(false); } }); });
      if (fixe) boutons.push(h('button.actif', { type: 'button', 'data-periode': fixe, text: capitale(fixe.length === 4 ? fixe : moisLibelle(fixe)) + ' ×', title: 'Retirer ce filtre', onclick: function () { self.periode = String(AMX.memo.lire('ventes_periode', '') || ''); self.rendreCies(); self.charger(false); } }));
      extra = [h('div.segment.petit', boutons)];
    }
    AMX.barreConcessions(this.elCies, { domaine: 'inventaire', valeur: this.compagnie, extra: extra,
      compte: function (code) { if (!d || !cache.cle || cache.cle.split('|')[0] !== '') return null; var n = d.ventes.filter(function (v) { return v.statut === 'declaree' && (!code || v.compagnie === code); }).length; return n || null; },
      onchange: function (code) { self.compagnie = code; self.chargerVue(false); } });
  };
  VueVentes.prototype.charger = function (force) {
    var self = this, cie = this.compagnie, mois = moisDe(this.periode);
    if (!cache.rep || cache.cle !== cleDe(cie, mois)) {
      if (!cache.rep) { AMX.vider(this.elListe); this.elListe.appendChild(AMX.chargeur('Livre des ventes')); }
      AMX.ventes.copie(cie, mois).then(function (o) { if (o && o.donnees && (!cache.rep || cache.cle !== cleDe(cie, mois))) { try { verifier(o.donnees); cache.rep = o.donnees; cache.cle = cleDe(cie, mois); cache.quand = 0; cache.copieLe = o.quand; self.rendre(); } catch (e) {} } }).catch(function () {});
    }
    AMX.ventes.charger(cie, mois, force).then(function () { self.rendre(); if (force === true) AMX.toast('Livre des ventes mis à jour', 'ok'); }, function (e) {
      var msg = AMX.erreurTexte(e);
      self.elSous.textContent = /route|absent|inconnue|pas à jour/i.test(msg) ? 'Route absente — redéployez le script (Vente.gs).' : msg;
      if (!cache.rep) { AMX.vider(self.elListe); self.elListe.appendChild(h('div.carte', [h('div.ventes-vide', { text: msg })])); }
      else AMX.toast('Livre des ventes : mise à jour impossible (' + msg + ') — copie affichée', 'erreur');
    });
  };
  VueVentes.prototype.relire = function () {
    var self = this;
    AMX.post({ action: 'venteRelire', compagnie: this.compagnie }, { delai: 120000 }).then(function (r) {
      if (!r || !r.ok) { AMX.toast((r && r.erreur) || 'Relecture impossible', 'erreur'); return; }
      AMX.toast(r.message || 'Livre relu', 'ok', 7000); AMX.ventes.invalider(); self.chargerVue(true);
    }, function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); });
  };
  /* Import du livre (admin) : le serveur lit au plus `max` lignes par passage ; on relance tant qu'il en reste. */
  VueVentes.prototype.importer = function () {
    var self = this, cie = this.compagnie, nom = AMX.COMPAGNIES_TOUTES[cie] || cie;
    AMX.confirmer('Importer le livre de ' + nom, 'ScanAutomax lit les onglets Neuf, Occasion et Wholesale du livre et crée ici une vente pour chaque ligne inscrite depuis le 1er janvier qui n\'y est pas encore (statut, comptabilisé, profits réels compris). La colonne « ScanAutomax » du livre reçoit l\'identifiant de chaque ligne importée ; rien d\'autre n\'est modifié dans le livre. Relancer l\'import ne crée pas de doublon.', { ok: 'Importer' }).then(function (ok) {
      if (!ok) return;
      var total = { creees: 0, liees: 0, ignorees: 0, passages: 0, erreurs: [] }, btn = document.getElementById('ventes-importer');
      if (btn) { btn.disabled = true; btn.textContent = 'Import en cours…'; }
      var passe = function () {
        total.passages++;
        return AMX.ventes.importer(cie, { max: 300 }).then(function (r) {
          total.creees += r.creees || 0; total.liees += r.liees || 0; total.ignorees += r.ignorees || 0;
          (r.erreurs || []).forEach(function (e) { if (total.erreurs.indexOf(e) < 0) total.erreurs.push(e); });
          if (btn) btn.textContent = 'Import en cours… (' + total.creees + ' importée' + (total.creees > 1 ? 's' : '') + ')';
          if (r.reste && total.passages < 12) return passe();
          return r;
        });
      };
      passe().then(function (r) {
        AMX.toast(total.creees + ' vente' + (total.creees > 1 ? 's' : '') + ' importée' + (total.creees > 1 ? 's' : '') + ' du livre de ' + nom + (total.liees ? ', ' + total.liees + ' liée' + (total.liees > 1 ? 's' : '') : '') + (r && r.reste ? ' — ' + r.reste + ' ligne(s) restent : relancez' : '') + '.', 'ok', 9000);
        if (total.erreurs.length) AMX.toast('Import — ' + total.erreurs.slice(0, 2).join(' · ') + (total.erreurs.length > 2 ? ' · (+' + (total.erreurs.length - 2) + ')' : ''), 'erreur', 14000);
        AMX.ventes.invalider(); self.chargerVue(true);
      }, function (e) { AMX.toast('Import : ' + AMX.erreurTexte(e), 'erreur', 9000); self.rendreEntete(); }).then(function () { self.rendreEntete(); });
    });
  };
  VueVentes.prototype.creerLivre = function () {
    var self = this, nom = AMX.COMPAGNIES_TOUTES[self.compagnie] || self.compagnie;
    AMX.confirmer('Créer le livre de ' + nom, 'ScanAutomax crée un classeur Google « Livre des ventes ' + nom + ' 2026 » (onglets Neuf, Occasion, Wholesale, section Comptabilité) et le partage en édition avec vous et la comptabilité de la concession. Les ventes inscrites ici y seront écrites.', { ok: 'Créer le livre' }).then(function (ok) {
      if (!ok) return;
      AMX.post({ action: 'venteLivreCreer', compagnie: self.compagnie }, { delai: 90000 }).then(function (r) {
        if (!r || !r.ok) { AMX.toast((r && r.erreur) || 'Création refusée', 'erreur'); return; }
        AMX.toast(r.message || 'Livre créé', 'ok', 8000); self.charger(true);
      }, function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); });
    });
  };
  /* Qui reçoit les courriels « vente inscrite » (droit « Ventes — F&I »), affiché sous la rangée des concessions. */
  VueVentes.prototype.rendreFi = function () {
    var d = cache.rep, fi = d && d.fi, el = this.elFi;
    AMX.vider(el); el.className = 'ventes-fi-ligne';
    if (!this.compagnie || !d) { el.style.display = 'none'; return; }
    el.style.display = '';
    if (fi && fi.courriels && fi.courriels.length) {
      el.appendChild(h('span', { text: 'Vente inscrite → courriel au F&I : ' }));
      (fi.noms && fi.noms.length ? fi.noms : fi.courriels).forEach(function (n) { el.appendChild(h('span.puce.info', { text: n })); });
      el.appendChild(h('span', { text: '· rappel après 24 h' + (fi.source && fi.source !== 'droit ventesFI' ? ' · (' + fi.source + ' — donnez le droit « Ventes — F&I » dans Admin pour viser le directeur commercial)' : '') }));
    } else {
      el.className += ' alerte';
      el.appendChild(h('span', { text: 'Aucun destinataire F&I pour cette concession : les ventes inscrites ne préviennent personne. Admin › Utilisateurs › donnez le droit « Ventes — F&I » au directeur commercial.' }));
    }
  };

  VueVentes.prototype.rendre = function () {
    var self = this, d = cache.rep;
    this.rendreEntete();
    this.rendreFi();
    if (this.vue === 'recap') { this.rendreRecap(); return; }
    if (!d) return;
    var n = d.compte || {}, total = d.ventes.length;
    var copie = cache.copieLe ? 'Copie du ' + AMX.copieTexte(cache.copieLe) + ' — mise à jour en cours… · ' : '';
    var importees = d.ventes.filter(function (v) { return v.importee; }).length;
    this.elSous.textContent = copie + (total ? pluriel(total, 'vente') + (n.declaree ? ' · ' + n.declaree + ' en attente du F&I' : '') + (n.comptabilisee ? ' · ' + n.comptabilisee + ' comptabilisée' + (n.comptabilisee > 1 ? 's' : '') : '') + (importees ? ' · ' + importees + ' importée' + (importees > 1 ? 's' : '') + ' du livre' : '') + (n.erreurLivre ? ' · ' + n.erreurLivre + ' pas au livre' : '') : 'Aucune vente inscrite pour cette période.') + (d.relu && d.relu.le && !d.relu.duCache ? ' · livre relu à ' + AMX.fmtDate(d.relu.le, true).replace(/^\S+\s/, '') : '');
    AMX.vider(this.elKpis);
    var ui2 = AMX.ui2 && AMX.ui2();
    var kpi = function (etat, libelle, valeur, cls) {
      return h('div.kpi' + (cls ? '.' + cls : '') + (self.filtres.etat === etat ? '.actif' : ''), { role: 'button', tabindex: '0', 'data-etat': etat, onclick: function () { self.filtres.etat = self.filtres.etat === etat ? '' : etat; self.rendre(); } }, [h('div.valeur', { text: String(valeur || 0) }), h('div.libelle', { text: libelle })]);
    };
    /* v133 : en ui2, les états passent en pastilles dans la barre de filtres ; les chiffres gardent l'essentiel. */
    if (!ui2) {
      this.elKpis.appendChild(kpi('declaree', 'Attente F&I', n.declaree, n.declaree ? 'alerte' : ''));
      this.elKpis.appendChild(kpi('completee', 'Au livre', n.completee, ''));
      this.elKpis.appendChild(kpi('comptabilisee', 'Comptabilisées', n.comptabilisee, ''));
      this.elKpis.appendChild(kpi('annulee', 'Annulées', n.annulee, ''));
    }
    if (n.erreurLivre) this.elKpis.appendChild(kpi('erreur', 'Pas au livre', n.erreurLivre, 'alerte'));
    if (d.montants) {
      var actives = d.ventes.filter(function (v) { return v.statut !== 'annulee' && (!self.filtres.type || v.type === self.filtres.type); });
      var cp = cumulProfits(actives);
      this.elKpis.appendChild(carteComparaison('ventes-kpi-front', 'Front (voiture)', cp.front));
      this.elKpis.appendChild(carteComparaison('ventes-kpi-fi', 'F&I', cp.fi));
    }
    var nSansFI = d.ventes.filter(function (v) { return besoinFI(v) && (!self.filtres.type || v.type === self.filtres.type); }).length;
    this.elKpis.appendChild(kpi('sansFI', 'F&I à inscrire', nSansFI, nSansFI ? 'alerte' : ''));
    AMX.vider(this.elFiltres);
    /* 22 oct. : les compteurs Neufs / Usagés / Wholesale suivent la période et la concession (annulées exclues, comme le récapitulatif). */
    var nonAnnulees = d.ventes.filter(function (v) { return v.statut !== 'annulee'; }), ct = compteTypes(nonAnnulees);
    var segType = h('div.segment#ventes-types', [['', 'Tous', nonAnnulees.length], ['neuf', 'Neufs', ct.neuf], ['usage', 'Usagés', ct.usage], ['wholesale', 'Wholesale', ct.wholesale]].map(function (t) { return h('button' + (self.filtres.type === t[0] ? '.actif' : ''), { type: 'button', 'data-type': t[0], onclick: function () { self.filtres.type = t[0]; self.rendre(); } }, [t[1], h('span.n', { text: String(t[2]) })]); }));
    var rech = h('input.saisie#ventes-recherche', { type: 'search', placeholder: 'Client, NIV, # stock, conseiller…', value: this.filtres.recherche });
    rech.addEventListener('input', function () { self.filtres.recherche = rech.value; self.rendreListe(); });
    if (ui2) {
      // Barre de filtres : recherche, puis l'état de la vente en pastilles (avec leur nombre), puis le type.
      this.elFiltres.classList.add('inv2-filtres');
      var etats = [['', 'Toutes', total], ['declaree', 'Attente F&I', n.declaree], ['completee', 'Au livre', n.completee], ['comptabilisee', 'Comptabilisées', n.comptabilisee], ['annulee', 'Annulées', n.annulee]];
      var pas = h('div.inv2-statuts', { role: 'group', 'aria-label': 'État de la vente' }, etats.map(function (e) {
        var actif = (self.filtres.etat || '') === e[0];
        return h('button.inv2-pastille' + (actif ? '.actif' : ''), { type: 'button', 'aria-pressed': actif ? 'true' : 'false', onclick: function () { self.filtres.etat = e[0]; self.rendre(); } }, [h('span', { text: e[1] }), h('b', { text: String(e[2] || 0) })]);
      }));
      this.elFiltres.appendChild(h('div.recherche.inv2-recherche', [h('span', { html: AMX.icones.recherche }), rech]));
      this.elFiltres.appendChild(pas);
      this.elFiltres.appendChild(segType);
      this.rendreListe();
      return;
    }
    this.elFiltres.appendChild(segType); this.elFiltres.appendChild(rech);
    if (typeof XLSX !== 'undefined') this.elFiltres.appendChild(h('button.btn.petit#ventes-export', { type: 'button', onclick: function () { self.exporter(); } }, [AMX.svg('telecharger'), ' Excel']));
    this.rendreListe();
  };
  VueVentes.prototype.visibles = function () {
    var d = cache.rep; if (!d) return [];
    var f = this.filtres, q = (f.recherche || '').trim().toLowerCase();
    return d.ventes.filter(function (v) {
      if (f.etat === 'sansFI') { if (!besoinFI(v)) return false; }
      else if (f.etat === 'erreur') { if (v.livre !== 'erreur') return false; }
      else if (f.etat && v.statut !== f.etat) return false;
      if (f.type && v.type !== f.type) return false;
      if (q && [v.client, v.venduA, v.vin, v.stock, v.conseiller, v.directeur, vehiculeTexte(v), v.id, v.echangeModele, v.echangeVin].join(' ').toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  };
  /* Les ventes par mois afférent (la date inscrite), dans l'ordre de la liste (la plus récente d'abord). */
  function grouperParMois(liste) {
    var groupes = [], par = {};
    liste.forEach(function (v) {
      var m = moisDeVente(v);
      if (!par[m]) { par[m] = { mois: m, libelle: v.moisLibelle || moisLibelle(m) || 'Sans date', ventes: [] }; groupes.push(par[m]); }
      par[m].ventes.push(v);
    });
    return groupes;
  }
  function puceEtat(v) {
    if (v.statut === 'annulee') return h('span.puce', { text: 'Annulée', title: v.annuleRaison || '' });
    if (v.statut === 'comptabilisee') return h('span.puce.ok', { text: 'Comptabilisée' + (v.comptabiliseLe ? ' · ' + AMX.fmtDateCourte(v.comptabiliseLe) : '') });
    if (v.statut === 'declaree') return h('span.puce.alerte', { text: 'Attente F&I', title: 'Le directeur commercial doit inscrire son profit F&I et les produits' + (v.fiAviseLe ? ' — prévenu le ' + AMX.fmtDate(v.fiAviseLe, true) + (v.fiRappelLe ? ', rappel le ' + AMX.fmtDate(v.fiRappelLe, true) : '') : '') });
    if (v.livre !== 'ecrit') return h('span.puce.info', { text: 'Complétée', title: 'Complétée, mais pas encore écrite dans le livre (voir la colonne Livre)' });
    return h('span.puce.info', { text: 'Au livre', title: 'Écrite dans le livre, en attente de la comptabilité' });
  }
  function puceLivre(v) {
    if (v.livre === 'erreur') return h('span.puce.alerte', { text: 'Pas au livre', title: v.livreErreur || '' });
    if (v.livre === 'ecrit' && v.livreLigne) return h('a.puce.mono', { href: v.livreUrl || '#', target: '_blank', rel: 'noopener', text: 'ligne ' + v.livreLigne, title: (v.livreOnglet || '') + ' — ouvrir le livre', onclick: function (e) { e.stopPropagation(); } });
    return h('span.puce', { text: '—' });
  }
  VueVentes.prototype.rendreListe = function () {
    var self = this, d = cache.rep; if (!d) return;
    var liste = this.visibles(), montants = !!d.montants;
    AMX.vider(this.elListe);
    if (!liste.length) {
      this.elListe.appendChild(h('div.carte', [h('div.ventes-vide', [h('div', { text: (this.filtres.etat || this.filtres.type || this.filtres.recherche) ? 'Aucune vente pour ce filtre.' : 'Aucune vente inscrite pour cette période.' }),
        AMX.ventes.peutDeclarer() ? h('button.btn.primaire', { type: 'button', style: { marginTop: '10px' }, onclick: function () { AMX.ventes.declarer({ compagnie: self.compagnie }); } }, [AMX.svg('plus'), ' Inscrire une vente']) : null])]));
      return;
    }
    var colonnes = 9 + (montants ? 7 : 0), rs = montants ? { rowspan: '2' } : {};
    var thR = function (t, extra) { return h('th', Object.assign({ text: t }, rs, extra || {})); };
    var entete = h('tr', [thR('Livraison', { title: 'Les ventes sont rangées dans le mois de leur livraison (date de vente quand il n\'y a pas de date de livraison)' }), thR('Véhicule'), thR('Client'), thR('Type'), thR('Conseiller'), thR('Dir. F&I')]
      .concat(montants ? [h('th.num', Object.assign({ text: 'Prix' }, rs)), h('th.groupe-col.debut-groupe', { colspan: '3', text: 'Front (voiture)' }), h('th.groupe-col.debut-groupe', { colspan: '3', text: 'F&I' })] : [])
      .concat([thR('Livre'), thR('État'), thR('')]));
    var entete2 = montants ? h('tr', ['Estimé', 'Comptable', 'Écart', 'Estimé', 'Comptable', 'Écart'].map(function (t, i) { return h('th.num' + (i % 3 === 0 ? '.debut-groupe' : ''), { text: t, title: i % 3 === 2 ? 'Comptable − estimé' : (i % 3 === 0 ? 'Prévu' : 'Réel inscrit par la comptabilité') }); })) : null;
    var corps = h('tbody');
    grouperParMois(liste).forEach(function (g) {
      var actives = g.ventes.filter(function (v) { return v.statut !== 'annulee'; }), attente = actives.filter(function (v) { return v.statut === 'declaree'; }).length;
      var cg = compteTypes(actives);
      var resume = pluriel(actives.length, 'vente') + ' (' + [cg.neuf ? pluriel(cg.neuf, 'neuf') : '', cg.usage ? cg.usage + ' usagé' + (cg.usage > 1 ? 's' : '') : '', cg.wholesale ? cg.wholesale + ' wholesale' : ''].filter(Boolean).join(' · ') + ')' + (attente ? ' · ' + attente + ' en attente du F&I' : '');
      var sansFIm = actives.filter(besoinFI).length;
      if (sansFIm) resume += ' · ' + sansFIm + ' F&I à inscrire';
      if (montants) { var cpm = cumulProfits(actives), q = function (nom, x) { return nom + ' : est. ' + (x.nEstime ? argent(x.estime) : '—') + ' · compta ' + (x.nComptable ? argent(x.comptable) : '—') + (x.nPaires ? ' · écart ' + signe(x.ecart) : ''); }; resume += ' · ' + q('front', cpm.front) + ' · ' + q('F&I', cpm.fi); }
      corps.appendChild(h('tr.groupe', { dataset: { mois: g.mois } }, [h('td', { colspan: String(colonnes) }, [h('span', { text: capitale(g.libelle) }), h('span.sous', { text: resume })])]));
      g.ventes.forEach(function (v) {
        var prd = produitsListe(v);
        var tr = h('tr.cliquable' + (v.statut === 'annulee' ? '.annulee' : ''), { dataset: { id: v.id } }, [
          h('td', dateLivraisonOk(v) ? [h('div', { text: AMX.fmtDateCourte(v.dateLivraison) }), v.dateVente ? h('div.sous', { text: 'vendue ' + AMX.fmtDateCourte(v.dateVente) }) : null] : [h('div', { text: AMX.fmtDateCourte(v.dateVente) }), h('div.sous', { text: 'date de vente', title: 'Pas de date de livraison inscrite : la vente compte dans le mois de sa date de vente' })]),
          h('td.vehicule', [h('div.nom', { text: vehiculeTexte(v) || '(véhicule à préciser)' }), h('div.vin', { text: [v.stock ? '# ' + v.stock : '', v.vin].filter(Boolean).join(' · ') })]),
          h('td', [h('div', { text: v.client || v.venduA || '—' }), v.type === 'wholesale' && v.acheteDe ? h('div.sous', { text: 'acheté de ' + v.acheteDe }) : (v.echangeStock || v.echangeModele || v.echangeVin ? h('div.sous', { text: 'échange ' + ([v.echangeStock, v.echangeModele].filter(Boolean).join(' ') || v.echangeVin) + (v.echangeEvaluation !== undefined && v.echangeEvaluation !== null ? ' · évalué' : '') }) : null)]),
          h('td', [h('span.badge.' + (v.type === 'neuf' ? 'vert' : (v.type === 'usage' ? 'bleu' : 'ambre')) + '.sans-point', { text: TYPES[v.type] || v.type }), h('div.sous', { text: libCategorie(v.type, v.categorie) + (v.paiement ? ' · ' + libPaiement(v.paiement) : '') })]),
          h('td', { text: v.conseiller || '—' }),
          h('td', [h('div', { text: v.directeur || '—' }), prd.length ? h('div.sous', { text: pluriel(prd.length, 'produit'), title: prd.map(function (p) { return p.libelle + (p.montant !== null ? ' ' + argent(p.montant) : ''); }).join(', ') }) : null])
        ].concat(montants ? [
          h('td.num', { text: argent(v.prixVente) }),
          h('td.num.debut-groupe.front-estime', { text: argent(frontE(v)) }),
          h('td.num.front-comptable', frontC(v) !== null ? { text: argent(frontC(v)) } : [h('span', '—'), v.statut !== 'annulee' ? h('div.sous', 'pas inscrit') : null]),
          h('td.num.front-ecart' + classeEcart(ecartEC(frontE(v), frontC(v))), { text: ecartEC(frontE(v), frontC(v)) === null ? '—' : signe(ecartEC(frontE(v), frontC(v))) }),
          /* Le bouton « Inscrire » se trouve là où le F&I estimé manque (Maxime, 22 oct.). */
          h('td.num.debut-groupe.fi-estime', besoinFI(v) ? [AMX.ventes.peutCompleter() ? h('button.btn.petit.primaire.ventes-completer', { type: 'button', text: 'Inscrire', title: 'Inscrire le profit F&I estimé et les produits', onclick: function (e) { e.stopPropagation(); AMX.ventes.completer(v); } }) : h('span.puce.alerte', { text: 'à inscrire', title: 'Profit F&I estimé pas encore inscrit' })] : { text: v.type === 'wholesale' && fiE(v) === null ? '·' : argent(fiE(v)) }),
          h('td.num.fi-comptable', { text: v.type === 'wholesale' && fiC(v) === null ? '·' : argent(fiC(v)) }),
          h('td.num.fi-ecart' + classeEcart(ecartEC(fiE(v), fiC(v))), { text: ecartEC(fiE(v), fiC(v)) === null ? '—' : signe(ecartEC(fiE(v), fiC(v))) })
        ] : []).concat([
          h('td', [puceLivre(v)]),
          h('td.etat', [puceEtat(v), v.importee ? h('div.sous', { text: 'importée du livre', title: 'Ligne lue dans le livre de la comptabilité' }) : null]),
          h('td.actions', [
            v.statut === 'declaree' && !(montants && besoinFI(v)) && AMX.ventes.peutCompleter() ? h('button.btn.petit.primaire.ventes-completer', { type: 'button', text: 'Profits F&I', title: 'Inscrire le profit F&I et les produits', onclick: function (e) { e.stopPropagation(); AMX.ventes.completer(v); } }) : null,
            !montants && besoinFI(v) && v.statut !== 'declaree' && AMX.ventes.peutCompleter() ? h('button.btn.petit.primaire.ventes-completer', { type: 'button', text: 'Profits F&I', title: 'Inscrire le profit F&I estimé et les produits', onclick: function (e) { e.stopPropagation(); AMX.ventes.completer(v); } }) : null,
            v.livre === 'erreur' && (AMX.ventes.peutDeclarer() || AMX.ventes.peutCompleter()) ? h('button.btn.petit.ventes-renvoyer', { type: 'button', text: 'Renvoyer au livre', onclick: function (e) { e.stopPropagation(); renvoyer(v); } }) : null
          ])
        ]));
        tr.addEventListener('click', function () { ouvrirFiche(v); });
        corps.appendChild(tr);
      });
    });
    this.elListe.appendChild(h('div.ventes-defile', [h('table.tableau.ventes-table', [h('thead', [entete, entete2]), corps])]));   /* 22 oct. : 6 colonnes de profit → défilement horizontal au besoin */
  };
  VueVentes.prototype.ouvrirId = function (id) {
    var d = cache.rep; var v = d ? d.ventes.filter(function (x) { return x.id === id; })[0] : null;
    if (v) { ouvrirFiche(v); return; }
    AMX.ventes.une(id).then(function (x) { ouvrirFiche(x); }, function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); });
  };
  VueVentes.prototype.exporter = function () {
    var d = cache.rep, liste = this.visibles(), montants = !!(d && d.montants), defs = AMX.ventes.produits();
    var lignes = liste.map(function (v) {
      var o = { Id: v.id, Concession: v.compagnie, Mois: capitale(v.moisLibelle || moisLibelle(moisDeVente(v))), Type: TYPES[v.type] || v.type, 'Catégorie': libCategorie(v.type, v.categorie), 'État': ETATS[v.statut] || v.statut, 'Date vente': v.dateVente, 'Date livraison': v.dateLivraison, Client: v.client || v.venduA, 'Acheté de': v.acheteDe, 'Véhicule': vehiculeTexte(v), '# Stock': v.stock, NIV: v.vin, Conseiller: v.conseiller, 'Dir. commercial (F&I)': v.directeur, Pneus: v.pneus, Paiement: libPaiement(v.paiement), 'Échange': [v.echangeStock, v.echangeModele].filter(Boolean).join(' '), 'NIV échange': v.echangeVin, 'Km échange': v.echangeKm, Livre: v.livreOnglet, 'Ligne du livre': v.livreLigne || '', Source: v.importee ? 'livre' : 'ScanAutomax', Note: v.note };
      o['Mois (livraison)'] = moisDeVente(v); o['Mois selon'] = dateLivraisonOk(v) ? 'livraison' : 'vente';
      o['F&I à inscrire'] = besoinFI(v) ? 'oui' : '';
      if (montants) { o['Front estimé'] = frontE(v); o['Front comptable'] = frontC(v); o['Écart front'] = ecartEC(frontE(v), frontC(v)); o['F&I estimé'] = fiE(v); o['F&I comptable'] = fiC(v); o['Écart F&I'] = ecartEC(fiE(v), fiC(v)); o['Profit estimé (total)'] = estimeDe(v); o['Profit comptable (total)'] = comptableDe(v); o['Écart (total)'] = ecartDe(v); o['Prix de vente'] = v.prixVente; o['Profit front prévu'] = v.profitPrevu; o['Profit F&I prévu'] = v.profitFIPrevu; o.Accessoires = v.accessoires; o['Valeur échange accordée'] = v.echangeValeur; o['Évaluation échange'] = v.echangeEvaluation; o['Over / under'] = v.overUnder; o['Profit front réel'] = v.profitReel; o['Profit F&I réel'] = v.profitFIReel; var prd = produitsDe(v); defs.forEach(function (p) { o[p[1]] = prd[p[0]] === undefined ? '' : prd[p[0]]; }); }
      return o;
    });
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lignes), 'Livre des ventes');
    XLSX.writeFile(wb, 'livre-des-ventes-' + (this.compagnie || 'groupe') + '-' + isoLocal(new Date()) + '.xlsx');
  };

  /* ------------------------------ Récapitulatif ------------------------------ */
  VueVentes.prototype.chargerRecap = function (force) {
    var self = this, cie = this.compagnie, annee = this.annee;
    if (!cacheRecap.rep || cacheRecap.cle !== cleDe(cie, annee)) {
      if (!cacheRecap.rep) { AMX.vider(this.elVueRecap); this.elVueRecap.appendChild(AMX.chargeur('Récapitulatif des ventes')); }
      AMX.ventes.copieRecap(cie, annee).then(function (o) { if (o && o.donnees && (!cacheRecap.rep || cacheRecap.cle !== cleDe(cie, annee))) { try { verifierRecap(o.donnees); cacheRecap.rep = o.donnees; cacheRecap.cle = cleDe(cie, annee); cacheRecap.quand = 0; cacheRecap.copieLe = o.quand; self.rendreRecap(); } catch (e) {} } }).catch(function () {});
    }
    AMX.ventes.recap(cie, annee, force).then(function () { self.rendreCies(); self.rendreRecap(); if (force === true) AMX.toast('Récapitulatif mis à jour', 'ok'); }, function (e) {
      var msg = AMX.erreurTexte(e);
      self.elSous.textContent = /route|absent|inconnue|pas à jour/i.test(msg) ? 'Route absente — redéployez le script (Vente.gs).' : msg;
      if (!cacheRecap.rep) { AMX.vider(self.elVueRecap); self.elVueRecap.appendChild(h('div.carte', [h('div.ventes-vide', { text: msg })])); }
      else AMX.toast('Récapitulatif : mise à jour impossible (' + msg + ') — copie affichée', 'erreur');
    });
  };
  VueVentes.prototype.rendreRecap = function () {
    var self = this, r = cacheRecap.rep, el = this.elVueRecap;
    if (this.vue !== 'recap' || !r) return;
    var montants = !!r.montants, T = r.totaux || {}, tot = T.total || {};
    var copie = cacheRecap.copieLe ? 'Copie du ' + AMX.copieTexte(cacheRecap.copieLe) + ' — mise à jour en cours… · ' : '';
    this.elSous.textContent = copie + 'Année ' + r.annee + ' · ' + pluriel(r.nombre || 0, 'vente') + (tot.attenteFI ? ' · ' + tot.attenteFI + ' en attente du F&I' : '') + (tot.compta ? ' · ' + tot.compta + ' comptabilisée' + (tot.compta > 1 ? 's' : '') : '') + (r.genereLe && !cacheRecap.copieLe ? ' · calculé à ' + AMX.fmtDate(r.genereLe, true).replace(/^\S+\s/, '') : '');
    AMX.vider(el);
    var aller = function (mois, type) { var p = {}; if (mois) p.mois = mois; if (type) p.type = type; self.filtres.type = type || ''; AMX.aller('ventes', 'liste', p); };
    var cle = function (a) { return a && a.n ? (a.reel ? a.reel + ' réel' + (a.prevu ? ' · ' + a.prevu + ' prévu' : '') : (a.prevu ? a.prevu + ' au prévu' : '')) : ''; };
    /* Chiffres clés */
    var kpis = h('div.kpis');
    var kpi = function (valeur, libelle, sous, cls, onclick) { return h('div.kpi' + (cls ? '.' + cls : '') + (onclick ? '.cliquable' : ''), onclick ? { role: 'button', tabindex: '0', onclick: onclick } : {}, [h('div.valeur', { text: String(valeur) }), h('div.libelle', { text: libelle }), sous ? h('div.sous', { text: sous }) : null]); };
    kpis.appendChild(kpi(tot.n || 0, 'Ventes ' + r.annee, cle(tot), 'neutre', function () { aller(r.annee, ''); }));
    kpis.appendChild(kpi((T.neuf || {}).n || 0, 'Neufs', montants && T.neuf && T.neuf.n ? 'profit ' + argent(T.neuf.profit) : '', '', function () { aller(r.annee, 'neuf'); }));
    kpis.appendChild(kpi((T.usage || {}).n || 0, 'Usagés', montants && T.usage && T.usage.n ? 'profit ' + argent(T.usage.profit) : '', '', function () { aller(r.annee, 'usage'); }));
    kpis.appendChild(kpi((T.wholesale || {}).n || 0, 'Wholesale', montants && T.wholesale && T.wholesale.n ? 'profit ' + argent(T.wholesale.profit) : '', '', function () { aller(r.annee, 'wholesale'); }));
    if (montants) {
      kpis.appendChild(kpi(argent(tot.profit), 'Profit (front + F&I)', 'front ' + argent(tot.front) + ' · F&I ' + argent(tot.fi) + (tot.nFi ? ' · F&I inscrit sur ' + tot.nFi + ' vente' + (tot.nFi > 1 ? 's' : '') : ''), 'neutre'));
      if (tot.frontEstime !== undefined) {   /* 22 oct. : front (voiture) et F&I séparés, estimé / comptable / écart (script à jour) */
        var q = function (pref, K) { return { estime: tot[pref + 'Estime'], nEstime: tot['n' + K + 'Estime'], comptable: tot[pref + 'Comptable'], nComptable: tot['n' + K + 'Comptable'], ecart: tot['ecart' + K], nPaires: tot['n' + K + 'Paires'] }; };
        kpis.appendChild(carteComparaison('ventes-recap-front', 'Front (voiture)', q('front', 'Front')));
        kpis.appendChild(carteComparaison('ventes-recap-fi', 'F&I', q('fi', 'FI')));
      }
      kpis.appendChild(kpi(tot.n ? argent(tot.profit / tot.n) : '—', 'Profit / véhicule', tot.nFront ? 'front ' + argent(tot.front / tot.nFront) + (tot.nFi ? ' · F&I ' + argent(tot.fi / tot.nFi) : '') : '', 'neutre'));
      kpis.appendChild(kpi(argent(tot.produitsMontant), 'Produits F&I', pluriel(tot.produits || 0, 'produit') + ' vendu' + (tot.produits > 1 ? 's' : ''), 'neutre'));
    }
    kpis.appendChild(kpi(tot.attenteFI || 0, 'Attente F&I', '', tot.attenteFI ? 'alerte' : '', function () { self.filtres.etat = 'declaree'; aller(r.annee, ''); }));
    if (tot.fiAInscrire !== undefined) kpis.appendChild(kpi(tot.fiAInscrire || 0, 'F&I à inscrire', 'F&I estimé manquant (hors wholesale)', tot.fiAInscrire ? 'alerte' : '', function () { self.filtres.etat = 'sansFI'; aller(r.annee, ''); }));
    kpis.appendChild(kpi(tot.compta || 0, 'Comptabilisées', tot.n ? Math.round(100 * (tot.compta || 0) / tot.n) + ' %' : '', ''));
    el.appendChild(kpis);
    /* Par mois */
    var th = function (t, cls) { return h('th' + (cls ? '.' + cls : ''), { text: t }); };
    var tdN = function (a, type, mois) { return h('td.num' + (a.n ? '.cliquable' : '.vide'), { text: a.n ? String(a.n) : '·', onclick: a.n ? function (e) { e.stopPropagation(); aller(mois, type); } : null }); };
    var tdM = function (x, vide) { return h('td.num' + (vide ? '.vide' : ''), { text: vide ? '·' : argent(x) }); };
    var tdEcart = function (x, n, e, c) { return h('td.num' + (n ? classeEcart(x) : '.vide'), { text: n ? signe(x) : '·', title: n ? 'Comptable − estimé, sur ' + pluriel(n, 'vente') + ' qui ont les deux (estimé ' + argent(e) + ', comptable ' + argent(c) + ')' : '' }); };
    var comparer = montants && tot.frontEstime !== undefined;   /* script d'avant : front / F&I comme avant */
    var rs2 = comparer ? { rowspan: '2' } : {};
    var thR2 = function (t, cls) { return h('th' + (cls ? '.' + cls : ''), Object.assign({ text: t }, rs2)); };
    var enteteMois = h('tr', [thR2('Mois'), thR2('Neufs', 'num'), thR2('Usagés', 'num'), thR2('Wholesale', 'num'), thR2('Total', 'num')]
      .concat(comparer ? [h('th.groupe-col.debut-groupe', { colspan: '3', text: 'Front (voiture)' }), h('th.groupe-col.debut-groupe', { colspan: '3', text: 'F&I' }), thR2('Profit / véh.', 'num.debut-groupe')] : (montants ? [th('Front', 'num'), th('F&I', 'num'), th('Profit', 'num'), th('/ véh.', 'num')] : []))
      .concat([thR2('Au prévu', 'num'), thR2('F&I à inscrire', 'num'), thR2('Attente F&I', 'num'), thR2('Compta', 'num')]));
    var enteteMois2 = comparer ? h('tr', ['Estimé', 'Comptable', 'Écart', 'Estimé', 'Comptable', 'Écart'].map(function (t, i) { return h('th.num' + (i % 3 === 0 ? '.debut-groupe' : ''), { text: t }); })) : null;
    var corpsMois = h('tbody');
    var ligneMois = function (libelle, e, cls, mois) {
      var t = e.total || {}, tr = h('tr' + (cls ? '.' + cls : '') + (t.n ? '.cliquable' : '.mois-vide'), [
        h('td', { text: libelle }), tdN(e.neuf || {}, 'neuf', mois), tdN(e.usage || {}, 'usage', mois), tdN(e.wholesale || {}, 'wholesale', mois), tdN(t, '', mois)
      ].concat(comparer ? [
        h('td.num.debut-groupe' + (t.nFrontEstime ? '' : '.vide'), { text: t.nFrontEstime ? argent(t.frontEstime) : '·' }), tdM(t.frontComptable, !t.nFrontComptable), tdEcart(t.ecartFront, t.nFrontPaires, t.frontPairesE, t.frontPairesC),
        h('td.num.debut-groupe' + (t.nFIEstime ? '' : '.vide'), { text: t.nFIEstime ? argent(t.fiEstime) : '·' }), tdM(t.fiComptable, !t.nFIComptable), tdEcart(t.ecartFI, t.nFIPaires, t.fiPairesE, t.fiPairesC),
        h('td.num.debut-groupe' + (t.n ? '' : '.vide'), { text: t.n ? argent(t.profit / t.n) : '·' })
      ] : (montants ? [tdM(t.front, !t.n), tdM(t.fi, !t.n), tdM(t.profit, !t.n), tdM(t.n ? t.profit / t.n : 0, !t.n)] : [])).concat([
        h('td.num' + (t.prevu ? '' : '.vide'), { text: t.prevu ? String(t.prevu) : '·', title: 'Profit prévu seulement (réel pas encore inscrit par la comptabilité)' }),
        h('td.num' + (t.fiAInscrire ? '.alerte' : '.vide'), { text: t.fiAInscrire ? String(t.fiAInscrire) : '·', title: 'Ventes sans profit F&I estimé (hors wholesale)' }),
        h('td.num' + (t.attenteFI ? '.alerte' : '.vide'), { text: t.attenteFI ? String(t.attenteFI) : '·' }),
        h('td.num' + (t.compta ? '' : '.vide'), { text: t.compta ? String(t.compta) : '·' })
      ]));
      if (t.n && mois) tr.addEventListener('click', function () { aller(mois, ''); });
      return tr;
    };
    r.mois.forEach(function (e) { corpsMois.appendChild(ligneMois(capitale(e.libelle || moisLibelle(e.mois)), e, '', e.mois)); });
    corpsMois.appendChild(ligneMois('Total ' + r.annee, T, 'total', r.annee));
    el.appendChild(h('div.carte', [h('h3', ['Par mois de livraison', h('span.sous', { text: (comparer ? '— front (la voiture) et F&I séparés : estimé = prévu, comptable = réel inscrit, écart = comptable − estimé sur les ventes qui ont les deux ; ' : (montants ? '— profit = front + F&I, réel quand la comptabilité l\'a inscrit, sinon prévu ; ' : '— ')) + 'date de vente quand il n\'y a pas de date de livraison ; annulées exclues' })]), h('div.defile', [h('table.tableau#ventes-recap-mois', [h('thead', [enteteMois, enteteMois2]), corpsMois])])]));
    /* Conseillers, catégories */
    var tableConseillers = function (liste, titre, avecTypes) {
      if (!liste || !liste.length) return null;
      var en = h('tr', [th('Nom')].concat(avecTypes ? [th('Neufs', 'num'), th('Usagés', 'num'), th('Wholesale', 'num')] : []).concat([th('Ventes', 'num')]).concat(montants ? [th('Front', 'num'), th('F&I', 'num'), th('Profit', 'num'), th('/ véh.', 'num')] : []).concat([th('Attente F&I', 'num')]));
      var tb = h('tbody', liste.map(function (c) {
        return h('tr', [h('td', { text: c.nom || c.libelle || AMX.COMPAGNIES_TOUTES[c.compagnie] || c.compagnie })].concat(avecTypes ? [h('td.num', { text: String(c.neuf || 0) }), h('td.num', { text: String(c.usage || 0) }), h('td.num', { text: String(c.wholesale || 0) })] : []).concat([h('td.num', { text: String(c.n) })]).concat(montants ? [tdM(c.front), tdM(c.fi), tdM(c.profit), tdM(c.n ? c.profit / c.n : 0)] : []).concat([h('td.num' + (c.attenteFI ? '.alerte' : '.vide'), { text: c.attenteFI ? String(c.attenteFI) : '·' })]));
      }));
      return h('div.carte', [h('h3', { text: titre }), h('div.defile', [h('table.tableau', [h('thead', [en]), tb])])]);
    };
    var cartes = [];
    if (!r.compagnie && r.concessions && r.concessions.length > 1) cartes.push(tableConseillers(r.concessions.map(function (c) { return Object.assign({}, c, { nom: AMX.COMPAGNIES_TOUTES[c.compagnie] || c.compagnie }); }), 'Par concession', true));
    cartes.push(tableConseillers(r.conseillers, 'Par conseiller', true));
    if (r.directeurs && r.directeurs.length) cartes.push(tableConseillers(r.directeurs, 'Par directeur commercial (F&I)', false));
    if (r.categories && r.categories.length) cartes.push(tableConseillers(r.categories.map(function (c) { return Object.assign({}, c, { nom: (c.typeLibelle || TYPES[c.type] || c.type) + ' · ' + (c.libelle || c.categorie || '—') }); }), 'Par catégorie', false));
    cartes.filter(Boolean).forEach(function (c) { el.appendChild(c); });
    /* Produits F&I et modes de paiement */
    var deux = h('div.deux');
    if (r.produits && r.produits.length) {
      var tbP = h('tbody', r.produits.map(function (p) { return h('tr' + (p.n ? '' : '.mois-vide'), [h('td', { text: p.libelle }), h('td.num', { text: p.n ? String(p.n) : '·' })].concat(montants ? [tdM(p.montant, !p.n)] : []).concat([h('td.num', { text: p.n && tot.n ? Math.round(100 * p.n / tot.n) + ' %' : '·' })])); }));
      deux.appendChild(h('div.carte', [h('h3', ['Produits F&I', h('span.sous', { text: '— ' + pluriel(tot.produits || 0, 'produit') + ' sur ' + pluriel(tot.n || 0, 'vente') })]), h('table.tableau', [h('thead', [h('tr', [th('Produit'), th('Vendus', 'num')].concat(montants ? [th('Montant', 'num')] : []).concat([th('Pénétration', 'num')]))]), tbP])]));
    }
    if (r.paiements) {
      var P = r.paiements, nP = (P.financement || 0) + (P.location || 0) + (P.comptant || 0) + (P.inconnu || 0);
      var tbPay = h('tbody', [['financement', 'Financement'], ['location', 'Location'], ['comptant', 'Comptant'], ['inconnu', 'Non inscrit']].map(function (p) { return h('tr', [h('td', { text: p[1] }), h('td.num', { text: String(P[p[0]] || 0) }), h('td.num', { text: nP ? Math.round(100 * (P[p[0]] || 0) / nP) + ' %' : '·' })]); }));
      var pneus = tot.pneusInscrits ? Math.round(100 * tot.pneusOui / tot.pneusInscrits) + ' % (' + tot.pneusOui + ' / ' + tot.pneusInscrits + ')' : '—';
      deux.appendChild(h('div.carte', [h('h3', ['Modes de paiement', h('span.sous', { text: '— neufs et usagés' })]), h('table.tableau', [h('thead', [h('tr', [th('Mode'), th('Ventes', 'num'), th('Part', 'num')])]), tbPay]),
        h('p.ventes-aide', { style: { marginTop: '10px' }, text: 'Pneus vendus : ' + pneus + (montants ? ' · accessoires ' + argent(tot.accessoires) + ' · over / under ' + signe(tot.overUnder) : '') })]));
    }
    if (deux.childNodes.length) el.appendChild(deux);
    if (typeof XLSX !== 'undefined') el.appendChild(h('div.actions', { style: { justifyContent: 'flex-end' } }, [h('button.btn#ventes-recap-export', { type: 'button', onclick: function () { self.exporterRecap(); } }, [AMX.svg('telecharger'), ' Excel du récapitulatif'])]));
  };
  VueVentes.prototype.exporterRecap = function () {
    var r = cacheRecap.rep; if (!r) return;
    var montants = !!r.montants;
    var ligne = function (nom, a) { var o = { '': nom, Ventes: a.n || 0 }; if (montants) { if (a.frontEstime !== undefined) { o['Front estimé'] = a.frontEstime; o['Front comptable'] = a.frontComptable; o['Écart front'] = a.nFrontPaires ? a.ecartFront : ''; o['F&I estimé'] = a.fiEstime; o['F&I comptable'] = a.fiComptable; o['Écart F&I'] = a.nFIPaires ? a.ecartFI : ''; } if (a.fiAInscrire !== undefined) o['F&I à inscrire'] = a.fiAInscrire; o.Front = a.front; o['F&I'] = a.fi; o.Profit = a.profit; o['Profit / véh.'] = a.n ? Math.round(100 * a.profit / a.n) / 100 : ''; o.Accessoires = a.accessoires; o['Over / under'] = a.overUnder; o['Produits F&I $'] = a.produitsMontant; } o['Au prévu'] = a.prevu || 0; o['Réel inscrit'] = a.reel || 0; o['Attente F&I'] = a.attenteFI || 0; o['Comptabilisées'] = a.compta || 0; o['Produits F&I'] = a.produits || 0; return o; };
    var mois = []; r.mois.forEach(function (e) { ['total', 'neuf', 'usage', 'wholesale'].forEach(function (t) { if (e[t] && e[t].n) mois.push(Object.assign({ Mois: capitale(e.libelle), Type: t === 'total' ? 'Total' : TYPES[t] }, ligne('', e[t]))); }); });
    ['total', 'neuf', 'usage', 'wholesale'].forEach(function (t) { if (r.totaux[t]) mois.push(Object.assign({ Mois: 'Année ' + r.annee, Type: t === 'total' ? 'Total' : TYPES[t] }, ligne('', r.totaux[t]))); });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mois.map(function (o) { delete o['']; return o; })), 'Par mois');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((r.conseillers || []).map(function (c) { return Object.assign({ Conseiller: c.nom, Neufs: c.neuf, 'Usagés': c.usage, Wholesale: c.wholesale }, ligne('', c)); }).map(function (o) { delete o['']; return o; })), 'Conseillers');
    if (r.directeurs && r.directeurs.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r.directeurs.map(function (c) { var o = Object.assign({ 'Directeur commercial': c.nom }, ligne('', c)); delete o['']; return o; })), 'F&I');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((r.categories || []).map(function (c) { var o = Object.assign({ Type: c.typeLibelle || c.type, 'Catégorie': c.libelle || c.categorie }, ligne('', c)); delete o['']; return o; })), 'Catégories');
    if (!r.compagnie && r.concessions) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r.concessions.map(function (c) { var o = Object.assign({ Concession: AMX.COMPAGNIES_TOUTES[c.compagnie] || c.compagnie, Neufs: c.neuf, 'Usagés': c.usage, Wholesale: c.wholesale }, ligne('', c)); delete o['']; return o; })), 'Concessions');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((r.produits || []).map(function (p) { var o = { Produit: p.libelle, Vendus: p.n }; if (montants) o.Montant = p.montant; return o; })), 'Produits F&I');
    XLSX.writeFile(wb, 'recapitulatif-ventes-' + (r.compagnie || 'groupe') + '-' + r.annee + '.xlsx');
  };

  /* ------------------------------ Fiche d'une vente ------------------------------ */
  function ouvrirFiche(v) {
    injecterCss();
    var corps = h('div.ventes-fiche', [h('p.ventes-aide', 'Chargement de l\'historique…')]);
    var m = AMX.modale({ titre: (vehiculeTexte(v) || 'Vente') + (v.client || v.venduA ? ' — ' + (v.client || v.venduA) : ''), corps: corps, boutons: [{ texte: 'Fermer' }] });
    var poser = function (x) { AMX.vider(corps); remplirFiche(corps, x); m.boutons(boutonsFiche(x, m.fermer)); };
    if (v.journal !== undefined) { poser(v); return m; }
    AMX.ventes.une(v.id).then(function (x) { if (x) { if (cache.rep) { var i = cache.rep.ventes.findIndex(function (y) { return y.id === x.id; }); if (i >= 0) cache.rep.ventes[i] = x; } poser(x); } else poser(v); }, function () { poser(v); });
    return m;
  }
  function remplirFiche(corps, v) {
    var d = cache.rep, montants = d && d.montants !== undefined ? !!d.montants : AMX.ventes.montants();
    if (v.montantsMasques) montants = false;
    var ws = v.type === 'wholesale', prd = produitsListe(v), aEchange = !!(v.echangeStock || v.echangeModele || v.echangeVin);
    var dl = function (lignes) { return h('dl', lignes.filter(Boolean).map(function (x) { return [h('dt', { text: x[0] }), h('dd', x[1] instanceof Node ? [x[1]] : { text: String(x[1]) })]; })); };
    corps.appendChild(h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '10px' } }, [puceEtat(v), puceLivre(v), h('span.puce.mono', { text: v.id }), v.importee ? h('span.puce', { text: 'importée du livre', title: 'Ligne lue dans le livre de la comptabilité' }) : null, h('span.puce', { text: capitale(v.moisLibelle || moisLibelle(moisDeVente(v))), title: 'Mois afférent (date de vente inscrite)' })]));
    corps.appendChild(dl([
      ['Concession', AMX.COMPAGNIES_TOUTES[v.compagnie] || v.compagnie], ['Type', (TYPES[v.type] || v.type) + ' · ' + libCategorie(v.type, v.categorie)], ['Date de vente', AMX.fmtDate(v.dateVente)], ['Livraison', v.dateLivraison ? AMX.fmtDate(v.dateLivraison) : '—'],
      [ws ? 'Vendu à' : 'Client', v.client || v.venduA || '—'], v.telephone ? ['Téléphone', AMX.telephoneTexte ? AMX.telephoneTexte(v.telephone) : v.telephone] : null, v.courriel ? ['Courriel', v.courriel] : null,
      ws ? ['Acheté de', v.acheteDe || '—'] : null, ['Véhicule', vehiculeTexte(v) || '—'], ['# Stock', v.stock || '—'], ['NIV', v.vin || '—'], ['Conseiller', v.conseiller || '—'],
      montants ? ['Prix de vente', argent(v.prixVente)] : null, montants && ws ? ['Coûtant', argent(v.coutant)] : null, ['Paiement', libPaiement(v.paiement) || '—'],
      montants ? ['Front estimé (voiture)', argent(frontE(v))] : null, montants ? ['Front comptable', frontC(v) === null ? 'pas encore inscrit' : argent(frontC(v))] : null,
      montants && ecartEC(frontE(v), frontC(v)) !== null ? ['Écart front', h('span' + classeEcart(ecartEC(frontE(v), frontC(v))), { text: signe(ecartEC(frontE(v), frontC(v))) + ' (comptable − estimé)' })] : null,
      montants ? ['Accessoires', argent(v.accessoires)] : null, v.note ? ['Note', v.note] : null
    ]));
    if (aEchange) {
      corps.appendChild(h('h4', 'Échange'));
      var lienEval = v.echangeVin && String(v.echangeVin).length === 17 ? h('a.btn.petit', { href: AMX.lien('outils', 'evaluation', { vin: v.echangeVin }), text: 'Ouvrir l\'évaluation', target: '_blank', rel: 'noopener' }) : null;
      corps.appendChild(dl([
        ['Véhicule', [v.echangeModele, v.echangeStock ? '# ' + v.echangeStock : ''].filter(Boolean).join(' · ') || '—'], ['NIV', v.echangeVin || '—'], ['Km', v.echangeKm !== null && v.echangeKm !== undefined && v.echangeKm !== '' ? AMX.fmtNombre(nombre(v.echangeKm)) + ' km' : '—'],
        montants ? ['Valeur accordée', argent(v.echangeValeur)] : null,
        montants ? ['Évaluation (ACV)', v.echangeEvaluation !== null && v.echangeEvaluation !== undefined && v.echangeEvaluation !== '' ? h('span', [argent(v.echangeEvaluation) + (v.echangeEvalLe ? ' · évaluée le ' + AMX.fmtDate(v.echangeEvalLe) : '') + (v.echangeEvalPar ? ' par ' + String(v.echangeEvalPar).split('@')[0] : ''), lienEval]) : h('span', ['— pas d\'évaluation liée', lienEval ? h('a.btn.petit', { href: AMX.lien('outils', 'evaluation', { vin: v.echangeVin }), text: 'Évaluer', target: '_blank', rel: 'noopener' }) : null])] : (lienEval ? ['Évaluation', lienEval] : null),
        montants ? ['Over / under', h('span' + (nombre(v.overUnder) > 0 ? '.alerte' : ''), { text: signe(nombre(v.overUnder)) + (nombre(v.overUnder) > 0 ? ' (accordé au-dessus de l\'évaluation)' : '') })] : null
      ]));
    }
    corps.appendChild(h('h4', 'F&I — directeur commercial'));
    corps.appendChild(dl([
      ['Directeur commercial', v.directeur || '—'],
      montants ? ['F&I estimé', besoinFI(v) ? h('span.puce.alerte', { text: 'à inscrire' }) : argent(fiE(v))] : null, montants ? ['F&I comptable', fiC(v) === null ? 'pas encore inscrit' : argent(fiC(v))] : null,
      montants && ecartEC(fiE(v), fiC(v)) !== null ? ['Écart F&I', h('span' + classeEcart(ecartEC(fiE(v), fiC(v))), { text: signe(ecartEC(fiE(v), fiC(v))) + ' (comptable − estimé)' })] : null,
      ['Pneus', v.pneus === 'oui' ? 'Oui' : (v.pneus === 'non' ? 'Non' : '—')],
      ['Produits', prd.length ? h('div.produits', prd.map(function (p) { return h('span.puce.info', { text: p.libelle + (montants && p.montant !== null ? ' · ' + argent(p.montant) : '') }); })) : (v.statut === 'declaree' ? 'en attente du F&I' : '—')],
      v.statut === 'declaree' || v.fiAviseLe ? ['F&I prévenu', v.fiAviseLe ? AMX.fmtDate(v.fiAviseLe, true) + (v.fiAvises ? ' → ' + v.fiAvises : '') + (v.fiRappelLe ? ' · rappel le ' + AMX.fmtDate(v.fiRappelLe, true) : (v.statut === 'declaree' ? ' · rappel après 24 h' : '')) : 'aucun courriel parti (pas de destinataire F&I)'] : null
    ]));
    corps.appendChild(h('h4', 'Livre et suivi'));
    corps.appendChild(dl([
      ['Livre', v.livre === 'ecrit' ? (v.livreOnglet || '') + ' · ligne ' + v.livreLigne : (v.livre === 'erreur' ? 'PAS ÉCRITE — ' + (v.livreErreur || '') : 'pas encore écrite')],
      [v.importee ? 'Importée' : 'Inscrite', (v.importee ? 'du livre' : (v.declareParNom || v.declarePar || '')) + (v.declareLe ? ' · ' + AMX.fmtDate(v.declareLe, true) : '')], v.completeLe ? ['F&I inscrit', (v.completeParNom || v.completePar || '') + ' · ' + AMX.fmtDate(v.completeLe, true)] : null,
      v.comptabiliseLe ? ['Comptabilisée', AMX.fmtDate(v.comptabiliseLe)] : null, v.statut === 'annulee' ? ['Annulée', v.annuleRaison || ''] : null
    ]));
    if (v.journal && v.journal.length) corps.appendChild(h('div.journal', [h('b', 'Historique'), h('ul', { style: { margin: '4px 0 0', paddingLeft: '16px' } }, v.journal.slice().reverse().map(function (j) { return h('li', { text: AMX.fmtDate(j.le, true) + ' — ' + j.quoi + (j.par ? ' (' + j.par + ')' : '') }); }))]));
  }
  function boutonsFiche(v, fermer) {
    var boutons = [];
    if (v.statut !== 'annulee' && v.statut !== 'comptabilisee') {
      if (AMX.ventes.peutCompleter()) boutons.push({ texte: v.statut === 'declaree' || besoinFI(v) ? 'Inscrire les profits F&I' : 'Modifier', classe: 'primaire', action: function (f) { f(); AMX.ventes.completer(v); return false; } });
      else if (AMX.ventes.peutDeclarer()) boutons.push({ texte: 'Modifier', action: function (f) { f(); AMX.ventes.completer(v); return false; } });
      if (v.livre === 'erreur') boutons.push({ texte: 'Renvoyer au livre', action: function (f) { f(); renvoyer(v); return false; } });
      if (AMX.ventes.peutCompleter() || AMX.ventes.peutDeclarer()) boutons.push({ texte: 'Annuler la vente…', classe: 'danger fantome', action: function (f) { f(); modaleAnnuler(v); return false; } });
    }
    if (v.livreUrl) boutons.push({ texte: 'Ouvrir le livre', action: function () { window.open(v.livreUrl, '_blank', 'noopener'); return false; } });
    boutons.push({ texte: 'Fermer' });
    return boutons;
  }

  /* ------------------------------ Actions ------------------------------ */
  function renvoyer(v) {
    return AMX.post({ action: 'venteRenvoyer', id: v.id }, { delai: 90000 }).then(function (r) {
      verifierPost(r); AMX.ventes.poser(r.vente); AMX.toast(r.message || 'Renvoyée', r.livre && r.livre.ok ? 'ok' : 'erreur', 6000); return true;
    }, function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); return false; });
  }
  function modaleAnnuler(v) {
    var ta = h('textarea.saisie#vente-raison', { rows: '3', placeholder: 'Client désisté, refus de crédit, erreur de saisie…' });
    AMX.modale({
      titre: 'Annuler la vente ' + v.id, corps: h('div.ventes-form', [h('p.ventes-aide', { text: 'La ligne du livre reste, marquée « Annulé » avec CANCELLÉ dans les profits prévus, comme la comptabilité le fait déjà.' }), h('div.champ', [h('label', { 'for': 'vente-raison', text: 'Pourquoi ?' }), ta])]),
      boutons: [{ texte: 'Garder la vente' }, { texte: 'Annuler la vente', classe: 'danger', action: function () {
        var raison = ta.value.trim(); if (raison.length < 3) { AMX.toast('Dites pourquoi.', 'erreur'); ta.focus(); return false; }
        return AMX.post({ action: 'venteAnnuler', id: v.id, raison: raison }, { delai: 90000 }).then(function (r) { verifierPost(r); AMX.ventes.poser(r.vente); AMX.toast(r.message || 'Vente annulée', 'ok'); return true; }, function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); return false; });
      } }]
    });
  }

  /* ------------------------------ Trouver le véhicule (neufs, registres) ------------------------------ */
  function chercherVehicule(cie, texte) {
    var q = String(texte || '').trim().toUpperCase().replace(/\s+/g, ''); if (!q) return null;
    var estVin = /^[A-HJ-NPR-Z0-9]{17}$/.test(q);
    var neufs = AMX.neufs && AMX.neufs.enCache ? AMX.neufs.enCache() : null;
    if (neufs && neufs.vehicules) {
      var n = neufs.vehicules.filter(function (v) { return (!cie || String(v.compagnie).toUpperCase() === cie) && ((estVin && String(v.vin).toUpperCase() === q) || (!estVin && String(v.stock || '').toUpperCase() === q)); })[0];
      if (n) return { type: 'neuf', compagnie: String(n.compagnie).toUpperCase(), vin: n.vin, stock: n.stock || '', annee: n.annee || '', marque: n.marque || '', modele: n.modele || '', version: n.version || '', coutant: n.coutFacture || '', source: 'Inventaire › Neufs' };
    }
    if (AMX.inventaire && AMX.inventaire.enCache) {
      var trouve = null, reg = '';
      ['DETAIL', 'CAN', 'US'].some(function (f) { var l = AMX.inventaire.enCache(f) || []; var v = l.filter(function (x) { return (!cie || String(x.compagnie || '').toUpperCase() === cie) && ((estVin && String(x.vin).toUpperCase() === q) || (!estVin && String(x.stock || '').toUpperCase() === q)); })[0]; if (v) { trouve = v; reg = f; return true; } return false; });
      if (trouve) {
        var m = /^(\d{4})\s+(\S+)\s+(.*)$/.exec(trouve.modele || '') || /^(\S+)\s+(.*?)\s+(\d{4})$/.exec(trouve.modele || ''), o = { type: reg === 'DETAIL' ? 'usage' : 'wholesale', compagnie: String(trouve.compagnie || '').toUpperCase(), vin: trouve.vin, stock: trouve.stock || '', coutant: trouve.cout || '', modeleTexte: trouve.modele || '', source: 'Inventaire › Usagé › ' + AMX.inventaire.nomFeuille(reg), registre: reg };
        if (m) { if (/^\d{4}$/.test(m[1])) { o.annee = m[1]; o.marque = m[2]; o.modele = m[3]; } else { o.marque = m[1]; o.modele = m[2]; o.annee = m[3]; } } else o.modele = trouve.modele || '';
        return o;
      }
    }
    return estVin ? { vin: q, inconnu: true } : { stock: q, inconnu: true };
  }

  /* ------------------------------ Formulaire : inscrire (direction des ventes) / profits F&I (directeur commercial) ------------------------------ */
  function ouvrirFormulaire(prefill, existante) {
    injecterCss();
    var edition = !!existante, v = existante || {};
    var peutCompleter = AMX.ventes.peutCompleter(), peutDeclarer = AMX.ventes.peutDeclarer();
    if (!edition && !peutDeclarer) { AMX.toast('Inscrire une vente est réservé à la direction des ventes et aux conseillers (droit « Ventes — déclarer une vente »).', 'erreur'); return null; }
    var codes = AMX.codesPour('inventaire');
    var cie = String(v.compagnie || prefill.compagnie || AMX.compagnieChoisie('inventaire') || (codes.length === 1 ? codes[0] : '') || '').toUpperCase();
    var type = v.type || prefill.type || 'neuf';
    var vehicule = { vin: v.vin || prefill.vin || '', stock: v.stock || prefill.stock || '', annee: v.annee || prefill.annee || '', marque: v.marque || prefill.marque || '', modele: v.modele || prefill.modele || '', version: v.version || prefill.version || '', coutant: v.coutant !== undefined && v.coutant !== null ? v.coutant : (prefill.coutant || ''), source: prefill.source || '' };
    var rep = cache.rep && cache.cle && cache.cle.split('|')[0] === cie ? cache.rep : null;
    var defsProduits = AMX.ventes.produits(), produitsInit = produitsDe(v);
    var val = function (x) { return x === undefined || x === null ? '' : x; };

    var selCie = h('select.saisie#vente-compagnie', [h('option', { value: '', text: 'Concession…' })].concat(codes.map(function (c) { return h('option', { value: c, text: AMX.COMPAGNIES_TOUTES[c] || c, selected: c === cie ? 'selected' : undefined }); })));
    if (edition) selCie.disabled = true;
    var segType = h('div.segment.bloc#vente-type', Object.keys(TYPES).map(function (t) { return h('button' + (type === t ? '.actif' : ''), { type: 'button', 'data-type': t, text: TYPES[t], onclick: function () { if (edition) return; type = t; segType.querySelectorAll('button').forEach(function (b) { b.classList.toggle('actif', b.dataset.type === t); }); rendreCategories(); rendreWholesale(); } }); }));
    var inRecherche = h('input.saisie#vente-recherche', { type: 'text', placeholder: '# stock ou NIV', autocomplete: 'off', spellcheck: 'false', value: vehicule.stock || vehicule.vin || '' });
    var btnChercher = h('button.btn', { type: 'button', text: 'Trouver', onclick: function () { trouver(inRecherche.value); } });
    var elTrouve = h('div.ventes-trouve.gris', { text: 'Tapez le # stock ou le NIV puis « Trouver » : les neufs (DMS / manufacturier) et les registres usagés sont fouillés.' });
    var inVin = h('input.saisie#vente-vin', { type: 'text', maxlength: '17', placeholder: 'NIV (17 caractères)', value: vehicule.vin, autocomplete: 'off', spellcheck: 'false' });
    var inStock = h('input.saisie#vente-stock', { type: 'text', placeholder: '# stock', value: vehicule.stock });
    var inAnnee = h('input.saisie#vente-annee', { type: 'text', placeholder: '2026', value: vehicule.annee, maxlength: '4' });
    var inMarque = h('input.saisie#vente-marque', { type: 'text', placeholder: 'Marque', value: vehicule.marque });
    var inModele = h('input.saisie#vente-modele', { type: 'text', placeholder: 'Modèle', value: vehicule.modele });
    var inVersion = h('input.saisie#vente-version', { type: 'text', placeholder: 'Version', value: vehicule.version });
    var inClient = h('input.saisie#vente-client', { type: 'text', placeholder: 'Nom du client', value: v.client || '' });
    var inTel = h('input.saisie#vente-telephone', { type: 'tel', placeholder: '514 555-0147', value: v.telephone || '' });
    var inCourriel = h('input.saisie#vente-courriel', { type: 'email', placeholder: 'courriel (facultatif)', value: v.courriel || '' });
    var inDate = h('input.saisie#vente-date', { type: 'date', value: v.dateVente || isoLocal(new Date()) });
    var inLivraison = h('input.saisie#vente-livraison', { type: 'date', value: v.dateLivraison || '' });
    var selCat = h('select.saisie#vente-categorie');
    var inConseiller = h('input.saisie#vente-conseiller', { type: 'text', list: 'vente-conseillers', placeholder: 'Conseiller', value: v.conseiller || '', autocomplete: 'off' });
    var dlConseillers = h('datalist#vente-conseillers');
    var inPrix = h('input.saisie#vente-prix', { type: 'text', inputmode: 'decimal', placeholder: '0,00 $', value: val(v.prixVente) });
    var selPaiement = h('select.saisie#vente-paiement', [h('option', { value: '', text: '—' })].concat(PAIEMENTS.map(function (p) { return h('option', { value: p[0], text: p[1], selected: v.paiement === p[0] ? 'selected' : undefined }); })));
    var inFront = h('input.saisie#vente-front', { type: 'text', inputmode: 'decimal', placeholder: '0,00 $', value: val(v.profitPrevu) });
    var inAccess = h('input.saisie#vente-accessoires', { type: 'text', inputmode: 'decimal', placeholder: '0,00 $', value: val(v.accessoires) });
    // Échange ↔ évaluation (Maxime, 21 oct. : « un lien entre le portail de déclaration et l'évaluation de l'échange, pouvoir l'importer »)
    var inEchVin = h('input.saisie#vente-echange-vin', { type: 'text', maxlength: '17', placeholder: 'NIV de l\'échange', value: v.echangeVin || prefill.echangeVin || '', spellcheck: 'false', autocomplete: 'off' });
    var btnEval = h('button.btn#vente-echange-trouver', { type: 'button', text: 'Trouver l\'évaluation', onclick: function () { chercherEvaluation(inEchVin.value, true); } });
    var elEval = h('div.ventes-trouve.gris#vente-echange-eval', { text: 'Tapez le NIV de l\'échange : son évaluation (Inventaire › Évaluations) remplit le modèle, le km et la valeur d\'achat.' });
    var inEchStock = h('input.saisie#vente-echange-stock', { type: 'text', placeholder: '# stock de l\'échange', value: v.echangeStock || '' });
    var inEchModele = h('input.saisie#vente-echange-modele', { type: 'text', placeholder: 'Modèle de l\'échange (ex. Civic 2019)', value: v.echangeModele || '' });
    var inEchKm = h('input.saisie#vente-echange-km', { type: 'text', inputmode: 'numeric', placeholder: 'km', value: val(v.echangeKm) });
    var inEchValeur = h('input.saisie#vente-echange-valeur', { type: 'text', inputmode: 'decimal', placeholder: 'Valeur accordée au client', value: val(v.echangeValeur) });
    var inEchEval = h('input.saisie#vente-echange-evaluation', { type: 'text', inputmode: 'decimal', placeholder: 'Valeur d\'évaluation (ACV)', value: val(v.echangeEvaluation) });
    var inOver = h('input.saisie#vente-over', { type: 'text', inputmode: 'decimal', placeholder: 'valeur accordée − évaluation', value: val(v.overUnder) });
    var evalMeta = { le: v.echangeEvalLe || '', par: v.echangeEvalPar || '' };
    var inNote = h('textarea.saisie#vente-note', { rows: '2', placeholder: 'Note (facultatif)' }); inNote.value = v.note || '';
    // Wholesale
    var inVenduA = h('input.saisie#vente-vendua', { type: 'text', placeholder: 'Acheteur (EBLOCK, OPENLANE, un concessionnaire…)', value: v.venduA || '' });
    var inAcheteDe = h('input.saisie#vente-achetede', { type: 'text', placeholder: 'Acheté de (Échange, Encan, Enterprise…)', value: v.acheteDe || '' });
    var inAcheteur = h('input.saisie#vente-acheteur', { type: 'text', placeholder: 'Acheteur interne', value: v.acheteur || '' });
    var inCoutant = h('input.saisie#vente-coutant', { type: 'text', inputmode: 'decimal', placeholder: 'Coûtant', value: vehicule.coutant !== '' && vehicule.coutant !== null && vehicule.coutant !== undefined ? vehicule.coutant : '' });
    // F&I — directeur commercial (Maxime, 21 oct. : « séparer … le directeur commercial qui inscrit ses profits », 16 produits)
    var inDirecteur = h('input.saisie#vente-directeur', { type: 'text', list: 'vente-directeurs', placeholder: 'Directeur commercial', value: v.directeur || (peutCompleter && AMX.ventes.estFI() ? (AMX.session.nom || '') : ''), autocomplete: 'off' });
    var dlDirecteurs = h('datalist#vente-directeurs');
    var inFI = h('input.saisie#vente-fi', { type: 'text', inputmode: 'decimal', placeholder: '0,00 $', value: val(v.profitFIPrevu) });
    var pneus = v.pneus || '';
    var segPneus = h('div.segment.bloc#vente-pneus', [['', '—'], ['oui', 'Oui'], ['non', 'Non']].map(function (p) { return h('button' + (pneus === p[0] ? '.actif' : ''), { type: 'button', 'data-pneus': p[0], text: p[1], onclick: function () { poserPneus(p[0]); } }); }));
    function poserPneus(x) { pneus = x; segPneus.querySelectorAll('button').forEach(function (b) { b.classList.toggle('actif', b.dataset.pneus === x); }); }
    var produits = {};   /* code → { case, montant, ligne } */
    var elProduits = h('div.ventes-produits', defsProduits.map(function (p) {
      var coche = produitsInit[p[0]] !== undefined && produitsInit[p[0]] !== null && produitsInit[p[0]] !== '' && produitsInit[p[0]] !== false;
      var cb = h('input', { type: 'checkbox', id: 'vente-prod-' + p[0], checked: coche ? 'checked' : undefined });
      var mt = h('input.saisie', { type: 'text', id: 'vente-prod-' + p[0] + '-montant', inputmode: 'decimal', placeholder: '$', value: coche && typeof produitsInit[p[0]] === 'number' ? produitsInit[p[0]] : '' });
      var ligne = h('div.ventes-produit' + (coche ? '.coche' : ''), [cb, h('label', { 'for': 'vente-prod-' + p[0], text: p[1] }), mt]);
      cb.addEventListener('change', function () { ligne.classList.toggle('coche', cb.checked); if (p[0] === 'pneusJantes' && cb.checked && !pneus) poserPneus('oui'); majTotalFI(); });
      mt.addEventListener('input', function () { if (mt.value.trim() && !cb.checked) { cb.checked = true; ligne.classList.add('coche'); if (p[0] === 'pneusJantes' && !pneus) poserPneus('oui'); } majTotalFI(); });
      produits[p[0]] = { cb: cb, mt: mt };
      return ligne;
    }));
    var elTotalFI = h('div.ventes-total-fi');
    var fiTouche = !!val(v.profitFIPrevu);
    inFI.addEventListener('input', function () { fiTouche = true; majTotalFI(); });
    function lireProduits() { var o = {}; Object.keys(produits).forEach(function (c) { if (!produits[c].cb.checked) return; var n = nombre(produits[c].mt.value); o[c] = n === null ? true : n; }); return o; }
    function majTotalFI() {
      var o = lireProduits(), n = 0, t = 0; Object.keys(o).forEach(function (c) { n++; if (typeof o[c] === 'number') t += o[c]; });
      AMX.vider(elTotalFI);
      if (!n) { elTotalFI.appendChild(h('span', 'Aucun produit coché.')); return; }
      elTotalFI.appendChild(h('span', { text: pluriel(n, 'produit') + ' · montants inscrits : ' + argent(t) }));
      if (t && nombre(inFI.value) !== t) elTotalFI.appendChild(h('button.btn.petit#vente-fi-somme', { type: 'button', text: 'Profit F&I = ' + argent(t), onclick: function () { inFI.value = String(Math.round(t * 100) / 100); fiTouche = true; majTotalFI(); } }));
      if (!fiTouche && t) inFI.value = String(Math.round(t * 100) / 100);
    }
    var champ = function (id, libelle, el, cls) { return h('div.champ' + (cls ? '.' + cls : ''), [h('label', { 'for': id, text: libelle }), el]); };
    var blocWholesale = h('div.grille', [champ('vente-vendua', 'Vendu à', inVenduA, 'large'), champ('vente-achetede', 'Acheté de', inAcheteDe), champ('vente-acheteur', 'Acheteur interne', inAcheteur), champ('vente-coutant', 'Coûtant', inCoutant)]);
    var blocClient = h('div.grille', [champ('vente-client', 'Client', inClient, 'large'), champ('vente-telephone', 'Téléphone', inTel), champ('vente-courriel', 'Courriel', inCourriel)]);
    var blocEchange = h('div', [
      h('div.ventes-vehicule', [champ('vente-echange-vin', 'NIV de l\'échange', inEchVin), btnEval]),
      elEval,
      h('div.grille', [champ('vente-echange-stock', '# stock', inEchStock), champ('vente-echange-modele', 'Modèle', inEchModele), champ('vente-echange-km', 'Km', inEchKm), champ('vente-echange-valeur', 'Valeur accordée', inEchValeur), champ('vente-echange-evaluation', 'Évaluation (ACV)', inEchEval), champ('vente-over', 'Over / under', inOver)])
    ]);
    var titreEchange = h('h4', 'Échange (s\'il y en a un)'), pEchange = h('p.ventes-aide', { text: 'L\'échange entre à l\'inventaire par sa fiche d\'achat (Inventaire › Fiche d\'achat) ; ici on le lie à son évaluation. Over / under = valeur accordée − évaluation, calculé si vous ne le tapez pas.' });
    var fiDest = rep && rep.fi ? rep.fi : null;
    var texteFI = !fiDest ? 'Le F&I (directeur commercial) recevra un courriel pour inscrire son profit F&I et les produits — rappel après 24 h.' : (fiDest.courriels && fiDest.courriels.length ? 'Le F&I recevra un courriel pour inscrire son profit F&I et les produits (rappel après 24 h) : ' + (fiDest.noms && fiDest.noms.length ? fiDest.noms : fiDest.courriels).join(', ') + '.' : 'Aucun destinataire F&I pour cette concession : personne ne sera prévenu (Admin › droit « Ventes — F&I »).');
    var sectionFI = peutCompleter ? h('div', [
      h('h4.fi', 'F&I — directeur commercial'),
      h('div.grille', [champ('vente-directeur', 'Directeur commercial', inDirecteur), champ('vente-fi', 'Profit F&I prévu', inFI), champ('vente-pneus', 'Pneus vendus', segPneus)]),
      h('p.ventes-aide', 'Produits vendus — cochez et inscrivez le montant quand vous l\'avez ; la somme propose le profit F&I.'),
      elProduits, elTotalFI
    ]) : h('p.ventes-aide' + (!fiDest || (fiDest.courriels && fiDest.courriels.length) ? '.fi' : '.alerte') + '#vente-avis-fi', { text: texteFI });
    var corps = h('div.ventes-form', [
      edition ? h('p.ventes-aide', { text: v.id + ' · ' + (TYPES[v.type] || v.type) + ' · ' + (v.importee ? 'importée du livre' : 'inscrite par ' + (v.declareParNom || v.declarePar || '')) + (v.livre === 'ecrit' ? ' · au livre ligne ' + v.livreLigne : '') + ' · ' + capitale(v.moisLibelle || moisLibelle(moisDeVente(v))) }) : null,
      h('div.grille', [champ('vente-compagnie', 'Concession', selCie), champ('vente-type', 'Type de vente', segType)]),
      h('h4', 'Véhicule'),
      edition ? null : h('div.ventes-vehicule', [champ('vente-recherche', '# stock ou NIV', inRecherche), btnChercher]),
      edition ? null : elTrouve,
      h('div.grille', [champ('vente-vin', 'NIV', inVin), champ('vente-stock', '# Stock', inStock), champ('vente-annee', 'Année', inAnnee), champ('vente-marque', 'Marque', inMarque), champ('vente-modele', 'Modèle', inModele), champ('vente-version', 'Version', inVersion)]),
      h('h4', 'Vente — direction des ventes'),
      h('div.grille', [champ('vente-date', 'Date de vente', inDate), champ('vente-livraison', 'Livraison (prévue)', inLivraison), champ('vente-categorie', 'Catégorie', selCat), champ('vente-conseiller', 'Conseiller', inConseiller), champ('vente-prix', 'Prix de vente', inPrix), champ('vente-paiement', 'Mode de paiement', selPaiement), champ('vente-front', 'Profit front prévu', inFront), champ('vente-accessoires', 'Accessoires ($)', inAccess)]),
      dlConseillers, dlDirecteurs,
      h('h4#vente-titre-client', 'Client'),
      blocClient, blocWholesale,
      titreEchange,
      blocEchange,
      pEchange,
      sectionFI,
      h('div.champ', [h('label', { 'for': 'vente-note', text: 'Note' }), inNote])
    ]);
    function rendreCategories() {
      AMX.vider(selCat);
      (CATEGORIES[type] || []).forEach(function (c) { selCat.appendChild(h('option', { value: c[0], text: c[1], selected: (v.categorie || prefill.categorie) === c[0] ? 'selected' : undefined })); });
    }
    function rendreWholesale() {
      var ws = type === 'wholesale';
      blocWholesale.style.display = ws ? '' : 'none'; blocClient.style.display = ws ? 'none' : '';
      corps.querySelector('#vente-titre-client').textContent = ws ? 'Acheteur (wholesale)' : 'Client';
      titreEchange.style.display = ws ? 'none' : ''; blocEchange.style.display = ws ? 'none' : ''; pEchange.style.display = ws ? 'none' : '';
    }
    function rendrePersonnes(d) {
      AMX.vider(dlConseillers); AMX.vider(dlDirecteurs);
      var noms = {}, nomsD = {};
      if (d && d.personnes) { (d.personnes.conseillers || []).forEach(function (p) { noms[p.nom] = 1; }); (d.personnes.directeurs || []).forEach(function (p) { nomsD[p.nom] = 1; }); }
      if (d && d.nomsConnus) { (d.nomsConnus.conseillers || []).forEach(function (n) { noms[n] = 1; }); (d.nomsConnus.directeurs || []).forEach(function (n) { nomsD[n] = 1; }); }
      if (d && d.fi && d.fi.noms) d.fi.noms.forEach(function (n) { nomsD[n] = 1; });
      Object.keys(noms).sort().forEach(function (n) { dlConseillers.appendChild(h('option', { value: n })); });
      Object.keys(nomsD).sort().forEach(function (n) { dlDirecteurs.appendChild(h('option', { value: n })); });
      if (!inConseiller.value && !edition) inConseiller.value = AMX.session.nom || '';
      var avis = corps.querySelector('#vente-avis-fi');
      if (avis && d && d.fi !== undefined) { var f = d.fi; var ok = f && f.courriels && f.courriels.length; avis.className = 'ventes-aide ' + (ok ? 'fi' : 'alerte'); avis.textContent = ok ? 'Le F&I recevra un courriel pour inscrire son profit F&I et les produits (rappel après 24 h) : ' + (f.noms && f.noms.length ? f.noms : f.courriels).join(', ') + '.' : 'Aucun destinataire F&I pour cette concession : personne ne sera prévenu (Admin › droit « Ventes — F&I »).'; }
    }
    function trouver(texte) {
      var r = chercherVehicule(selCie.value || cie, texte);
      if (!r) return;
      if (r.inconnu) { elTrouve.className = 'ventes-trouve gris'; elTrouve.textContent = (r.vin ? 'NIV ' + r.vin : '# stock ' + r.stock) + ' : pas trouvé dans les neufs ni les registres — remplissez année, marque et modèle à la main (le serveur complétera s\'il le connaît).'; if (r.vin) inVin.value = r.vin; else inStock.value = r.stock; return; }
      inVin.value = r.vin || ''; inStock.value = r.stock || ''; inAnnee.value = r.annee || ''; inMarque.value = r.marque || ''; inModele.value = r.modele || (r.modeleTexte || ''); inVersion.value = r.version || '';
      if (r.coutant !== undefined && r.coutant !== '' && !inCoutant.value) inCoutant.value = r.coutant;
      if (r.type && !edition) { type = r.type; segType.querySelectorAll('button').forEach(function (b) { b.classList.toggle('actif', b.dataset.type === type); }); rendreCategories(); rendreWholesale(); }
      elTrouve.className = 'ventes-trouve'; elTrouve.textContent = ([r.annee, r.marque, r.modele, r.version].filter(Boolean).join(' ') || r.modeleTexte || '') + (r.stock ? ' · # ' + r.stock : '') + ' · ' + r.source + (r.type ? ' → ' + TYPES[r.type] : '');
    }
    var evalEnCours = '';
    function chercherEvaluation(texte, ecraser) {
      var vin = String(texte || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      if (vin.length !== 17) { elEval.className = 'ventes-trouve gris'; elEval.textContent = 'Le NIV de l\'échange a 17 caractères.'; return; }
      if (evalEnCours === vin + (ecraser ? '!' : '')) return; evalEnCours = vin + (ecraser ? '!' : '');
      elEval.className = 'ventes-trouve gris'; elEval.textContent = 'Recherche de l\'évaluation de ' + vin + '…';
      AMX.ventes.evaluation(vin).then(function (e) {
        if (inEchVin.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase() !== vin) return;
        AMX.vider(elEval);
        if (!e.trouve) { elEval.className = 'ventes-trouve alerte'; elEval.appendChild(h('span', { text: 'Pas d\'évaluation pour ce NIV.' })); elEval.appendChild(h('a.btn.petit', { href: AMX.lien('outils', 'evaluation', { vin: vin }), target: '_blank', rel: 'noopener', text: 'Évaluer ce véhicule' })); return; }
        var modele = [e.annee, e.marque, e.modele].filter(Boolean).join(' ');
        if (modele && (ecraser || !inEchModele.value.trim())) inEchModele.value = modele;
        if (e.km !== null && (ecraser || !inEchKm.value.trim())) inEchKm.value = String(Math.round(e.km));
        if (e.acv !== null && (ecraser || !inEchEval.value.trim())) inEchEval.value = String(Math.round(e.acv * 100) / 100);
        evalMeta.le = e.le || ''; evalMeta.par = e.par || '';
        majOver();
        elEval.className = 'ventes-trouve';
        elEval.appendChild(h('span', { text: 'Évaluation importée : ' + (modele || vin) + (e.km !== null ? ' · ' + AMX.fmtNombre(Math.round(e.km)) + ' km' : '') + (e.acv !== null ? ' · valeur d\'achat ' + argent(e.acv) : ' · sans valeur d\'achat') + (e.prixVente !== null ? ' · détail visé ' + argent(e.prixVente) : '') + (e.le ? ' · évaluée le ' + AMX.fmtDate(e.le) : '') + (e.par ? ' par ' + e.par.split('@')[0] : '') }));
        elEval.appendChild(h('a.btn.petit', { href: e.url, target: '_blank', rel: 'noopener', text: 'Ouvrir l\'évaluation' }));
      }, function (err) { if (!elEval.isConnected) return; elEval.className = 'ventes-trouve alerte'; elEval.textContent = 'Évaluation indisponible : ' + AMX.erreurTexte(err); });
    }
    var overAuto = !val(v.overUnder);
    function majOver() {
      var a = nombre(inEchValeur.value), b = nombre(inEchEval.value);
      if (a !== null && b !== null) { var o = Math.round((a - b) * 100) / 100; inOver.placeholder = (o > 0 ? '+' : '') + o + ' (calculé)'; if (overAuto) inOver.value = String(o); }
    }
    inEchValeur.addEventListener('input', majOver); inEchEval.addEventListener('input', majOver); inOver.addEventListener('input', function () { overAuto = !inOver.value.trim(); });
    inEchVin.addEventListener('input', function () { var vin = inEchVin.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase(); if (vin.length === 17) chercherEvaluation(vin, false); });
    inEchVin.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); chercherEvaluation(inEchVin.value, true); } });
    rendreCategories(); rendreWholesale(); rendrePersonnes(rep); majTotalFI();
    selCie.addEventListener('change', function () { cie = selCie.value; AMX.ventes.charger(cie, moisDe('')).then(rendrePersonnes, function () {}); });
    inRecherche.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); trouver(inRecherche.value); } });
    if (!rep && cie) AMX.ventes.charger(cie, moisDe('')).then(function (d) { rendrePersonnes(d); }, function () {});
    if (!edition && (vehicule.vin || vehicule.stock) && !vehicule.modele) setTimeout(function () { trouver(vehicule.vin || vehicule.stock); }, 30);
    if (inEchVin.value.replace(/[^A-Za-z0-9]/g, '').length === 17 && (!edition || !val(v.echangeEvaluation))) setTimeout(function () { chercherEvaluation(inEchVin.value, false); }, 40);
    else if (edition && val(v.echangeEvaluation) !== '') { elEval.className = 'ventes-trouve'; elEval.textContent = 'Évaluation liée : ' + argent(nombre(v.echangeEvaluation)) + (v.echangeEvalLe ? ' · évaluée le ' + AMX.fmtDate(v.echangeEvalLe) : '') + (v.echangeEvalPar ? ' par ' + String(v.echangeEvalPar).split('@')[0] : '') + ' — « Trouver l\'évaluation » la relit.'; }

    var titre = edition ? (peutCompleter && v.statut === 'declaree' ? 'Inscrire les profits F&I — ' + v.id : 'Modifier la vente ' + v.id) : 'Inscrire une vente';
    var m = AMX.modale({
      titre: titre,
      corps: corps, large: true,
      boutons: [{ texte: 'Annuler' }, { texte: edition ? (peutCompleter && v.statut === 'declaree' ? 'Inscrire les profits F&I' : 'Enregistrer') : 'Inscrire la vente', classe: 'primaire', action: function (fermer, btn) {
        var compagnie = (selCie.value || cie || '').toUpperCase();
        if (!compagnie) { AMX.toast('Choisissez la concession.', 'erreur'); selCie.focus(); return false; }
        var vin = inVin.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase(), stock = inStock.value.trim().toUpperCase();
        if (vin && vin.length !== 17) { AMX.toast('Le NIV a 17 caractères (ou laissez-le vide et donnez le # stock).', 'erreur'); inVin.focus(); return false; }
        if (!vin && !stock) { AMX.toast('Il faut le NIV ou le # stock du véhicule.', 'erreur'); inRecherche.focus(); return false; }
        if (type !== 'wholesale' && inClient.value.trim().length < 2) { AMX.toast('Le nom du client est obligatoire.', 'erreur'); inClient.focus(); return false; }
        if (type === 'wholesale' && inVenduA.value.trim().length < 2) { AMX.toast('À qui le véhicule est-il vendu ?', 'erreur'); inVenduA.focus(); return false; }
        if (!inDate.value) { AMX.toast('La date de vente est obligatoire.', 'erreur'); inDate.focus(); return false; }
        var echVin = inEchVin.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        if (echVin && echVin.length !== 17) { AMX.toast('Le NIV de l\'échange a 17 caractères (ou laissez-le vide).', 'erreur'); inEchVin.focus(); return false; }
        var corpsEnvoi = { compagnie: compagnie, type: type, vin: vin, stock: stock, annee: inAnnee.value.trim(), marque: inMarque.value.trim(), modele: inModele.value.trim(), version: inVersion.value.trim(),
          client: inClient.value.trim(), telephone: inTel.value.trim(), courriel: inCourriel.value.trim(), dateVente: inDate.value, dateLivraison: inLivraison.value, categorie: selCat.value, conseiller: inConseiller.value.trim(),
          prixVente: inPrix.value.trim(), paiement: selPaiement.value, profitPrevu: inFront.value.trim(), accessoires: inAccess.value.trim(), overUnder: inOver.value.trim(),
          echangeStock: inEchStock.value.trim(), echangeModele: inEchModele.value.trim(), echangeVin: echVin, echangeKm: inEchKm.value.trim(), echangeValeur: inEchValeur.value.trim(), echangeEvaluation: inEchEval.value.trim(), echangeEvalLe: evalMeta.le, echangeEvalPar: evalMeta.par,
          note: inNote.value.trim(), venduA: inVenduA.value.trim(), acheteDe: inAcheteDe.value.trim(), acheteur: inAcheteur.value.trim(), coutant: inCoutant.value.trim(), source: 'site' };
        if (peutCompleter) Object.assign(corpsEnvoi, { directeur: inDirecteur.value.trim(), profitFIPrevu: inFI.value.trim(), pneus: pneus, produits: lireProduits() });
        corpsEnvoi.action = edition ? 'venteCompleter' : 'venteDeclarer';
        if (edition) corpsEnvoi.id = v.id;
        if (prefill.forcer) corpsEnvoi.forcer = true;
        return AMX.post(corpsEnvoi, { delai: 90000 }).then(function (r) {
          if (r && r.ok === false && r.code === 'DOUBLON' && r.vente) {
            AMX.confirmer('Déjà inscrite', r.erreur + '\n\nInscrire quand même une deuxième vente pour ce véhicule ?', { ok: 'Inscrire quand même' }).then(function (ok) { if (ok) ouvrirFormulaire(Object.assign({}, prefill, { forcer: true, compagnie: compagnie, type: type, vin: vin, stock: stock }), null); else AMX.ventes.poser(r.vente); });
            return true;
          }
          verifierPost(r);
          AMX.ventes.poser(r.vente);
          AMX.toast(r.message || 'Enregistré', r.livre && r.livre.ok === false ? 'erreur' : 'ok', 8000);
          if (r.avisFI && r.avisFI.ok === false) AMX.toast('Aucun courriel au F&I : ' + (r.avisFI.erreur || 'pas de destinataire') + ' — Admin › droit « Ventes — F&I ».', 'erreur', 9000);
          if (!(AMX.courante && AMX.courante.section && AMX.courante.section.id === 'vente' && AMX.courante.onglet && AMX.courante.onglet.id === 'ventes')) {
            if (!edition && !prefill.resterIci) AMX.aller('ventes', 'liste', { id: r.vente.id });
          }
          return true;
        }, function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); return false; });
      } }]
    });
    return m;
  }
})();
