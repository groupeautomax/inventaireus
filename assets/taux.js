/* =========================================================================
   Vente › Taux Einstein — comparer les programmes des banques (21 novembre 2026 ; nommé « Taux Einstein » par Maxime le 21 nov.)

   Maxime : « ce n'est pas le tableau de bord de Torque que je veux, c'est Intellitaux — regarde ce que tu peux trouver pour
   faire le même outil ». Quatre vues, en onglets dans la page :
     Comparateur          — pour une transaction (année, montant financé taxes incluses, terme, taux vendu), chaque
                            programme des banques : taux, ristourne, boni, gain du client par versement, potentiel.
     Grilles de taux      — les programmes inscrits, par institution ; ajouter, modifier, joindre le PDF de la banque,
                            « Lire une grille (PDF) avec Einstein » (il PROPOSE, une personne vérifie et enregistre).
     Amortissement        — le tableau d'un prêt ou d'une location, à imprimer.
     Garantie prolongée   — le graphique mois × kilométrage : financement, garantie du manufacturier, protection.

   Les taux sont NOS grilles (TauxBanques.gs, feuille TauxProgrammes) : rien n'est repris d'un autre outil.
   Formules (vérifiées le 21 nov. sur un exemple : 35 000 $, 72 mois, 8,49 % → 622,07 $ par mois) :
     paiement            = P × i ÷ (1 − (1 + i)^−n), i = taux ÷ 12, 26 ou 52 ;
     gain par versement  = (paiement au taux vendu − paiement au taux du palier) ÷ (1 + taxes) — l'écart AVANT taxes ;
     gain total          = gain par versement × nombre de versements ;
     ristourne           = % du montant financé, ou $ fixe, ou par tranche de montant ;
     potentiel           = ristourne + gain total (le boni est montré à part).
   Réservé à la direction et au F&I (le serveur refuse les autres). Rien n'est gardé dans le navigateur, sauf la dernière
   transaction tapée (des chiffres, aucun client).
   ========================================================================= */
(function () {
  'use strict';
  var h = AMX.h, I = AMX.icones || {};
  var SCRIPT_PAS_A_JOUR = 'Le script n\'est pas à jour : déployez une nouvelle version (TauxBanques.gs).';
  var VUES = ['comparateur', 'grilles', 'amortissement', 'garantie'];
  var SOUS = {
    comparateur: 'Comparez les programmes des banques pour une transaction.',
    grilles: 'Les programmes des banques inscrits pour vos concessions.',
    amortissement: 'Le tableau d\'un prêt ou d\'une location, versement par versement.',
    garantie: 'Ce que le client finance, et ce qui est encore garanti.'
  };
  var MODALITES = [['mois', 'Au mois', 'par mois'], ['deuxSemaines', 'Aux 2 semaines', 'aux 2 semaines'], ['semaine', 'À la semaine', 'par semaine']];
  var PROVINCES = [['QC', 'Québec — TPS + TVQ 14,975 %', 0.14975], ['ON', 'Ontario — TVH 13 %', 0.13]];
  var INSTITUTIONS = ['Banque Nationale', 'Banque Royale (RBC)', 'Banque Scotia', 'Banque TD', 'BMO', 'CIBC', 'Desjardins', 'iA Financement auto', 'Banque Laurentienne', 'Santander', 'Eden Park', 'BMW Services financiers', 'Financière GM', 'Hyundai Finance', 'VW Finance'];
  var ETATS = { neuf: 'Neufs', occasion: 'Occasions', tous: 'Neufs et occasions' };
  var CLIENTS = { particulier: 'Particuliers', entreprise: 'Entreprises', tous: 'Tous les clients' };
  var C_BLEU = '#2a78d6', C_ORANGE = '#eb6834';

  /* =============================== Calculs (purs) =============================== */
  var PAR_AN = { mois: 12, deuxSemaines: 26, semaine: 52 };
  function nb(x) { return typeof x === 'number' && isFinite(x); }
  function num(x) {
    if (nb(x)) return x;
    var s = String(x === null || x === undefined ? '' : x).replace(/[\s  $%]/g, '').replace(',', '.');
    if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
    var n = Number(s); return isFinite(n) ? n : null;
  }
  function cents(x) { return Math.round((x + (x >= 0 ? 1e-9 : -1e-9)) * 100) / 100; }
  function parAn(modalite) { return PAR_AN[modalite] || 12; }
  function nbVersements(terme, modalite) { return Math.max(1, Math.round((Number(terme) || 0) * parAn(modalite) / 12)); }
  /* Le versement, non arrondi. opts.residuel = valeur à la fin du terme (location) ; opts.debut = versement en début de période. */
  function paiement(montant, taux, terme, modalite, opts) {
    opts = opts || {};
    var P = Number(montant) || 0, R = Number(opts.residuel) || 0;
    if (!(P > 0) || !(Number(terme) > 0)) return 0;
    var n = nbVersements(terme, modalite), i = (Number(taux) || 0) / 100 / parAn(modalite), pmt;
    if (i === 0) pmt = (P - R) / n;
    else { var v = Math.pow(1 + i, -n); pmt = (P - R * v) * i / (1 - v); if (opts.debut) pmt = pmt / (1 + i); }
    return pmt;
  }
  /* La ristourne d'un palier pour un montant financé, et la tranche d'après. */
  function ristourne(palier, montant) {
    var M = Number(montant) || 0, out = { montant: 0, pct: null, tranche: null, suivante: null };
    var tr = (palier && palier.tranches) || [];
    if (tr.length) {
      var ici = null, apres = null;
      tr.forEach(function (t) {
        var de = Number(t.de) || 0, a = nb(t.a) ? t.a : null;
        if (M >= de && (a === null || M < a)) ici = t;
        else if (de > M && (!apres || de < apres.de)) apres = t;
      });
      if (ici) { out.montant = (ici.fixe || 0) + (ici.pct ? M * ici.pct / 100 : 0); out.pct = ici.pct || null; out.tranche = ici; }
      if (apres) out.suivante = { de: apres.de, manque: apres.de - M, montant: (apres.fixe || 0) + (apres.pct ? apres.de * apres.pct / 100 : 0) };
    } else if (palier) {
      out.montant = (palier.fixe || 0) + (palier.pct ? M * palier.pct / 100 : 0); out.pct = palier.pct || null;
    }
    out.montant = cents(out.montant);
    return out;
  }
  function termeMaxDe(p, annee) {
    var t = p && p.termes && p.termes[String(annee)];
    return nb(t) ? t : (nb(p && p.termeMax) ? p.termeMax : null);
  }
  function palierVaut(palier, terme) { return (!nb(palier.termeMin) || terme >= palier.termeMin) && (!nb(palier.termeMax) || terme <= palier.termeMax); }
  /* Le boni d'un programme pour cette transaction : { montant, applicable, texte }. */
  function boniDe(p, t) {
    var b = p && p.boni; if (!b) return { montant: 0, applicable: false, texte: '' };
    var cond = [], ok = true;
    if (nb(b.anneeMin) || nb(b.anneeMax)) {
      cond.push('Année du véhicule : ' + (nb(b.anneeMin) ? b.anneeMin : '…') + ' jusqu\'à ' + (nb(b.anneeMax) ? b.anneeMax : '…'));
      if (nb(t.annee) && ((nb(b.anneeMin) && t.annee < b.anneeMin) || (nb(b.anneeMax) && t.annee > b.anneeMax))) ok = false;
    }
    if (nb(b.prixMin)) { cond.push('Montant : à partir de ' + AMX.fmtArgent(b.prixMin)); if (nb(t.montant) && t.montant < b.prixMin) ok = false; }
    var texte = (b.montant ? 'Boni jusqu\'à ' + AMX.fmtArgent(b.montant) : 'Boni') + (cond.length ? ' · ' + cond.join(' · ') : '') + (b.note ? ' · ' + b.note : '');
    return { montant: b.montant || 0, applicable: ok && !!b.montant, texte: texte };
  }
  /* Pourquoi un programme ne s'applique pas : { filtre: true } (pas le type demandé) ou { raisons: [...] }. */
  function admissible(p, t) {
    if (t.typeTaux && p.typeTaux !== t.typeTaux) return { filtre: true };
    if (t.cie && p.concessions && p.concessions.length && p.concessions.indexOf(t.cie) < 0) return { filtre: true };
    var r = [];
    if (p.enVigueur === false) r.push(p.actif === false ? 'programme retiré' : (p.aVenir ? 'commence le ' + p.debut : 'terminé le ' + p.fin));
    if (p.etat && p.etat !== 'tous' && t.etat && p.etat !== t.etat) r.push(p.etat === 'neuf' ? 'véhicules neufs seulement' : 'véhicules d\'occasion seulement');
    if (p.client && p.client !== 'tous' && t.client && p.client !== t.client) r.push(p.client === 'entreprise' ? 'entreprises seulement' : 'particuliers seulement');
    if (nb(t.annee) && ((nb(p.anneeMin) && t.annee < p.anneeMin) || (nb(p.anneeMax) && t.annee > p.anneeMax))) r.push('années ' + (nb(p.anneeMin) ? p.anneeMin : '…') + ' à ' + (nb(p.anneeMax) ? p.anneeMax : '…'));
    if (nb(t.montant) && nb(p.montantMin) && t.montant < p.montantMin) r.push('montant minimal ' + AMX.fmtArgent(p.montantMin));
    if (nb(t.montant) && nb(p.montantMax) && t.montant > p.montantMax) r.push('montant maximal ' + AMX.fmtArgent(p.montantMax));
    var tm = termeMaxDe(p, t.annee);
    if (nb(t.terme) && nb(tm) && t.terme > tm) r.push('terme maximal ' + tm + ' mois');
    if (!r.length && nb(t.terme) && !(p.paliers || []).some(function (x) { return palierVaut(x, t.terme); })) r.push('aucun taux pour un terme de ' + t.terme + ' mois');
    return { raisons: r };
  }
  /* La comparaison. t = { annee, montant, terme, tauxVendu, modalite, etat, client, typeTaux, cie }, taxe = 0.14975. */
  function comparer(programmes, t, taxe) {
    var complet = nb(t.tauxVendu) && t.tauxVendu > 0, n = nbVersements(t.terme, t.modalite);
    var vendu = complet ? paiement(t.montant, t.tauxVendu, t.terme, t.modalite) : null;
    var lignes = [], exclus = [];
    (programmes || []).forEach(function (p) {
      var a = admissible(p, t);
      if (a.filtre) return;
      if (a.raisons.length) { exclus.push({ p: p, raisons: a.raisons }); return; }
      var boni = boniDe(p, t), meilleur = null, tauxMin = null;
      var paliers = (p.paliers || []).filter(function (x) { return palierVaut(x, t.terme); }).map(function (x) {
        var r = ristourne(x, t.montant), o = { palier: x, taux: x.taux, ristourne: r.montant, pct: r.pct, suivante: r.suivante, paiement: paiement(t.montant, x.taux, t.terme, t.modalite) };
        o.ristBoni = cents(r.montant + (boni.applicable ? boni.montant : 0));
        if (complet) {
          o.gainVersement = (cents(vendu) - cents(o.paiement)) / (1 + (taxe || 0));   /* les versements au cent près, comme le client les paie */
          o.gainTotal = o.gainVersement * n;
          o.potentiel = r.montant + o.gainTotal;
          if (meilleur === null || o.potentiel > meilleur) meilleur = o.potentiel;
        }
        if (tauxMin === null || x.taux < tauxMin) tauxMin = x.taux;
        return o;
      });
      lignes.push({ p: p, paliers: paliers, boni: boni, termeMax: termeMaxDe(p, t.annee), meilleur: meilleur, tauxMin: tauxMin });
    });
    lignes.sort(complet
      ? function (a, b) { return (b.meilleur - a.meilleur) || String(a.p.institution).localeCompare(String(b.p.institution)); }
      : function (a, b) { return (a.tauxMin - b.tauxMin) || String(a.p.institution).localeCompare(String(b.p.institution)); });
    return { complet: complet, versements: n, paiementVendu: vendu, lignes: lignes, exclus: exclus };
  }
  function ajouterPeriodes(iso, k, modalite) {
    var d = new Date(String(iso || '').slice(0, 10) + 'T12:00:00');
    if (!isFinite(d.getTime())) return '';
    if (modalite === 'semaine') d.setDate(d.getDate() + 7 * k);
    else if (modalite === 'deuxSemaines') d.setDate(d.getDate() + 14 * k);
    else { var j = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + k); d.setDate(Math.min(j, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); }
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  /* Le tableau d'amortissement. Prêt : versement en fin de période, solde à 0. Location : versement en début de période,
     solde = la valeur résiduelle à la fin du terme. */
  function amortissement(o) {
    var P = Number(o.montant) || 0, location = !!o.location, R = location ? (Number(o.residuel) || 0) : 0;
    var n = nbVersements(o.terme, o.modalite), i = (Number(o.taux) || 0) / 100 / parAn(o.modalite);
    if (!(P > 0) || !(Number(o.terme) > 0) || R >= P) return null;
    var pmt = cents(paiement(P, o.taux, o.terme, o.modalite, { residuel: R, debut: location }));
    var solde = P, lignes = [], totalInt = 0, totalVerse = 0;
    for (var k = 1; k <= n; k++) {
      var interet = location ? (k === 1 ? 0 : cents(solde * i)) : cents(solde * i);
      var verse = pmt;
      if (!location && k === n) verse = cents(solde + interet);   /* le dernier versement solde le prêt au cent près */
      var capital = cents(verse - interet);
      solde = cents(solde - capital);
      totalInt += interet; totalVerse += verse;
      lignes.push({ n: k, date: ajouterPeriodes(o.date, location ? k - 1 : k, o.modalite), versement: verse, interet: interet, capital: capital, solde: solde });
    }
    var fin = null;
    if (location) { var dernier = cents(solde * i); totalInt += dernier; fin = { date: ajouterPeriodes(o.date, n, o.modalite), interet: dernier, solde: cents(solde + dernier) }; }
    return { paiement: pmt, versements: n, totalInterets: cents(totalInt), totalVerse: cents(totalVerse), lignes: lignes, fin: fin, residuel: R, location: location };
  }
  /* La couverture : où finit chaque garantie sur la route du véhicule (mois depuis la mise en service, km). */
  function garantie(o) {
    var age = Math.max(0, Number(o.ageMois) || 0), km0 = Math.max(0, Number(o.kmActuel) || 0), kmMois = Math.max(0, Number(o.kmAn) || 0) / 12, terme = Math.max(0, Number(o.terme) || 0);
    var finFin = age + terme;
    function fin(g) {
      if (!g || !(g.mois > 0) || !(g.km > 0)) return null;
      var tKm = g.km <= km0 ? age : (kmMois > 0 ? age + (g.km - km0) / kmMois : Infinity);
      var t = Math.min(g.mois, tKm);
      return { mois: g.mois, km: g.km, finMois: t, dansMois: Math.max(0, t - age), cause: tKm < g.mois ? 'km' : 'temps', expiree: t <= age };
    }
    var m = fin(o.manuf), p = fin(o.prot);
    var finM = m ? m.finMois : age, finP = p ? Math.max(finM, p.finMois) : finM;
    return {
      age: age, km0: km0, kmFin: km0 + kmMois * terme, finFinancement: finFin, manuf: m, prot: p,
      sansGarantie: Math.max(0, finFin - Math.max(age, finM)),
      sansProtection: Math.max(0, finFin - Math.max(age, finP)),
      gagne: Math.max(0, Math.min(finFin, finP) - Math.max(age, finM))
    };
  }
  /* 21 nov. (Maxime : « aller chercher une vente du Livre des ventes pour travailler avec le comparateur »). Ce que le livre
     donne d'une vente : l'année, neuf ou occasion, le client, le prix et l'échange. Il n'a ni le terme, ni le taux, ni le montant
     financé du contrat : le montant est ESTIMÉ (prix + accessoires + pneus − échange(s), taxes en sus) et dit comme tel.
     v = une vente de ?ventes=1 ; taxe = 0.14975 ou 0.13. */
  var RE_ENTREPRISE = /(^|[\s.,(])(inc|ltee|ltée|ltd|limitee|limitée|enr|senc|s\.e\.n\.c|corp|corporation|cie|llc)(\.|[\s,)]|$)/i;
  function deVente(v, taxe) {
    v = v || {}; taxe = nb(taxe) ? taxe : 0.14975;
    var out = { annee: '', etat: v.type === 'neuf' ? 'neuf' : 'occasion', client: RE_ENTREPRISE.test(String(v.client || '')) ? 'entreprise' : 'particulier',
      montant: '', montantEstime: false, calcul: null, avis: [] };
    var an = num(v.annee); if (nb(an) && an >= 1980 && an <= 2100) out.annee = String(an);
    var prix = num(v.prixVente);
    if (nb(prix) && prix > 0) {
      var acc = num(v.accessoires) || 0, pn = num(v.pneusMontant) || 0, e1 = num(v.echangeValeur) || 0, e2 = num(v.echange2Valeur) || 0;
      var base = cents(prix + acc + pn - e1 - e2);
      if (base > 0) {
        out.montant = String(cents(base * (1 + taxe))); out.montantEstime = true;
        out.calcul = { prix: prix, accessoires: acc, pneus: pn, echange: cents(e1 + e2), base: base, taxe: taxe, montant: cents(base * (1 + taxe)) };
      } else out.avis.push('L\'échange dépasse le prix : inscrivez le montant financé du contrat.');
    } else out.avis.push(v.montantsMasques ? 'Les montants de cette vente ne vous sont pas montrés : inscrivez le montant financé.' : 'Le prix de vente n\'est pas inscrit au livre : inscrivez le montant financé.');
    var pay = String(v.paiement || '');
    if (pay === 'comptant') out.avis.push('Le livre dit « Comptant » : vérifiez qu\'il y a bien un financement.');
    else if (pay === 'location') out.avis.push('Le livre dit « Location » : le comparateur compare des prêts des banques.');
    if (!out.annee) out.avis.push('L\'année du véhicule n\'est pas au livre.');
    return out;
  }
  /* 21 nov. (Maxime : « le système de taux doit être intelligent et suggérer les meilleures combinaisons de taux de différentes
     banques avec ristourne »). Comme les meilleurs outils (Intellitaux de Torque, Desking Intelligence de Cox) : quelques
     lignes, pas un tableau de plus.
     - Sans taux vendu : la « frontière » — en partant du versement le plus bas, chaque ligne rapporte plus que la précédente
       (ristourne + boni) ; aucune autre banque ne rapporte plus pour un versement aussi bas. Plus de 5 lignes : la première,
       la plus payante et trois entre les deux.
     - Avec le taux vendu : le versement du client ne change pas ; on montre les plus payantes (potentiel + boni), une par
       institution, sans celles qui feraient perdre de l'argent.
     Rien n'est appelé : c'est calculé dans la page à partir des grilles. */
  function combinaisons(r, max) {
    max = max || 5;
    var opts = [];
    (r.lignes || []).forEach(function (l) {
      (l.paliers || []).forEach(function (o) {
        var boni = l.boni && l.boni.applicable ? l.boni.montant || 0 : 0;
        var rapporte = cents((o.ristourne || 0) + boni + (r.complet ? (o.gainTotal || 0) : 0));
        opts.push({ l: l, o: o, inst: l.p.institution, rapporte: rapporte, boni: boni, paiement: o.paiement, taux: o.taux });
      });
    });
    if (!opts.length) return { mode: r.complet ? 'vendu' : 'frontiere', lignes: [] };
    var out = [], parInst = {};
    if (r.complet) {
      opts.sort(function (a, b) { return (b.rapporte - a.rapporte) || (a.taux - b.taux); });
      opts.forEach(function (x) { if (out.length >= Math.min(max, 3) || parInst[x.inst] || x.rapporte <= 0) return; parInst[x.inst] = 1; out.push(x); });
    } else {
      opts.sort(function (a, b) { return (a.paiement - b.paiement) || (b.rapporte - a.rapporte); });
      var meilleur = -Infinity, front = [];
      opts.forEach(function (x) { if (x.rapporte > meilleur + 0.005) { meilleur = x.rapporte; front.push(x); } });
      if (front.length <= max) out = front;
      else { var pas = (front.length - 1) / (max - 1); for (var k = 0; k < max; k++) out.push(front[Math.round(k * pas)]); }
    }
    var base = out[0], top = out.reduce(function (m, x) { return !m || x.rapporte > m.rapporte ? x : m; }, null);
    out.forEach(function (x, k) {
      x.ecartPaiement = base ? cents(x.paiement - base.paiement) : 0;
      x.ecartRapporte = base ? cents(x.rapporte - base.rapporte) : 0;
      x.tags = [];
      if (!r.complet && k === 0) x.tags.push('client');
      if (x === top) x.tags.push('concession');
    });
    return { mode: r.complet ? 'vendu' : 'frontiere', lignes: out };
  }
  var Calcul = { num: num, cents: cents, combinaisons: combinaisons, parAn: parAn, nbVersements: nbVersements, paiement: paiement, ristourne: ristourne, termeMaxDe: termeMaxDe, palierVaut: palierVaut,
    boniDe: boniDe, admissible: admissible, comparer: comparer, ajouterPeriodes: ajouterPeriodes, amortissement: amortissement, garantie: garantie, deVente: deVente };

  /* =============================== Données =============================== */
  var cache = { rep: null, quand: 0, promesse: null };
  function peutVoir() {
    var s = AMX.session || {}, p = s.perms || {}, r = String(s.role || '');
    if (r === 'inactif') return false;
    return ['proprietaire', 'admin', 'gestionnaire', 'direction_ventes', 'directeur_commercial'].indexOf(r) >= 0 || p.ventesFI === true || !!p.gererUtilisateurs || !!p.gererAdmins;
  }
  function charger(force) {
    if (!force && cache.rep && Date.now() - cache.quand < AMX.dureeCopie(120000)) return Promise.resolve(cache.rep);
    if (!force && cache.promesse) return cache.promesse;
    cache.promesse = AMX.get({ tauxBanques: 1 }, { delai: 60000 }).then(function (d) {
      AMX.verifier(d, 'Programmes illisibles');
      if (d.tauxBanques !== true || !Array.isArray(d.programmes)) throw new Error(SCRIPT_PAS_A_JOUR);
      cache.rep = d; cache.quand = Date.now(); cache.promesse = null; return d;
    }, function (e) { cache.promesse = null; throw e; });
    return cache.promesse;
  }
  function vider() { cache.rep = null; cache.quand = 0; cache.promesse = null; }
  function poster(corps, opts) {
    return AMX.post(corps, opts || { secours: false, rejouer: false, delai: 60000 }).then(function (d) {
      AMX.verifier(d, 'Enregistrement refusé');
      if (d.tauxBanques !== true) throw new Error(SCRIPT_PAS_A_JOUR);
      return d;
    });
  }
  function texteErreur(e) { return AMX.erreurTexte ? AMX.erreurTexte(e) : ((e && e.message) || 'Erreur'); }

  /* 21 nov. : grilles reçues par courriel ou reprises de Torque (GrillesRecues.gs). Einstein AI PROPOSE ; une personne confirme. */
  var SCRIPT_RECUES = 'Le script n\'est pas à jour : déployez une nouvelle version (GrillesRecues.gs).';
  var recues = { rep: null, quand: 0, promesse: null };
  function chargerRecues(force) {
    if (!force && recues.rep && Date.now() - recues.quand < AMX.dureeCopie(60000)) return Promise.resolve(recues.rep);
    if (!force && recues.promesse) return recues.promesse;
    recues.promesse = AMX.get({ grillesRecues: 1 }, { delai: 60000 }).then(function (d) {
      AMX.verifier(d, 'Grilles reçues illisibles');
      if (d.grillesRecues !== true || !Array.isArray(d.recues)) throw new Error(SCRIPT_RECUES);
      recues.rep = d; recues.quand = Date.now(); recues.promesse = null; return d;
    }, function (e) { recues.promesse = null; throw e; });
    return recues.promesse;
  }
  function posterRecues(corps, opts) {
    return AMX.post(corps, opts || { secours: false, rejouer: false, delai: 90000 }).then(function (d) {
      AMX.verifier(d, 'Action refusée');
      if (d.grillesRecues !== true) throw new Error(SCRIPT_RECUES);
      return d;
    });
  }
  /* La lecture des documents déposés : un document par requête (30 à 90 s chacun), tant que la page est ouverte. */
  var LECTURE = { en: false, arret: false, lus: 0, reste: 0, erreurs: [] };
  function annoncerLecture() { try { document.dispatchEvent(new CustomEvent('amx:grillesRecues')); } catch (e) {} }
  function lireTout() {
    if (LECTURE.en) return;
    LECTURE.en = true; LECTURE.arret = false; LECTURE.lus = 0; LECTURE.erreurs = [];
    annoncerLecture();
    (function suivant() {
      if (LECTURE.arret) { LECTURE.en = false; annoncerLecture(); return; }
      AMX.post({ action: 'grillesRecuesLire', max: 1 }, { secours: false, rejouer: false, delai: 330000 }).then(function (r) {
        if (r && r.enCours) { setTimeout(suivant, 20000); annoncerLecture(); return; }
        AMX.verifier(r, 'Lecture refusée');
        if (r.grillesRecues !== true) throw new Error(SCRIPT_RECUES);
        LECTURE.lus += r.lus || 0; LECTURE.reste = r.reste || 0;
        (r.erreurs || []).forEach(function (t) { LECTURE.erreurs.push(t); });
        recues.quand = 0;
        if (!r.lus || !r.reste) { LECTURE.en = false; vider(); annoncerLecture(); AMX.toast(LECTURE.lus + ' document' + (LECTURE.lus > 1 ? 's' : '') + ' lu' + (LECTURE.lus > 1 ? 's' : '') + ' par Einstein AI.', 'ok'); return; }
        annoncerLecture(); suivant();
      }).catch(function (e) { LECTURE.en = false; LECTURE.erreurs.push(texteErreur(e)); annoncerLecture(); AMX.toast('Lecture arrêtée — ' + texteErreur(e), 'erreur'); });
    })();
  }

  /* 21 nov. (Maxime : « on se fie sur Einstein ») : tout accepter d'un coup. Le serveur traite quelques documents par requête
     (4 minutes au plus) et écarte d'office ce qui ne s'applique plus ou est en double ; on recommence tant qu'il en reste. */
  var ACCEPTER = { en: false, faits: 0, prevus: 0, ecartes: 0, erreurs: [] };
  function accepterTout(n, m) {
    if (ACCEPTER.en) return Promise.resolve(null);
    return AMX.confirmer('Accepter les ' + n + ' programme' + (n > 1 ? 's' : '') + ' ?',
      'Ils entrent dans vos grilles tels qu\'Einstein AI les a lus.' + (m ? ' Les ' + m + ' qui ne s\'appliquent plus ou sont en double sont écartés : vous les voyez à part.' : ''),
      { ok: 'Tout accepter' }).then(function (oui) {
      if (!oui) return null;
      ACCEPTER.en = true; ACCEPTER.faits = 0; ACCEPTER.prevus = 0; ACCEPTER.ecartes = 0; ACCEPTER.erreurs = [];
      annoncerLecture();
      return new Promise(function (resoudre) {
        (function suivant(tour) {
          AMX.post({ action: 'grilleRecueAction', op: 'accepterTout' }, { secours: false, rejouer: false, delai: 330000 }).then(function (r) {
            AMX.verifier(r, 'Refusé');
            if (r.grillesRecues !== true || !r.accepterTout) throw new Error(SCRIPT_RECUES);
            ACCEPTER.faits += r.faits || 0; ACCEPTER.prevus += r.prevus || 0; ACCEPTER.ecartes += r.ecartes || 0;
            (r.erreurs || []).forEach(function (t) { ACCEPTER.erreurs.push(t); });
            recues.quand = 0; vider();
            if (r.reste && tour < 12) { annoncerLecture(); suivant(tour + 1); return; }
            ACCEPTER.en = false; annoncerLecture();
            var t = [ACCEPTER.faits + ' programme' + (ACCEPTER.faits > 1 ? 's' : '') + ' accepté' + (ACCEPTER.faits > 1 ? 's' : '')];
            if (ACCEPTER.prevus) t.push(ACCEPTER.prevus + ' prévu' + (ACCEPTER.prevus > 1 ? 's' : '') + ' plus tard');
            if (ACCEPTER.ecartes) t.push(ACCEPTER.ecartes + ' écarté' + (ACCEPTER.ecartes > 1 ? 's' : ''));
            AMX.toast(t.join(' · ') + (ACCEPTER.erreurs.length ? ' · ' + ACCEPTER.erreurs.length + ' refusé(s)' : '') + '.', ACCEPTER.erreurs.length ? 'info' : 'ok', ACCEPTER.erreurs.length ? 9000 : 5000);
            resoudre(r);
          }).catch(function (e) { ACCEPTER.en = false; annoncerLecture(); AMX.toast('Arrêté — ' + texteErreur(e), 'erreur'); resoudre(null); });
        })(1);
      });
    });
  }

  /* =============================== Aides d'écran =============================== */
  function argent(x, d) { return nb(x) ? AMX.fmtArgent(x, d === undefined ? 2 : d) : '—'; }
  function pct(x) { return nb(x) ? x.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 3 }) + ' %' : '—'; }
  function jour(iso) { if (!iso) return ''; var d = new Date(String(iso).slice(0, 10) + 'T12:00:00'); return isFinite(d.getTime()) ? d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' }) : String(iso); }
  function aujIso() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function modaliteLib(m, court) { var x = MODALITES.filter(function (y) { return y[0] === m; })[0] || MODALITES[0]; return court ? x[2] : x[1]; }
  function champ(libelle, el, aide) { return h('div.champ', [h('label', { text: libelle }), el, aide ? h('span.aide', { text: aide }) : null]); }
  function saisie(type, valeur, attrs) {
    var a = { type: type || 'text', autocomplete: 'off' }; Object.keys(attrs || {}).forEach(function (k) { a[k] = attrs[k]; });
    var el = h('input.saisie', a); if (valeur !== undefined && valeur !== null) el.value = String(valeur); return el;
  }
  function choix(options, valeur, attrs) {
    var el = h('select.saisie', attrs || {}, options.map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
    el.value = valeur === undefined || valeur === null ? '' : String(valeur); if (el.selectedIndex < 0) el.selectedIndex = 0; return el;
  }
  function provinceDefaut(d) {
    var cie = AMX.compagnieChoisie ? AMX.compagnieChoisie('inventaire') : '';
    var taxe = d && d.taxes && cie ? d.taxes[cie] : null;
    return taxe && Math.abs(taxe - 0.13) < 1e-6 ? 'ON' : 'QC';
  }
  function taxeDe(prov) { var x = PROVINCES.filter(function (p) { return p[0] === prov; })[0] || PROVINCES[0]; return x[2]; }
  function lireFichier(f) {
    return new Promise(function (ok, non) {
      var r = new FileReader();
      r.onload = function () { ok(String(r.result || '').replace(/^data:[^,]*,/, '')); };
      r.onerror = function () { non(new Error('Fichier illisible.')); };
      r.readAsDataURL(f);
    });
  }
  function choisirPdf() {
    return new Promise(function (ok) {
      var inp = h('input', { type: 'file', accept: 'application/pdf,.pdf', style: { display: 'none' } });
      inp.addEventListener('change', function () { var f = inp.files && inp.files[0]; inp.remove(); ok(f || null); });
      document.body.appendChild(inp); inp.click();
    });
  }
  function resumeTaux(p) {
    var l = (p.paliers || []).map(function (x) { return x.taux; }); if (!l.length) return '—';
    var a = Math.min.apply(null, l), b = Math.max.apply(null, l);
    return a === b ? pct(a) : pct(a).replace(' %', '') + ' à ' + pct(b);
  }
  function resumeRistourne(x) {
    if (x.tranches && x.tranches.length) return x.tranches.map(function (t) { return AMX.fmtArgent(t.de) + (nb(t.a) ? ' à ' + AMX.fmtArgent(t.a) : ' et plus') + ' : ' + (nb(t.fixe) ? AMX.fmtArgent(t.fixe) : '') + (nb(t.fixe) && nb(t.pct) ? ' + ' : '') + (nb(t.pct) ? pct(t.pct) : ''); }).join(' · ');
    var m = []; if (nb(x.pct)) m.push(pct(x.pct) + ' du montant financé'); if (nb(x.fixe)) m.push(AMX.fmtArgent(x.fixe)); return m.join(' + ') || 'aucune';
  }
  function resumeProgramme(p) {
    var m = [ETATS[p.etat] || ETATS.tous];
    if (p.client && p.client !== 'tous') m.push(CLIENTS[p.client]);
    m.push(p.typeTaux === 'variable' ? 'taux variable' : 'taux fixe');
    if (nb(p.anneeMin) || nb(p.anneeMax)) m.push('années ' + (nb(p.anneeMin) ? p.anneeMin : '…') + ' à ' + (nb(p.anneeMax) ? p.anneeMax : '…'));
    if (nb(p.termeMax)) m.push('jusqu\'à ' + p.termeMax + ' mois');
    if (p.concessions && p.concessions.length) m.push(p.concessions.map(function (c) { return (AMX.COMPAGNIES_TOUTES && AMX.COMPAGNIES_TOUTES[c]) || c; }).join(', '));
    return m.join(' · ');
  }

  /* =============================== La page =============================== */
  var MEMO_T = 'taux_transaction';
  /* venteId / venteTexte / venteCie : la vente du Livre des ventes d'où vient la transaction (21 nov.) — jamais le nom du client
     (la transaction est gardée dans le navigateur). */
  function transactionDefaut() { return { annee: new Date().getFullYear() - 2, montant: '', terme: 72, tauxVendu: '', modalite: 'mois', etat: 'occasion', client: 'particulier', typeTaux: '', province: '', venteId: '', venteTexte: '', venteCie: '' }; }
  function VueTaux(conteneur, ctx) {
    injecterCss();
    var self = this;
    this.conteneur = conteneur; this.detruit = false;
    this.vue = VUES.indexOf(ctx && ctx.onglet) >= 0 ? ctx.onglet : 'comparateur';
    this.d = null; this.erreur = '';
    var m = AMX.memo.lire(MEMO_T, null), t = transactionDefaut();
    if (m && typeof m === 'object') Object.keys(t).forEach(function (k) { if (m[k] !== undefined) t[k] = m[k]; });
    this.t = t;
    this.am = { date: aujIso(), montant: '', terme: 72, taux: '', modalite: 'mois', genre: 'pret', residuel: '' };
    this.gp = { service: '', terme: 72, km: '', kmAn: 20000, manuf: '48|80000', manufMois: 48, manufKm: 80000, protMois: 84, protKm: 140000 };
    this.page = h('div.page.tx-page');
    conteneur.appendChild(this.page);
    this.construire();
    this.charger(false);
    this.surCie = function () { if (!self.detruit && self.vue === 'comparateur') self.rendre(); };
    document.addEventListener('amx:compagnie', this.surCie);
    this.recuesDemandees = !!(ctx && ctx.params && ctx.params.recues);
    this.surLecture = function () { if (!self.detruit) { if (self.majRecues) self.majRecues(); if (!LECTURE.en && self.d) { vider(); self.charger(false); } } };
    document.addEventListener('amx:grillesRecues', this.surLecture);
    this.venteDemandee = ctx && ctx.params && ctx.params.vente ? String(ctx.params.vente) : '';   /* #/vente/taux?vente=V-123 (fiche d'une vente) */
    this.vente = null; this.venteInfo = null;
  }
  VueTaux.prototype.demonter = function () { this.detruit = true; document.removeEventListener('amx:compagnie', this.surCie); document.removeEventListener('amx:grillesRecues', this.surLecture); };
  VueTaux.prototype.naviguer = function (ctx) {
    if (ctx && ctx.params && ctx.params.recues && this.d) this.ouvrirRecues();
    if (ctx && ctx.params && ctx.params.vente && String(ctx.params.vente) !== this.t.venteId) { this.venteDemandee = String(ctx.params.vente); if (this.d) this.chargerVenteDemandee(); }
    var v = ctx && ctx.onglet; if (VUES.indexOf(v) < 0 || v === this.vue) return;
    this.vue = v; this.rendre();
  };
  VueTaux.prototype.construire = function () {
    var self = this;
    this.elSous = h('p', { text: SOUS[this.vue] });
    this.btnRafraichir = h('button.btn', { type: 'button', html: (I.rafraichir || '') + '<span>Rafraîchir</span>', onclick: function () { self.charger(true); } });
    this.btnAjouter = h('button.btn.primaire', { type: 'button', html: (I.plus || '') + '<span>Ajouter un programme</span>', onclick: function () { self.formulaire(null); } });
    this.btnEinstein = h('button.btn', { type: 'button', html: '<span>Lire une grille (PDF) avec Einstein</span>', onclick: function () { self.lireGrille(); } });
    this.btnImprimer = h('button.btn', { type: 'button', html: (I.imprimer || '') + '<span>Imprimer le tableau</span>', onclick: function () { self.imprimerAmortissement(); } });
    this.elActions = h('div.actions');
    this.corps = h('div.tx-corps');
    this.page.appendChild(h('div.entete-page', [h('div', [h('h1', 'Taux Einstein'), this.elSous]), this.elActions]));
    this.page.appendChild(this.corps);
  };
  VueTaux.prototype.charger = function (force) {
    var self = this;
    if (!this.d) this.rendre();
    return charger(force).then(function (d) {
      if (self.detruit) return;
      self.d = d; self.erreur = ''; self.rendre();
      if (force) AMX.toast('Programmes à jour.', 'ok', 2500);
      if (self.recuesDemandees) { self.recuesDemandees = false; self.ouvrirRecues(); }
      if (self.venteDemandee) self.chargerVenteDemandee();
    }).catch(function (e) {
      if (self.detruit) return;
      self.erreur = texteErreur(e); self.rendre();
    });
  };
  VueTaux.prototype.majActions = function () {
    var d = this.d, liste = [], garder = [];
    if (this.vue === 'grilles') {
      if (d && d.peutModifier) { liste.push(this.btnAjouter); garder.push(this.btnAjouter); if (d.einstein) { liste.push(this.btnEinstein); garder.push(this.btnEinstein); } }
      liste.push(this.btnRafraichir);
    } else if (this.vue === 'comparateur') { liste.push(this.btnRafraichir); garder.push(this.btnRafraichir); }
    else if (this.vue === 'amortissement') { liste.push(this.btnImprimer); garder.push(this.btnImprimer); }
    AMX.vider(this.elActions);
    (AMX.actionsEntete ? AMX.actionsEntete(liste, garder) : liste).forEach(function (b) { if (b) this.elActions.appendChild(b); }, this);
  };
  VueTaux.prototype.rendre = function () {
    this.elSous.textContent = SOUS[this.vue];
    this.majActions();
    AMX.vider(this.corps);
    if (this.vue === 'amortissement') { this.rendreAmortissement(); return; }
    if (this.vue === 'garantie') { this.rendreGarantie(); return; }
    if (this.erreur) { this.corps.appendChild(h('div.alerte-bloc.erreur', [h('strong', 'Les programmes n\'ont pas pu être lus. '), h('span', { text: this.erreur })])); return; }
    if (!this.d) { this.corps.appendChild(AMX.chargeur('Lecture des programmes')); return; }
    this.rendreBandeRecues();
    if (this.vue === 'grilles') this.rendreGrilles(); else this.rendreComparateur();
  };
  VueTaux.prototype.vers = function (vue) { AMX.aller('vente', 'taux', { vue: vue }); };

  /* ------------------------------ Comparateur ------------------------------ */
  VueTaux.prototype.transaction = function () {
    var t = this.t, cie = t.venteId && t.venteCie ? t.venteCie : (AMX.compagnieChoisie ? AMX.compagnieChoisie('inventaire') : '');   /* une vente : les programmes de SA concession */
    return { annee: num(t.annee), montant: num(t.montant), terme: num(t.terme), tauxVendu: num(t.tauxVendu), modalite: t.modalite || 'mois', etat: t.etat || 'occasion',
      client: t.client || 'particulier', typeTaux: t.typeTaux || '', cie: cie || '' };
  };
  VueTaux.prototype.rendreComparateur = function () {
    var self = this, d = this.d, t = this.t;
    if (!t.province) t.province = provinceDefaut(d);
    var enVigueur = d.programmes.filter(function (p) { return p.enVigueur !== false; });
    if (!enVigueur.length) {
      this.corps.appendChild(h('div.carte', [h('div.carte-corps.tx-depart', [
        h('h2', 'Aucun programme inscrit pour l\'instant'),
        h('p', 'Le comparateur calcule à partir des grilles de taux que vos banques remettent à la concession. Inscrivez-les une fois dans « Grilles de taux » : un programme par grille, avec ses paliers de taux, sa ristourne et son boni.'),
        d.peutModifier
          ? h('div.tx-depart-boutons', [h('button.btn.primaire', { type: 'button', text: 'Ouvrir les grilles de taux', onclick: function () { self.vers('grilles'); } })])
          : h('p.tx-note', 'Le directeur commercial (F&I), le directeur général ou le propriétaire peut les inscrire.')
      ])]));
      return;
    }
    var maj = function () { AMX.memo.ecrire(MEMO_T, self.t); self.rendreResultats(); };
    var lent = AMX.debounce(maj, 220);
    function lie(el, cle, tout) { el.addEventListener(tout ? 'change' : 'input', function () { self.t[cle] = el.value; (tout ? maj : lent)(); }); return el; }
    this.elPaiement = h('output.tx-paiement');
    var inMontant = lie(saisie('text', t.montant, { inputmode: 'decimal', id: 'tx-montant', placeholder: '35 000' }), 'montant');
    this.elVente = h('div.tx-vente-zone');
    inMontant.addEventListener('input', function () { self.majNoteVente(); });
    var form = h('form.carte.tx-form', { onsubmit: function (e) { e.preventDefault(); maj(); }, 'aria-label': 'Votre transaction' }, [
      h('div.carte-entete.tx-form-tete', [h('h2', 'Votre transaction'),
        h('button.btn.petit.tx-btn-vente', { type: 'button', text: t.venteId ? 'Autre vente…' : 'Partir d\'une vente…', title: 'Remplir la transaction avec une vente du Livre des ventes', onclick: function () { self.choisirVente(); } })]),
      h('div.carte-corps', [
        this.elVente,
        champ('Année du véhicule', lie(saisie('text', t.annee, { inputmode: 'numeric', id: 'tx-annee', maxlength: '4' }), 'annee')),
        champ('Montant financé (taxes incluses)', inMontant),
        champ('Terme (mois)', lie(saisie('text', t.terme, { inputmode: 'numeric', id: 'tx-terme', list: 'tx-termes', maxlength: '3' }), 'terme')),
        h('datalist#tx-termes', [24, 36, 48, 60, 72, 84, 96].map(function (x) { return h('option', { value: String(x) }); })),
        champ('Taux vendu au client (%)', lie(saisie('text', t.tauxVendu, { inputmode: 'decimal', id: 'tx-vendu', placeholder: 'facultatif — ex. 8,49' }), 'tauxVendu'), 'Avec un taux vendu : le gain du client et le potentiel de chaque programme.'),
        champ('Versements', lie(choix(MODALITES, t.modalite, { id: 'tx-modalite' }), 'modalite', true)),
        this.elPaiement,
        champ('Véhicule', lie(choix([['occasion', 'Occasion'], ['neuf', 'Neuf']], t.etat, { id: 'tx-etat' }), 'etat', true)),
        champ('Client', lie(choix([['particulier', 'Particulier'], ['entreprise', 'Entreprise']], t.client, { id: 'tx-client' }), 'client', true)),
        champ('Type de taux', lie(choix([['', 'Fixes et variables'], ['fixe', 'Fixes'], ['variable', 'Variables']], t.typeTaux, { id: 'tx-type' }), 'typeTaux', true)),
        champ('Taxes', lie(choix(PROVINCES.map(function (p) { return [p[0], p[1]]; }), t.province, { id: 'tx-province' }), 'province', true), 'Le gain du client est montré avant taxes.'),
        h('button.btn.fantome.tx-reinit', { type: 'button', text: 'Réinitialiser', onclick: function () { self.t = transactionDefaut(); AMX.memo.ecrire(MEMO_T, self.t); self.rendre(); } })
      ])
    ]);
    this.elRes = h('div.tx-res');
    this.corps.appendChild(h('div.tx-deux', [form, this.elRes]));
    this.rendreVente();
    this.rendreResultats();
  };

  /* -------- 21 nov. : partir d'une vente du Livre des ventes (« aller chercher une vente pour travailler avec le comparateur ») -------- */
  var PAIEMENTS = { financement: 'Financement', financementBmw: 'Financement BMW', financementAutre: 'Financement autre', location: 'Location', comptant: 'Comptant' };
  var VENTES_MOIS = {};   /* 'CIE|AAAA-MM' → { quand, liste } — en mémoire seulement */
  function moisIso(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); }
  function moisRecents(n) { var out = [], d = new Date(); d.setDate(1); for (var k = 0; k < n; k++) { out.push(moisIso(d)); d.setMonth(d.getMonth() - 1); } return out; }
  function moisLib(m) { var s = new Date(m + '-15T12:00:00').toLocaleDateString('fr-CA', { month: 'long', year: 'numeric' }); return s.charAt(0).toUpperCase() + s.slice(1); }
  function moisVente(v) { return String(v.dateVente || v.declareLe || '').slice(0, 7); }
  /* Les ventes neuves et d'occasion VENDUES dans le mois (pas le wholesale, ni une annulée, ni une ligne hors vente). */
  function ventesDuMois(cie, m, force) {
    var cle = (cie || '') + '|' + m, g = VENTES_MOIS[cle];
    if (!force && g && Date.now() - g.quand < AMX.dureeCopie(120000)) return Promise.resolve(g.liste);
    var params = { ventes: 1, mois: m }; if (cie) params.compagnie = cie;
    return AMX.get(params, { gz: true, secours: false, delai: 60000 }).then(function (d) {
      AMX.verifier(d, 'Ventes illisibles');
      if (!Array.isArray(d.ventes)) throw new Error('Le script n\'est pas à jour : déployez une nouvelle version (Vente.gs).');
      var vus = {}, liste = [];
      d.ventes.concat(Array.isArray(d.venduesAutres) ? d.venduesAutres : []).forEach(function (v) {
        if (!v || !v.id || vus[v.id]) return; vus[v.id] = 1;
        if (v.type === 'wholesale' || v.statut === 'annulee' || v.horsVente) return;
        if (moisVente(v) !== m) return;
        liste.push(v);
      });
      liste.sort(function (a, b) { return String(b.dateVente || b.declareLe || '').localeCompare(String(a.dateVente || a.declareLe || '')) || String(b.id).localeCompare(String(a.id)); });
      VENTES_MOIS[cle] = { quand: Date.now(), liste: liste };
      return liste;
    });
  }
  function texteVente(v) { return [v.vehicule || [v.annee, v.marque, v.modele].filter(Boolean).join(' '), v.stock ? '# ' + v.stock : ''].filter(Boolean).join(' · '); }
  VueTaux.prototype.provinceDe = function (cie) {
    var x = this.d && this.d.taxes && cie ? this.d.taxes[cie] : null;
    if (nb(x)) return Math.abs(x - 0.13) < 1e-6 ? 'ON' : 'QC';
    return cie === 'HAWKS' ? 'ON' : 'QC';
  };
  VueTaux.prototype.appliquerVente = function (v) {
    var t = this.t, cie = String(v.compagnie || ''), prov = this.provinceDe(cie), x = deVente(v, taxeDe(prov));
    t.annee = x.annee; t.etat = x.etat; t.client = x.client; t.province = prov; t.montant = x.montant;
    t.tauxVendu = '';   /* le taux vendu est celui du contrat : le livre ne l'a pas */
    t.venteId = String(v.id || ''); t.venteTexte = texteVente(v); t.venteCie = cie;
    this.vente = v; this.venteInfo = x; this.venteDemandee = '';
    AMX.memo.ecrire(MEMO_T, t);
    if (this.vue !== 'comparateur') { this.vers('comparateur'); AMX.toast('Vente ' + t.venteId + ' reprise. Inscrivez le terme et le taux du contrat.', 'ok', 4000); return; }
    this.rendre();
    AMX.toast('Vente ' + t.venteId + ' reprise. Inscrivez le terme et le taux du contrat.', 'ok', 4000);
    var el = document.getElementById(x.montant ? 'tx-terme' : 'tx-montant'); if (el) { try { el.focus(); el.select(); } catch (e) {} }
  };
  VueTaux.prototype.chargerVenteDemandee = function () {
    var self = this, id = this.venteDemandee; if (!id || !AMX.ventes || !AMX.ventes.une) return;
    this.venteDemandee = '';
    AMX.ventes.une(id).then(function (v) { if (!self.detruit && v) self.appliquerVente(v); })
      .catch(function (e) { if (!self.detruit) AMX.toast('Vente ' + id + ' introuvable — ' + texteErreur(e), 'erreur'); });
  };
  VueTaux.prototype.oublierVente = function () {
    var t = this.t; t.venteId = ''; t.venteTexte = ''; t.venteCie = '';
    this.vente = null; this.venteInfo = null; AMX.memo.ecrire(MEMO_T, t); this.rendre();
  };
  /* Le bloc de la vente au haut du formulaire : laquelle, son client (en mémoire seulement), le montant estimé. */
  VueTaux.prototype.rendreVente = function () {
    var self = this, z = this.elVente, t = this.t; if (!z) return;
    AMX.vider(z);
    if (!t.venteId) return;
    var v = this.vente && String(this.vente.id) === t.venteId ? this.vente : null;
    var nomCie = t.venteCie ? ((AMX.COMPAGNIES_TOUTES && AMX.COMPAGNIES_TOUTES[t.venteCie]) || t.venteCie) : '';
    var sous = [v && v.client ? v.client : '', v && v.dateVente ? 'vendue le ' + jour(v.dateVente) : '', v && PAIEMENTS[v.paiement] ? PAIEMENTS[v.paiement] : '', nomCie].filter(Boolean).join(' · ');
    z.appendChild(h('div.tx-vente', [
      h('div.tx-vente-l1', [h('strong', { text: 'Vente ' + t.venteId }), h('span', { text: t.venteTexte || '' })]),
      sous ? h('div.tx-vente-l2', { text: sous }) : null,
      h('div.tx-vente-actions', [
        h('button.tx-lien', { type: 'button', text: 'Voir la vente', onclick: function () { AMX.aller('vente', 'ventes', { id: t.venteId }); } }),
        h('button.tx-lien', { type: 'button', text: 'Retirer la vente', title: 'La transaction reste, sans lien avec la vente', onclick: function () { self.oublierVente(); } })
      ]),
      this.elVenteNote = h('div.tx-vente-note')
    ]));
    this.majNoteVente();
  };
  VueTaux.prototype.majNoteVente = function () {
    var z = this.elVenteNote, x = this.venteInfo; if (!z) return;
    AMX.vider(z);
    if (!x || !this.t.venteId || !this.vente || String(this.vente.id) !== this.t.venteId) return;
    var c = x.calcul, lignes = [];
    if (c && num(this.t.montant) === c.montant) {
      var plus = (c.accessoires ? ' + accessoires ' + argent(c.accessoires, 0) : '') + (c.pneus ? ' + pneus ' + argent(c.pneus, 0) : '') + (c.echange ? ' − échange ' + argent(c.echange, 0) : '');
      lignes.push('Montant ESTIMÉ à partir du livre : prix ' + argent(c.prix, 0) + plus + (plus ? ' = ' + argent(c.base, 0) : '') + ', plus les taxes (' + pct(Math.round(c.taxe * 100000) / 1000) + ') = ' + argent(c.montant)
        + '. Corrigez-le avec le montant du contrat (comptant, solde de l\'échange, produits F&I).');
    }
    x.avis.forEach(function (a) { lignes.push(a); });
    lignes.push('Le terme et le taux vendu viennent du contrat : le livre ne les a pas.');
    lignes.forEach(function (l) { z.appendChild(h('p', { text: l })); });
  };
  VueTaux.prototype.choisirVente = function () {
    var self = this, cie = AMX.compagnieChoisie ? AMX.compagnieChoisie('inventaire') : '';
    var mois = moisRecents(6), etat = { mois: mois[0], q: '', liste: null, erreur: '', charge: false };
    var selMois = choix(mois.map(function (m) { return [m, moisLib(m)]; }), etat.mois, { 'aria-label': 'Mois de la vente' });
    var rech = saisie('search', '', { placeholder: 'Client, # stock, NIV, modèle, V-…', 'aria-label': 'Chercher une vente', enterkeyhint: 'search' });
    var zone = h('div.tx-ventes', { 'aria-live': 'polite' });
    var nomCie = cie ? ((AMX.COMPAGNIES_TOUTES && AMX.COMPAGNIES_TOUTES[cie]) || cie) : 'toutes vos concessions';
    var corps = h('div.tx-choix-vente', [
      h('p.tx-note', { text: 'Les ventes neuves et d\'occasion vendues dans le mois — ' + nomCie + '. Le comparateur reprend l\'année, neuf ou occasion, le client et un montant estimé ; vous inscrivez le terme et le taux du contrat.' }),
      h('div.tx-ventes-barre', [selMois, rech]), zone]);
    var m = AMX.modale({ titre: 'Partir d\'une vente du Livre des ventes', corps: corps, large: true, proteger: false, classe: 'tx-modale-ventes', boutons: [{ texte: 'Fermer' }] });
    function dessiner() {
      AMX.vider(zone);
      if (etat.erreur) { zone.appendChild(h('div.alerte-bloc.erreur', { text: 'Les ventes n\'ont pas pu être lues. ' + etat.erreur })); return; }
      if (!etat.liste) { zone.appendChild(AMX.chargeur('Lecture du Livre des ventes', { compact: true })); return; }
      var q = String(rech.value || '').trim();
      var liste = etat.liste.filter(function (v) { return !q || AMX.correspond([v.id, v.stock, v.vin, v.vehicule, v.client, v.conseiller, v.directeur, PAIEMENTS[v.paiement] || ''], q); });
      zone.appendChild(h('p.tx-ventes-compte', { text: liste.length + ' vente' + (liste.length > 1 ? 's' : '') + (q ? ' trouvée' + (liste.length > 1 ? 's' : '') : '') + ' · ' + moisLib(etat.mois) }));
      if (!liste.length) { zone.appendChild(h('p.tx-note', { text: q ? 'Aucune vente ne correspond. Essayez un autre mois.' : 'Aucune vente neuve ou d\'occasion ce mois-ci.' })); return; }
      zone.appendChild(h('ul.tx-ventes-liste', liste.slice(0, 200).map(function (v) {
        var droite = [v.dateVente ? jour(v.dateVente) : '', nb(v.prixVente) ? argent(v.prixVente, 0) : '', PAIEMENTS[v.paiement] || ''].filter(Boolean).join(' · ');
        var gauche = [v.id, v.stock ? '# ' + v.stock : '', v.client || '', v.conseiller || '', !cie && v.compagnie ? ((AMX.COMPAGNIES_TOUTES && AMX.COMPAGNIES_TOUTES[v.compagnie]) || v.compagnie) : ''].filter(Boolean).join(' · ');
        return h('li', [h('button.tx-vente-ligne', { type: 'button', onclick: function () { m.fermer(); self.appliquerVente(v); } }, [
          h('span.tx-vl-1', [h('strong', { text: v.vehicule || [v.annee, v.marque, v.modele].filter(Boolean).join(' ') || '(véhicule ?)' }), h('span.tx-vl-type', { text: v.type === 'neuf' ? 'Neuf' : 'Occasion' })]),
          h('span.tx-vl-2', { text: gauche }),
          h('span.tx-vl-3', { text: droite })
        ])]);
      })));
      if (liste.length > 200) zone.appendChild(h('p.tx-note', { text: 'Les 200 plus récentes : précisez la recherche.' }));
    }
    function charger() {
      etat.liste = null; etat.erreur = ''; dessiner();
      var m0 = etat.mois;
      ventesDuMois(cie, m0, false).then(function (l) { if (etat.mois !== m0) return; etat.liste = l; dessiner(); })
        .catch(function (e) { if (etat.mois !== m0) return; etat.erreur = texteErreur(e); dessiner(); });
    }
    selMois.addEventListener('change', function () { etat.mois = selMois.value; charger(); });
    rech.addEventListener('input', AMX.debounce(dessiner, 150));
    charger();
    setTimeout(function () { try { rech.focus(); } catch (e) {} }, 50);
  };
  VueTaux.prototype.rendreResultats = function () {
    var self = this, d = this.d, z = this.elRes; if (!z) return;
    AMX.vider(z);
    var t = this.transaction(), taxe = taxeDe(this.t.province);
    var manque = [];
    if (!nb(t.annee) || t.annee < 1990 || t.annee > 2100) manque.push('l\'année du véhicule');
    if (!nb(t.montant) || t.montant <= 0) manque.push('le montant financé');
    if (!nb(t.terme) || t.terme < 1 || t.terme > 120) manque.push('le terme');
    if (this.elPaiement) {
      var p0 = nb(t.tauxVendu) && t.tauxVendu > 0 && !manque.length ? paiement(t.montant, t.tauxVendu, t.terme, t.modalite) : null;
      this.elPaiement.textContent = p0 === null ? '' : 'Versement du client : ' + argent(cents(p0)) + ' ' + modaliteLib(t.modalite, true);
      this.elPaiement.hidden = p0 === null;
    }
    if (manque.length) { z.appendChild(h('div.carte', [h('div.carte-corps.tx-attente', [h('p', 'Inscrivez ' + manque.join(', ').replace(/, ([^,]*)$/, ' et $1') + ' pour comparer les programmes.')])])); return; }
    var r = comparer(d.programmes.filter(function (p) { return p.enVigueur !== false; }), t, taxe);
    var inst = {}; r.lignes.forEach(function (l) { inst[l.p.institution] = 1; });
    var tete = h('div.tx-res-tete', [
      h('strong', { text: r.lignes.length + ' programme' + (r.lignes.length > 1 ? 's' : '') + ' · ' + Object.keys(inst).length + ' institution' + (Object.keys(inst).length > 1 ? 's' : '') }),
      h('span', { text: r.complet
        ? 'Taux vendu ' + pct(t.tauxVendu) + ' · ' + r.versements + ' versements de ' + argent(cents(r.paiementVendu)) + ' · classés du plus payant au moins payant'
        : 'Du taux le plus bas au plus haut. Inscrivez le taux vendu pour voir le gain et le potentiel.' })
    ]);
    z.appendChild(tete);
    if (r.lignes.length) z.appendChild(this.carteCombinaisons(r, t));
    if (!r.lignes.length) z.appendChild(h('div.carte', [h('div.carte-corps.tx-attente', [h('p', 'Aucun programme inscrit ne s\'applique à cette transaction.')])]));
    else z.appendChild(r.complet ? this.tableComplete(r, t) : this.tableSimple(r, t));
    if (r.exclus.length) {
      z.appendChild(h('details.tx-exclus', [
        h('summary', { text: r.exclus.length + ' programme' + (r.exclus.length > 1 ? 's' : '') + ' pas admissible' + (r.exclus.length > 1 ? 's' : '') + ' pour cette transaction' }),
        h('ul', r.exclus.map(function (x) { return h('li', [h('button.tx-lien', { type: 'button', text: x.p.institution + ' — ' + x.p.programme, onclick: function () { self.fiche(x.p); } }), h('span', { text: ' : ' + x.raisons.join(', ') })]); }))
      ]));
    }
    var dates = d.programmes.map(function (p) { return p.majLe || ''; }).sort();
    z.appendChild(h('p.tx-note', { text: 'Estimation à partir des grilles inscrites dans « Grilles de taux »' + (dates.length && dates[dates.length - 1] ? ' (dernière mise à jour le ' + jour(dates[dates.length - 1]) + ')' : '') + '. La ristourne, le boni et le taux restent ceux de l\'approbation de la banque.' }));
  };
  /* Les meilleures combinaisons, en haut des résultats. */
  VueTaux.prototype.carteCombinaisons = function (r, t) {
    var self = this, c = combinaisons(r, 5), mod = modaliteLib(t.modalite, true);
    if (!c.lignes.length) return h('div');
    var titre = c.mode === 'vendu' ? 'Les plus payantes au taux vendu de ' + pct(t.tauxVendu) : 'Meilleures combinaisons';
    var sous = c.mode === 'vendu' ? 'Le versement du client ne change pas : la ristourne, le boni et l\'écart de taux font la différence.'
      : 'Du versement le plus bas au plus payant. Aucune autre banque ne rapporte plus pour un versement aussi bas.';
    var lignes = c.lignes.map(function (x, k) {
      var tags = x.tags.map(function (tg) { return h('span.tx-comb-tag.' + tg, { text: tg === 'client' ? 'Meilleur versement' : 'Le plus payant' }); });
      var ecart = c.mode === 'frontiere' && k > 0
        ? '+ ' + argent(x.ecartRapporte, 0) + ' pour ' + argent(x.ecartPaiement) + ' de plus ' + mod
        : (c.mode === 'vendu' ? 'potentiel ' + argent(cents(x.o.potentiel), 0) + (x.boni ? ' + boni ' + argent(x.boni, 0) : '') : '');
      return h('li.tx-comb', [
        h('div.tx-comb-qui', [h('strong', { text: x.inst }), h('button.tx-lien', { type: 'button', text: x.l.p.programme, onclick: function () { self.fiche(x.l.p); } }), h('span.tx-comb-tags', tags)]),
        h('div.tx-comb-chiffres', [
          h('span.tx-comb-taux', { text: pct(x.taux) }),
          h('span', { text: argent(cents(x.paiement)) + ' ' + mod }),
          h('span.tx-comb-rap', { title: c.mode === 'vendu' ? 'Ristourne + boni + écart de taux sur tout le terme' : 'Ristourne' + (x.boni ? ' + boni' : '') }, [h('small', 'Rapporte '), h('strong', { text: argent(x.rapporte, 0) })])
        ]),
        ecart ? h('div.tx-comb-ecart', { text: ecart }) : null
      ]);
    });
    return h('section.carte.tx-combs', [h('div.carte-entete', [h('h2', { text: titre }), h('span.tx-note', { text: sous })]), h('ol.tx-comb-liste', lignes)]);
  };
  VueTaux.prototype.celluleProgramme = function (l, n) {
    var self = this, p = l.p;
    return h('th.tx-prog', { scope: 'rowgroup', rowspan: String(Math.max(1, n)) }, [
      h('span.tx-inst', { text: p.institution }),
      h('button.tx-lien', { type: 'button', text: p.programme, title: 'Voir le programme : conditions, paliers, grille', onclick: function () { self.fiche(p); } }),
      h('span.tx-prog-sous', { text: (p.typeTaux === 'variable' ? 'Variable' : 'Fixe') + (p.exige ? ' · ' + p.exige : '') }),
      p.pdf ? h('button.tx-lien.tx-pdf', { type: 'button', text: 'Grille (PDF)', onclick: function () { self.ouvrirPdf(p); } }) : null
    ]);
  };
  VueTaux.prototype.celluleBoni = function (l, n) {
    var b = l.boni;
    if (!b.texte) return h('td.num.tx-boni', { rowspan: String(Math.max(1, n)), text: '—' });
    return h('td.num.tx-boni' + (b.applicable ? '' : '.non'), { rowspan: String(Math.max(1, n)), title: b.texte }, [
      h('span', { text: b.montant ? argent(b.montant, 0) : 'voir' }), b.applicable ? null : h('small', { text: b.montant ? 'conditions pas remplies' : 'conditions' })
    ]);
  };
  VueTaux.prototype.tableComplete = function (r, t) {
    var self = this, premier = true;
    var corps = r.lignes.map(function (l) {
      var n = l.paliers.length, lignes = l.paliers.map(function (o, k) {
        var meilleur = premier && o.potentiel === l.meilleur; if (meilleur) premier = false;
        return h('tr' + (meilleur ? '.tx-top' : ''), [
          k === 0 ? self.celluleProgramme(l, n) : null,
          h('td.num', { title: 'Versement à ce taux : ' + argent(cents(o.paiement)) + ' ' + modaliteLib(t.modalite, true) }, [h('strong', { text: pct(o.taux) })]),
          h('td.num', { text: argent(o.ristourne), title: nb(o.pct) ? pct(o.pct) + ' du montant financé' : '' }),
          k === 0 ? self.celluleBoni(l, n) : null,
          h('td.num', { text: argent(o.ristBoni) }),
          h('td.num' + (o.gainVersement < -0.005 ? '.tx-neg' : ''), { text: argent(cents(o.gainVersement)) }),
          h('td.num' + (o.gainTotal < -0.005 ? '.tx-neg' : ''), { text: argent(cents(o.gainTotal)) }),
          h('td.num.tx-pot' + (o.potentiel < -0.005 ? '.tx-neg' : ''), [h('strong', { text: argent(cents(o.potentiel)) }), meilleur ? h('small', 'le plus payant') : null]),
          h('td.num.opt', { text: o.suivante ? argent(o.suivante.manque, 0) : 's. o.', title: o.suivante ? 'Il manque ' + argent(o.suivante.manque, 0) + ' pour la tranche de ' + argent(o.suivante.de, 0) + ' (ristourne ' + argent(o.suivante.montant) + ')' : 'Pas de tranche de montant' }),
          k === 0 ? h('td.num.opt', { rowspan: String(n), text: nb(l.termeMax) ? l.termeMax + ' mois' : '—' }) : null
        ]);
      });
      return h('tbody', lignes);
    });
    return h('div.carte.tx-defile', [h('table.tableau.tx-table', [
      h('thead', [h('tr', [h('th', 'Institution et programme'), h('th.num', 'Taux'), h('th.num', 'Ristourne'), h('th.num', 'Boni'), h('th.num', 'Ristourne + boni'),
        h('th.num', { text: 'Gain par versement', title: 'Ce que le client paie de moins à chaque versement, avant taxes, par rapport au taux vendu' }), h('th.num', 'Gain total'),
        h('th.num', { text: 'Potentiel', title: 'Ristourne + gain total : ce que la transaction peut rapporter si le client garde son versement' }),
        h('th.num.opt', 'Tranche suivante'), h('th.num.opt', 'Terme max.')])])
    ].concat(corps))]);
  };
  VueTaux.prototype.tableSimple = function (r) {
    var self = this;
    var corps = r.lignes.map(function (l) {
      var n = l.paliers.length;
      return h('tbody', l.paliers.map(function (o, k) {
        return h('tr', [
          k === 0 ? self.celluleProgramme(l, n) : null,
          h('td.num', [h('strong', { text: pct(o.taux) })]),
          h('td.num', { text: argent(o.ristourne), title: nb(o.pct) ? pct(o.pct) + ' du montant financé' : '' }),
          k === 0 ? h('td.num', { rowspan: String(n), text: nb(l.termeMax) ? l.termeMax + ' mois' : '—' }) : null,
          k === 0 ? h('td.tx-texte.opt', { rowspan: String(n), text: l.p.majoration || 'Aucune majoration' }) : null,
          k === 0 ? h('td.tx-texte' + (l.boni.texte && !l.boni.applicable ? '.non' : ''), { rowspan: String(n), text: l.boni.texte || '—' }) : null
        ]);
      }));
    });
    return h('div.carte.tx-defile', [h('table.tableau.tx-table', [
      h('thead', [h('tr', [h('th', 'Institution et programme'), h('th.num', 'Taux'), h('th.num', 'Ristourne'), h('th.num', 'Terme max.'), h('th.opt', 'Majoration'), h('th', 'Boni')])])
    ].concat(corps))]);
  };
  VueTaux.prototype.ouvrirPdf = function (p) {
    var w = null; try { w = window.open('', '_blank'); } catch (e) {}
    AMX.get({ tauxGrille: p.id }, { delai: 60000 }).then(function (d) {
      AMX.verifier(d, 'Grille illisible');
      if (!d.base64) throw new Error('Aucune grille en PDF pour ce programme.');
      var bin = atob(d.base64), o = new Uint8Array(bin.length); for (var k = 0; k < bin.length; k++) o[k] = bin.charCodeAt(k);
      var url = URL.createObjectURL(new Blob([o], { type: 'application/pdf' }));
      if (w && !w.closed) w.location = url; else { var a = h('a', { href: url, download: d.nom || 'grille.pdf' }); document.body.appendChild(a); a.click(); a.remove(); }
      setTimeout(function () { URL.revokeObjectURL(url); }, 120000);
    }).catch(function (e) { if (w && !w.closed) w.close(); AMX.toast('Grille non ouverte — ' + texteErreur(e), 'erreur'); });
  };
  /* La fiche d'un programme : tout ce que la banque a écrit. */
  VueTaux.prototype.fiche = function (p) {
    var self = this, d = this.d || {};
    var lignes = (p.paliers || []).map(function (x) {
      return h('tr', [h('td.num', [h('strong', { text: pct(x.taux) })]), h('td', { text: nb(x.termeMin) || nb(x.termeMax) ? (nb(x.termeMin) ? x.termeMin : '…') + ' à ' + (nb(x.termeMax) ? x.termeMax : '…') + ' mois' : 'tous les termes' }), h('td', { text: resumeRistourne(x) })]);
    });
    var termes = Object.keys(p.termes || {}).sort().map(function (a) { return a + ' : ' + p.termes[a] + ' mois'; });
    var b = boniDe(p, {});
    var corps = h('div.tx-fiche', [
      h('p.tx-fiche-sous', { text: resumeProgramme(p) }),
      p.enVigueur === false ? h('div.alerte-bloc.attention', { text: p.actif === false ? 'Programme retiré : il ne sert plus au comparateur.' : (p.aVenir ? 'Ce programme commence le ' + jour(p.debut) + '.' : 'Ce programme s\'est terminé le ' + jour(p.fin) + '.') }) : null,
      h('table.tableau.tx-table.tx-paliers', [h('thead', [h('tr', [h('th.num', 'Taux'), h('th', 'Terme'), h('th', 'Ristourne')])]), h('tbody', lignes)]),
      h('dl.tx-dl', [
        b.texte ? h('dt', 'Boni') : null, b.texte ? h('dd', { text: b.texte }) : null,
        termes.length ? h('dt', 'Terme maximal par année') : null, termes.length ? h('dd', { text: termes.join(' · ') }) : null,
        p.majoration ? h('dt', 'Majoration') : null, p.majoration ? h('dd', { text: p.majoration }) : null,
        p.exige ? h('dt', 'Réservé à') : null, p.exige ? h('dd', { text: p.exige }) : null,
        (p.debut || p.fin) ? h('dt', 'En vigueur') : null, (p.debut || p.fin) ? h('dd', { text: (p.debut ? 'du ' + jour(p.debut) : '') + (p.fin ? ' au ' + jour(p.fin) : '') }) : null,
        p.conditions ? h('dt', 'Conditions') : null, p.conditions ? h('dd.tx-pre', { text: p.conditions }) : null
      ]),
      h('p.tx-note', { text: 'Mis à jour le ' + (jour(p.majLe) || '—') + (p.majParNom ? ' par ' + p.majParNom : '') + (p.source === 'einstein' ? ' · lu dans le PDF par Einstein AI, puis vérifié' : '') + '.' })
    ]);
    var boutons = [{ texte: 'Fermer' }];
    if (p.pdf) boutons.push({ texte: 'Ouvrir la grille (PDF)', action: function () { self.ouvrirPdf(p); return false; } });
    if (d.peutModifier) boutons.push({ texte: 'Modifier', classe: 'primaire', action: function (f) { f(); self.formulaire(p); return false; } });
    AMX.modale({ titre: p.institution + ' — ' + p.programme, corps: corps, large: true, boutons: boutons, proteger: false });
  };

  /* ------------------------------ Grilles de taux ------------------------------ */
  VueTaux.prototype.rendreGrilles = function () {
    var self = this, d = this.d, z = this.corps;
    if (!d.programmes.length) {
      z.appendChild(h('div.carte', [h('div.carte-corps.tx-depart', [
        h('h2', 'Inscrivez votre première grille'),
        h('p', 'Un programme = une grille de taux d\'une banque : ses paliers de taux, la ristourne à chaque palier, le boni et ses conditions. Le comparateur calcule ensuite tout seul pour chaque transaction.'),
        d.peutModifier ? h('div.tx-depart-boutons', [
          h('button.btn.primaire', { type: 'button', text: 'Ajouter un programme', onclick: function () { self.formulaire(null); } }),
          d.einstein ? h('button.btn', { type: 'button', text: 'Lire une grille (PDF) avec Einstein', onclick: function () { self.lireGrille(); } }) : null
        ]) : h('p.tx-note', 'Le directeur commercial (F&I), le directeur général ou le propriétaire peut les inscrire.'),
        d.peutModifier && d.einstein ? h('p.tx-note', 'Einstein AI lit le PDF de la banque et propose les paliers : vous vérifiez chaque chiffre, puis vous enregistrez. Rien n\'est enregistré sans vous.') : null
      ])]));
      return;
    }
    var par = {}, ordre = [];
    d.programmes.forEach(function (p) { if (!par[p.institution]) { par[p.institution] = []; ordre.push(p.institution); } par[p.institution].push(p); });
    ordre.sort(function (a, b) { return a.localeCompare(b); });
    var gauche = h('div.tx-inst-liste', ordre.map(function (nom) {
      var l = par[nom].slice().sort(function (a, b) { return (a.enVigueur === false ? 1 : 0) - (b.enVigueur === false ? 1 : 0) || a.programme.localeCompare(b.programme); });
      return h('section.carte.tx-inst-carte', [
        h('div.carte-entete', [h('h2', { text: nom }), h('span.tx-compte', { text: l.filter(function (p) { return p.enVigueur !== false; }).length + ' en vigueur' })]),
        h('ul.tx-progs', l.map(function (p) {
          var etat = p.actif === false ? 'Retiré' : (p.echu ? 'Terminé le ' + jour(p.fin) : (p.aVenir ? 'Commence le ' + jour(p.debut) : ''));
          return h('li' + (p.enVigueur === false ? '.tx-hors' : ''), [
            h('div.tx-prog-txt', [
              h('button.tx-lien.tx-prog-nom', { type: 'button', text: p.programme, onclick: function () { self.fiche(p); } }),
              h('span.tx-prog-sous', { text: resumeProgramme(p) }),
              h('span.tx-prog-sous', { text: (p.paliers || []).length + ' palier' + ((p.paliers || []).length > 1 ? 's' : '') + ' · ' + resumeTaux(p) + (p.boni && p.boni.montant ? ' · boni ' + AMX.fmtArgent(p.boni.montant) : '') + ' · mis à jour le ' + (jour(p.majLe) || '—') }),
              etat ? h('span.tx-etat', { text: etat }) : null
            ]),
            h('div.tx-prog-gestes', [
              p.pdf ? h('button.btn.petit', { type: 'button', text: 'PDF', title: 'Ouvrir la grille de la banque', onclick: function () { self.ouvrirPdf(p); } }) : null,
              d.peutModifier ? h('button.btn.petit', { type: 'button', text: 'Modifier', onclick: function () { self.formulaire(p); } }) : null,
              d.peutModifier ? h('button.btn.petit', { type: 'button', text: p.pdf ? 'Remplacer le PDF' : 'Joindre le PDF', onclick: function () { self.joindrePdf(p); } }) : null,
              d.peutModifier ? h('button.btn.petit.fantome', { type: 'button', text: p.actif === false ? 'Remettre' : 'Retirer', onclick: function () { self.retirer(p); } }) : null
            ])
          ]);
        }))
      ]);
    }));
    var mises = h('aside.carte.tx-mises', [
      h('div.carte-entete', [h('h2', 'Dernières mises à jour')]),
      h('ul', (d.mises || []).map(function (m) {
        return h('li', [h('strong', { text: m.institution }), h('span', { text: m.programme + (m.actif === false ? ' (retiré)' : '') }), h('small', { text: jour(m.le) + (m.par ? ' · ' + m.par : '') })]);
      })),
      !(d.mises || []).length ? h('p.tx-note', 'Aucune mise à jour.') : null
    ]);
    z.appendChild(h('div.tx-grilles', [gauche, mises]));
  };
  VueTaux.prototype.apresEcriture = function (rep, message) {
    var self = this;
    AMX.toast(message || (rep && rep.message) || 'Enregistré.', 'ok');
    vider();
    return charger(true).then(function (d) { if (!self.detruit) { self.d = d; self.rendre(); } }).catch(function () {});
  };
  VueTaux.prototype.retirer = function (p) {
    var self = this, remettre = p.actif === false;
    (remettre ? Promise.resolve(true) : AMX.confirmer('Retirer ce programme ?', p.institution + ' — ' + p.programme + ' ne servira plus au comparateur. Il reste dans la liste, grisé : vous pourrez le remettre.', { ok: 'Retirer', danger: true }))
      .then(function (oui) {
        if (!oui) return;
        return poster({ action: 'tauxProgrammeRetirer', id: p.id, remettre: remettre }).then(function (r) { return self.apresEcriture(r); });
      }).catch(function (e) { AMX.toast(texteErreur(e), 'erreur'); });
  };
  VueTaux.prototype.joindrePdf = function (p) {
    var self = this;
    choisirPdf().then(function (f) {
      if (!f) return;
      if (f.size > 12 * 1024 * 1024) { AMX.toast('Le PDF dépasse 12 Mo.', 'erreur'); return; }
      AMX.toast('Envoi de la grille…', 'info', 3000);
      return lireFichier(f).then(function (b64) { return poster({ action: 'tauxGrillePdf', id: p.id, nom: f.name, base64: b64 }, { secours: false, rejouer: false, delai: 120000 }); })
        .then(function (r) { return self.apresEcriture(r); });
    }).catch(function (e) { AMX.toast('Grille non jointe — ' + texteErreur(e), 'erreur'); });
  };

  /* Le formulaire d'un programme (ajout, modification, proposition d'Einstein à vérifier). */
  VueTaux.prototype.formulaire = function (p, opts) {
    var self = this; opts = opts || {};
    var neuf = !p || !p.id, src = p || {};
    var inst = saisie('text', src.institution || '', { id: 'txf-institution', list: 'txf-institutions', maxlength: '60' });
    var connues = {}; INSTITUTIONS.forEach(function (n) { connues[n] = 1; }); ((this.d && this.d.programmes) || []).forEach(function (x) { connues[x.institution] = 1; });
    var nom = saisie('text', src.programme || '', { id: 'txf-programme', maxlength: '120' });
    var type = choix([['fixe', 'Fixe'], ['variable', 'Variable']], src.typeTaux || 'fixe', { id: 'txf-type' });
    var etat = choix([['tous', 'Neufs et occasions'], ['neuf', 'Neufs seulement'], ['occasion', 'Occasions seulement']], src.etat || 'tous', { id: 'txf-etat' });
    var client = choix([['tous', 'Tous les clients'], ['particulier', 'Particuliers seulement'], ['entreprise', 'Entreprises seulement']], src.client || 'tous', { id: 'txf-client' });
    var aMin = saisie('text', nb(src.anneeMin) ? src.anneeMin : '', { inputmode: 'numeric', maxlength: '4', id: 'txf-annee-min' }), aMax = saisie('text', nb(src.anneeMax) ? src.anneeMax : '', { inputmode: 'numeric', maxlength: '4', id: 'txf-annee-max' });
    var mMin = saisie('text', nb(src.montantMin) ? src.montantMin : '', { inputmode: 'decimal' }), mMax = saisie('text', nb(src.montantMax) ? src.montantMax : '', { inputmode: 'decimal' });
    var tMax = saisie('text', nb(src.termeMax) ? src.termeMax : '', { inputmode: 'numeric', maxlength: '3', id: 'txf-terme-max' });
    var termes = saisie('text', Object.keys(src.termes || {}).sort().map(function (a) { return a + ': ' + src.termes[a]; }).join(', '), { placeholder: 'ex. 2019: 72, 2020: 84' });
    var debut = saisie('date', src.debut || ''), fin = saisie('date', src.fin || '');
    var exige = saisie('text', src.exige || '', { maxlength: '80', placeholder: 'ex. membre Desjardins, employé RBC' });
    var majoration = saisie('text', src.majoration || '', { maxlength: '300', placeholder: 'ex. + 0,50 % au-delà de 84 mois' });
    var conditions = h('textarea.saisie', { rows: '3', maxlength: '1500' }); conditions.value = src.conditions || '';
    var b = src.boni || {};
    var bMontant = saisie('text', nb(b.montant) ? b.montant : '', { inputmode: 'decimal', id: 'txf-boni' }), bAMin = saisie('text', nb(b.anneeMin) ? b.anneeMin : '', { inputmode: 'numeric', maxlength: '4' }), bAMax = saisie('text', nb(b.anneeMax) ? b.anneeMax : '', { inputmode: 'numeric', maxlength: '4' });
    var bPrix = saisie('text', nb(b.prixMin) ? b.prixMin : '', { inputmode: 'decimal' }), bNote = saisie('text', b.note || '', { maxlength: '300' });
    var cies = Object.keys(AMX.COMPAGNIES || {}), casesCie = cies.map(function (c) {
      var cb = h('input', { type: 'checkbox', value: c }); cb.checked = (src.concessions || []).indexOf(c) >= 0;
      return h('label.tx-case', [cb, h('span', { text: AMX.COMPAGNIES[c] || c })]);
    });
    /* les paliers */
    var zonePaliers = h('div.tx-paliers-form');
    function ligneTranche(t) {
      t = t || {};
      var de = saisie('text', nb(t.de) ? t.de : '', { inputmode: 'decimal', placeholder: '0', 'aria-label': 'Montant financé à partir de' }), a = saisie('text', nb(t.a) ? t.a : '', { inputmode: 'decimal', placeholder: 'et plus', 'aria-label': 'Jusqu\'à' });
      var tp = saisie('text', nb(t.pct) ? String(t.pct).replace('.', ',') : '', { inputmode: 'decimal', placeholder: '%', 'aria-label': 'Ristourne en %' }), tf = saisie('text', nb(t.fixe) ? t.fixe : '', { inputmode: 'decimal', placeholder: '$', 'aria-label': 'Ristourne en $' });
      var el = h('div.tx-tranche', [h('span', 'de'), de, h('span', 'à'), a, h('span', '→'), tp, h('span', '%  ou'), tf, h('span', '$'),
        h('button.btn.petit.fantome', { type: 'button', text: 'Retirer', onclick: function () { el.remove(); } })]);
      el._lire = function () { return { de: num(de.value) || 0, a: num(a.value), pct: num(tp.value), fixe: num(tf.value) }; };
      return el;
    }
    function blocPalier(x) {
      x = x || {};
      var taux = saisie('text', nb(x.taux) ? String(x.taux).replace('.', ',') : '', { inputmode: 'decimal', placeholder: '7,49', 'aria-label': 'Taux en %' });
      var tm1 = saisie('text', nb(x.termeMin) ? x.termeMin : '', { inputmode: 'numeric', maxlength: '3', placeholder: 'tous', 'aria-label': 'Terme minimal en mois' }), tm2 = saisie('text', nb(x.termeMax) ? x.termeMax : '', { inputmode: 'numeric', maxlength: '3', placeholder: 'tous', 'aria-label': 'Terme maximal en mois' });
      var rp = saisie('text', nb(x.pct) ? String(x.pct).replace('.', ',') : '', { inputmode: 'decimal', placeholder: '0,9', 'aria-label': 'Ristourne en % du montant financé' }), rf = saisie('text', nb(x.fixe) ? x.fixe : '', { inputmode: 'decimal', placeholder: '0', 'aria-label': 'Ristourne fixe en $' });
      var zt = h('div.tx-tranches');
      (x.tranches || []).forEach(function (t) { zt.appendChild(ligneTranche(t)); });
      var el = h('div.tx-palier', [
        h('div.tx-palier-rang', [
          h('label', [h('span', 'Taux (%)'), taux]), h('label', [h('span', 'Terme de'), tm1]), h('label', [h('span', 'à (mois)'), tm2]),
          h('label', [h('span', 'Ristourne (%)'), rp]), h('label', [h('span', 'ou fixe ($)'), rf]),
          h('button.btn.petit.fantome', { type: 'button', text: 'Retirer le palier', onclick: function () { el.remove(); } })
        ]),
        zt,
        h('button.tx-lien', { type: 'button', text: '+ Ristourne par tranche de montant financé', onclick: function () { zt.appendChild(ligneTranche()); } })
      ]);
      el._lire = function () {
        var tr = Array.prototype.map.call(zt.children, function (c) { return c._lire(); }).filter(function (t) { return nb(t.pct) || nb(t.fixe); });
        return { taux: num(taux.value), termeMin: num(tm1.value), termeMax: num(tm2.value), pct: num(rp.value), fixe: num(rf.value), tranches: tr };
      };
      return el;
    }
    (src.paliers && src.paliers.length ? src.paliers : [{}]).forEach(function (x) { zonePaliers.appendChild(blocPalier(x)); });
    var erreur = h('div.alerte-bloc.erreur', { hidden: true, role: 'alert' });
    var corps = h('div.tx-formulaire', [
      opts.einstein ? h('div.alerte-bloc.attention', 'Proposition d\'Einstein AI : vérifiez chaque chiffre avec la grille de la banque avant d\'enregistrer.') : null,
      h('datalist#txf-institutions', Object.keys(connues).sort().map(function (n) { return h('option', { value: n }); })),
      h('div.tx-grille2', [champ('Institution', inst), champ('Nom du programme', nom)]),
      h('div.tx-grille4', [champ('Type de taux', type), champ('Véhicules', etat), champ('Clients', client), champ('Terme maximal (mois)', tMax)]),
      h('div.tx-grille4', [champ('Année minimale', aMin), champ('Année maximale', aMax), champ('Montant minimal ($)', mMin), champ('Montant maximal ($)', mMax)]),
      h('h3', 'Paliers de taux'),
      h('p.tx-note', 'Un palier = un taux offert au client et la ristourne versée à la concession à ce taux : un % du montant financé, un montant fixe, ou par tranche de montant.'),
      zonePaliers,
      h('button.btn.petit', { type: 'button', text: '+ Ajouter un palier', onclick: function () { zonePaliers.appendChild(blocPalier()); } }),
      h('h3', 'Boni'),
      h('div.tx-grille4', [champ('Montant ($)', bMontant), champ('Année minimale', bAMin), champ('Année maximale', bAMax), champ('Montant financé minimal ($)', bPrix)]),
      champ('Conditions du boni', bNote),
      h('h3', 'Conditions'),
      h('div.tx-grille2', [champ('Réservé à', exige), champ('Majoration', majoration)]),
      h('div.tx-grille2', [champ('En vigueur du', debut), champ('au', fin, 'Vide = sans date de fin.')]),
      champ('Terme maximal par année-modèle', termes, 'Seulement s\'il change selon l\'année. Sinon, le terme maximal du haut suffit.'),
      champ('Conditions du programme', conditions),
      cies.length > 1 ? h('div.champ', [h('label', 'Concessions'), h('div.tx-cases', casesCie), h('span.aide', 'Aucune case cochée = toutes les concessions.')]) : null,
      erreur
    ]);
    function lire() {
      var tm = {}; termes.value.split(/[,;]+/).forEach(function (x) { var m = /(\d{4})\s*[:=]\s*(\d{1,3})/.exec(x); if (m) tm[m[1]] = Number(m[2]); });
      var concessions = []; casesCie.forEach(function (l) { var cb = l.querySelector('input'); if (cb.checked) concessions.push(cb.value); });
      return {
        id: src.id || '', institution: inst.value.trim(), programme: nom.value.trim(), typeTaux: type.value, etat: etat.value, client: client.value,
        anneeMin: num(aMin.value), anneeMax: num(aMax.value), montantMin: num(mMin.value), montantMax: num(mMax.value), termeMax: num(tMax.value), termes: tm,
        paliers: Array.prototype.map.call(zonePaliers.children, function (c) { return c._lire(); }).filter(function (x) { return nb(x.taux); }),
        boni: { montant: num(bMontant.value), anneeMin: num(bAMin.value), anneeMax: num(bAMax.value), prixMin: num(bPrix.value), note: bNote.value.trim() },
        majoration: majoration.value.trim(), conditions: conditions.value.trim(), exige: exige.value.trim(), concessions: concessions, debut: debut.value, fin: fin.value,
        source: opts.einstein ? 'einstein' : (src.source || 'main'), actif: src.actif === false ? false : true
      };
    }
    function dire(m) { erreur.textContent = m; erreur.hidden = !m; if (m) erreur.scrollIntoView({ block: 'nearest' }); }
    AMX.modale({
      titre: neuf ? (opts.einstein ? 'Vérifier le programme proposé' : 'Ajouter un programme') : 'Modifier le programme', corps: corps, large: true, classe: 'tx-voile',
      boutons: [{ texte: 'Annuler' }, { texte: 'Enregistrer le programme', classe: 'primaire', action: function (fermer) {
        var o = lire();
        if (o.institution.length < 2) { dire('Inscrivez l\'institution.'); inst.focus(); return false; }
        if (o.programme.length < 2) { dire('Inscrivez le nom du programme.'); nom.focus(); return false; }
        if (!o.paliers.length) { dire('Inscrivez au moins un palier : un taux.'); return false; }
        if (o.paliers.some(function (x) { return x.taux < 0 || x.taux > 35; })) { dire('Un taux doit être entre 0 et 35 %.'); return false; }
        dire('');
        if (opts.enregistrer) return opts.enregistrer(o).then(function (r) { fermer(); if (opts.apres) opts.apres(r); return false; }).catch(function (e) { dire(texteErreur(e)); throw e; });
        return poster({ action: 'tauxProgramme', programme: o }).then(function (r) {
          fermer();
          if (opts.apres) opts.apres(r.programme);
          return self.apresEcriture(r).then(function () { return false; });
        }).catch(function (e) { dire(texteErreur(e)); throw e; });
      } }]
    });
  };
  /* Einstein AI lit le PDF d'une banque et propose des programmes : rien n'est enregistré sans une personne. */
  VueTaux.prototype.lireGrille = function () {
    var self = this;
    choisirPdf().then(function (f) {
      if (!f) return;
      if (f.size > 12 * 1024 * 1024) { AMX.toast('Le PDF dépasse 12 Mo.', 'erreur'); return; }
      var attente = h('div.tx-ia-attente', [AMX.chargeur('Einstein AI lit la grille', { compact: true }), h('p.tx-note', { text: f.name + ' — une minute au plus. Rien ne sera enregistré : vous vérifierez chaque programme.' })]);
      var corps = h('div.tx-ia', [attente]);
      var m = AMX.modale({ titre: 'Lire une grille avec Einstein AI', corps: corps, large: true, proteger: false, boutons: [{ texte: 'Fermer' }] });
      return lireFichier(f).then(function (b64) {
        return poster({ action: 'tauxLireGrille', nom: f.name, base64: b64 }, { secours: false, rejouer: false, delai: 150000 }).then(function (r) {
          AMX.vider(corps);
          corps.appendChild(h('p', { text: r.message || '' }));
          if ((r.aVerifier || []).length) corps.appendChild(h('div.alerte-bloc.attention', [h('strong', 'À vérifier : '), h('ul', r.aVerifier.map(function (t) { return h('li', { text: t }); }))]));
          var joindre = h('input', { type: 'checkbox' }); joindre.checked = true;
          if ((r.propositions || []).length) corps.appendChild(h('label.tx-case', [joindre, h('span', 'Joindre ce PDF à chaque programme enregistré')]));
          (r.propositions || []).forEach(function (p) {
            var etat = h('span.tx-etat'), btn = h('button.btn.primaire.petit', { type: 'button', text: 'Vérifier et enregistrer' });
            btn.addEventListener('click', function () {
              self.formulaire(p, { einstein: true, apres: function (enr) {
                etat.textContent = 'Enregistré (' + enr.id + ')'; btn.disabled = true; btn.textContent = 'Enregistré';
                if (joindre.checked && enr && enr.id) poster({ action: 'tauxGrillePdf', id: enr.id, nom: f.name, base64: b64 }, { secours: false, rejouer: false, delai: 120000 }).then(function () { vider(); }).catch(function (e) { AMX.toast('PDF non joint — ' + texteErreur(e), 'attention'); });
              } });
            });
            corps.appendChild(h('div.tx-prop', [
              h('div.tx-prog-txt', [h('strong', { text: p.institution + ' — ' + p.programme }), h('span.tx-prog-sous', { text: resumeProgramme(p) }),
                h('span.tx-prog-sous', { text: (p.paliers || []).map(function (x) { return pct(x.taux) + ' → ' + resumeRistourne(x); }).join('  |  ') }),
                p.boni ? h('span.tx-prog-sous', { text: boniDe(p, {}).texte }) : null, etat]),
              btn
            ]));
          });
        });
      }).catch(function (e) {
        AMX.vider(corps); corps.appendChild(h('div.alerte-bloc.erreur', { text: 'La grille n\'a pas été lue — ' + texteErreur(e) }));
        corps.appendChild(h('p.tx-note', 'Vous pouvez inscrire le programme à la main : « Ajouter un programme ».'));
      }).then(function () { return m; });
    });
  };

  /* ------------------------------ Grilles reçues (courriel, Torque) ------------------------------ */
  var ETATS_PROP = {
    nouveau: ['Nouveau programme', 'tx-p-nouveau'], change: ['Changé', 'tx-p-change'], pareil: ['Pareil à vos grilles', 'tx-p-pareil'],
    confirme: ['Enregistré', 'tx-p-fait'], enregistre: ['Enregistré', 'tx-p-fait'], planifie: ['Prévu', 'tx-p-prevu'], ignore: ['Ignoré', 'tx-p-ignore'],
    echu: ['Plus applicable', 'tx-p-ignore'], remplace: ['Remplacé', 'tx-p-ignore'], doublon: ['En double', 'tx-p-ignore'], ecarte: ['Écarté', 'tx-p-ignore']
  };
  /* Le bloc en haut de la page : l'adresse, ce qui attend, la lecture en cours. */
  VueTaux.prototype.rendreBandeRecues = function () {
    var self = this, r = this.d && this.d.recues;
    if (!r) return;                                         // script d'avant : rien
    var n = r.aConfirmer || 0, aLire = r.aLire || 0;
    if (this.vue === 'comparateur' && !n && !aLire && !LECTURE.en) return;
    var el = h('section.carte.tx-recues' + (n ? '.attention' : ''));
    this.elRecues = el;
    this.majRecues = function () { if (self.elRecues === el) self.remplirBande(el); };
    this.remplirBande(el);
    this.corps.appendChild(el);
  };
  VueTaux.prototype.remplirBande = function (el) {
    var self = this, r = (this.d && this.d.recues) || {}, d = this.d || {}, n = r.aConfirmer || 0, aLire = r.aLire || 0;
    AMX.vider(el);
    var m = r.ecartes || 0, peutTout = !!(r.accepterTout && d.peutModifier);
    var titre = n ? n + ' programme' + (n > 1 ? 's' : '') + ' reçu' + (n > 1 ? 's' : '') + ', à accepter' : (aLire ? aLire + ' grille' + (aLire > 1 ? 's' : '') + ' reçue' + (aLire > 1 ? 's' : '') + ', à lire par Einstein AI' : 'Grilles reçues');
    var etat = ACCEPTER.en ? 'Les programmes entrent dans vos grilles… ' + ACCEPTER.faits + ' accepté' + (ACCEPTER.faits > 1 ? 's' : '') + '.' :
      (LECTURE.en ? 'Einstein AI lit les grilles… ' + LECTURE.lus + ' lue' + (LECTURE.lus > 1 ? 's' : '') + (LECTURE.reste ? ', ' + LECTURE.reste + ' à lire' : '') + '.' :
      (n ? 'Lus par Einstein AI.' + (m ? ' ' + m + ' écarté' + (m > 1 ? 's' : '') + ' d\'office : plus applicables ou en double.' : '') : (aLire ? 'Cliquez « Lire les grilles » : Einstein AI lit chaque grille.' : 'Envoyez les grilles des banques à cette adresse : Einstein AI les lit.')));
    var adr = r.adresse || '';
    el.appendChild(h('div.tx-recues-txt', [
      h('strong', { text: titre }),
      h('span', { text: etat }),
      adr ? h('span.tx-recues-adr', [h('span', 'Adresse des grilles : '), h('code', { text: adr }),
        h('button.tx-lien', { type: 'button', text: 'Copier', onclick: function () { AMX.copier(adr, 'Adresse copiée.'); } })]) : null
    ]));
    var g = h('div.tx-recues-gestes');
    if (LECTURE.en) g.appendChild(h('button.btn.petit', { type: 'button', text: 'Arrêter la lecture', onclick: function () { LECTURE.arret = true; AMX.toast('La lecture s\'arrête après la grille en cours.', 'info'); } }));
    else if (aLire && d.peutModifier) g.appendChild(h('button.btn' + (n ? '' : '.primaire'), { type: 'button', text: 'Lire les grilles (' + aLire + ')', onclick: function () { lireTout(); } }));
    if (n && peutTout && !ACCEPTER.en) g.appendChild(h('button.btn.primaire', { type: 'button', text: 'Tout accepter (' + n + ')', onclick: function () { accepterTout(n, m).then(function (r) { if (r) self.charger(false); }); } }));
    g.appendChild(h('button.btn', { type: 'button', text: n ? 'Voir les programmes' : 'Grilles reçues', onclick: function () { self.ouvrirRecues(); } }));
    el.appendChild(g);
  };

  /* Ouvre un document reçu (PDF, image ou texte du courriel). */
  VueTaux.prototype.ouvrirDocRecu = function (x) {
    var w = null; try { w = window.open('', '_blank'); } catch (e) {}
    AMX.get({ grilleRecueDoc: 1, id: x.id }, { delai: 60000 }).then(function (d) {
      AMX.verifier(d, 'Document illisible');
      if (!d.base64) throw new Error('Document introuvable.');
      var bin = atob(d.base64), o = new Uint8Array(bin.length); for (var k = 0; k < bin.length; k++) o[k] = bin.charCodeAt(k);
      var type = d.mime || 'application/pdf'; if (/^text\//.test(type)) type = 'text/plain;charset=utf-8';
      var url = URL.createObjectURL(new Blob([o], { type: type }));
      if (w && !w.closed) w.location = url; else { var a = h('a', { href: url, download: d.nom || 'grille' }); document.body.appendChild(a); a.click(); a.remove(); }
      setTimeout(function () { URL.revokeObjectURL(url); }, 120000);
    }).catch(function (e) { if (w && !w.closed) w.close(); AMX.toast('Document non ouvert — ' + texteErreur(e), 'erreur'); });
  };

  /* La fenêtre des grilles reçues : chaque document, ce qu'Einstein AI en a lu, et ce qui change dans vos grilles. */
  VueTaux.prototype.ouvrirRecues = function () {
    var self = this;
    var filtre = 'atraiter';
    var corps = h('div.tx-recues-fen', [AMX.chargeur('Lecture des grilles reçues', { compact: true })]);
    var m = AMX.modale({ titre: 'Grilles de taux reçues', corps: corps, large: true, classe: 'tx-voile', proteger: false, sansFocus: true,
      boutons: [{ texte: 'Fermer' }], onFermer: function () { document.removeEventListener('amx:grillesRecues', surLecture); ouvert = false; } });
    var ouvert = true, dernier = null;
    function surLecture() { if (ouvert) relire(true); }
    document.addEventListener('amx:grillesRecues', surLecture);
    function relire(force) {
      return chargerRecues(force).then(function (d) { if (!ouvert) return; dernier = d; dessiner(d); }).catch(function (e) {
        if (!ouvert) return;
        AMX.vider(corps); corps.appendChild(h('div.alerte-bloc.erreur', { text: 'Les grilles reçues n\'ont pas pu être lues — ' + texteErreur(e) }));
      });
    }
    function apres(r, message) {
      AMX.toast(message || (r && r.message) || 'Fait.', 'ok');
      recues.quand = 0; vider();
      self.charger(false);
      return relire(true);
    }
    function agir(corpsReq, btn) {
      if (btn) { btn.disabled = true; btn.classList.add('occupe'); }
      return posterRecues(corpsReq).then(function (r) { return apres(r); }).catch(function (e) {
        if (btn) { btn.disabled = false; btn.classList.remove('occupe'); }
        AMX.toast(texteErreur(e), 'erreur');
      });
    }
    function verifier(x, p) {
      var prog = JSON.parse(JSON.stringify(p.prog || {}));
      var cible = p.cible && ((self.d && self.d.programmes) || []).filter(function (q) { return q.id === p.cible.id; })[0];
      prog.id = cible ? cible.id : '';
      if (cible) {
        if (!(prog.concessions || []).length && (cible.concessions || []).length) prog.concessions = cible.concessions;
        if (!prog.exige && cible.exige) prog.exige = cible.exige;
        if (!prog.conditions && cible.conditions) prog.conditions = cible.conditions;
        if (cible.actif === false) prog.actif = false;
      }
      self.formulaire(prog, { einstein: true,
        enregistrer: function (o) { return posterRecues({ action: 'grilleRecueAction', id: x.id, i: p.i, op: 'confirmer', programmeId: cible ? cible.id : '', prog: o }); },
        apres: function (r) { apres(r); } });
    }
    function dessiner(d) {
      AMX.vider(corps);
      var peut = !!d.peutAgir, liste = d.recues || [];
      var aLire = d.aLire || 0, adr = (d.reglages && d.reglages.adresses && d.reglages.adresses[0]) || '';
      /* haut : adresse, lecture, relève */
      var haut = h('div.tx-recues-haut', [
        h('div.tx-recues-txt', [
          adr ? h('span.tx-recues-adr', [h('span', 'Les banques envoient leurs grilles à : '), h('code', { text: adr }),
            h('button.tx-lien', { type: 'button', text: 'Copier', onclick: function () { AMX.copier(adr, 'Adresse copiée.'); } })]) : null,
          h('span', { text: LECTURE.en ? 'Einstein AI lit les grilles… ' + LECTURE.lus + ' lue' + (LECTURE.lus > 1 ? 's' : '') + (LECTURE.reste ? ', ' + LECTURE.reste + ' à lire' : '') + '.' :
            (d.etat && d.etat.le ? 'Courriels relevés le ' + jour(d.etat.le) + ' à ' + String(new Date(d.etat.le).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })) + '.' : 'Les courriels sont relevés aux 30 minutes, de 6 h à 22 h.') })
        ]),
        h('div.tx-recues-gestes', [
          LECTURE.en ? h('button.btn.petit', { type: 'button', text: 'Arrêter la lecture', onclick: function () { LECTURE.arret = true; AMX.toast('La lecture s\'arrête après la grille en cours.', 'info'); } }) :
            (aLire && peut ? h('button.btn.primaire', { type: 'button', text: 'Lire les grilles (' + aLire + ')', onclick: function () { if (!d.ia) { AMX.toast('Einstein AI n\'a pas de clé : Admin › Einstein AI.', 'erreur'); return; } lireTout(); } }) : null),
          peut && d.aConfirmer && !ACCEPTER.en ? h('button.btn.primaire', { type: 'button', text: 'Tout accepter (' + d.aConfirmer + ')', onclick: function () {
            accepterTout(d.aConfirmer, d.ecartes || 0).then(function (r) { if (r) { self.charger(false); relire(true); } });
          } }) : (ACCEPTER.en ? h('span.tx-note', { text: 'Acceptation en cours… ' + ACCEPTER.faits + ' accepté' + (ACCEPTER.faits > 1 ? 's' : '') }) : null),
          peut ? h('button.btn', { type: 'button', text: 'Relever les courriels', onclick: function (e) {
            var b = e.currentTarget; b.disabled = true; b.classList.add('occupe');
            posterRecues({ action: 'grillesRecuesCourriels' }).then(function (r) { b.disabled = false; b.classList.remove('occupe'); return apres(r); })
              .catch(function (err) { b.disabled = false; b.classList.remove('occupe'); AMX.toast(texteErreur(err), 'erreur'); });
          } }) : null
        ])
      ]);
      corps.appendChild(haut);
      corps.appendChild(h('details.tx-recues-comment', [
        h('summary', 'Comment recevoir les grilles toutes seules'),
        h('ol', [
          h('li', 'Demandez à chaque représentant de banque d\'ajouter cette adresse à l\'envoi de ses grilles (ou de vous mettre en copie).'),
          h('li', 'Ou, dans votre boîte courriel, une règle qui fait suivre à cette adresse les courriels des banques qui contiennent une grille.'),
          h('li', 'Le PDF, une photo de la grille ou le texte du courriel : tout se lit. Einstein AI propose ; « Tout accepter » les met dans vos grilles.')
        ]),
        adr ? h('p.tx-note', [h('span', 'Texte à envoyer aux banques : '),
          h('button.tx-lien', { type: 'button', text: 'Copier le texte', onclick: function () {
            AMX.copier('Bonjour, pourriez-vous ajouter l\'adresse ' + adr + ' à l\'envoi de vos grilles de taux et de vos changements de programmes ? Merci.', 'Texte copié.');
          } })]) : null
      ]));
      /* filtre */
      var sel = h('select.saisie.tx-recues-filtre', { 'aria-label': 'Montrer' }, [h('option', { value: 'atraiter', text: 'À traiter' }), h('option', { value: 'tout', text: 'Tout (120 derniers jours)' })]);
      sel.value = filtre; sel.addEventListener('change', function () { filtre = sel.value; dessiner(dernier); });
      var visibles = liste.filter(function (x) { return filtre === 'tout' || x.statut === 'a_confirmer' || x.statut === 'a_lire' || x.statut === 'erreur'; });
      corps.appendChild(h('div.tx-recues-barre', [h('strong', { text: visibles.length + ' document' + (visibles.length > 1 ? 's' : '') }), sel]));
      if (!visibles.length) {
        corps.appendChild(h('p.tx-note', { text: liste.length ? 'Rien à traiter : toutes les grilles reçues sont réglées.' : 'Aucune grille reçue pour le moment.' }));
        return;
      }
      visibles.forEach(function (x) { corps.appendChild(carteDoc(x, peut)); });
    }
    function carteDoc(x, peut) {
      var nomInst = x.institution || x.indInstitution || (x.lecture && x.lecture.institution) || 'Institution à confirmer';
      var sous = [x.sourceLibelle, x.indProgramme || '', 'reçu le ' + jour(x.recuLe), x.source === 'courriel' && x.de ? 'de ' + x.de : ''].filter(Boolean).join(' · ');
      var ton = x.statut === 'a_confirmer' ? 'attention' : (x.statut === 'erreur' ? 'erreur' : (x.statut === 'a_lire' ? 'info' : ''));
      var gestes = h('div.tx-recues-gestes', [
        x.aDocument ? h('button.btn.petit', { type: 'button', text: 'Voir la grille', onclick: function () { self.ouvrirDocRecu(x); } }) : null,
        peut && x.aConfirmer > 1 ? h('button.btn.petit', { type: 'button', text: 'Accepter les ' + x.aConfirmer, onclick: function (e) {
          var b = e.currentTarget;
          AMX.confirmer('Accepter les ' + x.aConfirmer + ' programmes de cette grille ?', 'Ils entrent dans vos grilles tels qu\'Einstein AI les a lus.', { ok: 'Accepter' })
            .then(function (oui) { if (oui) agir({ action: 'grilleRecueAction', id: x.id, op: 'confirmerTout' }, b); });
        } }) : null,
        peut && (x.statut === 'erreur' || x.statut === 'pas_grille' || (x.statut === 'a_confirmer' && !x.propositions.some(function (p) { return p.etat === 'confirme' || p.etat === 'enregistre'; }))) ?
          h('button.btn.petit', { type: 'button', text: 'Relire', title: 'Einstein AI relit ce document', onclick: function (e) {
            var b = e.currentTarget; b.disabled = true; b.classList.add('occupe');
            AMX.post({ action: 'grilleRecueAction', id: x.id, op: 'relire' }, { secours: false, rejouer: false, delai: 330000 }).then(function (r) {
              if (r && r.enCours) throw new Error('Une lecture est déjà en cours : réessayez dans une minute.');
              AMX.verifier(r, 'Lecture refusée'); return apres(r, 'Grille relue.');
            }).catch(function (err) { b.disabled = false; b.classList.remove('occupe'); AMX.toast(texteErreur(err), 'erreur'); });
          } }) : null,
        peut && x.statut !== 'ignore' && x.statut !== 'traite' ? h('button.btn.petit.fantome', { type: 'button', text: 'Ignorer la grille', onclick: function (e) {
          var b = e.currentTarget;
          AMX.confirmer('Ignorer cette grille ?', 'Rien ne sera enregistré dans vos grilles. Le document reste dans « Tout ».', { ok: 'Ignorer' })
            .then(function (oui) { if (oui) agir({ action: 'grilleRecueAction', id: x.id, op: 'ignorerTout' }, b); });
        } }) : null
      ]);
      var l = x.lecture || {};
      var el = h('section.tx-recu' + (ton ? '.' + ton : ''), [
        h('div.tx-recu-tete', [
          h('div.tx-prog-txt', [h('strong', { text: nomInst + (x.fichier ? ' — ' + x.fichier : '') }), h('span.tx-prog-sous', { text: sous }),
            h('span.tx-etat' + (x.statut === 'erreur' ? '.tx-neg' : ''), { text: x.statutLibelle + (x.raison && x.statut !== 'a_confirmer' ? ' — ' + x.raison : '') })]),
          gestes
        ]),
        l.resume ? h('p.tx-note', { text: l.resume }) : null,
        (l.aVerifier || []).length ? h('div.alerte-bloc.attention', [h('strong', 'À vérifier : '), h('ul', l.aVerifier.map(function (t) { return h('li', { text: t }); }))]) : null,
        (function () {
          var garde = x.propositions.filter(function (p) { return !p.exclu; }), exclus = x.propositions.filter(function (p) { return p.exclu; });
          return h('div', [
            garde.length ? h('ul.tx-recu-props', garde.map(function (p) { return ligneProp(x, p, peut); })) : null,
            exclus.length ? h('details.tx-recu-ecartes', [h('summary', { text: exclus.length + ' écarté' + (exclus.length > 1 ? 's' : '') + ' d\'office (plus applicable' + (exclus.length > 1 ? 's' : '') + ' ou en double)' }),
              h('ul.tx-recu-props', exclus.map(function (p) { return ligneProp(x, p, peut); }))]) : null
          ]);
        })()
      ]);
      return el;
    }
    function ligneProp(x, p, peut) {
      var e = ETATS_PROP[p.etat] || [p.etat, ''];
      var prog = p.prog || {};
      var paliers = (prog.paliers || []).map(function (q) { return pct(q.taux) + (nb(q.termeMin) || nb(q.termeMax) ? ' (' + (nb(q.termeMin) ? q.termeMin : '…') + '-' + (nb(q.termeMax) ? q.termeMax : '…') + ' m.)' : '') + ' → ' + resumeRistourne(q); }).join('  |  ');
      var gestes = null;
      if (peut && p.exclu) {
        gestes = h('div.tx-recues-gestes', [h('button.btn.petit.fantome', { type: 'button', text: 'Accepter quand même', onclick: function (ev) {
          agir({ action: 'grilleRecueAction', id: x.id, i: p.i, op: 'confirmer' }, ev.currentTarget);
        } })]);
      } else if (peut && (p.etat === 'nouveau' || p.etat === 'change')) {
        gestes = h('div.tx-recues-gestes', [
          h('button.btn.petit', { type: 'button', text: 'Accepter', onclick: function (ev) {
            agir({ action: 'grilleRecueAction', id: x.id, i: p.i, op: 'confirmer' }, ev.currentTarget);
          } }),
          h('button.btn.petit', { type: 'button', text: 'Vérifier et modifier', onclick: function () { verifier(x, p); } }),
          h('button.btn.petit.fantome', { type: 'button', text: 'Ignorer', onclick: function (ev) { agir({ action: 'grilleRecueAction', id: x.id, i: p.i, op: 'ignorer' }, ev.currentTarget); } })
        ]);
      }
      return h('li', [
        h('div.tx-prog-txt', [
          h('span.tx-recu-nom', [h('strong', { text: (prog.programme || 'Programme') }), h('span.tx-p-etat.' + (e[1] || 'tx-p-pareil'), { text: p.etat === 'planifie' ? 'Prévu le ' + jour(p.appliquerLe) : e[0] })]),
          h('span.tx-prog-sous', { text: resumeProgramme(prog) }),
          paliers ? h('span.tx-prog-sous', { text: paliers }) : null,
          prog.boni && nb(prog.boni.montant) ? h('span.tx-prog-sous', { text: boniDe(prog, {}).texte }) : null,
          p.cible && p.etat === 'change' ? h('span.tx-prog-sous', { text: 'Remplace « ' + p.cible.programme + ' » (mis à jour le ' + (jour(p.cible.majLe) || '—') + ').' }) : null,
          p.changements && p.changements.length && p.etat === 'change' ? h('ul.tx-recu-ch', p.changements.map(function (t) { return h('li', { text: t }); })) : null,
          p.exclu && p.raison ? h('span.tx-prog-sous', { text: p.raison }) : null,
          p.etat === 'planifie' ? h('span.tx-prog-sous.tx-prevu', { text: 'Confirmé le ' + jour(p.faitLe) + (p.faitPar ? ' par ' + p.faitPar : '') + ' : remplacera « ' + ((p.cible && p.cible.programme) || prog.programme) + ' » le ' + jour(p.appliquerLe) + '. La grille actuelle reste en vigueur d\'ici là.' }) : null,
          (p.etat === 'confirme' || p.etat === 'enregistre' || p.etat === 'ignore') && p.faitLe ? h('span.tx-prog-sous', { text: e[0] + ' le ' + jour(p.faitLe) + (p.faitPar ? ' par ' + p.faitPar : '') + (p.modifie ? ', chiffres corrigés avant l\'enregistrement' : '') + '.' }) : null
        ]),
        gestes
      ]);
    }
    relire(false);
    return m;
  };

  /* ------------------------------ Amortissement ------------------------------ */
  VueTaux.prototype.lireAm = function () {
    var a = this.am, location = a.genre === 'location';
    return { date: a.date || aujIso(), montant: num(a.montant), terme: num(a.terme), taux: num(a.taux) || 0, modalite: a.modalite, location: location, residuel: location ? (num(a.residuel) || 0) : 0 };
  };
  VueTaux.prototype.rendreAmortissement = function () {
    var self = this, a = this.am;
    /* le comparateur a déjà une transaction : on la reprend une fois */
    if (a.montant === '' && num(this.t.montant)) { a.montant = this.t.montant; a.terme = this.t.terme || a.terme; a.taux = this.t.tauxVendu || ''; a.modalite = this.t.modalite || 'mois'; }
    var maj = AMX.debounce(function () { self.rendreTableauAm(); }, 200);
    function lie(el, cle, tout) { el.addEventListener(tout ? 'change' : 'input', function () { self.am[cle] = el.value; if (cle === 'genre') self.rendre(); else maj(); }); return el; }
    var location = a.genre === 'location';
    var form = h('form.carte.tx-form', { onsubmit: function (e) { e.preventDefault(); self.rendreTableauAm(); }, 'aria-label': 'Le financement' }, [
      h('div.carte-entete', [h('h2', 'Le financement')]),
      h('div.carte-corps', [
        champ('Prêt ou location', lie(choix([['pret', 'Prêt (achat)'], ['location', 'Location']], a.genre, { id: 'txa-genre' }), 'genre', true)),
        champ('Date de départ', lie(saisie('date', a.date, { id: 'txa-date' }), 'date', true)),
        champ(location ? 'Montant à financer (avant taxes)' : 'Montant financé', lie(saisie('text', a.montant, { inputmode: 'decimal', id: 'txa-montant', placeholder: '35 000' }), 'montant')),
        location ? champ('Valeur résiduelle ($)', lie(saisie('text', a.residuel, { inputmode: 'decimal', id: 'txa-residuel' }), 'residuel')) : null,
        champ('Terme (mois)', lie(saisie('text', a.terme, { inputmode: 'numeric', maxlength: '3', id: 'txa-terme' }), 'terme')),
        champ('Taux d\'intérêt (%)', lie(saisie('text', a.taux, { inputmode: 'decimal', id: 'txa-taux', placeholder: '7,49' }), 'taux')),
        champ('Versements', lie(choix(MODALITES, a.modalite, { id: 'txa-modalite' }), 'modalite', true)),
        location ? h('p.tx-note', 'Location : versement en début de période, avant taxes (les taxes s\'ajoutent à chaque versement). Le versement d\'un contrat réel peut différer de quelques dollars.') : null
      ])
    ]);
    this.elAm = h('div.tx-res');
    this.corps.appendChild(h('div.tx-deux', [form, this.elAm]));
    this.rendreTableauAm();
  };
  VueTaux.prototype.rendreTableauAm = function () {
    var z = this.elAm; if (!z) return;
    AMX.vider(z);
    var o = this.lireAm(), r = amortissement(o);
    this.btnImprimer.disabled = !r;
    if (!r) { z.appendChild(h('div.carte', [h('div.carte-corps.tx-attente', [h('p', o.location && nb(o.montant) && o.residuel >= o.montant ? 'La valeur résiduelle doit être plus basse que le montant à financer.' : 'Inscrivez le montant, le terme et le taux pour voir le tableau.')])])); return; }
    z.appendChild(h('div.tx-chiffres', [
      h('div.tx-chiffre', [h('span', 'Versement ' + modaliteLib(o.modalite, true)), h('strong', { text: argent(r.paiement) })]),
      h('div.tx-chiffre', [h('span', 'Versements'), h('strong', { text: String(r.versements) })]),
      h('div.tx-chiffre', [h('span', 'Intérêts'), h('strong', { text: argent(r.totalInterets) })]),
      h('div.tx-chiffre', [h('span', r.location ? 'Total versé (avant taxes)' : 'Total versé'), h('strong', { text: argent(r.totalVerse) })])
    ]));
    z.appendChild(h('div.carte.tx-defile', [this.tableAm(r)]));
  };
  VueTaux.prototype.tableAm = function (r) {
    var lignes = r.lignes.map(function (l) { return h('tr', [h('td.num', { text: String(l.n) }), h('td', { text: jour(l.date) }), h('td.num', { text: argent(l.versement) }), h('td.num', { text: argent(l.interet) }), h('td.num', { text: argent(l.capital) }), h('td.num', { text: argent(l.solde) })]); });
    if (r.fin) lignes.push(h('tr.tx-fin', [h('td'), h('td', { text: jour(r.fin.date) }), h('td', { text: 'Fin du terme' }), h('td.num', { text: argent(r.fin.interet) }), h('td'), h('td.num', [h('strong', { text: argent(r.fin.solde) })])]));
    return h('table.tableau.tx-table.tx-am', [
      h('thead', [h('tr', [h('th.num', 'No'), h('th', 'Date'), h('th.num', 'Versement'), h('th.num', 'Intérêt'), h('th.num', 'Capital'), h('th.num', 'Solde')])]),
      h('tbody', lignes)
    ]);
  };
  VueTaux.prototype.imprimerAmortissement = function () {
    var o = this.lireAm(), r = amortissement(o); if (!r) return;
    var ancienne = document.getElementById('taux-impression'); if (ancienne) ancienne.remove();
    var page = h('div#taux-impression', [
      h('h1', r.location ? 'Tableau d\'amortissement — location' : 'Tableau d\'amortissement — prêt'),
      h('p', { text: 'Montant ' + argent(o.montant) + (r.location ? ' · valeur résiduelle ' + argent(r.residuel) : '') + ' · ' + o.terme + ' mois · ' + pct(o.taux) + ' · versement ' + argent(r.paiement) + ' ' + modaliteLib(o.modalite, true) + ' · intérêts ' + argent(r.totalInterets) + ' · départ le ' + jour(o.date) }),
      this.tableAm(r),
      h('p.tx-note', 'Estimation. Le contrat de la banque fait foi.' + (r.location ? ' Location : montants avant taxes.' : ''))
    ]);
    document.body.appendChild(page);
    document.body.classList.add('impression-taux');
    var nettoyer = function () { document.body.classList.remove('impression-taux'); window.removeEventListener('afterprint', nettoyer); setTimeout(function () { if (page.parentNode) page.remove(); }, 500); };
    window.addEventListener('afterprint', nettoyer);
    setTimeout(function () { try { window.print(); } catch (e) { nettoyer(); } }, 80);
    setTimeout(function () { if (document.body.classList.contains('impression-taux')) nettoyer(); }, 60000);
  };

  /* ------------------------------ Garantie prolongée ------------------------------ */
  var GARANTIES = [['36|60000', '3 ans ou 60 000 km'], ['48|80000', '4 ans ou 80 000 km'], ['60|100000', '5 ans ou 100 000 km'], ['perso', 'Personnalisée']];
  VueTaux.prototype.lireGp = function () {
    var g = this.gp, age = 0;
    if (g.service) { var d = new Date(g.service + 'T12:00:00'), a = new Date(); if (isFinite(d.getTime())) age = Math.max(0, (a.getFullYear() - d.getFullYear()) * 12 + (a.getMonth() - d.getMonth()) + (a.getDate() - d.getDate()) / 30); }
    var m = g.manuf === 'perso' ? { mois: num(g.manufMois) || 0, km: num(g.manufKm) || 0 } : { mois: Number(String(g.manuf).split('|')[0]), km: Number(String(g.manuf).split('|')[1]) };
    return { ageMois: age, kmActuel: num(g.km) || 0, kmAn: num(g.kmAn) || 0, terme: num(g.terme) || 0, manuf: m, prot: { mois: num(g.protMois) || 0, km: num(g.protKm) || 0 } };
  };
  VueTaux.prototype.rendreGarantie = function () {
    var self = this, g = this.gp;
    var maj = AMX.debounce(function () { self.rendreGraphique(); }, 200);
    function lie(el, cle, tout) { el.addEventListener(tout ? 'change' : 'input', function () { self.gp[cle] = el.value; if (cle === 'manuf') self.rendre(); else maj(); }); return el; }
    var perso = g.manuf === 'perso';
    var form = h('form.carte.tx-form', { onsubmit: function (e) { e.preventDefault(); self.rendreGraphique(); }, 'aria-label': 'Le véhicule et son financement' }, [
      h('div.carte-entete', [h('h2', 'Le véhicule et son financement')]),
      h('div.carte-corps', [
        champ('Date de mise en service', lie(saisie('date', g.service, { id: 'txg-service' }), 'service', true), 'Vide = véhicule neuf, mis en service aujourd\'hui.'),
        champ('Kilométrage actuel', lie(saisie('text', g.km, { inputmode: 'numeric', id: 'txg-km', placeholder: '0' }), 'km')),
        champ('Kilométrage prévu par année', lie(saisie('text', g.kmAn, { inputmode: 'numeric', id: 'txg-kman' }), 'kmAn')),
        champ('Terme du financement (mois)', lie(saisie('text', g.terme, { inputmode: 'numeric', maxlength: '3', id: 'txg-terme' }), 'terme')),
        champ('Garantie du manufacturier', lie(choix(GARANTIES, g.manuf, { id: 'txg-manuf' }), 'manuf', true)),
        perso ? h('div.tx-grille2', [champ('Mois', lie(saisie('text', g.manufMois, { inputmode: 'numeric' }), 'manufMois')), champ('Kilomètres', lie(saisie('text', g.manufKm, { inputmode: 'numeric' }), 'manufKm'))]) : null,
        h('div.tx-grille2', [champ('Protection : mois', lie(saisie('text', g.protMois, { inputmode: 'numeric', id: 'txg-prot-mois' }), 'protMois')), champ('Protection : km', lie(saisie('text', g.protKm, { inputmode: 'numeric', id: 'txg-prot-km' }), 'protKm'))]),
        h('p.tx-note', 'Les durées et les kilomètres se comptent depuis la mise en service du véhicule.')
      ])
    ]);
    this.elGp = h('div.tx-res');
    this.corps.appendChild(h('div.tx-deux', [form, this.elGp]));
    this.rendreGraphique();
  };
  function moisTexte(m) { m = Math.round(m); if (m <= 0) return '0 mois'; var a = Math.floor(m / 12), r = m % 12; return (a ? a + ' an' + (a > 1 ? 's' : '') : '') + (a && r ? ' ' : '') + (r ? r + ' mois' : ''); }
  VueTaux.prototype.rendreGraphique = function () {
    var z = this.elGp; if (!z) return;
    AMX.vider(z);
    var o = this.lireGp();
    if (!(o.terme > 0) || !(o.kmAn > 0)) { z.appendChild(h('div.carte', [h('div.carte-corps.tx-attente', [h('p', 'Inscrivez le terme du financement et le kilométrage prévu par année.')])])); return; }
    var r = garantie(o);
    var phrases = [];
    if (r.manuf) phrases.push(r.manuf.expiree ? 'La garantie du manufacturier est déjà terminée.' : 'La garantie du manufacturier se termine dans ' + moisTexte(r.manuf.dansMois) + ' (' + (r.manuf.cause === 'km' ? 'par le kilométrage' : 'par la durée') + ').');
    phrases.push(r.sansGarantie > 0.5 ? 'Sans protection, le client paie son véhicule pendant ' + moisTexte(r.sansGarantie) + ' sans garantie.' : 'Le financement se termine avant la garantie du manufacturier.');
    if (r.prot) phrases.push(r.sansProtection > 0.5 ? 'Avec la protection : ' + moisTexte(r.gagne) + ' de plus sous garantie ; il reste ' + moisTexte(r.sansProtection) + ' de financement sans garantie.' : 'Avec la protection, le véhicule est garanti pendant tout le financement' + (r.gagne > 0.5 ? ' (' + moisTexte(r.gagne) + ' de plus).' : '.'));
    z.appendChild(h('div.tx-chiffres', [
      h('div.tx-chiffre', [h('span', 'Financement sans garantie'), h('strong' + (r.sansGarantie > 0.5 ? '.tx-neg' : ''), { text: moisTexte(r.sansGarantie) })]),
      h('div.tx-chiffre', [h('span', 'Avec la protection'), h('strong', { text: r.prot ? moisTexte(r.sansProtection) + ' sans garantie' : '—' })]),
      h('div.tx-chiffre', [h('span', 'Kilométrage à la fin du financement'), h('strong', { text: AMX.fmtNombre(Math.round(r.kmFin)) + ' km' })])
    ]));
    z.appendChild(h('div.carte', [h('div.carte-corps', [this.graphique(r), h('ul.tx-phrases', phrases.map(function (p) { return h('li', { text: p }); }))])]));
  };
  var NS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs, enfants) {
    var e = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]); });
    (enfants || []).forEach(function (c) { if (c === null || c === undefined) return; e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  VueTaux.prototype.graphique = function (r) {
    var L = 760, H = 380, mg = { g: 84, d: 18, h: 16, b: 44 }, pl = L - mg.g - mg.d, ph = H - mg.h - mg.b;
    var maxM = Math.max(r.finFinancement, r.manuf ? r.manuf.mois : 0, r.prot ? r.prot.mois : 0, 24), maxK = Math.max(r.kmFin, r.manuf ? r.manuf.km : 0, r.prot ? r.prot.km : 0, 20000);
    maxM = Math.ceil(maxM / 12) * 12; var pasK = maxK > 200000 ? 50000 : 20000; maxK = Math.ceil(maxK / pasK) * pasK;
    function x(m) { return mg.g + m / maxM * pl; } function y(k) { return mg.h + ph - k / maxK * ph; }
    var el = [];
    for (var m = 0; m <= maxM; m += 12) { el.push(svg('line', { x1: x(m), y1: mg.h, x2: x(m), y2: mg.h + ph, class: 'tx-g-grille' })); el.push(svg('text', { x: x(m), y: H - 24, class: 'tx-g-axe', 'text-anchor': 'middle' }, [String(m)])); }
    for (var k = 0; k <= maxK; k += pasK) { el.push(svg('line', { x1: mg.g, y1: y(k), x2: mg.g + pl, y2: y(k), class: 'tx-g-grille' })); el.push(svg('text', { x: mg.g - 8, y: y(k) + 4, class: 'tx-g-axe', 'text-anchor': 'end' }, [AMX.fmtNombre(k)])); }
    el.push(svg('text', { x: mg.g + pl / 2, y: H - 6, class: 'tx-g-titre', 'text-anchor': 'middle' }, ['Mois depuis la mise en service']));
    el.push(svg('text', { x: 14, y: mg.h + ph / 2, class: 'tx-g-titre', 'text-anchor': 'middle', transform: 'rotate(-90 14 ' + (mg.h + ph / 2) + ')' }, ['Kilométrage']));
    function rect(g, couleur, nom) {
      if (!g) return;
      el.push(svg('rect', { x: x(0), y: y(g.km), width: x(g.mois) - x(0), height: y(0) - y(g.km), fill: couleur, 'fill-opacity': 0.16, stroke: couleur, 'stroke-width': 2, rx: 4 }, [svg('title', {}, [nom + ' : ' + moisTexte(g.mois) + ' ou ' + AMX.fmtNombre(g.km) + ' km'])]));
      el.push(svg('text', { x: x(0) + 8, y: y(g.km) + 17, class: 'tx-g-nom' }, [nom]));
    }
    rect(r.prot, C_ORANGE, 'Protection');
    rect(r.manuf, C_BLEU, 'Garantie du manufacturier');
    /* le financement : la route du véhicule pendant le terme, et sa zone en pointillé */
    el.push(svg('rect', { x: x(r.age), y: y(r.kmFin), width: x(r.finFinancement) - x(r.age), height: y(r.km0) - y(r.kmFin), class: 'tx-g-fin' }, [svg('title', {}, ['Financement : ' + moisTexte(r.finFinancement - r.age) + ', jusqu\'à ' + AMX.fmtNombre(Math.round(r.kmFin)) + ' km'])]));
    el.push(svg('line', { x1: x(r.age), y1: y(r.km0), x2: x(r.finFinancement), y2: y(r.kmFin), class: 'tx-g-route' }));
    el.push(svg('circle', { cx: x(r.age), cy: y(r.km0), r: 5, class: 'tx-g-point' }, [svg('title', {}, ['Aujourd\'hui : ' + AMX.fmtNombre(Math.round(r.km0)) + ' km'])]));
    el.push(svg('circle', { cx: x(r.finFinancement), cy: y(r.kmFin), r: 5, class: 'tx-g-point' }, [svg('title', {}, ['Fin du financement : ' + AMX.fmtNombre(Math.round(r.kmFin)) + ' km'])]));
    el.push(svg('text', { x: x(r.finFinancement) - 6, y: y(r.kmFin) - 8, class: 'tx-g-nom', 'text-anchor': 'end' }, ['Fin du financement']));
    return h('figure.tx-figure', [
      svg('svg', { viewBox: '0 0 ' + L + ' ' + H, role: 'img', 'aria-label': 'Financement, garantie du manufacturier et protection selon les mois et le kilométrage', class: 'tx-g' }, el),
      h('figcaption.tx-legende', [
        h('span', [h('i', { style: { background: C_BLEU } }), 'Garantie du manufacturier']),
        h('span', [h('i', { style: { background: C_ORANGE } }), 'Protection (garantie prolongée)']),
        h('span', [h('i.tx-l-fin'), 'Financement : la route du véhicule'])
      ])
    ]);
  };

  /* =============================== Styles =============================== */
  function injecterCss() {
    if (typeof document === 'undefined' || document.getElementById('css-taux')) return;
    var s = document.createElement('style');
    s.id = 'css-taux';
    s.textContent = [
      '.tx-deux { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 16px; align-items: start; }',
      '.tx-form { position: sticky; top: calc(var(--barre-h) + 12px); }',
      '.tx-form .carte-corps { display: flex; flex-direction: column; gap: 11px; }',
      '.tx-form .champ label { font-size: 12px; }',
      '.tx-paiement { display: block; padding: 8px 10px; border-radius: 8px; background: var(--vert-clair); color: var(--vert-fonce); font-weight: 700; font-size: 13.5px; }',
      '.tx-paiement[hidden] { display: none; }',
      '.tx-reinit { align-self: flex-start; }',
      '.tx-res { min-width: 0; display: flex; flex-direction: column; gap: 12px; }',
      '.tx-res-tete { display: flex; flex-wrap: wrap; gap: 4px 14px; align-items: baseline; }',
      '.tx-combs .carte-entete { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline; } .tx-combs .carte-entete h2 { margin: 0; }',
      '.tx-comb-liste { list-style: none; margin: 0; padding: 0 16px 8px; } .tx-comb { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 16px; padding: 10px 0; border-top: 1px solid var(--ligne); } .tx-comb:first-child { border-top: 0; }',
      '.tx-comb-qui { display: flex; flex-wrap: wrap; gap: 2px 10px; align-items: baseline; min-width: 0; } .tx-comb-chiffres { display: flex; gap: 14px; align-items: baseline; justify-content: flex-end; font-variant-numeric: tabular-nums; white-space: nowrap; }',
      '.tx-comb-taux { font-weight: 700; font-size: 16px; } .tx-comb-rap strong { color: var(--vert-fonce); font-size: 15px; } .tx-comb-rap small { color: var(--encre-3); font-size: 12px; }',
      '.tx-comb-ecart { grid-column: 1 / -1; font-size: 13px; color: var(--encre-3); }',
      '.tx-comb-tag { font-size: 12px; font-weight: 600; padding: 1px 8px; border-radius: 999px; background: var(--carte-2); color: var(--encre-2); } .tx-comb-tag.client { background: #E8F0FE; color: #1A64BF; } .tx-comb-tag.concession { background: var(--vert-clair); color: var(--vert-fonce); }',
      '@media (max-width: 640px) { .tx-comb { grid-template-columns: 1fr; } .tx-comb-chiffres { justify-content: flex-start; flex-wrap: wrap; } }',
      '.tx-res-tete strong { font-size: 15px; } .tx-res-tete span { color: var(--encre-3); font-size: 13px; }',
      '.tx-defile { overflow-x: auto; }',
      '.tx-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }',
      '.tx-table th, .tx-table td { padding: 8px 10px; border-bottom: 1px solid var(--ligne); text-align: left; vertical-align: top; }',
      '.tx-table thead th { font-size: 12px; font-weight: 700; color: var(--encre-3); background: var(--carte-2); white-space: nowrap; position: sticky; top: 0; }',
      '.tx-table .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }',
      '.tx-table tbody + tbody tr:first-child > * { border-top: 2px solid var(--ligne-forte); }',
      '.tx-table th.tx-prog { font-weight: 400; min-width: 210px; max-width: 300px; background: var(--carte); }',
      '.tx-inst { display: block; font-size: 12px; font-weight: 700; letter-spacing: .02em; text-transform: uppercase; color: var(--encre-3); }',
      '.tx-lien { border: 0; background: none; padding: 0; color: var(--bleu); font: inherit; font-weight: 600; text-align: left; cursor: pointer; }',
      '.tx-lien:hover { text-decoration: underline; }',
      '.tx-prog-sous { display: block; font-size: 12px; color: var(--encre-3); line-height: 1.4; }',
      '.tx-pdf { display: inline-block; margin-top: 3px; font-size: 12px; font-weight: 500; }',
      '.tx-neg { color: var(--rouge); }',
      '.tx-table td.tx-pot small, .tx-boni small { display: block; font-size: 12px; font-weight: 600; color: var(--vert-fonce); }',
      '.tx-boni.non, .tx-texte.non { color: var(--encre-4); } .tx-boni.non span { text-decoration: line-through; } .tx-boni.non small { color: var(--ambre); }',
      '.tx-table tr.tx-top td { background: var(--vert-clair); }',
      '.tx-texte { font-size: 12.5px; color: var(--encre-2); max-width: 300px; }',
      '.tx-exclus { font-size: 13px; color: var(--encre-2); } .tx-exclus summary { cursor: pointer; font-weight: 600; } .tx-exclus ul { margin: 8px 0 0; padding-left: 18px; } .tx-exclus li { margin: 3px 0; }',
      '.tx-note { font-size: 12.5px; color: var(--encre-3); margin: 0; line-height: 1.5; }',
      '.tx-attente p { margin: 0; color: var(--encre-3); }',
      '.tx-depart { max-width: 720px; } .tx-depart h2 { font-size: 17px; margin: 0 0 8px; } .tx-depart p { margin: 0 0 12px; line-height: 1.55; color: var(--encre-2); }',
      '.tx-depart-boutons { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }',
      /* grilles */
      '.tx-grilles { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 16px; align-items: start; }',
      '.tx-inst-liste { display: flex; flex-direction: column; gap: 14px; min-width: 0; }',
      '.tx-compte { font-size: 12px; color: var(--encre-3); }',
      '.tx-progs { list-style: none; margin: 0; padding: 0; }',
      '.tx-progs > li { display: flex; gap: 12px; align-items: flex-start; justify-content: space-between; padding: 11px 16px; border-bottom: 1px solid var(--ligne); }',
      '.tx-progs > li:last-child { border-bottom: 0; }',
      '.tx-progs > li.tx-hors { background: var(--carte-2); } .tx-progs > li.tx-hors .tx-prog-nom { color: var(--encre-3); }',
      '.tx-prog-txt { min-width: 0; display: flex; flex-direction: column; gap: 2px; } .tx-prog-nom { font-size: 14px; }',
      '.tx-prog-gestes { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; flex: 0 0 auto; max-width: 46%; }',
      '.tx-etat { font-size: 12px; font-weight: 700; color: var(--ambre); }',
      '.tx-mises ul { list-style: none; margin: 0; padding: 4px 16px 12px; } .tx-mises li { padding: 8px 0; border-bottom: 1px solid var(--ligne); display: flex; flex-direction: column; gap: 1px; font-size: 13px; } .tx-mises li:last-child { border-bottom: 0; }',
      '.tx-mises small { font-size: 12px; color: var(--encre-3); } .tx-mises .tx-note { padding: 12px 16px; }',
      /* fiche et formulaire */
      '.tx-fiche { display: flex; flex-direction: column; gap: 12px; } .tx-fiche-sous { margin: 0; color: var(--encre-3); font-size: 13px; }',
      '.tx-dl { display: grid; grid-template-columns: 190px minmax(0, 1fr); gap: 6px 14px; margin: 0; font-size: 13.5px; } .tx-dl dt { color: var(--encre-3); font-weight: 600; } .tx-dl dd { margin: 0; } .tx-pre { white-space: pre-wrap; }',
      '.voile.tx-voile .modale.large { width: min(980px, 96vw); }',
      '.tx-formulaire { display: flex; flex-direction: column; gap: 12px; } .tx-formulaire h3 { font-size: 14px; margin: 8px 0 0; }',
      '.tx-grille2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; } .tx-grille4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }',
      '.tx-paliers-form { display: flex; flex-direction: column; gap: 10px; }',
      '.tx-palier { border: 1px solid var(--ligne-forte); border-radius: 9px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; background: var(--carte-2); }',
      '.tx-palier-rang { display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end; }',
      '.tx-palier-rang label { display: flex; flex-direction: column; gap: 3px; font-size: 12px; font-weight: 600; color: var(--encre-3); } .tx-palier-rang input.saisie { width: 104px; }',
      '.tx-tranches { display: flex; flex-direction: column; gap: 6px; }',
      '.tx-tranche { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; font-size: 12.5px; color: var(--encre-3); } .tx-tranche input.saisie { width: 96px; flex: 0 0 96px; }',
      '.tx-cases { display: flex; gap: 6px 16px; flex-wrap: wrap; }',
      '.tx-case { display: inline-flex; align-items: center; gap: 7px; font-size: 13.5px; } .tx-case input { width: 16px; height: 16px; margin: 0; }',
      '.tx-ia { display: flex; flex-direction: column; gap: 12px; } .tx-ia p { margin: 0; }',
      '.tx-prop { display: flex; gap: 12px; align-items: flex-start; justify-content: space-between; border: 1px solid var(--ligne); border-radius: 9px; padding: 10px 12px; }',
      /* grilles reçues */
      '.tx-recues { display: flex; gap: 14px; align-items: center; justify-content: space-between; padding: 12px 16px; margin-bottom: 14px; flex-wrap: wrap; }',
      '.tx-recues.attention { border-color: var(--ambre); box-shadow: inset 4px 0 0 var(--ambre); }',
      '.tx-recues-txt { display: flex; flex-direction: column; gap: 3px; min-width: 0; font-size: 13.5px; } .tx-recues-txt > span { color: var(--encre-2); }',
      '.tx-recues-adr { display: inline-flex; gap: 6px; align-items: baseline; flex-wrap: wrap; font-size: 13px; } .tx-recues-adr code { font-size: 13px; background: var(--carte-2); padding: 1px 6px; border-radius: 5px; word-break: break-all; }',
      '.tx-recues-gestes { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; flex: 0 0 auto; }',
      '.tx-recues-fen { display: flex; flex-direction: column; gap: 12px; }',
      '.tx-recues-haut { display: flex; gap: 12px; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; }',
      '.tx-recues-comment { font-size: 13px; color: var(--encre-2); } .tx-recues-comment summary { cursor: pointer; font-weight: 600; } .tx-recues-comment ol { margin: 8px 0; padding-left: 20px; } .tx-recues-comment li { margin: 3px 0; line-height: 1.5; }',
      '.tx-recues-barre { display: flex; justify-content: space-between; align-items: center; gap: 10px; border-top: 1px solid var(--ligne); padding-top: 10px; } .tx-recues-filtre { width: auto; }',
      '.tx-recu { border: 1px solid var(--ligne); border-radius: 10px; padding: 12px 14px; display: flex; flex-direction: column; gap: 9px; }',
      '.tx-recu.attention { border-left: 4px solid var(--ambre); } .tx-recu.erreur { border-left: 4px solid var(--rouge); } .tx-recu.info { border-left: 4px solid var(--bleu); }',
      '.tx-recu-tete { display: flex; gap: 12px; justify-content: space-between; align-items: flex-start; }',
      '.tx-recu-props { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }',
      '.tx-recu-ecartes { margin-top: 6px; } .tx-recu-ecartes > summary { cursor: pointer; font-size: 13px; color: var(--encre-3); padding: 4px 0; } .tx-recu-ecartes .tx-recu-props { opacity: .78; }',
      '.tx-recu-props > li { display: flex; gap: 12px; justify-content: space-between; align-items: flex-start; padding: 9px 0; border-top: 1px solid var(--ligne); }',
      '.tx-recu-nom { display: inline-flex; gap: 8px; align-items: baseline; flex-wrap: wrap; font-size: 14px; }',
      '.tx-p-etat { font-size: 12px; font-weight: 700; padding: 1px 7px; border-radius: 5px; }',
      '.tx-p-nouveau { color: var(--bleu); background: var(--bleu-bg); } .tx-p-change { color: var(--ambre); background: var(--ambre-bg); }',
      '.tx-p-pareil, .tx-p-ignore { color: var(--encre-3); background: var(--carte-2); } .tx-p-fait { color: var(--vert-fonce); background: var(--vert-clair); }',
      '.tx-p-prevu { color: var(--bleu); background: var(--bleu-bg); } .tx-prevu { color: var(--encre-2); }',
      '.tx-recues-barre strong { white-space: nowrap; } .tx-recues-barre select.saisie { width: auto; max-width: 260px; }',
      /* 21 nov. : partir d'une vente du Livre des ventes */
      '.tx-form-tete { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }',
      '.tx-vente-zone:empty { display: none; }',
      '.tx-vente { background: var(--bleu-bg); border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; font-size: 13px; }',
      '.tx-vente-l1 { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: baseline; } .tx-vente-l1 span { color: var(--encre-2); }',
      '.tx-vente-l2 { color: var(--encre-3); font-size: 12px; }',
      '.tx-vente-actions { display: flex; gap: 14px; flex-wrap: wrap; }',
      '.tx-vente-note:empty { display: none; } .tx-vente-note { border-top: 1px solid var(--ligne); margin-top: 4px; padding-top: 6px; font-size: 12px; color: var(--encre-2); } .tx-vente-note p { margin: 0 0 4px; }',
      '.tx-ventes-barre { display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0; } .tx-ventes-barre select.saisie { width: auto; } .tx-ventes-barre input.saisie { flex: 1 1 240px; min-width: 0; }',
      '.tx-ventes-compte { margin: 4px 0 6px; font-size: 13px; color: var(--encre-3); }',
      '.tx-ventes-liste { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; max-height: 60vh; overflow-y: auto; }',
      '.tx-vente-ligne { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 12px; width: 100%; text-align: left; border: 1px solid var(--ligne); border-radius: 8px; background: var(--carte, #fff); padding: 8px 12px; cursor: pointer; font: inherit; color: inherit; }',
      '.tx-vente-ligne:hover, .tx-vente-ligne:focus-visible { border-color: var(--vert); background: var(--vert-clair); }',
      '.tx-vl-1 { display: flex; gap: 8px; align-items: baseline; min-width: 0; } .tx-vl-1 strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.tx-vl-type { font-size: 12px; color: var(--encre-3); white-space: nowrap; }',
      '.tx-vl-2 { grid-column: 1; font-size: 12px; color: var(--encre-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.tx-vl-3 { grid-column: 2; grid-row: 1 / span 2; align-self: center; font-size: 13px; text-align: right; white-space: nowrap; }',
      '@media (max-width: 640px) { .tx-vente-ligne { grid-template-columns: minmax(0, 1fr); } .tx-vl-3 { grid-column: 1; grid-row: auto; text-align: left; } }',
      '.tx-recu-ch { margin: 4px 0 0; padding-left: 18px; font-size: 12.5px; color: var(--encre-2); } .tx-recu-ch li { margin: 2px 0; }',
      '@media (max-width: 640px) { .tx-recu-tete, .tx-recu-props > li { flex-direction: column; } }',
      /* amortissement, garantie */
      '.tx-chiffres { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; }',
      '.tx-chiffre { background: var(--carte); border: 1px solid var(--ligne); border-radius: var(--rayon); padding: 11px 14px; display: flex; flex-direction: column; gap: 3px; }',
      '.tx-chiffre span { font-size: 12px; color: var(--encre-3); font-weight: 600; } .tx-chiffre strong { font-size: 19px; font-variant-numeric: tabular-nums; }',
      '.tx-am tr.tx-fin td { background: var(--carte-2); font-weight: 600; }',
      '.tx-figure { margin: 0; } .tx-g { width: 100%; height: auto; display: block; }',
      '.tx-g-grille { stroke: var(--ligne); stroke-width: 1; } .tx-g-axe { font-size: 12px; fill: var(--encre-3); } .tx-g-titre { font-size: 12px; font-weight: 600; fill: var(--encre-2); } .tx-g-nom { font-size: 12px; font-weight: 700; fill: var(--encre); }',
      '.tx-g-fin { fill: none; stroke: var(--encre-2); stroke-width: 1.5; stroke-dasharray: 6 5; } .tx-g-route { stroke: var(--encre); stroke-width: 2.5; } .tx-g-point { fill: var(--encre); stroke: #fff; stroke-width: 2; }',
      '.tx-legende { display: flex; gap: 6px 18px; flex-wrap: wrap; font-size: 12.5px; color: var(--encre-2); margin-top: 8px; } .tx-legende span { display: inline-flex; align-items: center; gap: 7px; }',
      '.tx-legende i { width: 14px; height: 14px; border-radius: 3px; display: inline-block; } .tx-legende i.tx-l-fin { height: 0; border-top: 3px solid var(--encre); border-radius: 0; }',
      '.tx-phrases { margin: 12px 0 0; padding-left: 18px; font-size: 13.5px; line-height: 1.6; color: var(--encre-2); }',
      '#taux-impression { display: none; }',
      '@media (max-width: 1100px) { .tx-grilles { grid-template-columns: minmax(0, 1fr); } }',
      '@media (max-width: 900px) { .tx-deux { grid-template-columns: minmax(0, 1fr); } .tx-form { position: static; } .tx-table .opt { display: none; } .tx-grille4 { grid-template-columns: repeat(2, minmax(0, 1fr)); } .tx-dl { grid-template-columns: minmax(0, 1fr); gap: 2px; } .tx-dl dd { margin-bottom: 8px; } }',
      '@media (max-width: 640px) { .tx-progs > li { flex-direction: column; } .tx-prog-gestes { max-width: none; justify-content: flex-start; } .tx-grille2 { grid-template-columns: minmax(0, 1fr); } .tx-prop { flex-direction: column; } }',
      '@page txam { size: letter; margin: 0.5in; }',
      '@media print { body.impression-taux > *:not(#taux-impression) { display: none !important; } body.impression-taux { background: #fff !important; } body.impression-taux #taux-impression { display: block; page: txam; color: #111; font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; } #taux-impression h1 { font-size: 16px; margin: 0 0 4px; } #taux-impression p { font-size: 11px; margin: 0 0 8px; } #taux-impression table { width: 100%; border-collapse: collapse; font-size: 10px; } #taux-impression th, #taux-impression td { border-bottom: 1px solid #ccc; padding: 2px 6px; text-align: left; } #taux-impression .num { text-align: right; } #taux-impression thead th { position: static; background: #eee; } }'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* =============================== Section =============================== */
  AMX.section('taux', {
    titre: 'Taux Einstein', icone: 'resultat', ordre: 18,
    visible: function () { return peutVoir(); },
    monter: function (c, ctx) { return new VueTaux(c, ctx); }
  });
  AMX.taux = { calcul: Calcul, charger: charger, vider: vider, peutVoir: peutVoir, enCache: function () { return cache.rep; },
    recues: function () { return (cache.rep && cache.rep.recues) || null; }, lecture: function () { return LECTURE.en; } };
})();
