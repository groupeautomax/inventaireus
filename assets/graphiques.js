/* =========================================================================
   AMX.graph — petits graphiques SVG maison (aucune bibliothèque), au style
   du site. Tout est dessiné dans un viewBox fixe et s'étire en largeur.

     AMX.graph.barres(series, opts)   → barres verticales (profit par période)
                                        + ligne du cumul en option
     AMX.graph.lignes(series, opts)   → courbes (cumul par acheteur)
     AMX.graph.horizontal(items, opts)→ barres horizontales (classement)

   Les séries sont des tableaux de nombres alignés sur `opts.etiquettes`.
   Les info-bulles sont des <title> natifs (lisibles au clavier et à la souris),
   et chaque barre / point peut recevoir `opts.surClic(index)`.
   ========================================================================= */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs, enfants) {
    var e = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === undefined || v === null || v === false) return;
      if (k === 'text') e.textContent = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    });
    (enfants || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }
  function titre(texte) { return el('title', { text: texte }); }

  // Échelle « jolie » : bornes arrondies et pas de graduation lisible.
  function echelle(min, max, nb) {
    if (min > 0) min = 0;
    if (max < 0) max = 0;
    if (min === max) { max = min + 1; }
    var brut = (max - min) / (nb || 4);
    var p = Math.pow(10, Math.floor(Math.log(brut) / Math.LN10));
    var pas = [1, 2, 2.5, 5, 10].map(function (m) { return m * p; }).filter(function (s) { return s >= brut; })[0] || 10 * p;
    return { min: Math.floor(min / pas) * pas, max: Math.ceil(max / pas) * pas, pas: pas };
  }
  function fmtCourt(n) {
    var a = Math.abs(n);
    if (a >= 1000000) return (n / 1000000).toLocaleString('fr-CA', { maximumFractionDigits: 1 }) + ' M$';
    if (a >= 1000) return Math.round(n / 1000).toLocaleString('fr-CA') + ' k$';
    return Math.round(n).toLocaleString('fr-CA') + ' $';
  }
  var fmtArgent = function (n) { return AMX.fmtArgent(n, 0); };

  var COULEURS = ['#008840', '#1D6FD1', '#B7791F', '#6D4FC7', '#D92D20', '#0E7C86', '#8A5A00', '#5B6472'];

  /* ---------------------------- Barres verticales ----------------------- */
  // series : { valeurs: number[], cumul?: number[], nb?: number[] } ; opts : { etiquettes, sousEtiquettes?, hauteur?, surClic?, actif?, libelleValeur?, libelleCumul? }
  function barres(serie, opts) {
    opts = opts || {};
    var L = 760, H = opts.hauteur || 240, mg = { h: 14, d: 54, b: 40, g: 56 };
    var n = serie.valeurs.length;
    var svg = el('svg', { viewBox: '0 0 ' + L + ' ' + H, class: 'graph graph-barres', role: 'img', 'aria-label': opts.aria || 'Graphique' });
    if (!n) { svg.appendChild(el('text', { x: L / 2, y: H / 2, 'text-anchor': 'middle', class: 'graph-vide', text: 'Aucune donnée' })); return svg; }
    var tousV = serie.valeurs.slice();
    var e = echelle(Math.min.apply(null, tousV.concat([0])), Math.max.apply(null, tousV.concat([0])), 4);
    var zone = { x: mg.g, y: mg.h, l: L - mg.g - mg.d, h: H - mg.h - mg.b };
    var yDe = function (v) { return zone.y + zone.h - (v - e.min) / (e.max - e.min) * zone.h; };
    // Grille + axe gauche
    for (var g = e.min; g <= e.max + 1e-9; g += e.pas) {
      var y = yDe(g);
      svg.appendChild(el('line', { x1: zone.x, x2: zone.x + zone.l, y1: y, y2: y, class: g === 0 ? 'graph-zero' : 'graph-grille' }));
      svg.appendChild(el('text', { x: zone.x - 8, y: y + 4, 'text-anchor': 'end', class: 'graph-axe', text: fmtCourt(g) }));
    }
    // Cumul (axe droit)
    var cumul = serie.cumul, ec = null, yC = null;
    if (cumul && cumul.length === n) {
      ec = echelle(Math.min.apply(null, cumul.concat([0])), Math.max.apply(null, cumul.concat([0])), 4);
      yC = function (v) { return zone.y + zone.h - (v - ec.min) / (ec.max - ec.min) * zone.h; };
      for (var k = ec.min; k <= ec.max + 1e-9; k += ec.pas) svg.appendChild(el('text', { x: zone.x + zone.l + 8, y: yC(k) + 4, class: 'graph-axe graph-axe-cumul', text: fmtCourt(k) }));
    }
    var pasX = zone.l / n, larg = Math.max(4, Math.min(44, pasX * 0.62));
    var groupe = el('g');
    serie.valeurs.forEach(function (v, i) {
      var cx = zone.x + pasX * (i + 0.5);
      var y0 = yDe(0), y1 = yDe(v);
      var hBarre = Math.max(1.5, Math.abs(y0 - y1));
      var et = opts.etiquettes[i] || '';
      var info = et + (opts.sousEtiquettes && opts.sousEtiquettes[i] ? ' (' + opts.sousEtiquettes[i] + ')' : '') + '\n' + (opts.libelleValeur || 'Profit') + ' : ' + fmtArgent(v) + (serie.nb ? ' · ' + serie.nb[i] + ' vente' + (serie.nb[i] > 1 ? 's' : '') : '') + (cumul ? '\n' + (opts.libelleCumul || 'Cumul') + ' : ' + fmtArgent(cumul[i]) : '');
      var attrs = { x: cx - larg / 2, y: Math.min(y0, y1), width: larg, height: hBarre, rx: 3, class: 'graph-barre ' + (v >= 0 ? 'pos' : 'neg') + (opts.actif === i ? ' actif' : '') + (opts.surClic ? ' cliquable' : '') };
      if (opts.surClic) { attrs.tabindex = '0'; attrs.role = 'button'; attrs.onclick = function () { opts.surClic(i); }; attrs.onkeydown = function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); opts.surClic(i); } }; }
      var r = el('rect', attrs, [titre(info)]);
      groupe.appendChild(r);
      // Étiquette d'axe X (une sur deux si serré)
      if (n <= 16 || i % Math.ceil(n / 16) === 0) {
        svg.appendChild(el('text', { x: cx, y: zone.y + zone.h + 16, 'text-anchor': 'middle', class: 'graph-axe', text: et }));
        if (opts.sousEtiquettes && opts.sousEtiquettes[i] && n <= 13) svg.appendChild(el('text', { x: cx, y: zone.y + zone.h + 29, 'text-anchor': 'middle', class: 'graph-axe graph-axe-sous', text: opts.sousEtiquettes[i] }));
      }
    });
    svg.appendChild(groupe);
    if (cumul && yC) {
      var d = '';
      cumul.forEach(function (v, i) { var cx = zone.x + pasX * (i + 0.5); d += (i ? ' L ' : 'M ') + cx.toFixed(1) + ' ' + yC(v).toFixed(1); });
      svg.appendChild(el('path', { d: d, class: 'graph-cumul' }));
      cumul.forEach(function (v, i) { var cx = zone.x + pasX * (i + 0.5); svg.appendChild(el('circle', { cx: cx, cy: yC(v), r: 3.2, class: 'graph-cumul-point' }, [titre((opts.libelleCumul || 'Cumul') + ' au ' + (opts.etiquettes[i] || '') + ' : ' + fmtArgent(v))])); });
    }
    return svg;
  }

  /* -------------------------------- Lignes ------------------------------ */
  // series : [{ nom, valeurs: number[], couleur? }] ; opts : { etiquettes, hauteur?, aria? }
  function lignes(series, opts) {
    opts = opts || {};
    var L = 760, H = opts.hauteur || 240, mg = { h: 14, d: 16, b: 30, g: 56 };
    var n = opts.etiquettes.length;
    var svg = el('svg', { viewBox: '0 0 ' + L + ' ' + H, class: 'graph graph-lignes', role: 'img', 'aria-label': opts.aria || 'Graphique' });
    if (!n || !series.length) { svg.appendChild(el('text', { x: L / 2, y: H / 2, 'text-anchor': 'middle', class: 'graph-vide', text: 'Aucune donnée' })); return svg; }
    var tous = [0]; series.forEach(function (s) { s.valeurs.forEach(function (v) { tous.push(v); }); });
    var e = echelle(Math.min.apply(null, tous), Math.max.apply(null, tous), 4);
    var zone = { x: mg.g, y: mg.h, l: L - mg.g - mg.d, h: H - mg.h - mg.b };
    var yDe = function (v) { return zone.y + zone.h - (v - e.min) / (e.max - e.min) * zone.h; };
    var xDe = function (i) { return n === 1 ? zone.x + zone.l / 2 : zone.x + zone.l * i / (n - 1); };
    for (var g = e.min; g <= e.max + 1e-9; g += e.pas) {
      var y = yDe(g);
      svg.appendChild(el('line', { x1: zone.x, x2: zone.x + zone.l, y1: y, y2: y, class: g === 0 ? 'graph-zero' : 'graph-grille' }));
      svg.appendChild(el('text', { x: zone.x - 8, y: y + 4, 'text-anchor': 'end', class: 'graph-axe', text: fmtCourt(g) }));
    }
    opts.etiquettes.forEach(function (et, i) {
      if (n <= 16 || i % Math.ceil(n / 16) === 0) svg.appendChild(el('text', { x: xDe(i), y: zone.y + zone.h + 16, 'text-anchor': i === 0 && n > 1 ? 'start' : (i === n - 1 && n > 1 ? 'end' : 'middle'), class: 'graph-axe', text: et }));
    });
    series.forEach(function (s, si) {
      var couleur = s.couleur || COULEURS[si % COULEURS.length];
      var d = '';
      s.valeurs.forEach(function (v, i) { d += (i ? ' L ' : 'M ') + xDe(i).toFixed(1) + ' ' + yDe(v).toFixed(1); });
      svg.appendChild(el('path', { d: d, class: 'graph-ligne', stroke: couleur }, [titre(s.nom)]));
      s.valeurs.forEach(function (v, i) {
        svg.appendChild(el('circle', { cx: xDe(i), cy: yDe(v), r: n > 20 ? 2 : 3.2, fill: couleur, class: 'graph-point' }, [titre(s.nom + ' — ' + opts.etiquettes[i] + ' : ' + fmtArgent(v))]));
      });
    });
    return svg;
  }

  /* --------------------------- Barres horizontales ----------------------- */
  // items : [{ nom, valeur, sous?, couleur? }] ; opts : { surClic?, actif?, libelle?, format? }
  function horizontal(items, opts) {
    opts = opts || {};
    var L = 760, ligneH = 30, mg = { h: 6, d: 90, b: 6, g: 170 };
    var n = items.length, H = mg.h + mg.b + Math.max(1, n) * ligneH;
    var svg = el('svg', { viewBox: '0 0 ' + L + ' ' + H, class: 'graph graph-horizontal', role: 'img', 'aria-label': opts.aria || 'Classement', style: 'height:' + H + 'px' });
    if (!n) { svg.appendChild(el('text', { x: L / 2, y: H / 2 + 4, 'text-anchor': 'middle', class: 'graph-vide', text: 'Aucune donnée' })); return svg; }
    var vals = items.map(function (x) { return x.valeur; });
    var min = Math.min.apply(null, vals.concat([0])), max = Math.max.apply(null, vals.concat([0]));
    if (min === max) max = min + 1;
    var zone = { x: mg.g, l: L - mg.g - mg.d };
    var xDe = function (v) { return zone.x + (v - min) / (max - min) * zone.l; };
    var x0 = xDe(0);
    svg.appendChild(el('line', { x1: x0, x2: x0, y1: mg.h, y2: H - mg.b, class: 'graph-zero' }));
    var fmt = opts.format || fmtArgent;
    items.forEach(function (it, i) {
      var y = mg.h + i * ligneH;
      var x1 = xDe(it.valeur);
      var attrs = { x: Math.min(x0, x1), y: y + 6, width: Math.max(1.5, Math.abs(x1 - x0)), height: ligneH - 12, rx: 3, class: 'graph-barre ' + (it.valeur >= 0 ? 'pos' : 'neg') + (opts.actif === i ? ' actif' : '') + (opts.surClic ? ' cliquable' : '') };
      if (it.couleur) attrs.fill = it.couleur;
      if (opts.surClic) { attrs.tabindex = '0'; attrs.role = 'button'; attrs.onclick = function () { opts.surClic(i); }; attrs.onkeydown = function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); opts.surClic(i); } }; }
      svg.appendChild(el('rect', attrs, [titre(it.nom + '\n' + (opts.libelle || 'Profit') + ' : ' + fmt(it.valeur) + (it.sous ? '\n' + it.sous : ''))]));
      var nom = it.nom.length > 24 ? it.nom.slice(0, 23) + '…' : it.nom;
      svg.appendChild(el('text', { x: zone.x - 10, y: y + ligneH / 2 + 4, 'text-anchor': 'end', class: 'graph-nom', text: nom }, [titre(it.nom)]));
      svg.appendChild(el('text', { x: Math.max(x0, x1) + 8, y: y + ligneH / 2 + 4, class: 'graph-valeur ' + (it.valeur >= 0 ? 'pos' : 'neg'), text: fmt(it.valeur) }));
      if (it.sous) svg.appendChild(el('text', { x: Math.max(x0, x1) + 8 + String(fmt(it.valeur)).length * 7.2, y: y + ligneH / 2 + 4, class: 'graph-sous', text: it.sous }));
    });
    return svg;
  }

  function legende(series) {
    var l = document.createElement('div'); l.className = 'graph-legende';
    series.forEach(function (s, i) {
      var it = document.createElement('span'); it.className = 'graph-legende-item';
      var p = document.createElement('i'); p.style.background = s.couleur || COULEURS[i % COULEURS.length];
      it.appendChild(p); it.appendChild(document.createTextNode(s.nom));
      l.appendChild(it);
    });
    return l;
  }

  function injecterCss() {
    if (document.getElementById('css-graph')) return;
    var s = document.createElement('style');
    s.id = 'css-graph';
    s.textContent = [
      '.graph { width: 100%; height: auto; display: block; font-family: inherit; }',
      '.graph-grille { stroke: var(--ligne); stroke-width: 1; }',
      '.graph-zero { stroke: var(--encre-4); stroke-width: 1.2; }',
      '.graph-axe { font-size: 11px; fill: var(--encre-3); font-variant-numeric: tabular-nums; }',
      '.graph-axe-sous { font-size: 10px; fill: var(--encre-4); }',
      '.graph-axe-cumul { fill: var(--bleu); }',
      '.graph-vide { font-size: 13px; fill: var(--encre-3); }',
      '.graph-barre.pos { fill: var(--vert); } .graph-barre.neg { fill: var(--rouge); }',
      '.graph-barre.cliquable { cursor: pointer; } .graph-barre.cliquable:hover, .graph-barre.cliquable:focus-visible { opacity: .8; outline: none; }',
      '.graph-barre.actif { stroke: var(--noir); stroke-width: 2; }',
      '.graph-cumul { fill: none; stroke: var(--bleu); stroke-width: 2.2; stroke-linejoin: round; stroke-linecap: round; }',
      '.graph-cumul-point { fill: #fff; stroke: var(--bleu); stroke-width: 2; }',
      '.graph-ligne { fill: none; stroke-width: 2.2; stroke-linejoin: round; stroke-linecap: round; }',
      '.graph-point { stroke: #fff; stroke-width: 1.2; }',
      '.graph-nom { font-size: 12px; fill: var(--encre); }',
      '.graph-valeur { font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; } .graph-valeur.pos { fill: var(--vert); } .graph-valeur.neg { fill: var(--rouge); }',
      '.graph-sous { font-size: 11px; fill: var(--encre-3); }',
      '.graph-legende { display: flex; gap: 12px; flex-wrap: wrap; font-size: 12px; color: var(--encre-2); margin-top: 8px; }',
      '.graph-legende-item { display: inline-flex; align-items: center; gap: 6px; }',
      '.graph-legende-item i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }'
    ].join('\n');
    document.head.appendChild(s);
  }

  AMX.graph = { barres: barres, lignes: lignes, horizontal: horizontal, legende: legende, couleurs: COULEURS, css: injecterCss, fmtCourt: fmtCourt };
})();
