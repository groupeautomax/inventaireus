/* ScanAutomax — Vente › Livre des ventes (21 oct. 2026, v120)
   Maxime : « je cherche à utiliser l'app et le site pour remplir le livre des ventes plutôt que de remplir le
   livre des ventes lui-même. » Puis : « importe les ventes déjà inscrites dans les livres ; un tableau récapitulatif ;
   renomme Ventes en Livre des ventes ; un lien entre la déclaration et l'évaluation de l'échange, qu'on puisse
   l'importer ; indique le mois afférent selon la date d'inscription ; sépare qui inscrit la vente (directeur des
   ventes) et le directeur commercial (F&I) qui inscrit ses profits et les produits — courriel au F&I à chaque
   inscription, rappel après 24 h. »
   Deux vues : Liste (groupée par mois) et Récapitulatif (mois × neufs / occasions / wholesale, conseillers, produits F&I).
   Routes : GET ?ventes=1 (gz) · ?ventesRecap=1 · ?venteId= · ?venteVin= · ?evalVin= ; POST venteDeclarer ·
   venteCompleter · venteAnnuler · venteRenvoyer · venteRelire · venteLivreCreer · venteImporter (Vente.gs). */
(function () {
  'use strict';
  var h = AMX.h, I = AMX.icones;
  var SCRIPT_PAS_A_JOUR = 'Le script n\'est pas à jour (Vente.gs) : redéployez-le.';
  var TYPES = { neuf: 'Neuf', usage: 'Occasion', wholesale: 'Wholesale' };
  var CATEGORIES = {
    neuf: [['stock', 'Stock'], ['locate', 'Locate'], ['commande', 'Commande'], ['demo', 'Démo'], ['courtoisie', 'Courtoisie'], ['fleet', 'Flotte']],
    usage: [['certifie', 'Certifié'], ['noncertifie', 'Non certifié'], ['autremarque', 'Autre marque']],   /* 2 nov. : les rachats de bail, aftersales et accommodations ne vont plus au Livre des ventes */
    wholesale: [['achat', 'Achat revendu'], ['echange', 'Échange revendu']]   /* 3 nov. : les stocks LMB ne vont plus au Livre des ventes (Exclues) */
  };
  /* 3 nov. (Maxime : « un filtre pour le wholesale dans le type d'achat : échange ou achat à la porte (indique Achat) ») :
     onglet Wholesale, pastilles Tous · Échange · Achat selon la catégorie de la vente (filtres.achat). */
  var ACHATS_WHOLESALE = [['', 'Tous'], ['echange', 'Échange'], ['achat', 'Achat']];
  /* 6 nov. (Maxime : « la colonne W confirme si c'est un CPO », occasions de VW) : le serveur lit W « Autre » du livre et donne
     cpoNiveau (petit | gros | cpo) + cpoLibelle ; cpo = le texte du livre. Onglet Occasion : pastille sur la ligne, filtre CPO. */
  var FILTRES_CPO = [['', 'Tous'], ['cpo', 'CPO'], ['petit', 'Petit CPO'], ['gros', 'Gros CPO'], ['non', 'Sans CPO']];
  function niveauCpo(v) { return v && v.type === 'usage' ? String(v.cpoNiveau || '') : ''; }
  function gardeCpo(v, f) { var n = niveauCpo(v); if (f === 'cpo') return !!n; if (f === 'non') return !n; return n === f; }
  function puceCpo(v) {
    var n = niveauCpo(v); if (!n) return null;
    return h('span.puce.ventes-cpo.cpo-' + n, { text: v.cpoLibelle || 'CPO', title: 'Véhicule certifié (CPO) — inscrit au livre : « ' + (v.cpo || v.cpoLibelle) + ' »' });
  }
  /* 26 oct. (Maxime) : chez BMW, « Financement BMW » et « Financement autre » ; « Financement » seul pour les autres concessions
     et les ventes d'avant. */
  var PAIEMENTS = [['financementBmw', 'Financement BMW'], ['financementAutre', 'Financement autre'], ['financement', 'Financement'], ['location', 'Location'], ['comptant', 'Comptant']];
  function paiementsPour(cie, courant) {
    var bmw = String(cie || '').toUpperCase() === 'BMW';
    return PAIEMENTS.filter(function (p) { return p[0] === courant || (bmw ? p[0] !== 'financement' : !/^financement(Bmw|Autre)$/.test(p[0])); });
  }
  var PROVENANCES = [['BMW Canada', 'BMW Canada (acheté de BMW)'], ['Échange', 'Échange (autre concessionnaire)']];
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
    if (periode === 'avenir') return 'avenir';   /* v137 : livraisons des mois suivants (Vente.gs) */
    return periode === 'tout' ? 'tout' : '';
  }
  /* v137 (Maxime, 23 oct. : « un menu simple pour isoler les mois de livraison, le mois courant en premier ; les ventes des mois
     suivants ailleurs, elles apparaissent quand elles seront à livrer ») : la page s'ouvre sur le mois de livraison courant. */
  function moisCourant() { return isoLocal(new Date()).slice(0, 7); }
  function periodeValide(p) { return /^\d{4}(-\d{2})?$/.test(String(p || '')) || p === 'tout' || p === 'avenir'; }
  function moisLibelle(m) { var r = /^(\d{4})-(\d{2})/.exec(m || ''); return r ? MOIS[parseInt(r[2], 10) - 1] + ' ' + r[1] : (m || ''); }
  /* 2 nov. — Mois du manufacturier, comme VENTE_moisManuf_ (Vente.gs) : le dimanche et le lundi qui suivent un samedi du mois
     précédent comptent dans ce mois-là (le lundi 2 nov. 2026 est un RDR d'octobre). Pour les dates RDR seulement. */
  function moisManuf(jour) {
    var x = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(jour || '')); if (!x) return '';
    var a = +x[1], mo = +x[2], d = +x[3], dow = new Date(Date.UTC(a, mo - 1, d)).getUTCDay();
    if ((dow === 0 && d === 1) || (dow === 1 && d <= 2)) { mo -= 1; if (!mo) { mo = 12; a -= 1; } }
    return a + '-' + ('0' + mo).slice(-2);
  }
  function periodeManuf(mois) {
    var x = /^(\d{4})-(\d{2})$/.exec(String(mois || '')); if (!x) return null;
    var iso = function (t) { var z = new Date(t); return z.getUTCFullYear() + '-' + ('0' + (z.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + z.getUTCDate()).slice(-2); };
    var J = 86400000, t0 = Date.UTC(+x[1], +x[2] - 1, 1), t1 = Date.UTC(+x[1], +x[2], 0);
    while (moisManuf(iso(t0)) !== mois) t0 += J;
    while (moisManuf(iso(t1 + J)) === mois) t1 += J;
    var debut = iso(t0), fin = iso(t1);
    return { mois: mois, debut: debut, fin: fin, prolonge: fin.slice(0, 7) !== mois, raccourci: debut.slice(8) !== '01' };
  }
  /* « RDR du 1er oct. au lundi 2 nov. » quand le mois du manufacturier ne suit pas le calendrier, sinon '' */
  function textePeriodeManuf(p) {
    if (!p || (!p.prolonge && !p.raccourci)) return '';
    var J = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    var MC = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    var jr = function (iso, avecJour) { var z = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso), d = +z[3], dow = new Date(Date.UTC(+z[1], +z[2] - 1, d)).getUTCDay();
      return (avecJour ? J[dow] + ' ' : '') + (d === 1 ? '1er' : String(d)) + ' ' + MC[+z[2] - 1]; };
    return 'RDR du ' + jr(p.debut, p.raccourci) + ' au ' + jr(p.fin, p.prolonge) + ' (mois du manufacturier)';
  }
  AMX.moisManuf = moisManuf; AMX.periodeManuf = periodeManuf; AMX.textePeriodeManuf = textePeriodeManuf;
  /* 22 oct. (Maxime) : une vente compte dans le mois de sa LIVRAISON (sinon de sa vente) — le serveur envoie `mois` calculé ainsi. */
  function dateLivraisonOk(v) { return /^\d{4}-\d{2}-\d{2}/.test(String(v.dateLivraison || '')); }
  function moisDeVente(v) { return v.mois || String((dateLivraisonOk(v) ? v.dateLivraison : '') || v.dateVente || v.declareLe || '').slice(0, 7); }
  /* 6 nov. (Maxime : « organiser le livre des ventes pour voir les ventes les plus récentes et non les livraisons ») : la date de
     VENTE d'une vente (sinon le jour où elle a été inscrite). */
  function dateVenteRef(v) { var d = String(v.dateVente || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : String(v.declareLe || '').slice(0, 10); }
  function moisVenteRef(v) { return dateVenteRef(v).slice(0, 7); }
  /* 3 nov. (Maxime : « dans usagé, une grosse case vendu (dans le mois civil) et une autre livraison (livré dans le mois) ») :
     vendue = date de vente dans le mois ; livrée = date de livraison dans le mois et déjà passée. Une vente annulée ne compte pas. */
  function vendueDans(v, m) { return !!m && v.statut !== 'annulee' && String(v.dateVente || '').slice(0, 7) === m; }
  /* 3 nov. (Maxime : « dans les vendues, indiquer les annulées ou refus de crédit en bas du total des ventes, en négatif, et donner le
     compte ») : vendue dans le mois (date de vente) puis annulée (refus de crédit, changé d'idée…) ou refusée (ligne rouge du livre). */
  function annulVendueDans(v, m) { return !!m && String(v.dateVente || '').slice(0, 7) === m && (v.statut === 'annulee' || estRefusee(v)); }
  function livreeDans(v, m) { var l = String(v.dateLivraison || '').slice(0, 10); return !!m && v.statut !== 'annulee' && dateLivraisonOk(v) && l.slice(0, 7) === m && l <= isoLocal(new Date()); }
  /* 1er nov. (Maxime : « ajouter un onglet vente reportée qu'on appelle les commandes vendues ») : vendue, pas encore livrée
     (pas de date de livraison, ou une date à venir), ni annulée, ni comptabilisée, ni wholesale. Au-delà de 120 jours depuis la
     vente (comme « à livrer » du Board), elle est mise à part : souvent une livraison jamais inscrite au livre. */
  var COMMANDES_JOURS = 120;
  function estCommande(v) {
    if (v.statut === 'annulee' || v.statut === 'comptabilisee' || v.type === 'wholesale') return false;
    return !(dateLivraisonOk(v) && String(v.dateLivraison).slice(0, 10) <= isoLocal(new Date()));
  }
  function joursDepuisVente(v) {
    var d = String(v.dateVente || v.declareLe || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
    return Math.max(0, Math.round((Date.parse(isoLocal(new Date())) - Date.parse(d)) / 86400000));
  }
  function ageCommande(v) { var j = joursDepuisVente(v); return j !== null && j <= COMMANDES_JOURS ? 'recentes' : 'vieilles'; }
  var AGES_COMMANDE = [['recentes', 'Moins de ' + COMMANDES_JOURS + ' jours'], ['vieilles', 'Plus de ' + COMMANDES_JOURS + ' jours (à vérifier)'], ['', 'Toutes']];
  function vueDe(ctx) { var o = ctx && ctx.onglet; return o === 'recap' || o === 'commandes' || o === 'exclues' || o === 'refusees' ? o : 'liste'; }
  /* 2 nov. (Maxime : « retire-les mais rends les données disponibles ») : les lignes Aftersale, Accommodation et Rachat de bail
     du livre restent dans ScanAutomax, marquées `horsVente` par le serveur (statut du livre), hors de toutes les ventes et de
     tous les chiffres. Elles se consultent dans la vue « Exclues » (d.horsVentes, même période que la Liste). Ne pas confondre
     avec les « entrées hors vente » (renversement, F&I après-vente, vente à un concessionnaire), qui, elles, comptent. */
  /* 2 nov. : « Retirées » = commandes sans NIV retirées des ventes (Hawkesbury, juillet 2026 et avant — Vente.gs VENTE_retirerCommandes_). */
  /* 3 nov. (Maxime : « les stocks LMB doivent être exclus du livre des ventes ») : marqués « Stock LMB » par le serveur. */
  var SORTES_EX = [['', 'Toutes'], ['aftersale', 'Aftersale'], ['accommodation', 'Accommodation'], ['rachat', 'Rachat de bail'], ['lmb', 'Stocks LMB'], ['retiree', 'Retirées']];
  /* 3 nov. (Maxime : « tout ce qui est en rouge dans le livre des ventes de STM il faut l'enlever du comptage et le mettre dans un
     onglet Refusé ») : une ligne peinte en rouge au livre de Ste-Marie (ou au statut « Refusé ») est marquée par le serveur
     `horsVente` = « Refusée (en rouge au livre) » (Vente.gs VENTE_REFUSEE_) : hors de tous les chiffres comme les exclues, mais
     consultée dans sa propre vue « Refusées » ; la vue « Exclues » ne les montre plus. */
  var SORTES_REF = [['', 'Toutes'], ['refus', 'Refusées'], ['annulee', 'Annulées']];
  function estRefusee(v) { return /^refus/i.test(String((v && v.horsVente) || '')); }
  function sorteRef(v) { return v && v.statut === 'annulee' ? 'annulee' : 'refus'; }
  function sorteEx(v) { var s = String((v && v.horsVente) || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); return /^retir/.test(s) ? 'retiree' : (/\blmb\b/.test(s) ? 'lmb' : (/rachat/.test(s) ? 'rachat' : (/accom/.test(s) ? 'accommodation' : (/after/.test(s) ? 'aftersale' : 'autre')))); }
  function capitale(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  function nombre(x) { if (x === null || x === undefined || x === '') return null; if (typeof x === 'number') return isNaN(x) ? null : x; var s = String(x).replace(/\s| | /g, '').replace(/\$/g, ''); var neg = /^\(.*\)$/.test(s) || s.indexOf('-') >= 0; s = s.replace(/[()\-]/g, ''); var v = s.lastIndexOf(','), pt = s.lastIndexOf('.'); if (v >= 0 && pt >= 0) { if (v > pt) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, ''); } else if (v >= 0) s = s.replace(',', '.'); var n = parseFloat(s); return isNaN(n) ? null : (neg ? -n : n); }
  function argent(n) { return n === null || n === undefined || n === '' || isNaN(n) ? '—' : AMX.fmtArgent(n); }
  function signe(n) { if (n === null || n === undefined || isNaN(n)) return '—'; return (n > 0 ? '+' : '') + AMX.fmtArgent(n); }
  function libCategorie(type, c) { if (c === 'lmb') return 'LMB'; var l = CATEGORIES[type] || []; for (var i = 0; i < l.length; i++) if (l[i][0] === c) return l[i][1]; return c || ''; }
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
  function besoinFI(v) { if (v && v.horsVente) return false; return v.fiAInscrire !== undefined ? !!v.fiAInscrire : (v.statut !== 'annulee' && v.type !== 'wholesale' && fiE(v) === null); }
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
    /* 3 nov. (« plein d'écrits partout ») : tant que la comptabilité n'a rien inscrit, l'estimé seulement. */
    var avecC = !!q.nComptable || !!extra;
    return h('div.kpi.neutre.ventes-comp#' + id, { title: avecC ? '' : 'La comptabilité n\'a encore rien inscrit pour ces ventes' }, [h('div.titre', { text: titre }),
      ligne('Estimé', q.nEstime ? argent(q.estime) : '—', q.nEstime ? String(q.nEstime) : ''),
      avecC ? ligne('Comptable', q.nComptable ? argent(q.comptable) : '—', q.nComptable ? String(q.nComptable) : '') : null,
      avecC ? ligne('Écart', q.nPaires ? signe(q.ecart) : '—', q.nPaires ? 'sur ' + q.nPaires : '', q.nPaires ? classeEcart(q.ecart) : '') : null,
      extra || null]);
  }
  function classeEcart(n) { return n === null || n === undefined || !n ? '' : (n > 0 ? '.ecart-plus' : '.ecart-moins'); }
  /* 26 oct. (Claude Poulin, comptabilité BMW) : ajustements de profit imputés à un mois après celui de la vente. */
  function ajFront(a) { return nombre(a.front) || 0; }
  function ajFI(a) { return nombre(a.fi) || 0; }
  function sommeAj(liste) { var t = { n: 0, front: 0, fi: 0, u: 0 }; liste.forEach(function (a) { t.n++; t.front += ajFront(a); t.fi += ajFI(a); t.u += unitesAj(a); }); t.front = Math.round(t.front * 100) / 100; t.fi = Math.round(t.fi * 100) / 100; return t; }
  /* 28 oct. (Claude Poulin, BMW) : entrées hors vente — renversement (−1 unité), F&I après-vente, vente de neuf à un autre concessionnaire (holdback). */
  var GENRES_HV = { ajustement: ['Ajustement de profit', 'ajustement', 'ajustements'], renversement: ['Renversement', 'renversement', 'renversements'], fiApres: ['F&I après-vente', 'F&I après-vente', 'F&I après-vente'], concession: ['Vente à un concessionnaire', 'vente à un concessionnaire', 'ventes à un concessionnaire'] };
  function genreAj(a) { return GENRES_HV[a && a.genre] ? a.genre : 'ajustement'; }
  function unitesAj(a) { var u = parseInt(a && a.unites, 10); if (isFinite(u)) return u; var g = genreAj(a); return g === 'renversement' ? -1 : (g === 'concession' ? 1 : 0); }
  function texteUnites(u) { return (u > 0 ? '+' : (u < 0 ? '−' : '')) + Math.abs(u) + ' unité' + (Math.abs(u) > 1 ? 's' : ''); }
  function resumeHors(liste, montants) {
    var par = {}; liste.forEach(function (a) { var g = genreAj(a); par[g] = (par[g] || 0) + 1; });
    var t = sommeAj(liste);
    return Object.keys(GENRES_HV).filter(function (g) { return par[g]; }).map(function (g) { return par[g] + ' ' + (par[g] > 1 ? GENRES_HV[g][2] : GENRES_HV[g][1]); }).join(' · ')
      + (t.u ? ' (' + texteUnites(t.u) + ')' : '') + (montants ? ' : front ' + signe(t.front) + ', F&I ' + signe(t.fi) : '');
  }
  function peutAnnulerAj(a) { return AMX.ventes.peutCompta() || (genreAj(a) === 'fiApres' && AMX.ventes.peutCompleter()); }
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
  /* 1er nov. : `vue` = la clé (concession|période) que la page montre. Une réponse qui arrive pour une autre clé (mois quitté,
     lecture plus lente, recherche du haut) ne remplace plus la liste affichée : elle est gardée à part (`autres`, 45 s). */
  var cache = { rep: null, quand: 0, cle: '', copieLe: 0, vue: '', enVol: {}, autres: {} };
  var cacheRecap = { rep: null, quand: 0, cle: '', copieLe: 0, vue: '', enVol: {} };
  function garderAutre(cle, rep, quand) {
    if (!rep || !cle) return;
    cache.autres[cle] = { rep: rep, quand: quand };
    var cles = Object.keys(cache.autres);
    if (cles.length > 4) { cles.sort(function (a, b) { return cache.autres[a].quand - cache.autres[b].quand; }); delete cache.autres[cles[0]]; }
  }
  function poserCache(cle, rep, quand) {
    if (cache.rep && cache.cle && cache.cle !== cle && !cache.copieLe && cache.quand) garderAutre(cache.cle, cache.rep, cache.quand);
    cache.rep = rep; cache.quand = quand; cache.cle = cle; cache.copieLe = 0;
    delete cache.autres[cle];
  }
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
      var cle = cleDe(cie, mois), libre = !cache.vue || cache.vue === cle;   /* libre : cette réponse peut devenir la liste affichée */
      var garde = cache.cle === cle ? cache : cache.autres[cle];
      if (!force && garde && garde.rep && Date.now() - garde.quand < AMX.dureeCopie(45000)) {
        if (garde !== cache && libre) { poserCache(cle, garde.rep, garde.quand); document.dispatchEvent(new CustomEvent('amx:ventes')); }
        return Promise.resolve(garde.rep);
      }
      if (cache.enVol[cle]) return cache.enVol[cle];
      var params = { ventes: 1 }; if (cie) params.compagnie = cie; if (mois) params.mois = mois; if (force === 'relire') params.relire = 1;
      var p = cache.enVol[cle] = AMX.get(params, { gz: true, copie: cleCopie('ventes_', cle), secours: false, delai: 60000 }).then(function (d) {
        if (cache.enVol[cle] === p) delete cache.enVol[cle];
        verifier(d);
        if (!cache.vue || cache.vue === cle) { poserCache(cle, d, Date.now()); document.dispatchEvent(new CustomEvent('amx:ventes')); }
        else garderAutre(cle, d, Date.now());
        return d;
      }, function (e) { if (cache.enVol[cle] === p) delete cache.enVol[cle]; throw e; });
      return p;
    },
    copie: function (cie, mois) { return AMX.cacheLocal.lireGz(cleCopie('ventes_', cleDe(cie, mois)), 7 * 86400000); },
    /* Le tableau récapitulatif d'une année (?ventesRecap=1) : par mois × neufs / occasions / wholesale, conseillers, produits F&I. */
    recap: function (cie, annee, force, type) {
      var cle = cleDe(cie, annee) + (type ? '|' + type : '');
      if (!force && cacheRecap.rep && cacheRecap.cle === cle && Date.now() - cacheRecap.quand < AMX.dureeCopie(45000)) return Promise.resolve(cacheRecap.rep);
      if (cacheRecap.enVol[cle]) return cacheRecap.enVol[cle];
      var params = { ventesRecap: 1 }; if (cie) params.compagnie = cie; if (annee) params.annee = annee; if (type) params.type = type;   /* 3 nov. : un seul type */
      var p = cacheRecap.enVol[cle] = AMX.get(params, { gz: true, copie: cleCopie('ventes_recap_', cle), secours: false, delai: 60000 }).then(function (r) {
        if (cacheRecap.enVol[cle] === p) delete cacheRecap.enVol[cle];
        verifierRecap(r);
        if (!cacheRecap.vue || cacheRecap.vue === cle) { cacheRecap.rep = r; cacheRecap.quand = Date.now(); cacheRecap.cle = cle; cacheRecap.copieLe = 0; }   /* 1er nov. : une année quittée ne remplace pas celle montrée */
        return r;
      }, function (e) { if (cacheRecap.enVol[cle] === p) delete cacheRecap.enVol[cle]; throw e; });
      return p;
    },
    copieRecap: function (cie, annee, type) { return AMX.cacheLocal.lireGz(cleCopie('ventes_recap_', cleDe(cie, annee) + (type ? '|' + type : '')), 7 * 86400000); },
    /* Une vente avec son historique (les grandes listes voyagent sans journal : `sansJournal`). */
    une: function (id) { return AMX.get({ venteId: id }, { secours: false }).then(function (r) { verifierPost(r); return r.vente; }); },
    /* L'évaluation d'un NIV (Outils › Évaluation) — pour l'échange d'une vente. */
    evaluation: function (vin) {
      vin = String(vin || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      if (vin.length !== 17) return Promise.resolve({ trouve: false, vin: vin });
      var demander = AMX.lien('evalPortail', '', { nouvelle: Date.now(), vin: vin });
      /* 2 nov. : un représentant ne lit pas l'évaluation ; il reçoit la valeur confirmée par la direction (sa demande). */
      if (AMX.voitEvaluations && !AMX.voitEvaluations()) {
        if (!AMX.evalDemandes) return Promise.resolve({ trouve: false, vin: vin, urlDemander: demander, portail: true });
        return AMX.evalDemandes.charger(false).then(function (dd) {
          var x = ((dd && dd.demandes) || []).filter(function (y) { return y.vin === vin && y.etat === 'faite' && y.valeur; }).sort(function (a, b) { return String(b.confirmeLe || b.faiteLe || '').localeCompare(String(a.confirmeLe || a.faiteLe || '')); })[0];
          if (!x) return { trouve: false, vin: vin, urlDemander: demander, portail: true };
          return { trouve: true, portail: true, vin: vin, le: x.confirmeLe || x.faiteLe || '', par: x.confirmeParNom || '', km: nombre(x.km), annee: String(x.annee || ''), marque: String(x.marque || ''), modele: String(x.modele || ''), version: '',
            prixAchat: nombre(x.valeur), prixPaye: null, acv: nombre(x.valeur), recon: null, prixVente: null, concession: String(x.compagnie || ''), statut: 'confirmee', url: AMX.lien('evalPortail', '', { id: x.id }) };
        });
      }
      return AMX.get('evalVin=' + encodeURIComponent(vin), { essais: 1 }).then(function (d) {
        if (!d || !d.trouve) return { trouve: false, vin: vin, urlDemander: AMX.lien('outils', 'evaluation', { vin: vin }) };
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
    invalider: function () { cache.quand = 0; cache.autres = {}; cacheRecap.quand = 0; },
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
      cache.autres = {};
      cacheRecap.quand = 0;
      document.dispatchEvent(new CustomEvent('amx:ventes'));
    },
    /* 2 nov. : retirer une vente des ventes (glisser vers la gauche, ou le bouton « Retirer ») — elle va dans Exclues. */
    /* o (facultatif) = { apres: function (vente) } : appelée quand la vente est retirée (ou remise) — le Board s'en sert. */
    retirer: function (v, o) { return modaleRetirer(v, o); },
    glisser: function (tr, v, o) { return boutonRetirer(tr, v, o); },
    remettre: function (v, o) { return remettreVente(v, o); },
    peutRetirer: function (v) { if (!v || v.horsVente) return false; if (!(AMX.ventes.peutCompleter() || AMX.estAdmin())) return false; return v.statut !== 'comptabilisee' || AMX.estAdmin(); },
    peutDeclarer: function () { var p = AMX.session && AMX.session.perms; if (cache.rep && cache.rep.peutDeclarer !== undefined) return !!cache.rep.peutDeclarer; if (p && p.ventesDeclarer !== undefined) return !!p.ventesDeclarer; return AMX.perm('ficheAchat') || AMX.perm('changerStatut') || AMX.estAdmin(); },
    /* Côté F&I : inscrire le profit F&I et les produits (droit « Ventes — F&I », ou l'ancien « compléter »). */
    peutCompleter: function () { var p = AMX.session && AMX.session.perms; if (cache.rep && cache.rep.peutCompleter !== undefined) return !!cache.rep.peutCompleter; if (p && (p.ventesFI || p.ventesCompleter)) return true; if (p && (p.ventesFI !== undefined || p.ventesCompleter !== undefined)) return false; return AMX.perm('modifierMontants') || AMX.estAdmin(); },
    estFI: function () { var p = AMX.session && AMX.session.perms; return !!(p && p.ventesFI); },
    montants: function () { if (cache.rep && cache.rep.montants !== undefined) return !!cache.rep.montants; return AMX.ventes.peutCompleter() || AMX.perm('voirResultats') || AMX.perm('modifierMontants'); },
    compteur: function () { var d = cache.rep; if (!d) return ''; var cie = AMX.compagnieChoisie('inventaire'); var n = d.ventes.filter(function (v) { return v.statut === 'declaree' && (!cie || v.compagnie === cie); }).length; return n || ''; },
    parVin: function (vin) { var d = cache.rep; vin = String(vin || '').toUpperCase(); if (!d || !vin) return null; return d.ventes.filter(function (v) { return v.vin === vin && v.statut !== 'annulee'; })[0] || null; },
    // Ouvrir la fenêtre « Inscrire une vente » depuis n'importe quelle page (ligne d'un neuf, panneau d§AP§une occasion) :
    // prefill = { compagnie, type, vin, stock, annee, marque, modele, version, modeleTexte, coutant, echangeVin }.
    declarer: function (prefill) { return ouvrirFormulaire(prefill || {}, null); },
    modifier: function (v, o) { return ouvrirFormulaire({ apres: o && o.apres }, v); },   /* 26 oct. : la vente, le F&I et la comptabilité ont chacun leur fenêtre. 5 nov. : o.apres(vente) après l'enregistrement (fiche d'achat) */
    completer: function (v) { return ouvrirFI(v); },
    fi: function (v) { return ouvrirFI(v); },
    compta: function (v) { return ouvrirCompta(v); },
    peutCompta: function () { var p = AMX.session && AMX.session.perms; if (cache.rep && cache.rep.peutCompta !== undefined) return !!cache.rep.peutCompta; return !!(p && p.ventesCompta) || AMX.estAdmin(); },
    annuler: function (v) { return modaleAnnuler(v); },
    ouvrir: function (v) { return ouvrirFiche(v); },
    monter: function (conteneur, ctx) { return new VueVentes(conteneur, ctx); }
  };

  function injecterCss() {
    if (document.getElementById('css-ventes')) return;
    var s = document.createElement('style');
    s.id = 'css-ventes';
    s.textContent = [
      '.ventes-page .kpis { margin-bottom: 12px; flex-wrap: wrap; overflow: visible; } .ventes-page .kpis > .kpi { border-bottom: 1px solid var(--ligne); margin-bottom: -1px; }',   /* 26 oct. : les cartes passent à la ligne au lieu de défiler de côté */
      '.ventes-page .kpi.ventes-kpi-civil { min-width: 170px; border-left: 4px solid var(--vert); } .ventes-page .kpi.ventes-kpi-civil .valeur { font-size: 34px; line-height: 1.1; } .ventes-page .kpi.ventes-kpi-civil .libelle { font-size: 15px; font-weight: 700; color: var(--encre); } .ventes-page .kpi.ventes-kpi-civil .sous { font-size: 12px; color: var(--encre-3); margin-top: 2px; }',   /* 3 nov. : grosses cases Vendues / Livrées (Occasion) */
      '.ventes-filtres { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }',
      '.ventes-onglets-type { display: flex; gap: 10px; margin: 2px 0 14px; } .ventes-onglet-type { flex: 1 1 0; display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 56px; padding: 12px 18px; border: 1px solid var(--ligne); border-radius: 12px; background: var(--fond-carte, #fff); color: var(--encre-2); font: inherit; font-size: 18px; font-weight: 700; cursor: pointer; } .ventes-onglet-type:hover { border-color: var(--vert); color: var(--encre); } .ventes-onglet-type.actif { background: var(--vert); border-color: var(--vert); color: #fff; } .ventes-onglet-type .n { font-size: 14px; font-weight: 700; padding: 2px 9px; border-radius: 999px; background: var(--fond, #f2f4f5); color: var(--encre-2); } .ventes-onglet-type.actif .n { background: rgba(255,255,255,.22); color: #fff; } @media (max-width: 640px) { .ventes-onglets-type { gap: 6px; } .ventes-onglet-type { min-height: 46px; padding: 8px 6px; font-size: 15px; gap: 6px; } .ventes-onglet-type .n { font-size: 12px; padding: 1px 7px; } }',   /* 3 nov. : Neuf · Occasion · Wholesale, premier choix de la page */
      '.ventes-filtres input { height: 32px; min-width: 220px; }',
      '.ventes-fi-ligne { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 12.5px; color: var(--encre-3); margin: -4px 0 12px; }',
      '.ventes-fi-ligne.alerte { color: #9A3412; }',
      '.ventes-fi-ligne .puce { font-size: 12px; }',
      '.ventes-table td.vehicule .nom { font-weight: 600; } .ventes-table td.vehicule .vin { font-family: var(--mono); font-size: 12px; color: var(--encre-3); }',
      '.ventes-table td .sous { font-size: 12px; color: var(--encre-3); }',
      '.ventes-table td .sous.a-venir { color: var(--ambre); } .ventes-mois #ventes-selon { margin-right: 8px; }',   /* 6 nov. : rangement par date de vente */
      '.ventes-table tr.annulee td { color: var(--encre-4); text-decoration: line-through; } .ventes-table tr.annulee td .puce, .ventes-table tr.annulee td .btn { text-decoration: none; }',
      '.ventes-table tr.groupe td { background: var(--carte-2); font-weight: 700; font-size: 12.5px; padding: 8px 10px; border-top: 2px solid var(--ligne); }',
      '.ventes-table tr.groupe td .sous { font-weight: 400; margin-left: 8px; }',
      '.ventes-table td.etat { white-space: nowrap; }',
      '.ventes-page .ecart-plus { color: var(--vert); } .ventes-page .ecart-moins { color: var(--rouge); }',
      '.ventes-page .ventes-defile { overflow-x: auto; } .ventes-table td.num, .ventes-table th.num { white-space: nowrap; } .ventes-table td.vehicule { min-width: 170px; }',
      '.ventes-page .ventes-comp { min-width: 250px; } .ventes-comp .titre { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--encre-3); margin-bottom: 4px; }',
      '.ventes-rdr-comp h5 { margin: 12px 0 6px; font-size: 13px; } .ventes-rdr-portail .btn { margin-top: 6px; } .ventes-page .ventes-rdr-portail { min-width: max-content; }',
      '.ventes-rdr-portail .rdr-groupes tr.total th, .ventes-rdr-portail .rdr-groupes tr.total td { font-weight: 800; border-top: 1px solid var(--ligne-forte); } .ventes-rdr-portail .rdr-groupes tr.total th .rdr-cote { color: var(--encre); font-weight: 800; } .ventes-rdr-portail .rdr-groupes tr.demo th .rdr-cote { color: var(--violet); } .ventes-rdr-portail .rdr-groupes tr.flotte th .rdr-cote { color: var(--sarcelle); } .ventes-rdr-portail .rdr-groupes tr.courtoisie th, .ventes-rdr-portail .rdr-groupes tr.courtoisie td { font-style: italic; border-top: 1px dashed var(--ligne); } .ventes-rdr-portail .rdr-groupes tr.courtoisie th .rdr-cote { color: var(--violet); } .ventes-rdr-portail .rdr-groupes th .rdr-cote { font-weight: 500; color: var(--encre-3); } .ventes-rdr-portail button.rdr-num { background: none; border: 0; padding: 0; font: inherit; font-weight: 700; color: var(--bleu); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; } .ventes-rdr-portail td.ecart-moins button.rdr-num { color: var(--rouge); } .ventes-rdr-portail > .sous { margin-top: 4px; font-size: 12px; color: var(--encre-3); } .ventes-rdr-portail .rdr-vieilles { font-weight: 500; font-size: 12px; color: var(--ambre); } .ventes-rdr-portail .rdr-retours { font-weight: 500; font-size: 12px; color: var(--encre-3); white-space: nowrap; } .ventes-rdr-portail .rdr-sous-titre { font-weight: 500; font-size: 12px; color: var(--encre-3); text-transform: none; letter-spacing: 0; } .ventes-rdr-portail tr.rdr-cie th { text-align: left; font-weight: 700; color: var(--encre); padding-top: 8px; } .ventes-rdr-portail .rdr-pied { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 6px; } .ventes-rdr-portail .rdr-pied .sous { font-size: 12px; color: var(--encre-3); } .ventes-rdr-portail .rdr-pied .btn { margin-top: 0; } .ventes-rdr-portail .rdr-groupes th .rdr-cote { color: var(--encre-2); }',   /* 1er nov., soir : détail / flotte, chiffres cliquables */   /* 1er nov. : la carte prend la largeur de son tableau (la colonne Écarts était coupée) */
      '.ventes-moy-table { width: 100%; border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; } .ventes-moy-table th, .ventes-moy-table td { padding: 3px 6px; white-space: nowrap; } .ventes-moy-table thead th { font-size: 12px; font-weight: 600; color: var(--encre-3); text-align: right; border-bottom: 1px solid var(--ligne); } .ventes-moy-table tbody th { text-align: left; font-weight: 600; color: var(--encre-2); } .ventes-moy-table td.num { text-align: right; font-weight: 700; } .ventes-moy-table tr.total th, .ventes-moy-table tr.total td { border-top: 1px solid var(--ligne); } .ventes-moy-table tr.prix td.doux { font-weight: 400; color: var(--encre-3); font-size: 12px; } .ventes-page .ventes-moy { min-width: 330px; }',
      '.ventes-table tr.ajustement.hv-renversement td { background: var(--rouge-bg, #fdecec); } .hv-unites { font-size: 12px; color: var(--encre-3); font-weight: 600; } #hv-genre { margin-bottom: 10px; } ' +
      '.ventes-comp .cmp-aj { margin-top: 4px; padding-top: 4px; border-top: 1px dashed var(--ligne); } .ventes-table tr.ajustement td { background: var(--bleu-bg); } .ventes-table tr.ajustement .nom { font-style: italic; } .ventes-table td.num.avec-aj, .tableau td.num.avec-aj { text-decoration: underline dotted; }',
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
      '.ventes-pneus { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }',
      '.ventes-personne { display: flex; flex-direction: column; gap: 6px; }', '.ventes-pneus .segment { flex: 0 0 auto; } .ventes-pneus input { flex: 1 1 90px; min-width: 90px; text-align: right; }',
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
      /* 26 oct. : fenêtres F&I et Comptabilité, Date RDR */
      '.ventes-resume { margin: 0 0 12px; padding: 8px 12px; background: var(--fond); border-radius: 8px; font-size: 13px; color: var(--encre-2); }',
      '.compta-grille { grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); }',
      '.compta-champ.calcule .saisie.fixe { color: var(--encre-3); font-style: italic; }',
      '.compta-champ.compta-case { display: flex; align-items: flex-end; } .compta-champ.compta-case label.case { font-size: 13.5px; color: var(--encre); font-weight: 600; }',
      '.compta-puces { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; } .compta-puces .btn.actif { background: var(--vert-clair); border-color: var(--vert); color: var(--vert-fonce); }',
      '.ventes-table .sous.rdr { color: var(--vert-fonce); } .ventes-table .sous.rdr.manque { color: var(--ambre); font-weight: 600; }',
      '.ventes-table .sous.retard { color: var(--ambre); font-weight: 600; } #ventes-ages { flex-wrap: wrap; }',
      '.ventes-page .kpi .ventes-calcul { margin-top: 8px; padding-top: 6px; border-top: 1px solid var(--ligne); font-size: 13px; display: grid; gap: 2px; } .ventes-page .kpi .ventes-calcul > div { display: flex; justify-content: space-between; gap: 12px; color: var(--encre-2); } .ventes-page .kpi .ventes-calcul b { font-variant-numeric: tabular-nums; } .ventes-page .kpi .ventes-calcul b.neg { color: var(--rouge); } .ventes-page .kpi .ventes-calcul .ligne-ann.cliquable { cursor: pointer; text-decoration: underline dotted; } .ventes-page .kpi .ventes-calcul .ligne-ann.actif { font-weight: 700; color: var(--rouge); } .ventes-page .kpi .ventes-calcul .net { border-top: 1px solid var(--ligne); padding-top: 2px; color: var(--encre); font-weight: 700; }',   /* 3 nov. : calcul sous « Vendues » */
      '.ventes-achats { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; flex-basis: 100%; } .ventes-achats .tit { font-size: 12px; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; color: var(--encre-3); margin-right: 4px; } #ventes-achats.segment { flex-wrap: wrap; }',
      '#ventes-cpo.segment { flex-wrap: wrap; } .ventes-page .puce.ventes-cpo { background: var(--vert-clair); color: var(--vert-fonce); border-color: transparent; font-weight: 700; white-space: nowrap; } .ventes-page .puce.ventes-cpo.cpo-gros { background: var(--vert-fonce); color: #fff; }',   /* 6 nov. : pastille CPO (VW) */   /* 3 nov. : Type d'achat (Wholesale) */   /* 1er nov. : Commandes vendues */
      '.ventes-table .date-vente { color: var(--encre-3); font-style: italic; }',
      '@media (max-width: 760px) { .ventes-table .col-cons, .ventes-table .col-dir { display: none; } .ventes-produits { grid-template-columns: 1fr; } }'
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
    this.vue = vueDe(ctx);
    this.compagnie = AMX.compagnieChoisie('inventaire');
    this.periode = periodeValide(this.params.mois) ? String(this.params.mois) : moisCourant();
    this.selon = this.params.selon === 'livraison' || this.params.selon === 'vente' ? this.params.selon : (AMX.memo.lire('ventes_selon', 'vente') === 'livraison' ? 'livraison' : 'vente');   /* 6 nov. : rangées par date de vente (défaut) ou de livraison */
    this.avenir = {};   /* nombre de ventes à livrer plus tard, par concession */
    this.annee = String(this.params.annee || AMX.memo.lire('ventes_annee', '') || new Date().getFullYear());
    this.filtres = { etat: this.params.etat || '', type: typeOnglet(this.params.type) || typeOnglet(AMX.memo.lire('ventes_onglet', '')) || 'neuf', drapeau: '', recherche: '', age: 'recentes', achat: '', cpo: '' };
    if (this.filtres.type === 'usage' && FILTRES_CPO.some(function (g) { return g[0] && g[0] === self.params.cpo; })) this.filtres.cpo = self.params.cpo;   /* 6 nov. : filtre CPO (Occasion) */
    if (this.filtres.type === 'wholesale' && (this.params.achat === 'achat' || this.params.achat === 'echange')) this.filtres.achat = this.params.achat;   /* 3 nov. : Type d'achat (Wholesale) */
    this.filtresEx = { genre: '', type: '', recherche: '' };   /* 2 nov. : vue « Exclues » */
    this.filtresRef = { genre: '', type: '', recherche: '' };   /* 3 nov. : vue « Refusées » */
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
  VueVentes.prototype.demonter = function () { cache.vue = ''; cacheRecap.vue = ''; document.removeEventListener('amx:ventes', this.sur); document.removeEventListener('amx:compagnie', this.surCompagnie); document.removeEventListener('amx:profil', this.surProfil); };
  VueVentes.prototype.naviguer = function (ctx) {
    this.params = (ctx && ctx.params) || {};
    var vue = vueDe(ctx);
    if (this.params.etat !== undefined) this.filtres.etat = this.params.etat;
    if (typeOnglet(this.params.type)) this.filtres.type = this.params.type;
    if (periodeValide(this.params.mois)) this.periode = String(this.params.mois);
    if (this.params.selon === 'vente' || this.params.selon === 'livraison') this.selon = this.params.selon;
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
    this.elTitre = h('h1', 'Livre des ventes');
    page.appendChild(h('div.entete-page', [h('div', [this.elTitre, this.elSous]), this.elActions]));
    this.elTypes = h('div.ventes-onglets-type', { role: 'tablist', 'aria-label': 'Type de vente' });
    this.elCies = h('div.barre-cies');
    this.elFi = h('div.ventes-fi-ligne');
    this.elKpis = h('div.kpis');
    this.elFiltres = h('div.ventes-filtres');
    this.elListe = h('div');
    this.elPortee = h('div.portee-chiffres');
    /* v138 : les filtres d'abord, puis ce sur quoi portent les chiffres, les chiffres, la liste. */
    this.elVueListe = h('div.ventes-vue-liste', [this.elFiltres, this.elPortee, this.elKpis, this.elListe]);
    this.elVueRecap = h('div.ventes-recap');
    page.appendChild(this.elTypes); page.appendChild(this.elCies); page.appendChild(this.elFi); page.appendChild(this.elVueListe); page.appendChild(this.elVueRecap);
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
    if (AMX.ventes.peutCompta() || AMX.ventes.peutCompleter()) this.elActions.appendChild(h('button.btn#ventes-hors-vente', { type: 'button', title: 'F&I vendu après la livraison, vente de neuf à un autre concessionnaire — le renversement et l\'ajustement se font dans la fiche de la vente', onclick: function () { ouvrirHorsVente('', null, self.compagnie); } }, [AMX.svg('plus'), ' Hors vente']));
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
      (livre && livre.aCreer && d.admin) ? { texte: 'Créer le livre de ' + nomCie, icone: AMX.svg('plus').outerHTML, action: function () { self.creerLivre(); } } : null,
      (d && (d.peutCompta || d.montants)) ? { texte: 'Dates de livraison SAAQclic', icone: AMX.svg('calendrier') ? AMX.svg('calendrier').outerHTML : '', action: function () { ouvrirSaaq(); } } : null,
      (AMX.ventes.peutCompta() || AMX.ventes.peutCompleter()) ? { texte: 'Entrée hors vente (F&I après-vente, vente à un concessionnaire)…', icone: AMX.svg('plus').outerHTML, action: function () { ouvrirHorsVente('', null, self.compagnie); } } : null
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
    } else if (this.vue === 'commandes') {
      extra = [h('div.ventes-mois', [h('span.doux.petit', { text: 'Vendues, pas encore livrées — tous les mois' })])];
    } else {
      // v137 : un menu des mois de LIVRAISON (le mois courant en premier, puis les 11 précédents, l'année, tout) et, à côté,
      // « À livrer plus tard » : les ventes livrées dans un mois suivant restent là jusqu'à ce que leur mois arrive.
      var mc = moisCourant(), opts = [];
      for (var i = 0; i < 12; i++) { var d0 = new Date(); d0.setDate(1); d0.setMonth(d0.getMonth() - i); var m0 = isoLocal(d0).slice(0, 7); opts.push([m0, capitale(moisLibelle(m0)) + (m0 === mc ? ' — mois courant' : '')]); }
      var an = mc.slice(0, 4);
      opts.push([an, 'Toute l\'année ' + an]); opts.push(['tout', 'Toutes les ventes']);
      if (/^\d{4}(-\d{2})?$/.test(this.periode) && !opts.some(function (o) { return o[0] === self.periode; })) opts.splice(1, 0, [this.periode, capitale(this.periode.length === 4 ? 'Année ' + this.periode : moisLibelle(this.periode))]);
      if (this.periode === 'avenir') opts.unshift(['avenir', 'À livrer plus tard']);
      var parV = this.selon !== 'livraison';
      var selMois = h('select.saisie#ventes-mois', { 'aria-label': parV ? 'Mois de vente' : 'Mois de livraison' }, opts.map(function (o) { return h('option', { value: o[0], text: o[1], selected: o[0] === self.periode ? 'selected' : undefined }); }));
      selMois.addEventListener('change', function () { self.periode = selMois.value; self.rendreCies(); self.charger(false); });
      var nAv = this.avenir[this.compagnie || ''];
      var btnAvenir = h('button.btn.ventes-avenir' + (this.periode === 'avenir' ? '.actif' : ''), { type: 'button', 'aria-pressed': this.periode === 'avenir' ? 'true' : 'false', title: 'Ventes dont la livraison est prévue dans un mois suivant : elles passent dans le mois courant quand leur mois arrive',
        onclick: function () { self.periode = self.periode === 'avenir' ? moisCourant() : 'avenir'; self.rendreCies(); self.charger(false); } }, [h('span', { text: 'À livrer plus tard' }), nAv ? h('b', { text: String(nAv) }) : null]);
      /* 6 nov. : ranger par date de vente (défaut : les ventes les plus récentes) ou par date de livraison (RDR, livraisons du mois). */
      var selon = h('div.segment.petit#ventes-selon', { role: 'group', 'aria-label': 'Ranger les ventes par' }, [['vente', 'Vente'], ['livraison', 'Livraison']].map(function (o) {
        return h('button' + (self.selon === o[0] ? '.actif' : ''), { type: 'button', 'aria-pressed': self.selon === o[0] ? 'true' : 'false', text: o[1],
          title: o[0] === 'vente' ? 'Les ventes faites dans le mois choisi, la plus récente d\'abord (date de livraison dessous)' : 'Les ventes livrées dans le mois choisi (comme le mois du RDR et de la comptabilité)',
          onclick: function () { if (self.selon === o[0]) return; self.selon = o[0]; AMX.memo.ecrire('ventes_selon', o[0]); self.rendreCies(); self.rendre(); } });
      }));
      extra = [h('div.ventes-mois', [h('span.doux.petit', { text: 'Ranger par' }), selon, h('label.doux.petit', { 'for': 'ventes-mois', text: parV && this.periode !== 'avenir' ? 'Mois de vente' : 'Mois de livraison' }), selMois, btnAvenir])];
    }
    AMX.barreConcessions(this.elCies, { domaine: 'inventaire', valeur: this.compagnie, extra: extra,
      compte: function (code) { if (!d || !cache.cle || cache.cle.split('|')[0] !== '') return null; var n = d.ventes.filter(function (v) { return v.statut === 'declaree' && (!code || v.compagnie === code); }).length; return n || null; },
      onchange: function (code) { self.compagnie = code; self.chargerVue(false); } });
  };
  VueVentes.prototype.chargerAvenir = function () {
    var self = this, cie = this.compagnie || '', cle = 'av_' + cie;
    if (this[cle] && Date.now() - this[cle] < 60000) return;
    this[cle] = Date.now();
    var q = { ventes: 1, mois: 'avenir' }; if (cie) q.compagnie = cie;
    AMX.get(q, { secours: false, gz: true, discret: true }).then(function (d) {   // compteur « À livrer plus tard » : lecture de fond
      if (!d || !Array.isArray(d.ventes)) return;
      var n = d.ventes.filter(function (v) { return v.statut !== 'annulee'; }).length;
      if (self.avenir[cie] !== n) { self.avenir[cie] = n; if (self.vue !== 'recap') self.rendreCies(); }
    }, function () {});
  };
  VueVentes.prototype.charger = function (force) {
    var self = this, cie = this.compagnie, mois = this.vue === 'commandes' ? 'tout' : moisDe(this.periode), cle = cleDe(cie, mois);
    cache.vue = cle;
    this.chargerAvenir();
    if (!cache.rep || cache.cle !== cle) {
      if (!cache.autres[cle]) this.attente();   /* 1er nov. : plus la liste du mois quitté sous l'étiquette du nouveau mois */
      AMX.ventes.copie(cie, mois).then(function (o) { if (o && o.donnees && cache.vue === cle && (!cache.rep || cache.cle !== cle)) { try { verifier(o.donnees); cache.rep = o.donnees; cache.cle = cle; cache.quand = 0; cache.copieLe = o.quand; self.rendre(); } catch (e) {} } }).catch(function () {});
    }
    AMX.ventes.charger(cie, mois, force).then(function () { if (cache.vue !== cle) return; self.rendre(); if (force === true) AMX.toast('Livre des ventes mis à jour', 'ok'); }, function (e) {
      if (cache.vue !== cle) return;
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
  /* 3 nov. : les gros onglets Neuf · Occasion · Wholesale — premier choix de la page. Sans nombre (Maxime : « ça porte à
     confusion, on a le détail plus bas »). */
  VueVentes.prototype.choisirType = function (t) {
    if (!typeOnglet(t) || t === this.filtres.type) return;
    this.filtres.type = t; AMX.memo.ecrire('ventes_onglet', t);
    if (t === 'wholesale' && this.filtres.drapeau === 'sansFI') this.filtres.drapeau = '';
    if (t !== 'neuf' && (this.filtres.drapeau === 'rdr' || this.filtres.drapeau === 'sansRdr')) this.filtres.drapeau = '';
    if (t !== 'usage' && (this.filtres.drapeau === 'vendues' || this.filtres.drapeau === 'livrees' || this.filtres.drapeau === 'annulVendues')) this.filtres.drapeau = '';
    if (t !== 'wholesale') this.filtres.achat = '';
    if (t !== 'usage') this.filtres.cpo = '';
    if (this.vue === 'recap') { this.rendreTypes(); this.chargerRecap(false); return; }
    this.rendre();
  };
  VueVentes.prototype.rendreTypes = function () {
    var self = this, el = this.elTypes, t0 = this.filtres.type;
    if (!el) return;
    AMX.vider(el);
    TYPES_ONGLET.forEach(function (t) {
      var actif = t[0] === t0;
      el.appendChild(h('button.ventes-onglet-type' + (actif ? '.actif' : ''), { type: 'button', role: 'tab', 'aria-selected': actif ? 'true' : 'false', 'data-type': t[0], onclick: function () { self.choisirType(t[0]); } }, [h('span.nom', { text: t[1] })]));
    });
  };
  VueVentes.prototype.rendreFi = function () {
    var d = cache.rep, fi = d && d.fi, el = this.elFi;
    AMX.vider(el); el.className = 'ventes-fi-ligne';
    if (!this.compagnie || !d || this.filtres.type === 'wholesale') { el.style.display = 'none'; return; }   /* pas de F&I en wholesale */
    el.style.display = '';
    /* 3 nov. (Maxime : « plein d'écrits partout, faut que ça soit simple ») : la ligne des destinataires du F&I ne paraît plus
       quand tout va bien (les noms restent dans l'infobulle du titre) ; seul l'avis « aucun destinataire » reste à l'écran. */
    if (fi && fi.courriels && fi.courriels.length) {
      el.style.display = 'none';
      if (this.elTitre) this.elTitre.title = 'Vente inscrite → courriel au F&I : ' + (fi.noms && fi.noms.length ? fi.noms : fi.courriels).join(', ') + ' · rappel après 24 h';
    } else {
      el.className += ' alerte';
      el.appendChild(h('span', { text: 'Aucun destinataire F&I pour cette concession : les ventes inscrites ne préviennent personne. Admin › Utilisateurs › donnez le droit « Ventes — F&I » au directeur commercial.' }));
    }
  };

  /* La période choisie n'est pas encore arrivée : chargeur, sans les chiffres de la période d'avant. */
  VueVentes.prototype.attente = function () {
    this.elSous.textContent = 'Lecture du livre…';
    AMX.vider(this.elKpis); AMX.vider(this.elPortee);
    if (!this.elListe.querySelector('.amx-chargeur')) { AMX.vider(this.elListe); this.elListe.appendChild(AMX.chargeur('Livre des ventes')); }
  };
  VueVentes.prototype.rendre = function () {
    var d = cache.rep, self = this;
    this.rendreEntete();
    this.rendreTypes();
    this.rendreFi();
    if (this.vue === 'recap') { this.rendreRecap(); return; }
    if (d && cache.vue && cache.cle !== cache.vue) { this.attente(); return; }
    if (!d) return;
    this.normaliserFiltres();
    var duType = this.base().filter(function (v) { return v.type === self.filtres.type; }), total = duType.length;   /* 3 nov. : seulement le type choisi ; 6 nov. : selon le rangement (vente ou livraison) */
    var n = { declaree: duType.filter(function (v) { return v.statut === 'declaree'; }).length, comptabilisee: duType.filter(function (v) { return v.statut === 'comptabilisee'; }).length, erreurLivre: duType.filter(function (v) { return v.livre === 'erreur'; }).length };
    var copie = cache.copieLe ? 'Copie du ' + AMX.copieTexte(cache.copieLe) + ' — mise à jour en cours… · ' : '';
    var importees = duType.filter(function (v) { return v.importee; }).length;
    if (this.vue === 'exclues' || this.vue === 'refusees') { this.rendreExclues(copie); return; }
    if (this.vue === 'commandes') {   /* 1er nov. : le sous-titre parle des commandes, pas de tout ce qui a été lu */
      var cmd = duType.filter(estCommande), vieilles = cmd.filter(function (v) { return ageCommande(v) === 'vieilles'; }).length, attenteFI = cmd.filter(function (v) { return v.statut === 'declaree'; }).length;
      this.elSous.textContent = copie + (cmd.length ? cmd.length + (cmd.length > 1 ? ' commandes vendues, pas encore livrées' : ' commande vendue, pas encore livrée') + (vieilles ? ' · ' + vieilles + ' de plus de ' + COMMANDES_JOURS + ' jours à vérifier' : '') + (attenteFI ? ' · ' + attenteFI + ' en attente du F&I' : '') : 'Aucune commande vendue en attente de livraison.');
      this.rendreFiltres(); this.rafraichir(); return;
    }
    this.elSous.textContent = copie + (total ? pluriel(total, 'vente') + (n.declaree ? ' · ' + n.declaree + ' en attente du F&I' : '') + (n.comptabilisee ? ' · ' + n.comptabilisee + ' comptabilisée' + (n.comptabilisee > 1 ? 's' : '') : '') + (importees ? ' · ' + importees + ' importée' + (importees > 1 ? 's' : '') + ' du livre' : '') + (n.erreurLivre ? ' · ' + n.erreurLivre + ' pas au livre' : '') : 'Aucune vente inscrite pour cette période.') + (d.relu && d.relu.le && !d.relu.duCache ? ' · livre relu à ' + AMX.fmtDate(d.relu.le, true).replace(/^\S+\s/, '') : '');
    this.rendreFiltres();
    this.rafraichir();
  };
  /* v138 (Maxime : « mettre la barre de recherche et les onglets avant les carrés avec les moyennes ; quand je choisis Au
     livre, le calcul doit changer pour représenter Au livre ») : filtres → « Chiffres et liste : … » → chiffres → liste.
     Les chiffres (moyennes, front, F&I, F&I à inscrire) portent sur les ventes que les filtres gardent ; le nombre d'une
     pastille est ce qu'on verra en la choisissant (les autres filtres appliqués). */
  VueVentes.prototype.rafraichir = function () {
    if ((this.filtres.drapeau === 'vendues' || this.filtres.drapeau === 'livrees') && !this.moisCivil()) this.filtres.drapeau = '';
    this.majCompteurs(); this.rendreTypes(); this.rendrePortee(); this.rendreKpis(); this.rendreListe();
  };
  /* 3 nov. : cases « Vendues » et « Livrées » de l'onglet Occasion, pour un mois précis de la liste. Les ventes vendues dans le
     mois mais livrées un autre mois arrivent à part (venduesAutres) ; elles ne s'ajoutent à la liste que sous « Vendues ». */
  VueVentes.prototype.moisCivil = function () { return this.filtres.type === 'usage' ? this.moisRdr() : ''; };
  VueVentes.prototype.venduesAutres = function () {
    var d = cache.rep; if (!d || !this.moisCivil() || !Array.isArray(d.venduesAutres)) return [];
    var ids = {}; d.ventes.forEach(function (v) { ids[v.id] = 1; });
    return d.venduesAutres.filter(function (v) { return !ids[v.id]; });
  };
  /* Les refusées (ligne rouge) vendues dans le mois : dans les exclues de la période, ou rangées dans un autre mois de livraison. */
  VueVentes.prototype.refuseesMois = function () {
    var d = cache.rep, mc = this.moisCivil(); if (!d || !mc) return [];
    var vus = {}; d.ventes.concat(d.venduesAutres || []).forEach(function (v) { vus[v.id] = 1; });
    return (d.horsVentes || []).concat(d.refuseesAutres || []).filter(function (v) { if (vus[v.id] || !estRefusee(v) || String(v.dateVente || '').slice(0, 7) !== mc) return false; vus[v.id] = 1; return true; });
  };
  /* 6 nov. : rangées par date de VENTE (défaut). Pour un mois, le serveur envoie les ventes livrées dans le mois (ventes) et, à
     part, celles vendues dans le mois mais livrées un autre mois ou pas encore (venduesAutres) : la base = les ventes VENDUES dans
     le mois. Celles livrées dans le mois mais vendues avant ne s'ajoutent que sous la case « Livrées » (Occasion). Pour une année,
     les ventes de l'année de livraison vendues cette année-là ; « Toutes » = tout. « À livrer plus tard » reste par livraison. */
  VueVentes.prototype.parVente = function () { return this.selon !== 'livraison' && this.periode !== 'avenir'; };
  VueVentes.prototype.base = function () {
    var d = cache.rep; if (!d) return [];
    if (!this.parVente() || this.vue === 'commandes') return d.ventes;
    var p = this.periode, vus = {}, out = [];
    var garde = function (v) { var m = moisVenteRef(v); if (p === 'tout') return true; if (/^\d{4}$/.test(p)) return m.slice(0, 4) === p; return m === p; };
    d.ventes.concat(/^\d{4}-\d{2}$/.test(p) && Array.isArray(d.venduesAutres) ? d.venduesAutres : []).forEach(function (v) { if (vus[v.id]) return; vus[v.id] = 1; if (garde(v)) out.push(v); });
    return out;
  };
  /* Les ventes du mois civil rangées ailleurs : vendues dans le mois mais livrées un autre mois (rangement par livraison), ou
     livrées dans le mois mais vendues un autre mois (rangement par vente) — ajoutées seulement sous leur case. */
  VueVentes.prototype.drapeauAutres = function () { return this.parVente() ? 'livrees' : 'vendues'; };
  VueVentes.prototype.autresMois = function () {
    var d = cache.rep; if (!d || !this.moisCivil()) return [];
    if (!this.parVente()) return this.venduesAutres();
    var b = {}; this.base().forEach(function (v) { b[v.id] = 1; });
    return d.ventes.filter(function (v) { return !b[v.id]; });
  };
  VueVentes.prototype.source = function () {
    var d = cache.rep; if (!d) return [];
    var b = this.base();
    if (this.filtres.drapeau === 'annulVendues') return b.concat(this.parVente() ? [] : this.venduesAutres(), this.refuseesMois());
    return this.filtres.drapeau === this.drapeauAutres() ? b.concat(this.autresMois()) : b;
  };
  /* Une vente passe-t-elle les filtres ? `sauf` = le filtre à ne pas appliquer ('etat' ou 'type') pour compter une pastille. */
  VueVentes.prototype.garde = function (v, sauf) {
    var f = this.filtres, q = f.recherche || '';
    if (this.vue === 'commandes') { if (!estCommande(v)) return false; if (sauf !== 'age' && f.age && ageCommande(v) !== f.age) return false; }
    if (sauf !== 'etat' && f.etat && v.statut !== f.etat) return false;
    if (sauf !== 'type' && f.type && v.type !== f.type) return false;
    if (sauf !== 'achat' && f.achat && f.type === 'wholesale' && v.categorie !== f.achat) return false;   /* 3 nov. : Échange ou Achat */
    if (sauf !== 'cpo' && f.cpo && f.type === 'usage' && !gardeCpo(v, f.cpo)) return false;   /* 6 nov. : CPO (VW) */
    if (sauf !== 'drapeau' && f.drapeau === 'sansFI' && !besoinFI(v)) return false;
    if (sauf !== 'drapeau' && f.drapeau === 'erreur' && v.livre !== 'erreur') return false;
    if (sauf !== 'drapeau' && f.drapeau === 'rdr' && !this.estRdr(v)) return false;
    if (sauf !== 'drapeau' && f.drapeau === 'sansRdr' && !this.sansRdr(v)) return false;
    if (sauf !== 'drapeau' && f.drapeau === 'vendues' && !vendueDans(v, this.moisCivil())) return false;
    if (sauf !== 'drapeau' && f.drapeau === 'livrees' && !livreeDans(v, this.moisCivil())) return false;
    if (sauf !== 'drapeau' && f.drapeau === 'annulVendues' && !annulVendueDans(v, this.moisCivil())) return false;
    if (q && !AMX.correspond([v.client, v.noClient, v.venduA, v.vin, v.stock, v.conseiller, v.directeur, vehiculeTexte(v), v.id, v.echangeModele, v.echangeVin, v.cpoLibelle, v.cpo], q)) return false;   /* v138 : AMX.correspond ; 6 nov. : « cpo » trouve les CPO */
    return true;
  };
  VueVentes.prototype.ajustementsVisibles = function () {
    var d = cache.rep, f = this.filtres, q = f.recherche || '';
    if (this.vue === 'commandes') return [];
    if (!d || !Array.isArray(d.ajustements) || f.drapeau || (f.etat && f.etat !== 'comptabilisee')) return [];
    return d.ajustements.filter(function (a) {
      if (a.annule) return false;
      if (f.type && a.type !== f.type) return false;
      if (f.achat && f.type === 'wholesale' && a.categorie !== f.achat) return false;
      if (f.cpo && f.type === 'usage') return false;   /* 6 nov. : une entrée hors vente n'a pas de CPO */
      if (q && !AMX.correspond([a.client, a.vin, a.stock, a.vehicule, a.venteId, a.id, a.raison], q)) return false;
      return true;
    });
  };
  VueVentes.prototype.visibles = function () {
    var d = cache.rep, self = this; if (!d) return [];
    return this.source().filter(function (v) { return self.garde(v); });
  };
  /* « F&I à inscrire » et « Pas au livre » se combinent avec l'onglet d'état (Au livre + F&I à inscrire) ; une adresse
     d'avant (?etat=sansFI, depuis l'Accueil ou le récapitulatif) est remise dans `drapeau`. */
  VueVentes.prototype.normaliserFiltres = function () {
    var f = this.filtres;
    if (f.etat === 'sansFI' || f.etat === 'erreur' || f.etat === 'rdr' || f.etat === 'sansRdr' || f.etat === 'vendues' || f.etat === 'livrees') { f.drapeau = f.etat; f.etat = ''; }
    if (['sansFI', 'erreur', 'rdr', 'sansRdr', 'vendues', 'livrees', 'annulVendues'].indexOf(f.drapeau) < 0) f.drapeau = '';
  };
  /* 26 oct. (Maxime : « il faut aussi un compteur de RDR du mois et la date est dans le livre des ventes ») : la Date RDR vient du
     livre. « RDR du mois » = Date RDR dans le mois affiché ; « sans RDR » = neuf livré dans le mois sans Date RDR, seulement pour
     les concessions qui inscrivent leurs RDR (le serveur les nomme dans rdr.cies). */
  VueVentes.prototype.moisRdr = function () { return this.vue !== 'commandes' && /^\d{4}-\d{2}$/.test(String(this.periode || '')) ? this.periode : ''; };
  VueVentes.prototype.estRdr = function (v) { var m = this.moisRdr(); return !!m && v.statut !== 'annulee' && !!v.dateRdr && moisManuf(v.dateRdr) === m; };   /* mois du manufacturier (2 nov.) */
  VueVentes.prototype.sansRdr = function (v) { var m = this.moisRdr(), d = cache.rep, cies = d && d.rdr && d.rdr.cies ? d.rdr.cies : []; return !!m && v.statut !== 'annulee' && v.type === 'neuf' && !v.dateRdr && dateLivraisonOk(v) && moisDeVente(v) === m && cies.indexOf(v.compagnie) >= 0; };
  /* Les nombres des pastilles : état (sans le filtre d'état), type (sans le filtre de type), F&I à inscrire / pas au livre
     (sans ce drapeau) — chaque nombre est ce qu'on verra en cliquant. */
  VueVentes.prototype.compteurs = function () {
    var d = cache.rep, self = this, e = { '': 0, declaree: 0, completee: 0, comptabilisee: 0, annulee: 0, erreur: 0, sansFI: 0, rdr: 0, sansRdr: 0, vendues: 0, livrees: 0, venduesAutres: 0, annulVendues: 0 }, t = { '': 0, neuf: 0, usage: 0, wholesale: 0 }, a = { '': 0, recentes: 0, vieilles: 0 }, ach = { '': 0, echange: 0, achat: 0 }, cp = { '': 0, cpo: 0, petit: 0, gros: 0, non: 0, connu: 0 };
    if (!d) return { etat: e, type: t, age: a, achat: ach, cpo: cp };
    var mc = this.moisCivil(), pv = this.parVente(), b = this.base(), autres = this.autresMois(), avecAutres = this.filtres.drapeau === this.drapeauAutres();
    e.livreesAutres = 0;
    b.concat(autres).forEach(function (v, i) {
      var autre = i >= b.length;   /* rangée ailleurs : vendue dans le mois et livrée un autre mois, ou l'inverse (6 nov.) */
      if (autre && self.garde(v, 'drapeau')) {
        if (pv) { if (livreeDans(v, mc)) { e.livrees++; e.livreesAutres++; } }
        else if (vendueDans(v, mc)) { e.vendues++; e.venduesAutres++; }
      }
      if (autre && !avecAutres) return;   /* ailleurs, elles ne sont pas dans la liste du mois */
      if (self.vue === 'commandes' && self.garde(v, 'age')) { a['']++; a[ageCommande(v)]++; }
      if (self.garde(v, 'etat')) { e['']++; if (e[v.statut] !== undefined) e[v.statut]++; }
      if (self.garde(v, 'type')) { t['']++; if (t[v.type] !== undefined) t[v.type]++; }
      if (self.filtres.type === 'wholesale' && self.garde(v, 'achat')) { ach['']++; if (ach[v.categorie] !== undefined) ach[v.categorie]++; }
      if (self.filtres.type === 'usage' && self.garde(v, 'cpo')) { var nc = niveauCpo(v); cp['']++; if (nc) { cp.cpo++; if (cp[nc] !== undefined) cp[nc]++; } else cp.non++; if (v.type === 'usage' && (v.cpo || nc)) cp.connu++; }
      if (!autre && self.garde(v, 'drapeau')) { if (v.livre === 'erreur') e.erreur++; if (besoinFI(v)) e.sansFI++; if (self.estRdr(v)) e.rdr++; if (self.sansRdr(v)) e.sansRdr++; if (vendueDans(v, mc)) e.vendues++; if (livreeDans(v, mc)) e.livrees++; }
    });
    if (mc) { var vusA = {}; b.concat(pv ? [] : autres, this.refuseesMois()).forEach(function (v) { if (vusA[v.id]) return; vusA[v.id] = 1; if (self.garde(v, 'drapeau') && annulVendueDans(v, mc)) e.annulVendues++; }); }
    return { etat: e, type: t, age: a, achat: ach, cpo: cp };
  };
  var ETATS_VENTE = [['', 'Toutes'], ['declaree', 'Attente F&I'], ['completee', 'Au livre'], ['comptabilisee', 'Comptabilisées'], ['annulee', 'Annulées']];
  var TYPES_VENTE = [['', 'Tous'], ['neuf', 'Neufs'], ['usage', 'Occasions'], ['wholesale', 'Wholesale']];
  /* 3 nov. (Maxime : « dans les livres des ventes, il faut choisir en premier neuf, occasion ou wholesale en gros onglet, pour
     après choisir le reste ; quand on choisit un onglet, on ne veut pas voir les données d'un autre onglet ») : le type est le
     premier choix de la page, jamais « Tous » ; liste, chiffres, commandes, exclues, refusées et récapitulatif ne montrent que lui.
     Le choix est gardé sur l'appareil (memo ventes_onglet). */
  var TYPES_ONGLET = [['neuf', 'Neuf'], ['usage', 'Occasion'], ['wholesale', 'Wholesale']];
  function typeOnglet(t) { return t === 'neuf' || t === 'usage' || t === 'wholesale' ? t : ''; }
  function libelleTypeOnglet(t) { var x = TYPES_ONGLET.filter(function (y) { return y[0] === t; })[0]; return x ? x[1] : ''; }
  function libelleEtatVente(e) { if (e === 'sansFI') return 'F&I à inscrire'; if (e === 'vendues') return 'Vendues dans le mois'; if (e === 'livrees') return 'Livrées dans le mois'; if (e === 'annulVendues') return 'Annulées ou refus de crédit (vendues dans le mois)'; if (e === 'erreur') return 'Pas au livre'; if (e === 'rdr') return 'RDR du mois'; if (e === 'sansRdr') return 'Neufs livrés sans RDR'; for (var i = 0; i < ETATS_VENTE.length; i++) if (ETATS_VENTE[i][0] === e) return ETATS_VENTE[i][1]; return e; }
  /* La barre de filtres, dessinée une fois par rendu : la recherche garde le curseur, les nombres changent sur place. */
  VueVentes.prototype.rendreFiltres = function () {
    var self = this, ui2 = AMX.ui2 && AMX.ui2();
    AMX.vider(this.elFiltres);
    this.elFiltres.classList.toggle('inv2-filtres', !!ui2);
    this.nbEtat = {}; this.nbType = {}; this.nbAge = {}; this.nbAchat = {}; this.nbCpo = {};
    var commandes = this.vue === 'commandes';
    var segAchat = !commandes && this.filtres.type === 'wholesale' ? this.filtreAchat(ui2) : null;   /* 3 nov. : Type d'achat */
    var segCpo = this.filtres.type === 'usage' && this.avecCpo() ? this.filtreCpo(ui2) : null;   /* 6 nov. : CPO (le livre de VW le dit) */
    var segAge = commandes ? h('div.segment#ventes-ages', { role: 'group', 'aria-label': 'Vendue depuis' }, AGES_COMMANDE.map(function (g) { var b = h('span.n', { text: '0' }); self.nbAge[g[0]] = b; var actif = (self.filtres.age || '') === g[0]; return h('button' + (actif ? '.actif' : ''), { type: 'button', 'data-age': g[0], 'aria-pressed': actif ? 'true' : 'false', onclick: function () { self.filtres.age = g[0]; self.rendre(); } }, [g[1], b]); })) : null;
    var rech = h('input.saisie#ventes-recherche', { type: 'search', placeholder: 'Client, NIV, # stock, conseiller…', value: this.filtres.recherche, 'aria-label': 'Chercher une vente' });
    rech.addEventListener('input', function () { self.filtres.recherche = rech.value; self.rafraichir(); });
    if (ui2) {
      // Recherche, puis l'état de la vente en pastilles (avec leur nombre), puis le type.
      var pas = h('div.inv2-statuts', { role: 'group', 'aria-label': 'État de la vente' }, ETATS_VENTE.filter(function (e) { return !(e[0] === 'declaree' && self.filtres.type === 'wholesale' && self.filtres.etat !== 'declaree'); }).map(function (e) {
        var actif = (self.filtres.etat || '') === e[0], b = h('b', { text: '0' }); self.nbEtat[e[0]] = b;
        return h('button.inv2-pastille' + (actif ? '.actif' : ''), { type: 'button', 'data-etat': e[0], 'aria-pressed': actif ? 'true' : 'false', onclick: function () { self.filtres.etat = e[0]; self.rendre(); } }, [h('span', { text: e[1] }), b]);
      }));
      this.elFiltres.appendChild(h('div.recherche.inv2-recherche', [h('span', { html: AMX.icones.recherche }), rech]));
      this.elFiltres.appendChild(pas);
      if (segAge) this.elFiltres.appendChild(segAge);
      if (segAchat) this.elFiltres.appendChild(segAchat);
      if (segCpo) this.elFiltres.appendChild(segCpo);
      return;
    }
    if (segAge) this.elFiltres.appendChild(segAge); if (segAchat) this.elFiltres.appendChild(segAchat); if (segCpo) this.elFiltres.appendChild(segCpo); this.elFiltres.appendChild(rech);
    if (typeof XLSX !== 'undefined') this.elFiltres.appendChild(h('button.btn.petit#ventes-export', { type: 'button', onclick: function () { self.exporter(); } }, [AMX.svg('telecharger'), ' Excel']));
  };
  VueVentes.prototype.majCompteurs = function () {
    var c = this.compteurs(), self = this;
    this.nbCompte = c;
    Object.keys(this.nbEtat || {}).forEach(function (k) { self.nbEtat[k].textContent = String(c.etat[k] || 0); });
    Object.keys(this.nbType || {}).forEach(function (k) { self.nbType[k].textContent = String(c.type[k] || 0); });
    Object.keys(this.nbAge || {}).forEach(function (k) { self.nbAge[k].textContent = String((c.age || {})[k] || 0); });
    Object.keys(this.nbAchat || {}).forEach(function (k) { self.nbAchat[k].textContent = String((c.achat || {})[k] || 0); });
    Object.keys(this.nbCpo || {}).forEach(function (k) { self.nbCpo[k].textContent = String((c.cpo || {})[k] || 0); });
  };
  /* 3 nov. : « Type d'achat » de l'onglet Wholesale — Tous · Échange · Achat (achat à la porte, encan…), avec leur nombre. */
  VueVentes.prototype.filtreAchat = function (ui2) {
    var self = this, f = this.filtres;
    var boutons = ACHATS_WHOLESALE.map(function (g) {
      var actif = (f.achat || '') === g[0], b = h(ui2 ? 'b' : 'span.n', { text: '0' }); self.nbAchat[g[0]] = b;
      return h((ui2 ? 'button.inv2-pastille' : 'button') + (actif ? '.actif' : ''), { type: 'button', 'data-achat': g[0], 'aria-pressed': actif ? 'true' : 'false', onclick: function () { self.filtres.achat = g[0]; self.rendre(); } }, ui2 ? [h('span', { text: g[1] }), b] : [g[1] + ' ', b]);
    });
    if (!ui2) return h('div.segment#ventes-achats', { role: 'group', 'aria-label': 'Type d\'achat' }, boutons);
    return h('div.ventes-achats#ventes-achats', { role: 'group', 'aria-label': 'Type d\'achat' }, [h('span.tit', { text: 'Type d\'achat' })].concat(boutons));
  };
  /* 6 nov. : le filtre CPO ne paraît que si une occasion de la période porte un CPO lu dans le livre (VW). */
  VueVentes.prototype.avecCpo = function () { var d = cache.rep; return !!(d && (d.ventes || []).some(function (v) { return v.type === 'usage' && (v.cpoNiveau || v.cpo); })) || !!this.filtres.cpo; };
  VueVentes.prototype.filtreCpo = function (ui2) {
    var self = this, f = this.filtres;
    var boutons = FILTRES_CPO.map(function (g) {
      var actif = (f.cpo || '') === g[0], b = h(ui2 ? 'b' : 'span.n', { text: '0' }); self.nbCpo[g[0]] = b;
      return h((ui2 ? 'button.inv2-pastille' : 'button') + (actif ? '.actif' : ''), { type: 'button', 'data-cpo': g[0], 'aria-pressed': actif ? 'true' : 'false', onclick: function () { self.filtres.cpo = g[0]; self.rendre(); } }, ui2 ? [h('span', { text: g[1] }), b] : [g[1] + ' ', b]);
    });
    var titre = 'Certifié (CPO) — lu dans le livre des ventes';
    if (!ui2) return h('div.segment#ventes-cpo', { role: 'group', 'aria-label': titre, title: titre }, boutons);
    return h('div.ventes-achats#ventes-cpo', { role: 'group', 'aria-label': titre, title: titre }, [h('span.tit', { text: 'CPO' })].concat(boutons));
  };
  VueVentes.prototype.rendrePortee = function () {
    var self = this, f = this.filtres, liste = this.visibles(), q = (f.recherche || '').trim();
    if (!this.elPortee) return;
    AMX.porteeChiffres(this.elPortee, { n: liste.length, unite: ['vente', 'ventes'],
      contexte: [libelleTypeOnglet(f.type), this.vue === 'commandes' ? 'Commandes vendues, pas encore livrées' : this.periode === 'avenir' ? 'À livrer plus tard' : (this.periode === 'tout' ? 'Toutes les périodes' : capitale(this.periode.length === 4 ? 'année ' + this.periode : moisLibelle(this.periode)) + (this.parVente() ? ' · vendues' : ' · livrées')), this.compagnie ? (AMX.COMPAGNIES_TOUTES[this.compagnie] || this.compagnie) : ''],
      filtres: [this.vue === 'commandes' && f.age ? (AGES_COMMANDE.filter(function (g) { return g[0] === f.age; })[0] || ['', ''])[1].toLowerCase() : '', f.etat ? libelleEtatVente(f.etat) : '', f.drapeau ? libelleEtatVente(f.drapeau) : '', f.achat && f.type === 'wholesale' ? (f.achat === 'achat' ? 'Achats' : 'Échanges') : '', f.cpo && f.type === 'usage' ? (FILTRES_CPO.filter(function (g) { return g[0] === f.cpo; })[0] || ['', ''])[1] : '', q ? '« ' + q + ' »' : ''],
      effacer: function () { self.filtres = { etat: '', type: self.filtres.type, drapeau: '', recherche: '', age: '', achat: '', cpo: '' }; self.rendre(); } });
  };
  VueVentes.prototype.rendreKpis = function () {
    var self = this, d = cache.rep, ui2 = AMX.ui2 && AMX.ui2(), c = this.nbCompte || this.compteurs(), sansFI = this.filtres.type === 'wholesale';
    AMX.vider(this.elKpis);
    if (!d) return;
    var kpi = function (etat, libelle, valeur, cls) {
      var champ = (etat === 'sansFI' || etat === 'erreur' || etat === 'rdr' || etat === 'sansRdr' || etat === 'vendues' || etat === 'livrees' || etat === 'annulVendues') ? 'drapeau' : 'etat', actif = self.filtres[champ] === etat;
      return h('div.kpi' + (cls ? '.' + cls : '') + (actif ? '.actif' : ''), { role: 'button', tabindex: '0', 'data-etat': etat, 'aria-pressed': actif ? 'true' : 'false', onclick: function () { self.filtres[champ] = actif ? '' : etat; self.rendre(); } }, [h('div.valeur', { text: String(valeur || 0) }), h('div.libelle', { text: libelle })]);
    };
    /* v133 : en ui2, les états sont des pastilles dans la barre de filtres ; ici, l'ancienne interface garde ses tuiles. */
    if (!ui2) {
      if (!sansFI) this.elKpis.appendChild(kpi('declaree', 'Attente F&I', c.etat.declaree, c.etat.declaree ? 'alerte' : ''));
      this.elKpis.appendChild(kpi('completee', 'Au livre', c.etat.completee, ''));
      this.elKpis.appendChild(kpi('comptabilisee', 'Comptabilisées', c.etat.comptabilisee, ''));
      this.elKpis.appendChild(kpi('annulee', 'Annulées', c.etat.annulee, ''));
    }
    if (c.etat.erreur || this.filtres.drapeau === 'erreur') this.elKpis.appendChild(kpi('erreur', 'Pas au livre', c.etat.erreur, 'alerte'));
    if (d.montants) {
      // Les montants portent sur les ventes gardées par les filtres, annulées exclues (sauf si on regarde les annulées).
      var vues = this.visibles(), actives = this.filtres.etat === 'annulee' ? vues : vues.filter(function (v) { return v.statut !== 'annulee'; });
      var nAnnulees = vues.length - actives.length;
      var cp = cumulProfits(actives);
      var moy = function (q) { return { e: q.nEstime ? q.estime / q.nEstime : null, c: q.nComptable ? q.comptable / q.nComptable : null }; };
      var prixL = actives.map(function (v) { return nombre(v.prixVente); }).filter(function (x) { return x !== null && x > 0; });
      /* 26 oct. (Maxime : « aligne bien les colonnes des moyennes … un petit tableau avec des colonnes verticales ») : un tableau
         Estimé · Comptable · Écart ; l'écart moyen est pris sur les ventes qui ont les deux (estimé et comptable). */
      var cellule = function (x, n, cls) { return h('td.num' + (cls || ''), { text: x === null ? '—' : argent(Math.round(x)), title: n ? 'sur ' + pluriel(n, 'vente') : '' }); };
      /* 3 nov. : les colonnes Comptable et Écart ne paraissent que si la comptabilité a inscrit quelque chose */
      var avecC = !!(cp.front.nComptable || (cp.fi && cp.fi.nComptable));
      var rangee = function (l, q, cls) {
        var e = q.nEstime ? q.estime / q.nEstime : null, c = q.nComptable ? q.comptable / q.nComptable : null, d = q.nPaires ? q.ecart / q.nPaires : null;
        return h('tr' + (cls || ''), [h('th', { scope: 'row', text: l }), cellule(e, q.nEstime)].concat(avecC ? [cellule(c, q.nComptable), h('td.num' + (d === null ? '' : classeEcart(d)), { text: d === null ? '—' : signe(Math.round(d)), title: q.nPaires ? 'comptable − estimé, sur ' + pluriel(q.nPaires, 'vente') + ' qui ont les deux' : '' })] : []));
      };
      var prixMoy = prixL.length ? prixL.reduce(function (a, b) { return a + b; }, 0) / prixL.length : null;
      var titreMoy = 'Moyennes par unité · ' + pluriel(actives.length, 'vente');
      var carteMoy = h('div.kpi.neutre.ventes-comp.ventes-moy#ventes-kpi-moyennes', { title: nAnnulees ? nAnnulees + ' vente(s) annulée(s) exclue(s) des montants' : '' }, [h('div.titre', { text: titreMoy }),
        h('table.ventes-moy-table', [
          h('thead', [h('tr', [h('th', { text: '' }), h('th.num', { text: 'Estimé' })].concat(avecC ? [h('th.num', { text: 'Comptable' }), h('th.num', { text: 'Écart' })] : []))]),
          h('tbody', (sansFI ? [rangee('Profit', cp.front, '.total')] : [rangee('Front', cp.front), rangee('F&I', cp.fi), rangee('Total', cp, '.total')]).concat([   /* 1er nov. (Maxime) : pas de F&I en wholesale */
            prixMoy !== null ? h('tr.prix', [h('th', { scope: 'row', text: 'Prix' }), cellule(prixMoy, prixL.length), avecC ? h('td.num.doux', { colspan: '2', text: 'sur ' + prixL.length + ' prix' }) : null]) : null]))
        ])]);
      this.elKpis.insertBefore(carteMoy, this.elKpis.firstChild);
      /* 26 oct. : les ajustements imputés à la période s'ajoutent au comptable (le profit balance avec les résultats du mois). */
      var sa = sommeAj(this.ajustementsVisibles());
      var extraAj = function (montant, compta, n) {
        if (!sa.n || !montant) return null;
        return h('div.cmp-aj', [h('div.cmp-ligne', { title: 'Entrées hors vente imputées à la période : ajustements, renversements, F&I après-vente, ventes à un concessionnaire' }, [h('span.l', { text: 'Hors vente' }), h('span.v' + classeEcart(montant), { text: signe(montant) }), h('span.n', { text: String(sa.n) })]),
          h('div.cmp-ligne.total', { title: 'Comptable + hors vente' }, [h('span.l', { text: 'Avec hors vente' }), h('span.v', { text: argent(Math.round((compta + montant) * 100) / 100) }), h('span.n', { text: n ? String(n) : '' })])]);
      };
      this.elKpis.appendChild(carteComparaison('ventes-kpi-front', sansFI ? 'Profit' : 'Front (voiture)', cp.front, extraAj(sa.front, cp.front.comptable, cp.front.nComptable)));
      if (!sansFI) this.elKpis.appendChild(carteComparaison('ventes-kpi-fi', 'F&I', cp.fi, extraAj(sa.fi, cp.fi.comptable, cp.fi.nComptable)));
    }
    /* 28 oct. : les unités hors vente (renversement −1, vente à un concessionnaire +1) — pour balancer avec les résultats du mois. */
    var hv = this.ajustementsVisibles(), shv = sommeAj(hv);
    if (shv.n) {
      var nVentes = this.visibles().filter(function (v) { return v.statut !== 'annulee'; }).length;
      this.elKpis.appendChild(h('div.kpi.neutre#ventes-kpi-hors', { title: resumeHors(hv, !!d.montants) }, [h('div.valeur', { text: String(nVentes + shv.u) }), h('div.libelle', { text: 'Unités nettes' }),
        h('div.sous', { text: pluriel(nVentes, 'vente') + (shv.u ? ' ' + (shv.u > 0 ? '+ ' : '− ') + pluriel(Math.abs(shv.u), 'unité') + ' hors vente' : '') + ' · ' + pluriel(shv.n, 'entrée') + ' hors vente' })]));
    }
    /* 3 nov. (Maxime : « dans usagé, une grosse case vendu (dans le mois civil) et une autre livraison (livré dans le mois), à côté
       de F&I à remplir ») : deux grosses cases, cliquables comme « F&I à inscrire ». */
    var mc = this.moisCivil();
    if (mc) {
      var nomMois = moisLibelle(mc), avant = !Array.isArray(d.venduesAutres);
      var tV = kpi('vendues', 'Vendues', c.etat.vendues, 'ventes-kpi-civil');
      tV.id = 'ventes-kpi-vendues';
      tV.appendChild(h('div.sous', { text: 'date de vente en ' + nomMois + (!this.parVente() && c.etat.venduesAutres ? ' · dont ' + c.etat.venduesAutres + ' livrée' + (c.etat.venduesAutres > 1 ? 's' : '') + ' un autre mois ou pas encore' : '') }));
      /* 3 nov. : sous le total, les annulées et refus de crédit en négatif, puis le compte net (= la grosse valeur). */
      var nAnn = c.etat.annulVendues || 0, actifAnn = this.filtres.drapeau === 'annulVendues';
      var lAnn = h('div.ligne-ann' + (nAnn ? '.cliquable' : '') + (actifAnn ? '.actif' : ''), nAnn ? { role: 'button', tabindex: '0', title: 'Voir les ventes du mois annulées ou refusées', onclick: function (e) { e.stopPropagation(); self.filtres.drapeau = actifAnn ? '' : 'annulVendues'; self.rendre(); } } : {}, [h('span', { text: 'Annulées / refus de crédit' }), h('b.neg', { text: nAnn ? '−' + nAnn : '0' })]);
      tV.appendChild(h('div.ventes-calcul', { 'aria-label': 'Calcul des ventes du mois' }, [
        h('div', [h('span', { text: 'Total des ventes' }), h('b', { text: String((c.etat.vendues || 0) + nAnn) })]),
        lAnn,
        h('div.net', [h('span', { text: 'Ventes nettes' }), h('b', { text: String(c.etat.vendues || 0) })])
      ]));
      if (avant && nAnn === 0) lAnn.title = 'Redéployez le script pour compter aussi les refusées rangées dans un autre mois.';
      if (avant) tV.title = 'Redéployez le script : les ventes de ' + nomMois + ' livrées un autre mois ne sont pas encore comptées.';
      var tL = kpi('livrees', 'Livrées', c.etat.livrees, 'ventes-kpi-civil');
      tL.id = 'ventes-kpi-livrees';
      tL.appendChild(h('div.sous', { text: 'livrées en ' + nomMois + (mc === moisCourant() ? ', à ce jour' : '') + (this.parVente() && c.etat.livreesAutres ? ' · dont ' + c.etat.livreesAutres + ' vendue' + (c.etat.livreesAutres > 1 ? 's' : '') + ' un autre mois' : '') }));
      this.elKpis.appendChild(tV); this.elKpis.appendChild(tL);
    }
    if (!sansFI) this.elKpis.appendChild(kpi('sansFI', 'F&I à inscrire', c.etat.sansFI, c.etat.sansFI ? 'alerte' : ''));
    /* 26 oct. : compteur des RDR du mois (Date RDR du livre) */
    if (this.moisRdr() && d.rdr && this.filtres.type === 'neuf') {   /* 3 nov. : les RDR ne concernent que les neufs */
      /* 1er nov., soir (Maxime) : plus de tuile « RDR au livre » — la Date RDR du livre n'est plus comparée ; les RDR viennent du
         constructeur (carte ci-dessous). La tuile « Neufs livrés sans RDR » ne reste que si son filtre est actif (ancien lien). */
      if (this.filtres.drapeau === 'sansRdr') { var tuileSans = kpi('sansRdr', 'Neufs livrés sans RDR', c.etat.sansRdr, c.etat.sansRdr ? 'alerte' : ''); tuileSans.id = 'ventes-kpi-sans-rdr'; this.elKpis.appendChild(tuileSans); }
      var cartePortail = this.cartePortailRdr(); if (cartePortail) this.elKpis.appendChild(cartePortail);
    }
  };
  /* 26 oct. (Maxime : « corroborer les RDR dans S-Gate avec le compteur pour BMW et Global Connect pour Hawks et STM ») : les RDR du
     livre et ceux des portails (POST venteRdrComparer), par concession, pour le mois affiché. */
  var RDR_CIES = ['BMW', 'STM', 'HAWKS', 'VW', 'HYUNDAI'];
  /* 1er nov., soir : la carte ne compte que les commandes vendues de moins de COMMANDES_JOURS (comme l'onglet Commandes vendues) ;
     les plus vieilles (souvent une livraison jamais inscrite au livre) vont dans « à vérifier ». Repère : la fin du mois affiché,
     ou aujourd'hui pour le mois courant. */
  function commandesParAge(g, m) {
    var per = periodeManuf(m), finMois = new Date((per ? per.fin : m + '-28') + 'T12:00:00');   /* fin du mois du manufacturier (2 nov.) */
    var refT = Math.min(finMois.getTime(), new Date(isoLocal(new Date()) + 'T12:00:00').getTime());
    var recentes = [], vieilles = [];
    (g.commandes || []).forEach(function (y) { var t0 = y.dateVente ? new Date(y.dateVente + 'T12:00:00').getTime() : refT; ((refT - t0) / 86400000 > COMMANDES_JOURS ? vieilles : recentes).push(y); });
    var complet = (g.commandes || []).length >= (g.n.commandes || 0);
    return { recentes: recentes, vieilles: vieilles, nRecentes: complet ? recentes.length : g.n.commandes, nVieilles: complet ? vieilles.length : 0, complet: complet };
  }   /* 1er nov. : les cinq portails lus (VENTE_RDR_PORTAILS_) */
  var cacheRdrP = { cle: '', rep: null, quand: 0, promesse: null, erreur: '' };
  VueVentes.prototype.chargerRdrPortail = function (force) {
    var self = this, m = this.moisRdr(), cie = this.compagnie || '';
    if (!m || (cie && RDR_CIES.indexOf(cie) < 0)) return;
    var cle = cie + '|' + m;
    if (!force && cacheRdrP.cle === cle && (cacheRdrP.rep || cacheRdrP.promesse || cacheRdrP.erreur) && Date.now() - cacheRdrP.quand < AMX.dureeCopie(5 * 60000)) return;
    cacheRdrP.cle = cle; cacheRdrP.rep = null; cacheRdrP.erreur = ''; cacheRdrP.quand = Date.now();
    cacheRdrP.promesse = AMX.post({ action: 'venteRdrComparer', compagnie: cie, mois: m }, { delai: 90000 }).then(function (r) {
      if (cacheRdrP.cle !== cle) return;
      cacheRdrP.promesse = null;
      if (!r || r.refuse || r.ok === false) throw new Error((r && r.erreur) || 'Comparaison refusée.');
      if (!r.cies) throw new Error(SCRIPT_PAS_A_JOUR);
      cacheRdrP.rep = r; if (!self.detruit) self.rendreKpis();
    }).catch(function (e) { if (cacheRdrP.cle !== cle) return; cacheRdrP.promesse = null; cacheRdrP.erreur = AMX.erreurTexte(e); if (!self.detruit) self.rendreKpis(); });
  };
  VueVentes.prototype.cartePortailRdr = function () {
    var self = this, m = this.moisRdr(), cie = this.compagnie || '';
    if (!m || (cie && RDR_CIES.indexOf(cie) < 0)) return null;
    this.chargerRdrPortail(false);
    var cle = cie + '|' + m, r = cacheRdrP.cle === cle ? cacheRdrP.rep : null;
    /* 1er nov., soir (Maxime : « séparer les flottes et le détail ; on garde RDR livré (RDR manuf. et livré physique), RDR non livré
       (RDR manuf. mais pas livré physiquement) et commande vendue (pas de RDR, pas livré, mais vendu) ») : chaque RDR du constructeur
       est relié à sa vente du livre par le NIV (ou le # stock), côté serveur (VENTE_rdrGroupes_). */
    /* 3 nov. (Maxime : « dans le neuf, rends le tableau plus limpide, il y a plein d'écrits partout ») : titre court, période
       en une ligne, chiffres seuls (le calcul est dans l'infobulle), plus de note sous le tableau. */
    var carte = h('div.kpi.neutre.ventes-comp.ventes-rdr-portail#ventes-kpi-rdr-portail', [h('div.titre', { text: 'RDR manufacturier — ' + moisLibelle(m) })]);
    var tPer = textePeriodeManuf((r && r.periode) || periodeManuf(m));   /* 2 nov. : « RDR du 1er oct. au lundi 2 nov. » */
    if (tPer) carte.appendChild(h('div.sous.rdr-periode', { text: tPer.replace(/^RDR /, '').replace(' (mois du manufacturier)', ''), title: 'Mois du manufacturier : le dimanche et le lundi qui suivent un samedi du mois précédent comptent dans ce mois-là.' }));
    if (!r) { carte.appendChild(h('div.n', { text: cacheRdrP.cle === cle && cacheRdrP.erreur ? cacheRdrP.erreur : 'Lecture des RDR du constructeur…' })); return carte; }
    var codes = Object.keys(r.cies);
    if (!codes.length) return null;
    if (codes.some(function (c) { return !r.cies[c].groupes; })) {
      carte.appendChild(h('div.n', { text: 'Le script n\'est pas à jour : redéployez-le pour voir les RDR livrés, non livrés et les commandes vendues (détail et flotte).' }));
      return carte;
    }
    var NOMS = { BMW: 'BMW', STM: 'Ste Marie', HAWKS: 'Hawkesbury', VW: 'VW', HYUNDAI: 'Hyundai' };
    var COLS = [
      ['rdr', 'RDR manuf.', 'RDR reçus par le constructeur ce mois-ci (chez GM : livraisons transmises dans le mois, moins les retours en stock)'],
      ['livraisons', 'Livraisons', 'Neufs livrés dans le mois de calendrier, d\'après la date de livraison au Livre des ventes, avec ou sans RDR'],
      ['rdrLivres', 'RDR livrés', 'RDR du constructeur dont la vente est livrée dans le mois (date de livraison au livre)'],
      ['rdrNonLivres', 'RDR non livrés', 'RDR du constructeur dont la vente n\'est pas livrée dans le mois : pas encore livrée, livrée un autre mois, ou annulée / refusée au livre'],
      ['rdrSansVente', 'Pas au livre', 'RDR du constructeur sans vente au Livre des ventes (NIV introuvable)'],
      ['commandes', 'Commandes', 'Commandes vendues : neufs vendus, pas livrés, sans RDR chez le constructeur'],
      ['comptabilises', 'Compta.', 'RDR livrés que la comptabilité a comptabilisés']
    ];
    var cellule = function (c, cote, col, gRang) {
      var g = gRang || r.cies[c].groupes[cote], n = g.n[col[0]] || 0;
      if (col[0] === 'commandes') {
        var pa = commandesParAge(g, m), nr = pa.nRecentes, tt = col[2] + ' — moins de ' + COMMANDES_JOURS + ' jours' + (pa.nVieilles ? ' ; ' + pa.nVieilles + ' de plus de ' + COMMANDES_JOURS + ' jours à vérifier' : '');
        if (!nr) return h('td.num.doux', { text: '0', title: tt });
        return h('td.num', [h('button.rdr-num', { type: 'button', text: String(nr), title: tt + ' — voir la liste', onclick: function (ev) { ev.stopPropagation(); ouvrirRdrGroupes(r, { cie: c, cote: cote, cat: 'commandes' }); } })]);
      }
      if (col[0] === 'livraisons' && g.n.livraisons === undefined) return h('td.num.doux', { text: '—', title: 'Redéployez le script pour voir les livraisons du mois civil' });
      var cls = 'td.num' + (col[0] === 'rdrSansVente' && n ? '.ecart-moins' : '') + (!n ? '.doux' : '');
      /* 3 nov. : chez GM, RDR du mois = transmis − retours en stock (« quand tu vois retourner en stock ça fait −1 par NIV ») */
      if (col[0] === 'rdr' && g.n.retours) {
        var tr = (g.n.rdrTransmis || 0) + ' RDR transmis − ' + g.n.retours + ' retour' + (g.n.retours > 1 ? 's' : '') + ' en stock (RDR des mois précédents retournés ce mois-ci) = ' + n;
        return h('td.num', { title: tr }, [h('button.rdr-num', { type: 'button', text: String(n), title: tr + ' — voir la liste', onclick: function (ev) { ev.stopPropagation(); ouvrirRdrGroupes(r, { cie: c, cote: cote }); } })]);
      }
      if (!n || col[0] === 'comptabilises') return h(cls, { text: String(n), title: col[2] });
      return h(cls, [h('button.rdr-num', { type: 'button', text: String(n), title: col[2] + ' — voir la liste', onclick: function (ev) { ev.stopPropagation(); ouvrirRdrGroupes(r, { cie: c, cote: cote, cat: col[0] === 'rdr' ? '' : col[0] }); } })]);
    };
    var lignes = [], plusieurs = codes.length > 1;
    codes.forEach(function (c) {
      var x = r.cies[c];
      if (plusieurs) lignes.push(h('tr.rdr-cie', [h('th', { colspan: String(COLS.length + 1), scope: 'colgroup', text: AMX.COMPAGNIES_TOUTES[c] || NOMS[c] || c })]));
      rangeesRdr(c, x).forEach(function (rg) {   /* 3 nov. : BMW — sous-totaux détail / démo, puis le total du mois */
        lignes.push(h('tr.' + rg.cle, [h('th', { scope: 'row', title: (AMX.COMPAGNIES_TOUTES[c] || c) + ' — ' + x.portail + (x.lu ? ', lu le ' + AMX.fmtDate(x.lu, true) : ', jamais lu') + (rg.total ? ' — ce que compte le rapport de fin de mois du constructeur' : '') + (rg.aPart ? ' — programmes de courtoisie et démos : ne comptent pas dans le RDR du manufacturier, hors du total' : '') }, [
          h('span.rdr-cote', { text: rg.titre })])].concat(COLS.map(function (col) { return cellule(c, rg.cle, col, rg.g); }))));
      });
    });
    carte.appendChild(h('table.ventes-moy-table.rdr-groupes', [h('thead', [h('tr', [h('th', { text: '' })].concat(COLS.map(function (col) { return h('th.num', { text: col[1], title: col[2] }); })))]), h('tbody', lignes)]));
    var lu = codes.map(function (c) { return r.cies[c].lu; }).filter(Boolean).sort()[0];
    var vieilles = 0; codes.forEach(function (c) { ['detail', 'flotte', 'courtoisie'].forEach(function (cote) { if (r.cies[c].groupes[cote]) vieilles += commandesParAge(r.cies[c].groupes[cote], m).nVieilles; }); });   /* les groupes du serveur : les sous-totaux de BMW ne comptent pas deux fois */
    var gm = codes.filter(function (c) { return r.cies[c].calcul === 'transmission'; }).map(function (c) { return NOMS[c] || c; });
    carte.appendChild(h('div.rdr-pied', [h('span.sous', { text: lu ? 'Portail lu le ' + AMX.fmtDate(lu, true) : 'Portail jamais lu',
        title: 'Commandes : vendues depuis moins de ' + COMMANDES_JOURS + ' jours' + (vieilles ? ' (' + vieilles + ' plus vieilles, à vérifier, dans « Voir le détail »)' : '') + (gm.length ? ' · ' + gm.join(', ') + ' : RDR transmis dans le mois − retours en stock' : '') }),
      h('button.btn.petit.fantome#ventes-rdr-comparer', { type: 'button', text: 'Voir le détail', onclick: function (ev) { ev.stopPropagation(); ouvrirRdrGroupes(r, {}); } })]));
    return carte;
  };
  /* 3 nov. (Maxime : « les RDR démo et fleet employé comptent pour le manufacturier chez BMW, dans le compte séparé : RDR manuf.
     détail, RDR démo, RDR employé en sous-total pour faire le total du mois ») : chez BMW, la ligne « Détail » du serveur (RDR N
     et D ; les P « changement de propriétaire », U et W ne comptent pas) est séparée en sous-totaux — Détail (N) et Démo (D) —
     puis « Total du mois » = ce que le rapport de fin de mois de BMW compte (New & Demo). Calculé ici à partir des listes
     renvoyées par VENTE_rdrGroupes_ (aucun changement de script) ; si une liste a été coupée (plus de 300), pas de séparation. */
  var RDR_CATS = ['rdrLivres', 'rdrNonLivres', 'rdrSansVente', 'commandes', 'livresSansRdr', 'retours', 'livraisons'];
  function rdrComplet(g) { return !!g && RDR_CATS.every(function (k) { return (g[k] || []).length === (g.n[k] || 0); }); }
  function rdrVide(g) { var n = g.n; return !n.rdr && !n.commandes && !n.livresSansRdr; }
  function rdrSousGroupe(g, gardeRdr, gardeVente) {
    var out = { n: { rdr: 0, rdrLivres: 0, rdrNonLivres: 0, rdrSansVente: 0, commandes: 0, livresSansRdr: 0, comptabilises: 0, retours: 0, rdrTransmis: 0 }, retours: [] };
    if (g.n.livraisons !== undefined) out.n.livraisons = 0;
    ['rdrLivres', 'rdrNonLivres', 'rdrSansVente'].forEach(function (k) { out[k] = (g[k] || []).filter(gardeRdr); out.n[k] = out[k].length; out.n.rdr += out[k].length; });
    out.n.rdrTransmis = out.n.rdr;
    out.n.comptabilises = out.rdrLivres.filter(function (y) { return y.vente && y.vente.comptabilisee; }).length;
    ['commandes', 'livresSansRdr'].concat(g.n.livraisons !== undefined ? ['livraisons'] : []).forEach(function (k) { out[k] = (g[k] || []).filter(gardeVente); out.n[k] = out[k].length; });
    return out;
  }
  function rdrFusion(gs) {
    var out = { n: { rdr: 0, rdrLivres: 0, rdrNonLivres: 0, rdrSansVente: 0, commandes: 0, livresSansRdr: 0, comptabilises: 0, retours: 0, rdrTransmis: 0 } };
    if (gs.some(function (g) { return g.n.livraisons !== undefined; })) out.n.livraisons = 0;
    RDR_CATS.forEach(function (k) { out[k] = []; });
    gs.forEach(function (g) { Object.keys(out.n).forEach(function (k) { out.n[k] += g.n[k] || 0; }); RDR_CATS.forEach(function (k) { out[k] = out[k].concat(g[k] || []); }); });
    return out;
  }
  /* Les lignes d'une concession dans la carte et la fenêtre : { cle, titre, g, total }. */
  function rangeesRdr(c, x) {
    var gr = x.groupes, rows = [];
    if (c === 'BMW' && rdrComplet(gr.detail) && rdrComplet(gr.flotte)) {
      var demoRdr = function (y) { return /d[ée]mo/i.test(String(y.type || '')); };
      var demoVente = function (y) { return /^(demo|courtoisie)$/.test(String(y.categorie || (y.vente && y.vente.categorie) || '')); };
      rows.push({ cle: 'detail', titre: 'Détail', g: rdrSousGroupe(gr.detail, function (y) { return !demoRdr(y); }, function (y) { return !demoVente(y); }) });
      rows.push({ cle: 'demo', titre: 'Démo', g: rdrSousGroupe(gr.detail, demoRdr, demoVente) });
      rows.push({ cle: 'flotte', titre: 'Employé', g: gr.flotte });   /* 3 nov. : chez BMW, la flotte = statut « Fleet/Employé » du livre */
      rows.push({ cle: 'total', titre: 'Total', g: rdrFusion([gr.detail, gr.flotte]), total: true });
      return rows;
    }
    /* 3 nov. (Maxime : « les programmes de courtoisie et démo de STM et Hawks ne comptent pas dans le RDR du manufacturier, il
       faut les mettre à part ») : le serveur les range dans gr.courtoisie — une ligne à part, sous le total, hors du total. */
    if (gr.courtoisie && !rdrVide(gr.courtoisie)) {
      rows.push({ cle: 'detail', titre: 'Détail', g: gr.detail });
      if (!rdrVide(gr.flotte)) rows.push({ cle: 'flotte', titre: 'Flotte', g: gr.flotte });
      rows.push({ cle: 'total', titre: 'Total', g: rdrFusion([gr.detail, gr.flotte]), total: true });
      rows.push({ cle: 'courtoisie', titre: 'Courtoisie et démo · hors total', g: gr.courtoisie, aPart: true });
      return rows;
    }
    rows.push({ cle: 'detail', titre: 'Détail', g: gr.detail });
    if (!rdrVide(gr.flotte)) rows.push({ cle: 'flotte', titre: 'Flotte', g: gr.flotte });
    return rows;
  }
  /* Les listes derrière la carte : une concession / un côté / une case (filtre), ou tout. */
  function ouvrirRdrGroupes(r, filtre) {
    filtre = filtre || {};
    var corps = h('div.ventes-form.ventes-rdr-comp');
    var ouvrir = function (id) { return h('a', { href: '#', text: id, onclick: function (e) { e.preventDefault(); AMX.ventes.une(id).then(function (v) { ouvrirFiche(v); }, function (er) { AMX.toast(AMX.erreurTexte(er), 'erreur'); }); } }); };
    var date = function (d) { if (!d) return '—'; var f = AMX.fmtDateCourte(d), an = String(d).slice(0, 4); return an !== String(new Date().getFullYear()) && f.indexOf(an) < 0 ? f + ' ' + an : f; };
    var tableau = function (titre, n, entetes, lignes) {
      if (!lignes.length) return null;
      return h('div', [h('h5', { text: titre + ' (' + n + (n > lignes.length ? ', ' + lignes.length + ' montrés' : '') + ')' }), h('div.ventes-defile', [h('table.tableau.rdr-liste', [h('thead', [h('tr', entetes.map(function (t) { return h('th', { text: t }); }))]), h('tbody', lignes)])])]);
    };
    /* 3 nov. : un RDR retourné en stock plus tard compte dans son mois, −1 dans le mois du retour */
    var celluleRdr = function (y) { return h('td', [h('span', { text: date(y.date) }), y.retourLe ? h('span.puce', { text: 'retourné le ' + date(y.retourLe), style: { marginLeft: '6px' }, title: 'Retourné en stock plus tard : compte dans ce mois, −1 dans le mois du retour' }) : null]); };
    var vente = function (v) { return v ? [ouvrir(v.id), h('span', { text: (v.stock ? ' · # ' + v.stock : '') + (v.client ? ' · ' + v.client : '') + (v.parStock ? ' · relié par le # stock' : '') })] : [h('span.puce.alerte', { text: 'aucune vente au livre' })]; };
    var SECTIONS = {
      rdrLivres: ['RDR livrés', ['Date RDR', 'Véhicule', 'NIV', 'Vente', 'Livrée le'], function (y) { return h('tr', [celluleRdr(y), h('td', { text: y.vehicule + (y.type ? ' · ' + y.type : '') }), h('td.mono', { text: y.vin }), h('td', vente(y.vente)), h('td', { text: date(y.vente && y.vente.dateLivraison) + (y.vente && y.vente.comptabilisee ? ' · comptabilisée' : '') })]); }],
      rdrNonLivres: ['RDR non livrés dans le mois', ['Date RDR', 'Véhicule', 'NIV', 'Vente', 'Vendue le'], function (y) {
        var dl = y.vente && y.vente.dateLivraison, passee = dl && dl <= isoLocal(new Date());
        var quand = !dl ? '' : (y.livraisonAutreMois ? (passee ? ' · livrée le ' : ' · livraison prévue ') + date(dl) : ' · livraison prévue ' + date(dl));
        return h('tr', [celluleRdr(y), h('td', { text: y.vehicule + (y.type ? ' · ' + y.type : '') }), h('td.mono', { text: y.vin }), h('td', vente(y.vente)),
          h('td', [h('span', { text: date(y.vente && y.vente.dateVente) + quand }), y.livraisonAutreMois ? h('span.puce.attention', { text: 'livrée en ' + moisLibelle(y.livraisonAutreMois), title: 'Vente livrée un autre mois que le RDR : RDR manufacturier et non livré dans ce mois' }) : null,
            y.annulee ? h('span.puce.alerte', { text: /^refus/i.test(String(y.annulee)) ? 'Refusée au livre (en rouge)' : 'Annulée' + (y.annulee !== 'Annulée' && y.annulee !== 'Annulé' ? ' · ' + y.annulee : ''), title: 'Vente annulée ou refusée au livre : RDR manufacturier et non livré (le RDR est à retirer chez le constructeur)' }) : null])]); }],
      retours: ['Retours en stock (−1 chacun)', ['Retour le', 'Véhicule', 'NIV', 'RDR annulé', 'Vente'], function (y) { return h('tr', [celluleRdr(y), h('td', { text: (y.vehicule || '—') + (y.type ? ' · ' + y.type : '') }), h('td.mono', { text: y.vin }), h('td', { text: y.sansDate ? 'même mois (date de réintégration inconnue)' : (y.rdrDe ? 'RDR du ' + date(y.rdrDe) : 'RDR d\'avant la lecture du portail') }), h('td', y.vente ? vente(y.vente) : [h('span.doux', { text: '—' })])]); }],
      rdrSansVente: ['RDR pas au livre', ['Date RDR', 'Véhicule', 'NIV', 'Type au portail'], function (y) { return h('tr', [celluleRdr(y), h('td', { text: y.vehicule }), h('td.mono', { text: y.vin }), h('td', { text: y.type || '—' })]); }],
      commandes: ['Commandes vendues', ['Vendue le', 'Vente', 'Véhicule', 'NIV'], function (y) { return h('tr', [h('td', { text: date(y.dateVente) }), h('td', [ouvrir(y.id), h('span', { text: (y.stock ? ' · # ' + y.stock : '') + (y.client ? ' · ' + y.client : '') })]), h('td', { text: y.vehicule }), h('td', y.sansNiv ? [h('span.puce', { text: 'sans NIV', title: 'Le livre n\'a ni NIV ni # stock reconnu : on ne peut pas savoir si le constructeur a le RDR' })] : [h('span.mono', { text: y.vin })])]); }],
      livraisons: ['Livraisons du mois civil (Livre des ventes)', ['Livrée le', 'Vente', 'Véhicule', 'NIV'], function (y) { return h('tr', [h('td', { text: date(y.dateLivraison) }), h('td', [ouvrir(y.id), h('span', { text: (y.stock ? ' · # ' + y.stock : '') + (y.client ? ' · ' + y.client : '') }), y.comptabilisee ? h('span.puce', { text: 'comptabilisée', style: { marginLeft: '6px' } }) : null]), h('td', { text: y.vehicule }), h('td', [y.sansNiv ? h('span.puce', { text: 'sans NIV' }) : h('span.mono', { text: y.vin }), !y.sansNiv && !y.rdr ? h('span.puce.attention', { text: 'sans RDR', style: { marginLeft: '6px' }, title: 'Aucun RDR chez le constructeur pour ce NIV' }) : null])]); }],
      livresSansRdr: ['Livrés ce mois-ci sans RDR chez le constructeur', ['Livrée le', 'Vente', 'Véhicule', 'NIV'], function (y) { return h('tr', [h('td', { text: date(y.dateLivraison) }), h('td', [ouvrir(y.id), h('span', { text: (y.stock ? ' · # ' + y.stock : '') + (y.client ? ' · ' + y.client : '') })]), h('td', { text: y.vehicule }), h('td', y.sansNiv ? [h('span.puce', { text: 'sans NIV' })] : [h('span.mono', { text: y.vin })])]); }]
    };
    var ordre = filtre.cat ? [filtre.cat] : ['rdrLivres', 'rdrNonLivres', 'rdrSansVente', 'retours', 'commandes', 'livresSansRdr', 'livraisons'];
    var titreModale = filtre.cat ? SECTIONS[filtre.cat][0] : 'RDR manufacturier et ventes neuves';
    Object.keys(r.cies).forEach(function (c) {
      if (filtre.cie && c !== filtre.cie) return;
      var x = r.cies[c];
      rangeesRdr(c, x).forEach(function (rg) {
        var cote = rg.cle;
        if (filtre.cote && cote !== filtre.cote) return;
        if (!filtre.cote && rg.total) return;   /* « Voir le détail » : les sous-totaux, pas le total en double */
        var g = rg.g, n = g.n;
        corps.appendChild(h('h4', { text: (AMX.COMPAGNIES_TOUTES[c] || c) + ' — ' + rg.titre }));
        if (!filtre.cat) corps.appendChild(h('p.ventes-aide', { text: capitale(r.moisLibelle) + (textePeriodeManuf(r.periode || periodeManuf(r.mois)) ? ' (' + textePeriodeManuf(r.periode || periodeManuf(r.mois)).replace(' (mois du manufacturier)', '') + ')' : '') + ' : ' + (n.retours ? (n.rdrTransmis || 0) + ' RDR transmis − ' + n.retours + ' retour' + (n.retours > 1 ? 's' : '') + ' en stock = ' + n.rdr : n.rdr) + ' RDR chez ' + x.portail + ' — ' + n.rdrLivres + ' livré' + (n.rdrLivres > 1 ? 's' : '') + ' dans le mois, ' + n.rdrNonLivres + ' non livré' + (n.rdrNonLivres > 1 ? 's' : '') + ' dans le mois, ' + n.rdrSansVente + ' pas au livre ; ' + (n.livraisons !== undefined ? n.livraisons + ' livraison' + (n.livraisons > 1 ? 's' : '') + ' dans le mois civil ; ' : '') + (function () { var pa = commandesParAge(g, r.mois); return pa.nRecentes + ' commande' + (pa.nRecentes > 1 ? 's' : '') + ' vendue' + (pa.nRecentes > 1 ? 's' : '') + ' de moins de ' + COMMANDES_JOURS + ' jours sans RDR' + (pa.nVieilles ? ' (+ ' + pa.nVieilles + ' plus vieilles)' : ''); })() + '.' + (x.lu ? ' Portail lu le ' + AMX.fmtDate(x.lu, true) + '.' : ' Le portail n\'a jamais été lu.') }));
        var vides = true;
        ordre.forEach(function (cat) {
          var s = SECTIONS[cat], tabs;
          if (cat === 'commandes') {
            var pa = commandesParAge(g, r.mois);
            tabs = [tableau('Commandes vendues de moins de ' + COMMANDES_JOURS + ' jours (pas de RDR, pas livrées)', pa.nRecentes, s[1], pa.recentes.map(s[2])),
              tableau('Commandes de plus de ' + COMMANDES_JOURS + ' jours — à vérifier (livraison jamais inscrite ?)', pa.nVieilles, s[1], pa.vieilles.map(s[2]))];
          } else tabs = [tableau(s[0], n[cat] || 0, s[1], (g[cat] || []).map(s[2]))];
          tabs.forEach(function (tb) { if (tb) { corps.appendChild(tb); vides = false; } });
        });
        if (vides) corps.appendChild(h('p.ventes-aide', { text: 'Rien à montrer.' }));
      });
    });
    AMX.modale({ titre: titreModale + ' — ' + r.moisLibelle, corps: corps, large: true, boutons: [{ texte: 'Fermer' }] });
  }
  /* Les ventes par mois afférent (la date inscrite), dans l'ordre de la liste (la plus récente d'abord). */
  function grouperParMois(liste, parVente) {
    var groupes = [], par = {};
    liste.forEach(function (v) {
      var m = parVente ? moisVenteRef(v) : moisDeVente(v);
      if (!par[m]) { par[m] = { mois: m, libelle: (parVente ? '' : v.moisLibelle) || moisLibelle(m) || 'Sans date', ventes: [] }; groupes.push(par[m]); }
      par[m].ventes.push(v);
    });
    return groupes;
  }
  /* 6 nov. : la case de date d'une vente rangée par date de vente — la vente, puis la livraison (faite, prévue ou à venir). */
  function celluleDateVente(v) {
    var dv = dateVenteRef(v), auj = isoLocal(new Date()), dl = dateLivraisonOk(v) ? String(v.dateLivraison).slice(0, 10) : '';
    var sous = dl ? (dl <= auj ? 'livrée ' + AMX.fmtDateCourte(dl) : 'livraison ' + AMX.fmtDateCourte(dl)) : (v.statut === 'annulee' ? '' : 'pas livrée');
    return [h('div', { text: dv ? AMX.fmtDateCourte(dv) : '—', title: (v.dateVente ? 'Vendue le ' + AMX.fmtDate(v.dateVente) : 'Inscrite le ' + AMX.fmtDate(v.declareLe)) + (dl ? ' · ' + (dl <= auj ? 'livrée le ' : 'livraison prévue le ') + AMX.fmtDate(dl) : '') + (v.dateRdr ? ' · RDR au livre ' + AMX.fmtDate(v.dateRdr) : '') }),
      sous ? h('div.sous' + (dl && dl > auj ? '.a-venir' : ''), { text: sous }) : null].filter(Boolean);
  }
  function puceEtat(v) {
    if (estRefusee(v)) return h('span.puce.alerte', { text: 'Refusée (rouge)', title: v.annuleRaison || v.horsVente || '' });
    if (v.statut === 'annulee') return h('span.puce', { text: /refus/i.test(v.annuleRaison || '') ? 'Annulée · refus de crédit' : 'Annulée', title: v.annuleRaison || '' });
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
    var liste = this.visibles(), montants = !!d.montants, ajs = this.ajustementsVisibles(), parV = this.parVente();
    /* 6 nov. : rangées par date de vente, la plus récente d'abord (à égalité, la dernière inscrite) */
    if (parV) liste = liste.slice().sort(function (a, b) { return (dateVenteRef(b) + String(b.declareLe || '')).localeCompare(dateVenteRef(a) + String(a.declareLe || '')); });
    AMX.vider(this.elListe);
    if (!liste.length && !ajs.length) {
      this.elListe.appendChild(h('div.carte', [h('div.ventes-vide', [h('div', { text: this.vue === 'commandes' ? 'Aucune commande vendue en attente de livraison' + (this.filtres.age || this.filtres.type || this.filtres.recherche ? ' pour ce filtre.' : '.') : (this.filtres.etat || this.filtres.drapeau || this.filtres.type || this.filtres.recherche) ? 'Aucune vente pour ce filtre.' : 'Aucune vente inscrite pour cette période.' }),
        AMX.ventes.peutDeclarer() ? h('button.btn.primaire', { type: 'button', style: { marginTop: '10px' }, onclick: function () { AMX.ventes.declarer({ compagnie: self.compagnie }); } }, [AMX.svg('plus'), ' Inscrire une vente']) : null])]));
      return;
    }
    /* 1er nov. (Maxime : « quand on fait le profit wholesale dans le livre des ventes, enlever les sections F&I ») : la liste
       filtrée sur le wholesale n'a ni Dir. F&I ni colonnes F&I. */
    var sansFI = this.filtres.type === 'wholesale';
    /* 3 nov. (Maxime : « rends le tableau plus limpide, il y a plein d'écrits partout ») : une colonne vide dans toute la liste
       n'est pas montrée (Prix, Dir. F&I, « Comptable » et « Écart » tant que la comptabilité n'a rien inscrit) ; plus de colonne
       Livre (« Pas au livre » passe dans État, le numéro de ligne est dans la fiche) ; une seule ligne de texte par case. */
    var cfg = {
      montants: montants, sansFI: sansFI,
      dir: !sansFI && liste.some(function (v) { return !!v.directeur; }),
      prix: montants && liste.some(function (v) { return nombre(v.prixVente) !== null; }),
      frontC: montants && (liste.some(function (v) { return frontC(v) !== null; }) || ajs.some(function (a) { return !!ajFront(a); })),
      fiC: montants && !sansFI && (liste.some(function (v) { return fiC(v) !== null; }) || ajs.some(function (a) { return !!ajFI(a); }))
    };
    var deux = montants && (cfg.frontC || cfg.fiC);
    var colonnes = 5 + (cfg.dir ? 1 : 0) + (montants ? (cfg.prix ? 1 : 0) + (cfg.frontC ? 3 : 1) + (sansFI ? 0 : (cfg.fiC ? 3 : 1)) : 0) + 2, rs = deux ? { rowspan: '2' } : {};
    var thR = function (t, extra) { return h('th', Object.assign({ text: t }, rs, extra || {})); };
    var nomFront = sansFI ? 'Profit' : 'Front';
    var thGroupe = function (nom, avecC, titre) { return avecC ? h('th.groupe-col.debut-groupe', { colspan: '3', text: nom, title: titre }) : h('th.num.debut-groupe', Object.assign({ text: nom, title: titre + ' — estimé (prévu) ; la comptabilité n\'a encore rien inscrit dans cette liste' }, rs)); };
    var entete = h('tr', [parV ? thR('Vente', { title: 'Les ventes sont rangées par date de vente, la plus récente d\'abord ; la livraison est dessous' }) : thR('Livraison', { title: 'Les ventes sont rangées dans le mois de leur livraison (date de vente en gris quand il n\'y a pas de date de livraison)' }), thR('Véhicule'), thR('Client'), thR('Type'), h('th.col-cons', Object.assign({ text: 'Conseiller' }, rs)), cfg.dir ? h('th.col-dir', Object.assign({ text: 'Dir. F&I' }, rs)) : null].filter(Boolean)
      .concat(montants ? [cfg.prix ? h('th.num', Object.assign({ text: 'Prix' }, rs)) : null, thGroupe(nomFront, cfg.frontC, sansFI ? 'Profit de la vente' : 'Front (la voiture)'), sansFI ? null : thGroupe('F&I', cfg.fiC, 'Profit F&I')].filter(Boolean) : [])
      .concat([thR('État'), thR('')]));
    var sous3 = ['Estimé', 'Comptable', 'Écart'];
    var entete2 = deux ? h('tr', [].concat(cfg.frontC ? sous3 : [null], sansFI ? [] : (cfg.fiC ? sous3 : [null])).map(function (t, i) { return t === null ? null : h('th.num' + (t === 'Estimé' ? '.debut-groupe' : ''), { text: t, title: t === 'Écart' ? 'Comptable − estimé' : (t === 'Estimé' ? 'Prévu' : 'Réel inscrit par la comptabilité') }); }).filter(Boolean)) : null;
    var corps = h('tbody');
    var groupes = grouperParMois(liste, parV), parMoisG = {};
    groupes.forEach(function (g) { parMoisG[g.mois] = g; g.ajustements = []; });
    ajs.forEach(function (a) { var g = parMoisG[a.mois]; if (!g) { g = parMoisG[a.mois] = { mois: a.mois, libelle: moisLibelle(a.mois), ventes: [], ajustements: [] }; groupes.push(g); } g.ajustements.push(a); });
    groupes.sort(function (x, y) { return String(y.mois).localeCompare(String(x.mois)); });
    groupes.forEach(function (g) {
      var actives = g.ventes.filter(function (v) { return v.statut !== 'annulee'; }), attente = actives.filter(function (v) { return v.statut === 'declaree'; }).length;
      /* 3 nov. : le nombre de ventes seulement (les profits du mois sont dans les cartes du haut) */
      var resume = pluriel(actives.length, 'vente') + (attente && !sansFI ? ' · ' + attente + ' en attente du F&I' : '');
      var sansFIm = actives.filter(besoinFI).length;
      if (sansFIm && !sansFI) resume += ' · ' + sansFIm + ' F&I à inscrire';
      if (g.ajustements.length) resume += ' · ' + pluriel(g.ajustements.length, 'entrée') + ' hors vente';
      corps.appendChild(h('tr.groupe', { dataset: { mois: g.mois } }, [h('td', { colspan: String(colonnes) }, [h('span', { text: capitale(g.libelle) }), h('span.sous', { text: resume })])]));
      g.ventes.forEach(function (v) {
        var prd = produitsListe(v);
        var tr = h('tr.cliquable' + (v.statut === 'annulee' || estRefusee(v) ? '.annulee' : ''), { dataset: { id: v.id } }, [
          h('td', (parV ? celluleDateVente(v) : dateLivraisonOk(v) ? [h('div', { text: AMX.fmtDateCourte(v.dateLivraison), title: 'Livrée le ' + AMX.fmtDate(v.dateLivraison) + (v.dateVente ? ' · vendue le ' + AMX.fmtDate(v.dateVente) : '') + (v.dateRdr ? ' · RDR au livre ' + AMX.fmtDate(v.dateRdr) : '') })] : [h('div.date-vente', { text: AMX.fmtDateCourte(v.dateVente), title: 'Date de vente (pas de date de livraison inscrite : la vente compte dans le mois de sa date de vente)' })])
            .concat([self.vue === 'commandes' && joursDepuisVente(v) !== null ? h('div.sous' + (ageCommande(v) === 'vieilles' ? '.retard' : ''), { text: 'depuis ' + joursDepuisVente(v) + ' j', title: (dateLivraisonOk(v) ? 'Livraison prévue' : 'Pas livrée') + ' — jours depuis la date de vente' }) : null])
            .concat([self.filtres.drapeau === 'sansRdr' && self.sansRdr(v) ? h('div.sous.rdr.manque', { text: 'sans RDR', title: 'Neuf livré sans Date RDR au livre' }) : null])),
          h('td.vehicule', { title: v.vin || '' }, [h('div.nom', { text: vehiculeTexte(v) || '(véhicule à préciser)' }), v.stock ? h('div.vin', { text: '# ' + v.stock }) : null]),
          h('td', { title: [v.noClient ? 'No client ' + v.noClient : '', v.type === 'wholesale' && v.acheteDe ? 'acheté de ' + v.acheteDe : '', v.echangeStock || v.echangeModele || v.echangeVin ? 'échange ' + ([v.echangeStock, v.echangeModele].filter(Boolean).join(' ') || v.echangeVin) : ''].filter(Boolean).join(' · ') }, [h('div', { text: v.client || v.venduA || '—' })]),
          puceCpo(v) ? h('td', { title: (TYPES[v.type] || v.type) + ' · ' + (libCategorie(v.type, v.categorie) || '') + (v.paiement ? ' · ' + libPaiement(v.paiement) : '') }, [puceCpo(v)])   /* 6 nov. : pastille CPO (VW) */
            : h('td', { text: libCategorie(v.type, v.categorie) || TYPES[v.type] || v.type, title: (TYPES[v.type] || v.type) + (v.paiement ? ' · ' + libPaiement(v.paiement) : '') + (v.type === 'usage' && v.cpo ? ' · livre : « ' + v.cpo + ' »' : '') }),
          h('td.col-cons', { text: v.conseiller || '—' }),
          cfg.dir ? h('td.col-dir', { text: v.directeur || '—', title: prd.length ? pluriel(prd.length, 'produit') + ' : ' + prd.map(function (p) { return p.libelle + (p.montant !== null ? ' ' + argent(p.montant) : ''); }).join(', ') : '' }) : null
        ].filter(Boolean).concat(montants ? [
          cfg.prix ? h('td.num', { text: argent(v.prixVente) }) : null,
          h('td.num.debut-groupe.front-estime', { text: argent(frontE(v)) }),
          cfg.frontC ? h('td.num.front-comptable', { text: frontC(v) !== null ? argent(frontC(v)) : '—' }) : null,
          cfg.frontC ? h('td.num.front-ecart' + classeEcart(ecartEC(frontE(v), frontC(v))), { text: ecartEC(frontE(v), frontC(v)) === null ? '—' : signe(ecartEC(frontE(v), frontC(v))) }) : null
        ].concat(sansFI ? [] : [
          /* Le bouton « Inscrire » se trouve là où le F&I estimé manque (Maxime, 22 oct.). */
          h('td.num.debut-groupe.fi-estime', besoinFI(v) ? [AMX.ventes.peutCompleter() ? h('button.btn.petit.primaire.ventes-completer', { type: 'button', text: 'Inscrire', title: 'Inscrire le profit F&I estimé et les produits', onclick: function (e) { e.stopPropagation(); AMX.ventes.fi(v); } }) : h('span.puce.alerte', { text: 'à inscrire', title: 'Profit F&I estimé pas encore inscrit' })] : { text: v.type === 'wholesale' && fiE(v) === null ? '·' : argent(fiE(v)) }),
          cfg.fiC ? h('td.num.fi-comptable', { text: v.type === 'wholesale' && fiC(v) === null ? '·' : argent(fiC(v)) }) : null,
          cfg.fiC ? h('td.num.fi-ecart' + classeEcart(ecartEC(fiE(v), fiC(v))), { text: ecartEC(fiE(v), fiC(v)) === null ? '—' : signe(ecartEC(fiE(v), fiC(v))) }) : null
        ]).filter(Boolean) : []).concat([
          h('td.etat', { title: [v.importee ? 'Ligne lue dans le livre de la comptabilité' : '', v.livre === 'ecrit' && v.livreLigne ? 'au livre, ligne ' + v.livreLigne : ''].filter(Boolean).join(' · ') }, [v.livre === 'erreur' ? puceLivre(v) : puceEtat(v)]),
          h('td.actions', [
            v.statut === 'declaree' && v.type !== 'wholesale' && !(montants && besoinFI(v)) && AMX.ventes.peutCompleter() ? h('button.btn.petit.primaire.ventes-completer', { type: 'button', text: 'Profits F&I', title: 'Inscrire le profit F&I et les produits', onclick: function (e) { e.stopPropagation(); AMX.ventes.fi(v); } }) : null,
            !montants && besoinFI(v) && v.statut !== 'declaree' && AMX.ventes.peutCompleter() ? h('button.btn.petit.primaire.ventes-completer', { type: 'button', text: 'Profits F&I', title: 'Inscrire le profit F&I estimé et les produits', onclick: function (e) { e.stopPropagation(); AMX.ventes.fi(v); } }) : null,
            v.livre === 'ecrit' && v.statut !== 'annulee' && AMX.ventes.peutCompta() ? h('button.btn.petit.ventes-compta' + (v.statut !== 'comptabilisee' ? '.primaire' : ''), { type: 'button', text: 'Compta', title: 'Inscrire la comptabilité (colonnes vertes du livre)', onclick: function (e) { e.stopPropagation(); AMX.ventes.compta(v); } }) : null,
            v.livre === 'erreur' && (AMX.ventes.peutDeclarer() || AMX.ventes.peutCompleter()) ? h('button.btn.petit.ventes-renvoyer', { type: 'button', text: 'Renvoyer au livre', onclick: function (e) { e.stopPropagation(); renvoyer(v); } }) : null
          ])
        ]));
        tr.addEventListener('click', function () { ouvrirFiche(v); });
        if (AMX.ventes.peutRetirer(v)) tr.querySelector('td.actions').appendChild(boutonRetirer(tr, v));
        corps.appendChild(tr);
      });
      g.ajustements.forEach(function (a) { corps.appendChild(ligneAjustement(a, cfg)); });
    });
    this.elListe.appendChild(h('div.ventes-defile', [h('table.tableau.ventes-table', [h('thead', [entete, entete2]), corps])]));   /* 22 oct. : 6 colonnes de profit → défilement horizontal au besoin */
  };
  /* Une ligne hors vente (ajustement, renversement, F&I après-vente, vente à un concessionnaire) : dans le mois où elle est imputée ;
     un clic ouvre la vente d'origine, ou le détail de l'entrée quand elle n'en a pas. */
  function ligneAjustement(a, cfg) {
    var montants = cfg.montants, sansFI = cfg.sansFI;
    var tiret = function (cls) { return h('td.num' + (cls || ''), { text: '—' }); };
    var g = genreAj(a), u = unitesAj(a);
    var tr = h('tr.cliquable.ajustement.hv-' + g, { dataset: { aj: a.id }, title: GENRES_HV[g][0] + ' ' + a.id + (a.venteId ? ' — vente ' + a.venteId + ' (livrée en ' + moisLibelle(a.moisVente) + ')' : '') }, [
      h('td', [h('div', { text: AMX.fmtDateCourte(a.date) }), h('div.sous', { text: GENRES_HV[g][1] })]),
      h('td.vehicule', [h('div.nom', { text: a.vehicule || '(véhicule)' }), h('div.vin', { text: [a.stock ? '# ' + a.stock : '', a.vin && !a.venteId ? a.vin : '', a.venteId ? a.venteId + ' · ' + moisLibelle(a.moisVente) : 'hors livre'].filter(Boolean).join(' · ') })]),
      h('td', { text: a.client || '—' }),
      h('td', [h('span.badge.' + (a.type === 'neuf' ? 'vert' : (a.type === 'usage' ? 'bleu' : 'ambre')) + '.sans-point', { text: TYPES[a.type] || a.type }), h('div.sous', { text: (a.categorieLibelle || libCategorie(a.type, a.categorie)) + (u ? ' · ' + texteUnites(u) : '') })]),
      cfg.dir ? h('td.col-cons', { text: '—' }) : null,   /* sans Dir. F&I (wholesale, ou personne d'inscrit), la raison prend la colonne Conseiller */
      h('td' + (cfg.dir ? '.col-dir' : '.col-cons'), [h('div', { text: a.raison || '' }), h('div.sous', { text: 'par ' + String(a.par || '').split('@')[0] + (a.produits && a.produits.length ? ' · ' + pluriel(a.produits.length, 'produit') : '') })])
    ].filter(Boolean).concat(montants ? [cfg.prix ? tiret() : null, tiret('.debut-groupe'), cfg.frontC ? h('td.num' + classeEcart(ajFront(a)), { text: ajFront(a) ? signe(ajFront(a)) : '—' }) : null, cfg.frontC ? tiret() : null].concat(sansFI ? [] : [tiret('.debut-groupe'), cfg.fiC ? h('td.num' + classeEcart(ajFI(a)), { text: ajFI(a) ? signe(ajFI(a)) : '—' }) : null, cfg.fiC ? tiret() : null]).filter(Boolean) : [])
      .concat([h('td.etat', [h('span.puce.' + (g === 'renversement' ? 'alerte' : 'info'), { text: GENRES_HV[g][0] + ' ' + a.id })]),
        h('td.actions', [peutAnnulerAj(a) ? h('button.btn.petit.fantome', { type: 'button', text: 'Annuler', title: 'Annuler cette entrée', onclick: function (e) { e.stopPropagation(); annulerAjustement(a); } }) : null])]));
    tr.addEventListener('click', function () {
      if (!a.venteId) { ouvrirEntreeHV(a); return; }
      AMX.ventes.une(a.venteId).then(function (v) { if (v) ouvrirFiche(v); }, function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); });
    });
    return tr;
  }
  /* Le détail d'une entrée hors vente sans vente du livre (F&I après-vente d'un client, vente à un concessionnaire). */
  function ouvrirEntreeHV(a) {
    var g = genreAj(a), u = unitesAj(a);
    var lignes = [['Imputé à', capitale(moisLibelle(a.mois))], ['Concession', AMX.COMPAGNIES_TOUTES[a.compagnie] || a.compagnie], ['Véhicule', [a.vehicule, a.stock ? '# ' + a.stock : '', a.vin].filter(Boolean).join(' · ') || '—'],
      [g === 'concession' ? 'Vendu à' : 'Client', a.client || '—'], ['Catégorie', (TYPES[a.type] || a.type) + ' · ' + (a.categorieLibelle || libCategorie(a.type, a.categorie))], ['Unités', u ? texteUnites(u) : 'aucune'],
      a.front !== undefined ? ['Front', signe(ajFront(a)) + (a.pdsf ? ' (2 % du PDSF ' + argent(a.pdsf) + ')' : '')] : null, a.fi !== undefined ? ['F&I', signe(ajFI(a))] : null,
      a.produits && a.produits.length ? ['Produits', a.produits.map(function (c) { var p = AMX.ventes.produits().filter(function (x) { return x[0] === c; })[0]; return p ? p[1] : c; }).join(', ')] : null,
      ['Raison', a.raison || '—'], ['Inscrit', String(a.par || '').split('@')[0] + ' · ' + AMX.fmtDate(a.le, true)]].filter(Boolean);
    var boutons = [{ texte: 'Fermer' }];
    if (peutAnnulerAj(a) && !a.annule) boutons.unshift({ texte: 'Annuler l\'entrée…', classe: 'danger fantome', action: function (f) { f(); annulerAjustement(a); return false; } });
    AMX.modale({ titre: GENRES_HV[g][0] + ' ' + a.id, corps: h('div.ventes-form', [h('dl.kv', [].concat.apply([], lignes.map(function (l) { return [h('dt', l[0]), h('dd', { text: l[1] })]; })))]), boutons: boutons });
  }
  VueVentes.prototype.ouvrirId = function (id) {
    var d = cache.rep; var v = d ? d.ventes.filter(function (x) { return x.id === id; })[0] : null;
    if (v) { ouvrirFiche(v); return; }
    AMX.ventes.une(id).then(function (x) { ouvrirFiche(x); }, function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); });
  };
  /* ------------------------------ Exclues des ventes (2 nov.) ------------------------------ */
  /* La même vue sert aux Exclues et aux Refusées (3 nov.) : `ref` = on regarde les refusées. */
  VueVentes.prototype.vueRef = function () { return this.vue === 'refusees'; };
  VueVentes.prototype.horsVentesVue = function () {
    var d = cache.rep, ref = this.vueRef();
    return ((d && d.horsVentes) || []).filter(function (v) { return estRefusee(v) === ref; });
  };
  VueVentes.prototype.exclusVisibles = function (sauf) {
    var ref = this.vueRef(), f = ref ? this.filtresRef : this.filtresEx, q = f.recherche || '', sorte = ref ? sorteRef : sorteEx, tp = this.filtres.type;
    return this.horsVentesVue().filter(function (v) {
      if (sauf !== 'genre' && f.genre && sorte(v) !== f.genre) return false;
      if (sauf !== 'type' && tp && v.type !== tp) return false;
      if (q && !AMX.correspond([v.client, v.venduA, v.vin, v.stock, v.conseiller, vehiculeTexte(v), v.id, v.horsVente], q)) return false;
      return true;
    });
  };
  VueVentes.prototype.rendreExclues = function (copie) {
    var self = this, d = cache.rep, ref = this.vueRef(), f = ref ? this.filtresRef : this.filtresEx, tp = this.filtres.type, tous = this.horsVentesVue().filter(function (v) { return v.type === tp; });
    var sortes = ref ? SORTES_REF : SORTES_EX, sorte = ref ? sorteRef : sorteEx;
    var parGenre = {}; tous.forEach(function (v) { var g = sorte(v); parGenre[g] = (parGenre[g] || 0) + 1; });
    var resume = sortes.slice(1).filter(function (g) { return parGenre[g[0]]; }).map(function (g) { var n = parGenre[g[0]], l = g[1].toLowerCase(); return n + ' ' + (n === 1 ? l.replace(/ées$/, 'ée') : l); }).join(' · ');
    var mot = ref ? 'refusée' : 'exclue';
    this.elSous.textContent = (copie || '') + (tous.length ? (ref ? pluriel(tous.length, 'vente') + ' refusée' + (tous.length > 1 ? 's' : '') + ' en rouge au livre' : pluriel(tous.length, 'ligne') + ' du livre exclue' + (tous.length > 1 ? 's' : '') + ' des ventes') + (resume ? ' (' + resume + ')' : '') + ' — gardée' + (tous.length > 1 ? 's' : '') + ' pour consultation, jamais comptée' + (tous.length > 1 ? 's' : '') : (Array.isArray(d && d.horsVentes) ? (ref ? 'Aucune vente refusée pour cette période.' : 'Aucune ligne exclue pour cette période.') : (copie ? 'Lecture du livre…' : 'Le script n\'est pas à jour (Vente.gs) : redéployez-le pour voir les lignes ' + mot + 's.')));
    /* filtres : recherche, sorte de ligne, type */
    AMX.vider(this.elFiltres);
    this.elFiltres.classList.toggle('inv2-filtres', !!(AMX.ui2 && AMX.ui2()));
    var rech = h('input.saisie#ventes-ex-recherche', { type: 'search', placeholder: 'Client, NIV, # stock, conseiller…', value: f.recherche, 'aria-label': ref ? 'Chercher une vente refusée' : 'Chercher une ligne exclue' });
    rech.addEventListener('input', function () { f.recherche = rech.value; self.rafraichirExclues(); });
    this.nbSorteEx = {}; this.nbTypeEx = {};
    var segGenre = h('div.inv2-statuts#ventes-ex-sortes', { role: 'group', 'aria-label': 'Sorte de ligne' }, sortes.map(function (g) {
      var actif = (f.genre || '') === g[0], b = h('b', { text: '0' }); self.nbSorteEx[g[0]] = b;
      return h('button.inv2-pastille' + (actif ? '.actif' : ''), { type: 'button', 'data-genre': g[0], 'aria-pressed': actif ? 'true' : 'false', onclick: function () { f.genre = g[0]; self.rendre(); } }, [h('span', { text: g[1] }), b]);
    }));
    this.elFiltres.appendChild(h('div.recherche.inv2-recherche', [h('span', { html: AMX.icones.recherche }), rech]));
    this.elFiltres.appendChild(segGenre);
    if (typeof XLSX !== 'undefined' && !(AMX.ui2 && AMX.ui2())) this.elFiltres.appendChild(h('button.btn.petit#ventes-ex-export', { type: 'button', onclick: function () { self.exporterExclues(); } }, [AMX.svg('telecharger'), ' Excel']));
    AMX.vider(this.elKpis);
    this.elKpis.appendChild(h('p.ventes-aide', { text: ref ? 'Lignes peintes en rouge au livre de Ste-Marie (ou au statut « Refusé ») : refus de crédit, ventes tombées, ventes annulées. Elles ne comptent dans aucun chiffre (ventes, moyennes, Board, RDR, Résultats) et restent ici pour consultation. Si la couleur est retirée au livre, la vente revient à la relecture suivante. Le livre Google n\'est pas touché.' : 'Lignes Aftersale, Accommodation et Rachat de bail du livre, et ventes retirées à la main : elles ne comptent dans aucun chiffre (ventes, moyennes, Board, Résultats) et restent ici pour consultation. Le livre Google n\'est pas touché.' }));
    this.rafraichirExclues();
  };
  VueVentes.prototype.rafraichirExclues = function () {
    var self = this, d = cache.rep, ref = this.vueRef(), f = ref ? this.filtresRef : this.filtresEx, liste = this.exclusVisibles(), montants = !!(d && d.montants), q = (f.recherche || '').trim();
    var sortes = ref ? SORTES_REF : SORTES_EX, sorte = ref ? sorteRef : sorteEx;
    var cg = {}, ct = {};
    this.exclusVisibles('genre').forEach(function (v) { cg[''] = (cg[''] || 0) + 1; var g = sorte(v); cg[g] = (cg[g] || 0) + 1; });
    this.exclusVisibles('type').forEach(function (v) { ct[''] = (ct[''] || 0) + 1; ct[v.type] = (ct[v.type] || 0) + 1; });
    Object.keys(this.nbSorteEx || {}).forEach(function (k) { self.nbSorteEx[k].textContent = String(cg[k] || 0); });
    Object.keys(this.nbTypeEx || {}).forEach(function (k) { self.nbTypeEx[k].textContent = String(ct[k] || 0); });
    AMX.porteeChiffres(this.elPortee, { n: liste.length, unite: ref ? ['vente refusée', 'ventes refusées'] : ['ligne exclue', 'lignes exclues'],
      contexte: [this.periode === 'avenir' ? 'À livrer plus tard' : (this.periode === 'tout' ? 'Toutes les périodes' : capitale(this.periode.length === 4 ? 'année ' + this.periode : moisLibelle(this.periode))), this.compagnie ? (AMX.COMPAGNIES_TOUTES[this.compagnie] || this.compagnie) : ''],
      filtres: [f.genre ? (sortes.filter(function (g) { return g[0] === f.genre; })[0] || ['', ''])[1] : '', f.type ? (TYPES_VENTE.filter(function (t) { return t[0] === f.type; })[0] || ['', f.type])[1] : '', q ? '« ' + q + ' »' : ''],
      effacer: function () { if (ref) self.filtresRef = { genre: '', type: '', recherche: '' }; else self.filtresEx = { genre: '', type: '', recherche: '' }; self.rendre(); } });
    AMX.vider(this.elListe);
    if (!liste.length) { this.elListe.appendChild(h('div.carte', [h('div.ventes-vide', { text: ref ? ((f.genre || f.type || q) ? 'Aucune vente refusée pour ce filtre.' : 'Aucune vente refusée pour cette période.') : ((f.genre || f.type || q) ? 'Aucune ligne exclue pour ce filtre.' : 'Aucune ligne exclue pour cette période.') })])); return; }
    var entete = h('tr', ['Date', ref ? 'Au livre' : 'Ligne du livre', 'Véhicule', 'Client', 'Type', 'Conseiller'].map(function (t) { return h('th', { text: t }); })
      .concat(montants ? [h('th.num', { text: 'Prix' }), h('th.num', { text: 'Front', title: 'Réel inscrit par la comptabilité, sinon prévu' }), h('th.num', { text: 'F&I', title: 'Réel inscrit par la comptabilité, sinon prévu' })] : [])
      .concat([h('th', { text: 'Livre' }), h('th', { text: '' })]));
    var val = function (c, e) { return c !== null ? argent(c) : (e !== null ? argent(e) + ' prévu' : '—'); };
    var corps = h('tbody', liste.map(function (v) {
      return h('tr.cliquable' + (v.statut === 'annulee' ? '.annulee' : ''), { dataset: { id: v.id }, onclick: function () { ouvrirFiche(v); } }, [
        h('td', [h('div', { text: AMX.fmtDateCourte(dateLivraisonOk(v) ? v.dateLivraison : v.dateVente) }), h('div.sous', { text: dateLivraisonOk(v) ? 'livraison' : 'date de vente' })]),
        h('td', [h('span.puce.alerte', ref ? { text: v.statut === 'annulee' ? 'Annulée (rouge)' : 'Refusée (rouge)', title: v.annuleRaison || v.horsVente } : { text: v.horsVente || 'Exclue' })]),
        h('td.vehicule', [h('div.nom', { text: vehiculeTexte(v) || '—' }), h('div.vin', { text: [v.stock ? '# ' + v.stock : '', v.vin].filter(Boolean).join(' · ') })]),
        h('td', { text: v.client || v.venduA || '—' }),
        h('td', { text: TYPES[v.type] || v.type || '—' }),
        h('td', { text: v.conseiller || '—' })
      ].concat(montants ? [h('td.num', { text: argent(nombre(v.prixVente)) }), h('td.num', { text: val(frontC(v), frontE(v)) }), h('td.num', { text: v.type === 'wholesale' ? '—' : val(fiC(v), fiE(v)) })] : [])
       .concat([h('td', [puceLivre(v)]), h('td.actions', [estRetiree(v) && peutRemettre() ? h('button.btn.petit.ventes-remettre', { type: 'button', text: 'Remettre', title: 'Remettre cette vente dans les ventes', onclick: function (e) { e.stopPropagation(); remettreVente(v); } }) : null])]));
    }));
    this.elListe.appendChild(h('div.carte.ventes-defile', [h('table.ventes-table.ventes-ex-table', [h('thead', [entete]), corps])]));
  };
  VueVentes.prototype.exporterExclues = function () {
    if (typeof XLSX === 'undefined') return;
    var d = cache.rep, montants = !!(d && d.montants), ref = this.vueRef();
    var lignes = this.exclusVisibles().map(function (v) {
      var o = { Id: v.id, Concession: v.compagnie, 'Ligne du livre': v.horsVente, Type: TYPES[v.type] || v.type, 'Date vente': v.dateVente, 'Date livraison': v.dateLivraison, Client: v.client || v.venduA || '', '# stock': v.stock, NIV: v.vin, 'Véhicule': vehiculeTexte(v), Conseiller: v.conseiller, 'État': ETATS[v.statut] || v.statut, 'Onglet du livre': v.livreOnglet || '', 'Ligne': v.livreLigne || '' };
      if (montants) { o.Prix = nombre(v.prixVente); o['Front prévu'] = frontE(v); o['Front réel'] = frontC(v); o['F&I prévu'] = fiE(v); o['F&I réel'] = fiC(v); }
      return o;
    });
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lignes), ref ? 'Ventes refusées' : 'Exclues des ventes');
    XLSX.writeFile(wb, (ref ? 'ventes-refusees-' : 'exclues-des-ventes-') + (this.compagnie || 'groupe') + '-' + isoLocal(new Date()) + '.xlsx');
  };
  VueVentes.prototype.exporter = function () {
    if (this.vue === 'exclues' || this.vue === 'refusees') { this.exporterExclues(); return; }
    var d = cache.rep, liste = this.visibles(), montants = !!(d && d.montants), defs = AMX.ventes.produits(), sansFI = this.filtres.type === 'wholesale';
    var lignes = liste.map(function (v) {
      var o = { Id: v.id, Concession: v.compagnie, Mois: capitale(v.moisLibelle || moisLibelle(moisDeVente(v))), Type: TYPES[v.type] || v.type, 'Catégorie': libCategorie(v.type, v.categorie), CPO: v.type === 'usage' ? (v.cpoLibelle || '') : '', 'CPO (livre)': v.type === 'usage' ? (v.cpo || '') : '', 'État': ETATS[v.statut] || v.statut, 'Date vente': v.dateVente, 'Date livraison': v.dateLivraison, Client: v.client || v.venduA, 'No client (DMS)': v.noClient || '', Provenance: v.provenance || '', 'Acheté de': v.acheteDe, 'Véhicule': vehiculeTexte(v), '# Stock': v.stock, NIV: v.vin, Conseiller: v.conseiller, 'Dir. commercial (F&I)': v.directeur, Pneus: v.pneus, Paiement: libPaiement(v.paiement), 'Échange': [v.echangeStock, v.echangeModele].filter(Boolean).join(' '), 'NIV échange': v.echangeVin, 'Km échange': v.echangeKm, Livre: v.livreOnglet, 'Ligne du livre': v.livreLigne || '', Source: v.importee ? 'livre' : 'ScanAutomax', Note: v.note };
      o['Mois (livraison)'] = moisDeVente(v); o['Mois selon'] = dateLivraisonOk(v) ? 'livraison' : 'vente'; o['Mois (vente)'] = moisVenteRef(v);
      o['F&I à inscrire'] = besoinFI(v) ? 'oui' : '';
      if (montants) o['Pneus / jantes / mags ($)'] = v.pneusMontant === null || v.pneusMontant === undefined ? '' : v.pneusMontant;   /* 5 nov. */
      if (montants) { o.Holdback = v.holdback && v.holdback.holdback ? v.holdback.holdback : ''; var deb = (Array.isArray(v.banque) ? v.banque : []).filter(function (x) { return x.genre === 'deboursement'; })[0]; o['Déboursé BMW FS'] = deb ? deb.date : ''; }   /* 26 oct. */
      if (montants) { o['Front estimé'] = frontE(v); o['Front comptable'] = frontC(v); o['Écart front'] = ecartEC(frontE(v), frontC(v)); o['F&I estimé'] = fiE(v); o['F&I comptable'] = fiC(v); o['Écart F&I'] = ecartEC(fiE(v), fiC(v)); o['Profit estimé (total)'] = estimeDe(v); o['Profit comptable (total)'] = comptableDe(v); o['Écart (total)'] = ecartDe(v); o['Prix de vente'] = v.prixVente; o['Profit front prévu'] = v.profitPrevu; o['Profit F&I prévu'] = v.profitFIPrevu; o.Accessoires = v.accessoires; o['Valeur échange accordée'] = v.echangeValeur; o['Évaluation échange'] = v.echangeEvaluation; o['Over / under'] = v.overUnder; o['Profit front réel'] = v.profitReel; o['Profit F&I réel'] = v.profitFIReel; var prd = produitsDe(v); defs.forEach(function (p) { o[p[1]] = prd[p[0]] === undefined ? '' : prd[p[0]]; }); }
      if (sansFI) { ['Dir. commercial (F&I)', 'Pneus', 'Pneus / jantes / mags ($)', 'F&I à inscrire', 'F&I estimé', 'F&I comptable', 'Écart F&I', 'Profit F&I prévu', 'Profit F&I réel'].concat(defs.map(function (p) { return p[1]; })).forEach(function (k) { delete o[k]; }); }   /* 1er nov. : pas de F&I en wholesale */
      return o;
    });
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lignes), 'Livre des ventes');
    XLSX.writeFile(wb, 'livre-des-ventes-' + (this.compagnie || 'groupe') + '-' + isoLocal(new Date()) + '.xlsx');
  };

  /* ------------------------------ Récapitulatif ------------------------------ */
  VueVentes.prototype.chargerRecap = function (force) {
    var self = this, cie = this.compagnie, annee = this.annee, type = this.filtres.type, cle = cleDe(cie, annee) + (type ? '|' + type : '');
    cacheRecap.vue = cle;
    if (!cacheRecap.rep || cacheRecap.cle !== cle) {
      AMX.vider(this.elVueRecap); this.elVueRecap.appendChild(AMX.chargeur('Récapitulatif des ventes'));
      AMX.ventes.copieRecap(cie, annee, type).then(function (o) { if (o && o.donnees && cacheRecap.vue === cle && (!cacheRecap.rep || cacheRecap.cle !== cle)) { try { verifierRecap(o.donnees); cacheRecap.rep = o.donnees; cacheRecap.cle = cle; cacheRecap.quand = 0; cacheRecap.copieLe = o.quand; self.rendreRecap(); } catch (e) {} } }).catch(function () {});
    }
    AMX.ventes.recap(cie, annee, force, type).then(function () { if (cacheRecap.vue !== cle) return; self.rendreCies(); self.rendreRecap(); if (force === true) AMX.toast('Récapitulatif mis à jour', 'ok'); }, function (e) {
      if (cacheRecap.vue !== cle) return;
      var msg = AMX.erreurTexte(e);
      self.elSous.textContent = /route|absent|inconnue|pas à jour/i.test(msg) ? 'Route absente — redéployez le script (Vente.gs).' : msg;
      if (!cacheRecap.rep) { AMX.vider(self.elVueRecap); self.elVueRecap.appendChild(h('div.carte', [h('div.ventes-vide', { text: msg })])); }
      else AMX.toast('Récapitulatif : mise à jour impossible (' + msg + ') — copie affichée', 'erreur');
    });
  };
  VueVentes.prototype.rendreRecap = function () {
    var self = this, r = cacheRecap.rep, el = this.elVueRecap;
    if (this.vue !== 'recap' || !r) return;
    if (cacheRecap.vue && cacheRecap.cle !== cacheRecap.vue) { this.elSous.textContent = 'Lecture du récapitulatif…'; if (!el.querySelector('.amx-chargeur')) { AMX.vider(el); el.appendChild(AMX.chargeur('Récapitulatif des ventes')); } return; }
    /* 3 nov. : un seul type. Le script à jour ne compte que lui (r.type) ; un script d'avant renvoie tout : on prend la colonne
       du type, et les tableaux mêlés (conseillers, produits, paiements) attendent le script. */
    var tp = this.filtres.type, parServeur = r.type === tp, sansFIr = tp === 'wholesale', nomType = libelleTypeOnglet(tp);
    var montants = !!r.montants, T = r.totaux || {}, tot = (parServeur ? T.total : T[tp]) || {};
    var copie = cacheRecap.copieLe ? 'Copie du ' + AMX.copieTexte(cacheRecap.copieLe) + ' — mise à jour en cours… · ' : '';
    this.elSous.textContent = copie + 'Année ' + r.annee + ' · ' + nomType + ' · ' + pluriel((parServeur ? r.nombre : tot.n) || 0, 'vente') + (tot.attenteFI ? ' · ' + tot.attenteFI + ' en attente du F&I' : '') + (tot.compta ? ' · ' + tot.compta + ' comptabilisée' + (tot.compta > 1 ? 's' : '') : '') + (r.genereLe && !cacheRecap.copieLe ? ' · calculé à ' + AMX.fmtDate(r.genereLe, true).replace(/^\S+\s/, '') : '');
    AMX.vider(el);
    var aller = function (mois) { var p = { type: tp }; if (mois) p.mois = mois; AMX.aller('ventes', 'liste', p); };
    var cle = function (a) { return a && a.n ? (a.reel ? a.reel + ' réel' + (a.prevu ? ' · ' + a.prevu + ' prévu' : '') : (a.prevu ? a.prevu + ' au prévu' : '')) : ''; };
    /* Chiffres clés */
    var kpis = h('div.kpis');
    var kpi = function (valeur, libelle, sous, cls, onclick) { return h('div.kpi' + (cls ? '.' + cls : '') + (onclick ? '.cliquable' : ''), onclick ? { role: 'button', tabindex: '0', onclick: onclick } : {}, [h('div.valeur', { text: String(valeur) }), h('div.libelle', { text: libelle }), sous ? h('div.sous', { text: sous }) : null]); };
    kpis.appendChild(kpi(tot.n || 0, 'Ventes ' + r.annee + ' — ' + nomType, cle(tot), 'neutre', function () { aller(r.annee); }));
    if (montants) {
      kpis.appendChild(kpi(argent(tot.profit), sansFIr ? 'Profit' : 'Profit (front + F&I)', 'front ' + argent(tot.front) + ' · F&I ' + argent(tot.fi) + (tot.nFi ? ' · F&I inscrit sur ' + tot.nFi + ' vente' + (tot.nFi > 1 ? 's' : '') : ''), 'neutre'));
      if (tot.frontEstime !== undefined) {   /* 22 oct. : front (voiture) et F&I séparés, estimé / comptable / écart (script à jour) */
        var q = function (pref, K) { return { estime: tot[pref + 'Estime'], nEstime: tot['n' + K + 'Estime'], comptable: tot[pref + 'Comptable'], nComptable: tot['n' + K + 'Comptable'], ecart: tot['ecart' + K], nPaires: tot['n' + K + 'Paires'] }; };
        kpis.appendChild(carteComparaison('ventes-recap-front', 'Front (voiture)', q('front', 'Front')));
        if (!sansFIr) kpis.appendChild(carteComparaison('ventes-recap-fi', 'F&I', q('fi', 'FI')));
      }
      kpis.appendChild(kpi(tot.n ? argent(tot.profit / tot.n) : '—', 'Profit / véhicule', tot.nFront ? 'front ' + argent(tot.front / tot.nFront) + (tot.nFi ? ' · F&I ' + argent(tot.fi / tot.nFi) : '') : '', 'neutre'));
      if (!sansFIr) kpis.appendChild(kpi(argent(tot.produitsMontant), 'Produits F&I', pluriel(tot.produits || 0, 'produit') + ' vendu' + (tot.produits > 1 ? 's' : ''), 'neutre'));
    }
    if (tot.nAj && tot.uHors !== undefined) kpis.appendChild(kpi((tot.n + tot.uHors) + '', 'Unités nettes', pluriel(tot.n, 'vente') + (tot.uHors ? ' ' + (tot.uHors > 0 ? '+ ' : '− ') + Math.abs(tot.uHors) + ' hors vente' : '') + ' · ' + [tot.nRenv ? pluriel(tot.nRenv, 'renversement') : '', tot.nConc ? tot.nConc + ' à un concessionnaire' : '', tot.nFiApres ? tot.nFiApres + ' F&I après-vente' : ''].filter(Boolean).join(', '), 'neutre'));
    if (!sansFIr) kpis.appendChild(kpi(tot.attenteFI || 0, 'Attente F&I', '', tot.attenteFI ? 'alerte' : '', function () { self.filtres.etat = 'declaree'; aller(r.annee); }));
    if (!sansFIr && tot.fiAInscrire !== undefined) kpis.appendChild(kpi(tot.fiAInscrire || 0, 'F&I à inscrire', 'F&I estimé manquant', tot.fiAInscrire ? 'alerte' : '', function () { self.filtres.etat = 'sansFI'; aller(r.annee); }));
    kpis.appendChild(kpi(tot.compta || 0, 'Comptabilisées', tot.n ? Math.round(100 * (tot.compta || 0) / tot.n) + ' %' : '', ''));
    el.appendChild(kpis);
    /* Par mois */
    var th = function (t, cls) { return h('th' + (cls ? '.' + cls : ''), { text: t }); };
    var tdN = function (a, type, mois) {
      var td = h('td.num' + (a.n ? '.cliquable' : (a.uHors ? '' : '.vide')), { text: a.n ? String(a.n) : (a.uHors ? '0' : '·'), onclick: a.n ? function (e) { e.stopPropagation(); aller(mois, type); } : null });
      if (a.uHors) { td.appendChild(h('span.hv-unites', { text: ' ' + (a.uHors > 0 ? '+' : '−') + Math.abs(a.uHors), title: 'Unités hors vente : ' + [a.nRenv ? pluriel(a.nRenv, 'renversement') + ' (−1)' : '', a.nConc ? a.nConc + ' vente(s) à un concessionnaire' : ''].filter(Boolean).join(', ') + ' — unités nettes : ' + (a.n + a.uHors) })); }
      return td;
    };
    var tdM = function (x, vide, aj) { return h('td.num' + (vide ? '.vide' : '') + (aj ? '.avec-aj' : ''), { text: vide ? '·' : argent(x), title: aj ? 'Dont hors vente : ' + signe(aj) + ' (ajustements, renversements, F&I après-vente, ventes à un concessionnaire)' : '' }); };
    var tdEcart = function (x, n, e, c) { return h('td.num' + (n ? classeEcart(x) : '.vide'), { text: n ? signe(x) : '·', title: n ? 'Comptable − estimé, sur ' + pluriel(n, 'vente') + ' qui ont les deux (estimé ' + argent(e) + ', comptable ' + argent(c) + ')' : '' }); };
    var comparer = montants && tot.frontEstime !== undefined;   /* script d'avant : front / F&I comme avant */
    var rs2 = comparer ? { rowspan: '2' } : {};
    var thR2 = function (t, cls) { return h('th' + (cls ? '.' + cls : ''), Object.assign({ text: t }, rs2)); };
    var enteteMois = h('tr', [thR2('Mois'), thR2('Ventes', 'num')]
      .concat(comparer ? [h('th.groupe-col.debut-groupe', { colspan: '3', text: 'Front (voiture)' }), h('th.groupe-col.debut-groupe', { colspan: '3', text: 'F&I' }), thR2('Profit / véh.', 'num.debut-groupe')] : (montants ? [th('Front', 'num'), th('F&I', 'num'), th('Profit', 'num'), th('/ véh.', 'num')] : []))
      .concat([thR2('Au prévu', 'num'), thR2('F&I à inscrire', 'num'), thR2('Attente F&I', 'num'), thR2('Compta', 'num')]));
    var enteteMois2 = comparer ? h('tr', ['Estimé', 'Comptable', 'Écart', 'Estimé', 'Comptable', 'Écart'].map(function (t, i) { return h('th.num' + (i % 3 === 0 ? '.debut-groupe' : ''), { text: t }); })) : null;
    var corpsMois = h('tbody');
    var ligneMois = function (libelle, e, cls, mois) {
      var t = (parServeur ? e.total : e[tp]) || {}, tr = h('tr' + (cls ? '.' + cls : '') + (t.n ? '.cliquable' : '.mois-vide'), [
        h('td', { text: libelle }), tdN(t, tp, mois)
      ].concat(comparer ? [
        h('td.num.debut-groupe' + (t.nFrontEstime ? '' : '.vide'), { text: t.nFrontEstime ? argent(t.frontEstime) : '·' }), tdM(t.frontComptable, !t.nFrontComptable && !t.nAj, t.nAj ? t.ajFront : 0), tdEcart(t.ecartFront, t.nFrontPaires, t.frontPairesE, t.frontPairesC),
        h('td.num.debut-groupe' + (t.nFIEstime ? '' : '.vide'), { text: t.nFIEstime ? argent(t.fiEstime) : '·' }), tdM(t.fiComptable, !t.nFIComptable && !t.nAj, t.nAj ? t.ajFI : 0), tdEcart(t.ecartFI, t.nFIPaires, t.fiPairesE, t.fiPairesC),
        h('td.num.debut-groupe' + (t.n ? '' : '.vide'), { text: t.n ? argent(t.profit / t.n) : '·' })
      ] : (montants ? [tdM(t.front, !t.n), tdM(t.fi, !t.n), tdM(t.profit, !t.n), tdM(t.n ? t.profit / t.n : 0, !t.n)] : [])).concat([
        h('td.num' + (t.prevu ? '' : '.vide'), { text: t.prevu ? String(t.prevu) : '·', title: 'Profit prévu seulement (réel pas encore inscrit par la comptabilité)' }),
        h('td.num' + (t.fiAInscrire ? '.alerte' : '.vide'), { text: t.fiAInscrire ? String(t.fiAInscrire) : '·', title: 'Ventes sans profit F&I estimé (hors wholesale)' }),
        h('td.num' + (t.attenteFI ? '.alerte' : '.vide'), { text: t.attenteFI ? String(t.attenteFI) : '·' }),
        h('td.num' + (t.compta ? '' : '.vide'), { text: t.compta ? String(t.compta) : '·' })
      ]));
      if (t.n && mois) tr.addEventListener('click', function () { aller(mois); });
      return tr;
    };
    r.mois.forEach(function (e) { corpsMois.appendChild(ligneMois(capitale(e.libelle || moisLibelle(e.mois)), e, '', e.mois)); });
    corpsMois.appendChild(ligneMois('Total ' + r.annee, T, 'total', r.annee));
    el.appendChild(h('div.carte', [h('h3', ['Par mois de livraison', h('span.sous', { text: (comparer ? '— front (la voiture) et F&I séparés : estimé = prévu, comptable = réel inscrit, écart = comptable − estimé sur les ventes qui ont les deux ; ' : (montants ? '— profit = front + F&I, réel quand la comptabilité l\'a inscrit, sinon prévu ; ' : '— ')) + 'date de vente quand il n\'y a pas de date de livraison ; annulées exclues' })]), h('div.defile', [h('table.tableau#ventes-recap-mois', [h('thead', [enteteMois, enteteMois2]), corpsMois])])]));
    /* Conseillers, catégories */
    var tableConseillers = function (liste, titre, avecTypes) {
      if (!liste || !liste.length) return null;
      var en = h('tr', [th('Nom')].concat(avecTypes ? [th('Neufs', 'num'), th('Occasions', 'num'), th('Wholesale', 'num')] : []).concat([th('Ventes', 'num')]).concat(montants ? [th('Front', 'num'), th('F&I', 'num'), th('Profit', 'num'), th('/ véh.', 'num')] : []).concat([th('Attente F&I', 'num')]));
      var tb = h('tbody', liste.map(function (c) {
        return h('tr', [h('td', { text: c.nom || c.libelle || AMX.COMPAGNIES_TOUTES[c.compagnie] || c.compagnie })].concat(avecTypes ? [h('td.num', { text: String(c.neuf || 0) }), h('td.num', { text: String(c.usage || 0) }), h('td.num', { text: String(c.wholesale || 0) })] : []).concat([h('td.num', { text: String(c.n) })]).concat(montants ? [tdM(c.front), tdM(c.fi), tdM(c.profit), tdM(c.n ? c.profit / c.n : 0)] : []).concat([h('td.num' + (c.attenteFI ? '.alerte' : '.vide'), { text: c.attenteFI ? String(c.attenteFI) : '·' })]));
      }));
      return h('div.carte', [h('h3', { text: titre }), h('div.defile', [h('table.tableau', [h('thead', [en]), tb])])]);
    };
    var cartes = [];
    if (!parServeur) cartes.push(h('div.carte', [h('p.ventes-aide', { text: 'Pour voir les conseillers, les produits F&I et les modes de paiement de l\'onglet ' + nomType + ' seulement, redéployez le script (Vente.gs).' })]));
    if (parServeur && !r.compagnie && r.concessions && r.concessions.length > 1) cartes.push(tableConseillers(r.concessions.map(function (c) { return Object.assign({}, c, { nom: AMX.COMPAGNIES_TOUTES[c.compagnie] || c.compagnie }); }), 'Par concession', false));
    if (parServeur) cartes.push(tableConseillers(r.conseillers, 'Par conseiller', false));
    if (parServeur && !sansFIr && r.directeurs && r.directeurs.length) cartes.push(tableConseillers(r.directeurs, 'Par directeur commercial (F&I)', false));
    if (r.categories && r.categories.length) cartes.push(tableConseillers(r.categories.filter(function (c) { return c.type === tp; }).map(function (c) { return Object.assign({}, c, { nom: (c.typeLibelle || TYPES[c.type] || c.type) + ' · ' + (c.libelle || c.categorie || '—') }); }), 'Par catégorie', false));
    cartes.filter(Boolean).forEach(function (c) { el.appendChild(c); });
    /* Produits F&I et modes de paiement */
    var deux = h('div.deux');
    if (parServeur && !sansFIr && r.produits && r.produits.length) {
      var tbP = h('tbody', r.produits.map(function (p) { return h('tr' + (p.n ? '' : '.mois-vide'), [h('td', { text: p.libelle }), h('td.num', { text: p.n ? String(p.n) : '·' })].concat(montants ? [tdM(p.montant, !p.n)] : []).concat([h('td.num', { text: p.n && tot.n ? Math.round(100 * p.n / tot.n) + ' %' : '·' })])); }));
      deux.appendChild(h('div.carte', [h('h3', ['Produits F&I', h('span.sous', { text: '— ' + pluriel(tot.produits || 0, 'produit') + ' sur ' + pluriel(tot.n || 0, 'vente') })]), h('table.tableau', [h('thead', [h('tr', [th('Produit'), th('Vendus', 'num')].concat(montants ? [th('Montant', 'num')] : []).concat([th('Pénétration', 'num')]))]), tbP])]));
    }
    if (parServeur && r.paiements) {
      var P = r.paiements, nP = (P.financementBmw || 0) + (P.financementAutre || 0) + (P.financement || 0) + (P.location || 0) + (P.comptant || 0) + (P.inconnu || 0);
      var tbPay = h('tbody', [['financementBmw', 'Financement BMW'], ['financementAutre', 'Financement autre'], ['financement', 'Financement'], ['location', 'Location'], ['comptant', 'Comptant'], ['inconnu', 'Non inscrit']].filter(function (p) { return !/^financement(Bmw|Autre)$/.test(p[0]) || P[p[0]]; }).map(function (p) { return h('tr', [h('td', { text: p[1] }), h('td.num', { text: String(P[p[0]] || 0) }), h('td.num', { text: nP ? Math.round(100 * (P[p[0]] || 0) / nP) + ' %' : '·' })]); }));
      var pneus = tot.pneusInscrits ? Math.round(100 * tot.pneusOui / tot.pneusInscrits) + ' % (' + tot.pneusOui + ' / ' + tot.pneusInscrits + ')' : '—';
      deux.appendChild(h('div.carte', [h('h3', ['Modes de paiement', h('span.sous', { text: '— ' + nomType })]), h('table.tableau', [h('thead', [h('tr', [th('Mode'), th('Ventes', 'num'), th('Part', 'num')])]), tbPay]),
        h('p.ventes-aide', { style: { marginTop: '10px' }, text: 'Pneus vendus : ' + pneus + (montants ? ' · accessoires ' + argent(tot.accessoires) + ' · over / under ' + signe(tot.overUnder) : '') })]));
    }
    if (deux.childNodes.length) el.appendChild(deux);
    if (typeof XLSX !== 'undefined') el.appendChild(h('div.actions', { style: { justifyContent: 'flex-end' } }, [h('button.btn#ventes-recap-export', { type: 'button', onclick: function () { self.exporterRecap(); } }, [AMX.svg('telecharger'), ' Excel du récapitulatif'])]));
  };
  VueVentes.prototype.exporterRecap = function () {
    var r = cacheRecap.rep; if (!r) return;
    var montants = !!r.montants;
    var ligne = function (nom, a) { var o = { '': nom, Ventes: a.n || 0 }; if (montants) { if (a.frontEstime !== undefined) { o['Front estimé'] = a.frontEstime; o['Front comptable'] = a.frontComptable; o['Écart front'] = a.nFrontPaires ? a.ecartFront : ''; o['F&I estimé'] = a.fiEstime; o['F&I comptable'] = a.fiComptable; o['Écart F&I'] = a.nFIPaires ? a.ecartFI : ''; } if (a.fiAInscrire !== undefined) o['F&I à inscrire'] = a.fiAInscrire; o.Front = a.front; o['F&I'] = a.fi; o.Profit = a.profit; o['Profit / véh.'] = a.n ? Math.round(100 * a.profit / a.n) / 100 : ''; o.Accessoires = a.accessoires; o['Over / under'] = a.overUnder; o['Produits F&I $'] = a.produitsMontant; } o['Au prévu'] = a.prevu || 0; o['Réel inscrit'] = a.reel || 0; o['Attente F&I'] = a.attenteFI || 0; o['Comptabilisées'] = a.compta || 0; o['Produits F&I'] = a.produits || 0; return o; };
    var tp = this.filtres.type, cleT = r.type === tp ? 'total' : tp, nomT = libelleTypeOnglet(tp);   /* 3 nov. : le type de l'onglet seulement */
    var mois = []; r.mois.forEach(function (e) { if (e[cleT] && e[cleT].n) mois.push(Object.assign({ Mois: capitale(e.libelle), Type: nomT }, ligne('', e[cleT]))); });
    if (r.totaux[cleT]) mois.push(Object.assign({ Mois: 'Année ' + r.annee, Type: nomT }, ligne('', r.totaux[cleT])));
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mois.map(function (o) { delete o['']; return o; })), 'Par mois');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((r.conseillers || []).map(function (c) { return Object.assign({ Conseiller: c.nom, Neufs: c.neuf, 'Occasions': c.usage, Wholesale: c.wholesale }, ligne('', c)); }).map(function (o) { delete o['']; return o; })), 'Conseillers');
    if (r.directeurs && r.directeurs.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r.directeurs.map(function (c) { var o = Object.assign({ 'Directeur commercial': c.nom }, ligne('', c)); delete o['']; return o; })), 'F&I');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((r.categories || []).map(function (c) { var o = Object.assign({ Type: c.typeLibelle || c.type, 'Catégorie': c.libelle || c.categorie }, ligne('', c)); delete o['']; return o; })), 'Catégories');
    if (!r.compagnie && r.concessions) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r.concessions.map(function (c) { var o = Object.assign({ Concession: AMX.COMPAGNIES_TOUTES[c.compagnie] || c.compagnie, Neufs: c.neuf, 'Occasions': c.usage, Wholesale: c.wholesale }, ligne('', c)); delete o['']; return o; })), 'Concessions');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet((r.produits || []).map(function (p) { var o = { Produit: p.libelle, Vendus: p.n }; if (montants) o.Montant = p.montant; return o; })), 'Produits F&I');
    XLSX.writeFile(wb, 'recapitulatif-ventes-' + (tp === 'usage' ? 'occasion' : tp) + '-' + (r.compagnie || 'groupe') + '-' + r.annee + '.xlsx');
  };

  /* ------------------------------ Fiche d'une vente ------------------------------ */
  function ouvrirFiche(v) {
    injecterCss();
    var corps = h('div.ventes-fiche', [h('p.ventes-aide', 'Chargement de l\'historique…')]);
    var m = AMX.modale({ titre: (vehiculeTexte(v) || 'Vente') + (v.client || v.venduA ? ' — ' + (v.client || v.venduA) : ''), corps: corps, boutons: [{ texte: 'Fermer' }] });
    var poser = function (x) { AMX.vider(corps); remplirFiche(corps, x); m.boutons(boutonsFiche(x, m.fermer)); };
    var veutAj = (cache.rep && cache.rep.montants) || AMX.ventes.peutCompta();
    if (v.journal !== undefined && (v.ajustements !== undefined || !veutAj)) { poser(v); return m; }
    if (v.journal !== undefined) poser(v);   /* affichée tout de suite, puis complétée de ses ajustements */
    AMX.ventes.une(v.id).then(function (x) { if (x) { if (cache.rep) { var i = cache.rep.ventes.findIndex(function (y) { return y.id === x.id; }); if (i >= 0) cache.rep.ventes[i] = x; } poser(x); } else poser(v); }, function () { poser(v); });
    return m;
  }
  function remplirFiche(corps, v) {
    var d = cache.rep, montants = d && d.montants !== undefined ? !!d.montants : AMX.ventes.montants();
    if (v.montantsMasques) montants = false;
    var ws = v.type === 'wholesale', prd = produitsListe(v), aEchange = !!(v.echangeStock || v.echangeModele || v.echangeVin);
    var dl = function (lignes) { return h('dl', lignes.filter(Boolean).map(function (x) { return [h('dt', { text: x[0] }), h('dd', x[1] instanceof Node ? [x[1]] : { text: String(x[1]) })]; })); };
    corps.appendChild(h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '10px' } }, [v.horsVente ? h('span.puce.alerte', estRefusee(v) ? { text: 'Refusée · en rouge au livre', title: 'Ligne peinte en rouge au livre (ou au statut « Refusé ») : elle ne compte dans aucun chiffre (ventes, moyennes, Board, RDR, Résultats)' } : { text: 'Exclue des ventes · ' + v.horsVente, title: 'Ligne du livre qui n\'est pas une vente : elle ne compte dans aucun chiffre (ventes, moyennes, Board, Résultats)' }) : null, puceEtat(v), puceLivre(v), h('span.puce.mono', { text: v.id }), v.importee ? h('span.puce', { text: 'importée du livre', title: 'Ligne lue dans le livre de la comptabilité' }) : null, h('span.puce', { text: capitale(v.moisLibelle || moisLibelle(moisDeVente(v))), title: 'Mois afférent (date de vente inscrite)' })]));
    corps.appendChild(dl([
      ['Concession', AMX.COMPAGNIES_TOUTES[v.compagnie] || v.compagnie], ['Type', (TYPES[v.type] || v.type) + ' · ' + libCategorie(v.type, v.categorie)], v.type === 'usage' && (v.cpoNiveau || v.cpo) ? ['CPO', (v.cpoLibelle || 'Pas CPO') + (v.cpo ? ' — livre : « ' + v.cpo + ' »' : '')] : null, ['Date de vente', AMX.fmtDate(v.dateVente)], ['Livraison', v.dateLivraison ? AMX.fmtDate(v.dateLivraison) : '—'],
      v.dateRdr ? ['Date RDR', AMX.fmtDate(v.dateRdr) + (v.codeRdr ? ' · code ' + v.codeRdr : '')] : (v.type === 'neuf' && v.statut !== 'annulee' && !v.horsVente ? ['Date RDR', h('span.puce' + (dateLivraisonOk(v) ? '.alerte' : ''), { text: 'pas inscrite au livre' })] : null),
      [ws ? 'Vendu à' : 'Client', v.client || v.venduA || '—'], v.noClient ? ['No client (DMS)', v.noClient] : null, v.telephone ? ['Téléphone', AMX.telephoneTexte ? AMX.telephoneTexte(v.telephone) : v.telephone] : null, v.courriel ? ['Courriel', v.courriel] : null,
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
    if (!ws) corps.appendChild(h('h4', 'F&I — directeur commercial'));   /* 1er nov. : pas de F&I en wholesale */
    if (!ws) corps.appendChild(dl([
      ['Directeur commercial', v.directeur || '—'],
      montants ? ['F&I estimé', besoinFI(v) ? h('span.puce.alerte', { text: 'à inscrire' }) : argent(fiE(v))] : null, montants ? ['F&I comptable', fiC(v) === null ? 'pas encore inscrit' : argent(fiC(v))] : null,
      montants && ecartEC(fiE(v), fiC(v)) !== null ? ['Écart F&I', h('span' + classeEcart(ecartEC(fiE(v), fiC(v))), { text: signe(ecartEC(fiE(v), fiC(v))) + ' (comptable − estimé)' })] : null,
      ['Pneus / jantes / mags', (v.pneus === 'oui' ? 'Oui' : (v.pneus === 'non' ? 'Non' : '—')) + (montants && v.pneusMontant ? ' · ' + argent(v.pneusMontant) : '')],
      ['Produits', prd.length ? h('div.produits', prd.map(function (p) { return h('span.puce.info', { text: p.libelle + (montants && p.montant !== null ? ' · ' + argent(p.montant) : '') }); })) : (v.statut === 'declaree' ? 'en attente du F&I' : '—')],
      v.statut === 'declaree' || v.fiAviseLe ? ['F&I prévenu', v.fiAviseLe ? AMX.fmtDate(v.fiAviseLe, true) + (v.fiAvises ? ' → ' + v.fiAvises : '') + (v.fiRappelLe ? ' · rappel le ' + AMX.fmtDate(v.fiRappelLe, true) : (v.statut === 'declaree' ? ' · rappel après 24 h' : '')) : 'aucun courriel parti (pas de destinataire F&I)'] : null
    ]));
    /* 26 oct. : ce que la comptabilité a inscrit dans les colonnes vertes du livre (lu à chaque relecture).
       Montré seulement à qui voit les montants ou a le droit « Ventes — comptabilité » (Maxime, 26 oct.). */
    var voitCompta = montants || AMX.ventes.peutCompta();
    if (voitCompta) corps.appendChild(h('h4', 'Comptabilité'));
    var compta = voitCompta && Array.isArray(v.compta) ? v.compta : [];
    if (!voitCompta) { /* rien */ }
    else if (compta.length) corps.appendChild(dl(compta.map(function (x) { return [x[0], texteCompta(x[1])]; }).concat(v.comptaLe ? [['Inscrite dans ScanAutomax', (v.comptaParNom || v.comptaPar || '') + ' · ' + AMX.fmtDate(v.comptaLe, true)]] : [])));
    else corps.appendChild(h('p.ventes-aide', { text: v.livre === 'ecrit' ? 'Rien d\'inscrit encore dans les colonnes vertes du livre.' : 'La vente n\'est pas encore au livre.' }));
    if (voitCompta) {
      var extraCompta = lignesBanqueHoldback(v);
      var prdF = produitsListe(v), confF = v.fiConfirmes || {}, nConf = prdF.filter(function (p) { return confF[p.code] && confF[p.code].ok; }).length;
      if (prdF.length && !ws) extraCompta.push(['Produits F&I confirmés', nConf + ' / ' + prdF.length + (v.fiConfirmeLe ? ' · ' + AMX.fmtDate(v.fiConfirmeLe) + (v.fiConfirmeParNom ? ' par ' + v.fiConfirmeParNom : '') : (nConf ? '' : ' — à confirmer par la comptabilité (fenêtre Comptabilité)'))]);
      if (extraCompta.length) corps.appendChild(dl(extraCompta));
    }
    /* 26 oct. : ajustements de profit de cette vente (imputés à des mois suivants). */
    var ajsV = Array.isArray(v.ajustements) ? v.ajustements : ((d && d.ajustements) || []).filter(function (a) { return a.venteId === v.id; });
    if (voitCompta && ajsV.length) {
      corps.appendChild(h('h4', 'Hors vente et ajustements'));
      corps.appendChild(h('div.ventes-defile', [h('table.tableau.ventes-aj-table', [h('thead', [h('tr', ['Imputé à', 'Genre · catégorie', ws ? 'Profit' : 'Front', ws ? null : 'F&I', 'Raison', ''].filter(function (t) { return t !== null; }).map(function (t, i) { return h('th' + (i === 2 || (i === 3 && !ws) ? '.num' : ''), { text: t }); }))]),
        h('tbody', ajsV.map(function (a) {
          return h('tr' + (a.annule ? '.annulee' : ''), [h('td', [h('div', { text: capitale(moisLibelle(a.mois)) }), h('div.sous', { text: a.id + ' · ' + AMX.fmtDateCourte(a.date) })]), h('td', [h('div', { text: GENRES_HV[genreAj(a)][0] + (unitesAj(a) ? ' · ' + texteUnites(unitesAj(a)) : '') }), h('div.sous', { text: (TYPES[a.type] || a.type) + ' · ' + (a.categorieLibelle || libCategorie(a.type, a.categorie)) })]),
            h('td.num' + classeEcart(ajFront(a)), { text: a.front === undefined ? '—' : signe(ajFront(a)) }), ws ? null : h('td.num' + classeEcart(ajFI(a)), { text: a.fi === undefined ? '—' : signe(ajFI(a)) }),
            h('td', [h('div', { text: a.raison || '' }), h('div.sous', { text: (a.annule ? 'annulé' + (a.annuleRaison ? ' — ' + a.annuleRaison : '') + ' · ' : '') + 'par ' + String(a.par || '').split('@')[0] })]),
            h('td', [!a.annule && peutAnnulerAj(a) ? h('button.btn.petit.fantome', { type: 'button', text: 'Annuler', onclick: function () { annulerAjustement(a); } }) : null])]);
        }))])]));
    }
    corps.appendChild(h('h4', 'Livre et suivi'));
    corps.appendChild(dl([
      ['Livre', v.livre === 'ecrit' ? (v.livreOnglet || '') + ' · ligne ' + v.livreLigne : (v.livre === 'erreur' ? 'PAS ÉCRITE — ' + (v.livreErreur || '') : 'pas encore écrite')],
      [v.importee ? 'Importée' : 'Inscrite', (v.importee ? 'du livre' : (v.declareParNom || v.declarePar || '')) + (v.declareLe ? ' · ' + AMX.fmtDate(v.declareLe, true) : '')], v.completeLe && !ws ? ['F&I inscrit', (v.completeParNom || v.completePar || '') + ' · ' + AMX.fmtDate(v.completeLe, true)] : null,
      v.comptabiliseLe ? ['Comptabilisée', AMX.fmtDate(v.comptabiliseLe)] : null, v.statut === 'annulee' ? ['Annulée', v.annuleRaison || ''] : null
    ]));
    if (v.journal && v.journal.length) corps.appendChild(h('div.journal', [h('b', 'Historique'), h('ul', { style: { margin: '4px 0 0', paddingLeft: '16px' } }, v.journal.slice().reverse().map(function (j) { return h('li', { text: AMX.fmtDate(j.le, true) + ' — ' + j.quoi + (j.par ? ' (' + j.par + ')' : '') }); }))]));
  }
  function boutonsFiche(v, fermer) {
    var boutons = [], ouverte = v.statut !== 'annulee', fiManque = v.statut === 'declaree' || besoinFI(v);
    if (v.horsVente) {   /* 2 nov. : consultation seulement ; une vente retirée à la main peut être remise */
      if (estRetiree(v) && peutRemettre()) boutons.push({ texte: 'Remettre dans les ventes', classe: 'primaire', action: function (f) { f(); remettreVente(v); return false; } });
      if (v.livreUrl) boutons.push({ texte: 'Ouvrir le livre', action: function () { window.open(v.livreUrl, '_blank', 'noopener'); return false; } }); boutons.push({ texte: 'Fermer' }); return boutons;
    }
    /* 26 oct. : trois fenêtres — la vente (direction des ventes), le F&I (directeur commercial), la comptabilité. */
    if (ouverte && v.type !== 'wholesale' && AMX.ventes.peutCompleter()) boutons.push({ texte: fiManque ? 'Inscrire les profits F&I' : 'Profits F&I', classe: fiManque ? 'primaire' : '', action: function (f) { f(); AMX.ventes.fi(v); return false; } });
    if (ouverte && AMX.ventes.peutCompta() && moisDeVente(v) && moisDeVente(v) < moisCourant()) {
      boutons.push({ texte: 'Ajustement de profit…', title: 'Ajouter un ajustement de profit (front ou F&I) imputé au mois courant', action: function (f) { f(); ouvrirAjustement(v); return false; } });
      var ajsF = Array.isArray(v.ajustements) ? v.ajustements : ((cache.rep && cache.rep.ajustements) || []).filter(function (a) { return a.venteId === v.id; });
      if (!ajsF.some(function (a) { return !a.annule && genreAj(a) === 'renversement'; })) boutons.push({ texte: 'Renversement…', title: 'Renverser cette vente dans le mois courant : moins une unité et moins son profit — la vente garde son mois (déjà fermé)', action: function (f) { f(); ouvrirHorsVente('renversement', v); return false; } });
    }
    if (ouverte && v.type !== 'wholesale' && (AMX.ventes.peutCompta() || AMX.ventes.peutCompleter())) boutons.push({ texte: 'F&I après-vente…', title: 'Produits F&I vendus après la livraison : profit F&I sans unité, imputé au mois courant', action: function (f) { f(); ouvrirHorsVente('fiApres', v); return false; } });
    if (ouverte && v.livre === 'ecrit' && AMX.ventes.peutCompta()) boutons.push({ texte: 'Comptabilité', classe: v.statut !== 'comptabilisee' && !fiManque ? 'primaire' : '', action: function (f) { f(); AMX.ventes.compta(v); return false; } });
    if (ouverte && v.statut !== 'comptabilisee') {
      if (AMX.ventes.peutDeclarer() || AMX.ventes.peutCompleter()) boutons.push({ texte: 'Modifier la vente', action: function (f) { f(); AMX.ventes.modifier(v); return false; } });
      if (v.livre === 'erreur') boutons.push({ texte: 'Renvoyer au livre', action: function (f) { f(); renvoyer(v); return false; } });
      if (AMX.ventes.peutCompleter() || AMX.ventes.peutDeclarer()) boutons.push({ texte: 'Annuler la vente…', classe: 'danger fantome', action: function (f) { f(); modaleAnnuler(v); return false; } });
    }
    if (AMX.ventes.peutRetirer(v)) boutons.push({ texte: 'Retirer des ventes…', classe: 'danger fantome', title: 'La ligne sort des ventes et va dans Exclues (rien n\'est effacé, le livre n\'est pas touché)', action: function (f) { f(); modaleRetirer(v); return false; } });
    if (v.livreUrl) boutons.push({ texte: 'Ouvrir le livre', action: function () { window.open(v.livreUrl, '_blank', 'noopener'); return false; } });
    boutons.push({ texte: 'Fermer' });
    return boutons;
  }

  /* ------------------------------ F&I : sa propre fenêtre (26 oct.) ------------------------------ */
  /* Maxime, 26 oct. : « la boîte d'inscription des données de la vente ne doit pas être la même que le F&I ». Le directeur
     commercial n'inscrit ici que son profit F&I, les pneus et les produits ; la vente se modifie dans sa propre fenêtre. */
  /* 26 oct. (Maxime) : « la comptabilité a besoin de confirmer les produits vendus du F&I pour calculer la bonification ». Une case
     par produit inscrit par le F&I ; « Confirmer les produits » envoie venteFIConfirmer (droit « Ventes — comptabilité »). */
  function blocFIConfirmer(v, peutEcrire) {
    var prd = produitsListe(v), conf = (v && v.fiConfirmes && typeof v.fiConfirmes === 'object') ? v.fiConfirmes : {};
    var el = h('div.ventes-fi-confirmer', [h('h4', 'Produits F&I à confirmer (bonification)')]);
    if (!prd.length) { el.appendChild(h('p.ventes-aide', { text: 'Le F&I n\'a inscrit aucun produit pour cette vente.' })); return el; }
    var cases = {};
    var liste = h('div.grille', prd.map(function (p) {
      var c = conf[p.code], cb = h('input', { type: 'checkbox', checked: c && c.ok ? 'checked' : undefined, disabled: peutEcrire ? undefined : 'disabled' });
      cases[p.code] = { el: cb, avant: !!(c && c.ok) };
      return h('label.champ.inline', [cb, h('span', { text: ' ' + p.libelle + (p.montant !== null && p.montant !== undefined ? ' · ' + argent(p.montant) : '') + (c ? (c.ok ? ' — confirmé' : ' — non confirmé') + (c.le ? ' le ' + AMX.fmtDate(c.le) : '') : '') })]);
    }));
    el.appendChild(liste);
    var total = function () { var t = 0, n = 0; prd.forEach(function (p) { if (cases[p.code].el.checked) { n++; if (typeof p.montant === 'number') t += p.montant; } }); return { n: n, t: t }; };
    var resume = h('p.ventes-aide');
    var majResume = function () { var x = total(); resume.textContent = x.n + ' / ' + prd.length + ' produit(s) confirmé(s)' + (x.t ? ' · ' + argent(x.t) : '') + (v.fiConfirmeLe ? ' · dernière confirmation ' + AMX.fmtDate(v.fiConfirmeLe, true) + (v.fiConfirmeParNom ? ' par ' + v.fiConfirmeParNom : '') : ''); };
    Object.keys(cases).forEach(function (k) { cases[k].el.addEventListener('change', majResume); });
    majResume(); el.appendChild(resume);
    if (peutEcrire) el.appendChild(h('div.actions-ligne', [h('button.btn.primaire#vente-fi-confirmer', { type: 'button', text: 'Confirmer les produits', onclick: function (e) {
      var envoi = {}, change = false;
      Object.keys(cases).forEach(function (k) { var ok = cases[k].el.checked; if (ok !== cases[k].avant) change = true; envoi[k] = ok; });
      if (!change) { AMX.toast('Rien n\'a changé.', 'info'); return; }
      var b = e.currentTarget; b.classList.add('occupe');
      AMX.post({ action: 'venteFIConfirmer', id: v.id, confirmes: envoi }, { secours: false }).then(function (r) {
        b.classList.remove('occupe');
        if (r && r.vehicules && !r.vente) throw new Error(SCRIPT_PAS_A_JOUR);
        if (!r || r.ok === false || r.refuse) throw new Error((r && r.erreur) || 'refusé');
        if (r.vente) AMX.ventes.poser(r.vente);
        Object.keys(cases).forEach(function (k) { cases[k].avant = cases[k].el.checked; });
        AMX.toast('Produits F&I confirmés.', 'ok');
      }).catch(function (er) { b.classList.remove('occupe'); AMX.toast(AMX.erreurTexte(er), 'erreur', 9000); });
    } })]));
    return el;
  }
  /* 26 oct. : SAAQclic — la date de livraison vient des PDF SAAQclic déposés chaque jour dans les Drive partagés (Saaq.gs, lu
     toutes les heures par l'horloge du script). Fenêtre : état du dernier passage, dernières transactions, « Lire maintenant ». */
  function ouvrirSaaq() {
    var corps = h('div.ventes-form', [h('p.ventes-aide', { text: 'Lecture de l\'état…' })]);
    var m = AMX.modale({ titre: 'Dates de livraison SAAQclic', corps: corps, large: true, proteger: false, boutons: [{ texte: 'Fermer' }] });
    function dessiner(d) {
      AMX.vider(corps);
      if (!d || d.refuse) { corps.appendChild(h('p.ventes-aide', { text: (d && d.erreur) || 'Réservé à la direction et à la comptabilité.' })); return; }
      if (!Array.isArray(d.transactions)) { corps.appendChild(h('p.ventes-aide.alerte', { text: 'Le script n\'est pas à jour (Saaq.gs) : il faut le déployer.' })); return; }
      corps.appendChild(h('p.ventes-aide', { text: 'Chaque transaction SAAQclic (certificat d\'immatriculation temporaire) donne la date de livraison du véhicule : elle remplace celle du livre (l\'ancienne reste dans le journal de la vente). Lu toutes les heures, de 7 h à 21 h.' }));
      var e = d.etat;
      if (e) {
        corps.appendChild(h('p', { text: 'Dernier passage : ' + AMX.fmtDate(e.le, true) + ' — ' + (e.fichiers || 0) + ' PDF lu(s), ' + (e.nouvelles || 0) + ' nouvelle(s) transaction(s), ' + (e.appliquees || 0) + ' date(s) de livraison inscrite(s)' + (e.sansVente ? ', ' + e.sansVente + ' sans vente' : '') + '.' }));
        Object.keys(e.dossiers || {}).forEach(function (c) { var x = e.dossiers[c]; if (x.erreur) corps.appendChild(h('p.ventes-aide.alerte', { text: (AMX.COMPAGNIES_TOUTES[c] || c) + ' : ' + x.erreur })); });
        (e.erreurs || []).forEach(function (t) { corps.appendChild(h('p.ventes-aide.alerte', { text: t })); });
      } else corps.appendChild(h('p', { text: 'Aucun passage pour l\'instant.' }));
      var l = d.transactions.slice(0, 20);
      if (l.length) corps.appendChild(h('table.tableau', [h('thead', [h('tr', ['Date', 'Concession', 'NIV', 'Vente', 'Fichier'].map(function (t) { return h('th', { text: t }); }))]), h('tbody', l.map(function (t) {
        return h('tr', [h('td', { text: t.date }), h('td', { text: AMX.COMPAGNIES_TOUTES[t.compagnie] || t.compagnie }), h('td.mono', { text: t.vin }), h('td', { text: t.venteId ? t.venteId + (t.note ? ' · ' + t.note : '') : 'pas encore de vente' }), h('td', { text: t.fichier || '' })]);
      }))]));
      m.boutons([{ texte: 'Fermer' }, { texte: 'Lire maintenant', classe: 'primaire', action: function () {
        return AMX.post({ action: 'saaqLire', max: 10 }, { delai: 300000, secours: false }).then(function (r) {
          if (r && r.vehicules && r.fichiers === undefined) throw new Error(SCRIPT_PAS_A_JOUR);
          if (!r || r.ok === false || r.refuse) throw new Error((r && r.erreur) || 'refusé');
          AMX.toast((r.fichiers || 0) + ' PDF lu(s) · ' + (r.nouvelles || 0) + ' transaction(s) · ' + (r.appliquees || 0) + ' date(s) de livraison inscrite(s)', 'ok', 8000);
          AMX.get({ saaqEtat: 1, nc: Date.now() }, { secours: false }).then(dessiner);
          return false;
        }).catch(function (er) { AMX.toast(AMX.erreurTexte(er), 'erreur', 9000); return false; });
      } }]);
    }
    AMX.get({ saaqEtat: 1 }, { secours: false }).then(dessiner, function (er) { AMX.vider(corps); corps.appendChild(h('p.ventes-aide.alerte', { text: AMX.erreurTexte(er) })); });
  }
  /* 26 oct. : holdback (neuf BMW acheté de BMW : 2 % du PDSF d'IVS-R) et transactions BMW FS lues dans InfoBahn
     (déboursé de la vente, liens payés sur le véhicule d'échange). */
  function lignesBanqueHoldback(v) {
    var l = [], hb = v.holdback;
    if (hb) l.push(['Holdback (2 % du PDSF)', hb.holdback === null || hb.holdback === undefined ? (hb.raison || '—') : (hb.holdback === 0 ? (hb.raison || 'aucun') : argent(hb.holdback) + (hb.pdsf ? ' · PDSF ' + argent(hb.pdsf) + (hb.source ? ' (' + hb.source + ')' : '') : ''))]);
    (Array.isArray(v.banque) ? v.banque : []).forEach(function (x) {
      l.push([x.genre === 'deboursement' ? 'Déboursé BMW FS' : 'Lien payé (BMW FS)', AMX.fmtDate(x.date) + (x.montant !== undefined && x.montant !== null ? ' · ' + argent(Math.abs(x.montant)) : '') + (x.genre === 'lien' && x.vin ? ' · NIV ' + x.vin : '')]);
    });
    return l;
  }
  function resumeVente(v, montants) {
    var bouts = [vehiculeTexte(v) || '(véhicule)', v.stock ? '# ' + v.stock : '', v.client || v.venduA || '', v.conseiller ? 'conseiller ' + v.conseiller : '', v.dateVente ? 'vendue ' + AMX.fmtDateCourte(v.dateVente) : ''];
    if (montants && nombre(v.prixVente) !== null) bouts.push('prix ' + argent(nombre(v.prixVente)));
    if (montants && frontE(v) !== null) bouts.push('front prévu ' + argent(frontE(v)));
    return h('p.ventes-resume', { text: v.id + ' · ' + bouts.filter(Boolean).join(' · ') });
  }
  function ouvrirFI(v) {
    injecterCss();
    if (!AMX.ventes.peutCompleter()) { AMX.toast('Le profit F&I est réservé au directeur commercial (droit « Ventes — F&I »).', 'erreur'); return null; }
    var rep = cache.rep, montants = rep && rep.montants !== undefined ? !!rep.montants : AMX.ventes.montants();
    var val = function (x) { return x === undefined || x === null ? '' : x; };
    var defsProduits = AMX.ventes.produits(), produitsInit = produitsDe(v);
    var inDirecteur = h('input.saisie#vente-directeur', { type: 'text', list: 'vente-directeurs-fi', placeholder: 'Directeur commercial', value: v.directeur || (AMX.ventes.estFI() ? (AMX.session.nom || '') : ''), autocomplete: 'off' });
    var dlDirecteurs = h('datalist#vente-directeurs-fi');
    var nomsD = {};
    if (rep) { ((rep.personnes && rep.personnes.directeurs) || []).forEach(function (p) { nomsD[p.nom] = 1; }); ((rep.nomsConnus && rep.nomsConnus.directeurs) || []).forEach(function (n) { nomsD[n] = 1; }); if (rep.fi && rep.fi.noms) rep.fi.noms.forEach(function (n) { nomsD[n] = 1; }); }
    Object.keys(nomsD).sort().forEach(function (n) { dlDirecteurs.appendChild(h('option', { value: n })); });
    var menuDirecteur = menuPersonnes(inDirecteur, 'vente-directeur-fi-liste');
    menuDirecteur.poser(rep ? nomsDe(rep.personnes && rep.personnes.directeurs).concat((rep.fi && rep.fi.noms) || []) : []);
    var inFI = h('input.saisie#vente-fi', { type: 'text', inputmode: 'decimal', placeholder: '0,00 $', value: val(v.profitFIPrevu) });
    var pneus = v.pneus || '';
    /* 5 nov. : pneus / jantes / mags avec le montant (aussi inscrits avec la vente). */
    var inPneusMt = h('input.saisie#vente-pneus-montant', { type: 'text', inputmode: 'decimal', placeholder: 'Montant ($)', value: val(v.pneusMontant) }), pneusMtTouche = false;
    inPneusMt.addEventListener('input', function () { pneusMtTouche = true; var n = nombre(inPneusMt.value); if (n !== null && n > 0 && pneus !== 'oui') poserPneus('oui'); });
    var segPneus = h('div.segment.bloc#vente-pneus', [['', '—'], ['oui', 'Oui'], ['non', 'Non']].map(function (p) { return h('button' + (pneus === p[0] ? '.actif' : ''), { type: 'button', 'data-pneus': p[0], text: p[1], onclick: function () { poserPneus(p[0]); } }); }));
    function poserPneus(x) { pneus = x; segPneus.querySelectorAll('button').forEach(function (b) { b.classList.toggle('actif', b.dataset.pneus === x); }); }
    var produits = {};
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
    var champ = function (id, libelle, el) { return h('div.champ', [h('label', { 'for': id, text: libelle }), el]); };
    var corps = h('div.ventes-form.ventes-fi-form', [
      resumeVente(v, montants),
      h('div.grille', [champ('vente-directeur-fi-liste', 'Directeur commercial (F&I)', menuDirecteur.el), champ('vente-fi', 'Profit F&I prévu', inFI), h('div.champ.champ-pneus', [h('label', { 'for': 'vente-pneus-montant', text: 'Pneus / jantes / mags vendus' }), h('div.ventes-pneus', [segPneus, inPneusMt])])]),
      h('p.ventes-aide', 'Produits vendus — cochez et inscrivez le montant quand vous l\'avez ; la somme propose le profit F&I.'),
      elProduits, elTotalFI, dlDirecteurs
    ]);
    majTotalFI();
    return AMX.modale({
      titre: 'Profits F&I — ' + v.id, corps: corps, large: true,
      boutons: [{ texte: 'Annuler' }, { texte: v.statut === 'declaree' || besoinFI(v) ? 'Inscrire les profits F&I' : 'Enregistrer', classe: 'primaire', action: function () {
        var corpsFI = { action: 'venteCompleter', id: v.id, directeur: inDirecteur.value.trim(), profitFIPrevu: inFI.value.trim(), pneus: pneus, produits: lireProduits(), differe: true };
        if (!(v.montantsMasques && !pneusMtTouche)) corpsFI.pneusMontant = inPneusMt.value.trim();
        return AMX.post(corpsFI, { delai: 90000 }).then(function (r) {
          verifierPost(r); AMX.ventes.poser(r.vente);
          AMX.toast(r.message || 'Profits F&I inscrits', r.livre && r.livre.ok === false ? 'erreur' : 'ok', 8000);
          return true;
        }, function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); return false; });
      } }]
    });
  }

  /* ------------------------------ Comptabilité : les colonnes vertes du livre (26 oct.) ------------------------------ */
  /* Maxime, 26 oct. : « ajouter l'inscription des données de la comptabilité … ne pas oublier la date du déboursé et tout le
     reste ; la comptabilité est en vert dans le fichier ». Les colonnes viennent du livre de la concession (venteComptaLire) :
     chacune avec son genre (case, date, montant, oui/non, liste, texte) ; une colonne calculée par une formule est montrée sans
     être modifiable. Seules les cases changées partent (venteCompta), au livre d'abord, puis chez nous. */
  function texteCompta(x) {
    if (x === true) return 'Oui';
    if (typeof x === 'number') return argent(x);
    var s = String(x === null || x === undefined ? '' : x);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return AMX.fmtDate(s);
    if (/^oui$/i.test(s)) return 'Oui';
    return s;
  }
  function champCompta(col, lecture) {
    var id = 'compta-c' + col.c, init = col.valeur, el, lire;
    if (lecture || col.formule) {
      var t = col.genre === 'case' ? (col.valeur ? 'Oui' : 'Non') : (col.valeur === '' ? '—' : texteCompta(col.valeur));
      return { el: h('div.champ.compta-champ' + (col.formule ? '.calcule' : ''), [h('label', { text: col.entete }), h('div.saisie.fixe', { text: t + (col.formule ? ' · calculée dans le livre' : '') })]), change: function () { return false; } };
    }
    if (col.genre === 'case') {
      var cb = h('input', { type: 'checkbox', id: id, checked: col.valeur ? 'checked' : undefined });
      return { el: h('div.champ.compta-champ.compta-case', [h('label.case', { 'for': id }, [cb, h('span', { text: col.entete })])]), change: function () { return cb.checked !== !!init; }, valeur: function () { return cb.checked; } };
    }
    if (col.genre === 'ouinon') {
      var on = /^oui$/i.test(String(init)) ? 'oui' : (/^non$/i.test(String(init)) ? 'non' : ''), choix = on;
      var seg = h('div.segment.bloc', [['', '—'], ['oui', 'Oui'], ['non', 'Non']].map(function (p) { return h('button' + (choix === p[0] ? '.actif' : ''), { type: 'button', 'data-v': p[0], text: p[1], onclick: function () { choix = p[0]; seg.querySelectorAll('button').forEach(function (b) { b.classList.toggle('actif', b.dataset.v === choix); }); } }); }));
      seg.id = id;
      return { el: h('div.champ.compta-champ', [h('label', { 'for': id, text: col.entete }), seg]), change: function () { return choix !== on; }, valeur: function () { return choix; } };
    }
    if (col.genre === 'liste') {
      var sel = h('select.saisie', { id: id }, [h('option', { value: '', text: '—' })].concat(col.options.map(function (o) { return h('option', { value: o, text: o, selected: String(init) === o ? 'selected' : undefined }); })));
      return { el: h('div.champ.compta-champ', [h('label', { 'for': id, text: col.entete }), sel]), change: function () { return sel.value !== String(init || ''); }, valeur: function () { return sel.value; } };
    }
    if (col.genre === 'date' || col.genre === 'dateTexte') {
      var estDate = /^\d{4}-\d{2}-\d{2}$/.test(String(init)), texte = estDate ? '' : String(init || '');
      var inp = h('input.saisie', { type: 'date', id: id, value: estDate ? init : '' });
      var puces = col.genre === 'dateTexte' && col.options.length ? h('div.compta-puces', col.options.map(function (o) {
        return h('button.btn.petit' + (texte === o ? '.actif' : ''), { type: 'button', text: o, title: 'Inscrire « ' + o + ' » au lieu d\'une date', onclick: function () { texte = texte === o ? '' : o; if (texte) inp.value = ''; puces.querySelectorAll('button').forEach(function (b) { b.classList.toggle('actif', b.textContent === texte); }); } });
      })) : null;
      inp.addEventListener('input', function () { if (inp.value) { texte = ''; if (puces) puces.querySelectorAll('button').forEach(function (b) { b.classList.remove('actif'); }); } });
      var courant = function () { return inp.value || texte; };
      return { el: h('div.champ.compta-champ', [h('label', { 'for': id, text: col.entete }), inp, puces]), change: function () { return courant() !== String(init || ''); }, valeur: courant };
    }
    var saisie = h('input.saisie', { type: 'text', id: id, inputmode: col.genre === 'montant' ? 'decimal' : 'text', placeholder: col.genre === 'montant' ? '0,00 $' : '', value: init === '' || init === null || init === undefined ? '' : String(init) });
    return { el: h('div.champ.compta-champ', [h('label', { 'for': id, text: col.entete }), saisie]), change: function () { return saisie.value.trim() !== (init === null || init === undefined ? '' : String(init)); }, valeur: function () { return saisie.value.trim(); } };
  }
  function ouvrirCompta(v) {
    injecterCss();
    var rep = cache.rep, montants = rep && rep.montants !== undefined ? !!rep.montants : AMX.ventes.montants();
    var corps = h('div.ventes-form.ventes-compta', [resumeVente(v, montants), h('p.ventes-aide#compta-chargement', { text: 'Lecture de la ligne ' + (v.livreLigne || '') + ' dans le livre de la concession…' })]);
    var m = AMX.modale({ titre: 'Comptabilité — ' + v.id, corps: corps, large: true, boutons: [{ texte: 'Fermer' }] });
    var champs = [];
    /* 9 nov. : « Can't find variable: dl » chez BMW (holdback et banque BMW FS) — `dl` n'existait que dans la fiche d'une vente. */
    var dl = function (lignes) { return h('dl', lignes.filter(Boolean).map(function (x) { return [h('dt', { text: x[0] }), h('dd', x[1] instanceof Node ? [x[1]] : { text: String(x[1]) })]; })); };
    function dessiner(r) {
      AMX.vider(corps);
      corps.appendChild(resumeVente(r.vente || v, montants));
      corps.appendChild(h('p.ventes-aide', [h('span', { text: (r.titre || 'Livre des ventes') + ' › ' + r.onglet + ', ligne ' + r.ligne + ' — les colonnes vertes de la comptabilité. ' }), r.livreUrl ? h('a', { href: r.livreUrl, target: '_blank', rel: 'noopener', text: 'Ouvrir le livre' }) : null]));
      var extraW = lignesBanqueHoldback({ holdback: r.holdback, banque: (r.vente || v).banque });   /* 26 oct. : holdback et banque BMW FS */
      if (extraW.length) corps.appendChild(dl(extraW));
      if (!r.colonnes.length) { corps.appendChild(h('p.ventes-aide.alerte', { text: 'Aucune colonne verte reconnue dans cet onglet du livre.' })); return; }
      champs = [];
      var sections = [];
      r.colonnes.forEach(function (col) { var s = sections.filter(function (x) { return x.nom === col.section; })[0]; if (!s) { s = { nom: col.section, cols: [] }; sections.push(s); } s.cols.push(col); });
      sections.forEach(function (s) {
        corps.appendChild(h('h4', { text: s.nom }));
        var grille = h('div.grille.compta-grille');
        s.cols.forEach(function (col) { var c = champCompta(col, !r.peutEcrire); c.col = col; champs.push(c); grille.appendChild(c.el); });
        corps.appendChild(grille);
      });
      if ((r.vente || v).type !== 'wholesale') corps.appendChild(blocFIConfirmer(r.vente || v, r.peutEcrire));   /* 26 oct. : produits F&I confirmés (bonification) ; 1er nov. : pas en wholesale */
      if (!r.peutEcrire) corps.appendChild(h('p.ventes-aide', { text: 'Lecture seule : inscrire la comptabilité demande le droit « Ventes — comptabilité » (Admin › Droits).' }));
      m.boutons(r.peutEcrire ? [{ texte: 'Fermer' }, { texte: 'Inscrire au livre', classe: 'primaire', action: enregistrer }] : [{ texte: 'Fermer' }]);
    }
    function enregistrer() {
      var envoi = champs.filter(function (c) { return c.change(); }).map(function (c) { return { c: c.col.c, entete: c.col.entete, valeur: c.valeur() }; });
      if (!envoi.length) { AMX.toast('Rien n\'a changé.', 'info'); return false; }
      return AMX.post({ action: 'venteCompta', id: v.id, valeurs: envoi }, { delai: 90000, secours: false }).then(function (r) {
        if (r && r.vente) AMX.ventes.poser(r.vente);
        if (r && r.ok === false && !r.vente) { verifierPost(r); }
        if (r && r.vehicules && !r.vente) throw new Error(SCRIPT_PAS_A_JOUR);
        var refus = (r && r.refusees) || [];
        AMX.toast(r.message || 'Inscrit au livre', refus.length ? 'attention' : 'ok', refus.length ? 12000 : 7000);
        if (refus.length && Array.isArray(r.colonnes)) { dessiner({ titre: r.titre, onglet: lu.onglet, ligne: lu.ligne, livreUrl: lu.livreUrl, colonnes: r.colonnes, peutEcrire: true, vente: r.vente }); return false; }
        return true;
      }, function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); return false; });
    }
    var lu = {};
    AMX.post({ action: 'venteComptaLire', id: v.id }, { delai: 90000, secours: false }).then(function (r) {
      if (!r) throw new Error('Aucune réponse');
      if (r.refuse) throw new Error(r.erreur || 'Accès refusé.');
      if (r.ok === false) throw new Error(r.erreur || 'Le serveur a refusé.');
      if (!Array.isArray(r.colonnes)) throw new Error(SCRIPT_PAS_A_JOUR);
      lu = r; dessiner(r);
    }).catch(function (e) {
      AMX.vider(corps); corps.appendChild(resumeVente(v, montants));
      corps.appendChild(h('p.ventes-aide.alerte', { text: AMX.erreurTexte(e) }));
    });
    return m;
  }

  /* ------------------------------ Actions ------------------------------ */
  function renvoyer(v) {
    return AMX.post({ action: 'venteRenvoyer', id: v.id }, { delai: 90000 }).then(function (r) {
      verifierPost(r); AMX.ventes.poser(r.vente); AMX.toast(r.message || 'Renvoyée', r.livre && r.livre.ok ? 'ok' : 'erreur', 6000); return true;
    }, function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); return false; });
  }
  /* 26 oct. (Claude Poulin) : un ajustement de profit pour un dossier d'un mois déjà fermé, imputé au mois courant (ou à un mois
     suivant la vente encore ouvert), dans la catégorie voulue (neuf, démo, courtoisie, flotte, occasion, wholesale). */
  function ouvrirAjustement(v) {
    injecterCss();
    var mv = moisDeVente(v), mc = moisCourant(), options = [];
    for (var d = new Date(); options.length < 3; d.setMonth(d.getMonth() - 1)) { var m = isoLocal(d).slice(0, 7); if (m <= mv) break; options.push(m); }
    if (!options.length) { AMX.toast('Cette vente est du mois courant : corrigez directement son profit (Comptabilité).', 'attention', 6000); return; }
    var selMois = h('select.saisie#aj-mois', options.map(function (m, i) { return h('option', { value: m, text: capitale(moisLibelle(m)) + (i === 0 ? ' (mois courant)' : '') }); }));
    var selCat = h('select.saisie#aj-categorie');
    Object.keys(TYPES).forEach(function (t) {
      var og = h('optgroup', { label: TYPES[t] });
      (CATEGORIES[t] || []).forEach(function (c) { og.appendChild(h('option', { value: t + '|' + c[0], text: TYPES[t] + ' — ' + c[1] })); });
      selCat.appendChild(og);
    });
    selCat.value = v.type + '|' + (v.categorie || ((CATEGORIES[v.type] || [])[0] || [''])[0]);
    var inFront = h('input.saisie#aj-front', { type: 'text', inputmode: 'decimal', placeholder: 'ex. −1 200 ou 350', autocomplete: 'off' });
    var inFI = h('input.saisie#aj-fi', { type: 'text', inputmode: 'decimal', placeholder: 'ex. 250', autocomplete: 'off' });
    var raison = h('textarea.saisie#aj-raison', { rows: '2', maxlength: '300', placeholder: 'Écart de coût, ristourne reçue, frais refacturés…' });
    var apercu = h('div.ventes-aide');
    var maj = function () { var f = nombre(inFront.value) || 0, g = nombre(inFI.value) || 0; apercu.textContent = (f || g) ? 'Total de l\'ajustement : ' + signe(Math.round((f + g) * 100) / 100) + ' — compté dans ' + moisLibelle(selMois.value) + ', pas dans ' + moisLibelle(mv) + '.' : 'Entrez un montant (négatif pour une baisse du profit).'; };
    [inFront, inFI].forEach(function (x) { x.addEventListener('input', maj); }); selMois.addEventListener('change', maj); maj();
    var champ = function (id, lib, el) { return h('div.champ', [h('label', { 'for': id, text: lib }), el]); };
    var corps = h('div.ventes-form', [
      h('p.ventes-aide', { text: (vehiculeTexte(v) || v.id) + (v.stock ? ' · # ' + v.stock : '') + ' — vente ' + v.id + ' livrée en ' + moisLibelle(mv) + '. Le profit de la vente ne change pas : l\'ajustement compte dans le mois choisi.' }),
      h('div.grille.c2', [champ('aj-mois', 'Imputé à', selMois), champ('aj-categorie', 'Catégorie', selCat)]),
      h('div.grille.c2', v.type === 'wholesale' ? [champ('aj-front', 'Profit $', inFront), h('div')] : [champ('aj-front', 'Front (voiture) $', inFront), champ('aj-fi', 'F&I $', inFI)]),   /* 1er nov. : pas de F&I en wholesale */
      champ('aj-raison', 'Raison', raison), apercu]);
    AMX.modale({ titre: 'Ajustement de profit — ' + v.id, corps: corps, boutons: [{ texte: 'Annuler' }, { texte: 'Enregistrer l\'ajustement', classe: 'primaire', action: function () {
      var f = nombre(inFront.value), g = nombre(inFI.value), tc = selCat.value.split('|');
      if (v.type === 'wholesale') g = null;
      if (!f && !g) { AMX.toast(v.type === 'wholesale' ? 'Entrez le montant de l\'ajustement.' : 'Entrez le montant (front, F&I ou les deux).', 'erreur'); inFront.focus(); return false; }
      if (raison.value.trim().length < 3) { AMX.toast('Indiquez la raison de l\'ajustement.', 'erreur'); raison.focus(); return false; }
      return AMX.post({ action: 'venteAjustement', venteId: v.id, front: f || 0, fi: g || 0, mois: selMois.value, type: tc[0], categorie: tc[1] || '', raison: raison.value.trim() }, { delai: 90000 }).then(function (r) {
        verifierPost(r);
        if (!r.ajustement) throw new Error(SCRIPT_PAS_A_JOUR);
        if (cache.rep && cache.rep.ventes.some(function (x) { return x.id === r.vente.id; })) AMX.ventes.poser(r.vente);   /* la vente d'un autre mois n'entre pas dans la liste */
        poserAjustement(r.ajustement);
        AMX.toast('Ajustement ' + r.ajustement.id + ' imputé à ' + moisLibelle(r.ajustement.mois), 'ok');
        return true;
      }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur', 6000); return false; });
    } }] });
    setTimeout(function () { try { inFront.focus(); } catch (e) {} }, 50);
  }
  /* 28 oct. (Claude Poulin, BMW) : entrée hors vente — renversement d'une vente d'un mois fermé, F&I vendu après la livraison
     (rattaché à une vente ou non), vente de neuf à un autre concessionnaire (holdback). Imputée au mois courant par défaut. */
  function ouvrirHorsVente(genre, v, cieDefaut) {
    injecterCss();
    var choix = v ? [genre] : ['fiApres'].concat(AMX.ventes.peutCompta() ? ['concession'] : []);
    if (!genre || choix.indexOf(genre) < 0) genre = choix[choix.length - 1];
    var mv = v ? moisDeVente(v) : '', options = [];
    for (var dm = new Date(); options.length < 3; dm.setMonth(dm.getMonth() - 1)) { var m = isoLocal(dm).slice(0, 7); if (mv && (genre === 'renversement' ? m <= mv : m < mv)) break; options.push(m); }
    if (!options.length) { AMX.toast(genre === 'renversement' ? 'Cette vente est du mois courant : annulez-la plutôt.' : 'Aucun mois possible.', 'attention', 6000); return; }
    var champ = function (id, lib, el, aide) { return h('div.champ', [h('label', { 'for': id, text: lib }), el, aide ? h('div.aide', { text: aide }) : null]); };
    var selMois = h('select.saisie#hv-mois', options.map(function (m, i) { return h('option', { value: m, text: capitale(moisLibelle(m)) + (i === 0 ? ' (mois courant)' : '') }); }));
    var cies = (AMX.COMPAGNIES ? Object.keys(AMX.COMPAGNIES) : []);
    var selCie = h('select.saisie#hv-cie', cies.map(function (c) { return h('option', { value: c, text: AMX.COMPAGNIES[c] || c }); }));
    selCie.value = (v && v.compagnie) || (cieDefaut && cies.indexOf(cieDefaut) >= 0 ? cieDefaut : (cies[0] || ''));
    var selCat = h('select.saisie#hv-categorie');
    var remplirCat = function () {
      var types = genre === 'concession' ? ['neuf'] : (genre === 'fiApres' && !v ? ['neuf', 'usage'] : Object.keys(TYPES)); AMX.vider(selCat);
      types.forEach(function (t) { var og = h('optgroup', { label: TYPES[t] }); (CATEGORIES[t] || []).forEach(function (c) { og.appendChild(h('option', { value: t + '|' + c[0], text: TYPES[t] + ' — ' + c[1] })); }); selCat.appendChild(og); });
      selCat.value = v ? v.type + '|' + (v.categorie || ((CATEGORIES[v.type] || [])[0] || [''])[0]) : (genre === 'concession' ? 'neuf|stock' : 'usage|' + (((CATEGORIES.usage || [])[0] || [''])[0]));
    };
    var inVin = h('input.saisie#hv-vin', { type: 'text', maxlength: '17', autocomplete: 'off', placeholder: '17 caractères' });
    var inStock = h('input.saisie#hv-stock', { type: 'text', maxlength: '30', autocomplete: 'off' });
    var inClient = h('input.saisie#hv-client', { type: 'text', maxlength: '120', autocomplete: 'off' });
    var inVehicule = h('input.saisie#hv-vehicule', { type: 'text', maxlength: '120', autocomplete: 'off', placeholder: 'ex. 2026 BMW X3 xDrive30' });
    var inFront = h('input.saisie#hv-front', { type: 'text', inputmode: 'decimal', autocomplete: 'off' });
    var inFI = h('input.saisie#hv-fi', { type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: 'ex. 1 200' });
    var caseUnite = h('input#hv-unite', { type: 'checkbox', checked: 'checked' });
    var raison = h('textarea.saisie#hv-raison', { rows: '2', maxlength: '300' });
    var produits = h('div.ventes-produits.hv-produits'), coches = {};
    AMX.ventes.produits().forEach(function (p) { var c = h('input', { type: 'checkbox', value: p[0] }); c.addEventListener('change', function () { coches[p[0]] = c.checked; }); produits.appendChild(h('label.case', [c, h('span', { text: ' ' + p[1] })])); });
    if (v && genre === 'renversement') {
      var dft = function (c, e) { var x = c !== null ? c : e; return x === null ? '' : String(-Math.round(x * 100) / 100); };
      inFront.value = dft(frontC(v), frontE(v)); inFI.value = v.type === 'wholesale' ? '' : dft(fiC(v), fiE(v));
    }
    var apercu = h('div.ventes-aide');
    var seg = h('div.segment#hv-genre', choix.length > 1 ? choix.map(function (g) { return h('button' + (g === genre ? '.actif' : ''), { type: 'button', 'data-genre': g, text: GENRES_HV[g][0], onclick: function () { genre = g; dessiner(); } }); }) : []);
    var zone = h('div');
    var maj = function () {
      var f = nombre(inFront.value), g = nombre(inFI.value), u = genre === 'renversement' ? -1 : (genre === 'concession' ? (caseUnite.checked ? 1 : 0) : 0);
      var parts = [u ? texteUnites(u) : 'aucune unité'];
      if (f !== null) parts.push('front ' + signe(f)); else if (genre === 'concession') parts.push('holdback calculé (2 % du PDSF) si le NIV est connu');
      if (g !== null) parts.push('F&I ' + signe(g));
      apercu.textContent = 'Compté dans ' + moisLibelle(selMois.value) + ' : ' + parts.join(', ') + '.' + (v ? ' La vente ' + v.id + ' garde son mois (' + moisLibelle(mv) + ').' : '');
    };
    var dessiner = function () {
      Array.prototype.forEach.call(seg.children, function (b) { b.classList.toggle('actif', b.getAttribute('data-genre') === genre); });
      remplirCat(); AMX.vider(zone);
      var intro = { renversement: 'Moins une unité et moins le profit de la vente, dans le mois choisi (le mois de la vente est fermé). Montants proposés : le profit inscrit, en négatif.',
        fiApres: 'Produits F&I vendus après la livraison : le profit F&I compte dans le mois choisi, sans unité.' + (v ? '' : ' Pour une vente du livre, ouvrez plutôt sa fiche.'),
        concession: 'Vente d\'un neuf à un autre concessionnaire : le profit est le holdback (2 % du PDSF chez BMW, calculé tout seul si le NIV est dans IVS-R).' }[genre];
      zone.appendChild(h('p.ventes-aide', { text: (v ? (vehiculeTexte(v) || v.id) + (v.stock ? ' · # ' + v.stock : '') + ' — vente ' + v.id + ' livrée en ' + moisLibelle(mv) + '. ' : '') + intro }));
      zone.appendChild(h('div.grille.c2', [champ('hv-mois', 'Imputé à', selMois), champ('hv-categorie', 'Catégorie', selCat)]));
      if (!v) {
        zone.appendChild(h('div.grille.c2', [champ('hv-cie', 'Concession', selCie), champ('hv-client', genre === 'concession' ? 'Vendu au concessionnaire' : 'Client', inClient)]));
        zone.appendChild(h('div.grille.c3', [champ('hv-vin', 'NIV', inVin), champ('hv-stock', '# stock', inStock), champ('hv-vehicule', 'Véhicule', inVehicule)]));
      }
      if (genre === 'concession') {
        inFront.placeholder = 'vide = 2 % du PDSF';
        zone.appendChild(h('div.grille.c2', [champ('hv-front', 'Holdback (front) $', inFront), h('div.champ', [h('label.case', [caseUnite, h('span', { text: ' Compter l\'unité dans les ventes du mois' })])])]));
      } else if (genre === 'renversement') {
        inFront.placeholder = 'ex. −1 500';
        zone.appendChild(h('div.grille.c2', v && v.type === 'wholesale' ? [champ('hv-front', 'Profit $', inFront), h('div')] : [champ('hv-front', 'Front (voiture) $', inFront), champ('hv-fi', 'F&I $', inFI)]));
      } else {
        zone.appendChild(h('div.grille.c2', [champ('hv-fi', 'Profit F&I $', inFI), h('div')]));
        zone.appendChild(h('div.champ', [h('label', { text: 'Produits vendus' }), produits]));
      }
      raison.placeholder = genre === 'renversement' ? 'Client désisté, financement refusé, véhicule revenu…' : 'Facultatif';
      zone.appendChild(champ('hv-raison', genre === 'renversement' ? 'Raison' : 'Note', raison));
      zone.appendChild(apercu); maj();
    };
    [inFront, inFI].forEach(function (x) { x.addEventListener('input', maj); }); selMois.addEventListener('change', maj); caseUnite.addEventListener('change', maj);
    var corps = h('div.ventes-form', [choix.length > 1 ? seg : null, zone]);
    dessiner();
    AMX.modale({ titre: v ? GENRES_HV[genre][0] + ' — ' + v.id : 'Entrée hors vente', corps: corps, boutons: [{ texte: 'Annuler' }, { texte: 'Enregistrer', classe: 'primaire', action: function () {
      var tc = selCat.value.split('|'), f = nombre(inFront.value), g = nombre(inFI.value);
      var corpsPost = { action: 'venteAjustement', genre: genre, mois: selMois.value, type: tc[0], categorie: tc[1] || '', raison: raison.value.trim() };
      if (v) corpsPost.venteId = v.id;
      else { corpsPost.compagnie = selCie.value; corpsPost.vin = inVin.value.trim().toUpperCase(); corpsPost.stock = inStock.value.trim(); corpsPost.client = inClient.value.trim(); corpsPost.vehicule = inVehicule.value.trim(); }
      if (f !== null) corpsPost.front = f;
      if (g !== null) corpsPost.fi = g;
      if (genre === 'renversement' && corpsPost.raison.length < 3) { AMX.toast('Indiquez la raison du renversement.', 'erreur'); raison.focus(); return false; }
      if (genre === 'fiApres') { corpsPost.produits = Object.keys(coches).filter(function (k) { return coches[k]; }); if (!g) { AMX.toast('Entrez le profit F&I.', 'erreur'); inFI.focus(); return false; } }
      if (genre === 'concession') { corpsPost.unites = caseUnite.checked ? 1 : 0; if (corpsPost.client.length < 2) { AMX.toast('À quel concessionnaire ?', 'erreur'); inClient.focus(); return false; } }
      if (!v && !corpsPost.vin && !corpsPost.stock) { AMX.toast('Entrez le NIV ou le # stock.', 'erreur'); inVin.focus(); return false; }
      return AMX.post(corpsPost, { delai: 90000 }).then(function (r) {
        verifierPost(r);
        if (!r.ajustement || (genre !== 'ajustement' && !r.ajustement.genre)) throw new Error(SCRIPT_PAS_A_JOUR);
        if (r.vente && cache.rep && cache.rep.ventes.some(function (x) { return x.id === r.vente.id; })) AMX.ventes.poser(r.vente);
        poserAjustement(r.ajustement);
        AMX.toast('Enregistré : ' + GENRES_HV[genre][1] + ' ' + r.ajustement.id + ', compté dans ' + moisLibelle(r.ajustement.mois), 'ok');
        return true;
      }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur', 7000); return false; });
    } }] });
  }
  /* Le nouvel ajustement entre dans la liste chargée si son mois en fait partie. */
  function poserAjustement(a) {
    var d = cache.rep; if (!d || !a) return;
    var mois = String(cache.cle || '').split('|')[1] || '';
    var dedans = mois === 'tout' || (/^\d{4}$/.test(mois) ? a.mois.slice(0, 4) === mois : (mois ? a.mois === mois : true));
    if (!Array.isArray(d.ajustements)) d.ajustements = [];
    d.ajustements = d.ajustements.filter(function (x) { return x.id !== a.id; });
    if (dedans && !a.annule) d.ajustements.push(a);
    cache.autres = {};
    cacheRecap.quand = 0;
    document.dispatchEvent(new CustomEvent('amx:ventes'));
  }
  function annulerAjustement(a) {
    var ta = h('textarea.saisie#aj-annule-raison', { rows: '2', placeholder: 'Doublon, montant erroné…' });
    var lib = GENRES_HV[genreAj(a)][0];
    AMX.modale({ titre: 'Annuler : ' + lib.toLowerCase() + ' ' + a.id, corps: h('div.ventes-form', [h('p.ventes-aide', { text: (a.vehicule || a.venteId || a.client || '') + ' — ' + (unitesAj(a) ? texteUnites(unitesAj(a)) + ', ' : '') + 'front ' + signe(ajFront(a)) + ', F&I ' + signe(ajFI(a)) + ', imputé à ' + moisLibelle(a.mois) + '.' }), h('div.champ', [h('label', { 'for': 'aj-annule-raison', text: 'Pourquoi ?' }), ta])]),
      boutons: [{ texte: 'Garder' }, { texte: 'Annuler l\'entrée', classe: 'danger', action: function () {
        return AMX.post({ action: 'venteAjustementAnnuler', id: a.id, raison: ta.value.trim() }, { delai: 90000 }).then(function (r) {
          if (!r || r.refuse || r.ok === false) throw new Error((r && r.erreur) || 'Le serveur a refusé.');
          if (!r.ajustement) throw new Error(SCRIPT_PAS_A_JOUR);
          poserAjustement(r.ajustement);
          AMX.toast('Annulé : ' + lib.toLowerCase() + ' ' + a.id, 'ok');
          return true;
        }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); return false; });
      } }] });
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

  /* ------------------------------ Retirer une vente (2 nov.) ------------------------------ */
  /* Maxime, 2 nov. : « je dois pouvoir supprimer facilement une ligne en glissant de droite à gauche ». Retirer n'efface rien
     et n'écrit rien au livre de la comptabilité : la vente sort de tous les chiffres (ventes, moyennes, Board, Résultats) et va
     dans Exclues (« Retirée à la main »), où on peut la remettre. Ne pas confondre avec « Annuler la vente », qui écrit
     CANCELLÉ au livre. Au doigt : glisser la ligne vers la gauche ; à la souris : le bouton « Retirer » au survol — la pièce
     commune AMX.glisserPourRetirer (app.js), aussi dans la liste du Board (AMX.ventes.glisser). */
  function estRetiree(v) { return /^retir/i.test(String((v && v.horsVente) || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')); }
  function peutRemettre() { return AMX.ventes.peutCompleter() || AMX.estAdmin(); }
  /* La vente change de liste dans la réponse gardée (ventes ↔ horsVentes), puis la page se redessine. Seulement si la réponse
     gardée la contenait : retirée depuis le Board, la page peut garder une autre concession ou un autre mois. */
  function deplacerVente(v, versExclues) {
    var d = cache.rep; cache.autres = {}; cacheRecap.quand = 0;
    if (!d || !v) { document.dispatchEvent(new CustomEvent('amx:ventes')); return; }
    var pareil = function (x) { return x.id === v.id; };
    var etait = (d.ventes || []).some(pareil) || (d.horsVentes || []).some(pareil);
    d.ventes = (d.ventes || []).filter(function (x) { return x.id !== v.id; });
    d.horsVentes = (d.horsVentes || []).filter(function (x) { return x.id !== v.id; });
    if (etait) { if (versExclues) d.horsVentes.unshift(v); else d.ventes.unshift(v); }
    if (Array.isArray(d.venduesAutres)) { var dansAutres = d.venduesAutres.some(pareil); d.venduesAutres = d.venduesAutres.filter(function (x) { return x.id !== v.id; }); if (dansAutres && !versExclues) d.venduesAutres.unshift(v); }   /* 3 nov. : vendues dans le mois, livrées un autre mois */
    var n = { declaree: 0, completee: 0, comptabilisee: 0, annulee: 0, erreurLivre: 0 };
    d.ventes.forEach(function (x) { if (n[x.statut] !== undefined) n[x.statut]++; if (x.livre === 'erreur') n.erreurLivre++; });
    d.compte = n;
    document.dispatchEvent(new CustomEvent('amx:ventes'));
  }
  function envoyerRetrait(v, raison, o) {
    return AMX.post({ action: 'venteRetirer', id: v.id, raison: raison || '' }, { delai: 90000 }).then(function (r) {
      verifierPost(r); deplacerVente(r.vente, true);
      AMX.toast((r.message || 'Vente retirée — elle est dans Exclues.'), 'ok', 7000, peutRemettre() ? { texte: 'Annuler', action: function () { remettreVente(r.vente, o); } } : null);
      if (o && typeof o.apres === 'function') o.apres(r.vente, 'retiree');
      return true;
    });
  }
  function modaleRetirer(v, o) {
    var raison = h('input.saisie#vente-retirer-raison', { type: 'text', maxlength: '120', placeholder: 'Doublon, essai, pas une vente…' });
    AMX.modale({
      titre: 'Retirer cette vente ?',
      corps: h('div.ventes-form', [
        h('p', [h('b', { text: vehiculeTexte(v) || 'Véhicule à préciser' }), h('span', { text: [v.stock ? ' · # ' + v.stock : '', v.client || v.venduA ? ' · ' + (v.client || v.venduA) : '', ' · ' + v.id].join('') })]),
        h('p.ventes-aide', { text: 'Elle sort de tous les chiffres (ventes, moyennes, Board, Résultats) et va dans Exclues, où vous pourrez la remettre. Rien n\'est effacé et le livre de la comptabilité n\'est pas touché.' }),
        v.statut === 'comptabilisee' ? h('p.ventes-aide.alerte', { text: 'Cette vente est comptabilisée.' }) : null,
        h('div.champ', [h('label', { 'for': 'vente-retirer-raison', text: 'Pourquoi ? (facultatif)' }), raison])
      ]),
      boutons: [{ texte: 'Garder' }, { texte: 'Retirer', classe: 'danger', action: function () {
        return envoyerRetrait(v, raison.value.trim(), o).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); return false; });
      } }]
    });
    setTimeout(function () { try { raison.focus(); } catch (e) {} }, 30);
  }
  function remettreVente(v, o) {
    return AMX.post({ action: 'venteRemettre', id: v.id }, { delai: 90000 }).then(function (r) {
      verifierPost(r); deplacerVente(r.vente, false); AMX.toast(r.message || 'Vente remise dans les ventes.', 'ok');
      if (o && typeof o.apres === 'function') o.apres(r.vente, 'remise');
      return true;
    }).catch(function (e) { AMX.toast(AMX.erreurTexte(e), 'erreur'); return false; });
  }
  /* Le geste commun (app.js) sur une ligne de vente : glisser vers la gauche au doigt, bouton « Retirer » au survol.
     Renvoie le bouton, à poser dans la ligne. */
  function boutonRetirer(tr, v, o) {
    return AMX.glisserPourRetirer(tr, {
      texte: 'Retirer', titre: 'Retirer la vente ' + v.id + ' des ventes : elle va dans Exclues (rien n\'est effacé). Au doigt : glisser la ligne vers la gauche.',
      action: function () { modaleRetirer(v, o); }
    }).bouton;
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
        var m = /^(\d{4})\s+(\S+)\s+(.*)$/.exec(trouve.modele || '') || /^(\S+)\s+(.*?)\s+(\d{4})$/.exec(trouve.modele || ''), o = { type: reg === 'DETAIL' ? 'usage' : 'wholesale', compagnie: String(trouve.compagnie || '').toUpperCase(), vin: trouve.vin, stock: trouve.stock || '', coutant: trouve.cout || '', modeleTexte: trouve.modele || '', source: 'Inventaire › Occasion › ' + AMX.inventaire.nomFeuille(reg), registre: reg };
        if (m) { if (/^\d{4}$/.test(m[1])) { o.annee = m[1]; o.marque = m[2]; o.modele = m[3]; } else { o.marque = m[1]; o.modele = m[2]; o.annee = m[3]; } } else o.modele = trouve.modele || '';
        return o;
      }
    }
    return estVin ? { vin: q, inconnu: true } : { stock: q, inconnu: true };
  }

  /* 5 nov. (Maxime : « il faudrait un menu déroulant avec les noms des inscrits plutôt ») : le conseiller et le F&I se
     choisissent dans la liste des comptes ScanAutomax de la concession (Vente.gs › VENTE_personnes_, ou les destinataires
     F&I). « Autre nom… » garde la saisie libre (vendeur sans compte, nom déjà au livre) ; le champ texte d'origine reste
     celui qui part au serveur. Un nom déjà inscrit qui n'est pas un compte reste choisi : « (hors liste) ». */
  var AUTRE_NOM = '\u0001autre';
  function menuPersonnes(input, idSel) {
    var sel = h('select.saisie#' + idSel), noms = null, autre = false;
    var boite = h('div.ventes-personne', [sel, input]);
    function dessiner() {
      var courant = input.value.trim(), dans = false;
      AMX.vider(sel);
      sel.appendChild(h('option', { value: '', text: noms === null ? 'Chargement des noms…' : 'Choisir…' }));
      (noms || []).forEach(function (n) { if (n === courant) dans = true; sel.appendChild(h('option', { value: n, text: n })); });
      if (courant && !dans && !autre) sel.appendChild(h('option', { value: courant, text: courant + ' (hors liste)' }));
      sel.appendChild(h('option', { value: AUTRE_NOM, text: 'Autre nom…' }));
      sel.value = autre ? AUTRE_NOM : courant;
      input.style.display = autre ? '' : 'none';
    }
    sel.addEventListener('change', function () {
      autre = sel.value === AUTRE_NOM;
      input.value = autre ? '' : sel.value;
      dessiner();
      if (autre) input.focus();
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    dessiner();
    return {
      el: boite,
      /* liste = noms des comptes (null = encore en lecture) */
      poser: function (liste) { var vus = {}; noms = liste === null ? null : (liste || []).filter(function (n) { n = String(n || '').trim(); if (!n || vus[n]) return false; vus[n] = 1; return true; }).sort(function (a, b) { return a.localeCompare(b, 'fr'); }); dessiner(); },
      noms: function () { return noms || []; }
    };
  }
  function nomsDe(liste) { return (liste || []).map(function (p) { return p && p.nom; }).filter(Boolean); }

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
    var segType = h('div.segment.bloc#vente-type', Object.keys(TYPES).map(function (t) { return h('button' + (type === t ? '.actif' : ''), { type: 'button', 'data-type': t, text: TYPES[t], onclick: function () { if (edition) return; type = t; segType.querySelectorAll('button').forEach(function (b) { b.classList.toggle('actif', b.dataset.type === t); }); rendreCategories(); rendreWholesale(); remplirCatalogue(); } }); }));
    var inRecherche = h('input.saisie#vente-recherche', { type: 'text', placeholder: '# stock ou NIV', autocomplete: 'off', spellcheck: 'false', value: vehicule.stock || vehicule.vin || '' });
    var btnChercher = h('button.btn', { type: 'button', text: 'Trouver', onclick: function () { trouver(inRecherche.value); } });
    var elTrouve = h('div.ventes-trouve.gris', { text: 'Tapez le # stock ou le NIV puis « Trouver » : les neufs (DMS / manufacturier) et les registres d\'occasion sont fouillés. Un neuf en commande ou en locate peut s\'inscrire sans # stock ni NIV : ajoutez-les à son arrivée (Modifier).' });
    var inVin = h('input.saisie#vente-vin', { type: 'text', maxlength: '17', placeholder: 'NIV (17 caractères)', value: vehicule.vin, autocomplete: 'off', spellcheck: 'false' });
    var inStock = h('input.saisie#vente-stock', { type: 'text', placeholder: '# stock', value: vehicule.stock });
    var inAnnee = h('input.saisie#vente-annee', { type: 'text', placeholder: '2026', value: vehicule.annee, maxlength: '4' });
    /* 5 nov. (Maxime : « mettre un déroulant pour les modèles et versions ») : listes tirées des neufs, des registres d'occasion
       et des ventes de la concession ; les versions suivent le modèle tapé. On peut toujours taper autre chose. */
    var inMarque = h('input.saisie#vente-marque', { type: 'text', placeholder: 'Marque', value: vehicule.marque, list: 'vente-marques', autocomplete: 'off' });
    var inModele = h('input.saisie#vente-modele', { type: 'text', placeholder: 'Modèle', value: vehicule.modele, list: 'vente-modeles', autocomplete: 'off' });
    var inVersion = h('input.saisie#vente-version', { type: 'text', placeholder: 'Version', value: vehicule.version, list: 'vente-versions', autocomplete: 'off' });
    var dlMarques = h('datalist#vente-marques'), dlModeles = h('datalist#vente-modeles'), dlVersions = h('datalist#vente-versions');
    var catalogue = { marques: {}, modeles: {}, versions: {} }, ventesListe = rep && rep.ventes ? rep.ventes : null;
    var inClient = h('input.saisie#vente-client', { type: 'text', placeholder: 'Nom du client', value: v.client || '' });
    /* 26 oct. (Maxime) : le numéro de client du DMS, tapé par qui remplit la fiche de vente. */
    var inNoClient = h('input.saisie#vente-noclient', { type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: 'ex. 123456', maxlength: '30', value: v.noClient || '' });
    var inTel = h('input.saisie#vente-telephone', { type: 'tel', placeholder: '514 555-0147', value: v.telephone || '' });
    var inCourriel = h('input.saisie#vente-courriel', { type: 'email', placeholder: 'courriel (facultatif)', value: v.courriel || '' });
    var inDate = h('input.saisie#vente-date', { type: 'date', value: v.dateVente || isoLocal(new Date()) });
    var inLivraison = h('input.saisie#vente-livraison', { type: 'date', value: v.dateLivraison || '' });
    var selCat = h('select.saisie#vente-categorie');
    var inConseiller = h('input.saisie#vente-conseiller', { type: 'text', list: 'vente-conseillers', placeholder: 'Conseiller', value: v.conseiller || '', autocomplete: 'off' });
    var dlConseillers = h('datalist#vente-conseillers');
    var menuConseiller = menuPersonnes(inConseiller, 'vente-conseiller-liste');
    var inPrix = h('input.saisie#vente-prix', { type: 'text', inputmode: 'decimal', placeholder: '0,00 $', value: val(v.prixVente) });
    var selPaiement = h('select.saisie#vente-paiement');
    function remplirPaiements() {
      var courant = selPaiement.value || v.paiement || '';
      AMX.vider(selPaiement); selPaiement.appendChild(h('option', { value: '', text: '—' }));
      paiementsPour(selCie.value || cie, courant).forEach(function (p) { selPaiement.appendChild(h('option', { value: p[0], text: p[1], selected: courant === p[0] ? 'selected' : undefined })); });
    }
    /* 26 oct. : provenance d'un neuf BMW — le holdback (2 % du PDSF) ne vaut que pour un véhicule acheté de BMW. */
    var selProvenance = h('select.saisie#vente-provenance', [h('option', { value: '', text: '—' })].concat(PROVENANCES.map(function (p) { return h('option', { value: p[0], text: p[1], selected: (v.provenance || '') === p[0] || (/change/i.test(v.provenance || '') && p[0] === 'Échange') ? 'selected' : undefined }); })));
    var champProvenance = null;
    remplirPaiements();
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
    var menuDirecteur = menuPersonnes(inDirecteur, 'vente-directeur-liste');
    var inFI = h('input.saisie#vente-fi', { type: 'text', inputmode: 'decimal', placeholder: '0,00 $', value: val(v.profitFIPrevu) });
    var pneus = v.pneus || '', pneusTouche = false;
    var segPneus = h('div.segment.bloc#vente-pneus', [['', '—'], ['oui', 'Oui'], ['non', 'Non']].map(function (p) { return h('button' + (pneus === p[0] ? '.actif' : ''), { type: 'button', 'data-pneus': p[0], text: p[1], onclick: function () { pneusTouche = true; poserPneus(p[0]); } }); }));
    function poserPneus(x) { pneus = x; segPneus.querySelectorAll('button').forEach(function (b) { b.classList.toggle('actif', b.dataset.pneus === x); }); }
    /* 5 nov. (Maxime) : « ventes de pneus / jantes / mags » — Oui / Non et le montant, inscrits avec la vente. Un montant = Oui. */
    var inPneusMt = h('input.saisie#vente-pneus-montant', { type: 'text', inputmode: 'decimal', placeholder: 'Montant ($)', value: val(v.pneusMontant) }), pneusMtTouche = false;
    inPneusMt.addEventListener('input', function () { pneusMtTouche = true; var n = nombre(inPneusMt.value); if (n !== null && n > 0 && pneus !== 'oui') { pneusTouche = true; poserPneus('oui'); } });
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
    var inRdr = h('input.saisie#vente-rdr', { type: 'date', value: v.dateRdr || '' }), inCodeRdr = h('input.saisie#vente-code-rdr', { type: 'text', maxlength: '12', placeholder: 'Code', value: v.codeRdr || '' });
    var champRdr = champ('vente-rdr', 'Date RDR', inRdr), champCodeRdr = champ('vente-code-rdr', 'Code RDR', inCodeRdr);
    champProvenance = champ('vente-provenance', 'Provenance (holdback)', selProvenance);   /* 26 oct. : la Date RDR va au livre (compteur des RDR du mois) */
    /* 5 nov. (Maxime : « mettre le nom du F&I en même temps que d'inscrire la vente ») : le F&I nommé ici reçoit le courriel. */
    var champDirecteur = champ('vente-directeur-liste', 'F&I (directeur commercial)', menuDirecteur.el);
    var champPneus = h('div.champ.champ-pneus', [h('label', { 'for': 'vente-pneus-montant', text: 'Pneus / jantes / mags vendus' }), h('div.ventes-pneus', [segPneus, inPneusMt])]);
    var blocWholesale = h('div.grille', [champ('vente-vendua', 'Vendu à', inVenduA, 'large'), champ('vente-achetede', 'Acheté de', inAcheteDe), champ('vente-acheteur', 'Acheteur interne', inAcheteur), champ('vente-coutant', 'Coûtant', inCoutant)]);
    var blocClient = h('div.grille', [champ('vente-client', 'Client', inClient, 'large'), champ('vente-noclient', 'No client (DMS)', inNoClient), champ('vente-telephone', 'Téléphone', inTel), champ('vente-courriel', 'Courriel', inCourriel)]);
    var blocEchange = h('div', [
      h('div.ventes-vehicule', [champ('vente-echange-vin', 'NIV de l\'échange', inEchVin), btnEval]),
      elEval,
      h('div.grille', [champ('vente-echange-stock', '# stock', inEchStock), champ('vente-echange-modele', 'Modèle', inEchModele), champ('vente-echange-km', 'Km', inEchKm), champ('vente-echange-valeur', 'Valeur accordée', inEchValeur), champ('vente-echange-evaluation', 'Évaluation (ACV)', inEchEval), champ('vente-over', 'Over / under', inOver)])
    ]);
    var titreEchange = h('h4', 'Échange (s\'il y en a un)'), pEchange = h('p.ventes-aide', { text: 'L\'échange entre à l\'inventaire par sa fiche d\'achat (Inventaire › Fiche d\'achat) ; ici on le lie à son évaluation. Over / under = valeur accordée − évaluation, calculé si vous ne le tapez pas.' });
    var fiDest = rep && rep.fi ? rep.fi : null;
    var texteFI = !fiDest ? 'Le F&I (directeur commercial) recevra un courriel pour inscrire son profit F&I et les produits — rappel après 24 h.' : (fiDest.courriels && fiDest.courriels.length ? 'Le F&I recevra un courriel pour inscrire son profit F&I et les produits (rappel après 24 h) : ' + (fiDest.noms && fiDest.noms.length ? fiDest.noms : fiDest.courriels).join(', ') + '.' : 'Aucun destinataire F&I pour cette concession : personne ne sera prévenu (Admin › droit « Ventes — F&I »).');
    var sectionFIAncienne = false ? h('div', [
      h('h4.fi', 'F&I — directeur commercial'),
      h('div.grille', [champ('vente-directeur', 'Directeur commercial', inDirecteur), champ('vente-fi', 'Profit F&I prévu', inFI), champ('vente-pneus', 'Pneus vendus', segPneus)]),
      h('p.ventes-aide', 'Produits vendus — cochez et inscrivez le montant quand vous l\'avez ; la somme propose le profit F&I.'),
      elProduits, elTotalFI
    ]) : null;
    /* 26 oct. : le F&I n'est plus dans cette fenêtre (« Profits F&I » a la sienne) ; à l'inscription, on dit seulement qui sera prévenu. */
    var sectionFI = edition ? null : h('p.ventes-aide' + (!fiDest || (fiDest.courriels && fiDest.courriels.length) ? '.fi' : '.alerte') + '#vente-avis-fi', { text: texteFI });
    var corps = h('div.ventes-form', [
      edition ? h('p.ventes-aide', { text: v.id + ' · ' + (TYPES[v.type] || v.type) + ' · ' + (v.importee ? 'importée du livre' : 'inscrite par ' + (v.declareParNom || v.declarePar || '')) + (v.livre === 'ecrit' ? ' · au livre ligne ' + v.livreLigne : '') + ' · ' + capitale(v.moisLibelle || moisLibelle(moisDeVente(v))) }) : null,
      h('div.grille', [champ('vente-compagnie', 'Concession', selCie), champ('vente-type', 'Type de vente', segType)]),
      h('h4', 'Véhicule'),
      edition ? null : h('div.ventes-vehicule', [champ('vente-recherche', '# stock ou NIV', inRecherche), btnChercher]),
      edition ? null : elTrouve,
      h('div.grille', [champ('vente-vin', 'NIV', inVin), champ('vente-stock', '# Stock', inStock), champ('vente-annee', 'Année', inAnnee), champ('vente-marque', 'Marque', inMarque), champ('vente-modele', 'Modèle', inModele), champ('vente-version', 'Version', inVersion)]),
      h('h4', 'Vente — direction des ventes'),
      h('div.grille', [champ('vente-date', 'Date de vente', inDate), champ('vente-livraison', 'Livraison (prévue)', inLivraison), champRdr, champCodeRdr, champ('vente-categorie', 'Catégorie', selCat), champProvenance, champ('vente-conseiller-liste', 'Conseiller', menuConseiller.el), champDirecteur, champ('vente-prix', 'Prix de vente', inPrix), champ('vente-paiement', 'Mode de paiement', selPaiement), champ('vente-front', 'Profit front prévu', inFront), champ('vente-accessoires', 'Accessoires ($)', inAccess), champPneus]),
      dlConseillers, dlDirecteurs, dlMarques, dlModeles, dlVersions,
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
      if (sectionFI) sectionFI.style.display = ws ? 'none' : '';   /* 1er nov. : pas de F&I en wholesale */
      champDirecteur.style.display = ws ? 'none' : ''; champPneus.style.display = ws ? 'none' : '';
      champRdr.style.display = ws ? 'none' : ''; champCodeRdr.style.display = ws || String(selCie.value || cie).toUpperCase() !== 'STM' ? 'none' : '';
      if (champProvenance) champProvenance.style.display = type === 'neuf' && String(selCie.value || cie).toUpperCase() === 'BMW' ? '' : 'none';   /* le code RDR : seulement le livre de Ste-Marie */
    }
    function rendrePersonnes(d) {
      AMX.vider(dlConseillers); AMX.vider(dlDirecteurs);
      var noms = {}, nomsD = {};
      if (d && d.personnes) { (d.personnes.conseillers || []).forEach(function (p) { noms[p.nom] = 1; }); (d.personnes.directeurs || []).forEach(function (p) { nomsD[p.nom] = 1; }); }
      if (d && d.nomsConnus) { (d.nomsConnus.conseillers || []).forEach(function (n) { noms[n] = 1; }); (d.nomsConnus.directeurs || []).forEach(function (n) { nomsD[n] = 1; }); }
      if (d && d.fi && d.fi.noms) d.fi.noms.forEach(function (n) { nomsD[n] = 1; });
      Object.keys(noms).sort().forEach(function (n) { dlConseillers.appendChild(h('option', { value: n })); });
      Object.keys(nomsD).sort().forEach(function (n) { dlDirecteurs.appendChild(h('option', { value: n })); });
      if (d) {
        var comptesC = nomsDe(d.personnes && d.personnes.conseillers), comptesD = nomsDe(d.personnes && d.personnes.directeurs).concat((d.fi && d.fi.noms) || []);
        /* qui inscrit est proposé d'office s'il est dans la liste (un directeur qui inscrit pour un vendeur choisit le vendeur) */
        if (!inConseiller.value && !edition && comptesC.indexOf(AMX.session.nom || '') >= 0) inConseiller.value = AMX.session.nom;
        menuConseiller.poser(comptesC); menuDirecteur.poser(comptesD);
      } else { menuConseiller.poser(null); menuDirecteur.poser(null); }
      if (d) { if (d.fi !== undefined) fiDest = d.fi; directeursConnus = (d.personnes && d.personnes.directeurs) || directeursConnus; if (d.ventes) ventesListe = d.ventes; }
      majAvisFI(); remplirCatalogue();
    }
    var directeursConnus = (rep && rep.personnes && rep.personnes.directeurs) || [];
    var cleNom = function (x) { return AMX.texteCherche ? AMX.texteCherche(x || '') : String(x || '').trim().toLowerCase(); };
    /* L'avis dit à qui ira le courriel : le F&I nommé s'il a un compte de la concession, sinon les destinataires F&I de la concession. */
    function majAvisFI() {
      var avis = corps.querySelector('#vente-avis-fi'); if (!avis) return;
      var nom = inDirecteur.value.trim(), cle = cleNom(nom);
      var connu = nom ? directeursConnus.filter(function (p) { return p && p.courriel && cleNom(p.nom) === cle; })[0] : null;
      if (connu) { avis.className = 'ventes-aide fi'; avis.textContent = 'Le courriel pour inscrire le profit F&I et les produits ira à ' + connu.nom + ' (rappel après 24 h).'; return; }
      var f = fiDest, ok = f && f.courriels && f.courriels.length, dest = ok ? (f.noms && f.noms.length ? f.noms : f.courriels).join(', ') : '';
      if (!f) { avis.className = 'ventes-aide fi'; avis.textContent = nom ? 'Le courriel pour inscrire le profit F&I ira à ' + nom + ' s\'il a un compte ScanAutomax à ce nom, sinon aux destinataires F&I de la concession.' : 'Le F&I (directeur commercial) recevra un courriel pour inscrire son profit F&I et les produits — rappel après 24 h.'; return; }
      avis.className = 'ventes-aide ' + (ok ? 'fi' : 'alerte');
      avis.textContent = nom
        ? (ok ? nom + ' n\'a pas de compte ScanAutomax à ce nom : le courriel ira aux destinataires F&I de la concession — ' + dest + '.' : nom + ' n\'a pas de compte ScanAutomax à ce nom et la concession n\'a pas de destinataire F&I : personne ne sera prévenu.')
        : (ok ? 'Le F&I recevra un courriel pour inscrire son profit F&I et les produits (rappel après 24 h) : ' + dest + '. Nommez le F&I ci-dessus pour que le courriel aille à lui seul.' : 'Aucun destinataire F&I pour cette concession : nommez le F&I ci-dessus, sinon personne ne sera prévenu (Admin › droit « Ventes — F&I »).');
    }
    inDirecteur.addEventListener('input', majAvisFI); inDirecteur.addEventListener('change', majAvisFI);
    /* Listes des marques, modèles et versions. */
    function ajouterCatalogue(marque, modele, version) {
      var ma = String(marque || '').trim(), mo = String(modele || '').trim(), ve = String(version || '').trim();
      if (ma) catalogue.marques[ma] = (catalogue.marques[ma] || 0) + 1;
      if (!mo) return;
      var km = cleNom(mo);
      var e = catalogue.modeles[km] || (catalogue.modeles[km] = { nom: mo, marque: ma, n: 0 }); e.n++; if (!e.marque && ma) e.marque = ma;
      if (ve) { var vs = catalogue.versions[km] || (catalogue.versions[km] = {}); vs[ve] = (vs[ve] || 0) + 1; }
    }
    function remplirCatalogue() {
      catalogue = { marques: {}, modeles: {}, versions: {} };
      var c = String(selCie.value || cie || '').toUpperCase(), occ = type !== 'neuf';
      var neufs = AMX.neufs && AMX.neufs.enCache ? AMX.neufs.enCache() : null;
      if (!occ && neufs && neufs.vehicules) neufs.vehicules.forEach(function (x) { if (!c || String(x.compagnie || '').toUpperCase() === c) ajouterCatalogue(x.marque, x.modele, x.version); });
      if (occ && AMX.inventaire && AMX.inventaire.enCache) ['DETAIL', 'CAN', 'US'].forEach(function (f) {
        (AMX.inventaire.enCache(f) || []).forEach(function (x) {
          if (c && String(x.compagnie || '').toUpperCase() !== c) return;
          var m = /^(\d{4})\s+(\S+)\s+(.*)$/.exec(x.modele || '') || /^(\S+)\s+(.*?)\s+(\d{4})$/.exec(x.modele || '');
          if (m) { if (/^\d{4}$/.test(m[1])) ajouterCatalogue(m[2], m[3]); else ajouterCatalogue(m[1], m[2]); }
        });
      });
      (ventesListe || []).forEach(function (x) { if ((!c || String(x.compagnie || '').toUpperCase() === c) && (occ ? x.type !== 'neuf' : x.type === 'neuf')) ajouterCatalogue(x.marque, x.modele, x.version); });
      var tri = function (o) { return Object.keys(o).sort(function (a, b) { return (o[b] - o[a]) || a.localeCompare(b, 'fr'); }); };
      AMX.vider(dlMarques); tri(catalogue.marques).slice(0, 60).forEach(function (n) { dlMarques.appendChild(h('option', { value: n })); });
      majModeles();
    }
    function majModeles() {
      var ma = cleNom(inMarque.value);
      var mods = Object.keys(catalogue.modeles).map(function (k) { return catalogue.modeles[k]; })
        .filter(function (e) { return !ma || !e.marque || cleNom(e.marque) === ma; })
        .sort(function (a, b) { return (b.n - a.n) || a.nom.localeCompare(b.nom, 'fr'); });
      AMX.vider(dlModeles); mods.slice(0, 150).forEach(function (e) { dlModeles.appendChild(h('option', { value: e.nom })); });
      majVersions();
    }
    function majVersions() {
      var vs = catalogue.versions[cleNom(inModele.value)] || {};
      AMX.vider(dlVersions); Object.keys(vs).sort(function (a, b) { return (vs[b] - vs[a]) || a.localeCompare(b, 'fr'); }).slice(0, 80).forEach(function (n) { dlVersions.appendChild(h('option', { value: n })); });
    }
    inMarque.addEventListener('input', majModeles); inModele.addEventListener('input', majVersions); inModele.addEventListener('change', majVersions);
    var neufsDemandes = false;
    function chargerNeufs() {
      if (neufsDemandes || type !== 'neuf' || !AMX.neufs || !AMX.neufs.charger || (AMX.neufs.enCache && AMX.neufs.enCache())) return;
      neufsDemandes = true; AMX.neufs.charger().then(remplirCatalogue, function () {});
    }
    [inMarque, inModele, inVersion].forEach(function (el) { el.addEventListener('focus', chargerNeufs); });
    function trouver(texte) {
      var r = chercherVehicule(selCie.value || cie, texte);
      if (!r) return;
      if (r.inconnu) { elTrouve.className = 'ventes-trouve gris'; elTrouve.textContent = (r.vin ? 'NIV ' + r.vin : '# stock ' + r.stock) + ' : pas trouvé dans les neufs ni les registres — remplissez année, marque et modèle à la main (le serveur complétera s\'il le connaît).'; if (r.vin) inVin.value = r.vin; else inStock.value = r.stock; return; }
      inVin.value = r.vin || ''; inStock.value = r.stock || ''; inAnnee.value = r.annee || ''; inMarque.value = r.marque || ''; inModele.value = r.modele || (r.modeleTexte || ''); inVersion.value = r.version || '';
      if (r.coutant !== undefined && r.coutant !== '' && !inCoutant.value) inCoutant.value = r.coutant;
      if (r.type && !edition) { type = r.type; segType.querySelectorAll('button').forEach(function (b) { b.classList.toggle('actif', b.dataset.type === type); }); rendreCategories(); rendreWholesale(); remplirCatalogue(); }
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
        if (!e.trouve) { elEval.className = 'ventes-trouve alerte'; elEval.appendChild(h('span', { text: e.portail ? 'Aucune valeur confirmée par la direction pour ce NIV.' : 'Pas d\'évaluation pour ce NIV.' })); elEval.appendChild(h('a.btn.petit', { href: e.urlDemander || AMX.lien('outils', 'evaluation', { vin: vin }), target: '_blank', rel: 'noopener', text: e.portail ? 'Demander une évaluation' : 'Évaluer ce véhicule' })); return; }
        var modele = [e.annee, e.marque, e.modele].filter(Boolean).join(' ');
        if (modele && (ecraser || !inEchModele.value.trim())) inEchModele.value = modele;
        if (e.km !== null && (ecraser || !inEchKm.value.trim())) inEchKm.value = String(Math.round(e.km));
        if (e.acv !== null && (ecraser || !inEchEval.value.trim())) inEchEval.value = String(Math.round(e.acv * 100) / 100);
        evalMeta.le = e.le || ''; evalMeta.par = e.par || '';
        majOver();
        elEval.className = 'ventes-trouve';
        elEval.appendChild(h('span', { text: (e.portail ? 'Valeur confirmée par la direction : ' : 'Évaluation importée : ') + (modele || vin) + (e.km !== null ? ' · ' + AMX.fmtNombre(Math.round(e.km)) + ' km' : '') + (e.acv !== null ? ' · valeur d\'achat ' + argent(e.acv) : ' · sans valeur d\'achat') + (e.prixVente !== null ? ' · détail visé ' + argent(e.prixVente) : '') + (e.le ? (e.portail ? ' · confirmée le ' : ' · évaluée le ') + AMX.fmtDate(e.le) : '') + (e.par ? ' par ' + e.par.split('@')[0] : '') }));
        elEval.appendChild(h('a.btn.petit', { href: e.url, target: '_blank', rel: 'noopener', text: e.portail ? 'Ouvrir la demande' : 'Ouvrir l\'évaluation' }));
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
    rendreCategories(); rendreWholesale(); rendrePersonnes(rep || (cie ? null : {})); majTotalFI();
    selCie.addEventListener('change', function () { cie = selCie.value; ventesListe = null; remplirPaiements(); rendreWholesale(); remplirCatalogue(); rendrePersonnes(null); AMX.ventes.charger(cie, moisDe('')).then(rendrePersonnes, function () { rendrePersonnes({}); }); });
    inRecherche.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); trouver(inRecherche.value); } });
    if (!rep && cie) AMX.ventes.charger(cie, moisDe('')).then(function (d) { rendrePersonnes(d); }, function () { rendrePersonnes({}); });
    if (!edition && (vehicule.vin || vehicule.stock) && !vehicule.modele) setTimeout(function () { trouver(vehicule.vin || vehicule.stock); }, 30);
    if (inEchVin.value.replace(/[^A-Za-z0-9]/g, '').length === 17 && (!edition || !val(v.echangeEvaluation))) setTimeout(function () { chercherEvaluation(inEchVin.value, false); }, 40);
    else if (edition && val(v.echangeEvaluation) !== '') { elEval.className = 'ventes-trouve'; elEval.textContent = 'Évaluation liée : ' + argent(nombre(v.echangeEvaluation)) + (v.echangeEvalLe ? ' · évaluée le ' + AMX.fmtDate(v.echangeEvalLe) : '') + (v.echangeEvalPar ? ' par ' + String(v.echangeEvalPar).split('@')[0] : '') + ' — « Trouver l\'évaluation » la relit.'; }

    var titre = edition ? 'Modifier la vente ' + v.id : 'Inscrire une vente';
    var m = AMX.modale({
      titre: titre,
      corps: corps, large: true,
      boutons: [{ texte: 'Annuler' }, { texte: edition ? 'Enregistrer' : 'Inscrire la vente', classe: 'primaire', action: function (fermer, btn) {
        var compagnie = (selCie.value || cie || '').toUpperCase();
        if (!compagnie) { AMX.toast('Choisissez la concession.', 'erreur'); selCie.focus(); return false; }
        var vin = inVin.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase(), stock = inStock.value.trim().toUpperCase();
        if (vin && vin.length !== 17) { AMX.toast('Le NIV a 17 caractères (ou laissez-le vide et donnez le # stock).', 'erreur'); inVin.focus(); return false; }
        /* 7 nov. (Patrick Durocher, Hawkesbury) : un neuf en commande ou en locate s'inscrit sans # stock ni NIV. */
        if (!vin && !stock && type !== 'neuf') { AMX.toast('Il faut le NIV ou le # stock du véhicule.', 'erreur'); inRecherche.focus(); return false; }
        if (!vin && !stock && !edition && !(inModele.value.trim() || inMarque.value.trim())) { AMX.toast('Neuf sans # stock ni NIV (locate, commande) : donnez au moins le modèle.', 'erreur'); inModele.focus(); return false; }
        if (type !== 'wholesale' && inClient.value.trim().length < 2) { AMX.toast('Le nom du client est obligatoire.', 'erreur'); inClient.focus(); return false; }
        if (type === 'wholesale' && inVenduA.value.trim().length < 2) { AMX.toast('À qui le véhicule est-il vendu ?', 'erreur'); inVenduA.focus(); return false; }
        if (!inDate.value) { AMX.toast('La date de vente est obligatoire.', 'erreur'); inDate.focus(); return false; }
        var echVin = inEchVin.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        if (echVin && echVin.length !== 17) { AMX.toast('Le NIV de l\'échange a 17 caractères (ou laissez-le vide).', 'erreur'); inEchVin.focus(); return false; }
        var corpsEnvoi = { compagnie: compagnie, type: type, vin: vin, stock: stock, annee: inAnnee.value.trim(), marque: inMarque.value.trim(), modele: inModele.value.trim(), version: inVersion.value.trim(),
          client: inClient.value.trim(), noClient: type === 'wholesale' ? undefined : inNoClient.value.replace(/\s+/g, ''), telephone: inTel.value.trim(), courriel: inCourriel.value.trim(), dateVente: inDate.value, dateLivraison: inLivraison.value, categorie: selCat.value, conseiller: inConseiller.value.trim(),
          prixVente: inPrix.value.trim(), paiement: selPaiement.value, provenance: type === 'neuf' && compagnie === 'BMW' ? selProvenance.value : undefined, profitPrevu: inFront.value.trim(), accessoires: inAccess.value.trim(), overUnder: inOver.value.trim(),
          echangeStock: inEchStock.value.trim(), echangeModele: inEchModele.value.trim(), echangeVin: echVin, echangeKm: inEchKm.value.trim(), echangeValeur: inEchValeur.value.trim(), echangeEvaluation: inEchEval.value.trim(), echangeEvalLe: evalMeta.le, echangeEvalPar: evalMeta.par,
          dateRdr: type === 'wholesale' ? '' : inRdr.value, codeRdr: type === 'wholesale' ? '' : inCodeRdr.value.trim(),
          note: inNote.value.trim(), venduA: inVenduA.value.trim(), acheteDe: inAcheteDe.value.trim(), acheteur: inAcheteur.value.trim(), coutant: inCoutant.value.trim(), source: 'site' };
        /* 26 oct. : le profit F&I et les produits s'inscrivent dans leur propre fenêtre. 5 nov. : le nom du F&I et les pneus / jantes / mags partent avec la vente. */
        if (type !== 'wholesale') {
          corpsEnvoi.directeur = inDirecteur.value.trim();
          if (!edition || pneusTouche || pneus !== (v.pneus || '')) corpsEnvoi.pneus = pneus;
          if (!(edition && v.montantsMasques && !pneusMtTouche)) corpsEnvoi.pneusMontant = inPneusMt.value.trim();
        }
        /* Un montant masqué (pas le droit de voir les montants) qu'on n'a pas retapé ne part pas : il effacerait le vrai. */
        if (edition && v.montantsMasques) ['prixVente', 'profitPrevu', 'accessoires', 'overUnder', 'coutant', 'echangeValeur', 'echangeEvaluation'].forEach(function (k) { if (corpsEnvoi[k] === '') delete corpsEnvoi[k]; });
        corpsEnvoi.action = edition ? 'venteCompleter' : 'venteDeclarer';
        corpsEnvoi.differe = true;   /* 7 nov. : réponse tout de suite, le livre s'écrit dans la minute (horloge du script) */
        if (edition) corpsEnvoi.id = v.id;
        if (prefill.forcer) corpsEnvoi.forcer = true;
        return AMX.post(corpsEnvoi, { delai: 90000 }).then(function (r) {
          if (r && r.ok === false && r.code === 'DOUBLON' && r.vente) {
            AMX.confirmer('Déjà inscrite', r.erreur + '\n\nInscrire quand même une deuxième vente pour ce véhicule ?', { ok: 'Inscrire quand même' }).then(function (ok) { if (ok) ouvrirFormulaire(Object.assign({}, prefill, { forcer: true, compagnie: compagnie, type: type, vin: vin, stock: stock }), null); else { AMX.ventes.poser(r.vente); if (typeof prefill.apres === 'function') prefill.apres(r.vente); } });
            return true;
          }
          verifierPost(r);
          AMX.ventes.poser(r.vente);
          if (typeof prefill.apres === 'function') { try { prefill.apres(r.vente); } catch (e) {} }   /* 5 nov. : la page qui a ouvert la fenêtre (fiche d'achat) se met à jour */
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
