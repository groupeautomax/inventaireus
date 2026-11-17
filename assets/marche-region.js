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
    return { fam: fam, seg: seg, an: an, km: km, lignes: lignes, meilleur: meilleur && avecVentes.length ? meilleur : null, rapide: rapide, tendance: (d.tendances || {})[fam + '|' + an] || null, tendanceEncan: (d.tendancesEncan || {})[fam + '|' + an] || null };
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

  /** La tendance des ventes à l'encan (OpenLane) d'un modèle-année, en une phrase. */
  function texteEncan(t) {
    if (!t || !t.n) return '';
    var base = 'Encan OpenLane : ' + t.n + ' vente' + (t.n > 1 ? 's' : '') + ' depuis le ' + AMX.fmtDateCourte(t.depuis);
    if (t.pente30 === undefined || t.pente30 === null) return base + ', médiane ' + AMX.fmtArgent(t.mediane) + ' (trop peu pour une pente)';
    var s = t.pente30 > 0 ? '+' : '';
    return base + ' · ' + s + t.pente30.toLocaleString('fr-CA') + ' % par 30 jours · aujourd\'hui ≈ ' + AMX.fmtArgent(t.valeur) + ' · dans 30 j ≈ ' + AMX.fmtArgent(t.prevision30) + ' · 60 j ≈ ' + AMX.fmtArgent(t.prevision60);
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
    // 17 nov. : la valeur au moment probable de la revente (dépréciation normale du genre + saison).
    if (d.saisons) {
      var cieEv = v.cie || '', dlv = delaiRevente(d, cieEv, r.seg), pj = projeter(d, r.seg, 100, dlv.j, new Date());
      if (pj) {
        var pcv = pj.valeur - 100, iciL = r.lignes.filter(function (x) { return x.ici; })[0] || r.meilleur, baseV = iciL && iciL.attendu;
        pied.appendChild(h('div.mrg-revente.' + (pcv <= -4 ? 'rouge' : (pcv <= -2 ? 'ambre' : 'vert')), [
          h('b', { text: 'Revente vers le ' + dateLongue(pj.le) + ' (' + dlv.j + ' j' + (cieEv ? ' chez ' + court(cieEv) : '') + ') : ' + signePct(pcv, true) }),
          h('span', { text: ' — dépréciation ' + signePct(pj.dep * 100, true) + ', saison ' + signePct(pj.saison * 100, true) + (baseV ? ' · prix attendu ≈ ' + AMX.fmtArgent(centaine(baseV * pj.valeur / 100)) + ' au lieu de ' + AMX.fmtArgent(baseV) : '') })]));
      }
    }
    var te = r.tendanceEncan, ce = te && courbe(te.points);
    if (te) pied.appendChild(h('div.mrg-tendance', { title: 'Prix payé à l\'encan (OpenLane), ramené au même km, 6 derniers mois' }, [ce, h('span', { text: texteEncan(te) })].filter(Boolean)));
    var t = r.tendance, c = t && courbe(t.points);
    pied.appendChild(h('div.mrg-tendance', { title: 'Prix affiché des annonces de concessionnaires (lecture du lundi)' }, [c, h('span', { text: (te ? 'Annonces : ' : '') + texteTendance(t) })].filter(Boolean)));
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
  var VUES = [['apercu', 'Aperçu'], ['genre', 'Tableau par genre'], ['modele', 'Tableau par modèle']];

  AMX.section('marcheregion', {
    titre: 'Marché par région', icone: 'resultat', ordre: 22,
    visible: function () { return AMX.perm('ficheAchat') || AMX.perm('changerStatut') || AMX.perm('modifierMontants') || AMX.estAdmin() || AMX.perm('evaluateur'); },
    monter: function (conteneur, ctx) { return new Vue(conteneur, ctx); }
  });
  function Vue(conteneur, ctx) {
    var self = this, p = (ctx && ctx.params) || {};
    this.conteneur = conteneur; this.compagnie = AMX.compagnieChoisie('evaluations');
    this.vue = VUES.some(function (x) { return x[0] === p.voir; }) ? p.voir : (AMX.memo.lire('mrg_vue2', 'apercu') || 'apercu');
    if (!VUES.some(function (x) { return x[0] === self.vue; })) this.vue = 'apercu';
    this.mod = p.modele ? String(p.modele) : '';
    this.segSaison = AMX.memo.lire('mrg_seg_saison', 'tous') || 'tous'; this.indChaleur = AMX.memo.lire('mrg_ind_chaleur', 'joursMed') || 'joursMed';
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
    this.elListe = h('datalist', { id: 'mrg-modeles' });
    this.elQuestion = h('input.saisie.mrg-question', { type: 'search', list: 'mrg-modeles', placeholder: 'Quel véhicule ? (ex. Equinox 2022, Silverado 1500 2021)', 'aria-label': 'Quel véhicule ?',
      onchange: function (e) { self.ouvrirQuestion(e.target.value); }, onkeydown: function (e) { if (e.key === 'Enter') self.ouvrirQuestion(e.target.value); } });
    this.elQuestionZone = h('div.mrg-question-zone', [h('span', { html: I.recherche }), this.elQuestion, this.elListe]);
    this.conteneur.appendChild(h('div.page.mrg-page', [
      h('div.entete-page', [h('div', [h('h1', 'Marché par région'), this.elSous]), h('div.actions', AMX.actionsEntete ? AMX.actionsEntete(actions, []) : actions)]),
      this.elCies, this.elQuestionZone, h('div.inv2-filtres.mrg-filtres', [h('div.mrg-haut', [this.elVues, this.elRech]), this.elInd]), this.elPortee, this.elCorps]));
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
    VUES.forEach(function (v) { self.elVues.appendChild(h('button' + (self.vue === v[0] ? '.actif' : ''), { type: 'button', role: 'tab', 'aria-selected': self.vue === v[0] ? 'true' : 'false', text: v[1], onclick: function () { self.vue = v[0]; AMX.memo.ecrire('mrg_vue2', v[0]); if (self.mod) self.allerModele(''); else self.rendre(); } })); });
    var inds = this.indicateurs(); if (!inds.some(function (x) { return x.id === self.ind; })) this.ind = 'joursMed';
    AMX.vider(this.elInd);
    if (this.vue === 'genre' || this.vue === 'modele') inds.forEach(function (x) { self.elInd.appendChild(h('button.inv2-pastille' + (self.ind === x.id ? '.actif' : ''), { type: 'button', text: x.t, title: x.aide || '', 'aria-pressed': self.ind === x.id ? 'true' : 'false', onclick: function () { self.ind = x.id; AMX.memo.ecrire('mrg_ind', x.id); self.rendre(); } })); });
    this.elInd.hidden = !!this.mod || this.vue === 'apercu';
    this.elRech.hidden = !!this.mod || this.vue !== 'modele';
    this.elVues.style.display = this.mod ? 'none' : '';
    if (this.elVues.parentNode && this.elVues.parentNode.parentNode) this.elVues.parentNode.parentNode.style.display = this.mod ? 'none' : '';
    this.remplirListe();
    this.rendreCorps();
  };
  Vue.prototype.valeur = function (cie, x, ind) {
    if (ind === 'annonces') return null;
    return x ? x[ind] : null;
  };
  Vue.prototype.rendreCorps = function () {
    var d = cache.d; if (!d) return;
    AMX.vider(this.elCorps);
    this.elPortee.hidden = false;
    if (this.mod) return this.rendreFiche();
    if (this.vue === 'apercu') return this.rendreApercu();
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
        if ((l.type || self.vue) === 'genre') { var pc = d.parCie[c] || {}; x = (pc.segments || {})[l.cle]; v = ind.id === 'annonces' ? (((pc.marche || {})[l.cle] || {}).n || 0) : (x ? x[ind.id] : null); }
        else { x = ((d.modeles || {})[c] || {})[l.cle]; v = x ? x[ind.id] : null; if (ind.id === 'annonces') v = null; }
        var nb = (ind.n && x) ? (x[ind.n] || 0) : null;
        return h('td.num' + (nb !== null && nb < 3 && v !== null && v !== undefined ? '.peu' : ''), [h('span', { text: v === null || v === undefined ? '—' : ind.f(v) }), (nb !== null && v !== null && v !== undefined) ? h('small', { text: ' (' + nb + ')' }) : null].filter(Boolean));
      }))));
    });
    var corps = [h('div.mrg-defile', [h('table.tableau.mrg-table', [thead, tbody])])];
    var fenetre = null;
    if ((l.type || this.vue) === 'genre') {
      // Les modèles de ce genre, par concession (ventes au détail) ; un clic sur une année ouvre la fiche du modèle-année.
      var fams = {};
      cies.forEach(function (c) { Object.keys((d.modeles || {})[c] || {}).forEach(function (f) { if (segment(d, f) === l.cle) fams[f] = (fams[f] || 0) + (d.modeles[c][f].ventes || 0); }); });
      var top = Object.keys(fams).sort(function (a, b) { return fams[b] - fams[a]; }).slice(0, 8);
      if (top.length) corps.push(h('p.mrg-note', { text: 'Modèles de ce genre (ventes au détail, 12 mois) : ' + top.map(function (f) { return nomFamille(f) + ' ' + fams[f]; }).join(' · ') }));
      var annees = {};
      Object.keys(d.tendancesEncan || {}).forEach(function (k) { var p = k.split('|'); if (segment(d, p[0]) === l.cle && (fams[p[0]] || !top.length)) (annees[p[0]] = annees[p[0]] || []).push(p[1]); });
      var fs = Object.keys(annees).sort(function (a, b) { return (fams[b] || 0) - (fams[a] || 0); }).slice(0, 10);
      if (fs.length) {
        corps.push(h('h3', 'Voir la courbe d\'un modèle-année'));
        corps.push(h('div.mrg-annees', fs.map(function (f) {
          return h('div', [h('b', { text: nomFamille(f) }), h('span', annees[f].sort().map(function (an) { return h('button.btn.petit.fantome', { type: 'button', text: an, onclick: function () { if (fenetre) fenetre.fermer(); self.allerModele(f + '|' + an); } }); }))]);
        })));
      }
    }
    fenetre = AMX.modale({ titre: l.nom + (l.seg ? ' — ' + l.seg : ''), large: true, corps: h('div.mrg-detail', corps), boutons: [{ texte: 'Fermer', primaire: true }] });
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
    var enc = d.tendancesEncan || {};
    var tenE = Object.keys(enc).map(function (k) { var t = enc[k]; return { 'Modèle-année': nomFamille(k.split('|')[0]) + ' ' + k.split('|')[1], 'Valeur': t.valeur !== undefined ? t.valeur : t.mediane, 'Médiane 6 mois': t.mediane, 'Ventes': t.n, 'Du': t.depuis, 'Au': t.jusqua, 'Km de référence': t.kmRef, '% par 30 j': t.pente30, 'Dans 30 j': t.prevision30, 'Dans 60 j': t.prevision60 }; });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lignes), 'Par genre');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mod), 'Par modèle');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ten), 'Tendances annonces');
    if (tenE.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tenE), 'Tendances encan');
    if (d.saisons && d.saisons.tous) {
      var sais = [['tous', d.saisons.tous]].concat(Object.keys(d.saisons.seg || {}).map(function (k) { return [k, d.saisons.seg[k]]; })).map(function (x) {
        var o = { 'Genre': x[0] === 'tous' ? 'Tous' : nomSegment(d, x[0]), 'Dépréciation par mois (%)': x[1].dep30 };
        MOIS_LONGS.forEach(function (m, i) { o[m] = x[1].pct[i]; }); return o;
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sais), 'Saisons');
    }
    XLSX.writeFile(wb, 'marche-par-region-' + new Date().toISOString().slice(0, 10) + '.xlsx');
  };

  /* ------------------------------ saisons, valeur à la revente, fiche d'un modèle (17 nov.) ------------------------------
     Maxime : « le tableau des prix par modèle ne sert à rien… il faut un rapprochement avec les évaluations pour comprendre
     les tendances à venir, avec le fait que les prix changent avec les saisons ». Le script donne l'effet des saisons par
     genre (nos 13 000 évaluations Torque et ScanAutomax + les ventes à l'encan), la dépréciation normale, et les
     évaluations des 45 derniers jours. La page projette chaque valeur au moment probable de la revente. */
  var STATUTS_EVAL = { completed: 'Complétée', bought: 'Repris', pending: 'En attente', incomplete: 'Incomplète', lost: 'Perdue', tradedin: 'Repris', tradedinwholesale: 'Repris au gros' };
  function statutEval(s) { var k = String(s || '').toLowerCase().replace(/[^a-z]/g, ''); return STATUTS_EVAL[k] || String(s || ''); }
  function estRepris(s) { return /^(repris|bought|tradedin)/i.test(String(s || '').replace(/\s/g, '')); }
  function saisonDe(d, seg) { var s = d && d.saisons; if (!s || !s.tous) return null; return (s.seg && s.seg[seg]) || s.tous; }
  /** Effet de la saison (en %) à une date : interpolé entre le milieu des mois. */
  function saisonAu(sa, date) {
    var m = date.getMonth(), f = (date.getDate() - 15) / 30.5, b = (m + (f >= 0 ? 1 : 11)) % 12, w = Math.min(1, Math.abs(f));
    return (sa.pct[m] || 0) * (1 - w) + (sa.pct[b] || 0) * w;
  }
  /** Valeur dans « jours » jours : dépréciation normale du genre + saison au moment de la revente ÷ saison au départ. */
  function projeter(d, seg, valeur, jours, depuis) {
    var sa = saisonDe(d, seg); if (!sa || valeur === null || valeur === undefined) return null;
    var t0 = depuis || new Date(), t1 = new Date(t0.getTime() + jours * 86400000);
    var dep = ((sa.dep30 || 0) / 100) * jours / 30, s = (saisonAu(sa, t1) - saisonAu(sa, t0)) / 100;
    return { valeur: valeur * Math.exp(dep + s), dep: dep, saison: s, jours: jours, le: t1 };
  }
  function delaiRevente(d, cie, seg) {
    var pc = (d.parCie || {})[cie], x = pc && pc.segments && pc.segments[seg];
    if (x && x.nJours >= 3 && x.joursMed) return { j: Math.max(15, Math.min(120, x.joursMed)), src: 'genre' };
    if (pc && pc.total && pc.total.nJours >= 3 && pc.total.joursMed) return { j: Math.max(15, Math.min(120, pc.total.joursMed)), src: 'concession' };
    return { j: 45, src: 'defaut' };
  }
  function encanPour(d, fam, an, km) {
    var t = (d.tendancesEncan || {})[fam + '|' + an]; if (!t) return null;
    var v = (t.valeur !== undefined && t.valeur !== null) ? t.valeur : t.mediane;
    if (km && t.kmRef) v += (t.kmRef - km) * TAUX_KM;
    return { valeur: v, t: t };
  }
  function signePct(x, d) { if (x === null || x === undefined || !isFinite(x)) return '—'; var v = Math.round(x * (d ? 10 : 1)) / (d ? 10 : 1); if (v === 0) return '0 %'; return (v > 0 ? '+' : '−') + Math.abs(v).toLocaleString('fr-CA') + ' %'; }
  function signeArgent(x) { if (x === null || x === undefined || !isFinite(x)) return '—'; return (x > 0 ? '+' : (x < 0 ? '−' : '')) + AMX.fmtArgent(Math.abs(Math.round(x))); }
  function dateLongue(dt) { return dt.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' }).replace('.', ''); }
  var NS = 'http://www.w3.org/2000/svg';
  function sv(tag, attrs, enfants) { var e = document.createElementNS(NS, tag); Object.keys(attrs || {}).forEach(function (k) { if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]); }); (enfants || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }); return e; }
  function titre(t) { var e = document.createElementNS(NS, 'title'); e.textContent = t; return e; }

  /** Les 12 mois : barres au-dessus (bleu) ou au-dessous (rouge) de la moyenne de l'année ; le mois courant marqué. */
  function grapheSaisons(sa, maintenant) {
    var L = 640, H = 210, g = 40, dr = 10, haut = 18, bas = 34, l = (L - g - dr) / 12;
    var max = Math.max(1, Math.max.apply(null, sa.pct.map(function (x) { return Math.abs(x || 0); }))); max = Math.ceil(max + 0.5);
    var y = function (v) { return haut + (max - v) * (H - haut - bas) / (2 * max); }, y0 = y(0), m0 = maintenant.getMonth();
    var svg = sv('svg', { viewBox: '0 0 ' + L + ' ' + H, class: 'mrg-gs', role: 'img', 'aria-label': 'Effet de la saison par mois : ' + sa.pct.map(function (v, i) { return MOIS[i] + ' ' + signePct(v, true); }).join(', ') });
    [max, max / 2, 0, -max / 2, -max].forEach(function (v) {
      svg.appendChild(sv('line', { x1: g, x2: L - dr, y1: y(v), y2: y(v), class: v === 0 ? 'axe0' : 'grille' }));
      svg.appendChild(sv('text', { x: g - 6, y: y(v) + 4, class: 'eti', 'text-anchor': 'end' }, [(v > 0 ? '+' : '') + (Math.round(v * 10) / 10).toLocaleString('fr-CA') + ' %']));
    });
    sa.pct.forEach(function (v, i) {
      var x = g + i * l + 4, w = l - 8, yv = y(v || 0), top = Math.min(yv, y0), hh = Math.max(2, Math.abs(yv - y0));
      var cls = (v >= 0 ? 'pos' : 'neg') + (i === m0 ? ' ici' : '');
      var r = sv('rect', { x: x, y: top, width: w, height: hh, rx: 3, class: 'barre-s ' + cls }, [titre(MOIS_LONGS[i] + ' : ' + signePct(v, true) + ' par rapport à la moyenne de l\'année' + (sa.n && sa.n[i] ? ' (' + sa.n[i] + ' valeurs)' : ''))]);
      svg.appendChild(r);
      svg.appendChild(sv('text', { x: x + w / 2, y: H - bas + 16, class: 'eti' + (i === m0 ? ' fort' : ''), 'text-anchor': 'middle' }, [MOIS[i]]));
      if (i === m0) svg.appendChild(sv('text', { x: x + w / 2, y: H - 4, class: 'eti fort', 'text-anchor': 'middle' }, ['aujourd\'hui']));
    });
    return svg;
  }
  var MOIS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
  var MOIS_LONGS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

  /** Le graphique d'un modèle-année : ventes à l'encan (gris), nos évaluations (bleu), médiane par semaine, projection. */
  function grapheModele(m, d, enc, proj, seg) {
    var L = 760, H = 300, g = 58, dr = 16, haut = 14, bas = 30, ajd = new Date(); ajd.setHours(12, 0, 0, 0);
    var pts = (m.encan || []).map(function (p) { return { t: Date.parse(p[0] + 'T12:00:00'), v: p[1], k: p[2], s: 'encan' }; })
      .concat((m.evals || []).map(function (p) { return { t: Date.parse(p[0] + 'T12:00:00'), v: p[1], k: p[2], s: 'eval', src: p[3], cie: p[4], st: p[5] }; }))
      .filter(function (p) { return isFinite(p.t) && p.v > 0; });
    var debut = ajd.getTime() - 365 * 86400000;
    pts = pts.filter(function (p) { return p.t >= debut; });
    if (!pts.length && !enc) return null;
    var t0 = pts.length ? Math.min.apply(null, pts.map(function (p) { return p.t; })) : ajd.getTime() - 180 * 86400000, t1 = ajd.getTime() + 92 * 86400000;
    var vs = pts.map(function (p) { return p.v; }); if (proj) proj.forEach(function (p) { vs.push(p.valeur); }); if (enc) vs.push(enc.valeur);
    vs.sort(function (a, b) { return a - b; });
    var vmin = vs[Math.floor(vs.length * 0.02)], vmax = vs[Math.ceil(vs.length * 0.98) - 1] || vs[vs.length - 1];
    var marge = Math.max(500, (vmax - vmin) * 0.08); vmin = Math.max(0, vmin - marge); vmax = vmax + marge;
    var X = function (t) { return g + (t - t0) * (L - g - dr) / (t1 - t0); }, Y = function (v) { return haut + (vmax - Math.max(vmin, Math.min(vmax, v))) * (H - haut - bas) / (vmax - vmin); };
    var svg = sv('svg', { viewBox: '0 0 ' + L + ' ' + H, class: 'mrg-gm', role: 'img', 'aria-label': 'Prix de ce modèle-année dans le temps et projection' });
    for (var i = 0; i <= 4; i++) { var v = vmin + (vmax - vmin) * i / 4; svg.appendChild(sv('line', { x1: g, x2: L - dr, y1: Y(v), y2: Y(v), class: 'grille' })); svg.appendChild(sv('text', { x: g - 6, y: Y(v) + 4, class: 'eti', 'text-anchor': 'end' }, [Math.round(v / 1000) + ' k$'])); }
    var dm = new Date(t0); dm.setDate(1); dm.setMonth(dm.getMonth() + 1);
    for (; dm.getTime() < t1; dm.setMonth(dm.getMonth() + 1)) { svg.appendChild(sv('text', { x: X(dm.getTime()), y: H - 10, class: 'eti', 'text-anchor': 'middle' }, [MOIS[dm.getMonth()] + (dm.getMonth() === 0 ? ' ' + dm.getFullYear() : '')])); }
    svg.appendChild(sv('line', { x1: X(ajd.getTime()), x2: X(ajd.getTime()), y1: haut, y2: H - bas, class: 'ajd' }));
    svg.appendChild(sv('text', { x: X(ajd.getTime()) + 4, y: haut + 10, class: 'eti fort' }, ['aujourd\'hui']));
    pts.filter(function (p) { return p.s === 'encan'; }).forEach(function (p) {
      svg.appendChild(sv('circle', { cx: X(p.t), cy: Y(p.v), r: 3, class: 'pt-encan' }, [titre('Vente à l\'encan ' + AMX.fmtDateCourte(new Date(p.t).toISOString()) + ' : ' + AMX.fmtArgent(p.v) + (p.k ? ' · ' + AMX.fmtNombre(p.k) + ' km' : ''))]));
    });
    pts.filter(function (p) { return p.s === 'eval'; }).forEach(function (p) {
      svg.appendChild(sv('circle', { cx: X(p.t), cy: Y(p.v), r: 4.5, class: 'pt-eval' }, [titre('Notre évaluation (' + (p.src === 'torque' ? 'Torque' : 'ScanAutomax') + (p.cie ? ', ' + court(p.cie) : '') + ') ' + AMX.fmtDateCourte(new Date(p.t).toISOString()) + ' : ' + AMX.fmtArgent(p.v) + (p.k ? ' · ' + AMX.fmtNombre(p.k) + ' km' : '') + (p.st ? ' · ' + statutEval(p.st) : ''))]));
    });
    var tm = enc && enc.t && enc.t.points;
    if (tm && tm.length > 1) {
      var chemin = tm.map(function (p, i) { return (i ? 'L' : 'M') + X(Date.parse(p[0] + 'T12:00:00') + 3 * 86400000).toFixed(1) + ',' + Y(p[1]).toFixed(1); }).join(' ');
      svg.appendChild(sv('path', { d: chemin, class: 'ligne-med' }, [titre('Prix médian de la semaine à l\'encan')]));
    }
    if (enc && proj && proj.length) {
      var dep = 'M' + X(ajd.getTime()).toFixed(1) + ',' + Y(enc.valeur).toFixed(1) + proj.map(function (p) { return ' L' + X(p.le.getTime()).toFixed(1) + ',' + Y(p.valeur).toFixed(1); }).join('');
      svg.appendChild(sv('path', { d: dep, class: 'ligne-proj' }));
      svg.appendChild(sv('circle', { cx: X(ajd.getTime()), cy: Y(enc.valeur), r: 5, class: 'pt-ajd' }, [titre('Valeur à l\'encan aujourd\'hui : ' + AMX.fmtArgent(enc.valeur))]));
      proj.forEach(function (p) { svg.appendChild(sv('circle', { cx: X(p.le.getTime()), cy: Y(p.valeur), r: 4, class: 'pt-proj' }, [titre('Dans ' + p.jours + ' jours (' + dateLongue(p.le) + ') : ≈ ' + AMX.fmtArgent(p.valeur))])); });
    }
    return svg;
  }
  function legende(items) { return h('div.mrg-leg', items.map(function (x) { return h('span', [h('i.' + x[0]), h('span', { text: x[1] })]); })); }

  /* ---------- L'aperçu : vos évaluations · saisons · ce qui bouge à l'encan ---------- */
  Vue.prototype.rendreApercu = function () {
    var self = this, d = cache.d, corps = this.elCorps;
    this.elPortee.hidden = true;
    if (!d.saisons) { corps.appendChild(h('div.alerte.info', { text: 'Le script n\'est pas à jour : les saisons et la valeur à la revente arrivent avec le prochain déploiement.' })); return; }
    corps.appendChild(this.carteEvaluations());
    corps.appendChild(this.carteSaisons());
    corps.appendChild(this.carteChaleur());
    corps.appendChild(this.carteEncan());
  };
  Vue.prototype.carteEvaluations = function () {
    var self = this, d = cache.d, carte = h('section.mrg-carte');
    carte.appendChild(h('h2', 'Vos évaluations : que vaudront-elles à la revente ?'));
    if (!d.voitEvals) { carte.appendChild(h('p.mrg-note', { text: 'Réservé à ceux qui voient les valeurs d\'évaluation.' })); return carte; }
    var cies = this.compagnie ? [this.compagnie] : null;
    var l = (d.evalsRecentes || []).filter(function (e) { return !cies || e.cie === cies[0]; }).map(function (e) {
      var dl = delaiRevente(d, e.cie, e.seg), p = projeter(d, e.seg, e.valeur, dl.j, new Date(e.jour + 'T12:00:00'));
      var en = encanPour(d, e.fam, e.an, e.km);
      return { e: e, dl: dl, p: p, ecart: p ? p.valeur - e.valeur : null, pct: p ? (p.valeur / e.valeur - 1) * 100 : null, encan: en, vsEncan: en ? (e.valeur / en.valeur - 1) * 100 : null };
    }).filter(function (x) { return x.p; });
    if (this.seulRepris) l = l.filter(function (x) { return estRepris(x.e.statut); });
    if (!l.length) { carte.appendChild(h('p.mrg-note', { text: 'Aucune évaluation dans les 45 derniers jours' + (this.compagnie ? ' chez ' + court(this.compagnie) : '') + '.' })); return carte; }
    l.sort(function (a, b) { return a.pct - b.pct; });
    var baisse = l.filter(function (x) { return x.pct <= -2; }), total = 0; l.forEach(function (x) { if (estRepris(x.e.statut)) total += x.ecart; });
    var nRep = l.filter(function (x) { return estRepris(x.e.statut); }).length;
    carte.appendChild(h('div.mrg-tuiles', [
      h('div.mrg-tuile', [h('b', { text: String(l.length) }), h('span', 'évaluations en 45 jours')]),
      h('div.mrg-tuile' + (baisse.length ? '.rouge' : '.vert'), [h('b', { text: String(baisse.length) }), h('span', 'perdront 2 % ou plus d\'ici la revente')]),
      h('div.mrg-tuile' + (total < 0 ? '.rouge' : ''), [h('b', { text: signeArgent(total) }), h('span', { text: 'sur les ' + nRep + ' véhicules repris, d\'ici la revente' })])
    ]));
    var bascule = h('label.mrg-case', [h('input', { type: 'checkbox', checked: this.seulRepris ? true : null, onchange: function (e) { self.seulRepris = e.target.checked; self.rendreCorps(); } }), h('span', 'Seulement les véhicules repris')]);
    carte.appendChild(bascule);
    var liste = h('div.mrg-evals');
    l.slice(0, this.toutesEvals ? 400 : 8).forEach(function (x) {
      var e = x.e, ton = x.pct <= -4 ? 'rouge' : (x.pct <= -2 ? 'ambre' : (x.pct >= 0 ? 'vert' : 'gris'));
      var comp = [];
      if (x.p.dep) comp.push('dépréciation ' + signePct(x.p.dep * 100, true));
      if (x.p.saison) comp.push('saison ' + signePct(x.p.saison * 100, true));
      liste.appendChild(h('button.mrg-eval.' + ton, { type: 'button', title: 'Voir ce modèle', onclick: function () { self.allerModele(e.fam + '|' + e.an); } }, [
        h('div.haut', [h('b', { text: e.vehicule || (nomFamille(e.fam) + ' ' + e.an) }), h('span.mrg-badge', { text: court(e.cie) }), e.statut ? h('span.mrg-badge' + (estRepris(e.statut) ? '.vert' : ''), { text: statutEval(e.statut) }) : null].filter(Boolean)),
        h('div.chiffres', [
          h('div', [h('small', { text: 'Évaluée le ' + AMX.fmtDateCourte(e.jour) }), h('b', { text: AMX.fmtArgent(e.valeur) })]),
          h('div.fleche', { text: '→' }),
          h('div', [h('small', { text: 'Revente vers le ' + dateLongue(x.p.le) + ' (' + x.dl.j + ' j)' }), h('b', { text: '≈ ' + AMX.fmtArgent(centaine(x.p.valeur)) })]),
          h('div.ecart', [h('b', { text: signePct(x.pct, true) }), h('small', { text: signeArgent(x.ecart) })])
        ]),
        h('div.bas', { text: [comp.join(' · '), x.encan ? 'encan aujourd\'hui ≈ ' + AMX.fmtArgent(centaine(x.encan.valeur)) + ' (évaluée ' + signePct(x.vsEncan) + ')' : ''].filter(Boolean).join(' — ') })
      ]));
    });
    carte.appendChild(liste);
    if (l.length > 8 && !this.toutesEvals) carte.appendChild(h('button.btn.fantome', { type: 'button', text: 'Voir les ' + l.length + ' évaluations', onclick: function () { self.toutesEvals = true; self.rendreCorps(); } }));
    carte.appendChild(h('p.mrg-note', { text: 'Revente prévue = jours médians en stock de ce genre chez la concession. La valeur projetée suit la dépréciation normale du genre et l\'effet de la saison (nos 2 dernières années d\'évaluations). Une indication, pas une promesse.' }));
    return carte;
  };
  Vue.prototype.carteSaisons = function () {
    var self = this, d = cache.d, s = d.saisons, carte = h('section.mrg-carte');
    var segs = Object.keys(s.seg || {}).filter(function (k) { return s.seg[k].cohortes >= 5; });
    if (this.segSaison && this.segSaison !== 'tous' && segs.indexOf(this.segSaison) < 0) this.segSaison = 'tous';
    var cle = this.segSaison || 'tous', sa = cle === 'tous' ? s.tous : s.seg[cle];
    carte.appendChild(h('h2', 'Les saisons : quand les prix montent et baissent'));
    var pills = h('div.inv2-statuts.mrg-pills', { role: 'group', 'aria-label': 'Genre de véhicule' });
    [['tous', 'Tous']].concat(segs.map(function (k) { return [k, nomSegment(d, k)]; })).forEach(function (x) {
      pills.appendChild(h('button.inv2-pastille' + (cle === x[0] ? '.actif' : ''), { type: 'button', text: x[1], 'aria-pressed': cle === x[0] ? 'true' : 'false', onclick: function () { self.segSaison = x[0]; AMX.memo.ecrire('mrg_seg_saison', x[0]); self.rendreCorps(); } }));
    });
    carte.appendChild(pills);
    var ajd = new Date(), dans60 = new Date(ajd.getTime() + 60 * 86400000), dans120 = new Date(ajd.getTime() + 120 * 86400000);
    var maint = saisonAu(sa, ajd), d60 = saisonAu(sa, dans60) - maint, d120 = saisonAu(sa, dans120) - maint, dep = sa.dep30 || 0;
    var nom = cle === 'tous' ? 'les véhicules d\'occasion' : nomSegment(d, cle).toLowerCase();
    carte.appendChild(h('p.mrg-phrase', { text: MOIS_LONGS[ajd.getMonth()] + ' : ' + nom + ' valent ' + (Math.abs(maint) < 0.3 ? 'à peu près la moyenne de l\'année' : (signePct(Math.abs(maint), true).replace('+', '') + (maint > 0 ? ' au-dessus de' : ' sous') + ' la moyenne de l\'année')) + '. D\'ici ' + MOIS_LONGS[dans60.getMonth()].toLowerCase() + ', la saison seule : ' + signePct(d60, true) + ' ; d\'ici ' + MOIS_LONGS[dans120.getMonth()].toLowerCase() + ' : ' + signePct(d120, true) + '.' }));
    carte.appendChild(h('div.mrg-tuiles', [
      h('div.mrg-tuile' + (d60 < -0.5 ? '.rouge' : (d60 > 0.5 ? '.bleu' : '')), [h('b', { text: signePct(d60, true) }), h('span', 'saison, d\'ici 60 jours')]),
      h('div.mrg-tuile', [h('b', { text: signePct(dep, true) }), h('span', 'dépréciation normale, par mois')]),
      h('div.mrg-tuile', [h('b', { text: signePct(d60 + dep * 2, true) }), h('span', 'les deux, sur 60 jours')])
    ]));
    carte.appendChild(h('div.mrg-graphe', [grapheSaisons(sa, ajd)]));
    carte.appendChild(legende([['bleu', 'Mois où les prix sont au-dessus de la moyenne'], ['rouge', 'Mois où ils sont en dessous']]));
    var src = s.sources || {};
    carte.appendChild(h('p.mrg-note', { text: 'Calculé avec ' + AMX.fmtNombre((src.torque || 0) + (src.scan || 0)) + ' de nos évaluations (Torque et ScanAutomax) et ' + AMX.fmtNombre(src.encan || 0) + ' ventes à l\'encan : l\'écart de chaque valeur à la dépréciation de son modèle-année, mois par mois (' + AMX.fmtNombre(s.cohortes || 0) + ' modèles-années).' }));
    return carte;
  };
  Vue.prototype.carteEncan = function () {
    var self = this, d = cache.d, carte = h('section.mrg-carte'), enc = d.tendancesEncan || {};
    carte.appendChild(h('h2', 'Ce qui bouge à l\'encan (6 derniers mois)'));
    var l = Object.keys(enc).map(function (k) { return { k: k, t: enc[k] }; }).filter(function (x) { return x.t.pente30 !== undefined && x.t.pente30 !== null && x.t.n >= 12; });
    if (!l.length) { carte.appendChild(h('p.mrg-note', { text: 'L\'historique des ventes à l\'encan se remplit.' })); return carte; }
    l.sort(function (a, b) { return a.t.pente30 - b.t.pente30; });
    var bas = l.slice(0, 4), haut = l.slice(-4).reverse().filter(function (x) { return x.t.pente30 > 0 && bas.indexOf(x) < 0; });
    var carteMod = function (x) {
      var p = x.k.split('|'), t = x.t, c = courbe(t.points, 150, 40);
      return h('button.mrg-mvt.' + (t.pente30 < 0 ? 'baisse' : 'hausse'), { type: 'button', onclick: function () { self.allerModele(x.k); } }, [
        h('b', { text: nomFamille(p[0]) + ' ' + p[1] }), h('small', { text: nomSegment(d, segment(d, p[0])) }),
        c, h('div.pied', [h('b', { text: signePct(t.pente30, true) + ' / mois' }), h('span', { text: AMX.fmtArgent(centaine(t.valeur)) + ' · ' + t.n + ' ventes' })])
      ]);
    };
    carte.appendChild(h('h3', 'Baissent le plus vite'));
    carte.appendChild(h('div.mrg-mvts', bas.map(carteMod)));
    if (haut.length) { carte.appendChild(h('h3', 'Tiennent le mieux')); carte.appendChild(h('div.mrg-mvts', haut.map(carteMod))); }
    carte.appendChild(h('p.mrg-note', { text: 'Modèles-années avec au moins 12 ventes à l\'encan (OpenLane) : prix payé ramené au même km. Cherchez un modèle en haut pour voir sa courbe.' }));
    return carte;
  };

  /* ---------- La fiche d'un modèle-année ---------- */
  Vue.prototype.allerModele = function (k) {
    var base = String(location.hash || '#/inventaire/marcheregion').split('?')[0], cible = base + (k ? '?modele=' + encodeURIComponent(k) : '');
    if (location.hash === cible) { this.naviguer({ params: { modele: k } }); return; }
    location.hash = cible;
    var self = this; setTimeout(function () { if ((self.mod || '') !== k) self.naviguer({ params: { modele: k } }); }, 60);
  };
  Vue.prototype.naviguer = function (ctx) {
    var p = (ctx && ctx.params) || {}, k = p.modele ? String(p.modele) : '';
    if (k !== (this.mod || '')) { this.mod = k; this.rendre(); window.scrollTo(0, 0); }
  };
  var MODELES = {};
  function lireModele(k) {
    var m = MODELES[k]; if (m && (m.d || m.p)) return m.p || Promise.resolve(m.d);
    var p = AMX.get({ marcheRegion: 1, modele: k }, { secours: false, delai: 90000 }).then(function (d) { MODELES[k] = { d: d }; return d; }, function (e) { delete MODELES[k]; throw e; });
    MODELES[k] = { p: p }; return p;
  }
  Vue.prototype.rendreFiche = function () {
    var self = this, d = cache.d, k = this.mod, p = k.split('|'), fam = p[0], an = Number(p[1]), seg = segment(d, fam), corps = this.elCorps;
    this.elPortee.hidden = true;
    corps.appendChild(h('button.btn.fantome.mrg-retour', { type: 'button', text: '‹ Retour à l\'aperçu', onclick: function () { self.allerModele(''); } }));
    corps.appendChild(h('h2.mrg-fiche-titre', [h('span', { text: nomFamille(fam) + ' ' + an }), h('small', { text: ' ' + nomSegment(d, seg) })]));
    var enc = encanPour(d, fam, an, null), ajd = new Date();
    var proj = enc ? [30, 60, 90].map(function (j) { return projeter(d, seg, enc.valeur, j, ajd); }).filter(Boolean) : [];
    var t = enc && enc.t;
    var tuiles = [h('div.mrg-tuile', [h('b', { text: enc ? AMX.fmtArgent(centaine(enc.valeur)) : '—' }), h('span', { text: enc ? 'à l\'encan aujourd\'hui (' + AMX.fmtNombre(t.kmRef || 0) + ' km)' : 'pas assez de ventes à l\'encan' })])];
    proj.forEach(function (x) { var dif = (x.valeur / enc.valeur - 1) * 100; tuiles.push(h('div.mrg-tuile' + (dif <= -2 ? '.rouge' : (dif > 0.5 ? '.bleu' : '')), [h('b', { text: '≈ ' + AMX.fmtArgent(centaine(x.valeur)) }), h('span', { text: 'dans ' + x.jours + ' jours (' + signePct(dif, true) + ')' })])); });
    if (t && t.pente30 !== undefined && t.pente30 !== null) tuiles.push(h('div.mrg-tuile' + (t.pente30 < -1.5 ? '.rouge' : ''), [h('b', { text: signePct(t.pente30, true) + ' / mois' }), h('span', { text: 'tendance récente à l\'encan (' + t.n + ' ventes)' })]));
    corps.appendChild(h('div.mrg-tuiles', tuiles));
    var sa = saisonDe(d, seg);
    if (sa && t && t.pente30 !== undefined && t.pente30 !== null && sa.dep30 !== null) {
      var ecart = t.pente30 - sa.dep30;
      if (Math.abs(ecart) >= 1) corps.appendChild(h('div.alerte.' + (ecart < 0 ? 'attention' : 'info'), { text: 'Ce modèle ' + (ecart < 0 ? 'baisse plus vite' : 'tient mieux') + ' que son genre : ' + signePct(t.pente30, true) + ' par mois à l\'encan contre ' + signePct(sa.dep30, true) + ' normalement. ' + (ecart < 0 ? 'Prudence sur le prix d\'achat.' : '') }));
    }
    var zone = h('div.mrg-graphe-zone', [AMX.chargeur ? AMX.chargeur('Courbe du modèle', { compact: true }) : h('p', 'Chargement…')]);
    corps.appendChild(h('section.mrg-carte', [h('h3', 'Le prix dans le temps'), zone]));
    lireModele(k).then(function (m) {
      AMX.vider(zone);
      if (!m || !m.ok) { zone.appendChild(h('p.mrg-note', { text: (m && m.erreur) || 'Lecture impossible.' })); return; }
      var g = grapheModele(m, d, enc, proj, seg);
      if (!g) { zone.appendChild(h('p.mrg-note', { text: 'Pas encore de prix pour ce modèle-année.' })); return; }
      zone.appendChild(h('div.mrg-graphe', [g]));
      var leg = []; if ((m.encan || []).length) leg.push(['encan', 'Ventes à l\'encan (OpenLane)']); if ((m.evals || []).length) leg.push(['eval', 'Nos évaluations']); if (enc && enc.t && enc.t.points && enc.t.points.length > 1) leg.push(['med', 'Médiane de la semaine']); if (proj.length) leg.push(['proj', 'Projection (dépréciation + saison)']);
      zone.appendChild(legende(leg));
      if (m.voitEvals && (m.evals || []).length) {
        var ev = m.evals.slice(-12).reverse();
        zone.appendChild(h('h3', 'Nos dernières évaluations de ce modèle-année'));
        var tb = h('tbody'); ev.forEach(function (x) {
          var en = enc ? encanPour(d, fam, an, x[2]) : null;
          tb.appendChild(h('tr', [h('td', { text: AMX.fmtDateCourte(x[0]) }), h('td', { text: court(x[4]) || '—' }), h('td.num', { text: x[2] ? AMX.fmtNombre(x[2]) + ' km' : '—' }), h('td.num', { text: AMX.fmtArgent(x[1]) }), h('td.num', { text: en ? signePct((x[1] / en.valeur - 1) * 100) : '—', title: en ? 'Par rapport à l\'encan d\'aujourd\'hui au même km : ' + AMX.fmtArgent(centaine(en.valeur)) : '' }), h('td', { text: statutEval(x[5]) })]));
        });
        zone.appendChild(h('div.mrg-defile', [h('table.tableau.mrg-table', [h('thead', [h('tr', [h('th', 'Date'), h('th', 'Concession'), h('th.num', 'Km'), h('th.num', 'Valeur'), h('th.num', 'vs encan'), h('th', 'Suivi')])]), tb])]));
      }
    }, function (e) { AMX.vider(zone); zone.appendChild(h('p.mrg-note', { text: 'Lecture impossible : ' + AMX.erreurTexte(e) })); });
    // Où le vendre : la même table que la tuile de l'évaluation.
    var c = h('section.mrg-carte', [h('h3', 'Où le vendre')]);
    var zb = h('div'); c.appendChild(zb); bloc(zb, { marque: /^serie\d$/.test(fam) ? 'BMW' : '', modele: nomFamille(fam), annee: an, cie: self.compagnie || '' }, {});
    corps.appendChild(c);
  };
  Vue.prototype.remplirListe = function () {
    var d = cache.d; if (!d || this.listeFaite === d) return; this.listeFaite = d;
    var l = this.listeModeles(), dl = this.elListe; AMX.vider(dl);
    this.parNom = {}; var self = this;
    l.forEach(function (x) { self.parNom[cle(x.nom)] = x.k; dl.appendChild(h('option', { value: x.nom })); });
  };
  /** « Equinox 2022 », « silverado 1500 2021 », « x3 2023 » → la fiche du modèle-année. */
  Vue.prototype.ouvrirQuestion = function (texte) {
    var d = cache.d, t = cle(texte); if (!d || !t) return;
    var k = (this.parNom || {})[t];
    if (!k) {
      var m = /^(.*?)\s*((19|20)\d\d)$/.exec(t), an = m ? m[2] : '', mod = m ? m[1] : t;
      var fam = famille(d, '', mod) || famille(d, mod.split(' ')[0], mod.split(' ').slice(1).join(' '));
      var cand = this.listeModeles().filter(function (x) { var p = x.k.split('|'); return (p[0] === fam || cle(nomFamille(p[0])).indexOf(cle(mod)) === 0) && (!an || p[1] === an); });
      cand.sort(function (a, b) { return b.n - a.n; });
      if (cand.length) k = cand[0].k;
    }
    if (!k) { AMX.toast('Modèle-année introuvable : tapez le modèle et l\'année (ex. Equinox 2022).', 'attention'); return; }
    this.elQuestion.value = ''; this.allerModele(k);
  };
  /** La liste du champ de recherche : les modèles-années qu'on connaît. */
  Vue.prototype.listeModeles = function () {
    var d = cache.d, vus = {}, l = [];
    var ajout = function (f, an, n) { if (!f || !an) return; var k = f + '|' + an; if (vus[k]) { vus[k].n += n; return; } vus[k] = { k: k, nom: nomFamille(f) + ' ' + an, n: n }; l.push(vus[k]); };
    Object.keys(d.tendancesEncan || {}).forEach(function (k) { var p = k.split('|'); ajout(p[0], p[1], d.tendancesEncan[k].n || 0); });
    (d.evalsRecentes || []).forEach(function (e) { ajout(e.fam, e.an, 1); });
    Object.keys((d.marche || {}).G || {}).forEach(function (k) { var p = k.split('|'); ajout(p[0], p[1], 0); });
    l.sort(function (a, b) { return a.nom < b.nom ? -1 : 1; });
    return l;
  };
  /** Carte de chaleur : chaque genre × chaque concession ; vert = mieux que les autres, rouge = moins bien, étoile = la meilleure. */
  var IND_CHALEUR = ['joursMed', 'pctMarche', 'ventes', 'tauxDetail'];
  Vue.prototype.carteChaleur = function () {
    var self = this, d = cache.d, cies = this.cies(), carte = h('section.mrg-carte');
    carte.appendChild(h('h2', 'Où chaque genre se vend le mieux (12 mois)'));
    var inds = INDICATEURS.filter(function (x) { return IND_CHALEUR.indexOf(x.id) >= 0; });
    if (IND_CHALEUR.indexOf(this.indChaleur) < 0) this.indChaleur = 'joursMed';
    var ind = inds.filter(function (x) { return x.id === self.indChaleur; })[0];
    var pills = h('div.inv2-statuts.mrg-pills', { role: 'group', 'aria-label': 'Indicateur' });
    inds.forEach(function (x) { pills.appendChild(h('button.inv2-pastille' + (x.id === ind.id ? '.actif' : ''), { type: 'button', text: x.t, title: x.aide || '', 'aria-pressed': x.id === ind.id ? 'true' : 'false', onclick: function () { self.indChaleur = x.id; AMX.memo.ecrire('mrg_ind_chaleur', x.id); self.rendreCorps(); } })); });
    carte.appendChild(pills);
    var thead = h('thead', [h('tr', [h('th', 'Genre')].concat(cies.map(function (c) { return h('th.num' + (c === self.compagnie ? '.ici' : ''), [h('span.puce-cie.' + (AMX.COULEUR_COMPAGNIE[c] || 'gris')), h('span', { text: ' ' + court(c) })]); })))]);
    var tbody = h('tbody'), n = 0;
    (d.segments || []).forEach(function (s) {
      var cel = cies.map(function (c) { var x = ((d.parCie[c] || {}).segments || {})[s.cle] || null; return { c: c, x: x, v: x ? x[ind.id] : null, base: x ? (ind.n ? x[ind.n] : x.ventes) || 0 : 0 }; });
      if (!cel.some(function (o) { return o.x && (o.x.ventes + o.x.gros) >= 3; })) return;
      n++;
      var fiables = cel.filter(function (o) { return o.v !== null && o.v !== undefined && o.base >= 3; }), med = fiables.length ? fiables.map(function (o) { return o.v; }).sort(function (a, b) { return a - b; })[Math.floor(fiables.length / 2)] : null;
      var meilleur = null; fiables.forEach(function (o) { if (!meilleur || (ind.sens > 0 ? o.v > meilleur.v : o.v < meilleur.v)) meilleur = o; });
      if (fiables.length < 2) meilleur = null;
      tbody.appendChild(h('tr.mrg-ligne', { tabindex: '0', title: 'Voir le détail', onclick: function () { self.detail({ nom: s.nom, cle: s.cle, type: 'genre' }); }, onkeydown: function (e) { if (e.key === 'Enter') self.detail({ nom: s.nom, cle: s.cle, type: 'genre' }); } },
        [h('td', [h('b', { text: s.nom })])].concat(cel.map(function (o) {
          var cls = '';
          if (o.v === null || o.v === undefined) cls = '.vide-c';
          else if (o.base < 3) cls = '.peu';
          else if (meilleur && o === meilleur) cls = '.meilleur';
          else if (med && fiables.length >= 2) { var r = o.v / med; if ((ind.sens > 0 && r >= 1.1) || (ind.sens < 0 && r <= 0.9)) cls = '.mieux'; else if ((ind.sens > 0 && r <= 0.9) || (ind.sens < 0 && r >= 1.1)) cls = '.pire'; }
          return h('td.num.mrg-c-ch' + cls + (o.c === self.compagnie ? '.ici' : ''), { title: court(o.c) + ' — ' + s.nom + (o.x ? ' : ' + o.x.ventes + ' au détail, ' + o.x.gros + ' au gros' : '') }, [
            h('span', { text: (meilleur && o === meilleur ? '★ ' : '') + ((o.v === null || o.v === undefined) ? '—' : ind.f(o.v)) }),
            o.x ? h('small', { text: (o.base || 0) + ' vente' + (o.base > 1 ? 's' : '') }) : null].filter(Boolean));
        }))));
    });
    if (!n) { carte.appendChild(h('p.mrg-note', { text: 'Pas encore assez de ventes pour comparer.' })); return carte; }
    carte.appendChild(h('div.mrg-defile', [h('table.tableau.mrg-table.mrg-chaleur', [thead, tbody])]));
    carte.appendChild(legende([['vert', '★ la meilleure, ou nettement mieux que les autres'], ['rouge', 'nettement moins bien'], ['gris', 'moins de 3 ventes : à prendre avec prudence']]));
    return carte;
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
      '.mrg-corps{padding:0}.mrg-corps>.mrg-note,.mrg-corps>.alerte,.mrg-corps>.vide{margin:12px}',
      '.mrg-question-zone{display:flex;align-items:center;gap:10px;background:var(--fond-carte,#fff);border:2px solid var(--vert,#008840);border-radius:12px;padding:10px 14px;margin:0 0 12px}',
      '.mrg-question-zone svg{width:22px;height:22px;color:var(--vert,#008840);flex:none}',
      '.mrg-question{flex:1;min-width:0;border:0!important;box-shadow:none!important;font-size:18px!important;padding:6px 0!important;background:transparent}',
      '.mrg-carte{padding:16px;border-bottom:1px solid var(--trait,#e5e7eb)}.mrg-carte:last-child{border-bottom:0}',
      '.mrg-carte h2{font-size:18px;margin:0 0 10px}.mrg-carte h3{font-size:15px;margin:14px 0 8px}',
      '.mrg-tuiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:8px 0 12px}',
      '.mrg-tuile{border:1px solid var(--trait,#e5e7eb);border-radius:10px;padding:10px 12px;background:var(--fond,#f6f7f9)}',
      '.mrg-tuile b{display:block;font-size:22px;font-variant-numeric:tabular-nums}.mrg-tuile span{font-size:13px;color:var(--encre-3,#4B5563)}',
      '.mrg-tuile.rouge{background:#fdecec;border-color:#f3c2c2}.mrg-tuile.rouge b{color:#b42318}',
      '.mrg-tuile.vert{background:var(--vert-clair,#eaf6ef);border-color:#bfe3cc}.mrg-tuile.vert b{color:var(--vert-fonce,#00632f)}',
      '.mrg-tuile.bleu{background:#e8f0fb;border-color:#c6d8f3}.mrg-tuile.bleu b{color:var(--bleu,#1A64BF)}',
      '.mrg-phrase{font-size:16px;margin:6px 0 4px;line-height:1.45}',
      '.mrg-pills{margin:4px 0 8px;overflow-x:auto}',
      '.mrg-case{display:inline-flex;align-items:center;gap:6px;font-size:14px;margin:0 0 8px}',
      '.mrg-evals{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:10px}',
      '.mrg-eval{text-align:left;border:1px solid var(--trait,#e5e7eb);border-left:5px solid var(--encre-4,#5F6978);border-radius:10px;padding:10px 12px;background:var(--fond-carte,#fff);cursor:pointer;font:inherit;color:inherit}',
      '.mrg-eval:hover{background:var(--fond,#f6f7f9)}.mrg-eval:focus-visible{outline:2px solid var(--vert,#008840)}',
      '.mrg-eval.rouge{border-left-color:#d03b3b}.mrg-eval.ambre{border-left-color:#e3a008}.mrg-eval.vert{border-left-color:var(--vert,#008840)}',
      '.mrg-eval .haut{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.mrg-eval .haut b{font-size:15px;margin-right:4px}',
      '.mrg-eval .chiffres{display:flex;align-items:flex-end;gap:10px;margin:8px 0 4px;flex-wrap:wrap}',
      '.mrg-eval .chiffres small{display:block;font-size:12px;color:var(--encre-3,#4B5563)}.mrg-eval .chiffres b{font-size:18px;font-variant-numeric:tabular-nums}',
      '.mrg-eval .fleche{font-size:20px;color:var(--encre-4,#5F6978);padding-bottom:2px}',
      '.mrg-eval .ecart{margin-left:auto;text-align:right}.mrg-eval.rouge .ecart b{color:#b42318}.mrg-eval.ambre .ecart b{color:#8a5a00}.mrg-eval.vert .ecart b{color:var(--vert-fonce,#00632f)}',
      '.mrg-eval .bas{font-size:12px;color:var(--encre-3,#4B5563)}',
      '.mrg-graphe{width:100%;overflow:hidden}.mrg-graphe svg{width:100%;max-width:820px;height:auto;display:block}.mrg-graphe svg.mrg-gm{max-width:1100px}',
      '.mrg-gs .grille,.mrg-gm .grille{stroke:var(--trait,#e5e7eb);stroke-width:1}.mrg-gs .axe0{stroke:var(--encre-3,#4B5563);stroke-width:1.5}',
      '.mrg-gs .eti,.mrg-gm .eti{font-size:12px;fill:var(--encre-3,#4B5563)}.mrg-gs .eti.fort,.mrg-gm .eti.fort{font-weight:700;fill:var(--encre-1,#141A1F)}',
      '.mrg-gs .barre-s.pos{fill:#2a78d6}.mrg-gs .barre-s.neg{fill:#e34948}.mrg-gs .barre-s.ici{stroke:var(--encre-1,#141A1F);stroke-width:2}',
      '.mrg-gm .pt-encan{fill:#8a8f98;fill-opacity:.45}.mrg-gm .pt-eval{fill:#2a78d6;stroke:#fff;stroke-width:1.5}',
      '.mrg-gm .ligne-med{fill:none;stroke:var(--encre-1,#141A1F);stroke-width:2;stroke-linejoin:round}',
      '.mrg-gm .ligne-proj{fill:none;stroke:#eb6834;stroke-width:2;stroke-dasharray:6 5}.mrg-gm .pt-proj{fill:#eb6834;stroke:#fff;stroke-width:1.5}.mrg-gm .pt-ajd{fill:var(--encre-1,#141A1F);stroke:#fff;stroke-width:2}',
      '.mrg-gm .ajd{stroke:var(--encre-3,#4B5563);stroke-width:1;stroke-dasharray:3 3}',
      '.mrg-leg{display:flex;gap:16px;flex-wrap:wrap;font-size:13px;color:var(--encre-2,#333);margin:6px 0 0}.mrg-leg>span{display:inline-flex;align-items:center;gap:6px}',
      '.mrg-leg i{display:inline-block;width:12px;height:12px;border-radius:3px}.mrg-leg i.bleu,.mrg-leg i.eval{background:#2a78d6;border-radius:50%}.mrg-leg i.rouge{background:#e34948}.mrg-leg i.encan{background:#8a8f98;opacity:.6;border-radius:50%}',
      '.mrg-leg i.med{height:3px;background:var(--encre-1,#141A1F)}.mrg-leg i.proj{height:0;border-top:3px dashed #eb6834}.mrg-leg i.vert{background:var(--vert-clair,#eaf6ef);border:1px solid #9fd3b3}.mrg-leg i.gris{background:#eef0f3;border:1px solid #d5d9de}',
      '.mrg-mvts{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}',
      '.mrg-mvt{text-align:left;border:1px solid var(--trait,#e5e7eb);border-radius:10px;padding:10px;background:var(--fond-carte,#fff);cursor:pointer;font:inherit;color:inherit;display:flex;flex-direction:column;gap:4px}',
      '.mrg-mvt small{color:var(--encre-3,#4B5563);font-size:12px}.mrg-mvt .mrg-courbe{width:100%;height:auto}',
      '.mrg-mvt.baisse .mrg-courbe{color:#d03b3b}.mrg-mvt.hausse .mrg-courbe{color:#2a78d6}',
      '.mrg-mvt .pied{display:flex;justify-content:space-between;gap:6px;font-size:13px;flex-wrap:wrap}.mrg-mvt.baisse .pied b{color:#b42318}.mrg-mvt.hausse .pied b{color:var(--bleu,#1A64BF)}',
      '.mrg-chaleur td.mrg-c-ch{min-width:96px}.mrg-chaleur td.mieux{background:#eaf6ef}.mrg-chaleur td.pire{background:#fdecec}.mrg-chaleur td.pire span{color:#b42318}',
      '.mrg-chaleur td.meilleur{background:#d3eedd;color:var(--vert-fonce,#00632f);font-weight:700}.mrg-chaleur td.peu span{color:var(--encre-4,#5F6978)}.mrg-chaleur td.vide-c span{color:#c3c7cd}',
      '.mrg-retour{margin:12px 12px 0}.mrg-fiche-titre{margin:8px 16px 0;font-size:22px}.mrg-fiche-titre small{font-size:14px;color:var(--encre-3,#4B5563);font-weight:400}',
      '.mrg-corps>.mrg-tuiles{margin:12px 16px}.mrg-corps>.alerte{margin:0 16px 12px}',
      '.mrg-revente{font-size:14px;padding:8px 10px;border-radius:8px;flex-basis:100%}.mrg-revente.rouge{background:#fdecec}.mrg-revente.ambre{background:#fff4dc}.mrg-revente.vert{background:var(--vert-clair,#eaf6ef)}',
      '.mrg-annees>div{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:4px 0}.mrg-annees b{min-width:120px}',
      '@media (max-width:640px){.mrg-question{font-size:16px!important}.mrg-evals{grid-template-columns:1fr}.mrg-tuile b{font-size:19px}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  AMX.marcheRegion = { charger: charger, copie: copie, enCache: function () { return cache.d; }, famille: function (m, mo) { return famille(cache.d, m, mo); },
    segment: function (f) { return segment(cache.d, f); }, pourVehicule: function (v) { return pourVehicule(cache.d, v); }, pourVehiculeAvec: pourVehicule,
    bloc: function (c, v, o) { injecterCss(); return bloc(c, v, o); }, tuile: tuile, mds: mdsLire, vider: function () { cache.d = null; cache.quand = 0; cache.copieLe = 0; } };
})();
