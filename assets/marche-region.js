/* marche-region.js — Marché par région (17 nov. 2026)

   Suggestion S83B4F8D1F5 (Marc-André, « suite à la rencontre avec Torque ») : ce que chaque concession réussit sur chaque
   genre de véhicule (pick-up, VUS compact…) — ventes, jours en stock, % du marché obtenu, gros, recon — le marché local et
   la tendance des prix par modèle. Données : GET ?marcheRegion=1 (MarcheRegion.gs).

   - AMX.marcheRegion : charger, copie, enCache, famille, segment, pourVehicule, bloc (tuile « Par concession » de
     l'évaluation), tuile (petit texte de la tuile), mds (vitesse du marché MarketCheck autour de chaque concession).
   - Section « marcheregion » : Inventaire › Occasion › Marché par région (Par genre · Par modèle · Tendances).
   Règle v138 : filtres (indicateur) → « Chiffres et liste » → tableau. Montants seulement avec le droit (d.montants). */
(function () {
  'use strict';
  var h = AMX.h, I = AMX.icones;
  var COURT = { STM: 'Ste-Marie', HAWKS: 'Hawkesbury', BMW: 'BMW Sherbrooke', VW: 'VW Brossard', HYUNDAI: 'Hyundai Longueuil' };
  var TAUX_KM = 0.10;
  var cache = { d: null, quand: 0, promesse: null, copieLe: 0 };

  function nombre(v) { if (v === null || v === undefined || v === '') return null; var n = Number(String(v).replace(/[\s$]/g, '').replace(',', '.')); return isFinite(n) ? n : null; }
  function argent(v) { return v === null || v === undefined ? '—' : AMX.fmtArgent(v); }
  function pct(v, d) { return v === null || v === undefined ? '—' : (Math.round(v * (d ? 1000 : 100)) / (d ? 10 : 1)).toLocaleString('fr-CA') + ' %'; }
  function jours(v) { return v === null || v === undefined ? '—' : Math.round(v) + ' j'; }
  function court(c) { return COURT[c] || (AMX.COMPAGNIES_TOUTES && AMX.COMPAGNIES_TOUTES[c]) || c; }
  function centaine(x) { return x === null ? null : Math.round(x / 100) * 100; }

  /* ------------------------------ données ------------------------------ */
  function charger(force) {
    if (!force && cache.d && Date.now() - cache.quand < AMX.dureeCopie(10 * 60000)) return Promise.resolve(cache.d);
    if (cache.promesse) return cache.promesse;
    var p = { marcheRegion: 1 }; if (force) p.frais = 1;
    cache.promesse = AMX.get(p, { gz: true, copie: 'marche_region', secours: false, delai: 90000 }).then(function (d) {
      cache.promesse = null;
      if (d && d.ok && d.parCie) { cache.d = d; cache.quand = Date.now(); cache.copieLe = 0; document.dispatchEvent(new CustomEvent('amx:marcheRegion')); }
      return d;
    }, function (e) { cache.promesse = null; throw e; });
    return cache.promesse;
  }
  function copie() {
    if (cache.d) return Promise.resolve(cache.d);
    if (!AMX.cacheLocal || !AMX.cacheLocal.lireGz) return Promise.resolve(null);
    return AMX.cacheLocal.lireGz('marche_region', 7 * 86400000).then(function (o) {
      if (o && o.donnees && o.donnees.parCie && !cache.d) { cache.d = o.donnees; cache.copieLe = o.quand; cache.quand = 0; }
      return cache.d;
    }, function () { return null; });
  }

  /* ------------------------------ famille et genre (mêmes règles que MoteurOffres.gs) ------------------------------ */
  function cle(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9.\- ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function famille(d, marque, modele) {
    var deux = (d && d.deuxieme) || [];
    var brut = String(modele || '').trim(); if (/^\d/.test(brut) && marque && !/^(bmw|mini)$/i.test(String(marque).trim())) brut = String(marque).trim() + ' ' + brut;   // « 1500 » de Ram → « Ram 1500 »
    var m = cle(brut.replace(/\b(1500|2500|3500)\s*hd\b/ig, '$1 HD')).replace(/^(chevrolet|gmc|buick|cadillac|bmw|mini|volkswagen|vw|hyundai|kia)\s+/, '');
    if (!m) return '';
    if (/^(bmw|mini)$/.test(cle(marque))) {
      var b = /^m?([1-8])\d\d[a-z]*\b/.exec(m); if (b) return 'serie' + b[1];
      var s = /^serie\s*([1-8])/.exec(m); if (s) return 'serie' + s[1];
    }
    var t = m.split(' ');
    if (t.length > 1 && deux.indexOf(t[1]) >= 0) return t[0] + ' ' + t[1];
    return t[0];
  }
  function segment(d, fam) {
    if (!fam) return 'autre';
    if (d && d.familles && d.familles[fam]) return d.familles[fam];
    if (/\bev\b|electri|ioniq|lyriq|optiq|vistiq|bolt|hummer|^id\.?\s?(4|buzz)|^i[4-7]$|^ix\d?$|^ev\d/.test(fam)) return 'electrique';
    var table = (d && d.table) || {}, premier = fam.split(' ')[0], seg;
    for (seg in table) if (table[seg].indexOf(fam) >= 0) return seg;
    for (seg in table) if (table[seg].indexOf(premier) >= 0) return seg;
    return 'autre';
  }
  var MOTS_MAJ = ['ev', 'hd', 'xl', 'esv', 'euv', 'gt', 'gti', 'gli', 'rs', 'ss', 'zr2', 'at4', 'slt', 'sle', 'awd'];
  function nomFamille(f) {
    var b = /^serie(\d)$/.exec(f); if (b) return 'Série ' + b[1];
    return String(f || '').split(' ').map(function (w) {
      if (MOTS_MAJ.indexOf(w) >= 0 || (w.length <= 4 && /[0-9-]/.test(w) && /[a-z]/.test(w))) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    }).join(' ');
  }
  function nomSegment(d, seg) { var x = ((d && d.segments) || []).filter(function (s) { return s.cle === seg; })[0]; return x ? x.nom : 'Autres'; }

  /* ------------------------------ un véhicule évalué, concession par concession ------------------------------ */
  /** v = { marque, modele, annee, km, recon, marge, frais, cie (la concession de l'évaluation) } */
  function pourVehicule(d, v) {
    if (!d || !d.parCie) return null;
    var fam = famille(d, v.marque, v.modele), seg = segment(d, fam), an = nombre(v.annee), km = nombre(v.km);
    if (!fam || !an) return { fam: fam, seg: seg, lignes: [], raison: !fam ? 'Modèle à préciser' : 'Année à préciser' };
    var lignes = (d.cies || Object.keys(d.parCie)).map(function (cie) {
      var src = 'local', m = ((d.marche || {})[cie] || {})[fam + '|' + an];
      if (!m || m[0] < 3) { m = ((d.marche || {}).G || {})[fam + '|' + an]; src = 'groupe'; }
      if (!m || m[0] < 1) { m = null; src = ''; }
      var ref = m ? m[1] + ((m[2] && km) ? (m[2] - km) * TAUX_KM : 0) : null;
      var mod = ((d.modeles || {})[cie] || {})[fam], gen = ((d.parCie[cie] || {}).segments || {})[seg] || null;
      var stat = (mod && mod.ventes >= 3) ? mod : gen, niveau = (mod && mod.ventes >= 3) ? 'modele' : 'genre';
      var p = null, pSrc = '';
      if (mod && mod.nPct >= 3 && mod.pctMarche >= 0.85 && mod.pctMarche <= 1.1) { p = mod.pctMarche; pSrc = 'modele'; }
      else if (gen && gen.nPct >= 3 && gen.pctMarche >= 0.85 && gen.pctMarche <= 1.1) { p = gen.pctMarche; pSrc = 'genre'; }
      var attendu = ref !== null ? centaine(ref * (p || 1)) : null;
      var recon = nombre(v.recon); if (recon === null && stat && stat.reconMoy !== null && stat.reconMoy !== undefined) recon = stat.reconMoy;
      var marge = nombre(v.marge) || 0, frais = nombre(v.frais) || 0;
      var achatMax = (attendu !== null && d.montants) ? centaine(attendu - (recon || 0) - marge - frais) : null;
      return { cie: cie, ref: ref !== null ? centaine(ref) : null, nAnnonces: m ? m[0] : 0, src: src, pct: p, pctSrc: pSrc, attendu: attendu, achatMax: achatMax,
        recon: recon, niveau: niveau, ventes: stat ? stat.ventes : 0, gros: stat ? stat.gros : 0, tauxDetail: stat ? stat.tauxDetail : null,
        joursMed: stat ? stat.joursMed : null, nJours: stat ? (stat.nJours || 0) : 0, profitMoy: stat ? stat.profitMoy : null, fiMoy: stat ? stat.fiMoy : null,
        stock: gen ? gen.stock : 0, joursAppro: gen ? gen.joursAppro : null, ici: v.cie === cie };
    });
    // Le meilleur prix : seulement une concession qui vend ce genre (3 ventes et plus) et dont on connaît le % obtenu.
    var avecVentes = lignes.filter(function (l) { return l.ventes >= 3 && l.attendu !== null && l.pct !== null; });
    var meilleur = (avecVentes.length ? avecVentes : lignes.filter(function (l) { return l.attendu !== null; })).sort(function (a, b) { return b.attendu - a.attendu; })[0] || null;
    var rapide = lignes.filter(function (l) { return l.ventes >= 3 && l.nJours >= 3 && l.joursMed !== null; }).sort(function (a, b) { return a.joursMed - b.joursMed; })[0] || null;
    if (meilleur && avecVentes.length) meilleur.meilleur = true;
    if (rapide) rapide.rapide = true;
    return { fam: fam, seg: seg, an: an, km: km, lignes: lignes, meilleur: meilleur && avecVentes.length ? meilleur : null, rapide: rapide, tendance: (d.tendances || {})[fam + '|' + an] || null };
  }

  /* ------------------------------ petite courbe (un seul trait) ------------------------------ */
  function courbe(points, l, ha) {
    l = l || 120; ha = ha || 32;
    if (!points || points.length < 2) return null;
    var ys = points.map(function (p) { return p[1]; }), min = Math.min.apply(null, ys), max = Math.max.apply(null, ys), et = (max - min) || 1;
    var pts = points.map(function (p, i) { return [4 + i * (l - 8) / (points.length - 1), ha - 4 - (p[1] - min) * (ha - 8) / et]; });
    var ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + l + ' ' + ha); svg.setAttribute('width', l); svg.setAttribute('height', ha); svg.setAttribute('class', 'mrg-courbe');
    svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Prix médian par semaine : ' + points.map(function (p) { return p[0] + ' ' + AMX.fmtArgent(p[1]); }).join(', '));
    var path = document.createElementNS(ns, 'polyline');
    path.setAttribute('points', pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '));
    path.setAttribute('fill', 'none'); path.setAttribute('stroke', 'currentColor'); path.setAttribute('stroke-width', '2'); path.setAttribute('stroke-linejoin', 'round'); path.setAttribute('stroke-linecap', 'round');
    svg.appendChild(path);
    var der = pts[pts.length - 1], c = document.createElementNS(ns, 'circle');
    c.setAttribute('cx', der[0]); c.setAttribute('cy', der[1]); c.setAttribute('r', '3'); c.setAttribute('fill', 'currentColor');
    svg.appendChild(c);
    var t = document.createElementNS(ns, 'title'); t.textContent = svg.getAttribute('aria-label'); svg.appendChild(t);
    return svg;
  }
  function texteTendance(t, semaines) {
    if (!t || !t.points || !t.points.length) return 'Pas encore de tendance pour ce modèle-année';
    if (t.pente30 === undefined || t.pente30 === null) return 'Tendance : ' + t.points.length + ' semaine' + (t.points.length > 1 ? 's' : '') + ' de prix (il en faut 3)';
    var s = t.pente30 > 0 ? '+' : '';
    return 'Tendance : ' + s + t.pente30.toLocaleString('fr-CA') + ' % par 30 jours · dans 30 j ≈ ' + AMX.fmtArgent(t.prevision30) + ' · 60 j ≈ ' + AMX.fmtArgent(t.prevision60);
  }

  /* ------------------------------ la tuile de l'évaluation ------------------------------ */
  /** Le petit texte de la tuile « Par concession ». */
  function tuile(v) {
    var d = cache.d; if (!d) return { texte: 'À lire', ton: 'gris' };
    var r = pourVehicule(d, v); if (!r || !r.lignes.length) return { texte: r && r.raison ? r.raison : '—', ton: 'gris' };
    if (r.meilleur) return { texte: '★ ' + court(r.meilleur.cie), ton: 'vert', titre: 'Concession où ce genre de véhicule se vend le mieux : ' + court(r.meilleur.cie) };
    return { texte: 'Peu de ventes', ton: 'gris', titre: 'Moins de 3 ventes de ce genre de véhicule par concession en 12 mois' };
  }
  /** Bloc complet dans le panneau. v = valeurs de l'évaluation ; opts.vin pour la vitesse du marché. */
  function bloc(conteneur, v, opts) {
    opts = opts || {};
    AMX.vider(conteneur);
    var d = cache.d;
    if (!d) {
      conteneur.appendChild(AMX.chargeur ? AMX.chargeur('Marché par région', { compact: true }) : h('p.eval-note', 'Chargement…'));
      copie().then(function () { return charger(false); }).then(function () { if (cache.d) bloc(conteneur, v, opts); }, function (e) { AMX.vider(conteneur); conteneur.appendChild(h('p.eval-note', { text: 'Marché par région : ' + AMX.erreurTexte(e) })); });
      return;
    }
    var r = pourVehicule(d, v);
    if (!r || !r.lignes.length) { conteneur.appendChild(h('p.eval-note', { text: (r && r.raison ? r.raison + ' : ' : '') + 'entrez la marque, le modèle et l\'année.' })); return; }
    var titre = h('div.mrg-titre', [
      h('b', { text: nomSegment(d, r.seg) }),
      h('span', { text: ' · ' + (v.marque || '') + ' ' + (v.modele || '') + ' ' + r.an + (r.km ? ' · ' + AMX.fmtNombre(r.km) + ' km' : '') })
    ]);
    var m = d.montants;
    var cols = [['Concession', ''], ['Marché local', 'Prix médian AFFICHÉ des annonces du même modèle-année dans ' + (d.rayonKm || 60) + ' km, ramené à votre km'],
      ['Vendu à', 'Ce que la concession obtient d\'habitude : prix de vente ÷ prix affiché du marché (ventes des 6 derniers mois)'], ['Prix attendu', 'Marché local × % obtenu par la concession']];
    if (m) cols.push(['Achat max.', 'Prix attendu − recon − marge visée − frais']);
    cols.push(['Jours', 'Jours en stock médians jusqu\'à la vente (12 mois)'], ['Détail / gros', 'Ventes au détail / envoyés au gros, 12 mois'], ['Stock', 'En stock au détail aujourd\'hui (jours d\'approvisionnement)']);
    if (m) cols.push(['Profit moy.', 'Profit front moyen au détail (12 mois)']);
    var mds = opts.mds || {};
    if (Object.keys(mds).length) cols.push(['Marché (MDS)', 'Jours d\'approvisionnement du marché autour de la concession (MarketCheck, 160 km) : plus bas = se vend plus vite']);
    var thead = h('thead', [h('tr', cols.map(function (c) { return h('th', { text: c[0], title: c[1] }); }))]);
    var tbody = h('tbody');
    r.lignes.slice().sort(function (a, b) { return (b.ici - a.ici) || ((b.attendu || 0) - (a.attendu || 0)); }).forEach(function (l) {
      var nomDiv = h('div.mrg-cie', [h('span.puce-cie.' + (AMX.COULEUR_COMPAGNIE[l.cie] || 'gris')), h('span', { text: court(l.cie) })]);
      if (l.meilleur) nomDiv.appendChild(h('span.mrg-badge.vert', { text: '★ Meilleur prix', title: 'Prix attendu le plus haut parmi les concessions qui vendent ce genre de véhicule' }));
      if (l.rapide) nomDiv.appendChild(h('span.mrg-badge.bleu', { text: 'Plus rapide', title: 'Moins de jours en stock' }));
      if (l.ici) nomDiv.appendChild(h('span.mrg-badge', { text: 'Cette évaluation' }));
      var nomCel = h('td', [nomDiv]);
      var ligne = [nomCel,
        h('td.num', { title: l.nAnnonces ? l.nAnnonces + ' annonce' + (l.nAnnonces > 1 ? 's' : '') + (l.src === 'groupe' ? ' — trop peu près de la concession : marché du groupe' : '') : 'Aucune annonce' }, [l.ref !== null ? argent(l.ref) : '—', h('small', { text: l.nAnnonces ? (l.src === 'groupe' ? ' groupe' : ' · ' + l.nAnnonces) : '' })]),
        h('td.num', { title: l.pctSrc === 'modele' ? 'Sur ce modèle' : (l.pctSrc === 'genre' ? 'Sur ce genre de véhicule' : 'Pas assez de ventes avec un prix : on prend le marché') }, [l.pct !== null ? pct(l.pct, true) : '—']),
        h('td.num' + (l.pct !== null ? '.fort' : '.estime'), { text: argent(l.attendu), title: l.pct !== null ? 'Marché local × % que la concession obtient' : 'Le prix du marché : pas assez de ventes pour savoir ce que la concession obtient' })];
      if (m) ligne.push(h('td.num', { text: argent(l.achatMax), title: l.recon !== null ? 'Recon ' + AMX.fmtArgent(l.recon) : '' }));
      ligne.push(h('td.num' + (l.joursMed !== null && l.nJours < 3 ? '.estime' : ''), { text: jours(l.joursMed), title: (l.niveau === 'modele' ? 'Sur ce modèle' : 'Sur ce genre de véhicule') + ' — ' + l.nJours + ' vente' + (l.nJours > 1 ? 's' : '') + ' avec une date d\'arrivée' + (l.joursMed !== null && l.nJours < 3 ? ' : trop peu pour s\'y fier' : '') }),
        h('td.num', { text: l.ventes + ' / ' + l.gros, title: l.tauxDetail !== null ? pct(l.tauxDetail) + ' vendus au détail' : '' }),
        h('td.num', { text: l.stock + (l.joursAppro !== null ? ' (' + Math.round(l.joursAppro) + ' j)' : '') }));
      if (m) ligne.push(h('td.num', { text: argent(l.profitMoy) }));
      if (Object.keys(mds).length) { var x = mds[l.cie] || {}; ligne.push(h('td.num', { text: x.mds !== null && x.mds !== undefined ? Math.round(x.mds) + ' j' : (x.erreur ? '!' : '—'), title: x.erreur || (x.actifs !== undefined ? x.actifs + ' en vente, ' + x.vendus + ' vendus en 45 j' : '') })); }
      tbody.appendChild(h('tr' + (l.ici ? '.ici' : ''), ligne));
    });
    var table = h('div.mrg-defile', [h('table.tableau.mrg-table', [thead, tbody])]);
    var pied = h('div.mrg-pied');
    var t = r.tendance, c = t && courbe(t.points);
    pied.appendChild(h('div.mrg-tendance', [c, h('span', { text: texteTendance(t) })].filter(Boolean)));
    if (opts.vin && /^[A-HJ-NPR-Z0-9]{17}$/.test(opts.vin) && !Object.keys(mds).length && opts.surMds) {
      pied.appendChild(h('button.btn.petit', { type: 'button', text: 'Vitesse du marché (MarketCheck)', title: 'Jours d\'approvisionnement du marché autour de chaque concession — 5 appels à MarketCheck',
        onclick: function (e) { var b = e.currentTarget; b.disabled = true; b.textContent = 'Lecture…'; mdsLire(opts.vin, v).then(function (res) { opts.surMds(res); }, function (err) { b.disabled = false; b.textContent = 'Vitesse du marché (MarketCheck)'; AMX.toast(AMX.erreurTexte(err), 'erreur'); }); } }));
    }
    var lecture = d.lecture && d.lecture.le ? 'Annonces du ' + AMX.fmtDateCourte(d.lecture.le) : '';
    conteneur.appendChild(h('div.mrg-bloc', [titre, table, pied, h('p.mrg-note', { text: [lecture, 'ventes des 12 derniers mois', cache.copieLe ? 'copie du ' + AMX.fmtDateCourte(new Date(cache.copieLe).toISOString()) : ''].filter(Boolean).join(' · ') })]));
  }
  function mdsLire(vin, v) {
    return AMX.post({ action: 'marcheRegionMds', vin: vin, annee: v.annee, marque: v.marque, modele: v.modele }, { secours: false, delai: 90000 }).then(function (r) {
      if (!r || !r.ok) throw new Error((r && r.erreur) || 'Vitesse du marché indisponible');
      return r.mds || {};
    });
  }

  /* ------------------------------ la page ------------------------------ */
  var INDICATEURS = [
    { id: 'joursMed', t: 'Jours en stock', sens: -1, f: jours, n: 'nJours', aide: 'Jours en stock médians jusqu\'à la vente au détail — date d\'arrivée : registre, fiche d\'achat, achat automatique, ou livraison du véhicule qui a amené l\'échange (la plus ancienne). Grisé : moins de 3 ventes avec une date.' },
    { id: 'pctMarche', t: '% du marché', sens: 1, f: function (x) { return pct(x, true); }, n: 'nPct', aide: 'Prix de vente ÷ prix médian affiché des annonces du même modèle-année (6 derniers mois)' },
    { id: 'ventes', t: 'Ventes au détail', sens: 1, f: function (x) { return x ? String(x) : '0'; } },
    { id: 'tauxDetail', t: 'Vendus au détail', sens: 1, f: function (x) { return pct(x); }, aide: 'Ventes au détail ÷ (détail + gros)' },
    { id: 'gros', t: 'Envoyés au gros', sens: 0, f: function (x) { return x ? String(x) : '0'; } },
    { id: 'profitMoy', t: 'Profit moyen', sens: 1, f: argent, montant: true },
    { id: 'fiMoy', t: 'F&I moyen', sens: 1, f: argent, montant: true },
    { id: 'profitGrosMoy', t: 'Profit au gros', sens: 1, f: argent, montant: true },
    { id: 'reconMoy', t: 'Recon moyen', sens: -1, f: argent, montant: true, aide: 'Recon réel de la fiche d\'achat : service, carrosserie, safety, pré-safety' },
    { id: 'stock', t: 'Stock', sens: 0, f: function (x) { return x ? String(x) : '0'; } },
    { id: 'joursAppro', t: 'Jours d\'appro', sens: -1, f: function (x) { return x === null || x === undefined ? '—' : Math.round(x) + ' j'; }, aide: 'Stock ÷ ventes par jour : combien de jours pour vendre le stock' },
    { id: 'annonces', t: 'Annonces à 60 km', sens: 0, f: function (x) { return x ? AMX.fmtNombre(x) : '0'; } }
  ];
  var VUES = [['genre', 'Par genre'], ['modele', 'Par modèle'], ['tendances', 'Tendances des prix']];

  AMX.section('marcheregion', {
    titre: 'Marché par région', icone: 'resultat', ordre: 22,
    visible: function () { return AMX.perm('ficheAchat') || AMX.perm('changerStatut') || AMX.perm('modifierMontants') || AMX.estAdmin() || AMX.perm('evaluateur'); },
    monter: function (conteneur, ctx) { return new Vue(conteneur, ctx); }
  });
  function Vue(conteneur, ctx) {
    var self = this, p = (ctx && ctx.params) || {};
    this.conteneur = conteneur; this.compagnie = AMX.compagnieChoisie('evaluations');
    this.vue = VUES.some(function (x) { return x[0] === p.voir; }) ? p.voir : (AMX.memo.lire('mrg_vue', 'genre') || 'genre');
    this.ind = AMX.memo.lire('mrg_ind', 'joursMed') || 'joursMed';
    this.q = p.q || '';
    injecterCss();
    this.construire();
    this.surCie = function (e) { self.compagnie = (e.detail && e.detail.compagnie) || ''; self.rendre(); };
    this.surDonnees = function () { self.rendre(); };
    document.addEventListener('amx:compagnie', this.surCie);
    document.addEventListener('amx:marcheRegion', this.surDonnees);
    copie().then(function () { self.rendre(); });
    this.charger(false);
  }
  Vue.prototype.demonter = function () { document.removeEventListener('amx:compagnie', this.surCie); document.removeEventListener('amx:marcheRegion', this.surDonnees); };
  Vue.prototype.charger = function (force) {
    var self = this; this.erreur = '';
    charger(force).then(function (d) { if (d && !d.ok) self.erreur = d.erreur || 'Lecture impossible'; self.rendre(); if (force) AMX.toast('Marché par région relu', 'ok'); }, function (e) { self.erreur = AMX.erreurTexte(e); self.rendre(); });
  };
  Vue.prototype.construire = function () {
    var self = this;
    this.elSous = h('p', 'Chargement…');
    var btnR = h('button.btn', { type: 'button', html: (I.rafraichir || '') + '<span>Recalculer</span>', title: 'Relire les ventes, les registres et le marché (30 secondes environ)', onclick: function () { self.charger(true); } });
    var btnX = h('button.btn', { type: 'button', html: (I.telecharger || '') + '<span>Exporter Excel</span>', onclick: function () { self.exporter(); } });
    var actions = [btnR, btnX];
    this.elCies = h('div.barre-cies');
    this.elVues = h('div.segment.mrg-vues', { role: 'tablist', 'aria-label': 'Vue' });
    this.elInd = h('div.inv2-statuts.mrg-ind', { role: 'group', 'aria-label': 'Indicateur à comparer' });
    this.elQ = h('input.saisie', { type: 'search', placeholder: 'Modèle (Silverado, X3, Tucson…)', 'aria-label': 'Chercher un modèle', value: this.q,
      oninput: AMX.debounce(function (e) { self.q = e.target.value; self.rendreCorps(); }, 150) });
    this.elRech = h('div.recherche.inv2-recherche.mrg-rech', [h('span', { html: I.recherche }), this.elQ]);
    this.elPortee = h('div.portee-chiffres');
    this.elCorps = h('div.carte.mrg-corps');
    this.conteneur.appendChild(h('div.page.mrg-page', [
      h('div.entete-page', [h('div', [h('h1', 'Marché par région'), this.elSous]), h('div.actions', AMX.actionsEntete ? AMX.actionsEntete(actions, []) : actions)]),
      this.elCies, h('div.inv2-filtres.mrg-filtres', [h('div.mrg-haut', [this.elVues, this.elRech]), this.elInd]), this.elPortee, this.elCorps]));
  };
  Vue.prototype.cies = function () {
    var d = cache.d; if (!d) return [];
    var l = (d.cies || Object.keys(d.parCie)).slice();
    if (this.compagnie && l.indexOf(this.compagnie) >= 0) l = [this.compagnie].concat(l.filter(function (c) { return c !== this.compagnie; }, this));
    return l;
  };
  Vue.prototype.indicateurs = function () { var m = cache.d && cache.d.montants; return INDICATEURS.filter(function (x) { return !x.montant || m; }); };
  Vue.prototype.rendre = function () {
    var self = this, d = cache.d;
    AMX.barreConcessions(this.elCies, { domaine: 'evaluations', valeur: this.compagnie, onchange: function (c) { AMX.choisirCompagnie(c); } });
    if (!d) { this.elSous.textContent = this.erreur ? 'Lecture impossible : ' + this.erreur : 'Chargement…'; AMX.vider(this.elCorps); if (!this.erreur) this.elCorps.appendChild(AMX.chargeur('Marché par région')); return; }
    var sem = (d.semaines || []).length;
    this.elSous.textContent = ['Ventes des 12 derniers mois', d.lecture && d.lecture.le ? 'annonces du ' + AMX.fmtDateCourte(d.lecture.le) + ' (' + AMX.fmtNombre(d.lecture.n || 0) + ')' : 'aucune lecture du marché', sem + ' semaine' + (sem > 1 ? 's' : '') + ' de prix', cache.copieLe ? 'copie du navigateur — mise à jour en cours…' : ''].filter(Boolean).join(' · ') + (this.erreur ? ' — mise à jour impossible : ' + this.erreur : '');
    AMX.vider(this.elVues);
    VUES.forEach(function (v) { self.elVues.appendChild(h('button' + (self.vue === v[0] ? '.actif' : ''), { type: 'button', role: 'tab', 'aria-selected': self.vue === v[0] ? 'true' : 'false', text: v[1], onclick: function () { self.vue = v[0]; AMX.memo.ecrire('mrg_vue', v[0]); self.rendre(); } })); });
    var inds = this.indicateurs(); if (!inds.some(function (x) { return x.id === self.ind; })) this.ind = 'joursMed';
    AMX.vider(this.elInd);
    if (this.vue !== 'tendances') inds.forEach(function (x) { self.elInd.appendChild(h('button.inv2-pastille' + (self.ind === x.id ? '.actif' : ''), { type: 'button', text: x.t, title: x.aide || '', 'aria-pressed': self.ind === x.id ? 'true' : 'false', onclick: function () { self.ind = x.id; AMX.memo.ecrire('mrg_ind', x.id); self.rendre(); } })); });
    this.elInd.hidden = this.vue === 'tendances';
    this.elRech.hidden = this.vue === 'genre';
    this.rendreCorps();
  };
  Vue.prototype.valeur = function (cie, x, ind) {
    if (ind === 'annonces') return null;
    return x ? x[ind] : null;
  };
  Vue.prototype.rendreCorps = function () {
    var d = cache.d; if (!d) return;
    AMX.vider(this.elCorps);
    if (this.vue === 'tendances') return this.rendreTendances();
    var self = this, ind = INDICATEURS.filter(function (x) { return x.id === self.ind; })[0], cies = this.cies();
    var lignes = [];
    if (this.vue === 'genre') {
      (d.segments || []).forEach(function (s) {
        var cel = {}, a = false;
        cies.forEach(function (c) {
          var pc = d.parCie[c] || {}, x = (pc.segments || {})[s.cle] || null;
          var v = ind.id === 'annonces' ? (((pc.marche || {})[s.cle] || {}).n || 0) : (x ? x[ind.id] : null);
          cel[c] = { v: v, x: x };
          if (x && (x.ventes || x.gros || x.stock)) a = true;
        });
        if (a) lignes.push({ nom: s.nom, cle: s.cle, cel: cel });
      });
    } else {
      var fams = {};
      cies.forEach(function (c) { Object.keys((d.modeles || {})[c] || {}).forEach(function (f) { fams[f] = true; }); });
      Object.keys(fams).sort().forEach(function (f) {
        if (self.q && !AMX.correspond([f, nomSegment(d, segment(d, f))], self.q)) return;
        var cel = {};
        cies.forEach(function (c) {
          var x = ((d.modeles || {})[c] || {})[f] || null, v = ind.id === 'annonces' ? null : (x ? x[ind.id] : null);
          if (ind.id === 'annonces') { var t = 0; Object.keys((d.marche || {})[c] || {}).forEach(function (k) { if (k.split('|')[0] === f) t += d.marche[c][k][0]; }); v = t; }
          cel[c] = { v: v, x: x };
        });
        lignes.push({ nom: nomFamille(f), cle: f, cel: cel, seg: nomSegment(d, segment(d, f)) });
      });
    }
    AMX.porteeChiffres(this.elPortee, { n: lignes.length, unite: this.vue === 'genre' ? ['genre', 'genres'] : ['modèle', 'modèles'], contexte: [ind.t, this.compagnie ? court(this.compagnie) + ' en premier' : 'toutes les concessions'], filtres: this.q && this.vue === 'modele' ? ['« ' + this.q + ' »'] : [], effacer: function () { self.q = ''; self.elQ.value = ''; self.rendreCorps(); } });
    if (!lignes.length) { this.elCorps.appendChild(h('p.vide', { text: this.vue === 'modele' && this.q ? 'Aucun modèle ne correspond.' : 'Pas encore de ventes ni de stock à comparer.' })); return; }
    var thead = h('thead', [h('tr', [h('th', { text: this.vue === 'genre' ? 'Genre de véhicule' : 'Modèle' })].concat(cies.map(function (c) { return h('th.num' + (c === self.compagnie ? '.ici' : ''), [h('span.puce-cie.' + (AMX.COULEUR_COMPAGNIE[c] || 'gris')), h('span', { text: court(c) })]); })))]);
    var tbody = h('tbody');
    lignes.forEach(function (l) {
      // Le meilleur de la ligne (seulement quand la valeur s'appuie sur au moins 3 ventes, et que l'indicateur a un sens).
      var meilleur = null;
      if (ind.sens) {
        cies.forEach(function (c) {
          var o = l.cel[c]; if (o.v === null || o.v === undefined) return;
          var base = o.x ? (ind.n ? o.x[ind.n] : o.x.ventes) : 0; if (ind.id !== 'joursAppro' && base < 3) return;
          if (!meilleur || (ind.sens > 0 ? o.v > meilleur.v : o.v < meilleur.v)) meilleur = { c: c, v: o.v };
        });
      }
      var tr = h('tr.mrg-ligne', { tabindex: '0', title: 'Voir le détail', onclick: function () { self.detail(l); }, onkeydown: function (e) { if (e.key === 'Enter') self.detail(l); } },
        [h('td', [h('b', { text: l.nom }), l.seg ? h('small', { text: ' ' + l.seg }) : null].filter(Boolean))].concat(cies.map(function (c) {
          var o = l.cel[c], x = o.x, base = x ? (ind.n ? x[ind.n] : x.ventes) : 0;
          var txt = (o.v === null || o.v === undefined) ? '—' : ind.f(o.v);
          var sous = (ind.n && base) ? base + ' vente' + (base > 1 ? 's' : '') : ((ind.id !== 'ventes' && ind.id !== 'gros' && ind.id !== 'stock' && ind.id !== 'annonces' && x) ? (x.ventes || 0) + ' vente' + ((x.ventes || 0) > 1 ? 's' : '') : '');
          return h('td.num' + (meilleur && meilleur.c === c ? '.meilleur' : '') + (c === self.compagnie ? '.ici' : '') + ((base < 3 && ind.sens && o.v !== null && o.v !== undefined && ind.id !== 'joursAppro') ? '.peu' : ''), [h('span', { text: txt }), sous ? h('small', { text: sous }) : null].filter(Boolean));
        })));
      tbody.appendChild(tr);
    });
    this.elCorps.appendChild(h('div.mrg-defile', [h('table.tableau.mrg-table.mrg-grille', [thead, tbody])]));
    this.elCorps.appendChild(h('p.mrg-note', { text: 'En vert : le meilleur de la ligne (au moins 3 ventes). En gris : moins de 3 ventes, à prendre avec prudence. Cliquez une ligne pour tout voir.' }));
  };
  Vue.prototype.detail = function (l) {
    var d = cache.d, self = this, cies = this.cies(), m = d.montants;
    var rangs = INDICATEURS.filter(function (x) { return !x.montant || m; });
    var thead = h('thead', [h('tr', [h('th', '')].concat(cies.map(function (c) { return h('th.num', { text: court(c) }); })))]);
    var tbody = h('tbody');
    rangs.forEach(function (ind) {
      tbody.appendChild(h('tr', [h('td', { text: ind.t, title: ind.aide || '' })].concat(cies.map(function (c) {
        var x, v;
        if (self.vue === 'genre') { var pc = d.parCie[c] || {}; x = (pc.segments || {})[l.cle]; v = ind.id === 'annonces' ? (((pc.marche || {})[l.cle] || {}).n || 0) : (x ? x[ind.id] : null); }
        else { x = ((d.modeles || {})[c] || {})[l.cle]; v = x ? x[ind.id] : null; if (ind.id === 'annonces') v = null; }
        var nb = (ind.n && x) ? (x[ind.n] || 0) : null;
        return h('td.num' + (nb !== null && nb < 3 && v !== null && v !== undefined ? '.peu' : ''), [h('span', { text: v === null || v === undefined ? '—' : ind.f(v) }), (nb !== null && v !== null && v !== undefined) ? h('small', { text: ' (' + nb + ')' }) : null].filter(Boolean));
      }))));
    });
    var corps = [h('div.mrg-defile', [h('table.tableau.mrg-table', [thead, tbody])])];
    if (this.vue === 'genre') {
      // Les modèles de ce genre, par concession (ventes au détail).
      var fams = {};
      cies.forEach(function (c) { Object.keys((d.modeles || {})[c] || {}).forEach(function (f) { if (segment(d, f) === l.cle) fams[f] = (fams[f] || 0) + (d.modeles[c][f].ventes || 0); }); });
      var top = Object.keys(fams).sort(function (a, b) { return fams[b] - fams[a]; }).slice(0, 8);
      if (top.length) corps.push(h('p.mrg-note', { text: 'Modèles de ce genre (ventes au détail, 12 mois) : ' + top.map(function (f) { return nomFamille(f) + ' ' + fams[f]; }).join(' · ') }));
    }
    AMX.modale({ titre: l.nom + (l.seg ? ' — ' + l.seg : ''), large: true, corps: h('div.mrg-detail', corps), boutons: [{ texte: 'Fermer', primaire: true }] });
  };
  Vue.prototype.rendreTendances = function () {
    var self = this, d = cache.d, sem = (d.semaines || []).length;
    var liste = Object.keys(d.tendances || {}).map(function (k) { var t = d.tendances[k], p = k.split('|'); return { k: k, fam: p[0], an: p[1], t: t, der: t.points[t.points.length - 1] }; })
      .filter(function (x) { return !self.q || AMX.correspond([x.fam, x.an, nomSegment(d, segment(d, x.fam))], self.q); });
    liste.sort(function (a, b) { var pa = a.t.pente30, pb = b.t.pente30; if (pa !== undefined && pb !== undefined && pa !== null && pb !== null) return pa - pb; return (b.der[2] || 0) - (a.der[2] || 0); });
    AMX.porteeChiffres(this.elPortee, { n: liste.length, unite: ['modèle-année', 'modèles-années'], contexte: ['prix médian affiché, tout le groupe', sem + ' semaine' + (sem > 1 ? 's' : '')], filtres: this.q ? ['« ' + this.q + ' »'] : [], effacer: function () { self.q = ''; self.elQ.value = ''; self.rendreCorps(); } });
    if (sem < 3) this.elCorps.appendChild(h('div.alerte.info', { text: 'La tendance demande 3 semaines de prix : il y en a ' + sem + '. Chaque lecture du lundi en ajoute une ; d\'ici là, on voit le prix de la semaine.' }));
    if (!liste.length) { this.elCorps.appendChild(h('p.vide', { text: 'Aucun modèle-année.' })); return; }
    var tbody = h('tbody');
    liste.slice(0, 300).forEach(function (x) {
      var t = x.t, c = courbe(t.points, 110, 28);
      var pente = t.pente30 === undefined || t.pente30 === null ? '—' : (t.pente30 > 0 ? '+' : '') + t.pente30.toLocaleString('fr-CA') + ' %';
      tbody.appendChild(h('tr', [
        h('td', [h('b', { text: nomFamille(x.fam) + ' ' + x.an }), h('small', { text: ' ' + nomSegment(d, segment(d, x.fam)) })]),
        h('td.num', { text: argent(x.der[1]) }), h('td.num', { text: AMX.fmtNombre(x.der[2] || 0) }),
        h('td.mrg-c', [c || h('span.doux', '—')]),
        h('td.num' + (t.pente30 < -1 ? '.baisse' : (t.pente30 > 1 ? '.hausse' : '')), { text: pente }),
        h('td.num', { text: t.prevision30 ? argent(t.prevision30) : '—' }), h('td.num', { text: t.prevision60 ? argent(t.prevision60) : '—' })]));
    });
    this.elCorps.appendChild(h('div.mrg-defile', [h('table.tableau.mrg-table', [h('thead', [h('tr', [h('th', 'Modèle-année'), h('th.num', 'Prix médian'), h('th.num', 'Annonces'), h('th', 'Semaines'), h('th.num', { text: 'Par 30 j', title: 'Pente du prix médian, en % par 30 jours' }), h('th.num', 'Dans 30 j'), h('th.num', 'Dans 60 j')])]), tbody])]));
    this.elCorps.appendChild(h('p.mrg-note', { text: 'Prix médian AFFICHÉ des annonces de concessionnaires (lecture hebdomadaire du marché). La prévision prolonge la pente des dernières semaines : une indication, pas une promesse.' }));
  };
  Vue.prototype.exporter = function () {
    var d = cache.d; if (!d) return;
    if (typeof XLSX === 'undefined') { AMX.toast('La bibliothèque Excel n\'est pas encore chargée. Réessayez.', 'erreur'); return; }
    var cies = this.cies(), inds = this.indicateurs(), lignes = [];
    (d.segments || []).forEach(function (s) {
      cies.forEach(function (c) {
        var pc = d.parCie[c] || {}, x = (pc.segments || {})[s.cle]; if (!x) return;
        var o = { 'Genre': s.nom, 'Concession': court(c) };
        inds.forEach(function (ind) { o[ind.t] = ind.id === 'annonces' ? (((pc.marche || {})[s.cle] || {}).n || 0) : x[ind.id]; });
        lignes.push(o);
      });
    });
    var mod = [];
    cies.forEach(function (c) { Object.keys((d.modeles || {})[c] || {}).forEach(function (f) { var x = d.modeles[c][f], o = { 'Modèle': nomFamille(f), 'Genre': nomSegment(d, segment(d, f)), 'Concession': court(c) }; inds.forEach(function (ind) { if (ind.id !== 'annonces') o[ind.t] = x[ind.id]; }); mod.push(o); }); });
    var ten = Object.keys(d.tendances || {}).map(function (k) { var t = d.tendances[k], der = t.points[t.points.length - 1]; return { 'Modèle-année': nomFamille(k.split('|')[0]) + ' ' + k.split('|')[1], 'Prix médian': der[1], 'Annonces': der[2], 'Semaines': t.points.length, '% par 30 j': t.pente30, 'Dans 30 j': t.prevision30, 'Dans 60 j': t.prevision60 }; });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lignes), 'Par genre');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mod), 'Par modèle');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ten), 'Tendances');
    XLSX.writeFile(wb, 'marche-par-region-' + new Date().toISOString().slice(0, 10) + '.xlsx');
  };

  function injecterCss() {
    if (document.getElementById('css-mrg')) return;
    var s = document.createElement('style'); s.id = 'css-mrg';
    s.textContent = [
      '.mrg-defile{overflow-x:auto;-webkit-overflow-scrolling:touch}',
      '.mrg-table{width:100%;border-collapse:collapse;font-size:14px}',
      '.mrg-table th,.mrg-table td{padding:8px 10px;border-bottom:1px solid var(--trait,#e5e7eb);text-align:left;white-space:nowrap;vertical-align:top}',
      '.mrg-table th{font-size:12px;font-weight:600;color:var(--encre-3,#4B5563);text-transform:uppercase;letter-spacing:.02em}',
      '.mrg-table .num{text-align:right;font-variant-numeric:tabular-nums}',
      '.mrg-table td small{display:block;font-size:12px;color:var(--encre-3,#4B5563)}',
      '.mrg-table td.num small{display:block}',
      '.mrg-table td.fort{font-weight:700}',
      '.mrg-table tr.ici td{background:var(--vert-clair,#eaf6ef)}',
      '.mrg-table th.ici{color:var(--vert-fonce,#00632f)}',
      '.mrg-grille td.meilleur{background:var(--vert-clair,#eaf6ef);color:var(--vert-fonce,#00632f);font-weight:700}',
      '.mrg-grille td.peu span{color:var(--encre-4,#5F6978)}',
      '.mrg-detail td.peu span{color:var(--encre-4,#5F6978)}', '.mrg-detail td small{color:var(--encre-4,#5F6978);font-size:12px}',
      '.mrg-grille td.ici{box-shadow:inset 2px 0 0 var(--vert,#008840)}',
      '.mrg-ligne{cursor:pointer}.mrg-ligne:hover td{background:var(--fond,#f6f7f9)}.mrg-ligne:focus-visible{outline:2px solid var(--vert,#008840);outline-offset:-2px}',
      '.mrg-cie{display:flex;align-items:center;gap:6px;flex-wrap:wrap;white-space:normal}', '.mrg-table td.estime{color:var(--encre-3,#4B5563);font-style:italic}',
      '.puce-cie{display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--encre-4,#5F6978)}',
      '.puce-cie.vert{background:var(--vert,#008840)}.puce-cie.bleu{background:var(--bleu,#1A64BF)}.puce-cie.violet{background:#6b4fbb}.puce-cie.sombre{background:#141A1F}.puce-cie.ambre{background:var(--ambre,#955F10)}',
      '.mrg-badge{font-size:12px;padding:2px 8px;border-radius:999px;background:var(--fond-2,#eef0f3);color:var(--encre-2,#333)}',
      '.mrg-badge.vert{background:var(--vert-clair,#eaf6ef);color:var(--vert-fonce,#00632f)}.mrg-badge.bleu{background:#e8f0fb;color:var(--bleu,#1A64BF)}',
      '.mrg-titre{margin:0 0 10px;font-size:15px}',
      '.mrg-pied{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:10px}',
      '.mrg-tendance{display:flex;align-items:center;gap:10px;font-size:14px;color:var(--encre-2,#333)}',
      '.mrg-courbe{color:var(--bleu,#1A64BF);flex:none}',
      '.mrg-note{font-size:12px;color:var(--encre-3,#4B5563);margin:8px 0 0}',
      '.mrg-page .inv2-filtres.mrg-filtres{flex-direction:column;align-items:stretch}', '.mrg-page .mrg-filtres>*{min-width:0;max-width:100%;box-sizing:border-box}', '.mrg-page .mrg-ind{overflow-x:auto}', '.mrg-page .mrg-haut .mrg-rech{min-width:0}', '.mrg-haut{display:flex;gap:10px;flex-wrap:wrap;align-items:center}', '.mrg-ind[hidden],.mrg-rech[hidden]{display:none}', '.mrg-vues button{font-size:14px;padding:7px 14px}',
      '.mrg-ind button,.mrg-vues button{white-space:nowrap}',
      '.mrg-rech{max-width:420px}',
      '.mrg-table td.baisse{color:var(--rouge,#b42318);font-weight:600}.mrg-table td.hausse{color:var(--vert-fonce,#00632f);font-weight:600}',
      '.mrg-c{color:var(--bleu,#1A64BF)}',
      '.mrg-corps{padding:0}.mrg-corps>.mrg-note,.mrg-corps>.alerte,.mrg-corps>.vide{margin:12px}'
    ].join('\n');
    document.head.appendChild(s);
  }

  AMX.marcheRegion = { charger: charger, copie: copie, enCache: function () { return cache.d; }, famille: function (m, mo) { return famille(cache.d, m, mo); },
    segment: function (f) { return segment(cache.d, f); }, pourVehicule: function (v) { return pourVehicule(cache.d, v); }, pourVehiculeAvec: pourVehicule,
    bloc: function (c, v, o) { injecterCss(); return bloc(c, v, o); }, tuile: tuile, mds: mdsLire, vider: function () { cache.d = null; cache.quand = 0; cache.copieLe = 0; } };
})();
